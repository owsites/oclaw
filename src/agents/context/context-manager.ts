/**
 * Context Manager (Main Orchestrator)
 *
 * Runs the full context transform pipeline and self-correction layer.
 * This is the single entry point that integrates all phases.
 *
 * Pipeline order:
 * 1. Stale Tool Cleaner (highest ROI, runs first)
 * 2. Tool Group Selector (filters tool schemas)
 * 3. Weighted History Window (tiers the conversation)
 * 4. Working Memory Injection (adds compact memory block)
 * 5. Tiered Prompt Builder (filters system prompt sections)
 * 6. Budget Enforcer (last resort trimming)
 *
 * Self-correction runs after the pipeline on each turn.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type {
  ContextConfig,
  PressureLevel,
  TelemetrySnapshot,
  WorkingMemoryBlock,
} from "./types.js";
import { DEFAULT_CONTEXT_CONFIG } from "./types.js";
import { enforceBudget, calculatePressure, adjustWindowForPressure } from "./budget-enforcer.js";
import { scanForContextLoss } from "./context-loss-detector.js";
import { detectLoop } from "./loop-detector.js";
import { applyPromptTier, buildPromptReference } from "./prompt-tiers.js";
import { suggestRetrievals, buildRetrievalContext } from "./proactive-retrieval.js";
import { runSelfCorrection, applyCorrectionActions } from "./self-correction.js";
import { cleanStaleToolResults } from "./stale-tool-cleaner.js";
import { ContextTelemetry, estimateMessagesTokens, estimateTokenCount } from "./telemetry.js";
import { selectToolGroups, ToolGroupMomentum } from "./tool-groups.js";
import { buildWeightedHistory } from "./weighted-history.js";
import {
  createEmptyWorkingMemory,
  serializeWorkingMemory,
  estimateWorkingMemoryTokens,
} from "./working-memory.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContextManagerState = {
  config: ContextConfig;
  workingMemory: WorkingMemoryBlock;
  toolGroupMomentum: ToolGroupMomentum;
  telemetry: ContextTelemetry;
  turnCount: number;
  lastCompactionTurn: number;
};

export type PipelineInput = {
  messages: AgentMessage[];
  systemPrompt: string;
  allToolNames: string[];
  /** Tokens used by tool schemas (estimated externally). */
  toolSchemaTokens?: number;
};

export type PipelineOutput = {
  messages: AgentMessage[];
  systemPrompt: string;
  selectedTools: string[];
  workingMemoryBlock: string;
  referenceContent: string;
  retrievalContext: string;
  correctionInjections: string[];
  totalTokensSaved: number;
  pressure: PressureLevel;
  needsCompaction: boolean;
  snapshot: TelemetrySnapshot;
};

// ---------------------------------------------------------------------------
// Context Manager
// ---------------------------------------------------------------------------

export class ContextManager {
  private state: ContextManagerState;

  constructor(config?: Partial<ContextConfig>) {
    this.state = {
      config: { ...DEFAULT_CONTEXT_CONFIG, ...config },
      workingMemory: createEmptyWorkingMemory(),
      toolGroupMomentum: new ToolGroupMomentum(),
      telemetry: new ContextTelemetry(),
      turnCount: 0,
      lastCompactionTurn: 0,
    };
  }

  getConfig(): ContextConfig {
    return this.state.config;
  }

  getWorkingMemory(): WorkingMemoryBlock {
    return this.state.workingMemory;
  }

  getTelemetry(): ContextTelemetry {
    return this.state.telemetry;
  }

  getTurnCount(): number {
    return this.state.turnCount;
  }

  /**
   * Run the full pipeline on the current conversation state.
   */
  process(input: PipelineInput): PipelineOutput {
    const { config, workingMemory, toolGroupMomentum, telemetry } = this.state;
    this.state.turnCount++;
    workingMemory.turnCount = this.state.turnCount;

    if (!config.enabled) {
      return this.createBypassOutput(input);
    }

    const transformsApplied: string[] = [];
    let totalTokensSaved = 0;

    // --- Transform 1: Stale Tool Cleaner ---
    const staleResult = cleanStaleToolResults(input.messages, config);
    let messages = staleResult.messages;
    totalTokensSaved += staleResult.tokensSaved;
    if (staleResult.tokensSaved > 0) transformsApplied.push("stale_tool_cleaner");

    // --- Transform 2: Tool Group Selector ---
    const toolResult = selectToolGroups({
      messages,
      allToolNames: input.allToolNames,
      currentTurn: this.state.turnCount,
      config,
      momentum: toolGroupMomentum,
    });
    if (toolResult.filteredCount > 0) transformsApplied.push("tool_group_selector");

    // --- Check pressure and adjust windows ---
    const currentTokens = estimateMessagesTokens(messages) + estimateTokenCount(input.systemPrompt);
    const pressureState = calculatePressure(currentTokens, config);
    const adjustedWindow = adjustWindowForPressure(pressureState.pressure, config);

    // --- Transform 3: Weighted History Window (with pressure-adjusted windows) ---
    const historyConfig = {
      ...config,
      history: {
        ...config.history,
        recentWindow: adjustedWindow.recentWindow,
        middleWindow: adjustedWindow.middleWindow,
        middleTruncateChars: adjustedWindow.middleTruncateChars,
      },
    };
    const historyResult = buildWeightedHistory(messages, historyConfig);
    messages = historyResult.messages;
    totalTokensSaved += historyResult.tokensSaved;
    if (historyResult.tokensSaved > 0) transformsApplied.push("weighted_history");

    // --- Transform 4: Working Memory Injection ---
    const wmBlock = serializeWorkingMemory(workingMemory);
    const wmTokens = estimateWorkingMemoryTokens(workingMemory);

    // --- Transform 5: Tiered Prompt Builder ---
    const tierResult = applyPromptTier(input.systemPrompt, config.promptTier);
    totalTokensSaved += tierResult.tokensSaved;
    if (tierResult.tokensSaved > 0) transformsApplied.push("prompt_tiers");

    // --- Transform 6: Budget Enforcer ---
    const budgetResult = enforceBudget(
      messages,
      config,
      estimateTokenCount(tierResult.prompt) + wmTokens,
    );
    messages = budgetResult.messages;
    totalTokensSaved += budgetResult.tokensSaved;
    if (budgetResult.tokensSaved > 0) transformsApplied.push("budget_enforcer");

    // --- Self-Correction ---
    const correctionsApplied: string[] = [];
    const correctionResult = runSelfCorrection({
      messages,
      config,
      workingMemory,
      availableTools: new Set(toolResult.selectedTools),
      latestTurnMessages: this.getLatestTurnMessages(messages),
    });
    for (const c of correctionResult.corrections) {
      correctionsApplied.push(c.source);
    }
    const correctionInjections = applyCorrectionActions(correctionResult.corrections);

    // --- Proactive Retrieval ---
    const lastUserMsg = this.getLatestUserMessage(messages);
    const droppedTurns = (historyResult.metadata as { turnsDropped?: number })?.turnsDropped ?? 0;
    const retrievalSuggestions = lastUserMsg
      ? suggestRetrievals({
          latestUserMessage: lastUserMsg,
          workingMemory,
          currentTurnCount: this.state.turnCount,
          droppedTurns,
        })
      : [];
    const retrievalContext = buildRetrievalContext(retrievalSuggestions);

    // --- Reference file ---
    const referenceContent = buildPromptReference(tierResult.referenceContent);

    // --- Telemetry ---
    const finalMessageTokens = estimateMessagesTokens(messages);
    const finalPromptTokens = estimateTokenCount(tierResult.prompt);
    const snapshot = telemetry.createSnapshot({
      turnNumber: this.state.turnCount,
      systemPromptTokens: finalPromptTokens,
      historyTokens: finalMessageTokens,
      toolSchemaTokens: input.toolSchemaTokens ?? 0,
      workingMemoryTokens: wmTokens,
      totalTokens: finalPromptTokens + finalMessageTokens + wmTokens,
      pressure: budgetResult.pressure,
      transformsApplied,
      correctionsApplied,
    });

    return {
      messages,
      systemPrompt: tierResult.prompt,
      selectedTools: toolResult.selectedTools,
      workingMemoryBlock: wmBlock,
      referenceContent,
      retrievalContext,
      correctionInjections,
      totalTokensSaved,
      pressure: budgetResult.pressure,
      needsCompaction: budgetResult.needsCompaction,
      snapshot,
    };
  }

  /**
   * Record that a compaction happened.
   */
  markCompaction(): void {
    this.state.lastCompactionTurn = this.state.turnCount;
    this.state.workingMemory.lastCompactionTurn = this.state.turnCount;
  }

  /**
   * Update working memory fields directly.
   */
  updateWorkingMemory(updates: Partial<WorkingMemoryBlock>): void {
    Object.assign(this.state.workingMemory, updates);
  }

  /**
   * Reset the context manager state (e.g., after a session reset).
   */
  reset(): void {
    this.state.workingMemory = createEmptyWorkingMemory();
    this.state.toolGroupMomentum = new ToolGroupMomentum();
    this.state.turnCount = 0;
    this.state.lastCompactionTurn = 0;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private createBypassOutput(input: PipelineInput): PipelineOutput {
    const tokens = estimateMessagesTokens(input.messages) + estimateTokenCount(input.systemPrompt);
    const snapshot = this.state.telemetry.createSnapshot({
      turnNumber: this.state.turnCount,
      systemPromptTokens: estimateTokenCount(input.systemPrompt),
      historyTokens: estimateMessagesTokens(input.messages),
      toolSchemaTokens: input.toolSchemaTokens ?? 0,
      workingMemoryTokens: 0,
      totalTokens: tokens,
      pressure: "green",
      transformsApplied: [],
      correctionsApplied: [],
    });
    return {
      messages: input.messages,
      systemPrompt: input.systemPrompt,
      selectedTools: input.allToolNames,
      workingMemoryBlock: "",
      referenceContent: "",
      retrievalContext: "",
      correctionInjections: [],
      totalTokensSaved: 0,
      pressure: "green",
      needsCompaction: false,
      snapshot,
    };
  }

  private getLatestTurnMessages(messages: AgentMessage[]): AgentMessage[] {
    // Get all messages from the last user turn
    const result: AgentMessage[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      result.unshift(messages[i]);
      if (messages[i].role === "user" && result.length > 1) break;
    }
    return result;
  }

  private getLatestUserMessage(messages: AgentMessage[]): string | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== "user") continue;
      const content = (messages[i] as { content?: unknown }).content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block === "object") {
            const text = (block as { text?: unknown }).text;
            if (typeof text === "string") return text;
          }
        }
      }
    }
    return undefined;
  }
}

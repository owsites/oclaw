/**
 * Self-Correction Orchestrator
 *
 * Coordinates all correctors:
 * 1. Tool Call Validator
 * 2. Context Loss Detector
 * 3. Loop Detector
 * 4. Working Memory Updater (turn-extractor)
 * 5. Memory Pressure Monitor (budget-enforcer)
 *
 * Based on research finding: LLMs can't self-correct without external signals
 * (Huang et al., ICLR 2024). All correction here uses external signals
 * (tool errors, pattern matching, repetition counting).
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ContextConfig, CorrectionAction, WorkingMemoryBlock } from "./types.js";
import { scanForContextLoss } from "./context-loss-detector.js";
import { detectLoop } from "./loop-detector.js";
import { validateToolCallResult } from "./tool-call-validator.js";
import { extractAndUpdateMemory } from "./turn-extractor.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SelfCorrectionResult = {
  corrections: Array<{
    source: string;
    action: CorrectionAction;
  }>;
  memoryUpdated: boolean;
};

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Run all self-correction checks on the current conversation state.
 *
 * Call this after each turn. It will:
 * 1. Validate the most recent tool results
 * 2. Check for context loss signals
 * 3. Detect tool call loops
 * 4. Update working memory
 *
 * Returns a list of corrections to apply.
 */
export function runSelfCorrection(params: {
  messages: AgentMessage[];
  config: ContextConfig;
  workingMemory: WorkingMemoryBlock;
  availableTools: Set<string>;
  /** Only the messages from the latest turn (for memory extraction). */
  latestTurnMessages?: AgentMessage[];
}): SelfCorrectionResult {
  const { messages, config, workingMemory, availableTools } = params;
  const corrections: Array<{ source: string; action: CorrectionAction }> = [];

  if (!config.selfCorrection.enabled) {
    return { corrections: [], memoryUpdated: false };
  }

  // 1. Tool Call Validator
  if (config.selfCorrection.toolCallValidator) {
    const recentToolResults = messages
      .filter((m) => m.role === "toolResult")
      .slice(-5);

    for (const result of recentToolResults) {
      const validation = validateToolCallResult(result, availableTools);
      if (!validation.isValid) {
        corrections.push({
          source: `tool_validator:${validation.errorType ?? "unknown"}`,
          action: validation.action,
        });
      }
    }
  }

  // 2. Context Loss Detector
  if (config.selfCorrection.contextLossDetector) {
    const lossSignal = scanForContextLoss(messages);
    if (lossSignal.detected) {
      corrections.push({
        source: `context_loss:${lossSignal.patterns.join(",")}`,
        action: lossSignal.action,
      });
    }
  }

  // 3. Loop Detector
  if (config.selfCorrection.loopDetector) {
    const loopResult = detectLoop(messages, config);
    if (loopResult.detected) {
      corrections.push({
        source: `loop:${loopResult.loopType ?? "unknown"}`,
        action: loopResult.action,
      });
    }
  }

  // 4. Working Memory Updater
  let memoryUpdated = false;
  if (config.workingMemory.enabled && params.latestTurnMessages) {
    extractAndUpdateMemory(params.latestTurnMessages, workingMemory, config);
    memoryUpdated = true;
  }

  return { corrections, memoryUpdated };
}

/**
 * Apply correction actions to the message stream.
 * Returns any injected messages that should be prepended to the next turn.
 */
export function applyCorrectionActions(
  corrections: Array<{ source: string; action: CorrectionAction }>,
): string[] {
  const injections: string[] = [];

  for (const { action } of corrections) {
    switch (action.type) {
      case "inject_message":
        injections.push(`[Self-Correction] ${action.message}`);
        break;
      case "suggest_alternative":
        injections.push(`[Self-Correction] ${action.suggestion}`);
        break;
      case "force_different_path":
        injections.push(`[Self-Correction] ${action.instruction}`);
        break;
      case "abandon":
        injections.push(`[Self-Correction] ${action.reason}`);
        break;
      case "expand_window":
      case "retry_with_tool":
      case "none":
        // These are handled by the context manager, not by message injection
        break;
    }
  }

  return injections;
}

/**
 * OpenWolf Context Management Pipeline
 *
 * Self-correcting context management system for the OpenWolf AI agent.
 * Implements a 6-stage transform pipeline and 5-corrector self-correction layer.
 *
 * Usage:
 *   import { ContextManager } from "./context/index.js";
 *   const ctx = new ContextManager({ promptTier: "compact" });
 *   const result = ctx.process({ messages, systemPrompt, allToolNames });
 */

// Main orchestrator
export { ContextManager } from "./context-manager.js";
export type { ContextManagerState, PipelineInput, PipelineOutput } from "./context-manager.js";

// Configuration & types
export { DEFAULT_CONTEXT_CONFIG } from "./types.js";
export type {
  ContextConfig,
  ContextTransformResult,
  CorrectionAction,
  LoopDetectionResult,
  ContextLossSignal,
  PressureLevel,
  PromptTier,
  TelemetrySnapshot,
  TokenBudgetState,
  ToolGroup,
  ToolGroupMapping,
  WorkingMemoryBlock,
} from "./types.js";

// Transforms (for direct use or testing)
export { cleanStaleToolResults } from "./stale-tool-cleaner.js";
export { selectToolGroups, ToolGroupMomentum } from "./tool-groups.js";
export { buildWeightedHistory } from "./weighted-history.js";
export { applyPromptTier, buildPromptReference } from "./prompt-tiers.js";
export { enforceBudget, calculatePressure, adjustWindowForPressure } from "./budget-enforcer.js";

// Working memory
export {
  createEmptyWorkingMemory,
  addFact,
  addDecision,
  addConstraint,
  removeFact,
  trackToolUsage,
  serializeWorkingMemory,
  estimateWorkingMemoryTokens,
} from "./working-memory.js";

// Self-correction
export { runSelfCorrection, applyCorrectionActions } from "./self-correction.js";
export { detectLoop } from "./loop-detector.js";
export { detectContextLoss, scanForContextLoss } from "./context-loss-detector.js";
export { validateToolCallResult } from "./tool-call-validator.js";
export { extractAndUpdateMemory } from "./turn-extractor.js";

// Proactive retrieval
export { suggestRetrievals, buildRetrievalContext } from "./proactive-retrieval.js";

// Telemetry
export {
  ContextTelemetry,
  estimateTokenCount,
  estimateMessageTokens,
  estimateMessagesTokens,
} from "./telemetry.js";

/**
 * Shared types for the OpenWolf context management pipeline.
 *
 * These types define the contracts between transforms, correctors,
 * and the main context manager.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type PromptTier = "compact" | "standard" | "full";

export type ContextConfig = {
  /** Master kill switch: set false to bypass the entire pipeline. */
  enabled: boolean;

  promptTier: PromptTier;

  staleToolCleaner: {
    enabled: boolean;
    /** Tool results older than this many turns are cleaned. */
    staleTurnThreshold: number;
    /** Max chars to keep as summary for stale results. */
    summaryMaxChars: number;
  };

  toolSelection: {
    enabled: boolean;
    /** Number of recent turns to scan for keyword matching. */
    keywordScanTurns: number;
    /** Extra turns of momentum after a group was last matched. */
    momentumTurns: number;
  };

  history: {
    enabled: boolean;
    /** Number of recent turns kept verbatim. */
    recentWindow: number;
    /** Number of middle-tier turns kept with truncated tool results. */
    middleWindow: number;
    /** Max chars per tool result in MIDDLE tier. */
    middleTruncateChars: number;
  };

  workingMemory: {
    enabled: boolean;
    maxFacts: number;
    maxDecisions: number;
    maxConstraints: number;
  };

  selfCorrection: {
    enabled: boolean;
    toolCallValidator: boolean;
    contextLossDetector: boolean;
    loopDetector: boolean;
    /** Max sequential identical tool calls before intervention. */
    loopThreshold: number;
  };

  budget: {
    enabled: boolean;
    /** Context window size in tokens. */
    maxContextTokens: number;
    /** Pressure thresholds (fraction of maxContextTokens). */
    pressureYellow: number;
    pressureOrange: number;
    pressureRed: number;
    pressureCritical: number;
  };
};

// ---------------------------------------------------------------------------
// Pipeline types
// ---------------------------------------------------------------------------

export type ContextTransformResult = {
  messages: AgentMessage[];
  tokensSaved: number;
  metadata?: Record<string, unknown>;
};

export type PressureLevel = "green" | "yellow" | "orange" | "red" | "critical";

export type TokenBudgetState = {
  totalTokens: number;
  maxTokens: number;
  usageRatio: number;
  pressure: PressureLevel;
};

// ---------------------------------------------------------------------------
// Working memory
// ---------------------------------------------------------------------------

export type WorkingMemoryBlock = {
  sessionSummary: string;
  currentTask: string;
  recentDecisions: string[];
  activeConstraints: string[];
  keyFacts: string[];
  toolsUsedThisSession: string[];
  turnCount: number;
  lastCompactionTurn: number;
};

// ---------------------------------------------------------------------------
// Self-correction
// ---------------------------------------------------------------------------

export type CorrectionAction =
  | { type: "none" }
  | { type: "inject_message"; message: string }
  | { type: "expand_window"; additionalTurns: number }
  | { type: "retry_with_tool"; toolName: string }
  | { type: "suggest_alternative"; suggestion: string }
  | { type: "force_different_path"; instruction: string }
  | { type: "abandon"; reason: string };

export type LoopType = "exact_tool" | "semantic" | "oscillation";

export type LoopDetectionResult = {
  detected: boolean;
  loopType?: LoopType;
  count: number;
  action: CorrectionAction;
};

export type ContextLossSignal = {
  detected: boolean;
  patterns: string[];
  action: CorrectionAction;
};

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

export type TelemetrySnapshot = {
  timestamp: number;
  turnNumber: number;
  systemPromptTokens: number;
  historyTokens: number;
  toolSchemaTokens: number;
  workingMemoryTokens: number;
  totalTokens: number;
  pressure: PressureLevel;
  transformsApplied: string[];
  correctionsApplied: string[];
};

// ---------------------------------------------------------------------------
// Tool groups
// ---------------------------------------------------------------------------

export type ToolGroup =
  | "core"
  | "file_ops"
  | "research"
  | "messaging"
  | "orchestration"
  | "browser"
  | "media"
  | "system"
  | "nodes";

export type ToolGroupMapping = {
  group: ToolGroup;
  tools: string[];
  keywords: string[];
};

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  enabled: true,
  promptTier: "compact",

  staleToolCleaner: {
    enabled: true,
    staleTurnThreshold: 5,
    summaryMaxChars: 120,
  },

  toolSelection: {
    enabled: true,
    keywordScanTurns: 3,
    momentumTurns: 2,
  },

  history: {
    enabled: true,
    recentWindow: 3,
    middleWindow: 7,
    middleTruncateChars: 200,
  },

  workingMemory: {
    enabled: true,
    maxFacts: 10,
    maxDecisions: 5,
    maxConstraints: 5,
  },

  selfCorrection: {
    enabled: true,
    toolCallValidator: true,
    contextLossDetector: true,
    loopDetector: true,
    loopThreshold: 3,
  },

  budget: {
    enabled: true,
    maxContextTokens: 200_000,
    pressureYellow: 0.60,
    pressureOrange: 0.75,
    pressureRed: 0.90,
    pressureCritical: 0.95,
  },
};

/**
 * Token Budget Enforcer (Transform 6)
 *
 * Progressive shedding with MemGPT-inspired two-stage pressure system.
 *
 * Pressure levels:
 * - Green (<60%): Normal operation
 * - Yellow (60-75%): Memory pressure warning, log to working memory
 * - Orange (75-90%): Shrink MIDDLE window, aggressive truncation
 * - Red (90-95%): Drop MIDDLE entirely, keep RECENT + working memory
 * - Critical (>95%): Emergency compaction trigger
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ContextConfig, ContextTransformResult, PressureLevel, TokenBudgetState } from "./types.js";
import { estimateMessagesTokens } from "./telemetry.js";

// ---------------------------------------------------------------------------
// Pressure calculation
// ---------------------------------------------------------------------------

export function calculatePressure(
  totalTokens: number,
  config: ContextConfig,
): TokenBudgetState {
  const maxTokens = config.budget.maxContextTokens;
  const usageRatio = totalTokens / maxTokens;

  let pressure: PressureLevel;
  if (usageRatio >= config.budget.pressureCritical) {
    pressure = "critical";
  } else if (usageRatio >= config.budget.pressureRed) {
    pressure = "red";
  } else if (usageRatio >= config.budget.pressureOrange) {
    pressure = "orange";
  } else if (usageRatio >= config.budget.pressureYellow) {
    pressure = "yellow";
  } else {
    pressure = "green";
  }

  return { totalTokens, maxTokens, usageRatio, pressure };
}

// ---------------------------------------------------------------------------
// Adaptive window adjustment
// ---------------------------------------------------------------------------

type WindowAdjustment = {
  recentWindow: number;
  middleWindow: number;
  middleTruncateChars: number;
};

/**
 * Adjust history window parameters based on memory pressure.
 */
export function adjustWindowForPressure(
  pressure: PressureLevel,
  config: ContextConfig,
): WindowAdjustment {
  const base = config.history;

  switch (pressure) {
    case "green":
      return {
        recentWindow: base.recentWindow,
        middleWindow: base.middleWindow,
        middleTruncateChars: base.middleTruncateChars,
      };

    case "yellow":
      return {
        recentWindow: base.recentWindow,
        middleWindow: base.middleWindow,
        middleTruncateChars: Math.floor(base.middleTruncateChars * 0.75),
      };

    case "orange":
      return {
        recentWindow: base.recentWindow,
        middleWindow: Math.max(2, Math.floor(base.middleWindow * 0.5)),
        middleTruncateChars: Math.floor(base.middleTruncateChars * 0.5),
      };

    case "red":
      return {
        recentWindow: base.recentWindow,
        middleWindow: 0, // Drop MIDDLE entirely
        middleTruncateChars: 0,
      };

    case "critical":
      return {
        recentWindow: Math.max(1, Math.floor(base.recentWindow * 0.5)),
        middleWindow: 0,
        middleTruncateChars: 0,
      };
  }
}

// ---------------------------------------------------------------------------
// Budget enforcement
// ---------------------------------------------------------------------------

/**
 * Enforce the token budget on a message list.
 *
 * If we're in "green" or "yellow", we do nothing beyond the normal pipeline.
 * At "orange" and above, we progressively drop messages from the oldest end
 * until we're under budget.
 */
export function enforceBudget(
  messages: AgentMessage[],
  config: ContextConfig,
  currentSystemPromptTokens: number,
): ContextTransformResult & { pressure: PressureLevel; needsCompaction: boolean } {
  if (!config.budget.enabled) {
    return {
      messages,
      tokensSaved: 0,
      pressure: "green",
      needsCompaction: false,
    };
  }

  const messageTokens = estimateMessagesTokens(messages);
  const totalTokens = messageTokens + currentSystemPromptTokens;
  const state = calculatePressure(totalTokens, config);

  if (state.pressure === "green" || state.pressure === "yellow") {
    return {
      messages,
      tokensSaved: 0,
      pressure: state.pressure,
      needsCompaction: false,
    };
  }

  if (state.pressure === "critical") {
    // Emergency: keep only the most recent messages
    const targetTokens = Math.floor(config.budget.maxContextTokens * 0.7);
    let tokens = currentSystemPromptTokens;
    const kept: AgentMessage[] = [];

    for (let i = messages.length - 1; i >= 0; i--) {
      const msgTokens = estimateMessagesTokens([messages[i]]);
      if (tokens + msgTokens > targetTokens && kept.length > 0) break;
      tokens += msgTokens;
      kept.unshift(messages[i]);
    }

    return {
      messages: kept,
      tokensSaved: messageTokens - estimateMessagesTokens(kept),
      pressure: "critical",
      needsCompaction: true,
      metadata: { originalCount: messages.length, keptCount: kept.length },
    };
  }

  // Orange/Red: progressive trimming from the oldest end
  const targetRatio = state.pressure === "red" ? 0.75 : 0.85;
  const targetTokens = Math.floor(config.budget.maxContextTokens * targetRatio);
  let currentTokens = totalTokens;
  let tokensSaved = 0;
  let startIndex = 0;

  while (currentTokens > targetTokens && startIndex < messages.length - 3) {
    const removed = estimateMessagesTokens([messages[startIndex]]);
    currentTokens -= removed;
    tokensSaved += removed;
    startIndex++;
  }

  return {
    messages: messages.slice(startIndex),
    tokensSaved,
    pressure: state.pressure,
    needsCompaction: state.pressure === "red",
    metadata: { droppedMessages: startIndex },
  };
}

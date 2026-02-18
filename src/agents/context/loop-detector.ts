/**
 * Loop Detector (Corrector 3)
 *
 * Detects three types of loops:
 * 1. Exact tool loop: Same tool called with same args N times
 * 2. Semantic loop: Same intent expressed differently
 * 3. Oscillation: Alternating between two approaches
 *
 * Voyager-inspired escalation (4 attempts max):
 * 1. Inject message about repeating action
 * 2. Suggest specific alternative
 * 3. Force different code path
 * 4. Abandon approach, ask user
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ContextConfig, CorrectionAction, LoopDetectionResult, LoopType } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ToolCall = {
  name: string;
  argsHash: string;
  turnIndex: number;
};

function hashArgs(args: unknown): string {
  try {
    return JSON.stringify(args).slice(0, 200);
  } catch {
    return String(args).slice(0, 200);
  }
}

function extractToolCalls(messages: AgentMessage[]): ToolCall[] {
  const calls: ToolCall[] = [];
  let turnIndex = 0;
  for (const msg of messages) {
    if (msg.role === "user") turnIndex++;
    if (msg.role !== "assistant") continue;

    const content = (msg as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const type = (block as { type?: unknown }).type;
      const name = (block as { name?: unknown }).name;
      const input = (block as { input?: unknown }).input;
      if (type === "tool_use" && typeof name === "string") {
        calls.push({ name, argsHash: hashArgs(input), turnIndex });
      }
    }
  }
  return calls;
}

// ---------------------------------------------------------------------------
// Loop detection
// ---------------------------------------------------------------------------

function detectExactLoop(calls: ToolCall[], threshold: number): { count: number } | null {
  if (calls.length < threshold) return null;
  const recent = calls.slice(-threshold);
  const first = recent[0];
  const allSame = recent.every((c) => c.name === first.name && c.argsHash === first.argsHash);
  if (allSame) {
    // Count how many consecutive identical calls from the end
    let count = 0;
    for (let i = calls.length - 1; i >= 0; i--) {
      if (calls[i].name === first.name && calls[i].argsHash === first.argsHash) {
        count++;
      } else {
        break;
      }
    }
    return { count };
  }
  return null;
}

function detectSemanticLoop(calls: ToolCall[], threshold: number): { count: number } | null {
  if (calls.length < threshold) return null;
  const recent = calls.slice(-threshold);
  const first = recent[0];
  // Same tool name but different args (trying same approach with tweaks)
  const allSameTool = recent.every((c) => c.name === first.name);
  if (allSameTool && !recent.every((c) => c.argsHash === first.argsHash)) {
    let count = 0;
    for (let i = calls.length - 1; i >= 0; i--) {
      if (calls[i].name === first.name) count++;
      else break;
    }
    return count >= threshold ? { count } : null;
  }
  return null;
}

function detectOscillation(calls: ToolCall[]): { count: number } | null {
  if (calls.length < 4) return null;
  const last4 = calls.slice(-4);
  // A-B-A-B pattern
  if (
    last4[0].name === last4[2].name &&
    last4[1].name === last4[3].name &&
    last4[0].name !== last4[1].name
  ) {
    return { count: 4 };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

function escalate(loopType: LoopType, count: number, toolName: string): CorrectionAction {
  if (count <= 1) {
    return {
      type: "inject_message",
      message: `Notice: You've called "${toolName}" ${count} time(s) with similar arguments. Consider a different approach.`,
    };
  }
  if (count <= 2) {
    return {
      type: "suggest_alternative",
      suggestion: `The "${toolName}" approach isn't working after ${count} attempts. Try a fundamentally different tool or strategy.`,
    };
  }
  if (count <= 3) {
    return {
      type: "force_different_path",
      instruction: `STOP using "${toolName}" for this task. You've tried it ${count} times. Use a completely different approach or ask the user for guidance.`,
    };
  }
  return {
    type: "abandon",
    reason: `Abandoned "${toolName}" approach after ${count} attempts. Requesting user input.`,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function detectLoop(
  messages: AgentMessage[],
  config: ContextConfig,
): LoopDetectionResult {
  if (!config.selfCorrection.enabled || !config.selfCorrection.loopDetector) {
    return { detected: false, count: 0, action: { type: "none" } };
  }

  const threshold = config.selfCorrection.loopThreshold;
  const calls = extractToolCalls(messages);
  if (calls.length < threshold) {
    return { detected: false, count: 0, action: { type: "none" } };
  }

  // Check in order of severity
  const exact = detectExactLoop(calls, threshold);
  if (exact) {
    const toolName = calls.at(-1)?.name ?? "unknown";
    return {
      detected: true,
      loopType: "exact_tool",
      count: exact.count,
      action: escalate("exact_tool", exact.count, toolName),
    };
  }

  const semantic = detectSemanticLoop(calls, threshold);
  if (semantic) {
    const toolName = calls.at(-1)?.name ?? "unknown";
    return {
      detected: true,
      loopType: "semantic",
      count: semantic.count,
      action: escalate("semantic", semantic.count, toolName),
    };
  }

  const oscillation = detectOscillation(calls);
  if (oscillation) {
    const toolName = `${calls.at(-2)?.name ?? "A"} / ${calls.at(-1)?.name ?? "B"}`;
    return {
      detected: true,
      loopType: "oscillation",
      count: oscillation.count,
      action: escalate("oscillation", 2, toolName),
    };
  }

  return { detected: false, count: 0, action: { type: "none" } };
}

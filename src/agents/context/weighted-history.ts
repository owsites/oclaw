/**
 * Weighted History Window (Transform 3)
 *
 * Applies a three-tier weighting to conversation history:
 * - RECENT (last N turns): Verbatim, full tool results
 * - MIDDLE (next M turns): Compressed, first K chars of tool results only
 * - OLD (beyond MIDDLE): Dropped entirely, available via memory search
 *
 * Expected savings: 3,600-10,600 tokens for 20-turn sessions.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ContextConfig, ContextTransformResult } from "./types.js";
import { estimateMessageTokens } from "./telemetry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TurnBoundary = { turnNumber: number; startIndex: number; endIndex: number };

/**
 * Group messages into turns. A turn boundary is each user message.
 */
function identifyTurns(messages: AgentMessage[]): TurnBoundary[] {
  const turns: TurnBoundary[] = [];
  let currentTurn = 0;
  let startIndex = 0;

  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "user") {
      if (i > 0 && currentTurn > 0) {
        turns.push({ turnNumber: currentTurn, startIndex, endIndex: i - 1 });
        startIndex = i;
      }
      currentTurn++;
    }
  }
  // Push the last turn
  if (currentTurn > 0) {
    turns.push({ turnNumber: currentTurn, startIndex, endIndex: messages.length - 1 });
  }

  return turns;
}

/**
 * Truncate tool result content to a maximum character count.
 */
function truncateToolResult(msg: AgentMessage, maxChars: number): AgentMessage {
  if (msg.role !== "toolResult") return msg;

  const content = (msg as { content?: unknown }).content;
  if (typeof content === "string") {
    if (content.length <= maxChars) return msg;
    return {
      ...msg,
      content: content.slice(0, maxChars) + "\n[...truncated]",
    } as AgentMessage;
  }

  if (!Array.isArray(content)) return msg;

  const newContent = content.map((block) => {
    if (!block || typeof block !== "object") return block;
    const text = (block as { text?: unknown }).text;
    if (typeof text !== "string" || text.length <= maxChars) return block;
    return { ...block, text: text.slice(0, maxChars) + "\n[...truncated]" };
  });

  return { ...msg, content: newContent } as AgentMessage;
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

export function buildWeightedHistory(
  messages: AgentMessage[],
  config: ContextConfig,
): ContextTransformResult {
  if (!config.history.enabled || messages.length === 0) {
    return { messages, tokensSaved: 0 };
  }

  const { recentWindow, middleWindow, middleTruncateChars } = config.history;
  const turns = identifyTurns(messages);
  const totalTurns = turns.length;

  // If not enough turns to trigger windowing, return as-is
  if (totalTurns <= recentWindow) {
    return { messages, tokensSaved: 0 };
  }

  const recentCutoff = totalTurns - recentWindow;
  const middleCutoff = Math.max(0, recentCutoff - middleWindow);
  let tokensSaved = 0;
  const result: AgentMessage[] = [];

  for (const turn of turns) {
    if (turn.turnNumber <= middleCutoff) {
      // OLD tier: drop entirely
      for (let i = turn.startIndex; i <= turn.endIndex; i++) {
        tokensSaved += estimateMessageTokens(messages[i]);
      }
      continue;
    }

    if (turn.turnNumber <= recentCutoff) {
      // MIDDLE tier: truncate tool results
      for (let i = turn.startIndex; i <= turn.endIndex; i++) {
        const msg = messages[i];
        if (msg.role === "toolResult") {
          const originalTokens = estimateMessageTokens(msg);
          const truncated = truncateToolResult(msg, middleTruncateChars);
          const newTokens = estimateMessageTokens(truncated);
          tokensSaved += Math.max(0, originalTokens - newTokens);
          result.push(truncated);
        } else {
          result.push(msg);
        }
      }
      continue;
    }

    // RECENT tier: keep verbatim
    for (let i = turn.startIndex; i <= turn.endIndex; i++) {
      result.push(messages[i]);
    }
  }

  return {
    messages: result,
    tokensSaved,
    metadata: {
      totalTurns,
      recentWindow,
      middleWindow,
      turnsDropped: middleCutoff,
      turnsTruncated: recentCutoff - middleCutoff,
      turnsVerbatim: recentWindow,
    },
  };
}

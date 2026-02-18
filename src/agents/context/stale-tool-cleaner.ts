/**
 * Stale Tool Result Cleaner (Transform 1)
 *
 * Inspired by Claude Code's approach that achieved 84% token reduction
 * by clearing stale tool results. Keeps tool name + 1-line summary for
 * results older than the configured turn threshold.
 *
 * Expected savings: 10,000-50,000 tokens per 30-turn session.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ContextConfig, ContextTransformResult } from "./types.js";
import { estimateMessageTokens } from "./telemetry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMessageText(msg: AgentMessage): string {
  const content = (msg as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const text = (block as { text?: unknown }).text;
    if (typeof text === "string") parts.push(text);
  }
  return parts.join("\n");
}

function getToolName(msg: AgentMessage): string | undefined {
  const candidate =
    (msg as { toolName?: unknown }).toolName ??
    (msg as { name?: unknown }).name ??
    (msg as { tool?: unknown }).tool;
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : undefined;
}

function summarizeToolResult(text: string, maxChars: number): string {
  const firstLine = text.split("\n").find((line) => line.trim().length > 0) ?? "";
  if (firstLine.length <= maxChars) return firstLine;
  return firstLine.slice(0, maxChars - 3) + "...";
}

// ---------------------------------------------------------------------------
// Turn assignment
// ---------------------------------------------------------------------------

/**
 * Assign a turn number to each message. A "turn" increments on each user message.
 */
function assignTurns(messages: AgentMessage[]): Map<AgentMessage, number> {
  const turnMap = new Map<AgentMessage, number>();
  let currentTurn = 0;
  for (const msg of messages) {
    if (msg.role === "user") currentTurn++;
    turnMap.set(msg, currentTurn);
  }
  return turnMap;
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

export function cleanStaleToolResults(
  messages: AgentMessage[],
  config: ContextConfig,
): ContextTransformResult {
  if (!config.staleToolCleaner.enabled || messages.length === 0) {
    return { messages, tokensSaved: 0 };
  }

  const { staleTurnThreshold, summaryMaxChars } = config.staleToolCleaner;
  const turnMap = assignTurns(messages);
  const latestTurn = Math.max(...Array.from(turnMap.values()), 0);
  let tokensSaved = 0;

  const cleaned = messages.map((msg) => {
    // Only clean tool results
    if (msg.role !== "toolResult") return msg;

    const msgTurn = turnMap.get(msg) ?? 0;
    const age = latestTurn - msgTurn;

    if (age < staleTurnThreshold) return msg;

    const toolName = getToolName(msg) ?? "unknown_tool";
    const originalText = getMessageText(msg);
    const originalTokens = estimateMessageTokens(msg);
    const summary = summarizeToolResult(originalText, summaryMaxChars);
    const replacement = `[${toolName}] ${summary}`;

    // Only replace if it actually saves tokens
    const newTokens = Math.ceil(replacement.length / 4);
    if (newTokens >= originalTokens) return msg;

    tokensSaved += originalTokens - newTokens;

    return {
      ...msg,
      content: replacement,
    } as AgentMessage;
  });

  return {
    messages: cleaned,
    tokensSaved,
    metadata: {
      staleTurnThreshold,
      latestTurn,
      messagesProcessed: messages.length,
    },
  };
}

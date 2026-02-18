import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT_CONFIG } from "./types.js";
import { buildWeightedHistory } from "./weighted-history.js";

function makeUserMsg(content: string): AgentMessage {
  return { role: "user", content } as AgentMessage;
}

function makeAssistantMsg(content: string): AgentMessage {
  return { role: "assistant", content } as AgentMessage;
}

function makeToolResult(content: string): AgentMessage {
  return { role: "toolResult", content, toolName: "exec" } as AgentMessage;
}

function buildConversation(turns: number, toolResultSize = 500): AgentMessage[] {
  const messages: AgentMessage[] = [];
  for (let i = 0; i < turns; i++) {
    messages.push(makeUserMsg(`User message for turn ${i + 1}`));
    messages.push(makeAssistantMsg(`Assistant response for turn ${i + 1}`));
    messages.push(makeToolResult("X".repeat(toolResultSize) + ` result turn ${i + 1}`));
  }
  return messages;
}

describe("buildWeightedHistory", () => {
  it("returns messages unchanged when disabled", () => {
    const messages = buildConversation(20);
    const config = {
      ...DEFAULT_CONTEXT_CONFIG,
      history: { ...DEFAULT_CONTEXT_CONFIG.history, enabled: false },
    };
    const result = buildWeightedHistory(messages, config);
    expect(result.messages).toEqual(messages);
    expect(result.tokensSaved).toBe(0);
  });

  it("returns messages unchanged when turns <= recentWindow", () => {
    const messages = buildConversation(3); // Default recentWindow is 3
    const result = buildWeightedHistory(messages, DEFAULT_CONTEXT_CONFIG);
    expect(result.messages.length).toBe(messages.length);
    expect(result.tokensSaved).toBe(0);
  });

  it("drops old turns beyond middle window", () => {
    const messages = buildConversation(15);
    const result = buildWeightedHistory(messages, DEFAULT_CONTEXT_CONFIG);
    // Should have fewer messages than original
    expect(result.messages.length).toBeLessThan(messages.length);
    expect(result.tokensSaved).toBeGreaterThan(0);
  });

  it("truncates tool results in middle tier", () => {
    const messages = buildConversation(8, 1000);
    const result = buildWeightedHistory(messages, DEFAULT_CONTEXT_CONFIG);
    // Find a middle-tier tool result (should be truncated)
    const toolResults = result.messages.filter((m) => m.role === "toolResult");
    const hasATruncated = toolResults.some((m) => {
      const content = (m as { content?: unknown }).content;
      if (Array.isArray(content)) {
        return content.some((b) => {
          const t = (b as { text?: string })?.text;
          return typeof t === "string" && t.includes("[...truncated]");
        });
      }
      return typeof content === "string" && content.includes("[...truncated]");
    });
    expect(hasATruncated).toBe(true);
  });

  it("keeps recent tier tool results verbatim", () => {
    const messages = buildConversation(10, 1000);
    const result = buildWeightedHistory(messages, DEFAULT_CONTEXT_CONFIG);
    // The most recent tool result should be full length
    const lastToolResult = result.messages.filter((m) => m.role === "toolResult").at(-1);
    const content = (lastToolResult as { content?: unknown }).content;
    expect(typeof content === "string" && content.length > 500).toBe(true);
    expect(typeof content === "string" && !content.includes("[...truncated]")).toBe(true);
  });

  it("handles empty messages", () => {
    const result = buildWeightedHistory([], DEFAULT_CONTEXT_CONFIG);
    expect(result.messages).toEqual([]);
    expect(result.tokensSaved).toBe(0);
  });

  it("includes metadata about window application", () => {
    const messages = buildConversation(15);
    const result = buildWeightedHistory(messages, DEFAULT_CONTEXT_CONFIG);
    expect(result.metadata).toBeDefined();
    expect((result.metadata as { totalTurns?: number }).totalTurns).toBe(15);
  });
});

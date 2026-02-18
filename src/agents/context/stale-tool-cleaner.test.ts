import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { cleanStaleToolResults } from "./stale-tool-cleaner.js";
import { DEFAULT_CONTEXT_CONFIG } from "./types.js";

function makeUserMsg(content: string): AgentMessage {
  return { role: "user", content } as AgentMessage;
}

function makeAssistantMsg(content: string): AgentMessage {
  return { role: "assistant", content } as AgentMessage;
}

function makeToolResult(content: string, toolName?: string): AgentMessage {
  return { role: "toolResult", content, toolName: toolName ?? "exec" } as AgentMessage;
}

function buildConversation(turns: number): AgentMessage[] {
  const messages: AgentMessage[] = [];
  for (let i = 0; i < turns; i++) {
    messages.push(makeUserMsg(`User message ${i}`));
    messages.push(makeAssistantMsg(`Assistant response ${i}`));
    messages.push(makeToolResult("A".repeat(500) + ` tool result for turn ${i}`, "exec"));
  }
  return messages;
}

describe("cleanStaleToolResults", () => {
  it("returns messages unchanged when disabled", () => {
    const messages = buildConversation(10);
    const config = {
      ...DEFAULT_CONTEXT_CONFIG,
      staleToolCleaner: { ...DEFAULT_CONTEXT_CONFIG.staleToolCleaner, enabled: false },
    };
    const result = cleanStaleToolResults(messages, config);
    expect(result.messages).toEqual(messages);
    expect(result.tokensSaved).toBe(0);
  });

  it("does not modify recent tool results within threshold", () => {
    const messages = buildConversation(3);
    const result = cleanStaleToolResults(messages, DEFAULT_CONTEXT_CONFIG);
    // With only 3 turns and threshold of 5, nothing should be cleaned
    expect(result.tokensSaved).toBe(0);
  });

  it("cleans stale tool results beyond threshold", () => {
    const messages = buildConversation(10);
    const result = cleanStaleToolResults(messages, DEFAULT_CONTEXT_CONFIG);
    expect(result.tokensSaved).toBeGreaterThan(0);
    // Recent results should be unchanged
    const lastToolResult = result.messages.filter((m) => m.role === "toolResult").at(-1);
    const content = (lastToolResult as { content?: unknown }).content;
    expect(typeof content === "string" && content.includes("AAAA")).toBe(true);
  });

  it("preserves tool name in summary", () => {
    const messages = buildConversation(10);
    const result = cleanStaleToolResults(messages, DEFAULT_CONTEXT_CONFIG);
    const firstToolResult = result.messages.find((m) => m.role === "toolResult");
    const content = (firstToolResult as { content?: unknown }).content;
    const text = Array.isArray(content)
      ? (content[0] as { text?: string })?.text
      : typeof content === "string"
        ? content
        : "";
    expect(text?.startsWith("[exec]")).toBe(true);
  });

  it("handles empty messages array", () => {
    const result = cleanStaleToolResults([], DEFAULT_CONTEXT_CONFIG);
    expect(result.messages).toEqual([]);
    expect(result.tokensSaved).toBe(0);
  });
});

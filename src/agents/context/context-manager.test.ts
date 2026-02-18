import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { ContextManager } from "./context-manager.js";

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
    messages.push(makeUserMsg(`User request ${i}: fix the bug in module ${i}`));
    messages.push(makeAssistantMsg(`Working on module ${i}...`));
    messages.push(makeToolResult("X".repeat(500) + ` result for turn ${i}`, "exec"));
  }
  return messages;
}

const ALL_TOOLS = [
  "read", "write", "edit", "exec", "grep", "find", "ls",
  "web_search", "web_fetch", "browser", "message", "cron",
];

describe("ContextManager", () => {
  it("creates with default config", () => {
    const mgr = new ContextManager();
    expect(mgr.getConfig().enabled).toBe(true);
    expect(mgr.getTurnCount()).toBe(0);
  });

  it("processes a simple conversation", () => {
    const mgr = new ContextManager();
    const messages = buildConversation(5);
    const result = mgr.process({
      messages,
      systemPrompt: "You are a helpful assistant.",
      allToolNames: ALL_TOOLS,
    });

    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.systemPrompt).toBeTruthy();
    expect(result.selectedTools.length).toBeGreaterThan(0);
    expect(result.pressure).toBeTruthy();
    expect(result.snapshot).toBeTruthy();
    expect(mgr.getTurnCount()).toBe(1);
  });

  it("saves tokens on a long conversation", () => {
    const mgr = new ContextManager();
    const messages = buildConversation(20);
    const result = mgr.process({
      messages,
      systemPrompt: "You are a helpful assistant. ".repeat(100),
      allToolNames: ALL_TOOLS,
    });

    expect(result.totalTokensSaved).toBeGreaterThan(0);
  });

  it("bypasses pipeline when disabled", () => {
    const mgr = new ContextManager({ enabled: false });
    const messages = buildConversation(10);
    const result = mgr.process({
      messages,
      systemPrompt: "You are a helpful assistant.",
      allToolNames: ALL_TOOLS,
    });

    expect(result.messages).toEqual(messages);
    expect(result.totalTokensSaved).toBe(0);
    expect(result.selectedTools).toEqual(ALL_TOOLS);
  });

  it("tracks telemetry across turns", () => {
    const mgr = new ContextManager();
    for (let i = 1; i <= 5; i++) {
      const messages = buildConversation(i * 3);
      mgr.process({
        messages,
        systemPrompt: "You are a helpful assistant.",
        allToolNames: ALL_TOOLS,
      });
    }

    const telemetry = mgr.getTelemetry();
    expect(telemetry.getSnapshots().length).toBe(5);
    expect(telemetry.getAverageTotalTokens()).toBeGreaterThan(0);
  });

  it("resets state", () => {
    const mgr = new ContextManager();
    const messages = buildConversation(5);
    mgr.process({
      messages,
      systemPrompt: "You are a helpful assistant.",
      allToolNames: ALL_TOOLS,
    });

    expect(mgr.getTurnCount()).toBe(1);
    mgr.reset();
    expect(mgr.getTurnCount()).toBe(0);
  });

  it("updates working memory", () => {
    const mgr = new ContextManager();
    mgr.updateWorkingMemory({
      sessionSummary: "Building a REST API",
      currentTask: "Implementing auth",
    });

    const mem = mgr.getWorkingMemory();
    expect(mem.sessionSummary).toBe("Building a REST API");
    expect(mem.currentTask).toBe("Implementing auth");
  });

  it("records compaction", () => {
    const mgr = new ContextManager();
    const messages = buildConversation(3);
    mgr.process({ messages, systemPrompt: "test", allToolNames: ALL_TOOLS });
    mgr.markCompaction();

    const mem = mgr.getWorkingMemory();
    expect(mem.lastCompactionTurn).toBe(1);
  });

  it("filters tool schemas based on conversation", () => {
    const mgr = new ContextManager();
    const messages = [makeUserMsg("read the file at /src/index.ts and fix the bug")];
    const result = mgr.process({
      messages,
      systemPrompt: "You are a helpful assistant.",
      allToolNames: ALL_TOOLS,
    });

    // Core tools should always be present
    expect(result.selectedTools).toContain("read");
    expect(result.selectedTools).toContain("exec");
    // Some tools may be filtered out
    expect(result.selectedTools.length).toBeLessThanOrEqual(ALL_TOOLS.length);
  });

  it("returns working memory block", () => {
    const mgr = new ContextManager();
    mgr.updateWorkingMemory({ sessionSummary: "Test session" });
    const result = mgr.process({
      messages: [makeUserMsg("hello")],
      systemPrompt: "test",
      allToolNames: ALL_TOOLS,
    });

    expect(result.workingMemoryBlock).toContain("<working_memory>");
    expect(result.workingMemoryBlock).toContain("Test session");
  });
});

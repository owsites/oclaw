import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { detectLoop } from "./loop-detector.js";
import { DEFAULT_CONTEXT_CONFIG } from "./types.js";

function makeUserMsg(content: string): AgentMessage {
  return { role: "user", content } as AgentMessage;
}

function makeToolUseAssistant(toolName: string, input: unknown): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "tool_use", name: toolName, input, id: `tool_${Math.random()}` }],
  } as AgentMessage;
}

function makeToolResult(content: string): AgentMessage {
  return { role: "toolResult", content } as AgentMessage;
}

describe("detectLoop", () => {
  it("returns no detection when disabled", () => {
    const config = {
      ...DEFAULT_CONTEXT_CONFIG,
      selfCorrection: { ...DEFAULT_CONTEXT_CONFIG.selfCorrection, loopDetector: false },
    };
    const messages = [
      makeUserMsg("fix it"),
      makeToolUseAssistant("exec", { cmd: "test" }),
      makeToolResult("error"),
      makeToolUseAssistant("exec", { cmd: "test" }),
      makeToolResult("error"),
      makeToolUseAssistant("exec", { cmd: "test" }),
      makeToolResult("error"),
    ];
    const result = detectLoop(messages, config);
    expect(result.detected).toBe(false);
  });

  it("detects exact tool loop", () => {
    const messages = [
      makeUserMsg("fix it"),
      makeToolUseAssistant("exec", { cmd: "npm test" }),
      makeToolResult("error"),
      makeToolUseAssistant("exec", { cmd: "npm test" }),
      makeToolResult("error"),
      makeToolUseAssistant("exec", { cmd: "npm test" }),
      makeToolResult("error"),
    ];
    const result = detectLoop(messages, DEFAULT_CONTEXT_CONFIG);
    expect(result.detected).toBe(true);
    expect(result.loopType).toBe("exact_tool");
  });

  it("detects semantic loop (same tool, different args)", () => {
    const messages = [
      makeUserMsg("find the file"),
      makeToolUseAssistant("grep", { pattern: "foo" }),
      makeToolResult("not found"),
      makeToolUseAssistant("grep", { pattern: "bar" }),
      makeToolResult("not found"),
      makeToolUseAssistant("grep", { pattern: "baz" }),
      makeToolResult("not found"),
    ];
    const result = detectLoop(messages, DEFAULT_CONTEXT_CONFIG);
    expect(result.detected).toBe(true);
    expect(result.loopType).toBe("semantic");
  });

  it("detects oscillation pattern", () => {
    const messages = [
      makeUserMsg("do the thing"),
      makeToolUseAssistant("read", { path: "/a" }),
      makeToolResult("content"),
      makeToolUseAssistant("write", { path: "/a" }),
      makeToolResult("ok"),
      makeToolUseAssistant("read", { path: "/a" }),
      makeToolResult("content"),
      makeToolUseAssistant("write", { path: "/a" }),
      makeToolResult("ok"),
    ];
    const result = detectLoop(messages, DEFAULT_CONTEXT_CONFIG);
    expect(result.detected).toBe(true);
    expect(result.loopType).toBe("oscillation");
  });

  it("does not trigger on normal diverse tool usage", () => {
    const messages = [
      makeUserMsg("work on the project"),
      makeToolUseAssistant("read", { path: "/a" }),
      makeToolResult("content"),
      makeToolUseAssistant("grep", { pattern: "foo" }),
      makeToolResult("found"),
      makeToolUseAssistant("edit", { path: "/a" }),
      makeToolResult("ok"),
    ];
    const result = detectLoop(messages, DEFAULT_CONTEXT_CONFIG);
    expect(result.detected).toBe(false);
  });

  it("returns escalating actions for repeated loops", () => {
    const messages: AgentMessage[] = [makeUserMsg("fix it")];
    for (let i = 0; i < 5; i++) {
      messages.push(makeToolUseAssistant("exec", { cmd: "npm test" }));
      messages.push(makeToolResult("error"));
    }
    const result = detectLoop(messages, DEFAULT_CONTEXT_CONFIG);
    expect(result.detected).toBe(true);
    expect(result.count).toBeGreaterThanOrEqual(3);
    expect(result.action.type).not.toBe("none");
  });
});

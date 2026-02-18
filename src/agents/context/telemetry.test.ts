import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import {
  ContextTelemetry,
  estimateMessageTokens,
  estimateMessagesTokens,
  estimateTokenCount,
} from "./telemetry.js";

describe("estimateTokenCount", () => {
  it("estimates ~4 chars per token", () => {
    expect(estimateTokenCount("hello world")).toBe(3); // 11 chars / 4 = 2.75 → ceil = 3
  });

  it("handles empty string", () => {
    expect(estimateTokenCount("")).toBe(0);
  });

  it("handles long text", () => {
    const text = "a".repeat(1000);
    expect(estimateTokenCount(text)).toBe(250);
  });
});

describe("estimateMessageTokens", () => {
  it("estimates tokens for string content", () => {
    const msg = { role: "user", content: "Hello, world!" } as AgentMessage;
    expect(estimateMessageTokens(msg)).toBeGreaterThan(0);
  });

  it("estimates tokens for array content", () => {
    const msg = {
      role: "assistant",
      content: [{ text: "Hello" }, { text: "World" }],
    } as AgentMessage;
    expect(estimateMessageTokens(msg)).toBeGreaterThan(0);
  });

  it("returns 0 for empty content", () => {
    const msg = { role: "user" } as AgentMessage;
    expect(estimateMessageTokens(msg)).toBe(0);
  });
});

describe("estimateMessagesTokens", () => {
  it("sums tokens across messages", () => {
    const messages = [
      { role: "user", content: "Hello" } as AgentMessage,
      { role: "assistant", content: "Hi there!" } as AgentMessage,
    ];
    const total = estimateMessagesTokens(messages);
    expect(total).toBeGreaterThan(0);
    expect(total).toBe(
      estimateMessageTokens(messages[0]) + estimateMessageTokens(messages[1]),
    );
  });

  it("returns 0 for empty array", () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });
});

describe("ContextTelemetry", () => {
  it("records and retrieves snapshots", () => {
    const telemetry = new ContextTelemetry();
    telemetry.createSnapshot({
      turnNumber: 1,
      systemPromptTokens: 1000,
      historyTokens: 500,
      toolSchemaTokens: 200,
      workingMemoryTokens: 100,
      totalTokens: 1800,
      pressure: "green",
      transformsApplied: ["stale_tool_cleaner"],
      correctionsApplied: [],
    });

    expect(telemetry.getSnapshots().length).toBe(1);
    expect(telemetry.getLatest()?.turnNumber).toBe(1);
  });

  it("calculates average total tokens", () => {
    const telemetry = new ContextTelemetry();
    for (let i = 1; i <= 3; i++) {
      telemetry.createSnapshot({
        turnNumber: i,
        systemPromptTokens: 1000,
        historyTokens: i * 500,
        toolSchemaTokens: 200,
        workingMemoryTokens: 100,
        totalTokens: 1000 + i * 500 + 300,
        pressure: "green",
        transformsApplied: [],
        correctionsApplied: [],
      });
    }

    expect(telemetry.getAverageTotalTokens()).toBeGreaterThan(0);
  });

  it("serializes to JSON", () => {
    const telemetry = new ContextTelemetry();
    telemetry.createSnapshot({
      turnNumber: 1,
      systemPromptTokens: 1000,
      historyTokens: 500,
      toolSchemaTokens: 200,
      workingMemoryTokens: 100,
      totalTokens: 1800,
      pressure: "green",
      transformsApplied: [],
      correctionsApplied: [],
    });

    const json = telemetry.toJSON();
    expect(json).toHaveProperty("snapshotCount", 1);
    expect(json).toHaveProperty("averageTotalTokens");
    expect(json).toHaveProperty("latestSnapshot");
  });

  it("limits snapshot count", () => {
    const telemetry = new ContextTelemetry();
    for (let i = 0; i < 250; i++) {
      telemetry.createSnapshot({
        turnNumber: i,
        systemPromptTokens: 0,
        historyTokens: 0,
        toolSchemaTokens: 0,
        workingMemoryTokens: 0,
        totalTokens: 0,
        pressure: "green",
        transformsApplied: [],
        correctionsApplied: [],
      });
    }
    expect(telemetry.getSnapshots().length).toBeLessThanOrEqual(200);
  });
});

import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { calculatePressure, enforceBudget, adjustWindowForPressure } from "./budget-enforcer.js";
import { DEFAULT_CONTEXT_CONFIG } from "./types.js";

function makeUserMsg(content: string): AgentMessage {
  return { role: "user", content } as AgentMessage;
}

function makeAssistantMsg(content: string): AgentMessage {
  return { role: "assistant", content } as AgentMessage;
}

describe("calculatePressure", () => {
  it("returns green for low usage", () => {
    const result = calculatePressure(50_000, DEFAULT_CONTEXT_CONFIG);
    expect(result.pressure).toBe("green");
  });

  it("returns yellow for moderate usage", () => {
    const result = calculatePressure(130_000, DEFAULT_CONTEXT_CONFIG);
    expect(result.pressure).toBe("yellow");
  });

  it("returns orange for high usage", () => {
    const result = calculatePressure(160_000, DEFAULT_CONTEXT_CONFIG);
    expect(result.pressure).toBe("orange");
  });

  it("returns red for very high usage", () => {
    const result = calculatePressure(185_000, DEFAULT_CONTEXT_CONFIG);
    expect(result.pressure).toBe("red");
  });

  it("returns critical for near-full usage", () => {
    const result = calculatePressure(195_000, DEFAULT_CONTEXT_CONFIG);
    expect(result.pressure).toBe("critical");
  });
});

describe("adjustWindowForPressure", () => {
  it("returns base windows for green pressure", () => {
    const result = adjustWindowForPressure("green", DEFAULT_CONTEXT_CONFIG);
    expect(result.recentWindow).toBe(DEFAULT_CONTEXT_CONFIG.history.recentWindow);
    expect(result.middleWindow).toBe(DEFAULT_CONTEXT_CONFIG.history.middleWindow);
  });

  it("reduces middle truncation for yellow pressure", () => {
    const result = adjustWindowForPressure("yellow", DEFAULT_CONTEXT_CONFIG);
    expect(result.middleTruncateChars).toBeLessThan(
      DEFAULT_CONTEXT_CONFIG.history.middleTruncateChars,
    );
  });

  it("halves middle window for orange pressure", () => {
    const result = adjustWindowForPressure("orange", DEFAULT_CONTEXT_CONFIG);
    expect(result.middleWindow).toBeLessThan(DEFAULT_CONTEXT_CONFIG.history.middleWindow);
  });

  it("drops middle entirely for red pressure", () => {
    const result = adjustWindowForPressure("red", DEFAULT_CONTEXT_CONFIG);
    expect(result.middleWindow).toBe(0);
  });

  it("reduces recent window for critical pressure", () => {
    const result = adjustWindowForPressure("critical", DEFAULT_CONTEXT_CONFIG);
    expect(result.recentWindow).toBeLessThan(DEFAULT_CONTEXT_CONFIG.history.recentWindow);
    expect(result.middleWindow).toBe(0);
  });
});

describe("enforceBudget", () => {
  it("does nothing when disabled", () => {
    const config = { ...DEFAULT_CONTEXT_CONFIG, budget: { ...DEFAULT_CONTEXT_CONFIG.budget, enabled: false } };
    const messages = [makeUserMsg("hello"), makeAssistantMsg("hi")];
    const result = enforceBudget(messages, config, 1000);
    expect(result.messages).toEqual(messages);
    expect(result.pressure).toBe("green");
  });

  it("does nothing at green pressure", () => {
    const messages = [makeUserMsg("hello"), makeAssistantMsg("hi")];
    const result = enforceBudget(messages, DEFAULT_CONTEXT_CONFIG, 1000);
    expect(result.messages).toEqual(messages);
    expect(result.tokensSaved).toBe(0);
  });

  it("trims messages at critical pressure", () => {
    // Create messages that total well over maxContextTokens
    const messages: AgentMessage[] = [];
    for (let i = 0; i < 100; i++) {
      messages.push(makeUserMsg("A".repeat(5000)));
      messages.push(makeAssistantMsg("B".repeat(5000)));
    }
    const result = enforceBudget(messages, DEFAULT_CONTEXT_CONFIG, 50_000);
    expect(result.messages.length).toBeLessThan(messages.length);
    expect(result.tokensSaved).toBeGreaterThan(0);
    expect(result.needsCompaction).toBe(true);
  });
});

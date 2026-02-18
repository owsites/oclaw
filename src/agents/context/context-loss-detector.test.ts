import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { detectContextLoss, scanForContextLoss } from "./context-loss-detector.js";

function makeAssistantMsg(content: string): AgentMessage {
  return { role: "assistant", content } as AgentMessage;
}

function makeUserMsg(content: string): AgentMessage {
  return { role: "user", content } as AgentMessage;
}

describe("detectContextLoss", () => {
  it("detects 'I don't have information' pattern", () => {
    const msg = makeAssistantMsg("I don't have information about that file you mentioned earlier.");
    const result = detectContextLoss(msg);
    expect(result.detected).toBe(true);
    expect(result.patterns.length).toBeGreaterThan(0);
  });

  it("detects 'Could you remind me' pattern", () => {
    const msg = makeAssistantMsg("Could you remind me what function we were working on?");
    const result = detectContextLoss(msg);
    expect(result.detected).toBe(true);
  });

  it("detects 'I'm not sure what you're referring to' pattern", () => {
    const msg = makeAssistantMsg("I'm not sure what you're referring to. Can you clarify?");
    const result = detectContextLoss(msg);
    expect(result.detected).toBe(true);
  });

  it("does not trigger on normal assistant messages", () => {
    const msg = makeAssistantMsg("I'll fix that bug in the calculateTotal function right away.");
    const result = detectContextLoss(msg);
    expect(result.detected).toBe(false);
  });

  it("does not check user messages", () => {
    const msg = makeUserMsg("I don't have information about the API");
    const result = detectContextLoss(msg);
    expect(result.detected).toBe(false);
  });

  it("returns expand_window action when detected", () => {
    const msg = makeAssistantMsg("I don't have information about that. Could you remind me what we discussed?");
    const result = detectContextLoss(msg);
    expect(result.detected).toBe(true);
    expect(result.action.type).toBe("expand_window");
  });
});

describe("scanForContextLoss", () => {
  it("scans recent assistant messages", () => {
    const messages = [
      makeUserMsg("What about the file?"),
      makeAssistantMsg("I don't have information about that file."),
      makeUserMsg("The one we edited earlier"),
      makeAssistantMsg("I'm not sure what you're referring to."),
    ];
    const result = scanForContextLoss(messages);
    expect(result.detected).toBe(true);
  });

  it("returns no detection for clean conversation", () => {
    const messages = [
      makeUserMsg("Fix the bug"),
      makeAssistantMsg("I'll fix the bug in the login function."),
      makeUserMsg("Thanks"),
      makeAssistantMsg("Done! The fix has been applied."),
    ];
    const result = scanForContextLoss(messages);
    expect(result.detected).toBe(false);
  });
});

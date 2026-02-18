import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { selectToolGroups, ToolGroupMomentum } from "./tool-groups.js";
import { DEFAULT_CONTEXT_CONFIG } from "./types.js";

function makeUserMsg(content: string): AgentMessage {
  return { role: "user", content } as AgentMessage;
}

const ALL_TOOLS = [
  "read", "write", "edit", "apply_patch", "grep", "find", "ls", "exec", "process",
  "web_search", "web_fetch", "browser", "canvas", "nodes", "cron",
  "message", "gateway", "agents_list", "sessions_list", "sessions_history",
  "sessions_send", "sessions_spawn", "subagents", "session_status", "image",
];

describe("selectToolGroups", () => {
  it("returns all tools when disabled", () => {
    const config = { ...DEFAULT_CONTEXT_CONFIG, toolSelection: { ...DEFAULT_CONTEXT_CONFIG.toolSelection, enabled: false } };
    const result = selectToolGroups({
      messages: [makeUserMsg("hello")],
      allToolNames: ALL_TOOLS,
      currentTurn: 1,
      config,
      momentum: new ToolGroupMomentum(),
    });
    expect(result.selectedTools).toEqual(ALL_TOOLS);
    expect(result.filteredCount).toBe(0);
  });

  it("always includes core tools", () => {
    const result = selectToolGroups({
      messages: [makeUserMsg("hello how are you")],
      allToolNames: ALL_TOOLS,
      currentTurn: 1,
      config: DEFAULT_CONTEXT_CONFIG,
      momentum: new ToolGroupMomentum(),
    });
    expect(result.selectedTools).toContain("read");
    expect(result.selectedTools).toContain("exec");
  });

  it("selects research tools for search-related messages", () => {
    const result = selectToolGroups({
      messages: [makeUserMsg("search the web for python documentation")],
      allToolNames: ALL_TOOLS,
      currentTurn: 1,
      config: DEFAULT_CONTEXT_CONFIG,
      momentum: new ToolGroupMomentum(),
    });
    expect(result.selectedTools).toContain("web_search");
    expect(result.selectedGroups).toContain("research");
  });

  it("selects messaging tools for messaging-related messages", () => {
    const result = selectToolGroups({
      messages: [makeUserMsg("send a message to the telegram channel")],
      allToolNames: ALL_TOOLS,
      currentTurn: 1,
      config: DEFAULT_CONTEXT_CONFIG,
      momentum: new ToolGroupMomentum(),
    });
    expect(result.selectedTools).toContain("message");
    expect(result.selectedGroups).toContain("messaging");
  });

  it("respects momentum from previous turns", () => {
    const momentum = new ToolGroupMomentum();
    momentum.activate("browser", 1);

    const result = selectToolGroups({
      messages: [makeUserMsg("now fix the bug in the code")],
      allToolNames: ALL_TOOLS,
      currentTurn: 2,
      config: DEFAULT_CONTEXT_CONFIG,
      momentum,
    });
    // Browser should still be included due to momentum
    expect(result.selectedTools).toContain("browser");
  });

  it("filters out irrelevant tools", () => {
    const result = selectToolGroups({
      messages: [makeUserMsg("read the file and fix the bug")],
      allToolNames: ALL_TOOLS,
      currentTurn: 1,
      config: DEFAULT_CONTEXT_CONFIG,
      momentum: new ToolGroupMomentum(),
    });
    expect(result.filteredCount).toBeGreaterThan(0);
    expect(result.selectedTools.length).toBeLessThan(ALL_TOOLS.length);
  });
});

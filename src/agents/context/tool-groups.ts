/**
 * Tool Group Selector (Transform 2)
 *
 * Deterministic keyword matching with momentum-based selection.
 * Reduces 25+ tool schemas to 5-8 relevant ones per turn.
 *
 * Expected savings: 900-1,600 tokens/turn.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ContextConfig, ToolGroup, ToolGroupMapping } from "./types.js";

// ---------------------------------------------------------------------------
// Static tool group definitions
// ---------------------------------------------------------------------------

const TOOL_GROUP_MAP: ToolGroupMapping[] = [
  {
    group: "core",
    tools: ["read", "write", "edit", "apply_patch", "grep", "find", "ls", "exec", "process"],
    keywords: [
      "file",
      "read",
      "write",
      "edit",
      "patch",
      "search",
      "find",
      "list",
      "run",
      "exec",
      "shell",
      "command",
      "directory",
      "folder",
      "code",
      "script",
      "compile",
      "build",
      "test",
      "debug",
      "fix",
      "bug",
      "error",
      "implement",
      "refactor",
      "change",
      "modify",
      "create",
      "delete",
      "remove",
      "move",
      "rename",
      "copy",
    ],
  },
  {
    group: "file_ops",
    tools: ["read", "write", "edit", "apply_patch", "grep", "find", "ls"],
    keywords: [
      "file",
      "read",
      "write",
      "edit",
      "patch",
      "search",
      "grep",
      "find",
      "list",
      "directory",
      "folder",
      "path",
      "content",
    ],
  },
  {
    group: "research",
    tools: ["web_search", "web_fetch", "memory_search", "memory_get"],
    keywords: [
      "search",
      "web",
      "browse",
      "lookup",
      "find",
      "research",
      "google",
      "url",
      "link",
      "website",
      "article",
      "documentation",
      "docs",
      "memory",
      "remember",
      "recall",
      "forgot",
      "history",
      "previous",
    ],
  },
  {
    group: "messaging",
    tools: ["message", "sessions_send", "sessions_list", "sessions_history"],
    keywords: [
      "message",
      "send",
      "reply",
      "chat",
      "telegram",
      "whatsapp",
      "discord",
      "slack",
      "signal",
      "notify",
      "notification",
      "dm",
      "channel",
      "group",
    ],
  },
  {
    group: "orchestration",
    tools: [
      "sessions_spawn",
      "sessions_list",
      "sessions_send",
      "subagents",
      "agents_list",
      "cron",
    ],
    keywords: [
      "spawn",
      "subagent",
      "agent",
      "delegate",
      "orchestrate",
      "parallel",
      "cron",
      "schedule",
      "reminder",
      "timer",
      "recurring",
      "job",
      "task",
      "workflow",
    ],
  },
  {
    group: "browser",
    tools: ["browser", "web_fetch"],
    keywords: [
      "browser",
      "webpage",
      "click",
      "navigate",
      "screenshot",
      "scrape",
      "automate",
      "selenium",
      "playwright",
      "page",
      "tab",
      "dom",
    ],
  },
  {
    group: "media",
    tools: ["image", "canvas"],
    keywords: [
      "image",
      "photo",
      "picture",
      "screenshot",
      "canvas",
      "draw",
      "visual",
      "diagram",
      "chart",
      "graph",
      "render",
      "display",
    ],
  },
  {
    group: "system",
    tools: ["gateway", "session_status"],
    keywords: [
      "gateway",
      "restart",
      "update",
      "config",
      "status",
      "system",
      "settings",
      "configure",
      "install",
      "upgrade",
      "version",
      "health",
    ],
  },
  {
    group: "nodes",
    tools: ["nodes"],
    keywords: [
      "node",
      "device",
      "paired",
      "camera",
      "screen",
      "notify",
      "iot",
      "smart",
      "sensor",
      "light",
      "switch",
    ],
  },
];

// ---------------------------------------------------------------------------
// Keyword matching
// ---------------------------------------------------------------------------

function extractTextFromMessages(messages: AgentMessage[]): string {
  const parts: string[] = [];
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    const content = (msg as { content?: unknown }).content;
    if (typeof content === "string") {
      parts.push(content.toLowerCase());
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block && typeof block === "object") {
          const text = (block as { text?: unknown }).text;
          if (typeof text === "string") parts.push(text.toLowerCase());
        }
      }
    }
  }
  return parts.join(" ");
}

function scoreGroup(text: string, mapping: ToolGroupMapping): number {
  let score = 0;
  for (const keyword of mapping.keywords) {
    if (text.includes(keyword)) score++;
  }
  return score;
}

// ---------------------------------------------------------------------------
// Momentum tracker
// ---------------------------------------------------------------------------

type MomentumEntry = { group: ToolGroup; lastActiveTurn: number };

export class ToolGroupMomentum {
  private entries: MomentumEntry[] = [];

  activate(group: ToolGroup, turn: number): void {
    const existing = this.entries.find((e) => e.group === group);
    if (existing) {
      existing.lastActiveTurn = turn;
    } else {
      this.entries.push({ group, lastActiveTurn: turn });
    }
  }

  getActive(currentTurn: number, momentumTurns: number): Set<ToolGroup> {
    const active = new Set<ToolGroup>();
    for (const entry of this.entries) {
      if (currentTurn - entry.lastActiveTurn <= momentumTurns) {
        active.add(entry.group);
      }
    }
    return active;
  }
}

// ---------------------------------------------------------------------------
// Main selector
// ---------------------------------------------------------------------------

/**
 * Select relevant tool groups based on recent conversation context.
 * Returns the set of tool names that should be included.
 */
export function selectToolGroups(params: {
  messages: AgentMessage[];
  allToolNames: string[];
  currentTurn: number;
  config: ContextConfig;
  momentum: ToolGroupMomentum;
}): {
  selectedTools: string[];
  selectedGroups: ToolGroup[];
  filteredCount: number;
} {
  const { messages, allToolNames, currentTurn, config, momentum } = params;

  if (!config.toolSelection.enabled) {
    return {
      selectedTools: allToolNames,
      selectedGroups: TOOL_GROUP_MAP.map((m) => m.group),
      filteredCount: 0,
    };
  }

  // Get recent messages for keyword scanning
  const scanWindow = config.toolSelection.keywordScanTurns;
  let userTurnsSeen = 0;
  const recentMessages: AgentMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    recentMessages.unshift(msg);
    if (msg.role === "user") {
      userTurnsSeen++;
      if (userTurnsSeen >= scanWindow) break;
    }
  }

  const text = extractTextFromMessages(recentMessages);

  // Score each group
  const scores = new Map<ToolGroup, number>();
  for (const mapping of TOOL_GROUP_MAP) {
    const score = scoreGroup(text, mapping);
    if (score > 0) {
      scores.set(mapping.group, score);
      momentum.activate(mapping.group, currentTurn);
    }
  }

  // Include momentum groups
  const momentumGroups = momentum.getActive(currentTurn, config.toolSelection.momentumTurns);
  for (const group of momentumGroups) {
    if (!scores.has(group)) {
      scores.set(group, 0.5); // Low score but still included
    }
  }

  // Always include "core" group
  scores.set("core", Math.max(scores.get("core") ?? 0, 1));

  // Collect tools from selected groups
  const selectedGroups = Array.from(scores.keys());
  const selectedToolSet = new Set<string>();
  for (const group of selectedGroups) {
    const mapping = TOOL_GROUP_MAP.find((m) => m.group === group);
    if (mapping) {
      for (const tool of mapping.tools) {
        if (allToolNames.includes(tool)) {
          selectedToolSet.add(tool);
        }
      }
    }
  }

  // Always include tools that were explicitly used in recent messages
  for (const msg of recentMessages) {
    const toolName =
      (msg as { toolName?: unknown }).toolName ??
      (msg as { name?: unknown }).name ??
      (msg as { tool?: unknown }).tool;
    if (typeof toolName === "string" && allToolNames.includes(toolName)) {
      selectedToolSet.add(toolName);
    }
  }

  const selectedTools = allToolNames.filter((t) => selectedToolSet.has(t));
  return {
    selectedTools,
    selectedGroups,
    filteredCount: allToolNames.length - selectedTools.length,
  };
}

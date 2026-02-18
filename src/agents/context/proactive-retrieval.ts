/**
 * Proactive Retrieval (Phase 3)
 *
 * Smart prefetch for memory and context based on conversation signals.
 * When the agent is about to need information that was dropped from the
 * history window, this module proactively retrieves it.
 *
 * Triggers:
 * - Context loss detection (from self-correction)
 * - References to old turns (pronouns, "earlier", "before")
 * - Tool results that reference dropped context
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { WorkingMemoryBlock } from "./types.js";

// ---------------------------------------------------------------------------
// Reference patterns
// ---------------------------------------------------------------------------

const BACKWARD_REFERENCE_PATTERNS = [
  /(?:as (?:I|we) (?:said|mentioned|discussed|noted|decided) (?:earlier|before|previously))/i,
  /(?:going back to|returning to|referring to) (?:the|our|that) (?:earlier|previous|original)/i,
  /(?:remember when|earlier you|before you|previously we)/i,
  /(?:the (?:first|original|initial) (?:approach|plan|solution|version))/i,
  /(?:like (?:I|we) did (?:before|earlier|in the beginning))/i,
  /(?:that (?:file|function|class|module|config) (?:I|we) (?:looked at|modified|created) (?:earlier|before))/i,
];

// ---------------------------------------------------------------------------
// Retrieval suggestions
// ---------------------------------------------------------------------------

export type RetrievalSuggestion = {
  type: "memory_search" | "expand_window" | "inject_fact";
  query?: string;
  fact?: string;
  priority: "low" | "medium" | "high";
};

/**
 * Analyze the latest user message for backward references
 * and suggest proactive retrievals.
 */
export function suggestRetrievals(params: {
  latestUserMessage: string;
  workingMemory: WorkingMemoryBlock;
  currentTurnCount: number;
  droppedTurns: number;
}): RetrievalSuggestion[] {
  const { latestUserMessage, workingMemory, droppedTurns } = params;
  const suggestions: RetrievalSuggestion[] = [];

  if (droppedTurns === 0) return suggestions;

  const text = latestUserMessage.toLowerCase();

  // Check for backward references
  for (const pattern of BACKWARD_REFERENCE_PATTERNS) {
    if (pattern.test(latestUserMessage)) {
      suggestions.push({
        type: "memory_search",
        query: extractSearchQuery(latestUserMessage),
        priority: "high",
      });
      break; // One memory search is enough
    }
  }

  // Check if the user references something in working memory facts
  for (const fact of workingMemory.keyFacts) {
    const factWords = fact.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const matchCount = factWords.filter((w) => text.includes(w)).length;
    if (matchCount >= 2) {
      suggestions.push({
        type: "inject_fact",
        fact,
        priority: "medium",
      });
    }
  }

  // Check for references to the current task
  if (workingMemory.currentTask) {
    const taskWords = workingMemory.currentTask.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const matchCount = taskWords.filter((w) => text.includes(w)).length;
    if (matchCount >= 2 && droppedTurns > 3) {
      suggestions.push({
        type: "expand_window",
        priority: "low",
      });
    }
  }

  return suggestions;
}

/**
 * Extract a meaningful search query from a user message that
 * contains backward references.
 */
function extractSearchQuery(message: string): string {
  // Remove backward reference phrasing and extract the core subject
  const cleaned = message
    .replace(/(?:as (?:I|we) (?:said|mentioned|discussed|noted|decided) (?:earlier|before|previously))/gi, "")
    .replace(/(?:going back to|returning to|referring to)/gi, "")
    .replace(/(?:remember when|earlier you|before you|previously we)/gi, "")
    .trim();

  // Take the first meaningful phrase (up to 100 chars)
  const words = cleaned.split(/\s+/).filter((w) => w.length > 2);
  return words.slice(0, 15).join(" ").slice(0, 100);
}

/**
 * Build a context injection string from retrieval suggestions.
 * This can be prepended to the system prompt or injected into history.
 */
export function buildRetrievalContext(suggestions: RetrievalSuggestion[]): string {
  const factSuggestions = suggestions.filter((s) => s.type === "inject_fact" && s.fact);
  if (factSuggestions.length === 0) return "";

  const lines = ["<retrieved_context>"];
  for (const s of factSuggestions) {
    lines.push(`- ${s.fact}`);
  }
  lines.push("</retrieved_context>");
  return lines.join("\n");
}

/**
 * Working Memory Injector (Transform 4)
 *
 * MemGPT-inspired core memory blocks + Mem0-style fact extraction.
 * Maintains a compact working memory that persists across turns,
 * enabling aggressive history windowing without losing key context.
 *
 * Memory is ~200-400 tokens serialized.
 */

import type { WorkingMemoryBlock } from "./types.js";
import { estimateTokenCount } from "./telemetry.js";

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

export function createEmptyWorkingMemory(): WorkingMemoryBlock {
  return {
    sessionSummary: "",
    currentTask: "",
    recentDecisions: [],
    activeConstraints: [],
    keyFacts: [],
    toolsUsedThisSession: [],
    turnCount: 0,
    lastCompactionTurn: 0,
  };
}

// ---------------------------------------------------------------------------
// Memory operations (Mem0-inspired ADD/UPDATE/DELETE)
// ---------------------------------------------------------------------------

export function addFact(memory: WorkingMemoryBlock, fact: string, maxFacts: number): void {
  const trimmed = fact.trim();
  if (!trimmed) return;
  // Dedup: don't add if already exists
  if (memory.keyFacts.some((f) => f.toLowerCase() === trimmed.toLowerCase())) return;
  memory.keyFacts.push(trimmed);
  if (memory.keyFacts.length > maxFacts) {
    memory.keyFacts = memory.keyFacts.slice(-maxFacts);
  }
}

export function addDecision(
  memory: WorkingMemoryBlock,
  decision: string,
  maxDecisions: number,
): void {
  const trimmed = decision.trim();
  if (!trimmed) return;
  if (memory.recentDecisions.some((d) => d.toLowerCase() === trimmed.toLowerCase())) return;
  memory.recentDecisions.push(trimmed);
  if (memory.recentDecisions.length > maxDecisions) {
    memory.recentDecisions = memory.recentDecisions.slice(-maxDecisions);
  }
}

export function addConstraint(
  memory: WorkingMemoryBlock,
  constraint: string,
  maxConstraints: number,
): void {
  const trimmed = constraint.trim();
  if (!trimmed) return;
  if (memory.activeConstraints.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return;
  memory.activeConstraints.push(trimmed);
  if (memory.activeConstraints.length > maxConstraints) {
    memory.activeConstraints = memory.activeConstraints.slice(-maxConstraints);
  }
}

export function removeFact(memory: WorkingMemoryBlock, factSubstring: string): void {
  memory.keyFacts = memory.keyFacts.filter(
    (f) => !f.toLowerCase().includes(factSubstring.toLowerCase()),
  );
}

export function trackToolUsage(memory: WorkingMemoryBlock, toolName: string): void {
  const name = toolName.trim();
  if (!name) return;
  if (!memory.toolsUsedThisSession.includes(name)) {
    memory.toolsUsedThisSession.push(name);
  }
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Serialize working memory into a compact text block suitable for
 * injection into the system prompt or history.
 */
export function serializeWorkingMemory(memory: WorkingMemoryBlock): string {
  const lines: string[] = ["<working_memory>"];

  if (memory.sessionSummary) {
    lines.push(`Summary: ${memory.sessionSummary}`);
  }
  if (memory.currentTask) {
    lines.push(`Task: ${memory.currentTask}`);
  }
  if (memory.recentDecisions.length > 0) {
    lines.push(`Decisions: ${memory.recentDecisions.join("; ")}`);
  }
  if (memory.activeConstraints.length > 0) {
    lines.push(`Constraints: ${memory.activeConstraints.join("; ")}`);
  }
  if (memory.keyFacts.length > 0) {
    lines.push(`Facts: ${memory.keyFacts.join("; ")}`);
  }
  if (memory.toolsUsedThisSession.length > 0) {
    lines.push(`Tools used: ${memory.toolsUsedThisSession.join(", ")}`);
  }
  lines.push(`Turn: ${memory.turnCount}`);
  if (memory.lastCompactionTurn > 0) {
    lines.push(`Last compaction: turn ${memory.lastCompactionTurn}`);
  }

  lines.push("</working_memory>");
  return lines.join("\n");
}

/**
 * Estimate token cost of the serialized working memory.
 */
export function estimateWorkingMemoryTokens(memory: WorkingMemoryBlock): number {
  return estimateTokenCount(serializeWorkingMemory(memory));
}

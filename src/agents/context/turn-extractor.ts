/**
 * Turn Extractor (Working Memory Updater - Corrector 4)
 *
 * Heuristic extraction of decisions, constraints, and facts from
 * conversation turns. Uses pure string manipulation (0 LLM calls)
 * to keep working memory up to date.
 *
 * Inspired by Mem0's curation rules (ADD/UPDATE/DELETE).
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ContextConfig, WorkingMemoryBlock } from "./types.js";
import { addConstraint, addDecision, addFact, trackToolUsage } from "./working-memory.js";

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

/** Patterns that indicate a decision was made. */
const DECISION_PATTERNS = [
  /(?:I'll|I will|Let me|Going to|I've decided to|I chose to|I'm going to)\s+(.{10,80})/i,
  /(?:We should|We'll|Let's)\s+(.{10,80})/i,
  /(?:Decision|Approach|Plan|Strategy):\s*(.{10,80})/i,
];

/** Patterns that indicate a constraint or requirement. */
const CONSTRAINT_PATTERNS = [
  /(?:must|should|need to|required to|have to|cannot|must not|should not)\s+(.{10,80})/i,
  /(?:Constraint|Requirement|Rule|Limitation):\s*(.{10,80})/i,
  /(?:don't|do not|never|always|avoid)\s+(.{10,80})/i,
];

/** Patterns that indicate a factual statement worth remembering. */
const FACT_PATTERNS = [
  /(?:The (?:file|function|class|module|api|service|endpoint|database|table|column))\s+(.{10,80})/i,
  /(?:is located at|lives in|can be found at|stored in)\s+(.{10,80})/i,
  /(?:uses|requires|depends on|imports|exports)\s+(.{10,80})/i,
  /(?:version|v)\s*(\d+\.\d+(?:\.\d+)?)/i,
];

/** Patterns that indicate the current task or goal. */
const TASK_PATTERNS = [
  /(?:help me|can you|please|I need|I want)\s+(.{10,100})/i,
  /(?:task|goal|objective):\s*(.{10,100})/i,
];

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

function extractFromText(text: string, patterns: RegExp[]): string[] {
  const results: string[] = [];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const cleaned = match[1].trim().replace(/[.!?,;:]$/, "").trim();
      if (cleaned.length >= 10) {
        results.push(cleaned);
      }
    }
  }
  return results;
}

function getMessageText(msg: AgentMessage): string {
  const content = (msg as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const text = (block as { text?: unknown }).text;
    if (typeof text === "string") parts.push(text);
  }
  return parts.join("\n");
}

function getToolName(msg: AgentMessage): string | undefined {
  const candidate =
    (msg as { toolName?: unknown }).toolName ??
    (msg as { name?: unknown }).name ??
    (msg as { tool?: unknown }).tool;
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : undefined;
}

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------

/**
 * Process a single turn's messages and update working memory.
 * Call this after each turn to keep working memory current.
 */
export function extractAndUpdateMemory(
  messages: AgentMessage[],
  memory: WorkingMemoryBlock,
  config: ContextConfig,
): void {
  if (!config.workingMemory.enabled) return;

  const { maxFacts, maxDecisions, maxConstraints } = config.workingMemory;

  for (const msg of messages) {
    const text = getMessageText(msg);
    if (!text) continue;

    // Track tool usage
    const toolName = getToolName(msg);
    if (toolName) {
      trackToolUsage(memory, toolName);
    }

    // Extract from user messages
    if (msg.role === "user") {
      // Update current task from user requests
      const taskMatches = extractFromText(text, TASK_PATTERNS);
      if (taskMatches.length > 0) {
        memory.currentTask = taskMatches[0];
      }

      // Extract constraints from user messages
      const constraints = extractFromText(text, CONSTRAINT_PATTERNS);
      for (const constraint of constraints) {
        addConstraint(memory, constraint, maxConstraints);
      }

      // Extract facts
      const facts = extractFromText(text, FACT_PATTERNS);
      for (const fact of facts) {
        addFact(memory, fact, maxFacts);
      }
    }

    // Extract from assistant messages
    if (msg.role === "assistant") {
      const decisions = extractFromText(text, DECISION_PATTERNS);
      for (const decision of decisions) {
        addDecision(memory, decision, maxDecisions);
      }

      const facts = extractFromText(text, FACT_PATTERNS);
      for (const fact of facts) {
        addFact(memory, fact, maxFacts);
      }
    }
  }

  memory.turnCount++;
}

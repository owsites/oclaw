/**
 * Tiered Prompt Builder (Transform 5)
 *
 * Splits the system prompt into tiers:
 * - Tier 0 (Always, ~300 tokens): Identity, safety, workspace, runtime
 * - Tier 1 (Conditional, 200-800 tokens): Tools, messaging, sandbox, reactions, skills
 * - Tier 2 (Omitted): CLI reference, self-update, model aliases, TTS, heartbeat,
 *   silent replies, docs URLs - written to a reference file instead.
 *
 * Expected savings: 1,000-3,000 tokens/turn.
 */

import type { PromptTier } from "./types.js";

// ---------------------------------------------------------------------------
// Section classification
// ---------------------------------------------------------------------------

/**
 * System prompt sections and their tier assignment.
 * Sections are identified by their header text.
 */
type SectionTier = {
  /** Regex to match the section header line. */
  pattern: RegExp;
  /** Minimum tier required to include this section. */
  minimumTier: PromptTier;
};

const SECTION_TIERS: SectionTier[] = [
  // Tier 0 (Always) - Identity, safety, workspace, runtime
  { pattern: /^You are a personal assistant/, minimumTier: "compact" },
  { pattern: /^## Safety/, minimumTier: "compact" },
  { pattern: /^## Workspace$/, minimumTier: "compact" },
  { pattern: /^## Runtime/, minimumTier: "compact" },
  { pattern: /^## Workspace Files/, minimumTier: "compact" },
  { pattern: /^# Project Context/, minimumTier: "compact" },

  // Tier 1 (Standard) - Tools, messaging, sandbox, reactions, skills
  { pattern: /^## Tooling/, minimumTier: "standard" },
  { pattern: /^## Tool Call Style/, minimumTier: "standard" },
  { pattern: /^## Messaging/, minimumTier: "standard" },
  { pattern: /^## Sandbox/, minimumTier: "standard" },
  { pattern: /^## Reactions/, minimumTier: "standard" },
  { pattern: /^## Skills/, minimumTier: "standard" },
  { pattern: /^## Memory Recall/, minimumTier: "standard" },
  { pattern: /^## Reasoning Format/, minimumTier: "standard" },

  // Tier 2 (Full only) - CLI reference, self-update, model aliases, etc.
  { pattern: /^## OpenWolf CLI Quick Reference/, minimumTier: "full" },
  { pattern: /^## OpenWolf Self-Update/, minimumTier: "full" },
  { pattern: /^## Model Aliases/, minimumTier: "full" },
  { pattern: /^## Voice \(TTS\)/, minimumTier: "full" },
  { pattern: /^## Silent Replies/, minimumTier: "full" },
  { pattern: /^## Heartbeats/, minimumTier: "full" },
  { pattern: /^## Documentation/, minimumTier: "full" },
  { pattern: /^## Reply Tags/, minimumTier: "full" },
  { pattern: /^## User Identity/, minimumTier: "full" },
  { pattern: /^## Current Date/, minimumTier: "full" },
  { pattern: /^## Group Chat Context/, minimumTier: "full" },
  { pattern: /^## Subagent Context/, minimumTier: "full" },
];

// Tier ordering for comparison
const TIER_ORDER: Record<PromptTier, number> = {
  compact: 0,
  standard: 1,
  full: 2,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Filter system prompt sections based on the configured tier.
 * Returns the filtered prompt text and any extracted Tier 2 content
 * that should be written to a reference file.
 */
export function applyPromptTier(
  fullPrompt: string,
  tier: PromptTier,
): {
  prompt: string;
  referenceContent: string;
  tokensSaved: number;
} {
  if (tier === "full") {
    return { prompt: fullPrompt, referenceContent: "", tokensSaved: 0 };
  }

  const lines = fullPrompt.split("\n");
  const includedLines: string[] = [];
  const referenceLines: string[] = [];
  let currentSection: { minimumTier: PromptTier; lines: string[] } | null = null;
  const tierLevel = TIER_ORDER[tier];

  function flushSection() {
    if (!currentSection) return;
    const sectionTierLevel = TIER_ORDER[currentSection.minimumTier];
    if (sectionTierLevel <= tierLevel) {
      includedLines.push(...currentSection.lines);
    } else {
      referenceLines.push(...currentSection.lines);
    }
    currentSection = null;
  }

  for (const line of lines) {
    // Check if this line starts a new section
    const matchedTier = SECTION_TIERS.find((st) => st.pattern.test(line));
    if (matchedTier) {
      flushSection();
      currentSection = { minimumTier: matchedTier.minimumTier, lines: [line] };
      continue;
    }

    if (currentSection) {
      currentSection.lines.push(line);
    } else {
      // Lines before any section header (identity line) - always include
      includedLines.push(line);
    }
  }

  flushSection();

  const prompt = includedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const referenceContent = referenceLines.join("\n").trim();
  const originalTokens = Math.ceil(fullPrompt.length / 4);
  const newTokens = Math.ceil(prompt.length / 4);

  return {
    prompt,
    referenceContent,
    tokensSaved: Math.max(0, originalTokens - newTokens),
  };
}

/**
 * Build a reference file content string from Tier 2 sections.
 * This can be written to a .prompt-reference.md file for the agent
 * to consult when needed.
 */
export function buildPromptReference(referenceContent: string): string {
  if (!referenceContent.trim()) return "";
  return [
    "# OpenWolf Prompt Reference",
    "",
    "These sections are available for reference but omitted from the active system prompt",
    "to save context tokens. Consult this file when you need details about these topics.",
    "",
    referenceContent,
  ].join("\n");
}

import { describe, expect, it } from "vitest";
import { applyPromptTier, buildPromptReference } from "./prompt-tiers.js";

const FULL_PROMPT = `You are a personal assistant running inside OpenWolf.

## Tooling
Tool availability (filtered by policy):
- read: Read file contents
- exec: Run shell commands

## Safety
You have no independent goals.

## OpenWolf CLI Quick Reference
OpenWolf is controlled via subcommands.
- openwolf gateway status

## Skills (mandatory)
Before replying: scan available skills.

## Memory Recall
Before answering anything about prior work.

## Documentation
OpenWolf docs: /path/to/docs

## Workspace
Your working directory is: /home/user/project

## Silent Replies
When you have nothing to say, respond with ONLY: __SILENT__

## Heartbeats
Heartbeat prompt: configured

## Runtime
Runtime: host=test model=gpt-4`;

describe("applyPromptTier", () => {
  it("returns full prompt unchanged for 'full' tier", () => {
    const result = applyPromptTier(FULL_PROMPT, "full");
    expect(result.prompt).toBe(FULL_PROMPT);
    expect(result.referenceContent).toBe("");
    expect(result.tokensSaved).toBe(0);
  });

  it("filters Tier 2 sections for 'standard' tier", () => {
    const result = applyPromptTier(FULL_PROMPT, "standard");
    // Tier 0 sections should be present
    expect(result.prompt).toContain("You are a personal assistant");
    expect(result.prompt).toContain("## Safety");
    expect(result.prompt).toContain("## Workspace");
    expect(result.prompt).toContain("## Runtime");

    // Tier 1 sections should be present
    expect(result.prompt).toContain("## Tooling");
    expect(result.prompt).toContain("## Skills");
    expect(result.prompt).toContain("## Memory Recall");

    // Tier 2 sections should be removed
    expect(result.prompt).not.toContain("## OpenWolf CLI Quick Reference");
    expect(result.prompt).not.toContain("## Silent Replies");
    expect(result.prompt).not.toContain("## Heartbeats");
    expect(result.prompt).not.toContain("## Documentation");

    expect(result.tokensSaved).toBeGreaterThan(0);
  });

  it("filters Tier 1 and Tier 2 sections for 'compact' tier", () => {
    const result = applyPromptTier(FULL_PROMPT, "compact");
    // Tier 0 should be present
    expect(result.prompt).toContain("You are a personal assistant");
    expect(result.prompt).toContain("## Safety");
    expect(result.prompt).toContain("## Workspace");
    expect(result.prompt).toContain("## Runtime");

    // Tier 1 should be removed
    expect(result.prompt).not.toContain("## Tooling");
    expect(result.prompt).not.toContain("## Skills");

    // Tier 2 should be removed
    expect(result.prompt).not.toContain("## Silent Replies");

    expect(result.tokensSaved).toBeGreaterThan(0);
  });

  it("preserves reference content from filtered sections", () => {
    const result = applyPromptTier(FULL_PROMPT, "standard");
    expect(result.referenceContent).toContain("CLI Quick Reference");
    expect(result.referenceContent).toContain("Silent Replies");
  });
});

describe("buildPromptReference", () => {
  it("returns empty for empty content", () => {
    expect(buildPromptReference("")).toBe("");
    expect(buildPromptReference("  ")).toBe("");
  });

  it("builds reference with header", () => {
    const ref = buildPromptReference("## Some Section\nSome content");
    expect(ref).toContain("# OpenWolf Prompt Reference");
    expect(ref).toContain("## Some Section");
    expect(ref).toContain("Some content");
  });
});

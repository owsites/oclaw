import { describe, expect, it } from "vitest";
import {
  addConstraint,
  addDecision,
  addFact,
  createEmptyWorkingMemory,
  estimateWorkingMemoryTokens,
  removeFact,
  serializeWorkingMemory,
  trackToolUsage,
} from "./working-memory.js";

describe("working-memory", () => {
  it("creates empty working memory", () => {
    const mem = createEmptyWorkingMemory();
    expect(mem.turnCount).toBe(0);
    expect(mem.keyFacts).toEqual([]);
    expect(mem.recentDecisions).toEqual([]);
    expect(mem.activeConstraints).toEqual([]);
    expect(mem.toolsUsedThisSession).toEqual([]);
  });

  it("adds facts with deduplication", () => {
    const mem = createEmptyWorkingMemory();
    addFact(mem, "The API uses REST", 10);
    addFact(mem, "The API uses REST", 10); // duplicate
    addFact(mem, "The database is PostgreSQL", 10);
    expect(mem.keyFacts).toHaveLength(2);
  });

  it("enforces max facts limit", () => {
    const mem = createEmptyWorkingMemory();
    for (let i = 0; i < 15; i++) {
      addFact(mem, `Fact ${i}`, 10);
    }
    expect(mem.keyFacts).toHaveLength(10);
    // Should keep the most recent facts
    expect(mem.keyFacts[0]).toBe("Fact 5");
  });

  it("adds decisions with deduplication", () => {
    const mem = createEmptyWorkingMemory();
    addDecision(mem, "Use TypeScript", 5);
    addDecision(mem, "Use TypeScript", 5);
    addDecision(mem, "Use React for frontend", 5);
    expect(mem.recentDecisions).toHaveLength(2);
  });

  it("adds constraints with deduplication", () => {
    const mem = createEmptyWorkingMemory();
    addConstraint(mem, "Must use Node 22+", 5);
    addConstraint(mem, "Must use Node 22+", 5);
    expect(mem.activeConstraints).toHaveLength(1);
  });

  it("removes facts by substring", () => {
    const mem = createEmptyWorkingMemory();
    addFact(mem, "The API uses REST", 10);
    addFact(mem, "The database is PostgreSQL", 10);
    removeFact(mem, "REST");
    expect(mem.keyFacts).toHaveLength(1);
    expect(mem.keyFacts[0]).toBe("The database is PostgreSQL");
  });

  it("tracks tool usage", () => {
    const mem = createEmptyWorkingMemory();
    trackToolUsage(mem, "exec");
    trackToolUsage(mem, "read");
    trackToolUsage(mem, "exec"); // duplicate
    expect(mem.toolsUsedThisSession).toEqual(["exec", "read"]);
  });

  it("serializes to compact text block", () => {
    const mem = createEmptyWorkingMemory();
    mem.sessionSummary = "Building a REST API";
    mem.currentTask = "Implementing user auth";
    addFact(mem, "Uses Express.js", 10);
    addDecision(mem, "Use JWT tokens", 5);
    mem.turnCount = 5;

    const serialized = serializeWorkingMemory(mem);
    expect(serialized).toContain("<working_memory>");
    expect(serialized).toContain("</working_memory>");
    expect(serialized).toContain("Summary: Building a REST API");
    expect(serialized).toContain("Task: Implementing user auth");
    expect(serialized).toContain("Uses Express.js");
    expect(serialized).toContain("JWT tokens");
    expect(serialized).toContain("Turn: 5");
  });

  it("estimates token count", () => {
    const mem = createEmptyWorkingMemory();
    mem.sessionSummary = "Building a REST API";
    const tokens = estimateWorkingMemoryTokens(mem);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(200);
  });

  it("ignores empty strings", () => {
    const mem = createEmptyWorkingMemory();
    addFact(mem, "", 10);
    addFact(mem, "  ", 10);
    addDecision(mem, "", 5);
    addConstraint(mem, "", 5);
    trackToolUsage(mem, "");
    expect(mem.keyFacts).toHaveLength(0);
    expect(mem.recentDecisions).toHaveLength(0);
    expect(mem.activeConstraints).toHaveLength(0);
    expect(mem.toolsUsedThisSession).toHaveLength(0);
  });
});

# OpenClaw Context Optimization Plan

## Pragmatic Token Reduction for the OpenClaw Agent System

---

## Part I: Current Architecture Diagnosis

### 1. How Context Is Built Today

OpenClaw is a multi-channel AI gateway built in TypeScript (ESM). On every turn, the system:

1. **Receives** a message via channel (Telegram, Discord, Signal, WhatsApp, Web, etc.)
2. **Routes** through `src/auto-reply/` to the embedded Pi agent runner
3. **Builds system prompt** via `buildAgentSystemPrompt()` in `src/agents/system-prompt.ts` (lines 168-638)
4. **Loads bootstrap files** via `resolveBootstrapContextForRun()` — SOUL.md, MEMORY.md, workspace notes — injected verbatim into "Project Context"
5. **Assembles full session history** from the JSONL transcript as a flat message array
6. **Attaches all tool schemas** — full JSON schemas for 25+ tools regardless of relevance
7. **Calls LLM** through `@mariozechner/pi-coding-agent` SDK with the entire payload
8. **Compacts reactively** only when context overflows, via `compaction.ts` chunk-then-summarize

### 2. Measured Token Hotspots

These are the actual locations where tokens are consumed, based on code inspection:

| Hotspot | Source File | Estimated Cost | Evidence |
|---------|------------|----------------|----------|
| **System prompt** | `system-prompt.ts:400-638` | 2,000-4,000 tok/turn | 638-line function builds ~20 sections; includes CLI reference, messaging rules, reaction guidance, voice hints, heartbeat config, silent reply rules, sandbox info, model aliases, docs paths — all sent every call |
| **Bootstrap context files** | `bootstrap.ts:187-239` | Variable, up to 150K chars (DEFAULT_BOOTSTRAP_TOTAL_MAX_CHARS) | `buildBootstrapContextFiles()` injects files with per-file 20K char limit and 150K total limit. SOUL.md, MEMORY.md, workspace notes go in verbatim |
| **Session history** | `compact.ts:574-587` | Grows unbounded until compaction | `limitHistoryTurns()` applies hard cutoff but no importance weighting. Full message array passed to `session.agent.replaceMessages()` |
| **Tool schemas** | `pi-tools.ts` + `pi-tool-definition-adapter.ts` | 500-1,500 tok/turn | `createOpenClawCodingTools()` creates all tools; full JSON schemas for read, write, edit, apply_patch, grep, find, ls, exec, process, web_search, web_fetch, browser, canvas, nodes, cron, message, gateway, sessions_*, subagents, session_status, image |
| **Compaction cost** | `compaction.ts:142-309` | 1-3 LLM calls when triggered | `summarizeInStages()` splits by token share, summarizes each chunk, then merges summaries — each step is a separate LLM call |
| **Memory search results** | memory tools | 200-600 tok/search | Raw text snippets returned without compression |

### 3. Specific Weaknesses in Current Code

**3a. History is flat and unweighted** (`history.ts:15-36`)
`limitHistoryTurns()` counts user messages backwards and slices. A greeting from 40 turns ago costs the same tokens as a critical decision from 2 turns ago. There's no recency weighting, no importance scoring, no selective retention.

**3b. Compaction is reactive and lossy** (`compaction.ts:248-309`)
`summarizeInStages()` only runs after context overflow. It splits messages by token share (not semantic boundaries), summarizes each chunk independently (losing cross-chunk references), then merges summaries (further lossy compression). Decisions, code snippets, and user preferences get flattened into generic prose.

**3c. System prompt is monolithic** (`system-prompt.ts:400-638`)
Every turn rebuilds the same prompt. Sections like Safety (lines 371-377), CLI Quick Reference (lines 438-445), Messaging (lines 98-137), Silent Replies (lines 601-615), and Heartbeats (lines 619-628) are identical across turns but consume thousands of tokens repeatedly. The only variation is `promptMode` ("full" vs "minimal" vs "none"), which is a coarse toggle.

**3d. All tool schemas sent unconditionally** (`system-prompt.ts:224-317`)
The `coreToolSummaries` object maps 23 tool names to descriptions. All enabled tools are listed in the system prompt every turn. The full JSON schemas (from `pi-tool-definition-adapter.ts`) are also sent to the LLM API. When a user asks "what time is it?", the LLM still receives schemas for `apply_patch`, `browser`, `canvas`, `nodes`, `cron`, `gateway`, etc.

**3e. Bootstrap files have size limits but no relevance filtering** (`bootstrap.ts:187-239`)
`buildBootstrapContextFiles()` respects `maxChars` (20K default) and `totalMaxChars` (150K default), and truncates with head+tail when files are too large. But it always injects all bootstrap files regardless of whether the current message relates to them.

---

## Part II: What We're Actually Building

No neuroscience metaphors. Each component is defined by its inputs, transformations, outputs, and decision criteria.

### Architecture Overview

```
                    +---------------------------+
                    |    CONTEXT ASSEMBLER       |
                    |    (Replaces monolithic    |
                    |     prompt builder)        |
                    +---------------------------+
                       /     |      \
                      /      |       \
              +------+  +----+----+  +----------+
              |Prompt |  |History  |  |Tool      |
              |Tiers  |  |Manager  |  |Selector  |
              +------+  +---------+  +----------+
                           |
              +---------------------------+
              |   TWO-TIER MEMORY         |
              |                           |
              | [Working Memory]          |
              |   In-session state,       |
              |   recent decisions,       |
              |   active constraints      |
              |                           |
              | [Reference Memory]        |
              |   Compressed project      |
              |   knowledge, user prefs,  |
              |   tool patterns           |
              +---------------------------+
                           |
              +---------------------------+
              |   CONSOLIDATION ENGINE    |
              |                           |
              | - Heuristic rules (free)  |
              | - Embedding retrieval     |
              |   (moderate cost)         |
              | - Cheap model summary     |
              |   (optional, explicit $)  |
              +---------------------------+
```

### Component 1: Tiered System Prompt

**Input**: `PromptMode`, channel config, sandbox config, tool list, context files
**Transformation**: Classify each section into tiers by how often it's needed
**Output**: A smaller system prompt where rarely-needed sections are omitted by default
**Decision criteria**: Section is Tier 0 if needed every turn; Tier 1 if needed based on channel/mode; Tier 2 if only needed when the agent encounters specific situations (and can retrieve it then)

**Tier 0 — Always present (~300 tokens):**
- Identity line
- Safety rules (lines 371-377 compressed to essentials)
- Workspace directory + guidance
- Runtime line (model, channel, thinking level)

**Tier 1 — Conditional, included when applicable (~200-800 tokens):**
- Tool summaries for **enabled** tools (the one-line descriptions at lines 224-252, not full schemas)
- Tool call style guidance (lines 431-435)
- Messaging rules (only if `message` tool is available)
- Sandbox info (only if sandbox is enabled)
- Reaction guidance (only if reactions are configured)
- Reasoning format (only if reasoning tags are needed)
- Skills section (only if skills are loaded)

**Tier 2 — Omitted from prompt, available via tools/memory:**
- CLI Quick Reference (lines 438-445) — the agent can `read` docs if needed
- OpenClaw Self-Update instructions (lines 450-458)
- Model Aliases (lines 462-471)
- Voice/TTS hints (only ~10% of sessions use TTS)
- Heartbeat protocol (only relevant for heartbeat polls)
- Silent reply rules (can be taught once and remembered)
- Docs section with URLs (lines 150-165)

**What this changes in code**: Refactor `buildAgentSystemPrompt()` to accept a `tierLevel` parameter. Default to Tier 0+1. Tier 2 content moves to a retrievable reference that the agent can access via `read` or a new lightweight tool.

**Estimated savings**: Current full prompt is ~2,000-4,000 tokens. Tier 0+1 is ~500-1,100 tokens. Savings: **~1,000-3,000 tokens per turn**. This is conservative — it depends on how many Tier 1 sections apply for a given session.

### Component 2: Tool Group Selector

**Input**: User message text, session history (last 2 turns), list of available tools
**Transformation**: Classify the user's intent into a tool group; filter tool schemas to that group + a core set
**Output**: Reduced tool schema list sent to LLM API
**Decision criteria**: Deterministic keyword/pattern matching, not LLM inference

**Tool groups** (defined as a static map):

| Group | Trigger Keywords/Patterns | Tools |
|-------|--------------------------|-------|
| **Core** (always included) | — | read, write, edit, exec, ls |
| **File Operations** | "file", "create", "delete", "move", "rename", "patch", "diff" | apply_patch, grep, find |
| **Research** | "search", "find", "look up", "what is", "how to", URL patterns | web_search, web_fetch, grep, find |
| **Git/Code** | "commit", "push", "pull", "branch", "git", "deploy" | exec, grep, find |
| **Messaging** | "send", "message", "tell", "notify", reply context from group chat | message, sessions_send, sessions_list |
| **Orchestration** | "spawn", "agent", "sub-agent", "background", "cron", "schedule", "remind" | sessions_spawn, subagents, agents_list, sessions_list, sessions_history, cron |
| **Browser** | "browse", "open", "screenshot", "page", URL patterns | browser, web_fetch |
| **Media** | "image", "photo", "picture", "canvas", "draw" | image, canvas |
| **System** | "status", "update", "config", "restart", "gateway" | gateway, session_status |
| **Nodes** | "node", "camera", "screen", "device" | nodes |

**Algorithm**:
```
1. Scan user message for trigger keywords (case-insensitive, word-boundary matching)
2. Collect all matching groups
3. If no groups match, include Core + File Operations + Research (safe default)
4. Union all tools from matched groups + Core
5. If more than 12 tools selected, keep all (diminishing returns on further filtering)
6. Filter available tool schemas to only selected tools
```

**Fallback**: If the LLM requests a tool that wasn't included in the schema set, this is a signal the selector was wrong. Log the miss, include the missing tool schema in a retry, and add the pattern to the group mapping. Over time, the selector improves.

**What this changes in code**: New function `selectToolsForTurn()` called in `compact.ts`/`run.ts` before `createOpenClawCodingTools()` or at the `splitSdkTools()` stage. The function filters the tools array before it's passed to the agent session.

**Estimated savings**: Currently 25+ full tool schemas. Typical turn needs 5-8. JSON schemas average ~60-80 tokens each. Removing 15-20 irrelevant schemas saves **~900-1,600 tokens per turn**.

### Component 3: Sliding Window with Recency Weighting

**Input**: Full session history (message array from SessionManager)
**Transformation**: Replace the flat `limitHistoryTurns()` with a weighted window
**Output**: A shorter message array where old turns are summarized and recent turns are preserved verbatim
**Decision criteria**: Recency-based tiers, not a flat cutoff

**Algorithm**:
```
Given N messages in session history and a token budget B:

1. RECENT window (last 3 user turns + responses): Include verbatim. These are the
   active context the LLM needs for coherence.

2. MIDDLE window (turns 4-10 back): Include only the user message + first sentence
   of assistant response + any tool calls that produced results. Strip verbose tool
   outputs (keep only tool name + truncated result summary).

3. OLD window (turns 11+): Drop entirely from context. They're already in the
   session transcript on disk and can be retrieved via memory_search if needed.

4. If a compaction summary exists from a previous compaction, prepend it as the
   first message (preserving existing behavior).

5. Token budget check: After applying the window, estimate tokens. If still over
   budget, progressively shrink MIDDLE window (remove oldest MIDDLE turns first).
```

**What this changes in code**: Replace `limitHistoryTurns()` in `history.ts` with `buildWeightedHistory()`. Called at the same point in `compact.ts:574-587` where `limitHistoryTurns()` is currently called. The existing compaction system remains as the emergency fallback if the weighted window still overflows.

**Estimated savings**: A 20-turn session currently sends all 20 turns (~8,000-15,000 tokens of history). With the sliding window, we send ~3 full turns + ~4 compressed turns + 0 old turns. Estimated: **~3,000-8,000 tokens saved per turn in mid-to-long sessions**.

### Component 4: Two-Tier Memory

Instead of four memory tiers (episodic, semantic, procedural, predictive), start with two:

**Working Memory** — Session-scoped, in-memory state:
```typescript
interface WorkingMemory {
  currentTask: string | null;           // extracted from last user message
  recentDecisions: string[];            // last 5 decisions (from assistant responses)
  activeConstraints: string[];          // extracted "don't", "must", "always" patterns
  toolsUsedThisSession: Set<string>;    // for tool group prediction
  turnCount: number;
}
```
This is cheap — it's a plain object updated after each turn via pattern matching. No LLM cost. Injected as a structured block at the top of context, replacing the need to re-read entire conversation history.

**Reference Memory** — Persistent, SQLite-backed:
This is the existing `src/memory/` infrastructure (vector embeddings + hybrid search). No new tables needed. The change is in *when* and *how* it's queried:
- Currently: the agent decides when to call `memory_search` (reactive)
- New: the system proactively retrieves the top-3 most relevant memory chunks based on the user's message embedding and injects them into context (if they score above a relevance threshold)
- The agent can still call `memory_search` explicitly for deeper retrieval

**What this changes in code**:
- New `src/agents/context/working-memory.ts` — maintains session state, updated after each turn
- Modify the context assembly in `compact.ts` / `run.ts` to inject working memory as a structured block
- Add proactive memory retrieval in the context assembly path (embed user message, query existing memory store, inject top results if above threshold)

**Estimated savings**: Working memory replaces the need to include old turns for context continuity. Combined with Component 3 (sliding window), the redundancy between "full history for context" and "working memory state" is eliminated. Additional savings from proactive retrieval: **~500-1,000 tokens** (the agent makes fewer explicit `memory_search` calls, reducing tool call overhead).

### Component 5: Consolidation Between Turns

**What it does**: After each turn completes, extract structured data from the turn and update working memory. This is local computation — no LLM calls.

**Mechanism** (explicitly addressing the "no free lunch" concern):

**Tier 1 — Heuristic rules (free, always on):**
- Keep last N tool results, drop duplicates (e.g., multiple `read` calls to the same file → keep latest)
- Compress repeated patterns (e.g., "user asked about file X" 3 times → single entry)
- Extract decisions from assistant response via regex: patterns like "I'll", "Let's", "decided to", "going with"
- Track tools used per session (for tool group prediction)
- Truncate tool results to first 200 chars (the full result is in the transcript on disk)

**Tier 2 — Embedding-based retrieval (moderate cost, opt-in):**
- When proactive memory retrieval is enabled, compute embedding for each user message
- Use existing `src/memory/embeddings.ts` infrastructure — this is already built
- Cost: one embedding API call per turn (~$0.0001 with ada-002 or free with local model)
- Retrieve top-3 chunks from reference memory, inject if similarity > threshold

**Tier 3 — Cheap model summarization (explicit cost, opt-in):**
- Every N turns (configurable, default 20), run a cheap model (Haiku or local) to summarize the accumulated working memory into a compressed block
- This replaces the current compaction's emergency summarization with a planned, periodic one
- Cost: ~$0.001-0.005 per summarization call
- Stored as a "session summary" that prepends to context on future turns

**What this changes in code**: New post-turn hook in `pi-embedded-subscribe.ts` that calls `consolidateAfterTurn()`. The function updates the WorkingMemory object and optionally triggers embedding computation and periodic summarization.

---

## Part III: Failure Modes and Degradation Strategy

Each component has an explicit fallback for when it makes a wrong decision:

### Tool Selector Misses

**Failure**: LLM tries to call a tool that wasn't included in the filtered schema set.
**Detection**: The SDK will report a tool call for an unknown tool name.
**Recovery**:
1. Log the miss with the user message that caused it
2. Re-run the turn with the missing tool added to the schema set
3. Add the trigger pattern to the tool group mapping for future turns
**Degradation**: First miss costs one retry. Subsequent misses for the same pattern don't recur.

### Sliding Window Loses Critical Context

**Failure**: The LLM's response indicates it's missing context ("I don't have information about X", "Could you remind me...").
**Detection**: Pattern match on the LLM response for uncertainty/missing-context signals.
**Recovery**:
1. Expand the MIDDLE window for the next turn (include 5 more turns from history)
2. Trigger a proactive memory search for the topic mentioned in the uncertainty signal
3. If the context was in OLD turns, it should already be in the session transcript — inject the relevant turns back
**Degradation**: Graceful — the window expands temporarily, then contracts again when the context gap is resolved.

### Compaction Summary Loses Detail

**Failure**: A periodic summarization loses a critical detail that the user later asks about.
**Detection**: The agent can't answer a question that it previously had context for.
**Recovery**: The full session transcript (JSONL) is never modified. The `memory_search` tool can still retrieve the original content. The summarization is additive — it creates a summary that's *prepended* to context, but the original data remains on disk.
**Degradation**: Worst case, the agent has to do an explicit `memory_search` or `read` of the session transcript. This costs a tool call round-trip but doesn't lose data.

### Heuristic Consolidation Extracts Wrong Decisions

**Failure**: The regex-based decision extractor misidentifies a conditional statement as a decision (e.g., "I'll do X if you want" tagged as decided).
**Detection**: Hard to detect automatically. The working memory will contain a false decision.
**Mitigation**: Working memory decisions have a max TTL (cleared after 10 turns of not being referenced). The LLM receives the full RECENT window verbatim, so it has ground truth for the last 3 turns. False decisions in working memory can only mislead context for messages referencing turns 4+ back.
**Degradation**: Low impact — the LLM's own judgment takes precedence over working memory hints.

---

## Part IV: Implementation Roadmap

### Phase 1: System Prompt Compression + Tool Selection

**Changes to existing files:**
- `src/agents/system-prompt.ts` — Refactor `buildAgentSystemPrompt()` to support tier-based section inclusion. Add `PromptTier` parameter ("compact" | "standard" | "full"). Default to "compact" for normal turns, "standard" for first turn of session, "full" for diagnostic mode.
- `src/agents/system-prompt.ts` — Move Tier 2 content (CLI reference, self-update, model aliases, docs URLs, heartbeat, silent replies) into a separate retrievable block stored as a bootstrap file or internal reference.

**New files:**
- `src/agents/context/tool-groups.ts` — Static tool group definitions + `selectToolsForTurn(userMessage, sessionHistory, availableTools)` function. ~150 lines.

**Integration point:** The tool filtering happens in `compact.ts` after `createOpenClawCodingTools()` and before `splitSdkTools()`. The tool array is filtered to include only relevant tools.

**What to measure (baselines needed before starting):**
- Token count of system prompt per turn across 50+ sessions (log `estimateTokens()` on the system prompt string)
- Token count of tool schemas per turn (log `estimateTokens()` on the serialized tool definitions)
- Compaction frequency (how often `compactEmbeddedPiSessionDirect()` is called)
- Session length in turns before first compaction

**Target (based on measured baselines):** 35-45% reduction in per-turn system prompt + tool schema tokens. Exact number depends on baseline measurement.

### Phase 2: Sliding Window + Working Memory

**Changes to existing files:**
- `src/agents/pi-embedded-runner/history.ts` — Add `buildWeightedHistory()` alongside existing `limitHistoryTurns()`. The existing function remains as fallback.
- `src/agents/pi-embedded-runner/compact.ts` (lines 574-587) — Replace the `limitHistoryTurns()` call with `buildWeightedHistory()` when the feature is enabled.

**New files:**
- `src/agents/context/working-memory.ts` — WorkingMemory class. ~200 lines. Updated after each turn via heuristic extraction from the completed turn.
- `src/agents/context/turn-extractor.ts` — Functions to extract decisions, constraints, and topics from a completed turn. ~150 lines. Pure regex/pattern matching, no LLM.

**Integration point:** Working memory is initialized when a session starts (from the session transcript if it exists), updated after each turn in the post-turn path (after `flushPendingToolResultsAfterIdle()` in `compact.ts:696`), and injected as a structured block in the context assembly.

**What to measure:**
- Token count of session history per turn (baseline vs. weighted window)
- Compaction frequency (should decrease significantly)
- Task completion rate (should stay the same or improve)
- Tool selector miss rate (from Phase 1 logging)

**Target:** Cumulative 55-65% reduction in total context tokens vs. pre-Phase-1 baseline.

### Phase 3: Adaptive Context Manager

**Changes to existing files:**
- `src/agents/pi-embedded-runner/compact.ts` — Replace the static context assembly with an adaptive manager that adjusts based on task type and available budget.

**New files:**
- `src/agents/context/context-manager.ts` — Central coordinator. Takes the working memory, reference memory results, weighted history, and tool schemas, then assembles the final context within a token budget. ~300 lines.
- `src/agents/context/proactive-retrieval.ts` — Embeds the user message and queries reference memory. Injects top results if relevant. ~100 lines. Uses existing embedding infrastructure.

**What makes this different from Phases 1-2:** Phases 1-2 are independent optimizations. Phase 3 makes them work together. The context manager dynamically allocates token budget between system prompt, tools, history, working memory, and proactive retrieval based on what the current turn needs. If the user is asking a simple question, more budget goes to working memory and less to tool schemas. If the user is doing complex file editing, more budget goes to tools and recent history.

**Recovery mechanisms:**
- If the LLM signals missing context → expand history window next turn
- If tool selector misses → include missing tool + log for pattern improvement
- If summary is stale → trigger fresh summarization before next turn

**Target:** Cumulative 65-75% reduction in total context tokens. Higher context relevance (measured as: percentage of injected tokens that the LLM actually references in its response — logged and measured).

**No Phase 4.** If Phases 1-3 deliver the measured targets, the system is done. If they don't, the right response is to debug and improve the concrete mechanisms, not to add another abstraction layer on top.

---

## Part V: Configuration

All features are behind config flags in the existing `openclaw config` system:

```yaml
agents:
  defaults:
    context:
      enabled: true                         # Master toggle for new context system
      promptTier: "compact"                 # "compact" | "standard" | "full"
      toolSelection:
        enabled: true                       # Group-based tool filtering
        alwaysInclude: ["read", "write", "edit", "exec", "ls"]  # Core tools
        maxTools: 12                        # Upper bound before filtering stops
      history:
        recentWindow: 3                     # Full turns to keep verbatim
        middleWindow: 7                     # Compressed turns to keep
        middleTruncateChars: 200            # Max chars per middle-window message
      workingMemory:
        enabled: true
        maxDecisions: 5                     # Recent decisions to track
        decisionTtlTurns: 10               # Clear after N turns unreferenced
      consolidation:
        heuristic: true                     # Free pattern-matching extraction
        embeddingRetrieval: true            # Proactive memory search per turn
        periodicSummary:
          enabled: false                    # Opt-in cheap-model summarization
          everyNTurns: 20
          model: "haiku"                    # Model for periodic summarization
      fallback:
        expandOnUncertainty: true           # Auto-expand window on missing context
        retryOnToolMiss: true               # Retry with missing tool on selector miss
```

**Backward compatibility:**
- `context.enabled: false` → current behavior, no changes
- Each sub-feature can be toggled independently
- Existing compaction (`compaction.ts`) remains as emergency fallback even when new system is active

---

## Part VI: Migration Strategy

### Rollout

1. **Instrument first**: Before any code changes, add token logging to measure baselines across system prompt, tool schemas, session history, and total context per turn. Run for 1-2 weeks across real sessions.
2. **Phase 1 ships as opt-in**: `context.enabled: true` enables tiered prompt + tool selection. Measure delta against baselines.
3. **Phase 2 ships after Phase 1 is validated**: Sliding window + working memory activate together. Measure again.
4. **Phase 3 ships after Phase 2 is validated**: Adaptive manager coordinates all components.

### Data Safety

- Session JSONL files are never modified destructively
- Working memory is ephemeral (in-memory per session, reconstructed from transcript on restart)
- No new database tables required for Phases 1-2
- Phase 3's proactive retrieval uses the existing memory store — no schema changes

### Rollback

- Any feature can be disabled via config without data loss
- The existing compaction system (`compaction.ts`, `summarizeInStages()`) continues to function as the emergency overflow handler regardless of whether the new system is active

---

## Part VII: File Structure

```
src/agents/context/
  index.ts                    # Public API
  tool-groups.ts              # Static tool group definitions + selectToolsForTurn()
  working-memory.ts           # WorkingMemory class (session-scoped state)
  turn-extractor.ts           # Heuristic extraction (decisions, constraints, topics)
  weighted-history.ts         # buildWeightedHistory() (replaces limitHistoryTurns)
  context-manager.ts          # Phase 3: adaptive context assembly coordinator
  proactive-retrieval.ts      # Phase 3: embedding-based proactive memory injection
  types.ts                    # Shared type definitions
```

Changes to existing files:
- `src/agents/system-prompt.ts` — add tier support, move Tier 2 sections out
- `src/agents/pi-embedded-runner/history.ts` — add `buildWeightedHistory()`
- `src/agents/pi-embedded-runner/compact.ts` — integrate new components at existing hook points

---

## Part VIII: Honest Projections

### What We Can Estimate

| Optimization | Mechanism | Savings Estimate | Confidence |
|-------------|-----------|-----------------|------------|
| System prompt tiering | Remove Tier 2 sections (~15 sections → ~8 sections) | 1,000-3,000 tok/turn | High — this is just removing text |
| Tool schema filtering | 25 tools → 5-8 relevant tools | 900-1,600 tok/turn | Medium — depends on schema sizes, needs measurement |
| Sliding window history | Last 3 full + 7 compressed + 0 old vs. all turns | 3,000-8,000 tok/turn (sessions with 10+ turns) | Medium — varies by session length |
| Working memory injection | Small structured block vs. re-reading full history | 500-1,000 tok/turn (indirect, reduces tool calls) | Low — hard to measure precisely |

### What We Don't Know Yet

- **Actual token counts per component**: We need instrumentation before we can set targets. The estimates above are based on code inspection and character-to-token ratios, not measured data.
- **Impact on task completion**: Removing context could degrade quality. We need A/B testing or at minimum regression testing against a set of representative tasks.
- **Compaction interaction**: The sliding window should reduce compaction frequency, but by how much depends on session length distributions we haven't measured.
- **Tool selector accuracy**: The keyword-based approach will have false negatives. We won't know the miss rate until we measure it in production.

### Targets (to be revised after baseline measurement)

- Phase 1: 30-40% reduction in system prompt + tool schema tokens
- Phase 2: 50-60% reduction in total context tokens for sessions > 10 turns
- Phase 3: 60-70% reduction in total context tokens with improved relevance
- All phases: zero regression in task completion rate on representative test sessions

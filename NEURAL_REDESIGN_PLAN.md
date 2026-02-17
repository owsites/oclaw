# OpenClaw Context Optimization Plan v3

## Self-Correcting Context Management for the OpenClaw Agent System

Informed by analysis of MemGPT/Letta, Mem0, AutoGen, CrewAI, Claude Code, Reflexion, CRITIC, Voyager, and LangGraph.

---

## Part I: Current Architecture Diagnosis

### 1. How Context Is Built Today

OpenClaw is a multi-channel AI gateway built in TypeScript (ESM). On every turn:

1. **Receives** a message via channel (Telegram, Discord, Signal, WhatsApp, Web, etc.)
2. **Routes** through `src/auto-reply/` to the embedded Pi agent runner
3. **Builds system prompt** via `buildAgentSystemPrompt()` in `src/agents/system-prompt.ts` (lines 168-638)
4. **Loads bootstrap files** via `resolveBootstrapContextForRun()` — SOUL.md, MEMORY.md, workspace notes — injected verbatim into "Project Context"
5. **Assembles full session history** from the JSONL transcript as a flat message array
6. **Attaches all tool schemas** — full JSON schemas for 25+ tools regardless of relevance
7. **Calls LLM** through `@mariozechner/pi-coding-agent` SDK with the entire payload
8. **Compacts reactively** only when context overflows, via `compaction.ts` chunk-then-summarize

### 2. Token Hotspots

| Hotspot | Source File | Estimated Cost | Evidence |
|---------|------------|----------------|----------|
| **System prompt** | `system-prompt.ts:400-638` | 2,000-4,000 tok/turn | 638-line function builds ~20 sections; includes CLI reference, messaging rules, reaction guidance, voice hints, heartbeat config, silent reply rules, sandbox info, model aliases, docs paths — all sent every call |
| **Bootstrap context files** | `bootstrap.ts:187-239` | Variable, up to 150K chars | `buildBootstrapContextFiles()` injects with per-file 20K char limit and 150K total. SOUL.md, MEMORY.md, workspace notes go in verbatim |
| **Session history** | `compact.ts:574-587` | Grows unbounded until compaction | `limitHistoryTurns()` applies hard cutoff but no importance weighting |
| **Tool schemas** | `pi-tools.ts` + `pi-tool-definition-adapter.ts` | 500-1,500 tok/turn | Full JSON schemas for 25+ tools every call |
| **Compaction cost** | `compaction.ts:142-309` | 1-3 LLM calls when triggered | `summarizeInStages()` splits by token share, summarizes chunks, merges summaries |
| **Stale tool results** | session transcript | Unbounded | Completed tool calls from 20 turns ago sit in history at full size |

### 3. What Competing Systems Do Better

| System | Key Insight for OpenClaw | Evidence |
|--------|------------------------|----------|
| **MemGPT/Letta** | Memory pressure warnings at 70% capacity — proactive, not just reactive at 100%. Core memory blocks the agent can self-edit. FIFO queue with recursive summary at position [0]. | 93.4% accuracy on Deep Memory Retrieval benchmark |
| **Claude Code** | Context editing (clearing stale tool call results) gave **84% token reduction** and **29% performance improvement** — bigger gain than summarization. | Anthropic engineering blog, September 2025 |
| **Mem0** | Extract-and-store facts with LLM-decided ADD/UPDATE/DELETE/NOOP. Selective retrieval of concise facts instead of full history. | 90% token reduction, 91% lower p95 latency on LOCOMO benchmark |
| **AutoGen** | TransformMessages pipeline — composable transforms applied before LLM. LLMLingua BERT-based compression as alternative to LLM summarization. | MessageTokenLimiter: 4,019 → 215 tokens in example |
| **LangGraph** | Per-node retry with exponential backoff + checkpoint-based state rollback + time travel to any previous state. | Production framework, used by LangChain deep agents |
| **Reflexion** | Verbal reflections stored in sliding window memory, used in next trial. External evaluator provides ground truth. | +22% on AlfWorld, 91% on HumanEval |
| **CRITIC** | External tools (search, code interpreter) verify LLM output. Self-correction without external feedback doesn't work (Huang et al., ICLR 2024). | +16 pts on TabMWP (70B model). Removing tools caused -1.8pt regression |
| **Voyager** | 3-layer error detection: execution errors + environment state diff + LLM critic. Max 4 attempts then abandon. | 3.3x unique items, only agent to reach diamond tools |

### 4. The Critical Research Finding

Huang et al. (ICLR 2024, "Large Language Models Cannot Self-Correct Reasoning Yet"): **LLMs cannot reliably self-correct without external feedback**. When asked to critique their own outputs, they often change correct answers to incorrect ones. Every successful self-correcting system uses external signals — test results, search engines, code interpreters, environment feedback — not LLM self-judgment.

This means our self-correction system must be built on **observable signals** (token counts, tool call success/failure, response pattern matching, session transcript diffs), not on asking the LLM "did you do a good job?"

---

## Part II: Architecture

### Design Principles (Stolen From the Best)

1. **From Claude Code**: Clear stale tool results first — it's the single highest-ROI change
2. **From MemGPT**: Memory pressure warnings before overflow, not just reactive compaction
3. **From AutoGen**: Composable transform pipeline — each optimization is an independent transform
4. **From Mem0**: Extract and curate facts, don't just summarize
5. **From CRITIC/Voyager**: Self-correction via external signals, not LLM self-judgment
6. **From LangGraph**: Retry with backoff + checkpoint rollback, not just "try again"

### Architecture Overview

```
User Message
     |
     v
+--------------------------------------------+
|         CONTEXT TRANSFORM PIPELINE          |  <- AutoGen-inspired composable transforms
|                                             |
|  [1. Stale Tool Result Cleaner]             |  <- Claude Code's biggest win (84% savings)
|  [2. Tool Group Selector]                   |  <- Deterministic keyword matching
|  [3. Weighted History Window]               |  <- RECENT/MIDDLE/OLD tiers
|  [4. Working Memory Injector]               |  <- MemGPT-inspired core memory block
|  [5. Tiered Prompt Builder]                 |  <- Only include what's needed this turn
|  [6. Token Budget Enforcer]                 |  <- Hard ceiling, progressive shedding
|                                             |
+--------------------------------------------+
     |
     v
+--------------------------------------------+
|              LLM API CALL                   |
+--------------------------------------------+
     |
     v
+--------------------------------------------+
|         SELF-CORRECTION LAYER               |  <- CRITIC/Voyager/LangGraph-inspired
|                                             |
|  [1. Tool Call Validator]                   |  <- Did the tool exist? Did it succeed?
|  [2. Context Loss Detector]                 |  <- Does response signal missing info?
|  [3. Loop Detector]                         |  <- Is the agent repeating itself?
|  [4. Working Memory Updater]                |  <- Extract decisions, update state
|  [5. Memory Pressure Monitor]               |  <- MemGPT-style proactive warning
|                                             |
+--------------------------------------------+
     |
     v
Session Transcript (JSONL, never modified destructively)
```

---

## Part III: The Context Transform Pipeline

Each transform is an independent function. They compose in order. Any can be disabled via config. This is directly inspired by AutoGen's `TransformMessages` architecture — the cleanest design in the field.

### Transform 1: Stale Tool Result Cleaner

**Why this is first**: Claude Code's engineering team found that clearing stale tool call results produced an **84% token reduction** and **29% performance improvement** in 100-turn evaluations. This was a bigger improvement than their summarization approach. It's the single highest-ROI optimization available.

**Input**: Session message array
**Transformation**: For tool_result messages older than N turns (configurable, default 5):
- Keep the tool name and a one-line summary of the result
- Strip the full result body (file contents, command output, search results)
- Preserve tool_use/tool_result ID pairing (critical for Anthropic API)
**Output**: Same message array, smaller
**Decision criteria**: Age of the tool result in turns. No scoring, no embeddings — just recency.

```typescript
function cleanStaleToolResults(
  messages: AgentMessage[],
  opts: { staleTurnThreshold: number; maxResultChars: number }
): AgentMessage[] {
  const recentTurnBoundary = findNthUserTurnFromEnd(messages, opts.staleTurnThreshold);
  return messages.map((msg, i) => {
    if (i >= recentTurnBoundary) return msg;  // Recent — keep verbatim
    if (msg.role !== 'toolResult') return msg; // Not a tool result — skip
    return truncateToolResult(msg, opts.maxResultChars); // Truncate old result
  });
}
```

**What this changes in code**: New transform applied in `compact.ts` after `sanitizeSessionHistory()` (line 558) and before `limitHistoryTurns()` (line 575). Uses the existing `stripToolResultDetails()` from `session-transcript-repair.ts` as a starting point.

**Estimated savings**: In a 30-turn coding session, turns 1-25 likely contain large `read`, `exec`, and `grep` results. Each file read is 500-5,000 tokens. Truncating 20 stale results to ~50 tokens each saves **~10,000-50,000 tokens**. This dwarfs every other optimization.

**Failure mode**: If the LLM needs to reference an old tool result, the full result is still in the session transcript on disk. The LLM can re-read the file.

### Transform 2: Tool Group Selector

**Input**: User message text, last 2 assistant tool calls, available tool list
**Transformation**: Classify intent → select relevant tool groups → filter schemas
**Output**: Reduced tool array
**Decision criteria**: Deterministic keyword matching + recent tool usage history

**Tool groups** (static map):

| Group | Triggers | Tools |
|-------|----------|-------|
| **Core** (always) | — | read, write, edit, exec, ls |
| **File Ops** | "file", "create", "delete", "move", "rename", "patch", "diff" | apply_patch, grep, find |
| **Research** | "search", "find out", "look up", "what is", "how to", URL patterns | web_search, web_fetch, grep, find |
| **Messaging** | "send", "message", "tell", "notify", group chat context | message, sessions_send, sessions_list |
| **Orchestration** | "spawn", "agent", "background", "cron", "schedule", "remind" | sessions_spawn, subagents, agents_list, sessions_list, sessions_history, cron |
| **Browser** | "browse", "open page", "screenshot", URL in message | browser, web_fetch |
| **Media** | "image", "photo", "picture", "canvas", "draw" | image, canvas |
| **System** | "status", "update", "config", "restart", "gateway" | gateway, session_status |
| **Nodes** | "node", "camera", "screen", "device" | nodes |

**Additional signal**: If the agent used `grep` and `edit` in the last 2 turns, include File Ops group even without keyword triggers (momentum-based selection).

**Fallback on miss**: Handled by the Self-Correction Layer (Transform validates tool call → retry with missing tool → log pattern).

**Estimated savings**: 25 schemas → 5-8 relevant. ~60-80 tokens per schema. **~900-1,600 tokens/turn**.

### Transform 3: Weighted History Window

**Input**: Full session message array
**Transformation**: Three recency tiers instead of flat cutoff
**Output**: Shorter message array

```
RECENT (last 3 user turns + responses):  Verbatim. Full tool results.
MIDDLE (turns 4-10 back):               User message + first 200 chars of
                                         assistant response + tool names only.
OLD (turns 11+):                         Dropped. Available via memory_search
                                         and session transcript on disk.
```

If a compaction summary exists from a previous compaction, it stays at position [0] (same as MemGPT's recursive summary approach).

**Token budget check**: After windowing, estimate total. If over budget, shrink MIDDLE (remove oldest first). If still over, trigger existing compaction as emergency fallback.

**What this replaces**: `limitHistoryTurns()` in `history.ts:15-36`. Called at the same point in `compact.ts:575`.

**Estimated savings**: 20-turn session: all 20 turns (~8,000-15,000 tokens) → 3 full + 7 compressed (~4,400 tokens). **~3,600-10,600 tokens saved**.

### Transform 4: Working Memory Injector

**Inspired by**: MemGPT's core memory blocks (always in-context, self-editable) + Mem0's fact extraction.

**Input**: WorkingMemory state object (maintained across turns)
**Transformation**: Serialize to a compact structured block, inject into context
**Output**: A `[Working Memory]` block prepended to the message array

```typescript
interface WorkingMemory {
  sessionSummary: string | null;     // Periodic cheap-model summary, if available
  currentTask: string | null;        // Extracted from last user message
  recentDecisions: string[];         // Last 5 decisions (regex-extracted)
  activeConstraints: string[];       // "don't", "must", "always" patterns
  keyFacts: string[];                // Mem0-style extracted facts (max 10)
  toolsUsedThisSession: Set<string>; // Feeds tool group predictor
  turnCount: number;
  lastCompactionTurn: number;        // When was context last compacted
}
```

Serialized as ~200-400 tokens. Much cheaper than including 10+ old turns to maintain continuity.

**Fact extraction** (Mem0-inspired, but heuristic not LLM):
- "User prefers X" / "User wants X" → keyFact
- "The project uses X" / "We're using X" → keyFact
- Constraints: "don't modify X", "must support X", "always use X" → activeConstraint
- Decisions: "I'll use X", "Let's go with X", "decided on X" → recentDecision

**Self-editing** (MemGPT-inspired): The agent can update working memory via a lightweight tool call. When the agent says "I'll remember that you prefer TypeScript," it can call `working_memory_update(key="preference", value="user prefers TypeScript")`. This is optional — the heuristic extraction handles most cases.

### Transform 5: Tiered Prompt Builder

**Input**: PromptMode, channel config, sandbox config, context files
**Output**: System prompt with only relevant sections

**Tier 0 — Always (~300 tokens)**: Identity, safety essentials, workspace, runtime
**Tier 1 — Conditional (~200-800 tokens)**: Tool summaries, messaging, sandbox, reactions, skills
**Tier 2 — Omitted**: CLI reference, self-update, model aliases, TTS, heartbeat, silent replies, docs URLs

Tier 2 content written to a reference file at `~/.openclaw/reference-prompt.md` that the agent can `read` if needed. The agent is told in Tier 0: "Extended instructions available at {path} — read if you need CLI commands, update procedures, or protocol details."

**Estimated savings**: ~2,000-4,000 → ~500-1,100 tokens. **~1,000-3,000 tokens/turn**.

### Transform 6: Token Budget Enforcer

**Inspired by**: MemGPT's two-stage eviction (warn at 70%, flush at 100%).

**Input**: Assembled context (system prompt + tools + history + working memory)
**Transformation**: Progressive shedding to fit within budget
**Output**: Context that fits within the model's context window with safety margin

```
At 70% capacity:  Inject memory pressure note into working memory.
                  "Context is filling. Key information should be in
                  working memory or reference memory."

At 85% capacity:  Shrink MIDDLE window. Remove oldest MIDDLE turns.
                  Truncate remaining tool results more aggressively.

At 95% capacity:  Drop MIDDLE window entirely. Keep only RECENT + working
                  memory + system prompt. Log warning.

At 100%:          Trigger existing compaction (summarizeInStages).
                  This is the emergency fallback — should rarely fire
                  if the pipeline is working.
```

The 70% memory pressure warning is borrowed directly from MemGPT. It gives the agent a chance to explicitly save important context to working memory or reference memory before forced eviction.

---

## Part IV: The Self-Correction Layer

Every successful self-correcting system uses **external signals**, not LLM self-judgment (Huang et al., ICLR 2024). Our correction layer uses five external signal sources.

### Corrector 1: Tool Call Validator

**Inspired by**: CRITIC (external tool verification), Voyager (execution error detection), LangGraph (retry with backoff).

**Signal**: Tool call success/failure from the SDK.
**Detection**: Three failure types:
1. **Unknown tool**: LLM called a tool that was filtered out by the Tool Group Selector
2. **Tool execution error**: Tool ran but returned an error
3. **Malformed call**: Invalid parameters or JSON

**Correction**:

| Failure | Action | Cost |
|---------|--------|------|
| Unknown tool | Add tool to schema set, retry turn. Log miss for pattern improvement. | 1 retry |
| Execution error | Feed error message back to LLM (existing behavior). If same error 3x, suggest alternative approach. | 0 extra (existing) |
| Malformed call | Feed parsing error back. If 2x consecutive malformed calls, switch to stricter schema validation. | 0 extra (existing) |

**Retry policy** (LangGraph-inspired):
```typescript
const toolRetryPolicy = {
  maxAttempts: 3,
  backoff: 'none',        // Tool retries are cheap — just re-include the schema
  retryOn: ['unknown_tool'],
  failAction: 'include_all_tools_and_retry'  // Nuclear option: send all schemas
};
```

### Corrector 2: Context Loss Detector

**Inspired by**: MemGPT's proactive memory warnings, the "lost in the middle" problem research, production context integrity systems.

**Signal**: Pattern matching on the LLM's response text.
**Detection patterns**:
- "I don't have information about"
- "Could you remind me"
- "I'm not sure what you're referring to"
- "Based on what I can see" (when the full context should be available)
- "Let me search for" / "Let me check" when the information was in recent history
- Agent asks a question it already answered earlier in the session

```typescript
const CONTEXT_LOSS_PATTERNS = [
  /I don't have (?:access to|information about)/i,
  /could you (?:remind|tell) me (?:again|what)/i,
  /I'm not sure what (?:you're|you are) referring to/i,
  /I don't see (?:any|that) (?:in|from) (?:the|our|my) (?:context|conversation|history)/i,
  /(?:can you|could you) (?:provide|share|paste) (?:that|it) again/i,
];
```

**Correction**:
1. Log the context loss event with the specific pattern matched
2. For next turn: expand MIDDLE window by 5 turns (temporary)
3. Trigger proactive memory search for the topic the LLM was uncertain about
4. If the lost context was a tool result, re-inject that specific result
5. After 2 turns without another context loss signal, contract window back to normal

**Correction cost**: 0 extra LLM calls. This is all local computation + memory retrieval.

### Corrector 3: Loop Detector

**Inspired by**: AutoGPT's loop problem (unsolved, major failure mode), Voyager's "4 attempts then abandon" policy.

**Signal**: Comparison of current action with recent action history.
**Detection**: Three types of loops:

1. **Exact tool loop**: Same tool called with identical parameters 3+ times in a row
2. **Semantic loop**: Agent generates substantially similar text (>80% token overlap) on consecutive turns
3. **Oscillation**: Agent alternates between two actions (A→B→A→B) for 3+ cycles

```typescript
function detectLoop(currentAction: Action, recentActions: Action[]): LoopType | null {
  // Exact match: hash tool name + params, check for 3+ consecutive matches
  const currentHash = hashAction(currentAction);
  const consecutiveMatches = countConsecutiveMatches(currentHash, recentActions.map(hashAction));
  if (consecutiveMatches >= 3) return 'exact';

  // Semantic overlap: compare assistant text with previous N responses
  const overlapRatio = computeTokenOverlap(currentAction.text, recentActions[0]?.text);
  if (overlapRatio > 0.8) return 'semantic';

  // Oscillation: check A-B-A-B pattern
  if (recentActions.length >= 4) {
    const [a, b, c, d] = recentActions.slice(-4).map(hashAction);
    if (a === c && b === d && a !== b) return 'oscillation';
  }

  return null;
}
```

**Correction** (Voyager-inspired escalation):
1. **First detection**: Inject system message: "You appear to be repeating the same action. Consider a different approach."
2. **Second detection**: Inject more specific guidance: "Previous attempts with {tool} and {params} have not produced progress. Try: {alternative suggestion based on tool type}."
3. **Third detection**: Force a different code path. If looping on `exec`, suggest `read` first. If looping on `web_search`, suggest asking the user for clarification.
4. **Fourth detection**: Abandon the current approach. Inject: "This approach is not making progress after 4 attempts. Please ask the user for guidance or try a fundamentally different strategy."

**Cost**: 0 extra LLM calls. Detection is hashing + string comparison. Correction is injected system messages.

### Corrector 4: Working Memory Updater

**Inspired by**: Mem0's extract-then-curate pipeline, Voyager's skill library (successful patterns get saved).

**Signal**: Completed turn data (user message + assistant response + tool calls + tool results).
**Trigger**: Runs after every turn, synchronously before the response is sent (fast — ~5ms of regex).

**Extraction rules** (heuristic, not LLM):
```typescript
function extractFromTurn(turn: CompletedTurn): WorkingMemoryUpdate {
  return {
    // Decisions: "I'll", "Let's", "going with", "decided to"
    decisions: extractDecisions(turn.assistantText),

    // Constraints: "don't", "must", "always", "never"
    constraints: extractConstraints(turn.userText + turn.assistantText),

    // Facts: "X is Y", "uses X", "prefers X", "the project has X"
    facts: extractFacts(turn.userText + turn.assistantText),

    // Tools used (for group predictor momentum)
    toolsUsed: turn.toolCalls.map(tc => tc.name),

    // Current task (from user message intent)
    currentTask: extractTaskIntent(turn.userText),
  };
}
```

**Curate rules** (Mem0-inspired ADD/UPDATE/DELETE, but heuristic):
- New fact that doesn't contradict existing → ADD
- New fact that contradicts existing → UPDATE (replace old with new)
- Fact older than `decisionTtlTurns` and not referenced → DELETE
- Max 10 keyFacts, 5 decisions, 5 constraints — oldest evicted when full

**Cost**: 0. Pure string manipulation.

### Corrector 5: Memory Pressure Monitor

**Inspired by**: MemGPT's two-stage memory pressure system.

**Signal**: Token count of assembled context vs. model context window.
**Trigger**: Runs as part of Transform 6 (Token Budget Enforcer), but also monitored across turns.

**Escalation levels**:

| Level | Threshold | Action |
|-------|-----------|--------|
| **Green** | <60% | Normal operation |
| **Yellow** | 60-75% | Log warning. Add to working memory: "Context at {pct}%. Consider saving important info." |
| **Orange** | 75-90% | Shrink MIDDLE window. Truncate tool results more aggressively. Consider periodic summary if not recently done. |
| **Red** | 90-95% | Drop MIDDLE window. Keep RECENT + working memory only. Trigger cheap-model periodic summary if enabled. |
| **Critical** | >95% | Trigger existing compaction (`summarizeInStages`). Emergency fallback. |

The key insight from MemGPT: the agent itself should know about memory pressure. At Yellow level, the working memory block includes a note about context capacity. This lets the agent make better decisions — e.g., storing important findings in archival/reference memory before they get evicted, or being more concise in its responses.

---

## Part V: What We're NOT Building

Explicit scope exclusions based on the research:

1. **No LLM-based memory curation per turn**. Mem0 uses an LLM to decide ADD/UPDATE/DELETE for every memory operation. At $0.01-0.05 per turn, this adds up. Our heuristic extraction is free and handles 80% of cases. The remaining 20% can be addressed by the periodic cheap-model summary (opt-in).

2. **No knowledge graph**. Mem0's graph memory is powerful but their open-source version doesn't include it, and it requires Neo4j/Memgraph infrastructure. The ROI doesn't justify the complexity for OpenClaw's scale. Revisit if the two-tier memory proves insufficient.

3. **No LLMLingua-style BERT compression**. AutoGen integrates LLMLingua for token-level compression. It's impressive but adds a Python dependency, a separate model to load, and latency. Our stale tool result cleaner achieves similar savings (84% in Claude Code's data) with zero model overhead.

4. **No heartbeat/chain-of-thought system**. MemGPT's heartbeat mechanism was deprecated in Letta V1 because modern models handle multi-step tool calling natively. OpenClaw already supports multi-step execution without explicit heartbeats.

5. **No "consciousness simulation" or meta-cognitive layer**. Killed in v2, stays killed. Observable signals (Correctors 1-5) are more reliable than asking the LLM about its own state.

---

## Part VI: Implementation Roadmap

### Phase 0: Instrumentation (Before Any Code Changes)

Add token logging to measure baselines. Modify `compact.ts` and `run.ts` to log:
- System prompt token count per turn
- Tool schema token count per turn
- Session history token count per turn
- Total context token count per turn
- Compaction frequency and trigger reason
- Memory pressure level per turn

Run for 1-2 weeks across real sessions. Set targets based on measured data.

**New file**: `src/agents/context/telemetry.ts` — logging functions called at key points in the pipeline. ~80 lines.

### Phase 1: Stale Tool Cleaner + Tool Groups + Prompt Tiers

The three transforms that require the least architectural change and deliver the most savings.

**Changes to existing files:**
- `src/agents/system-prompt.ts` — Add `PromptTier` parameter. Wrap Tier 2 sections in conditionals.
- `src/agents/pi-embedded-runner/compact.ts` — Add stale tool result cleaning after `sanitizeSessionHistory()` (line 558). Add tool filtering after `createOpenClawCodingTools()` (line 359).

**New files:**
- `src/agents/context/stale-tool-cleaner.ts` — `cleanStaleToolResults()`. ~100 lines.
- `src/agents/context/tool-groups.ts` — Static group map + `selectToolsForTurn()`. ~150 lines.
- `src/agents/context/prompt-reference.ts` — Writes Tier 2 content to reference file. ~60 lines.
- `src/agents/context/telemetry.ts` — Token count logging. ~80 lines.

**Target**: 40-55% reduction in total per-turn context tokens. The stale tool cleaner alone should deliver most of this for sessions >10 turns.

### Phase 2: Weighted History + Working Memory + Self-Correction

The sliding window, working memory, and the five correctors.

**Changes to existing files:**
- `src/agents/pi-embedded-runner/history.ts` — Add `buildWeightedHistory()`.
- `src/agents/pi-embedded-runner/compact.ts` — Replace `limitHistoryTurns()` call with `buildWeightedHistory()`. Add post-turn hook for working memory update and self-correction.

**New files:**
- `src/agents/context/weighted-history.ts` — `buildWeightedHistory()`. ~150 lines.
- `src/agents/context/working-memory.ts` — WorkingMemory class + serialization. ~200 lines.
- `src/agents/context/turn-extractor.ts` — Heuristic extraction (decisions, constraints, facts). ~150 lines.
- `src/agents/context/self-correction.ts` — All 5 correctors. ~300 lines.
- `src/agents/context/loop-detector.ts` — Action hashing + pattern detection. ~100 lines.
- `src/agents/context/context-loss-detector.ts` — Response pattern matching. ~80 lines.

**Target**: Cumulative 60-70% reduction. Near-zero compaction triggers for sessions <50 turns.

### Phase 3: Adaptive Budget + Proactive Retrieval

The token budget enforcer with MemGPT-style memory pressure, and proactive memory injection.

**Changes to existing files:**
- `src/agents/pi-embedded-runner/compact.ts` — Replace static context assembly with adaptive budget manager.

**New files:**
- `src/agents/context/budget-enforcer.ts` — Progressive shedding with pressure levels. ~150 lines.
- `src/agents/context/proactive-retrieval.ts` — Embed user message, query memory, inject. ~100 lines.
- `src/agents/context/context-manager.ts` — Coordinates all transforms and correctors. ~250 lines.

**Target**: Cumulative 65-75% reduction. Self-correction catches 90%+ of context loss events. Compaction becomes rare (emergency only).

---

## Part VII: Configuration

```yaml
agents:
  defaults:
    context:
      enabled: true
      promptTier: "compact"               # "compact" | "standard" | "full"

      staleToolCleaner:
        enabled: true
        staleTurnThreshold: 5             # Turns before tool results get truncated
        maxResultChars: 200               # Max chars to keep from stale results

      toolSelection:
        enabled: true
        alwaysInclude: ["read", "write", "edit", "exec", "ls"]
        maxTools: 12
        useMomentum: true                 # Include groups from recent tool usage

      history:
        recentWindow: 3                   # Full turns to keep verbatim
        middleWindow: 7                   # Compressed turns to keep
        middleTruncateChars: 200

      workingMemory:
        enabled: true
        maxFacts: 10
        maxDecisions: 5
        maxConstraints: 5
        decisionTtlTurns: 10
        selfEditTool: false               # Agent can update via tool call (opt-in)

      selfCorrection:
        toolCallValidator: true
        contextLossDetector: true
        loopDetector: true
        loopMaxAttempts: 4                # Voyager-style abandon after N
        memoryPressureWarnings: true

      consolidation:
        heuristic: true
        embeddingRetrieval: false          # Proactive memory search (Phase 3)
        periodicSummary:
          enabled: false
          everyNTurns: 20
          model: "haiku"

      budget:
        yellowThreshold: 0.60
        orangeThreshold: 0.75
        redThreshold: 0.90
        criticalThreshold: 0.95
```

**Backward compatibility**: `context.enabled: false` → all current behavior unchanged. Each sub-feature independently toggleable.

---

## Part VIII: Failure Modes

| Component | Failure | Detection | Recovery | Cost |
|-----------|---------|-----------|----------|------|
| Stale tool cleaner | LLM needs old tool result | Context loss patterns in response | Re-inject specific result, expand staleTurnThreshold | 0 LLM calls |
| Tool group selector | LLM calls filtered-out tool | SDK reports unknown tool | Retry with tool added, log pattern | 1 retry |
| Weighted history | Important old context dropped | Context loss patterns in response | Expand MIDDLE window temporarily, search memory | 0 LLM calls |
| Working memory | False decision extraction | Hard to detect; TTL limits damage | Decisions expire after 10 turns. RECENT window has ground truth | 0 |
| Loop detector | False positive (detects loop that isn't one) | Agent reports being interrupted | Disable loop correction for 5 turns, log false positive | 0 |
| Context loss detector | False positive | Agent responds about a different "loss" | No harm — expanding window temporarily is cheap | 0 |
| Budget enforcer | Too aggressive shedding | Multiple context loss detections in sequence | Raise pressure thresholds for this session | 0 |
| Periodic summary | Loses critical detail | Agent can't answer about something it previously knew | Full transcript on disk. memory_search retrieves original. | 1 tool call |
| Entire pipeline | Catastrophic regression | Task completion rate drops in A/B testing | `context.enabled: false` — instant rollback to current system | 0 |

---

## Part IX: File Structure

```
src/agents/context/
  index.ts                    # Public API — exports all transforms and correctors
  telemetry.ts                # Token count logging at pipeline stages
  stale-tool-cleaner.ts       # Transform 1: Clear old tool results
  tool-groups.ts              # Transform 2: Keyword-based tool filtering
  weighted-history.ts         # Transform 3: RECENT/MIDDLE/OLD window
  working-memory.ts           # Transform 4: Session-scoped state
  prompt-tiers.ts             # Transform 5: Tier 0/1/2 prompt sections
  budget-enforcer.ts          # Transform 6: Progressive shedding + pressure monitor
  self-correction.ts          # Corrector orchestrator
  tool-call-validator.ts      # Corrector 1: Tool miss → retry
  context-loss-detector.ts    # Corrector 2: Response pattern → window expansion
  loop-detector.ts            # Corrector 3: Action hash → break loop
  turn-extractor.ts           # Corrector 4: Regex extraction for working memory
  proactive-retrieval.ts      # Phase 3: Embedding-based memory injection
  context-manager.ts          # Phase 3: Coordinates all transforms + correctors
  types.ts                    # Shared type definitions
```

Changes to existing files:
- `src/agents/system-prompt.ts` — PromptTier parameter, Tier 2 extraction
- `src/agents/pi-embedded-runner/history.ts` — `buildWeightedHistory()` alongside existing
- `src/agents/pi-embedded-runner/compact.ts` — Pipeline integration at existing hook points

---

## Part X: Honest Projections

### What We Can Estimate

| Optimization | Mechanism | Savings | Confidence | Source |
|---|---|---|---|---|
| Stale tool result cleaning | Truncate old tool outputs | 10,000-50,000 tok/session | **High** | Claude Code measured 84% reduction |
| System prompt tiering | Remove ~7 sections | 1,000-3,000 tok/turn | **High** | Counting text that's being removed |
| Tool schema filtering | 25→5-8 tools | 900-1,600 tok/turn | **Medium** | Depends on schema sizes |
| Weighted history window | 3 full + 7 compressed vs all turns | 3,000-8,000 tok/turn (10+ turns) | **Medium** | Varies by session length |
| Working memory | ~300 token block enables aggressive windowing | Indirect — enables above | **Medium** | Depends on extraction accuracy |
| Self-correction (tool miss) | Retry with correct tools | Prevents failures, not token savings | **High** | LangGraph-proven pattern |
| Self-correction (context loss) | Auto-expand window | Prevents quality degradation | **Medium** | Novel; needs measurement |
| Self-correction (loop detection) | Break repetitive cycles | Prevents wasted turns/tokens | **High** | Voyager-proven pattern |

### What We Don't Know

- Actual token counts per component (needs Phase 0 instrumentation)
- Tool selector miss rate (needs production measurement)
- Context loss detector false positive rate (needs tuning)
- Loop detector sensitivity (hash collisions, false positives)
- Impact on task completion quality (needs A/B testing)

### Targets (to be revised after Phase 0 measurement)

- Phase 1: 40-55% reduction in total context tokens
- Phase 2: 60-70% reduction with self-correction preventing quality regression
- Phase 3: 65-75% reduction with adaptive budget allocation
- All phases: zero regression in task completion rate

### What Success Looks Like

1. A 50-turn coding session uses ~60% fewer tokens than today
2. Compaction triggers <5% as often (becomes a rare emergency)
3. The agent never says "I don't have information about X" for something discussed 5 turns ago
4. The agent never loops on the same failed tool call 3+ times
5. A user can disable the entire system with one config flag and get exactly today's behavior

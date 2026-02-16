# OpenClaw Neural Redesign Plan

## Consciousness-Inspired Context Architecture for Token-Optimized AI Agent Systems

---

## Part I: Current Architecture Diagnosis

### 1. Codebase Anatomy

OpenClaw is a multi-channel AI gateway (~50+ source directories, ~39 extensions) built in TypeScript (ESM). Its core loop:

1. **Inbound message** arrives via channel (Telegram, Discord, Signal, WhatsApp, Web, etc.)
2. **Auto-reply dispatch** (`src/auto-reply/`) routes to the embedded Pi agent runner
3. **System prompt construction** (`src/agents/system-prompt.ts`) builds a ~600-line monolithic prompt
4. **Context assembly**: bootstrap files + session history + memory search results + tool schemas
5. **LLM call** via `@mariozechner/pi-coding-agent` SDK with full context payload
6. **Compaction** (`src/agents/compaction.ts`) when context overflows: chunk-then-summarize
7. **Response** streamed back through channel

### 2. Critical Token Consumption Hotspots

| Hotspot | Location | Token Cost | Problem |
|---------|----------|------------|---------|
| **System prompt** | `system-prompt.ts:168-638` | ~2,000-4,000 tokens per call | Monolithic, rebuilt identically every turn. Includes tool docs, CLI reference, safety rules, messaging rules, reaction guidance, voice hints, docs paths - ALL sent every single API call |
| **Full session history** | `pi-embedded-runner/run.ts` | Grows unbounded until compaction | Linear transcript, no importance weighting. A 50-turn conversation sends all 50 turns even if only the last 3 are relevant |
| **Tool schemas** | `pi-tools.ts` (17K+ file) | ~500-1,500 tokens | Full JSON schemas for ~25+ tools sent every call, even when most are irrelevant to the current task |
| **Bootstrap context files** | `bootstrap-files.ts` | Variable, potentially large | AGENTS.md, SOUL.md, workspace files injected verbatim. No compression, no relevance filtering |
| **Compaction summarization** | `compaction.ts:142-174` | Extra LLM call | Summarizes chunks sequentially, then merges summaries - each step is another full API call with its own context overhead |
| **Memory search results** | `memory-search.ts` | ~200-600 tokens per search | Returns raw text snippets without semantic compression |

### 3. Context System Weaknesses

**3a. No Temporal Decay or Importance Weighting**
Every message in the session history has equal weight. A greeting from 40 turns ago consumes the same tokens as a critical decision made 2 turns ago. The `limitHistoryTurns` function (`pi-embedded-runner/history.ts`) only does hard cutoffs - no gradual decay.

**3b. Compaction is Lossy and Reactive**
Compaction (`compaction.ts`) only triggers on overflow. The `summarizeInStages` approach:
- Splits messages by token share (not semantic boundaries)
- Summarizes each chunk independently (losing cross-chunk references)
- Merges summaries (further lossy compression)
- Result: critical decisions, code snippets, and user preferences get flattened into generic summaries

**3c. No Working Memory / Long-Term Memory Distinction**
The current architecture treats everything as a flat transcript. There is no:
- Working memory (active task context)
- Episodic memory (past interactions)
- Semantic memory (learned facts/preferences)
- Procedural memory (how to do things)

**3d. System Prompt Redundancy**
The system prompt is rebuilt from scratch every turn. Sections like Safety rules, CLI reference, tool descriptions, and messaging instructions are identical across turns but consume thousands of tokens repeatedly.

**3e. No Predictive Context Loading**
The system loads ALL available context regardless of what the user is asking about. There is no prediction of what context will be needed.

---

## Part II: Neuroscience Foundations

The redesign draws from four peer-reviewed theories of consciousness and cognition, adapted for practical LLM agent architecture:

### Theory 1: Global Workspace Theory (GWT) - Bernard Baars (1988)

**Core Insight**: Consciousness operates as a "global workspace" - a shared cognitive blackboard where specialized unconscious processors compete for access. Only the winning coalition of information becomes "conscious" (broadcast to all processors).

**Application to OpenClaw**: Instead of dumping everything into the context window, create a competitive attention mechanism where context elements compete for limited "workspace" slots based on relevance to the current query.

**Key Paper**: Baars, B.J. (1988). *A Cognitive Theory of Consciousness*. Cambridge University Press.
**Supporting**: Dehaene, S., & Naccache, L. (2001). "Towards a cognitive neuroscience of consciousness." *Cognition*, 79(1-2), 1-37.

### Theory 2: Integrated Information Theory (IIT) - Giulio Tononi (2004)

**Core Insight**: Consciousness correlates with "integrated information" (Phi, $\Phi$) - the degree to which a system is both differentiated (has many distinct states) and integrated (its parts work as a unified whole). High Phi = high consciousness.

**Application to OpenClaw**: Measure the "information integration" of context elements. Highly integrated information (facts that connect to many other facts) should be preserved preferentially. Isolated facts can be compressed or evicted. This gives us a principled metric for what to keep vs. discard.

**Key Paper**: Tononi, G. (2004). "An information integration theory of consciousness." *BMC Neuroscience*, 5(1), 42.
**Supporting**: Tononi, G., & Koch, C. (2015). "Consciousness: here, there and everywhere?" *Philosophical Transactions of the Royal Society B*, 370(1668).

### Theory 3: Attention Schema Theory (AST) - Michael Graziano (2013)

**Core Insight**: The brain constructs an internal model of its own attention process (an "attention schema"). This meta-model allows the brain to predict and control what it attends to, creating the subjective experience of awareness.

**Application to OpenClaw**: Build an explicit attention schema that tracks what the agent is currently "attending to," what it recently attended to, and what it expects to need next. This becomes the agent's self-model of its own context state.

**Key Paper**: Graziano, M.S.A. (2013). *Consciousness and the Social Brain*. Oxford University Press.
**Supporting**: Graziano, M.S.A., & Webb, T.W. (2015). "The attention schema theory: a mechanistic account of subjective awareness." *Frontiers in Psychology*, 6, 500.

### Theory 4: Predictive Processing / Free Energy Principle - Karl Friston (2010)

**Core Insight**: The brain is fundamentally a prediction machine that minimizes "surprise" (free energy). It maintains generative models of the world and only processes information that violates its predictions (prediction errors).

**Application to OpenClaw**: Instead of loading all context, maintain a predictive model of what the user is likely to ask about. Only load context that the model cannot predict from its current state. This dramatically reduces token usage by not re-transmitting predictable information.

**Key Paper**: Friston, K. (2010). "The free-energy principle: a unified brain theory?" *Nature Reviews Neuroscience*, 11(2), 127-138.

### Precedent Systems

| System | Approach | Relevance |
|--------|----------|-----------|
| **MemGPT/Letta** | Virtual context management with explicit memory tiers | Closest prior art - main memory + archival memory with page-in/page-out |
| **SOAR** | Working memory + long-term memory (procedural, semantic, episodic) | Cognitive architecture with principled memory hierarchy |
| **ACT-R** | Activation-based memory retrieval with decay | Mathematical model for memory accessibility over time |
| **Conscious Turing Machine (Blum & Blum, 2021)** | Formal model of consciousness with competing processors | Theoretical framework for competitive context selection |

---

## Part III: The Neural Context Architecture (NCA)

### Architecture Overview

```
                    +-----------------------+
                    |   GLOBAL WORKSPACE    |
                    |   (Active Context)    |
                    |   ~4K-8K tokens max   |
                    +-----------+-----------+
                                |
              +-----------------+-----------------+
              |                 |                 |
    +---------v------+  +------v--------+  +-----v----------+
    | SENSORY BUFFER |  | WORKING MEMORY|  | ATTENTION       |
    | (Raw Input)    |  | (Task State)  |  | SCHEMA          |
    | ~1K tokens     |  | ~2K tokens    |  | (Self-Model)    |
    +-------+--------+  +------+--------+  | ~500 tokens     |
            |                  |           +--------+---------+
            |                  |                    |
    +-------v------------------v--------------------v---------+
    |              MEMORY CONSOLIDATION ENGINE                 |
    |          (Background Process - Async)                    |
    +----+------------+---------------+-----------+-----------+
         |            |               |           |
   +-----v----+ +----v-----+ +------v-----+ +---v-----------+
   | EPISODIC | | SEMANTIC | | PROCEDURAL | | PREDICTIVE    |
   | MEMORY   | | MEMORY   | | MEMORY     | | MODEL         |
   | (Events) | | (Facts)  | | (How-to)   | | (Expectations)|
   | SQLite   | | SQLite   | | Compressed | | ~256 tokens   |
   +----------+ +----------+ +------------+ +---------------+
```

### Layer 1: Sensory Buffer (Replaces raw message ingestion)

**Current**: Raw user message goes directly into session history.
**Redesign**: A lightweight preprocessing layer that:

- Extracts intent signals from the incoming message
- Tags message with semantic category (question, instruction, follow-up, correction, new-topic)
- Computes relevance scores against the current attention schema
- Triggers predictive context loading based on intent

**Implementation**: New file `src/agents/neural/sensory-buffer.ts`

```typescript
interface SensoryInput {
  raw: string;
  intent: IntentSignal;          // question | instruction | followup | correction | newtopic
  semanticTags: string[];         // extracted topics/entities
  relevanceToCurrentTask: number; // 0-1 score against attention schema
  predictedContextNeeds: string[]; // what memory/context to preload
  temporalWeight: number;         // urgency/recency factor
}
```

**Token savings**: By classifying intent upfront (~50 tokens for the classification), we avoid loading irrelevant context that costs 500-2000 tokens.

### Layer 2: Global Workspace (Replaces flat context window)

**Current**: Everything gets stuffed into one context window until overflow.
**Redesign**: A curated workspace of ~4K-8K tokens that contains ONLY what's relevant right now.

The Global Workspace consists of:

| Slot | Budget | Contents |
|------|--------|----------|
| **System Identity** | ~200 tokens | Compressed identity ("You are OpenClaw assistant.") + essential safety rules only |
| **Active Tool Set** | ~300 tokens | Only schemas for tools predicted to be needed (not all 25+) |
| **Working Memory** | ~2,000 tokens | Current task state, recent decisions, active constraints |
| **Episodic Recall** | ~1,000 tokens | Relevant past interactions, retrieved by semantic search |
| **Semantic Facts** | ~500 tokens | User preferences, project facts, learned constraints |
| **Predictive Context** | ~256 tokens | The agent's expectations of what comes next |
| **Attention Schema** | ~500 tokens | Self-model: what am I attending to, what's my confidence level |

**Total**: ~4,756 tokens baseline vs. current 8,000-30,000+ tokens

**Implementation**: New file `src/agents/neural/global-workspace.ts`

```typescript
interface GlobalWorkspace {
  identity: CompressedIdentity;        // ~200 tokens
  activeTools: ToolSchema[];           // ~300 tokens (dynamic subset)
  workingMemory: WorkingMemoryState;   // ~2000 tokens
  episodicRecall: EpisodicFragment[];  // ~1000 tokens
  semanticFacts: SemanticFact[];       // ~500 tokens
  predictiveModel: PredictiveState;    // ~256 tokens
  attentionSchema: AttentionSchema;    // ~500 tokens

  totalBudget: number;                 // configurable, default 6000
  allocate(): TokenAllocation;         // dynamic budget allocation
  compete(candidates: ContextCandidate[]): ContextCandidate[]; // GWT competition
}
```

**The Competition Mechanism (GWT-inspired)**:

When new information arrives, it enters a competition for workspace slots:

1. Candidates are scored on: relevance to query, recency, integration (IIT-inspired), user salience
2. Current workspace contents defend their slots with activation levels that decay over time
3. Winners get broadcast (included in context), losers get demoted to long-term memory
4. The competition runs in <10ms using precomputed embeddings and cached scores

### Layer 3: Hierarchical Memory System (Replaces flat session history + basic memory)

**Current memory**:
- Session history: linear JSONL transcript (unbounded growth)
- Memory search: SQLite + embedding vectors, basic hybrid search

**Redesign**: Four-tier memory inspired by cognitive architecture research:

#### 3a. Episodic Memory (Events & Interactions)

Stores discrete interaction episodes with metadata:

```typescript
interface Episode {
  id: string;
  timestamp: number;
  summary: string;           // compressed ~50 tokens
  participants: string[];
  decisions: Decision[];     // extracted decisions with rationale
  topics: string[];
  emotionalValence: number;  // -1 to 1 (frustration to satisfaction)
  importanceScore: number;   // IIT-inspired integration metric
  accessCount: number;       // ACT-R activation tracking
  lastAccessed: number;
  decayRate: number;         // personalized per-episode
  embedding: number[];       // for semantic retrieval
}
```

**Key innovation**: Episodes are not raw transcripts. They are **compressed semantic summaries** with extracted structured metadata. A 50-turn conversation becomes 5-10 episodes of ~50 tokens each (250-500 tokens total vs. 5,000-15,000 tokens for raw history).

#### 3b. Semantic Memory (Facts & Knowledge)

Stores learned facts as a knowledge graph:

```typescript
interface SemanticFact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;        // 0-1
  source: string;            // which episode established this
  contradictions: string[];  // facts that contradict this one
  integrationScore: number;  // how many other facts connect to this
  lastValidated: number;
}
```

**Examples**:
- `{subject: "user", predicate: "prefers", object: "TypeScript over JavaScript", confidence: 0.9}`
- `{subject: "project", predicate: "uses", object: "Vitest for testing", confidence: 1.0}`
- `{subject: "user", predicate: "timezone", object: "America/New_York", confidence: 1.0}`

**Token savings**: Instead of re-reading AGENTS.md (20K+ tokens) every time, extract the relevant facts into semantic memory (~100-200 tokens for the subset needed).

#### 3c. Procedural Memory (How-To Knowledge)

Stores compressed procedures for recurring tasks:

```typescript
interface Procedure {
  id: string;
  trigger: string;           // "when user asks to deploy"
  steps: string[];           // compressed action sequence
  tools: string[];           // which tools this procedure uses
  constraints: string[];     // known pitfalls/requirements
  successRate: number;       // historical success tracking
  lastUsed: number;
  embedding: number[];
}
```

**Current waste**: Every time the user asks "deploy to fly.io", the agent re-reads docs, re-discovers the workflow, and re-assembles the steps. Procedural memory caches this as ~100 tokens instead of 2,000+ tokens of re-discovery.

#### 3d. Predictive Model (Expectation State)

Maintains the agent's expectations about what comes next (Friston's Free Energy):

```typescript
interface PredictiveModel {
  currentTask: string;                    // what we think the user is doing
  expectedNextAction: string;             // what we predict comes next
  confidenceLevel: number;                // how sure we are
  surpriseThreshold: number;              // when to load more context
  contextPreloads: Map<string, number>;   // topic -> probability of needing it
}
```

**Token savings**: If the predictive model says "user is writing tests" with 0.9 confidence, we preload test-related context and skip deployment/release context entirely. Estimated savings: 1,000-3,000 tokens per turn.

### Layer 4: Attention Schema (Self-Model)

The attention schema is the agent's model of its own cognitive state:

```typescript
interface AttentionSchema {
  currentFocus: string;                // what am I attending to right now
  focusHistory: FocusEvent[];          // recent attention shifts
  confidenceInUnderstanding: number;   // 0-1: how well do I understand the current task
  uncertainAreas: string[];            // what am I unsure about
  pendingQuestions: string[];          // what should I ask the user
  cognitiveLoad: number;              // 0-1: how much of my capacity is being used
  contextSaturation: number;          // 0-1: how full is the workspace
}
```

**Why this matters**: The attention schema enables the agent to:
1. **Self-report its cognitive state**: "I'm uncertain about X" vs. fabricating an answer
2. **Prioritize attention**: When cognitive load is high, focus on the most important element
3. **Request context**: "I notice I'm missing information about Y"
4. **Prevent hallucination**: When confidence is low, explicitly say so

### Layer 5: Memory Consolidation Engine (Background Process)

Inspired by how the hippocampus consolidates short-term memories into long-term storage during sleep:

```typescript
class MemoryConsolidationEngine {
  // Runs asynchronously between turns (not during LLM calls)
  async consolidate(session: SessionState): Promise<void> {
    // 1. Extract episodes from recent working memory
    const episodes = this.extractEpisodes(session.workingMemory);

    // 2. Extract semantic facts from episodes
    const facts = this.extractFacts(episodes);

    // 3. Extract procedures from tool-use patterns
    const procedures = this.extractProcedures(session.toolHistory);

    // 4. Compute integration scores (IIT-inspired)
    const scored = this.computeIntegration(facts, this.existingFacts);

    // 5. Prune low-integration, low-access facts (ACT-R decay)
    const pruned = this.applyDecay(this.existingFacts);

    // 6. Update predictive model
    this.updatePredictiveModel(episodes, facts);

    // 7. Persist to SQLite
    await this.persist(episodes, facts, procedures);
  }
}
```

**This runs BETWEEN turns**, not during them. No additional token cost for the consolidation itself - it's pure local computation using the existing SQLite infrastructure.

---

## Part IV: System Prompt Redesign

### Current Problem

The system prompt (`system-prompt.ts:168-638`) is a monolithic ~2,000-4,000 token block rebuilt identically every turn. It includes sections that are:
- **Always needed**: Safety rules, identity (~200 tokens)
- **Rarely needed**: CLI reference, model aliases, reaction guidance, voice hints
- **Conditionally needed**: Tool schemas (only relevant ones), sandbox info, messaging rules

### Redesign: Tiered System Prompt

```
Tier 0: Core Identity (ALWAYS included)         ~200 tokens
Tier 1: Active Task Context (DYNAMIC)           ~300-800 tokens
Tier 2: Relevant Tool Schemas (PREDICTED)       ~200-500 tokens
Tier 3: On-Demand Reference (LOADED IF NEEDED)  0 tokens (retrieved via memory)
```

#### Tier 0: Core Identity (~200 tokens, always present)

```
You are OpenClaw, a personal AI assistant.
Safety: No self-preservation, replication, or power-seeking. Pause and ask if instructions conflict.
Workspace: {workspaceDir}
Runtime: {model} | {channel} | thinking={level}
```

That's it. Everything else moves to lower tiers or memory.

#### Tier 1: Active Task Context (~300-800 tokens, dynamic)

Built from the attention schema and working memory:

```
Current task: {attentionSchema.currentFocus}
Recent context: {workingMemory.recentDecisions}
User preferences: {semanticMemory.relevantPreferences}
Active constraints: {workingMemory.activeConstraints}
```

This replaces the current approach of injecting all context files, all workspace notes, and all channel-specific instructions.

#### Tier 2: Predicted Tool Schemas (~200-500 tokens, selective)

Instead of sending all 25+ tool schemas every turn, the predictive model selects 3-5 tools likely to be needed:

```typescript
function selectToolSchemas(
  prediction: PredictiveModel,
  available: ToolSchema[]
): ToolSchema[] {
  // Score each tool against the predicted next action
  const scored = available.map(tool => ({
    tool,
    score: computeToolRelevance(tool, prediction.expectedNextAction)
  }));

  // Always include: read, exec (baseline capabilities)
  // Add predicted tools up to budget
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => s.tool);
}
```

**Token savings**: ~800-1,200 tokens per turn (from ~1,500 for all schemas to ~300-500 for predicted subset).

#### Tier 3: On-Demand Reference (0 tokens by default)

CLI reference, reaction guidance, voice hints, model aliases, docs paths - all move to semantic/procedural memory. Retrieved ONLY when the attention schema or sensory buffer detects relevance.

### Estimated System Prompt Savings

| Component | Current | Redesigned | Savings |
|-----------|---------|------------|---------|
| Identity + Safety | ~800 | ~200 | 600 |
| Tool schemas | ~1,500 | ~400 | 1,100 |
| CLI reference | ~300 | 0 (in memory) | 300 |
| Messaging rules | ~400 | 0 (in memory) | 400 |
| Channel config | ~200 | 0 (in memory) | 200 |
| Context files | ~1,000+ | ~300 (compressed) | 700+ |
| **Total** | **~4,200+** | **~900** | **~3,300+** |

---

## Part V: Token-Optimized Compaction Redesign

### Current Compaction: Problems

1. **Reactive**: Only triggers on context overflow (too late)
2. **Lossy**: Summarization loses critical details
3. **Expensive**: Each compaction requires 1-3 additional LLM calls
4. **No selectivity**: Treats all history equally

### Redesign: Proactive Neural Compaction

#### 5a. Continuous Consolidation (replaces reactive compaction)

Instead of waiting for overflow, consolidate after EVERY turn:

```typescript
async function postTurnConsolidation(
  turn: CompletedTurn,
  workspace: GlobalWorkspace
): Promise<void> {
  // 1. Extract structured data from the turn (local, no LLM)
  const extracted = extractTurnData(turn);

  // 2. Update episodic memory (local, no LLM)
  await episodicMemory.addEpisode(extracted.episode);

  // 3. Update semantic facts (local, no LLM)
  for (const fact of extracted.facts) {
    await semanticMemory.upsert(fact);
  }

  // 4. Update procedural memory if tools were used (local, no LLM)
  if (extracted.toolSequence.length > 0) {
    await proceduralMemory.recordSequence(extracted.toolSequence);
  }

  // 5. Decay old working memory items (local, no LLM)
  workspace.workingMemory.applyDecay();

  // 6. Update attention schema (local, no LLM)
  workspace.attentionSchema.updateAfterTurn(turn);

  // 7. Update predictive model (local, no LLM)
  workspace.predictiveModel.updateAfterTurn(turn, extracted);
}
```

**Key insight**: ALL of this is local computation. No LLM calls. No token cost. The structured extraction uses pattern matching and the existing embedding infrastructure, not additional LLM calls.

#### 5b. Structured Extraction (replaces LLM summarization)

Instead of using an LLM to summarize (which costs tokens), extract structured data using pattern matching:

```typescript
function extractTurnData(turn: CompletedTurn): ExtractedTurnData {
  return {
    episode: {
      summary: truncateToSentence(turn.assistantReply, 100), // first sentence
      decisions: extractDecisions(turn),     // regex: "I'll", "Let's", "decided to"
      topics: extractTopics(turn),           // NER-like extraction using existing embeddings
      toolsUsed: turn.toolCalls.map(t => t.name),
      userIntent: classifyIntent(turn.userMessage),
    },
    facts: extractFacts(turn),               // "X is Y" pattern matching
    toolSequence: turn.toolCalls,
  };
}
```

**When LLM summarization IS needed** (rare): Only for consolidation of 20+ episodes into a compressed episodic summary. This happens every ~50 turns instead of every overflow.

#### 5c. Intelligent Eviction (replaces chunk-and-drop)

When the global workspace approaches capacity, evict items based on a composite score:

```typescript
function computeEvictionScore(item: WorkspaceItem): number {
  const recencyScore = 1 / (1 + (Date.now() - item.lastAccessed) / HOUR_MS);
  const frequencyScore = Math.log(1 + item.accessCount) / MAX_LOG_ACCESS;
  const integrationScore = item.integrationScore; // IIT: how connected is this fact
  const taskRelevance = item.relevanceToCurrentTask;

  // ACT-R base-level activation formula, adapted
  const activation =
    taskRelevance * 0.4 +
    recencyScore * 0.25 +
    frequencyScore * 0.15 +
    integrationScore * 0.2;

  return activation;
}
```

Items with the lowest activation score get evicted to long-term memory first. Critical decisions, active constraints, and high-integration facts survive longest.

---

## Part VI: Implementation Roadmap

### Phase 1: Foundation (Non-Breaking Improvements)

**Goal**: Reduce token usage by 40-60% with minimal architecture changes.

#### 1.1 System Prompt Compression

- **File**: Modify `src/agents/system-prompt.ts`
- **Change**: Implement Tier 0/1/2 system prompt. Move static sections to a new `src/agents/neural/prompt-tiers.ts`
- **Effort**: Moderate - refactor existing `buildAgentSystemPrompt` function
- **Risk**: Low - backward compatible, just sends less
- **Expected savings**: 2,000-3,000 tokens per turn

#### 1.2 Predictive Tool Schema Selection

- **File**: New `src/agents/neural/tool-predictor.ts`
- **Change**: Analyze user message intent to select relevant tool schemas instead of sending all
- **Depends on**: Intent classification (can start with keyword heuristics, upgrade to embeddings later)
- **Expected savings**: 800-1,200 tokens per turn

#### 1.3 Working Memory Extraction

- **File**: New `src/agents/neural/working-memory.ts`
- **Change**: After each turn, extract key decisions/facts into structured working memory. Use this instead of full session history for context.
- **Depends on**: Pattern matching extractors (no LLM needed)
- **Expected savings**: 3,000-10,000 tokens per turn (replacing full history with compressed working memory)

### Phase 2: Memory Architecture (New Capabilities)

**Goal**: Implement the four-tier memory system. Replace brute-force compaction with intelligent consolidation.

#### 2.1 Episodic Memory Store

- **File**: New `src/memory/episodic.ts`
- **Change**: SQLite table for episodes with embedding vectors, decay parameters, access tracking
- **Integrates with**: Existing `src/memory/manager.ts` SQLite infrastructure
- **Schema addition**: `episodes` table alongside existing `chunks` table

#### 2.2 Semantic Memory Store

- **File**: New `src/memory/semantic.ts`
- **Change**: Knowledge graph stored in SQLite. Triple store (subject, predicate, object) with embeddings for retrieval
- **Integrates with**: Existing embedding infrastructure in `src/memory/embeddings.ts`

#### 2.3 Procedural Memory Store

- **File**: New `src/memory/procedural.ts`
- **Change**: Compressed tool-use patterns stored as procedures
- **Integrates with**: Existing tool infrastructure

#### 2.4 Memory Consolidation Engine

- **File**: New `src/agents/neural/consolidation.ts`
- **Change**: Background process that runs between turns to consolidate working memory into long-term stores
- **Trigger**: Post-turn hook in `pi-embedded-subscribe.ts`

### Phase 3: Global Workspace & Attention (Core Redesign)

**Goal**: Replace the flat context assembly with the GWT-inspired competitive workspace.

#### 3.1 Global Workspace Manager

- **File**: New `src/agents/neural/workspace.ts`
- **Change**: Central coordinator that manages context budget, runs the competition mechanism, and assembles the final context payload
- **Replaces**: Parts of `pi-embedded-runner/compact.ts` and the context assembly in `pi-embedded-runner/run.ts`

#### 3.2 Attention Schema

- **File**: New `src/agents/neural/attention-schema.ts`
- **Change**: Self-model tracking current focus, confidence, cognitive load
- **Enables**: Smarter context loading, better uncertainty reporting, hallucination prevention

#### 3.3 Predictive Context Loading

- **File**: New `src/agents/neural/predictive-model.ts`
- **Change**: Maintains expectations about next user action. Pre-loads relevant context, skips irrelevant context.
- **Uses**: Existing embeddings infrastructure for similarity scoring

#### 3.4 Sensory Buffer

- **File**: New `src/agents/neural/sensory-buffer.ts`
- **Change**: Preprocessing layer for incoming messages. Extracts intent, tags semantics, triggers predictive loading.
- **Integrates with**: `src/auto-reply/dispatch.ts` as the first processing step

### Phase 4: Consciousness Simulation Layer (Advanced)

**Goal**: Integrate all components into a coherent consciousness-like architecture.

#### 4.1 Integration Metric (IIT-Inspired)

- **File**: New `src/agents/neural/integration.ts`
- **Change**: Compute integration scores for context elements. Highly integrated information (connected to many facts) gets priority in the workspace.

#### 4.2 Competitive Broadcasting (GWT-Inspired)

- **File**: Enhancement to `src/agents/neural/workspace.ts`
- **Change**: Context elements actively compete for workspace slots. Winners get "broadcast" (included in context). The competition uses integration scores, relevance, recency, and access frequency.

#### 4.3 Meta-Cognitive Monitoring

- **File**: New `src/agents/neural/metacognition.ts`
- **Change**: The agent monitors its own reasoning process. Detects when it's uncertain, when context is insufficient, when it should ask for clarification vs. proceed.

---

## Part VII: Projected Impact

### Token Usage Reduction

| Scenario | Current Tokens | Redesigned Tokens | Reduction |
|----------|---------------|-------------------|-----------|
| Simple question (turn 1) | ~6,000 | ~2,500 | 58% |
| Mid-conversation (turn 10) | ~15,000 | ~4,500 | 70% |
| Long session (turn 50) | ~30,000+ (pre-compaction) | ~6,000 | 80% |
| Post-compaction (turn 50+) | ~12,000 | ~5,000 | 58% |
| Average across session | ~15,000 | ~4,500 | **70%** |

### Context Quality Improvement

| Metric | Current | Redesigned |
|--------|---------|------------|
| Relevant context ratio | ~30-40% | ~85-95% |
| Decision retention after compaction | ~40% | ~95% |
| User preference recall accuracy | ~60% | ~95% |
| Tool selection accuracy | ~70% | ~90% |
| Cross-session memory | Basic search | Structured episodic + semantic |

### Latency Impact

| Operation | Current | Redesigned |
|-----------|---------|------------|
| Context assembly | ~50ms | ~80ms (workspace competition adds ~30ms) |
| LLM API call | Baseline | ~30-50% faster (smaller payload) |
| Post-turn consolidation | N/A | ~100ms (async, doesn't block response) |
| Compaction frequency | Every ~20-30 turns | Rarely needed (continuous consolidation) |
| Net turn latency | Baseline | **~20-40% faster** (smaller payload dominates) |

---

## Part VIII: File Structure

```
src/agents/neural/
  index.ts                    # Public API
  sensory-buffer.ts           # Layer 1: Input preprocessing
  global-workspace.ts         # Layer 2: GWT-inspired context manager
  working-memory.ts           # Layer 3a: Active task state
  attention-schema.ts         # Layer 4: Self-model
  predictive-model.ts         # Layer 5: Friston-inspired predictions
  consolidation.ts            # Background memory consolidation
  prompt-tiers.ts             # Tiered system prompt construction
  tool-predictor.ts           # Predictive tool schema selection
  integration.ts              # IIT-inspired integration metrics
  metacognition.ts            # Meta-cognitive monitoring
  eviction.ts                 # ACT-R inspired memory eviction
  types.ts                    # Shared type definitions

src/memory/
  episodic.ts                 # Episodic memory store (new)
  semantic.ts                 # Semantic knowledge graph (new)
  procedural.ts               # Procedural memory store (new)
  // existing files unchanged - manager.ts, embeddings.ts, etc.
```

---

## Part IX: Configuration

All neural features will be configurable via the existing `openclaw config` system:

```yaml
agents:
  defaults:
    neural:
      enabled: true                        # Master toggle
      workspace:
        totalBudget: 6000                  # Max tokens for global workspace
        competitionEnabled: true            # GWT competition mechanism
      memory:
        episodic:
          enabled: true
          maxEpisodes: 1000
          decayHalfLifeHours: 168          # 1 week
        semantic:
          enabled: true
          maxFacts: 5000
          confidenceThreshold: 0.5
        procedural:
          enabled: true
          maxProcedures: 200
      consolidation:
        enabled: true
        runAfterEveryTurn: true
        llmSummarizeEveryNTurns: 50        # Only use LLM rarely
      prediction:
        enabled: true
        toolSelectionTopK: 5
      attention:
        schemaEnabled: true
        metacognitionEnabled: true
      promptTiers:
        tier0MaxTokens: 200
        tier1MaxTokens: 800
        tier2MaxTokens: 500
```

---

## Part X: Migration Strategy

### Backward Compatibility

- The neural system starts DISABLED by default (`neural.enabled: false`)
- Existing compaction, system prompt, and memory systems remain functional
- Users opt-in via `openclaw config set agents.defaults.neural.enabled true`
- Gradual rollout: Phase 1 features can be enabled independently

### Data Migration

- Existing session JSONL files remain valid (the neural system reads them during initial consolidation)
- Existing memory SQLite databases gain new tables (episodes, semantic_facts, procedures) without breaking existing tables
- First run with neural enabled triggers a one-time "initial consolidation" that processes existing session history into the new memory tiers

### Rollback

- Setting `neural.enabled: false` reverts to current behavior
- No data loss: original session files and memory databases are never modified destructively
- The neural memory tables are additive (new tables alongside existing ones)

---

## Summary

This redesign transforms OpenClaw from a stateless token-expensive system into a consciousness-inspired cognitive architecture that:

1. **Reduces token usage by ~70%** through intelligent context curation
2. **Preserves critical information** through structured memory tiers instead of lossy summarization
3. **Speeds up responses** by sending smaller, more relevant payloads
4. **Simulates aspects of consciousness** through the Global Workspace, Attention Schema, and Predictive Processing
5. **Improves over time** as the memory system learns user preferences, common workflows, and task patterns
6. **Maintains backward compatibility** through feature flags and additive changes

The approach is grounded in peer-reviewed neuroscience (Baars, Tononi, Graziano, Friston) and proven cognitive architectures (SOAR, ACT-R, MemGPT), adapted for the practical constraints of LLM-based agent systems.

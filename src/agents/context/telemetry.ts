/**
 * Telemetry module for context management pipeline.
 *
 * Tracks token counts per component per turn, enabling baseline measurement
 * and before/after comparison for each optimization phase.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { PressureLevel, TelemetrySnapshot } from "./types.js";

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/** Rough token estimate: ~4 chars per token for English text. */
const CHARS_PER_TOKEN = 4;

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessageTokens(msg: AgentMessage): number {
  const content = (msg as { content?: unknown }).content;
  if (typeof content === "string") {
    return estimateTokenCount(content);
  }
  if (!Array.isArray(content)) {
    return 0;
  }
  let total = 0;
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const text = (block as { text?: unknown }).text;
    if (typeof text === "string") {
      total += estimateTokenCount(text);
    }
  }
  return total;
}

export function estimateMessagesTokens(messages: AgentMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateMessageTokens(msg);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Telemetry store
// ---------------------------------------------------------------------------

const MAX_SNAPSHOTS = 200;

export class ContextTelemetry {
  private snapshots: TelemetrySnapshot[] = [];
  private sessionStartedAt = Date.now();

  record(snapshot: TelemetrySnapshot): void {
    this.snapshots.push(snapshot);
    if (this.snapshots.length > MAX_SNAPSHOTS) {
      this.snapshots = this.snapshots.slice(-MAX_SNAPSHOTS);
    }
  }

  createSnapshot(params: {
    turnNumber: number;
    systemPromptTokens: number;
    historyTokens: number;
    toolSchemaTokens: number;
    workingMemoryTokens: number;
    totalTokens: number;
    pressure: PressureLevel;
    transformsApplied: string[];
    correctionsApplied: string[];
  }): TelemetrySnapshot {
    const snapshot: TelemetrySnapshot = {
      timestamp: Date.now(),
      ...params,
    };
    this.record(snapshot);
    return snapshot;
  }

  getSnapshots(): readonly TelemetrySnapshot[] {
    return this.snapshots;
  }

  getLatest(): TelemetrySnapshot | undefined {
    return this.snapshots.at(-1);
  }

  /** Average total tokens across all recorded snapshots. */
  getAverageTotalTokens(): number {
    if (this.snapshots.length === 0) return 0;
    const sum = this.snapshots.reduce((acc, s) => acc + s.totalTokens, 0);
    return Math.round(sum / this.snapshots.length);
  }

  /** Total tokens saved (difference between first and latest snapshot). */
  getTokensSavedSinceStart(): number {
    if (this.snapshots.length < 2) return 0;
    return this.snapshots[0].totalTokens - (this.snapshots.at(-1)?.totalTokens ?? 0);
  }

  getSessionDurationMs(): number {
    return Date.now() - this.sessionStartedAt;
  }

  /** Serialize for logging / diagnostics. */
  toJSON(): object {
    return {
      snapshotCount: this.snapshots.length,
      sessionDurationMs: this.getSessionDurationMs(),
      averageTotalTokens: this.getAverageTotalTokens(),
      latestSnapshot: this.getLatest(),
    };
  }
}

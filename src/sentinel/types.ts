/**
 * OpenWolf Sentinel System — Types
 *
 * The Sentinel is OpenWolf's internal watchdog that runs every 30 minutes.
 * It checks for pending tasks, monitors Wolf Pack (sub-agent) status,
 * evaluates scheduled work, and looks for ways to improve goal completion.
 */

export type SentinelCheckResult = {
  checkId: string;
  status: "ok" | "action_needed" | "user_help_needed" | "error";
  title: string;
  detail: string;
  /** If action_needed, what the Sentinel will do automatically. */
  autoAction?: string;
  /** If user_help_needed, what to ask the user. */
  userPrompt?: string;
  timestamp: number;
};

export type SentinelReport = {
  ts: number;
  runDurationMs: number;
  checks: SentinelCheckResult[];
  pendingTasks: PendingTaskInfo[];
  wolfPackStatus: WolfPackMemberStatus[];
  scheduledWork: ScheduledWorkItem[];
  suggestions: GoalSuggestion[];
};

export type PendingTaskInfo = {
  taskId: string;
  sessionKey: string;
  description: string;
  createdAt: number;
  lastCheckedAt?: number;
  /** How many sentinel cycles this has been pending. */
  staleCycles: number;
  priority: "low" | "medium" | "high" | "critical";
};

export type WolfPackMemberStatus = {
  runId: string;
  sessionKey: string;
  task: string;
  label?: string;
  status: "running" | "completed" | "error" | "timeout" | "stale";
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  outcome?: string;
};

export type ScheduledWorkItem = {
  jobId: string;
  name: string;
  schedule: string;
  nextRunAt?: number;
  lastRunAt?: number;
  enabled: boolean;
  status: "on_track" | "overdue" | "failed_last" | "disabled";
};

export type GoalSuggestion = {
  type: "optimization" | "reminder" | "improvement" | "warning";
  title: string;
  detail: string;
  actionable: boolean;
};

export type SentinelConfig = {
  enabled: boolean;
  /** Check interval in milliseconds (default: 30 minutes). */
  intervalMs: number;
  /** Whether to notify the user when tasks are found pending. */
  notifyOnPending: boolean;
  /** Whether to auto-complete tasks that can be done without user input. */
  autoComplete: boolean;
  /** Max stale cycles before escalating to user. */
  maxStaleCycles: number;
  /** Whether to generate goal improvement suggestions. */
  suggestImprovements: boolean;
};

export const DEFAULT_SENTINEL_CONFIG: SentinelConfig = {
  enabled: true,
  intervalMs: 30 * 60 * 1000, // 30 minutes
  notifyOnPending: true,
  autoComplete: true,
  maxStaleCycles: 3,
  suggestImprovements: true,
};

/**
 * Context Loss Detector (Corrector 2)
 *
 * Pattern matching for signals that indicate the agent has lost context.
 * Triggers window expansion or proactive memory search.
 *
 * Cost: 0 extra LLM calls (pure pattern matching).
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ContextLossSignal, CorrectionAction } from "./types.js";

// ---------------------------------------------------------------------------
// Context loss patterns
// ---------------------------------------------------------------------------

const CONTEXT_LOSS_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  {
    pattern: /I don't have (?:information|context|details) about/i,
    description: "Agent claims no information",
  },
  {
    pattern: /Could you (?:remind|tell) me (?:about|what|which|how)/i,
    description: "Agent asks user to remind",
  },
  {
    pattern: /I'm not sure what you're referring to/i,
    description: "Agent doesn't recognize reference",
  },
  {
    pattern: /I don't (?:see|find|have) (?:any )?(?:previous|prior|earlier)/i,
    description: "Agent can't find previous context",
  },
  {
    pattern: /(?:Can|Could) you (?:provide|share|give) (?:more )?(?:context|details|information)/i,
    description: "Agent asks for context that was already given",
  },
  {
    pattern: /I (?:don't|do not) recall/i,
    description: "Agent claims no recall",
  },
  {
    pattern: /(?:what|which) (?:file|function|variable|class) (?:are|were) (?:you|we) (?:talking|referring|working)/i,
    description: "Agent forgot the subject",
  },
  {
    pattern: /I (?:apologize|sorry),? (?:but )?I (?:don't|can't|cannot) (?:find|see|access)/i,
    description: "Agent apologizes for missing info",
  },
  {
    pattern: /from (?:our |the )?(?:earlier|previous|prior) (?:conversation|discussion|exchange)/i,
    description: "Agent references earlier conversation vaguely",
  },
  {
    pattern: /what (?:was|were) the (?:original|initial|first)/i,
    description: "Agent forgot original context",
  },
];

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

/**
 * Check a single assistant message for context loss signals.
 */
export function detectContextLoss(message: AgentMessage): ContextLossSignal {
  if (message.role !== "assistant") {
    return { detected: false, patterns: [], action: { type: "none" } };
  }

  const content = (message as { content?: unknown }).content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((b) => {
              if (b && typeof b === "object") {
                const t = (b as { text?: unknown }).text;
                return typeof t === "string" ? t : "";
              }
              return "";
            })
            .join("\n")
        : "";

  if (!text) {
    return { detected: false, patterns: [], action: { type: "none" } };
  }

  const matchedPatterns: string[] = [];
  for (const { pattern, description } of CONTEXT_LOSS_PATTERNS) {
    if (pattern.test(text)) {
      matchedPatterns.push(description);
    }
  }

  if (matchedPatterns.length === 0) {
    return { detected: false, patterns: [], action: { type: "none" } };
  }

  // Determine action based on severity
  const action: CorrectionAction =
    matchedPatterns.length >= 3
      ? { type: "expand_window", additionalTurns: 5 }
      : { type: "expand_window", additionalTurns: 3 };

  return {
    detected: true,
    patterns: matchedPatterns,
    action,
  };
}

/**
 * Scan recent assistant messages for context loss.
 * Returns the first detected signal, or a "not detected" result.
 */
export function scanForContextLoss(messages: AgentMessage[]): ContextLossSignal {
  // Only check the most recent assistant messages (last 3)
  const recentAssistant = messages
    .filter((m) => m.role === "assistant")
    .slice(-3);

  for (const msg of recentAssistant) {
    const signal = detectContextLoss(msg);
    if (signal.detected) return signal;
  }

  return { detected: false, patterns: [], action: { type: "none" } };
}

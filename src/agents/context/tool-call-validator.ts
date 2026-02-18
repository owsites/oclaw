/**
 * Tool Call Validator (Corrector 1)
 *
 * Detects and recovers from tool call failures:
 * - Unknown tool: The agent called a tool that doesn't exist or was filtered
 * - Execution error: The tool returned an error
 * - Malformed call: The tool call was structurally invalid
 *
 * Actions:
 * - Retry with the missing tool re-injected
 * - Feed the error back with guidance
 * - Suggest alternative tools
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { CorrectionAction } from "./types.js";

// ---------------------------------------------------------------------------
// Error patterns
// ---------------------------------------------------------------------------

const UNKNOWN_TOOL_PATTERNS = [
  /tool (?:"|')(\w+)(?:"|') (?:is )?not (?:found|available|recognized)/i,
  /unknown tool[:\s]+(?:"|')?(\w+)/i,
  /no tool named (?:"|')?(\w+)/i,
  /tool_not_found/i,
];

const EXECUTION_ERROR_PATTERNS = [
  /error executing tool/i,
  /tool execution failed/i,
  /internal tool error/i,
  /permission denied/i,
  /command not found/i,
  /ENOENT|EACCES|EPERM/,
];

const MALFORMED_PATTERNS = [
  /invalid (?:tool )?(?:call|input|argument|parameter)/i,
  /missing required (?:parameter|argument|field)/i,
  /type error.*tool/i,
  /schema validation (?:failed|error)/i,
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ToolCallValidationResult = {
  isValid: boolean;
  errorType?: "unknown_tool" | "execution_error" | "malformed";
  toolName?: string;
  action: CorrectionAction;
};

/**
 * Check if a tool result message indicates a failure.
 */
export function validateToolCallResult(
  toolResultMsg: AgentMessage,
  availableTools: Set<string>,
): ToolCallValidationResult {
  if (toolResultMsg.role !== "toolResult") {
    return { isValid: true, action: { type: "none" } };
  }

  const content = (toolResultMsg as { content?: unknown }).content;
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

  const isError = (toolResultMsg as { is_error?: unknown }).is_error === true;

  // Check for unknown tool
  for (const pattern of UNKNOWN_TOOL_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const missingTool = match[1] ?? "unknown";
      return {
        isValid: false,
        errorType: "unknown_tool",
        toolName: missingTool,
        action: availableTools.has(missingTool)
          ? {
              type: "inject_message",
              message: `Tool "${missingTool}" is available. Retry the call.`,
            }
          : {
              type: "suggest_alternative",
              suggestion: `Tool "${missingTool}" is not available. Available tools: ${Array.from(availableTools).slice(0, 10).join(", ")}`,
            },
      };
    }
  }

  // Check for execution errors
  if (isError || EXECUTION_ERROR_PATTERNS.some((p) => p.test(text))) {
    const toolName =
      ((toolResultMsg as { toolName?: unknown }).toolName as string) ?? undefined;
    return {
      isValid: false,
      errorType: "execution_error",
      toolName,
      action: {
        type: "inject_message",
        message: `Tool execution failed: ${text.slice(0, 200)}. Review the error and try a different approach.`,
      },
    };
  }

  // Check for malformed calls
  if (MALFORMED_PATTERNS.some((p) => p.test(text))) {
    return {
      isValid: false,
      errorType: "malformed",
      action: {
        type: "inject_message",
        message: `Tool call was malformed: ${text.slice(0, 200)}. Check the tool schema and retry with correct parameters.`,
      },
    };
  }

  return { isValid: true, action: { type: "none" } };
}

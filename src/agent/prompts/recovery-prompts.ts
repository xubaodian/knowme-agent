export function buildToolFailureRecoveryPrompt(toolName: string, error: string): string {
  return [
    `The last tool call failed: ${toolName}: ${error}`,
    "Do not stop yet.",
    "Fix the cause with another tool call, or return a non-empty failure summary if this todo cannot be completed."
  ].join("\n");
}

export function buildEmptyResponseRecoveryPrompt(): string {
  return [
    "Your previous response was empty.",
    "Do not stop yet.",
    "If the current task is incomplete, continue by calling tools.",
    "If it is complete, return a non-empty concise completion summary with only the exact files, outputs, or identifiers produced by tools."
  ].join("\n");
}

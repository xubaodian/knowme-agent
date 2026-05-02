import type { JsonValue } from "../../shared.ts";
import type { LlmExecutor, LlmStepResult, RuntimeContext } from "../../runtime/types.ts";

function stringifyJson(value: JsonValue | undefined): string {
  if (value === undefined) {
    return "";
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

export class MockLlmExecutor implements LlmExecutor {
  async run(
    stepType: string,
    input: Record<string, JsonValue>,
    context: RuntimeContext
  ): Promise<LlmStepResult> {
    if (stepType === "llm.skill_action") {
      return {
        output: buildMockAction(input, context)
      };
    }

    const prompt = stringifyJson(input.prompt ?? input.goal ?? input.text);
    return {
      output: `[${stepType}] ${prompt || context.request.normalizedMessage}`.trim()
    };
  }
}

function buildMockAction(
  input: Record<string, JsonValue>,
  context: RuntimeContext
): string {
  const skillId = typeof input.skillId === "string" ? input.skillId : "unknown-skill";
  const observations = Array.isArray(input.observations) ? input.observations : [];
  const attachments = Array.isArray(input.availableAttachments) ? input.availableAttachments : [];

  if (skillId === "summarize-file") {
    if (observations.length === 0 && attachments.length > 0) {
      const firstAttachment = attachments[0] as Record<string, JsonValue>;
      return JSON.stringify({
        kind: "tool",
        tool: "read_file",
        reason: "Need the file contents before summarizing.",
        input: {
          path: firstAttachment.path
        }
      });
    }

    return JSON.stringify({
      kind: "control",
      action: "finish",
      reason: "The file has been read and can now be summarized.",
      input: {
        summary: `Summary for request: ${context.request.normalizedMessage}`,
        result: `[mock-summary] ${context.request.normalizedMessage}`
      }
    });
  }

  if (skillId === "inspect-runtime") {
    if (!observations.some(hasObservation("run_command"))) {
      return JSON.stringify({
        kind: "tool",
        tool: "run_command",
        reason: "Need to verify the Node.js runtime version.",
        input: {
          command: "node",
          args: ["--version"],
          cwd: process.cwd(),
          timeoutMs: 5000
        }
      });
    }

    if (!observations.some(hasObservation("run_code"))) {
      return JSON.stringify({
        kind: "tool",
        tool: "run_code",
        reason: "Need a direct code execution check after the command succeeds.",
        input: {
          language: "javascript",
          source: "console.log(JSON.stringify({ runtime: 'knowme-agent', mode: 'mock-loop' }))"
        }
      });
    }

    return JSON.stringify({
      kind: "control",
      action: "finish",
      reason: "Both command execution and code execution checks completed.",
      input: {
        summary: "Runtime inspection completed successfully."
      }
    });
  }

  if (skillId === "analyze-request") {
    return JSON.stringify({
      kind: "control",
      action: "delegate",
      reason: "The orchestration skill should hand off file summarization to the specialized summarizer skill.",
      input: {
        goal: "Summarize the attached file and produce a concise report for the user.",
        handoff_state: {
          sourceSkill: "analyze-request",
          attachmentCount: attachments.length
        }
      }
    });
  }

  if (skillId === "browse-page") {
    if (!observations.some(hasObservation("browser_open"))) {
      return JSON.stringify({
        kind: "tool",
        tool: "browser_open",
        reason: "Need to open the target page before inspecting it.",
        input: {
          url: "https://example.com"
        }
      });
    }

    if (!observations.some(hasObservation("browser_snapshot"))) {
      return JSON.stringify({
        kind: "tool",
        tool: "browser_snapshot",
        reason: "Need a structured snapshot before interacting with the page.",
        input: {}
      });
    }

    if (!observations.some(hasObservation("browser_extract"))) {
      return JSON.stringify({
        kind: "tool",
        tool: "browser_extract",
        reason: "Need to extract visible page content for summarization.",
        input: {
          goal: "Extract the visible title and key sections."
        }
      });
    }

    return JSON.stringify({
      kind: "control",
      action: "finish",
      reason: "The page has been opened, snapshotted, and extracted.",
      input: {
        summary: "Browser inspection completed successfully."
      }
    });
  }

  return JSON.stringify({
    kind: "control",
    action: "finish",
    reason: "No mock loop behavior defined for this skill.",
    input: {
      summary: `[mock-finish] ${context.request.normalizedMessage}`
    }
  });
}

function hasObservation(fragment: string) {
  return (item: JsonValue) =>
    typeof item === "object" &&
    item !== null &&
    "title" in item &&
    typeof item.title === "string" &&
    item.title.includes(fragment);
}

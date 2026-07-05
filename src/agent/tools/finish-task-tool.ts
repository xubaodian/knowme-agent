import type { AgentTool, FinishedTask, ToolRunResult } from "../types.js";

type FinishTaskInput = {
  status: "completed" | "failed";
  answer: string;
  artifactRefs?: string[];
  fileRefs?: string[];
  summary: string;
};

export function createFinishTaskTools(): AgentTool[] {
  return [
    {
      name: "finish_task",
      description: "Finish the overall task with a final user-facing answer and durable refs.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["status", "answer", "summary"],
        properties: {
          status: { type: "string", enum: ["completed", "failed"] },
          answer: { type: "string" },
          artifactRefs: { type: "array", items: { type: "string" } },
          fileRefs: { type: "array", items: { type: "string" } },
          summary: { type: "string" }
        }
      },
      summarizeInput: (input) => {
        const value = input as FinishTaskInput;
        return `完成任务：${value.status}（${value.answer.length} 字符，artifacts=${value.artifactRefs?.length ?? 0}）。`;
      },
      summarizeOutput: (output) => output.summary ?? "Task finished.",
      async run(input, context): Promise<ToolRunResult> {
        const value = input as FinishTaskInput;
        const finished = context.taskState.finish(normalizeFinishedTask(value));

        return {
          summary: `任务已标记为 ${finished.status}。`,
          data: { finishedTask: finished }
        };
      }
    }
  ];
}

function normalizeFinishedTask(input: FinishTaskInput): FinishedTask {
  return {
    status: input.status,
    answer: input.answer.trim() || (input.status === "completed" ? "任务已完成。" : "任务未完成。"),
    artifactRefs: normalizeStringArray(input.artifactRefs),
    fileRefs: normalizeStringArray(input.fileRefs),
    summary: input.summary.trim() || input.answer.trim()
  };
}

function normalizeStringArray(value: string[] | undefined): string[] {
  return Array.isArray(value) ? value.map((item) => item.trim()).filter(Boolean) : [];
}

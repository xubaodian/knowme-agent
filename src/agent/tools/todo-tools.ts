import type { AgentTool, PlanTodosInput, ToolRunResult } from "../types.js";

export function createTodoTools(): AgentTool[] {
  return [
    {
      name: "plan_todos",
      description: "Create or update the task execution plan and todo execution state.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", enum: ["create", "update", "start", "complete", "fail"] },
          goal: { type: "string" },
          todos: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "description", "expectedOutput"],
              properties: {
                id: { type: "string", description: "Stable todo id. If omitted, runtime assigns one." },
                title: { type: "string", description: "Short todo name." },
                description: { type: "string", description: "What this execution unit should do and why." },
                expectedOutput: { type: "string", description: "Concrete observable output expected from this todo." },
                doneCriteria: { type: "array", items: { type: "string" }, description: "Specific completion checks." },
                status: { type: "string", enum: ["pending", "in_progress", "completed", "failed"] },
                summary: { type: "string" },
                outputSummary: { type: "string" },
                artifactRefs: { type: "array", items: { type: "string" } },
                sandboxRefs: { type: "array", items: { type: "string" } },
                fileRefs: { type: "array", items: { type: "string" } },
                evidenceRefs: { type: "array", items: { type: "string" } },
                nextContext: { type: "string" },
                missingCriteria: { type: "array", items: { type: "string" } }
              }
            }
          },
          todoId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          expectedOutput: { type: "string" },
          doneCriteria: { type: "array", items: { type: "string" } },
          status: { type: "string", enum: ["pending", "in_progress", "completed", "failed"] },
          summary: { type: "string" },
          outputSummary: { type: "string" },
          artifactRefs: { type: "array", items: { type: "string" } },
          sandboxRefs: { type: "array", items: { type: "string" } },
          fileRefs: { type: "array", items: { type: "string" } },
          evidenceRefs: { type: "array", items: { type: "string" } },
          nextContext: { type: "string" },
          missingCriteria: { type: "array", items: { type: "string" } }
        }
      },
      summarizeInput: (input) => summarizePlanTodos(input as PlanTodosInput),
      summarizeOutput: (output) => output.summary ?? "Todo plan 已更新。",
      async run(input, context): Promise<ToolRunResult> {
        const plan = context.todoManager.applyPlan(input as PlanTodosInput);

        return {
          summary: `Todo plan 已更新：${plan.todos.length} 个 todo，goal=${plan.goal || "未设置"}。`,
          data: plan
        };
      }
    }
  ];
}

function summarizePlanTodos(input: PlanTodosInput) {
  const action = input.action ?? (input.todos ? "create" : "update");
  const parts = [
    `action=${action}`,
    input.goal ? `goal=${input.goal}` : undefined,
    input.todoId ? `todo=${input.todoId}` : undefined,
    input.todos ? `todos=${input.todos.length}` : undefined,
    input.summary ? `summary=${input.summary.slice(0, 120)}` : undefined
  ].filter(Boolean);

  return `更新执行计划（${parts.join("，")}）。`;
}

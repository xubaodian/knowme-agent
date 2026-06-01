import type { AgentTool, ToolRunResult, WriteTodosInput } from "../types.js";

export function createTodoTools(): AgentTool[] {
  return [
    {
      name: "write_todos",
      description: "Write the complete current todo list snapshot.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["todos"],
        properties: {
          todos: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "title", "status"],
              properties: {
                id: { type: "string", description: "Stable kebab-case todo id." },
                title: { type: "string" },
                detail: { type: "string" },
                status: { type: "string", enum: ["pending", "in_progress", "completed", "failed"] }
              }
            }
          }
        }
      },
      summarizeInput: (input) => summarizeTodos(input as WriteTodosInput),
      summarizeOutput: (output) => output.summary ?? "Todo 状态已更新。",
      async run(input, context): Promise<ToolRunResult> {
        const todos = context.todoManager.applySnapshot(input as WriteTodosInput);

        return {
          summary: `已写入 ${todos.length} 个 todo。`,
          data: todos
        };
      }
    }
  ];
}

function summarizeTodos(input: WriteTodosInput) {
  if (input.todos.length === 0) {
    return "写入空 todo 列表。";
  }

  const statusCounts = input.todos.reduce<Record<string, number>>((counts, todo) => {
    counts[todo.status] = (counts[todo.status] ?? 0) + 1;
    return counts;
  }, {});
  const preview = input.todos
    .slice(0, 6)
    .map((todo) => `${todo.status}: ${todo.title}`)
    .join("；");

  return `写入 ${input.todos.length} 个 todo（${JSON.stringify(statusCounts)}）：${preview}`;
}

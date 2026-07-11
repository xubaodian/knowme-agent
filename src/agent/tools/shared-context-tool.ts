import type { AgentTool, ToolRunResult } from "../types.js";

type ShareContextInput = {
  title: string;
  content: string;
};

export function createSharedContextTools(): AgentTool[] {
  return [
    {
      name: "share_context",
      description:
        "Exception-only handoff for stable information that later todos must know and cannot get from the todo completion summary or a file reference. Usually do not call it; use at most once per todo. Later todos receive it automatically, so no read operation is needed.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["title", "content"],
        properties: {
          title: { type: "string", description: "Short context title." },
          content: { type: "string", maxLength: 2000, description: "Minimal stable context required by later todos; never progress, raw output, or file content." }
        }
      },
      summarizeInput: (input) => {
        const value = input as ShareContextInput;
        return `共享上下文：${value.title}（${value.content.length} 字符）。`;
      },
      summarizeOutput: (output) => output.summary ?? "上下文已共享。",
      async run(input, context): Promise<ToolRunResult> {
        const value = input as ShareContextInput;
        const activeStep = context.eventBus.getActiveStep();
        const activeNode = context.eventBus.getActiveNode();
        const sharedContext = context.contextManager.shareContext(
          { title: value.title, content: value.content },
          {
            runId: context.run.id,
            chatId: context.run.chatId,
            todoId: activeStep?.id,
            todoTitle: activeStep?.title,
            executionNodeId: activeNode?.id
          }
        );

        context.runLogger.event("shared_context.created", {
          title: sharedContext.title,
          contentChars: sharedContext.content.length,
          sourceTodoId: sharedContext.sourceTodoId,
          sourceTodoTitle: sharedContext.sourceTodoTitle,
          executionNodeId: sharedContext.executionNodeId
        });

        return {
          summary: `上下文已共享：${sharedContext.title}。`,
          data: { sharedContext }
        };
      }
    }
  ];
}

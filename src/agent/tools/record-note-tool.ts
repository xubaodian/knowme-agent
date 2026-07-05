import type { AgentTool, ToolRunResult } from "../types.js";

type RecordNoteInput = {
  title: string;
  content: string;
};

type ReadRecordInput = {
  id: string;
};

export function createRecordNoteTools(): AgentTool[] {
  return [
    {
      name: "record_note",
      description:
        "Record a concise internal note for later todos. Use it for analysis, decisions, constraints, storyline, risks, or handoff context that should not be a file or artifact.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["title", "content"],
        properties: {
          title: { type: "string", description: "Short note title." },
          content: { type: "string", description: "Reusable context for later todos." }
        }
      },
      summarizeInput: (input) => {
        const value = input as RecordNoteInput;
        return `记录工作笔记：${value.title}（${value.content.length} 字符）。`;
      },
      summarizeOutput: (output) => output.summary ?? "Record note 已保存。",
      async run(input, context): Promise<ToolRunResult> {
        const value = input as RecordNoteInput;
        const activeStep = context.eventBus.getActiveStep();
        const activeNode = context.eventBus.getActiveNode();
        const note = context.contextManager.recordNote(
          {
            title: value.title,
            content: value.content
          },
          {
            runId: context.run.id,
            chatId: context.run.chatId,
            todoId: activeStep?.id,
            todoTitle: activeStep?.title,
            executionNodeId: activeNode?.id
          }
        );

        context.runLogger.event("record_note.created", {
          recordId: note.id,
          title: note.title,
          contentChars: note.content.length,
          todoId: note.todoId,
          todoTitle: note.todoTitle,
          executionNodeId: note.executionNodeId
        });

        return {
          summary: `Record note 已保存：${note.title}。`,
          data: { recordNote: note }
        };
      }
    },
    {
      name: "read_record",
      description: "Read the full content of a record_note by id when the injected context only contains a truncated preview.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["id"],
        properties: {
          id: { type: "string", description: "Record note id, such as rec_..." }
        }
      },
      summarizeInput: (input) => `读取工作笔记：${(input as ReadRecordInput).id}`,
      summarizeOutput: (output) => output.summary ?? "Record note 已读取。",
      async run(input, context): Promise<ToolRunResult> {
        const value = input as ReadRecordInput;
        const note = context.contextManager.getRecordById(value.id);

        if (!note) {
          throw new Error(`Record note not found: ${value.id}`);
        }

        context.runLogger.event("record_note.read", {
          recordId: note.id,
          title: note.title,
          contentChars: note.content.length,
          todoId: note.todoId,
          todoTitle: note.todoTitle
        });

        return {
          summary: `Record note 已读取：${note.title}（${note.content.length} 字符）。`,
          data: { recordNote: note }
        };
      }
    }
  ];
}

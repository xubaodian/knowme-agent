import type { RunEventWorkbenchResource } from "../../shared/types.js";
import type { AgentTool, ToolExecutionContext, ToolRunResult } from "../types.js";
import type { ToolRegistry } from "./tool-registry.js";

export type ToolRunOptions = {
  traceParentId?: string;
  traceMetadata?: Record<string, unknown>;
};

export class ToolRunner {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly context: ToolExecutionContext
  ) {}

  async run<TInput, TOutput extends ToolRunResult = ToolRunResult>(
    name: string,
    input: TInput,
    options: ToolRunOptions = {}
  ): Promise<TOutput> {
    const tool = this.registry.get(name) as unknown as AgentTool<TInput, TOutput>;
    const inputSummary = tool.summarizeInput?.(input) ?? "执行工具调用。";
    const startedAt = Date.now();
    const visibility = isInternalTool(name) ? "debug" : "primary";
    const traceNodeId = await this.context.trace?.startNode({
      parentId: options.traceParentId ?? this.context.trace.rootNodeId,
      type: "tool",
      title: tool.name,
      summary: inputSummary,
      input: {
        toolName: tool.name,
        arguments: input
      },
      metadata: {
        toolName: tool.name,
        ...options.traceMetadata
      }
    });
    const span = this.context.runLogger.startSpan("tool.run", {
      toolName: tool.name,
      inputSummary,
      inputSize: estimateJsonSize(input)
    });
    this.context.runLogger.event("tool.run.input", {
      toolName: tool.name,
      input
    });

    this.context.eventBus.emit({
      type: "tool.started",
      title: tool.name,
      detail: inputSummary,
      nodeId: traceNodeId,
      parentNodeId: options.traceParentId,
      status: "in_progress",
      flowKind: "tool",
      visibility,
      payload: {
        tool: {
          name: tool.name,
          inputSummary,
          status: "running"
        }
      }
    });

    try {
      const output = await tool.run(input, this.context);
      const outputSummary = tool.summarizeOutput?.(output) ?? output.summary ?? "工具调用完成。";
      const durationMs = Date.now() - startedAt;
      const resource = deriveWorkbenchResource(tool.name, input, output.data, outputSummary);
      span.end({
        toolName: tool.name,
        outputSummary,
        durationMs,
        hasData: output.data !== undefined,
        outputDataKind: describeDataKind(output.data),
        outputDataKeys: describeDataKeys(output.data)
      });
      this.context.runLogger.event("tool.run.output", {
        toolName: tool.name,
        output
      });
      await this.context.trace?.endNode(traceNodeId, {
        status: "success",
        summary: outputSummary,
        output,
        metadata: {
          toolName: tool.name,
          hasData: output.data !== undefined,
          outputDataKind: describeDataKind(output.data)
        }
      });

      this.context.eventBus.emit({
        type: "tool.finished",
        title: `${tool.name} completed`,
        detail: outputSummary,
        nodeId: traceNodeId,
        parentNodeId: options.traceParentId,
        status: "done",
        flowKind: "tool",
        visibility,
        payload: {
          tool: {
            name: tool.name,
            inputSummary,
            outputSummary,
            status: "completed",
            durationMs,
            resource
          }
        }
      });

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool execution failed.";
      const durationMs = Date.now() - startedAt;
      this.context.runLogger.event(
        "tool.run.error",
        {
          toolName: tool.name,
          input,
          error: message
        },
        "error"
      );
      span.fail(error, {
        toolName: tool.name,
        inputSize: estimateJsonSize(input)
      });
      await this.context.trace?.endNode(traceNodeId, {
        status: "error",
        summary: message,
        error,
        metadata: {
          toolName: tool.name
        }
      });

      this.context.eventBus.emit({
        type: "tool.finished",
        title: `${tool.name} failed`,
        detail: message,
        nodeId: traceNodeId,
        parentNodeId: options.traceParentId,
        status: "failed",
        flowKind: "error",
        visibility,
        payload: {
          tool: {
            name: tool.name,
            inputSummary,
            outputSummary: message,
            status: "failed",
            durationMs
          }
        }
      });

      throw error;
    }
  }
}

function isInternalTool(name: string): boolean {
  return name === "plan_todos" || name === "finish_task";
}

function deriveWorkbenchResource(
  toolName: string,
  input: unknown,
  data: unknown,
  summary?: string
): RunEventWorkbenchResource | undefined {
  const inputRecord = asRecord(input);
  const dataRecord = asRecord(data);

  if (toolName === "list_files") {
    const files = Array.isArray(dataRecord?.files) ? dataRecord.files.filter((item): item is string => typeof item === "string") : [];

    return {
      kind: "file_list",
      title: "文件列表",
      root: typeof dataRecord?.root === "string" ? dataRecord.root : undefined,
      files,
      summary
    };
  }

  if (toolName === "read_file" || toolName === "write_file" || toolName === "patch_file") {
    const path = readString(dataRecord, "path") ?? readString(inputRecord, "path");

    if (!path) {
      return undefined;
    }

    return {
      kind: "file",
      title: path,
      path,
      summary
    };
  }

  if (toolName === "browser_screenshot") {
    const url = readString(dataRecord, "url");

    if (!url) {
      return undefined;
    }

    return {
      kind: "browser",
      title: readString(dataRecord, "alt") ?? "浏览器截图",
      url,
      screenshotUrl: url,
      summary
    };
  }

  if (toolName.startsWith("browser_")) {
    const url = readString(dataRecord, "url");

    if (!url) {
      return undefined;
    }

    return {
      kind: "browser",
      title: readString(dataRecord, "title") ?? "浏览器",
      url,
      summary
    };
  }

  if (toolName === "run_command" || toolName === "run_node" || toolName === "run_python") {
    return {
      kind: "command",
      title: toolName === "run_command" ? "命令执行" : toolName === "run_node" ? "Node.js 执行" : "Python 执行",
      command: readString(inputRecord, "command"),
      exitCode: readNumberOrNull(dataRecord, "exitCode"),
      summary
    };
  }

  if (toolName === "record_note" || toolName === "read_record") {
    const note = asRecord(dataRecord?.recordNote);

    return {
      kind: "note",
      title: readString(note, "title") ?? readString(inputRecord, "title") ?? "工作笔记",
      recordId: readString(note, "id") ?? readString(inputRecord, "id"),
      summary
    };
  }

  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumberOrNull(record: Record<string, unknown> | undefined, key: string): number | null | undefined {
  const value = record?.[key];

  if (typeof value === "number" || value === null) {
    return value;
  }

  return undefined;
}

function estimateJsonSize(value: unknown): number | undefined {
  try {
    return JSON.stringify(value)?.length;
  } catch {
    return undefined;
  }
}

function describeDataKind(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return "array";
  }

  return value === null ? "null" : typeof value;
}

function describeDataKeys(value: unknown): string[] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return Object.keys(value).slice(0, 12);
}

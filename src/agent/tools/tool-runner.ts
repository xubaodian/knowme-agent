import type { AgentTool, ToolExecutionContext, ToolRunResult } from "../types.js";
import type { ToolRegistry } from "./tool-registry.js";

export class ToolRunner {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly context: ToolExecutionContext
  ) {}

  async run<TInput, TOutput extends ToolRunResult = ToolRunResult>(name: string, input: TInput): Promise<TOutput> {
    const tool = this.registry.get(name) as unknown as AgentTool<TInput, TOutput>;
    const inputSummary = tool.summarizeInput?.(input) ?? "执行工具调用。";
    const span = this.context.runLogger.startSpan("tool.run", {
      toolName: tool.name,
      inputSummary,
      inputSize: estimateJsonSize(input)
    });

    this.context.eventBus.emit({
      type: "tool.started",
      title: tool.name,
      detail: inputSummary,
      status: "in_progress",
      flowKind: "tool",
      visibility: "primary"
    });

    try {
      const output = await tool.run(input, this.context);
      const outputSummary = tool.summarizeOutput?.(output) ?? output.summary ?? "工具调用完成。";
      span.end({
        toolName: tool.name,
        outputSummary,
        hasData: output.data !== undefined,
        outputDataKind: describeDataKind(output.data),
        outputDataKeys: describeDataKeys(output.data)
      });

      this.context.eventBus.emit({
        type: "tool.finished",
        title: `${tool.name} completed`,
        detail: outputSummary,
        status: "done",
        flowKind: "tool",
        visibility: "primary"
      });

      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool execution failed.";
      span.fail(error, {
        toolName: tool.name,
        inputSize: estimateJsonSize(input)
      });

      this.context.eventBus.emit({
        type: "tool.finished",
        title: `${tool.name} failed`,
        detail: message,
        status: "failed",
        flowKind: "error",
        visibility: "primary"
      });

      throw error;
    }
  }
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

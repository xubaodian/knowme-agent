import type { LlmMessage, LlmProvider, LlmToolDefinition } from "../llm/types.js";
import { completeWithLogging } from "../llm/llm-runner.js";
import type { RunTraceRecorder } from "../../logging/trace.js";
import { buildEmptyResponseRecoveryPrompt, buildToolFailureRecoveryPrompt } from "../prompts/index.js";
import type { AgentTool } from "../types.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import type { ToolRunner } from "../tools/tool-runner.js";
import type { AgentEventBus } from "./event-bus.js";

export type AgentLoopToolResult = {
  toolName: string;
  toolCallId: string;
  ok: boolean;
  summary?: string;
  data?: unknown;
  error?: string;
};

export type AgentLoopOptions = {
  name: string;
  llmMessages: LlmMessage[];
  toolRegistry: ToolRegistry;
  toolRunner: ToolRunner;
  llmProvider: LlmProvider;
  eventBus: AgentEventBus;
  trace?: RunTraceRecorder;
  parentTraceId?: string;
  allowedTools?: string[];
  toolChoice?: "auto" | "none" | "required";
  maxIterations?: number;
  requireFinalContent?: boolean;
  allowSyntheticFinalContent?: boolean;
};

export type AgentLoopResult = {
  content: string;
  messages: LlmMessage[];
  failedToolCallCount: number;
  toolResults: AgentLoopToolResult[];
};

type ToolCallExecutionResult =
  | {
      ok: true;
      summary?: string;
      data?: unknown;
    }
  | {
      ok: false;
      error: string;
    };

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const maxIterations = options.maxIterations ?? 24;
  const messages = [...options.llmMessages];
  const tools = selectTools(options.toolRegistry.list(), options.allowedTools);
  const toolDefinitions = toLlmToolDefinitions(tools);
  const runLogger = options.eventBus.runLogger;
  let failedToolCallCount = 0;
  let lastToolFailure: { name: string; error: string } | undefined;
  const successfulToolSummaries: string[] = [];
  const toolResults: AgentLoopToolResult[] = [];
  let recoveryPromptCount = 0;
  const maxRecoveryPrompts = 3;

  runLogger.event("agent.loop.start", {
    phase: options.name,
    maxIterations,
    initialMessageCount: messages.length,
    toolCount: toolDefinitions.length,
    toolNames: toolDefinitions.map((tool) => tool.name)
  });
  const loopTraceNodeId = await options.trace?.startNode({
    parentId: options.parentTraceId ?? options.trace.rootNodeId,
    type: "phase",
    title: options.name,
    summary: `Agent loop with ${toolDefinitions.length} tool(s).`,
    input: {
      phase: options.name,
      maxIterations,
      messages,
      allowedTools: options.allowedTools,
      tools: toolDefinitions
    },
    metadata: {
      phase: options.name,
      toolCount: toolDefinitions.length
    }
  });

  try {
    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      runLogger.event("agent.loop.iteration.start", {
        phase: options.name,
        iteration,
        messageCount: messages.length,
        toolCount: toolDefinitions.length
      });
      options.eventBus.emit({
        type: "thought.created",
        title: `${options.name} thinking`,
        detail: `第 ${iteration} 轮模型决策。`,
        status: "running",
        flowKind: "thought",
        visibility: "debug"
      });

      const response = await completeWithLogging({
        provider: options.llmProvider,
        runLogger: options.eventBus.runLogger,
        trace: options.trace,
        traceParentId: loopTraceNodeId,
        phase: options.name,
        iteration,
        request: {
          messages,
          tools: toolDefinitions,
          toolChoice: resolveToolChoice(options.toolChoice, toolDefinitions.length, toolResults),
          temperature: 0.2
        }
      });
      const toolCalls = response.toolCalls ?? [];

      runLogger.event("agent.loop.iteration.response", {
        phase: options.name,
        iteration,
        finishReason: response.finishReason,
        contentChars: response.content.length,
        toolCallCount: toolCalls.length,
        toolCallNames: toolCalls.map((toolCall) => toolCall.name)
      });

      if (toolCalls.length === 0) {
        const content = response.content.trim();

        if (lastToolFailure) {
          if (recoveryPromptCount < maxRecoveryPrompts) {
            recoveryPromptCount += 1;
            runLogger.event(
              "agent.loop.recover_after_tool_failure",
              {
                phase: options.name,
                iteration,
                toolName: lastToolFailure.name,
                error: lastToolFailure.error,
                recoveryPromptCount
              },
              "warn"
            );
            messages.push({
              role: "user",
              content: buildToolFailureRecoveryPrompt(lastToolFailure.name, lastToolFailure.error)
            });
            continue;
          }

          runLogger.event(
            "agent.loop.end_after_tool_failure",
            {
              phase: options.name,
              iteration,
              toolName: lastToolFailure.name,
              error: lastToolFailure.error
            },
            "warn"
          );
          throw new Error(`${options.name} stopped after failed tool call ${lastToolFailure.name}: ${lastToolFailure.error}`);
        }

        if (options.requireFinalContent && !content) {
          if (recoveryPromptCount < maxRecoveryPrompts) {
            recoveryPromptCount += 1;
            runLogger.event(
              "agent.loop.recover_empty_final_content",
              {
                phase: options.name,
                iteration,
                requireFinalContent: true,
                recoveryPromptCount
              },
              "warn"
            );
            messages.push({
              role: "user",
              content: buildEmptyResponseRecoveryPrompt()
            });
            continue;
          }

          if (options.allowSyntheticFinalContent && successfulToolSummaries.length > 0) {
            const syntheticContent = `Tool-only completion. Recent tool results: ${successfulToolSummaries.slice(-6).join(" | ")}`;
            runLogger.event(
              "agent.loop.synthetic_final_content",
              {
                phase: options.name,
                iteration,
                summary: syntheticContent
              },
              "warn"
            );
            await options.trace?.endNode(loopTraceNodeId, {
              status: "success",
              summary: syntheticContent,
              output: {
                reason: "synthetic_final_content",
                content: syntheticContent,
                messages,
                failedToolCallCount
              }
            });

            return {
              content: syntheticContent,
              messages: [
                ...messages,
                {
                  role: "assistant",
                  content: syntheticContent
                }
              ],
              failedToolCallCount,
              toolResults
            };
          }

          runLogger.event(
            "agent.loop.empty_final_content",
            {
              phase: options.name,
              iteration,
              requireFinalContent: true
            },
            "warn"
          );
          throw new Error(`${options.name} stopped without a completion summary.`);
        }

        runLogger.event("agent.loop.end", {
          phase: options.name,
          iteration,
          reason: "assistant_response",
          contentChars: content.length,
          finalMessageCount: messages.length + 1
        });
        await options.trace?.endNode(loopTraceNodeId, {
          status: "success",
          summary: content,
          output: {
            reason: "assistant_response",
            content,
            messages: [
              ...messages,
              {
                role: "assistant",
                content: response.content
              }
            ],
            failedToolCallCount
          }
        });
        return {
          content,
          messages: [
            ...messages,
            {
              role: "assistant",
              content: response.content
            }
          ],
          failedToolCallCount,
          toolResults
        };
      }

      messages.push({
        role: "assistant",
        content: response.content,
        toolCalls
      });

      for (const toolCall of toolCalls) {
        runLogger.event("agent.loop.tool_call.requested", {
          phase: options.name,
          iteration,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          argumentChars: toolCall.arguments.length
        });
        const toolResult = await executeToolCall(options.toolRunner, toolCall.name, toolCall.arguments, {
          traceParentId: loopTraceNodeId,
          traceMetadata: {
            phase: options.name,
            iteration,
            toolCallId: toolCall.id
          }
        });
        toolResults.push({
          toolName: toolCall.name,
          toolCallId: toolCall.id,
          ok: toolResult.ok,
          summary: toolResult.ok ? toolResult.summary : undefined,
          data: toolResult.ok ? toolResult.data : undefined,
          error: toolResult.ok ? undefined : toolResult.error
        });
        if (toolResult.ok) {
          lastToolFailure = undefined;
          successfulToolSummaries.push(`${toolCall.name}: ${toolResult.summary ?? "ok"}`);
        } else {
          failedToolCallCount += 1;
          lastToolFailure = {
            name: toolCall.name,
            error: toolResult.error
          };
        }
        runLogger.event(toolResult.ok ? "agent.loop.tool_call.completed" : "agent.loop.tool_call.failed", {
          phase: options.name,
          iteration,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          ok: toolResult.ok,
          summary: toolResult.ok ? toolResult.summary : undefined,
          error: toolResult.ok ? undefined : toolResult.error
        }, toolResult.ok ? "info" : "warn");

        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          name: toolCall.name,
          content: serializeToolResult(toolResult)
        });
      }
    }

    runLogger.event(
      "agent.loop.max_iterations",
      {
        phase: options.name,
        maxIterations,
        messageCount: messages.length
      },
      "warn"
    );
    throw new Error(`${options.name} exceeded ${maxIterations} LLM/tool iterations.`);
  } catch (error) {
    await options.trace?.endNode(loopTraceNodeId, {
      status: "error",
      summary: error instanceof Error ? error.message : "Agent loop failed.",
      error,
      output: {
        messages,
        failedToolCallCount,
        successfulToolSummaries,
        toolResults
      }
    });
    throw error;
  }
}

function resolveToolChoice(
  requested: AgentLoopOptions["toolChoice"],
  toolCount: number,
  toolResults: AgentLoopToolResult[]
): "auto" | "none" | "required" {
  if (toolCount === 0) {
    return "none";
  }

  if (requested === "required") {
    return toolResults.some((result) => result.ok) ? "auto" : "required";
  }

  return requested ?? "auto";
}

function selectTools(tools: AgentTool[], allowedTools?: string[]): AgentTool[] {
  if (!allowedTools) {
    return tools;
  }

  const allowed = new Set(allowedTools);
  return tools.filter((tool) => allowed.has(tool.name));
}

function toLlmToolDefinitions(tools: AgentTool[]): LlmToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema ?? {
      type: "object",
      additionalProperties: true,
      properties: {}
    }
  }));
}

async function executeToolCall(
  toolRunner: ToolRunner,
  name: string,
  rawArguments: string,
  options: {
    traceParentId?: string;
    traceMetadata?: Record<string, unknown>;
  } = {}
): Promise<ToolCallExecutionResult> {
  try {
    const input = parseToolArguments(rawArguments);
    const output = await toolRunner.run(name, input, options);

    return {
      ok: true,
      summary: output.summary,
      data: output.data
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Tool execution failed."
    };
  }
}

function parseToolArguments(rawArguments: string): unknown {
  if (!rawArguments.trim()) {
    return {};
  }

  return JSON.parse(rawArguments);
}

function serializeToolResult(result: unknown): string {
  return truncate(JSON.stringify(result, null, 2), 12000);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n...<truncated>` : value;
}

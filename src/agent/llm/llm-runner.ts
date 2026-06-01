import { summarizeText, type RunLogger } from "../../logging/index.js";
import type { RunTraceRecorder } from "../../logging/trace.js";
import type { LlmCompletionRequest, LlmCompletionResponse, LlmProvider } from "./types.js";

export type LoggedCompletionInput = {
  provider: LlmProvider;
  request: LlmCompletionRequest;
  runLogger: RunLogger;
  trace?: RunTraceRecorder;
  traceParentId?: string;
  phase: string;
  iteration?: number;
};

export async function completeWithLogging(input: LoggedCompletionInput): Promise<LlmCompletionResponse> {
  const model = input.request.model ?? input.provider.model;
  const traceNodeId = await input.trace?.startNode({
    parentId: input.traceParentId ?? input.trace.rootNodeId,
    type: "llm",
    title: `LLM: ${input.phase}`,
    summary: `Call ${input.provider.id}/${model}`,
    input: {
      provider: input.provider.id,
      model,
      phase: input.phase,
      iteration: input.iteration,
      request: input.request
    },
    metadata: {
      phase: input.phase,
      provider: input.provider.id,
      model,
      iteration: input.iteration
    }
  });
  const span = input.runLogger.startSpan("llm.complete", {
    phase: input.phase,
    provider: input.provider.id,
    model,
    iteration: input.iteration,
    messageCount: input.request.messages.length,
    messageRoles: input.request.messages.map((message) => message.role),
    toolCount: input.request.tools?.length ?? 0,
    toolNames: input.request.tools?.map((tool) => tool.name),
    toolChoice: input.request.toolChoice,
    temperature: input.request.temperature,
    maxTokens: input.request.maxTokens
  });

  try {
    const response = await input.provider.complete(input.request);
    const toolCalls = response.toolCalls ?? [];

    span.end({
      phase: input.phase,
      provider: response.provider,
      model: response.model,
      finishReason: response.finishReason,
      responseChars: response.content.length,
      responseSummary: summarizeText(response.content, 500),
      toolCallCount: toolCalls.length,
      toolCallNames: toolCalls.map((toolCall) => toolCall.name),
      promptTokens: response.usage?.promptTokens,
      completionTokens: response.usage?.completionTokens,
      totalTokens: response.usage?.totalTokens
    });
    await input.trace?.endNode(traceNodeId, {
      status: "success",
      summary: summarizeText(response.content, 240) ?? `${toolCalls.length} tool call(s) requested.`,
      output: response,
      metadata: {
        finishReason: response.finishReason,
        toolCallCount: toolCalls.length,
        totalTokens: response.usage?.totalTokens
      }
    });

    return response;
  } catch (error) {
    span.fail(error, {
      phase: input.phase,
      provider: input.provider.id,
      model
    });
    await input.trace?.endNode(traceNodeId, {
      status: "error",
      error,
      metadata: {
        phase: input.phase,
        provider: input.provider.id,
        model
      }
    });
    throw error;
  }
}

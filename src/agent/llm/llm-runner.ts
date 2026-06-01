import { summarizeText, type RunLogger } from "../../logging/index.js";
import type { LlmCompletionRequest, LlmCompletionResponse, LlmProvider } from "./types.js";

export type LoggedCompletionInput = {
  provider: LlmProvider;
  request: LlmCompletionRequest;
  runLogger: RunLogger;
  phase: string;
  iteration?: number;
};

export async function completeWithLogging(input: LoggedCompletionInput): Promise<LlmCompletionResponse> {
  const model = input.request.model ?? input.provider.model;
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

    return response;
  } catch (error) {
    span.fail(error, {
      phase: input.phase,
      provider: input.provider.id,
      model
    });
    throw error;
  }
}

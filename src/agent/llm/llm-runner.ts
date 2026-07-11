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
  retry?: Partial<LlmRetryOptions>;
  onRetry?: (event: LlmRetryEvent) => void;
};

export type LlmRetryOptions = {
  maxAttempts: number;
  baseDelayMs: number;
};

export type LlmRetryEvent = {
  attempt: number;
  nextAttempt: number;
  maxAttempts: number;
  delayMs: number;
  error: string;
};

const defaultMaxAttempts = 3;
const defaultBaseDelayMs = 500;
const maxConfiguredAttempts = 5;
const maxConfiguredBaseDelayMs = 10_000;

export async function completeWithLogging(input: LoggedCompletionInput): Promise<LlmCompletionResponse> {
  const model = input.request.model ?? input.provider.model;
  const retry = resolveRetryOptions(input.retry);
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

  let attempt = 1;

  while (attempt <= retry.maxAttempts) {
    try {
      const response = await input.provider.complete(input.request);
      const toolCalls = response.toolCalls ?? [];

      span.end({
        phase: input.phase,
        provider: response.provider,
        model: response.model,
        attemptCount: attempt,
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
          attemptCount: attempt,
          finishReason: response.finishReason,
          toolCallCount: toolCalls.length,
          totalTokens: response.usage?.totalTokens
        }
      });

      return response;
    } catch (error) {
      const shouldRetry = attempt < retry.maxAttempts && isRetryableLlmError(error);

      if (shouldRetry) {
        const delayMs = retry.baseDelayMs * 2 ** (attempt - 1);
        const retryEvent: LlmRetryEvent = {
          attempt,
          nextAttempt: attempt + 1,
          maxAttempts: retry.maxAttempts,
          delayMs,
          error: readErrorMessage(error)
        };
        input.runLogger.event(
          "llm.complete.retry",
          {
            phase: input.phase,
            provider: input.provider.id,
            model,
            ...retryEvent,
            errorStatus: readErrorStatus(error),
            errorCode: readErrorCode(error)
          },
          "warn"
        );
        input.onRetry?.(retryEvent);
        await wait(delayMs);
        attempt += 1;
        continue;
      }

      span.fail(error, {
        phase: input.phase,
        provider: input.provider.id,
        model,
        attemptCount: attempt,
        retryable: isRetryableLlmError(error)
      });
      await input.trace?.endNode(traceNodeId, {
        status: "error",
        error,
        metadata: {
          phase: input.phase,
          provider: input.provider.id,
          model,
          attemptCount: attempt,
          retryable: isRetryableLlmError(error)
        }
      });
      throw error;
    }
  }

  throw new Error("LLM completion retry loop ended unexpectedly.");
}

export function isRetryableLlmError(error: unknown): boolean {
  const status = readErrorStatus(error);

  if (status !== undefined) {
    if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) {
      return true;
    }

    if (status >= 400 && status < 500) {
      return false;
    }
  }

  const code = readErrorCode(error)?.toUpperCase();

  if (code && retryableErrorCodes.has(code)) {
    return true;
  }

  const name = error instanceof Error ? error.name : readStringProperty(error, "name");

  if (name && /APIConnectionError|APITimeoutError|RateLimitError|InternalServerError/i.test(name)) {
    return true;
  }

  if (retryableMessagePattern.test(readErrorMessage(error))) {
    return true;
  }

  const cause = readUnknownProperty(error, "cause");
  return cause !== undefined && cause !== error ? isRetryableLlmError(cause) : false;
}

const retryableErrorCodes = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "EAI_AGAIN",
  "ENETDOWN",
  "ENETRESET",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET"
]);

const retryableMessagePattern =
  /timed?\s*out|timeout|rate limit|too many requests|connection reset|socket hang up|fetch failed|network error|temporarily unavailable|service unavailable|gateway timeout|overloaded/i;

function resolveRetryOptions(input: Partial<LlmRetryOptions> | undefined): LlmRetryOptions {
  return {
    maxAttempts: normalizePositiveInteger(input?.maxAttempts, readPositiveInteger(process.env.KNOWME_LLM_MAX_ATTEMPTS), defaultMaxAttempts),
    baseDelayMs: normalizeNonNegativeInteger(input?.baseDelayMs, readNonNegativeInteger(process.env.KNOWME_LLM_RETRY_BASE_MS), defaultBaseDelayMs)
  };
}

function normalizePositiveInteger(...values: Array<number | undefined>): number {
  const value = values.find((candidate) => Number.isInteger(candidate) && (candidate ?? 0) > 0) ?? defaultMaxAttempts;
  return Math.min(value, maxConfiguredAttempts);
}

function normalizeNonNegativeInteger(...values: Array<number | undefined>): number {
  const value = values.find((candidate) => Number.isInteger(candidate) && (candidate ?? -1) >= 0) ?? defaultBaseDelayMs;
  return Math.min(value, maxConfiguredBaseDelayMs);
}

function readPositiveInteger(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readNonNegativeInteger(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function readErrorStatus(error: unknown): number | undefined {
  const status = readUnknownProperty(error, "status") ?? readUnknownProperty(error, "statusCode");
  return typeof status === "number" ? status : typeof status === "string" && /^\d+$/.test(status) ? Number(status) : undefined;
}

function readErrorCode(error: unknown): string | undefined {
  return readStringProperty(error, "code");
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : readStringProperty(error, "message") ?? String(error);
}

function readStringProperty(value: unknown, key: string): string | undefined {
  const property = readUnknownProperty(value, key);
  return typeof property === "string" ? property : undefined;
}

function readUnknownProperty(value: unknown, key: string): unknown {
  return value && typeof value === "object" && key in value ? (value as Record<string, unknown>)[key] : undefined;
}

function wait(delayMs: number): Promise<void> {
  return delayMs > 0 ? new Promise((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve();
}

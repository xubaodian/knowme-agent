import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type {
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmMessage,
  LlmMessageContentPart,
  LlmModelOption,
  LlmProvider,
  LlmProviderId,
  LlmProviderStatus,
  LlmToolCall,
  LlmToolDefinition,
  LlmUsage
} from "../types.js";

export type OpenAiCompatibleProviderOptions = {
  providerId: LlmProviderId;
  apiKey?: string;
  model: string;
  baseUrl: string;
  missingKeyMessage: string;
  defaultHeaders?: Record<string, string>;
  availableModels?: LlmModelOption[];
};

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id: LlmProviderId;
  readonly model: string;

  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly missingKeyMessage: string;
  private readonly defaultHeaders?: Record<string, string>;
  private readonly availableModels?: LlmModelOption[];
  private client?: OpenAI;

  constructor(options: OpenAiCompatibleProviderOptions) {
    this.id = options.providerId;
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl;
    this.missingKeyMessage = options.missingKeyMessage;
    this.defaultHeaders = options.defaultHeaders;
    this.availableModels = options.availableModels;
  }

  getStatus(): LlmProviderStatus {
    return {
      provider: this.id,
      model: this.model,
      configured: Boolean(this.apiKey),
      availableModels: this.availableModels,
      reason: this.apiKey ? undefined : this.missingKeyMessage
    };
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const completion = await this.getClient().chat.completions.create({
      model: request.model ?? this.model,
      messages: request.messages.map(toChatMessage),
      tools: request.tools?.map(toChatTool),
      tool_choice: request.toolChoice,
      temperature: request.temperature,
      max_tokens: request.maxTokens
    });
    const choice = completion.choices[0];

    return {
      provider: this.id,
      model: completion.model,
      id: completion.id,
      content: readTextContent(choice?.message.content),
      finishReason: choice?.finish_reason ?? undefined,
      toolCalls: choice?.message.tool_calls?.flatMap((toolCall) =>
        toolCall.type === "function"
          ? [
              {
                id: toolCall.id,
                name: toolCall.function.name,
                arguments: toolCall.function.arguments
              }
            ]
          : []
      ),
      usage: toUsage(completion.usage)
    };
  }

  private getClient(): OpenAI {
    if (!this.apiKey) {
      throw new Error(this.missingKeyMessage);
    }

    this.client ??= new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      defaultHeaders: this.defaultHeaders
    });

    return this.client;
  }
}

function toChatMessage(message: LlmMessage): ChatCompletionMessageParam {
  if (message.role === "tool") {
    return {
      role: "tool",
      content: readTextMessageContent(message.content),
      tool_call_id: message.toolCallId ?? message.name ?? "tool_call"
    };
  }

  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: readTextMessageContent(message.content) || null,
      name: message.name,
      tool_calls: message.toolCalls?.map(toOpenAiToolCall)
    };
  }

  if (message.role === "user" && Array.isArray(message.content)) {
    return {
      role: "user",
      content: message.content,
      name: message.name
    };
  }

  return {
    role: message.role,
    content: readTextMessageContent(message.content),
    name: message.name
  };
}

function readTextMessageContent(content: LlmMessage["content"]): string {
  if (!Array.isArray(content)) {
    return content ?? "";
  }

  return content
    .map((part) => (part.type === "text" ? part.text : "[image input]"))
    .filter(Boolean)
    .join("\n");
}

function toChatTool(tool: LlmToolDefinition): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  };
}

function toOpenAiToolCall(toolCall: LlmToolCall) {
  return {
    id: toolCall.id,
    type: "function" as const,
    function: {
      name: toolCall.name,
      arguments: toolCall.arguments
    }
  };
}

function readTextContent(content: string | null | undefined): string {
  return content ?? "";
}

function toUsage(usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null | undefined): LlmUsage | undefined {
  if (!usage) {
    return undefined;
  }

  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens
  };
}

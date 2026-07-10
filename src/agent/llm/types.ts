export type LlmProviderId = "openrouter" | "none";

export type LlmModelOption = {
  provider: LlmProviderId;
  id: string;
  label: string;
  description?: string;
};

export type LlmMessageRole = "system" | "user" | "assistant" | "tool";

export type LlmToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type LlmMessageContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

export type LlmMessage = {
  role: LlmMessageRole;
  content?: string | LlmMessageContentPart[];
  name?: string;
  toolCallId?: string;
  toolCalls?: LlmToolCall[];
};

export type LlmToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type LlmCompletionRequest = {
  messages: LlmMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: LlmToolDefinition[];
  toolChoice?: "auto" | "none" | "required";
  metadata?: Record<string, string | number | boolean | null>;
};

export type LlmUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type LlmCompletionResponse = {
  provider: LlmProviderId;
  model: string;
  content: string;
  id?: string;
  finishReason?: string;
  toolCalls?: LlmToolCall[];
  usage?: LlmUsage;
};

export type LlmProviderStatus = {
  provider: LlmProviderId;
  model: string;
  configured: boolean;
  availableModels?: LlmModelOption[];
  reason?: string;
};

export interface LlmProvider {
  readonly id: LlmProviderId;
  readonly model: string;
  getStatus(): LlmProviderStatus;
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
}

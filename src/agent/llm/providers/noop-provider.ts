import type { LlmCompletionRequest, LlmCompletionResponse, LlmProvider, LlmProviderStatus } from "../types.js";

export class NoopLlmProvider implements LlmProvider {
  readonly id = "none" as const;
  readonly model = "none";

  getStatus(): LlmProviderStatus {
    return {
      provider: this.id,
      model: this.model,
      configured: false,
      availableModels: [],
      reason: "未配置 LLM provider。设置 OPENROUTER_API_KEY 后会自动使用 OpenRouter。"
    };
  }

  async complete(_request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    throw new Error("LLM provider is not configured. Set OPENROUTER_API_KEY to enable OpenRouter.");
  }
}

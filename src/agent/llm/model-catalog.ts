import type { LlmModelOption, LlmProviderId } from "./types.js";

export const openRouterModelCatalog = [
  {
    provider: "openrouter",
    id: "moonshotai/kimi-k2.7-code",
    label: "Kimi K2.7 Code",
    description: "Moonshot multimodal coding and agent model via OpenRouter."
  },
  {
    provider: "openrouter",
    id: "deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    description: "DeepSeek fast agent and coding model via OpenRouter."
  },
  {
    provider: "openrouter",
    id: "deepseek/deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    description: "DeepSeek higher-capability long-context model via OpenRouter."
  },
  {
    provider: "openrouter",
    id: "z-ai/glm-5.2",
    label: "GLM 5.2",
    description: "Z.ai long-horizon agent and coding model via OpenRouter."
  },
  {
    provider: "openrouter",
    id: "x-ai/grok-4.5",
    label: "Grok 4.5",
    description: "xAI reasoning model via OpenRouter."
  }
] satisfies LlmModelOption[];

export const defaultOpenRouterModel = "moonshotai/kimi-k2.7-code";

export function listLlmModelOptions(provider?: LlmProviderId): LlmModelOption[] {
  const models = [...openRouterModelCatalog];

  return provider ? models.filter((model) => model.provider === provider) : models;
}

export function findLlmModelOption(modelId: string, provider?: LlmProviderId): LlmModelOption | undefined {
  return listLlmModelOptions(provider).find((model) => model.id === modelId);
}

export function isKnownLlmModel(modelId: string, provider?: LlmProviderId): boolean {
  return Boolean(findLlmModelOption(modelId, provider));
}

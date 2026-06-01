import { openRouterModelCatalog } from "../model-catalog.js";
import { OpenAiCompatibleProvider } from "./openai-compatible-provider.js";

export type OpenRouterProviderOptions = {
  apiKey?: string;
  model: string;
  baseUrl?: string;
  appUrl?: string;
  appTitle?: string;
};

export class OpenRouterProvider extends OpenAiCompatibleProvider {
  constructor(options: OpenRouterProviderOptions) {
    super({
      providerId: "openrouter",
      apiKey: options.apiKey,
      model: options.model,
      baseUrl: options.baseUrl ?? "https://openrouter.ai/api/v1",
      missingKeyMessage: "OPENROUTER_API_KEY 未配置。",
      defaultHeaders: createOpenRouterHeaders(options),
      availableModels: [...openRouterModelCatalog]
    });
  }
}

function createOpenRouterHeaders(options: OpenRouterProviderOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Title": options.appTitle ?? "knowme-agent"
  };

  if (options.appUrl) {
    headers["HTTP-Referer"] = options.appUrl;
  }

  return headers;
}

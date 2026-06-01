import { defaultOpenRouterModel } from "./model-catalog.js";
import { NoopLlmProvider } from "./providers/noop-provider.js";
import { OpenRouterProvider } from "./providers/openrouter-provider.js";
import type { LlmProvider } from "./types.js";

export type LlmProviderEnv = {
  KNOWME_LLM_PROVIDER?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_BASE_URL?: string;
  OPENROUTER_APP_URL?: string;
  OPENROUTER_APP_TITLE?: string;
};

export function createLlmProviderFromEnv(env: LlmProviderEnv = process.env): LlmProvider {
  const providerName = env.KNOWME_LLM_PROVIDER ?? (env.OPENROUTER_API_KEY ? "openrouter" : "none");

  if (providerName === "openrouter") {
    return new OpenRouterProvider({
      apiKey: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_MODEL ?? defaultOpenRouterModel,
      baseUrl: env.OPENROUTER_BASE_URL,
      appUrl: env.OPENROUTER_APP_URL,
      appTitle: env.OPENROUTER_APP_TITLE
    });
  }

  return new NoopLlmProvider();
}

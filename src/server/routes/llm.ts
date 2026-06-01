import { Hono } from "hono";
import { createLlmProviderFromEnv, defaultOpenRouterModel, listLlmModelOptions } from "../../agent/llm/index.js";

export const llmRoutes = new Hono();

llmRoutes.get("/models", (c) => {
  const status = createLlmProviderFromEnv().getStatus();

  return c.json({
    provider: "openrouter",
    configured: status.configured,
    currentModel: status.provider === "openrouter" ? status.model : defaultOpenRouterModel,
    defaultModel: defaultOpenRouterModel,
    models: listLlmModelOptions("openrouter")
  });
});

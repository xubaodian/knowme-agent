import type { JsonValue } from "../../shared.ts";
import type { LlmExecutor, LlmStepResult, RuntimeContext } from "../../runtime/types.ts";

function stringifyPrompt(value: JsonValue | undefined, fallback: string): string {
  if (typeof value === "string") {
    return value;
  }

  if (value !== undefined) {
    return JSON.stringify(value);
  }

  return fallback;
}

function systemPromptForStep(stepType: string): string {
  switch (stepType) {
    case "llm.skill_action":
      return [
        "You are deciding the next action in a constrained skill runtime.",
        "Return valid JSON only.",
        "Choose exactly one action.",
        "Do not explain outside the JSON object.",
        "Do not invent tools outside the allowed set provided in the prompt."
      ].join(" ");
    case "llm.check":
      return "You validate and refine task outputs. Return concise, high-signal text only.";
    case "llm.rewrite":
      return "You rewrite content for clarity while preserving meaning. Return only the rewritten text.";
    case "llm.generate":
    default:
      return "You are the LLM execution layer for an agent runtime. Return concise, task-focused text only.";
  }
}

export class OpenRouterLlmExecutor implements LlmExecutor {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly endpoint: string;

  constructor(input?: { apiKey?: string; model?: string; endpoint?: string }) {
    const apiKey = input?.apiKey ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required for OpenRouterLlmExecutor");
    }

    this.apiKey = apiKey;
    this.model = input?.model ?? process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v4-pro";
    this.endpoint = input?.endpoint ?? "https://openrouter.ai/api/v1/chat/completions";
  }

  async run(
    stepType: string,
    input: Record<string, JsonValue>,
    context: RuntimeContext
  ): Promise<LlmStepResult> {
    const prompt = stringifyPrompt(
      input.prompt ?? input.text ?? input.goal,
      context.request.normalizedMessage
    );

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        max_completion_tokens: 400,
        messages: [
          {
            role: "system",
            content: systemPromptForStep(stepType)
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter request failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("OpenRouter response did not include a text completion");
    }

    return {
      output: content
    };
  }
}

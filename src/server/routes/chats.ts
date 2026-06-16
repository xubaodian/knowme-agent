import { Hono } from "hono";
import { isKnownLlmModel } from "../../agent/llm/index.js";
import { addAssistantMessage, addUserMessage, createChat, getMessages, listChats } from "../services/chat-service.js";
import { createRun, getLatestRunForChat } from "../services/run-service.js";
import { assertKnownSkill, getDefaultSkillName } from "../services/skill-service.js";

export const chatRoutes = new Hono();

chatRoutes.get("/", (c) => c.json({ chats: listChats() }));

chatRoutes.post("/", (c) => {
  const chat = createChat();
  return c.json({ chat }, 201);
});

chatRoutes.get("/:chatId/messages", (c) => {
  const chatId = c.req.param("chatId");
  const messages = getMessages(chatId);

  if (!messages) {
    return c.json({ error: "Chat not found" }, 404);
  }

  return c.json({ messages });
});

chatRoutes.get("/:chatId/latest-run", (c) => {
  const chatId = c.req.param("chatId");
  const messages = getMessages(chatId);

  if (!messages) {
    return c.json({ error: "Chat not found" }, 404);
  }

  return c.json({ run: getLatestRunForChat(chatId) ?? null });
});

chatRoutes.post("/:chatId/messages", async (c) => {
  const chatId = c.req.param("chatId");
  const body = await c.req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const requestedModel = typeof body?.model === "string" ? body.model.trim() : "";
  const model = requestedModel || undefined;
  const requestedSkillName = typeof body?.skillName === "string" ? body.skillName.trim() : "";
  const skillName = requestedSkillName || getDefaultSkillName();

  if (!content) {
    return c.json({ error: "Message content is required" }, 400);
  }

  if (model && !isKnownLlmModel(model, "openrouter")) {
    return c.json({ error: "Unknown OpenRouter model" }, 400);
  }

  try {
    await assertKnownSkill(skillName);
  } catch {
    return c.json({ error: "Unknown skill" }, 400);
  }

  const message = addUserMessage(chatId, content);

  if (!message) {
    return c.json({ error: "Chat not found" }, 404);
  }

  const run = createRun({
    chatId,
    model,
    skillName,
    userMessageId: message.id,
    prompt: content,
    onComplete: (reply, runId) => {
      addAssistantMessage(chatId, reply, runId);
    }
  });

  return c.json({ message, run }, 201);
});

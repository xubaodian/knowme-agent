import type { ChatMessage, ChatSession } from "../../shared/types.js";
import { loadAppState, updateAppState } from "./local-state-store.js";

const chats = new Map<string, ChatSession>();
const messagesByChat = new Map<string, ChatMessage[]>();

const now = () => new Date().toISOString();
const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

hydrateChats();

if (chats.size === 0) {
  createChat("New session");
}

export function listChats(): ChatSession[] {
  return [...chats.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function createChat(title = "New session"): ChatSession {
  const timestamp = now();
  const chat: ChatSession = {
    id: createId("chat"),
    title,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  chats.set(chat.id, chat);
  messagesByChat.set(chat.id, []);
  persistChats();
  return chat;
}

export function getMessages(chatId: string): ChatMessage[] | undefined {
  const messages = messagesByChat.get(chatId);
  return messages ? [...messages] : undefined;
}

export function addUserMessage(chatId: string, content: string): ChatMessage | undefined {
  return addMessage(chatId, "user", content);
}

export function addAssistantMessage(chatId: string, content: string, runId?: string): ChatMessage | undefined {
  return addMessage(chatId, "assistant", content, runId);
}

function addMessage(
  chatId: string,
  role: ChatMessage["role"],
  content: string,
  runId?: string
): ChatMessage | undefined {
  const chat = chats.get(chatId);
  const messages = messagesByChat.get(chatId);

  if (!chat || !messages) {
    return undefined;
  }

  const message: ChatMessage = {
    id: createId("msg"),
    chatId,
    role,
    content,
    createdAt: now(),
    runId
  };

  messages.push(message);
  chat.updatedAt = message.createdAt;

  if (role === "user" && chat.title === "New session") {
    chat.title = content.length > 32 ? `${content.slice(0, 32)}...` : content;
  }

  persistChats();
  return message;
}

function hydrateChats(): void {
  const state = loadAppState();

  for (const chat of state.chats) {
    chats.set(chat.id, { ...chat });
  }

  for (const [chatId, messages] of Object.entries(state.messagesByChat)) {
    messagesByChat.set(
      chatId,
      messages.map((message) => ({ ...message }))
    );
  }
}

function persistChats(): void {
  updateAppState((state) => {
    state.chats = [...chats.values()].map((chat) => ({ ...chat }));
    state.messagesByChat = Object.fromEntries(
      [...messagesByChat.entries()].map(([chatId, messages]) => [
        chatId,
        messages.map((message) => ({ ...message }))
      ])
    );
  });
}

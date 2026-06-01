import type {
  Artifact,
  ChatMessage,
  ChatSession,
  CreateChatResponse,
  ListLlmModelsResponse,
  Run,
  RunTraceDetail,
  RunTraceSummary,
  SendMessageResponse
} from "../../shared/types";

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    },
    ...init
  });

  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload;
}

export async function listChats(): Promise<ChatSession[]> {
  const payload = await request<{ chats: ChatSession[] }>("/api/chats");
  return payload.chats;
}

export async function createChat(): Promise<ChatSession> {
  const payload = await request<CreateChatResponse>("/api/chats", {
    method: "POST",
    body: JSON.stringify({})
  });
  return payload.chat;
}

export async function listMessages(chatId: string): Promise<ChatMessage[]> {
  const payload = await request<{ messages: ChatMessage[] }>(`/api/chats/${chatId}/messages`);
  return payload.messages;
}

export async function sendMessage(chatId: string, content: string, model?: string): Promise<SendMessageResponse> {
  return request<SendMessageResponse>(`/api/chats/${chatId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, model })
  });
}

export async function listLlmModels(): Promise<ListLlmModelsResponse> {
  return request<ListLlmModelsResponse>("/api/llm/models");
}

export async function getRun(runId: string): Promise<Run> {
  const payload = await request<{ run: Run }>(`/api/runs/${runId}`);
  return payload.run;
}

export async function listRunArtifacts(runId: string): Promise<Artifact[]> {
  const payload = await request<{ artifacts: Artifact[] }>(`/api/runs/${runId}/artifacts`);
  return payload.artifacts;
}

export async function listDebugRuns(): Promise<RunTraceSummary[]> {
  const payload = await request<{ runs: RunTraceSummary[] }>("/api/debug/runs");
  return payload.runs;
}

export async function getDebugRunTrace(runId: string): Promise<RunTraceDetail> {
  return request<RunTraceDetail>(`/api/debug/runs/${runId}`);
}

export async function getDebugTraceNodePayload(runId: string, nodeId: string, kind: "input" | "output" | "error"): Promise<unknown> {
  const payload = await request<{ payload: unknown }>(`/api/debug/runs/${runId}/nodes/${nodeId}/${kind}`);
  return payload.payload;
}

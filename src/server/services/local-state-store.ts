import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Artifact, ChatMessage, ChatSession, Run, RunEvent } from "../../shared/types.js";

export type AppStateSnapshot = {
  chats: ChatSession[];
  messagesByChat: Record<string, ChatMessage[]>;
  runs: Run[];
  eventsByRun: Record<string, RunEvent[]>;
  artifactsByRun: Record<string, Artifact[]>;
};

const emptyState = (): AppStateSnapshot => ({
  chats: [],
  messagesByChat: {},
  runs: [],
  eventsByRun: {},
  artifactsByRun: {}
});

let cachedState: AppStateSnapshot | undefined;

export function loadAppState(): AppStateSnapshot {
  cachedState ??= readStateFile();
  return cachedState;
}

export function updateAppState(mutator: (state: AppStateSnapshot) => void): AppStateSnapshot {
  const state = loadAppState();
  mutator(state);
  writeStateFile(state);
  return state;
}

function readStateFile(): AppStateSnapshot {
  const filePath = getStateFilePath();

  if (!existsSync(filePath)) {
    return emptyState();
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<AppStateSnapshot>;

    return {
      chats: Array.isArray(parsed.chats) ? parsed.chats : [],
      messagesByChat: isRecord(parsed.messagesByChat) ? (parsed.messagesByChat as Record<string, ChatMessage[]>) : {},
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      eventsByRun: isRecord(parsed.eventsByRun) ? (parsed.eventsByRun as Record<string, RunEvent[]>) : {},
      artifactsByRun: isRecord(parsed.artifactsByRun) ? (parsed.artifactsByRun as Record<string, Artifact[]>) : {}
    };
  } catch {
    return emptyState();
  }
}

function writeStateFile(state: AppStateSnapshot): void {
  const filePath = getStateFilePath();
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function getStateFilePath(): string {
  return process.env.KNOWME_STATE_FILE || path.join(process.cwd(), ".knowme", "app-state.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}


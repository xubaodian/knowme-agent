import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Artifact, ChatMessage, ChatSession, Run, RunEvent } from "../../shared/types.js";

export type AppStateSnapshot = {
  chats: ChatSession[];
  messagesByChat: Record<string, ChatMessage[]>;
  runs: Run[];
  eventsByRun: Record<string, RunEvent[]>;
  artifactsByRun: Record<string, Artifact[]>;
};

type AppStateIndex = {
  version: 2;
  chats: ChatSession[];
  runs: Run[];
};

type ChatDetail = {
  chatId: string;
  messages: ChatMessage[];
};

type RunDetail = {
  runId: string;
  events: RunEvent[];
  artifacts: Artifact[];
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
  cachedState ??= readStateFiles();
  return cachedState;
}

export function updateAppState(mutator: (state: AppStateSnapshot) => void): AppStateSnapshot {
  const state = loadAppState();
  const before = cloneState(state);
  mutator(state);
  writeChangedState(before, state);
  return state;
}

function readStateFiles(): AppStateSnapshot {
  const filePath = getStateFilePath();

  if (!existsSync(filePath)) {
    return emptyState();
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<AppStateSnapshot & AppStateIndex>;

    if (parsed.version === 2) {
      return readSplitState(parsed);
    }

    const legacyState = normalizeLegacyState(parsed);
    try {
      const backupPath = `${filePath}.legacy-v1.bak`;
      if (!existsSync(backupPath)) copyFileSync(filePath, backupPath);
      writeFullState(legacyState);
    } catch {
      // Keep serving the successfully parsed legacy state if migration cannot be written yet.
    }
    return legacyState;
  } catch {
    return emptyState();
  }
}

function readSplitState(index: Partial<AppStateIndex>): AppStateSnapshot {
  const chats = Array.isArray(index.chats) ? index.chats : [];
  const runs = Array.isArray(index.runs) ? index.runs : [];
  const messagesByChat: Record<string, ChatMessage[]> = {};
  const eventsByRun: Record<string, RunEvent[]> = {};
  const artifactsByRun: Record<string, Artifact[]> = {};

  for (const chat of chats) {
    const detail = readJsonFile<Partial<ChatDetail>>(getChatDetailPath(chat.id));
    messagesByChat[chat.id] = Array.isArray(detail?.messages) ? detail.messages : [];
  }

  for (const run of runs) {
    const detail = readJsonFile<Partial<RunDetail>>(getRunDetailPath(run.id));
    eventsByRun[run.id] = Array.isArray(detail?.events) ? detail.events : [];
    artifactsByRun[run.id] = Array.isArray(detail?.artifacts) ? detail.artifacts : [];
  }

  return { chats, messagesByChat, runs, eventsByRun, artifactsByRun };
}

function normalizeLegacyState(parsed: Partial<AppStateSnapshot>): AppStateSnapshot {
  return {
    chats: Array.isArray(parsed.chats) ? parsed.chats : [],
    messagesByChat: isRecord(parsed.messagesByChat) ? (parsed.messagesByChat as Record<string, ChatMessage[]>) : {},
    runs: Array.isArray(parsed.runs) ? parsed.runs : [],
    eventsByRun: isRecord(parsed.eventsByRun) ? (parsed.eventsByRun as Record<string, RunEvent[]>) : {},
    artifactsByRun: isRecord(parsed.artifactsByRun) ? (parsed.artifactsByRun as Record<string, Artifact[]>) : {}
  };
}

function writeChangedState(before: AppStateSnapshot, state: AppStateSnapshot): void {
  if (!sameJson(before.chats, state.chats) || !sameJson(before.runs, state.runs)) {
    writeIndex(state);
  }

  for (const chatId of changedKeys(before.messagesByChat, state.messagesByChat)) {
    writeChatDetail(chatId, state.messagesByChat[chatId] ?? []);
  }

  const changedRunIds = new Set([
    ...changedKeys(before.eventsByRun, state.eventsByRun),
    ...changedKeys(before.artifactsByRun, state.artifactsByRun)
  ]);

  for (const runId of changedRunIds) {
    writeRunDetail(runId, state.eventsByRun[runId] ?? [], state.artifactsByRun[runId] ?? []);
  }
}

function writeFullState(state: AppStateSnapshot): void {
  writeIndex(state);

  for (const chat of state.chats) {
    writeChatDetail(chat.id, state.messagesByChat[chat.id] ?? []);
  }

  for (const run of state.runs) {
    writeRunDetail(run.id, state.eventsByRun[run.id] ?? [], state.artifactsByRun[run.id] ?? []);
  }
}

function writeIndex(state: AppStateSnapshot): void {
  const index: AppStateIndex = {
    version: 2,
    chats: state.chats,
    runs: state.runs
  };
  writeJsonAtomic(getStateFilePath(), index);
}

function writeChatDetail(chatId: string, messages: ChatMessage[]): void {
  writeJsonAtomic(getChatDetailPath(chatId), { chatId, messages } satisfies ChatDetail);
}

function writeRunDetail(runId: string, events: RunEvent[], artifacts: Artifact[]): void {
  writeJsonAtomic(getRunDetailPath(runId), { runId, events, artifacts } satisfies RunDetail);
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, filePath);
}

function readJsonFile<T>(filePath: string): T | undefined {
  if (!existsSync(filePath)) return undefined;

  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function changedKeys<T>(before: Record<string, T>, after: Record<string, T>): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => !sameJson(before[key], after[key]));
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneState(state: AppStateSnapshot): AppStateSnapshot {
  return structuredClone(state);
}

function getStateFilePath(): string {
  return process.env.KNOWME_STATE_FILE || path.join(process.cwd(), ".knowme", "app-state.json");
}

function getDetailsRoot(): string {
  const filePath = getStateFilePath();
  const extension = path.extname(filePath);
  const stem = path.basename(filePath, extension);
  return path.join(path.dirname(filePath), `${stem}-details`);
}

function getChatDetailPath(chatId: string): string {
  return path.join(getDetailsRoot(), "chats", `${safeSegment(chatId)}.json`);
}

function getRunDetailPath(runId: string): string {
  return path.join(getDetailsRoot(), "runs", `${safeSegment(runId)}.json`);
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

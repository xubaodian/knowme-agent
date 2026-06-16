import { appendFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Run } from "../shared/types.js";
import type {
  RunTraceDetail,
  RunTraceNode,
  RunTraceNodeStatus,
  RunTraceNodeType,
  RunTraceSummary
} from "../shared/types.js";
import { getDefaultLogDir, summarizeText } from "./index.js";

type TraceEntry =
  | {
      event: "node.start";
      node: RunTraceNode;
    }
  | {
      event: "node.end";
      nodeId: string;
      status: RunTraceNodeStatus;
      endedAt: string;
      durationMs?: number;
      summary?: string;
      outputRef?: string;
      errorRef?: string;
      metadata?: Record<string, unknown>;
    };

type CreateRunTraceRecorderInput = {
  run: Run;
  prompt: string;
  model?: string;
  skillName?: string;
  logDir?: string;
};

type StartTraceNodeInput = {
  id?: string;
  parentId?: string;
  type: RunTraceNodeType;
  title: string;
  summary?: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
};

type EndTraceNodeInput = {
  status?: RunTraceNodeStatus;
  summary?: string;
  output?: unknown;
  error?: unknown;
  metadata?: Record<string, unknown>;
};

const traceFileName = "trace.jsonl";
const metaFileName = "meta.json";
const nodesDirName = "nodes";
const validPayloadKinds = new Set(["input", "output", "error"]);

export async function createRunTraceRecorder(input: CreateRunTraceRecorderInput): Promise<RunTraceRecorder> {
  const logDir = input.logDir ?? getDefaultLogDir();
  const folderName = `${formatFolderTimestamp(input.run.createdAt)}_${safePathSegment(input.run.id)}`;
  const dayFolder = input.run.createdAt.slice(0, 10);
  const traceDir = path.join(getTraceRootDir(logDir), dayFolder, folderName);
  const recorder = new RunTraceRecorder({
    folderName,
    logDir,
    model: input.model,
    prompt: input.prompt,
    run: input.run,
    skillName: input.skillName,
    traceDir
  });

  await recorder.initialize(input.model);
  await cleanupOldTraceRuns(logDir);

  return recorder;
}

export class RunTraceRecorder {
  readonly rootNodeId = "run";

  private readonly traceFilePath: string;
  private readonly nodesDir: string;
  private readonly metaFilePath: string;
  private sequence = 0;
  private readonly startedAt = new Date().toISOString();
  private rootEnded = false;
  private readonly startedAtByNode = new Map<string, number>();

  constructor(
    private readonly options: {
      folderName: string;
      logDir: string;
      model?: string;
      prompt: string;
      run: Run;
      skillName?: string;
      traceDir: string;
    }
  ) {
    this.traceFilePath = path.join(options.traceDir, traceFileName);
    this.nodesDir = path.join(options.traceDir, nodesDirName);
    this.metaFilePath = path.join(options.traceDir, metaFileName);
  }

  get traceDir(): string {
    return this.options.traceDir;
  }

  async initialize(model?: string): Promise<void> {
    await this.safeWrite(async () => {
      await mkdir(this.nodesDir, { recursive: true });
      await this.writeMeta({
        runId: this.options.run.id,
        folderName: this.options.folderName,
        status: "running",
        createdAt: this.startedAt,
        updatedAt: this.startedAt,
        chatId: this.options.run.chatId,
        userMessageId: this.options.run.userMessageId,
        model: model ?? this.options.model ?? this.options.run.model,
        skillName: this.options.skillName ?? this.options.run.skillName,
        promptSummary: summarizeText(this.options.prompt, 220)
      });
      await this.startNode({
        id: this.rootNodeId,
        type: "run",
        title: "Agent run",
        summary: summarizeText(this.options.prompt, 180),
        input: {
          run: this.options.run,
          prompt: this.options.prompt
        },
        metadata: {
          model: model ?? this.options.model ?? this.options.run.model,
          skillName: this.options.skillName ?? this.options.run.skillName,
          folderName: this.options.folderName
        }
      });
    });
  }

  async startNode(input: StartTraceNodeInput): Promise<string> {
    const nodeId = safePathSegment(input.id ?? `node_${randomUUID()}`);

    await this.safeWrite(async () => {
      const startedAt = new Date().toISOString();
      const inputRef = input.input === undefined ? undefined : await this.writePayload(nodeId, "input", input.input);
      const node: RunTraceNode = {
        id: nodeId,
        runId: this.options.run.id,
        parentId: input.parentId,
        type: input.type,
        status: "running",
        title: input.title,
        summary: input.summary,
        sequence: ++this.sequence,
        startedAt,
        inputRef,
        metadata: input.metadata
      };

      this.startedAtByNode.set(nodeId, Date.now());
      await this.appendEntry({ event: "node.start", node });
    });

    return nodeId;
  }

  async endNode(nodeId: string | undefined, input: EndTraceNodeInput = {}): Promise<void> {
    if (!nodeId) {
      return;
    }

    await this.safeWrite(async () => {
      const endedAt = new Date().toISOString();
      const outputRef = input.output === undefined ? undefined : await this.writePayload(nodeId, "output", input.output);
      const errorRef = input.error === undefined ? undefined : await this.writePayload(nodeId, "error", normalizeError(input.error));
      const startedAt = this.startedAtByNode.get(nodeId);

      await this.appendEntry({
        event: "node.end",
        nodeId,
        status: input.status ?? (input.error ? "error" : "success"),
        endedAt,
        durationMs: startedAt ? Date.now() - startedAt : undefined,
        summary: input.summary,
        outputRef,
        errorRef,
        metadata: input.metadata
      });
    });
  }

  async event(input: StartTraceNodeInput & EndTraceNodeInput): Promise<string> {
    const nodeId = await this.startNode(input);
    await this.endNode(nodeId, input);
    return nodeId;
  }

  async finish(status: "success" | "error", output?: unknown, error?: unknown): Promise<void> {
    if (this.rootEnded) {
      return;
    }

    this.rootEnded = true;
    const completedAt = new Date().toISOString();
    await this.endNode(this.rootNodeId, {
      status,
      output,
      error,
      summary: status === "success" ? "Run completed." : "Run failed."
    });
    await this.writeMeta({
      runId: this.options.run.id,
      folderName: this.options.folderName,
      status,
      createdAt: this.startedAt,
      updatedAt: completedAt,
      completedAt,
      chatId: this.options.run.chatId,
      userMessageId: this.options.run.userMessageId,
      model: this.options.model ?? this.options.run.model,
      skillName: this.options.skillName ?? this.options.run.skillName,
      promptSummary: summarizeText(this.options.prompt, 220),
      durationMs: Date.parse(completedAt) - Date.parse(this.startedAt)
    });
  }

  private async writeMeta(summary: RunTraceSummary): Promise<void> {
    await writeJsonFile(this.metaFilePath, summary);
  }

  private async appendEntry(entry: TraceEntry): Promise<void> {
    await appendFile(this.traceFilePath, `${stringifyJsonLine(entry)}\n`, "utf8");
  }

  private async writePayload(nodeId: string, kind: "input" | "output" | "error", payload: unknown): Promise<string> {
    const fileName = `${safePathSegment(nodeId)}.${kind}.json`;
    const absolutePath = path.join(this.nodesDir, fileName);

    await writeJsonFile(absolutePath, payload);

    return `${nodesDirName}/${fileName}`;
  }

  private async safeWrite(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch {
      // Trace recording must never break the agent run itself.
    }
  }
}

export async function listRunTraces(logDir = getDefaultLogDir()): Promise<RunTraceSummary[]> {
  const traceDirs = await listTraceDirs(logDir);
  const summaries: Array<RunTraceSummary | undefined> = await Promise.all(
    traceDirs.map(async (traceDir) => {
      const summary = await readJsonFile<RunTraceSummary>(path.join(traceDir, metaFileName));

      if (!summary) {
        return undefined;
      }

      return {
        ...summary,
        nodeCount: summary.nodeCount ?? (await countTraceNodes(path.join(traceDir, traceFileName)))
      };
    })
  );
  const presentSummaries = summaries.filter((summary): summary is RunTraceSummary => summary !== undefined);

  return presentSummaries.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function readRunTrace(runId: string, logDir = getDefaultLogDir()): Promise<RunTraceDetail | undefined> {
  const traceDir = await resolveTraceDirByRunId(logDir, runId);

  if (!traceDir) {
    return undefined;
  }

  const summary = await readJsonFile<RunTraceSummary>(path.join(traceDir, metaFileName));

  if (!summary) {
    return undefined;
  }

  const nodes = await readTraceNodes(path.join(traceDir, traceFileName));

  return {
    run: {
      ...summary,
      nodeCount: nodes.length
    },
    nodes
  };
}

export async function readRunTraceNodePayload(
  runId: string,
  nodeId: string,
  kind: "input" | "output" | "error",
  logDir = getDefaultLogDir()
): Promise<unknown | undefined> {
  if (!validPayloadKinds.has(kind) || !isSafePathSegment(nodeId)) {
    return undefined;
  }

  const traceDir = await resolveTraceDirByRunId(logDir, runId);

  if (!traceDir) {
    return undefined;
  }

  return readJsonFile(path.join(traceDir, nodesDirName, `${nodeId}.${kind}.json`));
}

function getTraceRootDir(logDir: string): string {
  return path.join(logDir, "runs");
}

async function listTraceDirs(logDir: string): Promise<string[]> {
  const traceRoot = getTraceRootDir(logDir);

  try {
    const dayEntries = await readdir(traceRoot, { withFileTypes: true });
    const traceDirs: string[] = [];

    for (const dayEntry of dayEntries) {
      if (!dayEntry.isDirectory()) {
        continue;
      }

      const dayPath = path.join(traceRoot, dayEntry.name);
      const runEntries = await readdir(dayPath, { withFileTypes: true });

      for (const runEntry of runEntries) {
        if (runEntry.isDirectory()) {
          traceDirs.push(path.join(dayPath, runEntry.name));
        }
      }
    }

    return traceDirs;
  } catch {
    return [];
  }
}

async function resolveTraceDirByRunId(logDir: string, runId: string): Promise<string | undefined> {
  const traceDirs = await listTraceDirs(logDir);

  for (const traceDir of traceDirs) {
    const summary = await readJsonFile<RunTraceSummary>(path.join(traceDir, metaFileName));

    if (summary?.runId === runId) {
      return traceDir;
    }
  }

  return undefined;
}

async function readTraceNodes(traceFilePath: string): Promise<RunTraceNode[]> {
  const content = await readTextFile(traceFilePath);
  const nodes = new Map<string, RunTraceNode>();

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const entry = parseJson<TraceEntry>(line);

    if (!entry) {
      continue;
    }

    if (entry.event === "node.start") {
      nodes.set(entry.node.id, entry.node);
      continue;
    }

    const current = nodes.get(entry.nodeId);

    if (!current) {
      continue;
    }

    nodes.set(entry.nodeId, {
      ...current,
      status: entry.status,
      endedAt: entry.endedAt,
      durationMs: entry.durationMs,
      summary: entry.summary ?? current.summary,
      outputRef: entry.outputRef ?? current.outputRef,
      errorRef: entry.errorRef ?? current.errorRef,
      metadata: {
        ...current.metadata,
        ...entry.metadata
      }
    });
  }

  return [...nodes.values()].sort((a, b) => a.sequence - b.sequence);
}

async function countTraceNodes(traceFilePath: string): Promise<number> {
  const nodes = await readTraceNodes(traceFilePath);
  return nodes.length;
}

async function cleanupOldTraceRuns(logDir: string): Promise<void> {
  const retentionDays = Number(process.env.KNOWME_LOG_RETENTION_DAYS ?? 2);

  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return;
  }

  const traceRoot = getTraceRootDir(logDir);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  try {
    const dayEntries = await readdir(traceRoot, { withFileTypes: true });

    for (const dayEntry of dayEntries) {
      if (!dayEntry.isDirectory()) {
        continue;
      }

      const dayPath = path.join(traceRoot, dayEntry.name);
      const dayStat = await stat(dayPath);

      if (dayStat.mtimeMs < cutoff) {
        await rm(dayPath, { recursive: true, force: true });
      }
    }
  } catch {
    // Retention is best-effort; lack of old trace folders is fine.
  }
}

async function readJsonFile<T = unknown>(filePath: string): Promise<T | undefined> {
  const content = await readTextFile(filePath);

  if (!content) {
    return undefined;
  }

  return parseJson<T>(content);
}

async function readTextFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function writeJsonFile(filePath: string, payload: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${stringifyJson(payload)}\n`, "utf8");
}

function parseJson<T>(content: string): T | undefined {
  try {
    return JSON.parse(content) as T;
  } catch {
    return undefined;
  }
}

function stringifyJson(payload: unknown): string {
  return JSON.stringify(payload, createJsonReplacer(), 2);
}

function stringifyJsonLine(payload: unknown): string {
  return JSON.stringify(payload, createJsonReplacer());
}

function createJsonReplacer() {
  const seen = new WeakSet<object>();

  return (key: string, value: unknown): unknown => {
    if (isSensitiveKey(key)) {
      return "[REDACTED]";
    }

    if (value instanceof Error) {
      return normalizeError(value);
    }

    if (typeof value === "bigint") {
      return value.toString();
    }

    if (value && typeof value === "object") {
      if (seen.has(value)) {
        return "[Circular]";
      }

      seen.add(value);
    }

    return value;
  };
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause
    };
  }

  return error;
}

function isSensitiveKey(key: string): boolean {
  return /api[_-]?key|authorization|bearer|cookie|password|secret|token/i.test(key);
}

function formatFolderTimestamp(value: string): string {
  const date = new Date(value);
  const pad = (input: number, size = 2) => String(input).padStart(size, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    "-",
    pad(date.getMilliseconds(), 3)
  ].join("");
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function isSafePathSegment(value: string): boolean {
  return /^[a-zA-Z0-9_.-]+$/.test(value);
}

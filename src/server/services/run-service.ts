import { EventEmitter } from "node:events";
import path from "node:path";
import { RunController } from "../../agent/index.js";
import { createLlmProviderFromEnv } from "../../agent/llm/index.js";
import { createRunLogger, getLogger, readLocalLogs } from "../../logging/index.js";
import { createRunTraceRecorder } from "../../logging/trace.js";
import type { Artifact, Run, RunEvent } from "../../shared/types.js";
import { getSkillRegistry } from "./skill-service.js";
import { createLocalRunWorkspace, snapshotSkillToWorkspace } from "./local-run-workspace.js";
import { loadAppState, updateAppState } from "./local-state-store.js";

type CreateRunOptions = {
  chatId: string;
  model?: string;
  skillName?: string;
  userMessageId: string;
  prompt: string;
  onComplete?: (reply: string, runId: string) => void;
};

const runs = new Map<string, Run>();
const eventsByRun = new Map<string, RunEvent[]>();
const artifactsByRun = new Map<string, Artifact[]>();
const emitter = new EventEmitter();
const runController = new RunController();
const logger = getLogger();

const now = () => new Date().toISOString();
const createId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

hydrateRuns();

export function createRun(options: CreateRunOptions): Run {
  const timestamp = now();
  const run: Run = {
    id: createId("run"),
    chatId: options.chatId,
    userMessageId: options.userMessageId,
    model: options.model,
    skillName: options.skillName,
    status: "queued",
    createdAt: timestamp,
    updatedAt: timestamp
  };

  runs.set(run.id, run);
  eventsByRun.set(run.id, []);
  artifactsByRun.set(run.id, []);
  persistRuns();
  logger.info("run.queued", {
    category: "run",
    runId: run.id,
    chatId: run.chatId,
    userMessageId: run.userMessageId,
    model: run.model,
    skillName: run.skillName,
    promptLength: options.prompt.length
  });
  void executeRun(run, options);

  return run;
}

export function getRun(runId: string): Run | undefined {
  return runs.get(runId);
}

export function getLatestRunForChat(chatId: string): Run | undefined {
  return [...runs.values()]
    .filter((run) => run.chatId === chatId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function getRunsForChat(chatId: string): Run[] {
  return [...runs.values()]
    .filter((run) => run.chatId === chatId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((run) => ({ ...run }));
}

export function getRunEvents(runId: string): RunEvent[] {
  return (eventsByRun.get(runId) ?? []).map((event) => ({ ...event }));
}

export function getRunArtifacts(runId: string): Artifact[] {
  return (artifactsByRun.get(runId) ?? []).map((artifact) => ({ ...artifact }));
}

export async function getRunLogs(runId: string) {
  return readLocalLogs({ runId, limit: 300 });
}

export function subscribeRunEvents(runId: string, listener: (event: RunEvent) => void | Promise<void>): () => void {
  const eventName = eventChannel(runId);
  emitter.on(eventName, listener);
  return () => emitter.off(eventName, listener);
}

async function executeRun(run: Run, options: CreateRunOptions) {
  const workspace = await createLocalRunWorkspace(run);
  const runLogger = createRunLogger(
    {
      runId: run.id,
      chatId: run.chatId,
      userMessageId: run.userMessageId
    },
    logger
  );
  const span = runLogger.startSpan("run.execute", {
    workspaceRoot: workspace.filesRoot,
    runWorkspaceRoot: workspace.root,
    skillsRoot: path.join(process.cwd(), "agent", "skills"),
    skillName: run.skillName
  });
  const trace = await createRunTraceRecorder({
    run,
    prompt: options.prompt,
    model: options.model,
    skillName: run.skillName
  });

  try {
    const loadedSkill = await snapshotSkillToWorkspace(
      run.skillName ? await getSkillRegistry().loadSkill(run.skillName) : undefined,
      workspace
    );
    const result = await runController.execute({
      run,
      loadedSkill,
      llmProvider: createLlmProviderFromEnv(
        options.model
          ? {
              ...process.env,
              OPENROUTER_MODEL: options.model
            }
          : process.env
      ),
      prompt: options.prompt,
      workspaceRoot: workspace.filesRoot,
      skillsRoot: workspace.skillRoot,
      runLogger,
      trace,
      onEvent: (event) => {
        if (event.type === "run.started") {
          updateRun(run.id, "running");
        }

        pushRuntimeEvent(event);
      },
      onArtifact: (artifact) => {
        const artifacts = artifactsByRun.get(run.id);
        artifacts?.push(artifact);
        persistRuns();
        runLogger.event("artifact.stored", {
          artifactId: artifact.id,
          artifactKind: artifact.kind,
          artifactTitle: artifact.title,
          displayMode: artifact.display.mode
        });
      }
    });

    options.onComplete?.(result.reply, run.id);
    updateRun(run.id, "completed");
    runLogger.event("run.completed", {
      replyChars: result.reply.length,
      artifactCount: artifactsByRun.get(run.id)?.length ?? 0,
      eventCount: eventsByRun.get(run.id)?.length ?? 0
    });
    await trace.finish("success", {
      reply: result.reply,
      run: getRun(run.id),
      artifactCount: artifactsByRun.get(run.id)?.length ?? 0,
      eventCount: eventsByRun.get(run.id)?.length ?? 0
    });
    span.end({
      replyChars: result.reply.length,
      artifactCount: artifactsByRun.get(run.id)?.length ?? 0,
      eventCount: eventsByRun.get(run.id)?.length ?? 0
    });
    pushServiceEvent(run.id, run.chatId, {
      type: "run.completed",
      title: "Run completed",
      detail: "Agent Runtime 执行完成。",
      status: "completed",
      flowKind: "status",
      visibility: "secondary"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent Runtime failed.";
    updateRun(run.id, "failed");
    runLogger.event(
      "run.failed",
      {
        error: message,
        eventCount: eventsByRun.get(run.id)?.length ?? 0
      },
      "error"
    );
    span.fail(error, {
      eventCount: eventsByRun.get(run.id)?.length ?? 0
    });
    await trace.finish(
      "error",
      {
        run: getRun(run.id),
        eventCount: eventsByRun.get(run.id)?.length ?? 0
      },
      error
    );
    pushServiceEvent(run.id, run.chatId, {
      type: "run.failed",
      title: "Run failed",
      detail: message,
      status: "failed",
      flowKind: "error",
      visibility: "primary"
    });
  }
}

function pushRuntimeEvent(event: RunEvent) {
  const events = eventsByRun.get(event.runId);

  if (!events) {
    return;
  }

  events.push(event);
  persistRuns();
  emitter.emit(eventChannel(event.runId), event);
}

function pushServiceEvent(
  runId: string,
  chatId: string,
  draft: Omit<RunEvent, "chatId" | "createdAt" | "id" | "runId" | "sequence">
) {
  const events = eventsByRun.get(runId);

  if (!events) {
    return;
  }

  const event: RunEvent = {
    id: createId("evt"),
    runId,
    chatId,
    createdAt: now(),
    sequence: events.length + 1,
    ...draft
  };

  events.push(event);
  persistRuns();
  emitter.emit(eventChannel(runId), event);
}

function updateRun(runId: string, status: Run["status"]) {
  const run = runs.get(runId);

  if (!run) {
    return;
  }

  run.status = status;
  run.updatedAt = now();

  if (status === "completed" || status === "failed") {
    run.completedAt = run.updatedAt;
  }

  persistRuns();
}

function eventChannel(runId: string) {
  return `run:${runId}`;
}

function hydrateRuns(): void {
  const state = loadAppState();
  let changed = false;

  for (const storedRun of state.runs) {
    const run = { ...storedRun };

    if (run.status === "queued" || run.status === "running") {
      run.status = "failed";
      run.updatedAt = now();
      run.completedAt = run.updatedAt;
      changed = true;
    }

    runs.set(run.id, run);
  }

  for (const [runId, events] of Object.entries(state.eventsByRun)) {
    const run = runs.get(runId);
    const nextEvents = events.map((event) => ({ ...event }));

    if (run?.status === "failed" && !nextEvents.some((event) => event.type === "run.failed")) {
      nextEvents.push({
        id: createId("evt"),
        runId,
        chatId: run.chatId,
        createdAt: run.updatedAt,
        sequence: nextEvents.length + 1,
        type: "run.failed",
        title: "Run interrupted",
        detail: "服务重启后，之前未完成的 run 已标记为中断。",
        status: "failed",
        flowKind: "error",
        visibility: "primary"
      });
      changed = true;
    }

    eventsByRun.set(runId, nextEvents);
  }

  for (const [runId, artifacts] of Object.entries(state.artifactsByRun)) {
    artifactsByRun.set(
      runId,
      artifacts.map((artifact) => ({ ...artifact }))
    );
  }

  for (const runId of runs.keys()) {
    eventsByRun.set(runId, eventsByRun.get(runId) ?? []);
    artifactsByRun.set(runId, artifactsByRun.get(runId) ?? []);
  }

  if (changed) {
    persistRuns();
  }
}

function persistRuns(): void {
  updateAppState((state) => {
    state.runs = [...runs.values()].map((run) => ({ ...run }));
    state.eventsByRun = Object.fromEntries(
      [...eventsByRun.entries()].map(([runId, events]) => [
        runId,
        events.map((event) => ({ ...event }))
      ])
    );
    state.artifactsByRun = Object.fromEntries(
      [...artifactsByRun.entries()].map(([runId, artifacts]) => [
        runId,
        artifacts.map((artifact) => ({ ...artifact }))
      ])
    );
  });
}

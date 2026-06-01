import { EventEmitter } from "node:events";
import path from "node:path";
import { RunController } from "../../agent/index.js";
import { createLlmProviderFromEnv } from "../../agent/llm/index.js";
import { createRunLogger, getLogger, readLocalLogs } from "../../logging/index.js";
import { createRunTraceRecorder } from "../../logging/trace.js";
import type { Artifact, Run, RunEvent } from "../../shared/types.js";

type CreateRunOptions = {
  chatId: string;
  model?: string;
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

export function createRun(options: CreateRunOptions): Run {
  const timestamp = now();
  const run: Run = {
    id: createId("run"),
    chatId: options.chatId,
    userMessageId: options.userMessageId,
    model: options.model,
    status: "queued",
    createdAt: timestamp,
    updatedAt: timestamp
  };

  runs.set(run.id, run);
  eventsByRun.set(run.id, []);
  artifactsByRun.set(run.id, []);
  logger.info("run.queued", {
    category: "run",
    runId: run.id,
    chatId: run.chatId,
    userMessageId: run.userMessageId,
    model: run.model,
    promptLength: options.prompt.length
  });
  void executeRun(run, options);

  return run;
}

export function getRun(runId: string): Run | undefined {
  return runs.get(runId);
}

export function getRunEvents(runId: string): RunEvent[] {
  return [...(eventsByRun.get(runId) ?? [])];
}

export function getRunArtifacts(runId: string): Artifact[] {
  return [...(artifactsByRun.get(runId) ?? [])];
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
  const runLogger = createRunLogger(
    {
      runId: run.id,
      chatId: run.chatId,
      userMessageId: run.userMessageId
    },
    logger
  );
  const span = runLogger.startSpan("run.execute", {
    workspaceRoot: process.cwd(),
    skillsRoot: path.join(process.cwd(), "agent", "skills")
  });
  const trace = await createRunTraceRecorder({
    run,
    prompt: options.prompt,
    model: options.model
  });

  try {
    const result = await runController.execute({
      run,
      llmProvider: createLlmProviderFromEnv(
        options.model
          ? {
              ...process.env,
              OPENROUTER_MODEL: options.model
            }
          : process.env
      ),
      prompt: options.prompt,
      workspaceRoot: process.cwd(),
      skillsRoot: path.join(process.cwd(), "agent", "skills"),
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
}

function eventChannel(runId: string) {
  return `run:${runId}`;
}

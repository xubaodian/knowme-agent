import type {
  Artifact,
  ChatMessage,
  Run,
  RunEvent,
  RunEventToolPayload,
  RunEventTodoPayload,
  RunEventWorkbenchResource,
  RunStatus
} from "./types.js";

export type RunFlowViewModel = {
  run: Run;
  planning?: RunFlowPlanning;
  todos: RunFlowTodo[];
  runActions: RunFlowAction[];
  runArtifacts: Artifact[];
  workbenchResources: RunWorkbenchResource[];
  finalMessages: ChatMessage[];
};

export type RunFlowPlanning = {
  goal?: string;
  status: "running" | "completed";
  todos: RunFlowTodoPlanItem[];
};

export type RunFlowTodoPlanItem = {
  id: string;
  title: string;
  description?: string;
  expectedOutput?: string;
  doneCriteria: string[];
  status?: RunFlowTodoStatus;
};

export type RunFlowTodo = RunFlowTodoPlanItem & {
  status: RunFlowTodoStatus;
  summary?: string;
  artifactRefs: string[];
  fileRefs: string[];
  evidenceRefs: string[];
  actions: RunFlowAction[];
  artifacts: Artifact[];
};

export type RunFlowTodoStatus = "pending" | "in_progress" | "completed" | "failed";

export type RunFlowAction = {
  id: string;
  title: string;
  detail?: string;
  status: "running" | "completed" | "failed";
  toolName?: string;
  stepId?: string;
  sequence: number;
  durationMs?: number;
  eventIds: string[];
  resource?: RunWorkbenchResource;
};

export type RunWorkbenchResource = RunEventWorkbenchResource & {
  id: string;
  eventId: string;
  sequence: number;
  stepId?: string;
  status: "running" | "completed" | "failed";
  toolName?: string;
};

type MutableAction = RunFlowAction & {
  startedAt?: string;
};

const ignoredToolNames = new Set(["plan_todos", "finish_task"]);

export function buildRunFlowViewModel(input: {
  run: Run;
  events: RunEvent[];
  artifacts: Artifact[];
  assistantMessages: ChatMessage[];
}): RunFlowViewModel {
  const events = [...input.events].sort(compareEvents);
  const artifactsById = new Map(input.artifacts.map((artifact) => [artifact.id, artifact]));
  const todoOrder: string[] = [];
  const todos = new Map<string, RunFlowTodo>();
  const actionById = new Map<string, MutableAction>();
  const workbenchResources = new Map<string, RunWorkbenchResource>();
  const artifactIdsByTodo = new Map<string, Set<string>>();
  const runArtifactIds = new Set<string>();
  let planning: RunFlowPlanning | undefined;

  for (const event of events) {
    if (event.payload?.plan || event.payload?.todo || isPlanningEvent(event)) {
      planning = planning ?? { status: "running", todos: [] };
      planning.goal = event.payload?.plan?.goal || planning.goal;
    }

    if (event.payload?.todo || isFallbackTodoEvent(event)) {
      const todo = upsertTodo(todos, todoOrder, event);
      planning = planning ?? { status: "completed", todos: [] };
      planning.status = "completed";
      planning.goal = event.payload?.plan?.goal || planning.goal;
      planning.todos = todoOrder.map((id) => toPlanItem(todos.get(id))).filter(Boolean) as RunFlowTodoPlanItem[];
      continue;
    }

    if (event.type === "tool.started" || event.type === "tool.finished") {
      const toolPayload = getToolPayload(event);

      if (ignoredToolNames.has(toolPayload.name)) {
        continue;
      }

      const action = upsertAction(actionById, event, toolPayload);
      const stepId = action.stepId;

      if (action.resource) {
        workbenchResources.set(action.resource.id, action.resource);
      }

      if (stepId && todos.has(stepId)) {
        const todo = todos.get(stepId);

        if (todo && !todo.actions.some((item) => item.id === action.id)) {
          todo.actions.push(action);
        }
      }

      continue;
    }

    if (event.type === "artifact.created" && event.artifactId) {
      const artifact = event.payload?.artifact ?? artifactsById.get(event.artifactId);

      if (!artifact || artifact.display.mode === "hidden") {
        continue;
      }

      if (event.stepId && todos.has(event.stepId)) {
        addArtifactToTodo(artifactIdsByTodo, event.stepId, artifact.id);
      } else {
        runArtifactIds.add(artifact.id);
      }
    }

    if (event.flowKind === "summary" && event.stepId && todos.has(event.stepId)) {
      const todo = todos.get(event.stepId);

      if (todo && !todo.summary) {
        todo.summary = event.detail;
      }
    }
  }

  for (const [todoId, artifactIds] of artifactIdsByTodo) {
    const todo = todos.get(todoId);

    if (!todo) {
      continue;
    }

    todo.artifacts = [...artifactIds].map((id) => artifactsById.get(id)).filter(Boolean) as Artifact[];
  }

  for (const artifact of input.artifacts) {
    if (artifact.display.mode === "hidden") {
      continue;
    }

    const isAttached = [...artifactIdsByTodo.values()].some((ids) => ids.has(artifact.id));

    if (!isAttached) {
      runArtifactIds.add(artifact.id);
    }
  }

  const runActions = [...actionById.values()]
    .filter((action) => !action.stepId || !todos.has(action.stepId))
    .sort((a, b) => a.sequence - b.sequence);

  for (const todo of todos.values()) {
    todo.actions.sort((a, b) => a.sequence - b.sequence);
  }

  if (planning) {
    planning.status = todoOrder.length > 0 ? "completed" : planning.status;
    planning.todos = todoOrder.map((id) => toPlanItem(todos.get(id))).filter(Boolean) as RunFlowTodoPlanItem[];
  }

  return {
    run: input.run,
    planning,
    todos: todoOrder.map((id) => todos.get(id)).filter(Boolean) as RunFlowTodo[],
    runActions,
    runArtifacts: [...runArtifactIds].map((id) => artifactsById.get(id)).filter(Boolean) as Artifact[],
    workbenchResources: [...workbenchResources.values()].sort((a, b) => a.sequence - b.sequence),
    finalMessages: [...input.assistantMessages].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  };
}

function upsertTodo(todos: Map<string, RunFlowTodo>, todoOrder: string[], event: RunEvent): RunFlowTodo {
  const payload = getTodoPayload(event);
  const existing = todos.get(payload.id);
  const next: RunFlowTodo = {
    id: payload.id,
    title: payload.title,
    description: payload.description ?? existing?.description,
    expectedOutput: payload.expectedOutput ?? existing?.expectedOutput,
    doneCriteria: payload.doneCriteria ?? existing?.doneCriteria ?? [],
    status: normalizeTodoStatus(payload.status, event.status, existing?.status),
    summary: payload.summary ?? payload.outputSummary ?? existing?.summary,
    artifactRefs: payload.artifactRefs ?? existing?.artifactRefs ?? [],
    fileRefs: payload.fileRefs ?? existing?.fileRefs ?? [],
    evidenceRefs: payload.evidenceRefs ?? existing?.evidenceRefs ?? [],
    actions: existing?.actions ?? [],
    artifacts: existing?.artifacts ?? []
  };

  if (!existing) {
    todoOrder.push(payload.id);
  }

  todos.set(payload.id, next);
  return next;
}

function upsertAction(actions: Map<string, MutableAction>, event: RunEvent, tool: RunEventToolPayload): MutableAction {
  const id = event.nodeId ?? event.id;
  const existing = actions.get(id);
  const status = normalizeActionStatus(tool.status, event.status);
  const next: MutableAction = {
    id,
    title: toolTitle(tool.name),
    detail: tool.outputSummary ?? tool.inputSummary ?? event.detail,
    status,
    toolName: tool.name,
    stepId: event.stepId,
    sequence: existing?.sequence ?? event.sequence,
    durationMs: tool.durationMs ?? existing?.durationMs,
    eventIds: existing ? [...new Set([...existing.eventIds, event.id])] : [event.id],
    resource: tool.resource
      ? {
          ...tool.resource,
          id: `${id}:resource`,
          eventId: event.id,
          sequence: event.sequence,
          stepId: event.stepId,
          status,
          toolName: tool.name
        }
      : existing?.resource,
    startedAt: event.type === "tool.started" ? event.createdAt : existing?.startedAt
  };

  if (existing) {
    Object.assign(existing, next);
    return existing;
  }

  actions.set(id, next);
  return next;
}

function addArtifactToTodo(map: Map<string, Set<string>>, todoId: string, artifactId: string) {
  const ids = map.get(todoId) ?? new Set<string>();

  ids.add(artifactId);
  map.set(todoId, ids);
}

function toPlanItem(todo: RunFlowTodo | undefined): RunFlowTodoPlanItem | undefined {
  if (!todo) {
    return undefined;
  }

  return {
    id: todo.id,
    title: todo.title,
    description: todo.description,
    expectedOutput: todo.expectedOutput,
    doneCriteria: todo.doneCriteria,
    status: todo.status
  };
}

function getTodoPayload(event: RunEvent): RunEventTodoPayload {
  if (event.payload?.todo) {
    return event.payload.todo;
  }

  return {
    id: event.stepId ?? event.id,
    title: event.stepTitle ?? event.title,
    description: event.detail,
    doneCriteria: [],
    status: event.status === "done" ? "completed" : event.status === "in_progress" ? "in_progress" : "pending",
    summary: event.status === "done" ? event.detail : undefined
  };
}

function getToolPayload(event: RunEvent): RunEventToolPayload {
  if (event.payload?.tool) {
    return event.payload.tool;
  }

  const name = event.title.replace(/ completed$| failed$/u, "");

  return {
    name,
    inputSummary: event.type === "tool.started" ? event.detail : undefined,
    outputSummary: event.type === "tool.finished" ? event.detail : undefined,
    status: event.status === "failed" ? "failed" : event.type === "tool.finished" ? "completed" : "running"
  };
}

function isFallbackTodoEvent(event: RunEvent): boolean {
  return event.flowKind === "todo" && Boolean(event.stepId);
}

function isPlanningEvent(event: RunEvent): boolean {
  return event.title === "规划任务" || event.nodeId === "planning";
}

function normalizeTodoStatus(
  payloadStatus: RunEventTodoPayload["status"],
  eventStatus: RunEvent["status"],
  fallback: RunFlowTodoStatus = "pending"
): RunFlowTodoStatus {
  if (payloadStatus) {
    return payloadStatus;
  }

  if (eventStatus === "done" || eventStatus === "completed") {
    return "completed";
  }

  if (eventStatus === "failed") {
    return "failed";
  }

  if (eventStatus === "in_progress" || eventStatus === "running") {
    return "in_progress";
  }

  return fallback;
}

function normalizeActionStatus(toolStatus: RunEventToolPayload["status"], eventStatus: RunEvent["status"]): RunFlowAction["status"] {
  if (toolStatus === "failed" || eventStatus === "failed") {
    return "failed";
  }

  if (toolStatus === "completed" || eventStatus === "done" || eventStatus === "completed") {
    return "completed";
  }

  return "running";
}

function toolTitle(name: string): string {
  switch (name) {
    case "list_files":
      return "列出文件";
    case "read_file":
      return "读取文件";
    case "write_file":
      return "写入文件";
    case "patch_file":
      return "修改文件";
    case "run_command":
      return "执行命令";
    case "run_node":
      return "执行 Node.js";
    case "run_python":
      return "执行 Python";
    case "browser_open_file":
      return "打开浏览器预览";
    case "browser_navigate":
      return "浏览器导航";
    case "browser_click":
      return "浏览器点击";
    case "browser_type":
      return "浏览器输入";
    case "browser_screenshot":
      return "截图验证";
    case "browser_get_dom":
      return "读取页面结构";
    case "publish_artifact":
      return "登记产物";
    case "record_note":
      return "记录笔记";
    case "read_record":
      return "读取笔记";
    default:
      return name;
  }
}

function compareEvents(a: RunEvent, b: RunEvent): number {
  return a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt);
}

export function runStatusLabel(status: RunStatus): string {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
  }
}

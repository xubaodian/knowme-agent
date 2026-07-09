import type { RunEvent } from "../../shared/types.js";
import type { AgentEventBus } from "../core/event-bus.js";
import type { ExecutionPlan, ExecutionTodoDraft, PlanTodosInput, Todo } from "../types.js";

export class TodoManager {
  private goal = "";
  private todos: Todo[] = [];

  constructor(private readonly eventBus: AgentEventBus) {}

  getGoal(): string {
    return this.goal;
  }

  getPlan(): ExecutionPlan {
    return {
      goal: this.goal,
      todos: this.getSnapshot()
    };
  }

  getSnapshot(): Todo[] {
    return this.todos.map(cloneTodo);
  }

  private applySnapshot(input: { todos: ExecutionTodoDraft[] }): Todo[] {
    const todos = normalizeTodos(input.todos);
    validateTodos(todos);

    const previousById = new Map(this.todos.map((todo) => [todo.id, todo]));
    const nextTodos = todos.map(cloneTodo);
    const eventsToEmit: Array<{ type: "todo.created" | "todo.updated"; todo: Todo }> = [];

    for (const todo of nextTodos) {
      const previous = previousById.get(todo.id);

      if (!previous) {
        eventsToEmit.push({ type: "todo.created", todo });
        continue;
      }

      if (hasTodoChanged(previous, todo)) {
        eventsToEmit.push({ type: "todo.updated", todo });
      }
    }

    this.todos = nextTodos;

    for (const event of eventsToEmit) {
      this.emitTodoEvent(event.type, event.todo);
    }

    return this.getSnapshot();
  }

  applyPlan(input: PlanTodosInput): ExecutionPlan {
    const action = input.action ?? (input.todos ? "create" : "update");

    if (typeof input.goal === "string" && input.goal.trim()) {
      this.goal = input.goal.trim();
    }

    if (action === "create") {
      if (!input.todos || input.todos.length === 0) {
        throw new Error("plan_todos create requires at least one todo.");
      }

      this.applySnapshot({ todos: input.todos.map((todo, index) => normalizeDraftTodo(todo, index)) });
      return this.getPlan();
    }

    if (action === "update" && input.todos) {
      this.applySnapshot({ todos: input.todos.map((todo, index) => mergeDraftWithExisting(todo, this.todos[index], index)) });
      return this.getPlan();
    }

    if (action === "update" && !input.todoId) {
      return this.getPlan();
    }

    if (!input.todoId) {
      throw new Error(`plan_todos ${action} requires todoId.`);
    }

    const nextTodos = this.todos.map((todo) => (todo.id === input.todoId ? applyTodoAction(todo, action, input) : todo));

    if (!nextTodos.some((todo) => todo.id === input.todoId)) {
      throw new Error(`Unknown todo id: ${input.todoId}`);
    }

    this.applySnapshot({ todos: nextTodos });
    return this.getPlan();
  }

  private emitTodoEvent(type: "todo.created" | "todo.updated", todo: Todo) {
    this.eventBus.emit({
      type,
      title: todo.title,
      stepId: todo.id,
      stepTitle: todo.title,
      detail: formatTodoDetail(todo),
      status: mapTodoStatus(todo.status),
      flowKind: "todo",
      visibility: "primary",
      payload: {
        todo: toTodoPayload(todo),
        plan: {
          goal: this.goal,
          todoCount: this.todos.length,
          todoIds: this.todos.map((item) => item.id)
        }
      }
    });
  }
}

function validateTodos(todos: Todo[]) {
  const ids = new Set<string>();
  let inProgressCount = 0;

  for (const todo of todos) {
    if (!todo.id.trim()) {
      throw new Error("Todo id is required.");
    }

    if (!todo.title.trim()) {
      throw new Error(`Todo ${todo.id} title is required.`);
    }

    if (!todo.description.trim()) {
      throw new Error(`Todo ${todo.id} description is required.`);
    }

    if (!todo.expectedOutput.trim()) {
      throw new Error(`Todo ${todo.id} expectedOutput is required.`);
    }

    if (!Array.isArray(todo.doneCriteria) || todo.doneCriteria.length === 0) {
      throw new Error(`Todo ${todo.id} doneCriteria is required.`);
    }

    if (ids.has(todo.id)) {
      throw new Error(`Duplicate todo id: ${todo.id}`);
    }

    ids.add(todo.id);

    if (todo.status === "in_progress") {
      inProgressCount += 1;
    }
  }

  if (inProgressCount > 1) {
    throw new Error("Only one todo can be in progress.");
  }
}

function hasTodoChanged(previous: Todo, next: Todo) {
  return (
    previous.title !== next.title ||
    previous.description !== next.description ||
    previous.expectedOutput !== next.expectedOutput ||
    previous.doneCriteria.join("|") !== next.doneCriteria.join("|") ||
    previous.detail !== next.detail ||
    previous.status !== next.status ||
    previous.summary !== next.summary ||
    previous.outputSummary !== next.outputSummary ||
    previous.artifactRefs?.join("|") !== next.artifactRefs?.join("|") ||
    previous.sandboxRefs?.join("|") !== next.sandboxRefs?.join("|") ||
    previous.fileRefs?.join("|") !== next.fileRefs?.join("|") ||
    previous.evidenceRefs?.join("|") !== next.evidenceRefs?.join("|") ||
    previous.nextContext !== next.nextContext ||
    previous.missingCriteria?.join("|") !== next.missingCriteria?.join("|")
  );
}

function mapTodoStatus(status: Todo["status"]): RunEvent["status"] {
  if (status === "completed") {
    return "done";
  }

  return status;
}

function formatTodoDetail(todo: Todo): string {
  const parts = [
    todo.description,
    todo.expectedOutput ? `Expected output: ${todo.expectedOutput}` : undefined,
    todo.doneCriteria.length ? `Done criteria: ${todo.doneCriteria.join("; ")}` : undefined,
    todo.summary || todo.outputSummary ? `Summary: ${todo.summary ?? todo.outputSummary}` : undefined,
    todo.artifactRefs?.length ? `Artifacts: ${todo.artifactRefs.join(", ")}` : undefined,
    todo.fileRefs?.length ? `Files: ${todo.fileRefs.join(", ")}` : undefined,
    todo.evidenceRefs?.length ? `Evidence: ${todo.evidenceRefs.join(", ")}` : undefined,
    todo.sandboxRefs?.length ? `Sandbox: ${todo.sandboxRefs.join(", ")}` : undefined,
    todo.missingCriteria?.length ? `Missing: ${todo.missingCriteria.join("; ")}` : undefined
  ].filter(Boolean);

  return parts.join("\n");
}

function normalizeTodos(todos: ExecutionTodoDraft[]): Todo[] {
  return todos.map((todo, index) => normalizeDraftTodo(todo, index));
}

function normalizeDraftTodo(todo: ExecutionTodoDraft, index: number): Todo {
  const id = normalizeTodoId(todo.id, index);
  const summary = normalizeOptionalString(todo.summary ?? todo.outputSummary);

  return {
    id,
    title: normalizeRequired(todo.title, `Todo ${index + 1}`),
    description: normalizeRequired(todo.description, "Complete this execution unit."),
    expectedOutput: normalizeRequired(todo.expectedOutput, "A concrete observable output."),
    doneCriteria: normalizeStringArray(todo.doneCriteria, ["The expected output exists and is backed by tool results."]),
    detail: normalizeOptionalString((todo as Todo).detail),
    status: todo.status ?? "pending",
    summary,
    outputSummary: normalizeOptionalString(todo.outputSummary ?? summary),
    artifactRefs: normalizeStringArray(todo.artifactRefs),
    sandboxRefs: normalizeStringArray(todo.sandboxRefs),
    fileRefs: normalizeStringArray(todo.fileRefs),
    evidenceRefs: normalizeStringArray(todo.evidenceRefs),
    nextContext: normalizeOptionalString(todo.nextContext),
    missingCriteria: normalizeStringArray(todo.missingCriteria)
  };
}

function mergeDraftWithExisting(draft: ExecutionTodoDraft, existing: Todo | undefined, index: number): Todo {
  if (!existing) {
    return normalizeDraftTodo(draft, index);
  }

  return {
    ...existing,
    ...normalizeDraftTodo(
      {
        ...existing,
        ...draft,
        id: draft.id ?? existing.id,
        title: draft.title ?? existing.title,
        description: draft.description ?? existing.description,
        expectedOutput: draft.expectedOutput ?? existing.expectedOutput,
        doneCriteria: draft.doneCriteria ?? existing.doneCriteria,
        status: draft.status ?? existing.status
      },
      index
    )
  };
}

function applyTodoAction(todo: Todo, action: Exclude<PlanTodosInput["action"], undefined>, input: PlanTodosInput): Todo {
  const status =
    action === "start"
      ? "in_progress"
      : action === "complete"
        ? "completed"
        : action === "fail"
          ? "failed"
          : input.status ?? todo.status;
  const summary = normalizeOptionalString(input.summary ?? input.outputSummary) ?? todo.summary;

  return {
    ...todo,
    title: normalizeOptionalString(input.title) ?? todo.title,
    description: normalizeOptionalString(input.description) ?? todo.description,
    expectedOutput: normalizeOptionalString(input.expectedOutput) ?? todo.expectedOutput,
    doneCriteria: input.doneCriteria ? normalizeStringArray(input.doneCriteria, todo.doneCriteria) : todo.doneCriteria,
    status,
    summary,
    outputSummary: normalizeOptionalString(input.outputSummary ?? input.summary) ?? todo.outputSummary,
    artifactRefs: input.artifactRefs ? normalizeStringArray(input.artifactRefs) : todo.artifactRefs,
    sandboxRefs: input.sandboxRefs ? normalizeStringArray(input.sandboxRefs) : todo.sandboxRefs,
    fileRefs: input.fileRefs ? normalizeStringArray(input.fileRefs) : todo.fileRefs,
    evidenceRefs: input.evidenceRefs ? normalizeStringArray(input.evidenceRefs) : todo.evidenceRefs,
    nextContext: normalizeOptionalString(input.nextContext) ?? todo.nextContext,
    missingCriteria: input.missingCriteria ? normalizeStringArray(input.missingCriteria) : todo.missingCriteria
  };
}

function cloneTodo(todo: Todo): Todo {
  return {
    ...todo,
    doneCriteria: [...todo.doneCriteria],
    artifactRefs: todo.artifactRefs ? [...todo.artifactRefs] : undefined,
    sandboxRefs: todo.sandboxRefs ? [...todo.sandboxRefs] : undefined,
    fileRefs: todo.fileRefs ? [...todo.fileRefs] : undefined,
    evidenceRefs: todo.evidenceRefs ? [...todo.evidenceRefs] : undefined,
    missingCriteria: todo.missingCriteria ? [...todo.missingCriteria] : undefined
  };
}

function toTodoPayload(todo: Todo) {
  return {
    id: todo.id,
    title: todo.title,
    description: todo.description,
    expectedOutput: todo.expectedOutput,
    doneCriteria: [...todo.doneCriteria],
    status: todo.status,
    summary: todo.summary,
    outputSummary: todo.outputSummary,
    artifactRefs: todo.artifactRefs ? [...todo.artifactRefs] : undefined,
    sandboxRefs: todo.sandboxRefs ? [...todo.sandboxRefs] : undefined,
    fileRefs: todo.fileRefs ? [...todo.fileRefs] : undefined,
    evidenceRefs: todo.evidenceRefs ? [...todo.evidenceRefs] : undefined,
    nextContext: todo.nextContext,
    missingCriteria: todo.missingCriteria ? [...todo.missingCriteria] : undefined
  };
}

function normalizeTodoId(id: string | undefined, index: number): string {
  const raw = id?.trim() || `todo-${index + 1}`;
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || `todo-${index + 1}`;
}

function normalizeRequired(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function normalizeStringArray(value: string[] | undefined, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  return value.map((item) => item.trim()).filter(Boolean);
}

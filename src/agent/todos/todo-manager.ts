import type { RunEvent } from "../../shared/types.js";
import type { AgentEventBus } from "../core/event-bus.js";
import type { Todo, WriteTodosInput } from "../types.js";

export class TodoManager {
  private todos: Todo[] = [];

  constructor(private readonly eventBus: AgentEventBus) {}

  getSnapshot(): Todo[] {
    return this.todos.map((todo) => ({ ...todo }));
  }

  applySnapshot(input: WriteTodosInput): Todo[] {
    validateTodos(input.todos);

    const previousById = new Map(this.todos.map((todo) => [todo.id, todo]));
    const nextTodos = input.todos.map((todo) => ({ ...todo }));

    for (const todo of nextTodos) {
      const previous = previousById.get(todo.id);

      if (!previous) {
        this.emitTodoEvent("todo.created", todo);
        continue;
      }

      if (hasTodoChanged(previous, todo)) {
        this.emitTodoEvent("todo.updated", todo);
      }
    }

    this.todos = nextTodos;
    return this.getSnapshot();
  }

  private emitTodoEvent(type: "todo.created" | "todo.updated", todo: Todo) {
    this.eventBus.emit({
      type,
      title: todo.title,
      detail: todo.detail,
      status: mapTodoStatus(todo.status),
      flowKind: "todo",
      visibility: "primary"
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
    previous.detail !== next.detail ||
    previous.status !== next.status
  );
}

function mapTodoStatus(status: Todo["status"]): RunEvent["status"] {
  if (status === "completed") {
    return "done";
  }

  return status;
}

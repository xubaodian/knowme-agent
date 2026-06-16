import type { ContextPack, Todo, TodoCompletion } from "../types.js";

export type TodoContextCommit = {
  todoId: string;
  summary: string;
  facts?: Array<{ key: string; value: string }>;
  artifactIds?: string[];
};

export class ContextManager {
  private readonly commits: TodoContextCommit[] = [];
  private readonly completions: TodoCompletion[] = [];

  commitTodo(commit: TodoContextCommit): void {
    this.commits.push({
      ...commit,
      facts: commit.facts ? [...commit.facts] : undefined,
      artifactIds: commit.artifactIds ? [...commit.artifactIds] : undefined
    });
  }

  commitTodoCompletion(completion: TodoCompletion): void {
    this.completions.push(cloneCompletion(completion));
    this.commitTodo({
      todoId: completion.todoId,
      summary: completion.nextContextSummary || completion.completedWork,
      artifactIds: completion.artifactRefs
    });
  }

  getSharedSummary(): string {
    if (this.completions.length === 0 && this.commits.length === 0) {
      return "暂无上游 todo 输出。";
    }

    if (this.completions.length > 0) {
      return this.completions
        .map((completion) => {
          const refs = [
            completion.artifactRefs.length ? `artifacts=${completion.artifactRefs.join(", ")}` : undefined,
            completion.sandboxRefs.length ? `sandbox=${completion.sandboxRefs.join(", ")}` : undefined
          ].filter(Boolean);

          return `- ${completion.todoId}: ${completion.nextContextSummary || completion.completedWork}${refs.length ? ` (${refs.join("; ")})` : ""}`;
        })
        .join("\n");
    }

    return this.commits.map((commit) => `- ${commit.todoId}: ${commit.summary}`).join("\n");
  }

  getCommits(): TodoContextCommit[] {
    return this.commits.map((commit) => ({
      ...commit,
      facts: commit.facts ? [...commit.facts] : undefined,
      artifactIds: commit.artifactIds ? [...commit.artifactIds] : undefined
    }));
  }

  getCompletions(): TodoCompletion[] {
    return this.completions.map(cloneCompletion);
  }

  buildContextPack(input: {
    userRequest: string;
    skill?: ContextPack["skill"];
    currentTodo: Todo;
    todoPlan: Todo[];
  }): ContextPack {
    return {
      userRequest: input.userRequest,
      skill: input.skill,
      currentTodo: { ...input.currentTodo },
      todoPlan: input.todoPlan.map((todo) => ({ ...todo })),
      previousCompletions: this.getCompletions(),
      carryForwardSummary: this.getSharedSummary()
    };
  }
}

function cloneCompletion(completion: TodoCompletion): TodoCompletion {
  return {
    ...completion,
    outputs: completion.outputs.map((output) => ({ ...output })),
    artifactRefs: [...completion.artifactRefs],
    sandboxRefs: [...completion.sandboxRefs],
    decisions: [...completion.decisions]
  };
}

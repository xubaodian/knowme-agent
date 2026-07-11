import type { ContextPack, ExecutionProfile, SharedContext, Todo, TodoCompletion } from "../types.js";

export type TodoContextCommit = {
  todoId: string;
  summary: string;
  facts?: Array<{ key: string; value: string }>;
  artifactIds?: string[];
  fileRefs?: string[];
  evidenceRefs?: string[];
};

export class ContextManager {
  private readonly commits: TodoContextCommit[] = [];
  private readonly completions: TodoCompletion[] = [];
  private readonly sharedContexts: SharedContext[] = [];

  commitTodo(commit: TodoContextCommit): void {
    this.commits.push({
      ...commit,
      facts: commit.facts ? [...commit.facts] : undefined,
      artifactIds: commit.artifactIds ? [...commit.artifactIds] : undefined,
      fileRefs: commit.fileRefs ? [...commit.fileRefs] : undefined,
      evidenceRefs: commit.evidenceRefs ? [...commit.evidenceRefs] : undefined
    });
  }

  commitTodoCompletion(completion: TodoCompletion): void {
    this.completions.push(cloneCompletion(completion));
    this.commitTodo({
      todoId: completion.todoId,
      summary: completion.nextContextSummary || completion.completedWork,
      artifactIds: completion.artifactRefs,
      fileRefs: completion.fileRefs,
      evidenceRefs: completion.evidenceRefs
    });
  }

  getSharedSummary(): string {
    if (this.completions.length === 0 && this.commits.length === 0 && this.sharedContexts.length === 0) {
      return "暂无上游 todo 输出。";
    }

    const completionSummary = this.getTodoSummary();
    const sharedSummary = this.sharedContexts
      .map((context) => `- Shared by ${context.sourceTodoId ?? "runtime"} · ${context.title}: ${context.content}`)
      .join("\n");

    return [completionSummary, sharedSummary ? `Shared context:\n${sharedSummary}` : undefined].filter(Boolean).join("\n");
  }

  private getTodoSummary(): string {
    const completionSummary = this.completions.length > 0
      ? this.completions
        .map((completion) => {
          const refs = [
            completion.artifactRefs.length ? `artifacts=${completion.artifactRefs.join(", ")}` : undefined,
            completion.fileRefs.length ? `files=${completion.fileRefs.join(", ")}` : undefined,
            completion.evidenceRefs.length ? `evidence=${completion.evidenceRefs.join(", ")}` : undefined,
            completion.sandboxRefs.length ? `sandbox=${completion.sandboxRefs.join(", ")}` : undefined
          ].filter(Boolean);

          return `- ${completion.todoId}: ${completion.nextContextSummary || completion.completedWork}${refs.length ? ` (${refs.join("; ")})` : ""}`;
        })
        .join("\n")
      : this.commits.map((commit) => `- ${commit.todoId}: ${commit.summary}`).join("\n");

    return completionSummary || "暂无上游 todo 输出。";
  }

  getCommits(): TodoContextCommit[] {
    return this.commits.map((commit) => ({
      ...commit,
      facts: commit.facts ? [...commit.facts] : undefined,
      artifactIds: commit.artifactIds ? [...commit.artifactIds] : undefined,
      fileRefs: commit.fileRefs ? [...commit.fileRefs] : undefined,
      evidenceRefs: commit.evidenceRefs ? [...commit.evidenceRefs] : undefined
    }));
  }

  getCompletions(): TodoCompletion[] {
    return this.completions.map(cloneCompletion);
  }

  shareContext(
    input: { title: string; content: string },
    binding: {
      runId: string;
      chatId: string;
      todoId?: string;
      todoTitle?: string;
      executionNodeId?: string;
    }
  ): SharedContext {
    const sharedContext: SharedContext = {
      runId: binding.runId,
      chatId: binding.chatId,
      sourceTodoId: binding.todoId,
      sourceTodoTitle: binding.todoTitle,
      executionNodeId: binding.executionNodeId,
      title: input.title.trim(),
      content: input.content.trim(),
      createdAt: new Date().toISOString()
    };

    if (!sharedContext.title) {
      throw new Error("share_context title is required.");
    }

    if (!sharedContext.content) {
      throw new Error("share_context content is required.");
    }

    if (sharedContext.content.length > 2000) {
      throw new Error("share_context content must be 2000 characters or fewer. Put large content in a workspace file.");
    }

    const existing = this.sharedContexts.find((context) => context.sourceTodoId === sharedContext.sourceTodoId);

    if (existing) {
      existing.title = sharedContext.title;
      existing.content = sharedContext.content;
      existing.executionNodeId = sharedContext.executionNodeId;
      return cloneSharedContext(existing);
    }

    this.sharedContexts.push(sharedContext);
    return cloneSharedContext(sharedContext);
  }

  getSharedContexts(): SharedContext[] {
    return this.sharedContexts.map(cloneSharedContext);
  }

  buildContextPack(input: {
    userRequest: string;
    currentTodo: Todo;
    todoPlan: Todo[];
    profile: ContextPack["profile"];
  }): ContextPack {
    return {
      userRequest: input.userRequest,
      profile: sanitizeProfileForContext(input.profile),
      currentTodo: { ...input.currentTodo },
      todoPlan: input.todoPlan.map((todo) => ({ ...todo })),
      previousCompletions: this.getCompletions(),
      carryForwardSummary: this.getTodoSummary()
    };
  }
}

function cloneCompletion(completion: TodoCompletion): TodoCompletion {
  return {
    ...completion,
    outputs: completion.outputs.map((output) => ({ ...output })),
    artifactRefs: [...completion.artifactRefs],
    sandboxRefs: [...completion.sandboxRefs],
    fileRefs: [...completion.fileRefs],
    evidenceRefs: [...completion.evidenceRefs],
    decisions: [...completion.decisions]
  };
}

function cloneSharedContext(context: SharedContext): SharedContext {
  return { ...context };
}

function sanitizeProfileForContext(profile: ExecutionProfile): ExecutionProfile {
  if (profile.mode === "generic") {
    return { ...profile };
  }

  return {
    mode: "skill",
    skillName: profile.skillName,
    skillContent: profile.skillContent,
    description: profile.description
  };
}

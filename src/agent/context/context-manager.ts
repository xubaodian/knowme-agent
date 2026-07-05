import type { ContextPack, ContextRecordNote, ExecutionProfile, RecordNote, Todo, TodoCompletion } from "../types.js";

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
  private readonly recordNotes: RecordNote[] = [];

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
    if (this.completions.length === 0 && this.commits.length === 0) {
      return "暂无上游 todo 输出。";
    }

    if (this.completions.length > 0) {
      return this.completions
        .map((completion) => {
          const refs = [
            completion.artifactRefs.length ? `artifacts=${completion.artifactRefs.join(", ")}` : undefined,
            completion.fileRefs.length ? `files=${completion.fileRefs.join(", ")}` : undefined,
            completion.evidenceRefs.length ? `evidence=${completion.evidenceRefs.join(", ")}` : undefined,
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
      artifactIds: commit.artifactIds ? [...commit.artifactIds] : undefined,
      fileRefs: commit.fileRefs ? [...commit.fileRefs] : undefined,
      evidenceRefs: commit.evidenceRefs ? [...commit.evidenceRefs] : undefined
    }));
  }

  getCompletions(): TodoCompletion[] {
    return this.completions.map(cloneCompletion);
  }

  recordNote(
    input: { title: string; content: string },
    binding: {
      runId: string;
      chatId: string;
      todoId?: string;
      todoTitle?: string;
      executionNodeId?: string;
    }
  ): RecordNote {
    const note: RecordNote = {
      id: `rec_${crypto.randomUUID()}`,
      runId: binding.runId,
      chatId: binding.chatId,
      todoId: binding.todoId,
      todoTitle: binding.todoTitle,
      executionNodeId: binding.executionNodeId,
      title: input.title.trim(),
      content: input.content.trim(),
      createdAt: new Date().toISOString()
    };

    if (!note.title) {
      throw new Error("record_note title is required.");
    }

    if (!note.content) {
      throw new Error("record_note content is required.");
    }

    this.recordNotes.push(note);
    return cloneRecordNote(note);
  }

  getRecordNotes(): RecordNote[] {
    return this.recordNotes.map(cloneRecordNote);
  }

  getRecordById(id: string): RecordNote | undefined {
    const note = this.recordNotes.find((item) => item.id === id);
    return note ? cloneRecordNote(note) : undefined;
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
      carryForwardSummary: this.getSharedSummary(),
      recordNotes: this.getRecordNotesForContext()
    };
  }

  private getRecordNotesForContext(): ContextRecordNote[] {
    return this.recordNotes.map((note) => {
      const truncated = note.content.length > 2000;
      return {
        ...cloneRecordNote(note),
        content: truncated ? `${note.content.slice(0, 500)}\n...<truncated; read full record by id ${note.id}>` : note.content,
        truncated,
        contentChars: note.content.length
      };
    });
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

function cloneRecordNote(note: RecordNote): RecordNote {
  return { ...note };
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

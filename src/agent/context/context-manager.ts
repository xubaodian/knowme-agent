export type TodoContextCommit = {
  todoId: string;
  summary: string;
  facts?: Array<{ key: string; value: string }>;
  artifactIds?: string[];
};

export class ContextManager {
  private readonly commits: TodoContextCommit[] = [];

  commitTodo(commit: TodoContextCommit): void {
    this.commits.push({
      ...commit,
      facts: commit.facts ? [...commit.facts] : undefined,
      artifactIds: commit.artifactIds ? [...commit.artifactIds] : undefined
    });
  }

  getSharedSummary(): string {
    if (this.commits.length === 0) {
      return "暂无上游 todo 输出。";
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
}

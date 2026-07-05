import type { FinishedTask, TaskStateManager as TaskStateManagerContract } from "../types.js";

export class TaskStateManager implements TaskStateManagerContract {
  private finishedTask: FinishedTask | undefined;

  finish(input: FinishedTask): FinishedTask {
    this.finishedTask = {
      status: input.status,
      answer: input.answer.trim(),
      artifactRefs: [...input.artifactRefs],
      fileRefs: [...input.fileRefs],
      summary: input.summary.trim()
    };

    return this.finishedTask;
  }

  getFinishedTask(): FinishedTask | undefined {
    return this.finishedTask
      ? {
          ...this.finishedTask,
          artifactRefs: [...this.finishedTask.artifactRefs],
          fileRefs: [...this.finishedTask.fileRefs]
        }
      : undefined;
  }
}

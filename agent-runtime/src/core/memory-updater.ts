import type { MemoryRecord } from "../shared.ts";
import type { MemoryStore, RuntimeContext } from "../runtime/types.ts";

export async function writeTaskSummary(
  context: RuntimeContext,
  memoryStore: MemoryStore,
  summary: string
): Promise<MemoryRecord[]> {
  const record: MemoryRecord = {
    id: `mem_${context.request.requestId}`,
    scope: "session",
    type: "task-history",
    userId: context.request.userId,
    sessionId: context.request.sessionId,
    content: summary,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await memoryStore.write(record);
  return [record];
}

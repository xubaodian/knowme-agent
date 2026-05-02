import type { MemoryStore, NormalizedRequest, RuntimeContext, SkillRegistry } from "../runtime/types.ts";

export async function buildRuntimeContext(
  request: NormalizedRequest,
  memoryStore: MemoryStore,
  skillRegistry: SkillRegistry
): Promise<RuntimeContext> {
  const [profileMemory, sessionMemory, availableSkillEntries] = await Promise.all([
    memoryStore.listProfileMemory(request.userId),
    memoryStore.listSessionMemory(request.sessionId),
    skillRegistry.listEntries()
  ]);

  const selectedMemory = [...profileMemory.slice(-5), ...sessionMemory.slice(-10)];

  return {
    request,
    profileMemory,
    sessionMemory,
    selectedMemory,
    availableSkillEntries
  };
}

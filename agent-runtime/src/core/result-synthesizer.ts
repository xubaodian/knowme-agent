import type { AgentResponse, Artifact, MemoryRecord, SandboxCall, SkillExecution, TaskPlan } from "../shared.ts";
import type { RuntimeContext, SkillSelection } from "../runtime/types.ts";

export function synthesizeResponse(input: {
  context: RuntimeContext;
  plan?: TaskPlan;
  selection: SkillSelection;
  skillExecutions: SkillExecution[];
  sandboxCalls: SandboxCall[];
  artifacts: Artifact[];
  memoryWrites: MemoryRecord[];
}): AgentResponse {
  const primary = input.selection.primarySkillId ?? "direct runtime flow";
  const summary = input.skillExecutions.length > 0
    ? `Processed request with ${primary} and produced ${input.artifacts.length} artifact(s).`
    : `Processed request without a selected skill.`;

  return {
    requestId: input.context.request.requestId,
    sessionId: input.context.request.sessionId,
    summary,
    ...(input.plan ? { plan: input.plan } : {}),
    selectedSkillIds: input.selection.selectedSkillIds,
    skillExecutions: input.skillExecutions,
    sandboxCalls: input.sandboxCalls,
    artifacts: input.artifacts,
    memoryWrites: input.memoryWrites
  };
}

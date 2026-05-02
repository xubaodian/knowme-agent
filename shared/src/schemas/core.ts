import type {
  AgentRequest,
  Artifact,
  JsonValue,
  MemoryRecord,
  SandboxCall,
  SkillSpec,
  TaskPlan
} from "../types/core.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (isRecord(value)) {
    return Object.values(value).every(isJsonValue);
  }

  return false;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isAgentRequest(value: unknown): value is AgentRequest {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.requestId === "string" &&
    typeof value.userId === "string" &&
    typeof value.sessionId === "string" &&
    typeof value.message === "string" &&
    Array.isArray(value.attachments)
  );
}

export function isTaskPlan(value: unknown): value is TaskPlan {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.goal === "string" &&
    Array.isArray(value.steps) &&
    Array.isArray(value.dependencies) &&
    isStringArray(value.selectedSkills) &&
    isStringArray(value.requiredCapabilities) &&
    isStringArray(value.expectedOutputs) &&
    isStringArray(value.risks)
  );
}

export function isSkillSpec(value: unknown): value is SkillSpec {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.version === "string" &&
    typeof value.source === "string" &&
    typeof value.format === "string" &&
    isStringArray(value.inputs) &&
    isStringArray(value.outputs) &&
    Array.isArray(value.steps) &&
    isStringArray(value.requires) &&
    isStringArray(value.permissions) &&
    isStringArray(value.tags)
  );
}

export function isSandboxCall(value: unknown): value is SandboxCall {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.callId === "string" &&
    typeof value.taskId === "string" &&
    typeof value.skillId === "string" &&
    typeof value.stepId === "string" &&
    typeof value.provider === "string" &&
    typeof value.capability === "string" &&
    typeof value.action === "string" &&
    isRecord(value.input) &&
    typeof value.status === "string" &&
    typeof value.startedAt === "string"
  );
}

export function isMemoryRecord(value: unknown): value is MemoryRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.scope === "string" &&
    typeof value.type === "string" &&
    typeof value.userId === "string" &&
    typeof value.content === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

export function isArtifact(value: unknown): value is Artifact {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    typeof value.name === "string" &&
    typeof value.path === "string" &&
    typeof value.producer === "string"
  );
}

export function assertJsonRecord(
  value: unknown,
  label: string
): asserts value is Record<string, JsonValue> {
  if (!isRecord(value) || !Object.values(value).every(isJsonValue)) {
    throw new Error(`${label} must be a JSON-serializable object`);
  }
}

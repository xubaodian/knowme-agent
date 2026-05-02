import type { JsonValue } from "../shared.ts";
import type { NormalizedRequest, SandboxTargetRef, SandboxTargetResolver } from "../runtime/types.ts";

function isJsonRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class MetadataSandboxTargetResolver implements SandboxTargetResolver {
  resolve(request: NormalizedRequest): SandboxTargetRef | undefined {
    const metadata = request.metadata;
    if (!metadata || !isJsonRecord(metadata.sandboxTarget)) {
      return undefined;
    }

    const target = metadata.sandboxTarget;
    return {
      ...(typeof target.provider === "string" ? { provider: target.provider } : {}),
      ...(typeof target.instanceId === "string" ? { instanceId: target.instanceId } : {}),
      ...(typeof target.poolId === "string" ? { poolId: target.poolId } : {}),
      ...(typeof target.baseUrl === "string" ? { baseUrl: target.baseUrl } : {}),
      ...(isJsonRecord(target.metadata) ? { metadata: target.metadata } : {})
    };
  }
}

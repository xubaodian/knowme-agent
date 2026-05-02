import type { JsonValue } from "../shared.ts";
import type { SandboxLifecycleManager, SandboxProvider } from "../runtime/types.ts";
import {
  VefaasBrowserSandboxProvider,
  VefaasCodeSandboxProvider,
  VefaasFsSandboxProvider,
  VefaasSandboxLifecycleManager,
  VefaasExecSandboxProvider
} from "./providers/vefaas-aio-http.ts";
import type { VefaasControlPlaneConfig } from "./providers/vefaas-aio-http.ts";

export interface VefaasEnvConfig {
  accessKeyId: string;
  secretAccessKey: string;
  functionId: string;
  endpoint: string;
  controlPlaneEndpoint?: string;
  region: string;
}

function parseRegionFromEndpoint(endpoint: string): string {
  const match = endpoint.match(/(?:apigateway|api|openapi)-([a-z0-9-]+)\./i);
  return match?.[1] ?? "cn-beijing";
}

export function normalizeVefaasAioBaseUrl(endpoint: string): string {
  return endpoint.replace(/\/v1\/sandbox\/?$/i, "");
}

export function loadVefaasEnvConfig(env: NodeJS.ProcessEnv = process.env): VefaasEnvConfig | undefined {
  const accessKeyId = env.VEFAAS_ACCESS_KEY_ID;
  const secretAccessKey = env.VEFAAS_SECRET_ACCESS_KEY;
  const functionId = env.VEFAAS_FUNCTION_ID;
  const endpoint = env.VEFAAS_ENDPOINT;

  if (!accessKeyId || !secretAccessKey || !functionId || !endpoint) {
    return undefined;
  }

  return {
    accessKeyId,
    secretAccessKey,
    functionId,
    endpoint,
    ...(env.VEFAAS_CONTROL_PLANE_ENDPOINT
      ? { controlPlaneEndpoint: env.VEFAAS_CONTROL_PLANE_ENDPOINT }
      : {}),
    region: env.VEFAAS_REGION ?? parseRegionFromEndpoint(endpoint)
  };
}

export function createVefaasProviders(): SandboxProvider[] {
  return [
    new VefaasFsSandboxProvider(),
    new VefaasExecSandboxProvider(),
    new VefaasCodeSandboxProvider(),
    new VefaasBrowserSandboxProvider()
  ];
}

export function createVefaasLifecycleManager(config: VefaasEnvConfig): SandboxLifecycleManager {
  const controlPlaneConfig: VefaasControlPlaneConfig = {
    endpoint: config.controlPlaneEndpoint ?? config.endpoint,
    functionId: config.functionId,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region
  };

  return new VefaasSandboxLifecycleManager(controlPlaneConfig);
}

export function createVefaasSandboxTarget(config: VefaasEnvConfig): Record<string, JsonValue> {
  return {
    provider: "vefaas",
    baseUrl: normalizeVefaasAioBaseUrl(config.endpoint)
  };
}

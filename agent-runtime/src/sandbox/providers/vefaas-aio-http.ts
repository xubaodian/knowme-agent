import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Artifact, JsonValue } from "../../shared.ts";
import type {
  SandboxCallInput,
  SandboxExecutionResult,
  SandboxLifecycleManager,
  SandboxLease,
  SandboxProvider,
  SandboxTargetRef,
} from "../../runtime/types.ts";
import { Service } from "@volcengine/openapi";
import type { OpenApiResponse } from "@volcengine/openapi/lib/base/types";

interface VefaasAioEnvelope<T> {
  success?: boolean;
  message?: string;
  data?: T;
  [key: string]: unknown;
}

interface BrowserSnapshotItem extends Record<string, JsonValue> {
  ref: string;
  role: string;
  label: string;
  text: string;
}

interface VefaasBrowserCache {
  snapshotRefs: Map<string, BrowserSnapshotItem[]>;
}

export interface VefaasControlPlaneConfig {
  endpoint: string;
  functionId: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  apiVersion?: string;
}

export class VefaasSandboxLifecycleManager implements SandboxLifecycleManager {
  private readonly service: Service;
  private readonly pathname: string;
  private readonly functionId: string;
  private readonly apiVersion: string;

  constructor(config: VefaasControlPlaneConfig) {
    const endpointUrl = new URL(config.endpoint);
    this.pathname = endpointUrl.pathname || "/";
    this.functionId = config.functionId;
    this.apiVersion = config.apiVersion ?? "2024-06-06";
    this.service = new Service({
      serviceName: "vefaas",
      defaultVersion: "2024-06-06",
      host: "open.volcengineapi.com",
      region: config.region,
    });
    this.service.setAccessKeyId(config.accessKeyId);
    this.service.setSecretKey(config.secretAccessKey);
  }

  async create(metadata?: Record<string, JsonValue>): Promise<SandboxLease> {
    console.log("create", metadata);
    const response = await this.callControlPlane("CreateSandbox", {
      FunctionId: this.functionId,
      // default config
      CpuMilli: 1000,
      MemoryMB: 2048,
      Timeout: 1200,
      TimeoutUnit: "second",
    });

    const instanceId = this.pickString(response, [
      "Id",
      "SandboxId",
      "id",
      "sandbox_id",
    ]);
    const baseUrl = this.pickString(response, [
      "BaseUrl",
      "Endpoint",
      "Url",
      "base_url",
    ]);

    if (!instanceId) {
      throw new Error(
        "vefaas CreateSandbox response did not include a sandbox id",
      );
    }

    return {
      provider: "vefaas",
      instanceId,
      ...(baseUrl ? { baseUrl } : {}),
      ...(metadata ? { metadata } : {}),
    };
  }

  async describe(instanceId: string): Promise<SandboxLease> {
    const response = await this.callControlPlane("DescribeSandbox", {
      FunctionId: this.functionId,
      SandboxId: instanceId,
    });

    const baseUrl = this.pickString(response, [
      "BaseUrl",
      "Endpoint",
      "Url",
      "base_url",
    ]);
    const status = this.pickString(response, ["Status", "status"]);

    return {
      provider: "vefaas",
      instanceId,
      ...(baseUrl ? { baseUrl } : {}),
      ...(status ? { status } : {}),
    };
  }

  async destroy(instanceId: string): Promise<void> {
    await this.callControlPlane("KillSandbox", {
      FunctionId: this.functionId,
      SandboxId: instanceId,
    });
  }

  private async callControlPlane(
    action: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const response = await this.service.fetchOpenAPI({
      Action: action,
      Version: "2024-06-06",
      method: "POST",
      params: {},
      timeout: 120000,
      headers: { "Content-Type": "application/json" },
      data: { FunctionId: this.functionId, ...payload },
    });
    console.log(
      "=====================config======================",
      payload,
      JSON.stringify(response),
    );
    const responseMetadata =
      typeof response.ResponseMetadata === "object" &&
      response.ResponseMetadata !== null
        ? (response.ResponseMetadata as unknown as Record<string, unknown>)
        : undefined;
    const errorInfo =
      responseMetadata &&
      typeof responseMetadata.Error === "object" &&
      responseMetadata.Error !== null
        ? (responseMetadata.Error as Record<string, unknown>)
        : undefined;

    if (errorInfo) {
      const message =
        typeof errorInfo.Message === "string"
          ? errorInfo.Message
          : JSON.stringify(errorInfo);
      throw new Error(`vefaas control plane request failed: ${message}`);
    }

    if (typeof response.Result === "object" && response.Result !== null) {
      return response.Result as Record<string, unknown>;
    }

    return response as unknown as Record<string, unknown>;
  }

  private pickString(
    source: Record<string, unknown>,
    keys: string[],
  ): string | undefined {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
    return undefined;
  }
}

class VefaasAioHttpClient {
  private readonly baseUrl: string;
  private readonly sandboxId: string | undefined;

  constructor(baseUrl: string, sandboxId?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.sandboxId = sandboxId;
  }

  async getSandboxInfo(): Promise<Record<string, unknown>> {
    return this.requestJson("GET", "/v1/sandbox");
  }

  async readFile(file: string): Promise<Record<string, unknown>> {
    return this.requestJson("POST", "/v1/file/read", { file });
  }

  async writeFile(
    file: string,
    content: string,
  ): Promise<Record<string, unknown>> {
    return this.requestJson("POST", "/v1/file/write", {
      file,
      content,
      append: false,
      leading_newline: false,
    });
  }

  async executeShell(
    command: string,
    sessionId?: string,
  ): Promise<Record<string, unknown>> {
    return this.requestJson("POST", "/v1/shell/exec", {
      command,
      ...(sessionId ? { id: sessionId } : {}),
    });
  }

  async executeNodejs(
    code: string,
    files?: Record<string, string>,
    stdin?: string,
  ): Promise<Record<string, unknown>> {
    return this.requestJson("POST", "/v1/nodejs/execute", {
      code,
      ...(files ? { files } : {}),
      ...(stdin ? { stdin } : {}),
    });
  }

  async executePython(
    code: string,
    sessionId?: string,
  ): Promise<Record<string, unknown>> {
    return this.requestJson("POST", "/v1/jupyter/execute", {
      code,
      ...(sessionId ? { session_id: sessionId } : {}),
    });
  }

  async getBrowserInfo(): Promise<Record<string, unknown>> {
    return this.requestJson("GET", "/v1/browser/info");
  }

  async screenshot(): Promise<Uint8Array> {
    const getResponse = await fetch(`${this.baseUrl}/v1/browser/screenshot`);
    if (getResponse.ok) {
      return new Uint8Array(await getResponse.arrayBuffer());
    }
    const getErrorBody = await getResponse.text().catch(() => "");

    const postResponse = await fetch(`${this.baseUrl}/v1/browser/screenshot`, {
      method: "POST",
    });
    if (!postResponse.ok) {
      const postErrorBody = await postResponse.text().catch(() => "");
      throw new Error(
        `vefaas browser screenshot failed: ${postResponse.status} ${postResponse.statusText}${postErrorBody ? ` - ${postErrorBody}` : getErrorBody ? ` - ${getErrorBody}` : ""}`,
      );
    }
    return new Uint8Array(await postResponse.arrayBuffer());
  }

  async browserAction(
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.requestJson("POST", "/v1/browser/actions", payload);
  }

  private async requestJson(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const url = new URL(`${this.baseUrl}${path}`);
    const normalizedMethod = method.toUpperCase();
    const init: RequestInit = {
      method: normalizedMethod,
    };

    const requestBody =
      normalizedMethod === "GET" || normalizedMethod === "HEAD"
        ? undefined
        : this.withSandboxId(body);

    if (requestBody) {
      init.headers = {
        "content-type": "application/json",
      };
      init.body = JSON.stringify(requestBody);
    }

    if (this.sandboxId && (normalizedMethod === "GET" || normalizedMethod === "HEAD")) {
      url.searchParams.set("sandbox_id", this.sandboxId);
      url.searchParams.set("sandboxId", this.sandboxId);
    }

    const response = await fetch(url, {
      ...init,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `vefaas aio request failed: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ""}`,
      );
    }

    return (await response.json()) as Record<string, unknown>;
  }

  private withSandboxId(
    body?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!this.sandboxId) {
      return body;
    }

    return {
      ...(body ?? {}),
      sandbox_id: this.sandboxId,
      sandboxId: this.sandboxId,
    };
  }
}

function getTargetBaseUrl(target: SandboxTargetRef | undefined): string {
  const baseUrl =
    target?.baseUrl ??
    (typeof target?.metadata?.baseUrl === "string"
      ? target.metadata.baseUrl
      : undefined);

  if (!baseUrl) {
    throw new Error(
      "vefaas sandbox provider requires sandboxTarget.baseUrl or sandboxTarget.metadata.baseUrl",
    );
  }

  return baseUrl.replace(/\/v1\/sandbox\/?$/i, "");
}

function getTargetSandboxId(
  target: SandboxTargetRef | undefined,
): string | undefined {
  return target?.instanceId;
}

function unwrapEnvelope<T extends Record<string, unknown>>(
  payload: Record<string, unknown>,
): T {
  const envelope = payload as VefaasAioEnvelope<T>;
  if (envelope.success === false) {
    throw new Error(envelope.message ?? "vefaas aio request failed");
  }

  if (envelope.data && typeof envelope.data === "object") {
    return envelope.data;
  }

  return payload as T;
}

function toJsonRecord(
  value: Record<string, unknown>,
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => isJsonValue(entry)),
  ) as Record<string, JsonValue>;
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
    return value.every((item) => isJsonValue(item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value).every((item) => isJsonValue(item));
  }

  return false;
}

export class VefaasFsSandboxProvider implements SandboxProvider {
  readonly name = "vefaas";
  readonly capabilityPrefix = "fs.";

  async execute(input: SandboxCallInput): Promise<SandboxExecutionResult> {
    const client = new VefaasAioHttpClient(
      getTargetBaseUrl(input.target),
      getTargetSandboxId(input.target),
    );

    if (input.capability === "fs.read") {
      const file = input.input.path;
      if (typeof file !== "string") {
        throw new Error("fs.read requires a string path");
      }

      const data = unwrapEnvelope<{
        content?: string;
        file?: string;
        line_count?: number;
      }>(await client.readFile(file));
      return {
        output: data.content ?? "",
      };
    }

    if (input.capability === "fs.write") {
      const file = input.input.path;
      const content = input.input.content;
      if (typeof file !== "string" || typeof content !== "string") {
        throw new Error("fs.write requires string path and content");
      }

      const data = unwrapEnvelope<Record<string, unknown>>(
        await client.writeFile(file, content),
      );
      return {
        output: toJsonRecord(data),
      };
    }

    throw new Error(`Unsupported vefaas fs capability: ${input.capability}`);
  }
}

export class VefaasExecSandboxProvider implements SandboxProvider {
  readonly name = "vefaas";
  readonly capabilityPrefix = "exec.";

  async execute(input: SandboxCallInput): Promise<SandboxExecutionResult> {
    const client = new VefaasAioHttpClient(
      getTargetBaseUrl(input.target),
      getTargetSandboxId(input.target),
    );
    const command = input.input.command;
    if (typeof command !== "string") {
      throw new Error("exec.run requires a string command");
    }

    const result = unwrapEnvelope<Record<string, unknown>>(
      await client.executeShell(command),
    );
    return {
      output: toJsonRecord(result),
    };
  }
}

export class VefaasCodeSandboxProvider implements SandboxProvider {
  readonly name = "vefaas";
  readonly capabilityPrefix = "code.";

  async execute(input: SandboxCallInput): Promise<SandboxExecutionResult> {
    const client = new VefaasAioHttpClient(
      getTargetBaseUrl(input.target),
      getTargetSandboxId(input.target),
    );
    const language =
      typeof input.input.language === "string"
        ? input.input.language
        : "javascript";
    const source = input.input.source;

    if (typeof source !== "string") {
      throw new Error("code.run requires a string source");
    }

    if (language === "python") {
      const result = unwrapEnvelope<Record<string, unknown>>(
        await client.executePython(source),
      );
      return {
        output: toJsonRecord(result),
      };
    }

    const result = unwrapEnvelope<Record<string, unknown>>(
      await client.executeNodejs(source),
    );
    return {
      output: toJsonRecord(result),
    };
  }
}

export class VefaasBrowserSandboxProvider implements SandboxProvider {
  readonly name = "vefaas";
  readonly capabilityPrefix = "browser.";
  private readonly cache = new Map<string, VefaasBrowserCache>();

  async execute(input: SandboxCallInput): Promise<SandboxExecutionResult> {
    const client = new VefaasAioHttpClient(
      getTargetBaseUrl(input.target),
      getTargetSandboxId(input.target),
    );

    switch (input.capability) {
      case "browser.open":
        return this.openWithCdp(client, input);
      case "browser.snapshot":
        return this.snapshotWithCdp(client, input);
      case "browser.act":
        return this.actWithCdp(client, input);
      case "browser.extract":
        return this.extractWithCdp(client, input);
      case "browser.screenshot":
        return this.takeScreenshot(client, input);
      default:
        throw new Error(
          `Unsupported vefaas browser capability: ${input.capability}`,
        );
    }
  }

  private getCache(target: SandboxTargetRef | undefined): VefaasBrowserCache {
    const key =
      target?.instanceId ??
      target?.baseUrl ??
      (typeof target?.metadata?.baseUrl === "string"
        ? target.metadata.baseUrl
        : "default");
    let cache = this.cache.get(key);
    if (!cache) {
      cache = {
        snapshotRefs: new Map<string, BrowserSnapshotItem[]>(),
      };
      this.cache.set(key, cache);
    }
    return cache;
  }

  private async openWithCdp(
    client: VefaasAioHttpClient,
    input: SandboxCallInput,
  ): Promise<SandboxExecutionResult> {
    const url = input.input.url;
    if (typeof url !== "string" || url.length === 0) {
      throw new Error("browser.open requires a non-empty url");
    }

    const page = await this.getPage(client);
    await page.goto(url, { waitUntil: "domcontentloaded" });

    return {
      output: {
        url: page.url(),
        title: await page.title(),
      },
    };
  }

  private async snapshotWithCdp(
    client: VefaasAioHttpClient,
    input: SandboxCallInput,
  ): Promise<SandboxExecutionResult> {
    const page = await this.getPage(client);
    const refs = (await page.evaluate(() => {
      const interesting = Array.from(
        document.querySelectorAll(
          "h1,h2,h3,h4,h5,h6,a,button,input,textarea,select,[role='button'],section,article",
        ),
      ).slice(0, 40);

      return interesting.map((element, index) => {
        const ref = `ref_${index + 1}`;
        element.setAttribute("data-knowme-ref", ref);
        const text = (element.textContent ?? "").trim().slice(0, 200);
        const label =
          element.getAttribute("aria-label") ||
          element.getAttribute("name") ||
          element.getAttribute("placeholder") ||
          text ||
          element.tagName.toLowerCase();
        return {
          ref,
          role: element.getAttribute("role") || element.tagName.toLowerCase(),
          label,
          text,
        };
      });
    })) as BrowserSnapshotItem[];

    const cache = this.getCache(input.target);
    cache.snapshotRefs.set(page.url(), refs);

    return {
      output: {
        url: page.url(),
        title: await page.title(),
        refs,
      },
    };
  }

  private async actWithCdp(
    client: VefaasAioHttpClient,
    input: SandboxCallInput,
  ): Promise<SandboxExecutionResult> {
    const ref = input.input.ref;
    const action = input.input.action;
    if (typeof ref !== "string" || typeof action !== "string") {
      throw new Error("browser.act requires ref and action");
    }

    const page = await this.getPage(client);
    const locator = page.locator(`[data-knowme-ref="${ref}"]`).first();

    switch (action) {
      case "click":
        await locator.click();
        break;
      case "type":
        if (typeof input.input.text !== "string") {
          throw new Error("browser.act type requires text");
        }
        await locator.fill(input.input.text);
        break;
      case "select":
        if (typeof input.input.option !== "string") {
          throw new Error("browser.act select requires option");
        }
        await locator.selectOption(input.input.option);
        break;
      case "scroll":
        await locator.scrollIntoViewIfNeeded();
        break;
      default:
        throw new Error(`Unsupported browser act action: ${action}`);
    }

    return {
      output: {
        url: page.url(),
        ref,
        action,
        status: "ok",
      },
    };
  }

  private async extractWithCdp(
    client: VefaasAioHttpClient,
    input: SandboxCallInput,
  ): Promise<SandboxExecutionResult> {
    const page = await this.getPage(client);
    const ref =
      typeof input.input.ref === "string" ? input.input.ref : undefined;

    if (ref) {
      const locator = page.locator(`[data-knowme-ref="${ref}"]`).first();
      const content = await locator.innerText();
      return {
        output: {
          url: page.url(),
          ref,
          content,
        },
      };
    }

    return {
      output: {
        url: page.url(),
        title: await page.title(),
        content: await page.locator("body").innerText(),
      },
    };
  }

  private async takeScreenshot(
    client: VefaasAioHttpClient,
    input: SandboxCallInput,
  ): Promise<SandboxExecutionResult> {
    const bytes = await client.screenshot();
    const artifactPath = join(
      process.cwd(),
      "examples",
      "artifacts",
      `${input.stepId}.png`,
    );
    await writeFile(artifactPath, bytes);

    const artifact: Artifact = {
      id: `artifact_${input.stepId}`,
      type: "image",
      name: `${input.stepId}.png`,
      path: artifactPath,
      producer: input.skillId,
    };

    return {
      output: {
        artifactPath,
        mimeType: "image/png",
      },
      artifact,
    };
  }

  private async getPage(client: VefaasAioHttpClient) {
    const browserInfo = unwrapEnvelope<Record<string, unknown>>(
      await client.getBrowserInfo(),
    );
    const cdpUrl =
      typeof browserInfo.cdp_url === "string"
        ? browserInfo.cdp_url
        : typeof browserInfo.webSocketDebuggerUrl === "string"
          ? browserInfo.webSocketDebuggerUrl
          : undefined;

    if (!cdpUrl) {
      throw new Error("vefaas browser info did not include a cdp_url");
    }

    type MinimalPage = {
      goto(url: string, options?: Record<string, unknown>): Promise<void>;
      url(): string;
      title(): Promise<string>;
      evaluate<T>(fn: () => T): Promise<T>;
      locator(selector: string): {
        first(): {
          click(): Promise<void>;
          fill(text: string): Promise<void>;
          selectOption(value: string): Promise<void>;
          scrollIntoViewIfNeeded(): Promise<void>;
          innerText(): Promise<string>;
        };
        innerText(): Promise<string>;
      };
    };
    type MinimalContext = {
      pages(): MinimalPage[];
      newPage(): Promise<MinimalPage>;
    };
    type MinimalBrowser = {
      contexts(): MinimalContext[];
      newContext(): Promise<MinimalContext>;
    };

    const { chromium } = (await import("playwright-core")) as unknown as {
      chromium: {
        connectOverCDP(url: string): Promise<MinimalBrowser>;
      };
    };

    const browser = await chromium.connectOverCDP(cdpUrl);
    const contexts = browser.contexts();
    const context = contexts[0] ?? (await browser.newContext());
    const pages = context.pages();
    const page = pages[0] ?? (await context.newPage());
    return page;
  }
}

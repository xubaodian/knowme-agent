import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  VefaasBrowserSandboxProvider,
  VefaasCodeSandboxProvider,
  VefaasExecSandboxProvider,
  VefaasFsSandboxProvider,
} from "../agent-runtime/src/sandbox/providers/vefaas-aio-http.ts";
import {
  createVefaasLifecycleManager,
  createVefaasSandboxTarget,
  loadVefaasEnvConfig,
} from "../agent-runtime/src/sandbox/vefaas-factory.ts";

const config = loadVefaasEnvConfig();
if (!config) {
  throw new Error("Missing VEFAAS_* environment configuration");
}

let target = createVefaasSandboxTarget(config);
const request = {
  requestId: `req_vefaas_${Date.now()}`,
  userId: "user_001",
  sessionId: `session_vefaas_${Date.now()}`,
  message: "Run vefaas sandbox smoke tests.",
  attachments: [],
  normalizedMessage: "Run vefaas sandbox smoke tests.",
  requestedCapabilities: [],
};

const results = {
  generatedAt: new Date().toISOString(),
  target,
  lifecycle: {},
  shell: {},
  code: {},
  files: {},
  browser: {},
};

async function capture(bucket, label, fn) {
  try {
    bucket[label] = {
      status: "ok",
      data: await fn(),
    };
  } catch (error) {
    bucket[label] = {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const fsProvider = new VefaasFsSandboxProvider();
const execProvider = new VefaasExecSandboxProvider();
const codeProvider = new VefaasCodeSandboxProvider();
const browserProvider = new VefaasBrowserSandboxProvider();

await capture(results.lifecycle, "create", async () => {
  const manager = createVefaasLifecycleManager(config);
  const lease = await manager.create({
    smoke: true,
  });
  results.lifecycle.createdInstanceId = lease.instanceId;
  target = {
    ...target,
    instanceId: lease.instanceId,
    ...(lease.baseUrl ? { baseUrl: lease.baseUrl } : {}),
  };
  results.target = target;
  return lease;
});

if (!results.lifecycle.createdInstanceId) {
  results.lifecycle.describe = {
    status: "skipped",
    reason: "Create sandbox failed, skipping follow-up operations.",
  };
  results.files.write = {
    status: "skipped",
    reason: "Create sandbox failed, skipping follow-up operations.",
  };
  results.files.read = {
    status: "skipped",
    reason: "Create sandbox failed, skipping follow-up operations.",
  };
  results.shell.exec_python_version = {
    status: "skipped",
    reason: "Create sandbox failed, skipping follow-up operations.",
  };
  results.code.nodejs_execute = {
    status: "skipped",
    reason: "Create sandbox failed, skipping follow-up operations.",
  };
  results.code.python_execute = {
    status: "skipped",
    reason: "Create sandbox failed, skipping follow-up operations.",
  };
  results.browser.open = {
    status: "skipped",
    reason: "Create sandbox failed, skipping follow-up operations.",
  };
  results.browser.snapshot = {
    status: "skipped",
    reason: "Create sandbox failed, skipping follow-up operations.",
  };
  results.browser.extract = {
    status: "skipped",
    reason: "Create sandbox failed, skipping follow-up operations.",
  };
  results.browser.screenshot = {
    status: "skipped",
    reason: "Create sandbox failed, skipping follow-up operations.",
  };
  results.lifecycle.destroy = {
    status: "skipped",
    reason: "Create sandbox failed, nothing to destroy.",
  };
} else {
  await capture(results.lifecycle, "describe", async () => {
    const manager = createVefaasLifecycleManager(config);
    return manager.describe(results.lifecycle.createdInstanceId);
  });

  await capture(results.files, "write", async () =>
    fsProvider.execute({
      request,
      skillId: "vefaas-smoke",
      stepId: "fs_write",
      capability: "fs.write",
      action: "write",
      input: {
        path: "/tmp/knowme-smoke.txt",
        content: "hello from knowme-agent via vefaas",
      },
      target,
    }),
  );

  await capture(results.files, "read", async () =>
    fsProvider.execute({
      request,
      skillId: "vefaas-smoke",
      stepId: "fs_read",
      capability: "fs.read",
      action: "read",
      input: {
        path: "/tmp/knowme-smoke.txt",
      },
      target,
    }),
  );

  await capture(results.shell, "exec_python_version", async () =>
    execProvider.execute({
      request,
      skillId: "vefaas-smoke",
      stepId: "exec_python_version",
      capability: "exec.run",
      action: "run",
      input: {
        command: "python --version",
      },
      target,
    }),
  );

  await capture(results.code, "nodejs_execute", async () =>
    codeProvider.execute({
      request,
      skillId: "vefaas-smoke",
      stepId: "node_execute",
      capability: "code.run",
      action: "run",
      input: {
        language: "javascript",
        source:
          "console.log(JSON.stringify({ runtime: 'node', ok: true, now: new Date().toISOString() }))",
      },
      target,
    }),
  );

  await capture(results.code, "python_execute", async () =>
    codeProvider.execute({
      request,
      skillId: "vefaas-smoke",
      stepId: "python_execute",
      capability: "code.run",
      action: "run",
      input: {
        language: "python",
        source: "print({'runtime': 'python', 'ok': True})",
      },
      target,
    }),
  );

  await capture(results.browser, "open", async () =>
    browserProvider.execute({
      request,
      skillId: "vefaas-smoke",
      stepId: "browser_open",
      capability: "browser.open",
      action: "open",
      input: {
        url: "https://platform.openai.com/docs/overview",
      },
      target,
    }),
  );

  await capture(results.browser, "snapshot", async () =>
    browserProvider.execute({
      request,
      skillId: "vefaas-smoke",
      stepId: "browser_snapshot",
      capability: "browser.snapshot",
      action: "snapshot",
      input: {},
      target,
    }),
  );

  await capture(results.browser, "extract", async () =>
    browserProvider.execute({
      request,
      skillId: "vefaas-smoke",
      stepId: "browser_extract",
      capability: "browser.extract",
      action: "extract",
      input: {},
      target,
    }),
  );

  await capture(results.browser, "screenshot", async () =>
    browserProvider.execute({
      request,
      skillId: "vefaas-smoke",
      stepId: "browser_screenshot",
      capability: "browser.screenshot",
      action: "screenshot",
      input: {
        fullPage: true,
      },
      target,
    }),
  );

  await capture(results.lifecycle, "destroy", async () => {
    const manager = createVefaasLifecycleManager(config);
    await manager.destroy(results.lifecycle.createdInstanceId);
    return { destroyed: true, instanceId: results.lifecycle.createdInstanceId };
  });
}

const outputPath = join(
  process.cwd(),
  "examples",
  "artifacts",
  "vefaas-smoke-results.json",
);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(results, null, 2), "utf8");

console.log(JSON.stringify({ outputPath, results }, null, 2));

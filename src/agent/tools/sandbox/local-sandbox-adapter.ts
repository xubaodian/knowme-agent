import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BrowserScreenshot, BrowserState, CommandResult, PatchEdit, SandboxAdapter } from "./sandbox-adapter.js";

const maxOutputLength = 12_000;
const defaultTimeoutMs = 10_000;

export class LocalSandboxAdapter implements SandboxAdapter {
  private browserState: BrowserState = {
    url: "about:blank",
    title: "Local Browser",
    updatedAt: new Date().toISOString()
  };

  constructor(private readonly root: string) {}

  executeCommand(input: { command: string; cwd?: string; timeoutMs?: number }): Promise<CommandResult> {
    assertSafeCommand(input.command);
    const cwd = input.cwd ? this.resolveInsideRoot(input.cwd) : this.root;

    return runShell(input.command, cwd, input.timeoutMs ?? defaultTimeoutMs);
  }

  async executeCode(input: { code: string; language: "javascript"; timeoutMs?: number }): Promise<CommandResult> {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "knowme-agent-code-"));
    const filePath = path.join(tempRoot, "snippet.mjs");
    await writeFile(filePath, input.code, "utf8");

    return runProcess(process.execPath, [filePath], this.root, input.timeoutMs ?? defaultTimeoutMs);
  }

  async readFile(input: { path: string }): Promise<{ content: string }> {
    const targetPath = this.resolveInsideRoot(input.path);
    return { content: await readFile(targetPath, "utf8") };
  }

  async writeFile(input: { path: string; content: string }): Promise<{ path: string }> {
    const targetPath = this.resolveInsideRoot(input.path);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, input.content, "utf8");

    return { path: path.relative(this.root, targetPath) };
  }

  async patchFile(input: { path: string; edits: PatchEdit[] }): Promise<{ path: string; applied: number }> {
    const targetPath = this.resolveInsideRoot(input.path);
    let content = await readFile(targetPath, "utf8");
    let applied = 0;

    for (const edit of input.edits) {
      if (!edit.search) {
        throw new Error("Patch edit search text is required.");
      }

      if (!content.includes(edit.search)) {
        throw new Error(`Patch search text was not found in ${input.path}.`);
      }

      if (edit.replaceAll) {
        const before = content;
        content = content.split(edit.search).join(edit.replace);
        applied += countOccurrences(before, edit.search);
      } else {
        content = content.replace(edit.search, edit.replace);
        applied += 1;
      }
    }

    await writeFile(targetPath, content, "utf8");

    return { path: path.relative(this.root, targetPath), applied };
  }

  async browserNavigate(input: { url: string }): Promise<BrowserState> {
    const url = new URL(input.url, "http://127.0.0.1");

    if (!["http:", "https:", "file:", "about:"].includes(url.protocol)) {
      throw new Error(`Unsupported browser protocol: ${url.protocol}`);
    }

    this.browserState = {
      url: url.href,
      title: url.hostname || "Local Preview",
      updatedAt: new Date().toISOString()
    };

    return this.browserState;
  }

  async browserScreenshot(): Promise<BrowserScreenshot> {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <rect width="960" height="540" rx="0" fill="#eef4fb"/>
  <rect x="72" y="72" width="816" height="396" rx="28" fill="#ffffff"/>
  <text x="112" y="142" fill="#152033" font-family="Inter, system-ui" font-size="30" font-weight="700">Local Browser Snapshot</text>
  <text x="112" y="194" fill="#667085" font-family="Inter, system-ui" font-size="22">${escapeXml(this.browserState.url)}</text>
  <rect x="112" y="254" width="520" height="22" rx="11" fill="#d7e3ef"/>
  <rect x="112" y="304" width="680" height="22" rx="11" fill="#e5edf5"/>
  <rect x="112" y="354" width="420" height="22" rx="11" fill="#25d0ba" opacity="0.42"/>
</svg>`;

    return {
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      alt: `Screenshot of ${this.browserState.url}`
    };
  }

  private resolveInsideRoot(inputPath: string) {
    const resolved = path.resolve(this.root, inputPath);
    const normalizedRoot = path.resolve(this.root);

    if (resolved !== normalizedRoot && !resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
      throw new Error(`Path escapes sandbox root: ${inputPath}`);
    }

    return resolved;
  }
}

function runShell(command: string, cwd: string, timeoutMs: number) {
  return runProcess(command, [], cwd, timeoutMs, true);
}

function runProcess(command: string, args: string[], cwd: string, timeoutMs: number, shell = false): Promise<CommandResult> {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let didTimeout = false;

    const timeout = setTimeout(() => {
      didTimeout = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = truncateOutput(stdout + chunk.toString("utf8"));
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = truncateOutput(stderr + chunk.toString("utf8"));
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolve({
        exitCode,
        stdout,
        stderr: didTimeout ? `${stderr}\nCommand timed out after ${timeoutMs}ms.`.trim() : stderr,
        durationMs: Date.now() - startedAt
      });
    });
  });
}

function assertSafeCommand(command: string) {
  const forbiddenPatterns = [
    /\brm\s+-rf\b/,
    /\bgit\s+reset\s+--hard\b/,
    /\bgit\s+checkout\s+--\b/,
    /\bmkfs\b/,
    /\bshutdown\b/,
    /\breboot\b/
  ];

  if (forbiddenPatterns.some((pattern) => pattern.test(command))) {
    throw new Error(`Command is not allowed in local sandbox: ${command}`);
  }
}

function truncateOutput(output: string) {
  if (output.length <= maxOutputLength) {
    return output;
  }

  return `${output.slice(0, maxOutputLength)}\n...[truncated]`;
}

function countOccurrences(content: string, search: string) {
  return content.split(search).length - 1;
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

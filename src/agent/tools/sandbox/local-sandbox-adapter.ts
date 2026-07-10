import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import type { BrowserScreenshot, BrowserState, CommandResult, PatchEdit, SandboxAdapter } from "./sandbox-adapter.js";

const maxOutputLength = 12_000;
const defaultTimeoutMs = 10_000;
const maxTimeoutMs = 30_000;

export class LocalSandboxAdapter implements SandboxAdapter {
  private browserState: BrowserState = {
    url: "about:blank",
    title: "Local Browser",
    updatedAt: new Date().toISOString()
  };
  private browser?: Browser;
  private page?: Page;

  constructor(private readonly root: string) {}

  async listFiles(input: { path?: string; maxEntries?: number } = {}): Promise<{ root: string; files: string[] }> {
    const targetPath = this.resolveInsideRoot(input.path ?? ".");
    const maxEntries = Math.max(1, Math.min(Math.trunc(input.maxEntries ?? 200), 1000));
    const files = await walkFiles(targetPath, this.root, maxEntries);

    return {
      root: path.relative(this.root, targetPath) || ".",
      files
    };
  }

  executeCommand(input: { command: string; cwd?: string; timeoutMs?: number }): Promise<CommandResult> {
    assertSafeCommand(input.command);
    const cwd = input.cwd ? this.resolveInsideRoot(input.cwd) : this.root;

    return runShell(input.command, cwd, normalizeTimeout(input.timeoutMs));
  }

  async executeCode(input: { code: string; language: "javascript" | "node" | "python"; timeoutMs?: number }): Promise<CommandResult> {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "knowme-agent-code-"));
    const isPython = input.language === "python";
    const filePath = path.join(tempRoot, isPython ? "snippet.py" : "snippet.mjs");
    await writeFile(filePath, input.code, "utf8");

    return runProcess(isPython ? "python3" : process.execPath, [filePath], this.root, normalizeTimeout(input.timeoutMs));
  }

  async readFile(input: { path: string }): Promise<{ content: string }> {
    const targetPath = this.resolveInsideRoot(input.path);
    return { content: await readFile(targetPath, "utf8") };
  }

  async readBinaryFile(input: { path: string }): Promise<{ contentBase64: string; sizeBytes: number }> {
    const targetPath = this.resolveInsideRoot(input.path);
    const content = await readFile(targetPath);

    return {
      contentBase64: content.toString("base64"),
      sizeBytes: content.byteLength
    };
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

  async browserOpenFile(input: { path: string }): Promise<BrowserState> {
    const targetPath = this.resolveInsideRoot(input.path);
    const relativePath = path.relative(this.root, targetPath);
    const fileUrl = pathToFileURL(targetPath).href;

    this.browserState = {
      url: fileUrl,
      title: path.basename(relativePath) || "Local Preview",
      updatedAt: new Date().toISOString()
    };

    await this.navigatePage(fileUrl);

    return this.browserState;
  }

  async browserNavigate(input: { url: string }): Promise<BrowserState> {
    const url = new URL(input.url, "http://127.0.0.1");

    if (url.protocol === "file:") {
      throw new Error("Use browser_open_file with a relative workspace path instead of browser_navigate file URLs.");
    }

    if (!["http:", "https:", "about:", "data:"].includes(url.protocol)) {
      throw new Error(`Unsupported browser protocol: ${url.protocol}`);
    }

    this.browserState = {
      url: url.href,
      title: url.hostname || "Local Preview",
      updatedAt: new Date().toISOString()
    };

    await this.navigatePage(url.href);

    return this.browserState;
  }

  async browserScreenshot(input: { fullPage?: boolean } = {}): Promise<BrowserScreenshot> {
    const page = await this.ensurePage();
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    const viewport = page.viewportSize() ?? { width: 1280, height: 900 };
    const screenshotPath = path.join("outputs", "browser-screenshots", `screenshot-${Date.now()}.png`);
    const absolutePath = this.resolveInsideRoot(screenshotPath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    const buffer = await page.screenshot({
      path: absolutePath,
      fullPage: Boolean(input.fullPage),
      type: "png"
    });
    const previewUrl = `data:image/png;base64,${buffer.toString("base64")}`;

    return {
      url: page.url(),
      path: screenshotPath,
      previewUrl,
      mimeType: "image/png",
      sizeBytes: buffer.byteLength,
      width: viewport.width,
      height: viewport.height,
      alt: `Screenshot of ${page.url()}`
    };
  }

  async browserClick(input: { selector?: string; x?: number; y?: number } = {}): Promise<BrowserState> {
    const page = await this.ensurePage();

    if (input.selector) {
      await page.click(input.selector);
    } else if (typeof input.x === "number" && typeof input.y === "number") {
      await page.mouse.click(input.x, input.y);
    } else {
      throw new Error("browser_click requires selector or x/y coordinates.");
    }

    this.browserState = {
      ...this.browserState,
      title: await safePageTitle(page, this.browserState.title),
      url: page.url(),
      updatedAt: new Date().toISOString()
    };

    return this.browserState;
  }

  async browserType(input: { selector?: string; text: string }): Promise<BrowserState> {
    const page = await this.ensurePage();

    if (input.selector) {
      await page.fill(input.selector, input.text);
    } else {
      await page.keyboard.type(input.text);
    }

    this.browserState = {
      ...this.browserState,
      title: await safePageTitle(page, this.browserState.title),
      url: page.url(),
      updatedAt: new Date().toISOString()
    };

    return this.browserState;
  }

  async browserGetDom(): Promise<{ url: string; title: string; content: string }> {
    const page = await this.ensurePage();
    const title = await safePageTitle(page, this.browserState.title);
    const content = await page.locator("body").evaluate((body) => {
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      const parts: string[] = [];

      while (walker.nextNode() && parts.join(" ").length < 8_000) {
        const text = walker.currentNode.textContent?.trim();

        if (text) {
          parts.push(text);
        }
      }

      return parts.join("\n");
    });

    this.browserState = {
      url: page.url(),
      title,
      updatedAt: new Date().toISOString()
    };

    return {
      url: this.browserState.url,
      title,
      content
    };
  }

  private async navigatePage(url: string): Promise<void> {
    const page = await this.ensurePage();
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 15_000
    });
    this.browserState = {
      url: page.url(),
      title: await safePageTitle(page, this.browserState.title),
      updatedAt: new Date().toISOString()
    };
  }

  private async ensurePage(): Promise<Page> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        executablePath: findSystemChromiumExecutable()
      });
    }

    if (!this.page || this.page.isClosed()) {
      this.page = await this.browser.newPage({
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1
      });

      if (this.browserState.url !== "about:blank") {
        await this.page.goto(this.browserState.url, {
          waitUntil: "networkidle",
          timeout: 15_000
        });
      }
    }

    return this.page;
  }

  private resolveInsideRoot(inputPath: string) {
    if (path.isAbsolute(inputPath) || /^[a-zA-Z]:[\\/]/.test(inputPath)) {
      throw new Error(`Sandbox paths must be relative to the current run workspace: ${inputPath}`);
    }

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
    const detached = process.platform !== "win32";
    const child = spawn(command, args, {
      cwd,
      shell,
      stdio: ["ignore", "pipe", "pipe"],
      detached
    });

    let stdout = "";
    let stderr = "";
    let didTimeout = false;
    let forceKillTimeout: NodeJS.Timeout | undefined;

    const killProcessTree = (signal: NodeJS.Signals) => {
      if (detached && child.pid) {
        try {
          process.kill(-child.pid, signal);
          return;
        } catch {
          // Fall through to killing the direct child. The process may already be gone.
        }
      }

      child.kill(signal);
    };

    const timeout = setTimeout(() => {
      didTimeout = true;
      killProcessTree("SIGTERM");
      forceKillTimeout = setTimeout(() => killProcessTree("SIGKILL"), 1_000);
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = truncateOutput(stdout + chunk.toString("utf8"));
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = truncateOutput(stderr + chunk.toString("utf8"));
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      if (forceKillTimeout) {
        clearTimeout(forceKillTimeout);
      }
      reject(error);
    });

    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      if (forceKillTimeout) {
        clearTimeout(forceKillTimeout);
      }
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
    /\s&\s|\s&$/,
    /\b(nohup|disown)\b/,
    /\bpython3?\s+-m\s+http\.server\b/,
    /\b(http-server|serve)\b/,
    /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start)\b/,
    /\b(vite|next\s+dev)\b/,
    /\btail\s+-f\b/,
    /\bwatch\b/,
    /\bmkfs\b/,
    /\bshutdown\b/,
    /\breboot\b/
  ];

  if (forbiddenPatterns.some((pattern) => pattern.test(command))) {
    throw new Error(`Command is not allowed in local sandbox: ${command}`);
  }
}

function normalizeTimeout(timeoutMs: number | undefined): number {
  if (!timeoutMs || !Number.isFinite(timeoutMs)) {
    return defaultTimeoutMs;
  }

  return Math.max(1_000, Math.min(Math.trunc(timeoutMs), maxTimeoutMs));
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

async function walkFiles(root: string, sandboxRoot: string, maxEntries: number): Promise<string[]> {
  const output: string[] = [];

  async function visit(current: string): Promise<void> {
    if (output.length >= maxEntries) {
      return;
    }

    const currentStat = await stat(current);

    if (currentStat.isFile()) {
      output.push(path.relative(sandboxRoot, current));
      return;
    }

    if (!currentStat.isDirectory()) {
      return;
    }

    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (output.length >= maxEntries || entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }

      await visit(path.join(current, entry.name));
    }
  }

  await visit(root);
  return output;
}

async function safePageTitle(page: Page, fallback: string): Promise<string> {
  try {
    return (await page.title()) || fallback;
  } catch {
    return fallback;
  }
}

function findSystemChromiumExecutable(): string | undefined {
  const candidates =
    process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
        ]
      : process.platform === "win32"
        ? [
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
          ]
        : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"];

  return candidates.find((candidate) => existsSync(candidate));
}

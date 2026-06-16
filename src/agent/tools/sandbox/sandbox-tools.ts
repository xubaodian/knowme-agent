import { summarizeText } from "../../../logging/index.js";
import type { AgentTool, ToolExecutionContext, ToolRunResult } from "../../types.js";
import type { PatchEdit } from "./sandbox-adapter.js";

export function createSandboxTools(): AgentTool[] {
  return [
    {
      name: "execute_command",
      description:
        "Execute one short, non-interactive local sandbox shell command. Do not use it for background processes, servers, watchers, file previews, or writing large files.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["command"],
        properties: {
          command: { type: "string" },
          cwd: { type: "string", description: "Optional working directory relative to the sandbox root." },
          timeoutMs: { type: "number" }
        }
      },
      summarizeInput: (input) => summarizeCommandInput(input as { command: string; cwd?: string; timeoutMs?: number }),
      summarizeOutput: (output) => summarizeCommandOutput(output.data),
      async run(input, context): Promise<ToolRunResult> {
        const result = await context.sandbox.executeCommand(input as { command: string; cwd?: string; timeoutMs?: number });
        return {
          summary: `命令退出码 ${result.exitCode}，耗时 ${result.durationMs}ms。`,
          data: result
        };
      }
    },
    {
      name: "execute_code",
      description: "Execute a JavaScript code snippet in the local sandbox.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["language", "code"],
        properties: {
          language: { type: "string", enum: ["javascript"] },
          code: { type: "string" },
          timeoutMs: { type: "number" }
        }
      },
      summarizeInput: (input) => {
        const codeInput = input as { code: string; timeoutMs?: number };
        return `执行 JavaScript 代码片段（${codeInput.code.length} 字符，timeout=${codeInput.timeoutMs ?? "default"}）。`;
      },
      summarizeOutput: (output) => summarizeCommandOutput(output.data),
      async run(input, context): Promise<ToolRunResult> {
        const result = await context.sandbox.executeCode(input as { code: string; language: "javascript"; timeoutMs?: number });
        return {
          summary: `代码执行退出码 ${result.exitCode}。`,
          data: result
        };
      }
    },
    {
      name: "read_file",
      description: "Read a file from the local sandbox workspace.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["path"],
        properties: {
          path: { type: "string" }
        }
      },
      summarizeInput: (input) => `读取文件：${(input as { path: string }).path}`,
      summarizeOutput: (output) => output.summary ?? "文件读取完成。",
      async run(input, context): Promise<ToolRunResult> {
        const result = await context.sandbox.readFile(input as { path: string });
        return {
          summary: `读取 ${result.content.length} 个字符。`,
          data: result
        };
      }
    },
    {
      name: "write_file",
      description: "Write a file inside the local sandbox workspace.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["path", "content"],
        properties: {
          path: { type: "string" },
          content: { type: "string" }
        }
      },
      summarizeInput: (input) => {
        const fileInput = input as { path: string; content: string };
        return `写入文件：${fileInput.path}（${fileInput.content.length} 字符）。`;
      },
      async run(input, context): Promise<ToolRunResult> {
        const result = await context.sandbox.writeFile(input as { path: string; content: string });
        return {
          summary: `已写入 ${result.path}。`,
          data: result
        };
      }
    },
    {
      name: "patch_file",
      description: "Patch a file using structured search/replace edits.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["path", "edits"],
        properties: {
          path: { type: "string" },
          edits: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["search", "replace"],
              properties: {
                search: { type: "string" },
                replace: { type: "string" }
              }
            }
          }
        }
      },
      summarizeInput: (input) => {
        const patchInput = input as { path: string; edits: PatchEdit[] };
        return `修改文件：${patchInput.path}（${patchInput.edits.length} 处编辑）。`;
      },
      async run(input, context): Promise<ToolRunResult> {
        const result = await context.sandbox.patchFile(input as { path: string; edits: PatchEdit[] });
        return {
          summary: `已应用 ${result.applied} 处修改。`,
          data: result
        };
      }
    },
    {
      name: "browser_navigate",
      description: "Navigate the local browser sandbox to an explicit URL. For sandbox files, prefer browser_open_file.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["url"],
        properties: {
          url: { type: "string" }
        }
      },
      summarizeInput: (input) => `导航到：${(input as { url: string }).url}`,
      async run(input, context): Promise<ToolRunResult> {
        const result = await context.sandbox.browserNavigate(input as { url: string });
        emitBrowserUpdate(context, result);

        return {
          summary: `浏览器已打开 ${result.url}。`,
          data: result
        };
      }
    },
    {
      name: "browser_open_file",
      description: "Open a file from the local sandbox workspace in the browser sandbox.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["path"],
        properties: {
          path: { type: "string", description: "Path relative to the sandbox root." }
        }
      },
      summarizeInput: (input) => `打开预览文件：${(input as { path: string }).path}`,
      async run(input, context): Promise<ToolRunResult> {
        const result = await context.sandbox.browserOpenFile(input as { path: string });
        emitBrowserUpdate(context, result);

        return {
          summary: `浏览器已打开 ${result.url}。`,
          data: result
        };
      }
    },
    {
      name: "browser_screenshot",
      description: "Capture a local browser sandbox screenshot.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          fullPage: { type: "boolean" }
        }
      },
      summarizeInput: (input) => `截取浏览器画面（fullPage=${Boolean((input as { fullPage?: boolean }).fullPage)}）。`,
      summarizeOutput: (output) => {
        const screenshot = output.data as { alt?: string } | undefined;
        return `浏览器截图已生成：${screenshot?.alt ?? "unknown"}。`;
      },
      async run(input, context): Promise<ToolRunResult> {
        const result = await context.sandbox.browserScreenshot(input as { fullPage?: boolean });
        return {
          summary: "浏览器截图已生成。",
          data: result
        };
      }
    }
  ];
}

function emitBrowserUpdate(context: ToolExecutionContext, result: { url: string }) {
  context.eventBus.emit({
    type: "sandbox.updated",
    title: "浏览器导航",
    detail: result.url,
    status: "done",
    flowKind: "sandbox",
    visibility: "secondary",
    actions: [
      {
        id: `act_${crypto.randomUUID()}`,
        kind: "takeover",
        label: "接管浏览器"
      }
    ]
  });
}

function summarizeCommandInput(input: { command: string; cwd?: string; timeoutMs?: number }): string {
  return `执行命令：${input.command}（cwd=${input.cwd ?? "."}，timeout=${input.timeoutMs ?? "default"}）。`;
}

function summarizeCommandOutput(data: unknown): string {
  const result = data as { exitCode?: number | null; durationMs?: number; stdout?: string; stderr?: string } | undefined;

  if (!result) {
    return "命令执行完成。";
  }

  const stdout = summarizeText(result.stdout, 240);
  const stderr = summarizeText(result.stderr, 240);

  return [
    `退出码 ${result.exitCode ?? "unknown"}`,
    result.durationMs !== undefined ? `耗时 ${result.durationMs}ms` : undefined,
    stdout ? `stdout=${stdout}` : undefined,
    stderr ? `stderr=${stderr}` : undefined
  ]
    .filter(Boolean)
    .join("，");
}

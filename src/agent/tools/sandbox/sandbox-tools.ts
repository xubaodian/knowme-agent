import { summarizeText } from "../../../logging/index.js";
import type { AgentTool, ToolExecutionContext, ToolRunResult } from "../../types.js";
import type { PatchEdit } from "./sandbox-adapter.js";

export function createSandboxTools(): AgentTool[] {
  return [
    createListFilesTool(),
    createReadFileTool(),
    createWriteFileTool(),
    createPatchFileTool(),
    createRunCommandTool(),
    createRunNodeTool(),
    createRunPythonTool(),
    createBrowserOpenFileTool(),
    createBrowserNavigateTool(),
    createBrowserClickTool(),
    createBrowserTypeTool(),
    createBrowserScreenshotTool(),
    createBrowserGetDomTool()
  ];
}

function createListFilesTool(): AgentTool {
  return {
    name: "list_files",
    description: "List files under the current run workspace. Paths are relative to the run files directory.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: { type: "string", description: "Relative directory to list. Defaults to the workspace root." },
        maxEntries: { type: "number" }
      }
    },
    summarizeInput: (input) => {
      const value = input as { path?: string; maxEntries?: number };
      return `列出文件：${value.path ?? "."}（max=${value.maxEntries ?? "default"}）。`;
    },
    async run(input, context): Promise<ToolRunResult> {
      const result = await context.sandbox.listFiles(input as { path?: string; maxEntries?: number });
      return {
        summary: `列出 ${result.files.length} 个文件。`,
        data: result
      };
    }
  };
}

function createReadFileTool(): AgentTool {
  return {
    name: "read_file",
    description: "Read a UTF-8 file from the current run workspace using a relative path.",
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
      const value = input as { path: string };
      const result = await context.sandbox.readFile(value);
      return {
        summary: `读取 ${result.content.length} 个字符。`,
        data: { path: value.path, ...result }
      };
    }
  };
}

function createWriteFileTool(): AgentTool {
  return {
    name: "write_file",
    description: "Create or replace a UTF-8 file in the current run workspace using a relative path.",
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
      const value = input as { path: string; content: string };
      return `写入文件：${value.path}（${value.content.length} 字符）。`;
    },
    async run(input, context): Promise<ToolRunResult> {
      const result = await context.sandbox.writeFile(input as { path: string; content: string });
      return {
        summary: `已写入 ${result.path}。`,
        data: result
      };
    }
  };
}

function createPatchFileTool(): AgentTool {
  return {
    name: "patch_file",
    description: "Patch a UTF-8 file in the current run workspace with structured search/replace edits.",
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
              replace: { type: "string" },
              replaceAll: { type: "boolean" }
            }
          }
        }
      }
    },
    summarizeInput: (input) => {
      const value = input as { path: string; edits: PatchEdit[] };
      return `修改文件：${value.path}（${value.edits.length} 处编辑）。`;
    },
    async run(input, context): Promise<ToolRunResult> {
      const result = await context.sandbox.patchFile(input as { path: string; edits: PatchEdit[] });
      return {
        summary: `已应用 ${result.applied} 处修改。`,
        data: result
      };
    }
  };
}

function createRunCommandTool(): AgentTool {
  return {
    name: "run_command",
    description:
      "Run one short, non-interactive shell command from the current run workspace. Use relative paths only when the command touches files.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["command"],
      properties: {
        command: { type: "string" },
        cwd: { type: "string", description: "Relative working directory. Defaults to the run files root." },
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
  };
}

function createRunNodeTool(): AgentTool {
  return {
    name: "run_node",
    description: "Execute a short Node.js/JavaScript snippet from the current run workspace.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["code"],
      properties: {
        code: { type: "string" },
        timeoutMs: { type: "number" }
      }
    },
    summarizeInput: (input) => {
      const value = input as { code: string; timeoutMs?: number };
      return `执行 Node.js 代码片段（${value.code.length} 字符，timeout=${value.timeoutMs ?? "default"}）。`;
    },
    summarizeOutput: (output) => summarizeCommandOutput(output.data),
    async run(input, context): Promise<ToolRunResult> {
      const value = input as { code: string; timeoutMs?: number };
      const result = await context.sandbox.executeCode({ ...value, language: "node" });
      return {
        summary: `Node.js 代码退出码 ${result.exitCode}。`,
        data: result
      };
    }
  };
}

function createRunPythonTool(): AgentTool {
  return {
    name: "run_python",
    description: "Execute a short Python snippet from the current run workspace.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["code"],
      properties: {
        code: { type: "string" },
        timeoutMs: { type: "number" }
      }
    },
    summarizeInput: (input) => {
      const value = input as { code: string; timeoutMs?: number };
      return `执行 Python 代码片段（${value.code.length} 字符，timeout=${value.timeoutMs ?? "default"}）。`;
    },
    summarizeOutput: (output) => summarizeCommandOutput(output.data),
    async run(input, context): Promise<ToolRunResult> {
      const value = input as { code: string; timeoutMs?: number };
      const result = await context.sandbox.executeCode({ ...value, language: "python" });
      return {
        summary: `Python 代码退出码 ${result.exitCode}。`,
        data: result
      };
    }
  };
}

function createBrowserOpenFileTool(): AgentTool {
  return {
    name: "browser_open_file",
    description: "Open a workspace file in the local browser preview using a relative file path.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        path: { type: "string" }
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
  };
}

function createBrowserNavigateTool(): AgentTool {
  return {
    name: "browser_navigate",
    description: "Navigate the local browser preview to an explicit URL.",
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
  };
}

function createBrowserClickTool(): AgentTool {
  return {
    name: "browser_click",
    description: "Click in the local browser preview by selector or coordinates.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        selector: { type: "string" },
        x: { type: "number" },
        y: { type: "number" }
      }
    },
    summarizeInput: (input) => {
      const value = input as { selector?: string; x?: number; y?: number };
      return `浏览器点击：${value.selector ?? `${value.x ?? "?"},${value.y ?? "?"}`}`;
    },
    async run(input, context): Promise<ToolRunResult> {
      const result = await context.sandbox.browserClick(input as { selector?: string; x?: number; y?: number });
      emitBrowserUpdate(context, result);
      return {
        summary: "浏览器点击已执行。",
        data: result
      };
    }
  };
}

function createBrowserTypeTool(): AgentTool {
  return {
    name: "browser_type",
    description: "Type text in the local browser preview.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: {
        selector: { type: "string" },
        text: { type: "string" }
      }
    },
    summarizeInput: (input) => {
      const value = input as { selector?: string; text: string };
      return `浏览器输入：${value.selector ?? "active element"}（${value.text.length} 字符）。`;
    },
    async run(input, context): Promise<ToolRunResult> {
      const result = await context.sandbox.browserType(input as { selector?: string; text: string });
      emitBrowserUpdate(context, result);
      return {
        summary: `浏览器输入已执行（${(input as { text: string }).text.length} 字符）。`,
        data: result
      };
    }
  };
}

function createBrowserScreenshotTool(): AgentTool {
  return {
    name: "browser_screenshot",
    description: "Capture the current local browser preview screenshot.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        fullPage: { type: "boolean" }
      }
    },
    summarizeInput: (input) => `截取浏览器画面（fullPage=${Boolean((input as { fullPage?: boolean }).fullPage)}）。`,
    async run(input, context): Promise<ToolRunResult> {
      const result = await context.sandbox.browserScreenshot(input as { fullPage?: boolean });
      return {
        summary: "浏览器截图已生成。",
        data: result
      };
    }
  };
}

function createBrowserGetDomTool(): AgentTool {
  return {
    name: "browser_get_dom",
    description: "Read the current local browser preview DOM summary.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    summarizeInput: () => "读取当前浏览器 DOM。",
    async run(_input, context): Promise<ToolRunResult> {
      const result = await context.sandbox.browserGetDom();
      return {
        summary: `已读取浏览器 DOM：${result.title}。`,
        data: result
      };
    }
  };
}

function emitBrowserUpdate(context: ToolExecutionContext, result: { url: string }) {
  context.eventBus.emit({
    type: "sandbox.updated",
    title: "浏览器活动",
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

export type CommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type PatchEdit = {
  search: string;
  replace: string;
  replaceAll?: boolean;
};

export type BrowserState = {
  url: string;
  title: string;
  updatedAt: string;
};

export type BrowserScreenshot = {
  url: string;
  alt: string;
};

export type SandboxAdapter = {
  executeCommand(input: { command: string; cwd?: string; timeoutMs?: number }): Promise<CommandResult>;
  executeCode(input: { code: string; language: "javascript"; timeoutMs?: number }): Promise<CommandResult>;
  readFile(input: { path: string }): Promise<{ content: string }>;
  writeFile(input: { path: string; content: string }): Promise<{ path: string }>;
  patchFile(input: { path: string; edits: PatchEdit[] }): Promise<{ path: string; applied: number }>;
  browserNavigate(input: { url: string }): Promise<BrowserState>;
  browserScreenshot(input?: { fullPage?: boolean }): Promise<BrowserScreenshot>;
};

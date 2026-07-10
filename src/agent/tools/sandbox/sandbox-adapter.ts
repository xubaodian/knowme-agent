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
  path?: string;
  previewUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
};

export type SandboxAdapter = {
  listFiles(input?: { path?: string; maxEntries?: number }): Promise<{ root: string; files: string[] }>;
  executeCommand(input: { command: string; cwd?: string; timeoutMs?: number }): Promise<CommandResult>;
  executeCode(input: { code: string; language: "javascript" | "node" | "python"; timeoutMs?: number }): Promise<CommandResult>;
  readFile(input: { path: string }): Promise<{ content: string }>;
  readBinaryFile(input: { path: string }): Promise<{ contentBase64: string; sizeBytes: number }>;
  writeFile(input: { path: string; content: string }): Promise<{ path: string }>;
  patchFile(input: { path: string; edits: PatchEdit[] }): Promise<{ path: string; applied: number }>;
  browserOpenFile(input: { path: string }): Promise<BrowserState>;
  browserNavigate(input: { url: string }): Promise<BrowserState>;
  browserScreenshot(input?: { fullPage?: boolean }): Promise<BrowserScreenshot>;
  browserClick(input: { selector?: string; x?: number; y?: number }): Promise<BrowserState>;
  browserType(input: { selector?: string; text: string }): Promise<BrowserState>;
  browserGetDom(): Promise<{ url: string; title: string; content: string }>;
};

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { getRun, getRunArtifacts, getRunEvents, getRunLogs, subscribeRunEvents } from "../services/run-service.js";

export const runRoutes = new Hono();

runRoutes.get("/:runId", (c) => {
  const run = getRun(c.req.param("runId"));

  if (!run) {
    return c.json({ error: "Run not found" }, 404);
  }

  return c.json({ run });
});

runRoutes.get("/:runId/events", (c) => {
  const runId = c.req.param("runId");
  const run = getRun(runId);

  if (!run) {
    return c.json({ error: "Run not found" }, 404);
  }

  return streamSSE(c, async (stream) => {
    const existingEvents = getRunEvents(runId);

    for (const event of existingEvents) {
      await stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event),
        id: event.id
      });
    }

    if (existingEvents.some((event) => event.type === "run.completed" || event.type === "run.failed")) {
      return;
    }

    await new Promise<void>((resolve) => {
      const unsubscribe = subscribeRunEvents(runId, (event) => {
        void (async () => {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
            id: event.id
          });

          if (event.type === "run.completed" || event.type === "run.failed") {
            unsubscribe();
            resolve();
          }
        })();
      });

      stream.onAbort(() => {
        unsubscribe();
        resolve();
      });
    });
  });
});

runRoutes.get("/:runId/artifacts", (c) => {
  const runId = c.req.param("runId");
  const run = getRun(runId);

  if (!run) {
    return c.json({ error: "Run not found" }, 404);
  }

  return c.json({ artifacts: getRunArtifacts(runId) });
});

runRoutes.get("/:runId/files", async (c) => {
  const runId = c.req.param("runId");
  const run = getRun(runId);

  if (!run) {
    return c.json({ error: "Run not found" }, 404);
  }

  try {
    const filesRoot = await realpath(runFilesRoot(runId));
    return c.json({ files: await listWorkspaceFiles(filesRoot) });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    return c.json({ files: [], error: code === "ENOENT" ? undefined : "Workspace files could not be listed" }, code === "ENOENT" ? 200 : 500);
  }
});

runRoutes.get("/:runId/files/content", async (c) => {
  const runId = c.req.param("runId");
  const run = getRun(runId);

  if (!run) {
    return c.json({ error: "Run not found" }, 404);
  }

  const relativePath = c.req.query("path")?.trim();

  if (!relativePath) {
    return c.json({ error: "File path is required" }, 400);
  }

  const filesRoot = runFilesRoot(runId);
  const filePath = path.resolve(filesRoot, relativePath);

  if (filePath !== filesRoot && !filePath.startsWith(`${filesRoot}${path.sep}`)) {
    return c.json({ error: "Invalid file path" }, 400);
  }

  try {
    const [realFilesRoot, realFilePath] = await Promise.all([realpath(filesRoot), realpath(filePath)]);

    if (realFilePath !== realFilesRoot && !realFilePath.startsWith(`${realFilesRoot}${path.sep}`)) {
      return c.json({ error: "Invalid file path" }, 400);
    }

    return c.json({ path: relativePath, content: await readFile(realFilePath, "utf8") });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    return c.json({ error: code === "ENOENT" ? "File not found" : "File could not be read" }, code === "ENOENT" ? 404 : 500);
  }
});

runRoutes.get("/:runId/files/download", async (c) => {
  const runId = c.req.param("runId");
  const run = getRun(runId);

  if (!run) {
    return c.json({ error: "Run not found" }, 404);
  }

  const relativePath = c.req.query("path")?.trim();

  if (!relativePath) {
    return c.json({ error: "File path is required" }, 400);
  }

  const filesRoot = runFilesRoot(runId);
  const filePath = path.resolve(filesRoot, relativePath);

  if (filePath !== filesRoot && !filePath.startsWith(`${filesRoot}${path.sep}`)) {
    return c.json({ error: "Invalid file path" }, 400);
  }

  try {
    const [realFilesRoot, realFilePath] = await Promise.all([realpath(filesRoot), realpath(filePath)]);

    if (realFilePath !== realFilesRoot && !realFilePath.startsWith(`${realFilesRoot}${path.sep}`)) {
      return c.json({ error: "Invalid file path" }, 400);
    }

    const content = await readFile(realFilePath);
    const fileName = path.basename(relativePath);
    return c.body(new Uint8Array(content), 200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    return c.json({ error: code === "ENOENT" ? "File not found" : "File could not be read" }, code === "ENOENT" ? 404 : 500);
  }
});

runRoutes.get("/:runId/logs", async (c) => {
  const runId = c.req.param("runId");
  const run = getRun(runId);

  if (!run) {
    return c.json({ error: "Run not found" }, 404);
  }

  return c.json({ logs: await getRunLogs(runId) });
});

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function runFilesRoot(runId: string): string {
  return path.resolve(process.cwd(), ".knowme", "workspaces", safeSegment(runId), "files");
}

async function listWorkspaceFiles(filesRoot: string, directory = filesRoot): Promise<Array<{ path: string; size: number; updatedAt: string }>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: Array<{ path: string; size: number; updatedAt: string }> = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "tmp" || entry.name === "node_modules") continue;

    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listWorkspaceFiles(filesRoot, entryPath)));
      continue;
    }

    if (!entry.isFile()) continue;
    const metadata = await stat(entryPath);
    files.push({
      path: path.relative(filesRoot, entryPath).split(path.sep).join("/"),
      size: metadata.size,
      updatedAt: metadata.mtime.toISOString()
    });
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

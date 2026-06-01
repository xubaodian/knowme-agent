import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
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

runRoutes.get("/:runId/logs", async (c) => {
  const runId = c.req.param("runId");
  const run = getRun(runId);

  if (!run) {
    return c.json({ error: "Run not found" }, 404);
  }

  return c.json({ logs: await getRunLogs(runId) });
});

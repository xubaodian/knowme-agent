import { Hono } from "hono";
import { listRunTraces, readRunTrace, readRunTraceNodePayload } from "../../logging/trace.js";

export const debugRoutes = new Hono();

debugRoutes.get("/runs", async (c) => {
  return c.json({ runs: await listRunTraces() });
});

debugRoutes.get("/runs/:runId", async (c) => {
  const trace = await readRunTrace(c.req.param("runId"));

  if (!trace) {
    return c.json({ error: "Run trace not found" }, 404);
  }

  return c.json(trace);
});

debugRoutes.get("/runs/:runId/nodes/:nodeId/:kind", async (c) => {
  const kind = c.req.param("kind");

  if (kind !== "input" && kind !== "output" && kind !== "error") {
    return c.json({ error: "Unsupported trace payload kind" }, 400);
  }

  const payload = await readRunTraceNodePayload(c.req.param("runId"), c.req.param("nodeId"), kind);

  if (payload === undefined) {
    return c.json({ error: "Trace payload not found" }, 404);
  }

  return c.json({ payload });
});

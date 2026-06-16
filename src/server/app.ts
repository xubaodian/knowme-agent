import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { healthRoutes } from "./routes/health.js";
import { chatRoutes } from "./routes/chats.js";
import { debugRoutes } from "./routes/debug.js";
import { llmRoutes } from "./routes/llm.js";
import { runRoutes } from "./routes/runs.js";
import { skillRoutes } from "./routes/skills.js";
import { requestLogging } from "./middleware/request-logging.js";

export function createApp() {
  const app = new Hono();

  app.use("/api/*", cors());
  app.use("/api/*", requestLogging());

  app.route("/api/health", healthRoutes);
  app.route("/api/chats", chatRoutes);
  app.route("/api/debug", debugRoutes);
  app.route("/api/llm", llmRoutes);
  app.route("/api/runs", runRoutes);
  app.route("/api/skills", skillRoutes);

  app.get("/api", (c) =>
    c.json({
      name: "knowme-agent",
      status: "ready"
    })
  );

  app.use("/assets/*", serveStatic({ root: "dist/web" }));
  app.get("*", serveStatic({ path: "dist/web/index.html" }));

  return app;
}

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { healthRoutes } from "./routes/health.js";
import { chatRoutes } from "./routes/chats.js";
import { runRoutes } from "./routes/runs.js";

export function createApp() {
  const app = new Hono();

  app.use("/api/*", cors());

  app.route("/api/health", healthRoutes);
  app.route("/api/chats", chatRoutes);
  app.route("/api/runs", runRoutes);

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

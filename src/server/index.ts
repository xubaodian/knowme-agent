import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "127.0.0.1";
const app = createApp();

serve(
  {
    fetch: app.fetch,
    port,
    hostname
  },
  (info) => {
    console.log(`knowme-agent server listening on http://${hostname}:${info.port}`);
  }
);

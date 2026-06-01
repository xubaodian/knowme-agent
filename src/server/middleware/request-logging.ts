import type { MiddlewareHandler } from "hono";
import { getLogger } from "../../logging/index.js";

export function requestLogging(): MiddlewareHandler {
  const logger = getLogger();

  return async (c, next) => {
    const requestId = crypto.randomUUID();
    const startedAt = performance.now();
    const url = new URL(c.req.url);

    c.header("x-request-id", requestId);

    try {
      await next();
      logger.info("http.request", {
        category: "http",
        requestId,
        method: c.req.method,
        path: url.pathname,
        status: c.res.status,
        durationMs: Math.round(performance.now() - startedAt)
      });
    } catch (error) {
      logger.error(
        "http.request.failed",
        {
          category: "http",
          requestId,
          method: c.req.method,
          path: url.pathname,
          durationMs: Math.round(performance.now() - startedAt)
        },
        error
      );
      throw error;
    }
  };
}

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import log4js from "log4js";

export type LogLevelName = "debug" | "info" | "warn" | "error";
export type LogAttributes = Record<string, unknown>;

export type Logger = {
  debug(message: string, attributes?: LogAttributes): void;
  info(message: string, attributes?: LogAttributes): void;
  warn(message: string, attributes?: LogAttributes): void;
  error(message: string, attributes?: LogAttributes, error?: unknown): void;
};

export type RunLoggerContext = {
  runId?: string;
  chatId?: string;
  userMessageId?: string;
};

export type RunLogger = {
  event(name: string, attributes?: LogAttributes, level?: LogLevelName): void;
  metric(name: string, value: number, unit: string, attributes?: LogAttributes): void;
  startSpan(name: string, attributes?: LogAttributes): LogSpan;
  child(context: RunLoggerContext): RunLogger;
};

export type LogSpan = {
  end(attributes?: LogAttributes): void;
  fail(error: unknown, attributes?: LogAttributes): void;
};

type LoggerConfig = {
  level: LogLevelName;
  logDir: string;
  enableConsole: boolean;
  retentionDays: number;
};

type ReadLocalLogsInput = {
  runId?: string;
  requestId?: string;
  limit?: number;
  logDir?: string;
};

let configured = false;
let rootLogger: Logger | undefined;

export function getLogger(): Logger {
  rootLogger ??= createLocalLogger();
  return rootLogger;
}

export function createLocalLogger(config: Partial<LoggerConfig> = {}): Logger {
  configureLog4js({
    level: config.level ?? parseLogLevel(process.env.KNOWME_LOG_LEVEL),
    logDir: config.logDir ?? getDefaultLogDir(),
    enableConsole: config.enableConsole ?? parseBoolean(process.env.KNOWME_LOG_CONSOLE, false),
    retentionDays: config.retentionDays ?? parseRetentionDays(process.env.KNOWME_LOG_RETENTION_DAYS)
  });

  return wrapLog4jsLogger(log4js.getLogger("knowme"));
}

export function createRunLogger(context: RunLoggerContext = {}, logger: Logger = getLogger()): RunLogger {
  const event = (name: string, attributes: LogAttributes = {}, level: LogLevelName = "info") => {
    logger[level](name, { ...context, ...attributes });
  };

  return {
    event,
    metric(name, value, unit, attributes = {}) {
      event("metric", { name, value, unit, ...attributes });
    },
    startSpan(name, attributes = {}) {
      return createSpan(logger, name, context, attributes);
    },
    child(childContext) {
      return createRunLogger({ ...context, ...childContext }, logger);
    }
  };
}

export async function readLocalLogs(input: ReadLocalLogsInput = {}): Promise<string[]> {
  const logDir = input.logDir ?? getDefaultLogDir();
  const files = await listLogFiles(logDir);
  const lines: string[] = [];

  for (const file of files) {
    const content = await readFile(path.join(logDir, file), "utf8");

    for (const line of content.split(/\r?\n/)) {
      if (!line) {
        continue;
      }

      if (input.runId && !line.includes(`runId="${input.runId}"`)) {
        continue;
      }

      if (input.requestId && !line.includes(`requestId="${input.requestId}"`)) {
        continue;
      }

      lines.push(line);
    }
  }

  return lines.slice(-(input.limit ?? 300));
}

export function shutdownLocalLogger(): Promise<void> {
  return new Promise((resolve, reject) => {
    log4js.shutdown((error) => {
      if (error) {
        reject(error);
        return;
      }

      configured = false;
      rootLogger = undefined;
      resolve();
    });
  });
}

export function getDefaultLogDir(): string {
  return path.resolve(process.cwd(), process.env.KNOWME_LOG_DIR || "logs");
}

export function summarizeText(value: string | undefined, maxLength = 240): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function configureLog4js(config: LoggerConfig): void {
  if (configured) {
    return;
  }

  configured = true;

  log4js.configure({
    appenders: {
      file: {
        type: "dateFile",
        filename: path.join(config.logDir, "app.log"),
        pattern: ".yyyy-MM-dd-hh",
        alwaysIncludePattern: false,
        keepFileExt: true,
        numBackups: config.retentionDays * 24,
        layout: {
          type: "pattern",
          pattern: "[%d{ISO8601}] [%p] %m"
        }
      },
      console: {
        type: "console",
        layout: {
          type: "pattern",
          pattern: "[%d{ISO8601}] [%p] %m"
        }
      }
    },
    categories: {
      default: {
        appenders: config.enableConsole ? ["file", "console"] : ["file"],
        level: config.level
      }
    }
  });
}

function wrapLog4jsLogger(logger: log4js.Logger): Logger {
  return {
    debug: (message, attributes) => logger.debug(formatLine(message, attributes)),
    info: (message, attributes) => logger.info(formatLine(message, attributes)),
    warn: (message, attributes) => logger.warn(formatLine(message, attributes)),
    error: (message, attributes, error) => logger.error(formatLine(message, attributes, error))
  };
}

function createSpan(logger: Logger, name: string, context: RunLoggerContext, attributes: LogAttributes): LogSpan {
  const startedAt = performance.now();
  let ended = false;

  logger.info(`${name}.start`, { ...context, ...attributes });

  return {
    end(endAttributes = {}) {
      if (ended) {
        return;
      }

      ended = true;
      logger.info(`${name}.end`, {
        ...context,
        ...attributes,
        ...endAttributes,
        durationMs: Math.round(performance.now() - startedAt)
      });
    },
    fail(error, failAttributes = {}) {
      if (ended) {
        return;
      }

      ended = true;
      logger.error(
        `${name}.fail`,
        {
          ...context,
          ...attributes,
          ...failAttributes,
          durationMs: Math.round(performance.now() - startedAt)
        },
        error
      );
    }
  };
}

function formatLine(message: string, attributes?: LogAttributes, error?: unknown): string {
  const attrText = formatAttributes(attributes);
  const errorText = error ? ` error=${JSON.stringify(formatError(error))}` : "";
  return `${message}${attrText ? ` ${attrText}` : ""}${errorText}`;
}

function formatAttributes(attributes: LogAttributes | undefined): string {
  if (!attributes) {
    return "";
  }

  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${formatValue(key, value)}`)
    .join(" ");
}

function formatValue(key: string, value: unknown): string {
  if (/api[_-]?key|authorization|bearer|cookie|password|secret|token/i.test(key)) {
    return "[REDACTED]";
  }

  if (typeof value === "string") {
    return JSON.stringify(summarizeText(value, 500));
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }

  return JSON.stringify(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function listLogFiles(logDir: string): Promise<string[]> {
  try {
    const files = await readdir(logDir);
    return files.filter((file) => file === "app.log" || file.startsWith("app.")).sort().slice(-72);
  } catch {
    return [];
  }
}

function parseLogLevel(value: string | undefined): LogLevelName {
  return value === "debug" || value === "info" || value === "warn" || value === "error" ? value : "info";
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value === "true" || value === "1";
}

function parseRetentionDays(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
}

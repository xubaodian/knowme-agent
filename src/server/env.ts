import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const envFiles = [".env", ".env.local"];

export function loadLocalEnv(cwd = process.cwd()): void {
  for (const fileName of envFiles) {
    const filePath = path.join(cwd, fileName);

    if (!existsSync(filePath)) {
      continue;
    }

    loadEnvFile(filePath);
  }
}

function loadEnvFile(filePath: string): void {
  const content = readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");

    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = parseEnvValue(line.slice(separator + 1).trim());

    process.env[key] ??= value;
  }
}

function parseEnvValue(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

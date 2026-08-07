import "dotenv/config";
import os from "node:os";
import path from "node:path";

export type LogLevel = "error" | "warn" | "info" | "debug";

const defaultDataDir = process.env.APPDATA
  ? path.join(process.env.APPDATA, "mcp-pje-trf1")
  : path.join(os.homedir(), ".mcp-pje-trf1");

function expandHome(raw: string): string {
  if (raw === "~") return os.homedir();
  if (raw.startsWith("~/") || raw.startsWith("~\\")) {
    return path.join(os.homedir(), raw.slice(2));
  }
  return raw;
}

function resolveConfiguredPath(value: string | undefined, fallbackAbsolute: string): string {
  const raw = value?.trim();
  if (!raw) return fallbackAbsolute;
  const expanded = expandHome(raw);
  return path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(process.cwd(), expanded);
}

function parseLogLevel(value: string | undefined): LogLevel {
  if (value === "error" || value === "warn" || value === "info" || value === "debug") {
    return value;
  }
  return "info";
}

export const config = {
  name: "mcp-pje-trf1",
  version: "1.0.0",
  dataDir: defaultDataDir,
  downloadDir: resolveConfiguredPath(process.env.PJE_DOWNLOAD_DIR, path.join(defaultDataDir, "downloads")),
  storageStatePath: resolveConfiguredPath(process.env.PJE_STORAGE_STATE_PATH, path.join(defaultDataDir, "storage-state.json")),
  headless: process.env.PJE_HEADLESS?.toLowerCase() !== "false",
  logLevel: parseLogLevel(process.env.LOG_LEVEL),
};

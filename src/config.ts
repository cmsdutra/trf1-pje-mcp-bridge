import dotenv from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Carrega o `.env` somente da raiz do pacote (nunca do cwd, que pode ser um repositório não
 * confiável) e só aceita as chaves conhecidas — um `.env` não deve conseguir injetar variáveis
 * arbitrárias (PLAYWRIGHT_*, NODE_OPTIONS, proxies...) no processo.
 */
const ALLOWED_ENV_KEYS = ["PJE_DOWNLOAD_DIR", "PJE_STORAGE_STATE_PATH", "PJE_HEADLESS", "PJE_CHROMIUM_SANDBOX", "LOG_LEVEL"];

function loadPackageEnv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(here, "..", ".env");
  if (!existsSync(envPath)) return;
  const parsed = dotenv.parse(readFileSync(envPath));
  for (const key of ALLOWED_ENV_KEYS) {
    if (process.env[key] === undefined && parsed[key] !== undefined) process.env[key] = parsed[key];
  }
}

loadPackageEnv();

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
  /** Sandbox do Chromium ligado por padrão; desligue (`PJE_CHROMIUM_SANDBOX=false`) só em containers que o exijam. */
  chromiumSandbox: process.env.PJE_CHROMIUM_SANDBOX?.toLowerCase() !== "false",
  logLevel: parseLogLevel(process.env.LOG_LEVEL),
};

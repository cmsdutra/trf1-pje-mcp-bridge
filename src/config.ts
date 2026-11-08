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
const ALLOWED_ENV_KEYS = ["PJE_DOWNLOAD_DIR", "PJE_STORAGE_STATE_PATH", "PJE_HEADLESS", "PJE_CHROMIUM_SANDBOX", "PJE_MAX_SESSIONS", "PJE_MAX_DOCUMENT_BYTES", "PJE_MAX_BATCH_DOCUMENTS", "PJE_MAX_BATCH_BYTES", "LOG_LEVEL"];

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

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
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
  /** Navegadores Chromium simultâneos; chamadas além disso esperam na fila. */
  maxSessions: parsePositiveInt(process.env.PJE_MAX_SESSIONS, 2),
  /** Teto de bytes por documento (o corpo é carregado inteiro em memória). */
  maxDocumentBytes: parsePositiveInt(process.env.PJE_MAX_DOCUMENT_BYTES, 100 * 1024 * 1024),
  /** Teto de documentos e de bytes totais por chamada de `baixar_inteiro_teor`. */
  maxBatchDocuments: parsePositiveInt(process.env.PJE_MAX_BATCH_DOCUMENTS, 1000),
  maxBatchBytes: parsePositiveInt(process.env.PJE_MAX_BATCH_BYTES, 2 * 1024 * 1024 * 1024),
  /**
   * Prazo total (cabeçalho + corpo) de cada tentativa de download. O PJe entrega ~200 KB/s: 600 s
   * cobrem o teto de 100 MB por documento (um vídeo de 58 MB levou 313 s numa medição real).
   */
  downloadTimeoutMs: parsePositiveInt(process.env.PJE_DOWNLOAD_TIMEOUT_MS, 600_000),
  /** Documentos baixados ao mesmo tempo, dentro de uma coleta de `baixar_inteiro_teor` (1 = sequencial). */
  downloadConcurrency: parsePositiveInt(process.env.PJE_DOWNLOAD_CONCURRENCY, 3),
};

/**
 * Arquivo de sessão de cada grau. O 1º grau usa `storageStatePath` como está; o 2º usa o mesmo caminho
 * com `-2g` antes da extensão. Os graus têm SSO e perfil próprios: com um arquivo só, autenticar um
 * sobrescreveria o outro.
 */
export function storageStatePathFor(grau: "1" | "2"): string {
  if (grau === "1") return config.storageStatePath;
  const { dir, name, ext } = path.parse(config.storageStatePath);
  return path.join(dir, `${name}-2g${ext}`);
}

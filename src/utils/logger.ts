import { config, type LogLevel } from "../config.js";
import { PjeError } from "./errors.js";

const priorities: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

/**
 * Mascara o token de navegação `ca` em URLs dentro de texto livre. Mensagens de erro do Playwright
 * reproduzem a URL navegada (`navigating to "…?idProcesso=1&ca=…"`), e esse token é credencial de sessão.
 */
export function scrubSecrets(texto: string): string {
  return texto.replace(/([?&;]ca=)[^&\s"'#)]+/gi, "$1[REDACTED]");
}

function redact(value: unknown): unknown {
  if (typeof value === "string") return scrubSecrets(value);
  if (typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) return value.map(redact);
  const redacted: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (/cookie|token|authorization|senha|password|pin|credential|storageState/i.test(key)) {
      redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = redact(nested);
    }
  }
  return redacted;
}

/** Registra a causa de um erro que NÃO é `PjeError` (esses já chegam ao cliente com código e mensagem). */
export function logUnexpectedError(error: unknown, context: Record<string, unknown> = {}): void {
  if (error instanceof PjeError) return;
  log("error", "Falha inesperada", { ...context, erro: error instanceof Error ? (error.stack ?? error.message) : String(error) });
}

export function log(level: LogLevel, message: string, context: Record<string, unknown> = {}): void {
  if (priorities[level] > priorities[config.logLevel]) return;
  const safeContext = redact(context);
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(typeof safeContext === "object" && safeContext !== null && !Array.isArray(safeContext) ? safeContext : {}),
  };
  console.error(JSON.stringify(entry));
}

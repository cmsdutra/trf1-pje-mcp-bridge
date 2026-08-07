import { config, type LogLevel } from "../config.js";

const priorities: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function redact(value: unknown): unknown {
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

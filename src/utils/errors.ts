export type PjeErrorCode =
  | "SESSION_MISSING"
  | "SESSION_EXPIRED"
  | "PROCESS_NOT_FOUND"
  | "PROCESS_NOT_ACCESSIBLE"
  | "DOCUMENT_NOT_FOUND"
  | "DOCUMENT_NOT_ACCESSIBLE"
  | "DOWNLOAD_FAILED"
  | "TIMEOUT"
  | "PJE_INTERFACE_CHANGED"
  | "INVALID_INPUT"
  | "PATH_TRAVERSAL"
  | "AUTH_REQUIRED";

export class PjeError extends Error {
  constructor(
    public readonly code: PjeErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "PjeError";
  }
}

export function toStructuredError(error: unknown): { code: string; message: string; details?: Record<string, unknown> } {
  if (error instanceof PjeError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  return { code: "UNEXPECTED_ERROR", message: "Falha inesperada ao executar a operação." };
}

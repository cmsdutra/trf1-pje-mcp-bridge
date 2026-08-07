import { PjeError } from "./errors.js";

const CNJ_RE = /^(\d{7})-(\d{2})\.(\d{4})\.(\d)\.(\d{2})\.(\d{4})$/;

export function normalizeCnj(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 20) {
    throw new PjeError("INVALID_INPUT", "Número CNJ deve conter 20 dígitos.", { field: "numero_processo" });
  }
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
}

export function isValidCnj(value: string): boolean {
  try {
    const normalized = normalizeCnj(value);
    const match = CNJ_RE.exec(normalized);
    if (!match) return false;
    const base = `${match[1]}${match[3]}${match[4]}${match[5]}${match[6]}00`;
    const check = 98n - (BigInt(base) % 97n);
    return check === BigInt(match[2]);
  } catch {
    return false;
  }
}

export function assertValidCnj(value: string): string {
  const normalized = normalizeCnj(value);
  if (!isValidCnj(normalized)) {
    throw new PjeError("INVALID_INPUT", "Número CNJ inválido.", { field: "numero_processo" });
  }
  return normalized;
}

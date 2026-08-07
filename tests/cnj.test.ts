import { describe, expect, it } from "vitest";
import { assertValidCnj, isValidCnj, normalizeCnj } from "../src/utils/cnj.js";

describe("CNJ", () => {
  it("normaliza número com pontuação ausente", () => {
    expect(normalizeCnj("00000000000004010000")).toBe("0000000-00.0000.4.01.0000");
  });

  it("valida dígitos verificadores", () => {
    expect(isValidCnj("0000001-09.2026.4.01.0000")).toBe(true);
    expect(isValidCnj("0000001-10.2026.4.01.0000")).toBe(false);
  });

  it("lança erro para número inválido", () => {
    expect(() => assertValidCnj("123")).toThrow("20 dígitos");
  });
});

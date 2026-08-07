import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureInsideBase, sanitizeFileName } from "../src/utils/filesystem.js";

describe("filesystem", () => {
  it("sanitiza nomes de arquivos", () => {
    expect(sanitizeFileName("Petição Inicial: ação nº 1/2026.pdf")).toBe("peticao_inicial_acao_no_1_2026.pdf");
  });

  it("bloqueia path traversal", () => {
    const base = path.resolve("downloads");
    expect(() => ensureInsideBase(base, "../../secret.txt")).toThrow("fora do diretório-base");
  });

  it("aceita caminho relativo dentro do diretório-base", () => {
    const base = path.resolve("downloads");
    expect(ensureInsideBase(base, "processo/manifest.json")).toBe(path.join(base, "processo", "manifest.json"));
  });
});

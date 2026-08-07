import { describe, expect, it } from "vitest";
import { createManifest } from "../src/pje/downloads.js";

describe("manifest", () => {
  it("calcula totais por status", async () => {
    const manifest = await createManifest({
      numeroProcesso: "0000000-00.0000.4.01.0000",
      grau: "1",
      documentos: [
        { indice: 1, identificador: "a", nomeOriginal: "A", status: "baixado" },
        { indice: 2, identificador: "b", nomeOriginal: "B", status: "erro", mensagemErro: "x" },
      ],
    });
    expect(manifest.quantidadeTotalDocumentos).toBe(2);
    expect(manifest.quantidadeBaixada).toBe(1);
    expect(manifest.quantidadeComErro).toBe(1);
    expect(manifest.coletadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

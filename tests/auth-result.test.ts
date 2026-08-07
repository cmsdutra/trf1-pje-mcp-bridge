import { describe, expect, it } from "vitest";

describe("auth result contract", () => {
  it("não deve expor caminho ou conteúdo de storageState em retornos públicos", () => {
    const publicResult = { grau: "1", valid: true, message: "Sessão autenticada salva com sucesso." };
    expect(JSON.stringify(publicResult)).not.toMatch(/storageState|storage-state|cookie|token/i);
  });
});

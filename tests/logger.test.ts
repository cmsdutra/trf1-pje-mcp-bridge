import { afterEach, describe, expect, it, vi } from "vitest";
import { PjeError } from "../src/utils/errors.js";
import { logUnexpectedError, scrubSecrets } from "../src/utils/logger.js";

describe("scrubSecrets", () => {
  it("mascara o token ca em URLs de mensagens de erro", () => {
    const erro = 'page.goto: Timeout\n  - navigating to "https://pje1g.trf1.jus.br/pje/x.seam?idProcesso=1&ca=abc123def&aba=" until load';
    const limpo = scrubSecrets(erro);
    expect(limpo).not.toContain("abc123def");
    expect(limpo).toContain("idProcesso=1");
    expect(limpo).toContain("ca=[REDACTED]&aba=");
  });

  it("não altera texto sem o parâmetro", () => {
    expect(scrubSecrets("https://x/y?cadastro=1")).toBe("https://x/y?cadastro=1");
  });
});

describe("logUnexpectedError", () => {
  afterEach(() => vi.restoreAllMocks());

  it("registra a causa de erro comum, com o token mascarado", () => {
    const saida = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logUnexpectedError(new Error("falhou em https://h/p?ca=segredo"), { tool: "t" });
    expect(saida).toHaveBeenCalledTimes(1);
    const linha = String(saida.mock.calls[0][0]);
    expect(linha).toContain('"tool":"t"');
    expect(linha).toContain("falhou");
    expect(linha).not.toContain("segredo");
  });

  it("ignora PjeError, que já chega ao cliente com código e mensagem", () => {
    const saida = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logUnexpectedError(new PjeError("TIMEOUT", "x"));
    expect(saida).not.toHaveBeenCalled();
  });
});

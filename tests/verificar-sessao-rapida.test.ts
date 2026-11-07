import { describe, expect, it } from "vitest";
import { verificarSessaoRapida } from "../src/pje/client.js";

function sessaoCom(resposta: { status: number; contentType?: string } | Error) {
  return {
    context: {
      request: {
        get: async (_url: string, opcoes: { maxRedirects?: number }) => {
          // Sem `maxRedirects: 0` o Playwright seguiria o 302 até a tela do SSO e devolveria 200 em HTML.
          expect(opcoes.maxRedirects).toBe(0);
          if (resposta instanceof Error) throw resposta;
          return { status: () => resposta.status, headers: () => (resposta.contentType ? { "content-type": resposta.contentType } : {}) };
        },
      },
    },
  } as never;
}

describe("verificarSessaoRapida", () => {
  it("200 em JSON é sessão ativa", async () => {
    expect(await verificarSessaoRapida(sessaoCom({ status: 200, contentType: "application/json" }), "1")).toBe(true);
  });

  it.each([302, 401, 403])("%i é sessão ausente (a confirmar pelo caminho completo)", async (status) => {
    expect(await verificarSessaoRapida(sessaoCom({ status }), "2")).toBe(false);
  });

  it("200 em HTML não é conclusivo", async () => {
    expect(await verificarSessaoRapida(sessaoCom({ status: 200, contentType: "text/html" }), "1")).toBeUndefined();
  });

  it("5xx e falha de rede não são conclusivos", async () => {
    expect(await verificarSessaoRapida(sessaoCom({ status: 503 }), "1")).toBeUndefined();
    expect(await verificarSessaoRapida(sessaoCom(new Error("timeout")), "1")).toBeUndefined();
  });
});

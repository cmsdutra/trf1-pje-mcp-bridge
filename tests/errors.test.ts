import { describe, expect, it } from "vitest";
import { AUTH_INSTRUCTIONS } from "../src/pje/client.js";
import { PjeError, toStructuredError } from "../src/utils/errors.js";

describe("errors", () => {
  it("serializa erro PJe estruturado", () => {
    expect(toStructuredError(new PjeError("SESSION_EXPIRED", "Sessão expirada", { grau: "1" }))).toEqual({
      code: "SESSION_EXPIRED",
      message: "Sessão expirada",
      details: { grau: "1" },
    });
  });

  it("orienta autenticação tanto em clone local quanto em instalação GitHub/npx", () => {
    expect(AUTH_INSTRUCTIONS).toContain("npm run auth");
    expect(AUTH_INSTRUCTIONS).toContain("mcp-pje-trf1-auth");
  });
});

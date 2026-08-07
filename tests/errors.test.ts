import { describe, expect, it } from "vitest";
import { PjeError, toStructuredError } from "../src/utils/errors.js";

describe("errors", () => {
  it("serializa erro PJe estruturado", () => {
    expect(toStructuredError(new PjeError("SESSION_EXPIRED", "Sessão expirada", { grau: "1" }))).toEqual({
      code: "SESSION_EXPIRED",
      message: "Sessão expirada",
      details: { grau: "1" },
    });
  });
});

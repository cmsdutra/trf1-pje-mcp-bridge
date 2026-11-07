import { describe, expect, it } from "vitest";
import { baixarDocumento, DOCUMENTO_ID_RE } from "../src/pje/downloads.js";

describe("validação de documento_id", () => {
  it.each(["..", ".", "../x", "12a", "", " ", "1".repeat(21)])("rejeita %j", async (id) => {
    expect(DOCUMENTO_ID_RE.test(id.trim())).toBe(false);
    await expect(baixarDocumento("0000001-55.2020.4.01.3400", "1", id)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("aceita ids numéricos", () => {
    expect(DOCUMENTO_ID_RE.test("123456789")).toBe(true);
  });
});

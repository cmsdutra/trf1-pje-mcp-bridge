import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureDirInsideBase } from "../src/utils/filesystem.js";

describe("ensureDirInsideBase: nomes reservados do Windows", () => {
  it.each(["con", "NUL", "aux.txt", "COM1", "lpt9", "ok/nul", "pasta.", "pasta "])("recusa %j", async (relativo) => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "base-"));
    await expect(ensureDirInsideBase(base, relativo)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(await fs.readdir(base)).toEqual([]);
  });

  it.each(["ok/sub", "console", "com10", "auxiliar", "2026-11", "."])("aceita %j", async (relativo) => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "base-"));
    await expect(ensureDirInsideBase(base, relativo)).resolves.toContain(base);
  });
});

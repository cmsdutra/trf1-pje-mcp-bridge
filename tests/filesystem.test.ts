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

import fs from "node:fs/promises";
import os from "node:os";
import { ensureDirInsideBase, writeFileExclusive, writePrivateFileAtomic } from "../src/utils/filesystem.js";

/** No Windows, criar symlink exige privilégio especial (EPERM para usuário comum): nesse caso o teste é pulado. */
async function symlinkOuPular(ctx: { skip: () => void }, alvo: string, link: string): Promise<void> {
  try {
    await fs.symlink(alvo, link);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM" || code === "EACCES") ctx.skip();
    else throw error;
  }
}

describe("filesystem (endurecimento)", () => {
  it("aceita diretório que começa com '..' mas não escapa", () => {
    const base = path.resolve("downloads");
    expect(ensureInsideBase(base, "..foo")).toBe(path.join(base, "..foo"));
  });

  it("bloqueia symlink dentro da base apontando para fora", async (ctx) => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "base-"));
    const fora = await fs.mkdtemp(path.join(os.tmpdir(), "fora-"));
    await symlinkOuPular(ctx, fora, path.join(base, "link"));
    await expect(ensureDirInsideBase(base, "link/sub")).rejects.toThrow("symlink");
    expect(await fs.readdir(fora)).toEqual([]);
  });

  it("não sobrescreve arquivo existente (sufixo em colisão)", async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "base-"));
    await fs.writeFile(path.join(base, "001_x.pdf"), "original");
    const gravado = await writeFileExclusive(base, "001_x.pdf", "dados");
    expect(path.basename(gravado)).toBe("001_x-1.pdf");
    expect(await fs.readFile(path.join(base, "001_x.pdf"), "utf8")).toBe("original");
  });

  it("não segue symlink pendente", async (ctx) => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "base-"));
    const fora = await fs.mkdtemp(path.join(os.tmpdir(), "fora-"));
    await symlinkOuPular(ctx, path.join(fora, "pwned.txt"), path.join(base, "001_x.pdf"));
    const gravado = await writeFileExclusive(base, "001_x.pdf", "dados");
    expect(path.basename(gravado)).toBe("001_x-1.pdf");
    expect(await fs.readdir(fora)).toEqual([]);
    const segundo = await writeFileExclusive(base, "001_x.pdf", "outro");
    expect(path.basename(segundo)).toBe("001_x-2.pdf");
  });

  it("grava arquivo privado com 0600", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "priv-"));
    const alvo = path.join(dir, "storage-state.json");
    await writePrivateFileAtomic(alvo, "{}");
    // Windows não tem bits de permissão POSIX (usa ACLs; o perfil do usuário já é privado).
    if (process.platform !== "win32") expect((await fs.stat(alvo)).mode & 0o777).toBe(0o600);
    expect(await fs.readdir(dir)).toEqual(["storage-state.json"]);
  });
});

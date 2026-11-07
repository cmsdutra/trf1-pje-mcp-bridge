import fs from "node:fs/promises";
import path from "node:path";
import { PjeError } from "./errors.js";

export function sanitizeFileName(name: string, fallback = "documento"): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .replace(/[._\s-]+$/g, "")
    .toLowerCase();
  return cleaned.slice(0, 140) || fallback;
}

export function ensureInsideBase(baseDir: string, candidate: string): string {
  const resolvedBase = path.resolve(baseDir);
  const resolvedCandidate = path.resolve(resolvedBase, candidate);
  const relative = path.relative(resolvedBase, resolvedCandidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new PjeError("PATH_TRAVERSAL", "Caminho de destino fora do diretório-base autorizado.");
  }
  return resolvedCandidate;
}

/** True se `child` está em `parent` (ou é ele), comparando caminhos já resolvidos. */
function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/**
 * Cria o diretório e confirma, via `realpath`, que ele continua dentro da base depois de resolver
 * symlinks — a checagem léxica de `ensureInsideBase` não vê um `link -> /fora` dentro da base.
 */
export async function ensureDirInsideBase(baseDir: string, relativeDir = "."): Promise<string> {
  const dir = ensureInsideBase(baseDir, relativeDir);
  await fs.mkdir(baseDir, { recursive: true, mode: 0o700 });
  const realBase = await fs.realpath(baseDir);
  const falha = () => new PjeError("PATH_TRAVERSAL", "Caminho de destino fora do diretório-base autorizado (symlink).");

  // Antes de criar qualquer coisa: o ancestral existente mais profundo não pode resolver para fora
  // (`mkdir -p link/sub` seguiria o symlink e criaria `sub` fora da base).
  let existente = dir;
  while (true) {
    try {
      await fs.lstat(existente);
      break;
    } catch {
      existente = path.dirname(existente);
    }
  }
  if (!isWithin(realBase, await fs.realpath(existente))) throw falha();

  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  if (!isWithin(realBase, await fs.realpath(dir))) throw falha();
  return dir;
}

/**
 * Grava um arquivo NOVO sem nunca sobrescrever nem seguir symlink: usa `wx` (EEXIST também para
 * symlink pendente) e, se o nome estiver ocupado, tenta o próximo sufixo. Elimina a corrida
 * "verifica, depois grava" de `nextAvailableFilePath` + `writeFile`.
 */
export async function writeFileExclusive(directory: string, fileName: string, data: Buffer | string): Promise<string> {
  const parsed = path.parse(fileName);
  for (let suffix = 0; suffix < 10_000; suffix++) {
    const name = suffix === 0 ? fileName : `${parsed.name}-${suffix}${parsed.ext}`;
    const candidate = path.join(directory, name);
    try {
      await fs.writeFile(candidate, data, { flag: "wx", mode: 0o600 });
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new PjeError("DOWNLOAD_FAILED", "Não foi possível escolher um nome de arquivo livre.");
}

/** Grava (ou substitui) um arquivo privado: temporário criado com 0600 e `rename` atômico. */
export async function writePrivateFileAtomic(filePath: string, data: string): Promise<void> {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  try {
    await fs.writeFile(tmp, data, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await fs.rename(tmp, filePath);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function nextAvailableFilePath(directory: string, fileName: string): Promise<string> {
  const parsed = path.parse(fileName);
  let candidate = path.join(directory, fileName);
  let suffix = 1;
  while (true) {
    try {
      await fs.lstat(candidate);
      candidate = path.join(directory, `${parsed.name}-${suffix}${parsed.ext}`);
      suffix += 1;
    } catch {
      return candidate;
    }
  }
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
}

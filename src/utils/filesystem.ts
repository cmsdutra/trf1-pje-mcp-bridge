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
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new PjeError("PATH_TRAVERSAL", "Caminho de destino fora do diretório-base autorizado.");
  }
  return resolvedCandidate;
}

export async function ensureDirInsideBase(baseDir: string, relativeDir = "."): Promise<string> {
  const dir = ensureInsideBase(baseDir, relativeDir);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export async function nextAvailableFilePath(directory: string, fileName: string): Promise<string> {
  const parsed = path.parse(fileName);
  let candidate = path.join(directory, fileName);
  let suffix = 1;
  while (true) {
    try {
      await fs.access(candidate);
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

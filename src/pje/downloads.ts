import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { DocumentoProcesso, DownloadDocumentoResultado, ManifestDocumento, ManifestInteiroTeor, ProcessoMetadata } from "../types.js";
import { assertValidCnj } from "../utils/cnj.js";
import { PjeError } from "../utils/errors.js";
import { ensureDirInsideBase, nextAvailableFilePath, sanitizeFileName, writeJsonFile } from "../utils/filesystem.js";
import type { Grau } from "./urls.js";
import { listarDocumentos } from "./documents.js";
import { consultarProcesso } from "./process.js";

export function makeDownloadFileName(documento: DocumentoProcesso, extension = ".pdf"): string {
  const base = sanitizeFileName(documento.nome || documento.tipo || "documento");
  return `${String(documento.indice).padStart(3, "0")}_${base}${extension}`;
}

export async function baixarDocumento(
  numeroProcesso: string,
  grau: Grau,
  documentoId: string,
  diretorioDestino?: string,
): Promise<DownloadDocumentoResultado> {
  assertValidCnj(numeroProcesso);
  if (!documentoId.trim()) {
    throw new PjeError("INVALID_INPUT", "documento_id é obrigatório.", { field: "documento_id" });
  }
  const baseDir = diretorioDestino ? path.resolve(config.downloadDir, diretorioDestino) : config.downloadDir;
  await ensureDirInsideBase(config.downloadDir, path.relative(config.downloadDir, baseDir));
  throw new PjeError(
    "PJE_INTERFACE_CHANGED",
    "Download autenticado ainda depende de inspeção da interface do PJe para localizar o documento sem inventar seletores. Rode `npm run inspect -- <numero-processo>` para mapear a interface autenticada antes de usar esta tool.",
    { grau, documentoId },
  );
}

export async function createManifest(params: {
  numeroProcesso: string;
  grau: Grau;
  urlOrigem?: string;
  metadadosProcesso?: ProcessoMetadata;
  documentos: ManifestDocumento[];
}): Promise<ManifestInteiroTeor> {
  const quantidadeBaixada = params.documentos.filter((doc) => doc.status === "baixado").length;
  const quantidadeComErro = params.documentos.filter((doc) => doc.status === "erro").length;
  return {
    numeroProcesso: params.numeroProcesso,
    grau: params.grau,
    coletadoEm: new Date().toISOString(),
    urlOrigem: params.urlOrigem,
    metadadosProcesso: params.metadadosProcesso,
    quantidadeTotalDocumentos: params.documentos.length,
    quantidadeBaixada,
    quantidadeComErro,
    documentos: params.documentos,
  };
}

export async function baixarInteiroTeor(numeroProcesso: string, grau: Grau, diretorioDestino?: string): Promise<ManifestInteiroTeor> {
  const numeroCnj = assertValidCnj(numeroProcesso);
  const relativeProcessDir = path.join(diretorioDestino ?? ".", sanitizeFileName(numeroCnj, "processo"));
  const processDir = await ensureDirInsideBase(config.downloadDir, relativeProcessDir);
  let metadadosProcesso: ProcessoMetadata | undefined;
  try {
    metadadosProcesso = await consultarProcesso(numeroCnj, grau);
  } catch {
    metadadosProcesso = undefined;
  }
  const documentos = await listarDocumentos(numeroCnj, grau);
  const manifestDocs: ManifestDocumento[] = [];
  for (const documento of documentos) {
    try {
      const fileName = makeDownloadFileName(documento);
      const targetPath = await nextAvailableFilePath(processDir, fileName);
      await baixarDocumento(numeroCnj, grau, documento.downloadId, path.relative(config.downloadDir, processDir));
      await fs.access(targetPath).catch(() => undefined);
      manifestDocs.push({
        indice: documento.indice,
        identificador: documento.identificadorInterno,
        nomeOriginal: documento.nome,
        nomeLocal: path.basename(targetPath),
        tipo: documento.tipo,
        data: documento.data,
        metadados: documento.metadados,
        status: "baixado",
      });
    } catch (error) {
      manifestDocs.push({
        indice: documento.indice,
        identificador: documento.identificadorInterno,
        nomeOriginal: documento.nome,
        tipo: documento.tipo,
        data: documento.data,
        metadados: documento.metadados,
        status: "erro",
        mensagemErro: error instanceof Error ? error.message : "Falha desconhecida.",
      });
    }
  }
  const manifest = await createManifest({
    numeroProcesso: numeroCnj,
    grau,
    urlOrigem: metadadosProcesso?.url,
    metadadosProcesso,
    documentos: manifestDocs,
  });
  await writeJsonFile(path.join(processDir, "manifest.json"), manifest);
  return manifest;
}

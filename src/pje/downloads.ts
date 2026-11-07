import path from "node:path";
import type { APIResponse } from "playwright";
import { config } from "../config.js";
import type { DocumentoProcesso, DownloadDocumentoResultado, ManifestDocumento, ManifestInteiroTeor, ProcessoMetadata } from "../types.js";
import { assertValidCnj } from "../utils/cnj.js";
import { PjeError } from "../utils/errors.js";
import { ensureDirInsideBase, sanitizeFileName, writeFileExclusive } from "../utils/filesystem.js";
import { log } from "../utils/logger.js";
import { AUTH_INSTRUCTIONS, closeSession, requireAuthenticated, type PjeSession } from "./client.js";
import { abrirAutosDigitais, extrairCabecalho, extrairTimeline } from "./autos.js";
import { extensaoParaContentType, mapCabecalhoParaMetadata, mapTimelineParaDocumentos } from "./autos-parse.js";
import { authenticatedSelectors } from "./selectors.js";
import { getPjeEnvironment, type Grau } from "./urls.js";
import { sortDocumentsByProcessOrder } from "./documents.js";

/** `idProcessoDocumento` do PJe é numérico; qualquer outra coisa iria crua para o caminho da URL. */
export const DOCUMENTO_ID_RE = /^\d{1,20}$/;

export function makeDownloadFileName(documento: DocumentoProcesso, extension = ".pdf"): string {
  const base = sanitizeFileName(documento.nome || documento.tipo || "documento");
  return `${String(documento.indice).padStart(3, "0")}_${base}${extension}`;
}

/** Marcadores da tela de login do SSO — o endpoint devolve HTML legítimo, então não basta o MIME. */
function pareceTelaDeLogin(url: string, corpo: Buffer): boolean {
  if (url.includes("sso.cloud.pje.jus.br")) return true;
  const inicio = corpo.subarray(0, 4096).toString("utf8");
  return inicio.includes('id="kc-login"') || inicio.includes("kc-form-login");
}

function urlsDeDownload(grau: Grau, documentoId: string, idProcesso?: string): string[] {
  const env = getPjeEnvironment(grau);
  const id = encodeURIComponent(documentoId);
  const urls = [`${env.baseUrl}${authenticatedSelectors.documentDownloadPathTemplate.replace("{id}", id)}`];
  if (idProcesso) {
    urls.push(
      `${env.baseUrl}${authenticatedSelectors.documentDownloadPathTemplateLongo
        .replace("{tribunal}", env.tribunal)
        .replace("{grau}", grau)
        .replace("{idProcesso}", encodeURIComponent(idProcesso))
        .replace("{id}", id)}`,
    );
  }
  return urls;
}

/**
 * GET com retentativa para falhas transitórias.
 *
 * O PJe oscila bastante de desempenho: num lote de inteiro teor, um documento grande pode estourar
 * o timeout enquanto os vizinhos baixam em segundos. Sem retentativa, essa oscilação vira um
 * documento faltando no manifesto — inaceitável para coleta de autos. Erros de rede/timeout e 5xx
 * são retentados; 4xx (não existe, sem permissão) não, porque não melhoram com repetição.
 */
async function buscarComRetentativa(session: PjeSession, url: string, documentoId: string, grau: Grau): Promise<APIResponse> {
  const MAX = 3;
  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= MAX; tentativa++) {
    if (tentativa > 1) await new Promise((resolve) => setTimeout(resolve, tentativa * 2_000));
    try {
      const response = await session.context.request.get(url, { timeout: 120_000 });
      if (response.status() >= 500 && tentativa < MAX) {
        log("warn", "PJe respondeu 5xx no download; tentando novamente", { documentoId, status: response.status(), tentativa });
        continue;
      }
      return response;
    } catch (error) {
      ultimoErro = error;
      log("warn", "Falha de rede no download; tentando novamente", { documentoId, tentativa, erro: String(error).slice(0, 200) });
    }
  }
  throw new PjeError("DOWNLOAD_FAILED", `Falha de rede ao baixar o documento ${documentoId} após ${MAX} tentativas.`, {
    grau,
    documentoId,
    erro: String(ultimoErro),
  });
}

/**
 * Baixa um documento reaproveitando uma sessão já autenticada.
 *
 * O download é feito por HTTP direto (`context.request`, que herda os cookies do `BrowserContext`),
 * não por clique + captura de evento de download: o endpoint REST usado pelo visualizador do PJe
 * autoriza só pelo cookie de sessão, então a requisição direta é mais simples e mais estável.
 */
export async function baixarDocumentoComSessao(
  session: PjeSession,
  grau: Grau,
  documentoId: string,
  destinoDir: string,
  documento?: DocumentoProcesso,
  idProcesso?: string,
): Promise<DownloadDocumentoResultado> {
  if (!DOCUMENTO_ID_RE.test(documentoId) || (idProcesso !== undefined && !DOCUMENTO_ID_RE.test(idProcesso))) {
    throw new PjeError("INVALID_INPUT", "Identificador de documento/processo inválido.", { field: "documento_id" });
  }
  const tentativas = urlsDeDownload(grau, documentoId, idProcesso);
  let ultimoStatus = 0;

  for (const [posicao, url] of tentativas.entries()) {
    const response = await buscarComRetentativa(session, url, documentoId, grau);

    if (!response.ok()) {
      ultimoStatus = response.status();
      // A forma curta da URL nem sempre atende; se houver variante longa, vale tentar antes de falhar.
      if (posicao < tentativas.length - 1) continue;
      if (ultimoStatus === 404) {
        throw new PjeError("DOCUMENT_NOT_FOUND", `Documento ${documentoId} não encontrado no PJe.`, { grau, documentoId });
      }
      if (ultimoStatus === 401 || ultimoStatus === 403) {
        throw new PjeError("DOCUMENT_NOT_ACCESSIBLE", `Sem permissão para baixar o documento ${documentoId} com a sessão atual.`, {
          grau,
          documentoId,
          status: ultimoStatus,
        });
      }
      throw new PjeError("DOWNLOAD_FAILED", `O PJe respondeu HTTP ${ultimoStatus} ao baixar o documento ${documentoId}.`, {
        grau,
        documentoId,
        status: ultimoStatus,
      });
    }

    // Recusa cedo pelo Content-Length; o corpo é carregado inteiro em memória, então o teto vale de novo depois.
    const declarado = Number(response.headers()["content-length"]);
    if (Number.isFinite(declarado) && declarado > config.maxDocumentBytes) {
      throw new PjeError("DOWNLOAD_FAILED", `Documento ${documentoId} excede o limite de ${config.maxDocumentBytes} bytes (PJE_MAX_DOCUMENT_BYTES).`, {
        grau,
        documentoId,
        bytes: declarado,
      });
    }
    const corpo = await response.body();
    if (corpo.length > config.maxDocumentBytes) {
      throw new PjeError("DOWNLOAD_FAILED", `Documento ${documentoId} excede o limite de ${config.maxDocumentBytes} bytes (PJE_MAX_DOCUMENT_BYTES).`, {
        grau,
        documentoId,
        bytes: corpo.length,
      });
    }
    if (pareceTelaDeLogin(response.url(), corpo)) {
      throw new PjeError("SESSION_EXPIRED", `Sessão PJe expirada durante o download. ${AUTH_INSTRUCTIONS}`, { grau, documentoId });
    }
    if (!corpo.length) {
      throw new PjeError("DOWNLOAD_FAILED", `O PJe devolveu um corpo vazio para o documento ${documentoId}.`, { grau, documentoId });
    }

    const contentType = response.headers()["content-type"];
    // Documentos redigidos no editor do PJe vêm em HTML; só os anexos são PDF. Um content-type
    // desconhecido não é motivo para falhar — gravamos com `.bin` e registramos o tipo real.
    const extensao = extensaoParaContentType(contentType) ?? ".bin";
    const nomeArquivo = documento
      ? makeDownloadFileName(documento, extensao)
      : `${sanitizeFileName(`documento_${documentoId}`)}${extensao}`;
    // `wx`: nunca sobrescreve nem segue symlink; em colisão usa o próximo sufixo.
    const caminhoLocal = await writeFileExclusive(destinoDir, nomeArquivo, corpo);

    const metadados: DocumentoProcesso = documento ?? {
      indice: 0,
      identificadorInterno: documentoId,
      nome: `documento_${documentoId}`,
      downloadId: documentoId,
      acessivel: true,
    };

    log("debug", "Documento baixado", { grau, documentoId, bytes: corpo.length, contentType });
    return {
      caminhoLocal,
      nomeArquivo: path.basename(caminhoLocal),
      metadados: {
        ...metadados,
        metadados: { ...metadados.metadados, contentType, bytes: corpo.length },
      },
    };
  }

  throw new PjeError("DOWNLOAD_FAILED", `Não foi possível baixar o documento ${documentoId}.`, { grau, documentoId, status: ultimoStatus });
}

export async function baixarDocumento(
  numeroProcesso: string,
  grau: Grau,
  documentoId: string,
  diretorioDestino?: string,
): Promise<DownloadDocumentoResultado> {
  assertValidCnj(numeroProcesso);
  if (!DOCUMENTO_ID_RE.test(documentoId.trim())) {
    throw new PjeError("INVALID_INPUT", "documento_id deve ser numérico (idProcessoDocumento).", { field: "documento_id" });
  }
  const baseDir = diretorioDestino ? path.resolve(config.downloadDir, diretorioDestino) : config.downloadDir;
  const destinoDir = await ensureDirInsideBase(config.downloadDir, path.relative(config.downloadDir, baseDir));
  const session = await requireAuthenticated(grau);
  try {
    try {
      return await baixarDocumentoComSessao(session, grau, documentoId.trim(), destinoDir);
    } catch (error) {
      // No 2º grau a URL curta responde 404; só a variante longa (com `idProcesso`) atende. O
      // `idProcesso` vem dos autos, então só os abrimos quando a forma curta falhou.
      if (!(error instanceof PjeError) || error.code !== "DOCUMENT_NOT_FOUND") throw error;
      const autos = await abrirAutosDigitais(session, numeroProcesso, grau);
      if (!autos.idProcesso) throw error;
      return await baixarDocumentoComSessao(session, grau, documentoId.trim(), destinoDir, undefined, autos.idProcesso);
    }
  } finally {
    await closeSession(session);
  }
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

/**
 * Baixa o inteiro teor numa única sessão de navegador. Abrir uma sessão por documento (como na
 * versão anterior) inviabilizaria processos com dezenas ou centenas de documentos.
 */
export async function baixarInteiroTeor(numeroProcesso: string, grau: Grau, diretorioDestino?: string): Promise<ManifestInteiroTeor> {
  const numeroCnj = assertValidCnj(numeroProcesso);
  const relativeProcessDir = path.join(diretorioDestino ?? ".", sanitizeFileName(numeroCnj, "processo"));
  const processDir = await ensureDirInsideBase(config.downloadDir, relativeProcessDir);

  const session = await requireAuthenticated(grau);
  const manifestDocs: ManifestDocumento[] = [];
  let metadadosProcesso: ProcessoMetadata | undefined;
  try {
    // Os autos são abertos UMA única vez: `listAutosDigitais.seam` abre uma conversação do Seam e
    // reentrar nela na mesma aba cai em `error.seam`. Cabeçalho e timeline saem da mesma página.
    const autos = await abrirAutosDigitais(session, numeroCnj, grau);

    try {
      metadadosProcesso = mapCabecalhoParaMetadata(await extrairCabecalho(autos.page), {
        numeroCnj,
        grau,
        url: autos.url,
        identificadorInterno: autos.idProcesso,
      });
    } catch (error) {
      log("warn", "Não foi possível ler os metadados do processo; seguindo só com os documentos", {
        grau,
        numeroCnj,
        erro: error instanceof Error ? error.message : String(error),
      });
      metadadosProcesso = undefined;
    }

    const documentos = sortDocumentsByProcessOrder(mapTimelineParaDocumentos(await extrairTimeline(autos.page)));
    if (documentos.length > config.maxBatchDocuments) {
      throw new PjeError(
        "INVALID_INPUT",
        `O processo tem ${documentos.length} documentos, acima do limite de ${config.maxBatchDocuments} por coleta (PJE_MAX_BATCH_DOCUMENTS). Use baixar_documento ou aumente o limite.`,
        { grau, quantidade: documentos.length },
      );
    }
    let bytesTotais = 0;
    for (const documento of documentos) {
      if (bytesTotais >= config.maxBatchBytes) {
        manifestDocs.push({
          indice: documento.indice,
          identificador: documento.identificadorInterno,
          nomeOriginal: documento.nome,
          tipo: documento.tipo,
          data: documento.data,
          metadados: documento.metadados,
          status: "erro",
          mensagemErro: `Limite de ${config.maxBatchBytes} bytes por coleta atingido (PJE_MAX_BATCH_BYTES).`,
        });
        continue;
      }
      try {
        const resultado = await baixarDocumentoComSessao(
          session,
          grau,
          documento.downloadId,
          processDir,
          documento,
          metadadosProcesso?.identificadorInterno,
        );
        const bytes = resultado.metadados.metadados?.bytes;
        if (typeof bytes === "number") bytesTotais += bytes;
        manifestDocs.push({
          indice: documento.indice,
          identificador: documento.identificadorInterno,
          nomeOriginal: documento.nome,
          nomeLocal: resultado.nomeArquivo,
          tipo: documento.tipo,
          data: documento.data,
          metadados: resultado.metadados.metadados,
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
  } finally {
    await closeSession(session);
  }

  const manifest = await createManifest({
    numeroProcesso: numeroCnj,
    grau,
    urlOrigem: metadadosProcesso?.url,
    metadadosProcesso,
    documentos: manifestDocs,
  });
  // `writeJsonFile` grava com flag `wx` (nunca sobrescreve). Numa segunda coleta do mesmo processo
  // o manifesto anterior é preservado e este vira `manifest-1.json`.
  await writeFileExclusive(processDir, "manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

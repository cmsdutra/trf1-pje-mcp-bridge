import type { DocumentoProcesso } from "../types.js";
import { assertValidCnj } from "../utils/cnj.js";
import { closeSession, requireAuthenticated } from "./client.js";
import { abrirAutosDigitais, extrairTimeline } from "./autos.js";
import { mapTimelineParaDocumentos } from "./autos-parse.js";
import type { Grau } from "./urls.js";

export function sortDocumentsByProcessOrder(documents: DocumentoProcesso[]): DocumentoProcesso[] {
  return [...documents].sort((a, b) => a.indice - b.indice);
}

export async function listarDocumentos(numeroProcesso: string, grau: Grau): Promise<DocumentoProcesso[]> {
  const numeroCnj = assertValidCnj(numeroProcesso);
  const session = await requireAuthenticated(grau);
  try {
    const autos = await abrirAutosDigitais(session, numeroCnj, grau);
    const eventos = await extrairTimeline(autos.page);
    return sortDocumentsByProcessOrder(mapTimelineParaDocumentos(eventos));
  } finally {
    await closeSession(session);
  }
}

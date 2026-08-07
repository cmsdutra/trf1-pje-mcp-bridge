import type { DocumentoProcesso } from "../types.js";
import { assertValidCnj } from "../utils/cnj.js";
import { PjeError } from "../utils/errors.js";
import { closeSession, requireAuthenticated } from "./client.js";
import { authenticatedSelectors } from "./selectors.js";
import type { Grau } from "./urls.js";

export function sortDocumentsByProcessOrder(documents: DocumentoProcesso[]): DocumentoProcesso[] {
  return [...documents].sort((a, b) => a.indice - b.indice);
}

export async function listarDocumentos(numeroProcesso: string, grau: Grau): Promise<DocumentoProcesso[]> {
  const numeroCnj = assertValidCnj(numeroProcesso);
  const session = await requireAuthenticated(grau);
  try {
    if (!authenticatedSelectors.inspected) {
      throw new PjeError(
        "PJE_INTERFACE_CHANGED",
        "A árvore/listagem autenticada de documentos ainda não foi mapeada. Execute npm run auth e faça inspeção autenticada antes de usar esta tool.",
        { grau, numeroCnj },
      );
    }
    throw new PjeError("PJE_INTERFACE_CHANGED", "Seletores autenticados não implementados.");
  } finally {
    await closeSession(session);
  }
}

import type { DocumentoProcesso } from "../types.js";
import { assertValidCnj } from "../utils/cnj.js";
import { PjeError } from "../utils/errors.js";
import { AUTH_INSTRUCTIONS, closeSession, requireAuthenticated } from "./client.js";
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
        `A árvore/listagem autenticada de documentos ainda não foi mapeada. ${AUTH_INSTRUCTIONS} Em seguida, rode \`npm run inspect -- <numero-processo>\` (ou \`npx -y -p github:cmsdutra/trf1-pje-mcp-bridge mcp-pje-trf1-inspect <numero-processo>\`) para mapear a interface autenticada antes de usar esta tool.`,
        { grau, numeroCnj },
      );
    }
    throw new PjeError("PJE_INTERFACE_CHANGED", "Seletores autenticados não implementados.");
  } finally {
    await closeSession(session);
  }
}

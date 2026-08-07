import type { ProcessoMetadata } from "../types.js";
import { assertValidCnj } from "../utils/cnj.js";
import { PjeError } from "../utils/errors.js";
import { closeSession, requireAuthenticated } from "./client.js";
import { authenticatedSelectors } from "./selectors.js";
import { type Grau } from "./urls.js";

export async function consultarProcesso(numeroProcesso: string, grau: Grau): Promise<ProcessoMetadata> {
  const numeroCnj = assertValidCnj(numeroProcesso);
  const session = await requireAuthenticated(grau);
  try {
    if (!authenticatedSelectors.inspected) {
      throw new PjeError(
        "PJE_INTERFACE_CHANGED",
        "A área autenticada de consulta de processo ainda não foi mapeada. Execute npm run auth e faça inspeção autenticada antes de usar esta tool.",
        { grau, numeroCnj },
      );
    }
    throw new PjeError("PJE_INTERFACE_CHANGED", "Seletores autenticados não implementados.");
  } finally {
    await closeSession(session);
  }
}

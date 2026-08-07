import type { ProcessoMetadata } from "../types.js";
import { assertValidCnj } from "../utils/cnj.js";
import { PjeError } from "../utils/errors.js";
import { AUTH_INSTRUCTIONS, closeSession, requireAuthenticated } from "./client.js";
import { authenticatedSelectors } from "./selectors.js";
import { type Grau } from "./urls.js";

export async function consultarProcesso(numeroProcesso: string, grau: Grau): Promise<ProcessoMetadata> {
  const numeroCnj = assertValidCnj(numeroProcesso);
  const session = await requireAuthenticated(grau);
  try {
    if (!authenticatedSelectors.inspected) {
      throw new PjeError(
        "PJE_INTERFACE_CHANGED",
        `A área autenticada de consulta de processo ainda não foi mapeada. ${AUTH_INSTRUCTIONS} Em seguida, rode \`npm run inspect -- <numero-processo>\` (ou \`npx -y -p github:cmsdutra/trf1-pje-mcp-bridge mcp-pje-trf1-inspect <numero-processo>\`) para mapear a interface autenticada antes de usar esta tool.`,
        { grau, numeroCnj },
      );
    }
    throw new PjeError("PJE_INTERFACE_CHANGED", "Seletores autenticados não implementados.");
  } finally {
    await closeSession(session);
  }
}

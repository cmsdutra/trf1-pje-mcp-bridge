import type { ProcessoMetadata } from "../types.js";
import { assertValidCnj } from "../utils/cnj.js";
import { closeSession, requireAuthenticated } from "./client.js";
import { abrirAutosDigitais, extrairCabecalho } from "./autos.js";
import { mapCabecalhoParaMetadata } from "./autos-parse.js";
import { type Grau } from "./urls.js";

export async function consultarProcesso(numeroProcesso: string, grau: Grau): Promise<ProcessoMetadata> {
  const numeroCnj = assertValidCnj(numeroProcesso);
  const session = await requireAuthenticated(grau);
  try {
    const autos = await abrirAutosDigitais(session, numeroCnj, grau);
    const cabecalho = await extrairCabecalho(autos.page);
    return mapCabecalhoParaMetadata(cabecalho, {
      numeroCnj,
      grau,
      url: autos.url,
      identificadorInterno: autos.idProcesso,
    });
  } finally {
    await closeSession(session);
  }
}

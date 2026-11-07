import { z } from "zod/v4";
import { hasSavedSession, launchSession, closeSession, detectAuthenticated, lerPerfilAtivo } from "../pje/client.js";
import type { Grau } from "../pje/urls.js";

export const statusAutenticacaoSchema = {
  grau: z.enum(["1", "2"]).default("1"),
};

export async function statusAutenticacao({ grau }: { grau: Grau }) {
  const existeSessaoSalva = await hasSavedSession();
  if (!existeSessaoSalva) {
    return {
      existeSessaoSalva,
      aparentementeValida: false,
      grauVerificado: grau,
      necessariaNovaAutenticacao: true,
    };
  }
  const session = await launchSession(grau, true);
  try {
    const aparentementeValida = await detectAuthenticated(session.page, grau);
    return {
      existeSessaoSalva,
      aparentementeValida,
      grauVerificado: grau,
      necessariaNovaAutenticacao: !aparentementeValida,
      ...(aparentementeValida ? { perfilAtivo: await lerPerfilAtivo(session, grau) } : {}),
    };
  } finally {
    await closeSession(session);
  }
}

import { z } from "zod/v4";
import { baixarInteiroTeor } from "../pje/downloads.js";

export const baixarInteiroTeorSchema = {
  numero_processo: z.string().max(40),
  grau: z.enum(["1", "2"]),
  diretorio_destino: z.string().max(200).optional(),
};

export async function baixarInteiroTeorTool(input: { numero_processo: string; grau: "1" | "2"; diretorio_destino?: string }) {
  return baixarInteiroTeor(input.numero_processo, input.grau, input.diretorio_destino);
}

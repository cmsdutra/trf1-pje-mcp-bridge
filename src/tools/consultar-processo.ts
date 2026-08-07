import { z } from "zod/v4";
import { consultarProcesso } from "../pje/process.js";

export const consultarProcessoSchema = {
  numero_processo: z.string(),
  grau: z.enum(["1", "2"]),
};

export async function consultarProcessoTool(input: { numero_processo: string; grau: "1" | "2" }) {
  return consultarProcesso(input.numero_processo, input.grau);
}

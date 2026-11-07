import { z } from "zod/v4";
import { baixarDocumento } from "../pje/downloads.js";

export const baixarDocumentoSchema = {
  numero_processo: z.string().max(40),
  grau: z.enum(["1", "2"]),
  documento_id: z.string().regex(/^\d{1,20}$/, "documento_id deve ser numérico"),
  diretorio_destino: z.string().max(200).optional(),
};

export async function baixarDocumentoTool(input: { numero_processo: string; grau: "1" | "2"; documento_id: string; diretorio_destino?: string }) {
  return baixarDocumento(input.numero_processo, input.grau, input.documento_id, input.diretorio_destino);
}

import { z } from "zod/v4";
import { listarDocumentos } from "../pje/documents.js";

export const listarDocumentosSchema = {
  numero_processo: z.string().max(40),
  grau: z.enum(["1", "2"]),
};

export async function listarDocumentosTool(input: { numero_processo: string; grau: "1" | "2" }) {
  return { documentos: await listarDocumentos(input.numero_processo, input.grau) };
}

#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { config } from "./config.js";
import { toStructuredError } from "./utils/errors.js";
import { log } from "./utils/logger.js";
import { consultarProcessoSchema, consultarProcessoTool } from "./tools/consultar-processo.js";
import { listarDocumentosSchema, listarDocumentosTool } from "./tools/listar-documentos.js";
import { baixarDocumentoSchema, baixarDocumentoTool } from "./tools/baixar-documento.js";
import { baixarInteiroTeorSchema, baixarInteiroTeorTool } from "./tools/baixar-inteiro-teor.js";
import { statusAutenticacao, statusAutenticacaoSchema } from "./tools/status-autenticacao.js";
import { runManualAuthentication } from "./pje/auth.js";

const server = new McpServer({
  name: config.name,
  version: config.version,
});

function jsonResult(structuredContent: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
  };
}

function registerJsonTool<Input extends Record<string, unknown>>(
  name: string,
  description: string,
  inputSchema: Record<string, z.ZodType>,
  handler: (input: Input) => Promise<unknown>,
) {
  server.registerTool(
    name,
    {
      description,
      inputSchema,
    },
    async (input) => {
      try {
        const result = await handler(input as Input);
        return jsonResult(typeof result === "object" && result !== null && !Array.isArray(result) ? (result as Record<string, unknown>) : { result });
      } catch (error) {
        return {
          isError: true,
          ...jsonResult({ error: toStructuredError(error) }),
        };
      }
    },
  );
}

registerJsonTool("consultar_processo", "Consulta metadados de processo PJe TRF1 acessível à sessão autenticada.", consultarProcessoSchema, consultarProcessoTool);
registerJsonTool("listar_documentos", "Lista documentos do processo acessíveis à sessão autenticada.", listarDocumentosSchema, listarDocumentosTool);
registerJsonTool("baixar_documento", "Baixa um documento acessível do processo preservando o arquivo original quando disponível.", baixarDocumentoSchema, baixarDocumentoTool);
registerJsonTool("baixar_inteiro_teor", "Baixa todos os documentos acessíveis do processo em diretório exclusivo e gera manifest.json.", baixarInteiroTeorSchema, baixarInteiroTeorTool);
registerJsonTool("status_autenticacao", "Informa se há storageState salvo e se a sessão parece válida, sem expor cookies ou tokens.", statusAutenticacaoSchema, statusAutenticacao);
registerJsonTool(
  "autenticar",
  "Abre Chromium visível para autenticação manual e salva storageState. Não automatiza credenciais, MFA, CAPTCHA ou certificado.",
  { grau: z.enum(["1", "2"]).default("1") },
  async ({ grau }) => runManualAuthentication(grau as "1" | "2"),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("info", "Servidor MCP PJe TRF1 iniciado via stdio", { name: config.name, version: config.version });
}

main().catch((error: unknown) => {
  log("error", "Erro fatal no servidor MCP", { error: String(error) });
  process.exit(1);
});

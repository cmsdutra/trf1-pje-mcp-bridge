# Especificação de Skill: manipular-mcp-pje-trf1

## Objetivo

Criar uma skill Codex para orientar o uso, configuração, diagnóstico e manutenção operacional do servidor MCP `pje-trf1`. A skill deve ajudar o agente a manipular o MCP com segurança, validar autenticação, configurar escopo global ou de projeto, interpretar erros estruturados e orientar testes em linguagem natural.

## Nome Proposto

`manipular-mcp-pje-trf1`

## Descrição de Trigger

Use quando o usuário pedir para configurar, usar, testar, diagnosticar, reiniciar, migrar, documentar ou corrigir o servidor MCP `pje-trf1`; quando mencionar erros como `MCP startup interrupted`, `SESSION_MISSING`, `SESSION_EXPIRED`, `PJE_INTERFACE_CHANGED` ou `PATH_TRAVERSAL`; ou quando quiser baixar, listar, consultar ou verificar autenticação do PJe TRF1 por meio do MCP.

## Escopo

A skill deve cobrir:

- Configuração do MCP no Codex por `~/.codex/config.toml` e `.codex/config.toml` de projeto.
- Uso de caminhos absolutos e relativos no Windows.
- Variáveis `PJE_DOWNLOAD_DIR`, `PJE_STORAGE_STATE_PATH`, `PJE_HEADLESS` e `LOG_LEVEL`.
- Comandos de autenticação local e via GitHub/npx.
- Verificação com `codex mcp list` e `/mcp`.
- Testes iniciais em linguagem natural.
- Interpretação dos erros estruturados retornados pelas tools.
- Boas práticas para não inventar seletores do PJe autenticado.

## Fora de Escopo

A skill não deve:

- Automatizar credenciais, MFA, CAPTCHA ou certificado digital.
- Contornar controles de acesso, segredo de justiça ou permissões do PJe.
- Implementar seletores autenticados sem inspeção real da interface.
- Solicitar ou expor cookies, tokens, senhas ou conteúdo de `storageState`.

## Estrutura Recomendada

```text
manipular-mcp-pje-trf1/
├── SKILL.md
├── agents/
│   └── openai.yaml
└── references/
    ├── codex-config.md
    ├── errors.md
    └── workflows.md
```

## Conteúdo Essencial do SKILL.md

O `SKILL.md` deve conter instruções curtas e operacionais:

1. Ler primeiro a configuração ativa com `codex mcp list`.
2. Identificar se o escopo é global ou de projeto.
3. Preferir configuração de projeto quando o MCP só deve operar em uma pasta de trabalho.
4. Usar `LOG_LEVEL = "error"` para reduzir ruído em servidores `stdio`.
5. Usar `PJE_DOWNLOAD_DIR` como raiz autorizada para downloads.
6. Começar sempre por `status_autenticacao`.
7. Tratar `PJE_INTERFACE_CHANGED` como falta de mapeamento da interface autenticada, não como falha de login.

## Referência: Configuração Codex

`references/codex-config.md` deve incluir modelos como:

```toml
[mcp_servers.pje-trf1]
command = "node"
args = ["..\\..\\..\\Documents\\500 - Drive\\100 - Projetos\\trf1-pje-mcp-bridge\\dist\\server.js"]
cwd = "."
startup_timeout_sec = 120.0

[mcp_servers.pje-trf1.env]
PJE_DOWNLOAD_DIR = "Sandbox"
LOG_LEVEL = "error"
```

Também deve explicar que caminhos relativos são resolvidos a partir do `cwd` do processo MCP.

## Referência: Erros

`references/errors.md` deve mapear:

- `SESSION_MISSING`: autenticar manualmente.
- `SESSION_EXPIRED`: renovar autenticação manual.
- `PJE_INTERFACE_CHANGED`: mapear interface autenticada antes de usar consulta/listagem/download.
- `PATH_TRAVERSAL`: ajustar `PJE_DOWNLOAD_DIR` ou usar destino relativo dentro da raiz autorizada.

## Referência: Workflows

`references/workflows.md` deve conter fluxos prontos:

- Instalação por clone local.
- Instalação por GitHub/npx.
- Migração de configuração global para `.codex/config.toml` do projeto.
- Teste inicial com `/mcp` e `status_autenticacao`.
- Diagnóstico de startup.
- Preparação para inspeção autenticada do PJe.

## Exemplos de Prompts Suportados

```text
Configure o MCP pje-trf1 neste projeto usando PJE_DOWNLOAD_DIR = "Sandbox".
```

```text
Use o MCP pje-trf1 para verificar o status da autenticação.
```

```text
O pje-trf1 retornou PATH_TRAVERSAL. Ajuste a configuração.
```

```text
O MCP retornou PJE_INTERFACE_CHANGED ao listar documentos. Explique o próximo passo técnico.
```

## Critérios de Aceitação

- A skill explica quando usar configuração global e quando usar configuração por projeto.
- A skill evita recomendações que exponham credenciais ou contornem controles do PJe.
- A skill orienta o uso de linguagem natural para tools MCP.
- A skill diferencia erro de autenticação, erro de diretório e falta de mapeamento da interface.
- A skill recomenda validação com `codex mcp list`, `/mcp`, `npm test`, `npm run build` e `npm run lint` quando houver alteração no repositório.

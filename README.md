# mcp-pje-trf1

Servidor MCP local, em TypeScript, para automação legítima do PJe do TRF1 por usuários autenticados. O servidor usa Node.js, `@modelcontextprotocol/sdk`, Playwright, Chromium e transporte MCP via `stdio`.

Esta primeira versão implementa a infraestrutura segura de sessão, filesystem, MCP, logging, validação CNJ, manifesto de downloads e testes. A navegação interna autenticada de processos e documentos está isolada atrás de erro estruturado até que a interface autenticada do PJe seja inspecionada com uma sessão real. Isso evita inventar seletores, endpoints ou comportamento da aplicação.

## Arquitetura

```text
src/
├── server.ts
├── config.ts
├── types.ts
├── cli/auth.ts
├── pje/
│   ├── client.ts
│   ├── auth.ts
│   ├── urls.ts
│   ├── process.ts
│   ├── documents.ts
│   ├── downloads.ts
│   └── selectors.ts
├── utils/
│   ├── cnj.ts
│   ├── filesystem.ts
│   ├── logger.ts
│   └── errors.ts
└── tools/
    ├── consultar-processo.ts
    ├── listar-documentos.ts
    ├── baixar-documento.ts
    ├── baixar-inteiro-teor.ts
    └── status-autenticacao.ts
```

## Requisitos

- Node.js 22 ou superior.
- Chromium instalado pelo Playwright.
- Conta PJe TRF1 com acesso legítimo aos processos consultados.

## Instalação

### Clone local

```bash
git clone https://github.com/cmsdutra/trf1-pje-mcp-bridge.git
cd trf1-pje-mcp-bridge
npm install
npx playwright install chromium
npm run build
```

Também há scripts para instalar as dependências e compilar:

```powershell
.\scripts\install-deps.ps1
```

```bash
sh scripts/install-deps.sh
```

Para instalar dependências sem compilar:

```powershell
.\scripts\install-deps.ps1 -SkipBuild
```

```bash
sh scripts/install-deps.sh --skip-build
```

### Direto do GitHub

Para registrar o servidor sem manter um clone manual, use `npx` com o repositório GitHub. O pacote executa `npm run build` durante a instalação via script `prepare`.

```bash
codex mcp add pje-trf1 -- npx -y github:cmsdutra/trf1-pje-mcp-bridge
```

O Chromium do Playwright precisa existir na máquina de destino. Instale uma vez:

```bash
npx -y playwright install chromium
```

## Configuração

Copie `.env.example` para `.env` se quiser sobrescrever padrões:

```text
PJE_DOWNLOAD_DIR=
PJE_STORAGE_STATE_PATH=
PJE_HEADLESS=true
LOG_LEVEL=info
```

Sem sobrescrita, o MCP usa diretórios persistentes do usuário:

- Windows: `%APPDATA%\mcp-pje-trf1\downloads` e `%APPDATA%\mcp-pje-trf1\storage-state.json`.
- Linux/macOS: `~/.mcp-pje-trf1/downloads` e `~/.mcp-pje-trf1/storage-state.json`.

O diretório de downloads é a raiz autorizada para gravações. Caminhos que escapem dessa raiz são bloqueados.

## Autenticação

```bash
npm run auth
```

O comando abre Chromium visível, navega até o PJe e aguarda o login manual. Ele não preenche senha, não automatiza certificado digital, não contorna MFA, não resolve CAPTCHA e não salva credenciais. Após confirmação, salva apenas o `storageState` do Playwright no caminho configurado.

Para autenticar diretamente no segundo grau:

```bash
npm run auth -- 2
```

Em instalação direta via GitHub/npx:

```bash
npx -y -p github:cmsdutra/trf1-pje-mcp-bridge mcp-pje-trf1-auth
npx -y -p github:cmsdutra/trf1-pje-mcp-bridge mcp-pje-trf1-auth 2
```

## Mapeamento da interface autenticada

`consultar_processo`, `listar_documentos` e `baixar_inteiro_teor`/`baixar_documento` dependem de seletores da área
autenticada do PJe que ainda não foram mapeados (ver `PJE_INTERFACE_CHANGED` em Troubleshooting). Como esse
mapeamento exige login humano real com um processo de verdade, use a ferramenta de inspeção após autenticar:

```bash
npm run inspect -- 0000000-00.0000.4.01.0000
npm run inspect -- 0000000-00.0000.4.01.0000 2
```

Em instalação direta via GitHub/npx:

```bash
npx -y -p github:cmsdutra/trf1-pje-mcp-bridge mcp-pje-trf1-inspect 0000000-00.0000.4.01.0000
```

O comando abre Chromium visível com a sessão salva, pausa em três pontos (consulta do processo, listagem de
documentos e abertura/download de um documento) aguardando você navegar manualmente, e grava HTML, screenshots e
metadados de rede em `<PJE_STORAGE_STATE_PATH.../>inspection/<timestamp>/` (fora do repositório por padrão).

**Atenção**: os arquivos capturados contêm dados reais do processo consultado (partes, documentos). Use apenas
processos aos quais sua conta PJe tenha acesso legítimo, e não commite nem compartilhe os arquivos gerados sem
necessidade.

## Execução

```bash
npm start
```

O servidor MCP usa `stdio`.

## Tools MCP

- `status_autenticacao`: informa se há sessão salva, se parece válida, grau verificado e se precisa de nova autenticação.
- `autenticar`: abre Chromium visível para autenticação manual. Para uso operacional, prefira `npm run auth`.
- `consultar_processo`: valida número CNJ, verifica sessão autenticada e consulta metadados disponíveis. A navegação autenticada depende de inspeção final da interface.
- `listar_documentos`: valida número CNJ, verifica sessão autenticada e lista documentos acessíveis. A árvore/lista autenticada depende de inspeção final da interface.
- `baixar_documento`: valida entrada, protege diretório de destino e baixa documento acessível. A etapa de acionamento do download depende de inspeção final da interface.
- `baixar_inteiro_teor`: cria diretório exclusivo, lista documentos, tenta baixar cada item sem abortar o lote e gera `manifest.json`. Depende das rotinas autenticadas acima.

## Downloads

Estrutura prevista:

```text
downloads/
└── 0000000-00.0000.4.01.0000/
    ├── manifest.json
    ├── 001_peticao_inicial.pdf
    ├── 002_documento.pdf
    └── 003_decisao.pdf
```

O `manifest.json` contém número do processo, grau, data/hora da coleta, URL de origem, metadados do processo, totais e status individual de cada documento.

## Segurança

Este MCP reproduz somente operações que o usuário autenticado poderia executar pela interface do PJe. Ele não implementa bypass de autenticação, CAPTCHA, MFA, certificado digital, segredo de justiça ou controle de acesso. Cookies, tokens, headers de autenticação, credenciais e `storageState` nunca são retornados por tools MCP nem registrados em logs.

Logs estruturados vão para `stderr` nos níveis `error`, `warn`, `info` e `debug`.

## Codex CLI

A sintaxe verificada localmente em 07/08/2026 é:

Para instalação direta do GitHub:

```bash
codex mcp add pje-trf1 -- npx -y -p github:cmsdutra/trf1-pje-mcp-bridge mcp-pje-trf1
```

Para clone local com caminho absoluto:

```bash
codex mcp add pje-trf1 -- node "C:\Users\to48109\Documents\500 - Drive\100 - Projetos\trf1-pje-mcp-bridge\dist\server.js"
```

Configuração TOML equivalente para clone local:

```toml
[mcp_servers.pje-trf1]
command = "node"
args = ["C:\\Users\\to48109\\Documents\\500 - Drive\\100 - Projetos\\trf1-pje-mcp-bridge\\dist\\server.js"]
startup_timeout_sec = 120.0

[mcp_servers.pje-trf1.env]
LOG_LEVEL = "error"
```

Configuração TOML equivalente para GitHub/npx:

```toml
[mcp_servers.pje-trf1]
command = "npx"
args = ["-y", "-p", "github:cmsdutra/trf1-pje-mcp-bridge", "mcp-pje-trf1"]
startup_timeout_sec = 120.0

[mcp_servers.pje-trf1.env]
LOG_LEVEL = "error"
```

Após alterar `~/.codex/config.toml`, reinicie completamente o cliente Codex ou ChatGPT Desktop e use `/mcp` para confirmar que `pje-trf1` foi inicializado.

### Configuração por projeto

Para restringir o MCP a um projeto específico, crie `.codex/config.toml` dentro desse projeto em vez de usar a configuração global. Exemplo com caminho relativo para um clone local do servidor:

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

Com `cwd = "."`, valores relativos como `PJE_DOWNLOAD_DIR = "Sandbox"` são resolvidos a partir da raiz do projeto que contém `.codex/config.toml`. Isso evita `PATH_TRAVERSAL` ao baixar para uma pasta de trabalho local. Se usar configuração por projeto, remova a seção global `[mcp_servers.pje-trf1]` de `~/.codex/config.toml` para evitar duplicidade.

## Práticas Iniciais Recomendadas

Comece verificando se o servidor está ativo no cliente:

```text
/mcp
```

Em seguida, teste a sessão autenticada em linguagem natural:

```text
Use o MCP pje-trf1 para verificar o status da autenticação.
```

Se a sessão estiver ausente ou expirada, autentique novamente:

```bash
npx -y -p github:cmsdutra/trf1-pje-mcp-bridge mcp-pje-trf1-auth
```

Depois do status válido, faça testes graduais antes de baixar documentos:

```text
Use o MCP pje-trf1 para consultar o processo 0000000-00.0000.4.01.0000 no 1º grau.
Use o MCP pje-trf1 para listar os documentos do processo 0000000-00.0000.4.01.0000 no 1º grau.
Use o MCP pje-trf1 para baixar o inteiro teor do processo 0000000-00.0000.4.01.0000 no 1º grau.
```

Use apenas processos aos quais sua conta PJe tenha acesso legítimo.

## Desenvolvimento

```bash
npm test
npm run build
npm run lint
```

## Inspeção realizada

Inspeção pública com Playwright em 07/08/2026:

- `https://pje1g.trf1.jus.br/pje/login.seam` redireciona para SSO `sso.cloud.pje.jus.br`, client ID `pje-trf1-1g`.
- `https://pje2g.trf1.jus.br/pje/login.seam` redireciona para SSO `sso.cloud.pje.jus.br`, client ID `pje-trf1-2g`.
- Login público expõe campos `#username`, `#password`, botão `#kc-login` e botão de certificado `#kc-pje-office`.
- Consulta pública redireciona para `pje1g-consultapublica.trf1.jus.br` e `pje2g-consultapublica.trf1.jus.br`.
- Consulta pública usa campo `#fPP\:numProcesso-inputNumeroProcessoDecoration\:numProcesso-inputNumeroProcesso` e botão `#fPP\:searchProcessos`.

A inspeção autenticada de iframes internos, timeline/árvore de documentos, viewer PDF e downloads ainda não foi executada porque requer login humano real. A ferramenta `npm run inspect` (ver "Mapeamento da interface autenticada") automatiza a captura de HTML/screenshots/eventos de rede durante essa navegação manual; falta apenas rodá-la contra um processo real e usar os artefatos capturados para implementar os seletores em `src/pje/selectors.ts`, `src/pje/process.ts`, `src/pje/documents.ts` e `src/pje/downloads.ts`.

## Troubleshooting

- `SESSION_MISSING`: autentique com `npm run auth` no clone local ou `npx -y -p github:cmsdutra/trf1-pje-mcp-bridge mcp-pje-trf1-auth` na instalação via GitHub/npx.
- `SESSION_EXPIRED`: repita a autenticação manual com o mesmo comando usado inicialmente.
- `PJE_INTERFACE_CHANGED`: a área autenticada ainda precisa ser mapeada (ou a interface do PJe mudou desde o último mapeamento). Rode `npm run inspect -- <numero-processo>` (ver "Mapeamento da interface autenticada") e, na sequência, implemente os seletores capturados.
- Erro de Chromium: execute `npx playwright install chromium`.
- Downloads fora da raiz configurada são recusados por proteção contra path traversal.

## Perguntas Frequentes

### O servidor MCP precisa ser iniciado manualmente?

Não no uso normal. O Codex inicia o processo configurado em `~/.codex/config.toml` quando abre uma sessão. Inicie manualmente apenas para diagnóstico.

### O que fazer se aparecer `MCP startup interrupted`?

Prefira a configuração com binário explícito, aumente `startup_timeout_sec` e defina `LOG_LEVEL = "error"`. Em Windows, se `npx` falhar no app mas funcionar no PowerShell, use clone local com caminho absoluto para `node.exe` e `dist/server.js`.

### Como vejo as tools disponíveis?

No Codex, use `/mcp`. Se `pje-trf1` estiver ativo, peça as ações em linguagem natural, por exemplo: "Use o MCP pje-trf1 para verificar o status da autenticação."

### Onde ficam sessão e downloads por padrão?

No Windows, em `%APPDATA%\mcp-pje-trf1\storage-state.json` e `%APPDATA%\mcp-pje-trf1\downloads`. Em Linux/macOS, em `~/.mcp-pje-trf1/`.

### Como configuro downloads em uma pasta do projeto?

Use uma variável relativa no `.codex/config.toml` do projeto:

```toml
[mcp_servers.pje-trf1.env]
PJE_DOWNLOAD_DIR = "Sandbox"
```

Crie a pasta `Sandbox/` ou deixe o MCP criá-la quando fizer o primeiro download. Não passe caminhos absolutos como argumento da tool se eles estiverem fora da raiz configurada.

### Posso usar `.env` com instalação via GitHub?

Sim, mas variáveis declaradas no `config.toml` do Codex são mais previsíveis para servidores MCP iniciados pelo cliente. Use `PJE_DOWNLOAD_DIR`, `PJE_STORAGE_STATE_PATH`, `PJE_HEADLESS` e `LOG_LEVEL` em `[mcp_servers.pje-trf1.env]`.

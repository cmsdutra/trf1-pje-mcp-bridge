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
codex mcp add pje-trf1 -- npx -y github:cmsdutra/trf1-pje-mcp-bridge
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
```

Configuração TOML equivalente para GitHub/npx:

```toml
[mcp_servers.pje-trf1]
command = "npx"
args = ["-y", "github:cmsdutra/trf1-pje-mcp-bridge"]
```

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

A inspeção autenticada de iframes internos, timeline/árvore de documentos, viewer PDF e downloads ainda não foi executada porque requer login humano real.

## Troubleshooting

- `SESSION_MISSING`: execute `npm run auth`.
- `SESSION_EXPIRED`: execute `npm run auth` novamente.
- `PJE_INTERFACE_CHANGED`: a área autenticada ainda precisa ser mapeada ou a interface mudou.
- Erro de Chromium: execute `npx playwright install chromium`.
- Downloads fora da raiz configurada são recusados por proteção contra path traversal.

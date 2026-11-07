# mcp-pje-trf1

Servidor MCP local, em TypeScript, para automação de consulta e download de documentos do PJe do TRF1 por usuários autenticados. O servidor usa Node.js, `@modelcontextprotocol/sdk`, Playwright, Chromium e transporte MCP via `stdio`.

O servidor implementa a infraestrutura segura de sessão, filesystem, MCP, logging, validação CNJ, manifesto de downloads e testes, além da navegação autenticada real de processos e documentos (consulta de metadados, listagem da timeline dos autos digitais e download de documentos).

## Arquitetura

```text
src/
├── server.ts
├── config.ts
├── types.ts
├── cli/
│   ├── auth.ts
│   └── inspect.ts
├── pje/
│   ├── client.ts
│   ├── auth.ts
│   ├── urls.ts
│   ├── autos.ts          # navegação + extração do DOM dos autos digitais (Playwright)
│   ├── autos-parse.ts    # parsing puro dos dados extraídos (sem Playwright, testável)
│   ├── process.ts
│   ├── documents.ts
│   ├── downloads.ts
│   ├── inspect.ts
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
PJE_CHROMIUM_SANDBOX=true
LOG_LEVEL=info
```

O `.env` é lido **somente da raiz do pacote** (nunca do diretório atual) e apenas essas chaves são aceitas; variáveis do ambiente do processo (por exemplo, o bloco `env` do cliente MCP) têm precedência. O sandbox do Chromium fica ligado; use `PJE_CHROMIUM_SANDBOX=false` apenas em containers que o exijam.

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

## Interface autenticada mapeada

`consultar_processo`, `listar_documentos` e `baixar_inteiro_teor`/`baixar_documento` operam sobre a tela de **autos
digitais** (`Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam`), uma página JSF/RichFaces server-rendered.
Ela é uma superfície distinta do painel do usuário interno — este último é uma SPA Angular servida num iframe
cross-origin e não é usada por nenhuma das tools.

O fluxo implementado (`src/pje/autos.ts`) é:

1. `GET <baseUrl>/seam/resource/rest/pje-legacy/processo/<numeroCnj>/enderecoAutos` devolve, em texto puro, a URL
   dos autos digitais já com o `idProcesso` interno e o token de navegação `ca`. É o mesmo endpoint que a caixa
   "Acesso rápido" do menu lateral do PJe chama ao pressionar Enter, então basta o cookie de sessão — não é
   preciso reproduzir o popup de busca rápida.
2. Navegação para essa URL e leitura do cabeçalho (`#maisDetalhes`, `#poloAtivo`, `#poloPassivo`) e da timeline
   (`#divTimeLine`). A timeline usa rolagem infinita: as páginas restantes são carregadas via `novaPagina()` até
   `#paginaAtual` alcançar `#totalPaginas`.
3. Download por HTTP direto em `<baseUrl>/seam/resource/rest/pje-legacy/documento/download/<idProcessoDocumento>`
   (a mesma URL que o visualizador do PJe usa como `src` do iframe), com fallback para a variante
   `.../download/<TRIBUNAL>/<grau>g/<idProcesso>/<id>` usada pelo botão "abrir em outra aba".

### Armadilhas confirmadas contra o PJe real

Todas custaram uma rodada de depuração; estão codificadas na implementação e não devem ser "simplificadas":

- **O número tem de ir com máscara** (`0000000-00.0000.0.00.0000`) no `enderecoAutos`. A forma só-dígitos, embora
  aceita pelo regex do JavaScript da própria tela do PJe, faz o endpoint responder `204 No Content`.
- **`204 No Content` é o "não encontrei"** desse endpoint (não 404). Ele também aparece de forma transitória, daí
  a retentativa única antes de concluir `PROCESS_NOT_FOUND`.
- **A URL precisa terminar com `&aba=`.** O endpoint devolve sem esse parâmetro, mas o navegador real sempre acaba
  com ele; navegar sem `aba=` joga o Seam em `error.seam` de forma intermitente.
- **A abertura dos autos falha esporadicamente mesmo assim** (`error.seam?cid=...`), por instabilidade do Seam.
  `abrirAutosDigitais` tenta duas vezes, resolvendo um `ca` novo — observado corrigindo a falha em execução real.
- **`listAutosDigitais.seam` abre uma conversação do Seam**: não navegue para ela duas vezes na mesma aba. Por
  isso `baixarInteiroTeor` abre os autos uma única vez e tira cabeçalho e timeline da mesma página.
- **O desempenho do PJe oscila muito.** O mesmo lote de 14 documentos levou 12s numa execução e mais de 160s em
  outra, com um PDF de ~1 MB estourando o timeout. Downloads são retentados até 3 vezes em erro de rede ou 5xx.

Notas de implementação relevantes para quem for mexer nisso:

- Documentos redigidos no editor do PJe são devolvidos como **HTML**; só os anexos costumam ser PDF. A extensão do
  arquivo gravado vem do `content-type` da resposta, não de uma suposição. (No processo usado como teste: 6 peças
  em `text/html`, 8 anexos em `application/pdf`.)
- IDs gerados pelo JSF (`j_id...`) mudam a cada build da aplicação e **não** são usados como seletores.
- Não existe mais uma flag `authenticatedSelectors.inspected`. O sinal de "a interface mudou" é a ausência, em
  tempo de execução, dos elementos esperados — o que também cobre mudanças futuras do PJe.
- O token `ca` é removido da URL antes de ela ir para `ProcessoMetadata.url`/`manifest.json`, para não vazar
  credencial de sessão em arquivo exportado.
- Uma falha ao paginar a timeline aborta com `PJE_INTERFACE_CHANGED` em vez de devolver lista parcial: uma
  listagem incompleta de documentos de um processo judicial é pior do que um erro explícito.

### Reinspecionar após mudança do PJe

Se a interface mudar, recapture os artefatos com sessão real e reveja `src/pje/selectors.ts`:

```bash
npm run inspect -- 0000000-00.0000.4.01.0000
npm run inspect -- 0000000-00.0000.4.01.0000 2
```

Em instalação direta via GitHub/npx:

```bash
npx -y -p github:cmsdutra/trf1-pje-mcp-bridge mcp-pje-trf1-inspect 0000000-00.0000.4.01.0000
```

O comando abre Chromium visível com a sessão salva, pausa em dois pontos (abertura do processo — que no PJe já
mostra os autos digitais/lista de documentos — e abertura/download de um documento) aguardando você navegar
manualmente, e grava HTML, screenshots e metadados de rede em `<PJE_STORAGE_STATE_PATH.../>inspection/<timestamp>/`
(fora do repositório por padrão).

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
- `consultar_processo`: valida número CNJ, abre os autos digitais e devolve classe, assunto, órgão julgador, partes e representantes, data de distribuição, `idProcesso` interno e os demais detalhes do cabeçalho.
- `listar_documentos`: valida número CNJ, carrega a timeline completa dos autos digitais e devolve os documentos em ordem cronológica (movimentos sem documento anexado são descartados; anexos vêm junto do documento principal).
- `baixar_documento`: valida entrada, protege o diretório de destino e baixa um documento pelo `documento_id` (o `idProcessoDocumento` devolvido por `listar_documentos`).
- `baixar_inteiro_teor`: cria diretório exclusivo, lista documentos, baixa cada item sem abortar o lote e gera `manifest.json`. Usa **uma única sessão de navegador** para todo o processo.

## Downloads

Estrutura gerada por `baixar_inteiro_teor`:

```text
downloads/
└── 0000000-00.0000.4.01.0000/
    ├── manifest.json
    ├── 001_peticao_inicial.html
    ├── 002_procuracao_(2_procuracao).pdf
    ├── 003_documento_de_identificacao_(6_rg).pdf
    └── 004_decisao.html
```

O prefixo numérico é a ordem cronológica do documento nos autos. A extensão vem do `content-type` da
resposta — peças escritas no editor do PJe são `.html` e anexos costumam ser `.pdf` (ver "Interface
autenticada mapeada").

O `manifest.json` contém número do processo, grau, data/hora da coleta, URL de origem, metadados do processo,
totais e status individual de cada documento (incluindo `contentType` e `bytes` do que foi gravado). Nada é
sobrescrito: numa segunda coleta do mesmo processo, o manifesto anterior é preservado e o novo vira
`manifest-1.json`, e arquivos com nome repetido ganham sufixo `-1`, `-2`, ...

## Segurança

A autenticação é feita apenas pelo CLI (`npm run auth`); ela não é exposta como tool MCP porque depende do terminal interativo e o `stdin` do servidor é o canal do protocolo. `documento_id` precisa ser numérico, e gravações de download usam criação exclusiva (`wx`) e checagem de `realpath`, de modo que symlinks não conseguem desviar arquivos para fora do diretório autorizado.

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

Inspeção autenticada com sessão real em 07/08/2026 (grau 1), origem dos seletores e endpoints hoje implementados:

- A área autenticada tem duas superfícies distintas: o painel do usuário interno (SPA Angular em iframe
  cross-origin, com shadow DOM) e os autos digitais (`listAutosDigitais.seam`, JSF server-rendered). Só a segunda é
  usada pelas tools.
- Nenhuma chamada JSON de API sustenta a tela de autos digitais — a estratégia correta é raspagem do HTML
  server-rendered, complementada pelos dois endpoints REST legados (`.../processo/<cnj>/enderecoAutos` e
  `.../documento/download/<id>`).
- Detalhes de fluxo, seletores e decisões estão em "Interface autenticada mapeada" e em `src/pje/selectors.ts`.

### Validação fim a fim

Em 07/08/2026 as três tools foram executadas contra um processo real do 1º grau, com sessão legítima:

- `consultar_processo`: cabeçalho, 15 campos de detalhe e 7 partes/representantes dos dois polos.
- `listar_documentos`: 14 documentos (6 principais + 8 anexos) em ordem cronológica correta, apesar de a
  timeline vir em ordem decrescente no DOM.
- `baixar_inteiro_teor`: 14/14 baixados, 0 erros, em ~12s. Arquivos íntegros no disco (PDFs com assinatura
  `%PDF-`), `manifest.json` completo e sem vazar o token `ca` nem o `JSESSIONID`.

As retentativas descritas em "Armadilhas confirmadas" não são teóricas: a de `error.seam` e a de download por
falha de rede foram observadas salvando execuções reais.

## Troubleshooting

- `SESSION_MISSING`: autentique com `npm run auth` no clone local ou `npx -y -p github:cmsdutra/trf1-pje-mcp-bridge mcp-pje-trf1-auth` na instalação via GitHub/npx.
- `SESSION_EXPIRED`: repita a autenticação manual com o mesmo comando usado inicialmente.
- `PJE_INTERFACE_CHANGED`: os elementos esperados não foram encontrados na página — a interface do PJe mudou desde o último mapeamento. Rode `npm run inspect -- <numero-processo>` (ver "Reinspecionar após mudança do PJe") e atualize `src/pje/selectors.ts`/`src/pje/autos.ts` com os artefatos capturados.
- `PROCESS_NOT_FOUND` / `PROCESS_NOT_ACCESSIBLE`: o processo não existe naquele grau ou a conta autenticada não tem acesso a ele. Confira o número e o grau.
- `DOCUMENT_NOT_FOUND` / `DOCUMENT_NOT_ACCESSIBLE`: o `documento_id` não existe ou está fora do alcance da sessão. Use um `documento_id` vindo de `listar_documentos`.
- `DOWNLOAD_FAILED` / `TIMEOUT`: o PJe não respondeu a tempo mesmo após as retentativas automáticas. Costuma ser lentidão momentânea do PJe — repita a chamada. Em `baixar_inteiro_teor` o lote não é abortado: o documento que falhou fica com `status: "erro"` no `manifest.json` e os demais são baixados normalmente.
- `INVALID_INPUT`: número CNJ malformado/dígito verificador inválido, ou `documento_id` vazio.
- "O PJe redirecionou a abertura dos autos para uma página de erro": instabilidade do Seam, não mudança de interface. Tente novamente em alguns instantes.
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

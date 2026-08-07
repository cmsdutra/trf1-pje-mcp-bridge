export const inspectedPublicSelectors = {
  login: {
    usernameInput: "#username",
    passwordInput: "#password",
    submitInput: "#kc-login",
    certificateButton: "#kc-pje-office",
    consultaProcessualLinkText: "Consulta Processual",
    customLoginInfoFrame: "iframe#customLoginInfo",
  },
  publicSearch: {
    numeroProcessoInput: "#fPP\\:numProcesso-inputNumeroProcessoDecoration\\:numProcesso-inputNumeroProcesso",
    pesquisarButton: "#fPP\\:searchProcessos",
  },
} as const;

/**
 * Seletores da área autenticada, mapeados a partir da inspeção real de
 * `Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam` (PJe 1º grau TRF1).
 *
 * A página é JSF/RichFaces server-rendered (sem Angular e sem shadow DOM), então os seletores
 * abaixo são estáveis o suficiente para raspagem. IDs gerados pelo JSF (`j_id...`) mudam a cada
 * build da aplicação e por isso NUNCA são usados aqui — só ids fixos declarados no XHTML
 * (`divTimeLine`, `maisDetalhes`, ...) e classes semânticas do tema do PJe.
 *
 * Não existe mais uma flag `inspected`: a ausência dos elementos esperados em tempo de execução
 * é o que sinaliza `PJE_INTERFACE_CHANGED` (ver `src/pje/autos.ts`).
 */
export const authenticatedSelectors = {
  autosDigitais: {
    /** Presença deste form é o sinal de que os autos digitais carregaram. */
    timelineForm: "#divTimeLine",
    /** Container dos eventos; filhos diretos alternam entre separadores de data e eventos. */
    timelineEvents: "#divTimeLine\\:eventosTimeLineElement",
    /** Separador de data da timeline (`31 jul. 2026`). */
    timelineDateRow: ".media.data",
    /** Evento da timeline: `tipo-D` (com documento) ou `tipo-M` (só movimento). */
    timelineEventRow: ".media.interno",
    /** Bloco com o(s) link(s) de documento dentro de um evento. */
    timelineAnexos: ".anexos",
    /** Sublista de documentos anexados ao documento principal do evento. */
    timelineAnexosFilhos: "ul.tree > li",
    /** Hora do evento. */
    timelineHora: "small.text-muted.pull-right",
    /** Origem do evento (Interno / Polo ativo / sistema), via `alt`/`title`. */
    timelineOrigem: ".media-left .icon-auto",
    /** Painel "Mais detalhes" do cabeçalho: pares `<dt>`/`<dd>`. */
    detalhesPanel: "#maisDetalhes",
    /** Título do processo no topo (`ProceComCiv <numero>`). */
    tituloProcesso: ".mais-detalhes .titulo-topo-desktop",
    poloAtivoPanel: "#poloAtivo",
    poloPassivoPanel: "#poloPassivo",
    /** Cada parte é uma linha da tabela do painel de polo. */
    partesRow: "table tbody tr",
    /** Representantes/procuradorias da parte. */
    partesRepresentantes: "ul.tree li",
  },
  paginacao: {
    /** Inputs escondidos que controlam a rolagem infinita da timeline. */
    totalPaginasInput: "#totalPaginas",
    paginaAtualInput: "#paginaAtual",
    /** Função global declarada na página que carrega a próxima página da timeline. */
    novaPaginaFn: "novaPagina",
  },
  /**
   * Endpoint REST que devolve, em texto puro, a URL dos autos digitais de um processo
   * (com o `idProcesso` interno e o token `ca` de navegação já embutidos). É exatamente o que a
   * caixa "Acesso rápido" do menu lateral chama ao pressionar Enter.
   */
  enderecoAutosPathTemplate: "/seam/resource/rest/pje-legacy/processo/{numeroCnj}/enderecoAutos",
  /**
   * Endpoint REST de download/visualização de um documento. É a `src` do `<iframe id="frameHtml">`
   * do visualizador e depende apenas do cookie de sessão — sem token na URL.
   */
  documentDownloadPathTemplate: "/seam/resource/rest/pje-legacy/documento/download/{id}",
  /**
   * Variante usada pelo botão "abrir em outra aba" da timeline. Serve de fallback quando a forma
   * curta acima falha; exige o código do tribunal, o grau e o `idProcesso` interno.
   */
  documentDownloadPathTemplateLongo: "/seam/resource/rest/pje-legacy/documento/download/{tribunal}/{grau}g/{idProcesso}/{id}",
} as const;

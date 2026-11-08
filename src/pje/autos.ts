import type { APIResponse, Page } from "playwright";
import { PjeError } from "../utils/errors.js";
import { log } from "../utils/logger.js";
import { lerPerfilAtivo, type PjeSession } from "./client.js";
import { authenticatedSelectors } from "./selectors.js";
import { getPjeEnvironment, type Grau } from "./urls.js";
import { ehAlertaProcessoNaoEncontrado, type RawCabecalho, type RawTimelineEvento } from "./autos-parse.js";

/** Trava de segurança do laço de rolagem infinita da timeline. */
const MAX_PAGINAS_TIMELINE = 500;

/** Autos digitais abertos e prontos para leitura. */
export interface AutosDigitaisAbertos {
  page: Page;
  /** `idProcesso` interno do PJe (numérico), diferente do número CNJ. */
  idProcesso?: string;
  /** URL da página, já sem o token de navegação `ca`. */
  url: string;
}

/**
 * Remove o parâmetro `ca` da URL dos autos. Ele é um token de navegação de curta duração ligado à
 * sessão; guardá-lo em manifesto/metadados exportados vazaria credencial sem nenhum ganho.
 */
function limparUrlAutos(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("ca");
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Verifica se `candidata` está sob a mesma base do PJe que `base`, ignorando porta explícita
 * (`https://host:443/pje` e `https://host/pje` são a mesma coisa).
 */
export function mesmaBase(candidata: string, base: string): boolean {
  try {
    const a = new URL(candidata);
    const b = new URL(base);
    if (a.protocol !== b.protocol || a.hostname !== b.hostname) return false;
    const porta = (u: URL): string => u.port || (u.protocol === "https:" ? "443" : "80");
    if (porta(a) !== porta(b)) return false;
    const raiz = b.pathname.replace(/\/+$/, "");
    return a.pathname === raiz || a.pathname.startsWith(`${raiz}/`);
  } catch {
    return false;
  }
}

/**
 * Resolve a URL dos autos digitais via o endpoint REST que a própria caixa "Acesso rápido" do PJe
 * usa: `GET .../processo/<numeroCnj>/enderecoAutos` devolve, em texto puro, a URL completa de
 * `listAutosDigitais.seam` já com `idProcesso` e o token `ca`.
 *
 * Preferimos esse caminho ao clique na UI porque o popup de busca rápida depende de um token `ca`
 * embutido no HTML da página do painel e de um `window.open`, enquanto aqui basta o cookie de
 * sessão — que `context.request` herda do `BrowserContext`.
 */
async function resolverEnderecoAutos(session: PjeSession, numeroCnj: string, grau: Grau): Promise<string> {
  const env = getPjeEnvironment(grau);
  // O número precisa ir COM máscara (`0000000-00.0000.0.00.0000`). Confirmado contra o PJe real: a
  // forma só-dígitos, embora aceita pelo regex do JavaScript da tela, faz o endpoint responder
  // `204 No Content`.
  const path = authenticatedSelectors.enderecoAutosPathTemplate.replace("{numeroCnj}", encodeURIComponent(numeroCnj));
  const endpoint = `${env.baseUrl}${path}`;

  const chamar = async (): Promise<APIResponse> =>
    session.context.request.get(endpoint, { timeout: 45_000 }).catch((error: unknown) => {
      throw new PjeError("TIMEOUT", "Falha ao consultar o endereço dos autos digitais no PJe.", {
        grau,
        numeroCnj,
        erro: String(error),
      });
    });

  let response = await chamar();

  // 204 é como o PJe sinaliza "não achei esse processo" — mas também aparece de forma transitória
  // logo depois de uma navegação que deixou o Seam num estado ruim. Uma única retentativa curta
  // custa pouco no caso legítimo de "não existe" e evita falso negativo no caso transitório.
  if (response.status() === 204) {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    response = await chamar();
  }

  if (response.status() === 404 || response.status() === 204) {
    throw new PjeError("PROCESS_NOT_FOUND", `Processo ${numeroCnj} não encontrado no PJe ${grau}º grau.`, { grau, numeroCnj });
  }
  if (response.status() === 401 || response.status() === 403) {
    throw new PjeError("PROCESS_NOT_ACCESSIBLE", `Sem permissão de acesso ao processo ${numeroCnj} com a sessão atual.`, {
      grau,
      numeroCnj,
      status: response.status(),
    });
  }
  if (!response.ok()) {
    throw new PjeError("PJE_INTERFACE_CHANGED", `O PJe respondeu HTTP ${response.status()} ao resolver o endereço dos autos digitais.`, {
      grau,
      numeroCnj,
      status: response.status(),
      endpoint,
    });
  }

  const corpo = (await response.text()).trim();
  if (!corpo) {
    throw new PjeError("PROCESS_NOT_FOUND", `Processo ${numeroCnj} não encontrado ou sem autos digitais acessíveis.`, { grau, numeroCnj });
  }
  // O endpoint devolve texto puro. Se vier HTML, a sessão caiu ou o contrato mudou.
  if (corpo.startsWith("<")) {
    throw new PjeError(
      "PJE_INTERFACE_CHANGED",
      "O endpoint de endereço dos autos devolveu HTML em vez da URL esperada — a sessão pode ter expirado ou a interface do PJe mudou.",
      { grau, numeroCnj, endpoint },
    );
  }
  // Guarda contra ser mandado para fora do PJe. A comparação é por origem/caminho normalizados, e
  // não por prefixo literal: o PJe devolve a porta explícita (`https://host:443/pje/...`), que não
  // casaria com `env.baseUrl`.
  if (!mesmaBase(corpo, env.baseUrl)) {
    throw new PjeError("PJE_INTERFACE_CHANGED", "O PJe devolveu um endereço de autos fora do domínio esperado.", {
      grau,
      numeroCnj,
      esperadoPrefixo: env.baseUrl,
    });
  }
  return corpo;
}

/**
 * Carrega todas as páginas da timeline. A tela usa rolagem infinita controlada pelos inputs
 * escondidos `#totalPaginas`/`#paginaAtual` e pela função global `novaPagina()`.
 *
 * Uma listagem parcial de documentos de um processo judicial é pior do que um erro claro, então
 * qualquer falha em avançar a paginação vira `PJE_INTERFACE_CHANGED` em vez de retorno silencioso.
 */
async function carregarTimelineCompleta(page: Page): Promise<void> {
  const { totalPaginasInput, paginaAtualInput, novaPaginaFn } = authenticatedSelectors.paginacao;
  // `inputValue()` lê a propriedade `value` do elemento, não o atributo: o A4J pode atualizar o
  // contador por JS sem reescrever o atributo, e ler o atributo travaria o laço num valor obsoleto.
  const lerInteiro = async (selector: string): Promise<number> => {
    const valor = await page
      .locator(selector)
      .first()
      .inputValue({ timeout: 5_000 })
      .catch(() => "");
    const numero = Number.parseInt(valor, 10);
    return Number.isFinite(numero) ? numero : 1;
  };

  let total = await lerInteiro(totalPaginasInput);
  let atual = await lerInteiro(paginaAtualInput);
  let restantes = MAX_PAGINAS_TIMELINE;

  while (atual < total) {
    if (restantes-- <= 0) {
      throw new PjeError(
        "PJE_INTERFACE_CHANGED",
        `A paginação da timeline passou de ${MAX_PAGINAS_TIMELINE} páginas sem terminar; abortando para não entrar em laço infinito.`,
        { paginaAtual: atual, totalPaginas: total },
      );
    }
    const alvo = atual + 1;
    await page.evaluate(`${novaPaginaFn}()`).catch((error: unknown) => {
      throw new PjeError("PJE_INTERFACE_CHANGED", "Não foi possível carregar as demais páginas da timeline dos autos digitais.", {
        paginaAtual: atual,
        totalPaginas: total,
        erro: String(error),
      });
    });
    await page
      // Função anônima sem funções internas: o `tsx` não injeta o auxiliar `__name`, que não existe
      // no navegador. Seletor e alvo vão como argumento, não concatenados no código.
      .waitForFunction(
        ({ seletor, minimo }) => {
          const el = document.querySelector<HTMLInputElement>(seletor);
          return el !== null && Number(el.value) >= minimo;
        },
        { seletor: paginaAtualInput, minimo: alvo },
        { timeout: 30_000 },
      )
      .catch(() => {
        throw new PjeError(
          "PJE_INTERFACE_CHANGED",
          `A timeline dos autos digitais parou de paginar na página ${atual} de ${total}; a lista de documentos ficaria incompleta.`,
          { paginaAtual: atual, totalPaginas: total },
        );
      });
    const anterior = atual;
    atual = await lerInteiro(paginaAtualInput);
    total = await lerInteiro(totalPaginasInput);
    if (atual <= anterior) {
      throw new PjeError(
        "PJE_INTERFACE_CHANGED",
        `A timeline dos autos digitais não avançou da página ${anterior} de ${total}; a lista de documentos ficaria incompleta.`,
        { paginaAtual: atual, totalPaginas: total },
      );
    }
  }
}

/**
 * Garante o parâmetro `aba` na URL dos autos.
 *
 * O endpoint `enderecoAutos` devolve a URL sem `aba=`, mas o navegador real sempre acaba em
 * `...&ca=<token>&aba=`. Navegar direto sem `aba=` faz o Seam cair em `error.seam` de forma
 * intermitente; com `aba=` a abertura foi consistente em todas as tentativas contra o PJe real.
 */
function comAba(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("aba")) parsed.searchParams.set("aba", "");
    return parsed.toString();
  } catch {
    return url.includes("aba=") ? url : `${url}&aba=`;
  }
}

/**
 * Abre os autos pelo "Acesso rápido" do 2º grau (ver `authenticatedSelectors.pesquisaRapida`).
 *
 * Devolve a página do popup, já em `listAutosDigitais.seam`. Lança `PROCESS_NOT_FOUND` quando o PJe
 * responde com o alerta "Processo não encontrado" — que, no 2º grau, também é o que se vê quando o
 * perfil ativo da sessão não enxerga o processo (o perfil é estado do servidor, preso à sessão).
 */
async function abrirPorPesquisaRapida(session: PjeSession, numeroCnj: string, grau: Grau): Promise<Page> {
  const env = getPjeEnvironment(grau);
  const { page, context } = session;
  const { painelPath, fn } = authenticatedSelectors.pesquisaRapida;

  await page.goto(`${env.baseUrl}${painelPath}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const disponivel = await page
    .waitForFunction(`typeof ${fn} === "function"`, undefined, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!disponivel) {
    throw new PjeError(
      "PJE_INTERFACE_CHANGED",
      `A função ${fn}() do painel do PJe ${grau}º grau não foi encontrada — a sessão pode ter expirado ou a interface mudou.`,
      { grau, numeroCnj, url: limparUrlAutos(page.url()) },
    );
  }

  // O ouvinte de `page` e o de `dialog` precisam existir ANTES de disparar a pesquisa: o alerta de
  // "não encontrado" sai poucas centenas de ms depois de o popup abrir, e sem ouvinte o Playwright o
  // descarta sem que a gente saiba o que ele dizia.
  let naoEncontrado = false;
  let onPage!: (aberta: Page) => void;
  let timer!: NodeJS.Timeout;
  const popupAberto = new Promise<Page | null>((resolve) => {
    timer = setTimeout(() => resolve(null), 30_000);
    onPage = (aberta) => {
      aberta.on("dialog", (dialog) => {
        if (ehAlertaProcessoNaoEncontrado(dialog.message())) naoEncontrado = true;
        void dialog.dismiss().catch(() => undefined);
      });
      resolve(aberta);
    };
    context.on("page", onPage);
  });

  let popup: Page | null;
  try {
    await page.evaluate(`${fn}(${JSON.stringify(numeroCnj.replace(/\D/g, ""))})`);
    popup = await popupAberto;
  } finally {
    clearTimeout(timer);
    context.off("page", onPage);
  }
  if (!popup) {
    throw new PjeError("PJE_INTERFACE_CHANGED", "A pesquisa rápida do PJe não abriu a janela dos autos no tempo esperado.", { grau, numeroCnj });
  }

  const chegouAosAutos = await popup
    .waitForURL(/listAutosDigitais\.seam/, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!chegouAosAutos) {
    const fechada = popup.isClosed();
    await popup.close().catch(() => undefined);
    if (naoEncontrado) {
      throw new PjeError(
        "PROCESS_NOT_FOUND",
        `Processo ${numeroCnj} não encontrado no PJe ${grau}º grau com o perfil ativo da sessão. Se ele existe, o perfil escolhido na autenticação talvez não o enxergue.`,
        { grau, numeroCnj, perfilAtivo: await lerPerfilAtivo(session, grau) },
      );
    }
    throw new PjeError("PJE_INTERFACE_CHANGED", "A pesquisa rápida não levou aos autos digitais.", { grau, numeroCnj, popupFechada: fechada });
  }
  if (!mesmaBase(popup.url(), env.baseUrl)) {
    await popup.close().catch(() => undefined);
    throw new PjeError("PJE_INTERFACE_CHANGED", "A pesquisa rápida levou a um endereço fora do domínio esperado.", {
      grau,
      numeroCnj,
      esperadoPrefixo: env.baseUrl,
    });
  }
  return popup;
}

/**
 * Abre os autos digitais do processo.
 *
 * Os autos abrem num popup (pesquisa rápida) e é essa a `page` devolvida — quem consome deve usar
 * sempre `AutosDigitaisAbertos.page`, nunca `session.page`. Só no fallback do 1º grau
 * (`enderecoAutos`) a navegação ocorre na `page` da sessão.
 *
 * Substitui o antigo gate booleano `authenticatedSelectors.inspected`: em vez de uma flag que nunca
 * se atualizava, o sinal de "interface mudou" passa a ser a ausência dos elementos esperados.
 *
 * **Chame no máximo uma vez por `page`.** `listAutosDigitais.seam` abre uma conversação do Seam;
 * quem precisa de cabeçalho e timeline deve abrir uma vez e extrair os dois da mesma página — ver
 * `baixarInteiroTeor`.
 */
export async function abrirAutosDigitais(session: PjeSession, numeroCnj: string, grau: Grau): Promise<AutosDigitaisAbertos> {
  let page = session.page;

  // O Seam ocasionalmente joga a primeira navegação em `error.seam`. Uma segunda tentativa, com um
  // `ca` recém-resolvido, foi suficiente em todos os casos observados.
  const MAX_TENTATIVAS = 2;
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    // A pesquisa rápida é o caminho primário nos dois graus: o `enderecoAutos` do 1º grau responde 204
    // de forma intermitente e isso vira um falso "não encontrado". Já o "não encontrado" da pesquisa
    // rápida é o alerta do próprio PJe, então é definitivo e não cai no fallback.
    try {
      page = await abrirPorPesquisaRapida(session, numeroCnj, grau);
    } catch (error) {
      if (grau === "2" || !(error instanceof PjeError) || error.code !== "PJE_INTERFACE_CHANGED") throw error;
      log("warn", "Pesquisa rápida indisponível no 1º grau; usando enderecoAutos", { numeroCnj });
      page = session.page;
      const endereco = comAba(await resolverEnderecoAutos(session, numeroCnj, grau));
      await page.goto(endereco, { waitUntil: "domcontentloaded", timeout: 60_000 });
    }

    const carregou = await page
      .locator(authenticatedSelectors.autosDigitais.timelineForm)
      .first()
      .waitFor({ state: "attached", timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (carregou) break;

    if (tentativa === MAX_TENTATIVAS) {
      throw new PjeError(
        "PJE_INTERFACE_CHANGED",
        page.url().includes("error.seam")
          ? `O PJe redirecionou a abertura dos autos para uma página de erro em ${MAX_TENTATIVAS} tentativas. Costuma ser instabilidade momentânea do PJe — tente de novo em alguns instantes.`
          : "A página de autos digitais abriu, mas a timeline esperada não foi encontrada. A interface do PJe provavelmente mudou; rode `npm run inspect -- <numero-processo>` e reveja `src/pje/selectors.ts`.",
        { grau, numeroCnj, url: limparUrlAutos(page.url()) },
      );
    }
    log("warn", "Abertura dos autos digitais falhou; tentando novamente", {
      grau,
      numeroCnj,
      tentativa,
      url: limparUrlAutos(page.url()),
    });
    // No 2º grau cada tentativa abre um popup novo; o da tentativa que falhou não pode ficar pendurado.
    if (page !== session.page) await page.close().catch(() => undefined);
  }

  let idProcesso: string | undefined;
  try {
    idProcesso = new URL(page.url()).searchParams.get("idProcesso") ?? undefined;
  } catch {
    idProcesso = undefined;
  }

  log("debug", "Autos digitais abertos", { grau, numeroCnj, idProcesso });
  return { page, idProcesso, url: limparUrlAutos(page.url()) };
}

/**
 * Os scripts de extração são passados a `page.evaluate` como STRING, não como função.
 *
 * Motivo (o mesmo documentado em `inspect.ts`): sob `tsx`/esbuild, uma função TS transformada pode
 * ganhar uma chamada auxiliar `__name(...)` no corpo; o Playwright serializa a função com
 * `.toString()` para rodar no navegador, onde esse helper não existe, e a avaliação quebra com
 * `ReferenceError: __name is not defined`. Uma string literal nunca passa por esse transform.
 *
 * Os seletores são interpolados via `JSON.stringify` para manter `selectors.ts` como fonte única.
 */
const S = authenticatedSelectors.autosDigitais;

const EXTRAIR_TIMELINE_SOURCE = `
(function () {
  var container = document.querySelector(${JSON.stringify(S.timelineEvents)});
  if (!container) return null;

  function texto(el) {
    return el ? (el.textContent || '').replace(/\\s+/g, ' ').trim() : '';
  }
  function idDoOnclick(el) {
    if (!el) return '';
    var onclick = el.getAttribute('onclick') || '';
    var m = /\\((?:event,\\s*)?'(\\d+)'\\)/.exec(onclick) || /idProcessoDocumento=(\\d+)/.exec(onclick);
    return m ? m[1] : '';
  }
  // O id aparece em três lugares por linha (rótulo, "copiar número", "abrir em outra aba").
  // Tentamos todos para não depender de um único atributo.
  function idDoItem(escopo, link) {
    var rotulo = texto(link);
    var m = /^(\\d+)\\s*-\\s/.exec(rotulo);
    if (m) return m[1];
    var candidatos = escopo.querySelectorAll('.copiar-clipboard, .abrir-documento-nova-aba, a[onclick*="idProcessoDocumento"]');
    for (var i = 0; i < candidatos.length; i++) {
      var id = idDoOnclick(candidatos[i]);
      if (id) return id;
    }
    return '';
  }
  function icone(escopo) {
    var i = escopo.querySelector('i.fa');
    return i ? i.className : '';
  }

  var eventos = [];
  var dataAtual = '';
  var filhos = container.children;

  for (var f = 0; f < filhos.length; f++) {
    var no = filhos[f];
    if (no.matches(${JSON.stringify(S.timelineDateRow)})) {
      var rotuloData = texto(no);
      if (rotuloData) dataAtual = rotuloData;
      continue;
    }
    if (!no.matches(${JSON.stringify(S.timelineEventRow)})) continue;

    var origemEl = no.querySelector(${JSON.stringify(S.timelineOrigem)});
    var horaEl = no.querySelector(${JSON.stringify(S.timelineHora)});
    var movimentoEl = no.querySelector('.texto-movimento');
    var evento = {
      data: dataAtual || undefined,
      hora: texto(horaEl) || undefined,
      movimento: texto(movimentoEl) || undefined,
      origem: (origemEl && (origemEl.getAttribute('alt') || origemEl.getAttribute('title'))) || undefined,
      documentos: []
    };

    var anexos = no.querySelector(${JSON.stringify(S.timelineAnexos)});
    if (anexos) {
      // O primeiro <a> direto de .anexos é o documento principal; os de ul.tree são seus anexos.
      var principalLink = null;
      for (var c = 0; c < anexos.children.length; c++) {
        if (anexos.children[c].tagName === 'A') { principalLink = anexos.children[c]; break; }
      }
      var idPrincipal = '';
      if (principalLink) {
        idPrincipal = idDoItem(anexos, principalLink);
        if (idPrincipal) {
          evento.documentos.push({ id: idPrincipal, rotulo: texto(principalLink), icone: icone(principalLink) });
        }
      }
      var filhosAnexo = anexos.querySelectorAll(${JSON.stringify(S.timelineAnexosFilhos)});
      for (var k = 0; k < filhosAnexo.length; k++) {
        var li = filhosAnexo[k];
        var linkFilho = li.querySelector('a');
        if (!linkFilho) continue;
        var idFilho = idDoItem(li, linkFilho);
        if (!idFilho) continue;
        evento.documentos.push({
          id: idFilho,
          rotulo: texto(linkFilho),
          icone: icone(linkFilho),
          anexoDe: idPrincipal || undefined
        });
      }
    }

    eventos.push(evento);
  }
  return eventos;
})()
`;

const EXTRAIR_CABECALHO_SOURCE = `
(function () {
  function texto(el) {
    return el ? (el.textContent || '').replace(/\\s+/g, ' ').trim() : '';
  }

  var detalhes = [];
  var painel = document.querySelector(${JSON.stringify(S.detalhesPanel)});
  if (painel) {
    var listas = painel.querySelectorAll('dl');
    for (var l = 0; l < listas.length; l++) {
      var itens = listas[l].children;
      var rotulo = '';
      for (var i = 0; i < itens.length; i++) {
        if (itens[i].tagName === 'DT') {
          rotulo = texto(itens[i]);
        } else if (itens[i].tagName === 'DD' && rotulo) {
          detalhes.push({ rotulo: rotulo, valor: texto(itens[i]) });
        }
      }
    }
  }

  function partesDoPainel(seletor) {
    var raiz = document.querySelector(seletor);
    if (!raiz) return [];
    var linhas = raiz.querySelectorAll(${JSON.stringify(S.partesRow)});
    var out = [];
    for (var r = 0; r < linhas.length; r++) {
      var celula = linhas[r].querySelector('td');
      if (!celula) continue;
      var representantes = [];
      var reps = celula.querySelectorAll(${JSON.stringify(S.partesRepresentantes)});
      for (var p = 0; p < reps.length; p++) {
        var t = texto(reps[p]);
        if (t) representantes.push(t);
      }
      // O nome da parte é o texto da célula menos o dos representantes aninhados.
      var clone = celula.cloneNode(true);
      var arvores = clone.querySelectorAll('ul.tree');
      for (var a = 0; a < arvores.length; a++) arvores[a].remove();
      var principal = texto(clone);
      if (principal || representantes.length) {
        out.push({ texto: principal, representantes: representantes });
      }
    }
    return out;
  }

  var tituloEl = document.querySelector(${JSON.stringify(S.tituloProcesso)});
  return {
    titulo: texto(tituloEl) || undefined,
    detalhes: detalhes,
    poloAtivo: partesDoPainel(${JSON.stringify(S.poloAtivoPanel)}),
    poloPassivo: partesDoPainel(${JSON.stringify(S.poloPassivoPanel)})
  };
})()
`;

/** Carrega todas as páginas da timeline e extrai os eventos. */
export async function extrairTimeline(page: Page): Promise<RawTimelineEvento[]> {
  // A paginação mora aqui, e não em `abrirAutosDigitais`, para que `consultarProcesso` — que só lê
  // o cabeçalho — não pague o custo de rolar a timeline inteira.
  await carregarTimelineCompleta(page);
  const eventos = await page.evaluate<RawTimelineEvento[] | null>(EXTRAIR_TIMELINE_SOURCE);
  if (eventos === null) {
    throw new PjeError(
      "PJE_INTERFACE_CHANGED",
      "Container da timeline dos autos digitais não encontrado. Rode `npm run inspect -- <numero-processo>` e reveja `src/pje/selectors.ts`.",
      { seletor: S.timelineEvents },
    );
  }
  return eventos;
}

export async function extrairCabecalho(page: Page): Promise<RawCabecalho> {
  const cabecalho = await page.evaluate<RawCabecalho>(EXTRAIR_CABECALHO_SOURCE);
  if (!cabecalho.detalhes.length && !cabecalho.poloAtivo.length && !cabecalho.poloPassivo.length) {
    throw new PjeError(
      "PJE_INTERFACE_CHANGED",
      "O cabeçalho do processo não pôde ser lido nos autos digitais. Rode `npm run inspect -- <numero-processo>` e reveja `src/pje/selectors.ts`.",
      { seletor: S.detalhesPanel },
    );
  }
  return cabecalho;
}

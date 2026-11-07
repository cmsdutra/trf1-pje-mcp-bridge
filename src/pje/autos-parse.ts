import type { DocumentoProcesso, Grau, ParteProcesso, ProcessoMetadata } from "../types.js";

/**
 * Camada de parsing pura dos autos digitais.
 *
 * A extração do DOM (em `autos.ts`) devolve apenas registros de texto cru; toda a interpretação
 * mora aqui, sem depender de Playwright. É isso que permite testar o parsing com fixtures
 * sanitizadas, sem navegador e sem dados reais de processo.
 */

/** Um link de documento encontrado dentro de um evento da timeline. */
export interface RawTimelineDocumento {
  /** `idProcessoDocumento`, extraído do rótulo ou dos `onclick` vizinhos. */
  id: string;
  /** Rótulo exibido, no formato `"<id> - <descrição>"`. */
  rotulo: string;
  /** Classe do ícone (`fa-file-pdf-o`, `fa-file-text-o`, ...), quando presente. */
  icone?: string;
  /** `id` do documento principal quando este é um anexo dele. */
  anexoDe?: string;
}

/** Um evento da timeline (documento juntado e/ou movimento processual). */
export interface RawTimelineEvento {
  /** Rótulo do separador de data mais próximo acima (`"31 jul. 2026"`). */
  data?: string;
  /** Hora exibida no rodapé do evento (`"18:06"`). */
  hora?: string;
  /** Texto do movimento processual, quando houver. */
  movimento?: string;
  /** Origem do evento (`"Interno"`, `"Polo ativo"`, ...). */
  origem?: string;
  documentos: RawTimelineDocumento[];
}

/** Cabeçalho do processo, cru. */
export interface RawCabecalho {
  /** Título do topo, ex.: `"ProceComCiv 0000000-00.0000.0.00.0000"`. */
  titulo?: string;
  /** Pares `<dt>`/`<dd>` do painel "Mais detalhes". */
  detalhes: Array<{ rotulo: string; valor: string }>;
  poloAtivo: RawParte[];
  poloPassivo: RawParte[];
}

export interface RawParte {
  /** Linha completa, ex.: `"FULANO DE TAL - CPF: 000.000.000-00 (AUTOR)"`. */
  texto: string;
  /** Representantes/procuradorias, no mesmo formato. */
  representantes: string[];
}

const MESES_PT: Record<string, string> = {
  jan: "01",
  fev: "02",
  mar: "03",
  abr: "04",
  mai: "05",
  jun: "06",
  jul: "07",
  ago: "08",
  set: "09",
  out: "10",
  nov: "11",
  dez: "12",
};

export function normalizarEspacos(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

/**
 * Converte a data exibida pelo PJe (`"31 jul. 2026"`) para `YYYY-MM-DD`.
 * Retorna `undefined` quando o rótulo não casa com o formato esperado — datas são usadas para
 * ordenar documentos, então é melhor não ter data do que ter uma data inventada.
 */
export function parsePjeDate(rotulo: string | undefined): string | undefined {
  if (!rotulo) return undefined;
  const match = /^(\d{1,2})\s+([a-zç]{3})\.?\s+(\d{4})$/i.exec(normalizarEspacos(rotulo));
  if (!match) return undefined;
  const mes = MESES_PT[match[2].toLowerCase()];
  if (!mes) return undefined;
  return `${match[3]}-${mes}-${match[1].padStart(2, "0")}`;
}

/** Junta data (`YYYY-MM-DD`) e hora (`HH:MM`) num carimbo ISO local, sem fuso. */
export function combinarDataHora(data: string | undefined, hora: string | undefined): string | undefined {
  if (!data) return undefined;
  const horaMatch = hora ? /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(normalizarEspacos(hora)) : null;
  if (!horaMatch) return data;
  const hh = horaMatch[1].padStart(2, "0");
  return `${data}T${hh}:${horaMatch[2]}:${horaMatch[3] ?? "00"}`;
}

/**
 * Separa o rótulo `"1000000000 - Procuração (2 procuração)"` em id, nome, tipo e descrição.
 * O id no rótulo é redundante com o `id` extraído do `onclick`, mas serve de fallback quando os
 * `onclick` mudam.
 */
export function parseRotuloDocumento(rotulo: string): { id?: string; nome: string; tipo?: string; descricao?: string } {
  const texto = normalizarEspacos(rotulo);
  const comId = /^(\d+)\s*-\s*(.+)$/.exec(texto);
  const id = comId?.[1];
  const nome = comId ? comId[2].trim() : texto;
  const comParenteses = /^(.*?)\s*\(([^()]*)\)$/.exec(nome);
  if (comParenteses && comParenteses[1]) {
    return { id, nome, tipo: comParenteses[1].trim(), descricao: comParenteses[2].trim() || undefined };
  }
  return { id, nome, tipo: nome || undefined };
}

/**
 * Separa `"EMPRESA DE TESTE - FILIAL - CNPJ: 00.000.000/0001-00 (REU)"` em nome, documento e
 * tipo. O nome pode conter ` - `, então a âncora é o rótulo do documento (`CPF:`/`CNPJ:`), nunca o
 * primeiro hífen.
 */
export function parseParte(texto: string, polo: string): ParteProcesso | undefined {
  const limpo = normalizarEspacos(texto);
  if (!limpo) return undefined;
  let restante = limpo;
  let tipo: string | undefined;
  const comTipo = /^(.*?)\s*\(([^()]*)\)$/.exec(restante);
  if (comTipo) {
    restante = comTipo[1].trim();
    tipo = comTipo[2].trim() || undefined;
  }
  let documento: string | undefined;
  const comDocumento = /^(.*?)\s+-\s+(CPF|CNPJ|RG|OAB|PASSAPORTE)\s*:\s*(.+)$/i.exec(restante);
  if (comDocumento) {
    restante = comDocumento[1].trim();
    documento = `${comDocumento[2].toUpperCase()}: ${comDocumento[3].trim()}`;
  }
  if (!restante) return undefined;
  return { nome: restante, polo, tipo, documento };
}

function detalhe(detalhes: RawCabecalho["detalhes"], ...rotulos: string[]): string | undefined {
  for (const rotulo of rotulos) {
    const alvo = rotulo.toLowerCase();
    const achado = detalhes.find((item) => normalizarEspacos(item.rotulo).toLowerCase().replace(/[:?]+$/, "") === alvo);
    const valor = achado ? normalizarEspacos(achado.valor) : "";
    if (valor) return valor;
  }
  return undefined;
}

export function mapCabecalhoParaMetadata(
  cabecalho: RawCabecalho,
  contexto: { numeroCnj: string; grau: Grau; url?: string; identificadorInterno?: string },
): ProcessoMetadata {
  const partes: ParteProcesso[] = [];
  for (const [polo, linhas] of [
    ["ativo", cabecalho.poloAtivo],
    ["passivo", cabecalho.poloPassivo],
  ] as const) {
    for (const linha of linhas) {
      const parte = parseParte(linha.texto, polo);
      if (parte) partes.push(parte);
      for (const representante of linha.representantes) {
        const rep = parseParte(representante, polo);
        if (rep) partes.push({ ...rep, tipo: rep.tipo ?? "REPRESENTANTE" });
      }
    }
  }

  const detalhes: Record<string, string> = {};
  for (const item of cabecalho.detalhes) {
    const rotulo = normalizarEspacos(item.rotulo);
    const valor = normalizarEspacos(item.valor);
    if (rotulo && valor) detalhes[rotulo] = valor;
  }

  const dataDistribuicao = detalhe(cabecalho.detalhes, "última distribuição", "autuação");

  return {
    numeroCnj: contexto.numeroCnj,
    classe: detalhe(cabecalho.detalhes, "classe judicial"),
    assunto: detalhe(cabecalho.detalhes, "assunto"),
    orgaoJulgador: detalhe(cabecalho.detalhes, "órgão julgador"),
    relatorOuMagistrado: detalhe(cabecalho.detalhes, "relator", "magistrado", "cargo judicial"),
    partes: partes.length ? partes : undefined,
    situacao: detalhe(cabecalho.detalhes, "situação"),
    dataDistribuicao: parsePjeDate(dataDistribuicao) ?? dataDistribuicao,
    grau: contexto.grau,
    url: contexto.url,
    identificadorInterno: contexto.identificadorInterno,
    detalhes: Object.keys(detalhes).length ? detalhes : undefined,
  };
}

/**
 * Achata os eventos da timeline em documentos, descartando movimentos sem documento anexado.
 *
 * A timeline vem do PJe em ordem decrescente por padrão (e o usuário pode invertê-la na UI), então
 * a ordem do DOM não é confiável: o `indice` é atribuído após ordenar por data/hora, com o
 * `idProcessoDocumento` numérico — que é sequencial no PJe — como critério de desempate.
 */
export function mapTimelineParaDocumentos(eventos: RawTimelineEvento[]): DocumentoProcesso[] {
  const itens: Array<{ doc: DocumentoProcesso; carimbo?: string; idNumerico: number; ordemDom: number }> = [];
  let ordemDom = 0;
  const vistos = new Set<string>();

  for (const evento of eventos) {
    const data = parsePjeDate(evento.data);
    const carimbo = combinarDataHora(data, evento.hora);
    for (const documento of evento.documentos) {
      const rotulo = parseRotuloDocumento(documento.rotulo);
      const id = documento.id || rotulo.id;
      if (!id || vistos.has(id)) continue;
      vistos.add(id);
      itens.push({
        carimbo,
        idNumerico: Number.parseInt(id, 10),
        ordemDom: ordemDom++,
        doc: {
          indice: 0,
          identificadorInterno: id,
          nome: rotulo.nome,
          tipo: rotulo.tipo,
          descricao: rotulo.descricao,
          data: carimbo,
          downloadId: id,
          acessivel: true,
          metadados: {
            movimento: evento.movimento,
            origem: evento.origem,
            dataExibida: evento.data,
            horaExibida: evento.hora,
            formatoProvavel: documento.icone?.includes("pdf") ? "pdf" : "html",
            ...(documento.anexoDe ? { anexoDe: documento.anexoDe } : {}),
          },
        },
      });
    }
  }

  itens.sort((a, b) => {
    if (a.carimbo && b.carimbo && a.carimbo !== b.carimbo) return a.carimbo < b.carimbo ? -1 : 1;
    if (a.carimbo && !b.carimbo) return 1;
    if (!a.carimbo && b.carimbo) return -1;
    if (Number.isFinite(a.idNumerico) && Number.isFinite(b.idNumerico) && a.idNumerico !== b.idNumerico) {
      return a.idNumerico - b.idNumerico;
    }
    return a.ordemDom - b.ordemDom;
  });

  return itens.map((item, posicao) => ({ ...item.doc, indice: posicao + 1 }));
}

/** O popup da pesquisa rápida do 2º grau avisa "Processo não encontrado" por `alert()` e se fecha. */
export function ehAlertaProcessoNaoEncontrado(mensagem: string): boolean {
  return /processo\s+n[ãa]o\s+encontrado/i.test(mensagem);
}

/** Extensão de arquivo a partir do `content-type` devolvido pelo endpoint de download. */
export function extensaoParaContentType(contentType: string | undefined): string | undefined {
  const tipo = (contentType ?? "").split(";")[0].trim().toLowerCase();
  const mapa: Record<string, string> = {
    "application/pdf": ".pdf",
    "text/html": ".html",
    "application/xhtml+xml": ".html",
    "text/plain": ".txt",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/tiff": ".tif",
    "audio/mpeg": ".mp3",
    "video/mp4": ".mp4",
    "application/zip": ".zip",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/octet-stream": ".bin",
  };
  return mapa[tipo];
}

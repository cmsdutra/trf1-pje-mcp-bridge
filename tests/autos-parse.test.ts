import { describe, expect, it } from "vitest";
import {
  combinarDataHora,
  extensaoParaContentType,
  mapCabecalhoParaMetadata,
  mapTimelineParaDocumentos,
  parseParte,
  parsePjeDate,
  parseRotuloDocumento,
  type RawCabecalho,
  type RawTimelineEvento,
} from "../src/pje/autos-parse.js";
import cabecalhoFixture from "./fixtures/cabecalho.json" with { type: "json" };
import timelineFixture from "./fixtures/timeline-eventos.json" with { type: "json" };

const cabecalho = cabecalhoFixture as RawCabecalho;
const eventos = timelineFixture as RawTimelineEvento[];

describe("parsePjeDate", () => {
  it("converte a data abreviada do PJe para ISO", () => {
    expect(parsePjeDate("31 jul. 2026")).toBe("2026-07-31");
    expect(parsePjeDate("1 jan. 2025")).toBe("2025-01-01");
    expect(parsePjeDate(" 5 dez. 2024 ")).toBe("2024-12-05");
  });

  it("devolve undefined em vez de inventar data quando o formato muda", () => {
    expect(parsePjeDate("31/07/2026")).toBeUndefined();
    expect(parsePjeDate("31 xyz. 2026")).toBeUndefined();
    expect(parsePjeDate(undefined)).toBeUndefined();
  });
});

describe("combinarDataHora", () => {
  it("junta data e hora num carimbo ordenável", () => {
    expect(combinarDataHora("2026-07-31", "18:06")).toBe("2026-07-31T18:06:00");
    expect(combinarDataHora("2026-07-31", "9:05")).toBe("2026-07-31T09:05:00");
  });

  it("mantém só a data quando a hora não é utilizável", () => {
    expect(combinarDataHora("2026-07-31", undefined)).toBe("2026-07-31");
    expect(combinarDataHora("2026-07-31", "ontem")).toBe("2026-07-31");
    expect(combinarDataHora(undefined, "18:06")).toBeUndefined();
  });
});

describe("parseRotuloDocumento", () => {
  it("separa id, nome, tipo e descrição", () => {
    expect(parseRotuloDocumento("1000000011 - Procuração (2 procuracao)")).toEqual({
      id: "1000000011",
      nome: "Procuração (2 procuracao)",
      tipo: "Procuração",
      descricao: "2 procuracao",
    });
  });

  it("trata rótulo sem parênteses", () => {
    expect(parseRotuloDocumento("1000000030 - Decisão")).toEqual({
      id: "1000000030",
      nome: "Decisão",
      tipo: "Decisão",
    });
  });

  it("aceita rótulo sem id prefixado", () => {
    expect(parseRotuloDocumento("Certidão de Intimação")).toEqual({
      id: undefined,
      nome: "Certidão de Intimação",
      tipo: "Certidão de Intimação",
    });
  });
});

describe("parseParte", () => {
  it("ancora no rótulo do documento, não no primeiro hífen do nome", () => {
    expect(parseParte("EMPRESA DE TESTE - FILIAL - CNPJ: 00.000.000/0001-00 (REU)", "passivo")).toEqual({
      nome: "EMPRESA DE TESTE - FILIAL",
      polo: "passivo",
      tipo: "REU",
      documento: "CNPJ: 00.000.000/0001-00",
    });
  });

  it("lê parte sem documento", () => {
    expect(parseParte("SEGUNDA PARTE RE DE TESTE (REU)", "passivo")).toEqual({
      nome: "SEGUNDA PARTE RE DE TESTE",
      polo: "passivo",
      tipo: "REU",
      documento: undefined,
    });
  });

  it("lê representante sem documento nem tipo", () => {
    expect(parseParte("Advocacia da Empresa de Teste", "passivo")).toEqual({
      nome: "Advocacia da Empresa de Teste",
      polo: "passivo",
      tipo: undefined,
      documento: undefined,
    });
  });

  it("ignora texto vazio", () => {
    expect(parseParte("   ", "ativo")).toBeUndefined();
  });
});

describe("mapCabecalhoParaMetadata", () => {
  const metadata = mapCabecalhoParaMetadata(cabecalho, {
    numeroCnj: "0000000-00.0000.0.00.0000",
    grau: "1",
    url: "https://pje1g.trf1.jus.br/pje/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam?idProcesso=1234",
    identificadorInterno: "1234",
  });

  it("extrai os campos principais do painel de detalhes", () => {
    expect(metadata.classe).toBe("PROCEDIMENTO COMUM CÍVEL (7)");
    expect(metadata.assunto).toBe("DIREITO CIVIL (000) / Assunto de Teste (111)");
    expect(metadata.orgaoJulgador).toBe("1ª Vara Federal Cível de Teste");
    expect(metadata.identificadorInterno).toBe("1234");
    expect(metadata.grau).toBe("1");
  });

  it("prefere a última distribuição à autuação e normaliza para ISO", () => {
    expect(metadata.dataDistribuicao).toBe("2026-07-16");
  });

  it("achata partes e representantes dos dois polos", () => {
    expect(metadata.partes).toEqual([
      { nome: "PARTE AUTORA DE TESTE", polo: "ativo", tipo: "AUTOR", documento: "CPF: 000.000.000-00" },
      { nome: "ADVOGADA DE TESTE", polo: "ativo", tipo: "ADVOGADO", documento: "CPF: 111.111.111-11" },
      { nome: "EMPRESA DE TESTE - FILIAL", polo: "passivo", tipo: "REU", documento: "CNPJ: 00.000.000/0001-00" },
      { nome: "Advocacia da Empresa de Teste", polo: "passivo", tipo: "REPRESENTANTE", documento: undefined },
      { nome: "SEGUNDA PARTE RE DE TESTE", polo: "passivo", tipo: "REU", documento: undefined },
    ]);
  });

  it("preserva os demais detalhes e descarta rótulos sem valor", () => {
    expect(metadata.detalhes?.["Jurisdição"]).toBe("Seção Judiciária de Teste");
    expect(metadata.detalhes?.["Valor da causa"]).toBe("R$ 1.000,00");
    expect(metadata.detalhes).not.toHaveProperty("Contato Órgão julgador");
  });
});

describe("mapTimelineParaDocumentos", () => {
  const documentos = mapTimelineParaDocumentos(eventos);

  it("descarta movimentos sem documento anexado", () => {
    expect(documentos.map((doc) => doc.nome)).not.toContain("Conclusos para despacho");
  });

  it("deduplica documentos repetidos na timeline", () => {
    expect(documentos.filter((doc) => doc.downloadId === "1000000010")).toHaveLength(1);
  });

  it("ordena cronologicamente mesmo com a timeline em ordem decrescente", () => {
    expect(documentos.map((doc) => doc.downloadId)).toEqual([
      "1000000099",
      "1000000010",
      "1000000011",
      "1000000012",
      "1000000030",
    ]);
    expect(documentos.map((doc) => doc.indice)).toEqual([1, 2, 3, 4, 5]);
  });

  it("preenche identificador, data e formato provável", () => {
    const decisao = documentos.find((doc) => doc.downloadId === "1000000030");
    expect(decisao).toMatchObject({
      identificadorInterno: "1000000030",
      nome: "Decisão",
      tipo: "Decisão",
      data: "2026-07-31T18:06:00",
      acessivel: true,
    });
    expect(decisao?.metadados).toMatchObject({ movimento: "Determinada a emenda à inicial", formatoProvavel: "html" });

    const procuracao = documentos.find((doc) => doc.downloadId === "1000000011");
    expect(procuracao?.metadados).toMatchObject({ formatoProvavel: "pdf", anexoDe: "1000000010" });
  });

  it("mantém documentos sem data no início, sem descartá-los", () => {
    expect(documentos[0]).toMatchObject({ downloadId: "1000000099", indice: 1, data: undefined });
  });

  it("devolve lista vazia para timeline sem eventos", () => {
    expect(mapTimelineParaDocumentos([])).toEqual([]);
  });
});

describe("extensaoParaContentType", () => {
  it("mapeia os tipos que o endpoint de download devolve", () => {
    expect(extensaoParaContentType("application/pdf")).toBe(".pdf");
    expect(extensaoParaContentType("text/html;charset=UTF-8")).toBe(".html");
    expect(extensaoParaContentType("image/jpeg")).toBe(".jpg");
  });

  it("devolve undefined para tipo desconhecido ou ausente", () => {
    expect(extensaoParaContentType("application/x-coisa-nova")).toBeUndefined();
    expect(extensaoParaContentType(undefined)).toBeUndefined();
  });
});

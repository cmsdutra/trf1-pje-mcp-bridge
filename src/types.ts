import type { Grau } from "./pje/urls.js";

export type { Grau };

export interface ParteProcesso {
  nome: string;
  polo?: string;
  tipo?: string;
  documento?: string;
}

export interface ProcessoMetadata {
  numeroCnj: string;
  classe?: string;
  assunto?: string;
  orgaoJulgador?: string;
  relatorOuMagistrado?: string;
  partes?: ParteProcesso[];
  situacao?: string;
  dataDistribuicao?: string;
  grau: Grau;
  url?: string;
  identificadorInterno?: string;
}

export interface DocumentoProcesso {
  indice: number;
  identificadorInterno: string;
  nome: string;
  tipo?: string;
  descricao?: string;
  data?: string;
  signatario?: string;
  nivelRestricao?: string;
  downloadId: string;
  acessivel: boolean;
  metadados?: Record<string, unknown>;
}

export interface DownloadDocumentoResultado {
  caminhoLocal: string;
  nomeArquivo: string;
  metadados: DocumentoProcesso;
}

export interface ManifestDocumento {
  indice: number;
  identificador: string;
  nomeOriginal: string;
  nomeLocal?: string;
  tipo?: string;
  data?: string;
  metadados?: Record<string, unknown>;
  status: "baixado" | "erro";
  mensagemErro?: string;
}

export interface ManifestInteiroTeor {
  numeroProcesso: string;
  grau: Grau;
  coletadoEm: string;
  urlOrigem?: string;
  metadadosProcesso?: ProcessoMetadata;
  quantidadeTotalDocumentos: number;
  quantidadeBaixada: number;
  quantidadeComErro: number;
  documentos: ManifestDocumento[];
}

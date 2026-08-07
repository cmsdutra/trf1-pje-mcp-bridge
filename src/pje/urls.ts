export type Grau = "1" | "2";

export interface PjeEnvironment {
  grau: Grau;
  baseUrl: string;
  loginUrl: string;
  publicSearchUrl: string;
  ssoClientId: string;
  /** Sigla do tribunal usada nas rotas REST legadas de download (`.../download/TRF1/1g/...`). */
  tribunal: string;
}

export const PJE_URLS: Record<Grau, PjeEnvironment> = {
  "1": {
    grau: "1",
    baseUrl: "https://pje1g.trf1.jus.br/pje",
    loginUrl: "https://pje1g.trf1.jus.br/pje/login.seam",
    publicSearchUrl: "https://pje1g.trf1.jus.br/pje/ConsultaPublica/listView.seam",
    ssoClientId: "pje-trf1-1g",
    tribunal: "TRF1",
  },
  "2": {
    grau: "2",
    baseUrl: "https://pje2g.trf1.jus.br/pje",
    loginUrl: "https://pje2g.trf1.jus.br/pje/login.seam",
    publicSearchUrl: "https://pje2g.trf1.jus.br/pje/ConsultaPublica/listView.seam",
    ssoClientId: "pje-trf1-2g",
    tribunal: "TRF1",
  },
};

export function getPjeEnvironment(grau: Grau): PjeEnvironment {
  return PJE_URLS[grau];
}

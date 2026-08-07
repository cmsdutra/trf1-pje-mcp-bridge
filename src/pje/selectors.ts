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

export const authenticatedSelectors = {
  inspected: false,
  processSearch: null,
  processMetadata: null,
  documentList: null,
  documentDownload: null,
} as const;

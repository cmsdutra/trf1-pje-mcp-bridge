import { describe, expect, it } from "vitest";
import { sortDocumentsByProcessOrder } from "../src/pje/documents.js";

describe("documents", () => {
  it("preserva ordenação por índice do processo", () => {
    const sorted = sortDocumentsByProcessOrder([
      { indice: 3, identificadorInterno: "c", nome: "C", downloadId: "c", acessivel: true },
      { indice: 1, identificadorInterno: "a", nome: "A", downloadId: "a", acessivel: true },
      { indice: 2, identificadorInterno: "b", nome: "B", downloadId: "b", acessivel: false },
    ]);
    expect(sorted.map((doc) => doc.indice)).toEqual([1, 2, 3]);
  });
});

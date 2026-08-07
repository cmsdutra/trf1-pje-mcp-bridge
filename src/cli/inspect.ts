#!/usr/bin/env node
import { runAuthenticatedInspection } from "../pje/inspect.js";
import type { Grau } from "../pje/urls.js";
import { toStructuredError } from "../utils/errors.js";

const args = process.argv.slice(2);
const grau = (args.find((arg) => arg === "1" || arg === "2") ?? "1") as Grau;
const numeroProcesso = args.find((arg) => arg !== "1" && arg !== "2");

if (!numeroProcesso) {
  console.error("Uso: npm run inspect -- <numero-processo-cnj> [1|2]");
  process.exit(1);
}

runAuthenticatedInspection(grau, numeroProcesso)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error: unknown) => {
    console.error(JSON.stringify(toStructuredError(error), null, 2));
    process.exit(1);
  });

#!/usr/bin/env node
import { runManualAuthentication } from "../pje/auth.js";
import type { Grau } from "../pje/urls.js";
import { toStructuredError } from "../utils/errors.js";

const grau = (process.argv.find((arg) => arg === "1" || arg === "2") ?? "1") as Grau;

runManualAuthentication(grau)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error: unknown) => {
    console.error(JSON.stringify(toStructuredError(error), null, 2));
    process.exit(1);
  });

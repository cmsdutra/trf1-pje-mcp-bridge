import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";
import { config } from "../config.js";
import { PjeError } from "../utils/errors.js";
import { log } from "../utils/logger.js";
import { ensureStorageDir, detectAuthenticated } from "./client.js";
import { getPjeEnvironment, type Grau } from "./urls.js";

export async function runManualAuthentication(grau: Grau = "1"): Promise<{ grau: Grau; valid: boolean; message: string }> {
  const env = getPjeEnvironment(grau);
  await ensureStorageDir();
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(env.loginUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  log("info", "Navegador visível aberto para autenticação manual PJe", { grau, url: env.loginUrl });

  const rl = readline.createInterface({ input, output });
  try {
    await rl.question("Conclua o login manual no navegador visível e pressione Enter aqui para validar a sessão...");
  } finally {
    rl.close();
  }

  const valid = await detectAuthenticated(page, grau);
  if (!valid) {
    await browser.close();
    throw new PjeError("AUTH_REQUIRED", "Login manual não foi confirmado. Nenhum storageState foi salvo.", { grau });
  }

  await context.storageState({ path: config.storageStatePath });
  await browser.close();
  log("info", "Sessão PJe salva com storageState", { grau });
  return { grau, valid, message: "Sessão autenticada salva com sucesso." };
}

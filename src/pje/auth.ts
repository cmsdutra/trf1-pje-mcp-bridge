import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";
import { config, storageStatePathFor } from "../config.js";
import { PjeError } from "../utils/errors.js";
import { writePrivateFileAtomic } from "../utils/filesystem.js";
import { log } from "../utils/logger.js";
import { ensureStorageDir, detectAuthenticated } from "./client.js";
import { getPjeEnvironment, type Grau } from "./urls.js";

export async function runManualAuthentication(grau: Grau = "1"): Promise<{ grau: Grau; valid: boolean; message: string }> {
  const env = getPjeEnvironment(grau);
  await ensureStorageDir(grau);
  const browser = await chromium.launch({ headless: false, chromiumSandbox: config.chromiumSandbox });
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

  // Cookies de sessão: o arquivo nasce com 0600 (sem janela legível por outros usuários) e entra
  // no lugar por rename atômico, em vez de gravar com o umask e só depois fazer chmod.
  const state = await context.storageState();
  await writePrivateFileAtomic(storageStatePathFor(grau), JSON.stringify(state));
  await browser.close();
  log("info", "Sessão PJe salva com storageState", { grau });
  return { grau, valid, message: "Sessão autenticada salva com sucesso." };
}

import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { config } from "../config.js";
import { log } from "../utils/logger.js";
import { PjeError } from "../utils/errors.js";
import { getPjeEnvironment, type Grau } from "./urls.js";

export const AUTH_INSTRUCTIONS =
  "Autentique manualmente com `npm run auth` no clone local ou `npx -y -p github:cmsdutra/trf1-pje-mcp-bridge mcp-pje-trf1-auth` na instalação via GitHub/npx.";

export interface PjeSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export async function hasSavedSession(): Promise<boolean> {
  try {
    await fs.access(config.storageStatePath);
    return true;
  } catch {
    return false;
  }
}

export async function launchSession(grau: Grau, headless = config.headless): Promise<PjeSession> {
  if (!(await hasSavedSession())) {
    throw new PjeError("SESSION_MISSING", `Sessão PJe não encontrada. ${AUTH_INSTRUCTIONS}`);
  }
  const env = getPjeEnvironment(grau);
  const browser = await chromium.launch({ headless, chromiumSandbox: config.chromiumSandbox });
  const context = await browser.newContext({
    storageState: config.storageStatePath,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  log("debug", "Abrindo sessão PJe salva", { grau, url: env.loginUrl, headless });
  return { browser, context, page };
}

export async function closeSession(session: PjeSession): Promise<void> {
  await session.context.close().catch(() => undefined);
  await session.browser.close().catch(() => undefined);
}

export async function detectAuthenticated(page: Page, grau: Grau): Promise<boolean> {
  const env = getPjeEnvironment(grau);
  await page.goto(env.loginUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  const currentUrl = page.url();
  if (currentUrl.includes("sso.cloud.pje.jus.br")) return false;
  if (!currentUrl.startsWith(env.baseUrl)) return false;
  const hasLoginField = await page.locator("#username, #password, #kc-login").first().isVisible({ timeout: 2_000 }).catch(() => false);
  return !hasLoginField;
}

export async function requireAuthenticated(grau: Grau): Promise<PjeSession> {
  const session = await launchSession(grau, true);
  const valid = await detectAuthenticated(session.page, grau).catch((error: unknown) => {
    log("warn", "Falha ao verificar sessão PJe", { grau, error: String(error) });
    return false;
  });
  if (!valid) {
    await closeSession(session);
    throw new PjeError("SESSION_EXPIRED", `Sessão PJe inexistente ou expirada. ${AUTH_INSTRUCTIONS}`, { grau });
  }
  return session;
}

export async function ensureStorageDir(): Promise<void> {
  await fs.mkdir(path.dirname(config.storageStatePath), { recursive: true, mode: 0o700 });
}

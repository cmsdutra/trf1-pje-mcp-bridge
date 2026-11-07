import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { config, storageStatePathFor } from "../config.js";
import { log } from "../utils/logger.js";
import { PjeError } from "../utils/errors.js";
import { Semaphore } from "../utils/semaphore.js";
import { getPjeEnvironment, type Grau } from "./urls.js";

export const AUTH_INSTRUCTIONS =
  "Autentique manualmente com `npm run auth` no clone local ou `npx -y -p github:naiberpontes/trf1-pje-mcp-bridge mcp-pje-trf1-auth` na instalação via GitHub/npx. Para o 2º grau, acrescente `-- 2` (npm) ou `2` (npx) ao comando.";

const sessionSlots = new Semaphore(config.maxSessions);

export interface PjeSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  /** Marca que a vaga do semáforo já foi devolvida (closeSession é idempotente). */
  released?: boolean;
}

export async function hasSavedSession(grau: Grau): Promise<boolean> {
  try {
    await fs.access(storageStatePathFor(grau));
    return true;
  } catch {
    return false;
  }
}

export async function launchSession(grau: Grau, headless = config.headless): Promise<PjeSession> {
  if (!(await hasSavedSession(grau))) {
    throw new PjeError("SESSION_MISSING", `Sessão PJe do ${grau}º grau não encontrada. ${AUTH_INSTRUCTIONS}`, { grau });
  }
  const env = getPjeEnvironment(grau);
  // Limita Chromiums simultâneos: um loop de chamadas não pode esgotar memória/CPU da máquina.
  await sessionSlots.acquire();
  try {
    const browser = await chromium.launch({ headless, chromiumSandbox: config.chromiumSandbox });
    try {
      const context = await browser.newContext({
        storageState: storageStatePathFor(grau),
        acceptDownloads: true,
      });
      const page = await context.newPage();
      log("debug", "Abrindo sessão PJe salva", { grau, url: env.loginUrl, headless });
      return { browser, context, page };
    } catch (error) {
      await browser.close().catch(() => undefined);
      throw error;
    }
  } catch (error) {
    sessionSlots.release();
    throw error;
  }
}

export async function closeSession(session: PjeSession): Promise<void> {
  await session.context.close().catch(() => undefined);
  await session.browser.close().catch(() => undefined);
  if (!session.released) {
    session.released = true;
    sessionSlots.release();
  }
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

/** Perfil (papel + localização) ativo na sessão. Só campos não identificadores: sem nome, login ou id do usuário. */
export interface PerfilAtivo {
  papel?: string;
  cargo?: string;
  idPapel?: number;
  idOrgaoJulgador?: number;
  idOrgaoJulgadorColegiado?: number;
  idLocalizacaoFisica?: number;
  visualizaSigiloso?: boolean;
}

/**
 * Lê o perfil ativo da sessão em `usuario/currentUser`. O perfil é estado do servidor preso ao
 * JSESSIONID: quem escolheu a localização no login é quem determina quais processos a sessão enxerga.
 * É informativo — qualquer falha devolve `undefined` em vez de derrubar quem chamou.
 */
export async function lerPerfilAtivo(session: PjeSession, grau: Grau): Promise<PerfilAtivo | undefined> {
  try {
    const url = `${getPjeEnvironment(grau).baseUrl}/seam/resource/rest/pje-legacy/usuario/currentUser`;
    const response = await session.context.request.get(url, { timeout: 15_000 });
    if (!response.ok()) return undefined;
    const dados = (await response.json()) as Record<string, unknown>;
    const texto = (valor: unknown) => (typeof valor === "string" && valor.trim() ? valor.trim() : undefined);
    const numero = (valor: unknown) => (typeof valor === "number" ? valor : undefined);
    return {
      papel: texto(dados.descricaoPapel),
      cargo: texto(dados.descricaoCargo),
      idPapel: numero(dados.idPapel),
      idOrgaoJulgador: numero(dados.idOrgaoJulgador),
      idOrgaoJulgadorColegiado: numero(dados.idOrgaoJulgadorColegiado),
      idLocalizacaoFisica: numero(dados.idLocalizacaoFisica),
      visualizaSigiloso: typeof dados.visualizaSigiloso === "boolean" ? dados.visualizaSigiloso : undefined,
    };
  } catch {
    return undefined;
  }
}

export async function requireAuthenticated(grau: Grau): Promise<PjeSession> {
  const session = await launchSession(grau, true);
  // Exceção na verificação (timeout, rede) NÃO é sessão expirada: tenta de novo e, se persistir, avisa
  // que não deu para verificar, em vez de mandar o usuário reautenticar sem necessidade.
  let valid = false;
  let falhaDeVerificacao: unknown;
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      valid = await detectAuthenticated(session.page, grau);
      falhaDeVerificacao = undefined;
      break;
    } catch (error) {
      falhaDeVerificacao = error;
      log("warn", "Falha ao verificar sessão PJe", { grau, tentativa, error: String(error) });
    }
  }
  if (falhaDeVerificacao) {
    await closeSession(session);
    throw new PjeError("TIMEOUT", "Não foi possível verificar a sessão do PJe (falha de rede ou lentidão). Isso não indica sessão expirada; tente novamente.", {
      grau,
      erro: String(falhaDeVerificacao).slice(0, 200),
    });
  }
  if (!valid) {
    await closeSession(session);
    throw new PjeError("SESSION_EXPIRED", `Sessão PJe inexistente ou expirada. ${AUTH_INSTRUCTIONS}`, { grau });
  }
  return session;
}

export async function ensureStorageDir(grau: Grau): Promise<void> {
  await fs.mkdir(path.dirname(storageStatePathFor(grau)), { recursive: true, mode: 0o700 });
}

import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Download, Frame, Page } from "playwright";
import { config } from "../config.js";
import { log } from "../utils/logger.js";
import { PjeError } from "../utils/errors.js";
import { assertValidCnj } from "../utils/cnj.js";
import { AUTH_INSTRUCTIONS, closeSession, detectAuthenticated, hasSavedSession, launchSession } from "./client.js";
import type { Grau } from "./urls.js";

export interface InspectionResult {
  outputDir: string;
  files: string[];
}

interface CaptureStep {
  slug: string;
  prompt: string;
}

interface NetworkCandidate {
  url: string;
  method: string;
  status: number;
  contentType: string;
  bodyFile?: string;
  bodyTruncated?: boolean;
}

const STEPS: CaptureStep[] = [
  {
    slug: "01-processo-autos-digitais",
    prompt:
      "Busque e abra o processo informado (clique em \"Abrir processo\", não apenas digite o número). No PJe, abrir o processo já exibe os autos digitais/lista de documentos. Pressione Enter quando a página do processo com a lista de documentos estiver totalmente carregada.",
  },
  {
    slug: "02-download",
    prompt: "Clique para abrir/baixar um documento qualquer da lista. Pressione Enter após o documento abrir ou o download iniciar.",
  },
];

const NETWORK_BODY_MAX_BYTES = 300_000;
const NETWORK_CANDIDATE_LIMIT = 200;

function isInterestingContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  return /json|pdf|octet-stream/i.test(contentType);
}

/**
 * `page.content()`/`frame.content()` só serializam o DOM "claro" — elementos anexados a um
 * shadow root (comum em web components de viewers modernos) ficam de fora mesmo estando
 * visíveis na tela. Este script roda dentro da página e percorre shadow roots manualmente,
 * marcando as bordas com comentários, para que o dump em disco reflita o que aparece no screenshot.
 *
 * É passado para `page.evaluate`/`frame.evaluate` como STRING (não como referência de função):
 * quando rodado via `tsx`/esbuild, uma função TS transformada pode ganhar uma chamada auxiliar
 * `__name(...)` injetada no corpo; o Playwright serializa a função via `.toString()` para rodar
 * no navegador, onde esse helper não existe, e isso quebra com `ReferenceError: __name is not
 * defined`. Uma string literal nunca passa por esse transform, então fica imune ao problema.
 */
const SHADOW_DOM_SERIALIZER_SOURCE = `
(function () {
  function serializeNode(node) {
    var html = '';
    node.childNodes.forEach(function (child) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        var el = child;
        var tag = el.tagName.toLowerCase();
        var attrs = Array.from(el.attributes)
          .map(function (a) {
            return ' ' + a.name + '="' + a.value.replace(/"/g, '&quot;') + '"';
          })
          .join('');
        html += '<' + tag + attrs + '>';
        var shadowRoot = el.shadowRoot;
        if (shadowRoot) {
          html += '<!--shadow-root-start-->' + serializeNode(shadowRoot) + '<!--shadow-root-end-->';
        }
        html += serializeNode(el);
        html += '</' + tag + '>';
      } else if (child.nodeType === Node.TEXT_NODE) {
        html += child.textContent || '';
      } else if (child.nodeType === Node.COMMENT_NODE) {
        html += '<!--' + (child.textContent || '') + '-->';
      }
    });
    return html;
  }
  return '<!doctype html>\\n<html>' + serializeNode(document.documentElement) + '</html>';
})()
`;

async function captureFrameOrPage(target: Page | Frame, outputPath: string): Promise<void> {
  const html = await target.evaluate<string>(SHADOW_DOM_SERIALIZER_SOURCE);
  await fs.writeFile(outputPath, html, "utf8");
}

async function captureStep(page: Page, outputDir: string, slug: string, files: string[]): Promise<void> {
  const htmlPath = path.join(outputDir, `${slug}.html`);
  const pngPath = path.join(outputDir, `${slug}.png`);
  const framesPath = path.join(outputDir, `${slug}-frames.json`);

  await captureFrameOrPage(page, htmlPath);
  await page.screenshot({ path: pngPath, fullPage: true }).catch((error: unknown) => {
    log("warn", "Falha ao capturar screenshot da inspeção", { slug, error: String(error) });
  });
  const frames = page.frames().map((frame) => ({ url: frame.url(), name: frame.name() }));
  await fs.writeFile(framesPath, JSON.stringify(frames, null, 2), "utf8");
  files.push(htmlPath, pngPath, framesPath);

  for (const [index, frame] of page.frames().entries()) {
    if (frame === page.mainFrame()) continue;
    if (!frame.url() || frame.url() === "about:blank") continue;
    try {
      const frameHtmlPath = path.join(outputDir, `${slug}-frame-${index}.html`);
      await captureFrameOrPage(frame, frameHtmlPath);
      files.push(frameHtmlPath);
    } catch (error) {
      log("warn", "Falha ao capturar conteúdo de frame durante inspeção", { slug, frameUrl: frame.url(), error: String(error) });
    }
  }
}

export async function runAuthenticatedInspection(grau: Grau, numeroProcesso: string): Promise<InspectionResult> {
  const numeroCnj = assertValidCnj(numeroProcesso);
  if (!(await hasSavedSession())) {
    throw new PjeError("SESSION_MISSING", `Sessão PJe não encontrada. ${AUTH_INSTRUCTIONS}`);
  }

  const session = await launchSession(grau, false);
  const { context, page } = session;

  const valid = await detectAuthenticated(page, grau).catch((error: unknown) => {
    log("warn", "Falha ao verificar sessão PJe durante inspeção", { grau, error: String(error) });
    return false;
  });
  if (!valid) {
    await closeSession(session);
    throw new PjeError("SESSION_EXPIRED", `Sessão PJe inexistente ou expirada. ${AUTH_INSTRUCTIONS}`, { grau });
  }

  const outputDir = path.join(config.dataDir, "inspection", new Date().toISOString().replace(/[:.]/g, "-"));
  await fs.mkdir(outputDir, { recursive: true, mode: 0o700 });

  const files: string[] = [];
  const popups: Array<{ url: string; index: number }> = [];
  const popupCaptures: Promise<void>[] = [];
  const downloadEvents: Array<{ suggestedFilename: string; url: string }> = [];
  const networkCandidates: NetworkCandidate[] = [];
  const networkBodyCaptures: Promise<void>[] = [];
  let networkBodyIndex = 0;

  // Escuta no nível do contexto (não da page) para cobrir também popups/novas abas, como o
  // visualizador de documento abaixo.
  context.on("page", (popup) => {
    const index = popups.length;
    popups.push({ url: popup.url(), index });
    popupCaptures.push(
      popup
        .waitForLoadState("domcontentloaded", { timeout: 15_000 })
        .then(async () => {
          const slug = `popup-${index}`;
          await captureStep(popup, outputDir, slug, files);
        })
        .catch((error: unknown) => {
          log("warn", "Falha ao capturar popup durante inspeção", { error: String(error) });
        }),
    );
  });

  context.on("download", (download: Download) => {
    downloadEvents.push({ suggestedFilename: download.suggestedFilename(), url: download.url() });
  });

  context.on("response", (response) => {
    if (networkCandidates.length >= NETWORK_CANDIDATE_LIMIT) return;
    const contentType = response.headers()["content-type"];
    if (!isInterestingContentType(contentType)) return;

    const entry: NetworkCandidate = {
      url: response.url(),
      method: response.request().method(),
      status: response.status(),
      contentType: contentType ?? "",
    };
    networkCandidates.push(entry);

    // Só o corpo de respostas JSON é salvo: é o que revela o formato dos dados de
    // processo/documentos por trás da SPA autenticada. PDF/binário fica só como metadado
    // (a URL/método já bastam para localizar o endpoint de download).
    if (contentType && /json/i.test(contentType)) {
      const captureIndex = networkBodyIndex++;
      networkBodyCaptures.push(
        response
          .text()
          .then(async (body) => {
            let content = body;
            if (content.length > NETWORK_BODY_MAX_BYTES) {
              entry.bodyTruncated = true;
              content = content.slice(0, NETWORK_BODY_MAX_BYTES);
            }
            const networkDir = path.join(outputDir, "network");
            await fs.mkdir(networkDir, { recursive: true, mode: 0o700 });
            const bodyPath = path.join(networkDir, `${String(captureIndex).padStart(3, "0")}.json`);
            await fs.writeFile(bodyPath, content, "utf8");
            entry.bodyFile = bodyPath;
            files.push(bodyPath);
          })
          .catch((error: unknown) => {
            log("warn", "Falha ao capturar corpo de resposta JSON durante inspeção", { url: response.url(), error: String(error) });
          }),
      );
    }
  });

  const rl = readline.createInterface({ input, output });
  try {
    output.write(`Inspeção autenticada iniciada para o processo ${numeroCnj} (grau ${grau}).\n`);
    output.write(`Os arquivos serão salvos em: ${outputDir}\n`);
    output.write(
      "Atenção: os arquivos capturados podem conter dados reais do processo (partes, documentos, respostas de API). Não commite nem compartilhe sem necessidade.\n",
    );

    for (const step of STEPS) {
      await rl.question(`\n${step.prompt}\n`);
      await captureStep(page, outputDir, step.slug, files);
    }
  } finally {
    rl.close();
  }

  await Promise.all(popupCaptures);
  await Promise.all(networkBodyCaptures);

  await fs.writeFile(path.join(outputDir, "download-events.json"), JSON.stringify(downloadEvents, null, 2), "utf8");
  await fs.writeFile(path.join(outputDir, "network-candidates.json"), JSON.stringify(networkCandidates, null, 2), "utf8");
  await fs.writeFile(path.join(outputDir, "popups.json"), JSON.stringify(popups, null, 2), "utf8");
  files.push(
    path.join(outputDir, "download-events.json"),
    path.join(outputDir, "network-candidates.json"),
    path.join(outputDir, "popups.json"),
  );

  await closeSession(session);
  log("info", "Inspeção autenticada concluída", { grau, numeroCnj, outputDir, arquivos: files.length });
  return { outputDir, files };
}

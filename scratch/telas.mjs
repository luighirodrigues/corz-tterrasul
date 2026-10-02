// Prints das telas e verificação do texto, sem dependência: abre o Chrome sem janela e conversa com ele pelo DevTools.
// Uso: com o app no ar (pnpm web:dev), `node scratch/telas.mjs [http://localhost:3000]`. Os prints vão para scratch/telas/.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = path.resolve("scratch", "telas");
mkdirSync(OUT, { recursive: true });

const CHROMES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const chromePath = CHROMES.find((p) => existsSync(p));
if (!chromePath) throw new Error("Chrome não encontrado: defina CHROME_PATH.");

// Termos que não podem aparecer em tela do cliente (docs/UI_REDESIGN.md §8 e docs/PLANO_PRIMEIRO_USO.md).
const PROIBIDOS = [/\{\{/, /esteira/i, /\bcard\b/i, /\bcards\b/i, /\bTMR\b/, /\bFunil\b/, /espelho/i, /\bleva\b/i, /descartad/i, /\bjob\b/i, /\bCLI\b/, /\bgpt/i, /\bAtenção\b/];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const port = 9300 + Math.floor(Math.random() * 500);
const perfil = mkdtempSync(path.join(tmpdir(), "telas-"));
const chrome = spawn(chromePath, [`--remote-debugging-port=${port}`, `--user-data-dir=${perfil}`, "--headless=new", "--hide-scrollbars", "--no-first-run", "about:blank"], {
  stdio: "ignore",
});

async function conectar() {
  for (let i = 0; i < 60; i++) {
    try {
      const lista = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const aba = lista.find((t) => t.type === "page");
      if (aba) return aba.webSocketDebuggerUrl;
    } catch {
      /* ainda subindo */
    }
    await sleep(250);
  }
  throw new Error("Chrome não respondeu.");
}

const ws = new WebSocket(await conectar());
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pendentes = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pendentes.has(m.id)) {
    const { ok, erro } = pendentes.get(m.id);
    pendentes.delete(m.id);
    m.error ? erro(new Error(m.error.message)) : ok(m.result);
  }
});
const cdp = (method, params = {}) =>
  new Promise((ok, erro) => {
    const id = ++seq;
    pendentes.set(id, { ok, erro });
    ws.send(JSON.stringify({ id, method, params }));
  });

const avaliar = async (expressao) => {
  const r = await cdp("Runtime.evaluate", { expression: expressao, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "erro na página");
  return r.result.value;
};

const esperar = async (condicao, rotulo, tempo = 20000) => {
  const fim = Date.now() + tempo;
  while (Date.now() < fim) {
    if (await avaliar(`Boolean(${condicao})`)) return;
    await sleep(200);
  }
  throw new Error(`Tempo esgotado esperando: ${rotulo ?? condicao}`);
};

/** Clica no primeiro elemento do seletor cujo texto contém `texto`. */
const clicar = (seletor, texto) =>
  avaliar(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(seletor)})].find((e) => e.innerText.includes(${JSON.stringify(texto)}));
    if (!el) return false;
    el.click();
    return true;
  })()`);

async function tela(nome, { completa = false } = {}) {
  const params = { format: "png" };
  if (completa) {
    const { contentSize } = await cdp("Page.getLayoutMetrics");
    params.captureBeyondViewport = true;
    params.clip = { x: 0, y: 0, width: contentSize.width, height: Math.min(contentSize.height, 6000), scale: 1 };
  }
  const { data } = await cdp("Page.captureScreenshot", params);
  writeFileSync(path.join(OUT, `${nome}.png`), Buffer.from(data, "base64"));
}

const problemas = [];
const medidas = [];
async function conferirTexto(nome) {
  const texto = await avaliar("document.body.innerText");
  for (const re of PROIBIDOS) if (re.test(texto)) problemas.push(`${nome}: aparece ${re}`);
  const horizontal = await avaliar("document.documentElement.scrollWidth > window.innerWidth + 1");
  if (horizontal) problemas.push(`${nome}: rolagem horizontal`);
}

async function abrir(url, pronto) {
  await cdp("Page.navigate", { url: `${BASE}${url}` });
  await sleep(500);
  await esperar("document.readyState === 'complete'");
  await esperar(pronto ?? "document.querySelector('main h1, main button') && !document.body.innerText.includes('Carregando')", `carregar ${url}`);
}

const cabecalho = () => avaliar("Math.round(document.querySelector('header').getBoundingClientRect().height)");

async function rodar(viewport, largura, altura, celular) {
  await cdp("Emulation.setDeviceMetricsOverride", { width: largura, height: altura, deviceScaleFactor: 1, mobile: celular });
  const p = (n) => `${viewport}-${n}`;

  // Visão geral
  await abrir("/");
  await esperar("document.body.innerText.includes('Ver essas conversas')", "resumo");
  medidas.push(`${viewport}: cabeçalho fixo ${await cabecalho()}px`);
  await tela(p("01-visao-geral"));
  await tela(p("01-visao-geral-completa"), { completa: true });
  await conferirTexto(p("visao-geral"));
  const topoBotao = await avaliar("(() => { const b = [...document.querySelectorAll('button')].find((e) => e.innerText.includes('Ver essas conversas')); return b ? Math.round(b.getBoundingClientRect().bottom) : null; })()");
  medidas.push(`${viewport}: botão "Ver essas conversas" termina a ${topoBotao}px do topo (tela de ${altura}px)`);
  if (topoBotao == null || topoBotao > altura) problemas.push(`${p("visao-geral")}: o resumo não cabe na primeira tela`);

  // Menu de período
  await clicar("header button[aria-haspopup=menu]", "");
  await esperar("document.querySelector('[role=menu]')");
  await tela(p("02-menu-periodo"));
  await conferirTexto(p("menu-periodo"));
  await avaliar("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");

  // Menu de visão
  await clicar("main button[aria-haspopup=menu]", "Visão geral da operação");
  await esperar("document.querySelector('[role=menu]')");
  await tela(p("03-menu-visao"));
  await conferirTexto(p("menu-visao"));
  await avaliar("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");

  // Do resumo para as conversas abaixo da meta
  await clicar("button", "Ver essas conversas");
  await esperar("document.querySelector('main h1')?.innerText === 'Conversas' && document.querySelectorAll('main section button').length > 3", "lista de conversas");
  await tela(p("04-conversas-abaixo-da-meta"));
  await conferirTexto(p("conversas"));
  const filtros = await avaliar("[...document.querySelectorAll('[aria-label=\"Filtrar conversas\"] button')].map((b) => b.innerText.replace(/\\n/g, ' ')).join(' | ')");
  medidas.push(`${viewport}: filtros ${filtros}`);

  // Janela da conversa
  await clicar("main section button", "");
  await esperar("document.querySelector('[role=dialog]') && document.querySelector('[role=dialog]').innerText.includes('Avaliação por critério')");
  await sleep(500);
  await tela(p("05-conversa-avaliacao"));
  if (celular) {
    await clicar("[role=tab]", "Mensagens");
    await sleep(300);
    await tela(p("05-conversa-mensagens"));
  }
  await conferirTexto(p("janela-conversa"));
  await avaliar("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");

  // Atendentes: lista e fichas
  await clicar("nav button", "Atendentes");
  await esperar("document.querySelector('main h1')?.innerText === 'Atendentes'");
  await tela(p("06-atendentes"));
  await conferirTexto(p("atendentes"));
  await clicar("main section button", "Henrique");
  await esperar("document.body.innerText.includes('Conversas de Henrique')");
  await sleep(500);
  await tela(p("07-ficha-com-10-ou-mais"), { completa: true });
  await conferirTexto(p("ficha-henrique"));
  await clicar("main button", "Atendentes");
  await esperar("document.querySelector('main h1')?.innerText === 'Atendentes'");
  await clicar("main section button", "Ketren");
  await esperar("document.body.innerText.includes('Conversas de Ketren')");
  await sleep(500);
  await tela(p("08-ficha-amostra-pequena"), { completa: true });
  await conferirTexto(p("ficha-ketren"));

  // Mês sem publicação e período personalizado
  await abrir("/?tipo=mes");
  await tela(p("09-mes"));
  await conferirTexto(p("mes"));
  await abrir("/?de=2026-09-23&ate=2026-09-29", "document.body.innerText.includes('Ver essas conversas') || document.body.innerText.includes('Nenhuma conversa com nota')");
  medidas.push(`${viewport}: cabeçalho fixo no período personalizado ${await cabecalho()}px`);
  await tela(p("10-personalizado"), { completa: true });
  await conferirTexto(p("personalizado"));
}

try {
  await cdp("Page.enable");
  await rodar("desktop", 1280, 900, false);
  await rodar("celular", 390, 844, true);
} finally {
  ws.close();
  chrome.kill();
}

console.log(medidas.join("\n"));
if (problemas.length) {
  console.log(`\nPROBLEMAS (${problemas.length}):\n${problemas.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("\nSem termos proibidos nem rolagem horizontal. Prints em scratch/telas/.");
}

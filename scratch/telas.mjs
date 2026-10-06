// Prints das telas e verificação do texto, sem dependência: abre o Chrome sem janela e conversa com ele pelo DevTools.
// Uso: com o app no ar (pnpm web:dev), `node scratch/telas.mjs [http://localhost:3000]`. Os prints vão para scratch/telas/.
// Entra pelo /login com TELAS_EMAIL e TELAS_SENHA (crie o administrador de desenvolvimento com
// `pnpm user:admin -- --email ... --nome "..." --senha "..."`). Com TELAS_CADASTRO=1, também cadastra, desativa e
// reativa um usuário de teste por tamanho de tela (deixa essas linhas no banco a cada vez).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3000";
const EMAIL = process.env.TELAS_EMAIL;
const SENHA = process.env.TELAS_SENHA;
if (!EMAIL || !SENHA) throw new Error("Defina TELAS_EMAIL e TELAS_SENHA (o login é exigido até em desenvolvimento).");
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
const PROIBIDOS = [/\{\{/, /esteira/i, /\bcard\b/i, /\bcards\b/i, /\bTMR\b/, /\bFunil\b/, /espelho/i, /\bleva\b/i, /descartad/i, /\bjob\b/i, /\bCLI\b/, /\bgpt/i, /\bAtenção\b/, /\bFLW\b/];

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

/** Digita no campo (foco + texto como se fosse o teclado), no lugar do que já estiver nele. */
async function digitar(seletor, texto) {
  await avaliar(`(() => { const el = document.querySelector(${JSON.stringify(seletor)}); el.focus(); el.select?.(); })()`);
  await cdp("Input.insertText", { text: texto });
}

/** Telas de entrada, antes de haver sessão: o formulário, o erro de senha e a troca de senha obrigatória não são testados aqui. */
async function telasDeLogin(viewport, largura, altura, celular) {
  await cdp("Emulation.setDeviceMetricsOverride", { width: largura, height: altura, deviceScaleFactor: 1, mobile: celular });
  await abrir("/login", "document.querySelector('form input[name=email]')");
  await tela(`${viewport}-00-login`);
  await conferirTexto(`${viewport}-login`);
  await digitar("input[name=email]", EMAIL);
  await digitar("input[name=senha]", "senha-errada-123");
  await clicar("button[type=submit]", "Entrar");
  await esperar("document.querySelector('[role=alert]')", "mensagem de senha errada");
  await tela(`${viewport}-00-login-erro`);
  const msg = await avaliar("document.querySelector('[role=alert]').innerText");
  if (msg !== "E-mail ou senha incorretos.") problemas.push(`${viewport}-login: mensagem inesperada "${msg}"`);
  await conferirTexto(`${viewport}-login-erro`);
}

async function entrar() {
  await abrir("/login", "document.querySelector('form input[name=email]')");
  await digitar("input[name=email]", EMAIL);
  await digitar("input[name=senha]", SENHA);
  await clicar("button[type=submit]", "Entrar");
  await esperar("location.pathname === '/'", "entrar no painel");
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

  // Menu do usuário
  await avaliar("document.querySelector('header button[aria-label^=\"Conta de\"]').click()");
  await esperar("document.querySelector('[role=menu][aria-label=Conta]')");
  await tela(p("02-menu-usuario"));
  await conferirTexto(p("menu-usuario"));
  await avaliar("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");

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

  // Trocar senha (a pessoa já tem senha própria: pede a atual) e lista de usuários
  await abrir("/trocar-senha", "document.querySelector('form input[name=nova]')");
  await tela(p("11-trocar-senha"));
  await conferirTexto(p("trocar-senha"));
  await abrir("/usuarios");
  await tela(p("12-usuarios"));
  await conferirTexto(p("usuarios"));
  await avaliar("document.querySelector('main ul button[aria-haspopup=menu]').click()");
  await esperar("document.querySelector('[role=menu]')");
  await tela(p("13-usuarios-menu"));
  await conferirTexto(p("usuarios-menu"));
  await avaliar("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");

  // Resumos por e-mail: a seção no cadastro (tudo desmarcado) e na edição de quem já recebe, e o "Recebe: …" da lista.
  await clicar("main button", "Adicionar usuário");
  await esperar("document.querySelector('[role=dialog] fieldset')", "seção de resumos no cadastro");
  confere(p("cadastro: título da seção"), await avaliar("document.querySelector('[role=dialog] fieldset legend').innerText"), "Resumos por e-mail");
  confere(p("cadastro: nenhum escopo marcado"), await avaliar("document.querySelectorAll('[role=dialog] fieldset input[name=resumo]:checked').length"), 0);
  confere(p("cadastro: frequências (Semanal e Mensal marcadas, Diário não)"), await avaliar("[...document.querySelectorAll('[role=dialog] fieldset input[name=frequencia]:checked')].map((i) => i.value).join(',')"), "semana,mes");
  confere(p("cadastro: grupos do menu de visão"), await avaliar("[...document.querySelectorAll('[role=dialog] fieldset [role=group]')].map((g) => g.getAttribute('aria-label')).join(' | ')"), "Com que frequência | Geral | Divisões | Equipes | Painéis do CRM");
  confere(p("cadastro: caixas de frequência"), await avaliar("[...document.querySelectorAll('[role=dialog] fieldset input[name=frequencia]')].map((i) => i.parentElement.innerText.trim()).join(' | ')"), "Diário | Semanal | Mensal");
  await avaliar("document.querySelector('[role=dialog] fieldset').scrollIntoView({ block: 'center' })");
  await tela(p("14-usuarios-resumos-cadastro"));
  await conferirTexto(p("usuarios-resumos-cadastro"));
  await avaliar("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await esperar("!document.querySelector('[role=dialog]')");

  const recebe = await avaliar("[...document.querySelectorAll('main ul > li')].find((li) => li.innerText.includes('Recebe:'))?.innerText.split('\\n').find((l) => l.startsWith('Recebe:')) ?? null");
  if (recebe) {
    medidas.push(`${viewport}: ${recebe}`);
    await avaliar("[...document.querySelectorAll('main ul > li')].find((li) => li.innerText.includes('Recebe:')).querySelector('button[aria-haspopup=menu]').click()");
    await clicar("[role=menuitem]", "Editar");
    await esperar("document.querySelector('[role=dialog] fieldset')", "seção de resumos na edição");
    confere(p("edição: caixas marcadas = Recebe"), await avaliar("document.querySelectorAll('[role=dialog] fieldset input[name=resumo]:checked').length > 0"), true);
    await avaliar("document.querySelector('[role=dialog] fieldset').scrollIntoView({ block: 'center' })");
    await tela(p("14-usuarios-resumos-edicao"));
    await conferirTexto(p("usuarios-resumos-edicao"));
    // Troca os resumos e salva (as assinaturas mudam na mesma transação do cadastro); depois desfaz, para o banco ficar como estava.
    const alternar = (grupo, rotulo) =>
      avaliar(`(() => {
        const g = document.querySelector('[role=dialog] fieldset [role=group][aria-label=${JSON.stringify(grupo)}]');
        const l = [...g.querySelectorAll('label')].find((x) => x.innerText.trim() === ${JSON.stringify(rotulo)});
        l.querySelector('input').click();
        return l.querySelector('input').checked;
      })()`);
    const recebeDe = (nome) =>
      avaliar(`[...document.querySelectorAll('main ul > li')].find((li) => li.innerText.includes(${JSON.stringify(nome)}))?.innerText.split('\\n').find((l) => l.startsWith('Recebe:')) ?? null`);
    const nomeDe = await avaliar("[...document.querySelectorAll('main ul > li')].find((li) => li.innerText.includes('Recebe:')).querySelector('span.font-medium').innerText");
    const esperarRecebe = (texto) =>
      esperar(`[...document.querySelectorAll('main ul > li')].find((li) => li.innerText.includes(${JSON.stringify(nomeDe)}))?.innerText.includes(${JSON.stringify(texto)})`, `"${texto}" na lista`);
    const antes = recebe;
    const diario = () => avaliar("(() => { const i = document.querySelector('[role=dialog] fieldset input[name=frequencia][value=dia]'); i.click(); return i.checked; })()");
    await alternar("Equipes", "Vendas");
    await alternar("Geral", "Visão geral da operação");
    const diarioLigou = await diario();
    await clicar("[role=dialog] button[type=submit]", "Salvar");
    await esperar("!document.querySelector('[role=dialog]')", "salvar os resumos");
    await esperarRecebe("Recebe: Equipe Peças, Equipe Vendas");
    const depois = await recebeDe(nomeDe);
    confere(p("edição: salvar troca os resumos"), depois.split(" · ")[0], "Recebe: Equipe Peças, Equipe Vendas");
    confere(p("edição: a frequência escolhida aparece na lista"), diarioLigou === depois.includes("diário"), true);
    await avaliar(`[...document.querySelectorAll('main ul > li')].find((li) => li.innerText.includes(${JSON.stringify(nomeDe)})).querySelector('button[aria-haspopup=menu]').click()`);
    await clicar("[role=menuitem]", "Editar");
    await esperar("document.querySelector('[role=dialog] fieldset')");
    await alternar("Equipes", "Vendas");
    await alternar("Geral", "Visão geral da operação");
    await diario();
    await clicar("[role=dialog] button[type=submit]", "Salvar");
    await esperar("!document.querySelector('[role=dialog]')", "desfazer os resumos");
    await esperarRecebe(antes);
    confere(p("edição: desfazer volta ao que era"), await recebeDe(nomeDe), antes);
  } else {
    medidas.push(`${viewport}: ninguém recebe resumo por e-mail no banco de teste: marque alguém em /usuarios para conferir a edição`);
  }

  // O link do e-mail: o painel abre no escopo do endereço, e trocar o escopo atualiza o endereço.
  await abrir("/?escopo=equipe%3APe%C3%A7as", "document.querySelector('main button[aria-haspopup=menu]') && !document.body.innerText.includes('Carregando')");
  confere(p("link com escopo: título"), await avaliar("document.querySelector('main button[aria-haspopup=menu]').innerText.trim()"), "Peças");
  confere(p("link com escopo: endereço guarda o escopo"), await avaliar("new URLSearchParams(location.search).get('escopo')"), "equipe:Peças");
  await tela(p("15-link-escopo"));
  await conferirTexto(p("link-escopo"));
  await abrir("/?escopo=equipe%3AInexistente", "document.querySelector('main button[aria-haspopup=menu]') && !document.body.innerText.includes('Carregando')");
  confere(p("escopo que não existe: volta ao Geral"), await avaliar("document.querySelector('main button[aria-haspopup=menu]').innerText.trim()"), "Visão geral da operação");
  confere(p("escopo que não existe: sai do endereço"), await avaliar("new URLSearchParams(location.search).has('escopo')"), false);
  // Escopo que existe, mas está vazio no período (06/10 ainda não tem conversa avaliada): o menu de visão não o mostra, então abre o Geral.
  await abrir("/?de=2026-10-06&ate=2026-10-06&escopo=equipe%3APe%C3%A7as", "document.querySelector('main button[aria-haspopup=menu]') && !document.body.innerText.includes('Carregando')");
  confere(p("escopo vazio no período: volta ao Geral"), await avaliar("document.querySelector('main button[aria-haspopup=menu]').innerText.trim()"), "Visão geral da operação");
  confere(p("escopo vazio no período: sai do endereço"), await avaliar("new URLSearchParams(location.search).has('escopo')"), false);

  // Página técnica: o bloco "Resumos por e-mail" (termos técnicos são permitidos aqui, então sem conferirTexto).
  await abrir("/status", "document.body.innerText.includes('Resumos por e-mail')");
  await tela(p("16-status-resumos"), { completa: true });
  medidas.push(`${viewport}: status: ${(await avaliar("document.body.innerText.split('Resumos por e-mail')[1]")).trim().split('\n').slice(0, 4).join(' / ')}`);

  if (process.env.TELAS_CADASTRO) {
    const email = `teste+${Date.now()}@local.dev`;
    // Nome único: as pessoas de execuções anteriores continuam no banco, e o menu de ações é achado pelo nome.
    const nome = `Pessoa de Teste ${String(Date.now()).slice(-5)}`;
    await clicar("main button", "Adicionar usuário");
    await esperar("document.querySelector('[role=dialog] input[name=nome]')");
    await digitar("input[name=nome]", nome);
    await digitar("input[name=email]", email);
    await tela(p("14-usuarios-adicionar"));
    await conferirTexto(p("usuarios-adicionar"));
    await clicar("[role=dialog] button[type=submit]", "Adicionar");
    await esperar("document.querySelector('[role=dialog]')?.innerText.includes('Esta senha aparece só agora')", "senha provisória");
    const senhaProvisoria = await avaliar("document.querySelector('[role=dialog] code').innerText");
    await tela(p("15-usuarios-senha-provisoria"));
    await conferirTexto(p("usuarios-senha-provisoria"));
    await clicar("[role=dialog] button", "Pronto");
    await esperar("!document.querySelector('[role=dialog]')");
    await tela(p("16-usuarios-com-novo"));
    // Desativa a pessoa de teste: some da lista e vai para "Desativados".
    await avaliar(`document.querySelector(${JSON.stringify(`main ul button[aria-label="Ações de ${nome}"]`)}).click()`);
    await clicar("[role=menuitem]", "Desativar");
    await esperar(`document.querySelector('[role=dialog]')?.innerText.includes(${JSON.stringify(`Desativar ${nome}?`)})`);
    await tela(p("17-usuarios-desativar"));
    await clicar("[role=dialog] button", "Desativar");
    await esperar("document.body.innerText.includes('Desativados (')", "seção de desativados");
    await avaliar("document.querySelector('details summary').click()");
    await tela(p("18-usuarios-desativados"));
    await conferirTexto(p("usuarios-desativados"));
    if (!celular) {
      await fluxoDaPessoa(viewport, email, senhaProvisoria, nome);
    } else {
      // Reativar pela seção "Desativados": a senha continua a mesma, e a tela avisa.
      const linha = `[...document.querySelectorAll("details li")].find((li) => li.innerText.includes(${JSON.stringify(email)}))`;
      await avaliar(`${linha}.querySelector("button").click()`);
      await esperar("document.querySelector('[role=status]')", "aviso de reativação");
      confere("reativar pela lista avisa", await avaliar("document.querySelector('[role=status]').innerText"), `Acesso de ${nome} reativado. A senha continua a mesma de antes.`);
      await tela(p("19-usuarios-reativado"));
      await conferirTexto(p("usuarios-reativado"));
    }
  }
}

const sair = async () => {
  // Quem ainda tem a senha provisória sai pelo botão da própria tela de troca.
  if (await avaliar("location.pathname === '/trocar-senha'")) {
    await clicar("button[type=submit]", "Sair");
    await esperar("location.pathname === '/login'", "sair da troca de senha");
    return;
  }
  // Só o painel tem o menu da conta.
  if (!(await avaliar("Boolean(document.querySelector('header button[aria-label^=\"Conta de\"]'))"))) {
    await abrir("/", "document.querySelector('header button[aria-label^=\"Conta de\"]')");
  }
  await avaliar("document.querySelector('header button[aria-label^=\"Conta de\"]')?.click()");
  await clicar("[role=menuitem]", "Sair");
  await esperar("location.pathname === '/login'", "sair");
};

/** Tenta entrar e devolve a mensagem de erro (ou null se entrou). */
async function tentar(email, senha) {
  await abrir("/login", "document.querySelector('form input[name=email]')");
  await digitar("input[name=email]", email);
  await digitar("input[name=senha]", senha);
  await clicar("button[type=submit]", "Entrar");
  await esperar("document.querySelector('[role=alert]') || location.pathname !== '/login'", "resposta do login");
  return avaliar("document.querySelector('[role=alert]')?.innerText ?? null");
}

const confere = (rotulo, obtido, esperado) => {
  if (obtido !== esperado) problemas.push(`${rotulo}: veio ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
  else medidas.push(`ok: ${rotulo}`);
};

/** A vida de uma pessoa cadastrada: desativada, reativada, primeiro acesso, bloqueio e senha provisória nova. */
async function fluxoDaPessoa(viewport, email, provisoria, nome) {
  const p = (n) => `${viewport}-${n}`;
  const nova = "nova-senha-123";
  const admin = () => entrar();
  const linhaDaPessoa = (seletor) => `[...document.querySelectorAll(${JSON.stringify(seletor)})].find((li) => li.innerText.includes(${JSON.stringify(email)}))`;

  // Desativada: com a senha certa vê o aviso; com a errada, a mensagem de sempre.
  await sair();
  confere("desativado com a senha certa", await tentar(email, provisoria), "Seu acesso está desativado. Fale com o administrador.");
  await tela(p("19-login-desativado"));
  confere("desativado com a senha errada", await tentar(email, "outra-senha-qualquer"), "E-mail ou senha incorretos.");

  // O administrador tenta cadastrar o mesmo e-mail e reativa por ali: só o aviso, sem janela de senha provisória.
  await admin();
  await abrir("/usuarios");
  await clicar("main button", "Adicionar usuário");
  await esperar("document.querySelector('[role=dialog] input[name=nome]')");
  await digitar("input[name=nome]", nome);
  await digitar("input[name=email]", email);
  await clicar("[role=dialog] button[type=submit]", "Adicionar");
  await esperar("document.querySelector('[role=dialog]')?.innerText.includes('que está desativado')", "oferta de reativar");
  await tela(p("19b-usuarios-email-desativado"));
  await clicar("[role=dialog] button", "Reativar");
  await esperar("!document.querySelector('[role=dialog]') && document.querySelector('[role=status]')", "aviso de reativação");
  confere("reativar pelo cadastro avisa, sem senha provisória", await avaliar("document.querySelector('[role=status]').innerText"), `Acesso de ${nome} reativado. A senha continua a mesma de antes.`);
  await esperar(`!${linhaDaPessoa("details li")}`, "pessoa fora de Desativados");
  await esperar(`${linhaDaPessoa("main ul > li")}`, "pessoa de volta à lista");
  await tela(p("19c-usuarios-reativado"));

  // Primeiro acesso: a senha provisória leva à criação da própria senha.
  await sair();
  await tentar(email, provisoria);
  await esperar("location.pathname === '/trocar-senha'", "troca obrigatória");
  await tela(p("20-primeiro-acesso"));
  await conferirTexto(p("primeiro-acesso"));
  await digitar("input[name=nova]", nova);
  await digitar("input[name=confirmacao]", nova);
  await clicar("button[type=submit]", "Salvar senha");
  await esperar("location.pathname === '/'", "painel depois de criar a senha");
  await esperar("document.querySelector('header')");
  await avaliar("document.querySelector('header button[aria-label^=\"Conta de\"]').click()");
  await esperar("document.querySelector('[role=menu][aria-label=Conta]')");
  confere("quem não é administrador não vê Usuários", await avaliar("!document.querySelector('[role=menu][aria-label=Conta]').innerText.includes('Usuários')"), true);
  await tela(p("21-menu-usuario-comum"));
  await avaliar("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await abrir("/usuarios", "document.querySelector('main')");
  await esperar("location.pathname === '/'", "usuário comum volta ao painel");
  await sair();

  // A senha criada vale; 5 erros bloqueiam, e até a senha certa fica de fora por 15 minutos.
  confere("entra com a senha nova", await tentar(email, nova), null);
  await sair();
  for (let i = 1; i <= 4; i++) await tentar(email, `errada-${i}-xxxx`);
  confere("5º erro bloqueia", await tentar(email, "errada-5-xxxx"), "Muitas tentativas. Tente de novo em 15 minutos.");
  await tela(p("22-login-bloqueado"));
  confere("senha certa durante o bloqueio", await tentar(email, nova), "Muitas tentativas. Tente de novo em 15 minutos.");

  // O administrador vê o bloqueio e gera uma senha provisória, que desbloqueia.
  await admin();
  await abrir("/usuarios");
  await esperar("document.body.innerText.includes('Bloqueado por tentativas')", "aviso de bloqueio");
  await tela(p("23-usuarios-bloqueado"));
  await avaliar(`${linhaDaPessoa("main ul > li")}.querySelector("button[aria-haspopup=menu]").click()`);
  await clicar("[role=menuitem]", "Gerar nova senha provisória");
  await esperar("document.querySelector('[role=dialog]')?.innerText.includes('A senha atual deixa de valer')", "confirmação da senha nova");
  await tela(p("24-usuarios-gerar-senha"));
  await conferirTexto(p("usuarios-gerar-senha"));
  await clicar("[role=dialog] button", "Gerar senha");
  await esperar("document.querySelector('[role=dialog] code')", "senha provisória nova");
  const outra = await avaliar("document.querySelector('[role=dialog] code').innerText");
  await clicar("[role=dialog] button", "Pronto");
  await sair();
  await tentar(email, outra);
  await esperar("location.pathname === '/trocar-senha'", "desbloqueado pela senha provisória");
  await sair();
  confere("a senha anterior não entra mais", await tentar(email, nova), "E-mail ou senha incorretos.");
  await admin();
}

try {
  await cdp("Page.enable");
  await telasDeLogin("desktop", 1280, 900, false);
  await telasDeLogin("celular", 390, 844, true);
  await entrar();
  await rodar("desktop", 1280, 900, false);
  await rodar("celular", 390, 844, true);
} catch (e) {
  await tela("erro").catch(() => {});
  console.log("Onde parou:", await avaliar("location.href + ' :: ' + document.body.innerText.slice(0, 300)").catch(() => "?"));
  throw e;
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

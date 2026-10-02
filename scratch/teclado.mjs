// Confere o teclado nos menus: o foco vai para o item escolhido, as setas navegam e Esc fecha devolvendo o foco.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const port = 9900;
const chrome = spawn(process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", [`--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "tec-"))}`, "--headless=new", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let url;
for (let i = 0; i < 60 && !url; i++) { try { url = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch {} await sleep(250); }
const ws = new WebSocket(url); await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let n = 0; const p = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { p.get(m.id)(m.result); p.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((ok) => { const id = ++n; p.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x) => (await cdp("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result.value;
const tecla = async (key) => { for (const type of ["keyDown", "keyUp"]) await cdp("Input.dispatchKeyEvent", { type, key, code: key }); await sleep(100); };
const ativo = () => ev("(() => { const a = document.activeElement; return a ? String(a.getAttribute('role') || a.tagName) + ':' + String(a.textContent).slice(0, 25) : 'nenhum' })()");
await cdp("Page.navigate", { url: "http://localhost:3000/" });
for (let i = 0; i < 80 && !(await ev("document.body.innerText.includes('Ver essas conversas')")); i++) await sleep(250);
await ev("document.querySelector('header button[aria-haspopup=menu]').focus()");
await ev("document.querySelector('header button[aria-haspopup=menu]').click()"); await sleep(300);
console.log("menu aberto, foco em:", await ativo());
await tecla("ArrowDown"); console.log("depois de ArrowDown:", await ativo());
await tecla("End"); console.log("depois de End:", await ativo());
await tecla("Escape"); console.log("depois de Esc, menu aberto?", await ev("!!document.querySelector('[role=menu]')"), "foco em:", await ativo());
chrome.kill(); ws.close();

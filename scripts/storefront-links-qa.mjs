import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const origin = process.env.STOREFRONT_URL || "https://herliyah-store-staging.aishaonola.workers.dev";
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const profile = await mkdtemp(join(tmpdir(), "herliyah-links-edge-"));
const port = 9233;
const browser = spawn(edge, ["--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let version;
for (let attempt = 0; attempt < 60; attempt += 1) { try { version = await fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.json()); break; } catch { await sleep(100); } }
if (!version) throw new Error("Edge debugging endpoint did not start");
const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let commandId = 0;
const pending = new Map();
const errors = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") errors.push(message.params.entry.text);
  if (!message.id) return;
  const callback = pending.get(message.id);
  if (!callback) return;
  pending.delete(message.id);
  message.error ? callback.reject(new Error(`${callback.method} ${callback.expression || ""}: ${message.error.message}`)) : callback.resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++commandId; pending.set(id, { resolve, reject, method, expression: params.expression?.slice(0, 120) }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;
const waitFor = async (expression) => { for (let attempt = 0; attempt < 100; attempt += 1) { if (await evaluate(expression)) return; await sleep(100); } throw new Error(`Timed out: ${expression}`); };
const go = async (path) => { await send("Page.navigate", { url: origin + path }); await waitFor(`document.querySelector('.site-shell') && !document.querySelector('.loading-state')`); };
const pointerClick = async (selector) => {
  await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`);
  await sleep(600);
  const rect = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)return null; const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,text:e.textContent.trim(),href:e.getAttribute('href')}; })()`);
  if (!rect) throw new Error(`Missing ${selector}`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  await sleep(500);
  return rect;
};
const results = [];
const expectPathClick = async (from, selector, expected, usePointer = true) => {
  await go(from);
  const targetInfo = usePointer
    ? await pointerClick(selector)
    : await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); return {text:e?.textContent.trim()||'',href:e?.getAttribute('href')||''}; })()`);
  if (!usePointer) await evaluate(`document.querySelector(${JSON.stringify(selector)})?.click()`);
  await waitFor(`location.pathname === ${JSON.stringify(expected)} && !document.querySelector('.loading-state')`);
  results.push({ from, target: targetInfo.text || targetInfo.href, expected, actual: await evaluate(`location.pathname`), passed: true });
};

await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 850, deviceScaleFactor: 1, mobile: false });
await expectPathClick("/shop", ".wordmark", "/");
await expectPathClick("/", '.desktop-nav a[href="/shop"]', "/shop");
await expectPathClick("/", '.desktop-nav a[href="/track"]', "/track");
await expectPathClick("/", '.header-actions a[href="/account"]', "/account");
await expectPathClick("/", '.header-actions a[href="/cart"]', "/cart");
await expectPathClick("/", 'footer a[href="/shop"]', "/shop", false);
await expectPathClick("/", 'footer a[href="/track"]', "/track", false);

await go("/shop");
await evaluate(`localStorage.removeItem('herliyah-preview-wishlist-v1')`);
await evaluate(`document.querySelector('.product-card .heart')?.click()`);
await waitFor(`JSON.parse(localStorage.getItem('herliyah-preview-wishlist-v1')||'[]').length === 1`);
await pointerClick('.header-actions a[href="/wishlist"]');
await waitFor(`location.pathname === '/wishlist' && Boolean(document.querySelector('.product-card'))`);
results.push({ target: "wishlist action and link", expected: "/wishlist", actual: await evaluate(`location.pathname`), passed: true });

await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
const storefrontErrorCount = errors.length;
await go("/");
await evaluate(`document.querySelector('button[aria-label="Open menu"]')?.click()`);
await waitFor(`Boolean(document.querySelector('.mobile-menu'))`);
await evaluate(`document.querySelector('button[aria-label="Close menu"]')?.click()`);
await waitFor(`!document.querySelector('.mobile-menu')`);
results.push({ target: "mobile menu open and close", passed: true });
for (const [href, expected] of [["/shop", "/shop"], ["/wishlist", "/wishlist"], ["/track", "/track"], ["/account", "/account"]]) {
  await go("/");
  await evaluate(`document.querySelector('button[aria-label="Open menu"]')?.click()`);
  await waitFor(`Boolean(document.querySelector('.mobile-menu'))`);
  await pointerClick(`.mobile-menu a[href="${href}"]`);
  await waitFor(`location.pathname === ${JSON.stringify(expected)} && !document.querySelector('.loading-state')`);
  results.push({ target: `mobile ${href}`, expected, actual: await evaluate(`location.pathname`), passed: true });
}

await go("/");
await evaluate(`document.querySelector('footer a[href="/admin"]')?.click()`);
await sleep(1500);
const adminDestination = await evaluate(`({href:location.href,body:document.body.innerText.slice(0,240)})`);
results.push({ target: "footer owner access", expected: "/admin or Cloudflare Access", actual: adminDestination.href, detail: adminDestination.body, passed: adminDestination.href !== `${origin}/` });

socket.close(); browser.kill();
await Promise.race([new Promise((resolve) => browser.once("exit", resolve)), sleep(1000)]);
try { await rm(profile, { recursive: true, force: true }); } catch {}
const failures = results.filter((result) => !result.passed);
console.log(JSON.stringify({ checked: results.length, failures: failures.length, storefrontErrors: errors.slice(0, storefrontErrorCount), accessPageErrors: errors.slice(storefrontErrorCount), results }, null, 2));
process.exitCode = failures.length || storefrontErrorCount ? 1 : 0;

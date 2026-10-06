import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const origin = process.env.PREVIEW_URL || "http://127.0.0.1:5173";
const out = join(process.cwd(), ".visual-qa", "product-mobile");
const profile = await mkdtemp(join(tmpdir(), "herliyah-product-edge-"));
const port = 9224;
await mkdir(out, { recursive: true });
const browser = spawn(edge, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let version;
for (let attempt = 0; attempt < 40; attempt++) { try { version = await fetch(`http://127.0.0.1:${port}/json/version`).then(res => res.json()); break; } catch { await sleep(100); } }
if (!version) throw new Error("Edge debugging endpoint did not start");
const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then(res => res.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let commandId = 0;
const pending = new Map();
const browserErrors = [];
socket.addEventListener("message", event => { const message = JSON.parse(event.data); if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails.text); if (message.method === "Log.entryAdded" && message.params.entry.level === "error") browserErrors.push(message.params.entry.text); if (!message.id) return; const callback = pending.get(message.id); if (!callback) return; pending.delete(message.id); message.error ? callback.reject(new Error(message.error.message)) : callback.resolve(message.result); });
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++commandId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");

const cases = [
  { slug: "amara-drape-dress", label: "amara" },
  { slug: "tomi-skirt-set", label: "shortest-name" },
  { slug: "eniola-wide-trouser", label: "longest-name" },
];
const results = [];
for (const width of [360, 390]) {
  for (const product of cases) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: width === 360 ? 780 : 844, deviceScaleFactor: 1, mobile: true });
    await send("Page.navigate", { url: `${origin}/product/${product.slug}` });
    for (let attempt = 0; attempt < 20; attempt++) { const ready = await send("Runtime.evaluate", { returnByValue: true, expression: `!document.querySelector('.loading-state') && document.querySelector('.product-info') !== null` }); if (ready.result.value) break; await sleep(150); }
    await send("Runtime.evaluate", { expression: "localStorage.clear()" });
    await send("Page.reload");
    for (let attempt = 0; attempt < 20; attempt++) { const ready = await send("Runtime.evaluate", { returnByValue: true, expression: `!document.querySelector('.loading-state') && document.querySelector('.purchase-actions') !== null` }); if (ready.result.value) break; await sleep(150); }
    await sleep(150);
    const interaction = await send("Runtime.evaluate", { returnByValue: true, awaitPromise: true, expression: `(async () => {
      const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      const colorButtons=[...document.querySelectorAll('.option-row button')];
      for (const button of colorButtons) { button.click(); await wait(40); }
      const sizeButtons=[...document.querySelectorAll('.size-row button:not(:disabled)')];
      for (const button of sizeButtons) { button.click(); await wait(35); }
      const guide=document.querySelector('.size-guide-link'); guide.click(); await wait(50);
      const guideOpened=Boolean(document.querySelector('.size-guide-note')); guide.click(); await wait(50);
      const quantity=document.querySelector('#product-quantity');
      const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; setter.call(quantity,'2'); quantity.dispatchEvent(new Event('change',{bubbles:true})); await wait(50);
      document.querySelector('.purchase-actions .icon-button').click(); await wait(50);
      document.querySelector('.purchase-actions .button').click(); await wait(100);
      const controls=[...document.querySelectorAll('.option-row button,.size-row button,.quantity-row select,.purchase-actions button')].map(el=>{const r=el.getBoundingClientRect();return{label:el.textContent?.trim()||el.getAttribute('aria-label'),left:r.left,right:r.right,width:r.width,height:r.height}});
      return {
        title:document.querySelector('.product-info h1')?.textContent,
        viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,
        controls,clipped:controls.filter(c=>c.left<0||c.right>innerWidth+1||c.width<=0),
        guideOpened,guideClosed:!document.querySelector('.size-guide-note'),quantity:quantity.value,
        wishlist:JSON.parse(localStorage.getItem('herliyah-preview-wishlist-v1')||'[]'),
        cart:JSON.parse(localStorage.getItem('herliyah-preview-cart-v1')||'[]'),
        message:document.querySelector('.inline-message')?.textContent,
        selectedColor:document.querySelector('.option-row .selected')?.textContent,
        selectedSize:document.querySelector('.size-row .selected')?.textContent,
      };
    })()` });
    if (interaction.exceptionDetails || !interaction.result?.value) throw new Error(`Product interaction failed: ${JSON.stringify(interaction.exceptionDetails ?? interaction)}`);
    const data = interaction.result.value;
    const metrics = await send("Page.getLayoutMetrics");
    const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.ceil(metrics.cssContentSize.height), scale: 1 } });
    await writeFile(join(out, `full-${width}-${product.label}.png`), Buffer.from(shot.data, "base64"));
    const passed = !data.overflow && data.clipped.length === 0 && data.guideOpened && data.guideClosed && data.quantity === "2" && data.wishlist.length === 1 && data.cart.length === 1 && /added to your bag/i.test(data.message || "") && data.selectedColor && data.selectedSize;
    results.push({ width, product: product.slug, passed, ...data });
  }
}
await writeFile(join(out, "results.json"), JSON.stringify({ results, browserErrors }, null, 2));
socket.close(); browser.kill();
await Promise.race([new Promise(resolve => browser.once("exit", resolve)), sleep(1000)]);
try { await rm(profile, { recursive: true, force: true }); } catch {}
const failures = results.filter(result => !result.passed);
console.log(JSON.stringify({ checked: results.length, failures: failures.length, browserErrors, details: failures }, null, 2));
process.exitCode = failures.length || browserErrors.length ? 1 : 0;

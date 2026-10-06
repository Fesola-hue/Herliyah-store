import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const origin = process.env.PREVIEW_URL || "http://127.0.0.1:4173";
const out = join(process.cwd(), ".visual-qa");
const profile = await mkdtemp(join(tmpdir(), "herliyah-edge-"));
const port = 9223;
await mkdir(out, { recursive: true });
const browser = spawn(edge, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let version;
for (let attempt = 0; attempt < 40; attempt++) {
  try { version = await fetch(`http://127.0.0.1:${port}/json/version`).then((res) => res.json()); break; } catch { await sleep(100); }
}
if (!version) throw new Error("Edge debugging endpoint did not start");
const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then((res) => res.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
let commandId = 0;
const pending = new Map();
const browserErrors = [];
socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); if (message.method === "Runtime.exceptionThrown") browserErrors.push(message.params.exceptionDetails.text); if (message.method === "Log.entryAdded" && message.params.entry.level === "error") browserErrors.push(message.params.entry.text); if (!message.id) return; const callback = pending.get(message.id); if (!callback) return; pending.delete(message.id); message.error ? callback.reject(new Error(message.error.message)) : callback.resolve(message.result); });
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++commandId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
await send("Page.navigate", { url: `${origin}/` }); await sleep(2500);

const routes = ["/", "/shop/", "/product/ivie-tailored-set/", "/cart/", "/checkout/", "/account/", "/wishlist/", "/track/"];
const viewports = [{ width: 360, height: 780 }, { width: 390, height: 844 }, { width: 768, height: 900 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }];
const results = [];
for (const viewport of viewports) {
  for (const route of routes) {
    await send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width <= 390 });
    await send("Page.navigate", { url: `${origin}${route}` });
    for (let attempt = 0; attempt < 20; attempt++) {
      const ready = await send("Runtime.evaluate", { returnByValue: true, expression: `!document.querySelector('.loading-state') && document.querySelector('.site-shell') !== null` });
      if (ready.result.value) break;
      await sleep(150);
    }
    await sleep(250);
    const evaluation = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
      const visible = (el) => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
      const header = document.querySelector('header');
      const brand = header?.querySelector(':scope > .wordmark');
      const mobileMenu = header?.querySelector('.mobile-only');
      const desktopNav = header?.querySelector('.desktop-nav');
      const selectors = ['.hero-copy','.section-heading','.page-intro','.product-info','.cart-layout','.checkout-layout','.account-grid','.tracking-shell'];
      const boxes = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]).filter(visible).map((el) => { const r=el.getBoundingClientRect(); return {selector:el.className,left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width)}; });
      const br = brand?.getBoundingClientRect();
      return { title:document.title, path:location.pathname, viewport:innerWidth, scrollWidth:document.documentElement.scrollWidth, overflow:document.documentElement.scrollWidth > innerWidth + 1, brandCenterDelta:br?Math.round((br.left+br.width/2)-innerWidth/2):null, brandWrap:brand?brand.getClientRects().length>1:null, mobileMenuVisible:visible(mobileMenu), desktopNavVisible:visible(desktopNav), clipped:boxes.filter((box)=>box.left < -1 || box.right > innerWidth + 1), boxes };
    })()` });
    const data = evaluation.result.value;
    const slug = route === "/" ? "home" : route.split("/").filter(Boolean).join("-");
    if (viewport.width <= 390) {
      const metrics = await send("Page.getLayoutMetrics");
      const contentHeight = Math.ceil(metrics.cssContentSize.height);
      const fullShot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: true, clip: { x: 0, y: 0, width: viewport.width, height: contentHeight, scale: 1 } });
      await writeFile(join(out, `full-${viewport.width}-${slug}.png`), Buffer.from(fullShot.data, "base64"));
      if (["home","shop","product-ivie-tailored-set"].includes(slug)) {
        const initialShot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
        await writeFile(join(out, `initial-${viewport.width}-${slug}.png`), Buffer.from(initialShot.data, "base64"));
      }
    } else {
      const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
      await writeFile(join(out, `${viewport.width}-${slug}.png`), Buffer.from(shot.data, "base64"));
      if (slug === "home") {
        const metrics = await send("Page.getLayoutMetrics");
        const contentHeight = Math.ceil(metrics.cssContentSize.height);
        const fullShot = await send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: true, clip: { x: 0, y: 0, width: viewport.width, height: contentHeight, scale: 1 } });
        await writeFile(join(out, `full-${viewport.width}-${slug}.png`), Buffer.from(fullShot.data, "base64"));
      }
    }
    results.push({ route, ...viewport, ...data });
  }
}
const interactionResults = [];
for (const width of [390, 1440]) {
  await send("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 900, deviceScaleFactor: 1, mobile: width === 390 });
  await send("Page.navigate", { url: `${origin}/` }); await sleep(250);
  await send("Runtime.evaluate", { expression: "localStorage.clear()" });
  await send("Page.navigate", { url: `${origin}/product/ivie-tailored-set/` }); await sleep(500);
  await send("Runtime.evaluate", { expression: `document.querySelector('.size-row button:not(:disabled)')?.click()` }); await sleep(150);
  await send("Runtime.evaluate", { expression: `[...document.querySelectorAll('button')].find(el=>el.textContent?.trim()==='Add to bag')?.click()` }); await sleep(150);
  const add = await send("Runtime.evaluate", { returnByValue: true, expression: `({message:document.querySelector('.inline-message')?.textContent,cart:JSON.parse(localStorage.getItem('herliyah-preview-cart-v1')||'[]')})` });
  await send("Page.navigate", { url: `${origin}/cart/` }); await sleep(500);
  const cartBeforeReload = await send("Runtime.evaluate", { returnByValue: true, expression: `({rows:document.querySelectorAll('.cart-row').length,count:document.querySelector('a[aria-label^="Bag"] span')?.textContent})` });
  await send("Page.reload"); await sleep(500);
  const cartAfterReload = await send("Runtime.evaluate", { returnByValue: true, expression: `({rows:document.querySelectorAll('.cart-row').length,count:document.querySelector('a[aria-label^="Bag"] span')?.textContent})` });
  await send("Page.navigate", { url: `${origin}/shop/` }); await sleep(500);
  const filter = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => { const input=document.querySelector('input[aria-label="Search designs"]'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'Ivie'); input.dispatchEvent(new Event('input',{bubbles:true})); return new Promise(resolve=>setTimeout(()=>resolve({cards:document.querySelectorAll('.product-grid .product-card').length,name:document.querySelector('.product-grid .product-card h3')?.textContent}),100)); })()`, awaitPromise: true });
  let filterPanel = { skipped: true };
  if (width === 390) {
    filterPanel = await send("Runtime.evaluate", { returnByValue: true, expression: `(async () => {
      const search=document.querySelector('input[aria-label="Search designs"]');
      const searchSetter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      searchSetter.call(search,''); search.dispatchEvent(new Event('input',{bubbles:true})); await new Promise(r=>setTimeout(r,100));
      document.querySelector('.filter-trigger')?.click(); await new Promise(r=>setTimeout(r,100));
      const select=document.querySelector('.filter-sheet-fields select');
      const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;
      setter.call(select,'Sets'); select.dispatchEvent(new Event('change',{bubbles:true}));
      [...document.querySelectorAll('.filter-sheet-footer button')].find(el=>el.textContent?.trim()==='Apply')?.click(); await new Promise(r=>setTimeout(r,120));
      const applied={cards:document.querySelectorAll('.product-grid .product-card').length,chip:document.querySelector('.active-filters button')?.textContent};
      document.querySelector('.active-filters button')?.click(); await new Promise(r=>setTimeout(r,120));
      return {applied,cardsAfterClear:document.querySelectorAll('.product-grid .product-card').length,panelClosed:!document.querySelector('.filter-sheet')};
    })()`, awaitPromise: true }).then(x=>x.result.value);
  }
  const passed = add.result.value.cart.length === 1 && /added to your bag/i.test(add.result.value.message || "") && cartBeforeReload.result.value.rows === 1 && cartAfterReload.result.value.rows === 1 && cartAfterReload.result.value.count === "1" && filter.result.value.cards === 1 && /Ivie/.test(filter.result.value.name || "") && (width !== 390 || (filterPanel.applied.cards === 2 && /Sets/.test(filterPanel.applied.chip || "") && filterPanel.cardsAfterClear === 10 && filterPanel.panelClosed));
  interactionResults.push({ width, passed, add: add.result.value, cartBeforeReload: cartBeforeReload.result.value, cartAfterReload: cartAfterReload.result.value, filter: filter.result.value, filterPanel });
}
await writeFile(join(out, "results.json"), JSON.stringify(results, null, 2));
const failures = results.filter((result) => result.overflow || result.brandWrap || Math.abs(result.brandCenterDelta ?? 999) > 2 || result.clipped.length || (result.width <= 768 ? !result.mobileMenuVisible || result.desktopNavVisible : result.mobileMenuVisible || !result.desktopNavVisible));
const labels = viewports.map((viewport) => `<th>${viewport.width}px</th>`).join("");
const rows = routes.map((route) => { const slug=route==="/"?"home":route.split("/").filter(Boolean).join("-"); return `<tr><th>${route}</th>${viewports.map((viewport)=>`<td><img src="${viewport.width <= 390 ? `full-${viewport.width}-${slug}.png` : `${viewport.width}-${slug}.png`}" alt="${route} at ${viewport.width}px"></td>`).join("")}</tr>`; }).join("");
await writeFile(join(out, "report.html"), `<!doctype html><meta charset="utf-8"><title>HERLIYAH visual QA</title><style>body{margin:0;background:#ddd;font:12px Arial}table{border-collapse:collapse;width:100%}th{position:sticky;top:0;background:#222;color:white;padding:8px;z-index:2}td{padding:5px;border:1px solid #aaa;vertical-align:top}img{display:block;width:100%;height:280px;object-fit:contain;object-position:top;background:white}tr>th{position:sticky;left:0;min-width:130px}</style><table><thead><tr><th>Route</th>${labels}</tr></thead><tbody>${rows}</tbody></table>`);
socket.close(); browser.kill();
await Promise.race([new Promise((resolve) => browser.once("exit", resolve)), sleep(1000)]);
try { await rm(profile, { recursive: true, force: true }); } catch { /* Edge may retain a crash-metrics handle briefly on Windows. */ }
console.log(JSON.stringify({ checked: results.length, failures: failures.length, browserErrors, interactions: interactionResults, details: failures }, null, 2));
process.exitCode = failures.length || browserErrors.length || interactionResults.some((result) => !result.passed) ? 1 : 0;

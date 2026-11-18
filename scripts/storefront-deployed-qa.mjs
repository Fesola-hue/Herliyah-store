import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const origin =
  process.env.STOREFRONT_URL ||
  "https://herliyah-store-staging.aishaonola.workers.dev";
const edge =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const profile = await mkdtemp(join(tmpdir(), "herliyah-storefront-edge-"));
const port = 9231;
const browser = spawn(
  edge,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let version;
for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    version = await fetch(`http://127.0.0.1:${port}/json/version`).then(
      (response) => response.json(),
    );
    break;
  } catch {
    await sleep(100);
  }
}
if (!version) throw new Error("Edge debugging endpoint did not start");
const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
  method: "PUT",
}).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let commandId = 0;
const pending = new Map();
const errors = [];
const failedRequests = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown")
    errors.push(message.params.exceptionDetails);
  if (
    message.method === "Log.entryAdded" &&
    message.params.entry.level === "error"
  )
    errors.push(message.params.entry);
  if (message.method === "Network.loadingFailed")
    failedRequests.push(message.params);
  if (!message.id) return;
  const callback = pending.get(message.id);
  if (!callback) return;
  pending.delete(message.id);
  message.error
    ? callback.reject(new Error(message.error.message))
    : callback.resolve(message.result);
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++commandId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const waitFor = async (expression, attempts = 80) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return true;
    await sleep(100);
  }
  return false;
};
const pointerClick = async (selector) => {
  const rect = await evaluate(
    `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2, text:e.textContent.trim(), tag:e.tagName, href:e.getAttribute('href') }; })()`,
  );
  if (!rect) throw new Error(`Missing click target: ${selector}`);
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: rect.x,
    y: rect.y,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: rect.x,
    y: rect.y,
    button: "left",
    clickCount: 1,
  });
  await sleep(750);
  return {
    target: rect,
    after: await evaluate(
      `({ url:location.href, title:document.querySelector('h1')?.textContent || '', body:document.body.innerText.slice(0,300) })`,
    ),
  };
};

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await send("Page.navigate", { url: origin });
await waitFor(
  `document.querySelector('.hero a.button') && document.querySelector('.loading-state') === null`,
);
const hydration = await evaluate(`({
  url: location.href,
  ready: document.readyState,
  scripts: [...document.scripts].map(s => ({src:s.src,type:s.type})),
  shopLink: (() => { const e=document.querySelector('.hero a.button'); const r=e?.getBoundingClientRect(); return e ? {href:e.href,tag:e.tagName,text:e.textContent.trim(),rect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,topAtCenter:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.outerHTML.slice(0,200)} : null; })()
})`);
const shop = await pointerClick(".hero a.button");
await send("Page.navigate", { url: `${origin}/shop` });
await waitFor(
  `document.querySelector('.product-card a') && document.querySelector('.loading-state') === null`,
);
const product = await pointerClick(".product-card a");
const productUrl = product.after.url;
await send("Page.navigate", { url: productUrl });
await waitFor(
  `document.querySelector('.product-info') && document.querySelector('.loading-state') === null`,
);
const directProduct = await evaluate(
  `({url:location.href,title:document.querySelector('h1')?.textContent})`,
);
await evaluate(`history.back()`);
await sleep(750);
const back = await evaluate(
  `({url:location.href,title:document.querySelector('h1')?.textContent})`,
);
await send("Page.reload", { ignoreCache: true });
await waitFor(`document.querySelector('.loading-state') === null`);
const refresh = await evaluate(
  `({url:location.href,title:document.querySelector('h1')?.textContent})`,
);

console.log(
  JSON.stringify(
    {
      origin,
      hydration,
      clicks: { shop, product },
      directProduct,
      back,
      refresh,
      errors,
      failedRequests,
    },
    null,
    2,
  ),
);
socket.close();
browser.kill();
await Promise.race([
  new Promise((resolve) => browser.once("exit", resolve)),
  sleep(1000),
]);
try {
  await rm(profile, { recursive: true, force: true });
} catch {}

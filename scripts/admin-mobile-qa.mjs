import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const origin = process.env.PREVIEW_URL || "http://127.0.0.1:5173";
const edge =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const out = join(process.cwd(), ".visual-qa", "admin-mobile");
const profile = await mkdtemp(join(tmpdir(), "herliyah-admin-edge-"));
const port = 9228;
await mkdir(out, { recursive: true });
const browser = spawn(
  edge,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let version;
for (let attempt = 0; attempt < 50; attempt += 1) {
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
const browserErrors = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.exceptionThrown")
    browserErrors.push(
      message.params.exceptionDetails.exception?.description ||
        message.params.exceptionDetails.text,
    );
  if (
    message.method === "Log.entryAdded" &&
    message.params.entry.level === "error"
  )
    browserErrors.push(message.params.entry.text);
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
const evaluate = async (expression) =>
  (
    await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
  ).result.value;
const waitFor = async (expression) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await evaluate(expression)) return true;
    await sleep(120);
  }
  return false;
};
const screenshot = async (name) => {
  const shot = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(join(out, name), Buffer.from(shot.data, "base64"));
};

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
const results = [];
for (const width of [375, 390, 430, 1280]) {
  const mobile = width < 640;
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height: mobile ? 844 : 900,
    deviceScaleFactor: 1,
    mobile,
  });
  await send("Page.navigate", { url: `${origin}/admin` });
  await sleep(250);
  await evaluate(
    `sessionStorage.setItem('herliyah-admin-preview-token','herliyah-local-admin-qa-2026'); location.reload()`,
  );
  await waitFor(`document.querySelector('.admin-page') !== null`);
  for (const section of ["Home", "Products", "Orders", "Settings"]) {
    await evaluate(
      `(() => { const candidates=[...document.querySelectorAll(${JSON.stringify(mobile ? ".admin-bottom-nav button" : ".admin-nav nav button")})]; candidates.find((button)=>button.textContent.trim()===${JSON.stringify(section)})?.click(); })()`,
    );
    await sleep(450);
    const check = await evaluate(`(() => {
      const visible=(element)=>{if(!element)return false;const style=getComputedStyle(element);const rect=element.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0};
      const controls=[...document.querySelectorAll('.admin-main button,.admin-main input,.admin-main select,.admin-main textarea,.admin-main a')].filter(visible).map((element)=>{const rect=element.getBoundingClientRect();return{label:(element.textContent||element.getAttribute('aria-label')||'').trim(),left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom}});
      const header=document.querySelector('.admin-nav')?.getBoundingClientRect(); const bottom=document.querySelector('.admin-bottom-nav')?.getBoundingClientRect();
      return {section:${JSON.stringify(section)},width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,clipped:controls.filter((item)=>item.left<-1||item.right>innerWidth+1),title:document.querySelector('.admin-main h1')?.textContent||'',visibleMainTitles:[...document.querySelectorAll('.admin-main h1')].filter(visible).length,active:(document.querySelector(${JSON.stringify(mobile ? ".admin-bottom-nav button.active" : ".admin-nav nav button.active")})?.textContent||'').trim(),header:header?{height:header.height}:null,bottom:bottom?{visible:visible(document.querySelector('.admin-bottom-nav')),height:bottom.height,top:bottom.top}:null,bottomItems:[...document.querySelectorAll('.admin-bottom-nav button')].filter(visible).map((button)=>button.textContent.trim())};
    })()`);
    results.push(check);
    if (width === 390) await screenshot(`390-${section.toLowerCase()}.png`);

    if (section === "Products") {
      await evaluate(`document.querySelector('.product-list-row')?.click()`);
      await waitFor(`Boolean(document.querySelector('.owner-product-editor'))`);
      const editor = await evaluate(
        `({section:'Product editor',width:innerWidth,back:Boolean(document.querySelector('.back-link')),overflow:document.documentElement.scrollWidth>innerWidth+1,priceLabel:[...document.querySelectorAll('label')].some((label)=>label.textContent.includes('Price (₦)')),jsonField:[...document.querySelectorAll('label')].some((label)=>/JSON/i.test(label.textContent)),publishBars:document.querySelectorAll('.owner-publish-bar').length})`,
      );
      results.push(editor);
      if (width === 390) await screenshot("390-product-editor.png");
      await evaluate(
        `([...document.querySelectorAll('.owner-publish-bar button')].find((button)=>button.textContent.includes('Preview full page')))?.click()`,
      );
      await waitFor(`Boolean(document.querySelector('.full-product-preview'))`);
      const preview = await evaluate(
        `({section:'Product preview',width:innerWidth,visible:Boolean(document.querySelector('.full-product-preview')),hasCare:document.body.innerText.includes('Care instructions'),hasDelivery:document.body.innerText.includes('Courier delivery begins after dispatch'),overflow:document.documentElement.scrollWidth>innerWidth+1})`,
      );
      results.push(preview);
      if (width === 390) await screenshot("390-product-preview.png");
    }
    if (section === "Settings") {
      await evaluate(
        `(() => { const select=document.querySelector('.settings-mobile-select select'); if(select){select.value='delivery';select.dispatchEvent(new Event('change',{bubbles:true}));} else {[...document.querySelectorAll('.settings-tabs button')].find((button)=>button.textContent.trim()==='Delivery')?.click();} })()`,
      );
      await sleep(250);
      await evaluate(
        `([...document.querySelectorAll('.settings-section button')].find((button)=>button.textContent.includes('Add delivery area')))?.click()`,
      );
      await sleep(150);
      const delivery = await evaluate(
        `({section:'Delivery settings',width:innerWidth,visible:Boolean(document.querySelector('.settings-section')),feeLabel:[...document.querySelectorAll('label')].some((label)=>label.textContent.includes('Delivery fee (₦)')),overflow:document.documentElement.scrollWidth>innerWidth+1})`,
      );
      results.push(delivery);
      if (width === 390) await screenshot("390-delivery-settings.png");
    }
  }
}
await writeFile(
  join(out, "results.json"),
  JSON.stringify({ results, browserErrors }, null, 2),
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
const failures = results.filter(
  (result) =>
    result.overflow ||
    result.clipped?.length ||
    result.jsonField ||
    result.publishBars > 1 ||
    (result.width < 640 &&
      result.header &&
      Math.abs(result.header.height - 54) > 1) ||
    (result.width < 640 &&
      result.bottom &&
      (!result.bottom.visible || result.bottom.height < 64)) ||
    (result.width < 640 &&
      result.bottomItems &&
      result.bottomItems.join("|") !== "Home|Products|Orders|Settings") ||
    (result.visibleMainTitles !== undefined &&
      result.visibleMainTitles !== 1) ||
    (result.active && result.active !== result.section) ||
    (result.section === "Product editor" &&
      (!result.back || !result.priceLabel || result.publishBars !== 1)) ||
    (result.section === "Product preview" &&
      (!result.visible || !result.hasCare || !result.hasDelivery)) ||
    (result.section === "Delivery settings" &&
      (!result.visible || !result.feeLabel)),
);
console.log(
  JSON.stringify(
    {
      checked: results.length,
      failures: failures.length,
      browserErrors,
      details: failures,
      screenshots: out,
    },
    null,
    2,
  ),
);
process.exitCode = failures.length || browserErrors.length ? 1 : 0;

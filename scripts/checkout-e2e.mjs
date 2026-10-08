import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const edge="C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",origin=process.env.PREVIEW_URL||"http://127.0.0.1:5173",profile=await mkdtemp(join(tmpdir(),"herliyah-checkout-")),port=9231;
const browser=spawn(edge,["--headless=new","--disable-gpu","--no-sandbox","--remote-debugging-address=127.0.0.1",`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,"about:blank"],{stdio:"ignore"});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));let version;
for(let i=0;i<80;i++){try{version=await fetch(`http://127.0.0.1:${port}/json/version`).then(response=>response.json());break}catch{await sleep(100)}}
if(!version)throw new Error("Edge debugging endpoint did not start");
const target=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:"PUT"}).then(response=>response.json()),socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true})});
let id=0;const pending=new Map(),browserErrors=[];socket.addEventListener("message",event=>{const message=JSON.parse(event.data);if(message.method==="Runtime.exceptionThrown")browserErrors.push(message.params.exceptionDetails.text);if(message.method==="Log.entryAdded"&&message.params.entry.level==="error")browserErrors.push(message.params.entry.text);if(message.id){const callback=pending.get(message.id);if(callback){pending.delete(message.id);message.error?callback.reject(new Error(message.error.message)):callback.resolve(message.result)}}});
const send=(method,params={})=>new Promise((resolve,reject)=>{const command=++id;pending.set(command,{resolve,reject});socket.send(JSON.stringify({id:command,method,params}))});
const evaluate=async expression=>(await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true})).result.value;
const waitFor=async(selector,timeout=12000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))&&!document.querySelector('.loading-state')`))return;await sleep(100)}throw new Error(`Timed out waiting for ${selector}`)};
const go=async path=>{await send("Page.navigate",{url:origin+path});await waitFor(".site-shell")};
await send("Page.enable");await send("Runtime.enable");await send("Log.enable");await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,mobile:true,deviceScaleFactor:1});
try{
  await go("/product/amara-drape-dress");await waitFor(".product-info");await evaluate(`(async()=>{document.querySelector('.size-row button:not(:disabled)').click();await new Promise(resolve=>setTimeout(resolve,100));document.querySelector('.purchase-actions .button').click();await new Promise(resolve=>setTimeout(resolve,100))})()`);
  await go("/cart");await waitFor(".cart-row");const cartBefore=await evaluate(`JSON.parse(localStorage.getItem('herliyah-preview-cart-v1')||'[]').length`);
  await go("/checkout");await waitFor(".checkout-layout");await waitFor(".checkout-items article");
  await evaluate(`(()=>{const set=(selector,value)=>{const el=document.querySelector(selector),proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))};set('input[autocomplete="name"]','Browser Customer');set('input[autocomplete="email"]','browser@example.com');set('input[autocomplete="tel"]','08000000000');set('input[autocomplete="street-address"]','1 Browser Street');set('.two-fields input','Lagos');set('.two-fields select','Lagos');document.querySelector('.terms input').click();document.querySelector('.checkout-summary button[type="submit"]').click()})()`);
  await waitFor(".pending-status");const session=await evaluate(`JSON.parse(localStorage.getItem('herliyah-checkout-session-v1'))`);if(!session?.reference)throw new Error("Checkout reference was not persisted");
  await go(`/checkout/status?reference=${encodeURIComponent(session.reference)}`);await waitFor(".pending-status");await waitFor(".status-actions .button.olive");await evaluate(`document.querySelector('.status-actions .button.olive').click()`);
  const end=Date.now()+12000;while(Date.now()<end&&!await evaluate(`document.querySelector('.pending-status h1')?.textContent.includes('confirmed')`))await sleep(100);
  const result=await evaluate(`({heading:document.querySelector('.pending-status h1')?.textContent,cart:JSON.parse(localStorage.getItem('herliyah-preview-cart-v1')||'[]').length,overflow:document.documentElement.scrollWidth>innerWidth+1})`);
  const api=await fetch(`${origin}/api/checkout/status/${encodeURIComponent(session.reference)}`).then(response=>response.json());
  if(cartBefore!==1||result.cart!==0||result.overflow||api.orderStatus!=="confirmed"||api.paymentStatus!=="succeeded"||api.reservationStatus!=="consumed"||!result.heading?.includes("confirmed")||browserErrors.length)throw new Error(JSON.stringify({cartBefore,result,api,browserErrors}));
  console.log(JSON.stringify({passed:true,reference:session.reference,orderNumber:api.orderNumber,browser:result,api:{orderStatus:api.orderStatus,paymentStatus:api.paymentStatus,reservationStatus:api.reservationStatus},browserErrors},null,2));
}finally{socket.close();browser.kill();await Promise.race([new Promise(resolve=>browser.once("exit",resolve)),sleep(1000)]);await rm(profile,{recursive:true,force:true})}

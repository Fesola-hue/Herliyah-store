import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
const root = new URL("../dist/", import.meta.url).pathname.replace(/^\/(.:)/, "$1");
const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".png":"image/png",".svg":"image/svg+xml"};
createServer(async(req,res)=>{try{let pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);let file=normalize(join(root,pathname));if((await stat(file)).isDirectory())file=join(file,"index.html");const body=await readFile(file);res.writeHead(200,{"content-type":types[extname(file)]||"application/octet-stream"});res.end(body)}catch{res.writeHead(404);res.end("Not found")}}).listen(4173,"127.0.0.1",()=>console.log("Local URL: http://127.0.0.1:4173"));

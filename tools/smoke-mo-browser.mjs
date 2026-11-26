import { createServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { buildPages } from "./build-pages.mjs";
import assert from "node:assert/strict";

const tmp=await mkdtemp(join(tmpdir(),"mo-browser-"));
const root=join(tmp,"dist");
const fixture=await readFile(new URL("../tests/fixtures/mo-studio-browser.html",import.meta.url));
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json"};
let browser;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,"http://localhost");
  if(url.pathname==="/smoke.html"){res.writeHead(200,{"content-type":types[".html"]});res.end(fixture);return;}
  const path=resolve(root,"."+url.pathname);
  if(!path.startsWith(root+"/")){res.writeHead(403);res.end();return;}
  const body=await readFile(path);res.writeHead(200,{"content-type":types[extname(path)]??"application/octet-stream"});res.end(body);
 }catch{res.writeHead(404);res.end();}
});
try{
 buildPages(root,{version:"01.07"});
 await new Promise((ok,fail)=>{server.once("error",fail);server.listen(0,"127.0.0.1",ok);});
 const url="http://127.0.0.1:"+server.address().port+"/smoke.html";
 const exe=process.env.CHROME_BIN||"google-chrome";
 let stdout="",stderr="";
 browser=spawn(exe,["--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-background-networking","--no-first-run","--no-default-browser-check","--user-data-dir="+join(tmp,"chrome"),"--dump-dom","--virtual-time-budget=12000",url],{stdio:["ignore","pipe","pipe"]});
 browser.stdout.on("data",b=>stdout+=b);browser.stderr.on("data",b=>stderr+=b);
 const code=await new Promise((ok,fail)=>{const timer=setTimeout(()=>{browser.kill("SIGKILL");fail(Error("Chrome timeout"));},45000);browser.once("error",e=>{clearTimeout(timer);fail(e);});browser.once("close",n=>{clearTimeout(timer);ok(n);});});
 assert.equal(code,0,stderr);
 assert.match(stdout,/<pre id="result">MO_BROWSER_PASS 8\/8<\/pre>/,stdout+"\n"+stderr.slice(-2000));
 console.log("MO_BROWSER_PASS 8/8 — actual Chromium, served Pages artifact");
}finally{browser?.kill();await new Promise(ok=>server.close(ok));await rm(tmp,{recursive:true,force:true});}

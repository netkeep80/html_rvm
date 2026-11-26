// V2 synchronization browser evidence: packaged Pages + actual Chromium/CDP input.
import {createServer} from "node:http";
import {readFile,mkdtemp,rm,mkdir,writeFile} from "node:fs/promises";
import {resolve,join,extname} from "node:path";
import {tmpdir} from "node:os";
import {spawn,execFileSync} from "node:child_process";
import assert from "node:assert/strict";
import {buildPages} from "./build-pages.mjs";
const head=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
const tmp=await mkdtemp(join(tmpdir(),"mo-v2-")),root=join(tmp,"dist"),output=resolve(process.env.MO_V2_EVIDENCE||"mo-v2-evidence");
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json"};
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,"http://localhost"),p=resolve(root,"."+u.pathname);if(!p.startsWith(root+"/"))throw Error("path");const b=await readFile(p);res.writeHead(200,{"content-type":types[extname(p)]??"application/octet-stream"});res.end(b);}catch{res.writeHead(404);res.end();}});
let browser,ws,n=0;const sleep=ms=>new Promise(r=>setTimeout(r,ms));const check=(v,name)=>{assert.ok(v,name);console.log("V2 PASS",++n,name);};
try{
 await mkdir(output,{recursive:true});buildPages(root,{version:"01.10",commit:head});await new Promise(r=>server.listen(0,"127.0.0.1",r));
 browser=spawn(process.env.CHROME_BIN||"google-chrome",["--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-background-networking","--no-first-run","--remote-debugging-port=0","--user-data-dir="+join(tmp,"chrome"),"about:blank"],{stdio:"ignore"});
 let port;for(let i=0;i<100;i++){try{port=(await readFile(join(tmp,"chrome","DevToolsActivePort"),"utf8")).split("\n")[0];break;}catch{await sleep(100);}}assert.ok(port);
 const targets=await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();ws=new WebSocket(targets.find(t=>t.type==="page").webSocketDebuggerUrl);await new Promise((ok,fail)=>{ws.addEventListener("open",ok,{once:true});ws.addEventListener("error",fail,{once:true});});
 let seq=0;const pending=new Map();ws.addEventListener("message",e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const q=pending.get(m.id);clearTimeout(q.timer);pending.delete(m.id);m.error?q.fail(Error(JSON.stringify(m.error))):q.ok(m.result);}});
 const send=(method,params={})=>new Promise((ok,fail)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);fail(Error("CDP timeout "+method));},10000);pending.set(id,{ok,fail,timer});ws.send(JSON.stringify({id,method,params}));});
 const evalv=async expression=>{const x=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(x.exceptionDetails)throw Error(JSON.stringify(x.exceptionDetails));return x.result.value;};
 const frame=()=>evalv("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))");
 await send("Page.enable");await send("Runtime.enable");await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1200,deviceScaleFactor:1,mobile:false});await send("Page.navigate",{url:"http://127.0.0.1:"+server.address().port+"/site/mo-studio.html"});
 for(let i=0;i<100;i++){if(await evalv("!!document.getElementById('sync-v')&&!!document.querySelector('#graph-layer [data-key]')"))break;await sleep(100);}
 await evalv("window.confirm=()=>true;true");
 const pos=async sel=>{await frame();return evalv(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)throw Error("missing selector");e.scrollIntoView({block:"center"});const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()`);};
 const glyph=async(sort,id)=>{await frame();const k=JSON.stringify([sort,id]);return evalv(`(()=>{const e=[...document.querySelectorAll("#graph-layer [data-key]")].find(g=>g.dataset.key===${JSON.stringify(k)});if(!e)throw Error("missing glyph");e.scrollIntoView({block:"center"});const b=e.querySelector(".mo-shape").getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()`);};
 const mouse=(type,p,buttons)=>send("Input.dispatchMouseEvent",{type,x:p.x,y:p.y,button:type==="mouseMoved"?"none":"left",buttons,clickCount:type==="mouseMoved"?0:1});
 async function clickPoint(p){await mouse("mouseMoved",p,0);await mouse("mousePressed",p,1);await mouse("mouseReleased",p,0);await frame();}
 const clickId=async id=>clickPoint(await pos("#"+id));
 const set=(id,value,event="input")=>evalv("(()=>{const e=document.getElementById("+JSON.stringify(id)+");e.value="+JSON.stringify(value)+";e.dispatchEvent(new Event("+JSON.stringify(event)+",{bubbles:true}));return true;})()");
 const shot=async name=>{const p=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(join(output,name+".png"),Buffer.from(p.data,"base64"));};
 await set("sync-path",'["counter"]');await clickId("sync-locate-node");
 check((await evalv("document.getElementById('sync-selected').textContent")).startsWith("N:"),"V path locates structural N");
 let v=JSON.parse(await evalv("document.getElementById('sync-v').textContent"));check(JSON.stringify(v.occurrences)==='[["counter"]]',"selected N has one V occurrence");
 let g=JSON.parse(await evalv("document.getElementById('sync-g').textContent"));check(g.record[0]==="nodes","selected N has exact G node locator");
 await clickId("sync-locate-relation");check((await evalv("document.getElementById('sync-selected').textContent")).startsWith("P:"),"same V path independently locates structural P");
 g=JSON.parse(await evalv("document.getElementById('sync-g').textContent"));check(g.record[0]==="relations","selected P has exact G relation locator");
 await clickId("sync-locate-node");await clickId("sync-use-edit");check(await evalv("document.getElementById('json-path').value")==='["counter"]',"unique occurrence populates existing JSON edit path");
 await set("json-value","7");await clickId("json-apply");check(await evalv("JSON.parse(document.getElementById('plain').textContent).counter")===7,"R0 JSON edit updates V");
 check((await evalv("document.getElementById('lossless').textContent")).includes('"payload": 7'),"same edit updates exact G view");await shot("01-canonical-sync");
 await clickId("graph");await clickPoint(await glyph("N","value"));
 v=JSON.parse(await evalv("document.getElementById('sync-v').textContent"));check(JSON.stringify(v.occurrences)==='[["a"],["b"]]',"sharing exposes two V occurrences");
 check(await evalv("document.getElementById('sync-use-edit').disabled")===true,"sharing disables ambiguous JSON edit shortcut");
 check((await evalv("document.getElementById('sync-locality').textContent")).includes("JSON_NOT_CANONICAL_TREE"),"sharing explains nonlocal edit boundary");await shot("02-sharing-sync");
 const cyc={"$mo":"np-state/1",nodes:[{id:"root",kind:"object",payload:null}],relations:[{id:"cyc",owner:["N","root"],label:{kind:"key",value:"self"},bound:true,target:["N","root"]}],roots:[["N","root"]],used:{N:["root"],P:["cyc"]}};
 await set("import-mode","lossless","change");await set("import-text",JSON.stringify(cyc));await clickId("import");await clickPoint(await glyph("P","cyc"));
 check((await evalv("document.getElementById('plain').textContent")).includes("JSON_CYCLE"),"cycle makes V explicitly undefined");
 v=JSON.parse(await evalv("document.getElementById('sync-v').textContent"));check(v.status==="UNDEFINED"&&v.diagnostic==="JSON_CYCLE","sync inspector carries exact V diagnostic");
 g=JSON.parse(await evalv("document.getElementById('sync-g').textContent"));check(g.record[0]==="relations","G remains exact and inspectable when V is undefined");await shot("03-cycle-g-valid");
 await writeFile(join(output,"receipt.json"),JSON.stringify({head,checks:n,viewport:[1440,1200],scenarios:["canonical-sync","sharing-multiplicity","cycle-v-undefined-g-valid"]},null,2));console.log("MO_V2_BROWSER_PASS "+n);
}finally{ws?.close();if(browser&&browser.exitCode===null&&browser.signalCode===null){const closed=new Promise(r=>browser.once("close",r));browser.kill();await Promise.race([closed,sleep(3000)]);if(browser.exitCode===null&&browser.signalCode===null){browser.kill("SIGKILL");await Promise.race([closed,sleep(1000)]);}}server.closeAllConnections();await new Promise(r=>server.close(r));await rm(tmp,{recursive:true,force:true,maxRetries:10,retryDelay:150});}

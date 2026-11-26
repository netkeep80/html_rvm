// Chromium DevTools Protocol: actual browser input, no DOM .click for V1 interactions.
import {createServer} from "node:http";
import {readFile,mkdtemp,rm,mkdir,writeFile} from "node:fs/promises";
import {resolve,join,extname} from "node:path";
import {tmpdir} from "node:os";
import {spawn} from "node:child_process";
import {buildPages} from "./build-pages.mjs";
import assert from "node:assert/strict";
const tmp=await mkdtemp(join(tmpdir(),"mo-visual-"));
const root=join(tmp,"dist"),output=resolve(process.env.MO_VISUAL_EVIDENCE||"mo-visual-evidence");
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json"};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,"http://localhost"),path=resolve(root,"."+url.pathname);if(!path.startsWith(root+"/"))throw Error("path");const bytes=await readFile(path);res.writeHead(200,{"content-type":types[extname(path)]??"application/octet-stream"});res.end(bytes);}catch{res.writeHead(404);res.end();}});
let browser,ws;const sleep=ms=>new Promise(r=>setTimeout(r,ms));let n=0;
const check=(condition,name)=>{assert.ok(condition,name);console.log("V1 PASS",++n,name);};
try{
 await mkdir(output,{recursive:true});
 buildPages(root,{version:"01.07",commit:process.env.GITHUB_SHA});
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 browser=spawn(process.env.CHROME_BIN||"google-chrome",["--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-background-networking","--no-first-run","--remote-debugging-port=0","--user-data-dir="+join(tmp,"chrome"),"about:blank"],{stdio:"ignore"});
 let port;for(let i=0;i<100;i++){try{port=(await readFile(join(tmp,"chrome","DevToolsActivePort"),"utf8")).split("\n")[0];break;}catch{await sleep(100);}}assert.ok(port,"Chromium DevTools port");
 const targets=await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();
 ws=new WebSocket(targets.find(t=>t.type==="page").webSocketDebuggerUrl);
 await new Promise((ok,fail)=>{ws.addEventListener("open",ok,{once:true});ws.addEventListener("error",fail,{once:true});});
 let seq=0;const pending=new Map();
 ws.addEventListener("message",e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const {ok,fail,timer}=pending.get(m.id);clearTimeout(timer);pending.delete(m.id);m.error?fail(Error(JSON.stringify(m.error))):ok(m.result);}});
 function send(method,params={}){return new Promise((ok,fail)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);fail(Error("CDP timeout "+method));},10000);pending.set(id,{ok,fail,timer});ws.send(JSON.stringify({id,method,params}));});}
 const evaluate=async expression=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send("Page.enable");await send("Runtime.enable");await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1200,deviceScaleFactor:1,mobile:false});
 await send("Page.navigate",{url:"http://127.0.0.1:"+server.address().port+"/site/mo-studio.html"});
 for(let i=0;i<100;i++){if(await evaluate("!!document.querySelector('#graph-layer [data-key]')"))break;await sleep(100);}
 const raw=()=>evaluate("document.getElementById('lossless').textContent");
 const state=async()=>JSON.parse(await raw());
 const find=(s,id)=>s.relations.find(r=>r.id===id);
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const expr=(sort,id,port)=>"(()=>{const g=[...document.querySelectorAll('#graph-layer [data-key]')].find(g=>g.dataset.key==="+JSON.stringify(JSON.stringify([sort,id]))+");if(!g)throw Error('missing glyph');const el="+(port?"g.querySelector('[data-port="+port+"]')":"g.querySelector('.mo-shape')")+";const b=el.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()";
 const coords=(sort,id,port)=>evaluate(expr(sort,id,port));
 const button=async id=>evaluate("(()=>{const e=document.getElementById("+JSON.stringify(id)+");e.scrollIntoView({block:'nearest'});const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()");
 const mouse=(type,p,buttons)=>send("Input.dispatchMouseEvent",{type,x:p.x,y:p.y,button:type==="mouseMoved"?"none":"left",buttons,clickCount:type==="mouseMoved"?0:1});
 async function click(p){await mouse("mouseMoved",p,0);await mouse("mousePressed",p,1);await mouse("mouseReleased",p,0);}
 async function drag(a,b){await mouse("mouseMoved",a,0);await mouse("mousePressed",a,1);for(let i=1;i<=8;i++)await mouse("mouseMoved",{x:a.x+(b.x-a.x)*i/8,y:a.y+(b.y-a.y)*i/8},1);await mouse("mouseReleased",b,0);}
 const press=async id=>click(await button(id));
 const set=(id,value)=>evaluate("document.getElementById("+JSON.stringify(id)+").value="+JSON.stringify(value));
 const shot=async name=>{await evaluate("document.querySelector('.visual-panel').scrollIntoView({block:'start'})");const p=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(join(output,name+".png"),Buffer.from(p.data,"base64"));};
 check((await state()).nodes.length>0,"initial graph rendered");
 // Setup through existing session controls; V1 mutations below use trusted mouse events.
 await evaluate("window.confirm=()=>true;document.getElementById('graph').click();document.querySelector('.visual-panel').scrollIntoView({block:'start'})");
 check((await state()).relations.length===4,"graph example");await shot("01-initial-sharing");
 await set("graph-node-kind","number");await set("graph-node-payload","7");await press("graph-create-node");
 check((await state()).nodes.some(n=>n.id==="n1"&&n.payload===7),"mouse create N");
 await evaluate("document.querySelector('.visual-panel').scrollIntoView({block:'start'})");
 await set("graph-label-kind","role");await set("graph-label-value","context2");
 await drag(await coords("P","a","create"),await coords("P","b"));
 let s=await state();check(same(find(s,"p1")?.owner,["P","a"])&&same(find(s,"p1")?.target,["P","b"]),"mouse create P with P owner and target");
 await drag(await coords("P","p1","target"),await coords("P","p1"));
 check(same(find(await state(),"p1")?.target,["P","p1"]),"self target");
 await click(await coords("P","p1"));await press("graph-unbind");
 check(find(await state(),"p1")?.bound===false,"explicit unbind");
 await evaluate("document.querySelector('.visual-panel').scrollIntoView({block:'start'})");await press("graph-layout");
 await drag(await coords("P","p1","target"),await coords("N","value"));
 check(same(find(await state(),"p1")?.target,["N","value"]),"rebind sharing");
 await drag(await coords("P","p1","owner"),await coords("N","root"));
 check(same(find(await state(),"p1")?.owner,["N","root"]),"move owner");
 await shot("02-created-rebound");
 await click(await coords("N","value"));check((await evaluate("document.getElementById('graph-selected').textContent"))==="N:value","graph selection");
 await set("graph-edit-value","99");await press("graph-save");
 check((await state()).nodes.find(n=>n.id==="value").payload===99,"inspector shared node mutation");
 const before=await raw();await press("graph-delete");
 check(await raw()===before&&(await evaluate("document.getElementById('status').textContent")).includes("NODE_REFERENCED"),"reject deletion preserves full state");
 await shot("03-rejected-delete");
 await evaluate("document.querySelector('.visual-panel').scrollIntoView({block:'start'})");
 const a=await coords("N","value");await drag(a,{x:a.x+70,y:a.y+30});const q=await coords("N","value");
 check(await raw()===before&&q.x>a.x+40,"drag view only");
 const blank=await evaluate("(()=>{const b=document.getElementById('mo-graph').getBoundingClientRect();return {x:b.right-25,y:b.bottom-25}})()");
 await drag(blank,{x:blank.x-45,y:blank.y-20});const pan=await coords("N","value");
 check(await raw()===before&&pan.x<q.x-20,"pan view only");
 await press("graph-zoom-in");check(await raw()===before,"zoom view only");await press("graph-layout");
 await click(await coords("N","n1"));await press("graph-delete");await press("graph-create-node");
 check((await state()).nodes.some(n=>n.id==="n2")&&!(await state()).nodes.some(n=>n.id==="n1"),"no resurrection");
 await evaluate("document.querySelector('.visual-panel').scrollIntoView({block:'start'})");
 await click(await coords("P","p1"));await press("graph-create-unbound");check(find(await state(),"p2")?.bound===false,"create unbound P");
 await shot("04-unbound");
 await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:false});
 await evaluate("document.querySelector('.visual-panel').scrollIntoView({block:'start'})");
 check(await evaluate("document.documentElement.scrollWidth<=innerWidth"),"responsive no horizontal overflow");await shot("05-mobile");
 await writeFile(join(output,"receipt.json"),JSON.stringify({head:process.env.GITHUB_SHA??null,checks:n,viewport:[1440,1200],mobile:[390,844]},null,2));
 console.log("MO_VISUAL_BROWSER_PASS "+n);
}finally{ws?.close();browser?.kill();await new Promise(r=>server.close(r));await rm(tmp,{recursive:true,force:true});}

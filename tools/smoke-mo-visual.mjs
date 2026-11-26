// Chromium DevTools Protocol: actual browser input, no DOM .click for V1 interactions.
import {createServer} from "node:http";
import {readFile,mkdtemp,rm,mkdir,writeFile} from "node:fs/promises";
import {resolve,join,extname} from "node:path";
import {tmpdir} from "node:os";
import {spawn,execFileSync} from "node:child_process";
const head=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
import {buildPages} from "./build-pages.mjs";
import assert from "node:assert/strict";
const tmp=await mkdtemp(join(tmpdir(),"mo-visual-"));
const root=join(tmp,"dist"),output=resolve(process.env.MO_VISUAL_EVIDENCE||"mo-visual-evidence");
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json"};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,"http://localhost"),path=resolve(root,"."+url.pathname);if(!path.startsWith(root+"/"))throw Error("path");const bytes=await readFile(path);res.writeHead(200,{"content-type":types[extname(path)]??"application/octet-stream"});res.end(bytes);}catch{res.writeHead(404);res.end();}});
let browser,ws;const sleep=ms=>new Promise(r=>setTimeout(r,ms));let n=0,captureRegressionTrace=null,captureRegressionEvidence=null;
const check=(condition,name)=>{assert.ok(condition,name);console.log("V1 PASS",++n,name);};
try{
 await mkdir(output,{recursive:true});
 buildPages(root,{version:"01.07",commit:head});
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
 // Wait for actual layout/compositor frames after scroll or SVG replacement, not for a guessed timeout.
 const frame=()=>evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))");
 await evaluate("window.__v1PointerTrace=[];for(const type of ['pointerdown','pointerup','pointercancel','gotpointercapture','lostpointercapture'])document.addEventListener(type,e=>{const at=document.elementFromPoint(e.clientX,e.clientY);window.__v1PointerTrace.push({type,id:e.pointerId,buttons:e.buttons,trusted:e.isTrusted,x:e.clientX,y:e.clientY,port:e.target.getAttribute?.('data-port'),key:e.target.closest?.('[data-key]')?.dataset.key,hit:at?.closest?.('[data-key]')?.dataset.key,hitPort:at?.getAttribute?.('data-port')});if(window.__v1PointerTrace.length>30)window.__v1PointerTrace.shift();},true);true");
 const raw=()=>evaluate("document.getElementById('lossless').textContent");
 const state=async()=>JSON.parse(await raw());
 const find=(s,id)=>s.relations.find(r=>r.id===id);
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const expr=(sort,id,port)=>"(()=>{const g=[...document.querySelectorAll('#graph-layer [data-key]')].find(g=>g.dataset.key==="+JSON.stringify(JSON.stringify([sort,id]))+");if(!g)throw Error('missing glyph');const el="+(port?"g.querySelector('[data-port="+port+"]')":"g.querySelector('.mo-shape')")+";const b=el.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()";
 const coords=async(sort,id,port)=>{
  await frame();const p=await evaluate(expr(sort,id,port));
  const hit=await evaluate("(()=>{const h=document.elementFromPoint("+p.x+","+p.y+");return {key:h?.closest('[data-key]')?.dataset.key,port:h?.getAttribute('data-port')};})()");
  assert.equal(hit.key,JSON.stringify([sort,id]),"actual hit target "+sort+":"+id+" "+JSON.stringify({p,hit}));if(port)assert.equal(hit.port,port,"actual hit port");
  return p;
 };
 const button=async id=>{await frame();const p=await evaluate("(()=>{const e=document.getElementById("+JSON.stringify(id)+");e.scrollIntoView({block:'nearest'});const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()");await frame();return p;};
 const mouse=(type,p,buttons)=>send("Input.dispatchMouseEvent",{type,x:p.x,y:p.y,button:type==="mouseMoved"?"none":"left",buttons,clickCount:type==="mouseMoved"?0:1});
 async function click(p){await mouse("mouseMoved",p,0);await frame();await mouse("mousePressed",p,1);await mouse("mouseReleased",p,0);await frame();}
 async function drag(a,b){await mouse("mouseMoved",a,0);await frame();await mouse("mousePressed",a,1);await frame();for(let i=1;i<=8;i++){await mouse("mouseMoved",{x:a.x+(b.x-a.x)*i/8,y:a.y+(b.y-a.y)*i/8},1);await frame();}await mouse("mouseReleased",b,0);await frame();}
 const press=async id=>click(await button(id));
 const set=(id,value)=>evaluate("document.getElementById("+JSON.stringify(id)+").value="+JSON.stringify(value));
 const shot=async name=>{await evaluate("document.getElementById('status').scrollIntoView({block:'start'})");const p=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(join(output,name+".png"),Buffer.from(p.data,"base64"));};
 check((await state()).nodes.length>0,"initial graph rendered");
 // Setup through existing session controls; V1 mutations below use trusted mouse events.
 await evaluate("window.confirm=()=>true;document.getElementById('graph').click();document.querySelector('.visual-panel').scrollIntoView({block:'start'})");
 check((await state()).relations.length===4,"graph example");await shot("01-initial-sharing");
 await set("graph-node-kind","number");await set("graph-node-payload","7");await press("graph-create-node");
 check((await state()).nodes.some(n=>n.id==="n1"&&n.payload===7),"mouse create N");
 await evaluate("document.querySelector('.visual-panel').scrollIntoView({block:'start'})");
 await set("graph-label-kind","role");await set("graph-label-value","context2");
 await drag(await coords("P","a","create"),await coords("P","b"));
 let s=await state();if(!same(find(s,"p1")?.owner,["P","a"])||!same(find(s,"p1")?.target,["P","b"])){console.error("P/P gesture diagnostic",JSON.stringify({relations:s.relations,status:await evaluate("document.getElementById('status').textContent"),trace:await evaluate("window.__v1PointerTrace")}));await shot("failure-pp-gesture");}check(same(find(s,"p1")?.owner,["P","a"])&&same(find(s,"p1")?.target,["P","b"]),"mouse create P with P owner and target");
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
 const unboundVisible=await evaluate("(()=>{const e=document.querySelector('[data-unbound-for=p2]'),b=e?.getBoundingClientRect(),s=document.getElementById('mo-graph').getBoundingClientRect();return !!e&&e.textContent==='∅'&&b.left>=s.left&&b.right<=s.right&&b.top>=s.top&&b.bottom<=s.bottom;})()");
 check(unboundVisible,"unbound marker is visible inside default graph viewport");
 await shot("04-unbound");
 // Regression: real input with deliberate capture release after pointerdown.
 await evaluate("document.querySelector('.visual-panel').scrollIntoView({block:'start'})");
 const captureBefore=await state();
 const start=await coords("P","a","create"),end=await coords("P","b");
 await mouse("mouseMoved",start,0);await frame();await mouse("mousePressed",start,1);await frame();
 const downIndex=await evaluate("window.__v1PointerTrace.findLastIndex(e=>e.type==='pointerdown'&&e.key===JSON.stringify(['P','a'])&&e.port==='create')");
 check(downIndex>=0,"capture regression records trusted pointerdown");
 const captureInfo=await evaluate("(()=>{const svg=document.getElementById('mo-graph'),e=window.__v1PointerTrace["+downIndex+"];return {id:e.id,trusted:e.trusted,buttons:e.buttons,captured:svg.hasPointerCapture(e.id)};})()");
 check(captureInfo.trusted&&captureInfo.buttons===1&&captureInfo.captured,"capture regression starts with trusted held-button capture");
 await evaluate("(()=>{const svg=document.getElementById('mo-graph'),e=window.__v1PointerTrace["+downIndex+"];svg.releasePointerCapture(e.id);return true;})()");
 const captureFlush={x:(start.x+end.x)/2,y:(start.y+end.y)/2};
 await mouse("mouseMoved",captureFlush,1);await frame();
 const lostBeforeUp=await evaluate("(()=>{const t=window.__v1PointerTrace.slice("+downIndex+"),id=t[0].id;const lost=t.findIndex(e=>e.type==='lostpointercapture'&&e.id===id&&e.trusted);const up=t.findIndex(e=>e.type==='pointerup'&&e.id===id);return {lost,up,trace:t};})()");
 check(lostBeforeUp.lost>0&&lostBeforeUp.up<0,"trusted lostpointercapture occurs for same pointer before any pointerup");
 captureRegressionEvidence={pointerId:captureInfo.id,buttonHeldProof:{pointerdownButtons:captureInfo.buttons,mouseReleasedSent:false},preReleaseTrace:lostBeforeUp.trace};
 await mouse("mouseMoved",end,1);await frame();await mouse("mouseReleased",end,0);await frame();
 captureRegressionTrace=await evaluate("(()=>{const t=window.__v1PointerTrace.slice("+downIndex+"),id=t[0].id;const up=t.findIndex(e=>e.type==='pointerup'&&e.id===id);return t.slice(0,up+1);})()");
 const lostIndex=captureRegressionTrace.findIndex(e=>e.type==="lostpointercapture"&&e.trusted&&e.id===captureInfo.id),upIndex=captureRegressionTrace.findIndex(e=>e.type==="pointerup"&&e.id===captureInfo.id);
 check(lostIndex>0&&upIndex>lostIndex,"capture trace proves trusted down -> lostcapture -> up for same pointer");
 captureRegressionEvidence.postReleaseTrace=captureRegressionTrace;captureRegressionEvidence.buttonHeldProof.mouseReleasedSent=true;
 const captureAfter=await state(),captureExpected=JSON.parse(JSON.stringify(captureBefore));
 captureExpected.relations.push({id:"p3",owner:["P","a"],label:{kind:"role",value:"context2"},bound:true,target:["P","b"]});captureExpected.relations.sort((a,b)=>a.id.localeCompare(b.id));captureExpected.used.P.push("p3");captureExpected.used.P.sort();
 check(same(captureAfter,captureExpected),"capture-loss gesture has exact lossless state delta");
 check(same(find(captureAfter,"p3")?.owner,["P","a"])&&same(find(captureAfter,"p3")?.target,["P","b"]),"capture loss does not cancel a valid P/P drag");
 const cancelBefore=await raw();
 const cancelStart=await coords("P","a","create");
 const cancelEnd=await evaluate("(()=>{const b=document.getElementById('mo-graph').getBoundingClientRect();return {x:b.right-20,y:b.bottom-20};})()");
 await drag(cancelStart,cancelEnd);check(await raw()===cancelBefore,"blank drop leaves state exact");
 await mouse("mouseMoved",cancelStart,0);await frame();await mouse("mousePressed",cancelStart,1);await frame();
 await send("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});await send("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
 await mouse("mouseMoved",end,1);await frame();await mouse("mouseReleased",end,0);await frame();
 check(await raw()===cancelBefore,"Escape cancels link without mutation");

 await click(await coords("P","p1"));await set("graph-edit-value","renamed");await press("graph-save");
 check(find(await state(),"p1")?.label.value==="renamed","mouse relabel P");
 await press("graph-root");check((await state()).roots.some(e=>same(e,["P","p1"])),"root P added");
 await press("graph-root");check(!(await state()).roots.some(e=>same(e,["P","p1"])),"root P removed");
 await evaluate("document.querySelector('.visual-panel').scrollIntoView({block:'start'});[...document.querySelectorAll('#graph-layer [data-key]')].find(g=>g.dataset.key===JSON.stringify(['N','root'])).focus()");
 await send("Input.dispatchKeyEvent",{type:"keyDown",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});await send("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
 check((await evaluate("document.getElementById('graph-selected').textContent"))==="N:root","keyboard selects N");
 const collision={"$mo":"np-state/1",nodes:[{id:"a",kind:"entity",payload:null},{id:"b",kind:"entity",payload:null}],relations:[{id:"a",owner:["N","a"],label:{kind:"role",value:"edge"},bound:true,target:["N","b"]}],roots:[["N","a"]],used:{N:["a","b"],P:["a"]}};
 await set("import-mode","lossless");await set("import-text",JSON.stringify(collision));await press("import");
 let cs=await state();check(cs.nodes.some(x=>x.id==="a")&&cs.relations.some(x=>x.id==="a"),"browser imports distinct N:a and P:a");
 await evaluate("document.querySelector('.visual-panel').scrollIntoView({block:'start'})");
 await click(await coords("N","a"));check((await evaluate("document.getElementById('graph-selected').textContent"))==="N:a","browser independently selects N:a");
 await click(await coords("P","a"));check((await evaluate("document.getElementById('graph-selected').textContent"))==="P:a","browser independently selects P:a");
 const rootMarker=await evaluate("(()=>{const g=[...document.querySelectorAll('#graph-layer [data-key]')].find(g=>g.dataset.key===JSON.stringify(['N','a']));return g?.querySelector('.mo-root')?.textContent||'';})()");
 check(rootMarker.startsWith("ROOT"),"visible root marker belongs to typed N:a");
 await set("graph-label-kind","role");await set("graph-label-value","typed");
 await drag(await coords("N","a","create"),await coords("P","a"));
 cs=await state();check(same(find(cs,"p1")?.owner,["N","a"])&&same(find(cs,"p1")?.target,["P","a"]),"typed browser connection preserves N:a owner and P:a target");
 await click(await coords("P","a"));await press("graph-root");
 const pRootVisible=await evaluate("(()=>{const g=[...document.querySelectorAll('#graph-layer [data-key]')].find(g=>g.dataset.key===JSON.stringify(['P','a']));return g?.querySelector('.mo-root')?.textContent||'';})()");
 check((await state()).roots.some(e=>same(e,["P","a"]))&&pRootVisible.startsWith("ROOT"),"typed P:a root has visible marker");
 await shot("05-typed-identity");
 await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:false});
 await evaluate("document.querySelector('.visual-panel').scrollIntoView({block:'start'})");
 check(await evaluate("document.documentElement.scrollWidth<=innerWidth"),"responsive no horizontal overflow");await shot("06-mobile");
 check(Array.isArray(captureRegressionTrace)&&captureRegressionTrace.length>=3,"capture regression trace retained");
 await writeFile(join(output,"pointer-trace.json"),JSON.stringify(captureRegressionEvidence,null,2));
 await writeFile(join(output,"receipt.json"),JSON.stringify({head,checks:n,viewport:[1440,1200],mobile:[390,844],captureTrace:"pointer-trace.json"},null,2));
 console.log("MO_VISUAL_BROWSER_PASS "+n);
}finally{
 ws?.close();
 if(browser&&browser.exitCode===null&&browser.signalCode===null){
  const closed=new Promise(r=>browser.once("close",r));browser.kill();
  await Promise.race([closed,sleep(3000)]);
  if(browser.exitCode===null&&browser.signalCode===null){browser.kill("SIGKILL");await Promise.race([closed,sleep(1000)]);}
 }
 server.closeAllConnections();await new Promise(r=>server.close(r));
 await rm(tmp,{recursive:true,force:true,maxRetries:10,retryDelay:150});
}

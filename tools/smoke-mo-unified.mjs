// V3 synchronization browser evidence: packaged Pages + actual Chromium/CDP input.
import {createServer} from "node:http";
import {readFile,mkdtemp,rm,mkdir,writeFile} from "node:fs/promises";
import {resolve,join,extname} from "node:path";
import {tmpdir} from "node:os";
import {spawn,execFileSync} from "node:child_process";
import assert from "node:assert/strict";
import {buildPages} from "./build-pages.mjs";
const head=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
const tmp=await mkdtemp(join(tmpdir(),"mo-unified-")),root=join(tmp,"dist"),output=resolve(process.env.MO_UNIFIED_EVIDENCE||"mo-unified-evidence");
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json"};
const server=createServer(async(req,res)=>{try{const u=new URL(req.url,"http://localhost"),p=resolve(root,"."+u.pathname+(u.pathname.endsWith("/")?"index.html":""));if(!p.startsWith(root+"/"))throw Error("path");const b=await readFile(p);res.writeHead(200,{"content-type":types[extname(p)]??"application/octet-stream"});res.end(b);}catch{res.writeHead(404);res.end();}});
let browser,ws,n=0;const sleep=ms=>new Promise(r=>setTimeout(r,ms));const check=(v,name)=>{assert.ok(v,name);console.log("UNIFIED PASS",++n,name);};
try{
 await mkdir(output,{recursive:true});buildPages(root,{version:"01.11",commit:head});await new Promise(r=>server.listen(0,"127.0.0.1",r));
 browser=spawn(process.env.CHROME_BIN||"google-chrome",["--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-background-networking","--no-first-run","--remote-debugging-port=0","--user-data-dir="+join(tmp,"chrome"),"about:blank"],{stdio:"ignore"});
 let port;for(let i=0;i<100;i++){try{port=(await readFile(join(tmp,"chrome","DevToolsActivePort"),"utf8")).split("\n")[0];break;}catch{await sleep(100);}}assert.ok(port);
 const targets=await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();ws=new WebSocket(targets.find(t=>t.type==="page").webSocketDebuggerUrl);await new Promise((ok,fail)=>{ws.addEventListener("open",ok,{once:true});ws.addEventListener("error",fail,{once:true});});
 let seq=0;const pending=new Map();ws.addEventListener("message",e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const q=pending.get(m.id);clearTimeout(q.timer);pending.delete(m.id);m.error?q.fail(Error(JSON.stringify(m.error))):q.ok(m.result);}});
 const send=(method,params={})=>new Promise((ok,fail)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);fail(Error("CDP timeout "+method));},10000);pending.set(id,{ok,fail,timer});ws.send(JSON.stringify({id,method,params}));});
 const evalv=async expression=>{const x=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(x.exceptionDetails)throw Error(JSON.stringify(x.exceptionDetails));return x.result.value;};
 const frame=()=>evalv("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))");
 await send("Page.enable");await send("Runtime.enable");await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1200,deviceScaleFactor:1,mobile:false});await send("Page.navigate",{url:"http://127.0.0.1:"+server.address().port+"/site/unified-studio.html"});
 for(let i=0;i<100;i++){if(await evalv("!!document.querySelector('#network [data-identity]')&&!document.getElementById('run').disabled"))break;await sleep(100);}
 await evalv("window.confirm=()=>true;true");
 const pos=async sel=>{await frame();return evalv(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)throw Error("missing selector");e.scrollIntoView({block:"center"});const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()`);};
 const glyph=async(sort,id)=>{await frame();const k=JSON.stringify([sort,id]);return evalv(`(()=>{const e=[...document.querySelectorAll("#graph-layer [data-key]")].find(g=>g.dataset.key===${JSON.stringify(k)});if(!e)throw Error("missing glyph");e.scrollIntoView({block:"center"});const b=e.querySelector(".mo-shape").getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()`);};
 const mouse=(type,p,buttons)=>send("Input.dispatchMouseEvent",{type,x:p.x,y:p.y,button:type==="mouseMoved"?"none":"left",buttons,clickCount:type==="mouseMoved"?0:1});
 async function clickPoint(p){await mouse("mouseMoved",p,0);await mouse("mousePressed",p,1);await mouse("mouseReleased",p,0);await frame();}
 const clickId=async id=>clickPoint(await pos("#"+id));
 const set=(id,value,event="input")=>evalv("(()=>{const e=document.getElementById("+JSON.stringify(id)+");e.value="+JSON.stringify(value)+";e.dispatchEvent(new Event("+JSON.stringify(event)+",{bubbles:true}));return true;})()");
 const shot=async(name,selector)=>{await evalv("document.querySelector("+JSON.stringify(selector)+").scrollIntoView({block:\"start\"})");await frame();const p=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile(join(output,name+".png"),Buffer.from(p.data,"base64"));};

 check(await evalv("!document.getElementById('run').disabled"),"packaged preview module loaded");
 await clickId("step");
 check(await evalv("document.querySelectorAll('#timeline [data-tentative=true]').length===1"),"one actual tentative predicate");
 await clickId("reset");check(await evalv("!document.querySelector('#timeline [data-tentative=true]')"),"reset discards attempt");
 await clickId("run");check(await evalv("JSON.parse(document.getElementById('result').textContent)[0]==='4'"),"where result");
 await shot("01-where","header");
 const focusCount=await evalv("document.querySelectorAll('#network [data-identity]').length");
 await set("network-scope","all","change");check(await evalv("document.querySelectorAll('#network [data-identity]').length")>focusCount,"all view exposes additional runtime identities");
 await set("network-scope","focus","change");
 await clickId("reflect");check(await evalv("JSON.parse(document.getElementById('source').value).$sub.$rel==='is_null'"),"Q updates source");
 await clickId("run");check(await evalv("JSON.parse(document.getElementById('result').textContent)[0]===null"),"reflective replay");
 await clickPoint(await pos('#timeline button:not([data-step]):nth-last-child(3)'));
 check(await evalv("JSON.parse(document.getElementById('historical-source').value).$sub.$rel==='is_string'&&document.querySelector('#timeline [data-step]').textContent.startsWith('is_string')"),"old run owns source and events after Q/replay");
 await clickPoint(await pos('#timeline [data-step="0"]'));
 check(await evalv("JSON.parse(document.getElementById('transition-detail').textContent).observation.controller==='is_string'&&document.querySelector('#step-identities button[data-identity]').textContent==='Source controller'"),"old step exposes actual identities");
 await clickPoint(await pos('#step-identities button[data-identity]'));
 check(await evalv("document.getElementById('historical-source').value.slice(document.getElementById('historical-source').selectionStart,document.getElementById('historical-source').selectionEnd).includes('is_string')"),"historical source-controller navigation");
 await clickId("return-current");
 check(await evalv("JSON.parse(document.getElementById('source').value).$sub.$rel==='is_null'"),"return preserves current source");

 await shot("02-reflection","header");
 await set("example","ordinary","change");
 const selectSource=async needle=>evalv(`(()=>{const s=document.getElementById('source'),i=s.value.indexOf(${JSON.stringify(needle)});s.setSelectionRange(i,i);s.dispatchEvent(new KeyboardEvent("keyup",{key:"ArrowRight",bubbles:true}));return true})()`);
 await selectSource('"a"');check(await evalv("JSON.parse(document.getElementById('selection').textContent).identity.sort==='P'"),"key selects relation");
 await selectSource("1");check(await evalv("JSON.parse(document.getElementById('selection').textContent).identity.sort==='N'"),"value selects payload");
 await set("source","{");await clickId("apply");check(await evalv("document.getElementById('status').textContent.includes('DIRTY')"),"invalid apply retains draft");
 await clickId("discard");check(await evalv("JSON.parse(document.getElementById('source').value).a===1"),"discard restores applied text");
 await set("example","ent_abc","change");
 check(await evalv("!!document.querySelector('[data-from=\"P:r2\"][data-side=B][data-to=\"P:s1\"]')"),"relation-to-relation begin");
 const exact=()=>evalv("document.getElementById('exact').textContent");
 const before=await exact();
 async function drag(from,to){await mouse("mouseMoved",from,0);await mouse("mousePressed",from,1);for(let i=1;i<=8;i++)await mouse("mouseMoved",{x:from.x+(to.x-from.x)*i/8,y:from.y+(to.y-from.y)*i/8},1);await mouse("mouseReleased",to,0);await frame()}
 const rawpos=sel=>evalv(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
 // 1440px viewport may scroll the central SVG. Both selected points are on same visible row.
 const body=await pos('[data-identity="P:r2"] rect');
 await drag(body,{x:body.x+5,y:body.y+30});
 check((await exact())===before,"layout drag does not mutate MO");
 // Bring both objects into central viewport at once.
 await evalv("document.querySelector('.canvas').scrollLeft=0;document.querySelector('.canvas').scrollTop=0;true");
 const start=await pos('[data-identity="P:r2"] [data-socket="E"]');
 const target=await rawpos('[data-anchor="P:r2"]');
 await drag(start,target);
 check(await evalv("!!document.querySelector('[data-from=\"P:r2\"][data-side=E][data-to=\"P:r2\"]')"),"trusted drag endpoint to own identity");
 check((await exact())!==before,"endpoint edit changes exact MO");
 await shot("03-ent-abc","header");
 await set("example","sharing + cycles","change");
 check(await evalv("!!document.querySelector('[data-from=\"P:self\"][data-to=\"P:self\"]')"),"finite self-cycle");
 check(await evalv("!!document.querySelector('[data-from=\"P:mutual\"][data-to=\"P:shared\"]')&&!!document.querySelector('[data-from=\"P:shared\"][data-to=\"P:mutual\"]')"),"finite mutual cycle");
 check(await evalv("!!document.querySelector('[data-identity=\"P:s1\"]')&&!!document.querySelector('[data-identity=\"P:s2\"]')"),"equal pair distinct identities");
 await shot("04-sharing-cycles","header");

 await set("example","where","change");await clickId("run");
 await selectSource('"4"');check(await evalv("document.querySelectorAll('#occurrences button').length===1&&document.querySelectorAll('#result-occurrences button').length===1"),"same selected payload in source and result");
 await clickPoint(await pos('#timeline button[data-tentative="false"]'));
 check(await evalv("JSON.parse(document.getElementById('transition-detail').textContent).trace.some(t=>t.kind==='E1.Q')"),"real E1 trace inspector");
 await clickId("reset");
 await set("source",'{"$rel/a":"rmvm/version","$rel/z":"unknown"}');await clickId("apply");
 const prior=await exact();await clickId("step");await clickId("step");
 check((await exact())===prior&&await evalv("document.getElementById('last-reject').textContent.includes('UNKNOWN_CONTROLLER')&&!document.querySelector('#timeline button')"),"late reject restores exact state and commits no history");
 await set("example","ent_abc","change");
 await evalv("window.prompt=()=>'\"d\"';true");await clickId("new-atom");
 check(await evalv("JSON.parse(document.getElementById('selection').textContent).payload==='d'"),"create atom");
 const created=await evalv("JSON.parse(document.getElementById('selection').textContent).identity.id");
 await clickId("new-relation");
 await clickPoint(await pos('[data-anchor="P:r2"]'));
 await clickPoint(await pos('[data-anchor="N:'+created+'"]'));
 check(await evalv("JSON.parse(document.getElementById('selection').textContent).owner.id==='r2'"),"create relation by selecting identity endpoints");
 await clickId("delete-identity");
 check(await evalv("!document.querySelector('[data-identity=\"P:studio:P:1\"]')"),"delete newly created relation");
 await clickPoint(await pos('[data-anchor="N:'+created+'"]'));await clickId("delete-identity");
 check(await evalv("!document.querySelector('[data-identity=\"N:studio:N:1\"]')"),"delete unreferenced atom");
 await clickPoint(await pos('[data-anchor="P:s1"]'));const beforeReject=await exact();await clickId("delete-identity");
 check((await exact())===beforeReject&&await evalv("document.getElementById('last-reject').textContent.includes('RELATION_REFERENCED')"),"referenced deletion rejected atomically");
 await clickId("zoom-out");await shot("05-editing","header");

 // Both public historical entry points lead to the canonical UI, not a generation selector.
 const publicBase="http://127.0.0.1:"+server.address().port;
 for(const route of ["/","/site/","/site/mo-studio.html"]){
  await send("Page.navigate",{url:publicBase+route});
  for(let i=0;i<100;i++){if(await evalv("location.pathname.endsWith('/unified-studio.html')&&!!document.querySelector('#network [data-identity]')"))break;await sleep(50)}
  check(await evalv("location.pathname.endsWith('/unified-studio.html')&&!!document.querySelector('#network [data-identity]')"),"canonical redirect "+route);
 }
 await evalv("window.confirm=()=>true;true");
 await set("example","ent_abc","change");await clickId("zoom-out");
 const begin=await pos('[data-identity="P:r2"] [data-socket="B"]');
 const to=await rawpos('[data-anchor="P:r2"]');
 await drag(begin,to);
 check(await evalv("!!document.querySelector('[data-from=\"P:r2\"][data-side=B][data-to=\"P:r2\"]')"),"trusted B-socket drag to relation identity");
 // Actual local file inputs, through CDP DOM.setFileInputFiles; no simulated semantic execution.
 async function upload(id,path){const doc=await send("DOM.getDocument");const node=await send("DOM.querySelector",{nodeId:doc.root.nodeId,selector:"#"+id});await send("DOM.setFileInputFiles",{nodeId:node.nodeId,files:[path]});await frame()}
 const saved=await exact(),exactFile=join(tmp,"model.json"),jsonFile=join(tmp,"source.json");
 await writeFile(exactFile,saved);await writeFile(jsonFile,'{"a":7,"$rel":"rmvm/version"}');
 await upload("import-json",jsonFile);
 for(let i=0;i<100;i++){if(await evalv("document.getElementById('source').value.includes('7')"))break;await sleep(25)}
 check((await exact())===saved&&await evalv("document.getElementById('status').textContent.includes('DIRTY')"),"file import stages independent JSON draft");
 await clickId("apply");check(await evalv("JSON.parse(document.getElementById('source').value).a===7"),"explicit file Apply");
 await evalv("document.getElementById('exact-details').open=true;true");await upload("import-exact",exactFile);
 for(let i=0;i<100;i++){if((await exact())===saved)break;await sleep(25)}
 check((await exact())===saved,"exact file roundtrip preserves model identities");
 await shot("06-exact-import","header");
 // Deterministic real file input race: only File.text completion is controlled.
 const exactB=join(tmp,"modelB.json");await set("example","ordinary","change");const savedB=await exact();await writeFile(exactB,savedB);
 await evalv("window.reads={};window.realText=File.prototype.text;File.prototype.text=function(){return new Promise((resolve,reject)=>{window.reads[this.name]={resolve,reject}})};true");
 for(const reverse of [false,true]){
  await upload("import-exact",exactFile);await upload("import-exact",exactB);
  const release=async(name,value)=>evalv("window.reads["+JSON.stringify(name)+"].resolve("+JSON.stringify(value)+");true");
  if(reverse){await release("modelB.json",savedB);await frame();await release("model.json",saved)}else{await release("model.json",saved);await frame();await release("modelB.json",savedB)}
  await frame();check((await exact())===savedB,"latest exact file wins "+(reverse?"B-first":"A-first"));
 }
 await upload("import-exact",exactFile);await clickId("cancel-import");
 await evalv("window.reads['model.json'].resolve("+JSON.stringify(saved)+");true");await frame();
 check((await exact())===savedB,"cancelled file cannot publish");
 await upload("import-exact",exactFile);await evalv("window.reads['model.json'].reject(Error('read failed'));true");await frame();
 check((await exact())===savedB&&await evalv("document.getElementById('import-status').textContent.includes('read failed')"),"exact read rejection reported");
 await evalv("File.prototype.text=window.realText;true");
 await set("example","ORS 000","change");await clickId("run");check(await evalv("document.getElementById('mode').textContent==='DATA'"),"DATA explicit mode");
 await set("example","ORS 100","change");await clickId("run");check(await evalv("document.getElementById('mode').textContent==='NO_CONTROLLER'"),"NO_CONTROLLER explicit mode");
 await set("example","where","change");await clickId("run");check(await evalv("document.getElementById('mode').textContent==='CALL'"),"CALL explicit mode");
 await send("Emulation.setDeviceMetricsOverride",{width:620,height:900,deviceScaleFactor:1,mobile:false});await frame();
 await clickPoint(await pos('[data-tab-button="network"]'));
 check(await evalv("getComputedStyle(document.querySelector('[data-panel=network]')).display!=='none'&&getComputedStyle(document.querySelector('[data-panel=source]')).display==='none'"),"narrow viewport uses shared tabs");
 await clickPoint(await pos('[data-tab-button="timeline"]'));
 check(await evalv("document.querySelectorAll('#timeline [data-step]').length===6"),"tabs preserve execution session");



 console.log("Unified Studio checks:",n);
}finally{ws?.close();if(browser&&browser.exitCode===null&&browser.signalCode===null){const closed=new Promise(r=>browser.once("close",r));browser.kill();await Promise.race([closed,sleep(3000)]);if(browser.exitCode===null&&browser.signalCode===null){browser.kill("SIGKILL");await Promise.race([closed,sleep(1000)]);}}server.closeAllConnections();await new Promise(r=>server.close(r));await rm(tmp,{recursive:true,force:true,maxRetries:10,retryDelay:150});}

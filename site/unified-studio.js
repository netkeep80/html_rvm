import {createUnifiedSession,examples,mathematicalExample,sourceIdentityAt,sourceOccurrenceInfo,occurrenceIdentity,incomingAttachments,executionStepView,createImportCoordinator,readLocalJSON,networkPresentation} from "./unified-session.js";
import {inspectNaturalEntity} from "../research/pc1/j1-natural-json.mjs";
import {projectionOccurrences,locateVPath} from "./mo-projection-sync.js";
const $=id=>document.getElementById(id);
let session=createUnifiedSession(),selected=null,frame=null,version=null,view=null,viewEvent=null,viewRun=null,gesture=null,zoom=1,creation=null;
const importer=createImportCoordinator(), historical=$("historical-source");
const source=$("source"),svg=$("network"),ns="http://www.w3.org/2000/svg",json=x=>JSON.stringify(x,null,2);
const key=e=>e.sort+":"+e.id, endpoint=k=>({sort:k[0],id:k.slice(2)});
function el(tag,attrs={},text){const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e}
function coord(ev){const p=svg.createSVGPoint();p.x=ev.clientX;p.y=ev.clientY;return p.matrixTransform(svg.getScreenCTM().inverse())}
function choose(k,highlight=true){
 if(creation){act(()=>{if(!creation.begin){creation.begin=endpoint(k);return}const c=session.createRelation(creation.begin,endpoint(k));creation=null;if(c.transition.outcome.status==="OK"){syncText();selected=key(c.identity)}});return}
 selected=k;render();if(highlight)highlightSource()
}
function sourceOwner(){return viewRun?{program:viewRun.sourceProgram,text:viewRun.sourceText,editor:historical}:session.dirty?null:{program:session.applied,text:session.appliedText,editor:source}}
function highlightSource(){
 if(!selected)return;const owner=sourceOwner();if(!owner||owner.text===null)return;
 const x=sourceOccurrenceInfo(owner.program,owner.text,endpoint(selected)).ranges[0];
 if(x)owner.editor.setSelectionRange(x.start,x.end);
}
function currentRun(){return session.running?{sourceProgram:session.applied,sourceText:session.appliedText,snapshots:session.tentative,events:session.tentative.map(x=>x.event),mode:"CALL",tentative:true}:session.branch}
function selectStep(run,index){
 creation=null;viewRun=run;const step=executionStepView(run,index);view=step.program;viewEvent=step.event;frame=step.event.frame;
 selected="P:"+(step.outputSlot??step.event.runtimeRSlot);
 $("transition-detail").textContent=json({observation:step.event,trace:step.trace,changed:step.changed});
 render();if(step.event.sourceControllerSlot){const owner=sourceOwner(),x=sourceOccurrenceInfo(owner.program,owner.text,{sort:"P",id:step.event.sourceControllerSlot}).ranges[0];if(x)owner.editor.setSelectionRange(x.start,x.end)}
}

function network(program,roles={},sourceController=null,resultEndpoint=null){
 const plan=networkPresentation(program,{applied:view?null:session.applied,roles,sourceController,resultEndpoint,selected:selected?endpoint(selected):null,all:$("network-scope").value==="all"});
 const records=plan.records,pos=new Map(plan.positions);
 for(const e of records)if(session.layout.has(key(e)))pos.set(key(e),session.layout.get(key(e)));
 svg.replaceChildren();$("network-count").textContent=records.length+" / "+plan.total+" идентичностей";
 const w=Math.max(760,...[...pos.values()].map(x=>x.x+70)),h=Math.max(420,...[...pos.values()].map(x=>x.y+55));
 const scale=plan.treeLayout?Math.min(1,svg.parentElement.clientWidth/w)*zoom:zoom;
 svg.setAttribute("viewBox","0 0 "+w+" "+h);svg.setAttribute("width",w*scale);svg.setAttribute("height",h*scale);
 for(const e of records.filter(e=>e.sort==="P")){
  const p=pos.get(key(e));
  for(const [side,end] of [[-1,e.r.owner],[1,e.r.target]]){if(!end)continue;const q=pos.get(key(end));if(!q)continue;
   const x=p.x+side*48;const d=key(e)===key(end)?`M${x} ${p.y} C${x+side*38} ${p.y-42} ${p.x} ${p.y-42} ${p.x} ${p.y}`:`M${x} ${p.y} Q${x} ${q.y} ${q.x} ${q.y}`;
   svg.append(el("path",{d,fill:"none",stroke:side===-1?"#e0b56a":"#76bbeb","stroke-width":selected===key(e)?2.8:1.4,opacity:.75,"data-from":key(e),"data-to":key(end),"data-side":side===-1?"B":"E"}));
  }
 }
 for(const e of records){
  const p=pos.get(key(e)), k=key(e),g=el("g",{transform:`translate(${p.x} ${p.y})`,tabindex:0,role:"button","aria-label":k,"data-identity":k});
  g.append(el("rect",{x:-48,y:-17,width:96,height:34,rx:e.sort==="P"?10:17,fill:e.sort==="P"?"#28425a":"#1d3544",stroke:selected===k?"#f7d17b":"#7497b5","stroke-width":selected===k?3:1}));
  g.append(el("circle",{r:8,fill:"#d9e8f7","data-anchor":k}));
  if(e.sort==="P"){for(const [x,t] of [[-48,"B"],[48,"E"]]){g.append(el("circle",{cx:x,r:8,fill:t==="B"?"#e0b56a":"#76bbeb","data-socket":t}));g.append(el("text",{x:x*.75,y:4,fill:"#edf4fb","font-size":10,"text-anchor":"middle"},t));}}
  const label=e.sort==="P"?(e.r.label.kind==="role"?e.id:String(e.r.label.value)):(["object","array"].includes(e.r.kind)?e.r.kind:e.r.kind+": "+json(e.r.payload));
  g.append(el("text",{y:-23,"text-anchor":"middle",fill:"#d4e6f7","font-size":11},label.slice(0,24)));
  const rs=Object.keys(roles).filter(r=>e.sort==="P"&&roles[r]===e.id);
  if(rs.length)g.append(el("text",{y:31,"text-anchor":"middle",fill:"#9ee5ba","font-size":11},rs.join("=")));
  g.append(el("title",{},k+" "+label));
  g.addEventListener("keydown",ev=>{if(ev.key==="Enter")choose(k)});
  svg.append(g);
 }
}
function render(){
 const p=view??session.visible,state=p.state,ownerRun=viewRun??currentRun(),events=ownerRun?.events??[];
 const active=viewEvent??events.find(x=>x.frame===frame)??events.at(-1),f=state.frames.get(frame??active?.frame??session.inspection?.frame);
 $("status").textContent=(session.dirty?"DIRTY":"APPLIED")+(session.running?" · tentative":"")+(session.diagnostic?" · "+session.diagnostic:"");
 source.disabled=session.running||!!viewRun;source.placeholder=session.projectionDiagnostic??"";
 source.hidden=!!viewRun;historical.hidden=!viewRun;if(viewRun&&historical.value!==(viewRun.sourceText??""))historical.value=viewRun.sourceText??"";
 $("return-current").hidden=!viewRun;$("mode").textContent=ownerRun?.mode??(session.lastReject?.kind==="run"?"REJECT":"—");
 $("projection-note").textContent=viewRun?"Снимок исходной метапрограммы выбранного исполнения (read-only)":session.projectionDiagnostic?"Natural JSON unavailable: "+session.projectionDiagnostic+" · точная МО сохранена":session.dirty?"Черновик не связан с применённой МО":session.projectionPartial?"JSON — частичная проекция МО. Точная модель: Export exact.":"Выбор ключа → отношение; выбор значения → payload";
 for(const id of ["apply","discard","inspect","reflect","example","import-exact"])$(id).disabled=session.running;
 $("run").disabled=$("step").disabled=!version||session.dirty||!session.executable;
 $("inspect").disabled=session.running||session.dirty||!session.executable;
 let predicate=false;try{const c=inspectNaturalEntity(session.applied,["$sub"]).controller;predicate=c==="is_string"||c==="is_null"}catch{}
 $("reflect").disabled=session.running||session.dirty||!session.executable||!predicate;
 $("apply").disabled=session.running||!session.dirty;
 const canEdit=!view&&!session.running&&!session.dirty&&!session.branch&&!session.inspection;
 for(const id of ["new-atom","new-relation","advanced-apply"])$(id).disabled=!canEdit;
 $("delete-identity").disabled=!canEdit||!selected||selected==="P:j1:source-root";
 $("cancel-create").hidden=!creation;$("create-note").textContent=creation?(creation.begin?"Выберите конец нового дуплета":"Выберите начало нового дуплета"):"";
 $("import-json").disabled=session.running||session.dirty;$("export-json").disabled=session.appliedText===null;
 $("import-exact").disabled=session.running||session.dirty;
 network(p,f?.roles,active?.sourceControllerSlot??session.inspection?.sourceSlots.R?.id??null,viewEvent?executionStepView(viewRun,viewRun.events.indexOf(viewEvent)).resultEndpoint:(viewRun??session.branch)?.resultEndpoint);const ep=selected?endpoint(selected):null,record=ep?(ep.sort==="N"?state.mo.nodes:state.mo.relations).get(ep.id):null;
 $("selection").textContent=record?json({identity:ep,...record}):"Выберите идентичность";
 $("context").textContent=f?json({frame:f.id,parent:f.parent,roles:f.roles,sourceController:active?.sourceControllerSlot??session.inspection?.sourceSlots.R?.id??null,runtimeR:f.roles.R}):"—";
 $("role-cards").replaceChildren();if(f){for(const [role,id] of Object.entries(f.roles)){const b=document.createElement("button");b.textContent=role;b.title=id;b.dataset.alias=String(Object.values(f.roles).filter(x=>x===id).length>1);b.onclick=()=>choose("P:"+id);$("role-cards").append(b)}}
 $("last-reject").textContent=session.lastReject?"REJECT · "+session.lastReject.diagnostic+" · committed state unchanged":"";
 const resultRun=ownerRun&&!ownerRun.tentative?ownerRun:null;
 const step=viewEvent&&viewRun?executionStepView(viewRun,viewRun.events.indexOf(viewEvent)):null;
 $("result").textContent=viewEvent?json(viewEvent.result):resultRun?json(resultRun.result):session.running?"Предварительное осуществление":"—";
 $("exact").textContent=session.lossless();
 $("incoming").replaceChildren();if(ep)for(const a of incomingAttachments(p,ep)){const btn=document.createElement("button");btn.textContent=a.side+" ← "+key(a.identity);btn.onclick=()=>choose(key(a.identity));$("incoming").append(btn)}
 $("step-identities").replaceChildren();if(step){const ids=[["Source controller",step.event.sourceControllerSlot],["Runtime R",step.event.runtimeRSlot],["Output "+step.event.outputRole,step.outputSlot]];for(const [label,id] of ids){if(!id)continue;const btn=document.createElement("button");btn.textContent=label;btn.dataset.identity="P:"+id;btn.onclick=()=>choose("P:"+id);$("step-identities").append(btn)}for(const e of step.changed){const btn=document.createElement("button");btn.textContent=e.kind+" "+key(e);btn.disabled=e.kind==="dead";btn.onclick=()=>choose(key(e));$("step-identities").append(btn)}}
 $("occurrences").replaceChildren();$("result-occurrences").replaceChildren();
 function bounded(container,info){if(info.truncated||info.diagnostic){const note=document.createElement("span");note.className="occurrence-warning";note.textContent=info.truncated?"Неполный список: достигнут предел 256 путей / 4096 посещений. "+(info.diagnostic??""):info.diagnostic;container.append(note)}}
 const own=sourceOwner();
 if(ep&&own&&own.text!==null){const info=sourceOccurrenceInfo(own.program,own.text,ep);for(const x of info.ranges){const b=document.createElement("button");b.textContent=json(x.path);b.onclick=()=>own.editor.setSelectionRange(x.start,x.end);$("occurrences").append(b)}bounded($("occurrences"),info)}
 const resultProgram=step?.program??resultRun?.program,resultRoot=step?.resultEndpoint??resultRun?.resultEndpoint;
 if(ep&&resultProgram&&resultRoot){const v=projectionOccurrences(resultProgram.state.mo,resultRoot,ep);for(const path of v.paths){const b=document.createElement("button");b.textContent="Result "+json(path);b.onclick=()=>{const q=occurrenceIdentity(resultProgram,resultRoot,path,ep);if(q)choose(key(q))};$("result-occurrences").append(b)}bounded($("result-occurrences"),v)}
 $("timeline").replaceChildren();
 for(const [index,e] of events.entries()){const b=document.createElement("button");b.textContent=e.controller+(e.iteration===null?"":" ["+e.iteration+"]")+" → "+json(e.result);b.dataset.tentative=String(!!ownerRun.tentative);b.dataset.step=String(index);b.onclick=()=>selectStep(ownerRun,index);$("timeline").append(b)}
 let runNo=0;
 for(const entry of session.history){const b=document.createElement("button");
  if(entry.kind==="run"){const run=entry.run;b.textContent="Run "+(++runNo)+": "+json(run.result);b.onclick=()=>{creation=null;view=run.program;viewRun=run;viewEvent=null;selected=null;frame=run.events.at(-1)?.frame??null;$("transition-detail").textContent=json({events:run.events,trace:run.trace});render()}}
  else{b.textContent=entry.kind==="Q"?"Q: reflection":entry.actions.map(x=>x.op).join(", ");b.onclick=()=>{$("transition-detail").textContent=json(entry)}}
  $("timeline").append(b)
 }

}
function act(fn){importer.cancel();if($("import-status").textContent.startsWith("Чтение "))$("import-status").textContent="Импорт отменён изменением сеанса";try{fn();render()}catch(e){render();$("status").textContent=e.message}}
function clearView(){creation=null;view=null;viewEvent=null;viewRun=null;frame=null;$("transition-detail").textContent=""}
function syncText(){source.value=session.draft??""}
svg.addEventListener("pointerdown",ev=>{if(ev.button!==0)return;const g=ev.target.closest("[data-identity]");if(!g)return;const k=g.dataset.identity,p=coord(ev),side=ev.target.dataset.socket;gesture={k,side,start:p,base:session.layout.get(k)??{x:g.transform.baseVal.getItem(0).matrix.e,y:g.transform.baseVal.getItem(0).matrix.f}};svg.setPointerCapture(ev.pointerId);ev.preventDefault()});
svg.addEventListener("pointermove",ev=>{if(!gesture)return;const p=coord(ev);if(Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)<5&&!gesture.moved)return;gesture.moved=true;if(gesture.side){gesture.line?.remove();gesture.line=el("line",{x1:gesture.start.x,y1:gesture.start.y,x2:p.x,y2:p.y,stroke:"#f7d17b","stroke-width":2,"pointer-events":"none"});svg.append(gesture.line)}else{session.layout.set(gesture.k,{x:Math.max(50,gesture.base.x+p.x-gesture.start.x),y:Math.max(30,gesture.base.y+p.y-gesture.start.y)});render()}});
svg.addEventListener("pointerup",ev=>{if(!gesture)return;const g=gesture;gesture=null;g.line?.remove();if(!g.moved){choose(g.k);return}if(!g.side)return;const target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest("[data-anchor]")?.dataset.anchor;if(!target)return;act(()=>{if(view||session.running||session.dirty||session.branch||session.inspection)throw Error("Edit only applied model; reset or apply first");const a=endpoint(g.k),b=endpoint(target);if(!session.applied.state.mo.relations.has(a.id)||!(b.sort==="P"?session.applied.state.mo.relations:session.applied.state.mo.nodes).has(b.id))throw Error("Runtime-only identity cannot edit applied model");const r=session.applied.state.mo.relations.get(a.id);if(!confirm(g.side+": "+key(r[g.side==="B"?"owner":"target"]??a)+" → "+target))return;const t=session.endpoint(a.id,g.side,b);if(t.outcome.status==="OK"){syncText();clearView();selected=g.k}})});
svg.addEventListener("pointercancel",()=>{gesture?.line?.remove();gesture=null;render()});
for(const name of Object.keys(examples)){const o=document.createElement("option");o.value=name;o.textContent=name;$("example").append(o)}
$("example").value="where";syncText();
let example="where";
$("example").onchange=()=>act(()=>{if(session.dirty&&!confirm("Отбросить черновик?")){$("example").value=example;return}example=$("example").value;session=examples[example]===null?createUnifiedSession(null,{model:mathematicalExample(example)}):createUnifiedSession(examples[example]);syncText();selected=null;clearView()});
source.oninput=()=>act(()=>session.edit(source.value));
function selectSource(){const owner=sourceOwner();if(owner&&owner.text!==null){const e=sourceIdentityAt(owner.program,owner.text,owner.editor.selectionStart);if(e)choose(key(e),false)}}
for(const editor of [source,historical]){editor.addEventListener("click",selectSource);editor.addEventListener("keyup",selectSource)}
$("return-current").onclick=()=>act(()=>{clearView();selected=null});
$("apply").onclick=()=>act(()=>{if(session.projectionPartial&&!confirm("Apply заново субъективирует JSON. Дополнительные отношения и текущие идентичности не сохраняются. Продолжить?"))return;if(session.apply()){selected=null;clearView()}});
$("discard").onclick=()=>act(()=>{session.discard();syncText()});
$("reset").onclick=()=>act(()=>{session.reset();clearView()});
$("layout-reset").onclick=()=>act(()=>{session.layout.clear();zoom=1});
$("network-scope").onchange=()=>act(()=>{session.layout.clear();zoom=1});
$("zoom-in").onclick=()=>act(()=>{zoom=Math.min(2,zoom*1.2)});
$("zoom-out").onclick=()=>act(()=>{zoom=Math.max(.5,zoom/1.2)});
$("inspect").onclick=()=>act(()=>{clearView();session.inspect()});
const env=()=>({version,meta:{engine:"html_rvm",slice:"J1"}});
$("step").onclick=()=>act(()=>{clearView();session.step(env())});
$("run").onclick=()=>act(()=>{clearView();session.run(env())});
$("reflect").onclick=()=>act(()=>{const c=inspectNaturalEntity(session.applied,["$sub"]).controller;const e=session.reflect(["$sub"],"R",c==="is_string"?"is_null":"is_string");syncText();selected="P:"+e.sourceSlot.id;clearView()});
function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),0)}
$("export-exact").onclick=()=>download(session.lossless(),"mo-exact.json");
$("export-json").onclick=()=>act(()=>{if(session.projectionPartial&&!confirm("Экспорт JSON сохраняет значения, но не все идентичности и отношения. Продолжить?"))return;download(session.exportSource(),"natural.json")});
function importFile(event,exact){
 const input=event.target,file=input.files[0];input.value="";if(!file)return;
 const owner=session,base=owner.applied,draft=owner.draft;
 $("import-status").textContent="Чтение "+file.name;
 return importer.request(async()=>{const text=await file.text();return exact?text:await readLocalJSON(text)},text=>{
  if(owner!==session||base!==owner.applied||draft!==owner.draft||session.running){$("import-status").textContent="Импорт отменён изменением сеанса";return}
  const ok=exact?session.importExact(text):session.stageDocument(text);
  if(ok){syncText();selected=null;clearView()}
  render();$("import-status").textContent=ok?"Импортирован "+file.name:"REJECT · "+session.diagnostic;
 },err=>{$("import-status").textContent="REJECT · "+err.message});
}
$("import-json").onchange=e=>importFile(e,false);
$("new-atom").onclick=()=>act(()=>{const text=prompt("JSON scalar","null");if(text===null)return;const c=session.createAtom(JSON.parse(text));if(c.transition.outcome.status==="OK"){syncText();selected=key(c.identity)}});
$("new-relation").onclick=()=>act(()=>{creation={begin:null}});
$("cancel-create").onclick=()=>act(()=>{creation=null});
$("delete-identity").onclick=()=>act(()=>{if(selected&&confirm("Удалить "+selected+"?")){const t=session.remove(endpoint(selected));if(t.outcome.status==="OK"){selected=null;syncText()}}});
$("advanced-apply").onclick=()=>act(()=>{const t=session.atomic(JSON.parse($("advanced-actions").value));if(t.outcome.status==="OK"){syncText();selected=null;clearView()}});

$("import-exact").onchange=e=>importFile(e,true);
$("cancel-import").onclick=()=>{importer.cancel();$("import-status").textContent="Импорт отменён"};
function selectTab(name){document.body.dataset.tab=name;for(const b of document.querySelectorAll("[data-tab-button]"))b.setAttribute("aria-selected",String(b.dataset.tabButton===name));render()}
for(const b of document.querySelectorAll("[data-tab-button]"))b.onclick=()=>selectTab(b.dataset.tabButton);

render();
fetch("./build-info.json").then(r=>{if(!r.ok)throw Error("build metadata");return r.json()}).then(m=>{if(!/^[0-9]{2}\.[0-9]{2}$/.test(m.version))throw Error("invalid version");version=m.version;$("version").textContent=version;render()}).catch(()=>{$("version").textContent="Нет build-info · Run/Step недоступны"});

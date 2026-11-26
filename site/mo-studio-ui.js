import {mountVisualGraph} from "./mo-visual-graph.js";
import {locateVPath,syncSnapshot} from "./mo-projection-sync.js";
import {createTransitionObserver} from "./mo-transition-observer.js";
import {createStudio} from "./mo-studio.js";
const $=id=>document.getElementById(id);
const studio=createStudio();
let selected=null;
let visual=null;
const transitions=createTransitionObserver(32);
const pretty=x=>JSON.stringify(x,null,2);
const ep=x=>x?x.sort+":"+x.id:"—";
const operations={
 createNode:[["id","ID"],["kind","Тип","kind"],["payload","Payload JSON","json"]],
 setNode:[["id","ID"],["kind","Тип","kind"],["payload","Payload JSON","json"]],
 deleteNode:[["id","ID"]],createRelation:[["id","ID"],["owner","Owner","endpoint"],["label","Label","label"],["target","Target (пусто = unbound)","optionalEndpoint"]],
 deleteRelation:[["id","ID"]],relabelRelation:[["id","ID"],["label","Label","label"]],
 moveRelation:[["id","ID"],["owner","Owner","endpoint"],["label","Новый label (пусто = сохранить)","optionalLabel"]],
 rebindRelation:[["id","ID"],["target","Target (пусто = unbind)","optionalEndpoint"]],
 setRoots:[["roots","Корни — массив endpoint JSON","json"]],
 reassert:[["id","ID"],["freshId","Новый ID"]]
};
function element(tag,text){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;}
function option(value,text){const el=element("option",text);el.value=value;return el;}
function fields(){
 const box=$("fields");box.replaceChildren();
 for(const [name,title,type] of operations[$("op").value]){
  const label=element("label",title);label.htmlFor="field-"+name;box.append(label);
  const input=element(type==="kind"||type==="endpoint"||type==="optionalEndpoint"?"select":"input");input.id="field-"+name;input.dataset.type=type??"text";
  if(type==="kind")for(const k of ["entity","null","boolean","number","string","array","object"])input.append(option(k,k));
  else if(type==="endpoint"||type==="optionalEndpoint"){
   input.append(option("",type==="endpoint"?"— выберите —":"∅ unbound"));
   for(const sort of ["N","P"])for(const id of (sort==="N"?studio.state.nodes:studio.state.relations).keys())input.append(option(pretty({sort,id}),sort+":"+id));
  }else if(name==="id"&&selected)input.value=selected.id;
  else if(type==="json")input.value=name==="roots"?pretty(studio.state.roots):"null";
  else if(type==="label")input.value='{"kind":"role","value":"r"}';
  box.append(input);
 }
}
function parseAction(){
 const a={op:$("op").value};
 for(const [name,,type] of operations[a.op]){
  const v=$("field-"+name).value;
  if(type==="optionalEndpoint"&&!v){a[name]=null;continue;}
  if(type==="optionalLabel"&&!v)continue;
  a[name]=["json","label","optionalLabel","endpoint","optionalEndpoint"].includes(type)?JSON.parse(v):v;
 }
 return a;
}
function notify(t){$("status").textContent=t.outcome.status+(t.outcome.diagnostic?" · "+t.outcome.diagnostic:"")+(t.message?" · "+t.message:"")+(t.session?" · новый сеанс":"");$("status").className=t.outcome.status==="REJECT"?"reject":"";}
function run(fn,meta={source:"graph"}){try{const t=fn();notify(t);const resolved={...meta,action:typeof meta.action==="function"?meta.action():meta.action};transitions.observe(t,resolved);if(t.session){selected=null;$("sync-path").value="[]";visual?.reset();}render();}catch(e){$("status").textContent="INPUT_ERROR · "+e.message;$("status").className="reject";}}
function records(){
 const s=studio.state;const tbody=$("records");tbody.replaceChildren();const filter=$("filter").value.toLowerCase();
 for(const [sort,map] of [["N",s.nodes],["P",s.relations]])for(const [id,r] of map){
  if(!id.toLowerCase().includes(filter))continue;
  const tr=element("tr");if(selected?.sort===sort&&selected.id===id)tr.className="selected";
  const button=element("button",sort+":"+id);button.type="button";button.onclick=()=>selectEndpoint({sort,id});
  const first=element("td");first.append(button);tr.append(first,element("td",sort==="N"?r.kind:ep(r.owner)),element("td",pretty(sort==="N"?r.payload:r.label)),element("td",sort==="P"?r.bound?ep(r.target):"∅":"—"));tbody.append(tr);
 }
}
function inspect(){
 const s=studio.state;const r=selected&&(selected.sort==="N"?s.nodes:s.relations).get(selected.id);
 if(!r)selected=null;
 const incoming=selected?[...s.relations].filter(([,p])=>[p.owner,p.target].some(x=>x?.sort===selected.sort&&x.id===selected.id)).map(([id,p])=>({id,...p})):[];
 $("selection").textContent=r?pretty({identity:selected,...r,references:incoming}):"—";
 $("identity").textContent=pretty({roots:s.roots,used:{N:[...s.used.N],P:[...s.used.P]}});
}
function projection(){
 const value=$("projection-root").value;const p=studio.projection(value?JSON.parse(value):undefined);
 $("plain").textContent=p.ok?pretty(p.value):"PROJECTION UNDEFINED · "+p.diagnostic;
}
function projectionRoot(){const value=$("projection-root").value;return value?JSON.parse(value):studio.state.roots[0];}
function readSyncPath(){try{const p=JSON.parse($("sync-path").value);return Array.isArray(p)?{ok:true,path:p}:{ok:false,diagnostic:"JSON_PATH_INVALID"};}catch{return {ok:false,diagnostic:"JSON_PATH_INVALID"};}}
function renderSync(){
 const root=projectionRoot(),snap=syncSnapshot(studio.state,root,selected),raw=readSyncPath();
 $("sync-selected").textContent=selected?ep(selected):"—";
 $("sync-v").textContent=pretty(snap.v.ok?{status:"DEFINED",occurrences:snap.v.paths,truncated:snap.v.truncated}:{status:"UNDEFINED",diagnostic:snap.v.diagnostic,occurrences:[]});
 $("sync-g").textContent=snap.g?pretty(snap.g):"—";
 $("sync-locality").textContent=snap.canonical.ok?"LOCAL · canonical JSON tree · path edit is uniquely defined":"NONLOCAL · "+snap.canonical.diagnostic+" · JSON edit shortcut disabled";
 const located=raw.ok?locateVPath(studio.state,root,raw.path):{ok:false,diagnostic:raw.diagnostic,node:null,relation:null};
 $("sync-path-status").textContent=located.ok?"V path → "+ep(located.node)+(located.relation?" via "+ep(located.relation):" · root"):"V path unavailable · "+located.diagnostic;
 $("sync-locate-node").disabled=!located.ok;
 $("sync-locate-relation").disabled=!located.ok||!located.relation;
 $("sync-use-edit").disabled=!snap.editablePath;
 $("sync-use-edit").dataset.path=snap.editablePath?JSON.stringify(snap.editablePath):"";
}
function selectEndpoint(value){selected=value;inspect();records();fields();renderSync();visual?.render();}
function transitionDisplay(value){return {source:value.source,action:value.action,committed:value.committed,"Π":value.pi,"Ω":value.omega,born:value.born,dead:value.dead,trace:value.trace};}
function renderTransitions(){
 const last=transitions.last,history=transitions.history;
 $("transition-view").textContent=last?pretty(transitionDisplay(last)):"—";
 $("transition").textContent=last?pretty({persistence:last.pi,outcome:last.omega,born:last.born,dead:last.dead,...(last.trace===null?{}:{trace:last.trace})}):"—";
 $("transition-count").textContent=history.length;
 const box=$("transition-history");box.replaceChildren();
 for(const entry of [...history].reverse()){
  const card=element("article");card.className="transition-entry";card.dataset.seq=entry.seq;
  const summary=element("div","#"+entry.seq+" · "+entry.source+" · "+entry.omega.status+" · semanticChange="+entry.omega.semanticChange+" · born N/P "+entry.born.N.length+"/"+entry.born.P.length+" · dead N/P "+entry.dead.N.length+"/"+entry.dead.P.length);summary.className="transition-summary";
  const detail=element("pre",pretty(transitionDisplay(entry)));card.append(summary,detail);box.append(card);
 }
}

function render(){
 const s=studio.state;
 $("n-count").textContent=s.nodes.size;$("p-count").textContent=s.relations.size;$("used-count").textContent=s.used.N.size+" / "+s.used.P.size;$("root-count").textContent=s.roots.length;
 inspect();records();fields();
 const selector=$("projection-root");const previous=selector.value;selector.replaceChildren();
 for(const r of s.roots)selector.append(option(pretty(r),ep(r)));
 if([...selector.options].some(o=>o.value===previous))selector.value=previous;
 projection();renderSync();renderTransitions();
 $("lossless").textContent=pretty(JSON.parse(studio.lossless()));
 const tree=studio.treeStatus();$("tree-status").textContent=tree.ok?"Canonical tree · редактирование разрешено":"Редактирование недоступно · "+tree.diagnostic;$("json-apply").disabled=!tree.ok;
 visual?.render();
}
for(const op of Object.keys(operations))$("op").append(option(op,op));
$("op").onchange=fields;$("filter").oninput=records;$("projection-root").onchange=()=>{projection();renderSync();};$("sync-path").oninput=renderSync;
$("sync-locate-node").onclick=()=>{const raw=readSyncPath(),located=raw.ok?locateVPath(studio.state,projectionRoot(),raw.path):raw;if(located.ok)selectEndpoint(located.node);};
$("sync-locate-relation").onclick=()=>{const raw=readSyncPath(),located=raw.ok?locateVPath(studio.state,projectionRoot(),raw.path):raw;if(located.ok&&located.relation)selectEndpoint(located.relation);};
$("sync-use-edit").onclick=()=>{const snap=syncSnapshot(studio.state,projectionRoot(),selected);if(snap.editablePath){$("json-path").value=JSON.stringify(snap.editablePath);$("sync-path-status").textContent="Occurrence copied to JSON edit path";}};
$("action-form").onsubmit=e=>{e.preventDefault();let action;run(()=>{action=parseAction();return studio.action(action);},{source:"action",action:()=>action});};
$("atomic").onclick=()=>{let actions;run(()=>{actions=JSON.parse($("batch").value);return studio.atomic(actions);},{source:"atomic",action:()=>actions});};
$("json-form").onsubmit=e=>{e.preventDefault();let action;run(()=>{const op=$("json-op").value;action={op,path:JSON.parse($("json-path").value),...(op==="remove"?{}:{value:JSON.parse($("json-value").value)})};return studio.edit(action);},{source:"json-edit",action:()=>action});};
$("import").onclick=()=>{if(confirm("Заменить текущий сеанс МО?")){run(()=>studio.load($("import-text").value,$("import-mode").value),{source:"session-load"});}};
for(const id of ["tree","graph","empty"])$(id).onclick=()=>{if(confirm("Заменить текущий сеанс МО?")){selected=null;run(()=>studio.reset(id),{source:"session-reset"});}};
$("export").onclick=()=>{const url=URL.createObjectURL(new Blob([studio.lossless()],{type:"application/json"}));const a=element("a");a.href=url;a.download="mo-state.json";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
fetch("./build-info.json").then(r=>r.json()).then(i=>{$("version").textContent=/^[0-9]{2}\.[0-9]{2}$/.test(i.version)?i.version:"";}).catch(()=>{});
visual=mountVisualGraph({studio,getSelected:()=>selected,select:selectEndpoint,run});
render();

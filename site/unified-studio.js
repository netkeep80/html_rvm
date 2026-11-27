import {createUnifiedSession,examples} from "./unified-session.js";
import {inspectNaturalEntity} from "../research/pc1/j1-natural-json.mjs";
const $=id=>document.getElementById(id);
let session=createUnifiedSession(), selected=null, frame=null, version=null, history=[];
const source=$("source"), svg=$("network"), ns="http://www.w3.org/2000/svg";
const json=x=>JSON.stringify(x,null,2);
function el(tag,attrs={},text){const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e}
function key(e){return e.sort+":"+e.id}
function network(program){
 const mo=program.state.mo, records=[...Array.from(mo.nodes,([id,r])=>({sort:"N",id,r})),...Array.from(mo.relations,([id,r])=>({sort:"P",id,r}))];
 svg.replaceChildren();const cols=4, pos=new Map();
 records.forEach((e,i)=>pos.set(key(e),session.layout.get(key(e))??{x:95+i%cols*180,y:45+Math.floor(i/cols)*76}));
 svg.setAttribute("width",760);svg.setAttribute("height",Math.max(420,90+Math.ceil(records.length/cols)*76));
 for(const e of records.filter(e=>e.sort==="P")){
  const p=pos.get(key(e));
  for(const [side,end] of [[-1,e.r.owner],[1,e.r.target]]){if(!end)continue;const q=pos.get(key(end));if(!q)continue;
   const x=p.x+side*48;const d=key(e)===key(end)?`M${x} ${p.y} C${x+side*38} ${p.y-42} ${p.x} ${p.y-42} ${p.x} ${p.y}`:`M${x} ${p.y} Q${x} ${q.y} ${q.x} ${q.y}`;
   svg.append(el("path",{d,fill:"none",stroke:side===-1?"#e0b56a":"#76bbeb","stroke-width":1.4,opacity:.72}));
  }
 }
 for(const e of records){
  const p=pos.get(key(e)), g=el("g",{transform:`translate(${p.x} ${p.y})`,tabindex:0,role:"button","aria-label":key(e),"data-identity":key(e)});
  g.append(el("rect",{x:-48,y:-17,width:96,height:34,rx:e.sort==="P"?10:17,fill:e.sort==="P"?"#28425a":"#1d3544",stroke:selected===key(e)?"#f7d17b":"#7497b5","stroke-width":selected===key(e)?3:1}));
  g.append(el("circle",{r:4,fill:"#d9e8f7"}));
  if(e.sort==="P"){for(const [x,t] of [[-48,"B"],[48,"E"]]){g.append(el("circle",{cx:x,r:4,fill:t==="B"?"#e0b56a":"#76bbeb"}));g.append(el("text",{x:x*.75,y:4,fill:"#edf4fb","font-size":10,"text-anchor":"middle"},t));}}
  const label=e.sort==="P"?String(e.r.label.value):e.r.kind+(Object.hasOwn(e.r,"payload")?": "+json(e.r.payload):"");
  g.append(el("text",{y:-23,"text-anchor":"middle",fill:"#d4e6f7","font-size":11},label.slice(0,24)));
  g.append(el("title",{},key(e)+" "+label));
  const choose=()=>{selected=key(e);render()};
  g.addEventListener("click",choose);g.addEventListener("keydown",ev=>{if(ev.key==="Enter")choose()});
  svg.append(g);
 }
}
function render(){
 const p=session.visible, state=p.state;
 $("status").textContent=(session.dirty?"DIRTY":"APPLIED")+(session.running?" · tentative":"")+(session.diagnostic?" · "+session.diagnostic:"");
 $("source").disabled=session.running;
 for(const id of ["apply","discard","inspect","reflect","example"])$(id).disabled=session.running;
 $("run").disabled=$("step").disabled=!version||session.dirty;
 $("inspect").disabled=session.running||session.dirty;
 let predicate=false;try{const c=inspectNaturalEntity(session.applied,["$sub"]).controller;predicate=c==="is_string"||c==="is_null"}catch{}
 $("reflect").disabled=session.running||session.dirty||!predicate;
 network(p);const record=selected?([...state.mo.nodes].find(([id])=>"N:"+id===selected)??[...state.mo.relations].find(([id])=>"P:"+id===selected)):null;
 $("selection").textContent=record?json(record):"Выберите идентичность";
 const events=session.running?session.tentative.map(x=>x.event):session.branch?.events??[];
 const active=events.find(x=>x.frame===frame)??events.at(-1);
 const f=state.frames.get(active?.frame??session.inspection?.frame);
 $("context").textContent=f?json({frame:f.id,parent:f.parent,roles:f.roles,sourceController:active?.sourceControllerSlot??session.inspection?.sourceSlots.R?.id??null,runtimeR:f.roles.R}):"—";
 $("result").textContent=session.branch?json(session.branch.result):session.running?"Предварительное осуществление":"—";
 $("exact").textContent=session.lossless();
 $("timeline").replaceChildren();
 for(const e of events){const b=document.createElement("button");b.textContent=e.controller+(e.iteration===null?"":" ["+e.iteration+"]")+" → "+json(e.result);b.dataset.tentative=String(session.running);b.onclick=()=>{frame=e.frame;selected="P:"+e.runtimeRSlot;render()};$("timeline").append(b)}
 for(const h of history){const s=document.createElement("span");s.textContent=h;$("timeline").append(s)}
}
function act(fn){try{fn();render()}catch(e){render();$("status").textContent=e.message}}
for(const [name,text] of Object.entries(examples)){const o=document.createElement("option");o.value=name;o.textContent=name;$("example").append(o)}
$("example").value="where";source.value=session.draft;
$("example").onchange=()=>act(()=>{if(session.dirty&&!confirm("Отбросить черновик?"))return;session=createUnifiedSession(examples[$("example").value]);source.value=session.draft;selected=frame=null;history=[]});
source.oninput=()=>act(()=>session.edit(source.value));
$("apply").onclick=()=>act(()=>{if(session.apply()){selected=frame=null;history=[]}});
$("discard").onclick=()=>act(()=>{session.discard();source.value=session.draft});
$("reset").onclick=()=>act(()=>{session.reset();frame=null});
$("inspect").onclick=()=>act(()=>session.inspect());
const env=()=>({version,meta:{engine:"html_rvm",slice:"J1"}});
$("step").onclick=()=>act(()=>session.step(env()));
$("run").onclick=()=>act(()=>session.run(env()));
$("reflect").onclick=()=>act(()=>{const c=inspectNaturalEntity(session.applied,["$sub"]).controller;const before=session.branch?.result;const e=session.reflect(["$sub"],"R",c==="is_string"?"is_null":"is_string");history.push("Q: "+c+" → "+inspectNaturalEntity(session.applied,["$sub"]).controller+(before===undefined?"":" · прежний результат "+json(before)));source.value=session.draft;selected="P:"+e.sourceSlot.id;frame=null});
render();
fetch("./build-info.json").then(r=>{if(!r.ok)throw Error("build metadata");return r.json()}).then(m=>{if(!/^[0-9]{2}\.[0-9]{2}$/.test(m.version))throw Error("invalid version");version=m.version;$("version").textContent=version;render()}).catch(()=>{$("version").textContent="Нет build-info · Run/Step недоступны"});

import { executePC2A2, snapshotPC2A1Session } from "../research/pc2/a1-contextual-json.mjs";
import { cloneStrictJSON } from "../src/strict-json.js";
import { N,P,Role,createMOState,executeMO,executeMOAtomically } from "../src/mo-core.js";
import { subjectivateNaturalJSON, objectivateNaturalJSON, stepNaturalJSON, reflectiveReplaceRole, instantiateNaturalEntity } from "../research/pc1/j1-natural-json.mjs";
import { serializeE1State,deserializeE1State,createE1State,validateE1State } from "../research/pc1/e1-witness.mjs";
import {locateVPath,projectionOccurrences} from "./mo-projection-sync.js";
import {createWorkingSession} from "../src/working-session.js";
import {MemoryDocumentProvider} from "../src/memory-document-provider.js";

export const examples = {
  ordinary: '{"a":1,"$rel":"rmvm/version"}',
  version: '{\n  "$rel/rmvm_version" : "rmvm/version",\n  "$rel/meta" : "json/meta"\n}\n',
  where: '{\n   "$obj" : [ null, 2, false, "4", {} ],\n   "$rel" : "where",\n   "$sub" : {\n      "$obj" : {"$ref":"$obj"},\n      "$rel" : "is_string"\n   }\n}\n'
};
for (let mask = 0; mask < 8; mask++) {
  const v = {a:1};
  if(mask & 4) v.$obj="O";
  if(mask & 2) v.$rel="rmvm/version";
  if(mask & 1) v.$sub="S";
  examples["ORS "+mask.toString(2).padStart(3,"0")]=JSON.stringify(v,null,2);
}

examples.reflective=examples.where;
const ref=address=>({$ref:address});
const filterSource={filter:{$obj:[null,2,false,"4",{}],$rel:"where",$sub:{$obj:ref("$obj"),$rel:"is_string"}},patch:{$obj:"is_null",$rel:"=",$sub:ref("$ent/filter/$sub/$rel")},$rel:["$ent/filter","$ent/patch","$ent/filter"]};
const pc2Examples={
 "PC2 filter / patch / filter":filterSource,
 "PC2 explicit references":{...filterSource,$rel:filterSource.$rel.map(ref)},
 "PC2 PrepareFullReport fragment":{$rel:[{$obj:ref("#/eq_entity_name"),$rel:"="},{$obj:null,$rel:"="},{$obj:["$$obj/FileName","$$obj/param11/meas_count"],$rel:"foreachobj",$sub:[{"$rel/func":{"$rel/$obj":{$obj:ref("$obj"),$rel:"="},"$rel/$rel":{$obj:ref("#/eq_entity_name"),$rel:"="}}},"$rel/func"]}]},
 "PC2 VIEW":{model:{$obj:42,$rel:"="},$rel:{$obj:ref("$ent/model"),$rel:"VIEW",$sub:ref("$rel/out")}},
 "PC2 rollback":{$obj:[{x:1},{x:2}],$rel:"foreachobj",$sub:{$obj:9,$rel:"=",$sub:ref("$obj/x")}}
};
for(const controller of ["=","ALIAS"])pc2Examples["PC2 "+(controller==="="?"COPY":"ALIAS")]={a:{x:1},b:{x:2},$rel:[{$obj:ref("$ent/a"),$rel:controller,$sub:ref("$ent/b")},{$obj:9,$rel:"=",$sub:ref("$ent/a/x")},{"$rel/result":{$obj:ref("$ent/b"),$rel:"="}}]};
for(const [name,value] of Object.entries(pc2Examples))examples[name]=JSON.stringify(value,null,2);
export function exampleExecution(name){return {profile:Object.hasOwn(pc2Examples,name)?"PC2":"J1",registry:name==="PC2 PrepareFullReport fragment"?{"#":{eq_entity_name:"="}}:{}}}
function initialPC2(program,registry){
 const sourceRoot=program.state.mo.roots[0];
 const anchor=program.state.mo.relations.get("j1:source-root");
 if(!sourceRoot||!anchor?.bound||anchor.target?.sort!==sourceRoot.sort||anchor.target?.id!==sourceRoot.id)throw Error("SOURCE_ROOT_INCOHERENT");
 return {state:program.state,sourceRoot,registry:new Map(Object.entries(cloneStrictJSON(registry))),namespace:new Map(),allocator:{N:1,P:1,F:1},host:{nextEntity:1}};
}
function pc2Metrics(program,text,run,ms){
 const state=run.session.state;
 return {sourceBytes:text===null?null:new TextEncoder().encode(JSON.stringify(JSON.parse(text))).length,
 before:{N:program.state.mo.nodes.size,P:program.state.mo.relations.size,frames:program.state.frames.size},
 after:{N:state.mo.nodes.size,P:state.mo.relations.size,frames:state.frames.size},
 committedEvents:run.committedTrace.length,attemptedEvents:run.attemptedTrace.length,
 recordedMOActions:run.committedTrace.reduce((n,e)=>n+(e.actions?.length??(e.action?1:0)),0),elapsedMs:ms};
}
export function comparePC2Examples(){
 return ["PC2 explicit references","PC2 filter / patch / filter"].map(name=>{
  const s=createUnifiedSession(examples[name]);const run=s.runPC2();
  return {name,result:run?.result??null,diagnostic:s.diagnostic,metrics:run?.metrics??null,
   filters:run?.trace.filter(e=>e.op==="iterator-exit").map(e=>e.result)??[]};
 });
}
examples.ent_abc=null;
examples["sharing + cycles"]=null;
const role=Role("pc1:e1:duplet");
export function mathematicalExample(name){
 const a=[{op:"createNode",id:"a",kind:"string",payload:"a"},{op:"createNode",id:"b",kind:"string",payload:"b"},{op:"createNode",id:"c",kind:"string",payload:"c"},
 {op:"createRelation",id:"s1",owner:N("a"),label:role,target:N("b")},
 {op:"createRelation",id:"r2",owner:P("s1"),label:role,target:N("c")}];
 if(name==="sharing + cycles"){
  a.push({op:"createRelation",id:"s2",owner:N("a"),label:role,target:N("b")},
  {op:"createRelation",id:"shared",owner:P("s1"),label:role,target:P("s1")},
  {op:"createRelation",id:"self",owner:N("a"),label:role,target:P("s1")},
  {op:"rebindRelation",id:"self",target:P("self")},
  {op:"createRelation",id:"mutual",owner:P("self"),label:role,target:P("shared")},
  {op:"moveRelation",id:"shared",owner:P("mutual")});
 }
 a.push({op:"setRoots",roots:[P("r2")]});
 const t=executeMOAtomically(createMOState(),a);
 if(t.outcome.status!=="OK")throw Error(t.outcome.diagnostic);
 return {state:createE1State(t.state)};
}
// Presentation-only JSON ranges. JSON.parse admits duplicate keys; Studio rejects them
// explicitly because a duplicate source occurrence cannot map unambiguously to a member.
export function sourceRanges(text){
 JSON.parse(text);
 let i=0;const out=[];
 const ws=()=>{while(/\s/.test(text[i]??"")&&i<text.length)i++};
 function str(){const start=i++;while(i<text.length){const c=text[i++];if(c==="\\")i++;else if(c==='"')return JSON.parse(text.slice(start,i))}throw Error("Invalid string")}
 function visit(path,start,depth=0){if(depth>128||out.length>=100000)throw Error("Source range limit");ws();const valueStart=i, rec={path,start:start??i,valueStart,end:null};out.push(rec);
  if(text[i]==="{"){i++;ws();const seen=new Set();if(text[i]!=="}"){while(true){ws();const kstart=i,k=str();if(seen.has(k))throw Error("Duplicate source key: "+k);seen.add(k);ws();i++;visit([...path,k],kstart,depth+1);ws();if(text[i]!==",")break;i++}}i++}
  else if(text[i]==="["){i++;ws();let n=0;if(text[i]!=="]"){while(true){visit([...path,n++],undefined,depth+1);ws();if(text[i]!==",")break;i++}}i++}
  else if(text[i]==='"')str();else while(i<text.length&&!/[\s,\]}]/.test(text[i]))i++;
  rec.end=i;
 }
 visit([]);return out;
}
export function sourceIdentityAt(program,text,offset){
 const ranges=sourceRanges(text).filter(x=>x.start<=offset&&offset<x.end).sort((a,b)=>b.path.length-a.path.length);
 if(!ranges.length)return null;
 const x=ranges[0],v=locateVPath(program.state.mo,undefined,x.path);
 if(!v.ok)return null;
 return offset<x.valueStart&&v.relation?v.relation:v.node;
}
export function sourceOccurrenceInfo(program,text,identity){
 if(text===null)return {ranges:[],truncated:false,diagnostic:"SOURCE_UNAVAILABLE"};
 const v=projectionOccurrences(program.state.mo,undefined,identity);
 if(!v.ok)return {ranges:[],truncated:false,diagnostic:v.diagnostic};
 const paths=new Set(v.paths.map(x=>JSON.stringify(x)));
 try{return {ranges:sourceRanges(text).filter(x=>paths.has(JSON.stringify(x.path))),truncated:v.truncated,diagnostic:null}}
 catch(e){return {ranges:[],truncated:true,diagnostic:e.message}}
}
export function rangesForIdentity(program,text,identity){return sourceOccurrenceInfo(program,text,identity).ranges}
export function occurrenceIdentity(program,root,path,selected){
 const v=locateVPath(program.state.mo,root,path),e=selected.sort==="P"?v.relation:v.node;
 return v.ok&&e?.sort===selected.sort&&e.id===selected.id?e:null;
}
export function incomingAttachments(program,identity){
 const out=[];
 for(const [id,r] of program.state.mo.relations)for(const [side,e] of [["B",r.owner],["E",r.target]])if(e?.sort===identity.sort&&e.id===identity.id)out.push({identity:P(id),side});
 return out;
}
// Compare actual persistent states at adjacent semantic boundaries, for observation only.
export function executionStepView(run,index){
 const snap=run.snapshots[index];if(!snap)throw Error("Invalid step");
 const before=index?run.snapshots[index-1].program:run.sourceProgram;
 const changed=[];
 for(const sort of ["N","P"]){
  const a=sort==="N"?before.state.mo.nodes:before.state.mo.relations,b=sort==="N"?snap.program.state.mo.nodes:snap.program.state.mo.relations;
  for(const id of new Set([...a.keys(),...b.keys()]))if(JSON.stringify(a.get(id))!==JSON.stringify(b.get(id)))changed.push({sort,id,kind:!a.has(id)?"born":!b.has(id)?"dead":"changed"});
 }
 const event=snap.event,frame=snap.program.state.frames.get(event.frame);
 const outputSlot=frame?.roles[event.outputRole],resultEndpoint=snap.program.state.mo.relations.get(outputSlot)?.target??null;
 return {program:snap.program,event,trace:snap.trace,changed,outputSlot,resultEndpoint};
}
export function createImportCoordinator(){
 let generation=0;
 return {cancel(){generation++},async request(read,commit,onError){
  const token=++generation;
  try{const value=await read();if(token!==generation)return "STALE";commit(value);return "COMMITTED"}
  catch(e){if(token!==generation)return "STALE";onError(e);return "REJECT"}
 }};
}
function parseSource(text){if(typeof text!=="string")throw Error("No Natural JSON source");const value=cloneStrictJSON(JSON.parse(text));sourceRanges(text);return subjectivateNaturalJSON(value)}
// Reader only: materialize an independent value; never acquire a writer.
export async function readDocumentDraft(reader,snapshot,documentId){
 const working=await createWorkingSession(reader,snapshot,[documentId]);
 return JSON.stringify(working.exportDocument(documentId),null,2);
}
export async function readLocalJSON(text){
 sourceRanges(text);
 const reader=new MemoryDocumentProvider({source:cloneStrictJSON(JSON.parse(text))});
 return readDocumentDraft(reader,await reader.openSnapshot(),"source");
}
// Pure display projection: relation identities are never merged or recursively expanded.
const displayKey=e=>e.sort+":"+e.id;
export function networkPresentation(program,{applied=null,roles={},sourceController=null,resultEndpoint=null,selected=null,all=false}={}){
 const mo=program.state.mo,records=[...Array.from(mo.nodes,([id,r])=>({sort:"N",id,r})),...Array.from(mo.relations,([id,r])=>({sort:"P",id,r}))];
 const index=new Map(records.map(e=>[displayKey(e),e]));
 const root=mo.roots[0],treeLayout=root?.sort==="N"&&mo.relations.has("j1:source-root");
 const keep=new Set(),expanded=new Set();
 const structural=new Map();
 for(const e of records)if(e.sort==="P"&&["key","index"].includes(e.r.label.kind)&&e.r.owner.sort==="N"){
   const id=e.r.owner.id;if(!structural.has(id))structural.set(id,[]);structural.get(id).push(e)
 }
 for(const list of structural.values())list.sort((a,b)=>typeof a.r.label.value==="number"&&typeof b.r.label.value==="number"?a.r.label.value-b.r.label.value:String(a.r.label.value).localeCompare(String(b.r.label.value)));
 function add(e,subtree=false){
  if(!e)return;const k=displayKey(e),r=index.get(k);if(!r)return;
  const first=!keep.has(k);keep.add(k);
  if(r.sort==="P"){
   if(first)add(r.r.owner);
   if(first||subtree&&!expanded.has(k)){if(subtree)expanded.add(k);add(r.r.target,subtree)}
  }else if(subtree&&!expanded.has(k)){
   expanded.add(k);for(const p of structural.get(r.id)??[])add(p,true)
  }
 }
 if(all||!treeLayout||program===applied){for(const e of records)keep.add(displayKey(e))}
 else{
  add(root,true);add(P("j1:source-root"));
  if(applied){for(const [id] of applied.state.mo.nodes)add(N(id));for(const [id] of applied.state.mo.relations)add(P(id))}
  for(const id of Object.values(roles))add(P(id),true);
  if(sourceController)add(P(sourceController));
  add(resultEndpoint,true);add(selected);
 }
 const shown=records.filter(e=>keep.has(displayKey(e))),positions=new Map();
 let leaf=0,maxX=0;
 if(treeLayout){
  const active=new Set();
  function put(e,x,y){positions.set(displayKey(e),{x,y});maxX=Math.max(maxX,x)}
  function visit(e,depth){
   const k=displayKey(e);if(!keep.has(k)||!index.has(k))return null;
   if(positions.has(k))return positions.get(k).y;
   if(active.has(k))return null;active.add(k);
   const x=76+depth*136,children=e.sort==="N"?structural.get(e.id)??[]:[];
   const ys=[];
   for(const p of children){const pk=displayKey(p);if(!keep.has(pk)||positions.has(pk))continue;
    const targetKey=p.r.target?displayKey(p.r.target):null;
    const y0=p.r.target?.sort==="N"&&!positions.has(targetKey)&&!active.has(targetKey)?visit(p.r.target,depth+2):null;
    const y=y0??(49+leaf++*74);
    put(p,76+(depth+1)*136,y);ys.push(y)
   }
   const y=ys.length?(ys[0]+ys.at(-1))/2:49+leaf++*74;
   put(e,x,y);active.delete(k);return y;
  }
  visit(root,0);
 }
 const rest=shown.filter(e=>!positions.has(displayKey(e))),baseY=treeLayout?Math.max(120,49+leaf*74):45;
 const cols=treeLayout?Math.max(4,Math.floor((maxX+100)/160)):4;
 rest.forEach((e,i)=>positions.set(displayKey(e),{x:treeLayout?76+i%cols*160:95+i%cols*180,y:baseY+Math.floor(i/cols)*76}));
 return {records:shown,positions,total:records.length,treeLayout};
}
export function createUnifiedSession(text = examples.where,{model=null,registry={}}={}) {
 let applied=model??parseSource(text),appliedText=model?null:text,draft=appliedText;
 let branch=null,attempt=null,tentative=[],diagnostic=null,inspection=null,projectionDiagnostic=model?"MATHEMATICAL_EXAMPLE":null;
 let edits=[],runs=[],history=[],lastReject=null,projectionPartial=!!model;
 let pc2=null;const initialRegistry=cloneStrictJSON(registry);
 const layout=new Map();
 function reset(){attempt?.return();attempt=null;tentative=[];branch=null;diagnostic=null;inspection=null;lastReject=null}
 function guard(){if(attempt||draft!==appliedText)throw Error("Stop or apply first")}
 function rejectAttempt(kind,detail){diagnostic=detail;lastReject={kind,diagnostic:detail};}
 function fresh(sort){let i=1;while(applied.state.mo.used[sort].has("studio:"+sort+":"+i))i++;return "studio:"+sort+":"+i;}
 function semanticActions(actions){
  guard();if(!Array.isArray(actions)||!actions.length)throw Error("Nonempty action array required");
  if(actions.some(a=>a.id==="j1:source-root"||a.op==="setRoots"))throw Error("Source root anchor and root set are reserved");
  const t=executeMOAtomically(applied.state.mo,actions);
  if(t.outcome.status!=="OK"){rejectAttempt("edit",t.outcome.diagnostic);return t}
  const state={...applied.state,mo:t.state};
  try{validateE1State(state)}catch(e){rejectAttempt("edit",e.diagnostic??e.message);return {state:applied.state.mo,outcome:{status:"REJECT",diagnostic,semanticChange:false},trace:[]}}
  publish({...applied,state});const edit={kind:"edit",actions,outcome:t.outcome,trace:t.trace};edits.push(edit);history.push(edit);return t;
 }
 function publish(program){let projection=null,error=null;
  try{projection=JSON.stringify(objectivateNaturalJSON(program),null,2)}catch(e){error=e.diagnostic??e.message}
  reset();applied=program;if(pc2)pc2={...pc2,state:program.state};draft=appliedText=projection;projectionDiagnostic=error;projectionPartial=true;
 }
 function runPC2(){
  guard();if(!applied.state.mo.relations.has("j1:source-root"))throw Error("Natural JSON execution unavailable for this model");
  reset();
  const input=pc2?{...pc2,state:applied.state}:initialPC2(applied,initialRegistry);
  const start=performance.now(),out=executePC2A2(input,{entry:"EXEC"}),ms=performance.now()-start;
  if(out.diagnostic!==null){rejectAttempt("run",out.diagnostic);lastReject={...lastReject,profile:"PC2",attemptedTrace:out.attemptedTrace};return null}
  const program={state:out.session.state,sourceRoot:out.session.sourceRoot};
  const resultEndpoint=program.state.mo.relations.get(out.resultSlot.id).target;
  branch={mode:"PC2 EXEC",profile:"PC2",program,pc2Session:out.session,result:out.result,resultEndpoint,resultSlot:out.resultSlot,hostFrame:out.hostFrame,events:[],snapshots:[],trace:out.committedTrace,sourceProgram:applied,sourceText:appliedText,metrics:pc2Metrics(applied,appliedText,out,ms)};
  runs.push(branch);history.push({kind:"run",run:branch});return branch;
 }
 function adoptPC2(){
  guard();if(branch?.profile!=="PC2")throw Error("No committed PC2 branch");
  const next=branch;pc2=next.pc2Session;publish(next.program);return applied;
 }
 function step(env){
  if(!attempt){guard();if(appliedText===null||!applied.state.mo.relations.has("j1:source-root"))throw Error("Natural JSON execution unavailable for this model");
   branch=null;inspection=null;diagnostic=null;lastReject=null;tentative=[];attempt=stepNaturalJSON(applied,cloneStrictJSON(env))}
  try{const n=attempt.next();if(!n.done){tentative.push(n.value);return false}
   attempt=null;const snapshots=tentative;tentative=[];
   if(n.value.mode==="REJECT"){rejectAttempt("run",n.value.diagnostic);branch=null}
   else{branch={...n.value,snapshots,sourceProgram:applied,sourceText:appliedText};runs.push(branch);history.push({kind:"run",run:branch})}
   return true
  }catch(e){reset();diagnostic=e.message;throw e}
 }
 return {
  layout,get draft(){return draft},get appliedText(){return appliedText},get dirty(){return draft!==appliedText},get projectionPartial(){return projectionPartial},
  get applied(){return applied},get branch(){return branch},get running(){return attempt!==null},
  get tentative(){return tentative.slice()},get diagnostic(){return diagnostic},get projectionDiagnostic(){return projectionDiagnostic},
  get inspection(){return inspection},get edits(){return edits.slice()},get runs(){return runs.slice()},get history(){return history.slice()},get lastReject(){return lastReject},
  get executable(){return appliedText!==null&&applied.state.mo.relations.has("j1:source-root")},
  get pc2Executable(){return applied.state.mo.relations.has("j1:source-root")},
  get pc2Snapshot(){return pc2?snapshotPC2A1Session(pc2):null},
  runPC2,adoptPC2,
  get visible(){return tentative.at(-1)?.program??branch?.program??inspection?.program??applied},
  edit(text){if(attempt)throw Error("Stop execution before editing");draft=text},
  apply(){if(attempt)throw Error("Stop execution before Apply");try{const next=parseSource(draft);reset();pc2=null;applied=next;appliedText=draft;projectionDiagnostic=null;projectionPartial=false;layout.clear();edits=[];runs=[];history=[];return true}catch(e){diagnostic=e.message;return false}},
  discard(){if(attempt)throw Error("Stop execution before discarding draft");draft=appliedText;diagnostic=null},
  reset,step,run(env){while(!step(env)){}return branch},
  inspect(){guard();if(!this.executable)throw Error("No Natural JSON context");inspection=instantiateNaturalEntity(applied);branch=null;diagnostic=null;return inspection},
  reflect(path,role,value){guard();const edited=reflectiveReplaceRole(applied,path,role,value);publish(edited.program);const edit={kind:"Q",trace:edited.trace,identity:edited.sourceSlot};edits.push(edit);history.push(edit);return edited},
  endpoint(id,side,target){
   if(side!=="B"&&side!=="E")throw Error("Invalid endpoint side");
   return semanticActions([side==="B"?{op:"moveRelation",id,owner:target}:{op:"rebindRelation",id,target}]);
  },
  createAtom(value){guard();const id=fresh("N"),kind=value===null?"null":typeof value;
   if(!["null","boolean","number","string"].includes(kind))throw Error("Atom must be scalar JSON");
   const t=semanticActions([{op:"createNode",id,kind,payload:value}]);return {transition:t,identity:N(id)}},
  createRelation(begin,end){guard();const id=fresh("P");
   const t=semanticActions([{op:"createRelation",id,owner:begin,label:role,target:end}]);return {transition:t,identity:P(id)}},
  remove(identity){return semanticActions([{op:identity.sort==="N"?"deleteNode":"deleteRelation",id:identity.id}])},
  atomic(actions){return semanticActions(actions)},
  stageDocument(text){guard();draft=text;return true},
  exportSource(){if(appliedText===null)throw Error("Natural JSON projection unavailable");return appliedText},
  importExact(text){guard();try{const state=deserializeE1State(text);pc2=null;publish({state});layout.clear();edits=[];runs=[];history=[];return true}catch(e){diagnostic=e.message;return false}},
  lossless(){return serializeE1State(applied.state)}
 };
}

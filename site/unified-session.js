import { cloneStrictJSON } from "../src/strict-json.js";
import { N,P,Role,createMOState,executeMO,executeMOAtomically } from "../src/mo-core.js";
import { subjectivateNaturalJSON, objectivateNaturalJSON, stepNaturalJSON, reflectiveReplaceRole, instantiateNaturalEntity } from "../research/pc1/j1-natural-json.mjs";
import { serializeE1State,deserializeE1State,createE1State,validateE1State } from "../research/pc1/e1-witness.mjs";
import {locateVPath,projectionOccurrences} from "./mo-projection-sync.js";

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
export function rangesForIdentity(program,text,identity){
 if(text===null)return [];
 const v=projectionOccurrences(program.state.mo,undefined,identity);
 if(!v.ok)return [];
 const paths=new Set(v.paths.map(x=>JSON.stringify(x)));
 return sourceRanges(text).filter(x=>paths.has(JSON.stringify(x.path)));
}
function parseSource(text){const value=cloneStrictJSON(JSON.parse(text));sourceRanges(text);return subjectivateNaturalJSON(value)}
export function createUnifiedSession(text = examples.where,{model=null}={}) {
 let applied=model??parseSource(text),appliedText=model?null:text,draft=appliedText;
 let branch=null,attempt=null,tentative=[],diagnostic=null,inspection=null,projectionDiagnostic=model?"MATHEMATICAL_EXAMPLE":null;
 let edits=[],runs=[];
 const layout=new Map();
 function reset(){attempt?.return();attempt=null;tentative=[];branch=null;diagnostic=null;inspection=null}
 function guard(){if(attempt||draft!==appliedText)throw Error("Stop or apply first")}
 function publish(program){let projection=null,error=null;
  try{projection=JSON.stringify(objectivateNaturalJSON(program),null,2)}catch(e){error=e.diagnostic??e.message}
  reset();applied=program;draft=appliedText=projection;projectionDiagnostic=error;
 }
 function step(env){
  if(!attempt){guard();if(appliedText===null||!applied.state.mo.relations.has("j1:source-root"))throw Error("Natural JSON execution unavailable for this model");
   branch=null;inspection=null;diagnostic=null;tentative=[];attempt=stepNaturalJSON(applied,cloneStrictJSON(env))}
  try{const n=attempt.next();if(!n.done){tentative.push(n.value);return false}
   attempt=null;const snapshots=tentative;tentative=[];
   if(n.value.mode==="REJECT"){diagnostic=n.value.diagnostic;branch=null}
   else{branch={...n.value,snapshots};runs.push(branch)}
   return true
  }catch(e){reset();diagnostic=e.message;throw e}
 }
 return {
  layout,get draft(){return draft},get appliedText(){return appliedText},get dirty(){return draft!==appliedText},
  get applied(){return applied},get branch(){return branch},get running(){return attempt!==null},
  get tentative(){return tentative.slice()},get diagnostic(){return diagnostic},get projectionDiagnostic(){return projectionDiagnostic},
  get inspection(){return inspection},get edits(){return edits.slice()},get runs(){return runs.slice()},
  get executable(){return appliedText!==null&&applied.state.mo.relations.has("j1:source-root")},
  get visible(){return tentative.at(-1)?.program??branch?.program??inspection?.program??applied},
  edit(text){if(attempt)throw Error("Stop execution before editing");draft=text},
  apply(){if(attempt)throw Error("Stop execution before Apply");try{const next=parseSource(draft);reset();applied=next;appliedText=draft;projectionDiagnostic=null;layout.clear();edits=[];runs=[];return true}catch(e){diagnostic=e.message;return false}},
  discard(){if(attempt)throw Error("Stop execution before discarding draft");draft=appliedText;diagnostic=null},
  reset,step,run(env){while(!step(env)){}return branch},
  inspect(){guard();if(!this.executable)throw Error("No Natural JSON context");inspection=instantiateNaturalEntity(applied);branch=null;diagnostic=null;return inspection},
  reflect(path,role,value){guard();const edited=reflectiveReplaceRole(applied,path,role,value);publish(edited.program);edits.push({kind:"Q",trace:edited.trace,identity:edited.sourceSlot});return edited},
  endpoint(id,side,target){
   guard();if(side!=="B"&&side!=="E")throw Error("Invalid endpoint side");
   if(id==="j1:source-root")throw Error("Source root anchor is reserved");
   const action=side==="B"?{op:"moveRelation",id,owner:target}:{op:"rebindRelation",id,target};
   const t=executeMO(applied.state.mo,action);
   if(t.outcome.status!=="OK"){diagnostic=t.outcome.diagnostic;return t}
   const state={...applied.state,mo:t.state};
   try{validateE1State(state)}catch(e){diagnostic=e.diagnostic??e.message;return {state:applied.state.mo,outcome:{status:"REJECT",diagnostic,semanticChange:false},trace:[]}}
   publish({...applied,state});edits.push({kind:"endpoint",action,outcome:t.outcome,trace:t.trace});return t
  },
  importExact(text){guard();try{const state=deserializeE1State(text);publish({state});layout.clear();edits=[];runs=[];return true}catch(e){diagnostic=e.message;return false}},
  lossless(){return serializeE1State(applied.state)}
 };
}

import {projectPlainJSON,requireCanonicalJSONTree} from "../src/mo-reference.js";

const same=(a,b)=>a&&b&&a.sort===b.sort&&a.id===b.id;
const endpoint=(sort,id)=>({sort,id});
const diagnostic=e=>e?.diagnostic??e?.message??"VIEW_ERROR";
function rootOf(state,root){return root??state.roots[0];}
function outgoing(state,nodeId){
 const out=[];
 for(const [id,r] of state.relations){
  if(r.owner.sort!=="N"||r.owner.id!==nodeId)continue;
  if(r.label.kind==="key"||r.label.kind==="index")out.push([id,r]);
 }
 return out.sort((a,b)=>{
  const x=a[1].label,y=b[1].label;
  if(x.kind!==y.kind)return x.kind.localeCompare(y.kind);
  return typeof x.value==="number"?x.value-y.value:String(x.value).localeCompare(String(y.value));
 });
}
function segmentMatches(label,segment){
 return typeof segment==="string"
  ? label.kind==="key"&&label.value===segment
  : Number.isSafeInteger(segment)&&segment>=0&&label.kind==="index"&&label.value===segment;
}
export function locateVPath(state,root,path){
 const actualRoot=rootOf(state,root);
 try{projectPlainJSON(state,actualRoot);}catch(e){return {ok:false,diagnostic:diagnostic(e),node:null,relation:null,path:null};}
 if(!Array.isArray(path))return {ok:false,diagnostic:"JSON_PATH_INVALID",node:null,relation:null,path:null};
 if(!actualRoot||actualRoot.sort!=="N"||!state.nodes.has(actualRoot.id))return {ok:false,diagnostic:"JSON_ROOT_NOT_NODE",node:null,relation:null,path:null};
 let node=endpoint("N",actualRoot.id),relation=null;
 for(const segment of path){
  const record=state.nodes.get(node.id);
  if(typeof segment==="string"&&record.kind!=="object")return {ok:false,diagnostic:"JSON_PATH_TYPE",node:null,relation:null,path:null};
  if(typeof segment==="number"&&record.kind!=="array")return {ok:false,diagnostic:"JSON_PATH_TYPE",node:null,relation:null,path:null};
  const matches=outgoing(state,node.id).filter(([,r])=>segmentMatches(r.label,segment));
  if(matches.length!==1)return {ok:false,diagnostic:matches.length?"JSON_AMBIGUOUS_PATH":"JSON_PATH_NOT_FOUND",node:null,relation:null,path:null};
  const [id,r]=matches[0];
  if(!r.bound||r.target.sort!=="N")return {ok:false,diagnostic:"JSON_PATH_NOT_FOUND",node:null,relation:null,path:null};
  relation=endpoint("P",id);node=endpoint("N",r.target.id);
 }
 return {ok:true,diagnostic:null,node,relation,path:[...path]};
}
export function projectionOccurrences(state,root,selected,{limit=256}={}){
 const actualRoot=rootOf(state,root);
 try{projectPlainJSON(state,actualRoot);}catch(e){return {ok:false,diagnostic:diagnostic(e),paths:[],truncated:false};}
 if(!selected||!actualRoot)return {ok:true,diagnostic:null,paths:[],truncated:false};
 const paths=[];let truncated=false,visits=0;
 function add(path){if(paths.length<limit)paths.push([...path]);else truncated=true;}
 function visit(nodeId,path,active){
  if(truncated)return;if(++visits>4096){truncated=true;return;}
  if(selected.sort==="N"&&selected.id===nodeId)add(path);
  if(active.has(nodeId))return;
  const nextActive=new Set(active);nextActive.add(nodeId);
  for(const [id,r] of outgoing(state,nodeId)){
   if(!r.bound||r.target.sort!=="N")continue;
   const child=[...path,r.label.value];
   if(selected.sort==="P"&&selected.id===id)add(child);
   visit(r.target.id,child,nextActive);
  }
 }
 visit(actualRoot.id,[],new Set());
 return {ok:true,diagnostic:null,paths,truncated};
}
export function losslessLocators(state,selected){
 if(!selected)return null;
 const live=selected.sort==="N"?state.nodes.has(selected.id):selected.sort==="P"?state.relations.has(selected.id):false;
 if(!live)return null;
 const ids=[...(selected.sort==="N"?state.nodes:state.relations).keys()].sort((a,b)=>a.localeCompare(b));
 const record=[selected.sort==="N"?"nodes":"relations",ids.indexOf(selected.id)];
 const roots=state.roots.map((r,i)=>same(r,selected)?["roots",i]:null).filter(Boolean);
 const used=[...state.used[selected.sort]].sort();
 return {identity:[selected.sort,selected.id],record,roots,used:["used",selected.sort,used.indexOf(selected.id)]};
}
export function syncSnapshot(state,root,selected){
 const v=projectionOccurrences(state,root,selected);
 const g=losslessLocators(state,selected);
 let canonical={ok:true,diagnostic:null};
 try{requireCanonicalJSONTree(state,rootOf(state,root));}catch(e){canonical={ok:false,diagnostic:diagnostic(e)};}
 const editablePath=canonical.ok&&v.ok&&v.paths.length===1&&!v.truncated?[...v.paths[0]]:null;
 return {v,g,canonical,editablePath};
}

import { createMOState, executeMO, executeMOAtomically, embedPlainJSON, projectPlainJSON,
  serializeLosslessMO, deserializeLosslessMO, applyJSONOperation, requireCanonicalJSONTree } from "../src/mo-reference.js";

const endpoint = (sort,id) => ({sort,id});
const N = id => endpoint("N",id);
const P = id => endpoint("P",id);
export const examples = {
  tree: () => embedPlainJSON({counter:0,items:[1,2],meta:{enabled:true}}).state,
  graph: () => {
    const t=executeMOAtomically(createMOState(),[
      {op:"createNode",id:"root",kind:"object"},
      {op:"createNode",id:"value",kind:"number",payload:42},
      {op:"createRelation",id:"a",owner:N("root"),label:{kind:"key",value:"a"},target:N("value")},
      {op:"createRelation",id:"b",owner:N("root"),label:{kind:"key",value:"b"},target:N("value")},
      {op:"createRelation",id:"meta",owner:P("a"),label:{kind:"role",value:"context"},target:P("b")},
      {op:"createRelation",id:"loop",owner:P("meta"),label:{kind:"role",value:"loop"},target:P("meta")},
      {op:"setRoots",roots:[N("root")]}
    ]);
    if(t.outcome.status!=="OK") throw Error(t.outcome.diagnostic);
    return t.state;
  }
};
export function createStudio(initial=examples.tree()) {
  let state=initial;
  let last=null;
  function commit(t) { last=t; state=t.state; return t; }
  function boundary(fn) {
    try { return fn(); } catch(error) {
      const t={state,outcome:{status:"REJECT",diagnostic:error.diagnostic??"INPUT_ERROR",return:null,semanticChange:false},
        message:error.message, boundary:true};
      last=t; return t;
    }
  }
  return {
    get state(){return state;}, get last(){return last;},
    action(a){return boundary(()=>commit(executeMO(state,a)));},
    atomic(actions){return boundary(()=>{if(!Array.isArray(actions))throw Error("Ожидается массив операций");return commit(executeMOAtomically(state,actions));});},
    edit(op){return boundary(()=>commit(applyJSONOperation(state,op)));},
    load(text,mode){return boundary(()=>{
      if(mode!=="plain"&&mode!=="lossless")throw Error("Неизвестный формат");
      const next=mode==="plain"?embedPlainJSON(JSON.parse(text)).state:deserializeLosslessMO(text);
      state=next; last=null; return {state,outcome:{status:"OK",diagnostic:null},session:true};
    });},
    reset(name){return boundary(()=>{state=name==="empty"?createMOState():examples[name]();last=null;return {state,outcome:{status:"OK",diagnostic:null},session:true};});},
    projection(root){try{return {ok:true,value:projectPlainJSON(state,root)}}catch(e){return {ok:false,diagnostic:e.diagnostic??e.message};}},
    treeStatus(){try{requireCanonicalJSONTree(state);return {ok:true}}catch(e){return {ok:false,diagnostic:e.diagnostic??e.message};}},
    lossless(){return serializeLosslessMO(state);}
  };
}

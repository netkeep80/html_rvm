import { cloneStrictJSON } from "../src/strict-json.js";
import { subjectivateNaturalJSON, objectivateNaturalJSON, stepNaturalJSON, reflectiveReplaceRole, instantiateNaturalEntity } from "../research/pc1/j1-natural-json.mjs";
import { serializeE1State } from "../research/pc1/e1-witness.mjs";

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
export function createUnifiedSession(text = examples.where) {
  let draft = text, appliedText = text, applied = subjectivateNaturalJSON(cloneStrictJSON(JSON.parse(text)));
  let branch = null, attempt = null, tentative = [], diagnostic = null, inspection = null;
  const layout = new Map();
  function reset() { attempt?.return(); attempt=null; tentative=[]; branch=null; diagnostic=null; inspection=null; }
  function step(env) {
    if (!attempt) {
      if (draft !== appliedText) throw Error("Apply or discard draft before execution");
      branch=null; inspection=null; diagnostic=null; tentative=[];
      attempt=stepNaturalJSON(applied,cloneStrictJSON(env));
    }
    try {
      const n=attempt.next();
      if (!n.done) { tentative.push(n.value); return false; }
      attempt=null; tentative=[];
      if(n.value.mode==="REJECT") { diagnostic=n.value.diagnostic; branch=null; }
      else branch=n.value;
      return true;
    } catch(error) { reset(); diagnostic=error.message; throw error; }
  }
  return {
    layout, get draft(){return draft}, get dirty(){return draft!==appliedText},
    get applied(){return applied}, get branch(){return branch}, get running(){return attempt!==null},
    get tentative(){return tentative.slice()}, get diagnostic(){return diagnostic},
    get inspection(){return inspection},
    get visible(){return tentative.at(-1)?.program ?? branch?.program ?? inspection?.program ?? applied},
    edit(text){if(attempt)throw Error("Stop execution before editing");draft=text},
    apply(){if(attempt)throw Error("Stop execution before Apply");try {
      const next=subjectivateNaturalJSON(cloneStrictJSON(JSON.parse(draft)));
      reset(); applied=next; appliedText=draft; layout.clear(); return true;
    }catch(e){diagnostic=e.message;return false}},
    discard(){if(attempt)throw Error("Stop execution before discarding draft");draft=appliedText;diagnostic=null},
    reset, step,
    run(env){while(!step(env)){} return branch},
    inspect(){if(attempt||draft!==appliedText)throw Error("Stop or apply first");inspection=instantiateNaturalEntity(applied);branch=null;diagnostic=null;return inspection},
    reflect(path,role,value){if(attempt||draft!==appliedText)throw Error("Stop or apply first");
      const edited=reflectiveReplaceRole(applied,path,role,value);
      const projection=JSON.stringify(objectivateNaturalJSON(edited.program),null,2);
      reset(); applied=edited.program; draft=appliedText=projection;return edited},
    lossless(){return serializeE1State(applied.state)}
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import {freshVisualId,visualRecords} from "../site/mo-visual-graph.js";
import {createMOState,losslessMOObject} from "../src/mo-reference.js";
import {createStudio,examples} from "../site/mo-studio.js";
import {locateVPath,projectionOccurrences,losslessLocators,syncSnapshot} from "../site/mo-projection-sync.js";
import {createTransitionObserver,transitionObservation} from "../site/mo-transition-observer.js";
import {readFileSync,existsSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {buildPages} from "../tools/build-pages.mjs";
test("MO Studio JSON edit is R0 transition with identity, no independent value",()=>{
 const s=createStudio();const before=s.lossless();
 const t=s.edit({op:"replace",path:["counter"],value:7});
 assert.equal(t.outcome.status,"OK");assert.equal(s.projection().value.counter,7);assert.ok(t.born.N.length);assert.ok(t.dead.N.length);assert.notEqual(s.lossless(),before);
 const same=s.edit({op:"replace",path:["counter"],value:7});assert.equal(same.outcome.semanticChange,false);
});
test("MO Studio relation identity, sharing, relation-over-relation cycle, lossless and restriction",()=>{
 const s=createStudio(examples.graph());assert.deepEqual(s.state.relations.get("meta").owner,{sort:"P",id:"a"});
 assert.deepEqual(s.state.relations.get("loop").target,{sort:"P",id:"meta"});
 assert.deepEqual(s.projection().value,{a:42,b:42});assert.equal(s.treeStatus().ok,false);
 const before=s.lossless();assert.equal(s.edit({op:"replace",path:["a"],value:9}).outcome.status,"REJECT");assert.equal(s.lossless(),before);
 const loaded=createStudio();assert.equal(loaded.load(before,"lossless").outcome.status,"OK");assert.equal(loaded.lossless(),before);
 const t=s.action({op:"createRelation",id:"cyc",owner:{sort:"N",id:"root"},label:{kind:"key",value:"self"},target:{sort:"N",id:"root"}});
 assert.equal(t.outcome.status,"OK");assert.equal(s.projection().diagnostic,"JSON_CYCLE");
});
test("MO Studio atomic reject and invalid imports preserve full state",()=>{
 const s=createStudio();const before=s.lossless();
 const t=s.atomic([{op:"createNode",id:"tmp",kind:"entity",payload:null},{op:"deleteNode",id:"missing"}]);
 assert.equal(t.outcome.status,"REJECT");assert.deepEqual(t.trace,[]);assert.equal(s.lossless(),before);
 assert.equal(s.load("{","plain").outcome.status,"REJECT");assert.equal(s.lossless(),before);
 assert.equal(s.load("{}","lossless").outcome.status,"REJECT");assert.equal(s.lossless(),before);
});
test("MO Studio Pages artifact includes actual R0 modules and accessible entry",()=>{
 const d=mkdtempSync(join(tmpdir(),"mo-studio-"));
 try{const r=buildPages(join(d,"dist"),{version:"01.07",legacyRegression:true});
 for(const f of ["site/mo-studio.html","site/mo-studio.js","site/mo-studio-ui.js","site/mo-studio.css","site/mo-visual-graph.js","site/mo-projection-sync.js","site/mo-transition-observer.js","src/mo-core.js","src/mo-json.js","src/mo-reference.js"])assert.ok(existsSync(join(r.destination,f)),f);
 assert.match(readFileSync(join(r.destination,"site/index.html"),"utf8"),/href="\.\/mo-studio.html"/);
 for(const f of ["site/mo-studio.js","site/mo-studio-ui.js"])execFileSync(process.execPath,["--check",join(r.destination,f)]);
 }finally{rmSync(d,{recursive:true,force:true});}
});

test("visual identities are typed and allocator excludes dead IDs",()=>{
 const s=createStudio(examples.graph());
 assert.equal(s.action({op:"createNode",id:"a",kind:"entity"}).outcome.status,"OK");
 assert.deepEqual(visualRecords(s.state).filter(x=>x.id==="a").map(x=>x.sort),["N","P"]);
 const id=freshVisualId(s.state,"N");
 assert.equal(s.action({op:"createNode",id,kind:"entity"}).outcome.status,"OK");
 assert.equal(s.action({op:"deleteNode",id}).outcome.status,"OK");
 assert.notEqual(freshVisualId(s.state,"N"),id);
});

test("V2 sync maps canonical V paths to typed N/P and exact G locators without mutation",()=>{
 const s=createStudio();const before=s.lossless(),root=s.state.roots[0];
 const located=locateVPath(s.state,root,["counter"]);assert.equal(located.ok,true);assert.equal(located.node.sort,"N");assert.equal(located.relation.sort,"P");
 const nodeSync=syncSnapshot(s.state,root,located.node);assert.deepEqual(nodeSync.v.paths,[["counter"]]);assert.deepEqual(nodeSync.editablePath,["counter"]);assert.equal(nodeSync.canonical.ok,true);
 const relSync=syncSnapshot(s.state,root,located.relation);assert.deepEqual(relSync.v.paths,[["counter"]]);assert.deepEqual(relSync.editablePath,["counter"]);
 assert.equal(losslessLocators(s.state,located.node).record[0],"nodes");assert.equal(losslessLocators(s.state,located.relation).record[0],"relations");
 assert.equal(s.lossless(),before);
});
test("V2 sync exposes sharing multiplicity, cycle obstruction and typed identity",()=>{
 const s=createStudio(examples.graph()),root=s.state.roots[0],before=s.lossless();
 const shared=syncSnapshot(s.state,root,{sort:"N",id:"value"});assert.equal(shared.v.ok,true);assert.deepEqual(shared.v.paths,[["a"],["b"]]);assert.equal(shared.canonical.ok,false);assert.equal(shared.editablePath,null);
 assert.equal(s.action({op:"createNode",id:"a",kind:"entity"}).outcome.status,"OK");
 const n=losslessLocators(s.state,{sort:"N",id:"a"}),p=losslessLocators(s.state,{sort:"P",id:"a"});assert.equal(n.record[0],"nodes");assert.equal(p.record[0],"relations");assert.notDeepEqual(n.record,p.record);
 assert.equal(s.action({op:"createRelation",id:"cyc",owner:{sort:"N",id:"root"},label:{kind:"key",value:"self"},target:{sort:"N",id:"root"}}).outcome.status,"OK");
 const cyc=syncSnapshot(s.state,root,{sort:"P",id:"cyc"});assert.equal(cyc.v.ok,false);assert.equal(cyc.v.diagnostic,"JSON_CYCLE");assert.equal(cyc.g.record[0],"relations");
 assert.notEqual(s.lossless(),before);
});

test("V2 G locators dereference exact mixed-case R0 lossless entries",()=>{
 const s=createStudio(createMOState());
 for(const a of [
  {op:"createNode",id:"A",kind:"number",payload:1},
  {op:"createNode",id:"a",kind:"number",payload:2},
  {op:"createRelation",id:"A",owner:{sort:"N",id:"A"},label:{kind:"role",value:"upper"},target:{sort:"N",id:"a"}},
  {op:"createRelation",id:"a",owner:{sort:"N",id:"a"},label:{kind:"role",value:"lower"},target:{sort:"N",id:"A"}},
  {op:"setRoots",roots:[{sort:"N",id:"A"},{sort:"P",id:"A"}]}
 ]) assert.equal(s.action(a).outcome.status,"OK");
 const g=losslessMOObject(s.state);
 const at=(obj,path)=>path.reduce((v,k)=>v[k],obj);
 for(const selected of [{sort:"N",id:"A"},{sort:"N",id:"a"},{sort:"P",id:"A"},{sort:"P",id:"a"}]){
  const loc=losslessLocators(s.state,selected);
  assert.equal(at(g,loc.record).id,selected.id);
  assert.equal(at(g,loc.used),selected.id);
  for(const root of loc.roots)assert.deepEqual(at(g,root),[selected.sort,selected.id]);
 }
 assert.deepEqual(g.used.N.slice(-2),["A","a"]);
 assert.deepEqual(g.used.P,["A","a"]);
});

test("V3 observer keeps committed history distinct from reject and rollback",()=>{
 const s=createStudio(createMOState()),o=createTransitionObserver(4);
 const create={op:"createNode",id:"x",kind:"entity",payload:null},t1=s.action(create);
 const before=JSON.stringify({persistence:t1.persistence,outcome:t1.outcome,born:t1.born,dead:t1.dead});
 const observed=transitionObservation(t1,{source:"action",action:create});assert.equal(observed.committed,true);assert.equal(JSON.stringify({persistence:t1.persistence,outcome:t1.outcome,born:t1.born,dead:t1.dead}),before);
 o.observe(t1,{source:"action",action:create});assert.equal(o.history.length,1);assert.equal(o.history[0].omega.semanticChange,true);
 const noop={op:"setNode",id:"x",kind:"entity",payload:null},t2=s.action(noop);assert.equal(t2.outcome.semanticChange,false);o.observe(t2,{source:"action",action:noop});assert.equal(o.history.length,2);assert.equal(o.history[1].omega.semanticChange,false);
 const reject=s.action({op:"deleteNode",id:"missing"});o.observe(reject,{source:"action"});assert.equal(o.last.omega.status,"REJECT");assert.equal(o.history.length,2);
 const atomic=s.atomic([{op:"createNode",id:"y",kind:"entity",payload:null}]);o.observe(atomic,{source:"atomic"});assert.equal(o.history.length,3);assert.deepEqual(o.history[2].trace,atomic.trace);assert.equal(o.history[2].trace.length,1);
 const rolled=s.atomic([{op:"createNode",id:"z",kind:"entity",payload:null},{op:"deleteNode",id:"missing"}]);assert.deepEqual(rolled.trace,[]);o.observe(rolled,{source:"atomic"});assert.equal(o.history.length,3);assert.deepEqual(o.last.trace,[]);assert.equal(s.state.nodes.has("z"),false);
 const beforeBoundaryState=s.lossless(),beforeBoundaryHistory=o.history;
 const failedImport=s.load("{","plain");assert.equal(failedImport.boundary,true);assert.equal(failedImport.outcome.status,"REJECT");assert.equal("persistence" in failedImport,false);assert.equal("born" in failedImport,false);assert.equal("dead" in failedImport,false);
 o.observe(failedImport,{source:"session-load"});
 assert.equal(o.last.boundary,true);assert.equal(o.last.committed,false);assert.equal(o.last.pi,null);assert.equal(o.last.born,null);assert.equal(o.last.dead,null);assert.equal(o.last.trace,null);
 assert.deepEqual(o.history,beforeBoundaryHistory);assert.equal(s.lossless(),beforeBoundaryState);
 const realReject=s.action({op:"deleteNode",id:"missing"});o.observe(realReject,{source:"action"});
 assert.equal(o.last.boundary,false);assert.notEqual(o.last.pi,null);assert.notEqual(o.last.born,null);assert.notEqual(o.last.dead,null);
 const session=s.reset("empty");o.observe(session,{source:"session-reset"});assert.equal(o.history.length,0);assert.equal(o.last,null);
});

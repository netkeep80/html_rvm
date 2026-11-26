import test from "node:test";
import assert from "node:assert/strict";
import {createStudio,examples} from "../site/mo-studio.js";
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
 try{const r=buildPages(join(d,"dist"),{version:"01.07"});
 for(const f of ["site/mo-studio.html","site/mo-studio.js","site/mo-studio-ui.js","site/mo-studio.css","src/mo-core.js","src/mo-json.js","src/mo-reference.js"])assert.ok(existsSync(join(r.destination,f)),f);
 assert.match(readFileSync(join(r.destination,"site/index.html"),"utf8"),/href="\.\/mo-studio.html"/);
 for(const f of ["site/mo-studio.js","site/mo-studio-ui.js"])execFileSync(process.execPath,["--check",join(r.destination,f)]);
 }finally{rmSync(d,{recursive:true,force:true});}
});

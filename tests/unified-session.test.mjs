import test from "node:test";
import assert from "node:assert/strict";
import {createUnifiedSession,examples,mathematicalExample,sourceRanges,sourceIdentityAt,rangesForIdentity} from "../site/unified-session.js";
import {stepNaturalJSON,executeNaturalJSON,subjectivateNaturalJSON,inspectNaturalEntity} from "../research/pc1/j1-natural-json.mjs";
import {serializeE1State,deserializeE1State,frameRoleSlot} from "../research/pc1/e1-witness.mjs";
const env={version:"01.77",meta:{engine:"test"}};
test("unified real steps yield before later predicates, same final state as Run",()=>{
 const p=subjectivateNaturalJSON(JSON.parse(examples.where));
 const g=stepNaturalJSON(p,env);
 let n=g.next();assert.equal(n.done,false);assert.equal(n.value.event.iteration,0);
 assert.equal(n.value.program.state.frames.size,2);
 const events=[];
 while(!n.done){events.push(n.value.event);n=g.next()}
 const run=executeNaturalJSON(p,env);
 assert.deepEqual(events,run.events);assert.deepEqual(n.value.result,["4"]);
 assert.equal(serializeE1State(n.value.program.state),serializeE1State(run.program.state));
 assert.deepEqual(n.value.resultEndpoint,run.resultEndpoint);
 const frames=events.filter(x=>x.iteration!==null).map(x=>x.frame);
 assert.equal(new Set(frames).size,5);
 const slots=frames.map(f=>frameRoleSlot(run.program.state,f,"R").id);
 assert.equal(new Set(slots).size,5);
 frames.forEach((f,i)=>assert.equal(frameRoleSlot(run.program.state,f,"S").id,slots[i]));
});
test("late failure discards tentative branch",()=>{
 const p=subjectivateNaturalJSON({"$rel/a":"rmvm/version","$rel/z":"unknown"});
 const g=stepNaturalJSON(p,env);assert.equal(g.next().done,false);
 const n=g.next();assert.equal(n.done,true);assert.equal(n.value.mode,"REJECT");
 assert.equal(n.value.program,p);assert.deepEqual(n.value.events,[]);
});
test("draft invalid, stop, reflection and state-only replay",()=>{
 const s=createUnifiedSession();const start=s.lossless();
 s.edit("{");assert.equal(s.apply(),false);assert.equal(s.lossless(),start);
 s.discard();assert.equal(s.step(env),false);assert.equal(s.branch,null);s.reset();
 assert.equal(s.lossless(),start);assert.equal(s.tentative.length,0);
 assert.deepEqual(s.run(env).result,["4"]);
 const old=inspectNaturalEntity(s.applied,["$sub"]).sourceSlots.R.id;
 s.reflect(["$sub"],"R","is_null");
 assert.equal(inspectNaturalEntity(s.applied,["$sub"]).sourceSlots.R.id,old);
 assert.deepEqual(executeNaturalJSON({state:deserializeE1State(s.lossless())},env).result,[null]);
 assert.deepEqual(s.run(env).result,[null]);
});

test("source key and payload identities, escaped keys, repeated shared paths",()=>{
 const text='{"a":1,"b":2,"x\\u002fy":3}';
 const s=createUnifiedSession(text);
 const a=sourceIdentityAt(s.applied,text,text.indexOf('"a"'));
 const n=sourceIdentityAt(s.applied,text,text.indexOf("1"));
 assert.equal(a.sort,"P");assert.equal(n.sort,"N");
 const b=sourceIdentityAt(s.applied,text,text.indexOf('"b"'));
 assert.equal(s.endpoint(b.id,"E",n).outcome.status,"OK");
 assert.equal(rangesForIdentity(s.applied,s.appliedText,n).length,2);
 assert.deepEqual(JSON.parse(s.appliedText),{a:1,b:1,"x/y":3});
 assert.equal(sourceRanges(text).at(-1).path[0],"x/y");
 s.edit('{"a":1,"a":2}');assert.equal(s.apply(),false);
});
test("relation-to-relation editing, cycles, layout orthogonality, exact import",()=>{
 const s=createUnifiedSession(null,{model:mathematicalExample("ent_abc")});
 assert.equal(s.executable,false);assert.equal(s.applied.state.mo.relations.get("r2").owner.id,"s1");
 const exact=s.lossless();s.layout.set("P:r2",{x:10,y:20});assert.equal(s.lossless(),exact);
 assert.equal(s.endpoint("r2","E",{sort:"P",id:"r2"}).outcome.status,"OK");
 assert.equal(s.applied.state.mo.relations.get("r2").target.id,"r2");
 assert.equal(s.appliedText,null);
 const before=s.lossless();assert.equal(s.endpoint("r2","B",{sort:"P",id:"absent"}).outcome.status,"REJECT");assert.equal(s.lossless(),before);
 const other=createUnifiedSession();assert.equal(other.importExact(before),true);assert.equal(other.lossless(),before);
 const c=mathematicalExample("sharing + cycles").state.mo;
 assert.equal(c.relations.get("self").target.id,"self");
 assert.equal(c.relations.get("shared").owner.id,"mutual");
 assert.equal(c.relations.get("mutual").target.id,"shared");
 assert.deepEqual(c.relations.get("s1"),c.relations.get("s2"));
});
test("where result payload has original input identity and run history survives Q",()=>{
 const s=createUnifiedSession();const run=s.run(env);
 const src=sourceIdentityAt(s.applied,s.appliedText,s.appliedText.indexOf('"4"'));
 const item=[...run.program.state.mo.relations.values()].find(r=>r.owner.id===run.resultEndpoint.id&&r.label.value===0);
 assert.deepEqual(item.target,src);s.reflect(["$sub"],"R","is_null");
 assert.deepEqual(s.runs[0].result,["4"]);assert.deepEqual(s.run(env).result,[null]);
});

test("actual R0/E1 traces partition by steps, and REJECT commits none",()=>{
 const p=subjectivateNaturalJSON(JSON.parse(examples.where));
 const g=stepNaturalJSON(p,env), trace=[];let n=g.next();
 assert.ok(n.value.trace.some(t=>t.kind==="E1.createFrame"));
 assert.ok(n.value.trace.some(t=>t.kind==="E1.Q"));
 while(!n.done){trace.push(...n.value.trace);n=g.next()}
 assert.deepEqual(n.value.trace,trace);
 assert.deepEqual(executeNaturalJSON(p,env).trace,trace);
 assert.equal(Object.getOwnPropertySymbols(n.value.program).length,0);
 assert.deepEqual(executeNaturalJSON(subjectivateNaturalJSON({"$rel/a":"rmvm/version","$rel/z":"unknown"}),env).trace,[]);
 assert.deepEqual(executeNaturalJSON(subjectivateNaturalJSON({a:1}),env).trace,[]);
});

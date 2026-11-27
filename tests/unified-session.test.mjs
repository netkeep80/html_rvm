import test from "node:test";
import assert from "node:assert/strict";
import {createUnifiedSession,examples} from "../site/unified-session.js";
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

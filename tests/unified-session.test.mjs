import test from "node:test";
import assert from "node:assert/strict";
import {createUnifiedSession,examples,mathematicalExample,sourceRanges,sourceIdentityAt,rangesForIdentity,readDocumentDraft,readLocalJSON,networkPresentation,sourceOccurrenceInfo,occurrenceIdentity,executionStepView,incomingAttachments,createImportCoordinator} from "../site/unified-session.js";
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

test("create duplet, delete reject, no resurrection and ordered history",()=>{
 const s=createUnifiedSession(null,{model:mathematicalExample("ent_abc")});
 const a=s.createAtom("d"),r=s.createRelation({sort:"P",id:"r2"},a.identity);
 assert.equal(r.transition.outcome.status,"OK");
 assert.equal(s.applied.state.mo.relations.get(r.identity.id).owner.id,"r2");
 const before=s.lossless();assert.equal(s.remove(a.identity).outcome.status,"REJECT");
 assert.equal(s.lossless(),before);assert.equal(s.history.length,2);assert.equal(s.lastReject.kind,"edit");
 assert.equal(s.remove(r.identity).outcome.status,"OK");assert.equal(s.remove(a.identity).outcome.status,"OK");
 assert.notEqual(s.createAtom("d").identity.id,a.identity.id);
});
test("advanced atomic rollback and root guard",()=>{
 const s=createUnifiedSession(),before=s.lossless();
 const t=s.atomic([{op:"createNode",id:"temporary",kind:"null",payload:null},{op:"deleteNode",id:"absent"}]);
 assert.equal(t.outcome.status,"REJECT");assert.equal(s.lossless(),before);assert.equal(s.history.length,0);
 assert.throws(()=>s.atomic([{op:"deleteRelation",id:"j1:source-root"}]));assert.equal(s.lossless(),before);
});
test("read-only DocumentPort import is detached, explicit draft only",async()=>{
 const original={a:1};let reads=0,writes=0;
 const reader={async read(){reads++;return original},async commit(){writes++;throw Error("writer forbidden")}};
 const text=await readDocumentDraft(reader,{},"source");
 const s=createUnifiedSession(),before=s.lossless();
 s.stageDocument(text);assert.equal(s.dirty,true);assert.equal(s.lossless(),before);
 assert.equal(s.apply(),true);s.createAtom(3);assert.equal(original.a,1);assert.equal(reads,1);assert.equal(writes,0);
 assert.deepEqual(JSON.parse(await readLocalJSON('{"b":2}')),{b:2});
});

test("projection remains marked partial after structural edit and exact import",()=>{
 const s=createUnifiedSession('{"a":1}');
 assert.equal(s.projectionPartial,false);
 s.createAtom(2);assert.equal(s.projectionPartial,true);
 assert.deepEqual(JSON.parse(s.exportSource()),{a:1});
 const other=createUnifiedSession();assert.equal(other.importExact(s.lossless()),true);
 assert.equal(other.projectionPartial,true);
});

test("focused network is finite, endpoint-closed, and all identities remain available",()=>{
 const s=createUnifiedSession(),run=s.run(env),state=run.program.state;
 const event=run.events.at(-1),frame=state.frames.get(event.frame),before=serializeE1State(state);
 const focus=networkPresentation(run.program,{applied:s.applied,roles:frame.roles,resultEndpoint:run.resultEndpoint,sourceController:event.sourceControllerSlot});
 const all=networkPresentation(run.program,{all:true});
 assert.equal(all.records.length,state.mo.nodes.size+state.mo.relations.size);
 assert.ok(focus.records.length<all.records.length);
 const keys=new Set(focus.records.map(e=>e.sort+":"+e.id));
 for(const e of focus.records.filter(x=>x.sort==="P"))for(const target of [e.r.owner,e.r.target])if(target)assert.ok(keys.has(target.sort+":"+target.id));
 assert.equal(focus.positions.size,focus.records.length);
 assert.equal(serializeE1State(state),before);
 const cycles=mathematicalExample("sharing + cycles");
 assert.equal(networkPresentation(cycles).records.length,cycles.state.mo.nodes.size+cycles.state.mo.relations.size);
});

test("distinct shared JSON member relations never occupy identical layout positions",()=>{
 const s=createUnifiedSession('{"a":1,"b":2}');
 const a=sourceIdentityAt(s.applied,s.appliedText,s.appliedText.indexOf("1"));
 const b=sourceIdentityAt(s.applied,s.appliedText,s.appliedText.indexOf('"b"'));
 s.endpoint(b.id,"E",a);
 const v=networkPresentation(s.applied,{all:true});
 const members=v.records.filter(e=>e.sort==="P"&&e.r.owner.id===s.applied.state.mo.roots[0].id&&e.r.label.kind==="key");
 assert.equal(members.length,2);
 const positions=members.map(e=>JSON.stringify(v.positions.get("P:"+e.id)));
 assert.equal(new Set(positions).size,2);
});

test("P2-01: bounded source occurrences report truncation; typed result relation navigation",()=>{
 const s=createUnifiedSession(JSON.stringify(Array.from({length:257},(_,i)=>i)));
 const root=s.applied.state.mo.roots[0],members=[...s.applied.state.mo.relations].filter(([,r])=>r.owner.id===root.id&&r.label.kind==="index");
 const n=members[0][1].target;
 assert.equal(s.atomic(members.slice(1).map(([id])=>({op:"rebindRelation",id,target:n}))).outcome.status,"OK");
 const info=sourceOccurrenceInfo(s.applied,s.appliedText,n);
 assert.equal(info.ranges.length,256);assert.equal(info.truncated,true);
 const p={sort:"P",id:members[0][0]};
 assert.deepEqual(occurrenceIdentity(s.applied,root,[0],p),p);
 assert.deepEqual(occurrenceIdentity(s.applied,root,[0],n),n);
 assert.equal(occurrenceIdentity(s.applied,root,[1],p),null);
 assert.equal(incomingAttachments(s.applied,n).length,257);
});
test("P2-01: visit budget is explicitly reported even with zero matching paths",()=>{
 const s=createUnifiedSession(JSON.stringify(Array.from({length:4100},()=>0)));
 const info=sourceOccurrenceInfo(s.applied,s.appliedText,{sort:"P",id:"absent"});
 assert.equal(info.truncated,true);assert.equal(info.ranges.length,0);
});
test("P2-02: historical step owns source and actual output slot after reflective replay",()=>{
 const s=createUnifiedSession(),first=s.run(env);
 s.reflect(["$sub"],"R","is_null");const second=s.run(env);
 const a=executionStepView(first,0),b=executionStepView(second,0);
 assert.equal(a.event.controller,"is_string");assert.equal(b.event.controller,"is_null");
 assert.equal(a.event.outputRole,"S");assert.equal(a.outputSlot,a.program.state.frames.get(a.event.frame).roles.S);
 assert.ok(a.changed.some(e=>e.sort==="P"&&e.id===a.outputSlot));
 assert.equal(JSON.parse(first.sourceText).$sub.$rel,"is_string");
 assert.equal(JSON.parse(second.sourceText).$sub.$rel,"is_null");
 assert.ok(sourceOccurrenceInfo(first.sourceProgram,first.sourceText,{sort:"P",id:a.event.sourceControllerSlot}).ranges.length);
 assert.deepEqual(first.result,["4"]);assert.deepEqual(second.result,[null]);
 assert.equal(s.history.length,3);
});
test("P2-03: latest import wins in both completion orders, cancellation and read failure",async()=>{
 const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
 for(const reverse of [false,true]){
  const c=createImportCoordinator(),a=deferred(),b=deferred(),log=[];
  const x=c.request(()=>a.promise,v=>log.push(v),e=>log.push(e.message));
  const y=c.request(()=>b.promise,v=>log.push(v),e=>log.push(e.message));
  if(reverse){b.resolve("B");await y;a.resolve("A")}else{a.resolve("A");await x;b.resolve("B")}
  assert.equal(await x,"STALE");assert.equal(await y,"COMMITTED");assert.deepEqual(log,["B"]);
 }
 const c=createImportCoordinator(),a=deferred(),log=[];
 const x=c.request(()=>a.promise,v=>log.push(v),e=>log.push(e.message));c.cancel();a.reject(Error("old"));assert.equal(await x,"STALE");
 assert.equal(await c.request(()=>Promise.reject(Error("read failed")),v=>log.push(v),e=>log.push(e.message)),"REJECT");
 assert.deepEqual(log,["read failed"]);
});

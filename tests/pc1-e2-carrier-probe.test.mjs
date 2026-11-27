import test from "node:test";
import assert from "node:assert/strict";

import {
  DupletArrayCarrier,
  JsonNearCarrier,
  E2_LEDGER_C,
  E2_LEDGER_QUALIFICATION_C,
  E2_DISPOSITION_CANDIDATE
} from "../research/pc1/e2-carrier-probe.mjs";
import { Key, N, P, Role, executeMO, serializeLosslessMO } from "../src/mo-core.js";
import {
  H as BH,
  Q as BQ,
  V as BV,
  classifyBranchWrites as bClassifyBranchWrites,
  commitBranchWrites as bCommitBranchWrites,
  createDuplet as bCreateDuplet,
  createE1State,
  createFrame as bCreateFrame,
  deserializeE1State,
  factorBundle as bFactorBundle,
  frameDepth as bFrameDepth,
  frameRE as bFrameRE,
  frameRoleSlot as bFrameRoleSlot,
  frameRoleValue as bFrameRoleValue,
  readDuplet as bReadDuplet,
  reattachDupletBegin as bReattachDupletBegin,
  rebindDupletEnd as bRebindDupletEnd,
  resolveContextualSlot as bResolveContextualSlot,
  serializeE1State
} from "../research/pc1/e1-witness.mjs";
import { deserializeE1Record, serializeE1Record } from "../research/pc1/e1-record.mjs";

function cSlot(c, owner, target) { return c.duplet(owner, target); }

function cloneC(c) { return DupletArrayCarrier.deserializeLossless(c.serializeLossless()); }

function observeHiddenC(c, dependentIds) {
  return dependentIds.map(id => c.read(c.read(id).begin).end);
}

test("E2 A — JS object identity preserves duplicate duplets, sharing, cycles and lossless reference roundtrip", () => {
  const a = new JsonNearCarrier();
  const A = a.atom("A", {name:"A"});
  const B = a.atom("B", {name:"B"});
  const d1 = a.duplet("d1", A, B);
  const d2 = a.duplet("d2", A, B);
  assert.notEqual(d1, d2);
  assert.equal(d1.begin, d2.begin);
  assert.equal(d1.end, d2.end);

  const dep1 = a.duplet("dep1", d1, A);
  const dep2 = a.duplet("dep2", d1, B);
  d1.end = d1;
  assert.equal(dep1.begin, dep2.begin);
  assert.equal(dep1.begin.end, d1);

  const encoded = a.serializeLossless();
  const decoded = JsonNearCarrier.deserializeLossless(encoded);
  assert.equal(decoded.readDuplet("dep1").begin, decoded.readDuplet("dep2").begin);
  assert.equal(decoded.readDuplet("d1").end, decoded.readDuplet("d1"));
  assert.equal(decoded.serializeLossless(), encoded);
});

test("E2 C/W1 — ERSO-style cyclic coupling preserves distinct equal-payload E0/O0 occurrences and roundtrips exactly", () => {
  const c = new DupletArrayCarrier();
  const e0 = c.atom(0);
  const o0 = c.atom(0);
  assert.notEqual(e0, o0);
  assert.deepEqual(c.payload(e0), c.payload(o0));
  const anchor = c.atom("anchor");
  const s = c.duplet(anchor, e0);
  const r = c.duplet(s, o0);
  c.reattach(s, r);
  assert.deepEqual(c.read(s), {id:s,begin:r,end:e0});
  assert.deepEqual(c.read(r), {id:r,begin:s,end:o0});
  const encoded = c.serializeLossless();
  const d = DupletArrayCarrier.deserializeLossless(encoded);
  assert.deepEqual(d.read(r), c.read(r));
  assert.deepEqual(d.read(s), c.read(s));
  assert.equal(d.serializeLossless(), encoded);
});

test("E2 C/W2 — equal pair values do not collapse occurrence identity; sharing remains mutation-observable", () => {
  const c = new DupletArrayCarrier();
  const a=c.atom("a"), b=c.atom("b"), x=c.atom("x"), y=c.atom("y"), cc=c.atom("c");
  const h1=c.duplet(a,b), h2=c.duplet(a,b);
  assert.notEqual(h1,h2);
  assert.deepEqual(c.read(h1).begin,c.read(h2).begin);
  assert.deepEqual(c.read(h1).end,c.read(h2).end);

  const shared1=c.duplet(h1,x), shared2=c.duplet(h1,y);
  const sharedBefore=observeHiddenC(c,[shared1,shared2]);
  assert.deepEqual(sharedBefore,[b,b]);
  c.rebind(h1,cc);
  assert.deepEqual(observeHiddenC(c,[shared1,shared2]),[cc,cc]);

  const d = new DupletArrayCarrier();
  const da=d.atom("a"), db=d.atom("b"), dx=d.atom("x"), dy=d.atom("y"), dc=d.atom("c");
  const dh1=d.duplet(da,db), dh2=d.duplet(da,db);
  const dep1=d.duplet(dh1,dx), dep2=d.duplet(dh2,dy);
  assert.deepEqual(observeHiddenC(d,[dep1,dep2]),[db,db]);
  d.rebind(dh1,dc);
  assert.deepEqual(observeHiddenC(d,[dep1,dep2]),[dc,db]);
});

test("E2 A/C W3 — semantic roles may share or separate physical carriers; C encodes alias partition in tuple topology", () => {
  const a = new JsonNearCarrier();
  const slots=a.atom("slots",{}), root=a.atom("root",{}), model=a.atom("model",{}), relValue=a.atom("relValue");
  const rootSlot=a.duplet("rootSlot",slots,root), modelSlot=a.duplet("modelSlot",slots,model), modelRel=a.duplet("modelRel",model,relValue);
  a.member(model,"$rel",modelRel);
  const sep=a.createFrame("sep",{E:modelSlot,O:rootSlot,R:rootSlot,S:rootSlot});
  const ali=a.createFrame("ali",{E:modelSlot,O:modelRel,R:modelRel,S:modelRel});
  assert.notEqual(a.roleSlot(sep,"R"),a.resolve(sep,"$ent/$rel"));
  assert.equal(a.roleSlot(ali,"R"),a.resolve(ali,"$ent/$rel"));

  const c = new DupletArrayCarrier();
  const cs=c.atom("slots"), cr=c.atom({}), cm=c.atom({}), cv=c.atom("relValue");
  const crs=cSlot(c,cs,cr), cms=cSlot(c,cs,cm), cmr=cSlot(c,cm,cv);
  c.member(cm,"$rel",cmr);
  const csep=c.createFrame({E:cms,O:crs,R:crs,S:crs});
  const cali=c.createFrame({E:cms,O:cmr,R:cmr,S:cmr});
  assert.notEqual(c.roleSlot(csep,"R"),c.resolve(csep,"$ent/$rel"));
  assert.equal(c.roleSlot(cali,"R"),c.resolve(cali,"$ent/$rel"));
  const decoded=cloneC(c);
  assert.equal(decoded.roleSlot(cali,"R"),decoded.resolve(cali,"$ent/$rel"));
});

test("E2 C/W4 — H→V and V→H can have equal (R,E) values while pair-encoded enriched frames remain distinct", () => {
  const c = new DupletArrayCarrier();
  const slots=c.atom("slots"), root=c.atom({}), oldModel=c.atom({}), model=c.atom({}), A=c.atom("A");
  const rootSlot=cSlot(c,slots,root), oldModelSlot=cSlot(c,slots,oldModel), modelSlot=cSlot(c,slots,model), aSlot=cSlot(c,root,A);
  c.member(root,"a",aSlot);
  const C0=c.createFrame({E:oldModelSlot,O:rootSlot,R:rootSlot,S:rootSlot});
  const CH=c.H(C0,"$rel/a");
  const CHV=c.V(CH,modelSlot);
  const CV=c.V(C0,modelSlot);
  const CVH=c.H(CV,"$rel/a");
  assert.equal(c.roleValue(CHV,"R"),c.roleValue(CVH,"R"));
  assert.equal(c.roleValue(CHV,"E"),c.roleValue(CVH,"E"));
  assert.equal(c.depth(CHV),c.depth(CVH));
  assert.notEqual(c.parent(CHV),c.parent(CVH));
  assert.notEqual(c.roleSlot(CHV,"O"),c.roleSlot(CVH,"O"));
});

test("E2 A/C W5 — same-slot branch writes are observable from identity and reject without a race winner", () => {
  const a = new JsonNearCarrier();
  const slots=a.atom("slots",{}), root=a.atom("root",{}), zero=a.atom("zero"), one=a.atom("one"), two=a.atom("two");
  const rootSlot=a.duplet("rootSlot",slots,root), xSlot=a.duplet("xSlot",root,zero);
  a.member(root,"x",xSlot);
  const C=a.createFrame("C",{E:rootSlot,O:rootSlot,R:rootSlot,S:rootSlot});
  const HR=a.H(C,"$rel/x","HR"), HO=a.H(C,"$obj/x","HO");
  assert.equal(HR.roles.R,HO.roles.R);
  const beforeA=xSlot.end;
  const ar=a.commitWrites([{frame:HR,target:one},{frame:HO,target:two}]);
  assert.equal(ar.status,"REJECT");
  assert.equal(xSlot.end,beforeA);

  const c = new DupletArrayCarrier();
  const cs=c.atom("slots"), cr=c.atom({}), cz=c.atom("zero"), co=c.atom("one"), ct=c.atom("two");
  const crs=cSlot(c,cs,cr), cxs=cSlot(c,cr,cz);
  c.member(cr,"x",cxs);
  const CC=c.createFrame({E:crs,O:crs,R:crs,S:crs});
  const CHR=c.H(CC,"$rel/x"), CHO=c.H(CC,"$obj/x");
  assert.equal(c.roleSlot(CHR,"R"),c.roleSlot(CHO,"R"));
  const before=c.serializeLossless();
  const rr=c.commitWrites([{frame:CHR,target:co},{frame:CHO,target:ct}]);
  assert.equal(rr.status,"REJECT");
  assert.equal(c.serializeLossless(),before);
});

test("E2 A/C W6 — Q order/multiplicity and prefix-commit runtime failure remain operational, not graph identity", () => {
  const a = new JsonNearCarrier();
  const slots=a.atom("slots",{}), zero=a.atom("zero"), one=a.atom("one"), two=a.atom("two");
  const r=a.duplet("r",slots,zero);
  const f=a.createFrame("F",{E:r,O:r,R:r,S:r});
  const q=a.Q(f,[{op:"rebindRole",role:"R",target:one},{op:"rebindRole",role:"R",target:two},{op:"rebindRole",role:"R",target:one}]);
  assert.equal(q.status,"OK");
  assert.equal(q.trace.length,3);
  assert.equal(r.end,one);

  const c0 = new DupletArrayCarrier();
  const cs=c0.atom("slots"), cz=c0.atom("zero"), co=c0.atom("one"), ct=c0.atom("two");
  const rs=cSlot(c0,cs,cz);
  const F=c0.createFrame({E:rs,O:rs,R:rs,S:rs});
  const c12=cloneC(c0), c21=cloneC(c0);
  const q12=c12.Q(F,[{op:"rebindRole",role:"R",target:co},{op:"rebindRole",role:"R",target:ct}]);
  const q21=c21.Q(F,[{op:"rebindRole",role:"R",target:ct},{op:"rebindRole",role:"R",target:co}]);
  assert.equal(q12.status,"OK");
  assert.equal(q21.status,"OK");
  assert.equal(c12.roleValue(F,"R"),ct);
  assert.equal(c21.roleValue(F,"R"),co);

  const cf=cloneC(c0);
  const missing=cf.pairs.length+100;
  const qf=cf.Q(F,[{op:"rebindRole",role:"R",target:co},{op:"rebindRole",role:"R",target:missing},{op:"rebindRole",role:"R",target:ct}]);
  assert.equal(qf.status,"REJECT");
  assert.equal(qf.diagnostic,"MISSING_TARGET");
  assert.deepEqual(qf.trace.map(x=>x.outcome.status),["OK","REJECT"]);
  assert.deepEqual(qf.trace.map(x=>x.outcome.semanticChange),[true,false]);
  assert.equal(cf.roleValue(F,"R"),co);

  const record=cf.serializeRecord(qf.trace);
  const decoded=DupletArrayCarrier.deserializeRecord(record);
  assert.deepEqual(decoded.trace.map(x=>x.outcome.status),["OK","REJECT"]);
  assert.deepEqual(decoded.trace.map(x=>x.outcome.semanticChange),[true,false]);
  assert.equal(decoded.state.roleValue(F,"R"),co);
});

test("E2 C/W7 — shared definition carrier does not collapse fresh invocation frame occurrences", () => {
  const c = new DupletArrayCarrier();
  const slots=c.atom("slots"), def=c.atom("definition"), model=c.atom("model"), argA=c.atom("argA"), argB=c.atom("argB"), objA=c.atom("objA"), objB=c.atom("objB");
  const defSlot=cSlot(c,slots,def), eSlot=cSlot(c,slots,model), rA=cSlot(c,slots,argA), rB=cSlot(c,slots,argB), oA=cSlot(c,slots,objA), oB=cSlot(c,slots,objB);
  const ca=c.createFrame({E:eSlot,O:oA,R:rA,S:rA}), cb=c.createFrame({E:eSlot,O:oB,R:rB,S:rB});
  const ia=c.V(ca,defSlot,{O:oA}), ib=c.V(cb,defSlot,{O:oB});
  assert.notEqual(ia,ib);
  assert.equal(c.roleSlot(ia,"E"),defSlot);
  assert.equal(c.roleSlot(ib,"E"),defSlot);
  assert.notEqual(c.roleSlot(ia,"R"),c.roleSlot(ib,"R"));
  assert.notEqual(c.roleSlot(ia,"O"),c.roleSlot(ib,"O"));
});

test("E2 A/C W8 — conditional factorization retains occurrence identity, order and policy distinction", () => {
  const a = new JsonNearCarrier();
  const not=a.atom("not"), z=a.atom("0"), o=a.atom("1");
  const ap=[{id:"p0",R:not,O:z,S:o},{id:"p1",R:not,O:o,S:z}];
  assert.equal(a.factorBundle(ap).status,"FACTORIZED");
  const an=[{id:"n0",R:not,O:z,S:o},{id:"n1",R:not,O:z,S:z}];
  assert.equal(a.factorBundle(an).status,"NON_FUNCTIONAL");
  const ai=[{id:"i0",R:not,O:z,S:o},{id:"i1",R:not,O:z,S:o}];
  assert.equal(a.factorBundle(ai).status,"FALLBACK_IDENTITY");
  assert.equal(a.factorBundle(ai,{preserveOccurrenceIdentity:false}).status,"FACTORIZED");

  const c = new DupletArrayCarrier();
  const cn=c.atom("not"), c0=c.atom("0"), c1=c.atom("1");
  const positive=c.createBundle([{R:cn,O:c0,S:c1},{R:cn,O:c1,S:c0}]);
  const p=c.factorBundle(positive.head);
  assert.equal(p.status,"FACTORIZED");
  assert.deepEqual(p.entries.map(e=>e.id),positive.occurrences);
  const negative=c.createBundle([{R:cn,O:c0,S:c1},{R:cn,O:c0,S:c0}]);
  assert.equal(c.factorBundle(negative.head).status,"NON_FUNCTIONAL");
  const identity=c.createBundle([{R:cn,O:c0,S:c1},{R:cn,O:c0,S:c1}]);
  const fi=c.factorBundle(identity.head);
  assert.equal(fi.status,"FALLBACK_IDENTITY");
  assert.deepEqual(fi.entries.map(e=>e.id),identity.occurrences);
  assert.equal(c.factorBundle(identity.head,{preserveOccurrenceIdentity:false}).status,"FACTORIZED");

  const encoded=c.serializeLossless();
  const d=DupletArrayCarrier.deserializeLossless(encoded);
  assert.deepEqual(d.factorBundle(identity.head).entries.map(e=>e.id),identity.occurrences);
  assert.equal(d.serializeLossless(),encoded);
});

test("E2 ledger — homogeneous topology removes structural metadata but not allocation, execution policy, scalar payload or evidence trace", () => {
  const ledger=new Map(E2_LEDGER_C.map(([k,v,why])=>[k,{v,why}]));
  for (const key of [
    "shared vs distinct equal-valued duplets",
    "frame E/O/R/S structure",
    "frame parent ancestry",
    "role-carrier alias partition",
    "bundle occurrence identity and order"
  ]) assert.equal(ledger.get(key).v,"DUPLET-DERIVED");
  for (const key of [
    "duplet occurrence identity",
    "fresh occurrence allocation",
    "H path resolution and transition",
    "V fresh-child transition",
    "Q sequential execution/failure boundary",
    "alias-conflict rejection policy"
  ]) assert.equal(ledger.get(key).v,"CARRIER-PRIMITIVE");
  assert.equal(ledger.get("JSON scalar payload and member-key text").v,"SIDE-METADATA");
  assert.equal(ledger.get("ordered execution trace").v,"EVIDENCE-ONLY");
  assert.equal(E2_DISPOSITION_CANDIDATE,"NO_SELECTION / MORE_EVIDENCE_REQUIRED");
});


function bMustMO(state, action) {
  const result = executeMO(state.mo, action);
  assert.equal(result.outcome.status, "OK", result.outcome.diagnostic ?? action.op);
  return { ...state, mo: result.state };
}
function bNode(state, id, kind = "entity", payload = null) {
  const action = { op: "createNode", id, kind };
  if (kind !== "object" && kind !== "array") action.payload = payload;
  return bMustMO(state, action);
}
function bRelation(state, id, owner, label, target) {
  return bMustMO(state, { op: "createRelation", id, owner, label, target });
}
function bSlot(state, id, owner, target) {
  return bRelation(state, id, owner, Role("slot:" + id), target);
}
function bMustTransition(result) {
  assert.equal(result.outcome.status, "OK", result.outcome.diagnostic ?? "transition");
  return result.state;
}
function endpointName(endpoint) {
  return (endpoint.sort === "N" ? "A:" : "D:") + endpoint.id;
}
function bDupletNames(state, id) {
  const d=bReadDuplet(state,id);
  return [endpointName(d.begin),endpointName(d.end)];
}
function aNames(map) {
  const rev=new Map(Object.entries(map).map(([name,ref])=>[ref,{name,kind:ref.kind}]));
  return ref => {
    const hit=rev.get(ref);
    if(!hit) throw new Error("unmapped A ref "+ref?.id);
    return (hit.kind === "atom" ? "A:" : "D:") + hit.name;
  };
}
function cNames(carrier, map) {
  const rev=new Map(Object.entries(map).map(([name,id])=>[id,name]));
  return id => {
    const name=rev.get(id);
    if(!name) throw new Error("unmapped C handle "+id);
    return (carrier.isAtom(id) ? "A:" : "D:") + name;
  };
}
function traceStatuses(trace) {
  return trace.map(x=>x.outcome?.status ?? null);
}
function traceChanges(trace) {
  return trace.map(x=>x.outcome?.semanticChange ?? null);
}

test("E2-R2 P2-02 — C rejects atom mutation, validates bundle before allocation, and deletion is append-only/no-reuse", () => {
  const c=new DupletArrayCarrier();
  const x=c.atom("x"), y=c.atom("y");
  const beforeAtom=c.serializeLossless();
  assert.throws(()=>c.rebind(x,y), e=>e?.diagnostic==="MISSING_DUPLET");
  assert.equal(c.serializeLossless(),beforeAtom);

  const beforeBundle=c.serializeLossless();
  assert.throws(()=>c.createBundle([{R:x,O:x,S:y},{R:x,O:999,S:y}]), e=>e?.diagnostic==="INVALID_ENDPOINT");
  assert.equal(c.serializeLossless(),beforeBundle);

  const d=c.duplet(x,y);
  const allocated=d;
  c.deleteDuplet(d);
  assert.equal(c.exists(d),false);
  const next=c.duplet(x,y);
  assert.ok(next>allocated);
  assert.notEqual(next,allocated);
  const encoded=c.serializeLossless();
  const decoded=DupletArrayCarrier.deserializeLossless(encoded);
  assert.equal(decoded.exists(allocated),false);
  assert.equal(decoded.serializeLossless(),encoded);

  const held=c.duplet(x,y);
  const dependent=c.duplet(held,x);
  assert.throws(()=>c.deleteDuplet(held), e=>e?.diagnostic==="DUPLET_STILL_REFERENCED");
  assert.equal(c.read(dependent).begin,held);

  assert.throws(()=>c.createFrame({E:x,O:next,R:next,S:next}), e=>e?.diagnostic==="INVALID_FRAME_SLOT");
});

test("E2-R2 P2-03 — A/C evidence traces are immutable identity snapshots, preserve no-op, cycles and roundtrip separately", () => {
  const a=new JsonNearCarrier();
  const slots=a.atom("slots",{}), zero=a.atom("zero"), one=a.atom("one");
  const r=a.duplet("r",slots,zero);
  const f=a.createFrame("F",{E:r,O:r,R:r,S:r});
  const ar=a.Q(f,[
    {op:"rebindRole",role:"R",target:one},
    {op:"rebindRole",role:"R",target:one}
  ]);
  assert.deepEqual(traceStatuses(ar.trace),["OK","OK"]);
  assert.deepEqual(traceChanges(ar.trace),[true,false]);
  assert.ok(Object.isFrozen(ar.trace));
  assert.ok(Object.isFrozen(ar.trace[0]));
  assert.equal(typeof ar.trace[0].target.id,"string");

  const cycleA=a.Q(f,[{op:"rebindRole",role:"R",target:r}]);
  assert.equal(cycleA.status,"OK");
  assert.equal(r.end,r);
  assert.doesNotThrow(()=>JSON.stringify(cycleA.trace));
  const arec=a.serializeRecord(cycleA.trace);
  const adec=JsonNearCarrier.deserializeRecord(arec);
  assert.deepEqual(adec.trace,cycleA.trace);
  assert.equal(adec.state.readDuplet("r").end,adec.state.readDuplet("r"));

  const c=new DupletArrayCarrier();
  const cs=c.atom("slots"), cz=c.atom("zero"), co=c.atom("one");
  const rs=c.duplet(cs,cz);
  const cf=c.createFrame({E:rs,O:rs,R:rs,S:rs});
  const cr=c.Q(cf,[
    {op:"rebindRole",role:"R",target:co},
    {op:"rebindRole",role:"R",target:co}
  ]);
  assert.deepEqual(traceStatuses(cr.trace),["OK","OK"]);
  assert.deepEqual(traceChanges(cr.trace),[true,false]);
  assert.ok(Object.isFrozen(cr.trace));
  const cycleC=c.Q(cf,[{op:"rebindRole",role:"R",target:rs}]);
  assert.equal(cycleC.status,"OK");
  assert.equal(c.roleValue(cf,"R"),rs);
  const crec=c.serializeRecord(cycleC.trace);
  const cdec=DupletArrayCarrier.deserializeRecord(crec);
  assert.deepEqual(cdec.trace,cycleC.trace);
  assert.equal(cdec.state.roleValue(cf,"R"),rs);
});

test("E2-R2 P3-01 — A/C contextual object-key addressing follows accepted E1 JSON-pointer token decoding", () => {
  const a=new JsonNearCarrier();
  const slots=a.atom("slots",{}), root=a.atom("root",{}), value=a.atom("value");
  const rootSlot=a.duplet("rootSlot",slots,root), slash=a.duplet("slash",root,value), empty=a.duplet("empty",root,value);
  a.member(root,"a/b",slash);
  a.member(root,"",empty);
  const af=a.createFrame("F",{E:rootSlot,O:rootSlot,R:rootSlot,S:rootSlot});
  assert.equal(a.resolve(af,"$rel/a~1b"),slash);
  assert.equal(a.resolve(af,"$rel/"),empty);

  const c=new DupletArrayCarrier();
  const cs=c.atom("slots"), cr=c.atom({}), cv=c.atom("value");
  const crs=c.duplet(cs,cr), cslash=c.duplet(cr,cv), cempty=c.duplet(cr,cv);
  c.member(cr,"a/b",cslash);
  c.member(cr,"",cempty);
  const cf=c.createFrame({E:crs,O:crs,R:crs,S:crs});
  assert.equal(c.resolve(cf,"$rel/a~1b"),cslash);
  assert.equal(c.resolve(cf,"$rel/"),cempty);
  assert.match(E2_LEDGER_QUALIFICATION_C.contextualAddressing,/array-index typing remains outside/i);
});

// Common correspondence fixtures execute B from the accepted E1 implementation.
// Logical names are explicit maps; raw carrier identifiers/indices are never
// compared across A/B/C.

test("E2-R2 correspondence W1 — exact ERSO identity partition and topology agree across B/A/C", () => {
  let b=createE1State();
  b=bNode(b,"anchor");
  b=bNode(b,"E0","number",0);
  b=bNode(b,"O0","number",0);
  b=bMustTransition(bCreateDuplet(b,{id:"S0",begin:N("anchor"),end:N("E0")}));
  b=bMustTransition(bCreateDuplet(b,{id:"R1",begin:P("S0"),end:N("O0")}));
  b=bMustTransition(bReattachDupletBegin(b,"S0",P("R1")));
  const bObs={
    payloads:[b.mo.nodes.get("E0").payload,b.mo.nodes.get("O0").payload],
    distinctAtoms:endpointName(N("E0"))!==endpointName(N("O0")),
    S0:bDupletNames(b,"S0"),
    R1:bDupletNames(b,"R1"),
    distinctDuplets:bReadDuplet(b,"S0").id!==bReadDuplet(b,"R1").id,
    roundtrip:serializeE1State(deserializeE1State(serializeE1State(b)))===serializeE1State(b)
  };

  const a=new JsonNearCarrier();
  const am={anchor:a.atom("anchor"),E0:a.atom("E0",0),O0:a.atom("O0",0)};
  am.S0=a.duplet("S0",am.anchor,am.E0);
  am.R1=a.duplet("R1",am.S0,am.O0);
  a.reattach("S0",am.R1);
  const an=aNames(am);
  const aObs={
    payloads:[am.E0.value,am.O0.value],
    distinctAtoms:am.E0!==am.O0,
    S0:[an(am.S0.begin),an(am.S0.end)],
    R1:[an(am.R1.begin),an(am.R1.end)],
    distinctDuplets:am.S0!==am.R1,
    roundtrip:JsonNearCarrier.deserializeLossless(a.serializeLossless()).serializeLossless()===a.serializeLossless()
  };

  const c=new DupletArrayCarrier();
  const cm={anchor:c.atom("anchor"),E0:c.atom(0),O0:c.atom(0)};
  cm.S0=c.duplet(cm.anchor,cm.E0);
  cm.R1=c.duplet(cm.S0,cm.O0);
  c.reattach(cm.S0,cm.R1);
  const cn=cNames(c,cm);
  const cObs={
    payloads:[c.payload(cm.E0),c.payload(cm.O0)],
    distinctAtoms:cm.E0!==cm.O0,
    S0:[cn(c.read(cm.S0).begin),cn(c.read(cm.S0).end)],
    R1:[cn(c.read(cm.R1).begin),cn(c.read(cm.R1).end)],
    distinctDuplets:cm.S0!==cm.R1,
    roundtrip:DupletArrayCarrier.deserializeLossless(c.serializeLossless()).serializeLossless()===c.serializeLossless()
  };
  assert.deepEqual(aObs,bObs);
  assert.deepEqual(cObs,bObs);
});

test("E2-R2 correspondence W2 — ent_abc attachment, mutation, reattach and duplicate occurrence agree across B/A/C", () => {
  const atomIds=["ent","a","relA","relA2","b","relB","c","relC"];
  let b=createE1State();
  for(const id of atomIds) b=bNode(b,id);
  b=bMustTransition(bCreateDuplet(b,{id:"rA",begin:N("ent"),end:N("a")}));
  b=bMustTransition(bCreateDuplet(b,{id:"sA",begin:P("rA"),end:N("relA")}));
  b=bMustTransition(bCreateDuplet(b,{id:"rB",begin:P("sA"),end:N("b")}));
  b=bMustTransition(bCreateDuplet(b,{id:"sB",begin:P("rB"),end:N("relB")}));
  b=bMustTransition(bCreateDuplet(b,{id:"rC",begin:P("sB"),end:N("c")}));
  b=bMustTransition(bCreateDuplet(b,{id:"sC",begin:P("rC"),end:N("relC")}));
  const bBefore={rB:bDupletNames(b,"rB")[0],rC:bDupletNames(b,"rC")[0]};
  b=bMustTransition(bRebindDupletEnd(b,"sA",N("relA2")));
  const bAfterEnd={rBBegin:bDupletNames(b,"rB")[0],sAEnd:bDupletNames(b,"sA")[1]};
  const bRB=bReadDuplet(b,"rB").id;
  b=bMustTransition(bReattachDupletBegin(b,"rB",P("rA")));
  b=bMustTransition(bCreateDuplet(b,{id:"rC2",begin:P("sB"),end:N("c")}));
  const bObs={
    before:bBefore,afterEnd:bAfterEnd,
    reattachStable:bReadDuplet(b,"rB").id===bRB,
    rBBegin:bDupletNames(b,"rB")[0],
    duplicateSame:JSON.stringify(bDupletNames(b,"rC"))===JSON.stringify(bDupletNames(b,"rC2")),
    duplicateDistinct:bReadDuplet(b,"rC").id!==bReadDuplet(b,"rC2").id
  };

  const a=new JsonNearCarrier(), am={};
  for(const id of atomIds) am[id]=a.atom(id);
  am.rA=a.duplet("rA",am.ent,am.a);
  am.sA=a.duplet("sA",am.rA,am.relA);
  am.rB=a.duplet("rB",am.sA,am.b);
  am.sB=a.duplet("sB",am.rB,am.relB);
  am.rC=a.duplet("rC",am.sB,am.c);
  am.sC=a.duplet("sC",am.rC,am.relC);
  const an=aNames(am);
  const aBefore={rB:an(am.rB.begin),rC:an(am.rC.begin)};
  a.rebind("sA",am.relA2);
  const aAfterEnd={rBBegin:an(am.rB.begin),sAEnd:an(am.sA.end)};
  const arbid=am.rB;
  a.reattach("rB",am.rA);
  am.rC2=a.duplet("rC2",am.sB,am.c);
  const aObs={before:aBefore,afterEnd:aAfterEnd,reattachStable:am.rB===arbid,rBBegin:an(am.rB.begin),
    duplicateSame:an(am.rC.begin)===an(am.rC2.begin)&&an(am.rC.end)===an(am.rC2.end),duplicateDistinct:am.rC!==am.rC2};

  const c=new DupletArrayCarrier(), cm={};
  for(const id of atomIds) cm[id]=c.atom(id);
  cm.rA=c.duplet(cm.ent,cm.a);
  cm.sA=c.duplet(cm.rA,cm.relA);
  cm.rB=c.duplet(cm.sA,cm.b);
  cm.sB=c.duplet(cm.rB,cm.relB);
  cm.rC=c.duplet(cm.sB,cm.c);
  cm.sC=c.duplet(cm.rC,cm.relC);
  let cn=cNames(c,cm);
  const cBefore={rB:cn(c.read(cm.rB).begin),rC:cn(c.read(cm.rC).begin)};
  c.rebind(cm.sA,cm.relA2);
  const cAfterEnd={rBBegin:cn(c.read(cm.rB).begin),sAEnd:cn(c.read(cm.sA).end)};
  const crbid=cm.rB;
  c.reattach(cm.rB,cm.rA);
  cm.rC2=c.duplet(cm.sB,cm.c);
  cn=cNames(c,cm);
  const cObs={before:cBefore,afterEnd:cAfterEnd,reattachStable:cm.rB===crbid,rBBegin:cn(c.read(cm.rB).begin),
    duplicateSame:cn(c.read(cm.rC).begin)===cn(c.read(cm.rC2).begin)&&cn(c.read(cm.rC).end)===cn(c.read(cm.rC2).end),duplicateDistinct:cm.rC!==cm.rC2};
  assert.deepEqual(aObs,bObs);
  assert.deepEqual(cObs,bObs);
});

test("E2-R2 correspondence W3 — separated/aliased role carriers agree across B/A/C", () => {
  let b=createE1State();
  b=bNode(b,"slots"); b=bNode(b,"projection","object"); b=bNode(b,"model","object"); b=bNode(b,"modelRelValue");
  b=bSlot(b,"projectionSlot",N("slots"),N("projection"));
  b=bSlot(b,"modelSlot",N("slots"),N("model"));
  b=bRelation(b,"modelRel",N("model"),Key("$rel"),N("modelRelValue"));
  b=bMustTransition(bCreateFrame(b,{id:"sep",E:"modelSlot",O:"projectionSlot",R:"projectionSlot",S:"projectionSlot"}));
  b=bMustTransition(bCreateFrame(b,{id:"ali",E:"modelSlot",O:"modelRel",R:"modelRel",S:"modelRel"}));
  const bObs={
    separated:bFrameRoleSlot(b,"sep","R").id!==bResolveContextualSlot(b,"sep","$ent/$rel").id,
    aliased:bFrameRoleSlot(b,"ali","R").id===bResolveContextualSlot(b,"ali","$ent/$rel").id,
    eDistinct:bFrameRoleSlot(b,"ali","E").id!==bFrameRoleSlot(b,"ali","R").id
  };

  const a=new JsonNearCarrier();
  const as=a.atom("slots",{}), ap=a.atom("projection",{}), amod=a.atom("model",{}), av=a.atom("modelRelValue");
  const aps=a.duplet("projectionSlot",as,ap), ams=a.duplet("modelSlot",as,amod), amr=a.duplet("modelRel",amod,av);
  a.member(amod,"$rel",amr);
  const asep=a.createFrame("sep",{E:ams,O:aps,R:aps,S:aps}), aali=a.createFrame("ali",{E:ams,O:amr,R:amr,S:amr});
  const aObs={separated:a.roleSlot(asep,"R")!==a.resolve(asep,"$ent/$rel"),aliased:a.roleSlot(aali,"R")===a.resolve(aali,"$ent/$rel"),eDistinct:a.roleSlot(aali,"E")!==a.roleSlot(aali,"R")};

  const c=new DupletArrayCarrier();
  const cs=c.atom("slots"), cp=c.atom({}), cmod=c.atom({}), cv=c.atom("modelRelValue");
  const cps=c.duplet(cs,cp), cms=c.duplet(cs,cmod), cmr=c.duplet(cmod,cv);
  c.member(cmod,"$rel",cmr);
  const csep=c.createFrame({E:cms,O:cps,R:cps,S:cps}), cali=c.createFrame({E:cms,O:cmr,R:cmr,S:cmr});
  const cObs={separated:c.roleSlot(csep,"R")!==c.resolve(csep,"$ent/$rel"),aliased:c.roleSlot(cali,"R")===c.resolve(cali,"$ent/$rel"),eDistinct:c.roleSlot(cali,"E")!==c.roleSlot(cali,"R")};
  assert.deepEqual(aObs,bObs);
  assert.deepEqual(cObs,bObs);
});

test("E2-R2 correspondence W4 — enriched frames plus H/V identity traces agree across B/A/C", () => {
  let b=createE1State();
  for(const id of ["slots","A"]) b=bNode(b,id);
  for(const id of ["root","oldModel","M1"]) b=bNode(b,id,"object");
  b=bSlot(b,"rootSlot",N("slots"),N("root")); b=bSlot(b,"oldModelSlot",N("slots"),N("oldModel")); b=bSlot(b,"modelSlot",N("slots"),N("M1"));
  b=bRelation(b,"aSlot",N("root"),Key("a"),N("A"));
  b=bMustTransition(bCreateFrame(b,{id:"C0",E:"oldModelSlot",O:"rootSlot",R:"rootSlot",S:"rootSlot"}));
  const bh=BH(b,{frame:"C0",path:"$rel/a",id:"CH"}); b=bh.state;
  const bhv=BV(b,{frame:"CH",modelSlot:"modelSlot",id:"CHV"}); b=bhv.state;
  const bv=BV(b,{frame:"C0",modelSlot:"modelSlot",id:"CV"}); b=bv.state;
  const bvh=BH(b,{frame:"CV",path:"$rel/a",id:"CVH"}); b=bvh.state;
  const bTrace=[...bh.trace,...bhv.trace,...bv.trace,...bvh.trace];
  const bObs={sameR:endpointName(bFrameRE(b,"CHV").R)===endpointName(bFrameRE(b,"CVH").R),sameE:endpointName(bFrameRE(b,"CHV").E)===endpointName(bFrameRE(b,"CVH").E),
    depths:[bFrameDepth(b,"CHV"),bFrameDepth(b,"CVH")],parentsDistinct:b.frames.get("CHV").parent!==b.frames.get("CVH").parent,
    O:["D:aSlot","D:rootSlot"],traceOps:bTrace.map(x=>x.op),traceRoundtrip:deserializeE1Record(serializeE1Record(b,bTrace)).trace.length===4};

  const a=new JsonNearCarrier();
  const as=a.atom("slots",{}), A=a.atom("A"), root=a.atom("root",{}), old=a.atom("oldModel",{}), m1=a.atom("M1",{});
  const ars=a.duplet("rootSlot",as,root), aos=a.duplet("oldModelSlot",as,old), ams=a.duplet("modelSlot",as,m1), aas=a.duplet("aSlot",root,A);
  a.member(root,"a",aas);
  const a0=a.createFrame("C0",{E:aos,O:ars,R:ars,S:ars});
  const ah=a.HObserved(a0,"$rel/a","CH"), ahv=a.VObserved(ah.frame,ams,"CHV"), av=a.VObserved(a0,ams,"CV"), avh=a.HObserved(av.frame,"$rel/a","CVH");
  const at=[...ah.trace,...ahv.trace,...av.trace,...avh.trace];
  const aObs={sameR:a.roleValue(ahv.frame,"R")===a.roleValue(avh.frame,"R"),sameE:a.roleValue(ahv.frame,"E")===a.roleValue(avh.frame,"E"),
    depths:[a.depth(ahv.frame),a.depth(avh.frame)],parentsDistinct:ahv.frame.parent!==avh.frame.parent,O:["D:"+a.roleSlot(ahv.frame,"O").id,"D:"+a.roleSlot(avh.frame,"O").id],
    traceOps:at.map(x=>x.op),traceRoundtrip:JsonNearCarrier.deserializeRecord(a.serializeRecord(at)).trace.length===4};

  const c=new DupletArrayCarrier();
  const cs=c.atom("slots"), cA=c.atom("A"), cr=c.atom({}), co=c.atom({}), cm=c.atom({});
  const crs=c.duplet(cs,cr), cos=c.duplet(cs,co), cms=c.duplet(cs,cm), cas=c.duplet(cr,cA);
  c.member(cr,"a",cas);
  const c0=c.createFrame({E:cos,O:crs,R:crs,S:crs});
  const ch=c.HObserved(c0,"$rel/a"), chv=c.VObserved(ch.frame,cms), cvv=c.VObserved(c0,cms), cvh=c.HObserved(cvv.frame,"$rel/a");
  const ct=[...ch.trace,...chv.trace,...cvv.trace,...cvh.trace];
  const cmap=cNames(c,{aSlot:cas,rootSlot:crs});
  const cObs={sameR:c.roleValue(chv.frame,"R")===c.roleValue(cvh.frame,"R"),sameE:c.roleValue(chv.frame,"E")===c.roleValue(cvh.frame,"E"),
    depths:[c.depth(chv.frame),c.depth(cvh.frame)],parentsDistinct:c.parent(chv.frame)!==c.parent(cvh.frame),O:[cmap(c.roleSlot(chv.frame,"O")),cmap(c.roleSlot(cvh.frame,"O"))],
    traceOps:ct.map(x=>x.op),traceRoundtrip:DupletArrayCarrier.deserializeRecord(c.serializeRecord(ct)).trace.length===4};
  assert.deepEqual(aObs,bObs);
  assert.deepEqual(cObs,bObs);
});

test("E2-R2 correspondence W5 — disjoint commutation and same-slot conflict agree across B/A/C", () => {
  let b=createE1State();
  for(const id of ["slots","one","two","zero"]) b=bNode(b,id);
  b=bNode(b,"root","object"); b=bSlot(b,"rootSlot",N("slots"),N("root"));
  for(const k of ["a","b","x"]) b=bRelation(b,k+"Slot",N("root"),Key(k),N("zero"));
  b=bMustTransition(bCreateFrame(b,{id:"C0",E:"rootSlot",O:"rootSlot",R:"rootSlot",S:"rootSlot"}));
  b=bMustTransition(BH(b,{frame:"C0",path:"$rel/a",id:"HA"}));
  b=bMustTransition(BH(b,{frame:"C0",path:"$rel/b",id:"HB"}));
  const bd=[{frame:"HA",target:N("one")},{frame:"HB",target:N("two")}];
  const bab=bCommitBranchWrites(b,bd), bba=bCommitBranchWrites(b,[...bd].reverse());
  const bCommute=serializeLosslessMO(bab.state.mo)===serializeLosslessMO(bba.state.mo);
  b=bMustTransition(BH(b,{frame:"C0",path:"$rel/x",id:"HRX"})); b=bMustTransition(BH(b,{frame:"C0",path:"$obj/x",id:"HOX"}));
  const bBefore=serializeE1State(b), bconf=bCommitBranchWrites(b,[{frame:"HRX",target:N("one")},{frame:"HOX",target:N("two")}]);
  const bObs={classify:bClassifyBranchWrites(b,bd).status,commute:bCommute,final:["A:one","A:two"],conflict:bconf.outcome.status,unchanged:serializeE1State(bconf.state)===bBefore};

  const makeA=()=>{
    const a=new JsonNearCarrier(), slots=a.atom("slots",{}), one=a.atom("one"), two=a.atom("two"), zero=a.atom("zero"), root=a.atom("root",{});
    const rootSlot=a.duplet("rootSlot",slots,root), aSlot=a.duplet("aSlot",root,zero), bSlot=a.duplet("bSlot",root,zero), xSlot=a.duplet("xSlot",root,zero);
    for(const [k,s] of [["a",aSlot],["b",bSlot],["x",xSlot]]) a.member(root,k,s);
    const C0=a.createFrame("C0",{E:rootSlot,O:rootSlot,R:rootSlot,S:rootSlot});
    const HA=a.H(C0,"$rel/a","HA"), HB=a.H(C0,"$rel/b","HB");
    return {a,one,two,aSlot,bSlot,xSlot,C0,HA,HB};
  };
  const aa=makeA(), a1=JsonNearCarrier.deserializeLossless(aa.a.serializeLossless()), a2=JsonNearCarrier.deserializeLossless(aa.a.serializeLossless());
  const ad1=[{frame:a1.frame("HA"),target:a1.ref("one")},{frame:a1.frame("HB"),target:a1.ref("two")}];
  const ad2=[{frame:a2.frame("HB"),target:a2.ref("two")},{frame:a2.frame("HA"),target:a2.ref("one")}];
  const ac1=a1.commitWrites(ad1), ac2=a2.commitWrites(ad2);
  const aCommute=a1.readDuplet("aSlot").end.id===a2.readDuplet("aSlot").end.id&&a1.readDuplet("bSlot").end.id===a2.readDuplet("bSlot").end.id;
  const aHRX=aa.a.H(aa.C0,"$rel/x","HRX"), aHOX=aa.a.H(aa.C0,"$obj/x","HOX"), aBefore=aa.a.serializeLossless();
  const aconf=aa.a.commitWrites([{frame:aHRX,target:aa.one},{frame:aHOX,target:aa.two}]);
  const aObs={classify:a1.classifyWrites(ad1).status,commute:aCommute,final:["A:"+a1.readDuplet("aSlot").end.id,"A:"+a1.readDuplet("bSlot").end.id],conflict:aconf.status,unchanged:aa.a.serializeLossless()===aBefore};

  const makeC=()=>{
    const c=new DupletArrayCarrier(), slots=c.atom("slots"), one=c.atom("one"), two=c.atom("two"), zero=c.atom("zero"), root=c.atom({});
    const rootSlot=c.duplet(slots,root), aSlot=c.duplet(root,zero), bSlot=c.duplet(root,zero), xSlot=c.duplet(root,zero);
    c.member(root,"a",aSlot); c.member(root,"b",bSlot); c.member(root,"x",xSlot);
    const C0=c.createFrame({E:rootSlot,O:rootSlot,R:rootSlot,S:rootSlot}), HA=c.H(C0,"$rel/a"), HB=c.H(C0,"$rel/b");
    return {c,one,two,aSlot,bSlot,xSlot,C0,HA,HB};
  };
  const cc=makeC(), c1=cloneC(cc.c), c2=cloneC(cc.c);
  const cd1=[{frame:cc.HA,target:cc.one},{frame:cc.HB,target:cc.two}], cd2=[{frame:cc.HB,target:cc.two},{frame:cc.HA,target:cc.one}];
  c1.commitWrites(cd1); c2.commitWrites(cd2);
  const cCommute=c1.roleValue(cc.HA,"R")===c2.roleValue(cc.HA,"R")&&c1.roleValue(cc.HB,"R")===c2.roleValue(cc.HB,"R");
  const cHRX=cc.c.H(cc.C0,"$rel/x"), cHOX=cc.c.H(cc.C0,"$obj/x"), cBefore=cc.c.serializeLossless();
  const cconf=cc.c.commitWrites([{frame:cHRX,target:cc.one},{frame:cHOX,target:cc.two}]);
  const cm=cNames(cc.c,{one:cc.one,two:cc.two});
  const cObs={classify:c1.classifyWrites(cd1).status,commute:cCommute,final:[cm(c1.read(cc.aSlot).end),cm(c1.read(cc.bSlot).end)],conflict:cconf.status,unchanged:cc.c.serializeLossless()===cBefore};
  assert.deepEqual(aObs,bObs);
  assert.deepEqual(cObs,bObs);
  assert.equal(ac1.status,"OK"); assert.equal(ac2.status,"OK");
});

test("E2-R2 correspondence W6 — Q order, no-op semanticChange, runtime failure and cyclic trace roundtrip agree across B/A/C", () => {
  let b=createE1State();
  for(const id of ["slots","zero","one","two"]) b=bNode(b,id);
  b=bSlot(b,"rSlot",N("slots"),N("zero"));
  b=bMustTransition(bCreateFrame(b,{id:"F",E:"rSlot",O:"rSlot",R:"rSlot",S:"rSlot"}));
  const br=BQ(b,{frame:"F",steps:[{op:"rebindRole",role:"R",target:N("one")},{op:"rebindRole",role:"R",target:N("one")}]});
  const bf=BQ(b,{frame:"F",steps:[{op:"rebindRole",role:"R",target:N("one")},{op:"rebindRole",role:"R",target:N("missing")},{op:"rebindRole",role:"R",target:N("two")}]});
  const bc=BQ(b,{frame:"F",steps:[{op:"rebindRole",role:"R",target:P("rSlot")}]});
  const bRec=deserializeE1Record(serializeE1Record(bc.state,bc.trace));
  const bObs={repeat:traceStatuses(br.trace),changes:traceChanges(br.trace),failure:traceStatuses(bf.trace),failureChanges:traceChanges(bf.trace),cycleStatus:bc.outcome.status,cycleTarget:endpointName(bFrameRoleValue(bc.state,"F","R")),recordTrace:bRec.trace.length};

  const abase=new JsonNearCarrier(), as=abase.atom("slots",{}), az=abase.atom("zero"), ao=abase.atom("one"), at=abase.atom("two");
  const ar=abase.duplet("rSlot",as,az); abase.createFrame("F",{E:ar,O:ar,R:ar,S:ar});
  const arun=JsonNearCarrier.deserializeLossless(abase.serializeLossless());
  const afail=JsonNearCarrier.deserializeLossless(abase.serializeLossless());
  const acycle=JsonNearCarrier.deserializeLossless(abase.serializeLossless());
  const aq=arun.Q(arun.frame("F"),[{op:"rebindRole",role:"R",target:arun.ref("one")},{op:"rebindRole",role:"R",target:arun.ref("one")}]);
  const detached={kind:"atom",id:"missing",value:null,members:{}};
  const aqf=afail.Q(afail.frame("F"),[{op:"rebindRole",role:"R",target:afail.ref("one")},{op:"rebindRole",role:"R",target:detached},{op:"rebindRole",role:"R",target:afail.ref("two")}]);
  const ac=acycle.Q(acycle.frame("F"),[{op:"rebindRole",role:"R",target:acycle.readDuplet("rSlot")}]);
  const arec=JsonNearCarrier.deserializeRecord(acycle.serializeRecord(ac.trace));
  const aObs={repeat:traceStatuses(aq.trace),changes:traceChanges(aq.trace),failure:traceStatuses(aqf.trace),failureChanges:traceChanges(aqf.trace),cycleStatus:ac.status,cycleTarget:"D:rSlot",recordTrace:arec.trace.length};

  const cbase=new DupletArrayCarrier(), cs=cbase.atom("slots"), cz=cbase.atom("zero"), co=cbase.atom("one"), ct=cbase.atom("two");
  const cr=cbase.duplet(cs,cz), cf=cbase.createFrame({E:cr,O:cr,R:cr,S:cr});
  const crun=cloneC(cbase), cfail=cloneC(cbase), ccycle=cloneC(cbase);
  const cq=crun.Q(cf,[{op:"rebindRole",role:"R",target:co},{op:"rebindRole",role:"R",target:co}]);
  const cqf=cfail.Q(cf,[{op:"rebindRole",role:"R",target:co},{op:"rebindRole",role:"R",target:cfail.pairs.length+100},{op:"rebindRole",role:"R",target:ct}]);
  const cyc=ccycle.Q(cf,[{op:"rebindRole",role:"R",target:cr}]);
  const crec=DupletArrayCarrier.deserializeRecord(ccycle.serializeRecord(cyc.trace));
  const cObs={repeat:traceStatuses(cq.trace),changes:traceChanges(cq.trace),failure:traceStatuses(cqf.trace),failureChanges:traceChanges(cqf.trace),cycleStatus:cyc.status,cycleTarget:"D:rSlot",recordTrace:crec.trace.length};
  assert.deepEqual(aObs,bObs);
  assert.deepEqual(cObs,bObs);
});

test("E2-R2 correspondence W7 — shared definition and fresh invocation partitions agree across B/A/C", () => {
  let b=createE1State();
  for(const id of ["slots","definition","callerModel","argA","argB","objA","objB"]) b=bNode(b,id);
  b=bSlot(b,"defSlot",N("slots"),N("definition")); b=bSlot(b,"callerESlot",N("slots"),N("callerModel"));
  b=bSlot(b,"rA",N("slots"),N("argA")); b=bSlot(b,"rB",N("slots"),N("argB")); b=bSlot(b,"oA",N("slots"),N("objA")); b=bSlot(b,"oB",N("slots"),N("objB"));
  b=bMustTransition(bCreateFrame(b,{id:"CallerA",E:"callerESlot",O:"oA",R:"rA",S:"rA"}));
  b=bMustTransition(bCreateFrame(b,{id:"CallerB",E:"callerESlot",O:"oB",R:"rB",S:"rB"}));
  b=bMustTransition(BV(b,{frame:"CallerA",modelSlot:"defSlot",id:"InvokeA",O:"oA"})); b=bMustTransition(BV(b,{frame:"CallerB",modelSlot:"defSlot",id:"InvokeB",O:"oB"}));
  const bObs={sharedE:bFrameRoleSlot(b,"InvokeA","E").id===bFrameRoleSlot(b,"InvokeB","E").id,fresh:b.frames.get("InvokeA").id!==b.frames.get("InvokeB").id,
    rDistinct:bFrameRoleSlot(b,"InvokeA","R").id!==bFrameRoleSlot(b,"InvokeB","R").id,oDistinct:bFrameRoleSlot(b,"InvokeA","O").id!==bFrameRoleSlot(b,"InvokeB","O").id};

  const a=new JsonNearCarrier(), as=a.atom("slots",{}), def=a.atom("definition"), model=a.atom("callerModel"), argA=a.atom("argA"), argB=a.atom("argB"), objA=a.atom("objA"), objB=a.atom("objB");
  const ds=a.duplet("defSlot",as,def), es=a.duplet("callerESlot",as,model), ra=a.duplet("rA",as,argA), rb=a.duplet("rB",as,argB), oa=a.duplet("oA",as,objA), ob=a.duplet("oB",as,objB);
  const ca=a.createFrame("CallerA",{E:es,O:oa,R:ra,S:ra}), cb=a.createFrame("CallerB",{E:es,O:ob,R:rb,S:rb}), ia=a.V(ca,ds,"InvokeA",{O:oa}), ib=a.V(cb,ds,"InvokeB",{O:ob});
  const aObs={sharedE:a.roleSlot(ia,"E")===a.roleSlot(ib,"E"),fresh:ia!==ib,rDistinct:a.roleSlot(ia,"R")!==a.roleSlot(ib,"R"),oDistinct:a.roleSlot(ia,"O")!==a.roleSlot(ib,"O")};

  const c=new DupletArrayCarrier(), cs=c.atom("slots"), cd=c.atom("definition"), cm=c.atom("callerModel"), cra=c.atom("argA"), crb=c.atom("argB"), coa=c.atom("objA"), cob=c.atom("objB");
  const cds=c.duplet(cs,cd), ces=c.duplet(cs,cm), cRA=c.duplet(cs,cra), cRB=c.duplet(cs,crb), cOA=c.duplet(cs,coa), cOB=c.duplet(cs,cob);
  const cca=c.createFrame({E:ces,O:cOA,R:cRA,S:cRA}), ccb=c.createFrame({E:ces,O:cOB,R:cRB,S:cRB}), cia=c.V(cca,cds,{O:cOA}), cib=c.V(ccb,cds,{O:cOB});
  const cObs={sharedE:c.roleSlot(cia,"E")===c.roleSlot(cib,"E"),fresh:cia!==cib,rDistinct:c.roleSlot(cia,"R")!==c.roleSlot(cib,"R"),oDistinct:c.roleSlot(cia,"O")!==c.roleSlot(cib,"O")};
  assert.deepEqual(aObs,bObs);
  assert.deepEqual(cObs,bObs);
});

test("E2-R2 correspondence W8 — ordered bundle occurrence and conditional factorization agree across B/A/C", () => {
  const cases={
    positive:[["p0","0","1"],["p1","1","0"]],
    conflict:[["n0","0","1"],["n1","0","0"]],
    identity:[["i0","0","1"],["i1","0","1"]]
  };
  const bObs={};
  for(const [name,rows] of Object.entries(cases)){
    const entries=rows.map(([id,o,s])=>({id,R:N("not"),O:N(o),S:N(s)}));
    bObs[name]={yes:bFactorBundle(entries,{preserveOccurrenceIdentity:true}).status,no:bFactorBundle(entries,{preserveOccurrenceIdentity:false}).status,order:entries.map(e=>e.id)};
  }

  const a=new JsonNearCarrier(), an=a.atom("not"), a0=a.atom("0"), a1=a.atom("1");
  const aObs={};
  for(const [name,rows] of Object.entries(cases)){
    const entries=rows.map(([id,o,ss])=>({id,R:an,O:o==="0"?a0:a1,S:ss==="0"?a0:a1}));
    aObs[name]={yes:a.factorBundle(entries,{preserveOccurrenceIdentity:true}).status,no:a.factorBundle(entries,{preserveOccurrenceIdentity:false}).status,order:entries.map(e=>e.id)};
  }

  const c=new DupletArrayCarrier(), cn=c.atom("not"), c0=c.atom("0"), c1=c.atom("1");
  const cObs={};
  for(const [name,rows] of Object.entries(cases)){
    const bundle=c.createBundle(rows.map(([,o,ss])=>({R:cn,O:o==="0"?c0:c1,S:ss==="0"?c0:c1})));
    const logical=new Map(bundle.occurrences.map((id,i)=>[id,rows[i][0]]));
    const yes=c.factorBundle(bundle.head,{preserveOccurrenceIdentity:true}), no=c.factorBundle(bundle.head,{preserveOccurrenceIdentity:false});
    cObs[name]={yes:yes.status,no:no.status,order:yes.entries.map(e=>logical.get(e.id))};
  }
  assert.deepEqual(aObs,bObs);
  assert.deepEqual(cObs,bObs);
});

test("E2-R2 P3-02 — ledger states relative derivation and separates bundle graph predicate from external disposition policy", () => {
  const ledger=new Map(E2_LEDGER_C.map(([k,v,why])=>[k,{v,why}]));
  assert.equal(ledger.get("bundle functional predicate").v,"DUPLET-DERIVED");
  assert.equal(ledger.get("bundle identity-fallback disposition").v,"CARRIER-PRIMITIVE");
  assert.match(E2_LEDGER_QUALIFICATION_C.derivedMeans,/relative to declared atom\/bootstrap roots and shape conventions/i);
  assert.match(ledger.get("lossless structural state").why,/validated admitted states/i);
});

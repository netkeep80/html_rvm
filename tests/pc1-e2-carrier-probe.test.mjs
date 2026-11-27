import test from "node:test";
import assert from "node:assert/strict";

import {
  DupletArrayCarrier,
  JsonNearCarrier,
  E2_LEDGER_C,
  E2_DISPOSITION_CANDIDATE
} from "../research/pc1/e2-carrier-probe.mjs";

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

test("E2 C/W1 — ERSO-style cyclic coupling is pair topology and roundtrips exactly", () => {
  const c = new DupletArrayCarrier();
  const zero = c.atom(0);
  const r = c.duplet(zero, zero);
  const s = c.duplet(r, zero);
  c.reattach(r, s);
  assert.deepEqual(c.read(r), {id:r,begin:s,end:zero});
  assert.deepEqual(c.read(s), {id:s,begin:r,end:zero});
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
  assert.deepEqual(qf.trace.map(x=>x.outcome),["OK","REJECT"]);
  assert.equal(cf.roleValue(F,"R"),co);

  const record=cf.serializeRecord(qf.trace);
  const decoded=DupletArrayCarrier.deserializeRecord(record);
  assert.deepEqual(decoded.trace.map(x=>x.outcome),["OK","REJECT"]);
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

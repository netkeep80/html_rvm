import test from "node:test";
import assert from "node:assert/strict";

import {
  Key,
  N,
  P,
  Role,
  executeMO,
  sameEndpoint,
  serializeLosslessMO
} from "../src/mo-core.js";
import {
  H,
  Q,
  V,
  classifyBranchWrites,
  commitBranchWrites,
  createDuplet,
  createE1State,
  createFrame,
  deserializeE1State,
  factorBundle,
  frameDepth,
  frameRE,
  frameRoleSlot,
  frameRoleValue,
  readDuplet,
  reattachDupletBegin,
  rebindDupletEnd,
  resolveContextualSlot,
  serializeE1State
} from "../research/pc1/e1-witness.mjs";

function mustMO(state, action) {
  const result = executeMO(state.mo, action);
  assert.equal(result.outcome.status, "OK", result.outcome.diagnostic ?? action.op);
  return { ...state, mo: result.state };
}

function node(state, id, kind = "entity", payload = null) {
  const action = { op: "createNode", id, kind };
  if (kind !== "object" && kind !== "array") action.payload = payload;
  return mustMO(state, action);
}

function relation(state, id, owner, label, target) {
  return mustMO(state, { op: "createRelation", id, owner, label, target });
}

function slot(state, id, owner, target) {
  return relation(state, id, owner, Role("slot:" + id), target);
}

function mustTransition(result) {
  assert.equal(result.outcome.status, "OK", result.outcome.diagnostic ?? "transition rejected");
  return result.state;
}

function endpointEq(a, b) {
  assert.equal(sameEndpoint(a, b), true, a.sort + ":" + a.id + " != " + b.sort + ":" + b.id);
}

test("PC1-R2-E1 W1 — ERSO uses first-class duplet occurrences and lossless cyclic roundtrip", () => {
  let s = createE1State();
  s = node(s, "anchor");
  s = node(s, "E0", "number", 0);
  s = node(s, "O0", "number", 0);

  s = mustTransition(createDuplet(s, { id: "S0", begin: N("anchor"), end: N("E0") }));
  s = mustTransition(createDuplet(s, { id: "R1", begin: P("S0"), end: N("O0") }));
  s = mustTransition(reattachDupletBegin(s, "S0", P("R1")));

  const S0 = readDuplet(s, "S0");
  const R1 = readDuplet(s, "R1");
  endpointEq(S0.begin, P("R1"));
  endpointEq(S0.end, N("E0"));
  endpointEq(R1.begin, P("S0"));
  endpointEq(R1.end, N("O0"));
  assert.notEqual(S0.id, R1.id);

  const encoded = serializeE1State(s);
  const decoded = deserializeE1State(encoded);
  assert.equal(serializeE1State(decoded), encoded);
});

test("PC1-R2-E1 W2 — ent_abc coupling preserves attachment occurrence across end mutation and explicit reattach", () => {
  let s = createE1State();
  for (const id of ["ent", "a", "relA", "relA2", "b", "relB", "c", "relC"]) s = node(s, id);

  s = mustTransition(createDuplet(s, { id: "rA", begin: N("ent"), end: N("a") }));
  s = mustTransition(createDuplet(s, { id: "sA", begin: P("rA"), end: N("relA") }));
  s = mustTransition(createDuplet(s, { id: "rB", begin: P("sA"), end: N("b") }));
  s = mustTransition(createDuplet(s, { id: "sB", begin: P("rB"), end: N("relB") }));
  s = mustTransition(createDuplet(s, { id: "rC", begin: P("sB"), end: N("c") }));
  s = mustTransition(createDuplet(s, { id: "sC", begin: P("rC"), end: N("relC") }));

  endpointEq(readDuplet(s, "rB").begin, P("sA"));
  endpointEq(readDuplet(s, "rC").begin, P("sB"));

  s = mustTransition(rebindDupletEnd(s, "sA", N("relA2")));
  endpointEq(readDuplet(s, "rB").begin, P("sA"));

  const rBId = readDuplet(s, "rB").id;
  s = mustTransition(reattachDupletBegin(s, "rB", P("rA")));
  assert.equal(readDuplet(s, "rB").id, rBId);
  endpointEq(readDuplet(s, "rB").begin, P("rA"));

  s = mustTransition(createDuplet(s, { id: "rC2", begin: P("sB"), end: N("c") }));
  const rC = readDuplet(s, "rC");
  const rC2 = readDuplet(s, "rC2");
  endpointEq(rC.begin, rC2.begin);
  endpointEq(rC.end, rC2.end);
  assert.notEqual(rC.id, rC2.id);
});

test("PC1-R2-E1 W3 — semantic role distinction permits both separated and aliased physical carriers", () => {
  let s = createE1State();
  s = node(s, "slots");
  s = node(s, "projection", "object");
  s = node(s, "model", "object");
  s = node(s, "modelRelValue");
  s = slot(s, "projectionSlot", N("slots"), N("projection"));
  s = slot(s, "modelSlot", N("slots"), N("model"));
  s = relation(s, "modelRel", N("model"), Key("$rel"), N("modelRelValue"));

  s = mustTransition(createFrame(s, {
    id: "C-separated", E: "modelSlot", O: "projectionSlot", R: "projectionSlot", S: "projectionSlot"
  }));
  const entRel = resolveContextualSlot(s, "C-separated", "$ent/$rel");
  assert.equal(entRel.id, "modelRel");
  assert.notEqual(frameRoleSlot(s, "C-separated", "R").id, entRel.id);

  s = mustTransition(createFrame(s, {
    id: "C-alias", E: "modelSlot", O: "modelRel", R: "modelRel", S: "modelRel"
  }));
  const aliasedEntRel = resolveContextualSlot(s, "C-alias", "$ent/$rel");
  assert.equal(frameRoleSlot(s, "C-alias", "R").id, aliasedEntRel.id);
  assert.notEqual(frameRoleSlot(s, "C-alias", "E").id, frameRoleSlot(s, "C-alias", "R").id);

  const encoded = serializeE1State(s);
  const decoded = deserializeE1State(encoded);
  assert.equal(frameRoleSlot(decoded, "C-alias", "R").id, resolveContextualSlot(decoded, "C-alias", "$ent/$rel").id);
  assert.equal(serializeE1State(decoded), encoded);
});

test("PC1-R2-E1 W4 — H→V and V→H can share (R,E) values while enriched frames remain distinct", () => {
  let s = createE1State();
  for (const id of ["slots", "A"]) s = node(s, id);
  for (const id of ["root", "oldModel", "M1"]) s = node(s, id, "object");
  s = slot(s, "rootSlot", N("slots"), N("root"));
  s = slot(s, "oldModelSlot", N("slots"), N("oldModel"));
  s = slot(s, "modelSlot", N("slots"), N("M1"));
  s = relation(s, "aSlot", N("root"), Key("a"), N("A"));
  s = mustTransition(createFrame(s, { id: "C0", E: "oldModelSlot", O: "rootSlot", R: "rootSlot", S: "rootSlot" }));

  s = mustTransition(H(s, { frame: "C0", path: "$rel/a", id: "CH" }));
  s = mustTransition(V(s, { frame: "CH", modelSlot: "modelSlot", id: "CHV" }));
  s = mustTransition(V(s, { frame: "C0", modelSlot: "modelSlot", id: "CV" }));
  s = mustTransition(H(s, { frame: "CV", path: "$rel/a", id: "CVH" }));

  endpointEq(frameRE(s, "CHV").R, frameRE(s, "CVH").R);
  endpointEq(frameRE(s, "CHV").E, frameRE(s, "CVH").E);
  assert.equal(frameDepth(s, "CHV"), frameDepth(s, "CVH"));
  assert.notEqual(s.frames.get("CHV").parent, s.frames.get("CVH").parent);
  assert.equal(frameRoleSlot(s, "CHV", "O").id, "aSlot");
  assert.equal(frameRoleSlot(s, "CVH", "O").id, "rootSlot");
  assert.notEqual(frameRoleSlot(s, "CHV", "O").id, frameRoleSlot(s, "CVH", "O").id);
});

test("PC1-R2-E1 W5 — H-family disjoint writes commute, aliased contextual paths are rejected without a race winner", () => {
  let s = createE1State();
  for (const id of ["slots", "one", "two", "zero"]) s = node(s, id);
  s = node(s, "root", "object");
  s = slot(s, "rootSlot", N("slots"), N("root"));
  s = relation(s, "aSlot", N("root"), Key("a"), N("zero"));
  s = relation(s, "bSlot", N("root"), Key("b"), N("zero"));
  s = relation(s, "xSlot", N("root"), Key("x"), N("zero"));
  s = mustTransition(createFrame(s, { id: "C0", E: "rootSlot", O: "rootSlot", R: "rootSlot", S: "rootSlot" }));
  s = mustTransition(H(s, { frame: "C0", path: "$rel/a", id: "HA" }));
  s = mustTransition(H(s, { frame: "C0", path: "$rel/b", id: "HB" }));

  const disjoint = [
    { frame: "HA", target: N("one") },
    { frame: "HB", target: N("two") }
  ];
  assert.equal(classifyBranchWrites(s, disjoint).status, "DISJOINT_OR_COINCIDENT");
  const ab = commitBranchWrites(s, disjoint);
  const ba = commitBranchWrites(s, [...disjoint].reverse());
  assert.equal(ab.outcome.status, "OK");
  assert.equal(ba.outcome.status, "OK");
  assert.equal(serializeLosslessMO(ab.state.mo), serializeLosslessMO(ba.state.mo));

  s = mustTransition(H(s, { frame: "C0", path: "$rel/x", id: "HRX" }));
  s = mustTransition(H(s, { frame: "C0", path: "$obj/x", id: "HOX" }));
  assert.equal(frameRoleSlot(s, "HRX", "R").id, frameRoleSlot(s, "HOX", "R").id);
  const before = serializeE1State(s);
  const conflict = commitBranchWrites(s, [
    { frame: "HRX", target: N("one") },
    { frame: "HOX", target: N("two") }
  ]);
  assert.equal(conflict.outcome.status, "REJECT");
  assert.equal(conflict.outcome.diagnostic, "ALIAS_CONFLICT");
  assert.equal(serializeE1State(conflict.state), before);
});

test("PC1-R2-E1 W6 — Q is ordered sequential reuse of one frame and preserves multiplicity", () => {
  let s = createE1State();
  for (const id of ["slots", "zero", "one", "two"]) s = node(s, id);
  s = slot(s, "rSlot", N("slots"), N("zero"));
  s = slot(s, "eSlot", N("slots"), N("zero"));
  s = mustTransition(createFrame(s, { id: "C", E: "eSlot", O: "rSlot", R: "rSlot", S: "rSlot" }));

  const q12 = Q(s, { frame: "C", steps: [
    { op: "rebindRole", role: "R", target: N("one") },
    { op: "rebindRole", role: "R", target: N("two") }
  ] });
  assert.equal(q12.outcome.status, "OK");
  endpointEq(frameRoleValue(q12.state, "C", "R"), N("two"));
  assert.equal(q12.trace.length, 2);
  endpointEq(q12.trace[0].target, N("one"));
  endpointEq(q12.trace[1].target, N("two"));

  const q21 = Q(s, { frame: "C", steps: [
    { op: "rebindRole", role: "R", target: N("two") },
    { op: "rebindRole", role: "R", target: N("one") }
  ] });
  endpointEq(frameRoleValue(q21.state, "C", "R"), N("one"));
  assert.notEqual(serializeLosslessMO(q12.state.mo), serializeLosslessMO(q21.state.mo));

  const repeated = Q(s, { frame: "C", steps: [
    { op: "rebindRole", role: "R", target: N("one") },
    { op: "rebindRole", role: "R", target: N("one") }
  ] });
  assert.equal(repeated.trace.length, 2);
  assert.equal(repeated.trace[1].outcome.semanticChange, false);
});

test("PC1-R2-E1 W7 — one shared definition yields distinct invocation frame occurrences with distinct R/O", () => {
  let s = createE1State();
  for (const id of ["slots", "definition", "callerModel", "argA", "argB", "objA", "objB"]) s = node(s, id);
  s = slot(s, "defSlot", N("slots"), N("definition"));
  s = slot(s, "callerESlot", N("slots"), N("callerModel"));
  s = slot(s, "rA", N("slots"), N("argA"));
  s = slot(s, "rB", N("slots"), N("argB"));
  s = slot(s, "oA", N("slots"), N("objA"));
  s = slot(s, "oB", N("slots"), N("objB"));
  s = mustTransition(createFrame(s, { id: "CallerA", E: "callerESlot", O: "oA", R: "rA", S: "rA" }));
  s = mustTransition(createFrame(s, { id: "CallerB", E: "callerESlot", O: "oB", R: "rB", S: "rB" }));

  s = mustTransition(V(s, { frame: "CallerA", modelSlot: "defSlot", id: "InvokeA", O: "oA" }));
  s = mustTransition(V(s, { frame: "CallerB", modelSlot: "defSlot", id: "InvokeB", O: "oB" }));

  assert.equal(frameRoleSlot(s, "InvokeA", "E").id, "defSlot");
  assert.equal(frameRoleSlot(s, "InvokeB", "E").id, "defSlot");
  assert.notEqual(s.frames.get("InvokeA").id, s.frames.get("InvokeB").id);
  assert.notEqual(frameRoleSlot(s, "InvokeA", "R").id, frameRoleSlot(s, "InvokeB", "R").id);
  assert.notEqual(frameRoleSlot(s, "InvokeA", "O").id, frameRoleSlot(s, "InvokeB", "O").id);
});

test("PC1-R2-E1 W8 — bundle factorization distinguishes functional, non-functional and identity-fallback cases", () => {
  const positive = factorBundle([
    { id: "p0", R: N("not"), O: N("0"), S: N("1") },
    { id: "p1", R: N("not"), O: N("1"), S: N("0") }
  ]);
  assert.equal(positive.status, "FACTORIZED");
  assert.equal(positive.table.length, 2);

  const conflict = factorBundle([
    { id: "n0", R: N("not"), O: N("0"), S: N("1") },
    { id: "n1", R: N("not"), O: N("0"), S: N("0") }
  ]);
  assert.equal(conflict.status, "NON_FUNCTIONAL");

  const identity = factorBundle([
    { id: "i0", R: N("not"), O: N("0"), S: N("1") },
    { id: "i1", R: N("not"), O: N("0"), S: N("1") }
  ]);
  assert.equal(identity.status, "FALLBACK_IDENTITY");
});

test("PC1-R2-E1 invariants — explicit roots only and rejected frame/address operations are atomic", () => {
  let s = createE1State();
  for (const id of ["slots", "value"]) s = node(s, id);
  s = node(s, "root", "object");
  s = slot(s, "rootSlot", N("slots"), N("root"));
  s = mustTransition(createFrame(s, { id: "C", E: "rootSlot", O: "rootSlot", R: "rootSlot", S: "rootSlot" }));
  const before = serializeE1State(s);

  assert.throws(() => resolveContextualSlot(s, "C", "x"), error => error?.diagnostic === "EXPLICIT_CONTEXT_ROOT_REQUIRED");
  const missing = H(s, { frame: "C", path: "$rel/missing", id: "Hbad" });
  assert.equal(missing.outcome.status, "REJECT");
  assert.equal(missing.outcome.diagnostic, "MISSING_CONTEXT_PATH");
  assert.equal(serializeE1State(missing.state), before);
  assert.equal(s.usedFrames.has("Hbad"), false);

  const duplicate = V(s, { frame: "C", modelSlot: "rootSlot", id: "C" });
  assert.equal(duplicate.outcome.status, "REJECT");
  assert.equal(duplicate.outcome.diagnostic, "FRAME_NO_RESURRECTION");
  assert.equal(serializeE1State(duplicate.state), before);
});

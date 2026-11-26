import test from "node:test";
import assert from "node:assert/strict";
import {
  N, P, Key, Index, Role,
  createMOState, validateMOState, executeMO, executeMOAtomically,
  serializeLosslessMO, deserializeLosslessMO,
  projectPlainJSON, embedPlainJSON, applyJSONOperation,
  SequentialMOAllocator, requireCanonicalJSONTree
} from "../src/mo-reference.js";

function ok(transition) {
  assert.equal(transition.outcome.status, "OK", transition.outcome.diagnostic ?? "expected OK");
  return transition.state;
}

function action(state, value) {
  return ok(executeMO(state, value));
}

test("first-class relations can address relations and encode assertion occurrences", () => {
  let s = createMOState();
  s = action(s, { op: "createNode", id: "subject", kind: "entity", payload: { type: "subject" } });
  s = action(s, { op: "createNode", id: "value", kind: "string", payload: "blue" });
  s = action(s, { op: "createRelation", id: "p", owner: N("subject"), label: Role("property"), target: N("value") });
  s = action(s, { op: "createRelation", id: "q", owner: P("p"), label: Role("ctx:label"), target: N("value") });
  s = action(s, { op: "createRelation", id: "ref", owner: N("subject"), label: Role("ref"), target: P("q") });
  assert.deepEqual(s.relations.get("q").owner, P("p"));
  assert.deepEqual(s.relations.get("ref").target, P("q"));
  assert.equal(serializeLosslessMO(deserializeLosslessMO(serializeLosslessMO(s))), serializeLosslessMO(s));
});

test("finite relation cycles and sharing are valid semantic state", () => {
  let s = createMOState();
  s = action(s, { op: "createNode", id: "anchor", kind: "entity", payload: null });
  s = action(s, { op: "createRelation", id: "a", owner: N("anchor"), label: Role("a") });
  s = action(s, { op: "createRelation", id: "b", owner: N("anchor"), label: Role("b") });
  s = action(s, { op: "rebindRelation", id: "a", target: P("b") });
  s = action(s, { op: "rebindRelation", id: "b", target: P("a") });
  s = action(s, { op: "createRelation", id: "share", owner: N("anchor"), label: Role("share"), target: P("a") });
  assert.deepEqual(s.relations.get("a").target, P("b"));
  assert.deepEqual(s.relations.get("b").target, P("a"));
  assert.deepEqual(s.relations.get("share").target, P("a"));
});

test("no-resurrection makes insert-delete live cancellation but not full-state inverse", () => {
  let s0 = createMOState();
  s0 = action(s0, { op: "createNode", id: "n", kind: "entity", payload: null });
  const before = serializeLosslessMO(s0);
  let s1 = action(s0, { op: "createRelation", id: "p", owner: N("n"), label: Role("temp") });
  s1 = action(s1, { op: "deleteRelation", id: "p" });
  assert.equal(s1.relations.size, s0.relations.size);
  assert.equal(s1.used.P.has("p"), true);
  assert.notEqual(serializeLosslessMO(s1), before);
  const resurrect = executeMO(s1, { op: "createRelation", id: "p", owner: N("n"), label: Role("temp") });
  assert.equal(resurrect.outcome.status, "REJECT");
  assert.equal(resurrect.outcome.diagnostic, "NO_RESURRECTION");
  assert.equal(serializeLosslessMO(resurrect.state), serializeLosslessMO(s1));
});

test("atomic reject leaves semantic state and persistence unchanged", () => {
  let s = createMOState();
  s = action(s, { op: "createNode", id: "n", kind: "entity", payload: null });
  s = action(s, { op: "createRelation", id: "p", owner: N("n"), label: Role("r") });
  const before = serializeLosslessMO(s);
  const t = executeMO(s, { op: "rebindRelation", id: "p", target: N("missing") });
  assert.equal(t.outcome.status, "REJECT");
  assert.equal(t.outcome.diagnostic, "MISSING_TARGET");
  assert.equal(serializeLosslessMO(t.state), before);
  assert.deepEqual(t.persistence.P, [["p", "p"]]);
  assert.deepEqual(t.born, { N: [], P: [] });
  assert.deepEqual(t.dead, { N: [], P: [] });
});

test("same-value ordinary assignment is a semantic no-op while reassert changes occurrence identity", () => {
  let s = createMOState();
  s = action(s, { op: "createNode", id: "n", kind: "string", payload: "x" });
  let t = executeMO(s, { op: "setNode", id: "n", kind: "string", payload: "x" });
  assert.equal(t.outcome.status, "OK");
  assert.equal(t.outcome.semanticChange, false);

  s = action(s, { op: "createNode", id: "owner", kind: "entity", payload: null });
  s = action(s, { op: "createRelation", id: "q1", owner: N("owner"), label: Role("assert"), target: N("n") });
  t = executeMO(s, { op: "reassert", id: "q1", freshId: "q2" });
  assert.equal(t.outcome.status, "OK");
  assert.equal(t.state.relations.has("q1"), false);
  assert.equal(t.state.relations.has("q2"), true);
  assert.deepEqual(t.born.P, ["q2"]);
  assert.deepEqual(t.dead.P, ["q1"]);
});

test("reassert rejects atomically when another relation refers to the assertion occurrence", () => {
  let s = createMOState();
  s = action(s, { op: "createNode", id: "n", kind: "entity", payload: null });
  s = action(s, { op: "createRelation", id: "q", owner: N("n"), label: Role("assert") });
  s = action(s, { op: "createRelation", id: "r", owner: N("n"), label: Role("ref"), target: P("q") });
  const before = serializeLosslessMO(s);
  const t = executeMO(s, { op: "reassert", id: "q", freshId: "q2" });
  assert.equal(t.outcome.status, "REJECT");
  assert.equal(t.outcome.diagnostic, "RELATION_REFERENCED");
  assert.equal(serializeLosslessMO(t.state), before);
});

test("plain JSON projection unfolds sharing and therefore loses alias identity", () => {
  let shared = createMOState();
  shared = action(shared, { op: "createNode", id: "root", kind: "object" });
  shared = action(shared, { op: "createNode", id: "zero", kind: "number", payload: 0 });
  shared = action(shared, { op: "createRelation", id: "a", owner: N("root"), label: Key("a"), target: N("zero") });
  shared = action(shared, { op: "createRelation", id: "b", owner: N("root"), label: Key("b"), target: N("zero") });
  shared = action(shared, { op: "setRoots", roots: [N("root")] });
  assert.deepEqual(projectPlainJSON(shared), { a: 0, b: 0 });

  const duplicated = embedPlainJSON({ a: 0, b: 0 }, { allocator: new SequentialMOAllocator({ nodePrefix: "D$N", relationPrefix: "D$P" }) }).state;
  assert.deepEqual(projectPlainJSON(duplicated), { a: 0, b: 0 });
  assert.notEqual(serializeLosslessMO(shared), serializeLosslessMO(duplicated));
});

test("plain JSON projection rejects cycles but lossless serialization preserves them", () => {
  let s = createMOState();
  s = action(s, { op: "createNode", id: "root", kind: "object" });
  s = action(s, { op: "createRelation", id: "self", owner: N("root"), label: Key("self"), target: N("root") });
  s = action(s, { op: "setRoots", roots: [N("root")] });
  assert.throws(() => projectPlainJSON(s), error => error?.diagnostic === "JSON_CYCLE");
  const roundtrip = deserializeLosslessMO(serializeLosslessMO(s));
  assert.equal(serializeLosslessMO(roundtrip), serializeLosslessMO(s));
});

test("lossless serialization preserves unbound relations, dead used IDs and relation endpoints", () => {
  let s = createMOState();
  s = action(s, { op: "createNode", id: "n", kind: "entity", payload: { x: 1 } });
  s = action(s, { op: "createRelation", id: "p", owner: N("n"), label: Role("slot") });
  s = action(s, { op: "createRelation", id: "meta", owner: P("p"), label: Role("meta"), target: P("p") });
  s = action(s, { op: "createRelation", id: "dead", owner: N("n"), label: Role("dead") });
  s = action(s, { op: "deleteRelation", id: "dead" });
  const encoded = serializeLosslessMO(s);
  const decoded = deserializeLosslessMO(encoded);
  assert.equal(serializeLosslessMO(decoded), encoded);
  assert.equal(decoded.used.P.has("dead"), true);
  assert.equal(decoded.relations.get("p").bound, false);
  assert.deepEqual(decoded.relations.get("meta").owner, P("p"));
});

test("JSON replace executes through MO, same-value replace is no-op, and used identity records replacement history", () => {
  const allocator = new SequentialMOAllocator({ nodePrefix: "J$N", relationPrefix: "J$P" });
  let { state } = embedPlainJSON({ a: { x: 1 }, b: 2 }, { allocator });
  requireCanonicalJSONTree(state);
  const before = serializeLosslessMO(state);
  let t = applyJSONOperation(state, { op: "replace", path: ["a", "x"], value: 1 }, { allocator });
  assert.equal(t.outcome.status, "OK");
  assert.equal(t.outcome.semanticChange, false);
  assert.equal(serializeLosslessMO(t.state), before);

  t = applyJSONOperation(state, { op: "replace", path: ["a", "x"], value: 3 }, { allocator });
  assert.equal(t.outcome.status, "OK");
  state = t.state;
  assert.deepEqual(projectPlainJSON(state), { a: { x: 3 }, b: 2 });
  requireCanonicalJSONTree(state);
  assert.ok(t.dead.N.length > 0);
  assert.ok(t.born.N.length > 0);
});

test("JSON add/remove on objects and dense arrays are translated to atomic MO sequences", () => {
  const allocator = new SequentialMOAllocator({ nodePrefix: "A$N", relationPrefix: "A$P" });
  let { state } = embedPlainJSON({ obj: {}, arr: [1, 2] }, { allocator });
  let t = applyJSONOperation(state, { op: "add", path: ["obj", "k"], value: true }, { allocator });
  assert.equal(t.outcome.status, "OK");
  state = t.state;
  assert.deepEqual(projectPlainJSON(state), { arr: [1, 2], obj: { k: true } });

  t = applyJSONOperation(state, { op: "add", path: ["arr", 1], value: 9 }, { allocator });
  assert.equal(t.outcome.status, "OK");
  state = t.state;
  assert.deepEqual(projectPlainJSON(state), { arr: [1, 9, 2], obj: { k: true } });

  t = applyJSONOperation(state, { op: "remove", path: ["arr", 0] }, { allocator });
  assert.equal(t.outcome.status, "OK");
  state = t.state;
  assert.deepEqual(projectPlainJSON(state), { arr: [9, 2], obj: { k: true } });
  requireCanonicalJSONTree(state);
});

test("JSON editing refuses shared DAGs instead of silently mutating aliases", () => {
  let s = createMOState();
  s = action(s, { op: "createNode", id: "root", kind: "object" });
  s = action(s, { op: "createNode", id: "shared", kind: "object" });
  s = action(s, { op: "createNode", id: "x", kind: "number", payload: 1 });
  s = action(s, { op: "createRelation", id: "xrel", owner: N("shared"), label: Key("x"), target: N("x") });
  s = action(s, { op: "createRelation", id: "a", owner: N("root"), label: Key("a"), target: N("shared") });
  s = action(s, { op: "createRelation", id: "b", owner: N("root"), label: Key("b"), target: N("shared") });
  s = action(s, { op: "setRoots", roots: [N("root")] });
  assert.deepEqual(projectPlainJSON(s), { a: { x: 1 }, b: { x: 1 } });
  assert.throws(() => applyJSONOperation(s, { op: "replace", path: ["a", "x"], value: 2 }), error => error?.diagnostic === "JSON_NOT_CANONICAL_TREE");
});

test("atomic composite rollback is not inverse execution and restores used sets on failure", () => {
  let s = createMOState();
  s = action(s, { op: "createNode", id: "n", kind: "entity", payload: null });
  const before = serializeLosslessMO(s);
  const t = executeMOAtomically(s, [
    { op: "createRelation", id: "p", owner: N("n"), label: Role("x") },
    { op: "rebindRelation", id: "p", target: N("missing") }
  ]);
  assert.equal(t.outcome.status, "REJECT");
  assert.equal(serializeLosslessMO(t.state), before);
  assert.equal(t.state.used.P.has("p"), false);
  assert.deepEqual(t.trace, []);
  assert.equal(Object.hasOwn(t, "history"), false);
});


test("audit MO-R0-01: legal __proto__ JSON keys survive embedding, projection and entity payload cloning", () => {
  const value = JSON.parse('{"__proto__":1,"nested":{"__proto__":{"x":2}},"a":3}');
  const { state } = embedPlainJSON(value);
  const projected = projectPlainJSON(state);
  assert.equal(Object.hasOwn(projected, "__proto__"), true);
  assert.equal(projected.__proto__, 1);
  assert.equal(Object.hasOwn(projected.nested, "__proto__"), true);
  assert.deepEqual(projected.nested.__proto__, { x: 2 });
  assert.deepEqual(projected, value);

  let entityState = createMOState();
  entityState = action(entityState, { op: "createNode", id: "e", kind: "entity", payload: value });
  const payload = entityState.nodes.get("e").payload;
  assert.equal(Object.hasOwn(payload, "__proto__"), true);
  assert.equal(payload.__proto__, 1);
  assert.deepEqual(payload, value);
});

test("audit MO-R0-02: R0 canonicalizes negative zero to JSON number zero consistently", () => {
  let s = createMOState();
  let t = executeMO(s, { op: "createNode", id: "z", kind: "number", payload: -0 });
  assert.equal(t.outcome.status, "OK");
  s = t.state;
  assert.equal(Object.is(s.nodes.get("z").payload, -0), false);
  assert.equal(s.nodes.get("z").payload, 0);

  t = executeMO(s, { op: "setNode", id: "z", kind: "number", payload: 0 });
  assert.equal(t.outcome.status, "OK");
  assert.equal(t.outcome.semanticChange, false);

  const encoded = serializeLosslessMO(s);
  const decoded = deserializeLosslessMO(encoded);
  assert.equal(serializeLosslessMO(decoded), encoded);
  assert.equal(Object.is(decoded.nodes.get("z").payload, -0), false);

  const embedded = embedPlainJSON(-0).state;
  const projected = projectPlainJSON(embedded);
  assert.equal(projected, 0);
  assert.equal(Object.is(projected, -0), false);
});

test("audit MO-R0-03: one-step atomic execution is closed for explicit undefined unbind", () => {
  let s = createMOState();
  s = action(s, { op: "createNode", id: "owner", kind: "entity", payload: null });
  s = action(s, { op: "createNode", id: "target", kind: "entity", payload: null });
  s = action(s, { op: "createRelation", id: "p", owner: N("owner"), label: Role("r"), target: N("target") });

  const a = { op: "rebindRelation", id: "p", target: undefined };
  const direct = executeMO(s, a);
  const atomic = executeMOAtomically(s, [a]);
  assert.equal(direct.outcome.status, "OK");
  assert.equal(atomic.outcome.status, "OK");
  assert.equal(serializeLosslessMO(atomic.state), serializeLosslessMO(direct.state));
  assert.equal(atomic.trace.length, 1);
  assert.deepEqual(atomic.trace[0].action, { id: "p", op: "rebindRelation" });

  const rejected = { op: "rebindRelation", id: "missing", target: undefined };
  const directReject = executeMO(s, rejected);
  const atomicReject = executeMOAtomically(s, [rejected]);
  assert.equal(directReject.outcome.status, "REJECT");
  assert.equal(atomicReject.outcome.status, "REJECT");
  assert.equal(atomicReject.outcome.diagnostic, directReject.outcome.diagnostic);
  assert.equal(serializeLosslessMO(atomicReject.state), serializeLosslessMO(s));
  assert.deepEqual(atomicReject.trace, []);
});

test("audit MO-R0-04: valid state and lossless decoder share one exact identifier/boolean image", () => {
  const invalid = createMOState();
  invalid.used.N.add(42);
  assert.throws(() => validateMOState(invalid), error => error?.diagnostic === "INVALID_ID");
  assert.throws(() => serializeLosslessMO(invalid), error => error?.diagnostic === "INVALID_ID");

  const encoded = {
    $mo: "np-state/1",
    nodes: [{ id: "n", kind: "entity", payload: null }],
    relations: [{ id: "p", owner: ["N", "n"], label: { kind: "role", value: "r" }, bound: "false", target: null }],
    roots: [],
    used: { N: ["n"], P: ["p"] }
  };
  assert.throws(() => deserializeLosslessMO(encoded), error => error?.diagnostic === "INVALID_SERIALIZATION");

  const duplicateUsed = {
    $mo: "np-state/1",
    nodes: [],
    relations: [],
    roots: [],
    used: { N: ["n", "n"], P: [] }
  };
  assert.throws(() => deserializeLosslessMO(duplicateUsed), error => error?.diagnostic === "INVALID_SERIALIZATION");
});

import test from "node:test";
import assert from "node:assert/strict";

import { N, Role, executeMO } from "../src/mo-core.js";
import { Q, createE1State, createFrame, frameRoleSlot } from "../research/pc1/e1-witness.mjs";
import { deserializeE1Record, serializeE1Record } from "../research/pc1/e1-record.mjs";

function mustMO(state, action) {
  const result = executeMO(state.mo, action);
  assert.equal(result.outcome.status, "OK", result.outcome.diagnostic ?? action.op);
  return { ...state, mo: result.state };
}

function node(state, id) {
  return mustMO(state, { op: "createNode", id, kind: "entity", payload: null });
}

function slot(state, id, owner, target) {
  return mustMO(state, { op: "createRelation", id, owner, label: Role("slot:" + id), target });
}

test("PC1-R2-E1 invariant 10 — lossless evidence record preserves alias identity and Q order/multiplicity", () => {
  let s = createE1State();
  for (const id of ["slots", "zero", "one", "two"]) s = node(s, id);
  s = slot(s, "rSlot", N("slots"), N("zero"));
  s = slot(s, "eSlot", N("slots"), N("zero"));
  const created = createFrame(s, { id: "C", E: "eSlot", O: "rSlot", R: "rSlot", S: "rSlot" });
  assert.equal(created.outcome.status, "OK");
  s = created.state;

  const q = Q(s, { frame: "C", steps: [
    { op: "rebindRole", role: "R", target: N("one") },
    { op: "rebindRole", role: "R", target: N("two") },
    { op: "rebindRole", role: "R", target: N("one") }
  ] });
  assert.equal(q.outcome.status, "OK");
  assert.equal(q.trace.length, 3);

  const encoded = serializeE1Record(q.state, q.trace);
  const decoded = deserializeE1Record(encoded);
  assert.equal(serializeE1Record(decoded.state, decoded.trace), encoded);
  assert.deepEqual(decoded.trace.map(step => step.target.id), ["one", "two", "one"]);
  assert.equal(frameRoleSlot(decoded.state, "C", "O").id, frameRoleSlot(decoded.state, "C", "R").id);
  assert.equal(frameRoleSlot(decoded.state, "C", "S").id, frameRoleSlot(decoded.state, "C", "R").id);
});

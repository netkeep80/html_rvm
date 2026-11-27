import test from "node:test";
import assert from "node:assert/strict";

import { projectPlainJSON } from "../src/mo-json.js";
import {
  frameRoleSlot,
  resolveContextualSlot,
  serializeE1State
} from "../research/pc1/e1-witness.mjs";
import {
  executeNaturalJSON,
  inspectNaturalEntity,
  instantiateNaturalEntity,
  objectivateNaturalJSON,
  reflectiveReplaceRole,
  subjectivateNaturalJSON
} from "../research/pc1/j1-natural-json.mjs";

const ENV = Object.freeze({
  version: "01.77",
  meta: { engine: "html_rvm", slice: "J1" }
});

// Exact textual fixtures from netkeep80/jsonRVM@9d5f2000.../modules/console/test.
const HISTORICAL_VERSION_SOURCE = `{
  "$rel/rmvm_version" : "rmvm/version",
  "$rel/meta" : "json/meta"
}
`;

const HISTORICAL_WHERE_SOURCE = `{
   "$obj" : [ null, 2, false, "4", {} ],
   "$rel" : "where",
   "$sub" : {
      "$obj" : {"$ref":"$obj"},
      "$rel" : "is_string"
   }
}
`;

const HISTORICAL_VERSION = JSON.parse(HISTORICAL_VERSION_SOURCE);
const HISTORICAL_WHERE = JSON.parse(HISTORICAL_WHERE_SOURCE);

function slotValue(program, slot) {
  const relation = program.state.mo.relations.get(slot.id);
  assert.ok(relation?.bound);
  return projectPlainJSON(program.state.mo, relation.target);
}

test("J1-W1 ordinary field stays on model E while source $ent/$rel and runtime R are distinct", () => {
  const source = { a: 1, $rel: "rmvm/version" };
  const program = subjectivateNaturalJSON(source);
  const info = inspectNaturalEntity(program);
  assert.equal(info.mask, 0b010);
  assert.deepEqual(info.ordinaryKeys, ["a"]);
  assert.equal(info.controller, "rmvm/version");

  const inst = instantiateNaturalEntity(program);
  const aSlot = resolveContextualSlot(inst.program.state, inst.frame, "$ent/a");
  const sourceRelSlot = resolveContextualSlot(inst.program.state, inst.frame, "$ent/$rel");
  const runtimeR = frameRoleSlot(inst.program.state, inst.frame, "R");
  const runtimeO = frameRoleSlot(inst.program.state, inst.frame, "O");
  const runtimeS = frameRoleSlot(inst.program.state, inst.frame, "S");

  assert.equal(slotValue(inst.program, aSlot), 1);
  assert.equal(sourceRelSlot.id, info.sourceSlots.R.id);
  assert.notEqual(sourceRelSlot.id, runtimeR.id);
  assert.equal(runtimeO.id, runtimeR.id);
  assert.equal(runtimeS.id, runtimeR.id);

  const executed = executeNaturalJSON(program, ENV);
  assert.equal(executed.diagnostic, null);
  assert.equal(executed.result, ENV.version);
  assert.deepEqual(objectivateNaturalJSON(executed.program), source);
});

test("J1-W2 all eight ORS masks have the frozen runtime alias law and retain ordinary fields", () => {
  for (let mask = 0; mask < 8; mask += 1) {
    const source = { a: 1 };
    if (mask & 0b100) source.$obj = "O";
    if (mask & 0b010) source.$rel = "R";
    if (mask & 0b001) source.$sub = "S";

    const program = subjectivateNaturalJSON(source);
    const info = inspectNaturalEntity(program);
    assert.equal(info.mask, mask, `mask ${mask.toString(2).padStart(3, "0")}`);
    assert.deepEqual(info.ordinaryKeys, ["a"]);

    const inst = instantiateNaturalEntity(program);
    const O = frameRoleSlot(inst.program.state, inst.frame, "O");
    const R = frameRoleSlot(inst.program.state, inst.frame, "R");
    const S = frameRoleSlot(inst.program.state, inst.frame, "S");

    assert.equal(R.id, inst.contextSlot.id);
    assert.equal(O.id, (mask & 0b100) ? info.sourceSlots.O.id : inst.contextSlot.id);
    assert.equal(S.id, (mask & 0b001) ? info.sourceSlots.S.id : inst.contextSlot.id);

    if (mask & 0b010) {
      assert.equal(info.controller, "R");
      assert.notEqual(info.sourceSlots.R.id, R.id);
    } else {
      assert.equal(info.controller, null);
      assert.equal(info.sourceSlots.R, null);
    }

    const aSlot = resolveContextualSlot(inst.program.state, inst.frame, "$ent/a");
    assert.equal(slotValue(inst.program, aSlot), 1);
    assert.deepEqual(objectivateNaturalJSON(inst.program), source);
  }
});

test("J1-W3 exact historical version.json executes through runtime slots", () => {
  const program = subjectivateNaturalJSON(HISTORICAL_VERSION);
  const executed = executeNaturalJSON(program, ENV);

  assert.equal(executed.diagnostic, null);
  assert.equal(executed.mode, "LAMBDA");
  assert.deepEqual(executed.result, {
    meta: ENV.meta,
    rmvm_version: ENV.version
  });
  assert.deepEqual(
    executed.events.map(event => event.controller).sort(),
    ["json/meta", "rmvm/version"]
  );
  assert.equal(executed.events.length, 2);
  for (const event of executed.events) {
    assert.equal(event.runtimeRSlot, event.frame ? frameRoleSlot(executed.program.state, event.frame, "R").id : null);
  }
  assert.deepEqual(objectivateNaturalJSON(executed.program), HISTORICAL_VERSION);
});

test("J1-W4 exact historical where_test.json executes predicate once per item in order", () => {
  const program = subjectivateNaturalJSON(HISTORICAL_WHERE);
  const executed = executeNaturalJSON(program, ENV);

  assert.equal(executed.diagnostic, null);
  assert.equal(executed.mode, "CALL");
  assert.deepEqual(executed.result, ["4"]);

  const predicate = executed.events.filter(event => event.controller === "is_string");
  assert.equal(predicate.length, 5);
  assert.deepEqual(predicate.map(event => event.iteration), [0, 1, 2, 3, 4]);
  assert.deepEqual(predicate.map(event => event.result), [false, false, false, true, false]);

  const where = executed.events.filter(event => event.controller === "where");
  assert.equal(where.length, 1);
  assert.deepEqual(where[0].result, ["4"]);
  assert.deepEqual(objectivateNaturalJSON(executed.program), HISTORICAL_WHERE);
});

test("J1-W5 reflective edit rebinds the actual source $rel slot and re-executes the same model", () => {
  const source = {
    $obj: [null, 2, false, "4", {}],
    $rel: "where",
    $sub: {
      note: "keep",
      $obj: { $ref: "$obj" },
      $rel: "is_string"
    }
  };
  const initial = subjectivateNaturalJSON(source);
  const first = executeNaturalJSON(initial, ENV);
  assert.deepEqual(first.result, ["4"]);

  const before = inspectNaturalEntity(first.program, ["$sub"]);
  const sourceRootId = first.program.sourceRoot.id;
  const edited = reflectiveReplaceRole(first.program, ["$sub"], "R", "is_null");
  const after = inspectNaturalEntity(edited.program, ["$sub"]);

  assert.equal(after.sourceSlots.R.id, before.sourceSlots.R.id);
  assert.equal(after.controller, "is_null");
  assert.equal(edited.program.sourceRoot.id, sourceRootId);
  assert.equal(objectivateNaturalJSON(edited.program).$sub.note, "keep");
  assert.equal(objectivateNaturalJSON(edited.program).$sub.$rel, "is_null");

  const second = executeNaturalJSON(edited.program, ENV);
  assert.equal(second.diagnostic, null);
  assert.deepEqual(second.result, [null]);
  assert.equal(second.program.sourceRoot.id, sourceRootId);

  const secondPredicate = second.events.filter(event => event.controller === "is_null");
  assert.equal(secondPredicate.length, 5);
  assert.deepEqual(secondPredicate.map(event => event.result), [true, false, false, false, false]);
});

test("J1-W6 bounded negative cases reject atomically and plain ordinary objects remain DATA", () => {
  const invalidWhere = subjectivateNaturalJSON({
    $obj: 42,
    $rel: "where",
    $sub: { $obj: { $ref: "$obj" }, $rel: "is_string" }
  });
  const invalidWhereBefore = serializeE1State(invalidWhere.state);
  const invalidWhereRun = executeNaturalJSON(invalidWhere, ENV);
  assert.equal(invalidWhereRun.diagnostic, "WHERE_ARRAY_REQUIRED");
  assert.equal(serializeE1State(invalidWhereRun.program.state), invalidWhereBefore);
  assert.deepEqual(invalidWhereRun.events, []);

  const unknown = executeNaturalJSON(
    subjectivateNaturalJSON({ $rel: "not/a/j1/controller" }),
    ENV
  );
  assert.equal(unknown.diagnostic, "UNKNOWN_CONTROLLER");
  assert.deepEqual(unknown.events, []);

  const unsupportedRef = executeNaturalJSON(
    subjectivateNaturalJSON({
      $obj: { $ref: "$rel" },
      $rel: "is_string"
    }),
    ENV
  );
  assert.equal(unsupportedRef.diagnostic, "UNSUPPORTED_REFERENCE");
  assert.deepEqual(unsupportedRef.events, []);

  const data = { a: 1, b: [2, 3], nested: { c: true } };
  const dataRun = executeNaturalJSON(subjectivateNaturalJSON(data), ENV);
  assert.equal(dataRun.diagnostic, null);
  assert.equal(dataRun.mode, "DATA");
  assert.deepEqual(dataRun.events, []);
  assert.deepEqual(dataRun.result, data);
  assert.deepEqual(objectivateNaturalJSON(dataRun.program), data);
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  Key,
  N,
  P,
  Role,
  executeMOAtomically,
  sameEndpoint
} from "../src/mo-core.js";
import { objectivateNaturalJSON } from "../research/pc1/j1-natural-json.mjs";
import {
  createDuplet,
  createE1State,
  createFrame,
  serializeE1State
} from "../research/pc1/e1-witness.mjs";
import {
  PC2_A1_ROOT_SOURCE_SLOT,
  copyPC2A1Slots,
  createPC2A1Session,
  executePC2A1,
  resolveExistingPC2A1,
  snapshotPC2A1Session,
  stagePlanLValuesPC2A1
} from "../research/pc2/a1-contextual-json.mjs";

const HISTORICAL_ABSOLUTE_SOURCE = "{\n   \"$rel\" : [\n      {\n         \"test\" : \"get ent1 \",\n         \"$obj\" : {\n            \"$ref\" : \"ent1/id\"\n         },\n         \"$rel\" : \"=\",\n         \"$sub\" : {\n            \"$ref\" : \"$rel/ent1/id\"\n         }\n      },\n      {\n         \"test\" : \"get ent2\",\n         \"$obj\" : {\n            \"$ref\" : \"ent2/id\"\n         },\n         \"$rel\" : \"=\",\n         \"$sub\" : {\n            \"$ref\" : \"$rel/ent2/id\"\n         }\n      },\n      {\n         \"test\" : \"set ent3\",\n         \"$obj\" : {\n            \"$ref\" : \"$ent/ent3\"\n         },\n         \"$rel\" : \"add_entity\",\n         \"$sub\" : {\n            \"$ref\" : \"$rel/ent3/id\"\n         }\n      },\n      {\n         \"$obj\" : {\n            \"$ref\" : \"$ent/get_ent3_test\"\n         },\n         \"$rel\" : \"=\",\n         \"$sub\" : {\n            \"$ref\" : \"$rel/get_ent3_test\"\n         }\n      },\n      {\n         \"$obj\" : {\n            \"$ref\" : \"$rel/ent3/id\"\n         },\n         \"$rel\" : \"=\",\n         \"$sub\" : {\n            \"$ref\" : \"$rel/get_ent3_test/$obj/$ref\"\n         }\n      },\n      {\n         \"$ref\" : \"$rel/get_ent3_test\"\n      }\n   ],\n   \"ent3\" : {\n      \"id\" : \"ent3\",\n      \"description\" : \"test entity\"\n   },\n   \"get_ent3_test\" : {\n      \"test\" : \"get ent3\",\n      \"$rel\" : \"=\",\n      \"$sub\" : {\n         \"$ref\" : \"$rel/ent3/val\"\n      }\n   }\n}\n";
const HISTORICAL_RELATIVE_SOURCE = "{\n   \"id\" : \"$$$$ent/id\",\n   \"$obj\" : {\n      \"id\" : \"$$$$ent/$obj\"\n   },\n   \"$rel\" : [\n      {\n         \"test\" : \"$$$$ent\",\n         \"$rel\" : {\n            \"$rel\" : {\n               \"$rel\" : {\n                  \"$obj\" : {\n                     \"$ref\" : \"$$$$ent/id\"\n                  },\n                  \"$rel\" : \"=\",\n                  \"$sub\" : {\n                     \"$ref\" : \"$rel/$$$$ent/id\"\n                  }\n               }\n            }\n         }\n      },\n      {\n         \"test\" : \"$$$$sub\",\n         \"$rel\" : {\n            \"$rel\" : {\n               \"$rel\" : {\n                  \"$obj\" : {\n                     \"$ref\" : \"$$$$sub\"\n                  },\n                  \"$rel\" : \"=\",\n                  \"$sub\" : {\n                     \"$ref\" : \"$rel/$$$$sub\"\n                  }\n               }\n            }\n         }\n      },\n      {\n         \"test\" : \"$$$$obj\",\n         \"$rel\" : {\n            \"$rel\" : {\n               \"$rel\" : {\n                  \"$obj\" : {\n                     \"$ref\" : \"$$$$obj\"\n                  },\n                  \"$rel\" : \"=\",\n                  \"$sub\" : {\n                     \"$ref\" : \"$rel/$$$$obj\"\n                  }\n               }\n            }\n         }\n      },\n      {\n         \"test\" : \"$$$$rel\",\n         \"$rel\" : {\n            \"$rel\" : {\n               \"$rel\" : {\n                  \"$obj\" : {\n                     \"id\" : \"$$$$rel/id\"\n                  },\n                  \"$rel\" : \"=\",\n                  \"$sub\" : {\n                     \"$ref\" : \"$$$$rel/$$$$rel\"\n                  }\n               }\n            }\n         }\n      },\n      {\n         \"test\" : \"$$$ent\",\n         \"id\" : \"$$$ent/id\",\n         \"$rel\" : {\n            \"$rel\" : {\n               \"$rel\" : {\n                  \"$obj\" : {\n                     \"$ref\" : \"$$$ent/id\"\n                  },\n                  \"$rel\" : \"=\",\n                  \"$sub\" : {\n                     \"$ref\" : \"$rel/$$$ent/id\"\n                  }\n               }\n            }\n         }\n      },\n      {\n         \"test\" : \"$$$sub\",\n         \"$rel\" : {\n            \"$rel\" : {\n               \"$rel\" : {\n                  \"$obj\" : {\n                     \"$ref\" : \"$$$sub\"\n                  },\n                  \"$rel\" : \"=\",\n                  \"$sub\" : {\n                     \"$ref\" : \"$rel/$$$sub\"\n                  }\n               }\n            }\n         },\n         \"$sub\" : {\n            \"id\" : \"$$$ent/$sub\"\n         }\n      },\n      {\n         \"test\" : \"$$$obj\",\n         \"$obj\" : {\n            \"id\" : \"$$$ent/$obj\"\n         },\n         \"$rel\" : {\n            \"$rel\" : {\n               \"$rel\" : {\n                  \"$obj\" : {\n                     \"$ref\" : \"$$$obj\"\n                  },\n                  \"$rel\" : \"=\",\n                  \"$sub\" : {\n                     \"$ref\" : \"$rel/$$$obj\"\n                  }\n               }\n            }\n         }\n      },\n      {\n         \"test\" : \"$$$rel\",\n         \"$rel\" : {\n            \"$rel\" : {\n               \"$rel\" : {\n                  \"$obj\" : {\n                     \"id\" : \"$$$rel/id\"\n                  },\n                  \"$rel\" : \"=\",\n                  \"$sub\" : {\n                     \"$ref\" : \"$$$rel/$$$rel\"\n                  }\n               }\n            }\n         }\n      },\n      {\n         \"test\" : \"$$ent\",\n         \"$rel\" : {\n            \"id\" : \"$$ent/id\",\n            \"$rel\" : {\n               \"$rel\" : {\n                  \"$obj\" : {\n                     \"$ref\" : \"$$ent/id\"\n                  },\n                  \"$rel\" : \"=\",\n                  \"$sub\" : {\n                     \"$ref\" : \"$rel/$$ent/id\"\n                  }\n               }\n            }\n         }\n      },\n      {\n         \"test\" : \"$$sub\",\n         \"$rel\" : {\n            \"$rel\" : {\n               \"$rel\" : {\n                  \"$obj\" : {\n                     \"$ref\" : \"$$sub\"\n                  },\n                  \"$rel\" : \"=\",\n                  \"$sub\" : {\n                     \"$ref\" : \"$rel/$$sub\"\n                  }\n               }\n            },\n            \"$sub\" : {\n               \"id\" : \"$$ent/$sub\"\n            }\n         }\n      },\n      {\n         \"test\" : \"$$obj\",\n         \"$rel\" : {\n            \"$obj\" : {\n               \"id\" : \"$$ent/$obj\"\n            },\n            \"$rel\" : {\n               \"$rel\" : {\n                  \"$obj\" : {\n                     \"$ref\" : \"$$obj\"\n                  },\n                  \"$rel\" : \"=\",\n                  \"$sub\" : {\n                     \"$ref\" : \"$rel/$$obj\"\n                  }\n               }\n            }\n         }\n      },\n      {\n         \"test\" : \"$$rel\",\n         \"$rel\" : {\n            \"$rel\" : {\n               \"$rel\" : {\n                  \"$obj\" : {\n                     \"id\" : \"$$rel/id\"\n                  },\n                  \"$rel\" : \"=\",\n                  \"$sub\" : {\n                     \"$ref\" : \"$$rel/$$rel\"\n                  }\n               }\n            }\n         }\n      },\n      {\n         \"test\" : \"$ent\",\n         \"$rel\" : {\n            \"$rel\" : {\n               \"id\" : \"$ent/id\",\n               \"$rel\" : {\n                  \"$obj\" : {\n                     \"$ref\" : \"$ent/id\"\n                  },\n                  \"$rel\" : \"=\",\n                  \"$sub\" : {\n                     \"$ref\" : \"$rel/$ent/id\"\n                  }\n               }\n            }\n         }\n      },\n      {\n         \"test\" : \"$sub\",\n         \"$rel\" : {\n            \"$rel\" : {\n               \"$rel\" : {\n                  \"$obj\" : {\n                     \"$ref\" : \"$sub\"\n                  },\n                  \"$rel\" : \"=\",\n                  \"$sub\" : {\n                     \"$ref\" : \"$rel/$sub\"\n                  }\n               },\n               \"$sub\" : {\n                  \"id\" : \"$ent/$sub\"\n               }\n            }\n         }\n      },\n      {\n         \"test\" : \"$obj\",\n         \"$rel\" : {\n            \"$rel\" : {\n               \"$obj\" : {\n                  \"id\" : \"$ent/$obj\"\n               },\n               \"$rel\" : {\n                  \"$obj\" : {\n                     \"$ref\" : \"$obj\"\n                  },\n                  \"$rel\" : \"=\",\n                  \"$sub\" : {\n                     \"$ref\" : \"$rel/$obj\"\n                  }\n               }\n            }\n         }\n      },\n      {\n         \"test\" : \"$rel\",\n         \"$rel\" : {\n            \"$rel\" : {\n               \"$rel\" : {\n                  \"$obj\" : {\n                     \"id\" : \"$rel/id\"\n                  },\n                  \"$rel\" : \"=\",\n                  \"$sub\" : {\n                     \"$ref\" : \"$rel/$rel\"\n                  }\n               }\n            }\n         }\n      }\n   ],\n   \"$sub\" : {\n      \"id\" : \"$$$$ent/$sub\"\n   }\n}\n";

function applyMO(state, actions) {
  const result = executeMOAtomically(state.mo, actions);
  assert.equal(result.outcome.status, "OK", result.outcome.diagnostic);
  return { ...state, mo: result.state };
}

function makePlanSession({ sharedNull = false, sharedObject = false } = {}) {
  let session = createPC2A1Session({ $rel: [] });
  let state = session.state;
  const actions = [
    { op: "createNode", id: "probe:owner", kind: "object" },
    { op: "createNode", id: "probe:null", kind: "null", payload: null }
  ];
  if (sharedObject) actions.push({ op: "createNode", id: "probe:object", kind: "object" });
  state = applyMO(state, actions);
  const root = state.mo.roots[0];
  const targetR = sharedObject ? N("probe:object") : N("probe:null");
  const targetO = sharedObject ? N("probe:object") : sharedNull ? N("probe:null") : N("probe:null");
  let created = createDuplet(state, { id: "probe:R", begin: root, end: targetR });
  assert.equal(created.outcome.status, "OK");
  state = created.state;
  created = createDuplet(state, { id: "probe:O", begin: root, end: targetO });
  assert.equal(created.outcome.status, "OK");
  state = created.state;
  created = createFrame(state, {
    id: "probe:C",
    parent: null,
    E: PC2_A1_ROOT_SOURCE_SLOT,
    O: "probe:O",
    R: "probe:R",
    S: "probe:R"
  });
  assert.equal(created.outcome.status, "OK");
  session = { ...session, state: created.state };
  return session;
}

test("PC2-A1 W0 — ordinary root JSON remains DATA and role-only root preserves J1 NO_CONTROLLER boundary", () => {
  for (const data of [{ a: 1, nested: { b: true } }, [1, 2, 3], { $ref: "$ent" }]) {
    const session = createPC2A1Session(data);
    const before = snapshotPC2A1Session(session);
    const run = executePC2A1(session);
    assert.equal(run.diagnostic, null);
    assert.deepEqual(run.result, data);
    assert.equal(snapshotPC2A1Session(run.session), before);
    assert.deepEqual(run.attemptedTrace, []);
    assert.deepEqual(run.committedTrace, []);
  }

  const roleOnly = createPC2A1Session({ $obj: 1 });
  const beforeRoleOnly = snapshotPC2A1Session(roleOnly);
  const rejected = executePC2A1(roleOnly);
  assert.equal(rejected.diagnostic, "NO_CONTROLLER");
  assert.equal(snapshotPC2A1Session(rejected.session), beforeRoleOnly);
  assert.deepEqual(rejected.committedTrace, []);
});

test("PC2-A1 W1 — cold/warm namespace lookup shares one cached P identity", () => {
  const source = {
    $rel: [
      { $obj: { $ref: "ent1/id" }, $rel: "=", $sub: { $ref: "$rel/a" } },
      { $obj: { $ref: "ent1/id" }, $rel: "=", $sub: { $ref: "$rel/b" } }
    ]
  };
  const session = createPC2A1Session(source, { registry: { ent1: { id: "ent1" } } });
  const run = executePC2A1(session);
  assert.equal(run.diagnostic, null);
  assert.deepEqual(run.result, { a: "ent1", b: "ent1" });
  const loads = run.committedTrace.filter(event => event.op === "host.load" && event.name === "ent1");
  const hits = run.committedTrace.filter(event => event.op === "host.cache-hit" && event.name === "ent1");
  assert.equal(loads.length, 1);
  assert.ok(hits.length >= 1);
  assert.ok(run.session.namespace.has("ent1"));
  const slot = run.session.namespace.get("ent1");
  assert.ok(run.session.state.mo.relations.has(slot));
  const resolves = run.committedTrace.filter(event =>
    event.op === "resolve" && event.status === "OK" && event.address === "ent1/id");
  assert.equal(resolves.length, 2);
  assert.equal(resolves[0].readSlots[0], slot);
  assert.equal(resolves[1].readSlots[0], slot);
  assert.equal(new Set(resolves.map(event => event.readSlots[0])).size, 1);
  assert.ok(hits.every(event => event.slot === slot));
});

test("PC2-A1 W1 — failed cold load and late protected-root failure roll back all committed state", () => {
  const missing = createPC2A1Session({
    $obj: { $ref: "missing/id" },
    $rel: "=",
    $sub: { $ref: "$rel/a" }
  });
  const beforeMissing = snapshotPC2A1Session(missing);
  const failed = executePC2A1(missing);
  assert.equal(failed.diagnostic, "GLOBAL_NOT_FOUND");
  assert.equal(snapshotPC2A1Session(failed.session), beforeMissing);
  assert.deepEqual(failed.committedTrace, []);
  assert.ok(failed.attemptedTrace.some(event => event.op === "host.load" && event.status === "REJECT"));

  const protectedSource = {
    $obj: { $ref: "ent1/id" },
    $rel: "=",
    $sub: { $ref: "$ent" }
  };
  const protectedSession = createPC2A1Session(protectedSource, { registry: { ent1: { id: "ent1" } } });
  const beforeProtected = snapshotPC2A1Session(protectedSession);
  const protectedRun = executePC2A1(protectedSession);
  assert.equal(protectedRun.diagnostic, "PROTECTED_SOURCE_ROOT");
  assert.equal(snapshotPC2A1Session(protectedRun.session), beforeProtected);
  assert.deepEqual(protectedRun.committedTrace, []);
  assert.ok(protectedRun.attemptedTrace.some(event => event.op === "host.load" && event.name === "ent1"));
  assert.ok(protectedRun.attemptedTrace.some(event => event.op === "protected-root-guard"));
  assert.ok(protectedRun.attemptedTrace.some(event => event.op === "copy-embed"));
});

test("PC2-A1 W2 — shared missing prefix is materialized once for disjoint H destinations", () => {
  const run = executePC2A1(createPC2A1Session({
    $rel: {
      "$rel/a": 1,
      "$rel/b": 2
    }
  }));
  assert.equal(run.diagnostic, null);
  assert.deepEqual(run.result, { a: 1, b: 2 });
  const promotions = run.committedTrace.filter(event => event.op === "lvalue-promote-rebind");
  assert.equal(promotions.length, 1);
  const routes = run.committedTrace.filter(event => event.op === "H-route");
  assert.equal(routes.length, 2);
  assert.notEqual(routes[0].R, routes[1].R);
});

test("PC2-A1 W2 — member coalescing is by typed owner endpoint and label, not base slot spelling", () => {
  const sharedObject = makePlanSession({ sharedObject: true });
  assert.throws(
    () => stagePlanLValuesPC2A1(sharedObject, "probe:C", ["$rel/x", "$obj/x"]),
    error => error?.diagnostic === "H_ALIAS_CONFLICT"
  );

  const sharedNull = makePlanSession({ sharedNull: true });
  const planned = stagePlanLValuesPC2A1(sharedNull, "probe:C", ["$rel/x", "$obj/x"]);
  assert.equal(planned.plans.length, 2);
  assert.notEqual(planned.plans[0].slot.id, planned.plans[1].slot.id);
  const rTarget = planned.session.state.mo.relations.get("probe:R").target;
  const oTarget = planned.session.state.mo.relations.get("probe:O").target;
  assert.equal(rTarget.sort, "N");
  assert.equal(oTarget.sort, "N");
  assert.notEqual(rTarget.id, oTarget.id);
});

test("PC2-A1 W2 — pure resolver follows pre-existing keyed relations on scalar N and P owners", () => {
  let state = createE1State();
  state = applyMO(state, [
    { op: "createNode", id: "n:owner", kind: "object" },
    { op: "createNode", id: "n:scalar", kind: "string", payload: "scalar" },
    { op: "createNode", id: "n:value", kind: "string", payload: "value" },
    { op: "createNode", id: "n:value2", kind: "string", payload: "value2" },
    { op: "createRelation", id: "p:r", owner: N("n:owner"), label: Role("r"), target: N("n:scalar") },
    { op: "createRelation", id: "p:scalar-x", owner: N("n:scalar"), label: Key("x"), target: N("n:value") },
    { op: "createRelation", id: "p:inner", owner: N("n:owner"), label: Role("inner"), target: N("n:value") },
    { op: "createRelation", id: "p:pbase", owner: N("n:owner"), label: Role("pbase"), target: P("p:inner") },
    { op: "createRelation", id: "p:p-x", owner: P("p:inner"), label: Key("x"), target: N("n:value2") }
  ]);
  let frame = createFrame(state, { id: "C", parent: null, E: "p:r", O: "p:r", R: "p:r", S: "p:r" });
  assert.equal(frame.outcome.status, "OK");
  state = frame.state;
  frame = createFrame(state, { id: "D", parent: null, E: "p:pbase", O: "p:pbase", R: "p:pbase", S: "p:pbase" });
  assert.equal(frame.outcome.status, "OK");
  state = frame.state;
  const context = { state, namespace: new Map() };
  assert.equal(resolveExistingPC2A1(context, "C", "$rel/x").slot.id, "p:scalar-x");
  assert.equal(resolveExistingPC2A1(context, "D", "$rel/x").slot.id, "p:p-x");
  assert.throws(() => resolveExistingPC2A1(context, "C", "$rel/missing"), e => e?.diagnostic === "MISSING_CONTEXT_PATH");

  state = applyMO(state, [
    { op: "createRelation", id: "p:amb1", owner: N("n:scalar"), label: Key("amb"), target: N("n:value") },
    { op: "createRelation", id: "p:amb2", owner: N("n:scalar"), label: Key("amb"), target: N("n:value2") },
    { op: "createRelation", id: "p:unbound", owner: N("n:scalar"), label: Key("u"), target: null }
  ]);
  const ambiguous = { state, namespace: new Map() };
  assert.throws(() => resolveExistingPC2A1(ambiguous, "C", "$rel/amb"), e => e?.diagnostic === "AMBIGUOUS_CONTEXT_PATH");
  assert.throws(() => resolveExistingPC2A1(ambiguous, "C", "$rel/u"), e => e?.diagnostic === "UNBOUND_SLOT");
});

test("PC2-A1 W2 — absent member on scalar and P owner is not coerced by lvalue planner", () => {
  let scalar = makePlanSession();
  scalar = { ...scalar, state: applyMO(scalar.state, [{ op: "setNode", id: "probe:null", kind: "string", payload: "s" }]) };
  assert.throws(
    () => stagePlanLValuesPC2A1(scalar, "probe:C", ["$rel/x"]),
    e => e?.diagnostic === "NON_MATERIALIZABLE_OWNER"
  );

  let pOwner = makePlanSession();
  let state = pOwner.state;
  const root = state.mo.roots[0];
  state = applyMO(state, [
    { op: "createRelation", id: "probe:inner", owner: root, label: Role("inner"), target: N("probe:null") },
    { op: "rebindRelation", id: "probe:R", target: P("probe:inner") }
  ]);
  pOwner = { ...pOwner, state };
  assert.throws(
    () => stagePlanLValuesPC2A1(pOwner, "probe:C", ["$rel/x"]),
    e => e?.diagnostic === "NON_MATERIALIZABLE_OWNER"
  );
});

test("PC2-A1 W3 — immediate H reference resolves in C and executes in sibling H", () => {
  const source = {
    $rel: [
      { "$rel/p": 7 },
      { "$rel/a": { $ref: "$rel/p" } }
    ]
  };
  const run = executePC2A1(createPC2A1Session(source));
  assert.equal(run.diagnostic, null);
  assert.deepEqual(run.result, { a: 7, p: 7 });
  const secondRoute = run.committedTrace.filter(event => event.op === "H-route").at(-1);
  assert.equal(secondRoute.preparedKind, "ref");
  assert.ok(secondRoute.preparedSlot);
  assert.equal(secondRoute.resolutionFrame, secondRoute.from);
  assert.notEqual(secondRoute.from, secondRoute.to);
});

test("PC2-A1 W3 — prepared H reference is a read dependency and nested entity refs resolve under H", () => {
  const conflict = executePC2A1(createPC2A1Session({
    $rel: {
      "$rel/a": { $ref: "$rel/p" },
      "$rel/p": 7
    }
  }));
  assert.equal(conflict.diagnostic, "H_READ_WRITE_CONFLICT");
  assert.deepEqual(conflict.committedTrace, []);

  const nested = executePC2A1(createPC2A1Session({
    $rel: [
      { "$rel/x": 7 },
      { "$rel/a": { $obj: { $ref: "$rel/x" }, $rel: "=" } }
    ]
  }));
  assert.equal(nested.diagnostic, "MISSING_CONTEXT_PATH");
  const routes = nested.attemptedTrace.filter(event => event.op === "H-route");
  assert.ok(routes.length >= 2);
  assert.deepEqual(nested.committedTrace, []);
});

test("PC2-A1 W3 — direct admitted primitive is dispatched in H, not prepared as an address", () => {
  const run = executePC2A1(createPC2A1Session({ $rel: { "$rel/a": "=" } }));
  assert.equal(run.diagnostic, null);
  assert.deepEqual(run.result, { a: null });
  const route = run.committedTrace.find(event => event.op === "H-route");
  const dispatch = run.committedTrace.find(event => event.op === "primitive-dispatch" && event.name === "=");
  assert.ok(route);
  assert.ok(dispatch);
  assert.equal(route.preparedKind, "primitive");
  assert.equal(dispatch.frame, route.to);
});

test("PC2-A1 W4 — source root is coherent and same-P COPY is a pre-projection NOOP", () => {
  const source = {
    $obj: { $ref: "$ent" },
    $rel: "=",
    $sub: { $ref: "$ent" }
  };
  const session = createPC2A1Session(source);
  const rootBefore = session.state.mo.roots[0];
  const anchorBefore = session.state.mo.relations.get(PC2_A1_ROOT_SOURCE_SLOT);
  assert.ok(sameEndpoint(rootBefore, anchorBefore.target));
  const run = executePC2A1(session);
  assert.equal(run.diagnostic, null);
  assert.equal(run.result, null);
  const rootAfter = run.session.state.mo.roots[0];
  const anchorAfter = run.session.state.mo.relations.get(PC2_A1_ROOT_SOURCE_SLOT);
  assert.ok(sameEndpoint(rootBefore, rootAfter));
  assert.ok(sameEndpoint(anchorAfter.target, rootAfter));
  assert.ok(run.committedTrace.some(event => event.op === "copy" && event.status === "NOOP_SAME_P"));

  let nonprojectable = createPC2A1Session({ $rel: [] });
  let state = nonprojectable.state;
  const root = state.mo.roots[0];
  state = applyMO(state, [
    { op: "createRelation", id: "probe:q", owner: root, label: Role("q"), target: root },
    { op: "createRelation", id: "probe:p", owner: root, label: Role("p"), target: P("probe:q") }
  ]);
  nonprojectable = { ...nonprojectable, state };
  const before = snapshotPC2A1Session(nonprojectable);
  const copied = copyPC2A1Slots(nonprojectable, P("probe:p"), P("probe:p"));
  assert.equal(copied.diagnostic, null);
  assert.equal(snapshotPC2A1Session(copied.session), before);
  assert.ok(copied.committedTrace.some(event => event.op === "copy" && event.status === "NOOP_SAME_P"));
});

test("PC2-A1 historical absolute addressing — all 3 native CHECK observations and dynamic copied invocation", () => {
  const source = JSON.parse(HISTORICAL_ABSOLUTE_SOURCE);
  const session = createPC2A1Session(source, {
    registry: {
      ent1: { id: "ent1" },
      ent2: { id: "ent2" }
    }
  });
  const run = executePC2A1(session);
  assert.equal(run.diagnostic, null);
  assert.equal(run.result.ent1.id, "ent1");
  assert.equal(run.result.ent2.id, "ent2");
  assert.equal(run.result.ent3.val.id, "ent3");
  assert.match(run.result.ent3.id, /^pc2-ent-[1-9][0-9]*$/);
  assert.equal(run.result.get_ent3_test.$obj.$ref, run.result.ent3.id);
  assert.deepEqual(run.session.registry.get(run.result.ent3.id), { id: "ent3", description: "test entity" });
  assert.ok(run.session.namespace.has("ent1"));
  assert.ok(run.session.namespace.has("ent2"));
  assert.ok(run.session.namespace.has(run.result.ent3.id));

  const sourceAfter = objectivateNaturalJSON({ state: run.session.state });
  assert.deepEqual(sourceAfter, source);
  assert.equal(Object.hasOwn(sourceAfter.get_ent3_test, "$obj"), false);
});

test("PC2-A1 historical relative addressing — all 16 native CHECK observations execute through actual parent roles", () => {
  const source = JSON.parse(HISTORICAL_RELATIVE_SOURCE);
  const run = executePC2A1(createPC2A1Session(source));
  assert.equal(run.diagnostic, null, JSON.stringify(run.attemptedTrace.slice(-30), null, 2));
  const prefixes = [1, 2, 3, 4].map(count => "$".repeat(count));
  const expectedKeys = prefixes.flatMap(prefix => ["ent", "sub", "obj", "rel"].map(role => `${prefix}${role}`)).sort();
  assert.deepEqual(Object.keys(run.result).sort(), expectedKeys);
  for (const prefix of prefixes) {
    assert.equal(run.result[`${prefix}ent`].id, `${prefix}ent/id`);
    assert.equal(run.result[`${prefix}sub`].id, `${prefix}ent/$sub`);
    assert.equal(run.result[`${prefix}obj`].id, `${prefix}ent/$obj`);
    assert.equal(run.result[`${prefix}rel`].id, `${prefix}rel/id`);
  }
  const resolvedAddresses = new Set(
    run.committedTrace
      .filter(event => event.op === "resolve" && event.status === "OK")
      .map(event => event.address)
  );
  for (const prefix of prefixes) {
    assert.ok(resolvedAddresses.has(`${prefix}ent/id`));
    assert.ok(resolvedAddresses.has(`${prefix}sub`));
    assert.ok(resolvedAddresses.has(`${prefix}obj`));
  }
  const v = run.committedTrace.filter(event => event.op === "V-enter");
  assert.ok(v.length >= 17);
  assert.deepEqual(objectivateNaturalJSON({ state: run.session.state }), source);
});

test("PC2-A1 ordered vector reuses its enclosing frame and preserves order/multiplicity", () => {
  const a = executePC2A1(createPC2A1Session({ $rel: [1, 2] }));
  const b = executePC2A1(createPC2A1Session({ $rel: [2, 1] }));
  assert.equal(a.diagnostic, null);
  assert.equal(b.diagnostic, null);
  assert.equal(a.result, 2);
  assert.equal(b.result, 1);
  assert.equal(a.committedTrace.filter(event => event.op === "scalar").length, 2);
  assert.equal(b.committedTrace.filter(event => event.op === "scalar").length, 2);
});

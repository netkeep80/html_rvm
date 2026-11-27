import assert from "node:assert/strict";
import test from "node:test";

import {
  createPC2A1Session,
  executePC2A1,
  executePC2A2,
  snapshotPC2A1Session
} from "../research/pc2/a1-contextual-json.mjs";

test("PC2-A2 EXEC is explicit: A1 DATA stays unchanged, execution strings differ from operand strings", () => {
  const data = { a: 1, nested: ["x"] };
  const delegated = executePC2A2(createPC2A1Session(data));
  assert.equal(delegated.diagnostic, null);
  assert.deepEqual(delegated.result, data);
  assert.deepEqual(delegated.committedTrace, []);

  const vector = executePC2A2(createPC2A1Session([
    { $obj: 7, $rel: "=" }
  ]), { entry: "EXEC" });
  assert.equal(vector.diagnostic, null);
  assert.equal(vector.result, 7);

  const executableAddress = executePC2A2(createPC2A1Session({
    model: { $obj: 8, $rel: "=" },
    $rel: ["$ent/model"]
  }), { entry: "EXEC" });
  assert.equal(executableAddress.diagnostic, null);
  assert.equal(executableAddress.result, 8);
  assert.ok(executableAddress.committedTrace.some(event =>
    event.op === "exec-address" && event.address === "$ent/model"));

  const literalOperand = executePC2A2(createPC2A1Session({
    model: { $obj: 8, $rel: "=" },
    $obj: "$ent/model",
    $rel: "="
  }), { entry: "EXEC" });
  assert.equal(literalOperand.diagnostic, null);
  assert.equal(literalOperand.result, "$ent/model");

  const primitivePriority = executePC2A2(createPC2A1Session("=", {
    registry: { "=": { $obj: 99, $rel: "=" } }
  }), { entry: "EXEC" });
  assert.equal(primitivePriority.diagnostic, null);
  assert.equal(primitivePriority.result, null);
  assert.ok(primitivePriority.committedTrace.some(event =>
    event.op === "primitive-dispatch" && event.name === "="));

  // Accepted A1 default remains primitive-only for executable strings.
  const a1 = executePC2A1(createPC2A1Session({
    model: { $obj: 8, $rel: "=" },
    $rel: ["$ent/model"]
  }));
  assert.equal(a1.diagnostic, "UNKNOWN_CONTROLLER");
});

test("PC2-A2 W1 — filter -> patch -> filter reuses source identities and changes only predicate target", () => {
  const source = {
    filter: {
      $obj: [null, 2, false, "4", {}],
      $rel: "where",
      $sub: { $obj: { $ref: "$obj" }, $rel: "is_string" }
    },
    patch: {
      $obj: "is_null",
      $rel: "=",
      $sub: { $ref: "$ent/filter/$sub/$rel" }
    },
    $rel: [
      { $ref: "$ent/filter" },
      { $ref: "$ent/patch" },
      { $ref: "$ent/filter" }
    ]
  };

  const run = executePC2A2(createPC2A1Session(source), { entry: "EXEC" });
  assert.equal(run.diagnostic, null);
  assert.deepEqual(run.result, [null]);

  const exits = run.committedTrace.filter(event => event.op === "iterator-exit" && event.kind === "where");
  assert.equal(exits.length, 2);
  assert.deepEqual(exits[0].result, ["4"]);
  assert.deepEqual(exits[1].result, [null]);

  const filterRefs = run.committedTrace.filter(event => event.op === "exec-ref" && event.address === "$ent/filter");
  assert.equal(filterRefs.length, 2);
  assert.equal(filterRefs[0].slot, filterRefs[1].slot);

  const patchTarget = run.committedTrace.find(event =>
    event.op === "plan-lvalue" && event.address === "$ent/filter/$sub/$rel");
  assert.ok(patchTarget);
  const predicateV = run.committedTrace.filter(event =>
    event.op === "V-enter" && event.sourceController === patchTarget.slot);
  assert.equal(predicateV.length, 5 + 5);
  assert.equal(new Set(predicateV.map(event => event.sourceController)).size, 1);
  assert.ok(!run.committedTrace.some(event => event.op === "protected-root-guard"));
});

test("PC2-A2 W3 — real two-item PrepareFullReport foreach constructs and executes one live model occurrence per item", () => {
  const columns = ["$$obj/FileName", "$$obj/param11/meas_count"];
  const innerPrepareFullReport = [
    {
      "$rel/func": {
        "$rel/$obj": {
          $obj: { $ref: "$obj" },
          $rel: "="
        },
        "$rel/$rel": {
          $obj: { $ref: "#/eq_entity_name" },
          $rel: "="
        }
      }
    },
    "$rel/func"
  ];
  const source = {
    $rel: [
      // Explicit sequential warmup of the historical # registry, then restore R to null.
      { $obj: { $ref: "#/eq_entity_name" }, $rel: "=" },
      { $obj: null, $rel: "=" },
      {
        $obj: columns,
        $rel: "foreachobj",
        $sub: innerPrepareFullReport
      }
    ]
  };

  const run = executePC2A2(createPC2A1Session(source, {
    registry: { "#": { eq_entity_name: "=" } }
  }), { entry: "EXEC" });

  assert.equal(run.diagnostic, null);
  assert.deepEqual(run.result, columns);

  const exit = run.committedTrace.find(event =>
    event.op === "iterator-exit" && event.kind === "foreachobj");
  assert.ok(exit);
  assert.deepEqual(exit.result, columns);

  const items = run.committedTrace.filter(event => event.op === "iterator-item" && event.kind === "foreachobj");
  assert.equal(items.length, 2);
  assert.equal(new Set(items.map(event => event.frame)).size, 2);
  assert.equal(new Set(items.map(event => event.O)).size, 2);
  assert.equal(new Set(items.map(event => event.R)).size, 2);
  assert.ok(items.every(event => event.R === event.S));

  const constructed = run.committedTrace.filter(event => event.op === "H-route" && event.key === "$rel/func");
  assert.equal(constructed.length, 2);
  assert.equal(new Set(constructed.map(event => event.R)).size, 2);

  const invoked = run.committedTrace.filter(event => event.op === "exec-address" && event.address === "$rel/func");
  assert.equal(invoked.length, 2);
  assert.deepEqual(
    new Set(invoked.map(event => event.slot)),
    new Set(constructed.map(event => event.R))
  );
  assert.ok(run.committedTrace.some(event => event.op === "host.cache-hit" && event.name === "#"));
});

test("PC2-A2 reflection — patch descendant of one generated model P and re-execute the same occurrence", () => {
  const source = {
    row: { x: "ROW" },
    func: { $obj: "LITERAL", $rel: "=" },
    patch: {
      $obj: { $ref: "#/descriptor" },
      $rel: "=",
      $sub: { $ref: "$ent/func/$obj" }
    },
    $rel: [
      { "$rel/first": { $ref: "$ent/func" } },
      { $ref: "$ent/patch" },
      { "$rel/second": { $ref: "$ent/func" } }
    ]
  };
  const session = createPC2A1Session(source, {
    registry: { "#": { descriptor: { $ref: "$ent/row/x" } } }
  });
  const run = executePC2A2(session, { entry: "EXEC" });

  assert.equal(run.diagnostic, null);
  assert.deepEqual(run.result, { first: "LITERAL", second: "ROW" });

  // The lambda branch's exact reference is intentionally prepared in C, so
  // identity evidence is the resolver record rather than an exec-ref hop in H.
  const refs = run.committedTrace.filter(event =>
    event.op === "resolve" && event.address === "$ent/func" && event.status === "OK");
  assert.equal(refs.length, 2);
  assert.equal(refs[0].slot, refs[1].slot);

  const funcV = run.committedTrace.filter(event => event.op === "V-enter" && event.E === refs[0].slot);
  assert.equal(funcV.length, 2);
  assert.equal(funcV[0].sourceController, funcV[1].sourceController);

  const patchPlan = run.committedTrace.find(event =>
    event.op === "plan-lvalue" && event.address === "$ent/func/$obj");
  assert.ok(patchPlan);
  assert.ok(run.committedTrace.some(event =>
    event.op === "resolve" && event.address === "$ent/row/x" && event.status === "OK"));
});

test("PC2-A2 COPY and ALIAS have distinct observable sharing semantics", () => {
  function scenario(controller) {
    return {
      a: { x: 1 },
      b: { x: 2 },
      $rel: [
        {
          $obj: { $ref: "$ent/a" },
          $rel: controller,
          $sub: { $ref: "$ent/b" }
        },
        {
          $obj: 9,
          $rel: "=",
          $sub: { $ref: "$ent/a/x" }
        },
        {
          "$rel/result": {
            $obj: { $ref: "$ent/b" },
            $rel: "="
          }
        }
      ]
    };
  }

  const copied = executePC2A2(createPC2A1Session(scenario("=")), { entry: "EXEC" });
  assert.equal(copied.diagnostic, null);
  assert.deepEqual(copied.result, { result: { x: 1 } });

  const aliased = executePC2A2(createPC2A1Session(scenario("ALIAS")), { entry: "EXEC" });
  assert.equal(aliased.diagnostic, null);
  assert.deepEqual(aliased.result, { result: { x: 9 } });
  assert.ok(aliased.committedTrace.some(event => event.op === "alias" && event.status === "OK"));
});

test("PC2-A2 VIEW uses the documented ancestry and writes through S without a second interpreter", () => {
  const source = {
    model: { $obj: 42, $rel: "=" },
    $rel: {
      $obj: { $ref: "$ent/model" },
      $rel: "VIEW",
      $sub: { $ref: "$rel/out" }
    }
  };
  const run = executePC2A2(createPC2A1Session(source), { entry: "EXEC" });
  assert.equal(run.diagnostic, null);
  assert.deepEqual(run.result, { out: 42 });

  const enter = run.committedTrace.find(event => event.op === "view-enter");
  assert.ok(enter);
  const frame = run.committedTrace.find(event => event.op === "VIEW" && event.id === enter.to);
  assert.ok(frame);
  assert.equal(frame.parent, enter.parent);
  assert.equal(frame.roles.R, enter.R);
  assert.equal(enter.model, run.committedTrace.find(event =>
    event.op === "resolve" && event.address === "$ent/model")?.slot);
});

test("PC2-A2 iterator ownership rejects direct input mutation and rolls back the whole attempt", () => {
  const source = {
    $obj: [{ x: 1 }, { x: 2 }],
    $rel: "foreachobj",
    $sub: {
      $obj: 9,
      $rel: "=",
      $sub: { $ref: "$obj/x" }
    }
  };
  const session = createPC2A1Session(source);
  const before = snapshotPC2A1Session(session);
  const run = executePC2A2(session, { entry: "EXEC" });

  assert.equal(run.diagnostic, "ITERATOR_FOREIGN_WRITE");
  assert.equal(snapshotPC2A1Session(run.session), before);
  assert.deepEqual(run.committedTrace, []);
  assert.ok(run.attemptedTrace.some(event => event.op === "iterator-enter" && event.kind === "foreachobj"));
  assert.equal(run.attemptedTrace.filter(event => event.op === "iterator-item" && event.kind === "foreachobj").length, 1);
});

test("PC2-A2 multi-H containing a new effect rejects conservatively before real H routes", () => {
  const source = {
    a: { x: 1 },
    b: { x: 2 },
    $rel: {
      "$rel/x": {
        $obj: { $ref: "$ent/a" },
        $rel: "ALIAS",
        $sub: { $ref: "$ent/b" }
      },
      "$rel/y": { $obj: 1, $rel: "=" }
    }
  };
  const session = createPC2A1Session(source);
  const before = snapshotPC2A1Session(session);
  const run = executePC2A2(session, { entry: "EXEC" });

  assert.equal(run.diagnostic, "H_UNPROVEN_INTERFERENCE");
  assert.equal(snapshotPC2A1Session(run.session), before);
  assert.deepEqual(run.committedTrace, []);
  assert.equal(run.attemptedTrace.filter(event => event.op === "H-route").length, 0);
});

test("PC2-A2 failure diagnostics preserve exact rollback for invalid entry and recursive EXEC", () => {
  const session = createPC2A1Session("$ent");
  const before = snapshotPC2A1Session(session);

  const invalid = executePC2A2(session, { entry: "OTHER" });
  assert.equal(invalid.diagnostic, "INVALID_EXECUTION_ENTRY");
  assert.equal(snapshotPC2A1Session(invalid.session), before);

  const recursive = executePC2A2(session, { entry: "EXEC" });
  assert.equal(recursive.diagnostic, "EXECUTION_FUEL_EXHAUSTED");
  assert.equal(snapshotPC2A1Session(recursive.session), before);
  assert.deepEqual(recursive.committedTrace, []);
  assert.ok(recursive.attemptedTrace.some(event => event.op === "execution-fuel"));
});


test("PC2-A2 bounded where/foreach laws — null, empty, strict boolean, duplicates and untouched null results", () => {
  const whereNull = executePC2A2(createPC2A1Session({
    $obj: null,
    $rel: "where",
    $sub: true
  }), { entry: "EXEC" });
  assert.equal(whereNull.diagnostic, null);
  assert.deepEqual(whereNull.result, []);
  assert.equal(whereNull.committedTrace.filter(event => event.op === "iterator-item").length, 0);

  const duplicates = executePC2A2(createPC2A1Session({
    $obj: ["a", "a", "b"],
    $rel: "where",
    $sub: true
  }), { entry: "EXEC" });
  assert.equal(duplicates.diagnostic, null);
  assert.deepEqual(duplicates.result, ["a", "a", "b"]);

  const nonBoolean = executePC2A2(createPC2A1Session({
    $obj: [1, 2],
    $rel: "where",
    $sub: 1
  }), { entry: "EXEC" });
  assert.equal(nonBoolean.diagnostic, null);
  assert.deepEqual(nonBoolean.result, []);

  const emptyForeach = executePC2A2(createPC2A1Session({
    $obj: [],
    $rel: "foreachobj",
    $sub: null
  }), { entry: "EXEC" });
  assert.equal(emptyForeach.diagnostic, null);
  assert.deepEqual(emptyForeach.result, []);
  assert.equal(emptyForeach.committedTrace.filter(event =>
    event.op === "iterator-item" && event.kind === "foreachobj").length, 0);

  const untouched = executePC2A2(createPC2A1Session({
    $obj: [null, 1],
    $rel: "foreachobj",
    $sub: null
  }), { entry: "EXEC" });
  assert.equal(untouched.diagnostic, null);
  assert.deepEqual(untouched.result, [null, null]);
});

test("PC2-A2 where selection is a value COPY: later source mutation does not alter selected compound output", () => {
  const source = {
    filter: {
      $obj: [{ x: "a" }, { x: 2 }],
      $rel: "where",
      $sub: { $obj: { $ref: "$obj/x" }, $rel: "is_string" }
    },
    mutateInput: {
      $obj: "changed",
      $rel: "=",
      $sub: { $ref: "$ent/filter/$obj/0/x" }
    },
    $rel: [
      { $ref: "$ent/filter" },
      { $ref: "$ent/mutateInput" }
    ]
  };
  const run = executePC2A2(createPC2A1Session(source), { entry: "EXEC" });
  assert.equal(run.diagnostic, null);
  assert.deepEqual(run.result, [{ x: "a" }]);
  assert.ok(run.committedTrace.some(event =>
    event.op === "plan-lvalue" && event.address === "$ent/filter/$obj/0/x"));
});

test("PC2-A2 iterator admission rejects null/nonarray input, nonempty foreach output and O=R overlap", () => {
  const nullInput = executePC2A2(createPC2A1Session({
    $obj: null,
    $rel: "foreachobj",
    $sub: null
  }), { entry: "EXEC" });
  assert.equal(nullInput.diagnostic, "ITERATOR_INPUT_REQUIRED");

  const scalarInput = executePC2A2(createPC2A1Session({
    $obj: 1,
    $rel: "foreachobj",
    $sub: null
  }), { entry: "EXEC" });
  assert.equal(scalarInput.diagnostic, "ARRAY_REQUIRED");

  const nonemptyOutput = executePC2A2(createPC2A1Session({
    $rel: [
      { $obj: [9], $rel: "=" },
      { $obj: [], $rel: "foreachobj", $sub: null }
    ]
  }), { entry: "EXEC" });
  assert.equal(nonemptyOutput.diagnostic, "ITERATOR_OUTPUT_NOT_EMPTY");

  const overlap = executePC2A2(createPC2A1Session({
    $rel: {
      $obj: { $ref: "$rel" },
      $rel: "foreachobj",
      $sub: null
    }
  }), { entry: "EXEC" });
  assert.equal(overlap.diagnostic, "ITERATOR_OUTPUT_OVERLAP");
});

test("PC2-A2 iterator read gate blocks aggregate/previous-result access through parent contextual address", () => {
  const source = {
    $obj: [1],
    $rel: "foreachobj",
    $sub: {
      $obj: { $ref: "$$rel/0" },
      $rel: "="
    }
  };
  const session = createPC2A1Session(source);
  const before = snapshotPC2A1Session(session);
  const run = executePC2A2(session, { entry: "EXEC" });
  assert.equal(run.diagnostic, "ITERATOR_UNPROVEN_EFFECT");
  assert.equal(snapshotPC2A1Session(run.session), before);
  assert.deepEqual(run.committedTrace, []);
});

test("PC2-A2 iterator ownership follows actual shared identity, not the alternative alias path", () => {
  const source = {
    input: [{ x: { v: 1 } }],
    foreign: { v: 0 },
    share: {
      $obj: { $ref: "$ent/input/0/x" },
      $rel: "ALIAS",
      $sub: { $ref: "$ent/foreign" }
    },
    loop: {
      $obj: { $ref: "$ent/input" },
      $rel: "foreachobj",
      $sub: {
        $obj: 9,
        $rel: "=",
        $sub: { $ref: "$$ent/foreign/v" }
      }
    },
    $rel: [
      { $ref: "$ent/share" },
      { $ref: "$ent/loop" }
    ]
  };
  const session = createPC2A1Session(source);
  const before = snapshotPC2A1Session(session);
  const run = executePC2A2(session, { entry: "EXEC" });
  assert.equal(run.diagnostic, "ITERATOR_FOREIGN_WRITE");
  assert.equal(snapshotPC2A1Session(run.session), before);
  assert.deepEqual(run.committedTrace, []);
  assert.ok(run.attemptedTrace.some(event => event.op === "alias" && event.status === "OK"));
});

test("PC2-A2 iterator cannot materialize a new member on a pre-existing input owner", () => {
  const source = {
    $obj: [{}],
    $rel: "foreachobj",
    $sub: {
      $obj: 9,
      $rel: "=",
      $sub: { $ref: "$obj/new" }
    }
  };
  const session = createPC2A1Session(source);
  const before = snapshotPC2A1Session(session);
  const run = executePC2A2(session, { entry: "EXEC" });
  assert.equal(run.diagnostic, "ITERATOR_FOREIGN_WRITE");
  assert.equal(snapshotPC2A1Session(run.session), before);
  assert.deepEqual(run.committedTrace, []);
});

test("PC2-A2 late second-item cold effect rolls back first-item result, cache, allocator and frames", () => {
  const source = {
    $rel: [
      { $obj: { $ref: "safe" }, $rel: "=" },
      { $obj: null, $rel: "=" },
      {
        $obj: ["safe", "missing"],
        $rel: "foreachobj",
        $sub: "$obj"
      }
    ]
  };
  const session = createPC2A1Session(source, {
    registry: { safe: { $obj: 1, $rel: "=" } }
  });
  const before = snapshotPC2A1Session(session);
  const run = executePC2A2(session, { entry: "EXEC" });

  assert.equal(run.diagnostic, "ITERATOR_UNPROVEN_EFFECT");
  assert.equal(snapshotPC2A1Session(run.session), before);
  assert.deepEqual(run.committedTrace, []);
  const items = run.attemptedTrace.filter(event =>
    event.op === "iterator-item" && event.kind === "foreachobj");
  assert.equal(items.length, 2);
  assert.ok(run.attemptedTrace.some(event => event.op === "host.cache-hit" && event.name === "safe"));
});

test("PC2-A2 nested iterator is fail-closed inside an owned item", () => {
  const source = {
    $obj: [1],
    $rel: "foreachobj",
    $sub: {
      $obj: [],
      $rel: "foreachobj",
      $sub: null
    }
  };
  const session = createPC2A1Session(source);
  const before = snapshotPC2A1Session(session);
  const run = executePC2A2(session, { entry: "EXEC" });
  assert.equal(run.diagnostic, "ITERATOR_UNPROVEN_EFFECT");
  assert.equal(snapshotPC2A1Session(run.session), before);
  assert.deepEqual(run.committedTrace, []);
});

test("PC2-A2 new-effect multi-H rejects with the effect in either sorted sibling position", () => {
  for (const aliasFirst of [true, false]) {
    const aliasKey = aliasFirst ? "$rel/a" : "$rel/z";
    const copyKey = aliasFirst ? "$rel/z" : "$rel/a";
    const controller = {
      [aliasKey]: {
        $obj: { $ref: "$ent/a" },
        $rel: "ALIAS",
        $sub: { $ref: "$ent/b" }
      },
      [copyKey]: { $obj: 1, $rel: "=" }
    };
    const source = { a: { x: 1 }, b: { x: 2 }, $rel: controller };
    const session = createPC2A1Session(source);
    const before = snapshotPC2A1Session(session);
    const run = executePC2A2(session, { entry: "EXEC" });
    assert.equal(run.diagnostic, "H_UNPROVEN_INTERFERENCE");
    assert.equal(snapshotPC2A1Session(run.session), before);
    assert.equal(run.attemptedTrace.filter(event => event.op === "H-route").length, 0);
  }
});

test("PC2-A2 H probes and real execution consume one shared monotonic work budget", () => {
  const source = {};
  for (let i = 0; i < 256; i += 1) {
    source[`$rel/k${String(i).padStart(3, "0")}`] = 1;
  }
  const session = createPC2A1Session(source);
  const before = snapshotPC2A1Session(session);
  const run = executePC2A2(session, { entry: "EXEC" });

  assert.equal(run.diagnostic, "EXECUTION_FUEL_EXHAUSTED");
  assert.equal(snapshotPC2A1Session(run.session), before);
  assert.deepEqual(run.committedTrace, []);
  assert.ok(run.attemptedTrace.some(event => event.op === "execution-fuel"));
  // Root dispatch + 256 probes consume 257 units; only 255 real H routes fit.
  assert.equal(run.attemptedTrace.filter(event => event.op === "H-route").length, 255);
});

import test from "node:test";
import assert from "node:assert/strict";
import { MemoryDocumentProvider } from "../src/memory-document-provider.js";
import { createWorkingSession } from "../src/working-session.js";
import {
  pointerTokens, getPointer, setWorking, incrementWorking,
  removeWorking, stressWorking, describeDifference
} from "../site/operations.js";

const hasCode = code => error => error?.code === code;
async function fixture(value = { counter: 0, nested: { "a/b": { "~k": 7 } }, arr: [1, 2] }) {
  const provider = new MemoryDocumentProvider({ model: value });
  const snapshot = await provider.openSnapshot();
  const session = await createWorkingSession(provider, snapshot, ["model"]);
  return { provider, snapshot, session };
}

test("Pages: strict RFC6901 paths, ~0/~1, root and array indices", async () => {
  const { session } = await fixture();
  assert.deepStrictEqual(pointerTokens(""), []);
  assert.deepStrictEqual(pointerTokens("/nested/a~1b/~0k"), ["nested", "a/b", "~k"]);
  assert.equal(getPointer(session.getMutableDocument("model"), "/nested/a~1b/~0k"), 7);
  assert.equal(getPointer(session.getMutableDocument("model"), "/arr/0"), 1);
  assert.deepStrictEqual(getPointer(session.getMutableDocument("model"), ""), session.exportDocument("model"));
  for (const path of ["arr/0", "/arr/-", "/arr/01", "/arr/1.0", "/nested/~", "/nested/~2", "/arr/999999999999999999999"]) {
    assert.throws(() => getPointer(session.getMutableDocument("model"), path),
      hasCode("INVALID_REFERENCE"));
  }
  assert.throws(() => getPointer(session.getMutableDocument("model"), "/arr/5"), hasCode("PATH_NOT_FOUND"));
  assert.throws(() => getPointer(session.getMutableDocument("model"), "/nested/missing"), hasCode("PATH_NOT_FOUND"));
});

test("Pages: set, add object key, change root, replace array element and remove", async () => {
  const { session, provider, snapshot } = await fixture();
  setWorking(session, "model", "/nested/new", null);
  assert.equal(getPointer(session.getMutableDocument("model"), "/nested/new"), null);
  setWorking(session, "model", "/arr/1", 42);
  assert.equal(getPointer(session.getMutableDocument("model"), "/arr/1"), 42);
  assert.throws(() => setWorking(session, "model", "/arr/2", 3), hasCode("PATH_NOT_FOUND"));
  assert.equal(removeWorking(session, "model", "/arr/0"), 1);
  assert.deepStrictEqual(getPointer(session.getMutableDocument("model"), "/arr"), [42]);
  assert.throws(() => removeWorking(session, "model", ""), hasCode("INVALID_REFERENCE"));
  setWorking(session, "model", "", { other: true });
  assert.deepStrictEqual(session.exportDocument("model"), { other: true });
  assert.equal((await provider.read(snapshot, "model")).counter, 0);
});

test("Pages: prototype-pollution safe __proto__ key and missing-vs-null", async () => {
  const { session } = await fixture();
  setWorking(session, "model", "/__proto__", { polluted: true });
  const doc = session.getMutableDocument("model");
  assert.equal(Object.hasOwn(doc, "__proto__"), true);
  assert.equal(Object.getPrototypeOf(doc), Object.prototype);
  assert.equal({}.polluted, undefined);
  assert.deepStrictEqual(getPointer(doc, "/__proto__"), { polluted: true });
  assert.throws(() => getPointer(doc, "/missing"), hasCode("PATH_NOT_FOUND"));
  setWorking(session, "model", "/nullish", null);
  assert.equal(getPointer(doc, "/nullish"), null);
});

test("Pages: increment enforces number domain and safe integers", async () => {
  const { session } = await fixture({ n: 1, obj: {} });
  assert.equal(incrementWorking(session, "model", "/n", 2), 3);
  assert.throws(() => incrementWorking(session, "model", "/obj"), hasCode("INVALID_REFERENCE"));
  assert.throws(() => incrementWorking(session, "model", "/n", Infinity), hasCode("INVALID_REFERENCE"));
  session.replaceDocument("model", { n: Number.MAX_SAFE_INTEGER });
  assert.throws(() => incrementWorking(session, "model", "/n", 1), hasCode("RESOURCE_LIMIT"));
  assert.equal(session.getMutableDocument("model").n, Number.MAX_SAFE_INTEGER);
});

test("Pages: 1,000,000 in-memory changes, 0 calls to DBMS writer", async () => {
  const { session, provider, snapshot } = await fixture({ counter: 0 });
  let writes = 0;
  const wrapper = {
    read: (...args) => provider.read(...args),
    commit() { writes++; throw Error("unexpected persistent write"); }
  };
  const w = await createWorkingSession(wrapper, snapshot, ["model"]);
  const result = stressWorking(w, "model", "/counter");
  assert.equal(result.count, 1_000_000);
  assert.equal(result.value, 1_000_000);
  assert.ok(result.durationMs >= 0);
  assert.equal(writes, 0);
  assert.deepStrictEqual(await provider.read(snapshot, "model"), { counter: 0 });
  assert.equal(describeDifference(await provider.read(snapshot, "model"), w.exportDocument("model")), "changed");
  assert.equal(describeDifference(await provider.read(snapshot, "model"), session.exportDocument("model")), "identical");
});

test("Pages: invalid stress arguments do not mutate working document", async () => {
  const { session } = await fixture();
  for (const n of [0, -1, 1.5, 1_000_001, NaN]) {
    assert.throws(() => stressWorking(session, "model", "/counter", n), hasCode("RESOURCE_LIMIT"));
  }
  assert.throws(() => stressWorking(session, "model", "/arr/0", 1_000_001), hasCode("RESOURCE_LIMIT"));
  assert.equal(getPointer(session.getMutableDocument("model"), "/counter"), 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { MemoryDocumentProvider } from "../src/memory-document-provider.js";
import { createWorkingSession } from "../src/working-session.js";

const code = expected => error => error?.code === expected;

test("C20/C25: working JSON is detached from immutable source and other sessions", async () => {
  const source = new MemoryDocumentProvider({ d: { n: 1, nested: [0] }, other: { n: 7 } });
  const snapshot = await source.openSnapshot();
  const a = await createWorkingSession(source, snapshot, ["d", "other"]);
  const b = await createWorkingSession(source, snapshot, ["d"]);
  const aDocument = a.getMutableDocument("d");
  aDocument.n = 123;
  aDocument.nested.push(5);
  assert.deepStrictEqual(b.getMutableDocument("d"), { n: 1, nested: [0] });
  assert.deepStrictEqual(await source.read(snapshot, "d"), { n: 1, nested: [0] });
  assert.deepStrictEqual(a.exportDocument("d"), { n: 123, nested: [0, 5] });
  assert.deepStrictEqual(a.exportDocument("other"), { n: 7 });
  const exportCopy = a.exportDocument("d");
  exportCopy.n = -1;
  assert.equal(a.getMutableDocument("d").n, 123);
});

test("C20: working session also isolates data from a nonconforming sharing reader", async () => {
  const shared = { n: 2 };
  const reader = { async read() { return shared; } };
  const s = await createWorkingSession(reader, Object.freeze({}), ["d"]);
  s.getMutableDocument("d").n = 3;
  assert.equal(shared.n, 2);
});

test("C21/C22 subset: one million RAM-only mutations do not request any commit", async () => {
  const provider = new MemoryDocumentProvider({ counter: { n: 0 } });
  const snapshot = await provider.openSnapshot();
  let writerCalls = 0;
  const reader = {
    read: (...args) => provider.read(...args),
    commit() { writerCalls++; throw Error("Unexpected commit"); }
  };
  const session = await createWorkingSession(reader, snapshot, ["counter"]);
  const doc = session.getMutableDocument("counter");
  for (let i = 0; i < 1_000_000; i++) doc.n++;
  assert.equal(doc.n, 1_000_000);
  assert.equal(writerCalls, 0);
  assert.deepStrictEqual(await provider.read(snapshot, "counter"), { n: 0 });
});

test("C18: export and replace of working documents validate strict JSON", async () => {
  const provider = new MemoryDocumentProvider({ a: { n: 0 } });
  const snapshot = await provider.openSnapshot();
  const session = await createWorkingSession(provider, snapshot, ["a"]);
  const external = { n: 1 };
  session.replaceDocument("a", external);
  external.n = 77;
  assert.deepStrictEqual(session.exportDocument("a"), { n: 1 });
  session.getMutableDocument("a").n = Infinity;
  assert.throws(() => session.exportDocument("a"), code("INVALID_REFERENCE"));
  assert.throws(() => session.replaceDocument("a", { n: NaN }), code("INVALID_REFERENCE"));
  session.replaceDocument("a", null);
  assert.equal(session.exportDocument("a"), null);
  assert.deepStrictEqual(await provider.read(snapshot, "a"), { n: 0 });
});

test("C03: session cannot access unloaded or duplicate documents", async () => {
  const provider = new MemoryDocumentProvider({ a: 1, b: 2 });
  const snapshot = await provider.openSnapshot();
  const session = await createWorkingSession(provider, snapshot, ["a"]);
  assert.throws(() => session.getMutableDocument("b"), code("NOT_FOUND"));
  assert.throws(() => session.exportDocument("b"), code("NOT_FOUND"));
  assert.throws(() => session.replaceDocument("b", 3), code("NOT_FOUND"));
  await assert.rejects(createWorkingSession(provider, snapshot, ["a", "a"]), code("INVALID_REFERENCE"));
  await assert.rejects(createWorkingSession(provider, snapshot, ["a", "unknown"]), code("NOT_FOUND"));
});

test("C08: working-session materialization cannot silently bypass an invalid handle", async () => {
  const provider = new MemoryDocumentProvider({ a: 1 });
  await assert.rejects(createWorkingSession(provider, {}, ["a"]), code("INVALID_REFERENCE"));
  await assert.rejects(createWorkingSession(provider, await provider.openSnapshot(), [123]), code("INVALID_REFERENCE"));
});

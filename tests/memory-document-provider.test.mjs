import test from "node:test";
import assert from "node:assert/strict";
import { MemoryDocumentProvider } from "../src/memory-document-provider.js";

function code(expected) {
  return error => error?.code === expected;
}

test("C01: repeated reads of the same snapshot have equal JSON values", async () => {
  const provider = new MemoryDocumentProvider({ "a": { n: 1, nested: [true, null, "x"] } });
  const snapshot = await provider.openSnapshot();
  assert.deepStrictEqual(await provider.read(snapshot, "a"), await provider.read(snapshot, "a"));
  const old = await provider.openSnapshot("initial");
  assert.deepStrictEqual(await provider.read(old, "a"), await provider.read(snapshot, "a"));
});

test("C02: both constructor seed and read results are detached", async () => {
  const source = { nested: [{ n: 1 }] };
  const provider = new MemoryDocumentProvider({ doc: source });
  const snapshot = await provider.openSnapshot();
  source.nested[0].n = 100;
  const first = await provider.read(snapshot, "doc");
  first.nested[0].n = 1000;
  assert.deepStrictEqual(await provider.read(snapshot, "doc"), { nested: [{ n: 1 }] });
});

test("C03: absent document is NOT_FOUND, JSON null remains a successful value", async () => {
  const provider = new MemoryDocumentProvider({ nullDoc: null });
  const snapshot = await provider.openSnapshot();
  assert.equal(await provider.read(snapshot, "nullDoc"), null);
  await assert.rejects(provider.read(snapshot, "missing"), code("NOT_FOUND"));
  await assert.rejects(provider.read(snapshot, ""), code("INVALID_REFERENCE"));
  await assert.rejects(provider.read(snapshot, 123), code("INVALID_REFERENCE"));
});

test("C08/C16: handles are runtime-opaque and scoped to provider instance", async () => {
  const a = new MemoryDocumentProvider({ d: 1 });
  const b = new MemoryDocumentProvider({ d: 2 });
  const sa = await a.openSnapshot();
  assert.equal(Object.keys(sa).length, 0);
  assert.equal(Object.isFrozen(sa), true);
  assert.equal(await a.read(sa, "d"), 1);
  await assert.rejects(b.read(sa, "d"), code("INVALID_REFERENCE"));
  await assert.rejects(a.read({ ...sa }, "d"), code("INVALID_REFERENCE"));
  await assert.rejects(a.read(Object.create(null), "d"), code("INVALID_REFERENCE"));
  await assert.rejects(a.read(structuredClone(sa), "d"), code("INVALID_REFERENCE"));
  await assert.rejects(a.read(null, "d"), code("INVALID_REFERENCE"));
});

test("C09: provider is read-only, with no writer capability", async () => {
  const provider = new MemoryDocumentProvider({ a: 0 });
  assert.equal("commit" in provider, false);
  assert.equal("write" in provider, false);
  assert.equal(await provider.read(await provider.openSnapshot(), "a"), 0);
});

test("C15 (read-only subset): historical locator is explicit, never silently latest", async () => {
  const provider = new MemoryDocumentProvider({ a: 1 });
  assert.deepStrictEqual(await provider.read(await provider.openSnapshot("initial"), "a"), 1);
  await assert.rejects(provider.openSnapshot("other"), code("SNAPSHOT_UNAVAILABLE"));
  await assert.rejects(provider.openSnapshot(""), code("INVALID_REFERENCE"));
  await assert.rejects(provider.openSnapshot(12), code("INVALID_REFERENCE"));
});

test("C18: invalid JSON is rejected at the constructor boundary", () => {
  const cyclic = {};
  cyclic.self = cyclic;
  const getter = Object.defineProperty({}, "x", { get() { throw Error("Getter executed"); }, enumerable: true });
  const sparse = [, 2];
  const bad = [NaN, Infinity, -Infinity, undefined, 1n, () => {}, Symbol("x"), cyclic, getter, sparse, new Date(), new Map()];
  for (const value of bad) {
    assert.throws(() => new MemoryDocumentProvider({ bad: value }), error => {
      assert.notEqual(error?.message, "Getter executed");
      return ["INVALID_REFERENCE", "RESOURCE_LIMIT"].includes(error?.code);
    });
  }
  assert.throws(() => new MemoryDocumentProvider({ bad: { x: undefined } }), code("INVALID_REFERENCE"));
  const symbolKey = { [Symbol("x")]: "value" };
  assert.throws(() => new MemoryDocumentProvider({ bad: symbolKey }), code("INVALID_REFERENCE"));
  const hidden = Object.defineProperty({}, "x", { value: 2, enumerable: false });
  assert.throws(() => new MemoryDocumentProvider({ bad: hidden }), code("INVALID_REFERENCE"));
});

test("C18: strict JSON accepts own __proto__ data keys without prototype pollution", async () => {
  const obj = JSON.parse('{"__proto__":{"polluted":true},"ok":1}');
  const provider = new MemoryDocumentProvider({ d: obj });
  const read = await provider.read(await provider.openSnapshot(), "d");
  assert.deepStrictEqual(read, obj);
  assert.equal({}.polluted, undefined);
  assert.deepStrictEqual(Object.getPrototypeOf(read), Object.prototype);
});

test("C18: resource bounds reject excessive depth and document count", () => {
  let value = 1;
  for (let i = 0; i < 130; i++) value = { child: value };
  assert.throws(() => new MemoryDocumentProvider({ d: value }), code("RESOURCE_LIMIT"));
  const docs = Object.fromEntries(Array.from({ length: 10_001 }, (_, i) => [String(i), i]));
  assert.throws(() => new MemoryDocumentProvider(docs), code("RESOURCE_LIMIT"));
});

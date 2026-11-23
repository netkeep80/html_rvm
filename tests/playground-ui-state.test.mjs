import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deepEqualJSON, describeDifference } from "../site/operations.js";

test("UX P2-03: object key order is irrelevant, array order remains significant", () => {
  assert.equal(deepEqualJSON({ a: 1, b: { c: 2, d: [1, 2] } },
    { b: { d: [1, 2], c: 2 }, a: 1 }), true);
  assert.equal(describeDifference(
    { a: 1, b: { c: 2, d: [1, 2] } },
    { b: { d: [1, 2], c: 2 }, a: 1 }
  ), "identical");
  assert.equal(deepEqualJSON([1, 2], [2, 1]), false);
  assert.equal(deepEqualJSON(null, {}), false);
  assert.equal(deepEqualJSON({ x: null }, {}), false);
  assert.equal(deepEqualJSON({ x: 0 }, { x: false }), false);
  assert.equal(deepEqualJSON(JSON.parse('{"__proto__":1}'),
    JSON.parse('{"__proto__":1}')), true);
});

let fixtureNumber = 0;
async function createMockBrowser(buildInfo = null) {
  // DOM event harness: exercises the actual site/app.js handler wiring,
  // but is NOT a real Chromium responsive/visual test.
  const html = readFileSync(fileURLToPath(new URL("../site/index.html", import.meta.url)), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);
  const nodes = new Map();
  const downloads = [];
  function element(id = "") {
    const listeners = new Map();
    const classes = new Set();
    return {
      id, value: "", textContent: "", className: "", disabled: false,
      dataset: {}, style: {}, children: [], hidden: false,
      classList: {
        toggle(x, yes) { if (yes === false) classes.delete(x); else classes.add(x); },
        add(x) { classes.add(x); },
        remove(x) { classes.delete(x); },
        contains(x) { return classes.has(x); }
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      async fire(type) {
        if (this.disabled && type === "click") return;
        for (const fn of listeners.get(type) || []) {
          await fn({ currentTarget: this, target: this });
        }
      },
      append(...values) { this.children.push(...values); },
      prepend(...values) { this.children.unshift(...values); },
      replaceChildren() { this.children = []; },
      get lastElementChild() { return this.children.at(-1); },
      remove() {},
      click() { if (this.download) downloads.push(this); }
    };
  }
  for (const id of ids) nodes.set(id, element(id));
  const sampleButtons = ["counter", "cash"].map(key => {
    const b = element(key);
    b.dataset.preset = key;
    return b;
  });
  nodes.get("source-editor").value = JSON.stringify({
    counter: 0, message: "Рабочая копия независима от снимка",
    meta: { version: 1 }, events: []
  }, null, 2);
  nodes.get("pointer-path").value = "/counter";
  nodes.get("increment-amount").value = "1";
  nodes.get("new-value").value = "42";
  const originalGlobals = {
    document: globalThis.document,
    fetch: globalThis.fetch,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    setTimeout: globalThis.setTimeout,
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL
  };
  globalThis.document = {
    getElementById: id => {
      if (!nodes.has(id)) throw Error("Missing mocked DOM id: " + id);
      return nodes.get(id);
    },
    querySelectorAll: selector => selector === "[data-preset]" ? sampleButtons : [],
    createElement: () => element(),
    body: { append() {} }
  };
  globalThis.fetch = async () => buildInfo === null
    ? { ok: false }
    : { ok: true, async json() { return buildInfo; } };
  globalThis.requestAnimationFrame = callback => callback();
  globalThis.setTimeout = () => 0;
  let exportedBlob = null;
  URL.createObjectURL = blob => { exportedBlob = blob; return "blob:mock"; };
  URL.revokeObjectURL = () => {};
  await import("../site/app.js?dom-smoke=" + (++fixtureNumber));

  return {
    $: id => nodes.get(id),
    preset: name => sampleButtons.find(b => b.dataset.preset === name),
    click: async id => nodes.get(id).fire("click"),
    input: async(id, value) => {
      nodes.get(id).value = value;
      await nodes.get(id).fire("input");
    },
    exportContent: async () => exportedBlob ? exportedBlob.text() : null,
    restore() {
      globalThis.document = originalGlobals.document;
      globalThis.fetch = originalGlobals.fetch;
      globalThis.requestAnimationFrame = originalGlobals.requestAnimationFrame;
      globalThis.setTimeout = originalGlobals.setTimeout;
      URL.createObjectURL = originalGlobals.createObjectURL;
      URL.revokeObjectURL = originalGlobals.revokeObjectURL;
    }
  };
}

test("UX P2-01/P2-02: visible unapplied 777 cannot export or be clobbered; preset does not replace active snapshot", async () => {
  const ui = await createMockBrowser();
  try {
    assert.equal(ui.$("snapshot-info").textContent.includes("#1"), true);
    assert.equal(JSON.parse(ui.$("working-editor").value).counter, 0);
    await ui.preset("cash").fire("click");
    assert.equal(ui.$("source-state").textContent.includes("DIRTY"), true);
    assert.equal(ui.$("snapshot-info").textContent.includes("#1"), true);
    assert.equal(JSON.parse(ui.$("working-editor").value).counter, 0);
    assert.equal(ui.$("pointer-path").value, "/counter");
    assert.equal(ui.$("try-plus-one").disabled, true);
    await ui.click("create-snapshot");
    assert.equal(ui.$("snapshot-info").textContent.includes("#2"), true);
    assert.equal(ui.$("pointer-path").value, "/balance");
    assert.equal(JSON.parse(ui.$("working-editor").value).balance, 1000);

    const draft = JSON.parse(ui.$("working-editor").value);
    draft.balance = 777;
    await ui.input("working-editor", JSON.stringify(draft, null, 2));
    assert.equal(ui.$("working-state").textContent.includes("DIRTY"), true);
    for (const id of ["increment", "set-value", "delete-value", "stress", "export-working", "reset-working"]) {
      assert.equal(ui.$(id).disabled, true, id + " must be disabled");
    }
    assert.equal(ui.$("apply-working").disabled, false);
    await ui.click("increment");
    await ui.click("export-working");
    assert.equal(await ui.exportContent(), null);
    assert.equal(JSON.parse(ui.$("working-editor").value).balance, 777);

    await ui.click("discard-working");
    assert.equal(JSON.parse(ui.$("working-editor").value).balance, 1000);
    assert.equal(ui.$("export-working").disabled, false);
    await ui.input("working-editor", JSON.stringify(draft, null, 2));
    await ui.click("apply-working");
    assert.equal(ui.$("working-state").textContent.includes("APPLIED"), true);
    assert.equal(JSON.parse(ui.$("working-editor").value).balance, 777);
    assert.match(ui.$("change-before").textContent, /1000/);
    assert.match(ui.$("change-after").textContent, /777/);
    await ui.click("export-working");
    assert.equal(JSON.parse(await ui.exportContent()).balance, 777);
    assert.equal(ui.$("change-snapshot").textContent.includes("1000"), true);
  } finally { ui.restore(); }
});

test("UX P2-04/P3: quick +1 trace, invalid drafts and failed parse preserve live session", async () => {
  const ui = await createMockBrowser();
  try {
    assert.equal(ui.$("try-plus-one").disabled, false);
    await ui.click("try-plus-one");
    assert.equal(JSON.parse(ui.$("working-editor").value).counter, 1);
    assert.equal(ui.$("change-path").textContent, "/counter");
    assert.equal(ui.$("change-before").textContent, "0");
    assert.equal(ui.$("change-after").textContent, "1");
    assert.equal(ui.$("change-snapshot").textContent, "0");
    assert.match(ui.$("quick-result").textContent, /0 → 1/);

    await ui.input("working-editor", "{ invalid");
    assert.equal(ui.$("working-state").textContent.includes("INVALID"), true);
    assert.equal(ui.$("apply-working").disabled, true);
    assert.equal(ui.$("export-working").disabled, true);
    await ui.click("discard-working");
    assert.equal(JSON.parse(ui.$("working-editor").value).counter, 1);

    await ui.input("source-editor", "{ invalid");
    assert.equal(ui.$("source-state").textContent.includes("INVALID"), true);
    assert.equal(ui.$("create-snapshot").disabled, true);
    assert.equal(ui.$("snapshot-info").textContent.includes("#1"), true);
    assert.equal(JSON.parse(ui.$("working-editor").value).counter, 1);
  } finally { ui.restore(); }
});

test("VERS UI: renders exact build-info XX.YY in topbar and footer", async () => {
  const commit = "f".repeat(40);
  const ui = await createMockBrowser({ version: "01.04", commit, branch: "main", preview: true });
  try {
    assert.equal(ui.$("product-version").textContent, "Версия 01.04");
    assert.equal(ui.$("build-version").textContent, "Версия 01.04 · HEAD ffffffffffff");
    await ui.click("try-plus-one");
    assert.equal(ui.$("product-version").textContent, "Версия 01.04");
  } finally { ui.restore(); }
});

test("VERS UI: missing or invalid build metadata never shows a guessed version", async () => {
  const missing = await createMockBrowser();
  try {
    assert.equal(missing.$("product-version").textContent, "Версия недоступна");
    assert.equal(missing.$("build-version").textContent, "Версия недоступна");
  } finally { missing.restore(); }
  const invalid = await createMockBrowser({ version: "99", commit: "f".repeat(40), branch: "main" });
  try {
    assert.equal(invalid.$("product-version").textContent, "Версия недоступна");
    assert.equal(invalid.$("build-version").textContent, "Версия недоступна");
  } finally { invalid.restore(); }
});

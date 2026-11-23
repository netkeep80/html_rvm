import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = p => readFileSync(resolve(root, p), "utf8");
const reqDir = resolve(root, "requirements");
const files = readdirSync(reqDir).filter(name => name.endsWith(".rg.yaml")).sort();

function parseRequirement(name) {
  const text = read("requirements/" + name);
  const id = text.match(/^id:\s*(HRVM-[A-Z]+(?:-[A-Z]+)*-[0-9]{3})\s*$/m)?.[1];
  assert.ok(id, "missing/invalid ID: " + name);
  assert.equal(name, id + ".rg.yaml");
  const line = text.split("\n").find(x => x.startsWith("normative: "));
  assert.ok(line, "missing normative: " + id);
  const normative = JSON.parse(line.slice("normative: ".length));
  return { id, text, normative };
}
const requirements = files.map(parseRequirement);
const byId = new Map(requirements.map(r => [r.id, r]));

const acceptedS0 = new Set([
  "HRVM-ADAPT-001","HRVM-ARCH-001","HRVM-BOOT-001","HRVM-CASE-001",
  "HRVM-LICENSE-001","HRVM-PERSIST-001","HRVM-PORT-001","HRVM-PRODUCT-000",
  "HRVM-PROJECT-000","HRVM-READ-001","HRVM-REF-001","HRVM-SEC-001",
  "HRVM-SNAP-001","HRVM-TEST-001","HRVM-WORK-001","HRVM-WRITE-001"
]);
const normalizedCandidates = new Set([
  "HRVM-GOAL-001","HRVM-GOAL-002","HRVM-GOAL-003",
  "HRVM-USER-001","HRVM-USER-002","HRVM-USER-003","HRVM-USER-004",
  "HRVM-PORT-READER-001","HRVM-PORT-WRITER-001","HRVM-PORT-DATA-001",
  "HRVM-PORT-BOUNDARY-001","HRVM-PORT-JSON-001","HRVM-PORT-VERSION-001",
  "HRVM-WRITE-CAP-001","HRVM-WRITE-TRIGGER-001","HRVM-WRITE-ATOMIC-001",
  "HRVM-WRITE-FAIL-001","HRVM-WRITE-SCOPE-001",
  "HRVM-PERSIST-INTENT-001","HRVM-PERSIST-NEUTRAL-001","HRVM-PERSIST-AUTH-001",
  "HRVM-PERSIST-FAIL-001","HRVM-PERSIST-HISTORY-001","HRVM-PERSIST-DBMS-001",
  "HRVM-REF-IDENTITY-001","HRVM-REF-PATH-001","HRVM-REF-CONTEXT-001",
  "HRVM-REF-READ-001","HRVM-REF-WORK-001","HRVM-REF-KINDS-001","HRVM-REF-DBMS-001","HRVM-REF-LIMIT-001",
  "HRVM-TEST-POLARITY-001","HRVM-TEST-READ-001","HRVM-TEST-WRITE-001","HRVM-TEST-CAP-001",
  "HRVM-TEST-PARITY-001","HRVM-TEST-EVIDENCE-001","HRVM-TEST-MATRIX-001",
  "HRVM-TEST-WORK-001","HRVM-TEST-PERSIST-001",
  "HRVM-REQ-PRIORITY-001","HRVM-REQ-VERIFY-001",
  "HRVM-REQ-GLOSSARY-001","HRVM-REQ-AUDIT-001"
]);

test("REQ-NORM: legacy accepted authority is preserved and normalized graph stays candidate", () => {
  assert.equal(requirements.length, 62);
  for (const id of acceptedS0) {
    const r = byId.get(id);
    assert.ok(r, id);
    assert.match(r.text, /lifecycle: \{ accepted: true, current: true, published: false \}/);
  }
  assert.match(byId.get("HRVM-VERSION-001").text,
    /lifecycle: \{ accepted: false, current: false, published: false \}/);
  assert.equal(normalizedCandidates.size, 45);
  for (const id of normalizedCandidates) {
    const r = byId.get(id);
    assert.ok(r, "missing normalized candidate " + id);
    assert.match(r.text, /lifecycle: \{ accepted: false, current: false, published: false \}/);
    assert.equal((r.normative.match(/\bMUST\b/g) || []).length, 1,
      id + " must contain one normative MUST");
    assert.equal((r.normative.match(/\b(?:SHOULD|MAY)\b/g) || []).length, 0,
      id + " must not bundle a second priority/modal statement");
  }
});

test("REQ-NORM: priority sidecar explicitly covers every native Requirement exactly once", () => {
  const data = JSON.parse(read("requirements/metadata/priority-map.json"));
  assert.equal(data.schema, "html-rvm/requirement-priority-v1");
  const allowed = new Set(["MUST_FOR_NEXT_STAGE","SHOULD","LATER"]);
  const priorityIds = Object.keys(data.priorities).sort();
  const requirementIds = [...byId.keys()].sort();
  assert.deepStrictEqual(priorityIds, requirementIds);
  for (const [id, priority] of Object.entries(data.priorities)) {
    assert.ok(allowed.has(priority), id + " has invalid priority " + priority);
  }
});

test("REQ-NORM: legacy-to-atomic mapping covers five audited compound Requirements without overlap", () => {
  const data = JSON.parse(read("requirements/metadata/legacy-to-atomic.json"));
  assert.equal(data.schema, "html-rvm/legacy-to-atomic-v1");
  assert.deepStrictEqual(Object.keys(data.legacy).sort(), [
    "HRVM-PERSIST-001","HRVM-PORT-001","HRVM-REF-001","HRVM-TEST-001","HRVM-WRITE-001"
  ]);
  const all = Object.values(data.legacy).flat();
  assert.equal(new Set(all).size, all.length, "atomic child mapped from more than one legacy Requirement");
  for (const [legacy, children] of Object.entries(data.legacy)) {
    assert.ok(acceptedS0.has(legacy), legacy + " must be accepted legacy authority");
    assert.ok(children.length >= 5, legacy + " should actually be decomposed");
    for (const id of children) {
      assert.ok(normalizedCandidates.has(id), id + " is not normalized candidate");
      assert.ok(byId.get(id).text.includes("id: " + legacy),
        id + " must derive from " + legacy);
    }
  }
});

test("REQ-NORM: new GOAL -> USER -> atomic graph has explicit upward trace", () => {
  for (const id of ["HRVM-GOAL-001","HRVM-GOAL-002","HRVM-GOAL-003"]) {
    assert.doesNotMatch(byId.get(id).text, /predicates: \[ derives_from \]/);
  }
  for (const id of ["HRVM-USER-001","HRVM-USER-002","HRVM-USER-003","HRVM-USER-004"]) {
    assert.match(byId.get(id).text, /kind: requirement, id: HRVM-GOAL-/);
  }
  for (const id of [...normalizedCandidates].filter(id =>
    /^HRVM-(?:PORT|WRITE|PERSIST|REF|TEST)-/.test(id))) {
    const text = byId.get(id).text;
    assert.match(text, /predicates: \[ derives_from \]/, id);
    assert.match(text, /kind: requirement, id: HRVM-/, id);
  }
});

test("REQ-NORM: verified_by is deliberately sparse in candidate atomics, never a topic tag", () => {
  const allowed = new Map([
    ["HRVM-PORT-READER-001","tests/bootstrap-contract.test.mjs"],
    ["HRVM-PORT-WRITER-001","tests/bootstrap-contract.test.mjs"],
    ["HRVM-PORT-BOUNDARY-001","tests/bootstrap-contract.test.mjs"],
    ["HRVM-REQ-PRIORITY-001","tests/requirements-normalization.test.mjs"]
  ]);
  for (const id of normalizedCandidates) {
    const text = byId.get(id).text;
    const hits = [...text.matchAll(/predicates: \[ verified_by \]\n\s+target: \{ kind: artifact, path: "([^"]+)" \}/g)]
      .map(m => m[1]);
    if (allowed.has(id)) assert.deepStrictEqual(hits, [allowed.get(id)], id);
    else assert.deepStrictEqual(hits, [], id + " must not claim partial executable evidence");
  }
});

test("REQ-NORM: glossary defines every ambiguity class called out by audit", () => {
  const glossary = read("docs/GLOSSARY.md");
  for (const term of [
    "trusted host","minimal authority","consistent snapshot","immutable snapshot",
    "verified snapshot","PersistenceIntent","ChangeRequest","alias normalization",
    "resource bound","current main snapshot/head","capability","verified_by"
  ]) assert.ok(glossary.includes("**" + term + "**"), "missing glossary term " + term);
  assert.match(glossary, /конкретный machine error code задаётся отдельным требованием/);
});

test("REQ-NORM: method records Wiegers-style quality gate and non-automatic acceptance", () => {
  const doc = read("docs/REQUIREMENTS-NORMALIZATION.md");
  for (const word of [
    "complete","correct/source-backed","feasible","necessary","prioritized",
    "unambiguous","verifiable","consistent","modifiable","traceable"
  ]) assert.ok(doc.includes(word), "missing quality criterion " + word);
  assert.match(doc, /не меняет authority/);
  assert.match(doc, /не supersedes/);
  assert.match(doc, /Нельзя выводить acceptance из CI\/merge/);
});


test("REQ-NORM audit delta: semantic-preservation regressions stay closed", () => {
  assert.doesNotMatch(byId.get("HRVM-PORT-READER-001").normative, /объявлять только операции/);
  assert.match(byId.get("HRVM-WRITE-ATOMIC-001").normative, /к существующим документам/);
  assert.match(byId.get("HRVM-REF-CONTEXT-001").normative, /\$ent/);
  assert.match(byId.get("HRVM-REF-CONTEXT-001").normative, /\$sub/);
  assert.match(byId.get("HRVM-REF-CONTEXT-001").normative, /\$rel/);
  assert.match(byId.get("HRVM-REF-CONTEXT-001").normative, /\$obj/);
  assert.match(byId.get("HRVM-REF-CONTEXT-001").normative, /родительские контексты/);
  assert.match(byId.get("HRVM-REF-LIMIT-001").normative, /циклы/);
  assert.match(byId.get("HRVM-REF-LIMIT-001").normative, /чрезмерную глубину/);
  assert.doesNotMatch(byId.get("HRVM-REF-LIMIT-001").normative, /RESOURCE_LIMIT/);
  assert.match(byId.get("HRVM-TEST-POLARITY-001").normative, /позитивные и негативные/);
  assert.match(byId.get("HRVM-TEST-CAP-001").normative, /ограничения capability/);
  assert.doesNotMatch(byId.get("HRVM-TEST-PERSIST-001").normative, /нейтральн/);
  for (const id of ["HRVM-REQ-AUDIT-001","HRVM-REQ-GLOSSARY-001","HRVM-REQ-VERIFY-001"]) {
    assert.doesNotMatch(byId.get(id).text, /predicates: \[ verified_by \]/, id);
  }
});

test("REQ-NORM: one-MUST check is explicitly only a syntactic guard", () => {
  const doc = read("docs/REQUIREMENTS-NORMALIZATION.md");
  assert.match(doc, /синтаксический guard/);
  assert.match(doc, /один `MUST` сам по себе не гарантирует/);
});

test("REQ-NORM: root GOALs have explicit stakeholder/source-backing artifact", () => {
  const vision = read("docs/PRODUCT-VISION.md");
  assert.match(vision, /Issue #1 — BOOT-001/);
  assert.match(vision, /Issue #3 — S1-RESEARCH/);
  assert.match(vision, /BOOTSTRAP-ACCEPTANCE\.md/);
  for (const id of ["HRVM-GOAL-001","HRVM-GOAL-002","HRVM-GOAL-003"]) {
    assert.match(byId.get(id).text, /docs\/PRODUCT-VISION\.md/, id);
  }
});

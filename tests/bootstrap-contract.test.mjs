import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (p) => readFileSync(resolve(root, p), "utf8");

// Structural guardrails only. These are NOT executable DocumentPort conformance
// tests, not a proof of runtime isolation, and not a replacement for RepoGuard.
test("document port exports neutral interface and optional writer", () => {
  const src = read("ports/document-port.d.ts");
  assert.match(src, /interface DocumentReader/);
  assert.match(src, /openSnapshot\(reference\?: string\)/);
  assert.match(src, /read\(snapshot: SnapshotHandle, documentId: DocumentId\)/);
  assert.doesNotMatch(src, /read\(snapshot: SnapshotHandle, documentId: DocumentId, pointer/);
  assert.match(src, /interface DocumentWriter/);
  assert.match(src, /commit\(/);
  for (const forbidden of ["HTML_DBMS", "HTMLDBMSCore", "AES-GCM", "ID,H", "$sub", "$rel"]) {
    assert.equal(src.includes(forbidden), false, "non-neutral token in port: " + forbidden);
  }
});

function checkRuntimeBoundary(text) {
  return !/(?:from\s*["'][^"']*(?:html_dbms|html-dbms)|import\s*\(\s*["'][^"']*(?:html_dbms|html-dbms)|require\s*\(\s*["'][^"']*(?:html_dbms|html-dbms))/i.test(text);
}

test("negative witness: direct DBMS import in core is rejected", () => {
  assert.equal(checkRuntimeBoundary("import { core } from 'html_dbms'"), false);
  assert.equal(checkRuntimeBoundary("const x = await import('../html-dbms/core.js')"), false);
  assert.equal(checkRuntimeBoundary("export const relation = (a,b) => [a,b]"), true);
});

test("source boundary excludes dbms imports outside the optional adapter", () => {
  const dirs = ["src", "ports"];
  const files = [];
  function visit(p) {
    if (!existsSync(resolve(root, p))) return;
    for (const ent of readdirSync(resolve(root, p), { withFileTypes: true })) {
      const target = p + "/" + ent.name;
      if (ent.isDirectory()) {
        if (target.replaceAll("\\", "/").includes("adapters/html-dbms")) continue;
        visit(target);
      } else if (ent.isFile() && /\.(?:ts|mts|js|mjs)$/.test(ent.name)) files.push(target);
    }
  }
  dirs.forEach(visit);
  for (const p of files) assert.ok(checkRuntimeBoundary(read(p)), "forbidden DBMS import: " + p);
});

test("RepoGuard immutable release SHA and exact PR refs present", () => {
  const workflow = read(".github/workflows/ci.yml");
  const pin = "74db97791e6da8a75287164f0d0b41579108f114";
  assert.ok(workflow.includes("netkeep80/repo-guard@" + pin));
  assert.ok(workflow.includes("github.event.pull_request.base.sha"));
  assert.ok(workflow.includes("github.event.pull_request.head.sha"));
  assert.ok(workflow.includes("fetch-depth: 0"));
});

test("canonical requirement IDs, document links and recorded S0 lifecycle exist", () => {
  const reqdir = resolve(root, "requirements");
  const paths = readdirSync(reqdir).filter(p => p.endsWith(".rg.yaml"));
  assert.ok(paths.length >= 16, "at least the 16 author-approved S0 requirements");
  const ids = new Set();
  let acceptedCurrent = 0;
  let acceptedHistorical = 0;
  let otherCandidates = 0;
  for (const name of paths) {
    const content = read("requirements/" + name);
    const id = content.match(/^id:\s*(HRVM-[A-Z]+(?:-[A-Z]+)*-\d{3})\s*$/m)?.[1];
    assert.ok(id, "missing ID " + name);
    assert.equal(ids.has(id), false);
    ids.add(id);
    assert.equal(name, id + ".rg.yaml");
    assert.match(content, /^format: repo-guard\/requirement-v1$/m);
    // Checks recorded lifecycle, NOT factual approval by a CI runner.
    // Proposed REQ-AUTH lifecycle; historical acceptance stays recorded.
    // Actual author acceptance is a separate external gate.
    if (/accepted: true/.test(content)) {
      if (/current: true/.test(content)) acceptedCurrent++;
      else { assert.match(content, /current: false/); acceptedHistorical++; }
    } else {
      otherCandidates++;
      assert.match(content, /accepted: false/);
      assert.match(content, /current: false/);
    }
    assert.match(content, /published: false/);
    for (const match of content.matchAll(/kind: artifact, path: "([^"]+)"/g)) {
      assert.ok(existsSync(resolve(root, match[1])), id + " target missing: " + match[1]);
    }
  }
  assert.equal(paths.length, 62);
  assert.equal(acceptedCurrent, 45);
  assert.equal(acceptedHistorical, 5);
  assert.equal(otherCandidates, 12);
  assert.ok(ids.has("HRVM-VERSION-001"), "versioning requirement is a candidate");
  assert.ok(ids.has("HRVM-PRODUCT-000"));
  assert.ok(ids.has("HRVM-PROJECT-000"));
  assert.ok(ids.has("HRVM-WORK-001"));
  assert.ok(ids.has("HRVM-PERSIST-001"));
  assert.match(read("docs/BOOTSTRAP-ACCEPTANCE.md"), /7103952294/);
  for (const name of paths) {
    const content = read("requirements/" + name);
    for (const target of content.matchAll(/kind: requirement, id: (HRVM-[A-Z]+(?:-[A-Z]+)*-\d{3})/g)) {
      assert.ok(ids.has(target[1]), "unresolved requirement " + target[1]);
    }
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { buildPages } from "../tools/build-pages.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const file = relative => readFileSync(resolve(root, relative), "utf8");

test("Pages S1A UI and visible version badge use relative static assets", () => {
  const html = file("site/index.html");
  assert.match(html, /lang="ru"/);
  assert.match(html, /S1A · TEST LAB/);
  assert.match(html, /id="product-version"/);
  assert.match(html, /id="build-version"/);
  assert.match(html, /Текущая версия HTML RVM/);
  assert.match(html, /href="https:\/\/github.com\/netkeep80\/html_rvm\/tree\/main\/site"/);
  for (const id of ["try-plus-one", "quick-result", "source-state", "working-state",
    "snapshot-info", "discard-working", "change-before", "change-after", "change-snapshot"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /Входной JSON/);
  assert.match(html, /Перезагрузка страницы удалит все изменения/);
  const css = file("site/styles.css");
  assert.match(css, /@media\(max-width:340px\)/);
  assert.match(css, /\.topbar-right a \{ display: none; \}/);
  assert.match(css, /\.pill-version/);
  assert.match(css, /\.topbar-right \.pill-amber \{ display: none; \}/);
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /src="\.\/app\.js"/);
  for (const id of [
    "source-editor", "working-editor", "create-snapshot", "apply-working",
    "reset-working", "increment", "stress", "set-value",
    "delete-value", "verify", "export-working", "status-line"
  ]) assert.match(html, new RegExp('id="' + id + '"'));
  assert.doesNotMatch(html, /<script[^>]+src="https?:\/\//i);
});

test("Pages controller does not import DBMS, exec user JS or silently persist", () => {
  const app = file("site/app.js");
  const ops = file("site/operations.js");
  assert.match(app, /\.\.\/src\/memory-document-provider\.js/);
  assert.match(app, /\.\.\/src\/working-session\.js/);
  assert.match(ops, /\.\.\/src\/strict-json\.js/);
  for (const content of [app, ops]) {
    assert.doesNotMatch(content, /\b(?:eval|localStorage|sessionStorage|indexedDB)\s*\(/);
    assert.doesNotMatch(content, /(?:from|import)\s*\(?\s*["'][^"']*(?:html_dbms|html-dbms)/i);
    assert.doesNotMatch(content, /\.innerHTML\s*=/);
  }
  assert.match(app, /downloadJSON\(\)/);
  assert.match(app, /createWorkingSession\(/);
  assert.match(app, /info\.version/);
  assert.match(app, /\$\("product-version"\)\.textContent/);
});

test("Pages artifact includes all modules, exact version marker and root redirect", () => {
  const temp = mkdtempSync(join(tmpdir(), "rvm-pages-"));
  try {
    const out = join(temp, "dist");
    const commit = "a".repeat(40);
    const result = buildPages(out, { commit, branch: "main", version: "01.04" });
    assert.equal(result.files.length, 19);
    assert.ok(result.files.includes("site/mo-visual-graph.js"));
    for (const relative of result.files) assert.equal(existsSync(join(out, relative)), true, relative);
    assert.match(readFileSync(join(out, "index.html"), "utf8"), /url=\.\/site\//);
    const meta = JSON.parse(readFileSync(join(out, "site/build-info.json"), "utf8"));
    assert.deepStrictEqual(meta, { commit, branch: "main", preview: true, version: "01.04" });
    assert.equal(readFileSync(join(out, "VERSION"), "utf8"), "01.04\n");
    assert.equal(readFileSync(join(out, "site/app.js"), "utf8"), file("site/app.js"));
    assert.equal(readFileSync(join(out, "src/working-session.js"), "utf8"), file("src/working-session.js"));
    assert.throws(() => buildPages(join(temp, "invalid"), { commit, branch: "main" }),
      /requires a valid Git-derived XX\.YY version/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("Pages workflow deploys main only after tests and uses pinned actions", () => {
  const workflow = file(".github/workflows/pages-preview.yml");
  assert.match(workflow, /branches: \[main\]/);
  assert.doesNotMatch(workflow, /\n\s+paths:\s*\n/);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /needs: test-build/);
  assert.match(workflow, /environment:\s*\n\s+name: github-pages/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /actions\/deploy-pages@[a-f0-9]{40}/);
  assert.match(workflow, /actions\/upload-pages-artifact@[a-f0-9]{40}/);
  assert.match(workflow, /actions\/configure-pages@[a-f0-9]{40}/);
  assert.match(workflow, /node tools\/build-pages\.mjs/);
  assert.match(workflow, /node tools\/version\.mjs/);
  assert.match(workflow, /npm test/);
});

test("Browser JS parses as native modules without npm dependencies", () => {
  for (const path of [
    "site/app.js", "site/operations.js", "src/memory-document-provider.js",
    "src/strict-json.js", "src/working-session.js", "tools/build-pages.mjs", "tools/version.mjs"
  ]) assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", resolve(root, path)]));
});

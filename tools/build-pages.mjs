import {
  mkdirSync, copyFileSync, writeFileSync, rmSync
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMainVersion } from "./version.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const regressionFiles = [
  "site/index.html", "site/styles.css", "site/app.js", "site/operations.js",
  "src/document-port-error.js", "src/strict-json.js",
  "src/memory-document-provider.js", "src/working-session.js",
  "site/mo-studio.html", "site/mo-studio.css", "site/mo-studio.js", "site/mo-studio-ui.js", "site/mo-visual-graph.js", "site/mo-projection-sync.js", "site/mo-transition-observer.js",
  "src/mo-core.js", "src/mo-json.js", "src/mo-reference.js",
  "site/unified-studio.html", "site/unified-studio.css", "site/unified-studio.js", "site/unified-session.js",
  "research/pc1/j1-natural-json.mjs", "research/pc1/e1-witness.mjs"
];

/** Create an inert static artifact; never run user-supplied JavaScript. */
export function buildPages(output = resolve(root, "dist"), metadata = {}) {
  const destination = resolve(output);
  if (destination === resolve(root) || resolve(root).startsWith(destination + "/")) {
    throw Error("Pages destination must not overwrite the repository");
  }
  rmSync(destination, { recursive: true, force: true });
  // Historical screens are packaged only for the retained regression harness,
  // never by the production CLI. Public old routes are redirect stubs.
  const legacy = metadata.legacyRegression === true;
  const testOnly = new Set(["site/index.html","site/styles.css","site/app.js","site/operations.js","site/mo-studio.html","site/mo-studio.css","site/mo-studio.js","site/mo-studio-ui.js","site/mo-visual-graph.js","site/mo-transition-observer.js"]);
  const staticFiles = legacy ? regressionFiles : regressionFiles.filter(file => !testOnly.has(file));
  for (const file of staticFiles) {
    const target = join(destination, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolve(root, file), target);
  }
  const commit = /^[0-9a-f]{40}$/.test(metadata.commit ?? "") ? metadata.commit : null;
  const version = metadata.version;
  if (typeof version !== "string" || !/^[0-9]{2}\.[0-9]{2}$/.test(version) || version.startsWith("00.")) {
    throw Error("Pages build requires a valid Git-derived XX.YY version; no invented fallback");
  }
  mkdirSync(join(destination, "site"), { recursive: true });
  writeFileSync(join(destination, "site", "build-info.json"),
    JSON.stringify({ commit, branch: metadata.branch ?? "local", preview: true, version }) + "\n");
  writeFileSync(join(destination, "VERSION"), version + "\n");
  function redirect(url) {
    return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url='+url+'"><title>HTML RVM — MO Studio</title></head><body><a href="'+url+'">Открыть MO Studio</a></body></html>\n';
  }
  const routes = [];
  if (!legacy) {
    for (const name of ["site/index.html","site/mo-studio.html"]) {
      writeFileSync(join(destination,name),redirect("./unified-studio.html"));
      routes.push(name);
    }
  }
  writeFileSync(join(destination,"index.html"),redirect(legacy?"./site/":"./site/unified-studio.html"));
  return {destination,files:[...staticFiles,...routes,"site/build-info.json","VERSION","index.html"]};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.env.RVM_PAGES_DIST || resolve(root, "dist");
  // Derive version from exact MAIN Git history. No manual YY edits, no network.
  const resolved = resolveMainVersion(process.env.GITHUB_SHA ?? "HEAD");
  const result = buildPages(output, {
    commit: resolved.commit,
    version: resolved.version,
    branch: process.env.GITHUB_REF_NAME ?? "local"
  });
  process.stdout.write("Pages artifact: " + result.destination + " (" + result.files.length + " files)\n");
}

import {
  mkdirSync, copyFileSync, writeFileSync, rmSync
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const staticFiles = [
  "site/index.html", "site/styles.css", "site/app.js", "site/operations.js",
  "src/document-port-error.js", "src/strict-json.js",
  "src/memory-document-provider.js", "src/working-session.js"
];

/** Create an inert static artifact; never run user-supplied JavaScript. */
export function buildPages(output = resolve(root, "dist"), metadata = {}) {
  const destination = resolve(output);
  if (destination === resolve(root) || resolve(root).startsWith(destination + "/")) {
    throw Error("Pages destination must not overwrite the repository");
  }
  rmSync(destination, { recursive: true, force: true });
  for (const file of staticFiles) {
    const target = join(destination, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolve(root, file), target);
  }
  const commit = /^[0-9a-f]{40}$/.test(metadata.commit ?? "") ? metadata.commit : null;
  mkdirSync(join(destination, "site"), { recursive: true });
  writeFileSync(join(destination, "site", "build-info.json"),
    JSON.stringify({ commit, branch: metadata.branch ?? "local", preview: true }) + "\n");
  writeFileSync(join(destination, "index.html"),
    '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=./site/"><title>HTML RVM — JSON Lab</title></head><body><a href="./site/">Открыть HTML RVM JSON Lab</a></body></html>\n');
  return { destination, files: [...staticFiles, "site/build-info.json", "index.html"] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.env.RVM_PAGES_DIST || resolve(root, "dist");
  const result = buildPages(output, {
    commit: process.env.GITHUB_SHA ?? null,
    branch: process.env.GITHUB_REF_NAME ?? "local"
  });
  process.stdout.write("Pages artifact: " + result.destination + " (" + result.files.length + " files)\n");
}

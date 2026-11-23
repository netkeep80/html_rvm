import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const shaRegex = /^[0-9a-f]{40}$/;

export function formatVersion(architecture, revision) {
  if (!Number.isInteger(architecture) || architecture < 1 || architecture > 99 ||
      !Number.isInteger(revision) || revision < 0 || revision > 99) {
    throw Error("XX.YY range exceeded: explicit author decision required");
  }
  return String(architecture).padStart(2, "0") + "." + String(revision).padStart(2, "0");
}

export function validateVersionPolicy(policy) {
  if (!policy || policy.schema !== "html-rvm/version-policy-v1" ||
      policy.count !== "first-parent-two-parent-merges-after-architecture-baseline" ||
      policy.width !== 2 || !shaRegex.test(policy.acceptedArchitectureMerge) ||
      !Number.isInteger(policy.architecture) ||
      policy.architecture < 1 || policy.architecture > 99) {
    throw Error("Invalid version policy or accepted architecture baseline");
  }
  return policy;
}

export function parseFirstParentHistory(output) {
  if (typeof output !== "string" || !output.trim()) {
    throw Error("Missing Git history: checkout must use fetch-depth: 0");
  }
  return output.trim().split(/\r?\n/).map(line => {
    const [sha, ...parents] = line.trim().split(/\s+/);
    if (!shaRegex.test(sha) || !parents.every(p => shaRegex.test(p))) {
      throw Error("Malformed Git commit history");
    }
    return { sha, parents };
  });
}

/**
 * XX.00 is the author-accepted architecture baseline merge.
 * Every ordinary two-parent first-parent merge in MAIN after baseline is +1.
 * Direct main changes, squash/rebase and incomplete history fail closed.
 */
export function deriveVersion(policyInput, history, exactHead) {
  const policy = validateVersionPolicy(policyInput);
  if (!shaRegex.test(exactHead) || !Array.isArray(history) ||
      history.length < 1 || history[0].sha !== exactHead) {
    throw Error("Version history must begin at exact requested HEAD");
  }
  const seen = new Set();
  let count = 0;
  for (let i = 0; i < history.length; i++) {
    const { sha, parents } = history[i];
    if (!shaRegex.test(sha) || !Array.isArray(parents) ||
        !parents.every(p => shaRegex.test(p)) || seen.has(sha)) {
      throw Error("Invalid or duplicated first-parent Git history");
    }
    seen.add(sha);
    if (sha === policy.acceptedArchitectureMerge) {
      return Object.freeze({
        architecture: policy.architecture,
        revision: count,
        version: formatVersion(policy.architecture, count),
        baseline: policy.acceptedArchitectureMerge,
        commit: exactHead
      });
    }
    if (parents.length !== 2) {
      throw Error("Unversioned main change " + sha + ": expected two-parent merge");
    }
    if (count === 99) throw Error("YY overflow: explicit author decision required");
    count++;
    if (!history[i + 1] || parents[0] !== history[i + 1].sha) {
      throw Error("Incomplete or inconsistent first-parent history; fetch-depth: 0 required");
    }
  }
  throw Error("Accepted architecture baseline not found in first-parent history");
}

export function readVersionPolicy() {
  return validateVersionPolicy(JSON.parse(readFileSync(resolve(root, "version-policy.json"), "utf8")));
}

export function resolveMainVersion(ref = "HEAD") {
  const head = execFileSync("git", ["rev-parse", "--verify", ref + "^{commit}"], {
    cwd: root, encoding: "utf8"
  }).trim();
  if (!shaRegex.test(head)) throw Error("Invalid Git HEAD");
  const stdout = execFileSync("git", ["rev-list", "--first-parent", "--parents", head], {
    cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024
  });
  return deriveVersion(readVersionPolicy(), parseFirstParentHistory(stdout), head);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = resolveMainVersion(process.env.GITHUB_SHA || "HEAD");
    process.stdout.write(result.version + " (HEAD " + result.commit + ")\n");
  } catch (error) {
    process.stderr.write("Version calculation failed: " + error.message + "\n");
    process.exitCode = 1;
  }
}

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatVersion, validateVersionPolicy, parseFirstParentHistory,
  deriveVersion, readVersionPolicy
} from "../tools/version.mjs";

const sha = number => number.toString(16).padStart(40, "0");
const BASELINE = "406577bcf06b2c43cccbc2ef664fad875668136b";
const MERGE5 = "08c8d4d5600b4a05ca48af7eb4516dc6102b08f7";
const MERGE6 = "5105eeb7ac87e35a3dd478e2ed9e0fd15a990bf7";
const policy = readVersionPolicy();
const firstParentHistory = [
  { sha: MERGE6, parents: [MERGE5, "79ef5e72f24b996f1ac7eab941e02e64fd080385"] },
  { sha: MERGE5, parents: [BASELINE, "6b817eabe2ab584a5823ff8997896b3ede0c5b17"] },
  { sha: BASELINE, parents: ["fc60a877840c76f64b182ad404d139ef6e22b6ed", "97130766488bcfcfc87018157c606ebb95420fe1"] }
];

test("VERS: policy is anchored to first accepted architecture merge", () => {
  assert.equal(policy.architecture, 1);
  assert.equal(policy.acceptedArchitectureMerge, BASELINE);
  assert.equal(policy.width, 2);
  assert.equal(formatVersion(1, 0), "01.00");
  assert.equal(formatVersion(1, 2), "01.02");
  assert.equal(formatVersion(99, 99), "99.99");
  for (const args of [[0, 1], [100, 0], [1, 100], [1, -1], [1, 1.5], ["1", 1]]) {
    assert.throws(() => formatVersion(...args));
  }
  assert.throws(() => validateVersionPolicy({ ...policy, acceptedArchitectureMerge: "" }));
});

test("VERS: real accepted main first-parent chain gives 01.00 then 01.01 and 01.02", () => {
  assert.equal(deriveVersion(policy, firstParentHistory.slice(2), BASELINE).version, "01.00");
  assert.equal(deriveVersion(policy, firstParentHistory.slice(1), MERGE5).version, "01.01");
  const current = deriveVersion(policy, firstParentHistory, MERGE6);
  assert.equal(current.version, "01.02");
  assert.equal(current.revision, 2);
  assert.equal(current.commit, MERGE6);
  const NEXT = sha(2026);
  assert.equal(deriveVersion(policy,
    [{ sha: NEXT, parents: [MERGE6, sha(909)] }, ...firstParentHistory], NEXT
  ).version, "01.03");
});

test("VERS: Git rev-list format accepts two-parent merges, rejects corruption", () => {
  const source = firstParentHistory.map(c => [c.sha, ...c.parents].join(" ")).join("\n");
  assert.deepStrictEqual(parseFirstParentHistory(source), firstParentHistory);
  for (const sourceText of ["", "invalid", "notsha " + sha(3), sha(2) + " bogus"]) {
    assert.throws(() => parseFirstParentHistory(sourceText));
  }
});

test("VERS: missing baseline, shallow history, foreign HEAD or non-merge change fail closed", () => {
  assert.throws(() => deriveVersion(policy, firstParentHistory.slice(0, 2), MERGE6), /baseline|history/i);
  assert.throws(() => deriveVersion(policy, firstParentHistory, sha(87)), /HEAD/);
  const DIRECT = sha(12);
  assert.throws(() => deriveVersion(policy,
    [{ sha: DIRECT, parents: [MERGE6] }, ...firstParentHistory], DIRECT
  ), /Unversioned main change/);
  const OCTOPUS = sha(13);
  assert.throws(() => deriveVersion(policy,
    [{ sha: OCTOPUS, parents: [MERGE6, sha(55), sha(56)] }, ...firstParentHistory], OCTOPUS
  ), /Unversioned main change/);
  const BROKEN = sha(14);
  assert.throws(() => deriveVersion(policy,
    [{ sha: BROKEN, parents: [sha(999), sha(44)] }, ...firstParentHistory], BROKEN
  ), /Incomplete|inconsistent/);
});

test("VERS: more than 99 compatible merge increments require explicit architecture decision", () => {
  let parent = BASELINE;
  const history = [{ sha: BASELINE, parents: [sha(10), sha(11)] }];
  for (let i = 1; i <= 100; i++) {
    const s = sha(i);
    history.unshift({ sha: s, parents: [parent, sha(500 + i)] });
    parent = s;
  }
  assert.equal(deriveVersion(policy, history.slice(1), sha(99)).version, "01.99");
  assert.throws(() => deriveVersion(policy, history, sha(100)), /overflow/);
});

test("VERS: an actual Git first-parent merge is counted exactly once", () => {
  const dir = mkdtempSync(join(tmpdir(), "html-rvm-git-version-"));
  const git = (...args) => execFileSync("git", args, {
    cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  }).trim();
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.name", "Version Test");
    git("config", "user.email", "version@example.invalid");
    writeFileSync(join(dir, "a"), "0");
    git("add", ".");
    git("commit", "-qm", "seed");
    git("checkout", "-qb", "architecture");
    writeFileSync(join(dir, "b"), "arch");
    git("add", ".");
    git("commit", "-qm", "accepted architecture");
    git("checkout", "-q", "main");
    git("merge", "-q", "--no-ff", "architecture", "-m", "accept XX=01");
    const baseline = git("rev-parse", "HEAD");
    git("checkout", "-qb", "feature");
    writeFileSync(join(dir, "c"), "feature");
    git("add", ".");
    git("commit", "-qm", "feature work");
    git("checkout", "-q", "main");
    git("merge", "-q", "--no-ff", "feature", "-m", "first compatible merge");
    const head = git("rev-parse", "HEAD");
    const log = git("rev-list", "--first-parent", "--parents", head);
    assert.equal(deriveVersion({
      ...policy, acceptedArchitectureMerge: baseline
    }, parseFirstParentHistory(log), head).version, "01.01");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import test from "node:test";
import { createHash } from "node:crypto";
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

// Frozen evidence from production 01.05 BASE 61c53c0eb5f7bfa52a547d299814c6a7810803f6, TREE 958419d16920097ef6152d5904a26916a35dd6e2.
const auditedMapping = {
  "HRVM-PORT-001": [
    "HRVM-PORT-READER-001",
    "HRVM-PORT-WRITER-001",
    "HRVM-PORT-DATA-001",
    "HRVM-PORT-BOUNDARY-001",
    "HRVM-PORT-JSON-001",
    "HRVM-PORT-VERSION-001"
  ],
  "HRVM-WRITE-001": [
    "HRVM-WRITE-CAP-001",
    "HRVM-WRITE-TRIGGER-001",
    "HRVM-WRITE-ATOMIC-001",
    "HRVM-WRITE-FAIL-001",
    "HRVM-WRITE-SCOPE-001"
  ],
  "HRVM-PERSIST-001": [
    "HRVM-PERSIST-INTENT-001",
    "HRVM-PERSIST-NEUTRAL-001",
    "HRVM-PERSIST-AUTH-001",
    "HRVM-PERSIST-FAIL-001",
    "HRVM-PERSIST-HISTORY-001",
    "HRVM-PERSIST-DBMS-001"
  ],
  "HRVM-REF-001": [
    "HRVM-REF-IDENTITY-001",
    "HRVM-REF-PATH-001",
    "HRVM-REF-CONTEXT-001",
    "HRVM-REF-READ-001",
    "HRVM-REF-WORK-001",
    "HRVM-REF-KINDS-001",
    "HRVM-REF-DBMS-001",
    "HRVM-REF-LIMIT-001"
  ],
  "HRVM-TEST-001": [
    "HRVM-TEST-POLARITY-001",
    "HRVM-TEST-READ-001",
    "HRVM-TEST-WRITE-001",
    "HRVM-TEST-CAP-001",
    "HRVM-TEST-PARITY-001",
    "HRVM-TEST-EVIDENCE-001",
    "HRVM-TEST-MATRIX-001",
    "HRVM-TEST-WORK-001",
    "HRVM-TEST-PERSIST-001"
  ]
};
const baseBlobs = {
  "HRVM-ADAPT-001": "b507315550f9ee6dc24569e9d47558aca0e76d18",
  "HRVM-ARCH-001": "6fceef6fe6d1e1b401a98990b0519eea1fbfbc17",
  "HRVM-BOOT-001": "a4a95d73662f53cabf67e5edab44a8098c9fb0cc",
  "HRVM-CASE-001": "943a39047de8027a8101815a40631291714dc8d5",
  "HRVM-GOAL-001": "3f0e84e8e0b1870c19b0460afec6d704f4a9669d",
  "HRVM-GOAL-002": "a91e8d58e61bfd080c61accb42bb6092af2fc6fc",
  "HRVM-GOAL-003": "95b7799eefae11eae67651d6350fd9728f0abc96",
  "HRVM-LICENSE-001": "9d5009af47c0920e702f630cd29e10b62bbf3e2b",
  "HRVM-PERSIST-001": "65feff1063a82cb7d057152041ff129c98bd6b0a",
  "HRVM-PERSIST-AUTH-001": "af1005be089cacfa94108204ced3e704300ff6ad",
  "HRVM-PERSIST-DBMS-001": "54d9cee8d95dedf7f2b9dd61867d79e4f72b40c1",
  "HRVM-PERSIST-FAIL-001": "06029f0efe8804ff72a4e009e18bdf63f4e59f6f",
  "HRVM-PERSIST-HISTORY-001": "cc180c07b74ad3fe39d01ff45d35e6ec98683652",
  "HRVM-PERSIST-INTENT-001": "1d78c4a7070084ba2af9260186d388fc87c7c9ab",
  "HRVM-PERSIST-NEUTRAL-001": "1935c0fe11ff41ecdfc35a3deec7948a73725458",
  "HRVM-PORT-001": "b6219d07b4e4c9bd8afafb2181cd610f4dfd3cf6",
  "HRVM-PORT-BOUNDARY-001": "c862875f0ebe5dbe426ea39e78ce0e12585e7527",
  "HRVM-PORT-DATA-001": "4017b81edca3497cf4ee6f93a6e5c44b3dd0b199",
  "HRVM-PORT-JSON-001": "03ef54a10feb0b84c61a0c532b82e3061d37b0f6",
  "HRVM-PORT-READER-001": "615ee311f4ec70579e944d41deef52eec0079315",
  "HRVM-PORT-VERSION-001": "eaed64dba68ebc9baf464920b4dc26d29b1b6441",
  "HRVM-PORT-WRITER-001": "567329a620bb40bebb11a049de6af692c6c20bd1",
  "HRVM-PRODUCT-000": "cb86abfc528f60fa794c98cd562c080268d1f55c",
  "HRVM-PROJECT-000": "52514b23df18944c334c4f572d1f498f848ab6c7",
  "HRVM-READ-001": "2a6c9e3ec8da0a37d4101422820dcbbd4c9103b9",
  "HRVM-REF-001": "5c4354561a13f4049ac3ab0e2ddd49a0fd44dc48",
  "HRVM-REF-CONTEXT-001": "8581a9904e19b42a5714ad703a8c876f6b8dee8a",
  "HRVM-REF-DBMS-001": "e69b30427a691dc3c41ed2495b2cdff5e494d556",
  "HRVM-REF-IDENTITY-001": "da86020d0baa3348ebf939a7b36234829ee104c2",
  "HRVM-REF-KINDS-001": "13852f24176325330e570beaa7e63324a3ecafd7",
  "HRVM-REF-LIMIT-001": "b5c4c9192523330bedf4875637808724cb8e689e",
  "HRVM-REF-PATH-001": "a0102e54b5cd547d66f1f4c56acc143d9fe69b9a",
  "HRVM-REF-READ-001": "b3d0ffa1ec68615686e22d2c972da0da7dcb535f",
  "HRVM-REF-WORK-001": "a8fa5ff0759684171b5a130b7b2ec45fb526c6a9",
  "HRVM-REQ-AUDIT-001": "5d12184e8324e712cdef281f3faf30b350756f6e",
  "HRVM-REQ-GLOSSARY-001": "286540821ab19f00a3fbbcaa8bf802e2f84590ea",
  "HRVM-REQ-PRIORITY-001": "4c12af3b50e01245c32bc8faed06eeecd30c2421",
  "HRVM-REQ-VERIFY-001": "e37e42ade5c6986e189e100a34ddbcd505117ec5",
  "HRVM-SEC-001": "a0e6cb8a0de042ef0b0a113e8b94b3fe81b5982a",
  "HRVM-SNAP-001": "f1358c12f9ff04777d9049bf7b40d005d8b8b4fb",
  "HRVM-TEST-001": "f3749049a366758f2df557b653f80037c2026995",
  "HRVM-TEST-CAP-001": "f23b2d92cc43ee285e114f46dd871a5ad99dd486",
  "HRVM-TEST-EVIDENCE-001": "bb252804f4980e33ca66a27f53e56d5006abd621",
  "HRVM-TEST-MATRIX-001": "ec806fdc434aa9cadf01c3da70baa3b835a0dc6c",
  "HRVM-TEST-PARITY-001": "f5f4498bb14ce44099663b1dcd89a0a6f98577e3",
  "HRVM-TEST-PERSIST-001": "fc4adbfa0ce15de21477d9bca076961a487edaaf",
  "HRVM-TEST-POLARITY-001": "7df85f19c5ecf79ae6ced274cc8bf23b7298de04",
  "HRVM-TEST-READ-001": "b531b32b26553ab68a88ab8087ac0a9d1941d7ec",
  "HRVM-TEST-WORK-001": "fb3b8c009c48132451758292cb424611e8370638",
  "HRVM-TEST-WRITE-001": "5382de9c534cbae7272951862663fbaf3a93eeea",
  "HRVM-USER-001": "7b0afaf02dc6abb367c313688f321076382b9d11",
  "HRVM-USER-002": "3f1abbb07977ebfaca4a190dc14744b62c0d09c9",
  "HRVM-USER-003": "23f804fdff8971bd42994cd5bc1dacba9a340498",
  "HRVM-USER-004": "5ad7ab8ba3b2ab2c4de20264ef081d3f5c8fd929",
  "HRVM-VERSION-001": "ebf31f0119381b655abc69592d73c94e9213d30d",
  "HRVM-WORK-001": "7f86d32a9259ea4b1bdaf7db941ac88f732b8b22",
  "HRVM-WRITE-001": "2350c8dfa733f7506e4d3861adbca2b3013848d7",
  "HRVM-WRITE-ATOMIC-001": "2d793c5c0cfca4c3a4716f241da86a233ad50692",
  "HRVM-WRITE-CAP-001": "233585bd0cef1e99766ed0a1a642bb1601e368cc",
  "HRVM-WRITE-FAIL-001": "d5f700240e03f865de87f9af90ec628a1da392df",
  "HRVM-WRITE-SCOPE-001": "dde6b9aa29f6be0864b4ea81ef2c642e81cac5d3",
  "HRVM-WRITE-TRIGGER-001": "5cdddfa4643579da5e05f742697dc3f0a038f1fb"
};
const historical = new Set(Object.keys(auditedMapping));
const replacementOf = new Map(Object.entries(auditedMapping).flatMap(([old, children]) => children.map(id => [id, old])));
const current = new Set([...acceptedS0].filter(id => !historical.has(id)).concat([...replacementOf.keys()]));
const candidates = new Set([...normalizedCandidates].filter(id => !replacementOf.has(id)).concat("HRVM-VERSION-001"));
const anchors = {
  "HRVM-PORT-001": "HRVM-ARCH-001",
  "HRVM-WRITE-001": "HRVM-PORT-WRITER-001",
  "HRVM-PERSIST-001": "HRVM-WORK-001",
  "HRVM-REF-001": "HRVM-PRODUCT-000",
  "HRVM-TEST-001": "HRVM-PROJECT-000"
};
// Clause-level migration of the accepted PERSIST -> WRITE parent (P2-01).
const persistWriteParents = {
  "HRVM-PERSIST-INTENT-001": [
    "HRVM-WRITE-TRIGGER-001"
  ],
  "HRVM-PERSIST-AUTH-001": [
    "HRVM-WRITE-CAP-001"
  ],
  "HRVM-PERSIST-FAIL-001": [
    "HRVM-WRITE-FAIL-001",
    "HRVM-WRITE-CAP-001"
  ],
  "HRVM-PERSIST-HISTORY-001": [
    "HRVM-WRITE-TRIGGER-001"
  ],
  "HRVM-PERSIST-NEUTRAL-001": [],
  "HRVM-PERSIST-DBMS-001": []
};
const edge = (predicate,id) => "  - predicates: [ " + predicate + " ]\n    target: { kind: requirement, id: " + id + " }";
function requirementEdges(r) {
  return [...r.text.matchAll(/predicates: \[ ([^\]]+) \]\n\s+target: \{ kind: requirement, id: ([\w-]+) \}/g)]
    .flatMap(m => m[1].split(",").map(p => [p.trim(),m[2]]));
}
function lifecycle(r) {
  const m = r.text.match(/^lifecycle: \{ accepted: (true|false), current: (true|false), published: (true|false) \}$/m);
  assert.ok(m, r.id);
  return m.slice(1).map(x => x === "true");
}
test("REQ-AUTH: exact lifecycle partition 45/5/12/0/62 (recorded candidate graph, not author acceptance)", () => {
  assert.equal(requirements.length,62);
  assert.equal(byId.size,62);
  assert.equal(current.size,45);
  assert.equal(historical.size,5);
  assert.equal(candidates.size,12);
  assert.equal(replacementOf.size,34);
  for (const r of requirements) {
    assert.equal([current,historical,candidates].filter(s=>s.has(r.id)).length,1,r.id);
    assert.deepEqual(lifecycle(r), [current.has(r.id)||historical.has(r.id),current.has(r.id),false],r.id);
  }
  for (const id of normalizedCandidates) {
    const r=byId.get(id);
    assert.equal((r.normative.match(/\bMUST\b/g)||[]).length,1,id);
    assert.equal((r.normative.match(/\b(?:SHOULD|MAY)\b/g)||[]).length,0,id);
  }
});
test("REQ-AUTH: normative and non-migration fields exactly match production 01.05 Git blobs", () => {
  assert.deepEqual([...byId.keys()].sort(),Object.keys(baseBlobs).sort());
  for (const r of requirements) {
    let original=r.text;
    if (historical.has(r.id)) original=original.replace("accepted: true, current: false","accepted: true, current: true");
    if (replacementOf.has(r.id)) {
      const old=replacementOf.get(r.id), anchor=anchors[old];
      const added= !["HRVM-TEST-POLARITY-001","HRVM-TEST-MATRIX-001"].includes(r.id);
      original=original.replace("accepted: true, current: true","accepted: false, current: false")
        .replace(edge("supersedes",old)+(added?"\n"+edge("derives_from",anchor):""),edge("derives_from",old));
    }
    if (["HRVM-READ-001","HRVM-SNAP-001"].includes(r.id)) original=original.replace(edge("derives_from","HRVM-PORT-READER-001"),edge("derives_from","HRVM-PORT-001"));
    for (const parent of persistWriteParents[r.id] ?? []) {
      const addedEdge=edge("derives_from",parent)+"\n";
      assert.ok(original.includes(addedEdge),r.id+" missing migrated parent "+parent);
      original=original.replace(addedEdge,"");
    }
    const bytes=Buffer.from(original,"utf8");
    const actual=createHash("sha1").update("blob "+bytes.length+"\0").update(bytes).digest("hex");
    assert.equal(actual,baseBlobs[r.id],r.id+" differs from exact baseline outside allowed migration");
  }
});
test("REQ-AUTH: exact supersedes, no dangling or historical current derivation, current rootedness", () => {
  for (const r of requirements) {
    const edges=requirementEdges(r);
    for (const [,id] of edges) assert.ok(byId.has(id),r.id+" dangling "+id);
    assert.deepEqual(edges.filter(([p])=>p==="supersedes").map(([,id])=>id),replacementOf.has(r.id)?[replacementOf.get(r.id)]:[],r.id);
    if (!current.has(r.id)) continue;
    const parents=edges.filter(([p])=>p==="derives_from").map(([,id])=>id);
    assert.ok(parents.every(id=>!historical.has(id)),r.id+" derives from historical authority");
    if (replacementOf.has(r.id)) assert.ok(parents.includes(anchors[replacementOf.get(r.id)]),r.id);
  }
  function rooted(id,seen=new Set()) {
    if(id==="HRVM-PRODUCT-000") return true;
    assert.ok(!seen.has(id),"current cycle "+id);
    const parents=requirementEdges(byId.get(id)).filter(([p,t])=>p==="derives_from"&&current.has(t)).map(([,t])=>t);
    return parents.length>0 && parents.every(p=>rooted(p,new Set([...seen,id])));
  }
  for(const id of current) assert.ok(rooted(id),id+" lacks current-only provenance to PRODUCT");
  for(const id of ["HRVM-READ-001","HRVM-SNAP-001"]) assert.ok(requirementEdges(byId.get(id)).some(([p,t])=>p==="derives_from"&&t==="HRVM-PORT-READER-001"));
});

test("REQ-AUTH P2-01: exact clause-level current PERSIST to WRITE provenance", () => {
  const persistIds=auditedMapping["HRVM-PERSIST-001"];
  const writeIds=new Set(auditedMapping["HRVM-WRITE-001"]);
  assert.deepEqual(Object.keys(persistWriteParents).sort(),[...persistIds].sort());
  let count=0;
  for (const id of persistIds) {
    const r=byId.get(id);
    assert.deepEqual(lifecycle(r),[true,true,false],id);
    const parents=requirementEdges(r).filter(([p])=>p==="derives_from").map(([,t])=>t);
    assert.ok(parents.includes("HRVM-WORK-001"),id);
    const actual=parents.filter(t=>writeIds.has(t)).sort();
    assert.deepEqual(actual,[...persistWriteParents[id]].sort(),id);
    for (const target of actual) assert.deepEqual(lifecycle(byId.get(target)),[true,true,false],target);
    count+=actual.length;
  }
  assert.equal(count,5);
  // A WORK-only PERSIST graph is rooted, but fails this exact provenance check.
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
  assert.deepEqual(data.legacy, auditedMapping);
  assert.equal(all.length, 34);
  assert.equal(new Set(all).size, all.length, "atomic child mapped from more than one legacy Requirement");
  for (const [legacy, children] of Object.entries(data.legacy)) {
    assert.ok(acceptedS0.has(legacy), legacy + " must be accepted legacy authority");
    assert.ok(children.length >= 5, legacy + " should actually be decomposed");
    for (const id of children) {
      assert.ok(normalizedCandidates.has(id), id + " is not normalized ID");
      assert.ok(requirementEdges(byId.get(id)).some(([p,t]) => p === "supersedes" && t === legacy),
        id + " must supersede " + legacy);
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

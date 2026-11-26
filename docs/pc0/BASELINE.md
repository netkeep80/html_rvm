# PC0 — historical jsonRVM oracle baseline

Status: **RESULT-CANDIDATE · native oracle reproduced · CDP exact artifacts unavailable · independent audit pending**

Authority: Issue #37; S1B-PARITY-COMPACT authority #18/7202378622; addendum #18/7204233213.

## 1. Exact source identity

Historical oracle:

- repository: `netkeep80/jsonRVM`;
- commit: `9d5f2000aba2c2ece0121f1d6bc84721a8728e7a`;
- root TREE: `38c6093318d4367ccb844961c92af517901e602e`;
- corpus: `modules/console/test`;
- corpus subtree: `91876c9162327a18748c9eb6758cad1fdeaba9c2`.

The earlier roadmap label that called `38c609…` the corpus TREE was incorrect: it is the commit root TREE. Direct Git tree inspection shows that `91876c…` is the actual 22-entry corpus subtree and that all previously recorded file blob IDs and byte sizes remain exact.

The corpus contains 22 files, 15 JSON files. Important anchors:

- `#.json`: 11,738,942 raw bytes, blob `59e29c60fe8e12f484f2d5da53719c1de5eb3e6a`;
- `performance.json`: 919 bytes, blob `a4d567df6de219db20d6e71739e2218292bcd097`;
- `main.cpp`: 11,422 bytes, blob `aaa60d59299e59567422461a8f98600a2aa38599`.

## 2. Reproduction environment

Evidence workflow: GitHub Actions run [45905670775](https://github.com/netkeep80/html_rvm/actions/runs/45905670775), exact html_rvm HEAD `328b65ac8e6a07cb37ccc0b0aa6441f9403a3850`.

Environment recorded before build:

- Ubuntu runner: Linux 7.0.0-1014-aws, x86_64;
- C++: Ubuntu GCC 13.3.0;
- CMake 3.31.6;
- Git 2.56.1;
- doctest 2.4.3.

Commands, without patching jsonRVM:

```sh
cmake -S .pc0/jsonRVM -B .pc0/build \
  -DCMAKE_BUILD_TYPE=Release \
  -DENABLE_VOCABULARY=OFF
cmake --build .pc0/build --target rmvm.test --parallel 2
cd .pc0/jsonRVM/modules/console/test
"$GITHUB_WORKSPACE/.pc0/build/modules/console/test/rmvm.test"
```

Configure, build and execution all returned success.

## 3. Actual native oracle result

The untouched historical test binary executed **5/5 test cases successfully** and doctest reported **32/32 assertions PASS**. The 32 assertions consist of the 28 semantic `CHECK` observations used by the comparison program plus four file/input `REQUIRE` checks.

Stable observations reproduced by actual execution:

| Case | Stable observations |
|---|---|
| absolute addressing | 3/3: `ent1/id = ent1`, `ent2/id = ent2`, `ent3/val/id = ent3` |
| relative addressing | 16/16: E/S/R/O addressing across `$`, `$$`, `$$$`, `$$$$` |
| version | historical oracle assertion `rmvm_version = "3.0.0"` passed |
| where | result `["4"]`; 1/1 assertion passed |
| performance | seven report-row assertions reproduced exactly |

Exact performance report rows observed:

```text
Parameter;Average;StandardDeviation;Correlation;Successful;MeasCount
param11;-0.565942;8.813454;0.879269;100.000000;688
param6;0.145000;4.852494;0.911962;100.000000;688
param1;-10.724466;22.198186;0.294701;99.562044;685
param7;56.969527;49.532709;0.580730;99.640934;557
param12;;;;0.000000;688
param9;-7.835917;2.119798;0.470438;99.273256;688
```

The run additionally produced `meas_count = 230`.

### Volatile observations

The raw run also emitted:

- an entity ID derived from an in-process address, e.g. `ent94337837948064`;
- `test_duration = 39941` microseconds for this runner execution.

These values are evidence of actual execution but are **not** frozen parity expectations. Allocator history/address-derived identifiers and wall-clock timing require declared equivalence/adapters before comparison. PC1–PC4 must not compare them byte-for-byte unless a later profile explicitly makes them observable requirements.

## 4. Raw evidence

Artifact: `pc0-legacy-oracle-evidence`, GitHub artifact ID `15157457727`.

- ZIP size: 2,834 bytes;
- GitHub digest: `sha256:b25204f5ef0724a6c38d12e7d4be1fd21f8738173df3ad88f7791d0be9e43e04`;
- independently downloaded ZIP SHA-256: `b25204f5ef0724a6c38d12e7d4be1fd21f8738173df3ad88f7791d0be9e43e04`.

Contents:

- `environment.txt` — 942 bytes;
- `configure.log` — 1,248 bytes;
- `build.log` — 1,810 bytes;
- `console-test.log` — 3,311 bytes;
- `verdict.txt` — 51 bytes.

The evidence retains raw configure/build/run logs; this document is only their stable summary.

## 5. Comparison accounting frozen before PC1

For each comparable scenario, PC1–PC4 must record:

1. exact old source and exact new source;
2. complete scenario-specific executable dependency closure;
3. data separately from executable source;
4. same declared input/environment/profile;
5. actual execution of both sides;
6. output, error, effect, order, identity/alias, context and reflection observations when applicable;
7. deterministic trace where the profile exposes it;
8. minified UTF-8 executable bytes using one documented canonicalization;
9. per-case old/new ratio and aggregate ratio;
10. author decision for any growth or intentional semantic difference.

Whitespace-only reductions do not count. Unchanged data such as measurement arrays is not executable-source compactness credit. Performance is measured only after correctness.

## 6. CDP-C1/C2 evidence boundary

The accepted addendum #18/7204233213 records prior reported CDP-C1/C2 measurements but explicitly states that exact CDP source files, converted fixtures, prototype and trace were not supplied with the research handoff and must be obtained before executable-evidence credit is granted.

Current PC0 searches found no exact CDP-C1/C2 implementation artifact in the `html_rvm` repository. The durable file search likewise exposes the handoff report but not the missing prototype/archive.

Therefore:

- reported CDP byte counts remain a historical comparator;
- reported 7/7 short-report rows / 396,125-step experiment remain reported evidence;
- CDP-C1 receives **no independently reproduced executable baseline** in PC0;
- CDP-C2 remains static-only reported evidence;
- PC1 may compare against these reported forms descriptively, but may not claim reproduced CDP parity or use them as an audited executable oracle unless the exact artifacts are recovered.

This evidence gap does **not** invalidate the reproduced native jsonRVM oracle.

## 7. PC0 result candidate

**NATIVE_ORACLE_PASS**

The main historical oracle is now executable and reproducible on the pinned source with actual output evidence. The comparison accounting contract is frozen before selection of a PC1 notation.

**CDP_ARTIFACT_GAP**

Exact CDP implementation artifacts remain unavailable. This is an evidence limitation, not permission to reconstruct a convenient CDP implementation and call it historical.

No C grammar has been selected, no R0 semantics changed, and no V4/V5 work has started.

Next after independent review and author acceptance of this PC0 result: PC1 investigates jointly:

- triune JSON entity as recursive `E = R(O,S)`;
- algebra of deterministic explicit/implicit O/R/S completion;
- relation factorization using natural JSON structure, including `R:{O:S}` and `O:{R:S}`, under identity/context/order constraints.

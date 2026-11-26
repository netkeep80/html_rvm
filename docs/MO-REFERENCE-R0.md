# MO Reference Executor R0 — direct executable semantics

Status: **draft reference implementation on research branch**. It is not an optimized carrier, not a production VM and not a replacement for accepted DocumentPort contracts.

Canonical mathematical/author basis: Issue #20 comments 7199598893, 7199649750 and the concept-acceptance/strategy delta that authorizes the reference-executor direction.

## 1. Purpose

R0 is deliberately small. Its job is to make the accepted constructive candidate executable with minimal representational noise.

The semantic endpoint universe is:

```text
E = N ⊎ P
```

`N` are entity/value occurrences. `P` are first-class relation occurrences. Both relation owner and target may be either `N` or `P`, so relations can describe, reference and share other relations without a separate primitive assertion sort.

Each atomic operation returns the executable analogue of:

```text
delta(S, a) = (S', Pi, Omega)
```

where `Pi` is identity persistence for live semantic occurrences and `Omega` is status/diagnostic/return plus whether the semantic state changed.

## 2. State

R0 keeps only transparent semantic tables:

- `nodes: Map<N-id, {kind,payload}>`;
- `relations: Map<P-id, {owner,label,bound,target}>`;
- ordered `roots`;
- `used.N` and `used.P` sets for the reference no-resurrection policy.

The materialized `used` sets are a clarity choice of R0. The mathematical law is lifetime uniqueness; another implementation may represent the same law differently.

R0 has no carrier-private helper identities, interning or index cache.

## 3. Atomic operations

Implemented reference operations:

- `createNode` / `deleteNode`;
- `createRelation` / `deleteRelation`;
- `relabelRelation`;
- `moveRelation`;
- `rebindRelation` / unbind;
- `setNode`;
- `setRoots`;
- `reassert` as explicit replacement of an assertion occurrence.

All operations run against a draft and commit only after full state validation. Reject returns the original state and identity persistence. This is transaction rollback, not an inverse semantic execution. `executeMOSequence` exposes committed semantic history; `executeMOAtomically` exposes an internal `trace` only for a successful composite. A rolled-back composite returns an empty trace, so tentative births/deaths do not become semantic history.

Ordinary `setNode` and `rebindRelation` to an already equal value are successful semantic no-ops. `reassert` is a different operation and creates a fresh relation occurrence. R0 rejects reassertion of a relation that is itself referenced, rather than silently retargeting references; atomic replacement-with-reference-retargeting remains a distinct future operation if required.

## 4. Context assertions through MO itself

A contextual assertion is represented by ordinary `P`:

```text
owner  = P(anchor-relation)
label  = Role("ctx:...")
target = N(...) or P(...)
```

This preserves assertion identity, relations referring to assertions, sharing and finite cycles. Derived role slots `(P, role)` are not stored as independent semantic IDs.

R0 does not claim that all historical/full Jc template/binding/context machinery is already reduced to this encoding. That broader image remains an explicit profile-extension question.

## 5. Plain JSON projection

`projectPlainJSON` is intentionally partial. A selected `N` root must denote a finite acyclic JSON-shaped structural graph:

- object members use `Key(string)`;
- array members use dense `Index(0..n-1)`;
- structural members are bound to `N` targets;
- object keys are unique;
- scalar nodes have no structural members.

Sharing is unfolded. Cycles, unbound members, relation targets, sparse arrays and duplicate structural keys are rejected. Non-structural role/tag relations are not part of the plain value projection.

Thus plain JSON is a quotient of semantic state: identity, aliasing, used/lifetime history, assertions and unreachable state are intentionally forgotten.

The numeric adapter in R0 uses finite ECMAScript `number` payloads. This implementation choice does not claim to settle the separate D2 lexical/exact-decimal question.

## 6. Lossless JSON graph serialization

`serializeLosslessMO` writes a tagged ordinary JSON object containing all selected finite R0 semantic state:

- typed N/P identities;
- node kind/payload;
- relation owner/label/bound/target;
- roots;
- used sets.

`deserializeLosslessMO` validates and restores that state exactly. Cycles and sharing are preserved because references are explicit IDs rather than recursive inline values.

This is not the same interface as `projectPlainJSON`.

## 7. JSON operations through MO

`applyJSONOperation` supports `add`, `remove` and `replace` on the **canonical JSON-tree domain**. It translates the requested JSON edit into explicit MO operations, supplies fresh semantic IDs through `SequentialMOAllocator`, then commits the whole operation atomically.

The domain is deliberately strict: one root, no sharing, no cycles, no extra live semantic records and only structural Key/Index relations. This avoids pretending that a path-local edit of one alias in a shared DAG has an unambiguous plain-JSON meaning.

Same-value `replace` is a semantic no-op and allocates nothing.

For a future shared-DAG JSON editing profile, the mathematical choices are explicit copy-on-write along the selected occurrence path or a locality restriction. R0 does not silently choose one.

## 8. Theorem-oriented tests

The R0 tests target mathematical distinctions rather than coverage volume:

- relation-to-relation assertions and references;
- finite relation cycles and sharing;
- no-resurrection and live-structure-vs-full-state cancellation;
- atomic reject and atomic composite rollback;
- same-value no-op vs explicit reassert;
- plain JSON loss of alias identity;
- cycle obstruction for plain JSON;
- exact lossless serialization of relation endpoints, unbound state and dead used IDs;
- JSON add/remove/replace translated through MO;
- refusal of shared-DAG path mutation without an explicit COW/locality policy.

## 9. Deliberate non-goals of R0

R0 does not yet claim:

- global minimality of N/P;
- full historical Jc encoding;
- full O15/native-carrier refinement;
- exact-decimal lexical JSON semantics;
- optimized storage, indexes or performance;
- DocumentPort integration;
- production VM behavior;
- closure of existing historical D2a/B BLOCK/OPEN or G05-E.

Its role is narrower: provide one transparent executable semantic reference against which those later claims can be stated and proved precisely.

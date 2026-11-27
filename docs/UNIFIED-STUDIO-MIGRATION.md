# Unified MO Studio — migration evidence ledger

Authority: Issue #45, author design acceptance #45/7220762521; J1 accepted and merged. Candidate, not author acceptance of implementation.

Public packaging: one UI at site/unified-studio.html; root and two historical entry routes redirect there. No generation selector, standalone JSON Lab or legacy script/CSS in default package. The explicit legacyRegression build option is used by existing CI harnesses only; CLI publication never sets it. Retained historical source files are test evidence, not an exposed product mode. Deleting historical regressions or changing accepted requirements is out of scope.

| Historical obligation | Replacement | Evidence / remaining |
|---|---|---|
| S1A dirty/apply/invalid, independent working state | unified-session draft, applied, branch, reset | unified-session tests and unified Chromium |
| S1A read-only DocumentReader, explicit import/export, zero writer | readDocumentDraft, readLocalJSON using MemoryDocumentProvider and createWorkingSession; explicit source Apply, exact export | new async contract test; original provider and working-session suites retained; actual file input browser checks in smoke-mo-unified; explicit export action still needs visual walkthrough |
| V1 layout vs semantic edits | B/E pointer drag, glyph movement, zoom, creation/removal | original suites retained; unified browser drag and creation/deletion tests |
| V1 relation identity, sharing, self/mutual cycles, no resurrection | exact identity glyphs, R0 atomic actions plus E1 validation | mathematical fixtures, session tests, browser tests |
| V2 source ↔ exact identity, typed path, multiplicity | sourceRanges, locateVPath, projectionOccurrences; key/payload selection; exact inspector | session and browser tests; projection is partial and not lossless; raw duplicates rejected |
| V3 real transition evidence, committed/reject | stepNaturalJSON yields actual R0/E1 records; run/step shared; rejection discarded; ordered history | existing J1 tests and unified session/browser tests |
| R0 advanced edit operations | admitted atomic operation editor; source root anchor protected | session atomic tests; not every former raw UI gesture exposed; old core regression retained |
| Legacy raw test demonstrations and stress controls | not primary user workflows; original test harness retained | no mathematical or DocumentPort test deletion |
| Git-derived version, static packaging | build-info version and canonical redirects | packaging tests plus existing version suite |
| PC1 executable/reflection | J1 version/where, ORS, Q, state-only replay | J1 and unified tests; copy/alias parity OPEN |

No full industrial parity or compactness claim. Exact historical fixture comparison is bounded to accepted version/where. Visual walkthrough, independent audit, review of remaining UI coverage and explicit author merge authorization are required before publication. No old assets removed from Git; this migration changes the public package only.

### Visual review delta

Actual previous Chromium screenshots (artifact 15207251445, HEAD 427d17e…) showed excessive crossings in the all-records grid for Natural JSON where. The replacement default lays out structural member occurrences between owner and target, then places remaining visible identities on a shelf. The focused view is explicitly labelled and endpoint-closed, with a visible count and an all-identities switch. Layout is not semantic state; equal-but-distinct relation glyphs are never coalesced. General non-tree mathematical examples keep the finite grid and direct B/E attachments. Independent visual acceptance still required.

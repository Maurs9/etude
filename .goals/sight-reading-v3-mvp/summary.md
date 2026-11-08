# Sight-Reading v3 MVP — Completion Summary

## Result

The Sight-Reading v3 MVP (migration Step 6, M0–M10) is complete on
`feat/sight-reading-v3`. The independent Inspector returned **PASS** in
iteration 5.

## Acceptance Criteria

- **AC1 — Model and fingerprint:** Implemented the tick-based piece model,
  validation, legacy adapter, expected-event builder, canonical serialization,
  and synchronous FNV-1a 64-bit fingerprints. Both reference vectors and all
  identity exclusions are tested.
- **AC2 — Evaluator:** Implemented monotone per-pitch matching, repeated-note
  windows, inclusive timing classes, rest violations, complete scoring output,
  and star rules. All specification vectors and edge cases pass.
- **AC3 — Generator:** Implemented deterministic Mulberry32 generation for
  P1.a–P2.c and both hands. The 12,000-piece matrix verifies cadence, bars,
  rests, ranges, exact diatonic-third bounds, fingering, and model validity.
- **AC4 — Flow:** Implemented the pure state machine with exhaustive,
  table-driven coverage of every legal and illegal transition.
- **AC5 — Recorder:** Integrated note-on/off capture for keyboard, pointer,
  MIDI, and BLE. Capture windows, source exclusions, duplicate attacks, focus
  ownership, physical release, and panic are covered in browser tests.
- **AC6 — Assess mode:** Implemented first-sight preview, count-in, playing,
  delayed evaluation, result painting, practice conversion, interruptions,
  pending-save recovery, and repeated practice without affecting repertoire
  best scores.
- **AC7 — Ledger:** Implemented the `etude-sight-v1` ledger, two-lock protocol,
  atomic two-tab claiming, orphan recovery, generation protection, limits,
  idempotency, fallback without Web Locks, and byte-preserving handling of
  unsupported future schemas.
- **AC8 — Backup:** Added optional sight-reading ledger export/import while
  retaining compatibility with older v3 backups. Merge, abandonment, active
  claims, deduplication, conflicts, and validation are tested.
- **AC9 — UI and accessibility:** Added the explainable score summary,
  first-sight/practice badge, non-colour symbols and titles, all seven
  languages, state-only live announcements, reduced-motion behavior,
  responsive layouts, and theme-safe contrast of at least 4.5:1.
- **AC10 — Offline:** The real service-worker-backed UI journey completes
  offline through preview, count-in, keyboard input, evaluation, result
  rendering, and ledger persistence.
- **AC11 — Quality gates:** Strict typecheck, lint, 101 Vitest tests, both
  builds, and all 247 Playwright tests pass with zero failures and zero skips.
- **AC12 — Regressions:** Existing assertions and goldens remain unchanged.
  The Inspector manually completed the first-attempt keyboard flow in Chrome,
  reloaded it, and verified that the same fingerprint enters practice without
  a second preview.

## Iteration History

1. **FAIL:** Pure core existed, but first-sight UI, concurrency, backup,
   accessibility, offline integration, and required browser coverage were
   incomplete.
2. **FAIL:** The first ledger claim was rejected and multiple practice,
   persistence, input, and UI lifecycle gaps remained.
3. **FAIL:** The main flow worked, but ledger idempotency, stale imports,
   pending-save behavior, symbols, and browser/offline proofs remained.
4. **FAIL:** Independent review found an incorrect leap invariant, destructive
   handling of future ledger schemas, timing-symbol and contrast defects,
   focus ownership errors, and missing browser matrices.
5. **PASS:** All remaining defects were corrected and independently verified.

## Important Inspector Findings Resolved

- Corrected a diatonic third from three scale-index steps (a fourth) to two.
- Prevented reads of a future ledger schema from overwriting its stored bytes.
- Rendered `lateOrEarly` as `✗` rather than `≈` and fixed symbol contrast.
- Stopped focus loss from synthetically releasing held MIDI/BLE notes.
- Replaced partial flow coverage with an exhaustive transition matrix.
- Expanded browser tests to cover recorder input, flow lifecycle, two-tab
  ledger behavior, backup merging, no-Web-Locks fallback, responsive and
  accessibility matrices, and the complete offline user journey.

## Recommendations

- Keep V2 (practice slicing and two-hand evaluation) and V3 (adaptive levels)
  separate from this MVP, as required by the plan.
- Preserve the independent generator invariant matrix; it caught a musically
  meaningful defect that implementation-coupled tests missed.
- Continue testing future storage schemas as immutable input so upgrades never
  destroy data written by a newer app version.
- Use an isolated Playwright port whenever port 8787 is already occupied or
  becomes unreliable, to avoid testing a different worktree.

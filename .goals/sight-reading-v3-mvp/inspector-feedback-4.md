# Inspector Feedback — Iteration 4

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — M1, model and fingerprint — verified.** The two required FNV-1a vectors pass exactly, non-musical fields do not affect identity, and the generated `eventId`/`nid` mapping is stable.
- [x] **AC2 — M2, evaluator — verified.** The full result objects for all six acceptance vectors now pass, together with inclusive timing boundaries, close repeated notes, chord order, rest violations, substitution accounting, and `N = 0`.
- [ ] **AC3 — M5, generator — FAILED.** The implementation and the new "independent" test both encode a maximum leap of `3` diatonic scale-index steps for P1.b–P2.c. A diatonic third is `2` steps; `3` permits a fourth. Real counterexamples include P1.b seed 0 (`C4 → F4`), P2.b seed 1 (`C4 → F4`), and P2.c seed 0 (`G4 → D4`). The 12,000-run test therefore proves the wrong invariant.
- [ ] **AC4 — flow — FAILED.** The first practice run now traverses `preparing → countIn → playing → completed`, but the unit tests still do not cover every legal transition. The `blocked` paths, several `preparing`/`claiming` interruptions, preview abandonment, and completed interruption are not all exercised. The integration also cannot start an unlimited second practice run correctly: after one practice completes, pressing Start again makes playback active while `SR.srtState.name` remains `completed`.
- [ ] **AC5 — M3, recorder — FAILED.** The mandatory Playwright recorder suite still does not exist. Unit tests do not prove the real MIDI, keyboard, pointer, focus, panic, source-exclusion, and capture-window integration. In addition, `releaseFocusInput()` calls `srtRecorder.releaseAll('focus', ...)`, which closes recorder entries for held MIDI/BLE notes even though the input pipeline intentionally leaves those physical owners held across browser focus loss.
- [ ] **AC6 — M4 and M7, assess mode — FAILED.** The clean first-attempt journey now works in a real browser: a computer-keyboard `A` press produced `TP 1/11`, the attempt saved, and reloading/regenerating the same fingerprint entered practice with no second preview. Forced `QuotaExceededError` testing also proved that Continue without saving immediately writes an `abandoned` attempt and clears the claim, and Listen writes `interrupted`. However, unlimited practice is broken because a second run stays in terminal state `completed`, and the required Playwright coverage for first-sight, practice, interruption, refresh/hidden-page, `pendingSave`, retry, and continue-without-save flows is absent.
- [ ] **AC7 — M6, ledger — FAILED.** Real two-tab probes verified atomic claiming and active-lease recovery protection, and unit probes verified terminal idempotency before the ownership check plus reset/stale-generation rejection. Two functional defects remain. First, calling `srtReadLedger()` on `{ schemaVersion: 2, marker: 'keep-me' }` replaces it with a new empty v1 ledger instead of preserving unsupported future data. Second, the no-Web-Locks path writes the explanation and immediately overwrites it with `Count-in…` while starting practice, so the required explanation is not visible. The mandatory Playwright cases for lock ordering, pending-save protection, recovery/reset, idempotency, limits, and fallback also remain absent.
- [ ] **AC8 — M8, backup — FAILED.** Basic malformed generation/attempt/exposure values are rejected and old-v3 compatibility remains, but validation is not strict: a backup whose `sightLedger.prefs` is an array is accepted, confirmed by an import that displayed only the confirmation dialog and no invalid-backup alert. The goal also explicitly requires browser tests for export, local generation/active-claim preservation, imported-claim abandonment, union/deduplication, conflicting `attemptId`, limits, and quota failure; no dedicated backup Playwright suite covers them.
- [ ] **AC9 — M9, UI and accessibility — FAILED.** The responsive matrix has no horizontal overflow at 320, 390, 1024, 1920, or 640×320; preview focus is visible after the animation frame; all seven languages, both themes, and reduced motion remain functional. Two defects remain:
  - `lateOrEarly` results are mapped to `near`, so a 220 ms timing error is shown as `≈ Nearly on time` instead of the `✗` late/missed state.
  - The new 11 px result symbols fail the required 4.5:1 contrast. Measured ratios were 3.93 (`✓`) and 2.55 (`≈`) in light theme, and 4.19 (`✓`) and 3.38 (`✗`) in dark theme.
- [ ] **AC10 — M10, offline — FAILED.** The `@sw` test now invokes generation, fingerprinting, evaluation, and direct ledger operations while offline, but it does not run the actual first-attempt UI, recorder, keyboard input, attempt lease/count-in, result rendering, and save flow offline. It therefore does not prove the whole Sight-Reading v3 flow required by the criterion.
- [x] **AC11 — quality gates — verified.** Typecheck, lint, 59 Vitest tests, both builds, and the full Playwright suite passed. Full Playwright reported 216 passed, zero failures, and zero skips. The repository has 29 dedicated Sight-Reading unit tests and 5 Sight-Reading Playwright tests.
- [x] **AC12 — no regressions — verified.** Existing tests and goldens are unchanged, no skips or early-return weakening were introduced, the complete suite passes, and the manual keyboard/reload journey preserved first-sight consumption and practice eligibility.

## Quality Gate

- Command: `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test`
- Port safety: PASS — port 8787 was verified free before the full suite. Manual browser probes used an Inspector-owned server on port 8791. No unknown server was stopped.
- Result: PASS
- Details:
  - Typecheck: PASS, including suppression checker and strict TypeScript.
  - Lint: PASS.
  - Unit: PASS — 14 files, 59 tests.
  - Build: PASS.
  - Standalone build: PASS.
  - Full Playwright: PASS — 216 passed in approximately 1.2 minutes, zero failures and zero skips.
  - Dedicated Sight-Reading: PASS — 6 Vitest files / 29 tests and 5 Playwright tests.

## Commit and Tree Checks

- Builder commit: `28f9675 fix(sight-reading): [B] complete MVP iteration 4`.
- Title length: within 72 characters.
- Required Builder trailers: PASS — exact `Assisted-by: GPT:5.6-Luna` and `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>` are present.
- Branch: PASS — `feat/sight-reading-v3`.
- Pre-inspection tree: clean.
- Exclusions: PASS — the Builder commit does not contain `.DS_Store`, `node_modules/`, `test-results/`, or `dist/`.
- Diff hygiene: PASS — `git diff --check HEAD~1..HEAD` produced no errors.

## Issues Found

### 1. Generator profiles allow fourths where the specification permits thirds

`generator.ts`, `model.ts`, and `tests/sight-reading-v4.test.mjs` all use `leap: 3` for P1.b–P2.c. Scale-index distance `3` is a diatonic fourth, not a third. Because the implementation and test share the same wrong constant, all 12,000 cases pass while violating the product requirement.

### 2. Reading a newer ledger destroys it

`srtReadLedger()` treats every ledger that fails the v1 validator as missing, creates a new ledger, and writes it to `etude-sight-v1`. A browser probe with a schema-v2 marker proved that the original record was overwritten. Newer-schema data must remain byte-for-byte intact while first-sight is disabled.

### 3. Repeated practice leaves the state machine in a terminal state

The first practice run correctly reached `playing` and then `completed`. Starting another allowed practice run made `SR.active === true` and `SR.assessOn === true`, but `SR.srtState.name` remained `completed` throughout playback. Practice is specified as unlimited and each run must traverse `preparing → countIn → playing → completed`.

### 4. Timing-result symbols are inaccurate and below contrast requirements

`srAssessFinish()` maps every matched result other than `good` to `near`, except `missed`. Consequently `lateOrEarly` receives `≈` and the “Nearly on time” title even though it receives zero rhythm credit. The new colored glyphs also fail 4.5:1 in both themes for multiple states.

### 5. Required browser suites are still missing

The only Sight-Reading Playwright file contains five tests. It does not cover the mandatory recorder matrix, two-tab locks/recovery/limits, pending-save behavior, backup merge/conflict cases, no-Web-Locks fallback, language/theme/viewport/contrast matrix, or a full offline UI journey. Manual Inspector probes cannot replace repository regression tests explicitly required by the goal.

### 6. Focus release incorrectly finalizes held MIDI/BLE recorder notes

The input ownership layer deliberately preserves MIDI and BLE notes on window blur, but `releaseFocusInput()` then invokes recorder-wide `releaseAll('focus', ...)`. This assigns a synthetic focus release to every recorder-held note, including physical MIDI/BLE notes that are still down.

### 7. No-Web-Locks explanation is overwritten

With `navigator.locks` unavailable, practice does start, but the required explanation is assigned and overwritten synchronously by `srAssessStart()`. The visible verdict is only `Count-in…`, so users are not told why first-sight mode was disabled.

### 8. Backup validation accepts malformed record shapes

`isLedger()` checks `prefs` and `sessions` only as non-null objects, so arrays pass. Importing a v3 backup with `sightLedger.prefs: []` was accepted rather than rejected as malformed. Strict validation must require record shapes and validate their values.

### 9. Flow coverage remains incomplete

The added flow tests cover the principal happy paths, practice, pending-save outcomes, and some illegal events, but not every legal transition promised by AC4. Final states and blocked/interrupted branches need exhaustive table-driven coverage.

### 10. The offline test bypasses the user flow

The offline test calls exported pure functions and `srtLedgerUpdate()` directly. It never uses the preview, count-in, recorder, keyboard pipeline, attempt lease, result UI, or normal save path, so major offline integration failures could still pass.

## What Must Be Fixed

1. Change P1.b–P2.c maximum diatonic leap from `3` to `2` in both generation and validation, then independently assert that exact invariant across all 12,000 pieces.
2. Preserve unsupported/newer ledger bytes in `srtReadLedger()` and disable only first-sight operations; add a browser regression test.
3. Reset practice into `preparing` before every run so unlimited retries traverse the full state sequence.
4. Map `lateOrEarly` to the late/missed visible state and use theme-safe symbol colors with at least 4.5:1 contrast.
5. Release only focus-owned keyboard/pointer recorder notes on blur; keep held MIDI/BLE notes open until their physical note-off or reset.
6. Preserve a visible no-Web-Locks explanation while practice remains usable.
7. Require record-shaped `prefs`, `sessions`, `exposures`, and `attempts`, and add strict malformed-import tests.
8. Add the complete mandatory Playwright suites for recorder, flow, ledger concurrency/recovery/limits, backup, no-Web-Locks fallback, UI/accessibility matrices, and full offline first-attempt behavior.
9. Make flow transition tests exhaustive and table-driven.
10. Re-run the exact full quality gate and the manual keyboard/reload journey.

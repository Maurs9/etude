# Inspector Feedback — Iteration 10

## Verdict: PASS

## Acceptance Criteria Check

- [x] **AC1 — M1, model and fingerprint — verified.** `src/sight-reading/model.ts` enforces the v1 piece schema, 480 ticks per quarter, exact four-bar coverage, range/leap/rest/fingering constraints, stable `eventId ↔ nid` conversion and expected-note construction. `src/sight-reading/fingerprint.ts` implements the specified canonical v1 string and synchronous UTF-8 FNV-1a 64-bit hash. The unit suite proves both exact vectors (`v1:e8020957ec2a1005`, `v1:8472a9986749aba1`) and proves that seed, title, BPM, event ID, finger and profile ID do not affect the fingerprint.
- [x] **AC2 — M2, evaluator — verified, including the iteration-10 regression.** `evaluate.ts` performs monotone dynamic-programming matching independently by MIDI pitch, maximizes matches, minimizes absolute timing cost and applies the required stable tie order. It caps the configured association window with `Math.min(250, windowMs)`, narrows close same-pitch repeats to `45%` of the nearest-neighbor delta, uses inclusive `100 / 180 / 250 ms` classification boundaries, excludes extras inside neighboring association windows from `restViolations`, returns the complete scoring object and handles `N = 0` as invalid.
  - The actual committed test body in `tests/sight-reading-core.test.mjs` now constructs every close-repeat case with correct attacks at `0 ms` and `300 ms`, plus a candidate at `135`, `136`, `150`, `164` or `165 ms`.
  - Every case asserts `TP: 2`, `FN: 0`, `FP: 1`, and asserts that the candidate ID is in `extraInputs`.
  - It asserts `restViolations: 0` at `135` and `165 ms`, and `restViolations: 1` at `136`, `150` and `164 ms`.
  - An independent direct probe produced exactly those five results. It also confirmed that `windowMs: 500` does not match an attack at `400 ms`, `windowMs: 100` does not match an attack at `101 ms`, and `-1`, `NaN` and `Infinity` each throw `RangeError: windowMs must be a finite, non-negative number`.
  - The focused evaluator regression run passed all three target tests: the 250 ms cap, narrowed close-repeat boundaries, and smaller/invalid configured windows.
  - The complete six acceptance vectors, substitution, chord order, close repeats, rest violations, stars/Perfect, invalid empty input and complete return values remain covered and passed.
- [x] **AC3 — M5, generator — verified.** `generator.ts` uses an internal Mulberry32 PRNG and no `Math.random`. The independent invariant test iterates profiles `P1.a`–`P2.c`, both hands and seeds `0..999` for 12,000 generated pieces. It checks determinism, validation, meter, non-empty bars, no initial rest, no barline crossing, exact bar fill, cadence, pitch ranges, diatonic leap limits, required rests/repeats and fingering. Invalid profiles are rejected.
- [x] **AC4 — flow — verified.** `srtTransition` is pure. The test matrix enumerates every legal transition for first-sight, practice, interruption and pending-save states, then iterates every other event and proves it leaves the state unchanged.
- [x] **AC5 — M3, recorder/input contract — verified.** The input pipeline propagates `on`/`off`, MIDI, source and release kind. The recorder enforces `[-250 ms, T + 250 ms]`, ignores pre-window holds until release, excludes `srClick`, `previewNote`, `srListen` and `srPlayGap`, deduplicates held note-ons, preserves mixed keyboard/MIDI ownership, and handles focus and panic/reset releases. Browser tests exercise keyboard, pointer, MIDI and BLE routes without changing other-view input routing.
- [x] **AC6 — M4 and M7, assess/first-attempt behavior — verified.** Assess mode builds expected notes, freezes recorder input behind the `T + 250 ms` barrier, evaluates with `srtEvaluate`, moves only the cursor while playing, paints notes only after completion, and sets `SR.wrongExtra = evaluated.FP`. Generated ephemeral pieces do not write `data.sheet[id].best`. Browser coverage verifies claiming, the visible 20-second preview/countdown, Start now, Switch to practice, count-in, playing, saved/pending-save outcomes, repeated practice, and invalidation on Listen, refresh, visibility loss, panic and interruptions.
- [x] **AC7 — M6, ledger — verified.** `ledger.ts` implements the attempt-lock-before-short-ledger-lock protocol, atomic two-tab claiming, active and pending-save protection, orphan recovery with `ifAvailable: true`, stale-generation and owner checks, idempotent terminal retries, 500-attempt trimming, 4096-exposure rejection, newer-schema preservation and the no-Web-Locks practice fallback. The full browser lifecycle and concurrency tests passed.
- [x] **AC8 — M8, backup — verified.** Export includes optional `sightLedger`; old v3 backups without it remain accepted. Import preserves the local generation and local active claims, abandons imported unfinished claims, unions exposures and attempts, normalizes old `mixedInput`, and rejects conflicting attempt IDs and malformed nested ledger data. Unit and browser import/export tests passed.
- [x] **AC9 — M9, UI/accessibility/i18n — verified.** The verdict exposes score, first-sight/practice badge, pitch F1, `TP/N`, `FP`, rhythm accuracy and mean offset. Notes use visible `✓`, `≈`, `✗` and extra `+N` symbols with localized SVG titles. The aria-live mutation test proves no continuous playing-time announcements. All 23 new sight-reading keys are non-empty in en, ro, es, fr, de, it and pt-BR; duplicate-key and localization tests passed. The 320, 390, 1024, 1920 and short-landscape matrices, theme/language changes, reduced motion, narrow-preview focus and 4.5:1 symbol contrast all passed.
- [x] **AC10 — M10, offline — verified.** The service-worker project passed both the pure generation/fingerprint/evaluation/ledger offline path and the full first-attempt UI path with keyboard input and a saved result. The implementation does not use `crypto.subtle`.
- [x] **AC11 — quality gates — verified.** The exact required gate passed: strict typecheck/suppression checks, lint, 109 unit tests, production build, standalone build and 260 Playwright tests. There were zero failures and zero skips in the full gate. The sight-reading TypeScript modules contain no explicit `any`, no TypeScript suppression directives, no prohibited casts and no `crypto.subtle`; the generator contains no `Math.random`.
- [x] **AC12 — no regressions — verified.** Relative to initial SHA `a26497d263a31d1c0d74921a07ea4b8720d8af6c`, all pre-existing tests remain byte-for-byte unchanged; only new sight-reading test files were added. The golden test source and protected checker/config files are unchanged. The passing suite includes application boot and all-view navigation, repertoire Read & Play behavior, standalone, deployment/service-worker and golden recording/engraving checks.

## Previous User Requirements Recheck

- [x] **Exact close-repeat rest regression:** every 135/136/150/164/165 case has correct performed attacks at 0 and 300 ms, `TP 2`, `FN 0`, `FP 1`, candidate membership in `extraInputs`, and the required `0/1/1/1/0` rest-violation results.
- [x] **Evaluator window contract:** values above 250 ms are capped, smaller finite non-negative values remain effective, and negative/non-finite values are rejected.
- [x] **Recorder and `mixedInput`:** mixed-source ownership, source-family classification, persistence, old-attempt normalization and strict backup validation remain covered and passing.
- [x] **Audio/BLE interruption:** audio suspension and live BLE disconnection create an interrupted terminal attempt, clear the claim and release the attempt lock.
- [x] **Note-name restriction:** saved note-name assistance is hidden during claiming/preview/count-in/playing for an eligible first-sight attempt and restored for practice.
- [x] **Ledger lifecycle:** lock order, two-tab atomicity, active/pending-save protection, orphan recovery, reset/stale generation, owner mismatch, idempotency, quotas and unsupported/newer-ledger fallbacks all pass.
- [x] **Backup lifecycle:** export/import, old backups, local generation and claim preservation, imported-claim abandonment, union, conflict rejection and malformed data rejection all pass.
- [x] **UI/accessibility/i18n/responsive:** explainable summary, non-colour symbols/titles, aria-live behavior, seven languages, themes, reduced motion, contrast and the full viewport matrix pass.
- [x] **Offline:** both service-worker-backed sight-reading journeys pass.
- [x] **Mandatory coverage and unchanged tests:** every required pure/integration/lifecycle area is exercised; baseline tests and goldens are unchanged; no new source-level skips exist.
- [x] **Exclusions and hygiene:** no `.DS_Store`, `node_modules/`, `test-results/` or `dist/` output is tracked. Both latest-commit and goal-wide `git diff --check` passed.

## Quality Gate

- Command: `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test`
- Port handling: port `8787` was checked before the gate and was free. No unknown server was stopped.
- Result: **PASS**
- Details:
  - Typecheck: PASS — suppression checker and strict TypeScript; `0 explicit any values`.
  - Lint: PASS.
  - Unit: PASS — 15 files, 109 tests.
  - Build: PASS.
  - Standalone build: PASS.
  - Playwright: PASS — 260 passed in approximately 1.5 minutes, zero failures and zero skips.

## Manual Browser Verification

A separate headed system-Chrome journey ran against a temporary Vite server on port `8799`, using real timers and real computer-keyboard input:

1. Cleared local/session storage, generated a fresh piece and entered the visible first-sight preview.
2. Verified the visible countdown text was `Start now · 20 s`.
3. Used **Start now**, waited for real `playing`, pressed and released keyboard key `A`, and waited for natural completion and save.
4. Verified state `saved`, one completed ledger attempt, no remaining claim, no page errors and no console errors. The visible summary was:
   `Score: 5% · First sight · Pitch F1 17% · Notes TP 1/11 · Extra attacks FP 0 · Rhythm 5% · Mean offset -137 ms`.
5. Reloaded, regenerated the identical fingerprint `v1:cce988c065a68751`, and pressed Start again.
6. Verified the preview remained hidden and the flow entered `practice` / `countIn`, with the completed attempt retained.
7. Closed Chrome and stopped the temporary server; port `8799` was free afterward.

## Commit and Tree Checks

- Builder commit: `64eb0af fix(sight-reading): [B] prove close-repeat rest boundaries`.
- Builder title: PASS — 58 characters, within the 72-character limit.
- Builder trailers: PASS — `Assisted-by: GPT:5.6-Luna` and the Copilot co-author trailer are present.
- Branch: PASS — `feat/sight-reading-v3`.
- Latest Builder diff: only `tests/sight-reading-core.test.mjs`, with the exact requested regression assertions and additional smaller/invalid-window coverage.
- Builder diff check: PASS.
- Goal-wide diff check: PASS.
- Existing tests and goldens: PASS — no baseline test was modified or removed; golden recordings and engraving passed.
- Worktree before Inspector output: clean.

## Issues Found

None.

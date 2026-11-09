# Inspector Feedback — Iteration 9

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — M1, model and fingerprint — verified.** `model.ts` and `fingerprint.ts` still implement the v1 model, 480 ticks per quarter, structural/profile validation, stable `eventId ↔ nid` mapping, expected-note construction, canonical serialization and synchronous UTF-8 FNV-1a 64-bit hashing. The exact reference fingerprints remain `v1:e8020957ec2a1005` and `v1:8472a9986749aba1`, and the tests prove seed, title, BPM, event ID, finger and profile ID do not affect the fingerprint.
- [ ] **AC2 — M2, evaluator — FAILED on required regression-test evidence.** The implementation now correctly clamps the effective association window to `min(250, configuredWindowMs)`, preserves smaller configured windows and rejects negative/non-finite values. Independent probes confirmed:
  - `{ windowMs: 500 }` with a lone note and a 400 ms-late attack returns `TP: 0, FN: 1, FP: 1`;
  - `{ windowMs: 500 }` with a rest extra at 400 ms returns `restViolations: 1`;
  - `{ windowMs: 100 }` does not match an attack at 101 ms;
  - `windowMs` values `-1`, `NaN` and `Infinity` throw `RangeError: windowMs must be a finite, non-negative number`;
  - with correct neighboring attacks at 0 and 300 ms plus a genuine extra attack, the narrowed 135 ms rest boundaries behave correctly: 135/165 are excluded and 136/150/164 count.

  However, the committed close-repeat test at `tests/sight-reading-core.test.mjs:151-166` does **not genuinely test rest extras at the inclusive boundaries**. It supplies only the alleged boundary input and omits the correct attacks at 0 and 300 ms. Consequently, the inputs at 135 and 165 ms are matched to an expected note and are not `extraInputs` at all:
  - 135 ms produces `TP: 1, FP: 0, FN: 1, restViolations: 0`, with the input matched to `previous`;
  - 165 ms produces `TP: 1, FP: 0, FN: 1, restViolations: 0`, with the input matched to `next`.

  Therefore those assertions would still pass if the rest-neighbor exclusion logic were broken at the inclusive 135/165 boundaries. The exact regression coverage explicitly requested for iteration 9 is still missing.
- [x] **AC3 — M5, generator — verified.** The implementation uses internal Mulberry32 and no `Math.random`. The 12,000-piece test independently checks every profile, both hands and seeds 0–999 for meter, complete/non-empty bars, no initial rest, no barline crossing, range, diatonic leap, cadence, required rests/repeats and fingering, with validation and determinism checks.
- [x] **AC4 — flow — verified.** The pure transition suite enumerates all legal transitions and proves all other events leave each state unchanged, including first-sight, practice, interruption and pending-save states.
- [x] **AC5 — M3, recorder/input contract — verified.** Code and browser tests cover `on`/`off`, source and release metadata, the `[-250 ms, T + 250 ms]` capture window, pre-window holds, duplicate attacks, excluded playback sources, keyboard/pointer/MIDI/BLE ownership, focus release and panic/reset behavior. Existing input routes remain covered.
- [x] **AC6 — M4 and M7, assess/first-attempt behavior — verified.** Integration uses `srtEvaluate`, completes behind the `T + 250 ms` barrier, moves only the cursor while playing, paints results after completion, keeps generated results out of `data.sheet`, sets `SR.wrongExtra = FP`, and covers preview/count-in/play/save/practice, pending-save outcomes and Listen/refresh/visibility invalidation.
- [x] **AC7 — M6, ledger — verified.** The implementation and passing browser suites cover attempt-lock-before-short-ledger-lock ordering, two-tab atomic claims, pending-save/orphan protection with `ifAvailable`, stale generations, owner mismatch, idempotency, 500/4096 limits, newer-schema preservation and the no-Web-Locks practice fallback.
- [x] **AC8 — M8, backup — verified.** Export includes optional `sightLedger`; old v3 backups remain accepted; import preserves the local generation and active claims, abandons imported unfinished claims, unions records and rejects conflicting attempts. Nested ledger and `mixedInput` validation remains strict.
- [x] **AC9 — M9, UI/accessibility/i18n — verified.** The summary exposes F1, TP/N, FP, rhythm and mean offset with first-sight/practice mode. Non-colour symbols and localized SVG titles remain present. Aria-live behavior, all seven languages, responsive viewports, short landscape, themes, reduced motion and 4.5:1 symbol contrast pass.
- [x] **AC10 — M10, offline — verified.** Both pure offline operation and the service-worker-backed first-attempt UI journey with keyboard input and a saved result pass without `crypto.subtle`.
- [x] **AC11 — quality gates — verified.** The exact required gate passed: strict typecheck/suppression checks, lint, 108 unit tests, production build, standalone build and 260 Playwright tests, with zero failures and zero skips. Sight-reading modules contain no explicit `any`, TypeScript suppression directives, prohibited casts or `crypto.subtle`; the generator contains no `Math.random`.
- [x] **AC12 — no regressions — verified.** Every test present at initial SHA `a26497d263a31d1c0d74921a07ea4b8720d8af6c` still exists unchanged. Goldens and protected checker/config files are unchanged. The full suite boots and visits every view without uncaught errors, golden recordings/engraving pass, exclusions are not tracked, and both latest-commit and goal-wide `git diff --check` pass.

## Previous User Requirements Recheck

- [x] **Evaluator cap and configuration contract:** the effective window is capped at an absolute 250 ms, smaller configured values remain effective, and negative/non-finite values are rejected with a `RangeError`.
- [ ] **Exact close-repeat regression coverage:** FAILED because the 135/165 ms inputs in the committed test are matched notes rather than genuine extras.
- [x] **Recorder and mixedInput:** keyboard/MIDI classification, persistence, old-attempt normalization and strict backup validation remain covered.
- [x] **Audio/BLE interruption:** audio suspension and live BLE disconnection persist an interrupted terminal attempt, clear the exposure claim and release the attempt lock.
- [x] **Note-name restriction:** saved note names are hidden through eligible claiming/preview/count-in/play and restored for practice.
- [x] **Ledger lifecycle:** lock order, active/pending-save protection, orphan recovery, stale generation, owner mismatch, idempotency, quotas and unsupported-ledger/Web-Locks fallbacks pass.
- [x] **Backup lifecycle:** export/import, old backups, local generation/claim preservation, imported-claim abandonment, union and conflict rejection pass.
- [x] **UI/accessibility/i18n/responsive:** summaries, symbols/titles, aria-live, all languages, themes, reduced motion, contrast and the viewport matrix pass.
- [x] **Offline:** service-worker and first-attempt offline journeys pass.
- [x] **Coverage and unchanged tests:** all required module/integration/lifecycle matrices are present and passing except the exact boundary-extra proof above; baseline tests and goldens remain unchanged.
- [x] **Exclusions and hygiene:** no tracked `.DS_Store`, `node_modules/`, `test-results/` or `dist/`; the temporary manual server was stopped and the tree was clean before writing this feedback.

## Quality Gate

- Command: `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test`
- Port handling: port `8787` was checked before the gate and was free; no unknown server was stopped.
- Result: **PASS**
- Details:
  - Typecheck: PASS — suppression checker and strict TypeScript; `0 explicit any values`.
  - Lint: PASS.
  - Unit: PASS — 15 files, 108 tests.
  - Build: PASS.
  - Standalone build: PASS.
  - Playwright: PASS — 260 passed in approximately 1.7 minutes, zero failures and zero skips.

## Manual Browser Verification

A separate real Chrome journey on a temporary local server used real timers and real computer-keyboard input:

1. Cleared local/session storage, generated a fresh piece and entered the visible first-sight preview.
2. Used **Start now**, waited for real `playing`, pressed and released keyboard key `A`, and waited for the natural completion/save barrier.
3. Verified state `saved`, a completed ledger attempt, no page/console errors and the visible summary:
   `Score: 5% · First sight · Pitch F1 17% · Notes TP 1/11 · Extra attacks FP 0 · Rhythm 5% · Mean offset -139 ms`.
4. Reloaded, regenerated the identical fingerprint `v1:cce988c065a68751`, and started again.
5. Verified the preview stayed hidden and the state entered `practice`/`countIn`, with the completed attempt retained.

## Commit and Tree Checks

- Builder commit: `baa2027 fix(sight-reading): [B] cap evaluator association window`.
- Builder title: PASS — 56 characters.
- Builder trailers: PASS — `Assisted-by: GPT:5.6-Luna` and the Copilot co-author trailer are present.
- Branch: PASS — `feat/sight-reading-v3`.
- Builder diff check: PASS.
- Goal-wide diff check: PASS.
- Existing tests and goldens: PASS — no baseline test changed or disappeared.
- Exclusions: PASS — no excluded output is tracked.

## Issues Found

### 1. The close-repeat boundary test does not exercise `restViolations` for genuine extra inputs

The helper in `tests/sight-reading-core.test.mjs:157-159` evaluates only one performed attack:

```js
const evaluateExtra = (onMs) => srtEvaluate(repeatedExpected, [
  { id: `extra-${onMs}`, midi: 60, onMs },
], { restWindows }).restViolations;
```

At exactly 135 ms and 165 ms, that attack is inside an inclusive association window and is consumed as the match for the previous or next expected note. It never reaches the `extras` collection used to calculate `restViolations`. The assertions prove matching inclusivity, not that a genuine unmatched extra inside a neighboring association window is excluded from a rest violation.

The implementation itself behaves correctly when independently probed with correct performed attacks at 0 and 300 ms plus a third extra attack. The failure is the required committed regression evidence, not the current evaluator behavior.

## What Must Be Fixed

1. Rewrite the close-repeat rest helper so every case includes correct attacks for both expected notes at 0 and 300 ms **plus** the candidate extra at 135, 136, 150, 164 or 165 ms.
2. For every boundary case, assert that the result has `TP: 2`, `FN: 0`, `FP: 1` and that the candidate ID is present in `extraInputs`. Then assert:
   - 135 ms → `restViolations: 0`;
   - 165 ms → `restViolations: 0`;
   - 136 ms, 150 ms and 164 ms → `restViolations: 1`.
3. Keep the existing 500 ms cap tests. Prefer adding explicit assertions for the smaller-window and invalid-window contract as well so those iteration-9 requirements cannot regress.
4. Re-run the exact full gate.

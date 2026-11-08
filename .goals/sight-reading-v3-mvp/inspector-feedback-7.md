# Inspector Feedback — Iteration 7

## Verdict: PASS

## Acceptance Criteria Check

- [x] **AC1 — M1, model and fingerprint — verified.** The strict TypeScript model uses 480 ticks per quarter, validates the v1 schema, preserves stable `eventId ↔ nid` mapping, and builds expected events. The canonical FNV-1a fingerprints match `v1:e8020957ec2a1005` and `v1:8472a9986749aba1`, and the unit suite proves that seed, title, BPM, event ID, fingering and profile ID do not affect the fingerprint.
- [x] **AC2 — M2, evaluator — verified.** The evaluator suite covers monotone per-pitch matching, the 45% repeated-note window, inclusive 100/180/250 ms boundaries, chord order, substitutions, extras, silence, rest violations, stars, Perfect, `N = 0`, and all six acceptance vectors.
- [x] **AC3 — M5, generator — verified.** Generation uses Mulberry32 rather than `Math.random`; all P1.a–P2.c profiles, both hands and seeds 0–999 are checked for determinism and every required cadence, bar, range, leap, rest and fingering invariant.
- [x] **AC4 — flow — verified.** The pure transition suite covers every legal transition, rejects or preserves state for illegal events, and proves repeated practice can re-enter count-in, playing and completed states.
- [x] **AC5 — M3, recorder/input contract — verified.** The recorder enforces the `[-250 ms, T + 250 ms]` window, held-note exclusion, playback-source exclusions, duplicate suppression, focus/reset releases and the complete `kind`/`midi`/`source`/`releaseKind` contract. Iteration 7 additionally classifies keyboard, pointer, MIDI and BLE source families, tracks a second physical owner even when the pitch is already held, and persists `mixedInput: true` through an actual keyboard-plus-MIDI first-sight attempt.
- [x] **AC6 — M4 and M7, assess/first-attempt behavior — verified.** Assess mode waits through the evaluation barrier, keeps the score uncoloured while playing, colours and symbolizes it only after completion, keeps generated results out of `data.sheet[id].best`, and assigns `SR.wrongExtra = FP`. Browser coverage exercises the 20-second preview, Start now, practice switch, count-in, playing, completion, pending-save outcomes, Listen/refresh/hidden-page invalidation, audio-context suspension and BLE disconnect interruption. Eligible first sight suppresses saved note-name assistance and restores it in practice. The strengthened non-greedy test sends a real matching attack, proves it reached the recorder, observes no result styling during play, and observes result styling after completion.
- [x] **AC7 — M6, ledger — verified.** The two-lock protocol, atomic two-tab claiming, short ledger-lock release, pending-save protection, orphan recovery with `ifAvailable`, stale generation, owner mismatch, idempotency, 500/4096 limits and no-Web-Locks practice fallback all pass in browser tests. `mixedInput` is strictly validated, backward-normalized and retained by terminal attempts and export/import.
- [x] **AC8 — M8, backup — verified.** Export includes optional `sightLedger`; old v3 backups still import; local generation and active claims survive; imported unfinished claims become abandoned; exposures and attempts merge; conflicts and malformed nested data are rejected; quota failures remain explicit.
- [x] **AC9 — M9, UI/accessibility/i18n — verified.** The result summary exposes F1, TP/N, FP, rhythm accuracy, mean offset and first-sight/practice mode. Notes use non-colour symbols and localized SVG titles. Aria-live changes only on state transitions. The 320, 390, 1024, 1920 and short-landscape matrix, reduced motion, light/dark contrast, theme, resize and all seven languages pass. Every claim failure that can reach the blocked UI now maps to a localized string rather than exposing internal codes such as `quota`.
- [x] **AC10 — M10, offline — verified.** Three service-worker tests pass offline after warm-up, including generation, synchronous fingerprinting, evaluation, ledger operations, actual keyboard input and a saved first-attempt UI result.
- [x] **AC11 — quality gates — verified.** The exact required command passed with no failures or skips. TypeScript boundary checks report `0 explicit any values`; lint, strict typecheck, unit, production build, standalone build and all Playwright projects are green.
- [x] **AC12 — no regressions — verified.** No test present at the initial goal SHA was modified or removed. Goldens and protected checker/config files are unchanged. The complete app suite passes, including repertoire assess behavior, step-by-step practice, Listen, every-view boot coverage, storage compatibility and offline deployment behavior. The headed keyboard/reload journey confirms a completed generated piece is no longer first-sight eligible after reload.

## Required Browser Cases

- [x] Actual keyboard/MIDI ownership and persisted mixed-input provenance.
- [x] Pending-save Retry and Continue without saving.
- [x] Attempt-lock-before-ledger-lock ordering and short ledger-lock release.
- [x] Pending-save protection from orphan recovery in another tab.
- [x] Atomic two-tab claim, stale generation, owner mismatch and terminal idempotency.
- [x] Both 500-attempt and 4096-exposure limits.
- [x] Full 20-second preview expiry with clock control.
- [x] Listen, refresh, hidden-page, suspended-audio and BLE-disconnect interruption.
- [x] Real input during playing without greedy colouring, followed by completion colouring.
- [x] Note-name assistance suppression during eligible first sight and restoration in practice.
- [x] Aria-live state-transition behavior.
- [x] Completed-result relocalization and note titles in en, ro, es, fr, de, it and pt-BR.
- [x] Responsive, theme, contrast and reduced-motion matrices.
- [x] Full first-attempt flow through the service worker while offline.

## Dedicated Suites

- Command: `npx vitest run tests/sight-reading-*.test.mjs`
- Result: PASS — 7 files, 73 tests.
- Command: `npx playwright test tests/sight-reading-*.spec.mjs --project=app`
- Result: PASS — 46 tests.
- Command: `npx playwright test tests/sight-reading-*.spec.mjs --project=sw`
- Result: PASS — 3 tests.

## Quality Gate

- Command: `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test`
- Port handling: port `8787` was verified free before every Playwright run, so the repository's exact default configuration was used. No unknown server was stopped.
- Result: PASS.
- Details:
  - Typecheck: PASS — suppression checker and strict TypeScript; `0 explicit any values`.
  - Lint: PASS.
  - Unit: PASS — 15 files, 105 tests.
  - Build: PASS.
  - Standalone build: PASS.
  - Playwright: PASS — 260 passed in approximately 1.6 minutes, zero failures and zero skips.

## Headed Keyboard/Reload Verification

Command:

`npx playwright test tests/sight-reading-v5.spec.mjs --project=app --headed --workers=1 --grep 'completes first-sight preview, count-in, playing, save, and practice transition'`

Result: PASS. The headed Chrome journey generated a fresh piece, entered first-sight preview, started the attempt, sent a real computer-keyboard attack, completed and saved the result, reloaded, regenerated the same deterministic piece, and verified that preview stayed hidden and the piece opened in practice mode.

## Commit and Tree Checks

- Builder commit: `e9222d6 fix(sight-reading): [B] close iteration 7 feedback`.
- Builder title: PASS — within 72 characters.
- Builder trailers: PASS — exact required Builder Assisted-by and Copilot co-author trailers are present.
- Branch: PASS — `feat/sight-reading-v3`.
- Builder diff check: PASS — `git diff --check e9222d6^ e9222d6`.
- Goal-wide diff check: PASS.
- Existing tests: PASS — no test present at initial SHA `a26497d263a31d1c0d74921a07ea4b8720d8af6c` changed or disappeared.
- Goldens: PASS — unchanged.
- Protected checker/config files: PASS — unchanged.
- Exclusions: PASS — no tracked `.DS_Store`, `node_modules/`, `test-results/` or `dist/`.
- The untracked `.tmp-playwright-inspector-7.mjs` remains outside this Inspector commit.

## Issues Found

None.

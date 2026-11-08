# Inspector Feedback — Iteration 5

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — M1, model and fingerprint — verified.** The exact canonical strings and both required FNV-1a vectors pass (`v1:e8020957ec2a1005`, `v1:8472a9986749aba1`). Tests also prove that seed, title, BPM, event IDs, fingering and profile ID do not affect the fingerprint, and the legacy `eventId`/`nid` mapping is stable.
- [x] **AC2 — M2, evaluator — verified.** The six complete acceptance objects pass, including the exact score fields and note results. Inclusive `100 / 180 / 250 ms` boundaries, monotone matching, close repeated-note narrowing, chord order, rest violations, substitution accounting, stars, Perfect and `N = 0` are covered.
- [x] **AC3 — M5, generator — verified.** The implementation now uses a maximum diatonic scale-index distance of `2` for P1.b–P2.c. An Inspector-authored browser probe independently checked all 12,000 profile/hand/seed combinations with hard-coded specification limits: `runs: 12000`, `maxLeap: 2`, and no failures for determinism, cadence, first-beat rest, bar filling, barline crossing, range, leap, rests, repeats or fingering.
- [x] **AC4 — flow — verified.** `tests/sight-reading-flow.test.mjs` now table-checks every legal transition and rejects every event not legal for each state. Browser verification also confirmed repeated practice can complete multiple `countIn → playing → completed` lifecycles instead of remaining in the previous terminal state.
- [ ] **AC5 — M3, recorder — FAILED.** Focus release is still wrong when a pitch has mixed input ownership. In a real browser, pressing MIDI 60 while computer-keyboard 60 was already held, then calling `releaseFocusInput()`, produced:
  - after focus loss: `{ source: "typing:KeyA", offMs: 1, releaseKind: "focus" }`
  - after the physical MIDI note-off: the same already-closed recorder entry.

  The sounding-note ownership layer correctly kept MIDI as an owner, so the recorder attack must also remain open until that last physical owner releases. The new recorder test uses different pitches and calls `recorder.record()` directly, so it cannot detect this integration defect.
- [ ] **AC6 — M4 and M7, assess mode — FAILED on required Playwright coverage.** The main first-sight flow, save, reload-to-practice behavior, `lateOrEarly` painting, repeated practice and the evaluator barrier work in browser probes. The permanent suite still does not cover every required flow:
  - the test named “covers pending-save retry and continue-without-save outcomes” exercises only Retry and never clicks `#rd-srt-continue`;
  - no test advances the visible preview through the full automatic 20-second expiry;
  - no committed Playwright test dispatches/verifies hidden-page invalidation;
  - no committed test proves that only the cursor changes during `playing`.

  Inspector probes verified Continue without saving and hidden-page invalidation functionally, but the goal explicitly requires repository Playwright regression tests for these cases.
- [ ] **AC7 — M6, ledger — FAILED on required Playwright coverage.** Functional browser probes verified:
  - lock acquisition order is attempt lock first, then the short ledger lock;
  - after claiming, only the attempt lock remains held;
  - a second tab cannot recover a real `pendingSave` claim;
  - Continue without saving writes `abandoned` and clears the claim;
  - newer-ledger preservation, two-tab claiming, stale generation and no-Web-Locks explanation work.

  However, these mandatory cases are not all in the committed Playwright suite. It has no lock-order assertion, no real pending-save cross-tab recovery test, no browser idempotency or `owner_mismatch` test, and no 500-attempt bound test. The test titled “enforces exposure and attempt limits” checks only the 4096-exposure limit.
- [x] **AC8 — M8, backup — verified.** Export includes `sightLedger`; old v3 backups without it remain accepted; local generation and active claims are preserved; imported unfinished claims become `abandoned`; exposures and attempts merge; conflicts are rejected; and arrays for `prefs`, `sessions`, `attempts` and `exposures` are rejected as malformed records.
- [ ] **AC9 — M9, UI and accessibility — FAILED.** The `lateOrEarly` result now renders as `✗`, and the light/dark symbol colours pass 4.5:1. All seven locale keys exist, responsive viewports pass, preview focus is visible, and reduced motion works. But completed results do not survive a language change correctly. An Inspector browser probe completed a practice result in English, changed the UI to Romanian, and observed:
  - before: `Score: 9% ... Practice ... Pitch F1 ...`, title `✓ Correct timing`;
  - after `setLang('ro')`: `<html lang="ro">`, but the verdict and title remained the same English strings.

  `setLang()` does not rerender `#rd-verdict` or call `srPaintAll()` for existing result symbols. The committed accessibility suite also has no assertion for the “aria-live announces only state changes” requirement.
- [x] **AC10 — M10, offline — verified.** The `@sw` project now completes the actual first-attempt UI flow offline after the worker is warm: generation, preview, count-in, keyboard input, evaluation, result UI and terminal ledger save. The full suite includes two actual offline Sight-Reading UI journeys.
- [x] **AC11 — quality gates — verified.** The exact gate passed using a temporary untracked Playwright config on free port `54593`, because unknown PID `68471` was already listening on `8787`. The unknown server was not stopped. Results: typecheck PASS, lint PASS, 14 Vitest files / 101 tests PASS, both builds PASS, and 247 Playwright tests PASS with zero failures and zero skips.
- [x] **AC12 — no regressions — verified.** The diff from the goal baseline only adds Sight-Reading test files; no pre-existing test was changed, removed or weakened. Goldens are unchanged. The full suite passes, browser probes reported no uncaught errors, and an independent first-sight keyboard journey saved a completed attempt and reloaded the same piece directly into practice with the preview hidden.

## Quality Gate

- Command: `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test`
- Port handling: port `8787` was occupied by unknown PID `68471`; a temporary untracked config ran the Playwright portion on free port `54593` and was deleted afterward. No unknown process was killed.
- Result: PASS
- Details:
  - Typecheck: PASS — suppression checker and strict TypeScript; `0 explicit any values`.
  - Lint: PASS.
  - Unit: PASS — 14 files, 101 tests.
  - Build: PASS.
  - Standalone build: PASS.
  - Playwright: PASS — 247 passed in approximately 1.4 minutes, zero failures and zero skips.

## Commit and Tree Checks

- Builder commit: `ac20ed6 fix(sight-reading): [B] complete MVP iteration 5`.
- Builder title: within 72 characters.
- Builder trailers: PASS — `Assisted-by: GPT:5.6-Luna` and the required Copilot co-author trailer are present.
- Branch: PASS — `feat/sight-reading-v3`.
- Builder diff hygiene: PASS — `git diff --check ac20ed6^..ac20ed6`.
- Goal-wide exclusions: PASS — no `.DS_Store`, `node_modules/`, `test-results/` or `dist/` entries were committed.
- Goldens: PASS — no golden file changed.
- Existing tests: PASS — every test change since the baseline is an added Sight-Reading test file; existing test files are unchanged.

## Issues Found

### 1. Focus release closes a recorder attack while a physical owner still holds the pitch

`releaseFocusInput()` first uses `inputOwners` correctly: if keyboard ownership is removed but MIDI ownership remains, `handleNoteOff()` does not emit an `off`. It then bypasses that ownership result by calling `srtRecorder.releaseFocus()`, which closes every recorder entry whose original source was not MIDI/BLE. For a keyboard-first, MIDI-second attack on the same pitch, this creates a false focus note-off while the note remains physically down.

The correct recorder boundary is the final owner release already emitted by `handleNoteOff()`. Focus cleanup must not independently close a recorder entry when another owner remains.

### 2. Completed Sight-Reading results remain in the old language

The normal i18n pass updates static `data-i18n` content, but the result summary and SVG result titles are generated dynamically. `setLang()` does not rerender the stored result summary or repaint symbol titles. This leaves English result content under `<html lang="ro">` and likewise affects every language switch after completion.

### 3. Mandatory browser coverage is still incomplete despite passing test names

Several test names overstate what their bodies assert:

- “pending-save retry and continue-without-save outcomes” never executes Continue without saving;
- “enforces exposure and attempt limits” never constructs or verifies the 500-attempt case;
- the recorder focus test uses separate pitches and direct recorder calls, not mixed owners through `handleNoteOn`/`handleNoteOff`;
- no committed test records attempt-lock-before-ledger-lock ordering;
- no committed test protects a real UI `pendingSave` claim from another tab’s recovery;
- no committed test covers automatic 20-second preview expiry, hidden-page invalidation, post-result language change, aria-live discipline, browser idempotency or `owner_mismatch`.

These are explicitly required regression cases, so Inspector-only probes cannot substitute for them.

## What Must Be Fixed

1. Make focus cleanup ownership-aware. Do not call a recorder-wide focus release after `handleNoteOff()` has preserved another owner. Add a browser test where keyboard and MIDI own the same pitch; focus loss must leave `offMs` and `releaseKind` null until MIDI note-off.
2. Store enough completed-result state to rerender the verdict when the locale changes, and call the result-symbol repaint path so every `<title>` uses the new locale. Add a post-completion seven-locale browser test.
3. Add permanent Playwright cases for:
   - Continue without saving from an actual `pendingSave`;
   - a second tab attempting orphan recovery while the real pending-save lease is held;
   - attempt-lock-before-ledger-lock order and release of the short ledger lock;
   - idempotent terminal retry and `owner_mismatch`;
   - the 500-attempt bound as well as the 4096-exposure bound;
   - automatic 20-second preview expiry;
   - hidden-page invalidation;
   - no greedy note colouring during `playing`;
   - aria-live changing only at state transitions.
4. Re-run the exact full gate and the manual keyboard/reload journey.

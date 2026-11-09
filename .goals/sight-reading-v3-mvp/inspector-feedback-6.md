# Inspector Feedback — Iteration 6

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — M1, model and fingerprint — verified.** The model uses 480 ticks per quarter, validates the v1 structure/profile rules, preserves stable `eventId ↔ nid` mapping, and builds expected events. The canonical strings and required FNV-1a vectors pass exactly: `v1:e8020957ec2a1005` and `v1:8472a9986749aba1`. The tests also prove that seed, title, BPM, event ID, fingering and profile ID do not affect the fingerprint.
- [x] **AC2 — M2, evaluator — verified.** The implementation and tests cover monotone per-pitch matching, the 45% repeated-note window, inclusive 100/180/250 ms boundaries, chord order, substitutions, extras, silence, rest violations, stars, Perfect, `N = 0`, and the six complete acceptance objects.
- [x] **AC3 — M5, generator — verified.** The generator uses Mulberry32 and not `Math.random`. The independent invariant test checks all profiles, both hands and seeds 0–999 (12,000 pieces), including determinism, cadence, bar filling, rests, range, diatonic leaps and fingering.
- [x] **AC4 — flow — verified.** The pure transition suite enumerates every legal transition and checks every other event leaves each state unchanged. Repeated practice can re-enter `countIn → playing → completed`.
- [ ] **AC5 — M3, recorder/input contract — FAILED.** The mixed keyboard/MIDI ownership regression itself is fixed and its browser test now goes through `handleNoteOn`, `releaseFocusInput` and `handleNoteOff`. However, §5.3 also requires a source change during a first attempt to set `mixedInput: true`. There is no `mixedInput` implementation or test anywhere in `src/` or `tests/`. An Inspector browser probe played computer-keyboard and MIDI input in one first-sight attempt and inspected the saved ledger attempt; the attempt had no `mixedInput` property.
- [ ] **AC6 — M4 and M7, assess/first-attempt behavior — FAILED.**
  - Audio-context suspension does not invalidate an eligible attempt. In an Inspector browser probe, the state was `playing` with audio `running`; after `await actx.suspend()`, audio became `suspended`, but the state remained `playing` and the ledger still had one active claim. §5.3 explicitly requires suspension to produce `interrupted`.
  - First-sight preview does not suppress forbidden note-name assistance. With `#rd-names` checked before generation, the eligible preview still contained 11 `.ss-syl` note-name labels. §5.1 requires no note names during the eligible first attempt.
  - Actual runtime behavior after note input is non-greedy: an Inspector probe recorded one MIDI attack while `playing` and observed zero coloured notes and zero visible result symbols. But the new permanent test at `tests/sight-reading-v5.spec.mjs:248` never plays a note; it only waits and asserts the untouched score has no colours. It would pass if greedy colouring still occurred only in response to input, so it does not genuinely exercise the mandatory regression.
- [x] **AC7 — M6, ledger — verified.** The committed browser cases genuinely exercise two-tab atomic claiming, attempt-lock-before-ledger-lock ordering, release of the short ledger lock, real pending-save protection from another tab, stale generation, orphan recovery, terminal idempotency, owner mismatch, the 500-attempt bound, the 4096-exposure bound, and the no-Web-Locks practice fallback.
- [x] **AC8 — M8, backup — verified.** Export includes `sightLedger`; old v3 backups without it remain valid; import preserves the local generation and active local claim, abandons imported unfinished claims, unions attempts/exposures, rejects conflicts, validates malformed nested values and handles quota failures.
- [ ] **AC9 — M9, UI/accessibility/i18n — FAILED.** Completed-result relocalization now works across all seven locales, including the summary and each note SVG `<title>`. Responsive sizes, reduced motion, theme changes, symbols and contrast pass. However, blocked ledger reason codes are rendered directly to users instead of localized. At `views-runtime.ts:6284`, every failure other than `already_exposed` is assigned as raw `result.reason`. With Romanian active and a full 4096-exposure ledger, an Inspector browser probe produced `<html lang="ro">`, state `blocked`, and visible verdict text exactly `quota`. This violates the requirement that every new visible string exist in all seven locales.
- [x] **AC10 — M10, offline — verified.** The `@sw` project exercises both the pure generation/fingerprint/evaluation/ledger path and the actual first-attempt UI path offline after the service worker is warm.
- [x] **AC11 — quality gates — verified.** The exact required command passed with no failures or skips.
- [x] **AC12 — no regressions — verified.** No baseline test file was removed or modified; all Sight-Reading tests are additions. Goldens are unchanged, exclusions are clean, the app suite passes, and the headed manual keyboard/reload journey succeeded.

## Required Browser Cases

- [x] Mixed keyboard/MIDI ownership uses the actual note pipeline and keeps the attack open until the final physical owner releases.
- [x] Pending-save Retry and Continue without saving both execute real UI behavior.
- [x] Another tab cannot recover a real pending-save claim while its attempt lease is held.
- [x] Lock ordering and release are observed through `navigator.locks.request` during the real claim UI.
- [x] Terminal retry idempotency and `owner_mismatch` are exercised in the browser.
- [x] Both 500 attempts and 4096 exposures are exercised in the browser.
- [x] Preview expiry advances a fake clock through the full 20 seconds.
- [x] Hidden-page invalidation dispatches `visibilitychange` and verifies the interrupted ledger terminal.
- [ ] Playing non-greedy colouring test is inadequate: it sends no note input.
- [x] Aria-live normal-flow test observes verdict mutations through count-in, playing and completion and verifies no mutation during steady playing.
- [x] Completed-result relocalization covers en, ro, es, fr, de, it and pt-BR, including note SVG titles.

## Quality Gate

- Command: `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test`
- Port handling: port `8787` was free before the run, so the exact default Playwright configuration was used. No unknown server was stopped.
- Result: PASS
- Details:
  - Typecheck: PASS — suppression checker and strict TypeScript; `0 explicit any values`.
  - Lint: PASS.
  - Unit: PASS — 14 files, 102 tests.
  - Build: PASS.
  - Standalone build: PASS.
  - Playwright: PASS — 255 passed in approximately 1.5 minutes, zero failures and zero skips.

## Manual Browser Verification

A headed Chromium journey used the real computer-keyboard pipeline:

1. Generated a fresh piece and entered the visible first-sight preview.
2. Started the attempt, waited for `playing`, and pressed/released computer key `A`.
3. Verified the recorder entry was `{ source: "typing:KeyA", releaseKind: "physical", midi: 60 }`.
4. Completed and saved the result; the visible summary included first-sight badge, Pitch F1, TP/N, FP, rhythm and mean offset.
5. Reloaded, regenerated the same profile/seed and pressed Start.
6. Verified the preview stayed hidden, mode was `practice`, and the completed ledger attempt remained present.

No page errors were reported.

## Commit and Tree Checks

- Builder commit: `26ba74c fix(sight-reading): [B] close iteration 6 regressions`.
- Builder title: within 72 characters.
- Builder trailers: PASS — required Assisted-by and Copilot co-author trailers are present.
- Branch: PASS — `feat/sight-reading-v3`.
- Builder diff check: PASS — `git diff --check HEAD~1..HEAD`.
- Goal-wide diff check: PASS.
- Existing tests: PASS — no test present at the initial goal SHA was changed or removed.
- Goldens: PASS — unchanged.
- Exclusions: PASS — no tracked `.DS_Store`, `node_modules/`, `test-results/` or `dist/`.
- An unrelated untracked temporary Playwright config remained outside the Inspector commit.

## Issues Found

### 1. Mixed input is never identified

The specification requires changing among `midi`, `ble`, keyboard and pointer sources during a first-sight attempt to set `mixedInput: true`. The recorder stores the source per attack, but the session does not derive a mixed-source flag, the ledger attempt type has no such field, strict ledger validation does not accept it, and no UI or browser test checks it.

### 2. Audio suspension leaves an eligible first attempt active

There is no AudioContext state-change handler connected to the Sight-Reading state machine. Suspending the real context during `playing` leaves the attempt lease and ledger claim active and lets the state continue as `playing`, contrary to the required `interrupted` terminal behavior.

### 3. First-sight preview can show note names

`srRender` uses `SR.names` for generated pieces, and the first-sight path neither clears/overrides that setting nor gives the generated eligible piece a no-names restriction. A user who enabled note names previously receives those labels throughout the supposedly unaided preview.

### 4. Ledger failures leak untranslated internal reason codes

The blocked UI writes raw enum values such as `quota` and potentially `stale_generation` into `#rd-verdict`. These are internal protocol codes, not seven-locale user-facing strings.

### 5. The non-greedy colouring regression test does not trigger note handling

The implementation behaves correctly in the Inspector's actual-input probe, but the permanent test only observes an untouched playing score. The explicit test-coverage requirement is therefore not met.

## What Must Be Fixed

1. Track source families used during each first-sight attempt and persist `mixedInput: true` when more than one family is used. Extend the typed attempt contract, strict ledger validation, backup/import handling and browser coverage. The test must use actual keyboard/MIDI or pointer/MIDI input routes.
2. Subscribe to AudioContext state changes and interrupt an eligible attempt when the context becomes suspended. Add a Playwright case that suspends the real context and verifies state `interrupted`, terminal ledger state, cleared claim and released attempt lock. Ensure direct BLE-MIDI disconnect follows the same eligibility rule as Web MIDI disconnect.
3. Enforce the §5.1 assistance restrictions for an eligible first attempt. At minimum, hide note names regardless of the saved `#rd-names` preference during preview/count-in/playing, restore the preference for practice, and add a browser regression test starting with note names enabled.
4. Add localized messages for every ledger failure that can reach the UI (`quota`, `stale_generation`, and any other exposed reason), in all seven locales. Never render internal reason codes directly.
5. Strengthen the non-greedy Playwright test: send a matching attack through `handleNoteOn`/keyboard/MIDI while state is `playing`, prove the recorder received it, then assert no note `data-s` or result symbol appears until `srAssessFinish`; finally assert evaluation colouring does appear after completion.
6. Re-run the exact full gate and the headed keyboard/reload journey.

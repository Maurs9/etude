# Inspector Feedback — Iteration 1

## Verdict: FAIL

## Acceptance Criteria Check

- [ ] **AC1 — M1, model and fingerprint — FAILED.** The two required FNV-1a vectors pass, and the implementation is synchronous, but the tests do not prove that seed, title, BPM, `event.id`, `finger`, and `profileId` are ignored. The model/adapter behavior is not covered to the required depth, including a verified stable `eventId ↔ nid` mapping.
- [ ] **AC2 — M2, evaluator — FAILED.** The six headline score examples are only partially asserted in one unit test. There are no tests for the inclusive 100/180/250 ms boundaries, chord order, close repeated notes, rest violations, or `N = 0`. More importantly, close-note windows are applied only after the dynamic-programming match is selected; an invalid narrowed-window pair is discarded without recomputing the optimal matching, so the implemented algorithm is not the specified DP over valid candidates.
- [ ] **AC3 — M5, generator — FAILED.** The 12,000 deterministic calls pass `srtValidatePiece`, but the test delegates all invariant checking to an incomplete validator instead of asserting every listed invariant. `generator.ts` contains `if (bar >= 0 || ...) midi = minMidi`, whose first condition is always true, so every non-rest generated note is the tonic and the profile-specific random pitch/leap/repetition logic is unreachable. The validator also accepts chromatic pitches inside the numeric range and does not enforce the profile-specific allowed rest durations or the P1.c repeated-note requirement.
- [ ] **AC4 — flow — FAILED.** One happy-path test does not cover every legal transition. The state machine allows `preparing → preview` without claiming, and `switchToPractice` produces `abandoned` without switching `mode` to practice. Pending-save retry and the complete diagram are not represented or tested.
- [ ] **AC5 — M3, recorder — FAILED.** Input metadata propagation and some recorder filtering exist, but the required Playwright coverage does not exist. There are no browser tests for the capture boundaries, all excluded sources, focus/panic release behavior, or unchanged MIDI/keyboard/on-screen input behavior across views.
- [ ] **AC6 — M4 and M7, assess mode — FAILED.** The first-attempt workflow is not integrated. Real-browser inspection found no 20-second preview, countdown, “Start now”, or “Switch to practice”; clicking Start immediately entered the old count-in, and `etude-sight-v1` remained absent. The assess loop still greedily closes/colours notes and `srKeyInput` still greedily marks hits while playing. Completion waits `SR.totalBeats + 1` beat, not the required `T + 250 ms` barrier. The verdict omits `meanOffsetMs` and a first-sight/practice badge.
- [ ] **AC7 — M6, ledger — FAILED.** The ledger has only a single short ledger lock. It does not implement the long-lived `etude-sight-attempt-<attemptId>` lease, attempt-before-ledger lock order, pending-save protection, `recoverOrphanClaims` with `ifAvailable`, `recordListen`, `importLedger`, owner validation on finish, or the 4096 exposure limit. Atomic two-tab and reset/stale-generation Playwright tests are absent.
- [ ] **AC8 — M8, backup — FAILED.** Export includes `sightLedger`, but import directly overwrites `localStorage['etude-sight-v1']`. It does not preserve the local generation or active claims, abandon imported unfinished claims, union exposures/attempts, deduplicate identical attempts, or reject conflicting `attemptId` values. Required tests, including old-v3 compatibility and existing fixtures, are absent.
- [ ] **AC9 — M9, UI and accessibility — FAILED.** No new first-sight UI or localized strings were added. The summary lacks `meanOffsetMs` and the mode badge. Notes do not receive the required `✓`, `≈`, `✗`, and `+` non-colour symbols with `<title>`. There is no dedicated responsive/reduced-motion/theme/language test coverage for the new flow at the required viewports.
- [ ] **AC10 — M10, offline — FAILED.** There is no `@sw` Playwright test for the full Sight-Reading v3 flow offline. Since the first-attempt flow and ledger integration are absent online, the required offline journey cannot be completed either.
- [x] **AC11 — quality gates — verified.** With port 8787 confirmed free, the exact required command completed successfully: typecheck passed with 0 explicit-any values, lint passed, Vitest reported 10 files / 38 tests passed, both builds passed, and full Playwright reported 211 passed with no failures or skips. No checker/config/rule weakening or prohibited casts/suppressions were found in the new modules.
- [ ] **AC12 — no regressions — FAILED.** Existing tests and goldens were not modified, the full existing suite passes, and the app booted without page errors. However, the mandatory manual first-attempt check is impossible because the feature is absent. In a real browser, a generated assessment started the legacy count-in immediately; after keyboard input it showed the legacy-style score, created no sight ledger, and after reload returned to the default repertoire piece with no first-sight eligibility state.

## Quality Gate

- Command: `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test`
- Port safety: PASS — port 8787 had no listener before Playwright. Manual UI verification used an isolated server started by the Inspector on port 8788.
- Result: PASS
- Details:
  - Typecheck: PASS, including suppression checker and strict TypeScript.
  - Lint: PASS.
  - Unit: PASS — 10 files, 38 tests.
  - Build: PASS.
  - Standalone build: PASS.
  - Playwright: PASS — 211 passed in approximately 1.1 minutes, zero failures and zero skips.

## Issues Found

### 1. The user-facing first-sight product flow is missing

The Builder added pure modules but did not wire `srtGenerate`, `srtFingerprint`, `srtTransition`, or `srtLedgerUpdate` into the Read & Play generated-piece lifecycle. Browser evidence:

- Generated piece + Assessment + Start immediately showed “Count-in…”.
- No preview countdown or first-sight/practice action buttons appeared.
- `localStorage['etude-sight-v1']` was `null` before, during, and after the assessment.
- After playing computer-keyboard notes, the result was the existing compact score.
- Reload selected the default repertoire piece and had no first-sight eligibility state.

### 2. Assess integration contradicts the required scoring lifecycle

`srAssessLoop` still marks missed notes and repaints the score during `playing`, and `srKeyInput` still greedily marks hits and repaints immediately. The required behavior is cursor-only during play, followed by one evaluation and colouring after the `T + 250 ms` barrier. The current finish threshold is one whole beat after the piece, which varies with BPM and is not 250 ms.

### 3. The ledger protocol is largely unimplemented

The implementation does not hold an attempt lock across preview/count-in/play/completed/pendingSave, cannot protect active attempts from orphan recovery, has no orphan recovery operation, and does not implement the required two-tab lifecycle. `abandonAttempt` merely increments the revision and does not write a terminal attempt. Finish ownership is not checked against the exposure claim.

### 4. Backup import can destroy local concurrency state

The import path replaces the local ledger wholesale with imported JSON. This violates preservation of local generation and active claims and provides no conflict detection. It can reintroduce foreign active claims and discard the current tab’s coordination state.

### 5. Pure-module behavior and tests are insufficient

- Generator pitch selection is dead code because `bar >= 0` is always true.
- Evaluator narrowed windows are enforced after matching instead of defining valid DP candidates.
- Flow transitions do not implement the specified practice switch and claim requirements.
- Required recorder, evaluator edge-case, ledger, backup, UI, and offline Playwright specs were not added.
- The fingerprint ignore-field contract is not tested.

### 6. Accessibility, localization, and explainability requirements are absent

There are no new strings in the seven-language `STRINGS` object, no first-sight/practice badge, no mean-offset display, and no non-colour note-result symbols/titles. The required viewport, short-landscape, reduced-motion, contrast, language/theme/size survival checks are absent.

## What Must Be Fixed

1. Integrate the complete first-sight/practice state machine into generated pieces, including atomic claim, 20-second preview, visible countdown, both actions, count-in, interruption rules, completion, pending-save retry, and post-exposure practice.
2. Replace the greedy assess-time colouring/matching with cursor-only playback and a single `srtEvaluate` call after exactly `T + 250 ms`; colour and announce results only after completion.
3. Implement the exact two-lock ledger protocol, orphan recovery, owner/generation validation, idempotency, terminal abandonment/interruption, and both growth limits.
4. Implement safe ledger import/merge under the ledger lock, preserving local generation and active claims and rejecting attempt conflicts.
5. Correct the generator’s unreachable pitch logic and strengthen validation/tests to assert every profile invariant independently across all 12,000 cases.
6. Correct evaluator candidate construction for close repeated notes and add every required edge/vector test.
7. Complete and exhaustively test the pure flow transitions and recorder behavior.
8. Add the complete accessible, responsive, seven-language result/preview UI, including symbols with titles, mode badge, and mean offset.
9. Add the required Playwright suites for recorder, integration, two-tab ledger, backup, flow, UI, manual-equivalent keyboard journey, and service-worker offline flow.
10. Re-run the exact full quality-gate command without removing or weakening any existing test.

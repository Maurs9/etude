# Inspector Feedback — Iteration 12

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — M1, model and fingerprint — verified unchanged.** The exact unit gate passed all 109 tests, including both reference fingerprints and the identity-field exclusions. Builder 12 did not change these modules.
- [x] **AC2 — M2, evaluator — verified unchanged.** The corrected temporal-neighbour rest rule and close-repeat coverage remain intact. The unit suite passed, and the formerly flaky late/early browser case passed 48/48 under 12-worker stress.
- [x] **AC3 — M5, generator — verified unchanged.** The deterministic 12,000-run invariant coverage remains green in the complete unit suite.
- [ ] **AC4 — flow — FAILED.** The specified §5.5 graph does not allow `completed → interrupted` or `pendingSave → interrupted`; `pendingSave` exits through save or abandonment. `src/sight-reading/flow.ts` nevertheless accepts `interrupt` from both states, and `tests/sight-reading-flow.test.mjs` explicitly declares those incorrect edges legal. Builder 12's controller now exercises them.
- [x] **AC5 — M3, recorder/input contract — verified unchanged.** Recorder, mixed-source and release-path coverage passed in the full browser gate.
- [ ] **AC6 — M4 and M7, assess/first-attempt behavior — FAILED.** The iteration-11 ghost continuation is fixed, but the flow is still not safe as a complete user interaction:
  - leaving the Pieces sub-tab during preview lets the first-sight attempt start, run and save in the background;
  - the enabled main Start button and note-names control burn the attempt during preview;
  - unrelated controls destroy the frozen result in `pendingSave`;
  - terminal UI state can disagree with the immutable ledger result.
- [ ] **AC7 — M6, ledger/pending-save protection — FAILED.** The two-lock protocol still passes its dedicated tests, but `pendingSave` is not protected as §5.5 requires. Main Start, note names, Listen, `panic()`, a hidden page and leaving Read all release the attempt lease and write `interrupted`. A Switch-to-practice/panic race also leaves the UI at `interrupted` while the ledger records `abandoned`.
- [x] **AC8 — M8, backup — verified unchanged.** Backup export/import and conflict coverage passed.
- [x] **AC9 — M9, UI/accessibility/i18n — verified for the existing matrix.** All seven-language, responsive, contrast, reduced-motion and aria-live tests passed. The enabled Start/names controls during protected states remain behavioral defects covered under AC6/AC7.
- [x] **AC10 — M10, offline — verified unchanged.** Both service-worker Sight-Reading journeys passed in the exact full gate.
- [x] **AC11 — quality gates — verified.** Typecheck, lint, 109 unit tests, both builds and all 266 Playwright tests passed with zero failures and no skips. The required 48-repeat stress case also passed.
- [ ] **AC12 — no regressions — FAILED.** Legacy repertoire Test mode no longer starts at all, both on a fresh open and after using the generated sight-reading flow. This directly violates the requirement that current repertoire assessment keep working.

## Quality Gate

- Command: `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test`
- Port handling: port `8787` was free before the run; no external process was stopped, and the port was free afterward.
- Result: **PASS**
- Details:
  - Typecheck: PASS — suppression checker and strict TypeScript; `0 explicit any values`.
  - Lint: PASS.
  - Unit: PASS — 15 files, 109 tests.
  - Build: PASS.
  - Standalone build: PASS.
  - Playwright: PASS — 266 passed in approximately 1.5 minutes, zero failures, zero skips.

## Stress Verification

- `npx playwright test tests/sight-reading-v5.spec.mjs:406 --project=app --repeat-each=48 --workers=12`
  - **PASS — 48/48.**
- `npx playwright test tests/sight-reading-cancellation.spec.mjs --project=app --repeat-each=10 --workers=12`
  - **PASS — 60/60.**
- Builder 12 did not add the required L1/P1/P2/P3/P4 regression cases, so the requested “cancellation spec plus the new regressions” stress target does not yet exist. The second command above stresses only the six Builder 12 cancellation tests.

## Browser Verification

I independently reproduced the following with a temporary Playwright probe against Builder 12, then deleted the probe.

### Builder 12 fixes that do work

- `panic()` and hidden-page interruption during preview synchronously hide the preview, leave `SR.active === false`, prevent a delayed start after 25 seconds, clear the claim and release the attempt lock.
- An interruption while Switch to practice is blocked on the ledger no longer starts a ghost practice count-in after the lock is released.
- Hidden-page cancellation while `claimExposure` is blocked no longer continues into preview.
- Leaving Read during preview or playing no longer allows that same controller continuation to keep running.
- The synchronized `startPracticeAssess` helper removed the iteration-11 load-dependent failure; its focused test passed 48/48.

### L1 — legacy repertoire Test mode is broken

Steps on a fresh open: Read → Pieces → select built-in `w5rh` → Test/assess → Start.

Observed:

```text
piece: w5rh
state: idle
mode: firstSight
active: false
button: ● Start
```

The same result occurs after first opening a generated first-sight preview and then selecting `w5rh`.

Cause: `srSelectPiece()` assigns `SRT_INITIAL_STATE` to every non-generated piece. That state is `idle / firstSight`. The new guard at the top of `srAssessStart()` is not scoped to `SR.srtPiece`, so it returns before legacy assessment can set `SR.active`.

### P1 — Stats runs first sight in the background

From a first-sight preview, I clicked `#rdt-stats` and advanced the fake clock:

- after 25 seconds: `state: playing`, `active: true`, button `■ Stop`, one live claim and one held attempt lock;
- after 70 seconds: `state: saved`, ledger statuses `["completed"]`, no claim and no lock.

`rdTab()` only stops when `SR.active || SR.listening`; both are false in `preparing`, `claiming` and `preview`.

### P2 — `pendingSave` is not protected

Before each action, the result was frozen with:

```text
state: pendingSave
pending panel visible
one claim
one held attempt lock
no terminal ledger attempt
```

Observed outcomes:

- main Start → practice `countIn`, `active: true`, pending panel hidden, ledger `interrupted`;
- note names → UI `interrupted`, pending panel hidden, ledger `interrupted`;
- Listen → UI `interrupted`, listening starts, pending panel hidden, ledger `interrupted`;
- `panic()` → UI `interrupted`, pending panel hidden, ledger `interrupted`;
- hidden page → UI `interrupted`, pending panel hidden, ledger `interrupted`;
- leaving Read → UI `interrupted`, pending panel hidden, ledger `interrupted`.

Every case released the claim and attempt lock and cleared `SR.srtPendingAttempt`. These are not permitted `pendingSave` exits. In particular, navigation away must produce `abandoned`, while the five non-navigation actions above must leave the result and lease untouched.

The root ordering defect in `srGo()` is direct: it calls the newly canceling `srStopAll()` before it reaches its later `pendingSave` guard.

### P3/P4 — preview controls burn the piece

- Clicking the enabled main `#rd-go`, labelled `● Start`, during preview produced UI and ledger status `interrupted`.
- Toggling enabled `#rd-names` during preview produced UI and ledger status `interrupted`.

Both released the claim and lease, permanently consuming the generated content. Neither control had this destructive behavior in iteration 11.

### Terminal-state and cleanup-status disagreement

Two deterministic lock probes found inconsistent terminal truth:

1. Hold `etude-sight-ledger-v1`, click Switch to practice, trigger `panic()`, then release the lock:
   - UI state: `interrupted`;
   - ledger status: `abandoned`.

   `srtEnsureAbandoned()` deduplicates only by `attemptId`, so the earlier `abandoned` promise is reused for the later required `interrupted` cleanup. Builder 12's test deliberately accepts either ledger status with `['interrupted', 'abandoned']`, so it does not prove the required invariant.

2. Hold the ledger lock while `srAssessFinish()` enters `completed`, trigger `panic()`, then release the lock:
   - UI state: `interrupted`;
   - ledger status: `completed`.

   The queued `finishAttempt` wins and removes the claim; the later abandonment cannot rewrite the immutable result. The UI nevertheless remains `interrupted`. A completed performance must never be rewritten as interrupted.

## Other `srStopAll()` Caller Audit

Builder 12 changed `srStopAll()` so cancellation is the default. That is too broad:

- `show()` leaving Read, `srSelectPiece()` and `rdSightStart()` need state-aware behavior. During `pendingSave`, navigation/load/generate must resolve as `abandoned`, not `interrupted`; during a queued completed save they must not rewrite the UI as interrupted.
- `rdTab()` does not call `srStopAll()` at all in `preparing`, `claiming`, `preview`, `completed` or `pendingSave`, because it checks only `SR.active || SR.listening`. This causes P1 and can hide a live `pendingSave` panel while its lease remains held.
- mode changes, note names, `applyNotation()` and other non-navigation controls must not make `pendingSave` disappear. The pending result permits only Retry save, Continue without saving, explicit navigation/load/generate abandonment, or orphan recovery.
- the Listen-end timer and `srLearnFinish()` should stop their own playback/session resources without accidentally targeting an unrelated terminal first-sight result.
- count-in/playing cancellation still works, and `srAssessFinish()` correctly uses `preserveSrt = true`; those fixes must remain.

## Test Coverage Assessment

The new cancellation file proves that stale async continuations no longer start previews or practice runs, and its 10-repeat stress run is stable. It does **not** prove the complete claims made for cancellation safety:

- no test starts legacy assessment on a built-in piece;
- no test leaves Pieces for Stats during claiming or preview;
- no test exercises main Start or note names during preview;
- no test exercises any unrelated control in `pendingSave`;
- no test verifies navigation from `pendingSave` records `abandoned`;
- the Switch-to-practice race accepts either `interrupted` or `abandoned`, masking UI/ledger disagreement;
- existing flow unit tests encode `completed → interrupted` and `pendingSave → interrupted` as legal, contrary to §5.5.

## Issues Found

1. **Severe legacy regression:** all built-in repertoire assessment is blocked by a first-sight-only guard.
2. **Hidden background performance:** leaving Pieces during pre-play states does not resolve the attempt.
3. **Broken pending-save contract:** unrelated actions discard the evaluated result, release the protected lease and write the wrong terminal status.
4. **Destructive enabled controls:** main Start and note names burn a previewed first attempt.
5. **Terminal inconsistency:** operation deduplication can leave UI and ledger with different terminal statuses; completed results can also be displayed as interrupted.
6. **Insufficient/misdirected tests:** the new suite omits the regressions above and explicitly tolerates one inconsistent outcome.

## What Must Be Fixed

1. **Restore legacy repertoire Test mode (L1).**
   - Scope the first-sight guard in `srAssessStart()` to the generated sight-reading piece (`SR.srtPiece`) only.
   - Add browser regressions proving built-in `w5rh` starts assessment with `SR.active === true` and `#rd-go` showing `■ Stop`:
     - on a fresh Read open;
     - after a generated sight-reading session followed by selecting `w5rh`.

2. **Resolve the attempt whenever the user leaves Pieces (P1).**
   - Leaving for Stats or Drills during `preparing`, `claiming` or `preview` must synchronously invalidate the operation and terminally resolve its claim/lease.
   - After advancing past the preview and full piece duration, there must be no background count-in, playing state or completed save.
   - Add deterministic preview and held-ledger claiming regressions.

3. **Implement the exact `pendingSave` contract (P2).**
   - `pendingSave` may exit only through:
     - Retry save → `saved`;
     - Continue without saving → `abandoned`;
     - navigation away or loading/generating another piece → `abandoned`;
     - orphan recovery.
   - Main Start, note names, Listen, `panic()` and hidden-page handling must leave all of the following unchanged: frozen result, `pendingSave` state, visible Retry/Continue panel, pending attempt payload, claim and held attempt lease.
   - Stats/Drills, leaving Read, selecting another piece and generating another piece count as navigation/load and must resolve as `abandoned`, never `interrupted`.
   - Mode, hands, notation and other non-navigation controls must be disabled/no-op or otherwise preserve `pendingSave`.
   - Remove `completed → interrupted` and `pendingSave → interrupted` from the pure state machine and correct the unit transition matrix.

4. **Make pre-play controls non-destructive (P3/P4).**
   - Main Start during `preparing` or `claiming` must be a no-op.
   - Main Start during `preview` must either be a no-op, as in iteration 11, or behave exactly like Start now; it must never terminally consume the attempt.
   - Note names during `preparing`, `claiming` or `preview` must not change the flow state, ledger claim or lease.
   - Add deterministic browser regressions, including a held-ledger claiming case.

5. **Keep UI and ledger terminal status identical.**
   - In the held-ledger Switch-to-practice + panic/hidden race, the required interrupt must win: both UI and ledger must end `interrupted`, with no ghost practice run, claim or lock.
   - Do not accept `['interrupted', 'abandoned']` in the regression.
   - While a completed `finishAttempt` is pending, panic, hidden-page handling and unrelated controls must not move the UI to `interrupted`. After the ledger lock is released, UI and ledger must agree on `completed`/`saved` or the correctly handled pending-save outcome.

6. **Preserve all verified fixes.**
   - Keep the operation-epoch protection, cancellation-safe claim and practice-switch continuations, preview cleanup, claim/lease release, synchronized fake-clock helper, AC2 rest rule, two-lock protocol, legacy Learn and Listen behavior.

7. **Prove the corrected implementation under load.**
   - `npx playwright test tests/sight-reading-v5.spec.mjs:406 --project=app --repeat-each=48 --workers=12`
   - Run `tests/sight-reading-cancellation.spec.mjs` together with all new L1/P1/P2/P3/P4/terminal-consistency regressions using `--repeat-each=10 --workers=12`, with zero failures.
   - Run the exact full quality gate with zero failures and no new skips.

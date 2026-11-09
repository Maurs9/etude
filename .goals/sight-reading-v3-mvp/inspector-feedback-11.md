# Inspector Feedback — Iteration 11

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — M1, model and fingerprint — verified unchanged.** The exact full unit suite passed all 109 tests, including both fingerprint reference vectors and the identity-field exclusions. Builder 11 did not change the model or fingerprint implementation.
- [x] **AC2 — M2, evaluator — verified, including the corrected rest-neighbour rule.** Section 5.4 says an unmatched attack strictly inside a notated rest is a `restViolation` only when it is outside the association windows of the neighbouring notes; it does not make neighbour selection depend on the extra attack's pitch. `overlapsNeighborWindow` now selects the latest expected onset at or before `rest.startMs` and the earliest expected onset at or after `rest.endMs`, includes every chord note at those onsets, and checks each selected note with its own capped and close-repeat-narrowed association window. The outer filter remains strict (`startMs < onMs < endMs`).
  - A direct current-code probe reproduced the required close-repeat results with genuine extras: `135/165 ms → 0` and `136/150/164 ms → 1`, with `TP: 2`, `FN: 0`, `FP: 1`, and the candidate present in `extraInputs` in all five cases.
  - A direct probe of the previous `HEAD~1` evaluator proved that the new regressions are not all trivially passing: the wrong-pitch next-window case returned `1` instead of `0`, the dedicated previous-side case returned `1` instead of `0`, and the chord-neighbour case returned `1` instead of `0`. The mixed-pitch assertion named `wrong-pitch-previous-window` uses `onMs: 200` with a rest beginning at `600`, so that individual assertion is outside the rest and is trivial; however, the later `previousSideExpected` case places `200 ms` inside `[100, 1200]` and genuinely fails the previous pitch-based implementation.
  - The focused evaluator tests and the complete unit suite passed.
- [x] **AC3 — M5, generator — verified unchanged.** The 12,000-run deterministic invariant test passed for every MVP profile, both hands and seeds `0..999`; invalid profiles remain rejected.
- [x] **AC4 — flow — verified unchanged.** The pure transition matrix passed, including identity-preserving ignored events.
- [x] **AC5 — M3, recorder/input contract — verified unchanged.** Recorder and browser input suites passed in the full run.
- [ ] **AC6 — M4 and M7, assess/first-attempt behavior — FAILED.** `srtSwitchToPractice()` awaits the ledger update before changing state or starting practice, but it does not cancel its continuation when the first-sight flow is interrupted during that wait. Holding the real `etude-sight-ledger-v1` lock, clicking **Switch to practice**, dispatching a hidden-page `visibilitychange`, and then releasing the lock deterministically ended at `name: "interrupted", mode: "practice"` while `SR.active === true`, with one live timer, 21 scheduled audio nodes and the UI still showing **Stop**. The user has interrupted the attempt, yet a ghost practice count-in has started.
- [x] **AC7 — M6, ledger — verified unchanged.** Ledger unit/browser coverage passed, including lock ordering, concurrency, stale generation, orphan recovery, quotas and unsupported/newer-ledger behavior.
- [x] **AC8 — M8, backup — verified unchanged.** Backup unit/browser coverage passed.
- [x] **AC9 — M9, UI/accessibility/i18n — verified unchanged.** The UI, seven-language, responsive, contrast, reduced-motion and aria-live suites passed.
- [x] **AC10 — M10, offline — verified unchanged.** Both service-worker-backed sight-reading offline journeys passed.
- [ ] **AC11 — quality gates — FAILED because the mandatory Playwright gate is not reliable.** My exact full command passed once with 260/260 Playwright tests, but I verified the independent exact run on the same SHA with 259 passed and 1 failed, and independently reproduced the identical failure under load. A mandatory test that intermittently fails on the current code does not satisfy the zero-failure gate.
- [x] **AC12 — no regressions — verified.** Relative to initial SHA `a26497d263a31d1c0d74921a07ea4b8720d8af6c`, every sight-reading test file is added rather than replacing or modifying a baseline test; the golden source and protected checker/config files are unchanged; there are no new `skip`/`fixme` calls; the exact full run passed the boot, all-view, repertoire, standalone, deployment, service-worker and golden suites. A headed system-Chrome first-sight journey also completed and saved, then reload regenerated the same fingerprint and correctly entered practice with the preview hidden.

## AC2 Rest-Neighbour Verification

- Spec rule checked: §5.4, rest extras must be strictly inside the rest and outside the neighbouring notes' association windows.
- Current implementation checked:
  - neighbours are selected by adjacent **time onset**, not by the extra's MIDI pitch;
  - all notes at a neighbouring chord onset participate;
  - each note uses its own `min(250, configuredWindow, 0.45 × nearest same-pitch delta)` window;
  - the rest boundary test remains strict.
- Previous implementation probe:
  - wrong-pitch extra near the next note: previous result `restViolations: 1`, required/current result `0`;
  - wrong-pitch extra near the previous note in the dedicated previous-side rest: previous `1`, required/current `0`;
  - wrong-pitch extra near a chord onset: previous `1`, required/current `0`.
- Close-repeat current probe:
  - `135 → 0`, `136 → 1`, `150 → 1`, `164 → 1`, `165 → 0`;
  - all five retained `TP: 2`, `FN: 0`, `FP: 1` and a genuine unmatched candidate.

## Playwright Race Verification

### Observed gate failure

The independent exact full-gate log for Builder 11 reports:

- 259 passed, 1 failed;
- failing test: `tests/sight-reading-v5.spec.mjs:406`, “renders late-or-early timing as the missed/late symbol”;
- helper failure at line 20: expected `playing`, received `countIn` after the 5-second poll.

### Independent reproduction

- Isolation:  
  `npx playwright test tests/sight-reading-v5.spec.mjs:406 --project=app --repeat-each=15`  
  Result: **15 passed**.
- Load:  
  `npx playwright test tests/sight-reading-v5.spec.mjs:406 --project=app --repeat-each=48 --workers=12`  
  Result: **47 passed, 1 failed**, with the same `playing` versus `countIn` failure at `startPracticeAssess`.
- Deterministic fake-clock probe with the real ledger lock held:
  1. click **Switch to practice**;
  2. run fake time forward by 5 seconds while `srtSwitchToPractice()` is blocked;
  3. state is still `preview`;
  4. release the ledger lock; the async continuation enters `countIn`;
  5. without another fake-clock advance, it remains `countIn`;
  6. a second 5-second advance reaches `playing`.

This confirms the root cause: `#rd-srt-practice` dispatches an async operation, while `startPracticeAssess` advances fake time before synchronizing on the post-await `countIn` state. The count-in timer can therefore be installed only after the first `runFor(5000)` has already completed.

### Async-click → fake-clock audit

All `page.clock.runFor(...)` sites occur in three sight-reading specs. The only click immediately before a fake-clock advance whose handler is async is the `#rd-srt-practice` click in `startPracticeAssess`; that helper is used by tests at lines 75, 249, 368 and 407 of `sight-reading-v5.spec.mjs`. The direct `#rd-srt-start` sites use the synchronous `srtStartClaimedAttempt()` handler, and the remaining async clicks synchronize through visibility, auto-waited controls or state polling before time is advanced.

## Quality Gate

- Command: `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test`
- Port handling: port `8787` was free before the run; no unknown process was stopped.
- Inspector run:
  - Typecheck: PASS — suppression checker and strict TypeScript, `0 explicit any values`.
  - Lint: PASS.
  - Unit: PASS — 15 files, 109 tests.
  - Build: PASS.
  - Standalone build: PASS.
  - Playwright: PASS on this invocation — 260 passed in approximately 1.5 minutes.
- Same-SHA exact run independently verified: **FAIL — 259 passed, 1 failed**.
- Stress reproduction: **FAIL — 47 passed, 1 failed**.
- Overall AC11 result: **FAIL**. The required command is load-dependent on the current implementation/test synchronization.

## Manual Browser Verification

A headed system-Chrome journey with real timers and real computer-keyboard input succeeded on the ordinary, uncontended path:

1. Generated fingerprint `v1:cce988c065a68751`.
2. Saw `Start now · 20 s`, used **Start now**, waited for `playing`, and pressed/released keyboard key `A`.
3. Reached `saved` with one completed ledger attempt and no page/console errors.
4. Saw the explainable first-sight summary: `Score: 5% · First sight · Pitch F1 17% · Notes TP 1/11 · Extra attacks FP 0 · Rhythm 5% · Mean offset -140 ms`.
5. Reloaded, regenerated the identical fingerprint, pressed Start and entered `practice` / `countIn` with the preview hidden.

This confirms the normal path, but it does not negate the deterministic interrupted-lock ghost run.

## Issues Found

### 1. `startPracticeAssess` advances fake time before the async practice switch reaches `countIn`

`tests/sight-reading-v5.spec.mjs:18-20` clicks `#rd-srt-practice`, immediately calls `page.clock.runFor(5000)`, and only afterward polls for `playing`. The click handler intentionally discards the promise from `srtSwitchToPractice()`. Under load, its ledger await completes after the fake-clock advance, so the count-in timer is scheduled too late.

This affects all four tests using the helper and has now failed both an exact full gate and an independent 12-worker stress run.

### 2. An interrupt during the ledger await can start a ghost practice run

`srtSwitchToPractice()` captures the preview state, awaits `srtLedgerUpdate(abandonAttempt)`, and then unconditionally releases the lease, dispatches `switchToPractice` and `startPreview`, redraws, and calls `srAssessStart()`.

The interrupt path also awaits the same ledger lock before applying its state transition. Consequently, merely comparing `SR.srtState` with the captured preview object after the switch await is not sufficient when a real ledger lock is held: the interrupt can already have occurred while its state change is still queued behind the switch operation. The cancellation signal/state transition must become observable synchronously, or an equivalent operation token must be invalidated synchronously.

The deterministic hidden-page probe ended with an interrupted state but an active practice engine, live count-in timer, scheduled metronome nodes and a **Stop** button. That violates the specified hidden-page invalidation and the “no bugs” requirement.

## What Must Be Fixed

1. **Synchronize every async practice-switch test before advancing fake time.**
   - After clicking `#rd-srt-practice`, wait until the flow has actually reached `countIn` (and practice mode) before `page.clock.runFor(5000)`.
   - Keep the existing post-advance assertion that the state is `playing`.
   - Do not “fix” this by only increasing a timeout or weakening/removing an assertion.

2. **Make `srtSwitchToPractice()` cancellation-safe across its ledger await.**
   - If hidden-page interruption, `panic()`, Stop, Listen or leaving the view occurs while the ledger operation is pending, the continuation must not dispatch `switchToPractice`/`startPreview`, call `srDraw()`, call `srAssessStart()`, or schedule audio/timers.
   - Ensure the cancellation/state change is observable even when both the switch and interrupt ledger updates are queued behind the same real Web Lock. A post-await object-identity check alone is insufficient unless the interrupt path changes that identity synchronously.
   - The terminal attempt/claim cleanup must still complete and the attempt lease must still be released.

3. **Add a deterministic browser regression for the product race.**
   - Hold `etude-sight-ledger-v1` with a real unresolved Web Lock.
   - Click **Switch to practice**.
   - Trigger a hidden-page interruption or `panic()` while the click handler is waiting.
   - Release the lock.
   - Assert the state remains interrupted/abandoned without entering practice, `SR.active === false`, no count-in timer/audio nodes remain, the UI is not showing **Stop**, and the ledger claim/lease is released.

4. **Prove the test race is gone under load.**
   - `npx playwright test tests/sight-reading-v5.spec.mjs:406 --project=app --repeat-each=48 --workers=12` must pass with zero failures.
   - `npx playwright test tests/sight-reading-v5.spec.mjs --project=app --repeat-each=10 --workers=12` must pass with zero failures.

5. **Run the exact full gate with zero failures and no new skips:**
   - `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test`

6. **Preserve the verified AC2 fix and assertions.**
   - Keep temporal neighbour selection, chord-onset coverage, strict rest boundaries, the 250 ms cap, close-repeat narrowing and the genuine-extra assertions unchanged in strength.

# Inspector Feedback — Iteration 16

## Verdict: FAIL

Builder 16 fixed the five iteration-15 defects and all required automated gates
are green. Independent Chromium probes nevertheless reproduced two new
acceptance-blocking first-sight integrity defects:

1. Analysis → “Practice this passage in Read & Play” consumes a retained
   generated melody that was never presented.
2. Switching to Learn while the per-attempt Web Lock is still waiting reveals
   the generated melody without writing any exposure or terminal attempt,
   allowing the identical melody to receive a later first-sight preview.

The second defect restores the core exploit D15-1 was intended to close: a user
can see the full score and later claim it as first sight.

## Iteration-15 Binding Contract Check

| Defect | Result | Independent browser evidence |
|---|---|---|
| **D15-1 — Learn reveal without consuming eligibility** | **PASS** | Assess generation → `w5rh` → Learn → `gen` recorded exactly one `learn` exposure, changed the retained melody to practice, and showed the score. Returning to Assess and pressing Start entered practice count-in with the seen-or-used notice and no preview. Direct Learn switching while `gen` was selected behaved the same way. |
| **D15-2 — False notice on fresh Learn generations** | **PASS** | Two successive fresh Learn generations showed the ready verdict with no prior-use notice. Reselecting the genuinely exposed generated melody showed the seen-or-used notice, which is accurate. |
| **D15-3 — Stale claim silently becomes practice** | **PASS** | Forced `stale_generation` returned to concealed `idle/firstSight`, retained the fingerprint, wrote no exposure or attempt, and displayed the localized retry notice. The next Start obtained a real claim and opened preview; interrupting it recorded an `interrupted` attempt. |
| **D15-4 — Refused selection/Generate is applied after Retry** | **PASS** | Refused selection and refused Generate stayed refused. Retry preserved `gen`, `saved`, the fingerprint, evaluation and detailed First sight verdict. Continue stayed on the protected generated piece. A healthy Generate after storage recovery abandoned the pending attempt and produced a new eligible fingerprint. |
| **D15-5 — Repertoire result labelled First sight** | **PASS** | Fresh and retained-state `w5rh` assessments had no badge. A generated first-sight result showed First sight, and a generated practice result showed Practice. |

All required iteration-15 regression tests remained green in the full suite and
in the 10× 490-test stress matrix.

## Acceptance Criteria Check

| Acceptance criterion | Result | Verification |
|---|---|---|
| **AC1 — model and fingerprint** | **PASS** | Unchanged implementation and reference vectors passed in the 112-test unit gate. |
| **AC2 — evaluator** | **PASS** | Unit vectors/boundaries passed, and the required late-or-early rendering stress passed **48/48**. |
| **AC3 — generator** | **PASS** | Determinism, validation and the 12,000 profile/seed/hand invariant checks passed. |
| **AC4 — flow** | **PASS** | Pure transition tests passed. The D16-2 defect is an integration ordering race around the state machine, not a missing pure transition test. |
| **AC5 — recorder/input contract** | **PASS** | Recorder and input suites passed. An independent keyboard first-sight journey saved successfully. |
| **AC6 — assess and first-attempt behavior** | **FAIL** | D16-1 destroys eligibility for unseen content. D16-2 reveals content while leaving it eligible for a later first-sight preview. |
| **AC7 — ledger integration** | **FAIL** | D16-1 writes an exposure for the wrong, unpresented piece. D16-2 writes neither an exposure nor an attempt for a score that was visibly revealed. |
| **AC8 — backup/import** | **PASS** | All old-v3, merge, active-claim and conflict cases passed. |
| **AC9 — UI, accessibility and i18n** | **FAIL** | After D16-1, the UI says the retained melody was already seen or used even though only an unrelated analysis excerpt was displayed. During D16-2, the UI reveals the score in an internally inconsistent `interrupted/firstSight` state. |
| **AC10 — offline** | **PASS** | Both service-worker sight-reading journeys passed in the full suite. |
| **AC11 — quality gates** | **PASS** | Typecheck, lint, 112 unit tests, both builds and all 309 Playwright tests passed with zero failures and zero skips. Typecheck reported `0 explicit any values`. |
| **AC12 — no regressions / real-browser proof** | **FAIL** | Existing tests and goldens remain green, and the independent keyboard/reload journey passed, but D16-1 and D16-2 violate the first-sight eligibility invariant through real UI paths. |

## Quality Gate

- Command:
  `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test`
- Port handling: port `8787` was free before verification. No external
  process was stopped.
- Result: **PASS**
- Exact results:
  - Typecheck: PASS — suppression checker and strict TypeScript;
    `0 explicit any values`.
  - Lint: PASS.
  - Unit: PASS — **15 files, 112 tests**.
  - Build: PASS.
  - Standalone build: PASS.
  - Playwright: PASS — **309 passed in 1.8 minutes**, zero failures and
    zero skips.

## Stress Verification

- `npx playwright test tests/sight-reading-v5.spec.mjs:415 --project=app --repeat-each=48 --workers=12`
  - **PASS — 48/48** in 45.3 seconds.
- `npx playwright test tests/sight-reading-cancellation.spec.mjs tests/sight-reading-v14.spec.mjs tests/sight-reading-v15.spec.mjs tests/sight-reading-v16.spec.mjs --project=app --repeat-each=10 --workers=12`
  - **PASS — 490/490** in 4.3 minutes.

## Independent Browser Verification

I copied and ran the archived orchestrator probe against `8f3db54` in
Chromium. All 12 diagnostic scenarios completed, and I inspected the emitted
state, ledger, lock and UI snapshots rather than treating the green runner as
the verdict.

That run independently confirmed:

- D15-1 through D15-5 are fixed as described above.
- A full 4096-entry exposure ledger enters explained practice and does not
  write another exposure.
- Language changes and leaving/returning to Read preserve an eligible Assess
  melody as concealed and unexposed.
- Switching to Learn while `claimExposure` waits on the ledger lock eventually
  records the first-sight exposure and an `interrupted` attempt.
- D16-1 and D16-2 both reproduce.

I then ran two assertion-based diagnostic regressions of my own:

- **D16-1:** PASS as a defect reproduction — the retained fingerprint acquired
  a `learn` exposure while the selected and displayed piece was `excerpt`.
- **D16-2:** PASS as a defect reproduction — Learn displayed the score in
  `interrupted/firstSight`, releasing the gated attempt lock wrote no exposure
  or attempt, reload still had no exposure, and regenerating the same seeded
  fingerprint opened first-sight preview again.

Additional independent probes found no further defect in these entry paths:

- Today → Read and a Learn `[data-rd]` drill link kept an eligible generated
  melody concealed and unexposed.
- Direct `rdSightStart('practice', seed)` replaced the retained melody without
  consuming the old fingerprint and recorded `learn` only for the new piece.
- A fixed-seed first-sight attempt accepted a real computer-keyboard note,
  saved a detailed First sight result, and after reload the same fingerprint
  went directly to explained practice with no preview.

Temporary probe specs were deleted after their runs.

## Confirmed Defects

### D16-1 — Analysis practice consumes an unrelated retained melody

**Severity: high — AC6, AC7, AC9, AC12.**

Exact reproduction:

1. Open `#read` → Pieces → Assess.
2. Generate a fresh melody and verify the score is concealed, the state is
   `idle/firstSight`, and the fingerprint has no exposure.
3. Open Analysis.
4. Select the `twinkle` example and wait for analysis notes to load.
5. Select note indices 0–3 in `AN.selected`.
6. Invoke the visible Analysis action “Practice this passage in Read & Play”
   (`#an-practice`, implemented by `window.__etude.anPractice()`).
7. Return to Assess and select `gen`.

Observed:

- Read opens in Learn with the analysis `excerpt` selected and displayed.
- The retained generated fingerprint, not the excerpt, receives
  `{ reason: 'learn' }`.
- The retained generated state becomes practice-only.
- Reselecting it in Assess shows the seen-or-used notice and no longer permits
  a first-sight claim, although that generated score was never painted to the
  user.

Root cause:

- `anPractice()` at `src/domain/views-runtime.ts:14206-14221` assigns the
  excerpt but leaves the retained generated piece selected, sets
  `SR.modeSel = 'learn'`, and calls `show('read')` before
  `srSelectPiece(chk.piece.id)`.
- `show('read')` calls `renderRead()` at lines 3739-3744.
- `renderRead()` calls `srDraw()` for the still-selected generated piece at
  lines 7173-7178.
- Builder 16 added `srtConsumeOnLearnReveal()` at the top of `srDraw()` at
  lines 6007-6011. It therefore consumes the retained generated fingerprint
  during this intermediate render.
- `anPractice()` then synchronously selects the excerpt before the browser can
  paint the generated score. The ledger records a Learn reveal that never
  occurred.

Invariant to restore:

> A fingerprint may be consumed for Learn only when that generated piece is
> the content actually presented to the user. Navigation that is replacing
> the selected piece must not consume an intermediate retained selection.

Required Playwright regression in `tests/sight-reading-v17.spec.mjs`:

1. Use a fixed seed to retain an eligible, concealed Assess generation with
   zero exposure.
2. Follow the Analysis `twinkle` → notes 0–3 → `anPractice` path.
3. Assert that the excerpt is visible and usable in Learn.
4. Assert that the retained generated fingerprint still has no exposure and
   remains eligible.
5. Return to Assess, reselect `gen`, assert the score is concealed, and assert
   Start obtains a first-sight claim and opens preview.
6. Exercise the real `#an-practice` action or the exact exported handler after
   establishing the same enabled UI state.

### D16-2 — Pre-lease Learn race reveals content without a ledger record

**Severity: critical — AC6, AC7, AC9, AC12.**

Exact reproduction:

1. Open `#read` → Pieces → Assess and generate a fixed-seed eligible melody.
2. Wrap `navigator.locks.request` so only
   `etude-sight-attempt-<attemptId>` requests are deferred before entering the
   lock callback.
3. Press Start and wait for `claiming`; the score remains concealed and no
   exposure exists.
4. Press Learn before releasing the deferred attempt-lock request.
5. Verify the score becomes visible.
6. Release the deferred request, wait for all async work, then inspect the
   ledger and reload.
7. Regenerate the same seed and press Start.

Observed:

- Learn reveals the complete generated score while the state is
  `interrupted/firstSight`.
- No exposure and no attempt are written after the attempt lock is released.
- Reload still has no record for the fingerprint.
- Regenerating the identical fingerprint allows another first-sight claim and
  opens preview.

Root cause:

- `srtStartFirstSight()` sets `claiming`, creates the attempt lease, then waits
  at `await lease.ready` before calling `claimExposure`
  (`src/domain/views-runtime.ts:6609-6628`).
- Learn calls `srSetMode()` → `srStopAll()` → `srtCancelAttempt()`.
  `srtAbandonClaim()` synchronously transitions `claiming` to `interrupted`.
- Because no claim exposure exists yet, `abandonAttempt` returns
  `owner_mismatch`; there is nothing durable to terminate.
- `srtConsumeOnLearnReveal()` accepts only eligible `idle` or retryable
  `blocked` states, so it skips the now-`interrupted` state and reveals the
  score without recording a Learn exposure.
- When the deferred attempt lock is finally granted, the original start
  operation is stale and returns before `claimExposure`.

Invariant to restore:

> Every generated melody that becomes unconcealed must have a durable exposure
> before or atomically with the reveal, unless storage itself fails and the UI
> explicitly reports that failure. Cancellation before the attempt lease is
> granted must not create a visible, unrecorded first-sight melody.

Required Playwright regressions in `tests/sight-reading-v17.spec.mjs`:

1. Gate only the per-attempt lock as in the reproduction and verify the
   `claiming` state has no exposure before Learn.
2. Switch through the real Learn button.
3. Require one of these safe outcomes before the score is revealed:
   - a durable first-sight claim followed by a terminal `interrupted` attempt,
     or
   - a durable `learn` exposure and a coherent practice state.
4. After releasing the gate, assert exactly one exposure exists, no active
   claim or attempt lock leaks, and terminal-attempt semantics are coherent.
5. Reload, regenerate the identical fixed seed, press Start, and assert there
   is no first-sight preview.
6. Repeat enough times to cover the narrow scheduling window.

## What Must Be Fixed

1. Make Learn consumption target-aware so Analysis → excerpt cannot consume
   the retained generated piece during an intermediate Read render.
2. Close the pre-attempt-lock cancellation race so a Learn reveal always has a
   durable exposure/terminal record before the score becomes visible.
3. Add the exact D16-1 and D16-2 regressions above to a new
   `tests/sight-reading-v17.spec.mjs`.
4. Preserve every verified D15-1 through D15-5 behavior:
   - retained Learn reveals consume exactly once;
   - fresh Learn generations show no false notice;
   - stale claims retry as first sight;
   - refused pending-save actions remain refused;
   - badges reflect the displayed piece and actual attempt.
5. Keep all existing tests green, including the complete cancellation,
   pending-save, ledger, backup, offline, keyboard and accessibility coverage.
6. Rerun the exact full quality gate and both mandatory stress commands, then
   repeat independent real-browser verification of the two new race paths.

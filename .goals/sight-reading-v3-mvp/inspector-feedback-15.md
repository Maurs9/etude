# Inspector Feedback — Iteration 15

## Verdict: FAIL

The exact quality gate and both mandatory stress commands are green, and Builder 15
fixed most iteration-14 failures. Independent browser verification nevertheless
confirmed five acceptance-blocking defects. The most serious one lets a retained,
still-eligible generated melody be fully studied in Learn mode without recording an
exposure, after which Assess still offers a first-sight claim and preview.

## Iteration-14 Contract Check

| # | Result | Evidence |
|---|---|---|
| 1. Accurate `pendingSave` messages | **PASS** | Failed Retry, Continue and navigation use `rd_srt_error_pending_storage` in all seven locales. The result, panel, claim, lease and attempt lock remained protected. The 10× stress matrix passed. |
| 2. Visible practice-only content after abandonment/interruption | **PASS** | Pieces → Stats → Pieces, browser Back, hidden preview, hidden playing and Learn → Assess all left the consumed score visible with the practice-only explanation. These cases passed 10×. |
| 3. Recovery-safe failed “Switch to practice” | **PASS** | With ledger writes failing, the preview closed into practice count-in with a storage notice, no attempt lock and no timer ghost. After storage recovery, orphan recovery recorded `abandoned` and removed the claim. |
| 4. URL/view agreement for refused navigation | **PASS** | Back, Back, Forward and `show('today')` remained on `#read` during `pendingSave`; navigation worked after Continue. |
| 5. Piece control/model agreement after refused selection | **FAIL** | The control is reset immediately, but the refused `w5rh` selection is retained and auto-applied after a successful Retry. That clears the newly saved result and verdict. A refused action must remain refused, as protected `show()` navigation does. See D15-4. |
| 6. Preserve generated content and its eligibility over repertoire round trips | **FAIL** | The fingerprint is retained, but an eligible Assess melody can be revealed in Learn without any exposure, then reclaimed as first sight. See D15-1. |
| 7. Explain practice before restarting a saved piece | **PASS** | Start from `saved` enters practice count-in with the localized seen-or-used notice. This passed 10×. |
| 8. Seen-or-used wording in all locales | **PASS** | All seven translations now use wording valid for Learn, Listen, prior attempts and second-tab exposure. |
| 9. Fresh storage failure diagnosis | **PASS** | A fresh unwritable ledger now keeps a stable volatile generation and reports browser storage failure, not another-tab mutation. |
| 10. Recent-content avoidance | **PASS** | The production path rerolled the deterministic `0 → 1 → 21` collision, the diagnostic probe produced 12/12 unique fingerprints, and the 10× stress suite passed. |
| 11. Preserve previously verified behavior | **FAIL** | The major cancellation, legacy-start, pending-save and offline paths remain operational, but first-sight integrity is broken by D15-1 and a repertoire assessment can be labelled “First sight” by D15-5. |
| 12. Repeat the complete proof | **FAIL** | The requested commands all pass, but the independent real-browser probe exposes five behaviors not covered correctly by the green suite. The proof is therefore incomplete. |

## Acceptance Criteria Check

| Acceptance criterion | Result | Verification |
|---|---|---|
| **AC1 — model and fingerprint** | **PASS** | The modules were unchanged by Builder 15. All reference-vector, ignored-field, schema and mapping unit tests passed in the 111-test unit gate. |
| **AC2 — evaluator** | **PASS** | All evaluator vectors and boundaries passed. The required late/early browser stress passed **48/48**. |
| **AC3 — generator** | **PASS** | The pure deterministic generator and its 12,000 invariant checks passed. Runtime recent-fingerprint avoidance also passed its deterministic collision test. |
| **AC4 — flow** | **PASS** | Pure transition coverage passed. The integration currently misuses `blocked`, but the pure state machine itself remains correct for its declared transitions. |
| **AC5 — recorder/input contract** | **PASS** | Recorder windowing, duplicate/source handling, releases and real keyboard input passed. A headed Chromium journey recorded keyboard input successfully. |
| **AC6 — assess and first-attempt behavior** | **FAIL** | D15-1 permits study before a purported first sight; D15-3 converts a retryable stale claim into undisclosed practice; D15-4 discards the visible saved result after Retry. |
| **AC7 — ledger integration** | **FAIL** | The pure ledger operations pass, but D15-1 leaves studied content at zero exposures and D15-3 records a new `practice` exposure instead of retrying the stale first-sight claim. |
| **AC8 — backup/import** | **PASS** | Backup/import code was unchanged and all old-v3, union, active-claim and conflict cases passed. |
| **AC9 — UI, accessibility and i18n** | **FAIL** | D15-2 displays an already-seen notice on every fresh Learn generation; D15-3 silently starts practice; D15-5 labels a repertoire result “First sight.” |
| **AC10 — offline** | **PASS** | Both sight-reading service-worker journeys passed in the full 303-test gate, including offline keyboard input and a saved result. |
| **AC11 — quality gates** | **PASS** | Typecheck, lint, 111 unit tests, both builds and all 303 Playwright tests passed with zero failures and zero skips. Typecheck reported `0 explicit any values`. |
| **AC12 — no regressions / real-browser proof** | **FAIL** | Goldens and pre-existing tests are intact, but D15-1, D15-2 and D15-4 are Builder-15 regressions, while D15-5 remains an unresolved legacy-integration defect. |

## Quality Gate

- Command: `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test`
- Port handling: port `8787` was free before and after the gate. No external process was stopped.
- Result: **PASS**
- Exact results:
  - Typecheck: PASS — suppression checker and strict TypeScript; `0 explicit any values`.
  - Lint: PASS.
  - Unit: PASS — **15 files, 111 tests**, zero failures.
  - Build: PASS.
  - Standalone build: PASS.
  - Playwright: PASS — **303 passed in 1.8 minutes**, zero failures, zero skips.

## Stress Verification

- `npx playwright test tests/sight-reading-v5.spec.mjs:415 --project=app --repeat-each=48 --workers=12`
  - **PASS — 48/48** in 47.2 seconds.
- `npx playwright test tests/sight-reading-cancellation.spec.mjs tests/sight-reading-v14.spec.mjs tests/sight-reading-v15.spec.mjs --project=app --repeat-each=10 --workers=12`
  - **PASS — 430/430** in 3.9 minutes.

## Independent Browser Verification

I copied and ran the orchestrator's eight-scenario diagnostic probe against
`45c8d2a`, inspected every emitted state/ledger/UI snapshot, then read the
corresponding production paths. It reproduced D15-1 through D15-5 below.

I also ran a separate headed Chromium journey:

1. Generated a deterministic eligible Assess melody.
2. Started its first-sight preview and count-in.
3. Played a computer-keyboard note.
4. Reached `saved` and verified the detailed summary and completed ledger entry.
5. Reloaded, regenerated the identical fingerprint and pressed Start.
6. Verified it skipped preview, entered practice count-in and showed the
   seen-or-used notice.

That independent journey passed 1/1. Temporary probes and `test-results/` were
deleted.

The following Builder-15 improvements were also independently confirmed:

- failed Switch to practice has a storage notice, no held attempt lock and
  recoverable orphan state;
- pending-save Back/Forward/programmatic navigation stays synchronized;
- recent generation avoids the deterministic collision sequence;
- Listen, legacy assessment and hidden-page activity on `w5rh` do not consume
  the retained generated melody;
- all seven locale strings are present;
- edits to the pre-existing cancellation and iteration-14 tests preserve their
  intended assertions.

## Confirmed Defects

### D15-1 — Eligible content can be studied without consuming eligibility

**Severity: critical — AC6, AC7, AC12.**

Exact reproduction:

1. Open `#read`, open Pieces, select Assess and Generate.
2. Confirm the generated score is concealed, the state is `idle/firstSight`
   and the ledger has zero exposures.
3. Select repertoire piece `w5rh`.
4. Switch to Learn while `w5rh` is selected.
5. Select `gen` again.

Observed in Chromium:

- the retained generated melody was fully rendered (**11 notes**);
- its state remained `idle/firstSight`;
- the ledger still had **zero exposures**;
- switching back to Assess concealed the score again;
- Start successfully claimed the fingerprint and opened the first-sight
  preview.

The user can therefore study the entire melody and still receive a recorded
“first sight” attempt.

Root causes:

- `src/domain/views-runtime.ts:9246-9255` exposes for Learn only when the
  generated piece is selected at the instant the mode changes. Switching while
  `w5rh` is selected leaves the retained generated state eligible.
- `src/domain/views-runtime.ts:7100-7152` restores the retained `gen` piece but
  does not call `srtExposeForPractice` when it is revealed in Learn.
- `src/domain/views-runtime.ts:6297-6301` conceals eligible content only when
  `modeSel === 'assess'`, so the same eligible content is visible in Learn.

Required regression in `tests/sight-reading-v16.spec.mjs`:

- deterministically generate an eligible Assess melody;
- perform Assess/gen → `w5rh` → Learn → `gen`;
- assert that revealing it in Learn records exactly one `learn` exposure,
  changes it to practice-only and prevents any later first-sight preview;
- assert the exposure is established before a rapid switch back to Assess and
  Start can claim it.

### D15-2 — Every fresh Learn generation shows an already-seen notice

**Severity: medium — AC9, AC12; Builder-15 regression.**

Exact reproduction:

1. Open `#read` → Pieces in the default Learn mode.
2. Press Generate.
3. Press Generate again.

Both fresh melodies showed:

> This piece has already been seen or used. Practice remains available.

beside:

> A new melody is ready — press Start.

The ledger correctly records the new Learn exposures, but the notice describes
fallback from prior use, not the current action, and contradicts the ready
verdict.

Root cause:

- `src/domain/views-runtime.ts:8420-8438` creates the state as `practice`,
  selects `gen`, and only afterward records the Learn exposure.
- During that selection, `src/domain/views-runtime.ts:7145-7152` treats every
  generated practice state as already exposed and emits the notice, including a
  brand-new Learn generation.

Required regression:

- fresh Learn generation must show the ready verdict with no already-seen
  notice;
- reselecting genuinely previously exposed content must still show the notice;
- repeat the assertion after a second fresh Learn generation.

### D15-3 — Retryable stale claim silently burns the melody as practice

**Severity: medium — AC6, AC7, AC9.**

Exact reproduction:

1. Prepare an eligible generated Assess melody.
2. Hold `etude-sight-ledger-v1` with `navigator.locks.request` and an unresolved
   promise.
3. Press Start, rewrite the persisted ledger `generation`, then release the
   lock.
4. Wait for `blocked/stale_generation`.
5. Press Start again.

Observed:

- the first failure correctly displayed “Sight-reading data changed in another
  tab. Try again.”;
- the next Start entered `countIn/practice`;
- the melody received an exposure with reason `practice`;
- no notice explained that Start had switched to practice.

Root cause:

- `src/domain/views-runtime.ts:6645-6657` puts every non-storage claim failure
  into `blocked`.
- `src/domain/views-runtime.ts:7027-7032` then treats every blocked reason other
  than `already_exposed` as practice exposure and starts practice.

Required regression:

- forced `stale_generation` and retryable `conflict` must return to a refreshed
  `idle/firstSight` state so Start reclaims and opens preview;
- no `practice` exposure may be written on that retry path;
- non-retryable quota/history/storage/unsupported fallbacks may use practice,
  but must show an explicit localized explanation before/during count-in.

### D15-4 — Successful Retry auto-applies a refused selection and erases the result

**Severity: low/medium — AC6, AC9, AC12; Builder-15 regression.**

Exact reproduction:

1. Complete a first-sight run while writes to `etude-sight-v1` throw, reaching
   `pendingSave`.
2. Select `w5rh`; verify the selection is refused and reset to `gen`.
3. Restore storage.
4. Press Retry save.

Observed:

- the ledger saved the attempt as `completed`;
- the deferred selection immediately switched the UI to `w5rh`;
- `SR.srtResultValue` became `null`, `SR.srtEvaluation` was cleared and the
  verdict became empty.

This differs from refused `show()` navigation, which remains refused after
Retry. Saving a protected result must not make that result disappear.

Root cause:

- `src/domain/views-runtime.ts:7100-7108` stores a refused selection in
  `srtPendingSelection`.
- `src/domain/views-runtime.ts:6461-6472` renders the saved result and then
  immediately calls `srSelectPiece` with that deferred value.
- `src/domain/views-runtime.ts:7100-7144` clears the assessment result as part
  of the selection.

Required regression:

- after a refused piece change and successful Retry, remain on `gen`, remain
  `saved`, preserve the detailed verdict/evaluation, and keep the select/model
  synchronized;
- apply the same “refused stays refused” rule after Continue;
- cover both Retry and Continue so piece selection and `show()` navigation have
  consistent semantics.

### D15-5 — Repertoire assessment is labelled “First sight”

**Severity: low/medium — AC6, AC9. This also exists before Builder 15.**

Exact reproduction:

1. Retain any generated state whose mode is `firstSight`.
2. Select repertoire piece `w5rh`.
3. Start and finish its normal Assess run.

Observed verdict:

> Score: 0% ☆☆☆ · First sight · …

No generated first-sight claim occurred for `w5rh`; this was the existing
repertoire assessment.

Root cause:

- `src/domain/views-runtime.ts:6901-6910` derives the badge only from
  `SR.srtState?.mode`.
- `src/sight-reading/flow.ts:26-31` initializes that mode to `firstSight`, and
  Builder 15 intentionally retains generated state over repertoire selection.
- The renderer does not require `srtGeneratedSelected()` or evidence that the
  displayed result came from a first-sight generated attempt.

Required regression:

- a repertoire Assess result must never use the First sight badge, both on a
  fresh Read open and after retaining a generated first-sight state;
- only an actual completed generated first-sight attempt may receive that
  badge.

## What Must Be Fixed

1. Consume eligibility atomically whenever eligible generated content becomes
   visible in Learn, including retained-piece reselection and rapid mode/start
   races.
2. Suppress the already-seen fallback notice for a brand-new Learn generation
   while preserving it for genuinely prior exposure.
3. Separate retryable claim failures from non-retryable practice fallback.
   `stale_generation`/retryable conflict must re-read and re-claim; fallback
   practice must always be explained.
4. Remove deferred execution of refused piece selections after Retry/Continue,
   preserving the saved result and aligning selection with protected
   navigation semantics.
5. Derive the result badge from the actual selected piece and attempt mode, not
   from retained global state.
6. Add the deterministic regressions above in
   `tests/sight-reading-v16.spec.mjs`, preserve every currently passing
   iteration-15 case, and rerun the full gate plus both stress commands.

## Recommendations

These are not additional blocking defects:

1. A refused browser Back currently repairs the previous history entry to
   `#read`; consider preserving a cleaner history stack.
2. Learn rerolls immediately record exposures, so repeatedly generating without
   practicing can consume fresh fingerprints quickly. Consider a documented
   retention/exhaustion policy.

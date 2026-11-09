# Inspector Feedback — Iteration 17

## Verdict: FAIL

Builder 17 fixes both defects required by iteration 16, and every mandatory
automated gate passes. Independent Chromium verification nevertheless found a
remaining first-sight integrity race: when another tab resets the ledger while
`claimExposure` is waiting for the ledger lock, switching the claiming tab to
Learn reveals the complete score, but the stale claim and its abandonment both
leave no exposure or terminal attempt. Reloading and regenerating the identical
melody then opens a new first-sight preview.

This violates the §5.1 rule that step-by-step practice consumes first-sight
eligibility for the displayed piece and AC6's requirement that first sight is
available only for unseen generated content.

## Iteration-16 Required Fix Verification

| Defect | Result | Independent browser evidence |
|---|---|---|
| **D16-1 — Analysis practice consumes an unrelated retained melody** | **PASS** | With fixed seed `17101`, Analysis → `twinkle` → notes 0–3 → `anPractice()` displayed the four-note `excerpt`, left the retained fingerprint with no exposure, and allowed that retained melody to enter first-sight preview when reselected. |
| **D16-2 — Pre-attempt-lock Learn race reveals content without a ledger record** | **PASS for the exact pre-lease race** | With fixed seed `17102`, the per-attempt lock request was gated before its callback. Switching to Learn produced one durable `{ reason: "learn" }` exposure, coherent `idle/practice` state, a visible score, and no held attempt lock after release. Reloading and regenerating the same seed went directly to practice count-in with no preview. |

The Builder-authored iteration-17 regression file also passed **30/30** under
`--repeat-each=10`. D17-1 below is a distinct, later window: the attempt lease
has started and `claimExposure` has been issued, but the claim has not yet
become durable.

## Acceptance Criteria Check

| Acceptance criterion | Result | Verification |
|---|---|---|
| **AC1 — model and fingerprint** | **PASS** | Unchanged implementation; the reference vectors and canonical-field exclusions passed in the 112-test unit gate. |
| **AC2 — evaluator** | **PASS** | All acceptance vectors, inclusive boundaries, close repeats, rests, substitutions and chord-order cases passed in the unit and browser gates. |
| **AC3 — generator** | **PASS** | Determinism, validation and the required 12,000 profile/seed/hand invariant runs passed. |
| **AC4 — flow** | **PASS** | The pure `srtTransition` transition matrix passed. D17-1 is an integration ordering race around the pure state machine. |
| **AC5 — recorder/input contract** | **PASS** | Recorder and real-input browser coverage passed. The independent manual journey recorded computer-keyboard attacks and produced `TP 1/11`, `FP 5`. |
| **AC6 — assess and first-attempt behavior** | **FAIL** | **D17-1:** Learn visibly exposes a generated melody while an issued claim later fails `stale_generation`; the identical, already-seen melody then receives another first-sight preview after reload. This violates §5.1's “step-by-step practice consumes eligibility” rule and AC6's unseen-content first-attempt contract. |
| **AC7 — ledger** | **FAIL** | **D17-1:** after the required `resetLedger`/`stale_generation` concurrency path settles, the visible melody has neither an exposure nor a terminal attempt. The lock table is empty, but the ledger has lost the fact that the content was exposed. |
| **AC8 — backup/import** | **PASS** | Old-v3 compatibility, union/claim handling and conflict cases passed in the full suite. |
| **AC9 — UI, accessibility and i18n** | **PASS** | The full responsive/a11y/i18n suite passed. Visual inspection confirmed the 20-second preview, Start/Switch controls, separate F1/TP/FP/rhythm/offset summary, First sight badge, and non-colour note symbols with titles. |
| **AC10 — offline** | **PASS** | Both sight-reading service-worker journeys passed, including the complete offline first attempt with keyboard input and saved result. |
| **AC11 — quality gates** | **PASS** | Typecheck, lint, 112 unit tests, both builds and all 312 Playwright tests passed with zero failures and zero skips. Typecheck reported `0 explicit any values`. |
| **AC12 — no regressions / real-browser proof** | **PASS** | The latest commit only adds tests and changes the sight-reading runtime/ledger; goldens are unchanged. Existing app/view tests passed. An independent Chromium first-attempt journey completed with real computer-keyboard events, showed the detailed summary, and after reload the same fingerprint entered explained practice with no preview. |

## Quality Gate

- Command, with the mandated isolated Playwright override:
  `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test -c .tmp-playwright-inspector-17.mjs`
- Port handling: served only this worktree on port `8797`, with
  `reuseExistingServer: false`. Port `8787` was not used.
- Result: **PASS**
- Exact results:
  - Typecheck: PASS — suppression checker and strict TypeScript;
    `0 explicit any values`.
  - Lint: PASS.
  - Unit: PASS — **15 files, 112 tests**.
  - Build: PASS.
  - Standalone build: PASS.
  - Playwright: PASS — **312 passed in 2.2 minutes**, zero failures and
    zero skips.

## Stress Verification

- Command:
  `npx playwright test -c .tmp-playwright-inspector-17.mjs tests/sight-reading-v17.spec.mjs --project=app --repeat-each=10 --workers=5`
- Result: **PASS — 30/30 in 39.9 seconds**.

## Independent Browser Verification

I served the built site from this worktree on isolated port `8798` and drove
Chrome directly with Playwright, independently of the Builder-authored specs.

The normal first-attempt journey passed:

1. Generated fixed seed `17117` in Assess.
2. Saw the visible 20-second preview with “Start now” and “Switch to practice”.
3. Started immediately, waited through count-in, and sent six real
   computer-keyboard key events.
4. Saw a saved First sight summary containing pitch F1, `TP/N`, `FP`, rhythm,
   mean offset and stars. The ledger held one completed attempt.
5. Reloaded, regenerated the identical fingerprint
   `v1:9b6cbf4992ea7bd3`, and pressed Start.
6. The app showed the seen-or-used explanation and entered practice count-in
   with the preview hidden.

The two iteration-16 reproductions passed as documented above.

I then exercised the later in-flight-claim window on three independent fixed
seeds (`17103`, `17104`, `17105`). All **3/3** runs reproduced D17-1:

- Learn revealed 15, 11 and 13 score notes respectively.
- State was `interrupted/firstSight`.
- The fingerprint had no exposure.
- After all queued operations settled, `attempts` was empty and there were no
  held or pending locks.
- Reloading and regenerating each identical seed entered `preview/firstSight`.

## Confirmed Defects

### D17-1 — A stale in-flight claim lets Learn reveal content without consuming eligibility

**Severity: critical BLOCKER — AC6, AC7; Part III §5.1 and §5.5.**

Exact violated clauses:

- **§5.1, mode table:** step-by-step practice “consumes the first-sight
  eligibility of the displayed piece”.
- **§5.1, first-attempt row / AC6:** only one eligible first attempt is
  available on locally new, unseen generated content.
- **§5.5 / AC7:** ledger generation changes must reject stale writes without
  breaking the exposure/attempt integrity protected by the two-lock protocol.

Exact reproduction:

1. Open Read → Pieces → Assess and generate a fixed-seed eligible melody.
2. In tab B, hold `etude-sight-ledger-v1`.
3. In tab C, call the real
   `srtLedgerUpdate(localStorage, { type: "resetLedger" })`; it queues behind
   tab B.
4. In tab A, press Start. The attempt lock is acquired and `claimExposure`
   queues behind tab C's reset; tab A remains concealed in `claiming`.
5. Before releasing tab B's ledger lock, press the real Learn mode button in
   tab A.
6. Observe that the complete score becomes visible while state is
   `interrupted/firstSight` and the fingerprint has no exposure.
7. Release tab B. Tab C's reset succeeds; tab A's claim and abandonment use the
   old generation and settle without an exposure or terminal attempt.
8. Reload tab A, regenerate the identical fixed seed, and press Start.

Observed:

- The already-visible melody opens a new first-sight preview.
- The settled ledger contains no exposure and no attempt for the original
  reveal.
- No attempt or ledger lock remains held or pending, so orphan recovery cannot
  repair the missing record.
- The result reproduced for all three tested seeds.

Root cause:

- `srtStartFirstSight()` sets `srtClaimIssuedAttemptId` before the awaited
  `claimExposure` result is durable
  (`src/domain/views-runtime.ts:6647-6654`).
- `srtAbandonClaim()` therefore does not take its new pre-claim restoration
  path; it transitions `claiming` to `interrupted`
  (`src/domain/views-runtime.ts:6499-6519`).
- `srtConsumeOnLearnReveal()` only consumes eligible `idle` or retryable
  `blocked` states, so it skips `interrupted`
  (`src/domain/views-runtime.ts:6341-6348`).
- `srSetMode()` then calls `srDraw()`, which reveals the score
  (`src/domain/views-runtime.ts:9302-9312`).
- When the claim returns `stale_generation`, the stale-operation branch only
  releases the lease and returns; it neither records a Learn exposure nor
  restores a concealed eligible state
  (`src/domain/views-runtime.ts:6655-6672`).

## Non-blocking Observations

None.

## What Must Be Fixed

1. Distinguish “claim request issued” from “claim durably recorded”.
   Cancellation while `claimExposure` is unresolved must not transition into a
   state that Learn can reveal without a record.
2. If Learn is selected while a claim is in flight, resolve the claim outcome
   first. On `stale_generation` or another retryable rejection, either:
   - record a `learn` exposure against the current generation before revealing
     the score, then enter coherent practice; or
   - keep the score concealed and return to an eligible retry state with the
     localized failure explanation.
3. Add a Playwright regression with three pages: one holding the ledger lock,
   one queuing `resetLedger`, and the claiming page switching to Learn before
   release. Assert that the score cannot be visible without an exposure or
   terminal attempt, and that reload of the same seed cannot open first-sight
   preview.
4. Repeat the race enough times to cover scheduling variation and assert that
   no held or pending attempt locks remain.
5. Preserve the now-verified D16-1 fix, the exact pre-attempt-lock D16-2 fix,
   the manual keyboard/reload journey, and every existing quality gate.

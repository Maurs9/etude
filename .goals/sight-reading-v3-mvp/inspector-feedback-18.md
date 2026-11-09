# Inspector Feedback — Iteration 18

## Verdict: PASS

Builder 18 closes D17-1. In the exact three-tab ordering from iteration 17,
Learn now keeps the score concealed until a durable `learn` exposure exists,
then enters coherent practice. Reloading and regenerating the identical melody
does not restore first-sight eligibility, and no attempt locks remain.

The complete required quality gate passes with zero failures and zero skips.
The normal first-sight browser journey also completes with real computer
keyboard input, saves a completed attempt, and remains practice-only after
reload.

## Acceptance Criteria Check

| Acceptance criterion | Result | Verification |
|---|---|---|
| **AC1 — model and fingerprint** | **PASS** | The strict model/fingerprint implementation is unchanged. The full unit gate passed both exact FNV-1a vectors, canonical-field exclusions, validation, stable legacy mapping and expected-note construction. |
| **AC2 — evaluator** | **PASS** | The full unit/browser gate passed all six acceptance vectors, inclusive timing boundaries, close-repeat narrowing, rest violations, substitutions, chord order, stars and invalid-empty behavior. |
| **AC3 — generator** | **PASS** | The deterministic generator and required 12,000 profile/seed/hand invariant runs passed, including validation, cadence, bar, range, leap and fingering constraints. |
| **AC4 — flow** | **PASS** | The pure state-transition matrix passed. Builder 18 changes integration ordering only and does not weaken the flow tests. |
| **AC5 — recorder/input contract** | **PASS** | Recorder, source ownership, release metadata, exclusion, deduplication, focus release and panic coverage passed. A fresh browser first-sight journey accepted real computer-keyboard input. |
| **AC6 — assess and first-attempt behavior** | **PASS** | D17-1 is fixed: the in-flight stale claim cannot reveal Learn content until the replacement exposure is durable; the same seed is practice-only after reload. Preview, count-in, playing, completion/pending-save, non-greedy coloring and invalidation suites all passed. |
| **AC7 — ledger** | **PASS** | The two-lock, multi-tab, stale-generation, ownership, idempotency, orphan, limit and unsupported-lock suites passed. In D17-1, the reset wins, the stale claim is rejected, a current-generation `learn` exposure is then recorded, and all attempt locks are released. |
| **AC8 — backup/import** | **PASS** | Export, old-v3 import, generation/active-claim preservation, unfinished-claim abandonment, union and conflicting-attempt rejection tests passed. |
| **AC9 — UI, accessibility and i18n** | **PASS** | Responsive, contrast, reduced-motion, seven-language, state-announcement, result-detail and non-colour-symbol suites passed. Browser verification observed the concealed-to-visible transition only after durable exposure. |
| **AC10 — offline** | **PASS** | Both service-worker sight-reading journeys passed, including a complete offline first attempt with keyboard input and a saved result. |
| **AC11 — quality gates** | **PASS** | Typecheck, lint, 112 unit tests, both builds and all 313 Playwright tests passed. Typecheck reported `0 explicit any values`; Playwright reported zero failures and zero skips. |
| **AC12 — no regressions / real-browser proof** | **PASS** | Builder 18 changes only the race runtime, status and a regression spec; goldens are unchanged. The full app/view suite passed. A fresh browser journey completed first sight with keyboard input, saved a completed attempt, reloaded and entered practice with no preview. |

## D17-1 Verification and Reproduction Evidence

### Source review

The fix distinguishes an issued claim from a durably recorded claim with
`srtClaimDurableAttemptId`. If Learn cancels while `claimExposure` is still
waiting, `srtAbandonClaim()` restores an eligible idle state rather than
creating an unrecorded interrupted reveal. Learn consumption then:

1. moves the generated piece to practice;
2. starts a `recordExposure` write;
3. keeps the score concealed while that write is pending;
4. retries only a `stale_generation` exposure against the freshly read current
   generation;
5. redraws only after the durable exposure succeeds.

The original in-flight claim subsequently observes a stale operation, releases
its attempt lease and cannot overwrite the practice state.

### Builder regression stress

- Command:
  `npx playwright test -c .tmp-playwright-inspector-18.mjs tests/sight-reading-v18.spec.mjs --project=app --repeat-each=10 --workers=5`
- Result: **PASS — 10/10**.
- Each test execution covered four fixed seeds, for **40 successful D17-1
  race cycles**.
- Verified outcomes on every cycle:
  - tab B held `etude-sight-ledger-v1`;
  - tab C queued the real `resetLedger`;
  - tab A acquired its attempt lease and queued `claimExposure`;
  - the real Learn button was selected before the ledger lock was released;
  - the score stayed `aria-hidden="true"` while the replacement exposure was
    pending;
  - after settlement, state was `idle/practice`, the score was visible and the
    ledger held `{ reason: "learn" }`;
  - after reload, the identical seed entered `countIn/practice` with no
    first-sight preview;
  - held and pending attempt-lock lists were empty.

### Independent adversarial browser reproduction

I created a temporary inspector-only Playwright test, ran it against the built
site on isolated port `8799`, and deleted it before the full gate and commit.
It repeated the exact three-tab race for **12 additional fixed seeds**.

Unlike the Builder regression, the inspector test installed a 1 ms continuous
browser-side invariant watcher after tab A reached `claiming`. The watcher
recorded a failure whenever the score was visible while the fingerprint had
neither a durable exposure nor a terminal `completed`, `abandoned` or
`interrupted` attempt. It also varied a short delay between selecting Learn and
releasing tab B's lock.

- Result: **PASS — 12/12**.
- The watcher observed **zero invalid visible states**.
- Every settled ledger contained the `learn` exposure.
- Every reload of the identical seed started practice without a preview.
- Every pre- and post-reload attempt-lock query returned no held or pending
  locks after cleanup.

Combined Builder and independent stress covered **52 D17-1 race cycles**.

### Normal browser journey

- Command:
  `npx playwright test -c .tmp-playwright-inspector-18.mjs tests/sight-reading-v5.spec.mjs --project=app --grep 'completes first-sight preview' --workers=1`
- Result: **PASS — 1/1**.
- The real UI showed preview and count-in, accepted a computer-keyboard attack,
  saved a completed first-sight attempt, showed the First sight result, then
  reloaded the identical fixed seed into practice with the preview hidden.

## Quality Gate

- Exact command:
  `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test -c .tmp-playwright-inspector-18.mjs`
- Temporary config:
  `.tmp-playwright-inspector-18.mjs`, importing
  `./playwright.config.mjs`, serving only this worktree on port `8799`, and
  setting `reuseExistingServer: false`.
- Port `8787` was not used.
- The temporary config was deleted before commit.
- Result: **PASS**.
- Details:
  - Typecheck: PASS — suppression checker and strict TypeScript,
    `0 explicit any values`.
  - Lint: PASS.
  - Unit: PASS — **15 files, 112 tests**.
  - Build: PASS.
  - Standalone build: PASS.
  - Playwright: PASS — **313 passed in 1.9 minutes**, zero failures and zero
    skips.

## Confirmed Defects

None.

## Non-blocking Observations

- The new `srtRecordExposure()` returns the original operation rather than its
  stale-generation retry promise. Current callers that need reveal ordering use
  the stored settled `srtExposurePromise`, and the verified D17-1 path is
  correct. Returning the settled promise directly would make the helper's
  public return semantics less surprising, but this is not an acceptance
  failure and did not produce a reproducible defect.


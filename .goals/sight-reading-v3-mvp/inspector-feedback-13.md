# Inspector Feedback — Iteration 13

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — M1, model and fingerprint — verified.** The exact FNV-1a vectors, ignored identity fields, validation rules and stable event/note mapping passed in the 111-test unit gate. Builder 13 did not change these modules.
- [x] **AC2 — M2, evaluator — verified.** The complete evaluator suite passed, including the corrected 250 ms cap, narrowed close-repeat windows and genuine rest extras. The required late/early browser case also passed 48/48 under 12-worker stress.
- [x] **AC3 — M5, pure generator — verified, with an integration failure recorded under AC6/AC12.** `srtGenerate(profile, seed)` remains pure, deterministic, Mulberry32-based and valid over all 12,000 profile/hand/seed runs. The defect is that the runtime always supplies the same seed, not that the pure generator is nondeterministic or invalid.
- [x] **AC4 — flow — verified.** Builder 13 removed the invalid `completed → interrupted` and `pendingSave → interrupted` edges, added the required abandonment exits for pre-play navigation, and the exhaustive transition matrix passed.
- [x] **AC5 — M3, recorder/input contract — verified.** Recorder, source ownership, release metadata, focus/panic and mixed-input browser coverage all passed.
- [ ] **AC6 — M4 and M7, assess/first-attempt behavior — FAILED.** The iteration-12 cancellation regressions are fixed, but the first-sight contract itself is not:
  - a failed abandonment write can hide the only recovery UI while leaving the session permanently in `pendingSave`;
  - every Generate action for a level creates the same fingerprint forever, so each level has only one first-sight piece;
  - Learn does not consume eligibility;
  - the complete score, including note names when enabled, is exposed before the claim and outside the bounded preview;
  - already-exposed content silently starts practice without explaining the mode change.
- [ ] **AC7 — M6, ledger/pending-save protection — FAILED.** The ledger module and two-lock protocol pass their direct tests, but the runtime mishandles `{ ok: false }` from `abandonAttempt`: it hides the pending panel without transitioning, recording a terminal attempt, releasing the lease or showing an error. Retry failures are also silent. A full storage quota is exactly the condition most likely to make both the original result save and the abandonment write fail.
- [x] **AC8 — M8, backup — verified.** Export, old-v3 import, union semantics, local-generation/claim preservation, imported-claim abandonment and conflict rejection passed.
- [x] **AC9 — M9, existing UI/accessibility/i18n matrix — verified, with semantic UI failures counted under AC6/AC7.** All seven languages, result symbols/titles, contrast, responsive sizes, reduced motion and aria-live tests passed. The missing failure/practice explanations and pre-claim note-name exposure are behavioral contract defects rather than missing dictionary entries.
- [x] **AC10 — M10, offline — verified.** Both service-worker sight-reading journeys passed in the exact full gate.
- [x] **AC11 — quality gates — verified.** Typecheck, lint, 111 unit tests, both builds and all 277 Playwright tests passed with zero failures and no skips. No checker or strictness rule was weakened.
- [ ] **AC12 — no regressions — FAILED.** Legacy repertoire Test mode is restored and the goldens remain unchanged, but generated sight-reading regresses from `main`: `main` creates a new melody on each Generate through `Math.random()`, while this branch persists one fixed seed per level and never advances it. The resulting “one fixed piece ever per level” behavior violates both existing Generate behavior and the MVP requirement for new local content.

## Quality Gate

- Command: `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test`
- Port handling: port `8787` was free before every Playwright invocation and free afterward. No external process was stopped.
- Result: **PASS**
- Details:
  - Typecheck: PASS — suppression checker and strict TypeScript; `0 explicit any values`.
  - Lint: PASS.
  - Unit: PASS — 15 files, 111 tests.
  - Build: PASS.
  - Standalone build: PASS.
  - Playwright: PASS — 277 passed in approximately 1.6 minutes, zero failures, zero skips.

## Stress Verification

- `npx playwright test tests/sight-reading-v5.spec.mjs:406 --project=app --repeat-each=48 --workers=12`
  - **PASS — 48/48.**
- `npx playwright test tests/sight-reading-cancellation.spec.mjs --project=app --repeat-each=10 --workers=12`
  - **PASS — 170/170.**
- Builder 13's 17 cancellation/regression cases were therefore exercised ten times each, including legacy repertoire assessment, tab/read navigation, protected pending-save controls, completed-save consistency and harmless pre-play controls.

## Independent Browser Verification

I wrote and ran a temporary 10-test Playwright probe against `74091bb`, plus a separate keyboard/reload journey. The probes passed because they asserted the observed behavior, including the defects below. Both temporary specs and `test-results/` were then deleted.

### Iteration-12 contract that is now working

- Built-in `w5rh` Test mode starts on a fresh open and after a generated sight-reading session.
- Main Start and note names are harmless in `claiming` and `preview`; note names remain hidden after the claim.
- Leaving Pieces during `claiming` or `preview` records `abandoned`, releases the claim/attempt lock and cannot start a ghost run after 70 seconds.
- `pendingSave` remains frozen across main Start, note names, Listen, panic, hidden-page handling, audio suspension, disconnect, mode, hands, notation and BPM changes when storage is available.
- Navigation/load/generate from `pendingSave` records `abandoned` and releases the lease when the ledger write succeeds.
- A completed save blocked on the ledger remains `completed` through panic and reconciles to UI `saved` / ledger `completed`.
- The accepted Switch-to-practice option **(b)** is preserved: once the user selects Switch to practice, `abandoned` wins if panic/hidden handling arrives while the terminal ledger write is pending; no ghost practice run starts.
- Panic/hidden cancellation, preview auto-advance, first-sight save, repertoire Learn/Listen/Test, language/theme/viewport survival and offline operation all passed in the full rerun.
- My separate real-browser journey started a first attempt, sent computer-keyboard input, reached `saved`, displayed the detailed summary, reloaded, and confirmed that the same fingerprint starts practice.

## Orchestrator Findings — Independent Results and Scope Decisions

### 1. Failed abandonment leaves a hidden, stuck `pendingSave`

**Result: CONFIRMED. Severity: SEVERE/BLOCKING. In scope: YES — AC6, AC7 and §5.5.**

With `Storage.prototype.setItem` throwing `QuotaExceededError` only for `etude-sight-v1`, I entered a real first-sight `pendingSave` and kept the failure active.

After **Continue without saving**:

```text
state: pendingSave
pending panel hidden: true
notice hidden / empty: true
pending attempt retained: true
claim count: 1
attempt statuses: []
SR.srtLease present: true
held attempt locks: 1
```

Removing the storage stub and pressing main Start still did nothing because `srGo()` rejects `pendingSave`; only a later navigation retried abandonment.

The same happened when navigating to Stats while the write still failed. Returning to Pieces after storage recovered left the state at `pendingSave`, the panel hidden and main Start inert until another navigation retried the write.

The direct cause is the failure path in `srtAbandonClaim()`: it calls `srtPendingUi(false)` before awaiting the ledger result, but when the result is `{ ok: false }` and there is no recorded terminal status it neither restores the panel, transitions, releases nor calls `srtNotice(srtLedgerFailureMessage(result.reason))`.

This is not a theoretical storage edge. `pendingSave` is normally entered because the ledger cannot be written, so the abandonment write is likely to encounter the same failure.

### 2. Retry failure is silent

**Result: CONFIRMED. Severity: MEDIUM. In scope: YES — AC7 and the user-visible recovery contract.**

Pressing Retry while the same quota failure remained active kept the correct protected state, panel, claim and lease, but `#rd-srt-notice` stayed hidden and empty. The action appeared to do nothing. Removing the stub and pressing Retry again saved successfully.

`srtRetryPendingSave()` has a success branch but no current-operation failure branch. The result must remain protected, but the user also needs a localized explanation of why Retry failed.

### 3. Generate always returns one fixed piece per level

**Result: CONFIRMED. Severity: SEVERE. In scope: YES — AC6 and AC12; the pure AC3 generator itself still passes.**

My probe observed the following across four Assess generations, two Learn generations, three direct Drills starts and a reload:

```text
all fingerprints: v1:cce988c065a68751
localStorage['etude-sight-seed-sr1']: 114098
distinct fingerprints: 1
```

`srtSeedForLevel()` hashes the level id once, persists it and never advances it. By contrast, `main:etude.html` line 7262 selects movement with `Math.random()`, and `rdSightStart()` calls the generator on each request.

The result is one eligible first-sight attempt per level, ever, on one fixed piece. Subsequent Generate actions recreate exposed content and silently enter practice. This contradicts §5.1's “new local content” requirement. The intentional MVP profile limits (C major, quarters/halves, one hand, 60 BPM) are not defects and were not penalized.

### 4. Learn does not consume first-sight eligibility

**Result: CONFIRMED. Severity: SEVERE. In scope: YES — AC6/AC7 and the explicit §5.1 mode table.**

I generated in Learn, started and stopped step-by-step practice, then inspected the ledger:

```text
exposures: 0
state: idle / firstSight
```

After switching to Assess and pressing Start, the same displayed piece entered a claimed `preview` with `mode: firstSight`.

The same semantic problem follows from code inspection when a piece is generated in Assess, used in Learn and then returned to Assess. `recordExposure` exists in the ledger but the Learn runtime never calls it.

### 5. The eligible piece is fully exposed before the claim

**Result: CONFIRMED. Severity: SEVERE. In scope: YES — AC6, §5.1 and §5.5.**

Immediately after Generate in Assess, before Start or any claim:

```text
state: idle / firstSight
visible score notes: 11
ledger exposures: 0
```

After enabling note names, all 11 names were visible while exposures remained zero. Pressing Start then successfully claimed the same piece and entered a `firstSight` preview; only at that point were names hidden.

This defeats the 20-second preview limit. A first-sight attempt may only start on a piece the user could not inspect outside a claimed preview, and never with note names. The Builder may choose the UI mechanism, but any earlier reveal or Learn/Listen use must persistently consume eligibility and explain the resulting practice mode in all seven languages.

### 6. Exposed content silently starts practice

**Result: CONFIRMED. Severity: LOW. In scope: YES — AC6/UI mode semantics.**

After recording an exposure for the displayed fingerprint, pressing main Start entered `practice` count-in with the preview hidden, but `#rd-srt-notice` was hidden and empty. The existing localized `rd_srt_error_already_exposed` string is not used on this path.

Practice fallback is correct; silently changing the meaning of Start is not. The user should know before playing that the attempt is practice rather than first sight.

### 7. Mode change during preview records `interrupted`

**Result: CONFIRMED. Severity: LOW/ACCEPTABLE. In scope: interaction is in scope, but no specified defect.**

Changing from Assess to Learn during preview produced UI and ledger `interrupted`, with zero claims and zero held attempt locks. §5.5 permits preview interruption/abandonment but does not assign a required terminal label to mode changes. Because the attempt is terminally consumed, UI and ledger agree, and no resource leaks, I do **not** fail the goal or require a change for this item.

## Test Coverage Assessment

The new cancellation suite is materially stronger and stable under stress, but it does not cover the confirmed defects:

- pending-save Retry/Continue tests restore storage before clicking the recovery action, so they never exercise a repeated write failure;
- no test verifies that navigation abandonment failure restores the pending UI and reports the reason;
- no test requires consecutive Generate actions to produce fresh content;
- no test requires Learn to record exposure;
- the existing note-name test explicitly expects names to be visible after Generate and before the claim, encoding the incorrect behavior;
- the reload test passes specifically because Generate recreates the same fixed fingerprint, so it does not prove that newly generated content remains first-sight eligible.

No additional product defect beyond the seven investigated items was found.

## Issues Found

1. A repeated ledger write failure creates a hidden, lease-holding `pendingSave` dead end.
2. Retry failures provide no user-visible or accessible feedback.
3. Runtime seed issuance never advances, eliminating fresh generated content.
4. Step-by-step Learn does not persistently consume first-sight eligibility.
5. The score and optional note names are exposed before the exclusive claim and bounded preview.
6. Exposed content falls back to practice without a localized explanation.
7. Regression coverage currently misses or encodes these behaviors.

## What Must Be Fixed

1. **Make abandonment from `pendingSave` failure-safe.**
   - Do not hide the pending panel before a successful terminal ledger result is known.
   - If `abandonAttempt` returns `{ ok: false }` and no immutable terminal attempt exists, keep the exact frozen result, `pendingSave` state, pending payload, claim and lease; keep Retry/Continue visible; show `srtLedgerFailureMessage(reason)`.
   - If a terminal `completed` or `abandoned` result already exists, reconcile UI state to that result and release exactly once.
   - Add Playwright regressions for both Continue and navigation/load/generate while `setItem('etude-sight-v1', …)` continues throwing. Prove there is no hidden dead end, no premature release, and that recovery succeeds after storage becomes writable.

2. **Report Retry failures without weakening protection.**
   - A failed Retry must remain in `pendingSave` with the panel, result, claim and lease intact and must expose the localized failure reason.
   - A later successful Retry must clear the notice, save, release and hide the panel.
   - Add deterministic Playwright coverage for persistent quota failure followed by recovery, and verify the notice in all seven languages.

3. **Supply fresh runtime seeds while keeping `srtGenerate` pure.**
   - Consecutive Generate actions must yield new musical content with overwhelming probability in Pieces Assess, Pieces Learn and Drills, including across reloads.
   - Keep `srtGenerate(profile, seed)` deterministic and keep unit tests deterministic by pinning/injecting the seed used by the call site; do not put `Math.random()` inside the pure generator.
   - Add non-flaky browser tests proving the runtime advances its seed/content source, that a newly generated unexposed piece can enter first sight after a previous attempt, and that deliberately reselecting exposed content enters practice.

4. **Persistently consume eligibility when Learn or other prior use exposes a piece.**
   - Enforce the invariant: a first-sight attempt may start only if the user has never seen or used that fingerprint outside its claimed preview.
   - Learn, Listen and any other earlier reveal/use must record exposure persistently and cause later Assess to use practice with a localized explanation.
   - Add Playwright tests for Learn-generated content, Assess-generated content later used in Learn, Listen, reload and a second tab.

5. **Prevent unclaimed first-sight study and note-name assistance.**
   - Enforce the invariant: the complete score is not visible outside a valid claimed preview unless that visibility itself has already consumed eligibility.
   - Note names must never be shown for an attempt that can still be labelled `firstSight`.
   - The Builder may choose whether Generate claims immediately, hides/redacts the score until Start, or records the reveal as exposure; the observable invariant above is mandatory.
   - Replace the current test that expects pre-claim note names with deterministic tests proving claim-before-reveal (or persistent exposure-on-reveal), a bounded 20-second preview, no note names and no first-sight start after any earlier reveal.

6. **Explain practice fallback for exposed content.**
   - Before practice count-in begins, present an accessible localized notice that the piece is already exposed and the run is practice.
   - Use/extend strings in all seven languages and add a browser language matrix for this path.

7. **Preserve all verified iteration-13 fixes and the accepted race decision.**
   - Keep legacy repertoire Test/Learn/Listen behavior, state-aware navigation cancellation, harmless pre-play controls, protected `pendingSave`, completed-save consistency, evaluator/rest fixes, two-lock ordering and offline behavior.
   - Preserve accepted Switch-to-practice option (b): the explicit practice switch records `abandoned`; a concurrent panic/hidden event must not rewrite it or start a ghost practice run.

8. **Run the complete regression proof.**
   - Run the exact full quality gate with zero failures and no new skips.
   - Run `tests/sight-reading-v5.spec.mjs:406` with `--repeat-each=48 --workers=12`.
   - Run the cancellation suite together with all new pending-write, fresh-generation, eligibility and pre-claim-visibility regressions with `--repeat-each=10 --workers=12`.

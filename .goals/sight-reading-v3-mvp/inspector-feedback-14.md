# Inspector Feedback — Iteration 14

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — M1, model and fingerprint — verified.** The exact FNV-1a vectors, ignored identity fields, schema validation and stable event/note mapping passed in the 111-test unit gate. Builder 14 did not change these modules.
- [x] **AC2 — M2, evaluator — verified.** The complete evaluator unit coverage passed, including inclusive boundaries, close repeats, rest violations and the full acceptance vectors. The required late/early browser regression also passed 48/48 with 12 workers.
- [x] **AC3 — M5, pure generator — verified, with runtime freshness failures recorded under AC6/AC12.** `srtGenerate(profile, seed)` remains deterministic, Mulberry32-based and valid over all 12,000 profile/hand/seed runs. The blocking issue is the runtime's insufficient duplicate avoidance, not the pure generator's validity.
- [x] **AC4 — flow — verified.** The pure state machine and exhaustive legal/illegal transition tests passed. Builder 14 did not weaken the accepted terminal-state decisions.
- [x] **AC5 — M3, recorder/input contract — verified.** Recorder windowing, source ownership, duplicate suppression, release metadata, focus/panic behavior and mixed-input coverage all passed.
- [ ] **AC6 — M4 and M7, assess/first-attempt behavior — FAILED.** Eligible content is now concealed and Learn/Listen consume eligibility, but several plausible first-attempt/practice flows remain wrong:
  - abandoned or interrupted content is concealed again with a false “new melody” verdict even though only practice remains;
  - a failed “Switch to practice” silently closes the preview and leaves the claim and attempt lock held;
  - a saved attempt starts practice without the required practice explanation;
  - Learn/repertoire/Learn round trips replace the generated melody instead of returning to the same exposed content;
  - the required stress run reproduced a repeated fingerprint within four Generate actions.
- [ ] **AC7 — M6, ledger and pending-save protection — FAILED.** Retry/Continue now preserve `pendingSave`, its panel, claim, lease and lock when a write fails, but the displayed reason is wrong for a completed result, a failed practice switch leaks the two-lock session into later practice, and a fresh unwritable ledger is misdiagnosed as a cross-tab generation change.
- [x] **AC8 — M8, backup — verified.** Export, old-v3 import, union semantics, local-generation/claim preservation, imported-claim abandonment and conflict rejection passed.
- [ ] **AC9 — M9, UI/accessibility/i18n — FAILED.** The responsive, contrast, symbol/title, language and reduced-motion matrices pass, but user-visible state remains misleading: save failures use a first-attempt/history-cap message, consumed content can be hidden behind a “new melody” verdict, refused navigation and selection leave URL/control state inconsistent, the saved-practice path has no accessible explanation, and all seven `already_exposed` translations say “attempted” for Learn/Listen exposure.
- [x] **AC10 — M10, offline — verified.** Both service-worker sight-reading journeys passed in the exact full gate.
- [x] **AC11 — exact quality gate — verified.** Typecheck, lint, 111 unit tests, both builds and all 288 Playwright tests passed with zero failures and zero skips. Typecheck reported `0 explicit any values`; no checker or strictness rule was weakened.
- [ ] **AC12 — no regressions — FAILED.** Goldens are unchanged, no pre-existing test was removed or weakened, legacy repertoire behavior passed, and the headed keyboard/reload journey passed. However, generated content no longer survives a repertoire round trip as it does on `main`; refused navigation/selection can desynchronize visible UI from application state; and the mandatory 10× stress run failed because Generate repeated recent content.

## Quality Gate

- Command: `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test`
- Port handling: port `8787` was free before the gate and free afterward. No external process was stopped.
- Result: **PASS**
- Details:
  - Typecheck: PASS — suppression checker and strict TypeScript; `0 explicit any values`.
  - Lint: PASS.
  - Unit: PASS — 15 files, 111 tests.
  - Build: PASS.
  - Standalone build: PASS.
  - Playwright: PASS — 288 passed in approximately 1.7 minutes, zero failures, zero skips.

## Stress Verification

- `npx playwright test tests/sight-reading-v5.spec.mjs:415 --project=app --repeat-each=48 --workers=12`
  - **PASS — 48/48.**
- `npx playwright test tests/sight-reading-cancellation.spec.mjs tests/sight-reading-v14.spec.mjs --project=app --repeat-each=10 --workers=12`
  - **FAIL — 279/280.**
  - The cancellation suite itself completed all 170 repetitions. One iteration-14 freshness repetition failed at `tests/sight-reading-v14.spec.mjs:188`: four Generate actions produced only three distinct fingerprints.
  - A separate deterministic browser probe found that P1.a seeds `0` and `21` both produce `v1:984ee4a0b92a5baa`, while seed `1` produces different content. The runtime only rejects the immediately previous or already-exposed fingerprint, so an `A → B → A` sequence remains possible.

## Independent Browser Verification

I reran the orchestrator's 19-scenario probe in this worktree and independently inspected the resulting UI, ledger and Web Locks state. The probe reproduced D1–D9 below while also confirming the Builder 14 improvements: 11/11 fresh fingerprints in that single run, pre-claim concealment, Learn/Listen/second-tab exposure, protected `pendingSave`, repertoire isolation, Drills entry behavior and a 320 px layout with no horizontal overflow.

I also ran a separate headed Chromium journey with a pinned generated piece:

- entered a first-sight preview and count-in;
- played `a`, `s` and `d` through the computer keyboard;
- reached `saved` and saw the detailed summary (`Pitch F1`, `TP/N`, `FP`, rhythm and mean offset);
- reloaded, regenerated the identical fingerprint and confirmed Start entered `practice` without a first-sight preview.

The temporary probes and `test-results/` were deleted.

## Findings

### 1. `pendingSave` reports the wrong failure

**Confirmed — medium, AC7/AC9 and feedback-13 items 1–2.**

With `localStorage['etude-sight-v1']` writes still throwing after completion, Retry, Continue and refused navigation preserve the protected result correctly, but the notice says:

> Sight-reading history is full. The first attempt could not start.

The attempt did start and finish; only saving or abandoning the finished result failed. The text also conflates the ledger's 4096-exposure/500-attempt limits with browser storage failure. The same incorrect context exists in all seven locales because `srtLedgerFailureMessage()` maps only the reason, not the operation/state.

### 2. Abandoned/interrupted content is concealed behind a false verdict

**Confirmed — medium, AC6/AC9 and feedback-13 item 6.**

After leaving Pieces during preview, hiding the page during preview/playing, or navigating Back:

- state becomes `abandoned` or `interrupted`;
- eligibility is durably consumed and the claim/lock are correctly released;
- `#rd-staff` is emptied with `aria-hidden="true"`;
- `#rd-verdict` still says “A new melody is ready — press Start.”

Start then reveals the score and begins practice with a notice. An interrupted Learn → Assess toggle hides the already-consumed score again. Nothing remains eligible at this point, so concealment and the “new melody” verdict are misleading.

### 3. A failed “Switch to practice” silently leaks the active claim and lock

**Confirmed — medium, AC6/AC7.**

If the ledger write fails when `#rd-srt-practice` is pressed, `srtSwitchToPractice()` transitions the UI to `abandoned` before the write, closes the preview, conceals the score and returns silently on `{ ok: false }`.

Observed afterward:

- no failure notice;
- no automatic practice start;
- the exposure still has its claim;
- the attempt lease and `etude-sight-attempt-*` lock remain held;
- pressing main Start begins practice while that stale claim and lock remain held.

This violates the two-lock lifecycle even though the successful switch path still records the accepted terminal status `abandoned`.

### 4. Refused `pendingSave` navigation leaves the URL and view inconsistent

**Confirmed — low/medium, AC9/AC12.**

Changing the hash to `#explore` or using browser history while the abandonment write fails leaves Read visible and protected, but the URL remains `#explore`. After Continue later succeeds, the mismatch still remains: `location.hash` names Explore while `#view-read` is active.

### 5. Refused piece selection leaves the select and model inconsistent

**Confirmed — low, AC9/AC12.**

Selecting `w5rh` while a `pendingSave` abandonment write fails correctly keeps `SR.piece.id === 'gen'`, but `#rd-piece.value` remains `w5rh`, including after Continue succeeds.

### 6. The Learn melody is lost on a repertoire round trip

**Confirmed — low/medium, AC6/AC12 and feedback-13 item 3.**

Learn → Generate produced fingerprint A. Selecting `w5rh` and then `gen` produced a new fingerprint B and a second `learn` exposure. `main` restores the existing generated melody. The required behavior is to reselect the same generated content and apply its existing eligibility state, not silently generate replacement content.

### 7. Practice after a saved attempt has no explanation

**Confirmed — low, AC6/AC9 and feedback-13 item 6.**

After a first attempt reaches `saved`, pressing main Start on the same piece immediately enters practice count-in with an empty notice. The previous result's “First sight” badge is replaced by “Count-in…”, so it does not explain the practice fallback before play begins.

### 8. `already_exposed` wording is inaccurate for non-attempt exposure

**Confirmed — low, AC9.**

All seven translations say the piece was “attempted” (or their direct equivalent), but this key is also used after Learn, Listen and a second-tab exposure where no attempt occurred. The user is told an event happened that did not happen.

### 9. Fresh unwritable storage is misreported as “another tab”

**Confirmed — low/medium, AC7/AC9.**

On a fresh profile, if the first `etude-sight-v1` write fails, every `srtReadLedger()` call creates a different random generation. The following update therefore returns `stale_generation`, and Learn displays:

> Sight-reading data changed in another tab. Try again.

No other tab exists. The UI safely falls back to practice, but the diagnosis is false and gives the user no actionable storage explanation.

### 10. Recent generated content can repeat; the mandatory stress proof is red

**Confirmed — medium, AC6/AC12 and feedback-13 items 3/8.**

The exact required 10× stress command failed because one run saw only three distinct fingerprints across four Generate actions. Runtime rerolling excludes only the immediately previous fingerprint and ledger exposures. It does not exclude other recent unclaimed pieces, so the small and non-uniform P1.a melody space can produce an observable `A → B → A` repeat.

## What Must Be Fixed

1. **Use operation- and state-accurate messages for `pendingSave` failures.**
   - Retry, Continue and refused navigation/generation from `pendingSave` must say that the completed result could not be saved or discarded because browser storage is unavailable/full; they must never say the attempt could not start.
   - Distinguish browser write failure from the ledger's 500/4096 logical limits, either in the result model or through verified operation context.
   - Add deterministic Playwright coverage in all seven languages for failed Retry, Continue and navigation while storage remains unwritable. Install the fake clock before Start, reach `pendingSave` without a real 20-second wait, and prove the exact frozen result, panel, claim, lease and lock remain intact until a later successful recovery.

2. **Render consumed content and present an accurate practice-only state after abandonment/interruption.**
   - Once eligibility is consumed, `abandoned`, `interrupted` and equivalent practice-only states must not conceal the score.
   - Replace the stale “new melody” verdict with an accessible practice explanation or other accurate practice-only status before Start.
   - Add deterministic browser regressions for Pieces → Stats → Pieces, browser Back, hidden preview, hidden playing and Learn → Assess after interruption. Use fake time for preview/count-in; assert visible notes, `aria-hidden="false"`, accurate verdict/notice and a practice count-in.

3. **Make failed “Switch to practice” recovery-safe and lock-consistent.**
   - Preserve accepted option (b): a successful explicit switch records terminal `abandoned`.
   - If the terminal ledger write fails, either keep the preview and controls visible with a localized error, or enter practice only after establishing a consistent terminal/claim state. Never leave a claim, lease or attempt lock held during a practice run.
   - Add a fake-clock Playwright regression that makes `etude-sight-v1` writes fail before clicking Switch to practice, asserts visible localized feedback and no silent dead end, then proves recovery leaves zero claims, zero held attempt locks and no ghost run.

4. **Keep the URL synchronized when protected navigation is refused.**
   - A failed attempt to leave Read must restore/retain `#read`, or automatically complete the originally requested navigation after a successful abandon. URL and active view must never disagree.
   - Add deterministic tests for `location.hash`, browser Back and `show('today')` under persistent write failure followed by recovery. Use fake time to enter `pendingSave`; assert URL/view agreement at every stage.

5. **Restore the real piece value when a selection is refused.**
   - If `pendingSave` protection rejects `#rd-piece` changes, reset the control to `SR.piece.id`; alternatively, complete the requested selection after recovery. The control and model must always agree.
   - Add a deterministic `pendingSave` quota regression selecting `w5rh`, checking both values before and after Continue/Retry recovery.

6. **Preserve the generated melody across repertoire round trips.**
   - Selecting `gen` after visiting `w5rh` must restore the same generated piece and fingerprint.
   - If that fingerprint was exposed in Learn/Listen/first sight, reselection must enter practice with the localized explanation and must not add another exposure merely because of the round trip. If it is still eligible, it must remain concealed and eligible.
   - Add non-random Playwright cases with an injected seed for both eligible Assess content and exposed Learn content; assert stable fingerprint, stable exposure count and the correct eligibility/mode.

7. **Explain practice before restarting a saved piece.**
   - Pressing Start from `completed`/`saved` content must present an accessible localized “already seen/used; practice remains available” notice before practice count-in begins.
   - Add a fake-clock test that completes a first attempt, presses Start on the same piece and asserts the notice before/during `countIn`; include the seven-language matrix or share the matrix with item 8.

8. **Correct `already_exposed` wording in all seven languages.**
   - Use wording that is true for Learn, Listen, a previous attempt and another tab, such as “This piece has already been seen or used. Practice remains available.”
   - Add deterministic locale coverage for at least Learn, Listen and second-tab exposure; do not infer an “attempt” that never occurred.

9. **Report fresh-storage failure as storage failure, not cross-tab mutation.**
   - Keep a stable in-memory generation for a ledger that cannot yet be persisted, or otherwise propagate the actual write failure so the next operation cannot manufacture `stale_generation`.
   - The observable message must identify unavailable/full browser storage and the app must remain safely in practice; it must not mention another tab.
   - Add a fresh-context Playwright test that installs the storage failure before the first ledger read/write, exercises Learn and first-attempt Start, verifies the storage-specific localized message, and uses no real preview wait.

10. **Prevent recent generated-content repetition and make freshness tests deterministic.**
    - Generate must avoid fingerprints from a bounded recent-content history, not only the immediately previous or already-exposed fingerprint. A user clicking Generate several times must not receive `A → B → A`.
    - Add a deterministic production-path regression by stubbing `crypto.getRandomValues` to drive P1.a seeds `0`, `1`, `21`; seeds `0` and `21` collide, so the third Generate must reroll to different content. Do not rely on random uniqueness as the assertion source.
    - Rerun the exact combined 10×/12-worker command until it is 280/280.

11. **Preserve everything already verified.**
    - Keep feedback-13 item 7's legacy repertoire Test/Learn/Listen behavior, state-aware navigation cancellation, harmless pre-play controls, protected `pendingSave`, completed-save consistency, evaluator/rest fixes, two-lock ordering and offline behavior.
    - Preserve the accepted race decisions: successful Switch to practice records `abandoned`; a mode change during preview records `interrupted`; no concurrent panic/hidden handler may rewrite the terminal result or start a ghost practice run.
    - Treat `main`'s sr4/sr5 profile difference as the accepted MVP caveat, not a defect.

12. **Repeat the complete proof.**
    - Run the exact full gate with zero failures and no new skips.
    - Run the evaluator stress at 48/48.
    - Run cancellation plus all corrected iteration regressions at 10×/12 workers with zero failures.
    - Keep all timing-flow browser tests deterministic with `page.clock`; no real 20-second preview waits.

## Recommendations

These are plan-level improvements and are not additional blocking defects beyond the findings above.

1. **Provide a supported ledger-cap recovery path.** `SRT_MAX_EXPOSURES = 4096` intentionally forbids silent deletion, but there is no user-facing `resetLedger` path. Heavy Learn/Listen use can eventually disable first attempts permanently. Add a deliberate export/reset UX or documented retention policy.
2. **Increase or manage the P1.a melody space.** The blocking recent-repeat behavior above needs a bounded-history fix now. Separately, P1.a has only about 845 observed distinct melodies per hand and will eventually saturate even with rerolls; consider expanding the profile's musical space or defining an explicit exhaustion policy.
3. **Use structural equality for terminal idempotency.** `finishAttempt` still compares normalized attempts with `JSON.stringify`, while import uses `structurallyEqual`. Current normalized payloads passed, but one comparison strategy would be more robust to harmless key-order differences.

# Inspector Feedback — Iteration 3

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — M1, model and fingerprint — verified.** Both required FNV-1a vectors pass exactly. The new test changes seed, title, BPM, `profileId`, event IDs, and fingering without changing the fingerprint, and verifies the stable generated `eventId`/`nid` mapping.
- [ ] **AC2 — M2, evaluator — FAILED.** The implementation now uses numeric tie-breaking and the unit suite exercises the requested categories, but it still does not reproduce all six acceptance rows as exact full results. The perfect case asserts only `stars`, the silence case asserts only a subset, and no test verifies the complete return object required by §5.4.
- [ ] **AC3 — M5, generator — FAILED.** The 12,000 deterministic generations pass `srtValidatePiece`, and invalid-profile rejection is now tested. However, the required test still delegates cadence, bar filling, barline, range, leap, rest, and fingering checks to the same validator under test instead of independently asserting every invariant.
- [ ] **AC4 — flow — FAILED.** The pure transition suite does not cover every legal transition. The real practice flow is also internally wrong: after `switchToPractice`, runtime state is `preparing/practice`; `srAssessStart()` sends `countInDone`, which `preparing` rejects, so an active practice performance remains in `preparing` through completion rather than traversing `countIn → playing → completed`.
- [ ] **AC5 — M3, recorder — FAILED.** The focus/reset unit test is improved, but the mandatory Playwright recorder coverage still does not exist. There is no browser verification of `-250 ms`/`T + 250 ms`, all four excluded sources, duplicate input-owner behavior, focus release, panic, MIDI, keyboard, and on-screen keys across views.
- [ ] **AC6 — M4 and M7, assess mode — FAILED.** A clean first-sight claim, preview, keyboard performance, evaluation, save, and subsequent practice eligibility now work. However, practice does not traverse the state machine, `continueWithoutSave` releases the attempt lease without immediately writing a terminal attempt or clearing its claim, and interruptions are persisted as `abandoned` rather than `interrupted`. These lifecycle gaps violate the specified completed/pending-save/interruption flow.
- [ ] **AC7 — M6, ledger — FAILED.** Direct browser probing proved that saving the same completed attempt twice is not idempotent: the first save succeeds and clears the claim, while the second identical save returns `owner_mismatch`. `importLedger` also bypasses the generation check: after `resetLedger`, an import using the old generation succeeds instead of returning `stale_generation`. Mandatory two-tab claim, pending-save recovery protection, reset/stale-generation, idempotency, and 500/4096 Playwright cases are absent.
- [ ] **AC8 — M8, backup — FAILED.** Import now occurs before the main payload write and merge normalization is improved, but no backup tests exist. The stale-generation bypass applies to import, and invalid `sightLedger` records are silently ignored rather than strictly rejected. Old-v3 compatibility, active-claim preservation, imported-claim abandonment, union, deduplication, conflict, and quota behavior are not verified.
- [ ] **AC9 — M9, UI and accessibility — FAILED.** The summary fields and seven-language strings exist, and no horizontal document overflow was found at the required widths. The required non-colour symbols are not visibly rendered: the implementation puts `✓`, `≈`, and `✗` only inside SVG `<title>` elements/accessible labels, and screenshots show only colour changes. No score element is ever assigned `extra`, so `+` cannot appear for an extra attack. At 320 px and 640×320, opening preview leaves its action buttons above the current viewport because focus/scroll remains on the original Start control. Automated language/theme/size/contrast/reduced-motion coverage is still absent.
- [ ] **AC10 — M10, offline — FAILED.** The new `@sw` test does not execute the Sight-Reading flow offline. It generates online, goes offline, reloads, and only asserts that the pre-offline fingerprint/piece existed and that a ledger key exists afterward; it never asserts the post-reload piece, generates offline, claims, records keyboard input, evaluates, or saves offline.
- [x] **AC11 — quality gates — verified.** The exact required command passed: suppression check and strict TypeScript, ESLint, 42 Vitest tests, both builds, and full Playwright with 214 passed, zero failures, and zero skips. The dedicated Sight-Reading runs also passed: 10 Vitest tests and 2 app-project Playwright tests.
- [x] **AC12 — no regressions — verified.** Existing tests and goldens are unchanged, no skips or early returns were introduced, the complete suite passes, and no uncaught browser errors appeared. In a real browser I started a clean first attempt, played a computer-keyboard note, saw the detailed summary, reloaded, regenerated the same fingerprint, and confirmed it entered practice without another preview.

## Quality Gate

- Command: `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test`
- Port safety: PASS — port 8787 was checked and free before the full run. Manual verification used an Inspector-owned server on port 8791.
- Result: PASS
- Details:
  - Typecheck: PASS, including suppression checker and strict TypeScript.
  - Lint: PASS.
  - Unit: PASS — 10 files, 42 tests.
  - Build: PASS.
  - Standalone build: PASS.
  - Full Playwright: PASS — 214 passed in approximately 1.4 minutes, zero failures and zero skips.
  - Dedicated Sight-Reading: PASS — 10 Vitest tests and 2 app-project Playwright tests. The third sight-reading test runs only in the `sw` project and passed in the full run.

## Commit and Tree Checks

- Builder commit: `51adf32 fix(sight-reading): [B] close MVP lifecycle gaps`.
- Title length: within 72 characters.
- Required Builder trailers: PASS — exact `Assisted-by: GPT:5.6-Luna` and `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>` are present.
- Branch: PASS — `feat/sight-reading-v3`.
- Pre-inspection tree: clean.
- Exclusions: PASS — the Builder commit does not contain `.DS_Store`, `node_modules/`, `test-results/`, or `dist/`.
- Diff hygiene: PASS — `git diff --check HEAD~1..HEAD` produced no errors.

## Issues Found

### 1. Completed-attempt idempotency is broken

Using the real browser module and Web Locks:

1. `claimExposure` succeeded.
2. The first `finishAttempt` succeeded.
3. The second call with the identical attempt payload returned `{ ok: false, reason: 'owner_mismatch' }`.

`finishAttempt` checks the active exposure owner before checking whether an identical terminal attempt already exists. The first save removes the claim, so the mandated idempotent retry can never succeed.

### 2. Stale imports can modify a reset ledger

After reading generation A and calling `resetLedger` to create generation B, `importLedger` with generation A returned success. The code explicitly exempts import from the generation check. This contradicts the mandatory stale-generation rule and allows an old tab to merge data after another tab resets the ledger.

### 3. Practice and unsaved-result lifecycle states are incomplete

- `switchToPractice` transitions to `preparing/practice`, but runtime never sends `startPreview`; it sends `countInDone` directly, which is illegal from `preparing`.
- `continueWithoutSave` releases the lease but does not call `abandonAttempt`, so the active claim remains until later orphan recovery.
- `srtAbandonClaim('interrupted')` always uses `abandonAttempt`, whose stored status is always `abandoned`; terminal `interrupted` results are never written.

### 4. The required non-colour result symbols are not visible

Manual screenshots after a keyboard performance show green/red noteheads only. The glyph is stored in SVG `<title>`, which supplies a tooltip/accessibility name but is not a visible symbol. Extra attacks have no mapped score node, and runtime never assigns the `extra` result state, so the required visible `+` is impossible.

### 5. The offline test does not test offline Sight-Reading

The test's post-offline object includes `fingerprint` and `piece`, but neither is asserted. It does not perform generation, fingerprinting, claiming, input recording, evaluation, or ledger saving while offline. The test can pass even if the complete offline user journey is broken.

### 6. Mandatory browser suites remain largely absent

Only three Sight-Reading Playwright tests exist: clean preview, switch to practice, and the superficial offline check. There are no dedicated browser cases for recorder rules, two-tab locking, orphan recovery, pending-save protection, reset/stale generation, ledger limits/idempotency, backup merging/conflicts, result symbols, language/theme/size changes, contrast, or the required responsive matrix.

### 7. Required exact/invariant unit proofs are incomplete

The evaluator vectors use partial assertions rather than exact full results, and generator invariants are not independently asserted. A defect shared by generator and validator could still pass all 12,000 cases.

### 8. Preview actions can open outside the current mobile viewport

At 320×700 and 640×320, clicking the lower Start control opens the preview panel above the current scroll position while focus remains below it. Bounding boxes for the preview actions were above the viewport. The user must discover that they need to scroll upward before “Start now” or “Switch to practice” is available.

## What Must Be Fixed

1. Check for an identical existing terminal attempt before requiring an active claim, so repeated `finishAttempt` calls are idempotent; keep conflicting payloads rejected.
2. Enforce `operation.generation === ledger.generation` for `importLedger`, and add the two-tab reset/stale-generation test.
3. Make practice traverse `preparing → countIn → playing → completed`; persist and clear terminal state immediately for “Continue without saving”; store interruptions as `interrupted`.
4. Render visible `✓`, `≈`, `✗`, and `+` annotations in or beside the score, each with a meaningful `<title>`, rather than relying on colour and hidden title text.
5. Add the complete required Playwright matrix for recorder, ledger concurrency/recovery/limits, backup, flow, UI/accessibility/responsiveness, and a genuine full offline journey.
6. Strengthen evaluator tests to exact full acceptance results and generator tests to independently assert every invariant across all 12,000 generations.
7. Move focus/scroll to the preview's primary action when preview opens, and verify 320 px plus short-landscape behavior.
8. Re-run the exact full quality gate and the manual keyboard/reload journey.

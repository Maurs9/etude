# Inspector Feedback — Iteration 2

## Verdict: FAIL

## Acceptance Criteria Check

- [ ] **AC1 — M1, model and fingerprint — FAILED.** The implementation still produces both required FNV-1a vectors and the model now validates more profile rules, but the required proof is incomplete. `tests/sight-reading-core.test.mjs` still has only the original vector test: it does not prove that seed, title, BPM, `event.id`, `finger`, and `profileId` are ignored, and it does not verify the stable `eventId ↔ nid` mapping from `srtToLegacyPiece`.
- [ ] **AC2 — M2, evaluator — FAILED.** The narrowed repeated-note window is now applied while constructing DP candidates, but no iteration-2 evaluator tests were added. The suite still lacks the required inclusive 100/180/250 ms boundaries, chord-order case, close repeated-note case, rest-violation rule, `N = 0`, and full-field assertions for all six vectors. The tie-break is also encoded as one lexicographically compared string containing decimal times, rather than the specified numeric tuple ordering.
- [ ] **AC3 — M5, generator — FAILED.** The dead tonic-only branch from iteration 1 is fixed, generation is deterministic, and the 12,000 calls pass. However, the unchanged test still delegates every invariant to `srtValidatePiece` rather than independently checking cadence shape, nonempty bars, barline boundaries, range/leaps, rests, and fingering as required. Invalid-profile rejection is not tested.
- [ ] **AC4 — flow — FAILED.** Only one happy-path unit test exists; it does not cover every legal transition. Integration also leaves the state machine inconsistent: “Switch to practice” leaves the state as `abandoned` with the first-sight `attemptId`, then practice completion is saved as a `completed` attempt under that abandoned claim.
- [ ] **AC5 — M3, recorder — FAILED.** There is still no required Playwright recorder suite. Real integration has a release-kind bug: `releaseFocusInput()` first calls `handleNoteOff()`, which records `releaseKind: 'physical'`; the later `releaseAll('focus', ...)` sees no held recorder note, so focus releases are not recorded as `focus`. The browser requirements for boundaries, excluded sources, duplicate note-ons, panic, and unchanged input behavior are unverified.
- [ ] **AC6 — M4 and M7, assess mode — FAILED.** The runtime now uses a `T + 250 ms` barrier and removes greedy assess-time colouring, but the fresh-user flow is broken. With no existing `etude-sight-v1`, `srtReadLedger()` creates but does not persist a random generation; `srtLedgerUpdate()` then reads a second new generation and rejects the first claim as `stale_generation`. In a real browser, clicking Start on a fresh generated assessment entered `blocked` and displayed `stale_generation`, so the required preview/attempt cannot begin. With a manually initialized ledger, completion produced a summary, but zero score notes received `data-s`, a symbol, a title, or an accessible label because `srAssessFinish()` never calls `srPaintAll()` after filling `SR.results`. “Switch to practice” also leaves the claim unterminated and later records the practice performance as that claim’s completed attempt.
- [ ] **AC7 — M6, ledger — FAILED.** The fresh-ledger generation bug makes first-sight unusable on a clean profile. Required two-tab, reset/stale-generation, pending-save, orphan-recovery, idempotency, and limit Playwright coverage is absent. Completed exposure claims are never cleared; after attempt trimming, such claims can be rediscovered as orphaned and rewritten as abandoned. Without Web Locks, the UI says practice remains available but shows no preview or practice button and leaves Start inert, so there is no accessible path into in-tempo practice.
- [ ] **AC8 — M8, backup — FAILED.** Export/import wiring exists, but no required backup tests were added. Import writes the main `ptt-v3` payload before the asynchronous ledger merge result is known and reloads even on a merge conflict. Re-importing an otherwise identical foreign attempt can conflict solely because the first import rewrites its generation to the local generation, while conflict comparison includes the original generation. Imported unfinished claims whose fingerprint already exists locally are skipped rather than always becoming terminal `abandoned` attempts.
- [ ] **AC9 — M9, UI and accessibility — FAILED.** The detailed summary and all 12 new strings exist in all seven languages, and manual checks found no horizontal overflow at 320, 390, 1024, 1920, or 640×320 with reduced motion. However, completed notes are not repainted, so the required result symbols/titles are absent in the actual flow; no visible `+` is created for extra attacks at all. The preview panel is `aria-live="polite"` while its countdown text changes every second, so it announces timer ticks rather than only state changes. Required automated language/theme/size/contrast/accessibility coverage is absent.
- [ ] **AC10 — M10, offline — FAILED.** No new `@sw` Sight-Reading flow test exists. The only sight-reading tests are two Vitest files. Since a clean online profile already fails its first claim with `stale_generation`, the complete first-sight flow cannot pass offline either.
- [x] **AC11 — quality gates — verified.** The exact required command passed: typecheck and suppression checks passed with zero explicit `any`; lint passed; Vitest reported 10 files / 38 tests passed; both builds passed; full Playwright reported 211 passed in about 1.2 minutes with zero failures and no skips. No checker, TypeScript strictness, or ESLint weakening was found, and the sight-reading modules contain no prohibited casts or suppressions.
- [ ] **AC12 — no regressions — FAILED.** Existing tests and goldens are unchanged, no skip markers were added, and the full existing suite passes. The mandatory fresh-browser first-attempt journey cannot be completed because of `stale_generation`. In addition, after opening a generated sight-reading piece and selecting a repertoire piece, `SR.srtPiece` and `SR.srtFingerprint` remain set to the generated piece; subsequent repertoire assessment therefore uses the generated expected notes/rest windows instead of the selected repertoire piece. This is a direct Read & Play regression.

## Quality Gate

- Command: `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test`
- Port safety: PASS — port 8787 had no listener before the full Playwright run. Manual verification used an Inspector-owned Vite server on port 8790 and stopped it afterwards.
- Result: PASS
- Details:
  - Typecheck: PASS, including suppression checker and strict TypeScript.
  - Lint: PASS.
  - Unit: PASS — 10 files, 38 tests.
  - Build: PASS.
  - Standalone build: PASS.
  - Playwright: PASS — 211 passed in approximately 1.2 minutes, zero failures and zero skips.

## Commit and Tree Checks

- Builder commit: `e29e86a feat(sight-reading): [B] complete MVP flow`.
- Title length: 42 characters, within the 72-character limit.
- Required Builder trailers: PASS — exact `Assisted-by: GPT:5.6-Luna` and `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>` are present.
- Branch: PASS — `feat/sight-reading-v3`.
- Pre-inspection tree: clean.
- Exclusions: PASS — the Builder commit does not contain `.DS_Store`, `node_modules/`, `test-results/`, or `dist/`; none is tracked.
- Diff hygiene: PASS — `git diff --check HEAD~1..HEAD` produced no errors.

## Issues Found

### 1. A clean profile can never claim its first first-sight attempt

`srtReadLedger()` returns a newly generated in-memory ledger when the storage key is absent, but it does not persist that ledger. Callers pass that generation to `srtLedgerUpdate()`, whose locked read creates another ledger with a different random generation. The operation is therefore rejected as `stale_generation`.

Real-browser evidence on a clean profile:

- generated piece state began at `idle`;
- clicking Start moved to `blocked`;
- the verdict became `stale_generation`;
- `localStorage['etude-sight-v1']` remained absent;
- the preview never appeared.

This blocks AC6, AC7, AC10, and the mandatory AC12 manual journey.

### 2. “Switch to practice” corrupts the attempt lifecycle

With an initialized ledger, pressing “Switch to practice” produced:

- state `abandoned`, mode `practice`, but the original `attemptId` remained;
- no terminal attempt was written;
- the exposure retained its active claim;
- after forcing the practice performance to finish, that same attempt was stored as `completed`, while the state remained `abandoned`.

Practice must not complete the reserved first-sight attempt.

### 3. Evaluation results are not painted on the score

`srAssessFinish()` populates `SR.results`, then calls `srStopAll(true)`. The `keep` branch does not call `srPaintAll()`, and no later call paints the result. Browser inspection after completion found zero notes with result `data-s`, `<title>`, or `aria-label`. The required `+` for extras also has no score element or alternative rendering path.

### 4. Focus release metadata is incorrect

`handleNoteOff()` always emits `releaseKind: 'physical'`. `releaseFocusInput()` invokes it before `srtRecorder.releaseAll('focus', ...)`, so the recorder’s held note is already closed and cannot be relabelled as a focus release.

### 5. Generated state leaks into repertoire assessment

`srSelectPiece()` changes `SR.piece` but never clears `SR.srtPiece`, `SR.srtFingerprint`, or the associated state. Browser verification showed a fixed repertoire piece (`w5rh`) selected while `SR.srtPiece.profileId` remained `P1.a` and the generated fingerprint remained set. `srAssessFinish()` branches on `SR.srtPiece`, so it evaluates the wrong piece.

### 6. Required MVP verification suites still do not exist

Iteration 2 changed no tests. There are still only:

- `tests/sight-reading-core.test.mjs` (76 lines);
- `tests/sight-reading-flow.test.mjs` (35 lines).

There are no sight-reading Playwright specs for recorder behavior, integration, two-tab locks, backup, responsive/accessibility UI, or service-worker offline operation. Several mandatory unit vectors and transition cases also remain absent.

### 7. Ledger/import edge cases remain unsafe

- Completed claims remain attached to exposures indefinitely.
- Trimming old attempts can turn a formerly completed retained claim into an apparent orphan.
- Imported conflict handling occurs after the primary backup payload has already been written.
- Re-import deduplication compares generation-rewritten and original objects byte-for-byte.
- Imported unfinished claims are not universally converted to `abandoned`.

### 8. Accessibility behavior contradicts the announcement requirement

The preview container is live while its countdown mutates once per second. That creates repeated live announcements instead of announcements only when the workflow state changes.

## What Must Be Fixed

1. Persist one initial ledger atomically, or otherwise ensure the first read and first locked operation use the same generation.
2. Make “Switch to practice” write/confirm the abandoned terminal attempt, clear the first-sight attempt identity, release the lease only after persistence, and run practice under a separate practice state.
3. Paint evaluated note results after completion and provide visible, titled non-colour symbols for good, near, missed, and extra attacks.
4. Propagate `focus` and `reset` release kinds through the real input-owner release path.
5. Clear generated sight-reading state whenever a non-generated piece is selected, and regression-test repertoire assessment after visiting the generator.
6. Correct ledger claim cleanup/trimming and import idempotency/conflict behavior.
7. Provide a real no-Web-Locks path into in-tempo practice while disabling only first-sight eligibility.
8. Move the changing countdown outside the live region or suppress per-second announcements.
9. Add every missing Vitest and Playwright case named by AC1–AC10, including the two-tab and `@sw` journeys.
10. Re-run the exact full quality-gate command and repeat the fresh-profile manual keyboard journey without manually seeding the sight ledger.

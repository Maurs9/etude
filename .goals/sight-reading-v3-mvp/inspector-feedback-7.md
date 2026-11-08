# Inspector Feedback — Iteration 7

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — M1, model and fingerprint — verified.** The model uses 480 ticks per quarter, validates the v1 generated-piece rules, preserves stable `eventId ↔ nid` mapping, and builds expected events. The canonical FNV-1a vectors are exactly `v1:e8020957ec2a1005` and `v1:8472a9986749aba1`. The tests prove that seed, title, BPM, event ID, fingering and profile ID do not affect the fingerprint.
- [ ] **AC2 — M2, evaluator — FAILED.** The monotone per-pitch matcher, close-repeat window, timing boundaries, chord order, six complete vectors, substitutions, stars, Perfect and `N = 0` are correct. However, `restViolations` does not implement the complete §5.4 rule. At `src/sight-reading/evaluate.ts:144-146`, every unmatched input strictly inside a rest is counted. The specification counts it only when it is also outside the association windows of the neighboring notes. An independent probe with expected C attacks at 0 ms and 1000 ms, a rest `(100, 1000)`, and performed C attacks at 0, 200 and 1000 ms produced two correct matches, one extra attack at 200 ms, and `restViolations: 1`. The extra is inside the previous note's inclusive 250 ms association window, so the required value is `0`. The existing rest test at `tests/sight-reading-core.test.mjs:103-105` uses an extra centered in a rest and never exercises the neighboring-window exclusion.
- [x] **AC3 — M5, generator — verified.** Generation uses internal Mulberry32 and not `Math.random`. The independent invariant body covers all P1.a–P2.c profiles, both hands and seeds 0–999: 12,000 deterministic pieces, each validated for cadence, bar filling, no initial rest, no barline crossing, range, diatonic leap, required rests/repeats and fingering.
- [x] **AC4 — flow — verified.** The pure state-machine suite enumerates every legal transition, verifies all other events leave each state unchanged, and covers first-sight, practice, interruption and pending-save paths.
- [x] **AC5 — M3, recorder/input contract — verified.** The recorder enforces `[-250 ms, T + 250 ms]`, ignores pre-window holds until release, excludes playback sources, suppresses duplicate attacks, and preserves focus/physical/reset releases. Iteration 7 correctly tracks physical source families even when a second source owns an already-held pitch. An independent real-browser probe used computer keyboard plus MIDI during one first-sight attempt and verified the saved terminal attempt had `mixedInput: true`. It also verified a normal ledger/backup accepts the boolean while a backup containing `mixedInput: "yes"` is rejected.
- [x] **AC6 — M4 and M7, assess/first-attempt behavior — verified.** Assess mode uses the evaluator after the barrier, does not greedily colour the score during play, colours only after completion, keeps generated results out of repertoire `data.sheet` best scores, and sets `SR.wrongExtra = FP`. The full preview/count-in/play/save/practice lifecycle and pending-save actions pass. Independent browser probes verified suspended audio and direct BLE disconnect both enter `interrupted`, persist an interrupted terminal, clear the exposure claim and release the attempt lock. Saved note-name assistance is hidden during eligible preview and restored, still checked, in practice.
- [x] **AC7 — M6, ledger — verified.** Browser tests exercise attempt-lock-before-ledger-lock ordering, short ledger-lock release, atomic two-tab claiming, real pending-save protection, orphan recovery with `ifAvailable`, stale generation after a reset in another tab, owner mismatch, idempotency, 500/4096 limits, newer-schema preservation and the no-Web-Locks practice fallback. Mixed-input provenance is backward-normalized and strictly validated.
- [x] **AC8 — M8, backup — verified.** Export includes `sightLedger`; old v3 backups without it remain valid; import preserves the local generation and active claim, abandons imported unfinished claims, unions records, deduplicates identical results, rejects conflicting attempt IDs and malformed nested data, and reports quota failures.
- [x] **AC9 — M9, UI/accessibility/i18n — verified.** The summary exposes F1, TP/N, FP, rhythm, mean offset and mode. Notes use symbols and localized `<title>` elements. Aria-live changes only with state transitions. Responsive, short-landscape, reduced-motion, theme, contrast and relocalization matrices pass. All six ledger failure messages were independently verified as non-empty in all seven locales (42 localized values), and the blocked UI no longer exposes `quota`.
- [x] **AC10 — M10, offline — verified.** Service-worker coverage passes for the pure generation/fingerprint/evaluation/ledger path and the actual first-attempt UI path with keyboard input and a saved result while offline.
- [x] **AC11 — quality gates — verified.** The complete required gate passed: strict typecheck/suppression check, lint, 105 unit tests, production build, standalone build and 260 Playwright tests, with zero failures and zero skips. The Sight-Reading modules contain no explicit `any`, suppression directives or prohibited casts.
- [x] **AC12 — no regressions — verified.** No baseline test was changed or removed; all Sight-Reading tests are additions. Goldens are unchanged. Protected TypeScript/ESLint checkers are unchanged. No excluded output is tracked. The full app suite, every-view boot coverage, existing step-by-step/repertoire behavior, offline deployment and storage fixtures pass.

## Iteration 7 Required Fixes

- [x] Mixed keyboard/MIDI source-family tracking uses actual input routes and persists `mixedInput`.
- [x] Ledger and backup validation accepts old attempts without the field, normalizes them to `false`, preserves booleans and rejects non-booleans.
- [x] AudioContext suspension interrupts the eligible attempt and cleans up terminal state, claim and lock.
- [x] Direct BLE disconnect interrupts the eligible attempt and performs the same cleanup.
- [x] First-sight preview/count-in/playing suppress note names and practice restores the saved preference.
- [x] Ledger failure messages exist in en, ro, es, fr, de, it and pt-BR.
- [x] The non-greedy browser test sends the expected pitch through `handleNoteOn`, proves the recorder received it, verifies no score result styling while playing, then verifies colouring and symbols after `srAssessFinish`.

## Quality Gate

- Command sequence: `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test`
- Port handling: port `8787` was occupied by an existing unknown Node server. It was not stopped. Playwright used a temporary untracked external-equivalent config on free port `8799`; the temporary file was removed afterward.
- Result: PASS.
- Details:
  - Typecheck: PASS — suppression checker and strict TypeScript; `0 explicit any values`.
  - Lint: PASS.
  - Unit: PASS — 15 files, 105 tests.
  - Build: PASS.
  - Standalone build: PASS.
  - Playwright: PASS — 260 passed in approximately 1.5 minutes, zero failures and zero skips.

## Manual and Targeted Browser Verification

A headed Chrome journey used real timers and the computer keyboard:

1. Cleared local data, generated a fresh piece and entered first-sight preview.
2. Started the attempt, waited for real `playing`, pressed and released computer key `A`, and waited for the natural completion/save barrier.
3. Verified the visible summary: `Score: 5% · First sight · Pitch F1 17% · Notes TP 1/11 · Extra attacks FP 0 · Rhythm 5% · Mean offset -140 ms`.
4. Reloaded, regenerated the same deterministic piece and pressed Start.
5. Verified the preview remained hidden and the piece entered `practice`, so it was no longer first-sight eligible.

No page errors occurred. Separate real-browser probes also verified mixed keyboard/MIDI persistence and backup validation, audio-suspension cleanup, BLE-disconnect cleanup, note-name suppression/restoration, all seven locale message sets, and real-input non-greedy colouring behavior.

## Commit and Tree Checks

- Builder commit: `e9222d6 fix(sight-reading): [B] close iteration 7 feedback`.
- Builder title: PASS — 50 characters.
- Builder trailers: PASS — required Assisted-by and Copilot co-author trailers are present.
- Branch: PASS — `feat/sight-reading-v3`.
- Builder diff check: PASS.
- Goal-wide diff check: PASS.
- Existing tests: PASS — no test present at initial SHA `a26497d263a31d1c0d74921a07ea4b8720d8af6c` changed or disappeared.
- Goldens: PASS — unchanged.
- Exclusions: PASS — no tracked `.DS_Store`, `node_modules/`, `test-results/` or `dist/`.

## Issues Found

### 1. Rest violations ignore neighboring note association windows

`src/sight-reading/evaluate.ts:144-146` only checks whether an extra attack is strictly inside a rest. Section 5.4 additionally requires the attack to be outside the association windows of the notes neighboring that rest.

Reproduction:

- expected C at `0 ms`;
- expected C at `1000 ms`;
- notated rest `(100 ms, 1000 ms)`;
- performed C at `0 ms`, duplicate C at `200 ms`, and C at `1000 ms`.

The dynamic matcher correctly pairs the 0 and 1000 ms attacks and leaves the 200 ms attack as `FP`. Because 200 ms is inside the previous note's 250 ms association window, it must not be a rest violation. Actual result: `restViolations: 1`; required result: `restViolations: 0`.

## What Must Be Fixed

1. Change `restViolations` calculation so an unmatched attack inside a rest is counted only if its onset is outside the effective association windows of both neighboring expected notes. Reuse the same 250 ms maximum and close-repeated-note 45% narrowing used for matching.
2. Add exact unit cases for an extra inside a rest but within the previous neighbor's window and within the next neighbor's window; both must yield `restViolations: 0`.
3. Keep a central-rest extra case outside both neighboring windows and verify it yields `restViolations: 1`.
4. Re-run the exact full gate.

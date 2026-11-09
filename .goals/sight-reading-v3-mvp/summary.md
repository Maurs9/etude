# Sight-Reading v3 MVP — Completed

## Result

The Sight-Reading v3 MVP is implemented on `feat/sight-reading-v3`.

All acceptance criteria in `goal.md` are verified:

- The strict TypeScript score model, deterministic fingerprinting, evaluator, and seeded generator support every MVP profile.
- First-sight and practice flows enforce preview, count-in, playing, completion, pending-save, interruption, and post-reload eligibility rules.
- Keyboard, pointer, MIDI, and BLE input are recorded with physical ownership, mixed-input provenance, interruption handling, and safe terminal persistence.
- The ledger provides atomic first-sight claims, pending-save protection, recovery, idempotency, bounded history, safe import/export, and a no-Web-Locks practice fallback.
- First-sight eligibility survives cancellation, Learn, Analysis excerpts, and practice switching. No path reveals unseen content without a durable ledger record.
- Results, responsive UI, accessibility semantics, all seven locales, theme/motion behavior, and offline service-worker behavior are covered.

## Final verification

Inspector 18 passed every acceptance criterion independently. The isolated exact gate passed:

- Typecheck: PASS, including `0 explicit any` values.
- Lint: PASS.
- Unit tests: PASS — 15 files, 112 tests.
- Production and standalone builds: PASS.
- Playwright: PASS — 313 passed, zero failed, zero skipped.

The Inspector ran Playwright through an untracked temporary configuration on port 8799 with `reuseExistingServer: false`; it never used the shared port 8787. It also stress-tested the final three-tab stale-claim race across 40 cycles, verified a normal keyboard first-sight journey, and verified the same piece remains practice-only after reload.

## Iteration history

The loop ran 18 iterations. Three earlier PASS verdicts (5, 7, and 10) were later overturned by deeper independent checks; each reversal found a real defect.

1. Iterations 1–4 established the MVP and closed missing flow, ledger, backup, accessibility, generator, browser, and offline-coverage work.
2. Iteration 5 initially passed; a deeper review found focus-loss ownership, localization, coverage, and order-sensitive ledger-import-deduplication defects.
3. Iterations 6–7 fixed mixed-input persistence, audio/BLE interruption, hidden note-name assistance, localized ledger errors, and non-greedy testing. A later check found that `restViolations` counted extras inside neighbouring-note association windows.
4. Iterations 8–11 corrected rest-neighbour association by time, enforced the 250 ms cap, proved genuine close-repeat boundary cases, and found practice-switch/ledger-wait races.
5. Iterations 12–16 hardened cancellation, pending-save failure, generation freshness, Learn/Analysis eligibility, Retry/notice consistency, and reveal-race behavior.
6. Iteration 17 found a stale in-flight claim could let Learn reveal content without a durable exposure.
7. Iteration 18 distinguishes issued claims from durable claims. Learn now remains concealed until it records a current-generation `learn` exposure, then enters coherent practice; the old claim cannot overwrite that state or leak an attempt lock.

## Process notes

- Duplicate orchestration early in the goal raced shared builds and the default Playwright server port. Later iterations used a single orchestrator and isolated ports.
- Completion was marked prematurely after iterations 7 and 10; later reviews correctly reopened the goal. The final pass is Inspector 18, after a hard cap that allowed one blocker-only Builder/Inspector round.

## Recommendations

- Keep the browser matrices and offline cases as mandatory regression coverage for Sight-Reading changes.
- Preserve structural equality for ledger imports; object key order must never determine backup conflicts.
- Most first-sight async orchestration lives in `src/domain/views-runtime.ts`: about 1,120 lines were added there during this goal, versus 85 lines in the pure `flow.ts` state machine. A follow-up should move orchestration into `src/sight-reading/` with unit-level race tests.
- Future goal loops should use one orchestrator, a hard iteration cap, and a frozen worktree during inspection.

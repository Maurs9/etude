# Sight-Reading v3 MVP — Completed

## Result

The Sight-Reading v3 MVP is implemented on `feat/sight-reading-v3`.

All acceptance criteria in `goal.md` are verified:

- The strict TypeScript score model, deterministic fingerprinting, evaluator, and seeded generator support every MVP profile.
- First-sight and practice flows enforce preview, count-in, playing, completion, pending-save, interruption, and post-reload eligibility rules.
- Keyboard, pointer, MIDI, and BLE input are recorded with physical ownership, mixed-input provenance, interruption handling, and safe terminal persistence.
- The ledger provides atomic first-sight claims, pending-save protection, recovery, idempotency, bounded history, safe import/export, and no-Web-Locks practice fallback.
- Results, responsive UI, accessibility semantics, all seven locales, theme/motion behavior, and offline service-worker behavior are covered.

## Verification

Iteration 10 Inspector passed every acceptance criterion. The exact gate passed with 109 unit tests and 260 Playwright tests, with no failures or skips. The headed keyboard and reload journey also passed.

## Iteration history

1. Iterations 1–4 established the full MVP and successively closed missing flow, ledger, backup, accessibility, generator, and browser-coverage gaps.
2. Iteration 5 initially passed, but independent follow-up verification caught recorder ownership, localization, and incomplete coverage defects. The goal was correctly reopened.
3. Iteration 6 corrected those defects, then uncovered mixed-input provenance, audio/BLE interruption, assistance suppression, localization of ledger reasons, and a weak non-greedy regression test.
4. Iteration 7 implemented those requirements, then independent verification found neighboring-window rest-violation defects.
5. Iterations 8–9 corrected the neighboring-window logic, enforced the absolute 250 ms evaluator cap, and strengthened the close-repeat tests.
6. Iteration 10 supplied genuine extra-input boundary evidence for the 135/165 ms inclusive cases and passed fresh independent inspection.

## Recommendations

- Keep the browser matrices and offline cases as mandatory regression coverage for Sight-Reading changes.
- Preserve the structural ledger-import equality check; serialized object key order must never determine backup conflicts.
- Keep any future input source, audio lifecycle, or assisted-notation work within the existing recorder and eligibility contracts.

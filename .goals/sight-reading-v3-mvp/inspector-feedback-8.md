# Inspector Feedback — Iteration 8

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — M1, model and fingerprint — verified.** The model/fingerprint tests still prove the exact canonical strings and reference fingerprints `v1:e8020957ec2a1005` and `v1:8472a9986749aba1`, ignore the required non-musical fields, preserve stable event/note IDs, and use 480 ticks per quarter.
- [ ] **AC2 — M2, evaluator — FAILED.** The Builder fixed the original neighboring-window omission for the normal 250 ms path, and the shared association-window map correctly applies the 45% close-repeat rule under default configuration. However, the evaluator still does not enforce the specification's absolute 250 ms maximum. `src/sight-reading/evaluate.ts:156` accepts any `config.windowMs` without clamping it, and lines 57–59 then use that value as the maximum for both matching and rest-neighbor exclusion. An independent probe with one expected note at 0 ms, one performed attack at 400 ms and `{ windowMs: 500 }` returned `TP: 1`, `FN: 0`, `FP: 0`; the required 250 ms maximum makes that attack unmatched. A second probe with expected C attacks at 0 and 1000 ms, a rest `(100, 1000)`, an extra C at 400 ms and `{ windowMs: 500 }` returned `restViolations: 0`; 400 ms is outside the required 250 ms neighboring window and must count as `1`.

  The new regression body also does not genuinely cover the 45%-narrowed rest behavior. `tests/sight-reading-core.test.mjs:109-128` places the repeated notes 1000 ms apart, so `0.45 × 1000 = 450` and every tested effective window is merely the 250 ms cap. The separate matching test at lines 81–88 proves narrowing for note matching, but not that `restViolations` uses the narrowed window. An independent default-window probe with repeated C attacks 300 ms apart confirmed the current implementation's intended boundary behavior (`135 ms` and `165 ms` excluded from violations; `136 ms`, `150 ms` and `164 ms` counted), but those exact cases are absent from the committed tests.
- [x] **AC3 — M5, generator — verified.** The 12,000-piece test independently checks every profile, both hands and seeds 0–999 for meter, complete bars, no initial rest, no barline crossing, range, diatonic leaps, cadence, required rests/repeats and fingering. Generation remains deterministic and rejects invalid profiles.
- [x] **AC4 — flow — verified.** The pure transition suite enumerates every legal transition and checks every other event leaves each state unchanged, including first-sight, practice, interruption and pending-save paths.
- [x] **AC5 — M3, recorder/input contract — verified.** Unit and browser tests cover the `[-250 ms, T + 250 ms]` window, pre-window holds, duplicate attacks, excluded playback sources, physical/focus/reset releases, keyboard/pointer/MIDI/BLE ownership and mixed-input persistence.
- [x] **AC6 — M4 and M7, assess/first-attempt behavior — verified.** Browser coverage passes for preview/count-in/play/save/practice, pending-save outcomes, Listen/refresh/visibility invalidation, the `T + 250 ms` completion barrier, non-greedy coloring, generated-result isolation, `SR.wrongExtra = FP`, audio suspension, BLE disconnection and note-name suppression/restoration.
- [x] **AC7 — M6, ledger — verified.** The passing suites cover attempt-lock-before-ledger-lock ordering, short ledger-lock release, two-tab atomic claims, pending-save/orphan protection with `ifAvailable`, stale generations, owner mismatch, idempotency, 500/4096 limits, newer-schema preservation and the no-Web-Locks practice fallback.
- [x] **AC8 — M8, backup — verified.** Export includes the optional ledger; old v3 payloads remain accepted; import preserves the local generation and active claim, abandons imported unfinished claims, unions records, rejects conflicting attempt IDs and validates nested/mixed-input data.
- [x] **AC9 — M9, UI/accessibility/i18n — verified.** Results expose F1, TP/N, FP, rhythm, mean offset and mode. Symbols and localized SVG titles remain present; aria-live, all seven languages, themes, reduced motion, 320/390/1024/1920/short-landscape layouts and 4.5:1 symbol contrast all pass.
- [x] **AC10 — M10, offline — verified.** Both the pure offline path and the actual service-worker first-attempt UI path with keyboard input and a saved result pass.
- [x] **AC11 — quality gates — verified.** The final uncontended exact gate passed: strict typecheck/suppression checks, lint, 106 unit tests, production build, standalone build and 260 Playwright tests, with zero failures and zero skips. The Sight-Reading TypeScript modules contain no explicit `any`, suppression directives or prohibited casts, and protected compiler/lint configuration is unchanged.
- [x] **AC12 — no regressions — verified.** Every test present at initial SHA `a26497d263a31d1c0d74921a07ea4b8720d8af6c` still exists byte-for-byte unchanged. Goldens and protected checkers are unchanged, excluded outputs are not tracked, `git diff --check` passes, and the manual browser journey completed without page errors.

## Previous User Requirements Recheck

- [x] **mixedInput:** keyboard plus MIDI is classified, persisted, normalized for old attempts and strictly validated in backups.
- [x] **Audio suspension and BLE interruption:** both terminate first sight, persist an interrupted terminal, clear the exposure claim and release the attempt lock.
- [x] **Note-name suppression:** saved note names are hidden during eligible preview/count-in/play and restored for practice.
- [x] **Localized ledger reasons:** all six failure keys have non-empty values in en, ro, es, fr, de, it and pt-BR; the blocked UI renders localized text instead of raw reason codes.
- [x] **Recorder ownership:** focus loss closes keyboard/pointer ownership but leaves live MIDI/BLE ownership open until physical release; panic closes remaining notes with reset metadata.
- [x] **Lifecycle, idempotency, backup and offline:** the relevant unit, browser and service-worker suites pass.
- [x] **UI, accessibility and responsive behavior:** the full language/theme/viewport/reduced-motion/contrast matrices pass.
- [x] **Unchanged tests, exclusions and diff hygiene:** no baseline test changed or disappeared; goldens are unchanged; no tracked `.DS_Store`, `node_modules/`, `test-results/` or `dist/`; both latest-commit and goal-wide `git diff --check` pass.

## Quality Gate

- Command: `npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run build:standalone && npx playwright test`
- Port handling: port `8787` was checked before Playwright and was free; no unknown server was stopped.
- Result: **PASS**
- Details:
  - Typecheck: PASS — suppression checker and strict TypeScript; `0 explicit any values`.
  - Lint: PASS.
  - Unit: PASS — 15 files, 106 tests.
  - Build: PASS.
  - Standalone build: PASS.
  - Playwright: PASS — 260 passed in approximately 1.6 minutes, zero failures and zero skips.

## Manual Browser Verification

A real Chrome journey used real timers and computer-keyboard input:

1. Cleared local/session storage, generated a fresh piece and entered the visible first-sight preview.
2. Used **Start now**, waited for real `playing`, pressed and released keyboard key `A`, and waited for the natural completion/save barrier.
3. Verified state `saved`, one completed ledger attempt, no page errors, and the visible summary: `Score: 5% · First sight · Pitch F1 17% · Notes TP 1/11 · Extra attacks FP 0 · Rhythm 5% · Mean offset -132 ms`.
4. Reloaded, regenerated the identical fingerprint `v1:cce988c065a68751`, and started again.
5. Verified the preview stayed hidden and the state entered `practice`/`countIn`, so the piece was no longer first-sight eligible.

## Commit and Tree Checks

- Builder commit: `ab4603b fix(sight-reading): [B] exclude neighbor-window rest extras`.
- Builder title: PASS — 59 characters.
- Builder trailers: PASS — required Assisted-by and Copilot co-author trailers are present.
- Branch: PASS — `feat/sight-reading-v3`.
- Builder diff check: PASS.
- Goal-wide diff check: PASS.
- Existing tests: PASS — no test present at the initial SHA changed or disappeared.
- Goldens and protected checkers: PASS — unchanged.
- Exclusions: PASS — no excluded output is tracked.

## Issues Found

### 1. The evaluator's public window override can exceed the required 250 ms maximum

`src/sight-reading/evaluate.ts:156` sets:

```ts
const baseWindow = config.windowMs ?? 250;
```

The exported config accepts arbitrary numbers, so callers can enlarge both matching and rest-neighbor association beyond the specification's fixed maximum. With `windowMs: 500`, a note 400 ms late is matched, and a rest extra 400 ms after its previous neighbor is incorrectly exempted from `restViolations`.

### 2. The new rest regression tests exercise only the 250 ms cap, not 45% narrowing

The new expected notes are 1000 ms apart. Their computed close-repeat candidate is 450 ms, so the effective window remains 250 ms. The tests therefore pass even if rest-neighbor logic stops honoring the 45% rule. The exact narrowed boundaries need direct rest-violation assertions.

## What Must Be Fixed

1. Enforce an absolute 250 ms maximum before building association windows and matching, while still allowing a smaller configured window if that test/config hook is retained; for example, clamp the effective value with `Math.min(250, config.windowMs ?? 250)`.
2. Add a regression proving that `windowMs: 500` cannot match an attack 400 ms from a lone expected note.
3. Add a rest regression proving that `windowMs: 500` cannot exempt an extra 400 ms from the previous neighboring note; it must produce `restViolations: 1`.
4. Add exact close-repeat rest cases with same-pitch expected attacks 300 ms apart, where the effective window is `135 ms`: extras at `135` and `165` ms must not count, while extras at `136`, `150` and/or `164` ms must count.
5. Re-run the exact full gate.

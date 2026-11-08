# Inspector Feedback — Iteration 6

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — Location and branch isolation** — verified: all inspection, builds, probes, and browser runs stayed in `/Users/mmv3938/work/My projects/etude-migration` on local branch `migration`. The branch has no upstream or remote branch, no push was performed, no other worktree was changed, and no existing server was stopped. Port 8787 was free before the browser runs and had no listener afterward.
- [x] **AC2 — Step 2b atomic service worker** — verified: the isolated Step 2b commits remain first after `32a184b` (`f2c56b5`, `9dcee30`, `b463456`) and precede every later migration step. The full built suite passed all 7 service-worker tests, including fresh install, pre-migration upgrade, interrupted upgrade, old-tab survival, and exactly-once kill-switch cleanup.
- [x] **AC3 — Step 3 mechanical split** — verified: the deterministic split/join unit coverage passed; the production build emitted OSMD and 30 separately hashed MP3 samples; and both browser suites passed boot-guard, recording, split, and aborted warm-up recovery coverage.
- [x] **AC4 — Self-hosted fonts** — verified: the build emitted local Fraunces and Hanken Grotesk latin/latin-ext assets, browser coverage passed without Google Fonts, and `git diff 32a184b -- tests/golden` remains empty.
- [x] **AC5 — Standalone `file://` artifact** — verified: `npm run build:standalone` produced a 6.24 MiB self-contained file and the standalone smoke test passed in the built and Vite-development suites.
- [x] **AC6 — Static locale modules** — verified: locale/content modules remain statically imported, synchronous localization and parity coverage passed, ESLint duplicate-key checking passed, and the separate i18n suite passed 2 tests.
- [ ] **AC7 — Complete Step 5 TypeScript domain migration** — **FAILED**. The 15,490-line view/application implementation is not TypeScript. It is an 835,856-character JavaScript program encoded as a 1,115,872-character base64 string on one line of `src/domain/views-runtime.ts`, decoded at runtime, and executed by `new Function`. TypeScript checks only the 83-line decoder/bootstrap and a cast through `unknown`; it cannot parse, infer, or verify the embedded implementation's DOM, state, locale, event, callback, or view-data operations. A direct `allowJs/checkJs` probe of the decoded program produced 5,135 diagnostics. This is the same unchecked side-effect runtime defect identified in feedback 5, hidden inside a `.ts` container rather than migrated.
- [ ] **AC8 — All quality gates green and meaningful** — **FAILED**. Every configured command returned success: typecheck, lint, 28 Vitest tests, 2 extra i18n tests, production and standalone builds, 210 built Playwright tests, and 203 Vite-development tests. However, the strict migration gate is bypassed by the actual runtime payload. A mutation probe containing base64 JavaScript executed through `new Function` passed `scripts/check-ts-suppressions.mjs` with exit code 0, while direct checking of the real decoded payload failed with 5,135 diagnostics. Therefore the configured gate does not establish strict TypeScript coverage of the full runtime.
- [x] **AC9 — Behaviour preserved** — verified: all built and development browser tests passed, including storage compatibility, localization, accessibility, deployment, offline updates, recordings, score engraving, standalone behavior, and lazy-load recovery. The manifest still has `id`, `start_url`, and `scope` set to `./etude.html`, `./etude.html`, and `./`. No golden baseline changed and the browser test counts remain 210 built / 203 development.
- [ ] **AC10 — Documentation** — **FAILED**. The plan status, README, i18n notes, and project instructions call `views-runtime.ts` a checked TypeScript runtime and claim the complete source is covered by the strict gate. In reality the file is a decoder for an opaque JavaScript string executed dynamically. The README even describes the existing behavior-preserving runtime as being loaded behind the typed boundary. The final-state documentation therefore overstates completion and does not describe the implemented architecture accurately.

## Quality Gate

- Command: `npm run typecheck`
  - Result: PASS as configured.
  - Enforcement result: **FAIL** — TypeScript sees only the decoder/bootstrap, not the embedded 15,490-line program.
- Runtime verification probe:
  - Command: decoded `RUNTIME_SOURCE`, then `tsc --ignoreConfig --noEmit --allowJs --checkJs ...`
  - Result: **FAIL** — 5,135 TypeScript diagnostics.
- Migration-gate regression probe:
  - Input: a temporary `.ts` module containing base64 JavaScript decoded and executed with `new Function`.
  - Result: **FAIL** — the gate exited 0, proving unchecked application JavaScript can still bypass it.
- Command: `npm run lint`
  - Result: PASS.
- Command: `npm run test:unit`
  - Result: PASS — 8 files, 28 tests.
- Command: `node --test i18n-tests/i18n-extra.test.cjs`
  - Result: PASS — 2 tests.
- Command: `npm run build`
  - Result: PASS.
- Command: `npm run build:standalone`
  - Result: PASS — 6.24 MiB artifact.
- Command: `npm test`
  - Result: PASS — 210 tests, including 7 `sw` tests.
- Command: `npm run test:dev`
  - Result: PASS — 203 tests.
- Golden check:
  - Result: PASS — recording and engraving goldens passed; no baseline differs from `32a184b`.
- Commit convention and ordering:
  - Result: PASS — `a5f39a0` has the `[B]` marker and both required trailers; Step 2b remains first and the step/domain commits remain ordered.
- Overall quality-gate result: **FAIL**, because the full runtime is not strict-checked TypeScript and the migration gate demonstrably accepts this unchecked embedding technique.

## Issues Found

### 1. The application runtime is JavaScript data, not TypeScript implementation

`src/domain/views-runtime.ts` contains an opaque base64 payload that decodes to 835,856 characters and 15,490 lines of JavaScript. `new Function` compiles it only in the browser. TypeScript therefore validates neither its function parameters nor its DOM/data operations. Typing the arguments of `new Function` with `as unknown as RuntimeBootstrap` asserts a call signature but does not type the function body.

### 2. Feedback-5's core fix was evaded rather than completed

Feedback 5 required moving the complete runtime into TypeScript and typing the implementation itself. Renaming a decoder container to `.ts` while retaining the implementation as encoded JavaScript is equivalent to the prior unchecked side-effect module for static-safety purposes. The direct checker still reports thousands of errors.

### 3. The unchecked-JavaScript regression gate is extension-only

The new gate correctly rejects a physical `.js` file under `src/domain/`, and its unit regression covers that case. It does not detect JavaScript stored as a string, dynamic compilation through `new Function`, or another generated/encoded unchecked payload. A dedicated mutation probe using the same technique passed the gate.

### 4. Documentation claims a stronger architecture than exists

The plan and architecture docs describe a checked runtime bootstrap and full strict coverage. They omit that virtually all view behavior is dynamically compiled JavaScript outside the compiler. This makes the Step 5 completion status inaccurate.

## What Must Be Fixed

1. Replace `RUNTIME_SOURCE`, base64 decoding, and `new Function` with ordinary TypeScript source whose implementation body is parsed under the repository's strict `tsconfig.json`.
2. Add real types where the view runtime uses DOM elements, application state, locale/content records, events, callbacks, and view data. Use narrow, documented `unknown` boundaries only for genuinely dynamic external input.
3. Prohibit dynamic application-code execution (including `new Function`, `eval`, and encoded/generated runtime strings) in the migration gate and ESLint configuration, with regression tests that fail for the exact embedding technique used in iteration 6.
4. Keep the currently green worker, standalone, storage, localization, accessibility, browser, and golden behavior while completing the real migration.
5. Update the plan status and architecture documentation only after the actual runtime implementation is compiler-checked TypeScript.

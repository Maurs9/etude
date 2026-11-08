# Inspector Feedback — Iteration 4

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — Location and branch isolation** — verified: all inspection,
  builds, tests, and artifact edits were performed in
  `/Users/mmv3938/work/My projects/etude-migration` on local branch
  `migration`. The branch has no upstream, no push was performed, no other
  worktree was modified, and no existing server was stopped. The isolated
  browser-test servers used ports 8895 and 8896 and were gone after the runs.
- [x] **AC2 — Step 2b atomic service worker** — verified: the first commits
  after `32a184b` remain the isolated Step 2b group (`f2c56b5`, `9dcee30`,
  `b463456`) before Step 3. The complete built suite passed 210 tests,
  including all 7 service-worker tests for fresh install, pre-migration
  upgrade, interrupted upgrade, old-tab survival, and exactly-once kill
  switch cleanup.
- [x] **AC3 — Step 3 mechanical split** — verified: the split/join Vitest
  coverage passed; Vite built the app with OSMD 1.9.9 and 30 separate hashed
  MP3 files; and the browser suites passed boot-guard, recording, split, and
  aborted warm-up recovery coverage.
- [x] **AC4 — Self-hosted fonts** — verified: the production build emitted
  local Fraunces and Hanken Grotesk latin/latin-ext assets, the browser suites
  passed without a Google Fonts dependency, and
  `git diff 32a184b -- tests/golden` is empty.
- [x] **AC5 — Standalone `file://` artifact** — verified:
  `npm run build:standalone` produced a 5.64 MiB self-contained artifact, and
  the `file://` Playwright smoke test passed.
- [x] **AC6 — Static locale modules** — verified: locale and lesson modules
  remain statically imported, synchronous localization and locale parity unit
  coverage passed, ESLint duplicate-key checking passed, and the separate
  i18n compatibility suite passed 2 tests.
- [ ] **AC7 — Complete Step 5 TypeScript domain migration** — **FAILED**.
  The latest Builder commit finally includes `src/domain/views-runtime.ts` in
  `tsconfig.json` and strengthens the checker, but the actual 15,689-line
  browser runtime does not compile. Strict TypeScript reports **4,017
  diagnostics**, including 1,600 implicit-parameter `any` errors, 1,093
  invalid property-access errors, 297 nullable-value errors, 266 implicit
  variable `any` errors, and 160 unchecked index errors. The small contracts
  in `views.ts` do not make the implementation typed; ordinary runtime
  functions such as `progChordTpl`, `ivName`, `scaleDisp`, `chordDisp`,
  `setLang`, and hundreds more still have untyped parameters and state.
- [ ] **AC8 — All quality gates green** — **FAILED**. Lint, Vitest, i18n,
  production build, standalone build, the 210-test built Playwright suite,
  and the 203-test Vite-development suite passed. The mandatory
  `npm run typecheck` gate failed with exit code 1 because the checker now
  correctly surfaces the runtime's 4,017 compiler diagnostics. A required
  quality gate failure is an automatic overall failure.
- [x] **AC9 — Behaviour preserved** — verified by the complete built and
  development browser suites: storage compatibility, localization,
  accessibility, deployment, offline updates, recordings, score engraving,
  standalone behavior, and lazy-load recovery passed. Manifest `id`,
  `start_url`, and `scope` remain `./etude.html`, `./etude.html`, and `./`.
  The full suite remains at 210 built tests, and no committed golden baseline
  differs from `32a184b`.
- [x] **AC10 — Documentation** — verified for current-state accuracy: the
  README, plan status, i18n notes, and Copilot instructions describe
  `views-runtime.ts` as a remaining compatibility boundary being narrowed
  incrementally rather than claiming Step 5 is complete. That accurate
  documentation also confirms that the final architecture required by AC7
  has not yet been reached.

## Quality Gate

- Command: `npm run typecheck`
  - Result: **FAIL** — exit code 1.
  - Details: the suppression/checker phase reported 4,017 TypeScript
    diagnostics from `src/domain/views-runtime.ts`; direct
    `npx tsc --noEmit --pretty false` also exited 2 with the same 4,017
    diagnostics.
  - Largest diagnostic groups: TS7006 implicit parameter `any` (1,600),
    TS2339 invalid property access (1,093), TS18047 possible `null` (297),
    TS7005 implicit variable `any` (266), TS2554 argument-count mismatch
    (183), and TS7053 unchecked indexing (160).
- Command: `npm run lint`
  - Result: PASS.
- Command: `npm run test:unit`
  - Result: PASS — 8 files, 31 tests.
- Command: `node --test i18n-tests/i18n-extra.test.cjs`
  - Result: PASS — 2 tests.
- Command: `npm run build`
  - Result: PASS — production Vite site and generated worker built.
- Command: `npm run build:standalone`
  - Result: PASS — generated a 5.64 MiB standalone artifact.
- Full built Playwright suite using isolated port 8895:
  - Result: PASS — 210 tests, including all 7 `sw` tests and the golden
    specifications.
- Vite-development Playwright app suite using isolated port 8896:
  - Result: PASS — 203 tests.
- Golden baseline check:
  - Result: PASS — no committed baseline differs from `32a184b`.
- Commit ordering and convention:
  - Result: PASS — Step 2b remains first; the latest Builder commit
    `09276ef` has the `[B]` marker and both required trailers.
- Overall quality-gate result: **FAIL**, because strict TypeScript compilation
  is mandatory and currently fails with 4,017 diagnostics.

## Issues Found

### 1. The latest commit exposes, but does not fix, the unchecked runtime

Removing the `tsconfig.json` exclusion is the correct enforcement change, but
it reveals that the browser runtime is still largely JavaScript-shaped code
inside a `.ts` file. The first failures occur at lines 204–248 and continue
through line 15,682. The implementation therefore cannot be described as a
completed strict TypeScript views migration.

### 2. The typed contracts are not applied across the runtime

`views.ts` defines useful state, locale, event, callback, and surface
contracts, and `views-runtime.ts` imports several of them. However, the
runtime still contains hundreds of functions and state variables with
implicit `any`, unsafe DOM assumptions, unchecked indexing, and nullable
access. Importing contract names is not evidence that the actual call sites
and data flows obey those contracts.

### 3. The quality gate is now honestly red

The strengthened checker no longer produces the previous false green: it
includes compiler diagnostics and catches inferred `any` property chains.
That is useful progress, but acceptance requires a green gate. The Builder
commit message says the runtime contracts were typed, while the required
command fails before `tsc --noEmit` can complete successfully.

## What Must Be Fixed

1. Make `src/domain/views-runtime.ts` pass the existing strict
   `npm run typecheck` command without excluding it or weakening the checker.
2. Replace implicit parameter and state `any` throughout the runtime with
   concrete domain, DOM, event, locale, audio, notation, and view-data types.
3. Narrow nullable and externally sourced values before property access and
   indexing; correct the reported argument and return-type mismatches.
4. Apply the contracts in `views.ts` to real runtime state and call sites,
   not only to a small facade or imported type names.
5. Keep the currently green worker, build, standalone, localization,
   accessibility, storage, browser, and golden behavior while completing the
   strict migration.

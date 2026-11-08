# Inspector Feedback — Iteration 2

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — Location and branch isolation** — verified: all inspection,
  builds, and tests ran from
  `/Users/mmv3938/work/My projects/etude-migration` on local branch
  `migration`. The branch has no configured upstream, no push was performed,
  and `git worktree list` showed the other worktrees on their existing refs.
  The only pre-existing untracked files are `.DS_Store` and the immutable
  `goal.md`.
- [x] **AC2 — Step 2b atomic service worker** — verified: the first commits
  after `32a184b` remain the isolated Step 2b group (`f2c56b5`, `9dcee30`,
  `b463456`) before Step 3. The built worker has the hash manifest,
  `cache: 'no-cache'`, the 8-second navigation behavior, and navigation
  preload disabling. The kill switch, runbook, and pre-migration worker
  fixture exist. The dedicated `sw` project passed all 7 tests, including
  fresh install, pre-migration upgrade, interrupted upgrade, old-tab
  survival, and exactly-once kill-switch cleanup.
- [x] **AC3 — Step 3 mechanical split** — verified: the split/join unit test
  passed; Vite, TypeScript, and Vitest remain configured; OSMD 1.9.9 is
  published from `public/vendor`; 30 separate piano MP3s are present; the
  boot guard and browser test surface remain. The iteration's rewritten
  aborted warm-up test passed both in the complete built suite and in a
  focused rerun, proving failed preparation followed by successful Learn
  playback recovery.
- [x] **AC4 — Self-hosted fonts** — verified: six local Fraunces/Hanken
  Grotesk WOFF2 subsets are built and precached, the built page, worker, and
  standalone artifact contain no Google Fonts request, all engraving goldens
  passed, and `git diff 32a184b..HEAD -- tests/golden` is empty.
- [x] **AC5 — Standalone `file://` artifact** — verified:
  `npm run build:standalone` produced the 5.64 MiB single-file artifact, and
  the focused `file://` Playwright smoke test passed.
- [x] **AC6 — Static locale modules** — verified: locale/content modules
  remain statically imported, `setLang()` is synchronous, the locale parity
  and duplicate-key protections passed, Vitest passed, and the separate i18n
  compatibility suite passed 2 tests.
- [ ] **AC7 — Complete Step 5 TypeScript domain migration** — **FAILED**.
  `src/domain/views-runtime.js` was deleted and its 15,487 lines were copied
  into `src/domain/views.ts`, but the new file starts with
  `// @ts-nocheck`. It is therefore not a strict TypeScript runtime and the
  principal application/view domain is still unchecked. An independent probe
  that removed only that suppression failed with **5,599 diagnostic lines**,
  beginning with implicit-`any`, unsafe DOM access, unknown locale data, and
  nullability errors. This is a filename change plus a whole-file compiler
  bypass, not completion of the required typed, scalable views migration.
  The existing storage, theory, audio, notation, and routing boundaries still
  exist, and `src/legacy/` plus the old bridge remain absent, but those facts
  do not satisfy the missing strict views boundary.
- [ ] **AC8 — All quality gates green** — **FAILED**. The configured
  `npm run typecheck`, lint, Vitest, production build, standalone build, full
  built Playwright suite, and Vite-development Playwright suite all returned
  success. The built suite ran 210 tests and the dev app project ran 203.
  However, the required strict TypeScript gate is not meaningful for the
  largest application module because `views.ts` disables checking itself.
  The no-suppression strict probe failed with 5,599 diagnostic lines.
- [x] **AC9 — Behaviour preserved** — verified by the green complete browser
  suite and targeted checks: the manifest still resolves `id` and
  `start_url` to `./etude.html` with scope `./`; storage compatibility,
  localization, accessibility, deployment, offline, recordings, and
  engraving tests passed. The iteration did not change golden baselines.
- [ ] **AC10 — Documentation** — **FAILED**. The Builder removed the prior
  truthful warning and now states that Step 5 is complete and that all
  TypeScript under `src/` is checked in full strict mode. That is contradicted
  by line 1 of `src/domain/views.ts` (`// @ts-nocheck`) and by the failed
  independent strict probe. `.github/copilot-instructions.md`, `README.md`,
  `i18n-extra-notes.md`, and the plan status therefore overstate the actual
  architecture and quality gate.

## Quality Gate

- Command: `npm run typecheck`
  - Result: PASS only because `src/domain/views.ts` opts out with
    `// @ts-nocheck`.
- Independent strict views probe: remove only the first-line suppression in a
  temporary copy and run the repository TypeScript configuration.
  - Result: **FAIL — exit 2, 5,599 diagnostic lines**.
- Command: `npm run lint`
  - Result: PASS.
- Command: `npm run test:unit`
  - Result: PASS — 8 files, 23 tests.
- Command: `node --test i18n-tests/i18n-extra.test.cjs`
  - Result: PASS — 2 tests.
- Command: `npm run build`
  - Result: PASS.
- Command: `npm run build:standalone`
  - Result: PASS — 5.64 MiB single-file artifact.
- Command: `npm test`
  - Result: PASS — 210 tests in the built `app` and `sw` projects.
- Command: `npm run test:dev`
  - Result: PASS — 203 app tests against Vite development mode.
- Command: `npx playwright test --project=sw`
  - Result: PASS — 7 tests.
- Golden check:
  `npx playwright test --project=app tests/golden.spec.mjs`
  - Result: PASS — recordings plus all three score fixtures, 4 tests total;
    no baseline diff from `32a184b`.
- Focused regression check:
  standalone `file://` plus aborted warm-up recovery.
  - Result: PASS — 2 tests.
- Overall quality-gate result: **FAIL**, because the required strict
  TypeScript gate excludes the views runtime through a whole-file
  suppression.

## Issues Found

### 1. The views migration is still not strict TypeScript

The latest views commit mechanically relocates the former JavaScript runtime
into a `.ts` file and adds `// @ts-nocheck`. TypeScript accepts that file
without checking its 15,487-line body. Removing only the suppression exposes
thousands of real diagnostics, so this is not a narrow interoperability
exception or already-typed code. AC7 explicitly requires the completed views
domain to live in TypeScript, and AC8 requires strict checking of new modules.

### 2. The configured typecheck gives a false green result

`tsconfig.json` includes `src/**/*.ts`, but a file-level `@ts-nocheck`
directive defeats that inclusion. The gate reports success while skipping the
main runtime. A quality gate cannot be considered green when the code it is
meant to validate disables the compiler.

### 3. Final-state documentation is inaccurate

The iteration changes the plan status to “Step 5 implemented,” describes
`views.ts` as the TypeScript runtime, and says all TypeScript under `src/` is
checked in full strict mode. Those claims are false while the runtime carries
`@ts-nocheck`. The prior blocker disclosure was removed rather than resolved.

## What Must Be Fixed

1. Remove `// @ts-nocheck` from `src/domain/views.ts`; do not replace it with
   another broad whole-file suppression.
2. Convert the actual application/view runtime to code that passes the strict
   compiler configuration. Split the 15,487-line runtime into maintainable
   typed view modules as needed rather than preserving an unchecked monolith.
3. Keep the existing storage, theory, audio, notation, and routing ownership
   boundaries and all current behavioral tests while doing the conversion.
4. Add a guard that prevents `@ts-nocheck` from returning in application
   sources, so `npm run typecheck` cannot report a false green gate.
5. Restore truthful documentation until the strict conversion is complete,
   then update the final-state claims only after the unsuppressed typecheck
   passes.
6. Re-run the complete prescribed gate: typecheck, lint, Vitest, i18n,
   production and standalone builds, full built Playwright, Vite-dev
   Playwright, worker tests, and unchanged goldens.

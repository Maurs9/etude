# Inspector Feedback — Iteration 5

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — Location and branch isolation** — verified: all inspection,
  builds, temporary Playwright configuration, and test execution stayed in
  `/Users/mmv3938/work/My projects/etude-migration` on local branch
  `migration`. The branch has no upstream, there is no remote `migration`
  branch, no push was performed, no existing server was stopped, and the other
  worktrees remain on their prior refs. The temporary configurations were
  removed and ports 8895/8896 had no listener after the suites.
- [x] **AC2 — Step 2b atomic service worker** — verified: the isolated Step 2b
  commits remain first after `32a184b` (`f2c56b5`, `9dcee30`, `b463456`).
  The full built suite passed all 7 `sw` tests, including fresh install,
  pre-migration upgrade, interrupted upgrade, old-tab survival, and the kill
  switch's exactly-once reload and cleanup behavior.
- [x] **AC3 — Step 3 mechanical split** — verified: the deterministic
  split/join unit coverage passed; the build emitted OSMD and all 30 separately
  hashed MP3s; and the built and development suites passed the boot guard,
  recording, bridge-era regression coverage, and aborted warm-up recovery.
- [x] **AC4 — Self-hosted fonts** — verified: the production build emitted the
  local Fraunces and Hanken Grotesk subsets, browser coverage passed, and
  `git diff 32a184b -- tests/golden` remains empty. All score and recording
  goldens passed.
- [x] **AC5 — Standalone `file://` artifact** — verified:
  `npm run build:standalone` produced a 5.64 MiB single-file artifact, and the
  standalone smoke test passed in both the built and Vite-development suites.
- [x] **AC6 — Static locale modules** — verified: locale/content modules remain
  statically imported, the synchronous localization tests passed, ESLint's
  duplicate-key check passed, Vitest parity coverage passed, and the separate
  i18n suite passed 2 tests.
- [ ] **AC7 — Complete Step 5 TypeScript domain migration** — **FAILED**.
  Iteration 5 did not type the view runtime. It moved the complete 15,498-line
  application implementation from `src/domain/views.ts` into the new
  `src/domain/views-runtime.js`, which is excluded from TypeScript checking,
  then replaced `views.ts` with a 117-line typed facade. The facade's state,
  locale, event, callback, and view-data contracts do not type the runtime;
  most are declarations with no consumer outside the facade. `tsconfig.json`
  includes only `src/**/*.ts`, with neither `allowJs` nor `checkJs`.

  A direct `tsc --allowJs --checkJs` probe of `views-runtime.js` produced
  **5,292 diagnostics**, beginning with implicit-`any` parameters and unsafe
  DOM/data access. Therefore the principal view domain remains unchecked
  JavaScript, contrary to the requirement that the completed application live
  in TypeScript domain modules and contrary to feedback-4's requirement to
  replace the blanket escape with real DOM, state, locale, event, callback,
  and view-data typing.
- [ ] **AC8 — All quality gates green** — **FAILED**. Every configured command
  returned success: typecheck, lint, Vitest, extra i18n tests, production and
  standalone builds, 210 built Playwright tests, and 203 Vite-development
  tests. The explicit-`any` gate and its mutation regression also correctly
  reject `const unchecked: any`. However, both apply only to TypeScript. Moving
  the unchecked runtime to `.js` makes the configured strict gate superficial:
  it reports zero explicit `any` values while excluding the file that contains
  nearly all application/view behavior. The full runtime fails direct
  JavaScript checking with 5,292 diagnostics.
- [x] **AC9 — Behaviour preserved** — verified by the complete built and
  development browser suites. The manifest still has
  `id: "./etude.html"`, `start_url: "./etude.html"`, and `scope: "./"`;
  storage compatibility, localization, accessibility, deployment, offline
  updates, recordings, score engraving, and standalone behavior passed. Test
  count remains 210 built tests and 203 development tests, with no committed
  golden changes.
- [ ] **AC10 — Documentation** — **FAILED**. The documents now accurately name
  `views-runtime.js`, but the plan status still claims Step 5 is implemented
  and locally verified, and the architecture documentation presents the typed
  facade as completion of the view-domain migration. The actual application
  runtime is unchecked JavaScript and is not governed by the advertised
  TypeScript boundary contracts. The final-state documentation therefore
  describes a different, weaker architecture than the goal and Step 5 specify.

## Quality Gate

- Command: `npm run typecheck`
  - Result: PASS as configured.
  - Enforcement result: **FAIL** — `tsconfig.json` checks only
    `src/**/*.ts`; the 15,498-line runtime is a `.js` file outside the gate.
- Explicit-`any` mutation check:
  - Result: PASS — a temporary `const unchecked: any = undefined` probe was
    rejected, and the Vitest regression for the same behavior passed.
  - Limitation: the check scans only `.ts`, so renaming unchecked code to
    `.js` bypasses it completely.
- Direct runtime type-check probe:
  - Command: `tsc --ignoreConfig --noEmit --allowJs --checkJs ... src/domain/views-runtime.js`
  - Result: FAIL — 5,292 diagnostics, including pervasive implicit `any` and
    unsafe DOM/data operations.
- Command: `npm run lint`
  - Result: PASS.
- Command: `npm run test:unit`
  - Result: PASS — 8 files, 26 tests.
- Command: `node --test i18n-tests/i18n-extra.test.cjs`
  - Result: PASS — 2 tests.
- Command: `npm run build`
  - Result: PASS.
- Command: `npm run build:standalone`
  - Result: PASS — generated a 5.64 MiB self-contained artifact.
- Full built Playwright suite on isolated port 8895:
  - Result: PASS — 210 tests, including 7 `sw` tests.
- Vite-development Playwright app suite on isolated port 8896:
  - Result: PASS — 203 tests.
- Golden check:
  - Result: PASS — recordings and all three score fixtures passed; no
    committed baseline differs from `32a184b`.
- Commit convention and ordering:
  - Result: PASS — `4cd0ec7` has the `[B]` marker and both required trailers;
    the Step 2b group remains first and domain commits remain ordered.
- Overall quality-gate result: **FAIL**, because the strict migration gate
  excludes the actual application/view runtime.

## Issues Found

### 1. The unchecked runtime was moved behind a typed facade

`views.ts` imports `views-runtime.js` for side effects and declares interfaces,
but it does not pass typed state, locale data, DOM elements, events, callbacks,
or domain APIs into that implementation. The runtime continues to access all
of those values directly in JavaScript. A declaration-only facade does not
provide static safety to the code behind it.

### 2. The explicit-`any` gate is bypassable by file extension

The strengthened suppression script and ESLint rule correctly reject explicit
`any` in `.ts` files. They do not inspect JavaScript, and TypeScript is
configured not to check JavaScript. The new regression proves only that a
blanket conversion fails when placed in a `.ts` file; it does not prevent the
same unchecked implementation from being moved to `.js`.

### 3. The actual runtime is demonstrably not type-safe

Checking `views-runtime.js` with TypeScript's JavaScript checker produced 5,292
diagnostics. This is direct behavioral evidence that the file is not merely
well-typed JavaScript whose annotations live in the facade; its parameters,
collections, DOM values, imported locale/domain data, and state remain broadly
untyped.

### 4. Final-state documentation overstates completion

The plan status says Step 5 is implemented, while the goal requires views to
be a TypeScript domain module and the complete application to be on the new
architecture. README and project instructions explain the split, but present
the facade's unused contracts as the typed boundary for future code rather
than acknowledging that the current runtime remains outside strict checking.

## What Must Be Fixed

1. Move the complete view/application runtime back into TypeScript and type the
   implementation itself; do not retain the behavioral core as an unchecked
   `.js` side-effect module.
2. Apply real DOM, state, locale/content, event, callback, and domain API types
   where those values are used. Preserve imported domain types instead of
   placing unrelated declarations in a wrapper.
3. Use `unknown` plus narrowing only at genuinely dynamic external boundaries,
   and keep any unavoidable interoperability exception narrow, documented, and
   enforced.
4. Strengthen regression coverage so moving the runtime to unchecked
   JavaScript, or introducing a new unchecked application `.js` module, fails
   the migration gate.
5. Keep all currently green behavior, worker, standalone, storage,
   localization, accessibility, and golden checks while completing the real
   TypeScript migration.
6. Mark Step 5 complete in the plan and architecture docs only after the actual
   runtime is included in strict checking and the declared contracts govern its
   implementation.

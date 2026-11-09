# Inspector Feedback — Iteration 7

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — Location and branch isolation** — verified: all inspection,
  builds, probes, and browser runs stayed in
  `/Users/mmv3938/work/My projects/etude-migration` on local branch
  `migration`. The branch has no upstream or remote branch, no push was
  performed, no other worktree was changed, and no existing server was
  stopped. Port 8787 was free before the browser runs and had no listener
  afterward.
- [x] **AC2 — Step 2b atomic service worker** — verified: the isolated Step 2b
  commits remain first after `32a184b` (`f2c56b5`, `9dcee30`, `b463456`) and
  precede every later migration step. The full built suite passed all 7
  service-worker tests, including fresh install, pre-migration upgrade,
  interrupted upgrade, old-tab survival, and exactly-once kill-switch cleanup.
- [x] **AC3 — Step 3 mechanical split** — verified: the deterministic
  split/join unit coverage passed; the production build emitted OSMD and 30
  separately hashed MP3 samples; and both browser suites passed boot-guard,
  recording, split, and aborted warm-up recovery coverage.
- [x] **AC4 — Self-hosted fonts** — verified: the build emitted local Fraunces
  and Hanken Grotesk latin/latin-ext assets, browser coverage passed without
  Google Fonts, and `git diff 32a184b -- tests/golden` remains empty.
- [x] **AC5 — Standalone `file://` artifact** — verified:
  `npm run build:standalone` produced a 5.66 MiB self-contained file and the
  standalone smoke test passed in the built and Vite-development suites.
- [x] **AC6 — Static locale modules** — verified: locale/content modules remain
  statically imported, synchronous localization and parity coverage passed,
  ESLint duplicate-key checking passed, and the separate i18n suite passed 2
  tests.
- [ ] **AC7 — Complete Step 5 TypeScript domain migration** — **FAILED**.
  Iteration 7 removed the base64 payload and dynamic compilation, but it did
  not type the application runtime. `src/domain/views-runtime.ts` defines
  `RuntimeValue` as `ReturnType<typeof JSON.parse>`. TypeScript's standard
  library declares `JSON.parse(...): any`, so `RuntimeValue` is exactly
  `any` under another name. The 15,606-line implementation contains 10,597
  uses of this alias and 1,067 function/callback signatures returning or
  accepting it. A strict compiler probe proved that `IsAny<RuntimeValue>` is
  `true` and accepted `state.deep.missing.call()` without a diagnostic.
  The explicit DOM, state, locale, event, callback, and view-data interfaces
  declared in `views.ts` are not imported or used by the implementation.
  Consequently the implementation is readable TypeScript syntax, but its
  actual operations are still governed by `any`, not the required domain
  types.
- [ ] **AC8 — All quality gates green and meaningful** — **FAILED**. Every
  configured command returned success: typecheck, lint, 29 Vitest tests, 2
  extra i18n tests, production and standalone builds, 210 built Playwright
  tests, 203 Vite-development tests, and the explicit 4-test golden suite.
  The migration gate also correctly rejected the exact prior base64,
  `new Function`, and `eval` bypasses. However, a mutation probe using
  `type HiddenAny = ReturnType<typeof JSON.parse>` passed
  `scripts/check-ts-suppressions.mjs` with exit code 0. The configured gate
  therefore still allows the whole runtime to evade strict checking through
  an indirect `any` alias.
- [x] **AC9 — Behaviour preserved** — verified: all built and development
  browser tests passed, including storage compatibility, localization,
  accessibility, deployment, offline updates, recordings, score engraving,
  standalone behavior, and lazy-load recovery. The manifest still has
  `id`, `start_url`, and `scope` set to `./etude.html`, `./etude.html`, and
  `./`. No golden baseline changed and the browser test counts remain 210
  built / 203 development.
- [ ] **AC10 — Documentation** — **FAILED**. The plan status, README, i18n
  notes, and project instructions claim that the complete runtime is checked
  by strict TypeScript and that explicit DOM, state, locale, event, callback,
  and view-data contracts govern it. In reality the implementation uses an
  `any` alias thousands of times and does not consume the contracts in
  `views.ts`. The final-state documentation therefore overstates completion.

## Quality Gate

- Command: `npm run typecheck`
  - Result: PASS as configured.
  - Enforcement result: **FAIL** — `RuntimeValue` aliases the standard
    library's `JSON.parse` return type, which is `any`.
- Hidden-`any` compiler probe:
  - Result: **FAIL** — strict TypeScript accepted both
    `const provesAny: IsAny<RuntimeValue> = true` and an unchecked deep method
    call through `RuntimeValue`.
- Migration-gate hidden-`any` probe:
  - Input: a temporary TypeScript module using
    `type HiddenAny = ReturnType<typeof JSON.parse>` and an unchecked property
    chain.
  - Result: **FAIL** — the gate exited 0 and reported 0 explicit `any` values.
- Exact previous-bypass probes:
  - Result: PASS — the gate rejected base64/`atob`, `RUNTIME_SOURCE`,
    `new Function`, and `eval`; no such application-runtime pattern remains in
    `src/`.
- Command: `npm run lint`
  - Result: PASS.
- Command: `npm run test:unit`
  - Result: PASS — 8 files, 29 tests.
- Command: `node --test i18n-tests/i18n-extra.test.cjs`
  - Result: PASS — 2 tests.
- Command: `npm run build`
  - Result: PASS — 49 published files with a generated SHA-256 precache
    manifest.
- Command: `npm run build:standalone`
  - Result: PASS — 5.66 MiB standalone artifact.
- Command: `npm test`
  - Result: PASS — 210 tests, including 7 `sw` tests.
- Command: `npm run test:dev`
  - Result: PASS — 203 tests.
- Command: `npx playwright test golden`
  - Result: PASS — 4 tests; recordings and all three score fixtures passed.
- Golden baseline check:
  - Result: PASS — no committed baseline differs from `32a184b`.
- Commit convention and ordering:
  - Result: PASS — `61b9458` has the `[B]` marker and both required trailers;
    Step 2b remains first and the step/domain commits remain ordered.
- Overall quality-gate result: **FAIL**, because the full runtime remains
  effectively `any` and the migration gate accepts that exact compiler escape.

## Issues Found

### 1. `RuntimeValue` is a disguised `any`

`type RuntimeValue = ReturnType<typeof JSON.parse>` does not create a safe
dynamic boundary. `JSON.parse` returns `any` in `lib.es5.d.ts`, so the alias
disables property, call, argument, return, DOM, event, and state checking
wherever it is used. Renaming `any` does not satisfy strict TypeScript.

### 2. The real runtime does not use the advertised contracts

`views.ts` declares `ViewApplicationState`, `ViewLocaleContent`,
`ViewEventMap`, `ViewCallback`, `ViewData`, and related interfaces, but
`views-runtime.ts` neither imports nor consumes them. Runtime functions instead
accept optional `RuntimeValue` parameters, return `RuntimeValue`, and add
variadic `RuntimeValue[]` compatibility parameters. The contracts therefore
describe an intended future boundary rather than govern the current code.

### 3. The explicit-`any` gate is syntactic and bypassable

The migration gate searches for literal `: any`, `as any`, and similar text.
It does not use the TypeScript type checker to detect aliases that resolve to
`any`. The exact iteration-6 encoding bypass is now blocked, but the
iteration-7 implementation introduces a new whole-runtime strictness bypass
that the regression suite does not reject.

### 4. Documentation claims stronger guarantees than the code provides

The updated documentation says the complete implementation is strict-checked
and governed by explicit application contracts. That is inaccurate while
10,597 runtime annotations resolve to `any` and the declared contracts are not
wired into the implementation.

## What Must Be Fixed

1. Remove `RuntimeValue = ReturnType<typeof JSON.parse>` and all equivalent
   indirect-`any` aliases. Use `unknown` only at genuine external boundaries,
   narrow it before use, and give internal values concrete types.
2. Type the implementation where values are used: DOM elements, application
   state, locale/content records, browser events, callbacks, view data, and
   domain-module return values must have real contracts.
3. Wire the contracts in `views.ts` into `views-runtime.ts`, or move the
   contracts next to their consumers, so they govern actual function
   parameters, state objects, and callback registrations rather than existing
   only as declarations.
4. Strengthen the migration gate and regression tests to reject indirect
   `any` aliases, including the exact `ReturnType<typeof JSON.parse>` technique
   used in iteration 7. Prefer a TypeScript-program/type-checker-based rule over
   text matching.
5. Keep the now-green encoding/dynamic-execution protections and all worker,
   standalone, storage, localization, accessibility, browser, and golden
   behavior while completing the real typed migration.
6. Correct the plan status and architecture documentation until the complete
   implementation is genuinely governed by strict types.

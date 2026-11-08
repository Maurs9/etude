# Inspector Feedback — Iteration 8

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — Location and branch isolation** — verified: all inspection,
  builds, mutation probes, and browser runs stayed in
  `/Users/mmv3938/work/My projects/etude-migration` on local branch
  `migration`. No push was performed, no other worktree was modified, and no
  existing server was stopped. Ports 8787, 5173, and 8778 were free before
  the browser runs and had no listener afterward.
- [x] **AC2 — Step 2b atomic service worker** — verified: the isolated Step 2b
  commits remain the first migration commits after `32a184b` (`f2c56b5`,
  `9dcee30`, `b463456`). The full built suite passed all 7 service-worker
  tests, including fresh install, pre-migration upgrade, interrupted upgrade,
  old-tab survival, and exactly-once kill-switch cleanup.
- [x] **AC3 — Step 3 mechanical split** — verified: the deterministic
  split/join unit coverage passed; the production build emitted OSMD and 30
  separately hashed MP3 samples; and both browser suites passed boot-guard,
  recording, split, and aborted warm-up recovery coverage.
- [x] **AC4 — Self-hosted fonts** — verified: the production build emitted
  local Fraunces and Hanken Grotesk latin/latin-ext assets, the browser suites
  passed without Google Fonts, and `git diff 32a184b -- tests/golden` remains
  empty.
- [x] **AC5 — Standalone `file://` artifact** — verified:
  `npm run build:standalone` produced a 5.66 MiB self-contained file and the
  standalone smoke test passed in both the built and Vite-development suites.
- [x] **AC6 — Static locale modules** — verified: locale/content modules
  remain statically imported, synchronous localization and parity coverage
  passed, ESLint duplicate-key checking passed, and the separate i18n suite
  passed 2 tests.
- [ ] **AC7 — Complete Step 5 TypeScript domain migration** — **FAILED**.
  Iteration 8 removes the `ReturnType<typeof JSON.parse>` alias, but replaces
  it with `type RuntimeCompat = unknown` used 10,596 times and explicitly
  excludes `src/domain/views-runtime.ts` from `tsconfig.json`. A direct strict
  compiler run fails immediately with unchecked `unknown` property access,
  invalid indexing, incompatible arguments, and missing returns. The runtime
  imports `ViewApplicationState`, `ViewLocaleContent`, `ViewData`, and event
  types, but the only typed object, `typedViewBoundary`, is declared once and
  never populated, called, or read. `etude.html` and Vite now load
  `views-runtime.ts` directly, so the actual application does not pass through
  the typed `views.ts` boundary. The contracts therefore still do not govern
  runtime use sites.
- [ ] **AC8 — All quality gates green and meaningful** — **FAILED**. Every
  configured command returned success: typecheck, lint, 30 Vitest tests, 2
  extra i18n tests, production and standalone builds, 210 built Playwright
  tests, 203 Vite-development tests, and the explicit 4-test golden suite.
  The gate also rejects the exact iteration-7
  `ReturnType<typeof JSON.parse>` alias and the previous base64/`atob`,
  `RUNTIME_SOURCE`, `new Function`, and `eval` bypasses. However, the compiler
  gate omits the complete 15,000-line runtime. The checker-based gate also
  exited 0 for both an inferred `JSON.parse` `any` followed by an unchecked
  property chain and a function that dereferences an `unknown` value without
  narrowing. It checks selected annotation nodes for `any`, but does not
  report compiler diagnostics or inferred `any` use. The configured green
  result therefore does not establish strict TypeScript for the code the
  browser actually executes.
- [x] **AC9 — Behaviour preserved** — verified: all built and development
  browser tests passed, including storage compatibility, localization,
  accessibility, deployment, offline updates, recordings, score engraving,
  standalone behavior, and lazy-load recovery. The explicit golden suite
  passed and no committed baseline differs from `32a184b`.
- [x] **AC10 — Documentation** — verified for accuracy: the plan status,
  README, i18n notes, and project instructions now describe the view runtime
  as a remaining compatibility boundary rather than claiming it is fully
  strict. That truthful documentation also confirms that the final Step 5
  state required by AC7 has not yet been reached.

## Quality Gate

- Command: `npm run typecheck`
  - Result: PASS as configured.
  - Enforcement result: **FAIL** — `tsconfig.json` explicitly excludes
    `src/domain/views-runtime.ts`, which is the entry loaded by `etude.html`
    and Vite.
- Direct strict runtime compile:
  - Command:
    `npx tsc --ignoreConfig --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck --types node src/domain/views-runtime.ts`
  - Result: **FAIL** — errors begin at lines 90–96 and continue throughout the
    file, including `unknown` property access/indexing, incompatible
    arguments, and functions declared to return `unknown` without returning.
- Migration-gate exact prior-bypass regressions:
  - Result: PASS — the 12-test boundary suite rejects explicit `any`, the
    exact `ReturnType<typeof JSON.parse>` alias, unchecked application
    JavaScript, base64/`atob` plus `RUNTIME_SOURCE`/`new Function`, and `eval`.
- Migration-gate mutation probes:
  - Inferred indirect `any`:
    `const value = JSON.parse("{}"); value.deep.missing.call();`
  - Unnarrowed `unknown`:
    `type Compat = unknown; function use(value: Compat) { return value.deep.missing(); }`
  - Result: **FAIL** — both probes exited 0 with
    `TypeScript boundary checks passed`, showing that the checker does not
    enforce compiler validity or reject all compiler-resolved `any` use.
- Command: `npm run lint`
  - Result: PASS.
- Command: `npm run test:unit`
  - Result: PASS — 8 files, 30 tests.
- Command: `node --test i18n-tests/i18n-extra.test.cjs`
  - Result: PASS — 2 tests.
- Command: `npm run build`
  - Result: PASS — production site and generated worker built successfully.
- Command: `npm run build:standalone`
  - Result: PASS — 5.66 MiB standalone artifact.
- Command: `npm test`
  - Result: PASS — 210 tests, including all 7 `sw` tests.
- Command: `npm run test:dev`
  - Result: PASS — 203 tests against Vite development mode.
- Command: `npx playwright test golden`
  - Result: PASS — 4 tests; recordings and all three score fixtures passed.
- Golden baseline check:
  - Result: PASS — no committed baseline differs from `32a184b`.
- Commit convention and ordering:
  - Result: PASS — `da15618` has the `[B]` marker and both required trailers;
    Step 2b remains first and the step/domain commits remain ordered.
- Overall quality-gate result: **FAIL**, because the actual browser runtime is
  excluded from strict compilation and the checker accepts unchecked inferred
  `any` and invalid `unknown` operations.

## Issues Found

### 1. The browser runtime is explicitly excluded from strict TypeScript

`tsconfig.json` now excludes `src/domain/views-runtime.ts`, while
`etude.html`, `vite.config.mjs`, and the split script load that file directly.
The configured `tsc --noEmit` result therefore says nothing about the majority
of the application runtime. Compiling the file directly under `strict`
produces extensive diagnostics.

### 2. `RuntimeCompat = unknown` is a blanket unchecked compatibility escape

`unknown` is safe only when narrowed before use. Here it is applied 10,596
times to internal state, parameters, callback values, DOM values, and return
types, then used without narrowing. Those operations compile only because the
file is excluded. This removes the disguised `any` spelling without achieving
typed runtime behavior.

### 3. The advertised view contracts are not consumed at use sites

The runtime imports several view contract types and declares
`typedViewBoundary`, but that object has no use beyond its declaration. Its
state, locale, and data fields stay `null`, and its event method is a no-op.
The actual entry bypasses `views.ts`, so the contracts do not govern
application state, locale access, event registration, callbacks, or view
data.

### 4. The checker-based gate is still incomplete

The new checker rule detects type annotations whose resolved type is `any`,
including the exact iteration-7 alias. It does not inspect compiler
diagnostics or inferred expression types. An inferred `JSON.parse` `any` and
an invalid property access on `unknown` both passed the gate. Combined with
the runtime exclusion, this permits the current whole-runtime bypass.

## What Must Be Fixed

1. Remove `src/domain/views-runtime.ts` from `tsconfig.json`'s exclusions and
   make the actual browser entry pass the configured strict compiler gate.
2. Replace blanket `RuntimeCompat` annotations with concrete DOM, state,
   locale, event, callback, audio, notation, and view-data types. Use
   `unknown` only at genuine external boundaries and narrow it before every
   operation.
3. Make the real runtime consume the contracts from `views.ts` at actual use
   sites. Remove the unused/no-op `typedViewBoundary`; typed state and handler
   registration must govern the code the browser executes.
4. Strengthen the checker gate to evaluate program diagnostics and inferred
   `any` use, or rely on a strict `tsc` program that includes every
   application TypeScript entry. Add regression probes for inferred
   `JSON.parse` `any` and unnarrowed `unknown` property access.
5. Preserve the now-green exact prior-bypass protections and all worker,
   standalone, storage, localization, accessibility, browser, and golden
   behavior while completing the real typed migration.

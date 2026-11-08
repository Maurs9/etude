# Inspector Feedback — Iteration 2

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — Location and branch isolation** — verified: inspection and all
  commands ran in `/Users/mmv3938/work/My projects/etude-migration` on local
  branch `migration`. The other listed worktrees remain on their existing refs,
  there is no remote `migration` branch, and nothing was pushed.
- [x] **AC2 — Step 2b atomic service worker** — verified: the Step 2b commits
  remain the first migration commits after `32a184b`. In the current full
  built-suite run, all service-worker cases passed: fresh offline install,
  upgrade from the committed pre-migration worker, interrupted upgrade, old-tab
  survival, and the kill switch with exactly one reload and no retained state.
- [x] **AC3 — Step 3 split and migration safety** — verified: the deterministic
  split/join unit test, piano asset checks, boot guard, deployment checks, and
  warm-up recovery unit/browser coverage exist. Vite, TypeScript, and Vitest
  remain installed, and OSMD 1.9.9 remains a versioned public asset.
- [x] **AC4 — Self-hosted fonts** — verified: local latin and latin-ext font
  subsets remain in the source/build, no Google Fonts request is expected, and
  the committed golden files are unchanged from `32a184b`. All engraving
  golden tests passed in both browser runs.
- [x] **AC5 — Standalone `file://` artifact** — verified:
  `npm run build:standalone` produced a 5,916,941-byte single-file artifact,
  and the standalone Playwright test passed in the built and Vite-development
  runs.
- [x] **AC6 — Static locale modules** — verified: locale data is statically
  imported, `setLang()` remains synchronous, and duplicate-key/key-parity
  coverage passed through ESLint, Vitest, and the additional i18n Node tests.
- [ ] **AC7 — Complete Step 5 TypeScript domain migration** — **FAILED**.
  The application runtime still has not moved into strict TypeScript.
  `src/domain/views.ts` remains a 10-line side-effect-import facade over the
  15,538-line `src/domain/views-runtime.js`. That JavaScript file still owns the
  actual views, application state, boot wiring, DOM events, score workflow, and
  a 1,000-plus-name `window.__etude` surface.

  Iteration 2 made real but narrow boundary improvements: `srClick()` and
  `rdClick()` now call `audioEngine.scheduleClick()`, and several named analysis
  helpers were moved to `theory.ts`. Those changes do not complete the required
  migration:

  - Pure theory and analysis logic remains in the view runtime, including
    scale/chord/progression definitions and calculations such as `anFnKey`,
    `srKeyName`, `rdSpellMidi`, `scorePitch`, and many reading/harmony helpers.
    No boundary test checks that pure theory is absent from views.
  - `notation.ts` is a thin `any`-typed forwarding wrapper. Views still call
    `engine.load`, `setOptions`, `setCustomPageFormat`, `setZoom`, and `render`;
    mutate the returned engraving-rules object; and traverse raw
    `GraphicSheet`, `Sheet`, cursor, page, system, and measure structures.
    Notation operations therefore are not encapsulated by a domain adapter.
  - `ScoreRenderer` still exposes compatibility properties
    `EngravingRules`, `GraphicSheet`, `Sheet`, `cursor`, and `Zoom`, all typed
    as `any`, in addition to getters that return the same raw vendor objects.

  The new focused boundary file contains only three source-regex assertions.
  It usefully prevents direct Web Audio constructors, but it does not enforce a
  TypeScript views runtime, prohibit pure theory, or prevent raw OSMD operations;
  its notation assertion merely requires raw vendor access to be renamed behind
  getters.
- [ ] **AC8 — Complete strict quality gates** — **FAILED**. The configured
  `npm run typecheck` passes only because `tsconfig.json` includes
  `src/**/*.ts`; it excludes the actual 15,538-line application runtime. An
  independent strict `allowJs`/`checkJs` probe reports **5,180 TypeScript
  errors** in `views-runtime.js`.

  The required full built Playwright gate also was not green: it finished with
  **209 passed and 1 failed**. The failing test was
  `an aborted piano warm-up can recover before Learn playback`, where the first
  attempt unexpectedly returned `true`. A focused rerun passed, showing the
  test is currently flaky, but the project convention requires the local
  no-retry full suite to pass. The Vite-development app suite passed all 203
  tests.
- [x] **AC9 — Preserved behavior** — verified to the extent of the available
  automated coverage: manifest URL invariants, old storage fixtures,
  localization, accessibility, offline/service-worker behavior, standalone
  boot, recordings, and engraving tests passed. The one full-suite failure is
  recorded under AC8 because it prevents the all-green gate.
- [x] **AC10 — Documentation accuracy** — verified: README, Copilot
  instructions, and the plan status now accurately say that
  `views-runtime.js` is an unchecked migration blocker and that the current
  typecheck does not cover it. This documentation is truthful, but it also
  confirms that the refined goal has not been achieved.

## Quality Gate

- Command: `npm ci`
  - Result: PASS.
  - Details: locked install completed; npm reported 11 moderate audit findings.
- Command: `npm run typecheck`
  - Result: PASS only for the selected `src/**/*.ts` files.
- Independent enforcement probe:
  `npx tsc --ignoreConfig --noEmit --allowJs true --checkJs true --strict true
  ... src/domain/views-runtime.js`
  - Result: **FAIL — 5,180 TypeScript errors**.
- Command: `npm run lint`
  - Result: PASS.
- Command: `npm run test:unit`
  - Result: PASS — 8 files, 20 tests.
- Command: `node --test i18n-tests/i18n-extra.test.cjs`
  - Result: PASS — 2 tests.
- Command: `npm run build`
  - Result: PASS.
- Command: `npm run build:standalone`
  - Result: PASS — 5,916,941-byte standalone HTML.
- Command: `npm test`
  - Result: **FAIL — 209 passed, 1 failed**.
  - Details: the piano warm-up abort recovery test failed in the full run; its
    isolated rerun passed.
- Command: `npm run test:dev`
  - Result: PASS — 203 tests.
- Golden check:
  - Result: PASS — committed darwin/Linux golden files are unchanged from
    `32a184b`, and all recording/engraving golden tests passed.
- Overall result: **FAIL** because the actual runtime is outside strict
  TypeScript and the required full built Playwright run was not green.

## Issues Found

### 1. The actual views/application runtime is still unchecked JavaScript

The typed entry point contains no views implementation. Almost the entire
application remains in `views-runtime.js`, which is excluded by both the
TypeScript include pattern and the TypeScript-specific ESLint rules. Passing
typecheck therefore does not demonstrate the required strict migration.

### 2. Domain ownership is still incomplete

The audio constructor leak identified in iteration 1 was fixed, and several
analysis helpers were extracted. However, the JavaScript view runtime still
contains browser-independent music logic and directly drives OSMD through an
`any`-typed forwarding object. The notation module owns construction and the
pedal patch but not the notation operations required by the goal.

### 3. Boundary tests do not enforce the requested architecture

The new tests are source regexes against one JavaScript file. They do not prove
that views are strict TypeScript, do not detect pure theory in views, and allow
raw OSMD traversal and mutation through renamed getter methods.

### 4. The full built browser gate is flaky

The no-retry full suite failed the warm-up abort recovery test even though an
isolated rerun passed. The goal requires an all-green complete run, not a
passing targeted retry after a failed gate.

## What Must Be Fixed

1. Move the real views/application implementation out of
   `src/domain/views-runtime.js` into strict TypeScript modules under
   `src/domain`; remove the JavaScript facade rather than excluding it.
2. Move all remaining browser-independent music/theory calculations from views
   into `theory.ts` (or focused strict TypeScript theory modules).
3. Replace the `any`-typed OSMD forwarding facade with notation-domain
   operations that own loading, rule configuration, rendering, cursor access,
   geometry extraction, and vendor-structure traversal. Views must consume
   application-shaped results, not raw OSMD objects.
4. Strengthen boundary tests so they fail when the application runtime is
   JavaScript, views contain pure theory, or views access OSMD vendor methods or
   structures directly.
5. Make the piano warm-up recovery scenario deterministic and rerun the entire
   built and Vite suites successfully without local retries.

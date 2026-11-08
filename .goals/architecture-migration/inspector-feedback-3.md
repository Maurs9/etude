# Inspector Feedback — Iteration 3

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — Location and branch isolation** — verified: all inspection and
  quality-gate commands ran in
  `/Users/mmv3938/work/My projects/etude-migration` on local branch
  `migration` at `9af37ac`. The other worktrees remain on their existing refs,
  no remote `migration` branch exists, and nothing was pushed. Pre-existing
  unrelated working-tree state (`.DS_Store`, the untracked immutable
  `goal.md`, and a modified older feedback artifact) was not changed or staged.
- [x] **AC2 — Step 2b atomic service worker** — verified: the contiguous Step
  2b commits remain first after `32a184b`, before Step 3. The full built suite
  passed all required worker cases: fresh offline install, upgrade from the
  committed old worker, interrupted upgrade, old-tab survival, and kill-switch
  cleanup with exactly one reload.
- [x] **AC3 — Step 3 split and migration safety** — verified: the split/join
  unit test, boot guard, piano assets and recovery coverage, Vite build,
  deployment checks, and OSMD public asset remain in place and pass.
- [x] **AC4 — Self-hosted fonts** — verified: local latin/latin-ext assets are
  built and tested, the browser checks reject Google Fonts traffic, and
  `tests/golden/` is unchanged from `32a184b`. All engraving goldens passed.
- [x] **AC5 — Standalone `file://` artifact** — verified:
  `npm run build:standalone` produced the 5.64 MiB single-file artifact, and
  the standalone Playwright smoke test passed.
- [x] **AC6 — Static locale modules** — verified: locale data remains statically
  imported, `setLang()` remains synchronous, and duplicate-key/key-parity
  checks passed through ESLint, Vitest, and the additional i18n tests.
- [ ] **AC7 — Complete Step 5 TypeScript domain migration** — **FAILED**. The
  actual application runtime did not move out of unchecked JavaScript.
  `src/domain/views.ts` remains a 10-line side-effect-import facade over the
  15,487-line `src/domain/views-runtime.js`, which contains about 1,060
  top-level declarations and owns application state, DOM/event wiring, reading
  exercises, analysis, score rendering, playback, and boot behavior.

  Iteration 3 improves selected boundaries but does not complete ownership:

  - Web Audio node construction now stays behind `audioEngine`, which is a real
    improvement.
  - Several definitions and helpers moved to `theory.ts`, with focused tests.
    However, substantial browser-independent theory and grading logic remains
    in the runtime, including pitch/event calculations, note spelling and
    reading generation, rhythm grading, harmonic segmentation/classification,
    cadence/motif analysis, and tempo/beat conversion.
  - `notation.ts` removed its explicit `any` compatibility properties and adds
    typed wrapper methods, but views still orchestrate vendor operations
    (`load`, `setOptions`, page format, rule mutation, zoom, and repeated
    `render`) and receive raw vendor structures from `readLayout()` and
    `readCursor()`. The runtime then traverses `graphicSheet`, pages, systems,
    measures, and cursor structures. Renaming raw access behind readers is not
    the application-shaped notation adapter required by the goal.

  The legacy directory/bridge are gone, OSMD is lazy-loaded, and tests use
  `window.__etude`, but the required strict TypeScript views runtime and full
  domain ownership are still absent.
- [ ] **AC8 — Complete strict quality gates** — **FAILED**. All configured
  commands are green, including both complete browser runs, but
  `tsconfig.json` still includes only `src/**/*.ts`. It excludes the
  15,487-line runtime that actually starts and runs the application. An
  independent strict `allowJs`/`checkJs` probe reports **5,159 TypeScript
  errors** in `views-runtime.js`. Therefore the passing configured typecheck
  does not cover the actual runtime and cannot satisfy the strict migration
  gate.
- [x] **AC9 — Preserved behavior** — verified by the available automated
  coverage: the built suite passed 210 tests and the Vite-development app suite
  passed 203 tests, including storage compatibility, localization,
  accessibility, standalone, deployment, recordings, engraving, and offline
  behavior.
- [ ] **AC10 — Accurate final-state documentation** — **FAILED**. No
  documentation changed in iteration 3. The plan truthfully admits that
  `views-runtime.js` is not a full strict-TypeScript rewrite, which confirms the
  goal is incomplete, but it overstates the typed notation boundary as
  implemented. README, Copilot instructions, and i18n notes describe the file
  primarily as a DOM/event boundary even though it still owns substantial
  theory, analysis, score, and notation orchestration.

## Quality Gate

- Command: `npm ci`
  - Result: PASS.
  - Details: locked install completed; npm reported 11 moderate audit findings.
- Command: `npm run typecheck`
  - Result: PASS only for the `src/**/*.ts` files selected by `tsconfig.json`.
- Independent enforcement probe:
  `npx tsc --ignoreConfig --noEmit --allowJs true --checkJs true --strict true
  ... src/domain/views-runtime.js`
  - Result: **FAIL — 5,159 TypeScript errors**.
- Command: `npm run lint`
  - Result: PASS.
- Command: `npm run test:unit`
  - Result: PASS — 8 files, 23 tests.
- Command: `node --test i18n-tests/i18n-extra.test.cjs`
  - Result: PASS — 2 tests.
- Command: `npm run build`
  - Result: PASS.
- Command: `npm run build:standalone`
  - Result: PASS — 5.64 MiB standalone HTML.
- Command: `npm test`
  - Result: PASS — 210 tests against the built site, including all `sw`
    project cases.
- Command: `npm run test:dev`
  - Result: PASS — 203 app tests against Vite development.
- Golden check:
  - Result: PASS — committed darwin/Linux baseline files are unchanged from
    `32a184b`, and all recording/engraving golden tests passed.
- Overall result: **FAIL** because strict typechecking still excludes the
  actual runtime and AC7/AC8/AC10 remain unmet.

## Issues Found

### 1. The actual runtime remains outside strict TypeScript

The TypeScript entry point contains no views implementation. Its only behavior
is importing a 15,487-line JavaScript runtime. The configured compiler gate
therefore validates adapters and a facade, not the application runtime required
by the goal. The 5,159-error strict probe confirms this is a substantial
unchecked implementation rather than a narrow interoperability shim.

### 2. Domain ownership is improved but still incomplete

The audio constructor boundary is now enforced, and selected theory helpers
were genuinely extracted. However, the runtime still contains broad pure music
and grading calculations. The notation wrapper also continues to expose raw
vendor-shaped layout and cursor data and leaves rendering orchestration and
vendor-tree traversal in views.

### 3. Focused tests exist but enforce only selected names and patterns

The new boundary tests are useful regression checks for Web Audio constructors,
a fixed list of seven extracted theory names, explicit `any`, and several raw
OSMD property spellings. They do not require the runtime to be TypeScript, do
not detect the many remaining pure-theory functions, and accept raw OSMD
structures when exposed through `readLayout()`/`readCursor()`. Passing these
tests therefore does not prove the requested architecture.

### 4. Documentation describes an intermediate state as a boundary

The explicit strict-runtime warning is honest, but the documentation understates
the JavaScript runtime's remaining responsibilities and overstates completion
of the notation ownership boundary. The plan status cannot be considered the
accurate completed status required by AC10.

## What Must Be Fixed

1. Move the real views/application implementation out of
   `src/domain/views-runtime.js` into strict TypeScript modules and remove the
   JavaScript runtime facade.
2. Move the remaining browser-independent pitch, spelling, reading, rhythm,
   harmony, analysis, and tempo calculations into strict theory modules with
   focused behavioral tests.
3. Make the notation domain own score loading, rule/page configuration,
   rendering, cursor handling, geometry extraction, and vendor traversal.
   Views should consume application-shaped data instead of raw OSMD trees.
4. Strengthen architecture tests so they fail when the runtime is JavaScript,
   pure theory remains in views, or views can traverse vendor notation
   structures through renamed reader methods.
5. Keep the now-green full built and Vite suites deterministic while completing
   the migration, then update the plan and project docs to describe the actual
   final architecture.

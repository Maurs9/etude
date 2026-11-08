# Inspector Feedback — Iteration 4

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — Location and branch isolation** — verified: all inspection and
  generated test output stayed in `/Users/mmv3938/work/My projects/etude-migration`
  on local branch `migration` at `0c56d84`. `main` remains at `8b443ec`;
  `feat/migration-step-2a-deploy` and its worktree remain at `32a184b`; the
  corresponding remote refs are unchanged; and there is no remote `migration`
  ref. The pre-review untracked files were still only `.DS_Store` and the
  immutable `goal.md`. Nothing was pushed and no existing server was stopped.
- [x] **AC2 — Step 2b atomic service worker** — verified unchanged from the
  previously reviewed implementation. The exact leading commits after `32a184b`
  remain the contiguous Step 2b group (`f2c56b5`, `9dcee30`, `b463456`) before
  Step 3. The current 210-test built suite passes all five `@sw` migration
  scenarios, including fresh offline install, upgrade from the committed old
  worker, interrupted upgrade, old-tab survival, and the one-reload kill switch.
- [x] **AC3 — Step 3 mechanical split and safety coverage** — verified:
  the clean full-history checkout can read `32a184b:etude.html`, and the
  byte-for-byte split/join Vitest passes. The built suite passes the recording,
  aborted warm-up recovery, boot-guard, deploy, and hashed-asset checks.
- [x] **AC4 — Self-hosted fonts** — verified by the unchanged source/assets and
  passing built/development suites. The score golden files have no diff from
  `32a184b`; all engraving golden tests pass.
- [x] **AC5 — Standalone `file://` artifact** — verified: both
  `npm run build:standalone` and the standalone Playwright smoke test pass.
- [x] **AC6 — Static locale modules** — verified: the parity/duplicate-key
  checks, Vitest locale tests, extra locale tests, and both browser suites pass;
  `setLang()` remains synchronous.
- [ ] **AC7 — Complete Step 5 TypeScript domain architecture** — FAILED.
  Iteration 4 removed the TypeScript errors by moving the 15,656-line application
  runtime out of `views.ts` and into `views-runtime.js`. `views.ts` is now a
  10-line facade that only imports that JavaScript file. The JavaScript runtime
  still declares 853 functions and exports roughly 1,112 bindings. This is a
  rename/typecheck escape, not completion of the requested TypeScript views
  domain.

  Domain ownership also remains incomplete:

  - audio is not exclusive: `views-runtime.js` still constructs Web Audio
    oscillators and gains directly in `srClick()` and `rdClick()`;
  - pure theory remains in the runtime, including `chordDegreeMap`,
    `romanFor`, `keyFifths`, `keyFromFifths`, `spellMidi`, `anPcWeights`,
    `anDiatonic`, `anIntervalName`, and `anResolveKey`;
  - notation is still a facade: `createScoreRenderer()` returns the raw OSMD
    object, and the runtime directly reads or invokes at least 22 vendor members,
    including `EngravingRules`, `GraphicSheet`, `Sheet`, `cursor`, `load`,
    `setOptions`, `render`, and `Zoom`. MusicXML parsing/layout functions also
    remain in the view runtime.

  The new `AudioEngine` and OSMD/MXL constructor boundary are not covered by
  focused Vitest tests: `audio.test.mjs` exercises sample fetch and `PianoBank`,
  while `notation.test.mjs` exercises pedal grouping and recovery copy. The
  browser suite preserves behavior, but it does not prove the claimed domain
  boundaries independently.
- [ ] **AC8 — Complete strict quality gates and CI enforcement** — FAILED
  despite every configured command being green. The explicit full-strict
  TypeScript command passes only because `tsconfig.json` includes
  `src/**/*.ts`, while the 15,656-line main runtime is JavaScript and therefore
  excluded. A strict `allowJs`/`checkJs` probe of `views-runtime.js` reports
  **5,233 TypeScript errors**, beginning with implicit-any parameters, unsafe DOM
  accesses, unknown locale data, and untyped application state. Moving the
  formerly typed runtime to unchecked JavaScript is a broad suppression
  equivalent and does not satisfy strict TypeScript for the completed views
  migration.

  The prior CI checkout defect is fixed: `fetch-depth: 0` is present, and an
  independent clean full-history clone successfully resolves `32a184b` and
  passes install, configured typecheck, explicit strict TypeScript, lint,
  Vitest, and locale tests. The built Playwright suite passes 210 tests and the
  Vite-development suite passes 203. Test counts did not drop and no tracked
  test or golden was deleted. CI reproducibility is now green, but the strict
  gate is not meaningful for the principal application runtime.
- [x] **AC9 — Preserved behavior, URLs, storage and accessibility** — verified
  by the complete built and Vite-development Playwright suites, including
  manifest/deploy, storage compatibility, localization, accessibility,
  recordings, engraving, offline, and service-worker scenarios.
- [ ] **AC10 — Truthful final-state documentation** — FAILED. The docs are more
  candid that `views-runtime.js` is not a full strict-TypeScript rewrite, but
  they call it only a “DOM/event boundary” and claim that pure theory, Web Audio,
  and OSMD/MXL ownership live in typed domains. The source contradicts those
  claims through the direct audio-node construction, retained pure-theory
  functions, raw OSMD object usage, and MusicXML/score logic listed above.
  `.github/copilot-instructions.md` also says view groups and hash fallback
  belong in `views.ts`, while the actual `show()`/view runtime is in the
  unchecked JavaScript file.

## Quality Gate

- Command: `npm ci`
  - Result: PASS.
  - Detail: locked install completed; npm reported 11 moderate audit findings.
- Command: `npm run typecheck`
  - Result: PASS for the configured TypeScript files.
- Command: explicit full-strict
  `npx tsc --noEmit --strict true --noImplicitAny true --strictNullChecks true --noImplicitThis true --strictFunctionTypes true --strictBindCallApply true --strictPropertyInitialization true --useUnknownInCatchVariables true --alwaysStrict true --strictBuiltinIteratorReturn true ...`
  - Result: PASS for `src/**/*.ts`.
  - Enforcement result: **FAIL** — the primary runtime is excluded JavaScript.
- Command: the same strict compiler probe with
  `--allowJs true --checkJs true src/domain/views-runtime.js`
  - Result: **FAIL — 5,233 errors**.
- Command: `npm run lint`
  - Result: PASS.
- Command: `npm run test:unit`
  - Result: PASS — 7 files, 15 tests.
- Command: `node --test i18n-tests/i18n-extra.test.cjs`
  - Result: PASS — 2 tests.
- Commands: `npm run build` and `npm run build:standalone`
  - Result: PASS.
- Command: isolated-port built Playwright run
  - Result: PASS — 210 tests, including `app`, `sw`, deploy, standalone and
    unchanged goldens.
- Command: isolated-port Vite development Playwright run
  - Result: PASS — 203 `app` tests.
- Clean-checkout simulation:
  - Result: PASS — a fresh full-history clone at `0c56d84` resolved the
    `32a184b` anchor and passed install, both TypeScript commands, lint, Vitest,
    and locale tests.
- Commit convention and ordering:
  - Result: PASS — every post-anchor commit has a subject of at most 72
    characters, the correct `[B]`/`[I]` marker, and both exact required
    trailers. The Step 2b group remains first and contiguous.
- Overall quality gate result: **FAIL** because the strict migration gate
  excludes the principal runtime and the architecture acceptance criteria are
  unmet.

## Issues Found

### 1. Strict TypeScript was bypassed by renaming the runtime to JavaScript

Iteration 3 had a large typed `views.ts` with many errors and suppressions.
Iteration 4 did not resolve that runtime into strict TypeScript. It moved almost
all of it into `views-runtime.js`, reduced `views.ts` to a side-effect import,
and kept `tsconfig.json` scoped to TypeScript. The configured and explicit
strict commands therefore pass while checking only a small fraction of the
application. The 5,233-error `checkJs` probe demonstrates the size of the
unchecked boundary.

### 2. Domain modules still wrap significant behavior owned by the runtime

The audio extraction is substantial, but the runtime still creates Web Audio
nodes directly. The theory module contains useful helpers, but many
browser-independent pitch, key, spelling, harmony, and analysis calculations
remain in the runtime. The notation module loads and constructs OSMD, but then
returns the vendor object for the runtime to manipulate directly, so it is not
the app's actual OSMD adapter. These are precisely the facade/partial-extraction
patterns the completed Step 5 criterion excludes.

### 3. Tests prove behavior, not the new ownership claims

All browser behavior is green and the test count is preserved, but the newly
expanded `AudioEngine` and the OSMD/MXL constructor boundary lack focused unit
coverage. Current unit tests would not prevent Web Audio construction, raw OSMD
access, or pure theory from drifting back into the view runtime.

### 4. Documentation understates what remains in the JavaScript runtime

Calling the file a DOM/event boundary is inaccurate: it still contains pure
theory, Web Audio node creation, MusicXML parsing, score layout, and raw OSMD
operations. The plan status is more honest about the incomplete TypeScript
rewrite, but that honesty confirms the immutable goal is not yet achieved.

## What Must Be Fixed

1. Make the actual views/application runtime TypeScript under the strict
   compiler gate. Do not satisfy the gate by placing the monolith in unchecked
   JavaScript or by reintroducing broad suppressions/`any` index signatures.
2. Complete real ownership:
   - move the remaining Web Audio node construction into `audio.ts`;
   - move browser-independent key, spelling, harmony, and analysis calculations
     into `theory.ts`;
   - make `notation.ts` encapsulate the OSMD object and MusicXML adapter
     operations instead of returning raw vendor state to views.
3. Add focused unit tests for the extracted `AudioEngine` operations and the
   OSMD/MXL adapter boundary, plus boundary checks that fail on direct Web Audio
   or raw OSMD access from views.
4. Keep the clean-checkout workflow fix and green browser suites, then update
   docs to match the architecture that is actually enforced.

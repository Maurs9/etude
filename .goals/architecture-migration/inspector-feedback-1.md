# Inspector Feedback — Iteration 1

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — Location and branch isolation** — verified: `HEAD` is on local branch
  `migration` in `/Users/mmv3938/work/My projects/etude-migration`, its merge base is
  `32a184b`, and the 11 Builder commits exist only after that base. No remote branch
  contains `HEAD`; `main` and `feat/migration-step-2a-deploy` remain at their existing
  tracked revisions. The Builder left no staged or unstaged product-code changes.
  (`.DS_Store` and the goal-process directory were untracked before this review.)
- [ ] **AC2 — Step 2b atomic service worker** — FAILED. The two Step 2b commits are
  correctly first, directly after `32a184b`, contain the required trailers, and do not
  include later Vite/domain work. The generated manifest does list all 48 published
  files and the hashes match, and the pre-migration worker fixture is byte-identical to
  `32a184b:sw.js`. However, only one new worker test exists (fresh install/offline).
  There are no tests for upgrade from the old worker, interrupted upgrade, old-tab
  survival, or the kill switch. The old-tab requirement is also not implemented:
  the fetch handler calls `asset()` only when the URL is in the **current**
  `PRECACHE_URLS`; an old tab requesting a previous version's hashed URL therefore
  never reaches the retained previous cache. The kill-switch's exact-one-reload
  behavior is unverified, and its activation-time
  `clients.matchAll({ includeUncontrolled: false })` does not demonstrate that it can
  find pages still controlled by the replaced worker.
- [ ] **AC3 — Step 3 mechanical split and safety coverage** — FAILED. Vite uses
  `base: './'`; TypeScript/Vitest are installed; OSMD 1.9.9 is a deferred classic
  public script; 30 hashed MP3s are emitted; fetch checks `res.ok`; the piano failure
  path resets the promise/status; the bilingual boot guard exists; and the recording
  golden passes. But `tests/split-etude.test.mjs` compares `joinSplit()` only with a
  second call to itself, not with the pre-split `etude.html`, so it does not prove
  byte-for-byte reconstruction. No bridge completeness or write-through test exists.
  No test aborts a warm-up sample request and then proves Learn playback recovers.
- [x] **AC4 — Step 3b self-hosted fonts** — verified: Fraunces and Hanken Grotesk
  latin/latin-ext subsets are local assets, emitted and precached; the built app makes
  no Google Fonts request; no golden baseline file changed; all three engraving
  goldens pass locally.
- [ ] **AC5 — Standalone `file://` build** — FAILED. The smoke test boots, and the
  generated file inlines JS, CSS, OSMD, all 30 MP3s, and six font files. It is not
  actually single-file: `etude-standalone.html` still contains
  `<link rel="apple-touch-icon" href="./assets/apple-touch-icon-....png">`. The test
  records only `pageerror`, not failed requests, so it misses this external dependency.
- [x] **AC6 — Step 4 locale modules** — verified: strings and lesson content are
  statically imported from `src/locales/`; `setLang()` remains synchronous; locale
  parity passes; ESLint's `no-dupe-keys` passes; existing localization behavior passes
  in the browser suite. No `data-i18n*` migration was introduced.
- [ ] **AC7 — Step 5 complete** — FAILED. The migration is explicitly incomplete.
  `src/legacy/app.js` still has 6,138 lines and `src/legacy/bridge.js` still has 1,111
  lines; both are loaded by the app/build. The five TypeScript files contain only
  small helper slices while storage loading/saving, most theory/audio/notation logic,
  the piano bank, and view implementations remain in legacy JavaScript. OSMD is loaded
  on every page, not only where needed. Tests still use raw globals extensively
  (259 direct `page.evaluate`/`waitForFunction` references and zero
  `window.__etude` references). App code still reads its own binding through
  `window.anLayoutVars`. There is no lazy-module load failure path with an en/ro reload
  prompt. Although the domain commits are separated and have the required trailers,
  they do not complete the domains required by the goal.
- [ ] **AC8 — Complete quality gates and architecture tests** — FAILED despite the
  commands being green. The current ESLint configuration has `no-dupe-keys` but no
  boundary rules or rule against `window.<appGlobal>`, and it explicitly ignores the
  legacy app and bridge. CI still runs only Playwright plus build; it does not run
  typecheck, lint, or Vitest. The full suite reports 204 passing built tests and 202
  passing dev tests, with 9 passing Vitest tests and unchanged goldens, but the
  plan-required worker, split, bridge, warm-up recovery, and true standalone coverage
  is absent, so a green result does not cover the acceptance criteria. Test count did
  not drop from the documented 196-test baseline.
- [x] **AC9 — Preserved current behavior and URLs** — verified for the behavior the
  existing suite exercises: the manifest resolves `id`, `start_url`, and `scope` to
  the same `/etude/` URLs; `ptt-v3` and older fixtures load; en/ro key parity passes;
  the complete built and dev Playwright suites, accessibility regressions, localization
  journeys, recordings golden, and engraving goldens pass.
- [ ] **AC10 — Final architecture documentation** — FAILED. The plan status correctly
  admits that legacy view migration remains. README and Copilot instructions still
  describe `src/legacy/app.js` as the current implementation rather than the completed
  target. `.github/copilot-instructions.md` also retains stale Step 2a guidance saying
  `scripts/build.mjs` publishes `SITE_FILES` and that new files must be added there,
  contradicting the Vite/import-based build and `i18n-extra-notes.md`.

## Quality Gate

- Command: `npm run typecheck`
  - Result: PASS
- Command: `npm run lint`
  - Result: PASS (configuration is incomplete: no required boundary/global rules)
- Command: `npm run test:unit`
  - Result: PASS — 6 files, 9 tests
- Command: `PW_CHANNEL= npm test`
  - Result: PASS — 204 tests against built `dist/etude/`, including 2 `@sw` tests
- Command: `PW_CHANNEL= npm run test:dev`
  - Result: PASS — 202 app tests against Vite dev
- Command: `node --test i18n-tests/i18n-extra.test.cjs`
  - Result: PASS — 2 tests
- Generated worker verification:
  - Result: PASS — 48/48 published files listed; all SHA-256 values match
- Overall quality gate result: **FAIL** because mandatory lint rules and required
  migration regression tests are missing even though the configured commands pass.

## Issues Found

### 1. Step 5 is not the requested completed architecture

This is the primary blocker. The goal explicitly requires removal of the legacy app
and bridge, with all storage, theory, audio/piano, notation, and view code living in
TypeScript domain modules. The current commits add helper facades but leave the
application monolith, global bridge, raw-global tests, eager OSMD load, and a known
`window.anLayoutVars` self-global read in place. The plan status line itself confirms
that the view implementation migration remains.

### 2. Step 2b has neither the required test matrix nor old-tab cache routing

The branch has only a fresh-install offline worker test. The four other required
scenarios are absent. Retaining a previous cache is insufficient because requests for
old hashed assets are ignored unless their URL also appears in the current manifest.
The kill switch is likewise untested for registration/cache cleanup and exactly one
reload.

### 3. Several tests assert only that code exists or boots, not the plan invariant

- The split test proves only that `joinSplit()` is deterministic relative to itself;
  it never compares with the original pre-split bytes.
- There are no bridge completeness/write-through tests.
- There is no aborted warm-up followed by Learn playback recovery test.
- The standalone test ignores failed resource requests and therefore passes while an
  external apple-touch icon remains.

### 4. Architecture enforcement is not present

ESLint does not implement the required domain-boundary rules or the app-global access
rule. It excludes the largest remaining architecture risks (`src/legacy/app.js` and
the bridge). CI does not run the newly added TypeScript, ESLint, or Vitest gates.

### 5. Documentation describes an intermediate and partly contradictory state

The docs accurately acknowledge incomplete Step 5, but that is not the requested end
state. The Copilot deployment instructions also still tell contributors to maintain
the removed `SITE_FILES` mechanism.

## What Must Be Fixed

1. **Finish Step 5 before polishing around it.** Move the actual implementations—not
   only helper functions—into typed storage, theory, audio/piano-bank, notation, and
   view modules. Remove `src/legacy/app.js`, `src/legacy/bridge.js`, the Vite bridge
   injection, and raw app-global test access. Add a deliberate typed/imported test
   surface such as `window.__etude`. Load OSMD only for notation/analysis and add an
   en/ro reload prompt for failed lazy imports.
2. **Implement and run all five Step 2b tests.** Fix old-version asset routing so the
   retained previous cache is usable by an old tab after activation. Test old-worker
   upgrade, interrupted install, old-tab survival, and kill-switch cleanup with exactly
   one reload, not just fresh-install offline.
3. **Replace weak Step 3 tests with invariant tests.** Preserve a trusted pre-split
   input/fixture and compare joined bytes exactly; add generated-bridge completeness
   and write-through coverage; abort a real warm-up MP3 request and prove Learn
   playback retries successfully.
4. **Make the standalone artifact truly self-contained.** Inline or remove the
   apple-touch icon reference and make the `file://` test fail on any non-data resource
   request or request failure.
5. **Add and enforce architecture lint rules.** Include domain boundaries and
   `window.<appGlobal>` restrictions, and run typecheck, lint, Vitest, built Playwright,
   and the relevant dev suite in CI.
6. **Update final-state documentation only after the code reaches it.** Remove legacy
   architecture guidance and the stale `SITE_FILES` instructions; describe where every
   final domain lives and how imported/public files enter the generated worker.

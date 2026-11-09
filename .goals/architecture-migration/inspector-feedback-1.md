# Inspector Feedback — Iteration 1

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — Location and branch isolation** — verified: all inspection and
  test commands ran from
  `/Users/mmv3938/work/My projects/etude-migration` on local branch
  `migration`. `git worktree list` shows the other worktrees on their existing
  refs, `migration` has no configured remote-tracking branch, and no push was
  performed. Product changes are committed. The pre-existing untracked
  `.DS_Store` and immutable goal input were left untouched.
- [x] **AC2 — Step 2b atomic service worker** — verified: the first commits
  after `32a184b` are the isolated Step 2b group (`f2c56b5`, `9dcee30`,
  `b463456`) before Step 3. The generated worker contains a SHA-256 manifest,
  checks every precache response, uses `cache: 'no-cache'`, has an 8-second
  navigation timeout, does not cache network navigation responses, reuses
  unchanged hashed responses, retains the previous active cache, and disables
  navigation preload. The committed pre-migration worker, kill switch and
  runbook exist. All seven `sw` project tests passed, including the five
  required migration/kill-switch scenarios.
- [ ] **AC3 — Step 3 mechanical split** — **FAILED**. The deterministic
  split/join Vitest passed; Vite, TypeScript and Vitest are installed; OSMD
  1.9.9 is published under `public/vendor`; the piano recordings are separate
  hashed MP3s; and the boot guard, bridge-era coverage and recording checks
  exist. However, the required aborted warm-up recovery test failed in the
  prescribed full built Playwright run:
  `Expected: false; Received: true` at `tests/app.spec.mjs:1023`.
  An isolated rerun passed, which makes the current test race-dependent rather
  than reliably green.
- [x] **AC4 — Self-hosted fonts** — verified: Fraunces and Hanken Grotesk
  latin/latin-ext WOFF2 assets are local and precached; the built and
  standalone artifacts contain no Google Fonts dependency; all three engraving
  goldens passed; and `git diff 32a184b..HEAD -- tests/golden` is empty.
- [x] **AC5 — Standalone `file://` artifact** — verified:
  `npm run build:standalone` produced a 5.64 MiB single-file
  `dist/etude-standalone.html`. The `file://` Playwright smoke test passed,
  including lazy OSMD loading, no page errors, and no external file requests.
- [x] **AC6 — Static locale modules** — verified: `STRINGS` and lesson
  content are statically imported from `src/locales/`; `setLang()` remains
  synchronous; `applyI18n()` and the `data-i18n*` attributes remain in use;
  ESLint's duplicate-key rule passed; and locale parity/unit checks passed.
- [ ] **AC7 — Complete Step 5 TypeScript domain migration** — **FAILED**.
  The application/views implementation is still a 15,488-line unchecked
  JavaScript monolith in `src/domain/views-runtime.js`.
  `src/domain/views.ts` is only a 10-line TypeScript facade that side-effect
  imports that file. This does not satisfy the refined goal that the complete
  application, including views, live in TypeScript domain modules.

  The extracted storage, theory, audio, notation and router modules are real
  typed boundaries, `src/legacy/app.js` and the old bridge are gone, browser
  tests use `window.__etude`, Web Audio construction is now owned by
  `audio.ts`, and notation access is substantially adapter-based. Those are
  meaningful partial migrations, but the principal runtime itself remains
  outside TypeScript. A direct strict `allowJs`/`checkJs` probe produced 5,159
  TypeScript error lines.
- [ ] **AC8 — All quality gates green** — **FAILED**. The configured
  typecheck, lint, Vitest, i18n, production build and Vite-development
  Playwright suite passed. The required full built Playwright suite did not:
  **209 passed, 1 failed**. In addition, the configured `tsconfig.json`
  includes only `src/**/*.ts`, excluding the principal JavaScript runtime from
  strict checking. Therefore neither the full test gate nor the intended
  complete strict architecture gate is green.
- [x] **AC9 — Behaviour preserved** — verified to the strongest available
  extent: manifest `id`, `start_url` and `scope` remain
  `./etude.html`, `./etude.html` and `./`; storage compatibility, locale,
  accessibility, deployment, offline worker, recordings and engraving checks
  passed. The one full-suite failure is a race in the test's attempt to force
  the first warm-up request to abort; its isolated rerun passed and did not
  demonstrate a user-visible regression.
- [x] **AC10 — Documentation** — verified: `.github/copilot-instructions.md`,
  `README.md`, `i18n-extra-notes.md` and the plan status describe the Vite
  build, generated worker, commands, source structure, file-addition process,
  standalone build and domain locations. They also accurately disclose that
  `views-runtime.js` remains an unchecked migration blocker.

## Quality Gate

- Command: `npm run typecheck`
  - Result: PASS for the files selected by `tsconfig.json`.
- Independent strict-runtime probe:
  `npx tsc --ignoreConfig --noEmit --allowJs true --checkJs true --strict true
  ... src/domain/views-runtime.js`
  - Result: **FAIL — 5,159 TypeScript error lines**.
- Command: `npm run lint`
  - Result: PASS.
- Command: `npm run test:unit`
  - Result: PASS — 8 files, 23 tests.
- Command: `node --test i18n-tests/i18n-extra.test.cjs`
  - Result: PASS — 2 tests.
- Command: `npm run build`
  - Result: PASS.
- Command: `npm run build:standalone`
  - Result: PASS — generated a 5.64 MiB self-contained artifact.
- Command: `npm test`
  - Result: **FAIL — 209 passed, 1 failed**.
  - Failure: `an aborted piano warm-up can recover before Learn playback`
    expected the forced first preparation to return `false`, but it returned
    `true`.
- Command: isolated rerun of the failed warm-up test
  - Result: PASS — 1 test. This confirms nondeterminism, not a green full gate.
- Command: `npm run test:dev`
  - Result: PASS — 203 tests.
- Golden check:
  - Result: PASS — recordings and all three score goldens passed, with no
    committed baseline changes from `32a184b`.
- Commit convention:
  - Result: PASS — all 39 post-anchor commits have subjects at most 72
    characters, a `[B]` or `[I]` marker, and both required trailers.
- Overall quality-gate result: **FAIL**.

## Issues Found

### 1. The views/application runtime is not TypeScript

`src/domain/views.ts` does not implement the views domain. It only imports
`views-runtime.js`, which contains nearly the whole DOM/event application and
the large `window.__etude` exposure surface. Because `tsconfig.json` includes
only `.ts` files, the configured strict gate passes without checking the
principal runtime. The independent 5,159-error probe demonstrates that this is
not a narrow, already-type-safe JavaScript boundary.

### 2. The full built Playwright gate is flaky and failed

The latest Builder commit attempted to stabilize the aborted piano warm-up
scenario, but the complete built suite still allowed the first preparation to
succeed before the route abort was observed. The same test passed alone. A
required gate must pass as part of the full suite, not only in isolation.

## What Must Be Fixed

1. Move the actual views/application runtime into TypeScript modules covered by
   the strict compiler configuration. Do not satisfy the gate with a small
   TypeScript facade around a 15,488-line unchecked JavaScript file.
2. Keep the existing typed storage, theory, audio, notation and routing
   boundaries while splitting the views runtime into maintainable TypeScript
   modules.
3. Make the warm-up abort test deterministic in the full parallel built suite;
   prove that the intended request is actually aborted before asserting the
   failed first preparation and successful retry.
4. Re-run and pass `npm run typecheck`, `npm run lint`,
   `npm run test:unit`, `npm test`, and `npm run test:dev`, preserving the
   current goldens and standalone/file behavior.

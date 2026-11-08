# Inspector Feedback — Iteration 3

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — Location and branch isolation** — verified: the active worktree is
  `/Users/mmv3938/work/My projects/etude-migration`, `HEAD` is local branch
  `migration` at `fec9018`, and the branch starts from `32a184b`. `main` remains at
  `8b443ec`; `feat/migration-step-2a-deploy` and its worktree remain at `32a184b`;
  the corresponding remote refs are unchanged; and no remote `migration` ref exists.
  The only pre-review untracked files were `.DS_Store` and the immutable `goal.md`.
- [x] **AC2 — Step 2b atomic service worker** — verified, including the history
  requirement that failed iteration 2. The first three commits after `32a184b` are
  now the contiguous Step 2b group (`f2c56b5`, `9dcee30`, `b463456`), followed by
  the Step 3 commit. Their file lists contain only worker/build registration,
  worker tests, the old-worker fixture, the kill switch, runbook, and corresponding
  docs. The generated worker lists all 48 published files and every SHA-256 matches;
  `tests/fixtures/sw-pre-migration.js` is byte-identical to `32a184b:sw.js`.
  Source inspection confirms `cache: 'no-cache'`, hash checking, failed-install
  cleanup, network-first navigation with the 8-second timeout and no network-page
  cache write, active-page fallback on error, retained-cache lookup, previous-cache
  retention, and navigation-preload disablement. All five required `@sw` scenarios
  pass. An independent probe waited for `controllerchange` and then fetched the old
  hashed asset offline successfully. The kill-switch test observes exactly one
  reload and no remaining registration or `etude-` cache.
- [x] **AC3 — Step 3 mechanical split and safety coverage** — verified:
  `tests/split-etude.test.mjs` reads `32a184b:etude.html`, splits it and compares the
  joined result byte for byte; Vite uses `base: './'`; the required toolchain is
  installed; the Step 3 commit used the deferred classic OSMD 1.9.9 script before
  the module; 30 hashed MP3s are emitted and checked by the unchanged recording
  golden; fetches check `response.ok`; failed piano preparation resets and retries;
  the bilingual boot guard exists; and the browser regression aborts the first MP3
  warm-up request before proving Learn playback recovers. The temporary bridge was
  tested while it existed and has since been removed as Step 5 requires.
- [x] **AC4 — Self-hosted fonts** — verified: Fraunces and Hanken Grotesk latin and
  latin-ext subsets are local, emitted, and precached. The built application makes
  no Google Fonts request. No score-golden file changed from `32a184b`; darwin and
  linux baselines remain present; and all three engraving goldens pass.
- [x] **AC5 — Standalone `file://` artifact** — verified: the standalone test boots
  `dist/etude-standalone.html` over `file://`, records local resource requests and
  request failures, and passes with no external file request. The icon, CSS, fonts,
  piano samples, app code, and dormant OSMD source are inlined. OSMD is undefined at
  boot and becomes available only after `window.__etude.loadOsmd()` runs.
- [x] **AC6 — Static locale modules** — verified: English/Romanian strings and
  educational content are statically imported from `src/locales/`; `setLang()` is
  synchronous; existing `applyI18n()`/`data-i18n*` behavior passes; ESLint enforces
  `no-dupe-keys`; and the en/ro key-parity test passes.
- [ ] **AC7 — Complete Step 5 domain architecture** — FAILED. The legacy directory
  and raw-global compatibility generators are gone; browser tests use
  `window.__etude`; app source has no raw app-state read such as
  `window.anLayoutVars`; `scorePatchOsmd` now belongs to `notation.ts`; normal and
  standalone builds load OSMD lazily; and bilingual reload recovery is covered.
  However, the required domain ownership is still largely nominal. The final source
  has 7,752 lines in `views.ts`, versus 531 lines across audio, notation, router,
  storage, and theory. `views.ts` still owns Web Audio construction and voices
  (`ensureAudio`, `sampledPianoVoice`, `makeVoice`), pure chord/scale formula logic,
  score rendering, MusicXML preflight and parsing, and direct OSMD vendor calls
  (`OpenSheetMusicDisplay` and `MXLHelper`). `notation.ts` therefore is not the OSMD
  adapter for the app; it is a loader and pedal-patch helper around vendor access
  that remains in the view runtime. The same facade pattern remains for significant
  theory and audio responsibilities. This does not meet the requested scalable
  domain ownership merely because the monolith now has a `.ts` suffix.
- [ ] **AC8 — Complete strict quality gates and CI enforcement** — FAILED although
  every configured local command is green. There is no `@ts-nocheck`, and direct
  ESLint invocation confirms that all `src/**/*.{ts,js}` files are matched. But the
  TypeScript gate is not strict: `tsconfig.json` sets `strict: true` and then turns
  off `noImplicitAny`, `strictNullChecks`, `noImplicitThis`,
  `strictFunctionTypes`, and `useUnknownInCatchVariables`. A probe with those strict
  checks actually enabled reports 3,745 TypeScript error lines. `views.ts` contains
  499 `@ts-expect-error` suppressions, while `src/types/architecture.ts` adds
  arbitrary `[key: string]: any` access to every `Object`, `Element`, and `Window`.
  Thus `npm run typecheck` does not enforce the goal's strict TypeScript runtime.
  CI also cannot run the current unit suite as written: checkout uses
  `actions/checkout@v7` without `fetch-depth: 0` (v7 defaults to depth 1), while the
  split test executes `git show 32a184b:etude.html`. That historical object is not in
  the default shallow checkout, so the mandatory Vitest job fails before Playwright.
  Local built Playwright (210 tests), dev Playwright (203), Vitest (14), locale tests,
  deploy checks, worker checks and unchanged goldens all pass, but the required
  strict and CI gates do not.
- [x] **AC9 — Preserved behavior, URLs, storage and accessibility** — verified by
  the complete built and dev suites. Manifest `id`, `start_url`, and `scope` remain
  `./etude.html`, `./etude.html`, and `./`; the stable shell URL remains; older
  `ptt-v3` fixtures are accepted; English/Romanian parity passes; and the modal
  inertness, focus routing, mobile Escape behavior, localization, recording,
  engraving, deployment, offline, and storage regressions pass.
- [ ] **AC10 — Truthful final-state documentation** — FAILED. Deployment and
  generated-worker guidance is accurate, but README calls `views.ts` a typed runtime
  and the plan status says every Step 5 domain is implemented. In reality the
  compiler disables most strict checks, the runtime uses hundreds of suppressions
  and global `any` escape hatches, and major audio/theory/notation ownership remains
  in `views.ts`. The source's own header says the view runtime is only
  “progressively typed” while “the migration finishes,” directly contradicting the
  final-state claims in README, the plan, and Copilot instructions.

## Quality Gate

- Command: `npm run typecheck`
  - Result: PASS under the repository configuration.
  - Enforcement result: **FAIL** — effective strict flags are disabled; the full
    strict probe reports 3,745 TypeScript error lines.
- Command: `npm run lint`
  - Result: PASS.
- Command: `npx eslint 'src/**/*.{ts,js}' --no-warn-ignored`
  - Result: PASS — source TypeScript files are matched rather than silently ignored.
- Command: `npm run test:unit`
  - Result: PASS — 7 files, 14 tests locally.
- Command: `node --test i18n-tests/i18n-extra.test.cjs`
  - Result: PASS — 2 tests.
- Command: `PW_CHANNEL= npm test`
  - Result: PASS — 210 tests against built `dist/etude/`, including all five worker
    migration scenarios, deployment, standalone, and unchanged goldens.
- Command: `PW_CHANNEL= npm run test:dev`
  - Result: PASS — 203 app tests against Vite dev.
- Generated worker verification:
  - Result: PASS — 48/48 files listed, every hash matches, and the old worker fixture
    is byte-identical.
- Commit convention and ordering:
  - Result: PASS — every post-`32a184b` commit has a subject at most 72 characters,
    the correct `[B]`/`[I]` marker, and both required trailers; the complete Step 2b
    group is now the exact leading contiguous group.
- CI reproducibility:
  - Result: **FAIL** — the depth-1 checkout cannot satisfy the unit test's
    `git show 32a184b:etude.html`.
- Overall quality gate result: **FAIL**.

## Issues Found

### 1. The TypeScript migration still bypasses strict typing

Removing `@ts-nocheck` was necessary but not sufficient. Five strict checks were
explicitly disabled, 499 local errors were suppressed, and global index signatures
turn arbitrary object, DOM element and window properties into `any`. Enabling the
strict checks exposes thousands of errors immediately. The current green typecheck
therefore does not provide the enforcement promised by the goal or documentation.

### 2. Step 5 created a TypeScript view monolith, not completed domain ownership

The supporting modules contain useful tested helpers, but the view runtime still
implements core audio, music-theory and notation behavior and reaches directly into
OSMD. The requested architecture was ownership by storage, pure theory, audio/piano,
notation and views domains. Moving the old runtime wholesale into `views.ts` while
leaving those responsibilities there does not achieve that separation.

### 3. The history-dependent split test is incompatible with CI's shallow checkout

The split invariant is locally correct, but it reads a historical commit that the
workflow does not fetch. The workflow must either fetch sufficient/full history or
test against a committed immutable pre-split fixture. Until then, the advertised CI
quality gate cannot be green on this branch.

### 4. Final-state documentation overstates completion

The plan status, README and Copilot instructions describe a typed, completed domain
architecture. The effective compiler configuration, suppression count, direct OSMD
access and source header show otherwise.

## What Must Be Fixed

1. Make `npx tsc --noEmit` genuinely strict for all `src/**/*.ts`: remove the five
   strict-option overrides, replace the global `Object`/`Element`/`Window`
   `[key: string]: any` escape hatches with narrow declarations, and resolve rather
   than mass-suppress the runtime's type errors. Keep `@ts-nocheck` absent.
2. Complete real domain extraction. Move the Web Audio engine/voices into the audio
   domain, move remaining pure theory calculations into theory, and make notation the
   actual OSMD adapter so views do not construct OSMD or call `MXLHelper` directly.
   Keep views responsible for DOM and event orchestration.
3. Make the split reconstruction test CI-safe by setting checkout
   `fetch-depth: 0` (or fetching the anchor explicitly), or by committing an immutable
   trusted pre-split fixture and testing against that without git history.
4. Re-run every configured gate plus the full strict probe on a clean checkout, then
   update README, Copilot instructions and the plan status to describe only the state
   the code actually enforces.

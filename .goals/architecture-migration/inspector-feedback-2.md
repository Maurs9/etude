# Inspector Feedback — Iteration 2

## Verdict: FAIL

## Acceptance Criteria Check

- [x] **AC1 — Location and branch isolation** — verified: the repository root is
  `/Users/mmv3938/work/My projects/etude-migration`, `HEAD` is local branch
  `migration` at `924c2ca`, and `main` and `feat/migration-step-2a-deploy` remain at
  `8b443ec` and `32a184b` respectively. The remote refs are unchanged and no remote
  contains the migration head. The product tree was clean before this review; the
  pre-existing untracked `.DS_Store` and goal file remain unmodified.
- [ ] **AC2 — Step 2b atomic service worker** — FAILED on the explicit commit-order
  requirement, although the runtime behavior is now substantially verified. The
  generated worker lists all 48 published files and every SHA-256 matches. The old
  worker fixture is byte-identical to `32a184b:sw.js`; install uses
  `cache: 'no-cache'`; navigation responses are not cached; an independent probe
  confirmed an online network-only page falls back to the precached page after a 404
  and offline; retained-cache asset fetching works after a confirmed
  `controllerchange`; navigation preload is disabled in activation; and all five
  required `@sw` scenarios pass, including exactly one kill-switch reload with no
  registration or `etude-` cache left. However, the complete Step 2b change is spread
  across `f2c56b5`, `9dcee30`, and corrective commit `0a9ef7d`. The first two are
  directly after `32a184b`, but `0a9ef7d` is after every Step 3–5 commit and the first
  Inspector commit. Therefore the full set of Step 2b commits does **not** come first
  directly after `32a184b`, as AC2 expressly requires for the early cherry-pick.
- [x] **AC3 — Step 3 mechanical split and safety coverage** — verified:
  `tests/split-etude.test.mjs` splits the trusted `32a184b:etude.html` and compares the
  joined bytes exactly; Vite uses `base: './'`; TypeScript and Vitest are installed;
  the Step 3 commit loads `public/vendor/osmd-1.9.9.min.js` through a deferred classic
  script before the app module; 30 hashed MP3s are emitted and covered by the unchanged
  recordings golden; `fetchPianoAudio` checks `response.ok`; the piano bank clears
  failed warm-up state; and the browser test aborting the first MP3 request proves a
  subsequent Learn session plays. The bilingual boot guard and bridge
  completeness/write-through tests are present and pass.
- [x] **AC4 — Step 3b self-hosted fonts** — verified: the latin and latin-ext Fraunces
  and Hanken Grotesk subsets are emitted and included in the worker manifest. No
  Google Fonts URL exists in `dist/etude/`, no golden baseline file changed, and all
  three darwin engraving goldens pass.
- [x] **AC5 — Standalone `file://` artifact** — verified: the build inlines the icon,
  CSS, six font files, 30 MP3s, JavaScript and OSMD into
  `dist/etude-standalone.html`. The `file://` test records both local resource requests
  and failed requests, boots successfully, and passes with no external file
  dependency. The artifact's eager OSMD execution is assessed separately under AC7.
- [x] **AC6 — Static locale modules** — verified: English/Romanian strings and lesson
  content are statically imported from `src/locales/`; `setLang()` remains
  synchronous; `applyI18n()` still applies the existing `data-i18n*` attributes; the
  en/ro parity test passes; and duplicate-key linting passes for the JavaScript locale
  modules.
- [ ] **AC7 — Complete Step 5 architecture** — FAILED. The legacy files are deleted,
  the normal HTTP build lazy-loads OSMD only when score work starts, the bilingual
  lazy-load failure prompt works in both languages, and app code no longer reads its
  own bindings through `window.<name>`. The remaining requirements are not met:
  - `src/domain/views.ts` starts with `// @ts-nocheck`; the 7,247-line migrated
    runtime is therefore not a strict typed views module.
  - Tests still use raw globals extensively. The fixture appends
    `?__etude_test_surface=1`, and `generate-surface.mjs` recreates getters/setters on
    `window` for every app binding. A representative count found 47 direct raw-global
    calls for key APIs versus only two `window.__etude.<member>` calls. This is a
    test-only globals bridge, not migration to `window.__etude` or imports.
  - The notation adapter does not own `scorePatchOsmd`; that function remains in
    `views.ts` and delegates to `patchOsmdPedals`.
  - `views.ts` still reads/writes the `ptt-v3` key directly in `syncPull`, backup
    export, and backup import instead of routing storage access through
    `storage.ts`.
  - The standalone build injects and executes the full OSMD classic bundle before the
    app module. An independent `file://` probe reported
    `typeof window.opensheetmusicdisplay === 'object'` immediately after boot, so OSMD
    is not lazy in that supported build.
- [ ] **AC8 — Complete, strict quality gates** — FAILED despite every configured
  command being green. `tsc` includes all six domain `.ts` files, but
  `views.ts` opts out with `@ts-nocheck`. More seriously, ESLint does not lint
  TypeScript at all: explicitly running it on `views.ts`, `theory.ts`, and
  `storage.ts` reports “File ignored because no matching configuration was
  supplied.” The configuration consequently does not enforce the required pure-domain
  global/import boundaries on the TypeScript runtime and has no cycle rule from the
  referenced architecture conventions. CI now invokes typecheck, lint, Vitest, built
  Playwright and dev Playwright, and the complete suites pass, but the strictness and
  boundary gates required by AC8 are absent. Test count increased rather than dropping:
  210 built tests and 203 dev app tests pass.
- [x] **AC9 — Preserved behavior, URLs, storage and accessibility** — verified by the
  built and dev suites: manifest `id`, `start_url`, and `scope` remain
  `./etude.html`, `./etude.html`, and `./`; the public manifest is byte-identical to
  the previous root manifest; the typed reader and browser tests accept older
  `ptt-v3` data; en/ro parity passes; and the existing modal inertness, focus routing,
  mobile Escape, localization, recordings, score and deployment regressions pass.
- [ ] **AC10 — Final-state documentation** — FAILED because the updated documents
  describe a stricter final state than the code provides. README calls
  `views.ts` a typed view runtime even though it is `@ts-nocheck`; the plan status says
  all Step 5 domains are implemented; and the Copilot instructions describe
  `window.__etude` as the test surface while the suite still depends on generated raw
  window aliases. The Vite/generated-worker and “how to add a file” documentation is
  otherwise correctly updated.

## Quality Gate

- Command: `npm run typecheck`
  - Result: PASS, but `src/domain/views.ts` is excluded from checking by
    `@ts-nocheck`.
- Command: `npm run lint`
  - Result: PASS, but direct ESLint invocation proves the `.ts` domain files are
    ignored.
- Command: `npm run test:unit`
  - Result: PASS — 8 files, 16 tests.
- Command: `PW_CHANNEL= npm test`
  - Result: PASS — 210 tests against built `dist/etude/`, including all five atomic
    worker migration scenarios, deployment, standalone and unchanged goldens.
- Command: `PW_CHANNEL= npm run test:dev`
  - Result: PASS — 203 app tests against Vite dev.
- Command: `node --test i18n-tests/i18n-extra.test.cjs`
  - Result: PASS — 2 tests.
- Generated worker verification:
  - Result: PASS — 48/48 published files listed and all hashes match.
- Targeted runtime verification:
  - Result: PASS for regular-build lazy OSMD and bilingual failure prompts.
  - Result: FAIL for standalone lazy OSMD; the OSMD API is already present at boot.
- Commit convention:
  - Result: PASS for every Builder title length and both required trailers.
  - Result: FAIL for AC2 ordering because the required Step 2b repair commit is not
    adjacent to the initial Step 2b group.
- Overall quality gate result: **FAIL** because strict TypeScript and architecture lint
  enforcement are mandatory parts of the gate, not optional labels on green commands.

## Issues Found

### 1. The final views runtime is TypeScript in extension only

Moving the remaining JavaScript body into `views.ts` and placing
`@ts-nocheck` above it bypasses the principal Step 5 quality requirement. The compiler
can report a green project while checking none of the 7,000-line final runtime. This is
especially significant because README and the plan now call the runtime typed and
complete.

### 2. Raw-global test access was recreated instead of removed

The production surface contains `window.__etude`, but the normal fixture deliberately
adds a query that mirrors all of its properties back onto `window`. Existing tests
continue to call and replace `show`, `setLang`, `pianoDecode`, `preparePiano`,
`scoreFixPedals`, `syncPull`, and many other raw names. This preserves the old testing
model behind a new query switch and violates the explicit acceptance criterion.

### 3. Domain ownership and enforcement remain incomplete

`scorePatchOsmd` is still owned by the views monolith, and several `ptt-v3` reads and
writes remain there. ESLint cannot detect these or future boundary regressions because
the `.ts` files are ignored. The configured one-property `window.anLayoutVars`
restriction is not a substitute for the required TypeScript domain-boundary,
restricted-global, and cycle rules.

### 4. Lazy OSMD is inconsistent across supported builds

The Pages build behaves correctly: no OSMD request occurs at boot or merely on opening
the Analysis view, and the vendor script loads when a score is opened. The standalone
builder instead prepends the entire OSMD bundle as an immediately executed classic
script. Since `file://` is an explicit supported deliverable, lazy loading must hold
there too.

### 5. The Step 2b history is no longer the required leading commit group

The functional repair and four missing migration tests are in `0a9ef7d`, after the
first Inspector commit. Thus the first two commits after `32a184b` are not the complete
extractable Step 2b implementation. The branch is local, so this is still repairable
by restacking the commits before completion.

## What Must Be Fixed

1. Remove `@ts-nocheck` from `src/domain/views.ts` and make the complete runtime pass
   strict TypeScript. Do not claim strictness from file extensions alone.
2. Convert every browser test to `window.__etude.<member>` or direct module imports.
   Remove `__etude_test_surface`, the raw window alias loop, and obsolete bridge
   generation/testing once no raw-global consumer remains.
3. Finish domain ownership: move `scorePatchOsmd` into the notation adapter and route
   all `ptt-v3` reads/writes through the storage module. Review the remaining
   monolithic theory/audio/notation responsibilities rather than treating helper
   wrappers as complete extraction.
4. Configure ESLint to parse and lint all TypeScript modules and enforce the referenced
   pure-domain restricted globals/imports, no legacy imports, app-global access rule,
   duplicate keys, and import-cycle rule. Make warnings for ignored source files fail
   CI.
5. Keep standalone self-containment while deferring OSMD evaluation until score work
   requests it. Add a `file://` assertion that OSMD is absent at boot and appears only
   after opening/rendering a score, plus the existing no-external-resource assertion.
6. Restack the local commit history so the complete Step 2b commit group, including
   its required tests and old-tab fix, is directly after `32a184b`; preserve the
   required titles and trailers and keep later steps separated in plan order.
7. Correct README, Copilot instructions, and the plan status only after the strict
   runtime, test surface, lint enforcement, and lazy standalone behavior are true.

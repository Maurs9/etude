# Étude: safe, incremental migration plan

**Date:** 8 November 2026
**Status:** This plan sets the order, safety rules and exit gates for the architecture migration. Step 0 is done and merged into `main` (PR #4). Step 2a, publishing the site from Actions, is ready on `feat/migration-step-2a-deploy`; Steps 2b and 3 are implemented on `migration`, pending the owner's live rollout and freeze checks. Step 3b follows.

## 1. Summary

The destination is the same as in the earlier plans: Vite, gradually introduced TypeScript, and vanilla JS with no UI framework. The app stays 100% static and still installs as an offline PWA, at the same URLs and with the same saved data.

This plan changes the **order** and adds the **safety net** the earlier plans lacked:

1. **Safety net first (Step 0, done).** Get the suite green and stable. Pin the two things a refactor can silently break: the piano recordings and the score engraving. Run the suite on every PR.
2. **Decouple OSMD 2.2.1 (Step 1).** The upgrade is optional and never lands in the middle of the migration, so a layout change always has exactly one possible cause.
3. **Change the deployment, then make the service worker atomic, while the app is still one file (Steps 2a and 2b).** First, Pages publishes from CI with every file unchanged. Then clients get the safe worker before the first multi-file deploy. This removes the offline blank-page risk that both reviews flagged.
4. **Split mechanically and repeatably (Step 3).** A deterministic script splits `etude.html` without renaming or rewriting anything. It runs again on the latest `main` during a short freeze, instead of anyone rebasing a 5 MB diff by hand.
5. **Move Sight-Reading v3 after the migration (Step 6).** Feature work and refactoring never share a PR.

Every step:

- is one PR (in Step 5, one PR per domain);
- merges only when CI is green;
- leaves the goldens unchanged, unless changing them is the step's purpose;
- can be reverted.

## 2. Earlier documents

| Document | Status |
|---|---|
| `2026-11-07-unified-migration-and-sight-reading-plan.md` | Part I (diagnosis, target structure, lint rules) remains the reference for the target architecture. This plan replaces its migration phases (0–4, 6–7) and its service-worker strategy (§1.5). Part III (Sight-Reading v3, M0–M10) remains valid and becomes Step 6. |
| `2026-11-06-architecture-migration-plan.md` | Superseded by the unified plan and this one. |
| `2026-11-07-osmd-221-and-dependencies-guide.md` | The diagnosis and the dependency inventory remain valid. Its Moonlight fix, a global `MinSkyBottomDistBetweenSystems`, is rejected (Sonnet B5). Step 1 replaces its execution order. |
| `docs/osmd-221-experiment.md` | Valid evidence that 2.2.1 can't merge as is: Moonlight III grows from 14 to 17 pages, and license notices are missing. |
| `docs/gemini review.txt`, `docs/sonnet review.txt` | Every finding is mapped to a step in §9. |
| `2026-11-06-sight-reading-*.md` | Out of scope here. Step 6 uses Part III of the unified plan. |

## 3. Facts this plan relies on

Measured on `eba5ebd`.

**Layout of `etude.html`** (5.45 MiB, 10,421 lines):

| Lines | Content |
|---|---|
| 17 | A small inline script that adds the manifest only over http(s), so the file also works from `file://` |
| 2104 | The 30 piano samples, as base64 JSON |
| 2105–2106 | OSMD 1.9.9, as a 1.2 MB inline UMD script |
| 2107–10419 | The app script |

**The app script:**

- It already starts with `"use strict"`, so turning it into a module changes only its scope, not its semantics.
- Only `</body>` follows it. It has no inline `on…=` handlers and doesn't use `document.write`, `document.currentScript` or `DOMContentLoaded`, so deferred module execution doesn't change the start-up order.
- It declares 888 top-level functions (24 of them async), about 170 top-level `const` statements and 19 top-level `let` statements.

**The tests:**

- About 265 `page.evaluate`/`waitForFunction` calls reach these globals directly.
- About 30 of them **replace** an app function with a stub and rely on the app's own callers using it. Examples: `pianoDecode`, `makePianoVoice`, `preparePiano`, `scoreFixPedals`, `previewNote`, `anInflatedSize`, `playInterval` and `syncPull` in `tests/app.spec.mjs`. Today that works because they are script-scope globals.
- Two tests in `tests/app.spec.mjs` and the recordings golden read the HTML source. So does the i18n tooling, which CI doesn't run: `i18n-tests/i18n-extra.test.cjs`, `i18n-framework/inventory.cjs`, `i18n-framework/runtime.spec.cjs` and `i18n/*/{extract,assemble,verify}.cjs`.
- The app reads one of its own globals through `window`: `window.anLayoutVars` (resize relayout).

**Deployment:** GitHub Pages serves the repo under `/etude/` with `Cache-Control: max-age=600`. `/etude/` itself shows the README.

- Besides itself, the page loads only three files from the site: `manifest.webmanifest`, `icons/apple-touch-icon.png` and `sw.js`. The worker precaches the other icons.
- From Step 2a, Pages publishes only the files the app uses, and `/etude/` opens the app.

**Workflow:** branches are usually merged locally and pushed to `main`, not merged through PRs.

**The current `sw.js`** (`etude-shell-v2`):

- It serves the page network-first with an 8 s timeout, and **writes the network copy into its cache**.
- It serves the manifest and icons stale-while-revalidate.
- It calls `skipWaiting()`. On activation it deletes the other `etude-` caches, enables navigation preload and claims the clients.
- This is safe only because the page is self-contained.

**Fonts:** Fraunces and Hanken Grotesk load from Google Fonts. The worker ignores other origins, so offline the fonts depend on the HTTP cache. This gap already exists.

## 4. Invariants that hold after every step

1. **URLs:** `etude.html` and `sw.js` keep their URLs, and the worker keeps its scope. Installed PWAs and bookmarks depend on them.
2. **Saved data:** the `ptt-v3` key and format stay readable. A format change ships with a reader for the old format. An incompatible change is a MAJOR release.
3. **Offline:** an installed app never shows a blank page offline, even in the middle of an update.
4. **Piano recordings** stay byte-identical (golden).
5. **Score engraving:**
   - The `music` fingerprint never changes.
   - The `layout` fingerprint changes only in Step 1, with a reviewed diff.
6. **Strings and accessibility:**
   - Strings keep en/ro parity, and duplicate-key detection stays.
   - Accessibility behaviour stays: the inert background behind dialogs, focus on `show()`, Escape on the mobile menu and 4.5:1 contrast.
7. **Baselines** move only in a commit of their own that says why.
8. **Merge gate:** a green CI run on Linux. Steps that touch layout also need a green local run on macOS.

## 5. Step 0: the safety net (done)

### 5.1 Baseline found

The branch (`main` at `eba5ebd`, plus docs) had **183 passing and 8 failing tests**. Migrating on a red suite would have made every later failure ambiguous.

| Failure | Root cause | Fix |
|---|---|---|
| 7 tests that press on-screen piano keys | `eba5ebd` made the keyboard dock start hidden on a first visit: `dockOpen()` returns `DOCK.pref ?? false`. | `tests/fixtures.mjs` gets an `app.open({ dock: true })` option. A new test pins the new default: the dock is hidden at first and remembered once shown. It passes on `eba5ebd` and fails on `eba5ebd^`. |
| T4.4 (French offline journey), in addition | The test clicked the middle of a white key, which the C♯3 black key covers. This was already failing, as noted in `docs/osmd-221-experiment.md`. | Click near the bottom edge of the key. |
| Adversarial language test (intermittent) | The language buttons fill the Read range selects in a deferred `setTimeout(rdOnLocale, 0)`. | Wait one macrotask after the warm-up switch. |
| Bach pedal hover (intermittent) | A ResizeObserver relayout can move the label after it was measured. | Measure and hover inside `expect(...).toPass()`. |

After the fixes: **196 passed in each of three consecutive runs, about 1.8 min each** (local macOS). The first CI run (8 November, `ubuntu-24.04`, Playwright's Chromium) also passed all 196, in 3.3 min with no retries.

### 5.2 What Step 0 added

| Change | Purpose |
|---|---|
| Playwright projects in `playwright.config.mjs`: `app` (service workers blocked) and `sw` (service workers allowed, for tests tagged `@sw`) | A worker's cache can't affect the app suite, which matters once Step 2b changes the worker. Worker tests have a place to go. |
| On CI only: `retries: 1`, `trace: 'on-first-retry'` | A one-off CI hiccup doesn't block a merge, and a retry leaves a trace. Local runs never retry, so flakes stay visible. |
| `tests/golden.spec.mjs` and `tests/golden/` | Recordings and score-engraving baselines (§5.3). |
| `.github/workflows/test.yml` | Runs the suite with Playwright's Chromium on every push to any branch, and on PRs, so a branch is checked before it is merged locally. Runs on `main` are never cancelled once started. Uploads `test-results/`, which holds failure traces and the layouts for platforms without a baseline. |
| `i18n-framework/test-results/.last-run.json` untracked | It was test output, committed by mistake. |

### 5.3 Golden baselines

**Piano recordings** (`tests/golden/piano-recordings.json`)

- Stores the SHA-256 hash and byte length of each of the 30 MP3s, decoded from `#piano-recordings`.
- Runs in Node with no browser, and rejects non-canonical base64.
- Step 3 points the same manifest at the extracted files.

**Score engraving** (`tests/golden/scores/*.json`)

- Each committed fixture is imported at 1280×900 after the fonts load. The fixtures are Für Elise and the Bach and Moonlight pedal excerpts.
- `music` covers measures, beats, onsets and visible noteheads. It depends on neither the platform nor the layout, and the continuous view must match the page view.
- `layout` covers pages, systems per page, the first bar of each system, pedal marks, slurs and ties, and cross-staff lines.
- `layout` is stored per platform (currently `darwin`), because text metrics differ between operating systems.
- Neither view may have pedal collisions.

**Proven by mutation:**

- Changing one MP3 byte fails the recordings golden.
- Ignoring the XML system breaks fails Für Elise (3 → 4 pages).
- A spacing change that leaves every break in place is **not** caught. For example, `MinimumDistanceBetweenSystems`, which Für Elise's own system gap overrides. The goldens count structure; they don't compare pixels.

**Updating a baseline:**

1. Run `UPDATE_GOLDEN=1 npx playwright test golden`. This rewrites `music`, but only the current platform's `layout`.
2. Review the JSON diff.
3. Commit it on its own, saying why.

**A new platform:**

- On a platform without a layout baseline, the test still passes. It writes the measured layout to `test-results/…/<score>.<platform>.json` and adds an annotation.
- To adopt the Linux baseline, take that file from the CI artifact (or run the update on Linux). Add it under `layout.linux` and commit it on its own.
- **Done (8 November):** the Linux baselines from the first CI run are committed. They're identical to the macOS ones for all three fixtures. The workflow now sets `GOLDEN_REQUIRE_PLATFORM=1`, so a missing platform baseline fails instead of passing quietly. CI runs on a pinned `ubuntu-24.04` image; moving to a newer one is a deliberate change that re-takes the baselines in the same PR.
- The macOS baselines were taken with the auto-updating system Chrome. If a Chrome update moves them, re-take them with `PW_CHANNEL=` (Playwright's pinned Chromium).

**Private scores:**

- `ETUDE_SCORES_DIR=/path/to/scores` adds a test for every `.mxl`, `.musicxml` and `.xml` file in that folder. Their baselines go in `<dir>/.etude-golden/`.
- Nothing from that folder enters the repo. Use it for the five desktop scores; Mr. Grinch is copyrighted.

## 6. Steps 1–6

### Step 1: OSMD 2.2.1 (optional and independent)

**When:** before Step 2b or after Step 4, never between them. OSMD 1.9.9 passes through Steps 2b–4 untouched. The five scores aren't available yet (decision 4), so the default is after Step 4.

**Scope:**

1. Replace the bundle with the verified npm build (`224ee5be…`; see the experiment).
2. Find the actual cause of the extra Moonlight III pages **before** changing any option.
   - Gemini's `scoreExtraBreaks` condition is a hypothesis to test, not a conclusion.
   - Any fix stays narrow, limited to the last system or the page bottom, never a global spacing rule (Sonnet B5).
3. Make `scorePatchOsmd` fail loudly if a method it patches no longer exists.
4. Check for doubled cross-staff slurs (`RenderSlursAcrossStaves`). The goldens' `curves` count shows duplicates.
5. Inventory the bundled third-party components and ship their notices.

**Exit criteria:**

- `music` is unchanged for the fixtures and the five local scores.
- The `layout` diffs are reviewed and committed on their own.
- Moonlight III is back to 14 pages or fewer, or the difference is explained and accepted.
- There are no pedal collisions, and the suite is green.
- The six-mode audit (`docs/score-import-five-audit.md`) is repeated on the five scores.

**Rollback:** revert the PR. It contains only the bundle and the patches.

### Step 2: deploy from Actions, then an atomic service worker (app unchanged)

Step 2 is two PRs. 2a changes only how the site is published; every file users load stays the same. 2b then changes the worker. Each one is checked and rolled back on its own.

#### Step 2a: deploy from Actions

**Goal:** publish the site from CI, so the deployed bytes are the tested bytes, while nothing an installed app runs changes. `etude.html`, `sw.js`, `manifest.webmanifest` and the icons are published byte for byte, so installed PWAs don't even get a worker update.

**Scope** (on `feat/migration-step-2a-deploy`):

1. **Build.** `scripts/build.mjs` copies an allowlist, `SITE_FILES`, into `dist/etude/` byte for byte. It adds an `index.html` that forwards `/etude/` to `etude.html`, keeping the query and hash, with a `<noscript>` refresh for browsers without JavaScript.
   - Nothing else is published. The README, `docs/`, the tests and the i18n drafts leave the public site. That includes `i18n-extra.js`, which the app doesn't load.
   - `/etude/` opens the app instead of the README. This is the only visible change, and it also applies online in installed apps, whose worker passes that navigation to the network.
   - Any file the app starts loading must be added to `SITE_FILES`. The deploy tests catch a missing file that loads at startup, a `<link>` or a manifest icon, but not one fetched later. From Step 3, Vite's output, which follows the code's imports, replaces the list.
   - The build empties only its own `dist/etude/`. Any other output folder must be new or empty, so a mistyped path is refused instead of deleted (on macOS, a path differing only in letter case would otherwise point at the repo).
2. **Preview.** `scripts/serve.mjs` serves a folder the way Pages does: a folder URL serves its `index.html`, a missing slash gets a 301, every file gets `Cache-Control: max-age=600`, and paths can't leave the folder. `npm run preview` builds and serves the site at `http://127.0.0.1:8778/etude/`.
3. **CI.** Every branch builds, so a broken build shows before merging. On `main`, once the tests pass, the workflow uploads `dist/etude` and a `deploy` job publishes it (`actions/deploy-pages`, environment `github-pages`). The job has its own `pages` concurrency group with `cancel-in-progress: false`, so a deploy is never cut off halfway. Before publishing, `deploy` checks two things:
   - Pages' source is "GitHub Actions". Otherwise it fails: the branch build would publish too, and the two sites would replace each other on every push.
   - The commit is still the newest on `main`. Otherwise it skips publishing with a warning, so re-running an older run can't bring back an older site.
   - Each run attempt names its uploaded site after itself, so a re-run never leaves two copies for `deploy` to choose from.
   - A failed upload of `test-results` doesn't stop a green run from publishing.
4. **Tests** (`tests/deploy.spec.mjs`), against the built site served under `/etude/`:
   - The site is exactly the allowlist plus `index.html`, byte for byte, and building twice gives the same site.
   - The build refuses an output folder that isn't empty. The test uses only temporary folders, never the repo.
   - The manifest's `id`, `start_url` and `scope` resolve as before, and its icons load.
   - `/etude/` boots the app with the query and hash kept and no failed request. Without JavaScript, it still reaches `etude.html`.
   - `@sw`: after an install under `/etude/`, the app reloads offline, with the server stopped.
   - Each test was shown to fail when the build breaks the thing it guards: a missing icon, a lost hash, a changed byte, a disabled guard.
5. **Docs:** `.github/copilot-instructions.md`, `package.json` and `i18n-extra-notes.md` (an integrated locale file must join `SITE_FILES`).

**Moved to Step 3:** Vite, TypeScript, Vitest, the `file://` standalone build and running the full suite against `dist/`. While the app is one file, `dist/` holds the bytes the suite already tests, so these add nothing yet. Vite would also rewrite `etude.html`'s links, so it can't keep the bytes identical.

**Switching the Pages source** (owner decision 1), once:

1. Wait for the branch's Tests run to be green. On a branch, `deploy` is skipped.
2. Right before merging, set Settings → Pages → Build and deployment → Source to **GitHub Actions**.
   - GitHub's docs don't say what's served until the first workflow deploy. The last deployment is expected to stay live.
   - Check in a private window that `https://maurs9.github.io/etude/etude.html` still opens; a cached copy could hide a failure. If it doesn't open, switch back first: the branch build restores the old site in about a minute.
3. Merge into `main` and push. The Tests run on `main` ends with `deploy`, which links to the site.
   - If the source wasn't switched, `deploy` fails at its first check while the branch build keeps publishing as before. Switch, then "Re-run failed jobs".
4. If `deploy` fails, re-run the latest run on `main` ("Re-run failed jobs" or "Re-run all jobs") within a day, while its built site is kept, or use "Run workflow" on `main` at any time. Each attempt names its built site after itself, so re-runs never find two copies. A failed deploy leaves the previous site in place.
5. Optionally, remove the `gh-pages` branch rule from Settings → Environments → `github-pages`, since only `main` deploys.
6. Don't configure one of the workflows the Pages settings page suggests ("Static HTML", "Jekyll"). The Tests workflow already publishes, and a second one would publish the whole repo over it; the source check can't detect that.

**Exit criteria:**

- CI is green on the branch.
- Settings → Pages shows the source "GitHub Actions", and the merge commit has no "pages build and deployment" run.
- After the first deploy, the live `etude.html`, `sw.js`, manifest and icons have the same SHA-256 as on `main`, and `/etude/` opens the app. Check `/etude/` in a private window or with `curl -sI`: a browser may reuse the old README for up to 10 minutes (`max-age=600`).
- The owner opens the installed PWA once online and once in airplane mode. Nothing should have changed.

**Rollback:** set the source back to "Deploy from a branch" (`main`, `/ (root)`). That alone restores the old site, since no app file changed, and `deploy` then refuses to publish. Then revert the PR. `sw.js` never changed, so there's no `VERSION` to bump.

#### Step 2b: an atomic service worker

**Goal:** get the worker that makes a multi-file app safe onto clients **before** anything is multi-file.

**Precondition:** 2a is live and checked, and Pages publishes from Actions.

**Scope:**

1. **Generated worker.** The build generates `sw.js` with a precache manifest listing every file with its content hash, so any content change produces a new worker. `tests/deploy.spec.mjs` then checks the generated worker against its manifest, instead of comparing `sw.js` byte for byte. The worker's rules:
   - **Install** precaches the complete set into a new `etude-` cache. If any request fails, the install fails and the running version stays intact.
   - **Navigations** stay network-first with the 8 s timeout, so a new upload still shows on the next online visit, as it does today. The network copy is **never written to the cache**. Offline, on a timeout or on an error response, the worker serves the active version's precached page. Today's worker passes an error response through, so a 404 during a Pages outage would show in installed apps.
   - This means a network page shows only online, where its files are reachable, and an offline page always comes with its own complete set. This removes the page/asset skew (Sonnet B1, Gemini 1).
   - **Precache requests bypass the HTTP cache** (`cache: 'no-cache'`, as today). Pages' `max-age=600` could otherwise store an `etude.html` up to 10 minutes old under a newer manifest. Each response's SHA-256 is checked against the manifest. On a mismatch, the install fails and the partial cache is deleted.
   - Files whose hash is unchanged (for example, the 30 samples) are copied from an existing `etude-` cache instead of fetched again.
   - The worker records the **active** cache name, so "previous version" means the last version that was active. A failed install's partial cache never counts as a version.
   - **Content-hashed files** are served cache-first from any `etude-` cache.
   - **Activation** keeps the previous version's cache until the next activation, so a tab still running the old version can finish loading its files.
   - **Navigation preload** is disabled. The current worker enables it, and the setting persists on the registration.
   - **Cache names** keep the `etude-` prefix, so cleanup works in both directions.
2. **Kill switch.** Add an emergency worker, `scripts/sw-kill-switch.js`, with a short runbook. It is deployed only if needed. It deletes the `etude-` caches and unregisters itself. The page registers `sw.js` on every load, so a careless kill switch would reload pages forever. To prevent that:
   - It doesn't call `clients.claim()`.
   - It reloads only the pages a previous worker controlled, once each.
   - The test checks for exactly one reload.
   - The deployed page must also stop registering, or register the kill switch itself.
3. **Subpath.** The `@sw` tests run the generated worker from the built site under `/etude/`, so a wrong absolute path fails.
4. **Docs.** Update `.github/copilot-instructions.md` and `i18n-extra-notes.md`: the generated worker replaces the hand-bumped `VERSION` and the `ASSETS` list.

**New `@sw` tests.** These use `scripts/serve.mjs` on a temporary folder whose contents each test swaps between versions:

- A fresh install reloads offline.
- An upgrade from today's worker works online, then offline. Today's `sw.js` is committed as a test fixture (`tests/fixtures/sw-pre-migration.js`), so the test doesn't depend on a tag that a shallow CI checkout lacks.
- After an interrupted upgrade (one precache request aborted), the old version still works offline, with no mixed files.
- An old tab survives activation of a new version.
- The kill switch leaves no `etude-` cache and no registration.

**Exit criteria:**

- CI is green, including the worker tests, which run the generated worker from the built site.
- After the first real deploy, the owner checks the installed PWA on a phone: it updates online, then launches in airplane mode.

**Rollback:**

- Revert the PR.
- Bump `VERSION` in the restored `sw.js`, as the release rules require for any caching change.
- If a broken worker ever ships, deploy the kill switch.

### Step 3: the mechanical split (same behaviour)

**Preconditions:**

- Step 2b has been live for about a week, so installed clients run the atomic worker.
- The owner has agreed to a 1–2 day freeze (owner decision 3).

**Tool:** `scripts/split-etude.mjs` is deterministic, and a test proves that joining its output reproduces the input byte for byte. It runs on the latest `main` at the start of the freeze.

**Result:**

- `etude.html`, now the shell, at the same URL;
- `src/styles/etude.css`;
- `src/legacy/app.js`, the app script as one ES module;
- a generated `src/legacy/bridge.js`;
- `src/assets/piano/<midi>.mp3`, 30 files;
- the OSMD 1.9.9 file.

Nothing is renamed or rewritten.

**Toolchain** (moved from Step 2):

- Vite, TypeScript and Vitest join as dev dependencies. Vite uses `base: './'`, because the site lives under `/etude/`. Vite's output replaces the `SITE_FILES` list.
- `tests/deploy.spec.mjs` keeps checking the built site under `/etude/`: no file outside the expected set, the manifest's URLs, a boot with no failed request, and offline.
- **`file://`** (owner decision 2): CI also builds a single-file `etude-standalone.html`, with everything inlined as today, attaches it to each release and smoke-tests it over `file://`. Until the split, `etude.html` itself opens from `file://`, so this isn't needed earlier.

**Requirements:**

**Globals bridge** (Sonnet B3, Gemini 3):

- Functions stay function declarations. With no `let f = function` rewrite, hoisting is unchanged and there's no temporal dead zone (TDZ).
- The bridge is generated from the parsed script and **injected at the top of `app.js`'s module scope** by a dev/build transform. The committed source and the join test stay untouched. A separate `bridge.js` can't work, because it can't assign `app.js`'s bindings.
  - Every top-level function and `let` gets a live `window` getter **and setter**. A test's `pianoDecode = stub` must replace the binding the app itself calls; about 30 tests depend on this (§3). This is Sonnet's Q2.
  - Top-level `const`s get a getter.
  - Being at the top, the bridge exists from the start of boot, as hoisted globals do today.
- **Completeness test:** the bridged names must equal the top-level names of the split's own input, not of an older tag, which concurrent sessions make stale.
- **Write-through test:** stub a function through `window`, call an app function that uses it, and check the stub ran.
- The bridge is temporary; Step 5 empties it.

**Piano samples** (Gemini 2):

- Samples are fetched from the hashed files instead of decoded from the inline JSON.
- The fetch sits inside `pianoDecode`'s pending job, so `.finally()` clears it. It checks `res.ok` before decoding, and reads `actx` before the fetch, not after (Sonnet Q6, iOS).
- Clearing `pending` is not enough. After one failed warm-up, `pianoFail` leaves `status='error'` and `preparePiano` keeps returning the same failed `pianoBank.promise`. Learn's `if(!await preparePiano()) return;` then stays silent until a reload (Gemini 2). On a fetch failure, reset `pianoBank.promise` and the status so the next call tries again.
- **Test:** abort the first request for a warm-up sample, then start a Learn playback that waits on `preparePiano`; it must play.

**OSMD** (Sonnet B2, Gemini 5):

- Vite can't bundle a classic `<script src>`, and a `?url` import lives inside the module, so it would run too late. Instead, ship the file as `public/vendor/osmd-1.9.9.min.js`: the version is in the name and its hash is in the worker manifest.
- Load it with `<script defer>` placed before the module. Deferred classic scripts and modules run in document order, so `window.opensheetmusicdisplay` exists before the app runs, the same way in dev and in the build. Never `import()` it.
- Loading OSMD only on the score view is a Step 5 optimisation.

**Boot guard:**

- A tiny inline script in the shell shows a short en/ro message with a Reload button if the app module fails to start.
- It covers a client that skipped Step 2b's worker and went offline mid-update, turning a possible blank page into an instruction.
- Its two strings are the only text outside `STRINGS`, because they must work when `STRINGS` failed to load.

**Tests:**

- A `readSource()` helper lands first, so `app.spec.mjs` reads the sources rather than a single file. The i18n tooling that reads `etude.html` (§3) moves to the same helper or is retired explicitly, in the same PR.
- The recordings golden checks the MP3 files against the unchanged manifest.
- A browser test hashes the MP3s as `dist/` serves them.

**Fonts** stay on Google Fonts in this step. Self-hosting Fraunces and Hanken Grotesk is a separate follow-up PR, Step 3b:

- It uses latin and latin-ext subsets, for ă â î ș ț.
- It closes the offline font gap.
- It must leave the layout goldens unchanged on both platforms.

**Exit criteria:**

- The full suite is green against both the Vite dev server and `dist/`.
- The goldens are unchanged on `darwin` and `linux`.
- The worker tests are green.
- First-load transfer size and time are recorded for comparison.

**Rollback:** revert the PR. Each version is precached whole, so a revert is just another version.

### Step 4: strings and lesson content (option 4A)

**Scope:**

- `STRINGS` (en/ro) and the educational content move to locale modules that are imported statically.
- `setLang()` stays synchronous. Option 4B, async loading, is rejected: the last call to finish would win (Sonnet B4), and both the code and the tests expect the text to update immediately.
- `applyI18n()` and the `data-i18n*` attributes are unchanged.

**Checks kept:**

- Duplicate keys: ESLint `no-dupe-keys` on the locale modules, plus the existing test, adapted.
- en/ro key parity.

**Exit criteria:** the suite and goldens are green.

**Rollback:** revert the PR.

### Step 5: domain modules in TypeScript (one PR per domain)

**Order, safest first:**

1. Storage: a typed `ptt-v3` reader, tested against fixtures of real older saves.
2. Pure theory logic.
3. Audio and the piano bank.
4. Notation: an OSMD adapter that owns `scorePatchOsmd`, with OSMD loaded only where it's needed.
5. Views.

**Each PR:**

- moves its functions out of `src/legacy/app.js`;
- adds Vitest unit tests;
- passes `tsc --noEmit` (strict for new modules) and the boundary lint rules (unified plan §1.4);
- switches its tests from raw globals to `window.__etude`, and removes its names from the bridge.

**Exit criteria (each PR):** the suite and goldens are green, the bridge shrinks, and no new globals appear.

**Watch for:**

- App code that reads its own globals through `window` (for example `window.anLayoutVars`) silently stops working when the name leaves the bridge. Use the bare name, and lint against `window.<appGlobal>`.
- A tab left open across two deploys can 404 on a lazily loaded file. When such a load fails, show a reload prompt (en/ro).

**Done when** `src/legacy/app.js` and the bridge are gone.

### Step 6: Sight-Reading v3

The spec is Part III of the unified plan (M0–M10). Work starts after Step 4 and builds on the Step 5 modules it needs: storage, audio input and notation.

## 7. Working rules during the migration

- **Separate PRs:** migration PRs contain no feature changes, and feature PRs contain no migration changes.
- **Concurrent sessions:** other sessions keep editing `etude.html` until Step 3's freeze. Step 3's PR updates the instructions to point at `src/legacy/app.js`.
- **Rollback anchor:** the last commit on `main` before Step 2a merges. Optionally tag it `pre-migration` (decision 5).
- **Releases:**
  - Steps 1, 2 and 3 are each a MINOR release. Step 2's release comes after 2b; 2a changes no file users load, so it needs none.
  - Steps 4 and 5 are grouped into releases as convenient.
  - Nothing here is MAJOR, unless the storage format changes incompatibly.

## 8. Owner decisions

Answered by the owner on 8 November 2026.

| # | Decision | Needed by | Outcome |
|---|---|---|---|
| 1 | Deploy GitHub Pages from Actions | Step 2a | **Pending the one-time setting.** The owner keeps pushing from GitHub Desktop; that doesn't change. When Step 2a merges, the owner sets Settings → Pages → Source to "GitHub Actions" (see "Switching the Pages source" in Step 2a), so a push to `main` tests, builds, then publishes. The deployed bytes become the tested bytes. |
| 2 | Keep `file://` support | Before Step 3 | **Keep it** (owner: "use the best approach"). CI also builds a single-file `etude-standalone.html`, with everything inlined as it is today, attaches it to each release and smoke-tests it over `file://`. |
| 3 | 1–2 day freeze for Step 3 | Step 3 | **Agreed.** |
| 4 | Five desktop scores, provided locally through `ETUDE_SCORES_DIR` (never committed) | Step 1 exit | **Later.** Not available yet. They're required before Step 1 merges, not for Steps 2–3, which the committed fixtures cover. |
| 5 | Tag `pre-migration` | Step 2a | **Optional.** Nothing depends on it: the upgrade test uses a committed copy of today's `sw.js`, and a rollback can use the commit hash. It's a convenient name for "the last single-file version". To add it in GitHub Desktop: History → right-click the commit → Create Tag, then push. Release tags follow the usual release rules. |
| 6 | Merge a branch only when its "Tests" run is green. The workflow runs on every pushed branch; a required check would only block or be bypassed on direct pushes to `main`. | Now | **Agreed.** |

## 9. Review findings and where they're handled

| Finding | Verdict | Handled by |
|---|---|---|
| Sonnet B1 / Gemini 1: a network-first page written to the cache next to a hashed precache gives a blank page offline. | Accepted | The Step 2b worker (network copy never cached, atomic precache), the Step 3 boot guard and the `@sw` upgrade tests. |
| Sonnet B2 / Gemini 5: `import()` of the UMD OSMD bundle behaves differently in dev and in the build. | Accepted | Step 3: a classic script from a hashed URL. |
| Sonnet B3 / Gemini 3: a snapshot `Object.assign` bridge goes stale; inline handlers break; `let` rewrites cause TDZ errors. | Accepted. The app has no inline handlers. | Step 3: a generated getter/setter bridge injected into the module, kept declarations, and completeness and write-through tests. |
| Sonnet B4: async `setLang` (option 4B). | Accepted | Step 4 uses option 4A. |
| Sonnet B5: a global `MinSkyBottomDistBetweenSystems` to fix Moonlight. | Accepted | Step 1: a narrow fix. The goldens and the five-score audit show page and system changes. |
| Gemini 2: a failed sample load is remembered. | Partly. `.finally()` clears `pending`, but `preparePiano` keeps its failed promise, so Learn stays silent until a reload. This matters once samples are fetched. | Step 3: reset the promise and status on failure, plus the abort test through `preparePiano`. |
| Both reviews: the build must work under the `/etude/` subpath. | Accepted | Step 2a: CI tests the built site under `/etude/`. Step 3: Vite's `base: './'`. |
| Gemini: a separate cache for audio. | Replaced | Step 2b copies files with an unchanged hash from existing caches, which avoids refetching the samples on every deploy. |
| Opus review of this plan (8 Nov) | Applied | §3, §5.3, Steps 2, 3 and 5, and decision 6. |
| Opus review of Step 2a (8 Nov): the build's folder guard was textual, so on macOS a path in another letter case could empty the repo. A forgotten source switch would leave two publishers. Re-running an old run could publish an old site. | Applied | Step 2a: the build empties only `dist/etude/`, and `deploy` checks the Pages source and that its commit is the newest on `main`. |
| Gemini 4: the `scoreExtraBreaks` condition explains Moonlight. | Hypothesis | Step 1: verify before fixing. |
| Both reviews: migrate from a measured, green baseline. | Accepted. The suite was not green. | Step 0. |

## 10. What the tests don't cover

- **Pixel-level engraving changes** that keep every count the same. The Step 1 visual audit covers these, and Step 3 can add an optional screenshot pass.
- **Real devices:** the owner checks iOS PWA update behaviour and storage eviction by hand after Steps 2a, 2b and 3.
- **Audio** is headless on CI. Only the bytes of the recordings and their decoding are checked.
- **New golden scores** need both a `darwin` and a `linux` layout baseline. On CI a missing one fails the run, and the measured layout is in that run's `test-results` artifact (`<score>.linux.json`), ready to review and commit. `UPDATE_GOLDEN=1` on Linux works too.

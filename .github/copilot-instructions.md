# Copilot instructions for Étude

Étude is a piano theory trainer. The migration keeps `etude.html` as the stable shell URL while the app moves into Vite-built TypeScript modules. `sw.js`, `public/manifest.webmanifest` and `public/icons/` provide the installable, offline PWA shell. Node tooling builds the tested site into `dist/etude/` for GitHub Pages.

## Git, pushing and releases

- The owner pushes from a **different GitHub account, using GitHub Desktop**. The account Copilot runs as has read-only access to `Maurs9/etude`, so `git push`, deleting remote branches, opening PRs from this repo, and creating tags or releases on GitHub will fail with 403/404.
- Commit locally on the session branch, then tell the user the work is ready to push from GitHub Desktop. Don't retry pushes or try to work around the permission error.
- Several sessions often edit `etude.html` at the same time. Keep diffs tight and avoid unrelated reformatting or refactors, which cause merge conflicts.

### Releases

The project uses Git tags plus GitHub Releases, numbered with semver: `vMAJOR.MINOR.PATCH`.

- **PATCH** for fixes (e.g. accessibility fixes).
- **MINOR** for new features.
- **MAJOR** for incompatible changes, such as a backup or storage format that can't read older data.

Cut a release for a meaningful group of changes, not for every merge. The owner publishes it from their own account, either in GitHub's **Releases → Draft a new release** with **Generate release notes**, or with:

```sh
git tag -a v1.0.1 -m "Étude 1.0.1"
git push origin v1.0.1
gh release create v1.0.1 --generate-notes
```

If a release changes the service worker's caching rules, change `scripts/generate-sw.mjs` and run the worker tests. The generated worker changes automatically when published bytes change.

## Deployment

- GitHub Pages publishes from the Tests workflow (`.github/workflows/test.yml`), with the Pages source set to "GitHub Actions". When a push to `main` passes the tests, the `deploy` job publishes `dist/etude/` at https://maurs9.github.io/etude/. It fails if the Pages source is a branch, and skips publishing (with a warning) if `main` has moved on. To publish again, re-run the latest `main` run within a day, or use "Run workflow" on `main`. Don't add one of the Pages workflows GitHub suggests; it would publish the whole repo over this one.
- `scripts/build.mjs` publishes only the files listed in its `SITE_FILES`, byte for byte, plus an `index.html` that forwards `/etude/` to `etude.html`, then generates `sw.js` from that output. If the app starts loading another file, add it to `SITE_FILES`, or the live site and its hash-checked precache will be incomplete. `tests/deploy.spec.mjs` checks the published site under `/etude/`. Pages matches paths case-sensitively, unlike macOS, so a file name's letter case must match exactly; Linux CI catches a mismatch only in files the tests load.
- The generated worker installs atomically with `cache: 'no-cache'`, verifies SHA-256 hashes, keeps the previous active cache for one activation, and never caches a network navigation response. For an emergency rollback, follow `docs/sw-kill-switch.md` and deploy `scripts/sw-kill-switch.js` as `sw.js`; do not maintain a hand-written `VERSION` or `ASSETS` list.
- `npm run dev` serves the Vite source app at http://127.0.0.1:5173/etude.html. `npm run preview` builds the site and serves it at http://127.0.0.1:8778/etude/, the same paths as on Pages. `npm run build:standalone` also writes `dist/etude-standalone.html` for `file://`.

## Conventions in `etude.html`

- Any user-visible text or accessible name needs strings in both `en` and `ro` in the `STRINGS` object. Elements use `data-i18n`, `data-i18n-aria` and `data-i18n-title`, which `applyI18n()` applies. A test fails if a key is defined twice in one language.
- Views are routed by the URL hash through `show(view)`. Don't add plain `href="#..."` in-page links, because they change the route; use a click handler with `preventDefault()`.
- Keep accessibility intact:
  - Settings and Help are modal dialogs; the background is `inert` while either is open.
  - `show()` moves focus to the view heading when focus would otherwise be lost.
  - The mobile menu closes on Escape.
  - Small text must reach 4.5:1 contrast.

## Tests

```sh
npm ci
npm run typecheck
npm run lint
npm run test:unit
npm test            # Playwright against the built dist/etude site
npm run test:dev    # app project against Vite dev
PW_CHANNEL= npm test  # use bundled Chromium instead (after `npx playwright install chromium`)
```

- `playwright.config.mjs` serves on port **8787** with `reuseExistingServer` outside CI. If another worktree already serves 8787, `npm test` silently tests *that* worktree's `etude.html`. In that case, use a temporary, untracked config that imports `./playwright.config.mjs` and overrides `use.baseURL` and `webServer` to a free port. Run it with `npx playwright test -c <file>`, then delete the file.
- Never stop servers you didn't start; they may belong to the owner's other sessions.
- Add regression tests to `tests/app.spec.mjs`, following its existing style, and leave the full suite green.
- `tests/golden.spec.mjs` pins what must not change by accident: the piano recordings (byte hashes) and the engraving of the fixture scores (notes, systems, pages). When a change is meant to move a baseline, run `UPDATE_GOLDEN=1 npx playwright test golden`, review the JSON diff and commit it on its own, saying why. Layout baselines are per platform. Locally, a platform without one is reported, not failed; CI sets `GOLDEN_REQUIRE_PLATFORM=1`, so there it fails and the measured layout is in the run's `test-results` artifact.
- Tests that need a real service worker are tagged `@sw` and run in the `sw` project; all others run with service workers blocked.
- The keyboard dock starts hidden on a first visit, so tests that press on-screen piano keys open the app with `app.open({ dock: true })`.
- CI (`.github/workflows/test.yml`) runs the suite with Playwright's Chromium on every pushed branch and on pull requests. Merge a branch only when its run is green. On `main`, a green run also deploys the site (see Deployment).
- The architecture migration follows `docs/plans/2026-11-08-safe-migration-plan.md`. Keep migration work and feature work in separate PRs.
- During the migration, the monolithic implementation is `src/legacy/app.js`; self-hosted font subsets and styles are in `src/styles/` and `src/assets/fonts/`, piano recordings are in `src/assets/piano/`, and OSMD is `public/vendor/osmd-1.9.9.min.js`. No page request should go to Google Fonts. `scripts/split-etude.mjs` is deterministic and its join test must stay byte-for-byte green.
- Locale strings and lesson data are statically imported from `src/locales/`; `setLang()` remains synchronous. Add user-visible text to both `en` and `ro`, preserve `data-i18n*` attributes, and keep the locale parity and duplicate-key checks green.
- Storage reads belong in `src/domain/storage.ts`; keep the `ptt-v3` key and reader compatibility for older saves. Add storage fixtures and Vitest coverage when changing persisted data.
- `node_modules/` and `test-results/` are gitignored; never force-add them.

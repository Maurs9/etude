# Copilot instructions for Étude

Étude is a piano theory trainer. The whole app is one static file, `etude.html`, with no build step. `sw.js`, `manifest.webmanifest` and `icons/` provide the installable, offline PWA shell. Node tooling exists only for the Playwright tests.

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

If a release changes the service worker's caching rules, bump `VERSION` in `sw.js`.

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
npm test            # Playwright; uses installed Chrome
PW_CHANNEL= npm test  # use bundled Chromium instead (after `npx playwright install chromium`)
```

- `playwright.config.mjs` serves on port **8787** with `reuseExistingServer` outside CI. If another worktree already serves 8787, `npm test` silently tests *that* worktree's `etude.html`. In that case, use a temporary, untracked config that imports `./playwright.config.mjs` and overrides `use.baseURL` and `webServer` to a free port. Run it with `npx playwright test -c <file>`, then delete the file.
- Never stop servers you didn't start; they may belong to the owner's other sessions.
- Add regression tests to `tests/app.spec.mjs`, following its existing style, and leave the full suite green.
- `tests/golden.spec.mjs` pins what must not change by accident: the piano recordings (byte hashes) and the engraving of the fixture scores (notes, systems, pages). When a change is meant to move a baseline, run `UPDATE_GOLDEN=1 npx playwright test golden`, review the JSON diff and commit it on its own, saying why. Layout baselines are per platform; a platform without one (e.g. Linux CI) is reported, not failed.
- Tests that need a real service worker are tagged `@sw` and run in the `sw` project; all others run with service workers blocked.
- The keyboard dock starts hidden on a first visit, so tests that press on-screen piano keys open the app with `app.open({ dock: true })`.
- CI (`.github/workflows/test.yml`) runs the suite with Playwright's Chromium on every pushed branch and on pull requests. Merge a branch only when its run is green.
- The architecture migration follows `docs/plans/2026-11-08-safe-migration-plan.md`. Keep migration work and feature work in separate PRs.
- `node_modules/` and `test-results/` are gitignored; never force-add them.

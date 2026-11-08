# Goal: Étude architecture migration (Steps 2b, 3, 3b, 4, 5)

## User Request

"poti sa continui dupa ce, deci vreau tot in worktree de migration. goal sa am aplicata actualizata si functionala conform planului. toate teste sa functioneze si sa fie pe arhitectura noua (recomandata si scalabila)"

(Romanian: "Continue; I want everything in the migration worktree. Goal: the app updated and working according to the plan. All tests working, on the new (recommended, scalable) architecture.")

Interview answers:
- Q1: Steps 2b + 3 + 4 + 5 (atomic worker, Vite/TS split, strings, TypeScript domain modules). Step 1 (OSMD 2.2.1, needs scores the owner doesn't have yet) and Step 6 (Sight-Reading v3, a feature) are excluded.
- Q2: Step 5 goes all the way: `src/legacy/app.js` and the globals bridge are gone; everything lives in TypeScript domain modules.
- Q3: The goal ends on the local `migration` branch, green and tested, with no merge into `main`. At merge time the split is re-run on the latest `main` under a freeze.
- Q4: Include Step 3b (self-hosted fonts, full offline) and the `file://` standalone build (`etude-standalone.html`).
- Q5: Keep each step as its own commit (or commit group) in history: 2b, 3, 3b, 4, and each Step 5 domain. 2b must be extractable onto `main` early by cherry-picking its commits.

## Refined Goal

Working **only** in the git worktree `/Users/mmv3938/work/My projects/etude-migration` on branch `migration` (which starts from Step 2a, commit `32a184b`), implement Steps 2b, 3, 3b, 4 and 5 of `docs/plans/2026-11-08-safe-migration-plan.md` exactly as that plan specifies, so Étude becomes a Vite-built, TypeScript, modular static PWA. It must behave identically for users: same URLs under `/etude/`, same saved data (`ptt-v3` and other localStorage keys), same engraving and recordings goldens, offline support, and `file://` via a standalone build. Every existing test, rewritten where needed to the new architecture (no reliance on raw globals), must pass, alongside new unit tests. The plan document is the authoritative spec; where this goal and the plan differ, this goal's scope boundaries win.

## Acceptance Criteria

- [ ] AC1 — Location: all work is committed on local branch `migration` in `/Users/mmv3938/work/My projects/etude-migration`. `main`, `feat/migration-step-2a-deploy` and every other branch and worktree are untouched. Nothing is pushed.
- [ ] AC2 — Step 2b (plan §6 "Step 2b"): the build generates `sw.js` with a precache manifest of every published file and its SHA-256. Install is atomic and hash-checked with `cache: 'no-cache'`. Navigations are network-first (8 s), the network copy is never cached, and offline, timeout or an error response serve the active version's precached page. Unchanged-hash files are copied from existing `etude-` caches. The previous version's cache is kept until the next activation. Navigation preload is disabled. `scripts/sw-kill-switch.js` and its runbook exist. `tests/fixtures/sw-pre-migration.js` is a byte copy of today's `sw.js`. The `@sw` tests listed in the plan exist and pass: fresh install offline, upgrade from today's worker online then offline, interrupted upgrade, old tab survives activation, and kill switch with exactly one reload and no `etude-` cache or registration left. 2b's commits come first on the branch, directly after `32a184b`, and touch nothing from later steps, so they can be cherry-picked onto `main` alone.
- [ ] AC3 — Step 3: `scripts/split-etude.mjs` is deterministic, and a test proves that joining its output reproduces the pre-split `etude.html` byte for byte. Vite (`base: './'`), TypeScript and Vitest are dev dependencies. The OSMD 1.9.9 file ships as `public/vendor/osmd-1.9.9.min.js` and is loaded with `<script defer>` before the module, never through `import()`. The 30 piano samples are separate hashed MP3 files, fetched with the `res.ok` check and with the failure reset of `pianoBank.promise` and the status. A test aborts a warm-up sample request, then checks that Learn still plays. The boot guard (en/ro message with a Reload button) exists. The recordings golden checks the MP3s. While the bridge exists, its completeness and write-through tests pass.
- [ ] AC4 — Step 3b: Fraunces and Hanken Grotesk are self-hosted (latin and latin-ext subsets) and precached. No request goes to Google Fonts. The layout goldens are unchanged on darwin, and the Linux baselines are unchanged, or are regenerated only if CI requires it, with a written reason.
- [ ] AC5 — `file://`: the build also produces a single-file `etude-standalone.html` with everything inlined. A test opens it over `file://` and the app boots with no errors.
- [ ] AC6 — Step 4: `STRINGS` (en/ro) and the lesson content live in statically imported locale modules. `setLang()` stays synchronous. `applyI18n()` and the `data-i18n*` attributes are unchanged. A duplicate-key check (ESLint `no-dupe-keys` or equivalent) and an en/ro key-parity test pass.
- [ ] AC7 — Step 5 complete: storage (a typed `ptt-v3` reader tested against fixtures of older saves), pure theory, audio and the piano bank, notation (an OSMD adapter that owns `scorePatchOsmd`, with OSMD loaded only where needed) and views are TypeScript modules under `src/`. `src/legacy/app.js` and the bridge no longer exist. Tests use `window.__etude` (or imports) instead of raw globals. App code does not read app state through `window.<name>`. A lazy-load failure shows an en/ro reload prompt. Each domain is its own commit or commit group.
- [ ] AC8 — Quality gates, all green, run from the worktree: `npx tsc --noEmit` (strict for new modules), lint (ESLint, including boundary rules and `no-dupe-keys`), Vitest unit tests, and the full Playwright suite (`app` and `sw` projects) against the built `dist/`. The Vite dev server must not break the suite either. The golden spec passes with the darwin baselines unchanged. `tests/deploy.spec.mjs` passes against the Vite build under `/etude/`. Test count does not drop without a written reason for each removed test.
- [ ] AC9 — Behaviour preserved: the manifest's `id`, `start_url` and `scope` resolve to the same URLs. `etude.html` keeps its URL. Existing localStorage data loads unchanged. All user-visible text exists in both `en` and `ro`. The accessibility invariants in `.github/copilot-instructions.md` hold.
- [ ] AC10 — Docs: `.github/copilot-instructions.md`, `README.md` where affected, `i18n-extra-notes.md`, and the plan's status line are updated for the new architecture, covering structure, commands, where code lives, the generated worker in place of `VERSION`/`ASSETS`, and how to add a file.

## Scope Boundaries

**In scope:**
- Plan Steps 2b, 3, 3b, 4 and 5, the standalone `file://` build, tests, CI workflow updates needed to run the new gates, and docs.

**Out of scope:**
- Step 1 (OSMD 2.2.1 upgrade) and Step 6 (Sight-Reading v3).
- New features, UI redesigns, and changes to copy, except the boot guard and reload prompts the plan requires.
- Merging into or pushing to `main` or any remote, opening PRs, changing GitHub settings.
- Changing PR #5 or branch `feat/migration-step-2a-deploy`.
- Changing storage formats (no MAJOR change).

## Applicable Project Conventions

**Quality gate command:**
- Today: `npm test` (Playwright). The goal adds `npm run typecheck`, `npm run lint` and `npm run test:unit` (Vitest), and `npm test` must cover the built site. All must pass.
- Port caution: `playwright.config.mjs` reuses an existing server on 8787. The main checkout `/Users/mmv3938/work/My projects/etude` may already serve 8787. If 8787 is busy, use a temporary, untracked config that overrides `use.baseURL` and `webServer` to a free port, run it with `npx playwright test -c <file>`, then delete it. Never stop servers you didn't start.
- Golden updates: only via `UPDATE_GOLDEN=1 npx playwright test golden`, in their own commit, with the reason.

**Commit convention:**
- Conventional commits, `type(scope): [B] description` (≤72 chars) for the Builder and `chore(goal): [I] …` for the Inspector.
- Project override (owner, Q5): the Builder may make **several commits per iteration**, one per plan step or Step 5 domain, so steps stay separable. Each carries the `[B]` marker.
- Required trailers on every commit:
  - `Assisted-by: OpenAI:GPT-5.6 Luna` (Builder) or `Assisted-by: OpenAI:GPT-5.6 Sol` (Inspector)
  - `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`

**Guidelines:**
- `.github/copilot-instructions.md`: i18n en+ro for all user-visible text, hash routing via `show()`, accessibility invariants, the tests' conventions, `@sw` tagging, `app.open({ dock: true })`.
- `docs/plans/2026-11-08-safe-migration-plan.md`: the authoritative spec for each step, including the invariants in §4 and the review findings in §9.

**Rules:**
- Never `git push`. The Copilot account is read-only, and the owner pushes with GitHub Desktop.
- Don't force-add `node_modules/`, `dist/` or `test-results/`.
- Keep `manifest.webmanifest` URLs and the `etude-` cache prefix.
- Never run a destructive command against paths outside the worktree.

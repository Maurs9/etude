# AGENTS.md

## 1. Project Overview

Étude is a browser-based piano theory and practice trainer with sight-reading, ear training, score playback, MIDI input, and device-local progress. It is a static, offline-capable PWA: Vite builds the stable `etude.html` shell and TypeScript modules for GitHub Pages. Preserve the separation between pure music logic, browser infrastructure, view orchestration, and versioned persistence; no backend or server database exists.

## 2. Environment & Commands

Run commands from the repository root.

- Use Node.js 22, matching CI; use a recent 22.x release compatible with the locked dependencies.
- Use npm and the committed `package-lock.json`; no alternative package-manager lockfiles.
- Current manifest ranges: TypeScript `^6.0.3`, Vite `^8.3.6`, Vitest `^5.1.0`, ESLint `^10.14.0`; Playwright is pinned to `1.65.0`. Treat the lockfile as authoritative.
- Python 3 supports translation-framework tooling.
- Playwright defaults to installed Google Chrome. For bundled Chromium, install it and set `PW_CHANNEL=''`.
- Use localhost or HTTPS for microphone, service-worker, and device-permission flows.

| Task | Command |
| --- | --- |
| Install locked dependencies | `npm ci` |
| Start development server | `npm run dev` |
| Build GitHub Pages site | `npm run build` |
| Build site plus standalone HTML | `npm run build:standalone` |
| Build and preview Pages layout | `npm run preview` |
| Type-check and enforce suppression guard | `npm run typecheck` |
| Run additional strict compiler check used in CI | `npx tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --types node` |
| Lint | `npm run lint` |
| Run all unit tests | `npm run test:unit` |
| Run one unit test file | `npm run test:unit -- tests/unit/theory.test.mjs` |
| Run supplementary localization tests | `npm run test:i18n` |
| Run all built-site E2E tests, including service workers | `npm test` |
| Run one built-site E2E file | `npm test -- tests/e2e/app.spec.mjs` |
| Run E2E against development server | `npm run test:dev` |
| Run one development E2E file | `npm run test:dev -- tests/e2e/app.spec.mjs` |
| Install bundled browser | `npx playwright install chromium` |
| Run E2E with bundled browser | `PW_CHANNEL='' npm test` |
| Regenerate locale modules | `node scripts/split-locales.mjs` |
| Verify generated locale modules | `node scripts/split-locales.mjs --check` |
| Check dependency versions | `npm run deps:check` |
| Verify OSMD contract and check updates | `npm run osmd:check` |
| Measure production performance | `PW_CHANNEL='' npm run perf:baseline` |

URLs and outputs:

- Development: `http://127.0.0.1:5173/etude.html`.
- Preview: `http://127.0.0.1:8778/etude/`.
- Production site: `dist/etude/`.
- Standalone file: `dist/etude-standalone.html`, opened with `file://`.
- Playwright starts its own server on port `8787`. Use a free port with `ETUDE_PORT=8788 npm test` when another checkout owns the default port.
- Before `npm run test:dev`, run `npm run build:standalone`; standalone specs require that artifact even when testing the development server.
- Run the complete automated validation with `npm run typecheck && npm run lint && npm run test:unit && npm run test:i18n && npm run build && npm test && npm run test:dev`.

Use a full-history checkout for unit tests: `tests/unit/split-etude.test.mjs` reads the immutable `32a184b:etude.html` anchor.

## 3. Directory Map

| Location | Ownership |
| --- | --- |
| `etude.html` | Stable HTML shell, view containers, semantic markup, localization attributes. Preserve existing IDs and routing hooks. |
| `src/domain/views-runtime.ts` | Browser entry, view orchestration, application state, event wiring, and feature integration. |
| `src/domain/views.ts` | Typed DOM, state, event, callback, and browser-surface contracts. |
| `src/domain/dom.ts` | Typed DOM access and browser lifecycle helpers. |
| `src/domain/theory.ts`, `router.ts` | Browser-independent music calculations and route resolution. |
| `src/domain/storage.ts` | `ptt-v3` schema, validation, adapters, settings, and ordered migrations. |
| `src/domain/data-safety.ts` | Persistent-storage requests and automatic IndexedDB backups. |
| `src/domain/score-library-*.ts` | Imported-score types, IndexedDB persistence, and library UI. |
| `src/domain/audio.ts` | Sample loading, Web Audio, piano voices, metronome, and recovery. |
| `src/domain/notation.ts`, `score-*-markings.ts` | OSMD adapter, score conversion, and notation-specific processing. |
| `src/domain/midi-timing.ts` | Input timestamps and latency calibration. |
| `src/domain/technique*.ts`, `feedback.ts` | Technique exercises and answer-aware feedback. |
| `src/sight-reading/` | Generators, levels, patterns, evaluation, recording, attempt ledger, progression, books, and warm-ups. |
| `src/types/`, `src/vite-env.d.ts` | Shared architecture types and Vite declarations. |
| `src/locales/index.js`, `content.ts`, `score-library.ts` | Authoritative locale aggregates; edit these before regenerating payloads. |
| `src/locales/ui-*.ts`, `learn-*.ts`, `catalog.ts` | Generated locale payloads and lightweight lesson catalog. |
| `src/locales/loader.ts`, `library-runtime.ts` | On-demand locale loading and installed library copy. |
| `i18n/` | Supplementary locale packs, translation tooling, and localization tests. |
| `src/styles/` | Shared and feature-specific CSS. |
| `src/assets/fonts/`, `src/assets/piano/` | Self-hosted fonts and piano recordings. |
| `public/` | Manifest, icons, and pinned OSMD vendor bundle copied into the build. |
| `scripts/` | Build, service-worker generation, quality gates, dependency maintenance, and performance tooling. |
| `tests/unit/` | Node-environment Vitest tests, named `*.test.mjs`. |
| `tests/e2e/` | Playwright integration and browser tests, named `*.spec.mjs`. |
| `tests/helpers/` | Shared browser fixtures and score-audit helpers. |
| `tests/fixtures/`, `tests/golden/` | Input fixtures, storage compatibility records, and reviewed baselines. |
| `docs/plans/`, `docs/runbooks/`, `docs/performance/` | Architecture plans, device/recovery procedures, and benchmark evidence. |
| `.github/workflows/test.yml` | Validation and GitHub Pages deployment. |

Keep new UI behavior in the existing DOM/view architecture. Do not invent React components, API routes, ORM schemas, or server infrastructure.

## 4. Code Style & Conventions

### TypeScript and module boundaries

- Write new application logic in strict TypeScript; target ES2022 with ES modules.
- Use descriptive `camelCase` functions and variables, `PascalCase` types, and `UPPER_SNAKE_CASE` constants. Match nearby feature prefixes where established.
- Use kebab-case module filenames and existing `.js` import specifiers in TypeScript source.
- Keep imports at module scope; use `import type` for type-only dependencies. Follow surrounding grouping and preserve CSS side-effect import order.
- Preserve local formatting, generally two-space indentation, single quotes in handwritten code, and semicolons. Avoid repository-wide reformatting.
- Use narrow interfaces and discriminated unions. Receive untrusted values as `unknown` and validate before use.
- Do not introduce explicit or indirect `any`, `@ts-nocheck`, or `@ts-ignore`. Avoid new `@ts-expect-error`; never weaken the suppression guard.
- Keep dependency graphs acyclic. Do not restore `src/legacy/` or global bridges.

### Ownership and state

- Keep `theory.ts` and `router.ts` free of browser globals and dependencies on audio, storage, notation, or views.
- Pass storage adapters explicitly; do not access `window` or `document` inside `storage.ts`.
- Keep audio and notation infrastructure independent of view modules.
- Put reusable calculations in their owning domain rather than expanding the view runtime.
- Use the contracts in `views.ts` and typed helpers in `dom.ts`; avoid scattered DOM casts.
- Keep state in its owning module and pass explicit dependencies or callbacks. Do not add a state-management framework.
- Preserve `window.__etude` as the deliberate browser test/import surface; application logic must not use it as an internal state bus.
- Route navigation through `show(view)` and the router. Preserve the Today fallback for unknown hashes.
- For in-page actions, prevent default hash navigation; arbitrary `href="#..."` links can change the active view.

### Errors, localization, and UI

- Prefer early validation and explicit error paths. Never report a successful save or import after storage failure.
- Check `response.ok` before decoding fetched resources. Clear pending failure state so loading can retry.
- Add visible and accessible copy to authoritative locale dictionaries; keep string keys complete across `en`, `ro`, `de`, `es`, `fr`, `it`, and `pt-BR`.
- Preserve placeholders, musical identities, lesson functional attributes, and independent language/notation settings.
- Regenerate locale modules after aggregate changes. Preserve on-demand UI and Learn loading, atomic language installation, and retry after rejected loads.
- Do not eagerly import the full locale aggregates into the browser runtime.
- Preserve `data-i18n`, `data-i18n-aria`, and `data-i18n-title`.
- Put feature styles in feature CSS files; preserve the order-sensitive shared cascade.
- Preserve dialog background `inert`, focus recovery on view changes, Escape behavior, keyboard access, and 4.5:1 contrast for small text.

## 5. Testing Requirements

- Add behavioral unit tests for new domain logic and regression tests for bug fixes.
- Add Playwright coverage for changed user flows, browser integration, persistence, routing, or accessibility.
- Use a focused feature spec; extend `tests/e2e/app.spec.mjs` for shared application behavior.
- Skip new tests for documentation-only changes unless executable examples or tooling behavior change.
- Reuse `tests/helpers/fixtures.mjs`. Open with `app.open({ dock: true })` when interacting with on-screen piano keys.
- Assert observable outcomes and uncaught-error absence. Use Playwright waiting/assertions instead of fixed sleeps.
- Mock external boundaries through existing adapters: storage, audio context, clocks, device events, and resource loading. Keep domain calculations real.
- Use deterministic seeds and controlled time for generated pieces, daily sets, scoring, and timing tests.
- Restore mocks, timers, handlers, and browser state between tests.
- For persistence changes, cover old saves, malformed input, future schemas, write/quota failures, and backup/restore behavior.
- For asynchronous input changes, cover cancellation, reconnection, duplicate events, and attempt-claim races where relevant.
- Tag real service-worker tests `@sw`; the `sw` project permits workers, while the `app` project blocks them.
- Keep golden audio hashes and score semantics/layout stable. For an intentional baseline change, run `UPDATE_GOLDEN=1 npx playwright test golden`, inspect the JSON diff, and commit the baseline separately with a reason.
- Preserve Linux layout coverage required by `GOLDEN_REQUIRE_PLATFORM=1` in CI.
- For storage, offline, audio, or MIDI changes, report the remaining physical-device check in `docs/runbooks/device-smoke.md`. Do not claim hardware verification from browser emulation.

## 6. Agent Guardrails

### Protected files and artifacts

- Never hand-edit `dist/`, generated `sw.js`, generated locale payloads, `node_modules/`, or test-result artifacts.
- Change service-worker behavior in `scripts/generate-sw.mjs`; derive cache identity and asset inventory from final build bytes.
- Never add handwritten `VERSION`, `ASSETS`, or `SITE_FILES` lists.
- Preserve piano recordings and the pinned OSMD bundle during unrelated work.
- Never rewrite historical storage migrations or the pre-split invariant anchor. Append a migration when persisted format changes.
- Never hand-edit `package-lock.json`. Update it through npm only for an intentional dependency change.
- Never commit credentials, `.env` secrets, personal score libraries, or user backup exports.
- Do not force-add ignored files or overwrite another session's changes.

### Dependencies and architecture

- Ask before introducing a runtime dependency, UI framework, state library, backend, analytics service, or external CDN unless the task explicitly authorizes it.
- Prefer native browser APIs, including `fetch`, and existing adapters.
- For authorized maintenance, use `npm run update:deps` or `npm run update:osmd`; inspect resulting lockfile, vendor, and contract changes.
- Keep architecture migrations separate from feature work.
- Do not relax lint, type, architecture, fixture, or golden checks to make a change pass.

### Data safety and security

- Preserve the `ptt-v3` key and older-save compatibility.
- Append format upgrades to `PTT_MIGRATIONS` in `storage.ts`; add fixture coverage for the resulting schema.
- Route progress writes through `syncWrite` or `storeApplyBackup` in the view runtime; preserve the newer-schema write block.
- Preserve snapshots before destructive data operations and the rolling automatic-backup policy.
- Keep imported originals, score-library transfers, and general progress backups distinct.
- Validate complete imports before writes; retain file-size limits and atomic transaction behavior.
- Treat imported titles, metadata, JSON, MIDI, and MusicXML as untrusted. Escape user text before HTML insertion.
- Do not add `eval`, `new Function`, or encoded application-runtime payloads.
- Keep progress, recordings, and imported files on the device unless the user explicitly requests a remote feature.

### Performance and delivery

- Keep fonts and piano samples self-hosted; do not request Google Fonts.
- Keep OSMD lazy-loaded through `notation.ts`; do not access vendor internals from views.
- Keep audio construction and scheduling in `audio.ts`; preserve input event timestamps and latency calibration.
- Clean up timers, voices, subscriptions, and pending work when sessions stop or views change.
- Preserve relative asset paths, exact filename casing, the `/etude/` deployment layout, and standalone `file://` behavior.
- For performance work, compare equivalent profiles using `docs/performance/README.md`; run benchmarks without concurrent builds or browser suites.
- Never stop a server you did not start. Avoid concurrent builds that write the same `dist/` directory.
- Follow `.github/copilot-instructions.md`: the owner pushes through GitHub Desktop from another account. Keep completed work local; do not retry denied pushes or work around repository permissions.
- Do not add another Pages deployment workflow. The existing Tests workflow publishes only after all required jobs pass.

## 7. Workflow Protocol

1. **Understand:** Read this file, applicable nested instructions, `.github/copilot-instructions.md`, relevant code, tests, and plans. Inspect `git status`; preserve unrelated work. Use executable configs and tests to resolve stale documentation.
2. **Plan:** Identify the owning modules, behavior change, compatibility risks, and required checks. Keep scope limited to the requested task.
3. **Implement:** Add the regression test when applicable, make the smallest coherent change, update authoritative inputs, and regenerate derived files through their scripts.
4. **Type-check and lint:** Run `npm run typecheck` and `npm run lint`; fix causes without weakening gates.
5. **Test:** Run focused tests first, then unit, localization, build, built-site E2E, and development E2E checks. Build standalone output before development E2E. Run relevant golden, worker, and locale-generation checks.
6. **Review:** Inspect the final diff and `git diff --check`. Confirm compatibility, asset paths, localization, and absence of generated artifacts or accidental dependency changes.
7. **Complete:** Report what changed, commands run, results, and remaining device checks or blockers. Do not claim unrun checks passed. Keep commits scoped on the local session branch and tell the owner when work is ready for GitHub Desktop.

# Étude — Piano Theory Trainer

Étude is a browser-based piano theory and practice app for developing your ear, reading skills, and keyboard technique. It is a static Vite application: `etude.html` remains the stable shell URL, while the app module, styles, piano recordings, and OSMD bundle are built from `src/`.

**Live app:** [https://maurs9.github.io/etude/etude.html](https://maurs9.github.io/etude/etude.html)

## Features

- Theory handbook, reading exercises, and score study
- Targeted drills, accompaniment, sight-singing, and ear training
- Free play, progress tracking, and practice planning
- USB MIDI and direct Web Bluetooth MIDI support for compatible digital pianos and keyboards
- Local browser storage for settings and progress, with backup export and import
- Installable app shell (PWA) with offline support and Screen Wake Lock after an initial online visit

## Digital piano and MIDI keyboard setup

1. Open [https://maurs9.github.io/etude/etude.html](https://maurs9.github.io/etude/etude.html) in **Google Chrome** or **Microsoft Edge** (Android, Windows, or macOS).
2. In **Settings → App & screen**, click **Install** to install Étude as a standalone offline app and enable **Keep the screen on**.
3. Connect your piano:
   - **Bluetooth MIDI (wireless):** If your piano or keyboard supports Bluetooth MIDI, turn it on (disconnect the instrument from other apps first), then go to **Settings → Bluetooth MIDI (direct) → Connect**.
   - **USB MIDI (wired):** Connect the piano's **USB to Host** port to your device via USB-C; it will appear automatically under **Settings → MIDI input**.

## Run locally

Install the locked toolchain and start Vite:

```sh
npm ci
npm run dev
```

Open [http://localhost:5173/etude.html](http://localhost:5173/etude.html). Serving over localhost or HTTPS is recommended for browser features such as the service worker and microphone access; permissions may be required.

The Pages-shaped build is available with `npm run build` and `npm run preview`.
For a single offline file, run `npm run build:standalone`; it writes
`dist/etude-standalone.html`, which can be opened directly with `file://`.

## Tests & Dependency Maintenance

The test suite uses Node.js, npm, Python 3, Vitest, and Playwright. By default Playwright launches an installed Google Chrome browser.

```sh
npm ci
npm run typecheck
npm run lint
npm run test:unit        # Vitest unit tests (tests/unit/)
npm run test:i18n        # Multi-language i18n pack tests (i18n/tests/)
npm test                 # Playwright E2E against built dist/etude/ and @sw tests
npm run test:dev         # Playwright app project against the Vite dev server
npm run deps:check       # Check npm devDependencies + runtime vendor versions
npm run osmd:check       # Verify OSMD bundle contract and check npm for updates
```

Alternatively, install Playwright's Chromium with `npx playwright install chromium` and set `PW_CHANNEL` to an empty value before running the tests. The Playwright configuration starts its own local server on port 8787.

## Project structure

- `etude.html` — stable application shell
- `src/domain/` — strict TypeScript modules (`views.ts`, `views-runtime.ts`, `router.ts`, `storage.ts`, `theory.ts`, `audio.ts`, `notation.ts`, `dom.ts`)
- `src/locales/` — synchronously imported English/Romanian strings, lesson content, quizzes, and locale data
- `src/styles/`, `src/assets/fonts/`, `src/assets/piano/` — self-hosted font subsets, styles, and separate hashed piano recordings
- `public/vendor/osmd-2.3.0.min.js`, `public/manifest.webmanifest`, `public/icons/` — static public assets and lazy-loaded OSMD 2.3.0 bundle
- `i18n/` — supplementary multi-language pack (`de`, `es`, `fr`, `it`, `pt-BR`), runtime (`i18n/framework/`), and test suite (`i18n/tests/`)
- `scripts/` — build (`build.mjs`, `build-standalone.mjs`, `generate-sw.mjs`), quality gates (`check-ts-suppressions.mjs`), emergency rollback (`sw-kill-switch.js`), and safe dependency updaters (`update-deps.mjs`, `update-osmd.mjs`)
- `tests/` — organized into:
  - `tests/unit/` — Vitest unit and architecture invariant tests (`*.test.mjs`)
  - `tests/e2e/` — Playwright E2E and golden score/audio tests (`*.spec.mjs`)
  - `tests/e2e/sight-reading/` — Sight-Reading Playwright E2E specs
  - `tests/helpers/` — shared Playwright fixtures and score audit helpers
  - `tests/fixtures/` & `tests/golden/` — MusicXML/MXL fixtures and golden baselines
- `docs/` — organized into `docs/i18n/`, `docs/plans/`, and `docs/runbooks/`
- `TODO.md` — roadmap checklist and dependency inventory

`npm run typecheck` runs the strict compiler gate for the typed domain modules.
The view entry is a compatibility boundary while the remaining legacy-shaped
view operations are narrowed incrementally; it is still checked for forbidden
compiler bypasses and indirect `any` aliases. The suppression guard
rejects `@ts-nocheck`, `@ts-ignore`, unexplained or excessive
`@ts-expect-error`, explicit `any`, unchecked application JavaScript, and
encoded or dynamically compiled application runtime payloads.

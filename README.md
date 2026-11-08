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

## Tests

The test suite uses Node.js, npm, Python 3, and Playwright. By default it launches an installed Google Chrome browser.

```sh
npm ci
npm run typecheck
npm run lint
npm run test:unit
npm test                 # built dist/etude/ and @sw tests
npm run test:dev         # app project against the Vite dev server
```

Alternatively, install Playwright's Chromium with `npx playwright install chromium` and set `PW_CHANNEL` to an empty value before running the tests. The Playwright configuration starts its own local server on port 8787.

## Project structure

- `etude.html` — stable application shell
- `src/domain/views.ts` — TypeScript application/view runtime and browser test surface
- `src/domain/router.ts` — hash-route groups and safe fallback
- `src/locales/` — synchronously imported English/Romanian strings, lesson content, quizzes, and locale data
- `src/domain/storage.ts` — typed `ptt-v3` reader, writer, and settings normalization
- `src/domain/theory.ts` — strict, browser-independent pitch, scale, chord, interval, and formula helpers
- `src/domain/audio.ts` — strict Web Audio engine, voices, checked piano-sample fetch/decode, and retry-safe piano bank
- `src/domain/notation.ts` — lazy OSMD/MXL adapter, constructor boundary, and grouped pedal patch
- `window.__etude` — deliberate browser test/import surface; application state is not read through arbitrary `window.*` aliases
- `src/styles/`, `src/assets/fonts/`, `src/assets/piano/` — self-hosted font subsets, styles, and separate hashed recordings
- `public/vendor/`, `public/manifest.webmanifest`, `public/icons/` — static public assets
- `scripts/build.mjs`, `scripts/generate-sw.mjs` — Vite build and generated hash-checked worker; add a source import or a file under `public/` and the published manifest updates automatically
- `scripts/sw-kill-switch.js`, `docs/sw-kill-switch.md` — emergency worker rollback and runbook
- `tests/`, `playwright.config.mjs` — Playwright tests and configuration
- `package.json`, `package-lock.json` — test tooling and locked dependencies

All TypeScript under `src/` is checked with the compiler's full `strict` mode.
Keep browser-only DOM wiring in the view domain and keep storage, theory,
audio, notation, and routing behavior behind their typed module boundaries.

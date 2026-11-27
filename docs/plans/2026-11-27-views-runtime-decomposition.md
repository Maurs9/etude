# Architecture Plan: Gradual Decomposition of `views-runtime.ts`

## 1. Current Baseline

- **Total TypeScript in `src/`:** 99,205 lines across 107 files:
  - Application code (`src/domain/`, `src/sight-reading/`, `src/types/`): 49,133 lines.
  - Localization dictionaries and generated payloads (`src/locales/*.ts`: `content.ts`, 8×`ui-*.ts` [`ui-base.ts` + 7 languages], 7×`learn-*.ts`): 50,072 lines — **out of scope** (already lazy-loaded through `src/locales/loader.ts`).
- `src/domain/views-runtime.ts`: 23,561 lines (48% of non-locale TS, 24% of all TS).
- **Production build baseline (`npm run build`, without `--test-surface`):** recorded in Phase 0 from `dist/etude/assets/*.js` (`etude-*.js` currently ~536 kB minified / ~185 kB gzip, exceeding Vite's 500 kB chunk warning).
- **Existing test suite:** 73 unit test files (`tests/unit/*.test.mjs`) and 82 Playwright E2E specs (67 in `tests/e2e/` + 15 in `tests/e2e/sight-reading/`).

### Map of `src/domain/views-runtime.ts`

| Area | Lines | Size | Layer / Target | Lazy-loadable? |
|---|---:|---:|---|---|
| Imports + `ensureAnalysisModules` | 1–349 | ~350 | Shell / loader | No |
| Data / Theme / i18n / Helpers / Audio facade / `stopPreviews` | 350–708 | ~360 | Shell / core | No |
| Accompaniment Loop + Play Along UI | 709–848, 21577–22366 | ~930 | Feature (`practice`) | Yes |
| Voice (Mic + Transcribe + Sight-Singing) | 849–1797 | ~950 | Feature (`voice`) | Yes |
| Keyboard + Dock + Input Routing (`pointerKey` L1960, `handleNoteOn` L2146, `typingDown` L2969) | 1798–2335 | ~540 | Shell UI + Input bus | No |
| Web MIDI + BLE MIDI + Timing Calibration | 2336–2578 | ~245 | Infra hardware | Partial |
| PWA / Install / Fullscreen / Wake Lock | 2579–3061 | ~480 | Infra browser | No |
| Grading Core + Item Model + SRS (`StoredTrainerData` L3115, `data` L3167) | 3062–3278 | ~215 | Core (`srs`) + Shell (`data`) | No |
| Session Engine (quiz, ear-on-keys, `techniqueHost` L3524, feedback) | 3279–4484 | ~1,205 | Feature (`practice`) | Yes |
| Router (`show`) + Today + Explore + Circle + Songs + Practice-Hints wiring (`L5487–5710`) | 4485–5710 | ~1,225 | Shell + `explore`/`today`/`practice` | Explore/Songs/Hints: Yes |
| Learn v4 (handbook, quizzes, staves, glossary) | 5711–7029 | ~1,320 | Feature (`learn`) | Yes |
| Read & Play (Sight-reading player engine, `srtPendingSaveProtected` L7801) | 7030–8834 | ~1,805 | Feature (`read`) | Yes *(ledger/flow + pendingSave mirror stay eager)* |
| Reading Drills v3 (CMRT, stream, rhythm, stage) | 8835–11560 | ~2,725 | Feature (`read` / `practice`) | Yes |
| Read Home (`L11561–12762`) + Coaching (`L12763–13208`) | 11561–13208 | ~1,650 | Feature (`read`) + Shell coaching | Read Home: Yes / Coaching: Shell |
| Score & Analysis Player (`AN`, `SCORE`, `FALL`, `SIDE`, `PRAC`) | 13209–19694 | ~6,485 | Feature (`score-player`) | Yes (largest bundle win) |
| Progress + Today Plan + Practice Setup + Summary (`melDemoTimer` L19923) | 19695–20456 | ~760 | Feature (`progress`/`today`/`practice`) | Partial |
| Persistence + Multi-Tab 3-Way Sync (`SYNC`, `STORE`, `syncWrite`, `storeApplyBackup`) | 20457–21334 | ~880 | ~180 lines global-free merge + ~700 lines shell orchestration (high-risk) | No |
| Wiring + Boot + Settings UI | 21335–21576 | ~240 | Shell | No |
| Test Surface (`window.__etude`, `DEV \|\| __ETUDE_TEST_SURFACE__`, setters `L23518–23546`) | 22367–23561 | ~1,195 | Dev/Test bridge | Dead-code eliminated in prod |

---

## 2. Target Architecture: Layered Feature-Slice Without Mass File Moves

- **Keep existing `src/domain/` and `src/sight-reading/` modules in place:** avoids import churn and preserves `scripts/build.mjs` `manualChunks` matchers. Boundaries are enforced by path in `eslint.config.mjs`.
- **Place newly extracted modules into explicit layers:**
  - `src/core/` — browser-independent logic (no DOM/browser globals, Node unit-testable: `sync-merge.ts`, `srs.ts`, `pitch-match.ts`).
  - `src/infra/` — browser/device adapters (`pwa-lifecycle.ts`, `midi-controller.ts`).
  - `src/features/<feature>/` — lazy-loaded vertical slices (`explore`, `voice`, `learn`, `score-library`, `score-player`, `practice`, `read`, `today`, `progress`).
  - `src/app/` — shell modules (`test-surface-wiring.ts`, `coaching.ts`, `keyboard-dock.ts`, `input-bus.ts`).
- **Extend existing contracts in `src/domain/views.ts`** (including `EtudeSurface` and exported `StoredTrainerData`) instead of introducing a parallel contracts file.
- **No external runtime dependencies or UI/state frameworks.** Preserve `etude.html`, standalone `file://` builds, atomic Service Worker precaching, and CSP.

### Critical Technical Invariants

1. **Test surface vs. lazy-loading (`window.__etude`):**
   - `TestSurfaceRegistry` (`createTestSurfaceRegistry` in `src/domain/views.ts`) supports `{ get, set? }` and `{ value }` descriptors on `EtudeSurface`.
   - Inside `if (import.meta.env.DEV || __ETUDE_TEST_SURFACE__)`, `views-runtime.ts` loads `src/app/test-surface-wiring.ts` via **dynamic `await import('../app/test-surface-wiring.js')`** (before clearing `data-app-pending`).
   - In production builds (`DEV === false && __ETUDE_TEST_SURFACE__ === false`), Vite/Rolldown dead-code-eliminates the guard and never bundles `test-surface-wiring.ts`, keeping features strictly lazy.
   - **Zero top-level side effects:** every feature module must avoid DOM queries and event listeners at import time; DOM binding happens exclusively inside `mount(host)` (called once per loaded module before its first `enter()`).
   - **Production lazy-path smoke test:** `tests/e2e/deploy.spec.mjs` builds and serves the production site **without `--test-surface`** and navigates across every view to ensure broken production `import()` paths are caught by CI.
   - `vite.config.mjs` (`APP = resolve(ROOT, 'src/domain/views-runtime.ts')` + `window.__etudeBooted?.()`) stays intact.
2. **Backward-compatible `show()` overload:** `ShowFn` accepts both the existing positional arguments `(view, moveFocus?, fromHistory?, analysisRoute?)` and `(view, opts: ShowOptions)` (with `openFile?: File` for Voice → Pieces `trxOpenInPieces` L1159), avoiding breakage across 40 internal callers and `__etude.show`.
3. **Async `enter()` cancellation:** `enter(params, signal: AbortSignal)` receives an `AbortSignal` aborted automatically on `leave()` or a newer `show()`. Async features (e.g., `loadLearn()`) must check `signal.aborted` after every `await`.
4. **Multi-subscriber input fan-out:** `handleNoteOn` (`L2146`) keeps physical tracking (`held`, `heldOrder`, `sustained`, `inputOwners`, `midiChannels`, `midiSustainOwners`, `pointerKey` L1960, `typingDown` L2969, `pedalDown`, `releaseFocusInput`, `audioNoteOn`, `kbPress`, `wakePing`) in the shell and fans out events to subscribers via `host.input.subscribe(...)`.
5. **`AGENTS.md` persistence guardrail:** `syncWrite` (`L20803`) and `storeApplyBackup` (`L20970`) remain physically in `views-runtime.ts` as the write gateway over `src/core/sync-merge.ts`.
6. **`srtPendingSaveProtected()` mirror:** `show()` calls `srtPendingSaveProtected()` synchronously (`L4663`/`L4717`), reading in-memory `SR.srtState`/`SR.srtPendingAttempt` (`L7801–7804`). Before moving `SR` into `src/features/read/`, the shell owns a lightweight `pendingSave` mirror updated by `read` via `host.nav.setPendingSave(boolean)`.
7. **`uiPrefs.set(patch)`:** triggers `saveSoon()` by default (`{ save?: 'soon' | 'now' | 'none' }`) so `scoreLook`, `scoreHl`, `scoreLayout`, `scoreFallMode`, `scoreLayoutExplicit`, and `anSide` persist reliably without forcing `score-player` to load for `syncPayload()`.
8. **Boundary tests move with code:** assertions in `tests/unit/domain-boundaries.test.mjs` targeting source text in `views-runtime.ts` are moved/extended to cover extracted modules — never deleted.

---

## 3. Shared Mutable State Ownership Table

Rule: **one single owner mutates directly** (with one documented pragmatic exception for `data`); all other consumers read via getters or issue commands through `AppHost`.

| State (current line) | Target Owner | Writers | Readers | Persistence (`syncPayload` L20802 / other) |
|---|---|---|---|---|
| `data` (`StoredTrainerData`, L3115/3167) | Shell (`views-runtime.ts`) | **Documented pragmatic exception:** `host.store.data()` returns the mutable record (38 direct `data.x = ...` writes) followed by `saveNow()`/`saveSoon()`; all disk writes route through `syncWrite`/`storeApplyBackup` in shell | All features | `ptt-v3` (`data`) |
| `SYNC` (L20488), `SYNC_PREFS` (L20501), `STORE` (L20842), `reloadingForRestore` (L20799), `_saveT` (`saveSoon`/`flushSaveSoon` L20832–20840) | Shell (`views-runtime.ts`) + global-free merge in `src/core/sync-merge.ts` | Shell persistence gateway only | `syncPayload`, cross-tab `storage` listener, `__etude` | `ptt-v3` (`gen`, `syncId`, `syncParent`, `syncMerge`, `pend`) |
| `lang` (L376), `theme` (L357), `notation` (L355), `labelMode` (L1801) | Shell (`views-runtime.ts`) | Settings UI / `SYNC_PREFS` (deferred while `syncBusy()`) | All features via `host.i18n` | `ptt-v3` (`lang`, `theme`, `notation`, `labels`) |
| `audioEngine` fields (`tone`, `masterVolume`, `muted`, `localSynth`, `reverbWet`) + `pianoBank` (L604) | `src/domain/audio.ts` | `audioEngine` / Settings | `syncPayload`, features via `host.audio` | `ptt-v3` (`tone`, `masterVol`, `muted`, `localSynth`, `reverb`) |
| `metro` (L606) + drone | Shell / `audio.ts` (`host.metro`) | `host.metro` / Settings | `syncPayload` (`metro.bpm`), `read`, `practice` | `ptt-v3` (`bpm`, `drone`) |
| `DOCK` (L2024) | `src/app/keyboard-dock.ts` (shell) | `host.dock` | `syncPayload` (`DOCK.pref`), all views | `ptt-v3` (`kbDock`) |
| `held`, `heldOrder`, `sustained`, `inputOwners`, `midiChannels`, `midiSustainOwners`, `pedalDown` (L2142–2211), `pointerKey` (L1960), `typingDown` (L2969) | `src/app/input-bus.ts` (shell) | `input-bus` (`handleNoteOn` L2146, `handleNoteOff`, `releaseLiveInput`, `releaseFocusInput`) | `host.input` subscribers, dock, `srtRecorder` | Not persisted |
| `_modalStack` (L4490), `_routed` (L4854), `featureNavigation`, `focusView` (L4582), `pendingSave` mirror | Shell (`views-runtime.ts`) | Shell (`show()`, dialogs, `popstate`, `host.nav.setPendingSave`) | `overlaysOpen()`, `Escape`, `handleNoteOn`, `show()` | Not persisted |
| `WAKE` (L2826) | `src/infra/pwa-lifecycle.ts` | `pwa-lifecycle` via `host.wake` | `syncPayload` (`WAKE.want`), Settings | `ptt-v3` (`wake`) |
| `BLE` (L2555), `savedDevice` (L2337), `savedDeviceName` (L2338) | `ble-midi.ts` + `src/infra/midi-controller.ts` | `midi-controller` | `syncPayload` (`device`, `deviceName`, `ble`), Settings | `ptt-v3` (`device`, `deviceName`, `ble`) |
| `uiPrefs` (shell snapshot): `scoreLook`, `scoreHl`, `scoreLayout`, `scoreFallMode`, `scoreLayoutExplicit` (L13829), `anSide` (`open`/`tab`/`w`) | Shell (`host.store.uiPrefs()`) | `score-player` via `uiPrefs().set(...)` (auto `saveSoon()`) + boot restore | `syncPayload` (without loading `score-player`), `score-player` on `mount()` | `ptt-v3` (`scoreLook`, `scoreHl`, `scoreView`, `scoreViewExplicit`, `anSide`) |
| Preview states (`stopPreviews` L666): `explorePreview` (L4955), `practiceHintPreview` (L5487), `intervalSongPreview` (L5335), `intervalHintPlay` (L5336), `melDemoTimer`/`melDemoPlaying` (L19923–19924) | Owning feature (`explore` / `practice`) | Owning feature; registers stopper via `host.previews.registerStopper(fn)` | Shell `host.previews.stopAll()` + `teardownView` | Not persisted |
| `coaching` (`L12763–13208`, excluding `srCoach` which stays in `read`) | `src/app/coaching.ts` (shell) | Features publish snapshots via `host.coach.setContext(...)`; shell calls `refresh()` | Cross-surface (`Today`, `Read`, `Practice`, `Pieces`, `Settings`) | Not persisted |
| `SES` (L3294), `techniqueHost` (L3524), `accomp` (L712) | `src/features/practice/` | `practice` (preserving `technique-drill.ts` wiring) | `syncBusy()` via `isBusy()`, `teardownView` via `leave()` | Progress in `data` |
| `voice` (L1767), `sing` (L1198), `trx` (L853) | `src/features/voice/` | `voice` | `syncBusy()` via `isBusy()`, `teardownView` via `leave()` | `data.singCleared` |
| `SR` (L7051), `RDN` (L7071), `RD` (L9093) | `src/features/read/` *(ledger + flow + shell `pendingSave` mirror stay eager)* | `read` | `syncBusy()` via `isBusy()`, `show()` via `pendingSave` mirror | `data.reading` + `SRT_LEDGER_KEY` |
| `AN` (L13226), `SCORE` (L13830), `FALL` (L18153), `SIDE` (L16909), `PRAC` (L15176), `scoreLibrary` (L187) | Single `ScorePlayerState` in `src/features/score-player/` + `LibraryHost` | `score-player` / `score-library` (via `LibraryHost`, no direct cross-feature import) | `syncBusy()` via `isBusy()`, `teardownView` via `leave()` | `data.sheet` + `PRAC_KEY = 'etude-practice-v3'` (L15181, owned by `score-practice.ts`) + IndexedDB |

---

## 4. Other Oversized Modules

- **P1 — `src/domain/score-library-ui.ts` (1,735 lines, single `initScoreLibrary` function):** split in Phase 4A into `src/features/score-library/{library-query, library-dialogs, library-actions, library-view}.ts` (+ Node unit tests for `library-query.ts`), keeping a re-export shim in `src/domain/score-library-ui.ts` so `scripts/build.mjs` keeps it lazy.
- **P2 — `src/styles/etude.css` (1,770 lines):** still contains 324 lines of feature-specific selectors (`.an-*`, `.lr-*`, `.td-*`, `.ex-*`, `.pr-*`, `.sr-*`, `.rd-*`) plus score toolbar (`L1656`) and practice stage (`L1552`); extract incrementally into existing feature CSS files in Phase 7C while preserving cascade order and golden layouts.
- **P3 (only when touched functionally):** `score-difficulty.ts` (1,598), `score-harmony.ts` (1,379), `score-import.ts` (1,339), `audio.ts` (1,157).

---

## 5. Phased Execution Plan (One Scoped PR per Step)

- **Phase 0 — Contracts, Test-Surface Bridge, ESLint Layer Rules, Production Smoke & Baseline:**
  - Export `StoredTrainerData` and extend `src/domain/views.ts` (`EtudeSurface`, `TestSurfaceRegistry`, `createTestSurfaceRegistry`, `ShowFn`/`ShowOptions`, `InputBus`, `UiPrefsStore`, `FeatureController`, `AppHost`).
  - Add `src/app/test-surface-wiring.ts` loaded via dynamic `await import()` under `DEV || __ETUDE_TEST_SURFACE__`.
  - Add layer boundary rules in `eslint.config.mjs` (`src/core/**`, `src/infra/**`, `src/features/**`, `src/app/**`) + unit tests.
  - Add production-build (no `--test-surface`) multi-view navigation smoke test in `tests/e2e/deploy.spec.mjs`.
- **Phase 1 — Global-Free Merge Core & Low-Coupling Infra:**
  - **PR 1A — `src/core/sync-merge.ts` (~180 lines):** `SYNC_ADD`, `SYNC_MAX` (`L20490–20491`), `syncCloneData` (`L20552`), `syncSame` (`L20559`), `syncSrsPair` (`L20568`), `syncSrs` (`L20580`), `syncNewCollisions` (`L20600`), `syncPick` (`L20606`), `syncInto` (`L20623`, mutates `l` in-place), `syncData` (`L20644`) + Node unit tests. (`syncWrite`/`storeApplyBackup` stay in `views-runtime.ts`.)
  - **PR 1B — `src/infra/pwa-lifecycle.ts` (`L2579–3061`, ~480 lines).**
  - **PR 1C — `src/infra/midi-controller.ts` (`L2336–2578`, ~245 lines).**
- **Phase 2 — Pilot #1: `src/features/explore/` (`L4950–5327`, ~380 lines):** proves `FeatureController`, `mount()` once, `AbortSignal`, `host.input.subscribe`, `host.previews`, `test-surface-wiring.ts`, lazy `import()`, standalone inlining, SW precache, CSP, and `perf:baseline -- --view explore`.
- **Phase 3 — Pilot #2 (`voice`) & Independent Views:**
  - **PR 3A — `src/features/voice/` (`L849–1797`, ~950 lines):** lazy on `sing` (covers merged `#transcribe`); `trxOpenInPieces` uses `host.nav.show('analysis', { openFile })`.
  - **PR 3B — `src/features/learn/` (`L5711–7029`, ~1,320 lines):** lazy on `#learn`/`#method`, checking `signal.aborted` after `await host.i18n.loadLearn()`.
  - **PR 3C — `src/features/practice/{accompaniment, song-book}.ts` (`L709–848`, `L5328–5486`, `L21577–22366`, ~1,100 lines):** keeps `practice-hints` wiring (`L5487–5710`) with `practice-hints-view.ts` / Phase 5B.
- **Phase 4 — Score Library & Score Player (~8,200 lines):**
  - **PR 4A — `src/features/score-library/`** (splitting `score-library-ui.ts` with shim + unit tests for `library-query.ts`).
  - **PR 4B — `src/features/score-player/` (`L13209–19694`, ~6,485 lines):** explicit `ScorePlayerState`, communicates with library only via `LibraryHost`, lazy on `#analysis` (absorbing `ensureAnalysisModules()`), preserving `show()` pending-view protection and persisting preferences through `uiPrefs`. *(Cumulative reduction after Phases 1–4: `views-runtime.ts` drops from 23,561 to ~12,600 lines.)*
- **Phase 5 — SRS, Practice, Shell Coaching, Today & Progress:**
  - **PR 5A — `src/core/srs.ts` (`L3062–3278`, excluding `data`/`freshData`/`restoreTrainerData`):** accepts `srs` map explicitly + unit tests pinning `StoredSrsEntry` shape against `SYNC_ADD`/`SYNC_MAX`.
  - **PR 5B — `src/features/practice/` (`L3279–4484`, `L5487–5710`, `L19881–20456`, ~2,000 lines):** preserves `techniqueHost` (`L3524`) and `practice-hints-view.ts`.
  - **PR 5C — `src/app/coaching.ts` (cross-surface shell coaching with `setContext`/`refresh`, extracted intentionally from `L12763–13208` before Phase 6C; `srCoach` stays in `read`) + `src/features/today/` + `src/features/progress/`.**
- **Phase 6 — Read / Sight-Reading UI (~6,180 lines):**
  - Keep `src/sight-reading/{ledger,flow}.ts` and shell `pendingSave` mirror eager; move remaining `src/sight-reading/*` imports into lazy `src/features/read/`.
  - **PR 6A — `src/features/read/read-play-engine.ts` (`L7030–8834`) + `src/core/pitch-match.ts`** (unifies duplicated `anyOctave` pitch-matching predicates at `L8364`, `L8544`, `L9915`, `L15732`).
  - **PR 6B — `src/features/read/{reading-drills, lookahead-stream, rhythm-reading, fullscreen-stage}.ts` (`L8835–11560`).**
  - **PR 6C — `src/features/read/{read-home, read-warmup, read-level-player}.ts` (`L11561–12762`).**
- **Phase 7 — Input Bus, Keyboard Dock & Cleanup:**
  - **PR 7A — `src/app/{keyboard-dock, input-bus}.ts` (`L1798–2335`).**
  - **PR 7B — Final shell cleanup:** `views-runtime.ts` (<1,500 lines) retains `syncWrite`, `storeApplyBackup`, `syncPayload`, and `show()`.
  - **PR 7C (optional) — Extract remaining feature selectors from `src/styles/etude.css`.**

---

## 6. Per-PR Validation Gates

1. `npm run typecheck` + strict CI `tsc --noEmit` (0 `any`, 0 `@ts-ignore`).
2. `npm run lint` (`import-x/no-cycle` + layer rules).
3. `npm run test:unit` + `npm run test:i18n` + `node scripts/split-locales.mjs --check`.
4. **Strict build order:**
   - First `npm run build` (**production, without `--test-surface`**): diff `dist/etude/assets/*.js` chunk membership and sizes against `main` (verify `test-surface-wiring` is absent in production and no lazy feature leaks into the entry chunk).
   - Then `npm run build:standalone -- --test-surface`: verify single-file inlining (`codeSplitting: false`), atomic SW precache (`generate-sw.mjs`), and CSP (`injectCsp`).
5. Playwright E2E: extracted feature spec + `deploy.spec.mjs` (production lazy-navigation smoke test) + `standalone.spec.mjs` + `navigation-audit.spec.mjs` + `app.spec.mjs` + `sw-migration.spec.mjs` (`@sw`) + `data-safety.spec.mjs`.
6. Performance (Phases 0, 2, 4B, 6C): `PW_CHANNEL='' npm run perf:baseline -- --view today` and `--view explore`.

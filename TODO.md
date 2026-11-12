# Étude — TODO, Structura Proiectului & Inventarul Dependențelor

Acest document centralizează:
1. **Starea la zi a TODO-ului** din planul de migrare ([2026-11-08-safe-migration-plan.md](./docs/plans/2026-11-08-safe-migration-plan.md)).
2. **Noua structură organizată a proiectului** (conform best practices).
3. **Inventarul complet al dependențelor la zi** (cele 11 din `package.json` + cele 4 Runtime/Vendor din browser).
4. **Comenzile automate de verificare și actualizare cu rollback** (`deps:check`, `update:deps`, `osmd:check`, `update:osmd`).

---

## 1. Status & Checklist TODO

### Finalizat (Verificat local & în teste)
- [x] **Step 0 — Plasa de siguranță (Safety Net):** Suita Playwright stabilă, separare proiecte `app` și `sw` (`@sw`), teste golden pentru cele 30 de înregistrări MP3 (`tests/golden/piano-recordings.json`) și pentru gravura partiturilor (`tests/golden/scores/*.json`, inclusiv baseline-uri `darwin`, `linux` și `win32`).
- [x] **Step 1 — Upgrade OpenSheetMusicDisplay (OSMD) la `2.3.0`:**
  - Actualizat de la `1.9.9` la `2.3.0` (`public/vendor/osmd-2.3.0.min.js`).
  - Adaptat `src/domain/notation.ts` pentru OSMD `2.3.0`:
    - `patchOsmdPedals` păstrează instanța `StaffLine` (`line.Pedals = [pedal]` cu restaurare în `finally`), compatibil cu noul `drawPedals(t)` din OSMD `2.3.0`.
    - `patchOsmdPageBreakOrphans` previne apariția paginilor orfane cu un singur sistem chiar înainte de `<print new-page="yes">` (rezolvă regresia *Moonlight Sonata III* 14 vs 17 pagini).
    - `SVGMergeSingleChildGroups = false` și `RenderSlursAcrossStaves = false` în `OsmdScoreRenderer` păstrează structura grupurilor SVG `.vf-notehead` / `.vf-sc-pedal` și previn dublarea legăturilor cross-staff.
  - Actualizat blocul `<details class="osmd-lic">` din `etude.html` cu notificările MIT pentru sub-dependențele împachetate (`VexFlow`, `JSZip`, `loglevel`, `typescript-collections`).
- [x] **Step 2a & 2b — Build în `dist/etude/` și Service Worker atomic:** `scripts/build.mjs`, `scripts/generate-sw.mjs` (precache atomic verificat prin SHA-256, fără page/asset skew offline) și `scripts/sw-kill-switch.js`.
- [x] **Step 3 & 3b — Spargerea monolitului + Fonturi auto-găzduite:** Extragerea celor 30 MP3-uri în `src/assets/piano/`, a OSMD în `public/vendor/osmd-2.3.0.min.js`, a fonturilor WOFF2 (`Fraunces` și `Hanken Grotesk`, `latin` + `latin-ext`) în `src/assets/fonts/` și build-ul `dist/etude-standalone.html` pentru `file://`.
- [x] **Step 4 & 5 — Module TypeScript stricte pe domenii:** `src/domain/{storage,theory,audio,notation,router,dom,views,views-runtime}.ts` + `src/locales/content.ts`, fără `src/legacy/`, cu `0 explicit any` verificat de `scripts/check-ts-suppressions.mjs`.
- [x] **Step 6 — Sight-Reading v3 MVP:** Implementat și verificat complet în worktree-ul `sight-reading-v3`.
- [x] **Actualizare completă dependențe & Reorganizare repo după best practices:**
  - Actualizat `@playwright/test` la `1.65.0`, `eslint-plugin-import-x` la `^4.18.1` și `opensheetmusicdisplay` la `2.3.0`.
  - Organizat `tests/` în `tests/unit/`, `tests/e2e/`, `tests/e2e/sight-reading/`, `tests/helpers/`, `tests/fixtures/`, `tests/golden/`.
  - Consolidat `i18n/` (`i18n/framework/`, `i18n/tests/`, `i18n/{de,es,fr,it,pt-BR}`, `i18n/i18n-extra.js`).
  - Organizat `docs/` în `docs/i18n/`, `docs/plans/`, `docs/runbooks/` și eliminat documentele istorice și duplicatele din rădăcină și `i18n/`.
- [x] **Roadmap Faza 2 — Aplicația se simte nativă (#9):** fade de 120ms la schimbarea ecranului, texte de dispozitiv pe telefon și în aplicația instalată (`native.css`), sunetul se reia la revenire (`audio.resumeOnReturn`, `dom.onPageReturn`), verificare de versiune nouă la revenire.
- [x] **Roadmap Faza 3 — Cântat de încredere (#10):** notele MIDI sunt judecate după ora evenimentului (`midi-timing.ts`), reconectare automată MIDI, calibrarea latenței per sursă în `data.latency` (0–500 ms), claviatură lată pe telefon ținut orizontal (`landscape.css`).
- [x] **Roadmap Faza 4 — Mai mult pian (#11):** niveluri de ritm sr10–sr12 (optimi, note cu punct, sincope, legato de prelungire), exercițiu de game și arpegii (`technique.ts`), feedback care arată greșeala și un exercițiu de contrast (`feedback.ts`).
- [x] **Constatări din review, Fazele 2–4 (#13):** antetul rămâne pe orizontală când un exercițiu forțează claviatura, exercițiul de game respectă „Accept any octave” și cere două clape la mâini împreună, judecă după `inputTime()` și nu ia o clapă înaintea pasului precedent. Resetarea progresului păstrează `data.latency`. Pe ecran tactil rămân „sau cântă acordul” și „cântă la MIDI sau atinge o clapă”. Orice stare MIDI se traduce din nou la schimbarea limbii.
- [x] **Practice Redesign — Complete Music Trainer Experience ([2026-11-09-practice-redesign-plan.md](./docs/plans/2026-11-09-practice-redesign-plan.md)):** toate cele 7 faze sunt în `main`: tab-ul Scores, Full-screen Stage, șirul de note și fantoma, Supraviețuire, Contra cronometru și Maraton (`arcade.ts`), polifonie și grand staff în toate armurile, injecția notelor slabe din Setări, cu traduceri în 7 limbi și teste.
- [x] **Focus pass (ramurile `feat/focus-pass` și `feat/focus-pass-2`, neîmbinate în `main`):** Explore pe un singur ecran (cercul cvintelor lângă portativ), toate lecțiile Learn deschise, Practice cu carduri de subiect. Apoi: Pieces (piesele incluse și fișierele proprii într-un singur player, cu rezultate salvate), 9 piese noi din domeniul public (23 în total), exerciții de citire cu un buton Practice și un meniu Challenge (Test și Note rush comasate, toate nivelurile deschise), statisticile de citire mutate în Progress, cartea de cântece pentru intervale și acompaniamentul mutate în Practice, ecranul Voice (Sing + Transcribe), grila „Or drill one focus” scoasă din Today.

### Rămas de făcut (Următorii pași)
- [ ] **Roadmap, amânate cu bună știință:** notarea ritmului bătut (tap), jurnalul de performanță și un planificator pe abilități, statistici salvate ale confuziilor. Toate adaugă date salvate, deci au nevoie de un pas în `PTT_MIGRATIONS`.
- [ ] **Constatări deschise:**
  - Pieces: o rulare cu o singură mână nu salvează nici „best”, nici „learned” (vechiul player salva). Regula „Accept any octave” există în trei copii.
  - Pieces: notele pieselor noi nu au fost verificate la pian. Oh! Susanna și Aura Lee au doar strofa, Brahms Lullaby are ritmul simplificat, Scarborough Fair a fost lăsată deoparte.
  - Citire: fereastra de 20 de răspunsuri poate umfla stelele la rulări lungi, iar injecția de puncte slabe schimbă eșantionul notat.
  - Voice: săgețile pe comutatorul de activitate opresc o înregistrare în curs.
  - Explore: țintele de pe inelul interior al cercului au aproximativ 32px la 360px lățime.
  - Teste sensibile la încărcarea mașinii: cele două teste de timp din `technique.spec.mjs` și testul de schimbare rapidă a limbii din `challenger-adversarial.spec.mjs`. Trec rulate singure.
  - Fișierele `i18n/*.json` păstrează chei vechi. Nu intră în build.
  - Un pian Bluetooth asociat prin sistem vine prin Web MIDI și folosește offsetul `usb`. Trebuie un offset per dispozitiv.
  - Arpegiile au digitație doar în Do, Fa, Sol major și la, re, mi minor. Celelalte tonalități au nevoie de o sursă verificată.
  - Într-o fereastră de desktop sub 680px, fără ecran tactil, un exercițiu de acorduri nu arată niciun indiciu.
  - Resetarea progresului păstrează datele dispozitivului (`data.latency`) printr-un caz special. La a doua cheie de dispozitiv, se generalizează.
  - Lăsat așa intenționat: fullscreen-ul din browser e tratat ca aplicație instalată (`display_override` din manifest începe cu `fullscreen`).
- [ ] **Rollout GitHub Pages & Verificare PWA pe dispozitiv real (Steps 2a / 2b / 3):**
  - Verificarea în **Settings → Pages → Build and deployment → Source: GitHub Actions**.
  - După deploy pe `main`, deschiderea PWA-ului instalat pe telefon/desktop întâi online (pentru preluarea noului Service Worker atomic), apoi în Airplane Mode.
  - Pașii completi sunt în [docs/runbooks/device-smoke.md](./docs/runbooks/device-smoke.md) (instalare, offline, stocare și copii automate, actualizare, sunet, MIDI).
- [x] **Integrarea branch-ului `sight-reading-v3` în `main` (Step 6):**
  - Merge realizat cu succes în `main` (`35d51c0`), teste și build-uri validate 100% pe Windows și Linux.

---

## 2. Structura Organizată a Proiectului (`main`)

```text
main/
├── etude.html                  # Shell-ul stabil al aplicației
├── package.json                # Scripturi npm și cele 11 devDependencies
├── tsconfig.json               # Configurația strictă TypeScript
├── vite.config.mjs             # Configurația Vite (build în dist/etude)
├── vitest.config.mjs           # Configurația Vitest (tests/unit/**/*.test.mjs)
├── playwright.config.mjs       # Configurația Playwright (tests/e2e/**/*.spec.mjs)
├── eslint.config.mjs           # Granițele arhitecturale ESLint
├── public/                     # Active statice copiate în dist/etude/
│   ├── manifest.webmanifest
│   ├── icons/
│   └── vendor/
│       └── osmd-2.3.0.min.js   # OpenSheetMusicDisplay 2.3.0 (lazy-loaded)
├── src/                        # Codul sursă al aplicației
│   ├── assets/
│   │   ├── fonts/              # 8 subseturi WOFF2 (Fraunces + Hanken Grotesk)
│   │   └── piano/              # 30 sample-uri MP3 Salamander Grand Piano v3
│   ├── domain/                 # Module TypeScript stricte (audio, dom, notation, router, storage, theory, views, views-runtime)
│   ├── locales/                # Traduceri și conținut EN / RO sincron
│   └── styles/                 # etude.css + fonts.css
├── i18n/                       # Pachetul suplimentar multi-limbă (DE, ES, FR, IT, PT-BR)
│   ├── i18n-extra.js
│   ├── framework/              # Runtime și loader i18n
│   ├── tests/                  # Teste pentru pachetul i18n (npm run test:i18n)
│   └── {de,es,fr,it,pt-BR}/
├── scripts/                    # Scripturi de build, verificare și actualizare automată
│   ├── build.mjs
│   ├── build-standalone.mjs
│   ├── check-ts-suppressions.mjs
│   ├── generate-sw.mjs
│   ├── split-etude.mjs
│   ├── sw-kill-switch.js
│   ├── update-deps.mjs
│   └── update-osmd.mjs
├── tests/                      # Suita de teste organizată pe categorii
│   ├── unit/                   # 15 fișiere de teste unitare Vitest (*.test.mjs)
│   ├── e2e/                    # 10 fișiere E2E generale Playwright (*.spec.mjs)
│   │   └── sight-reading/      # 14 fișiere E2E dedicate Sight-Reading (*.spec.mjs)
│   ├── helpers/                # Fixture-uri Playwright și helperi de audit
│   ├── fixtures/               # Fișiere MusicXML / MXL și save-uri de test
│   └── golden/                 # Hash-uri golden MP3 și layout-uri partituri pe OS
└── docs/                       # Documentație esențială
    ├── i18n/                   # Documentație i18n
    ├── plans/                  # Planul activ de arhitectură și migrare
    └── runbooks/               # Runbook-uri operaționale (sw-kill-switch.md)
```

---

## 3. Inventarul Complet al Dependențelor

### A. Dependențe de Build, Lint, Typecheck & Test (`package.json` → `devDependencies`)

| # | Pachet npm | Versiune la zi | Rol în proiect | Observații |
|---:|---|---|---|---|
| **1** | `vite` | `^8.3.6` (`8.3.6`) | Bundler aplicație și dev server (`base: './'`) | Ultima versiune stabilă |
| **2** | `typescript` | `^6.0.3` (`6.0.3`) | Typechecker strict (`tsc --noEmit`) + AST checker | Ultima versiune 6.x (`7.0.x` elimină API-ul JS cerut de `typescript-eslint`) |
| **3** | `vitest` | `^5.1.0` (`5.1.0`) | Runner pentru testele unitare (`tests/unit/`) | Ultima versiune stabilă |
| **4** | `@playwright/test` | `1.65.0` (`1.65.0`) | Runner E2E, Service Worker (`@sw`) și teste golden | Actualizat de la `1.64.1` → `1.65.0` |
| **5** | `eslint` | `^10.14.0` (`10.14.0`) | Linter static pentru granițele dintre domenii | Ultima versiune stabilă |
| **6** | `@eslint/js` | `^10.0.1` (`10.0.1`) | Regulile recomandate ECMAScript pentru ESLint | Ultima versiune stabilă |
| **7** | `typescript-eslint` | `^8.72.1` (`8.72.1`) | Parser și reguli TypeScript (`no-explicit-any`) | Ultima versiune stabilă |
| **8** | `eslint-plugin-import-x` | `^4.18.1` (`4.18.1`) | Previne ciclurile de import (`import-x/no-cycle`) | Actualizat de la `4.18.0` → `4.18.1` |
| **9** | `globals` | `^17.14.0` (`17.14.0`) | Definițiile globalelor de browser și Node pentru ESLint | Ultima versiune stabilă |
| **10** | `acorn` | `^8.19.0` (`8.19.0`) | Parser AST ECMAScript folosit în scripturi și teste | Ultima versiune stabilă |
| **11** | `@types/node` | `^26.6.6` (`26.6.6`) | Tipuri Node.js pentru scripturile și testele din repo | Ultima versiune stabilă |

### B. Dependențe Runtime / Vendor (care ajung în browserul utilizatorului)

| # | Componentă | Versiune actuală | Locație în proiect | Sub-dependențe / Detalii | Licență |
|---:|---|---|---|---|---|
| **1** | **OpenSheetMusicDisplay (OSMD)** | `2.3.0` | `public/vendor/osmd-2.3.0.min.js` (încărcat la cerere prin `src/domain/notation.ts`) | Include intern 4 biblioteci: **VexFlow** (`1.2.93` fork OSMD), **JSZip** (`3.10.1`), **loglevel** (`^1.8.0`), **typescript-collections** (`^1.3.3`) | BSD-3-Clause (PhonicScore) + MIT (sub-dependențe) |
| **2** | **Salamander Grand Piano v3** | `v3` | `src/assets/piano/21.mp3` … `108.mp3` (30 fișiere) | Note din 3 în 3 semitonuri; integritate păzită de `tests/golden/piano-recordings.json` | CC BY 3.0 (Alexander Holm / Tone.js) |
| **3** | **Fonturi WOFF2 auto-găzduite** | Static (`v1`) | `src/assets/fonts/*.woff2` + `src/styles/fonts.css` | **Fraunces** (normal + italic, `latin` + `latin-ext`) și **Hanken Grotesk** (`latin` + `latin-ext`) | SIL Open Font License 1.1 |
| **4** | **Glife SMuFL Bravura** | Static | Contururi SVG `CLEF_G` și `CLEF_F` în cod | Cheia Sol și cheia Fa pentru portativul rapid SVG | SIL Open Font License 1.1 |

---

## 4. Comenzi Automate de Verificare și Actualizare

```bash
# 1. Verifică starea tuturor dependențelor npm și runtime/vendor:
npm run deps:check

# 2. Verifică integritatea bundle-ului OSMD curent și dacă a apărut o versiune nouă pe npm:
npm run osmd:check

# 3. Actualizează pachetele din package.json pe grupuri, cu rollback automat dacă pică vreun test:
npm run update:deps

# 4. Actualizează OSMD la o versiune nouă, cu diff de EngravingRules și rollback automat:
npm run update:osmd -- <versiune>
```

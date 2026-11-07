# Plan Unificat: Migrarea Arhitecturală Étude + Sight-Reading Adaptiv v3

**Data:** 7 noiembrie 2026
**Stare:** Specificație master unificată (combină integral `2026-11-06-architecture-migration-plan.md` și `2026-11-06-sight-reading-plan-v3.md`, cu toate corecțiile tehnice verificate pe cod).
**Premisă:** Regula „the app itself has no build step” nu se mai aplică. Pipeline-ul folosește **Vite + TypeScript + Vitest + Playwright**, păstrând aplicația 100% statică (fără backend), instalabilă ca PWA offline și compatibilă cu datele existente ale utilizatorilor.

---

## Cuprins și Harta Fazelor

```mermaid
flowchart LR
  F0["Faza 0: Igienă Git & Baseline"] --> F1["Faza 1: Schelet Vite + SW Precache"]
  F1 --> F2["Faza 2: Extragere MP3 & OSMD"]
  F2 --> F3["Faza 3: Modul ES + Test Bridge + Vitest"]
  F3 --> F4["Faza 4: Extragere i18n & Lecții"]
  F4 --> F5["Faza 5: Sight-Reading v3 MVP (M0–M10)"]
  F5 --> F6["Faza 6: Modularizare Domenii TS + Store"]
  F6 --> F7["Faza 7: Curățenie, window.__etude & CI/CD"]
  F7 --> F8["Faza 8: Sight-Reading V2/V3 & Reevaluare UI"]
```

| Fază | Scop | Durată estimată |
|---|---|---|
| **Faza 0** | Igienă Git, rezolvare `stash@{0}`, `.gitignore`, curățare `.pyc` urmărite, captură baseline | ~0.5 zile |
| **Faza 1** | Introducere Vite + TypeScript + `vite-plugin-pwa` (`injectManifest`) + Playwright pe `vite preview` | ~0.5–1 zi |
| **Faza 2** | Extragere 30 sample-uri `.mp3` și bundle OSMD 1.9.9 (`loadOsmd` idempotent) din `etude.html` | ~1–2 zile |
| **Faza 3** | Mutare script în modul ES (`src/legacy/app.js`), punte `installWindowBridge` (getter/setter în același scope), ESLint, Vitest | ~1–2 zile |
| **Faza 4** | Separare `locales/` și lecții HTML, eliminare ramuri `lang === 'ro'`, tipizare `t()`, adaptare validator | ~3–4 zile |
| **Faza 5** | **Sight-Reading Adaptiv v3 — MVP complet (`M0`–`M10`)** implementat modular în `src/sight-reading/` | ~5–8 zile |
| **Faza 6** | Modularizare completă în TypeScript pe domenii (`theory`, `core`, `midi`, `audio`, `notation`, `modes`) + Store | ~2–4 săptămâni |
| **Faza 7** | Înlocuire punte cu API dedicat `window.__etude`, bugete de dimensiune, pipeline CI/CD GitHub Actions | ~2–3 zile |
| **Faza 8** | **Sight-Reading V2 (fragmente, 2 mâini) & V3 (estimare adaptivă P3–P6)** + reevaluare framework UI | Iterativ |

---

## Partea I — Diagnosticul Codului Actual și Arhitectura Țintă

### 1.1. Măsurători exacte pe `etude.html`

[etude.html](../../etude.html) are **4.96 MB** (10.106 linii), dar ~80% din fișier reprezintă resurse binare și cod vendor inlined:

| Componentă | Localizare în `etude.html` | Dimensiune | Pondere |
|---|---|---|---|
| **Sample-uri de pian** (30 MP3-uri Salamander Grand Piano v3, MIDI `21..108` din 3 în 3 semitonuri, base64 în `#piano-recordings`) | L2064 | 2.68 MB (≈2.0 MB binar) | 54% |
| **OpenSheetMusicDisplay 1.9.9** (include VexFlow, minificat inline) | L2065–2066 | 1.22 MB | 25% |
| **Codul JS al aplicației** (`"use strict"`, 857 funcții, 164 `const`, 18 `let` la nivel global) | L2067–10104 | 839 KB | 17% |
| **CSS inline** (`<style>`) | L23–1321 | 113 KB | 2.3% |
| **HTML** (`<body>`) | L1323–2063 | 83 KB | 1.7% |

### 1.2. Constrângeri și cuplaje critice din cod și teste

1. **Contractul PWA instalat (invariabil):**
   - `start_url: ./etude.html` în [manifest.webmanifest](../../manifest.webmanifest);
   - Service Worker înregistrat la `./sw.js` cu `scope: './'` (L4200);
   - Starea generală în `localStorage['ptt-v3']` și noul registru de sight-reading în `localStorage['etude-sight-v1']`.
2. **Dependența suitei Playwright ([tests/app.spec.mjs](../../tests/app.spec.mjs)) de globale și monkey-patching:**
   - 134 de teste cu 214 apeluri `page.evaluate(...)` citesc direct simboluri globale (`show`, `t`, `setLang`, `SES`, `ITEMS`, `AN`, `sing`, `pianoBank`, `SYNC` etc.), iar [tests/fixtures.mjs](../../tests/fixtures.mjs#L18) așteaptă `typeof window.show === 'function' && document.querySelector('#keys .key')`.
   - **7 funcții declarate în script sunt suprascrise (monkey-patched) direct în teste:**
     1. `pianoDecode` (L491, L514, L535, L558, L579, L594)
     2. `makePianoVoice` (L515, L536, L559, L580, L595)
     3. `previewNote` (L317)
     4. `preparePiano` (L626)
     5. `anInflatedSize` (L953, L1015)
     6. `playInterval` (L1042)
     7. `syncPull` (L1326)
   - **5 variabile `let` sunt reasignate direct în teste:** `actx`, `theme`, `localSynth`, `lang`, `notation`.
   - Deoarece callback-urile din `page.evaluate(() => { pianoDecode = mock })` nu au `"use strict"` local, o atribuire către un simbol fără setter pe `window` nu aruncă `ReferenceError`, ci creează în tăcere `window.pianoDecode` fără să înlocuiască funcția apelată intern de modul.
3. **Două teste din `tests/app.spec.mjs` citesc `etude.html` direct de pe disc cu `readFileSync`:**
   - L37–55 (`no string key is defined twice in a language`) caută `'const STRINGS={'`;
   - L1511–1516 (`unused leftovers stay removed`) caută `'function demoBeat('` și verifică absența identificatorilor `['catSing', 'RO_CAT1', 'previewGeneration', 'hasRh']`.
4. **Cuplajul cu OpenSheetMusicDisplay (OSMD):**
   - Folosit în 3 locuri: `scoreRender()` (L8005, deja `async`), `scorePatchOsmd()` (L8091, apelat din `scoreRender`) și `anReadXml()` (L9065, deja `async`).
   - `scorePatchOsmd()` modifică prototipul intern `opensheetmusicdisplay.VexFlowMusicSheetDrawer.prototype.drawPedals`.
   - Două teste `.mxl` din [tests/app.spec.mjs](../../tests/app.spec.mjs#L937) (L937 și L950) accesează `opensheetmusicdisplay.MXLHelper.MXLtoXMLstring` imediat după deschiderea `#analysis` pe gol (`SCORE.xml` este gol, deci `scoreRender` iese la L7997 înainte de L8005).
5. **Validatorul i18n (`i18n-framework/inventory.cjs`):**
   - Extrage dicționarele din `etude.html` căutând delimitatori de text (`'const STRINGS={'` … `'\nfunction t(k'`).
   - În codul aplicației există **24 de ramuri `lang === 'ro'`** și verificări sincrone `if (STRINGS[v])` în `loadAll()` (L9829) și `SYNC_PREFS.lang` (L9724).
6. **Observații verificate în motoarele `SR` și `RD` pentru Sight-Reading v3:**

| Componentă | Observație verificată în `etude.html` | Consecință în Faza 5 (Sight-Reading v3) |
|---|---|---|
| `srAssessFinish` (L6620) | Procentul actual este `100 * good / totalN`. `SR.wrongExtra` este afișat, dar nu scade scorul. Apelează `SR.next = srNextAssess(pct)`. | Înlocuim calculul cu evaluatorul pur `srtEvaluate`, păstrăm separat recordurile istorice `data.sheet[id].best` și setăm `SR.wrongExtra = result.FP` pentru compatibilitatea cu `srNextAssess`. |
| `srKeyInput` (L6628) și `srAssessLoop` (L6612) | Evaluarea existentă face matching greedy în timp real și marchează `SR.results[nid] = 'good' \| 'bad'` în timpul redării. | În modurile în tempo, în timpul stării `playing` se mișcă doar cursorul; colorarea notelor se aplică la `completed` (după `T + 250 ms`) din rezultatul optim returnat de `srtEvaluate`. |
| `onInputChange`, `handleNoteOn`, `handleNoteOff`, `inputOwners` | `handleNoteOn`/`handleNoteOff` deduplică prin `held` și `inputOwners`, dar `onInputChange(kind, midi)` trimite către `SR` doar `kind === 'on'` cu `heldOrder[heldOrder.length - 1]`, fără `off`, fără `source` și fără distincția eliberare fizică vs pierdere focus (`releaseFocusInput`). | Extindem `onInputChange(kind, midi, source, releaseKind)` astfel încât recorderul `SR` să primească direct evenimentele `on` și `off` cu `midi`, `source` și `releaseKind`. |
| `rdRhPress`, `rdRhRelease`, `rdRhGradeHand` (L7004–7031) | Exercițiile de ritm (`RD.L.ty === 'rh'`) au deja un mini-recorder cu `open: Map` (curățat în `releaseFocusInput`) și ferestre temporale de `100 ms` (`good`) și `180 ms` (`near`). | Păstrăm aceleași praguri temporale (`100 ms` / `180 ms`) în `srtEvaluate` pentru coerență în toată aplicația și urmăm același tipar la pierderea focusului. |
| `srEvents`, `srRender` | Modelul existent acceptă note, acorduri și pauze `R`; rendererul citește `ts`. | Folosim adaptorul `srtToLegacyPiece(piece)` către `srRender`, păstrând corespondența stabilă între `event.id` / pitch și `nid`-ul SVG. |
| `srStepsBuild` (L6559) | Notele sunt grupate după momentul de atac și mâinile selectate. | Păstrăm grupurile simultane pentru modul pas cu pas (`learn`); în tempo, acordurile nu impun o ordine de apăsare a notelor componente. |
| `rdSightGen`, `rdSightStart`, `rdGenMelody` (L7066–7089) | Generatorul actual folosește `Math.random()` și construiește exerciții 4/4, iar intrarea în sight-reading se face atât din tabul Drills (`rdSightStart`) cât și din tabul Pieces (`rdGenMelody`). | Noul generator primește explicit profilul și seed-ul; ambele puncte de intrare folosesc același flux și aceeași mapare de moduri. |
| `srAssessStart`, `srPlayGap` (L6591, L6606) | Mâna neexersată poate fi redată automat prin `previewNote`. | Această asistență este permisă în practică, dar dezactivată în „Prima încercare în tempo”. |
| `rdData`, `syncData`, `SYNC_ADD`, `SYNC_MAX` | Există progres și reguli de comasare specifice datelor actuale din `ptt-v3`. | Registrul nou folosește cheia separată `etude-sight-v1` și nu intră în `syncData`. |
| `isBackupPayload` | Validatorul de bază verifică `p.v === 3 && isRecord(p.data)`. | Extindem exportul/importul prin câmpul opțional `sightLedger`, validat separat fără a rupe backup-urile `v:3` existente. |

### 1.3. Structura de directoare țintă

```text
etude/
├─ etude.html                    ← intrarea Vite: structura HTML + <script type="module" src="/src/main.ts">
├─ public/                       ← copiate cu URL stabil (fără hash)
│  ├─ manifest.webmanifest
│  └─ icons/…
├─ src/
│  ├─ main.ts                    ← inițializare aplicație
│  ├─ vendor/
│  │  └─ osmd-1.9.9.min.js       ← bundle-ul OSMD existent extras din etude.html, încărcat la cerere
│  ├─ core/
│  │  ├─ store.ts                ← stare reactivă (signals) + persistare ptt-v3
│  │  ├─ storage.ts              ← încărcare/salvare/migrare v2→v3, sync multi-tab, backup
│  │  └─ dom.ts                  ← $, helpers DOM
│  ├─ theory/                    ← FUNCȚII PURE (fără DOM / window)
│  │  ├─ pitch.ts  spelling.ts   ← letter / solfege / german (H/B)
│  │  ├─ intervals.ts  chords.ts  scales.ts  keys.ts
│  │  └─ *.test.ts               ← teste unitare Vitest
│  ├─ sight-reading/             ← MODULUL SIGHT-READING V3 (creat direct modular în Faza 5)
│  │  ├─ model.ts                ← model în ticks (480), srtValidatePiece, srtToLegacyPiece, srtBuildExpected
│  │  ├─ fingerprint.ts          ← srtCanonicalString, srtFingerprint (FNV-1a 64-bit sincron)
│  │  ├─ evaluate.ts             ← srtEvaluate (DP monotonă per pitch, F1, rhythmAcc, stele)
│  │  ├─ generator.ts            ← srtGenerate (Mulberry32, profiluri P1.a–P2.c, apoi P3–P6 în V3)
│  │  ├─ slicer.ts               ← srtSlicePiece (V2)
│  │  ├─ recorder.ts             ← srtRecordInput, fereastra [-250 ms, T + 250 ms]
│  │  ├─ ledger.ts               ← srtLedgerUpdate, Web Locks (attempt lock + ledger lock), backup sightLedger
│  │  ├─ flow.ts                 ← mașina de stări pură srtTransition + controller UI (preview 20s, pendingSave)
│  │  ├─ adaptive.ts             ← protocolul de estimare a nivelului (V3)
│  │  └─ *.test.ts               ← teste unitare Vitest (model, fingerprint, evaluate, generator, slicer, adaptive)
│  ├─ i18n/
│  │  ├─ index.ts                ← t(), tl(), setLang(), formatare Intl
│  │  ├─ keys.d.ts               ← tipuri generate automat din en/strings.json
│  │  └─ locales/
│  │     ├─ en/ strings.json  music.json  units.json  glossary.json  quizzes.json  summaries.json
│  │     │      lessons/<id>.html
│  │     └─ ro/ … (aceeași schemă)
│  ├─ audio/                     ← context, sampler, sinteză, metronom, detecție pitch
│  ├─ midi/                      ← WebMIDI, parser Web Bluetooth MIDI
│  ├─ notation/                  ← portativ SVG, falling notes, adaptor OSMD
│  ├─ modes/                     ← learn, read, ear, drill, accomp, sing, play, analyze, plan, progress
│  ├─ ui/                        ← drawer setări, nav, dock, dialoguri
│  ├─ styles/                    ← CSS modularizat
│  ├─ sw.ts                      ← service worker (compilat prin vite-plugin-pwa injectManifest)
│  └─ test-api.ts                ← hook-uri pentru Playwright (window.__etude)
├─ assets/piano/piano-21.mp3 … piano-108.mp3   ← primesc hash la build
├─ tests/                        ← Playwright E2E (app, android-adaptive-ux, sight-reading-*, etc.)
├─ i18n-framework/               ← validatorul adaptat să citească din src/i18n/locales/
├─ vite.config.ts  tsconfig.json  eslint.config.js
└─ .github/workflows/ci.yml
```

### 1.4. Reguli de arhitectură verificate automat (ESLint / CI)

1. `src/theory/**` și modulele pure din `src/sight-reading/{model,fingerprint,evaluate,generator,slicer,adaptive}.ts` nu importă nimic din `dom`, `audio`, `ui` sau `modes` și nu accesează `window` sau `document` (`no-restricted-imports` + `no-restricted-globals`).
2. Importurile circulare sunt interzise (`eslint-plugin-import-x/no-cycle`).
3. Codul nu conține ramuri pe limbă (`lang === 'ro'`). Tot ce depinde de limbă stă în `locales/` sau se rezolvă cu `Intl.*`.
4. Componentele noi se abonează la store în loc să apeleze în cascadă funcții globale de re-randare.

### 1.5. Strategia de caching în Service Worker (`src/sw.ts` cu `injectManifest`)

| Resursă | Strategie | Motiv |
|---|---|---|
| `etude.html` | Network-first cu timeout (8000 ms) | Păstrează garanția actuală: utilizatorul primește mereu copia proaspătă când e online și nu rămâne blocat pe o versiune veche. |
| JS, CSS, chunk-ul OSMD, chunk-uri de limbă (cu hash) | Precache la instalare + Cache-first | Fișiere imutabile; funcționare 100% offline pentru toate limbile, lecțiile și studiul partiturilor. |
| Cele 30 de sample-uri `piano-<midi>.<hash>.mp3` (~2 MB total) | Precache la instalare + Cache-first (cu `{ cache: 'default' }`) | Încărcare prioritară a octavei centrale (`48..84`) la prima vizită, partajarea cache-ului HTTP între pagină și SW și funcționare completă offline. |
| `manifest.webmanifest`, `icons/*` | Stale-while-revalidate | URL-uri fixe fără hash. |

---

## Partea II — Fazele 0–4: Fundația Arhitecturală (Build, Assets, ESM, i18n)

### Faza 0: Igienă Git și Măsurători de Referință (~0.5 zile)

- [ ] **Curățarea arborelui de lucru:**
  - Decide și aplică sau salvează pe branch dedicat conținutul din `stash@{0}` (care conține implementarea notației germane `H / B` în `etude.html`).
  - Asigură-te că branch-urile de lucru sunt fie integrate în `main`, fie înghețate până la finalizarea Fazelor 1–4.
  - Izolează testele neurmărite care vizează funcționalități neintegrate încă (de ex. `tests/e2e-localization.spec.mjs` pentru cele 5 limbi în lucru, sau `tests/german-notation.spec.mjs` dacă notația germană nu este aplicată pe `main`).
- [ ] **Crearea `.gitignore` și curățarea fișierelor compilate din indexul Git:**
  - `.gitignore` va conține: `node_modules/`, `dist/`, `test-results/`, `i18n-framework/test-results/`, `__pycache__/`, `*.pyc`, `.agents/`, `.hermes/`.
  - Elimină din tracking fișierele `.pyc` și `.last-run.json` comise anterior:
    ```bash
    git rm -r --cached i18n-framework/__pycache__ i18n-framework/test-results
    ```
- [ ] **Tag și baseline:**
  - Aplică tag-ul `pre-migration`.
  - Rulează suita Playwright și `python -m unittest discover -s i18n-framework -p "test_*.py" -v` și înregistrează metricile de referință (număr de teste verzi, timp de execuție, bytes transferați la prima vizită și la reload).

**Criteriu de ieșire Faza 0:** `git status` curat, tag `pre-migration` prezent, 100% teste active verzi.

---

### Faza 1: Scheletul Vite + Service Worker Precache (~0.5–1 zi)

> **De ce Service Worker-ul intră din Faza 1:** Vite extrage automat orice tag `<style>` inline din `etude.html` într-un fișier extern `assets/etude-<hash>.css`. Dacă vechiul `sw.js` ar rămâne neschimbat, aplicația ar rămâne fără CSS în mod offline.

- [ ] Instalează dependențele de build: `npm i -D vite typescript vite-plugin-pwa`.
- [ ] Configurează `vite.config.ts`:
  - `base: './'` (pentru ca aplicația să funcționeze atât în rădăcină, cât și sub `/etude/` pe GitHub Pages);
  - `server: { open: '/etude.html' }` (pentru ca `npm run dev` să deschidă direct `/etude.html`, fără a crea un `index.html` fals);
  - `build.rollupOptions.input: { etude: 'etude.html' }`;
  - `VitePWA({ strategies: 'injectManifest', srcDir: 'src', filename: 'sw.ts', injectRegister: null, manifest: false })`.
- [ ] Mută `manifest.webmanifest` și `icons/` în `public/`.
- [ ] Transformă `sw.js` în `src/sw.ts`:
  - Păstrează logica network-first cu timeout de 8000 ms pentru `etude.html` și stale-while-revalidate pentru `manifest.webmanifest` și `icons/*`;
  - Adaugă în precache intrările generate în `self.__WB_MANIFEST` folosind `{ cache: 'default' }` pentru resursele cu hash din `assets/`, iar la `activate` șterge cache-urile cu versiuni vechi (`VERSION = 'etude-shell-v3'`).
- [ ] Actualizează `package.json` (`"dev": "vite"`, `"build": "vite build"`, `"preview": "vite preview --port 8787 --strictPort"`, `"test": "npm run build && playwright test"`) și `playwright.config.mjs` (`webServer.command` pornește `npm run preview`; verifică oprirea oricărui proces `python -m http.server` rămas pe portul 8787, astfel încât `reuseExistingServer` să nu folosească serverul vechi).
- [ ] Configurează `.github/workflows/deploy.yml` pentru a construi și publica `dist/` pe GitHub Pages, păstrând URL-ul live `https://maurs9.github.io/etude/etude.html`.

**Criteriu de ieșire Faza 1:** Build-ul produce `dist/etude.html` și `dist/sw.js`, toate testele Playwright trec pe `vite preview`, iar pagina funcționează cu CSS complet și în mod offline.

---

### Faza 2: Extragerea Sample-urilor MP3 și a Bibliotecii OSMD (~1–2 zile)

Această fază reduce `etude.html` de la **4.96 MB la ~950 KB** (înainte de minificare).

- [ ] **Extragerea celor 30 de sample-uri de pian:**
  - Scrie și rulează scriptul `scripts/extract-samples.mjs` care citește `#piano-recordings` din `etude.html`, decodează base64 pentru fiecare cheie (`21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84, 87, 90, 93, 96, 99, 102, 105, 108`), salvează `assets/piano/piano-<midi>.mp3` și șterge linia L2064 din `etude.html`.
  - Păstrarea celor 30 de fișiere individuale menține comportamentul din `preparePiano()` (care încarcă prioritar cele 13 note centrale `MIDI 48..84` din `PIANO_WARM`, apoi restul în `pianoIdleWarm()`) și elimină parsarea JSON de 2.7 MB + bucla `atob()`.
  - Expune harta URL-urilor cu hash (`import.meta.glob('/assets/piano/*.mp3', { eager: true, query: '?url', import: 'default' })`) și actualizează:
    - `pianoKeys()` → returnează constanta `[21, 24, ..., 108]`;
    - `pianoDecode(key)` → face `fetch(PIANO_URLS[key]).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }).then(buf => ctx.decodeAudioData(buf))`.
- [ ] **Extragerea OpenSheetMusicDisplay 1.9.9:**
  - Extrage liniile L2065–2066 din `etude.html` în `src/vendor/osmd-1.9.9.min.js` (păstrând exact bundle-ul UMD verificat cu `scorePatchOsmd()`).
  - Textul licenței BSD-3-Clause de la L2051 rămâne în HTML.
  - Definește un loader **idempotent**:
    ```js
    let osmdPromise = null;
    window.loadOsmd = function loadOsmd() {
      if (window.opensheetmusicdisplay) return Promise.resolve(window.opensheetmusicdisplay);
      return osmdPromise ||= import('./vendor/osmd-1.9.9.min.js')
        .then(m => (window.opensheetmusicdisplay = m.default ?? window.opensheetmusicdisplay));
    };
    ```
  - În `scoreRender()` (L7995) și `anReadXml()` (L9062) — ambele deja `async function` — apelează `await loadOsmd()` înainte de folosirea `opensheetmusicdisplay`.
  - În [tests/app.spec.mjs](../../tests/app.spec.mjs#L936) la liniile 936 și 950 (testele de arhivă `.mxl`), adaugă `await loadOsmd();` la începutul `page.evaluate`, înainte de citirea `opensheetmusicdisplay.MXLHelper.MXLtoXMLstring`. Fiind idempotent, apelul ulterior `await loadOsmd()` din `anReadXml` nu va suprascrie spionul atașat de `spyUnpack`.
- [ ] **Test E2E offline dedicat:**
  - Verifică faptul că după prima încărcare și instalarea Service Worker-ului, cu `await context.setOffline(true)` și `await page.reload()`, atât redarea notelor de pian cât și afișarea unei partituri în `#analysis` funcționează fără erori.

**Criteriu de ieșire Faza 2:** `etude.html` < 1 MB, toate testele Playwright + testul offline sunt verzi.

---

### Faza 3: Scriptul devine Modul ES + Puntea de Compatibilitate + Vitest (~1–2 zile)

- [ ] Extrage CSS-ul (L23–1321) în `src/styles/app.css` și scriptul principal în `src/legacy/app.js`, importate din `src/main.ts` (`<script type="module" src="/src/main.ts"></script>`).
- [ ] **Construiește puntea de compatibilitate pentru testele Playwright (respectând regula ESM *Live Read-Only Bindings*):**
  - *Atenție la specificația ES Modules:* Un modul extern `expose.js` **nu** poate face `binding = v` pe o variabilă importată cu `import { binding } from './app.js'` (ar arunca `TypeError: Assignment to constant variable`).
  - De aceea, funcția `installWindowBridge(window)` se definește **chiar la finalul fișierului `src/legacy/app.js`** (în același scope de modul în care sunt declarate variabilele `let`), fără a fi nevoie să modificăm sutele de referințe interne la `actx`, `lang`, `notation` etc.:
    - Expune cu `Object.assign(window, { ... })` funcțiile și obiectele doar-citite de cele 214 apeluri `page.evaluate` (`show`, `t`, `tl`, `setLang`, `startSession`, `endSession`, `buildQueue`, `ensureAudio`, `noteName`, `pcName`, `spelledName`, `scaleDisp`, `openDrawer`, `singStopAll`, `reviewItem`, `fallName`, `$`, `SES`, `ITEMS`, `AN`, `SCORE`, `PRAC`, `SR`, `RD`, `sing`, `pianoBank`, `SYNC`, `lfoGain`, `data`, `explorePreview` etc.).
    - Declară cu `let` (în loc de `function`) **cele 7 funcții cărora testele le fac monkey-patch** (`pianoDecode`, `makePianoVoice`, `previewNote`, `preparePiano`, `anInflatedSize`, `playInterval`, `syncPull`) și expune-le — împreună cu **cele 5 variabile `let` modificate din teste** (`actx`, `theme`, `localSynth`, `lang`, `notation`) — prin `Object.defineProperty(window, name, { get: () => localBinding, set: v => { localBinding = v; }, configurable: true })` direct din interiorul `src/legacy/app.js`.
- [ ] **Actualizează cele 2 teste cu `readFileSync` din [tests/app.spec.mjs](../../tests/app.spec.mjs):**
  - La L39 (`no string key is defined twice in a language`) și L1512 (`unused leftovers stay removed`), schimbă calea citită din `'../' + APP` în `'../src/legacy/app.js'`. (La Faza 4, testul de la L39 se șterge complet, fiind înlocuit de verificarea `object_pairs_hook=unique` din `validator.py`).
- [ ] Instalează și configurează **Vitest** (`npm i -D vitest`) și **ESLint** (`eslint.config.js` cu `no-undef`, `no-implicit-globals`, `import-x/no-cycle`).

**Criteriu de ieșire Faza 3:** Toate cele 134 de teste Playwright trec, `npm run test:unit` (Vitest) și `npm run lint` (ESLint) rulează curat.

---

### Faza 4: Separarea Traducerilor și a Conținutului Educațional (~3–4 zile)

- [ ] **Extragerea conținutului în `src/i18n/locales/{en,ro}/`:**
  - Folosind logica din `i18n-framework/inventory.cjs`, extrage din `src/legacy/app.js`:
    - `strings.json`: toate cele 1.354 de chei din `STRINGS` + cele 8 blocuri `Object.assign(STRINGS.en/ro, ...)`;
    - `music.json`: cele 7 dicționare muzicale (`intervals` [24], `scales` [19], `chords` [25], `categories` [4], `inversions` [6], `feels` [17], `songs` [12]);
    - `units.json` (8 unități), `glossary.json` (55 termeni), `quizzes.json` (22 quiz-uri / 102 întrebări), `summaries.json` (22 tabele / 100 rânduri);
    - `lessons/<id>.html`: cele 22 de lecții ca fișiere HTML individuale, importate cu `?raw`.
- [ ] **Gestionarea încărcării limbilor și `setLang`:**
  - Înlocuiește verificările `if (STRINGS[v])` din `loadAll()` (L9829) și `SYNC_PREFS.lang` (L9724) cu `if (SUPPORTED_LANGS.has(v))`.
  - **Opțiunea A (recomandată pentru simplitate și zero condiții de cursă):** Dicționarele ușoare de UI (`strings.json` + `music.json`, ~12–15 KB gzip/limbă) sunt incluse sincron, iar doar corpurile grele de lecții (`lessons`, `quizzes`, `glossary`, folosite exclusiv în modul *Learn*) sunt încărcate leneș la deschiderea modului *Learn*. Astfel, `setLang()`, `loadAll()` și `SYNC_PREFS.lang` rămân 100% sincrone.
  - **Opțiunea B (încărcare leneșă completă per limbă, când se activează toate cele 7 limbi):** `main.ts` face `await loadLocale(initialLang)` înainte de a expune `window.show`; `setLang(l)` folosește un token de cerere, apelează `rdOnLocale()` și `saveAll()` după rezolvarea importului și **returnează `Promise`-ul** pentru ca `await page.evaluate(() => setLang('ro'))` din Playwright să aștepte finalizarea.
- [ ] **Tipizare și eliminarea ramurilor `lang === 'ro'`:**
  - Generează `src/i18n/keys.d.ts` din `en/strings.json` pentru verificarea la compilare a cheilor din `t(key)`.
  - Elimină toate cele 24 de ramuri `lang === 'ro'` din cod, mutând datele în `locales/` și folosind `Intl.Collator`, `Intl.ListFormat`, `Intl.NumberFormat` și `Intl.DateTimeFormat`.
- [ ] **Adaptarea validatorului `i18n-framework/validator.py`:**
  - Validatorul citește direct din `src/i18n/locales/<lang>/` și verifică paritatea structurală, mulțimea de substituții (`%s`, `%a`, `%b`), absența cheilor duplicate și integritatea atributelor HTML (`data-demo`, `data-staff`, `data-widget`, `data-go`, `data-cat`, `class`, `href`). Testul manual de chei duplicate din `app.spec.mjs` (L39) este preluat de validator.

**Criteriu de ieșire Faza 4:** Validatorul i18n trece cu 0 erori pentru `en` și `ro`, `grep "lang === 'ro'"` în `src/` returnează 0 apariții, suita Playwright trece 100%.

---

## Partea III — Faza 5: Sight-Reading Adaptiv v3 (Specificația Completă și Implementarea MVP `M0`–`M10`)

> **De ce Faza 5 este plasată exact aici:** După Faza 4, avem Vite, TypeScript, Vitest, Service Worker-ul nou și `locales/` gata. Putem construi întregul Sight-Reading v3 direct ca module TypeScript curate în `src/sight-reading/*.ts` (fără a mai scrie în monolit), rulând testele pe funcții pure (`M1`, `M2`, `M5` — 12.000 de generări) în milisecunde cu **Vitest** și testele de integrare DOM / Web Locks (`M3`, `M4`, `M6`, `M7`, `M8`, `M9`, `M10`) cu **Playwright**.

### 5.1. Cadrul de produs, cercetarea externă și limitele asumate

#### Ce preluăm din cercetarea externă
- Descrierea oficială Piano Marvel menționează preview de 20 de secunde, avans la minimum 80% și oprire după trei strike-uri. Acestea documentează produsul lor, nu validează un algoritm propriu Étude.[1]
- Complete Music Reading Trainer descrie exerciții progresive și mai multe modalități de input, inclusiv claviatură virtuală și MIDI. Reținem ideea de exerciții focalizate și accesibile prin mai multe inputuri.[2]
- Sight Reading Factory descrie personalizarea ambitusului, ritmurilor și salturilor; aceeași pagină precizează că funcția respectivă nu este disponibilă pentru pian. Folosim ideea de constrângeri ca inspirație, fără a atribui pianului funcții neconfirmate.[3]

#### Ce NU afirmăm
- Scorul Étude nu este SASR și nu se convertește în scor SASR.
- „Look-ahead” și digitația propusă sunt funcții de antrenament de evaluat, nu garanții de progres.
- Prima vedere înseamnă „prima expunere înregistrată în acest profil local”, nu absența oricărei expuneri în viața utilizatorului.
- Rezultatele din surse de input diferite nu sunt presupuse comparabile înainte de verificarea latenței.

#### Maparea celor 4 moduri în UI (`#rd-mode` / stare)

| Mod conceptual | Mapare în UI (`#rd-mode` / stare) | Ajutoare permise | Reluări | Rezultat |
|---|---|---|---|---|
| **Practică pas cu pas** | Butonul existent `learn` („Pas cu pas”) | Indicii opționale, mâini separate, `Listen`, ținte pe clape | Nelimitate | Progres de practică; consumă eligibilitatea de primă vedere a piesei afișate |
| **Prima încercare în tempo** | Butonul `assess` pe o piesă generată **neexpusă încă** (când coordonarea registrului este disponibilă) | Fără `Listen`, fără ținte pe clape, fără nume de note pe portativ, fără acompaniament automat | **O singură încercare** eligibilă pe conținut local nou (preview 20 s → count-in 1 măsură → execuție) | Scor detaliat + statut `firstSight: true` salvat în `etude-sight-v1` |
| **Practică în tempo** | Același buton `assess` după consumarea primei încercări, pe piese de repertoriu fixe sau după apăsarea „Treci în practică” | Configurabile (inclusiv BPM, `Listen`, mâini separate) și vizibile în rezultat | Nelimitate | Scor detaliat din același evaluator `srtEvaluate`, etichetat `practice` |
| **Evaluare adaptivă — V3** | Sesiune dedicată din Drills (`RD` mode `test` pe unitatea `sr`) | Reguli fixe pe sesiune | Fragmente noi | Nivel estimat Étude, experimental (livrabil Faza 8 / V3) |

**De ce această mapare UI:** Păstrăm selectorul `#rd-mode` compact (esențial la lățimea de 320 px pe mobil) și evităm aglomerarea barei de control cu 4 butoane permanente. Când o piesă nouă din generator este pregătită în modul `assess`, panoul obține mai întâi rezervarea exclusivă (`claiming`), apoi intră în starea `preview` (20 s cronometru vizibil, buton primar „Pornește acum” și buton secundar „Treci în practică”). După finalizare sau trecerea în practică, piesa rămâne disponibilă oricând pentru „Practică în tempo” și „Practică pas cu pas”.

#### În afara MVP (Faza 5)
Import arbitrar MusicXML în evaluarea nouă, măsura 6/8, pedală evaluată, legato/articulații punctate, digitație generală, clasamente, backend și echivalare cu examene externe.

---

### 5.2. Arhitectura Sight-Reading v3, Modelul Muzical și Fingerprint-ul FNV-1a

Fluxul propus (funcțiile de model, fingerprint și evaluare sunt **sincrone și pure**; doar mutațiile registrului `srtLedgerUpdate` sunt serializate prin Web Locks):

```text
profil + seed → srtGenerate → srtValidatePiece → srtFingerprint (sincron)
                                                       ↓
                             attempt lock → srtLedgerUpdate(claimExposure) [scurt]
                                                       ↓
preview (20s) → count-in → recorder (on/off) → srtEvaluate → srtLedgerUpdate(finishAttempt)
                                 ↓                                       ↓
                         onInputChange extins                   UI / etude-sight-v1
```

#### Contractele funcțiilor (`src/sight-reading/`)
- `srtGenerate(profile, seed)` (`generator.ts`): model determinist, pur, sincron, independent de DOM și ceas.
- `srtValidatePiece(piece, profile)` (`model.ts`): validare structurală, ritmică și de profil (sincronă, pură).
- `srtToLegacyPiece(piece)` (`model.ts`): adaptor sincron pentru `srRender`, care atașează fiecărei note generate un `eventId` stabil pentru maparea `nid ↔ expectedNote.id`.
- `srtCanonicalString(piece)` (`fingerprint.ts`): serializare canonică deterministă a conținutului muzical.
- `srtFingerprint(piece)` (`fingerprint.ts`): funcție **pură și sincronă** care aplică FNV-1a 64-bit peste `srtCanonicalString(piece)` și returnează `v1:<hex16>`.
- `srtBuildExpected(piece, config)` (`model.ts`): evenimente evaluate în milisecunde (`id`, `midi`, `hand`, `onMs`, `offMs`).
- `srtEvaluate(expected, performed, config)` (`evaluate.ts`): evaluator pur, sincron și reproductibil.
- `srtTransition(state, event)` (`flow.ts`): mașina de stări pură a sesiunii, fără efecte secundare.
- `srtLedgerUpdate(operation)` (`ledger.ts`): acces coordonat prin Web Locks la `localStorage['etude-sight-v1']`; nu este funcție pură.
- `srtSlicePiece(piece, startBar, endBar)` (`slicer.ts`): livrabil V2 (Faza 8).

#### Reprezentarea muzicală (schema `v1`)

```js
{
  schemaVersion: 1,
  generatorVersion: 1,
  profileId: 'P1.a',
  seed: 42,
  meter: { num: 4, den: 4 },
  ticksPerQuarter: 480,
  key: { tonic: 'C', mode: 'major', keyN: 0 },
  bars: 4,
  events: [
    { id: 'rh-0', hand: 'rh', onsetTick: 0, durationTick: 480,
      pitches: [{ midi: 60, spelling: 'C4', finger: 1 }] }
  ]
}
```

Reguli:
1. `pitches: []` reprezintă o pauză, nu un eveniment de evaluat ca notă.
2. Timpul muzical se stochează în ticks întregi (`ticksPerQuarter = 480`); conversia în beats se face în adaptorul `srtToLegacyPiece`.
3. Un acord este un eveniment cu mai multe înălțimi în `pitches` (ordonate crescător după `midi`, apoi lexicografic după `spelling`), nu o ordine obligatorie de apăsare.
4. Durata fiecărei voci umple exact măsurile (`bars * meter.num * (480 * 4 / meter.den)` ticks); nu deducem sfârșitul piesei doar din ultima notă atacată.
5. În MVP nu există anacruze, schimbări de măsură, voci suprapuse în aceeași mână sau legături peste bara de măsură.
6. Obiectele partiturii nu se modifică în timpul execuției. Rezultatele au structură separată.

#### Identitatea conținutului: Specificare Exactă și Vectori de Test (`srtFingerprint`)

Fingerprint-ul se calculează dintr-o serializare canonică versionată (`srtCanonicalString(piece)`) care include exclusiv măsura, `ticksPerQuarter`, tonalitatea/armura, numărul de măsuri și evenimentele muzicale ordonate după `(hand, onsetTick)`. Nu includem seed-ul, titlul, limba, tema, BPM-ul, `event.id`, `finger` sau `profileId`.

**Formatul exact al stringului canonic (`v1`):**
```text
v1|meter=<num>/<den>|tpq=<ticksPerQuarter>|key=<keyN>:<tonic>:<mode>|bars=<bars>|events=<ev0>;<ev1>;...
```
unde fiecare eveniment `<ev>` (ordonat după `hand` în ordinea `'lh' < 'rh'`, apoi crescător după `onsetTick`) este serializat ca:
- pentru pauză (`pitches.length === 0`): `<hand>:<onsetTick>:<durationTick>:R`
- pentru notă sau acord (`pitches` sortat crescător după `(midi, spelling)`): `<hand>:<onsetTick>:<durationTick>:<midi0>:<spelling0>,<midi1>:<spelling1>,...`

**Algoritmul exact de hash (`srtFingerprint` — FNV-1a 64-bit peste UTF-8):**
Folosim FNV-1a pe 64 de biți (`BigInt`) peste octeții UTF-8 (`new TextEncoder().encode(canonicalStr)`), astfel încât funcția să fie 100% sincronă și disponibilă inclusiv pe HTTP pe IP local în LAN (`http://192.168.x.x:8787`, unde `crypto.subtle` este indisponibil):
- `offset_basis = 0xcbf29ce484222325n`
- `prime = 0x100000001b3n`
- `mask = 0xffffffffffffffffn`
- Pentru fiecare octet `b` din reprezentarea UTF-8:
  `hash ^= BigInt(b); hash = (hash * prime) & mask;`
- Rezultat returnat: `'v1:' + hash.toString(16).padStart(16, '0')` (16 cifre hexazecimale lowercase).

**Vectori de referință obligatorii:**
1. `v1|meter=4/4|tpq=480|key=0:C:major|bars=1|events=rh:0:480:60:C4;rh:480:480:62:D4;rh:960:960:60:C4`
   → Fingerprint: `v1:e8020957ec2a1005`
2. `v1|meter=4/4|tpq=480|key=0:C:major|bars=1|events=rh:0:480:60:C4;rh:480:480:R;rh:960:960:60:C4`
   → Fingerprint: `v1:8472a9986749aba1`

---

### 5.3. Recorder, Pipeline de Input și Ceas

#### Conectarea la pipeline-ul de input
1. `handleNoteOn(midi, vel, source = 'midi')` apelează `onInputChange('on', midi, source, null)` atunci când nota trece din neapăsată în apăsată (`!held.has(midi)` înainte de adăugare).
2. `handleNoteOff(midi, source = 'midi', releaseKind = 'physical')` apelează `onInputChange('off', midi, source, releaseKind)` atunci când ultimul proprietar din `inputOwners` eliberează nota.
3. `releaseFocusInput()` și `releaseLiveInput()` transmit `releaseKind = 'focus'` (respectiv `'reset'` în `panic()`), astfel încât recorderul știe dacă eliberarea a fost fizică sau tehnică.
4. Când `view0() === 'read'` și recorderul `SR` este activ, `onInputChange` trimite evenimentul către `srtRecordInput(kind, midi, source, releaseKind, performance.now())`.

#### Evenimente înregistrate și reguli de fereastră

```js
{
  id: 'input-17',
  midi: 60,
  onMs: 1000,
  offMs: 1480,
  source: 'midi',
  releaseKind: 'physical'
}
```

- Timpurile sunt relative la începutul execuției (`SR.t0`) și provin din același ceas monoton (`performance.now()`) ancorat la `actx.currentTime` la startul count-in-ului.
- `offMs` rămâne `null` până la eliberare; la finalul capturii (`T + 250 ms`) nu inventăm un note-off fizic (`offMs: null`, `releaseKind: null`).
- `onMs = 0` este primul timp al piesei, nu începutul count-in-ului.
- Recorderul **nu** primește notele produse de metronom (`srClick`), `previewNote`, `srListen` sau acompaniamentul mâinii inactive (`srPlayGap`).
- Mesajele duplicate pe o notă deja ținută nu produc atacuri fictive. Repetarea reală după note-off produce un atac nou.
- Nu atribuim mâna pe baza canalului MIDI. În MVP mâna este aleasă dinainte; V2 raportează pe mâini doar când atribuirea este neambiguă.
- Clapele deja apăsate înainte de deschiderea ferestrei de captură (`< -250 ms`) sunt ignorate până la eliberare și reapăsare. Un note-on efectiv în intervalul `[-250 ms, 0)` este evaluabil după regulile normale de asociere, chiar dacă nota rămâne ținută peste începutul piesei.
- Fereastra de captură este `[-250 ms, T + 250 ms]`, unde `T` este calculat din durata completă în ticks a măsurilor, inclusiv pauzele finale. Numai după bariera `T + 250 ms` înghețăm recorderul, rulăm `srtEvaluate` și intrăm în `completed`.
- **Fără colorare contradictorie în timp real:** În timpul stării `playing` (atât în „Prima încercare în tempo”, cât și în „Practică în tempo”), pe portativ avansează doar cursorul (`srCursor`). La intrarea în `completed`, fiecare notă de pe portativ primește `data-s` corespunzător clasificării din `srtEvaluate` (`good`, `near`, `bad`).
- MVP folosește `latencyOffsetMs: 0`. O schimbare de sursă (`midi`, `ble`, `kb`, `ptr`) în timpul primei încercări setează `mixedInput: true`.
- Ascunderea paginii (`visibilitychange`), suspendarea contextului audio, deconectarea instrumentului MIDI sau `panic()` opresc eligibilitatea și trec încercarea în `interrupted` (fără strike).

---

### 5.4. Evaluatorul (`srtEvaluate`): Reguli, Formule și Vectori de Acceptare

#### Asocierea notelor (`scoringVersion: 1`)
1. Extindem acordurile în note așteptate individuale cu ID-uri stabile (`event.id + ':' + midi`). Selectăm doar mâna evaluată.
2. Construim candidați numai pentru **aceeași înălțime MIDI** și distanță temporală `|performed.onMs - expected.onMs| <= windowMs`.
3. Fereastra maximă este `250 ms`. Pentru aceeași înălțime MIDI repetată apropiat, fereastra unei note așteptate este `min(250, 0.45 * minNeighborDeltaMs)`, unde `minNeighborDeltaMs` este cel mai mic interval temporal până la atacul așteptat anterior sau următor al aceleiași înălțimi MIDI. Pentru o singură apariție a acelei înălțimi rămâne `250 ms`.
4. Asocierea se rezolvă independent pe fiecare înălțime MIDI prin **programare dinamică monotonă** (fără inversarea ordinii atacurilor aceleiași înălțimi):
   - Maximizăm numărul de note asociate (`TP`),
   - La egalitate, minimizăm suma erorilor absolute `sum(|onMs_perf - onMs_exp|)`,
   - La egalitate, preferăm perechile cu timp așteptat mai mic, apoi timp executat mai mic, apoi ID stabil.
5. Notele simultane cu înălțimi diferite (acorduri) sunt evaluate pe pitch-uri diferite, deci pot fi apăsate în orice ordine în interiorul ferestrei lor.
6. O notă așteptată neasociată este `missed` (`FN`); un atac executat neasociat în `[-250 ms, T + 250 ms]` este `extra` (`FP`).

#### Clasificarea temporală (limite incluzive `<=`)
- `good`: asociată, cu `|errorMs| <= 100`.
- `near`: asociată, cu `100 < |errorMs| <= 180` (și `<= windowMs`).
- `lateOrEarly`: asociată valid în fereastra admisă (`180 < |errorMs| <= windowMs`). Contribuie la `TP`, dar primește `0` puncte la `rhythmAcc`.
- `missed`: nu există asociere validă.

#### Formule, stele și obiectul returnat

Notând cu `N` numărul de note așteptate, `TP = good + near + lateOrEarly`, `FN = N - TP`, `FP` atacurile suplimentare în `[-250 ms, T + 250 ms]`, `G` numărul de asocieri `good` și `Q` numărul de asocieri `near`:

```text
pitchPrecision = TP / (TP + FP), sau 0 când TP + FP === 0
pitchRecall    = TP / N
pitchF1        = 100 * (2 * TP) / (2 * TP + FP + FN)
rhythmAcc      = 100 * (G + 0.5 * Q) / N
score          = min(pitchF1, rhythmAcc)
```

- `N = 0` produce `status: 'invalid'`, cu scoruri `null`. Pentru `N > 0` și tăcere (`TP = 0, FP = 0`), toate scorurile sunt `0`.
- Deciziile de stele și eligibilitate folosesc valorile în virgulă mobilă nerotunjite; rotunjim (`Math.round`) numai la afișare.
- O substituție greșită produce `1 FN` + `1 FP`.
- Atacurile `extra` (`FP`) al căror `onMs` cade strict în interiorul unei pauze notate (și în afara ferestrelor de asociere ale notelor vecine) sunt raportate în `restViolations` și blochează acordarea a 3 stele.
- **Stele:**
  - **3 stele:** `score >= 95`, `FP === 0` și `restViolations === 0`.
  - **2 stele:** `score >= 80` (dacă nu sunt îndeplinite condițiile pentru 3 stele).
  - **1 stea:** `score >= 60`.
  - **0 stele:** `score < 60`.
  - **„Perfect”:** `G === N && FN === 0 && FP === 0`.
- **Câmpurile obiectului returnat:** `status`, `scoringVersion: 1`, `N`, `TP`, `FP`, `FN`, `G`, `Q`, `lateOrEarlyCount`, `restViolations`, `pitchPrecision`, `pitchRecall`, `pitchF1`, `rhythmAcc`, `score`, `stars`, `perfect`, `meanOffsetMs`, `meanAbsoluteOffsetMs`, `noteResults` (`expectedId`, `classification`, `matchedInputId`, `errorMs`), `extraInputs`.

#### Vectori de acceptare (`N = 4`)

| Execuție | TP / FP / FN | G / Q | pitchF1 | rhythmAcc | score | Stele |
|---|---|---|---:|---:|---:|---:|
| Perfectă | 4 / 0 / 0 | 4 / 0 | 100 | 100 | 100 | 3 |
| O substituție greșită | 3 / 1 / 1 | 3 / 0 | 75 | 75 | 75 | 1 |
| Toate corecte + 1 atac suplimentar | 4 / 1 / 0 | 4 / 0 | 88.888889 | 100 | 88.888889 | 2 (FP > 0) |
| Trei la timp și una `near` | 4 / 0 / 0 | 3 / 1 | 100 | 87.5 | 87.5 | 2 |
| Patru asociate, dar una `lateOrEarly` (220 ms) | 4 / 0 / 0 | 3 / 0 | 100 | 75 | 75 | 1 |
| Tăcere | 0 / 0 / 4 | 0 / 0 | 0 | 0 | 0 | 0 |

---

### 5.5. Mașina de Stări, Protocolul celor Două Lock-uri Web Locks și Persistența (`etude-sight-v1`)

#### Stările sesiunii (`srtTransition`)

```text
idle → preparing → claiming → preview → countIn → playing → completed (saved)
                        ↓         ↓         ↓          ↓         ↓
                     blocked   abandoned  abandoned  interrupted pendingSave → saved / abandoned
```

#### Protocolul exact al celor două lock-uri (`claiming`, `pendingSave`, `recoverOrphanClaims`)
1. **Ordinea la rezervare (`claiming`):**
   - Pasul 1: Generează `attemptId` și dobândește `navigator.locks.request('etude-sight-attempt-' + attemptId, { mode: 'exclusive' }, () => attemptLeasePromise)`. Acest lock rămâne deținut prin promisiunea `attemptLeasePromise` pe toată durata sesiunii (`claiming` → `preview` → `countIn` → `playing` → `completed` / `pendingSave`), dar **nu** înfășoară lock-ul registrului pe durata sesiunii.
   - Pasul 2: După ce callback-ul lui `etude-sight-attempt-<attemptId>` a pornit, apelează `srtLedgerUpdate({ type: 'claimExposure', ... })`, care dobândește exclusiv `etude-sight-ledger-v1` doar pentru câteva milisecunde (citire → validare → scriere în `localStorage`), apoi returnează și **eliberează imediat `etude-sight-ledger-v1`** înainte de `preview`.
   - Dacă `claimExposure` este respins (conținut deja expus), rezolvăm imediat `attemptLeasePromise` pentru a elibera `etude-sight-attempt-<attemptId>` și intrăm în `blocked` / modul `practice`.
2. **Starea `pendingSave` la eșecul salvării după execuție:**
   - Dacă salvarea rezultatului la `completed` eșuează (`QuotaExceededError`), sesiunea intră în `pendingSave`: rezultatul calculat rămâne înghețat pe ecran cu mesajul „Rezultat nesalvat”, iar **lock-ul încercării (`etude-sight-attempt-<attemptId>`) rămâne deținut** cât timp utilizatorul poate apăsa „Reîncearcă salvarea” sau „Continuă fără salvare”.
3. **Ordinea la recuperare (`recoverOrphanClaims`):**
   - Sub blocarea exclusivă `etude-sight-ledger-v1`, citim registrul curent, verificăm `generation` și identificăm rezervările fără rezultat terminal în `attempts`.
   - Pentru fiecare astfel de rezervare, testăm neblocant `navigator.locks.request('etude-sight-attempt-' + attemptId, { ifAvailable: true }, lock => Boolean(lock))`.
   - Dacă `lock` este `null` (tabul proprietar este activ în `preview`, `countIn`, `playing` sau `pendingSave`), rezervarea nu este atinsă.
   - Numai dacă `lock` este obținut și starea din registru este încă neterminată în aceeași `generation`, marcăm încercarea drept `abandoned` și salvăm registrul înainte de eliberarea `etude-sight-ledger-v1`.

#### Schema registrului `localStorage['etude-sight-v1']` și regulile de integritate

```js
{
  schemaVersion: 1,
  generation: 'gen-1762460000000-a1b2',
  revision: 1,
  exposures: {
    // fingerprint → { firstSeenAt, reason, claim: { attemptId, ownerTabId, generation } }
  },
  attempts: {
    // attemptId → rezultat terminal imuabil (status: 'completed' | 'abandoned' | 'interrupted', generation, ownerTabId, ...)
  },
  prefs: { practiceHints: true, lookAhead: false },
  sessions: { /* V3: rezumate versionate */ }
}
```

- **Operații `srtLedgerUpdate`:** `claimExposure`, `recordExposure`, `recordListen`, `finishAttempt`, `abandonAttempt`, `recoverOrphanClaims`, `updatePrefs`, `resetLedger`, `importLedger`.
- **Verificări obligatorii la scriere:**
  - Dacă `operation.generation !== ledger.generation`, operația este respinsă cu `{ ok: false, reason: 'stale_generation' }`.
  - Dacă `attemptId` nu aparține lui `operation.ownerTabId`, operația este respinsă cu `{ ok: false, reason: 'owner_mismatch' }`.
  - Salvarea de două ori a aceluiași rezultat (`same attemptId, same payload`) este idempotentă.
- **Limite de creștere:** Maximum **500** de intrări în `attempts` (ordonate după `(finishedAt, attemptId)`) și maximum **4096** de identități în `exposures` (fără ștergere tăcută). Dacă în `etude-sight-v1` este găsită o `schemaVersion > 1`, datele rămân intacte și se menține doar practica.
- **Guard obligatoriu pentru Web Locks pe conexiuni LAN HTTP:** Deoarece `navigator.locks` este disponibil doar în *Secure Contexts* (`https://` sau `http://localhost`), la testarea pe telefon/tabletă prin IP local (`http://192.168.x.x:8787`) `navigator.locks` este `undefined`. În `src/sight-reading/ledger.ts` se verifică `const hasWebLocks = typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function';` înainte de orice apel; când lipsește, practica funcționează normal, iar modul „Prima încercare” este dezactivat cu explicație în UI.
- **Backup și import (`sightLedger`):**
  - Câmp opțional în exportul `v:3`. Importul rulează sub `etude-sight-ledger-v1`, păstrează `generation`-ul local și rezervările locale active, transformă claim-urile neterminate din fișierul importat în `abandoned`, face reuniunea `exposures` și `attempts`, deduplică rezultatele identice, respinge conflictele pe același `attemptId` și aplică limitele 500 / 4096 și validarea strictă a valorilor.

---

### 5.6. Generatorul Determinist MVP: Profilurile `P1.a`–`P2.c`

| Profil | Măsură | Ambitus | Durate permise | Salt maxim diatonic | Pauze |
|---|---|---|---|---|---|
| `P1.a` | 4/4 | Poziție fixă de 5 note (`C4–G4` RH / `C3–G3` LH) | Pătrimi (`480`), doimi (`960`) | Secundă (pas treptat + repetări) | Nu |
| `P1.b` | 4/4 | Poziție fixă de 5 note | Pătrimi (`480`), doimi (`960`) | Terță | Nu |
| `P1.c` | 4/4 | Poziție fixă de 5 note | Pătrimi (`480`), doimi (`960`) | Terță; cel puțin o notă repetată | Nu |
| `P2.a` | 4/4 | Poziție fixă de 5 note | Pătrimi (`480`), doimi (`960`) | Terță | Pauză de pătrime (`480`, minimum 1) |
| `P2.b` | 3/4 | Poziție fixă de 5 note | Pătrimi (`480`), doimi (`960`) | Terță | Pauză de pătrime (`480`, minimum 1) |
| `P2.c` | 3/4 sau 4/4 (fixată în profil) | Maximum o octavă (`C4–C5` / `C3–C4`) | Pătrimi (`480`), doimi (`960`) | Terță | Pătrime (`480`) sau doime (`960`) când încape |

**Invariante obligatorii:**
- Do major (`keyN: 0`), 4 măsuri, 60 BPM în prima încercare.
- PRNG intern determinist **Mulberry32** pe `seed` întreg pe 32 de biți; `Math.random()` este interzis în `srtGenerate`.
- **Cadența finală în măsura 4** se încheie pe tonică (`C4` / `C3`) folosind exclusiv duratele `[480, 960]`: în `4/4` ultima notă este o doime (`960` ticks) precedată de două pătrimi sau o doime; în `3/4` măsura a 4-a este o pătrime pe timpul 1 urmată de o doime pe tonică pe timpii 2–3 (`480 + 960 = 1440` ticks).
- Nicio măsură complet goală, nicio durată peste bara de măsură, nicio pauză pe primul timp din prima măsură (`onsetTick === 0`).
- Digitație: doar degetul de start pe prima notă pentru poziția fixă de 5 degete (`P1.*`, `P2.a`, `P2.b`); `finger: null` în `P2.c`.

---

### 5.7. Sarcini de Implementare în Faza 5 (`M0`–`M10`, cu TDD în Vitest + Playwright)

| ID | Fișiere create / modificate | Comportamente și criteriu de ieșire | Teste (Vitest + Playwright) |
|---|---|---|---|
| **M0** | Fără schimbări de produs | Verificare baseline după Faza 4: build Vite, Vitest și Playwright verzi. | Suita existentă |
| **M1** | `src/sight-reading/model.ts`, `src/sight-reading/fingerprint.ts`, `src/sight-reading/model.test.ts`, `tests/sight-reading-model.spec.mjs` | Modelul în ticks (`480`), `srtValidatePiece`, adaptorul `srtToLegacyPiece` cu mapare `eventId ↔ nid`, `srtBuildExpected`, `srtCanonicalString` și `srtFingerprint` sincron (FNV-1a 64-bit cu vectorii `v1:e8020957ec2a1005` și `v1:8472a9986749aba1`). | Vitest + `srt:model` |
| **M2** | `src/sight-reading/evaluate.ts`, `src/sight-reading/evaluate.test.ts`, `tests/sight-reading-score.spec.mjs` | Evaluatorul pur `srtEvaluate`: programare dinamică monotonă per înălțime MIDI, restrângerea ferestrei la `45%` pentru note repetate apropiate, independența ordinii în acorduri, vectorii din §5.4, limitele `100 / 180 / 250 ms`, `restViolations` și stele. | Vitest + `srt:score` |
| **M3** | `src/sight-reading/recorder.ts`, `src/legacy/app.js`, `tests/sight-reading-recorder.spec.mjs` | Extinderea `onInputChange(kind, midi, source, releaseKind)` pentru `on` și `off`; ignorarea clapelor ținute înainte de `-250 ms`; captură în `[-250 ms, T + 250 ms]`; excluderea `srClick`, `previewNote`, `srListen`, `srPlayGap`; tratarea `releaseFocusInput` și `panic`. | `srt:recorder` |
| **M4** | `src/sight-reading/flow.ts`, `src/legacy/app.js`, `tests/sight-reading-score.spec.mjs` | Integrarea `srtEvaluate` în modul `assess`: oprirea colorării greedy în `playing`, bariera la `T + 250 ms`, colorarea la `completed`, separarea de `data.sheet[id].best`, popularea `SR.wrongExtra = res.FP` pentru `srNextAssess`, blocarea keyboard-mashing-ului. | `srt:integration` |
| **M5** | `src/sight-reading/generator.ts`, `src/sight-reading/generator.test.ts`, `tests/sight-reading-generator.spec.mjs` | Generatorul determinist `srtGenerate(profile, seed)` pentru `P1.a`–`P2.c`, ambele mâini (`rh`, `lh`), Mulberry32, cadența finală în 4/4 și 3/4 din `[480, 960]`, verificarea invariantelor pe seed-urile `0..999` (12.000 de rulări în Vitest). | Vitest + `srt:generator` |
| **M6** | `src/sight-reading/ledger.ts`, `tests/sight-reading-ledger.spec.mjs` | Registrul `etude-sight-v1` cu Web Locks: `etude-sight-attempt-<id>` înainte de `etude-sight-ledger-v1` scurt, `claimExposure` atomic între două taburi, protecția `pendingSave`, `recoverOrphanClaims` cu `{ ifAvailable: true }`, verificare `generation`, limitele 500 / 4096 și fallback fără Web Locks. | `srt:ledger` |
| **M7** | `src/sight-reading/flow.ts`, `src/legacy/app.js`, `tests/sight-reading-flow.spec.mjs` | Mașina de stări `srtTransition` și integrarea în UI (`rdSightStart`, `rdGenMelody`, `#rd-mode`): `preparing → claiming → preview (20 s) → countIn → playing → completed / pendingSave`, butoanele „Pornește acum” și „Treci în practică”, reîncercarea salvării din `pendingSave`, invalidarea la `Listen` / refresh / pierdere vizibilitate. | `srt:flow` |
| **M8** | `src/sight-reading/ledger.ts`, `src/legacy/app.js`, `tests/sight-reading-ledger.spec.mjs` | Export/import backup cu câmpul opțional `sightLedger`: compatibilitate cu backup-uri `v:3` vechi, păstrarea `generation`-ului local și a rezervărilor active, transformarea claim-urilor importate în `abandoned`, reuniune și respingerea conflictelor pe `attemptId`. | `srt:backup` |
| **M9** | `src/i18n/locales/{en,ro}/strings.json`, `src/sight-reading/flow.ts`, `tests/sight-reading-ui.spec.mjs` | Sumarul explicabil în `#rd-verdict` (Scor înălțimi F1 %, Note atinse `TP / N`, Atacuri suplimentare `FP`, Rhythm Acc %, `meanOffsetMs`, badge Primă vedere vs Practică), simboluri non-culoare (`✓`, `≈`, `✗`, `+`) + `<title>`, `aria-live` doar la schimbarea stării, responsivitate la 320 px și landscape, `prefers-reduced-motion`, supraviețuire la schimbarea limbii/temei/dimensiunii. | `srt:ui` |
| **M10** | `tests/sight-reading-ui.spec.mjs` | Funcționare 100% offline după prima încărcare (inclusiv FNV-1a și evaluarea fără HTTPS), suita completă Vitest + Playwright. | `srt:offline` + suita completă |

---

## Partea IV — Fazele 6–8: Modularizarea Completă, CI/CD și Extensiile Sight-Reading V2/V3

### Faza 6: Modularizarea Domeniilor în TypeScript și Store Reactiv (~2–4 săptămâni, câte un PR pe domeniu)

Se extrage treptat codul rămas în `src/legacy/app.js` în module TypeScript (`strict: true`), în ordinea de la zero dependențe spre UI:

| Ordine | Modul extras | Teste unitare Vitest obligatorii în același PR | Gestionarea cuplajelor din `tests/app.spec.mjs` |
|---|---|---|---|
| 1 | `src/theory/` (`pitch.ts`, `spelling.ts`, `intervals.ts`, `chords.ts`, `scales.ts`, `keys.ts`) | `spelledName` pentru `letter`, `solfege`, `german` (`B`/`H`), enarmonii, detecție acorduri, inversiuni, cercul cvintelor | Funcții 100% pure; regulă ESLint fără importuri din DOM/UI. |
| 2 | `src/core/storage.ts` | Încărcare `ptt-v3`, migrare v2→v3, merge multi-tab (`syncData`, `syncSrs`), backup + `sightLedger` | Apelul intern `syncPull` trece printr-un hook mutabil pentru testul de concurență de la L1326. |
| 3 | `src/core/store.ts` | Semnale reactive (`@preact/signals-core` sau implementare proprie) pentru `lang`, `notation`, `theme`, `labels` | Elimină apelurile manuale în cascadă din `setLang`, `applyNotation` și `SYNC_PREFS`. |
| 4 | `src/midi/` (`webmidi.ts`, `ble-midi.ts`) | Parser pachete BLE MIDI (timestamps, running status, SysEx, note-on cu velocity 0) | — |
| 5 | `src/audio/` (`context.ts`, `sampler.ts`, `synth.ts`, `metro.ts`, `pitch.ts`) | Selecția sample-ului `pianoNearest`, rata de pitch-shift, detecția frecvenței pe semnal sintetic | Deoarece binding-urile ESM `import` sunt read-only, apelurile pentru `pianoDecode`, `makePianoVoice`, `preparePiano`, `previewNote` trec prin `audioHooks` (sau testele L483–635 se actualizează pe `window.__etude.audio`). |
| 6 | `src/notation/` (`staff.ts`, `falling.ts`, `osmd.ts`) | Poziționare diatonică pe portativ, `fallName`, preflight `.mxl` | Hook similar pentru `anInflatedSize` în testele `.mxl` (L950, L1014). |
| 7 | `src/ui/` & `src/modes/*` | Logica de punctaj și selecție a exercițiilor (SRS, Ear, Rhythm, Drills) | Câte un mod pe PR până când `src/legacy/` dispare complet. |

**Criteriu de ieșire Faza 6:** Directorul `src/legacy/` este șters, `tsc --noEmit` trece cu `strict: true`, iar suita Vitest rulează în sub 1 secundă.

---

### Faza 7: Curățenie Finală, API de Test `window.__etude` și CI/CD (~2–3 zile)

- [ ] Înlocuiește `expose.js` cu `src/test-api.ts` (`window.__etude`), inclus în modurile de test/dev, și actualizează apelurile `page.evaluate` din `tests/` să îl folosească explicit.
- [ ] Configurează pipeline-ul GitHub Actions (`.github/workflows/ci.yml`):
  1. `npm run lint` (ESLint + verificare zero cicluri de import + restricții `theory/` și `sight-reading/`)
  2. `npm run typecheck` (`tsc --noEmit`)
  3. `npm run test:unit` (Vitest)
  4. `python i18n-framework/validator.py` (pentru toate limbile active)
  5. `npm run build` + verificare buget de dimensiune (JS + CSS inițial ≤ 250 KB gzip, fără sample-uri și OSMD)
  6. `npx playwright test` (pe `vite preview`)
  7. Deploy automat din `dist/` pe GitHub Pages (doar pe `main`).
- [ ] *Opțional:* `npm run build:single` (cu `vite-plugin-singlefile`) pentru generarea la cerere a unui `etude-standalone.html` utilizabil direct din `file://`.
- [ ] *Opțional (doar dacă măsurătorile pe mobil arată nevoia):* mutarea detecției de pitch (`AnalyserNode`) într-un `AudioWorklet`.

---

### Faza 8: Extensiile Sight-Reading V2 & V3 și Reevaluarea unui Framework UI

#### 8.1. Sight-Reading V2: Practică pe fragmente și exerciții cu două mâini
- **V2.1 — Practice Slicer (`srtSlicePiece` în `src/sight-reading/slicer.ts`):**
  - `startBar` și `endBar` sunt indecși de măsură de la `1`, inclusivi (`1 <= startBar <= endBar <= piece.bars`).
  - Fragmentul extras este reindexat să înceapă la `onsetTick = 0`, are `bars = endBar - startBar + 1`, păstrează metadatele `sourceFingerprint` și `{ startBar, endBar }` și este marcat întotdeauna pentru practică (`eligibleForFirstSight: false`).
  - O piesă cu o singură mână nu primește pași goi pentru mâna absentă.
- **V2.2 — Progresie ghidată pe fragmente:** pas cu pas → tempo redus (75% BPM) → tempo țintă (100% BPM); pentru piese cu două mâini se adaugă RH, LH și împreună.
- **V2.3 — Două mâini și durate:**
  - Registre separate (`lh < 60 <= rh`) și fără unison între mâini. Dacă o notă suplimentară (`FP`) nu poate fi atribuită neambiguu unei mâini, scorul global rămâne exact, iar raportul pe mâini marchează nota suplimentară ca globală.
  - Evaluarea opțională a duratelor (`offMs`), ca versiune nouă de scoring.

#### 8.2. Sight-Reading V3: Estimarea adaptivă a nivelului (Profilurile P3–P6)
- **Condiție de intrare:** MVP și V2 stabile, plus review muzical al unui eșantion de exerciții din fiecare profil P3–P6.
- **Protocolul sesiunii adaptive (`src/sight-reading/adaptive.ts`):**
  - Familie de profiluri fixă pe sesiune, aceeași mână/configurație, preview 20 s și aceeași sursă de input.
  - Maximum **8 fragmente eligibile** finalizate sau **3 rezultate sub prag** (strike-uri).
  - Criteriu de promovare pe un fragment:
    - Treaptă `+2` dacă `pitchF1 >= 96` și `rhythmAcc >= 90`;
    - Treaptă `+1` dacă `pitchF1 >= 85` și `rhythmAcc >= 80`.
  - **Regula de confirmare în pereche:** Prima promovare la un profil `P` este provizorie (`provisionalLevel = P`) și programează al doilea fragment nou la **același profil `P`**. A doua promovare consecutivă la `P` confirmă `confirmedLevel = P` și avansează cu `min(step1, step2)` trepte.
  - O nereușită (`pitchF1 < 85` sau `rhythmAcc < 80`) adaugă 1 strike, închide perechea curentă de confirmare și coboară un nivel (limitat la minimul familiei).
  - La atingerea plafonului familiei, după confirmarea ultimului profil disponibil, sesiunea se încheie cu `stopReason: 'ceilingReached'`. O întrerupere tehnică (`interrupted`) nu produce strike și nu confirmă nivelul.
  - Rezultatul sesiunii expune: `confirmedLevel` (sau `null` — „date insuficiente”), `provisionalLevel`, `testedRange`, `attemptsCount`, `strikes`, `stopReason` (`'maxAttempts'`, `'threeStrikes'`, `'ceilingReached'`, `'abandoned'`).
- **Look-ahead opt-in (V3.4):** testat pentru accesibilitate și `prefers-reduced-motion`.

#### 8.3. Momentul de decizie pentru un Framework UI
Claviatura, *falling notes*, portativul interactiv, motorul audio și MIDI rămân **permanent** în Vanilla TypeScript imperativ. Doar dacă după Faza 6 panourile declarative (Setări, Progres, Planificare, Glosar) mai prezintă cod repetitiv de sincronizare DOM, se evaluează adoptarea punctuală a **Svelte 5** sau **Solid** exclusiv pentru acele ecrane.

---

## Partea V — Matricea Unificată de Verificare și Riscuri

### 5.1. Matricea testelor obligatorii

| Domeniu | Verificări automate obligatorii |
|---|---|
| **Integritate PWA & Cache (Fazele 1–2)** | `etude.html` network-first; sample-uri MP3, OSMD și CSS servite din cache la `context.setOffline(true)` după prima vizită; păstrarea `localStorage['ptt-v3']`. |
| **Compatibilitate & Regresie (Faza 3)** | Toate cele 134 de teste Playwright existente verzi; monkey-patching funcțional pe cele 7 funcții și 5 variabile `let`; zero cicluri de import în ESLint. |
| **Localizare & Conținut (Faza 4)** | `validator.py` cu 0 erori (structură, `%s/%a/%b`, tag-uri și atribute HTML); 0 ramuri `lang === 'ro'` în `src/`; `keys.d.ts` validat de `tsc --noEmit`. |
| **Sight-Reading Scor & Polifonie (`srt:score`)** | Vectorii din §5.4 (Perfect, substituție `1 FN + 1 FP`, atac suplimentar `FP`, `near`, `lateOrEarly`, tăcere), piesă goală (`N = 0`), limitele `100 / 180 / 250 ms`, `restViolations`, acord cântat în ordine diferită, note repetate apropiate (fereastră `45%`). |
| **Sight-Reading Recorder (`srt:recorder`)** | Propagare `on`/`off` cu `source` și `releaseKind`, ignorare clape ținute `< -250 ms` vs atac la `-100 ms`, captură până la `T + 250 ms`, excludere `srClick` / `previewNote` / `srListen` / `srPlayGap`, `releaseFocusInput` și `panic`. |
| **Sight-Reading Generator (`srt:generator`)** | Profilurile `P1.a`–`P2.c`, mâinile `rh` și `lh`, seed-urile `0..999` (12.000 de cazuri în Vitest), absența pauzei la `onsetTick === 0`, cadența în 4/4 și 3/4 exclusiv din `[480, 960]`, respingerea profilurilor invalide. |
| **Sight-Reading Flux & Concurență (`srt:flow`, `srt:ledger`, `srt:backup`)** | Ordinea lock-urilor (`attempt-lock` înainte de `ledger-lock` scurt), două taburi cu claim simultan pe același fingerprint, protecția încercării active și a stării `pendingSave` la `recoverOrphanClaims` din alt tab, `resetLedger` în Tab B urmat de `stale_generation` în Tab A, idempotență, limitele 500 / 4096, backup `v:3` vechi fără `sightLedger`, conflict pe `attemptId`, `QuotaExceededError`. |
| **UI, Accesibilitate & Offline (`srt:ui`, `srt:offline`)** | Afișare separată F1 %, Recall `TP / N`, Extra `FP`, Rhythm Acc %, `meanOffsetMs`, badge Primă vedere vs Practică; română și engleză; light/dark; viewports `320 px`, `390 px`, `1024 px`, `1920 px` și landscape scund; simboluri non-culoare + `<title>`; `prefers-reduced-motion`; FNV-1a și evaluare 100% funcționale offline și pe HTTP în LAN. |

### 5.2. Riscuri și măsuri de control

| Risc | Impact | Măsură de control |
|---|---|---|
| Instalările PWA existente nu se actualizează sau pierd datele | Mare | URL-ul `etude.html`, `sw.js` cu același scope și cheile `ptt-v3` / `etude-sight-v1` rămân neschimbate. |
| Sample-urile sau OSMD nu sunt disponibile offline | Mare | `vite-plugin-pwa` (`injectManifest`) încă din Faza 1 + test E2E cu `context.setOffline(true)` în Faza 2. |
| Testele cad când globalele dispar sau când OSMD e încărcat leneș | Mediu | `expose.js` cu `defineProperty` (getter/setter) pe cele 7 funcții și 5 variabile `let` + `loadOsmd()` idempotent apelat în cele 2 teste `.mxl`. |
| Condiții de cursă sau deadlock între taburi la Sight-Reading | Mare | Ordinea strictă a lock-urilor (`etude-sight-attempt-<id>` ținut prin promisiune, `etude-sight-ledger-v1` eliberat înainte de `preview`, interogare `{ ifAvailable: true }` la recuperare) și verificare `generation`. |
| Conflicte Git pe durata migrării | Mediu | Faza 0 curăță arborele și rezolvă `stash@{0}` înainte de spargerea fișierului `etude.html`. |

---

## Referințe
- [1] https://pianomarvel.com/en/article/the-ultimate-sight-reading-test
- [2] https://completemusicreadingtrainer.com
- [3] https://www.sightreadingfactory.com/focus/customization

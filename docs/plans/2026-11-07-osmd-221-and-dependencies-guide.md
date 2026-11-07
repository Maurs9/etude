# Ghid de Migrare OSMD 2.2.1, Arhitectură Multi-Fișier și Inventarul Dependențelor Étude

**Data:** 7 noiembrie 2026  
**Worktree țintă:** `C:\Users\mariu\Desktop\etude-migration` (branch `feat/architecture-migration`)  
**Worktree experiment OSMD:** `C:\Users\mariu\Desktop\etude-osmd-2-2-1` (branch `experiment/osmd-2-2-1`)  
**Corelat cu:** [2026-11-06-architecture-migration-plan.md](./2026-11-06-architecture-migration-plan.md), [2026-11-07-unified-migration-and-sight-reading-plan.md](./2026-11-07-unified-migration-and-sight-reading-plan.md), [score-import-five-audit.md](../score-import-five-audit.md) și [osmd-221-experiment.md](../osmd-221-experiment.md)

---

## 1. Ce vreau să obțin (Obiective)

1. **Migrarea de pe un singur fișier (`etude.html`) pe o arhitectură modulară (Vite + TypeScript):**
   - Spargerea monolitului actual (`etude.html`, ajuns la **5.72 MB / 10.391 linii** după adăugarea celor 5 limbi noi și a îmbunătățirilor de import MusicXML) în module sursă separate (`src/`), păstrând aplicația 100% statică, offline-first (PWA) și compatibilă cu toate testele existente.
   - Separarea resurselor grele (sample-urile audio MP3 de 2.68 MB base64, biblioteca OSMD de 1.22–1.42 MB și pachetele de traduceri de 714 KB) în fișiere externe cu hash în nume, astfel încât o modificare în codul aplicației să nu mai invalideze cache-ul pentru sunete și motorul de partituri.
2. **Trecerea la OpenSheetMusicDisplay (OSMD) 2.2.1 fără regresii vizuale sau de paginare:**
   - Utilizarea versiunii `opensheetmusicdisplay@2.2.1` (în locul `1.9.9`), dar **cu rezolvarea regresiei de paginare descoperite la Moonlight Sonata III** (14 → 17 pagini) și prevenirea oricăror conflicte cu funcțiile custom din Étude (pedale, digitație, legături între portative, explicații pe pauze).
3. **Un mecanism sigur și repetabil de actualizare pe viitor:**
   - Vizibilitate completă asupra tuturor dependențelor din proiect (atât cele vizibile în `package.json`, cât și cele ascunse/încorporate în `etude.html` sau în bundle-ul OSMD).
   - O procedură automatizată prin care orice versiune viitoare de OSMD (ex. `2.3.x`) sau de altă dependență să poată fi instalată și verificată printr-o singură comandă, fără riscul de a strica aplicația în tăcere.

---

## 2. Starea actuală a worktree-ului `etude-migration` (Sincronizat la zi cu `main`)

Branch-ul `feat/architecture-migration` din `C:\Users\mariu\Desktop\etude-migration` a fost adus la zi cu `main` (`eba5ebd`), incluzând:
1. `c41ca18` / `f2f9092` — *keep pedal marks with source systems and audit all scores* (`docs/score-import-five-audit.md`, `docs/score-five-audit-results.json`, `tests/score-audit-helpers.mjs`, `tests/fixtures/bach-pedal.mxl`, `tests/fixtures/moonlight-pedal.mxl`);
2. `2e22760` — *responsive keyboard width with 4-octave desktop minimum*;
3. `5add72a` — *slim modern daily plan layout and hero session balance*;
4. `eba5ebd` — *default keyboard dock to hidden/rail on first visit*;
5. Raportul experimental [docs/osmd-221-experiment.md](../osmd-221-experiment.md) și prezentul ghid de migrare și dependențe.

### Măsurători actualizate ale `etude.html` (înainte de spargere)

Față de măsurătoarea inițială din planul de pe 6 noiembrie (4.96 MB), `etude.html` are acum **5.72 MB (10.391 linii)**:

| Componentă în `etude.html` | Linii | Dimensiune actuală | Ce se întâmplă la migrare |
|---|---|---|---|
| **Sample-uri de pian** (`#piano-recordings`, 30 MP3-uri base64) | L2081 | 2.68 MB (~2.0 MB binar) | Extrase în `assets/piano/piano-21.mp3` … `piano-108.mp3` (Faza 2) |
| **OpenSheetMusicDisplay** (bundle UMD minificat inline) | L2082–2083 | 1.22 MB (1.9.9) / 1.42 MB (2.2.1) | Extras în modul/chunk separat încărcat dinamic prin `loadOsmd()` (Faza 2) |
| **Traduceri suplimentare `I18N_PAYLOADS`** (`es`, `fr`, `de`, `it`, `pt-BR`) | L2950 | 714 KB | Extrase în `src/i18n/locales/<lang>/*.json` și `lessons/*.html` (Faza 4) |
| **Codul JS al aplicației** (inclusiv `en` și `ro` inline) | L2085–10390 | ~900 KB | Spart pe module TypeScript în `src/` (Fazele 3–6) |
| **CSS inline** (`<style>`) + **HTML** (`<body>`) | L23–2080 | ~200 KB | CSS extras în `src/styles/`, HTML păstrat în `etude.html` |

---

## 3. Unde este problema cu OSMD 2.2.1 (Diagnostic tehnic complet)

În branch-ul experimental `experiment/osmd-2-2-1` (`C:\Users\mariu\Desktop\etude-osmd-2-2-1`), simpla înlocuire byte-cu-byte a bundle-ului OSMD `1.9.9` cu `2.2.1` a fost testată pe 5 partituri MXL în 6 moduri de afișare (30 de combinații):

### 3.1. Ce funcționează corect în OSMD 2.2.1
- **12.590 de note redabile** și **736 de pauze vizibile** corespund 100% cu oracolul XML independent (înălțime MIDI, durată rațională, voce, portativ, parte, legături pe note și explicații pe pauze).
- **0 coliziuni de pedală**, **0 simboluri decupate** și **0 excepții în consolă** în toate cele 30 de combinații.
- **36/36 teste de partitură și simboluri** trec; suita completă Playwright are **191 trecute și 1 eșuat** (eșecul de la testul „French offline resilience” este preexistent și ține de geometria clapei negre peste clapa albă).

### 3.2. Problema 1 (Critică): Regresia de paginare la Moonlight Sonata III (14 → 17 pagini)

| Partitură | Pagini în sursa XML | Pagini în OSMD 1.9.9 | Pagini în OSMD 2.2.1 | Sisteme (1.9.9 vs. 2.2.1) |
|---|---:|---:|---:|---:|
| Bach — Toccata and Fugue in D Minor | 8 | 10 | 10 | 52 = 52 (identice) |
| Dance of the Sugar Plum Fairy | 4 | 4 | 4 | 19 = 19 (identice) |
| Für Elise | 3 | 3 | 3 | 18 = 18 (identice) |
| **Moonlight — Mișcarea a III-a** | **12** | **14** | **17 (Regresie)** | **66 = 66 (identice)** |
| You're a Mean One, Mr. Grinch | 4 | 6 | 6 | 16 = 16 (identice) |

#### Cauza tehnică exactă (demonstrată pe codul intern OSMD):
1. Începuturile de măsură ale celor 66 de sisteme din Moonlight sunt **identice** între 1.9.9 și 2.2.1:
   - În 1.9.9, paginile încep la măsurile: `1, 13, 32, 52, 68, 71, 89, 108, 123, 142, 162, 174, 188, 191` (14 pagini).
   - În 2.2.1, paginile încep la măsurile: `1, 13, 32, 52, 68, 71, 89, [105], 108, 123, [138], 142, [160], 162, 174, 188, 191` (17 pagini).
2. Măsurile **105, 138 și 160** au în XML doar `<print new-system="yes">`, în timp ce măsurile imediat următoare (**108, 142 și 162**) au `<print new-page="yes">`.
3. În OSMD `2.2.1`, metoda internă `calculateMusicSystemsRelativePositions()` a fost modificată:
   - Calculează `i = this.pageTopBorder(n)` pentru primul sistem de pe pagină (`BorderTop` este negativ când notele urcă deasupra portativului; la arpegiile din Moonlight pe măsura 89, `i = -7.47` spații de portativ).
   - La finalul așezării în pagină, OSMD 2.2.1 coboară toate sistemele de pe pagină cu `- i` (`+7.47` unități) pentru ca notele înalte din primul sistem să nu intre în marginea de sus a paginii.
   - Pentru a ține cont de această coborâre, condiția de rupere a paginii în 2.2.1 a devenit:
     ```js
     // OSMD 1.9.9:
     const c = h + i.PositionAndShape.BorderMarginBottom;
     if (!(c < this.rules.PageHeight - this.rules.PageBottomMargin)) { /* pagină nouă */ }

     // OSMD 2.2.1:
     const d = u + n.PositionAndShape.BorderMarginBottom - i + s; // - i adaugă ~7.5 unități!
     if (!(d < this.rules.PageHeight - this.rules.PageBottomMargin)) { /* pagină nouă */ }
     ```
4. Pe paginile care încep la măsurile `89`, `123` și `142`, bugetul vertical disponibil este `PageHeight - PageBottomMargin = 168.336 - 11.339 = 156.997`.
   - În `1.9.9`, al 6-lea sistem (măsura `105`) ajungea la `155.9 < 156.997` și încăpea la limită pe pagina 7.
   - În `2.2.1`, din cauza termenului `- i` (`+7.47`), al 6-lea sistem ajunge la `~159.5 > 156.997` (depășind limita cu doar ~2.5 unități) și este împins pe o pagină nouă.
   - Cum măsura următoare (`108`) are `<print new-page="yes">` forțat din XML, sistemul `105` rămâne **singur pe pagina 8**, iar măsura `108` începe pagina 9. Același fenomen izolează măsurile `138` și `160`.

#### Soluția tehnică verificată pentru Problema 1:
- Am verificat în Playwright pe `etude.html` cu OSMD 2.2.1 că reducerea ușoară a rezervei verticale (de exemplu `R.MinSkyBottomDistBetweenSystems = 0.5` în loc de `1`, sau `R.MinimumDistanceBetweenSystems = 7.5` în loc de `8.866`, sau un pas de auto-fit vertical în `scoreFitRender` când apar pagini „orfane” cu 1 sistem înaintea unui `<print new-page="yes">`) **elimină complet cele 3 pagini orfane și readuce Moonlight la 14 pagini** (`1, 13, 32, 52, 68, 71, 89, 105, 108, 123, 142, 162, 174, 191`).

### 3.3. Problema 2: Risc de dublare la legăturile între portative (`RenderSlursAcrossStaves`)
- Comparând toate proprietățile din `EngravingRules` între `1.9.9` și `2.2.1`, au apărut **32 de reguli noi**, printre care:
  - `RenderSlursAcrossStaves: true` (plus `SlurFlattenToObstacle: true`, `SlurCrossStaffBowFactor: 0.12`, `SlurCrossStaffMinBow: 0.8`, `SlurCrossStaffMaxBow: 2.5`).
  - `UseGeometricSkyBottomLineCalculation: true`.
  - `SnapStafflinesToCrispPixels: true`.
- În Étude, funcția `scoreXLines()` desenează deja manual în SVG legăturile între portative care nu erau suportate în OSMD 1.9.9.
- **Soluție:** În adaptorul OSMD din Étude (`src/notation/osmd.ts`), fie setăm explicit `R.RenderSlursAcrossStaves = false` pentru a păstra neschimbat comportamentul `scoreXLines()`, fie dezactivăm partea de slurs din `scoreXLines()` după verificarea vizuală pe partituri cu legături cross-staff.

### 3.4. Problema 3: Cuplajul prin Monkey-Patch (`scorePatchOsmd`)
- Étude suprascrie `opensheetmusicdisplay.VexFlowMusicSheetDrawer.prototype.drawPedals` pentru a împacheta fiecare semn de pedală într-un grup `<g class="vf-sc-pedal">` cu referința `.scPedalOwner`.
- În 2.2.1 acest patch funcționează, dar la orice versiune viitoare redenumirea metodei `drawPedals` sau schimbarea structurii `line.Pedals` poate dezactiva gruparea fără eroare de compilare.
- **Soluție:** Adăugarea unei aserțiuni explicite în suita de teste și în adaptorul OSMD care verifică existența `VexFlowMusicSheetDrawer.prototype.drawPedals` și generarea grupurilor `.vf-sc-pedal` la fiecare update.

### 3.5. Problema 4: Notificările de licență pentru sub-dependențele din bundle-ul OSMD
- Comentariul din capul `opensheetmusicdisplay.min.js` trimite către `opensheetmusicdisplay.min.js.LICENSE.txt`, fișier care nu este inclus în pachetul npm publicat.
- Deoarece bundle-ul UMD din OSMD include la interior cod din `vexflow`, `jszip`, `loglevel` și `typescript-collections`, secțiunea `<details class="osmd-lic">` (sau fișierul `THIRD_PARTY_NOTICES.md`) trebuie să menționeze nu doar licența BSD-3-Clause a PhonicScore, ci și licențele MIT ale acestor biblioteci împachetate.

---

## 4. Inventarul complet al dependențelor din Étude

Pentru a ști exact ce componente externe există în proiect și cum se actualizează fiecare:

### 4.1. Dependențe Runtime (care ajung în browserul utilizatorului)

| # | Dependență | Versiune actuală | Unde se află acum în `etude-migration` | Unde va sta după migrare | Licență | Cum se actualizează când apare o versiune nouă |
|---|---|---|---|---|---|---|
| **1** | **OpenSheetMusicDisplay (OSMD)** | `1.9.9` (`2.2.1` în lucru) | Inline în `etude.html` (L2082–2083, 1.22 MB) | `src/vendor/osmd.min.js` (sau pachet npm izolat în chunk-ul `vendor-osmd`) + adaptor `src/notation/osmd.ts` | BSD-3-Clause (PhonicScore) | Prin scriptul `npm run update:osmd <versiune>` + rularea obligatorie a suitei `tests/osmd-fidelity.spec.mjs` (vezi §5). |
| **2** | **VexFlow** *(împachetat în OSMD)* | `1.2.93` (fork OSMD) | În interiorul bundle-ului OSMD | În interiorul chunk-ului OSMD | MIT | Se actualizează automat odată cu OSMD. **Atenție:** Étude depinde de clasele SVG generate de VexFlow (`.vf-notehead`, `.vf-stem`, `.vf-beam`, `.vf-ledgers`, `.vf-modifiers`, `.vf-stavetie`). |
| **3** | **JSZip** *(împachetat în OSMD)* | `3.10.1` | În interiorul bundle-ului OSMD (`opensheetmusicdisplay.MXLHelper`) | În interiorul chunk-ului OSMD | MIT / GPLv3 | Se actualizează odată cu OSMD. În Étude este precedat de `anMxlPreflight()` (care folosește `DecompressionStream('deflate-raw')` nativ pentru protecție contra arhivelor zip-bomb). |
| **4** | **loglevel** & **typescript-collections** *(în OSMD)* | `^1.8.0` / `^1.3.3` | În interiorul bundle-ului OSMD | În interiorul chunk-ului OSMD | MIT | Se actualizează automat odată cu OSMD. |
| **5** | **Salamander Grand Piano v3** (sample-uri audio) | `v3` (30 note MP3, `MIDI 21..108` din 3 în 3 semitonuri, LAME 3.99.5) | Inline JSON base64 în `etude.html` (`#piano-recordings`, L2081, 2.68 MB) | `assets/piano/piano-21.mp3` … `piano-108.mp3` | CC BY 3.0 (Alexander Holm / Tone.js) | Rar necesita update. Dacă se înlocuiesc fișierele `.mp3` în `assets/piano/`, Vite regenerează automat hash-urile și Service Worker-ul le re-cache-uiește. |
| **6** | **Glifele Bravura (SMuFL)** (`CLEF_G`, `CLEF_F`) | Extrase static (250 unități/spațiu) | Inline în `etude.html` (L3863–3865) | `src/notation/glyphs.ts` | SIL Open Font License 1.1 (© Steinberg) | Contururi SVG fixe pentru cheia Sol și cheia Fa; nu necesită actualizare. |
| **7** | **Google Fonts: Fraunces & Hanken Grotesk** | Dinamic (CSS API v2) | `<link href="https://fonts.googleapis.com/...">` în `etude.html` (L20–22) | **Recomandat:** fișiere `.woff2` locale în `public/fonts/` (sau `@fontsource-variable/fraunces` și `@fontsource-variable/hanken-grotesk`) | SIL Open Font License 1.1 | Trecerea pe fișiere `.woff2` locale elimină singurul request extern al aplicației și garantează tipografie identică 100% offline. |

### 4.2. Dependențe de Build, Dezvoltare și Testare (`devDependencies` & Tooling)

| # | Dependență | Stare actuală | Rol în arhitectura nouă (`etude-migration`) | Cum se verifică și se actualizează |
|---|---|---|---|---|
| **1** | **`@playwright/test`** | Instalat (`1.64.1` în `package.json`) | Rulează testele E2E (`tests/*.spec.mjs`) și auditul geometric al partiturilor pe output-ul din `vite preview`. | `npm outdated` → `npm i -D @playwright/test@latest` + `npx playwright install`. |
| **2** | **`vite`** | Se adaugă în Faza 1 | Server de dezvoltare și bundler pentru `etude.html`, modulele TS, CSS și chunk-urile lazy (`osmd`, `locales`). | `npm i -D vite@latest` → verificare `npm run build && npm test`. |
| **3** | **`typescript`** | Se adaugă în Faza 1 | Verificare statică de tipuri (`tsc --noEmit`), inclusiv pentru cheile de traducere `src/i18n/keys.d.ts`. | `npm i -D typescript@latest` → verificare `npm run typecheck`. |
| **4** | **`vite-plugin-pwa`** (+ `workbox-*`) | Se adaugă în Faza 1 | Compilează `src/sw.ts` în modul `injectManifest`, injectând automat lista `self.__WB_MANIFEST` cu toate fișierele cu hash din `dist/assets/`. | `npm i -D vite-plugin-pwa@latest` → verificare test E2E offline. |
| **5** | **`vitest`** | Se adaugă în Faza 3 | Rulează în < 1 secundă testele unitare pentru funcțiile pure (`src/theory/*.test.ts` și `src/sight-reading/*.test.ts`). | `npm i -D vitest@latest` → verificare `npm run test:unit`. |
| **6** | **`eslint`** + **`typescript-eslint`** + **`eslint-plugin-import-x`** | Se adaugă în Faza 3 | Previne variabilele globale accidentale (`no-undef`), ciclurile de import (`no-cycle`) și importurile DOM în modulele pure de teorie muzicală. | `npm i -D eslint@latest typescript-eslint@latest eslint-plugin-import-x@latest` → `npm run lint`. |
| **7** | **Python 3** (`i18n-framework/validator.py`) | Prezent în repo (librăria standard Python) | Validează paritatea cheilor de traducere, placeholder-ele (`%s`, `%a`, `%b`) și atributele HTML din lecții. Nu are dependențe `pip` externe. | Rulează direct cu `python i18n-framework/validator.py`. |

---

## 5. Cum să fac update la OSMD și la alte dependențe pe viitor fără să stric aplicația

În noua arhitectură multi-fișier din `etude-migration`, actualizarea OSMD nu se va mai face niciodată prin editarea manuală a unei linii de 1.4 MB în `etude.html`, ci prin următoarea arhitectură decuplată:

### 5.1. Izolarea OSMD într-un singur modul adaptor (`src/notation/osmd.ts`)

În Faza 2 și Faza 6 a migrării, tot codul care atinge `opensheetmusicdisplay` este concentrat într-un singur loc:

```text
src/
├─ vendor/
│  ├─ osmd.min.js              ← bundle-ul oficial UMD din pachetul npm opensheetmusicdisplay
│  └─ osmd-version.json        ← metadate: { "version": "2.2.1", "sha256": "...", "updatedAt": "..." }
└─ notation/
   ├─ osmd-loader.ts           ← loadOsmd() idempotent (încarcă chunk-ul doar când se deschide o partitură)
   ├─ osmd-adapter.ts          ← configurare EngravingRules, scorePatchOsmd(), scoreFitRender()
   └─ osmd-adapter.test.ts     ← teste de compatibilitate pentru reguli și monkey-patch
```

În `osmd-adapter.ts`, configurăm explicit regulile introduse de versiunile noi pentru a nu depinde de schimbările de valori implicite (defaults) dintre versiuni:
1. **Compensarea spațierii verticale în OSMD 2.2.1+:**
   - Setarea `R.MinSkyBottomDistBetweenSystems = 0.5` (sau un pas de ajustare verticală în `scoreFitRender` atunci când un sistem fără `<print new-page="yes">` este împins pe o pagină nouă imediat înaintea unei măsuri cu `<print new-page="yes">`), rezolvând regresia de la Moonlight Sonata III (14 pagini în loc de 17).
2. **Controlul explicit al legăturilor între portative:**
   - Setarea explicită a `R.RenderSlursAcrossStaves = false` (cât timp `scoreXLines()` din Étude desenează legăturile cross-staff) sau migrarea completă pe suportul nativ OSMD după validare vizuală.
3. **Verificarea defensivă în `scorePatchOsmd()`:**
   - Dacă `VexFlowMusicSheetDrawer.prototype.drawPedals` își schimbă semnătura într-o versiune viitoare OSMD 2.x/3.x, adaptorul raportează un avertisment clar în teste în loc să eșueze tăcut.

### 5.2. Script automat de actualizare OSMD (`scripts/update-osmd.mjs`)

Vom adăuga în `package.json` comanda `"update:osmd": "node scripts/update-osmd.mjs"`, care face automat toți pașii:
1. Descarcă tarball-ul oficial de pe npm (`npm pack opensheetmusicdisplay@<versiune>`).
2. Verifică integritatea SHA-256 și extrage `package/build/opensheetmusicdisplay.min.js` în `src/vendor/osmd.min.js`.
3. Extrage `package/LICENSE` și dependențele din `package/package.json` și actualizează automat notificările de licență (BSD-3-Clause + VexFlow MIT + JSZip MIT + loglevel MIT + typescript-collections MIT).
4. Compară automat proprietățile din `new OpenSheetMusicDisplay(div).EngravingRules` față de versiunea anterioară și afișează în terminal **toate regulile noi sau cu valori implicite schimbate** (exact cum am detectat `UseGeometricSkyBottomLineCalculation` și `RenderSlursAcrossStaves` la 2.2.1).

### 5.3. Testul automat de regresie pe partituri (`tests/osmd-fidelity.spec.mjs`)

Un test care verifică doar `expect(engine.version).toMatch(/^2\.2\.1/)` **nu** protejează împotriva regresiilor de layout. În suita de teste vom avea un test dedicat care rulează la fiecare update de OSMD și verifică automat:
1. **Numărul de pagini și măsurile de început ale paginilor (`pageStarts`)** pe partiturile de referință (inclusiv `tests/fixtures/fur-elise-beethoven.mxl` și partitura de control pentru paginare densă), blocând orice commit care introduce pagini suplimentare sau sisteme orfane.
2. **Integritatea legăturilor muzicale (`scoreBind` și `scoreSyms`):** fiecare notă redabilă are element SVG `.vf-notehead` cu `dataset.i` valid, iar fiecare pauză vizibilă are explicație atașată.
3. **Geometria pedalelor și a paginii (`scorePedalCollisions`):** 0 coliziuni între `.vf-sc-pedal path` și note/stems/beams/text, 0 elemente decupate în afara `.an-sheet` și 100% apartenență corectă a pedalei la sistemul ei (`scPedalOwner`).

---

## 6. Ordinea concretă de execuție recomandată

1. **Sincronizarea `etude-migration` cu `main`:**
   - În `C:\Users\mariu\Desktop\etude-migration`, aducem ultimele 4 commit-uri din `main` (`git merge main`), astfel încât să avem atât cele 7 limbi cât și ultimele corecții de pedale și claviatură.
2. **Faza 1 + Faza 2 din planul de migrare (Vite + Extragerea MP3 și OSMD):**
   - Configurăm Vite + `vite-plugin-pwa` (`src/sw.ts`).
   - Extragem cele 30 de sample-uri MP3 în `assets/piano/`.
   - Extragem OSMD în `src/vendor/osmd.min.js` încărcat prin `loadOsmd()` și creăm scriptul `scripts/update-osmd.mjs`.
3. **Activarea OSMD 2.2.1 + Fix-ul de paginare Moonlight:**
   - Rulăm `node scripts/update-osmd.mjs 2.2.1`.
   - Aplicăm în configurarea `EngravingRules` compensarea verticală (`MinSkyBottomDistBetweenSystems` / fit vertical pentru evitarea paginilor cu 1 sistem înainte de `new-page`) și regula explicită pentru `RenderSlursAcrossStaves`.
   - Adăugăm testul de regresie pe paginare și verificăm că toate cele 5 partituri (inclusiv Moonlight la 14 pagini) și întreaga suită Playwright trec 100%.
4. **Continuarea Fazelor 3–6 din planul de migrare:**
   - Extragerea `src/legacy/app.js` cu puntea `installWindowBridge`, separarea `src/i18n/locales/` pentru toate cele 7 limbi (`en`, `ro`, `es`, `fr`, `de`, `it`, `pt-BR`) și modularizarea pe domenii TypeScript.

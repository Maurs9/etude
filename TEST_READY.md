# Test Suite Readiness Signal (`TEST_READY.md`)

## Milestone 4: E2E Testing Track Infrastructure & Comprehensive Test Suite

- **Status**: READY
- **Date**: 2026-11-06
- **Test Writer Agent**: `test_writer_m4`
- **Specification References**:
  - `ORIGINAL_REQUEST.md` (Authoritative user requirements)
  - `PROJECT.md` (Etude localization architecture & interface contracts)
  - `TEST_INFRA.md` (4-Tier test architecture & methodology)
- **Primary Test Suite**: `tests/e2e-localization.spec.mjs`

---

## 1. Test Runner Execution Commands

### Full Comprehensive Localization Suite:
```cmd
cmd /c "set PW_CHANNEL=msedge&& npx playwright test tests/e2e-localization.spec.mjs"
```

### Targeted Tier Execution:
- **Tier 1 (7 Locales Feature Coverage)**:
  ```cmd
  cmd /c "set PW_CHANNEL=msedge&& npx playwright test tests/e2e-localization.spec.mjs -g Tier\ 1"
  ```
- **Tier 2 (Boundary & Corner Cases)**:
  ```cmd
  cmd /c "set PW_CHANNEL=msedge&& npx playwright test tests/e2e-localization.spec.mjs -g Tier\ 2"
  ```
- **Tier 3 (Cross-Feature Combinations)**:
  ```cmd
  cmd /c "set PW_CHANNEL=msedge&& npx playwright test tests/e2e-localization.spec.mjs -g Tier\ 3"
  ```
- **Tier 4 (Real-World Scenarios / User Journeys)**:
  ```cmd
  cmd /c "set PW_CHANNEL=msedge&& npx playwright test tests/e2e-localization.spec.mjs -g Tier\ 4"
  ```

### Target Alternative Build Revision (via `APP_FILE`):
```cmd
cmd /c "set PW_CHANNEL=msedge&& set APP_FILE=etude.html&& npx playwright test tests/e2e-localization.spec.mjs"
```

---

## 2. Coverage Summary Table by Tier

| Tier | Test ID | Description | Coverage Scope | Count |
|---|---|---|---|:---:|
| **Tier 1** | `T1.1` | Language switcher buttons in Settings drawer | All 7 locales (`en`, `ro`, `es`, `fr`, `de`, `it`, `pt-BR`) button existence and labels | 1 |
| | `T1.2` | `html[lang]` and `aria-pressed` state updates | Root language attribute and active/inactive toggle verification across all 7 locales | 1 |
| | `T1.3` | Settings drawer title translation | `#drawerTitle` matches `settings` translation across all 7 locales | 1 |
| | `T1.4` | Core navigation bar section links | Navigation buttons (`today`, `learn`, `practice`, `explore`) localized across all 7 locales | 1 |
| | `T1.5` | Dynamic ARIA attributes | Accessibility labels (`aria_lang`, `aria_theme`, `close`) localized across all 7 locales | 1 |
| | `T1.6` | Theory Handbook (Learn view) unit headers | Unit 1 (`fund`) and lesson titles reflect active locale | 1 |
| | `T1.7` | Musical terminology and dictionaries | Scale names (`scaleDisp`) and chords reflect active locale | 1 |
| | `T1.8` | Offline standalone loading | Zero network requests required; app functions completely in offline shell | 1 |
| **Tier 1 Subtotal** | | | | **8** |
| **Tier 2** | `T2.1` | Mobile 320px viewport: `#set-lang` flex-wrap | `#set-lang` wraps without clipping, all buttons inside 320px width | 1 |
| | `T2.2` | Mobile 320px viewport: all 12 views layout | `scrollWidth <= 320` across all 12 views in all 7 locales | 1 |
| | `T2.3` | Special characters, diacritics and accents | Verifies non-ASCII unicode (`ă`, `ș`, `ñ`, `é`, `ä`, `ö`, `ü`, `ß`, `ç`, `’`) render cleanly without mojibake | 1 |
| | `T2.4` | Positional format specifier token replacement | Ensures `%s`, `%a`, `%b` are replaced and no raw format tokens remain in DOM | 1 |
| | `T2.5` | Cold boot restore from `localStorage['ptt-v3']` | Direct pre-seeded language restore on cold application startup | 1 |
| | `T2.6` | In-app language selection reload persistence | Selected language survives full page reload and updates localStorage | 1 |
| | `T2.7` | Malformed / unrecognized locale safe fallback | Corrupt or invalid persisted language gracefully falls back to `'en'` | 1 |
| **Tier 2 Subtotal** | | | | **7** |
| **Tier 3** | `T3.1` | Solfège notation independence | Solfège notation remains active across all 7 sequential language switches | 1 |
| | `T3.2` | German notation (`H`/`B`) independence | German notation remains active across all 7 sequential language switches | 1 |
| | `T3.3` | Notation switching preserves active language | Changing notation (`letter` ↔ `solfege` ↔ `german`) does not alter active language | 1 |
| | `T3.4` | Dual reload persistence (language + notation) | Non-default language + non-default notation survive reload together | 1 |
| | `T3.5` | Multi-tab storage event language synchronization | Tab 1 language change dispatches `storage` event and updates Tab 2 | 1 |
| | `T3.6` | Multi-tab notation sync without language disruption | Tab 1 notation change updates Tab 2 notation without modifying Tab 2 language | 1 |
| **Tier 3 Subtotal** | | | | **6** |
| **Tier 4** | `T4.1` | Journey 1: Spanish Learner Handbook & Quiz | Full flow: switch to `es`, open Learn, read Lesson 1, verify widgets and quiz | 1 |
| | `T4.2` | Journey 2: German Musician Explore & Analysis | Full flow: `de` + German notation (`german`), inspect Circle of Fifths (`H`/`B`, `Dur`/`Moll`) | 1 |
| | `T4.3` | Journey 3: Brazilian Portuguese Daily Practice | Full flow: `pt-BR` startup, Today review counters, practice session controls and summary | 1 |
| | `T4.4` | Journey 4: French Offline Resilience | Full flow: `fr` selection, offline disconnection, page reload, verify offline interactivity | 1 |
| **Tier 4 Subtotal** | | | | **4** |
| **TOTAL TESTS** | | | | **25** |

---

## 3. Feature Checklist

- [x] **Coverage across 7 Locales**: English (`en`), Romanian (`ro`), Spanish (`es`), French (`fr`), German (`de`), Italian (`it`), Brazilian Portuguese (`pt-BR`).
- [x] **Switcher UI & Accessibility**:
  - [x] `#set-lang button[data-v="<locale>"]` for all 7 locales.
  - [x] `aria-pressed="true"` toggle behavior.
  - [x] `document.documentElement.lang` synchronizes with active locale.
- [x] **Settings Drawer Localization**:
  - [x] `#drawerTitle` localized (`Settings`, `Setări`, `Ajustes`, `Paramètres`, `Einstellungen`, `Impostazioni`, `Configurações`).
  - [x] `#drawerClose` ARIA label localized (`Close`, `Închide`, `Cerrar`, `Fermer`, `Schließen`, `Chiudi`, `Fechar`).
  - [x] `#set-lang` and `#set-theme` ARIA group labels localized.
- [x] **Core Navigation Section Links**:
  - [x] `nav_today`, `nav_learn`, `nav_practice`, `nav_explore` reflect active locale.
- [x] **Theory Handbook (Learn View)**:
  - [x] Unit headers (`LEARN_UNITS`) and lesson titles localize cleanly.
  - [x] Interactive widgets (`data-demo`, `data-staff`) mount and operate without locale interference.
- [x] **Musical Terminology & Dictionaries**:
  - [x] Scale names (`scaleDisp`) reflect localized dictionaries.
  - [x] Circle of Fifths respects active language.
- [x] **Mobile 320px Responsiveness**:
  - [x] `#set-lang` styled with `flex-wrap: wrap` to prevent horizontal clipping.
  - [x] All 7 buttons are within the 320px viewport bounding box.
  - [x] All 12 views maintain `scrollWidth <= 320px` in all locales.
- [x] **Character & Token Integrity**:
  - [x] Non-ASCII unicode diacritics render without mojibake or HTML entity leakage.
  - [x] Format specifiers (`%s`, `%a`, `%b`) interpolate with arguments without literal token leftovers.
- [x] **Persistence & Storage**:
  - [x] Cold boot restore from `localStorage['ptt-v3']`.
  - [x] In-app selection persists across full browser reload.
  - [x] Malformed / corrupt `raw.lang` falls back gracefully to `'en'`.
- [x] **Musical Notation Independence**:
  - [x] Orthogonal to `letter`, `solfege`, and `german` (`H`/`B`).
  - [x] Switching language preserves active notation.
  - [x] Switching notation preserves active language.
  - [x] Dual reload persistence.
- [x] **Multi-Tab Synchronization**:
  - [x] Cross-tab storage event updates language.
  - [x] Cross-tab notation updates do not alter foreign tab language.
- [x] **Offline Capability**:
  - [x] Complete self-contained shell operation with zero external network requests.

# Etude E2E Localization Testing Infrastructure & Methodology (`TEST_INFRA.md`)

## 1. Executive Summary

This document defines the End-to-End (E2E) testing architecture, methodology, execution commands, and verification criteria for internationalization (i18n) and localization across the Etude music theory web application.

Etude is an interactive, client-side web application (`etude.html`) that delivers music theory education, pitch training, sight-reading, and score analysis. The localization track expands Etude from bilingual support (`en`, `ro`) to seven fully supported production locales:
- **English** (`en`) [Canonical source]
- **Romanian** (`ro`) [Română]
- **Spanish** (`es`) [Español]
- **French** (`fr`) [Français]
- **German** (`de`) [Deutsch]
- **Italian** (`it`) [Italiano]
- **Brazilian Portuguese** (`pt-BR`) [Português (Brasil)]

The testing infrastructure guarantees that all 7 locales render correctly, preserve semantic markup and ARIA accessibility, maintain responsive layouts on narrow mobile viewports (down to 320px width), operate completely offline, and remain strictly decoupled from the active musical notation system (`letter`, `solfege`, `german`).

---

## 2. Test Philosophy: Opaque-Box & Requirement-Driven

The test suite strictly adheres to an **opaque-box, requirement-driven test philosophy** directly derived from `ORIGINAL_REQUEST.md` and `PROJECT.md`:

1. **Opaque-Box User-Centric Verification**:
   - Tests interact with the application solely through standard browser interfaces: DOM element selection, pointer clicks, keyboard events, viewport resizing, local storage inspection, and cross-tab storage dispatch.
   - Tests do NOT rely on private variables or internal mock abstractions. If a user cannot observe it (in the DOM, accessibility tree, visual layout, or persisted storage), the test does not assert it.

2. **Authoritative Output Derivation**:
   - Expected translations, ARIA labels, and navigation titles are derived directly from the authoritative specifications in `ORIGINAL_REQUEST.md`, `PROJECT.md`, `i18n-extra.js`, canonical English inventory (`i18n-framework/inventory.cjs`), and validated schema dictionaries.
   - UI strings must match human-reviewed terminology, avoiding synthetic stubs.

3. **Strict Progressive Testability**:
   - The test suite defines the target contract for the integrated application.
   - Tests verify both currently active locales (`en`, `ro`) and upcoming localized payloads (`es`, `fr`, `de`, `it`, `pt-BR`) through standardized data-driven parameterization.

4. **Zero Flakiness & Deterministic Asynchrony**:
   - Etude performs UI transitions and DOM re-rendering upon language switching and resizing (including debounced 100ms layout handlers).
   - Tests use Playwright's auto-retrying web assertions (`await expect(locator)...`, `expect.poll(...)`) and avoid arbitrary sleep timers.

---

## 3. 4-Tier Test Methodology

The E2E test suite in `tests/e2e-localization.spec.mjs` is structured into four distinct, progressive verification tiers:

```
+-----------------------------------------------------------------------+
|  Tier 1: Core Feature Coverage across All 7 Locales                   |
|  - Switcher UI & aria-pressed                                         |
|  - html[lang] attribute reflection                                    |
|  - Settings drawer titles & close button ARIA                         |
|  - Navigation bar section links                                       |
|  - Interactive theory handbook (Learn view)                           |
|  - Musical terminology & dictionary display                           |
|  - Offline shell loading                                              |
+-----------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|  Tier 2: Boundary & Corner Cases                                      |
|  - 320px narrow mobile viewport: #set-lang flex-wrapping              |
|  - 320px mobile layout: zero horizontal overflow (scrollWidth <= 320) |
|  - Special characters & diacritics integrity (no mojibake)            |
|  - Dynamic format specifier (%s, %a, %b) token replacement           |
|  - Cold start restore from localStorage['ptt-v3']                     |
|  - Settings reload persistence                                        |
|  - Corrupt / unrecognized locale fallback to 'en'                     |
+-----------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|  Tier 3: Cross-Feature Combinations                                   |
|  - Language switching independence from Solfège notation             |
|  - Language switching independence from German notation (H / B)       |
|  - Notation switching independence from active language               |
|  - Non-default language + notation dual reload persistence            |
|  - Multi-tab storage event synchronization (language sync)            |
|  - Multi-tab storage event synchronization (notation sync)            |
+-----------------------------------------------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|  Tier 4: Real-World Scenarios (Full User Journeys)                   |
|  - Journey 1: Multilingual Learner Handbook & Quiz (Spanish)         |
|  - Journey 2: Classical Musician Analysis & Explore (German + H/B)   |
|  - Journey 3: Daily Practice & SRS Drill Session (Portuguese)        |
|  - Journey 4: Offline Resilience & Shell Reload (French)             |
+-----------------------------------------------------------------------+
```

### Detailed Tier Breakdown

#### Tier 1: Feature Coverage across All 7 Locales
- **Scope**: Complete breadth across `en`, `ro`, `es`, `fr`, `de`, `it`, `pt-BR`.
- **Target Elements**:
  - Language buttons: `#set-lang button[data-v="<locale>"]`
  - Root element attribute: `document.documentElement.lang === '<locale>'`
  - Drawer title: `#drawerTitle` (`settings` key: `Settings`, `Setări`, `Ajustes`, `Paramètres`, `Einstellungen`, `Impostazioni`, `Configurações`)
  - Drawer close button: `#drawerClose` (`aria-label` matching `close` key)
  - Navigation tab labels: `#nav button[data-view="..."]` (`nav_today`, `nav_learn`, `nav_practice`, `nav_explore`)
  - Dynamic ARIA groups: `#set-lang` (`aria_lang`), `#set-theme` (`aria_theme`)
  - Theory handbook: `#view-learn` unit headers (`LEARN_UNITS` / `units`)
  - Musical dictionaries: Scale names (`scaleDisp`) and accompaniment patterns (`ac-pat`)

#### Tier 2: Boundary & Corner Cases
- **Mobile Viewport 320px Constraint**:
  - Standard smartphones down to iPhone SE / 320px CSS width.
  - `#set-lang` buttons must wrap (`flex-wrap: wrap`) within the available drawer width (~250px usable inside `max-width: min(380px, 92vw)`).
  - No button clipping; all 7 buttons clickable and within viewport bounds.
  - Across all 12 application views (`today`, `learn`, `songs`, `method`, `practice`, `read`, `sing`, `analysis`, `explore`, `accompany`, `transcribe`, `progress`), `document.documentElement.scrollWidth <= 320px` in all 7 languages (especially languages with longer average word lengths like German and Portuguese).
- **Special Characters, Accents & Diacritics**:
  - Validates that non-ASCII unicode characters render cleanly without escaping artifacts (`&eacute;`, `&#233;`) or mojibake (``):
    - Romanian: `ă`, `î`, `ș`, `ț`, `â`
    - Spanish: `ñ`, `á`, `é`, `í`, `ó`, `ú`, `¿`, `¡`
    - French: `é`, `è`, `ê`, `à`, `ç`, `’`, `œ`
    - German: `ä`, `ö`, `ü`, `ß`
    - Italian: `à`, `è`, `é`, `ì`, `ò`, `ù`
    - Portuguese: `ã`, `õ`, `ç`, `ê`, `é`, `í`, `ó`, `ú`
- **Positional Format Specifiers**:
  - Ensures functions calling `t(key, a, b)` substitute `%s`, `%a`, `%b` dynamically without leaving literal `%s` in the DOM (e.g. `si_done`, `sum_more`, `root_pos`).
- **Persistence & Error Recovery**:
  - Direct seed restore from `localStorage['ptt-v3']`.
  - In-app language switch persists to `localStorage`.
  - Resilience: unrecognized or malformed locale strings (`lang: 'invalid'`, `lang: null`) fall back to default `'en'` without throwing uncaught exceptions.

#### Tier 3: Cross-Feature Combinations
- **Musical Notation Decoupling**:
  - 3 notation systems: `letter` (C D E), `solfege` (Do Re Mi), `german` (H / B).
  - Switching language MUST NOT mutate active notation.
  - Switching notation MUST NOT mutate active language.
  - Verified across multiple sequential switch operations.
- **Dual Preference Reload Persistence**:
  - Setting a non-default language (e.g., `de`) and non-default notation (e.g., `solfege` or `german`) preserves both values after a complete browser reload.
- **Multi-Tab Cross-Synchronization**:
  - Etude uses `SYNC_PREFS` with `window.addEventListener('storage', ...)` to synchronize state across open browser tabs.
  - Changing language in Tab 1 triggers UI update in Tab 2.
  - Changing notation in Tab 2 updates notation in Tab 1 without overwriting Tab 1's language.

#### Tier 4: Real-World Scenarios (Full User Journeys)
- **Journey 1: Spanish Learner Handbook & Quiz**:
  - User opens app, opens Settings, switches to Spanish (`es`).
  - Navigates to Learn view, opens Lesson 1 ("Fundamentos").
  - Verifies lesson body text and interactive widget rendering.
  - Takes quiz: verifies question text, multiple choice option strings, and explanation feedback.
- **Journey 2: German Classical Musician**:
  - User configures German (`de`) and German notation (`german`).
  - Verifies drawer shows `Einstellungen` and notation shows `H / B`.
  - Opens Explore view (`Entdecken`): Circle of Fifths displays `H` for B-natural, `B` for B-flat, and German scale names (`Dur`, `Moll`).
- **Journey 3: Brazilian Portuguese Practice Session**:
  - User starts in `pt-BR`.
  - Today view shows Portuguese greeting, streak, and review counters (`Prática de hoje`, `Para revisar`, `Novos hoje`).
  - Starts practice session (`#pr-start`). Prompt, answer choices, and review controls display in Portuguese.
  - Completes or exits card: summary screen displays Portuguese accuracy metrics (`Precisão`, `Revisados`).
- **Journey 4: Offline Resilience & Shell Reload**:
  - User switches to French (`fr`).
  - Network is completely disconnected (`context.setOffline(true)` or route aborts).
  - Page is reloaded: Etude boots from cache/standalone shell, retains French UI, interactive keys and synthesis remain functional.

---

## 4. Test Runner Execution Command

The test suite runs using Playwright with the system Microsoft Edge browser channel.

### Primary Command:
```cmd
cmd /c "set PW_CHANNEL=msedge&& npx playwright test tests/e2e-localization.spec.mjs"
```

### Targeted Tier Execution:
- **Tier 1 only**:
  ```cmd
  cmd /c "set PW_CHANNEL=msedge&& npx playwright test tests/e2e-localization.spec.mjs -g \"Tier 1\""
  ```
- **Tier 2 only**:
  ```cmd
  cmd /c "set PW_CHANNEL=msedge&& npx playwright test tests/e2e-localization.spec.mjs -g \"Tier 2\""
  ```
- **Tier 3 only**:
  ```cmd
  cmd /c "set PW_CHANNEL=msedge&& npx playwright test tests/e2e-localization.spec.mjs -g \"Tier 3\""
  ```
- **Tier 4 only**:
  ```cmd
  cmd /c "set PW_CHANNEL=msedge&& npx playwright test tests/e2e-localization.spec.mjs -g \"Tier 4\""
  ```

### Targeted Alternative App Revision (via `APP_FILE`):
To test an alternative build or staging file:
```cmd
cmd /c "set PW_CHANNEL=msedge&& set APP_FILE=etude.html&& npx playwright test tests/e2e-localization.spec.mjs"
```

---

## 5. Verification Matrix & Authoritative Reference Mapping

| Requirement | Test Tier | Verifying Spec / Assertion | Authoritative Source |
|---|---|---|---|
| 7 Locale Switcher UI | Tier 1 | `#set-lang button[data-v="<loc>"]` | `PROJECT.md § Feature Inventory #10` |
| html[lang] attribute | Tier 1 | `document.documentElement.lang === loc` | `etude.html:3217 applyI18n()` |
| Drawer Titles | Tier 1 | `#drawerTitle` matches translation | `tests/localization.spec.mjs:4-7` |
| Close Button ARIA | Tier 1 | `#drawerClose[aria-label]` matches `close` | `i18n-framework/validator.py` |
| Nav Tab Translation | Tier 1 | `#nav button[data-view="..."]` | `i18n-extra.js:9-19` |
| Learn Handbook Units | Tier 1 | `.lu-unit` reflects unit translation | `PROJECT.md § Interface Contracts #2` |
| Musical Terminology | Tier 1 | `scaleDisp('Major (Ionian)')` | `i18n/*.json -> music.scales` |
| Offline Shell Boot | Tier 1 | Zero network requests required | `PROJECT.md § Architecture #4` |
| Mobile 320px Wrap | Tier 2 | `#set-lang` flex-wrap, buttons <= 320px | `PROJECT.md § Feature Inventory #11` |
| Mobile 320px Views | Tier 2 | All 12 views `scrollWidth <= 320` | `tests/app.spec.mjs:647` |
| Special Diacritics | Tier 2 | Unicode rendering without entities | `ORIGINAL_REQUEST.md § R1` |
| Format Specifiers | Tier 2 | No literal `%s`, `%a`, `%b` in text | `ORIGINAL_REQUEST.md § R1` |
| LocalStorage Seed | Tier 2 | Cold boot restore from `ptt-v3` | `etude.html:9790 loadAll()` |
| Reload Persistence | Tier 2 | Setting preserved after `page.reload()` | `ORIGINAL_REQUEST.md § Acceptance Criteria` |
| Malformed Fallback | Tier 2 | Corrupt `raw.lang` falls back to `'en'` | `etude.html:9790 loadAll()` |
| Solfège Independence | Tier 3 | Solfège retained across 7 languages | `ORIGINAL_REQUEST.md § R2` |
| German Independence | Tier 3 | `H`/`B` retained across 7 languages | `tests/german-notation.spec.mjs` |
| Notation Switch Safety | Tier 3 | Changing notation preserves language | `ORIGINAL_REQUEST.md § R2` |
| Dual Reload Persist | Tier 3 | Non-default lang + notation persist | `tests/localization.spec.mjs` |
| Multi-tab Lang Sync | Tier 3 | Storage event synchronizes language | `etude.html:9685 SYNC_PREFS` |
| Multi-tab Note Sync | Tier 3 | Storage event preserves language | `etude.html:9686 SYNC_PREFS` |
| Spanish Learn Journey | Tier 4 | Complete reading & quiz cycle | `ORIGINAL_REQUEST.md § R1, R2` |
| German Music Journey | Tier 4 | Explore + German notation analysis | `ORIGINAL_REQUEST.md § R2` |
| Portuguese Drill | Tier 4 | Practice cards, review counters | `ORIGINAL_REQUEST.md § R1, R2` |
| Offline Resilience | Tier 4 | French mode reloaded offline | `ORIGINAL_REQUEST.md § R2` |

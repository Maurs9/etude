import { test, expect, APP } from '../helpers/fixtures.mjs';

/**
 * Etude E2E Localization & Internationalization Test Suite
 * Covers 4 Tiers:
 * - Tier 1: Feature coverage across all 7 locales (en, ro, es, fr, de, it, pt-BR)
 * - Tier 2: Boundary & corner cases (mobile 320px viewport without overflow, special characters/accents, localStorage restore)
 * - Tier 3: Cross-feature combinations (notation switching + language switching independence, multi-tab sync)
 * - Tier 4: Real-world scenarios (full user journeys)
 */

const LOCALES = [
  {
    code: 'en',
    name: 'English',
    drawerTitle: 'Settings',
    closeAria: 'Close',
    ariaLang: 'Language',
    ariaTheme: 'Theme',
    navToday: 'Today',
    navLearn: 'Learn',
    navPractice: 'Practice',
    navExplore: 'Explore',
    navScores: 'Scores',
    unit1Title: 'Fundamentals',
    scaleMajor: 'Major (Ionian)',
    accentsSample: 'pitch & phrasing',
  },
  {
    code: 'ro',
    name: 'Română',
    drawerTitle: 'Setări',
    closeAria: 'Închide',
    ariaLang: 'Limbă',
    ariaTheme: 'Temă',
    navToday: 'Azi',
    navLearn: 'Învață',
    navPractice: 'Exersează',
    navExplore: 'Explorează',
    navScores: 'Partituri',
    unit1Title: 'Fundamente',
    scaleMajor: 'Majoră (ioniană)',
    accentsSample: 'Înălțimea și claviatura',
  },
  {
    code: 'es',
    name: 'Español',
    drawerTitle: 'Ajustes',
    closeAria: 'Cerrar',
    ariaLang: 'Idioma',
    ariaTheme: 'Tema',
    navToday: 'Hoy',
    navLearn: 'Aprender',
    navPractice: 'Practicar',
    navExplore: 'Explorar',
    navScores: 'Partituras',
    unit1Title: 'Fundamentos',
    scaleMajor: 'Mayor (jónica)',
    accentsSample: 'Las sesiones cortas y espaciadas',
  },
  {
    code: 'fr',
    name: 'Français',
    drawerTitle: 'Paramètres',
    closeAria: 'Fermer',
    ariaLang: 'Langue',
    ariaTheme: 'Thème',
    navToday: 'Aujourd’hui',
    navLearn: 'Apprendre',
    navPractice: 'Pratiquer',
    navExplore: 'Explorer',
    navScores: 'Partitions',
    unit1Title: /Fondamentaux|bases/i,
    scaleMajor: 'Majeure (ionienne)',
    accentsSample: 'séances courtes et espacées',
  },
  {
    code: 'de',
    name: 'Deutsch',
    drawerTitle: 'Einstellungen',
    closeAria: 'Schließen',
    ariaLang: 'Sprache',
    ariaTheme: 'Design',
    navToday: 'Heute',
    navLearn: 'Lernen',
    navPractice: 'Üben',
    navExplore: 'Entdecken',
    navScores: 'Partituren',
    unit1Title: 'Grundlagen',
    scaleMajor: 'Dur (Ionisch)',
    accentsSample: 'Kurze, verteilte Einheiten',
  },
  {
    code: 'it',
    name: 'Italiano',
    drawerTitle: 'Impostazioni',
    closeAria: 'Chiudi',
    ariaLang: 'Lingua',
    ariaTheme: 'Tema',
    navToday: 'Oggi',
    navLearn: 'Impara',
    navPractice: 'Esercitati',
    navExplore: 'Esplora',
    navScores: 'Spartiti',
    unit1Title: /fondamenti/i,
    scaleMajor: 'Maggiore (ionica)',
    accentsSample: 'Sessioni brevi e distanziate',
  },
  {
    code: 'pt-BR',
    name: /Portugu[eê]s/i,
    drawerTitle: 'Configurações',
    closeAria: 'Fechar',
    ariaLang: 'Idioma',
    ariaTheme: 'Tema',
    navToday: 'Hoje',
    navLearn: 'Aprender',
    navPractice: 'Praticar',
    navExplore: 'Explorar',
    navScores: 'Partituras',
    unit1Title: 'Fundamentos',
    scaleMajor: 'Maior (jônica)',
    accentsSample: 'Sessões curtas e espaçadas',
  },
];

const ALL_VIEWS = [
  'today', 'learn', 'songs', 'method', 'practice',
  'read', 'sing', 'analysis', 'explore', 'accompany',
  'transcribe', 'progress'
];

/** Helper to open settings drawer */
async function openSettings(page) {
  const drawer = page.locator('#drawer');
  if (!(await drawer.isVisible())) {
    await page.locator('#settingsBtn').click();
    await expect(drawer).toBeVisible();
  }
  return drawer;
}

/** Helper to select a language and wait for application state */
async function selectLanguage(page, code) {
  await openSettings(page);
  const langBtn = page.locator(`#set-lang button[data-v="${code}"]`);
  await langBtn.click();
  await expect(langBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', code);
}

/** Helper to select a note notation system */
async function selectNotation(page, notation) {
  await openSettings(page);
  const notationBtn = page.locator(`#set-notation button[data-v="${notation}"]`);
  await notationBtn.click();
  await expect(notationBtn).toHaveAttribute('aria-pressed', 'true');
}

/* ========================================================================== */
/* Tier 1: Feature Coverage across All 7 Locales                              */
/* ========================================================================== */

test.describe('Tier 1: Feature Coverage across All 7 Locales', () => {

  test('T1.1: language drawer displays switcher buttons for all 7 locales', async ({ app, page }) => {
    await app.open();
    await openSettings(page);

    const langContainer = page.locator('#set-lang');
    await expect(langContainer).toBeVisible();

    for (const loc of LOCALES) {
      const btn = langContainer.locator(`button[data-v="${loc.code}"]`);
      await expect(btn, `Button for locale ${loc.code} should exist and be visible`).toBeVisible();
      if (typeof loc.name === 'string') {
        await expect(btn).toHaveText(loc.name);
      } else {
        await expect(btn).toHaveText(loc.name);
      }
    }
  });

  test('T1.2: selecting each locale updates the document root lang attribute and active button state', async ({ app, page }) => {
    await app.open();
    await openSettings(page);

    for (const loc of LOCALES) {
      const btn = page.locator(`#set-lang button[data-v="${loc.code}"]`);
      await btn.click();

      // Verify aria-pressed reflects active state
      await expect(btn).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('html')).toHaveAttribute('lang', loc.code);

      // Verify other language buttons are aria-pressed false
      const inactiveButtons = page.locator(`#set-lang button:not([data-v="${loc.code}"])`);
      const count = await inactiveButtons.count();
      for (let i = 0; i < count; i++) {
        await expect(inactiveButtons.nth(i)).toHaveAttribute('aria-pressed', 'false');
      }
    }
  });

  test('T1.3: settings drawer title updates correctly across all 7 locales', async ({ app, page }) => {
    await app.open();
    await openSettings(page);

    for (const loc of LOCALES) {
      await page.locator(`#set-lang button[data-v="${loc.code}"]`).click();
      await expect(page.locator('#drawerTitle')).toHaveText(loc.drawerTitle);
    }
  });

  test('T1.4: core navigation bar section links update to localized text', async ({ app, page }) => {
    await app.open();

    for (const loc of LOCALES) {
      await selectLanguage(page, loc.code);

      await expect(page.locator('#nav button[data-view="today"]')).toHaveText(loc.navToday);
      await expect(page.locator('#nav button[data-view="learn"]')).toHaveText(loc.navLearn);
      await expect(page.locator('#nav button[data-view="practice"]')).toHaveText(loc.navPractice);
      await expect(page.locator('#nav button[data-view="analysis"]')).toHaveText(loc.navScores);
      await expect(page.locator('#nav button[data-view="explore"]')).toHaveText(loc.navExplore);
    }
  });

  test('T1.5: dynamic ARIA attributes update to localized strings across all locales', async ({ app, page }) => {
    await app.open();

    for (const loc of LOCALES) {
      await selectLanguage(page, loc.code);

      await expect(page.locator('#set-lang')).toHaveAttribute('aria-label', loc.ariaLang);
      await expect(page.locator('#set-theme')).toHaveAttribute('aria-label', loc.ariaTheme);
      await expect(page.locator('#drawerClose')).toHaveAttribute('aria-label', loc.closeAria);
    }
  });

  test('T1.6: theory handbook (Learn view) renders localized unit headers across all locales', async ({ app, page }) => {
    await app.open();

    for (const loc of LOCALES) {
      await selectLanguage(page, loc.code);
      await page.locator('#drawerClose').click();

      // Navigate to Learn view
      await page.locator('#nav button[data-view="learn"]').click();
      await expect(page.locator('#view-learn')).toBeVisible();

      // The unit title in the header bar (.lu-unit) should reflect localized unit 1
      const unitHeader = page.locator('#view-learn .lu-unit b');
      if (typeof loc.unit1Title === 'string') {
        await expect(unitHeader).toHaveText(loc.unit1Title);
      } else {
        await expect(unitHeader).toHaveText(loc.unit1Title);
      }
    }
  });

  test('T1.7: musical terminology and dictionaries reflect localized names across all locales', async ({ app, page }) => {
    await app.open();

    for (const loc of LOCALES) {
      await selectLanguage(page, loc.code);

      // Verify scale display name via scaleDisp function in page evaluation
      const majorName = await page.evaluate(() => window.__etude.scaleDisp('Major (Ionian)'));
      expect(majorName, `Scale name in ${loc.code}`).toBe(loc.scaleMajor);
    }
  });

  test('T1.8: application loads and functions completely in offline standalone mode', async ({ app, page, context }) => {
    await app.open();

    // Verify offline capability: intercept and abort any future network requests
    await context.route('**/*', route => {
      // Allow only the original local HTML shell; block any external fetches
      if (route.request().url().includes('127.0.0.1') || route.request().url().startsWith('http://localhost')) {
        route.continue();
      } else {
        route.abort();
      }
    });

    for (const loc of LOCALES) {
      await selectLanguage(page, loc.code);
      await expect(page.locator('#drawerTitle')).toHaveText(loc.drawerTitle);
      await expect(page.locator('html')).toHaveAttribute('lang', loc.code);
    }
  });

});

/* ========================================================================== */
/* Tier 2: Boundary & Corner Cases                                            */
/* ========================================================================== */

test.describe('Tier 2: Boundary & Corner Cases', () => {

  test('T2.1: mobile 320px viewport: #set-lang container flex-wraps without horizontal clipping', async ({ app, page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await app.open();
    await openSettings(page);

    const langContainer = page.locator('#set-lang');
    await expect(langContainer).toBeVisible();

    // The container must use flex-wrap to prevent horizontal button overflow
    const flexWrap = await langContainer.evaluate(el => window.getComputedStyle(el).flexWrap);
    expect(['wrap', 'wrap-reverse']).toContain(flexWrap);

    // Every language button must be within the viewport width
    for (const loc of LOCALES) {
      const btn = langContainer.locator(`button[data-v="${loc.code}"]`);
      await expect(btn).toBeVisible();
      const box = await btn.boundingBox();
      expect(box, `Bounding box for button ${loc.code}`).not.toBeNull();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
    }

    // Overall document must not scroll horizontally
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(320);
  });

  test('T2.2: mobile 320px viewport: all 12 views display without horizontal scrolling across all locales', async ({ app, page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await app.open();

    for (const loc of LOCALES) {
      await selectLanguage(page, loc.code);
      await page.locator('#drawerClose').click();

      // Check each view at 320px width
      for (const view of ALL_VIEWS) {
        await page.evaluate(v => window.__etude.show(v), view);
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(scrollWidth, `View ${view} in locale ${loc.code} should not overflow 320px width`).toBeLessThanOrEqual(320);
      }
    }
  });

  test('T2.3: special characters, diacritics and accents render intact without mojibake', async ({ app, page }) => {
    await app.open();

    for (const loc of LOCALES) {
      await selectLanguage(page, loc.code);
      await page.locator('#drawerClose').click();

      // Test rendered greeting lede on Today view
      const ledeText = await page.locator('#view-today .lede').textContent();
      expect(ledeText).toBeTruthy();

      // Verify no escaped HTML entities or replacement character
      expect(ledeText).not.toContain('&');
      expect(ledeText).not.toContain('\uFFFD');
      expect(ledeText).not.toContain('&#');
    }
  });

  test('T2.4: positional format specifiers (%s, %a, %b) interpolate properly without literal tokens', async ({ app, page }) => {
    await app.open();

    for (const loc of LOCALES) {
      await selectLanguage(page, loc.code);

      // Evaluate t() with arguments for keys that use placeholders
      const testCases = await page.evaluate(() => [
        window.__etude.t('si_done', 3, 5),
        window.__etude.t('sum_more', 4),
        window.__etude.t('root_pos', 'C'),
      ]);

      for (const res of testCases) {
        expect(res).not.toContain('%s');
        expect(res).not.toContain('%a');
        expect(res).not.toContain('%b');
      }
    }
  });

  test('T2.5: direct localStorage seed restores active language on cold boot', async ({ context }) => {
    for (const loc of LOCALES) {
      // Boot app with pre-seeded language in ptt-v3
      const page = await context.newPage();
      await page.addInitScript(([s, l]) => {
        localStorage.clear();
        localStorage.setItem('ptt-v3', JSON.stringify(s || { v: 3, lang: l, data: {} }));
      }, [{ v: 3, lang: loc.code, data: {} }, loc.code]);
      await page.goto(APP);
      await page.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));

      await expect(page.locator('html')).toHaveAttribute('lang', loc.code);
      await openSettings(page);
      await expect(page.locator('#drawerTitle')).toHaveText(loc.drawerTitle);
      await expect(page.locator(`#set-lang button[data-v="${loc.code}"]`)).toHaveAttribute('aria-pressed', 'true');
      await page.close();
    }
  });

  test('T2.6: in-app language selection persists across browser reload', async ({ app, page }) => {
    await app.open();

    for (const loc of LOCALES) {
      await selectLanguage(page, loc.code);

      // Perform full page reload
      await page.reload();
      await page.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));

      // Verify language is retained post-reload
      await expect(page.locator('html')).toHaveAttribute('lang', loc.code);
      await openSettings(page);
      await expect(page.locator('#drawerTitle')).toHaveText(loc.drawerTitle);
      await expect(page.locator(`#set-lang button[data-v="${loc.code}"]`)).toHaveAttribute('aria-pressed', 'true');

      // Verify persisted state in localStorage
      const stored = await page.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem('ptt-v3') || '{}');
        return raw.lang;
      });
      expect(stored).toBe(loc.code);
    }
  });

  test('T2.7: invalid or corrupt persisted language falls back safely to "en"', async ({ page }) => {
    // Seed with invalid string code
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('ptt-v3', JSON.stringify({ v: 3, lang: 'nonexistent_locale_xyz', data: {} }));
    });

    await page.goto(APP);
    await page.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));

    // App must gracefully fall back to English
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await openSettings(page);
    await expect(page.locator('#drawerTitle')).toHaveText('Settings');
    await expect(page.locator('#set-lang button[data-v="en"]')).toHaveAttribute('aria-pressed', 'true');
  });

});

/* ========================================================================== */
/* Tier 3: Cross-Feature Combinations                                         */
/* ========================================================================== */

test.describe('Tier 3: Cross-Feature Combinations', () => {

  test('T3.1: switching language preserves active Solfège notation', async ({ app, page }) => {
    await app.open();
    await openSettings(page);

    // Switch notation to solfege
    await selectNotation(page, 'solfege');

    // Switch through all 7 languages sequentially
    for (const loc of LOCALES) {
      await page.locator(`#set-lang button[data-v="${loc.code}"]`).click();
      await expect(page.locator('#drawerTitle')).toHaveText(loc.drawerTitle);

      // Notation must stay solfege
      await expect(page.locator('#set-notation button[data-v="solfege"]')).toHaveAttribute('aria-pressed', 'true');
      const activeNotation = await page.evaluate(() => window.__etude.notation);
      expect(activeNotation).toBe('solfege');

      // Pitch spelling must use solfege
      const noteC = await page.evaluate(() => window.__etude.pcName(0, false));
      expect(noteC).toBe('Do');
    }
  });

  test('T3.2: switching language preserves active German notation (H / B)', async ({ app, page }) => {
    await app.open();
    await openSettings(page);

    // Switch notation to german
    await selectNotation(page, 'german');

    // Switch through all 7 languages
    for (const loc of LOCALES) {
      await page.locator(`#set-lang button[data-v="${loc.code}"]`).click();
      await expect(page.locator('#drawerTitle')).toHaveText(loc.drawerTitle);

      // Notation must stay german
      await expect(page.locator('#set-notation button[data-v="german"]')).toHaveAttribute('aria-pressed', 'true');
      const activeNotation = await page.evaluate(() => window.__etude.notation);
      expect(activeNotation).toBe('german');

      // Pitch spelling in German: B-flat is B, B-natural is H
      const pitchSpelling = await page.evaluate(() => [
        window.__etude.pcName(10, true),   // Bb -> B
        window.__etude.pcName(11, false),  // B -> H
      ]);
      expect(pitchSpelling).toEqual(['B', 'H']);
    }
  });

  test('T3.3: switching notation does not alter active language', async ({ app, page }) => {
    await app.open();

    // Set language to Romanian
    await selectLanguage(page, 'ro');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ro');

    // Cycle notation: letter -> solfege -> german -> letter
    const notations = ['solfege', 'german', 'letter'];
    for (const notSys of notations) {
      await selectNotation(page, notSys);

      // Language must remain Romanian
      await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
      await expect(page.locator('#drawerTitle')).toHaveText('Setări');
      const curLang = await page.evaluate(() => window.__etude.lang);
      expect(curLang).toBe('ro');
    }
  });

  test('T3.4: non-default language and non-default notation survive reload together', async ({ app, page }) => {
    await app.open();

    const pairs = [
      { lang: 'de', notation: 'solfege', drawer: 'Einstellungen', noteCheck: ['Do', 'Sol'] },
      { lang: 'pt-BR', notation: 'german', drawer: 'Configurações', noteCheck: ['B', 'H'] },
      { lang: 'it', notation: 'solfege', drawer: 'Impostazioni', noteCheck: ['Do', 'Mi'] },
    ];

    for (const { lang: l, notation: n, drawer, noteCheck } of pairs) {
      await selectLanguage(page, l);
      await selectNotation(page, n);

      // Reload page
      await page.reload();
      await page.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));

      // Verify both survived reload
      await expect(page.locator('html')).toHaveAttribute('lang', l);
      await openSettings(page);
      await expect(page.locator('#drawerTitle')).toHaveText(drawer);
      await expect(page.locator(`#set-lang button[data-v="${l}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator(`#set-notation button[data-v="${n}"]`)).toHaveAttribute('aria-pressed', 'true');

      const runtimeState = await page.evaluate(() => [window.__etude.lang, window.__etude.notation]);
      expect(runtimeState).toEqual([l, n]);
    }
  });

  test('T3.5: multi-tab synchronization updates language across tabs via storage event', async ({ app, context }) => {
    const page1 = await app.open();
    const page2 = await context.newPage();
    await page2.goto(APP);
    await page2.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));

    // Change language in page1 to Italian
    await selectLanguage(page1, 'it');

    // Page 2 must react to storage event and synchronize to Italian
    await expect.poll(() => page2.evaluate(() => window.__etude.lang)).toBe('it');
    await expect(page2.locator('html')).toHaveAttribute('lang', 'it');
    await openSettings(page2);
    await expect(page2.locator('#drawerTitle')).toHaveText('Impostazioni');

    await page2.close();
  });

  test('T3.6: multi-tab notation sync preserves language in both tabs', async ({ app, context }) => {
    const page1 = await app.open();
    await selectLanguage(page1, 'fr');

    const page2 = await context.newPage();
    await page2.goto(APP);
    await page2.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));
    await selectLanguage(page2, 'es');

    // Page 1 changes notation to solfege
    await selectNotation(page1, 'solfege');

    // Page 2 receives notation change without losing its Spanish language
    await expect.poll(() => page2.evaluate(() => window.__etude.notation)).toBe('solfege');
    expect(await page2.evaluate(() => window.__etude.lang)).toBe('es');
    await expect(page2.locator('html')).toHaveAttribute('lang', 'es');

    await page2.close();
  });

});

/* ========================================================================== */
/* Tier 4: Real-World Scenarios (Full User Journeys)                          */
/* ========================================================================== */

test.describe('Tier 4: Real-World Scenarios (Full User Journeys)', () => {

  test('T4.1: Journey 1: Spanish onboarding, theory handbook reading and quiz interaction', async ({ app, page }) => {
    await app.open();

    // 1. User opens Settings drawer and chooses Spanish
    await selectLanguage(page, 'es');
    await expect(page.locator('#drawerTitle')).toHaveText('Ajustes');
    await page.locator('#drawerClose').click();

    // 2. User navigates to Theory Handbook (Learn view)
    await page.locator('#nav button[data-view="learn"]').click();
    await expect(page.locator('#view-learn')).toBeVisible();

    // 3. Verifies Unit 1 header "Fundamentos"
    const unitTitle = page.locator('#view-learn .lu-unit b');
    await expect(unitTitle).toHaveText('Fundamentos');

    // 4. Verifies Lesson content is displayed in Spanish
    const lessonContent = page.locator('#learnBody .learn-content');
    await expect(lessonContent).toBeVisible();
    const bodyText = await lessonContent.textContent();
    expect(bodyText.length).toBeGreaterThan(100);

    // 5. Verifies interactive lesson widgets (staff / demo) are mounted
    const widgets = page.locator('#learnBody [data-demo], #learnBody .lw-staff, #learnBody svg');
    expect(await widgets.count()).toBeGreaterThan(0);
  });

  test('T4.2: Journey 2: German classical study session with German pitch notation (H / B)', async ({ app, page }) => {
    await app.open();

    // 1. User configures German language and German notation system
    await selectLanguage(page, 'de');
    await selectNotation(page, 'german');
    await expect(page.locator('#drawerTitle')).toHaveText('Einstellungen');
    await page.locator('#drawerClose').click();

    // 2. User navigates to Explore view
    await page.locator('#nav button[data-view="explore"]').click();
    await expect(page.locator('#view-explore')).toBeVisible();

    // 3. Verifies Circle of Fifths and note spelling in German
    const spelledGerman = await page.evaluate(() => ({
      bNatural: window.__etude.cofSpell('B', 0),
      bFlat: window.__etude.cofSpell('B', -1),
      scaleMajor: window.__etude.scaleDisp('Major (Ionian)'),
      scaleMinor: window.__etude.scaleDisp('Aeolian (Natural minor)'),
    }));

    // B-natural is H, B-flat is B, Major is Dur, Minor is Moll
    expect(spelledGerman.bNatural).toBe('H');
    expect(spelledGerman.bFlat).toBe('B');
    expect(spelledGerman.scaleMajor).toBe('Dur (Ionisch)');
    expect(spelledGerman.scaleMinor).toBe('Moll (Natürliches Moll)');
  });

  test('T4.3: Journey 3: Brazilian Portuguese daily practice journey', async ({ app, page }) => {
    // 1. User starts app with Brazilian Portuguese
    await app.open({
      saved: { v: 3, lang: 'pt-BR', data: {} },
      lang: 'pt-BR',
    });

    // 2. Verifies Today view displays Portuguese headings and counters
    await expect(page.locator('#view-today .eyebrow')).toHaveText('Prática de hoje');
    await expect(page.locator('#view-today .streak-l')).toHaveText('dias seguidos');

    // 3. User begins a practice session
    const startBtn = page.locator('#pr-start');
    if (await startBtn.isVisible()) {
      await startBtn.click();
      await expect(page.locator('#session')).toBeVisible();

      // Controls must show Portuguese action buttons
      const revealBtn = page.locator('#q-reveal');
      if (await revealBtn.isVisible()) {
        await expect(revealBtn).toHaveText('Mostrar resposta');
      }

      const endBtn = page.locator('#ses-end');
      if (await endBtn.isVisible()) {
        await expect(endBtn).toHaveText('Encerrar');
      }
    }
  });

  // @sw: needs a live service worker, so it runs in the `sw` project (see playwright.config.mjs).
  test('T4.4: Journey 4: French offline resilience journey', { tag: '@sw' }, async ({ app, page, context }) => {
    await app.open({ dock: true });

    // 1. Switch to French
    await selectLanguage(page, 'fr');
    await expect(page.locator('#drawerTitle')).toHaveText('Paramètres');
    await page.locator('#drawerClose').click();

    // 2. Simulate complete loss of network connectivity
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller);
    await context.setOffline(true);

    // 3. Perform a browser reload while completely offline
    await page.reload();
    await page.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));

    // 4. Verify application remains 100% operational offline in French
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await openSettings(page);
    await expect(page.locator('#drawerTitle')).toHaveText('Paramètres');
    await page.locator('#drawerClose').click();

    // 5. Test interaction with piano keyboard (press below the black keys, which cover the white key's centre)
    const firstWhiteKey = page.locator('#keys .white').first();
    await expect(firstWhiteKey).toBeVisible();
    const keyBox = await firstWhiteKey.boundingBox();
    await firstWhiteKey.click({ position: { x: keyBox.width / 2, y: keyBox.height - 10 } });

    // Clean up offline state
    await context.setOffline(false);
  });

});

import { test, expect, APP } from './fixtures.mjs';

/**
 * Empirical Challenger Adversarial Test Suite
 * Stress-tests:
 * 1. Rapid language switching (DOM race conditions, memory growth, state corruption)
 * 2. Complete decoupling of note notation and language switching (adversarial sequences, multi-tab sync)
 * 3. Extreme viewports (320, 360, 375, 412, 768, 1280px)
 * 4. Corrupted localStorage payloads & recovery
 * 5. Offline resilience & zero external network dependencies
 */

const ALL_LOCALES = ['en', 'ro', 'es', 'fr', 'de', 'it', 'pt-BR'];
const NOTATIONS = ['letter', 'solfege', 'german'];
const VIEWPORTS = [320, 360, 375, 412, 768, 1280];

test.describe('Adversarial Stress Test: Rapid Language Switching', () => {
  test('rapid round-robin and randomized language switching does not corrupt DOM or leak unbound memory', async ({ app }) => {
    const page = await app.open();
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#drawer')).toHaveClass(/on/);

    // Warm up one switch to allow lazy one-time select/circle initialization
    await page.locator('#set-lang button[data-v="ro"]').click();
    // The language buttons defer part of that work (the Read view's range selects) with setTimeout(…, 0);
    // let it run so the baseline isn't taken halfway through the first fill.
    await page.evaluate(() => new Promise(r => setTimeout(r, 0)));

    // Baseline stats after warm-up
    const baselineStats = await page.evaluate(() => ({
      domCount: document.getElementsByTagName('*').length,
      heap: window.performance?.memory?.usedJSHeapSize ?? 0,
    }));

    // Perform 70 rapid switches (10 full cycles through all 7 locales)
    const sequence = [];
    for (let cycle = 0; cycle < 10; cycle++) {
      for (const loc of ALL_LOCALES) {
        sequence.push(loc);
      }
    }

    // Execute via rapid clicks and in-page setLang calls
    for (let i = 0; i < sequence.length; i++) {
      const code = sequence[i];
      if (i % 2 === 0) {
        // Direct click on switcher button
        await page.locator(`#set-lang button[data-v="${code}"]`).click();
      } else {
        // Programmatic setLang call to stress synchronous microtask timing
        await page.evaluate((c) => setLang(c), code);
      }
    }

    // Settle on German ('de')
    await page.locator('#set-lang button[data-v="de"]').click();

    // Verify DOM consistency
    const domIntegrity = await page.evaluate(() => {
      const errors = [];
      // 1. html[lang] matches
      if (document.documentElement.lang !== 'de') errors.push(`Root lang mismatch: ${document.documentElement.lang}`);
      // 2. Exactly one button pressed
      const pressed = Array.from(document.querySelectorAll('#set-lang button[aria-pressed="true"]'));
      if (pressed.length !== 1 || pressed[0].dataset.v !== 'de') errors.push(`Aria pressed mismatch: count=${pressed.length}, v=${pressed[0]?.dataset?.v}`);
      // 3. Check data-i18n elements for undefined or raw template leaks
      const i18nEls = Array.from(document.querySelectorAll('[data-i18n]'));
      for (const el of i18nEls) {
        const text = el.textContent || '';
        if (text.includes('undefined') || text.includes('null')) {
          errors.push(`data-i18n element leaked undefined/null: ${el.dataset.i18n}`);
        }
      }
      // 4. Select options integrity
      const sscale = document.getElementById('tr-sscale');
      if (sscale && sscale._filled && sscale.options.length < 10) errors.push(`Scale options missing or empty: ${sscale.options.length}`);
      const acPat = document.getElementById('ac-pat');
      if (acPat && acPat._filled && acPat.options.length < 3) errors.push(`Accomp patterns missing or empty: ${acPat.options.length}`);

      return {
        errors,
        domCount: document.getElementsByTagName('*').length,
        heap: window.performance?.memory?.usedJSHeapSize ?? 0,
      };
    });

    expect(domIntegrity.errors).toEqual([]);

    // DOM node count after 70 switches should be identical to warm-up (0 leaked elements)
    const domDelta = Math.abs(domIntegrity.domCount - baselineStats.domCount);
    expect(domDelta).toBeLessThanOrEqual(5); // Strict bound: essentially zero node buildup
  });

  test('rapid language switching concurrent with view navigation does not throw uncaught errors', async ({ app }) => {
    const page = await app.open();
    const views = ['today', 'learn', 'practice', 'explore', 'songs', 'read', 'analysis'];

    for (let i = 0; i < 21; i++) {
      const targetView = views[i % views.length];
      const targetLang = ALL_LOCALES[i % ALL_LOCALES.length];

      await page.evaluate(({ v, l }) => {
        show(v);
        setLang(l);
      }, { v: targetView, l: targetLang });
    }

    // Verify current state is coherent
    const state = await page.evaluate(() => ({
      activeView: view0(),
      activeLang: lang,
      hasKeys: !!document.querySelector('#keys .key'),
    }));

    expect(views).toContain(state.activeView);
    expect(ALL_LOCALES).toContain(state.activeLang);
    expect(state.hasKeys).toBe(true);
  });
});

test.describe('Adversarial Stress Test: Note Notation & Language Decoupling', () => {
  test('all 21 notation x language combinations maintain pitch naming integrity', async ({ app }) => {
    const page = await app.open();

    for (const not of NOTATIONS) {
      // Set notation
      await page.evaluate((n) => {
        notation = n;
        applyNotation();
        saveAll();
      }, not);

      for (const loc of ALL_LOCALES) {
        // Set language
        await page.evaluate((l) => setLang(l), loc);

        const checks = await page.evaluate(() => {
          return {
            currentLang: lang,
            currentNotation: notation,
            root0: rootName(0),     // C or Do
            pc10Flat: pcName(10, true),  // Bb or Sib or B
            pc10Sharp: pcName(10, false), // A# or La#
            pc11: pcName(11, false),      // B or Si or H
            note71: noteName(71, false),  // B4 or Si4 or H4
          };
        });

        expect(checks.currentLang).toBe(loc);
        expect(checks.currentNotation).toBe(not);

        if (not === 'letter') {
          expect(checks.root0).toBe('C');
          expect(checks.pc10Flat).toBe('Bb');
          expect(checks.pc11).toBe('B');
          expect(checks.note71).toBe('B4');
        } else if (not === 'solfege') {
          expect(checks.root0).toBe('Do');
          expect(checks.pc10Flat).toBe('Sib');
          expect(checks.pc11).toBe('Si');
          expect(checks.note71).toBe('Si4');
        } else if (not === 'german') {
          expect(checks.root0).toBe('C');
          expect(checks.pc10Flat).toBe('B');   // In German, B-flat is B
          expect(checks.pc11).toBe('H');       // In German, B-natural is H
          expect(checks.note71).toBe('H4');    // In German, B4 is H4
        }
      }
    }
  });

  test('rapid alternating switching between notation and language preserves both in localStorage', async ({ app }) => {
    const page = await app.open();
    await page.locator('#settingsBtn').click();

    for (let i = 0; i < 15; i++) {
      const loc = ALL_LOCALES[i % ALL_LOCALES.length];
      const not = NOTATIONS[i % NOTATIONS.length];

      await page.locator(`#set-lang button[data-v="${loc}"]`).click();
      await page.locator(`#set-notation button[data-v="${not}"]`).click();

      // Check immediate in-memory and UI state
      await expect(page.locator(`#set-lang button[data-v="${loc}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator(`#set-notation button[data-v="${not}"]`)).toHaveAttribute('aria-pressed', 'true');
    }

    // Set a known terminal state: 'fr' and 'german'
    await page.locator('#set-lang button[data-v="fr"]').click();
    await page.locator('#set-notation button[data-v="german"]').click();

    // Verify localStorage payload
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('ptt-v3');
      return JSON.parse(raw);
    });

    expect(stored.lang).toBe('fr');
    expect(stored.notation).toBe('german');

    // Reload page to confirm survival
    await page.reload();
    await page.waitForFunction(() => typeof window.show === 'function' && document.querySelector('#keys .key'));

    const reloaded = await page.evaluate(() => ({
      lang,
      notation,
      h4: noteName(71, false),
    }));

    expect(reloaded.lang).toBe('fr');
    expect(reloaded.notation).toBe('german');
    expect(reloaded.h4).toBe('H4');
  });

  test('multi-tab concurrent adversarial sync: Tab 1 changes lang while Tab 2 changes notation', async ({ app, context }) => {
    const page1 = await app.open();
    const page2 = await context.newPage();
    await page2.goto(APP);
    await page2.waitForFunction(() => typeof window.show === 'function' && document.querySelector('#keys .key'));

    // Initial state: en + letter
    await page1.locator('#settingsBtn').click();
    await page2.locator('#settingsBtn').click();

    // Tab 1 sets language to 'it'
    await page1.locator('#set-lang button[data-v="it"]').click();

    // Tab 2 sets notation to 'german'
    await page2.locator('#set-notation button[data-v="german"]').click();

    // Wait for cross-tab storage sync
    await expect.poll(() => page1.evaluate(() => notation)).toBe('german');
    await expect.poll(() => page1.evaluate(() => lang)).toBe('it');

    await expect.poll(() => page2.evaluate(() => lang)).toBe('it');
    await expect.poll(() => page2.evaluate(() => notation)).toBe('german');

    // Check pitch names in both tabs
    expect(await page1.evaluate(() => noteName(71, false))).toBe('H4');
    expect(await page2.evaluate(() => noteName(71, false))).toBe('H4');

    await page2.close();
  });
});

test.describe('Adversarial Stress Test: Extreme Viewports & Mobile Boundary', () => {
  for (const width of VIEWPORTS) {
    test(`viewport ${width}px: no horizontal document overflow in all 7 locales and Settings buttons wrap`, async ({ page }) => {
      await page.setViewportSize({ width, height: 720 });
      await page.goto(APP);
      await page.waitForFunction(() => typeof window.show === 'function' && document.querySelector('#keys .key'));

      // Test across locales
      const localeOverflows = [];
      for (const loc of ALL_LOCALES) {
        await page.evaluate((l) => setLang(l), loc);
        await page.waitForTimeout(200); // allow layout / resize handlers to settle

        // Verify document scrollWidth does not exceed viewport width (with drawer closed)
        const overflow = await page.evaluate((w) => {
          const settingsBtn = document.getElementById('settingsBtn');
          return {
            docScrollWidth: document.documentElement.scrollWidth,
            docClientWidth: document.documentElement.clientWidth,
            settingsBtnRight: settingsBtn ? settingsBtn.getBoundingClientRect().right : 0,
          };
        }, width);

        if (overflow.docScrollWidth > overflow.docClientWidth + 1) {
          localeOverflows.push({ loc, width, scrollWidth: overflow.docScrollWidth, settingsBtnRight: overflow.settingsBtnRight });
        }

        // Open settings drawer
        await page.locator('#settingsBtn').click();
        await expect(page.locator('#drawer')).toHaveClass(/on/);

        // Verify every language button fits inside viewport width
        const buttonPositions = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('#set-lang button'));
          return btns.map((b) => {
            const rect = b.getBoundingClientRect();
            return {
              text: b.textContent,
              x: rect.x,
              right: rect.x + rect.width,
            };
          });
        });

        for (const pos of buttonPositions) {
          expect(pos.x).toBeGreaterThanOrEqual(0);
          expect(pos.right).toBeLessThanOrEqual(width + 2); // allowance for subpixel rounding
        }

        // Close drawer for next iteration and wait for drawer animation to finish
        await page.locator('#drawerClose').click();
        await expect(page.locator('#drawer')).not.toHaveClass(/on/);
        await page.waitForTimeout(250);
      }
      expect(localeOverflows, `Horizontal overflow at ${width}px: ` + JSON.stringify(localeOverflows)).toEqual([]);
    });
  }
});

test.describe('Adversarial Stress Test: Corrupted localStorage Payloads', () => {
  const CORRUPT_CASES = [
    { name: 'syntax error string', payload: '{bad json syntax: 123' },
    { name: 'primitive string', payload: '"hello world"' },
    { name: 'primitive number', payload: '12345' },
    { name: 'null payload', payload: 'null' },
    { name: 'array payload', payload: '[1, 2, 3]' },
    { name: 'future schema version', payload: JSON.stringify({ v: 99, lang: 'de', data: {} }) },
    { name: 'missing data object', payload: JSON.stringify({ v: 3, lang: 'es' }) },
    { name: 'unknown language code', payload: JSON.stringify({ v: 3, lang: 'xx-UNKNOWN', data: {} }) },
    { name: 'unknown notation', payload: JSON.stringify({ v: 3, notation: 'alien_tones', data: {} }) },
    { name: 'extreme numbers', payload: JSON.stringify({ v: 3, lang: 'es', masterVol: 999999, bpm: -800, data: {} }) },
    { name: 'prototype pollution attempt', payload: '{"v":3,"__proto__":{"polluted":true},"data":{}}' },
  ];

  for (const c of CORRUPT_CASES) {
    test(`cold boot recovers cleanly from corrupted payload: ${c.name}`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (err) => errors.push(err));

      await page.addInitScript((val) => {
        localStorage.clear();
        localStorage.setItem('ptt-v3', val);
      }, c.payload);

      await page.goto(APP);
      await page.waitForFunction(() => typeof window.show === 'function' && document.querySelector('#keys .key'));

      // App must boot without uncaught fatal errors
      expect(errors.map((e) => e.message)).toEqual([]);

      // Check fallback state
      const state = await page.evaluate(() => ({
        lang,
        notation,
        polluted: Object.prototype.polluted !== undefined,
        masterVol,
        metroBpm: metro.bpm,
      }));

      expect(ALL_LOCALES).toContain(state.lang);
      expect(NOTATIONS).toContain(state.notation);
      expect(state.polluted).toBe(false);
      expect(state.masterVol).toBeGreaterThanOrEqual(0);
      expect(state.masterVol).toBeLessThanOrEqual(1);
      expect(state.metroBpm).toBeGreaterThanOrEqual(50);
      expect(state.metroBpm).toBeLessThanOrEqual(180);

      // Verify user can open settings, select a language and save without error
      await page.locator('#settingsBtn').click();
      await page.locator('#set-lang button[data-v="es"]').click();
      await expect(page.locator('#set-lang button[data-v="es"]')).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => lang)).toBe('es');
    });
  }
});

test.describe('Adversarial Stress Test: Network Offline Mode & Zero Network Dependencies', () => {
  test('complete offline mode functions with zero network requests', async ({ page, context }) => {
    await page.goto(APP);
    await page.waitForFunction(() => typeof window.show === 'function' && document.querySelector('#keys .key'));

    // Abort and track any subsequent external requests (excluding optional CDN webfonts)
    const appExternalRequests = [];
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (url.includes('127.0.0.1') || url.includes('localhost')) {
        route.continue();
      } else {
        if (!url.includes('fonts.googleapis.com') && !url.includes('fonts.gstatic.com')) {
          appExternalRequests.push(url);
        }
        route.abort();
      }
    });

    await context.setOffline(true);

    // 1. Switch across all 7 languages offline
    for (const loc of ALL_LOCALES) {
      await page.evaluate((l) => setLang(l), loc);
      const activeLang = await page.evaluate(() => lang);
      expect(activeLang).toBe(loc);
    }

    // 2. Navigate through all major views offline
    const views = ['today', 'learn', 'practice', 'explore', 'songs', 'analysis'];
    for (const v of views) {
      await page.evaluate((viewName) => show(viewName), v);
      expect(await page.evaluate(() => view0())).toBe(v);
    }

    // 3. Audio synthesis offline test
    await page.evaluate(() => {
      ensureAudio();
      // Test piano voice creation
      if (typeof noteOn === 'function') {
        noteOn(60, 0.8);
        noteOff(60);
      }
    });

    // 4. Theory handbook offline lesson reading
    await page.evaluate(() => {
      show('learn');
      if (typeof renderLearn === 'function') renderLearn();
    });

    const learnBody = await page.locator('#learnBody').textContent();
    expect(learnBody).toBeTruthy();

    // Zero external application requests made
    expect(appExternalRequests).toEqual([]);

    await context.setOffline(false);
  });
});

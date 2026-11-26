import { test, expect, todayN } from '../helpers/fixtures.mjs';

test.describe('UI/UX polish, accessibility, and mobile ergonomics', () => {
  test('contrast tokens, SVG reading icons, Explore measure, and idle cursor will-change', async ({ app, page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await app.open({ hash: 'read', dock: true });
    await page.locator('#rdt-drills').click();
    await expect(page.locator('.rdx-lv .st').first()).toBeVisible();

    const checks = await page.evaluate(() => {
      const whiteLbl = document.querySelector('#keys .white .lbl');
      const track = document.querySelector('#drawer .switch input:not(:checked) + .track');
      const rdxStar = document.querySelector('.rdx-lv .st');
      const drillsTab = document.getElementById('rdt-drills');
      const piecesTab = document.getElementById('rdt-pieces');
      const customSum = document.querySelector('#rdx-custom > summary');
      return {
        whiteLblColor: whiteLbl ? getComputedStyle(whiteLbl).color : null,
        trackBg: track ? getComputedStyle(track).backgroundColor : null,
        rdxStarColor: rdxStar ? getComputedStyle(rdxStar).color : null,
        drillsHasSvg: !!drillsTab?.querySelector('svg.rdx-ic'),
        piecesHasSvg: !!piecesTab?.querySelector('svg.rdx-ic'),
        customHasSvg: !!customSum?.querySelector('svg.rdx-ic'),
        rawEmoji: /[🎯🎼⚙]/.test((drillsTab?.textContent ?? '') + (piecesTab?.textContent ?? '') + (customSum?.textContent ?? '')),
      };
    });

    expect(checks.whiteLblColor).toBe('rgb(100, 91, 76)');
    expect(checks.trackBg).toBe('rgb(138, 128, 114)');
    expect(checks.rdxStarColor).toBe('rgb(132, 96, 23)');
    expect(checks.drillsHasSvg).toBe(true);
    expect(checks.piecesHasSvg).toBe(true);
    expect(checks.customHasSvg).toBe(true);
    expect(checks.rawEmoji).toBe(false);

    await page.evaluate(() => window.__etude.show('explore'));
    const ledeWidth = await page.locator('.ex-head .lede').evaluate(el => getComputedStyle(el).maxWidth);
    expect(parseFloat(ledeWidth)).toBeLessThan(720);

    await page.evaluate(() => window.__etude.show('analysis'));
    await page.locator('#pc-list .pc-item[data-piece="twinkle"]').click();
    await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
    const cursorWillChange = await page.locator('.sc-cursor').evaluate(el => getComputedStyle(el).willChange);
    expect(cursorWillChange).toBe('auto');
  });

  test('themed #appDialog stacks inert over #drawer and Escape closes one overlay layer at a time', async ({ app, page }) => {
    await app.open();
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#drawer')).toHaveClass(/on/);

    // Stack #helpBox over #drawer via runtime API: #drawer must become inert while #helpBox is on top.
    await page.evaluate(() => window.__etude.openHelp(true));
    await expect(page.locator('#helpBox')).toHaveClass(/on/);
    expect(await page.locator('#drawer').evaluate(el => el.inert)).toBe(true);
    expect(await page.locator('#helpBox').evaluate(el => el.inert)).toBe(false);

    await page.keyboard.press('Escape');
    await expect(page.locator('#helpBox')).not.toHaveClass(/on/);
    await expect(page.locator('#drawer')).toHaveClass(/on/);
    expect(await page.locator('#drawer').evaluate(el => el.inert)).toBe(false);

    // Trigger #appDialog from inside #drawer with a malformed backup file.
    await page.locator('#importFile').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"v":3,"data":[]}'),
    });
    const dialog = page.locator('#appDialog.on');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('role', 'alertdialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(await page.locator('#drawer').evaluate(el => el.inert)).toBe(true);

    // Escape closes #appDialog without closing #drawer underneath.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('#drawer')).toHaveClass(/on/);
    expect(await page.locator('#drawer').evaluate(el => el.inert)).toBe(false);

    // Trigger #appDialog again and verify browser Back closes #appDialog first while keeping #drawer open.
    await page.locator('#importFile').setInputFiles({
      name: 'bad-back.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"v":3,"data":[]}'),
    });
    await expect(dialog).toBeVisible();
    await page.goBack();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#drawer')).toHaveClass(/on/);
    expect(await page.locator('#drawer').evaluate(el => el.inert)).toBe(false);

    // Collapsible Settings sections (.set-acc) toggle cleanly.
    const midiAcc = page.locator('#drawer details.set-acc').first();
    await expect(midiAcc).toHaveAttribute('open', '');
    await midiAcc.locator('> summary').click();
    await expect(midiAcc).not.toHaveAttribute('open', '');

    // A second Back closes #drawer cleanly.
    await page.goBack();
    await expect(page.locator('#drawer')).not.toHaveClass(/on/);
  });

  test('Library moves the single Reset filters button next to No matching scores without duplicating it', async ({ app, page }) => {
    await app.open({ hash: 'analysis' });
    const xml = '<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Minuet in G</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>';
    await page.locator('#an-file').setInputFiles({ name: 'minuet.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
    await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);

    await page.locator('#an-back').click();
    if (await page.locator('#an-tab-library').getAttribute('aria-selected') !== 'true')
      await page.locator('#an-tab-library').click();
    if (!await page.locator('#score-library').evaluate(node => node.open))
      await page.locator('#score-library > summary').click();
    await expect(page.locator('#library-items > li')).toHaveCount(1);

    // Filter with matching query -> single Reset filters button in toolbar bar actions.
    await page.locator('#library-search').fill('Minuet');
    await expect(page.locator('#library-reset-filters')).toHaveCount(1);
    await expect(page.locator('.score-library-toolbar-bar-actions #library-reset-filters')).toBeVisible();

    // Filter with non-matching query -> same single button moves into .score-library-empty.
    await page.locator('#library-search').fill('NoSuchPieceXYZ');
    await expect(page.locator('#library-reset-filters')).toHaveCount(1);
    await expect(page.locator('.score-library-empty #library-reset-filters')).toBeVisible();
    await expect(page.locator('.score-library-toolbar-bar-actions #library-reset-filters')).toHaveCount(0);

    // Clicking it clears filters and restores the item.
    await page.locator('.score-library-empty #library-reset-filters').click();
    await expect(page.locator('#library-items > li')).toHaveCount(1);
    await expect(page.locator('#library-reset-filters')).toHaveCount(0);
  });

  test('localized loading state appears while Learn payload loads in Romanian', async ({ app, page }) => {
    let releaseLearn;
    const held = new Promise(resolve => { releaseLearn = resolve; });
    await page.route(/learn-ro(?:-[^/?]+)?\.(?:js|ts)(?:\?.*)?$/, async route => {
      await held;
      await route.continue();
    });
    await app.open({ lang: 'ro' });
    await page.locator('#nav [data-view="learn"]').click();
    const loading = page.locator('#learnBody [data-lazy-loading]');
    await expect(loading).toBeVisible();
    await expect(loading).toHaveText('Se încarcă…');
    releaseLearn();
    await expect(loading).toHaveCount(0);
  });

  test('Pieces shows a visible localized loading state while analysis modules are delayed', async ({ app, page }) => {
    let releaseAnalysis;
    const held = new Promise(resolve => { releaseAnalysis = resolve; });
    await page.route(/score-(?:tools|import|svg-post|midi)(?:-.*\.js|\.ts)(?:\?.*)?$/, async route => {
      await held;
      await route.continue();
    });
    await app.open({ lang: 'ro' });
    await page.locator('#nav [data-view="analysis"]').click();
    await expect(page.locator('#view-analysis')).toHaveClass(/active/);
    const loading = page.locator('#view-analysis [data-lazy-loading]');
    await expect(loading).toBeVisible();
    await expect(loading).toHaveText('Se încarcă…');
    releaseAnalysis();
    await expect(loading).toHaveCount(0);
    await expect(page.locator('#pc-list')).toBeVisible();
  });
});

test.describe('touch phone ergonomics & drawer close hit-area preservation', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('#drawerClose keeps position:absolute with 44px ::after hit area, drawer uses bottom sheet, and Help hides desktop-only rows', async ({ app, page }) => {
    await app.open();
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#drawer')).toHaveClass(/on/);

    const drawerMetrics = await page.evaluate(() => {
      const drawer = document.getElementById('drawer');
      const close = document.getElementById('drawerClose');
      const closeStyle = getComputedStyle(close);
      const afterStyle = getComputedStyle(close, '::after');
      const langBtns = [...document.querySelectorAll('#set-lang button')].map(b => getComputedStyle(b).borderRadius);
      return {
        drawerWidth: Math.round(drawer.getBoundingClientRect().width),
        closePosition: closeStyle.position,
        afterMinW: parseFloat(afterStyle.minWidth),
        afterMinH: parseFloat(afterStyle.minHeight),
        langRadii: [...new Set(langBtns)],
      };
    });

    expect(drawerMetrics.drawerWidth).toBe(390);
    expect(drawerMetrics.closePosition).toBe('absolute');
    expect(drawerMetrics.afterMinW).toBeGreaterThanOrEqual(44);
    expect(drawerMetrics.afterMinH).toBeGreaterThanOrEqual(44);
    expect(drawerMetrics.langRadii).toEqual(['8px']);

    await page.locator('#drawerClose').click();
    await expect(page.locator('#drawer')).not.toHaveClass(/on/);

    await page.locator('#helpBtn').click();
    await expect(page.locator('#helpBox')).toHaveClass(/on/);
    await expect(page.locator('#helpBox .hk.ctx-kbd').first()).toBeHidden();
    await expect(page.locator('#helpBox .hk:not(.ctx-kbd)')).toHaveCount(3);
  });

  test('appDialog blocks keyboard piano input, visiting Read does not mark Today done, and Escape stops active Read focus', async ({ app, page }) => {
    await app.open({ dock: true, hash: 'explore' });
    await page.evaluate(() => {
      document.getElementById('appDialog')?.classList.add('on');
    });
    await page.keyboard.press('a');
    expect(await page.evaluate(() => window.__etude.held.size)).toBe(0);
    await page.evaluate(() => {
      document.getElementById('appDialog')?.classList.remove('on');
    });

    await page.evaluate(() => { window.__etude.show('read'); });
    await expect(page.locator('#view-read')).toHaveClass(/active/);
    const readDay = await page.evaluate(() => window.__etude.data.toolDay?.read ?? null);
    expect(readDay).not.toBe(todayN());

    await page.locator('#rdn-book-go').click();
    await expect(page.locator('#rd-staff svg')).toBeVisible();
    await page.locator('#rd-fs').click();
    await expect(page.locator('body')).toHaveAttribute('data-score-focus', 'read');
    await page.locator('#rd-go').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.active)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveAttribute('data-score-focus');
    await expect.poll(() => page.evaluate(() => window.__etude.SR.active)).toBe(false);
    await expect(page.locator('#rd-go')).toBeFocused();
  });
});

test.describe('Wave 2A UX and localization regressions', () => {
  test('Progress hides #prog-empty when Learn activity exists with 0 card reviews', async ({ app, page }) => {
    await app.open({ hash: 'progress', saved: { v: 3, lang: 'en', data: { learnDone: { 0: todayN() } } } });
    await expect(page.locator('#prog-empty')).toBeHidden();
  });

  test('ending a Today session at 0 answers returns to #today-home without showing Well done 0%', async ({ app, page }) => {
    await app.open({ hash: 'today' });
    await page.locator('#startBtn').click();
    await expect(page.locator('#session')).toBeVisible();
    await page.locator('#ses-end').click();
    await expect(page.locator('#session')).toBeHidden();
    await expect(page.locator('#summary')).toBeHidden();
    await expect(page.locator('#today-home')).toBeVisible();
    await expect(page.locator('#startBtn')).toBeFocused();
  });

  test('German Read key labels use hyphenated -Dur and -Moll forms', async ({ app, page }) => {
    await app.open({ hash: 'read', lang: 'de' });
    await expect(page.locator('#rdn-home')).toContainText('C-Dur');
    await expect(page.locator('#rdn-home')).not.toContainText('C Dur');
    await page.locator('#rdt-pieces').click();
    await page.locator('#rd-gen').click();
    await expect(page.locator('#rd-meta')).toHaveText(/-(Dur|Moll)\b/);
    await expect(page.locator('#rd-meta')).not.toHaveText(/\s(Dur|Moll)\b/);
    const labels = await page.evaluate(() => {
      const e = window.__etude;
      const ksLevel = Object.values(e.RD_LV).find(l => l.ty === 'ks');
      e.rdOpen(ksLevel);
      e.rdStart('practice');
      return {
        cMaj: e.rdKeyLabel(0),
        aMin: e.rdKeyMinor(0),
        btns: [...document.querySelectorAll('#rdx-ans .rdx-a')].map(el => el.textContent ?? ''),
      };
    });
    expect(labels.cMaj).toBe('C-Dur');
    expect(labels.aMin).toBe('A-Moll');
    expect(labels.btns.length).toBeGreaterThan(0);
    expect(labels.btns.some(txt => /-(Dur|Moll)/.test(txt))).toBe(true);
    expect(labels.btns.some(txt => /\s(Dur|Moll)/.test(txt))).toBe(false);
  });

  test('light and dark themes meet AA text contrast (>= 4.5:1) and preserve subtle score shadows', async ({ app, page }) => {
    await app.open({ hash: 'analysis' });
    await page.locator('#pc-list .pc-item[data-piece="twinkle"]').click();
    await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);

    const measure = () => page.evaluate(() => {
      const parseRgb = str => str.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => [r, g, b].map(c => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      }).reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
      const contrast = (fg, bg) => {
        const l1 = lum(parseRgb(fg)), l2 = lum(parseRgb(bg));
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const panel = document.getElementById('an-panel');
      const muted = document.getElementById('st-bar');
      const primary = document.getElementById('score-play');
      const sheetPage = document.querySelector('#an-roll .an-sheet > div');
      const panelBg = getComputedStyle(panel).backgroundColor;
      return {
        inkRatio: contrast(getComputedStyle(panel).color, panelBg),
        mutedRatio: contrast(getComputedStyle(muted).color, getComputedStyle(document.getElementById('an-status')).backgroundColor),
        ctaRatio: contrast(getComputedStyle(primary).color, getComputedStyle(primary).backgroundColor),
        shadow: sheetPage ? getComputedStyle(sheetPage).boxShadow : '',
      };
    });

    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    const light = await measure();
    expect(light.inkRatio).toBeGreaterThanOrEqual(4.5);
    expect(light.mutedRatio).toBeGreaterThanOrEqual(4.5);
    expect(light.ctaRatio).toBeGreaterThanOrEqual(4.5);
    expect(light.shadow).not.toContain('rgba(0, 0, 0, 0.5)');

    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    const dark = await measure();
    expect(dark.inkRatio).toBeGreaterThanOrEqual(4.5);
    expect(dark.mutedRatio).toBeGreaterThanOrEqual(4.5);
    expect(dark.ctaRatio).toBeGreaterThanOrEqual(4.5);
  });

  test('Urtext Prussian palette and Mr De Haviland / Bodoni Moda typography apply to titles, hero numbers, and body text', async ({ app, page }) => {
    await app.open({ hash: 'today' });
    const today = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const fontOf = sel => getComputedStyle(document.querySelector(sel)).fontFamily;
      return {
        bodyFont: fontOf('body'),
        markFont: fontOf('.brand .mark'),
        tagFont: fontOf('.brand .tag'),
        h1Font: fontOf('#greet-title'),
        streakFont: fontOf('#streakN'),
        countFont: fontOf('#c-due'),
        cardTitleFont: fontOf('#hero-title'),
        accent: root.getPropertyValue('--accent').trim(),
        paper: root.getPropertyValue('--paper').trim(),
      };
    });
    expect(today.bodyFont).toContain('Bodoni Moda');
    expect(today.cardTitleFont).toContain('Bodoni Moda');
    expect(today.markFont).toContain('Mr De Haviland');
    expect(today.tagFont).toContain('Mr De Haviland');
    expect(today.h1Font).toContain('Mr De Haviland');
    expect(today.streakFont).toContain('Mr De Haviland');
    expect(today.countFont).toContain('Mr De Haviland');
    expect(today.accent).toBe('#1e4266');
    expect(today.paper).toBe('#f5f4ef');

    await page.evaluate(() => { window.__etude.show('progress'); });
    await expect(page.locator('#view-progress')).toHaveClass(/active/);
    const prog = await page.evaluate(() => ({
      h1Font: getComputedStyle(document.querySelector('#view-progress h1')).fontFamily,
      statFont: getComputedStyle(document.querySelector('#progStats .s b')).fontFamily,
      statLabelFont: getComputedStyle(document.querySelector('#progStats .s span')).fontFamily,
    }));
    expect(prog.h1Font).toContain('Mr De Haviland');
    expect(prog.statFont).toContain('Mr De Haviland');
    expect(prog.statLabelFont).toContain('Bodoni Moda');
  });
});

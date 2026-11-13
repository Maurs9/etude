import { test, expect } from '../helpers/fixtures.mjs';

// Above 840px a header too full for its tabs folds them into the menu (phones use the bottom bar instead).
// A long connected MIDI device name is a real way to get there.
const foldedHeader = async (app) => {
  const page = app.page, name = 'Yamaha Clavinova CLP-795GP Digital Piano MIDI 1';
  await page.addInitScript(name => {
    const input = { id: 'clp', name, type: 'input', state: 'connected', connection: 'open', onmidimessage: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => ({ inputs: new Map([[input.id, input]]), outputs: new Map(), sysexEnabled: false, onstatechange: null }) });
  }, name);
  await page.setViewportSize({ width: 900, height: 700 });
  await app.open();
  await page.locator('#midiChip').click();
  await expect(page.locator('#midiText')).toHaveText(name);
  await expect(page.locator('#menuBtn')).toBeVisible();
  return page;
};

test.describe('Android UX, Adaptive and Navigation-Event verification', () => {

  test('Viewport meta contains interactive-widget=resizes-content for Android edge-to-edge IME', async ({ app }) => {
    const page = await app.open();
    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewportMeta).toContain('viewport-fit=cover');
    expect(viewportMeta).toContain('interactive-widget=resizes-content');
  });

  test('Navigation-event: Android back gesture closes Settings drawer without navigating away', async ({ app }) => {
    const page = await app.open();
    await expect(page.locator('#view-today')).toHaveClass(/active/);

    // Open settings drawer
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#drawer')).toHaveClass(/on/);

    // Simulate Android Back gesture (history.back())
    await page.goBack();

    // Drawer should be closed
    await expect(page.locator('#drawer')).not.toHaveClass(/on/);
    // User remains on Today view
    await expect(page.locator('#view-today')).toHaveClass(/active/);
  });

  test('Navigation-event: Android back gesture closes Help dialog without navigating away', async ({ app }) => {
    const page = await app.open();
    await expect(page.locator('#view-today')).toHaveClass(/active/);

    // Open Help dialog
    await page.locator('#helpBtn').click();
    await expect(page.locator('#helpBox')).toHaveClass(/on/);

    // Simulate Android Back gesture
    await page.goBack();

    // Help dialog should be closed
    await expect(page.locator('#helpBox')).not.toHaveClass(/on/);
    // User remains on Today view
    await expect(page.locator('#view-today')).toHaveClass(/active/);
  });

  test('Navigation-event: Android back gesture closes the folded-header menu', async ({ app }) => {
    const page = await foldedHeader(app);

    // Open mobile menu
    await page.locator('#menuBtn').click();
    await expect(page.locator('#mobileMenu')).toBeVisible();

    // Simulate Android Back gesture
    await page.goBack();

    // Menu should be closed
    await expect(page.locator('#mobileMenu')).toBeHidden();
    await expect(page.locator('#view-today')).toHaveClass(/active/);
  });

  test('Adaptive piano stand landscape mode: compact top bar and piano keys on small height', async ({ app }) => {
    const page = app.page;
    // Typical Android phone in landscape mode resting on a piano stand (e.g. 844 x 390)
    await page.setViewportSize({ width: 844, height: 390 });
    await app.open();

    // Check header bar height in landscape compact mode
    const barHeight = await page.locator('header .bar').evaluate(el => el.getBoundingClientRect().height);
    expect(barHeight).toBeLessThanOrEqual(48);

    // Open a view with piano dock (e.g. #practice)
    await page.locator('header nav.tabs button[data-view="practice"]').click();
    await expect(page.locator('#view-practice')).toHaveClass(/active/);

    // Keys height should be compact (76px)
    const keysHeight = await page.locator('.keys').evaluate(el => el.getBoundingClientRect().height);
    expect(keysHeight).toBeLessThanOrEqual(80);
  });

  test('Adaptive tablet landscape mode on piano stand: UI fits comfortably without horizontal overflow', async ({ app }) => {
    const page = app.page;
    // Android tablet in landscape mode (e.g. 1280 x 800)
    await page.setViewportSize({ width: 1280, height: 800 });
    await app.open();

    // Check no horizontal scrollbar on body
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasHorizontalOverflow).toBe(false);

    // Check piano dock is visible and keys are properly positioned
    await page.locator('header nav.tabs button[data-view="practice"]').click();
    await page.locator('#modeNav button[data-view="explore"]').click();
    await expect(page.locator('.dock')).toBeVisible();
    const whiteKeysCount = await page.locator('.key.white').count();
    expect(whiteKeysCount).toBeGreaterThan(15);
  });

  test('Back after picking a view from the bottom bar goes to the previous view in one step', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 390, height: 844 });
    await app.open();
    await page.locator('#bottomNav button[data-view="progress"]').click();
    await expect(page.locator('#view-progress')).toHaveClass(/active/);
    await page.goBack();
    await expect(page.locator('#view-today')).toHaveClass(/active/);
  });

  test('Back repeatedly closes a reopened drawer, and Forward restores it', async ({ app }) => {
    const page = await app.open();
    await page.locator('#settingsBtn').click();
    await page.goBack();
    await expect(page.locator('#drawer')).not.toHaveClass(/on/);
    await page.goForward();
    await expect(page.locator('#drawer')).toHaveClass(/on/);
    await page.goBack();
    await page.locator('#settingsBtn').click();
    await page.goBack();
    await expect(page.locator('#drawer')).not.toHaveClass(/on/);
    await expect(page.locator('#view-today')).toHaveClass(/active/);
  });

  test('Back returns to the previous view after dismissing a drawer', async ({ app }) => {
    const page = await app.open();
    await page.locator('#settingsBtn').click();
    await page.goBack();
    await page.locator('#nav button[data-view="progress"]').click();
    await page.goBack();
    await expect(page.locator('#view-today')).toHaveClass(/active/);
  });

  test('a drawer remains open when immediately reopened while its Back is pending', async ({ app }) => {
    const page=await app.open();
    await page.locator('#settingsBtn').click();
    await page.evaluate(() => { window.__etude.openDrawer(false); window.__etude.openDrawer(true); });
    await page.waitForTimeout(250);
    await expect(page.locator('#drawer')).toHaveClass(/on/);
    await page.goBack();
    await expect(page.locator('#drawer')).not.toHaveClass(/on/);
  });

  test('a drawer survives reload and closes without reopening', async ({ app }) => {
    const page = await app.open();
    await page.locator('#settingsBtn').click();
    await page.reload();
    await expect(page.locator('#drawer')).toHaveClass(/on/);
    await page.locator('#drawerClose').click();
    await expect(page.locator('#drawer')).not.toHaveClass(/on/);
    await expect(page.locator('#view-today')).toHaveClass(/active/);
  });

  test('Back restores focus after closing the mobile menu', async ({ app }) => {
    const page = await foldedHeader(app);
    await page.locator('#menuBtn').click();
    await page.goBack();
    await expect(page.locator('#menuBtn')).toBeFocused();
  });

  test('opening Help from the mobile menu does not leave a menu history entry', async ({ app }) => {
    const page = await foldedHeader(app);
    await page.locator('#menuBtn').click();
    await page.locator('#helpBtn').click();
    await expect(page.locator('#helpBox')).toHaveClass(/on/);
    await page.goBack();
    await expect(page.locator('#helpBox')).not.toHaveClass(/on/);
    await expect(page.locator('#mobileMenu')).toBeHidden();
    await expect(page.locator('#view-today')).toHaveClass(/active/);
  });

  test('starting a landscape drill leaves End reachable below the header', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 844, height: 390 });
    await app.open();
    await page.locator('#nav button[data-view="practice"]').click();
    await page.evaluate(() => window.scrollTo(0, document.querySelector('#pr-start').getBoundingClientRect().top + window.scrollY - 55));
    await page.locator('#pr-start').click();
    await expect(page.locator('#session')).toBeVisible();
    await expect.poll(() => page.locator('#ses-end').evaluate(el => {
      const r=el.getBoundingClientRect(), hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return hit===el || el.contains(hit);
    })).toBe(true);
    await page.locator('#q-reveal').evaluate(el => el.scrollIntoView({block:'nearest'}));
    await expect.poll(() => page.locator('#q-reveal').evaluate(el => {
      const r=el.getBoundingClientRect(), hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return hit===el || el.contains(hit);
    })).toBe(true);
  });

  test('Help opens at the beginning on a short screen', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 844, height: 390 });
    await app.open();
    await page.locator('#helpBtn').click();
    await expect(page.locator('#helpBox')).toHaveJSProperty('scrollTop', 0);
    await expect(page.locator('#helpTitle')).toBeInViewport();
  });

  test('header fits around the mobile navigation breakpoint', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 681, height: 800 });
    await app.open({ lang: 'ro' });
    const right = await page.locator('#settingsBtn').evaluate(el => el.getBoundingClientRect().right);
    expect(right).toBeLessThanOrEqual(681);
  });

  test('widening the window closes the mobile menu', async ({ app }) => {
    const page = await foldedHeader(app);
    await page.locator('#menuBtn').click();
    await page.setViewportSize({ width: 1400, height: 800 });
    await expect(page.locator('#mobileMenu')).toBeHidden();
    await expect(page.locator('#menuBtn')).toHaveAttribute('aria-expanded', 'false');
  });

  test('a focused piano key survives a change in keyboard size', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 844, height: 390 });
    await app.open({ hash: 'explore', dock: true });
    await page.locator('#keys [data-midi="60"]').focus();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#keys [data-midi="60"]')).toBeFocused();
  });

  test('a focused key stays visible when the keyboard shrinks', async ({ app }) => {
    const page=app.page;
    await page.setViewportSize({width:844,height:390});
    await app.open({hash:'explore',dock:true});
    await page.locator('#keys [data-midi="84"]').focus();
    await page.setViewportSize({width:320,height:700});
    const key=page.locator('#keys [data-midi="72"]');
    await expect(key).toBeFocused();
    await expect.poll(() => key.evaluate(el=>{
      const r=el.getBoundingClientRect(), p=document.querySelector('#dock-keys').getBoundingClientRect();
      return r.left>=p.left && r.right<=p.right;
    })).toBe(true);
  });

  for (const lang of ['en', 'ro']) {
    test(`320px keyboard controls fit and provide horizontal access (${lang})`, async ({ app }) => {
      const page = app.page;
      await page.setViewportSize({ width: 320, height: 700 });
      await app.open({ hash: 'explore', lang, dock: true });
      for (const selector of ['#oct-down', '#oct-up', '#panicBtn', '#dock-kb-toggle']) {
        const box = await page.locator(selector).boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(320);
      }
      const pan=page.locator('#kb-pan');
      await expect(pan).toBeVisible();
      await pan.focus();
      await page.keyboard.press('End');
      await expect.poll(() => page.locator('#dock-keys').evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      const last=page.locator('#keys .white').last();
      const right=await last.evaluate(el => el.getBoundingClientRect().right);
      expect(right).toBeLessThanOrEqual(320);
    });
  }

  test('Dock stays hidden on views without a keyboard (no display override leaks from media queries)', async ({ app }) => {
    const page = await app.open();
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => window.__etude.show('progress'));
    const display = await page.locator('#dock').evaluate(el => getComputedStyle(el).display);
    expect(display).toBe('none');
  });

});

// The touch-target rules give icon buttons position:relative for their 44px ::after; the Settings close button
// must stay absolutely positioned in the drawer's top-right corner and still get the 44px target.
for (const c of [
  { name: 'phone with touch', viewport: { width: 390, height: 844 }, hasTouch: true },
  { name: 'desktop with touch', viewport: { width: 1280, height: 800 }, hasTouch: true },
  { name: 'short landscape phone with touch', viewport: { width: 844, height: 390 }, hasTouch: true },
  { name: 'desktop with a mouse', viewport: { width: 1280, height: 800 }, hasTouch: false },
]) {
  test.describe(`Settings close button (${c.name})`, () => {
    test.use({ viewport: c.viewport, hasTouch: c.hasTouch });

    test('stays in the drawer top-right corner with a thumb-sized target', async ({ app }) => {
      const page = await app.open();
      await page.locator('#settingsBtn').click();
      await expect(page.locator('#drawer')).toHaveClass(/on/);
      const measure = () => page.evaluate(() => {
        const btn = document.getElementById('drawerClose'), d = document.getElementById('drawer').getBoundingClientRect();
        const b = btn.getBoundingClientRect(), cs = getComputedStyle(btn), after = getComputedStyle(btn, '::after');
        const hasAfter = after.content !== 'none' && after.content !== 'normal';
        return {
          position: cs.position,
          fromRight: Math.round(d.right - b.right), fromTop: Math.round(b.top - d.top),
          tapW: Math.max(b.width, hasAfter ? parseFloat(after.width) || 0 : 0),
          tapH: Math.max(b.height, hasAfter ? parseFloat(after.height) || 0 : 0),
        };
      });
      await expect.poll(async () => (await measure()).fromRight).toBeLessThanOrEqual(30);   // waits out the slide-in
      const m = await measure();
      expect(m.position).toBe('absolute');
      expect(m.fromRight).toBeGreaterThanOrEqual(0);
      expect(m.fromTop).toBeGreaterThanOrEqual(0);
      expect(m.fromTop).toBeLessThanOrEqual(30);
      if (c.hasTouch) {
        expect(m.tapW).toBeGreaterThanOrEqual(44);
        expect(m.tapH).toBeGreaterThanOrEqual(44);
      }
    });
  });
}

test.describe('bottom navigation on phones', () => {
  const rect = (page, sel) => page.locator(sel).evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width, height: r.height }; });

  test('a phone gets a five-section bottom bar instead of the menu, with thumb-sized targets', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 390, height: 844 });
    await app.open();
    const bar = page.locator('#bottomNav'), items = bar.locator('button');
    await expect(bar).toBeVisible();
    await expect(page.locator('#menuBtn')).toBeHidden();
    await expect(items).toHaveText(['Today', 'Learn', 'Practice', 'Pieces', 'Progress']);
    for (let i = 0; i < 5; i++) {
      const r = await items.nth(i).evaluate(el => el.getBoundingClientRect());
      expect(r.height).toBeGreaterThanOrEqual(48);
      expect(r.width).toBeGreaterThanOrEqual(48);
    }
    const b = await rect(page, '#bottomNav');
    expect(Math.round(b.bottom)).toBe(844);
    await expect(items.nth(0)).toHaveAttribute('aria-current', 'page');

    await items.nth(3).click();
    await expect(page.locator('#view-analysis')).toHaveClass(/active/);
    await expect(bar.locator('button[aria-current="page"]')).toHaveText('Pieces');
    await page.goBack();
    await expect(page.locator('#view-today')).toHaveClass(/active/);
    await expect(bar.locator('button[aria-current="page"]')).toHaveText('Today');
  });

  test('wide screens keep the header tabs and no bottom bar', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 1280, height: 800 });
    await app.open();
    await expect(page.locator('#bottomNav')).toBeHidden();
    await expect(page.locator('#nav')).toBeVisible();
  });

  test('Explore lives under Practice, and the keyboard dock sits above the bar', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 390, height: 844 });
    await app.open({ hash: 'explore' });
    await expect(page.locator('#bottomNav button[aria-current="page"]')).toHaveText('Practice');
    await expect(page.locator('#modeNav button')).toHaveText(['Exercises', 'Read', 'Voice', 'Explore']);
    await expect(page.locator('#modeNav button[aria-current="page"]')).toHaveText('Explore');
    await expect(page.locator('#dock')).toBeVisible();
    await expect.poll(async () => (await rect(page, '#dock')).bottom - (await rect(page, '#bottomNav')).top).toBeLessThanOrEqual(0.5);
    // The page reserves room for both, so its last line can scroll clear of them.
    const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom));
    const dock = await rect(page, '#dock'), nav = await rect(page, '#bottomNav');
    expect(pad).toBeGreaterThanOrEqual(Math.round(dock.height + nav.height) - 1);
  });

  test('the header tabs drop Explore: it opens from Practice', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 1280, height: 800 });
    await app.open({ hash: 'practice' });
    await expect(page.locator('#nav button')).toHaveText(['Today', 'Learn', 'Practice', 'Pieces', 'Progress']);
    await page.locator('#modeNav button[data-view="explore"]').click();
    await expect(page.locator('#view-explore')).toHaveClass(/active/);
    await expect(page.locator('#nav button[aria-current="page"]')).toHaveText('Practice');
  });

  test('a short landscape phone keeps the menu, because the bar would cost too much height', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 740, height: 360 });
    await app.open();
    await expect(page.locator('#bottomNav')).toBeHidden();
    await expect(page.locator('#menuBtn')).toBeVisible();
  });

  test('revealing Learn content stops above the dock, which rides on the bar', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 390, height: 844 });
    await app.open({ hash: 'learn' });
    await page.locator('#dock-kb-toggle').click(); // keys open: dock on top of the bar
    const gap = await page.evaluate(async () => {
      const e = window.__etude, p = document.createElement('div');
      p.style.height = '40px'; e.$('view-learn').appendChild(p);
      window.scrollTo(0, 0); e.learnReveal(p);
      await new Promise(r => requestAnimationFrame(r));
      const g = e.$('dock').getBoundingClientRect().top - p.getBoundingClientRect().bottom; p.remove(); return g;
    });
    expect(gap).toBeGreaterThanOrEqual(15);
  });

  test('the full-screen practice stage hides the bar', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 390, height: 844 });
    await app.open();
    await page.evaluate(() => { document.body.dataset.stage = 'immersive'; });
    await expect(page.locator('#bottomNav')).toBeHidden();
  });
});

test.describe('score toolbar on phones', () => {
  const CORE = ['#sc-start', '#score-play', '#score-stop', '#an-loop', '#score-speed', '#an-kb', '#tb-more'];
  const MORE = ['#an-metro', '#pr-hands', '#pr-wait', '#sc-zoom-in', '#sc-look', '#sc-hl', '#an-mode'];
  const openScore = async (app, width, height) => {
    const page = app.page;
    await page.setViewportSize({ width, height });
    await app.open({ hash: 'analysis' });
    await page.evaluate(async () => { await window.__etude.anLoadExample(window.__etude.PIECES[0].id); });
    await expect(page.locator('#an-tbwrap')).toBeVisible();
    return page;
  };
  const fitsAcross = page => page.locator('#an-toolbar').evaluate(tb => tb.scrollWidth <= tb.clientWidth + 1);

  test('one row of essentials at thumb size, and nothing scrolled off the edge', async ({ app }) => {
    const page = await openScore(app, 390, 844);
    expect(await fitsAcross(page)).toBe(true);
    for (const sel of CORE) {
      await expect(page.locator(sel), sel).toBeVisible();
      const r = await page.locator(sel).evaluate(el => el.getBoundingClientRect());
      expect(r.height, sel).toBeGreaterThanOrEqual(40);
      expect(r.right, sel).toBeLessThanOrEqual(390);
    }
    for (const sel of MORE) await expect(page.locator(sel), sel).toBeHidden();
    await expect(page.locator('#tb-more')).toHaveAttribute('aria-expanded', 'false');
  });

  for (const width of [360, 390]) {
    test(`the essentials and More share one row at ${width}px`, async ({ app }) => {
      const page = await openScore(app, width, 800);
      const tops = await page.evaluate(sels => sels.map(s => Math.round(document.querySelector(s).getBoundingClientRect().top)), CORE);
      expect(new Set(tops).size, `row tops ${tops}`).toBe(1);
    });
  }

  test('the floating Analysis button steps aside while More is open', async ({ app }) => {
    const page = await openScore(app, 390, 844);
    await expect(page.locator('.an-fab')).toBeVisible();
    await page.locator('#tb-more').click();
    await expect(page.locator('.an-fab')).toBeHidden();
    await page.locator('#tb-more').click();
    await expect(page.locator('.an-fab')).toBeVisible();
  });

  test('More opens the other controls below the row, and they work from there', async ({ app }) => {
    const page = await openScore(app, 390, 844);
    const before = await page.locator('#an-tbwrap').evaluate(el => el.getBoundingClientRect().height);
    await page.locator('#tb-more').click();
    await expect(page.locator('#tb-more')).toHaveAttribute('aria-expanded', 'true');
    for (const sel of MORE) {
      await expect(page.locator(sel), sel).toBeVisible();
      expect(await page.locator(sel).evaluate(el => el.getBoundingClientRect().right), sel).toBeLessThanOrEqual(390);
    }
    expect(await fitsAcross(page)).toBe(true);
    await expect.poll(() => page.locator('#an-tbwrap').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(before + 40);
    await page.locator('#sc-look button[data-v="night"]').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SCORE.look)).toBe('night');
    await page.locator('#tb-more').click();
    await expect(page.locator('#tb-more')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#sc-look')).toBeHidden();
  });

  test('Escape closes More and returns focus to it', async ({ app }) => {
    const page = await openScore(app, 390, 844);
    await page.locator('#tb-more').click();
    await page.locator('#sc-hl').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#tb-more')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#tb-more')).toBeFocused();
  });

  test('a popover opened from More closes with it, and Escape closes the popover first', async ({ app }) => {
    const page = await openScore(app, 390, 844);
    await page.locator('#tb-more').click();
    await page.locator('#an-mode button[data-score-mode="fall"]').click();
    await expect(page.locator('#fall-opt')).toBeVisible();
    await page.locator('#fall-opt').click();
    await expect(page.locator('#fall-pop')).toBeVisible();
    await page.locator('#fall-opt').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#fall-pop')).toBeHidden();
    await expect(page.locator('#tb-more')).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#fall-opt').click();
    await expect(page.locator('#fall-pop')).toBeVisible();
    await page.locator('#tb-more').click();
    await expect(page.locator('#tb-more')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#fall-pop')).toBeHidden();
  });

  test('wide screens keep the full toolbar and no More button', async ({ app }) => {
    const page = await openScore(app, 1280, 800);
    await expect(page.locator('#tb-more')).toBeHidden();
    for (const sel of ['#pr-hands', '#sc-look', '#an-mode']) await expect(page.locator(sel), sel).toBeVisible();
  });
});

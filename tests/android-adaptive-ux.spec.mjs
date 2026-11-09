import { test, expect } from './fixtures.mjs';

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

  test('Navigation-event: Android back gesture closes Mobile Menu on mobile viewports', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 390, height: 844 });
    await app.open();

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
    await page.locator('header nav.tabs button[data-view="explore"]').click();
    await expect(page.locator('.dock')).toBeVisible();
    const whiteKeysCount = await page.locator('.key.white').count();
    expect(whiteKeysCount).toBeGreaterThan(15);
  });

  test('Back after picking a view from the mobile menu goes to the previous view in one step', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 390, height: 844 });
    await app.open();
    await page.locator('#menuBtn').click();
    await page.locator('#mobileMenu button[data-view="progress"]').click();
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
    const page=app.page;
    await page.setViewportSize({width:390,height:844});
    await app.open();
    await page.locator('#menuBtn').click();
    await page.goBack();
    await expect(page.locator('#menuBtn')).toBeFocused();
  });

  test('opening Help from the mobile menu does not leave a menu history entry', async ({ app }) => {
    const page=app.page;
    await page.setViewportSize({width:390,height:844});
    await app.open();
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

  test('rotating to a wider layout closes the mobile menu', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 390, height: 844 });
    await app.open();
    await page.locator('#menuBtn').click();
    await page.setViewportSize({ width: 844, height: 390 });
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

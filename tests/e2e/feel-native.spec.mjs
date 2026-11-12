import { test, expect } from '../helpers/fixtures.mjs';

// Phone and installed-app polish: browser-only wording, single Scores controls, audio and updates after a return.

// Pretends the page went to the background and came back: the browser's own visibilitychange is not scriptable.
const comeBack = page => page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  document.dispatchEvent(new Event('visibilitychange'));
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 } });

  test('browser-only and keyboard-only wording gives way to device wording', async ({ app, page }) => {
    await app.open();
    expect(await page.evaluate(() => matchMedia('(pointer:coarse)').matches)).toBe(true);
    await expect(page.locator('footer')).toContainText('your progress never leaves this device', { useInnerText: true });
    await expect(page.locator('footer')).not.toContainText('single-file', { useInnerText: true });
    await expect(page.locator('footer')).not.toContainText('Chrome / Edge', { useInnerText: true });
    await expect(page.locator('[data-i18n="set_lede"]')).toBeHidden();
    expect(await page.locator('[data-i18n="ses_keys_hint"]').evaluate(e => getComputedStyle(e).display)).toBe('none');
    await page.evaluate(() => window.__etude.show('analysis'));
    await expect(page.locator('#an-drop-t')).toHaveText('Open a MIDI or MusicXML file', { useInnerText: true });
    await expect(page.locator('#an-drop-t .ctx-kbd')).toBeHidden();
  });

  test('a reading drill keeps the ways to answer that work on a touch screen', async ({ app, page }) => {
    await app.open({ hash: 'read' });
    const ask = ty => page.evaluate(ty => {
      const e = window.__etude;
      e.rdData().prefs.stage = false;
      e.rdOpen(Object.values(e.RD_LV).find(l => l.ty === ty));
      e.rdStart('practice');
    }, ty);
    await ask('ch');
    await expect(page.locator('.rdx-kbd')).toBeHidden(); // the digit shortcuts need a computer keyboard
    await expect(page.locator('.rdx-tools .ctx-touch')).toHaveText('Or play the chord');
    await page.locator('#rdx-end').click();
    await ask('play');
    await expect(page.locator('.rdx-tools .ctx-touch')).toHaveText('Play on MIDI or tap a key');
  });
});

test('a desktop browser keeps the browser wording and the shortcut hint', async ({ app, page }) => {
  await app.open();
  await expect(page.locator('footer')).toContainText('single-file practice tool', { useInnerText: true });
  await expect(page.locator('footer')).toContainText('best in Chrome / Edge', { useInnerText: true });
  await expect(page.locator('[data-i18n="footer_app"]')).toBeHidden();
  await expect(page.locator('[data-i18n="set_lede_app"]')).toBeHidden();
  expect(await page.locator('[data-i18n="ses_keys_hint"]').evaluate(e => getComputedStyle(e).display)).not.toBe('none');
  await page.evaluate(() => window.__etude.show('analysis'));
  await expect(page.locator('#an-drop-t .ctx-kbd')).toBeVisible();
  await expect(page.locator('#an-drop-t .ctx-touch')).toBeHidden();
  await page.evaluate(() => {
    const e = window.__etude;
    e.show('read');
    e.rdData().prefs.stage = false;
    e.rdOpen(Object.values(e.RD_LV).find(l => l.ty === 'ch'));
    e.rdStart('practice');
  });
  await expect(page.locator('.rdx-kbd')).toHaveText('Keys: 1–6, or play the chord');
  await expect(page.locator('.rdx-tools .ctx-touch')).toBeHidden();
});

test('the piano status line above every view stays hidden unless the recordings fail', async ({ app, page }) => {
  await app.open();
  await expect(page.locator('#piano-global-status')).toBeHidden();
});

test('the MIDI keyboard tip sits in a collapsed help note', async ({ app, page }) => {
  await app.open();
  const help = page.locator('details.set-help');
  await expect(help).toHaveCount(1);
  expect(await help.evaluate(d => d.open)).toBe(false);
  await expect(help.locator('[data-i18n="set_midi_hint"]')).toContainText('Arturia MicroLab Mk3');
});

test('Pieces shows one Open file button at a time, and the built-in list stays above the player', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  const toolbarOpen = page.locator('label[for="an-file"]'), twinkle = page.locator('#pc-list .pc-item[data-piece="twinkle"]');
  await expect(page.locator('#an-roll [data-an-open]')).toBeVisible();
  await expect(page.locator('#pc-list .pc-item')).toHaveCount(14);
  await expect(toolbarOpen).toBeHidden();
  await expect(page.locator('#an-example')).toHaveCount(0);
  await twinkle.click();
  await expect.poll(() => page.evaluate(() => window.__etude.AN.notes.length)).toBeGreaterThan(0);
  await expect(page.locator('#an-roll [data-an-open]')).toHaveCount(0);
  await expect(toolbarOpen).toBeVisible();
  await expect(twinkle).toHaveAttribute('aria-current', 'true');
});

test('returning to the page resumes suspended audio, and shows the notice only while it stays locked', async ({ app, page }) => {
  await app.open();
  await page.evaluate(async () => {
    window.__etude.ensureAudio();
    await window.__etude.actx.suspend();
    window.__etude.actx.resume = () => new Promise(() => {});   // the phone still holds the audio session
  });
  await comeBack(page);
  await expect(page.locator('#audioLock')).toBeVisible();
  await page.evaluate(() => { delete window.__etude.actx.resume; });
  await comeBack(page);
  await expect(page.locator('#audioLock')).toBeHidden();
  expect(await page.evaluate(() => window.__etude.actx.state)).toBe('running');
  // the OS releases the audio session only after the wait: the late resume still clears the notice
  await page.evaluate(async () => { await window.__etude.actx.suspend(); window.__etude.actx.resume = () => new Promise(() => {}); });
  await comeBack(page);
  await expect(page.locator('#audioLock')).toBeVisible();
  await page.evaluate(async () => { delete window.__etude.actx.resume; await window.__etude.actx.resume(); });
  await expect(page.locator('#audioLock')).toBeHidden();
});

test('coming back checks for a new version at most once every 30 minutes @sw', async ({ app, page }) => {
  await page.addInitScript(() => {
    const realNow = Date.now;
    window.__skew = 0;
    Date.now = () => realNow() + window.__skew;
    window.__updates = 0;
    ServiceWorkerRegistration.prototype.update = function update() { window.__updates++; return Promise.resolve(this); };
  });
  await app.open();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await comeBack(page);
  expect(await page.evaluate(() => window.__updates)).toBe(0);    // register() just checked
  await page.evaluate(() => { window.__skew = 31 * 60 * 1000; });
  await comeBack(page);
  await expect.poll(() => page.evaluate(() => window.__updates)).toBe(1);
  await comeBack(page);
  expect(await page.evaluate(() => window.__updates)).toBe(1);
  await page.evaluate(() => { window.__skew = 62 * 60 * 1000; });
  await comeBack(page);
  await expect.poll(() => page.evaluate(() => window.__updates)).toBe(2);
});

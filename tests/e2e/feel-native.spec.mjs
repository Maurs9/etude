import { test, expect } from '../helpers/fixtures.mjs';

// Phone and installed-app polish: browser-only wording, single Scores controls, audio after a return.

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

test('Scores shows one Open file button and one example picker at a time', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  const toolbarOpen = page.locator('label[for="an-file"]'), dropdown = page.locator('#an-example');
  await expect(page.locator('#an-roll [data-an-open]')).toBeVisible();
  await expect(page.locator('#an-roll .an-ex').first()).toBeVisible();
  await expect(toolbarOpen).toBeHidden();
  await expect(dropdown).toBeHidden();
  await page.locator('#an-roll .an-ex[data-piece="twinkle"]').click();
  await expect.poll(() => page.evaluate(() => window.__etude.AN.notes.length)).toBeGreaterThan(0);
  await expect(page.locator('#an-roll [data-an-open]')).toHaveCount(0);
  await expect(toolbarOpen).toBeVisible();
  await expect(dropdown).toBeVisible();
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
});

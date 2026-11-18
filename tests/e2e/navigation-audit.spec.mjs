import { test, expect } from '../helpers/fixtures.mjs';

test('mobile sections open at the top, Back restores scroll, and an unknown hash opens Today', async ({ app, page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await app.open();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const before = await page.evaluate(() => scrollY);
  expect(before).toBeGreaterThan(0);
  await page.locator('#bottomNav [data-view=practice]').click();
  await expect(page.locator('#view-practice')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.goBack();
  await expect(page.locator('#view-today')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(before);
  await page.locator('#bottomNav [data-view=practice]').click();
  await page.evaluate(() => { location.hash = '#somewhere'; });
  await expect(page).toHaveURL(/#today$/);
  await expect(page.locator('#view-today')).toHaveClass(/active/);
});

test('Settings isolates mobile navigation and makes language recovery keyboard accessible', async ({ app, page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await app.open();
  const german = /ui-de(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/;
  await page.route(german, route => route.abort());
  await page.locator('#settingsBtn').click();
  expect(await page.locator('#bottomNav').evaluate(el => el.inert)).toBe(true);
  const choose = page.locator('#set-lang [data-v=de]');
  await choose.click();
  const retry = page.locator('#drawer [data-lazy-retry]');
  await expect(retry).toBeVisible();
  await choose.focus();
  for (let i = 0; i < 4 && !(await retry.evaluate(el => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(retry).toBeFocused();
  await page.unroute(german);
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.keyboard.press('Escape');
  expect(await page.locator('#bottomNav').evaluate(el => el.inert)).toBe(false);
});

test('failed locale load warns about unsaved progress and offers an export', async ({ app, page }) => {
  await app.open();
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'ptt-v3') throw new DOMException('test quota', 'QuotaExceededError');
      return write.call(this, key, value);
    };
    window.__etude.reviewItem('iv:1', true);
  });
  await page.route(/learn-en(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/, route => route.abort());
  await page.locator('#nav [data-view=learn]').click();
  const notice = page.locator('#locale-load-error');
  await expect(notice).toContainText(/couldn't be saved/);
  await expect(notice.locator('[data-lazy-export]')).toBeVisible();
});

test('a pending slider value is saved on pagehide', async ({ app, page }) => {
  await app.open();
  await page.locator('#settingsBtn').click();
  await page.evaluate(() => {
    const slider = document.getElementById('volume');
    slider.value = '0';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.reload();
  await expect(page.locator('#drawer')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#volume')).toHaveValue('0');
});

test('selecting either the current or a new notation leaves a first-sight count-in intact', async ({ app, page }) => {
  await app.open({ hash: 'read' });
  await page.locator('#rdn-all-drills').click();
  await page.locator('label:has(#rdx-stage-pref)').click();
  await page.locator('#rdn-home-back').click();
  await page.locator('#rdn-book-go').click();
  await page.clock.install();
  await page.locator('#rd-go').click();
  const attempt = () => page.evaluate(() => ({ ...window.__etude.SR.srtState }));
  await expect.poll(async () => (await attempt()).name).toBe('countIn');
  const before = await attempt();
  await page.locator('#settingsBtn').click();
  await page.locator('#set-notation [data-v=letter]').click();
  expect(await attempt()).toEqual(before);
  await page.locator('#set-notation [data-v=solfege]').click();
  expect(await attempt()).toEqual(before);
  await page.keyboard.press('Escape');
  expect(await attempt()).toEqual(before);
});

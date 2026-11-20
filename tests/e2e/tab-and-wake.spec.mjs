import { test, expect, APP } from '../helpers/fixtures.mjs';

test('another tab refreshes Learn, Read, Pieces, calibration, and backup metadata', async ({ app, page }) => {
  await app.open({ hash: 'learn' });
  const lesson = page.locator('#learnToc button[data-li="0"]');
  await expect(lesson).toBeVisible();
  await lesson.focus();
  const id = await page.evaluate(() => window.__etude.LESSONS[0].id);
  const other = await page.context().newPage();
  await other.goto(APP);
  await other.waitForFunction(() => window.__etude?.show);
  const update = ({ patch, extra }) => other.evaluate(({ patch, extra }) => {
    const record = JSON.parse(localStorage.getItem('ptt-v3'));
    record.syncParent = record.syncId;
    record.syncId = Math.random().toString(36).slice(2).padEnd(15, '0');
    Object.assign(record.data, patch);
    localStorage.setItem('ptt-v3', JSON.stringify(record));
    if (extra) localStorage.setItem('etude-last-export', String(Date.now()));
  }, { patch, extra });

  await update({ patch: { learnDone: { [id]: 1 } } });
  await expect(lesson.locator('.done, .due')).toHaveCount(1);
  await expect(lesson).toBeFocused();

  await page.evaluate(() => window.__etude.show('read'));
  await expect(page.locator('#rdn-home')).toBeVisible();
  await update({ patch: { reading: { book: { v: 2, level: 1, pieces: { 'b1.1': { best: 88, stars: 2, tries: 1, first: 88 } } } } } });
  await expect(page.locator('.rdn-stats .count.mastered .num')).toHaveText('1');

  await page.evaluate(() => window.__etude.show('analysis'));
  const piece = page.locator('#pc-list [data-piece="w5rh"]');
  await expect(piece).toBeVisible();
  await update({ patch: { sheet: { w5rh: { best: 90 } }, latency: { usb: 37 } }, extra: true });
  await expect(piece.locator('.pc-best')).toHaveText('Best: 90%');
  await expect(page.locator('#lat-v-usb')).toHaveText('37');
  await expect(page.locator('#set-backup-age')).toHaveText(/Last export/i);
  await other.close();
});

test('wake lock recovers once after release and requests again from bfcache', async ({ app, page }) => {
  await page.addInitScript(() => {
    const locks = [];
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        async request() {
          const lock = new EventTarget();
          lock.release = async () => lock.dispatchEvent(new Event('release'));
          locks.push(lock);
          return lock;
        },
      },
    });
    window.__wakeLocks = locks;
  });
  await app.open({ saved: { v: 3, lang: 'en', wake: true, data: {} } });
  const status = page.locator('#set-wake-status');
  await expect(status).toHaveAttribute('data-s', 'on');
  await page.evaluate(() => window.__wakeLocks[0].release());
  await expect.poll(() => page.evaluate(() => window.__wakeLocks.length)).toBe(2);
  await expect(status).toHaveAttribute('data-s', 'on');
  await page.mouse.click(10, 10);
  expect(await page.evaluate(() => window.__wakeLocks.length)).toBe(2);
  await page.evaluate(async () => {
    await window.__wakeLocks[1].release();
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect.poll(() => page.evaluate(() => window.__wakeLocks.length)).toBe(3);
  await expect(status).toHaveAttribute('data-s', 'on');
});

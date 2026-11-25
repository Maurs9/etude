import { test, expect } from '../helpers/fixtures.mjs';

async function openBuiltinScore(page, id = 'brahms') {
  await page.locator(`#pc-list .pc-item[data-piece="${id}"]`).click();
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
}

test.describe('mobile score color-scheme & landscape framing', () => {
  test('declares light dark color-scheme and shields paper scores from Auto Dark inversion', async ({ app, page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await app.open({ hash: 'analysis' });
    await openBuiltinScore(page, 'brahms');

    const meta = await page.locator('meta[name="color-scheme"]').getAttribute('content');
    expect(meta).toBe('light dark');

    const schemes = await page.evaluate(() => {
      const root = document.documentElement;
      const roll = document.getElementById('an-roll');
      const sheet = roll?.querySelector('.an-sheet > div');
      const svg = roll?.querySelector('.an-sheet svg');
      return {
        theme: root.dataset.theme,
        root: getComputedStyle(root).colorScheme,
        roll: roll ? getComputedStyle(roll).colorScheme : null,
        sheet: sheet ? getComputedStyle(sheet).colorScheme : null,
        sheetBg: sheet ? getComputedStyle(sheet).backgroundColor : null,
        svg: svg ? getComputedStyle(svg).colorScheme : null,
      };
    });

    expect(schemes.theme).toBe('dark');
    expect(schemes.root).toBe('dark');
    expect(schemes.roll).toBe('light only');
    expect(schemes.sheet).toBe('light only');
    expect(schemes.svg).toBe('light only');
    expect(schemes.sheetBg).toBe('rgb(255, 254, 250)');
  });

  test('phone landscape opens directly with single-row toolbar and visible first staff', async ({ app, page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await app.open({ hash: 'analysis' });
    await openBuiltinScore(page, 'brahms');

    const metrics = await page.evaluate(() => {
      const rect = id => document.getElementById(id).getBoundingClientRect();
      const firstStaff = document.querySelector('#an-roll .vf-stave')?.getBoundingClientRect();
      return {
        popupsVisible: getComputedStyle(document.getElementById('an-disp-btn')).display !== 'none'
          && getComputedStyle(document.getElementById('an-prac-btn')).display !== 'none'
          && getComputedStyle(document.getElementById('an-tools-btn')).display !== 'none',
        tb: rect('an-tbwrap').toJSON(),
        work: rect('an-work').toJSON(),
        roll: rect('an-roll').toJSON(),
        tl: rect('an-tl').toJSON(),
        status: rect('an-status').toJSON(),
        dock: rect('dock').toJSON(),
        firstStaff: firstStaff ? firstStaff.toJSON() : null,
      };
    });

    expect(metrics.popupsVisible).toBe(true);
    expect(metrics.tb.height).toBeLessThanOrEqual(48);
    expect(metrics.work.top).toBeGreaterThanOrEqual(metrics.tb.bottom - 1);
    expect(metrics.roll.height).toBeGreaterThanOrEqual(160);
    expect(metrics.status.bottom).toBeLessThanOrEqual(metrics.dock.top + 1);
    expect(metrics.firstStaff).not.toBeNull();
    expect(metrics.firstStaff.top).toBeGreaterThanOrEqual(metrics.roll.top);
    expect(metrics.firstStaff.bottom).toBeLessThanOrEqual(metrics.roll.bottom + 2);
  });

  test('915x412 keeps toolbar single-row and stays aligned when toggling the keyboard', async ({ app, page }) => {
    await page.setViewportSize({ width: 915, height: 412 });
    await app.open({ hash: 'analysis' });
    await openBuiltinScore(page, 'brahms');

    const beforeKb = await page.evaluate(() => ({
      pracBtnVisible: getComputedStyle(document.getElementById('an-prac-btn')).display !== 'none',
      tbH: document.getElementById('an-tbwrap').getBoundingClientRect().height,
      rollH: document.getElementById('an-roll').getBoundingClientRect().height,
    }));
    expect(beforeKb.pracBtnVisible).toBe(true);
    expect(beforeKb.tbH).toBeLessThanOrEqual(48);
    expect(beforeKb.rollH).toBeGreaterThanOrEqual(180);

    await page.locator('#an-disp-btn').click();
    await page.locator('#an-kb').click();
    await page.locator('#an-disp-btn').click();
    await page.waitForFunction(() => document.body.classList.contains('kb-land'));
    await page.waitForTimeout(150);

    const withKb = await page.evaluate(() => {
      const rect = id => document.getElementById(id).getBoundingClientRect();
      const firstStaff = document.querySelector('#an-roll .vf-stave')?.getBoundingClientRect();
      return {
        tb: rect('an-tbwrap').toJSON(),
        work: rect('an-work').toJSON(),
        roll: rect('an-roll').toJSON(),
        status: rect('an-status').toJSON(),
        dock: rect('dock').toJSON(),
        firstStaff: firstStaff ? firstStaff.toJSON() : null,
      };
    });

    expect(withKb.tb.top).toBeLessThanOrEqual(2);
    expect(withKb.work.top).toBeGreaterThanOrEqual(withKb.tb.bottom - 1);
    expect(withKb.roll.height).toBeGreaterThanOrEqual(150);
    expect(withKb.status.bottom).toBeLessThanOrEqual(withKb.dock.top + 1);
    expect(withKb.firstStaff).not.toBeNull();
    expect(withKb.firstStaff.bottom).toBeLessThanOrEqual(withKb.roll.bottom + 2);
  });

  test('rotating portrait to landscape keeps the score framed under the toolbar (keyboard closed & open)', async ({ app, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.open({ hash: 'analysis' });
    await openBuiltinScore(page, 'brahms');

    // Rotate portrait -> landscape with keyboard collapsed
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => document.getElementById('an-roll').getBoundingClientRect().height > 150);
    await page.waitForTimeout(200);

    const railMetrics = await page.evaluate(() => {
      const rect = id => document.getElementById(id).getBoundingClientRect();
      const firstStaff = document.querySelector('#an-roll .vf-stave')?.getBoundingClientRect();
      return {
        tb: rect('an-tbwrap').toJSON(),
        work: rect('an-work').toJSON(),
        roll: rect('an-roll').toJSON(),
        status: rect('an-status').toJSON(),
        dock: rect('dock').toJSON(),
        firstStaff: firstStaff ? firstStaff.toJSON() : null,
      };
    });
    expect(railMetrics.work.top).toBeGreaterThanOrEqual(railMetrics.tb.bottom - 1);
    expect(railMetrics.status.bottom).toBeLessThanOrEqual(railMetrics.dock.top + 1);
    expect(railMetrics.firstStaff).not.toBeNull();
    expect(railMetrics.firstStaff.top).toBeGreaterThanOrEqual(railMetrics.roll.top);
    expect(railMetrics.firstStaff.bottom).toBeLessThanOrEqual(railMetrics.roll.bottom + 2);

    // Rotate back to portrait, open keyboard, then rotate to short 800x360 landscape
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    await page.locator('#an-disp-btn').click();
    await page.locator('#an-kb').click();
    await page.locator('#an-disp-btn').click();
    await page.waitForTimeout(150);
    await page.setViewportSize({ width: 800, height: 360 });
    await page.waitForTimeout(250);

    const kbShortMetrics = await page.evaluate(() => {
      const rect = id => document.getElementById(id).getBoundingClientRect();
      const firstStaff = document.querySelector('#an-roll .vf-stave')?.getBoundingClientRect();
      return {
        tb: rect('an-tbwrap').toJSON(),
        work: rect('an-work').toJSON(),
        roll: rect('an-roll').toJSON(),
        dock: rect('dock').toJSON(),
        firstStaff: firstStaff ? firstStaff.toJSON() : null,
      };
    });
    expect(kbShortMetrics.work.top).toBeGreaterThanOrEqual(kbShortMetrics.tb.bottom - 1);
    expect(kbShortMetrics.roll.height).toBeGreaterThanOrEqual(140);
    expect(kbShortMetrics.firstStaff).not.toBeNull();
    expect(kbShortMetrics.firstStaff.top).toBeGreaterThanOrEqual(kbShortMetrics.roll.top);
    expect(kbShortMetrics.firstStaff.bottom).toBeLessThanOrEqual(kbShortMetrics.roll.bottom + 2);
  });
});

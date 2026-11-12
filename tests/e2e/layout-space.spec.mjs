import { test, expect, todayN } from '../helpers/fixtures.mjs';

// Wide windows use their width (layout.css, pieces.css): one key measurement per screen, and no sideways page
// scroll on a phone.

// A saved state with reviews, a practice history and reading statistics, so Progress draws every section.
function seeded() {
  const tn = todayN(), srs = {}, history = {};
  ['iv:7', 'iv:4', 'iv:3', 'ch:maj', 'ch:m', 'iv:5'].forEach((id, i) => { srs[id] = { box: 1 + i % 5, ease: 2.3, reps: 4 + i, lapses: i % 3, due: tn + i, last: tn - 1 }; });
  for (let k = 0; k < 84; k += 2) history[tn - k] = 3 + k % 17;
  const reading = {
    lv: { tr1: { s: 2, acc: 88, t: 2400, n: 3 } },
    nt: { 't:C4': { n: 6, ok: 5, ms: 12000, e: 0.3, t: 2100 }, 'b:F3': { n: 5, ok: 3, ms: 14000, e: 0.6, t: 2800 } },
    tot: { n: 11, ok: 8, ms: 26000, sess: 2 },
  };
  return { v: 3, lang: 'en', data: { srs, history, reading, totalReviews: 40, totalCorrect: 31, streak: 3, bestStreak: 5, lastActive: tn, todayDay: tn, todayCount: 4 } };
}
const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const box = (page, sel) => page.locator(sel).first().boundingBox();

test.describe('wide window', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Today: the other ways to practice sit in one row of cards', async ({ app, page }) => {
    await app.open({ saved: seeded() });
    const tools = await page.locator('#tools .tool').evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON()));
    expect(tools).toHaveLength(3);
    for (const r of tools) expect(Math.abs(r.top - tools[0].top)).toBeLessThanOrEqual(1);
    expect(tools[1].left).toBeGreaterThan(tools[0].right);
    // the plan has the larger share of the overview row
    expect((await box(page, '#today-plan')).width).toBeGreaterThan((await box(page, '#today-home .hero')).width * 1.5);
  });

  test('Progress: mastery beside the forecast and history, the note map staves side by side', async ({ app, page }) => {
    await app.open({ hash: 'progress', saved: seeded() });
    expect((await box(page, '#view-progress > .wrap')).width).toBeGreaterThan(1240);
    const mastery = await box(page, '#masteryRows'), fc = await box(page, '#forecast'), heat = await box(page, '#heatmap');
    expect(fc.x).toBeGreaterThan(mastery.x + mastery.width);
    expect(heat.y).toBeGreaterThan(fc.y + fc.height);
    expect(heat.y).toBeLessThan(mastery.y + mastery.height + 200);
    expect((await box(page, '#heatmap i[data-l]')).width).toBeGreaterThanOrEqual(20);   // 14px before
    const staves = await page.locator('#rdx-stats .rdx-heat').evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON()));
    expect(Math.abs(staves[1].top - staves[0].top)).toBeLessThanOrEqual(1);
    expect(staves[1].left).toBeGreaterThan(staves[0].right);
    expect((await box(page, '#rdx-stats .rdx-heat .rdx-svg')).width).toBeGreaterThan(500);
    expect(await noSideScroll(page)).toBe(true);
  });

  test('Learn: lesson staves grow to the panel, and the glossary has two columns', async ({ app, page }) => {
    await app.open({ hash: 'learn' });
    await page.evaluate(() => window.__etude.learnReady);
    await page.evaluate(() => window.__etude.learnGoId('iv2'));   // Interval qualities: one short staff example
    const svg = page.locator('#learnBody .lstaff-svg .ss-svg').first();
    await expect(svg).toBeVisible();
    const { drawn, shown } = await svg.evaluate(s => ({ drawn: parseFloat(s.style.getPropertyValue('--sw')), shown: s.getBoundingClientRect().width }));
    expect(drawn).toBeGreaterThan(0);
    expect(shown).toBeGreaterThan(drawn * 1.2);
    expect(shown).toBeLessThanOrEqual(drawn * 1.35 + 1);
    expect((await box(page, '#view-learn > .wrap')).width).toBeLessThanOrEqual(1240);
    await page.locator('#learnGlossBtn').click();
    const lefts = await page.locator('#learnBody .lg-it').evaluateAll(els => new Set(els.map(e => Math.round(e.getBoundingClientRect().left))).size);
    expect(lefts).toBe(2);
  });

  test('Pieces: the empty drop zone is one row, not a tall panel', async ({ app, page }) => {
    await app.open({ hash: 'analysis' });
    const drop = await box(page, '#an-drop'), title = await box(page, '#an-drop-t'), open = await box(page, '#an-drop [data-an-open]');
    expect(drop.height).toBeLessThan(140);   // 210px before
    expect(open.x).toBeGreaterThan(title.x + title.width);
    expect(open.height).toBeGreaterThanOrEqual(44);
  });

  test('Method: the six principles fill two rows of three', async ({ app, page }) => {
    await app.open({ hash: 'method' });
    const tops = await page.locator('#view-method .principle').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(2);
    expect(tops.filter(t => t === tops[0])).toHaveLength(3);
  });

  test('Settings and Help: labels and descriptions sit next to their switch or key', async ({ app, page }) => {
    await app.open();
    await page.locator('#settingsBtn').click();
    const sw = await box(page, '.set-row:has(#set-wake) .switch'), lab = await box(page, '.set-row:has(#set-wake) .lab');
    expect(lab.x - (sw.x + sw.width)).toBeLessThan(40);
    await page.keyboard.press('Escape');
    await page.locator('#helpBtn').click();
    const kbd = await box(page, '#helpBox .hk kbd'), desc = await box(page, '#helpBox .hk > span');
    expect(desc.x - kbd.x).toBeLessThan(200);
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('my screens keep within the width and keep their phone layout', async ({ app, page }) => {
    await app.open({ saved: seeded() });
    const tools = await page.locator('#tools .tool').evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON()));
    expect(tools[1].top).toBeGreaterThan(tools[0].bottom - 1);
    for (const r of tools) expect(r.height).toBeGreaterThanOrEqual(44);
    expect(await noSideScroll(page)).toBe(true);
    for (const view of ['progress', 'learn', 'analysis', 'method']) {
      await page.evaluate(v => window.__etude.show(v), view);
      expect(await noSideScroll(page), view).toBe(true);
    }
    await page.evaluate(() => window.__etude.show('progress'));
    const fc = await box(page, '#forecast'), mastery = await box(page, '#masteryRows');
    expect(fc.y).toBeGreaterThan(mastery.y + mastery.height);
    await page.evaluate(() => window.__etude.show('learn'));
    await page.evaluate(() => window.__etude.learnReady);
    await page.evaluate(() => window.__etude.learnGoId('iv2'));
    const svg = page.locator('#learnBody .lstaff-svg .ss-svg[style*="--sw"]').first();
    await expect(svg).toHaveCount(1);
    const { drawn, shown } = await svg.evaluate(s => ({ drawn: parseFloat(s.style.getPropertyValue('--sw')), shown: s.getBoundingClientRect().width }));
    expect(Math.abs(shown - drawn)).toBeLessThanOrEqual(1);   // a phone staff keeps its drawn size and scrolls
    expect(await noSideScroll(page)).toBe(true);
  });
});

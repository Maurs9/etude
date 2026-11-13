import { test, expect } from '../helpers/fixtures.mjs';
import { STRINGS } from '../../src/locales/index.js';

// The Read tab's home (docs/plans/2026-11-13-read-redesign-spec.md, sections 3, 7 and 12): Today, the book, Warm-up and
// Progress, with the old drills and sight-reading screens one tap away under "More".
const book = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).data.reading?.book ?? null);
const withBook = (bookState) => ({ v: 3, lang: 'en', data: { reading: { book: bookState } } });
const fill = (s, ...args) => args.reduce((out, value, i) => { const mark = ['%a', '%b'][i]; return out.replace(mark && out.includes(mark) ? mark : '%s', String(value)); }, s);

async function openHome(app, saved) {
  const page = await app.open({ hash: 'read', saved });
  await expect(page.locator('#rdn-home')).toBeVisible();
  return page;
}

test.describe('Read home', () => {
  test('shows Today, the book, Warm-up and Progress, with the old screens under More', async ({ app }) => {
    const page = await openHome(app);
    for (const card of ['.rdn-today', '.rdn-book', '.rdn-warm', '.rdn-progress']) {
      const section = page.locator(`#rdn-home section${card}`);
      await expect(section).toBeVisible();
      await expect(section.locator('h2')).toHaveCount(1);
    }
    await expect(page.locator('#rdp-drills')).toBeHidden();
    await expect(page.locator('#rdp-pieces')).toBeHidden();
    await expect(page.locator('#rdn-more-h')).toBeVisible();
    await expect(page.locator('#rd-tabs')).toBeVisible();
    // The tab strip sits below the home.
    const homeBottom = await page.locator('#rdn-home').evaluate((el) => el.getBoundingClientRect().bottom);
    expect(await page.locator('#rd-tabs').evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThan(homeBottom);
    await expect(page.locator('#rdn-home-back')).toBeHidden();

    await page.locator('#rdt-drills').click();
    await expect(page.locator('#rdx-ladder')).toBeVisible();
    await expect(page.locator('#rdn-home')).toBeHidden();
    await expect(page.locator('#rdn-home-back')).toBeVisible();
    await page.locator('#rdn-home-back').click();
    await expect(page.locator('#rdn-home')).toBeVisible();
    await expect(page.locator('#rdp-drills')).toBeHidden();

    await page.locator('#rdt-pieces').click();
    await expect(page.locator('#rd-gen')).toBeVisible();
    await expect(page.locator('#rdn-home-back')).toBeVisible();

    // The home is the first screen each time the Read tab opens, whatever the saved tab.
    await page.evaluate(() => window.__etude.show('practice'));
    await page.evaluate(() => window.__etude.show('read'));
    await expect(page.locator('#rdn-home')).toBeVisible();
    await expect(page.locator('#rdp-pieces')).toBeHidden();
  });

  test('Warm-up and All drills open the drills screen', async ({ app }) => {
    const page = await openHome(app);
    await page.locator('#rdn-warm-go').click();
    await expect(page.locator('#rdx-ladder')).toBeVisible();
    await page.locator('#rdn-home-back').click();
    await page.locator('#rdn-all-drills').click();
    await expect(page.locator('#rdx-ladder')).toBeVisible();
    await expect(page.locator('#rdt-drills')).toHaveAttribute('aria-selected', 'true');
  });

  test('level and key choices persist across a reload', async ({ app, page }) => {
    await openHome(app);
    await page.locator('[data-rdn-lv="3"]').click();
    await expect(page.locator('[data-rdn-lv="3"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-rdn-lv="1"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.rdn-lvdesc')).toContainText(STRINGS.en.rdn_lv3_name);
    await expect(page.locator('.rdn-lvdesc')).toContainText(STRINGS.en.rdn_pat_brokenTriad);
    await page.locator('[data-rdn-key="Bb"]').click();
    await expect(page.locator('[data-rdn-key="Bb"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-rdn-key="mix"]')).toHaveAttribute('aria-pressed', 'false');
    expect(await book(page)).toMatchObject({ level: 3, focusKey: 'Bb' });

    await page.reload();
    await expect(page.locator('#rdn-home')).toBeVisible();
    await expect(page.locator('[data-rdn-lv="3"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-rdn-key="Bb"]')).toHaveAttribute('aria-pressed', 'true');
    // A key outside the level's mix sits under "Other keys", which opens when that key is pinned.
    await expect(page.locator('[data-rdn-key="E"]')).toBeHidden();
    await page.locator('#rdn-more-keys summary').click();
    await page.locator('[data-rdn-key="E"]').click();
    await expect(page.locator('#rdn-more-keys')).toHaveAttribute('open', '');
    await page.reload();
    await expect(page.locator('#rdn-more-keys')).toHaveAttribute('open', '');
    await expect(page.locator('[data-rdn-key="E"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Mixed shows 12 units of 8 numbers, a pinned key shows a run of 20', async ({ app, page }) => {
    await openHome(app);
    await expect(page.locator('.rdn-unit')).toHaveCount(12);
    await expect(page.locator('.rdn-unit .rdn-num')).toHaveCount(96);
    await expect(page.locator('.rdn-unit').first().locator('.rdn-num')).toHaveCount(8);
    await expect(page.locator('.rdn-bookhead h3')).toHaveText(fill(STRINGS.en.rdn_book_head, 1));
    await expect(page.locator('#rdn-book-done')).toHaveText(fill(STRINGS.en.rdn_done_of, 0, 96));
    await expect(page.locator('#rdn-book-go')).toHaveText(fill(STRINGS.en.rdn_go_start, 1));
    // Level 1: C, G, mix, F, A minor, mix, D minor, mixes, level check.
    await expect(page.locator('.rdn-unit').nth(0)).toContainText('C major');
    await expect(page.locator('.rdn-unit').nth(0).locator('.rdn-tag')).toHaveText(STRINGS.en.rdn_new_key);
    await expect(page.locator('.rdn-unit').nth(2)).toContainText(STRINGS.en.rdn_unit_mix);
    await expect(page.locator('.rdn-unit').nth(11)).toContainText(STRINGS.en.rdn_unit_check);
    await expect(page.locator('.rdn-unit .rdn-num').first()).toHaveAttribute('aria-label', fill(STRINGS.en.rdn_num_aria_none, 1));
    await expect(page.locator('.rdn-num.next')).toHaveAttribute('data-rdn-n', '1');

    await page.locator('[data-rdn-key="G"]').click();
    await expect(page.locator('.rdn-unit')).toHaveCount(0);
    await expect(page.locator('.rdn-nums .rdn-num')).toHaveCount(20);
    await expect(page.locator('.rdn-bookhead h3')).toHaveText(fill(STRINGS.en.rdn_focus_head, 'G major'));
    await expect(page.locator('#rdn-book-done')).toHaveText(fill(STRINGS.en.rdn_done_of, 0, 20));
    await expect(page.locator('.rdn-today')).toContainText(fill(STRINGS.en.rdn_today_key, 'G major'));
    await page.locator('[data-rdn-key="mix"]').click();
    await expect(page.locator('.rdn-unit .rdn-num')).toHaveCount(96);
  });

  test('key chips show the signature and the status colour from the saved scores', async ({ app }) => {
    const page = await openHome(app, withBook({ v: 1, level: 1, focusKey: null, pieces: {}, recent: { '1|G': [90, 92, 88, 95], '1|F': [40] }, daily: null, days: [] }));
    const g = page.locator('[data-rdn-key="G"]'), f = page.locator('[data-rdn-key="F"]'), c = page.locator('[data-rdn-key="C"]');
    await expect(g).toHaveAttribute('data-m', '2');
    await expect(f).toHaveAttribute('data-m', '1');
    await expect(c).toHaveAttribute('data-m', '0');
    await expect(g.locator('small')).toHaveText('1♯');
    await expect(f.locator('small')).toHaveText('1♭');
    await expect(c.locator('small')).toHaveText(STRINGS.en.rdn_sig_none);
    await expect(g).toHaveAttribute('aria-label', /G major, 1 sharp, secure/);
    expect(await g.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
  });

  test("Today's set: five chips, fixed for the day, drawn again when the level changes", async ({ app, page }) => {
    await openHome(app);
    await expect(page.locator('.rdn-slot')).toHaveCount(5);
    await expect(page.locator('#rdn-today-go')).toHaveText(STRINGS.en.rdn_today_start);
    await expect(page.locator('.rdn-today')).toContainText(STRINGS.en.rdn_today_mixed);
    const first = await book(page);
    expect(first.daily.slots).toHaveLength(5);
    expect(first.daily.date).toBe(await page.evaluate(() => window.__etude.rdnToday()));
    await page.reload();
    await expect(page.locator('.rdn-slot')).toHaveCount(5);
    expect((await book(page)).daily).toEqual(first.daily);
    await page.locator('[data-rdn-lv="2"]').click();
    const second = await book(page);
    expect(second.daily.level).toBe(2);
    expect(second.daily.slots).not.toEqual(first.daily.slots);
  });

  test('suggests the next level after 16 first-sight scores of 90', async ({ app, page }) => {
    await openHome(app, withBook({ v: 1, level: 3, focusKey: null, pieces: {}, recent: { 3: Array(16).fill(90) }, daily: null, days: [] }));
    await expect(page.locator('#rdn-suggest')).toBeVisible();
    await expect(page.locator('#rdn-suggest')).toContainText(fill(STRINGS.en.rdn_suggest, 4));
    await expect(page.locator('.rdn-stats')).toContainText('90%');
    await page.locator('#rdn-suggest-go').click();
    await expect(page.locator('[data-rdn-lv="4"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#rdn-suggest')).toHaveCount(0);
    expect((await book(page)).level).toBe(4);
  });

  test('re-renders in Romanian when the language changes', async ({ app, page }) => {
    await openHome(app);
    await expect(page.locator('#rdn-today-h')).toHaveText(STRINGS.en.rdn_today_title);
    await page.evaluate(() => window.__etude.setLang('ro'));
    await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
    await expect(page.locator('#rdn-today-h')).toHaveText(STRINGS.ro.rdn_today_title);
    await expect(page.locator('#rdn-book-h')).toHaveText(STRINGS.ro.rdn_book_title);
    await expect(page.locator('#rdn-today-go')).toHaveText(STRINGS.ro.rdn_today_start);
    await expect(page.locator('#rdn-more-h')).toHaveText(STRINGS.ro.rdn_more);
    await expect(page.locator('.rdn-lvdesc')).toContainText(STRINGS.ro.rdn_lv1_name);
  });

  for (const [width, height] of [[390, 844], [820, 1180], [1180, 820], [1440, 900]]) {
    test(`fits ${width}px: no sideways scroll, every control at least 44px`, async ({ app, page }) => {
      await page.setViewportSize({ width, height });
      await openHome(app);
      await page.locator('[data-rdn-lv="8"]').click(); // the longest key row and pattern list
      const facts = await page.evaluate(() => {
        const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        const controls = [...document.querySelectorAll('#rdn-home button, #rdn-home summary, #rd-tabs [role=tab]')].filter(visible);
        const box = (sel) => document.querySelector(sel).getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          small: controls.filter((el) => el.getBoundingClientRect().height < 44).map((el) => el.outerHTML.slice(0, 80)),
          count: controls.length,
          today: box('.rdn-today'), warm: box('.rdn-warm'), bookCard: box('.rdn-book'), progress: box('.rdn-progress'),
        };
      });
      expect(facts.overflow).toBeLessThanOrEqual(0);
      expect(facts.small).toEqual([]);
      expect(facts.count).toBeGreaterThan(100);
      if (width >= 1100) {
        // Two columns: Warm-up beside Today, Progress under Warm-up, the book under Today.
        expect(facts.warm.left).toBeGreaterThan(facts.today.right);
        expect(Math.round(facts.warm.width)).toBe(340);
        expect(facts.progress.left).toBe(facts.warm.left);
        expect(facts.bookCard.left).toBe(facts.today.left);
      } else if (width >= 700) {
        // Today and Warm-up share the first row; the book and Progress are full width.
        expect(facts.warm.top).toBe(facts.today.top);
        expect(facts.warm.left).toBeGreaterThan(facts.today.right);
        expect(facts.bookCard.width).toBeGreaterThan(facts.today.width * 1.8);
        expect(facts.progress.width).toBeCloseTo(facts.bookCard.width, 0);
      } else {
        expect(facts.warm.left).toBe(facts.today.left);
        expect(facts.warm.top).toBeGreaterThan(facts.bookCard.bottom - 1);
      }
    });
  }

  test('works in the dark theme', async ({ app, page }) => {
    await openHome(app);
    await page.evaluate(() => { window.__etude.theme = 'dark'; window.__etude.applyTheme(); });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const colours = await page.locator('.rdn-today').evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, ink: getComputedStyle(el.querySelector('h2')).color }));
    expect(colours.bg).toBe('rgb(33, 29, 25)');
    expect(colours.ink).toBe('rgb(236, 229, 216)');
  });
});

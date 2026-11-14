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
  test('is laid out like Today: the set card, the plan, the book and the other ways, with the old screens under More', async ({ app }) => {
    const page = await openHome(app);
    for (const card of ['.rdn-today', '.rdn-plan', '.rdn-book']) {
      const section = page.locator(`#rdn-home section${card}`);
      await expect(section).toBeVisible();
      await expect(section.locator('h2, h3.rdn-book-t')).toHaveCount(1);
    }
    // The plan: three numbered steps, the first one next, and a Continue button that names it.
    const steps = page.locator('#rdn-plan .plan-item');
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toHaveAttribute('data-next', 'true');
    await expect(steps.nth(0).locator('.ck')).toHaveText('1');
    await expect(page.locator('#rdn-plan-sub')).toHaveText(STRINGS.en.plan_sub.replace('%a', '0').replace('%b', '3'));
    await expect(page.locator('#rdn-plan-segs i')).toHaveCount(3);
    await expect(page.locator('#rdn-plan-continue')).toHaveText(STRINGS.en.plan_continue.replace('%s', STRINGS.en.rdn_warm_title));
    await expect(steps.nth(1).locator('.plan-pill')).toHaveText('0/5');
    // The head's right side: the streak and today's set as five dots.
    await expect(page.locator('#rdn-streak-n')).toHaveText('0');
    await expect(page.locator('#rdn-streak .goaldots i')).toHaveCount(5);
    // Other ways to practice: three cards.
    await expect(page.locator('#rdn-home .tools .tool')).toHaveCount(3);
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

  test('Warm-up opens the warm-up, All drills opens the drills screen, and each screen has its lede', async ({ app }) => {
    const page = await openHome(app);
    await expect(page.locator('#rdn-lede')).toHaveText(STRINGS.en.rdn_lede);
    await expect(page.locator('#rd-lede')).toBeHidden();
    await page.locator('#rdn-warm-go').click();
    await expect(page.locator('#rdn-warm')).toBeVisible();
    await expect(page.locator('#rdx-ladder')).toBeHidden();
    await page.locator('#rdn-w-back').click();
    await expect(page.locator('#rdn-home')).toBeVisible();
    await page.locator('#rdn-all-drills').click();
    await expect(page.locator('#rd-lede')).toHaveText(STRINGS.en.rd_lede);
    await expect(page.locator('#rdn-lede')).toBeHidden();
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
    const page = await openHome(app, withBook({ v: 2, level: 1, focusKey: null, pieces: {}, recent: { '1|G': [90, 92, 88, 95], '1|F': [40] }, daily: null, days: [] }));
    const g = page.locator('[data-rdn-key="G"]'), f = page.locator('[data-rdn-key="F"]'), c = page.locator('[data-rdn-key="C"]');
    await expect(g).toHaveAttribute('data-m', '2');
    await expect(f).toHaveAttribute('data-m', '1');
    await expect(c).toHaveAttribute('data-m', '0');
    await expect(g.locator('small')).toHaveText('1♯');
    await expect(f.locator('small')).toHaveText('1♭');
    await expect(c.locator('small')).toHaveText(STRINGS.en.rdn_sig_none);
    await expect(g).toHaveAttribute('aria-label', /G major, 1 sharp, secure/);
    await expect(f).toHaveAttribute('aria-label', /F major, 1 flat, started/);
    expect(await g.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
    // Not by colour alone: a check for secure, a dot for started, on the chip and in the legend (decorative signs).
    await expect(g.locator('.rdn-mk')).toHaveText('✓');
    await expect(f.locator('.rdn-mk')).toHaveText('●');
    await expect(c.locator('.rdn-mk')).toHaveCount(0);
    await expect(g.locator('.rdn-mk')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.rdn-legend .rdn-mk-secure')).toHaveText('✓');
    await expect(page.locator('.rdn-legend .rdn-mk-started')).toHaveText('●');
  });

  test('a piece played without a star is not announced as 0 stars', async ({ app }) => {
    const page = await openHome(app, withBook({ v: 2, level: 1, focusKey: null, pieces: { 'b1.1': { best: 30, stars: 0, tries: 1, first: 30 } }, recent: {}, daily: null, days: [] }));
    await expect(page.locator('[data-rdn-n="1"]')).toHaveAttribute('aria-label', fill(STRINGS.en.rdn_num_aria_star0, 1));
    for (const lang of Object.keys(STRINGS).filter((k) => STRINGS[k].rdn_today_title)) {
      expect(STRINGS[lang].rdn_num_aria_star0, lang).not.toMatch(/0/);
      expect(STRINGS[lang].rdn_stars_none, lang).toBeTruthy();
    }
  });

  test('strings: German Prev, French agreement and terms, one Romanian key count for every number', async ({ app }) => {
    expect(STRINGS.de.rdn_prev).toBe('← Vorheriges');
    expect(STRINGS.de.rdn_prev).not.toBe(STRINGS.de.rdn_back);
    expect(STRINGS.fr.rdn_not_played).toBe('pas joué');
    expect(STRINGS.fr.rdn_today_key).toBe('Tous en %s.');
    expect(STRINGS.fr.rdn_lv1_name).toBe('Degrés conjoints');
    expect(STRINGS.fr.rdn_pat_stepRun).toBe('mouvement conjoint');
    for (const n of [5, 9, 13, 17, 24])
      expect(fill(STRINGS.ro.rdn_mixed_sub, n)).toBe(`Tonalități: ${n}`);
    const page = await openHome(app);
    await page.evaluate(() => window.__etude.setLang('ro'));
    await expect(page.locator('.rdn-mix small')).toHaveText(/^Tonalități: \d+$/);
  });

  test("a set that cannot be made shows No set today and never breaks the home", async ({ app, page }) => {
    await openHome(app);
    await page.evaluate(() => { window.__etude.rdnEnsureDailyOf = () => { throw new Error('No new piece for a test'); }; });
    await page.locator('[data-rdn-lv="2"]').click();
    await expect(page.locator('[data-rdn-lv="2"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#rdn-no-set')).toHaveText(STRINGS.en.rdn_no_set);
    await expect(page.locator('#rdn-today-go')).toBeDisabled();
    await expect(page.locator('.rdn-slot')).toHaveCount(0);
    expect((await book(page)).level).toBe(2);
    await page.evaluate(() => window.__etude.show('practice'));
    await page.evaluate(() => window.__etude.show('read'));
    await expect(page.locator('#rdn-home')).toBeVisible();
    await expect(page.locator('#rdn-no-set')).toBeVisible();
  });

  test('on the home the More row is two plain buttons in a group; on the old screens they are tabs again', async ({ app, page }) => {
    await openHome(app);
    await expect(page.locator('#rd-tabs')).toHaveAttribute('role', 'group');
    await expect(page.getByRole('group', { name: STRINGS.en.rdn_more })).toBeVisible();
    await expect(page.locator('#rd-tabs [role=tab]')).toHaveCount(0);
    await expect(page.locator('#rdt-drills')).not.toHaveAttribute('aria-selected', /.*/);
    // Arrow keys do not open a screen from the home.
    await page.locator('#rdt-drills').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#rdn-home')).toBeVisible();
    await page.locator('#rdt-pieces').click();
    await expect(page.locator('#rd-tabs')).toHaveAttribute('role', 'tablist');
    await expect(page.locator('#rdt-pieces')).toHaveAttribute('role', 'tab');
    await expect(page.locator('#rdt-pieces')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#rdt-drills')).toHaveAttribute('aria-controls', 'rdp-drills');
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
    await openHome(app, withBook({ v: 2, level: 3, focusKey: null, pieces: {}, recent: { 3: Array(16).fill(90) }, daily: null, days: [] }));
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

  for (const [width, height] of [[360, 740], [390, 844], [820, 1180], [1180, 820], [1440, 900]]) {
    test(`fits ${width}px: no sideways scroll, every control at least 44px`, async ({ app, page }) => {
      await page.setViewportSize({ width, height });
      await openHome(app);
      await page.locator('[data-rdn-lv="8"]').click(); // the longest key row and pattern list
      const facts = await page.evaluate(() => {
        const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        const controls = [...document.querySelectorAll('#rdn-home button, #rdn-home summary, #rd-tabs button')].filter(visible);
        const box = (sel) => document.querySelector(sel).getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          small: controls.filter((el) => el.getBoundingClientRect().height < 44).map((el) => el.outerHTML.slice(0, 80)),
          // The level buttons: two rows of four below 480px, so none is narrower than 44px either.
          narrow: [...document.querySelectorAll('.rdn-lv')].filter((el) => el.getBoundingClientRect().width < 44).map((el) => el.dataset.rdnLv),
          count: controls.length,
          today: box('.rdn-today'), plan: box('.rdn-plan'), bookCard: box('.rdn-book'), tools: box('#rdn-home .tools'),
        };
      });
      expect(facts.overflow).toBeLessThanOrEqual(0);
      expect(facts.small).toEqual([]);
      expect(facts.narrow).toEqual([]);
      expect(facts.count).toBeGreaterThan(100);
      // The book and the other ways come after the first row, full width.
      expect(facts.bookCard.top).toBeGreaterThan(Math.max(facts.today.bottom, facts.plan.bottom) - 1);
      expect(facts.tools.top).toBeGreaterThan(facts.bookCard.bottom - 1);
      if (width >= 960) {
        // As on Today: the set card and the plan share the first row, the plan the wider of the two.
        expect(facts.plan.top).toBe(facts.today.top);
        expect(facts.plan.left).toBeGreaterThan(facts.today.right);
        expect(facts.plan.width).toBeGreaterThan(facts.today.width);
        expect(facts.bookCard.width).toBeGreaterThan(facts.today.width * 1.8);
      } else {
        // One column: the plan under the set card.
        expect(facts.plan.left).toBe(facts.today.left);
        expect(facts.plan.top).toBeGreaterThan(facts.today.bottom - 1);
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

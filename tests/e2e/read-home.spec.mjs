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
  test('unified top 3-tab header, merged Today card, book and tools layout cleanly', async ({ app }) => {
    const page = await openHome(app);
    for (const card of ['.rdn-today', '.rdn-book']) {
      const section = page.locator(`#rdn-home section${card}`);
      await expect(section).toBeVisible();
    }
    await expect(page.locator('#rdn-today-h')).toHaveCount(1);
    await expect(page.locator('#rdn-book-h')).toHaveCount(1);
    await expect(page.locator('#rdn-plan')).toBeVisible();
    // Companion routine inside the unified hero: Warm-up and Long piece are the only buttons (no duplicate Today card), with 3 milestone segments.
    const steps = page.locator('#rdn-plan .plan-item');
    await expect(steps).toHaveCount(2);
    await expect(steps.nth(0)).toHaveAttribute('data-next', 'true');
    await expect(steps.nth(0).locator('.ck')).toHaveText('1');
    // The list shows all three steps, numbered 1-3. Today's set (step 2) is a status row without a control of its own.
    await expect(page.locator('#rdn-plan .ck')).toHaveText(['1', '2', '3']);
    const setStep = page.locator('#rdn-plan .rdn-set-step');
    await expect(setStep).toHaveCount(1);
    await expect(setStep.locator('button, a, [tabindex]')).toHaveCount(0);
    await expect(setStep.locator('.plan-pill')).toHaveText('0/5');
    await expect(setStep.locator('.visually-hidden')).toHaveText(fill(STRINGS.en.rdn_goal_aria, 0, 5));
    // The footer spans the whole card, under both columns.
    const footer = await page.locator('.rdn-today').evaluate((el) => { const f = el.querySelector(':scope > .hero-why'); return f ? f.getBoundingClientRect().width - el.getBoundingClientRect().width : null; });
    expect(footer).not.toBeNull();
    expect(Math.abs(footer)).toBeLessThanOrEqual(2);
    await expect(page.locator('#rdn-long-go')).toHaveCount(0);
    await expect(page.locator('#rdn-plan-sub')).toHaveText(STRINGS.en.plan_sub.replace('%a', '0').replace('%b', '3'));
    await expect(page.locator('#rdn-plan-segs i')).toHaveCount(3);
    // The head's right side: the streak and today's set as five dots.
    await expect(page.locator('#rdn-streak-n')).toHaveText('0');
    await expect(page.locator('#rdn-streak .goaldots i')).toHaveCount(5);
    // Other ways to practice: scored exercise, pieces, voice (Reading drills is a first-class top tab).
    await expect(page.locator('#rdn-home .tools .tool')).toHaveCount(3);
    await expect(page.locator('#rdn-scored')).toBeVisible();
    await expect(page.locator('#rdp-drills')).toBeHidden();
    await expect(page.locator('#rdp-pieces')).toBeHidden();
    await expect(page.locator('#rd-tabs')).toBeVisible();
    await expect(page.locator('#rdn-more-h')).toHaveCount(0);
    await expect(page.locator('#rdn-home-back')).toHaveCount(0);
    // The unified tab strip sits directly above the home content.
    const tabsBottom = await page.locator('#rd-tabs').evaluate((el) => el.getBoundingClientRect().bottom);
    expect(await page.locator('#rdn-home').evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(tabsBottom - 1);

    await page.locator('#rdt-drills').click();
    await expect(page.locator('#rdx-ladder')).toBeVisible();
    await expect(page.locator('#rdn-home')).toBeHidden();
    await page.locator('#rdt-book').click();
    await expect(page.locator('#rdn-home')).toBeVisible();
    await expect(page.locator('#rdp-drills')).toBeHidden();

    await page.locator('#rdt-pieces').click();
    await expect(page.locator('#rd-gen')).toBeVisible();
    await page.locator('#rdt-book').click();
    await expect(page.locator('#rdn-home')).toBeVisible();

    // The home is the first screen each time the Read tab opens, whatever the saved tab.
    await page.locator('#rdt-pieces').click();
    await page.evaluate(() => window.__etude.show('practice'));
    await page.evaluate(() => window.__etude.show('read'));
    await expect(page.locator('#rdn-home')).toBeVisible();
    await expect(page.locator('#rdp-pieces')).toBeHidden();
  });

  test('Warm-up opens the warm-up, Reading drills tab opens the drills screen, and each screen has its lede', async ({ app }) => {
    const page = await openHome(app);
    await expect(page.locator('#rdn-lede')).toHaveText(STRINGS.en.rdn_lede);
    await expect(page.locator('#rd-lede')).toBeHidden();
    await page.locator('#rdn-warm-go').click();
    await expect(page.locator('#rdn-warm')).toBeVisible();
    await expect(page.locator('#rdx-ladder')).toBeHidden();
    await page.locator('#rdn-w-back').click();
    await expect(page.locator('#rdn-home')).toBeVisible();
    await page.locator('#rdt-drills').click();
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

  test('top tabs form a 3-tab tablist across screens with keyboard arrow navigation', async ({ app, page }) => {
    await openHome(app);
    await expect(page.locator('#rd-tabs')).toHaveAttribute('role', 'tablist');
    await expect(page.locator('#rd-tabs [role=tab]')).toHaveCount(3);
    await expect(page.locator('#rdt-book')).toHaveAttribute('aria-selected', 'true');
    await page.locator('#rdt-book').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#rdt-drills')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#rdp-drills')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#rdt-pieces')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#rdp-pieces')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#rdt-book')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#rdn-home')).toBeVisible();
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
    await expect(page.locator('#rdt-book')).toContainText(STRINGS.ro.rdx_tab_book);
    await expect(page.locator('#rdt-drills')).toContainText(STRINGS.ro.rdx_tab_drills);
    await expect(page.locator('#rdt-pieces')).toContainText(STRINGS.ro.rdx_tab_pieces);
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
          // The three Read tabs are all inside the viewport: none is cut off at a phone's edge.
          tabsOut: [...document.querySelectorAll('#rd-tabs [role=tab]')].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5).map((el) => el.id),
          today: box('.rdn-today'), main: box('.rdn-today-main'), side: box('.rdn-today-side'), bookCard: box('.rdn-book'), tools: box('#rdn-home .tools'),
        };
      });
      expect(facts.overflow).toBeLessThanOrEqual(0);
      expect(facts.small).toEqual([]);
      expect(facts.narrow).toEqual([]);
      expect(facts.tabsOut).toEqual([]);
      expect(facts.count).toBeGreaterThan(100);
      // The book and the other ways come after the hero row, full width.
      expect(facts.bookCard.top).toBeGreaterThan(facts.today.bottom - 1);
      expect(facts.tools.top).toBeGreaterThan(facts.bookCard.bottom - 1);
      if (width >= 960) {
        // Side by side inside the unified hero: Today's set on the left, routine companion on the right.
        expect(Math.abs(facts.side.top - facts.main.top)).toBeLessThanOrEqual(2);
        expect(facts.side.left).toBeGreaterThan(facts.main.right);
        expect(facts.bookCard.width).toBeGreaterThan(facts.main.width * 1.5);
      } else {
        // One column: the companion column stacks under Today's set.
        expect(facts.side.top).toBeGreaterThan(facts.main.bottom - 1);
      }
    });
  }

  test('works in the dark theme', async ({ app, page }) => {
    await openHome(app);
    await page.evaluate(() => { window.__etude.theme = 'dark'; window.__etude.applyTheme(); });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const colours = await page.locator('.rdn-today').evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, ink: getComputedStyle(el.querySelector('h2')).color }));
    expect(colours.bg).toBe('rgb(27, 32, 40)');
    expect(colours.ink).toBe('rgb(235, 232, 224)');
  });
});

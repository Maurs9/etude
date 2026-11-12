import { test, expect, todayN } from '../helpers/fixtures.mjs';

// The Practice setup screen ("Drill one thing"): Continue strip, topic cards, How to answer, key chips, Start.
const TOPICS = ['interval', 'chord', 'scale', 'prog', 'melody', 'technique'];
// Which modes each topic turns off, and the mode it must then show pressed (null: the saved preference, Play it here).
const RULES = {
  interval: { off: [], pressed: 'play' },
  chord: { off: [], pressed: 'play' },
  scale: { off: [], pressed: 'play' },
  prog: { off: ['keys'], pressed: 'play' },
  melody: { off: ['play', 'ear'], pressed: 'keys' },
  technique: { off: ['ear', 'keys'], pressed: 'play' },
};
// Play along shows for Progressions only (practice-moved.spec.mjs); the hidden button is left out here.
const modeState = page => page.evaluate(() => [...document.querySelectorAll('#pr-mode button:not([hidden])')].map(b => ({ v: b.dataset.v, off: b.disabled, on: b.getAttribute('aria-pressed') === 'true' })));
const checkedTopic = page => page.evaluate(() => [...document.querySelectorAll('#pr-topics [role=radio][aria-checked=true]')].map(b => b.dataset.v));
const noPageScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const lastDrill = { cat: 'chord', mode: 'ear', keys: false, key: '2', c: 4, n: 5, day: todayN() };

test.describe('Practice setup', () => {
  test('each topic card selects its topic and applies its mode rules', async ({ app }) => {
    const page = await app.open({ hash: 'practice' });
    await expect(page.locator('#pr-topics [role=radio]')).toHaveCount(6);
    for (const cat of TOPICS) {
      await page.locator(`#pr-t-${cat}`).click();
      expect(await checkedTopic(page)).toEqual([cat]);
      await expect(page.locator(`#pr-t-${cat}`)).toHaveAttribute('tabindex', '0');
      const modes = await modeState(page);
      expect(modes.filter(m => m.off).map(m => m.v), cat).toEqual(RULES[cat].off);
      expect(modes.filter(m => m.on).map(m => m.v), cat).toEqual([RULES[cat].pressed]);
      expect(await page.evaluate(() => window.__etude.prChoice().cat)).toBe(cat);
      await expect(page.locator('#pr-mode-note')).toBeVisible({ visible: RULES[cat].off.length > 0 });
    }
    // The four review topics show the same mastered counts as the Today focus cards; the other two show none.
    for (const cat of TOPICS.slice(0, 4)) await expect(page.locator(`#pr-t-${cat}-m`)).toContainText(/^\d+ mastered of \d+$/);
    for (const cat of TOPICS.slice(4)) await expect(page.locator(`#pr-t-${cat}-m`)).toBeHidden();
  });

  test('an ear mode is saved as the on-keys choice, and Start runs the chosen drill', async ({ app }) => {
    const page = await app.open({ hash: 'practice' });
    await page.locator('#pr-t-chord').click();
    await page.locator('#pr-mode button[data-v="keys"]').click();
    expect(await page.evaluate(() => window.__etude.data.settings.earKeys)).toBe(true);
    await page.locator('#pr-mode button[data-v="ear"]').click();
    expect(await page.evaluate(() => window.__etude.data.settings.earKeys)).toBe(false);
    await expect(page.locator('#pr-mode-hint')).toHaveText('Listen to the sound and identify it from multiple choices.');
    await expect(page.locator('#pr-start')).toHaveText('Start: Chords · By ear · All keys');
    await page.locator('#pr-start').click();
    await expect(page.locator('#session')).toBeVisible();
    expect(await page.evaluate(() => window.__etude.SES.targeted)).toEqual({ cat: 'chord', mode: 'ear', key: 'all' });
  });

  test('the key chips set the key, one chip at a time', async ({ app }) => {
    const page = await app.open({ hash: 'practice' });
    const chips = page.locator('#pr-keys [role=radio]');
    await expect(chips).toHaveCount(13);
    await expect(chips.first()).toHaveText('All keys');
    await expect(chips.first()).toHaveAttribute('aria-checked', 'true');
    await page.locator('#pr-keys [data-v="7"]').click();
    await expect(page.locator('#pr-keys [aria-checked=true]')).toHaveCount(1);
    await expect(page.locator('#pr-keys [data-v="7"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#pr-key')).toHaveValue('7');
    await expect(page.locator('#pr-start')).toHaveText('Start: Intervals · Play it · G');
    // Arrow keys move through the chips and select.
    await page.locator('#pr-keys [data-v="7"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#pr-keys [data-v="8"]')).toBeFocused();
    await expect(page.locator('#pr-key')).toHaveValue('8');
    await page.locator('#pr-start').click();
    expect(await page.evaluate(() => window.__etude.SES.targeted)).toEqual({ cat: 'interval', mode: 'play', key: '8' });
  });

  test('the Continue strip shows the last drill and restarts it with one tap', async ({ app }) => {
    const page = await app.open({ saved: { v: 3, lang: 'en', data: { lastDrill } }, hash: 'practice' });
    const strip = page.locator('#pr-last');
    await expect(strip).toBeVisible();
    await expect(strip).toContainText('Last drill · Chords · By ear · D — 4 / 5 correct (80%)');
    await page.locator('#pr-redo').click();
    await expect(page.locator('#session')).toBeVisible();
    expect(await page.evaluate(() => window.__etude.SES.targeted)).toEqual({ cat: 'chord', mode: 'ear', key: '2' });
    expect(await page.evaluate(() => window.__etude.data.settings.earKeys)).toBe(false);
    // The setup now holds that drill too, so Start after End runs it again.
    await page.locator('#ses-end').click();
    expect(await page.evaluate(() => window.__etude.prChoice())).toEqual({ cat: 'chord', mode: 'ear', key: '2' });
  });

  test('Continue runs a by-ear Progressions drill by ear, even when the saved record says on keys', async ({ app }) => {
    const saved = { v: 3, lang: 'en', data: { lastDrill: { cat: 'prog', mode: 'ear', keys: true, key: '9', c: 1, n: 2, day: todayN() } } };
    const page = await app.open({ saved, hash: 'practice' });
    await expect(page.locator('#pr-last')).toContainText('Last drill · Progressions · By ear · A — 1 / 2 correct (50%)');
    await page.locator('#pr-t-interval').click();
    await page.locator('#pr-mode button[data-v="play"]').click();
    await page.locator('#pr-redo').click();
    expect(await page.evaluate(() => window.__etude.SES.targeted)).toEqual({ cat: 'prog', mode: 'ear', key: '9' });
  });

  test('no Continue strip before the first drill', async ({ app }) => {
    const page = await app.open({ hash: 'practice' });
    await expect(page.locator('#pr-last')).toBeHidden();
  });

  test('a Today focus card opens Practice on its topic', async ({ app }) => {
    const page = await app.open();
    await page.locator('#focusGrid button').nth(3).click(); // Progressions
    await expect(page.locator('#view-practice')).toHaveClass(/active/);
    expect(await checkedTopic(page)).toEqual(['prog']);
    await expect(page.locator('#pr-mode button[data-v="keys"]')).toBeDisabled();
    await expect(page.locator('#pr-start')).toBeFocused();
  });

  test('a Progress "Needs work" item opens Practice on its topic, with the topic rules applied', async ({ app }) => {
    const page = await app.open({ hash: 'practice' });
    await page.locator('#pr-mode button[data-v="keys"]').click(); // the saved preference, which Progressions cannot use
    await page.evaluate(() => {
      const api = window.__etude, it = api.ITEMS.find(x => x.cat === 'prog');
      api.data.srs[it.id] = { box: 1, ease: 2.5, due: 0, reps: 4, lapses: 2, last: 0 };
      api.show('progress');
    });
    await page.locator('#weakList button').first().click();
    await expect(page.locator('#view-practice')).toHaveClass(/active/);
    expect(await checkedTopic(page)).toEqual(['prog']);
    await expect(page.locator('#pr-mode button[data-v="keys"]')).toBeDisabled();
    await expect(page.locator('#pr-mode button[data-v="ear"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#pr-start')).toBeFocused();
  });

  test('a Learn link opens Practice on its topic', async ({ app }) => {
    const page = await app.open();
    await page.evaluate(() => {
      const a = document.createElement('a');
      a.href = '#';
      a.dataset.go = 'practice';
      a.dataset.cat = 'scale';
      document.getElementById('learnBody').appendChild(a);
      a.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await expect(page.locator('#view-practice')).toHaveClass(/active/);
    expect(await checkedTopic(page)).toEqual(['scale']);
  });

  test('the topic cards are a radio group: arrow keys, Home and End move and select', async ({ app }) => {
    const page = await app.open({ hash: 'practice' });
    await expect(page.locator('#pr-topics')).toHaveAttribute('role', 'radiogroup');
    await expect(page.locator('#pr-topics [tabindex="0"]')).toHaveCount(1);
    await page.locator('#pr-t-interval').focus();
    const step = async (key, cat) => {
      await page.keyboard.press(key);
      await expect(page.locator(`#pr-t-${cat}`)).toBeFocused();
      expect(await checkedTopic(page)).toEqual([cat]);
    };
    await step('ArrowRight', 'chord');
    await step('ArrowDown', 'scale');
    await step('ArrowLeft', 'chord');
    await step('End', 'technique');
    await step('ArrowRight', 'interval'); // wraps around
    await step('ArrowUp', 'technique');
    await step('Home', 'interval');
    await expect(page.locator('#pr-topics [tabindex="0"]')).toHaveCount(1);
    // Tab leaves the group in one step, and Shift+Tab comes back to the checked card.
    await page.keyboard.press('Tab');
    await expect(page.locator('#pr-mode button[data-v="play"]')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#pr-t-interval')).toBeFocused();
  });

  for (const width of [390, 360]) {
    test(`at ${width}px: two cards across, the key chips scroll in their row, no sideways page scroll`, async ({ app, page }) => {
      await page.setViewportSize({ width, height: 844 });
      await app.open({ saved: { v: 3, lang: 'en', data: { lastDrill } }, hash: 'practice' });
      await expect(page.locator('#pr-last')).toBeVisible();
      expect(await noPageScroll(page)).toBe(true);
      expect(await page.locator('#pr-topics').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);
      expect(await page.locator('#pr-keys').evaluate(el => el.scrollWidth > el.clientWidth && getComputedStyle(el).overflowX === 'auto')).toBe(true);
      await page.locator('#pr-keys [data-v="11"]').click();
      await expect(page.locator('#pr-keys [data-v="11"]')).toBeInViewport();
      expect(await noPageScroll(page)).toBe(true);
      const start = await page.locator('#pr-start').boundingBox(), panel = await page.locator('.pr-setup').boundingBox();
      expect(start.width).toBeGreaterThan(panel.width - 50); // full width inside the panel
      // Touch targets: 44px or more.
      for (const sel of ['#pr-topics [role=radio]', '#pr-keys [role=radio]', '#pr-mode button:not([hidden])', '#pr-start', '#pr-redo']) {
        const sizes = await page.locator(sel).evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return Math.min(r.width, r.height); }));
        for (const s of sizes) expect(s, sel).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test('three cards across on a wide screen, in the light and the dark theme', async ({ app, page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await app.open({ hash: 'practice' });
    expect(await page.locator('#pr-topics').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(3);
    const look = () => page.locator('#pr-t-interval').evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, ink: getComputedStyle(el.querySelector('.k')).color }));
    const light = await look();
    await page.evaluate(() => { window.__etude.theme = 'dark'; window.__etude.applyTheme(); });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // The cards fade between themes (.focus transition), so wait for the end colours.
    await expect.poll(async () => { const dark = await look(); return dark.bg !== light.bg && dark.ink !== light.ink; }).toBe(true);
  });

  test('the setup follows the language and the note names', async ({ app }) => {
    const page = await app.open({ hash: 'practice' });
    await page.locator('#pr-keys [data-v="10"]').click();
    await page.evaluate(() => window.__etude.setLang('de'));
    await expect(page.locator('#pr-t-prog-n')).toHaveText('Akkordfolgen');
    await expect(page.locator('#pr-t-melody-d')).toHaveText('Hör eine kurze Melodie und spiele sie nach.');
    await expect(page.locator('#pr-keys [data-v="all"]')).toHaveText('Alle Tonarten');
    await expect(page.locator('#pr-keys [data-v="10"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#pr-start')).toHaveText(/^Starten: Intervalle · Spielen · /);
  });
});

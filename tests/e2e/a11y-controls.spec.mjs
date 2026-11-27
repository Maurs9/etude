import { test, expect } from '../helpers/fixtures.mjs';
import { STRINGS } from '../../src/locales/index.js';

// Keyboard reach, screen names and control boundaries (WCAG 2.1.1, 2.4.2, 1.4.11).

test('Practice > Progressions: arrow keys, Home and End move between Exercise and Play along', async ({ app }) => {
  const page = await app.open({ hash: 'practice' });
  await page.locator('#pr-t-prog').click();
  const drill = page.locator('#pr-prog-split [data-v="drill"]'), along = page.locator('#pr-prog-split [data-v="along"]');
  await expect(drill).toHaveAttribute('aria-selected', 'true');
  await expect(along).toHaveAttribute('tabindex', '-1');
  await drill.focus();
  await page.keyboard.press('ArrowRight');
  await expect(along).toBeFocused();
  await expect(along).toHaveAttribute('aria-selected', 'true');
  await expect(along).toHaveAttribute('tabindex', '0');
  await expect(page.locator('#pr-mode button[data-v="along"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Home');
  await expect(drill).toBeFocused();
  await expect(drill).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(along).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(drill).toHaveAttribute('aria-selected', 'true');
});

test('the tab title names the screen in the interface language', async ({ app }) => {
  const page = await app.open({ hash: 'learn' });
  await expect(page).toHaveTitle(`${STRINGS.en.nav_learn} — Étude`);
  await page.evaluate(() => window.__etude.show('practice'));
  await expect(page).toHaveTitle(`${STRINGS.en.nav_drills} — Étude`);
  await page.evaluate(() => window.__etude.show('read'));
  await expect(page).toHaveTitle(`${STRINGS.en.nav_read} — Étude`);
  await page.evaluate(() => window.__etude.show('today'));
  await expect(page).toHaveTitle(`${STRINGS.en.nav_today} — Étude`);
  await page.locator('#settingsBtn').click();
  await page.locator('#set-lang button[data-v="ro"]').click();
  await expect(page).toHaveTitle(`${STRINGS.ro.nav_today} — Étude`);
  await page.keyboard.press('Escape');
  await page.locator('#nav button[data-view="analysis"]').click();
  await expect(page).toHaveTitle(`${STRINGS.ro.nav_scores} — Étude`);
});

test('control borders reach 3:1 against the page and the card in both themes', async ({ app }) => {
  const page = await app.open({ hash: 'practice' });
  const measure = () => page.evaluate(() => {
    const rgb = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    const lum = (c) => c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); })
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const l1 = lum(rgb(a)), l2 = lum(rgb(b)); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    const root = getComputedStyle(document.documentElement);
    const paper = root.getPropertyValue('--paper').trim(), card = root.getPropertyValue('--card').trim();
    const toRgb = (hex) => { const h = hex.replace('#', ''); return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`; };
    // An icon button, a mode button, a select, the MIDI chip and a plain button.
    const controls = ['#settingsBtn', '#modeNav button[aria-current="false"]', 'select', '#midiChip', '.btn:not(.primary)'];
    return controls.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { sel, page: 0, card: 0 };
      const border = getComputedStyle(el).borderTopColor;
      return { sel, page: ratio(border, toRgb(paper)), card: ratio(border, toRgb(card)) };
    });
  });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => { window.__etude.theme = t; window.__etude.applyTheme(); }, theme);
    for (const r of await measure()) {
      expect(r.page, `${theme} ${r.sel} on the page`).toBeGreaterThanOrEqual(3);
      expect(r.card, `${theme} ${r.sel} on a card`).toBeGreaterThanOrEqual(3);
    }
  }
});

import { test, expect } from '../helpers/fixtures.mjs';

const languages = [
  ['en', 'Settings'], ['ro', 'Setări'], ['es', 'Ajustes'],
  ['fr', 'Paramètres'], ['de', 'Einstellungen'], ['it', 'Impostazioni'],
  ['pt-BR', 'Configurações'],
];

test('language can be selected independently of notation and survives reload', async ({ app }) => {
  const page = await app.open();
  await page.locator('#settingsBtn').click();
  await page.locator('#set-notation [data-v="solfege"]').click();
  for (const [code, expected] of languages) {
    await page.locator(`#set-lang [data-v="${code}"]`).click();
    await expect(page.locator('#drawerTitle')).toHaveText(expected);
    await expect(page.locator('#set-notation [data-v="solfege"]')).toHaveAttribute('aria-pressed', 'true');
  }
  await page.reload();
  await expect(page.locator('#drawerTitle')).toHaveText('Configurações');
  await expect(page.locator('#set-lang [data-v="pt-BR"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#set-notation [data-v="solfege"]')).toHaveAttribute('aria-pressed', 'true');
});

test('German localizes built-in piece titles and the Learn staff captions', async ({ app, page }) => {
  await app.open({ hash: 'analysis', lang: 'de' });
  await expect(page.locator('#pc-list')).toContainText('Fünffinger-Aufwärmen');
  expect(await page.evaluate(() => window.__etude.lStaffHTML('n_clefs'))).toContain('Violinschlüssel');
});

test('Progress shows the reading book alongside legacy drill statistics', async ({ app, page }) => {
  await app.open({ hash: 'progress', saved: { v: 3, data: { reading: {
    book: { v: 2, level: 1, pieces: { 'b1.1': { best: 88, stars: 2, tries: 1, first: 88 } } },
    tot: { n: 12, ok: 10, ms: 1000, sess: 1 },
  } } } });
  await expect(page.locator('#rdx-book-progress')).toContainText('Level 1 book');
  await expect(page.locator('#rdx-book-progress .num')).toHaveText('1');
  await expect(page.locator('#rdx-stats .rdx-tiles b').first()).toHaveText('12');
});

test('contrast for error labels and completed plan cards meets AA in both palettes', async ({ app, page }) => {
  await app.open({ hash: 'today' });
  const contrasts = await page.evaluate(() => {
    const luminance = hex => {
      const channels = hex.trim().slice(1).match(/../g).map(x => parseInt(x, 16) / 255);
      const [r, g, b] = channels.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return .2126 * r + .7152 * g + .0722 * b;
    };
    const root = document.documentElement;
    const original = root.getAttribute('data-theme');
    const card = document.createElement('button');
    card.className = 'plan-item';
    card.dataset.done = 'true';
    document.body.append(card);
    try {
      return ['light', 'dark'].flatMap(theme => {
        root.dataset.theme = theme;
        const colors = getComputedStyle(root);
        const ratio = (left, right) => {
          const values = [left, right].map(name => luminance(colors.getPropertyValue(name))).sort((a, b) => b - a);
          return (values[0] + .05) / (values[1] + .05);
        };
        return [ratio('--bad', '--bad-bg'), ratio('--muted', '--paper'), ratio('--accent', '--paper'), Number(getComputedStyle(card).opacity) * 4.5];
      });
    } finally {
      card.remove();
      if (original === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', original);
    }
  });
  for (const contrast of contrasts) expect(contrast).toBeGreaterThanOrEqual(4.5);
});

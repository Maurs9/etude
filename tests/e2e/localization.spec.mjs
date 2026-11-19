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
  await page.locator('#nav [data-view=learn]').click();
  await page.evaluate(() => window.__etude.learnReady);
  const staff = await page.evaluate(() => {
    const html = window.__etude.lStaffHTML('n_clefs');
    const dynHtml = window.__etude.lStaffHTML('dyn2');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const svg = doc.querySelector('svg[role="group"]');
    return {
      html,
      dynHtml,
      svgLabel: svg?.getAttribute('aria-label') ?? '',
    };
  });
  expect(staff.html).toContain('Violinschlüssel');
  expect(staff.svgLabel).toContain('Violinschlüssel');
  expect(staff.dynHtml).toContain('aria-label="Akzent &gt;');
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

  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
    const button = document.createElement('button');
    button.id = 'test-primary-hover';
    button.className = 'btn primary';
    button.textContent = 'Start';
    button.style.transition = 'none';
    button.style.position = 'fixed';
    button.style.top = '12px';
    button.style.left = '12px';
    button.style.zIndex = '9999';
    document.body.append(button);
  });
  try {
    const primaryHover = page.locator('#test-primary-hover');
    const restBg = await primaryHover.evaluate(node => getComputedStyle(node).backgroundColor);
    await primaryHover.hover();
    const hoverColors = await primaryHover.evaluate(node => {
      const style = getComputedStyle(node);
      return { bg: style.backgroundColor, fg: style.color };
    });
    expect(hoverColors.bg).not.toBe(restBg);
    const hoverRatio = await page.evaluate(({ bg, fg }) => {
      const lum = rgb => {
        const ch = rgb.match(/\d+/g).slice(0, 3).map(Number).map(v => {
          const c = v / 255;
          return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
        });
        return .2126 * ch[0] + .7152 * ch[1] + .0722 * ch[2];
      };
      const [hi, lo] = [lum(bg), lum(fg)].sort((a, b) => b - a);
      return (hi + .05) / (lo + .05);
    }, hoverColors);
    expect(hoverRatio).toBeGreaterThanOrEqual(4.5);
  } finally {
    await page.evaluate(() => document.getElementById('test-primary-hover')?.remove());
  }
});

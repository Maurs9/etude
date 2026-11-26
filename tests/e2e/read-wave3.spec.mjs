import { test, expect } from '../helpers/fixtures.mjs';
import { STRINGS } from '../../src/locales/index.js';

const withBook = (bookState, prefs) => ({
  v: 3,
  lang: 'en',
  data: {
    reading: {
      book: { v: 2, level: 1, focusKey: null, pieces: {}, recent: {}, daily: null, days: [], ...bookState },
      ...(prefs ? { prefs } : {}),
    },
  },
});

test.describe('Wave 3: Read & play full-width staff, unified navigation & filtered drill grid', () => {
  test('unified 3-tab header supports keyboard navigation and Romanian labels', async ({ app, page }) => {
    await app.open({ hash: 'read', saved: { v: 3, lang: 'ro', data: {} } });
    await expect(page.locator('#rd-tabs')).toHaveAttribute('role', 'tablist');
    await expect(page.locator('#rd-tabs [role=tab]')).toHaveCount(3);
    await expect(page.locator('#rdt-book')).toContainText(STRINGS.ro.rdx_tab_book);
    await expect(page.locator('#rdt-drills')).toContainText(STRINGS.ro.rdx_tab_drills);
    await expect(page.locator('#rdt-pieces')).toContainText(STRINGS.ro.rdx_tab_pieces);
    await expect(page.locator('#rdn-more-h')).toHaveCount(0);
    await expect(page.locator('#rdn-home-back')).toHaveCount(0);

    await page.locator('#rdt-book').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#rdt-drills')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#rdp-drills')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#rdt-pieces')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#rdp-pieces')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#rdt-drills')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(page.locator('#rdt-book')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#rdn-home')).toBeVisible();
  });

  for (const [width, height] of [[1440, 900], [1180, 820]]) {
    test(`full-width stretched staff and Play button above fold at ${width}x${height}`, async ({ app, page }) => {
      await page.setViewportSize({ width, height });
      await app.open({ hash: 'read', saved: withBook({}, { stage: false }) });

      // 8-bar book piece fills wide workspace cleanly and keeps Start above fold
      await page.locator('#rdn-book-go').click();
      await expect(page.locator('#rd-staff .ss-n').first()).toBeVisible();
      const bookGeo = await page.evaluate(() => {
        const wrap = document.querySelector('#rd-staff');
        const go = document.querySelector('#rd-go');
        const svg = wrap.querySelector('svg');
        return {
          paperW: wrap.getBoundingClientRect().width,
          svgW: svg.getBoundingClientRect().width,
          goBottom: go.getBoundingClientRect().bottom,
          viewport: window.innerHeight,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      if (width >= 1440) expect(bookGeo.paperW).toBeGreaterThan(1120);
      expect(bookGeo.svgW / bookGeo.paperW).toBeGreaterThan(0.8);
      expect(bookGeo.goBottom).toBeLessThanOrEqual(height);
      expect(bookGeo.overflow).toBeLessThanOrEqual(0);

      // 4-bar single-system generated melody justifies across the paper width
      await page.locator('#rdn-back').click();
      await page.locator('#rdt-pieces').click();
      await page.locator('#rd-gen').click();
      await expect(page.locator('#rd-staff svg')).toHaveCount(1);
      const genGeo = await page.evaluate(() => {
        const wrap = document.querySelector('#rd-staff');
        const svg = wrap.querySelector('svg');
        const cs = getComputedStyle(wrap);
        const inner = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        return {
          systems: window.__etude.SR.render.systems.length,
          share: svg.getBoundingClientRect().width / inner,
          goBottom: document.querySelector('#rd-go').getBoundingClientRect().bottom,
        };
      });
      expect(genGeo.systems).toBe(1);
      expect(genGeo.share).toBeGreaterThanOrEqual(0.85);
      expect(genGeo.goBottom).toBeLessThanOrEqual(height);
    });
  }

  test('merged Today hero keeps Today set, Warm-up and Long piece without duplicate controls', async ({ app, page }) => {
    await app.open({ hash: 'read', saved: withBook({}) });
    await expect(page.locator('.rdn-today')).toHaveCount(1);
    await expect(page.locator('#rdn-long-go')).toHaveCount(0);
    await expect(page.locator('#rdn-all-drills')).toHaveCount(0);
    await expect(page.locator('#rdn-today-go')).toBeVisible();
    await expect(page.locator('#rdn-warm-go')).toBeVisible();
    await expect(page.locator('#rdn-plan-long')).toBeVisible();

    await page.locator('#rdn-warm-go').click();
    await expect(page.locator('#rdn-warm')).toBeVisible();
    await page.locator('#rdn-w-back').click();
    await expect(page.locator('#rdn-home')).toBeVisible();

    await page.locator('#rdn-plan-long').click();
    await expect(page.locator('#rdn-player-head')).toBeVisible();
    await page.locator('#rdn-back').click();

    await page.locator('#rdn-today-go').click();
    await expect(page.locator('#rdn-player-head')).toBeVisible();
  });

  test('reading drills use responsive CSS Grid, category filters, landmark quick-start and orchestral clefs toggle', async ({ app, page }) => {
    for (const [width, height] of [[1440, 900], [1180, 820], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await app.open({ hash: 'read' });
      await page.locator('#rdt-drills').click();

      const gridStyle = await page.locator('#rdx-ladder').evaluate((el) => ({
        display: getComputedStyle(el).display,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }));
      expect(gridStyle.display).toBe('grid');
      expect(gridStyle.overflow).toBeLessThanOrEqual(0);

      // Orchestral C-clefs hidden until toggled on
      await expect(page.locator('#rdx-ladder [data-lv="cc1"]')).toHaveCount(0);
      await page.locator('#rdx-show-orch').check();
      await expect(page.locator('#rdx-ladder [data-lv="cc1"]')).toBeVisible();
      await page.locator('#rdx-show-orch').uncheck();
      await expect(page.locator('#rdx-ladder [data-lv="cc1"]')).toHaveCount(0);

      // Category filters narrow units cleanly
      await page.locator('#rdx-filters [data-cat="harmony"]').click();
      await expect(page.locator('#rdx-ladder [data-lv="iv1"]')).toBeVisible();
      await expect(page.locator('#rdx-ladder [data-lv="tr1"]')).toHaveCount(0);
      await page.locator('#rdx-filters [data-cat="rhythm"]').click();
      await expect(page.locator('#rdx-ladder [data-lv="rh1"]')).toBeVisible();
      await expect(page.locator('#rdx-ladder [data-lv="iv1"]')).toHaveCount(0);
      await page.locator('#rdx-filters [data-cat="all"]').click();
      await expect(page.locator('#rdx-ladder [data-lv="tr1"]')).toBeVisible();
    }

    // Beginner landmark quick-start opens Treble clef 1 directly
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#rdx-land-btn').click();
    await expect(page.locator('#rdx-stage')).toBeVisible();
    expect(await page.evaluate(() => window.__etude.RD.L.id)).toBe('tr1');
  });
});

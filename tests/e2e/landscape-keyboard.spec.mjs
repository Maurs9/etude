import { test, expect } from '../helpers/fixtures.mjs';

// A phone on its side (Pixel-class Android, Chrome, 915 × 412 CSS px) with the keyboard dock open on Explore.
const geometry = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => {
  const box = el => el.getBoundingClientRect(), shown = el => !!el && getComputedStyle(el).display !== 'none' && box(el).height > 0;
  const dock = document.getElementById('dock'), whites = [...document.querySelectorAll('#keys .white')];
  const bar = document.querySelector('header .bar');
  done({
    header: shown(bar) ? Math.round(box(bar).height) : 0,
    bottomNav: shown(document.getElementById('bottomNav')),
    bottomNavH: shown(document.getElementById('bottomNav')) ? Math.round(box(document.getElementById('bottomNav')).height) : 0,
    whites: whites.length,
    whiteW: Math.round(box(whites[0]).width),
    keysH: Math.round(box(document.getElementById('keys')).height),
    dockTop: Math.round(box(dock).top),
    dockBottom: Math.round(box(dock).bottom),
    dockH: Math.round(box(dock).height),
    dockVar: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock-h')),
    hdrVar: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hdr-h')),
    overflow: document.documentElement.scrollWidth - innerWidth,
    keysScroll: document.getElementById('dock-keys').scrollWidth - document.getElementById('dock-keys').clientWidth,
  });
}))));

// --dock-h is measured after layout settles (ResizeObserver, then a frame): wait for it to match the dock and the bar.
const settled = async page => {
  await expect.poll(async () => { const g = await geometry(page); return g.dockVar - g.dockH - g.bottomNavH; }).toBe(0);
  return geometry(page);
};

test.describe('landscape phone keyboard (915 × 412)', () => {
  test('the open keys get the height and three octaves, and the header steps aside', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 915, height: 412 });
    await app.open({ hash: 'explore', dock: true });
    await expect(page.locator('#dock')).not.toHaveClass(/\bis-rail\b/);
    const g = await settled(page);
    expect(g.header).toBe(0);
    expect(g.hdrVar).toBe(0);
    expect(g.bottomNav).toBe(false);
    expect(g.whites).toBe(22); // three octaves, C to C
    expect(g.whiteW).toBeGreaterThanOrEqual(38);
    expect(g.keysH).toBeGreaterThanOrEqual(120);
    expect(g.dockBottom).toBe(412);
    expect(g.dockTop).toBeGreaterThanOrEqual(412 / 2); // the page keeps at least half the screen
    expect(g.overflow).toBeLessThanOrEqual(0);
    expect(g.keysScroll).toBeLessThanOrEqual(1); // the three octaves fit without sideways scrolling
  });

  test('hiding the keys brings the header back, and showing them hides it again', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 915, height: 412 });
    await app.open({ hash: 'explore', dock: true });
    await page.locator('#dock-kb-toggle').click();
    await expect(page.locator('#dock')).toHaveClass(/\bis-rail\b/);
    let g = await settled(page);
    expect(g.header).toBeGreaterThan(30);
    expect(g.hdrVar).toBeGreaterThanOrEqual(g.header); // the header box, which also holds the (empty) status region
    await page.locator('#dock-kb-toggle').click();
    await expect(page.locator('#dock')).not.toHaveClass(/\bis-rail\b/);
    g = await settled(page);
    expect(g.header).toBe(0);
    expect(g.hdrVar).toBe(0);
    await expect(page.locator('#dock-kb-toggle')).toBeFocused();
  });

  test('turning the phone upright restores the portrait layout', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 915, height: 412 });
    await app.open({ hash: 'explore', dock: true });
    expect((await settled(page)).header).toBe(0);
    await page.setViewportSize({ width: 412, height: 915 });
    await expect.poll(async () => (await geometry(page)).whites).toBe(15); // two octaves on a portrait phone, as before
    const g = await settled(page);
    expect(g.header).toBeGreaterThan(30);
    expect(g.bottomNav).toBe(true);
    expect(g.keysH).toBe(126); // the phone size from etude.css
  });

  test('a short desktop window that is not a phone keeps its header', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 1280, height: 700 });
    await app.open({ hash: 'explore', dock: true });
    const g = await settled(page);
    expect(g.header).toBeGreaterThan(30);
    expect(g.whites).toBe(29);
    expect(g.keysH).toBe(152);
  });
});

// A key-to-staff drill opens the keys and hides Hide keyboard while it runs (dockForced).
test.describe('landscape phone keyboard: a drill that asks on the keys', () => {
  const startKeyToStaff = (page, stage) => page.evaluate(stage => {
    const e = window.__etude, level = Object.values(e.RD_LV).find(l => l.ty === 'k2s' && l.clef === 'treble');
    e.rdData().prefs.stage = stage;
    e.rdOpen(level);
    e.rdStart('practice');
  }, stage);

  for (const pref of [false, true]) {
    test(`without the full-screen stage the header stays (keys ${pref ? 'open' : 'folded'} before)`, async ({ app }) => {
      const page = app.page;
      await page.setViewportSize({ width: 915, height: 412 });
      await app.open({ hash: 'read', dock: pref });
      await startKeyToStaff(page, false);
      await expect(page.locator('#dock')).not.toHaveClass(/\bis-rail\b/);
      await expect(page.locator('#dock-kb-toggle')).toBeHidden();
      const g = await settled(page);
      expect(g.header).toBeGreaterThan(30); // with Hide keyboard gone, the header is the way to the other views
      expect(g.hdrVar).toBeGreaterThanOrEqual(g.header);
      expect(g.keysH).toBeGreaterThanOrEqual(120); // the keys keep their landscape height
      await page.locator('#rdx-end').click();
      await expect(page.locator('#dock-kb-toggle')).toBeVisible();
      const after = (await settled(page)).header; // back to the saved choice: open keys fold the header, the rail shows it
      if (pref) expect(after).toBe(0);
      else expect(after).toBeGreaterThan(30);
    });
  }

  test('on the full-screen stage the header stays folded, and End leaves', async ({ app }) => {
    const page = app.page;
    await page.setViewportSize({ width: 915, height: 412 });
    await app.open({ hash: 'read', dock: false });
    await startKeyToStaff(page, true);
    await expect(page.locator('body')).toHaveAttribute('data-stage', 'immersive');
    const g = await settled(page);
    expect(g.header).toBe(0);
    await expect(page.locator('#rdx-end')).toBeVisible();
  });
});

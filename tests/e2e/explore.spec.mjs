import { test, expect } from '../helpers/fixtures.mjs';

// Explore is one screen: the circle of fifths picks the key, beside (wide) or below (narrow) what you hold and the staff.
const box = (page, sel) => page.locator(sel).evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; });
const hold = (page, notes) => page.evaluate(notes => { const e = window.__etude; e.held.clear(); notes.forEach(m => e.held.add(m)); e.updateExplore(); }, notes);

test('1280×800 with the keys open: the circle and the staff are both fully on screen, with no tabs', async ({ app, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await app.open({ hash: 'explore', dock: true });
  await expect(page.locator('#view-explore [role="tablist"], #view-explore [role="tab"]')).toHaveCount(0);
  await expect(page.locator('#circle .cof-svg')).toBeVisible();
  await expect.poll(async () => {
    const header = await box(page, 'header'), dock = await box(page, '#dock'), circle = await box(page, '#circle'), staff = await box(page, '#ex-staff');
    return [circle, staff].every(r => r.height > 100 && r.top >= header.bottom - 1 && r.bottom <= dock.top + 1);
  }).toBe(true);
  // Side by side: the circle on the left, the staff on the right.
  expect((await box(page, '#circle')).right).toBeLessThanOrEqual((await box(page, '#ex-staff')).left);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('picking a key on the circle sets the key context, and the Roman numerals and the staff read in it', async ({ app, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await app.open({ hash: 'explore', dock: true });
  await hold(page, [57, 61, 64]);                                         // A major
  await expect(page.locator('#ro-roman')).toHaveText('—');
  await expect(page.locator('#circle #cof-now')).toHaveAttribute('data-at', 'maj3');   // held chord shown on its wedge

  await page.locator('#circle .cof-k[data-ring="maj"][data-i="2"]').click();       // D major
  await expect(page.locator('#keyCtx')).toHaveValue('2');
  await expect(page.locator('#circle .cof-k.on')).toHaveAttribute('data-i', '2');
  await expect(page.locator('#ro-roman')).toHaveText('V');
  await expect(page.locator('#cof-key')).toHaveText('D major');
  // The staff carries D major's two sharps, so F♯ needs no accidental and F natural shows a natural.
  await expect(page.locator('#ex-staff .ex-keysig')).toHaveCount(2);
  for (const sig of await page.locator('#ex-staff .ex-keysig').all()) await expect(sig.locator('.ss-glyph')).toHaveCount(2);
  await hold(page, [66]);
  await expect(page.locator('#ex-staff .ss-n[data-midi="66"][data-clef="treble"] .ss-glyph')).toHaveCount(0);
  await hold(page, [65]);
  await expect(page.locator('#ex-staff .ss-n[data-midi="65"][data-clef="treble"] .ss-glyph')).toHaveCount(1);

  // A minor key from the inner ring reads in minor.
  await page.locator('#circle .cof-k[data-ring="min"][data-i="0"]').click();       // A minor
  await expect(page.locator('#keyCtx')).toHaveValue('m9');
  await hold(page, [64, 68, 71]);
  await expect(page.locator('#ro-roman')).toHaveText('V');
  await hold(page, [57, 60, 64]);
  await expect(page.locator('#ro-roman')).toHaveText('i');
  await hold(page, [68, 71, 74]);                                         // G♯ diminished: the leading-tone chord
  await expect(page.locator('#ro-roman')).toHaveText('vii°');
  await hold(page, [67, 71, 74]);                                         // G major: the natural seventh
  await expect(page.locator('#ro-roman')).toHaveText('VII');
  await hold(page, [57, 60, 64]);
  await expect(page.locator('#circle #cof-now')).toHaveAttribute('data-at', 'min0');

  // The select drives the circle back, and "none" clears both.
  await page.locator('#keyCtx').selectOption('7');
  await expect(page.locator('#circle .cof-k.on')).toHaveAttribute('data-i', '1');
  await expect(page.locator('#cof-key')).toHaveText('G major');
  await page.locator('#keyCtx').selectOption('-1');
  await expect(page.locator('#circle .cof-k.on')).toHaveCount(0);
  await expect(page.locator('#ro-roman')).toHaveText('—');
  await expect(page.locator('#ex-staff .ex-keysig')).toHaveCount(0);
});

for (const width of [390, 360]) {
  test(`${width}px phone: one column in reading order, no sideways scroll, thumb-sized controls`, async ({ app, page }) => {
    await page.setViewportSize({ width, height: 844 });
    await app.open({ hash: 'explore' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const order = [];
    for (const sel of ['.readout', '#ex-staff', '#circle', '#cof-info', '#ex-ref']) order.push((await box(page, sel)).top);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const sel of ['#cof-mode button', '#cof-play', '#refPlay', '#refShow', '#keyCtx', '#refType']) {
      for (const el of await page.locator(sel).all()) expect((await el.boundingBox()).height, sel).toBeGreaterThanOrEqual(44);
    }
  });
}

test('the Learn link that opened the old circle tab lands on Explore with the circle in view', async ({ app, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await app.open({ hash: 'learn' });
  await expect(page.locator('#learnBody .learn-content')).not.toBeEmpty();
  // The same link the circle-of-fifths lesson carries ("Explore › Circle of fifths").
  await page.evaluate(() => { const a = document.createElement('a'); a.href = '#'; a.id = 'go-circle'; a.dataset.go = 'explore'; a.dataset.extab = 'circle'; a.textContent = 'Circle'; document.querySelector('#learnBody .learn-content').prepend(a); });
  await page.locator('#go-circle').click();
  await expect(page.locator('#view-explore')).toHaveClass(/active/);
  await expect.poll(async () => {
    const circle = await box(page, '#circle'), bar = await box(page, '#bottomNav');
    return circle.top >= 0 && circle.top < bar.top;
  }).toBe(true);
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('#circle .cof-k'))).toBe(true);
});

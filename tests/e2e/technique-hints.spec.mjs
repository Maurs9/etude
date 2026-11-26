import { test, expect } from '../helpers/fixtures.mjs';

test('technique mode shares the unified dual-color scale and arpeggio keyboard hints', async ({ app }) => {
  const page = await app.open({ hash: 'practice', dock: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#pr-t-scale').click();
  await page.locator('#pr-mode button[data-v="tech"]').click();
  await page.locator('#pr-songs summary').click();
  const list = page.locator('#practiceHintsList');
  await expect(list.locator('.pr-family-tab')).toHaveCount(6);
  await expect(list.locator('.pr-hand-pill-rh')).toBeVisible();
  await expect(list.locator('.pr-hand-pill-lh')).toBeVisible();
  await expect(list.locator('[data-hint="Major (Ionian)"] .pr-chord-keyboard-dual')).toBeVisible();

  // Switch to Arpeggios tab and verify RH/LH dual-color badges update when changing tonic (C -> D).
  await list.locator('[data-hint-family="arpeggios"]').click();
  const arpeggio = list.locator('[data-hint="arpMajor"]');
  await expect(arpeggio.locator('.pr-hint-key-finger-rh')).toHaveText(['1', '2', '3', '5']);
  await expect(arpeggio.locator('.pr-hint-key-finger-lh')).toHaveText(['5', '4', '2', '1']);
  const rhFill = await arpeggio.locator('.pr-hint-badge-rh').first().evaluate(el => getComputedStyle(el).fill);
  const lhFill = await arpeggio.locator('.pr-hint-badge-lh').first().evaluate(el => getComputedStyle(el).fill);
  expect(rhFill).not.toBe(lhFill);

  await page.locator('#pr-keys [data-v="2"]').click();
  const dLhByMidi = await arpeggio.locator('[data-chord-midi]').evaluateAll(els =>
    els.sort((a, b) => Number(a.dataset.chordMidi) - Number(b.dataset.chordMidi))
      .map(el => el.querySelector('.pr-hint-key-finger-lh')?.textContent));
  expect(dLhByMidi).toEqual(['5', '3', '2', '1']);
  expect(await list.evaluate(box => box.scrollWidth <= box.clientWidth)).toBe(true);

  const play = arpeggio.getByRole('button', { name: /^Listen\b/ });
  await play.click();
  await expect(arpeggio.locator('.pr-chord-sounding')).toHaveCount(1);
  await page.locator('#pr-songs summary').click();
  await expect(arpeggio.locator('.pr-chord-sounding')).toHaveCount(0);
});

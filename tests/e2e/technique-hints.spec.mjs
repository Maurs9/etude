import { test, expect } from '../helpers/fixtures.mjs';

test('scale and arpeggio cards show the fingerings for each hand and track the hand being played', async ({ app }) => {
  const page = await app.open({ hash: 'practice', dock: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#pr-t-scale').click();
  await page.locator('#pr-mode button[data-v="tech"]').click();
  await page.locator('#pr-songs summary').click();
  const list = page.locator('#practiceHintsList');
  await expect(list.getByRole('heading', { level: 2 })).toHaveText(['Scales', 'Arpeggios']);
  await expect(list.getByRole('img')).toHaveCount(12);
  const arpeggio = list.locator('[data-hint="arp_major"]');
  const right = arpeggio.locator('.pr-hint-hand').filter({ has: page.getByRole('heading', { name: 'Right hand' }) });
  const left = arpeggio.locator('.pr-hint-hand').filter({ has: page.getByRole('heading', { name: 'Left hand' }) });
  await expect(right.locator('.pr-hint-key-finger')).toHaveText(['1', '2', '3', '5']);
  await expect(left.locator('.pr-hint-key-finger')).toHaveText(['5', '4', '2', '1']);
  await expect(right.getByRole('button')).toHaveAccessibleName(/^Listen\b/);
  await page.locator('#pr-keys [data-v="2"]').click();
  await expect(left.locator('[data-chord-midi="54"] .pr-hint-key-finger')).toHaveText('3');
  expect(await list.evaluate(box => box.scrollWidth <= box.clientWidth)).toBe(true);

  await left.getByRole('button').click();
  await expect(left.locator('.pr-chord-sounding')).toHaveCount(1);
  await expect(right.locator('.pr-chord-sounding')).toHaveCount(0);
  await right.getByRole('button').click();
  await expect(right.locator('.pr-chord-sounding')).toHaveCount(1);
  await expect(left.locator('.pr-chord-sounding')).toHaveCount(0);
  await page.locator('#pr-songs summary').click();
  await expect(arpeggio.locator('.pr-chord-sounding')).toHaveCount(0);
});

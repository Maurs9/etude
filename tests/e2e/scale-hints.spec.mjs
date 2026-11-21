import { test, expect } from '../helpers/fixtures.mjs';

test('scale cards show a transposable keyboard and follow playback without opening the dock', async ({ app }) => {
  const page = await app.open({ hash: 'practice', dock: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#pr-t-scale').click();
  await page.locator('#pr-mode button[data-v="ear"]').click();
  await page.locator('#pr-songs summary').click();
  const list = page.locator('#practiceHintsList');
  await expect(list.getByRole('heading', { level: 2 })).toHaveCount(4);
  await expect(list.getByRole('img')).toHaveCount(19);
  const card = list.locator('[data-hint="Dorian"]');
  await expect(card.getByRole('img')).toHaveAttribute('aria-label', /Dorian with C · D · E♭ · F · G · A · B♭ · C/);
  await expect(card.locator('.pr-chord-root')).toHaveCount(2);
  await page.locator('#pr-keys [data-v="2"]').click();
  await expect(card.getByRole('img')).toHaveAttribute('aria-label', /Dorian with D · E · F · G · A · B · C · D/);
  expect(await list.evaluate(box => box.scrollWidth <= box.clientWidth)).toBe(true);

  await card.getByRole('button', { name: /^Listen\b/ }).click();
  await expect(card.locator('.pr-chord-sounding')).toHaveCount(1);
  await expect(card.getByRole('img')).toHaveAttribute('aria-label', /Natural minor.*with D · E · F · G · A · B♭ · C · D/i);
  await expect(page.locator('[data-pr-hint-key]')).toHaveCount(0);
  await page.locator('#pr-songs summary').click();
  await expect(card.locator('.pr-chord-sounding')).toHaveCount(0);
});

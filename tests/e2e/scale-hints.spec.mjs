import { test, expect } from '../helpers/fixtures.mjs';

test('scale cards show a transposable keyboard, play single scales, and animate explicit comparisons without opening the dock', async ({ app }) => {
  const page = await app.open({ hash: 'practice', dock: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#pr-t-scale').click();
  await page.locator('#pr-mode button[data-v="ear"]').click();
  await page.locator('#pr-songs summary').click();
  const list = page.locator('#practiceHintsList');
  await expect(list.getByRole('heading', { level: 2 })).toHaveCount(4);
  await expect(list.getByRole('img')).toHaveCount(19);
  const card = list.locator('[data-hint="Dorian"]');
  await expect(card.getByRole('button', { name: /Show keys/ })).toHaveCount(0);
  await expect(card.getByRole('img')).toHaveAttribute('aria-label', /Dorian with C · D · E♭ · F · G · A · B♭ · C/);
  await expect(card.locator('.pr-chord-root')).toHaveCount(2);
  await page.locator('#pr-keys [data-v="2"]').click();
  await expect(card.getByRole('img')).toHaveAttribute('aria-label', /Dorian with D · E · F · G · A · B · C · D/);
  expect(await list.evaluate(box => box.scrollWidth <= box.clientWidth)).toBe(true);

  await page.evaluate(() => {
    window.__scaleAudio = [];
    window.__etude.previewNote = midi => window.__scaleAudio.push(midi);
  });
  const play = card.getByRole('button', { name: /^Listen\b/ });
  await play.click();
  await expect.poll(() => page.evaluate(() => window.__scaleAudio)).toEqual([62, 64, 65, 67, 69, 71, 72, 74]);
  await expect(card.locator('.pr-chord-sounding')).toHaveCount(1);
  await expect(card.locator('.pr-compare-badge')).toBeHidden();
  await expect(card.getByRole('img')).toHaveAttribute('aria-label', /Dorian with D · E · F · G · A · B · C · D/);
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await expect(card.locator('.pr-chord-sounding')).toHaveCount(0);

  await card.getByRole('button', { name: /^Compare with/ }).click();
  await expect(card.locator('.pr-compare-badge')).toBeVisible();
  await expect(card.locator('.pr-chord-sounding')).toHaveCount(1);
  await expect(card.getByRole('img')).toHaveAttribute('aria-label', /Natural minor.*with D · E · F · G · A · B♭ · C · D/i);
  await expect(page.locator('[data-pr-hint-key]')).toHaveCount(0);
  await page.locator('#pr-songs summary').click();
  await expect(card.locator('.pr-chord-sounding')).toHaveCount(0);
  await expect(card.locator('.pr-compare-badge')).toBeHidden();
});

import { test, expect } from '../helpers/fixtures.mjs';

test('melody examples play by ear and reveal their transposed notes separately', async ({ app }) => {
  const page = await app.open({ hash: 'practice', dock: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#pr-t-melody').click();
  await page.locator('#pr-songs summary').click();
  const list = page.locator('#practiceHintsList');
  await expect(list.getByRole('heading', { level: 3 })).toHaveText(['Example 1', 'Example 2', 'Example 3']);
  await expect(list.getByRole('img')).toHaveCount(0);
  await page.evaluate(() => {
    window.__hintMelody = [];
    window.__etude.previewNote = midi => window.__hintMelody.push(midi);
  });
  const rising = list.locator('[data-hint="rising"]');
  const listen = rising.getByRole('button', { name: /^Listen\b/ });
  const toggle = rising.locator('button[aria-controls]');
  await listen.click();
  await expect.poll(() => page.evaluate(() => window.__hintMelody)).toEqual([60, 62, 64, 67]);
  await expect(list.getByRole('img')).toHaveCount(0);
  await expect(page.locator('[data-pr-hint-key]')).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveText('Hide notes');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(rising.getByRole('img')).toHaveAttribute('aria-label', /Treble clef · Example 1 · C · D · E · G/);
  await expect(rising.locator('.ss-n')).toHaveCount(4);
  await listen.click();
  await expect(rising.locator('.ss-n[data-s="now"]')).toHaveCount(1);
  await toggle.click();
  await expect(rising.getByRole('img')).toHaveCount(0);
  await expect(toggle).toHaveText('Show notes');

  await page.locator('#pr-keys [data-v="2"]').click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(rising.getByRole('img')).toHaveAttribute('aria-label', /Treble clef · Example 1 · D · E · F♯ · A/);
  expect(await list.evaluate(box => box.scrollWidth <= box.clientWidth)).toBe(true);
});

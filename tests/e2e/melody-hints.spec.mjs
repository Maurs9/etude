import { test, expect } from '../helpers/fixtures.mjs';

test('melody hints show 3-step guide, difficulty tabs, live contour, and reveal keys + staff on demand', async ({ app }) => {
  const page = await app.open({ hash: 'practice', dock: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#pr-t-melody').click();
  await page.locator('#pr-songs summary').click();
  const list = page.locator('#practiceHintsList');
  await expect(list.locator('.pr-melody-step')).toHaveCount(3);
  await expect(list.locator('.pr-family-tab')).toHaveCount(4);
  await expect(list.locator('[data-hint]')).toHaveCount(2);

  await page.evaluate(() => {
    window.__hintMelody = [];
    window.__etude.previewNote = midi => window.__hintMelody.push(midi);
  });
  const rising = list.locator('[data-hint="rising"]');
  const listen = rising.getByRole('button', { name: /^Listen\b/ });
  const toggle = rising.locator('button[aria-controls]');
  await expect(rising.locator('.pr-melody-contour')).toBeVisible();
  await expect(rising.locator('.pr-melody-deg')).toHaveText(['1', '2', '3', '5']);
  await expect(rising.locator('.pr-melody-answer')).toBeHidden();

  await listen.click();
  await expect.poll(() => page.evaluate(() => window.__hintMelody)).toEqual([60, 62, 64, 67]);
  await expect(listen).toHaveAttribute('aria-pressed', 'true');
  await expect(rising.locator('.pr-melody-answer')).toBeHidden();
  await expect(page.locator('[data-pr-hint-key]')).toHaveCount(0);
  await listen.click();
  await expect(listen).toHaveAttribute('aria-pressed', 'false');

  await toggle.click();
  await expect(toggle).toHaveText('Hide keys & staff');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(rising.locator('.pr-melody-answer .pr-chord-keyboard')).toBeVisible();
  await expect(rising.locator('.pr-melody-staff-wrap svg')).toHaveAttribute('aria-label', /Treble clef · Stepwise ascent · C · D · E · G/);
  await expect(rising.locator('.ss-n')).toHaveCount(4);
  await listen.click();
  await expect(rising.locator('.ss-n[data-s="now"]')).toHaveCount(1);
  await toggle.click();
  await expect(rising.locator('.pr-melody-answer')).toBeHidden();
  await expect(toggle).toHaveText('Show keys & staff');

  await page.locator('#pr-keys [data-v="2"]').click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(rising.locator('.pr-melody-staff-wrap svg')).toHaveAttribute('aria-label', /Treble clef · Stepwise ascent · D · E · F♯ · A/);

  await list.locator('[data-hint-family="all"]').click();
  await expect(list.locator('[data-hint]')).toHaveCount(6);
  expect(await list.evaluate(box => box.scrollWidth <= box.clientWidth)).toBe(true);
});

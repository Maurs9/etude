import { test, expect } from '../helpers/fixtures.mjs';

test('scale studio groups scales by musical family, shows transposable RH/LH fingerings, compares two scales, and plays without opening the dock', async ({ app }) => {
  const page = await app.open({ hash: 'practice', dock: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#pr-t-scale').click();
  await page.locator('#pr-mode button[data-v="ear"]').click();
  await page.locator('#pr-songs summary').click();
  const list = page.locator('#practiceHintsList');
  await expect(list.getByRole('heading', { level: 2 })).toHaveText([
    'Major and bright', 'Minor and dark', 'Exotic and symmetrical',
  ]);
  await expect(list.locator('[data-hint-pick]')).toHaveCount(19);
  await expect(list.locator('[data-hint]')).toHaveCount(1);
  await expect(list.locator('.pr-hint-cue')).toHaveCount(0);
  await expect(list.locator('.pr-hint-reference')).toHaveCount(0);

  const major = list.locator('[data-hint="Major (Ionian)"]');
  await expect(major.locator('.pr-hint-key-finger')).toHaveText(['1', '2', '3', '1', '2', '3', '4', '5']);
  await major.getByRole('button', { name: /^Left hand/ }).click();
  await expect(major.locator('.pr-hint-key-finger')).toHaveText(['5', '4', '3', '2', '1', '3', '2', '1']);

  await list.locator('[data-hint-pick="Dorian"]').click();
  const card = list.locator('[data-hint="Dorian"]');
  await expect(card.getByRole('button', { name: /Show keys/ })).toHaveCount(0);
  await expect(card.getByRole('img')).toHaveAttribute('aria-label', /Dorian.*with C · D · E♭ · F · G · A · B♭ · C/);
  await expect(card.locator('.pr-chord-root')).toHaveCount(2);
  await expect(card.locator('.pr-hint-key-finger')).toHaveCount(8);

  await page.locator('#pr-keys [data-v="2"]').click();
  await expect(card.getByRole('img')).toHaveAttribute('aria-label', /Dorian.*with D · E · F · G · A · B · C · D/);
  expect(await list.evaluate(box => box.scrollWidth <= box.clientWidth)).toBe(true);

  await page.evaluate(() => {
    window.__scaleAudio = [];
    window.__etude.previewNote = midi => window.__scaleAudio.push(midi);
  });
  const play = card.getByRole('button', { name: /^Listen\b/ });
  await play.click();
  await expect.poll(() => page.evaluate(() => window.__scaleAudio)).toEqual([62, 64, 65, 67, 69, 71, 72, 74]);
  await expect(card.locator('.pr-chord-sounding')).toHaveCount(1);
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await expect(card.locator('.pr-chord-sounding')).toHaveCount(0);
  await expect(page.locator('[data-pr-hint-key]')).toHaveCount(0);

  // Compare 2 scales side by side
  await list.locator('[data-hint-control="scale:compare"]').click();
  await expect(list.locator('[data-hint]')).toHaveCount(2);
  await expect(list.locator('.pr-studio-diff')).toContainText('A only: B');
  await expect(list.locator('.pr-studio-diff')).toContainText('B only: B♭');
  await list.locator('[data-hint-control="scale:compare:close"]').click();
  await expect(list.locator('[data-hint]')).toHaveCount(1);
});

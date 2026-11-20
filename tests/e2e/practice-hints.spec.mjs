import { test, expect } from '../helpers/fixtures.mjs';

const hint = (page, name) => page.locator('#practiceHintsList [data-hint]').filter({ has: page.getByRole('heading', { name }) });

test('switching topics keeps the panel open and shows each reference hint', async ({ app }) => {
  const page = await app.open({ hash: 'practice' });
  const panel = page.locator('#pr-songs');
  await page.locator('#pr-t-chord').click();
  await expect(panel).not.toHaveAttribute('open', '');
  await expect(page.locator('#practiceHintsList')).toBeEmpty();
  await panel.locator('summary').click();
  await expect(hint(page, /Cmaj7/)).toContainText('1 3 5 7');
  await page.locator('#pr-t-scale').click();
  await expect(hint(page, /Dorian/)).toContainText('1 2 ♭3 4 5 6 ♭7');
  await page.locator('#pr-t-prog').click();
  await expect(hint(page, /Jazz cadence/)).toContainText('Dm7 – G7 – Cmaj7');
  await page.locator('#pr-t-technique').click();
  await expect(hint(page, /shared fingering/)).toContainText('E(3) · F(1)');
  await page.locator('#pr-t-melody').click();
  await expect(page.locator('#practiceHintsList')).toContainText('Hum the first two or three notes.');
  await expect(panel).toHaveAttribute('open', '');
});

test('by-ear hints play without key marks and can show them on demand', async ({ app }) => {
  const page = await app.open({ hash: 'practice', dock: false });
  await page.locator('#pr-t-chord').click();
  await page.locator('#pr-mode button[data-v="ear"]').click();
  await page.locator('#pr-songs summary').click();
  await page.evaluate(() => {
    window.__hintAudio = [];
    window.__etude.previewNote = (midi, at, seconds) => window.__hintAudio.push({ midi, at, seconds });
  });
  const card = hint(page, /Cmaj7/);
  await card.getByRole('button', { name: /Hear the hint/ }).click();
  await expect.poll(() => page.evaluate(() => window.__hintAudio.map(event => event.midi))).toEqual([
    60, 64, 67, 71, 60, 64, 67, 71, 60, 64, 67, 70, 60, 64, 67, 70,
  ]);
  const keys = page.locator('[data-pr-hint-key]');
  await expect(keys).toHaveCount(0);
  await card.getByRole('button', { name: /Show keys/ }).click();
  await expect(keys.first()).toBeVisible();
  await page.locator('#dock-kb-toggle').click();
  await expect(keys).toHaveCount(0);
  await card.getByRole('button', { name: /Show keys/ }).click();
  await expect(keys.first()).toBeVisible();
  await page.locator('#pr-t-scale').click();
  await expect(keys).toHaveCount(0);
  await expect(page.locator('#pr-songs')).toHaveAttribute('open', '');
});

test('accompaniment owns progression playback while the loop is running', async ({ app }) => {
  const page = await app.open({ hash: 'practice' });
  await page.locator('#pr-t-prog').click();
  await page.locator('#pr-songs summary').click();
  await page.locator('#pr-mode button[data-v="along"]').click();
  const play = hint(page, /Jazz cadence/).getByRole('button', { name: /Hear the hint/ });
  await expect(play).toBeEnabled();
  await page.locator('#pr-start').click();
  await expect(play).toBeDisabled();
  await page.locator('#pr-start').click();
  await expect(play).toBeEnabled();
});

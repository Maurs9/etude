import { test, expect } from '../helpers/fixtures.mjs';

test('progressions use style tabs, clickable chord steps with integrated keyboard, and follow playback', async ({ app }) => {
  const page = await app.open({ hash: 'practice', dock: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#pr-t-prog').click();
  await page.locator('#pr-mode button[data-v="ear"]').click();
  await page.locator('#pr-songs summary').click();
  const list = page.locator('#practiceHintsList');
  await expect(list.locator('.pr-family-tab')).toHaveCount(4);
  await expect(list.getByRole('heading', { level: 2 })).toHaveText(['Pop & Rock']);
  const pop = list.locator('[data-hint="I–V–vi–IV (pop)"]');
  await expect(pop.locator('.pr-progression-degree')).toHaveText(['I', 'V', 'vi', 'IV']);
  await expect(pop.locator('.pr-progression-name')).toHaveText(['C', 'G', 'Am', 'F']);
  await expect(pop.locator('.pr-chord-keyboard')).toBeVisible();

  // Clicking a chord step updates the active button and integrated keyboard.
  const secondStep = pop.locator('.pr-progression-chord-btn').nth(1);
  await secondStep.click();
  await expect(secondStep).toHaveAttribute('aria-pressed', 'true');
  await expect(pop.locator('.pr-chord-keyboard')).toHaveAttribute('aria-label', /V G/);

  await page.locator('#pr-keys [data-v="2"]').click();
  await expect(pop.locator('.pr-progression-name')).toHaveText(['D', 'A', 'Bm', 'G']);
  expect(await list.evaluate(box => box.scrollWidth <= box.clientWidth)).toBe(true);

  await pop.getByRole('button', { name: /^Listen\b/ }).click();
  const playing = pop.locator('[aria-current="step"] .pr-progression-name');
  await expect(playing).toHaveText('D');
  await expect(playing).toHaveText('A');
  await expect(page.locator('[data-pr-hint-key]')).toHaveCount(0);

  await list.locator('[data-hint-family="jazz"]').click();
  await expect(list.locator('[data-hint="12-bar blues"] li')).toHaveCount(12);
  await page.locator('#pr-songs summary').click();
  await expect(playing).toHaveCount(0);
});

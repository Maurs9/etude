import { test, expect } from '../helpers/fixtures.mjs';

// Learn has no locked units: a new user can open any lesson, in any order.
test('a new user can open a lesson in the last unit and no lesson is locked', async ({ app }) => {
  const page = await app.open({ hash: 'learn' });
  const lessons = page.locator('#learnToc button[data-li]');
  await expect(lessons.first()).toBeVisible();
  const count = await lessons.count();
  expect(count).toBeGreaterThan(10);
  await expect(page.locator('#learnToc [data-locked], #learnToc .lu-h [role="img"]')).toHaveCount(0);

  await lessons.nth(count - 1).click();
  await expect(lessons.nth(count - 1)).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#learnBody .learn-content')).not.toBeEmpty();
  await expect(page.locator('#learnBody .lu-lock, #learnBody [data-ln="unlock"]')).toHaveCount(0);
  // the unit's matching reading drill is offered right away
  await expect(page.locator('#learnBody .lu-bar')).toBeVisible();
});

test('Learn Circle of Fifths widget renders compact staff, enharmonic 30-key toggles, and relative minor mode', async ({ app }) => {
  const page = await app.open({ hash: 'learn', lang: 'ro' });
  await page.locator('#settingsBtn').click();
  await page.locator('#set-notation [data-v="solfege"]').click();
  await page.keyboard.press('Escape');

  await page.locator('#learnToc button[data-li]', { hasText: 'Cercul cvintelor' }).click();
  const cof = page.locator('[data-widget="cof"]');
  await expect(cof).toBeVisible();

  await expect(cof.locator('[data-w="cof"][data-k="6"]')).toContainText('Fa♯/Sol♭');
  await expect(cof.locator('[data-w="cof"][data-k="6"]')).toContainText('Re♯/Mi♭m');

  await expect(cof.locator('.lw-staff .ss-num')).toHaveCount(0);
  const overflow = await cof.locator('.lw-staff').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  const info = cof.locator('.lw-cof-info');
  await expect(info).toContainText('Do major');
  await cof.locator('[data-w="cofmin"]').click();
  await expect(info).toContainText('La minor');
  await expect(info).toContainText('Relativa majoră: Do major');
  await cof.locator('[data-w="cofmin"]').click();
  await expect(info).toContainText('Do major');

  await cof.locator('[data-w="cof"][data-k="5"]').click();
  await cof.locator('[data-w="cofenh"]').click();
  await expect(info).toContainText('Do♭ major');
  await expect(info).toContainText('7 bemol(i):');

  await cof.locator('[data-w="cof"][data-k="6"]').click();
  await expect(info).toContainText('Fa♯ major');
  await cof.locator('[data-w="cofenh"]').click();
  await expect(info).toContainText('Sol♭ major');
  await expect(info).toContainText('6 bemol(i):');

  await cof.locator('[data-w="cof"][data-k="7"]').click();
  await cof.locator('[data-w="cofenh"]').click();
  await expect(info).toContainText('Do♯ major');
  await expect(info).toContainText('7 diez(i):');
});

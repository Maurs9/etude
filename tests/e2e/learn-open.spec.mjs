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

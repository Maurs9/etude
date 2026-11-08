import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';

test('the single-file build boots over file://', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL('dist/etude-standalone.html').href);
  await page.waitForFunction(() => typeof window.show === 'function' && document.querySelector('#keys .key'));
  await expect(page.locator('#view-today')).toBeVisible();
  expect(errors).toEqual([]);
});

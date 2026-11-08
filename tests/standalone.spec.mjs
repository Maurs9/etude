import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';

test('the single-file build boots over file://', async ({ page }) => {
  const errors = [];
  const external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.isNavigationRequest() && request.url().startsWith('file://')) external.push(request.url());
  });
  page.on('requestfailed', request => external.push(`failed ${request.url()}`));
  await page.goto(pathToFileURL('dist/etude-standalone.html').href);
  await page.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));
  await expect(page.locator('#view-today')).toBeVisible();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

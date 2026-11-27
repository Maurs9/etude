import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';

test('the single-file build boots over file://', async ({ page }) => {
  const errors = [];
  const external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.isNavigationRequest() && /^(file|https?):/.test(request.url())) external.push(request.url());
  });
  page.on('requestfailed', request => external.push(`failed ${request.url()}`));
  await page.goto(pathToFileURL('dist/etude-standalone.html').href);
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  await page.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));
  await expect(page.locator('#view-today')).toBeVisible();
  expect(await page.evaluate(() => typeof window.opensheetmusicdisplay)).toBe('undefined');
  await page.evaluate(() => window.__etude.loadOsmd());
  expect(await page.evaluate(() => typeof window.opensheetmusicdisplay)).toBe('object');
  await page.locator('#nav [data-view=practice]').click();
  await page.locator('#pr-t-chord').click();
  await page.locator('#pr-songs summary').click();
  await expect(page.locator('#practiceHintsList [data-hint]')).toHaveCount(1);
  await page.locator('#practiceHintsList [data-hint-control="chord:tier-toggle"]').click();
  await expect(page.locator('#practiceHintsList [data-hint]')).toHaveCount(6);
  await page.locator('#practiceHintsList [data-hint-family="all"]').click();
  await expect(page.locator('#practiceHintsList [data-hint]')).toHaveCount(25);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('the single-file build loads every interface language and Learn payload without external requests', async ({ page }) => {
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.isNavigationRequest() && /^(file|https?):/.test(request.url())) external.push(request.url());
  });
  page.on('requestfailed', request => external.push(`failed ${request.url()}`));
  await page.goto(pathToFileURL('dist/etude-standalone.html').href);
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  await page.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));
  for (const language of ['en', 'ro', 'es', 'fr', 'de', 'it', 'pt-BR']) {
    await page.evaluate(async language => {
      await window.__etude.setLang(language);
      window.__etude.learnGoId('keys');
    }, language);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    const title = await page.evaluate(language => {
      const lesson = window.__etude.LESSONS.find(lesson => lesson.id === 'keys');
      return (lesson[language] || lesson.en).t;
    }, language);
    await expect(page.locator('#learnBody')).toContainText(title);
    await expect(page.locator('#learnBody .lsum dl')).not.toBeEmpty();
    expect(await page.locator('#learnBody').innerText()).not.toMatch(/could not load|unable to load/i);
  }
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('the single-file build decodes its piano samples and loads embedded fonts', async ({ page }) => {
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.isNavigationRequest() && /^(file|https?):/.test(request.url())) external.push(request.url());
  });
  page.on('requestfailed', request => external.push(`failed ${request.url()}`));
  await page.goto(pathToFileURL('dist/etude-standalone.html').href);
  await page.waitForFunction(() => typeof window.__etude?.preparePiano === 'function');
  const result = await page.evaluate(async () => {
    const app = window.__etude;
    const fonts = await Promise.all([
      document.fonts.load('16px "Bodoni Moda"'),
      document.fonts.load('16px "Etude Script"', 'ĂăÂâÎîȘșȚț'),
    ]);
    app.ensureAudio();
    const ready = await app.preparePiano();
    app.handleNoteOn(60, 100);
    app.handleNoteOff(60);
    return {
      ready,
      buffers: app.pianoBank.buffers.size,
      fontCounts: fonts.map(faces => faces.length),
      fontsLoaded: fonts.every(faces => faces.every(face => face.status === 'loaded')),
    };
  });
  expect(result.ready).toBe(true);
  expect(result.buffers).toBeGreaterThan(0);
  expect(result.fontCounts.every(count => count > 0)).toBe(true);
  expect(result.fontsLoaded).toBe(true);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

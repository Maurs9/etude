import { test, expect } from '../helpers/fixtures.mjs';

const LANGUAGES = ['en', 'ro', 'es', 'fr', 'de', 'it', 'pt-BR'];

for (const language of LANGUAGES) {
  test(`Today uses a lightweight lesson catalog on ${language} startup`, async ({ app, page }) => {
    await app.open({ hash: 'today', lang: language });
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    const catalog = await page.evaluate(() => {
      const lessons = window.__etude.LESSONS;
      return {
        count: lessons.length,
        containsBodies: lessons.some(lesson => Object.values(lesson).some(copy =>
          copy && typeof copy === 'object' && typeof copy.b === 'string' && copy.b.length > 0)),
        firstTitle: (lessons[0][window.__etude.lang] || lessons[0].en).t,
      };
    });
    expect(catalog.count).toBeGreaterThan(10);
    expect(catalog.containsBodies).toBe(false);
    await expect(page.locator('[data-plan="learn"]')).toContainText(catalog.firstTitle);
    const decodedJs = await page.evaluate(() => performance.getEntriesByType('resource')
      .filter(entry => /\.(?:m?js|ts)$/.test(new URL(entry.name).pathname))
      .reduce((sum, entry) => sum + entry.decodedBodySize, 0));
    expect(decodedJs).toBeGreaterThan(0);
    // Compare minified production bytes, never Vite's unminified development modules.
    // The pre-split production baseline loads 1,703,641 bytes of startup JavaScript.
    if (!process.env.ETUDE_DEV_SERVER && process.env.npm_lifecycle_event !== 'test:dev')
      expect(decodedJs).toBeLessThan(1_000_000);
  });

  test(`direct #learn opens the localized lesson and cheat sheet in ${language}`, async ({ app, page }) => {
    await app.open({ hash: 'learn', lang: language });
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.locator('#learnBody .lsum dl')).not.toBeEmpty();
    const expectedTitle = await page.evaluate(language => {
      const lesson = window.__etude.LESSONS.find(lesson => lesson.id === 'keys');
      return (lesson[language] || lesson.en).t;
    }, language);
    await expect(page.locator('#learnBody')).toContainText(expectedTitle);
    expect((await page.locator('#learnBody').innerText()).length).toBeGreaterThan(300);
  });
}

test('finishing a delayed Learn import preserves keyboard targets set after navigation', async ({ app, page }) => {
  await app.open({ hash: 'explore' });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(/learn-en(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/, async route => { await gate; await route.continue(); });
  await page.evaluate(() => {
    window.__etude.show('learn');
    window.__etude.kbClearAll();
    window.__etude.kbState(60, 'target', true);
  });
  await expect(page.locator('#learnBody [data-lazy-loading]')).toBeVisible();
  release();
  await page.evaluate(() => window.__etude.learnReady);
  await expect(page.locator('#learnBody .learn-content')).toContainText('12 different notes');
  expect(await page.evaluate(() => window.__etude.keyEl.get(window.__etude.foldToView(60)).dataset.s))
    .toBe('target');
});

test('a retired Learn chunk after deployment offers one explicit reload and preserves saved progress', async ({ app, page }) => {
  let navigations = 0;
  // Count document requests, not same-document hash/history changes.
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++;
  });
  await app.open({ saved: { v: 3, lang: 'de', data: { totalReviews: 17, totalCorrect: 12 } } });
  const progressBefore = await page.evaluate(() => window.__etude.data.totalReviews);
  expect(progressBefore).toBe(17);
  await page.route(/learn-de(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/, route => route.fulfill({ status: 404, body: 'Retired deployment chunk' }));
  await page.evaluate(() => window.__etude.show('learn'));
  await expect(page.locator('#learnBody #locale-load-error')).toBeVisible();
  await expect(page.locator('#learnBody [data-lazy-reload]')).toBeVisible();
  expect(navigations).toBe(1);
  expect(await page.evaluate(() => window.__etude.data.totalReviews)).toBe(progressBefore);
  await page.unroute(/learn-de(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/);
  await Promise.all([
    page.waitForEvent('domcontentloaded'),
    page.locator('#learnBody [data-lazy-reload]').click(),
  ]);
  await page.waitForFunction(() => typeof window.__etude?.show === 'function');
  await expect(page.locator('#learnBody .learn-content')).toContainText('12 verschiedene Töne');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  expect(await page.evaluate(() => window.__etude.data.totalReviews)).toBe(progressBefore);
  expect(navigations).toBe(2);
});

test('rapid language changes apply only the last requested language', async ({ app, page }) => {
  await app.open({ hash: 'learn' });
  await expect(page.locator('#learnBody .lsum dl')).not.toBeEmpty();
  await page.evaluate(async () => {
    await Promise.all(['de', 'fr', 'ro'].map(language => window.__etude.setLang(language)));
  });
  await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
  await expect(page.locator('#learnBody')).toContainText('Claviatura și numele notelor');
  await expect(page.locator('#learnBody .lsum dl')).not.toBeEmpty();
  await page.reload();
  await page.waitForFunction(() => typeof window.__etude?.show === 'function');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
  await expect(page.locator('#learnBody')).toContainText('Claviatura și numele notelor');
});

test('all language and Learn chunks open offline after warming only Today @sw', async ({ app, page, context }) => {
  await app.open({ hash: 'today' });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  for (const language of LANGUAGES) {
    await page.evaluate(async language => {
      await window.__etude.setLang(language);
      window.__etude.show('learn');
    }, language);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.locator('#learnBody .lsum dl')).not.toBeEmpty();
    const expectedTitle = await page.evaluate(language => {
      const lesson = window.__etude.LESSONS.find(lesson => lesson.id === 'keys');
      return (lesson[language] || lesson.en).t;
    }, language);
    await expect(page.locator('#learnBody')).toContainText(expectedTitle);
  }
  await page.reload();
  await page.waitForFunction(() => typeof window.__etude?.show === 'function');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.locator('#learnBody .lsum dl')).not.toBeEmpty();
});

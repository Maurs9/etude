import { test, expect } from '../helpers/fixtures.mjs';

const germanUI = /ui-de(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/;
async function startReadingDrill(page) {
  await page.evaluate(() => {
    const e = window.__etude;
    e.show('read');
    e.rdOpen(Object.values(e.RD_LV).find(level => level.ty === 'name'));
  });
  await page.locator('#rdx-body [data-mode="practice"]').click();
  expect(await page.evaluate(() => window.__etude.RD.on)).toBe(true);
}
async function languageState(page) {
  return page.evaluate(() => ({ lang: window.__etude.lang, saved: JSON.parse(localStorage.getItem('ptt-v3')).lang, pending: window.__etude.SYNC.pend.lang?.v }));
}

test('locale split: obsolete synchronized import failure cannot retry German over deferred French', async ({ app, page, context }) => {
  await app.open();
  const receiving = await context.newPage();
  await receiving.goto(page.url());
  await receiving.waitForFunction(() => window.__etude?.lang === 'en');
  let release, intercepted = false;
  const gate = new Promise(resolve => { release = resolve; });
  await receiving.route(germanUI, async route => { intercepted = true; await gate; await route.abort(); });
  try {
    await page.evaluate(() => window.__etude.setLang('de'));
    await expect.poll(() => intercepted).toBe(true);
    await startReadingDrill(receiving);
    await page.evaluate(() => window.__etude.setLang('fr'));
    await expect.poll(() => receiving.evaluate(() => window.__etude.SYNC.pend.lang?.v)).toBe('fr');
    const failed = receiving.waitForEvent('requestfailed', request => germanUI.test(request.url()));
    release();
    await failed;
    await receiving.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
    await receiving.unroute(germanUI);
    // Reproduce the harmful action if an obsolete error was incorrectly exposed.
    const retry = receiving.locator('#locale-load-error [data-lazy-retry]');
    if (await retry.count()) await retry.click();
    await receiving.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
    expect(await languageState(receiving)).toEqual({ lang: 'en', saved: 'fr', pending: 'fr' });
    await expect(receiving.locator('#locale-load-error')).toHaveCount(0);
    await receiving.evaluate(() => window.__etude.saveAll());
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    expect(await languageState(page)).toEqual({ lang: 'fr', saved: 'fr', pending: undefined });
    await receiving.locator('#rdx-end').click();
    await expect(receiving.locator('html')).toHaveAttribute('lang', 'fr');
  } finally { release(); await receiving.close(); }
});

for (const busy of [false, true]) {
 test(`locale split: failed current synchronized import preserves saved remote intent and retries ${busy ? 'only after drill idle' : 'when idle'} without automatic retries`, async ({ app, page, context }) => {
  await app.open();
  const receiving = await context.newPage();
  await receiving.goto(page.url());
  await receiving.waitForFunction(() => window.__etude?.lang === 'en');
  let attempts = 0;
  await receiving.route(germanUI, route => { attempts++; return route.abort(); });
  try {
    await page.evaluate(() => window.__etude.setLang('de'));
    await expect(receiving.locator('#locale-load-error')).toBeVisible();
    await receiving.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
    await receiving.evaluate(() => window.__etude.saveAll());
    expect(await languageState(receiving)).toEqual({ lang: 'en', saved: 'de', pending: 'de' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    expect(await languageState(page)).toEqual({ lang: 'de', saved: 'de', pending: undefined });
    // More saves and multiple idle polling intervals must not cause network retry loops.
    for (let i = 0; i < 3; i++) await receiving.evaluate(() => window.__etude.saveAll());
    await receiving.waitForTimeout(3200);
    expect(attempts).toBe(1);
    if (busy) await startReadingDrill(receiving);
    let recoveredAttempts = 0;
    await receiving.unroute(germanUI);
    await receiving.route(germanUI, route => { recoveredAttempts++; return route.continue(); });
    await receiving.locator('#locale-load-error [data-lazy-retry]').click();
    if (busy) {
      await receiving.waitForTimeout(1700);
      expect(await languageState(receiving)).toEqual({ lang: 'en', saved: 'de', pending: 'de' });
      expect(recoveredAttempts).toBe(0);
      await receiving.evaluate(() => window.__etude.saveAll());
      expect(await languageState(page)).toEqual({ lang: 'de', saved: 'de', pending: undefined });
      await receiving.locator('#rdx-end').click();
    }
    await expect(receiving.locator('html')).toHaveAttribute('lang', 'de');
    expect(recoveredAttempts).toBe(1);
    await expect.poll(() => languageState(receiving)).toEqual({ lang: 'de', saved: 'de', pending: undefined });
    await expect(receiving.locator('#locale-load-error')).toHaveCount(0);
    expect(await languageState(page)).toEqual({ lang: 'de', saved: 'de', pending: undefined });
  } finally { await receiving.close(); }
 });
}

for (const source of ['local', 'remote']) {
  test(`locale split: retained synchronized Retry action cannot discard newer ${source} intent`, async ({ app, page, context }) => {
    await app.open();
    const receiving = await context.newPage();
    await receiving.goto(page.url());
    await receiving.waitForFunction(() => window.__etude?.lang === 'en');
    await receiving.route(germanUI, route => route.abort());
    try {
      await page.evaluate(() => window.__etude.setLang('de'));
      const retry = receiving.locator('#locale-load-error [data-lazy-retry]');
      await expect(retry).toBeVisible();
      const retainedAction = await retry.elementHandle();
      await startReadingDrill(receiving);
      await (source === 'local' ? receiving : page).evaluate(() => window.__etude.setLang('fr'));
      if (source === 'remote') await expect.poll(() => receiving.evaluate(() => window.__etude.SYNC.pend.lang?.v)).toBe('fr');
      else await expect(receiving.locator('html')).toHaveAttribute('lang', 'fr');
      await receiving.unroute(germanUI);
      let staleAttempts = 0;
      await receiving.route(germanUI, route => { staleAttempts++; return route.continue(); });
      await retainedAction.evaluate(button => button.click());
      await receiving.waitForTimeout(100);
      expect(staleAttempts).toBe(0);
      expect(await languageState(receiving)).toEqual({ lang: source === 'local' ? 'fr' : 'en', saved: 'fr', pending: source === 'local' ? undefined : 'fr' });
      await receiving.evaluate(() => window.__etude.saveAll());
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
      expect(await languageState(page)).toEqual({ lang: 'fr', saved: 'fr', pending: undefined });
      await receiving.locator('#rdx-end').click();
      await expect(receiving.locator('html')).toHaveAttribute('lang', 'fr');
    } finally { await receiving.close(); }
  });
}

test('locale split: Settings refreshes generated reading titles only after the delayed language commits', async ({ app, page }) => {
  await app.open({ hash: 'read' });
  await page.evaluate(() => window.__etude.rdGenMelody());
  const title = page.locator('#rd-piece option:checked');
  await expect(title).toContainText('Sight-reading');
  let release, intercepted = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(/ui-ro(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/, async route => { intercepted = true; await gate; await route.continue(); });
  try {
    await page.locator('#settingsBtn').click();
    await page.locator('#set-lang button[data-v="ro"]').click();
    await expect.poll(() => intercepted).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(title).toContainText('Sight-reading');
    release();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
    const expected = await page.evaluate(() => window.__etude.t('rdx_sr_title', window.__etude.SR.gen.level));
    await expect(title).toContainText(expected);
  } finally { release(); }
});

test('locale split: Romanian glossary preserves English search aliases and localized search parity', async ({ app, page }) => {
  await app.open({ lang: 'ro', hash: 'learn' });
  await page.locator('#learnGlossBtn').click();
  for (const [alias, translated, english] of [
    ['half step', 'Semiton', 'Semitone (half step)'],
    ['whole step', 'Ton', 'Whole tone (whole step)'],
    ['ledger line', 'Linie suplimentară', 'Ledger line'],
  ]) {
    await page.locator('#lg-q').fill(alias);
    await expect(page.locator('.lg-it:visible dt')).toHaveText([translated]);
    await page.locator('#lg-q').fill(translated);
    await expect(page.locator('.lg-it:visible dt')).toContainText([translated]);
    await page.evaluate(() => window.__etude.setLang('en'));
    await page.locator('#lg-q').fill(alias);
    await expect(page.locator('.lg-it:visible dt')).toHaveText([english]);
    await page.evaluate(() => window.__etude.setLang('ro'));
  }
});

test('locale split: cross-tab import that finishes during a reading drill waits for idle without losing intent', async ({ app, page, context }) => {
  await app.open();
  const second = await context.newPage();
  await second.goto(page.url().split('#')[0] + '#read');
  await second.waitForFunction(() => window.__etude?.lang === 'en');
  await second.evaluate(() => window.__etude.show('read'));
  let release, intercepted = false;
  const gate = new Promise(resolve => { release = resolve; });
  await second.route(/ui-de(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/, async route => { intercepted = true; await gate; await route.continue(); });
  try {
    await page.evaluate(() => window.__etude.setLang('de'));
    await expect.poll(() => intercepted).toBe(true);
    await second.evaluate(() => {
      const e = window.__etude;
      e.rdOpen(Object.values(e.RD_LV).find(level => level.ty === 'name'));
    });
    await second.locator('#rdx-body [data-mode="practice"]').click();
    expect(await second.evaluate(() => window.__etude.RD.on)).toBe(true);
    const before = await second.locator('#rdx-stage').innerHTML();
    const response = second.waitForResponse(/ui-de(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/);
    release();
    await second.evaluate(async url => { await import(url); }, (await response).url());
    await second.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
    await expect(second.locator('html')).toHaveAttribute('lang', 'en');
    expect(await second.evaluate(() => ({ lang: window.__etude.lang, saved: JSON.parse(localStorage.getItem('ptt-v3')).lang, pending: window.__etude.SYNC.pend.lang?.v }))).toEqual({ lang: 'en', saved: 'de', pending: 'de' });
    expect(await second.locator('#rdx-stage').innerHTML()).toBe(before);
    await second.evaluate(() => window.__etude.saveAll());
    expect(await second.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).lang)).toBe('de');
    await second.locator('#rdx-end').click();
    await expect(second.locator('html')).toHaveAttribute('lang', 'de');
    expect(await second.evaluate(() => ({ lang: window.__etude.lang, saved: JSON.parse(localStorage.getItem('ptt-v3')).lang, pending: window.__etude.SYNC.pend.lang?.v }))).toEqual({ lang: 'de', saved: 'de', pending: undefined });
  } finally { release(); await second.close(); }
});

for (const source of ['local', 'remote']) {
  test(`locale split: ${source} newer language replaces an in-flight synchronized import`, async ({ app, page, context }) => {
    await app.open();
    const second = await context.newPage();
    await second.goto(page.url());
    await second.waitForFunction(() => window.__etude?.lang === 'en');
    let release, intercepted = false;
    const gate = new Promise(resolve => { release = resolve; });
    await second.route(/ui-de(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/, async route => { intercepted = true; await gate; await route.continue(); });
    try {
      await page.evaluate(() => window.__etude.setLang('de'));
      await expect.poll(() => intercepted).toBe(true);
      await (source === 'local' ? second : page).evaluate(() => window.__etude.setLang('fr'));
      await expect(second.locator('html')).toHaveAttribute('lang', 'fr');
      const response = second.waitForResponse(/ui-de(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/);
      release();
      await second.evaluate(async url => { await import(url); }, (await response).url());
      await second.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
      await expect(second.locator('html')).toHaveAttribute('lang', 'fr');
      expect(await second.evaluate(() => ({ lang: window.__etude.lang, saved: JSON.parse(localStorage.getItem('ptt-v3')).lang, pending: window.__etude.SYNC.pend.lang?.v }))).toEqual({ lang: 'fr', saved: 'fr', pending: undefined });
    } finally { release(); await second.close(); }
  });
}

test('locale split: newest cross-tab English intent cancels a pending German import', async ({ app, page, context }) => {
  await app.open();
  const second = await context.newPage();
  await second.goto(page.url());
  await second.waitForFunction(() => window.__etude?.lang === 'en');
  let release, intercepted = false;
  const gate = new Promise(resolve => { release = resolve; });
  await second.route(/ui-de(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/, async route => {
    intercepted = true;
    await gate;
    await route.continue();
  });
  try {
    await page.evaluate(() => window.__etude.setLang('de'));
    await expect.poll(() => intercepted).toBe(true);
    await page.evaluate(() => window.__etude.setLang('en'));
    await expect.poll(() => second.evaluate(() => JSON.parse(window.__etude.SYNC.raw).lang)).toBe('en');
    for (const tab of [page, second]) {
      await expect(tab.locator('html')).toHaveAttribute('lang', 'en');
      expect(await tab.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).lang)).toBe('en');
    }
    const response = second.waitForResponse(/ui-de(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/);
    release();
    // Importing the exact intercepted URL awaits module evaluation in dev and production.
    await second.evaluate(async url => { await import(url); }, (await response).url());
    await second.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
    for (const tab of [page, second]) {
      await expect(tab.locator('html')).toHaveAttribute('lang', 'en');
      expect(await tab.evaluate(() => ({ lang: window.__etude.lang, saved: JSON.parse(localStorage.getItem('ptt-v3')).lang }))).toEqual({ lang: 'en', saved: 'en' });
    }
    // Ordinary later synchronization still works in both directions.
    await page.evaluate(() => window.__etude.setLang('de'));
    await expect(second.locator('html')).toHaveAttribute('lang', 'de');
    await second.evaluate(() => window.__etude.setLang('en'));
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  } finally {
    release();
    await second.close();
  }
});

test('locale split: Today imports no Learn bodies and no inactive language payloads', async ({ app, page }) => {
  const scripts = [];
  page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  await app.open({ lang: 'fr' });
  expect(scripts.some(url => /ui-fr[.-]/.test(url))).toBe(true);
  expect(scripts.some(url => /learn-(en|ro|es|fr|de|it|pt-BR)[.-]/.test(url))).toBe(false);
  expect(scripts.some(url => /ui-(ro|es|de|it|pt-BR)[.-]/.test(url))).toBe(false);
});

test('locale split: slow locale boot never triggers the synchronous-entry failure overlay', async ({ app, page }) => {
  await page.route(/ui-ro(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/, async route => { await new Promise(resolve => setTimeout(resolve, 300)); await route.continue(); });
  await app.open({ lang: 'ro' });
  await expect(page.locator('[role=alert]:visible')).toHaveCount(0);
  await page.locator('#settingsBtn').click();
  await expect(page.locator('[data-i18n=set_ble_hint]')).toBeVisible();
});

test('locale split: a failed Learn import offers explicit retry/reload and recovers after retry', async ({ app, page }) => {
  await app.open();
  await page.route(/learn-en(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/, route => route.abort());
  await page.evaluate(() => window.__etude.show('learn'));
  await expect(page.locator('#learnBody [role=alert]')).toBeVisible();
  await expect(page.locator('#learnBody [data-lazy-reload]')).toBeVisible();
  await page.unroute(/learn-en(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/);
  await page.locator('#learnBody [data-lazy-retry]').click();
  await expect(page.locator('#learnBody .learn-content')).toContainText('12 different notes');
  await expect(page.locator('#locale-load-error')).toHaveCount(0);
});

test('locale split: leaving Learn during import never mutates the hidden view, and cached reentry works', async ({ app, page }) => {
  await app.open({ lang: 'pt-BR' });
  let release, intercepted = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(/learn-pt-BR(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/, async route => { intercepted = true; await gate; await route.continue(); });
  await page.evaluate(() => window.__etude.show('learn'));
  await expect.poll(() => intercepted).toBe(true);
  await page.evaluate(() => window.__etude.show('today'));
  const before = await page.locator('#learnBody').innerHTML();
  release();
  await page.evaluate(() => window.__etude.learnReady);
  expect(await page.locator('#learnBody').innerHTML()).toBe(before);
  await expect(page.locator('#view-today')).toHaveClass(/active/);
  await page.evaluate(() => window.__etude.show('learn'));
  await expect(page.locator('#learnBody .learn-content')).toContainText('12 notas diferentes');
  await page.locator('#learnBody [data-lq=start]').click();
  await expect(page.locator('#lq-q')).not.toBeEmpty();
  await page.locator('#learnGlossBtn').click();
  await expect(page.locator('#lg-q')).toBeVisible();
});

test('locale split: failed initial UI import retains the saved language and has explicit recovery without reload loops', async ({ app, page }) => {
  let navigations = 0;
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
  await page.route(/ui-fr(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/, route => route.abort());
  const opening = app.open({ lang: 'fr', hash: 'learn' });
  await expect(page.locator('#locale-load-error')).toBeVisible();
  await expect(page.locator('#locale-load-error [data-lazy-reload]')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).lang)).toBe('fr');
  expect(navigations).toBe(1);
  await page.unroute(/ui-fr(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/);
  await page.locator('#locale-load-error [data-lazy-retry]').click();
  await opening;
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.locator('#learnBody .learn-content')).toContainText('12 notes différentes');
  await expect(page.locator('#locale-load-error')).toHaveCount(0);
  expect(navigations).toBe(1);
});

test('locale split: failed switch preserves the complete committed language until explicit retry succeeds', async ({ app, page }) => {
  await app.open({ hash: 'learn' });
  await expect(page.locator('#learnBody .learn-content')).toContainText('12 different notes');
  await page.route(/ui-de(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/, route => route.abort());
  await page.evaluate(() => window.__etude.setLang('de'));
  await expect(page.locator('#locale-load-error')).toBeVisible();
  expect(await page.evaluate(() => ({ language: window.__etude.lang, saved: JSON.parse(localStorage.getItem('ptt-v3')).lang }))).toEqual({ language: 'en', saved: 'en' });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#learnBody .learn-content')).toContainText('12 different notes');
  await page.unroute(/ui-de(?:-[^\/?]+)?\.(?:js|ts)(?:\?.*)?$/);
  await page.locator('#locale-load-error [data-lazy-retry]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.locator('#learnBody .learn-content')).toContainText('12 verschiedene Töne');
  await expect(page.locator('#locale-load-error')).toHaveCount(0);
});

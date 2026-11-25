import { test, expect } from '../helpers/fixtures.mjs';

test('a pending score-tools import does not show a false startup failure', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(/score-(?:tools|import|svg-post|midi)(?:-.*\.js|\.ts)/, async route => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto('etude.html#analysis');
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-app-pending'));
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
    await expect(page.locator('body > [role=alert]')).toHaveCount(0);
  } finally { release(); }
  await page.waitForFunction(() => typeof window.__etude?.show === 'function');
  await expect(page.locator('body > [role=alert]')).toHaveCount(0);
});

test('Explore defers score tools until Pieces is opened', async ({ app }) => {
  const page = await app.open({ hash: 'explore' });
  const requested = () => page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
  expect((await requested()).some(url => /score-tools|score-import\.ts|score-svg-post\.ts|score-midi\.ts/.test(url))).toBe(false);
  await page.evaluate(() => window.__etude.show('analysis'));
  await expect(page.locator('#view-analysis')).toHaveClass(/active/);
  await page.waitForFunction(() => typeof window.__etude.scoreXmlNotes === 'function');
  expect((await requested()).some(url => /score-tools|score-import\.ts/.test(url))).toBe(true);
});

test('a failed library module can be retried without reloading or losing the open view', async ({ app }) => {
  const page = await app.open({ hash: 'explore' });
  let requests = 0;
  await page.route(/score-library-ui(?:-.*\.js|\.ts)/, async route => {
    requests++;
    if (requests === 1) await route.abort('failed');
    else await route.continue();
  });
  await page.evaluate(() => window.__etude.show('analysis'));
  const retry = page.locator('#score-library-root > button');
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(page).toHaveURL(/#analysis$/);
  await page.locator('#an-tab-library').click();
  await expect(page.locator('#score-library')).toBeVisible();
  expect(requests).toBe(2);
});

test('large scores render completely while the event loop continues to respond', async ({ app }) => {
  const page = await app.open({ hash: 'analysis' });
  const measures = Array.from({ length: 512 }, (_, i) => `<measure number="${i + 1}">${i ? '' : '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>'}${['C', 'E', 'G', 'E'].map(step => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>`).join('')}</measure>`).join('');
  const xml = `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
  await page.evaluate(() => {
    window.__renderTicks = 0;
    window.__renderTimer = setInterval(() => {
      if (window.__etude.SCORE.engine && document.querySelector('#an-roll').getAttribute('aria-busy') === 'true') window.__renderTicks++;
    }, 0);
  });
  try {
    await page.locator('#an-file').setInputFiles({ name: 'large.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
    await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo && document.querySelector('#an-roll').getAttribute('aria-busy') === 'false');
    const state = await page.evaluate(() => ({ notes: window.__etude.AN.notes.length, bound: window.__etude.SCORE.heads.size, ticks: window.__renderTicks }));
    expect(state.notes).toBe(2048);
    expect(state.bound).toBe(2048);
    expect(state.ticks).toBeGreaterThan(2);
    // Supersede a queued redraw, then switch to the continuous view. Neither
    // cancellation nor the drawing batches may drop the final measures.
    await page.evaluate(() => {
      const e = window.__etude;
      e.SCORE.zoom = 1.2; e.scoreLayout();
      e.SCORE.layout = 'cont'; e.scoreLayout();
    });
    await page.waitForFunction(() => document.querySelector('#an-roll').getAttribute('aria-busy') === 'false');
    expect(await page.evaluate(() => window.__etude.SCORE.heads.size)).toBe(2048);
  } finally { await page.evaluate(() => clearInterval(window.__renderTimer)); }
});

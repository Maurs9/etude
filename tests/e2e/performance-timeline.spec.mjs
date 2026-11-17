import { test, expect } from '../helpers/fixtures.mjs';
const whole = '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>';
const xml = `<score-partwise version="4.0"><work><work-title>Timeline</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${[0, 1, 2].map(i => `<measure number="${i + 1}">${i ? '' : '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><sound tempo="120"/></direction>'}${whole}${i === 1 ? '<barline location="right"><repeat direction="backward"/></barline>' : ''}</measure>`).join('')}</part></score-partwise>`;
async function open(app, page, source = xml) {
  await app.open({ hash: 'analysis' });
  await page.locator('#an-file').setInputFiles({ name: 'timeline.musicxml', mimeType: 'application/xml', buffer: Buffer.from(source) });
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
  await page.evaluate(() => window.__etude.pracSet('countIn', false));
}
async function play(page) { await page.evaluate(() => window.__etude.scorePlay(false, window.__etude.FALL.position)); }
async function secondPass(page) {
  await play(page);
  await page.evaluate(() => {
    const a = window.__etude, r = a.SCORE.run;
    r.segs[0].a0 = a.actx.currentTime - 3.8; a.pracTick();
    r.segs.forEach(s => s.a0 -= .5); a.pracTick(); a.scorePause();
  });
}

test('duration and progress include repeats while the engraved cursor returns to the score start', async ({ app, page }) => {
  await open(app, page);
  await expect(page.locator('#fall-total')).toHaveText('0:10');
  await expect(page.locator('#fall-seek')).toHaveAttribute('max', '10');
  await secondPass(page);
  await expect(page.locator('#fall-clock')).toHaveText('0:04');
  expect(await page.locator('#fall-seek').inputValue().then(Number)).toBeCloseTo(4.3, 1);
  expect(await page.evaluate(() => window.__etude.FALL.position)).toBeCloseTo(.3, 1);
  await page.evaluate(() => window.__etude.scoreToggle());
  expect(await page.evaluate(() => window.__etude.SCORE.run.pass)).toBe(2);
  expect(await page.evaluate(() => window.__etude.SCORE.run.route)).toEqual([]);
});

test('seeking on the performance timeline retains the chosen repeat', async ({ app, page }) => {
  await open(app, page); await secondPass(page);
  await page.evaluate(() => { document.getElementById('fall-seek').value = '5'; window.__etude.fallSeek(); });
  expect(await page.evaluate(() => window.__etude.FALL.position)).toBeCloseTo(1);
  await expect(page.locator('#fall-clock')).toHaveText('0:05');
  await play(page);
  expect(await page.evaluate(() => window.__etude.SCORE.run.route)).toEqual([]);
  expect(await page.evaluate(() => window.__etude.SCORE.run.pass)).toBe(2);
});

test('pausing between the audio repeat boundary and the next scheduler tick keeps the second pass', async ({ app, page }) => {
  await open(app, page); await play(page);
  await page.evaluate(() => {
    const a = window.__etude, r = a.SCORE.run;
    r.segs[0].a0 = a.actx.currentTime - 3.8; a.pracTick();
    r.segs.forEach(s => s.a0 -= .4);
    a.scorePause();
  });
  await page.evaluate(() => window.__etude.scoreToggle());
  expect(await page.evaluate(() => window.__etude.SCORE.run.pass)).toBe(2);
  expect(await page.evaluate(() => window.__etude.SCORE.run.route)).toEqual([]);
});

test('seeking to the written bar after a repeat maps to its real performance occurrence', async ({ app, page }) => {
  await open(app, page); await play(page);
  await page.evaluate(() => {
    const a = window.__etude; a.SCORE.run.segs[0].a0 = a.actx.currentTime - 3.8; a.pracTick(); a.scoreSeekTo(4);
  });
  await page.waitForFunction(() => window.__etude.SCORE.playing && window.__etude.SCORE.run?.segs[0].t0 === 4);
  await page.evaluate(() => window.__etude.scorePause());
  await expect(page.locator('#fall-clock')).toHaveText('0:08');
  expect(await page.evaluate(() => window.__etude.FALL.position)).toBeCloseTo(4, 1);
});

test('a library bookmark survives reload on the second repeat', async ({ app, page }) => {
  await open(app, page); await secondPass(page);
  await page.evaluate(() => window.__etude.anLibraryFlush());
  const saved = await page.evaluate(async () => (await window.__etude.scoreLibraryStore.libraryList())[0].resume);
  expect(saved.performance).toBeCloseTo(4.3, 1);
  await page.reload(); await page.waitForFunction(() => !!window.__etude?.show && document.getElementById('score-library'));
  await page.locator('#score-library').evaluate(el => { el.open = true; });
  await expect(page.locator('.score-library-info').first()).toContainText('0:04');
  await page.locator('[data-library-action=open]').first().click();
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
  await expect(page.locator('#fall-clock')).toHaveText('0:04');
  await play(page);
  expect(await page.evaluate(() => window.__etude.SCORE.run.route)).toEqual([]);
});

test('half speed doubles duration; a live speed change keeps elapsed time and recomputes remaining time', async ({ app, page }) => {
  await open(app, page);
  await page.locator('#score-speed').selectOption('50');
  await expect(page.locator('#fall-total')).toHaveText('0:20');
  await play(page);
  await page.evaluate(() => { const a = window.__etude; a.SCORE.run.segs[0].a0 = a.actx.currentTime - 2; a.pracTick(); });
  await page.locator('#score-speed').selectOption('100');
  await page.waitForFunction(() => window.__etude.SCORE.run?.segs[0].f === 1);
  await page.evaluate(() => window.__etude.scorePause());
  await expect(page.locator('#fall-clock')).toHaveText('0:02');
  await expect(page.locator('#fall-total')).toHaveText('0:11');
});

test('the complete timeline includes tempo changes on every repeat and remains correct at completion', async ({ app, page }) => {
  const tempo = xml.replace('<measure number="2">', '<measure number="2"><direction><sound tempo="60"/></direction>');
  await open(app, page, tempo);
  await expect(page.locator('#fall-total')).toHaveText('0:16');
  await play(page);
  await page.evaluate(() => {
    const a = window.__etude, r = a.SCORE.run;
    r.segs[0].a0 = a.actx.currentTime - 6.1; a.pracTick();
    r.segs[0].a0 = a.actx.currentTime - 10.5; a.pracTick();
  });
  await expect.poll(() => page.evaluate(() => window.__etude.SCORE.playing)).toBe(false);
  await expect(page.locator('#fall-clock')).toHaveText('0:16');
  await expect(page.locator('#fall-total')).toHaveText('0:16');
  expect(await page.locator('#fall-seek').inputValue().then(Number)).toBeCloseTo(16);
  await page.locator('#sc-start').click();
  await expect(page.locator('#fall-clock')).toHaveText('0:00');
});

test('trailing rests remain in duration and both clocks agree during the rest', async ({ app, page }) => {
  const tail = '<note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note><note><rest/><duration>3</duration><type>half</type><dot/></note>';
  await open(app, page, xml.replace(`<measure number="3">${whole}`, `<measure number="3">${tail}`));
  await secondPass(page);
  await page.evaluate(() => { document.getElementById('fall-seek').value = '9.2'; window.__etude.fallSeek(); });
  await expect(page.locator('#fall-total')).toHaveText('0:10');
  await expect(page.locator('#fall-clock')).toHaveText('0:09');
  await expect(page.locator('#st-time')).toHaveText('0:09 / 0:10');
  expect(await page.locator('#fall-seek').inputValue().then(Number)).toBeLessThan(10);
});

test('skipping to a second ending does not increment the repeat counter', async ({ app, page }) => {
  const volta = xml.replace('<repeat direction="backward"/>', '<ending number="1" type="start"/><ending number="1" type="stop"/><repeat direction="backward"/>').replace('<measure number="3">', '<measure number="3"><barline location="left"><ending number="2" type="start"/></barline>');
  await open(app, page, volta); await play(page);
  await expect(page.locator('#fall-total')).toHaveText('0:08');
  for (let i = 0; i < 2; i++) await page.evaluate(() => {
    const a = window.__etude, r = a.SCORE.run, s = r.segs[0], delta = a.actx.currentTime - .1 - (s.a0 + (s.t1 - s.t0) / s.f);
    r.segs.forEach(segment => segment.a0 += delta); a.pracTick();
  });
  expect(await page.evaluate(() => window.__etude.SCORE.run.pass)).toBe(2);
  await page.evaluate(() => window.__etude.scorePause());
  await expect(page.locator('#fall-clock')).toHaveText('0:06');
});

test('Wait for me freezes performance progress and loops display their own duration', async ({ app, page }) => {
  await open(app, page);
  await page.evaluate(async () => { const a = window.__etude; a.pracSet('wait', true); await a.scorePlay(false, 0); a.SCORE.run.segs[0].a0 -= 2; a.pracTick(); a.anStatusPos(); });
  await expect(page.locator('#fall-clock')).toHaveText('0:00');
  expect(await page.locator('#fall-seek').inputValue().then(Number)).toBe(0);
  await page.evaluate(async () => { const a = window.__etude; a.scoreStop(); a.pracSet('wait', false); a.AN.selected = new Set([0]); a.anSelectionChanged(); await a.scoreLoopStart(); });
  await expect(page.locator('#fall-total')).toHaveText('0:02');
  await expect(page.locator('#score-state')).toContainText('Loop');
  await expect(page.locator('#pr-hud')).toBeVisible();
  await expect(page.locator('#pr-pass')).toHaveText('1');
});

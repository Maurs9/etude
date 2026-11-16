import { test, expect } from '../helpers/fixtures.mjs';
const note = '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>';
const xml = `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><sound tempo="120"/></direction>${note}</measure><measure number="2">${note}<barline location="right"><repeat direction="backward"/></barline></measure><measure number="3">${note}</measure></part></score-partwise>`;
test('the actual scheduler jumps back at a repeat, preserving the written score and a paused route', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await page.locator('#an-file').setInputFiles({ name: 'repeat.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
  await page.evaluate(async () => { window.__etude.pracSet('countIn', false); await window.__etude.scorePlay(false, 0); });
  const state = await page.evaluate(() => {
    const a = window.__etude, r = a.SCORE.run;
    return { firstEnd: r.segs[0].t1, route: r.route, measures: a.SCORE.measures.length };
  });
  expect(state).toEqual({ firstEnd: 4, route: [{ a: 0, b: 6 }], measures: 3 });
  await page.evaluate(() => { const a = window.__etude, r = a.SCORE.run; r.judged.set(0, 'perfect'); r.segs[0].a0 -= 4.2; a.pracTick(); });
  expect(await page.evaluate(() => window.__etude.SCORE.run.segs[0].t0)).toBe(0);
  expect(await page.evaluate(() => window.__etude.SCORE.run.completed.has(0))).toBe(true);
  await page.evaluate(() => window.__etude.scorePause());
  expect(await page.evaluate(() => window.__etude.SCORE.resume.run.route.length)).toBeGreaterThan(0);
  await page.evaluate(async () => { const a = window.__etude; await a.scorePlay(false, 2); });
  expect(await page.evaluate(() => window.__etude.SCORE.run.notes.some(n => n.start === 0))).toBe(true);
});
test('alternate endings create distinct performance ranges without changing the printed measures', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  const volta = xml.replace('<repeat direction="backward"/>', '<ending number="1" type="start"/><ending number="1" type="stop"/><repeat direction="backward"/>')
    .replace('<measure number="3">', '<measure number="3"><barline location="left"><ending number="2" type="start"/></barline>');
  await page.locator('#an-file').setInputFiles({ name: 'volta.musicxml', mimeType: 'application/xml', buffer: Buffer.from(volta) });
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
  await page.evaluate(async () => { window.__etude.pracSet('countIn', false); await window.__etude.scorePlay(false, 0); });
  expect(await page.evaluate(() => window.__etude.SCORE.run.route)).toEqual([{ a: 0, b: 2 }, { a: 4, b: 6 }]);
});
test('natural engraving moves at a steady speed within each bar regardless of note spacing', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await page.evaluate(() => window.__etude.pcOpen('canon'));
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
  const xs = await page.evaluate(() => {
    const a = window.__etude, m = a.SCORE.geo.measures.find(m => m && m.b1 > m.b0);
    return [0, .25, .5, .75].map(f => a.scoreCursorAt(m.b0 + f * (m.b1 - m.b0)).x);
  });
  expect(xs[1] - xs[0]).toBeCloseTo(xs[2] - xs[1], 6);
  expect(xs[2] - xs[1]).toBeCloseTo(xs[3] - xs[2], 6);
});

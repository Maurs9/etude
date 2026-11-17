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
for (const piece of ['canon', 'brahms', 'elise']) test(`engraved cursor crosses noteheads at their onsets (${piece})`, async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await page.evaluate(id => window.__etude.pcOpen(id), piece);
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
  const errors = await page.evaluate(() => {
    const a = window.__etude, g = a.SCORE.geo;
    return [...a.SCORE.heads].flatMap(([i, heads]) => {
      const n = a.AN.notes[i], head = heads[0];
      if (!n || !head) return [];
      const pos = a.scoreCursorAt(n.start), sys = g.systems[pos.sys], page = g.pages[sys.page];
      const r = head.getBoundingClientRect(), pr = page.getBoundingClientRect();
      return [{ beat: n.start, error: Math.abs(pos.x * g.scale - (r.x + r.width / 2 - pr.x)) }];
    });
  });
  expect(errors.length).toBeGreaterThan(10);
  expect(Math.max(...errors.map(e => e.error)), JSON.stringify(errors.filter(e => e.error > 3))).toBeLessThan(3);
});

test('Wait for me asks again on every repeat before continuing', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await page.locator('#an-file').setInputFiles({ name: 'wait-repeat.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml.replace('tempo="120"', 'tempo="600"')) });
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
  await page.evaluate(async () => { const a = window.__etude; a.pracSet('countIn', false); a.pracSet('wait', true); await a.scorePlay(false, 0); });
  const visits = [];
  for (let i = 0; i < 5; i++) {
    await page.waitForFunction(() => { const a = window.__etude; return a.PRAC.bar && a.PRAC.bar.seg === a.SCORE.run.segs[0] && a.actx.currentTime >= a.SCORE.run.segs[0].a0 && a.fallTime() >= a.PRAC.bar.t - 1e-6; });
    visits.push(await page.evaluate(() => window.__etude.PRAC.bar.t));
    await page.evaluate(() => { const a = window.__etude; for (const m of [...a.PRAC.bar.need]) { a.handleNoteOn(m, 100); a.handleNoteOff(m); } });
  }
  expect(visits).toEqual([0, .4, 0, .4, .8]);
  await expect.poll(() => page.evaluate(() => window.__etude.SCORE.playing)).toBe(false);
});

test('Wait for me also asks again on explicit selection loops', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await page.locator('#an-file').setInputFiles({ name: 'wait-loop.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml.replace('tempo="120"', 'tempo="600"')) });
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
  await page.evaluate(async () => { const a = window.__etude; a.AN.selected = new Set([0]); a.anSelectionChanged(); a.pracSet('countIn', false); a.pracSet('wait', true); await a.scoreLoopStart(); });
  for (let pass = 1; pass <= 3; pass++) {
    await page.waitForFunction(want => { const a = window.__etude, r = a.SCORE.run; return r?.pass === want && a.PRAC.bar && a.PRAC.bar.seg === r.segs[0] && a.actx.currentTime >= r.segs[0].a0; }, pass);
    expect(await page.evaluate(() => window.__etude.PRAC.bar.got.size)).toBe(0);
    await page.evaluate(() => { const a = window.__etude; for (const m of [...a.PRAC.bar.need]) { a.handleNoteOn(m, 100); a.handleNoteOff(m); } });
  }
  await page.evaluate(() => window.__etude.scoreStop());
});

test('at 70 percent the cursor reaches each note at its scheduled audio onset after a rest', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await page.evaluate(() => window.__etude.pcOpen('brahms'));
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
  await page.locator('#score-speed').selectOption('70');
  await page.evaluate(async () => {
    const a = window.__etude, real = a.previewNote;
    window.cursorAudioChecks = [];
    a.previewNote = (midi, when, ...rest) => {
      const g = a.SCORE.geo, beat = a.scoreBeatAt(a.fallTime(when)), p = a.scoreCursorAt(beat);
      const note = a.AN.notes.find(n => n.midi === midi && Math.abs(n.start - beat) < 1e-7);
      const head = a.SCORE.heads.get(a.AN.notes.indexOf(note))[0].getBoundingClientRect();
      const page = g.pages[g.systems[p.sys].page].getBoundingClientRect();
      window.cursorAudioChecks.push({ beatError: Math.abs(beat - note.start), pixelError: Math.abs(p.x * g.scale - (head.x + head.width / 2 - page.x)) });
      return real(midi, when, ...rest);
    };
    a.pracSet('countIn', false);
    await a.scorePlay(false, 0);
  });
  await page.waitForFunction(() => window.cursorAudioChecks.length >= 4, null, { timeout: 8000 });
  const checks = await page.evaluate(() => window.cursorAudioChecks);
  expect(Math.max(...checks.map(c => c.beatError))).toBeLessThan(1e-7);
  expect(Math.max(...checks.map(c => c.pixelError))).toBeLessThan(3);
  await page.evaluate(() => window.__etude.scoreStop());
});

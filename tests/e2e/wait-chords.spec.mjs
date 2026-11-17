import { test, expect } from '../helpers/fixtures.mjs';
const chord = (arp = false) => ['C', 'E', 'G'].map((step, i) => `<note>${i ? '<chord/>' : ''}<pitch><step>${step}</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type>${arp && i === 2 ? '<notations><arpeggiate/></notations>' : ''}</note>`).join('');
const xml = (arp, repeat) => `<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><sound tempo="600"/></direction>${chord(arp)}${repeat ? '<barline location="right"><repeat direction="backward"/></barline>' : ''}</measure><measure number="2">${chord(false)}</measure></part></score-partwise>`;
async function start(app, page, { arp = false, repeat = false } = {}) {
  await app.open({ hash: 'analysis', dock: false });
  await page.locator('#an-file').setInputFiles({ name: 'chord.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml(arp, repeat)) });
  await page.waitForFunction(() => !window.__etude.AN.loading && window.__etude.SCORE.geo);
  await page.evaluate(async () => { const a = window.__etude; a.pracSet('countIn', false); a.pracSet('wait', true); await a.scorePlay(false, 0); });
  await page.waitForFunction(() => { const a = window.__etude; return a.PRAC.bar && a.actx.currentTime >= a.SCORE.run.segs[0].a0; });
  await page.evaluate(() => { const a = window.__etude; window.chordClock = a.actx.currentTime; Object.defineProperty(a.actx, 'currentTime', { configurable: true, get: () => window.chordClock }); });
}
const state = page => page.evaluate(() => { const a = window.__etude; return { t: a.PRAC.bar?.t, got: [...(a.PRAC.bar?.got || [])], judged: a.SCORE.run.judged.size, hits: a.PRAC.stats.perfect + a.PRAC.stats.good }; });

test('released notes and slowly assembled held chords do not pass; a fresh chord within 150ms does', async ({ app, page }) => {
  await start(app, page);
  await page.evaluate(() => { const a = window.__etude; for (const m of [60, 64, 67]) { a.handleNoteOn(m, 100); a.handleNoteOff(m); } });
  expect(await state(page)).toMatchObject({ t: 0, got: [], judged: 0, hits: 0 });
  await page.evaluate(() => { const a = window.__etude; for (const m of [60, 64, 67]) { a.handleNoteOn(m, 100); window.chordClock += .2; } });
  expect(await state(page)).toMatchObject({ t: 0, judged: 0 });
  await page.evaluate(() => { const a = window.__etude; for (const m of [60, 64, 67]) a.handleNoteOff(m); for (const m of [60, 64, 67]) { a.handleNoteOn(m, 100); window.chordClock += .04; } });
  expect((await state(page)).t).not.toBe(0);
  expect((await state(page)).hits).toBe(3);
});

test('pedal cannot replace released chord keys and extra wrong held keys block validation', async ({ app, page }) => {
  await start(app, page);
  await page.evaluate(() => { const a = window.__etude; a.midiIn(0xB0, 64, 127, 'midi'); for (const m of [60, 64, 67]) { a.handleNoteOn(m, 100); a.handleNoteOff(m); } });
  expect(await state(page)).toMatchObject({ t: 0, judged: 0 });
  expect(await page.evaluate(() => ({ held: window.__etude.held.size, sustained: window.__etude.sustained.size }))).toEqual({ held: 0, sustained: 3 });
  await page.evaluate(() => { const a = window.__etude; a.handleNoteOn(61, 100); for (const m of [60, 64, 67]) a.handleNoteOn(m, 100); });
  expect(await state(page)).toMatchObject({ t: 0, judged: 0 });
  await page.evaluate(() => window.__etude.handleNoteOff(61));
  expect((await state(page)).t).not.toBe(0);
  expect((await state(page)).hits).toBe(3);
});

test('pausing a partial chord does not mark any chord note complete', async ({ app, page }) => {
  await start(app, page);
  await page.evaluate(() => { const a = window.__etude; a.handleNoteOn(60, 100); a.scorePause(); });
  expect(await page.evaluate(() => [...window.__etude.SCORE.resume.run.judged])).toEqual([]);
  await page.evaluate(() => window.__etude.scoreToggle());
  await page.waitForFunction(() => !!window.__etude.SCORE.run);
  await page.evaluate(() => { const a = window.__etude; window.chordClock = a.SCORE.run.segs[0].a0 + .01; a.pracTick(); });
  expect(await state(page)).toMatchObject({ t: 0, got: [], judged: 0 });
  await page.evaluate(() => { const a = window.__etude; a.handleNoteOn(64, 100); a.handleNoteOn(67, 100); });
  expect((await state(page)).t).toBe(0);
  await page.evaluate(() => { const a = window.__etude; a.handleNoteOff(60); a.handleNoteOn(60, 100); });
  expect((await state(page)).t).not.toBe(0);
});

test('written arpeggios permit successive released attacks without relaxing ordinary chords', async ({ app, page }) => {
  await start(app, page, { arp: true });
  expect(await page.evaluate(() => window.__etude.PRAC.bar.rolled.size)).toBe(3);
  await page.evaluate(() => { const a = window.__etude; for (const m of [60, 64, 67]) { a.handleNoteOn(m, 100); a.handleNoteOff(m); window.chordClock += .3; } });
  expect((await state(page)).t).not.toBe(0);
  expect((await state(page)).hits).toBe(3);
});

test('a repeated chord needs fresh overlapping attacks on every pass', async ({ app, page }) => {
  await start(app, page, { repeat: true });
  await page.evaluate(() => { const a = window.__etude; for (const m of [60, 64, 67]) a.handleNoteOn(m, 100); });
  await page.evaluate(() => { const a = window.__etude; window.chordClock += .5; a.pracTick(); a.pracTick(); });
  expect(await state(page)).toMatchObject({ t: 0, got: [], judged: 0 });
  await page.evaluate(() => { const a = window.__etude; for (const m of [60, 64, 67]) { a.handleNoteOff(m); a.handleNoteOn(m, 100); a.handleNoteOff(m); } });
  expect((await state(page)).t).toBe(0);
  await page.evaluate(() => { const a = window.__etude; for (const m of [60, 64, 67]) a.handleNoteOn(m, 100); });
  expect((await state(page)).t).not.toBe(0);
});

import { test, expect } from '../helpers/fixtures.mjs';

const pedal = type => `<direction><direction-type><pedal type="${type}"/></direction-type></direction>`;
const note = step => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>`;
function scoreXml(withPedal) {
  return `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
    <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
    <direction><sound tempo="120"/></direction>
    ${withPedal ? pedal('start') : ''}${note('C')}
    ${withPedal ? pedal('change') : ''}${note('D')}${note('E')}
    ${withPedal ? pedal('stop') : ''}
    </measure></part>
  </score-partwise>`;
}

function scoreMidi() {
  const head = Buffer.from('4d54686400000006000000010060', 'hex');
  const track = Buffer.from('00b0407f 00903c40 60803c00 00903e40 60803e00 00904040 60804000 00b04000 00ff2f00'.replaceAll(' ', ''), 'hex');
  const chunk = Buffer.from('4d54726b00000000', 'hex');
  chunk.writeUInt32BE(track.length, 4);
  return [...Buffer.concat([head, chunk, track])];
}

async function playAttempt(page, { events, wait = false }) {
  await page.evaluate(async ({ events, wait }) => {
    const api = window.__etude;
    api.pracSet('wait', wait);
    await api.scorePlay(false, 0);
    const run = api.SCORE.run;
    const audio = api.actx;
    let now = run.segs[0].a0;
    Object.defineProperty(audio, 'currentTime', { configurable: true, get: () => now });
    const seek = (beat, offset = 0) => {
      const s = run.segs[0];
      now = s.a0 + (api.scoreSeconds(beat) - s.t0) / s.f + offset;
      api.pracTick();
    };
    try {
      for (const { beat, offset, midi, down, source = 'midi' } of events) {
        seek(beat, offset);
        if (midi == null) {
          api.midiIn(0xb0, 64, down ? 127 : 0, source);
        } else if (source === 'kbd') {
          api.handleNoteOn(midi, 100, source);
          api.handleNoteOff(midi, source);
        } else {
          api.midiIn(0x90, midi, 100, source);
          api.midiIn(0x80, midi, 0, source);
        }
      }
      const s = run.segs[0];
      now = s.a0 + (run.b - s.t0) / s.f + .301;
      api.pracTick();
    } finally {
      Reflect.deleteProperty(audio, 'currentTime');
    }
  }, { events, wait });
}

async function openImported(page, name, buffer) {
  await page.locator('#an-file').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(buffer) });
  await expect.poll(() => page.evaluate(() => window.__etude.AN.notes.map(n => n.midi))).toEqual([60, 62, 64]);
  await expect(page.locator('#an-roll svg')).toBeVisible();
}

test('an extra key lowers the note score while a correct MusicXML pedal change earns 100%', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await openImported(page, 'pedal-change.musicxml', scoreXml(true));
  await playAttempt(page, { events: [
    { beat: 0, midi: 60, source: 'ble' }, { beat: 0, offset: .04, down: true, source: 'ble' },
    { beat: 1, midi: 62 }, { beat: 1, offset: .02, down: false }, { beat: 1, offset: .08, down: true },
    { beat: 2, midi: 64 }, { beat: 2, offset: .08, midi: 65 }, { beat: 3, down: false },
  ] });
  await expect(page.locator('#pr-sum-acc')).toHaveText('75%');
  await expect(page.locator('#pr-sum-wrong')).toHaveText('1');
  await expect(page.locator('#pr-sum-extra')).toHaveText('Extra key: F4');
  await expect(page.locator('#pr-sum-sustain-acc')).toHaveText('100%');
  await expect(page.locator('#pr-sum-sustain-details')).toHaveText('Missed: 0 · Extra: 0');
});

test('Wait for me grades sustain on the score clock while it waits for the keys', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await openImported(page, 'wait-pedal.musicxml', scoreXml(true));
  await playAttempt(page, { wait: true, events: [
    { beat: 0, offset: 1, down: true }, { beat: 0, offset: 2, midi: 60 },
    { beat: 1, offset: 1, down: false }, { beat: 1, offset: 2, midi: 62 },
    { beat: 1, offset: .04, down: true }, { beat: 2, midi: 64 }, { beat: 3, down: false },
  ] });
  await expect(page.locator('#pr-sum-acc')).toHaveText('100%');
  await expect(page.locator('#pr-sum-sustain-acc')).toHaveText('100%');
});

test('an imported MIDI uses its CC64 reference and scores a missed lift separately', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await openImported(page, 'sustain.mid', scoreMidi());
  await playAttempt(page, { events: [
    { beat: 0, down: true }, { beat: 0, midi: 60 }, { beat: 0, offset: .04, down: true },
    { beat: 1, midi: 62 }, { beat: 2, midi: 64 },
  ] });
  await expect(page.locator('#pr-sum-acc')).toHaveText('100%');
  await expect(page.locator('#pr-sum-sustain-acc')).toHaveText('50%');
  await expect(page.locator('#pr-sum-sustain-details')).toHaveText('Missed: 1 · Extra: 0');
});

for (const withPedal of [true, false]) {
  test(`Wait for me counts stray notes and hides sustain without ${withPedal ? 'MIDI input' : 'written pedal'}`, async ({ app, page }) => {
    await app.open({ hash: 'analysis' });
    await openImported(page, 'wait.musicxml', scoreXml(withPedal));
    const source = withPedal ? 'kbd' : 'midi';
    await playAttempt(page, { wait: true, events: [
      { beat: 0, midi: 65, source }, { beat: 0, midi: 60, source },
      { beat: 1, midi: 62, source }, { beat: 2, midi: 64, source },
    ] });
    await expect(page.locator('#pr-sum-acc')).toHaveText('75%');
    await expect(page.locator('#pr-sum-wrong')).toHaveText('1');
    await expect(page.locator('#pr-sum-sustain')).toBeHidden();
  });
}

test('See mistakes lists measure-grouped errors, jumps to the measure with symbol+text, and Repeat passage sets clamped A-B loop', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  const multiBarXml = `<score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
    <part id="P1">
      <measure number="1"><attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><sound tempo="120"/></direction>${note('C')}${note('D')}</measure>
      <measure number="2">${note('E')}${note('F')}</measure>
      <measure number="3">${note('G')}${note('A')}</measure>
      <measure number="4">${note('B')}${note('C')}</measure>
    </part>
  </score-partwise>`;
  await page.locator('#an-file').setInputFiles({ name: 'four-bars.musicxml', mimeType: 'application/xml', buffer: Buffer.from(multiBarXml) });
  await expect.poll(() => page.evaluate(() => window.__etude.SCORE.measures.length)).toBe(4);
  await expect(page.locator('#an-roll svg').first()).toBeVisible();

  await page.evaluate(async () => {
    const api = window.__etude;
    api.pracSet('wait', false);
    await api.scorePlay(false, 0);
    const run = api.SCORE.run;
    const audio = api.actx;
    let now = run.segs[0].a0;
    Object.defineProperty(audio, 'currentTime', { configurable: true, get: () => now });
    const seek = (beat, offset = 0) => {
      const s = run.segs[0];
      now = s.a0 + (api.scoreSeconds(beat) - s.t0) / s.f + offset;
      api.pracTick();
    };
    try {
      // Bar 1 clean (C4, D4)
      seek(0); api.midiIn(0x90, 60, 100, 'midi'); api.midiIn(0x80, 60, 0, 'midi');
      seek(1); api.midiIn(0x90, 62, 100, 'midi'); api.midiIn(0x80, 62, 0, 'midi');
      // Bar 2 (beats 2-3): extra C#4 on beat 2, miss beat 3 F4
      seek(2); api.midiIn(0x90, 64, 100, 'midi'); api.midiIn(0x80, 64, 0, 'midi');
      seek(2, 0.05); api.midiIn(0x90, 61, 100, 'midi'); api.midiIn(0x80, 61, 0, 'midi');
      // Bar 3 & 4 played cleanly
      seek(4); api.midiIn(0x90, 67, 100, 'midi'); api.midiIn(0x80, 67, 0, 'midi');
      seek(5); api.midiIn(0x90, 69, 100, 'midi'); api.midiIn(0x80, 69, 0, 'midi');
      seek(6); api.midiIn(0x90, 71, 100, 'midi'); api.midiIn(0x80, 71, 0, 'midi');
      seek(7); api.midiIn(0x90, 60, 100, 'midi'); api.midiIn(0x80, 60, 0, 'midi');
      const s = run.segs[0];
      now = s.a0 + (run.b - s.t0) / s.f + .301;
      api.pracTick();
    } finally {
      Reflect.deleteProperty(audio, 'currentTime');
    }
  });

  const seeBtn = page.locator('#pr-see-mistakes');
  await expect(seeBtn).toBeVisible();
  await seeBtn.click();
  await expect(page.locator('#pr-mistakes-panel')).toBeVisible();
  const bar2Row = page.locator('#pr-mistakes-list .pr-mistake-item').first();
  await expect(bar2Row).toContainText('Bar 2');
  await expect(bar2Row).toContainText(/Extra|Missed/);

  await bar2Row.locator('[data-mistake-jump]').click();
  await expect(page.locator('#pr-sum')).toBeHidden();
  await expect(page.locator('#sc-mistake-bar')).toBeVisible();
  await expect(page.locator('#sc-mistake-bar')).toContainText('⚠');
  await expect(page.locator('#sc-mistake-txt')).toContainText('Bar 2');
  expect(await page.evaluate(() => [window.__etude.SCORE.mrange?.a, window.__etude.SCORE.mrange?.b])).toEqual([1, 1]);

  await page.locator('#sc-mistake-repeat').click();
  const ab = await page.evaluate(() => {
    const E = window.__etude;
    return [E.PRAC.A, E.PRAC.B, E.scoreSeconds(E.SCORE.measures[0].start), E.scoreSeconds(E.SCORE.measures[2].end)];
  });
  // Bar 2 (index 1) passage with +-1 context -> Bars 1..3 (indices 0..2)
  expect(ab[0]).toBeCloseTo(ab[2], 3);
  expect(ab[1]).toBeCloseTo(ab[3], 3);
});

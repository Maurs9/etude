import { test, expect } from '../helpers/fixtures.mjs';

const wholeNote = '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>';
const attributes = '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';
function xmlScore(bars, directions = [], contents = []) {
  const measures = Array.from({ length: bars }, (_, i) =>
    `<measure number="${i + 1}">${i === 0 ? attributes : ''}${directions[i] ?? ''}${contents[i] ?? wholeNote}</measure>`).join('');
  return '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>' +
    `<part id="P1">${measures}</part></score-partwise>`;
}

function mark(unit, bpm, dot = '', sound = '') {
  return `<direction><direction-type><metronome><beat-unit>${unit}</beat-unit>${dot}<per-minute>${bpm}</per-minute></metronome></direction-type>${sound}</direction>`;
}

function vlq(value) {
  const bytes = [value & 127];
  for (value >>= 7; value; value >>= 7) bytes.unshift((value & 127) | 128);
  return bytes;
}

function midiScore(events) {
  const track = Buffer.from([...events.flatMap(([delta, ...message]) => [...vlq(delta), ...message]), 0, 0xff, 0x2f, 0]);
  const header = Buffer.from('4d546864000000060000000100604d54726b00000000', 'hex');
  header.writeUInt32BE(track.length, 18);
  return Buffer.concat([header, track]);
}

async function openScore(page, name, bytes) {
  await page.locator('#an-file').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
  await expect(page.locator('#an-name')).toHaveText(name);
  await expect(page.locator('#score-play')).toBeEnabled();
}

test('MusicXML playback uses printed beat units and offsets, with explicit sound tempo taking precedence', async ({ app }) => {
  const page = await app.open({ hash: 'analysis' });
  const dotted = mark('eighth', 120, '<beat-unit-dot/>').replace('</direction>', '<offset>1</offset></direction>');
  await openScore(page, 'tempo.musicxml', xmlScore(4, [
    mark('quarter', 60), dotted,
    mark('half', 90, '', '<sound tempo="120"/>'),
  ]));
  const playback = await page.evaluate(() => ({
    tempos: window.__etude.SCORE.tempoList,
    times: [0, 4, 5, 8, 16].map(window.__etude.scoreSeconds),
  }));
  expect(playback.tempos).toEqual([{ beat: 0, bpm: 60 }, { beat: 5, bpm: 90 }, { beat: 8, bpm: 120 }]);
  expect(playback.times).toEqual([0, 4, 5, 7, 11]);
});

test('MIDI starts at 120 BPM before the first explicit tempo change', async ({ app }) => {
  const page = await app.open({ hash: 'analysis' });
  await openScore(page, 'tempo.mid', midiScore([
    [0, 0x90, 60, 64],
    [384, 0xff, 0x51, 0x03, 0x0f, 0x42, 0x40],
    [0, 0x80, 60, 0], [0, 0x90, 64, 64], [384, 0x80, 64, 0],
  ]));
  expect(await page.evaluate(() => [window.__etude.scoreSeconds(4), window.__etude.fallEnd()])).toEqual([2, 6]);
});

test('MIDI sustain changes playback without extending written notes or other channels', async ({ app }) => {
  const page = await app.open({ hash: 'analysis' });
  await openScore(page, 'pedal.mid', midiScore([
    [0, 0xB0, 64, 127], [0, 0x90, 60, 64], [0, 0x91, 64, 64],
    [96, 0x80, 60, 0], [0, 0x81, 64, 0],
    [96, 0x90, 60, 64], [96, 0x80, 60, 0], [96, 0xB0, 64, 0],
  ]));
  expect(await page.evaluate(() => window.__etude.fallData().map(({ n, start, finish, sound }) =>
    [n.midi, start, finish, sound]))).toEqual([[60, 0, .5, 1], [64, 0, .5, .5], [60, 1, 1.5, 2]]);
  expect(await page.evaluate(() => window.__etude.fallEnd())).toBe(2);
  await page.evaluate(() => {
    const app = window.__etude;
    const preview = app.previewNote;
    window.__pedalPlayback = [];
    app.previewNote = (midi, when, duration, velocity, options) => {
      window.__pedalPlayback.push({ midi, duration, hold: options?.hold });
      return preview(midi, when, duration, velocity, options);
    };
  });
  await page.locator('#score-play').click();
  await expect.poll(() => page.evaluate(() => window.__pedalPlayback.find(note => note.midi === 60)))
    .toEqual({ midi: 60, duration: 1, hold: true });
});

test('a newer failed import restores the last successful score when engraving is in flight', async ({ app }) => {
  const page = await app.open({ hash: 'analysis' });
  await openScore(page, 'original.musicxml', xmlScore(4));
  await expect.poll(() => page.evaluate(async () => (await window.__etude.scoreLibraryStore.libraryList()).length)).toBe(1);
  await page.evaluate(xml => {
    const prototype = window.opensheetmusicdisplay.OpenSheetMusicDisplay.prototype;
    const load = prototype.load;
    prototype.load = async function (...args) {
      prototype.load = load;
      await new Promise(resolve => { window.__releaseScoreLoad = resolve; });
      return load.apply(this, args);
    };
    window.__pendingScore = window.__etude.anOpenFile(new File([xml], 'superseded.musicxml'));
  }, xmlScore(2));
  await page.waitForFunction(() => typeof window.__releaseScoreLoad === 'function');
  await page.locator('#an-file').setInputFiles({ name: 'broken.musicxml', mimeType: 'application/xml', buffer: Buffer.from('broken') });
  await expect(page.locator('#an-msg')).toHaveText(/MusicXML/i);
  await expect(page.locator('#score-play')).toBeEnabled();
  expect(await page.evaluate(() => {
    window.__releaseScoreLoad();
    return window.__pendingScore;
  })).toBe(false);
  await expect(page.locator('#an-name')).toHaveText('original.musicxml');
  await expect(page.locator('#an-roll svg').first()).toBeVisible();
  expect(await page.evaluate(async () => (await window.__etude.scoreLibraryStore.libraryList()).length)).toBe(1);
});

test('failed reconstruction and layout leave the current score and library checkpoint usable', async ({ app }) => {
  const page = await app.open({ hash: 'analysis' });
  await openScore(page, 'original.musicxml', xmlScore(4));
  await expect.poll(() => page.evaluate(async () => (await window.__etude.scoreLibraryStore.libraryList()).length)).toBe(1);
  await page.keyboard.press('End');
  await page.keyboard.press('[');
  await page.keyboard.press(']');
  await expect(page.locator('#an-loop')).toBeEnabled();
  const readPosition = () => page.evaluate(() => [window.__etude.FALL.position, window.__etude.PRAC.A, window.__etude.PRAC.B]);
  const before = await readPosition();

  const longMidi = midiScore([[2010 * 4 * 96, 0x90, 60, 64], [96, 0x80, 60, 0]]);
  await page.locator('#an-file').setInputFiles({ name: 'long.mid', mimeType: 'audio/midi', buffer: longMidi });
  await expect(page.locator('#an-msg')).toContainText(/too long/);
  expect(await readPosition()).toEqual(before);
  await expect(page.locator('#an-roll svg').first()).toBeVisible();

  const result = await page.evaluate(async xml => {
    const app = window.__etude;
    const repair = app.scoreFixPedals;
    app.scoreFixPedals = () => false;
    try {
      return await app.anOpenFile(new File([xml], 'layout.musicxml', { type: 'application/xml' }));
    } finally {
      app.scoreFixPedals = repair;
    }
  }, xmlScore(1));
  expect(result).toBe(false);
  await expect(page.locator('#an-name')).toHaveText('original.musicxml');
  await expect(page.locator('#an-roll svg').first()).toBeVisible();
  expect(await readPosition()).toEqual(before);
  expect(await page.evaluate(async () => (await window.__etude.scoreLibraryStore.libraryList()).length)).toBe(1);
  await expect(page.locator('#an-loop')).toBeEnabled();
  await page.locator('#an-loop').click();
  await expect(page.locator('#an-loop')).toHaveAttribute('aria-pressed', 'true');

  await openScore(page, 'short.musicxml', xmlScore(1));
  await expect(page.locator('#an-loop')).toBeDisabled();
  expect(await readPosition()).toEqual([0, null, null]);
});

test('named and source-backed tempo directions have specific meanings', async ({ app }) => {
  const page = await app.open({ hash: 'analysis' });
  await openScore(page, 'directions.musicxml', xmlScore(3, [
    '<direction placement="above"><direction-type><words>Poco moto</words></direction-type></direction>',
    '<direction placement="above"><direction-type><words>66</words></direction-type><sound tempo="66"/></direction>',
    '<direction placement="above"><direction-type><words>66</words></direction-type></direction>',
  ]));
  await expect(page.locator('#an-roll [data-sym][aria-label*="gently flowing pace"]')).toHaveCount(1);
  await expect(page.locator('#an-roll [data-sym][aria-label*="66 beats per minute"]')).toHaveCount(1);
});

test('A–B Loop requires a note onset and allows a trailing rest in a playable bar', async ({ app }) => {
  const page = await app.open({ hash: 'analysis' });
  const barRest = '<note><rest measure="yes"/><duration>4</duration></note>';
  const finalBar = '<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>' +
    '<note><rest/><duration>3</duration><type>half</type><dot/></note>';
  await openScore(page, 'rests.musicxml', xmlScore(3, [], [wholeNote, barRest, finalBar]));
  const seek = value => page.locator('#fall-seek').evaluate((slider, position) => {
    slider.value = String(position);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await seek(3);
  await page.keyboard.press('[');
  await page.keyboard.press(']');
  const loop = page.locator('#an-loop');
  await expect(loop).toBeDisabled();
  await seek(4.25);
  await page.keyboard.press('[');
  await page.keyboard.press(']');
  await expect(loop).toBeEnabled();
  await loop.click();
  await expect(loop).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__etude.SCORE.loop.b)).toBe(6);
});

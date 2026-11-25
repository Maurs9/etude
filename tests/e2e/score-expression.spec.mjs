import { test, expect } from '../helpers/fixtures.mjs';

test.use({ viewport: { width: 1280, height: 900 } });

function note(step, oct, dur, type, staff, voice, extra = '') {
  return `<note><pitch><step>${step}</step><octave>${oct}</octave></pitch><duration>${dur}</duration><voice>${voice}</voice><type>${type}</type><staff>${staff}</staff>${extra}</note>`;
}

const EXPRESSIVE_XML = `<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>200</per-minute></metronome></direction-type><sound tempo="200"/></direction>
      ${note('C', 5, 1, 'quarter', 1, 1, '<notations><slur type="start" number="1"/></notations>')}
      ${note('E', 5, 1, 'quarter', 1, 1)}
      ${note('G', 5, 1, 'quarter', 1, 1)}
      ${note('F', 5, 1, 'quarter', 1, 1, '<notations><slur type="stop" number="1"/></notations>')}
      <backup><duration>4</duration></backup>
      ${note('C', 3, 2, 'half', 2, 2)}
      ${note('G', 3, 2, 'half', 2, 2)}
    </measure>
    <measure number="2">
      <direction placement="above"><direction-type><words>cresc.</words></direction-type></direction>
      ${note('E', 5, 2, 'half', 1, 1, '<notations><ornaments><trill-mark/></ornaments></notations>')}
      ${note('D', 5, 1, 'quarter', 1, 1)}
      ${note('C', 5, 1, 'quarter', 1, 1)}
      <backup><duration>4</duration></backup>
      ${note('C', 3, 4, 'whole', 2, 2)}
    </measure>
    <measure number="3">
      <direction placement="above"><direction-type><words>rit.</words></direction-type></direction>
      ${note('G', 4, 1, 'quarter', 1, 1)}
      ${note('A', 4, 1, 'quarter', 1, 1)}
      ${note('B', 4, 1, 'quarter', 1, 1)}
      ${note('C', 5, 1, 'quarter', 1, 1)}
      <backup><duration>4</duration></backup>
      ${note('G', 2, 2, 'half', 2, 2)}
      ${note('B', 2, 2, 'half', 2, 2)}
    </measure>
    <measure number="4">
      <direction placement="above"><direction-type><words>a tempo</words></direction-type></direction>
      ${note('D', 5, 2, 'half', 1, 1)}
      ${note('C', 5, 2, 'half', 1, 1, '<notations><fermata/></notations>')}
      <backup><duration>4</duration></backup>
      ${note('G', 2, 2, 'half', 2, 2)}
      ${note('C', 3, 2, 'half', 2, 2, '<notations><fermata/></notations>')}
    </measure>
  </part>
</score-partwise>`;

function vlq(value) {
  const bytes = [value & 127];
  for (value >>= 7; value; value >>= 7) bytes.unshift((value & 127) | 128);
  return bytes;
}

function flatMidiScore() {
  const events = [
    [0, 0x90, 72, 80],
    [0, 0x90, 64, 80],
    [0, 0x90, 48, 80],
    [96, 0x80, 72, 0],
    [0, 0x80, 64, 0],
    [0, 0x80, 48, 0],
    [0, 0x90, 74, 80],
    [0, 0x90, 55, 80],
    [96, 0x80, 74, 0],
    [0, 0x80, 55, 0],
  ];
  const track = Buffer.from([...events.flatMap(([delta, ...message]) => [...vlq(delta), ...message]), 0, 0xff, 0x2f, 0]);
  const header = Buffer.from('4d546864000000060000000100604d54726b00000000', 'hex');
  header.writeUInt32BE(track.length, 18);
  return Buffer.concat([header, track]);
}

async function openScore(page, name, mimeType, buffer) {
  await page.locator('#an-file').setInputFiles({ name, mimeType, buffer });
  await expect(page.locator('#an-name')).toHaveText(name);
  await expect(page.locator('#score-play')).toBeEnabled();
}

async function openPracticeOptions(page) {
  const opt = page.locator('#pr-opt');
  if ((await opt.getAttribute('aria-expanded')) !== 'true') await opt.click();
  await expect(page.locator('#pr-expressive')).toBeVisible();
}

test('applies expressive tempo, voicing, legato, ornaments, and respects toggle, persistence, and metronome', async ({ app }) => {
  const page = await app.open({ hash: 'analysis' });
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  await openScore(page, 'expressive.musicxml', 'application/xml', Buffer.from(EXPRESSIVE_XML));
  await openPracticeOptions(page);
  await expect(page.locator('#pr-expressive')).toBeChecked();

  // Expressive tempo curve reflects rit., a tempo restore, and fermata stretch.
  const expressiveInfo = await page.evaluate(() => {
    const appApi = window.__etude;
    const tempos = appApi.SCORE.tempoList;
    const plan = appApi.scoreExpressionPlan();
    const notes = appApi.AN.notes;
    const rhMelody = notes.findIndex(n => n.start === 0 && n.midi === 72);
    const lhBass = notes.findIndex(n => n.start === 0 && n.midi === 48);
    const trillIdx = notes.findIndex(n => n.start === 4 && n.midi === 76);
    const slurEndIdx = notes.findIndex(n => n.start === 3 && n.midi === 77);
    return {
      tempos,
      melodyVel: plan[rhMelody].vel,
      bassVel: plan[lhBass].vel,
      slurStartLegato: plan[rhMelody].legatoOverlapSec,
      slurEndScale: plan[slurEndIdx].durationScale,
      trillNotes: plan[trillIdx].ornamentEvents?.map(e => e.midi),
    };
  });
  expect(expressiveInfo.tempos[0]).toEqual({ beat: 0, bpm: 200 });
  expect(expressiveInfo.tempos.some(t => t.beat >= 8 && t.beat < 12 && t.bpm < 175)).toBe(true);
  expect(expressiveInfo.tempos.find(t => Math.abs(t.beat - 12) < 1e-6)?.bpm).toBe(200);
  expect(expressiveInfo.tempos.find(t => Math.abs(t.beat - 14) < 1e-6)?.bpm).toBeCloseTo(200 / 1.75, 1);
  expect(expressiveInfo.melodyVel).toBeGreaterThan(expressiveInfo.bassVel);
  expect(expressiveInfo.slurStartLegato).toBeGreaterThan(0);
  expect(expressiveInfo.slurEndScale).toBeLessThan(1);
  expect(expressiveInfo.trillNotes?.length).toBeGreaterThanOrEqual(3);
  expect(expressiveInfo.trillNotes).toContain(77); // diatonic F5 above E5 in C major

  // Spy on previewNote during playback to verify voicing, legato, and trill sub-notes are scheduled.
  await page.evaluate(() => {
    const appApi = window.__etude;
    const orig = appApi.previewNote;
    window.__exprEvents = [];
    appApi.previewNote = (midi, when, duration, velocity, options) => {
      window.__exprEvents.push({ midi, when, duration, velocity, options });
      return orig(midi, when, duration, velocity, options);
    };
  });
  await page.locator('#score-play').click();
  await expect.poll(() => page.evaluate(() => window.__exprEvents.some(e => e.midi === 77 && e.duration < 0.15))).toBe(true);
  const scheduled = await page.evaluate(() => window.__exprEvents);
  const firstMelody = scheduled.find(e => e.midi === 72);
  const firstBass = scheduled.find(e => e.midi === 48);
  expect(firstMelody.velocity).toBeGreaterThan(firstBass.velocity);
  expect(firstMelody.duration).toBeGreaterThan(0.31); // includes legato overlap at 200 BPM (0.3s quarter + 0.032s)
  await page.locator('#score-stop').click();

  // Metronome active with expressive playback keeps strict tempo & zero onset shifts.
  await page.locator('#an-tools-btn').click();
  await page.locator('#an-metro').click();
  const metroState = await page.evaluate(() => ({
    tempos: window.__etude.SCORE.tempoList,
    shifts: window.__etude.scoreExpressionPlan().map(p => p.onsetShiftSec),
  }));
  expect(metroState.tempos).toEqual([{ beat: 0, bpm: 200 }]);
  expect(metroState.shifts.every(s => s === 0)).toBe(true);
  await page.locator('#an-metro').click();
  await page.locator('#an-tools-btn').click();

  // Unchecking Expressive playback restores strict tempo + raw velocities and persists across reload.
  await page.locator('#pr-expressive').uncheck();
  const rawState = await page.evaluate(() => ({
    tempos: window.__etude.SCORE.tempoList,
    plan: window.__etude.scoreExpressionPlan(),
    notes: window.__etude.AN.notes,
  }));
  expect(rawState.tempos).toEqual([{ beat: 0, bpm: 200 }]);
  expect(rawState.plan.every((p, i) => p.vel === rawState.notes[i].vel && p.onsetShiftSec === 0 && p.durationScale === 1 && !p.ornamentEvents)).toBe(true);

  await page.reload();
  await page.waitForFunction(() => typeof window.__etude?.show === 'function');
  await openScore(page, 'expressive.musicxml', 'application/xml', Buffer.from(EXPRESSIVE_XML));
  await openPracticeOptions(page);
  await expect(page.locator('#pr-expressive')).not.toBeChecked();

  // Re-enabling expressive playback shapes flat-velocity MIDI files too.
  await page.locator('#pr-expressive').check();
  await openScore(page, 'flat.mid', 'audio/midi', flatMidiScore());
  const midiPlan = await page.evaluate(() => {
    const appApi = window.__etude;
    const notes = appApi.AN.notes;
    const plan = appApi.scoreExpressionPlan();
    const melody = notes.findIndex(n => n.midi === 72);
    const inner = notes.findIndex(n => n.midi === 64);
    const bass = notes.findIndex(n => n.midi === 48);
    return {
      melodyVel: plan[melody].vel,
      innerVel: plan[inner].vel,
      bassVel: plan[bass].vel,
    };
  });
  expect(midiPlan.melodyVel).toBeGreaterThan(midiPlan.innerVel);
  expect(midiPlan.melodyVel).toBeGreaterThan(midiPlan.bassVel);

  expect(consoleErrors).toEqual([]);
});

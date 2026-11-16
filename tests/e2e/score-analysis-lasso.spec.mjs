import { test, expect } from '../helpers/fixtures.mjs';

function imagineStyleXml() {
  const n = (step, octave, dur, type, staff, voice, { chord = false } = {}) =>
    `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${dur}</duration><voice>${voice}</voice><type>${type}</type><staff>${staff}</staff></note>`;

  const bar1 = [
    '<attributes>',
    '<divisions>2</divisions>',
    '<key><fifths>0</fifths><mode>major</mode></key>',
    '<time><beats>4</beats><beat-type>4</beat-type></time>',
    '<staves>2</staves>',
    '<clef number="1"><sign>G</sign><line>2</line></clef>',
    '<clef number="2"><sign>F</sign><line>4</line></clef>',
    '</attributes>',
    '<harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>',
    // RH: C5 half + C5 half (clean upper melody)
    n('C', 5, 4, 'half', 1, 1),
    n('C', 5, 4, 'half', 1, 1),
    '<backup><duration>8</duration></backup>',
    // Damper pedal across bar 1
    '<direction placement="below"><direction-type><pedal type="start" line="yes"/></direction-type><staff>2</staff></direction>',
    // LH broken chord: (E3+G3) eighth, C3 eighth x3, then (E3+B3) eighth, C3 eighth
    n('E', 3, 1, 'eighth', 2, 2), n('G', 3, 1, 'eighth', 2, 2, { chord: true }), n('C', 3, 1, 'eighth', 2, 2),
    n('E', 3, 1, 'eighth', 2, 2), n('G', 3, 1, 'eighth', 2, 2, { chord: true }), n('C', 3, 1, 'eighth', 2, 2),
    n('E', 3, 1, 'eighth', 2, 2), n('G', 3, 1, 'eighth', 2, 2, { chord: true }), n('C', 3, 1, 'eighth', 2, 2),
    n('E', 3, 1, 'eighth', 2, 2), n('B', 3, 1, 'eighth', 2, 2, { chord: true }), n('C', 3, 1, 'eighth', 2, 2),
    '<direction placement="below"><direction-type><pedal type="stop"/></direction-type><staff>2</staff></direction>',
  ].join('');

  const bar2 = [
    '<harmony><root><root-step>F</root-step></root><kind>major</kind></harmony>',
    n('A', 4, 8, 'whole', 1, 1),
    '<backup><duration>8</duration></backup>',
    n('F', 3, 4, 'half', 2, 2), n('C', 4, 4, 'half', 2, 2, { chord: true }),
    n('F', 3, 4, 'half', 2, 2), n('A', 3, 4, 'half', 2, 2, { chord: true }),
  ].join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Broken Chord Etude</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">${bar1}</measure>
    <measure number="2">${bar2}</measure>
  </part>
</score-partwise>`;
}

async function loadImagineScore(page) {
  const xml = imagineStyleXml();
  await page.locator('#an-file').setInputFiles({
    name: 'broken-chord.musicxml',
    mimeType: 'application/xml',
    buffer: Buffer.from(xml),
  });
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo && window.__etude.AN.notes.length >= 16);
}

test('parses MusicXML <harmony>, reads broken-chord C major without Cmaj7/E, and analyzes isolated notes with clickable neighbors', async ({ app, page }) => {
  await app.open({ hash: 'analysis', dock: false });
  await loadImagineScore(page);

  // Open Analysis panel via toolbar button (desktop) or FAB (narrow)
  if (!await page.locator('#an-side').isVisible()) {
    const btn = page.locator('#an-side-btn');
    if (await btn.isVisible()) await btn.click();
    else await page.locator('#an-fab').click();
  }
  await expect(page.locator('#an-side')).toBeVisible();

  // Check XML harmony extraction & bar 1 harmonic analysis (C major root position, not Cmaj7/E)
  const analysis = await page.evaluate(() => {
    const api = window.__etude;
    const doc = new DOMParser().parseFromString(api.SCORE.xml, 'application/xml');
    const parsed = api.scoreXmlNotes(doc);
    const bar1 = api.AN.view.segs[0];
    return {
      harmonies: parsed.harmonies,
      bar1Root: bar1?.ch.root,
      bar1Suffix: bar1?.ch.c.s,
      bar1Bass: bar1?.bass,
      allNoteMidis: api.AN.notes.map((n, i) => ({ i, midi: n.midi, start: n.start })),
    };
  });
  expect(analysis.harmonies).toHaveLength(2);
  expect(analysis.harmonies[0].root).toBe(0);
  expect(analysis.harmonies[1].root).toBe(5);
  expect(analysis.bar1Root).toBe(0);
  expect(analysis.bar1Suffix).toBe('');
  expect(analysis.bar1Bass).toBe(0);

  // Click single C3 notehead (midi 48, beat 0.5)
  const c3Info = analysis.allNoteMidis.find((x) => x.midi === 48);
  expect(c3Info).toBeDefined();
  const c3Head = page.locator(`#an-roll [data-i="${c3Info.i}"]`).first();
  await c3Head.scrollIntoViewIfNeeded();
  await c3Head.click();

  // Manual isolated note selection renders in #an-now-body, keeping #an-sel hidden
  await expect(page.locator('#an-sel')).toBeHidden();
  await expect(page.locator('#an-now-body .an-note-card')).toBeVisible();
  await expect(page.locator('#an-now-body .an-note-card')).toContainText('C3');
  await expect(page.locator('#an-now-body .an-note-card')).toContainText('Degree 1');
  await expect(page.locator('#an-now-body .an-note-card')).not.toContainText('Cmaj7');

  // Neighboring notes section shows clickable neighbors and neighboring chord C
  const nbWrap = page.locator('#an-now-body .an-nb-wrap');
  await expect(nbWrap).toBeVisible();
  await expect(nbWrap).toContainText('Chord with neighbors: C');
  const firstNbBtn = nbWrap.locator('.an-nb-btn[data-nb-idx]').first();
  const nbIdx = Number(await firstNbBtn.getAttribute('data-nb-idx'));
  await firstNbBtn.click();

  await expect.poll(() => page.evaluate(() => [...window.__etude.AN.selected])).toEqual([nbIdx]);
  await expect(page.locator('#an-now-body .an-note-card')).toBeVisible();
});

test('lasso selection is default, supports closed-loop free-shape circling and pen input, and toggles cleanly to marquee box', async ({ app, page }) => {
  await app.open({ hash: 'analysis', dock: false });
  await loadImagineScore(page);

  if (!await page.locator('#an-side').isVisible()) {
    const btn = page.locator('#an-side-btn');
    if (await btn.isVisible()) await btn.click();
    else await page.locator('#an-fab').click();
  }

  // Lasso mode button defaults to aria-pressed="true"
  const modeBtn = page.locator('#an-sel-mode');
  await expect(modeBtn).toBeVisible();
  await expect(modeBtn).toHaveAttribute('aria-pressed', 'true');

  // Compute bounding boxes of three specific notes on beat 1 (C5 RH + E3 + G3 LH),
  // avoiding a 4th interior/adjacent note (C3 on beat 1.5) using a narrow diagonal polygon.
  const pts = await page.evaluate(() => {
    const api = window.__etude;
    const heads = [];
    api.SCORE.heads.forEach((list, i) => {
      const n = api.AN.notes[i];
      const g = list[0];
      if (!n || !g) return;
      const r = g.getBoundingClientRect();
      heads.push({ i, midi: n.midi, start: n.start, cx: r.x + r.width / 2, cy: r.y + r.height / 2 });
    });
    const e3 = heads.find((h) => h.midi === 52 && Math.abs(h.start) < 1e-3);
    const g3 = heads.find((h) => h.midi === 55 && Math.abs(h.start) < 1e-3);
    const c3Next = heads.find((h) => h.midi === 48 && Math.abs(h.start - 0.5) < 1e-3);
    return { e3, g3, c3Next };
  });
  expect(pts.e3 && pts.g3 && pts.c3Next).toBeTruthy();

  // Circle tightly around E3 + G3 and return close to the start point (closed-loop test!)
  const cx = (pts.e3.cx + pts.g3.cx) / 2;
  const x0 = cx - 14;
  const x1 = cx + 14;
  const yTop = Math.min(pts.e3.cy, pts.g3.cy) - 14;
  const yBot = Math.max(pts.e3.cy, pts.g3.cy) + 14;
  // Ensure x1 stays left of next eighth note C3
  const safeRight = Math.min(x1, pts.c3Next.cx - 4);

  await page.mouse.move(x0, yTop);
  await page.mouse.down();
  await page.mouse.move(safeRight, yTop, { steps: 4 });
  await page.mouse.move(safeRight, yBot, { steps: 4 });
  // Lasso SVG overlay must appear while dragging
  await expect(page.locator('.an-lasso .an-lasso-path')).toBeVisible();
  await page.mouse.move(x0, yBot, { steps: 4 });
  // Return to (x0 + 1, yTop + 1) — within 2px of pointerdown — verifying `dragged` flag still completes lasso!
  await page.mouse.move(x0 + 1, yTop + 1, { steps: 4 });
  await page.mouse.up();

  await expect(page.locator('.an-lasso')).toHaveCount(0);

  const selectedIndices = await page.evaluate(() => [...window.__etude.AN.selected]);
  expect(selectedIndices).toContain(pts.e3.i);
  expect(selectedIndices).toContain(pts.g3.i);
  expect(selectedIndices).not.toContain(pts.c3Next.i);
  // Two selected notes render as interval card with neighbors, not whole-bar Cmaj7/E
  await expect(page.locator('#an-now-body .an-note-card')).toBeVisible();
  await expect(page.locator('#an-now-body .an-note-card')).toContainText('Minor 3rd');

  // Stylus hover sets .is-pen on #an-roll
  await page.locator('#an-roll').dispatchEvent('pointerenter', { pointerType: 'pen' });
  await expect(page.locator('#an-roll')).toHaveClass(/is-pen/);

  // Toggle to rectangular marquee box mode
  await modeBtn.click();
  await expect(modeBtn).toHaveAttribute('aria-pressed', 'false');

  await page.mouse.move(x0, yTop);
  await page.mouse.down();
  await page.mouse.move(safeRight, yBot, { steps: 4 });
  await expect(page.locator('.an-marquee')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.an-marquee')).toHaveCount(0);
});

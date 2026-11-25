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

test('lasso shape is default, supports closed-loop free-shape circling and pen input, and toggles cleanly to marquee box', async ({ app, page }) => {
  await app.open({ hash: 'analysis', dock: false });
  await loadImagineScore(page);

  if (!await page.locator('#an-side').isVisible()) {
    const btn = page.locator('#an-side-btn');
    if (await btn.isVisible()) await btn.click();
    else await page.locator('#an-fab').click();
  }

  // Desktop (fine pointer) defaults to Select while Navigate stays available
  await page.locator('#an-tools-btn').click();
  await expect(page.locator('#an-tool-select')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#an-tool-hand')).toHaveAttribute('aria-pressed', 'false');

  // Lasso mode button defaults to aria-pressed="true"
  const modeBtn = page.locator('#an-sel-mode');
  await expect(modeBtn).toBeVisible();
  await expect(modeBtn).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#an-tools-btn').click();

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

  // Switch to Navigate mode, clear selection, and verify stylus pen still selects directly via lasso
  await page.locator('#an-tools-btn').click();
  await page.locator('#an-tool-hand').click();
  await expect(page.locator('#an-tool-hand')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#an-clear').click();
  await page.locator('#an-tools-btn').click();
  await expect.poll(() => page.evaluate(() => window.__etude.AN.selected.size)).toBe(0);

  await page.locator('#an-roll').dispatchEvent('pointerenter', { pointerType: 'pen' });
  await expect(page.locator('#an-roll')).toHaveClass(/is-pen/);
  await page.evaluate(({ x0, safeRight, yTop, yBot }) => {
    const roll = document.getElementById('an-roll');
    const fire = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 7, pointerType: 'pen', button: 0,
      clientX: x, clientY: y,
    }));
    fire(roll, 'pointerdown', x0, yTop);
    fire(window, 'pointermove', safeRight, yTop);
    fire(window, 'pointermove', safeRight, yBot);
    fire(window, 'pointermove', x0, yBot);
    fire(window, 'pointermove', x0 + 1, yTop + 1);
    fire(window, 'pointerup', x0 + 1, yTop + 1);
  }, { x0, safeRight, yTop, yBot });
  const penSelected = await page.evaluate(() => [...window.__etude.AN.selected]);
  expect(penSelected).toContain(pts.e3.i);
  expect(penSelected).toContain(pts.g3.i);
  expect(penSelected).not.toContain(pts.c3Next.i);

  // Switch back to Select and toggle to rectangular marquee box mode
  await page.locator('#an-tools-btn').click();
  await page.locator('#an-tool-select').click();
  await modeBtn.click();
  await expect(modeBtn).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#an-tools-btn').click();

  await page.mouse.move(x0, yTop);
  await page.mouse.down();
  await page.mouse.move(safeRight, yBot, { steps: 4 });
  await expect(page.locator('.an-marquee')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.an-marquee')).toHaveCount(0);
});

test('neighbor keyboard activation preserves focus and selection across a key change labels each segment in its own key', async ({ app, page }) => {
  await app.open({ hash: 'analysis', dock: false });
  const keyChangeXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Key Modulation</work-title></work>
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
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
      <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>whole</type><staff>2</staff></note>
    </measure>
    <measure number="2">
      <attributes>
        <key><fifths>1</fifths><mode>major</mode></key>
      </attributes>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
      <note><chord/><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>G</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><type>whole</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

  await page.locator('#an-file').setInputFiles({
    name: 'key-change.musicxml',
    mimeType: 'application/xml',
    buffer: Buffer.from(keyChangeXml),
  });
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo && window.__etude.AN.notes.length === 6);

  if (!await page.locator('#an-side').isVisible()) {
    const btn = page.locator('#an-side-btn');
    if (await btn.isVisible()) await btn.click();
    else await page.locator('#an-fab').click();
  }

  // Select first note (a hollow whole note), navigate to its neighbor button with keyboard Enter, and verify focus stays inside #an-side (not <body>)
  const n0Head = page.locator('#an-roll [data-i="0"]').first();
  await n0Head.scrollIntoViewIfNeeded();
  await n0Head.click();
  await expect(page.locator('#an-now-body .an-note-card')).toBeVisible();
  const nbBtn = page.locator('#an-now-body .an-nb-btn[data-nb-idx]').first();
  await nbBtn.focus();
  await page.keyboard.press('Enter');
  const activeTag = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    inSide: !!document.getElementById('an-side')?.contains(document.activeElement),
    notBody: document.activeElement !== document.body,
  }));
  expect(activeTag.inSide).toBe(true);
  expect(activeTag.notBody).toBe(true);

  // Select all notes spanning C major (bar 1) -> G major (bar 2): bar 2 G chord must read I / Tonic in G major, not V / Dominant in C major
  await page.evaluate(() => {
    const api = window.__etude;
    api.AN.selected = new Set(api.AN.notes.map((_, i) => i));
    api.anSelectionChanged();
  });
  const cards = page.locator('#an-now-body .an-sel-ch');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('C');
  await expect(cards.nth(0)).toContainText('Tonic');
  await expect(cards.nth(1)).toContainText('G');
  await expect(cards.nth(1)).toContainText('I');
  await expect(cards.nth(1)).toContainText('Tonic');
  await expect(cards.nth(1)).not.toContainText('Dominant');
});

test.describe('touch score navigation', () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

  for (const lang of ['ro', 'de']) test(`tools stay side by side at 320px (${lang})`, async ({ app, page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await app.open({ hash: 'analysis', dock: false, lang });
    await loadImagineScore(page);
    await page.locator('#an-tools-btn').click();
    const hand = page.locator('#an-tool-hand'), select = page.locator('#an-tool-select');
    await expect(hand).toBeVisible();
    await expect(select).toBeVisible();
    const a = await hand.boundingBox(), b = await select.boundingBox();
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
    expect(a.height).toBeGreaterThanOrEqual(40);
    expect(b.x + b.width).toBeLessThanOrEqual(320);
    await expect(select).toHaveAttribute('aria-pressed', 'false');
    await select.click();
    await expect(select).toHaveAttribute('aria-pressed', 'true');
    await expect(hand).toHaveAttribute('aria-pressed', 'false');
  });

  test('one finger follows the tool; two fingers cancel lasso, pan and zoom; selection resumes on the next gesture', async ({ app, page }) => {
    await app.open({ hash: 'analysis', dock: false });
    await loadImagineScore(page);
    await page.locator('#an-tools-btn').click();
    await expect(page.locator('#an-tool-hand')).toBeVisible();
    await expect(page.locator('#an-tool-hand')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#an-tool-select')).toBeVisible();
    await page.locator('#an-tools-btn').click();
    await page.addStyleTag({ content: '#an-roll{height:220px!important;flex:none!important}' });
    await page.locator('#an-roll').scrollIntoViewIfNeeded();
    const cdp = await page.context().newCDPSession(page);
    const contact = (x, y, id = 1) => ({ x, y, id });
    const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    const rect = await page.locator('#an-roll').boundingBox();
    const x = Math.round(rect.x + rect.width / 2), y = Math.round(rect.y + 110);
    // The hand tool scrolls without selecting a bar or note.
    await send('touchStart', [contact(x, y)]);
    await send('touchMove', [contact(x, y - 50)]);
    await send('touchEnd', []);
    await expect.poll(() => page.locator('#an-roll').evaluate(el => el.scrollTop)).toBeGreaterThan(20);
    expect(await page.evaluate(() => [...window.__etude.AN.selected])).toEqual([]);
    await page.locator('#an-tools-btn').click();
    await page.locator('#an-tool-select').click();
    await page.locator('#an-tools-btn').click();
    await page.locator('#an-roll').evaluate(el => { el.scrollTop = 0; });

    const circle = async () => {
      const note = await page.evaluate(() => {
        const [i, list] = [...window.__etude.SCORE.heads.entries()].find(([, list]) => list.length);
        const r = list[0].getBoundingClientRect();
        return { i, x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      const left = Math.round(note.x - 10), right = Math.round(note.x + 10);
      const top = Math.round(note.y - 10), bottom = Math.round(note.y + 10);
      await send('touchStart', [contact(left, top)]);
      await send('touchMove', [contact(right, top)]);
      await send('touchMove', [contact(right, bottom)]);
      await expect(page.locator('.an-lasso')).toBeVisible();
      await send('touchMove', [contact(left, bottom)]);
      await send('touchMove', [contact(left, top)]);
      await send('touchEnd', []);
      await expect.poll(() => page.evaluate(() => [...window.__etude.AN.selected])).toContain(note.i);
      return page.evaluate(() => [...window.__etude.AN.selected]);
    };
    const selected = await circle();
    const originalWidth = await page.locator("#an-roll .an-sheet").evaluate(el => el.getBoundingClientRect().width);
    // A second finger cancels the unfinished lasso, preserving the previous selection.
    await send('touchStart', [contact(x, y)]);
    await send('touchMove', [contact(x + 15, y)]);
    await expect(page.locator('.an-lasso')).toBeVisible();
    await send('touchStart', [contact(x + 15, y), contact(x + 75, y, 2)]);
    await expect(page.locator('.an-lasso')).toHaveCount(0);
    await send('touchMove', [contact(x - 15, y - 30), contact(x + 105, y - 30, 2)]);
    await expect.poll(() => page.evaluate(() => window.__etude.SCORE.zoom)).toBeGreaterThan(1);
    await expect.poll(() => page.locator('#an-roll .an-sheet').evaluate(el => el.style.transform)).toContain('scale(');
    await expect.poll(() => page.locator('#an-roll .an-sheet').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(originalWidth * 1.5);
    await send('touchEnd', [contact(x - 15, y - 30)]);
    await send('touchMove', [contact(x - 15, y - 50)]);
    await expect(page.locator('.an-lasso')).toHaveCount(0);
    await send('touchEnd', []);
    expect(await page.evaluate(() => [...window.__etude.AN.selected])).toEqual(selected);
    await expect(page.locator('#an-tool-select')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
    await expect.poll(() => page.locator('#an-roll .an-sheet').evaluate(el => el.style.transform)).toBe('');
    await page.locator('#an-roll').evaluate(el => { el.scrollTop = 0; el.scrollLeft = 0; });
    await circle();
    const beforeCancel = await page.evaluate(() => [...window.__etude.AN.selected]);
    await send('touchStart', [contact(x, y)]);
    await send('touchMove', [contact(x + 15, y)]);
    await expect(page.locator('.an-lasso')).toBeVisible();
    await send('touchCancel', []);
    await expect(page.locator('.an-lasso')).toHaveCount(0);
    expect(await page.evaluate(() => [...window.__etude.AN.selected])).toEqual(beforeCancel);
    await circle();
    await cdp.detach();
  });
});

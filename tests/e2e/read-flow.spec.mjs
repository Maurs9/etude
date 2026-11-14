import { test, expect } from '../helpers/fixtures.mjs';
import { STRINGS } from '../../src/locales/index.js';

// Reading at the piano without the mouse: a level piece shows as a page, starts on its first note, gives its stars, and the
// next piece follows by itself.
const en = STRINGS.en;
const fill = (s, ...args) => args.reduce((out, value) => out.replace('%s', String(value)), s);
const srtState = (page) => page.evaluate(() => window.__etude.SR.srtState.name);
const withBook = (bookState) => ({ v: 3, lang: 'en', data: { reading: { book: { v: 1, level: 1, focusKey: null, pieces: {}, recent: {}, daily: null, days: [], ...bookState } } } });

// A Web MIDI piano the test plays: window.__midi.press(midi) and release(midi) go through the port the app listens to.
const fakePiano = (page) => page.addInitScript(() => {
  const port = { id: 'usb-1', name: 'Digital Piano', type: 'input', state: 'connected', connection: 'open', onmidimessage: null };
  const access = { inputs: new Map([[port.id, port]]), outputs: new Map(), sysexEnabled: false, onstatechange: null };
  const send = (status, midi, velocity) => { if (!port.onmidimessage) return false; port.onmidimessage({ data: new Uint8Array([status, midi, velocity]), timeStamp: performance.now() }); return true; };
  window.__midi = { press: (midi) => send(0x90, midi, 90), release: (midi) => send(0x80, midi, 0) };
  Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
});
// The first note the piece asks for.
const firstNote = (page) => page.evaluate(() => window.__etude.srtLevelExpected(window.__etude.SR.lvPiece)[0]);
// Plays the rest of the piece on time through the recorder (the first note is down already), then ends the attempt.
const playRest = (page) => page.evaluate(() => {
  const api = window.__etude;
  const expected = api.srtLevelExpected(api.SR.lvPiece, { bpm: api.SR.bpm, hand: 'both' });
  expected.flatMap((note) => [['on', note.midi, note.onMs], ['off', note.midi, Math.max(note.onMs + 1, note.offMs - 20)]])
    .sort((a, b) => a[2] - b[2] || (a[0] === 'off' ? -1 : 1))
    .forEach(([kind, midi, ms]) => api.srtRecorder.record(kind, midi, 'midi', kind === 'off' ? 'physical' : null, ms));
  api.srAssessFinish();
});

test.describe('Read at the piano', () => {
  test('two pieces in a row with no click: first note, stars, auto-next, first note', async ({ app, page }) => {
    await fakePiano(page);
    await app.open({ hash: 'read', saved: withBook({}) });
    await page.locator('#midiChip').click();
    await expect(page.locator('#midiText')).toHaveText('Digital Piano');
    await page.locator('#rdn-book-go').click(); // the only click: it opens the first piece
    await expect(page.locator('#rdn-p-title')).toHaveText(en.rdn_title_no.replace('%a', '1').replace('%b', '96'));
    await expect(page.locator('#rd-verdict')).toHaveText(en.rdn_ready_note);
    await expect(page.locator('#rd-staff .ss-n').first()).toBeVisible();

    for (const number of [1, 2]) {
      await expect(page.locator('#rdn-p-title')).toHaveText(en.rdn_title_no.replace('%a', String(number)).replace('%b', '96'), { timeout: 8000 });
      const first = await firstNote(page);
      await page.waitForTimeout(700); // a piece just opened does not take a key as its start
      expect(await page.evaluate((midi) => window.__midi.press(midi), first.midi)).toBe(true);
      await expect.poll(() => srtState(page)).toBe('playing');
      // The recorder lets the first key go at the end of its note; the piano's own key comes up after the attempt.
      await playRest(page);
      await page.evaluate((midi) => window.__midi.release(midi), first.midi);
      await expect.poll(() => srtState(page)).toBe('saved');
      await expect(page.locator('#rdn-r-score')).toHaveText('100%');
      await expect(page.locator('#rdn-result .rdx-stars')).toHaveAttribute('aria-label', /3/);
      await expect(page.locator('#rdn-result .rdn-r-msg')).toHaveText(en.rdn_r_s3);
      // With a piano connected auto-next is on until the reader chooses otherwise.
      await expect(page.locator('#rdn-autonext')).toBeChecked();
      await expect(page.locator('#rdn-auto')).toBeVisible();
    }
    await expect(page.locator('#rdn-p-title')).toHaveText(en.rdn_title_no.replace('%a', '3').replace('%b', '96'), { timeout: 8000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).data.reading.book.pieces);
    expect(saved['b1.1']).toMatchObject({ best: 100, stars: 3, first: 100 });
    expect(saved['b1.2']).toMatchObject({ best: 100, stars: 3, first: 100 });
  });

  test('the status line of a waiting piece follows a piano that connects', async ({ app, page }) => {
    await fakePiano(page);
    await app.open({ hash: 'read', saved: withBook({}) });
    await page.locator('#rdn-book-go').click();
    await expect(page.locator('#rd-verdict')).toHaveText(en.rdn_ready);
    await page.locator('#midiChip').click();
    await expect(page.locator('#midiText')).toHaveText('Digital Piano');
    await expect(page.locator('#rd-verdict')).toHaveText(en.rdn_ready_note);
  });

  test('without a piano auto-next is off until it is chosen', async ({ app, page }) => {
    await app.open({ hash: 'read', saved: withBook({}) });
    await page.locator('#rdn-book-go').click();
    await expect(page.locator('#rd-verdict')).toHaveText(en.rdn_ready);
    await page.locator('#rd-go').click();
    await expect.poll(() => srtState(page)).toBe('countIn');
    await page.evaluate(() => window.__etude.srtSetState({ type: 'countInDone' }));
    await playRest(page);
    await expect(page.locator('#rdn-result')).toBeVisible();
    await expect(page.locator('#rdn-autonext')).not.toBeChecked();
    await expect(page.locator('#rdn-auto')).toBeHidden();
  });

  test('a long piece: opens from the plan, rises through its sections, is saved, and Next brings another', async ({ app, page }) => {
    await app.open({ hash: 'read', saved: withBook({ level: 3 }) });
    await expect(page.locator('#rdn-plan-long')).toHaveAttribute('data-done', 'false');
    await page.locator('#rdn-plan-long').click();
    await expect(page.locator('#rdn-p-title')).toHaveText(en.rdn_long);
    await expect(page.locator('#rdn-prev')).toBeHidden();
    const piece = await page.evaluate(() => {
      const api = window.__etude, p = api.SR.lvPiece, bar = p.meter.num * (4 / p.meter.den);
      const perBar = (hand) => Array.from({ length: p.bars }, (_, b) => api.SR.notes.filter((n) => n.hand === hand && n.beat >= b * bar - 1e-6 && n.beat < (b + 1) * bar - 1e-6).length);
      return { level: p.level, bars: p.bars, bpm: p.bpm, sliderBpm: Number(document.querySelector('#rd-bpm').value), sections: p.sections,
        systems: api.SR.render.systems.length, drawn: document.querySelectorAll('#rd-staff .ss-n').length, expected: api.srtLevelExpected(p).length,
        notesPerBar: perBar('rh').map((n, i) => n + perBar('lh')[i]), sub: document.querySelector('#rdn-p-sub').textContent };
    });
    expect(piece.level).toBe(3);
    expect(piece.bars).toBeGreaterThanOrEqual(24);
    expect(piece.bars).toBeLessThanOrEqual(48);
    expect(piece.sub).toContain(en.rdn_long_sub.replace('%s', String(piece.bars)));
    // The sections tile the piece, start below the level and end on it.
    expect(piece.sections.reduce((sum, sec) => sum + sec.bars, 0)).toBe(piece.bars);
    expect(piece.sections[0].level).toBeLessThan(3);
    expect(piece.sections.at(-1)).toMatchObject({ level: 3, third: 2 });
    expect(piece.sections.map((sec) => sec.level)).toEqual([...piece.sections.map((sec) => sec.level)].sort((a, b) => a - b));
    // Drawn as a page of four-bar systems, every note once, at the piece's own tempo; no bar is empty.
    expect(piece.systems).toBe(Math.ceil(piece.bars / 4));
    expect(piece.drawn).toBe(piece.expected);
    expect(piece.sliderBpm).toBe(piece.bpm);
    expect(piece.notesPerBar.every((n) => n > 0)).toBe(true);

    await page.locator('#rd-go').click();
    await expect.poll(() => srtState(page)).toBe('countIn');
    expect(await page.evaluate(() => window.__etude.SR.bpm)).toBe(piece.bpm);
    await page.evaluate(() => window.__etude.srtSetState({ type: 'countInDone' }));
    await playRest(page);
    await expect.poll(() => srtState(page)).toBe('saved');
    await expect(page.locator('#rdn-r-score')).toHaveText('100%');
    const today = await page.evaluate(() => window.__etude.rdnToday());
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).data.reading.book.pieces);
    expect(saved[`l${today}.0`]).toMatchObject({ best: 100, stars: 3, first: 100 });

    // Next is another long piece, with other notes.
    const before = await page.evaluate(() => window.__etude.SR.srtFingerprint);
    await page.locator('#rdn-next').click();
    await expect(page.locator('#rdn-p-title')).toHaveText(en.rdn_long_n.replace('%s', '2'));
    expect(await page.evaluate(() => window.__etude.SR.srtFingerprint)).not.toBe(before);
    // Back home the step is done, and the plan counts it.
    await page.locator('#rdn-back').click();
    await expect(page.locator('#rdn-plan-long')).toHaveAttribute('data-done', 'true');
    await expect(page.locator('#rdn-plan-long .ck')).toHaveText('✓');
    await expect(page.locator('#rdn-plan-long .pd')).toHaveText(en.rdn_long_again);
    await expect(page.locator('#rdn-plan-sub')).toHaveText(en.plan_sub.replace('%a', '1').replace('%b', '3'));
  });

  test('a level piece carries printed-page markings, drawn over the notes without changing them', async ({ app, page }) => {
    await app.open({ hash: 'read', saved: withBook({ level: 5 }) });
    // The first level-5 book piece with staccato, a slur and a finger number.
    const found = await page.evaluate(() => {
      const api = window.__etude;
      for (let n = 1; n <= 40; n++) {
        api.rdnOpen({ kind: 'book', level: 5, number: n });
        const m = api.SR.piece.marks;
        if (m.articulations.some((a) => a.kind === 'staccato') && m.slurs.length && m.fingering.length)
          return n;
      }
      return 0;
    });
    expect(found).toBeGreaterThan(0);
    const facts = await page.evaluate(() => {
      const api = window.__etude, m = api.SR.piece.marks, svg = document.querySelector('#rd-staff svg'), g = svg.querySelector('.ss-marks');
      const num = (el, name) => Number(el.getAttribute(name));
      const colOf = (hand, beat) => api.SR.notes.filter((n) => n.hand === hand && Math.abs(n.beat - beat) < 1e-3);
      const dots = [...g.querySelectorAll('circle.ss-art')].map((c) => ({ x: num(c, 'cx'), y: num(c, 'cy') }));
      const staccato = m.articulations.filter((a) => a.kind === 'staccato');
      return {
        counts: { dyn: m.dynamics.length, fing: m.fingering.length, staccato: staccato.length, accents: m.articulations.length - staccato.length, slurs: m.slurs.length, hairpins: m.hairpins.length },
        drawn: { dyn: g.querySelectorAll('.ss-dyn').length, fing: g.querySelectorAll('.ss-finger').length, dots: dots.length, accents: g.querySelectorAll('.ss-accent').length,
          slurs: g.querySelectorAll('.ss-slur').length, hairpins: g.querySelectorAll('.ss-hairpin').length },
        hidden: g.getAttribute('aria-hidden'), inert: getComputedStyle(g).pointerEvents,
        fingers: [...g.querySelectorAll('.ss-finger')].map((el) => el.textContent),
        firstDyn: { text: g.querySelector('.ss-dyn').textContent, x: num(g.querySelector('.ss-dyn'), 'x'), noteX: Math.min(...api.SR.notes.filter((n) => n.beat < 1e-3).map((n) => n.x)) },
        // Every staccato dot sits one space, or a space and a half, from a notehead of its own note or chord.
        dotsPlaced: staccato.every((a) => colOf(a.hand, a.beat).some((n) => dots.some((d) => Math.abs(d.x - n.x) < 0.5 && [12, 18].includes(Math.round(Math.abs(d.y - n.y)))))),
        // A finger number is above the right hand's note and below the left hand's.
        fingersPlaced: m.fingering.every((f) => { const col = colOf(f.hand, f.beat), el = [...g.querySelectorAll('.ss-finger')].find((t) => col.some((n) => Math.abs(num(t, 'x') - n.x) < 0.5) && t.textContent === String(f.finger));
          return !!el && (f.hand === 'rh' ? num(el, 'y') < Math.min(...col.map((n) => n.y)) : num(el, 'y') > Math.max(...col.map((n) => n.y))); }),
        groups: svg.querySelectorAll('.ss-n').length, expected: api.srtLevelExpected(api.SR.lvPiece).length, inMarks: g.querySelectorAll('.ss-n').length,
      };
    });
    expect(facts.drawn.dyn).toBe(facts.counts.dyn);
    expect(facts.drawn.fing).toBe(facts.counts.fing);
    expect(facts.drawn.dots).toBe(facts.counts.staccato);
    expect(facts.drawn.accents).toBe(facts.counts.accents);
    expect(facts.drawn.slurs).toBeGreaterThanOrEqual(facts.counts.slurs); // a slur over a system break is two arcs
    expect(facts.drawn.hairpins).toBeGreaterThanOrEqual(facts.counts.hairpins);
    expect(facts.hidden).toBe('true');
    expect(facts.inert).toBe('none');
    facts.fingers.forEach((f) => expect(f).toMatch(/^[1-5]$/));
    expect(facts.firstDyn.text).toMatch(/^(p|mp|mf|f)$/);
    expect(Math.abs(facts.firstDyn.x - facts.firstDyn.noteX)).toBeLessThan(1);
    expect(facts.dotsPlaced).toBe(true);
    expect(facts.fingersPlaced).toBe(true);
    // The notes are the same groups as without markings: one per expected note, none inside the markings.
    expect(facts.groups).toBe(facts.expected);
    expect(facts.inMarks).toBe(0);
    // A staccato note played short costs nothing: the score reads when a key goes down, not how long it stays down.
    await page.locator('#rd-go').click();
    await expect.poll(() => srtState(page)).toBe('countIn');
    await page.evaluate(() => {
      const api = window.__etude;
      api.srtSetState({ type: 'countInDone' });
      api.srtLevelExpected(api.SR.lvPiece, { bpm: api.SR.bpm, hand: 'both' })
        .flatMap((note) => [['on', note.midi, note.onMs], ['off', note.midi, note.onMs + 40]])
        .sort((a, b) => a[2] - b[2] || (a[0] === 'off' ? -1 : 1))
        .forEach(([kind, midi, ms]) => api.srtRecorder.record(kind, midi, 'midi', kind === 'off' ? 'physical' : null, ms));
      api.srAssessFinish();
    });
    await expect(page.locator('#rdn-r-score')).toHaveText('100%');
  });

  test('a level piece is a page: four bars a system, every system the full width, the whole piece and Start in view', async ({ app, page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await app.open({ hash: 'read', saved: withBook({}) });
    await page.locator('#rdn-book-go').click();
    await expect(page.locator('#rd-staff .ss-n').first()).toBeVisible();
    const facts = await page.evaluate(() => {
      const api = window.__etude, r = api.SR.render, wrap = document.querySelector('#rd-staff'), svg = wrap.querySelector('svg');
      const paper = wrap.getBoundingClientRect(), go = document.querySelector('#rd-go').getBoundingClientRect();
      // The right end of each system: its last playhead anchor.
      const ends = r.systems.map((_, sy) => Math.max(...r.beatX.filter((b) => b.sy === sy).map((b) => b.x)));
      return { bars: api.SR.lvPiece.bars, systems: r.systems.length, scale: r.scale, ends, W: r.W,
        fits: wrap.scrollWidth <= wrap.clientWidth + 1, svgW: svg.getBoundingClientRect().width, paperW: paper.width,
        paperBottom: paper.bottom, goBottom: go.bottom, viewport: window.innerHeight, heading: document.querySelector('#view-read .rdn-head').getBoundingClientRect().height };
    });
    expect(facts.bars).toBe(8);
    expect(facts.systems).toBe(2);
    expect(facts.scale).toBeGreaterThanOrEqual(0.85);
    expect(facts.scale).toBeLessThanOrEqual(1.4);
    expect(facts.fits).toBe(true);
    // Both systems end at the same place, near the right edge of the score.
    expect(Math.abs(facts.ends[0] - facts.ends[1])).toBeLessThan(2);
    expect(facts.ends[0]).toBeGreaterThan(facts.W * 0.95);
    expect(facts.paperW).toBeLessThanOrEqual(1120);
    // The paper and the Start button are in view without scrolling; the page heading gives its room.
    expect(facts.paperBottom).toBeLessThan(facts.viewport);
    expect(facts.goBottom).toBeLessThanOrEqual(facts.viewport);
    expect(facts.heading).toBeLessThanOrEqual(1);
  });
});

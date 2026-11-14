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
        paperBottom: paper.bottom, goBottom: go.bottom, viewport: window.innerHeight, heading: document.querySelector('#view-read .section-head').getBoundingClientRect().height };
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

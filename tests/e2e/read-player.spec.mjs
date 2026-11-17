import { test, expect } from '../helpers/fixtures.mjs';
import { STRINGS } from '../../src/locales/index.js';

// The player of level pieces (spec section 8): the header, the checklist, an assessed attempt with its result
// card, the saved book state, Prev / Next, Today's set, and the old melody path next to it.
const en = STRINGS.en;
const fill = (s, ...args) => args.reduce((out, value, i) => { const mark = ['%a', '%b'][i]; return out.replace(mark && out.includes(mark) ? mark : '%s', String(value)); }, s);
const book = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).data.reading?.book ?? null);
const srtState = (page) => page.evaluate(() => window.__etude.SR.srtState.name);
const withBook = (bookState, prefs) => ({ v: 3, lang: 'en', data: { reading: { book: { v: 2, level: 1, focusKey: null, pieces: {}, recent: {}, daily: null, days: [], ...bookState }, ...(prefs ? { prefs } : {}) } } });
const title = (page) => page.locator('#rdn-p-title');
const focusedId = (page) => page.evaluate(() => document.activeElement?.id || document.activeElement?.dataset.rdnFocus || document.activeElement?.tagName);
// A first-sight result that cannot be saved: writes to the ledger fail until restoreLedger.
const installLedgerFailure = (page) => page.evaluate(() => {
  const original = Storage.prototype.setItem;
  window.__srtOriginalSetItem = original;
  Storage.prototype.setItem = function setItem(key, value) {
    if (key === 'etude-sight-v1') throw new DOMException('blocked', 'QuotaExceededError');
    return original.call(this, key, value);
  };
});
const restoreLedger = (page) => page.evaluate(() => { Storage.prototype.setItem = window.__srtOriginalSetItem; });
// Opens the first level-5 book piece where both hands start a note on the same beat.
const openTwoHandPiece = (page) => page.evaluate(() => {
  const api = window.__etude;
  for (let k = 1; k <= 20; k++) {
    api.rdnOpen({ kind: 'book', level: 5, number: k });
    const ev = api.SR.lvPiece.events.filter((e) => e.pitches.length > 0);
    const starts = new Set(ev.filter((e) => e.hand === 'rh').map((e) => e.onsetTick));
    if (ev.some((e) => e.hand === 'lh' && starts.has(e.onsetTick)))
      return k;
  }
  return 0;
});

async function openHome(app, saved) {
  const page = await app.open({ hash: 'read', saved });
  await expect(page.locator('#rdn-home')).toBeVisible();
  return page;
}
// Plays the attempt from the Start button: a level piece goes straight to the count-in (an older melody has a preview).
// `hands` picks which notes are played, all exactly on time.
async function playAttempt(page, hands = ['rh', 'lh']) {
  await page.locator('#rd-go').click();
  await expect.poll(() => srtState(page)).toMatch(/^(preview|countIn)$/);
  if (await srtState(page) === 'preview')
    await page.locator('#rd-srt-start').click();
  await expect.poll(() => srtState(page)).toBe('countIn');
  return perform(page, hands);
}
// Plays the notes of the given hands on time (each key let go just before its note ends), then finishes the attempt.
function perform(page, hands = ['rh', 'lh']) {
  return page.evaluate((played) => {
    const api = window.__etude;
    api.srtSetState({ type: 'countInDone' });
    const expected = api.srtLevelExpected(api.SR.lvPiece, { bpm: api.SR.bpm, hand: 'both' });
    expected.filter((note) => played.includes(note.hand))
      .flatMap((note) => [['on', note.midi, note.onMs], ['off', note.midi, Math.max(note.onMs + 1, note.offMs - 20)]])
      .sort((a, b) => a[2] - b[2] || (a[0] === 'off' ? -1 : 1))
      .forEach(([kind, midi, ms]) => api.srtRecorder.record(kind, midi, 'typing:a', kind === 'off' ? 'physical' : null, ms));
    api.srAssessFinish();
    return { state: api.SR.srtState.name, bpm: api.SR.bpm, expected: expected.length };
  }, hands);
}

test.describe('Read player', () => {
  test('Continue opens the right piece, with its header and without the key in mixed keys', async ({ app }) => {
    const page = await openHome(app, withBook({ pieces: { 'b1.1': { best: 90, stars: 2, tries: 1, first: 90 } } }));
    await expect(page.locator('#rdn-book-go')).toHaveText(fill(en.rdn_go_continue, 2));
    await expect(page.locator('[data-rdn-n="1"]')).toHaveAttribute('aria-label', fill(en.rdn_num_aria_stars, 1, 2));
    await expect(page.locator('.rdn-num[data-rdn-n="2"]')).toHaveClass(/\bnext\b/);
    await page.locator('#rdn-book-go').click();
    await expect(page.locator('#rdn-player-head')).toBeVisible();
    await expect(page.locator('#rdn-p-title')).toHaveText(fill(en.rdn_title_no, 2, 96));
    await expect(page.locator('#rdn-p-sub')).toHaveText(/^Level 1 · Steps · Unit 1 · New key$/);
    await expect(page.locator('#rd-tabs')).toBeHidden();
    await expect(page.locator('#rd-gen')).toBeHidden();
    await expect(page.locator('#rdn-prev')).toBeEnabled();
    await expect(page.locator('#rd-hands')).toBeHidden();
    const facts = await page.evaluate(() => ({ key: window.__etude.SR.lvPiece.key.id, level: window.__etude.SR.lvPiece.level, bpm: document.querySelector('#rd-bpm').value, mode: window.__etude.SR.modeSel }));
    expect(facts).toMatchObject({ level: 1, bpm: '66', mode: 'assess' });
    // Nothing on the page names the key of a piece in a mix before it is played.
    const text = await page.locator('#view-read').innerText();
    expect(text).not.toMatch(/\b(major|minor)\b/);
  });

  test('a piece opens with its score and checklist: no timed look, one note group per note, and Start goes to the count-in', async ({ app }) => {
    const page = await openHome(app);
    await page.locator('#rdn-book-go').click();
    // The score is on the page before Start, and nothing is claimed yet.
    await expect(page.locator('#rd-staff .ss-n').first()).toBeVisible();
    expect(await srtState(page)).toBe('idle');
    await expect(page.locator('#rd-srt-preview')).toBeHidden();
    await expect(page.locator('#rd-verdict')).toHaveText(en.rdn_ready);
    const items = page.locator('#rdn-checklist li');
    await expect(items.first()).toHaveText(en.rdn_check_sig);
    await expect(items.nth(1)).toHaveText(en.rdn_check_first);
    expect(await items.count()).toBeGreaterThanOrEqual(3);
    const counts = await page.evaluate(() => ({
      drawn: document.querySelectorAll('#rd-staff .ss-n').length,
      notes: window.__etude.srtLevelExpected(window.__etude.SR.lvPiece).length,
    }));
    expect(counts.drawn).toBe(counts.notes);
    // Looking is free: leaving the piece before an attempt keeps its first sight.
    const fingerprint = await page.evaluate(() => window.__etude.SR.srtFingerprint);
    expect(await page.evaluate((fp) => !!JSON.parse(localStorage.getItem('etude-sight-v1') || '{}').exposures?.[fp], fingerprint)).toBe(false);
    await page.locator('#rd-go').click();
    await expect.poll(() => srtState(page)).toBe('countIn');
    await expect(page.locator('#rd-srt-preview')).toBeHidden();
    await expect(page.locator('#rdn-checklist')).toBeHidden();
    expect(await page.evaluate((fp) => !!JSON.parse(localStorage.getItem('etude-sight-v1')).exposures[fp], fingerprint)).toBe(true);
  });

  test('a piano starts the attempt with the first right note: no count-in, and that note is the first one played', async ({ app }) => {
    const page = await openHome(app);
    await page.locator('#rdn-book-go').click();
    const first = await page.evaluate(() => window.__etude.srtLevelExpected(window.__etude.SR.lvPiece)[0]);
    expect(first.onMs).toBe(0);
    // A wrong key, and the right key from the computer keyboard, start nothing.
    await page.evaluate((midi) => { const api = window.__etude; api.handleNoteOn(midi + 1, 90, 'midi'); api.handleNoteOff(midi + 1, 'midi'); api.handleNoteOn(midi, 90, 'typing:a'); api.handleNoteOff(midi, 'typing:a'); }, first.midi);
    // (A piece just opened waits 600 ms before a key can start it: a key still down from the piece before is not a start.)
    await page.waitForTimeout(700);
    expect(await srtState(page)).toBe('idle');
    // The right key from the piano starts it.
    await page.evaluate((midi) => window.__etude.handleNoteOn(midi, 90, 'midi'), first.midi);
    await expect.poll(() => srtState(page)).toBe('playing');
    const started = await page.evaluate(() => {
      const api = window.__etude;
      return { inputs: api.srtRecorder.inputs.map((i) => ({ midi: i.midi, onMs: i.onMs })), sinceT0: performance.now() - api.SR.t0, active: api.SR.active };
    });
    expect(started.active).toBe(true);
    expect(started.inputs).toEqual([{ midi: first.midi, onMs: 0 }]);
    expect(started.sinceT0).toBeGreaterThanOrEqual(0);
    expect(started.sinceT0).toBeLessThan(1500);
    await expect(page.locator('#rdn-checklist')).toBeHidden();
    // The start by that note is handed to the attempt: nothing is left pending.
    expect(await page.evaluate(() => window.__etude.srNoteStart)).toBe(null);
    // The rest played on time: a full score, saved as a first sight.
    await perform(page);
    await expect.poll(() => srtState(page)).toBe('saved');
    expect((await book(page)).pieces['b1.1']).toMatchObject({ best: 100, stars: 3, first: 100 });
    // Seen now: the first note starts a practice run the same way.
    await page.evaluate((midi) => window.__etude.handleNoteOff(midi, 'midi'), first.midi);
    await page.waitForTimeout(1100);
    await page.evaluate((midi) => window.__etude.handleNoteOn(midi, 90, 'midi'), first.midi);
    await expect.poll(() => page.evaluate(() => window.__etude.SR.active)).toBe(true);
    expect(await page.evaluate(() => window.__etude.SR.srtState.mode)).toBe('practice');
    expect(await page.evaluate(() => window.__etude.srtRecorder.inputs.length)).toBe(1);
  });

  test('both hands on the first beat: the second key, played while the first sight is claimed, is kept', async ({ app }) => {
    const page = await openHome(app, withBook({ level: 5 }));
    expect(await openTwoHandPiece(page)).toBeGreaterThan(0);
    const firsts = await page.evaluate(() => {
      const expected = window.__etude.srtLevelExpected(window.__etude.SR.lvPiece);
      return expected.filter((n) => n.onMs === expected[0].onMs).map((n) => n.midi);
    });
    test.skip(firsts.length < 2, 'this piece does not start with both hands');
    await page.waitForTimeout(700);
    await page.evaluate((keys) => keys.forEach((midi) => window.__etude.handleNoteOn(midi, 90, 'ble')), firsts);
    await expect.poll(() => srtState(page)).toBe('playing');
    const inputs = await page.evaluate(() => window.__etude.srtRecorder.inputs.map((i) => ({ midi: i.midi, onMs: i.onMs })));
    expect(inputs.map((i) => i.midi).sort()).toEqual([...firsts].sort());
    inputs.forEach((i) => { expect(i.onMs).toBeGreaterThanOrEqual(0); expect(i.onMs).toBeLessThan(120); });
  });

  test('a level 6 piece is drawn with beams, and the Hands control shows from level 4', async ({ app }) => {
    const page = await openHome(app, withBook({ level: 6 }));
    await page.locator('#rdn-book-go').click();
    await expect(page.locator('#rd-hands')).toBeVisible();
    const found = await page.evaluate(async () => {
      const api = window.__etude;
      for (let n = 1; n <= 24; n++) {
        api.rdnOpen({ kind: 'book', level: 6, number: n });
        api.srSetMode('learn'); // shows the score once the exposure is written
        for (let i = 0; i < 40 && !document.querySelector('#rd-staff .ss-n'); i++) await new Promise((r) => setTimeout(r, 25));
        const beams = document.querySelectorAll('#rd-staff .ss-beam').length;
        if (beams > 0)
          return { n, beams, drawn: document.querySelectorAll('#rd-staff .ss-n').length, notes: api.srtLevelExpected(api.SR.lvPiece).length };
      }
      return null;
    });
    expect(found).not.toBeNull();
    expect(found.drawn).toBe(found.notes);
  });

  test('a finished first-sight attempt is saved, shown on the result card and in the book, then Next opens the next number', async ({ app, page }) => {
    await openHome(app);
    await page.locator('#rdn-book-go').click();
    await expect(page.locator('#rdn-p-title')).toHaveText(fill(en.rdn_title_no, 1, 96));
    await expect(page.locator('#rdn-prev')).toBeDisabled();
    const run = await playAttempt(page);
    expect(run.bpm).toBe(66);
    await expect(page.locator('#rdn-result')).toBeVisible();
    await expect(page.locator('#rdn-r-score')).toHaveText('100%');
    await expect(page.locator('#rdn-result')).toContainText('100%');
    // The result card replaces the one-line verdict, also as the live region that announces the result.
    await expect(page.locator('#rd-verdict')).toBeHidden();
    await expect(page.locator('#rdn-result [role=status]')).toContainText('100%');
    await expect(page.locator('#rdn-lede')).toHaveText(en.rdn_lede);
    const key = await page.evaluate(() => window.__etude.SR.lvPiece.key);
    await expect(page.locator('#rdn-result')).toContainText(`${key.tonic.replace('b', '♭').replace('#', '♯')} ${key.mode}`);
    let saved = await book(page);
    expect(saved.pieces['b1.1']).toEqual({ best: 100, stars: 3, tries: 1, first: 100 });
    expect(saved.recent['1']).toEqual([100]);

    // Back on the home, the chip has its stars and the count went up.
    await page.locator('#rdn-back').click();
    await expect(page.locator('[data-rdn-n="1"]')).toHaveAttribute('aria-label', fill(en.rdn_num_aria_stars, 1, 3));
    await expect(page.locator('[data-rdn-n="1"] small')).toHaveText('★★★');
    await expect(page.locator('#rdn-book-done')).toHaveText(fill(en.rdn_done_of, 1, 96));

    // A second attempt is practice: the first-sight result stays, the tries add up.
    await page.locator('[data-rdn-n="1"]').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.mode)).toBe('practice');
    await playAttempt(page, ['rh']);
    saved = await book(page);
    expect(saved.pieces['b1.1'].tries).toBe(2);
    expect(saved.pieces['b1.1'].first).toBe(100);
    expect(saved.recent['1']).toEqual([100]);

    await page.locator('#rdn-r-next').click();
    await expect(page.locator('#rdn-p-title')).toHaveText(fill(en.rdn_title_no, 2, 96));
    await expect(page.locator('#rdn-result')).toBeHidden();
  });

  test('Retry, Listen, auto-next with a countdown and Cancel', async ({ app, page }) => {
    await openHome(app);
    await page.locator('#rdn-book-go').click();
    await playAttempt(page);
    await page.locator('#rdn-autonext').check();
    expect((await page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).data.reading.prefs.autoNext))).toBe(true);
    await page.locator('#rdn-retry').click();
    await expect.poll(() => srtState(page)).toBe('countIn');
    await page.evaluate(() => window.__etude.srAssessFinish());
    await expect(page.locator('#rdn-result')).toBeVisible();
    // The practice run played nothing, so it earned no star: no auto-next, and the stars say "No stars", not "0".
    await expect(page.locator('#rdn-auto')).toBeHidden();
    await expect(page.locator('#rdn-result .rdx-stars')).toHaveAttribute('aria-label', en.rdn_stars_none);
    await page.locator('#rdn-retry').click();
    await expect.poll(() => srtState(page)).toBe('countIn');
    await perform(page);
    await expect(page.locator('#rdn-auto')).toBeVisible();
    await expect(page.locator('#rdn-auto')).toContainText(fill(en.rdn_auto_in, 3));
    // Announced once: the visible number is no live region, the spoken line keeps its first text.
    await expect(page.locator('#rdn-auto-say')).toHaveText(fill(en.rdn_auto_say, 3));
    await expect(page.locator('#rdn-auto-say')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('#rdn-auto [aria-live]')).toHaveCount(1);
    await expect(page.locator('#rdn-auto-t')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#rdn-auto-t')).toHaveText(fill(en.rdn_auto_in, 2), { timeout: 2500 });
    await expect(page.locator('#rdn-auto-say')).toHaveText(fill(en.rdn_auto_say, 3));
    await page.locator('#rdn-auto-cancel').click();
    await expect(page.locator('#rdn-auto')).toBeHidden();
    await page.waitForTimeout(3500);
    await expect(page.locator('#rdn-p-title')).toHaveText(fill(en.rdn_title_no, 1, 96));
    // Without Cancel, Next fires after 3 seconds.
    await page.locator('#rdn-retry').click();
    await expect.poll(() => srtState(page)).toBe('countIn');
    await perform(page);
    await expect(page.locator('#rdn-p-title')).toHaveText(fill(en.rdn_title_no, 2, 96), { timeout: 6000 });
    await expect(page.locator('#rdn-result')).toBeHidden();
  });

  test('Listen on the result card plays the piece', async ({ app, page }) => {
    await openHome(app);
    await page.locator('#rdn-book-go').click();
    await playAttempt(page);
    await page.locator('#rdn-listen').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.listening)).toBe(true);
    await expect(page.locator('#rd-listen')).toHaveText(en.rd_stop);
  });

  test('Prev, Next and the arrow keys move through the book; past the last piece the home comes back', async ({ app, page }) => {
    await openHome(app);
    await page.evaluate(() => window.__etude.rdnOpen({ kind: 'book', level: 1, number: 5 }));
    await expect(page.locator('#rdn-p-title')).toHaveText(fill(en.rdn_title_no, 5, 96));
    await page.locator('#rdn-prev').click();
    await expect(page.locator('#rdn-p-title')).toHaveText(fill(en.rdn_title_no, 4, 96));
    await page.locator('#rdn-next').click();
    await expect(page.locator('#rdn-p-title')).toHaveText(fill(en.rdn_title_no, 5, 96));
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#rdn-p-title')).toHaveText(fill(en.rdn_title_no, 6, 96));
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#rdn-p-title')).toHaveText(fill(en.rdn_title_no, 5, 96));
    // Not while typing in a form control.
    await page.locator('#rd-bpm').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#rdn-p-title')).toHaveText(fill(en.rdn_title_no, 5, 96));
    await page.evaluate(() => window.__etude.rdnOpen({ kind: 'book', level: 1, number: 96 }));
    await page.locator('#rdn-next').click();
    await expect(page.locator('#rdn-home')).toBeVisible();
    await expect(page.locator('#rdp-pieces')).toBeHidden();
    // A pinned key: a run of 20 with the key named.
    await page.locator('[data-rdn-key="G"]').click();
    await page.locator('#rdn-book-go').click();
    await expect(page.locator('#rdn-p-title')).toHaveText(fill(en.rdn_title_no, 1, 20));
    await expect(page.locator('#rdn-p-sub')).toContainText('G major');
    expect(await page.evaluate(() => window.__etude.SR.lvPiece.key.id)).toBe('G');
  });

  test("Today's set: start, a finished slot is marked and survives a reload", async ({ app, page }) => {
    await openHome(app);
    await expect(page.locator('.rdn-slot')).toHaveCount(5);
    await page.locator('#rdn-today-go').click();
    await expect(page.locator('#rdn-p-title')).toHaveText(fill(en.rdn_title_today, 1, 5));
    await expect(page.locator('#rdn-prev')).toBeHidden();
    await playAttempt(page);
    await page.locator('#rdn-back').click();
    await expect(page.locator('.rdn-slot').first()).toHaveClass(/\bdone\b/);
    await expect(page.locator('.rdn-slot').first().locator('small')).toHaveText('100%');
    await expect(page.locator('#rdn-today-go')).toHaveText(en.rdn_today_continue);
    const before = (await book(page)).daily;
    expect(before.done[0]).toBe(100);
    await page.reload();
    await expect(page.locator('.rdn-slot').first()).toHaveClass(/\bdone\b/);
    expect((await book(page)).daily).toEqual(before);
    await page.locator('#rdn-today-go').click();
    await expect(page.locator('#rdn-p-title')).toHaveText(fill(en.rdn_title_today, 2, 5));
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#rdn-p-title')).toHaveText(fill(en.rdn_title_today, 3, 5));
  });

  test('two hands starting together: each result lands on its own note', async ({ app }) => {
    const page = await openHome(app, withBook({ level: 5 }));
    const n = await page.evaluate(() => {
      const api = window.__etude;
      for (let k = 1; k <= 20; k++) {
        api.rdnOpen({ kind: 'book', level: 5, number: k });
        const ev = api.SR.lvPiece.events.filter((e) => e.pitches.length > 0);
        const starts = new Set(ev.filter((e) => e.hand === 'rh').map((e) => e.onsetTick));
        if (ev.some((e) => e.hand === 'lh' && starts.has(e.onsetTick)))
          return k;
      }
      return 0;
    });
    expect(n).toBeGreaterThan(0);
    await playAttempt(page, ['rh']);
    const marks = await page.evaluate(() => [...document.querySelectorAll('#rd-staff .ss-n')].map((g) => [g.dataset.hand, g.dataset.s]));
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.filter(([hand]) => hand === 'rh').every(([, s]) => s === 'good')).toBe(true);
    expect(marks.filter(([hand]) => hand === 'lh').every(([, s]) => s === 'bad')).toBe(true);
  });

  test('note names wait for the first sight of a level piece, and show once it is played', async ({ app }) => {
    const page = await openHome(app);
    await page.locator('#rdn-book-go').click();
    await expect(page.locator('#rd-staff .ss-n').first()).toBeVisible();
    await page.locator('#rd-names').check();
    await expect(page.locator('#rd-staff .ss-n').first()).toBeVisible();
    expect(await page.locator('#rd-staff .ss-syl').count()).toBe(0);
    await page.locator('#rd-names').uncheck();
    await playAttempt(page);
    await expect.poll(() => srtState(page)).toBe('saved');
    await page.locator('#rd-names').check();
    await expect(page.locator('#rd-staff .ss-syl').first()).toBeVisible();
  });

  test('the score stays where it is when an attempt starts: the checklist goes out of sight but keeps its room', async ({ app }) => {
    // Without the full-screen stage, which lays the page out anew.
    const page = await openHome(app, withBook({}, { stage: false }));
    await page.locator('#rdn-book-go').click();
    await expect(page.locator('#rdn-checklist li').first()).toBeVisible();
    // On the page, not in the window: the window follows the score once it plays.
    const top = () => page.evaluate(() => document.querySelector('#rd-staff').getBoundingClientRect().top + window.scrollY);
    const before = await top();
    await page.locator('#rd-go').click();
    await expect.poll(() => srtState(page)).toBe('countIn');
    await expect(page.locator('#rdn-checklist')).toBeHidden();
    expect(await top()).toBe(before);
  });

  test('a start by the first note is dropped once its first sight is no longer being claimed: the next keys go through', async ({ app }) => {
    const page = await openHome(app);
    await page.locator('#rdn-book-go').click();
    const first = await page.evaluate(() => window.__etude.srtLevelExpected(window.__etude.SR.lvPiece)[0]);
    await page.waitForTimeout(700); // a piece just opened does not take a key as its start
    // The first note starts the claim; the claim ends without an attempt (here: abandoned) before the next key.
    const facts = await page.evaluate((midi) => {
      const api = window.__etude;
      api.handleNoteOn(midi, 90, 'midi');
      const claimed = { state: api.SR.srtState.name, pending: api.srNoteStart?.events.length ?? 0 };
      api.srtSetState({ type: 'abandon' });
      api.handleNoteOff(midi, 'midi');
      return { claimed, state: api.SR.srtState.name, active: api.SR.active, pending: api.srNoteStart };
    }, first.midi);
    expect(facts).toEqual({ claimed: { state: 'claiming', pending: 1 }, state: 'abandoned', active: false, pending: null });
  });

  test('the old melody path still works next to the player', async ({ app, page }) => {
    await openHome(app);
    await page.locator('#rdn-book-go').click();
    await page.locator('#rdn-back').click();
    await page.locator('#rdt-pieces').click();
    await expect(page.locator('#rd-gen')).toBeVisible();
    await expect(page.locator('#rd-empty')).toBeVisible();
    await expect(page.locator('#rdn-player-head')).toBeHidden();
    await expect(page.locator('#rd-hands')).toBeVisible();
    await page.locator('#rd-mode button[data-v="assess"]').click();
    await page.locator('#rd-gen').click();
    await expect(page.locator('#rd-gen-title')).toContainText('Sight-reading');
    const facts = await page.evaluate(() => ({ old: !!window.__etude.SR.srtPiece, level: window.__etude.SR.lvPiece, bpm: window.__etude.SR.piece.bpm }));
    expect(facts).toEqual({ old: true, level: null, bpm: 60 });
    await page.locator('#rd-go').click();
    await expect.poll(() => srtState(page)).toBe('preview');
    await expect(page.locator('#rd-srt-countdown')).toContainText('20');
    await expect(page.locator('#rdn-checklist')).toBeHidden();
    await page.locator('#rd-srt-practice').click();
    // The old path keeps its verdict line and shows no result card.
    // Practice starts at once; finishing it gives the old one-line verdict.
    await expect.poll(() => page.evaluate(() => [window.__etude.SR.srtState.mode, window.__etude.SR.active])).toEqual(['practice', true]);
    await page.evaluate(() => window.__etude.srAssessFinish());
    await expect(page.locator('#rd-verdict')).toBeVisible();
    await expect(page.locator('#rd-verdict')).not.toBeEmpty();
    await expect(page.locator('#rdn-result')).toBeHidden();
    await expect(page.locator('#rd-lede')).toHaveText(en.rd_lede);
    await page.locator('#rdn-home-back').click();
    await expect(page.locator('#rdn-home')).toBeVisible();
  });

  test('a finished Step-by-step run shows the result card, with dashes for what it does not measure', async ({ app, page }) => {
    await openHome(app);
    await page.locator('#rdn-book-go').click();
    await page.locator('#rd-mode button[data-v="learn"]').click();
    await expect.poll(() => page.locator('#rd-staff .ss-n').count()).toBeGreaterThan(0);
    await page.locator('#rd-go').click();
    await page.evaluate(() => {
      const api = window.__etude;
      while (api.SR.active) {
        const step = api.SR.steps[api.SR.stepIdx];
        for (const note of step.notes) { api.handleNoteOn(note.midi, 100); api.handleNoteOff(note.midi); }
      }
    });
    await expect(page.locator('#rdn-result')).toBeVisible();
    await expect(page.locator('#rdn-r-score')).toHaveText('100%');
    await expect(page.locator('#rdn-result .rdx-stars')).toHaveAttribute('aria-label', /2/);
    const cells = await page.locator('#rdn-result .rdn-res b').allTextContents();
    expect(cells.slice(0, 3)).toEqual(['—', '—', '—']);
    await expect(page.locator('#rd-verdict')).toBeHidden();
    expect((await book(page)).pieces['b1.1']).toMatchObject({ best: 100, stars: 2 });
    // No auto-next after practice; Retry goes step by step again and brings the verdict line back.
    await expect(page.locator('#rdn-auto')).toBeHidden();
    await page.locator('#rdn-retry').click();
    await expect(page.locator('#rdn-result')).toBeHidden();
    await expect(page.locator('#rd-verdict')).toBeVisible();
    expect(await page.evaluate(() => [window.__etude.SR.modeSel, window.__etude.SR.active])).toEqual(['learn', true]);
  });

  test("Today's set keeps its level after a level change once a piece of it is played", async ({ app }) => {
    const page = await openHome(app, withBook({ level: 3 }));
    await page.locator('#rdn-today-go').click();
    await playAttempt(page);
    await page.locator('#rdn-back').click();
    await page.locator('[data-rdn-lv="4"]').click();
    await expect(page.locator('[data-rdn-lv="4"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.rdn-today .rdn-sub').first()).toContainText(fill(en.rdn_today_level, 3));
    await expect(page.locator('#rdn-today-stays')).toHaveText(fill(en.rdn_today_stays, 3));
    await expect(page.locator('.rdn-slot').first()).toHaveClass(/\bdone\b/);
    await page.locator('[data-rdn-slot="1"]').click();
    await expect(title(page)).toHaveText(fill(en.rdn_title_today, 2, 5));
    expect(await page.evaluate(() => window.__etude.SR.lvPiece.level)).toBe(3);
  });

  test('auto-next waits for the first-sight save and stops when another control is used', async ({ app }) => {
    const page = await openHome(app, withBook({}, { autoNext: true }));
    await page.locator('#rdn-book-go').click();
    await playAttempt(page);
    // The save of the first-sight result comes first, then the countdown.
    await expect(page.locator('#rdn-auto')).toBeVisible();
    await page.locator('#rd-listen').click();
    await expect(page.locator('#rdn-auto')).toBeHidden();
    await page.waitForTimeout(3500);
    await expect(title(page)).toHaveText(fill(en.rdn_title_no, 1, 96));
    // A key the page handles stops it too.
    await page.locator('#rd-listen').click(); // stops listening
    await page.locator('#rdn-retry').click();
    await expect.poll(() => srtState(page)).toBe('countIn');
    await perform(page);
    await expect(page.locator('#rdn-auto')).toBeVisible();
    await page.keyboard.press('a');
    await expect(page.locator('#rdn-auto')).toBeHidden();
    await page.waitForTimeout(3500);
    await expect(title(page)).toHaveText(fill(en.rdn_title_no, 1, 96));
  });

  test('auto-next does not run while a first-sight result is not saved, and starts once it is', async ({ app }) => {
    const page = await openHome(app, withBook({}, { autoNext: true }));
    await page.locator('#rdn-book-go').click();
    await page.locator('#rd-go').click();
    await expect.poll(() => srtState(page)).toBe('countIn');
    await installLedgerFailure(page);
    await perform(page);
    await expect.poll(() => srtState(page)).toBe('pendingSave');
    await expect(page.locator('#rd-srt-pending')).toBeVisible();
    await expect(page.locator('#rdn-result')).toBeVisible();
    await page.waitForTimeout(3500);
    await expect(page.locator('#rdn-auto')).toBeHidden();
    await expect(title(page)).toHaveText(fill(en.rdn_title_no, 1, 96));
    await restoreLedger(page);
    await page.locator('#rd-srt-retry').click();
    await expect.poll(() => srtState(page)).toBe('saved');
    await expect(page.locator('#rdn-auto')).toBeVisible();
    await expect(title(page)).toHaveText(fill(en.rdn_title_no, 2, 96), { timeout: 6000 });
  });

  test('Prev, Next and the arrow keys wait while an attempt runs', async ({ app, page }) => {
    await openHome(app);
    await page.evaluate(() => window.__etude.rdnOpen({ kind: 'book', level: 1, number: 3 }));
    // Before an attempt the piece only shows: Prev and Next are free.
    await expect(page.locator('#rdn-next')).toBeEnabled();
    await expect(page.locator('#rdn-prev')).toBeEnabled();
    await page.locator('#rd-go').click();
    await expect.poll(() => srtState(page)).toBe('countIn');
    await expect(page.locator('#rdn-next')).toBeDisabled();
    await expect(page.locator('#rdn-prev')).toBeDisabled();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await expect(title(page)).toHaveText(fill(en.rdn_title_no, 3, 96));
    expect(await srtState(page)).toBe('countIn');
    await perform(page);
    await expect(page.locator('#rdn-next')).toBeEnabled();
    await expect(page.locator('#rdn-prev')).toBeEnabled();
  });

  test('a piece already seen says it is practice, and the status line follows the language', async ({ app, page }) => {
    await openHome(app);
    await page.locator('#rdn-book-go').click();
    await expect(page.locator('#rd-verdict')).toHaveText(en.rdn_ready);
    await page.evaluate(() => window.__etude.setLang('ro'));
    await expect(page.locator('#rd-verdict')).toHaveText(STRINGS.ro.rdn_ready);
    await page.evaluate(() => window.__etude.setLang('en'));
    await playAttempt(page);
    await page.locator('#rdn-back').click();
    await page.locator('[data-rdn-n="1"]').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.mode)).toBe('practice');
    await expect(page.locator('#rd-verdict')).toHaveText(en.rdn_seen);
    await page.evaluate(() => window.__etude.setLang('de'));
    await expect(page.locator('#rd-verdict')).toHaveText(STRINGS.de.rdn_seen);
  });

  test('one hand on a level 5 piece is practice: no first-sight claim, and the next piece starts with both hands', async ({ app }) => {
    const page = await openHome(app, withBook({ level: 5 }));
    await page.locator('#rdn-book-go').click();
    await expect(page.locator('#rdn-hands-hint')).toBeHidden();
    await page.locator('#rd-hands button[data-v="rh"]').click();
    await expect(page.locator('#rdn-hands-hint')).toBeVisible();
    await expect(page.locator('#rdn-hands-hint')).toHaveText(en.rdn_hands_first);
    await page.locator('#rd-go').click();
    await expect.poll(() => srtState(page)).toBe('countIn');
    expect(await page.evaluate(() => window.__etude.SR.srtState.mode)).toBe('practice');
    await perform(page, ['rh']);
    const saved = await book(page);
    expect(saved.pieces['b5.1'].first ?? null).toBeNull();
    expect(saved.recent['5'] ?? []).toEqual([]);
    const ledger = await page.evaluate(() => { const l = window.__etude.srtReadLedger(localStorage); return { claims: Object.values(l.exposures).filter((x) => x.claim).length, attempts: Object.keys(l.attempts).length }; });
    expect(ledger).toEqual({ claims: 0, attempts: 0 });
    await page.locator('#rdn-r-next').click();
    await expect(title(page)).toHaveText(fill(en.rdn_title_no, 2, 96));
    await expect(page.locator('#rd-hands button[data-v="both"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#rdn-hands-hint')).toBeHidden();
  });

  test('the old melody screen keeps its mode after a book piece', async ({ app, page }) => {
    await openHome(app);
    await page.locator('#rdt-pieces').click();
    await page.locator('#rd-mode button[data-v="learn"]').click();
    await page.locator('#rdn-home-back').click();
    await page.locator('#rdn-book-go').click();
    expect(await page.evaluate(() => window.__etude.SR.modeSel)).toBe('assess');
    await page.locator('#rdn-back').click();
    await page.locator('#rdt-pieces').click();
    await expect(page.locator('#rd-mode button[data-v="learn"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.__etude.SR.modeSel)).toBe('learn');
  });

  test('two hands 80 ms apart on one beat both count as hit', async ({ app }) => {
    const page = await openHome(app, withBook({ level: 5 }));
    expect(await openTwoHandPiece(page)).toBeGreaterThan(0);
    await page.locator('#rd-go').click();
    await expect.poll(() => srtState(page)).toBe('countIn');
    const facts = await page.evaluate(() => {
      const api = window.__etude;
      api.srtSetState({ type: 'countInDone' });
      const expected = api.srtLevelExpected(api.SR.lvPiece, { bpm: api.SR.bpm, hand: 'both' });
      const late = (n) => (n.hand === 'lh' ? 80 : 0);
      const performed = [];
      expected.flatMap((n) => [['on', n.midi, n.onMs + late(n)], ['off', n.midi, Math.max(n.onMs + late(n) + 1, n.offMs - 20)]])
        .sort((a, b) => a[2] - b[2] || (a[0] === 'off' ? -1 : 1))
        .forEach(([kind, midi, ms]) => api.srtRecorder.record(kind, midi, 'typing:a', kind === 'off' ? 'physical' : null, ms));
      const rhStarts = new Set(expected.filter((n) => n.hand === 'rh').map((n) => n.onMs));
      const shared = new Set(expected.filter((n) => rhStarts.has(n.onMs) && expected.some((m) => m.hand === 'lh' && m.onMs === n.onMs)).map((n) => n.id));
      api.srAssessFinish();
      const results = api.SR.srtEvaluation.noteResults.filter((r) => shared.has(r.expectedId)).map((r) => r.classification);
      // The same notes with the default 60 ms window would not count.
      expected.forEach((n) => performed.push({ id: n.id + 'p', midi: n.midi, onMs: n.onMs + late(n), offMs: n.offMs - 20 + late(n) }));
      const strict = api.srtEvaluate(expected, performed, {}).noteResults.filter((r) => shared.has(r.expectedId)).map((r) => r.classification);
      return { results, strict };
    });
    expect(facts.results.length).toBeGreaterThan(1);
    expect(facts.results.every((c) => c === 'good' || c === 'near')).toBe(true);
    expect(facts.strict.some((c) => c !== 'good' && c !== 'near')).toBe(true);
  });

  test('the stars label is escaped and stays the same text', async ({ app, page }) => {
    // The built app serves a hashed .js chunk, the dev server the .ts source: match both.
    await page.route(/ui-en(?:-[^/?]+)?\.(?:js|ts)(?:\?.*)?$/, async (route) => {
      const response = await route.fetch();
      // The string sits in a JavaScript literal: escape the quote character that literal uses.
      const body = (await response.text()).replace(/(["'`])%s of 3 stars\1/, (_, quote) =>
        `${quote}${'%s of 3 "stars" & <b>'.split(quote).join(`\\${quote}`)}${quote}`);
      await route.fulfill({ response, body });
    });
    await openHome(app);
    await page.locator('#rdn-book-go').click();
    await playAttempt(page);
    await expect(page.locator('#rdn-result .rdx-stars')).toHaveAttribute('aria-label', '3 of 3 "stars" & <b>');
    await expect(page.locator('#rdn-result .rdx-stars b')).toHaveCount(0);
  });

  test('focus: the title on opening, the pressed button on Next with the title announced, the opener on Back', async ({ app, page }) => {
    await openHome(app);
    await page.locator('#rdn-book-go').click();
    await expect.poll(() => focusedId(page)).toBe('rdn-p-title');
    await page.locator('#rdn-next').click();
    await expect(title(page)).toHaveText(fill(en.rdn_title_no, 2, 96));
    await expect.poll(() => focusedId(page)).toBe('rdn-next');
    await expect(page.locator('#rdn-p-live')).toHaveText(fill(en.rdn_title_no, 2, 96));
    await page.locator('#rdn-back').click();
    await expect.poll(() => focusedId(page)).toBe('rdn-book-go');
    // The old screens: Back to Read returns to the button that opened them.
    await page.locator('#rdt-drills').click();
    await page.locator('#rdn-home-back').click();
    await expect.poll(() => focusedId(page)).toBe('rdt-drills');
    // The result card takes the focus only when it was lost: an attempt started with Start leaves it on that button.
    await page.locator('.rdn-num[data-rdn-n="1"]').click();
    await playAttempt(page);
    await expect(page.locator('#rdn-result')).toBeVisible();
    expect(await focusedId(page)).toBe('rd-go');
    // Retry closes the card: its focus goes to Start, and the next result card leaves it there.
    await page.locator('#rdn-retry').click();
    await expect.poll(() => srtState(page)).toBe('countIn');
    expect(await focusedId(page)).toBe('rd-go');
    await perform(page);
    await expect(page.locator('#rdn-result')).toBeVisible();
    expect(await focusedId(page)).toBe('rd-go');
  });

  test('fits 390px: no sideways scroll, header and result controls at least 44px', async ({ app, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHome(app);
    await page.locator('#rdn-book-go').click();
    await playAttempt(page);
    const facts = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      small: [...document.querySelectorAll('#rdn-player-head button, #rdn-result button, #rdn-result label')]
        .filter((el) => el.getClientRects().length && el.getBoundingClientRect().height < 44).map((el) => el.id || el.textContent),
    }));
    expect(facts).toEqual({ overflow: 0, small: [] });
  });

  test('the playhead moves at constant speed across mixed durations and barlines in Read and Rhythm', async ({ app, page }) => {
    await openHome(app);
    await page.locator('#rdn-book-go').click();
    await page.evaluate(() => {
      const api = window.__etude;
      api.SR.piece = {
        id: 'prop-test',
        engrave: 2,
        ts: [4, 4],
        keyN: 0,
        bpm: 90,
        rh: [
          ['C4', 4],
          ['D4', 2], ['E4', 1], ['F4', 0.5], ['G4', 0.5],
          ['A4', 0.25], ['B4', 0.25], ['C5', 0.25], ['D5', 0.25], ['R', 1], ['E5', 2],
          ['F5', 1.5], ['G5', 0.5], ['A5', 2],
        ],
        lh: [
          ['C3', 4],
          ['G2', 4],
          ['F2', 2], ['G2', 2],
          ['C3', 4],
        ],
      };
      api.srDraw();
    });

    const readSpeed = await page.evaluate(() => {
      const api = window.__etude;
      const pts = api.SR.beatX;
      const bySys = new Map();
      for (const p of pts) {
        const list = bySys.get(p.sy) ?? [];
        list.push(p);
        bySys.set(p.sy, list);
      }
      const maxErrBySys = [];
      for (const [sy, list] of bySys.entries()) {
        const b0 = list[0].b, b1 = list[list.length - 1].b;
        const slope = (list[list.length - 1].x - list[0].x) / (b1 - b0);
        let maxErr = 0;
        for (let b = b0 + 0.125; b < b1 - 1e-4; b += 0.25) {
          const at = api.srBeatPt(pts, b);
          api.srCursor(at.x, at.sy);
          const x1 = Number(document.querySelector('#rd-staff .ss-playhead').getAttribute('x1'));
          const expectedX = list[0].x + (b - b0) * slope;
          maxErr = Math.max(maxErr, Math.abs(x1 - expectedX));
        }
        maxErrBySys.push({ sy, slope, maxErr });
      }
      return maxErrBySys;
    });
    expect(readSpeed.length).toBeGreaterThanOrEqual(1);
    for (const s of readSpeed) {
      expect(s.slope).toBeGreaterThan(0);
      expect(s.maxErr).toBeLessThan(0.05);
    }

    // Rhythm drill staff also uses proportional time spacing across mixed note values and barline.
    await page.locator('#rdn-back').click();
    await page.evaluate(() => {
      const api = window.__etude;
      api.rdOpen(Object.values(api.RD_LV).find((l) => l.ty === 'rh'));
      api.rdStart('practice');
    });
    await expect(page.locator('#rdx-staff svg')).toBeVisible();
    const rhSpeed = await page.evaluate(() => {
      const api = window.__etude;
      api.RD.rh.ev = [
        { beat: 0, dur: 2, rest: false },
        { beat: 2, dur: 1, rest: false },
        { beat: 3, dur: 0.5, rest: false },
        { beat: 3.5, dur: 0.5, rest: false },
        { beat: 4, dur: 0.5, rest: false },
        { beat: 4.5, dur: 0.5, rest: false },
        { beat: 5, dur: 3, rest: false },
      ];
      api.RD.rh.piece = { id: 'rh', perc: true, noNames: true, ts: [4, 4], keyN: 0, bpm: 80, rh: api.RD.rh.ev.map((e) => [e.rest ? 'R' : 'B4', e.dur]) };
      api.RD.rh.paper = undefined;
      api.rdRhFit();
      const pts = api.RD.rh.r.beatX;
      const b0 = pts[0].b, b1 = pts[pts.length - 1].b;
      const slope = (pts[pts.length - 1].x - pts[0].x) / (b1 - b0);
      let maxErr = 0;
      for (let b = 0.25; b < 8; b += 0.25) {
        const at = api.srBeatPt(pts, b);
        maxErr = Math.max(maxErr, Math.abs(at.x - (pts[0].x + (b - b0) * slope)));
      }
      return { slope, maxErr };
    });
    expect(rhSpeed.slope).toBeGreaterThan(0);
    expect(rhSpeed.maxErr).toBeLessThan(0.05);
  });

  test('instant feedback toggle persists and marks notes, dock keys, and missed notes immediately in Assessment', async ({ app, page }) => {
    await app.open({ hash: 'read', dock: true, saved: withBook({}) });
    await page.locator('#rdn-book-go').click();
    await expect(page.locator('#rd-staff .ss-n').first()).toBeVisible();

    const toggle = page.locator('#rd-instant');
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect(toggle).toBeChecked();

    const savedPref = await page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).data.reading?.prefs?.instantFeedback);
    expect(savedPref).toBe(true);

    // Reload and confirm persistence.
    await page.reload();
    await expect(page.locator('#rdn-home')).toBeVisible();
    await page.locator('#rdn-book-go').click();
    await expect(page.locator('#rd-staff .ss-n').first()).toBeVisible();
    await expect(page.locator('#rd-instant')).toBeChecked();

    const expected = await page.evaluate(() => {
      const api = window.__etude;
      return api.srtLevelExpected(api.SR.lvPiece, { bpm: api.SR.bpm, hand: 'both' });
    });

    // Wrong note on count-in completion shows immediate bad verdict, dock key flash, and extra counter.
    await page.locator('#rd-go').click();
    await expect.poll(() => srtState(page)).toBe('countIn');
    await page.evaluate((firstMidi) => {
      const api = window.__etude;
      api.srtSetState({ type: 'countInDone' });
      api.SR.t0 = performance.now();
      api.handleNoteOn(firstMidi + 1, 90, 'midi');
    }, expected[0].midi);

    await expect(page.locator('#rd-verdict')).toHaveClass(/bad/);
    await expect(page.locator('#rd-verdict')).toContainText('✗');
    await expect(page.locator('#keys .key[data-s="bad"]')).toHaveCount(1);
    expect(await page.evaluate(() => window.__etude.SR.wrongExtra)).toBe(1);

    // Playing the right note immediately marks note 0 as good on staff and keyboard and clears/updates verdict.
    await page.evaluate((firstMidi) => {
      const api = window.__etude;
      api.SR.t0 = performance.now();
      api.handleNoteOn(firstMidi, 90, 'midi');
    }, expected[0].midi);

    await expect(page.locator('#rd-staff .ss-n[data-nid="0"]')).toHaveAttribute('data-s', 'good');
    await expect(page.locator('#rd-verdict')).toHaveClass(/good/);
    await expect(page.locator('#rd-verdict')).toContainText('✓');
    await expect(page.locator('#keys .key[data-s="good"]')).toHaveCount(1);

    // Unplayed second note gets marked bad once its window passes.
    await page.evaluate((secondOnMs) => {
      const api = window.__etude;
      api.SR.t0 = performance.now() - (secondOnMs + 400);
    }, expected[1].onMs);
    await expect(page.locator('#rd-staff .ss-n[data-nid="1"]')).toHaveAttribute('data-s', 'bad');

    // Final evaluation at the end of attempt stays authoritative.
    await page.evaluate(() => {
      window.__etude.srAssessFinish();
    });
    await expect(page.locator('#rdn-result')).toBeVisible();
    await expect.poll(() => srtState(page)).toBe('saved');
    const finalEval = await page.evaluate(() => window.__etude.SR.srtEvaluation);
    expect(finalEval.FP).toBeGreaterThanOrEqual(1);

    // Next piece started via MIDI first note immediately marks the starting note and keeps the instant verdict.
    await page.evaluate((firstMidi) => {
      const api = window.__etude;
      api.handleNoteOff(firstMidi, 'midi');
      api.handleNoteOff(firstMidi + 1, 'midi');
    }, expected[0].midi);
    await page.locator('#rdn-next').click();
    await expect(title(page)).toHaveText(fill(en.rdn_title_no, 2, 96));
    const nextFirst = await page.evaluate(() => window.__etude.srtLevelExpected(window.__etude.SR.lvPiece)[0]);
    await expect.poll(async () => {
      return page.evaluate((m) => {
        const api = window.__etude;
        const name = api.SR.srtState?.name;
        if (name !== 'preparing' && name !== 'claiming' && name !== 'preview' && name !== 'countIn' && name !== 'playing') {
          api.handleNoteOn(m, 90, 'midi');
          if (!api.SR.active && api.SR.srtState?.name !== 'preparing' && api.SR.srtState?.name !== 'claiming')
            api.handleNoteOff(m, 'midi');
        }
        return api.SR.srtState?.name;
      }, nextFirst.midi);
    }, { timeout: 5000 }).toBe('playing');
    await expect(page.locator('#rd-staff .ss-n[data-nid="0"]')).toHaveAttribute('data-s', 'good');
    await expect(page.locator('#rd-verdict')).toHaveClass(/good/);
    await expect(page.locator('#rd-verdict')).toContainText('✓');
  });
});

import { test, expect } from '../helpers/fixtures.mjs';
import { STRINGS } from '../../src/locales/index.js';

// The player of level pieces (spec section 8): the header, the preview checklist, an assessed attempt with its result
// card, the saved book state, Prev / Next, Today's set, and the old melody path next to it.
const en = STRINGS.en;
const fill = (s, ...args) => args.reduce((out, value, i) => { const mark = ['%a', '%b'][i]; return out.replace(mark && out.includes(mark) ? mark : '%s', String(value)); }, s);
const book = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).data.reading?.book ?? null);
const srtState = (page) => page.evaluate(() => window.__etude.SR.srtState.name);
const withBook = (bookState) => ({ v: 3, lang: 'en', data: { reading: { book: { v: 1, level: 1, focusKey: null, pieces: {}, recent: {}, daily: null, days: [], ...bookState } } } });

async function openHome(app, saved) {
  const page = await app.open({ hash: 'read', saved });
  await expect(page.locator('#rdn-home')).toBeVisible();
  return page;
}
// Plays the attempt from the Start button: first sight goes through the preview, practice straight to the count-in.
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

  test('the preview shows a checklist for 30 seconds and the score is engraved, one note group per note', async ({ app }) => {
    const page = await openHome(app);
    await page.locator('#rdn-book-go').click();
    await expect(page.locator('#rd-staff .ss-n')).toHaveCount(0); // hidden until the preview
    await page.locator('#rd-go').click();
    await expect.poll(() => srtState(page)).toBe('preview');
    await expect(page.locator('#rd-srt-countdown')).toContainText('30');
    const items = page.locator('#rdn-checklist li');
    await expect(items.first()).toHaveText(en.rdn_check_sig);
    await expect(items.nth(1)).toHaveText(en.rdn_check_first);
    expect(await items.count()).toBeGreaterThanOrEqual(3);
    const counts = await page.evaluate(() => ({
      drawn: document.querySelectorAll('#rd-staff .ss-n').length,
      notes: window.__etude.srtLevelExpected(window.__etude.SR.lvPiece).length,
    }));
    expect(counts.drawn).toBe(counts.notes);
    await page.locator('#rd-srt-practice').click();
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
    // The practice run played nothing, so it earned no star: no auto-next.
    await expect(page.locator('#rdn-auto')).toBeHidden();
    await page.locator('#rdn-retry').click();
    await expect.poll(() => srtState(page)).toBe('countIn');
    await perform(page);
    await expect(page.locator('#rdn-auto')).toBeVisible();
    await expect(page.locator('#rdn-auto')).toContainText(fill(en.rdn_auto_in, 3));
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
});

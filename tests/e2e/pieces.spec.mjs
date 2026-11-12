import { test, expect, todayN } from '../helpers/fixtures.mjs';

// Pieces (view `analysis`): the built-in pieces and My Library play in one player, and whole-piece runs save progress.

// Engraved bars per piece; an upbeat is bar 0 and counts as one.
const BARS = { w5rh: 4, w5lh: 4, clair: 4, mary: 8, twinkle: 4, hotcross: 8, lightly: 16, rhody: 8, frere: 8, ode: 8, saints: 8, jingle: 8, susanna: 9, auralee: 8, brahms: 9,
  london: 8, minuet: 8, elise: 6, greensleeves: 9, grace: 8, canon: 13, gymno: 8, prelude: 8 };
const UPBEAT = ['susanna', 'brahms', 'greensleeves', 'grace'];
const THREE_FOUR = ['brahms', 'minuet', 'elise', 'greensleeves', 'grace', 'gymno'];
// Key signature (fifths) of each piece as engraved.
const FIFTHS = { auralee: 1, brahms: -1, minuet: 1, canon: 2, gymno: 2 };

async function openPiece(page, id) {
  await page.evaluate(pieceId => window.__etude.pcOpen(pieceId), id);
  await page.waitForFunction(pieceId => !window.__etude.AN.loading && window.__etude.AN.source?.id === pieceId && !!window.__etude.SCORE.geo, id);
}
// Starts a practice run of the whole piece (or of the selection), as the Play button does.
async function startRun(page, { wait = false, selection = false, from = 0 } = {}) {
  await page.evaluate(async ({ w, sel, at }) => {
    const api = window.__etude;
    api.pracSet('wait', w);
    await api.scorePlay(sel, at);
  }, { w: wait, sel: selection, at: from });
  await expect.poll(() => page.evaluate(() => !!window.__etude.SCORE.run)).toBe(true);
}
// Ends the running pass with the given judgements (`all`: every note of my part played, as Wait for me requires).
async function endRun(page, { perfect = 0, miss = 0, all = false } = {}) {
  await page.evaluate(({ hit, missed, every }) => {
    const api = window.__etude, R = api.SCORE.run;
    api.PRAC.active = true;
    if (every)
      R.mine.forEach(d => R.judged.set(d.i, 'perfect'));
    Object.assign(api.PRAC.stats, { perfect: every ? R.mine.length : hit, good: 0, miss: missed, wrong: 0 });
    api.pracFinish(R);
  }, { hit: perfect, missed: miss, every: all });
}
const progress = (page, id) => page.evaluate(pieceId => {
  const d = window.__etude.data;
  return { sheet: d.sheet[pieceId] ?? null, piece: d.toolDay?.piece ?? null, todayDay: d.todayDay, streak: d.streak };
}, id);

// The data of every built-in piece: ids, levels, pitches within the 88 keys, both hands the same length, whole bars after an upbeat.
test('every built-in piece is well formed', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  const pieces = await page.evaluate(() => window.__etude.PIECES.map(p => ({ id: p.id, level: p.level, ts: p.ts, pickup: p.pickup || 0, rh: p.rh, lh: p.lh, title: p.t.en, ro: p.t.ro })));
  expect(pieces.length).toBe(Object.keys(BARS).length);
  expect(new Set(pieces.map(p => p.id)).size).toBe(pieces.length);
  const midi = name => {
    const m = /^([A-G])([#b]?)(\d)$/.exec(name);
    return m ? 12 * (+m[3] + 1) + [0, 2, 4, 5, 7, 9, 11]['CDEFGAB'.indexOf(m[1])] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) : NaN;
  };
  for (const p of pieces) {
    expect([1, 2, 3], p.id).toContain(p.level);
    expect(p.title && p.ro, p.id).toBeTruthy();
    const beats = hand => hand.reduce((sum, [, d]) => sum + d, 0), bar = p.ts[1] === 8 ? p.ts[0] / 2 : p.ts[0];
    expect(beats(p.rh), p.id).toBe(beats(p.lh));
    expect(Number.isInteger((beats(p.rh) - p.pickup) / bar), p.id).toBe(true);
    for (const [pitch] of [...p.rh, ...p.lh]) {
      if (pitch === 'R') continue;
      for (const name of [].concat(pitch)) {
        const m = midi(name);
        expect(m >= 21 && m <= 108, `${p.id}: ${name}`).toBe(true);
      }
    }
  }
});

test('all built-in pieces open in Pieces with their bars, upbeats, meter, key and both hands', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await expect(page.locator('#pc-list .pc-item')).toHaveCount(Object.keys(BARS).length);
  await expect(page.locator('#pc-sum')).toHaveText(`Built-in pieces (${Object.keys(BARS).length})`);
  await expect(page.locator('#pc-list .pc-level-h')).toHaveText(['Level 1', 'Level 2', 'Level 3']);
  await expect(page.locator('#an-side')).toBeHidden(); // the harmony panel starts closed
  for (const [id, bars] of Object.entries(BARS)) {
    if (!await page.locator('#pc-pick').evaluate(d => d.open))
      await page.locator('#pc-sum').click();
    await page.locator(`#pc-list .pc-item[data-piece="${id}"]`).click();
    await page.waitForFunction(pieceId => !window.__etude.AN.loading && window.__etude.AN.source?.id === pieceId && !!window.__etude.SCORE.geo, id);
    const shape = await page.evaluate(() => {
      const api = window.__etude, doc = new DOMParser().parseFromString(api.SCORE.xml, 'application/xml');
      const hands = new Set(api.AN.notes.map(n => api.anHandOf(n)));
      const last = api.SCORE.measures[api.SCORE.measures.length - 1];
      return {
        bars: api.SCORE.measures.length,
        first: api.SCORE.measures[0].number,
        implicit: doc.querySelector('measure')?.getAttribute('implicit') ?? null,
        time: doc.querySelector('time beats').textContent + '/' + doc.querySelector('time beat-type').textContent,
        fifths: +doc.querySelector('key fifths').textContent,
        staves: document.querySelectorAll('#an-roll .vf-stave').length,
        hands: [...hands].sort(),
        lastBarLh: api.AN.notes.some(n => api.anHandOf(n) === 'lh' && n.start >= last.start - 1e-6),
        current: document.querySelector('#pc-list .pc-item[aria-current="true"]')?.dataset.piece,
      };
    });
    expect(shape, id).toMatchObject({ bars, hands: ['lh', 'rh'], lastBarLh: true, current: id, fifths: FIFTHS[id] ?? 0 });
    // Both staves are engraved for every bar: a treble and a bass staff per bar.
    expect(shape.staves, id).toBe(bars * 2);
    const upbeat = UPBEAT.includes(id);
    expect(shape.first, id).toBe(upbeat ? '0' : '1');
    expect(shape.implicit, id).toBe(upbeat ? 'yes' : null);
    expect(shape.time, id).toBe(THREE_FOUR.includes(id) ? '3/4' : '4/4');
  }
  expect(app.errors.map(e => e.message)).toEqual([]);
});

test('Learn links and the Read & Play tab lead to the piece in Pieces', async ({ app, page }) => {
  await app.open({ hash: 'read' });
  await page.locator('#rdt-pieces').click();
  await page.locator('#rd-to-pieces').click();
  await expect(page).toHaveURL(/#analysis$/);
  await page.evaluate(() => { window.__etude.show('learn'); window.__etude.learnGoId('cad'); });
  // The cadences lesson's "See it in Pieces: Minuet in G" button (data-an).
  const link = page.locator('#learnBody [data-an="minuet"]').first();
  await expect(link).toContainText('See it in Pieces');
  await link.click();
  await page.waitForFunction(() => !window.__etude.AN.loading && window.__etude.AN.source?.id === 'minuet' && !!window.__etude.SCORE.geo);
  await expect(page.locator('#view-analysis')).toHaveClass(/active/);
  await expect(page.locator('#an-name')).toHaveText('Minuet in G (Petzold)');
});

test('a whole timed run keeps the best accuracy, counts the day and sets the Today piece flag', async ({ app, page }) => {
  // Progress saved by the old Read & Play player uses the same fields and shows straight away.
  await app.open({ hash: 'analysis', saved: { v: 3, lang: 'en', data: { sheet: { minuet: { best: 70, learned: true } } } } });
  const minuet = page.locator('#pc-list .pc-item[data-piece="minuet"]');
  await expect(minuet.locator('.pc-best')).toHaveText('Best: 70%');
  await expect(minuet.locator('.pc-ok')).toContainText('learned');

  await openPiece(page, 'w5rh');
  await startRun(page);
  await endRun(page, { perfect: 9, miss: 1 });
  await expect(page.locator('#pr-sum')).toBeVisible();
  await expect(page.locator('#pr-sum-best')).toHaveText('New best: 90%');
  await expect(page.locator('#pr-sum-why')).toBeHidden();
  expect(await progress(page, 'w5rh')).toEqual({ sheet: { best: 90 }, piece: todayN(), todayDay: todayN(), streak: 1 });
  await expect(page.locator('#pc-list .pc-item[data-piece="w5rh"] .pc-best')).toHaveText('Best: 90%');

  await page.locator('#pr-close').click();
  await startRun(page);
  await endRun(page, { perfect: 3, miss: 1 });
  await expect(page.locator('#pr-sum-best')).toHaveText('Best: 90%');
  expect((await progress(page, 'w5rh')).sheet).toEqual({ best: 90 });

  await page.reload();
  await page.waitForFunction(() => typeof window.__etude?.show === 'function');
  expect((await progress(page, 'w5rh')).sheet).toEqual({ best: 90 });
});

test('a complete Wait for me pass marks the piece learned; an unfinished one does not', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await openPiece(page, 'twinkle');
  await startRun(page, { wait: true });
  await page.evaluate(() => { const R = window.__etude.SCORE.run; R.judged.set(R.mine[0].i, 'perfect'); });
  await endRun(page, { perfect: 1 });
  expect((await progress(page, 'twinkle')).sheet).toBeNull();
  await expect(page.locator('#pr-sum-best')).toBeHidden();
  await expect(page.locator('#pr-sum-why')).toHaveText('Not saved: some notes were not played.');

  await page.locator('#pr-close').click();
  await startRun(page, { wait: true });
  await endRun(page, { all: true });
  expect(await progress(page, 'twinkle')).toEqual({ sheet: { learned: true }, piece: todayN(), todayDay: todayN(), streak: 1 });
  await expect(page.locator('#pr-sum-best')).toHaveText('✓ Learned');
  await expect(page.locator('#pc-list .pc-item[data-piece="twinkle"] .pc-ok')).toBeAttached();
});

test('a selection, an A–B loop or a run from the middle of the piece saves nothing, and the card says why', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await openPiece(page, 'ode');
  const why = page.locator('#pr-sum-why');
  await page.evaluate(() => { const api = window.__etude; api.AN.selected = new Set([0, 1, 2, 3]); api.anSelectionChanged(); });
  await startRun(page, { selection: true });
  await endRun(page, { perfect: 4 });
  await expect(why).toHaveText('Not saved: a selection is not the whole piece.');

  await page.evaluate(() => window.__etude.anClearSelection());
  await page.evaluate(async () => {
    const api = window.__etude;
    api.PRAC.A = 0;
    api.PRAC.B = api.scoreSeconds(8);
    await api.scoreLoopStart();
  });
  await expect.poll(() => page.evaluate(() => !!window.__etude.SCORE.run?.loop)).toBe(true);
  await endRun(page, { perfect: 8 });
  await expect(why).toHaveText('Not saved: loops and A–B ranges are not a whole run.');

  const middle = await page.evaluate(() => window.__etude.scoreSeconds(8));
  await startRun(page, { from: middle });
  await endRun(page, { perfect: 8 });
  await expect(why).toHaveText('Not saved: the run did not go from the first note to the last.');

  // One hand of a two-hand piece is practice, not the whole piece.
  await page.evaluate(() => window.__etude.pracSet('hands', 'rh'));
  await startRun(page, { wait: true });
  await endRun(page, { all: true });
  await expect(why).toHaveText('Not saved: play both hands for the run to count.');
  await expect(page.locator('#pr-sum-best')).toBeHidden();
  await startRun(page);
  await endRun(page, { perfect: 8 });
  await expect(why).toHaveText('Not saved: play both hands for the run to count.');
  expect(await progress(page, 'ode')).toMatchObject({ sheet: null, piece: null });
  expect(await page.evaluate(() => window.__etude.data.todayDay)).not.toBe(todayN());
});

test('an upbeat is engraved as bar 0 and its click is not the accented downbeat', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await openPiece(page, 'grace');
  const beats = await page.evaluate(() => {
    const api = window.__etude, b1 = api.scoreSeconds(api.SCORE.measures[1].start);
    return api.pracBeats().slice(0, 3).map(b => ({ acc: b.acc, bar1: Math.abs(b.t - b1) < 1e-6 }));
  });
  expect(beats).toEqual([{ acc: false, bar1: false }, { acc: true, bar1: true }, { acc: false, bar1: false }]);
});

test('Accept any octave lets Wait for me and timed runs take a key an octave away', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await openPiece(page, 'w5rh');
  const verdicts = await page.evaluate(() => {
    const api = window.__etude, B = { need: new Set([60]), got: new Set() };
    api.data.settings.anyOctave = false;
    const off = [api.pracNeedKey(B, 48), api.pracSame(60, 48)];
    api.data.settings.anyOctave = true;
    return { off, on: [api.pracNeedKey(B, 48), api.pracSame(60, 72), api.pracSame(60, 62)] };
  });
  expect(verdicts).toEqual({ off: [null, false], on: [60, true, false] });

  // A real key press in Wait for me: C3 releases the barrier at C4.
  await page.evaluate(() => { const api = window.__etude; api.pracSet('hands', 'rh'); });
  await startRun(page, { wait: true });
  await expect.poll(() => page.evaluate(() => {
    const api = window.__etude, R = api.SCORE.run;
    return !!api.PRAC.bar && api.actx.currentTime >= R.segs[0].a0;
  })).toBe(true);
  const need = await page.evaluate(() => [...window.__etude.PRAC.bar.need][0]);
  await page.evaluate(m => { window.__etude.handleNoteOn(m - 12, 100); window.__etude.handleNoteOff(m - 12); }, need);
  await expect.poll(() => page.evaluate(() => window.__etude.PRAC.stats.perfect + window.__etude.PRAC.stats.good)).toBe(1);
  await page.evaluate(() => window.__etude.scoreStop());
});

test('a whole run paused and resumed still saves a best, but only when every note of the piece was judged', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await openPiece(page, 'w5rh');
  // Pause after the first beats, then carry on from the same spot with Play (Space).
  const pauseAndResume = async () => {
    await startRun(page);
    await expect.poll(() => page.evaluate(() => window.__etude.fallTime()), { timeout: 15_000 }).toBeGreaterThan(1);
    await page.evaluate(() => window.__etude.scorePause());
    expect(await page.evaluate(() => !!window.__etude.SCORE.resume?.run)).toBe(true);
    await page.evaluate(() => window.__etude.scoreToggle());
    await expect.poll(() => page.evaluate(() => !!window.__etude.SCORE.run)).toBe(true);
    return page.evaluate(() => { const R = window.__etude.SCORE.run; return { from: R.from, origin: R.origin, mine: R.mine.length, all: window.__etude.AN.notes.length }; });
  };
  const run = await pauseAndResume();
  expect(run.from).toBeGreaterThan(1);
  expect(run.origin).toBe(0);
  expect(run.mine).toBe(run.all); // my whole part, not only what was left after the pause
  // Turning the accompaniment off mid-run restarts the sound, not the run.
  await page.evaluate(() => window.__etude.pracSet('acc', false));
  await expect.poll(() => page.evaluate(() => window.__etude.SCORE.run?.origin)).toBe(0);
  await page.evaluate(() => window.__etude.pracSet('acc', true));
  await expect.poll(() => page.evaluate(() => window.__etude.SCORE.run?.origin)).toBe(0);
  // Nothing was judged before the pause: the run does not count, and the card says why.
  await endRun(page, { perfect: 5 });
  await expect(page.locator('#pr-sum-best')).toBeHidden();
  await expect(page.locator('#pr-sum-why')).toHaveText('Not saved: some notes were not played.');
  expect((await progress(page, 'w5rh')).sheet).toBeNull();

  await page.locator('#pr-close').click();
  await pauseAndResume();
  await endRun(page, { all: true });
  await expect(page.locator('#pr-sum-best')).toHaveText('New best: 100%');
  await expect(page.locator('#pr-sum-why')).toBeHidden();
  expect(await progress(page, 'w5rh')).toEqual({ sheet: { best: 100 }, piece: todayN(), todayDay: todayN(), streak: 1 });
});

test('a paused run moved to another bar before Play starts a new run, which does not count', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await openPiece(page, 'w5rh');
  await startRun(page);
  await expect.poll(() => page.evaluate(() => window.__etude.fallTime()), { timeout: 15_000 }).toBeGreaterThan(1);
  await page.evaluate(() => { const api = window.__etude; api.scorePause(); api.FALL.position = api.scoreSeconds(8); api.scoreToggle(); });
  await expect.poll(() => page.evaluate(() => !!window.__etude.SCORE.run)).toBe(true);
  expect(await page.evaluate(() => window.__etude.SCORE.run.origin)).toBeUndefined();
  await endRun(page, { all: true });
  await expect(page.locator('#pr-sum-why')).toHaveText('Not saved: the run did not go from the first note to the last.');
  expect((await progress(page, 'w5rh')).sheet).toBeNull();
});

test('Note names writes each note’s name beside it in the note-name setting, and the choice is remembered', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await openPiece(page, 'brahms');
  const names = page.locator('#an-roll .sc-nn'), btn = page.locator('#sc-names');
  const texts = () => names.evaluateAll(list => [...new Set(list.map(n => n.textContent))].sort());
  const heads = () => page.evaluate(() => [...window.__etude.SCORE.heads.values()].reduce((n, list) => n + list.length, 0));
  await expect(names).toHaveCount(0);
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(names).toHaveCount(await heads());
  expect(await texts()).toEqual(['A', 'B♭', 'C', 'D', 'E', 'F', 'G']);
  // Each name sits just right of its notehead, level with it.
  const placed = await page.evaluate(() => [...document.querySelectorAll('#an-roll .sc-nn')].every(n => {
    const head = window.__etude.SCORE.heads.get(+n.dataset.nn).map(h => h.getBoundingClientRect()), r = n.getBoundingClientRect(), mid = (r.top + r.bottom) / 2;
    return head.some(h => r.left >= h.right - 1 && r.left - h.right < h.height && mid > h.top && mid < h.bottom);
  }));
  expect(placed).toBe(true);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('etude-practice-v3'))).names).toBe(true);

  await page.reload();
  await page.waitForFunction(() => typeof window.__etude?.show === 'function');
  await openPiece(page, 'brahms');
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(names).toHaveCount(await heads());

  await page.evaluate(() => { window.__etude.notation = 'solfege'; window.__etude.applyNotation(); });
  await expect.poll(texts).toEqual(['Do', 'Fa', 'La', 'Mi', 'Re', 'Si♭', 'Sol']);
  await page.evaluate(() => { window.__etude.notation = 'german'; window.__etude.applyNotation(); });
  await expect.poll(texts).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);

  await btn.click();
  await expect(names).toHaveCount(0);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('etude-practice-v3'))).names).toBe(false);
});

test('Note names spell a MusicXML note as the file writes it, not as the key would', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  // C major, with a G flat (the key alone would call it F sharp).
  const xml = '<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>'
    + [['C', 0], ['G', -1], ['E', 0], ['C', 0]].map(([step, alter]) => `<note><pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>4</octave></pitch><duration>1</duration><type>quarter</type>${alter ? '<accidental>flat</accidental>' : ''}</note>`).join('')
    + '</measure></part></score-partwise>';
  await page.locator('#an-file').setInputFiles({ name: 'flat.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await page.waitForFunction(() => !window.__etude.AN.loading && window.__etude.AN.source?.kind === 'xml' && !!window.__etude.SCORE.geo);
  await page.locator('#sc-names').click();
  await expect(page.locator('#an-roll .sc-nn')).toHaveText(['C', 'G♭', 'E', 'C']);
});

test('Full window fills the window with the player; Esc and leaving Pieces end it', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await openPiece(page, 'canon');
  const btn = page.locator('#sc-stage'), stage = () => page.evaluate(() => document.body.dataset.stage ?? null);
  // The Note names and Full window toggles sit in the status bar, so the toolbar keeps its one row at laptop widths.
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 720 });
    await expect.poll(() => page.locator('#an-toolbar').evaluate(el => el.getBoundingClientRect().height), { message: `toolbar at ${width}px` }).toBeLessThan(60);
  }
  const before = await page.locator('#an-roll').evaluate(el => el.getBoundingClientRect().height);
  await btn.click();
  expect(await stage()).toBe('pieces');
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  for (const id of ['#pc-pick', '#score-library-root', '#an-src', '#nav'])
    await expect(page.locator(id)).toBeHidden();
  await expect.poll(() => page.evaluate(() => {
    const p = document.querySelector('#an-panel').getBoundingClientRect(), dock = document.querySelector('#dock'), d = dock.getBoundingClientRect();
    const floor = d.height && getComputedStyle(dock).display !== 'none' ? d.top : innerHeight;
    return Math.abs(p.top) < 4 && p.left === 0 && Math.round(p.width) === innerWidth && Math.abs(p.bottom - floor) < 6 && document.documentElement.scrollWidth <= innerWidth;
  })).toBe(true);
  expect(await page.locator('#an-roll').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(before);

  await page.keyboard.press('Escape');
  expect(await stage()).toBeNull();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#pc-pick')).toBeVisible();

  await btn.click();
  expect(await stage()).toBe('pieces');
  await page.evaluate(() => window.__etude.show('today'));
  expect(await stage()).toBeNull();
  await expect(page.locator('#nav')).toBeVisible();
});

test('on a phone the full window keeps its way out on screen', async ({ app, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await app.open({ hash: 'analysis' });
  await openPiece(page, 'canon');
  const btn = page.locator('#sc-stage');
  await btn.click();
  expect(await page.evaluate(() => document.body.dataset.stage)).toBe('pieces');
  await expect(btn).toBeInViewport();
  await expect(btn).toHaveAttribute('aria-label', 'Leave full window (Esc)');
  await expect(page.locator('#bottomNav')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await btn.click();
  expect(await page.evaluate(() => document.body.dataset.stage ?? null)).toBeNull();
});

test('on a phone the Analysis button never covers the open built-in list', async ({ app, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await app.open({ hash: 'analysis' });
  await openPiece(page, 'twinkle');
  const fab = page.locator('#an-fab'), pick = page.locator('#pc-pick');
  await page.locator('#an-stage').scrollIntoViewIfNeeded();
  await expect(fab).toBeVisible();
  if (!await pick.evaluate(d => d.open))
    await page.locator('#pc-sum').click();
  await pick.evaluate(d => d.scrollIntoView({ block: 'start' }));
  await expect(fab).toBeHidden();
  // Every piece on screen can be tapped: what sits at its right end is the piece's own button.
  const covered = await page.evaluate(() => {
    const top = document.querySelector('header').getBoundingClientRect().bottom;
    const floor = Math.min(...['dock', 'bottomNav'].map(id => { const el = document.getElementById(id), r = el.getBoundingClientRect(); return r.height && getComputedStyle(el).display !== 'none' ? r.top : innerHeight; }));
    return [...document.querySelectorAll('#pc-list .pc-item')].filter(b => {
      const r = b.getBoundingClientRect();
      if (r.top < top || r.bottom > floor)
        return false;
      const el = document.elementFromPoint(r.right - 12, r.top + r.height / 2);
      return !el || !b.contains(el);
    }).map(b => b.dataset.piece);
  });
  expect(covered).toEqual([]);
  // Closed again, the list no longer needs the room.
  await page.locator('#pc-sum').click();
  await page.locator('#an-stage').scrollIntoViewIfNeeded();
  await expect(fab).toBeVisible();
});

const xmlScore = (title) => `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>${title}</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${Array.from({ length: 2 }, (_, bar) => `<measure number="${bar + 1}">${bar ? '' : '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>'}${Array.from({ length: 4 }, () => '<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>').join('')}</measure>`).join('')}</part></score-partwise>`;
const libraryRow = (page, title) => page.locator('#library-items > li').filter({ has: page.locator('h3', { hasText: title }) });
async function openLibrary(page) {
  const details = page.locator('#score-library');
  if (!await details.evaluate(node => node.open))
    await details.locator('summary').click();
}

test('a library file keeps its best and last-played day and shows them in My Library', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  await page.locator('#an-file').setInputFiles({ name: 'progress.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xmlScore('Progress Etude')) });
  await page.waitForFunction(() => !window.__etude.AN.loading && window.__etude.AN.source?.kind === 'xml' && !!window.__etude.SCORE.geo);
  await openLibrary(page);
  await expect(libraryRow(page, 'Progress Etude')).toHaveCount(1);
  await expect(libraryRow(page, 'Progress Etude').locator('.score-library-progress')).toBeHidden();

  await startRun(page);
  await endRun(page, { perfect: 6, miss: 2 });
  await expect(page.locator('#pr-sum-best')).toHaveText('New best: 75%');
  const shown = libraryRow(page, 'Progress Etude').locator('.score-library-progress');
  await expect(shown).toContainText('Best: 75%');
  await expect(shown).toContainText('Last played:');
  expect((await progress(page, 'none')).piece).toBe(todayN());

  await page.locator('#pr-close').click();
  await startRun(page);
  await endRun(page, { perfect: 1, miss: 1 });
  await expect(page.locator('#pr-sum-best')).toHaveText('Best: 75%');
  await page.reload();
  await page.waitForFunction(() => typeof window.__etude?.show === 'function');
  await openLibrary(page);
  await expect(libraryRow(page, 'Progress Etude').locator('.score-library-progress')).toContainText('Best: 75%');
});

test('library records saved before practice progress existed still load, open and take a best', async ({ app, page }) => {
  await app.open({ hash: 'analysis' });
  const text = xmlScore('Old Record');
  await page.evaluate(async source => {
    const bytes = new TextEncoder().encode(source), hash = await crypto.subtle.digest('SHA-256', bytes);
    const id = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
    const file = new File([bytes], 'old.musicxml');
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('etude-score-library-v1', 1);
      req.onupgradeneeded = () => { for (const name of ['metadata', 'blobs']) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['metadata', 'blobs'], 'readwrite');
      // The record shape before best/lastPlayedDay were added.
      tx.objectStore('metadata').put({ title: 'Old Record', composer: '', id, name: 'old.musicxml', size: file.size, addedAt: 1700000000000, lastOpenedAt: null, favorite: false, resume: null }, id);
      tx.objectStore('blobs').put(file, id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, text);
  await page.reload();
  await page.waitForFunction(() => typeof window.__etude?.show === 'function');
  await openLibrary(page);
  const row = libraryRow(page, 'Old Record');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.score-library-progress')).toBeHidden();
  await row.locator('[data-library-action=open]').click();
  await page.waitForFunction(() => !window.__etude.AN.loading && window.__etude.AN.source?.kind === 'xml' && !!window.__etude.SCORE.geo);
  await startRun(page);
  await endRun(page, { perfect: 8 });
  await expect(row.locator('.score-library-progress')).toContainText('Best: 100%');
});

test('the Read & Play tab holds only sight-reading and still runs a generated melody step by step and assessed', async ({ app, page }) => {
  await app.open({ hash: 'read', dock: true });
  await page.locator('#rdt-pieces').click();
  await expect(page.locator('#rd-piece')).toHaveCount(0);
  await expect(page.locator('#rd-empty')).toBeVisible();
  await expect(page.locator('#rd-go')).toBeDisabled();

  await page.locator('#rd-mode button[data-v="learn"]').click();
  await page.locator('#rd-gen').click();
  await expect(page.locator('#rd-empty')).toBeHidden();
  await expect(page.locator('#rd-gen-title')).toContainText('Sight-reading');
  await expect.poll(() => page.locator('#rd-staff .ss-n').count()).toBeGreaterThan(0);
  await page.locator('#rd-go').click();
  await page.evaluate(() => {
    const api = window.__etude;
    while (api.SR.active) {
      const step = api.SR.steps[api.SR.stepIdx];
      for (const note of step.notes) { api.handleNoteOn(note.midi, 100); api.handleNoteOff(note.midi); }
    }
  });
  await expect(page.locator('#rd-verdict')).toContainText(await page.evaluate(() => window.__etude.t('rd_perfect')));

  await page.locator('#rd-mode button[data-v="assess"]').click();
  await page.locator('#rd-go').click();
  await expect.poll(() => page.evaluate(() => window.__etude.SR.active)).toBe(true);
  await page.evaluate(() => window.__etude.srAssessFinish());
  await expect(page.locator('#rd-verdict')).toContainText(await page.evaluate(() => window.__etude.t('rd_score', '').replace('%', '').trim()));
  expect(await page.evaluate(() => Object.keys(window.__etude.data.sheet))).toEqual([]);
});

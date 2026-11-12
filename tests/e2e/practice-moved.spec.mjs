import { test, expect, todayN } from '../helpers/fixtures.mjs';

// Screens that moved into the Practice setup: the interval song book (Song hints, Intervals), its ear check
// (Intervals · By ear, with a Direction) and Accompany (Progressions · Play along).

const checkedTopic = page => page.evaluate(() => [...document.querySelectorAll('#pr-topics [role=radio][aria-checked=true]')].map(b => b.dataset.v));
// Records each interval the app sounds (the root and the signed size: below 0 it descends).
const recordIntervals = page => page.evaluate(() => {
  window.__played = [];
  window.__etude.playInterval = (root, semi) => window.__played.push([root, semi]);
});
const played = page => page.evaluate(() => window.__played);
// Picks the right by-ear answer for the question on screen.
const answerRight = page => page.evaluate(() => {
  const q = window.__etude.SES.q, it = q.it;
  const k = it.cat === 'interval' ? String(it.semi) : it.cat === 'chord' ? it.short : it.cat === 'scale' ? it.name : it.ref.name;
  const b = [...document.querySelectorAll('#q-answers button')].find(x => x.dataset.k === k);
  b.click();
});

test.describe('Song hints in the Practice setup', () => {
  test('Intervals show the folded panel; opened, it has the 12 cards, and Hear plays in the chosen direction', async ({ app }) => {
    const page = await app.open({ hash: 'practice' });
    const panel = page.locator('#pr-songs');
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveAttribute('open', '');
    await expect(page.locator('#songsList .songcard')).toHaveCount(0);
    await page.locator('#pr-songs summary').click();
    await expect(page.locator('#songsList .songcard')).toHaveCount(12);
    await expect(page.locator('#songsList .songcard').first()).toContainText('Hear');
    await recordIntervals(page);
    await page.locator('#song-root').selectOption('2');
    await page.locator('#songsList .songcard[data-semi="7"] .play').click();
    await page.locator('#song-dir button[data-v="desc"]').click();
    await expect(page.locator('#song-dir button[data-v="desc"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#songsList .songcard[data-semi="7"] .play').click();
    await page.locator('#songsList .songcard[data-semi="7"] .songlist button').first().click();
    expect(await played(page)).toEqual([[62, 7], [69, -7], [69, -7]]);
    // Other topics hide the panel.
    await page.locator('#pr-t-chord').click();
    await expect(panel).toBeHidden();
    await page.locator('#pr-t-interval').click();
    await expect(panel).toBeVisible();
  });

  test('the cards follow the language', async ({ app }) => {
    const page = await app.open({ hash: 'practice' });
    await page.locator('#pr-songs summary').click();
    await page.evaluate(() => window.__etude.setLang('de'));
    await expect(page.locator('#pr-songs summary')).toHaveText('Merkhilfen aus Liedern');
    await expect(page.locator('#songsList .songcard')).toHaveCount(12);
    await expect(page.locator('#songsList .songcard .play').first()).toContainText('Hören');
  });

  for (const hash of ['songs']) {
    test(`an old #${hash} link opens Practice on Intervals with the Song hints open`, async ({ app }) => {
      const page = await app.open({ hash });
      await expect(page.locator('#view-practice')).toHaveClass(/active/);
      await expect(page).toHaveURL(/#practice$/);
      expect(await checkedTopic(page)).toEqual(['interval']);
      await expect(page.locator('#pr-songs')).toHaveAttribute('open', '');
      await expect(page.locator('#songsList .songcard')).toHaveCount(12);
      // A later hash change does the same.
      await page.evaluate(() => { window.__etude.prSetTopic('chord'); window.__etude.show('today'); location.hash = 'songs'; });
      await expect(page.locator('#view-practice')).toHaveClass(/active/);
      expect(await checkedTopic(page)).toEqual(['interval']);
    });
  }

  test('a saved lastTool of the song book: Continue names it and opens it', async ({ app }) => {
    const tn = todayN();
    const data = { todayDay: tn, todayCount: 50, learnDone: { x: tn }, toolDay: { read: tn, piece: tn }, earDay: tn, earToday: 5, lastTool: 'songs' };
    const page = await app.open({ saved: { v: 3, lang: 'en', data } });
    const cont = page.locator('#plan-continue');
    await expect(cont).toHaveText('Continue: Song hints →');
    await cont.click();
    await expect(page.locator('#view-practice')).toHaveClass(/active/);
    expect(await checkedTopic(page)).toEqual(['interval']);
    await expect(page.locator('#pr-songs')).toHaveAttribute('open', '');
  });

  test('Songs is no longer a Learn section', async ({ app }) => {
    const page = await app.open({ hash: 'learn' });
    await expect(page.locator('#modeNav button')).toHaveText(['Learn', 'Method']);
    await expect(page.locator('#view-songs')).toHaveCount(0);
  });
});

test.describe('Intervals by ear: Direction', () => {
  test('the Direction row shows for Intervals by ear only, and goes with the drill', async ({ app }) => {
    const page = await app.open({ hash: 'practice' });
    const row = page.locator('#pr-dir-row');
    await expect(row).toBeHidden(); // Play it
    await page.locator('#pr-mode button[data-v="ear"]').click();
    await expect(row).toBeVisible();
    await expect(page.locator('#pr-dir button')).toHaveText(['Ascending', 'Descending', 'Both']);
    await expect(page.locator('#pr-start')).toHaveText('Start: Intervals · By ear · Ascending · All keys');
    await page.locator('#pr-mode button[data-v="keys"]').click();
    await expect(row).toBeVisible();
    await page.locator('#pr-t-chord').click();
    await expect(row).toBeHidden();
    await page.locator('#pr-t-interval').click();
    await page.locator('#pr-dir button[data-v="both"]').click();
    await expect(page.locator('#pr-start')).toHaveText('Start: Intervals · By ear, on keys · Both · All keys');
    await page.locator('#pr-start').click();
    expect(await page.evaluate(() => window.__etude.SES.targeted)).toEqual({ cat: 'interval', mode: 'ear', key: 'all', dir: 'both' });
  });

  test('a descending Intervals · By ear drill plays its intervals downwards, and Hear again too', async ({ app }) => {
    const page = await app.open({ hash: 'practice' });
    await recordIntervals(page);
    await page.locator('#pr-mode button[data-v="ear"]').click();
    await page.locator('#pr-dir button[data-v="desc"]').click();
    await page.locator('#pr-start').click();
    await expect(page.locator('#q-answers')).toBeVisible();
    await expect.poll(() => played(page)).toHaveLength(1);
    const [root, semi] = (await played(page))[0];
    const q = await page.evaluate(() => { const q = window.__etude.SES.q; return { semi: q.it.semi, dir: q.dir, root: window.__etude.earRoot(q) }; });
    expect(q.dir).toBe('desc');
    expect([root, semi]).toEqual([q.root + q.semi, -q.semi]);
    await page.locator('#q-replay').click();
    expect((await played(page))[1]).toEqual([q.root + q.semi, -q.semi]);
    // Several questions: every one descends.
    for (let n = 3; n <= 6; n++) {
      await answerRight(page);
      await page.locator('#q-next').click();
      await expect.poll(async () => (await played(page)).length).toBe(n);
    }
    expect((await played(page)).every(([, s]) => s < 0)).toBe(true);
  });

  test('Ascending plays upwards, as before, and Both mixes the two', async ({ app }) => {
    const page = await app.open({ hash: 'practice' });
    const dirs = await page.evaluate(() => {
      const api = window.__etude, it = api.ITEMS.find(x => x.id === 'iv:7'), out = {};
      for (const dir of ['asc', 'desc', 'both']) {
        api.SES.targeted = { cat: 'interval', mode: 'ear', key: 'all', dir };
        out[dir] = [...new Set(Array.from({ length: 60 }, () => api.makeQuestion(it).dir))].sort();
      }
      api.SES.targeted = { cat: 'interval', mode: 'play', key: 'all' };
      out.play = [api.makeQuestion(it).dir];
      api.SES.targeted = null;
      return out;
    });
    expect(dirs).toEqual({ asc: ['asc'], desc: ['desc'], both: ['asc', 'desc'], play: [undefined] });
  });

  test('on the keys, a descending interval is played back downwards', async ({ app }) => {
    const page = await app.open({ hash: 'practice', dock: true });
    await page.locator('#pr-mode button[data-v="keys"]').click();
    await page.locator('#pr-dir button[data-v="desc"]').click();
    await page.locator('#pr-start').click();
    await expect(page.locator('#q-ekhint')).not.toHaveText('');
    const target = await page.evaluate(() => { const q = window.__etude.SES.q; q.ek.armAt = 0; return q.ek.target; });
    expect(target[0] - target[1]).toBe(await page.evaluate(() => window.__etude.SES.q.it.semi));
    // Going up is the wrong way.
    await page.evaluate(([a, b]) => { window.__etude.sesInput(a); setTimeout(() => window.__etude.sesInput(a + (a - b)), 150); }, target);
    await expect(page.locator('#q-verdict')).toContainText('That went up — this interval goes down.');
    // Downwards from the start note, in another octave, is right.
    await page.evaluate(([a, b]) => { window.__etude.sesInput(a - 12); setTimeout(() => window.__etude.sesInput(b - 12), 20); }, target);
    await expect(page.locator('#q-next')).toBeVisible();
    expect(await page.evaluate(() => window.__etude.SES.total)).toBe(1);
  });
});

test.describe('Ear check: right answers by ear today', () => {
  test('the Today Ear row starts Intervals · By ear in one tap, counts right answers, and is done at 5', async ({ app }) => {
    const page = await app.open();
    const row = page.locator('[data-plan="ear"]');
    await expect(row).toHaveAttribute('data-done', 'false');
    await row.click();
    await expect(page.locator('#view-practice')).toHaveClass(/active/);
    await expect(page.locator('#session')).toBeVisible();
    expect(await page.evaluate(() => window.__etude.SES.targeted)).toEqual({ cat: 'interval', mode: 'ear', key: 'all', dir: 'asc' });
    for (let i = 0; i < 5; i++) {
      await expect(page.locator('#q-answers')).toBeVisible();
      await answerRight(page);
      await expect(page.locator('#q-next')).toBeVisible();
      expect(await page.evaluate(() => window.__etude.data.earToday)).toBe(i + 1);
      await page.locator('#q-next').click();
    }
    expect(await page.evaluate(() => window.__etude.data.earDay)).toBe(todayN());
    await page.locator('#ses-end').click();
    await page.evaluate(() => window.__etude.show('today'));
    await expect(row).toHaveAttribute('data-done', 'true');
    await expect(row).toContainText('5/5 named by ear today');
  });

  test('a wrong answer, Play it, and a placement do not count; a chord drill by ear and the review session do', async ({ app }) => {
    const page = await app.open({ hash: 'practice' });
    const ear = () => page.evaluate(() => window.__etude.data.earToday || 0);
    // A wrong by-ear answer.
    await page.locator('#pr-mode button[data-v="ear"]').click();
    await page.locator('#pr-start').click();
    await expect(page.locator('#q-answers')).toBeVisible();
    await page.evaluate(() => { const q = window.__etude.SES.q; [...document.querySelectorAll('#q-answers button')].find(b => b.dataset.k !== String(q.it.semi)).click(); });
    expect(await ear()).toBe(0);
    await page.locator('#ses-end').click();
    // Play it.
    await page.evaluate(() => {
      const api = window.__etude, it = api.ITEMS.find(x => x.id === 'iv:7');
      api.startSession({ cat: 'interval', mode: 'play', key: '0' });
      api.resolve(api.SES.q, true);
      api.endSession(false);
      api.SES.placement = true; // a placement question by ear
      api.SES.answered = false;
      api.resolve(api.makeQuestion(it), true);
      api.SES.placement = false;
    });
    expect(await ear()).toBe(0);
    // A chord drill by ear.
    await page.locator('#pr-t-chord').click();
    await page.locator('#pr-mode button[data-v="ear"]').click();
    await page.locator('#pr-start').click();
    await expect(page.locator('#q-answers')).toBeVisible();
    await answerRight(page);
    expect(await ear()).toBe(1);
    await page.locator('#ses-end').click();
    // The review session, with items it asks by ear.
    await page.evaluate(() => {
      const api = window.__etude;
      for (const it of api.ITEMS.filter(x => x.cat === 'interval')) api.data.srs[it.id] = { box: 3, ease: 2.5, due: 0, reps: 3, lapses: 0, last: 0 };
      api.data.settings.earKeys = false;
      api.show('today');
      api.startSession(null);
    });
    await expect(page.locator('#q-answers')).toBeVisible();
    expect(await page.evaluate(() => window.__etude.SES.q.mode)).toBe('ear');
    await answerRight(page);
    expect(await ear()).toBe(2);
  });
});

// Progressions · Play along: the accompaniment loop that replaced the Accompany screen. Nothing is judged.
const loop = page => page.evaluate(() => { const a = window.__etude.accomp; return { on: a.on, prog: a.progIdx, pattern: a.pattern, key: a.key, bpm: a.bpm, hands: a.hands, click: a.click }; });
const litKeys = page => page.evaluate(() => document.querySelectorAll('#keys .key[data-s="lh"], #keys .key[data-s="rh"]').length);
const alongOn = async page => {
  await page.locator('#pr-t-prog').click();
  await page.locator('#pr-mode button[data-v="along"]').click();
};

test.describe('Progressions · Play along', () => {
  test('Play along is offered for Progressions only, with every progression and pattern', async ({ app }) => {
    const page = await app.open({ hash: 'practice' });
    const along = page.locator('#pr-mode button[data-v="along"]');
    for (const cat of ['interval', 'chord', 'scale', 'melody', 'technique']) {
      await page.locator(`#pr-t-${cat}`).click();
      await expect(along, cat).toBeHidden();
    }
    await page.locator('#pr-t-prog').click();
    await expect(along).toBeVisible();
    await expect(page.locator('#pr-along')).toBeHidden();
    await along.click();
    await expect(page.locator('#pr-along')).toBeVisible();
    await expect(page.locator('#ac-prog option')).toHaveCount(15);
    await expect(page.locator('#ac-pat option')).toHaveCount(6);
    const names = await page.evaluate(() => ({ progs: window.__etude.ACCOMP_PROGS.map(p => p.name), pats: Object.keys(window.__etude.ACCOMP_PATTERNS) }));
    await expect(page.locator('#ac-prog option')).toHaveText(names.progs);
    expect(await page.locator('#ac-pat option').evaluateAll(os => os.map(o => o.value))).toEqual(names.pats);
    await expect(page.locator('#ac-hands button')).toHaveText(['Both hands', 'Left only', 'Right only']);
    await expect(page.locator('#ac-bpm')).toHaveAttribute('min', '40');
    await expect(page.locator('#ac-bpm')).toHaveAttribute('max', '180');
    await expect(page.locator('#ac-click')).toBeVisible();
    await expect(page.locator('#pr-start')).toHaveText('Play loop');
    // All keys plays in C, and says so.
    await expect(page.locator('#pr-mode-hint')).toContainText('With All keys, the loop plays in C.');
    await expect(page.locator('#ac-chain .ch').first()).toHaveText('C');
    await page.locator('#pr-keys [data-v="7"]').click();
    await expect(page.locator('#pr-mode-hint')).not.toContainText('All keys');
    await expect(page.locator('#ac-chain .ch').first()).toHaveText('G');
  });

  test('Play loop starts the loop and lights the dock keys; a control change restarts it; Stop stops it', async ({ app }) => {
    const page = await app.open({ hash: 'practice', dock: true });
    await alongOn(page);
    await expect(page.locator('#dock')).toBeVisible();
    expect(await page.evaluate(() => window.__etude.dockWanted())).toBe(true);
    await page.locator('#pr-start').click();
    await expect(page.locator('#pr-start')).toHaveText('Stop');
    expect(await loop(page)).toMatchObject({ on: true, prog: 0, pattern: 'block', key: 0, bpm: 90, hands: 'both', click: false });
    await expect.poll(() => litKeys(page)).toBeGreaterThan(0);
    await expect(page.locator('#pr-along-out')).toBeVisible();
    await expect.poll(() => page.locator('#ac-chain .ch.on').count()).toBe(1);
    // Each control restarts the running loop (a new build) with its new value.
    const restarted = async change => {
      await page.evaluate(() => { window.__built = window.__etude.accomp.built; });
      await change();
      expect(await page.evaluate(() => window.__etude.accomp.on && window.__etude.accomp.built !== window.__built)).toBe(true);
    };
    await restarted(() => page.locator('#ac-prog').selectOption('3'));
    await restarted(() => page.locator('#ac-pat').selectOption({ index: 2 }));
    await restarted(() => page.locator('#ac-hands button[data-v="left"]').click());
    await restarted(async () => { await page.locator('#ac-bpm').fill('120'); await page.locator('#ac-bpm').dispatchEvent('change'); });
    await restarted(() => page.locator('#ac-click').check());
    await restarted(() => page.locator('#pr-keys [data-v="5"]').click());
    const pat2 = await page.locator('#ac-pat option').nth(2).getAttribute('value');
    expect(await loop(page)).toMatchObject({ on: true, prog: 3, pattern: pat2, key: 5, bpm: 120, hands: 'left', click: true });
    await expect(page.locator('#ac-bpmLbl')).toHaveText('120');
    await expect.poll(() => litKeys(page)).toBeGreaterThan(0);
    await page.locator('#pr-start').click();
    expect((await loop(page)).on).toBe(false);
    await expect(page.locator('#pr-start')).toHaveText('Play loop');
    expect(await litKeys(page)).toBe(0);
    // Play along is not a drill: no last-drill record.
    expect(await page.evaluate(() => window.__etude.data.lastDrill)).toBeUndefined();
    await expect(page.locator('#pr-last')).toBeHidden();
  });

  test('leaving the screen, another topic or another mode stops the loop', async ({ app }) => {
    const page = await app.open({ hash: 'practice', dock: true });
    await alongOn(page);
    const play = async () => { await page.locator('#pr-start').click(); expect((await loop(page)).on).toBe(true); };
    await play();
    await page.evaluate(() => window.__etude.show('today'));
    expect((await loop(page)).on).toBe(false);
    await page.evaluate(() => window.__etude.show('practice'));
    // Back on Practice the setup offers the last drill mode again.
    await expect(page.locator('#pr-mode button[data-v="along"]')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#pr-mode button[data-v="along"]').click();
    await play();
    await page.locator('#pr-t-chord').click();
    expect((await loop(page)).on).toBe(false);
    await alongOn(page);
    await play();
    await page.locator('#pr-mode button[data-v="ear"]').click();
    expect((await loop(page)).on).toBe(false);
    await expect(page.locator('#pr-along')).toBeHidden();
    expect(await page.evaluate(() => window.__etude.dockWanted())).toBe(false);
    expect(await page.evaluate(() => window.__etude.data.lastDrill)).toBeUndefined();
  });

  test('an old #accompany link opens Practice on Progressions with Play along chosen', async ({ app }) => {
    const page = await app.open({ hash: 'accompany', dock: true });
    await expect(page.locator('#view-practice')).toHaveClass(/active/);
    await expect(page).toHaveURL(/#practice$/);
    expect(await checkedTopic(page)).toEqual(['prog']);
    await expect(page.locator('#pr-mode button[data-v="along"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#pr-along')).toBeVisible();
    await expect(page.locator('#dock')).toBeVisible();
    await expect(page.locator('#modeNav button')).toHaveText(['Exercises', 'Read', 'Sing', 'Explore', 'Transcribe']);
    await expect(page.locator('#view-accompany')).toHaveCount(0);
    await expect(page.locator('#tools [data-view="accompany"]')).toHaveCount(0);
  });

  test('at 390px the play-along controls fit without sideways scroll, with 44px targets', async ({ app, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app.open({ hash: 'accompany' });
    await expect(page.locator('#pr-along')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    for (const sel of ['#pr-mode button:not([hidden])', '#ac-hands button', '#pr-start']) {
      const sizes = await page.locator(sel).evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return Math.min(r.width, r.height); }));
      for (const s of sizes) expect(s, sel).toBeGreaterThanOrEqual(44);
    }
  });
});

import { test, expect } from '../helpers/fixtures.mjs';
import { STRINGS } from '../../src/locales/index.js';

// The warm-up of the Read tab (docs/plans/2026-11-13-read-redesign-spec.md, section 9): flash cards of one bar, then the
// hand positions, the rhythm and (from level 6) the chords, run as one guided sequence over the existing drills.
const en = STRINGS.en;
const fill = (s, ...args) => args.reduce((out, value, i) => { const mark = ['%a', '%b'][i]; return out.replace(mark && out.includes(mark) ? mark : '%s', String(value)); }, s);
const withBook = (bookState, prefs) => ({ v: 3, lang: 'en', data: { reading: { book: { v: 1, level: 1, focusKey: null, pieces: {}, recent: {}, daily: null, days: [], ...bookState }, ...(prefs ? { prefs } : {}) } } });
const warm = (page) => page.evaluate(() => {
  const w = window.__etude.WARM;
  return { on: w.on, step: w.step, card: w.card, phase: w.phase, clean: w.clean, key: w.key, level: w.level, steps: w.steps.map((s) => (s.kind === 'drill' ? s.id : s.kind)) };
});
const phase = async (page) => (await warm(page)).phase;
const cardNotes = (page) => page.evaluate(() => { const w = window.__etude.WARM; return w.steps[w.step].cards[w.card].notes; });

async function openHome(app, saved) {
  const page = await app.open({ hash: 'read', saved });
  await expect(page.locator('#rdn-home')).toBeVisible();
  return page;
}
// Shorter waits than the real 2 seconds: the app reads them from RDN_WARM_MS each time.
async function start(page, ms = { flash: 400, result: 150 }) {
  await page.evaluate((m) => Object.assign(window.__etude.RDN_WARM_MS, m), ms);
  await page.locator('#rdn-warm-go').click();
  await expect(page.locator('#rdn-warm')).toBeVisible();
}
// Plays note groups through the app's normal input, a chord per group, groups 90 ms apart (more than the 60 ms chord window).
async function play(page, groups) {
  for (const group of groups) {
    await page.evaluate((g) => { const api = window.__etude; g.forEach((m) => api.handleNoteOn(m, 90, 'test')); g.forEach((m) => api.handleNoteOff(m, 'test')); }, group);
    await page.waitForTimeout(90);
  }
}
// Waits for the hidden phase of the current card, then plays it right (or a wrong first note).
async function answerCard(page, right = true) {
  await expect.poll(() => phase(page)).toBe('play');
  const notes = await cardNotes(page);
  await play(page, right ? notes : [[notes[0][0] + 1], ...notes.slice(1)]);
  await expect.poll(() => phase(page)).toMatch(/^(result|show|drill)$/);
}
async function passFlash(page) {
  for (let i = 0; i < 6; i++) {
    await expect.poll(async () => (await warm(page)).card).toBe(i);
    await answerCard(page);
  }
  await expect.poll(() => phase(page)).toBe('drill');
}
// Answers the play questions of a drill step until the warm-up moves on.
async function answerDrill(page) {
  const step = (await warm(page)).step;
  for (let i = 0; i < 12 && (await warm(page)).step === step; i++) {
    await expect.poll(() => page.evaluate(() => { const RD = window.__etude.RD; return !!(RD.on && RD.q && !RD.answered) || window.__etude.WARM.step; })).toBeTruthy();
    if ((await warm(page)).step !== step) break;
    await page.evaluate(() => { const api = window.__etude; const m = api.RD.q.midi; api.handleNoteOn(m, 90, 'test'); api.handleNoteOff(m, 'test'); });
    await page.waitForTimeout(700);
  }
}

test.describe('Read warm-up', () => {
  test('the card names the level, starts the warm-up and shows the steps', async ({ app }) => {
    const page = await openHome(app, withBook({ level: 3 }));
    await expect(page.locator('#rdn-warm-h')).toHaveText(en.rdn_warm_title);
    await expect(page.locator('#rdn-warm-text')).toHaveText(fill(en.rdn_warm_text, 3));
    await expect(page.locator('#rdn-warm-done')).toHaveCount(0);
    await start(page);
    const w = await warm(page);
    expect(w).toMatchObject({ on: true, level: 3, step: 0, steps: ['flash', 'position', 'position', 'rh2'] });
    // Without a pinned key the warm-up takes the key of today's level piece.
    const level = await page.evaluate(() => window.__etude.rdnBook().daily.slots.find((s) => s.role === 'level').key);
    expect(w.key).toBe(level);
    await expect(page.locator('#rdn-w-step')).toContainText(fill(en.rdn_w_step, 1, 4));
    await expect(page.locator('#rdn-w-step')).toContainText(en.rdn_w_flash);
    await expect(page.locator('#rdn-w-title')).toHaveText(en.rdn_warm_eyebrow);
    await expect(page.locator('#rdn-home')).toBeHidden();
    await expect(page.locator('#rd-tabs')).toBeHidden();
    await expect(page.locator('#rdn-lede')).toHaveText(en.rdn_lede);
    await expect(page.locator('#rdn-w-back')).toBeFocused();
  });

  test('a flash card shows its notes, hides them after the flash time, and a right answer advances', async ({ app }) => {
    const page = await openHome(app);
    await start(page, { flash: 1500, result: 600 });
    const staff = page.locator('#rdn-f-staff');
    await expect(page.locator('#rdn-f-prompt')).toHaveText(en.rdn_f_look);
    await expect(page.locator('#rdn-f-count')).toHaveText(fill(en.rdn_f_card, 1, 6));
    await expect(staff.locator('.ss-n').first()).toBeVisible();
    expect(await staff.locator('.ss-n').count()).toBe((await cardNotes(page)).length);
    await expect(page.locator('#rdn-f-bar')).toBeVisible();
    await expect(page.locator('#rdn-f-again')).toBeHidden();
    // Notes played while the card shows do not count.
    await play(page, await cardNotes(page));
    expect(await phase(page)).toBe('show');
    await expect(page.locator('#rdn-f-prompt')).toHaveText(en.rdn_f_play, { timeout: 3000 });
    await expect(staff).toHaveAttribute('data-hidden', '');
    await expect(staff.locator('.ss-n').first()).toBeHidden();
    await expect(page.locator('#rdn-f-again')).toBeVisible();
    await play(page, await cardNotes(page));
    await expect(page.locator('#rdn-f-prompt')).toContainText(en.rdn_f_right);
    await expect(staff).toHaveAttribute('data-mark', 'good');
    await expect(staff.locator('.ss-n').first()).toBeVisible();
    await expect(page.locator('#rdn-f-next')).toBeVisible();
    await expect.poll(() => warm(page)).toMatchObject({ card: 1, clean: 1, phase: 'show' });
    await expect(page.locator('#rdn-f-count')).toHaveText(fill(en.rdn_f_card, 2, 6));
  });

  test('wrong notes are marked, Next skips the wait, and Show again keeps a card from counting as clean', async ({ app }) => {
    const page = await openHome(app);
    await start(page, { flash: 300, result: 5000 });
    await answerCard(page, false);
    await expect(page.locator('#rdn-f-prompt')).toContainText(en.rdn_f_wrong);
    await expect(page.locator('#rdn-f-staff')).toHaveAttribute('data-mark', 'bad');
    await page.locator('#rdn-f-next').click();
    await expect.poll(() => warm(page)).toMatchObject({ card: 1, clean: 0 });
    // Show again: the bar comes back for another flash, then the card is right but not clean.
    await expect.poll(() => phase(page)).toBe('play');
    await page.locator('#rdn-f-again').click();
    expect(await phase(page)).toBe('show');
    await expect(page.locator('#rdn-f-staff .ss-n').first()).toBeVisible();
    await expect(page.locator('#rdn-f-prompt')).toHaveText(en.rdn_f_look);
    await answerCard(page);
    await expect(page.locator('#rdn-f-prompt')).toContainText(en.rdn_f_right);
    expect((await warm(page)).clean).toBe(0);
  });

  test('after six cards the tally shows and the first position step plays notes in the treble clef, limited to its count', async ({ app }) => {
    const page = await openHome(app);
    await start(page);
    await passFlash(page);
    await expect(page.locator('#rdn-w-tally')).toHaveText(fill(en.rdn_w_tally, 6, 6));
    await expect(page.locator('#rdn-w-step')).toContainText(fill(en.rdn_w_step, 2, 4));
    await expect(page.locator('#rdn-w-step')).toContainText(en.rdn_w_pos_rh);
    await expect(page.locator('#rdn-w-flash')).toBeHidden();
    await expect(page.locator('#rdx-stage')).toBeVisible();
    await expect(page.locator('#rdx-back')).toBeHidden();
    const level = await page.evaluate(() => { const { RD, WARM } = window.__etude; return { ty: RD.L.ty, clef: RD.L.clef, keyN: RD.L.keyN, want: WARM.steps[1].keyN, on: RD.on, mode: RD.mode, q: RD.q.ty }; });
    expect(level).toMatchObject({ ty: 'play', clef: 'treble', on: true, mode: 'practice', q: 'play' });
    expect(level.keyN).toBe(level.want);
    await answerDrill(page);
    // Five answers end the step: the left-hand position follows in the bass clef.
    expect(await warm(page)).toMatchObject({ step: 2, phase: 'drill' });
    expect(await page.evaluate(() => [window.__etude.RD.L.clef, window.__etude.RD.n])).toEqual(['bass', 0]);
    await expect(page.locator('#rdn-w-step')).toContainText(en.rdn_w_pos_lh);
  });

  test('finishing every step returns home with the done mark, which survives a reload and is gone on another day', async ({ app, page }) => {
    await openHome(app);
    await start(page);
    await passFlash(page);
    await answerDrill(page);
    // End after one answer finishes the step through the drill's normal end of run.
    await page.evaluate(() => { const api = window.__etude; const m = api.RD.q.midi; api.handleNoteOn(m, 90, 'test'); api.handleNoteOff(m, 'test'); });
    await expect.poll(() => page.evaluate(() => window.__etude.RD.n)).toBe(1);
    await page.locator('#rdx-end').click();
    await expect.poll(() => warm(page)).toMatchObject({ step: 3, steps: ['flash', 'position', 'position', 'rh1'] });
    expect(await page.evaluate(() => window.__etude.RD.L.id)).toBe('rh1');
    // The rhythm step: End before any tap skips it, and the warm-up ends.
    await page.locator('#rdx-end').click();
    await expect(page.locator('#rdn-home')).toBeVisible();
    await expect(page.locator('#rdn-warm')).toBeHidden();
    await expect(page.locator('#rdn-warm-done')).toContainText(en.rdn_warm_done);
    await expect(page.locator('#rdn-warm-go')).toBeFocused();
    expect(await warm(page)).toMatchObject({ on: false, phase: 'idle' });
    const today = await page.evaluate(() => window.__etude.rdnToday());
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).data.reading.prefs.warmDone)).toBe(today);
    // The drill results counted as usual.
    expect(await page.evaluate(() => window.__etude.rdData().tot.n)).toBeGreaterThanOrEqual(6);
    await page.reload();
    await expect(page.locator('#rdn-warm-done')).toBeVisible();
  });

  test('a done mark from another day does not show', async ({ app }) => {
    const page = await openHome(app, withBook({}, { warmDone: '2000-01-01' }));
    await expect(page.locator('.rdn-warm')).toBeVisible();
    await expect(page.locator('#rdn-warm-done')).toHaveCount(0);
  });

  test('Back in the middle returns home, leaves nothing running, and the old drills still work', async ({ app }) => {
    const page = await openHome(app);
    await start(page);
    await passFlash(page);
    expect(await page.evaluate(() => window.__etude.RD.on)).toBe(true);
    await page.locator('#rdn-w-back').click();
    await expect(page.locator('#rdn-home')).toBeVisible();
    // Focus goes back to the button that started the warm-up.
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('rdn-warm-go');
    expect(await warm(page)).toMatchObject({ on: false, phase: 'idle' });
    expect(await page.evaluate(() => ({ on: window.__etude.RD.on, timer: window.__etude.WARM.timer }))).toEqual({ on: false, timer: 0 });
    await expect(page.locator('#rdn-warm-done')).toHaveCount(0);
    await page.locator('#rdt-drills').click();
    await expect(page.locator('#rdx-ladder')).toBeVisible();
    await expect(page.locator('#rdx-stage')).toBeHidden();
    await page.locator('.rdx-lv[data-lv="tr1"]').click();
    await expect(page.locator('#rdx-stage')).toBeVisible();
    await expect(page.locator('#rdx-back')).toBeVisible();
    await page.locator('.rdx-mode[data-mode="practice"]').click();
    expect(await page.evaluate(() => [window.__etude.RD.on, window.__etude.RD.L.id])).toEqual([true, 'tr1']);
    // Outside a warm-up, End after an answer shows the drill's own summary.
    await page.locator('#rdx-ans .rdx-a').first().click();
    await page.locator('#rdx-end').click();
    await expect(page.locator('#rdx-sum')).toBeVisible();
  });

  test('Esc on the full-screen stage skips a drill step and gives the focus to the warm-up Back', async ({ app }) => {
    const page = await openHome(app);
    await start(page);
    await passFlash(page);
    await expect.poll(() => page.evaluate(() => document.body.dataset.stage)).toBe('immersive');
    await expect(page.locator('#rdn-w-back')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect.poll(() => warm(page)).toMatchObject({ step: 2, phase: 'drill' });
    await expect(page.locator('#rdn-w-back')).toBeFocused();
  });

  test('leaving the Read tab during a flash card abandons the warm-up; the home comes back', async ({ app }) => {
    const page = await openHome(app);
    await start(page);
    await page.evaluate(() => window.__etude.show('practice'));
    expect(await warm(page)).toMatchObject({ on: false, phase: 'idle' });
    await page.waitForTimeout(500);
    expect(await phase(page)).toBe('idle');
    await page.evaluate(() => window.__etude.show('read'));
    await expect(page.locator('#rdn-home')).toBeVisible();
    await expect(page.locator('#rdn-warm')).toBeHidden();
  });

  test('level 6 has five steps with chords last, and a pinned key is used', async ({ app }) => {
    const page = await openHome(app, withBook({ level: 6, focusKey: 'G' }));
    await expect(page.locator('#rdn-warm-text')).toHaveText(fill(en.rdn_warm_text_ch, 6));
    await start(page);
    expect(await warm(page)).toMatchObject({ level: 6, key: 'G', steps: ['flash', 'position', 'position', 'rh5', 'ch1'] });
    await expect(page.locator('#rdn-w-step')).toContainText(fill(en.rdn_w_step, 1, 5));
    // The cards are the same all day: the plan's name is the date, the level and the key.
    const cards = await page.evaluate(() => JSON.stringify(window.__etude.WARM.steps[0].cards));
    await page.locator('#rdn-w-back').click();
    await start(page);
    expect(await page.evaluate(() => JSON.stringify(window.__etude.WARM.steps[0].cards))).toBe(cards);
  });

  for (const [width, height] of [[390, 844], [820, 1180], [1180, 820], [1440, 900]]) {
    test(`fits ${width}px: no sideways scroll and 44px controls on a flash card and a drill step`, async ({ app, page }) => {
      await page.setViewportSize({ width, height });
      await openHome(app, withBook({ level: 8 }));
      await start(page, { flash: 200, result: 100 });
      const check = () => page.evaluate(() => {
        const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        const controls = [...document.querySelectorAll('#rdn-warm button, #rdx-stage button')].filter(visible);
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          small: controls.filter((el) => el.getBoundingClientRect().height < 44).map((el) => el.id || el.textContent),
        };
      });
      await expect.poll(() => phase(page)).toBe('play');
      expect(await check()).toEqual({ overflow: 0, small: [] });
      await passFlash(page);
      expect(await check()).toEqual({ overflow: 0, small: [] });
    });
  }

  test('works in the dark theme and in Romanian', async ({ app }) => {
    const page = await openHome(app);
    await page.evaluate(() => { window.__etude.theme = 'dark'; window.__etude.applyTheme(); });
    await start(page, { flash: 5000, result: 100 });
    const colours = await page.locator('#rdn-w-flash').evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, ink: getComputedStyle(el.querySelector('#rdn-f-prompt')).color }));
    expect(colours.bg).toBe('rgb(33, 29, 25)');
    expect(colours.ink).toBe('rgb(236, 229, 216)');
    await page.evaluate(() => window.__etude.setLang('ro'));
    await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
    const ro = STRINGS.ro;
    await expect(page.locator('#rdn-w-step')).toContainText(ro.rdn_w_flash);
    await expect(page.locator('#rdn-f-prompt')).toHaveText(ro.rdn_f_look);
    await expect(page.locator('#rdn-f-count')).toHaveText(fill(ro.rdn_f_card, 1, 6));
    await expect(page.locator('#rdn-w-back')).toHaveText(ro.rdn_back);
    await expect(page.locator('#rdn-lede')).toHaveText(ro.rdn_lede);
    await page.locator('#rdn-w-back').click();
    await expect(page.locator('#rdn-warm-h')).toHaveText(ro.rdn_warm_title);
    // The warm-up is a step of today's plan now: the step carries its title and its text.
    await expect(page.locator('#rdn-warm-go')).toContainText(ro.rdn_warm_title);
  });
});

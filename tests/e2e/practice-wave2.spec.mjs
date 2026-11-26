import { test, expect } from '../helpers/fixtures.mjs';

test.describe('Practice Wave 2 redesign', () => {
  test('dynamic Chords card example tracks active notation (letter vs solfege)', async ({ app }) => {
    const page = await app.open({ hash: 'practice' });
    await expect(page.locator('#pr-t-chord-d')).toContainText('e.g. Cm, G7.');
    await page.locator('#settingsBtn').click();
    await page.locator('#set-notation [data-v="solfege"]').click();
    await page.locator('#set-lang [data-v="ro"]').click();
    await expect(page.locator('#pr-t-chord-d')).toContainText('Ex: Do minor, Sol7.');
    await page.keyboard.press('Escape');
  });

  test('Chords default to triads, expand to 7ths/jazz, and sync inversions with Settings', async ({ app }) => {
    const page = await app.open({ hash: 'practice' });
    await page.locator('#pr-t-chord').click();
    await expect(page.locator('#pr-chord-tier button[data-v="triads"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#pr-chord-more summary').click();
    await page.locator('#pr-chord-inv').check();
    expect(await page.evaluate(() => window.__etude.data.settings.allowInv)).toBe(true);
    await page.locator('#pr-start').click();
    await expect.poll(() => page.evaluate(() => {
      const sym = window.__etude.SES.q?.it?.short;
      return ['maj', 'm', 'dim', 'aug'].includes(sym);
    })).toBe(true);
  });

  test('Intervals Melodic/Harmonic selector hides Direction when Harmonic', async ({ app }) => {
    const page = await app.open({ hash: 'practice' });
    await page.locator('#pr-t-interval').click();
    await page.locator('#pr-mode button[data-v="ear"]').click();
    await expect(page.locator('#pr-dir-wrap')).toBeVisible();
    await page.locator('#pr-iv-style button[data-v="harmonic"]').click();
    await expect(page.locator('#pr-dir-wrap')).toBeHidden();
    await page.locator('#pr-iv-style button[data-v="melodic"]').click();
    await expect(page.locator('#pr-dir-wrap')).toBeVisible();
  });

  test('Unified Scales & Arpeggios card separates core scale drills from technique', async ({ app }) => {
    const page = await app.open({ hash: 'practice' });
    await page.locator('#pr-t-scale').click();
    await page.locator('#pr-mode button[data-v="ear"]').click();
    await expect(page.locator('#pr-scale-tier button[data-v="core"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#pr-start').click();
    await expect.poll(() => page.evaluate(() => {
      const nm = window.__etude.SES.q?.it?.name;
      return ['Major (Ionian)', 'Aeolian (Natural minor)', 'Harmonic minor', 'Melodic minor'].includes(nm);
    })).toBe(true);
    await page.locator('#ses-end').click();
    await page.locator('#pr-mode button[data-v="tech"]').click();
    await expect(page.locator('#pr-scale-cfg')).toBeHidden();
  });

  test('Progressions Play along separates starter controls from optional impro scale overlay', async ({ app }) => {
    const page = await app.open({ hash: 'practice', dock: true });
    await page.locator('#pr-t-prog').click();
    await page.locator('#pr-prog-split [data-v="along"]').click();
    await expect(page.locator('#ac-prog optgroup')).toHaveCount(4);
    await expect(page.locator('#ac-impro-legend')).toBeHidden();
    await page.locator('#ac-more summary').click();
    await page.locator('#ac-impro-scale').selectOption('Major pentatonic');
    await expect(page.locator('#ac-impro-legend')).toBeVisible();
    await expect.poll(() => page.locator('#keys .key[data-impro="1"]').count()).toBeGreaterThan(0);
    await page.locator('#ac-impro-scale').selectOption('off');
    await expect(page.locator('#ac-impro-legend')).toBeHidden();
    await expect(page.locator('#keys .key[data-impro="1"]')).toHaveCount(0);
  });

  test('Melodies by ear preserves confirmed prefix on wrong note while flagging missed accuracy honestly', async ({ app }) => {
    const page = await app.open({ hash: 'practice', dock: true });
    await page.clock.install();
    await page.locator('#pr-t-melody').click();
    await page.locator('#pr-mel-diff button[data-v="easy"]').click();
    await page.locator('#pr-mel-more summary').click();
    await page.locator('#pr-mel-len').selectOption('4');
    await page.locator('#pr-start').click();
    await expect(page.locator('#q-prompt')).toBeVisible();
    const target = await page.evaluate(() => window.__etude.SES.q.ek.target);
    expect(target).toHaveLength(4);
    await page.clock.runFor(4000);
    await page.evaluate((ms) => {
      window.__etude.handleNoteOn(ms[0], 90, 'test'); window.__etude.handleNoteOff(ms[0], 'test');
      window.__etude.handleNoteOn(ms[1], 90, 'test'); window.__etude.handleNoteOff(ms[1], 'test');
    }, target);
    expect(await page.evaluate(() => window.__etude.SES.q.ek.seq.length)).toBe(2);
    // Deliberate wrong 3rd note: prefix of 2 notes stays intact, missed becomes true.
    const wrong = target[2] + 1;
    await page.evaluate((m) => {
      window.__etude.handleNoteOn(m, 90, 'test'); window.__etude.handleNoteOff(m, 'test');
    }, wrong);
    expect(await page.evaluate(() => ({ len: window.__etude.SES.q.ek.seq.length, missed: window.__etude.SES.q.missed }))).toEqual({ len: 2, missed: true });
    await expect(page.locator('#q-verdict')).toContainText('confirmed notes stay lit');
    await page.clock.runFor(500);
    // Finish remaining notes from confirmed prefix: verdict shows honest retry message, first-try correct stays 0.
    await page.evaluate((ms) => {
      window.__etude.handleNoteOn(ms[2], 90, 'test'); window.__etude.handleNoteOff(ms[2], 'test');
      window.__etude.handleNoteOn(ms[3], 90, 'test'); window.__etude.handleNoteOff(ms[3], 'test');
    }, target);
    await expect(page.locator('#q-verdict')).toContainText('Reproduced in 2 tries (not counted as first-try).');
    expect(await page.evaluate(() => ({ correct: window.__etude.SES.correct, total: window.__etude.SES.total }))).toEqual({ correct: 0, total: 1 });
  });
});

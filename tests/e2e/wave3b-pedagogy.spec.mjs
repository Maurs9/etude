import { readFileSync } from 'node:fs';
import { test, expect, todayN } from '../helpers/fixtures.mjs';

test.describe('Wave 3B: quiz why pedagogy, Read key warm-up, Studio & ABRSM milestones', () => {
  test('Learn quiz shows pedagogical why explanations for multiple-choice and keyboard questions across EN and RO', async ({ app, page }) => {
    await app.open({ hash: 'learn', dock: true });

    await page.locator('[data-lq=start]').click();
    await expect(page.locator('#lq-q')).toBeVisible();

    // Q1 (multiple-choice): answer and check pedagogical `why` explanation appears.
    await page.locator('.lq-o').first().click();
    await expect(page.locator('.lq-fb')).toBeVisible();
    const mcWhyEn = (await page.locator('.lq-fb').textContent()) ?? '';
    expect(mcWhyEn).toMatch(/octave|black keys/i);

    // Switch to Romanian and verify `.lq-fb` translates in place with Romanian `why`.
    await page.locator('#settingsBtn').click();
    await page.locator('#set-lang [data-v=ro]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
    await page.keyboard.press('Escape');
    const mcWhyRo = (await page.locator('.lq-fb').textContent()) ?? '';
    expect(mcWhyRo).not.toBe(mcWhyEn);
    expect(mcWhyRo).toMatch(/octav|clape/i);

    // Switch back to English and advance to Q4 (Middle C piano-key question, `!q.opts`).
    await page.locator('#settingsBtn').click();
    await page.locator('#set-lang [data-v=en]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.keyboard.press('Escape');

    for (let step = 0; step < 3; step += 1) {
      await page.locator('[data-lq=next]').click();
      if ((await page.locator('.lq-o').count()) > 0) {
        await page.locator('.lq-o').first().click();
      }
    }

    // Q4 is keyboard-input (no `.lq-o` buttons, `[data-lq=show]` visible).
    await expect(page.locator('.lq-o')).toHaveCount(0);
    await expect(page.locator('[data-lq=show]')).toBeVisible();

    await page.evaluate(() => {
      window.__etude.handleNoteOn(60, 90, 'test');
      window.__etude.handleNoteOff(60, 'test');
    });

    await expect(page.locator('.lq-fb')).toBeVisible();
    await expect(page.locator('.lq-fb')).toContainText('MIDI 60');
    const kbWhyEn = (await page.locator('.lq-fb').textContent()) ?? '';
    expect(kbWhyEn).toContain('center');

    // Keyboard question feedback also updates `why` when switching to Romanian.
    await page.locator('#settingsBtn').click();
    await page.locator('#set-lang [data-v=ro]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
    await page.keyboard.press('Escape');
    await expect(page.locator('.lq-fb')).toContainText('MIDI 60');
    await expect(page.locator('.lq-fb')).not.toHaveText(kbWhyEn);
  });

  test('Read contextual key warm-up reveals Tonic & Scale buttons and launches matching Practice scale drill', async ({ app, page }) => {
    await app.open({ hash: 'read', dock: true });

    // On Read home (before opening a piece), warm-up controls stay hidden.
    await expect(page.locator('#rd-warm-tonic')).toBeHidden();
    await expect(page.locator('#rd-warm-scale')).toBeHidden();

    // Open Level 1 piece #1 in the reader.
    await page.locator('#rdn-book-go').click();
    await expect(page.locator('#rd-staff svg')).toBeVisible();
    await expect(page.locator('#rd-warm-tonic')).toBeVisible();
    await expect(page.locator('#rd-warm-scale')).toBeVisible();
    await expect(page.locator('#rd-warm-tonic')).toBeEnabled();
    await expect(page.locator('#rd-warm-scale')).toBeEnabled();

    // Playing tonic figure leaves Read active without errors.
    await page.locator('#rd-warm-tonic').click();
    await expect(page.locator('#view-read')).toHaveClass(/active/);

    // Playback disables warm-up actions; stopping re-enables them.
    await page.locator('#rd-listen').click();
    await expect(page.locator('#rd-warm-tonic')).toBeDisabled();
    await expect(page.locator('#rd-warm-scale')).toBeDisabled();
    await page.locator('#rd-listen').click();
    await expect(page.locator('#rd-warm-tonic')).toBeEnabled();
    await expect(page.locator('#rd-warm-scale')).toBeEnabled();

    // Clicking Scale in key -> jumps straight into a 1-octave Technique drill in the piece's key.
    await page.locator('#rd-warm-scale').click();
    await expect(page.locator('#view-practice')).toHaveClass(/active/);
    await expect(page.locator('#tq-drill')).toBeVisible();
    await expect(page.locator('#pr-cat')).toHaveValue('scale');
    await expect(page.locator('#pr-mode button[data-v="tech"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#tq-drill [data-tq="octaves"] button[data-v="1"]')).toHaveAttribute('aria-pressed', 'true');

    // Return to Read, open the reader stage, and load an A-minor fixture (keyN: 0, minor: true); Scale in key -> opens A natural minor.
    await page.evaluate(() => {
      window.__etude.show('read');
    });
    await page.locator('#rdn-book-go').click();
    await expect(page.locator('#rd-staff svg')).toBeVisible();
    await page.evaluate(() => {
      const api = window.__etude;
      const base = api.PIECES.find((p) => p.id === 'mary');
      api.SR.gen = null;
      api.SR.lvPiece = null;
      api.srShowPiece({ ...base, id: 'w3b-amin', keyN: 0, minor: true, ephemeral: true });
    });
    await expect(page.locator('#rd-warm-scale')).toBeVisible();
    await page.locator('#rd-warm-scale').click();
    await expect(page.locator('#view-practice')).toHaveClass(/active/);
    await expect(page.locator('#tq-drill')).toBeVisible();
    await expect(page.locator('#pr-key')).toHaveValue('9');
    await expect(page.locator('#tq-drill [data-tq="kind"] button[data-v="naturalMinor"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#tq-drill [data-tq="octaves"] button[data-v="1"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#q-prompt')).toContainText('A natural minor');
  });

  test('Progress renders Studio & ABRSM Grade 1-5 milestones, updates standing, and exports Standing in CSV', async ({ app, page }) => {
    await app.open();
    const tn = todayN();

    // Fresh profile shows all 6 milestone cards, Beginning standing, and Prep highlighted as `.next`.
    await page.evaluate(async () => {
      await window.__etude.show('progress');
    });
    await expect(page.locator('#progMilestones .prog-ms')).toHaveCount(6);
    await expect(page.locator('#prog-ms-standing')).toContainText('Beginning');
    await expect(page.locator('#progMilestones .prog-ms[data-ms="prep"]')).toHaveClass(/\bnext\b/);
    await expect(page.locator('#progMilestones .prog-ms[data-ms="prep"]')).not.toHaveClass(/\bdone\b/);

    // Seed Grade 2 criteria: 19 mastered, reading Lv 2 with 10 pieces read, 2 learned repertoire pieces, 8 lessons.
    await page.evaluate(async (today) => {
      const api = window.__etude;
      api.data.totalReviews = 48;
      api.data.totalCorrect = 44;
      const ivSemis = [7, 5, 4, 3, 12, 2, 9, 8, 11, 10, 1, 6];
      const chSyms = ['maj', 'm', 'dim', 'sus4', 'sus2', 'aug', 'maj7'];
      for (const s of ivSemis) api.data.srs['iv:' + s] = { box: 5, reps: 6, lapses: 0, due: today + 7 };
      for (const c of chSyms) api.data.srs['ch:' + c] = { box: 4, reps: 5, lapses: 0, due: today + 5 };
      api.data.history[today] = 8;
      api.data.sheet.mary = { best: 95, learned: true };
      api.data.sheet.twinkle = { best: 92, learned: true };
      const lessonIds = ['keys', 'how', 'notation', 'symbols', 'dyn', 'rh', 'rh2', 'iv'];
      api.data.learnDone = Object.fromEntries(lessonIds.map((id) => [id, today]));
      api.data.reading = {
        ...(api.data.reading || {}),
        tot: { n: 20, ok: 18 },
        lv: {},
        book: {
          v: 2,
          level: 2,
          focusKey: null,
          pieces: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [
            `lv1-${String(i + 1).padStart(2, '0')}`,
            { best: 90, stars: 3, tries: 1, first: 90 },
          ])),
          recent: {},
          daily: null,
          days: [],
        },
      };
      api.saveAll();
      await api.show('progress');
    }, tn);

    await expect(page.locator('#prog-ms-standing')).toContainText('Grade 2');
    await expect(page.locator('#prog-print-head')).toContainText('Grade 2');
    for (const id of ['prep', 'g1', 'g2']) {
      await expect(page.locator(`#progMilestones .prog-ms[data-ms="${id}"]`)).toHaveClass(/\bdone\b/);
    }
    await expect(page.locator('#progMilestones .prog-ms[data-ms="g3"]')).toHaveClass(/\bnext\b/);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#prog-report-csv').click(),
    ]);
    const csv = readFileSync(await download.path(), 'utf8');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Studio & ABRSM milestones,Grade 2');
  });
});

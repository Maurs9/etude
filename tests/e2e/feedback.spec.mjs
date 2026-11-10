import { test, expect } from '../helpers/fixtures.mjs';

// Opens a targeted Practice session and puts one chosen question on screen.
async function ask(page, { cat, mode, id }) {
  await page.evaluate(({ cat: c, mode: m, id: itemId }) => {
    const api = window.__etude;
    if (!api.SES.active) {
      api.show('practice');
      api.startSession({ cat: c, mode: m, key: '0' });
    }
    const q = api.makeQuestion(api.ITEM_BY_ID[itemId]);
    q.key = 0;
    api.SES.q = q;
    api.SES.answered = false;
    api.presentQuestion(q);
  }, { cat, mode, id });
}

async function answerAndNext(page, k) {
  await page.locator(`#q-answers [data-k="${k}"]`).click();
  await page.locator('#q-next').click();
}

test.describe('Error-aware feedback', () => {
  test('names the picked and the right interval, plays both, and offers a contrast drill when a pair repeats', async ({ app }) => {
    const page = await app.open({ hash: 'practice', dock: true });
    await page.evaluate(() => {
      const api = window.__etude;
      api.data.settings.earKeys = false;
      window.__played = [];
      const original = api.previewNote;
      api.previewNote = (midi, when, duration, velocity, options) => { window.__played.push(midi); return original(midi, when, duration, velocity, options); };
    });
    await ask(page, { cat: 'interval', mode: 'ear', id: 'iv:4' });
    await page.locator('#q-answers [data-k="3"]').click();
    await expect(page.locator('#q-verdict')).toHaveText(/^You picked .+\. The answer was .+\.$/);
    await expect(page.locator('#q-both')).toBeVisible();
    await page.evaluate(() => { window.__played = []; });
    await page.locator('#q-both').click();
    // The picked minor 3rd sounds before the major 3rd, both from the question's start note.
    await expect.poll(() => page.evaluate(() => window.__played.length)).toBe(8);
    const played = await page.evaluate(() => window.__played);
    const root = played[0];
    expect(played).toEqual([root, root + 3, root, root + 3, root, root + 4, root, root + 4]);
    await page.locator('#q-next').click();
    await expect(page.locator('#q-both')).toBeHidden();
    await ask(page, { cat: 'interval', mode: 'ear', id: 'iv:3' });
    await answerAndNext(page, 4);
    const before = await page.evaluate(() => ({ srs: JSON.stringify(window.__etude.data.srs), streak: window.__etude.data.streak, today: window.__etude.data.todayCount }));
    await page.locator('#ses-end').click();
    const offer = page.locator('#ses-contrast');
    await expect(offer).toBeVisible();
    await expect(offer).toContainText('2 times');
    const saved = await page.evaluate(() => localStorage.getItem('ptt-v3'));
    await page.locator('#cf-start').click();
    await expect(page.locator('#session')).toBeVisible();
    for (let index = 0; index < 6; index += 1) {
      await expect(page.locator('#q-answers button')).toHaveCount(2);
      await expect(page.locator('#ses-count')).toHaveText(`${index + 1}/6`);
      const semi = await page.evaluate(() => window.__etude.SES.q.it.semi);
      expect([3, 4]).toContain(semi);
      await answerAndNext(page, semi);
    }
    await expect(page.locator('#session')).toBeHidden();
    await expect(offer).toContainText('Contrast drill: 6 of 6 right.');
    // The drill saved nothing: no new record, and reviews, goal and streak stay as they were.
    // (A save may still run and renew the sync ids; the saved data must be the same.)
    const record = (text) => { const value = JSON.parse(text); delete value.syncId; delete value.syncParent; return value; };
    expect(record(await page.evaluate(() => localStorage.getItem('ptt-v3')))).toEqual(record(saved));
    expect(await page.evaluate(() => ({ srs: JSON.stringify(window.__etude.data.srs), streak: window.__etude.data.streak, today: window.__etude.data.todayCount }))).toEqual(before);
  });

  test('says which interval and which chord were played on the keys', async ({ app }) => {
    const page = await app.open({ hash: 'practice', dock: true });
    await ask(page, { cat: 'interval', mode: 'play', id: 'iv:4' });
    await page.evaluate(() => { window.__etude.handleNoteOn(60, 90, 'test'); window.__etude.handleNoteOn(63, 90, 'test'); });
    await expect(page.locator('#q-verdict')).toHaveText(/^You played .+\. The answer was .+\.$/);
    await expect(page.locator('#q-both')).toBeVisible();
    await page.evaluate(() => { window.__etude.handleNoteOff(60, 'test'); window.__etude.handleNoteOff(63, 'test'); });
    await page.locator('#q-next').click();
    await ask(page, { cat: 'chord', mode: 'play', id: 'ch:maj' });
    await page.evaluate(() => [60, 63, 67].forEach((midi) => window.__etude.handleNoteOn(midi, 90, 'test')));
    await expect(page.locator('#q-verdict')).toHaveText(/^You played Cm · .+\. The answer was C · .+\.$/);
  });

  test('keeps the plain lapse line when the answer is only revealed', async ({ app }) => {
    const page = await app.open({ hash: 'practice', dock: true });
    await ask(page, { cat: 'interval', mode: 'play', id: 'iv:7' });
    await page.locator('#q-reveal').click();
    await expect(page.locator('#q-verdict')).toHaveText('Not quite.');
    await expect(page.locator('#q-both')).toBeHidden();
  });
});

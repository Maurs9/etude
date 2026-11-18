import { test, expect } from '../helpers/fixtures.mjs';

test('Today respects both the new-item quota and the session limit', async ({ app, page }) => {
  await app.open();
  await expect(page.locator('#c-new')).toHaveText('5');
  await page.locator('#startBtn').click();
  await expect(page.locator('#ses-count')).toHaveText('1/5');
  await page.locator('#ses-end').click();
  await page.evaluate(() => {
    const api = window.__etude;
    api.data.settings.goal = 8;
    for (const { id } of api.ITEMS.slice(0, 20)) {
      api.data.srs[id] = { box: 1, due: api.todayN() - 1, reps: 1, ease: 2.3, lapses: 0, last: 0 };
    }
    api.show('today');
  });
  await expect(page.locator('#c-due')).toHaveText('20');
  await page.locator('#startBtn').click();
  await expect(page.locator('#ses-count')).toHaveText('1/8');
});

test('placement can be restarted after cancelling and only saves when complete', async ({ app, page }) => {
  await app.open();
  await page.locator('#placeBtn').click();
  await page.evaluate(() => window.__etude.resolve(window.__etude.SES.q, true));
  await page.locator('#ses-end').click();
  await expect(page.locator('#placeBtn')).toBeVisible();
  await expect(page.locator('#summary')).toBeHidden();
  await page.reload();
  await expect(page.locator('#placeBtn')).toBeVisible();
  expect(await page.evaluate(() => window.__etude.data.totalReviews)).toBe(0);
  await page.locator('#placeBtn').click();
  await page.evaluate(() => {
    const api = window.__etude;
    for (let i = 0; i < api.SES.queue.length; i++) {
      api.resolve(api.SES.q, true);
      api.$('q-next').click();
    }
  });
  await expect(page.locator('#sum-title')).toHaveText(/Placement complete/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).data.placed)).toBe(true);
});

test('language switches translate the active ear question without changing its answer order or outcome', async ({ app, page }) => {
  await app.open({ hash: 'practice' });
  await page.locator('#pr-mode [data-v=ear]').click();
  await page.locator('#pr-start').click();
  const choices = page.locator('#q-answers button');
  const initial = await choices.allTextContents();
  await page.evaluate(() => { window.__practiceQuestion = window.__etude.SES.q; });
  await page.locator('#settingsBtn').click();
  await page.locator('#set-lang [data-v=de]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.keyboard.press('Escape');
  const translated = await choices.allTextContents();
  expect(translated).not.toEqual(initial);
  const shorthand = text => text.split(' · ')[0];
  expect(translated.map(shorthand)).toEqual(initial.map(shorthand));
  expect(await page.evaluate(() => window.__etude.SES.q === window.__practiceQuestion)).toBe(true);

  const wrong = await page.evaluate(() => [...document.querySelectorAll('#q-answers button')]
    .findIndex(button => +button.dataset.k !== window.__etude.SES.q.it.semi));
  await choices.nth(wrong).click();
  const result = await page.locator('#q-verdict').textContent();
  const outcome = await choices.evaluateAll(buttons => buttons.map(button => button.className));
  await page.locator('#settingsBtn').click();
  await page.locator('#set-lang [data-v=en]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.keyboard.press('Escape');
  await expect(page.locator('#q-verdict')).not.toHaveText(result);
  await expect(page.locator('#q-next')).toBeVisible();
  expect(await choices.evaluateAll(buttons => buttons.map(button => button.className))).toEqual(outcome);
});

test('Learn translates the quiz in place, including a graded question', async ({ app, page }) => {
  await app.open({ hash: 'learn' });
  await page.locator('[data-lq=start]').click();
  await page.locator('.lq-o').first().click();
  await page.locator('[data-lq=next]').click();
  await page.locator('.lq-o').first().click();
  await expect(page.locator('.lq-n')).toContainText('Question 2');
  const state = () => page.locator('.lq-o').evaluateAll(buttons => buttons.map(button => button.dataset.r ?? null));
  const grade = await state();
  const explanation = await page.locator('.lq-fb').textContent();
  await page.locator('#settingsBtn').click();
  await page.locator('#set-lang [data-v=ro]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
  await page.keyboard.press('Escape');
  await expect(page.locator('.lq-n')).toContainText('Întrebarea 2');
  await expect(page.locator('.lq-fb')).not.toHaveText(explanation);
  expect(await state()).toEqual(grade);
  await expect(page.locator('[data-lq=next]')).toBeVisible();
});

test('Drill again restores an interval direction after reload', async ({ app, page }) => {
  await app.open({ hash: 'practice' });
  await page.locator('#pr-mode [data-v=ear]').click();
  await page.locator('#pr-dir [data-v=desc]').click();
  await page.locator('#pr-start').click();
  await page.locator('#q-answers button').first().click();
  await page.locator('#ses-end').click();
  await page.reload();
  await page.locator('#pr-redo').click();
  expect(await page.evaluate(() => window.__etude.SES.q.dir)).toBe('desc');
});

test('backgrounding a rhythm round leaves it ungraded and silent input has no timing judgment', async ({ app, page }) => {
  await app.open({ hash: 'read' });
  await page.locator('#rdn-all-drills').click();
  await page.locator('[data-lv=rh1]').click();
  await page.locator('#rdx-body [data-mode=practice]').click();
  await page.clock.install();
  await page.locator('#rdx-rhgo').click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(15000);
  await page.evaluate(() => { delete document.hidden; });
  expect(await page.evaluate(() => [window.__etude.RD.rh.playing, window.__etude.RD.n])).toEqual([false, 0]);
  await expect(page.locator('#rdx-fb')).toContainText('Your turn');

  await page.locator('#rdx-rhgo').click();
  await page.clock.fastForward(15000);
  await expect(page.locator('#rdx-fb')).toHaveText(/^0% on time \(0\/\d+\)$/);
});

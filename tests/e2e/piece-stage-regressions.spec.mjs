import { test, expect } from '../helpers/fixtures.mjs';

async function advanceSteps(page, count) {
  await page.evaluate(count => {
    const app = window.__etude;
    for (let i = 0; i < count; i++) {
      const step = app.SR.steps[app.SR.stepIdx];
      for (const note of step.notes) {
        app.handleNoteOn(note.midi, 100);
        app.handleNoteOff(note.midi);
      }
    }
  }, count);
}

async function expectCurrentNoteVisible(page) {
  await expect.poll(() => page.evaluate(() => {
    const wrap = document.querySelector('#rd-staff').getBoundingClientRect();
    const notes = [...document.querySelectorAll('#rd-staff .ss-n[data-s="now"]')];
    return notes.length > 0 && notes.every(note => {
      const bounds = note.getBoundingClientRect();
      return bounds.left >= wrap.left && bounds.right <= wrap.right;
    });
  })).toBe(true);
}

test('active non-immersive piece keeps its current note visible after resize', async ({ app, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await app.open({ hash: 'read' });
  await page.locator('#rdt-pieces').click();
  await page.locator('#rd-piece').selectOption('minuet');
  await page.evaluate(() => { window.__etude.rdData().prefs.stage = false; });
  await page.locator('#rd-go').click();
  await advanceSteps(page, 15);
  await expectCurrentNoteVisible(page);
  await page.setViewportSize({ width: 400, height: 844 });
  // Both debounced resize handlers must finish before checking the redraw.
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => ({ active: window.__etude.SR.active, step: window.__etude.SR.stepIdx })))
    .toEqual({ active: true, step: 15 });
  await expectCurrentNoteVisible(page);
});

for (const width of [320, 390]) {
  for (const piece of ['w5rh', 'minuet', 'elise']) {
    test(`immersive ${piece} keeps readable music and follows notes at ${width}px`, async ({ app, page }) => {
      await page.setViewportSize({ width, height: 844 });
      await app.open({ hash: 'read' });
      await page.locator('#rdt-pieces').click();
      await page.locator('#rd-piece').selectOption(piece);
      await page.locator('#rd-go').click();
      await expect(page.locator('body')).toHaveAttribute('data-stage', 'immersive');
      const music = await page.locator('#rd-staff').evaluate(wrap => {
        const svg = wrap.querySelector('svg');
        const note = svg.querySelector('.ss-n ellipse').getBoundingClientRect();
        const style = getComputedStyle(wrap);
        return {
          scale: svg.getBoundingClientRect().width / svg.viewBox.baseVal.width,
          noteWidth: note.width,
          noteHeight: note.height,
          scrollLeft: wrap.scrollLeft,
          canScroll: ['auto', 'scroll'].includes(style.overflowX),
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
        };
      });
      expect(music.scale).toBeGreaterThanOrEqual(0.649);
      expect(music.noteWidth).toBeGreaterThanOrEqual(8);
      expect(music.noteHeight).toBeGreaterThanOrEqual(7);
      expect(music.scrollLeft).toBe(0);
      expect(music.canScroll).toBe(true);
      expect(music.pageOverflow).toBeLessThanOrEqual(1);
      await expectCurrentNoteVisible(page);
      await advanceSteps(page, piece === 'w5rh' ? 5 : 15);
      await expectCurrentNoteVisible(page);
      await page.setViewportSize({ width: 844, height: width });
      await page.waitForTimeout(300);
      await expectCurrentNoteVisible(page);
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(300);
      await expectCurrentNoteVisible(page);
    });
  }
}

for (const activation of ['keyboard', 'pointer']) {
  test(`Finish restores the piece start focus after ${activation} activation`, async ({ app, page }) => {
    await app.open({ hash: 'read' });
    await page.locator('#rdt-pieces').click();
    await page.locator('#rd-go').click();
    await expect(page.locator('body')).toHaveAttribute('data-stage', 'immersive');
    const finish = page.locator('#rd-stage-end');
    if (activation === 'keyboard') {
      await finish.focus();
      await page.keyboard.press('Enter');
    } else {
      await finish.click();
    }
    await expect(page.locator('body')).not.toHaveAttribute('data-stage', /./);
    expect(await page.evaluate(() => window.__etude.SR.active)).toBe(false);
    await expect(page.locator('#rd-go')).toBeVisible();
    await expect(page.locator('#rd-go')).toBeFocused();
  });
}

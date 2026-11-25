import { test, expect } from '../helpers/fixtures.mjs';

async function fullscreenBoundary(page, mode = 'unsupported') {
  await page.addInitScript(kind => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: kind !== 'unsupported' });
    let element = null;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
    Element.prototype.requestFullscreen = async () => {
      if (kind === 'rejected') throw new DOMException('Denied', 'NotAllowedError');
      if (kind === 'delayed') await new Promise(resolve => (window.__fullscreenRequests ??= []).push(resolve));
      element = document.documentElement;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    document.exitFullscreen = async () => {
      element = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    };
  }, mode);
}

async function readPiece(app, page) {
  await app.open({ hash: 'read', dock: false });
  await page.locator('#rdn-book-go').click();
  await expect(page.locator('#rd-staff svg')).toBeVisible();
}

test('Read expands before Start without claiming an attempt; zoom, fit, keys and Escape work without native fullscreen', async ({ app, page }) => {
  await fullscreenBoundary(page);
  await readPiece(app, page);
  const before = await page.evaluate(() => ({ state: window.__etude.SR.srtState.name, ledger: localStorage.getItem('etude-sight-v1') }));
  await page.locator('#rd-fs').click();
  await expect(page.locator('body')).toHaveAttribute('data-score-focus', 'read');
  await expect(page.locator('#nav')).toBeHidden();
  await expect(page.locator('#rd-stage-end')).toBeHidden();
  await expect(page.locator('#rd-top-fs')).toBeInViewport();
  await expect(page.locator('#rd-top-fs')).toBeFocused();
  // Zoom stays tucked inside Display so only one −/+ pair (BPM) is visible by default.
  await expect(page.locator('#rd-focus-tools')).toBeHidden();
  await expect(page.locator('#rd-bpm-down')).toBeVisible();
  await expect(page.locator('#rd-bpm-up')).toBeVisible();
  await page.locator('#rd-focus-disp-btn').click();
  await expect(page.locator('#rd-focus-tools')).toBeVisible();
  await page.locator('#rd-focus-in').click();
  await expect(page.locator('#rd-staff svg')).toHaveCSS('zoom', '1.1');
  await page.locator('#rd-focus-fit').click();
  await expect(page.locator('#rd-staff svg')).toHaveCSS('zoom', '1');
  // Escape closes the Display popover before leaving fullscreen.
  await page.keyboard.press('Escape');
  await expect(page.locator('#rd-focus-tools')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-score-focus', 'read');
  await page.locator('#rd-focus-disp-btn').click();
  await page.locator('#rd-focus-kb').click();
  await expect(page.locator('#rd-focus-kb')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#dock-keys')).toBeVisible();
  await page.locator('#dock-kb-toggle').click();
  await expect(page.locator('#rd-focus-kb')).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveAttribute('data-score-focus');
  await expect(page.locator('#rd-fs')).toBeFocused();
  await expect(page.locator('#rdn-checklist')).toBeVisible();
  expect(await page.evaluate(() => ({ state: window.__etude.SR.srtState.name, ledger: localStorage.getItem('etude-sight-v1') }))).toEqual(before);
});

test('Read native Escape leaves expansion without stopping an active attempt or revealing a concealed score', async ({ app, page }) => {
  await fullscreenBoundary(page, 'native');
  await readPiece(app, page);
  await page.locator('#rd-fs').click();
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.locator('#rd-go').click();
  await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('countIn');
  const before = await page.evaluate(() => ({ id: window.__etude.SR.srtState.attemptId, active: window.__etude.SR.active, concealed: document.querySelector('#rd-staff').getAttribute('aria-hidden') }));
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.locator('body')).not.toHaveAttribute('data-score-focus');
  expect(await page.evaluate(() => ({ id: window.__etude.SR.srtState.attemptId, active: window.__etude.SR.active, concealed: document.querySelector('#rd-staff').getAttribute('aria-hidden') }))).toEqual(before);
});

test('Read switches modes in both directions without leaving native fullscreen', async ({ app, page }) => {
  await fullscreenBoundary(page, 'native');
  await readPiece(app, page);
  await page.locator('#rd-fs').click();
  const mode = page.locator('#rd-stage-mode');
  const learn = mode.getByRole('button', { name: 'Step by step' });
  const assess = mode.getByRole('button', { name: 'Assessment' });
  await expect(assess).toHaveAttribute('aria-pressed', 'true');
  await learn.click();
  await expect(learn).toHaveAttribute('aria-pressed', 'true');
  await expect(assess).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#rd-go').click();
  await page.evaluate(() => {
    const api = window.__etude;
    for (const step of api.SR.steps) {
      for (const note of step.notes) {
        api.handleNoteOn(note.midi, 100);
        api.handleNoteOff(note.midi);
      }
    }
  });
  await expect(page.locator('#rdn-result')).toBeVisible();
  await assess.click();
  await expect(assess).toHaveAttribute('aria-pressed', 'true');
  await expect(learn).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#rdn-result')).toBeHidden();
  await page.locator('#rd-go').click();
  await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('countIn');

  await learn.click();
  await expect(learn).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__etude.SR.active)).toBe(false);
  expect(await page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await expect(page.locator('body')).toHaveAttribute('data-score-focus', 'read');
  await page.locator('#rd-top-fs').click();
  await expect(page.locator('#rd-mode button[data-v=learn]')).toHaveAttribute('aria-pressed', 'true');
});

test('Read tempo steps by one BPM within the slider limits in both layouts', async ({ app, page }) => {
  await fullscreenBoundary(page);
  await readPiece(app, page);
  const tempo = page.getByRole('slider', { name: 'Tempo' });
  const decrease = page.getByRole('button', { name: 'Decrease tempo' });
  const increase = page.getByRole('button', { name: 'Increase tempo' });
  const expectTempo = async (bpm) => {
    await expect(tempo).toHaveValue(String(bpm));
    await expect(page.locator('#rd-bpmLbl')).toHaveText(String(bpm));
    expect(await page.evaluate(() => window.__etude.SR.bpm)).toBe(bpm);
  };

  await tempo.press('Home');
  await decrease.click();
  await expectTempo(40);
  await increase.click();
  await expectTempo(41);
  await page.locator('#rd-fs').click();
  await expectTempo(41);
  await tempo.press('End');
  await increase.click();
  await expectTempo(160);
  await decrease.click();
  await expectTempo(159);

  await page.locator('#rd-stage-mode button[data-v=learn]').click();
  await page.locator('#rd-go').click();
  await decrease.click();
  await expectTempo(159);
});

test('Pieces keeps its run and selection when expanding; a rejected native request keeps the usable layout', async ({ app, page }) => {
  await fullscreenBoundary(page, 'rejected');
  await app.open({ hash: 'analysis' });
  await page.evaluate(() => window.__etude.pcOpen('canon'));
  await page.waitForFunction(() => !window.__etude.AN.loading && !!window.__etude.SCORE.geo);
  await page.evaluate(async () => {
    const api = window.__etude;
    api.AN.selected = new Set([0, 1, 2, 3]);
    api.anSelectionChanged();
    api.pracSet('wait', true);
    await api.scorePlay(false, 0);
    window.__fullscreenRun = api.SCORE.run;
  });
  await page.locator('#sc-stage').click();
  await expect(page.locator('body')).toHaveAttribute('data-score-focus', 'analysis');
  await expect(page.locator('#an-fs-top')).toBeVisible();
  await expect(page.locator('#an-fs-exit')).toBeVisible();
  await expect(page.locator('#an-side')).toBeHidden();
  await expect(page.locator('#an-fab')).toBeHidden();
  // Only Tempo −/+ is visible on screen until Display is opened.
  await expect(page.locator('#sc-speed-down')).toBeVisible();
  await expect(page.locator('#sc-zoom-out')).toBeHidden();
  await page.locator('#an-disp-btn').click();
  await expect(page.locator('#sc-fit')).toBeVisible();
  await expect(page.locator('#an-kb')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#an-disp-pop')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-score-focus', 'analysis');
  expect(await page.evaluate(() => window.__fullscreenRun === window.__etude.SCORE.run)).toBe(true);
  expect(await page.evaluate(() => [...window.__etude.AN.selected])).toEqual([0, 1, 2, 3]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#sc-stage')).toBeFocused();
  expect(await page.evaluate(() => window.__fullscreenRun === window.__etude.SCORE.run)).toBe(true);
  expect(await page.evaluate(() => [...window.__etude.AN.selected])).toEqual([0, 1, 2, 3]);
  await page.locator('#sc-stage').click();
  await page.evaluate(() => window.__etude.show('today'));
  await expect(page.locator('body')).not.toHaveAttribute('data-score-focus');
  await expect(page.locator('body')).not.toHaveAttribute('data-stage');
  await expect(page.locator('#nav')).toBeVisible();
});

test('a completed assessment keeps native fullscreen and starts the next exercise directly', async ({ app, page }) => {
  await fullscreenBoundary(page, 'native');
  await readPiece(app, page);
  await page.locator('#rd-fs').click();
  await page.locator('#rd-go').click();
  await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('countIn');
  await page.evaluate(() => {
    window.__etude.srtSetState({ type: 'countInDone' });
    window.__etude.srAssessFinish();
  });
  await expect(page.locator('body')).toHaveAttribute('data-score-focus', 'read');
  await expect(page.locator('#rdn-result')).toBeVisible();
  await page.locator('#rdn-r-next').click();
  await expect(page.locator('#rd-stage-title')).toHaveText('No. 2 of 96');
  await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('countIn');
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(true);
});

for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`Step by step stays expanded through Retry and Next at ${size.width}×${size.height}`, async ({ app, page }) => {
    await page.setViewportSize(size);
    await fullscreenBoundary(page);
    await readPiece(app, page);
    await page.locator('#rd-mode [data-v=learn]').click();
    await page.locator('#rd-go').click();
    const body = page.locator('body');
    await expect(body).toHaveAttribute('data-score-focus', 'read');
    await page.evaluate(() => {
      const api = window.__etude;
      for (const step of api.SR.steps) {
        for (const note of step.notes) {
          api.handleNoteOn(note.midi, 100);
          api.handleNoteOff(note.midi);
        }
      }
    });
    await expect(page.locator('#rdn-r-score')).toHaveText('100%');
    await expect(page.locator('#rdn-r-next')).toBeInViewport();
    await page.locator('#rdn-retry').click();
    await expect(page.locator('#rdn-result')).toBeHidden();
    expect(await page.evaluate(() => [window.__etude.SR.active, window.__etude.SR.stepIdx])).toEqual([true, 0]);

    await page.locator('#rd-stage-end').click();
    await expect(page.locator('#rd-go')).toBeFocused();
    await page.locator('#rd-stage-next').click();
    await expect(page.locator('#rd-stage-title')).toHaveText('No. 2 of 96');
    await expect(body).toHaveAttribute('data-score-focus', 'read');
    expect(await page.evaluate(() => [window.__etude.SR.active, window.__etude.SR.modeSel])).toEqual([true, 'learn']);
    await page.locator('#rd-top-fs').click();
    await expect(body).not.toHaveAttribute('data-stage');
  });
}

test('expansion preserves fullscreen opened independently', async ({ app, page }) => {
  await fullscreenBoundary(page, 'native');
  await readPiece(app, page);
  await page.evaluate(() => document.documentElement.requestFullscreen());
  await page.locator('#rd-fs').click();
  await page.locator('#rd-top-fs').click();
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await expect(page.locator('body')).not.toHaveAttribute('data-score-focus');
});

test('a dense Read piece wraps vertically and fits the phone width', async ({ app, page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await fullscreenBoundary(page);
  await app.open({ hash: 'read' });
  await page.evaluate(() => window.__etude.rdnOpen({ kind: 'book', level: 8, number: 1 }));
  await page.locator('#rd-fs').click();
  await expect.poll(() => page.evaluate(() => document.querySelector('#rd-staff svg').getBoundingClientRect().width <= document.querySelector('#rd-staff').clientWidth)).toBe(true);
  expect(await page.evaluate(() => window.__etude.SR.render.systems.length)).toBeGreaterThan(1);
});

test('rapid exit and re-entry adopts a late native request without closing the new expansion', async ({ app, page }) => {
  await fullscreenBoundary(page, 'delayed');
  await readPiece(app, page);
  await page.locator('#rd-fs').click();
  await page.locator('#rd-top-fs').click();
  await page.locator('#rd-fs').click();
  await page.evaluate(() => window.__fullscreenRequests[0]());
  await expect(page.locator('body')).toHaveAttribute('data-score-focus', 'read');
  await page.evaluate(() => window.__fullscreenRequests[1]());
  await page.locator('#rd-top-fs').click();
  await expect(page.locator('body')).not.toHaveAttribute('data-score-focus');
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});

for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`Read controls stay reachable at ${size.width}×${size.height} and navigation clears expansion`, async ({ app, page }) => {
    await page.setViewportSize(size);
    await fullscreenBoundary(page);
    await readPiece(app, page);
    await page.locator('#rd-fs').click();
    for (const id of ['rd-top-fs', 'rd-focus-disp-btn', 'rd-stage-mode', 'rd-go', 'rd-bpm-down', 'rd-bpm-up'])
      await expect(page.locator('#' + id)).toBeInViewport();
    await expect(page.locator('#rd-focus-tools')).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.querySelector('#rd-stage-top').getBoundingClientRect().bottom <= document.querySelector('#rd-staff').getBoundingClientRect().top)).toBe(true);
    await expect.poll(() => page.evaluate(() => document.querySelector('#rd-staff svg').getBoundingClientRect().width <= document.querySelector('#rd-staff').clientWidth)).toBe(true);
    await expect.poll(() => page.evaluate(() => document.querySelector('#rd-verdict').getBoundingClientRect().bottom <= document.querySelector('#rd-go').parentElement.getBoundingClientRect().top)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.__etude.show('today'));
    await expect(page.locator('body')).not.toHaveAttribute('data-score-focus');
    await expect(page.locator('body')).not.toHaveAttribute('data-stage');
  });
}

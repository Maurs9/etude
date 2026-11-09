import { test, expect } from './fixtures.mjs';

async function openAssessGenerator(app) {
  const page = await app.open({ hash: 'read' });
  await page.locator('#rdt-pieces').click();
  await page.locator('#rd-mode button[data-v="assess"]').click();
  await page.locator('#rd-gen').click();
  await expect(page.locator('#rd-srt-preview')).toBeHidden();
  return page;
}

async function startPreview(app) {
  const page = await openAssessGenerator(app);
  await page.clock.install();
  await page.locator('#rd-go').click();
  await expect(page.locator('#rd-srt-preview')).toBeVisible();
  return page;
}

async function holdLedger(page) {
  await page.evaluate(() => {
    let release = () => {};
    window.__releaseSightLedger = () => release();
    window.__sightLedgerHeld = false;
    void navigator.locks.request('etude-sight-ledger-v1', async () => {
      window.__sightLedgerHeld = true;
      await new Promise((resolve) => {
        release = resolve;
      });
    });
  });
  await page.waitForFunction(() => window.__sightLedgerHeld === true);
}

async function releaseLedger(page) {
  await page.evaluate(() => window.__releaseSightLedger());
}

async function terminalSnapshot(page) {
  return page.evaluate(async () => {
    const api = window.__etude;
    const ledger = api.srtReadLedger(localStorage);
    return {
      state: api.SR.srtState.name,
      active: api.SR.active,
      previewHidden: document.querySelector('#rd-srt-preview')?.hidden ?? true,
      go: document.querySelector('#rd-go')?.textContent ?? '',
      timers: api.SR.timers.length,
      nodes: api.SR.nodes.length,
      claims: Object.values(ledger.exposures).filter((exposure) => exposure.claim).length,
      statuses: Object.values(ledger.attempts).map((attempt) => attempt.status),
      heldAttemptLocks: (await navigator.locks.query()).held
        .filter((lock) => lock.name.startsWith('etude-sight-attempt-')).length,
    };
  });
}

async function expectTerminalAttempt(page, statuses = ['interrupted']) {
  await expect.poll(async () => {
    const snapshot = await terminalSnapshot(page);
    return statuses.some((status) => snapshot.statuses.includes(status)) &&
      snapshot.claims === 0 && snapshot.heldAttemptLocks === 0;
  }).toBe(true);
}

test.describe('Sight-reading cancellation races', () => {
  test('cancels switch-to-practice while its terminal ledger write waits for the ledger lock', async ({ app }) => {
    const page = await startPreview(app);
    await holdLedger(page);
    await page.locator('#rd-srt-practice').click();
    await page.evaluate(() => window.__etude.panic());

    expect(await terminalSnapshot(page)).toMatchObject({
      state: 'interrupted',
      active: false,
      previewHidden: true,
    });
    await releaseLedger(page);
    await expectTerminalAttempt(page, ['interrupted', 'abandoned']);
    await page.clock.runFor(6000);
    expect(await terminalSnapshot(page)).toMatchObject({
      state: 'interrupted',
      active: false,
      previewHidden: true,
      timers: 0,
      nodes: 0,
    });
  });

  test('clears the preview and resolves the claim when panic interrupts the countdown', async ({ app }) => {
    const page = await startPreview(app);
    await page.evaluate(() => window.__etude.panic());
    expect(await terminalSnapshot(page)).toMatchObject({
      state: 'interrupted',
      active: false,
      previewHidden: true,
    });
    await page.clock.runFor(25_000);
    await expectTerminalAttempt(page);
    expect(await terminalSnapshot(page)).toMatchObject({
      state: 'interrupted',
      active: false,
      previewHidden: true,
      go: expect.not.stringMatching(/Stop/),
    });
  });

  test('clears the preview and resolves the claim when the page becomes hidden', async ({ app }) => {
    const page = await startPreview(app);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await terminalSnapshot(page)).toMatchObject({
      state: 'interrupted',
      active: false,
      previewHidden: true,
    });
    await page.clock.runFor(25_000);
    await expectTerminalAttempt(page);
    expect(await terminalSnapshot(page)).toMatchObject({
      state: 'interrupted',
      active: false,
      previewHidden: true,
      go: expect.not.stringMatching(/Stop/),
    });
  });

  test('does not continue a claim when hidden-page cancellation happens during claimExposure', async ({ app }) => {
    const page = await openAssessGenerator(app);
    await page.clock.install();
    await holdLedger(page);
    await page.locator('#rd-go').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('claiming');
    await page.waitForFunction(async () =>
      (await navigator.locks.query()).pending.some((lock) => lock.name === 'etude-sight-ledger-v1'));
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await terminalSnapshot(page)).toMatchObject({
      state: 'interrupted',
      active: false,
      previewHidden: true,
    });
    await releaseLedger(page);
    await page.clock.runFor(25_000);
    await expectTerminalAttempt(page);
    expect(await terminalSnapshot(page)).toMatchObject({
      state: 'interrupted',
      active: false,
      previewHidden: true,
      timers: 0,
      nodes: 0,
    });
  });

  test('terminally resolves an attempt when leaving Read during preview', async ({ app }) => {
    const page = await startPreview(app);
    await page.evaluate(() => window.__etude.show('explore'));
    expect(await terminalSnapshot(page)).toMatchObject({
      state: 'interrupted',
      active: false,
      previewHidden: true,
    });
    await page.clock.runFor(60_000);
    await expectTerminalAttempt(page);
    const snapshot = await terminalSnapshot(page);
    expect(snapshot).toMatchObject({ active: false, claims: 0, heldAttemptLocks: 0 });
    expect(snapshot.statuses).not.toContain('completed');
  });

  test('terminally resolves an attempt when leaving Read during playing and restarts in practice', async ({ app }) => {
    const page = await startPreview(app);
    await page.locator('#rd-srt-start').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('countIn');
    await page.clock.runFor(5000);
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('playing');

    await page.evaluate(() => window.__etude.show('explore'));
    expect(await terminalSnapshot(page)).toMatchObject({ state: 'interrupted', active: false });
    await expectTerminalAttempt(page);
    await page.evaluate(() => window.__etude.show('read'));
    await page.locator('#rd-go').click();
    await expect.poll(() => page.evaluate(() => ({
      name: window.__etude.SR.srtState.name,
      mode: window.__etude.SR.srtState.mode,
    }))).toEqual({ name: 'countIn', mode: 'practice' });
    await page.clock.runFor(5000);
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('playing');
    await page.locator('#rd-go').click();
    expect(await page.evaluate(() => window.__etude.SR.active)).toBe(false);
  });
});

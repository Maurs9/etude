import { test, expect } from '../../helpers/fixtures.mjs';

// Read & Play plays generated melodies only; a built-in piece's notes load as a non-generated fixture for the engine.
async function showFixture(page, id) {
  await page.evaluate((pieceId) => {
    const api = window.__etude, piece = api.PIECES.find((p) => p.id === pieceId);
    api.srShowPiece({ ...piece, ephemeral: true });
  }, id);
}


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

async function pendingSnapshot(page) {
  return page.evaluate(async () => {
  const api = window.__etude;
  const ledger = api.srtReadLedger(localStorage);
  return {
    state: api.SR.srtState.name,
    panelHidden: document.querySelector('#rd-srt-pending')?.hidden ?? true,
    verdict: document.querySelector('#rd-verdict')?.textContent ?? '',
    go: document.querySelector('#rd-go')?.textContent ?? '',
    pendingAttempt: api.SR.srtPendingAttempt?.attemptId ?? null,
    evaluation: JSON.stringify(api.SR.srtEvaluation),
    resultValue: api.SR.srtResultValue,
    results: JSON.stringify(api.SR.results),
    names: api.SR.names,
    modeSel: api.SR.modeSel,
    hands: api.SR.hands,
    active: api.SR.active,
    listening: api.SR.listening,
    claims: Object.values(ledger.exposures).filter((exposure) => exposure.claim).length,
    statuses: Object.values(ledger.attempts).map((attempt) => attempt.status),
    heldAttemptLocks: (await navigator.locks.query()).held
      .filter((lock) => lock.name.startsWith('etude-sight-attempt-')).length,
    lease: !!api.SR.srtLease,
  };
  });
}

async function startPendingSave(app) {
  const page = await startPreview(app);
  await page.locator('#rd-srt-start').click();
  await page.clock.runFor(5000);
  await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('playing');
  await page.evaluate(() => {
  const original = Storage.prototype.setItem;
  window.__srtOriginalSetItem = original;
  Storage.prototype.setItem = function setItem(key, value) {
    if (key === 'etude-sight-v1') throw new DOMException('blocked', 'QuotaExceededError');
    return original.call(this, key, value);
  };
  window.__etude.srAssessFinish();
  });
  await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('pendingSave');
  await expect(page.locator('#rd-srt-pending')).toBeVisible();
  await page.evaluate(() => { Storage.prototype.setItem = window.__srtOriginalSetItem; });
  return page;
}

test.describe('Sight-reading cancellation races', () => {
  test('cancels switch-to-practice while its terminal ledger write waits for the ledger lock', async ({ app }) => {
    const page = await startPreview(app);
    await holdLedger(page);
    await page.locator('#rd-srt-practice').click();
    await page.evaluate(() => window.__etude.panic());

    expect(await terminalSnapshot(page)).toMatchObject({
      state: 'abandoned',
      active: false,
      previewHidden: true,
    });
    await releaseLedger(page);
    await expectTerminalAttempt(page, ['abandoned']);
    await page.clock.runFor(6000);
    const snapshot = await terminalSnapshot(page);
    expect(snapshot).toMatchObject({
      state: 'abandoned',
      active: false,
      previewHidden: true,
      timers: 0,
      nodes: 0,
    });
    expect(snapshot.statuses).toEqual(['abandoned']);
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
      state: 'abandoned',
      active: false,
      previewHidden: true,
    });
    await page.clock.runFor(60_000);
    await expectTerminalAttempt(page, ['abandoned']);
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

  test('restores legacy assessment on a non-generated fixture piece on a fresh Read open', async ({ app }) => {
    const page = await app.open({ hash: 'read', dock: true });
    await page.locator('#rdt-pieces').click();
    await showFixture(page, 'w5rh');
    await page.locator('#rd-mode button[data-v="assess"]').click();
    await page.locator('#rd-go').click();
    await expect.poll(() => page.evaluate(() => ({
      piece: window.__etude.SR.piece?.id,
      active: window.__etude.SR.active,
      go: document.querySelector('#rd-go')?.textContent ?? '',
    }))).toEqual({ piece: 'w5rh', active: true, go: expect.stringMatching(/Stop/) });
    await page.evaluate(() => window.__etude.panic());
  });

  test('restores legacy assessment after a generated sight-reading session', async ({ app }) => {
    const page = await startPreview(app);
    await page.locator('#rd-srt-practice').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.mode)).toBe('practice');
    await showFixture(page, 'w5rh');
    await page.locator('#rd-mode button[data-v="assess"]').click();
    await page.locator('#rd-go').click();
    await expect.poll(() => page.evaluate(() => ({
      piece: window.__etude.SR.piece?.id,
      srtPiece: window.__etude.SR.srtPiece,
      active: window.__etude.SR.active,
      go: document.querySelector('#rd-go')?.textContent ?? '',
    }))).toMatchObject({ piece: 'w5rh', active: true, go: expect.stringMatching(/Stop/) });
    expect(await page.evaluate(() => window.__etude.SR.srtPiece)).toEqual(
      expect.objectContaining({ profileId: 'P1.a' }),
    );
    await page.evaluate(() => window.__etude.panic());
  });

  test('abandons a preview when leaving Pieces for Stats and never runs it in the background', async ({ app }) => {
    const page = await startPreview(app);
    await page.locator('#rdt-stats').click();
    expect(await terminalSnapshot(page)).toMatchObject({ state: 'abandoned', active: false, previewHidden: true });
    await expectTerminalAttempt(page, ['abandoned']);
    await page.clock.runFor(70_000);
    const snapshot = await terminalSnapshot(page);
    expect(snapshot).toMatchObject({ state: 'abandoned', active: false, claims: 0, heldAttemptLocks: 0 });
    expect(snapshot.statuses).not.toContain('completed');
  });

  test('abandons a claiming attempt when leaving Pieces while the ledger lock is held', async ({ app }) => {
    const page = await openAssessGenerator(app);
    await page.clock.install();
    await holdLedger(page);
    await page.locator('#rd-go').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('claiming');
    await page.locator('#rdt-stats').click();
    expect(await terminalSnapshot(page)).toMatchObject({ state: 'abandoned', active: false, previewHidden: true });
    await releaseLedger(page);
    await expectTerminalAttempt(page, ['abandoned']);
    await page.clock.runFor(70_000);
    const snapshot = await terminalSnapshot(page);
    expect(snapshot).toMatchObject({ state: 'abandoned', active: false, claims: 0, heldAttemptLocks: 0 });
    expect(snapshot.statuses).not.toContain('completed');
  });

  test('keeps pendingSave frozen across non-navigation controls and interruption causes', async ({ app }) => {
    const page = await startPendingSave(app);
    const actions = [
      ['main Start', async () => page.locator('#rd-go').click()],
      ['note names', async () => page.locator('#rd-names').click()],
      ['Listen', async () => page.locator('#rd-listen').click()],
      ['panic', async () => page.evaluate(() => window.__etude.panic())],
      ['hidden page', async () => page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      })],
      ['audio suspension', async () => page.evaluate(() => window.__etude.actx.suspend())],
      ['MIDI/BLE disconnect', async () => page.evaluate(() => {
        window.__etude.BLE.chr = { removeEventListener() {}, stopNotifications() { return Promise.resolve(); } };
        window.__etude.bleDisconnect();
      })],
      ['mode', async () => page.locator('#rd-mode button[data-v="learn"]').click()],
      ['hands', async () => page.evaluate(() => {
        const button = [...document.querySelectorAll('#rd-hands button')].find((candidate) =>
          candidate instanceof HTMLButtonElement && !candidate.disabled && candidate.dataset.v !== window.__etude.SR.hands);
        button?.click();
      })],
      ['notation', async () => page.evaluate(() => window.__etude.applyNotation())],
      ['other control', async () => page.evaluate(() => window.__etude.srSetBpm(120))],
    ];
    const before = await pendingSnapshot(page);
    for (const [label, action] of actions) {
      await action();
      await page.waitForTimeout(20);
      const after = await pendingSnapshot(page);
      expect(after, label).toMatchObject({
        state: 'pendingSave',
        panelHidden: false,
        verdict: before.verdict,
        go: before.go,
        pendingAttempt: before.pendingAttempt,
        evaluation: before.evaluation,
        resultValue: before.resultValue,
        results: before.results,
        names: before.names,
        modeSel: before.modeSel,
        hands: before.hands,
        active: false,
        listening: false,
        claims: 1,
        statuses: before.statuses,
        heldAttemptLocks: 1,
        lease: true,
      });
    }
  });

  test('abandons pendingSave on navigation and releases its claim and lease', async ({ app }) => {
    const page = await startPendingSave(app);
    await page.locator('#rdt-stats').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('abandoned');
    await expectTerminalAttempt(page, ['abandoned']);
    expect(await page.locator('#rd-srt-pending').isHidden()).toBe(true);
    const snapshot = await pendingSnapshot(page);
    expect(snapshot).toMatchObject({ state: 'abandoned', pendingAttempt: null, claims: 0, heldAttemptLocks: 0, lease: false });
  });

  test('keeps pendingSave and its melody when the engine is asked to show another piece', async ({ app }) => {
    const page = await startPendingSave(app);
    await showFixture(page, 'w5rh');
    await page.evaluate(() => window.__etude.srSelectPiece('gen'));
    expect(await page.evaluate(() => ({ piece: window.__etude.SR.piece?.id, state: window.__etude.SR.srtState.name })))
      .toEqual({ piece: 'gen', state: 'pendingSave' });
    await expect(page.locator('#rd-srt-pending')).toBeVisible();
  });

  test('abandons pendingSave before generating another sight-reading piece', async ({ app }) => {
    const page = await startPendingSave(app);
    await page.locator('#rd-gen').click();
    await expect.poll(async () => (await pendingSnapshot(page)).statuses).toEqual(['abandoned']);
    expect(await pendingSnapshot(page)).toMatchObject({
      state: 'idle',
      pendingAttempt: null,
      claims: 0,
      heldAttemptLocks: 0,
      lease: false,
    });
  });

  test('keeps a completed save race consistent when panic arrives before the ledger lock releases', async ({ app }) => {
    const page = await startPreview(app);
    await page.locator('#rd-srt-start').click();
    await page.clock.runFor(5000);
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('playing');
    await holdLedger(page);
    await page.evaluate(() => window.__etude.srAssessFinish());
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('completed');
    await page.evaluate(() => window.__etude.panic());
    expect(await page.evaluate(() => window.__etude.SR.srtState.name)).toBe('completed');
    await releaseLedger(page);
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('saved');
    const snapshot = await terminalSnapshot(page);
    expect(snapshot).toMatchObject({ state: 'saved', claims: 0, heldAttemptLocks: 0 });
    expect(snapshot.statuses).toEqual(['completed']);
  });

  test('does not consume a claiming attempt when the main Start or names controls are used', async ({ app }) => {
    const page = await openAssessGenerator(app);
    await page.clock.install();
    await holdLedger(page);
    await page.locator('#rd-go').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('claiming');
    const before = await terminalSnapshot(page);
    await page.locator('#rd-go').click();
    await page.locator('#rd-names').click();
    await page.waitForTimeout(50);
    const after = await terminalSnapshot(page);
    expect(after).toMatchObject({
      state: 'claiming',
      active: false,
      previewHidden: true,
      claims: before.claims,
      heldAttemptLocks: before.heldAttemptLocks,
      statuses: before.statuses,
    });
    await releaseLedger(page);
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('preview');
    expect(await terminalSnapshot(page)).toMatchObject({ claims: 1, heldAttemptLocks: 1 });
    await page.evaluate(() => window.__etude.show('explore'));
    await expectTerminalAttempt(page, ['abandoned']);
  });

  test('does not consume a preview when the main Start or names controls are used', async ({ app }) => {
    const page = await startPreview(app);
    const before = await terminalSnapshot(page);
    await page.locator('#rd-go').click();
    await page.locator('#rd-names').click();
    await page.waitForTimeout(50);
    const after = await terminalSnapshot(page);
    expect(after).toMatchObject({
      state: 'preview',
      active: false,
      previewHidden: false,
      claims: before.claims,
      heldAttemptLocks: before.heldAttemptLocks,
      statuses: before.statuses,
    });
    await page.evaluate(() => window.__etude.show('explore'));
    await expectTerminalAttempt(page, ['abandoned']);
  });
});

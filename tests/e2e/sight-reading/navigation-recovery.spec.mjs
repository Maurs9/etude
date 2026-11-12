import { test, expect } from '../../helpers/fixtures.mjs';

// Read & Play plays generated melodies only; a built-in piece's notes load as a non-generated fixture for the engine.
async function showFixture(page, id) {
  await page.evaluate((pieceId) => {
    const api = window.__etude, piece = api.PIECES.find((p) => p.id === pieceId);
    api.srShowPiece({ ...piece, ephemeral: true });
  }, id);
}


const LANGUAGES = ['en', 'ro', 'es', 'fr', 'de', 'it', 'pt-BR'];

async function openRead(app) {
  const page = await app.open({ hash: 'read', dock: true });
  await page.locator('#rdt-pieces').click();
  return page;
}

async function openAssessGenerator(app) {
  const page = await openRead(app);
  await page.locator('#rd-mode button[data-v="assess"]').click();
  await page.locator('#rd-gen').click();
  return page;
}

async function installLedgerFailure(page) {
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.__srtOriginalSetItem = original;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === 'etude-sight-v1') throw new DOMException('blocked', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
}

async function restoreLedger(page) {
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__srtOriginalSetItem;
  });
}

async function pendingSnapshot(page) {
  return page.evaluate(async () => {
    const api = window.__etude;
    const ledger = api.srtReadLedger(localStorage);
    return {
      state: api.SR.srtState.name,
      fingerprint: api.SR.srtFingerprint,
      panelHidden: document.querySelector('#rd-srt-pending')?.hidden ?? true,
      noticeHidden: document.querySelector('#rd-srt-notice')?.hidden ?? true,
      evaluation: JSON.stringify(api.SR.srtEvaluation),
      resultValue: api.SR.srtResultValue,
      pendingAttempt: api.SR.srtPendingAttempt?.attemptId ?? null,
      claims: Object.values(ledger.exposures).filter((exposure) => exposure.claim).length,
      statuses: Object.values(ledger.attempts).map((attempt) => attempt.status),
      heldAttemptLocks: (await navigator.locks.query()).held
        .filter((lock) => lock.name.startsWith('etude-sight-attempt-')).length,
      lease: !!api.SR.srtLease,
    };
  });
}

async function startPendingSave(app) {
  const page = await openAssessGenerator(app);
  await page.clock.install();
  await page.locator('#rd-go').click();
  await expect(page.locator('#rd-srt-preview')).toBeVisible();
  await page.locator('#rd-srt-start').click();
  await page.clock.runFor(5000);
  await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('playing');
  await installLedgerFailure(page);
  await page.evaluate(() => window.__etude.srAssessFinish());
  await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('pendingSave');
  await expect(page.locator('#rd-srt-pending')).toBeVisible();
  return page;
}

async function startPreview(app) {
  const page = await openAssessGenerator(app);
  await page.clock.install();
  await page.locator('#rd-go').click();
  await expect(page.locator('#rd-srt-preview')).toBeVisible();
  return page;
}

async function assertPracticeOnly(page) {
  const expected = await page.evaluate(() => window.__etude.t('rd_srt_error_already_exposed'));
  await expect(page.locator('#rd-staff')).toHaveAttribute('aria-hidden', 'false');
  expect(await page.locator('#rd-staff .ss-n').count()).toBeGreaterThan(0);
  await expect(page.locator('#rd-srt-notice')).toHaveText(expected);
  await expect(page.locator('#rd-verdict')).toHaveText(expected);
  await page.locator('#rd-go').click();
  await expect.poll(() => page.evaluate(() => ({
    name: window.__etude.SR.srtState.name,
    mode: window.__etude.SR.srtState.mode,
  }))).toEqual({ name: 'countIn', mode: 'practice' });
  await expect(page.locator('#rd-srt-notice')).toHaveText(expected);
}

async function exposeInjected(page, mode, seed) {
  await page.evaluate(({ mode: value, seed: injectedSeed }) => {
    window.__etude.RD.L = window.__etude.RD_LV.sr1;
    window.__etude.rdSightStart(value, injectedSeed);
  }, { mode, seed });
  await page.waitForFunction(() => Boolean(window.__etude.SR.srtFingerprint));
  return page.evaluate(() => window.__etude.SR.srtFingerprint);
}

test.describe('Sight-reading iteration 15 regressions', () => {
  test('keeps pending-save failures truthful and protected in every locale', async ({ app }) => {
    const page = await startPendingSave(app);
    for (const language of LANGUAGES) {
      await page.evaluate((value) => window.__etude.setLang(value), language);
      const pendingMessage = await page.evaluate(() => window.__etude.t('rd_srt_error_pending_storage'));

      await page.locator('#rd-srt-retry').click();
      await expect(page.locator('#rd-srt-notice')).toHaveText(pendingMessage);
      expect(await pendingSnapshot(page)).toMatchObject({
        state: 'pendingSave',
        panelHidden: false,
        claims: 1,
        heldAttemptLocks: 1,
        lease: true,
      });

      await page.locator('#rd-srt-continue').click();
      await expect(page.locator('#rd-srt-notice')).toHaveText(pendingMessage);
      expect(await pendingSnapshot(page)).toMatchObject({
        state: 'pendingSave',
        panelHidden: false,
        claims: 1,
        heldAttemptLocks: 1,
        lease: true,
      });

      await page.evaluate(() => window.__etude.show('today'));
      await expect.poll(() => page.evaluate(() => location.hash)).toBe('#read');
      await expect(page.locator('#view-read')).toHaveClass(/active/);
      await expect(page.locator('#rd-srt-notice')).toHaveText(pendingMessage);
    }

    await restoreLedger(page);
    await page.locator('#rd-srt-continue').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('abandoned');
    await expect(page.locator('#rd-srt-pending')).toBeHidden();
    await expect(page.locator('#rd-srt-notice')).toBeHidden();
    expect(await pendingSnapshot(page)).toMatchObject({
      claims: 0,
      heldAttemptLocks: 0,
      lease: false,
      statuses: ['abandoned'],
    });
  });

  test('restores Read after a refused browser navigation and after recovery', async ({ app }) => {
    const page = await startPendingSave(app);
    await page.evaluate(() => window.__etude.show('explore'));
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#read');
    await expect(page.locator('#view-read')).toHaveClass(/active/);
    await expect(page.locator('#rd-srt-pending')).toBeVisible();

    await restoreLedger(page);
    await page.locator('#rd-srt-continue').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('abandoned');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#read');
    await expect(page.locator('#view-read')).toHaveClass(/active/);

    await page.evaluate(() => window.__etude.show('today'));
    await expect(page.locator('#view-today')).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#today');
    await page.goBack();
    await expect(page.locator('#view-read')).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#read');
  });

  test('keeps the generated melody when a piece switch is refused during pending save', async ({ app }) => {
    const page = await startPendingSave(app);
    const before = await page.evaluate(() => ({
      model: window.__etude.SR.piece?.id ?? null,
    }));
    expect(before).toEqual({ model: 'gen' });

    await showFixture(page, 'w5rh');
    expect(await page.evaluate(() => window.__etude.SR.piece?.id)).toBe('gen');
    expect(await page.evaluate(() => window.__etude.SR.piece?.id)).toBe('gen');

    await restoreLedger(page);
    await page.locator('#rd-srt-continue').click();
    await expect.poll(() => page.evaluate(() => ({
      model: window.__etude.SR.piece?.id,
    }))).toEqual({ model: 'gen' });
  });

  test('recovers a failed Switch to practice without holding locks', async ({ app }) => {
    const page = await startPreview(app);
    await installLedgerFailure(page);
    await page.locator('#rd-srt-practice').click();
    await expect.poll(() => page.evaluate(() => ({
      name: window.__etude.SR.srtState.name,
      mode: window.__etude.SR.srtState.mode,
    }))).toEqual({ name: 'countIn', mode: 'practice' });
    await expect(page.locator('#rd-srt-notice')).toHaveText(
      await page.evaluate(() => window.__etude.t('rd_srt_error_storage')),
    );
    expect(await pendingSnapshot(page)).toMatchObject({
      claims: 1,
      heldAttemptLocks: 0,
      lease: false,
    });

    await restoreLedger(page);
    await page.evaluate(async () => {
      const api = window.__etude;
      const ledger = api.srtReadLedger(localStorage);
      await api.srtLedgerUpdate(localStorage, {
        type: 'recoverOrphanClaims',
        generation: ledger.generation,
      });
    });
    await expect.poll(async () => {
      const snapshot = await pendingSnapshot(page);
      return snapshot.claims === 0 && snapshot.statuses.includes('abandoned');
    }).toBe(true);
    await expect.poll(() => page.evaluate(() => navigator.locks.query().then((result) =>
      result.held.filter((lock) => lock.name.startsWith('etude-sight-attempt-')).length))).toBe(0);
  });

  test('keeps abandoned and interrupted scores visible with practice-only status', async ({ app }) => {
    const page = await startPreview(app);
    await page.locator('#rdt-stats').click();
    await expect(page.locator('#rdp-stats')).toBeVisible();
    await page.locator('#rdt-pieces').click();
    await assertPracticeOnly(page);
  });

  test('renders an abandoned score after browser Back from another app view', async ({ app }) => {
    const page = await startPreview(app);
    await page.evaluate(() => window.__etude.show('explore'));
    await expect(page.locator('#view-explore')).toHaveClass(/active/);
    await page.goBack();
    await expect(page.locator('#view-read')).toHaveClass(/active/);
    await assertPracticeOnly(page);
  });

  test('renders an interrupted score after a hidden preview', async ({ app }) => {
    const page = await startPreview(app);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('interrupted');
    await assertPracticeOnly(page);
  });

  test('renders an interrupted score after a hidden playing run', async ({ app }) => {
    const page = await startPreview(app);
    await page.locator('#rd-srt-start').click();
    await page.clock.runFor(5000);
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('playing');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('interrupted');
    await assertPracticeOnly(page);
  });

  test('keeps an interrupted generated piece visible through Learn and Assess', async ({ app }) => {
    const page = await startPreview(app);
    await page.locator('#rd-mode button[data-v="learn"]').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('interrupted');
    await page.locator('#rd-mode button[data-v="assess"]').click();
    await assertPracticeOnly(page);
  });

  test('preserves eligible and exposed generated pieces across round trips through another piece', async ({ app }) => {
    const page = await openRead(app);
    const eligibleFingerprint = await exposeInjected(page, 'test', 0);
    expect(await page.locator('#rd-staff .ss-n').count()).toBe(0);
    await showFixture(page, 'w5rh');
    await page.evaluate(() => window.__etude.srSelectPiece('gen'));
    await expect.poll(() => page.evaluate(() => ({
      fingerprint: window.__etude.SR.srtFingerprint,
      state: window.__etude.SR.srtState.name,
      mode: window.__etude.SR.srtState.mode,
      notes: document.querySelectorAll('#rd-staff .ss-n').length,
      exposures: Object.keys(window.__etude.srtReadLedger(localStorage).exposures).length,
    }))).toEqual({
      fingerprint: eligibleFingerprint,
      state: 'idle',
      mode: 'firstSight',
      notes: 0,
      exposures: 0,
    });

    const exposedFingerprint = await exposeInjected(page, 'practice', 1);
    await expect.poll(() => page.evaluate((value) =>
      window.__etude.srtReadLedger(localStorage).exposures[value]?.reason ?? null, exposedFingerprint)).toBe('learn');
    const exposureCount = await page.evaluate(() => Object.keys(window.__etude.srtReadLedger(localStorage).exposures).length);
    await showFixture(page, 'w5rh');
    await page.evaluate(() => window.__etude.srSelectPiece('gen'));
    await expect.poll(() => page.evaluate(() => ({
      fingerprint: window.__etude.SR.srtFingerprint,
      mode: window.__etude.SR.srtState.mode,
      exposures: Object.keys(window.__etude.srtReadLedger(localStorage).exposures).length,
    }))).toEqual({
      fingerprint: exposedFingerprint,
      mode: 'practice',
      exposures: exposureCount,
    });
    await expect(page.locator('#rd-srt-notice')).toHaveText(
      await page.evaluate(() => window.__etude.t('rd_srt_error_already_exposed')),
    );
  });

  test('explains practice before restarting a saved first-sight result', async ({ app }) => {
    const page = await openAssessGenerator(app);
    await page.clock.install();
    await page.locator('#rd-go').click();
    await expect(page.locator('#rd-srt-preview')).toBeVisible();
    await page.locator('#rd-srt-start').click();
    await page.clock.runFor(5000);
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('playing');
    await page.evaluate(() => window.__etude.srAssessFinish());
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('saved');
    await expect(page.locator('#rd-srt-notice')).toBeHidden();

    await page.locator('#rd-go').click();
    await expect.poll(() => page.evaluate(() => ({
      name: window.__etude.SR.srtState.name,
      mode: window.__etude.SR.srtState.mode,
    }))).toEqual({ name: 'countIn', mode: 'practice' });
    await expect(page.locator('#rd-srt-notice')).toHaveText(
      await page.evaluate(() => window.__etude.t('rd_srt_error_already_exposed')),
    );
  });

  test('uses the seen-or-used wording for Learn exposure in every locale', async ({ app }) => {
    const page = await openRead(app);
    const fingerprint = await exposeInjected(page, 'practice', 0);
    await expect.poll(() => page.evaluate((value) =>
      window.__etude.srtReadLedger(localStorage).exposures[value]?.reason ?? null, fingerprint)).toBe('learn');

    for (const language of LANGUAGES) {
      await page.reload();
      await page.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));
      await page.locator('#rdt-pieces').click();
      await page.evaluate((value) => window.__etude.setLang(value), language);
      await exposeInjected(page, 'test', 0);
      await page.locator('#rd-go').click();
      await expect.poll(() => page.evaluate(() => ({
        name: window.__etude.SR.srtState.name,
        mode: window.__etude.SR.srtState.mode,
      }))).toEqual({ name: 'countIn', mode: 'practice' });
      await expect(page.locator('#rd-srt-notice')).toHaveText(
        await page.evaluate(() => window.__etude.t('rd_srt_error_already_exposed')),
      );
    }
  });

  test('uses the seen-or-used wording after Listen exposure and second-tab exposure', async ({ app }) => {
    const page = await openAssessGenerator(app);
    await page.clock.install();
    const listenFingerprint = await page.evaluate(() => window.__etude.SR.srtFingerprint);
    await page.locator('#rd-listen').click();
    await expect.poll(() => page.evaluate((value) =>
      window.__etude.srtReadLedger(localStorage).exposures[value]?.reason ?? null, listenFingerprint)).toBe('listen');
    await page.locator('#rd-listen').click();
    await page.locator('#rd-go').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.mode)).toBe('practice');
    await expect(page.locator('#rd-srt-notice')).toHaveText(
      await page.evaluate(() => window.__etude.t('rd_srt_error_already_exposed')),
    );

    await page.locator('#rd-gen').click();
    const secondTabFingerprint = await page.evaluate(() => window.__etude.SR.srtFingerprint);
    const secondTab = await page.context().newPage();
    try {
      await secondTab.goto(page.url());
      await secondTab.waitForFunction(() => typeof window.__etude?.srtLedgerUpdate === 'function');
      await secondTab.evaluate((value) => {
        const api = window.__etude;
        const ledger = api.srtReadLedger(localStorage);
        return api.srtLedgerUpdate(localStorage, {
          type: 'recordExposure',
          fingerprint: value,
          reason: 'learn',
          generation: ledger.generation,
        });
      }, secondTabFingerprint);
      await page.evaluate((value) => {
        window.__etude.panic();
        window.__etude.SR.srtState = { name: 'idle', mode: 'firstSight', attemptId: null, fingerprint: value };
        window.__etude.srDraw();
      }, secondTabFingerprint);
      await page.locator('#rd-go').click();
      await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.mode)).toBe('practice');
      await expect(page.locator('#rd-srt-notice')).toHaveText(
        await page.evaluate(() => window.__etude.t('rd_srt_error_already_exposed')),
      );
    } finally {
      await secondTab.close();
    }
  });

  test('reports fresh unwritable storage without stale-generation messaging', async ({ app }) => {
    const page = app.page;
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      window.__srtOriginalSetItem = original;
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === 'etude-sight-v1') throw new DOMException('blocked', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await app.open({ hash: 'read', dock: true });
    await page.locator('#rdt-pieces').click();
    await page.locator('#rd-mode button[data-v="assess"]').click();
    await page.locator('#rd-gen').click();
    await page.locator('#rd-go').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('countIn');
    await expect(page.locator('#rd-srt-notice')).toHaveText(
      await page.evaluate(() => window.__etude.t('rd_srt_error_storage')),
    );
    await expect(page.locator('#rd-srt-notice')).not.toContainText(
      await page.evaluate(() => window.__etude.t('rd_srt_error_stale_generation')),
    );
    expect(await page.evaluate(() => window.__etude.SR.srtState.mode)).toBe('practice');
    await page.evaluate(() => {
      Storage.prototype.setItem = window.__srtOriginalSetItem;
      window.__etude.panic();
    });
  });

  test('rerolls a deterministic recent fingerprint collision on the production path', async ({ app }) => {
    const page = await openRead(app);
    await page.locator('#rd-mode button[data-v="assess"]').click();
    await page.evaluate(() => {
      const seeds = [0, 1, 21];
      Object.defineProperty(crypto, 'getRandomValues', {
        configurable: true,
        value: (values) => {
          values[0] = seeds.shift() ?? 0;
          return values;
        },
      });
    });
    const fingerprints = [];
    for (let index = 0; index < 3; index++) {
      await page.locator('#rd-gen').click();
      fingerprints.push(await page.evaluate(() => window.__etude.SR.srtFingerprint));
    }
    expect(fingerprints[0]).toBe('v1:984ee4a0b92a5baa');
    expect(fingerprints[2]).not.toBe(fingerprints[0]);
    expect(new Set(fingerprints).size).toBe(3);
  });
});

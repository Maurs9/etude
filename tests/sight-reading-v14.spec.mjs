import { test, expect } from './fixtures.mjs';

async function openAssessGenerator(app) {
  const page = await app.open({ hash: 'read', dock: true });
  await page.locator('#rdt-pieces').click();
  await page.locator('#rd-mode button[data-v="assess"]').click();
  await page.locator('#rd-gen').click();
  await expect(page.locator('#rd-go')).toBeFocused();
  return page;
}

async function blockedPendingSave(app) {
  const page = await openAssessGenerator(app);
  await page.clock.install();
  await page.locator('#rd-go').click();
  await expect(page.locator('#rd-srt-preview')).toBeVisible();
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
  return page;
}

async function pendingSnapshot(page) {
  return page.evaluate(async () => {
    const api = window.__etude;
    const ledger = api.srtReadLedger(localStorage);
    return {
      state: api.SR.srtState.name,
      fingerprint: api.SR.srtFingerprint,
      panelHidden: document.querySelector('#rd-srt-pending')?.hidden ?? true,
      pendingAttempt: api.SR.srtPendingAttempt?.attemptId ?? null,
      evaluation: JSON.stringify(api.SR.srtEvaluation),
      resultValue: api.SR.srtResultValue,
      claims: Object.values(ledger.exposures).filter((exposure) => exposure.claim).length,
      statuses: Object.values(ledger.attempts).map((attempt) => attempt.status),
      heldAttemptLocks: (await navigator.locks.query()).held
        .filter((lock) => lock.name.startsWith('etude-sight-attempt-')).length,
      lease: !!api.SR.srtLease,
    };
  });
}

async function restoreStorage(page) {
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__srtOriginalSetItem;
  });
}

test.describe('Sight-reading iteration 14 regressions', () => {
  test('keeps pendingSave recoverable across failed Retry and Continue writes', async ({ app }) => {
    const page = await blockedPendingSave(app);
    const languages = ['en', 'ro', 'es', 'fr', 'de', 'it', 'pt-BR'];
    for (const language of languages) {
      await page.evaluate((value) => window.__etude.setLang(value), language);
      await page.locator('#rd-srt-retry').click();
      const expected = await page.evaluate(() => window.__etude.t('rd_srt_error_pending_storage'));
      await expect(page.locator('#rd-srt-notice')).toHaveText(expected);
      expect(await pendingSnapshot(page)).toMatchObject({
        state: 'pendingSave',
        panelHidden: false,
        claims: 1,
        heldAttemptLocks: 1,
        lease: true,
      });
    }

    await page.locator('#rd-srt-continue').click();
    await expect(page.locator('#rd-srt-notice')).toHaveText(
      await page.evaluate(() => window.__etude.t('rd_srt_error_pending_storage')),
    );
    expect(await pendingSnapshot(page)).toMatchObject({
      state: 'pendingSave',
      panelHidden: false,
      claims: 1,
      heldAttemptLocks: 1,
      lease: true,
    });

    await restoreStorage(page);
    await page.locator('#rd-srt-retry').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('saved');
    await expect(page.locator('#rd-srt-pending')).toBeHidden();
    await expect(page.locator('#rd-srt-notice')).toBeHidden();
    expect(await pendingSnapshot(page)).toMatchObject({
      state: 'saved',
      pendingAttempt: null,
      claims: 0,
      heldAttemptLocks: 0,
      lease: false,
      statuses: ['completed'],
    });
  });

  test('keeps Read navigation pendingSave visible until abandonment succeeds', async ({ app }) => {
    const page = await blockedPendingSave(app);
    const fingerprint = await page.evaluate(() => window.__etude.SR.srtFingerprint);
    await page.locator('#rdt-stats').click();
    await expect.poll(() => pendingSnapshot(page)).toMatchObject({
      state: 'pendingSave',
      fingerprint,
      panelHidden: false,
      claims: 1,
      heldAttemptLocks: 1,
      lease: true,
    });
    await expect(page.locator('#rdp-pieces')).toBeVisible();

    await restoreStorage(page);
    await page.locator('#rd-srt-continue').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('abandoned');
    await page.locator('#rdt-stats').click();
    await expect(page.locator('#rdp-stats')).toBeVisible();
    expect(await pendingSnapshot(page)).toMatchObject({
      state: 'abandoned',
      claims: 0,
      heldAttemptLocks: 0,
      lease: false,
    });
  });

  test('keeps app navigation pendingSave visible when leaving Read fails', async ({ app }) => {
    const page = await blockedPendingSave(app);
    await page.evaluate(() => window.__etude.show('explore'));
    await expect.poll(() => pendingSnapshot(page)).toMatchObject({
      state: 'pendingSave',
      panelHidden: false,
      claims: 1,
      heldAttemptLocks: 1,
      lease: true,
    });
    await expect(page.locator('#view-read')).toHaveClass(/active/);

    await restoreStorage(page);
    await page.locator('#rd-srt-continue').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('abandoned');
    await page.evaluate(() => window.__etude.show('explore'));
    await expect(page.locator('#view-explore')).toHaveClass(/active/);
  });

  test('keeps generation pendingSave protected and retries the requested Generate after recovery', async ({ app }) => {
    const page = await blockedPendingSave(app);
    const before = await pendingSnapshot(page);
    await page.locator('#rd-gen').click();
    await expect.poll(() => pendingSnapshot(page)).toMatchObject({
      state: 'pendingSave',
      fingerprint: before.fingerprint,
      panelHidden: false,
      claims: 1,
      heldAttemptLocks: 1,
      lease: true,
    });

    await restoreStorage(page);
    await page.locator('#rd-gen').click();
    await expect.poll(() => page.evaluate(() => ({
      state: window.__etude.SR.srtState.name,
      fingerprint: window.__etude.SR.srtFingerprint,
      claims: Object.values(window.__etude.srtReadLedger(localStorage).exposures)
        .filter((exposure) => exposure.claim).length,
    }))).toMatchObject({ state: 'idle', claims: 0 });
    const after = await page.evaluate(() => ({
      fingerprint: window.__etude.SR.srtFingerprint,
      claims: Object.values(window.__etude.srtReadLedger(localStorage).exposures)
        .filter((exposure) => exposure.claim).length,
    }));
    expect(after.fingerprint).not.toBe(before.fingerprint);
    await expect(page.locator('#rd-srt-pending')).toBeHidden();
  });

  test('generates a fresh fingerprint on every Generate and after reload', async ({ app }) => {
    const page = await openAssessGenerator(app);
    const fingerprints = [];
    for (let index = 0; index < 4; index++) {
      fingerprints.push(await page.evaluate(() => window.__etude.SR.srtFingerprint));
      await page.locator('#rd-gen').click();
    }
    expect(new Set(fingerprints).size).toBe(fingerprints.length);

    await page.reload();
    await page.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));
    await page.locator('#rdt-pieces').click();
    await page.locator('#rd-mode button[data-v="assess"]').click();
    await page.locator('#rd-gen').click();
    const afterReload = await page.evaluate(() => window.__etude.SR.srtFingerprint);
    expect(afterReload).not.toBe(fingerprints.at(-1));
  });

  test('records Learn exposure and makes the later Assess run practice', async ({ app }) => {
    const page = await app.open({ hash: 'read' });
    await page.locator('#rdt-pieces').click();
    await page.locator('#rd-mode button[data-v="learn"]').click();
    await page.locator('#rd-gen').click();
    const fingerprint = await page.evaluate(() => window.__etude.SR.srtFingerprint);
    await expect.poll(() => page.evaluate((value) =>
      window.__etude.srtReadLedger(localStorage).exposures[value]?.reason ?? null, fingerprint)).toBe('learn');
    expect(await page.locator('#rd-staff .ss-n').count()).toBeGreaterThan(0);

    await page.locator('#rd-mode button[data-v="assess"]').click();
    await expect(page.locator('#rd-srt-notice')).toHaveText(
      await page.evaluate(() => window.__etude.t('rd_srt_error_already_exposed')),
    );
    await page.locator('#rd-go').click();
    await expect.poll(() => page.evaluate(() => ({
      name: window.__etude.SR.srtState.name,
      mode: window.__etude.SR.srtState.mode,
    }))).toEqual({ name: 'countIn', mode: 'practice' });
  });

  test('records Assess-to-Learn reveal and keeps the later run out of first sight', async ({ app }) => {
    const page = await openAssessGenerator(app);
    const fingerprint = await page.evaluate(() => window.__etude.SR.srtFingerprint);
    expect(await page.locator('#rd-staff .ss-n').count()).toBe(0);
    await page.locator('#rd-mode button[data-v="learn"]').click();
    await expect.poll(() => page.evaluate((value) =>
      window.__etude.srtReadLedger(localStorage).exposures[value]?.reason ?? null, fingerprint)).toBe('learn');
    expect(await page.locator('#rd-staff .ss-n').count()).toBeGreaterThan(0);

    await page.locator('#rd-mode button[data-v="assess"]').click();
    await page.locator('#rd-go').click();
    await expect.poll(() => page.evaluate(() => ({
      name: window.__etude.SR.srtState.name,
      mode: window.__etude.SR.srtState.mode,
    }))).toEqual({ name: 'countIn', mode: 'practice' });
    await expect(page.locator('#rd-srt-preview')).toBeHidden();
  });

  test('reselects a generated piece without exposing an unclaimed score', async ({ app }) => {
    const page = await openAssessGenerator(app);
    await page.locator('#rd-piece').selectOption('w5rh');
    expect(await page.locator('#rd-staff .ss-n').count()).toBeGreaterThan(0);
    await page.locator('#rd-piece').selectOption('gen');
    expect(await page.locator('#rd-staff .ss-n').count()).toBe(0);
    await page.locator('#rd-go').click();
    await expect(page.locator('#rd-srt-preview')).toBeVisible();
    expect(await page.locator('#rd-staff .ss-n').count()).toBeGreaterThan(0);
  });

  test('records Listen exposure and explains the practice fallback', async ({ app }) => {
    const page = await openAssessGenerator(app);
    await page.clock.install();
    const fingerprint = await page.evaluate(() => window.__etude.SR.srtFingerprint);
    await page.locator('#rd-listen').click();
    await expect.poll(() => page.evaluate((value) =>
      window.__etude.srtReadLedger(localStorage).exposures[value]?.reason ?? null, fingerprint)).toBe('listen');
    await page.locator('#rd-listen').click();

    await page.locator('#rd-go').click();
    await expect.poll(() => page.evaluate(() => ({
      name: window.__etude.SR.srtState.name,
      mode: window.__etude.SR.srtState.mode,
    }))).toEqual({ name: 'countIn', mode: 'practice' });
    await expect(page.locator('#rd-srt-notice')).toHaveText(
      await page.evaluate(() => window.__etude.t('rd_srt_error_already_exposed')),
    );
  });

  test('honors exposure written by a second tab before Assess starts', async ({ app }) => {
    const page = await openAssessGenerator(app);
    const fingerprint = await page.evaluate(() => window.__etude.SR.srtFingerprint);
    const tabB = await page.context().newPage();
    try {
      await tabB.goto(page.url());
      await tabB.waitForFunction(() => typeof window.__etude?.srtLedgerUpdate === 'function');
      await tabB.evaluate((value) => {
        const api = window.__etude;
        const ledger = api.srtReadLedger(localStorage);
        return api.srtLedgerUpdate(localStorage, {
          type: 'recordExposure',
          fingerprint: value,
          reason: 'learn',
          generation: ledger.generation,
        });
      }, fingerprint);
      await page.locator('#rd-go').click();
      await expect.poll(() => page.evaluate(() => ({
        name: window.__etude.SR.srtState.name,
        mode: window.__etude.SR.srtState.mode,
      }))).toEqual({ name: 'countIn', mode: 'practice' });
      await expect(page.locator('#rd-srt-notice')).toHaveText(
        await page.evaluate(() => window.__etude.t('rd_srt_error_already_exposed')),
      );
    } finally {
      await tabB.close();
    }
  });

  test('localizes the already-exposed practice explanation in every locale', async ({ app }) => {
    const page = await openAssessGenerator(app);
    const fingerprint = await page.evaluate(() => window.__etude.SR.srtFingerprint);
    await page.evaluate((value) => {
      const api = window.__etude;
      const ledger = api.srtReadLedger(localStorage);
      return api.srtLedgerUpdate(localStorage, {
        type: 'recordExposure',
        fingerprint: value,
        reason: 'listen',
        generation: ledger.generation,
      });
    }, fingerprint);

    for (const language of ['en', 'ro', 'es', 'fr', 'de', 'it', 'pt-BR']) {
      await page.evaluate((value) => window.__etude.setLang(value), language);
      await page.locator('#rd-go').click();
      await expect.poll(() => page.evaluate(() => ({
        name: window.__etude.SR.srtState.name,
        mode: window.__etude.SR.srtState.mode,
      }))).toEqual({ name: 'countIn', mode: 'practice' });
      await expect(page.locator('#rd-srt-notice')).toHaveText(
        await page.evaluate(() => window.__etude.t('rd_srt_error_already_exposed')),
      );
      await page.evaluate((value) => {
        const api = window.__etude;
        api.panic();
        api.SR.srtState = { name: 'idle', mode: 'firstSight', attemptId: null, fingerprint: value };
        api.srDraw();
      }, fingerprint);
    }
  });
});

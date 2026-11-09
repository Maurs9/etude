import { test, expect } from '../../helpers/fixtures.mjs';

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
    window.__srtLedgerFailureWrites = 0;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === 'etude-sight-v1') {
        window.__srtLedgerFailureWrites++;
        throw new DOMException('blocked', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
}

async function restoreLedger(page) {
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__srtOriginalSetItem;
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
  return page;
}

async function exposeInjected(page, mode, seed) {
  await page.evaluate(({ mode: value, seed: injectedSeed }) => {
    window.__etude.RD.L = window.__etude.RD_LV.sr1;
    window.__etude.rdSightStart(value, injectedSeed);
  }, { mode, seed });
  await page.waitForFunction(() => Boolean(window.__etude.SR.srtFingerprint));
  return page.evaluate(() => window.__etude.SR.srtFingerprint);
}

async function finishCurrentAssess(page) {
  await page.clock.install();
  await page.locator('#rd-go').click();
  await expect.poll(() => page.evaluate(() => window.__etude.SR.active)).toBe(true);
  await page.evaluate(() => window.__etude.srAssessFinish());
  await expect.poll(() => page.evaluate(() => Boolean(window.__etude.SR.srtEvaluation))).toBe(true);
}

test.describe('Sight-reading iteration 16 regressions', () => {
  test('consumes eligible content before Learn can reveal it, including round trips and direct draws', async ({ app }) => {
    const page = await openAssessGenerator(app);
    const fingerprint = await page.evaluate(() => window.__etude.SR.srtFingerprint);
    expect(await page.locator('#rd-staff .ss-n').count()).toBe(0);
    expect(await page.evaluate(() => Object.keys(window.__etude.srtReadLedger(localStorage).exposures))).toHaveLength(0);

    await page.locator('#rd-piece').selectOption('w5rh');
    await page.locator('#rd-mode button[data-v="learn"]').click();
    await page.locator('#rd-piece').selectOption('gen');
    await expect.poll(() => page.evaluate((value) => {
      const api = window.__etude;
      const exposure = api.srtReadLedger(localStorage).exposures[value];
      return {
        state: api.SR.srtState.name,
        mode: api.SR.srtState.mode,
        reason: exposure?.reason ?? null,
        exposureCount: Object.keys(api.srtReadLedger(localStorage).exposures).length,
        notes: document.querySelectorAll('#rd-staff .ss-n').length,
      };
    }, fingerprint)).toEqual({
      state: 'idle',
      mode: 'practice',
      reason: 'learn',
      exposureCount: 1,
      notes: expect.any(Number),
    });
    expect(await page.locator('#rd-staff .ss-n').count()).toBeGreaterThan(0);

    await page.locator('#rd-mode button[data-v="assess"]').click();
    await page.locator('#rd-go').click();
    await expect.poll(() => page.evaluate(() => ({
      name: window.__etude.SR.srtState.name,
      mode: window.__etude.SR.srtState.mode,
    }))).toEqual({ name: 'countIn', mode: 'practice' });
    await expect(page.locator('#rd-srt-preview')).toBeHidden();
    await expect(page.locator('#rd-srt-notice')).toHaveText(
      await page.evaluate(() => window.__etude.t('rd_srt_error_already_exposed')),
    );

    const direct = await openAssessGenerator(app);
    await direct.evaluate(() => {
      const api = window.__etude;
      api.SR.modeSel = 'learn';
      api.srDraw();
    });
    await expect.poll(() => direct.evaluate(() => ({
      mode: window.__etude.SR.srtState.mode,
      reason: window.__etude.srtReadLedger(localStorage).exposures[window.__etude.SR.srtFingerprint]?.reason ?? null,
      notes: document.querySelectorAll('#rd-staff .ss-n').length,
    }))).toMatchObject({ mode: 'practice', reason: 'learn' });
    expect(await direct.locator('#rd-staff .ss-n').count()).toBeGreaterThan(0);

    const learnRoundTrip = await openRead(app);
    await learnRoundTrip.locator('#rd-mode button[data-v="learn"]').click();
    await learnRoundTrip.locator('#rd-gen').click();
    const learnFingerprint = await learnRoundTrip.evaluate(() => window.__etude.SR.srtFingerprint);
    await learnRoundTrip.locator('#rd-piece').selectOption('w5rh');
    await learnRoundTrip.locator('#rd-piece').selectOption('gen');
    await expect.poll(() => learnRoundTrip.evaluate((value) => ({
      mode: window.__etude.SR.srtState.mode,
      reason: window.__etude.srtReadLedger(localStorage).exposures[value]?.reason ?? null,
    }), learnFingerprint)).toEqual({ mode: 'practice', reason: 'learn' });
  });

  test('does not show a prior-use notice for fresh Learn generations', async ({ app }) => {
    const page = await openRead(app);
    await page.locator('#rd-mode button[data-v="learn"]').click();
    const ready = await page.evaluate(() => window.__etude.t('rdx_sr_ready'));

    await page.locator('#rd-gen').click();
    await expect(page.locator('#rd-verdict')).toHaveText(ready);
    await expect(page.locator('#rd-srt-notice')).toBeHidden();
    const first = await page.evaluate(() => window.__etude.SR.srtFingerprint);

    await page.locator('#rd-gen').click();
    await expect(page.locator('#rd-verdict')).toHaveText(ready);
    await expect(page.locator('#rd-srt-notice')).toBeHidden();
    const second = await page.evaluate(() => window.__etude.SR.srtFingerprint);
    expect(second).not.toBe(first);

    await page.locator('#rd-piece').selectOption('w5rh');
    await page.locator('#rd-piece').selectOption('gen');
    await expect(page.locator('#rd-srt-notice')).toHaveText(
      await page.evaluate(() => window.__etude.t('rd_srt_error_already_exposed')),
    );
    await page.locator('#rd-mode button[data-v="assess"]').click();
    await expect(page.locator('#rd-srt-notice')).toHaveText(
      await page.evaluate(() => window.__etude.t('rd_srt_error_already_exposed')),
    );
  });

  test('retries stale claims without burning the piece as practice', async ({ app }) => {
    const page = await openAssessGenerator(app);
    const fingerprint = await page.evaluate(() => window.__etude.SR.srtFingerprint);

    await page.evaluate(() => {
      let release;
      window.__releaseSightLedgerLock = () => release?.();
      window.__ledgerLockReady = new Promise((resolve) => {
        void navigator.locks.request('etude-sight-ledger-v1', { mode: 'exclusive' }, async () => {
          resolve();
          await new Promise((unlock) => { release = unlock; });
        });
      });
      return window.__ledgerLockReady;
    });
    await page.locator('#rd-go').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('claiming');
    await page.evaluate(() => {
      const api = window.__etude;
      const ledger = api.srtReadLedger(localStorage);
      localStorage.setItem('etude-sight-v1', JSON.stringify({
        ...ledger,
        generation: ledger.generation + '-other-tab',
        revision: ledger.revision + 1,
      }));
      window.__releaseSightLedgerLock();
    });

    await expect.poll(() => page.evaluate(() => ({
      name: window.__etude.SR.srtState.name,
      mode: window.__etude.SR.srtState.mode,
      attemptId: window.__etude.SR.srtState.attemptId,
      concealed: document.querySelector('#rd-staff')?.getAttribute('aria-hidden'),
      notice: document.querySelector('#rd-srt-notice')?.textContent ?? '',
      exposures: Object.values(window.__etude.srtReadLedger(localStorage).exposures),
    }))).toMatchObject({
      name: 'idle',
      mode: 'firstSight',
      attemptId: null,
      concealed: 'true',
      notice: await page.evaluate(() => window.__etude.t('rd_srt_error_stale_generation')),
    });
    expect(await page.evaluate(() => Object.values(window.__etude.srtReadLedger(localStorage).exposures)
      .filter((exposure) => exposure.reason === 'practice'))).toHaveLength(0);
    expect(await page.evaluate((value) => window.__etude.SR.srtFingerprint, fingerprint)).toBe(fingerprint);

    await page.locator('#rd-go').click();
    await expect(page.locator('#rd-srt-preview')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('preview');
  });

  test('uses the practice fallback explanation for other-tab exposure and quota', async ({ app }) => {
    const page = await openAssessGenerator(app);
    const fingerprint = await page.evaluate(() => window.__etude.SR.srtFingerprint);
    const otherTab = await page.context().newPage();
    try {
      await otherTab.goto(page.url());
      await otherTab.waitForFunction(() => typeof window.__etude?.srtLedgerUpdate === 'function');
      await otherTab.evaluate((value) => {
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
      await otherTab.close();
    }

    const quota = await openAssessGenerator(app);
    await quota.evaluate(() => {
      const api = window.__etude;
      const ledger = api.srtReadLedger(localStorage);
      const exposures = Object.fromEntries(Array.from({ length: 4096 }, (_, index) => [
        `v1:quota-${index}`,
        { firstSeenAt: index, reason: 'listen' },
      ]));
      localStorage.setItem('etude-sight-v1', JSON.stringify({ ...ledger, exposures }));
    });
    await quota.locator('#rd-go').click();
    await expect.poll(() => quota.evaluate(() => ({
      name: window.__etude.SR.srtState.name,
      mode: window.__etude.SR.srtState.mode,
    }))).toEqual({ name: 'countIn', mode: 'practice' });
    await expect(quota.locator('#rd-srt-notice')).toHaveText(
      await quota.evaluate(() => window.__etude.t('rd_srt_error_quota')),
    );
  });

  test('keeps refused selections and Generate actions refused after Retry or Continue', async ({ app }) => {
    const retry = await startPendingSave(app);
    const before = await retry.evaluate(() => ({
      evaluation: JSON.stringify(window.__etude.SR.srtEvaluation),
      value: window.__etude.SR.srtResultValue,
      fingerprint: window.__etude.SR.srtFingerprint,
    }));
    await retry.locator('#rd-piece').selectOption('w5rh');
    await expect(retry.locator('#rd-piece')).toHaveValue('gen');
    await restoreLedger(retry);
    await retry.locator('#rd-srt-retry').click();
    await expect.poll(() => retry.evaluate(() => window.__etude.SR.srtState.name)).toBe('saved');
    await expect.poll(() => retry.evaluate(() => ({
      model: window.__etude.SR.piece?.id,
      control: document.querySelector('#rd-piece')?.value,
      evaluation: JSON.stringify(window.__etude.SR.srtEvaluation),
      value: window.__etude.SR.srtResultValue,
      fingerprint: window.__etude.SR.srtFingerprint,
    }))).toEqual({ model: 'gen', control: 'gen', ...before });

    const continued = await startPendingSave(app);
    const continuedFingerprint = await continued.evaluate(() => window.__etude.SR.srtFingerprint);
    await continued.evaluate(() => { window.__srtLedgerFailureWrites = 0; });
    await continued.locator('#rd-piece').selectOption('w5rh');
    await expect.poll(() => continued.evaluate(() => window.__srtLedgerFailureWrites)).toBeGreaterThan(0);
    await continued.evaluate(() => { window.__srtLedgerFailureWrites = 0; });
    await continued.locator('#rd-gen').click();
    await expect(continued.locator('#rd-piece')).toHaveValue('gen');
    await expect.poll(() => continued.evaluate(() => window.__srtLedgerFailureWrites)).toBeGreaterThan(0);
    await restoreLedger(continued);
    await continued.locator('#rd-srt-continue').click();
    await expect.poll(() => continued.evaluate(() => ({
      name: window.__etude.SR.srtState.name,
      model: window.__etude.SR.piece?.id,
      control: document.querySelector('#rd-piece')?.value,
      fingerprint: window.__etude.SR.srtFingerprint,
    }))).toEqual({
      name: 'abandoned',
      model: 'gen',
      control: 'gen',
      fingerprint: continuedFingerprint,
    });

    const immediate = await startPendingSave(app);
    await restoreLedger(immediate);
    await immediate.locator('#rd-piece').selectOption('w5rh');
    await expect.poll(() => immediate.evaluate(() => ({
      model: window.__etude.SR.piece?.id,
      control: document.querySelector('#rd-piece')?.value,
    }))).toEqual({ model: 'w5rh', control: 'w5rh' });
  });

  test('derives result badges from the displayed piece and actual attempt', async ({ app }) => {
    const freshRepertoire = await openRead(app);
    await freshRepertoire.locator('#rd-mode button[data-v="assess"]').click();
    await freshRepertoire.locator('#rd-piece').selectOption('w5rh');
    await finishCurrentAssess(freshRepertoire);
    for (const language of ['en', 'ro']) {
      await freshRepertoire.evaluate((value) => window.__etude.setLang(value), language);
      await expect(freshRepertoire.locator('#rd-verdict')).not.toContainText(
        await freshRepertoire.evaluate(() => window.__etude.t('rd_srt_first_sight')),
      );
    }

    const retained = await openAssessGenerator(app);
    await retained.locator('#rd-piece').selectOption('w5rh');
    await finishCurrentAssess(retained);
    await expect(retained.locator('#rd-verdict')).not.toContainText(
      await retained.evaluate(() => window.__etude.t('rd_srt_first_sight')),
    );

    const firstSight = await openAssessGenerator(app);
    await firstSight.clock.install();
    await firstSight.locator('#rd-go').click();
    await firstSight.locator('#rd-srt-start').click();
    await firstSight.clock.runFor(5000);
    await expect.poll(() => firstSight.evaluate(() => window.__etude.SR.srtState.name)).toBe('playing');
    await firstSight.evaluate(() => window.__etude.srAssessFinish());
    await expect.poll(() => firstSight.evaluate(() => window.__etude.SR.srtState.name)).toBe('saved');
    for (const language of ['en', 'ro']) {
      await firstSight.evaluate((value) => window.__etude.setLang(value), language);
      await expect(firstSight.locator('#rd-verdict')).toContainText(
        await firstSight.evaluate(() => window.__etude.t('rd_srt_first_sight')),
      );
    }

    const practice = await openRead(app);
    await practice.locator('#rd-mode button[data-v="learn"]').click();
    await practice.locator('#rd-gen').click();
    await practice.locator('#rd-mode button[data-v="assess"]').click();
    await finishCurrentAssess(practice);
    await expect(practice.locator('#rd-verdict')).toContainText(
      await practice.evaluate(() => window.__etude.t('rd_srt_practice_badge')),
    );
  });
});

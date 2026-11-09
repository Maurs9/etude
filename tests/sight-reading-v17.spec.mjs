import { test, expect } from './fixtures.mjs';

async function openRead(app) {
  const page = await app.open({ hash: 'read', dock: true });
  await page.locator('#rdt-pieces').click();
  return page;
}

async function openFixedAssess(app, seed) {
  const page = await openRead(app);
  await page.locator('#rd-mode button[data-v="assess"]').click();
  await page.locator('#rd-gen').click();
  await page.evaluate((value) => {
    const api = window.__etude;
    api.RD.L = api.RD_LV.sr1;
    api.rdSightStart('test', value);
  }, seed);
  await expect.poll(() => page.evaluate(() => ({
    name: window.__etude.SR.srtState.name,
    mode: window.__etude.SR.srtState.mode,
  }))).toEqual({ name: 'idle', mode: 'firstSight' });
  return page;
}

async function gateAttemptLocks(page) {
  await page.evaluate(() => {
    const nativeRequest = navigator.locks.request.bind(navigator.locks);
    const pending = [];
    window.__srtAttemptGateQueue = pending;
    window.__releaseSrtAttemptGate = () => {
      navigator.locks.request = nativeRequest;
      while (pending.length) {
        const request = pending.shift();
        nativeRequest(request.name, request.options, request.callback).then(request.resolve, request.reject);
      }
    };
    navigator.locks.request = (name, options, callback) => {
      if (!name.startsWith('etude-sight-attempt-'))
        return nativeRequest(name, options, callback);
      return new Promise((resolve, reject) => {
        pending.push({ name, options, callback, resolve, reject });
      });
    };
  });
}

async function releaseAttemptLocks(page) {
  await page.evaluate(() => window.__releaseSrtAttemptGate());
}

async function ledgerSnapshot(page, fingerprint) {
  return page.evaluate((value) => {
    const api = window.__etude;
    const ledger = api.srtReadLedger(localStorage);
    const exposure = ledger.exposures[value] ?? null;
    return {
      state: api.SR.srtState,
      staffHidden: document.querySelector('#rd-staff')?.getAttribute('aria-hidden') ?? null,
      exposure,
      exposureCount: Object.keys(ledger.exposures).length,
      attemptCount: Object.keys(ledger.attempts).length,
      claims: Object.values(ledger.exposures).filter((entry) => entry.claim).length,
    };
  }, fingerprint);
}

async function assertNoAttemptLocks(page) {
  await expect.poll(() => page.evaluate(async () =>
    (await navigator.locks.query()).held.filter((lock) => lock.name.startsWith('etude-sight-attempt-')).length,
  )).toBe(0);
}

async function prepareAnalysisSelection(page) {
  await page.evaluate(() => window.__etude.show('analysis'));
  await expect(page.locator('#view-analysis')).toHaveClass(/active/);
  await page.locator('#an-example').selectOption('twinkle');
  await expect.poll(() => page.evaluate(() => window.__etude.AN.notes.length)).toBeGreaterThan(0);
  await page.evaluate(() => {
    const api = window.__etude;
    api.AN.selected = new Set([0, 1, 2, 3]);
    api.anSelectionChanged();
  });
}

test.describe('Sight-reading iteration 17 regressions', () => {
  test('keeps the retained Assess generation eligible when Analysis opens an excerpt', async ({ app }) => {
    const page = await openFixedAssess(app, 17017);
    const fingerprint = await page.evaluate(() => window.__etude.SR.srtFingerprint);
    expect(await page.locator('#rd-staff')).toHaveAttribute('aria-hidden', 'true');
    expect(await page.locator('#rd-staff .ss-n').count()).toBe(0);

    await prepareAnalysisSelection(page);
    const practice = page.locator('#an-practice');
    if (await practice.isVisible() && await practice.isEnabled())
      await practice.click();
    else
      await page.evaluate(() => window.__etude.anPractice());

    await expect(page).toHaveURL(/#read$/);
    await expect(page.locator('#rd-piece')).toHaveValue('excerpt');
    await expect(page.locator('#rd-staff')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#rd-go')).toBeFocused();
    await expect(page.locator('#rd-verdict')).toHaveText(
      await page.evaluate(() => window.__etude.t('rd_excerpt_ready')),
    );
    expect(await page.locator('#rd-staff .ss-n').count()).toBeGreaterThan(0);
    expect(await page.evaluate((value) => {
      const api = window.__etude;
      const exposure = api.srtReadLedger(localStorage).exposures[value];
      return {
        piece: api.SR.piece?.id,
        mode: api.SR.modeSel,
        state: api.SR.srtState,
        exposure,
      };
    }, fingerprint)).toEqual({
      piece: 'excerpt',
      mode: 'learn',
      state: {
        name: 'idle',
        mode: 'firstSight',
        attemptId: null,
        fingerprint,
      },
      exposure: undefined,
    });

    await page.locator('#rd-mode button[data-v="assess"]').click();
    await page.locator('#rd-piece').selectOption('gen');
    await expect(page.locator('#rd-staff')).toHaveAttribute('aria-hidden', 'true');
    await page.locator('#rd-go').click();
    await expect(page.locator('#rd-srt-preview')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('preview');
    expect(await page.evaluate((value) => {
      const exposure = window.__etude.srtReadLedger(localStorage).exposures[value];
      return { reason: exposure?.reason ?? null, claimed: !!exposure?.claim };
    }, fingerprint)).toEqual({ reason: 'first-sight', claimed: true });
    await page.evaluate(() => window.__etude.panic());
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('interrupted');
    await assertNoAttemptLocks(page);
  });

  test('turning on Learn while the attempt lease is gated records a coherent exposure', async ({ app }) => {
    const page = await openRead(app);
    for (const seed of [17018, 17019, 17020]) {
      await page.evaluate(() => localStorage.removeItem('etude-sight-v1'));
      await page.reload();
      await page.waitForFunction(() => typeof window.__etude?.show === 'function');
      await page.locator('#rdt-pieces').click();
      await page.locator('#rd-mode button[data-v="assess"]').click();
      await page.locator('#rd-gen').click();
      await page.evaluate((value) => {
        const api = window.__etude;
        api.RD.L = api.RD_LV.sr1;
        api.rdSightStart('test', value);
      }, seed);
      const fingerprint = await page.evaluate(() => window.__etude.SR.srtFingerprint);
      await gateAttemptLocks(page);
      await page.locator('#rd-go').click();
      await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('claiming');
      await expect.poll(() => page.evaluate(() => window.__srtAttemptGateQueue.length)).toBe(1);
      expect(await ledgerSnapshot(page, fingerprint)).toMatchObject({
        state: { name: 'claiming', mode: 'firstSight' },
        staffHidden: 'true',
        exposure: null,
        exposureCount: 0,
        attemptCount: 0,
        claims: 0,
      });

      await page.locator('#rd-mode button[data-v="learn"]').click();
      await expect.poll(async () => ledgerSnapshot(page, fingerprint)).toMatchObject({
        state: { name: 'idle', mode: 'practice', attemptId: null, fingerprint },
        staffHidden: 'false',
        exposure: { reason: 'learn' },
        exposureCount: 1,
        attemptCount: 0,
        claims: 0,
      });

      await releaseAttemptLocks(page);
      await assertNoAttemptLocks(page);
      await expect.poll(async () => ledgerSnapshot(page, fingerprint)).toMatchObject({
        state: { name: 'idle', mode: 'practice', attemptId: null, fingerprint },
        exposure: { reason: 'learn' },
        exposureCount: 1,
        attemptCount: 0,
        claims: 0,
      });

      await page.reload();
      await page.waitForFunction(() => typeof window.__etude?.show === 'function');
      await page.locator('#rdt-pieces').click();
      await page.locator('#rd-mode button[data-v="assess"]').click();
      await page.evaluate((value) => {
        const api = window.__etude;
        api.RD.L = api.RD_LV.sr1;
        api.rdSightStart('test', value);
      }, seed);
      await page.locator('#rd-go').click();
      await expect.poll(() => page.evaluate(() => ({
        name: window.__etude.SR.srtState.name,
        mode: window.__etude.SR.srtState.mode,
      }))).toEqual({ name: 'countIn', mode: 'practice' });
      await expect(page.locator('#rd-srt-preview')).toBeHidden();
      await page.evaluate(() => window.__etude.panic());
      await assertNoAttemptLocks(page);
    }
  });

  test('cancelling before the attempt lease is granted keeps Assess concealed and eligible', async ({ app }) => {
    const page = await openFixedAssess(app, 17021);
    const fingerprint = await page.evaluate(() => window.__etude.SR.srtFingerprint);
    await gateAttemptLocks(page);
    await page.locator('#rd-go').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('claiming');
    await expect.poll(() => page.evaluate(() => window.__srtAttemptGateQueue.length)).toBe(1);

    await page.evaluate(() => window.__etude.panic());
    await expect.poll(async () => ledgerSnapshot(page, fingerprint)).toMatchObject({
      state: { name: 'idle', mode: 'firstSight', attemptId: null, fingerprint },
      staffHidden: 'true',
      exposure: null,
      exposureCount: 0,
      attemptCount: 0,
      claims: 0,
    });

    await releaseAttemptLocks(page);
    await assertNoAttemptLocks(page);
    await expect.poll(async () => ledgerSnapshot(page, fingerprint)).toMatchObject({
      state: { name: 'idle', mode: 'firstSight', attemptId: null, fingerprint },
      staffHidden: 'true',
      exposure: null,
      exposureCount: 0,
      attemptCount: 0,
      claims: 0,
    });

    await page.locator('#rd-go').click();
    await expect(page.locator('#rd-srt-preview')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('preview');
    await page.evaluate(() => window.__etude.panic());
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('interrupted');
    await assertNoAttemptLocks(page);
    expect(await page.evaluate((value) => {
      const ledger = window.__etude.srtReadLedger(localStorage);
      const exposure = ledger.exposures[value];
      return {
        exposureReason: exposure?.reason ?? null,
        hasClaim: !!exposure?.claim,
        attempts: Object.values(ledger.attempts).map((attempt) => attempt.status),
      };
    }, fingerprint)).toEqual({
      exposureReason: 'first-sight',
      hasClaim: false,
      attempts: ['interrupted'],
    });
  });
});

import { test, expect } from './fixtures.mjs';

async function openRead(app) {
  const page = await app.open({ hash: 'read' });
  await page.locator('#rdt-pieces').click();
  await page.locator('#rd-mode button[data-v="assess"]').click();
  await page.locator('#rd-gen').click();
  return page;
}

test.describe('Sight-Reading ledger browser integration', () => {
  test('atomically grants one of two tabs the same exposure claim', async ({ app }) => {
    const page = await openRead(app);
    const tabB = await page.context().newPage();
    await tabB.goto(page.url());
    await tabB.waitForFunction(() => typeof window.__etude?.srtLedgerUpdate === 'function');
    const result = await page.evaluate(async () => {
      const generation = window.__etude.srtReadLedger(localStorage).generation;
      return window.__etude.srtLedgerUpdate(localStorage, {
        type: 'claimExposure', fingerprint: 'v1:two-tabs', attemptId: 'attempt-a', ownerTabId: 'tab-a', generation,
      });
    });
    const resultB = await tabB.evaluate(async () => {
      const generation = window.__etude.srtReadLedger(localStorage).generation;
      return window.__etude.srtLedgerUpdate(localStorage, {
        type: 'claimExposure', fingerprint: 'v1:two-tabs', attemptId: 'attempt-b', ownerTabId: 'tab-b', generation,
      });
    });
    expect([result.ok, resultB.ok].sort()).toEqual([false, true]);
    expect([result.reason, resultB.reason].filter(Boolean)).toEqual(['already_exposed']);
    await tabB.close();
  });

  test('protects an active pending attempt from orphan recovery and rejects stale generations', async ({ app }) => {
    const page = await openRead(app);
    const tabB = await page.context().newPage();
    await tabB.goto(page.url());
    await tabB.waitForFunction(() => typeof window.__etude?.srtLedgerUpdate === 'function');
    const setup = await page.evaluate(async () => {
      const api = window.__etude;
      const ledger = api.srtReadLedger(localStorage);
      const lease = api.srtAcquireAttemptLease('active-attempt');
      await lease.ready;
      window.__testLease = lease;
      return api.srtLedgerUpdate(localStorage, {
        type: 'claimExposure', fingerprint: 'v1:active', attemptId: 'active-attempt', ownerTabId: 'tab-a', generation: ledger.generation,
      });
    });
    expect(setup.ok).toBe(true);
    const recovered = await tabB.evaluate(async () => {
      const ledger = window.__etude.srtReadLedger(localStorage);
      return window.__etude.srtLedgerUpdate(localStorage, { type: 'recoverOrphanClaims', generation: ledger.generation });
    });
    expect(recovered.ok).toBe(true);
    expect(await page.evaluate(() => window.__etude.srtReadLedger(localStorage).exposures['v1:active'].claim)).toBeTruthy();
    const reset = await tabB.evaluate(() => window.__etude.srtLedgerUpdate(localStorage, { type: 'resetLedger' }));
    expect(reset.ok).toBe(true);
    const stale = await page.evaluate(async () => window.__etude.srtLedgerUpdate(localStorage, {
      type: 'recordExposure', fingerprint: 'v1:stale', reason: 'listen', generation: 'old-generation',
    }));
    expect(stale).toEqual({ ok: false, reason: 'stale_generation' });
    await page.evaluate(() => window.__testLease.release());
    await tabB.close();
  });

  test('preserves a newer ledger byte-for-byte and keeps practice usable with an explanation', async ({ app }) => {
    const page = await openRead(app);
    const newer = JSON.stringify({ schemaVersion: 2, marker: 'future', exposures: { future: true } });
    const result = await page.evaluate(async (raw) => {
      localStorage.setItem('etude-sight-v1', raw);
      const before = localStorage.getItem('etude-sight-v1');
      window.__etude.SR.srtState = { name: 'idle', mode: 'firstSight', attemptId: null, fingerprint: window.__etude.SR.srtFingerprint };
      await window.__etude.srtStartFirstSight();
      return {
        before,
        after: localStorage.getItem('etude-sight-v1'),
        state: window.__etude.SR.srtState.name,
        notice: document.querySelector('#rd-srt-notice')?.textContent,
      };
    }, newer);
    expect(result.after).toBe(result.before);
    expect(result.state).toBe('countIn');
    expect(result.notice).toContain('newer');
  });

  test('enforces exposure and attempt limits without silent overflow', async ({ app }) => {
    const page = await openRead(app);
    const result = await page.evaluate(async () => {
      const api = window.__etude;
      const ledger = api.srtCreateLedger();
      const exposures = Object.fromEntries(Array.from({ length: 4096 }, (_, index) => [
        `v1:${index}`, { firstSeenAt: index, reason: 'listen' },
      ]));
      localStorage.setItem('etude-sight-v1', JSON.stringify({ ...ledger, exposures }));
      const exposure = await api.srtLedgerUpdate(localStorage, {
        type: 'recordExposure', fingerprint: 'v1:overflow', reason: 'listen', generation: ledger.generation,
      });
      return { exposure, count: Object.keys(api.srtReadLedger(localStorage).exposures).length };
    });
    expect(result.exposure).toEqual({ ok: false, reason: 'quota' });
    expect(result.count).toBe(4096);
  });

  test('disables claiming without Web Locks while keeping the practice path available', async ({ app }) => {
    const page = await openRead(app);
    const result = await page.evaluate(async () => {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
      const generation = window.__etude.srtReadLedger(localStorage).generation;
      const claim = await window.__etude.srtLedgerUpdate(localStorage, {
        type: 'claimExposure', fingerprint: 'v1:no-locks', attemptId: 'no-locks', ownerTabId: 'tab', generation,
      });
      window.__etude.SR.srtState = { name: 'idle', mode: 'firstSight', attemptId: null, fingerprint: window.__etude.SR.srtFingerprint };
      await window.__etude.srtStartFirstSight();
      return {
        claim,
        state: window.__etude.SR.srtState.name,
        hasNotice: document.querySelector('#rd-srt-notice')?.textContent ?? '',
      };
    });
    expect(result.claim).toEqual({ ok: false, reason: 'unsupported' });
    expect(result.state).toBe('countIn');
    expect(result.hasNotice).toContain('Web Locks');
  });
});

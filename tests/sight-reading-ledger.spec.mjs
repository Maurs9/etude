import { test, expect } from './fixtures.mjs';

async function openRead(app) {
  const page = await app.open({ hash: 'read' });
  await page.locator('#rdt-pieces').click();
  await page.locator('#rd-mode button[data-v="assess"]').click();
  await page.locator('#rd-gen').click();
  return page;
}

function emptyAttempt(overrides = {}) {
  return {
    attemptId: 'attempt-1',
    fingerprint: 'v1:test',
    ownerTabId: 'tab-a',
    generation: 'gen-a',
    status: 'completed',
    finishedAt: 1,
    scoringVersion: 1,
    N: 0,
    TP: 0,
    FP: 0,
    FN: 0,
    G: 0,
    Q: 0,
    lateOrEarlyCount: 0,
    restViolations: 0,
    pitchPrecision: null,
    pitchRecall: null,
    pitchF1: null,
    rhythmAcc: null,
    score: null,
    stars: 0,
    perfect: false,
    meanOffsetMs: null,
    meanAbsoluteOffsetMs: null,
    noteResults: [],
    extraInputs: [],
    ...overrides,
  };
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
      const attempt = index => ({
        attemptId: `attempt-${index}`, fingerprint: `v1:attempt-${index}`, ownerTabId: 'tab-a',
        generation: ledger.generation, status: 'completed', finishedAt: index, scoringVersion: 1,
        N: 0, TP: 0, FP: 0, FN: 0, G: 0, Q: 0, lateOrEarlyCount: 0, restViolations: 0,
        pitchPrecision: null, pitchRecall: null, pitchF1: null, rhythmAcc: null, score: null,
        stars: 0, perfect: false, meanOffsetMs: null, meanAbsoluteOffsetMs: null,
        noteResults: [], extraInputs: [],
      });
      const attempts = Object.fromEntries(Array.from({ length: 500 }, (_, index) => [
        `attempt-${index}`, attempt(index),
      ]));
      const boundedLedger = { ...ledger, attempts, exposures: {} };
      localStorage.setItem('etude-sight-v1', JSON.stringify(boundedLedger));
      const claim = await api.srtLedgerUpdate(localStorage, {
        type: 'claimExposure', fingerprint: 'v1:attempt-500', attemptId: 'attempt-500',
        ownerTabId: 'tab-a', generation: ledger.generation,
      });
      const terminal = await api.srtLedgerUpdate(localStorage, {
        type: 'finishAttempt', attempt: attempt(500), generation: ledger.generation,
      });
      const after = api.srtReadLedger(localStorage);
      return {
        exposure,
        exposureCount: Object.keys(exposures).length,
        claim,
        terminal,
        attemptCount: Object.keys(after.attempts).length,
        keptNewest: !!after.attempts['attempt-500'],
        trimmedOldest: !after.attempts['attempt-0'],
      };
    });
    expect(result.exposure).toEqual({ ok: false, reason: 'quota' });
    expect(result.exposureCount).toBe(4096);
    expect(result.claim.ok).toBe(true);
    expect(result.terminal.ok).toBe(true);
    expect(result.attemptCount).toBe(500);
    expect(result.keptNewest).toBe(true);
    expect(result.trimmedOldest).toBe(true);
  });

  test('takes the attempt lock before the short ledger lock and releases the ledger lock', async ({ app }) => {
    const page = await openRead(app);
    await page.evaluate(() => {
      const nativeRequest = navigator.locks.request.bind(navigator.locks);
      window.__lockEvents = [];
      navigator.locks.request = (name, options, callback) => {
        window.__lockEvents.push(`request:${name}`);
        return nativeRequest(name, options, async lock => {
          window.__lockEvents.push(`acquire:${name}`);
          try {
            return await callback(lock);
          } finally {
            window.__lockEvents.push(`release:${name}`);
          }
        });
      };
    });
    await page.locator('#rd-go').click();
    await expect(page.locator('#rd-srt-preview')).toBeVisible();
    const result = await page.evaluate(async () => ({
      events: window.__lockEvents,
      held: (await navigator.locks.query()).held.map(lock => lock.name),
    }));
    const attemptRequest = result.events.findIndex(event => event.startsWith('request:etude-sight-attempt-'));
    const ledgerRequest = result.events.indexOf('request:etude-sight-ledger-v1');
    expect(attemptRequest).toBeGreaterThanOrEqual(0);
    expect(ledgerRequest).toBeGreaterThan(attemptRequest);
    expect(result.events).toContain('release:etude-sight-ledger-v1');
    expect(result.held.some(name => name.startsWith('etude-sight-attempt-'))).toBe(true);
    expect(result.held).not.toContain('etude-sight-ledger-v1');
  });

  test('makes terminal retries idempotent and rejects an owner mismatch', async ({ app }) => {
    const page = await openRead(app);
    const result = await page.evaluate(async base => {
      const api = window.__etude;
      const ledger = api.srtReadLedger(localStorage);
      const attempt = { ...base, generation: ledger.generation };
      const claim = await api.srtLedgerUpdate(localStorage, {
        type: 'claimExposure', fingerprint: attempt.fingerprint, attemptId: attempt.attemptId,
        ownerTabId: attempt.ownerTabId, generation: ledger.generation,
      });
      const first = await api.srtLedgerUpdate(localStorage, {
        type: 'finishAttempt', attempt, generation: ledger.generation,
      });
      const revision = api.srtReadLedger(localStorage).revision;
      const retry = await api.srtLedgerUpdate(localStorage, {
        type: 'finishAttempt', attempt, generation: ledger.generation,
      });
      const retryRevision = api.srtReadLedger(localStorage).revision;
      const mismatched = { ...attempt, attemptId: 'attempt-wrong-owner', fingerprint: 'v1:wrong-owner', ownerTabId: 'tab-b' };
      const ownerMismatch = await api.srtLedgerUpdate(localStorage, {
        type: 'finishAttempt', attempt: mismatched, generation: ledger.generation,
      });
      return { claim, first, retry, revision, retryRevision, ownerMismatch };
    }, emptyAttempt());
    expect(result.claim.ok).toBe(true);
    expect(result.first.ok).toBe(true);
    expect(result.retry).toEqual(result.first);
    expect(result.retryRevision).toBe(result.revision);
    expect(result.ownerMismatch).toEqual({ ok: false, reason: 'owner_mismatch' });
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

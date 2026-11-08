import { describe, expect, it } from 'vitest';
import {
  SRT_MAX_ATTEMPTS,
  SRT_MAX_EXPOSURES,
  srtCreateLedger,
  srtLedgerUpdate,
  srtReadLedger,
} from '../src/sight-reading/ledger.ts';

class MemoryStorage {
  constructor(value = null) {
    this.value = value;
  }
  getItem() {
    return this.value;
  }
  setItem(_key, value) {
    this.value = value;
  }
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

describe('sight-reading iteration 4 ledger invariants', () => {
  it('accepts an identical terminal retry but rejects a conflicting retry', async () => {
    const storage = new MemoryStorage();
    const ledger = srtCreateLedger();
    const attempt = emptyAttempt({ generation: ledger.generation });
    storage.setItem('etude-sight-v1', JSON.stringify({
      ...ledger,
      exposures: {
        [attempt.fingerprint]: {
          firstSeenAt: 1,
          reason: 'first-sight',
          claim: { attemptId: attempt.attemptId, ownerTabId: attempt.ownerTabId, generation: ledger.generation },
        },
      },
    }));
    const first = await srtLedgerUpdate(storage, { type: 'finishAttempt', attempt, generation: ledger.generation });
    const retry = await srtLedgerUpdate(storage, { type: 'finishAttempt', attempt, generation: ledger.generation });
    const conflict = await srtLedgerUpdate(storage, {
      type: 'finishAttempt',
      attempt: { ...attempt, stars: 1 },
      generation: ledger.generation,
    });
    expect(first.ok).toBe(true);
    expect(retry).toEqual(first);
    expect(conflict).toMatchObject({ ok: false, reason: 'conflict' });
  });

  it('rejects stale imports after the local generation changes', async () => {
    const storage = new MemoryStorage();
    const original = srtCreateLedger();
    storage.setItem('etude-sight-v1', JSON.stringify(original));
    const reset = await srtLedgerUpdate(storage, { type: 'resetLedger' });
    expect(reset.ok).toBe(true);
    const current = srtReadLedger(storage);
    const imported = await srtLedgerUpdate(storage, {
      type: 'importLedger',
      imported: original,
      generation: original.generation,
    });
    expect(current.generation).not.toBe(original.generation);
    expect(imported).toMatchObject({ ok: false, reason: 'stale_generation' });
  });

  it('persists interrupted terminal state and clears the claim', async () => {
    const storage = new MemoryStorage();
    const ledger = srtCreateLedger();
    const exposure = {
      firstSeenAt: 1,
      reason: 'first-sight',
      claim: { attemptId: 'attempt-interrupted', ownerTabId: 'tab-a', generation: ledger.generation },
    };
    storage.setItem('etude-sight-v1', JSON.stringify({ ...ledger, exposures: { 'v1:test': exposure } }));
    const result = await srtLedgerUpdate(storage, {
      type: 'abandonAttempt',
      attemptId: 'attempt-interrupted',
      ownerTabId: 'tab-a',
      generation: ledger.generation,
      status: 'interrupted',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ledger.attempts['attempt-interrupted'].status).toBe('interrupted');
      expect(result.ledger.exposures['v1:test'].claim).toBeUndefined();
    }
  });

  it('enforces exposure and attempt limits without silent overflow', async () => {
    const storage = new MemoryStorage();
    const ledger = srtCreateLedger();
    const exposures = Object.fromEntries(Array.from({ length: SRT_MAX_EXPOSURES }, (_, index) => [
      `v1:${index}`,
      { firstSeenAt: index, reason: 'listen' },
    ]));
    storage.setItem('etude-sight-v1', JSON.stringify({ ...ledger, exposures }));
    const exposureResult = await srtLedgerUpdate(storage, {
      type: 'recordExposure',
      fingerprint: 'v1:overflow',
      reason: 'listen',
      generation: ledger.generation,
    });
    expect(exposureResult).toMatchObject({ ok: false, reason: 'quota' });

    const attempts = Object.fromEntries(Array.from({ length: SRT_MAX_ATTEMPTS }, (_, index) => [
      `attempt-${index}`,
      emptyAttempt({ attemptId: `attempt-${index}`, fingerprint: `v1:${index}`, generation: ledger.generation, finishedAt: index }),
    ]));
    const bounded = { ...ledger, attempts };
    storage.setItem('etude-sight-v1', JSON.stringify(bounded));
    const invalid = srtReadLedger(storage);
    expect(Object.keys(invalid.attempts).length).toBe(SRT_MAX_ATTEMPTS);
  });
});

import { describe, expect, it } from 'vitest';
import {
  SRT_LEDGER_KEY,
  srtCreateLedger,
  srtLedgerUpdate,
  srtReadLedger,
} from '../src/sight-reading/ledger.ts';

function storageWith(value) {
  const values = new Map([[SRT_LEDGER_KEY, JSON.stringify(value)]]);
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, next) => values.set(key, next),
  };
}

function attempt({ attemptId, fingerprint, ownerTabId, generation, status = 'completed', finishedAt = 10 } = {}) {
  return {
    attemptId,
    fingerprint,
    ownerTabId,
    generation,
    status,
    finishedAt,
    scoringVersion: 1,
    N: 1,
    TP: 1,
    FP: 0,
    FN: 0,
    G: 1,
    Q: 0,
    lateOrEarlyCount: 0,
    restViolations: 0,
    pitchPrecision: 1,
    pitchRecall: 1,
    pitchF1: 100,
    rhythmAcc: 100,
    score: 100,
    stars: 3,
    perfect: true,
    meanOffsetMs: 0,
    meanAbsoluteOffsetMs: 0,
    noteResults: [{ expectedId: 'n', classification: 'good', matchedInputId: 'i', errorMs: 0 }],
    extraInputs: [],
  };
}

function claimedLedger() {
  const ledger = srtCreateLedger();
  return {
    ...ledger,
    exposures: {
      'v1:test': {
        firstSeenAt: 1,
        reason: 'first-sight',
        claim: { attemptId: 'attempt-1', ownerTabId: 'tab-1', generation: ledger.generation },
      },
    },
  };
}

describe('sight-reading ledger lifecycle', () => {
  it('accepts an identical terminal retry after the claim was cleared', async () => {
    const initial = claimedLedger();
    const storage = storageWith(initial);
    const savedAttempt = attempt({
      attemptId: 'attempt-1',
      fingerprint: 'v1:test',
      ownerTabId: 'tab-1',
      generation: initial.generation,
    });
    const first = await srtLedgerUpdate(storage, { type: 'finishAttempt', attempt: savedAttempt, generation: initial.generation });
    const second = await srtLedgerUpdate(storage, { type: 'finishAttempt', attempt: savedAttempt, generation: initial.generation });
    const conflict = await srtLedgerUpdate(storage, {
      type: 'finishAttempt',
      attempt: { ...savedAttempt, finishedAt: 11 },
      generation: initial.generation,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(conflict).toEqual({ ok: false, reason: 'conflict' });
  });

  it('rejects an import from the generation that a reset replaced', async () => {
    const oldLedger = srtCreateLedger();
    const storage = storageWith(oldLedger);
    const reset = await srtLedgerUpdate(storage, { type: 'resetLedger' });
    expect(reset.ok).toBe(true);
    const imported = await srtLedgerUpdate(storage, {
      type: 'importLedger',
      imported: oldLedger,
      generation: oldLedger.generation,
    });
    expect(imported).toEqual({ ok: false, reason: 'stale_generation' });
  });

  it('persists interrupted claims as terminal interrupted attempts', async () => {
    const initial = claimedLedger();
    const storage = storageWith(initial);
    const result = await srtLedgerUpdate(storage, {
      type: 'abandonAttempt',
      attemptId: 'attempt-1',
      ownerTabId: 'tab-1',
      status: 'interrupted',
      generation: initial.generation,
    });
    const ledger = srtReadLedger(storage);
    expect(result.ok).toBe(true);
    expect(ledger.attempts['attempt-1'].status).toBe('interrupted');
    expect(ledger.exposures['v1:test'].claim).toBeUndefined();
  });

  it('turns imported unfinished claims into abandoned attempts', async () => {
    const local = srtCreateLedger();
    const imported = srtCreateLedger();
    const importedAttempt = attempt({
      attemptId: 'attempt-imported',
      fingerprint: 'v1:imported',
      ownerTabId: 'tab-import',
      generation: imported.generation,
    });
    const importedLedger = {
      ...imported,
      attempts: { [importedAttempt.attemptId]: importedAttempt },
      exposures: {
        'v1:imported': {
          firstSeenAt: 2,
          reason: 'first-sight',
          claim: { attemptId: importedAttempt.attemptId, ownerTabId: importedAttempt.ownerTabId, generation: imported.generation },
        },
      },
    };
    const storage = storageWith(local);
    const result = await srtLedgerUpdate(storage, {
      type: 'importLedger',
      imported: importedLedger,
      generation: local.generation,
    });
    expect(result.ok).toBe(true);
    expect(srtReadLedger(storage).attempts['attempt-imported'].status).toBe('abandoned');
    expect(srtReadLedger(storage).exposures['v1:imported'].claim).toBeUndefined();
  });
});

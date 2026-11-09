import { describe, expect, it } from 'vitest';
import { isBackupPayload } from '../src/domain/storage.ts';
import {
  SRT_LEDGER_KEY,
  isSightReadingLedger,
  srtCreateLedger,
  srtLedgerExport,
  srtReadLedger,
} from '../src/sight-reading/ledger.ts';
import { SightReadingRecorder, srtInputFamily } from '../src/sight-reading/recorder.ts';

function storageWith(value) {
  const values = new Map([[SRT_LEDGER_KEY, JSON.stringify(value)]]);
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, next) => values.set(key, next),
  };
}

function validAttempt(overrides = {}) {
  return {
    attemptId: 'attempt-v7',
    fingerprint: 'v1:v7',
    ownerTabId: 'tab-v7',
    generation: 'generation-v7',
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
    pitchPrecision: 0,
    pitchRecall: 0,
    pitchF1: 0,
    rhythmAcc: 0,
    score: 0,
    stars: 0,
    perfect: false,
    meanOffsetMs: null,
    meanAbsoluteOffsetMs: null,
    noteResults: [],
    extraInputs: [],
    mixedInput: false,
    ...overrides,
  };
}

describe('Sight-Reading iteration 7 mixed-input contracts', () => {
  it('classifies the four supported source families', () => {
    expect(srtInputFamily('midi')).toBe('midi');
    expect(srtInputFamily('ble')).toBe('ble');
    expect(srtInputFamily('typing:KeyA')).toBe('keyboard');
    expect(srtInputFamily('pointer:1')).toBe('pointer');
    expect(srtInputFamily('srClick')).toBeNull();
  });

  it('tracks only in-window physical source families', () => {
    const recorder = new SightReadingRecorder({ durationMs: 1000 });
    recorder.record('on', 60, 'typing:KeyA', null, -251);
    recorder.record('on', 60, 'typing:KeyA', null, 0);
    recorder.record('on', 62, 'midi', null, 10);
    recorder.record('on', 64, 'srClick', null, 20);
    expect(recorder.sourceFamilies).toEqual(['keyboard', 'midi']);
    expect(recorder.mixedInput).toBe(true);
  });

  it('validates, normalizes, and exports mixedInput in ledger attempts', () => {
    const ledger = srtCreateLedger();
    const withAttempt = {
      ...ledger,
      attempts: { 'attempt-v7': validAttempt({ generation: ledger.generation, mixedInput: true }) },
    };
    expect(isSightReadingLedger(withAttempt)).toBe(true);
    expect(isBackupPayload({ v: 3, data: { sightLedger: withAttempt } })).toBe(true);
    expect(isBackupPayload({
      v: 3,
      data: { sightLedger: { ...withAttempt, attempts: { 'attempt-v7': validAttempt({ generation: ledger.generation, mixedInput: 'yes' }) } } },
    })).toBe(false);

    const oldAttempt = { ...validAttempt({ generation: ledger.generation }) };
    delete oldAttempt.mixedInput;
    const oldLedger = { ...ledger, attempts: { 'attempt-v7': oldAttempt } };
    const storage = storageWith(oldLedger);
    expect(srtReadLedger(storage).attempts['attempt-v7'].mixedInput).toBe(false);
    expect(srtLedgerExport(srtReadLedger(storage)).attempts['attempt-v7'].mixedInput).toBe(false);
  });
});

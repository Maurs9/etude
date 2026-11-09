import { describe, expect, it } from 'vitest';
import { srtEvaluate } from '../src/sight-reading/evaluate.ts';
import { srtGenerate } from '../src/sight-reading/generator.ts';
import { isBackupPayload } from '../src/domain/storage.ts';
import { srtCreateLedger } from '../src/sight-reading/ledger.ts';

const expected = [
  { id: 'a', midi: 60, hand: 'rh', onMs: 0, offMs: 400, restBeforeMs: 0, restAfterMs: 1200 },
  { id: 'b', midi: 62, hand: 'rh', onMs: 400, offMs: 800, restBeforeMs: 0, restAfterMs: 800 },
  { id: 'c', midi: 64, hand: 'rh', onMs: 800, offMs: 1200, restBeforeMs: 0, restAfterMs: 400 },
  { id: 'd', midi: 65, hand: 'rh', onMs: 1200, offMs: 1600, restBeforeMs: 0, restAfterMs: 0 },
];

function exact(value) {
  return { status: 'ok', scoringVersion: 1, N: 4, ...value };
}

function inputsWithOffsets(offsets = [0, 0, 0, 0]) {
  return expected.map((note, index) => ({
    id: `i-${note.id}`,
    midi: note.midi,
    onMs: note.onMs + offsets[index],
  }));
}

function noteResults(classifications, errors = [0, 0, 0, 0]) {
  return expected.map((note, index) => ({
    expectedId: note.id,
    classification: classifications[index],
    matchedInputId: classifications[index] === 'missed' ? null : `i-${note.id}`,
    errorMs: classifications[index] === 'missed' ? null : errors[index],
  }));
}

describe('sight-reading iteration 4 acceptance vectors', () => {
  it('returns the complete perfect vector', () => {
    expect(srtEvaluate(expected, inputsWithOffsets())).toEqual(exact({
      TP: 4, FP: 0, FN: 0, G: 4, Q: 0, lateOrEarlyCount: 0, restViolations: 0,
      pitchPrecision: 1, pitchRecall: 1, pitchF1: 100, rhythmAcc: 100, score: 100, stars: 3, perfect: true,
      meanOffsetMs: 0, meanAbsoluteOffsetMs: 0,
      noteResults: noteResults(['good', 'good', 'good', 'good']),
      extraInputs: [],
    }));
  });

  it('returns the complete substitution vector', () => {
    expect(srtEvaluate(expected, [
      { id: 'i-a', midi: 60, onMs: 0 },
      { id: 'i-b', midi: 62, onMs: 400 },
      { id: 'i-c', midi: 64, onMs: 800 },
      { id: 'i-x', midi: 67, onMs: 1200 },
    ])).toEqual(exact({
      TP: 3, FP: 1, FN: 1, G: 3, Q: 0, lateOrEarlyCount: 0, restViolations: 0,
      pitchPrecision: 0.75, pitchRecall: 0.75, pitchF1: 75, rhythmAcc: 75, score: 75, stars: 1, perfect: false,
      meanOffsetMs: 0, meanAbsoluteOffsetMs: 0,
      noteResults: [
        ...noteResults(['good', 'good', 'good', 'missed']),
      ],
      extraInputs: [{ id: 'i-x', midi: 67, onMs: 1200 }],
    }));
  });

  it('returns the complete extra, near, late, and silence vectors', () => {
    const perfect = inputsWithOffsets();
    expect(srtEvaluate(expected, [...perfect, { id: 'extra', midi: 70, onMs: 600 }])).toEqual(exact({
      TP: 4, FP: 1, FN: 0, G: 4, Q: 0, lateOrEarlyCount: 0, restViolations: 0,
      pitchPrecision: 0.8, pitchRecall: 1, pitchF1: 88.88888888888889, rhythmAcc: 100, score: 88.88888888888889, stars: 2, perfect: false,
      meanOffsetMs: 0, meanAbsoluteOffsetMs: 0,
      noteResults: noteResults(['good', 'good', 'good', 'good']),
      extraInputs: [{ id: 'extra', midi: 70, onMs: 600 }],
    }));
    expect(srtEvaluate(expected, inputsWithOffsets([0, 0, 0, 140]))).toEqual(exact({
      TP: 4, FP: 0, FN: 0, G: 3, Q: 1, lateOrEarlyCount: 0, restViolations: 0,
      pitchPrecision: 1, pitchRecall: 1, pitchF1: 100, rhythmAcc: 87.5, score: 87.5, stars: 2, perfect: false,
      meanOffsetMs: 35, meanAbsoluteOffsetMs: 35,
      noteResults: noteResults(['good', 'good', 'good', 'near'], [0, 0, 0, 140]),
      extraInputs: [],
    }));
    expect(srtEvaluate(expected, inputsWithOffsets([0, 0, 0, 220]))).toEqual(exact({
      TP: 4, FP: 0, FN: 0, G: 3, Q: 0, lateOrEarlyCount: 1, restViolations: 0,
      pitchPrecision: 1, pitchRecall: 1, pitchF1: 100, rhythmAcc: 75, score: 75, stars: 1, perfect: false,
      meanOffsetMs: 55, meanAbsoluteOffsetMs: 55,
      noteResults: noteResults(['good', 'good', 'good', 'lateOrEarly'], [0, 0, 0, 220]),
      extraInputs: [],
    }));
    expect(srtEvaluate(expected, [])).toEqual(exact({
      TP: 0, FP: 0, FN: 4, G: 0, Q: 0, lateOrEarlyCount: 0, restViolations: 0,
      pitchPrecision: 0, pitchRecall: 0, pitchF1: 0, rhythmAcc: 0, score: 0, stars: 0, perfect: false,
      meanOffsetMs: null, meanAbsoluteOffsetMs: null,
      noteResults: noteResults(['missed', 'missed', 'missed', 'missed']),
      extraInputs: [],
    }));
  });

  it('strictly rejects malformed sightLedger backup values', () => {
    const ledger = srtCreateLedger();
    expect(isBackupPayload({ v: 3, data: { sightLedger: ledger } })).toBe(true);
    expect(isBackupPayload({ v: 3, data: { sightLedger: { ...ledger, generation: 42 } } })).toBe(false);
    expect(isBackupPayload({ v: 3, data: { sightLedger: { ...ledger, prefs: [] } } })).toBe(false);
    expect(isBackupPayload({ v: 3, data: { sightLedger: { ...ledger, sessions: [] } } })).toBe(false);
    expect(isBackupPayload({ v: 3, data: { sightLedger: { ...ledger, attempts: [] } } })).toBe(false);
    expect(isBackupPayload({ v: 3, data: { sightLedger: { ...ledger, exposures: [] } } })).toBe(false);
    expect(isBackupPayload({ v: 3, data: { sightLedger: { ...ledger, attempts: { bad: { status: 'completed' } } } } })).toBe(false);
    expect(isBackupPayload({ v: 3, data: { sightLedger: { ...ledger, exposures: { bad: { firstSeenAt: 'now', reason: 'listen' } } } } })).toBe(false);
  });
});

describe('sight-reading iteration 4 generator invariants', () => {
  const profiles = {
    'P1.a': { meter: 4, min: 60, max: 67, leap: 1, rests: false, repeat: false },
    'P1.b': { meter: 4, min: 60, max: 67, leap: 2, rests: false, repeat: false },
    'P1.c': { meter: 4, min: 60, max: 67, leap: 2, rests: false, repeat: true },
    'P2.a': { meter: 4, min: 60, max: 67, leap: 2, rests: true, repeat: false },
    'P2.b': { meter: 3, min: 60, max: 67, leap: 2, rests: true, repeat: false },
    'P2.c': { meter: 4, min: 60, max: 72, leap: 2, rests: true, repeat: false },
  };
  const scale = [0, 2, 4, 5, 7, 9, 11];
  const scaleIndex = (midi) => Math.floor(midi / 12) * 7 + scale.indexOf(((midi % 12) + 12) % 12);

  it('checks every invariant independently across all 12,000 pieces', () => {
    for (const [profile, config] of Object.entries(profiles)) {
      for (const hand of ['rh', 'lh']) {
        const offset = hand === 'rh' ? 0 : -12;
        const min = config.min + offset;
        const max = config.max + offset;
        for (let seed = 0; seed < 1000; seed += 1) {
          const piece = srtGenerate(profile, seed, hand);
          const barTicks = config.meter * 480;
          expect(piece.meter.num).toBe(config.meter);
          expect(piece.events.at(0)?.onsetTick).toBe(0);
          expect(piece.events.at(0)?.pitches.length).toBeGreaterThan(0);
          for (let bar = 0; bar < 4; bar += 1) {
            const events = piece.events.filter((event) => event.onsetTick >= bar * barTicks && event.onsetTick < (bar + 1) * barTicks);
            expect(events.length).toBeGreaterThan(0);
            expect(events.reduce((sum, event) => sum + event.durationTick, 0)).toBe(barTicks);
            expect(events.at(-1).onsetTick + events.at(-1).durationTick).toBe((bar + 1) * barTicks);
            for (const event of events) {
              expect(event.onsetTick + event.durationTick).toBeLessThanOrEqual((bar + 1) * barTicks);
              for (const pitch of event.pitches) {
                expect(pitch.midi).toBeGreaterThanOrEqual(min);
                expect(pitch.midi).toBeLessThanOrEqual(max);
              }
            }
          }
          const pitched = piece.events.filter((event) => event.pitches.length > 0);
          expect(pitched.at(-1).pitches[0].midi).toBe(min);
          expect(pitched.at(-1).durationTick).toBe(960);
          let previous = null;
          let first = true;
          let restCount = 0;
          let repeat = false;
          for (const event of piece.events) {
            if (event.pitches.length === 0) {
              restCount += 1;
              continue;
            }
            const pitch = event.pitches[0];
            if (previous !== null) {
              expect(Math.abs(scaleIndex(pitch.midi) - scaleIndex(previous))).toBeLessThanOrEqual(config.leap);
              repeat ||= pitch.midi === previous;
            }
            expect(pitch.finger).toBe(profile === 'P2.c' || !first ? null : 1);
            previous = pitch.midi;
            first = false;
          }
          expect(restCount > 0).toBe(config.rests);
          if (config.repeat)
            expect(repeat).toBe(true);
        }
      }
    }
  }, 30000);
});

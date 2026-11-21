import { describe, expect, it } from 'vitest';
import { aggregateDifficultyStars, estimateScoreDifficulty } from '../../src/domain/score-difficulty.ts';
import { levelPieceToDifficultyInput } from '../../src/sight-reading/difficulty.ts';
import { srtGenerateLevelPiece, srtTransposeLevelPiece } from '../../src/sight-reading/melody.ts';
import { srtLevel } from '../../src/sight-reading/levels.ts';
import { srtLevelDurationMs } from '../../src/sight-reading/score.ts';

function note(start, midi = 60, hand = 'rh', extra = {}) {
  return { start, end: start + 0.2, startSec: start / 2, midi, hand, ...extra };
}

function timeline(notes, bars = 1, extra = {}) {
  const measures = Array.from({ length: bars }, (_, i) => ({
    start: i * 4, end: (i + 1) * 4, startSec: i * 2, endSec: (i + 1) * 2,
    groups: [1, 1, 1, 1], writtenIndex: i, fifths: 0,
  }));
  return { measures, notes, rests: [], tempoSource: 'written', voiceSource: 'written', ...extra };
}

const performance = input => estimateScoreDifficulty(input, 'performance');
const structural = input => estimateScoreDifficulty(input, 'sightReading');
const regular = (count, start, hand) => Array.from({ length: count }, (_, i) => note(start + i / count, 60, hand));

describe('experimental difficulty estimate', () => {
  it('keeps an even rating, respects a difficult bottleneck, and bounds the endurance bonus', () => {
    const easy = { motor: 1, rhythm: 1, bimanual: 1, texture: 1, reading: 1 };
    const even = Object.fromEntries(Object.keys(easy).map(key => [key, 3]));
    expect(aggregateDifficultyStars(even)).toBe(3);
    expect(aggregateDifficultyStars({ ...easy, motor: 4.6 })).toBe(3.6);
    expect(aggregateDifficultyStars({ ...easy, motor: 5 })).toBe(4);
    expect(aggregateDifficultyStars({ ...easy, motor: 5 }, 6)).toBe(4.5);
    expect(performance(timeline([])).difficultyStars).toBeNull();
  });

  it('reports separate decisive measures for fast attacks and chord texture', () => {
    const fast = Array.from({ length: 16 }, (_, index) => note(index / 4, index % 2 ? 84 : 60));
    const wide = [48, 55, 60, 67, 76].map(midi => note(20, midi));
    const estimate = performance(timeline([...fast, ...wide], 6));
    expect(estimate.axisDifficulty.motor.measures).toContain(1);
    expect(estimate.axisDifficulty.texture.measures).toContain(6);
    expect(estimate.axisDifficulty.texture.measures).not.toContain(1);
    for (const value of [estimate.difficultyStars, ...Object.values(estimate.axisDifficulty).map(axis => axis.stars)]) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(5);
      expect(Math.round(value * 10) / 10).toBe(value);
    }
  });
  it('finds four difficult measures even when the median of a 100-measure piece stays easy', () => {
    const easy = Array.from({ length: 100 }, (_, i) => note(i * 4));
    const difficult = easy.filter(n => n.start < 48 * 4 || n.start >= 52 * 4);
    for (let bar = 48; bar < 52; bar++) {
      for (let i = 0; i < 12; i++) difficult.push(note(bar * 4 + i / 3, i % 2 ? 84 : 60));
    }
    const baseline = performance(timeline(easy, 100));
    const changed = performance(timeline(difficult, 100));
    expect(changed.typical).toBe(baseline.typical);
    expect(changed.peak.score).toBeGreaterThan(baseline.peak.score * 2);
    expect(changed.peak.writtenMeasures.every(n => n >= 49 && n <= 53)).toBe(true);
  });

  it('charges a large transition to the destination at a repeat jump across a window boundary', () => {
    const source = [
      note(0), note(4), note(8), note(12), note(15.75), note(16), note(20),
    ];
    const plain = timeline(source, 6);
    const jumped = timeline(source.map(n => n.start >= 16 ? { ...n, midi: 84 } : n), 6);
    jumped.measures[4].writtenIndex = 0;
    jumped.measures[5].writtenIndex = 1;
    const result = performance(jumped);
    expect(result.peak.score).toBeGreaterThan(performance(plain).peak.score);
    expect(result.peak.writtenMeasures).toContain(1);
    expect(result.peak.endMeasure).toBeGreaterThanOrEqual(5);
  });

  it('keeps exactly simultaneous notes as one motor attack and separates chord stretch', () => {
    const melody = [0, 1, 2, 3].map(start => note(start, 60, 'rh', { end: start + 1 }));
    const chords = melody.flatMap(n => [n, { ...n, midi: 64 }, { ...n, midi: 67 }]);
    const mono = performance(timeline(melody));
    const close = performance(timeline(chords));
    const wide = performance(timeline(chords.map(n => n.midi === 67 ? { ...n, midi: 74 } : n)));
    expect(close.peak.attacks).toBe(mono.peak.attacks);
    expect(close.peak.axes.motor).toBe(mono.peak.axes.motor);
    expect(wide.peak.axes.texture).toBeGreaterThan(close.peak.axes.texture);
    expect(performance(timeline([note(0), note(0.01, 64)])).peak.attacks).toBe(2);
  });

  it('includes a difficult one-measure passage with very few attacks', () => {
    const sparse = performance(timeline([note(0, 48), note(0, 68)]));
    expect(sparse.peak.writtenMeasures).toEqual([1]);
    expect(sparse.peak.attacks).toBe(1);
    expect(sparse.peak.axes.texture).toBeGreaterThan(0);
    expect(performance(timeline([])).peak).toBeNull();
  });

  it.each([[3, 2], [4, 3], [5, 4]])('detects aligned full-window %s:%s subdivisions', (r, l) => {
    const result = performance(timeline([...regular(r, 0, 'rh'), ...regular(l, 0, 'lh')]));
    expect(result.peak.polyrhythmCost).toBeCloseTo(Math.log2(r * l));
  });

  it('rejects missing pulses in a shared grid, nonoverlapping rhythms and irregular binary durations', () => {
    const sharedGrid = [
      ...regular(4, 0, 'rh'),
      ...regular(4, 0, 'lh').slice(1),
    ];
    const nonoverlapping = [...regular(3, 0, 'rh'), ...regular(2, 1, 'lh')];
    const irregular = [note(0), note(0.5), note(0.75), ...regular(2, 0, 'lh')];
    for (const notes of [sharedGrid, nonoverlapping, irregular]) {
      expect(performance(timeline(notes)).peak.polyrhythmCost).toBe(0);
    }
  });

  it('scores alternation below independent hands that actually overlap within the measure', () => {
    const right = [note(0, 60, 'rh', { end: 0.5 }), note(1, 62, 'rh', { end: 1.5 })];
    const alternating = [note(0.5, 48, 'lh'), note(1.5, 50, 'lh')];
    const overlapping = [note(0.25, 48, 'lh'), note(1.25, 50, 'lh')];
    expect(performance(timeline([...right, ...overlapping])).peak.axes.bimanual)
      .toBeGreaterThan(performance(timeline([...right, ...alternating])).peak.axes.bimanual);
  });

  it('counts the barline syncopation once and only counts musically active rests', () => {
    const syncopated = note(3.5, 60, 'rh', { end: 4.5 });
    const plain = performance(timeline([syncopated], 2));
    const tied = performance(timeline([{ ...syncopated, tiedAcrossBar: true }], 2));
    expect(tied.peak.axes.rhythm).toBe(plain.peak.axes.rhythm);
    const rest = { start: 0, end: 1, hand: 'rh' };
    const waiting = performance(timeline([syncopated], 2, { rests: [{ ...rest, active: false }] }));
    const active = performance(timeline([syncopated], 2, { rests: [{ ...rest, active: true }] }));
    expect(waiting.peak.axes.rhythm).toBe(plain.peak.axes.rhythm);
    expect(active.peak.axes.rhythm).toBeGreaterThan(plain.peak.axes.rhythm);
  });

  it('detects syncopation across the midpoint in 4/8 grouped in four', () => {
    const groups = [0.5, 0.5, 0.5, 0.5];
    const measures = [{ start: 0, end: 2, startSec: 0, endSec: 1, groups, writtenIndex: 0 }];
    const endsAtAccent = performance(timeline([note(0.5, 60, 'rh', { end: 1 })], 1, { measures }));
    const crossesAccent = performance(timeline([note(0.5, 60, 'rh', { end: 1.25 })], 1, { measures }));
    expect(crossesAccent.peak.axes.rhythm).toBeGreaterThan(endsAtAccent.peak.axes.rhythm);
    const groupedInTwo = [{ ...measures[0], groups: [1, 1] }];
    const fromSecondGroup = performance(timeline([note(1, 60, 'rh', { end: 1.75 })], 1, { measures: groupedInTwo }));
    expect(fromSecondGroup.peak.axes.rhythm).toBe(0);
  });

  it('treats 2/2 as two groups and still detects a note held across the next downbeat', () => {
    const measures = timeline([], 2).measures.map(measure => ({ ...measure, groups: [2, 2] }));
    const inside = performance(timeline([note(2, 60, 'rh', { end: 3.5 })], 2, { measures }));
    const crosses = performance(timeline([note(2, 60, 'rh', { end: 4.5 })], 2, { measures }));
    expect(inside.peak.axes.rhythm).toBe(0);
    expect(crosses.peak.axes.rhythm).toBeGreaterThan(0);
  });

  it.each([
    ['rh', [60, 62, 64, 65, 67, 69, 71, 72], 1.5],
    ['rh', [72, 71, 69, 67, 65, 64, 62, 60], 2.5],
    ['lh', [48, 50, 52, 53, 55, 57, 59, 60], 2.5],
  ])('uses standard thumb crossings for a complete %s scale', (hand, pitches, beat) => {
    const scale = pitches.map((pitch, i) => note(i / 2, pitch, hand, { end: (i + 1) / 2 }));
    expect(performance(timeline(scale)).peak.positionChanges).toEqual([{ hand, beat, reason: 'inferredThumb' }]);
  });

  it('follows both thumb crossings when a scale turns on its top note', () => {
    const pitches = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60];
    const scale = pitches.map((pitch, i) => note(i / 2, pitch, 'rh', { end: (i + 1) / 2 }));
    expect(performance(timeline(scale, 2)).peak.positionChanges).toEqual([
      { hand: 'rh', beat: 1.5, reason: 'inferredThumb' },
      { hand: 'rh', beat: 6, reason: 'inferredThumb' },
    ]);
  });

  it('prefers written fingering and leaves the structural score independent of fingering', () => {
    const notes = [60, 62, 64, 65, 67, 69, 71, 72].map((pitch, i) => note(i / 2, pitch, 'rh',
      { end: (i + 1) / 2, degree: i }));
    const digits = [1, 2, 3, 4, 1, 2, 3, 4];
    const written = notes.map((n, i) => ({ ...n, finger: digits[i] }));
    expect(performance(timeline(written)).peak.positionChanges).toEqual([{ hand: 'rh', beat: 2, reason: 'writtenThumb' }]);
    expect(structural(timeline(written))).toEqual(structural(timeline(notes)));
  });

  it('keeps span-based repositioning for a broken scale and for large leaps', () => {
    const interrupted = [60, 62, 64, 65, 67, 69, 71, 72].map((pitch, i) => note(i / 2, pitch, 'rh',
      { end: (i + 1) / 2 - (i === 2 ? 0.25 : 0) }));
    expect(performance(timeline(interrupted)).peak.positionChanges).toEqual([{ hand: 'rh', beat: 2.5, reason: 'span' }]);
    expect(performance(timeline([note(0, 60), note(1, 84)])).peak.positionChanges)
      .toEqual([{ hand: 'rh', beat: 1, reason: 'span' }]);
  });

  it('keeps pedal overlap out of the voice estimate and reports uncertain inputs', () => {
    const input = timeline([note(0, 60, 'rh', { voice: 'one' }), note(1, 64, 'rh', { voice: 'two' }), note(2, 48, null)], 1,
      { tempoSource: 'fallback', voiceSource: 'inferred' });
    const result = performance(input);
    const pedalled = performance({ ...input, notes: [{ ...input.notes[0], soundingEnd: 2 }, ...input.notes.slice(1)] });
    expect(pedalled).toEqual(result);
    expect(result.uncertainty).toEqual({
      tempoFallback: true, voicesInferred: true, handsUnassigned: true,
      tempoSource: 'fallback', voiceSource: 'inferred', handSource: 'unassigned',
    });
  });

  it('keeps endurance nonnegative and does not count replayed measures as new material', () => {
    const short = timeline([note(0)], 1);
    const longer = timeline([note(0), note(4)], 2, { playedDurationSec: 180 });
    longer.measures[1].writtenIndex = 0;
    const a = performance(short), b = performance(longer);
    expect(performance({ ...short, playedDurationSec: 30 }).endurance).toBe(a.endurance);
    expect(b.uniqueWrittenMeasures).toBe(a.uniqueWrittenMeasures);
    expect(b.endurance).toBeGreaterThanOrEqual(a.endurance);
    expect(b.endurance).toBeLessThanOrEqual(6);
    expect(structural(longer).endurance).toBe(0);
  });
});

describe('generated-book input', () => {
  it('preserves the structural estimate when an actual generated piece is transposed', () => {
    const original = srtGenerateLevelPiece(1, 'C', 23);
    const twin = srtTransposeLevelPiece(original, 'G');
    expect(twin).not.toBeNull();
    const a = structural(levelPieceToDifficultyInput(original));
    const b = structural(levelPieceToDifficultyInput(twin));
    expect(a.peak.axes).toEqual(b.peak.axes);
    expect(a.score).toBe(b.score);
    expect(a.difficultyStars).toBe(b.difficultyStars);
    expect(a.axisDifficulty).toEqual(b.axisDifficulty);
  });

  it('uses the reference tempo already used by the player and the metrical groups independently', () => {
    const piece = srtGenerateLevelPiece(7, 'C', 7, { meter: { num: 6, den: 8 } });
    const input = levelPieceToDifficultyInput(piece);
    const last = input.measures.at(-1);
    expect(input.tempoSource).toBe('reference');
    expect(last.endSec).toBeCloseTo(srtLevelDurationMs(piece, srtLevel(7).bpm) / 1000, 3);
    expect(last.groups).toEqual([1.5, 1.5]);
  });
});

describe('v1 characterization and provenance', () => {
  it('documents v1 bar-window sensitivity between 4/4 and 2/4 on identical physical timings', () => {
    const timestamps = [0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 3.0];
    const makeNotes = () => timestamps.map((t, i) => ({
      start: t * 2, end: t * 2 + 0.4, startSec: t,
      midi: i % 2 === 0 ? 60 : 72, hand: 'rh',
    }));
    const measures44 = [
      { start: 0, end: 4, startSec: 0, endSec: 2, groups: [1, 1, 1, 1], writtenIndex: 0, fifths: 0, num: 4, den: 4 },
      { start: 4, end: 8, startSec: 2, endSec: 4, groups: [1, 1, 1, 1], writtenIndex: 1, fifths: 0, num: 4, den: 4 },
    ];
    const measures24 = [
      { start: 0, end: 2, startSec: 0, endSec: 1, groups: [1, 1], writtenIndex: 0, fifths: 0, num: 2, den: 4 },
      { start: 2, end: 4, startSec: 1, endSec: 2, groups: [1, 1], writtenIndex: 1, fifths: 0, num: 2, den: 4 },
      { start: 4, end: 6, startSec: 2, endSec: 3, groups: [1, 1], writtenIndex: 2, fifths: 0, num: 2, den: 4 },
      { start: 6, end: 8, startSec: 3, endSec: 4, groups: [1, 1], writtenIndex: 3, fifths: 0, num: 2, den: 4 },
    ];
    const v1FourFour = estimateScoreDifficulty(
      { measures: measures44, notes: makeNotes(), rests: [], tempoSource: 'written', voiceSource: 'written' },
      'performance',
      { rubricVersion: 1 },
    );
    const v1TwoFour = estimateScoreDifficulty(
      { measures: measures24, notes: makeNotes(), rests: [], tempoSource: 'written', voiceSource: 'written' },
      'performance',
      { rubricVersion: 1 },
    );
    expect(v1TwoFour.axisDifficulty.motor.stars).toBeGreaterThan(v1FourFour.axisDifficulty.motor.stars);
  });

  it('documents v1 existing texture tempo sensitivity via chord-change speed factor', () => {
    const chordSequence = bpm => {
      const spq = 60 / bpm;
      const chords = [[60, 64], [72, 76], [59, 62], [74, 77], [60, 64], [72, 76], [59, 62], [74, 77]];
      const notes = chords.flatMap((pair, i) => pair.map(midi => ({
        start: i * 0.5, end: (i + 1) * 0.5, startSec: i * 0.5 * spq, midi, hand: 'rh',
      })));
      const measures = [{
        start: 0, end: 4, startSec: 0, endSec: 4 * spq, groups: [1, 1, 1, 1], writtenIndex: 0, fifths: 0,
      }];
      return { measures, notes, rests: [], tempoSource: 'written', voiceSource: 'written' };
    };
    const slow = estimateScoreDifficulty(chordSequence(40), 'performance', { rubricVersion: 1 });
    const fast = estimateScoreDifficulty(chordSequence(160), 'performance', { rubricVersion: 1 });
    expect(fast.axisDifficulty.texture.stars).toBeGreaterThan(slow.axisDifficulty.texture.stars);
  });

  it('propagates explicit tempoSource, voiceSource, and handSource provenance', () => {
    const written = performance(timeline([note(0, 60, 'rh')], 1, {
      tempoSource: 'reference', voiceSource: 'written', handSource: 'written',
    }));
    expect(written.uncertainty).toEqual({
      tempoFallback: false, voicesInferred: false, handsUnassigned: false,
      tempoSource: 'reference', voiceSource: 'written', handSource: 'written',
    });
    const tracked = performance(timeline([note(0, 60, 'rh')], 1, {
      tempoSource: 'written', voiceSource: 'unknown', handSource: 'track',
    }));
    expect(tracked.uncertainty).toEqual({
      tempoFallback: false, voicesInferred: false, handsUnassigned: false,
      tempoSource: 'written', voiceSource: 'unknown', handSource: 'track',
    });
  });
});

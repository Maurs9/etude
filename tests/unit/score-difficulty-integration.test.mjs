import { describe, expect, it } from 'vitest';
import {
  auditLocalLibrary,
  calibrateDifficulty,
  computeCalibrationProfileId,
  evaluateRankBenchmark,
  fitAggregationWeights,
  groupKFoldSplit,
  kendallTauC,
  majorInversionRate,
  readDifficultyCalibration,
  sha256Hex,
  spearmanRho,
  suggestedDifficulty,
} from '../../src/domain/score-difficulty-calibration.ts';
import { estimateImportedScore } from '../../src/domain/score-difficulty-import.ts';
import { scoreXmlNotes } from '../../src/domain/score-import.ts';
import { srtBookPiece } from '../../src/sight-reading/book.ts';
import { srtLevelFingerprint } from '../../src/sight-reading/fingerprint.ts';
import { srtBookId, srtNormalizeBookState, srtRecordResult, srtScoredId } from '../../src/sight-reading/progress.ts';
import { srtRuleViolations } from '../../src/sight-reading/rules.ts';
import { srtScoredExercise } from '../../src/sight-reading/scored-exercise.ts';

describe('import calibration', () => {
  const reference = [1, 2, 3, 4, 5, 6].flatMap(level => [
    { level, score: 10 * level, split: 'fit', group: 'fit-' + level },
    { level, score: 10 * level + 2, split: 'check', group: 'check-' + level },
  ]);
  it('fits monotone cutoffs and measures held-out error separately', () => {
    const result = calibrateDifficulty(reference);
    expect(result.profile).toEqual({ version: 1, cutoffs: [15, 25, 35, 45, 55] });
    expect(result).toMatchObject({ exact: 6, count: 6, mae: 0, improves: true });
    expect(suggestedDifficulty(25, result.profile)).toBe(3);
  });

  it('rejects shared work groups, missing grade coverage and invalid portable profiles', () => {
    const leaked = reference.map((row, i) => i === 1 ? { ...row, group: reference[0].group } : row);
    expect(() => calibrateDifficulty(leaked)).toThrow(/both splits/);
    expect(() => calibrateDifficulty(reference.slice(0, -1))).toThrow(/Each level/);
    expect(readDifficultyCalibration({ version: 2, cutoffs: [10, 20, 30, 40, 50] })).toBeNull();
    expect(readDifficultyCalibration({ version: 1, cutoffs: [10, 20, 20, 40, 50] })).toBeNull();
    const profile = { version: 1, cutoffs: [10, 20, 30, 40, 50] };
    const id = 'a'.repeat(64);
    expect(readDifficultyCalibration({ ...profile, startingTempos: { [id]: 84.5 } })).toEqual({ ...profile, startingTempos: { [id]: 84.5 } });
    expect(readDifficultyCalibration({ ...profile, startingTempos: { [id]: 500 } })).toBeNull();
  });

  it('accounts for tempo changes and reports an inferred MIDI hand assignment', () => {
    const parsed = {
      ppq: 480, format: 0, tracks: 1, names: [], notes: [
        { midi: 60, start: 0, end: 1, soundEnd: 4, vel: 90, channel: 0, track: 0 },
        { midi: 65, start: 2, end: 4, vel: 90, channel: 0, track: 0 },
      ],
      meta: [{ type: 'tempo', beat: 0, bpm: 120 }, { type: 'tempo', beat: 2, bpm: 60 }],
    };
    const source = { kind: 'midi', title: 'Fixture', label: 'fixture.mid', parsed };
    const explicit = estimateImportedScore(source);
    expect(explicit).toMatchObject({
      playedDurationSec: 3, midi: true, playedMeasures: 1,
      uncertainty: {
        tempoFallback: false, voicesInferred: false, handsUnassigned: false,
        tempoSource: 'written', voiceSource: 'unknown', handSource: 'pitchSplit',
      },
    });
    expect(explicit.peak.attacks).toBe(2);
    const fallback = estimateImportedScore({ ...source, parsed: { ...parsed, meta: parsed.meta.slice(1) } });
    expect(fallback.uncertainty).toMatchObject({ tempoFallback: true, tempoSource: 'fallback', voiceSource: 'unknown', handSource: 'pitchSplit' });
  });

  it('distinguishes track-separated MIDI hands and preserves MusicXML clef, trill, pedal, and articulation metadata', () => {
    const trackMidi = {
      ppq: 480, format: 1, tracks: 2, names: ['RH', 'LH'],
      notes: [
        { midi: 72, start: 0, end: 1, vel: 90, channel: 0, track: 0 },
        { midi: 74, start: 1, end: 2, vel: 90, channel: 0, track: 0 },
        { midi: 48, start: 0, end: 1, vel: 90, channel: 0, track: 1 },
        { midi: 50, start: 1, end: 2, vel: 90, channel: 0, track: 1 },
      ],
      meta: [{ type: 'tempo', beat: 0, bpm: 120 }],
    };
    const trackEstimate = estimateImportedScore({ kind: 'midi', title: 'Tracks', label: 'tracks.mid', parsed: trackMidi });
    expect(trackEstimate.uncertainty).toMatchObject({
      tempoSource: 'written', voiceSource: 'unknown', handSource: 'track',
    });

    class XmlNode {
      constructor(localName, attrs = {}, text = '', children = []) {
        this.localName = localName;
        this.attrs = attrs;
        this.textContent = text;
        this.children = children;
      }
      getAttribute(name) { return this.attrs[name] ?? null; }
      hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); }
      querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
      querySelectorAll(sel) {
        const out = [];
        for (const branch of sel.split(',').map(s => s.trim())) {
          const parts = branch.split('>').map(s => s.trim());
          const walk = (node, depth, strict) => {
            for (const child of node.children) {
              if (parts[depth] === '*' || child.localName === parts[depth]) {
                if (depth === parts.length - 1) out.push(child);
                else walk(child, depth + 1, true);
              } else if (!strict) {
                walk(child, depth, false);
              }
            }
          };
          walk(this, 0, false);
        }
        return out;
      }
    }
    const el = (name, attrs, text, children) => new XmlNode(name, attrs, text, children);
    const doc = new XmlNode('root', {}, '', [
      el('score-partwise', {}, '', [
        el('part', {}, '', [
          el('measure', { number: '1' }, '', [
            el('attributes', {}, '', [
              el('divisions', {}, '1'),
              el('time', {}, '', [el('beats', {}, '4'), el('beat-type', {}, '4')]),
              el('staves', {}, '2'),
              el('clef', { number: '1' }, '', [el('sign', {}, 'G'), el('line', {}, '2')]),
              el('clef', { number: '2' }, '', [el('sign', {}, 'F'), el('line', {}, '4')]),
            ]),
            el('direction', {}, '', [
              el('direction-type', {}, '', [el('pedal', { type: 'start' })]),
              el('sound', { tempo: '120' }),
            ]),
            el('note', {}, '', [
              el('pitch', {}, '', [el('step', {}, 'C'), el('octave', {}, '5')]),
              el('duration', {}, '4'),
              el('voice', {}, '1'),
              el('staff', {}, '1'),
              el('notations', {}, '', [
                el('articulations', {}, '', [el('staccato')]),
                el('ornaments', {}, '', [el('trill-mark')]),
              ]),
            ]),
          ]),
          el('measure', { number: '2' }, '', [
            el('attributes', {}, '', [
              el('clef', { number: '2' }, '', [el('sign', {}, 'G'), el('line', {}, '2')]),
            ]),
            el('note', {}, '', [
              el('pitch', {}, '', [el('step', {}, 'E'), el('octave', {}, '4')]),
              el('duration', {}, '4'),
              el('voice', {}, '1'),
              el('staff', {}, '2'),
            ]),
          ]),
        ]),
      ]),
    ]);
    const parsedXml = scoreXmlNotes(doc, true);
    expect(parsedXml.measures[0].pedalChanges).toBe(1);
    expect(parsedXml.measures[0].clefChanges).toBeUndefined();
    expect(parsedXml.measures[1].clefChanges).toBe(1);
    expect(parsedXml.notes[0].difficulty).toMatchObject({ ornaments: 1, trills: 1 });
    expect(parsedXml.notes[0].art.staccato).toBe(true);

    const prevDomParser = globalThis.DOMParser;
    globalThis.DOMParser = class {
      parseFromString() { return doc; }
    };
    try {
      const xmlEstimate = estimateImportedScore({
        kind: 'xml', title: 'XmlMeta', label: 'meta.musicxml', xml: '<score-partwise/>', layout: null, ...parsedXml,
      });
      expect(xmlEstimate.uncertainty).toMatchObject({
        tempoFallback: false, voicesInferred: false, handsUnassigned: false,
        tempoSource: 'written', voiceSource: 'written', handSource: 'written',
      });
    } finally {
      if (prevDomParser === undefined) delete globalThis.DOMParser;
      else globalThis.DOMParser = prevDomParser;
    }
  });
});

describe('scored new exercises', () => {
  it('selects the median of new valid candidates and avoids seen music', () => {
    const book = srtLevelFingerprint(srtBookPiece(1, 1));
    const fresh = srtScoredExercise(1, 'C', 862039, new Set([book]));
    expect(fresh).not.toBeNull();
    expect(fresh.score).toBe(fresh.scores[Math.floor(fresh.scores.length / 2)]);
    expect(srtRuleViolations(fresh.piece)).toEqual([]);
    expect(fresh.piece.key.id).toBe('C');
    expect(fresh.fingerprint).not.toBe(book);
    expect(srtScoredExercise(1, 'C', 862039, new Set()).fingerprint).toBe(fresh.fingerprint);
    expect(srtScoredExercise(1, 'C', 862039, new Set([fresh.fingerprint])).fingerprint).not.toBe(fresh.fingerprint);
  });

  it('writes results under a versioned fingerprint without changing numbered progress or recent curriculum scores', () => {
    const bookId = srtBookId(1, 1);
    const original = { best: 94, stars: 2, tries: 1, first: 94 };
    const previous = srtNormalizeBookState({ v: 2, pieces: { [bookId]: original }, recent: { 1: [94] } });
    const id = srtScoredId('v2:123abc');
    const next = srtRecordResult(previous, { id, level: 1, key: 'C', score: 99, stars: 3, firstSight: true, date: '2026-11-20' });
    const reopened = srtNormalizeBookState(JSON.parse(JSON.stringify(next)));
    expect(reopened.pieces).toMatchObject({ [bookId]: original, [id]: { best: 99, stars: 3 } });
    expect(reopened.recent).toEqual(previous.recent);
    expect(reopened.daily).toEqual(previous.daily);
    expect(reopened.days).toEqual(previous.days);
  });
});

describe('v2 calibration, rank benchmark and local audit', () => {
  it('computes standard SHA-256 and validates v2 order/axis calibration profiles with deterministic profileId', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

    const orderAggregation = { mode: 'order', orderWeights: [0.45, 0.30, 0.1, 0.1, 0.05], weakestLinkDelta: 1, enduranceScale: 1 };
    const id = computeCalibrationProfileId(orderAggregation);
    const id2 = computeCalibrationProfileId({ ...orderAggregation, weakestLinkDelta: 1.2 });
    expect(id).toMatch(/^[a-f0-9]{16}$/);
    expect(id).not.toBe(id2);

    const fileId = 'b'.repeat(64);
    const parsedOrder = readDifficultyCalibration({
      version: 2,
      profileId: id,
      aggregation: orderAggregation,
      startingTempos: { [fileId]: 108 },
    });
    expect(parsedOrder).toEqual({
      version: 2,
      profileId: id,
      aggregation: orderAggregation,
      startingTempos: { [fileId]: 108 },
    });

    const axisAggregation = {
      mode: 'axis',
      axisWeights: { motor: 0.3, rhythm: 0.25, bimanual: 0.2, texture: 0.15, reading: 0.1 },
      alphaWeak: 0.35,
      enduranceScale: 0.8,
    };
    const parsedAxis = readDifficultyCalibration({ version: 2, aggregation: axisAggregation });
    expect(parsedAxis).toEqual({
      version: 2,
      profileId: computeCalibrationProfileId(axisAggregation),
      aggregation: axisAggregation,
    });

    expect(readDifficultyCalibration({ version: 2, profileId: '0'.repeat(16), aggregation: orderAggregation })).toBeNull();
    expect(readDifficultyCalibration({ version: 2, aggregation: { mode: 'order', orderWeights: [0.5, 0.5, 0, 0, -0.1] } })).toBeNull();
    expect(readDifficultyCalibration({ version: 2, aggregation: { mode: 'order', orderWeights: [0.5, 0.2, 0.1, 0.1, 0.05] } })).toBeNull();
    expect(readDifficultyCalibration({ version: 2, aggregation: { mode: 'axis', axisWeights: { motor: 0.5, rhythm: 0.5, bimanual: 0, texture: 0, reading: 0 }, alphaWeak: 2 } })).toBeNull();
  });

  it('computes Kendall tau-c, Spearman rho and major inversion rate accurately', () => {
    const truth = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(kendallTauC(truth, truth)).toBeCloseTo(1, 6);
    expect(spearmanRho(truth, truth)).toBeCloseTo(1, 6);
    expect(majorInversionRate(truth, truth)).toEqual({ rate: 0, inversions: 0, ties: 0, pairs: 28 });

    const reversed = [...truth].reverse();
    expect(kendallTauC(reversed, truth)).toBeCloseTo(-1, 6);
    expect(spearmanRho(reversed, truth)).toBeCloseTo(-1, 6);
    expect(majorInversionRate(reversed, truth)).toEqual({ rate: 1, inversions: 28, ties: 0, pairs: 28 });

    // Minor inversion (gap = 1) does not count as major inversion (minGap = 2)
    const minorSwap = [2, 1, 3, 4, 5, 6, 7, 8, 9];
    expect(majorInversionRate(minorSwap, truth).inversions).toBe(0);
    // Swapping 1 and 5 introduces major inversions
    const majorSwap = [5, 2, 3, 4, 1, 6, 7, 8, 9];
    expect(majorInversionRate(majorSwap, truth).inversions).toBeGreaterThan(0);
  });

  it('keeps work groups strictly disjoint across folds and hold-out and runs rank benchmark acceptance gate', () => {
    const items = Array.from({ length: 30 }, (_, index) => {
      const henle = (index % 9) + 1;
      const group = `work-${Math.floor(index / 2)}`;
      const idealStars = 1 + ((henle - 1) / 8) * 4;
      const v1Stars = index % 3 === 0 ? Math.round((6 - idealStars) * 10) / 10 : Math.round(idealStars * 10) / 10;
      const axes = {
        motor: idealStars,
        rhythm: Math.max(1, idealStars - 0.3),
        bimanual: Math.max(1, idealStars - 0.4),
        texture: Math.max(1, idealStars - 0.5),
        reading: Math.max(1, idealStars - 0.6),
      };
      return {
        group,
        truth: henle,
        v1Stars,
        v2Axes: axes,
        v2EnduranceRaw: 0,
        v2Stars: Math.round(idealStars * 10) / 10,
      };
    });

    const split = groupKFoldSplit(items, 5, 0.2, 42);
    const holdoutGroups = new Set(split.holdout.map(item => item.group));
    expect(holdoutGroups.size).toBeGreaterThan(0);
    expect(split.folds).toHaveLength(5);
    for (const fold of split.folds) {
      const trainGroups = new Set(fold.train.map(item => item.group));
      const validGroups = new Set(fold.valid.map(item => item.group));
      for (const group of validGroups) {
        expect(trainGroups.has(group)).toBe(false);
        expect(holdoutGroups.has(group)).toBe(false);
      }
      for (const group of trainGroups) {
        expect(holdoutGroups.has(group)).toBe(false);
      }
    }

    const evaluation = evaluateRankBenchmark(items, { fitMode: 'order', seed: 42 });
    expect(evaluation.accepted).toBe(true);
    expect(evaluation.foldsImprovedTau).toBeGreaterThanOrEqual(4);
    expect(evaluation.meanV2.tauC).toBeGreaterThan(evaluation.meanV1.tauC);
    expect(evaluation.holdout.v2.tauC).toBeGreaterThan(evaluation.holdout.v1.tauC);
    expect(readDifficultyCalibration(evaluation.profile)).toEqual(evaluation.profile);

    const fittedAxis = fitAggregationWeights(split.folds[0].train, 'axis');
    expect(fittedAxis.mode).toBe('axis');
  });

  it('audits local library monotonicity, fallback tempos, anomalies, and SHA-256 tempo export', () => {
    const hash = i => i.toString(16).padStart(64, '0');
    const items = [
      { id: hash(1), level: 1, stars: 1.5, tempoSource: 'written' },
      { id: hash(2), level: 1, stars: 1.8, tempoSource: 'written' },
      { id: hash(3), level: 2, stars: 2.4, tempoSource: 'reference', verifiedBpm: 92 },
      { id: hash(4), level: 3, stars: 3.1, tempoSource: 'written' },
      { id: hash(5), level: 4, stars: 3.9, tempoSource: 'fallback' },
      { id: hash(6), level: 5, stars: 4.5, tempoSource: 'written' },
      { id: hash(7), level: 6, stars: 4.9, tempoSource: 'written' },
      ...Array.from({ length: 18 }, (_, i) => ({
        id: hash(10 + i),
        level: 2,
        stars: 2.0 + (i % 5) * 0.25,
        tempoSource: 'written',
      })),
    ];
    const report = auditLocalLibrary(items);
    expect(report.monotoneLevels).toBe(true);
    expect(report.fallbackIds).toEqual([hash(5)]);
    expect(report.topAnomalies.length).toBeLessThanOrEqual(15);
    expect(report.startingTempos).toEqual({ [hash(3)]: 92 });
    expect(report.distribution['1.0-1.9']).toBe(2);

    const nonMonotone = auditLocalLibrary([
      { id: hash(1), level: 1, stars: 3.5, tempoSource: 'written' },
      { id: hash(2), level: 2, stars: 2.0, tempoSource: 'written' },
    ]);
    expect(nonMonotone.monotoneLevels).toBe(false);
  });
});

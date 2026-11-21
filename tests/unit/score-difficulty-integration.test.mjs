import { describe, expect, it } from 'vitest';
import { calibrateDifficulty, readDifficultyCalibration, suggestedDifficulty } from '../../src/domain/score-difficulty-calibration.ts';
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

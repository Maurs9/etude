import { describe, expect, it } from 'vitest';
import { anDiatonic, anIntervalName, anKeyRank, chordDegreeMap, chordInversion, chordPitches, formatChordFormula, formatScaleFormula, identifyChord, intervalOctave, keyFifths, keyFromFifths, midiToFrequency, normalizeSemitones, pitchClass, romanFor, samePitchSet, scalePitches, spellMidi, transposePitchClass } from '../src/domain/theory.ts';

describe('pure theory helpers', () => {
  it('normalizes and transposes pitch classes across octaves', () => {
    expect(normalizeSemitones(-1)).toBe(11);
    expect(transposePitchClass(11, 2)).toBe(1);
    expect(intervalOctave(25)).toEqual({ octave: 2, class: 1 });
  });

  it('builds scales and deduplicated chord pitch sets', () => {
    expect(scalePitches(0, [0, 4, 7])).toEqual([0, 4, 7]);
    expect(chordPitches(11, [0, 4, 7, 12])).toEqual([3, 6, 11]);
    expect(samePitchSet([0, 12, 7], [7, 0])).toBe(true);
    expect(samePitchSet([0, 4], [0, 5])).toBe(false);
  });

  it('identifies chords without browser state', () => {
    const chords = [
      { idx: 0, symbol: 'maj', pcset: [0, 4, 7] },
      { idx: 1, symbol: 'm', pcset: [0, 3, 7] },
    ];
    const result = identifyChord([64, 67, 72], chords);
    expect(result?.chord.symbol).toBe('maj');
    expect(result?.rootPc).toBe(0);
    expect(chordInversion(0, chords[0], 64)).toBe(1);
  });

  it('keeps pitch and formula formatting browser-independent', () => {
    expect(midiToFrequency(69)).toBe(440);
    expect(pitchClass(-1)).toBe(11);
    expect(formatChordFormula([0, 4, 7, 14])).toBe('1 3 5 9');
    expect(formatScaleFormula([0, 2, 4, 7])).toBe('1 2 3 5');
  });

  it('owns key spelling, analysis helpers, and chord labels', () => {
    expect(keyFifths(7, false)).toBe(1);
    expect(keyFromFifths(1, false)).toMatchObject({ root: 7, minor: false });
    expect(spellMidi(61, -1, false)).toMatchObject({ li: 1, acc: -1 });
    expect(anIntervalName(14)).toBe('Major 2nd (+1 oct)');
    expect(chordDegreeMap([60, 64, 67], 0, [0, 4, 7]).get(64)).toBe('3');
    expect(romanFor(0, { rootPc: 7, chord: { symbol: '7', pcset: [0, 4, 7, 10] } })).toBe('V⁷');
  });

  it('ranks keys and provides diatonic harmony without browser dependencies', () => {
    const notes = [0, 4, 7].map((midi, index) => ({ midi: 60 + midi, start: index, end: index + 1 }));
    expect(anKeyRank(notes)[0]).toHaveProperty('root');
    expect(anDiatonic({ root: 0, minor: false, fifths: 0 })).toHaveLength(8);
  });
});

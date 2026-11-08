import { describe, expect, it } from 'vitest';
import { chordInversion, chordPitches, formatChordFormula, formatScaleFormula, identifyChord, intervalOctave, midiToFrequency, normalizeSemitones, pitchClass, samePitchSet, scalePitches, transposePitchClass } from '../src/domain/theory.ts';

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
});

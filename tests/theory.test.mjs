import { describe, expect, it } from 'vitest';
import { chordPitches, intervalOctave, normalizeSemitones, samePitchSet, scalePitches, transposePitchClass } from '../src/domain/theory.ts';

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
});

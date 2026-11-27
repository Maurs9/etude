import { describe, expect, it } from 'vitest';
import { pitchKey, samePitch } from '../../src/core/pitch-match.ts';

describe('core pitch matching ("Accept any octave")', () => {
  it('compares exact keys without the setting', () => {
    expect(samePitch(60, 60, false)).toBe(true);
    expect(samePitch(60, 72, false)).toBe(false);
    expect(pitchKey(61, false)).toBe(61);
  });

  it('compares note names in any octave with the setting, folding negatives', () => {
    expect(samePitch(60, 72, true)).toBe(true);
    expect(samePitch(60, 48, true)).toBe(true);
    expect(samePitch(60, 61, true)).toBe(false);
    expect(pitchKey(-1, true)).toBe(11);
    expect(pitchKey(-12, true)).toBe(0);
    expect(samePitch(-1, 11, true)).toBe(true);
    for (let m = 21; m <= 108; m++) expect(pitchKey(m, true)).toBe(m % 12);
  });
});

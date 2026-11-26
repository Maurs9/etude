import { describe, expect, it } from 'vitest';
import { ssGen, ssSyllables } from '../../src/domain/sightsing-render.ts';

describe('sight-singing generator & syllables', () => {
  it('keeps Kodály Level 1 (sol-mi) and Level 2 (+ la) strictly within allowed degrees without injecting do', () => {
    for (let i = 0; i < 20; i++) {
      const lv1 = ssGen(0, 'treble', 0, 'ro');
      const lv1Degs = lv1.measures.flat().map((n) => n.p);
      expect(lv1Degs.every((p) => p === 2 || p === 4)).toBe(true);

      const lv2 = ssGen(1, 'treble', 0, 'ro');
      const lv2Degs = lv2.measures.flat().map((n) => n.p);
      expect(lv2Degs.every((p) => p === 2 || p === 4 || p === 5)).toBe(true);
    }
  });

  it('uses "si" in Romance locales and "ti" in English/German', () => {
    expect(ssSyllables(false, 'ro')[6]).toBe('si');
    expect(ssSyllables(true, 'ro')[1]).toBe('si');
    expect(ssSyllables(false, 'fr')[6]).toBe('si');
    expect(ssSyllables(false, 'en')[6]).toBe('ti');
    expect(ssSyllables(false, 'de')[6]).toBe('ti');
  });

  it('never places a note across the 1.5-beat compound boundary in Level 7 6/8 exercises', () => {
    for (let i = 0; i < 40; i++) {
      const ex = ssGen(6, 'treble', 0, 'en');
      if (ex.ts[0] === 6 && ex.ts[1] === 8) {
        for (const meas of ex.measures) {
          let beat = 0;
          for (const note of meas) {
            if (beat < 1.5 - 1e-6) {
              expect(beat + note.dur).toBeLessThanOrEqual(1.5 + 1e-6);
            }
            beat += note.dur;
          }
          expect(beat).toBeCloseTo(3, 4);
        }
      }
    }
  });
});

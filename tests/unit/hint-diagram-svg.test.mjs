import { describe, expect, it } from 'vitest';
import {
  hintAccidental, hintKeyboardKeys, hintKeyboardLayout, hintStaffY,
} from '../../src/domain/hint-diagram-svg.ts';
import { pitchClass } from '../../src/domain/theory.ts';

const WHITE = new Set([0, 2, 4, 5, 7, 9, 11]);

describe('hint-diagram-svg pure helpers', () => {
  it('snaps keyboard bounds to white keys and spans at least an octave', () => {
    // C#4 (61) -> F4 (65): high = max(61+12, 65) = 73 (C#5) snaps up to D5 (74); low snaps down to C4 (60).
    const layout = hintKeyboardLayout([61, 65]);
    expect(layout.low).toBe(60);
    expect(layout.high).toBe(74);
    expect(WHITE.has(pitchClass(layout.low))).toBe(true);
    expect(WHITE.has(pitchClass(layout.high))).toBe(true);
    // C4..D5 has 9 white keys -> width = 9 * 20 + 4 = 184.
    expect(layout.viewBox).toBe('0 0 184 68');

    // Upper bound ending on F#5 (78) snaps up to G5 (79).
    const wide = hintKeyboardLayout([60, 78]);
    expect(wide.low).toBe(60);
    expect(wide.high).toBe(79);
    // C4..G5 has 12 white keys -> width = 12 * 20 + 4 = 244.
    expect(wide.viewBox).toBe('0 0 244 68');
  });

  it('renders white keys before black keys and applies kind, root, and changed classes', () => {
    const svg = hintKeyboardKeys(
      'chord',
      [
        { midi: 60, tonic: true },
        { midi: 61, tonic: false },
        { midi: 64, tonic: false },
      ],
      60,
      64,
      new Set([61]),
    );
    const lastWhite = svg.lastIndexOf('pr-chord-white');
    const firstBlack = svg.indexOf('pr-chord-black');
    expect(lastWhite).toBeGreaterThan(-1);
    expect(firstBlack).toBeGreaterThan(lastWhite);

    expect(svg).toContain('class="pr-chord-key pr-chord-white pr-chord-root" data-chord-midi="60"');
    expect(svg).toContain('r="3.5"');
    expect(svg).toContain('class="pr-chord-key pr-chord-black pr-chord-changed" data-chord-midi="61"');
    expect(svg).toContain('r="2.7"');
    expect(svg).not.toContain('data-chord-midi="62"');

    const scaleSvg = hintKeyboardKeys('scale', [{ midi: 60, tonic: true }], 60, 62, null);
    expect(scaleSvg).toContain('pr-scale-key pr-scale-white pr-scale-root');
    expect(scaleSvg).toContain('data-scale-midi="60"');
  });

  it('maps treble-staff pitch steps relative to E4 at y = 48', () => {
    expect(hintStaffY({ li: 2, oct: 4, acc: 0, midi: 64 })).toBe(48); // E4 bottom line
    expect(hintStaffY({ li: 3, oct: 4, acc: 0, midi: 65 })).toBe(42); // F4 first space
    expect(hintStaffY({ li: 0, oct: 4, acc: 0, midi: 60 })).toBe(60); // C4 ledger line below
    expect(hintStaffY({ li: 3, oct: 5, acc: 0, midi: 77 })).toBe(0); // F5 top line
  });

  it('renders natural, sharp, flat, double-flat, and double-sharp accidentals', () => {
    const natural = hintAccidental('chord', 0, 20, 30);
    const sharp = hintAccidental('chord', 1, 20, 30);
    const flat = hintAccidental('chord', -1, 20, 30);
    expect(natural).toContain('class="ss-glyph"');
    expect(sharp).toContain('class="ss-glyph"');
    expect(flat).toContain('class="ss-glyph"');
    expect(new Set([natural, sharp, flat]).size).toBe(3);

    const doubleFlat = hintAccidental('chord', -2, 20, 30);
    expect(doubleFlat.length).toBeGreaterThan(flat.length);

    const doubleSharp = hintAccidental('scale', 2, 20, 30);
    expect(doubleSharp).toContain('class="pr-scale-double-sharp"');
    expect(doubleSharp).toContain('M17,26l7,8m0,-8l-7,8');
  });
});

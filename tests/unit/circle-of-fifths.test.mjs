import { describe, expect, it, vi } from 'vitest';
import {
  cofKeyLabelWith,
  cofParse,
  cofPt,
  cofSector,
  cofSigListWith,
  cofSpellDegreesWith,
  cofText,
  createCircleOfFifths,
} from '../../src/domain/circle-of-fifths.ts';
import { SCALE_DEFINITIONS } from '../../src/domain/theory.ts';

function enSpell(letter, acc) {
  return letter + (acc === 2 ? '𝄪' : acc === 1 ? '♯' : acc === -1 ? '♭' : acc === -2 ? '𝄫' : '');
}

function deSpell(letter, acc) {
  if (letter === 'B' && acc === 0) return 'H';
  if (letter === 'B' && acc === -1) return 'B';
  return enSpell(letter, acc);
}

describe('circle of fifths pure helpers and controller', () => {
  it('parses keys and spells harmonic/melodic scales with consecutive letters including German B/H', () => {
    expect(cofParse('F#')).toEqual({ L: 'F', acc: 1 });
    expect(cofParse('Bb')).toEqual({ L: 'B', acc: -1 });
    expect(cofParse('C')).toEqual({ L: 'C', acc: 0 });

    const gHarm = cofSpellDegreesWith(
      'G',
      SCALE_DEFINITIONS['Harmonic minor'].concat([12]),
      [0, 1, 2, 3, 4, 5, 6, 7],
      enSpell,
    );
    expect(gHarm).toEqual(['G', 'A', 'B♭', 'C', 'D', 'E♭', 'F♯', 'G']);

    const dSharpHarm = cofSpellDegreesWith(
      'D#',
      SCALE_DEFINITIONS['Harmonic minor'].concat([12]),
      [0, 1, 2, 3, 4, 5, 6, 7],
      enSpell,
    );
    expect(dSharpHarm).toEqual(['D♯', 'E♯', 'F♯', 'G♯', 'A♯', 'B', 'C𝄪', 'D♯']);

    const bFlatMajorDe = cofSpellDegreesWith(
      'Bb',
      SCALE_DEFINITIONS['Major (Ionian)'].concat([12]),
      [0, 1, 2, 3, 4, 5, 6, 7],
      deSpell,
    );
    expect(bFlatMajorDe).toEqual(['B', 'C', 'D', 'E♭', 'F', 'G', 'A', 'B']);
  });

  it('builds key signatures, enharmonic tritone labels, SVG geometry, and accidental glyphs', () => {
    expect(cofSigListWith(0, enSpell)).toEqual({ n: 0, list: '' });
    expect(cofSigListWith(3, enSpell)).toEqual({ n: 3, sharp: true, list: 'F♯, C♯, G♯' });
    expect(cofSigListWith(10, enSpell)).toEqual({ n: 2, sharp: false, list: 'B♭, E♭' });

    expect(cofKeyLabelWith(6, false, (s) => {
      const p = cofParse(s);
      return enSpell(p.L, p.acc);
    })).toBe('F♯ / G♭');
    expect(cofKeyLabelWith(6, true, (s) => {
      const p = cofParse(s);
      return enSpell(p.L, p.acc);
    })).toBe('D♯ / E♭');

    expect(cofPt(100, 0)).toEqual(['350.00', '250.00']);
    expect(cofSector(90, 158, -15, 15)).toMatch(/^M.*A158 158 .*L.*A90 90 .*Z$/);
    expect(cofText('100', '200', 'cof-acc', ['F♯', 'B♭'], 19)).toContain('<tspan class="cof-g">♯</tspan>');
    expect(cofText('100', '200', 'cof-acc', ['F♯', 'B♭'], 19)).toContain('<tspan class="cof-g">♭</tspan>');
  });

  it('computes scale/chord fingerings and diatonic triads via the controller', () => {
    const letters = 'CDEFGAB';
    const ctrl = createCircleOfFifths({
      t: (k) => k,
      spellName: (li, acc) => enSpell(letters[li], acc),
      chordDisp: (c) => (typeof c === 'string' ? c : c?.symbol ?? ''),
      exKeyCtx: () => null,
      fillRefNames: vi.fn(),
      updateExplore: vi.fn(),
      playChordMidis: vi.fn(),
      playScaleNotes: vi.fn(),
      exploreSequence: vi.fn(),
      pushExploreTimer: vi.fn(),
      view0: () => 'explore',
      kbClear: vi.fn(),
      kbState: vi.fn(),
      fixedBottomTop: () => 600,
    });

    // Default state: C major scale.
    expect(ctrl.tonicPc()).toBe(0);
    const cMaj = ctrl.data();
    expect(cMaj.names).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C']);
    expect(cMaj.midis).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);

    const cChords = ctrl.chordList();
    expect(cChords.map((c) => `${c.roman}:${c.name}`)).toEqual([
      'I:C',
      'ii:Dm',
      'iii:Em',
      'IV:F',
      'V:G',
      'vi:Am',
      'vii°:B°',
    ]);

    // Switch to F# major (index 6) and chord mode.
    ctrl.state.i = 6;
    ctrl.state.minor = false;
    ctrl.state.mode = 'chord';
    expect(ctrl.tonicPc()).toBe(6);
    const fSharpTriad = ctrl.data();
    expect(fSharpTriad.names).toEqual(['F♯', 'A♯', 'C♯']);
    expect(fSharpTriad.midis).toEqual([66, 70, 73]);
  });
});

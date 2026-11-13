import { describe, expect, it } from 'vitest';
import { srtHandLine } from '../../src/sight-reading/patterns.ts';
import {
  SRT_LEVEL_BANDS, SRT_RULE_IDS, srtCheckRule, srtDifficulty, srtHandSpan, srtMinShifts, srtPhraseBars, srtRhythmLimit,
  srtRuleViolations, srtShiftLimit, srtSubBand,
} from '../../src/sight-reading/rules.ts';
import { srtLevel } from '../../src/sight-reading/levels.ts';
import { E, generated, Q } from './helpers/level-pieces.mjs';

const W = [[0, 4 * Q]];
const quarters = (...degrees) => degrees.map((degree) => [degree, Q]);
const CLOSE = [[2, Q], [1, Q], [0, 2 * Q]];
/** A level 3 piece that keeps rules G3 to G10: the melody goes right, left, right, left. */
const base = (changes = {}) => generated({
  level: 3, bars: 4, melody: ['rh', 'lh', 'rh', 'lh'], chords: [[0, 0], [4, 4], [4, 4], [0, 0]],
  rh: [quarters(0, 1, 2, 1), undefined, quarters(1, 2, 1, 2)],
  lh: [undefined, quarters(1, 2, 1, 1), undefined, CLOSE],
  ...changes,
});
const broken = (rule, piece) => srtCheckRule(rule, piece).length > 0;

describe('rules G3 to G10: chords and melody', () => {
  it('finds nothing wrong with a well-formed piece', () => {
    for (const rule of ['G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13']) {
      expect(srtCheckRule(rule, base()), rule).toEqual([]);
    }
  });

  it('G3: the chords belong to the level and the piece ends V to I', () => {
    expect(broken('G3', base({ chords: [[0, 0], [4, 4], [3, 3], [0, 0]] }))).toBe(true);
    expect(broken('G3', base({ chords: [[0, 0], [4, 4], [4, 4], [0, 4]] }))).toBe(true);
    expect(broken('G3', base({ chords: [[0, 0], [5, 5], [4, 4], [0, 0]] }))).toBe(true);
    expect(broken('G3', base({ chords: [[0, 0], [4, 4], [0, 0]] }))).toBe(true);
    expect(broken('G3', base({ chords: [[0, 0], [3, 4], [0, 4], [0, 0]] }))).toBe(false);
    // The richer chords belong to level 6 and up.
    expect(broken('G3', { ...base({ chords: [[0, 0], [5, 1], [4, 4], [0, 0]] }), level: 6 })).toBe(false);
  });

  it('G4: a note on a strong beat is a note of the chord', () => {
    expect(broken('G4', base({ rh: [quarters(1, 1, 2, 1), undefined, quarters(1, 2, 1, 2)] }))).toBe(true);
    expect(broken('G4', base({ rh: [quarters(0, 1, 3, 1), undefined, quarters(1, 2, 1, 2)] }))).toBe(true);
    // Beats 2 and 4 are free.
    expect(broken('G4', base({ rh: [quarters(0, 3, 2, 3), undefined, quarters(1, 2, 1, 2)] }))).toBe(false);
    // The chord of the second half of the bar governs beat 3.
    expect(broken('G4', base({ chords: [[0, 3], [4, 4], [4, 4], [0, 0]] }))).toBe(true);
    expect(broken('G4', base({ chords: [[0, 3], [4, 4], [4, 4], [0, 0]], rh: [quarters(0, 1, 3, 1), undefined, quarters(1, 2, 1, 2)] }))).toBe(false);
  });

  it('G5: at least 60% of the moves are steps or repeats', () => {
    expect(broken('G5', base({ rh: [quarters(0, 2, 4, 2), undefined, quarters(1, 4, 1, 4)], lh: [undefined, quarters(4, 1, 4, 1), undefined, CLOSE] }))).toBe(true);
    // 9 of 14 moves: just above the line.
    expect(broken('G5', base({ rh: [quarters(0, 2, 4, 2), undefined, quarters(1, 2, 1, 2)] }))).toBe(false);
  });

  it('G6: a leap of a fifth turns back by step', () => {
    expect(broken('G6', base({ rh: [quarters(0, 4, 4, 3), undefined, quarters(1, 2, 1, 2)] }))).toBe(true);
    expect(broken('G6', base({ rh: [quarters(0, 4, 2, 1), undefined, quarters(1, 2, 1, 2)] }))).toBe(true);
    expect(broken('G6', base({ rh: [quarters(0, 4, 3, 2), undefined, quarters(1, 2, 1, 2)] }))).toBe(false);
    expect(broken('G6', base({ rh: [quarters(4, 0, 1, 2), undefined, quarters(1, 2, 1, 2)] }))).toBe(false);
    // A fourth is not a large leap.
    expect(broken('G6', base({ rh: [quarters(0, 3, 4, 4), undefined, quarters(1, 2, 1, 2)] }))).toBe(false);
  });

  it('G7: from level 4 the highest note comes once, after the first bar', () => {
    const piece = (rh) => generated({ level: 4, bars: 4, rh, lh: [W, W, W, W] });
    expect(broken('G7', piece([quarters(0, 1, 2, 1), quarters(2, 3, 4, 3), quarters(2, 1, 2, 1), CLOSE]))).toBe(false);
    expect(broken('G7', piece([quarters(0, 1, 2, 1), quarters(2, 3, 4, 3), quarters(2, 3, 4, 3), CLOSE]))).toBe(true);
    expect(broken('G7', piece([quarters(2, 3, 4, 3), quarters(2, 1, 2, 1), quarters(2, 1, 2, 1), CLOSE]))).toBe(true);
    // Below level 4 the rule does not apply.
    expect(broken('G7', { ...piece([quarters(2, 3, 4, 3), quarters(2, 3, 4, 3), quarters(2, 1, 2, 1), CLOSE]), level: 3 })).toBe(false);
    // With an upbeat bar, the first full bar is bar 2.
    const upbeat = (second) => generated({
      level: 7, bars: 4, upbeat: true,
      rh: [[[null, 2 * Q], [null, Q], [0, Q]], second, quarters(2, 3, 5, 3), CLOSE], lh: [undefined, W, W, W],
    });
    expect(broken('G7', upbeat(quarters(0, 1, 2, 1)))).toBe(false);
    expect(broken('G7', upbeat(quarters(0, 1, 6, 1)))).toBe(true);
  });

  it('G8: the melody starts on 1, 3 or 5 and ends on the tonic, by step, on a long note', () => {
    expect(broken('G8', base({ rh: [quarters(1, 1, 2, 1), undefined, quarters(1, 2, 1, 2)] }))).toBe(true);
    expect(broken('G8', base({ lh: [undefined, quarters(1, 2, 1, 1), undefined, [[2, Q], [1, Q], [2, 2 * Q]]] }))).toBe(true);
    expect(broken('G8', base({ lh: [undefined, quarters(1, 2, 1, 1), undefined, [[2, Q], [2, Q], [0, 2 * Q]]] }))).toBe(true);
    expect(broken('G8', base({ lh: [undefined, quarters(1, 2, 1, 1), undefined, [[2, Q], [1, 2 * Q], [0, Q]]] }))).toBe(true);
    expect(broken('G8', base({ lh: [undefined, quarters(1, 2, 1, 1), undefined, [[1, Q], [0, 2 * Q], [null, Q]]] }))).toBe(true);
    // From level 4 the bass ends on the tonic too.
    const together = (bass) => generated({ level: 4, bars: 2, rh: [quarters(0, 1, 2, 1), CLOSE], lh: [W, [[bass, 4 * Q]]] });
    expect(broken('G8', together(0))).toBe(false);
    expect(broken('G8', together(2))).toBe(true);
    // In 3/8 the last note is the whole bar, a dotted quarter.
    const short = generated({ level: 6, meter: [3, 8], bars: 2, rh: [[[2, E], [1, E], [1, E]], [[0, 3 * E]]], lh: [[[0, 3 * E]], [[0, 3 * E]]] });
    expect(broken('G8', short)).toBe(false);
  });

  it('G9: a phrase stops on degree 2, 5 or 7, and the next one takes up the first rhythm', () => {
    expect(broken('G9', base({ lh: [undefined, quarters(1, 2, 1, 0), undefined, CLOSE] }))).toBe(true);
    expect(broken('G9', base({ lh: [undefined, quarters(1, 2, 3, 4), undefined, CLOSE] }))).toBe(false);
    expect(broken('G9', base({ rh: [quarters(0, 1, 2, 1), undefined, [[1, 2 * Q], [1, Q], [2, Q]]] }))).toBe(true);
    // In a minor key the seventh is not a resting point.
    const minor = (close) => generated({ level: 6, key: 'Am', bars: 4, rh: [quarters(0, 1, 2, 1), quarters(4, 5, 5, close), quarters(4, 3, 2, 1), CLOSE], lh: [W, W, W, W] });
    expect(broken('G9', minor(4))).toBe(false);
    expect(broken('G9', minor(6))).toBe(true);
    expect(broken('G9', { ...minor(6), key: { id: 'C', tonic: 'C', mode: 'major', keyN: 0 } })).toBe(false);
  });

  it('G10: few different bar rhythms before the last bar', () => {
    const rhythms = (second, third) => generated({ level: 4, bars: 4, rh: [quarters(0, 1, 2, 1), second, third, CLOSE], lh: [W, W, W, W] });
    expect(broken('G10', rhythms([[2, 2 * Q], [1, Q], [2, Q]], quarters(2, 1, 2, 1)))).toBe(false);
    expect(broken('G10', rhythms([[2, 2 * Q], [1, Q], [2, Q]], [[2, Q], [1, Q], [2, 2 * Q]]))).toBe(true);
    // A rest in place of a note is a different rhythm.
    expect(broken('G10', rhythms([[2, Q], [1, Q], [2, Q], [null, Q]], [[2, 2 * Q], [1, Q], [2, Q]]))).toBe(true);
    expect([4, 6, 8, 12].map(srtRhythmLimit)).toEqual([2, 3, 3, 4]);
    expect([4, 6, 8, 12].map(srtPhraseBars)).toEqual([2, 3, 4, 4]);
  });
});

describe('rules G11 to G13: two hands, fingering, spelling', () => {
  it('G11: the hands settle on strong beats and do not cross', () => {
    const two = (lh, key = 'C') => generated({ level: 6, key, bars: 2, rh: [quarters(0, 1, 2, 1), W], lh: [lh, W] });
    expect(broken('G11', two([[0, 4 * Q]]))).toBe(false);
    expect(broken('G11', two([[2, 4 * Q]]))).toBe(false);
    expect(srtCheckRule('G11', two([[4, 4 * Q]])).join()).toContain('dissonance');
    // A new bass note on beat 3 is measured against the melody note that sounds there.
    expect(broken('G11', two([[0, 2 * Q], [3, 2 * Q]]))).toBe(true);
    expect(broken('G11', two([[0, 2 * Q], [0, 2 * Q]]))).toBe(false);
    // In C the hands are an octave apart: left-hand degree 7 is middle C, the note of the right hand.
    expect(srtCheckRule('G11', two([[7, 4 * Q]])).join()).toContain('cross');
    expect(broken('G11', two([[7, 4 * Q]], 'G'))).toBe(false);
    // One hand at a time: nothing to compare.
    expect(broken('G11', { ...two([[4, 4 * Q]]), level: 3 })).toBe(false);
  });

  it('G12: the notes can be fingered within the position changes of the level', () => {
    const run = (levelId, rh, lh = [W, W, W, W]) => generated({ level: levelId, bars: 4, rh, lh });
    const low = quarters(0, 1, 0, 1);
    const high = quarters(7, 6, 7, 6);
    expect(broken('G12', run(6, [low, high, high, [[7, 4 * Q]]]))).toBe(false);
    expect(srtCheckRule('G12', run(6, [low, high, low, [[7, 4 * Q]]])).join()).toContain('3 position changes');
    expect(broken('G12', run(8, [low, high, low, [[7, 4 * Q]]]))).toBe(false);
    expect(broken('G12', run(5, [low, quarters(5, 4, 5, 4), low, W]))).toBe(false);
    expect(broken('G12', run(4, [low, quarters(5, 4, 5, 4), low, W]))).toBe(true);
    // Eighths that leap between positions inside a bar leave no time to move the hand.
    const jumps = [0, 4, 7, 3, 0, 4, 7, 3].map((degree) => [degree, E]);
    expect(srtCheckRule('G12', run(8, [jumps, W, W, W])).join()).toContain('no fingering');
    // A scale passes the thumb under: the hand may move between two notes a step apart.
    const scale = [0, 1, 2, 3, 4, 5, 6, 7].map((degree) => [degree, E]);
    expect(broken('G12', run(6, [scale, [[7, 4 * Q]], [[7, 4 * Q]], [[7, 4 * Q]]]))).toBe(false);
    expect(srtCheckRule('G12', run(8, [W, W, W, W], [[[[0, 7], 4 * Q]], W, W, W])).join()).toContain('wider than a sixth');
    expect(broken('G12', run(8, [W, W, W, W], [[[[0, 5], 4 * Q]], W, W, W]))).toBe(false);
  });

  it('counts the fewest position changes', () => {
    const shifts = (cells, span = 4) => srtMinShifts(srtHandLine(generated({ level: 8, bars: 1, rh: [cells], lh: [W] }), 'rh'), span);
    expect(shifts(quarters(0, 1, 2, 3))).toBe(0);
    expect(shifts(quarters(0, 4, 5, 9))).toBe(1);
    expect(shifts(quarters(0, 5, 0, 5))).toBe(3);
    expect(shifts(quarters(0, 5, 0, 5), 5)).toBe(0);
    expect(shifts([[0, E], [5, E], [0, 3 * Q]])).toBe(null);
    expect(shifts([[0, E], [null, E], [7, 3 * Q]])).toBe(1);
    expect(srtMinShifts([], 4)).toBe(0);
    expect([1, 4, 5, 6, 8].map((id) => srtHandSpan(srtLevel(id)))).toEqual([4, 4, 5, 5, 5]);
    expect([5, 6, 7, 8].map((id) => srtShiftLimit(srtLevel(id), 8))).toEqual([0, 2, 4, 6]);
    expect([5, 6, 7, 8].map((id) => srtShiftLimit(srtLevel(id), 8, 'lh'))).toEqual([0, 4, 8, 8]);
    expect(srtShiftLimit(srtLevel(8), 12)).toBe(9);
  });

  it('G13: accidentals only where the level has them', () => {
    expect(broken('G13', base({ rh: [[[0, Q], [1, Q, 1], [2, Q], [1, Q]], undefined, quarters(1, 2, 1, 2)] }))).toBe(true);
    expect(broken('G2', base({ rh: [[[0, Q], [1, Q, 1], [2, Q], [1, Q]], undefined, quarters(1, 2, 1, 2)] }))).toBe(true);
    const seven = generated({ level: 7, bars: 8, rh: [[[0, Q], [1, Q, 1], [2, Q], [1, Q]], ...Array.from({ length: 7 }, () => W)], lh: Array.from({ length: 8 }, () => W) });
    expect(broken('G13', seven)).toBe(false);
  });
});

describe('rules G14 and G16: difficulty and patterns', () => {
  it('G14: the stored score is the measured one, and it lies in the band of the level', () => {
    const piece = base();
    expect(piece.difficulty).toBe(srtDifficulty(piece));
    expect(srtCheckRule('G14', { ...piece, difficulty: piece.difficulty + 1 }).join()).toContain('stored difficulty');
    const flat = generated({ level: 8, bars: 8, rh: Array.from({ length: 8 }, () => W), lh: Array.from({ length: 8 }, () => W) });
    expect(srtCheckRule('G14', flat).join()).toContain('outside');
  });

  it('scores a piece higher when it has more to read', () => {
    const plain = base();
    const leaps = base({ rh: [quarters(0, 4, 3, 2), undefined, quarters(1, 4, 1, 2)] });
    const values = base({ rh: [[[0, E], [1, E], [2, Q], [1, 2 * Q]], undefined, quarters(1, 2, 1, 2)] });
    expect(srtDifficulty(leaps)).toBeGreaterThan(srtDifficulty(plain));
    expect(srtDifficulty(values)).toBeGreaterThan(srtDifficulty(plain));
    const altered = base({ rh: [[[0, Q], [1, Q, 1], [2, Q], [1, Q]], undefined, quarters(1, 2, 1, 2)] });
    expect(srtDifficulty(altered)).toBeGreaterThan(srtDifficulty(plain));
  });

  it('splits each band in three rising parts', () => {
    for (let level = 1; level <= 8; level += 1) {
      const band = SRT_LEVEL_BANDS[level];
      expect(band[0]).toBeLessThan(band[1]);
      expect(band[1]).toBeLessThan(band[2]);
      expect(band[2]).toBeLessThan(band[3]);
      expect([0, 1, 2].map((third) => srtSubBand(level, third))).toEqual([[band[0], band[1]], [band[1], band[2]], [band[2], band[3]]]);
    }
    expect(() => srtSubBand(9, 0)).toThrow(RangeError);
  });

  it('G16: the stored patterns are the ones in the notes, every bar shows one, and one is new at the level', () => {
    const sequence = base({ rh: [quarters(0, 1, 2, 1), undefined, quarters(1, 2, 1, 2)], lh: [undefined, quarters(1, 2, 3, 2), undefined, CLOSE] });
    expect(sequence.patterns[1]).toContain('sequence');
    expect(srtCheckRule('G16', sequence)).toEqual([]);
    expect(srtCheckRule('G16', { ...sequence, patterns: sequence.patterns.map((bar) => bar.filter((pattern) => pattern !== 'sequence')) }).join()).toContain('stored patterns');
    expect(srtCheckRule('G16', base()).join()).toContain('no new pattern');
    const zigzag = generated({ level: 1, bars: 4, melody: ['rh', 'rh', 'lh', 'lh'], rh: [quarters(0, 1, 0, 1), quarters(0, 1, 2, 2)], lh: [undefined, undefined, quarters(2, 1, 2, 1), CLOSE] });
    expect(srtCheckRule('G16', zigzag).join()).toContain('bar 1 shows no pattern');
  });

  it('lists every rule, and gathers what a piece breaks', () => {
    expect(SRT_RULE_IDS).toEqual(['G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14', 'G16']);
    const rules = srtRuleViolations(base({ chords: [[0, 0], [4, 4], [3, 3], [0, 0]] })).map((violation) => violation.rule);
    expect(rules).toContain('G3');
    expect(rules).not.toContain('G5');
  });
});

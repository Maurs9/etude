import { describe, expect, it } from 'vitest';
import { srtBarPatterns, srtChordAt, srtChordTones, srtHandLine, srtMelodyLine } from '../../src/sight-reading/patterns.ts';
import { E, planned, Q, S } from './helpers/level-pieces.mjs';

const W = [[0, 4 * Q]];
const quarters = (...degrees) => degrees.map((degree) => [degree, Q]);
/** The patterns of one bar of a two-bar piece at level 8, where every pattern is known. */
const found = (options, bar = 0) => srtBarPatterns(planned({ level: 8, bars: 2, ...options }))[bar];
const rhOnly = (cells) => ({ rh: [cells, W], lh: [W, W] });

describe('pattern recognisers', () => {
  it('finds each melodic pattern, and only where it is', () => {
    const cases = [
      ['stepRun', quarters(0, 1, 2, 1), quarters(0, 1, 0, 1)],
      ['repeatedNote', quarters(2, 2, 1, 0), quarters(0, 1, 2, 3)],
      ['skip', quarters(0, 2, 1, 0), quarters(0, 1, 2, 3)],
      ['neighbour', quarters(0, 1, 0, 2), quarters(0, 1, 2, 3)],
      ['brokenTriad', quarters(0, 2, 4, 2), quarters(0, 2, 1, 3)],
      ['leapFifth', quarters(0, 4, 3, 2), quarters(0, 3, 2, 1)],
      ['eighthRun', [[0, E], [1, E], [2, Q], [1, 2 * Q]], [[0, E], [2, E], [2, Q], [1, 2 * Q]]],
      ['dottedFigure', [[0, 3 * E], [1, E], [2, 2 * Q]], [[0, Q], [1, Q], [2, 2 * Q]]],
      ['scaleShift', [0, 1, 2, 3, 4, 5, 6, 7].map((degree) => [degree, E]), [0, 1, 2, 3, 4, 5, 4, 3].map((degree) => [degree, E])],
      ['sixteenthRun', [[0, S], [1, S], [2, S], [3, S], [4, Q], [3, 2 * Q]], [[0, S], [2, S], [1, S], [3, S], [4, Q], [3, 2 * Q]]],
      ['syncopation', [[0, E], [1, Q], [2, E], [1, 2 * Q]], [[0, Q], [1, Q], [2, 2 * Q]]],
      ['chromaticNeighbour', [[4, Q], [3, Q, 1], [4, Q], [2, Q]], quarters(4, 3, 4, 2)],
    ];
    for (const [pattern, yes, no] of cases) {
      expect(found(rhOnly(yes)), pattern).toContain(pattern);
      expect(found(rhOnly(no)), `not ${pattern}`).not.toContain(pattern);
    }
  });

  it('does not take a pattern across a rest', () => {
    expect(found(rhOnly([[0, Q], [1, Q], [null, Q], [2, Q]]))).not.toContain('stepRun');
    expect(found(rhOnly([[0, Q], [null, Q], [0, Q], [1, Q]]))).not.toContain('repeatedNote');
  });

  it('finds a long note, and none in a bar of short notes', () => {
    expect(found({ rh: [[[0, 2 * Q], [1, 2 * Q]], W], lh: [quarters(0, 0, 0, 0), W] })).toContain('longNote');
    expect(found({ rh: [quarters(0, 1, 2, 3), W], lh: [quarters(0, 1, 2, 3), W] })).not.toContain('longNote');
    // It is the melody that counts: a held note under a moving melody is not a bar of long notes.
    expect(found({ rh: [quarters(0, 1, 2, 3), W], lh: [W, W] })).not.toContain('longNote');
    expect(found({ rh: [[[0, 2 * Q], [1, Q], [2, Q]], W], lh: [W, W] })).not.toContain('longNote');
    expect(found({ rh: [W, W], lh: [quarters(0, 1, 2, 3), W], melody: ['lh', 'rh'] })).not.toContain('longNote');
    // In 3/8 the longest note is the bar itself.
    expect(found({ meter: [3, 8], rh: [[[0, 3 * E]], [[0, 3 * E]]], lh: [[[0, 3 * E]], [[0, 3 * E]]] })).toContain('longNote');
  });

  it('finds a sequence: the bar before, moved by a step or a third', () => {
    const lh = [W, W];
    expect(found({ rh: [quarters(0, 1, 2, 0), quarters(1, 2, 3, 1)], lh }, 1)).toContain('sequence');
    expect(found({ rh: [quarters(0, 1, 2, 0), quarters(2, 3, 4, 2)], lh }, 1)).toContain('sequence');
    expect(found({ rh: [quarters(0, 1, 2, 0), quarters(1, 2, 3, 2)], lh }, 1)).not.toContain('sequence');
    expect(found({ rh: [quarters(0, 1, 2, 0), quarters(0, 1, 2, 0)], lh }, 1)).not.toContain('sequence');
    expect(found({ rh: [quarters(0, 1, 2, 0), [[1, 2 * Q], [2, Q], [3, Q]]], lh }, 1)).not.toContain('sequence');
    expect(found({ rh: [quarters(0, 1, 2, 0), quarters(1, 2, 3, 1)], lh }, 0)).not.toContain('sequence');
    // The melody may change hands between the two bars.
    expect(found({ rh: [quarters(0, 1, 2, 0)], lh: [undefined, quarters(1, 2, 3, 1)], melody: ['rh', 'lh'] }, 1)).toContain('sequence');
  });

  it('finds the two-hand patterns', () => {
    const moving = quarters(0, 1, 2, 3);
    expect(found({ rh: [moving, W], lh: [W, W] })).toContain('heldNote');
    expect(found({ rh: [moving, W], lh: [moving, W] })).not.toContain('heldNote');
    expect(found({ rh: [moving, W], lh: [moving, W] })).toContain('parallelMotion');
    expect(found({ rh: [moving, W], lh: [moving, W] })).not.toContain('contraryMotion');
    expect(found({ rh: [moving, W], lh: [quarters(4, 3, 2, 1), W] })).toContain('contraryMotion');
    expect(found({ rh: [moving, W], lh: [quarters(4, 3, 2, 1), W] })).not.toContain('parallelMotion');
    // Two notes together do not make a motion: it takes two moves in a row.
    expect(found({ rh: [[[0, 2 * Q], [1, 2 * Q]], W], lh: [[[0, 2 * Q], [1, 2 * Q]], W] })).not.toContain('parallelMotion');
    expect(found({ rh: [W, W], lh: [[[[0, 4], 4 * Q]], W] })).toContain('twoNoteChord');
    expect(found({ rh: [W, W], lh: [W, W] })).not.toContain('twoNoteChord');
    expect(found({ rh: [[[[2, 4], 2 * Q], [[1, 3], 2 * Q]], W], lh: [[[[0, 4], 4 * Q]], W] })).toContain('chordsBothHands');
    expect(found({ rh: [[[[2, 4], 2 * Q], [[1, 3], 2 * Q]], W], lh: [W, W] })).not.toContain('chordsBothHands');
  });

  it('finds a tie in the bar where the tied note starts', () => {
    const tied = { rhFlat: [[0, Q], [1, Q], [2, 4 * Q], [1, Q], [0, Q]], lh: [W, W] };
    expect(found(tied, 0)).toContain('tie');
    expect(found(tied, 1)).not.toContain('tie');
  });

  it('finds a broken-chord bass only on the notes of the chord', () => {
    const rh = [W, W];
    expect(found({ rh, lh: [quarters(0, 4, 2, 4), W], chords: [[0, 0], [0, 0]] })).toContain('brokenChordBass');
    expect(found({ rh, lh: [quarters(0, 1, 2, 3), W], chords: [[0, 0], [0, 0]] })).not.toContain('brokenChordBass');
    expect(found({ rh, lh: [quarters(0, 4, 2, 4), W], chords: [[3, 3], [0, 0]] })).not.toContain('brokenChordBass');
    expect(found({ rh, lh: [quarters(3, 7, 3, 7), W], chords: [[3, 4], [0, 0]] })).not.toContain('brokenChordBass');
    expect(found({ rh, lh: [quarters(3, 7, 4, 8), W], chords: [[3, 4], [0, 0]] })).toContain('brokenChordBass');
  });

  it('finds an upbeat bar only when the piece starts with a rest', () => {
    const pickup = [[null, 2 * Q], [null, Q], [4, Q]];
    expect(found({ rh: [pickup, W], lh: [undefined, W], upbeat: true })).toContain('upbeat');
    expect(found({ rh: [pickup, W], lh: [undefined, W], upbeat: false })).not.toContain('upbeat');
    expect(found({ rh: [quarters(0, 1, 2, 3), W], lh: [undefined, W], upbeat: true })).not.toContain('upbeat');
    expect(found({ rh: [pickup, W], lh: [undefined, W], upbeat: true }, 1)).not.toContain('upbeat');
  });

  it('finds a scale run of seven notes that starts in the bar before', () => {
    const lh = [W, W];
    const across = { rh: [quarters(2, 0, 1, 2), quarters(3, 4, 5, 6)], lh };
    expect(found(across, 1)).toContain('scaleShift');
    expect(found(across, 0)).not.toContain('scaleShift');
    // Six notes fit under the hand: no change of position.
    expect(found({ rh: [quarters(2, 2, 1, 2), quarters(3, 4, 5, 6)], lh }, 1)).not.toContain('scaleShift');
    // A rest breaks the run.
    expect(found({ rh: [quarters(2, 0, 1, 2), [[3, Q], [null, Q], [4, Q], [5, Q]]], lhFlat: [[0, 8 * Q]] }, 1)).not.toContain('scaleShift');
    expect(found({ rh: [quarters(2, 7, 6, 5), quarters(4, 3, 2, 1)], lh }, 1)).toContain('scaleShift');
  });

  it('does not call the raised leading note of a minor key a chromatic neighbour', () => {
    expect(found({ key: 'Am', rh: [[[7, Q], [6, Q, 1], [7, Q], [5, Q]], W], lh: [W, W] })).not.toContain('chromaticNeighbour');
  });

  it('lists only the patterns the level knows', () => {
    const skips = { bars: 4, melody: ['rh', 'rh', 'lh', 'lh'], rh: [quarters(0, 2, 0, 2), quarters(0, 1, 2, 1)], lh: [undefined, undefined, quarters(0, 1, 2, 1), W] };
    expect(srtBarPatterns(planned({ level: 1, ...skips }))[0]).toEqual([]);
    expect(srtBarPatterns(planned({ level: 2, ...skips }))[0]).toEqual(['skip']);
    expect(srtBarPatterns(planned({ level: 1, ...skips }))[1]).toEqual(['stepRun', 'neighbour']);
    expect(srtBarPatterns(planned({ level: 1, ...skips }))[3]).toEqual(['longNote']);
  });
});

describe('lines and chords', () => {
  it('reads the notes of a hand with their degree, bar and place after a rest', () => {
    const piece = planned({ level: 8, key: 'G', bars: 2, rh: [[[0, Q], [null, Q], [[2, 4], Q], [1, Q, 1]], W], lh: [W, W] });
    const notes = srtHandLine(piece, 'rh');
    expect(notes.map((note) => note.line)).toEqual([0, 4, 1, 0]);
    expect(notes.map((note) => note.degrees)).toEqual([[0], [2, 4], [1], [0]]);
    expect(notes.map((note) => note.afterRest)).toEqual([false, true, false, false]);
    expect(notes.map((note) => note.bar)).toEqual([0, 0, 0, 1]);
    expect(notes[2].alter).toBe(1);
    expect(notes[0].midis).toEqual([67]);
    expect(srtHandLine(piece, 'rh')).toBe(notes);
    expect(srtHandLine(piece, 'lh').map((note) => note.line)).toEqual([0, 0]);
  });

  it('takes the bottom note of a left-hand chord as its line', () => {
    const piece = planned({ level: 8, bars: 1, rh: [W], lh: [[[[0, 4], 4 * Q]]] });
    expect(srtHandLine(piece, 'lh')[0].line).toBe(0);
  });

  it('follows the melody from hand to hand', () => {
    const piece = planned({ level: 3, bars: 2, rh: [quarters(0, 1, 2, 1)], lh: [undefined, quarters(4, 3, 2, 1)], melody: ['rh', 'lh'] });
    expect(srtMelodyLine(piece).map((note) => note.line)).toEqual([0, 1, 2, 1, 4, 3, 2, 1]);
  });

  it('names the chord of each half of a bar', () => {
    const piece = planned({ level: 8, bars: 2, rh: [W, W], lh: [W, W], chords: [[3, 4], [0, 0]] });
    expect([0, 2 * Q - 1, 2 * Q, 4 * Q - 1, 4 * Q].map((tick) => srtChordAt(piece, tick))).toEqual([3, 3, 4, 4, 0]);
    expect(srtChordTones(4)).toEqual([4, 6, 1]);
    expect(srtChordTones(0)).toEqual([0, 2, 4]);
  });
});

import { describe, expect, it } from 'vitest';
import { srtReadingKeys } from '../../src/sight-reading/levels.ts';
import { srtGenerateLevelPiece } from '../../src/sight-reading/melody.ts';
import { srtLevelClicks, srtLevelDurationMs, srtLevelExpected, srtLevelScore } from '../../src/sight-reading/score.ts';
import { srtFlashCards, srtFlashMatches, srtWarmupPlan, SRT_FLASH_MS } from '../../src/sight-reading/warmup.ts';
import { E, planned, Q } from './helpers/level-pieces.mjs';

const W = [[0, 4 * Q]];
const sum = (tokens) => tokens.reduce((total, token) => total + token[1], 0);

describe('level piece to engraver tokens', () => {
  it('writes notes, chords and rests with their length in quarters', () => {
    const piece = planned({ level: 8, key: 'D', bars: 2, rh: [[[0, Q], [null, Q], [[2, 4], E], [1, E, 1], [0, Q]], W], lh: [[[[0, 4], 4 * Q]], W] });
    const score = srtLevelScore(piece);
    expect(score).toMatchObject({ ts: [4, 4], keyN: 2, minor: false, engrave: 2, bpm: 72 });
    expect(score.rh).toEqual([['D4', 1], ['R', 1], [['F#4', 'A4'], 0.5], ['E#4', 0.5], ['D4', 1], ['D4', 4]]);
    expect(score.lh).toEqual([[['D3', 'A3'], 4], ['D3', 4]]);
  });

  it('splits a note at every barline it crosses and ties the parts', () => {
    const piece = planned({ level: 5, bars: 3, rhFlat: [[0, Q], [1, Q], [2, 6 * Q], [1, 4 * Q]], lh: [W, W, W] });
    expect(srtLevelScore(piece).rh).toEqual([['C4', 1], ['D4', 1], ['E4', 2], ['E4', 4, 'tied'], ['D4', 4]]);
    const chord = planned({ level: 8, bars: 2, rh: [W, W], lhFlat: [[[0, 4], 8 * Q]] });
    expect(srtLevelScore(chord).lh).toEqual([[['C3', 'G3'], 4], [['C3', 'G3'], 4, 'tied']]);
  });

  it('fills every bar exactly, in every meter, for generated pieces', () => {
    for (const level of [1, 3, 5, 6, 7, 8]) {
      for (const key of srtReadingKeys().filter((_, index) => index % 4 === 0)) {
        for (let seed = 0; seed < 12; seed += 1) {
          const piece = srtGenerateLevelPiece(level, key.id, seed);
          const score = srtLevelScore(piece);
          const bar = piece.meter.den === 4 ? piece.meter.num : piece.meter.num / 2;
          for (const tokens of [score.rh, score.lh]) {
            expect(sum(tokens)).toBeCloseTo(piece.bars * bar, 9);
            let at = 0;
            for (const token of tokens) {
              expect(Math.floor(at / bar + 1e-9)).toBe(Math.floor((at + token[1] - 1e-9) / bar));
              at += token[1];
            }
          }
          expect(score.ts).toEqual([piece.meter.num, piece.meter.den]);
          expect(score.minor).toBe(key.mode === 'minor');
        }
      }
    }
  });
});

describe('level piece timing', () => {
  it('measures the length by the bar, also in 3/8 and 6/8', () => {
    const bars = (meter, count) => planned({ level: 8, meter, bars: count, rh: [], lh: [] });
    expect(srtLevelDurationMs(bars([4, 4], 4), 60)).toBe(16000);
    expect(srtLevelDurationMs(bars([3, 4], 4), 60)).toBe(12000);
    expect(srtLevelDurationMs(bars([6, 8], 8), 60)).toBe(24000);
    expect(srtLevelDurationMs(bars([3, 8], 8), 120)).toBe(6000);
  });

  it('lists the notes to play in score order: by time, the right hand first, low notes first', () => {
    const piece = planned({ level: 8, bars: 1, rh: [[[[2, 4], 2 * Q], [null, Q], [1, Q]]], lh: [[[0, 4 * Q]]] });
    const expected = srtLevelExpected(piece, { bpm: 60 });
    expect(expected.map((note) => [note.hand, note.midi, note.onMs, note.offMs])).toEqual([
      ['rh', 64, 0, 2000], ['rh', 67, 0, 2000], ['lh', 48, 0, 4000], ['rh', 62, 3000, 4000],
    ]);
    expect(expected.map((note) => note.id)).toEqual(expected.map((note) => note.id.replace(/:\d+$/, '')).map((id, index) => `${id}:${[0, 1, 0, 0][index]}`));
    expect(new Set(expected.map((note) => note.id)).size).toBe(4);
    expect(srtLevelExpected(piece, { bpm: 60, hand: 'lh' }).map((note) => note.midi)).toEqual([48]);
    expect(srtLevelExpected(piece, { bpm: 120, latencyOffsetMs: 40 })[3].onMs).toBe(1540);
    // A note tied over a barline is played once.
    const tied = planned({ level: 5, bars: 2, rhFlat: [[0, 6 * Q], [1, 2 * Q]], lh: [W, W] });
    expect(srtLevelExpected(tied, { bpm: 60, hand: 'rh' }).map((note) => [note.onMs, note.offMs])).toEqual([[0, 6000], [6000, 8000]]);
    // Without a tempo the level's own tempo is used.
    expect(srtLevelExpected(piece)[3].onMs).toBe(Math.round(3 * 60000 / 72));
  });

  it('clicks once per beat: quarters in simple time, dotted quarters in compound time', () => {
    const clicks = (meter, bars, bpm) => srtLevelClicks(planned({ level: 8, meter, bars, rh: [], lh: [] }), bpm);
    expect(clicks([4, 4], 2, 60).map((click) => click.ms)).toEqual([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000]);
    expect(clicks([4, 4], 2, 60).map((click) => click.accent)).toEqual([true, false, false, false, true, false, false, false]);
    expect(clicks([6, 8], 2, 60)).toEqual([{ ms: 0, accent: true }, { ms: 1500, accent: false }, { ms: 3000, accent: true }, { ms: 4500, accent: false }]);
    // In 3/8 the bar is one beat: the metronome clicks the eighths, so a count-in bar has three clicks.
    expect(clicks([3, 8], 2, 60)).toEqual([
      { ms: 0, accent: true }, { ms: 500, accent: false }, { ms: 1000, accent: false },
      { ms: 1500, accent: true }, { ms: 2000, accent: false }, { ms: 2500, accent: false },
    ]);
    expect(clicks([3, 4], 1, 120).map((click) => click.ms)).toEqual([0, 500, 1000]);
  });
});

describe('warm-up', () => {
  it('makes flash cards of one bar, one hand, at least three notes', () => {
    for (const [level, key] of [[1, 'C'], [3, 'Em'], [5, 'Bb'], [7, 'F#m'], [8, 'B']]) {
      const cards = srtFlashCards(level, key, '2026-11-13');
      expect(cards).toHaveLength(6);
      expect(new Set(cards.map((card) => JSON.stringify(card.score))).size).toBe(6);
      for (const card of cards) {
        expect(card.level).toBe(level);
        expect(card.key).toBe(key);
        const tokens = card.hand === 'rh' ? card.score.rh : card.score.lh;
        expect(card.hand === 'rh' ? card.score.lh : card.score.rh).toEqual([]);
        const bar = card.score.ts[1] === 4 ? card.score.ts[0] : card.score.ts[0] / 2;
        expect(sum(tokens)).toBeCloseTo(bar, 9);
        expect(card.notes.length).toBeGreaterThanOrEqual(3);
        expect(card.notes.length).toBe(tokens.filter((token) => token[0] !== 'R').length);
        expect(card.patterns.length).toBeGreaterThan(0);
        expect(card.score.engrave).toBe(2);
      }
    }
    expect(srtFlashCards(4, 'G', 'a')).toEqual(srtFlashCards(4, 'G', 'a'));
    expect(srtFlashCards(4, 'G', 'a')).not.toEqual(srtFlashCards(4, 'G', 'b'));
    expect(srtFlashCards(4, 'G', 'a', 3)).toHaveLength(3);
    expect(SRT_FLASH_MS).toBe(2000);
  });

  it('checks what was played against a card', () => {
    const [card] = srtFlashCards(2, 'C', 'x');
    expect(srtFlashMatches(card, card.notes)).toBe(true);
    expect(srtFlashMatches(card, card.notes.slice(1))).toBe(false);
    expect(srtFlashMatches(card, [...card.notes].reverse())).toBe(JSON.stringify(card.notes) === JSON.stringify([...card.notes].reverse()));
    const octaveUp = card.notes.map((notes) => notes.map((midi) => midi + 12));
    expect(srtFlashMatches(card, octaveUp)).toBe(false);
    expect(srtFlashMatches(card, octaveUp, true)).toBe(true);
    const wrong = card.notes.map((notes, index) => (index === 0 ? [notes[0] + 1] : notes));
    expect(srtFlashMatches(card, wrong, true)).toBe(false);
  });

  it('plans flash cards, the position of each hand, a rhythm drill, and chords from level 6', () => {
    const kinds = (level, key) => srtWarmupPlan(level, key, 'd').map((step) => (step.kind === 'drill' ? step.id : step.kind === 'position' ? `${step.hand}:${step.low}-${step.high}:${step.keyN}` : step.kind));
    expect(kinds(1, 'C')).toEqual(['flash', 'rh:C4-G4:0', 'lh:C3-G3:0', 'rh1']);
    expect(kinds(3, 'G')).toEqual(['flash', 'rh:G4-D5:1', 'lh:G2-D3:1', 'rh2']);
    expect(kinds(5, 'Bb')).toEqual(['flash', 'rh:Bb4-G5:-2', 'lh:Bb2-G3:-2', 'rh4']);
    expect(kinds(6, 'Am')).toEqual(['flash', 'rh:A4-A5:0', 'lh:A2-A3:0', 'rh5', 'ch1']);
    expect(kinds(8, 'Ebm')).toEqual(['flash', 'rh:Eb4-Eb5:-6', 'lh:Eb3-Eb4:-6', 'rh5', 'ch3']);
    const plan = srtWarmupPlan(2, 'F', 'd');
    expect(plan[0].cards).toHaveLength(6);
    expect(plan[1]).toMatchObject({ kind: 'position', clef: 'treble', count: 5 });
    expect(plan[2]).toMatchObject({ kind: 'position', clef: 'bass', count: 5 });
    expect(() => srtWarmupPlan(9, 'C', 'd')).toThrow(RangeError);
    expect(() => srtWarmupPlan(1, 'H', 'd')).toThrow(RangeError);
  });
});

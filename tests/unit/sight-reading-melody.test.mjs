import { describe, expect, it } from 'vitest';
import { srtLevel, srtLevelViolations, srtReadingKeys } from '../../src/sight-reading/levels.ts';
import { srtGenerateLevelPiece, srtHashText, srtPieceText, srtTransposeLevelPiece } from '../../src/sight-reading/melody.ts';
import { srtHandLine, srtMelodyLine } from '../../src/sight-reading/patterns.ts';
import { SRT_LEVEL_BANDS, SRT_RULE_IDS, srtCheckRule, srtRuleViolations } from '../../src/sight-reading/rules.ts';

const LEVEL_IDS = [1, 2, 3, 4, 5, 6, 7, 8];
const KEY_IDS = srtReadingKeys().map((key) => key.id);
const SEEDS = 60;
const LONG = 240000;

// 60 seeds in 24 keys at 8 levels: 11,520 pieces, built once and shared by the tests below.
let sample = null;
function pieces() {
  if (!sample) {
    sample = [];
    for (const level of LEVEL_IDS) for (const key of KEY_IDS) for (let seed = 0; seed < SEEDS; seed += 1) sample.push(srtGenerateLevelPiece(level, key, seed));
  }
  return sample;
}
const ofLevel = (level) => pieces().filter((piece) => piece.level === level);
const share = (list, test) => list.filter(test).length / list.length;

describe('level piece generator', () => {
  it('gives a piece for every seed, key and level', () => {
    expect(pieces()).toHaveLength(LEVEL_IDS.length * KEY_IDS.length * SEEDS);
    for (const piece of pieces()) {
      expect(piece.generatorVersion).toBe(2);
      expect(piece.events.length).toBeGreaterThan(0);
    }
  }, LONG);

  it('G2: keeps every piece inside the limits of its level', () => {
    for (const piece of pieces()) expect(srtLevelViolations(piece), `${piece.level} ${piece.key.id} ${piece.seed}`).toEqual([]);
  }, LONG);

  for (const rule of SRT_RULE_IDS.filter((id) => id !== 'G2')) {
    it(`${rule}: holds for every piece`, () => {
      for (const piece of pieces()) expect(srtCheckRule(rule, piece), `${piece.level} ${piece.key.id} ${piece.seed}`).toEqual([]);
    }, LONG);
  }

  it('G1: the same level, key and seed give the same piece', () => {
    for (const level of LEVEL_IDS) {
      for (const key of ['C', 'F#', 'Am', 'Ebm']) {
        const again = srtGenerateLevelPiece(level, key, 7);
        expect(again).toEqual(pieces().find((piece) => piece.level === level && piece.key.id === key && piece.seed === 7));
      }
    }
  }, LONG);

  it('gives different pieces for different seeds and for different keys', () => {
    const shape = (piece) => JSON.stringify([piece.meter, piece.bars, srtMelodyLine(piece).map((note) => [note.onset, note.duration, note.line])]);
    for (const level of LEVEL_IDS) {
      const inC = ofLevel(level).filter((piece) => piece.key.id === 'C');
      expect(new Set(inC.map(shape)).size, `level ${level}`).toBeGreaterThan(SEEDS * 0.9);
      // Seed 3 in 12 major keys: the key is part of the seed, so the pieces are not transpositions of each other.
      const sameSeed = ofLevel(level).filter((piece) => piece.seed === 3 && piece.key.mode === 'major');
      expect(new Set(sameSeed.map(shape)).size, `level ${level}`).toBeGreaterThan(9);
    }
  }, LONG);

  it('uses every meter and bar count of a level', () => {
    for (const level of LEVEL_IDS) {
      const meters = new Set(ofLevel(level).map((piece) => `${piece.meter.num}/${piece.meter.den}`));
      expect([...meters].sort()).toEqual(srtLevel(level).meters.map((meter) => `${meter.num}/${meter.den}`).sort());
      expect([...new Set(ofLevel(level).map((piece) => piece.bars))].sort((a, b) => a - b)).toEqual([...srtLevel(level).bars]);
    }
  }, LONG);

  it('shows every new pattern of a level in a fair share of its pieces', () => {
    for (const level of LEVEL_IDS) {
      for (const pattern of srtLevel(level).newPatterns) {
        expect(share(ofLevel(level), (piece) => piece.patterns.flat().includes(pattern)), `level ${level} ${pattern}`).toBeGreaterThan(0.05);
      }
    }
  }, LONG);

  it('uses both hands as the level says', () => {
    expect(share(ofLevel(1), (piece) => piece.melody[0] === 'lh')).toBeGreaterThan(0.3);
    expect(share(ofLevel(1), (piece) => piece.melody[0] === 'rh')).toBeGreaterThan(0.3);
    expect(share(ofLevel(4), (piece) => piece.melody.includes('lh'))).toBeGreaterThan(0.3);
    for (const piece of ofLevel(6)) expect(piece.melody.every((hand) => hand === 'rh')).toBe(true);
    expect(share(ofLevel(7), (piece) => piece.upbeat)).toBeGreaterThan(0.1);
    expect(share(ofLevel(6), (piece) => piece.upbeat)).toBe(0);
  }, LONG);

  it('raises the seventh of a minor key from level 6, and never in G sharp minor', () => {
    const raised = (piece) => srtMelodyLine(piece).some((note) => note.alter === 1 && ((note.line % 7) + 7) % 7 === 6);
    const minor = (level) => ofLevel(level).filter((piece) => piece.key.mode === 'minor' && piece.key.id !== 'G#m');
    expect(share(minor(6), raised)).toBeGreaterThan(0.12);
    expect(share(minor(7), raised)).toBeGreaterThan(0.5);
    expect(share(minor(8), raised)).toBeGreaterThan(0.5);
    expect(share(minor(5), raised)).toBe(0);
    for (const piece of pieces().filter((item) => item.key.id === 'G#m')) expect(raised(piece)).toBe(false);
    // The left hand leaves the seventh of a minor key to the melody.
    for (const piece of pieces().filter((item) => item.key.mode === 'minor' && item.level >= 5)) {
      expect(srtHandLine(piece, 'lh').some((note) => note.degrees.some((degree) => ((degree % 7) + 7) % 7 === 6))).toBe(false);
    }
  }, LONG);

  it('spreads the pieces of a level over its difficulty band', () => {
    for (const level of LEVEL_IDS) {
      const band = SRT_LEVEL_BANDS[level];
      for (const third of [0, 1, 2]) {
        expect(share(ofLevel(level), (piece) => piece.difficulty >= band[third] && piece.difficulty <= band[third + 1]), `level ${level} third ${third}`).toBeGreaterThan(0.12);
      }
    }
  }, LONG);

  it('draws a piece from a narrower band on request', () => {
    for (const level of [1, 4, 8]) {
      const band = SRT_LEVEL_BANDS[level];
      for (const range of [[band[0], band[1]], [band[2], band[3]]]) {
        const piece = srtGenerateLevelPiece(level, 'D', 5, { band: range });
        expect(piece.difficulty).toBeGreaterThanOrEqual(range[0]);
        expect(piece.difficulty).toBeLessThanOrEqual(range[1]);
        expect(srtRuleViolations(piece)).toEqual([]);
      }
    }
  });

  it('reports why an attempt was dropped, and fails when nothing fits', () => {
    const reasons = [];
    srtGenerateLevelPiece(8, 'C#m', 12, { trace: (reason) => reasons.push(reason) });
    for (const reason of reasons) expect(reason).toMatch(/^(melody|hands|spelling|band|G\d+:)/);
    expect(() => srtGenerateLevelPiece(1, 'C', 1, { band: [90, 99] })).toThrow(/No level 1 piece/);
    expect(() => srtGenerateLevelPiece(9, 'C', 1)).toThrow(RangeError);
    expect(() => srtGenerateLevelPiece(1, 'H', 1)).toThrow(RangeError);
    expect(() => srtGenerateLevelPiece(1, 'C', 1.5)).toThrow(RangeError);
  });

  it('moves a piece to another key of the same mode, degree by degree', () => {
    // G and A hold the hands two octaves apart. In D they are one octave apart, so a moved piece may not fit.
    const piece = srtGenerateLevelPiece(5, 'G', 4);
    const moved = srtTransposeLevelPiece(piece, 'A');
    expect(moved).not.toBeNull();
    expect(moved.key.id).toBe('A');
    expect(srtMelodyLine(moved).map((note) => [note.onset, note.duration, note.line, note.alter]))
      .toEqual(srtMelodyLine(piece).map((note) => [note.onset, note.duration, note.line, note.alter]));
    expect(moved.patterns).toEqual(piece.patterns);
    expect(moved.difficulty).toBe(piece.difficulty);
    expect(srtRuleViolations(moved)).toEqual([]);
    expect(srtTransposeLevelPiece(piece, 'Em')).toBeNull();
    // A raised seventh has no spelling in G sharp minor.
    const minor = pieces().find((item) => item.level === 6 && item.key.id === 'Am' && srtMelodyLine(item).some((note) => note.alter === 1));
    expect(srtTransposeLevelPiece(minor, 'G#m')).toBeNull();
    expect(srtTransposeLevelPiece(minor, 'Bm')).not.toBeNull();
  }, LONG);

  it('writes a piece as text', () => {
    const piece = srtGenerateLevelPiece(1, 'C', 2);
    const text = srtPieceText(piece);
    expect(text.rh.split(' | ')).toHaveLength(4);
    expect(text.lh.split(' | ')).toHaveLength(4);
    expect(`${text.rh} ${text.lh}`).toMatch(/^([A-G][#b]?\d\.(w|h|q)|R\.w|\|| )+$/);
    expect(srtHashText('abc')).toBe(srtHashText('abc'));
    expect(srtHashText('abc')).not.toBe(srtHashText('abd'));
    expect(Number.isInteger(srtHashText('book|1|1'))).toBe(true);
  });
});

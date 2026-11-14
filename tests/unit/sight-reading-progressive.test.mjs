import { describe, expect, it } from 'vitest';
import { srtLongPiece } from '../../src/sight-reading/book.ts';
import { srtLevelFingerprint } from '../../src/sight-reading/fingerprint.ts';
import { srtKeyPool, srtLevel, srtMeterTicks, srtReadingKeys } from '../../src/sight-reading/levels.ts';
import { srtLongId } from '../../src/sight-reading/progress.ts';
import {
  SRT_LONG_MAX_BARS, srtGenerateProgressivePiece, srtProgressivePlan, srtProgressiveViolations,
} from '../../src/sight-reading/progressive.ts';
import { srtLevelClicks, srtLevelExpected, srtLevelScore } from '../../src/sight-reading/score.ts';

const LEVEL_IDS = [1, 2, 3, 4, 5, 6, 7, 8];
const KEY_IDS = srtReadingKeys().map((key) => key.id);
// Keys of every age: C and Am from level 1, D from 3, Eb and Cm from 5, E from 7, B and Ebm from 8.
const SWEEP_KEYS = ['C', 'Am', 'D', 'Eb', 'Cm', 'E', 'B', 'Ebm'];
const SEEDS = 20;
const LONG = 240000;
const shape = (plan) => plan.map((step) => [step.level, step.third]);

let sample = null;
function pieces() {
  if (!sample) {
    sample = [];
    for (const level of LEVEL_IDS) for (const key of SWEEP_KEYS) for (let seed = 0; seed < SEEDS; seed += 1) sample.push(srtGenerateProgressivePiece(level, key, seed));
  }
  return sample;
}

describe('the plan of a long piece', () => {
  it('ramps up to the level asked for', () => {
    expect(shape(srtProgressivePlan(1, 'C'))).toEqual([[1, 0], [1, 1], [1, 2], [1, 2]]);
    expect(shape(srtProgressivePlan(2, 'C'))).toEqual([[1, 1], [1, 2], [2, 1], [2, 2]]);
    expect(shape(srtProgressivePlan(3, 'C'))).toEqual([[1, 2], [2, 1], [3, 0], [3, 2]]);
    // Level 8: 12 + 16 + 16 + 16 bars is too long, so the level 6 section goes.
    expect(shape(srtProgressivePlan(8, 'C'))).toEqual([[7, 1], [8, 0], [8, 2]]);
    expect(shape(srtProgressivePlan(7, 'C'))).toEqual([[6, 1], [7, 0], [7, 2]]);
  });

  it('keeps a lower section only in a key of its pool', () => {
    // D is new at level 3: the level 1 and 2 sections move to level 3, in its easiest third.
    expect(shape(srtProgressivePlan(3, 'D'))).toEqual([[3, 0], [3, 0], [3, 0], [3, 2]]);
    // E is new at level 7: the level 6 section moves to level 7.
    expect(shape(srtProgressivePlan(8, 'E'))).toEqual([[7, 1], [8, 0], [8, 2]]);
    expect(shape(srtProgressivePlan(8, 'B'))).toEqual([[8, 0], [8, 0], [8, 2]]);
    // A key no level up to the one asked for knows: its own level, easiest third.
    expect(shape(srtProgressivePlan(2, 'B'))).toEqual([[2, 0], [2, 0], [2, 1], [2, 2]]);
  });

  it('is never longer than 48 bars', () => {
    for (const level of LEVEL_IDS) {
      for (const key of KEY_IDS) {
        const plan = srtProgressivePlan(level, key);
        const bars = plan.reduce((sum, step) => sum + srtLevel(step.level).bars[0], 0);
        expect(bars, `${level} ${key}`).toBeLessThanOrEqual(SRT_LONG_MAX_BARS);
        expect(plan.at(-1).level).toBe(level);
        for (const step of plan.slice(0, -1)) {
          if (step.level < level) expect(srtKeyPool(step.level).map((item) => item.id)).toContain(key);
        }
      }
    }
  });

  it('refuses an unknown level or key', () => {
    expect(() => srtProgressivePlan(9, 'C')).toThrow(RangeError);
    expect(() => srtProgressivePlan(1, 'H')).toThrow(RangeError);
    expect(() => srtGenerateProgressivePiece(1, 'C', 1.5)).toThrow(RangeError);
  });
});

describe('a long piece', () => {
  it('keeps every rule in every section, and joins the sections cleanly', () => {
    for (const piece of pieces()) {
      expect(srtProgressiveViolations(piece), `${piece.level} ${piece.key.id} ${piece.seed}`).toEqual([]);
      expect(piece.bars).toBeLessThanOrEqual(SRT_LONG_MAX_BARS);
      expect(piece.upbeat).toBe(false);
      expect(piece.sections.at(-1).level).toBe(piece.level);
      expect(piece.difficulty).toBeGreaterThan(0);
      for (const section of piece.sections) {
        expect(srtLevel(section.level).meters.map((meter) => `${meter.num}/${meter.den}`)).toContain(`${piece.meter.num}/${piece.meter.den}`);
      }
    }
  }, LONG);

  it('is the same piece for the same seed, and another for another seed', () => {
    for (const level of LEVEL_IDS) {
      const again = srtGenerateProgressivePiece(level, 'Am', 7);
      expect(again).toEqual(pieces().find((piece) => piece.level === level && piece.key.id === 'Am' && piece.seed === 7));
      expect(srtLevelFingerprint(again)).toBe(srtLevelFingerprint(srtGenerateProgressivePiece(level, 'Am', 7)));
      expect(srtLevelFingerprint(again)).not.toBe(srtLevelFingerprint(srtGenerateProgressivePiece(level, 'Am', 8)));
    }
  }, LONG);

  it('numbers its events per hand, in order, without gaps or repeats', () => {
    for (const piece of pieces()) {
      for (const hand of ['rh', 'lh']) {
        const events = piece.events.filter((event) => event.hand === hand);
        expect(events.map((event) => event.id)).toEqual(events.map((_, index) => `${hand}-${index}`));
        expect(events.every((event, index) => index === 0 || events[index - 1].onsetTick < event.onsetTick)).toBe(true);
      }
    }
  }, LONG);

  it('plays at the slowest tempo of its section levels', () => {
    for (const piece of pieces()) expect(piece.bpm).toBe(Math.min(...piece.sections.map((section) => srtLevel(section.level).bpm)));
  }, LONG);

  it('works with the score, the expected notes, the clicks and the fingerprint as they are', () => {
    for (const piece of pieces()) {
      const { bar, beat } = srtMeterTicks(piece.meter);
      const score = srtLevelScore(piece);
      for (const hand of ['rh', 'lh']) {
        const total = score[hand].reduce((sum, token) => sum + token[1], 0);
        expect(total, `${piece.level} ${piece.key.id} ${piece.seed} ${hand}`).toBeCloseTo(piece.bars * bar / 480, 9);
      }
      const expected = srtLevelExpected(piece, { bpm: piece.bpm });
      const perSection = piece.sections.reduce((sum, section) => sum + piece.events
        .filter((event) => event.onsetTick >= section.startBar * bar && event.onsetTick < (section.startBar + section.bars) * bar)
        .reduce((inner, event) => inner + event.pitches.length, 0), 0);
      expect(expected).toHaveLength(perSection);
      expect(new Set(expected.map((note) => note.id)).size).toBe(expected.length);
      const clicks = srtLevelClicks(piece, piece.bpm);
      expect(clicks.filter((click) => click.accent)).toHaveLength(piece.bars);
      if (!(piece.meter.den === 8 && beat === bar)) expect(clicks).toHaveLength(piece.bars * bar / beat);
      expect(srtLevelFingerprint(piece)).toMatch(/^v2:[0-9a-f]{16}$/);
    }
  }, LONG);

  it('reports a broken join', () => {
    const piece = srtGenerateProgressivePiece(3, 'C', 1);
    const rules = (broken) => srtProgressiveViolations(broken).map((item) => item.rule);
    expect(rules({ ...piece, sections: piece.sections.slice(1) })).toContain('join');
    expect(rules({ ...piece, events: [...piece.events, piece.events[0]] })).toContain('join');
    expect(rules({ ...piece, upbeat: true })).toContain('join');
    expect(rules({ ...piece, events: piece.events.map((event, index) => (index === 0 ? { ...event, id: 'x' } : event)) })).toContain('join');
    const { bar } = srtMeterTicks(piece.meter);
    const join = piece.sections[1].startBar * bar;
    const before = piece.events.find((event) => event.onsetTick + event.durationTick === join && event.hand === 'rh');
    const stretched = piece.events.map((event) => (event === before ? { ...event, durationTick: event.durationTick + 480 } : event));
    expect(rules({ ...piece, events: stretched })).toContain('join');
    const last = piece.events.at(-1);
    expect(rules({ ...piece, events: [...piece.events, { ...last, id: `${last.hand}-999`, onsetTick: piece.bars * bar }] })).toContain('join');
    // A section that breaks its level's rules is named.
    const wrong = srtProgressiveViolations({ ...piece, sections: piece.sections.map((section, index) => (index === 0 ? { ...section, level: 5 } : section)) });
    expect(wrong.some((item) => item.section === 0)).toBe(true);
    expect(srtProgressiveViolations(null)).toEqual([{ section: null, rule: 'join', detail: 'not a long piece' }]);
  });
});

describe('the long piece of a day', () => {
  it('is seeded from the date, the level, the index and the key', () => {
    const piece = srtLongPiece(4, 'G', '2026-11-14', 0);
    expect(srtLongPiece(4, 'G', '2026-11-14', 0)).toEqual(piece);
    expect(srtLevelFingerprint(srtLongPiece(4, 'G', '2026-11-14', 1))).not.toBe(srtLevelFingerprint(piece));
    expect(srtLevelFingerprint(srtLongPiece(4, 'G', '2026-11-15', 0))).not.toBe(srtLevelFingerprint(piece));
    expect(piece.level).toBe(4);
    expect(piece.key.id).toBe('G');
    expect(srtProgressiveViolations(piece)).toEqual([]);
    expect(() => srtLongPiece(4, 'G', '14.11.2026', 0)).toThrow(RangeError);
    expect(() => srtLongPiece(4, 'G', '2026-11-14', -1)).toThrow(RangeError);
    expect(srtLongId('2026-11-14', 2)).toBe('l2026-11-14.2');
  });
});

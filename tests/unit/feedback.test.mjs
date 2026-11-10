import { describe, expect, it } from 'vitest';
import { CONTRAST_LENGTH, ConfusionLog, contrastOrder, feedbackBroken, feedbackChords, feedbackLine, feedbackSchedule } from '../../src/domain/feedback.ts';

describe('hear both', () => {
  it('plays the given sound, pauses, then plays the expected one', () => {
    const notes = feedbackSchedule(feedbackBroken([60, 63]), feedbackBroken([60, 64]), 0.7);
    expect(notes.map((note) => [note.midi, note.at])).toEqual([
      [60, 0], [63, 0.45], [60, 0.9], [63, 0.9],
      [60, 2.5], [64, 2.95], [60, 3.4], [64, 3.4],
    ]);
    expect(notes.every((note) => note.dur === 0.9)).toBe(true);
  });

  it('schedules single notes, scales and progressions', () => {
    expect(feedbackSchedule(feedbackLine([63]), feedbackLine([64]), 0.5).map((note) => [note.midi, note.at])).toEqual([[63, 0], [64, 0.8]]);
    const prog = feedbackSchedule(feedbackChords([[60, 64, 67], [65, 69, 72]]), feedbackChords([[60, 64, 67]]));
    expect(prog.filter((note) => note.at === 0)).toHaveLength(3);
    expect(prog.filter((note) => note.at === 0.9)).toHaveLength(3);
    expect(prog.at(-1).at).toBeCloseTo(0.9 + 0.8 + 0.7);
  });
});

describe('confusion log', () => {
  it('counts a pair in both directions and reports it once it repeats', () => {
    const log = new ConfusionLog();
    log.record('iv:4', 'iv:3');
    expect(log.top()).toBeNull();
    log.record('iv:3', 'iv:4');
    expect(log.top()).toEqual({ expected: 'iv:4', given: 'iv:3', count: 2 });
    log.record('ch:m', 'ch:dim');
    log.record('ch:m', 'ch:dim');
    log.record('ch:m', 'ch:dim');
    expect(log.top()).toMatchObject({ expected: 'ch:m', given: 'ch:dim', count: 3 });
  });

  it('ignores empty and identical answers and starts over when cleared', () => {
    const log = new ConfusionLog();
    log.record('iv:4', 'iv:4');
    log.record('iv:4', '');
    log.record('iv:4', 'iv:3');
    log.record('iv:4', 'iv:3');
    expect(log.top()).not.toBeNull();
    log.clear();
    expect(log.top(1)).toBeNull();
  });
});

describe('contrast drill order', () => {
  it('asks each item equally often, never three of one in a row', () => {
    for (let seed = 1; seed < 200; seed += 1) {
      let value = seed;
      const random = () => ((value = (value * 16807) % 2147483647) / 2147483647);
      const order = contrastOrder('a', 'b', CONTRAST_LENGTH, random);
      expect(order).toHaveLength(6);
      expect(order.filter((item) => item === 'a')).toHaveLength(3);
      expect(order.some((item, index) => index >= 2 && item === order[index - 1] && item === order[index - 2])).toBe(false);
    }
  });
});

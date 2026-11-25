import { describe, expect, it } from 'vitest';
import {
  classifyUnmatchedKeyPress,
  extractSustainMistakes,
  groupPracticeMistakes,
  practicePassageBounds,
} from '../../src/domain/practice-mistakes.ts';

describe('practice mistakes analysis', () => {
  it('classifies unmatched key presses into timing slips vs extra wrong keys', () => {
    const candidates = [
      { midi: 60, start: 1.0, judged: true },
      { midi: 64, start: 2.0, judged: false },
    ];
    expect(classifyUnmatchedKeyPress(64, 2.38, candidates, 1.0, false)).toBe('timing');
    expect(classifyUnmatchedKeyPress(65, 2.02, candidates, 1.0, false)).toBe('extra');
    expect(classifyUnmatchedKeyPress(76, 2.38, candidates, 1.0, false)).toBe('extra');
    expect(classifyUnmatchedKeyPress(76, 2.38, candidates, 1.0, true)).toBe('timing');
  });

  it('extracts pedal miss, early, and late events with measure attribution', () => {
    const expected = [
      { time: 1.0, down: true },
      { time: 2.0, down: false },
      { time: 3.0, down: true },
      { time: 4.0, down: false },
    ];
    const played = [
      { time: 0.7, down: true },   // early press against 1.0
      { time: 2.45, down: false }, // late release against 2.0
      // 3.0 press missed; 4.0 release missed
    ];
    const locate = (t) => ({
      measureIndex: Math.floor(t),
      measureNumber: String(Math.floor(t) + 1),
      pass: t >= 3 ? 2 : 1,
      beat: t,
    });
    const out = extractSustainMistakes(expected, played, 1.0, locate);
    expect(out.map((e) => [e.measureNumber, e.pass, e.kind])).toEqual([
      ['2', 1, 'pedal_early'],
      ['4', 2, 'pedal_miss'],
      ['3', 1, 'pedal_late'],
      ['5', 2, 'pedal_miss'],
    ]);
  });

  it('groups events by pass and measure index chronologically', () => {
    const groups = groupPracticeMistakes([
      { measureIndex: 5, measureNumber: '6', pass: 2, beat: 1, kind: 'pedal_late' },
      { measureIndex: 3, measureNumber: '4', pass: 1, beat: 2, kind: 'extra', midi: 65 },
      { measureIndex: 3, measureNumber: '4', pass: 1, beat: 0, kind: 'miss', midi: 64 },
      { measureIndex: 3, measureNumber: '4', pass: 2, beat: 1, kind: 'miss', midi: 64 },
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0].pass).toBe(1);
    expect(groups[0].measureNumber).toBe('4');
    expect(groups[0].events.map((e) => e.kind)).toEqual(['miss', 'extra']);
    expect(groups[1].pass).toBe(2);
    expect(groups[1].measureNumber).toBe('4');
    expect(groups[2].measureNumber).toBe('6');
  });

  it('clamps repeat passage bounds at first, middle, last, and single-bar boundaries', () => {
    expect(practicePassageBounds(0, 8)).toEqual({ startIndex: 0, endIndex: 1 });
    expect(practicePassageBounds(3, 8)).toEqual({ startIndex: 2, endIndex: 4 });
    expect(practicePassageBounds(7, 8)).toEqual({ startIndex: 6, endIndex: 7 });
    expect(practicePassageBounds(0, 1)).toEqual({ startIndex: 0, endIndex: 0 });
  });
});

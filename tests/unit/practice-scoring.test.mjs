import { expect, it } from 'vitest';
import { gradePracticeSustain, practiceAccuracy, practicePercent, practiceSustainReference } from '../../src/domain/practice-scoring.ts';

const down = time => ({ time, down: true });
const up = time => ({ time, down: false });

it('reserves 100% for a clean attempt and gives partial credit for near hits', () => {
  const score = overrides => practicePercent(practiceAccuracy({ perfect: 3, good: 0, miss: 0, wrong: 0, ...overrides }));
  expect(score({})).toBe(100);
  expect(score({ wrong: 1 })).toBe(75);
  expect(score({ perfect: 2, good: 1 })).toBe(83);
  expect(score({ perfect: 999, wrong: 1 })).toBe(99);
  expect(practiceAccuracy({ perfect: 0, good: 0, miss: 0, wrong: 0 })).toBeNull();
});

it('unfolds pedal changes across contiguous measures, repeats and the final barline', () => {
  const marks = [down(0), up(1), down(1), up(1.5), down(2.25), up(3)];
  const ranges = [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 0, b: 2 }, { a: 2, b: 3 }];
  expect(practiceSustainReference(marks, ranges, 0)).toEqual([
    down(0), up(1), down(1), up(1.5), down(2), up(3), down(3), up(3.5), down(4.25), up(5),
  ]);
  expect(practiceSustainReference(marks, [{ a: .5, b: 1.5 }], 2)).toEqual([down(2), up(2.5), down(2.5), up(3)]);
  expect(practiceSustainReference(marks, [{ a: 1.6, b: 2 }], 0)).toEqual([]);
  expect(practiceSustainReference([down(0), up(2)], [{ a: 0, b: 2 }, { a: 0, b: 2 }], 0)).toEqual([down(0), up(2), down(2), up(4)]);
});

it('grades tempo-scaled pedal actions one to one, with room for repedaling after the attack', () => {
  const expected = [down(0), up(1), down(1), up(2)];
  expect(gradePracticeSustain(expected, [down(.11), up(1.04), down(1.12), up(2.05)], .5)).toEqual({
    matched: 4, missed: 0, extra: 0, accuracy: 1,
  });
  expect(gradePracticeSustain(expected, [down(0), up(1), down(1.05), up(1.5), down(1.6)], 1)).toEqual({
    matched: 3, missed: 1, extra: 2, accuracy: .5,
  });
  expect(gradePracticeSustain([down(0), down(.05)], [down(.04)], 1)).toMatchObject({ matched: 1, missed: 1, extra: 0 });
});

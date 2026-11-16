import { expect, it } from 'vitest';
import { endingPasses, repeatOrder, repeatRanges } from '../../src/domain/score-repeats.ts';
const bars = (...marks) => marks.map((m, i) => ({ start: i * 4, end: (i + 1) * 4, ...m }));
it('reads multiple ending numbers and inclusive pass ranges', () => {
  expect(endingPasses('1-3, 5')).toEqual([1, 2, 3, 5]);
});
it('repeats from the beginning without a forward sign and continues afterwards', () => {
  expect(repeatOrder(bars({}, { backward: 2 }, {}))).toEqual([0, 1, 0, 1, 2]);
});
it('honors explicit starts, repeat counts and nested repeats', () => {
  expect(repeatOrder(bars({}, { forward: true }, { backward: 3 }, {}))).toEqual([0, 1, 2, 1, 2, 1, 2, 3]);
  expect(repeatOrder(bars({ forward: true }, { forward: true, backward: 2 }, { backward: 2 }))).toEqual([0, 1, 1, 2, 0, 1, 1, 2]);
});
it('plays first and second endings on their respective passes', () => {
  expect(repeatOrder(bars({ forward: true }, { ending: [1], backward: 2 }, { ending: [2] }, {}))).toEqual([0, 1, 0, 2, 3]);
});
it('merges adjacent measures into continuous clock ranges', () => {
  expect(repeatRanges(bars({}, { backward: 2 }, {}))).toEqual([{ a: 0, b: 8 }, { a: 0, b: 12 }]);
});

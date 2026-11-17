import { expect, it } from 'vitest';
import { performanceTimeline, performanceAt, performanceOf, performanceMarkers } from '../../src/domain/performance-timeline.ts';
import { validateLibraryResume } from '../../src/domain/score-library-store.ts';
it('maps repeated score positions to distinct performance positions and reaches the full duration', () => {
  const plan = performanceTimeline([{ a: 0, b: 4 }, { a: 0, b: 6 }]);
  expect(plan.duration).toBe(10);
  expect(performanceAt(plan, 4.3)).toMatchObject({ index: 1, score: expect.closeTo(.3), position: 4.3 });
  expect(performanceOf(plan, .3, 4.4)).toBe(4.3);
  expect(performanceAt(plan, 4)).toMatchObject({ index: 1, score: 0 });
  expect(performanceOf(plan, 4, 3.8)).toBe(8);
  expect(performanceOf(plan, 4, 3.8, true)).toBe(4);
  expect(performanceAt(plan, 100)).toMatchObject({ position: 10, score: 6 });
});
it('excludes skipped endings and handles empty or invalid ranges', () => {
  const plan = performanceTimeline([{ a: 0, b: 4 }, { a: 0, b: 2 }, { a: 4, b: 6 }]);
  expect(plan.duration).toBe(8);
  expect(performanceAt(plan, 6).score).toBe(4);
  expect(performanceTimeline([{ a: NaN, b: 1 }, { a: 3, b: 1 }]).duration).toBe(0);
  expect(performanceAt(performanceTimeline([]), NaN).position).toBe(0);
});
it('maps measure ticks to each occurrence and omits ticks at skipped endings', () => {
  const plan = performanceTimeline([{ a: 0, b: 4 }, { a: 0, b: 2 }, { a: 4, b: 6 }]);
  expect(performanceMarkers(plan, [0, 2, 4, 6].map(time => ({ time, major: true }))).map(m => m.position)).toEqual([0, 2, 4, 6]);
});
const old = { position: .3, measure: '1', speed: 100, hands: 'both', wait: false, metronome: false, view: 'page', look: 'paper', zoom: 1 };
it('preserves old saves and round-trips the optional performance bookmark', () => {
  expect(validateLibraryResume(old)).toEqual(old);
  expect(validateLibraryResume({ ...old, performance: 4.3, elapsed: 4.3 })).toEqual({ ...old, performance: 4.3, elapsed: 4.3 });
});
it.each([-1, NaN, Infinity, '4', null])('rejects malformed performance bookmarks: %s', value => {
  expect(() => validateLibraryResume({ ...old, performance: value })).toThrow();
  expect(() => validateLibraryResume({ ...old, elapsed: value })).toThrow();
});

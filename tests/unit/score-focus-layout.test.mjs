import { expect, it } from 'vitest';
import { renderGrandStaff } from '../../src/domain/grand-staff.ts';

it('narrow paper can wrap single bars vertically while preserving every note and beat', () => {
  const piece = { ts: [4, 4], engrave: 2, rh: Array.from({ length: 32 }, () => ['C4', 1]), lh: Array.from({ length: 8 }, () => ['C3', 4]) };
  const opts = { namesVisible: false, notation: 'en' };
  const original = renderGrandStaff(piece, { width: 300, maxHeight: 500 }, opts);
  const focused = renderGrandStaff(piece, { width: 300, minBars: 1, floor: .5, cap: 1.4 }, opts);
  expect(focused.W * focused.scale).toBeLessThanOrEqual(310);
  expect(focused.scale).toBeGreaterThanOrEqual(1);
  expect(focused.systems.length).toBeGreaterThan(original.systems.length);
  expect(focused.notes.map(({ hand, midi, beat, dur }) => [hand, midi, beat, dur])).toEqual(original.notes.map(({ hand, midi, beat, dur }) => [hand, midi, beat, dur]));
  expect(focused.total).toBe(original.total);
});

it('fits a dense bar to narrow paper instead of joining the entire piece into an overflowing system', () => {
  const piece = { ts: [4, 4], engrave: 2, rh: Array.from({ length: 128 }, () => ['C#4', .25]), lh: Array.from({ length: 8 }, () => ['C3', 4]) };
  const rendered = renderGrandStaff(piece, { width: 260, minBars: 1, floor: .5 }, { namesVisible: false, notation: 'en' });
  expect(rendered.systems).toHaveLength(8);
  expect(rendered.W * rendered.scale).toBeLessThanOrEqual(270);
  expect(rendered.notes).toHaveLength(136);
});

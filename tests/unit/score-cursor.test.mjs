import { expect, it } from 'vitest';
import { createCursorCurves, cursorCurveAt } from '../../src/domain/score-cursor.ts';

const anchors = [0, 1, 1.25, 3, 4].map((beat, i) => ({ beat, x: [0, 20, 80, 100, 180][i], sys: 0 }));
const curves = createCursorCurves(anchors, b => b);
const at = t => cursorCurveAt(curves, t, 0);

it('passes through every onset exactly and joins with continuous nonzero velocity', () => {
  for (const a of anchors) expect(at(a.beat)).toBeCloseTo(a.x, 10);
  for (const a of anchors.slice(1, -1)) {
    const dt = 1e-7, left = (at(a.beat) - at(a.beat - dt)) / dt, right = (at(a.beat + dt) - at(a.beat)) / dt;
    expect(left).toBeGreaterThan(0);
    expect(right).toBeCloseTo(left, 2);
  }
});

it('never overshoots or reverses between increasing onsets even with extreme spacing', () => {
  for (const xs of [[0, 0.001, 10000, 10001], [0, 10, 10, 100], [0, 50, 51, 52]]) {
    const c = createCursorCurves(xs.map((x, i) => ({ beat: [0, .01, 10, 10.1][i], x, sys: 0 })), b => b);
    let previous = 0;
    for (let t = 0; t <= 10.1; t += .001) {
      const value = cursorCurveAt(c, t, 0);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(value).toBeLessThanOrEqual(xs[3]);
      previous = value;
    }
  }
});

it('keeps a constant speed when the engraving is proportional', () => {
  const c = createCursorCurves([0, 1, 2, 4].map(beat => ({ beat, x: beat * 20, sys: 0 })), b => b);
  for (let t = 0; t <= 4; t += .1) expect(cursorCurveAt(c, t, 0)).toBeCloseTo(t * 20, 10);
});

it('isolates systems, resolves coincident barline/onset anchors, and holds the last position', () => {
  const c = createCursorCurves([
    { beat: 0, x: 10, sys: 0 }, { beat: 1, x: 40, sys: 0 }, { beat: 1, x: 45, sys: 0 },
    { beat: 2, x: 100, sys: 0 }, { beat: 2, x: 5, sys: 1 }, { beat: 3, x: 35, sys: 1 },
  ], b => b);
  expect(cursorCurveAt(c, 1, 0)).toBe(45);
  expect(cursorCurveAt(c, 2, 0)).toBe(100);
  expect(cursorCurveAt(c, 2, 1)).toBe(5);
  expect(cursorCurveAt(c, 10, 1)).toBe(35);
  expect(cursorCurveAt(c, 0, 1)).toBeNull();
  expect(cursorCurveAt(c, 0, 99)).toBeNull();
});

it('uses tempo-map seconds and is stateless under seeking and repeated playback', () => {
  const seconds = b => b <= 1 ? b * .5 : .5 + (b - 1);
  const c = createCursorCurves(anchors, seconds);
  for (const a of [...anchors, ...anchors].reverse()) expect(cursorCurveAt(c, seconds(a.beat), 0)).toBeCloseTo(a.x, 10);
});

it('handles empty and single-point geometry', () => {
  expect(cursorCurveAt(createCursorCurves([], b => b), 0, 0)).toBeNull();
  expect(cursorCurveAt(createCursorCurves([{ beat: 0, x: 12, sys: 0 }], b => b), 5, 0)).toBe(12);
});

import { describe, expect, it } from 'vitest';
import { renderGrandStaff, srBeatPt } from '../../src/domain/grand-staff.ts';

function slopeCheck(render, samplesPerBar = 16) {
  const bySys = new Map();
  for (const pt of render.beatX) {
    const arr = bySys.get(pt.sy) ?? [];
    arr.push(pt);
    bySys.set(pt.sy, arr);
  }
  const slopes = [];
  for (const [sy, pts] of bySys.entries()) {
    expect(pts.length, `system ${sy} anchor count`).toBeGreaterThanOrEqual(2);
    const first = pts[0];
    const last = pts[pts.length - 1];
    const slope = (last.x - first.x) / (last.b - first.b);
    expect(slope, `system ${sy} slope`).toBeGreaterThan(0);
    slopes.push(slope);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].x, `system ${sy} monotonic x`).toBeGreaterThan(pts[i - 1].x);
      const localSlope = (pts[i].x - pts[i - 1].x) / (pts[i].b - pts[i - 1].b);
      expect(localSlope, `system ${sy} beat ${pts[i - 1].b}..${pts[i].b}`).toBeCloseTo(slope, 4);
    }
    const span = last.b - first.b;
    const step = span / samplesPerBar;
    for (let k = 1; k < samplesPerBar; k++) {
      const b = first.b + k * step;
      const p = srBeatPt(render.beatX, b);
      expect(p.sy).toBe(sy);
      expect(p.x).toBeCloseTo(first.x + (b - first.b) * slope, 3);
    }
  }
  return slopes;
}

describe('proportional grand-staff layout for constant playhead speed', () => {
  it('keeps dx/db constant across mixed whole, half, quarter, eighth, sixteenth, rest, and barlines', () => {
    const piece = {
      ts: [4, 4],
      keyN: 0,
      rh: [
        ['C4', 4],
        ['D4', 2], ['E4', 1], ['F4', 0.5], ['G4', 0.5],
        ['A4', 0.25], ['B4', 0.25], ['C5', 0.25], ['D5', 0.25], ['R', 1], ['E5', 2],
        ['F5', 1.5], ['G5', 0.5], ['A5', 2],
      ],
      lh: [
        ['C3', 2], ['G3', 2],
        ['A2', 4],
        ['F2', 2], ['G2', 2],
        ['C3', 4],
      ],
    };
    const render = renderGrandStaff(piece, { width: 920, justify: true }, { namesVisible: false, notation: 'en', proportional: true });
    expect(render.systems.length).toBeGreaterThanOrEqual(1);
    const slopes = slopeCheck(render, 24);
    expect(slopes.length).toBe(render.systems.length);
  });

  it('maintains constant dx/db per system across multi-system wraps, accidentals, chords, ties, and engrave 2', () => {
    const bar8 = [
      ['C#4', 0.5], ['D#4', 0.5], ['E4', 1], ['F#4', 2],
      ['G4', 4],
      [['A4', 'C5'], 1], ['B4', 0.5], ['A4', 0.5], ['G#4', 1, 'tied'], ['G#4', 1],
      ['F4', 0.5], ['E4', 0.5], ['D4', 1], ['C4', 2],
    ];
    const piece = {
      ts: [4, 4],
      engrave: 2,
      keyN: 2,
      rh: [...bar8, ...bar8, ...bar8],
      lh: Array.from({ length: 12 }, (_, i) => [i % 2 === 0 ? 'D3' : 'A2', 4]),
    };
    const render = renderGrandStaff(piece, { width: 1000, maxBars: 4, justify: true }, { namesVisible: false, notation: 'en', proportional: true });
    expect(render.systems.length).toBe(3);
    slopeCheck(render, 32);
  });

  it('handles short trailing system and 6/8 compound meter proportionally', () => {
    const piece = {
      ts: [6, 8],
      engrave: 2,
      keyN: -1,
      rh: [
        ['C4', 0.5], ['D4', 0.5], ['E4', 0.5], ['F4', 1.5],
        ['G4', 1], ['A4', 0.5], ['Bb4', 1.5],
        ['C5', 3],
        ['Bb4', 1.5], ['A4', 0.5], ['G4', 0.5], ['F4', 0.5],
        ['E4', 3],
      ],
    };
    const render = renderGrandStaff(piece, { width: 700, maxBars: 4, justify: true }, { namesVisible: false, notation: 'en', proportional: true });
    expect(render.systems.length).toBe(2);
    slopeCheck(render, 20);
  });

  it('preserves existing non-proportional layout when proportional is omitted or false', () => {
    const piece = {
      ts: [4, 4],
      keyN: 0,
      rh: [['C4', 4], ['D4', 0.5], ['E4', 0.5], ['F4', 1], ['G4', 2]],
    };
    const def = renderGrandStaff(piece, { width: 700 }, { namesVisible: false, notation: 'en' });
    const prop = renderGrandStaff(piece, { width: 700 }, { namesVisible: false, notation: 'en', proportional: true });
    const d1 = def.beatX[1].x - def.beatX[0].x;
    const d2 = prop.beatX[1].x - prop.beatX[0].x;
    expect(d2).toBeGreaterThan(d1 * 1.5);
  });
});

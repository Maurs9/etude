export interface CursorAnchor { beat: number; x: number; sys: number; }
interface CursorPoint { time: number; x: number; slope: number; }
export type CursorCurves = ReadonlyMap<number, readonly CursorPoint[]>;

/** Monotone cubic Hermite interpolation: shared velocities at onsets, no overshoot. */
export function createCursorCurves(anchors: readonly CursorAnchor[], seconds: (beat: number) => number): CursorCurves {
  const systems = new Map<number, CursorPoint[]>();
  for (const anchor of anchors) {
    let points = systems.get(anchor.sys);
    if (!points) systems.set(anchor.sys, points = []);
    const time = seconds(anchor.beat), last = points[points.length - 1];
    // Geometry is ordered by beat, with a real onset after a coincident barline.
    if (last && Math.abs(last.time - time) < 1e-9) last.x = anchor.x;
    else points.push({ time, x: anchor.x, slope: 0 });
  }
  for (const points of systems.values()) {
    for (let i = 0; i < points.length; i++) {
      const before = points[i - 1], point = points[i], after = points[i + 1];
      const left = before ? (point.x - before.x) / (point.time - before.time) : undefined;
      const right = after ? (after.x - point.x) / (after.time - point.time) : undefined;
      if (left === undefined || right === undefined) point.slope = left ?? right ?? 0;
      else if (left * right > 0) {
        const h0 = point.time - before.time, h1 = after.time - point.time;
        const w0 = 2 * h1 + h0, w1 = h1 + 2 * h0;
        point.slope = (w0 + w1) / (w0 / left + w1 / right);
      }
    }
  }
  return systems;
}

export function cursorCurveAt(curves: CursorCurves, time: number, sys: number): number | null {
  const points = curves.get(sys);
  if (!points?.length || time < points[0].time - 1e-9) return null;
  let lo = 0, hi = points.length - 1, k = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (points[mid].time <= time + 1e-9) { k = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  const a = points[k], b = points[k + 1];
  if (!b) return a.x;
  const h = b.time - a.time, f = Math.max(0, Math.min(1, (time - a.time) / h));
  const delta = b.x - a.x;
  const x = a.x + f * (h * a.slope + f * (3 * delta - h * (2 * a.slope + b.slope) + f * (h * (a.slope + b.slope) - 2 * delta)));
  return Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), x));
}

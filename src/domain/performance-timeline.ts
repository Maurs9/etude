/** Nominal score seconds in performance order, independent of engraving and playback speed. */
export interface PerformanceRange { a: number; b: number; offset: number }
export interface PerformanceTimeline { ranges: PerformanceRange[]; duration: number }
export function performanceTimeline(ranges: readonly { a: number; b: number }[]): PerformanceTimeline {
  let duration = 0;
  const result = ranges.filter(r => Number.isFinite(r.a) && Number.isFinite(r.b) && r.b > r.a).map(r => {
    const range = { ...r, offset: duration }; duration += r.b - r.a; return range;
  });
  return { ranges: result, duration };
}
export function performanceAt(timeline: PerformanceTimeline, position: number) {
  const p = Math.max(0, Math.min(timeline.duration, Number.isFinite(position) ? position : 0));
  let lo = 0, hi = timeline.ranges.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1, r = timeline.ranges[mid]; if (p >= r.offset + r.b - r.a) lo = mid + 1; else hi = mid; }
  const index = Math.min(lo, timeline.ranges.length - 1), range = timeline.ranges[index];
  return { index, position: p, score: range ? range.a + p - range.offset : 0 };
}
/** Resolve a written position to the closest occurrence, preserving the current repeat when possible. */
export function performanceOf(timeline: PerformanceTimeline, score: number, near = 0, allowEnd = false): number {
  let best = 0, distance = Infinity;
  for (const r of timeline.ranges) if (score >= r.a - 1e-8 && score <= r.b + 1e-8) {
    const p = r.offset + Math.max(0, Math.min(r.b - r.a, score - r.a)), d = Math.abs(p - near);
    if (!allowEnd && Math.abs(performanceAt(timeline, p).score - score) > 1e-8) continue;
    if (d < distance) { best = p; distance = d; }
  }
  return best;
}
/** Expand sorted written markers without scanning the entire score for every repeated range. */
export function performanceMarkers(timeline: PerformanceTimeline, markers: readonly { time: number; major: boolean }[]) {
  const result: { position: number; major: boolean }[] = [];
  for (const r of timeline.ranges) {
    let lo = 0, hi = markers.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (markers[mid].time < r.a - 1e-8) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < markers.length && markers[i].time < r.b - 1e-8; i++)
      result.push({ position: r.offset + markers[i].time - r.a, major: markers[i].major });
  }
  return result;
}

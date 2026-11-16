export interface RepeatBar { start: number; end: number; forward?: boolean; backward?: number; ending?: number[] }
export function endingPasses(value: string): number[] {
  const passes = new Set<number>();
  for (const match of value.matchAll(/(\d+)(?:\s*[-–]\s*(\d+))?/g)) {
    const a = Math.max(1, Math.min(32, Number(match[1]))), b = Math.max(a, Math.min(32, Number(match[2] ?? match[1])));
    for (let pass = a; pass <= b; pass++) passes.add(pass);
  }
  return [...passes];
}
/** Written bar indices in performance order. Bounds protect against malformed or excessive repeat instructions. */
export function repeatOrder(bars: readonly RepeatBar[]): number[] {
  const stack: number[] = [], starts = new Map<number, number>();
  bars.forEach((b, i) => { if (b.forward) stack.push(i); if (b.backward) starts.set(i, stack.pop() ?? 0); });
  const passes = new Map<number, number>(), out: number[] = [];
  let i = 0, lastPass = 1, steps = 0;
  while (i < bars.length && steps++ < 16384) {
    const b = bars[i];
    const enclosing = [...starts.keys()].find(end => end >= i && (starts.get(end) ?? 0) <= i);
    const pass = enclosing == null ? lastPass : passes.get(enclosing) ?? 1;
    if (!b.ending?.length || b.ending.includes(pass)) out.push(i);
    if (b.backward) {
      const times = Math.max(1, Math.min(32, b.backward));
      if (pass < times) {
        passes.set(i, pass + 1);
        const start = starts.get(i) ?? 0;
        for (const end of starts.keys()) if (end < i && (starts.get(end) ?? 0) >= start) passes.delete(end);
        i = start; continue;
      }
      lastPass = pass;
    }
    i++;
  }
  return out;
}
export function repeatRanges(bars: readonly RepeatBar[]): { a: number; b: number }[] {
  const ranges: { a: number; b: number }[] = [];
  for (const i of repeatOrder(bars)) {
    const bar = bars[i], prev = ranges[ranges.length - 1];
    if (prev && Math.abs(prev.b - bar.start) < 1e-8) prev.b = bar.end;
    else ranges.push({ a: bar.start, b: bar.end });
  }
  return ranges;
}

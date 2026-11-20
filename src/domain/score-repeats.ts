export interface RepeatBar {
  start: number;
  end: number;
  forward?: boolean;
  backward?: number;
  ending?: number[];
  segno?: string;
  coda?: string;
  daCapo?: boolean;
  dalSegno?: string;
  toCoda?: string;
  fine?: boolean;
}
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
  const endingOwners = new Map<number, number>();
  let priorRepeat: number | undefined;
  let attachedEnding: number | undefined;
  bars.forEach((bar, index) => {
    if (!bar.ending?.length || bar.ending.includes(1)) attachedEnding = undefined;
    else if (bars[index - 1]?.backward && bars[index - 1]?.ending?.includes(1)) attachedEnding = priorRepeat;
    if (attachedEnding !== undefined) endingOwners.set(index, attachedEnding);
    if (bar.backward) priorRepeat = index;
  });
  let i = 0, lastPass = 1, steps = 0, jumped = false, codaTaken = false;
  while (i < bars.length && steps++ < 16384) {
    const b = bars[i];
    const enclosing = [...starts.keys()].find(end => end >= i && (starts.get(end) ?? 0) <= i);
    const pass = enclosing == null ? lastPass : passes.get(enclosing) ?? 1;
    const owner = endingOwners.get(i);
    const endingPass = owner === undefined ? pass : passes.get(owner) ?? lastPass;
    const play = !b.ending?.length || b.ending.includes(endingPass);
    if (play) {
      out.push(i);
      if (jumped && b.fine) break;
      if (jumped && !codaTaken && b.toCoda) {
        const destination = bars.findIndex(bar => bar.coda === b.toCoda);
        if (destination >= 0) { codaTaken = true; i = destination; continue; }
      }
      if (!jumped && (b.daCapo || b.dalSegno)) {
        const destination = b.daCapo ? 0 : bars.findIndex(bar => bar.segno === b.dalSegno);
        if (destination >= 0) { jumped = true; i = destination; continue; }
      }
    }
    if (b.backward && !jumped) {
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

/** Repeat and jump markings shared by playback and score analysis. Positions remain in the supplied units. */
export function scoreXmlRepeatBars(doc: Document, measures: readonly { start: number; end: number }[]) {
  const written = [...doc.querySelectorAll('score-partwise > part:first-of-type > measure')];
  let ending: number[] | undefined;
  const bars: RepeatBar[] = measures.map((m, i) => {
      const el = written[i], mark = el?.querySelector('ending[type="start"]');
      if (mark) ending = endingPasses(mark.getAttribute('number') ?? '');
      const bar: RepeatBar = { start: m.start, end: m.end, ending,
          forward: !!el?.querySelector('repeat[direction="forward"]'),
          backward: el?.querySelector('repeat[direction="backward"]') ? Number(el.querySelector('repeat[direction="backward"]')?.getAttribute('times') || 2) || 2 : undefined };
      // MusicXML's playback attributes name jump destinations independently of visible words.
      for (const sound of el?.querySelectorAll('sound') ?? []) {
          bar.segno = sound.getAttribute('segno') || bar.segno;
          bar.coda = sound.getAttribute('coda') || bar.coda;
          bar.daCapo ||= sound.getAttribute('dacapo') === 'yes';
          bar.dalSegno = sound.getAttribute('dalsegno') || bar.dalSegno;
          bar.toCoda = sound.getAttribute('tocoda') || bar.toCoda;
          bar.fine ||= sound.hasAttribute('fine');
      }
      if (el?.querySelector('ending[type="stop"],ending[type="discontinue"]')) ending = undefined;
      return bar;
  });
  return bars;
}

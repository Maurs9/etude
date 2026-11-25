interface NoteJudgements {
  perfect: number;
  good: number;
  miss: number;
  wrong: number;
}

export function practiceAccuracy({ perfect, good, miss, wrong }: NoteJudgements): number | null {
  const total = perfect + good + miss + wrong;
  return total ? (perfect + good * .5) / total : null;
}

export function practicePercent(accuracy: number): number {
  return accuracy === 1 ? 100 : Math.min(99, Math.round(accuracy * 100));
}

export interface TimedSustain {
  time: number;
  down: boolean;
}

// Put the written pedal on the same unfolded timeline as the player's input.
export function practiceSustainReference(
  events: readonly TimedSustain[], ranges: readonly { a: number; b: number }[], offset: number,
): TimedSustain[] {
  const reference: TimedSustain[] = [];
  let down = false;
  for (const [i, { a, b }] of ranges.entries()) {
    let lo = 0, hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (events[mid].time < a - 1e-6) lo = mid + 1;
      else hi = mid;
    }
    const writtenDown = events[lo - 1]?.down ?? false;
    const jump = i === 0 || Math.abs(ranges[i - 1].b - a) > 1e-6;
    // A cut or repeat can begin underneath an already active pedal line.
    if (jump && writtenDown !== down && (down || (events[lo]?.time ?? Infinity) > a + 1e-6)) {
      down = writtenDown;
      reference.push({ time: offset, down });
    }
    const limit = b + (i === ranges.length - 1 ? 1e-6 : -1e-6);
    for (let j = lo; j < events.length && events[j].time < limit; j++) {
      const event = events[j];
      if (event.down === down) continue;
      down = event.down;
      reference.push({ time: offset + Math.max(0, event.time - a), down });
    }
    offset += b - a;
  }
  return reference;
}

export function gradePracticeSustain(
  expected: readonly TimedSustain[], played: readonly TimedSustain[], factor: number,
) {
  let matched = 0;
  // Score rising and falling edges separately so a quick release/repress can
  // match a change at one written instant. Each edge can be used only once.
  const ordered = [...played].sort((a, b) => a.time - b.time);
  for (const down of [true, false]) {
    const actual = ordered.filter(e => e.down === down);
    const early = (down ? .12 : .15) * factor;
    const late = (down ? .25 : .15) * factor;
    let i = 0;
    for (const event of expected) {
      if (event.down !== down) continue;
      while (i < actual.length && actual[i].time < event.time - early - 1e-6) i++;
      if (i < actual.length && actual[i].time <= event.time + late + 1e-6) {
        matched++;
        i++;
      }
    }
  }
  const missed = expected.length - matched;
  const extra = played.length - matched;
  return { matched, missed, extra, accuracy: expected.length ? matched / (expected.length + extra) : null };
}

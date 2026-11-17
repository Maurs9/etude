export const WAIT_CHORD_WINDOW = 0.150;

/** Match fresh attacks one-to-one; sustain is deliberately absent from physicalHeld. */
export function evaluateWaitChord(
  need: ReadonlySet<number>, attacks: ReadonlyMap<number, number>, physicalHeld: ReadonlySet<number>,
  rolled: ReadonlySet<number>, allowedHeld: ReadonlySet<number>, anyOctave: boolean,
): { got: Set<number>; complete: boolean } {
  const same = (a: number, b: number) => a === b || (anyOctave && a % 12 === b % 12);
  const matched = new Map<number, { played: number; time: number }>();
  const used = new Set<number>();
  // Ordinary notes need the held keys; arpeggios may also use released attacks.
  // Within each group reserve exact pitches before octave substitutions.
  for (const arpeggio of [false, true]) for (const exact of [true, false]) for (const [played, time] of attacks) {
    if (used.has(played)) continue;
    const want = [...need].find(n => rolled.has(n) === arpeggio && !matched.has(n) && (exact ? n === played : same(n, played)));
    if (want === undefined || (!rolled.has(want) && !physicalHeld.has(played))) continue;
    matched.set(want, { played, time });
    used.add(played);
  }
  const times = [...matched].filter(([want]) => !rolled.has(want)).map(([, value]) => value.time);
  const latest = Math.max(...times);
  const got = new Set([...matched].filter(([want, value]) => rolled.has(want) || latest - value.time <= WAIT_CHORD_WINDOW + 1e-9).map(([want]) => want));
  const extras = [...physicalHeld].some(played => ![...need, ...allowedHeld].some(want => same(want, played)));
  return { got, complete: need.size > 0 && got.size === need.size && !extras };
}

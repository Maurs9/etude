/* Error-aware feedback for the training session: what was given against what was expected, a "hear both" schedule,
   and the session's confusion pairs. Nothing here is saved: the log lives in memory and starts empty with each session. */

/** A sound to compare: groups of keys struck together, one group every `stepS` seconds, each held for `holdS`. */
export interface FeedbackSketch {
  readonly groups: readonly (readonly number[])[];
  readonly stepS: number;
  readonly holdS: number;
}
export interface FeedbackNote { readonly midi: number; readonly at: number; readonly dur: number }

/** The given sound, a pause, then the expected one, as notes to schedule from now (seconds). */
export function feedbackSchedule(given: FeedbackSketch, expected: FeedbackSketch, pauseS = 0.7): FeedbackNote[] {
  const length = (sketch: FeedbackSketch) => sketch.groups.length ? (sketch.groups.length - 1) * sketch.stepS + sketch.holdS : 0;
  const notes = (sketch: FeedbackSketch, start: number) => sketch.groups.flatMap((group, index) =>
    group.map((midi) => ({ midi, at: start + index * sketch.stepS, dur: sketch.holdS })));
  return [...notes(given, 0), ...notes(expected, length(given) + pauseS)];
}

/** A melodic-then-harmonic interval or chord from its keys, as the session plays them. */
export function feedbackBroken(midis: readonly number[], stepS = 0.45, holdS = 0.9): FeedbackSketch {
  return { groups: [...midis.map((midi) => [midi]), [...midis]], stepS, holdS };
}

/** One key after the other (a scale, or a single note). */
export function feedbackLine(midis: readonly number[], stepS = 0.27, holdS = 0.3): FeedbackSketch {
  return { groups: midis.map((midi) => [midi]), stepS, holdS };
}

/** Chords one after the other (a progression). */
export function feedbackChords(chords: readonly (readonly number[])[], stepS = 0.9, holdS = 0.8): FeedbackSketch {
  return { groups: chords, stepS, holdS };
}

export interface ConfusionPair { readonly expected: string; readonly given: string; readonly count: number }

/** How often the session took one item for another. Both orders (A for B, B for A) count as one pair. */
export class ConfusionLog {
  private readonly pairs = new Map<string, { expected: string; given: string; count: number }>();

  record(expected: string, given: string): void {
    if (!expected || !given || expected === given) return;
    const key = [expected, given].sort().join('\u0000');
    const pair = this.pairs.get(key);
    if (pair) pair.count += 1;
    else this.pairs.set(key, { expected, given, count: 1 });
  }

  /** The pair that came up most often, once it has come up at least `min` times. Ties keep the first pair seen. */
  top(min = 2): ConfusionPair | null {
    let best: ConfusionPair | null = null;
    for (const pair of this.pairs.values()) if (pair.count >= min && (!best || pair.count > best.count)) best = { ...pair };
    return best;
  }

  clear(): void { this.pairs.clear(); }
}

/** How many questions a contrast drill asks. */
export const CONTRAST_LENGTH = 6;

/** A balanced, shuffled order of the two items (three of each for six questions), never three in a row of one. */
export function contrastOrder(a: string, b: string, length = CONTRAST_LENGTH, random: () => number = Math.random): string[] {
  const bag = Array.from({ length }, (_, index) => (index % 2 ? b : a));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    for (let index = bag.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [bag[index], bag[swap]] = [bag[swap], bag[index]];
    }
    if (!bag.some((item, index) => index >= 2 && item === bag[index - 1] && item === bag[index - 2])) return bag;
  }
  return Array.from({ length }, (_, index) => (index % 2 ? b : a));
}

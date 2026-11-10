import type { SightReadingExpected } from './model.js';

export type SightReadingPerformed = {
  readonly id: string;
  readonly midi: number;
  readonly onMs: number;
  readonly offMs?: number | null;
};
export type SightReadingClassification = 'good' | 'near' | 'lateOrEarly' | 'missed';
export type SightReadingEvaluation = {
  readonly status: 'ok' | 'invalid';
  readonly scoringVersion: 1;
  readonly N: number;
  readonly TP: number;
  readonly FP: number;
  readonly FN: number;
  readonly G: number;
  readonly Q: number;
  readonly lateOrEarlyCount: number;
  readonly restViolations: number;
  readonly pitchPrecision: number | null;
  readonly pitchRecall: number | null;
  readonly pitchF1: number | null;
  readonly rhythmAcc: number | null;
  readonly score: number | null;
  readonly stars: number;
  readonly perfect: boolean;
  readonly meanOffsetMs: number | null;
  readonly meanAbsoluteOffsetMs: number | null;
  readonly noteResults: readonly {
    readonly expectedId: string;
    readonly classification: SightReadingClassification;
    readonly matchedInputId: string | null;
    readonly errorMs: number | null;
  }[];
  readonly extraInputs: readonly SightReadingPerformed[];
};
export type SightReadingEvaluateConfig = {
  readonly windowMs?: number;
  readonly chordWindowMs?: number;
  readonly restWindows?: readonly { readonly startMs: number; readonly endMs: number }[];
  readonly anyOctave?: boolean;
};

type Pair = { readonly expected: SightReadingExpected; readonly input: SightReadingPerformed; readonly error: number };
type Path = { readonly pairs: readonly Pair[]; readonly cost: number };

function associationWindow(
  note: SightReadingExpected,
  expected: readonly SightReadingExpected[],
  windowMs: number,
  anyOctave = false,
): number {
  const isSamePitch = (a: number, b: number) =>
    anyOctave ? ((a % 12 + 12) % 12 === (b % 12 + 12) % 12) : a === b;
  const samePitch = expected
    .filter((candidate) => isSamePitch(candidate.midi, note.midi))
    .sort((a, b) => a.onMs - b.onMs || a.id.localeCompare(b.id));
  const index = samePitch.findIndex((candidate) => candidate.id === note.id);
  const neighbors = [samePitch[index - 1], samePitch[index + 1]]
    .filter((candidate): candidate is SightReadingExpected => !!candidate)
    .filter((candidate) => Math.abs(candidate.onMs - note.onMs) > 0.001);
  return neighbors.length === 0
    ? windowMs
    : Math.min(windowMs, 0.45 * Math.min(...neighbors.map((neighbor) => Math.abs(neighbor.onMs - note.onMs))));
}

function buildAssociationWindows(
  expected: readonly SightReadingExpected[],
  windowMs: number,
  anyOctave = false,
): ReadonlyMap<string, number> {
  return new Map(expected.map((note) => [note.id, associationWindow(note, expected, windowMs, anyOctave)]));
}

function compareTie(a: Path, b: Path): number {
  const length = Math.min(a.pairs.length, b.pairs.length);
  for (let index = 0; index < length; index += 1) {
    const left = a.pairs[index];
    const right = b.pairs[index];
    if (left.expected.onMs !== right.expected.onMs) return left.expected.onMs - right.expected.onMs;
    if (left.input.onMs !== right.input.onMs) return left.input.onMs - right.input.onMs;
    const expectedId = left.expected.id.localeCompare(right.expected.id);
    if (expectedId !== 0) return expectedId;
    const inputId = left.input.id.localeCompare(right.input.id);
    if (inputId !== 0) return inputId;
  }
  return a.pairs.length - b.pairs.length;
}

function better(a: Path, b: Path | null): boolean {
  if (!b) return true;
  if (a.pairs.length !== b.pairs.length) return a.pairs.length > b.pairs.length;
  if (a.cost !== b.cost) return a.cost < b.cost;
  return compareTie(a, b) < 0;
}

function matchPitch(
  expected: readonly SightReadingExpected[],
  inputs: readonly SightReadingPerformed[],
  associationWindows: ReadonlyMap<string, number>,
  windowMs: number,
): Pair[] {
  const dp: Array<Array<Path | null>> = Array.from({ length: expected.length + 1 }, () => Array<Path | null>(inputs.length + 1).fill(null));
  for (let i = 0; i <= expected.length; i += 1) dp[i][0] = { pairs: [], cost: 0 };
  for (let j = 0; j <= inputs.length; j += 1) dp[0][j] = { pairs: [], cost: 0 };
  for (let i = 1; i <= expected.length; i += 1) {
    for (let j = 1; j <= inputs.length; j += 1) {
      const skipExpected = dp[i - 1][j];
      const skipInput = dp[i][j - 1];
      let best = skipExpected && skipInput && better(skipExpected, skipInput) ? skipExpected : skipInput;
      const error = inputs[j - 1].onMs - expected[i - 1].onMs;
      if (Math.abs(error) <= (associationWindows.get(expected[i - 1].id) ?? windowMs)) {
        const previous = dp[i - 1][j - 1] ?? { pairs: [], cost: 0 };
        const pair: Pair = { expected: expected[i - 1], input: inputs[j - 1], error };
        const candidate: Path = {
          pairs: [...previous.pairs, pair],
          cost: previous.cost + Math.abs(error),
        };
        if (better(candidate, best)) best = candidate;
      }
      dp[i][j] = best;
    }
  }
  return dp[expected.length][inputs.length]?.pairs.slice() ?? [];
}

function overlapsNeighborWindow(
  input: SightReadingPerformed,
  rest: { readonly startMs: number; readonly endMs: number },
  expected: readonly SightReadingExpected[],
  associationWindows: ReadonlyMap<string, number>,
): boolean {
  const sorted = [...expected].sort((a, b) => a.onMs - b.onMs || a.id.localeCompare(b.id));
  const previous = sorted.filter((note) => note.onMs <= rest.startMs);
  const next = sorted.filter((note) => note.onMs >= rest.endMs);
  const previousOnset = previous.at(-1)?.onMs;
  const nextOnset = next[0]?.onMs;
  return sorted
    .filter((note) => note.onMs === previousOnset || note.onMs === nextOnset)
    .some((note) => Math.abs(input.onMs - note.onMs) <= (associationWindows.get(note.id) ?? 0));
}

function emptyResult(): SightReadingEvaluation {
  return {
    status: 'invalid', scoringVersion: 1, N: 0, TP: 0, FP: 0, FN: 0, G: 0, Q: 0,
    lateOrEarlyCount: 0, restViolations: 0, pitchPrecision: null, pitchRecall: null,
    pitchF1: null, rhythmAcc: null, score: null, stars: 0, perfect: false,
    meanOffsetMs: null, meanAbsoluteOffsetMs: null, noteResults: [], extraInputs: [],
  };
}

function effectiveWindowMs(configuredWindowMs: number | undefined): number {
  const windowMs = configuredWindowMs ?? 250;
  if (!Number.isFinite(windowMs) || windowMs < 0) {
    throw new RangeError('windowMs must be a finite, non-negative number');
  }
  return Math.min(250, windowMs);
}

function effectiveChordWindowMs(configuredWindowMs: number | undefined): number {
  const windowMs = configuredWindowMs ?? 60;
  if (!Number.isFinite(windowMs) || windowMs < 0) {
    throw new RangeError('chordWindowMs must be a finite, non-negative number');
  }
  return Math.min(250, windowMs);
}

export function srtEvaluate(
  expected: readonly SightReadingExpected[],
  performed: readonly SightReadingPerformed[],
  config: SightReadingEvaluateConfig = {},
): SightReadingEvaluation {
  const baseWindow = effectiveWindowMs(config.windowMs);
  const chordWindow = effectiveChordWindowMs(config.chordWindowMs);
  if (expected.length === 0) return emptyResult();
  const anyOctave = !!config.anyOctave;
  const pitchKey = (midi: number) => (anyOctave ? ((midi % 12 + 12) % 12) : midi);
  const byMidi = new Map<number, SightReadingExpected[]>();
  const inputByMidi = new Map<number, SightReadingPerformed[]>();
  for (const note of expected) {
    const key = pitchKey(note.midi);
    byMidi.set(key, [...(byMidi.get(key) ?? []), note]);
  }
  for (const input of performed) {
    const key = pitchKey(input.midi);
    inputByMidi.set(key, [...(inputByMidi.get(key) ?? []), input]);
  }
  const associationWindows = buildAssociationWindows(expected, baseWindow, anyOctave);
  let pairs: Pair[] = [];
  for (const [midi, notes] of byMidi) {
    const sorted = [...notes].sort((a, b) => a.onMs - b.onMs);
    const inputs = [...(inputByMidi.get(midi) ?? [])].sort((a, b) => a.onMs - b.onMs);
    pairs.push(...matchPitch(sorted, inputs, associationWindows, baseWindow));
  }
  const pairsByOnset = new Map<number, Pair[]>();
  for (const pair of pairs) pairsByOnset.set(pair.expected.onMs, [...(pairsByOnset.get(pair.expected.onMs) ?? []), pair]);
  const invalidChordPairs = new Set<Pair>();
  for (const [onMs, chordPairs] of pairsByOnset) {
    const expectedAtOnset = expected.filter((note) => note.onMs === onMs);
    if (expectedAtOnset.length < 2 || chordPairs.length !== expectedAtOnset.length) continue;
    const inputTimes = chordPairs.map((pair) => pair.input.onMs);
    if (Math.max(...inputTimes) - Math.min(...inputTimes) > chordWindow) chordPairs.forEach((pair) => invalidChordPairs.add(pair));
  }
  if (invalidChordPairs.size) pairs = pairs.filter((pair) => !invalidChordPairs.has(pair));
  const matchedIds = new Set(pairs.map((pair) => pair.input.id));
  const matchedExpected = new Map(pairs.map((pair) => [pair.expected.id, pair]));
  const noteResults = expected.map((note) => {
    const pair = matchedExpected.get(note.id);
    if (!pair) return { expectedId: note.id, classification: 'missed' as const, matchedInputId: null, errorMs: null };
    const absolute = Math.abs(pair.error);
    const classification: SightReadingClassification = absolute <= 100 ? 'good' : absolute <= 180 ? 'near' : 'lateOrEarly';
    return { expectedId: note.id, classification, matchedInputId: pair.input.id, errorMs: pair.error };
  });
  const extras = performed.filter((input) => !matchedIds.has(input.id));
  const TP = pairs.length;
  const FN = expected.length - TP;
  const FP = extras.length;
  const G = noteResults.filter((note) => note.classification === 'good').length;
  const Q = noteResults.filter((note) => note.classification === 'near').length;
  const lateOrEarlyCount = noteResults.filter((note) => note.classification === 'lateOrEarly').length;
  const offsets = pairs.map((pair) => pair.error);
  const restViolations = extras.filter((input) =>
    (config.restWindows ?? []).some((rest) =>
      input.onMs > rest.startMs &&
      input.onMs < rest.endMs &&
      !overlapsNeighborWindow(input, rest, expected, associationWindows),
    ),
  ).length;
  const pitchPrecision = TP + FP === 0 ? 0 : TP / (TP + FP);
  const pitchRecall = TP / expected.length;
  const pitchF1 = 100 * (2 * TP) / (2 * TP + FP + FN);
  const rhythmAcc = 100 * (G + 0.5 * Q) / expected.length;
  const score = Math.min(pitchF1, rhythmAcc);
  const stars = score >= 95 && FP === 0 && restViolations === 0 ? 3 : score >= 80 ? 2 : score >= 60 ? 1 : 0;
  return {
    status: 'ok', scoringVersion: 1, N: expected.length, TP, FP, FN, G, Q, lateOrEarlyCount,
    restViolations, pitchPrecision, pitchRecall, pitchF1, rhythmAcc, score, stars,
    perfect: G === expected.length && FN === 0 && FP === 0,
    meanOffsetMs: offsets.length ? offsets.reduce((sum, value) => sum + value, 0) / offsets.length : null,
    meanAbsoluteOffsetMs: offsets.length ? offsets.reduce((sum, value) => sum + Math.abs(value), 0) / offsets.length : null,
    noteResults, extraInputs: extras,
  };
}

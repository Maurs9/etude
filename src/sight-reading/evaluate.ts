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
  readonly restWindows?: readonly { readonly startMs: number; readonly endMs: number }[];
};

type Pair = { readonly expected: SightReadingExpected; readonly input: SightReadingPerformed; readonly error: number };
type Path = { readonly pairs: readonly Pair[]; readonly cost: number; readonly ids: string };

function better(a: Path, b: Path | null): boolean {
  if (!b) return true;
  if (a.pairs.length !== b.pairs.length) return a.pairs.length > b.pairs.length;
  if (a.cost !== b.cost) return a.cost < b.cost;
  return a.ids < b.ids;
}

function matchPitch(expected: readonly SightReadingExpected[], inputs: readonly SightReadingPerformed[], windowMs: number): Pair[] {
  const dp: Array<Array<Path | null>> = Array.from({ length: expected.length + 1 }, () => Array<Path | null>(inputs.length + 1).fill(null));
  for (let i = 0; i <= expected.length; i += 1) dp[i][0] = { pairs: [], cost: 0, ids: '' };
  for (let j = 0; j <= inputs.length; j += 1) dp[0][j] = { pairs: [], cost: 0, ids: '' };
  for (let i = 1; i <= expected.length; i += 1) {
    for (let j = 1; j <= inputs.length; j += 1) {
      const skipExpected = dp[i - 1][j];
      const skipInput = dp[i][j - 1];
      let best = skipExpected && skipInput && better(skipExpected, skipInput) ? skipExpected : skipInput;
      const error = inputs[j - 1].onMs - expected[i - 1].onMs;
      if (Math.abs(error) <= windowMs) {
        const previous = dp[i - 1][j - 1] ?? { pairs: [], cost: 0, ids: '' };
        const pair: Pair = { expected: expected[i - 1], input: inputs[j - 1], error };
        const candidate: Path = {
          pairs: [...previous.pairs, pair],
          cost: previous.cost + Math.abs(error),
          ids: `${previous.ids}|${expected[i - 1].id}|${inputs[j - 1].id}`,
        };
        if (better(candidate, best)) best = candidate;
      }
      dp[i][j] = best;
    }
  }
  return dp[expected.length][inputs.length]?.pairs.slice() ?? [];
}

function emptyResult(): SightReadingEvaluation {
  return {
    status: 'invalid', scoringVersion: 1, N: 0, TP: 0, FP: 0, FN: 0, G: 0, Q: 0,
    lateOrEarlyCount: 0, restViolations: 0, pitchPrecision: null, pitchRecall: null,
    pitchF1: null, rhythmAcc: null, score: null, stars: 0, perfect: false,
    meanOffsetMs: null, meanAbsoluteOffsetMs: null, noteResults: [], extraInputs: [],
  };
}

export function srtEvaluate(
  expected: readonly SightReadingExpected[],
  performed: readonly SightReadingPerformed[],
  config: SightReadingEvaluateConfig = {},
): SightReadingEvaluation {
  if (expected.length === 0) return emptyResult();
  const baseWindow = config.windowMs ?? 250;
  const byMidi = new Map<number, SightReadingExpected[]>();
  const inputByMidi = new Map<number, SightReadingPerformed[]>();
  for (const note of expected) byMidi.set(note.midi, [...(byMidi.get(note.midi) ?? []), note]);
  for (const input of performed) inputByMidi.set(input.midi, [...(inputByMidi.get(input.midi) ?? []), input]);
  const pairs: Pair[] = [];
  for (const [midi, notes] of byMidi) {
    const sorted = [...notes].sort((a, b) => a.onMs - b.onMs);
    const inputs = [...(inputByMidi.get(midi) ?? [])].sort((a, b) => a.onMs - b.onMs);
    const matches = matchPitch(sorted, inputs, baseWindow);
    for (const pair of matches) {
      const index = sorted.findIndex((note) => note.id === pair.expected.id);
      const neighbors = [sorted[index - 1], sorted[index + 1]].filter((note): note is SightReadingExpected => !!note);
      const closeWindow = neighbors.length > 0
        ? Math.min(baseWindow, 0.45 * Math.min(...neighbors.map((note) => Math.abs(note.onMs - pair.expected.onMs))))
        : baseWindow;
      if (Math.abs(pair.error) <= closeWindow) pairs.push(pair);
    }
  }
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
    (config.restWindows ?? []).some((rest) => input.onMs > rest.startMs && input.onMs < rest.endMs),
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

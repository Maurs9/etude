import type { TimedSustain } from './practice-scoring.js';

export type PracticeMistakeKind =
  | 'miss'
  | 'extra'
  | 'timing'
  | 'pedal_miss'
  | 'pedal_early'
  | 'pedal_late';

export interface PracticeMistakeEvent {
  readonly measureIndex: number;
  readonly measureNumber: string;
  readonly pass: number;
  readonly beat: number;
  readonly kind: PracticeMistakeKind;
  readonly midi?: number;
  readonly noteIndex?: number;
}

export interface MeasureMistakeGroup {
  readonly measureIndex: number;
  readonly measureNumber: string;
  readonly pass: number;
  readonly events: readonly PracticeMistakeEvent[];
}

export interface SustainMistakeLocation {
  readonly measureIndex: number;
  readonly measureNumber: string;
  readonly pass: number;
  readonly beat: number;
}

function pitchMatches(expectedMidi: number, playedMidi: number, anyOctave: boolean): boolean {
  if (expectedMidi === playedMidi) return true;
  if (!anyOctave) return false;
  return ((expectedMidi % 12) + 12) % 12 === ((playedMidi % 12) + 12) % 12;
}

/**
 * Distinguish an unmatched key press caused by playing a target note outside the strict timing window
 * from an unrelated wrong/extra key press.
 */
export function classifyUnmatchedKeyPress(
  playedMidi: number,
  timeSec: number,
  candidates: readonly { readonly midi: number; readonly start: number; readonly judged: boolean }[],
  factor: number,
  anyOctave: boolean,
): 'timing' | 'extra' {
  const nearWindow = 0.65 * Math.max(0.25, factor);
  for (const candidate of candidates) {
    if (candidate.judged) continue;
    if (Math.abs(candidate.start - timeSec) <= nearWindow && pitchMatches(candidate.midi, playedMidi, anyOctave)) {
      return 'timing';
    }
  }
  return 'extra';
}

/**
 * Attribute missed or badly timed sustain pedal edges against the written pedal timeline.
 */
export function extractSustainMistakes(
  expected: readonly TimedSustain[],
  played: readonly TimedSustain[],
  factor: number,
  locate: (timeSec: number) => SustainMistakeLocation,
): PracticeMistakeEvent[] {
  const ordered = [...played].sort((a, b) => a.time - b.time);
  const mistakes: PracticeMistakeEvent[] = [];

  for (const down of [true, false]) {
    const actual = ordered.filter(event => event.down === down);
    const early = (down ? 0.12 : 0.15) * factor;
    const late = (down ? 0.25 : 0.15) * factor;
    const nearWindow = 0.65 * Math.max(0.25, factor);
    const used = new Array<boolean>(actual.length).fill(false);
    const unmatchedExpected: TimedSustain[] = [];

    let cursor = 0;
    for (const event of expected) {
      if (event.down !== down) continue;
      while (cursor < actual.length && actual[cursor].time < event.time - early - 1e-6) cursor++;
      if (cursor < actual.length && actual[cursor].time <= event.time + late + 1e-6) {
        used[cursor] = true;
        cursor++;
      } else {
        unmatchedExpected.push(event);
      }
    }

    for (const event of unmatchedExpected) {
      let bestIndex = -1;
      let bestDelta = Infinity;
      for (let i = 0; i < actual.length; i++) {
        if (used[i]) continue;
        const delta = Math.abs(actual[i].time - event.time);
        if (delta <= nearWindow && delta < bestDelta) {
          bestDelta = delta;
          bestIndex = i;
        }
      }
      let kind: PracticeMistakeKind = 'pedal_miss';
      if (bestIndex >= 0) {
        used[bestIndex] = true;
        kind = actual[bestIndex].time < event.time ? 'pedal_early' : 'pedal_late';
      }
      const loc = locate(event.time);
      mistakes.push({
        measureIndex: loc.measureIndex,
        measureNumber: loc.measureNumber,
        pass: loc.pass,
        beat: loc.beat,
        kind,
      });
    }
  }

  return mistakes;
}

/**
 * Group chronological mistake events by repeat pass and measure index.
 */
export function groupPracticeMistakes(events: readonly PracticeMistakeEvent[]): MeasureMistakeGroup[] {
  if (!events.length) return [];
  const sorted = [...events].sort(
    (a, b) => a.pass - b.pass || a.measureIndex - b.measureIndex || a.beat - b.beat,
  );
  const groups: MeasureMistakeGroup[] = [];
  for (const event of sorted) {
    const prev = groups[groups.length - 1];
    if (prev && prev.pass === event.pass && prev.measureIndex === event.measureIndex) {
      (prev.events as PracticeMistakeEvent[]).push(event);
    } else {
      groups.push({
        measureIndex: event.measureIndex,
        measureNumber: event.measureNumber,
        pass: event.pass,
        events: [event],
      });
    }
  }
  return groups;
}

/**
 * Compute clamped `[m - 1, m + 1]` 0-based measure indices for "Repeat passage".
 */
export function practicePassageBounds(
  measureIndex: number,
  totalMeasures: number,
): { readonly startIndex: number; readonly endIndex: number } {
  if (totalMeasures <= 0) return { startIndex: 0, endIndex: 0 };
  const clamped = Math.max(0, Math.min(totalMeasures - 1, measureIndex));
  return {
    startIndex: Math.max(0, clamped - 1),
    endIndex: Math.min(totalMeasures - 1, clamped + 1),
  };
}

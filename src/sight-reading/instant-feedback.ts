import { samePitch } from '../core/pitch-match.js';
export type InstantFeedbackGrade = 'good' | 'near' | 'bad';

export interface InstantFeedbackExpectedNote {
  readonly nid: number;
  readonly midi: number;
  readonly onMs: number;
}

export interface InstantFeedbackConfig {
  readonly windowMs?: number;
  readonly anyOctave?: boolean;
}

export type InstantFeedbackInputResult =
  | {
      readonly matched: true;
      readonly nid: number;
      readonly expectedMidi: number;
      readonly status: InstantFeedbackGrade;
      readonly errorMs: number;
    }
  | {
      readonly matched: false;
      readonly status: 'bad';
      readonly expectedMidis: readonly number[];
    };

export interface InstantFeedbackTracker {
  processInput(midi: number, onMs: number): InstantFeedbackInputResult;
  sweepMissed(nowMs: number, graceMs?: number): readonly number[];
}


function noteWindow(
  note: InstantFeedbackExpectedNote,
  expected: readonly InstantFeedbackExpectedNote[],
  windowMs: number,
  anyOctave: boolean,
): number {
  const same = expected
    .filter((candidate) => samePitch(candidate.midi, note.midi, anyOctave))
    .sort((a, b) => a.onMs - b.onMs || a.nid - b.nid);
  const index = same.findIndex((candidate) => candidate.nid === note.nid);
  const neighbors = [same[index - 1], same[index + 1]]
    .filter((candidate): candidate is InstantFeedbackExpectedNote => !!candidate)
    .filter((candidate) => Math.abs(candidate.onMs - note.onMs) > 0.001);
  return neighbors.length === 0
    ? windowMs
    : Math.min(windowMs, 0.45 * Math.min(...neighbors.map((neighbor) => Math.abs(neighbor.onMs - note.onMs))));
}

export function createInstantFeedbackTracker(
  expected: readonly InstantFeedbackExpectedNote[],
  config: InstantFeedbackConfig = {},
): InstantFeedbackTracker {
  const windowMs = Math.min(250, Math.max(0, config.windowMs ?? 250));
  const anyOctave = !!config.anyOctave;
  const sorted = [...expected].sort((a, b) => a.onMs - b.onMs || a.nid - b.nid);
  const windows = new Map<number, number>(
    sorted.map((note) => [note.nid, noteWindow(note, sorted, windowMs, anyOctave)]),
  );
  const resolved = new Set<number>();

  return {
    processInput(midi: number, onMs: number): InstantFeedbackInputResult {
      let best: InstantFeedbackExpectedNote | null = null;
      let bestAbs = Infinity;
      for (const note of sorted) {
        if (resolved.has(note.nid) || !samePitch(note.midi, midi, anyOctave))
          continue;
        const win = windows.get(note.nid) ?? windowMs;
        const abs = Math.abs(onMs - note.onMs);
        if (abs <= win + 1e-6 && (abs < bestAbs - 1e-6 || (Math.abs(abs - bestAbs) <= 1e-6 && best && (note.onMs < best.onMs || (note.onMs === best.onMs && note.nid < best.nid))))) {
          best = note;
          bestAbs = abs;
        }
      }
      if (best) {
        resolved.add(best.nid);
        const status: InstantFeedbackGrade = bestAbs <= 100 ? 'good' : bestAbs <= 180 ? 'near' : 'bad';
        return {
          matched: true,
          nid: best.nid,
          expectedMidi: best.midi,
          status,
          errorMs: onMs - best.onMs,
        };
      }
      const near = sorted
        .filter((note) => !resolved.has(note.nid) && Math.abs(note.onMs - onMs) <= windowMs)
        .sort((a, b) => Math.abs(a.onMs - onMs) - Math.abs(b.onMs - onMs) || a.onMs - b.onMs || a.nid - b.nid);
      const expectedMidis: number[] = [];
      if (near.length) {
        const targetOnset = near[0].onMs;
        for (const note of near) {
          if (Math.abs(note.onMs - targetOnset) <= 5 && !expectedMidis.includes(note.midi))
            expectedMidis.push(note.midi);
        }
      }
      return { matched: false, status: 'bad', expectedMidis };
    },

    sweepMissed(nowMs: number, graceMs = 30): readonly number[] {
      const missed: number[] = [];
      for (const note of sorted) {
        if (resolved.has(note.nid))
          continue;
        const win = windows.get(note.nid) ?? windowMs;
        if (nowMs > note.onMs + win + graceMs) {
          resolved.add(note.nid);
          missed.push(note.nid);
        }
      }
      return missed;
    },
  };
}

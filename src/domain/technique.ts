/* Scale and arpeggio technique: exercises, fingering, and grading of a run by note accuracy and evenness.
   Pure functions only; the drill screen lives in technique-drill.ts. */

/**
 * Standard one-octave fingerings, ascending, indexed by the tonic's pitch class (C=0 … B=11).
 * Sources: pianoscales.org (major, natural & harmonic minor). Melodic minor (ascending) follows the harmonic
 * fingering, except C♯/F♯/G♯ where the raised 6th/7th moves the thumb off a black key (ABRSM-style).
 * Explore's circle of fifths shows the same table.
 */
export const SCALE_FINGERINGS = {
  maj: { rh: ['12312345', '23123412', '12312345', '31234123', '12312345', '12341234', '23412312', '12312345', '34123123', '12312345', '21231234', '12312345'],
    lh: ['54321321', '32143213', '54321321', '32143213', '54321321', '54321321', '43213214', '54321321', '32143213', '54321321', '32143213', '43214321'] },
  natural: { rh: ['12312345', '34123123', '12312345', '31234123', '12312345', '12341234', '23123123', '12312345', '34123123', '12312345', '21231234', '12312345'],
    lh: ['54321321', '32143213', '54321321', '21432132', '54321321', '54321321', '43213214', '54321321', '32132132', '54321321', '21321432', '43214321'] },
  harmonic: { rh: ['12312345', '34123123', '12312345', '31234123', '12312345', '12341234', '23123123', '12312345', '23123123', '12312345', '21231234', '12312345'],
    lh: ['54321321', '32143213', '54321321', '21432132', '54321321', '54321321', '43213214', '54321321', '32132143', '54321321', '21321432', '43214321'] },
  melodic: { rh: ['12312345', '23123412', '12312345', '31234123', '12312345', '12341234', '23123412', '12312345', '34123123', '12312345', '21231234', '12312345'],
    lh: ['54321321', '32143213', '54321321', '21432132', '54321321', '54321321', '43213214', '54321321', '32132143', '54321321', '21321432', '43214321'] },
} as const;

export type TechniqueKind = 'major' | 'minor' | 'arpMajor' | 'arpMinor';
export type TechniqueHands = 'rh' | 'lh' | 'both';
export type TechniqueHand = 'rh' | 'lh';
export const TECHNIQUE_KINDS: readonly TechniqueKind[] = ['major', 'minor', 'arpMajor', 'arpMinor'];
export const TECHNIQUE_HANDS: readonly TechniqueHands[] = ['rh', 'lh', 'both'];

/** One exercise: what to play, in which key (tonic pitch class), over how many octaves and with which hands. */
export interface TechniqueSpec {
  readonly kind: TechniqueKind;
  readonly tonicPc: number;
  readonly octaves: 1 | 2;
  readonly hands: TechniqueHands;
}
export interface TechniqueNote { readonly midi: number; readonly finger: number; readonly hand: TechniqueHand; readonly degree: number }
/** One step of a run: the note (or, hands together, the two notes an octave apart) played at once. */
export interface TechniqueStep { readonly notes: readonly TechniqueNote[] }

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11];

/**
 * Arpeggios use the white-key triads only (C, F and G major; A, D and E minor). For them the usual root-position
 * fingering is 1 2 3 5 in the right hand and 5 4 2 1 in the left; keys with black-key roots need other fingerings.
 */
export const ARPEGGIO_TONICS: Readonly<Record<'arpMajor' | 'arpMinor', readonly number[]>> = { arpMajor: [0, 5, 7], arpMinor: [9, 2, 4] };

export function techniqueKeyAllowed(kind: TechniqueKind, tonicPc: number): boolean {
  return kind === 'major' || kind === 'minor' || ARPEGGIO_TONICS[kind].includes(tonicPc);
}

/** The key's tonic as a letter index (C=0 … B=6) and accidental, spelled as the circle of fifths spells it. */
export function techniqueTonicSpelling(kind: TechniqueKind, tonicPc: number): { readonly letter: number; readonly acc: number } {
  const minor = kind === 'minor' || kind === 'arpMinor';
  const names = minor ? ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'] : ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const name = names[((tonicPc % 12) + 12) % 12];
  return { letter: 'CDEFGAB'.indexOf(name[0]), acc: name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0 };
}

/** Each scale degree spelled on consecutive letters (so the raised 7th of G♯ minor is F𝄪, not G). */
export function techniqueSpellDegree(kind: TechniqueKind, tonicPc: number, degree: number): { readonly letter: number; readonly acc: number } {
  const tonic = techniqueTonicSpelling(kind, tonicPc);
  const natural = [0, 2, 4, 5, 7, 9, 11];
  const offsets = kind === 'minor' || kind === 'arpMinor' ? HARMONIC_MINOR : MAJOR;
  const steps = kind === 'arpMajor' || kind === 'arpMinor' ? [0, 2, 4] : [0, 1, 2, 3, 4, 5, 6];
  const scaleDegree = steps[((degree % steps.length) + steps.length) % steps.length];
  const letter = (tonic.letter + scaleDegree) % 7;
  const pitch = natural[tonic.letter] + tonic.acc + offsets[scaleDegree];
  let acc = ((pitch - natural[letter]) % 12 + 12) % 12;
  if (acc > 6) acc -= 12;
  return { letter, acc };
}

// Ascending fingers for one hand over 1 or 2 octaves, ending on the top tonic.
function ascendingFingers(kind: TechniqueKind, tonicPc: number, hand: TechniqueHand, octaves: 1 | 2): number[] {
  if (kind === 'arpMajor' || kind === 'arpMinor') {
    // 1 2 3 5 / 1 2 3 1 2 3 5 (right), 5 4 2 1 / 5 4 2 1 4 2 1 (left).
    if (hand === 'rh') return octaves === 1 ? [1, 2, 3, 5] : [1, 2, 3, 1, 2, 3, 5];
    return octaves === 1 ? [5, 4, 2, 1] : [5, 4, 2, 1, 4, 2, 1];
  }
  const table = kind === 'major' ? SCALE_FINGERINGS.maj : SCALE_FINGERINGS.harmonic;
  const one = [...table[hand][tonicPc]].map(Number);
  if (octaves === 1) return one;
  // Two octaves: the right hand repeats the first seven fingers and ends on the top finger; the left hand plays the middle
  // tonic with the finger that ends its octave, then carries on as from the second note (C major: 5432132 1 432132 1).
  return hand === 'rh' ? [...one.slice(0, 7), ...one.slice(0, 7), one[7]] : [...one, ...one.slice(1)];
}

// The right hand starts on the tonic from middle C up; the left hand an octave lower.
function startMidi(tonicPc: number, hand: TechniqueHand): number {
  return (hand === 'rh' ? 60 : 48) + (((tonicPc % 12) + 12) % 12);
}

/** The whole run, up and back down without repeating the top note. */
export function techniqueSteps(spec: TechniqueSpec): TechniqueStep[] {
  const arpeggio = spec.kind === 'arpMajor' || spec.kind === 'arpMinor';
  const offsets = arpeggio ? (spec.kind === 'arpMajor' ? [0, 4, 7] : [0, 3, 7]) : spec.kind === 'major' ? MAJOR : HARMONIC_MINOR;
  const hands: TechniqueHand[] = spec.hands === 'both' ? ['rh', 'lh'] : [spec.hands];
  const perOctave = offsets.length;
  const count = perOctave * spec.octaves + 1;
  const up: TechniqueStep[] = [];
  const fingers = new Map(hands.map((hand) => [hand, ascendingFingers(spec.kind, spec.tonicPc, hand, spec.octaves)]));
  for (let index = 0; index < count; index += 1) {
    const octave = Math.floor(index / perOctave);
    const offset = offsets[index % perOctave] + 12 * octave;
    up.push({ notes: hands.map((hand) => ({ midi: startMidi(spec.tonicPc, hand) + offset, finger: fingers.get(hand)?.[index] ?? 0, hand, degree: index })) });
  }
  return [...up, ...up.slice(0, -1).reverse()];
}

/** The live state of one run. */
export interface TechniqueRun {
  readonly steps: readonly TechniqueStep[];
  index: number;
  pending: Set<number>;
  times: number[];
  readonly onsets: number[];
  readonly spreads: number[];
  readonly wrong: { readonly midi: number; readonly step: number }[];
}
export type TechniqueInput = 'step' | 'partial' | 'wrong' | 'done' | 'ignored';

export function techniqueStart(steps: readonly TechniqueStep[]): TechniqueRun {
  return { steps, index: 0, pending: new Set(steps[0]?.notes.map((note) => note.midi) ?? []), times: [], onsets: [], spreads: [], wrong: [] };
}

/**
 * One key going down at `timeMs`. A right note completes its step (both notes, hands together); any other key is a wrong note.
 * The run waits for the right notes, so it always ends on the last step.
 */
// With `anyOctave` (the setting Accept any octave), a key of the right note name counts in any octave: the exact key first,
// else the nearest note of that name still to play, so hands together each hand keeps its own key.
function pendingMatch(pending: ReadonlySet<number>, midi: number, anyOctave: boolean): number | null {
  if (pending.has(midi)) return midi;
  if (!anyOctave) return null;
  let best: number | null = null;
  for (const note of pending) {
    if ((note - midi) % 12 === 0 && (best === null || Math.abs(note - midi) < Math.abs(best - midi))) best = note;
  }
  return best;
}

export function techniqueNoteOn(run: TechniqueRun, midi: number, timeMs: number, anyOctave = false): TechniqueInput {
  if (run.index >= run.steps.length) return 'ignored';
  const hit = pendingMatch(run.pending, midi, anyOctave);
  if (hit === null) {
    run.wrong.push({ midi, step: run.index });
    return 'wrong';
  }
  run.pending.delete(hit);
  run.times.push(timeMs);
  if (run.pending.size) return 'partial';
  // The step sounds when its notes do: hands together, the mean of the two attacks.
  run.onsets.push(run.times.reduce((sum, value) => sum + value, 0) / run.times.length);
  run.spreads.push(Math.max(...run.times) - Math.min(...run.times));
  run.index += 1;
  run.times = [];
  run.pending = new Set(run.steps[run.index]?.notes.map((note) => note.midi) ?? []);
  return run.index >= run.steps.length ? 'done' : 'step';
}

export type TechniqueEvenness = 'steady' | 'fair' | 'uneven';
export interface TechniqueGrade {
  readonly notes: number;
  readonly wrong: number;
  /** Right notes as a share of all keys pressed, 0–100. */
  readonly accuracy: number;
  readonly meanIoiMs: number;
  /** Standard deviation of the gaps between notes. A constant input latency shifts every onset alike and cancels out. */
  readonly spreadMs: number;
  /** The spread relative to the mean gap. */
  readonly cv: number;
  readonly evenness: TechniqueEvenness;
  /** The step after the gap furthest from the mean (the classic spot is a thumb passing under). */
  readonly worstStep: number;
  /** Hands together: the mean time between the two hands' attacks. */
  readonly handSyncMs: number | null;
  /** No wrong notes and playing that is at least fairly even. */
  readonly clean: boolean;
}

export const TECHNIQUE_STEADY_CV = 0.08;
export const TECHNIQUE_FAIR_CV = 0.15;

export function techniqueGrade(run: TechniqueRun): TechniqueGrade {
  const notes = run.steps.reduce((sum, step) => sum + step.notes.length, 0);
  const gaps = run.onsets.slice(1).map((onset, index) => onset - run.onsets[index]);
  const mean = gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0;
  const spread = gaps.length ? Math.sqrt(gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / gaps.length) : 0;
  const cv = mean > 0 ? spread / mean : 0;
  let worst = 0;
  gaps.forEach((gap, index) => { if (Math.abs(gap - mean) > Math.abs(gaps[worst] - mean)) worst = index; });
  const evenness: TechniqueEvenness = cv <= TECHNIQUE_STEADY_CV ? 'steady' : cv <= TECHNIQUE_FAIR_CV ? 'fair' : 'uneven';
  const twoHands = run.steps[0]?.notes.length === 2;
  return {
    notes,
    wrong: run.wrong.length,
    accuracy: Math.round(100 * notes / (notes + run.wrong.length)),
    meanIoiMs: Math.round(mean),
    spreadMs: Math.round(spread),
    cv,
    evenness,
    worstStep: gaps.length ? worst + 1 : 0,
    handSyncMs: twoHands && run.spreads.length ? Math.round(run.spreads.reduce((sum, value) => sum + value, 0) / run.spreads.length) : null,
    clean: run.wrong.length === 0 && run.index >= run.steps.length && evenness !== 'uneven',
  };
}

/** A stable name for an exercise, so a clean run can hide its fingering for the rest of the session. */
export function techniqueSpecKey(spec: TechniqueSpec): string {
  return `${spec.kind}:${spec.tonicPc}:${spec.octaves}:${spec.hands}`;
}

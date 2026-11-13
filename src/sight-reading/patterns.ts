// Named patterns: the shapes a reader takes in at one glance. Each pattern has a recogniser that looks at the notes
// of one bar (rule G16 of docs/plans/2026-11-13-read-redesign-spec.md).
import {
  srtIsSyncopated, srtLevelPatterns, srtMeterTicks, srtPitchPlace,
  type LevelPiece, type ReadingPatternId,
} from './levels.js';
import type { SightReadingHand } from './model.js';

/** A level piece together with the plan it was built from. */
export type PlannedPiece = LevelPiece & {
  /** The chord of each half of each bar, as the scale degree of its root (0 = I, 3 = IV, 4 = V). */
  readonly chords: readonly (readonly [number, number])[];
  /** The hand that carries the melody in each bar. */
  readonly melody: readonly SightReadingHand[];
  /** The first bar is an upbeat bar: it starts with rests. */
  readonly upbeat: boolean;
};

/** One sounding note (or chord) of a hand, placed in its key. */
export type LineNote = {
  readonly onset: number;
  readonly duration: number;
  readonly bar: number;
  readonly degrees: readonly number[];
  readonly alters: readonly number[];
  readonly midis: readonly number[];
  /** The degree the hand's line passes through: the top note for the right hand, the bottom note for the left. */
  readonly line: number;
  readonly alter: number;
  /** A rest sits between the previous note of the hand and this one. */
  readonly afterRest: boolean;
};

const HALF = 960;
const EIGHTH = 240;
const SIXTEENTH = 120;
const mod7 = (value: number): number => ((value % 7) + 7) % 7;

/** In canonical order: the order in which a bar lists its patterns. */
const ALL_PATTERNS: readonly ReadingPatternId[] = [
  'stepRun', 'repeatedNote', 'longNote', 'skip', 'neighbour', 'brokenTriad', 'leapFifth', 'eighthRun', 'sequence',
  'heldNote', 'tie', 'parallelMotion', 'contraryMotion', 'dottedFigure', 'scaleShift', 'twoNoteChord', 'sixteenthRun',
  'chromaticNeighbour', 'brokenChordBass', 'upbeat', 'syncopation', 'chordsBothHands',
];

/** The three scale degrees (0 to 6) of the triad on a root. */
export function srtChordTones(root: number): readonly number[] {
  return [mod7(root), mod7(root + 2), mod7(root + 4)];
}

/** The root of the chord that governs a tick: the first half of the bar or the second. */
export function srtChordAt(piece: PlannedPiece, tick: number): number {
  const { bar } = srtMeterTicks(piece.meter);
  const slots = piece.chords[Math.floor(tick / bar)] ?? [0, 0];
  return slots[tick % bar >= bar / 2 ? 1 : 0];
}

const LINES = new WeakMap<LevelPiece, Partial<Record<SightReadingHand, readonly LineNote[]>>>();

/**
 * The notes of one hand in order, without the rests. Notes the key cannot place are left out.
 * The result is kept per piece object: a piece is not changed after it is built.
 */
export function srtHandLine(piece: LevelPiece, hand: SightReadingHand): readonly LineNote[] {
  const kept = LINES.get(piece) ?? {};
  const known = kept[hand];
  if (known) return known;
  const line = readHandLine(piece, hand);
  LINES.set(piece, { ...kept, [hand]: line });
  return line;
}

function readHandLine(piece: LevelPiece, hand: SightReadingHand): readonly LineNote[] {
  const { bar } = srtMeterTicks(piece.meter);
  const events = piece.events.filter((event) => event.hand === hand).sort((a, b) => a.onsetTick - b.onsetTick);
  const notes: LineNote[] = [];
  let afterRest = false;
  for (const event of events) {
    const placed = event.pitches.flatMap((pitch) => {
      const place = srtPitchPlace(pitch, piece.key, hand);
      return place ? [{ ...place, midi: pitch.midi }] : [];
    });
    if (placed.length === 0) {
      afterRest = true;
      continue;
    }
    const lineNote = hand === 'rh' ? placed[placed.length - 1] : placed[0];
    notes.push({
      onset: event.onsetTick, duration: event.durationTick, bar: Math.floor(event.onsetTick / bar),
      degrees: placed.map((place) => place.degree), alters: placed.map((place) => place.alter), midis: placed.map((place) => place.midi),
      line: lineNote.degree, alter: lineNote.alter, afterRest,
    });
    afterRest = false;
  }
  return notes;
}

/** The melody of the piece: in each bar, the notes of the hand that carries it. */
export function srtMelodyLine(piece: PlannedPiece): readonly LineNote[] {
  const lines = { rh: srtHandLine(piece, 'rh'), lh: srtHandLine(piece, 'lh') };
  return Array.from({ length: piece.bars }, (_, bar) => lines[piece.melody[bar] ?? 'rh'].filter((note) => note.bar === bar)).flat();
}

/** True when `count` notes in a row, each right after the one before, satisfy `test` on every neighbouring pair. */
function hasRun(notes: readonly LineNote[], count: number, test: (a: LineNote, b: LineNote, first: LineNote, second: LineNote) => boolean): boolean {
  for (let start = 0; start + count <= notes.length; start += 1) {
    let ok = true;
    for (let index = start + 1; index < start + count && ok; index += 1) {
      ok = !notes[index].afterRest && test(notes[index - 1], notes[index], notes[start], notes[start + 1]);
    }
    if (ok) return true;
  }
  return false;
}

const move = (a: LineNote, b: LineNote): number => b.line - a.line;
/** Each pair moves by the same amount as the first pair, and that amount is one of `sizes`. */
const sameMove = (sizes: readonly number[]) => (a: LineNote, b: LineNote, first: LineNote, second: LineNote): boolean =>
  move(a, b) === move(first, second) && sizes.includes(move(a, b));

type BarView = {
  readonly piece: PlannedPiece;
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly rh: readonly LineNote[];
  readonly lh: readonly LineNote[];
  readonly lines: Readonly<Record<SightReadingHand, readonly LineNote[]>>;
};

/** Both hands move at the same moments for two moves in a row, in the same direction (sign 1) or in opposite ones (-1). */
function movesTogether(view: BarView, sign: 1 | -1): boolean {
  for (let i = 0; i + 2 < view.rh.length; i += 1) {
    const j = view.lh.findIndex((note) => note.onset === view.rh[i].onset);
    if (j < 0 || j + 2 >= view.lh.length) continue;
    let ok = true;
    for (let step = 1; step <= 2 && ok; step += 1) {
      const right = view.rh[i + step];
      const left = view.lh[j + step];
      ok = right.onset === left.onset && !right.afterRest && !left.afterRest &&
        Math.sign(move(view.rh[i + step - 1], right)) * Math.sign(move(view.lh[j + step - 1], left)) === sign;
    }
    if (ok) return true;
  }
  return false;
}

function barRhythm(piece: PlannedPiece, bar: number): string {
  const { bar: ticks } = srtMeterTicks(piece.meter);
  return piece.events
    .filter((event) => event.hand === (piece.melody[bar] ?? 'rh') && Math.floor(event.onsetTick / ticks) === bar)
    .sort((a, b) => a.onsetTick - b.onsetTick)
    .map((event) => `${event.onsetTick - bar * ticks}:${event.durationTick}:${event.pitches.length > 0 ? 1 : 0}`)
    .join(' ');
}

/** The rhythm of the melody in a bar, as text: equal text means equal rhythm, rests included. */
export function srtMelodyRhythm(piece: PlannedPiece, bar: number): string {
  return barRhythm(piece, bar);
}

const RECOGNISERS: Readonly<Record<ReadingPatternId, (view: BarView) => boolean>> = {
  stepRun: (view) => [view.rh, view.lh].some((notes) => hasRun(notes, 3, sameMove([1, -1]))),
  repeatedNote: (view) => [view.rh, view.lh].some((notes) => hasRun(notes, 2, (a, b) => move(a, b) === 0 && a.alter === b.alter)),
  longNote: (view) => [...view.rh, ...view.lh].some((note) => note.duration >= Math.min(HALF, view.end - view.start)),
  skip: (view) => [view.rh, view.lh].some((notes) => hasRun(notes, 2, (a, b) => Math.abs(move(a, b)) === 2)),
  neighbour: (view) => [view.rh, view.lh].some((notes) => notes.some((note, index) => index >= 2 && !note.afterRest && !notes[index - 1].afterRest &&
    note.line === notes[index - 2].line && Math.abs(move(notes[index - 1], note)) === 1 &&
    note.alter === 0 && notes[index - 1].alter === 0 && notes[index - 2].alter === 0)),
  brokenTriad: (view) => [view.rh, view.lh].some((notes) => hasRun(notes, 3, sameMove([2, -2]))),
  leapFifth: (view) => [view.rh, view.lh].some((notes) => hasRun(notes, 2, (a, b) => Math.abs(move(a, b)) === 4)),
  eighthRun: (view) => view.piece.meter.den === 4 && [view.rh, view.lh].some((notes) =>
    hasRun(notes, 2, (a, b) => a.duration === EIGHTH && b.duration === EIGHTH && Math.abs(move(a, b)) === 1)),
  sequence: (view) => {
    if (view.index === 0) return false;
    const width = view.end - view.start;
    const now = view.lines[view.piece.melody[view.index] ?? 'rh'].filter((note) => note.bar === view.index);
    const before = view.lines[view.piece.melody[view.index - 1] ?? 'rh'].filter((note) => note.bar === view.index - 1);
    if (now.length < 3 || now.length !== before.length) return false;
    const shift = now[0].line - before[0].line;
    return Math.abs(shift) >= 1 && Math.abs(shift) <= 2 && now.every((note, index) =>
      note.line - before[index].line === shift && note.duration === before[index].duration && note.onset - before[index].onset === width);
  },
  heldNote: (view) => (['rh', 'lh'] as const).some((hand) => {
    const other = hand === 'rh' ? view.lh : view.rh;
    return view.lines[hand].some((note) => note.duration >= HALF && note.onset < view.end && note.onset + note.duration > view.start &&
      other.filter((moving) => moving.onset >= note.onset && moving.onset < note.onset + note.duration).length >= 2);
  }),
  tie: (view) => [...view.rh, ...view.lh].some((note) => note.onset + note.duration > view.end),
  parallelMotion: (view) => movesTogether(view, 1),
  contraryMotion: (view) => movesTogether(view, -1),
  dottedFigure: (view) => view.piece.meter.den === 4 && [view.rh, view.lh].some((notes) =>
    hasRun(notes, 2, (a, b) => a.duration === 3 * EIGHTH && b.duration === EIGHTH)),
  scaleShift: (view) => [view.rh, view.lh].some((notes) => notes.length > 0 &&
    Math.max(...notes.map((note) => note.line)) - Math.min(...notes.map((note) => note.line)) >= 5 && hasRun(notes, 4, sameMove([1, -1]))),
  twoNoteChord: (view) => [...view.rh, ...view.lh].some((note) => note.degrees.length === 2),
  sixteenthRun: (view) => [view.rh, view.lh].some((notes) =>
    hasRun(notes, 4, (a, b) => a.duration === SIXTEENTH && b.duration === SIXTEENTH && Math.abs(move(a, b)) === 1)),
  chromaticNeighbour: (view) => [view.rh, view.lh].some((notes) => notes.some((note, index) => {
    if (index < 2 || note.afterRest || notes[index - 1].afterRest) return false;
    const middle = notes[index - 1];
    const leadingNote = view.piece.key.mode === 'minor' && middle.alter === 1 && mod7(middle.line) === 6;
    return note.line === notes[index - 2].line && note.alter === 0 && notes[index - 2].alter === 0 &&
      middle.alter !== 0 && !leadingNote && Math.abs(middle.line - note.line) <= 1;
  })),
  brokenChordBass: (view) => view.lh.length >= 3 &&
    view.lh.every((note) => note.degrees.length === 1 && note.alter === 0 && srtChordTones(srtChordAt(view.piece, note.onset)).includes(mod7(note.line))) &&
    new Set(view.lh.map((note) => note.line)).size >= 2 &&
    view.lh.some((note, index) => index > 0 && Math.abs(move(view.lh[index - 1], note)) >= 2),
  upbeat: (view) => view.index === 0 && view.piece.upbeat && view.rh.length + view.lh.length > 0 &&
    ![...view.rh, ...view.lh].some((note) => note.onset === 0),
  syncopation: (view) => [...view.rh, ...view.lh].some((note) => srtIsSyncopated(view.piece.meter, note.onset, note.duration)),
  chordsBothHands: (view) => view.rh.some((note) => note.degrees.length === 2) && view.lh.some((note) => note.degrees.length === 2),
};

/** The patterns found in each bar, limited to the patterns the level of the piece knows. */
export function srtBarPatterns(piece: PlannedPiece): readonly (readonly ReadingPatternId[])[] {
  const { bar } = srtMeterTicks(piece.meter);
  const lines = { rh: srtHandLine(piece, 'rh'), lh: srtHandLine(piece, 'lh') };
  const known = srtLevelPatterns(piece.level);
  return Array.from({ length: piece.bars }, (_, index) => {
    const view: BarView = {
      piece, index, start: index * bar, end: (index + 1) * bar, lines,
      rh: lines.rh.filter((note) => note.bar === index), lh: lines.lh.filter((note) => note.bar === index),
    };
    return ALL_PATTERNS.filter((pattern) => known.includes(pattern) && RECOGNISERS[pattern](view));
  });
}

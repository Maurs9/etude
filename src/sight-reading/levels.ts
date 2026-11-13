// Reading levels 1 to 8: what each level may contain, the 24 keys, and the check that a piece stays inside its level
// (rule G2 of docs/plans/2026-11-13-read-redesign-spec.md). The older profiles in model.ts are not affected.
import { TICKS_PER_QUARTER, type SightReadingEvent, type SightReadingHand, type SightReadingPitch } from './model.js';

export type ReadingLevelId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
/**
 * How the two hands share a piece.
 * blocks: one hand plays the first half, the other the second half.
 * alternate: one hand at a time, changing at least twice.
 * oneMoves: both hands in every bar, and in every bar one of them only holds long notes.
 * together: both hands in every bar.
 */
export type ReadingHandsMode = 'blocks' | 'alternate' | 'oneMoves' | 'together';
export type ReadingMeter = { readonly num: 2 | 3 | 4 | 6; readonly den: 4 | 8 };
export type ReadingKeyId =
  | 'C' | 'G' | 'F' | 'D' | 'Bb' | 'A' | 'Eb' | 'E' | 'Ab' | 'B' | 'Db' | 'F#'
  | 'Am' | 'Em' | 'Dm' | 'Bm' | 'Gm' | 'F#m' | 'Cm' | 'C#m' | 'Fm' | 'G#m' | 'Bbm' | 'Ebm';
/** keyN counts the sharps (positive) or flats (negative) of the signature. A minor key is written in its natural form. */
export type ReadingKey = { readonly id: ReadingKeyId; readonly tonic: string; readonly mode: 'major' | 'minor'; readonly keyN: number };
export type ReadingPatternId =
  | 'stepRun' | 'repeatedNote' | 'longNote' | 'neighbour'
  | 'skip'
  | 'brokenTriad' | 'leapFifth' | 'eighthRun' | 'sequence'
  | 'heldNote' | 'tie'
  | 'parallelMotion' | 'contraryMotion' | 'dottedFigure'
  | 'scaleShift' | 'twoNoteChord' | 'sixteenthRun'
  | 'chromaticNeighbour' | 'brokenChordBass' | 'upbeat'
  | 'syncopation' | 'chordsBothHands';

export type ReadingLevel = {
  readonly id: ReadingLevelId;
  readonly hands: ReadingHandsMode;
  /** Lowest and highest scale degree a hand may play, counted from its tonic (0). */
  readonly degrees: readonly [number, number];
  /** Largest move between two notes of one hand, in scale steps (1 = a second, 4 = a fifth, 7 = an octave). */
  readonly maxLeap: number;
  /** Note values, in ticks. Each written part of a note tied over a barline must be one of these. */
  readonly noteTicks: readonly number[];
  /** Rest values, in ticks. A whole-bar rest is separate: it belongs to the levels where one hand waits. */
  readonly restTicks: readonly number[];
  readonly gridTicks: number;
  readonly meters: readonly ReadingMeter[];
  readonly bars: readonly number[];
  readonly bpm: number;
  readonly tieOverBar: boolean;
  /** The first bar may hold an upbeat, so one hand may wait in it. */
  readonly upbeat: boolean;
  /** When false, a note that starts off the beat must end by the next beat. */
  readonly syncopation: boolean;
  /** The raised seventh of a minor key, allowed without counting as a chromatic note. */
  readonly leadingTone: boolean;
  /** How many notes outside the key a piece may have. */
  readonly maxChromatic: number;
  /** How many notes one hand may play at once. */
  readonly chord: Readonly<Record<SightReadingHand, number>>;
  /** Keys that join the default mix at this level. */
  readonly newKeys: readonly ReadingKeyId[];
  readonly newPatterns: readonly ReadingPatternId[];
};

/** A generated piece for a reading level. An upbeat is written as a first bar that starts with rests. */
export type LevelPiece = {
  readonly schemaVersion: 1;
  readonly generatorVersion: 2;
  readonly level: ReadingLevelId;
  readonly seed: number;
  readonly meter: ReadingMeter;
  readonly ticksPerQuarter: 480;
  readonly key: ReadingKey;
  readonly bars: number;
  /** Each hand fills the whole piece without gaps: a rest is an event with no pitches. */
  readonly events: readonly SightReadingEvent[];
};

export type LevelViolationCode =
  | 'schema' | 'meter' | 'bars' | 'event' | 'pitch' | 'grid' | 'bounds' | 'crossBar' | 'tiling'
  | 'noteValue' | 'restValue' | 'offbeat' | 'range' | 'leap' | 'accidental' | 'chord' | 'hands';
export type LevelViolation = { readonly code: LevelViolationCode; readonly detail: string; readonly eventId?: string };

const WHOLE = 1920;
const DOTTED_HALF = 1440;
const HALF = 960;
const DOTTED_QUARTER = 720;
const QUARTER = 480;
const EIGHTH = 240;
const SIXTEENTH = 120;
const M44: ReadingMeter = { num: 4, den: 4 };
const M34: ReadingMeter = { num: 3, den: 4 };
const M24: ReadingMeter = { num: 2, den: 4 };
const M38: ReadingMeter = { num: 3, den: 8 };
const M68: ReadingMeter = { num: 6, den: 8 };
const ONE_NOTE = { rh: 1, lh: 1 } as const;

/** Freezes a table and everything in it, so a caller cannot change the limits of a level. */
export function srtDeepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value) as unknown[]) srtDeepFreeze(child);
  }
  return value;
}

/** Longest piece the check will look at. The levels use 12 bars at most. */
const MAX_BARS = 64;

const LEVELS: readonly ReadingLevel[] = srtDeepFreeze([
  {
    id: 1, hands: 'blocks', degrees: [0, 4], maxLeap: 1,
    noteTicks: [WHOLE, HALF, QUARTER], restTicks: [], gridTicks: QUARTER,
    meters: [M44], bars: [4], bpm: 66,
    tieOverBar: false, upbeat: false, syncopation: false, leadingTone: false, maxChromatic: 0, chord: ONE_NOTE,
    newKeys: ['C', 'G', 'F', 'Am', 'Dm'], newPatterns: ['stepRun', 'repeatedNote', 'longNote', 'neighbour'],
  },
  {
    id: 2, hands: 'blocks', degrees: [0, 4], maxLeap: 2,
    noteTicks: [WHOLE, DOTTED_HALF, HALF, QUARTER], restTicks: [QUARTER], gridTicks: QUARTER,
    meters: [M44, M34], bars: [4], bpm: 66,
    tieOverBar: false, upbeat: false, syncopation: false, leadingTone: false, maxChromatic: 0, chord: ONE_NOTE,
    newKeys: [], newPatterns: ['skip'],
  },
  {
    id: 3, hands: 'alternate', degrees: [0, 4], maxLeap: 4,
    noteTicks: [WHOLE, DOTTED_HALF, HALF, QUARTER, EIGHTH], restTicks: [HALF, QUARTER], gridTicks: EIGHTH,
    meters: [M44, M34, M24], bars: [4, 6], bpm: 72,
    tieOverBar: false, upbeat: false, syncopation: false, leadingTone: false, maxChromatic: 0, chord: ONE_NOTE,
    newKeys: ['D', 'Bb', 'Em', 'Gm'], newPatterns: ['brokenTriad', 'leapFifth', 'eighthRun', 'sequence'],
  },
  {
    id: 4, hands: 'oneMoves', degrees: [0, 4], maxLeap: 4,
    noteTicks: [WHOLE, DOTTED_HALF, HALF, QUARTER, EIGHTH], restTicks: [HALF, QUARTER], gridTicks: EIGHTH,
    meters: [M44, M34, M24], bars: [4, 6], bpm: 63,
    tieOverBar: true, upbeat: false, syncopation: false, leadingTone: false, maxChromatic: 0, chord: ONE_NOTE,
    newKeys: [], newPatterns: ['heldNote', 'tie'],
  },
  {
    id: 5, hands: 'together', degrees: [0, 5], maxLeap: 4,
    noteTicks: [WHOLE, DOTTED_HALF, HALF, DOTTED_QUARTER, QUARTER, EIGHTH], restTicks: [HALF, QUARTER, EIGHTH], gridTicks: EIGHTH,
    meters: [M44, M34, M24], bars: [8], bpm: 66,
    tieOverBar: true, upbeat: false, syncopation: false, leadingTone: false, maxChromatic: 0, chord: ONE_NOTE,
    newKeys: ['A', 'Eb', 'Bm', 'Cm'], newPatterns: ['parallelMotion', 'contraryMotion', 'dottedFigure'],
  },
  {
    id: 6, hands: 'together', degrees: [0, 7], maxLeap: 5,
    noteTicks: [WHOLE, DOTTED_HALF, HALF, DOTTED_QUARTER, QUARTER, EIGHTH, SIXTEENTH], restTicks: [HALF, QUARTER, EIGHTH], gridTicks: SIXTEENTH,
    meters: [M44, M34, M24, M38], bars: [8], bpm: 66,
    tieOverBar: true, upbeat: false, syncopation: false, leadingTone: true, maxChromatic: 0, chord: { rh: 1, lh: 2 },
    newKeys: [], newPatterns: ['scaleShift', 'twoNoteChord', 'sixteenthRun'],
  },
  {
    id: 7, hands: 'together', degrees: [-1, 7], maxLeap: 7,
    noteTicks: [WHOLE, DOTTED_HALF, HALF, DOTTED_QUARTER, QUARTER, EIGHTH, SIXTEENTH], restTicks: [HALF, QUARTER, EIGHTH], gridTicks: SIXTEENTH,
    meters: [M44, M34, M24, M38, M68], bars: [8], bpm: 60,
    tieOverBar: true, upbeat: true, syncopation: false, leadingTone: true, maxChromatic: 2, chord: { rh: 1, lh: 2 },
    newKeys: ['E', 'Ab', 'F#m', 'Fm'], newPatterns: ['chromaticNeighbour', 'brokenChordBass', 'upbeat'],
  },
  {
    id: 8, hands: 'together', degrees: [-2, 9], maxLeap: 7,
    noteTicks: [WHOLE, DOTTED_HALF, HALF, DOTTED_QUARTER, QUARTER, EIGHTH, SIXTEENTH], restTicks: [HALF, QUARTER, EIGHTH], gridTicks: SIXTEENTH,
    meters: [M44, M34, M24, M38, M68], bars: [8, 12], bpm: 72,
    tieOverBar: true, upbeat: true, syncopation: true, leadingTone: true, maxChromatic: 3, chord: { rh: 2, lh: 2 },
    newKeys: ['B', 'Db', 'F#', 'C#m', 'G#m', 'Bbm', 'Ebm'], newPatterns: ['syncopation', 'chordsBothHands'],
  },
]);

// In learning order: fewest sharps or flats first.
const KEYS: readonly ReadingKey[] = srtDeepFreeze([
  { id: 'C', tonic: 'C', mode: 'major', keyN: 0 },
  { id: 'G', tonic: 'G', mode: 'major', keyN: 1 },
  { id: 'F', tonic: 'F', mode: 'major', keyN: -1 },
  { id: 'D', tonic: 'D', mode: 'major', keyN: 2 },
  { id: 'Bb', tonic: 'Bb', mode: 'major', keyN: -2 },
  { id: 'A', tonic: 'A', mode: 'major', keyN: 3 },
  { id: 'Eb', tonic: 'Eb', mode: 'major', keyN: -3 },
  { id: 'E', tonic: 'E', mode: 'major', keyN: 4 },
  { id: 'Ab', tonic: 'Ab', mode: 'major', keyN: -4 },
  { id: 'B', tonic: 'B', mode: 'major', keyN: 5 },
  { id: 'Db', tonic: 'Db', mode: 'major', keyN: -5 },
  { id: 'F#', tonic: 'F#', mode: 'major', keyN: 6 },
  { id: 'Am', tonic: 'A', mode: 'minor', keyN: 0 },
  { id: 'Em', tonic: 'E', mode: 'minor', keyN: 1 },
  { id: 'Dm', tonic: 'D', mode: 'minor', keyN: -1 },
  { id: 'Bm', tonic: 'B', mode: 'minor', keyN: 2 },
  { id: 'Gm', tonic: 'G', mode: 'minor', keyN: -2 },
  { id: 'F#m', tonic: 'F#', mode: 'minor', keyN: 3 },
  { id: 'Cm', tonic: 'C', mode: 'minor', keyN: -3 },
  { id: 'C#m', tonic: 'C#', mode: 'minor', keyN: 4 },
  { id: 'Fm', tonic: 'F', mode: 'minor', keyN: -4 },
  { id: 'G#m', tonic: 'G#', mode: 'minor', keyN: 5 },
  { id: 'Bbm', tonic: 'Bb', mode: 'minor', keyN: -5 },
  { id: 'Ebm', tonic: 'Eb', mode: 'minor', keyN: -6 },
]);

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const NATURAL_PCS = [0, 2, 4, 5, 7, 9, 11] as const;
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10] as const;
const HANDS = ['rh', 'lh'] as const;

type ScaleNote = { readonly letter: number; readonly accidental: number };
type KeyData = {
  readonly steps: readonly number[];
  readonly scale: readonly ScaleNote[];
  /** MIDI number of the tonic under each hand, and its position counted in letters (7 per octave). */
  readonly tonicMidi: Readonly<Record<SightReadingHand, number>>;
  readonly tonicLetterIndex: Readonly<Record<SightReadingHand, number>>;
};

const mod = (value: number, size: number): number => ((value % size) + size) % size;
const accidentalSign = (accidental: number): string => (accidental === 1 ? '#' : accidental === -1 ? 'b' : '');
/** The octave number of a spelled note: B sharp 3 sounds as C4 but is written in octave 3. */
const writtenOctave = (midi: number, accidental: number): number => Math.floor((midi - accidental) / 12) - 1;

function buildKeyData(key: ReadingKey): KeyData {
  const match = /^([A-G])([#b]?)$/.exec(key.tonic);
  if (!match) throw new RangeError(`Invalid tonic: ${key.tonic}`);
  const tonicLetter = LETTERS.indexOf(match[1] as typeof LETTERS[number]);
  const tonicAccidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  const tonicPc = mod(NATURAL_PCS[tonicLetter] + tonicAccidental, 12);
  const steps = key.mode === 'major' ? MAJOR_STEPS : MINOR_STEPS;
  const scale = steps.map((step, index) => {
    const letter = (tonicLetter + index) % 7;
    return { letter, accidental: mod(tonicPc + step - NATURAL_PCS[letter] + 6, 12) - 6 };
  });
  // Right hand: tonic from C4 to B4. Left hand: tonic from F2 to E3, so both five-finger positions sit on the staff.
  const tonicMidi = { rh: 60 + tonicPc, lh: (tonicPc >= 5 ? 36 : 48) + tonicPc };
  const letterIndex = (midi: number): number => writtenOctave(midi, tonicAccidental) * 7 + tonicLetter;
  return { steps, scale, tonicMidi, tonicLetterIndex: { rh: letterIndex(tonicMidi.rh), lh: letterIndex(tonicMidi.lh) } };
}

const KEY_DATA: ReadonlyMap<ReadingKeyId, KeyData> = new Map(KEYS.map((key) => [key.id, buildKeyData(key)]));

function keyData(key: ReadingKey): KeyData {
  const data = KEY_DATA.get(key.id);
  if (!data) throw new RangeError(`Unknown reading key: ${String(key.id)}`);
  return data;
}

export function srtLevels(): readonly ReadingLevel[] {
  return LEVELS;
}

export function srtLevel(id: number): ReadingLevel {
  const level = LEVELS.find((candidate) => candidate.id === id);
  if (!level) throw new RangeError(`Unknown reading level: ${id}`);
  return level;
}

export function srtReadingKeys(): readonly ReadingKey[] {
  return KEYS;
}

export function srtReadingKey(id: string): ReadingKey {
  const key = KEYS.find((candidate) => candidate.id === id);
  if (!key) throw new RangeError(`Unknown reading key: ${id}`);
  return key;
}

/** The keys of the default mix at a level: its own new keys and those of every earlier level. */
export function srtKeyPool(levelId: number): readonly ReadingKey[] {
  const level = srtLevel(levelId);
  return LEVELS.filter((candidate) => candidate.id <= level.id).flatMap((candidate) => candidate.newKeys.map(srtReadingKey));
}

/** The patterns a piece of this level may be built from: its own new patterns and those of every earlier level. */
export function srtLevelPatterns(levelId: number): readonly ReadingPatternId[] {
  const level = srtLevel(levelId);
  return LEVELS.filter((candidate) => candidate.id <= level.id).flatMap((candidate) => candidate.newPatterns);
}

/** The seven note names of the key, from the tonic up. */
export function srtKeyScale(key: ReadingKey): readonly string[] {
  return keyData(key).scale.map((note) => `${LETTERS[note.letter]}${accidentalSign(note.accidental)}`);
}

/**
 * The note on a scale degree under a hand. Degree 0 is the tonic of the hand position, 7 the tonic an octave higher,
 * -1 the note below the tonic. `alter` raises (+1) or lowers (-1) the note by a semitone.
 * Throws when the note would need a double sharp or a double flat.
 */
export function srtDegreePitch(key: ReadingKey, hand: SightReadingHand, degree: number, alter = 0): SightReadingPitch {
  if (!Number.isInteger(degree) || !Number.isInteger(alter)) throw new RangeError(`Invalid degree: ${degree}/${alter}`);
  if (hand !== 'rh' && hand !== 'lh') throw new RangeError(`Invalid hand: ${String(hand)}`);
  const data = keyData(key);
  const index = mod(degree, 7);
  const note = data.scale[index];
  const accidental = note.accidental + alter;
  if (accidental < -1 || accidental > 1) throw new RangeError(`Unspellable note: ${key.id} degree ${degree} alter ${alter}`);
  const midi = data.tonicMidi[hand] + data.steps[index] + 12 * Math.floor(degree / 7) + alter;
  return { midi, spelling: `${LETTERS[note.letter]}${accidentalSign(accidental)}${writtenOctave(midi, accidental)}`, finger: null };
}

/** The lowest and highest MIDI note of the level's degrees under a hand, before any alteration. */
export function srtLevelRange(level: ReadingLevel, key: ReadingKey, hand: SightReadingHand): { readonly min: number; readonly max: number } {
  return { min: srtDegreePitch(key, hand, level.degrees[0]).midi, max: srtDegreePitch(key, hand, level.degrees[1]).midi };
}

/** Bar and beat length in ticks. In 3/8 and 6/8 the beat is the dotted quarter. */
export function srtMeterTicks(meter: ReadingMeter): { readonly bar: number; readonly beat: number } {
  return meter.den === 4
    ? { bar: meter.num * QUARTER, beat: QUARTER }
    : { bar: meter.num * EIGHTH, beat: DOTTED_QUARTER };
}

/** The ticks inside a bar that carry a strong beat: beats 1 and 3 of 4/4, both beats of 6/8, beat 1 elsewhere. */
export function srtStrongOnsets(meter: ReadingMeter): readonly number[] {
  const { beat } = srtMeterTicks(meter);
  return meter.num === 4 && meter.den === 4 ? [0, 2 * beat] : meter.num === 6 ? [0, beat] : [0];
}

/**
 * Syncopation is one of four things:
 * a note that starts off the beat and is held past the next beat;
 * in 4/4, a note on beat 2 or 4 that lasts longer than a beat;
 * a note tied over the barline from anywhere but a strong beat;
 * in compound time, a note from the beat that ends inside a later beat.
 */
export function srtIsSyncopated(meter: ReadingMeter, onset: number, duration: number): boolean {
  const { bar, beat } = srtMeterTicks(meter);
  const offset = onset % beat;
  if (offset !== 0) return offset + duration > beat;
  const strong = srtStrongOnsets(meter);
  const inBar = onset % bar;
  const crossesBar = inBar + duration > bar;
  return (duration > beat && !strong.includes(inBar) && (crossesBar || strong.length > 1)) ||
    (meter.den === 8 && duration > beat && duration % beat !== 0);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/** Array.isArray as a plain test: used as a type guard it would turn a readonly array into any[]. */
function isList(value: unknown): boolean {
  return Array.isArray(value);
}

/** Where a written note sits in its key: its degree under the hand, and how far it is altered from the scale. */
export function srtPitchPlace(pitch: SightReadingPitch, key: ReadingKey, hand: SightReadingHand): { readonly degree: number; readonly alter: number } | null {
  if (!pitch || typeof pitch.spelling !== 'string' || !isInteger(pitch.midi) || pitch.midi < 0 || pitch.midi > 127) return null;
  if (pitch.finger !== null && !(isInteger(pitch.finger) && pitch.finger >= 1 && pitch.finger <= 5)) return null;
  const match = /^([A-G])([#b]?)(-1|\d)$/.exec(pitch.spelling);
  if (!match) return null;
  const letter = LETTERS.indexOf(match[1] as typeof LETTERS[number]);
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  const octave = Number(match[3]);
  if ((octave + 1) * 12 + NATURAL_PCS[letter] + accidental !== pitch.midi) return null;
  const data = keyData(key);
  const degree = octave * 7 + letter - data.tonicLetterIndex[hand];
  return { degree, alter: accidental - data.scale[mod(degree, 7)].accidental };
}

/** The lengths of the written parts of a note: one part per bar it sounds in. */
function writtenParts(onset: number, duration: number, bar: number): readonly number[] {
  const parts: number[] = [];
  const end = onset + duration;
  for (let at = onset; at < end;) {
    const next = Math.min(end, (Math.floor(at / bar) + 1) * bar);
    parts.push(next - at);
    at = next;
  }
  return parts;
}

type Placed = {
  readonly event: SightReadingEvent;
  readonly pitched: boolean;
  /** The scale degrees of the notes, and the degree the hand's line passes through: top note right, bottom note left. */
  readonly degrees: readonly number[];
  readonly line: number | null;
  /** Degrees of raised sevenths of a minor key. Each must rise to the tonic in the next notes of the hand. */
  readonly leading: readonly number[];
};

function handsViolation(
  level: ReadingLevel, bars: number, bar: number, upbeatBar: boolean,
  byHand: Readonly<Record<SightReadingHand, readonly Placed[]>>,
): string | null {
  const sounding = (hand: SightReadingHand): readonly SightReadingEvent[] => byHand[hand].filter((item) => item.pitched).map((item) => item.event);
  const notes = { rh: sounding('rh'), lh: sounding('lh') };
  const inBar = (hand: SightReadingHand, index: number): readonly SightReadingEvent[] =>
    notes[hand].filter((event) => event.onsetTick < (index + 1) * bar && event.onsetTick + event.durationTick > index * bar);
  const barIndexes = Array.from({ length: bars }, (_, index) => index);
  const waiting = (index: number): number => HANDS.filter((hand) => inBar(hand, index).length === 0).length;
  if (level.hands === 'blocks') {
    const playing = barIndexes.map((index) => HANDS.filter((hand) => inBar(hand, index).length > 0));
    if (playing.some((hands) => hands.length !== 1)) return 'each bar belongs to exactly one hand';
    const half = Math.floor(bars / 2);
    const first = playing[0][0];
    return playing.every((hands, index) => (hands[0] === first) === (index < half)) ? null : 'the hands change once, at the middle';
  }
  if (level.hands === 'alternate') {
    const overlap = notes.rh.some((right) => notes.lh.some((left) =>
      right.onsetTick < left.onsetTick + left.durationTick && left.onsetTick < right.onsetTick + right.durationTick));
    if (overlap) return 'only one hand plays at a time';
    if (barIndexes.some((index) => waiting(index) === 2)) return 'a hand plays in every bar';
    const order = [...notes.rh, ...notes.lh].sort((a, b) => a.onsetTick - b.onsetTick).map((event) => event.hand);
    const changes = order.filter((hand, index) => index > 0 && hand !== order[index - 1]).length;
    return changes >= 2 ? null : 'the hands change at least twice';
  }
  // In an upbeat bar one hand may wait.
  if (barIndexes.some((index) => waiting(index) > (upbeatBar && index === 0 ? 1 : 0))) return 'both hands play in every bar';
  if (level.hands === 'oneMoves') {
    const holds = (hand: SightReadingHand, index: number): boolean => inBar(hand, index).every((event) => event.durationTick >= HALF);
    if (barIndexes.some((index) => !HANDS.some((hand) => holds(hand, index)))) return 'in every bar one hand only holds long notes';
  }
  return null;
}

/** Every way a piece breaks the limits of its level. An empty list means the piece is inside its level. */
export function srtLevelViolations(piece: LevelPiece): readonly LevelViolation[] {
  const level = piece ? LEVELS.find((candidate) => candidate.id === piece.level) : undefined;
  const key = piece?.key ? KEYS.find((candidate) => candidate.id === piece.key.id) : undefined;
  if (!piece || !level || !key || piece.schemaVersion !== 1 || piece.generatorVersion !== 2 ||
      piece.ticksPerQuarter !== TICKS_PER_QUARTER || !isInteger(piece.seed) || !isList(piece.events) ||
      key.tonic !== piece.key.tonic || key.mode !== piece.key.mode || key.keyN !== piece.key.keyN ||
      !piece.meter || ![2, 3, 4, 6].includes(piece.meter.num) || ![4, 8].includes(piece.meter.den) ||
      !isInteger(piece.bars) || piece.bars < 1 || piece.bars > MAX_BARS) {
    return [{ code: 'schema', detail: 'not a version 2 piece of a known level and key' }];
  }
  const out: LevelViolation[] = [];
  const add = (code: LevelViolationCode, detail: string, eventId?: string): void => {
    out.push(eventId === undefined ? { code, detail } : { code, detail, eventId });
  };
  if (!level.meters.some((meter) => meter.num === piece.meter.num && meter.den === piece.meter.den)) {
    add('meter', `${piece.meter.num}/${piece.meter.den} is not a meter of level ${level.id}`);
  }
  if (!level.bars.includes(piece.bars)) add('bars', `${piece.bars} bars is not a length of level ${level.id}`);
  const { bar, beat } = srtMeterTicks(piece.meter);
  const total = piece.bars * bar;
  const waitingHand = level.hands === 'blocks' || level.hands === 'alternate';
  // The first bar is an upbeat bar when the level has upbeats and the piece starts with a rest in both hands.
  const upbeatBar = level.upbeat && !piece.events.some((event) => event && isList(event.pitches) && event.pitches.length > 0 && event.onsetTick === 0);
  const ids = new Set<string>();
  const byHand: Record<SightReadingHand, Placed[]> = { rh: [], lh: [] };
  let chromatic = 0;

  for (const event of piece.events) {
    if (!event || typeof event.id !== 'string' || !event.id || ids.has(event.id) || (event.hand !== 'rh' && event.hand !== 'lh') ||
        !isList(event.pitches) || !isInteger(event.onsetTick) || !isInteger(event.durationTick)) {
      add('event', 'malformed event or repeated id', typeof event?.id === 'string' ? event.id : undefined);
      continue;
    }
    ids.add(event.id);
    const onset = event.onsetTick;
    const duration = event.durationTick;
    if (onset < 0 || duration <= 0 || onset + duration > total) {
      add('bounds', 'outside the piece', event.id);
      continue;
    }
    if (onset % level.gridTicks !== 0 || duration % level.gridTicks !== 0) add('grid', 'finer than the grid of the level', event.id);
    const parts = writtenParts(onset, duration, bar);
    const offset = onset % beat;
    if (event.pitches.length === 0) {
      const wholeBar = duration === bar && onset % bar === 0;
      const mayWait = waitingHand || (upbeatBar && onset === 0);
      // Compound time also has the one-beat rest (a dotted quarter).
      const known = level.restTicks.includes(duration) || (piece.meter.den === 8 && duration === beat);
      // A short rest stays inside its beat. A longer one starts on a multiple of its own length, so it never
      // straddles the middle of the bar, and in compound time it is never longer than a beat.
      const placed = duration < beat
        ? offset + duration <= beat
        : (onset % bar) % duration === 0 && (piece.meter.den === 4 || duration === beat);
      if (wholeBar ? !mayWait : parts.length > 1 || !known || !placed) {
        add('restValue', 'rest not allowed at this level or in this place', event.id);
      }
      byHand[event.hand].push({ event, pitched: false, degrees: [], line: null, leading: [] });
      continue;
    }
    if (parts.length > 1 && !level.tieOverBar) add('crossBar', 'note tied over the barline', event.id);
    if (parts.some((part) => !level.noteTicks.includes(part))) add('noteValue', 'note value not used at this level', event.id);
    if (!level.syncopation && srtIsSyncopated(piece.meter, onset, duration)) add('offbeat', 'note held across a stronger beat', event.id);
    const places = event.pitches.map((pitch) => srtPitchPlace(pitch, key, event.hand));
    if (places.includes(null)) add('pitch', 'midi, spelling and finger do not agree', event.id);
    const ascending = places.includes(null) ||
      event.pitches.every((pitch, index) => index === 0 || event.pitches[index - 1].midi < pitch.midi);
    if (event.pitches.length > level.chord[event.hand] || !ascending) add('chord', 'too many notes at once, or notes out of order', event.id);
    const degrees: number[] = [];
    const leading: number[] = [];
    for (const place of places) {
      if (!place) continue;
      degrees.push(place.degree);
      if (place.degree < level.degrees[0] || place.degree > level.degrees[1]) add('range', 'outside the range of the level', event.id);
      if (Math.abs(place.alter) > 1) add('accidental', 'two semitones away from its scale degree', event.id);
      else if (level.leadingTone && key.mode === 'minor' && place.alter === 1 && mod(place.degree, 7) === 6) leading.push(place.degree);
      else if (place.alter !== 0) chromatic += 1;
    }
    const line = degrees.length === 0 ? null : event.hand === 'rh' ? Math.max(...degrees) : Math.min(...degrees);
    byHand[event.hand].push({ event, pitched: true, degrees, line, leading });
  }

  for (const hand of HANDS) {
    byHand[hand].sort((a, b) => a.event.onsetTick - b.event.onsetTick);
    let cursor = 0;
    let previous: number | null = null;
    let gapless = true;
    let unresolved: readonly number[] = [];
    for (const item of byHand[hand]) {
      if (item.event.onsetTick !== cursor) gapless = false;
      cursor = item.event.onsetTick + item.event.durationTick;
      if (!item.pitched) continue;
      // A raised seventh that does not rise to the tonic is an ordinary chromatic note.
      chromatic += unresolved.filter((degree) => !item.degrees.includes(degree + 1)).length;
      unresolved = item.leading;
      if (item.line === null) continue;
      if (previous !== null && Math.abs(item.line - previous) > level.maxLeap) add('leap', 'leap larger than the level allows', item.event.id);
      previous = item.line;
    }
    chromatic += unresolved.length;
    if (!gapless || cursor !== total) add('tiling', `${hand} does not fill the piece without gaps or overlaps`);
  }
  if (chromatic > level.maxChromatic) add('accidental', `${chromatic} notes outside the key, level ${level.id} allows ${level.maxChromatic}`);
  const hands = handsViolation(level, piece.bars, bar, upbeatBar, byHand);
  if (hands) add('hands', hands);
  return out;
}

export function srtValidateLevelPiece(piece: LevelPiece): boolean {
  return srtLevelViolations(piece).length === 0;
}

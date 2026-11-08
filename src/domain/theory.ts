export type PitchClass = number;

export const PITCH_CLASS_COUNT = 12;

export const SCALE_DEGREE_LABELS: Readonly<Record<number, string>> = {
  0: '1',
  1: '♭2',
  2: '2',
  3: '♭3',
  4: '3',
  5: '4',
  6: '♯4',
  7: '5',
  8: '♭6',
  9: '6',
  10: '♭7',
  11: '7',
};

export const CHORD_DEGREE_LABELS: Readonly<Record<number, string>> = {
  0: '1',
  2: '2',
  3: '♭3',
  4: '3',
  5: '4',
  6: '♭5',
  7: '5',
  8: '♯5',
  9: '6',
  10: '♭7',
  11: '7',
  13: '♭9',
  14: '9',
  15: '♯9',
  17: '11',
  18: '♯11',
  21: '13',
};

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function pitchClass(midi: number): PitchClass {
  return normalizeSemitones(midi);
}

export function normalizeSemitones(value: number): PitchClass {
  return ((value % PITCH_CLASS_COUNT) + PITCH_CLASS_COUNT) % PITCH_CLASS_COUNT;
}

export function transposePitchClass(root: PitchClass, semitones: number): PitchClass {
  return normalizeSemitones(root + semitones);
}

export function intervalOctave(semitones: number): { octave: number; class: PitchClass } {
  const octave = Math.floor(semitones / PITCH_CLASS_COUNT);
  return { octave, class: normalizeSemitones(semitones) };
}

export function scalePitches(root: PitchClass, offsets: readonly number[]): PitchClass[] {
  return offsets.map(offset => transposePitchClass(root, offset));
}

export function chordPitches(root: PitchClass, intervals: readonly number[]): PitchClass[] {
  return [...new Set(intervals.map(interval => transposePitchClass(root, interval)))].sort((a, b) => a - b);
}

export function samePitchSet(left: readonly number[], right: readonly number[]): boolean {
  const a = [...new Set(left.map(normalizeSemitones))].sort((x, y) => x - y);
  const b = [...new Set(right.map(normalizeSemitones))].sort((x, y) => x - y);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export interface ChordDefinition {
  idx: number;
  symbol: string;
  pcset: readonly number[];
}

export type ChordIdentification<T extends ChordDefinition = ChordDefinition> = {
  rootPc: PitchClass;
  chord: T;
  inversion: number;
  bassPc: PitchClass;
};

export function chordTargetPitches(root: PitchClass, intervals: readonly number[]): PitchClass[] {
  return chordPitches(root, intervals);
}

export function formatChordFormula(intervals: readonly number[]): string {
  return intervals.map(interval => {
    const classValue = normalizeSemitones(interval);
    return CHORD_DEGREE_LABELS[interval] ?? CHORD_DEGREE_LABELS[classValue] ?? '?';
  }).join(' ');
}

export function formatScaleFormula(offsets: readonly number[]): string {
  return offsets.map(offset => SCALE_DEGREE_LABELS[normalizeSemitones(offset)] ?? '?').join(' ');
}

export function chordInversion(root: PitchClass, chord: ChordDefinition, bassMidi: number): number {
  const bass = normalizeSemitones(bassMidi - root);
  const inversion = chord.pcset.indexOf(bass);
  return inversion < 0 ? 0 : inversion;
}

export function identifyChord<T extends ChordDefinition>(
  notes: readonly number[],
  chords: readonly T[],
  expectedRoot?: PitchClass,
): ChordIdentification<T> | null {
  const pcs = [...new Set(notes.map(normalizeSemitones))].sort((a, b) => a - b);
  if (pcs.length < 3) return null;
  const bassPc = normalizeSemitones(Math.min(...notes));
  const candidates: ChordIdentification<T>[] = [];
  for (const chord of chords) {
    if (chord.pcset.length !== pcs.length) continue;
    for (let root = 0; root < PITCH_CLASS_COUNT; root++) {
      const relative = pcs.map(pitch => pitch - root);
      if (!samePitchSet(relative, chord.pcset)) continue;
      const inversion = chordInversion(root, chord, bassPc);
      candidates.push({ rootPc: root, chord, inversion, bassPc });
    }
  }
  candidates.sort((left, right) => {
    if (expectedRoot !== undefined && left.rootPc !== right.rootPc)
      return (left.rootPc === expectedRoot ? 0 : 1) - (right.rootPc === expectedRoot ? 0 : 1);
    if ((left.inversion === 0) !== (right.inversion === 0))
      return left.inversion === 0 ? -1 : 1;
    if (left.inversion !== right.inversion) return left.inversion - right.inversion;
    return left.chord.idx - right.chord.idx;
  });
  return candidates[0] ?? null;
}

export const KEY_MAJOR_FIFTHS: Readonly<Record<number, number>> = {
  0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: -5, 8: -4, 3: -3, 10: -2, 5: -1,
};

const LETTER_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11] as const;
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6] as const;
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3] as const;

export interface KeySignature {
  root: PitchClass;
  minor: boolean;
  fifths: number;
}

export function keyFifths(root: PitchClass, minor: boolean): number {
  return minor && root === 3
    ? -6
    : KEY_MAJOR_FIFTHS[minor ? normalizeSemitones(root + 3) : root];
}

export function keyFromFifths(fifths: number, minor: boolean): KeySignature {
  const majorRoot = normalizeSemitones(fifths * 7);
  return { root: minor ? normalizeSemitones(majorRoot + 9) : majorRoot, minor: !!minor, fifths };
}

export function keyAccidentals(fifths: number): number[] {
  const result = Array(7).fill(0) as number[];
  const order = fifths > 0 ? SHARP_ORDER : FLAT_ORDER;
  for (let index = 0; index < Math.abs(fifths); index += 1) result[order[index]] = fifths > 0 ? 1 : -1;
  return result;
}

export interface SpelledMidi {
  li: number;
  acc: number;
  oct: number;
}

export function spellMidi(midi: number, fifths = 0, minor = false): SpelledMidi {
  const pitch = pitchClass(midi);
  const signature = keyAccidentals(fifths);
  const make = (li: number, acc: number): SpelledMidi => ({
    li,
    acc,
    oct: Math.floor((midi - acc - LETTER_PITCH_CLASSES[li]) / 12) - 1,
  });
  for (let li = 0; li < 7; li += 1) {
    if (normalizeSemitones(LETTER_PITCH_CLASSES[li] + signature[li]) === pitch) return make(li, signature[li]);
  }
  const tonicLetter = (normalizeSemitones(fifths * 4 + (minor ? 5 : 0)) % 7);
  const relative = normalizeSemitones(pitch - keyFromFifths(fifths, minor).root);
  const degree = (minor
    ? { 11: 6, 9: 5, 1: 1, 4: 2, 6: 3 } as Record<number, number>
    : { 1: 0, 3: 2, 6: 3, 8: 4, 10: 6 } as Record<number, number>)[relative];
  if (degree != null) {
    const li = (tonicLetter + degree) % 7;
    const acc = ((pitch - LETTER_PITCH_CLASSES[li] + 18) % 12) - 6;
    if (Math.abs(acc) <= 1) return make(li, acc);
  }
  for (let li = 0; li < 7; li += 1) {
    if (LETTER_PITCH_CLASSES[li] === pitch) return make(li, 0);
  }
  if (fifths < 0 || (fifths === 0 && (pitch === 3 || pitch === 10))) {
    return make((LETTER_PITCH_CLASSES as readonly number[]).indexOf(normalizeSemitones(pitch + 1)), -1);
  }
  return make((LETTER_PITCH_CLASSES as readonly number[]).indexOf(normalizeSemitones(pitch + 11)), 1);
}

export interface TheoryNote {
  midi: number;
  start: number;
  end: number;
}

export function anPcWeights(notes: readonly TheoryNote[], from = -Infinity, to = Infinity): number[] {
  const weights = Array(12).fill(0) as number[];
  for (const note of notes) {
    const duration = Math.min(note.end, to) - Math.max(note.start, from);
    if (duration > 0) weights[pitchClass(note.midi)] += Math.min(4, duration);
  }
  return weights;
}

const KEY_PROFILES = {
  maj: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  min: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
} as const;

function correlation(left: readonly number[], right: readonly number[]): number {
  const leftMean = left.reduce((sum, value) => sum + value, 0) / 12;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / 12;
  let numerator = 0, leftVariance = 0, rightVariance = 0;
  for (let index = 0; index < 12; index += 1) {
    numerator += (left[index] - leftMean) * (right[index] - rightMean);
    leftVariance += (left[index] - leftMean) ** 2;
    rightVariance += (right[index] - rightMean) ** 2;
  }
  return leftVariance && rightVariance ? numerator / Math.sqrt(leftVariance * rightVariance) : 0;
}

export interface KeyRank extends KeySignature {
  score: number;
}

export function anKeyRank(notes: readonly TheoryNote[]): KeyRank[] {
  const weights = anPcWeights(notes);
  const result: KeyRank[] = [];
  for (let root = 0; root < 12; root += 1) {
    for (const minor of [false, true]) {
      const rotated = weights.map((_, index) => weights[(index + root) % 12]);
      result.push({
        root,
        minor,
        fifths: keyFifths(root, minor),
        score: correlation(rotated, minor ? KEY_PROFILES.min : KEY_PROFILES.maj),
      });
    }
  }
  return result.sort((left, right) => right.score - left.score);
}

export interface DiatonicChord {
  root: PitchClass;
  p: number[];
  pref?: number;
}

export function anDiatonic<T extends { p: readonly number[] }>(
  key: KeySignature,
  chordDefinitions: readonly T[] = [],
): Array<DiatonicChord & { c?: T }> {
  const scale = key.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const result: DiatonicChord[] = [];
  for (let index = 0; index < 7; index += 1) {
    const root = scale[index];
    result.push({
      root: normalizeSemitones(key.root + root),
      p: [0, normalizeSemitones(scale[(index + 2) % 7] - root), normalizeSemitones(scale[(index + 4) % 7] - root)],
    });
  }
  if (key.minor) {
    result.push({ root: normalizeSemitones(key.root + 7), p: [0, 4, 7], pref: 0.012 });
    result.push({ root: normalizeSemitones(key.root + 11), p: [0, 3, 6] });
  }
  result.push({ root: normalizeSemitones(key.root + 7), p: [0, 4, 7, 10] });
  return result
    .map(chord => ({ ...chord, c: chordDefinitions.find(candidate => candidate.p.join() === chord.p.join()) }))
    .filter(chord => chordDefinitions.length === 0 || chord.c);
}

const INTERVAL_NAMES: Readonly<Record<number, string>> = {
  1: 'Minor 2nd', 2: 'Major 2nd', 3: 'Minor 3rd', 4: 'Major 3rd', 5: 'Perfect 4th', 6: 'Tritone',
  7: 'Perfect 5th', 8: 'Minor 6th', 9: 'Major 6th', 10: 'Minor 7th', 11: 'Major 7th', 12: 'Octave',
};

export function anIntervalName(semitones: number): string {
  const direct = INTERVAL_NAMES[semitones];
  if (direct) return direct;
  const reduced = INTERVAL_NAMES[normalizeSemitones(semitones) || 12] ?? '?';
  return `${reduced} (+${Math.floor((semitones - 1) / 12)} oct)`;
}

export interface AnalysisChord {
  rootPc: PitchClass;
  chord: { symbol: string; pcset: readonly number[] };
}

export function chordDegreeMap(midis: readonly number[], rootPc: PitchClass, pcs: readonly number[]): Map<number, string> {
  const has = (value: number): boolean => pcs.includes(value);
  const third = has(3) || has(4);
  const label = (relative: number): string => {
    switch (relative) {
      case 0: return 'R';
      case 3:
      case 4: return third && has(3) && has(4) && relative === 3 ? '♯9' : '3';
      case 7: return '5';
      case 6: return has(7) ? '♯11' : '5';
      case 8: return has(7) ? '♭13' : '5';
      case 10:
      case 11: return '7';
      case 9: return has(3) && has(6) && !has(10) && !has(11) ? '7' : (has(10) || has(11)) ? '13' : '6';
      case 1: return '♭9';
      case 2: return third ? '9' : '2';
      case 5: return third ? '11' : '4';
      default: return '';
    }
  };
  const map = new Map<number, string>();
  for (const midi of midis) {
    const relative = normalizeSemitones(pitchClass(midi) - rootPc);
    if (pcs.includes(relative)) {
      const tone = label(relative);
      if (tone) map.set(midi, tone);
    }
  }
  return map;
}

export function romanFor(
  keyRoot: PitchClass,
  id: AnalysisChord | null | undefined,
  majorScale: readonly number[] = [0, 2, 4, 5, 7, 9, 11],
  romanNumerals: readonly string[] = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'],
): string {
  if (!id || keyRoot < 0) return '';
  const relative = normalizeSemitones(id.rootPc - keyRoot);
  let degree = majorScale.indexOf(relative);
  let accidental = '';
  if (degree < 0) {
    degree = majorScale.indexOf(normalizeSemitones(relative + 11));
    if (degree >= 0) accidental = '♯';
    else {
      degree = majorScale.indexOf(normalizeSemitones(relative + 1));
      if (degree >= 0) accidental = '♭';
    }
  }
  if (degree < 0) return '';
  let numeral = romanNumerals[degree];
  const symbol = id.chord.symbol;
  if (/^m(?!aj)/.test(symbol) || symbol.startsWith('dim')) numeral = numeral.toLowerCase();
  let suffix = '';
  if (/dim/.test(symbol) || symbol === 'm7♭5') suffix = '°';
  else if (/aug|♯5/.test(symbol)) suffix = '+';
  if (id.chord.pcset.includes(10) || id.chord.pcset.includes(11)) suffix += '⁷';
  return accidental + numeral + suffix;
}

export interface ParsedKeyEvent {
  type: string;
  beat: number;
  fifths: number;
  minor?: boolean;
}

export function anResolveKey(
  parsed: { meta?: readonly ParsedKeyEvent[] },
  selection: string | null | undefined,
  notes: readonly TheoryNote[],
): { events: Array<{ beat: number; fifths: number; minor: boolean }>; origin: 'manual' | 'file' | 'auto' } {
  if (selection && selection !== 'auto') {
    const [fifths, minor] = selection.split(':').map(Number);
    return { events: [{ beat: 0, fifths, minor: !!minor }], origin: 'manual' };
  }
  const events = (parsed.meta ?? []).filter(event => event.type === 'key');
  if (events.length) {
    return { events: events.map(event => ({ beat: event.beat, fifths: event.fifths, minor: !!event.minor })), origin: 'file' };
  }
  const best = anKeyRank(notes)[0];
  return { events: [{ beat: 0, fifths: best.fifths, minor: best.minor }], origin: 'auto' };
}

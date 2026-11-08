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

export type PitchClass = number;

export const PITCH_CLASS_COUNT = 12;

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

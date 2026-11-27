/*
 * "Accept any octave" (the shared setting): with it on, a played key counts for the same note name in any octave.
 * Every judge (sight-reading evaluation and instant feedback, warm-up flash cards, reading drills, Read & play and Score
 * practice) compares pitches through these two functions, so the rule has one definition.
 */

/** The value two pitches are compared by: the MIDI number, or its pitch class (0–11, negatives folded) with any octave. */
export function pitchKey(midi: number, anyOctave: boolean): number {
  return anyOctave ? ((midi % 12) + 12) % 12 : midi;
}

/** True when `played` stands for `wanted`: the same key, or with any octave the same note name. */
export function samePitch(wanted: number, played: number, anyOctave: boolean): boolean {
  return pitchKey(wanted, anyOctave) === pitchKey(played, anyOctave);
}

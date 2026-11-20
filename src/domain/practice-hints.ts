import {
  CHORD_TEMPLATES, PROGRESSION_TEMPLATES, SCALE_DEFINITIONS, SCALE_DEGREE_LABELS, TWELVE_BAR_BLUES_ROOTS,
  formatChordFormula, practiceTonicMidi, transposePitchClass,
} from './theory.js';
import { ARPEGGIO_TONICS, techniqueKeyAllowed, techniqueSteps, type TechniqueHand, type TechniqueKind } from './technique.js';

export interface PracticeHintNote {
  readonly midi: number;
  readonly finger?: number;
}

export interface PracticeHintStep {
  readonly notes: readonly PracticeHintNote[];
  readonly seconds: number;
  readonly gap?: number;
}

export interface ChordHint {
  readonly symbol: string;
  readonly compare?: string;
  readonly cue: string;
}

export interface ScaleHint {
  readonly name: string;
  readonly cue: string;
  readonly degrees?: string;
  readonly compare?: { readonly name: string; readonly degrees: readonly number[] };
}

export interface ProgressionHint {
  readonly name: string;
  readonly cue: string;
  /** Octave-aware roots measured from the selected tonic. */
  readonly bass: readonly number[];
  readonly minor?: boolean;
  readonly referenceTonic?: boolean;
  readonly resolution?: readonly (readonly number[])[];
}

export interface TechniqueHint {
  readonly id: string;
  readonly kind: TechniqueKind;
  readonly tonics: readonly number[];
  readonly defaultTonic: number;
}

export const CHORD_HINTS: readonly ChordHint[] = [
  { symbol: 'maj', compare: 'm', cue: 'major' },
  { symbol: 'm', compare: 'maj', cue: 'minor' },
  { symbol: 'dim', compare: 'm', cue: 'diminished' },
  { symbol: 'aug', compare: 'maj', cue: 'augmented' },
  { symbol: 'sus2', compare: 'sus4', cue: 'sus2' },
  { symbol: 'sus4', compare: 'maj', cue: 'sus4' },
  { symbol: '6', compare: 'maj', cue: 'sixth' },
  { symbol: 'm6', compare: 'm7', cue: 'minor_sixth' },
  { symbol: 'maj7', compare: '7', cue: 'major_seventh' },
  { symbol: '7', compare: 'maj7', cue: 'dominant' },
  { symbol: 'm7', compare: '7', cue: 'minor_seventh' },
  { symbol: 'mMaj7', compare: 'm7', cue: 'minor_major' },
  { symbol: 'm7♭5', compare: 'm7', cue: 'half_diminished' },
  { symbol: 'dim7', compare: 'm7♭5', cue: 'diminished_seventh' },
  { symbol: '7♯5', compare: '7', cue: 'raised_fifth' },
  { symbol: '7♭5', compare: '7', cue: 'flat_fifth' },
  { symbol: 'add9', compare: 'maj', cue: 'add9' },
  { symbol: 'maj9', compare: 'maj7', cue: 'major_ninth' },
  { symbol: '9', compare: '7', cue: 'dominant_ninth' },
  { symbol: 'm9', compare: 'm7', cue: 'minor_ninth' },
  { symbol: '7♭9', compare: '9', cue: 'flat_ninth' },
  { symbol: '7♯9', compare: '9', cue: 'raised_ninth' },
  { symbol: 'maj7♯11', compare: 'maj7', cue: 'raised_eleventh' },
  { symbol: '11', compare: '9', cue: 'eleventh' },
  { symbol: '13', compare: '9', cue: 'thirteenth' },
];

export const SCALE_HINTS: readonly ScaleHint[] = [
  { name: 'Major (Ionian)', cue: 'major', compare: { name: 'Mixolydian', degrees: [5, 6, 7] } },
  { name: 'Dorian', cue: 'dorian', compare: { name: 'Aeolian (Natural minor)', degrees: [4, 5, 6] } },
  { name: 'Phrygian', cue: 'phrygian', compare: { name: 'Aeolian (Natural minor)', degrees: [0, 1, 2] } },
  { name: 'Lydian', cue: 'lydian', compare: { name: 'Major (Ionian)', degrees: [2, 3, 4] } },
  { name: 'Mixolydian', cue: 'mixolydian', compare: { name: 'Major (Ionian)', degrees: [5, 6, 7] } },
  { name: 'Aeolian (Natural minor)', cue: 'aeolian', compare: { name: 'Dorian', degrees: [4, 5, 6] } },
  { name: 'Locrian', cue: 'locrian', degrees: '1 ♭2 ♭3 4 ♭5 ♭6 ♭7', compare: { name: 'Phrygian', degrees: [3, 4, 5] } },
  { name: 'Harmonic minor', cue: 'harmonic_minor', compare: { name: 'Aeolian (Natural minor)', degrees: [5, 6, 7] } },
  { name: 'Melodic minor', cue: 'melodic_minor', compare: { name: 'Harmonic minor', degrees: [4, 5, 6, 7] } },
  { name: 'Harmonic major', cue: 'harmonic_major', compare: { name: 'Major (Ionian)', degrees: [4, 5, 6] } },
  { name: 'Major pentatonic', cue: 'major_pentatonic' },
  { name: 'Minor pentatonic', cue: 'minor_pentatonic' },
  { name: 'Blues', cue: 'blues', degrees: '1 ♭3 4 ♭5 5 ♭7' },
  { name: 'Whole tone', cue: 'whole_tone', degrees: '2–2–2–2–2–2' },
  { name: 'Diminished (W-H)', cue: 'diminished_wh', degrees: '2–1–2–1–2–1–2–1' },
  { name: 'Diminished (H-W)', cue: 'diminished_hw', degrees: '1–2–1–2–1–2–1–2' },
  { name: 'Phrygian dominant', cue: 'phrygian_dominant', compare: { name: 'Phrygian', degrees: [0, 1, 2, 3] } },
  { name: 'Hungarian minor', cue: 'hungarian', compare: { name: 'Harmonic minor', degrees: [2, 3, 4] } },
  { name: 'Chromatic', cue: 'chromatic', degrees: '1 × 12' },
];

export const PROGRESSION_HINTS: readonly ProgressionHint[] = [
  { name: 'I–IV–V', cue: 'three', bass: [0, 5, 7] },
  { name: 'I–V–vi–IV (pop)', cue: 'pop', bass: [0, -5, -3, -7], referenceTonic: true },
  { name: 'ii–V–I (jazz)', cue: 'jazz', bass: [2, -5, -12], resolution: [[59, 65], [60, 64]] },
  { name: 'I–vi–IV–V (50s)', cue: 'fifties', bass: [0, -3, -7, -5] },
  { name: 'vi–IV–I–V', cue: 'minor_start', bass: [-3, -7, 0, -5], referenceTonic: true },
  { name: 'I–♭VII–IV (rock)', cue: 'rock', bass: [0, -2, -7] },
  { name: 'minor ii–V–i', cue: 'minor_jazz', bass: [2, -5, -12], minor: true, resolution: [[59, 65], [60, 63]] },
  { name: 'i–♭VI–♭VII (epic)', cue: 'epic', bass: [0, -4, -2], minor: true },
  { name: '12-bar blues', cue: 'blues', bass: TWELVE_BAR_BLUES_ROOTS },
  { name: 'Pachelbel’s Canon', cue: 'canon', bass: [0, -5, -3, -8, -7, -12, -7, -5] },
];

const allTonics = Array.from({ length: 12 }, (_, i) => i);
export const TECHNIQUE_HINTS: readonly TechniqueHint[] = [
  { id: 'major_common', kind: 'major', tonics: [0, 2, 4, 7, 9], defaultTonic: 0 },
  { id: 'major_f_b', kind: 'major', tonics: [5, 11], defaultTonic: 5 },
  { id: 'major_black', kind: 'major', tonics: [1, 3, 6, 8, 10], defaultTonic: 1 },
  { id: 'harmonic', kind: 'minor', tonics: allTonics, defaultTonic: 9 },
  { id: 'arp_major', kind: 'arpMajor', tonics: ARPEGGIO_TONICS.arpMajor, defaultTonic: 0 },
  { id: 'arp_minor', kind: 'arpMinor', tonics: ARPEGGIO_TONICS.arpMinor, defaultTonic: 9 },
];

function chordTemplate(symbol: string) {
  const chord = CHORD_TEMPLATES.find(template => template.symbol === symbol);
  if (!chord) throw new Error(`Unknown practice hint chord ${symbol}`);
  return chord;
}

function block(midis: readonly number[], seconds: number, gap = 0.07): PracticeHintStep {
  return { notes: midis.map(midi => ({ midi })), seconds, gap };
}

export function chordHintFormula(symbol: string): string {
  const formula = formatChordFormula(chordTemplate(symbol).intervals);
  return symbol === 'dim7' ? formula.replace(/6$/, '𝄫7') : formula;
}

export function chordHintSteps(hint: ChordHint, tonic: number): PracticeHintStep[] {
  const root = practiceTonicMidi(tonic, 'near-middle-c');
  const symbols = hint.compare ? [hint.symbol, hint.compare] : [hint.symbol];
  return symbols.flatMap(symbol => {
    const midis = chordTemplate(symbol).intervals.map(interval => root + interval);
    return [...midis.map(midi => block([midi], 0.16, 0.04)), block(midis, 0.65, 0.22)];
  });
}

export function scaleHintFormula(hint: ScaleHint): string {
  return hint.degrees ?? SCALE_DEFINITIONS[hint.name].map(offset => SCALE_DEGREE_LABELS[offset]).join(' ');
}

export function scaleHintSteps(hint: ScaleHint, tonic: number): PracticeHintStep[] {
  const root = practiceTonicMidi(tonic, 'near-middle-c');
  const target = SCALE_DEFINITIONS[hint.name].concat(12);
  const play = (offsets: readonly number[], seconds: number) => offsets.map((offset, i) =>
    block([root + offset], seconds, i + 1 === offsets.length ? 0.22 : 0.035));
  if (!hint.compare) return play(target, 0.2);

  const other = SCALE_DEFINITIONS[hint.compare.name].concat(12);
  const excerpt = hint.compare.degrees;
  return [block([root], 0.36), ...play(excerpt.map(i => target[i]), 0.25),
    ...play(excerpt.map(i => other[i]), 0.25), ...play(target, 0.19), ...play(other, 0.19)];
}

export function progressionHintChords(hint: ProgressionHint, tonic: number) {
  const chords = PROGRESSION_TEMPLATES.find(template => template.name === hint.name)?.chords;
  if (!chords) throw new Error(`Unknown practice hint progression ${hint.name}`);
  const pattern = hint.name === '12-bar blues'
    ? TWELVE_BAR_BLUES_ROOTS.map(offset => [offset, '7', offset === 0 ? 'I⁷' : offset === 5 ? 'IV⁷' : 'V⁷'] as const)
    : chords;
  return pattern.map(([offset, symbol, roman]) => ({ root: transposePitchClass(tonic, offset), symbol, roman }));
}

export function progressionHintSteps(hint: ProgressionHint, tonic: number): PracticeHintStep[] {
  const chords = progressionHintChords(hint, tonic);
  const blues = hint.name === '12-bar blues';
  const tonicBass = 48 + tonic;
  const bass = hint.bass.map(offset => tonicBass + offset);
  const blocks = chords.flatMap(({ root, symbol }, i) => {
    const chord = chordTemplate(symbol);
    const upperRoot = 60 + root - (root > 7 ? 12 : 0);
    const notes = [bass[i], ...chord.intervals.map(interval => upperRoot + interval)];
    if (blues) return [block(notes, 0.47, 0.03), block([bass[i]], 0.47, 0.03), block(notes, 0.47, 0.03), block([bass[i]], 0.47, 0.03)];
    return [block(notes, 0.57)];
  });
  const resolution = hint.resolution?.map(notes => block(notes.map(midi => midi + tonic), 0.56)) ?? [];
  const reference = hint.referenceTonic ? [block([0, 4, 7].map(offset => 60 + tonic + offset), 0.48, 0.22)] : [];
  return blues ? blocks : [...reference, ...bass.map(midi => block([midi], 0.32)), ...blocks, ...resolution];
}

export function techniqueHintTonic(hint: TechniqueHint, tonic: number | null): number {
  return tonic !== null && hint.tonics.includes(tonic) && techniqueKeyAllowed(hint.kind, tonic) ? tonic : hint.defaultTonic;
}

export function techniqueHintSteps(hint: TechniqueHint, tonic: number, hand: TechniqueHand) {
  const steps = techniqueSteps({ kind: hint.kind, tonicPc: tonic, octaves: 1, hands: hand });
  const arpeggio = hint.kind === 'arpMinor' || hint.kind === 'arpMajor';
  const ascending = steps.slice(0, arpeggio ? 4 : 8).flatMap(step => step.notes);
  // For the left hand the last thumb may end the scale. Highlight a crossing inside the run instead.
  const crossing = ascending.findIndex((note, i) => i > 0 &&
    (hand === 'rh' ? i < ascending.length - 1 && note.finger === 1 : ascending[i - 1].finger === 1));
  const focusAt = hint.kind === 'minor' ? 5 : arpeggio ? 0 : Math.max(0, crossing - 1);
  const fragment = ascending.slice(focusAt, focusAt + 2);
  const preview = (notes: readonly PracticeHintNote[], seconds: number, lastGap: number) =>
    notes.map((note, i): PracticeHintStep => ({ notes: [note], seconds, gap: i === notes.length - 1 ? lastGap : 0.04 }));
  return { ascending, fragment, steps: [...preview(fragment, 0.33, 0.2), ...preview(fragment, 0.33, 0.23), ...preview(steps.flatMap(step => step.notes), 0.21, 0)] };
}

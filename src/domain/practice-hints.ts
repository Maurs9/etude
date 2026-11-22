import {
  CHORD_TEMPLATES, PROGRESSION_TEMPLATES, SCALE_DEFINITIONS, TWELVE_BAR_BLUES_ROOTS,
  formatChordFormula, formatScaleFormula, keyFifths, pitchClass, practiceTonicMidi, spellDiatonicDegree, spellMidi, transposePitchClass, type SpelledMidi,
} from './theory.js';
import { ARPEGGIO_TONICS, SCALE_FINGERINGS, techniqueKeyAllowed, techniqueSteps, type TechniqueHand, type TechniqueKind } from './technique.js';

export interface PracticeHintNote {
  readonly midi: number;
  readonly finger?: number;
}

export interface PracticeHintStep {
  readonly notes: readonly PracticeHintNote[];
  readonly seconds: number;
  readonly gap?: number;
  readonly diagramKey?: string;
}

export interface PracticeHintDiagram {
  readonly followWithoutDock?: boolean;
  readonly paint: (key?: string, sounding?: readonly PracticeHintNote[]) => void;
}

export interface ChordHintTone extends SpelledMidi {
  readonly midi: number;
  readonly degree: number;
  readonly label: string;
}

export interface ChordHint {
  readonly symbol: string;
}

export interface ScaleHint {
  readonly name: string;
  readonly cue: string;
  readonly formula?: string;
}

export interface ProgressionHint {
  readonly name: string;
  readonly cue: string;
  /** Octave-aware roots measured from the selected tonic. */
  readonly bass: readonly number[];
  readonly minor?: boolean;
  readonly referenceTonic?: boolean;
  readonly resolution?: readonly [readonly [number, number], readonly [number, number]];
}

export interface TechniqueHint {
  readonly id: string;
  readonly kind: TechniqueKind;
  readonly tonics: readonly number[];
  readonly defaultTonic: number;
  readonly namedTonics?: readonly number[];
}

export const CHORD_HINTS: readonly ChordHint[] = [
  { symbol: 'maj' },
  { symbol: 'm' },
  { symbol: 'dim' },
  { symbol: 'aug' },
  { symbol: 'sus2' },
  { symbol: 'sus4' },
  { symbol: '6' },
  { symbol: 'm6' },
  { symbol: 'maj7' },
  { symbol: '7' },
  { symbol: 'm7' },
  { symbol: 'mMaj7' },
  { symbol: 'm7♭5' },
  { symbol: 'dim7' },
  { symbol: '7♯5' },
  { symbol: '7♭5' },
  { symbol: 'add9' },
  { symbol: 'maj9' },
  { symbol: '9' },
  { symbol: 'm9' },
  { symbol: '7♭9' },
  { symbol: '7♯9' },
  { symbol: 'maj7♯11' },
  { symbol: '11' },
  { symbol: '13' },
];

export const SCALE_HINTS: readonly ScaleHint[] = [
  { name: 'Major (Ionian)', cue: 'major' },
  { name: 'Dorian', cue: 'dorian' },
  { name: 'Phrygian', cue: 'phrygian' },
  { name: 'Lydian', cue: 'lydian' },
  { name: 'Mixolydian', cue: 'mixolydian' },
  { name: 'Aeolian (Natural minor)', cue: 'aeolian' },
  { name: 'Locrian', cue: 'locrian', formula: '1 ♭2 ♭3 4 ♭5 ♭6 ♭7' },
  { name: 'Harmonic minor', cue: 'harmonic_minor' },
  { name: 'Melodic minor', cue: 'melodic_minor' },
  { name: 'Harmonic major', cue: 'harmonic_major' },
  { name: 'Phrygian dominant', cue: 'phrygian_dominant' },
  { name: 'Hungarian minor', cue: 'hungarian' },
  { name: 'Major pentatonic', cue: 'major_pentatonic' },
  { name: 'Minor pentatonic', cue: 'minor_pentatonic' },
  { name: 'Blues', cue: 'blues', formula: '1 ♭3 4 ♭5 5 ♭7' },
  { name: 'Whole tone', cue: 'whole_tone', formula: '2–2–2–2–2–2' },
  { name: 'Diminished (W-H)', cue: 'diminished_wh', formula: '2–1–2–1–2–1–2–1' },
  { name: 'Diminished (H-W)', cue: 'diminished_hw', formula: '1–2–1–2–1–2–1–2' },
  { name: 'Chromatic', cue: 'chromatic', formula: '1 × 12' },
];

export const PROGRESSION_HINTS: readonly ProgressionHint[] = [
  { name: 'I–IV–V', cue: 'three', bass: [0, 5, 7] },
  { name: 'ii–V–I (jazz)', cue: 'jazz', bass: [2, -5, -12], resolution: [[59, 65], [60, 64]] },
  { name: 'minor ii–V–i', cue: 'minor_jazz', bass: [2, -5, -12], minor: true, resolution: [[59, 65], [60, 63]] },
  { name: 'I–V–vi–IV (pop)', cue: 'pop', bass: [0, -5, -3, -7], referenceTonic: true },
  { name: 'I–vi–IV–V (50s)', cue: 'fifties', bass: [0, -3, -7, -5] },
  { name: 'vi–IV–I–V', cue: 'minor_start', bass: [-3, -7, 0, -5], referenceTonic: true },
  { name: 'I–♭VII–IV (rock)', cue: 'rock', bass: [0, -2, -7] },
  { name: 'i–♭VI–♭VII (epic)', cue: 'epic', bass: [0, -4, -2], minor: true },
  { name: '12-bar blues', cue: 'blues', bass: TWELVE_BAR_BLUES_ROOTS },
  { name: 'Pachelbel’s Canon', cue: 'canon', bass: [0, -5, -3, -8, -7, -12, -7, -5] },
];

export const MELODY_HINTS = [
  { id: 'rising', phrase: [[0, 1], [2, 1], [4, 1], [7, 1]] },
  { id: 'falling', phrase: [[7, 0.5], [5, 0.5], [4, 1], [2, 1], [0, 1]] },
  { id: 'repeated', phrase: [[0, 0.5], [0, 0.5], [4, 1], [2, 1], [0, 1]] },
] as const;

export function melodyHintExample(hint: (typeof MELODY_HINTS)[number], tonic: number) {
  const root = practiceTonicMidi(tonic, 'near-middle-c'), fifths = keyFifths(tonic, false);
  const notes = hint.phrase.map(([offset, beats]) => {
    const midi = root + offset;
    return { ...spellMidi(midi, fifths), midi, beats };
  });
  const steps = notes.map(({ midi, beats }, index): PracticeHintStep =>
    ({ ...block([midi], 0.39 * beats, 0.04 * beats), diagramKey: String(index) }));
  return { notes, steps, fifths };
}

const allTonics = Array.from({ length: 12 }, (_, i) => i);
export const TECHNIQUE_HINTS: readonly TechniqueHint[] = [
  { id: 'major_common', kind: 'major', tonics: [0, 2, 4, 7, 9], defaultTonic: 0 },
  { id: 'major_f_b', kind: 'major', tonics: [5, 11], defaultTonic: 5, namedTonics: [5, 11] },
  { id: 'major_black', kind: 'major', tonics: [1, 3, 6, 8, 10], defaultTonic: 1 },
  { id: 'harmonic', kind: 'minor', tonics: allTonics, defaultTonic: 9 },
  { id: 'arp_major', kind: 'arpMajor', tonics: ARPEGGIO_TONICS.arpMajor, defaultTonic: 0, namedTonics: [0, 2] },
  { id: 'arp_minor', kind: 'arpMinor', tonics: ARPEGGIO_TONICS.arpMinor, defaultTonic: 9, namedTonics: [9, 0] },
];

function chordTemplate(symbol: string) {
  const chord = CHORD_TEMPLATES.find(template => template.symbol === symbol);
  if (!chord) throw new Error(`Unknown practice hint chord ${symbol}`);
  return chord;
}

function block(midis: readonly number[], seconds: number, gap = 0.07): PracticeHintStep {
  return { notes: midis.map(midi => ({ midi })), seconds, gap };
}

function spellHintChord(symbol: string, root: number, spelling: SpelledMidi): ChordHintTone[] {
  const intervals = chordTemplate(symbol).intervals;
  const formula = formatChordFormula(intervals);
  const labels = (symbol === 'dim7' ? formula.replace(/6$/, '𝄫7') : formula).split(' ');
  return intervals.map((interval, index) => {
    const label = labels[index], degree = Number(label.replace(/^\D+/u, '')), midi = root + interval;
    return { ...spellDiatonicDegree(spelling, midi, degree), label, degree, midi };
  });
}

export function chordHintInversionCount(symbol: string): number {
  return Math.min(chordTemplate(symbol).intervals.length, 4);
}

export function chordHintTones(symbol: string, tonic: number, inversion = 0): ChordHintTone[] {
  const root = practiceTonicMidi(tonic, 'near-middle-c');
  const tones = spellHintChord(symbol, root, spellMidi(root, keyFifths(tonic, false)));
  const inv = Math.max(0, Math.min(inversion, chordHintInversionCount(symbol) - 1));
  if (!inv) return tones;
  const shifted = tones.map((tone, index) => (index < inv
    ? { ...tone, midi: tone.midi + 12, oct: tone.oct + 1 }
    : tone));
  return shifted.sort((a, b) => a.midi - b.midi);
}

export function chordHintFormula(symbol: string): string {
  return chordHintTones(symbol, 0).map(note => note.label).join(' ');
}

export function chordSingleSteps(symbol: string, tonic: number, inversion = 0): PracticeHintStep[] {
  const notes = chordHintTones(symbol, tonic, inversion);
  const diagramKey = `${symbol}:${inversion}`;
  return [...notes.map(note => ({ notes: [note], seconds: 0.16, gap: 0.04, diagramKey })),
    { notes, seconds: 0.65, gap: 0.22, diagramKey }];
}

export function scaleHintFormula(hint: ScaleHint): string {
  return hint.formula ?? formatScaleFormula(SCALE_DEFINITIONS[hint.name]);
}

const WHITE_KEY_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const isBlackMidi = (midi: number) => !WHITE_KEY_PCS.has(pitchClass(midi));

const STANDARD_SCALE_FINGERINGS: Readonly<Partial<Record<string, keyof typeof SCALE_FINGERINGS>>> = {
  'Major (Ionian)': 'maj',
  'Aeolian (Natural minor)': 'natural',
  'Harmonic minor': 'harmonic',
  'Melodic minor': 'melodic',
};

function solveScaleFingering(midis: readonly number[], hand: TechniqueHand): number[] {
  const n = midis.length;
  const black = midis.map(isBlackMidi);
  const allBlack = black.every(Boolean);
  const dp: number[][] = Array.from({ length: n }, () => Array(6).fill(Infinity));
  const prev: number[][] = Array.from({ length: n }, () => Array(6).fill(0));

  const noteCost = (i: number, f: number): number => {
    let cost = 0;
    if (f === 1 && black[i] && !allBlack) cost += 100;
    if (f === 5 && black[i]) cost += 80;
    if (f === 5 && (hand === 'rh' ? i < n - 1 : i > 0)) cost += 120;
    if (i === 0) {
      if (hand === 'rh') cost += black[0] ? (f === 2 ? 0 : f === 3 ? 3 : 10) : (f === 1 ? 0 : 8);
      else cost += black[0] ? (f === 3 ? 0 : f === 2 ? 2 : f === 4 ? 4 : 12) : (f === 5 ? 0 : f === 4 ? 4 : 8);
    }
    if (i === n - 1) {
      if (hand === 'rh') cost += black[n - 1] ? (f === 2 ? 0 : f === 3 ? 2 : f === 4 ? 4 : 10) : (f === 5 ? 0 : f === 4 ? 3 : f === 3 ? 5 : 7);
      else cost += black[n - 1] ? (f === 3 ? 0 : f === 2 ? 2 : f === 4 ? 4 : 10) : (f === 1 ? 0 : f === 2 ? 4 : 7);
    }
    return cost;
  };

  for (let f = 1; f <= 5; f++) dp[0][f] = noteCost(0, f);

  for (let i = 1; i < n; i++) {
    const semi = midis[i] - midis[i - 1];
    for (let fNext = 1; fNext <= 5; fNext++) {
      const base = noteCost(i, fNext);
      for (let fPrev = 1; fPrev <= 5; fPrev++) {
        if (!Number.isFinite(dp[i - 1][fPrev])) continue;
        let step = Infinity;
        if (hand === 'rh') {
          if (fNext > fPrev) {
            const df = fNext - fPrev;
            step = df === 1 ? (semi <= 3 ? 0 : 2) : df === 2 ? (semi >= 3 ? 3 : 7) : (semi >= 4 ? 6 : 15);
          } else if (fNext === 1 && fPrev >= 2 && fPrev <= 4) {
            step = (fPrev === 3 ? 4 : fPrev === 4 ? 5 : 9) + (black[i - 1] && !black[i] ? -2 : 0) + (!black[i - 1] && black[i] ? 8 : 0);
          }
        } else {
          if (fNext < fPrev) {
            const df = fPrev - fNext;
            step = df === 1 ? (semi <= 3 ? 0 : 2) : df === 2 ? (semi >= 3 ? 3 : 7) : (semi >= 4 ? 6 : 15);
          } else if (fPrev === 1 && fNext >= 2 && fNext <= 4) {
            step = (fNext === 3 ? 4 : fNext === 4 ? 5 : 9) + (!black[i - 1] && black[i] ? -2 : 0) + (black[i - 1] && !black[i] ? 8 : 0);
          }
        }
        const total = dp[i - 1][fPrev] + step + base;
        if (total < dp[i][fNext]) {
          dp[i][fNext] = total;
          prev[i][fNext] = fPrev;
        }
      }
    }
  }

  let best = 1;
  for (let f = 2; f <= 5; f++) if (dp[n - 1][f] < dp[n - 1][best]) best = f;
  const result = new Array<number>(n);
  for (let i = n - 1, f = best; i >= 0; i--) {
    result[i] = f;
    f = prev[i][f];
  }
  return result;
}

export function scaleHintFingering(name: string, tonic: number, hand: TechniqueHand): number[] {
  const tonicPc = pitchClass(tonic);
  const tableKey = STANDARD_SCALE_FINGERINGS[name];
  if (tableKey) return [...SCALE_FINGERINGS[tableKey][hand][tonicPc]].map(Number);
  const offsets = SCALE_DEFINITIONS[name];
  const root = practiceTonicMidi(tonic, 'near-middle-c');
  const midis = [...offsets, 12].map(offset => root + offset);
  if (name === 'Chromatic') {
    return midis.map((midi, index) => {
      if (isBlackMidi(midi)) return 3;
      if (hand === 'rh') return index > 0 && !isBlackMidi(midis[index - 1]) ? 2 : 1;
      return index < midis.length - 1 && !isBlackMidi(midis[index + 1]) ? 2 : 1;
    });
  }
  return solveScaleFingering(midis, hand);
}

const scaleLetterDegrees: Readonly<Partial<Record<string, readonly number[]>>> = {
  'Major pentatonic': [1, 2, 3, 5, 6],
  'Minor pentatonic': [1, 3, 4, 5, 7],
  Blues: [1, 3, 4, 5, 5, 7],
  'Whole tone': [1, 2, 3, 4, 5, 6],
};

export function scaleHintTones(name: string, tonic: number, hand?: TechniqueHand) {
  const offsets = SCALE_DEFINITIONS[name];
  const root = practiceTonicMidi(tonic, 'near-middle-c');
  const fifths = keyFifths(tonic, false), spelling = spellMidi(root, fifths);
  const fingers = hand ? scaleHintFingering(name, tonic, hand) : null;
  return [...offsets, 12].map((offset, index) => {
    const midi = root + offset;
    const degree = offset === 12 ? 8 : offsets.length === 7 ? index + 1 : scaleLetterDegrees[name]?.[index];
    const written = degree === undefined ? spellMidi(midi, fifths) : spellDiatonicDegree(spelling, midi, degree);
    return { ...written, midi, tonic: offset === 0 || offset === 12, ...(fingers ? { finger: fingers[index] } : {}) };
  });
}

function playScaleTones(tones: readonly PracticeHintNote[], seconds: number, diagramKey: string): PracticeHintStep[] {
  return tones.map((tone, i) => ({ ...block([tone.midi], seconds, i + 1 === tones.length ? 0.22 : 0.035), diagramKey }));
}

export function scaleSingleSteps(name: string, tonic: number): PracticeHintStep[] {
  return playScaleTones(scaleHintTones(name, tonic), 0.2, name);
}

export function progressionHintChords(hint: ProgressionHint, tonic: number) {
  const chords = PROGRESSION_TEMPLATES.find(template => template.name === hint.name)?.chords;
  if (!chords) throw new Error(`Unknown practice hint progression ${hint.name}`);
  const pattern = hint.name === '12-bar blues'
    ? TWELVE_BAR_BLUES_ROOTS.map(offset => [offset, '7', offset === 0 ? 'I⁷' : offset === 5 ? 'IV⁷' : 'V⁷'] as const)
    : chords;
  return pattern.map(([offset, symbol, roman]) => ({ root: transposePitchClass(tonic, offset), symbol, roman }));
}

export interface ProgressionHintVoicing {
  readonly roman: string;
  readonly symbol: string;
  readonly bass: SpelledMidi & PracticeHintNote;
  readonly upper: readonly ChordHintTone[];
}

export function progressionHintVoicings(hint: ProgressionHint, tonic: number): ProgressionHintVoicing[] {
  const minor = Boolean(hint.minor), fifths = keyFifths(tonic, minor);
  return progressionHintChords(hint, tonic).map(({ root, symbol, roman }, i) => {
    const midi = 48 + tonic + hint.bass[i];
    const bass = { ...spellMidi(midi, fifths, minor), midi };
    const upperRoot = Math.max(midi + 12, 60 + root - (root > 7 ? 12 : 0));
    const spelling = { ...bass, oct: bass.oct + (upperRoot - midi) / 12 };
    return { roman, symbol, bass, upper: spellHintChord(symbol, upperRoot, spelling) };
  });
}

export function progressionHintResolution(hint: ProgressionHint, tonic: number) {
  if (!hint.resolution) return [];
  const minor = Boolean(hint.minor);
  const root = spellMidi(60 + tonic, keyFifths(tonic, minor), minor);
  // The leading tone sits below the tonic. The fourth resolves to the third above it.
  const degrees = [[0, 4], [1, 3]];
  return hint.resolution.map((pair, step) => pair.map((note, voice) => {
    const midi = note + tonic;
    return { ...spellDiatonicDegree(root, midi, degrees[step][voice]), midi };
  }));
}

export function progressionHintSteps(hint: ProgressionHint, tonic: number, part: 'overview' | 'full' | 'bass' | 'resolution' | number = 'overview'): PracticeHintStep[] {
  if (part === 'resolution') {
    return progressionHintResolution(hint, tonic).map((notes, i) => ({ notes, seconds: 0.65, gap: 0.08, diagramKey: `resolution:${i}` }));
  }
  const voicings = progressionHintVoicings(hint, tonic);
  if (part === 'bass') {
    return voicings.map(({ bass }, i) => ({ notes: [bass], seconds: 0.42, gap: 0.06, diagramKey: String(i) }));
  }
  const chord = (i: number, seconds: number, gap = 0.07): PracticeHintStep => {
    const { bass, upper } = voicings[i];
    return { notes: [bass, ...upper], seconds, gap, diagramKey: String(i) };
  };
  if (typeof part === 'number') return [chord(part, 0.8, 0)];
  if (hint.name === '12-bar blues') {
    return voicings.flatMap(({ bass }, i) => {
      const pulse = { notes: [bass], seconds: 0.47, gap: 0.03, diagramKey: String(i) };
      return [chord(i, 0.47, 0.03), pulse, chord(i, 0.47, 0.03), pulse];
    });
  }
  const reference = hint.referenceTonic ? [block([0, 4, 7].map(offset => 60 + tonic + offset), 0.48, 0.22)] : [];
  if (part === 'full') return [...reference, ...voicings.map((_, i) => chord(i, 0.65, 0.08))];
  const bass = voicings.map(({ bass }, i) => ({ ...block([bass.midi], 0.32), diagramKey: String(i) }));
  const resolution = progressionHintResolution(hint, tonic).map(notes => ({ notes, seconds: 0.56, gap: 0.07 }));
  return [...reference, ...bass, ...voicings.map((_, i) => chord(i, 0.57)), ...resolution];
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
  const run = steps.flatMap(step => step.notes);
  const preview = (notes: readonly PracticeHintNote[], start: number, seconds: number, lastGap: number) =>
    notes.map((note, i): PracticeHintStep =>
      ({ notes: [note], seconds, gap: i === notes.length - 1 ? lastGap : 0.04, diagramKey: String(start + i) }));
  const fragmentSteps = preview(fragment, focusAt, 0.36, 0.3);
  return {
    ascending, fragment, run,
    steps: [...preview(fragment, focusAt, 0.33, 0.2), ...preview(fragment, focusAt, 0.33, 0.23), ...preview(run, 0, 0.21, 0)],
    fragmentSteps: [...fragmentSteps, ...fragmentSteps],
    runSteps: preview(run, 0, 0.22, 0),
  };
}

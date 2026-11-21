import { techniqueSteps } from './technique.js';

/** Experimental estimates of score difficulty. This module does not score a player's performance. */
export const ESTIMATOR_VERSION = 3;

export type DifficultyHand = 'rh' | 'lh';
export type DifficultyProfile = 'performance' | 'sightReading';
export type TempoSource = 'written' | 'reference' | 'fallback';
export type VoiceSource = 'written' | 'inferred' | 'unknown';
export type HandSource = 'written' | 'track' | 'pitchSplit' | 'unassigned';
export type NoteArticulation = 'staccato' | 'accent' | 'tenuto';
export type DifficultyDriver =
  | 'speed' | 'large_leaps' | 'wide_span' | 'position_shifts' | 'rapid_repeats' | 'trills'
  | 'double_notes' | 'polyphonic_fingers'
  | 'syncopation' | 'tuplets' | 'fast_subdivisions' | 'meter_changes' | 'asymmetric_meter' | 'active_rests'
  | 'polyrhythm' | 'hand_independence' | 'contrary_motion' | 'hand_crossing' | 'mixed_articulation' | 'split_attention'
  | 'dense_chords' | 'two_hand_chords' | 'polyphonic_voices' | 'chord_changes' | 'pedal_control'
  | 'accidentals' | 'key_signature' | 'ledger_lines' | 'clef_changes' | 'ornaments' | 'pattern_unpredictability';

export interface DifficultyMeasure {
  /** Quarter-note positions in the supplied (written or played) timeline. */
  start: number;
  end: number;
  startSec: number;
  endSec: number;
  /** Durations of metric groups in quarter notes. A partial measure may clip the last group. */
  groups: readonly number[];
  /** Original zero-based measure number, reused for repeated occurrences. */
  writtenIndex: number;
  fifths?: number;
  num?: number;
  den?: number;
  clefChanges?: number;
  pedalChanges?: number;
}

export interface DifficultyNote {
  start: number;
  end: number;
  startSec: number;
  /** Preserve the written/key-held end. Pedal-extended sound is a separate channel. */
  soundingEnd?: number;
  midi: number;
  hand: DifficultyHand | null;
  voice?: string;
  /** Written piano fingering, when present. */
  finger?: number;
  /** Transposition-invariant diatonic position for the generated-book profile. */
  degree?: number;
  accidentals?: number;
  ledgerLines?: number;
  dotted?: boolean;
  tuplet?: boolean;
  /** Adapter joins tied continuations to the principal note and records the written tie here. */
  tiedAcrossBar?: boolean;
  ornaments?: number;
  trills?: number;
  articulation?: NoteArticulation;
}

export interface DifficultyRest {
  start: number;
  end: number;
  hand: DifficultyHand | null;
  voice?: string;
  active: boolean;
}

export interface DifficultyInput {
  measures: readonly DifficultyMeasure[];
  notes: readonly DifficultyNote[];
  rests: readonly DifficultyRest[];
  /** For a written timeline, the adapter can supply the full playback duration. */
  playedDurationSec?: number;
  tempoSource: TempoSource;
  voiceSource: VoiceSource;
  handSource?: HandSource;
}

export interface DifficultyAxes {
  motor: number;
  rhythm: number;
  bimanual: number;
  texture: number;
  reading: number;
}

export interface DifficultyAggregationConfig {
  mode: 'order' | 'axis';
  orderWeights?: readonly [number, number, number, number, number];
  weakestLinkDelta?: number;
  axisWeights?: DifficultyAxes;
  alphaWeak?: number;
  enduranceScale?: number;
}

export interface DifficultyOptions {
  rubricVersion?: 1 | 2 | 3;
  aggregation?: DifficultyAggregationConfig;
}

export const DEFAULT_AGGREGATION: DifficultyAggregationConfig = {
  mode: 'axis',
  axisWeights: { motor: 0.32, bimanual: 0.22, rhythm: 0.20, texture: 0.16, reading: 0.10 },
  alphaWeak: 0.32,
  enduranceScale: 1,
};

export const DIFFICULTY_AXES = ['motor', 'rhythm', 'bimanual', 'texture', 'reading'] as const;
export type DifficultyAxis = typeof DIFFICULTY_AXES[number];

export interface DifficultyAxisSummary {
  stars: number;
  measures: readonly number[];
  drivers: readonly DifficultyDriver[];
}

interface PositionChange {
  hand: DifficultyHand;
  beat: number;
  reason: 'span' | 'writtenThumb' | 'inferredThumb';
}

export interface DifficultyWindow {
  startMeasure: number;
  endMeasure: number;
  /** One-based written measure numbers in timeline order, including repeat jumps. */
  writtenMeasures: readonly number[];
  attacks: number;
  /** Strongest verified ratio in the window, expressed as log₂ of its common grid. */
  polyrhythmCost: number;
  /** Physical-profile diagnostics, ordered by quarter-note position. */
  positionChanges: readonly PositionChange[];
  axes: DifficultyAxes;
  score: number;
}

export interface DifficultyEstimate {
  estimatorVersion: 1 | 2 | 3;
  profile: DifficultyProfile;
  score: number;
  peak: DifficultyWindow | null;
  typical: number;
  difficultyStars: number | null;
  baseStars: number | null;
  appliedEnduranceStars: number;
  enduranceRaw: number;
  spanAlert: boolean;
  enduranceComponents: { stamina: number; materialLoad: number };
  continuousAxisStars: Readonly<DifficultyAxes> | null;
  axisDifficulty: Readonly<Record<DifficultyAxis, DifficultyAxisSummary>> | null;
  endurance: number;
  uniqueWrittenMeasures: number;
  uncertainty: {
    tempoFallback: boolean;
    voicesInferred: boolean;
    handsUnassigned: boolean;
    tempoSource: TempoSource;
    voiceSource: VoiceSource;
    handSource: HandSource;
  };
}

const EPSILON = 1e-7;
const HANDS: readonly DifficultyHand[] = ['rh', 'lh'];
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
const ASYMMETRIC_NUMS = new Set([5, 7, 10, 11, 13]);
const MOTOR_V3_DIVISOR = 4.8;
const RHYTHM_V3_DIVISOR = 1.10;
const BIMANUAL_V3_DIVISOR = 0.68;
const TEXTURE_V3_DIVISOR = 1.55;
const READING_V3_DIVISOR = 4.2;
const MAX_SAFE_WINDOW_SEC = 1e7;
const unit = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number) => Math.round(value * 100) / 100;
const axisStars = (strength: number, v3 = false) => {
  const s = Math.max(0, strength);
  if (!v3) return 5 - 4 / (1 + s);
  const p = Math.pow(s, 1.20);
  return 1 + (4 * p) / (p + 1);
};
const roundStars = (value: number) => Math.round(Math.min(5, Math.max(1, value)) * 10) / 10;

export function aggregateDifficultyStarsDetailed(
  axes: DifficultyAxes,
  enduranceStarsRaw = 0,
  config: DifficultyAggregationConfig = DEFAULT_AGGREGATION,
): { rawBase: number; rawTotal: number; difficultyStars: number; baseStars: number; appliedEnduranceStars: number } {
  const sorted = DIFFICULTY_AXES.map(axis => axes[axis]).sort((a, b) => b - a);
  let base: number;
  if (config.mode === 'axis') {
    const weights = config.axisWeights ?? { motor: 0.32, rhythm: 0.20, bimanual: 0.22, texture: 0.16, reading: 0.10 };
    const weighted = DIFFICULTY_AXES.reduce((sum, axis) => sum + axes[axis] * weights[axis], 0);
    const alpha = config.alphaWeak ?? 0.32;
    base = alpha * sorted[0] + (1 - alpha) * weighted;
  } else {
    const weights = config.orderWeights ?? [0.45, 0.30, 0.25 / 3, 0.25 / 3, 0.25 / 3];
    const delta = config.weakestLinkDelta ?? 1;
    const weighted = sorted.reduce((sum, stars, i) => sum + stars * weights[i], 0);
    base = Math.max(sorted[0] - delta, weighted);
  }
  const rawBase = Math.min(5, Math.max(1, base));
  const enduranceScaled = Math.min(0.5, Math.max(0, enduranceStarsRaw * (config.enduranceScale ?? 1)));
  const rawTotal = Math.min(5, Math.max(1, rawBase + enduranceScaled));
  const difficultyStars = roundStars(rawTotal);
  const baseStars = roundStars(rawBase);
  const appliedEnduranceStars = Math.round(Math.max(0, difficultyStars - baseStars) * 10) / 10;
  return { rawBase, rawTotal, difficultyStars, baseStars, appliedEnduranceStars };
}

export function aggregateDifficultyStars(
  axes: DifficultyAxes,
  endurance = 0,
  config: DifficultyAggregationConfig = DEFAULT_AGGREGATION,
): number {
  return aggregateDifficultyStarsDetailed(axes, unit(endurance / 6) * 0.5, config).difficultyStars;
}

function axisRecord<T>(make: (axis: DifficultyAxis) => T): Record<DifficultyAxis, T> {
  return { motor: make('motor'), rhythm: make('rhythm'), bimanual: make('bimanual'), texture: make('texture'), reading: make('reading') };
}

function median(values: number[]): number {
  const copy = [...values].sort((a, b) => a - b);
  const middle = Math.floor(copy.length / 2);
  return copy.length ? (copy[middle] + copy[Math.floor((copy.length - 1) / 2)]) / 2 : 0;
}

type DriverWeights = Partial<Record<DifficultyDriver, number>>;

function addDriver(weights: DriverWeights, driver: DifficultyDriver, value: number): void {
  if (value > 0) weights[driver] = (weights[driver] ?? 0) + value;
}

function mergeDrivers(target: DriverWeights, source: DriverWeights): void {
  for (const [driver, value] of Object.entries(source) as [DifficultyDriver, number][]) {
    if (value > 0) target[driver] = (target[driver] ?? 0) + value;
  }
}

function topDrivers(weights: DriverWeights): DifficultyDriver[] {
  const entries = (Object.entries(weights) as [DifficultyDriver, number][])
    .filter(([, value]) => value > 0.05)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!entries.length) return [];
  const out = [entries[0][0]];
  if (entries[1]) out.push(entries[1][0]);
  if (entries[2] && entries[2][1] >= entries[0][1] * 0.45) out.push(entries[2][0]);
  return out;
}

interface Attack {
  start: number;
  end: number;
  sec: number;
  notes: DifficultyNote[];
  direction: number;
  structuralDirection: number;
}

interface MotorEvent {
  sec: number;
  measureIndex: number;
  hand: DifficultyHand | null;
  cost: number;
  drivers: DriverWeights;
}

interface HandLeap {
  sec: number;
  jump: number;
  chordSize: number;
}

interface Bar {
  attacks: Attack[];
  hands: Record<DifficultyHand, Attack[]>;
  leaps: Record<DifficultyHand, HandLeap[]>;
  heldUntil: Record<DifficultyHand, number>;
  seenReadingPitches: Set<string>;
  speed: number;
  motion: number;
  positionChanges: PositionChange[];
  geometry: number;
  structuralMotion: number;
  structuralShifts: number;
  rhythm: number;
  texture: number;
  structuralTexture: number;
  voices: number;
  reading: number;
  chromatic: number;
  bimanual: number;
  structuralBimanual: number;
  polyrhythmCost: number;
  rests: string[];
  hasSound: boolean;
  drivers: Record<DifficultyAxis, DriverWeights>;
}

function emptyBar(): Bar {
  return {
    attacks: [], hands: { rh: [], lh: [] }, leaps: { rh: [], lh: [] }, heldUntil: { rh: 0, lh: 0 },
    seenReadingPitches: new Set<string>(),
    speed: 0, motion: 0, positionChanges: [], geometry: 0, structuralMotion: 0, structuralShifts: 0,
    rhythm: 0, texture: 0, structuralTexture: 0, voices: 0, reading: 0,
    chromatic: 0, bimanual: 0, structuralBimanual: 0, polyrhythmCost: 0, rests: [], hasSound: false,
    drivers: axisRecord((): DriverWeights => ({})),
  };
}

function measureAt(measures: readonly DifficultyMeasure[], beat: number) {
  let lo = 0, hi = measures.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (measures[mid].end <= beat + EPSILON) lo = mid + 1;
    else hi = mid;
  }
  return lo < measures.length && measures[lo].start <= beat + EPSILON ? lo : -1;
}

function attacksFor(notes: readonly DifficultyNote[]) {
  const hands: Record<DifficultyHand, Attack[]> = { rh: [], lh: [] };
  const unassigned: Attack[] = [];
  for (const note of [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi)) {
    const line = note.hand ? hands[note.hand] : unassigned;
    const prev = line.at(-1);
    // The adapter supplies the rhythmic grid. A fast arpeggio is still a sequence of attacks.
    if (prev && Math.abs(note.start - prev.start) < EPSILON) {
      prev.notes.push(note);
      prev.end = Math.max(prev.end, note.end);
    } else {
      line.push({ start: note.start, end: note.end, sec: note.startSec, notes: [note], direction: 0, structuralDirection: 0 });
    }
  }
  return { hands, unassigned };
}

function metricGroups(measure: DifficultyMeasure) {
  const starts = [measure.start];
  for (const length of measure.groups) {
    const next = starts[starts.length - 1] + length;
    if (next >= measure.end - EPSILON) break;
    starts.push(next);
  }
  return starts;
}

function syncopated(note: DifficultyNote, measure: DifficultyMeasure, groups: readonly number[]) {
  // In regular four-beat measures the middle of the bar is stronger than beats two and four.
  const regularFour = groups.length === 4 && measure.groups.length === 4 &&
    measure.groups.every(length => Math.abs(length - measure.groups[0]) < EPSILON);
  const boundary = groups.findIndex(start => Math.abs(start - note.start) < EPSILON);
  if (boundary < 0) return [...groups, measure.end].some(start => start > note.start + EPSILON && start < note.end - EPSILON);
  if (boundary === 0) return false;
  const nextAccent = regularFour && boundary === 1 ? groups[2] : measure.end;
  return (!regularFour || boundary % 2 === 1) && note.end > nextAccent + EPSILON;
}

function isAsymmetricMeter(measure: DifficultyMeasure): boolean {
  if (measure.num && measure.den) {
    if (measure.den === 8 && ASYMMETRIC_NUMS.has(measure.num)) return true;
    if (measure.den === 4 && (measure.num === 5 || measure.num === 7)) return true;
    if (measure.den === 16 && (measure.num === 5 || measure.num === 7 || measure.num === 11)) return true;
  }
  if (measure.groups.length >= 2) {
    const sum = measure.groups.reduce((s, g) => s + g, 0);
    if (Math.abs(sum - (measure.end - measure.start)) < 1e-4) {
      const min = Math.min(...measure.groups);
      const max = Math.max(...measure.groups);
      if (max - min > 1e-4) return true;
    }
  }
  return false;
}

function meterSignature(measure: DifficultyMeasure): string {
  return measure.num && measure.den
    ? `${measure.num}/${measure.den}`
    : measure.groups.map(g => round(g)).join('+');
}

interface AttackTimingContext {
  uniformSubdivision: boolean;
  syncDiscount: number;
  suppressSyncopation?: boolean;
}

function annotateAttack(
  attack: Attack,
  measure: DifficultyMeasure,
  groups: readonly number[],
  bar: Bar,
  isV3: boolean,
  timing?: AttackTimingContext,
): boolean {
  bar.attacks.push(attack);
  bar.hasSound = true;
  const isSyncopated = (!isV3 || !timing?.suppressSyncopation) &&
    attack.notes.some(note =>
      (!isV3 || note.end - note.start > 0.25 + EPSILON) && syncopated(note, measure, groups),
    );
  const tiedAcrossBar = attack.notes.some(note => note.tiedAcrossBar);
  const syncDiscount = isV3 ? (timing?.syncDiscount ?? 1) : 1;
  const syncVal = isSyncopated ? 1.1 * syncDiscount : tiedAcrossBar ? 0.45 : 0;
  bar.rhythm += syncVal;
  addDriver(bar.drivers.rhythm, 'syncopation', syncVal);
  if (attack.notes.some(note => note.dotted)) bar.rhythm += 0.35;
  if (attack.notes.some(note => note.tuplet)) {
    const tupletVal = isV3 && timing?.uniformSubdivision ? 0.25 : 0.7;
    bar.rhythm += tupletVal;
    addDriver(bar.drivers.rhythm, 'tuplets', tupletVal);
  }
  const shortest = Math.min(...attack.notes.map(note => note.end - note.start));
  const uniformFactor = isV3 && timing?.uniformSubdivision ? 0.2 : 1;
  const subVal = (shortest <= 0.25 ? 0.45 : shortest <= 0.5 ? 0.15 : 0) * uniformFactor;
  bar.rhythm += subVal;
  addDriver(bar.drivers.rhythm, 'fast_subdivisions', subVal);

  const pitches = new Set(attack.notes.map(note => note.midi));
  const span = Math.max(...pitches) - Math.min(...pitches);
  const structTex = Math.max(0, pitches.size - 1) * 0.45;
  bar.structuralTexture += structTex;
  if (isV3) {
    // Physical hand span moves cleanly to motor; keep chord density in texture.
    const chordDensity = Math.max(0, pitches.size - 1) * 0.25;
    bar.texture += chordDensity;
    addDriver(bar.drivers.texture, 'dense_chords', chordDensity);
  } else {
    const v1Tex = Math.max(0, pitches.size - 1) * 0.2 + Math.max(0, span - 7) * 0.22;
    bar.texture += v1Tex;
    addDriver(bar.drivers.texture, 'dense_chords', Math.max(0, pitches.size - 1) * 0.2);
  }
  for (const note of attack.notes) {
    const pitchKey = `${note.hand ?? 'u'}:${note.midi}`;
    const seen = isV3 && bar.seenReadingPitches.has(pitchKey);
    if (isV3 && !seen) bar.seenReadingPitches.add(pitchKey);
    const repeatFactor = seen ? 0.15 : 1;
    const acc = (note.accidentals ?? 0) * repeatFactor;
    const ledger = (note.ledgerLines ?? 0) * 0.25 * repeatFactor;
    const orn = Math.min(2, note.ornaments ?? 0) * 0.35;
    bar.chromatic += acc;
    bar.reading += ledger + orn;
    addDriver(bar.drivers.reading, 'accidentals', acc * 0.55);
    addDriver(bar.drivers.reading, 'ledger_lines', ledger);
    addDriver(bar.drivers.reading, 'ornaments', orn);
  }
  return isSyncopated;
}

type Range = readonly [low: number, high: number];

function pitchRange(attack: Attack, structural: boolean): Range | null {
  let low = Infinity, high = -Infinity;
  for (const note of attack.notes) {
    const pitch = structural ? note.degree : note.midi;
    if (pitch === undefined) return null;
    low = Math.min(low, pitch);
    high = Math.max(high, pitch);
  }
  return [low, high];
}

function position(previous: Range | null, next: Range, span: number): Range {
  if (!previous) return next;
  const combined: Range = [Math.min(previous[0], next[0]), Math.max(previous[1], next[1])];
  return combined[1] - combined[0] <= span ? combined : next;
}

function rangeChanged(a: Range, b: Range) {
  return a[0] !== b[0] || a[1] !== b[1];
}

function writtenFinger(attack: Attack) {
  const finger = attack.notes.length === 1 ? attack.notes[0].finger : undefined;
  return finger !== undefined && Number.isInteger(finger) && finger >= 1 && finger <= 5 ? finger : undefined;
}

function connectedSingleNotes(previous: Attack, current: Attack) {
  return previous.notes.length === 1 && current.notes.length === 1 &&
    previous.notes[0].voice === current.notes[0].voice && previous.end + EPSILON >= current.start;
}

/** Infer only a complete, continuous scale with standard fingering. Written fingers take precedence. */
function scaleFingers(run: readonly Attack[], hand: DifficultyHand, octaves: 1 | 2) {
  const first = run[0].notes[0].midi, last = run[run.length - 1].notes[0].midi;
  if (Math.abs(last - first) !== 12 * octaves) return null;
  const rising = last > first, tonic = Math.min(first, last);
  if (run.slice(1).some((attack, i) => !connectedSingleNotes(run[i], attack))) return null;
  for (const kind of ['major', 'minor'] as const) {
    const steps = techniqueSteps({ tonicPc: tonic % 12, kind, octaves, hands: hand });
    const ascending = steps.slice(0, run.length).map(step => step.notes[0]);
    const base = ascending[0].midi;
    const inOrder = rising ? ascending : ascending.reverse();
    const matches = inOrder.every((note, i) => {
      const finger = writtenFinger(run[i]);
      return note.midi - base + tonic === run[i].notes[0].midi && (finger === undefined || finger === note.finger);
    });
    if (matches) return inOrder.map(note => note.finger);
  }
  return null;
}

function fingeringFor(line: readonly Attack[], hand: DifficultyHand) {
  const fingers = line.map(writtenFinger);
  for (let i = 0; i + 8 <= line.length; i++) {
    for (const octaves of [2, 1] as const) {
      const length = octaves * 7 + 1;
      if (i + length > line.length) continue;
      const found = scaleFingers(line.slice(i, i + length), hand, octaves);
      if (!found || found.some((finger, offset) => fingers[i + offset] !== undefined && fingers[i + offset] !== finger)) continue;
      found.forEach((finger, offset) => { fingers[i + offset] ??= finger; });
      // The last note can also begin the return down the scale.
      i += length - 2;
      break;
    }
  }
  return fingers;
}

function thumbCrossing(previous: Attack, current: Attack, before: number | undefined, after: number | undefined, hand: DifficultyHand) {
  if (before === undefined || after === undefined || (before !== 1 && after !== 1) || !connectedSingleNotes(previous, current)) return false;
  const pitchStep = current.notes[0].midi - previous.notes[0].midi;
  return pitchStep * (after - before) * (hand === 'rh' ? 1 : -1) < 0;
}

function hasRecentMotifMatch(tokens: readonly string[], motifLen = 4): boolean {
  if (tokens.length < motifLen * 2) return false;
  const tailStart = tokens.length - motifLen;
  for (let start = 0; start <= tailStart - motifLen; start++) {
    let match = true;
    for (let offset = 0; offset < motifLen; offset++) {
      if (tokens[start + offset] !== tokens[tailStart + offset]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

function annotateHand(
  line: readonly Attack[],
  hand: DifficultyHand,
  input: DifficultyInput,
  bars: Bar[],
  profile: DifficultyProfile,
  isV3: boolean,
  motorEvents: MotorEvent[],
): number {
  let previous: Attack | undefined;
  let physicalPosition: Range | null = null, structuralPosition: Range | null = null;
  let maxHandSpan = 0;
  const heldVoices = new Map<string, number>();
  let heldMidiNotes: { midi: number; start: number; end: number }[] = [];
  const recentMotifTokens: string[] = [];
  const recentWindowAttacks: { sec: number; range: Range; midis: number[] }[] = [];
  const fingers = profile === 'performance' ? fingeringFor(line, hand) : [];
  for (const [i, attack] of line.entries()) {
    const index = measureAt(input.measures, attack.start);
    if (index < 0) continue;
    const bar = bars[index];
    bar.hands[hand].push(attack);
    const physical = pitchRange(attack, false);
    const structural = pitchRange(attack, true);
    const prevPhysical = previous && pitchRange(previous, false);
    const prevStructural = previous && pitchRange(previous, true);
    const handSpan = physical ? physical[1] - physical[0] : 0;
    if (handSpan > maxHandSpan) maxHandSpan = handSpan;

    let attackMotorCost = isV3 ? 0.14 : 0.22;
    const attackDrivers: DriverWeights = {};
    const rawDeltaSec = previous ? attack.sec - previous.sec : 0;
    const dtRaw = Number.isFinite(rawDeltaSec) && rawDeltaSec >= 0 ? rawDeltaSec : 1e6;
    const speedV2 = previous ? Math.log(1 + Math.max(0, 1 / Math.max(0.04, dtRaw) - 2)) : 0;

    let stationaryBrokenOctave = false;
    let span6 = handSpan;
    let uniqueCount6 = attack.notes.length;
    if (isV3 && physical) {
      const win4 = [...recentWindowAttacks.slice(-3), { sec: attack.sec, range: physical, midis: attack.notes.map(n => n.midi) }];
      if (win4.length >= 3 && attack.notes.length <= 2 && (previous ? previous.notes.length <= 2 : true)) {
        const low4 = Math.min(...win4.map(w => w.range[0]));
        const high4 = Math.max(...win4.map(w => w.range[1]));
        const allMidis4 = win4.flatMap(w => w.midis);
        const uniq4 = new Set(allMidis4).size;
        stationaryBrokenOctave = high4 - low4 <= 12 && uniq4 >= 3 && uniq4 < allMidis4.length;
      }
      const win6 = [
        ...recentWindowAttacks.filter(w => attack.sec - w.sec <= 1.6).slice(-5),
        { sec: attack.sec, range: physical, midis: attack.notes.map(n => n.midi) },
      ];
      span6 = Math.max(...win6.map(w => w.range[1])) - Math.min(...win6.map(w => w.range[0]));
      uniqueCount6 = new Set(win6.flatMap(w => w.midis)).size;
    }

    if (isV3 && handSpan >= 10) {
      const spanSpeedBoost = previous ? Math.min(1.5, speedV2 * 0.35) : 0;
      const rawSpanCost = handSpan >= 12
        ? (0.64 + (handSpan - 11) * 0.55) * (1 + spanSpeedBoost)
        : (handSpan - 9) * 0.32 * (1 + spanSpeedBoost * 0.7);
      const stationaryOctaveGrip = stationaryBrokenOctave && handSpan <= 12;
      const spanCost = stationaryOctaveGrip ? rawSpanCost * 0.25 : rawSpanCost;
      attackMotorCost += spanCost;
      addDriver(attackDrivers, 'wide_span', spanCost);
    }
    const trillsCount = attack.notes.reduce((sum, note) => sum + (note.trills ?? 0), 0);
    if (isV3) {
      if (trillsCount > 0) {
        const trillCost = Math.min(2, trillsCount) * 0.9;
        attackMotorCost += trillCost;
        addDriver(attackDrivers, 'trills', trillCost);
      }
      const totalOrnaments = attack.notes.reduce((sum, note) => sum + (note.ornaments ?? 0), 0);
      const nonTrillOrnaments = Math.max(0, totalOrnaments - trillsCount);
      if (nonTrillOrnaments > 0) {
        const ornMotor = Math.min(2, nonTrillOrnaments) * 0.40;
        attackMotorCost += ornMotor;
        addDriver(attackDrivers, 'ornaments', ornMotor);
      }
    }

    // Track key-held overlaps only (never pedal soundingEnd) for held-finger polyphony and MIDI voice count.
    heldMidiNotes = heldMidiNotes.filter(held => held.end > attack.start + 0.125);
    if (isV3 && heldMidiNotes.length > 0 && physical) {
      const distinctHeld = heldMidiNotes.filter(held =>
        attack.notes.some(n => Math.abs(n.midi - held.midi) >= 2),
      );
      if (distinctHeld.length > 0) {
        let low = physical[0];
        let high = physical[1];
        for (const held of distinctHeld) {
          if (held.midi < low) low = held.midi;
          if (held.midi > high) high = held.midi;
        }
        const polyFingerCost = 0.42 + Math.max(0, high - low - 7) * 0.08;
        attackMotorCost += polyFingerCost;
        addDriver(attackDrivers, 'polyphonic_fingers', polyFingerCost);
      }
    }

    if (previous && prevPhysical && physical) {
      const speed = unit((0.28 - dtRaw) / 0.12) + unit((0.16 - dtRaw) / 0.06);
      const low = physical[0] - prevPhysical[0], high = physical[1] - prevPhysical[1];
      const jump = Math.min(Math.abs(low), Math.abs(high));
      const outerJump = Math.max(Math.abs(low), Math.abs(high));
      attack.direction = Math.sign(hand === 'rh' ? high : low);
      const regularMotion = Math.max(0, jump - 4) * (1 + unit((0.48 - dtRaw) / 0.32)) * 0.24;
      const crosses = thumbCrossing(previous, attack, fingers[i - 1], fingers[i], hand);
      const posLimit = stationaryBrokenOctave ? 12 : 8;
      const next: Range = crosses ? physical : position(physicalPosition, physical, posLimit);
      const posChanged = crosses || (next === physical && rangeChanged(prevPhysical, physical));
      if (posChanged) {
        const bothWritten = writtenFinger(previous) !== undefined && writtenFinger(attack) !== undefined;
        const reason = crosses ? (bothWritten ? 'writtenThumb' : 'inferredThumb') : 'span';
        bar.positionChanges.push({ hand, beat: attack.start, reason });
      }
      physicalPosition = next;
      if (attack.notes.length > 1 || previous.notes.length > 1) {
        // An inversion can change the grip even when the outer notes stay in place.
        const changed = attack.notes.length !== previous.notes.length ||
          attack.notes.some((note, idx) => note.midi !== previous?.notes[idx]?.midi);
        if (changed) {
          const bothChords = attack.notes.length > 1 && previous.notes.length > 1;
          let chordChangeScale = 1;
          if (isV3 && !bothChords) {
            const chordRange = attack.notes.length > 1 ? physical : prevPhysical;
            const singleRange = attack.notes.length === 1 ? physical : prevPhysical;
            const insideSpan = singleRange[0] >= chordRange[0] - 2 && singleRange[1] <= chordRange[1] + 2;
            chordChangeScale = insideSpan ? 0 : 0.5;
          }
          if (chordChangeScale > 0) {
            const chordRate = isV3 ? 0.32 + 0.68 * unit((0.70 - dtRaw) / 0.50) : 1;
            const grip = (0.3 + outerJump * 0.06 * (1 + speed)) * chordRate * chordChangeScale;
            bar.texture += grip;
            addDriver(bar.drivers.texture, 'chord_changes', grip);
          }
        }
      }
      const anchor = hand === 'rh' ? 1 : 0;
      const geom = BLACK_KEYS.has(physical[anchor] % 12) !== BLACK_KEYS.has(prevPhysical[anchor] % 12)
        ? unit((0.30 - dtRaw) / 0.15)
        : 0;

      if (isV3) {
        const dPitch = physical[anchor] - prevPhysical[anchor];
        const qIoi = Math.round((attack.start - previous.start) * 16);
        recentMotifTokens.push(`${dPitch}:${qIoi}:${attack.notes.length}`);
        if (recentMotifTokens.length > 24) recentMotifTokens.shift();
        const isDisjoint = physical[0] > prevPhysical[1] || physical[1] < prevPhysical[0];
        const combinedSpan = Math.max(physical[1], prevPhysical[1]) - Math.min(physical[0], prevPhysical[0]);
        const centerJump = Math.round(Math.abs((physical[0] + physical[1]) - (prevPhysical[0] + prevPhysical[1])) / 2);
        const effectiveJump = isDisjoint && jump >= 3 && combinedSpan >= 12 && (attack.notes.length >= 2 || previous.notes.length >= 3)
          ? Math.max(jump, centerJump)
          : jump;
        const isOstinato = dtRaw >= 0.11 &&
          !(effectiveJump >= 10 && attack.notes.length >= 2) &&
          (hasRecentMotifMatch(recentMotifTokens, 3) || hasRecentMotifMatch(recentMotifTokens, 4));

        let leapCost = 0;
        let largeLeapDriverCost = 0;
        if (stationaryBrokenOctave && effectiveJump <= 12) {
          leapCost = effectiveJump >= 8 ? (effectiveJump - 7) * 0.10 : 0;
        } else if (effectiveJump >= 12) {
          const leapTempo = 0.45 + 1.55 * unit((0.70 - dtRaw) / 0.53);
          leapCost = Math.pow(effectiveJump - 11, 1.22) * 0.24 * leapTempo;
          if (attack.notes.length >= 2) {
            leapCost *= 1 + 0.45 * Math.min(3, attack.notes.length - 1);
          }
          largeLeapDriverCost = leapCost;
        } else if (effectiveJump >= 8) {
          const stretchTempo = 0.45 + 1.55 * unit((0.55 - dtRaw) / 0.38);
          leapCost = (effectiveJump - 7) * 0.14 * stretchTempo;
          if (attack.notes.length >= 2 && effectiveJump >= 8) {
            leapCost *= 1 + 0.45 * Math.min(3, attack.notes.length - 1);
            largeLeapDriverCost = leapCost;
          } else if (effectiveJump >= 10 && dtRaw < 0.35) {
            largeLeapDriverCost = leapCost;
          }
        }
        if (!stationaryBrokenOctave && (effectiveJump >= 10 || (effectiveJump >= 8 && attack.notes.length >= 2))) {
          bar.leaps[hand].push({ sec: attack.sec, jump: effectiveJump, chordSize: attack.notes.length });
        }

        const sweepCost = span6 > 12 && uniqueCount6 >= 4 && !crosses && (posChanged || jump >= 4) && dtRaw < 0.40
          ? Math.min(8, span6 - 12) * 0.11 * (1 + unit((0.35 - dtRaw) / 0.20))
          : 0;
        const speedCost = speedV2 * 0.35;
        let shiftCost = (posChanged ? 0.65 : 0) + sweepCost;
        if (isOstinato) {
          attackMotorCost *= 0.78;
          if (span6 <= 13) shiftCost *= 0.60;
          if (effectiveJump < 12 || dtRaw >= 0.35) {
            leapCost *= 0.60;
            largeLeapDriverCost *= 0.60;
          }
        }
        const adjSpeedCost = isOstinato ? speedCost * 0.78 : speedCost;

        const doubleNoteCost = previous.notes.length >= 2 && attack.notes.length >= 2 && outerJump > 0 && dtRaw < 0.40
          ? (0.48 + 0.16 * Math.min(2, Math.min(previous.notes.length, attack.notes.length) - 2)) *
            (1 + speedV2 * 0.45) * unit((0.40 - dtRaw) / 0.26)
          : 0;
        const sameNoteRepeat = dtRaw > EPSILON && dtRaw < 0.14 &&
          attack.notes.some(n => previous?.notes.some(p => p.midi === n.midi));
        const repeatCost = sameNoteRepeat ? unit((0.14 - dtRaw) / 0.09) * 0.85 : 0;

        attackMotorCost += adjSpeedCost + leapCost + shiftCost + geom * 0.2 + repeatCost + doubleNoteCost;
        addDriver(attackDrivers, 'speed', adjSpeedCost);
        addDriver(attackDrivers, 'large_leaps', largeLeapDriverCost);
        addDriver(attackDrivers, 'position_shifts', shiftCost);
        addDriver(attackDrivers, 'rapid_repeats', repeatCost);
        addDriver(attackDrivers, 'double_notes', doubleNoteCost);
      } else {
        bar.speed += speed;
        bar.motion += regularMotion;
        bar.geometry += geom;
        if (profile !== 'sightReading') {
          addDriver(bar.drivers.motor, 'speed', speed);
          addDriver(bar.drivers.motor, 'large_leaps', regularMotion);
          addDriver(bar.drivers.motor, 'position_shifts', posChanged ? 0.65 : 0);
        }
      }
    } else {
      physicalPosition = physical;
    }

    if (physical) {
      recentWindowAttacks.push({ sec: attack.sec, range: physical, midis: attack.notes.map(n => n.midi) });
      if (recentWindowAttacks.length > 8) recentWindowAttacks.shift();
    }

    if (isV3) {
      motorEvents.push({ sec: attack.sec, measureIndex: index, hand, cost: attackMotorCost, drivers: attackDrivers });
    }

    if (prevStructural && structural) {
      const anchor = hand === 'rh' ? 1 : 0;
      const delta = structural[anchor] - prevStructural[anchor];
      attack.structuralDirection = Math.sign(delta);
      const sMotion = Math.max(0, Math.abs(delta) - 1) ** 1.25;
      bar.structuralMotion += sMotion;
      const next = position(structuralPosition, structural, 4);
      if (next === structural && rangeChanged(prevStructural, structural)) bar.structuralShifts++;
      structuralPosition = next;
      if (profile === 'sightReading') {
        addDriver(bar.drivers.motor, 'large_leaps', sMotion);
        addDriver(bar.drivers.motor, 'position_shifts', next === structural && rangeChanged(prevStructural, structural) ? 0.5 : 0);
      }
    } else {
      structuralPosition = structural;
    }

    if (isV3 && input.voiceSource === 'unknown') {
      // Conservative MIDI polyphony: key-held overlaps (> 1/8 beat) with distinct interval >= 3 semitones.
      const matchingHeld = heldMidiNotes.filter(held =>
        attack.notes.some(note => Math.abs(note.midi - held.midi) >= 3),
      );
      if (matchingHeld.length > 0) {
        const heldOnsets = new Set(matchingHeld.map(h => h.start)).size;
        const polyAdd = Math.pow(heldOnsets, 1.35);
        bar.voices += polyAdd;
        addDriver(bar.drivers.texture, 'polyphonic_voices', polyAdd * 0.30);
      }
    } else {
      // Count only distinct identified voices. Inference from MIDI belongs to the adapter.
      const voices = new Set(attack.notes.flatMap(note => note.voice === undefined ? [] : [note.voice]));
      for (const [voice, end] of heldVoices) {
        if (end <= attack.start + EPSILON) heldVoices.delete(voice);
      }
      const activeSet = new Set(voices);
      for (const voice of heldVoices.keys()) activeSet.add(voice);
      if (activeSet.size > 1 && voices.size > 0) {
        const allSameEnd = isV3 &&
          ![...heldVoices.keys()].some(voice => !voices.has(voice)) &&
          attack.notes.every(n => Math.abs(n.end - attack.notes[0].end) <= EPSILON);
        if (!allSameEnd) {
          const vWeight = input.voiceSource === 'written' ? 0.35 : 0.15;
          const polyAdd = isV3 ? Math.pow(activeSet.size - 1, 1.35) : 1;
          bar.voices += polyAdd;
          addDriver(bar.drivers.texture, 'polyphonic_voices', polyAdd * vWeight);
        }
      }
      for (const note of attack.notes) {
        if (note.voice !== undefined) heldVoices.set(note.voice, Math.max(note.end, heldVoices.get(note.voice) ?? 0));
      }
    }
    for (const note of attack.notes) {
      if (note.end > attack.start + 0.125) heldMidiNotes.push({ midi: note.midi, start: attack.start, end: note.end });
    }
    previous = attack;
  }
  let next = 0, heldUntil = 0;
  input.measures.forEach((measure, i) => {
    // A held note may begin in the previous window. Use the written/key-held end,
    // so a pedal tail does not also appear as a second active hand or voice.
    while (next < line.length && line[next].start < measure.start - EPSILON) {
      heldUntil = Math.max(heldUntil, line[next++].end);
    }
    if (heldUntil > measure.start + EPSILON) {
      bars[i].heldUntil[hand] = heldUntil;
      bars[i].hasSound = true;
    }
  });
  return maxHandSpan;
}

function gridCount(line: readonly Attack[], start: number, end: number) {
  const points = line.filter(attack => attack.start >= start - EPSILON && attack.start < end - EPSILON);
  if (points.length < 2) return 0;
  const step = (end - start) / points.length;
  // Confirm that the whole window fits a regular subdivision. Equal observed IOIs alone
  // also match a subset of a shared grid when the first or last attack is missing.
  const tolerance = Math.min(step * 0.08, 1 / 48);
  return points.every((attack, i) => Math.abs(attack.start - (start + i * step)) <= tolerance) ? points.length : 0;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

const COPRIME_POLY_PAIRS: readonly (readonly [number, number])[] = [
  [3, 2], [2, 3], [4, 3], [3, 4], [5, 4], [4, 5], [5, 3], [3, 5],
];

function fitsSubdivisionGrid(points: readonly Attack[], start: number, span: number, count: number): number[] | null {
  const step = span / count;
  const tol = Math.min(step * 0.08, 1 / 48);
  const indices: number[] = [];
  for (const attack of points) {
    const slot = Math.round((attack.start - start) / step);
    if (slot < 0 || slot >= count) return null;
    if (Math.abs(attack.start - (start + slot * step)) > tol) return null;
    indices.push(slot);
  }
  return indices;
}

function partialPolyrhythmCost(
  rhPoints: readonly Attack[],
  lhPoints: readonly Attack[],
  start: number,
  end: number,
): number {
  const span = end - start;
  if (span <= EPSILON || rhPoints.length < 2 || lhPoints.length < 2) return 0;
  const rhRange = [rhPoints[0].start, rhPoints[rhPoints.length - 1].start];
  const lhRange = [lhPoints[0].start, lhPoints[lhPoints.length - 1].start];
  if (Math.min(rhRange[1], lhRange[1]) <= Math.max(rhRange[0], lhRange[0]) + EPSILON) return 0;

  let best = 0;
  for (const [a, b] of COPRIME_POLY_PAIRS) {
    if (rhPoints.length < Math.max(2, Math.ceil(a * 0.5))) continue;
    if (lhPoints.length < Math.max(2, Math.ceil(b * 0.5))) continue;
    const rhSlots = fitsSubdivisionGrid(rhPoints, start, span, a);
    if (!rhSlots) continue;
    const lhSlots = fitsSubdivisionGrid(lhPoints, start, span, b);
    if (!lhSlots) continue;
    // Require genuine cross-subdivision: each hand must hit at least one point off the other hand's grid.
    const rhOffOther = rhSlots.some(slot => (slot * b) % a !== 0);
    const lhOffOther = lhSlots.some(slot => (slot * a) % b !== 0);
    if (!rhOffOther || !lhOffOther) continue;
    best = Math.max(best, Math.log2(a * b) * 0.75);
  }
  return best;
}

function polyrhythm(bar: Bar, measure: DifficultyMeasure, groups: readonly number[], isV3: boolean) {
  const boundaries = [...groups, measure.end];
  const intervals = groups.map((start, i) => [start, boundaries[i + 1]]);
  intervals.push([measure.start, measure.end]);
  const middle = (measure.start + measure.end) / 2;
  if (groups.some(start => Math.abs(start - middle) < EPSILON)) {
    intervals.push([measure.start, middle], [middle, measure.end]);
  }
  let strongest = 0;
  for (const [start, end] of intervals) {
    const right = gridCount(bar.hands.rh, start, end), left = gridCount(bar.hands.lh, start, end);
    if (right && left) {
      const common = gcd(right, left);
      const a = right / common, b = left / common;
      if (a > 1 && b > 1) strongest = Math.max(strongest, Math.log2(a * b));
      continue;
    }
    if (isV3) {
      const rhPoints = bar.hands.rh.filter(a => a.start >= start - EPSILON && a.start < end - EPSILON);
      const lhPoints = bar.hands.lh.filter(a => a.start >= start - EPSILON && a.start < end - EPSILON);
      strongest = Math.max(strongest, partialPolyrhythmCost(rhPoints, lhPoints, start, end));
    }
  }
  return strongest;
}

function handsOverlap(bar: Bar, measure: DifficultyMeasure) {
  const { rh, lh } = bar.hands;
  const firstRight = rh[0]?.start ?? Infinity, firstLeft = lh[0]?.start ?? Infinity;
  const { rh: rightHeld, lh: leftHeld } = bar.heldUntil;
  if ((rightHeld > measure.start && leftHeld > measure.start) ||
      rightHeld > firstLeft + EPSILON || leftHeld > firstRight + EPSILON) return true;
  let right = 0, left = 0;
  while (right < rh.length && left < lh.length) {
    const r = rh[right], l = lh[left];
    if (r.end <= l.start + EPSILON) right++;
    else if (l.end <= r.start + EPSILON) left++;
    else return true;
  }
  return false;
}

function attackArticulation(attack: Attack): NoteArticulation | null {
  for (const note of attack.notes) {
    if (note.articulation) return note.articulation;
  }
  return null;
}

function annotateCoordination(bars: readonly Bar[], input: DifficultyInput, groups: readonly number[][], isV3: boolean) {
  let previousSolo: DifficultyHand | null = null;
  bars.forEach((bar, i) => {
    const { rh, lh } = bar.hands;
    const measure = input.measures[i];
    const barScale = isV3 ? Math.max(0.5, measure.end - measure.start) / 4 : 1;
    const rightActive = rh.length > 0 || bar.heldUntil.rh > measure.start;
    const leftActive = lh.length > 0 || bar.heldUntil.lh > measure.start;
    if (!rightActive || !leftActive) {
      const solo = rightActive ? 'rh' : leftActive ? 'lh' : null;
      if (solo && previousSolo && solo !== previousSolo) {
        bar.bimanual = 0.4 * barScale;
        bar.structuralBimanual = 0.4;
        addDriver(bar.drivers.bimanual, 'hand_independence', 0.4 * barScale);
      }
      previousSolo = solo;
      return;
    }
    previousSolo = null;
    if (!handsOverlap(bar, measure)) {
      bar.bimanual = 0.4 * barScale; // both play in the measure, but take turns
      bar.structuralBimanual = 0.4;
      addDriver(bar.drivers.bimanual, 'hand_independence', 0.4 * barScale);
      return;
    }
    let shared = 0, contrary = 0, structuralContrary = 0, artContrast = 0;
    let r = 0, l = 0;
    while (r < rh.length && l < lh.length) {
      const delta = rh[r].start - lh[l].start;
      if (Math.abs(delta) < EPSILON) {
        shared++;
        if (rh[r].direction * lh[l].direction < 0) contrary++;
        if (rh[r].structuralDirection * lh[l].structuralDirection < 0) structuralContrary++;
        if (rh[r].notes.length > 1 && lh[l].notes.length > 1) {
          bar.texture += 0.35;
          bar.structuralTexture += 0.35;
          addDriver(bar.drivers.texture, 'two_hand_chords', 0.35);
        }
        if (isV3) {
          const rArt = attackArticulation(rh[r]);
          const lArt = attackArticulation(lh[l]);
          if ((rArt || lArt) && rArt !== lArt) artContrast++;
        }
        r++;
        l++;
      } else if (delta < 0) r++;
      else l++;
    }
    const moving = Math.min(rh.length, lh.length) > 1;
    const total = rh.length + lh.length;
    const independent = moving && total > 0 ? (total - 2 * shared) / total : 0;
    bar.polyrhythmCost = moving ? polyrhythm(bar, measure, groups[i], isV3) : 0;
    const coordination = (moving ? 0.35 : 0.18) + independent + bar.polyrhythmCost * 0.55;
    let crossingCost = 0;
    let artCost = 0;
    let splitAttentionCost = 0;
    if (isV3) {
      let crossings = 0;
      for (const rAttack of rh) {
        const rMin = Math.min(...rAttack.notes.map(n => n.midi));
        const crossed = lh.some(lAttack => {
          const overlapsBeats = rAttack.start < lAttack.end - EPSILON && lAttack.start < rAttack.end - EPSILON;
          const closeInTime = Math.abs(rAttack.sec - lAttack.sec) < 0.5 - EPSILON;
          if (!overlapsBeats && !closeInTime) return false;
          const lMax = Math.max(...lAttack.notes.map(n => n.midi));
          return rMin < lMax;
        });
        if (crossed) crossings++;
      }
      crossingCost = Math.min(1.5 * barScale, crossings * 0.35);
      artCost = Math.min(0.8 * barScale, artContrast * 0.20);

      let splitAttentionSum = 0;
      for (const hand of HANDS) {
        if (!bar.leaps[hand].length) continue;
        const otherHand: DifficultyHand = hand === 'rh' ? 'lh' : 'rh';
        const otherAttacks = [
          ...(i > 0 ? bars[i - 1].hands[otherHand].slice(-2) : []),
          ...bar.hands[otherHand],
          ...(i + 1 < bars.length ? bars[i + 1].hands[otherHand].slice(0, 2) : []),
        ];
        if (!otherAttacks.length) continue;
        for (const leap of bar.leaps[hand]) {
          if (otherAttacks.some(att => Math.abs(att.sec - leap.sec) <= 0.40)) {
            splitAttentionSum += (0.35 + Math.max(0, leap.jump - 10) * 0.05) * (leap.chordSize >= 2 ? 1.45 : 1);
          }
        }
      }
      splitAttentionCost = Math.min(2.2 * barScale, splitAttentionSum);
    }
    bar.bimanual = coordination * barScale + contrary * 0.18 + crossingCost + artCost + splitAttentionCost;
    bar.structuralBimanual = coordination + structuralContrary * 0.18;
    addDriver(bar.drivers.bimanual, 'polyrhythm', bar.polyrhythmCost * 0.55 * barScale);
    addDriver(bar.drivers.bimanual, 'hand_independence', independent * barScale);
    addDriver(bar.drivers.bimanual, 'contrary_motion', contrary * 0.18);
    addDriver(bar.drivers.bimanual, 'hand_crossing', crossingCost);
    addDriver(bar.drivers.bimanual, 'mixed_articulation', artCost);
    addDriver(bar.drivers.bimanual, 'split_attention', splitAttentionCost);
  });
}

function lz76Count(tokens: readonly string[]): number {
  const n = tokens.length;
  if (n === 0) return 0;
  const seen = new Set<string>();
  let phrase = '';
  let count = 0;
  for (let i = 0; i < n; i++) {
    phrase = phrase ? `${phrase}|${tokens[i]}` : tokens[i];
    if (!seen.has(phrase)) {
      seen.add(phrase);
      count++;
      phrase = '';
    }
  }
  if (phrase) count++;
  return count;
}

function normalizedLzExcess(tokens: readonly string[]): number {
  const n = tokens.length;
  if (n < 4) return 0;
  const c = lz76Count(tokens);
  const minC = Math.ceil((Math.sqrt(1 + 8 * n) - 1) / 2);
  return n > minC ? unit((c - minC) / (n - minC)) : 0;
}

function attackPitchToken(attack: Attack): string {
  return [...new Set(attack.notes.map(note => note.midi % 12))].sort((a, b) => a - b).join(',');
}

function windowReadingPatternLoad(bars: readonly Bar[], start: number, end: number): number {
  const pcCounts = new Array<number>(12).fill(0);
  const attackTokens: string[] = [];
  let totalNotes = 0;
  let minMidi = Infinity;
  let maxMidi = -Infinity;
  for (let i = start; i <= end; i++) {
    for (const attack of bars[i].attacks) {
      attackTokens.push(attackPitchToken(attack));
      for (const note of attack.notes) {
        pcCounts[((note.midi % 12) + 12) % 12]++;
        totalNotes++;
        if (note.midi < minMidi) minMidi = note.midi;
        if (note.midi > maxMidi) maxMidi = note.midi;
      }
    }
  }
  let entropyTerm = 0;
  if (totalNotes >= 4) {
    let entropy = 0;
    for (const count of pcCounts) {
      if (count > 0) {
        const p = count / totalNotes;
        entropy -= p * Math.log2(p);
      }
    }
    entropyTerm = Math.max(0, entropy - 2.45) * 0.50;
  }
  const lzTerm = normalizedLzExcess(attackTokens) * 0.60;
  const ambitusTerm = maxMidi > minMidi && maxMidi - minMidi > 38
    ? Math.min(1.2, (maxMidi - minMidi - 38) * 0.035)
    : 0;
  return (entropyTerm + lzTerm + ambitusTerm) * (end - start + 1);
}

function motorSliceStats(
  events: readonly MotorEvent[],
  measures: readonly DifficultyMeasure[],
  startSec: number,
  endSec: number,
  totalSec: number,
  startIndex = 0,
): { strength: number; count: number; writtenMeasures: number[]; drivers: DriverWeights } {
  let rhSum = 0, lhSum = 0, unSum = 0, count = 0;
  const measureSet = new Set<number>();
  const drivers: DriverWeights = {};
  const inclusiveEnd = endSec >= totalSec - EPSILON;
  for (let idx = startIndex; idx < events.length; idx++) {
    const ev = events[idx];
    if (ev.sec < startSec - EPSILON) continue;
    if (inclusiveEnd ? ev.sec > endSec + EPSILON : ev.sec >= endSec - EPSILON) break;
    count++;
    if (ev.hand === 'rh') rhSum += ev.cost;
    else if (ev.hand === 'lh') lhSum += ev.cost;
    else unSum += ev.cost;
    measureSet.add(measures[ev.measureIndex].writtenIndex + 1);
    mergeDrivers(drivers, ev.drivers);
  }
  const dur = Math.max(0.25, endSec - startSec);
  const combined = Math.max(rhSum, lhSum) + 0.50 * Math.min(rhSum, lhSum) + unSum;
  return {
    strength: combined / dur / MOTOR_V3_DIVISOR,
    count,
    writtenMeasures: [...measureSet],
    drivers,
  };
}

function evaluatePhysicalMotorWindows(
  sortedEvents: readonly MotorEvent[],
  measures: readonly DifficultyMeasure[],
  totalSec: number,
): { peakStrength: number; peakMeasures: readonly number[]; peakDrivers: DriverWeights; typicalStrength: number; activeWindowStrengths: number[] } {
  const empty = { peakStrength: 0, peakMeasures: [], peakDrivers: {}, typicalStrength: 0, activeWindowStrengths: [] };
  if (!sortedEvents.length || !Number.isFinite(totalSec) || totalSec <= 0 || totalSec > MAX_SAFE_WINDOW_SEC) {
    return empty;
  }
  const hasInvalidSec = sortedEvents.some(ev => !Number.isFinite(ev.sec) || ev.sec < -EPSILON || ev.sec > totalSec + EPSILON);
  const validEvents = hasInvalidSec
    ? sortedEvents.filter(ev => Number.isFinite(ev.sec) && ev.sec >= -EPSILON && ev.sec <= totalSec + EPSILON)
    : sortedEvents;
  if (!validEvents.length) return empty;

  const durations = totalSec <= 4 + EPSILON ? [totalSec] : totalSec <= 8 + EPSILON ? [4, totalSec] : [4, 8];
  const typicalDur = durations[durations.length - 1];
  const rhPrefix = new Float64Array(validEvents.length + 1);
  const lhPrefix = new Float64Array(validEvents.length + 1);
  const unPrefix = new Float64Array(validEvents.length + 1);
  for (let i = 0; i < validEvents.length; i++) {
    const ev = validEvents[i];
    rhPrefix[i + 1] = rhPrefix[i] + (ev.hand === 'rh' ? ev.cost : 0);
    lhPrefix[i + 1] = lhPrefix[i] + (ev.hand === 'lh' ? ev.cost : 0);
    unPrefix[i + 1] = unPrefix[i] + (ev.hand === null ? ev.cost : 0);
  }

  let peakStrength = 0;
  const bestWindow = { t0: 0, t1: 0, left: 0, found: false };
  const typicalStrengths: number[] = [];

  const scanStarts = (starts: readonly number[], winDur: number, collectTypical: boolean) => {
    let left = 0;
    let right = 0;
    for (const t0 of starts) {
      const t1 = Math.min(totalSec, t0 + winDur);
      const inclusiveEnd = t1 >= totalSec - EPSILON;
      while (left < validEvents.length && validEvents[left].sec < t0 - EPSILON) left++;
      if (right < left) right = left;
      while (right < validEvents.length && (inclusiveEnd ? validEvents[right].sec <= t1 + EPSILON : validEvents[right].sec < t1 - EPSILON)) {
        right++;
      }
      if (right <= left) continue;
      const rh = Math.max(0, rhPrefix[right] - rhPrefix[left]);
      const lh = Math.max(0, lhPrefix[right] - lhPrefix[left]);
      const un = Math.max(0, unPrefix[right] - unPrefix[left]);
      const dur = Math.max(0.25, t1 - t0);
      const strength = (Math.max(rh, lh) + 0.50 * Math.min(rh, lh) + un) / dur / MOTOR_V3_DIVISOR;
      if (collectTypical) typicalStrengths.push(strength);
      if (strength > peakStrength + 1e-9) {
        peakStrength = strength;
        bestWindow.t0 = t0;
        bestWindow.t1 = t1;
        bestWindow.left = left;
        bestWindow.found = true;
      }
    }
  };

  // Peak windows align to every attack regardless of total event count so adding distant light notes never lowers the peak.
  for (const winDur of durations) {
    const maxStart = Math.max(0, totalSec - winDur);
    const peakStarts: number[] = [0];
    for (const ev of validEvents) {
      const s = Math.max(0, Math.min(maxStart, ev.sec));
      if (s - peakStarts[peakStarts.length - 1] > 1e-6) peakStarts.push(s);
    }
    if (maxStart - peakStarts[peakStarts.length - 1] > 1e-6) peakStarts.push(maxStart);
    scanStarts(peakStarts, winDur, false);
  }

  // Typical and stamina effort sample active 1-second grid windows uniformly without event-density bias.
  const maxStart = Math.max(0, totalSec - typicalDur);
  const maxIntStart = Math.floor(maxStart + EPSILON);
  const gridStarts: number[] = [];
  let lastInt = -1;
  for (const ev of validEvents) {
    const firstT = Math.max(0, lastInt + 1, Math.floor(ev.sec - typicalDur));
    const lastT = Math.min(maxIntStart, Math.floor(ev.sec + EPSILON));
    if (!Number.isSafeInteger(firstT) || !Number.isSafeInteger(lastT)) continue;
    for (let t = firstT; t <= lastT; t++) {
      gridStarts.push(t);
    }
    if (lastT > lastInt) lastInt = lastT;
  }
  if (!gridStarts.length || maxStart - gridStarts[gridStarts.length - 1] > 1e-6) {
    gridStarts.push(maxStart);
  }
  scanStarts(gridStarts, typicalDur, true);

  const peakStats = bestWindow.found
    ? motorSliceStats(validEvents, measures, bestWindow.t0, bestWindow.t1, totalSec, bestWindow.left)
    : null;

  return {
    peakStrength: peakStats?.count ? peakStats.strength : 0,
    peakMeasures: peakStats?.count ? peakStats.writtenMeasures : [],
    peakDrivers: peakStats?.count ? peakStats.drivers : {},
    typicalStrength: median(typicalStrengths),
    activeWindowStrengths: typicalStrengths,
  };
}

function summarizeWindow(
  input: DifficultyInput,
  bars: readonly Bar[],
  start: number,
  end: number,
  profile: DifficultyProfile,
  isV3: boolean,
  sortedMotorEvents: readonly MotorEvent[],
  totalSec: number,
  motorStartIndex = 0,
): { window: DifficultyWindow; strengths: DifficultyAxes; windowDrivers: Record<DifficultyAxis, DriverWeights> } {
  const structural = profile === 'sightReading';
  const sums = { motor: 0, rhythm: 0, bimanual: 0, texture: 0, reading: 0 };
  const windowDrivers = axisRecord((): DriverWeights => ({}));
  let attacks = 0, polyrhythmCost = 0;
  const positionChanges: PositionChange[] = [];
  for (let i = start; i <= end; i++) {
    const bar = bars[i];
    const count = bar.hands.rh.length + bar.hands.lh.length;
    attacks += bar.attacks.length;
    polyrhythmCost = Math.max(polyrhythmCost, bar.polyrhythmCost);
    if (!structural) positionChanges.push(...bar.positionChanges);
    // Physical and register-dependent descriptors are excluded from the structural profile.
    if (!isV3) {
      sums.motor += structural ? count * 0.3 + bar.structuralMotion + bar.structuralShifts * 0.5
        : count * 0.22 + bar.speed + bar.motion + bar.positionChanges.length * 0.65 + bar.geometry * 0.2;
      mergeDrivers(windowDrivers.motor, bar.drivers.motor);
    }
    sums.rhythm += bar.rhythm;
    sums.bimanual += structural ? bar.structuralBimanual : bar.bimanual;
    const voiceWeight = input.voiceSource === 'written' ? 0.35 : (isV3 && input.voiceSource === 'unknown' ? 0.30 : 0.15);
    sums.texture += structural ? bar.structuralTexture : bar.texture + bar.voices * voiceWeight;
    const keyLoad = structural ? 0 : Math.abs(input.measures[i].fifths ?? 0) * 0.18;
    const clefLoad = isV3 && !structural ? (input.measures[i].clefChanges ?? 0) * 0.85 : 0;
    sums.reading += structural ? bar.chromatic * 0.55 : bar.chromatic * 0.55 + bar.reading + keyLoad + clefLoad;
    mergeDrivers(windowDrivers.rhythm, bar.drivers.rhythm);
    mergeDrivers(windowDrivers.bimanual, bar.drivers.bimanual);
    mergeDrivers(windowDrivers.texture, bar.drivers.texture);
    mergeDrivers(windowDrivers.reading, bar.drivers.reading);
    if (isV3 && !structural && (input.measures[i].pedalChanges ?? 0) >= 2 && (bar.texture > 0 || bar.voices > 0)) {
      const pedCost = Math.min(0.45, ((input.measures[i].pedalChanges ?? 0) - 1) * 0.15);
      sums.texture += pedCost;
      addDriver(windowDrivers.texture, 'pedal_control', pedCost);
    }
    if (!structural) {
      addDriver(windowDrivers.reading, 'key_signature', keyLoad);
      addDriver(windowDrivers.reading, 'clef_changes', clefLoad);
    }
  }
  const measures = input.measures.slice(start, end + 1);
  const quarters = input.measures[end].end - input.measures[start].start;
  const seconds = input.measures[end].endSec - input.measures[start].startSec;
  const safeSeconds = Number.isFinite(seconds) && seconds > EPSILON ? seconds : 0;

  let motorStrength: number;
  if (isV3) {
    const slice = motorSliceStats(
      sortedMotorEvents, input.measures, input.measures[start].startSec, input.measures[end].endSec, totalSec, motorStartIndex,
    );
    motorStrength = slice.strength;
    mergeDrivers(windowDrivers.motor, slice.drivers);
    const patternLoad = windowReadingPatternLoad(bars, start, end);
    sums.reading += patternLoad;
    addDriver(windowDrivers.reading, 'pattern_unpredictability', patternLoad);
  } else {
    motorStrength = sums.motor / (structural ? quarters : (safeSeconds || Math.max(0.25, quarters * 0.5))) / 3;
  }

  const bpm = safeSeconds > EPSILON ? (quarters / safeSeconds) * 60 : 120;
  const rhythmTempo = isV3 ? 1 + 0.15 * Math.tanh((bpm - 100) / 80) : 1;
  const bimanualTempo = isV3 ? 1 + 0.28 * Math.tanh((bpm - 100) / 70) : 1;

  const strengths: DifficultyAxes = {
    motor: motorStrength,
    rhythm: (sums.rhythm * rhythmTempo) / quarters / (isV3 ? RHYTHM_V3_DIVISOR : 0.9),
    bimanual: isV3
      ? (sums.bimanual * bimanualTempo) / quarters / BIMANUAL_V3_DIVISOR
      : (sums.bimanual * bimanualTempo) / measures.length / 3.25,
    texture: sums.texture / quarters / (isV3 ? TEXTURE_V3_DIVISOR : 1.1),
    reading: sums.reading / measures.length / (isV3 ? READING_V3_DIVISOR : 3),
  };
  const axes = axisRecord(axis => isV3 ? 100 * Math.max(0, strengths[axis]) / (1 + Math.max(0, strengths[axis])) : 100 * unit(strengths[axis]));
  const window: DifficultyWindow = {
    startMeasure: start + 1, endMeasure: end + 1, writtenMeasures: measures.map(m => m.writtenIndex + 1), attacks, polyrhythmCost,
    positionChanges: positionChanges.sort((a, b) => a.beat - b.beat), axes,
    score: axes.motor * 0.28 + axes.rhythm * 0.23 + axes.bimanual * 0.2 + axes.texture * 0.19 + axes.reading * 0.1,
  };
  return { window, strengths, windowDrivers };
}

function writtenVariety(measures: readonly DifficultyMeasure[], bars: readonly Bar[]) {
  const signatures = new Map<number, string>();
  const seenSignatures = new Set<string>();
  const uniqueTokens: string[] = [];
  measures.forEach((measure, i) => {
    if (signatures.has(measure.writtenIndex)) return;
    const attacks = bars[i].attacks.flatMap(attack => attack.notes.map(note => {
      return [round(note.start - measure.start), round(note.end - note.start), note.hand, note.midi % 12].join(':');
    })).sort();
    const signature = JSON.stringify([measure.groups, attacks, [...bars[i].rests].sort()]);
    if (!seenSignatures.has(signature)) {
      seenSignatures.add(signature);
      for (const attack of bars[i].attacks) uniqueTokens.push(attackPitchToken(attack));
    }
    signatures.set(measure.writtenIndex, signature);
  });
  return { total: signatures.size, unique: seenSignatures.size, uniqueTokens };
}

/** Takes a normalized timeline with ordered, positive-length measures. No app state is needed. */
export function estimateScoreDifficulty(
  input: DifficultyInput,
  profile: DifficultyProfile,
  options?: DifficultyOptions,
): DifficultyEstimate {
  const estimatorVersion: 1 | 2 | 3 = options?.rubricVersion === 1 ? 1 : ESTIMATOR_VERSION;
  const isV3 = estimatorVersion >= 2 && profile === 'performance';
  const bars = input.measures.map(emptyBar), groups = input.measures.map(metricGroups);
  const { hands, unassigned } = attacksFor(input.notes);
  for (const line of [hands.rh, hands.lh, unassigned]) {
    const isUniform = new Uint8Array(line.length);
    let runStart = 0;
    while (runStart + 1 < line.length) {
      const baseIoi = line[runStart + 1].start - line[runStart].start;
      if (baseIoi <= EPSILON) {
        runStart++;
        continue;
      }
      let runEnd = runStart + 1;
      while (
        runEnd + 1 < line.length &&
        Math.abs((line[runEnd + 1].start - line[runEnd].start) - baseIoi) < 0.02
      ) {
        runEnd++;
      }
      if (runEnd - runStart >= 3) {
        for (let k = runStart; k <= runEnd; k++) isUniform[k] = 1;
      }
      runStart = runEnd;
    }
    let harmonicGroupEnd: number | undefined;
    const lastSyncBar = new Map<string, number>();
    for (let idx = 0; idx < line.length; idx++) {
      const attack = line[idx];
      const i = measureAt(input.measures, attack.start);
      if (i < 0) continue;
      const uniformSubdivision = isUniform[idx] === 1;
      const onBoundary = groups[i].some(start => Math.abs(start - attack.start) < EPSILON);
      const suppressSyncopation = isV3 &&
        !onBoundary &&
        attack.notes.length === 1 &&
        harmonicGroupEnd !== undefined &&
        attack.start < harmonicGroupEnd - EPSILON &&
        Math.abs(attack.end - harmonicGroupEnd) < 0.02;
      const offsetKey = String(round(attack.start - input.measures[i].start));
      const prevSync = lastSyncBar.get(offsetKey);
      const syncDiscount = prevSync !== undefined && i - prevSync > 0 && i - prevSync <= 2 ? 0.45 : 1;
      const isSync = annotateAttack(
        attack, input.measures[i], groups[i], bars[i], isV3,
        { uniformSubdivision, syncDiscount, suppressSyncopation },
      );
      if (isSync) lastSyncBar.set(offsetKey, i);
      if (onBoundary) harmonicGroupEnd = attack.end;
      else if (harmonicGroupEnd !== undefined && attack.start >= harmonicGroupEnd - EPSILON) harmonicGroupEnd = undefined;
    }
  }
  for (const rest of input.rests) {
    if (!rest.active) continue;
    const i = measureAt(input.measures, rest.start);
    if (i < 0) continue;
    bars[i].rhythm += 0.45;
    addDriver(bars[i].drivers.rhythm, 'active_rests', 0.45);
    bars[i].rests.push([round(rest.start - input.measures[i].start), round(rest.end - rest.start), rest.hand].join(':'));
  }

  const motorEvents: MotorEvent[] = [];
  let maxHandSpan = 0;
  for (const hand of HANDS) {
    const span = annotateHand(hands[hand], hand, input, bars, profile, isV3, motorEvents);
    if (span > maxHandSpan) maxHandSpan = span;
  }
  if (isV3) {
    for (const attack of unassigned) {
      const i = measureAt(input.measures, attack.start);
      if (i < 0) continue;
      const physical = pitchRange(attack, false);
      const handSpan = physical ? physical[1] - physical[0] : 0;
      if (handSpan > maxHandSpan) maxHandSpan = handSpan;
      const drivers: DriverWeights = {};
      let cost = 0.14;
      if (handSpan >= 10) {
        const spanCost = handSpan >= 12 ? 0.64 + (handSpan - 11) * 0.55 : (handSpan - 9) * 0.32;
        cost += spanCost;
        addDriver(drivers, 'wide_span', spanCost);
      }
      const trillsCount = attack.notes.reduce((sum, note) => sum + (note.trills ?? 0), 0);
      if (trillsCount > 0) {
        const trillCost = Math.min(2, trillsCount) * 0.9;
        cost += trillCost;
        addDriver(drivers, 'trills', trillCost);
      }
      const totalOrnaments = attack.notes.reduce((sum, note) => sum + (note.ornaments ?? 0), 0);
      const nonTrillOrnaments = Math.max(0, totalOrnaments - trillsCount);
      if (nonTrillOrnaments > 0) {
        const ornMotor = Math.min(2, nonTrillOrnaments) * 0.40;
        cost += ornMotor;
        addDriver(drivers, 'ornaments', ornMotor);
      }
      motorEvents.push({ sec: attack.sec, measureIndex: i, hand: null, cost, drivers });
    }
    input.measures.forEach((measure, i) => {
      if (!bars[i].hasSound) return;
      if (isAsymmetricMeter(measure)) {
        bars[i].rhythm += 0.65;
        addDriver(bars[i].drivers.rhythm, 'asymmetric_meter', 0.65);
      }
      if (i > 0 && meterSignature(measure) !== meterSignature(input.measures[i - 1])) {
        bars[i].rhythm += 0.75;
        addDriver(bars[i].drivers.rhythm, 'meter_changes', 0.75);
      }
    });
  }
  annotateCoordination(bars, input, groups, isV3);

  const totalMeasureSec = input.measures.at(-1)?.endSec ?? 0;
  const sortedMotorEvents = isV3 ? [...motorEvents].sort((a, b) => a.sec - b.sec) : [];
  const physicalMotor = isV3 ? evaluatePhysicalMotorWindows(sortedMotorEvents, input.measures, totalMeasureSec) : null;

  const lengths = [...new Set([Math.min(2, bars.length), Math.min(4, bars.length)])].filter(Boolean);
  const typicalLength = lengths.at(-1);
  const typicalScores: number[] = [];
  const typicalAxes = axisRecord((): number[] => []);
  const axisPeaks = axisRecord((): { strength: number; measures: readonly number[]; drivers: DriverWeights } | null => null);
  let peak: DifficultyWindow | null = null;
  for (const length of lengths) {
    let motorCursor = 0;
    let prevStartSec = -Infinity;
    for (let start = 0; start + length <= bars.length; start++) {
      const end = start + length - 1;
      if (!bars.slice(start, end + 1).some(bar => bar.hasSound)) continue;
      const windowStartSec = input.measures[start].startSec;
      if (windowStartSec < prevStartSec - EPSILON) motorCursor = 0;
      prevStartSec = windowStartSec;
      while (motorCursor < sortedMotorEvents.length && sortedMotorEvents[motorCursor].sec < windowStartSec - EPSILON) {
        motorCursor++;
      }
      const { window, strengths, windowDrivers } = summarizeWindow(
        input, bars, start, end, profile, isV3, sortedMotorEvents, totalMeasureSec, motorCursor,
      );
      if (!peak || window.score > peak.score) peak = window;
      if (length === typicalLength) typicalScores.push(window.score);
      for (const axis of DIFFICULTY_AXES) {
        const previous = axisPeaks[axis];
        if (!previous || previous.strength < strengths[axis]) {
          axisPeaks[axis] = { strength: strengths[axis], measures: window.writtenMeasures, drivers: windowDrivers[axis] };
        }
        if (length === typicalLength) typicalAxes[axis].push(strengths[axis]);
      }
    }
  }
  if (isV3 && physicalMotor && peak) {
    axisPeaks.motor = {
      strength: physicalMotor.peakStrength,
      measures: physicalMotor.peakMeasures,
      drivers: physicalMotor.peakDrivers,
    };
  }

  const typical = median(typicalScores);
  const { total, unique, uniqueTokens } = writtenVariety(input.measures, bars);
  const playedSeconds = input.playedDurationSec ?? totalMeasureSec;
  const durationBonus = Number.isFinite(playedSeconds) && playedSeconds > 60 && playedSeconds <= MAX_SAFE_WINDOW_SEC
    ? Math.log2(playedSeconds / 60)
    : 0;

  let stamina = 0;
  let materialLoad = 0;
  let enduranceRaw = 0;
  let endurance = 0;
  if (profile === 'performance' && peak) {
    if (isV3 && physicalMotor) {
      const highEffortCount = physicalMotor.peakStrength >= 0.25
        ? physicalMotor.activeWindowStrengths.filter(s => s >= 0.65 * physicalMotor.peakStrength).length
        : 0;
      const highEffortRatio = physicalMotor.activeWindowStrengths.length
        ? highEffortCount / physicalMotor.activeWindowStrengths.length
        : 0;
      stamina = highEffortRatio * durationBonus * (0.35 + 0.65 * unit((physicalMotor.peakStrength - 0.35) / 1.25));
      materialLoad = Math.log2(1 + unique / 16) * (0.65 + 0.35 * normalizedLzExcess(uniqueTokens));
      enduranceRaw = Math.min(0.5, 0.12 * stamina + 0.09 * materialLoad);
      endurance = enduranceRaw * 12;
    } else {
      endurance = Math.min(6, 1.5 * durationBonus * unique / total + 1.2 * Math.log2(1 + unique / 16));
      enduranceRaw = unit(endurance / 6) * 0.5;
    }
  }

  const peakWeight = profile === 'performance' ? 0.68 : 0.58;
  const score = Math.min(100, peakWeight * (peak?.score ?? 0) + (1 - peakWeight) * typical + endurance);
  const continuousStars = axisRecord(axis => {
    const typicalStrength = isV3 && axis === 'motor' && physicalMotor
      ? physicalMotor.typicalStrength
      : median(typicalAxes[axis]);
    return axisStars(peakWeight * (axisPeaks[axis]?.strength ?? 0) + (1 - peakWeight) * typicalStrength, isV3);
  });
  const axisDifficulty = peak && axisRecord(axis => ({
    stars: roundStars(continuousStars[axis]),
    measures: axisPeaks[axis]?.strength ? axisPeaks[axis]?.measures ?? [] : [],
    drivers: axisPeaks[axis]?.strength ? topDrivers(axisPeaks[axis]?.drivers ?? {}) : [],
  }));
  const aggregation = options?.aggregation ?? DEFAULT_AGGREGATION;
  const aggregated = peak ? aggregateDifficultyStarsDetailed(continuousStars, enduranceRaw, aggregation) : null;
  const handSource: HandSource = input.handSource ?? (unassigned.length > 0 ? 'unassigned' : 'written');
  return {
    estimatorVersion,
    profile,
    score: round(score),
    peak,
    typical: round(typical),
    endurance: round(endurance),
    enduranceRaw,
    baseStars: aggregated ? aggregated.baseStars : null,
    appliedEnduranceStars: aggregated ? aggregated.appliedEnduranceStars : 0,
    spanAlert: isV3 ? maxHandSpan >= 12 : false,
    enduranceComponents: isV3 ? { stamina: round(stamina), materialLoad: round(materialLoad) } : { stamina: 0, materialLoad: 0 },
    difficultyStars: aggregated ? aggregated.difficultyStars : null,
    continuousAxisStars: peak ? continuousStars : null,
    axisDifficulty,
    uniqueWrittenMeasures: unique,
    uncertainty: {
      tempoFallback: input.tempoSource === 'fallback',
      voicesInferred: input.voiceSource === 'inferred',
      handsUnassigned: unassigned.length > 0,
      tempoSource: input.tempoSource,
      voiceSource: input.voiceSource,
      handSource,
    },
  };
}

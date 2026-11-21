import { techniqueSteps } from './technique.js';

/** Experimental estimates of score difficulty. This module does not score a player's performance. */
export type DifficultyHand = 'rh' | 'lh';
export type DifficultyProfile = 'performance' | 'sightReading';
export type TempoSource = 'written' | 'reference' | 'fallback';
export type VoiceSource = 'written' | 'inferred' | 'unknown';
export type HandSource = 'written' | 'track' | 'pitchSplit' | 'unassigned';
export type NoteArticulation = 'staccato' | 'accent' | 'tenuto';
export type DifficultyDriver =
  | 'speed' | 'large_leaps' | 'wide_span' | 'position_shifts' | 'rapid_repeats' | 'trills'
  | 'syncopation' | 'tuplets' | 'fast_subdivisions' | 'meter_changes' | 'asymmetric_meter' | 'active_rests'
  | 'polyrhythm' | 'hand_independence' | 'contrary_motion' | 'hand_crossing' | 'mixed_articulation'
  | 'dense_chords' | 'two_hand_chords' | 'polyphonic_voices' | 'chord_changes'
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

export const DIFFICULTY_AXES = ['motor', 'rhythm', 'bimanual', 'texture', 'reading'] as const;
export type DifficultyAxis = typeof DIFFICULTY_AXES[number];

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
  estimatorVersion: 1 | 2;
  profile: DifficultyProfile;
  score: number;
  peak: DifficultyWindow | null;
  typical: number;
  difficultyStars: number | null;
  axisDifficulty: Readonly<Record<DifficultyAxis, { stars: number; measures: readonly number[] }>> | null;
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
const unit = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number) => Math.round(value * 100) / 100;
// At the original axis ceiling the star scale is halfway through its range.
// Stronger passages continue to separate instead of all receiving the maximum.
const axisStars = (strength: number) => 5 - 4 / (1 + Math.max(0, strength));
const roundStars = (value: number) => Math.round(Math.min(5, Math.max(1, value)) * 10) / 10;

export function aggregateDifficultyStars(axes: DifficultyAxes, endurance = 0): number {
  const [first, second, ...others] = DIFFICULTY_AXES.map(axis => axes[axis]).sort((a, b) => b - a);
  const average = first * 0.45 + second * 0.30 + others.reduce((sum, stars) => sum + stars, 0) / 3 * 0.25;
  return roundStars(Math.max(first - 1, average) + unit(endurance / 6) * 0.5);
}

function axisRecord<T>(make: (axis: DifficultyAxis) => T): Record<DifficultyAxis, T> {
  return { motor: make('motor'), rhythm: make('rhythm'), bimanual: make('bimanual'), texture: make('texture'), reading: make('reading') };
}

function median(values: number[]): number {
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length ? (values[middle] + values[Math.floor((values.length - 1) / 2)]) / 2 : 0;
}

interface Attack {
  start: number;
  end: number;
  sec: number;
  notes: DifficultyNote[];
  direction: number;
  structuralDirection: number;
}

interface Bar {
  attacks: Attack[];
  hands: Record<DifficultyHand, Attack[]>;
  heldUntil: Record<DifficultyHand, number>;
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
}

function emptyBar(): Bar {
  return {
    attacks: [], hands: { rh: [], lh: [] }, heldUntil: { rh: 0, lh: 0 },
    speed: 0, motion: 0, positionChanges: [], geometry: 0, structuralMotion: 0, structuralShifts: 0,
    rhythm: 0, texture: 0, structuralTexture: 0, voices: 0, reading: 0,
    chromatic: 0, bimanual: 0, structuralBimanual: 0, polyrhythmCost: 0, rests: [], hasSound: false,
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

function annotateAttack(attack: Attack, measure: DifficultyMeasure, groups: readonly number[], bar: Bar) {
  bar.attacks.push(attack);
  bar.hasSound = true;
  const isSyncopated = attack.notes.some(note => syncopated(note, measure, groups));
  const tiedAcrossBar = attack.notes.some(note => note.tiedAcrossBar);
  bar.rhythm += isSyncopated ? 1.1 : tiedAcrossBar ? 0.45 : 0;
  if (attack.notes.some(note => note.dotted)) bar.rhythm += 0.35;
  if (attack.notes.some(note => note.tuplet)) bar.rhythm += 0.7;
  const shortest = Math.min(...attack.notes.map(note => note.end - note.start));
  bar.rhythm += shortest <= 0.25 ? 0.45 : shortest <= 0.5 ? 0.15 : 0;
  const pitches = new Set(attack.notes.map(note => note.midi));
  const span = Math.max(...pitches) - Math.min(...pitches);
  bar.structuralTexture += Math.max(0, pitches.size - 1) * 0.45;
  bar.texture += Math.max(0, pitches.size - 1) * 0.2 + Math.max(0, span - 7) * 0.22;
  for (const note of attack.notes) {
    bar.chromatic += note.accidentals ?? 0;
    bar.reading += (note.ledgerLines ?? 0) * 0.25 + Math.min(2, note.ornaments ?? 0) * 0.35;
  }
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

function annotateHand(line: readonly Attack[], hand: DifficultyHand, input: DifficultyInput, bars: Bar[], profile: DifficultyProfile) {
  let previous: Attack | undefined;
  let physicalPosition: Range | null = null, structuralPosition: Range | null = null;
  const heldVoices = new Map<string, number>();
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
    if (previous && prevPhysical && physical) {
      const dt = attack.sec - previous.sec;
      const speed = unit((0.28 - dt) / 0.12) + unit((0.16 - dt) / 0.06);
      const low = physical[0] - prevPhysical[0], high = physical[1] - prevPhysical[1];
      const jump = Math.min(Math.abs(low), Math.abs(high));
      const outerJump = Math.max(Math.abs(low), Math.abs(high));
      attack.direction = Math.sign(hand === 'rh' ? high : low);
      bar.speed += speed;
      bar.motion += Math.max(0, jump - 4) * (1 + unit((0.48 - dt) / 0.32)) * 0.24;
      const crosses = thumbCrossing(previous, attack, fingers[i - 1], fingers[i], hand);
      const next: Range = crosses ? physical : position(physicalPosition, physical, 8);
      if (crosses || (next === physical && rangeChanged(prevPhysical, physical))) {
        const bothWritten = writtenFinger(previous) !== undefined && writtenFinger(attack) !== undefined;
        const reason = crosses ? (bothWritten ? 'writtenThumb' : 'inferredThumb') : 'span';
        bar.positionChanges.push({ hand, beat: attack.start, reason });
      }
      physicalPosition = next;
      if (attack.notes.length > 1 || previous.notes.length > 1) {
        // An inversion can change the grip even when the outer notes stay in place.
        const changed = attack.notes.length !== previous.notes.length ||
          attack.notes.some((note, i) => note.midi !== previous?.notes[i]?.midi);
        if (changed) bar.texture += 0.3 + outerJump * 0.06 * (1 + speed);
      }
      const anchor = hand === 'rh' ? 1 : 0;
      if (BLACK_KEYS.has(physical[anchor] % 12) !== BLACK_KEYS.has(prevPhysical[anchor] % 12)) {
        bar.geometry += unit((0.30 - dt) / 0.15);
      }
    } else {
      physicalPosition = physical;
    }
    if (prevStructural && structural) {
      const anchor = hand === 'rh' ? 1 : 0;
      const delta = structural[anchor] - prevStructural[anchor];
      attack.structuralDirection = Math.sign(delta);
      bar.structuralMotion += Math.max(0, Math.abs(delta) - 1) ** 1.25;
      const next = position(structuralPosition, structural, 4);
      if (next === structural && rangeChanged(prevStructural, structural)) bar.structuralShifts++;
      structuralPosition = next;
    } else {
      structuralPosition = structural;
    }

    // Count only distinct identified voices. Inference from MIDI belongs to the adapter.
    const voices = new Set(attack.notes.flatMap(note => note.voice === undefined ? [] : [note.voice]));
    for (const [voice, end] of heldVoices) {
      if (end <= attack.start + EPSILON) heldVoices.delete(voice);
    }
    if (voices.size > 1 || (voices.size > 0 && [...heldVoices.keys()].some(voice => !voices.has(voice)))) bar.voices++;
    for (const note of attack.notes) {
      if (note.voice !== undefined) heldVoices.set(note.voice, Math.max(note.end, heldVoices.get(note.voice) ?? 0));
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

function polyrhythm(bar: Bar, measure: DifficultyMeasure, groups: readonly number[]) {
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
    if (!right || !left) continue;
    const common = gcd(right, left);
    const a = right / common, b = left / common;
    if (a > 1 && b > 1) strongest = Math.max(strongest, Math.log2(a * b));
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

function annotateCoordination(bars: readonly Bar[], input: DifficultyInput, groups: readonly number[][]) {
  let previousSolo: DifficultyHand | null = null;
  bars.forEach((bar, i) => {
    const { rh, lh } = bar.hands;
    const measure = input.measures[i];
    const rightActive = rh.length > 0 || bar.heldUntil.rh > measure.start;
    const leftActive = lh.length > 0 || bar.heldUntil.lh > measure.start;
    if (!rightActive || !leftActive) {
      const solo = rightActive ? 'rh' : leftActive ? 'lh' : null;
      if (solo && previousSolo && solo !== previousSolo) bar.bimanual = bar.structuralBimanual = 0.4;
      previousSolo = solo;
      return;
    }
    previousSolo = null;
    if (!handsOverlap(bar, measure)) {
      bar.bimanual = bar.structuralBimanual = 0.4; // both play in the measure, but take turns
      return;
    }
    let shared = 0, contrary = 0, structuralContrary = 0;
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
        }
        r++;
        l++;
      } else if (delta < 0) r++;
      else l++;
    }
    const moving = Math.min(rh.length, lh.length) > 1;
    const total = rh.length + lh.length;
    const independent = moving && total > 0 ? (total - 2 * shared) / total : 0;
    bar.polyrhythmCost = moving ? polyrhythm(bar, measure, groups[i]) : 0;
    const coordination = (moving ? 0.35 : 0.18) + independent + bar.polyrhythmCost * 0.55;
    bar.bimanual = coordination + contrary * 0.18;
    bar.structuralBimanual = coordination + structuralContrary * 0.18;
  });
}

function summarizeWindow(input: DifficultyInput, bars: readonly Bar[], start: number, end: number, profile: DifficultyProfile): { window: DifficultyWindow; strengths: DifficultyAxes } {
  const structural = profile === 'sightReading';
  const sums = { motor: 0, rhythm: 0, bimanual: 0, texture: 0, reading: 0 };
  let attacks = 0, polyrhythmCost = 0;
  const positionChanges: PositionChange[] = [];
  for (let i = start; i <= end; i++) {
    const bar = bars[i];
    const count = bar.hands.rh.length + bar.hands.lh.length;
    attacks += bar.attacks.length;
    polyrhythmCost = Math.max(polyrhythmCost, bar.polyrhythmCost);
    if (!structural) positionChanges.push(...bar.positionChanges);
    // Physical and register-dependent descriptors are excluded from the structural profile.
    sums.motor += structural ? count * 0.3 + bar.structuralMotion + bar.structuralShifts * 0.5
      : count * 0.22 + bar.speed + bar.motion + bar.positionChanges.length * 0.65 + bar.geometry * 0.2;
    sums.rhythm += bar.rhythm;
    sums.bimanual += structural ? bar.structuralBimanual : bar.bimanual;
    sums.texture += structural ? bar.structuralTexture : bar.texture + bar.voices * (input.voiceSource === 'written' ? 0.35 : 0.15);
    sums.reading += structural ? bar.chromatic * 0.55
      : bar.chromatic * 0.55 + bar.reading + Math.abs(input.measures[i].fifths ?? 0) * 0.18;
  }
  const measures = input.measures.slice(start, end + 1);
  const quarters = input.measures[end].end - input.measures[start].start;
  const seconds = input.measures[end].endSec - input.measures[start].startSec;
  // Initial, uncalibrated rubric. Each axis is bounded before aggregation.
  const strengths = {
    motor: sums.motor / (structural ? quarters : seconds) / 3,
    rhythm: sums.rhythm / quarters / 0.9,
    bimanual: sums.bimanual / measures.length / 3.25,
    texture: sums.texture / quarters / 1.1,
    reading: sums.reading / measures.length / 3,
  };
  const axes = axisRecord(axis => 100 * unit(strengths[axis]));
  const window = {
    startMeasure: start + 1, endMeasure: end + 1, writtenMeasures: measures.map(m => m.writtenIndex + 1), attacks, polyrhythmCost, positionChanges: positionChanges.sort((a, b) => a.beat - b.beat), axes,
    score: axes.motor * 0.28 + axes.rhythm * 0.23 + axes.bimanual * 0.2 + axes.texture * 0.19 + axes.reading * 0.1,
  };
  return { window, strengths };
}

function writtenVariety(measures: readonly DifficultyMeasure[], bars: readonly Bar[]) {
  const signatures = new Map<number, string>();
  measures.forEach((measure, i) => {
    if (signatures.has(measure.writtenIndex)) return;
    const attacks = bars[i].attacks.flatMap(attack => attack.notes.map(note => {
      return [round(note.start - measure.start), round(note.end - note.start), note.hand, note.midi % 12].join(':');
    })).sort();
    signatures.set(measure.writtenIndex, JSON.stringify([measure.groups, attacks, [...bars[i].rests].sort()]));
  });
  return { total: signatures.size, unique: new Set(signatures.values()).size };
}

/** Takes a normalized timeline with ordered, positive-length measures. No app state is needed. */
export function estimateScoreDifficulty(input: DifficultyInput, profile: DifficultyProfile, options?: { rubricVersion?: 1 | 2 }): DifficultyEstimate {
  const estimatorVersion: 1 | 2 = options?.rubricVersion === 2 ? 1 : 1;
  const bars = input.measures.map(emptyBar), groups = input.measures.map(metricGroups);
  const { hands, unassigned } = attacksFor(input.notes);
  for (const attack of [...hands.rh, ...hands.lh, ...unassigned]) {
    const i = measureAt(input.measures, attack.start);
    if (i >= 0) annotateAttack(attack, input.measures[i], groups[i], bars[i]);
  }
  for (const rest of input.rests) {
    if (!rest.active) continue;
    const i = measureAt(input.measures, rest.start);
    if (i < 0) continue;
    bars[i].rhythm += 0.45;
    bars[i].rests.push([round(rest.start - input.measures[i].start), round(rest.end - rest.start), rest.hand].join(':'));
  }
  for (const hand of HANDS) annotateHand(hands[hand], hand, input, bars, profile);
  annotateCoordination(bars, input, groups);

  const lengths = [...new Set([Math.min(2, bars.length), Math.min(4, bars.length)])].filter(Boolean);
  const typicalLength = lengths.at(-1);
  const typicalScores: number[] = [];
  const typicalAxes = axisRecord((): number[] => []);
  const axisPeaks = axisRecord((): { strength: number; measures: readonly number[] } | null => null);
  let peak: DifficultyWindow | null = null;
  for (const length of lengths) {
    for (let start = 0; start + length <= bars.length; start++) {
      const end = start + length - 1;
      if (!bars.slice(start, end + 1).some(bar => bar.hasSound)) continue;
      const { window, strengths } = summarizeWindow(input, bars, start, end, profile);
      if (!peak || window.score > peak.score) peak = window;
      if (length === typicalLength) typicalScores.push(window.score);
      for (const axis of DIFFICULTY_AXES) {
        const previous = axisPeaks[axis];
        if (!previous || previous.strength < strengths[axis]) axisPeaks[axis] = { strength: strengths[axis], measures: window.writtenMeasures };
        if (length === typicalLength) typicalAxes[axis].push(strengths[axis]);
      }
    }
  }
  const typical = median(typicalScores);
  const { total, unique } = writtenVariety(input.measures, bars);
  const playedSeconds = input.playedDurationSec ?? input.measures.at(-1)?.endSec ?? 0;
  const durationBonus = playedSeconds > 60 ? Math.log2(playedSeconds / 60) : 0;
  const endurance = profile === 'performance' && peak
    ? Math.min(6, 1.5 * durationBonus * unique / total + 1.2 * Math.log2(1 + unique / 16)) : 0;
  const peakWeight = profile === 'performance' ? 0.68 : 0.58;
  const score = Math.min(100, peakWeight * (peak?.score ?? 0) + (1 - peakWeight) * typical + endurance);
  const continuousStars = axisRecord(axis => axisStars(peakWeight * (axisPeaks[axis]?.strength ?? 0) +
    (1 - peakWeight) * median(typicalAxes[axis])));
  const axisDifficulty = peak && axisRecord(axis => ({
    stars: roundStars(continuousStars[axis]),
    measures: axisPeaks[axis]?.strength ? axisPeaks[axis]?.measures ?? [] : [],
  }));
  const handSource: HandSource = input.handSource ?? (unassigned.length > 0 ? 'unassigned' : 'written');
  return {
    estimatorVersion,
    profile, score: round(score), peak, typical: round(typical), endurance: round(endurance), uniqueWrittenMeasures: unique,
    difficultyStars: peak ? aggregateDifficultyStars(continuousStars, endurance) : null, axisDifficulty,
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

// The generator for reading levels 1 to 8. It writes a piece in scale degrees (rhythm, chord plan, melody, second
// hand), spells it in the key, and keeps it only when every rule of rules.ts holds.
// The same level, key and seed always give the same piece (rule G1).
import {
  srtDeepFreeze, srtDegreePitch, srtLevel, srtMeterTicks, srtPitchPlace, srtReadingKey,
  type ReadingKey, type ReadingLevel, type ReadingMeter,
} from './levels.js';
import type { SightReadingEvent, SightReadingHand } from './model.js';
import { srtBarPatterns, srtChordTones, type PlannedPiece } from './patterns.js';
import { srtChordBeats, srtDifficulty, srtPhraseBars, srtRuleViolations, type GeneratedPiece } from './rules.js';

export type GenerateOptions = {
  /** A narrower difficulty range than the band of the level. */
  readonly band?: readonly [number, number];
  /** Called for every attempt that was dropped, with the reason: for tuning and tests. */
  readonly trace?: (reason: string) => void;
};

const MAX_ATTEMPTS = 600;
const HALF = 960;
const QUARTER = 480;
const EIGHTH = 240;
const SIXTEENTH = 120;
const CONSONANT = [0, 2, 4, 5];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];
const mod7 = (value: number): number => ((value % 7) + 7) % 7;

type Random = () => number;

function mulberry32(seed: number): Random {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a, 32 bits: turns a text into a seed. */
export function srtHashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const pick = <T>(random: Random, list: readonly T[]): T => list[Math.floor(random() * list.length)];

function weighted<T>(random: Random, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((sum, item) => sum + item[1], 0);
  let at = random() * total;
  for (const [value, weight] of items) {
    at -= weight;
    if (at < 0) return value;
  }
  return items[items.length - 1][0];
}

/** A weighted shuffle: heavier items tend to come first. */
function ordered<T>(random: Random, items: readonly (readonly [T, number])[]): T[] {
  return items.map(([value, weight]) => ({ value, key: Math.pow(random(), 1 / Math.max(weight, 1e-6)) }))
    .sort((a, b) => b.key - a.key).map((item) => item.value);
}

// ---------------------------------------------------------------- rhythm

const TICKS: Readonly<Record<string, number>> = { w: 1920, dh: 1440, h: 960, dq: 720, q: 480, e: 240, s: 120 };
/** A bar rhythm. A negative number is a rest. `min` is the first level that may use it, `feature` the level it shows off. */
type Cell = { readonly ticks: readonly number[]; readonly min: number; readonly feature: number };
const cell = (min: number, text: string, feature = 0): Cell => ({
  min, feature, ticks: text.split(' ').map((token) => (token.startsWith('-') ? -TICKS[token.slice(1)] : TICKS[token])),
});

const BODY: Readonly<Record<string, readonly Cell[]>> = {
  '4/4': [
    cell(1, 'q q q q'), cell(2, 'h h'), cell(1, 'h q q'), cell(1, 'q q h'),
    cell(2, 'dh q', 2), cell(2, 'q q q -q', 2), cell(2, 'h q -q', 2),
    cell(3, 'e e q q q', 3), cell(3, 'q q e e q', 3), cell(3, 'e e q h', 3), cell(3, 'q e e h', 3), cell(3, 'e e e e h', 3), cell(3, 'e e q e e q', 3),
    cell(5, 'dq e q q', 5), cell(5, 'dq e h', 5), cell(5, 'q q dq e', 5), cell(5, 'dq e dq e', 5), cell(5, 'dq e e e q', 5),
    cell(6, 's s s s q h', 6), cell(6, 'q s s s s h', 6), cell(6, 's s s s e e h', 6), cell(6, 'e s s q h', 6), cell(6, 's s s s q q q', 6), cell(6, 'e e s s s s q q', 6), cell(6, 'e e e e e e e e', 6),
    cell(8, 'e q e h', 8), cell(8, 'e q e q q', 8), cell(8, 'q h q', 8), cell(8, 'e q q q e', 8), cell(8, 'q q e q e', 8),
  ],
  '3/4': [
    cell(2, 'q q q'), cell(2, 'h q'), cell(2, 'q h'), cell(2, 'q q -q', 2),
    cell(3, 'e e q q', 3), cell(3, 'q e e q', 3), cell(3, 'h e e', 3), cell(3, 'e e e e q', 3), cell(3, 'q q e e', 3),
    cell(5, 'dq e q', 5),
    cell(6, 's s s s q q', 6), cell(6, 'q s s s s q', 6), cell(6, 'e s s q q', 6),
    cell(8, 'e q e q', 8), cell(8, 'e q q e', 8),
  ],
  '2/4': [
    cell(3, 'q q'), cell(3, 'e e q', 3), cell(3, 'q e e', 3), cell(3, 'e e e e', 3),
    cell(5, 'dq e', 5),
    cell(6, 's s s s q', 6), cell(6, 'e s s q', 6), cell(6, 's s s s e e', 6),
    cell(8, 'e q e', 8),
  ],
  '3/8': [
    cell(6, 'e e e'), cell(6, 'q e'), cell(6, 'e q'), cell(6, 's s e e', 6), cell(6, 'e s s e', 6), cell(6, 's s s s e', 6),
  ],
  '6/8': [
    cell(7, 'e e e e e e'), cell(7, 'q e q e'), cell(7, 'dq e e e'), cell(7, 'e e e dq'), cell(7, 'q e dq'), cell(7, 'dq q e'), cell(7, 'dq dq'),
    cell(8, 'q q q', 8),
  ],
};
/** The last bar: it ends on a long note. */
const FINAL: Readonly<Record<string, readonly Cell[]>> = {
  '4/4': [cell(1, 'q q h'), cell(1, 'h h'), cell(1, 'w')],
  '3/4': [cell(2, 'dh'), cell(2, 'q h')],
  '2/4': [cell(3, 'h')],
  '3/8': [cell(6, 'dq')],
  '6/8': [cell(7, 'dh')],
};
/** The last bar of a phrase that is not the last: it comes to rest, but not on the tonic. */
const HALF_CLOSE: Readonly<Record<string, readonly Cell[]>> = {
  '4/4': [cell(1, 'q q h'), cell(1, 'h h'), cell(2, 'h q -q'), cell(3, 'e e q h')],
  '3/4': [cell(2, 'q h'), cell(2, 'dh')],
  '2/4': [cell(3, 'h'), cell(3, 'q q')],
  '3/8': [cell(6, 'dq'), cell(6, 'q e')],
  '6/8': [cell(7, 'dq dq'), cell(7, 'q e dq'), cell(7, 'dh')],
};
/** An upbeat bar: rests, then the notes that lead into the first full bar. */
const UPBEAT: Readonly<Record<string, readonly Cell[]>> = {
  '4/4': [cell(7, '-h -q q'), cell(7, '-h -q e e')],
  '3/4': [cell(7, '-h q'), cell(7, '-h e e')],
  '2/4': [cell(7, '-q q'), cell(7, '-q e e')],
  '3/8': [cell(7, '-q e')],
  '6/8': [cell(7, '-dq -q e')],
};
const METER_WEIGHT: Readonly<Record<string, number>> = { '4/4': 4, '3/4': 2, '2/4': 1.5, '3/8': 1.5, '6/8': 2.5 };
const meterKey = (meter: ReadingMeter): string => `${meter.num}/${meter.den}`;

function planRhythm(level: ReadingLevel, meter: ReadingMeter, bars: number, upbeat: boolean, repeat: boolean, random: Random): readonly (readonly number[])[] {
  const key = meterKey(meter);
  const usable = (cells: readonly Cell[]): readonly Cell[] => cells.filter((item) => item.min <= level.id);
  const body = usable(BODY[key]);
  const features = body.filter((item) => item.feature === level.id);
  const first = features.length > 0 && random() < 0.65 ? pick(random, features) : pick(random, body);
  const second = repeat || random() < 0.25 ? first : features.length > 0 && first.feature !== level.id && random() < 0.6 ? pick(random, features) : pick(random, body);
  const third = pick(random, body);
  const halfClose = pick(random, usable(HALF_CLOSE[key]));
  const final = pick(random, usable(FINAL[key]));
  const phrase = srtPhraseBars(bars);
  const out: (readonly number[])[] = [];
  for (let start = 0; start < bars; start += phrase) {
    const last = start + phrase >= bars;
    const close = last ? final : halfClose;
    if (phrase === 2) out.push(first.ticks, last ? final.ticks : second.ticks);
    else if (phrase === 3) out.push(first.ticks, second.ticks, close.ticks);
    else if (start === 0 || last) out.push(first.ticks, second.ticks, (last && random() < 0.5 ? second : first).ticks, close.ticks);
    else out.push(first.ticks, third.ticks, first.ticks, close.ticks);
  }
  if (upbeat) out.splice(0, 4, pick(random, usable(UPBEAT[key])).ticks, first.ticks, second.ticks, halfClose.ticks);
  return out;
}

// ---------------------------------------------------------------- chords

type ChordBars = readonly (readonly number[])[];
const OPEN2: readonly ChordBars[] = [[[0], [4]], [[0], [3, 4]], [[0], [0, 4]], [[0], [3]], [[0], [0]]];
const CLOSE2: readonly ChordBars[] = [[[4], [0]], [[3, 4], [0]], [[0, 4], [0]]];
const OPEN3: readonly ChordBars[] = [[[0], [3], [4]], [[0], [0], [4]], [[0], [0, 3], [4]]];
const CLOSE3: readonly ChordBars[] = [[[0], [4], [0]], [[3], [4], [0]], [[0], [3, 4], [0]]];
const OPEN4: readonly ChordBars[] = [[[0], [3], [0], [4]], [[0], [4], [0], [4]], [[0], [0], [3], [4]], [[0], [3, 4], [0], [4]]];
const OPEN4_RICH: readonly ChordBars[] = [[[0], [5], [3], [4]], [[0], [5], [1], [4]]];
const MIDDLE4: readonly ChordBars[] = [[[3], [0], [3], [4]], [[0], [5], [1], [4]], [[5], [3], [0], [4]]];
const CLOSE4: readonly ChordBars[] = [[[0], [3], [4], [0]], [[0], [3], [0, 4], [0]], [[3], [0], [4], [0]], [[0], [4], [4], [0]]];
const CLOSE4_RICH: readonly ChordBars[] = [[[0], [1], [4], [0]], [[5], [3], [4], [0]]];

function planChords(level: ReadingLevel, meter: ReadingMeter, bars: number, minor: boolean, upbeat: boolean, random: Random): readonly (readonly [number, number])[] {
  const phrase = srtPhraseBars(bars);
  const rich = level.id >= 6;
  // Only meters with two strong places in the bar change chord in the middle of it.
  const twoSlots = srtChordBeats(level.id, meter).length > 1;
  const out: (readonly [number, number])[] = [];
  for (let start = 0; start < bars; start += phrase) {
    const last = start + phrase >= bars;
    const options = phrase === 2 ? (last ? CLOSE2 : OPEN2)
      : phrase === 3 ? (last ? CLOSE3 : OPEN3)
        : last ? (rich ? [...CLOSE4, ...CLOSE4_RICH] : CLOSE4)
          : start === 0 ? (rich ? [...OPEN4, ...OPEN4_RICH] : OPEN4) : MIDDLE4;
    // After an upbeat bar the first full bar is the home chord: the phrase is the upbeat bar and three more.
    const chosen: ChordBars = upbeat && start === 0 && phrase === 4 ? [[0], ...pick(random, OPEN3)] : pick(random, options);
    for (const slots of chosen) {
      // In a minor key the chord on the second degree is diminished: the fourth degree takes its place.
      const roots = slots.map((root) => (minor && root === 1 ? 3 : root));
      const second = roots[roots.length - 1];
      out.push(twoSlots ? [roots[0], second] : [second, second]);
    }
  }
  return out;
}

// ---------------------------------------------------------------- melody

type Rule =
  | { readonly kind: 'delta'; readonly values: readonly number[] }
  | { readonly kind: 'same' }
  | { readonly kind: 'back' }
  | { readonly kind: 'again' }
  | { readonly kind: 'copy'; readonly from: number; readonly shift: number }
  | { readonly kind: 'at'; readonly degree: number }
  | { readonly kind: 'chroma' };

type Slot = {
  readonly bar: number;
  readonly on: number;
  readonly dur: number;
  readonly strong: boolean;
  readonly root: number;
  first: boolean;
  last: boolean;
  phraseEnd: boolean;
  rule: Rule | null;
  /** This note comes back in the next bar, moved by `shift` (a sequence): the moved note must fit the slot it lands in. */
  echo: { readonly shift: number; readonly to: number } | null;
};

type Frame = {
  readonly level: ReadingLevel;
  readonly key: ReadingKey;
  readonly meter: ReadingMeter;
  readonly bars: number;
  readonly barTicks: number;
  readonly upbeat: boolean;
  readonly cells: readonly (readonly number[])[];
  readonly chords: readonly (readonly [number, number])[];
  readonly minor: boolean;
  /** The seventh of a minor key may be raised (not in G sharp minor, which would need a double sharp). */
  readonly raise: boolean;
  /** The shape a level 3 piece sets out to show. */
  readonly wish: string;
  /** Set when a scale run is planted: its top note is the one high point of the melody. */
  scalePeak: { readonly index: number; readonly degree: number } | null;
  readonly random: Random;
};

function buildSlots(frame: Frame): { readonly slots: Slot[]; readonly byBar: number[][] } {
  const strong = srtChordBeats(frame.level.id, frame.meter);
  const slots: Slot[] = [];
  const byBar: number[][] = [];
  frame.cells.forEach((ticks, bar) => {
    let at = 0;
    const indexes: number[] = [];
    for (const length of ticks) {
      if (length > 0) {
        indexes.push(slots.length);
        slots.push({
          bar, on: bar * frame.barTicks + at, dur: length, strong: strong.includes(at),
          root: frame.chords[bar][at >= frame.barTicks / 2 ? 1 : 0],
          first: false, last: false, phraseEnd: false, rule: null, echo: null,
        });
      }
      at += Math.abs(length);
    }
    byBar.push(indexes);
  });
  if (slots.length > 0) {
    slots[0].first = true;
    slots[slots.length - 1].last = true;
  }
  const phrase = srtPhraseBars(frame.bars);
  for (let end = phrase; end < frame.bars; end += phrase) {
    const close = slots.filter((slot) => slot.bar < end).at(-1);
    if (close) close.phraseEnd = true;
  }
  return { slots, byBar };
}

/** Writes the shapes a piece is meant to show into the slots, as rules the melody search must follow. */
function plantShapes(frame: Frame, slots: Slot[], byBar: readonly (readonly number[])[]): void {
  const { level, random } = frame;
  const free = (bar: number, count: number): boolean => bar > (frame.upbeat ? 0 : -1) && bar < frame.bars - 1 &&
    byBar[bar].length >= count && byBar[bar].every((index) => !slots[index].phraseEnd && slots[index].rule === null);
  const barsWith = (count: number): number[] => byBar.map((_, bar) => bar).filter((bar) => free(bar, count));
  // Short notes run by step: a group of sixteenths always, a pair of eighths most of the time.
  const eighthsByStep = random() < 0.75;
  slots.forEach((slot, index) => {
    const before = slots[index - 1];
    if (!before || before.bar !== slot.bar || before.on + before.dur !== slot.on) return;
    const both = (ticks: number): boolean => before.dur === ticks && slot.dur === ticks;
    if (both(SIXTEENTH) || (frame.meter.den === 4 && both(EIGHTH) && eighthsByStep)) slot.rule = { kind: 'delta', values: [1, -1] };
  });
  const plant = (shape: string): boolean => {
    if (shape === 'skip' || shape === 'fifth' || shape === 'repeat') {
      const bars = barsWith(2);
      if (bars.length === 0) return false;
      const slot = slots[byBar[pick(random, bars)][1]];
      slot.rule = shape === 'repeat' ? { kind: 'same' } : { kind: 'delta', values: shape === 'skip' ? [2, -2] : [4, -4] };
      return true;
    }
    if (shape === 'triad' || shape === 'neighbour') {
      const bars = barsWith(3);
      if (bars.length === 0) return false;
      const indexes = byBar[pick(random, bars)];
      slots[indexes[1]].rule = { kind: 'delta', values: shape === 'triad' ? [2, -2] : [1, -1] };
      slots[indexes[2]].rule = shape === 'triad' ? { kind: 'again' } : { kind: 'back' };
      return true;
    }
    if (shape === 'sequence') {
      // The bar repeats the one before it, a step or a third higher or lower. It may be the bar that ends a phrase.
      const bars = byBar.map((_, bar) => bar).filter((bar) => bar > (frame.upbeat ? 1 : 0) && bar < frame.bars - 1 &&
        byBar[bar].length >= 3 && frame.cells[bar] === frame.cells[bar - 1] &&
        [...byBar[bar], ...byBar[bar - 1]].every((index) => slots[index].rule === null || slots[index].rule?.kind === 'delta'));
      if (bars.length === 0) return false;
      const bar = pick(random, bars);
      const shift = pick(random, [1, -1, 2, -2]);
      byBar[bar].forEach((index, position) => {
        const from = byBar[bar - 1][position];
        slots[index].rule = { kind: 'copy', from, shift };
        slots[from].echo = { shift, to: index };
      });
      return true;
    }
    if (shape === 'scale') {
      // Seven or eight notes by step in one direction, ending with a bar: more than the hand covers, so it must
      // change position. The run may start in the bar before. Its notes are fixed here, and its top note becomes
      // the high point of the whole melody.
      const [low, high] = level.degrees;
      const ends = byBar.map((_, bar) => bar).filter((bar) => bar > (frame.upbeat ? 1 : 0) && bar < frame.bars - 1 &&
        byBar[bar].length + byBar[bar - 1].length >= 7 && byBar[bar].length <= 8 &&
        [...byBar[bar - 1], ...byBar[bar]].every((index) => !slots[index].phraseEnd && (slots[index].rule === null || slots[index].rule?.kind === 'delta')) &&
        [...byBar[bar - 1], ...byBar[bar]].every((index, at, all) => at === 0 || slots[all[at - 1]].on + slots[all[at - 1]].dur === slots[index].on));
      const plans: { readonly run: readonly number[]; readonly up: boolean; readonly top: number }[] = [];
      for (const bar of ends) {
        const run = [...byBar[bar - 1], ...byBar[bar]].slice(-Math.min(8, byBar[bar - 1].length + byBar[bar].length));
        for (const up of [true, false]) {
          // A minor key with a raised seventh cannot climb through it by step, and the top of a falling run must not sit in the first bar.
          if ((up && frame.raise) || (!up && slots[run[0]].bar <= (frame.upbeat ? 1 : 0))) continue;
          for (let top = low + run.length - 1; top <= high; top += 1) {
            const fits = run.every((index, position) => {
              const degree = up ? top - (run.length - 1) + position : top - position;
              const slot = slots[index];
              if (slot.on % frame.barTicks === 0 && !srtChordTones(slot.root).includes(mod7(degree))) return false;
              return !(frame.minor && mod7(degree) === 6 && slot.strong);
            });
            if (fits) plans.push({ run, up, top });
          }
        }
      }
      if (plans.length === 0) return false;
      const plan = pick(random, plans);
      plan.run.forEach((index, position) => {
        slots[index].rule = { kind: 'at', degree: plan.up ? plan.top - (plan.run.length - 1) + position : plan.top - position };
      });
      frame.scalePeak = { index: plan.up ? plan.run[plan.run.length - 1] : plan.run[0], degree: plan.top };
      return true;
    }
    if (shape === 'chroma') {
      const places = barsWith(3).flatMap((bar) => byBar[bar].slice(0, -2)
        .filter((index) => !slots[index + 1].strong && slots[index + 1].bar === bar && slots[index + 2].bar === bar));
      if (places.length === 0) return false;
      const index = pick(random, places);
      slots[index + 1].rule = { kind: 'chroma' };
      slots[index + 2].rule = { kind: 'back' };
      return true;
    }
    return false;
  };
  if (level.id === 1 && random() < 0.25) plant('repeat');
  if (level.id === 2) {
    plant('skip');
    if (random() < 0.5) plant('skip');
  }
  if (level.id === 3) plant(frame.wish);
  if (level.id >= 4 && random() < 0.5) plant(weighted(random, [['triad', 2], ['fifth', 1], ['sequence', 2], ['skip', 2], ['neighbour', 1]]));
  if (level.id >= 6 && random() < (level.id === 6 ? 0.5 : 0.15)) plant('scale');
  if (level.id >= 7 && random() < (level.id === 7 ? 0.7 : 0.35)) plant('chroma');
}

type Choice = { readonly degree: number; readonly alter: number; readonly next: number | null };

/** Searches for a melody that follows every slot rule. Returns null when the search runs out of budget. */
function solveMelody(frame: Frame, slots: readonly Slot[]): { readonly degrees: number[]; readonly alters: number[] } | null {
  const { level, random, key } = frame;
  const [low, high] = level.degrees;
  const middle = (low + high) / 2;
  const steps = frame.minor ? MINOR_STEPS : MAJOR_STEPS;
  const semitones = (from: number, to: number): number => (steps[mod7(to)] - steps[mod7(from)] + 12 * (Math.floor(to / 7) - Math.floor(from / 7)));
  const spellable = (degree: number, alter: number): boolean => {
    try {
      srtDegreePitch(key, 'rh', degree, alter);
      return true;
    } catch {
      return false;
    }
  };
  const count = slots.length;
  // From level 4 the melody has one highest note (rule G7): choose it and its place before the search.
  let peak = Number.POSITIVE_INFINITY;
  let peakIndex = -1;
  if (frame.scalePeak) {
    peak = frame.scalePeak.degree;
    peakIndex = frame.scalePeak.index;
  } else if (level.id >= 4) {
    // The high point lies in the upper half of the range, not always at its top.
    const lowest = Math.min(high, Math.ceil((low + high) / 2) + 1);
    peak = lowest + Math.floor(random() * (high - lowest + 1));
    // A minor key likes its upper tonic as the high point: the raised seventh leads into it.
    const upperTonic = high - mod7(high);
    if (frame.raise && upperTonic > low + 2 && random() < 0.6) peak = upperTonic;
    if (frame.minor && mod7(peak) === 6) peak -= 1;
    const places = slots.map((_, index) => index).filter((index) => {
      const slot = slots[index];
      // The last note may be the highest one when it is the upper tonic.
      return slot.bar > (frame.upbeat ? 1 : 0) && (!slot.last || mod7(peak) === 0) && slot.rule === null && slot.echo === null && slot.dur >= EIGHTH &&
        (!slot.strong || srtChordTones(slot.root).includes(mod7(peak))) &&
        (!slot.phraseEnd || (frame.minor ? [1, 4] : [1, 4, 6]).includes(mod7(peak)));
    });
    if (places.length === 0) return null;
    peakIndex = pick(random, places);
  }
  const degrees: number[] = Array.from({ length: count }, () => 0);
  const alters: number[] = Array.from({ length: count }, () => 0);
  const forced: (number | null)[] = Array.from({ length: count + 1 }, () => null);
  let budget = 1500;

  const choices = (index: number): Choice[] => {
    const slot = slots[index];
    const before = index > 0 ? degrees[index - 1] : null;
    const earlier = index > 1 ? degrees[index - 2] : null;
    const rule = slot.rule;
    if (rule?.kind === 'chroma') {
      if (before === null || slot.strong || slot.last || slot.phraseEnd || forced[index] !== null) return [];
      // The note below, raised to a semitone under the main note: the usual chromatic neighbour.
      // In a minor key the note under the tonic is the leading note, not a chromatic neighbour: leave it out.
      return before - 1 >= low && !(frame.minor && mod7(before - 1) === 6) && semitones(before - 1, before) === 2 && spellable(before - 1, 1)
        ? [{ degree: before - 1, alter: 1, next: before }] : [];
    }
    let pool: number[] = [];
    if (rule?.kind === 'copy') pool = alters[rule.from] === 0 ? [degrees[rule.from] + rule.shift] : [];
    else if (rule?.kind === 'at') pool = [rule.degree];
    else if (rule?.kind === 'delta') pool = before === null ? [] : rule.values.map((value) => before + value);
    else if (rule?.kind === 'same') pool = before === null ? [] : [before];
    else if (rule?.kind === 'back') pool = earlier === null ? [] : [earlier];
    else if (rule?.kind === 'again') pool = before === null || earlier === null ? [] : [before + (before - earlier)];
    else for (let degree = low; degree <= high; degree += 1) pool.push(degree);
    const tones = srtChordTones(slot.root);
    const weightedChoices: (readonly [Choice, number])[] = [];
    for (const degree of pool) {
      if (degree < low || degree > high) continue;
      if (index === peakIndex ? degree !== peak : degree >= peak) continue;
      if (index < peakIndex && peak - degree > (peakIndex - index) * level.maxLeap) continue;
      const step = before === null ? 0 : degree - before;
      if (before !== null && Math.abs(step) > level.maxLeap) continue;
      // No sevenths, and no leap of a sixth or more out of a short note.
      if (Math.abs(step) === 6 || (Math.abs(step) >= 5 && slots[index - 1].dur < QUARTER)) continue;
      if (forced[index] !== null && degree !== forced[index]) continue;
      if (before !== null && earlier !== null && Math.abs(before - earlier) >= 4 && step !== -Math.sign(before - earlier)) continue;
      const tone = mod7(degree);
      // On the second strong beat of a bar a note outside the chord may pass through by step: it must then go on
      // by step in the same direction.
      const passing = slot.strong && !tones.includes(tone);
      const onward = degree + step;
      const joined = index > 0 && index + 1 < count && slots[index - 1].on + slots[index - 1].dur === slot.on &&
        slots[index + 1].on === slot.on + slot.dur && slots[index - 1].bar === slot.bar && slots[index + 1].bar === slot.bar;
      if (passing && (!joined || slot.on % frame.barTicks === 0 || before === null || Math.abs(step) !== 1 || slot.last || slot.phraseEnd ||
          forced[index] !== null || onward < low || onward > high || onward >= peak || (frame.minor && (tone === 6 || mod7(onward) === 6)))) continue;
      if (slot.first && ![0, 2, 4].includes(tone)) continue;
      if (slot.last && (tone !== 0 || before === null || Math.abs(step) !== 1)) continue;
      if (slot.phraseEnd && !(frame.minor ? [1, 4] : [1, 4, 6]).includes(tone)) continue;
      if (slot.echo) {
        const copy = slots[slot.echo.to];
        const moved = degree + slot.echo.shift;
        if (moved < low || moved > high || moved >= peak || (frame.minor && mod7(moved) === 6) || (frame.minor && tone === 6) ||
            (copy.strong && !srtChordTones(copy.root).includes(mod7(moved))) ||
            (copy.phraseEnd && !(frame.minor ? [1, 4] : [1, 4, 6]).includes(mod7(moved)))) continue;
      }
      let weight = before === null ? (tone === 0 ? 3 : 2)
        : [0.3, 8, 2, 0.5, 0.35][Math.abs(step)] ?? 0.08;
      if (before !== null && earlier !== null && Math.abs(step) === 1 && Math.sign(step) === Math.sign(before - earlier)) weight *= 1.5;
      weight *= 1 - 0.4 * Math.abs(degree - middle) / Math.max(1, (high - low) / 2);
      if (frame.minor && tone === 6) {
        if (!frame.raise) {
          if (!slot.strong) weightedChoices.push([{ degree, alter: 0, next: null }, weight]);
          continue;
        }
        // A seventh in a minor key either passes down from the tonic, or is raised and rises to the tonic.
        if (before === degree + 1 && !slot.strong && !slot.last && degree - 1 >= low) weightedChoices.push([{ degree, alter: 0, next: degree - 1 }, weight]);
        // The raised seventh is reached from the tonic above or from the fifth degree below (never by an augmented
        // second from the sixth), and a piece has only a few of them.
        const raisedSoFar = alters.slice(0, index).filter((alter, at) => alter === 1 && mod7(degrees[at]) === 6).length;
        const reached = before === degree + 1 || before === degree - 2;
        if (reached && raisedSoFar < Math.ceil(frame.bars / 4) && !slot.last && !slot.phraseEnd && degree + 1 <= high) {
          weightedChoices.push([{ degree, alter: 1, next: degree + 1 }, weight * (index + 1 === peakIndex && degree + 1 === peak ? 40 : 1.5)]);
        }
        continue;
      }
      weightedChoices.push([{ degree, alter: 0, next: passing ? onward : null }, weight]);
    }
    return ordered(random, weightedChoices);
  };

  const search = (index: number): boolean => {
    if (index === count) return true;
    budget -= 1;
    if (budget < 0) return false;
    for (const choice of choices(index)) {
      degrees[index] = choice.degree;
      alters[index] = choice.alter;
      forced[index + 1] = choice.next;
      if (search(index + 1)) return true;
      if (budget < 0) return false;
    }
    return false;
  };
  return search(0) ? { degrees, alters } : null;
}

// ---------------------------------------------------------------- hands

type Item = { readonly on: number; readonly dur: number; readonly degrees: readonly number[]; readonly alters: readonly number[] };
const rest = (on: number, dur: number): Item => ({ on, dur, degrees: [], alters: [] });
const note = (on: number, dur: number, degree: number, alter = 0): Item => ({ on, dur, degrees: [degree], alters: [alter] });
const top = (item: Item): number => item.degrees[item.degrees.length - 1];
const bottom = (item: Item): number => item.degrees[0];

/** The note of a line that sounds at a tick. */
const soundingAt = (items: readonly Item[], tick: number): Item | undefined =>
  items.find((item) => item.degrees.length > 0 && item.on <= tick && tick < item.on + item.dur);

type Hands = { readonly rh: Item[]; readonly lh: Item[]; readonly melody: SightReadingHand[] };

function buildHands(frame: Frame, melodyBars: readonly (readonly Item[])[]): Hands | null {
  const { level, random, barTicks, bars, chords } = frame;
  const [low, high] = level.degrees;
  const strong = srtChordBeats(frame.level.id, frame.meter);
  const melodyAll = melodyBars.flat();
  const isStrong = (tick: number): boolean => strong.includes(tick % barTicks);
  const chordAt = (tick: number): number => chords[Math.floor(tick / barTicks)][tick % barTicks >= barTicks / 2 ? 1 : 0];
  /** The highest degree the second hand may reach. */
  let cap = high;
  /** Chord notes a second hand may play. The seventh of a minor key stays with the melody. */
  const tonesIn = (root: number): number[] => {
    const tones = srtChordTones(root);
    const out: number[] = [];
    for (let degree = low; degree <= cap; degree += 1) {
      if (tones.includes(mod7(degree)) && !(frame.minor && mod7(degree) === 6)) out.push(degree);
    }
    return out;
  };
  /** A second-hand note settles with the melody on every strong beat it covers. `below` says the note is under the melody. */
  const settles = (on: number, dur: number, degree: number, below: boolean): boolean => {
    for (let start = Math.floor(on / barTicks) * barTicks; start < on + dur; start += barTicks) {
      for (const offset of strong) {
        const tick = start + offset;
        if (tick < on || tick >= on + dur) continue;
        if (!settlesAt(tick, on, degree, below)) return false;
      }
    }
    return true;
  };
  const settlesAt = (tick: number, on: number, degree: number, below: boolean): boolean => {
    const sung = soundingAt(melodyAll, tick);
    if (!sung || (tick !== on && sung.on !== tick)) return true;
    // A melody note outside the chord on the second strong beat is a passing note: it is not measured.
    if (tick % barTicks !== 0 && sung.on === tick && !srtChordTones(chordAt(tick)).includes(mod7(top(sung)))) return true;
    return CONSONANT.includes(mod7(below ? top(sung) - degree : degree - bottom(sung)));
  };
  const near = (previous: number | null, degree: number): boolean => previous === null || Math.abs(degree - previous) <= level.maxLeap;
  /** The parts of a bar that have their own chord: the two halves when the chord changes, otherwise the whole bar. */
  const chordParts = (bar: number, mayHalve: boolean): readonly (readonly [number, number, number])[] => {
    const [first, second] = chords[bar];
    const start = bar * barTicks;
    return first !== second && mayHalve ? [[start, barTicks / 2, first], [start + barTicks / 2, barTicks / 2, second]] : [[start, barTicks, first]];
  };
  /** Long notes on chord notes, one per chord. */
  const hold = (bar: number, below: boolean, previous: number | null, mayHalve: boolean): Item[] | null => {
    const out: Item[] = [];
    let last = previous;
    for (const [on, dur, root] of chordParts(bar, mayHalve)) {
      const options = tonesIn(root).filter((degree) => settles(on, dur, degree, below) && near(last, degree) &&
        !(below && bar === bars - 1 && mod7(degree) !== 0))
        .map((degree): readonly [number, number] => [degree, mod7(degree - root) === 0 ? 4 : mod7(degree - root) === 2 ? 1.5 : below ? 0.3 : 1]);
      if (options.length === 0) return null;
      last = weighted(random, options);
      out.push(note(on, dur, last));
    }
    return out;
  };

  const rh: Item[] = [];
  const lh: Item[] = [];
  const melody: SightReadingHand[] = [];
  const wholeRest = (bar: number): Item => rest(bar * barTicks, barTicks);

  if (level.hands === 'blocks' || level.hands === 'alternate') {
    const first: SightReadingHand = random() < 0.5 ? 'rh' : 'lh';
    const other: SightReadingHand = first === 'rh' ? 'lh' : 'rh';
    let turn = first;
    for (let bar = 0; bar < bars; bar += 1) {
      if (level.hands === 'blocks') turn = bar < bars / 2 ? first : other;
      else if (bar > 0 && (bar === 1 || random() < 0.6)) turn = turn === 'rh' ? 'lh' : 'rh';
      melody.push(turn);
    }
    // Level 3 changes hands at least twice.
    if (level.hands === 'alternate' && melody.filter((hand, bar) => bar > 0 && hand !== melody[bar - 1]).length < 2) melody[bars - 1] = melody[bars - 2] === 'rh' ? 'lh' : 'rh';
    melody.forEach((hand, bar) => {
      (hand === 'rh' ? rh : lh).push(...melodyBars[bar]);
      (hand === 'rh' ? lh : rh).push(wholeRest(bar));
    });
    return { rh, lh, melody };
  }

  if (level.hands === 'oneMoves') {
    const phrase = srtPhraseBars(bars);
    const order = weighted<readonly SightReadingHand[]>(random, [[['rh', 'rh'], 3.5], [['rh', 'lh'], 4], [['lh', 'rh'], 2.5]]);
    for (let bar = 0; bar < bars; bar += 1) {
      const mover = order[Math.floor(bar / phrase) % 2];
      const held = hold(bar, mover === 'rh', null, barTicks / 2 >= HALF);
      if (!held) return null;
      melody.push(mover);
      (mover === 'rh' ? rh : lh).push(...melodyBars[bar]);
      (mover === 'rh' ? lh : rh).push(...held);
    }
    return { rh: tieHolds(frame, rh), lh: tieHolds(frame, lh), melody };
  }

  // Both hands in every bar: the melody stays in the right hand, the left hand gets a texture per pair of bars.
  // The left hand stays under the lowest note of the melody, so the hands never cross.
  const apart = Math.round((srtDegreePitch(frame.key, 'rh', 0).midi - srtDegreePitch(frame.key, 'lh', 0).midi) / 12) * 7;
  const ceiling = Math.min(...melodyAll.filter((item) => item.degrees.length > 0).map(bottom)) + apart - 1;
  const lowered = Math.min(high, ceiling);
  cap = lowered;
  let previous: number | null = null;
  const voicing = (root: number): { readonly low: number; readonly third: number | null; readonly fifth: number | null } | null => {
    // The root goes to the lowest place where the fifth still fits above it. The other notes never drop under the root.
    const places = [root - 7, root, root + 7].filter((degree) => degree >= low && degree <= lowered);
    if (places.length === 0) return null;
    const place = places.find((degree) => degree + 4 <= lowered) ?? places[0];
    const above = (degree: number): number | null => (degree <= lowered ? degree : null);
    const third = above(place + 2);
    return { low: place, third: third !== null && frame.minor && mod7(third) === 6 ? null : third, fifth: above(place + 4) };
  };
  const textures: Readonly<Record<string, (bar: number) => Item[] | null>> = {
    hold: (bar) => hold(bar, true, previous, true),
    chord2: (bar) => {
      const out: Item[] = [];
      let last = previous;
      for (const [on, dur, root] of chordParts(bar, true)) {
        const shape = voicing(root);
        if (!shape) return null;
        const uppers = [shape.fifth, shape.third].filter((degree): degree is number => degree !== null && degree > shape.low && degree - shape.low <= 5);
        if (uppers.length === 0 || !settles(on, dur, shape.low, true) || !near(last, shape.low)) return null;
        const upper = uppers.length > 1 && random() < 0.4 ? uppers[1] : uppers[0];
        // A waltz bar: the bass note alone, then the chord twice.
        if (meterKey(frame.meter) === '3/4' && bar !== bars - 1 && random() < 0.6) {
          out.push(note(on, QUARTER, shape.low), { on: on + QUARTER, dur: QUARTER, degrees: [shape.low, upper], alters: [0, 0] },
            { on: on + 2 * QUARTER, dur: QUARTER, degrees: [shape.low, upper], alters: [0, 0] });
        } else out.push({ on, dur, degrees: [shape.low, upper], alters: [0, 0] });
        last = shape.low;
      }
      return out;
    },
    broken: (bar) => {
      const out: Item[] = [];
      const key = meterKey(frame.meter);
      for (const [on, dur, root] of chordParts(bar, true)) {
        const shape = voicing(root);
        const upper = shape ? shape.fifth ?? shape.third : null;
        if (!shape || upper === null || !near(out.length > 0 ? bottom(out[out.length - 1]) : previous, shape.low)) return null;
        const middle = shape.fifth !== null && shape.third !== null ? shape.third : shape.low;
        const figure = key === '4/4' || key === '2/4' ? (dur === barTicks ? [shape.low, upper, middle, upper] : [shape.low, upper])
          : middle === shape.low ? [shape.low, upper, shape.low] : [shape.low, middle, upper];
        // A whole 6/8 bar on one chord plays the figure twice: three quarters would cut across the beat.
        if (key === '6/8' && dur === barTicks) figure.push(...figure);
        const length = dur / figure.length;
        figure.forEach((degree, index) => out.push(note(on + index * length, length, degree)));
      }
      return out;
    },
    parallel: (bar) => {
      const source = melodyBars[bar];
      // Sixteenths stay in one hand.
      if (source.some((item) => item.dur < EIGHTH)) return null;
      for (const shift of ordered(random, [[0, 2], [-2, 2], [2, 1.5]] as const)) {
        const out = source.map((item) => (item.degrees.length === 0 ? rest(item.on, item.dur) : note(item.on, item.dur, top(item) + shift, shift === 0 ? item.alters[item.alters.length - 1] : 0)));
        const sounding = out.filter((item) => item.degrees.length > 0);
        const fine = sounding.length >= 2 && sounding.every((item) => bottom(item) >= low && bottom(item) <= lowered &&
          !(frame.minor && mod7(bottom(item)) === 6) && item.alters[0] === 0 &&
          (!isStrong(item.on) || srtChordTones(chordAt(item.on)).includes(mod7(bottom(item))))) && near(previous, bottom(sounding[0]));
        if (fine) return out;
      }
      return null;
    },
    contrary: (bar) => {
      const source = melodyBars[bar];
      const sung = source.filter((item) => item.degrees.length > 0);
      if (sung.length < 3 || source.some((item) => item.dur < EIGHTH)) return null;
      const starts: (readonly [number, number])[] = [];
      for (let degree = low; degree <= lowered; degree += 1) {
        if (CONSONANT.includes(mod7(top(sung[0]) - degree)) && near(previous, degree)) starts.push([degree, 1]);
      }
      for (const start of ordered(random, starts)) {
        let at = start;
        let before: Item | null = null;
        let fine = true;
        const out: Item[] = [];
        for (const item of source) {
          if (item.degrees.length === 0) {
            out.push(rest(item.on, item.dur));
            continue;
          }
          if (before) at -= top(item) - top(before);
          before = item;
          // The two hands strike together on every note here, so every pair must settle, not only the strong beats.
          fine = at >= low && at <= lowered && !(frame.minor && mod7(at) === 6) && CONSONANT.includes(mod7(top(item) - at)) &&
            (!isStrong(item.on) || srtChordTones(chordAt(item.on)).includes(mod7(at)));
          if (!fine) break;
          out.push(note(item.on, item.dur, at));
        }
        if (fine) return out;
      }
      return null;
    },
  };
  const menus: Readonly<Record<number, readonly (readonly [string, number])[]>> = {
    5: [['hold', 3], ['parallel', 4], ['contrary', 3]],
    6: [['hold', 2], ['chord2', 5], ['parallel', 1.5], ['contrary', 1.5]],
    7: [['broken', 5], ['chord2', 2], ['hold', 2]],
    8: [['broken', 3], ['chord2', 5], ['hold', 2]],
  };
  const menu = menus[level.id] ?? menus[5];
  const phrase = srtPhraseBars(bars);
  let texture = 'hold';
  const chordBars: number[] = [];
  for (let bar = 0; bar < bars; bar += 1) {
    melody.push('rh');
    rh.push(...melodyBars[bar]);
    if (frame.upbeat && bar === 0) {
      lh.push(wholeRest(bar));
      continue;
    }
    if (bar % 2 === (frame.upbeat ? 1 : 0)) texture = weighted(random, menu);
    const closing = bar === bars - 1 || (bar + 1) % phrase === 0;
    const wanted = bar === bars - 1 ? (level.id >= 6 && random() < 0.5 ? 'chord2' : 'hold') : closing && random() < 0.6 ? 'hold' : texture;
    const made = textures[wanted](bar) ?? (wanted === 'hold' ? null : textures.hold(bar));
    if (!made) return null;
    if (made.some((item) => item.degrees.length === 2)) chordBars.push(bar);
    lh.push(...made);
    const sounding = made.filter((item) => item.degrees.length > 0);
    if (sounding.length > 0) previous = bottom(sounding[sounding.length - 1]);
  }
  const reach = Math.max(...lh.flatMap((item) => item.degrees)) - apart;
  const right = level.chord.rh > 1 ? thicken(frame, rh, chordBars, reach) : rh;
  return { rh: right, lh: level.id <= 6 ? tieHolds(frame, lh) : lh, melody };
}

/** Joins two whole-bar notes on the same degree into one note tied over the barline, about half of the time. */
function tieHolds(frame: Frame, items: readonly Item[]): Item[] {
  const out: Item[] = [];
  for (const item of items) {
    const before = out[out.length - 1];
    const wholeBar = (candidate: Item): boolean => candidate.dur === frame.barTicks && candidate.on % frame.barTicks === 0 && candidate.degrees.length === 1;
    if (before && wholeBar(before) && wholeBar(item) && before.on + before.dur === item.on && before.degrees[0] === item.degrees[0] && frame.random() < 0.5) {
      out[out.length - 1] = { ...before, dur: before.dur + item.dur };
    } else out.push(item);
  }
  return out;
}

/**
 * Level 8: in one or two bars where the left hand plays chords, the right hand adds a third or a sixth under its melody.
 * `reach` is the highest left-hand note, counted in right-hand degrees: the added note stays above it.
 */
function thicken(frame: Frame, items: readonly Item[], chordBars: readonly number[], reach: number): Item[] {
  const { random, barTicks, chords, level } = frame;
  if (chordBars.length === 0 || random() < 0.3) return [...items];
  const chosen = new Set(ordered(random, chordBars.map((bar): readonly [number, number] => [bar, 1])).slice(0, random() < 0.5 ? 1 : 2));
  return items.map((item) => {
    const bar = Math.floor(item.on / barTicks);
    if (!chosen.has(bar) || item.degrees.length !== 1 || item.alters[0] !== 0 || item.dur < QUARTER || item.on % QUARTER !== 0) return item;
    const tones = srtChordTones(chords[bar][item.on % barTicks >= barTicks / 2 ? 1 : 0]);
    const under = [item.degrees[0] - 2, item.degrees[0] - 5].find((degree) => degree >= level.degrees[0] && degree > reach && tones.includes(mod7(degree)) &&
      tones.includes(mod7(item.degrees[0])) && !(frame.minor && mod7(degree) === 6));
    return under === undefined ? item : { ...item, degrees: [under, item.degrees[0]], alters: [0, 0] };
  });
}

// ---------------------------------------------------------------- piece

function toEvents(key: ReadingKey, hand: SightReadingHand, items: readonly Item[]): SightReadingEvent[] {
  return [...items].sort((a, b) => a.on - b.on).map((item, index) => ({
    id: `${hand}-${index}`,
    hand,
    onsetTick: item.on,
    durationTick: item.dur,
    pitches: item.degrees.map((degree, position) => srtDegreePitch(key, hand, degree, item.alters[position])).sort((a, b) => a.midi - b.midi),
  }));
}

/** Adds the patterns and the difficulty score to a planned piece. */
function finish(planned: PlannedPiece): GeneratedPiece {
  return srtDeepFreeze({ ...planned, patterns: srtBarPatterns(planned), difficulty: srtDifficulty(planned) });
}

function attempt(level: ReadingLevel, key: ReadingKey, seed: number, random: Random): GeneratedPiece | string {
  const earlier = level.id > 1 ? srtLevel(level.id - 1).meters.map(meterKey) : [];
  const meter = weighted(random, level.meters.map((item): readonly [ReadingMeter, number] =>
    [item, METER_WEIGHT[meterKey(item)] * (level.id > 1 && !earlier.includes(meterKey(item)) ? 2 : 1)]));
  const bars = weighted(random, level.bars.map((count, index): readonly [number, number] => [count, index === 0 ? 2 : 1]));
  const upbeat = level.upbeat && random() < 0.3;
  const { bar: barTicks } = srtMeterTicks(meter);
  const minor = key.mode === 'minor';
  const wish = level.id === 3 ? weighted(random, [['triad', 3], ['fifth', 2], ['sequence', 3], ['none', 1]]) : 'none';
  const frame: Frame = {
    level, key, meter, bars, barTicks, upbeat, minor, random, wish, scalePeak: null,
    raise: minor && level.leadingTone && key.id !== 'G#m',
    cells: planRhythm(level, meter, bars, upbeat, wish === 'sequence', random),
    chords: planChords(level, meter, bars, minor, upbeat, random),
  };
  const { slots, byBar } = buildSlots(frame);
  plantShapes(frame, slots, byBar);
  const solved = solveMelody(frame, slots);
  if (!solved) return 'melody';
  const melodyBars = frame.cells.map((ticks, bar) => {
    let at = bar * barTicks;
    let position = 0;
    return ticks.map((length) => {
      const on = at;
      at += Math.abs(length);
      if (length < 0) return rest(on, -length);
      const index = byBar[bar][position];
      position += 1;
      return note(on, length, solved.degrees[index], solved.alters[index]);
    });
  });
  const hands = buildHands(frame, melodyBars);
  if (!hands) return 'hands';
  try {
    return finish({
      schemaVersion: 1, generatorVersion: 2, level: level.id, seed, meter, ticksPerQuarter: 480, key, bars,
      events: [...toEvents(key, 'rh', hands.rh), ...toEvents(key, 'lh', hands.lh)],
      chords: frame.chords, melody: hands.melody, upbeat,
    });
  } catch (error) {
    // A note the key cannot spell with one accidental: drop the attempt.
    if (error instanceof RangeError) return 'spelling';
    throw error;
  }
}

function inBand(piece: GeneratedPiece, band: readonly [number, number] | undefined): boolean {
  return !band || (piece.difficulty >= band[0] && piece.difficulty <= band[1]);
}

/**
 * A piece of a level in a key. The seed chooses among the pieces: the same three values always give the same piece.
 * Throws when no attempt gives a piece that keeps every rule.
 */
export function srtGenerateLevelPiece(levelId: number, keyId: string, seed: number, options: GenerateOptions = {}): GeneratedPiece {
  const level = srtLevel(levelId);
  const key = srtReadingKey(keyId);
  if (!Number.isInteger(seed)) throw new RangeError(`Invalid seed: ${seed}`);
  const base = srtHashText(`${level.id}|${key.id}|${seed}`);
  for (let index = 0; index < MAX_ATTEMPTS; index += 1) {
    const piece = attempt(level, key, seed, mulberry32(base + Math.imul(index, 0x9e3779b1)));
    if (typeof piece === 'string') {
      options.trace?.(piece);
      continue;
    }
    const broken = srtRuleViolations(piece);
    if (broken.length > 0) options.trace?.(`${broken[0].rule}:${broken[0].detail.split(' ').slice(0, 3).join(' ')}`);
    else if (!inBand(piece, options.band)) options.trace?.('band');
    else return piece;
  }
  throw new Error(`No level ${level.id} piece in ${key.id} for seed ${seed}`);
}

/**
 * The same piece in another key of the same mode: every note keeps its scale degree.
 * Returns null when the result breaks a rule (hands that cross, a note the key cannot spell).
 */
export function srtTransposeLevelPiece(piece: GeneratedPiece, keyId: string): GeneratedPiece | null {
  const key = srtReadingKey(keyId);
  if (key.mode !== piece.key.mode) return null;
  try {
    const events = piece.events.map((event) => ({
      ...event,
      pitches: event.pitches.map((pitch) => {
        const place = srtPitchPlace(pitch, piece.key, event.hand);
        if (!place) throw new RangeError('unplaced pitch');
        return srtDegreePitch(key, event.hand, place.degree, place.alter);
      }).sort((a, b) => a.midi - b.midi),
    }));
    const moved = finish({
      schemaVersion: 1, generatorVersion: 2, level: piece.level, seed: piece.seed, meter: piece.meter, ticksPerQuarter: 480,
      key, bars: piece.bars, events, chords: piece.chords, melody: piece.melody, upbeat: piece.upbeat,
    });
    return srtRuleViolations(moved).length === 0 ? moved : null;
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

const VALUE_NAMES: Readonly<Record<number, string>> = { 1920: 'w', 1440: 'dh', 960: 'h', 720: 'dq', 480: 'q', 240: 'e', 120: 's' };

/** A piece as text, one line per hand, for tests and debugging: `C4.q E4+G4.h R.q`. Bars are split by `|`. */
export function srtPieceText(piece: PlannedPiece): { readonly rh: string; readonly lh: string } {
  const { bar } = srtMeterTicks(piece.meter);
  const line = (hand: SightReadingHand): string => piece.events.filter((event) => event.hand === hand)
    .sort((a, b) => a.onsetTick - b.onsetTick)
    .map((event) => {
      const name = event.pitches.length === 0 ? 'R' : event.pitches.map((pitch) => pitch.spelling).join('+');
      return `${event.onsetTick > 0 && event.onsetTick % bar === 0 ? '| ' : ''}${name}.${VALUE_NAMES[event.durationTick] ?? `t${event.durationTick}`}`;
    }).join(' ');
  return { rh: line('rh'), lh: line('lh') };
}

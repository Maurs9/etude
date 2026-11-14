// Printed-page markings for a level piece: dynamics, hairpins, fingering, staccato, accents and slurs, kept modest
// like a graded sight-reading page. They are decoration only: the notes, the scoring and the fingerprint never read them.
import { srtLevelFingerprint } from './fingerprint.js';
import { srtLevel, srtMeterTicks } from './levels.js';
import { srtHashText } from './melody.js';
import { TICKS_PER_QUARTER, type SightReadingHand } from './model.js';
import { srtHandLine, srtMelodyLine, type LineNote } from './patterns.js';
import type { GeneratedPiece } from './rules.js';

/**
 * The markings of a piece. Every `beat`, `from` and `to` is a position from the start of the piece in quarter notes
 * (ticks / 480): the unit in which the token lengths of srtLevelScore add up. A hand marking's beat is always the
 * onset of a note or chord of that hand, so a renderer finds its note by hand and beat. A chord is one onset: a
 * marking on it belongs to the whole chord. A finger is the finger of the hand's line note (the top note of a
 * right-hand chord, the bottom note of a left-hand chord). Dynamics and hairpins belong to the whole system.
 */
export type LevelMarkings = {
  readonly dynamics: readonly { readonly beat: number; readonly mark: 'p' | 'mp' | 'mf' | 'f' }[];
  readonly hairpins: readonly { readonly from: number; readonly to: number; readonly kind: 'cresc' | 'dim' }[];
  readonly fingering: readonly { readonly hand: 'rh' | 'lh'; readonly beat: number; readonly finger: 1 | 2 | 3 | 4 | 5 }[];
  readonly articulations: readonly { readonly hand: 'rh' | 'lh'; readonly beat: number; readonly kind: 'staccato' | 'accent' }[];
  readonly slurs: readonly { readonly hand: 'rh' | 'lh'; readonly from: number; readonly to: number }[];
};

type Mark = LevelMarkings['dynamics'][number]['mark'];
type Finger = LevelMarkings['fingering'][number]['finger'];
type Section = { readonly level: number; readonly startBar: number; readonly bars: number };
type Random = () => number;

const QUARTER = 480;
const EIGHTH = 240;
const HANDS: readonly SightReadingHand[] = ['rh', 'lh'];
const PHRASE = 4;
const beatOf = (tick: number): number => tick / TICKS_PER_QUARTER;

/** mulberry32: the same seed always gives the same marks. */
function random32(seed: number): Random {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(random: Random, list: readonly T[]): T => list[Math.floor(random() * list.length)];

function sectionsOf(piece: GeneratedPiece): readonly Section[] {
  const sections = (piece as { readonly sections?: unknown }).sections;
  if (Array.isArray(sections) && sections.length > 0) return sections as readonly Section[];
  return [{ level: piece.level, startBar: 0, bars: piece.bars }];
}

/**
 * The five-finger positions of a hand's notes in a section, as the degree under the thumb (right hand) or the little
 * finger (left hand), one per note, or null where the position is not known. Up to level 5 a hand never moves, so it
 * keeps one position: the tonic position when its notes fit in it, else the fifth its notes span exactly. From level 6
 * the notes are cut into the fewest five-note positions, changing only where a hand may move (as in srtMinShifts).
 */
function positions(notes: readonly LineNote[], level: number): readonly (number | null)[] {
  const range = (from: number, to: number): readonly [number, number] => {
    const degrees = notes.slice(from, to).flatMap((note) => note.degrees);
    return [Math.min(...degrees), Math.max(...degrees)];
  };
  const baseOf = (low: number, high: number, first: boolean): number | null =>
    (first && low >= 0 && high <= 4 ? 0 : high - low === 4 ? low : null);
  if (notes.length === 0) return [];
  if (level <= 5) {
    const [low, high] = range(0, notes.length);
    const base = baseOf(low, high, true);
    return notes.map(() => base);
  }
  const count = notes.length;
  const best: number[] = Array.from({ length: count + 1 }, () => Number.POSITIVE_INFINITY);
  const from: number[] = Array.from({ length: count + 1 }, () => -1);
  best[0] = 0;
  for (let start = 0; start < count; start += 1) {
    if (!Number.isFinite(best[start])) continue;
    const before = notes[start - 1];
    const note = notes[start];
    if (before && !(note.afterRest || before.duration >= QUARTER || (note.bar !== before.bar && before.duration >= EIGHTH) ||
        Math.abs(note.line - before.line) === 1)) continue;
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (let end = start; end < count; end += 1) {
      low = Math.min(low, ...notes[end].degrees);
      high = Math.max(high, ...notes[end].degrees);
      if (high - low > 4) break;
      if (best[start] + 1 <= best[end + 1]) {
        best[end + 1] = best[start] + 1;
        from[end + 1] = start;
      }
    }
  }
  if (!Number.isFinite(best[count])) return notes.map(() => null);
  const cuts: number[] = [];
  for (let at = count; at > 0; at = from[at]) cuts.unshift(from[at]);
  const out: (number | null)[] = [];
  cuts.forEach((start, index) => {
    const end = cuts[index + 1] ?? count;
    const [low, high] = range(start, end);
    const base = baseOf(low, high, index === 0);
    for (let at = start; at < end; at += 1) out.push(base);
  });
  return out;
}

function fingerFor(hand: SightReadingHand, note: LineNote, base: number): Finger | null {
  const finger = hand === 'rh' ? note.line - base + 1 : base + 4 - note.line + 1;
  return finger >= 1 && finger <= 5 ? (finger as Finger) : null;
}

/** The dynamic of each section start of a long piece: a rise towards the last section. */
function rampMarks(count: number): readonly Mark[] {
  if (count >= 4) return ['p', 'mp', 'mf', 'f', ...Array.from({ length: count - 4 }, (): Mark => 'f')];
  return count === 3 ? ['p', 'mf', 'f'] : count === 2 ? ['mp', 'f'] : ['mf'];
}

/**
 * The markings of a level piece or a long piece. The same piece always gets the same markings: they are seeded from
 * the piece's seed and its fingerprint. A long piece is marked section by section with each section's level, and
 * gets a dynamic at every section start.
 */
export function srtLevelMarkings(piece: GeneratedPiece): LevelMarkings {
  const random = random32(srtHashText(`marks|${piece.seed}|${srtLevelFingerprint(piece)}`));
  const { bar, beat: meterBeat } = srtMeterTicks(piece.meter);
  const sections = sectionsOf(piece);
  const long = sections.length > 1 || (piece as { readonly sections?: unknown }).sections !== undefined;
  const lines: Readonly<Record<SightReadingHand, readonly LineNote[]>> = { rh: srtHandLine(piece, 'rh'), lh: srtHandLine(piece, 'lh') };
  const melody = srtMelodyLine(piece);
  const onsetAt = (tick: number): boolean => HANDS.some((hand) => lines[hand].some((note) => note.onset === tick));
  const tied = (note: LineNote): boolean => (note.onset % bar) + note.duration > bar;

  const dynamics: { beat: number; mark: Mark }[] = [];
  const hairpins: { from: number; to: number; kind: 'cresc' | 'dim' }[] = [];
  const fingering: { hand: SightReadingHand; beat: number; finger: Finger }[] = [];
  const articulations: { hand: SightReadingHand; beat: number; kind: 'staccato' | 'accent' }[] = [];
  const slurs: { hand: SightReadingHand; from: number; to: number }[] = [];

  // Dynamics: one opening mark always. A long piece marks every section start; a short one may add a contrast later.
  if (long) {
    const marks = rampMarks(sections.length);
    sections.forEach((section, index) => dynamics.push({ beat: beatOf(section.startBar * bar), mark: marks[index] }));
  } else {
    const opening: Mark = piece.level <= 2 ? pick(random, ['mf', 'mf', 'p', 'mp']) : pick(random, ['mf', 'p', 'mp', 'f']);
    dynamics.push({ beat: 0, mark: opening });
    const starts = Array.from({ length: Math.floor((piece.bars - 1) / PHRASE) }, (_, index) => (index + 1) * PHRASE * bar).filter(onsetAt);
    if (piece.level >= 2 && starts.length > 0 && random() < 0.5) {
      const contrast: Mark = opening === 'p' || opening === 'mp' ? pick(random, ['mf', 'f']) : opening === 'mf' ? pick(random, ['p', 'f']) : 'mp';
      dynamics.push({ beat: beatOf(pick(random, starts)), mark: contrast });
    }
  }
  const dynamicBeats = dynamics.map((item) => item.beat);
  const clearOfDynamics = (from: number, to: number): boolean => dynamicBeats.every((beat) => beat <= from || beat >= to);

  const lastBase: Record<SightReadingHand, number | null> = { rh: null, lh: null };
  sections.forEach((section, sectionIndex) => {
    const from = section.startBar * bar;
    const to = from + section.bars * bar;
    const inside = (note: LineNote): boolean => note.onset >= from && note.onset < to;
    const level = srtLevel(section.level).id;
    const sectionMelody = melody.filter(inside);
    const lastSection = sectionIndex === sections.length - 1;

    // Fingering: the first note of each hand, and the first note after the hand moves to a new position.
    for (const hand of HANDS) {
      const notes = lines[hand].filter(inside);
      const bases = positions(notes, level);
      notes.forEach((note, index) => {
        const base = bases[index];
        if (base === null || base === lastBase[hand] || (index > 0 && bases[index - 1] === base)) return;
        const finger = fingerFor(hand, note, base);
        if (finger === null) return;
        fingering.push({ hand, beat: beatOf(note.onset), finger });
        lastBase[hand] = base;
      });
    }
    if (level < 3) return;

    // Hairpins: at most one in every eight bars.
    for (let window = from; window < to; window += 8 * bar) {
      const end = Math.min(to, window + 8 * bar);
      const notes = sectionMelody.filter((note) => note.onset >= window && note.onset < end);
      if (notes.length < 3) continue;
      const finalBar = end === to && (!long || lastSection);
      const last = notes[notes.length - 1];
      const dimFrom = notes.find((note) => note.onset >= to - 2 * bar);
      if (finalBar && dimFrom && dimFrom.onset < last.onset && last.duration >= QUARTER * 2 && random() < 0.6 &&
          clearOfDynamics(beatOf(dimFrom.onset), beatOf(last.onset))) {
        hairpins.push({ from: beatOf(dimFrom.onset), to: beatOf(last.onset), kind: 'dim' });
        continue;
      }
      const top = Math.max(...notes.map((note) => note.line));
      const peak = notes.find((note) => note.line === top);
      if (!peak) continue;
      const phraseStart = Math.floor((peak.onset - from) / (PHRASE * bar)) * PHRASE * bar + from;
      const start = notes.find((note) => note.onset >= phraseStart);
      if (start && start.onset < peak.onset && start.line < peak.line && random() < 0.5 && clearOfDynamics(beatOf(start.onset), beatOf(peak.onset))) {
        hairpins.push({ from: beatOf(start.onset), to: beatOf(peak.onset), kind: 'cresc' });
      }
    }

    // Slurs: two to four notes by step in one hand, inside one bar, with no rest and no tie among them.
    const slurred: Record<SightReadingHand, Set<number>> = { rh: new Set(), lh: new Set() };
    let slurCount = 0;
    for (let barIndex = section.startBar; barIndex < section.startBar + section.bars; barIndex += 1) {
      for (const hand of HANDS) {
        if (slurCount >= Math.ceil(section.bars / 2) || random() >= 0.25) continue;
        const notes = lines[hand];
        const runs: number[][] = [];
        let run: number[] = [];
        notes.forEach((note, index) => {
          const single = note.bar === barIndex && note.degrees.length === 1 && !tied(note);
          const joins = run.length > 0 && !note.afterRest && Math.abs(note.line - notes[run[run.length - 1]].line) === 1;
          if (single && joins && run.length < 4) run.push(index);
          else {
            if (run.length >= 2) runs.push(run);
            run = single ? [index] : [];
          }
        });
        if (run.length >= 2) runs.push(run);
        if (runs.length === 0) continue;
        const chosen = pick(random, runs);
        chosen.forEach((index) => slurred[hand].add(index));
        slurs.push({ hand, from: beatOf(notes[chosen[0]].onset), to: beatOf(notes[chosen[chosen.length - 1]].onset) });
        slurCount += 1;
      }
    }

    // Staccato: whole bars of short notes in one hand, in bars that share one rhythm, in at most a quarter of the bars.
    const limit = Math.floor(section.bars / 4);
    if (limit > 0 && random() < 0.6) {
      const hand = pick(random, HANDS);
      const notes = lines[hand];
      const candidates = new Map<string, number[]>();
      for (let barIndex = section.startBar; barIndex < section.startBar + section.bars - 1; barIndex += 1) {
        const indexes = notes.map((note, index) => [note, index] as const).filter(([note]) => note.bar === barIndex).map(([, index]) => index);
        if (indexes.length < 2) continue;
        const next = indexes[indexes.length - 1] + 1;
        const fits = indexes.every((index) => notes[index].duration <= QUARTER && !tied(notes[index]) && !slurred[hand].has(index)) &&
          !slurred[hand].has(next);
        if (!fits) continue;
        const shape = indexes.map((index) => `${notes[index].onset % bar}:${notes[index].duration}`).join(' ');
        candidates.set(shape, [...(candidates.get(shape) ?? []), barIndex]);
      }
      const shapes = [...candidates.keys()];
      if (shapes.length > 0) {
        const bars = candidates.get(pick(random, shapes)) ?? [];
        for (const barIndex of bars.slice(0, limit)) {
          for (const note of notes.filter((item) => item.bar === barIndex)) articulations.push({ hand, beat: beatOf(note.onset), kind: 'staccato' });
        }
      }
    }

    // Accents: from level 5, rarely, on the high point of the section's melody when it falls on a beat.
    if (level >= 5 && random() < 0.3 && sectionMelody.length > 0) {
      const top = Math.max(...sectionMelody.map((note) => note.line));
      const peaks = sectionMelody.filter((note) => note.line === top);
      const peak = peaks[0];
      const hand = piece.melody[peak.bar] ?? 'rh';
      const beat = beatOf(peak.onset);
      const marked = articulations.some((item) => item.hand === hand && item.beat === beat);
      // On a beat of the meter, counted inside the bar: a 3/8 bar starts on an eighth of the piece.
      if (peaks.length === 1 && (peak.onset % bar) % meterBeat === 0 && !marked) articulations.push({ hand, beat, kind: 'accent' });
    }
  });

  const byBeat = <T extends { readonly beat: number }>(list: T[]): T[] => list.sort((a, b) => a.beat - b.beat);
  return {
    dynamics: byBeat(dynamics),
    hairpins: hairpins.sort((a, b) => a.from - b.from),
    fingering: byBeat(fingering),
    articulations: byBeat(articulations),
    slurs: slurs.sort((a, b) => a.from - b.from),
  };
}


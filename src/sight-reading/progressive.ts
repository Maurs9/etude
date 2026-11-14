// A long exercise whose difficulty rises inside the piece: a ramp of sections, each a valid level piece of its own,
// joined into one piece in one key and one meter. The sections can be sliced back out and checked like any piece.
import {
  srtDeepFreeze, srtKeyPool, srtLevel, srtMeterTicks, srtReadingKey,
  type ReadingKey, type ReadingLevelId, type ReadingMeter,
} from './levels.js';
import { srtGenerateLevelPiece, srtHashText } from './melody.js';
import type { SightReadingEvent, SightReadingHand } from './model.js';
import type { PlannedPiece } from './patterns.js';
import { srtDifficulty, srtRuleViolations, srtSubBand, type GeneratedPiece, type RuleId } from './rules.js';

/** One section of a long piece: its level, the third of that level's band, and where it sits, in bars. */
export type ProgressiveSection = { readonly level: number; readonly third: 0 | 1 | 2; readonly startBar: number; readonly bars: number };
/**
 * A long piece. It has the shape of a generated piece, with these differences: `level` is the level asked for, while
 * each section keeps its own level; `patterns` are those of each section's level; `difficulty` is the last
 * section's; `bpm` is the slowest tempo among the section levels and is the tempo to play the whole piece at.
 */
export type ProgressivePiece = GeneratedPiece & { readonly sections: readonly ProgressiveSection[]; readonly bpm: number };
/** What is wrong with a long piece: a rule broken inside a section, or a fault in how the sections are joined. */
export type ProgressiveViolation = { readonly section: number | null; readonly rule: RuleId | 'join'; readonly detail: string };

/** The longest a long piece may be. Sections are dropped from the easy end until it fits. */
export const SRT_LONG_MAX_BARS = 48;

type PlanStep = { readonly level: number; readonly third: 0 | 1 | 2 };
const HANDS: readonly SightReadingHand[] = ['rh', 'lh'];
const meterKey = (meter: ReadingMeter): string => `${meter.num}/${meter.den}`;

function inPool(levelId: number, key: ReadingKey): boolean {
  return srtKeyPool(levelId).some((candidate) => candidate.id === key.id);
}

/**
 * The sections of a long piece, easiest first, ending at the level asked for. A section below that level is kept
 * only when the key belongs to the lower level's pool. Otherwise it moves to the lowest level whose pool has the key
 * (the level asked for when none has it), in the easiest third. The first sections are dropped while the piece is
 * longer than 48 bars.
 */
export function srtProgressivePlan(levelId: number, keyId: string): readonly PlanStep[] {
  const top = srtLevel(levelId).id;
  const key = srtReadingKey(keyId);
  const ramp: readonly (readonly [number, 0 | 1 | 2])[] = top === 1 ? [[1, 0], [1, 1], [1, 2], [1, 2]]
    : top === 2 ? [[1, 1], [1, 2], [2, 1], [2, 2]]
      : [[top - 2, 2], [top - 1, 1], [top, 0], [top, 2]];
  const home = Array.from({ length: top }, (_, index) => index + 1).find((level) => inPool(level, key)) ?? top;
  const plan: PlanStep[] = ramp.map(([level, third]) => (level < top && !inPool(level, key) ? { level: home, third: 0 } : { level, third }));
  const length = (steps: readonly PlanStep[]): number => steps.reduce((sum, step) => sum + srtLevel(step.level).bars[0], 0);
  while (plan.length > 1 && length(plan) > SRT_LONG_MAX_BARS) plan.shift();
  return srtDeepFreeze(plan);
}

const CANDIDATES = 8;

/**
 * A section piece of its level, in its first length, the shared meter and without an upbeat, drawn from the third of
 * the band. The band is applied by choosing among candidates rather than by the generator's band option: with the
 * meter pinned, a third can be rare (level 8 in 3/8), and the band option would spend its whole attempt budget before
 * it fails. When no candidate falls in the third, the one nearest to it is kept: still inside the level's band (G14).
 * Returns null when the generator finds no piece at all in this meter.
 */
function sectionPiece(step: PlanStep, key: ReadingKey, bars: number, meter: ReadingMeter, seedText: string): GeneratedPiece | null {
  const [low, high] = srtSubBand(step.level, step.third);
  const distance = (piece: GeneratedPiece): number => Math.max(0, low - piece.difficulty, piece.difficulty - high);
  let nearest: GeneratedPiece | null = null;
  for (let salt = 0; salt < CANDIDATES; salt += 1) {
    let piece: GeneratedPiece;
    try {
      piece = srtGenerateLevelPiece(step.level, key.id, srtHashText(`${seedText}|${salt}`), { bars, meter, upbeat: false });
    } catch (error) {
      if (error instanceof RangeError) throw error;
      continue;
    }
    if (distance(piece) === 0) return piece;
    if (!nearest || distance(piece) < distance(nearest)) nearest = piece;
  }
  return nearest;
}

/**
 * The long piece of a level in a key. The same three values always give the same piece. Every section is generated
 * as a level piece of its own level (in its third of the band, its level's first length, the shared meter, no
 * upbeat), so every section keeps every rule. Both hands stay in the five-finger positions of the key throughout:
 * those depend on the key only, so the joins have no octave jump.
 */
export function srtGenerateProgressivePiece(levelId: number, keyId: string, seed: number): ProgressivePiece {
  const top = srtLevel(levelId);
  const key = srtReadingKey(keyId);
  if (!Number.isInteger(seed)) throw new RangeError(`Invalid seed: ${seed}`);
  const plan = srtProgressivePlan(top.id, key.id);
  const levels = plan.map((step) => srtLevel(step.level));
  const shared = levels[0].meters.filter((meter) => levels.every((level) => level.meters.some((other) => meterKey(other) === meterKey(meter))));
  // The seed picks the meter. When some section has no piece in it, the next shared meter is tried.
  const first = srtHashText(`long-meter|${top.id}|${key.id}|${seed}`) % shared.length;
  let meter: ReadingMeter | null = null;
  let parts: GeneratedPiece[] = [];
  for (let turn = 0; turn < shared.length && meter === null; turn += 1) {
    const candidate = shared[(first + turn) % shared.length];
    const made = plan.map((step, index) =>
      sectionPiece(step, key, srtLevel(step.level).bars[0], candidate, `long-section|${top.id}|${key.id}|${seed}|${index}`));
    if (made.every((part): part is GeneratedPiece => part !== null)) {
      meter = candidate;
      parts = made;
    }
  }
  if (meter === null) throw new Error(`No long level ${top.id} piece in ${key.id} for seed ${seed}`);
  const { bar } = srtMeterTicks(meter);
  const sections: ProgressiveSection[] = [];
  let startBar = 0;
  plan.forEach((step) => {
    const bars = srtLevel(step.level).bars[0];
    sections.push({ level: step.level, third: step.third, startBar, bars });
    startBar += bars;
  });
  const byHand: Record<SightReadingHand, SightReadingEvent[]> = { rh: [], lh: [] };
  parts.forEach((part, index) => {
    const offset = sections[index].startBar * bar;
    for (const hand of HANDS) {
      const events = part.events.filter((event) => event.hand === hand).sort((a, b) => a.onsetTick - b.onsetTick);
      for (const event of events) byHand[hand].push({ ...event, onsetTick: event.onsetTick + offset });
    }
  });
  const events = HANDS.flatMap((hand) => byHand[hand].map((event, index) => ({ ...event, id: `${hand}-${index}` })));
  return srtDeepFreeze({
    schemaVersion: 1, generatorVersion: 2, level: top.id, seed, meter, ticksPerQuarter: 480, key, bars: startBar, events,
    chords: parts.flatMap((part) => part.chords), melody: parts.flatMap((part) => part.melody), upbeat: false,
    patterns: parts.flatMap((part) => part.patterns), difficulty: parts[parts.length - 1].difficulty,
    sections, bpm: Math.min(...levels.map((level) => level.bpm)),
  });
}

/** One section cut out of a long piece, moved to bar 1, as a piece of the section's level. */
function sliceSection(piece: ProgressivePiece, section: ProgressiveSection): GeneratedPiece {
  const { bar } = srtMeterTicks(piece.meter);
  const from = section.startBar * bar;
  const to = from + section.bars * bar;
  const planned: PlannedPiece = {
    schemaVersion: 1, generatorVersion: 2, level: section.level as ReadingLevelId, seed: piece.seed, meter: piece.meter,
    ticksPerQuarter: 480, key: piece.key, bars: section.bars,
    events: piece.events.filter((event) => event.onsetTick >= from && event.onsetTick < to)
      .map((event) => ({ ...event, onsetTick: event.onsetTick - from })),
    chords: piece.chords.slice(section.startBar, section.startBar + section.bars),
    melody: piece.melody.slice(section.startBar, section.startBar + section.bars),
    upbeat: false,
  };
  // Only the last section's score is stored on the long piece: each slice is scored again, and G14 checks its band.
  return { ...planned, patterns: piece.patterns.slice(section.startBar, section.startBar + section.bars), difficulty: srtDifficulty(planned) };
}

/**
 * Everything wrong with a long piece: each section, cut back out, is checked with the normal validator and rules of
 * its own level, and the joins are checked too (the sections tile the piece, no note crosses a join, ids are unique,
 * one meter). An empty list means the piece may be shown.
 */
export function srtProgressiveViolations(piece: ProgressivePiece): readonly ProgressiveViolation[] {
  const out: ProgressiveViolation[] = [];
  const join = (detail: string): void => {
    out.push({ section: null, rule: 'join', detail });
  };
  // A plain yes or no: Array.isArray as a type guard would turn the readonly lists into untyped ones below.
  const isList = (value: unknown): boolean => Array.isArray(value);
  if (!piece || !isList(piece.sections) || piece.sections.length === 0 || !isList(piece.events) || !piece.meter) {
    return [{ section: null, rule: 'join', detail: 'not a long piece' }];
  }
  const { bar } = srtMeterTicks(piece.meter);
  let cursor = 0;
  for (const section of piece.sections) {
    if (section.startBar !== cursor || !Number.isInteger(section.bars) || section.bars < 1) join(`section at bar ${section.startBar + 1} does not follow on`);
    cursor = section.startBar + section.bars;
  }
  if (cursor !== piece.bars) join(`the sections cover ${cursor} bars, the piece has ${piece.bars}`);
  if (piece.bars > SRT_LONG_MAX_BARS) join(`${piece.bars} bars is longer than ${SRT_LONG_MAX_BARS}`);
  for (const [name, list] of [['chords', piece.chords], ['melody', piece.melody], ['patterns', piece.patterns]] as const) {
    if (!Array.isArray(list) || list.length !== piece.bars) join(`${name} has no entry for every bar`);
  }
  if (piece.upbeat) join('a long piece has no upbeat');
  const ids = new Set<string>();
  for (const event of piece.events) {
    if (ids.has(event.id)) join(`repeated id ${event.id}`);
    ids.add(event.id);
    if (!new RegExp(`^${event.hand}-\\d+$`).test(event.id)) join(`id ${event.id} is not in the hand-index form`);
    const crosses = piece.sections.some((section) => {
      const start = section.startBar * bar;
      return event.onsetTick < start && event.onsetTick + event.durationTick > start;
    });
    if (crosses) join(`event ${event.id} sounds across a join`);
    if (event.onsetTick < 0 || event.onsetTick + event.durationTick > piece.bars * bar) join(`event ${event.id} lies outside the piece`);
  }
  for (const section of piece.sections) {
    const level = srtLevel(section.level);
    if (!level.meters.some((meter) => meterKey(meter) === meterKey(piece.meter))) join(`level ${level.id} has no ${meterKey(piece.meter)}`);
  }
  if (out.length > 0) return out;
  piece.sections.forEach((section, index) => {
    for (const broken of srtRuleViolations(sliceSection(piece, section))) out.push({ section: index, rule: broken.rule, detail: broken.detail });
  });
  return out;
}

// The 2-minute warm-up of the Read page (section 9 of docs/plans/2026-11-13-read-redesign-spec.md).
// It starts with pattern flash cards: one bar is shown for a moment, then hidden, and the reader plays it.
import { srtDegreePitch, srtLevel, srtMeterTicks, srtReadingKey, type LevelPiece, type ReadingPatternId } from './levels.js';
import { srtGenerateLevelPiece, srtHashText } from './melody.js';
import type { SightReadingHand } from './model.js';
import type { LevelScore, LevelScoreToken } from './score.js';

/** How long a flash card stays visible. */
export const SRT_FLASH_MS = 2000;

export type FlashCard = {
  readonly level: number;
  readonly key: string;
  readonly hand: SightReadingHand;
  /** One bar for the engraver. The other hand is left out. */
  readonly score: LevelScore;
  /** The notes to play, in order: one MIDI number per entry. */
  readonly notes: readonly (readonly number[])[];
  readonly patterns: readonly ReadingPatternId[];
};

/**
 * One bar of a piece as a flash card, or null when the bar does not suit: fewer than three notes in the hand,
 * a note that runs past the bar, or a chord (the on-screen keys cannot play two notes at once).
 */
function cardFromBar(piece: LevelPiece & { readonly patterns: readonly (readonly ReadingPatternId[])[] }, bar: number, hand: SightReadingHand): FlashCard | null {
  const { bar: ticks } = srtMeterTicks(piece.meter);
  const start = bar * ticks;
  const events = piece.events.filter((event) => event.hand === hand && event.onsetTick >= start && event.onsetTick < start + ticks)
    .sort((a, b) => a.onsetTick - b.onsetTick);
  const sounding = events.filter((event) => event.pitches.length > 0);
  const whole = events.reduce((sum, event) => sum + event.durationTick, 0) === ticks && events[0]?.onsetTick === start;
  if (sounding.length < 3 || !whole || sounding.some((event) => event.pitches.length > 1)) return null;
  const tokens: LevelScoreToken[] = events.map((event) => {
    const names = event.pitches.map((pitch) => pitch.spelling);
    return [names.length === 0 ? 'R' : names.length === 1 ? names[0] : names, event.durationTick / 480];
  });
  return {
    level: piece.level, key: piece.key.id, hand,
    score: {
      ts: [piece.meter.num, piece.meter.den], keyN: piece.key.keyN, minor: piece.key.mode === 'minor',
      bpm: srtLevel(piece.level).bpm, engrave: 2, rh: hand === 'rh' ? tokens : [], lh: hand === 'lh' ? tokens : [],
    },
    notes: sounding.map((event) => event.pitches.map((pitch) => pitch.midi)),
    patterns: piece.patterns[bar],
  };
}

/**
 * Flash cards for a level and key: bars taken from generated pieces, so they use the patterns of the level.
 * The name makes the set: the same name always gives the same cards.
 */
export function srtFlashCards(levelId: number, keyId: string, name: string, count = 6): readonly FlashCard[] {
  const level = srtLevel(levelId);
  const key = srtReadingKey(keyId);
  const cards: FlashCard[] = [];
  const seen = new Set<string>();
  for (let salt = 0; cards.length < count && salt < count * 20; salt += 1) {
    const piece = srtGenerateLevelPiece(level.id, key.id, srtHashText(`flash|${name}|${salt}`));
    const bars = Array.from({ length: piece.bars - 1 }, (_, bar) => bar).filter((bar) => !(piece.upbeat && bar === 0));
    const bar = bars[srtHashText(`flash-bar|${name}|${salt}`) % bars.length];
    const card = cardFromBar(piece, bar, piece.melody[bar]);
    const print = card ? JSON.stringify([card.hand, card.score.ts, card.score.rh, card.score.lh]) : '';
    if (!card || seen.has(print)) continue;
    seen.add(print);
    cards.push(card);
  }
  return cards;
}

/** One step of the warm-up. */
export type WarmupStep =
  | { readonly kind: 'flash'; readonly cards: readonly FlashCard[] }
  /** Play the shown note: single notes in the hand position of the key. `low` and `high` are pitch names like `C4`. */
  | { readonly kind: 'position'; readonly hand: SightReadingHand; readonly clef: 'treble' | 'bass'; readonly low: string; readonly high: string; readonly keyN: number; readonly count: number }
  /** A level of an existing drill unit, by its id (for example `rh2`). */
  | { readonly kind: 'drill'; readonly id: string };

/** The rhythm drill that goes with each reading level: quarters and halves, eighths, dotted notes, sixteenths. */
const RHYTHM_DRILL: Readonly<Record<number, string>> = { 1: 'rh1', 2: 'rh3', 3: 'rh2', 4: 'rh2', 5: 'rh4', 6: 'rh5', 7: 'rh5', 8: 'rh5' };
/** From level 6 the warm-up ends with chords: major and minor triads, then all four kinds, then inversions. */
const CHORD_DRILL: Readonly<Record<number, string>> = { 6: 'ch1', 7: 'ch2', 8: 'ch3' };

/** The warm-up of a level in a key. The name (a date, for example) makes the flash cards. */
export function srtWarmupPlan(levelId: number, keyId: string, name: string): readonly WarmupStep[] {
  const level = srtLevel(levelId);
  const key = srtReadingKey(keyId);
  const position = (hand: SightReadingHand): WarmupStep => ({
    kind: 'position', hand, clef: hand === 'rh' ? 'treble' : 'bass', keyN: key.keyN, count: 5,
    low: srtDegreePitch(key, hand, Math.max(0, level.degrees[0])).spelling,
    high: srtDegreePitch(key, hand, Math.min(7, level.degrees[1])).spelling,
  });
  const steps: WarmupStep[] = [
    { kind: 'flash', cards: srtFlashCards(level.id, key.id, name) },
    position('rh'),
    position('lh'),
    { kind: 'drill', id: RHYTHM_DRILL[level.id] },
  ];
  const chords = CHORD_DRILL[level.id];
  if (chords) steps.push({ kind: 'drill', id: chords });
  return steps;
}

/** True when the notes played match a flash card: the same notes in the same order, in any octave when allowed. */
export function srtFlashMatches(card: FlashCard, played: readonly (readonly number[])[], anyOctave = false): boolean {
  const fold = (midi: number): number => (anyOctave ? ((midi % 12) + 12) % 12 : midi);
  const same = (a: readonly number[], b: readonly number[]): boolean => {
    const left = a.map(fold).sort((x, y) => x - y);
    const right = b.map(fold).sort((x, y) => x - y);
    return left.length === right.length && left.every((value, index) => value === right[index]);
  };
  return played.length === card.notes.length && card.notes.every((notes, index) => same(notes, played[index]));
}

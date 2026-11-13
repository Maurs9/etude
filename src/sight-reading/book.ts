// The numbered book of each reading level, the runs in one key, and the daily set
// (section 7 of docs/plans/2026-11-13-read-redesign-spec.md). Nothing here is stored: every piece is generated.
import { srtLevelFingerprint } from './fingerprint.js';
import { srtKeyPool, srtLevel, srtReadingKey, type ReadingKeyId } from './levels.js';
import { srtGenerateLevelPiece, srtHashText, srtTransposeLevelPiece } from './melody.js';
import { srtSubBand, type GeneratedPiece } from './rules.js';

export const SRT_BOOK_UNITS = 12;
export const SRT_UNIT_PIECES = 8;
export const SRT_BOOK_PIECES = SRT_BOOK_UNITS * SRT_UNIT_PIECES;
export const SRT_FOCUS_PIECES = 20;
export const SRT_DAILY_PIECES = 5;

/** easy: the three easiest keys. newKey: one key that is new at the level. mix: every key met so far. check: the whole pool. */
export type BookUnitKind = 'easy' | 'newKey' | 'mix' | 'check';
export type BookUnit = { readonly index: number; readonly kind: BookUnitKind; readonly keys: readonly ReadingKeyId[] };
export type BookEntry = {
  readonly level: number;
  /** 1 to 96. */
  readonly number: number;
  readonly unit: BookUnit;
  /** 0 to 7: the place of the piece in its unit. */
  readonly position: number;
  readonly key: ReadingKeyId;
  /** Which third of the level's difficulty band the piece is drawn from: a unit rises from 0 to 2. */
  readonly third: 0 | 1 | 2;
  /** The number of the piece this one repeats in another key ("same shape, new key"), or null. */
  readonly twinOf: number | null;
};

/** The 12 units of a level's book, in order. */
export function srtBookUnits(levelId: number): readonly BookUnit[] {
  const level = srtLevel(levelId);
  const met: ReadingKeyId[] = level.id > 1 ? srtKeyPool(level.id - 1).map((key) => key.id) : [];
  const units: { kind: BookUnitKind; keys: readonly ReadingKeyId[] }[] = [];
  // A level that follows another opens in familiar keys, so its new patterns are met there first.
  if (met.length > 0) units.push({ kind: 'easy', keys: met.slice(0, 3) });
  level.newKeys.forEach((key, index) => {
    met.push(key);
    units.push({ kind: 'newKey', keys: [key] });
    if (index % 2 === 1) units.push({ kind: 'mix', keys: [...met] });
  });
  while (units.length < SRT_BOOK_UNITS) units.push({ kind: 'mix', keys: [...met] });
  units[SRT_BOOK_UNITS - 1] = { kind: 'check', keys: [...met] };
  return units.slice(0, SRT_BOOK_UNITS).map((unit, index) => ({ ...unit, index }));
}

/** The keys of a unit in a fixed shuffled order: the order is part of the book. */
function unitKeyOrder(levelId: number, unit: BookUnit): readonly ReadingKeyId[] {
  return unit.keys
    .map((key) => ({ key, rank: srtHashText(`order|${levelId}|${unit.index}|${key}`) }))
    .sort((a, b) => a.rank - b.rank)
    .map((item) => item.key);
}

/** Where a numbered piece sits in the book, and in which key. */
export function srtBookEntry(levelId: number, number: number): BookEntry {
  const level = srtLevel(levelId);
  if (!Number.isInteger(number) || number < 1 || number > SRT_BOOK_PIECES) throw new RangeError(`No piece ${number} in the book`);
  const unit = srtBookUnits(level.id)[Math.floor((number - 1) / SRT_UNIT_PIECES)];
  const position = (number - 1) % SRT_UNIT_PIECES;
  const order = unitKeyOrder(level.id, unit);
  const keyAt = (place: number): ReadingKeyId => order[place % order.length];
  let key = keyAt(position);
  let twinOf: number | null = null;
  // In a unit with several keys, the fourth piece repeats the third in another key of the same mode.
  if (unit.keys.length > 1 && position === 3) {
    const model = srtReadingKey(keyAt(2));
    const other = order.find((candidate) => candidate !== model.id && candidate !== 'G#m' && srtReadingKey(candidate).mode === model.mode);
    if (other && model.id !== 'G#m') {
      key = other;
      twinOf = number - 1;
    }
  }
  return { level: level.id, number, unit, position, key, third: position < 3 ? 0 : position < 6 ? 1 : 2, twinOf };
}

const BOOKS = new Map<number, readonly GeneratedPiece[]>();
const FOCUS = new Map<string, readonly GeneratedPiece[]>();

/** A new piece whose fingerprint is not in `seen`. The name gives the seed, and a counter is added until the piece is new. */
function fresh(levelId: number, key: ReadingKeyId, name: string, band: readonly [number, number] | undefined, seen: ReadonlySet<string>): GeneratedPiece {
  for (let salt = 0; salt < 200; salt += 1) {
    const piece = srtGenerateLevelPiece(levelId, key, srtHashText(`${name}|${salt}`), band ? { band } : {});
    if (!seen.has(srtLevelFingerprint(piece))) return piece;
  }
  throw new Error(`No new piece for ${name}`);
}

/** All 96 pieces of a level's book. They are built once, in order, so that no two are the same. */
export function srtBook(levelId: number): readonly GeneratedPiece[] {
  const level = srtLevel(levelId);
  const known = BOOKS.get(level.id);
  if (known) return known;
  const pieces: GeneratedPiece[] = [];
  const seen = new Set<string>();
  for (let number = 1; number <= SRT_BOOK_PIECES; number += 1) {
    const entry = srtBookEntry(level.id, number);
    const twin = entry.twinOf === null ? null : srtTransposeLevelPiece(pieces[entry.twinOf - 1], entry.key);
    const piece = twin && !seen.has(srtLevelFingerprint(twin)) ? twin
      : fresh(level.id, entry.key, `book|${level.id}|${number}`, srtSubBand(level.id, entry.third), seen);
    seen.add(srtLevelFingerprint(piece));
    pieces.push(piece);
  }
  BOOKS.set(level.id, pieces);
  return pieces;
}

/** Piece 1 to 96 of a level's book. A number always gives the same piece. */
export function srtBookPiece(levelId: number, number: number): GeneratedPiece {
  return srtBook(levelId)[srtBookEntry(levelId, number).number - 1];
}

/** The 20 pieces of a level in one key. They are not pieces of the book. */
export function srtFocusRun(levelId: number, keyId: string): readonly GeneratedPiece[] {
  const level = srtLevel(levelId);
  const key = srtReadingKey(keyId);
  const name = `${level.id}|${key.id}`;
  const known = FOCUS.get(name);
  if (known) return known;
  const seen = new Set(srtBook(level.id).map(srtLevelFingerprint));
  const pieces: GeneratedPiece[] = [];
  for (let number = 1; number <= SRT_FOCUS_PIECES; number += 1) {
    const third = number <= 7 ? 0 : number <= 14 ? 1 : 2;
    const piece = fresh(level.id, key.id, `focus|${name}|${number}`, srtSubBand(level.id, third), seen);
    seen.add(srtLevelFingerprint(piece));
    pieces.push(piece);
  }
  FOCUS.set(name, pieces);
  return pieces;
}

/** Piece 1 to 20 of a level in one key. */
export function srtFocusPiece(levelId: number, keyId: string, number: number): GeneratedPiece {
  if (!Number.isInteger(number) || number < 1 || number > SRT_FOCUS_PIECES) throw new RangeError(`No piece ${number} in a key run`);
  return srtFocusRun(levelId, keyId)[number - 1];
}

export type DailyRole = 'easier' | 'level' | 'stretch';
export type DailySlot = { readonly slot: number; readonly role: DailyRole; readonly level: number; readonly key: ReadingKeyId };
export type DailyOptions = {
  /** A pinned key: every piece of the set is in it. */
  readonly focusKey?: string;
  /** The mean first-sight score of each key at the level, 0 to 100. A key without a score has not been played. */
  readonly scores?: Readonly<Partial<Record<ReadingKeyId, number>>>;
};

const isDate = (date: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(date);

/**
 * The five pieces of a day: one a level below, three at the level, one a level above.
 * In mixed keys the three level pieces use the newest key played, the weakest key, and one more key of the pool.
 */
export function srtDailyPlan(date: string, levelId: number, options: DailyOptions = {}): readonly DailySlot[] {
  if (!isDate(date)) throw new RangeError(`Invalid date: ${date}`);
  const level = srtLevel(levelId);
  const below = Math.max(1, level.id - 1);
  const above = Math.min(8, level.id + 1);
  const levels: readonly (readonly [DailyRole, number])[] = [['easier', below], ['level', level.id], ['level', level.id], ['level', level.id], ['stretch', above]];
  if (options.focusKey !== undefined) {
    const key = srtReadingKey(options.focusKey).id;
    return levels.map(([role, slotLevel], slot) => ({ slot, role, level: slotLevel, key }));
  }
  const pool = srtKeyPool(level.id).map((key) => key.id);
  const scores = options.scores ?? {};
  const played = pool.filter((key) => scores[key] !== undefined);
  const chosen: ReadingKeyId[] = [];
  const take = (key: ReadingKeyId | undefined): void => {
    if (key !== undefined && !chosen.includes(key)) chosen.push(key);
  };
  take(played[played.length - 1]);
  take([...played].sort((a, b) => (scores[a] ?? 0) - (scores[b] ?? 0)).find((key) => !chosen.includes(key)));
  const shuffled = pool.map((key) => ({ key, rank: srtHashText(`daily|${date}|${level.id}|${key}`) })).sort((a, b) => a.rank - b.rank).map((item) => item.key);
  for (const key of shuffled) {
    if (chosen.length < 3) take(key);
  }
  const from = (keys: readonly ReadingKeyId[], name: string): ReadingKeyId => keys[srtHashText(`daily|${date}|${name}`) % keys.length];
  const easier = from(srtKeyPool(below).map((key) => key.id), 'easier');
  const stretch = from(srtKeyPool(above).map((key) => key.id).slice(0, 3), 'stretch');
  const keys = [easier, chosen[0], chosen[1 % chosen.length], chosen[2 % chosen.length], stretch];
  return levels.map(([role, slotLevel], slot) => ({ slot, role, level: slotLevel, key: keys[slot] }));
}

/**
 * The piece of one slot of a day. It is never a piece of the book, and never a piece whose fingerprint is in `avoid`
 * (the pieces the reader has already seen).
 */
export function srtDailyPiece(date: string, slot: DailySlot, avoid: ReadonlySet<string> = new Set()): GeneratedPiece {
  if (!isDate(date)) throw new RangeError(`Invalid date: ${date}`);
  const seen = new Set([...srtBook(slot.level).map(srtLevelFingerprint), ...avoid]);
  return fresh(slot.level, slot.key, `daily|${date}|${slot.level}|${slot.slot}|${slot.key}`, undefined, seen);
}

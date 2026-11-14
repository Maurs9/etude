// The numbered book of each reading level, the runs in one key, and the daily set
// (section 7 of docs/plans/2026-11-13-read-redesign-spec.md). Nothing here is stored: every piece is generated.
import { srtLevelFingerprint } from './fingerprint.js';
import { srtDegreePitch, srtKeyPool, srtLevel, srtReadingKey, type ReadingKey, type ReadingKeyId } from './levels.js';
import { srtGenerateLevelPiece, srtHashText, srtTransposeLevelPiece } from './melody.js';
import { srtSubBand, type GeneratedPiece } from './rules.js';
import { srtGenerateProgressivePiece, type ProgressivePiece } from './progressive.js';

export const SRT_BOOK_UNITS = 12;
export const SRT_UNIT_PIECES = 8;
export const SRT_BOOK_PIECES = SRT_BOOK_UNITS * SRT_UNIT_PIECES;
export const SRT_FOCUS_PIECES = 20;
export const SRT_DAILY_PIECES = 5;
/** The score a key or a level must reach, on average, to count as secure. */
export const SRT_SECURE_SCORE = 85;
/**
 * Up to this level a new piece is also compared with every piece of the level's book. The lower levels have few
 * possible pieces, so a chance repeat is real there. Above it the number of possible pieces makes one negligible.
 */
const SMALL_LEVELS = 3;

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
  /**
   * The number of the piece this one is meant to repeat in another key ("same shape, new key"), or null.
   * A few pieces cannot be moved to the other key: such a piece is then a new one.
   */
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

/** How many octaves lie between the two hand positions of a key. A piece moves best to a key with the same distance. */
function handDistance(key: ReadingKey): number {
  return Math.round((srtDegreePitch(key, 'rh', 0).midi - srtDegreePitch(key, 'lh', 0).midi) / 12);
}

const UNIT_KEYS = new Map<number, readonly (readonly ReadingKeyId[])[]>();

/**
 * The key of each of the 8 pieces of every unit of a level. A unit with several keys starts with the keys that are
 * new since the last such unit, then takes the keys that have waited longest, so every key of the pool comes round.
 * Its fourth piece is in a key that can repeat the third: the same mode, and the same distance between the hands.
 */
function unitKeys(levelId: number): readonly (readonly ReadingKeyId[])[] {
  const known = UNIT_KEYS.get(levelId);
  if (known) return known;
  const rank = (key: ReadingKeyId): number => srtHashText(`rank|${levelId}|${key}`);
  const lastUsed = new Map<ReadingKeyId, number>();
  let clock = 0;
  let newSince: ReadingKeyId[] = [];
  const out = srtBookUnits(levelId).map((unit) => {
    let keys: ReadingKeyId[];
    if (unit.kind === 'newKey') {
      newSince.push(unit.keys[0]);
      keys = Array.from({ length: SRT_UNIT_PIECES }, () => unit.keys[0]);
    } else {
      const first = unit.kind === 'easy' ? [] : newSince.slice(0, SRT_UNIT_PIECES);
      const waiting = unit.keys.filter((key) => !first.includes(key))
        .sort((a, b) => (lastUsed.get(a) ?? -1) - (lastUsed.get(b) ?? -1) || rank(a) - rank(b));
      const source = waiting.length > 0 ? waiting : first;
      keys = [...first];
      for (let index = 0; keys.length < SRT_UNIT_PIECES; index += 1) keys.push(source[index % source.length]);
      if (unit.kind !== 'easy') newSince = [];
      // The fourth piece repeats the third in another key.
      const model = srtReadingKey(keys[2]);
      const twins = unit.keys.filter((key) => key !== model.id && key !== 'G#m' && srtReadingKey(key).mode === model.mode);
      const near = twins.filter((key) => handDistance(srtReadingKey(key)) === handDistance(model));
      const options = near.length > 0 ? near : twins;
      if (model.id !== 'G#m' && options.length > 0) keys[3] = options.includes(keys[3]) ? keys[3] : options[0];
    }
    for (const key of keys) {
      lastUsed.set(key, clock);
      clock += 1;
    }
    return keys;
  });
  UNIT_KEYS.set(levelId, out);
  return out;
}

/** Where a numbered piece sits in the book, and in which key. */
export function srtBookEntry(levelId: number, number: number): BookEntry {
  const level = srtLevel(levelId);
  if (!Number.isInteger(number) || number < 1 || number > SRT_BOOK_PIECES) throw new RangeError(`No piece ${number} in the book`);
  const unit = srtBookUnits(level.id)[Math.floor((number - 1) / SRT_UNIT_PIECES)];
  const position = (number - 1) % SRT_UNIT_PIECES;
  const keys = unitKeys(level.id)[unit.index];
  const key = keys[position];
  const twin = unit.keys.length > 1 && position === 3 && keys[2] !== key && keys[2] !== 'G#m' && key !== 'G#m' &&
    srtReadingKey(keys[2]).mode === srtReadingKey(key).mode;
  return { level: level.id, number, unit, position, key, third: position < 3 ? 0 : position < 6 ? 1 : 2, twinOf: twin ? number - 1 : null };
}

/** A candidate piece for a name and a counter, or null when the generator finds none. */
function candidate(levelId: number, key: ReadingKeyId, name: string, salt: number, band?: readonly [number, number]): GeneratedPiece | null {
  try {
    return srtGenerateLevelPiece(levelId, key, srtHashText(`${name}|${salt}`), band ? { band } : {});
  } catch (error) {
    if (error instanceof RangeError) throw error;
    return null;
  }
}

/** A new piece whose fingerprint is not in `seen`. The name gives the seed, and a counter is added until the piece is new. */
function fresh(levelId: number, key: ReadingKeyId, name: string, band: readonly [number, number] | undefined, seen: ReadonlySet<string>): GeneratedPiece {
  for (let salt = 0; salt < 200; salt += 1) {
    const piece = candidate(levelId, key, name, salt, band);
    if (piece && !seen.has(srtLevelFingerprint(piece))) return piece;
  }
  throw new Error(`No new piece for ${name}`);
}

type Shelf = { readonly pieces: GeneratedPiece[]; readonly seen: Set<string> };
const BOOKS = new Map<number, Shelf>();
const RUNS = new Map<string, Shelf>();

/** The first pieces of a level's book, up to a number. They are built in order, so that no two are the same. */
function bookUpTo(levelId: number, number: number): Shelf {
  const shelf = BOOKS.get(levelId) ?? { pieces: [], seen: new Set<string>() };
  BOOKS.set(levelId, shelf);
  while (shelf.pieces.length < number) {
    const entry = srtBookEntry(levelId, shelf.pieces.length + 1);
    const twin = entry.twinOf === null ? null : srtTransposeLevelPiece(shelf.pieces[entry.twinOf - 1], entry.key);
    const piece = twin && !shelf.seen.has(srtLevelFingerprint(twin)) ? twin
      : fresh(levelId, entry.key, `book|${levelId}|${entry.number}`, srtSubBand(levelId, entry.third), shelf.seen);
    shelf.seen.add(srtLevelFingerprint(piece));
    shelf.pieces.push(piece);
  }
  return shelf;
}

/** All 96 pieces of a level's book. */
export function srtBook(levelId: number): readonly GeneratedPiece[] {
  return bookUpTo(srtLevel(levelId).id, SRT_BOOK_PIECES).pieces;
}

/**
 * Piece 1 to 96 of a level's book. A number always gives the same piece.
 * Only the pieces up to that number are built, so opening an early piece is quick.
 */
export function srtBookPiece(levelId: number, number: number): GeneratedPiece {
  const entry = srtBookEntry(levelId, number);
  return bookUpTo(entry.level, entry.number).pieces[entry.number - 1];
}

/** The fingerprints of a level's book, for the levels where a chance repeat is real. */
function bookPrints(levelId: number): ReadonlySet<string> {
  return levelId <= SMALL_LEVELS ? bookUpTo(levelId, SRT_BOOK_PIECES).seen : new Set<string>();
}

function runUpTo(levelId: number, key: ReadingKeyId, number: number): Shelf {
  const name = `${levelId}|${key}`;
  const shelf = RUNS.get(name) ?? { pieces: [], seen: new Set(bookPrints(levelId)) };
  RUNS.set(name, shelf);
  while (shelf.pieces.length < number) {
    const next = shelf.pieces.length + 1;
    const piece = fresh(levelId, key, `focus|${name}|${next}`, srtSubBand(levelId, next <= 7 ? 0 : next <= 14 ? 1 : 2), shelf.seen);
    shelf.seen.add(srtLevelFingerprint(piece));
    shelf.pieces.push(piece);
  }
  return shelf;
}

/** The 20 pieces of a level in one key. They are not pieces of the book. */
export function srtFocusRun(levelId: number, keyId: string): readonly GeneratedPiece[] {
  return runUpTo(srtLevel(levelId).id, srtReadingKey(keyId).id, SRT_FOCUS_PIECES).pieces;
}

/** Piece 1 to 20 of a level in one key. */
export function srtFocusPiece(levelId: number, keyId: string, number: number): GeneratedPiece {
  if (!Number.isInteger(number) || number < 1 || number > SRT_FOCUS_PIECES) throw new RangeError(`No piece ${number} in a key run`);
  return runUpTo(srtLevel(levelId).id, srtReadingKey(keyId).id, number).pieces[number - 1];
}

export type DailyRole = 'easier' | 'level' | 'stretch';
export type DailySlot = {
  readonly slot: number;
  readonly role: DailyRole;
  readonly level: number;
  readonly key: ReadingKeyId;
  /** The counter that, with the date, the level, the slot and the key, gives the piece. */
  readonly salt: number;
};
export type DailyOptions = {
  /** A pinned key: every piece of the set is in it. */
  readonly focusKey?: string;
  /** The mean first-sight score of each key at the level, 0 to 100. A key without a score has not been played. */
  readonly scores?: Readonly<Partial<Record<ReadingKeyId, number>>>;
  /** Fingerprints of the pieces the reader has seen: the set avoids them. */
  readonly seen?: ReadonlySet<string>;
};

const isDate = (date: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(date);
const dailyName = (date: string, slot: Omit<DailySlot, 'salt'>): string => `daily|${date}|${slot.level}|${slot.slot}|${slot.key}`;

/**
 * The five pieces of a day: one a level below, three at the level, one a level above.
 * In mixed keys the three level pieces lean on the keys that need work: the newest key that is not secure yet,
 * the weakest key that is not secure, and then keys of the pool in an order that changes every day.
 * No piece of the set is one the reader has seen, a piece of the book of a low level, or another piece of the set.
 */
export function srtDailyPlan(date: string, levelId: number, options: DailyOptions = {}): readonly DailySlot[] {
  if (!isDate(date)) throw new RangeError(`Invalid date: ${date}`);
  const level = srtLevel(levelId);
  const below = Math.max(1, level.id - 1);
  const above = Math.min(8, level.id + 1);
  const levels: readonly (readonly [DailyRole, number])[] = [['easier', below], ['level', level.id], ['level', level.id], ['level', level.id], ['stretch', above]];
  let keys: ReadingKeyId[];
  if (options.focusKey !== undefined) {
    const key = srtReadingKey(options.focusKey).id;
    keys = levels.map(() => key);
  } else {
    const pool = srtKeyPool(level.id).map((key) => key.id);
    const scores = options.scores ?? {};
    const open = pool.filter((key) => (scores[key] ?? SRT_SECURE_SCORE) < SRT_SECURE_SCORE);
    const chosen: ReadingKeyId[] = [];
    const take = (key: ReadingKeyId | undefined): void => {
      if (key !== undefined && !chosen.includes(key)) chosen.push(key);
    };
    take(open[open.length - 1]);
    take([...open].sort((a, b) => (scores[a] ?? 0) - (scores[b] ?? 0)).find((key) => !chosen.includes(key)));
    const shuffled = pool.map((key) => ({ key, rank: srtHashText(`daily|${date}|${level.id}|${key}`) })).sort((a, b) => a.rank - b.rank).map((item) => item.key);
    for (const key of shuffled) {
      if (chosen.length < 3) take(key);
    }
    const from = (list: readonly ReadingKeyId[], name: string): ReadingKeyId => list[srtHashText(`daily|${date}|${name}`) % list.length];
    keys = [
      from(srtKeyPool(below).map((key) => key.id), 'easier'), chosen[0], chosen[1 % chosen.length], chosen[2 % chosen.length],
      from(srtKeyPool(above).map((key) => key.id).slice(0, 3), 'stretch'),
    ];
  }
  const taken = new Set<string>();
  return levels.map(([role, slotLevel], slot) => {
    const base = { slot, role, level: slotLevel, key: keys[slot] };
    const book = bookPrints(slotLevel);
    for (let salt = 0; salt < 200; salt += 1) {
      const piece = candidate(slotLevel, base.key, dailyName(date, base), salt);
      const print = piece ? srtLevelFingerprint(piece) : null;
      if (print === null || taken.has(print) || book.has(print) || options.seen?.has(print)) continue;
      taken.add(print);
      return { ...base, salt };
    }
    throw new Error(`No new piece for ${dailyName(date, base)}`);
  });
}

/** The piece of one slot of a day's plan. The same slot always gives the same piece. */
export function srtDailyPiece(date: string, slot: DailySlot): GeneratedPiece {
  if (!isDate(date)) throw new RangeError(`Invalid date: ${date}`);
  const piece = candidate(slot.level, slot.key, dailyName(date, slot), slot.salt);
  if (!piece) throw new Error(`No piece for ${dailyName(date, slot)}`);
  return piece;
}

/**
 * A long piece whose difficulty rises up to a level, for a day. The date, the level, the index and the key make the
 * seed: the same values always give the same piece.
 */
export function srtLongPiece(level: number, key: ReadingKeyId, date: string, index: number): ProgressivePiece {
  if (!isDate(date)) throw new RangeError(`Invalid date: ${date}`);
  if (!Number.isInteger(index) || index < 0) throw new RangeError(`Invalid index: ${index}`);
  const levelId = srtLevel(level).id;
  const keyId = srtReadingKey(key).id;
  return srtGenerateProgressivePiece(levelId, keyId, srtHashText(`long|${date}|${levelId}|${index}|${keyId}`));
}

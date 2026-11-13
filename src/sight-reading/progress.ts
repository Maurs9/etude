// What the Read page remembers about the book, the key runs and the daily set. Everything here is a pure function of
// a state object: the app keeps the state under `data.reading.book` and saves it with the rest of its data.
import { SRT_BOOK_PIECES, SRT_DAILY_PIECES, SRT_FOCUS_PIECES, srtDailyPlan, type DailySlot } from './book.js';
import { srtKeyPool, srtReadingKeys, type ReadingKeyId } from './levels.js';

export type PieceStat = {
  /** Best score, 0 to 100. */
  readonly best: number;
  readonly stars: 0 | 1 | 2 | 3;
  readonly tries: number;
  /** The score of the first-sight attempt, or null when the piece was never played at first sight. */
  readonly first: number | null;
};

export type DailyState = {
  readonly date: string;
  readonly level: number;
  readonly focusKey: ReadingKeyId | null;
  readonly slots: readonly DailySlot[];
  /** The score of each slot, or null while it is not played. */
  readonly done: readonly (number | null)[];
};

export type ReadingBookState = {
  readonly v: 1;
  /** The level the reader works at. */
  readonly level: number;
  /** A pinned key, or null for mixed keys. */
  readonly focusKey: ReadingKeyId | null;
  readonly pieces: Readonly<Record<string, PieceStat>>;
  /**
   * First-sight scores, newest last. The name `3` holds the last 16 scores of level 3 in mixed keys,
   * the name `3|G` the last 8 scores of level 3 in G major.
   */
  readonly recent: Readonly<Record<string, readonly number[]>>;
  readonly daily: DailyState | null;
  /** The days on which a piece was read, as YYYY-MM-DD, oldest first. At most 400 are kept. */
  readonly days: readonly string[];
};

export type ReadingResult = {
  readonly id: string;
  readonly level: number;
  readonly key: ReadingKeyId;
  /** 0 to 100. */
  readonly score: number;
  readonly stars: 0 | 1 | 2 | 3;
  readonly firstSight: boolean;
  /** YYYY-MM-DD of the day the piece was played. */
  readonly date: string;
};

/** The score a key or a level must reach, on average, to count as secure. */
export const SRT_SECURE_SCORE = 85;
const KEY_SCORES = 8;
const LEVEL_SCORES = 16;
const MIN_KEY_SCORES = 4;
const MAX_DAYS = 400;
const KEY_IDS: readonly string[] = srtReadingKeys().map((key) => key.id);

export const srtBookId = (level: number, number: number): string => `b${level}.${number}`;
export const srtFocusId = (level: number, key: string, number: number): string => `f${level}.${key}.${number}`;
export const srtDailyId = (date: string, slot: number): string => `d${date}.${slot}`;

const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isLevel = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 8;
const isKey = (value: unknown): value is ReadingKeyId => typeof value === 'string' && KEY_IDS.includes(value);
const isScore = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const asList = (value: unknown): readonly unknown[] => (Array.isArray(value) ? (value as readonly unknown[]) : []);
const mean = (scores: readonly number[]): number => scores.reduce((sum, score) => sum + score, 0) / scores.length;

export function srtBookStateDefault(): ReadingBookState {
  return { v: 1, level: 1, focusKey: null, pieces: {}, recent: {}, daily: null, days: [] };
}

function readStars(value: unknown): 0 | 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3 ? value : 0;
}

function readDaily(value: unknown): DailyState | null {
  if (!isRecord(value) || !isDate(value.date) || !isLevel(value.level)) return null;
  const slots = asList(value.slots).flatMap((item, index): DailySlot[] => {
    if (!isRecord(item) || !isLevel(item.level) || !isKey(item.key)) return [];
    const role = item.role === 'easier' || item.role === 'stretch' ? item.role : 'level';
    return [{ slot: index, role, level: item.level, key: item.key }];
  });
  if (slots.length !== SRT_DAILY_PIECES) return null;
  const done = asList(value.done);
  return {
    date: value.date, level: value.level, focusKey: isKey(value.focusKey) ? value.focusKey : null, slots,
    done: slots.map((_, index) => (isScore(done[index]) ? done[index] : null)),
  };
}

/** A state read back from storage, with everything that is missing or malformed replaced by its default. */
export function srtNormalizeBookState(raw: unknown): ReadingBookState {
  if (!isRecord(raw)) return srtBookStateDefault();
  const pieces: Record<string, PieceStat> = {};
  if (isRecord(raw.pieces)) {
    for (const [id, value] of Object.entries(raw.pieces)) {
      if (!isRecord(value) || !isScore(value.best)) continue;
      const tries = typeof value.tries === 'number' && Number.isInteger(value.tries) && value.tries > 0 ? value.tries : 1;
      pieces[id] = { best: value.best, stars: readStars(value.stars), tries, first: isScore(value.first) ? value.first : null };
    }
  }
  const recent: Record<string, readonly number[]> = {};
  if (isRecord(raw.recent)) {
    for (const [name, value] of Object.entries(raw.recent)) {
      const scores = asList(value).filter(isScore);
      if (scores.length > 0) recent[name] = scores.slice(-(name.includes('|') ? KEY_SCORES : LEVEL_SCORES));
    }
  }
  return {
    v: 1,
    level: isLevel(raw.level) ? raw.level : 1,
    focusKey: isKey(raw.focusKey) ? raw.focusKey : null,
    pieces,
    recent,
    daily: readDaily(raw.daily),
    days: [...new Set(asList(raw.days).filter(isDate))].sort().slice(-MAX_DAYS),
  };
}

/** The state after a piece was played. */
export function srtRecordResult(state: ReadingBookState, result: ReadingResult): ReadingBookState {
  const score = Math.max(0, Math.min(100, Math.round(result.score)));
  const before = state.pieces[result.id];
  const stat: PieceStat = {
    best: Math.max(before?.best ?? 0, score),
    stars: Math.max(before?.stars ?? 0, result.stars) as 0 | 1 | 2 | 3,
    tries: (before?.tries ?? 0) + 1,
    first: before?.first ?? (result.firstSight ? score : null),
  };
  const recent = { ...state.recent };
  if (result.firstSight && (before?.first ?? null) === null) {
    const add = (name: string, keep: number): void => { recent[name] = [...(recent[name] ?? []), score].slice(-keep); };
    add(`${result.level}|${result.key}`, KEY_SCORES);
    // A piece played with a pinned key says nothing about reading in mixed keys.
    if (!result.id.startsWith('f')) add(`${result.level}`, LEVEL_SCORES);
  }
  let daily = state.daily;
  if (daily && result.id.startsWith(`d${daily.date}.`)) {
    const slot = Number(result.id.slice(daily.date.length + 2));
    if (Number.isInteger(slot) && slot >= 0 && slot < daily.done.length) {
      daily = { ...daily, done: daily.done.map((value, index) => (index === slot ? Math.max(value ?? 0, score) : value)) };
    }
  }
  const days = state.days.includes(result.date) ? state.days : [...state.days, result.date].sort().slice(-MAX_DAYS);
  return { ...state, pieces: { ...state.pieces, [result.id]: stat }, recent, daily, days };
}

/** secure: the last scores in the key average 85 or more. started: the key was played. new: it was not. */
export function srtKeyStatus(state: ReadingBookState, level: number, key: string): 'secure' | 'started' | 'new' {
  const scores = state.recent[`${level}|${key}`] ?? [];
  if (scores.length === 0) return 'new';
  return scores.length >= MIN_KEY_SCORES && mean(scores) >= SRT_SECURE_SCORE ? 'secure' : 'started';
}

/** The mean first-sight score of each key played at a level: what the daily set uses to find the weakest key. */
export function srtKeyScores(state: ReadingBookState, level: number): Partial<Record<ReadingKeyId, number>> {
  const out: Partial<Record<ReadingKeyId, number>> = {};
  for (const key of srtKeyPool(level)) {
    const scores = state.recent[`${level}|${key.id}`];
    if (scores && scores.length > 0) out[key.id] = Math.round(mean(scores));
  }
  return out;
}

/** The mean of the last first-sight scores at a level in mixed keys, or null when there are none. */
export function srtLevelAverage(state: ReadingBookState, level: number, count = 10): number | null {
  const scores = (state.recent[`${level}`] ?? []).slice(-count);
  return scores.length === 0 ? null : Math.round(mean(scores));
}

/** True when the reader is ready for the next level: 16 first-sight pieces in mixed keys, 85 or more on average. */
export function srtLevelReady(state: ReadingBookState, level: number): boolean {
  const scores = state.recent[`${level}`] ?? [];
  return level < 8 && scores.length >= LEVEL_SCORES && mean(scores) >= SRT_SECURE_SCORE;
}

/** How many pieces of a list were played, and the first one that was not (null when all were). */
function tally(state: ReadingBookState, count: number, id: (number: number) => string): { readonly done: number; readonly next: number | null } {
  let done = 0;
  let next: number | null = null;
  for (let number = 1; number <= count; number += 1) {
    if (state.pieces[id(number)]) done += 1;
    else if (next === null) next = number;
  }
  return { done, next };
}

export function srtBookTally(state: ReadingBookState, level: number): { readonly done: number; readonly next: number | null } {
  return tally(state, SRT_BOOK_PIECES, (number) => srtBookId(level, number));
}

export function srtFocusTally(state: ReadingBookState, level: number, key: string): { readonly done: number; readonly next: number | null } {
  return tally(state, SRT_FOCUS_PIECES, (number) => srtFocusId(level, key, number));
}

/** The number of pieces read, counting each piece once. */
export function srtPiecesRead(state: ReadingBookState): number {
  return Object.keys(state.pieces).length;
}

function dayBefore(date: string): string {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

/** The run of days in a row with a piece read, ending today or yesterday. */
export function srtStreak(state: ReadingBookState, today: string): number {
  const days = new Set(state.days);
  let day = days.has(today) ? today : dayBefore(today);
  let run = 0;
  while (days.has(day)) {
    run += 1;
    day = dayBefore(day);
  }
  return run;
}

/**
 * The state with the daily set of a date. A set stays as it is for the whole day.
 * It is drawn again only when the reader changes the level or the pinned key.
 */
export function srtEnsureDaily(state: ReadingBookState, date: string): ReadingBookState {
  const daily = state.daily;
  if (daily && daily.date === date && daily.level === state.level && daily.focusKey === state.focusKey) return state;
  const slots = srtDailyPlan(date, state.level, state.focusKey ? { focusKey: state.focusKey } : { scores: srtKeyScores(state, state.level) });
  return { ...state, daily: { date, level: state.level, focusKey: state.focusKey, slots, done: slots.map(() => null) } };
}

/** The state with another level or another pinned key (null for mixed keys). */
export function srtChooseLevel(state: ReadingBookState, level: number, focusKey: string | null = state.focusKey): ReadingBookState {
  if (!isLevel(level)) throw new RangeError(`Unknown reading level: ${level}`);
  if (focusKey !== null && !isKey(focusKey)) throw new RangeError(`Unknown reading key: ${focusKey}`);
  return { ...state, level, focusKey };
}

/* Browser-independent 3-way merge algorithms for multi-tab `ptt-v3` persistence.
   Note: `syncInto` and `syncData` mutate the local target record `l` in-place to
   preserve live object identity while keeping the merge logic free of browser globals. */
import { isRecord, isSafeRecordKey, parseJson } from '../domain/storage.js';

/** Default spaced-repetition day intervals indexed by box (0..7). */
export const SRS_INTERVALS: readonly number[] = [0, 1, 2, 4, 9, 21, 45, 90];

export interface SyncNoBase {
  readonly syncNoBase?: undefined;
}

/** Sentinel meaning no shared ancestor exists, so counters keep the larger side instead of adding. */
export const SYNC_NONE: SyncNoBase = {};

// reading.book.pieces.<id>: tries add up, the best score and the stars keep the higher side; the rest of reading.book is last-writer.
export const SYNC_ADD = /^(totalReviews|totalCorrect|history\.\d+|reading\.tot\.\w+|reading\.nt\..+\.(n|ok|ms)|reading\.lv\..+\.n|reading\.book\.pieces\..+\.tries|learnRev\..+\.n)$/;
export const SYNC_MAX = /^(bestStreak|placed|singCleared\..+|practiceLog\..+|sheet\..+\.(best|learned)|learnDone\..+|learnRev\..+\.(last|rv|best)|learnUnlock\..+|toolDay\..+|reading\.lv\..+\.(s|acc|rush|sv|ta|mn)|reading\.book\.pieces\..+\.(best|stars))$/;

export interface SyncSrsCard {
  box: number;
  ease: number;
  reps: number;
  lapses: number;
  due?: number;
  last?: number;
}

export interface SyncSrsPairResult {
  base: Record<string, unknown> & SyncSrsCard;
  baseReps: number;
  wrong: [boolean, boolean];
  day: number;
}

/** Local calendar day number (days since 1970-01-01). */
export function localDayNumber(now: Date = new Date()): number {
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
}

/** Every non-null object, arrays included, reads as string keys holding JSON values. */
export function syncIsObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object';
}

export function syncHasBase<T extends object>(x: T | SyncNoBase): x is T {
  return x !== SYNC_NONE;
}

/** Deep JSON clone of a persisted data record (safe against prototype keys via `storage.parseJson`). */
export function syncCloneData(d: Record<string, unknown>): Record<string, unknown> {
  const copy = parseJson(JSON.stringify(d));
  return isRecord(copy) ? copy : {};
}

export function syncSame(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || !syncIsObject(a) || !syncIsObject(b)) return false;
  const keys = Object.keys(a);
  const right = b;
  return keys.length === Object.keys(right).length &&
    keys.every((k) => Object.prototype.hasOwnProperty.call(right, k) && syncSame(a[k], right[k]));
}

export function syncSrsPair(
  b: unknown,
  l: unknown,
  r: unknown,
  todayDay: () => number = localDayNumber,
): SyncSrsPairResult | null {
  if (b === SYNC_NONE || !isRecord(l) || !isRecord(r)) return null;
  const base = isRecord(b) ? b : { box: 0, ease: 2.3, due: 0, reps: 0, lapses: 0, last: 0 };
  const left = l, right = r;
  const reps = (x: Record<string, unknown>) => Math.max(0, Math.floor(Number(x.reps) || 0));
  const lapses = (x: Record<string, unknown>) => Math.max(0, Math.floor(Number(x.lapses) || 0));
  const br = reps(base), bl = lapses(base), lr = reps(left), rr = reps(right);
  const wrong = (x: Record<string, unknown>) => lapses(x) === bl ? false : lapses(x) === bl + 1 ? true : null;
  const lw = wrong(left), rw = wrong(right);
  if (lr !== br + 1 || rr !== br + 1 || lw === null || rw === null) return null;
  return {
    base: {
      ...base,
      box: Math.max(0, Math.min(7, Math.round(Number(base.box) || 0))),
      ease: Math.max(1.6, Math.min(2.9, Number(base.ease) || 2.3)),
      reps: br,
      lapses: bl,
    },
    baseReps: br,
    wrong: [lw, rw],
    day: Math.max(Number(base.last) || 0, Number(left.last) || 0, Number(right.last) || 0) || todayDay(),
  };
}

export function syncSrs(
  b: unknown,
  l: unknown,
  r: unknown,
  todayDay: () => number = localDayNumber,
): unknown {
  const pair = syncSrsPair(b, l, r, todayDay);
  if (!pair) {
    if (!isRecord(l) || !isRecord(r)) return isRecord(l) ? l : r;
    const left = l, right = r;
    return (Number(right.reps) || 0) > (Number(left.reps) || 0) ||
      (Number(right.reps) || 0) === (Number(left.reps) || 0) && (Number(right.last) || 0) > (Number(left.last) || 0)
      ? right
      : left;
  }
  const out: SyncSrsCard = { ...pair.base };
  pair.wrong.sort((a, bWrong) => Number(bWrong) - Number(a)).forEach((wrong) => {
    out.reps++;
    if (!wrong) {
      out.box = Math.min(7, out.box + 1);
      out.ease = Math.min(2.9, out.ease + 0.05);
    } else {
      out.box = 1;
      out.lapses++;
      out.ease = Math.max(1.6, out.ease - 0.2);
    }
    const days = SRS_INTERVALS[out.box] !== undefined ? SRS_INTERVALS[out.box] : 120;
    out.due = pair.day + Math.max(0, Math.round(days * (out.ease / 2.3)));
    out.last = pair.day;
  });
  return out;
}

export function syncNewCollisions(
  b: Record<string, unknown> | SyncNoBase,
  l: unknown,
  r: unknown,
  todayDay: () => number = localDayNumber,
): number[] {
  if (!syncHasBase(b) || !isRecord(l) || !isRecord(r)) return [];
  const bs: Record<string, unknown> = isRecord(b.srs) ? b.srs : {};
  const ls: Record<string, unknown> = isRecord(l.srs) ? l.srs : {};
  const rs: Record<string, unknown> = isRecord(r.srs) ? r.srs : {};
  return [...new Set([...Object.keys(ls), ...Object.keys(rs)])].flatMap((k) => {
    const pair = syncSrsPair(bs[k], ls[k], rs[k], todayDay);
    return pair && pair.baseReps === 0 ? [pair.day] : [];
  });
}

export function syncPick(
  b: unknown,
  l: unknown,
  r: unknown,
  p: string,
  todayDay: () => number = localDayNumber,
): unknown {
  if (l === undefined || r === undefined) return l === undefined ? r : l; // one tab deleted what the other changed: keep the data
  if (p.startsWith('srs.')) return syncSrs(b, l, r, todayDay);
  if (p === 'lastDrill') {
    return (Number(syncIsObject(r) ? r.day : undefined) || 0) > (Number(syncIsObject(l) ? l.day : undefined) || 0) ? r : l;
  }
  if (typeof l === 'number' && typeof r === 'number') {
    if (SYNC_ADD.test(p)) {
      return b === SYNC_NONE ? Math.max(l, r) : Math.max(0, l + r - (typeof b === 'number' ? b : 0));
    }
    if (SYNC_MAX.test(p)) return Math.max(l, r);
  }
  if (typeof l === 'boolean' && typeof r === 'boolean' && SYNC_MAX.test(p)) return l || r;
  return l;
}

/**
 * Recursively merges `r` into `l` in-place against shared ancestor `b` (or `SYNC_NONE`).
 * Mutates `l` to preserve live object references held by the view runtime.
 */
export function syncInto(
  l: Record<string, unknown>,
  b: unknown,
  r: Record<string, unknown>,
  p: string,
  todayDay: () => number = localDayNumber,
): void {
  new Set([...Object.keys(l), ...Object.keys(r)]).forEach((k) => {
    if (!isSafeRecordKey(k)) return;
    const q = p ? p + '.' + k : k;
    const none = b === SYNC_NONE;
    const srs = /^srs\./.test(q);
    const bk = none ? b : isRecord(b) && Object.hasOwn(b, k) ? b[k] : undefined;
    const lv = Object.hasOwn(l, k) ? l[k] : undefined;
    const rv = Object.hasOwn(r, k) ? r[k] : undefined;
    if (!none && syncSame(rv, bk)) return; // the other tab left it alone
    if (isRecord(lv) && isRecord(rv) && !/^srs\.|^lastDrill$/.test(q)) {
      syncInto(lv, bk, rv, q, todayDay);
      return;
    } // field by field, keeping this tab's objects
    const v = !none && syncSame(lv, bk)
      ? rv // only the other tab changed it
      : syncSame(lv, rv) && !SYNC_ADD.test(q) && !srs
        ? lv
        : syncPick(bk, lv, rv, q, todayDay); // both did
    if (v === undefined) delete l[k];
    else l[k] = v;
  });
}

/**
 * Merges remote persisted trainer data `r` into local `l` in-place against base `b` (or `SYNC_NONE`).
 * `todayCount`/`newToday` track `todayDay` (`earToday` tracks `earDay`): only the later day's counts
 * survive, same-day counts add deltas, and duplicate first-time SRS introductions are deduplicated.
 */
export function syncData(
  b: Record<string, unknown> | SyncNoBase,
  l: Record<string, unknown>,
  r: Record<string, unknown>,
  todayDay: () => number = localDayNumber,
): void {
  const day: Record<string, number> = {};
  const left = l, right = r;
  const repeatedNew = syncNewCollisions(b, l, r, todayDay);
  [['todayDay', 'todayCount', 'newToday'], ['earDay', 'earToday']].forEach(([dk, ...ks]) => {
    if (left[dk] === undefined && right[dk] === undefined) return;
    const d = Math.max(Number(left[dk]) || 0, Number(right[dk]) || 0);
    const on = (x: unknown): x is Record<string, unknown> => x !== SYNC_NONE && isRecord(x) && (Number(x[dk]) || 0) === d;
    day[dk] = d;
    ks.forEach((k) => {
      const n = (x: unknown) => on(x) ? (Number(x[k]) || 0) : 0;
      day[k] = b === SYNC_NONE ? Math.max(n(l), n(r)) : Math.max(0, n(l) + n(r) - n(b));
    });
  });
  if (repeatedNew.length && day.todayDay !== undefined) {
    day.newToday = Math.max(0, (Number(day.newToday) || 0) - repeatedNew.filter((d) => d === day.todayDay).length);
  }
  day.streak = Math.max(0, ...[l, r].filter((x) => (Number(x.todayDay) || 0) === day.todayDay).map((x) => Number(x.streak) || 0));
  day.lastActive = Math.max(Number(l.lastActive) || 0, Number(r.lastActive) || 0);
  syncInto(l, b, r, '', todayDay);
  Object.assign(l, day);
}

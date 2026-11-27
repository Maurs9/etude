import { LEARN_UNITS, LESSONS } from '../locales/catalog.js';
import type { LessonMetadata as Lesson } from '../locales/content-types.js';
import type { StoredTrainerData } from '../domain/views.js';

export const LEARN_OLD_ORDER = ['keys', 'iv', 'sc', 'ch', 'cof', 'pr', 'rh', 'notation', 'dyn', 'modes', 'how'] as const;
export const LEARN_GAPS = [3, 7, 16, 35, 90] as const;

/** Spaced review of one finished lesson. */
export interface LearnReview {
  last: number;
  n: number;
  best?: number;
  rv?: number;
}

/** The Learn fields of the saved progress that `learnData()` guarantees. */
export interface LearnProgressStore {
  learnDone: Record<string, number>;
  learnRev: Record<string, LearnReview>;
  learnUnlock: Record<string, number>;
  learnSelId?: string;
  learnSel?: number;
}

function hasLearnProgress(d: StoredTrainerData): d is StoredTrainerData & LearnProgressStore {
  return !!d.learnDone && !!d.learnRev && !!d.learnUnlock;
}

export function learnData(d: StoredTrainerData): LearnProgressStore {
  if (!d.learnDone || typeof d.learnDone !== 'object') d.learnDone = {};
  if (!d.learnRev || typeof d.learnRev !== 'object') {
    const rev: Record<string, LearnReview> = {};
    const done = d.learnDone;
    d.learnRev = rev;
    Object.keys(done).forEach((id) => {
      rev[id] = { last: done[id], n: 0 };
    });
  }
  // learnUnlock is no longer read: every unit is open. The field stays so saves from older versions load and merge unchanged.
  if (!d.learnUnlock || typeof d.learnUnlock !== 'object') d.learnUnlock = {};
  if (!hasLearnProgress(d)) throw new Error('Étude: Learn progress could not be initialised');
  return d;
}

export function learnUnitOf(id: string): number {
  return LEARN_UNITS.findIndex((u) => u.ls.includes(id));
}

export function learnUnitDone(d: StoredTrainerData, i: number): number {
  const u = LEARN_UNITS[i];
  const done = learnData(d).learnDone;
  return u ? u.ls.filter((id) => done[id]).length : 0;
}

export function learnGap(d: StoredTrainerData, id: string): number {
  const r = learnData(d).learnRev[id];
  return LEARN_GAPS[Math.min(r ? (r.n | 0) : 0, LEARN_GAPS.length - 1)];
}

export function learnDueDays(d: StoredTrainerData, id: string, todayN: number): number | null {
  const D = learnData(d);
  if (!D.learnDone[id]) return null;
  const r = D.learnRev[id] || { last: D.learnDone[id], n: 0 };
  const age = todayN - (r.last | 0);
  return age >= learnGap(d, id) ? age : null;
}

export function learnDueList(d: StoredTrainerData, todayN: number): Lesson[] {
  return LESSONS
    .filter((L) => learnDueDays(d, L.id, todayN) != null)
    .sort((a, b) => (learnDueDays(d, b.id, todayN) ?? 0) - (learnDueDays(d, a.id, todayN) ?? 0));
}

export function learnComplete(
  d: StoredTrainerData,
  lesson: Lesson,
  score: number | null,
  todayN: number,
): { first: boolean; review: boolean } {
  const D = learnData(d);
  const was = D.learnDone[lesson.id];
  const due = learnDueDays(d, lesson.id, todayN) != null;
  const r = D.learnRev[lesson.id] || (D.learnRev[lesson.id] = { last: todayN, n: 0 });
  if (score != null) r.best = Math.max(r.best || 0, score);
  if (!was) {
    D.learnDone[lesson.id] = todayN;
    r.last = todayN;
    r.n = 0;
  } else if (due) {
    r.n = (r.n | 0) + 1;
    r.last = todayN;
    r.rv = todayN;
  }
  return { first: !was, review: !!was && due };
}

export function learnMarkLesson(
  d: StoredTrainerData,
  lesson: Lesson,
  read: boolean,
  todayN: number,
): void {
  const D = learnData(d);
  if (read) {
    learnComplete(d, lesson, null, todayN);
  } else {
    delete D.learnDone[lesson.id];
    delete D.learnRev[lesson.id];
  }
}

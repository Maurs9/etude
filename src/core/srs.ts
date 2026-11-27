import { restoreSrsEntry, type StoredSrsEntry } from '../domain/storage.js';
import { SRS_INTERVALS } from './sync-merge.js';

/*
 * Spaced repetition for the trainer items: a Leitner-style box (0–7) with an ease factor, a due day and counters.
 * Pure and browser-free: every function receives the `srs` map (StoredTrainerData.srs) and the day number explicitly,
 * so it runs in Node tests and never reads the shell's live data record.
 */

export type SrsMap = Record<string, StoredSrsEntry>;

/** Days until the next review for a box, before the ease scaling; boxes past the table wait 120 days. */
export function srsIntervalDays(box: number): number {
  return SRS_INTERVALS[box] !== undefined ? SRS_INTERVALS[box] : 120;
}

/** The entry for `id`, created (fresh, unseen) when the item has never been reviewed. */
export function srsEntryOf(srs: SrsMap, id: string | number): StoredSrsEntry {
  return srs[id] || (srs[id] = restoreSrsEntry(null));
}

/**
 * One answer: a correct answer moves the item up a box and eases it, a wrong one sends it back to box 1.
 * Returns true when this was the item's first review (a new concept introduced today).
 */
export function srsReview(srs: SrsMap, id: string, correct: boolean, today: number): boolean {
  const it = srsEntryOf(srs, id);
  it.reps++;
  if (correct) {
    it.box = Math.min(7, it.box + 1);
    it.ease = Math.min(2.9, it.ease + .05);
  }
  else {
    it.box = 1;
    it.lapses++;
    it.ease = Math.max(1.6, it.ease - .2);
  }
  it.due = today + Math.max(0, Math.round(srsIntervalDays(it.box) * (it.ease / 2.3)));
  it.last = today;
  return it.reps === 1;
}

/** Placement: an item the user already knows starts in box 4; an unknown one is left unseen. */
export function srsSeedPlacement(srs: SrsMap, id: string, known: boolean, today: number): void {
  if (!known) return;
  const it = srsEntryOf(srs, id);
  it.box = 4;
  it.ease = 2.4;
  it.reps = 1;
  it.lapses = 0;
  it.due = today + Math.round(SRS_INTERVALS[4] * (it.ease / 2.3));
  it.last = today;
}

export function srsBox(srs: SrsMap, id: string | number): number {
  return srs[id] ? srs[id].box : 0;
}

export function srsIsDue(srs: SrsMap, id: string | number, today: number): boolean {
  const s = srs[id];
  return !!s && s.reps > 0 && s.due <= today;
}

export function srsIsNew(srs: SrsMap, id: string | number): boolean {
  const s = srs[id];
  return !s || s.reps === 0;
}

/** Items due today or earlier, the most overdue first. */
export function srsDueItems<T extends { id: string }>(items: readonly T[], srs: SrsMap, today: number): T[] {
  return items.filter((it) => srsIsDue(srs, it.id, today)).sort((a, b) => srs[a.id].due - srs[b.id].due);
}

/** Items never reviewed, in introduction order. */
export function srsNewItems<T extends { id: string; intro: number }>(items: readonly T[], srs: SrsMap): T[] {
  return items.filter((it) => srsIsNew(srs, it.id)).sort((a, b) => a.intro - b.intro);
}

/** New concepts still allowed today: the daily quota minus those already introduced today (across sessions). */
export function srsNewQuotaLeft(counts: { todayDay: number; newToday?: number }, newPerDay: number, today: number): number {
  const introduced = counts.todayDay === today ? (counts.newToday || 0) : 0;
  return Math.max(0, newPerDay - introduced);
}

/** Items in box 4 or higher. */
export function srsMasteredCount(items: readonly { id: string }[], srs: SrsMap): number {
  return items.filter((it) => srsBox(srs, it.id) >= 4).length;
}

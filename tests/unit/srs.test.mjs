import { describe, expect, it } from 'vitest';
import {
  srsBox, srsDueItems, srsEntryOf, srsIntervalDays, srsIsDue, srsIsNew, srsMasteredCount, srsNewItems,
  srsNewQuotaLeft, srsReview, srsSeedPlacement,
} from '../../src/core/srs.ts';
import { SRS_INTERVALS, SYNC_ADD, SYNC_MAX } from '../../src/core/sync-merge.ts';
import { restoreSrsEntry } from '../../src/domain/storage.ts';

const TODAY = 20000;

describe('core spaced repetition', () => {
  it('creates a fresh unseen entry on first lookup and keeps it in the map', () => {
    const srs = {};
    const e = srsEntryOf(srs, 'iv:7');
    expect(e).toEqual({ box: 0, ease: 2.3, due: 0, reps: 0, lapses: 0, last: 0 });
    expect(srs['iv:7']).toBe(e);
    expect(srsIsNew(srs, 'iv:7')).toBe(true);
    expect(srsBox(srs, 'missing')).toBe(0);
  });

  it('moves a correct answer up a box and eases it; a wrong one back to box 1', () => {
    const srs = {};
    expect(srsReview(srs, 'a', true, TODAY)).toBe(true);
    expect(srs.a).toMatchObject({ box: 1, reps: 1, lapses: 0, last: TODAY });
    expect(srs.a.ease).toBeCloseTo(2.35);
    expect(srs.a.due).toBe(TODAY + Math.round(1 * (2.35 / 2.3)));
    expect(srsReview(srs, 'a', true, TODAY + 1)).toBe(false);
    expect(srs.a.box).toBe(2);
    srsReview(srs, 'a', false, TODAY + 2);
    expect(srs.a).toMatchObject({ box: 1, reps: 3, lapses: 1, last: TODAY + 2 });
    expect(srs.a.ease).toBeCloseTo(2.2);
  });

  it('caps the box at 7 and the ease between 1.6 and 2.9, never scheduling into the past', () => {
    const srs = { a: { box: 7, ease: 2.9, due: 0, reps: 10, lapses: 0, last: 0 }, b: { box: 3, ease: 1.6, due: 0, reps: 4, lapses: 9, last: 0 } };
    srsReview(srs, 'a', true, TODAY);
    expect(srs.a.box).toBe(7);
    expect(srs.a.ease).toBe(2.9);
    expect(srs.a.due).toBe(TODAY + Math.round(srsIntervalDays(7) * (2.9 / 2.3)));
    srsReview(srs, 'b', false, TODAY);
    expect(srs.b.ease).toBe(1.6);
    expect(srs.b.due).toBeGreaterThanOrEqual(TODAY);
    expect(srsIntervalDays(8)).toBe(120);
    expect(srsIntervalDays(4)).toBe(SRS_INTERVALS[4]);
  });

  it('seeds known placement items in box 4 and leaves unknown ones unseen', () => {
    const srs = {};
    srsSeedPlacement(srs, 'ch:maj', true, TODAY);
    srsSeedPlacement(srs, 'ch:m', false, TODAY);
    expect(srs['ch:maj']).toEqual({ box: 4, ease: 2.4, reps: 1, lapses: 0, due: TODAY + Math.round(SRS_INTERVALS[4] * (2.4 / 2.3)), last: TODAY });
    expect(srs['ch:m']).toBeUndefined();
  });

  it('answers due, new, quota and mastery queries from the map it is given', () => {
    const items = [{ id: 'a', intro: 2 }, { id: 'b', intro: 0 }, { id: 'c', intro: 1 }, { id: 'd', intro: 3 }];
    const srs = {
      a: { box: 4, ease: 2.3, due: TODAY - 2, reps: 3, lapses: 0, last: 0 },
      b: { box: 1, ease: 2.3, due: TODAY, reps: 1, lapses: 0, last: 0 },
      c: { box: 5, ease: 2.3, due: TODAY + 5, reps: 6, lapses: 0, last: 0 },
    };
    expect(srsIsDue(srs, 'a', TODAY)).toBe(true);
    expect(srsIsDue(srs, 'c', TODAY)).toBe(false);
    expect(srsIsDue(srs, 'd', TODAY)).toBe(false);
    expect(srsDueItems(items, srs, TODAY).map((x) => x.id)).toEqual(['a', 'b']);
    expect(srsNewItems(items, srs).map((x) => x.id)).toEqual(['d']);
    expect(srsMasteredCount(items, srs)).toBe(2);
    expect(srsNewQuotaLeft({ todayDay: TODAY, newToday: 3 }, 5, TODAY)).toBe(2);
    expect(srsNewQuotaLeft({ todayDay: TODAY - 1, newToday: 3 }, 5, TODAY)).toBe(5);
    expect(srsNewQuotaLeft({ todayDay: TODAY, newToday: 9 }, 5, TODAY)).toBe(0);
  });

  it('keeps every stored SRS entry field out of the additive and max sync rules (entries merge as a pair)', () => {
    const fields = Object.keys(restoreSrsEntry(null)).sort();
    expect(fields).toEqual(['box', 'due', 'ease', 'lapses', 'last', 'reps']);
    for (const field of fields) {
      for (const id of ['iv:7', 'ch:maj7', 'sc:Major (Ionian)', 'pr:I–IV–V']) {
        const path = `srs.${id}.${field}`;
        expect(SYNC_ADD.test(path), path).toBe(false);
        expect(SYNC_MAX.test(path), path).toBe(false);
      }
    }
  });
});

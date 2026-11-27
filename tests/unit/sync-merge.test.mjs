import { describe, expect, it } from 'vitest';
import {
  SRS_INTERVALS, SYNC_ADD, SYNC_MAX, SYNC_NONE, localDayNumber,
  syncCloneData, syncData, syncHasBase, syncInto, syncIsObject,
  syncNewCollisions, syncPick, syncSame, syncSrs, syncSrsPair,
} from '../../src/core/sync-merge.ts';

describe('sync-merge (browser-independent 3-way persistence merge)', () => {
  it('compares nested JSON values accurately with syncSame and isolates clones with syncCloneData', () => {
    expect(syncSame(1, 1)).toBe(true);
    expect(syncSame(1, '1')).toBe(false);
    expect(syncSame({ a: 1, b: { c: [2, 3] } }, { b: { c: [2, 3] }, a: 1 })).toBe(true);
    expect(syncSame({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(syncSame(null, {})).toBe(false);

    expect(syncIsObject({})).toBe(true);
    expect(syncIsObject([])).toBe(true);
    expect(syncIsObject(null)).toBe(false);
    expect(syncHasBase(SYNC_NONE)).toBe(false);
    expect(syncHasBase({})).toBe(true);

    const original = { totalReviews: 5, nested: { a: 1 } };
    const clone = syncCloneData(original);
    expect(clone).toEqual(original);
    clone.nested.a = 99;
    expect(original.nested.a).toBe(1);

    expect(localDayNumber(new Date(2026, 0, 2))).toBe(localDayNumber(new Date(2026, 0, 1)) + 1);
  });

  it('merges additive counters by delta with a shared base and by max with SYNC_NONE', () => {
    const additivePaths = [
      'totalReviews',
      'totalCorrect',
      'history.20500',
      'reading.tot.n',
      'reading.nt.C4.ok',
      'reading.lv.l1.n',
      'reading.book.pieces.b1.tries',
      'learnRev.ch1.n',
    ];
    for (const path of additivePaths) {
      expect(SYNC_ADD.test(path), path).toBe(true);
      expect(syncPick(10, 13, 14, path)).toBe(17);
      expect(syncPick(SYNC_NONE, 13, 14, path)).toBe(14);
      expect(syncPick(10, 2, 3, path)).toBe(0); // clamped at 0
    }
  });

  it('merges max numeric and boolean flags monotonically', () => {
    const maxPaths = [
      'bestStreak',
      'placed',
      'singCleared.l1',
      'practiceLog.techBestBpm',
      'sheet.ode.best',
      'sheet.ode.learned',
      'learnDone.u1',
      'learnRev.u1.best',
      'learnUnlock.u2',
      'toolDay.read',
      'reading.lv.l1.sv',
      'reading.book.pieces.b1.stars',
    ];
    for (const path of maxPaths) {
      expect(SYNC_MAX.test(path), path).toBe(true);
    }
    expect(syncPick(5, 8, 12, 'bestStreak')).toBe(12);
    expect(syncPick(false, false, true, 'placed')).toBe(true);
    expect(syncPick(false, true, false, 'sheet.ode.learned')).toBe(true);
  });

  it('replays concurrent 1-rep SRS reviews worst-first and falls back by reps/last otherwise', () => {
    const base = { box: 2, ease: 2.3, due: 102, reps: 3, lapses: 0, last: 100 };
    const rightWin = { box: 3, ease: 2.35, due: 104, reps: 4, lapses: 0, last: 101 };
    const leftFail = { box: 1, ease: 2.1, due: 102, reps: 4, lapses: 1, last: 101 };

    const pair = syncSrsPair(base, leftFail, rightWin, () => 999);
    expect(pair).toMatchObject({ baseReps: 3, wrong: [true, false], day: 101 });

    // Worst outcome (wrong=true) applied first -> box=1, ease=2.1, lapses=1; then right -> box=2, ease=2.15, reps=5.
    const merged = syncSrs(base, leftFail, rightWin, () => 999);
    expect(merged).toMatchObject({
      reps: 5,
      lapses: 1,
      box: 2,
      last: 101,
      due: 101 + Math.round(SRS_INTERVALS[2] * (2.15 / 2.3)),
    });
    expect(merged.ease).toBeCloseTo(2.15, 6);

    // Without a shared base (SYNC_NONE) or unequal rep jump, pick higher reps, tie-broken by last.
    expect(syncSrs(SYNC_NONE, { reps: 2, last: 105 }, { reps: 4, last: 101 })).toEqual({ reps: 4, last: 101 });
    expect(syncSrs(SYNC_NONE, { reps: 4, last: 101 }, { reps: 4, last: 105 })).toEqual({ reps: 4, last: 105 });
  });

  it('merges daily counters, deduplicates repeated new-card introductions, and protects prototype keys', () => {
    const base = {
      todayDay: 20500,
      todayCount: 4,
      newToday: 1,
      earDay: 20500,
      earToday: 2,
      streak: 3,
      lastActive: 20499,
      totalReviews: 10,
      srs: {},
    };
    const local = {
      todayDay: 20500,
      todayCount: 6, // +2
      newToday: 2, // +1 (same new item iv:7)
      earDay: 20500,
      earToday: 3, // +1
      streak: 4,
      lastActive: 20500,
      totalReviews: 12,
      srs: { 'iv:7': { box: 1, ease: 2.35, due: 20501, reps: 1, lapses: 0, last: 20500 } },
      lastDrill: { cat: 'interval', day: 20499 },
    };
    const remote = {
      todayDay: 20500,
      todayCount: 5, // +1
      newToday: 2, // +1 (same new item iv:7)
      earDay: 20500,
      earToday: 4, // +2
      streak: 5,
      lastActive: 20500,
      totalReviews: 11,
      srs: { 'iv:7': { box: 1, ease: 2.35, due: 20501, reps: 1, lapses: 0, last: 20500 } },
      lastDrill: { cat: 'chord', day: 20500 },
    };

    expect(syncNewCollisions(base, local, remote, () => 20500)).toEqual([20500]);
    syncData(base, local, remote, () => 20500);

    expect(local.todayDay).toBe(20500);
    expect(local.todayCount).toBe(7); // 6 + 5 - 4
    expect(local.newToday).toBe(2); // (2 + 2 - 1) - 1 collision on iv:7
    expect(local.earToday).toBe(5); // 3 + 4 - 2
    expect(local.streak).toBe(5);
    expect(local.totalReviews).toBe(13); // 12 + 11 - 10
    expect(local.srs['iv:7'].reps).toBe(2);
    expect(local.lastDrill).toEqual({ cat: 'chord', day: 20500 });

    // Newer day replaces older day's daily counts rather than adding them together.
    const olderLocal = { todayDay: 20500, todayCount: 9, newToday: 4, streak: 7, lastActive: 20500 };
    const newerRemote = { todayDay: 20501, todayCount: 2, newToday: 1, streak: 8, lastActive: 20501 };
    syncData({ todayDay: 20500, todayCount: 9, newToday: 4, streak: 7, lastActive: 20500 }, olderLocal, newerRemote, () => 20501);
    expect(olderLocal.todayDay).toBe(20501);
    expect(olderLocal.todayCount).toBe(2);
    expect(olderLocal.newToday).toBe(1);
    expect(olderLocal.streak).toBe(8);

    // Prototype pollution keys are ignored in syncInto.
    const safeTarget = { keep: 1 };
    const malicious = JSON.parse('{"__proto__":{"polluted":true},"keep":2}');
    syncInto(safeTarget, { keep: 1 }, malicious, '');
    expect(safeTarget.keep).toBe(2);
    expect(({}).polluted).toBeUndefined();
  });
});

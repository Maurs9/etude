import { describe, expect, it } from 'vitest';
import { needsDailySnapshot, persistState, requestPersist, snapshotsToDrop, storageUsage } from '../../src/domain/data-safety.ts';

describe('persistent storage requests', () => {
  it('reports unsupported browsers and asks only when storage is best-effort', async () => {
    expect(await persistState(undefined)).toBe('unsupported');
    expect(await persistState({ persisted: async () => true })).toBe('unsupported');
    let asked = 0;
    const granted = { persisted: async () => false, persist: async () => { asked++; return true; } };
    expect(await persistState(granted)).toBe('best-effort');
    expect(await requestPersist(granted)).toBe('persisted');
    const kept = { persisted: async () => true, persist: async () => { asked++; return true; } };
    expect(await requestPersist(kept)).toBe('persisted');
    expect(asked).toBe(1);
    expect(await requestPersist({ persisted: async () => false, persist: async () => false })).toBe('best-effort');
    expect(await requestPersist({ persisted: async () => false, persist: async () => { throw new Error('denied'); } })).toBe('best-effort');
  });

  it('reads the storage estimate when the browser gives one', async () => {
    expect(await storageUsage({ estimate: async () => ({ usage: 1200, quota: 9000 }) })).toEqual({ usage: 1200, quota: 9000 });
    expect(await storageUsage({ estimate: async () => ({}) })).toBeNull();
    expect(await storageUsage({ estimate: async () => { throw new Error('no'); } })).toBeNull();
    expect(await storageUsage(undefined)).toBeNull();
  });
});

describe('automatic backup rotation', () => {
  const item = (id, reason, day = id) => ({ id, day, reason });

  it('keeps the newest three copies of each kind, so a daily copy never pushes out a pre-reset copy', () => {
    const list = [item(1, 'daily'), item(2, 'daily'), item(3, 'before-reset'), item(4, 'daily'), item(5, 'daily'), item(6, 'unreadable')];
    expect(snapshotsToDrop(list).sort()).toEqual([1]);
    expect(snapshotsToDrop(list, 1).sort()).toEqual([1, 2, 4]);
  });

  it('takes one daily copy per day', () => {
    expect(needsDailySnapshot([], 10)).toBe(true);
    expect(needsDailySnapshot([item(5, 'before-reset', 10)], 10)).toBe(true);
    expect(needsDailySnapshot([item(5, 'daily', 10)], 10)).toBe(false);
    expect(needsDailySnapshot([item(5, 'daily', 9)], 10)).toBe(true);
  });
});

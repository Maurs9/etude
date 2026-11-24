import { describe, expect, it } from 'vitest';
import { listSnapshots, needsDailySnapshot, persistState, requestPersist, saveSnapshot, snapshotsToDrop, storageUsage } from '../../src/domain/data-safety.ts';

function mockIdbFactory(initialRows = [], { throwOnTransaction = false } = {}) {
  const rows = new Map(initialRows.map(row => [row.id, row]));
  let closed = false;
  return {
    get closed() { return closed; },
    get rows() { return [...rows.values()]; },
    open() {
      const req = {
        result: {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => ({}),
          onversionchange: null,
          close: () => { closed = true; },
          transaction() {
            if (throwOnTransaction) throw new Error('missing objectStore');
            const tx = {
              error: null,
              oncomplete: null,
              onabort: null,
              onerror: null,
              objectStore() {
                const run = work => {
                  const r = { result: undefined, onsuccess: null };
                  queueMicrotask(() => {
                    try {
                      r.result = work();
                      r.onsuccess?.();
                      if (!scheduledComplete) {
                        scheduledComplete = true;
                        queueMicrotask(() => tx.oncomplete?.());
                      }
                    } catch (err) {
                      tx.error = err;
                      tx.onerror?.();
                    }
                  });
                  return r;
                };
                let scheduledComplete = false;
                return {
                  getAll: () => run(() => [...rows.values()]),
                  add: row => {
                    if (rows.has(row.id)) throw new DOMException('Duplicate key', 'ConstraintError');
                    rows.set(row.id, row);
                  },
                  delete: id => { rows.delete(id); },
                };
              },
            };
            return tx;
          },
        },
        onsuccess: null,
        onerror: null,
        onblocked: null,
        onupgradeneeded: null,
      };
      queueMicrotask(() => req.onsuccess?.());
      return req;
    },
  };
}

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

  it('avoids id collisions with corrupt rows whose id is >= Date.now() and closes db on sync transaction throws', async () => {
    const futureId = Date.now() + 60_000;
    const factory = mockIdbFactory([{ id: futureId, broken: true }]);
    const saved = await saveSnapshot({ day: 12, reason: 'daily', raw: '{"v":3}' }, factory);
    expect(saved.id).toBe(futureId + 1);
    expect(factory.closed).toBe(true);
    expect(factory.rows).toHaveLength(2);

    const failingFactory = mockIdbFactory([], { throwOnTransaction: true });
    await expect(listSnapshots(failingFactory)).rejects.toThrow('missing objectStore');
    expect(failingFactory.closed).toBe(true);

    const failingSaveFactory = mockIdbFactory([], { throwOnTransaction: true });
    await expect(saveSnapshot({ day: 12, reason: 'daily', raw: '{}' }, failingSaveFactory)).rejects.toThrow('missing objectStore');
    expect(failingSaveFactory.closed).toBe(true);
  });
});

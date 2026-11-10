// Keeps progress safe on this device: persistent storage, and rolling backup copies in IndexedDB.
import { isRecord } from './storage.js';

export type PersistState = 'persisted' | 'best-effort' | 'unsupported';

export interface StorageManagerLike {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
}

export async function persistState(manager: StorageManagerLike | undefined): Promise<PersistState> {
  if (!manager?.persisted || !manager.persist) return 'unsupported';
  try { return await manager.persisted() ? 'persisted' : 'best-effort'; }
  catch { return 'unsupported'; }
}

/** Asks the browser to keep this site's data under storage pressure. Chrome decides without a prompt. */
export async function requestPersist(manager: StorageManagerLike | undefined): Promise<PersistState> {
  const state = await persistState(manager);
  if (state !== 'best-effort' || !manager?.persist) return state;
  try { return await manager.persist() ? 'persisted' : 'best-effort'; }
  catch { return 'best-effort'; }
}

export async function storageUsage(manager: StorageManagerLike | undefined): Promise<{ usage: number; quota: number } | null> {
  if (!manager?.estimate) return null;
  try {
    const { usage, quota } = await manager.estimate();
    return typeof usage === 'number' && typeof quota === 'number' ? { usage, quota } : null;
  } catch { return null; }
}

export type SnapshotReason = 'daily' | 'before-reset' | 'before-import' | 'before-restore' | 'before-upgrade' | 'unreadable';

export type Snapshot = {
  id: number;
  day: number;
  reason: SnapshotReason;
  /** A full backup file, the same JSON that Export downloads. Unreadable copies hold the raw record. */
  raw: string;
};

export type SnapshotInfo = Omit<Snapshot, 'raw'>;

/** Newest daily copies kept, newest copies kept of each other reason. */
export const SNAPSHOT_KEEP = 3;

/** Ids to delete so each reason keeps only its newest SNAPSHOT_KEEP copies. */
export function snapshotsToDrop(list: readonly SnapshotInfo[], keep = SNAPSHOT_KEEP): number[] {
  const seen = new Map<SnapshotReason, number>(), drop: number[] = [];
  for (const item of [...list].sort((a, b) => b.id - a.id)) {
    const count = (seen.get(item.reason) ?? 0) + 1;
    seen.set(item.reason, count);
    if (count > keep) drop.push(item.id);
  }
  return drop;
}

/** True when no daily copy exists for today yet. */
export function needsDailySnapshot(list: readonly SnapshotInfo[], today: number): boolean {
  return !list.some(item => item.reason === 'daily' && item.day === today);
}

const DB_NAME = 'etude-backups', STORE = 'snapshots';

function open(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!factory) { reject(new Error('IndexedDB is not available.')); return; }
    const request = factory.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onblocked = () => reject(new Error('The backup store is blocked by another tab.'));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

function done<T>(db: IDBDatabase, mode: 'readonly' | 'readwrite', work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    let result: T | undefined;
    const tx = db.transaction(STORE, mode), req = work(tx.objectStore(STORE));
    if (req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

const REASONS: readonly string[] = ['daily', 'before-reset', 'before-import', 'before-restore', 'before-upgrade', 'unreadable'];

function isSnapshot(value: unknown): value is Snapshot {
  return isRecord(value) && typeof value.id === 'number' && typeof value.day === 'number' &&
    typeof value.raw === 'string' && typeof value.reason === 'string' && REASONS.includes(value.reason);
}

export async function listSnapshots(factory?: IDBFactory): Promise<SnapshotInfo[]> {
  const all = await done(await open(factory), 'readonly', store => store.getAll());
  return (Array.isArray(all) ? all : []).filter(isSnapshot)
    .map(({ id, day, reason }) => ({ id, day, reason }))
    .sort((a, b) => b.id - a.id);
}

export async function readSnapshot(id: number, factory?: IDBFactory): Promise<Snapshot | null> {
  const value = await done(await open(factory), 'readonly', store => store.get(id));
  return isSnapshot(value) ? value : null;
}

/** Saves a copy, then prunes older copies of the same kind. Ids are milliseconds, kept unique. */
export async function saveSnapshot(entry: Omit<Snapshot, 'id'>, factory?: IDBFactory): Promise<SnapshotInfo> {
  const existing = await listSnapshots(factory);
  const id = Math.max(Date.now(), (existing[0]?.id ?? 0) + 1);
  const snapshot: Snapshot = { id, ...entry };
  const drop = snapshotsToDrop([{ id, day: entry.day, reason: entry.reason }, ...existing]);
  await done(await open(factory), 'readwrite', store => {
    store.put(snapshot);
    for (const old of drop) store.delete(old);
  });
  return { id, day: entry.day, reason: entry.reason };
}

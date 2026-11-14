import type { LibraryImportResult, LibraryItem, LibraryMetadata, LibraryPlayResult, LibraryRestoreResult, LibraryResume, LibraryUpdatePatch } from './score-library-types.js';

const DB_NAME = 'etude-score-library-v1';
const MAX_FILE = 2 * 1024 * 1024;
const MAX_TRANSFER = 64 * 1024 * 1024;
const MAX_ITEMS = 1000;
const STORES = ['metadata', 'blobs'];
const parseJson: (text: string) => unknown = JSON.parse;

export class LibraryError extends Error {
  constructor(public readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LibraryError';
  }
}

function failure(error: unknown, fallback = 'unavailable'): LibraryError {
  if (error instanceof LibraryError) return error;
  const name = error instanceof Error ? error.name : '';
  return new LibraryError(name === 'QuotaExceededError' ? 'quota' : fallback,
    name === 'QuotaExceededError' ? 'Device storage is full.' : 'Score library storage is unavailable.', { cause: error });
}

function invalid(message: string): never { throw new LibraryError('invalid', message); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Expected an object.');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max || value.includes(String.fromCharCode(0))) invalid('Invalid library text.');
  return value;
}
function number(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid('Invalid library number.');
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') invalid('Invalid library boolean.');
  return value;
}
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) invalid('Invalid library setting.');
  return value as T;
}
export function validateLibraryMetadata(value: unknown): LibraryMetadata {
  const v = record(value);
  return { title: text(v.title, 512), composer: text(v.composer, 512) };
}
export function validateLibraryLevel(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = text(value, 64).trim();
  return trimmed || undefined;
}
export function validateLibraryTags(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > 20) invalid('Invalid library tags.');
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const entry of value) {
    const tag = text(entry, 64).trim();
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(tag);
    }
  }
  return unique.length ? unique : undefined;
}
export function validateLibraryResume(value: unknown): LibraryResume | null {
  if (value === null) return null;
  const v = record(value);
  const speed = number(v.speed);
  if (![40, 50, 60, 70, 75, 80, 90, 100, 110, 125].includes(speed)) invalid('Unsupported playback speed.');
  return {
    position: number(v.position), measure: text(v.measure, 128), speed,
    hands: choice(v.hands, ['both', 'rh', 'lh']), wait: boolean(v.wait), metronome: boolean(v.metronome),
    view: choice(v.view, ['page', 'cont', 'fall']), look: choice(v.look, ['paper', 'night']), zoom: number(v.zoom, .4, 2.5),
  };
}
function filename(value: unknown): string {
  const name = text(value, 255);
  if (!/\.(?:mid|midi|xml|musicxml|mxl)$/iu.test(name) || /[\\/]/u.test(name)) invalid('Unsupported score filename.');
  return name;
}
function fileSize(value: unknown): number {
  const size = number(value, 1, MAX_FILE);
  if (!Number.isInteger(size)) invalid('Invalid score size.');
  return size;
}
function itemValue(value: unknown): LibraryItem {
  const v = record(value);
  const id = text(v.id, 64);
  if (!/^[a-f0-9]{64}$/u.test(id)) invalid('Invalid score hash.');
  const item: LibraryItem = {
    ...validateLibraryMetadata(v), id, name: filename(v.name), size: fileSize(v.size),
    addedAt: number(v.addedAt), lastOpenedAt: v.lastOpenedAt === null ? null : number(v.lastOpenedAt),
    favorite: boolean(v.favorite), resume: validateLibraryResume(v.resume),
  };
  // Practice progress is optional: records saved before it existed have neither field.
  if (v.best !== undefined) item.best = number(v.best, 0, 100);
  if (v.lastPlayedDay !== undefined) item.lastPlayedDay = dayNumber(v.lastPlayedDay);
  const level = validateLibraryLevel(v.level);
  if (level !== undefined) item.level = level;
  const tags = validateLibraryTags(v.tags);
  if (tags !== undefined) item.tags = tags;
  return item;
}
function dayNumber(value: unknown): number {
  const day = number(value, 0, 1e6);
  if (!Number.isInteger(day)) invalid('Invalid library day.');
  return day;
}
function checkFile(file: File): void {
  if (!(file instanceof File)) invalid('Expected a score file.');
  filename(file.name);
  fileSize(file.size);
}

let opening: Promise<IDBDatabase> | null = null;
function database(): Promise<IDBDatabase> {
  if (opening) return opening;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    try {
      if (!globalThis.indexedDB) throw new LibraryError('unavailable', 'IndexedDB is not available.');
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        for (const name of STORES) {
          if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
        }
      };
      request.onblocked = () => {
        settled = true;
        reject(new LibraryError('blocked', 'Close other score-library tabs and retry.'));
      };
      request.onerror = () => { settled = true; reject(failure(request.error)); };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        settled = true;
        db.onversionchange = () => { db.close(); opening = null; };
        db.onclose = () => { opening = null; };
        resolve(db);
      };
    } catch (error) { reject(failure(error)); }
  });
  opening = pending;
  void pending.catch(() => { if (opening === pending) opening = null; });
  return pending;
}
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
/** Work may await IDB requests only: hashes, parsing and File IO happen before this. */
async function transaction<T>(mode: 'readonly' | 'readwrite', work: (tx: IDBTransaction) => Promise<T>): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    let result: T;
    let reason: unknown;
    try { tx = db.transaction(STORES, mode); }
    catch (error) { opening = null; reject(failure(error)); return; }
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure(reason ?? tx.error));
    // A request succeeding is not a commit; only oncomplete resolves the caller.
    void work(tx).then(value => { result = value; }).catch(error => {
      reason = error;
      try { tx.abort(); } catch { reject(failure(error)); }
    });
  });
}
async function digest(file: Blob): Promise<string> {
  try {
    const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) { throw failure(error); }
}

export async function libraryList(): Promise<LibraryItem[]> {
  const items = await transaction('readonly', async tx => {
    const values: unknown[] = await request(tx.objectStore('metadata').getAll());
    return values.map(itemValue);
  });
  return items.sort((a, b) => b.addedAt - a.addedAt || a.id.localeCompare(b.id));
}
export async function libraryGet(id: string): Promise<{ item: LibraryItem; file: File } | null> {
  return transaction('readonly', async tx => {
    const meta = await request(tx.objectStore('metadata').get(id));
    if (!meta) return null;
    const item = itemValue(meta);
    const blob: unknown = await request(tx.objectStore('blobs').get(id));
    if (!(blob instanceof Blob) || blob.size !== item.size) invalid('Missing score original.');
    return { item, file: new File([blob], item.name, { type: blob.type, lastModified: item.addedAt }) };
  });
}
export async function librarySave(file: File, meta: LibraryMetadata): Promise<LibraryImportResult> {
  checkFile(file);
  const metadata = validateLibraryMetadata(meta);
  const id = await digest(file);
  const item: LibraryItem = { ...metadata, id, name: file.name, size: file.size, addedAt: Date.now(), lastOpenedAt: null, favorite: false, resume: null };
  return transaction('readwrite', async tx => {
    const store = tx.objectStore('metadata');
    const old: unknown = await request(store.get(id));
    if (old) return { item: itemValue(old), duplicate: true };
    await request(store.add(item, id));
    await request(tx.objectStore('blobs').add(file, id));
    return { item, duplicate: false };
  });
}
export async function libraryUpdate(id: string, patch: LibraryUpdatePatch): Promise<LibraryItem | null> {
  const v = record(patch);
  const clean: Partial<LibraryItem> = {};
  if (v.favorite !== undefined) clean.favorite = boolean(v.favorite);
  if (v.lastOpenedAt !== undefined) clean.lastOpenedAt = number(v.lastOpenedAt);
  if (v.resume !== undefined) clean.resume = validateLibraryResume(v.resume);
  if (v.title !== undefined) clean.title = text(v.title, 512).trim();
  if (v.composer !== undefined) clean.composer = text(v.composer, 512).trim();
  const hasLevel = v.level !== undefined;
  const nextLevel = hasLevel ? validateLibraryLevel(v.level) : undefined;
  const hasTags = v.tags !== undefined;
  const nextTags = hasTags ? validateLibraryTags(v.tags) : undefined;
  return transaction('readwrite', async tx => {
    const store = tx.objectStore('metadata');
    const old: unknown = await request(store.get(id));
    if (!old) return null; // Never resurrect a score deleted by another tab.
    const item: LibraryItem = { ...itemValue(old), ...clean };
    if (hasLevel) {
      if (nextLevel !== undefined) item.level = nextLevel;
      else delete item.level;
    }
    if (hasTags) {
      if (nextTags !== undefined) item.tags = nextTags;
      else delete item.tags;
    }
    await request(store.put(item, id));
    return item;
  });
}
/** Records a whole-score practice run: the day, and the accuracy (0–100) of a timed run, kept when it beats the best so far. */
export async function libraryRecordPlay(id: string, day: number, accuracy: number | null): Promise<LibraryPlayResult | null> {
  const playedDay = dayNumber(day);
  const pct = accuracy === null ? null : Math.round(number(accuracy, 0, 100));
  return transaction('readwrite', async tx => {
    const store = tx.objectStore('metadata');
    const old: unknown = await request(store.get(id));
    if (!old) return null; // Never resurrect a score deleted by another tab.
    const item = itemValue(old), previousBest = item.best ?? null;
    item.lastPlayedDay = Math.max(item.lastPlayedDay ?? 0, playedDay);
    if (pct !== null && pct > (previousBest ?? 0)) item.best = pct; // as for built-in pieces, 0% sets no best
    await request(store.put(item, id));
    return { item, previousBest };
  });
}
export async function libraryRemove(id: string): Promise<void> {
  await transaction('readwrite', async tx => {
    await request(tx.objectStore('metadata').delete(id));
    await request(tx.objectStore('blobs').delete(id));
  });
}
export async function libraryRemoveMany(ids: readonly string[]): Promise<number> {
  const unique = [...new Set(ids.filter(id => typeof id === 'string' && /^[a-f0-9]{64}$/u.test(id)))];
  if (!unique.length) return 0;
  return transaction('readwrite', async tx => {
    const metaStore = tx.objectStore('metadata');
    const blobStore = tx.objectStore('blobs');
    let removed = 0;
    for (const id of unique) {
      const existing: unknown = await request(metaStore.get(id));
      if (!existing) continue;
      await request(metaStore.delete(id));
      await request(blobStore.delete(id));
      removed++;
    }
    return removed;
  });
}

function decode(value: unknown, size: number): Uint8Array<ArrayBuffer> {
  if (!Array.isArray(value) || value.length !== size ||
      !value.every((byte: unknown) => typeof byte === 'number' && Number.isInteger(byte) && byte >= 0 && byte <= 255)) invalid('Invalid backup file bytes.');
  return Uint8Array.from(value as number[]);
}
interface BackupEntry { item: LibraryItem; data: number[] }
export async function libraryExport(): Promise<Blob> {
  // Capture both stores in one snapshot; do not race separate per-item reads with deletes.
  const entries = await transaction('readonly', async tx => {
    const metadata: unknown[] = await request(tx.objectStore('metadata').getAll());
    if (metadata.length > MAX_ITEMS) throw new LibraryError('backup', 'Too many scores for one backup.');
    const entries: { item: LibraryItem; blob: Blob }[] = [];
    let total = 0;
    for (const value of metadata) {
      const item = itemValue(value);
      const blob: unknown = await request(tx.objectStore('blobs').get(item.id));
      if (!(blob instanceof Blob) || blob.size !== item.size) invalid('Missing score original.');
      total += blob.size;
      if (total > MAX_TRANSFER) throw new LibraryError('backup', 'Backup exceeds the transfer limit.');
      entries.push({ item, blob });
    }
    return entries;
  });
  const files: BackupEntry[] = [];
  for (const { item, blob } of entries) {
    if (await digest(blob) !== item.id) throw new LibraryError('backup', 'Stored score hash mismatch.');
    files.push({ item, data: Array.from(new Uint8Array(await blob.arrayBuffer())) });
  }
  const backup = new Blob([JSON.stringify({ app: 'etude-score-library', version: 1, files })], { type: 'application/json' });
  if (backup.size > MAX_TRANSFER) throw new LibraryError('backup', 'Backup exceeds the transfer limit.');
  return backup;
}
export async function libraryRestore(blob: Blob, validate: (file: File) => Promise<LibraryMetadata>): Promise<LibraryRestoreResult> {
  const staged: { item: LibraryItem; file: File }[] = [];
  try {
    if (!(blob instanceof Blob) || blob.size === 0 || blob.size > MAX_TRANSFER) invalid('Backup exceeds the transfer limit.');
    if (typeof validate !== 'function') invalid('A score parser is required.');
    const root = record(parseJson(await blob.text()));
    if (root.app !== 'etude-score-library' || root.version !== 1 || !Array.isArray(root.files) || root.files.length > MAX_ITEMS) invalid('Unsupported score backup.');
    let total = 0;
    // Validate every entry (including duplicates) before opening any write transaction.
    for (const entry of root.files) {
      const v = record(entry);
      const item = itemValue(v.item);
      total += item.size;
      if (total > MAX_TRANSFER) invalid('Backup exceeds the transfer limit.');
      const bytes = decode(v.data, item.size);
      const file = new File([bytes], item.name, { lastModified: item.addedAt });
      if (await digest(file) !== item.id) invalid('Backup score hash mismatch.');
      validateLibraryMetadata(await validate(file));
      staged.push({ item, file });
    }
  } catch (error) {
    throw new LibraryError('backup', 'Invalid or unreadable score backup.', { cause: error });
  }
  return transaction('readwrite', async tx => {
    const store = tx.objectStore('metadata');
    let added = 0;
    let duplicates = 0;
    for (const { item, file } of staged) {
      if (await request(store.get(item.id))) { duplicates++; continue; }
      await request(store.add(item, item.id));
      await request(tx.objectStore('blobs').add(file, item.id));
      added++;
    }
    return { added, duplicates };
  });
}

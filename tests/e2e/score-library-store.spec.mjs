import { test, expect } from '@playwright/test';

// Source-module imports are intentionally development-only; production bundles have no /src route.
test.skip(!process.env.ETUDE_DEV_SERVER, 'Requires ETUDE_DEV_SERVER=1 (real IndexedDB, Vite TS imports).');
test.beforeEach(async ({ page }) => { await page.goto('/etude.html'); });

const modulePath = '/src/domain/score-library-store.ts';

test('score originals and checkpoints persist across reload; content dedup preserves user metadata', async ({ page }) => {
  const saved = await page.evaluate(async path => {
    const lib = await import(path);
    const file = new File(['synthetic score original'], 'original.musicxml');
    const { item } = await lib.librarySave(file, { title: 'My title', composer: 'Composer' });
    const resume = { position: 12, measure: '4', speed: 75, hands: 'lh', wait: true, metronome: false, view: 'cont', look: 'night', zoom: 1.2 };
    await lib.libraryUpdate(item.id, { favorite: true, lastOpenedAt: 1234, resume });
    const duplicate = await lib.librarySave(new File([await file.arrayBuffer()], 'renamed.xml'), { title: 'Replacement', composer: '' });
    return { id: item.id, duplicate };
  }, modulePath);
  expect(saved.duplicate.duplicate).toBe(true);
  expect(saved.duplicate.item).toMatchObject({ name: 'original.musicxml', title: 'My title', favorite: true, lastOpenedAt: 1234, resume: { position: 12 } });
  await page.reload();
  const actual = await page.evaluate(async ({ path, id }) => {
    const lib = await import(path);
    const result = await lib.libraryGet(id);
    return { list: await lib.libraryList(), item: result.item, name: result.file.name, text: await result.file.text() };
  }, { path: modulePath, id: saved.id });
  expect(actual.list).toHaveLength(1);
  expect(actual.item).toEqual(saved.duplicate.item);
  expect(actual.name).toBe('original.musicxml');
  expect(actual.text).toBe('synthetic score original');
});

test('concurrent saves deduplicate and late updates never resurrect removed originals', async ({ page }) => {
  const result = await page.evaluate(async path => {
    const lib = await import(path);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => lib.librarySave(new File(['same bytes'], `name${i}.mid`), { title: `${i}`, composer: '' })));
    const id = results[0].item.id;
    await lib.libraryRemove(id);
    const update = await lib.libraryUpdate(id, { favorite: true });
    return { added: results.filter(r => !r.duplicate).length, ids: [...new Set(results.map(r => r.item.id))], update, get: await lib.libraryGet(id), list: await lib.libraryList() };
  }, modulePath);
  expect(result).toMatchObject({ added: 1, update: null, get: null, list: [] });
  expect(result.ids).toHaveLength(1);
});

test('versioned backup restores exact bytes and settings, merges without replacing existing records', async ({ page }) => {
  const result = await page.evaluate(async path => {
    const lib = await import(path);
    const first = (await lib.librarySave(new File([new Uint8Array([0, 1, 127, 128, 255])], 'binary.mid'), { title: 'First', composer: '' })).item;
    const second = (await lib.librarySave(new File(['second original'], 'second.mxl'), { title: 'Second', composer: 'C' })).item;
    await lib.libraryUpdate(first.id, { favorite: true });
    const backup = await lib.libraryExport();
    const manifest = JSON.parse(await backup.text());
    await lib.libraryRemove(second.id);
    await lib.libraryUpdate(first.id, { favorite: false });
    const parserCalls = [];
    const restored = await lib.libraryRestore(backup, async file => { parserCalls.push(file.name); return { title: 'Parsed', composer: '' }; });
    const repeat = await lib.libraryRestore(backup, async () => ({ title: '', composer: '' }));
    const binary = await lib.libraryGet(first.id);
    return { manifest, restored, repeat, parserCalls, bytes: Array.from(new Uint8Array(await binary.file.arrayBuffer())), first: binary.item, second: (await lib.libraryGet(second.id)).item };
  }, modulePath);
  expect(result.manifest).toMatchObject({ app: 'etude-score-library', version: 1 });
  expect(result.manifest.files).toHaveLength(2);
  expect(result.restored).toEqual({ added: 1, duplicates: 1 });
  expect(result.repeat).toEqual({ added: 0, duplicates: 2 });
  expect(result.parserCalls.sort()).toEqual(['binary.mid', 'second.mxl']);
  expect(result.bytes).toEqual([0, 1, 127, 128, 255]);
  expect(result.first.favorite).toBe(false);
  expect(result.second).toMatchObject({ title: 'Second', composer: 'C', name: 'second.mxl' });
});

test('corrupt, oversized and parser-rejected backups leave both stores unchanged', async ({ page }) => {
  const result = await page.evaluate(async path => {
    const lib = await import(path);
    const a = (await lib.librarySave(new File(['first'], 'a.xml'), { title: 'A', composer: '' })).item;
    const b = (await lib.librarySave(new File(['second'], 'b.mid'), { title: 'B', composer: '' })).item;
    const backup = JSON.parse(await (await lib.libraryExport()).text());
    await lib.libraryRemove(a.id);
    await lib.libraryRemove(b.id);
    const sentinel = (await lib.librarySave(new File(['keep'], 'sentinel.xml'), { title: 'Keep', composer: '' })).item;
    const attempts = [];
    const variants = [
      raw => { raw.version = 2; },
      raw => { raw.files[1].data = '!!!!'; },
      raw => { raw.files[1].item.id = '0'.repeat(64); },
      raw => { raw.files[1].item.size = 2097153; },
      raw => { raw.files[1].item.resume = { position: -1 }; },
      raw => { raw.files[1].item.favorite = 'yes'; },
      raw => { raw.files[1].item.title = 'x'.repeat(513); },
      raw => { raw.files = Array(1001).fill(raw.files[0]); },
    ];
    for (const alter of variants) {
      const raw = structuredClone(backup);
      alter(raw);
      try { await lib.libraryRestore(new Blob([JSON.stringify(raw)]), async () => ({ title: '', composer: '' })); attempts.push('accepted'); }
      catch (error) { attempts.push(error.code); }
    }
    let parsed = 0;
    try {
      await lib.libraryRestore(new Blob([JSON.stringify(backup)]), async () => {
        if (++parsed === 2) throw new Error('parser rejects second score');
        return { title: '', composer: '' };
      });
      attempts.push('accepted');
    } catch (error) { attempts.push(error.code); }
    try { await lib.libraryRestore(new Blob([new Uint8Array(64 * 1024 * 1024 + 1)]), async () => ({ title: '', composer: '' })); }
    catch (error) { attempts.push(error.code); }
    return { attempts, parsed, list: await lib.libraryList(), sentinel, text: await (await lib.libraryGet(sentinel.id)).file.text() };
  }, modulePath);
  expect(result.attempts).toEqual(Array(10).fill('backup'));
  expect(result.parsed).toBe(2);
  expect(result.list).toEqual([result.sentinel]);
  expect(result.text).toBe('keep');
});

test('quota failure aborts metadata and blobs for save and multi-score restore', async ({ page }) => {
  const result = await page.evaluate(async path => {
    const lib = await import(path);
    const a = (await lib.librarySave(new File(['first'], 'a.mid'), { title: 'A', composer: '' })).item;
    const b = (await lib.librarySave(new File(['second'], 'b.xml'), { title: 'B', composer: '' })).item;
    const backup = await lib.libraryExport();
    await lib.libraryRemove(a.id);
    await lib.libraryRemove(b.id);
    const original = IDBObjectStore.prototype.add;
    let blobWrites = 0;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'blobs' && ++blobWrites === 2) throw new DOMException('Synthetic full disk', 'QuotaExceededError');
      return original.apply(this, args);
    };
    let restoreCode;
    try { await lib.libraryRestore(backup, async () => ({ title: '', composer: '' })); }
    catch (error) { restoreCode = error.code; }
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'blobs') throw new DOMException('Synthetic full disk', 'QuotaExceededError');
      return original.apply(this, args);
    };
    let saveCode;
    try { await lib.librarySave(new File(['third'], 'c.mid'), { title: '', composer: '' }); }
    catch (error) { saveCode = error.code; }
    finally { IDBObjectStore.prototype.add = original; }
    return { restoreCode, saveCode, items: await lib.libraryList(), a: await lib.libraryGet(a.id), b: await lib.libraryGet(b.id) };
  }, modulePath);
  expect(result).toEqual({ restoreCode: 'quota', saveCode: 'quota', items: [], a: null, b: null });
});

test('invalid file and checkpoint input is rejected without modifying stored data', async ({ page }) => {
  const result = await page.evaluate(async path => {
    const lib = await import(path);
    const item = (await lib.librarySave(new File(['valid'], 'valid.musicxml'), { title: '', composer: '' })).item;
    const codes = [];
    for (const file of [new File(['x'], 'bad.exe'), new File([], 'empty.mid'), new File([new Uint8Array(2097153)], 'huge.mid')]) {
      try { await lib.librarySave(file, { title: '', composer: '' }); }
      catch (error) { codes.push(error.code); }
    }
    for (const patch of [{ lastOpenedAt: NaN }, { favorite: 1 }, { resume: { position: Infinity } }]) {
      try { await lib.libraryUpdate(item.id, patch); }
      catch (error) { codes.push(error.code); }
    }
    return { codes, item, list: await lib.libraryList() };
  }, modulePath);
  expect(result.codes).toEqual(Array(6).fill('invalid'));
  expect(result.list).toEqual([result.item]);
});

test('missing IndexedDB reports unavailable rather than falling back to volatile storage', async ({ page }) => {
  const result = await page.evaluate(async path => {
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
    // The UI may already have opened its module instance; exercise a fresh lazy opener.
    const lib = await import(`${path}?unavailable-test`);
    try { await lib.libraryList(); return 'accepted'; }
    catch (error) { return { name: error.name, code: error.code }; }
  }, modulePath);
  expect(result).toEqual({ name: 'LibraryError', code: 'unavailable' });
});

test('maximum-size binary file round-trips without byte truncation', async ({ page }) => {
  const result = await page.evaluate(async path => {
    const lib = await import(path);
    const bytes = Uint8Array.from({ length: 2 * 1024 * 1024 }, (_, i) => i % 256);
    const item = (await lib.librarySave(new File([bytes], 'maximum.mid'), { title: '', composer: '' })).item;
    const backup = await lib.libraryExport();
    await lib.libraryRemove(item.id);
    const restored = await lib.libraryRestore(backup, async () => ({ title: '', composer: '' }));
    const actual = new Uint8Array(await (await lib.libraryGet(item.id)).file.arrayBuffer());
    return { restored, size: actual.length, equal: actual.every((byte, i) => byte === bytes[i]) };
  }, modulePath);
  expect(result).toEqual({ restored: { added: 1, duplicates: 0 }, size: 2097152, equal: true });
});

test('write promises resolve after transaction commit; versionchange closes cached connection', async ({ page }) => {
  const result = await page.evaluate(async path => {
    const lib = await import(path);
    const original = IDBDatabase.prototype.transaction;
    let committed = false;
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = original.apply(this, args);
      if (args[1] === 'readwrite') tx.addEventListener('complete', () => { committed = true; });
      return tx;
    };
    let item;
    try { item = (await lib.librarySave(new File(['commit'], 'commit.mid'), { title: '', composer: '' })).item; }
    finally { IDBDatabase.prototype.transaction = original; }
    const completedWhenResolved = committed;
    // Deletion sends versionchange to the module's cached connection. It must close instead of blocking.
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase('etude-score-library-v1');
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('library did not close on versionchange'));
    });
    return { completedWhenResolved, reloaded: await lib.libraryList(), missing: await lib.libraryGet(item.id) };
  }, modulePath);
  expect(result).toEqual({ completedWhenResolved: true, reloaded: [], missing: null });
});

test('organization fields (title, composer, level, tags) update, clear, and round-trip through backup', async ({ page }) => {
  const result = await page.evaluate(async path => {
    const lib = await import(path);
    const saved = (await lib.librarySave(new File(['org test'], 'org.musicxml'), { title: 'Old', composer: '' })).item;
    const updated = await lib.libraryUpdate(saved.id, {
      title: 'New Title',
      composer: 'Bach',
      level: '  Level 2  ',
      tags: ['Baroque', 'Exam', 'baroque'],
    });
    const backup = await lib.libraryExport();
    await lib.libraryUpdate(saved.id, { level: null, tags: [] });
    const cleared = (await lib.libraryGet(saved.id)).item;
    await lib.libraryRemove(saved.id);
    const restored = await lib.libraryRestore(backup, async () => ({ title: 'Ignored', composer: '' }));
    const fromBackup = (await lib.libraryGet(saved.id)).item;
    return { updated, cleared, restored, fromBackup };
  }, modulePath);
  expect(result.updated).toMatchObject({ title: 'New Title', composer: 'Bach', level: 'Level 2', tags: ['Baroque', 'Exam'] });
  expect(result.cleared.level).toBeUndefined();
  expect(result.cleared.tags).toBeUndefined();
  expect(result.restored).toEqual({ added: 1, duplicates: 0 });
  expect(result.fromBackup).toMatchObject({ title: 'New Title', composer: 'Bach', level: 'Level 2', tags: ['Baroque', 'Exam'] });
});

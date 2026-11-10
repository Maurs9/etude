import { readFile } from 'node:fs/promises';
import { test, expect, APP } from '../helpers/fixtures.mjs';

// Progress worth protecting: a few reviews and one learned interval.
const saved = { v: 3, lang: 'en', gen: '', data: { totalReviews: 7, totalCorrect: 6, srs: { 'iv:7': { box: 3, ease: 2.3, reps: 4, lapses: 0, due: 1, last: 1 } } } };

// Seeds the raw `ptt-v3` text once, so a test can start from a record that does not parse.
async function openRaw(page, raw) {
  await page.addInitScript(text => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('ptt-v3', text);
  }, raw);
  await page.goto(APP);
  await page.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));
}

const snapshots = page => page.evaluate(async () => { await window.__etude.storeRefresh(); return window.__etude.STORE.snaps.map(s => s.reason); });

test.describe('data safety', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('__seeded')) indexedDB.deleteDatabase('etude-backups'); });
  });

  test('a failed save shows a banner with Export, and the next good save clears it', async ({ app, page }) => {
    await app.open({ saved });
    await page.evaluate(() => {
      const real = Storage.prototype.setItem;
      window.__realSetItem = real;
      Storage.prototype.setItem = function (key, value) { if (key === 'ptt-v3') throw new DOMException('full', 'QuotaExceededError'); return real.call(this, key, value); };
      window.__etude.saveAll();
    });
    await expect(page.locator('#storeNote')).toBeVisible();
    await expect(page.locator('#storeNoteText')).toHaveText(/couldn't be saved/);
    await expect(page.locator('#storeNoteExport')).toBeVisible();

    // Export still carries the progress held in memory.
    const download = page.waitForEvent('download');
    await page.locator('#storeNoteExport').click();
    const file = JSON.parse(await readFile(await (await download).path(), 'utf8'));
    expect(file.data.totalReviews).toBe(7);

    await page.evaluate(() => { Storage.prototype.setItem = window.__realSetItem; window.__etude.saveAll(); });
    await expect(page.locator('#storeNote')).toBeHidden();
  });

  test('an unreadable record is kept before anything saves over it', async ({ page }) => {
    await openRaw(page, '{"v":3,"data":{"totalReviews":7');
    await expect(page.locator('#storeNote')).toBeVisible();
    await expect(page.locator('#storeNoteText')).toHaveText(/couldn't be read/);
    await expect.poll(() => snapshots(page)).toContain('unreadable');
    const kept = await page.evaluate(async () => {
      const info = window.__etude.STORE.snaps.find(s => s.reason === 'unreadable');
      const db = await new Promise(r => { const q = indexedDB.open('etude-backups'); q.onsuccess = () => r(q.result); });
      const snap = await new Promise(r => { const q = db.transaction('snapshots').objectStore('snapshots').get(info.id); q.onsuccess = () => r(q.result); });
      db.close();
      return snap.raw;
    });
    expect(kept).toBe('{"v":3,"data":{"totalReviews":7');
    // IndexedDB holds the copy, so the quota-heavy localStorage copy is gone.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('ptt-v3-unreadable'))).toBeNull();
    await page.locator('#storeNoteOk').click();
    await expect(page.locator('#storeNote')).toBeHidden();
  });

  test('a record from a newer build is never overwritten', async ({ page }) => {
    const raw = JSON.stringify({ ...saved, schema: 99 });
    await openRaw(page, raw);
    await expect(page.locator('#storeNoteText')).toHaveText(/newer version/);
    await expect(page.locator('#storeNoteReload')).toBeVisible();
    await page.evaluate(() => { window.__etude.data.totalReviews = 1; window.__etude.saveAll(); });
    expect(await page.evaluate(() => localStorage.getItem('ptt-v3'))).toBe(raw);
  });

  test('a daily copy and a pre-reset copy let a reset be undone', async ({ app, page }) => {
    await app.open({ saved });
    await expect.poll(() => snapshots(page)).toEqual(['daily']);
    page.on('dialog', dialog => dialog.accept());
    await page.evaluate(() => window.__etude.show('progress'));
    await page.locator('#resetBtn').click();
    await expect.poll(() => page.evaluate(() => window.__etude.data.totalReviews)).toBe(0);
    await expect.poll(() => snapshots(page)).toEqual(['before-reset', 'daily']);

    await page.locator('#settingsBtn').click();
    await expect(page.locator('#set-snaps option')).toHaveCount(2);
    await expect(page.locator('#set-snaps option').first()).toHaveText(/before reset/);
    const reloaded = page.waitForEvent('load');
    await page.locator('#set-snap-restore').click();
    await reloaded;
    await page.waitForFunction(() => typeof window.__etude?.show === 'function' && window.__etude.data.totalReviews === 7);
    // The restore kept a copy of the reset state too.
    await expect.poll(() => snapshots(page)).toContain('before-restore');
  });

  test('Settings shows storage protection and when the last export happened', async ({ app, page }) => {
    await app.open({ saved });
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#set-storage-status')).toHaveText(/Protected|Not protected|can't protect/);
    await expect(page.locator('#set-backup-age')).toHaveText('Not exported yet.');
    await expect(page.locator('#set-backup-age')).toHaveClass(/warn/);
    const download = page.waitForEvent('download');
    await page.locator('#exportBtn').click();
    await download;
    await expect(page.locator('#set-backup-age')).toHaveText(/^Last exported /);
    await expect(page.locator('#set-backup-age')).not.toHaveClass(/warn/);
  });

  test('a backup from a newer build is refused on import', async ({ app, page }) => {
    await app.open({ saved });
    const before = await page.evaluate(() => localStorage.getItem('ptt-v3'));
    const message = new Promise(resolve => page.once('dialog', dialog => { resolve(dialog.message()); void dialog.accept(); }));
    await page.locator('#importFile').setInputFiles({ name: 'new.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ v: 3, schema: 99, data: {} })) });
    expect(await message).toMatch(/newer version/);
    expect(await page.evaluate(() => localStorage.getItem('ptt-v3'))).toBe(before);
  });

  test('the diagnostics panel lists storage, backups, MIDI and audio facts', async ({ app, page }) => {
    await app.open({ saved });
    await page.locator('#settingsBtn').click();
    await page.locator('#set-diag summary').click();
    const out = page.locator('#set-diag-out');
    await expect(out).toContainText('App version: ');
    await expect(out).toContainText(/Storage: (persisted|best-effort|unsupported)/);
    await expect(out).toContainText('Saving: ok');
    await expect(out).toContainText(/Automatic backups: 1, newest /);
    await expect(out).toContainText('MIDI: ');
    await expect(out).toContainText('Audio: ');
  });

  test('with no room for a copy, an unreadable record blocks saving and the banner cannot be dismissed', async ({ page }) => {
    await page.addInitScript(() => {
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) { if (key === 'ptt-v3-unreadable') throw new DOMException('full', 'QuotaExceededError'); return real.call(this, key, value); };
      IDBFactory.prototype.open = function () { throw new DOMException('full', 'QuotaExceededError'); };
    });
    await openRaw(page, '{"v":3,"data":{"totalReviews":7');
    await expect(page.locator('#storeNoteText')).toHaveText(/no room to keep a copy/);
    await expect(page.locator('#storeNoteOk')).toBeHidden();
    await expect(page.locator('#storeNoteExport')).toBeVisible();
    await page.evaluate(() => window.__etude.saveAll());
    expect(await page.evaluate(() => localStorage.getItem('ptt-v3'))).toBe('{"v":3,"data":{"totalReviews":7');
  });

  test('an import asks before replacing progress when the safety copy fails', async ({ app, page }) => {
    await app.open({ saved });
    const before = await page.evaluate(() => { IDBFactory.prototype.open = function () { throw new DOMException('full', 'QuotaExceededError'); }; return localStorage.getItem('ptt-v3'); });
    const messages = [];
    page.on('dialog', dialog => { messages.push(dialog.message()); void (messages.length === 1 ? dialog.accept() : dialog.dismiss()); });
    await page.locator('#importFile').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ v: 3, data: { totalReviews: 1 } })) });
    await expect.poll(() => messages.length).toBe(2);
    expect(messages[1]).toMatch(/couldn't keep a copy/);
    expect(await page.evaluate(() => localStorage.getItem('ptt-v3'))).toBe(before);
  });

  test('sight-reading history alone earns a daily copy', async ({ app, page }) => {
    await app.open();
    await page.evaluate(() => {
      const ledger = window.__etude.srtCreateLedger();
      const attempt = {
        attemptId: 'a1', fingerprint: 'v1:x', ownerTabId: 'tab', generation: ledger.generation, status: 'completed', finishedAt: 10,
        scoringVersion: 1, N: 1, TP: 1, FP: 0, FN: 0, G: 1, Q: 0, lateOrEarlyCount: 0, restViolations: 0, pitchPrecision: 1, pitchRecall: 1,
        pitchF1: 100, rhythmAcc: 100, score: 100, stars: 3, perfect: true, meanOffsetMs: 0, meanAbsoluteOffsetMs: 0,
        noteResults: [{ expectedId: 'n', classification: 'good', matchedInputId: 'i', errorMs: 0 }], extraInputs: [],
      };
      localStorage.setItem('etude-sight-v1', JSON.stringify({ ...ledger, attempts: { a1: attempt } }));
      window.__etude.STORE.snapDay = -1;
      window.__etude.saveAll();
    });
    await expect.poll(() => snapshots(page)).toEqual(['daily']);
  });

  test('a broken record while the strings are still loading boots without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    // Hold the English strings back, so the backup copy of the broken record finishes first.
    await page.route(/ui-en[^/]*\.(ts|js)(\?|$)/, async route => { await new Promise(r => setTimeout(r, 1500)); await route.continue(); });
    await openRaw(page, '"hello world"');
    await expect(page.locator('#storeNoteText')).toHaveText(/couldn't be read/);
    expect(errors).toEqual([]);
  });
});


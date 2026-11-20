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
    const raw = JSON.stringify({ ...saved, schema: 99, data: { ...saved.data, srs: [] } });
    await openRaw(page, raw);
    await expect(page.locator('#storeNoteText')).toHaveText(/newer version/);
    await expect(page.locator('#storeNoteReload')).toBeVisible();
    await page.evaluate(() => { window.__etude.data.totalReviews = 1; window.__etude.saveAll(); });
    expect(await page.evaluate(() => localStorage.getItem('ptt-v3'))).toBe(raw);
    await expect(page.locator('#importBtn')).toBeDisabled();
    await expect(page.locator('#prog-import')).toBeDisabled();
    await expect(page.locator('#set-snap-restore')).toBeDisabled();
    const message = page.waitForEvent('dialog').then(async dialog => {
      await dialog.accept();
      return dialog.message();
    });
    await page.locator('#importFile').setInputFiles({
      name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)),
    });
    await expect(message).resolves.toMatch(/newer version/);
    expect(await page.evaluate(() => localStorage.getItem('ptt-v3'))).toBe(raw);
  });

  test('blocks import when newer progress appears at commit and rolls the ledger back', async ({ app, page }) => {
    await app.open({ saved });
    const newer = JSON.stringify({ ...saved, schema: 99 });
    const { backup, before } = await page.evaluate(next => {
      const ledger = window.__etude.srtCreateLedger();
      const before = JSON.stringify(ledger);
      localStorage.setItem('etude-sight-v1', before);
      const backup = { v: 3, data: { sightLedger: { ...ledger, exposures: { 'v1:test': { firstSeenAt: 1, reason: 'listen' } } } } };
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'etude-sight-v1') {
          set.call(this, 'ptt-v3', next);
          Storage.prototype.setItem = set;
        }
        return set.call(this, key, value);
      };
      return { backup, before };
    }, newer);
    const alert = new Promise(resolve => page.on('dialog', dialog => {
      void dialog.accept();
      if (dialog.type() === 'alert') resolve(dialog.message());
    }));
    await page.locator('#importFile').setInputFiles({
      name: 'older.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(alert).resolves.toMatch(/newer version/);
    expect(await page.evaluate(() => localStorage.getItem('ptt-v3'))).toBe(newer);
    expect(await page.evaluate(() => localStorage.getItem('etude-sight-v1'))).toBe(before);
  });

  test('keeps the imported preferences when a save is pending at reload', async ({ app, page }) => {
    const future = (Date.now() + 86_400_000).toString(36).padStart(9, '0') + 'future';
    await app.open({ saved: { ...saved, gen: future }, hash: 'progress' });
    await page.evaluate(() => {
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'ptt-v3' && JSON.parse(value).masterVol === 0.15) {
          Storage.prototype.setItem = write;
          window.__etude.saveSoon();
        }
        return write.call(this, key, value);
      };
    });
    const backup = { ...saved, masterVol: 0.15, muted: true, reverb: 0.45, bpm: 150 };
    page.once('dialog', dialog => dialog.accept());
    await Promise.all([
      page.waitForEvent('load'),
      page.locator('#importFile').setInputFiles({
        name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
      }),
    ]);
    await expect(page.locator('#volume')).toHaveValue('15');
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')));
    expect(restored).toMatchObject({ ...backup, gen: expect.any(String) });
    expect(restored.gen > future).toBe(true);
  });

  test('rejects a malformed Pieces map without replacing progress', async ({ app, page }) => {
    await app.open({ saved });
    const dialog = page.waitForEvent('dialog').then(async dialog => {
      await dialog.accept();
      return [dialog.type(), dialog.message()];
    });
    await page.locator('#importFile').setInputFiles({
      name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"v":3,"data":{"sheet":null}}'),
    });
    await expect(dialog).resolves.toEqual(['alert', expect.stringMatching(/doesn’t look like an Étude backup/)]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).data.totalReviews)).toBe(7);
    await page.locator('#nav button[data-view="analysis"]').click();
    await expect(page.locator('#pc-list')).toContainText('Prelude');
  });

  test('shows usable Reading statistics with malformed counters saved by an older build', async ({ app, page }) => {
    const reading = { tot: { n: 'invalid', ok: 0, ms: 0, sess: 0 } };
    await app.open({ saved: { ...saved, data: { ...saved.data, reading } }, hash: 'progress' });
    await expect(page.locator('#rdx-stats .rdx-tiles b').first()).toHaveText('0');
    await page.evaluate(() => window.__etude.show('read'));
    await page.locator('#rdt-drills').click();
    await expect(page.locator('#rdx-hero .rdx-hero-m b').first()).toHaveText('0');
  });

  test('Pieces still opens when a previous build saved a null Pieces map', async ({ app, page }) => {
    await app.open({ hash: 'analysis', saved: { ...saved, data: { ...saved.data, sheet: null } } });
    await expect(page.locator('#pc-list')).toContainText('Prelude');
    expect(await page.evaluate(() => window.__etude.data.totalReviews)).toBe(7);
  });

  test('restores a large export into an empty browser with a single stored ledger', async ({ app, page, browser }) => {
    await app.open({ saved });
    await page.evaluate(() => {
      const ledger = window.__etude.srtCreateLedger();
      for (let i = 0; i < 500; i++) {
        const attemptId = 'attempt-' + i, fingerprint = 'v1:piece-' + i;
        ledger.exposures[fingerprint] = { firstSeenAt: i, reason: 'first-sight' };
        ledger.attempts[attemptId] = {
          attemptId, fingerprint, ownerTabId: 'tab', generation: ledger.generation, status: 'completed', finishedAt: i,
          scoringVersion: 1, N: 68, TP: 68, FP: 0, FN: 0, G: 68, Q: 0, lateOrEarlyCount: 0, restViolations: 0,
          pitchPrecision: 1, pitchRecall: 1, pitchF1: 100, rhythmAcc: 100, score: 100, stars: 3, perfect: true,
          meanOffsetMs: 0, meanAbsoluteOffsetMs: 0, extraInputs: [],
          noteResults: Array.from({ length: 68 }, (_, n) => ({
            expectedId: 'note-' + n, classification: 'good', matchedInputId: 'input-' + n, errorMs: 0,
          })),
        };
      }
      localStorage.setItem('etude-sight-v1', JSON.stringify(ledger));
    });
    await page.locator('#settingsBtn').click();
    const download = page.waitForEvent('download');
    await page.locator('#exportBtn').click();
    const buffer = await readFile(await (await download).path());
    expect(buffer.length).toBeGreaterThan(3_000_000);

    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      const destination = await context.newPage();
      await destination.goto(page.url());
      await destination.waitForFunction(() => document.querySelector('#keys .key'));
      destination.on('dialog', dialog => {
        if (dialog.type() === 'confirm') void dialog.accept();
        else void dialog.dismiss();
      });
      await Promise.all([
        destination.waitForEvent('framenavigated', frame => frame === destination.mainFrame()),
        destination.locator('#importFile').setInputFiles({ name: 'export.json', mimeType: 'application/json', buffer }),
      ]);
      await destination.waitForFunction(() => document.querySelector('#keys .key'));
      const restored = await destination.evaluate(() => {
        const progress = JSON.parse(localStorage.getItem('ptt-v3') ?? 'null');
        const ledger = JSON.parse(localStorage.getItem('etude-sight-v1') ?? '{}');
        return [progress?.data.totalReviews, progress?.data.sightLedger === undefined, Object.keys(ledger.attempts ?? {}).length];
      });
      expect(restored).toEqual([7, true, 500]);
    }
    finally {
      await context.close();
    }
  });

  test('a daily copy and a pre-reset copy let a reset be undone', async ({ app, page }) => {
    await app.open({ saved });
    await expect.poll(() => snapshots(page)).toEqual(['daily']);
    const before = await page.evaluate(() => {
      const ledger = window.__etude.srtReadLedger(localStorage);
      const attempt = {
        attemptId: 'a1', fingerprint: 'v1:x', ownerTabId: 'tab', generation: ledger.generation, status: 'completed', finishedAt: 10,
        scoringVersion: 1, N: 1, TP: 1, FP: 0, FN: 0, G: 1, Q: 0, lateOrEarlyCount: 0, restViolations: 0, durationViolations: 0,
        pitchPrecision: 1, pitchRecall: 1, pitchF1: 100, rhythmAcc: 100, score: 100, stars: 3, perfect: true, meanOffsetMs: 0, meanAbsoluteOffsetMs: 0,
        noteResults: [{ expectedId: 'n', classification: 'good', matchedInputId: 'i', errorMs: 0 }], extraInputs: [],
      };
      const exposures = { 'v1:x': { firstSeenAt: 1, reason: 'first-sight' } };
      localStorage.setItem('etude-sight-v1', JSON.stringify({ ...ledger, attempts: { a1: attempt }, exposures, prefs: { ...ledger.prefs, practiceHints: false } }));
      return ledger.generation;
    });
    page.on('dialog', dialog => dialog.accept());
    await page.evaluate(() => window.__etude.show('progress'));
    await page.locator('#resetBtn').click();
    await expect.poll(() => page.evaluate(() => window.__etude.data.totalReviews)).toBe(0);
    await expect.poll(() => snapshots(page)).toEqual(['before-reset', 'daily']);
    const ledger = await page.evaluate(() => window.__etude.srtReadLedger(localStorage));
    expect(ledger).toMatchObject({ attempts: {}, exposures: {}, sessions: {}, prefs: { practiceHints: false } });
    expect(Object.keys(ledger.attempts)).toEqual([]);
    expect(Object.keys(ledger.exposures)).toEqual([]);
    expect(ledger.generation).not.toBe(before);
    expect(await page.evaluate(generation => window.__etude.srtLedgerUpdate(localStorage, {
      type: 'recordListen', fingerprint: 'v1:old-tab', generation,
    }), before)).toEqual({ ok: false, reason: 'stale_generation' });

    await page.locator('#settingsBtn').click();
    await expect(page.locator('#set-snaps option')).toHaveCount(2);
    await expect(page.locator('#set-snaps option').first()).toHaveText(/before reset/);
    const reloaded = page.waitForEvent('load');
    await page.locator('#set-snap-restore').click();
    await reloaded;
    await page.waitForFunction(() => typeof window.__etude?.show === 'function' && window.__etude.data.totalReviews === 7);
    expect(await page.evaluate(() => window.__etude.srtReadLedger(localStorage).attempts.a1?.status)).toBe('completed');
    // The restore kept a copy of the reset state too.
    await expect.poll(() => snapshots(page)).toContain('before-restore');
  });

  test('reset waits for a backup and leaves history intact if the user declines without one', async ({ app, page }) => {
    await app.open({ hash: 'progress', saved });
    await page.evaluate(() => {
      window.__etude.srtReadLedger(localStorage);
      IDBFactory.prototype.open = () => { throw new DOMException('blocked', 'InvalidStateError'); };
    });
    const progress = () => page.evaluate(() => {
      const { data, gen } = JSON.parse(localStorage.getItem('ptt-v3'));
      return { data, gen, ledger: localStorage.getItem('etude-sight-v1') };
    });
    const before = await progress();
    const messages = [];
    page.on('dialog', dialog => {
      messages.push(dialog.message());
      return messages.length === 1 ? dialog.accept() : dialog.dismiss();
    });
    await page.locator('#resetBtn').click();
    await expect.poll(() => messages).toEqual([expect.stringMatching(/Reset all learning/), expect.stringMatching(/Reset it anyway/)]);
    await expect(page.locator('#resetBtn')).toBeEnabled();
    expect(await progress()).toEqual(before);
  });

  test('reset rolls back the ledger if the progress write fails', async ({ app, page }) => {
    await app.open({ hash: 'progress', saved });
    const before = await page.evaluate(() => {
      window.__etude.srtReadLedger(localStorage);
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'ptt-v3') throw new DOMException('full', 'QuotaExceededError');
        set.call(this, key, value);
      };
      return ['ptt-v3', 'etude-sight-v1'].map(key => localStorage.getItem(key));
    });
    const failed = new Promise(resolve => page.on('dialog', dialog => {
      void dialog.accept();
      if (dialog.type() === 'alert') resolve(dialog.message());
    }));
    await page.locator('#resetBtn').click();
    await expect(failed).resolves.toMatch(/couldn't reset your progress/);
    expect(await page.evaluate(() => ['ptt-v3', 'etude-sight-v1'].map(key => localStorage.getItem(key)))).toEqual(before);
    expect(await page.evaluate(() => window.__etude.data.totalReviews)).toBe(7);
    await expect.poll(() => snapshots(page)).toContain('before-reset');
  });

  test('completing a lesson alone earns a daily copy', async ({ app, page }) => {
    await app.open({ hash: 'learn' });
    await expect.poll(() => snapshots(page)).toEqual([]);
    await page.locator('[data-ln="mark"]').click();
    await expect.poll(() => snapshots(page)).toEqual(['daily']);
  });

  test('reviews a legacy imported card with a finite ease and due date', async ({ app, page }) => {
    await app.open({ saved });
    page.on('dialog', dialog => dialog.accept());
    const reloaded = page.waitForEvent('load');
    await page.locator('#importFile').setInputFiles('tests/fixtures/storage/ptt-v3-legacy.json');
    await reloaded;
    await page.waitForFunction(() => typeof window.__etude?.reviewItem === 'function');
    const review = await page.evaluate(() => {
      window.__etude.reviewItem('iv:1', true);
      return JSON.parse(localStorage.getItem('ptt-v3')).data.srs['iv:1'];
    });
    expect(review).toMatchObject({ box: 3, reps: 4, lapses: 0 });
    expect(review.ease).toBeCloseTo(2.35);
    expect(review.due).toBe(review.last + 4);
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

  test('an import failure on ptt-v3 rolls back the sight-reading ledger instead of leaving split state', async ({ app, page }) => {
    await app.open({ saved });
    const initialLedger = await page.evaluate(() => {
      const ledger = window.__etude.srtCreateLedger();
      localStorage.setItem('etude-sight-v1', JSON.stringify(ledger));
      return localStorage.getItem('etude-sight-v1');
    });
    const beforePtt = await page.evaluate(() => localStorage.getItem('ptt-v3'));

    const importedLedger = await page.evaluate(() => {
      const ledger = window.__etude.srtCreateLedger();
      const attempt = {
        attemptId: 'imp-1', fingerprint: 'v1:x', ownerTabId: 'tab', generation: ledger.generation, status: 'completed', finishedAt: 10,
        scoringVersion: 1, N: 1, TP: 1, FP: 0, FN: 0, G: 1, Q: 0, lateOrEarlyCount: 0, restViolations: 0, pitchPrecision: 1, pitchRecall: 1,
        pitchF1: 100, rhythmAcc: 100, score: 100, stars: 3, perfect: true, meanOffsetMs: 0, meanAbsoluteOffsetMs: 0,
        noteResults: [{ expectedId: 'n', classification: 'good', matchedInputId: 'i', errorMs: 0 }], extraInputs: [],
      };
      return { ...ledger, attempts: { 'imp-1': attempt } };
    });

    await page.evaluate(() => {
      const real = Storage.prototype.setItem;
      window.__realSetItem = real;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'ptt-v3') throw new DOMException('full', 'QuotaExceededError');
        return real.call(this, key, value);
      };
    });

    const msg = new Promise(resolve => page.on('dialog', dialog => {
      const text = dialog.message();
      void dialog.accept();
      if (/browser storage/i.test(text)) resolve(text);
    }));
    await page.locator('#importFile').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ v: 3, data: { totalReviews: 99, sightLedger: importedLedger } })),
    });
    await expect(msg).resolves.toBeTruthy();

    await page.evaluate(() => { Storage.prototype.setItem = window.__realSetItem; });
    expect(await page.evaluate(() => localStorage.getItem('etude-sight-v1'))).toBe(initialLedger);
    expect(await page.evaluate(() => localStorage.getItem('ptt-v3'))).toBe(beforePtt);
  });

  test('failed backup rollback captures snapshot under lock and preserves concurrent exposures', async ({ app, page, context }) => {
    await app.open({ saved });
    const seed = await page.evaluate(() => {
      const ledger = window.__etude.srtCreateLedger();
      localStorage.setItem('etude-sight-v1', JSON.stringify(ledger));
      return ledger;
    });
    const importedLedger = {
      ...seed,
      exposures: { 'fp-backup': { firstSeenAt: 50, reason: 'listen' } },
    };

    const secondTab = await context.newPage();
    await secondTab.goto(page.url());
    await secondTab.waitForFunction(() => typeof window.__etude?.srtLedgerUpdate === 'function');
    const beforePtt = await page.evaluate(() => localStorage.getItem('ptt-v3'));

    // Hold the exclusive ledger lock from tab 2, kick off backup import on tab 1,
    // record a concurrent exposure in tab 2, and fail ptt-v3 write on tab 1.
    await secondTab.evaluate(() => {
      window.__releaseLock = null;
      window.__lockAcquired = new Promise(resolve => {
        void navigator.locks.request('etude-sight-ledger-v1', { mode: 'exclusive' }, async () => {
          resolve();
          await new Promise(done => { window.__releaseLock = done; });
        });
      });
    });
    await secondTab.evaluate(() => window.__lockAcquired);

    await page.evaluate(() => {
      const real = Storage.prototype.setItem;
      window.__realSetItem = real;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'ptt-v3') throw new DOMException('full', 'QuotaExceededError');
        return real.call(this, key, value);
      };
    });

    const msg = new Promise(resolve => page.on('dialog', dialog => {
      const text = dialog.message();
      void dialog.accept();
      if (/browser storage/i.test(text)) resolve(text);
    }));
    await page.locator('#importFile').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ v: 3, data: { totalReviews: 99, sightLedger: importedLedger } })),
    });

    // While import waits for the lock (after pre-lock snapshot steps), tab 2 commits a concurrent exposure.
    await secondTab.evaluate(async (generation) => {
      const release = window.__releaseLock;
      const queued = window.__etude.srtLedgerUpdate(localStorage, {
        type: 'recordExposure',
        fingerprint: 'fp-concurrent-tab2',
        reason: 'learn',
        generation,
      });
      release();
      const res = await queued;
      if (!res.ok) throw new Error('concurrent write failed: ' + res.reason);
    }, seed.generation);

    await expect(msg).resolves.toBeTruthy();
    await page.evaluate(() => { Storage.prototype.setItem = window.__realSetItem; });

    const ledgerAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('etude-sight-v1')));
    expect(ledgerAfter.exposures['fp-concurrent-tab2']).toBeTruthy();
    expect(ledgerAfter.exposures['fp-backup']).toBeUndefined();
    expect(await page.evaluate(() => localStorage.getItem('ptt-v3'))).toBe(beforePtt);
    await secondTab.close();
  });
});

test('oversized progress imports are rejected before the file is read', async ({ app, page }) => {
  await app.open();
  const message = new Promise(resolve => page.once('dialog', async dialog => {
    resolve(dialog.message());
    await dialog.dismiss();
  }));
  await page.evaluate(() => {
    const files = new DataTransfer();
    files.items.add(new File([new Uint8Array(16 * 1024 * 1024 + 1)], 'oversized.json'));
    const input = document.querySelector('#importFile');
    input.files = files.files;
    input.dispatchEvent(new Event('change'));
  });
  expect(await message).toContain('16 MiB');
});

test('a second progress import is ignored while the first file is being read', async ({ app, page }) => {
  await app.open();
  await page.evaluate(() => {
    window.readBackupNames = [];
    File.prototype.text = function () {
      window.readBackupNames.push(this.name);
      return new Promise(resolve => { window.finishBackupRead = resolve; });
    };
  });
  const input = page.locator('#importFile');
  const file = name => ({ name, mimeType: 'application/json', buffer: Buffer.from('{}') });
  await input.setInputFiles(file('first.json'));
  await expect.poll(() => page.evaluate(() => window.readBackupNames)).toEqual(['first.json']);
  await input.setInputFiles(file('second.json'));
  page.on('dialog', dialog => dialog.dismiss());
  await page.evaluate(() => window.finishBackupRead('{}'));
  expect(await page.evaluate(() => window.readBackupNames)).toEqual(['first.json']);
  await input.setInputFiles(file('retry.json'));
  await expect.poll(() => page.evaluate(() => window.readBackupNames)).toEqual(['first.json', 'retry.json']);
});

test('upgrade-blocked state disables imports and refuses reset without overwriting saved progress', async ({ app, page }) => {
  await app.open({ saved });
  const before = await page.evaluate(() => localStorage.getItem('ptt-v3'));
  await page.evaluate(async () => {
    window.__etude.STORE.blocked = 'upgrade';
    await window.__etude.storeRefresh();
  });

  await expect(page.locator('#storeNote')).toBeVisible();
  await expect(page.locator('#storeNoteText')).toContainText('The required backup for updating saved progress could not be made');
  await expect(page.locator('#storeNoteExport')).toBeVisible();
  await expect(page.locator('#storeNoteReload')).toBeVisible();
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#importBtn')).toBeDisabled();
  await expect(page.locator('#set-snap-restore')).toBeDisabled();
  await page.locator('#drawerClose').click();
  await page.evaluate(() => window.__etude.show('progress'));
  await expect(page.locator('#prog-import')).toBeDisabled();

  const dialogs = [];
  page.on('dialog', async dialog => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.accept();
  });
  await page.locator('#resetBtn').click();
  await expect.poll(() => dialogs.some(entry => entry.type === 'alert')).toBe(true);
  expect(dialogs.find(entry => entry.type === 'alert')?.message).toContain('The required backup for updating saved progress could not be made');
  expect(await page.evaluate(() => localStorage.getItem('ptt-v3'))).toBe(before);
});

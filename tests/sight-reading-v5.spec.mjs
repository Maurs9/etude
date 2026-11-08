import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures.mjs';

async function openAssessGenerator(app) {
  const page = await app.open({ hash: 'read', dock: true });
  await page.locator('#rdt-pieces').click();
  await page.locator('#rd-mode button[data-v="assess"]').click();
  await page.locator('#rd-gen').click();
  await expect(page.locator('#rd-go')).toBeFocused();
  return page;
}

async function startPracticeAssess(app) {
  const page = await openAssessGenerator(app);
  await page.clock.install();
  await page.locator('#rd-go').click();
  await expect(page.locator('#rd-srt-preview')).toBeVisible();
  await page.locator('#rd-srt-practice').click();
  await page.clock.runFor(5000);
  await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('playing');
  return page;
}

function contrastRatio(foreground, background) {
  const parse = (value) => {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (match) return match[1].split(',').slice(0, 3).map((part) => Number(part.trim()) / 255);
    const hex = value.replace('#', '');
    return [0, 1, 2].map((index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16) / 255);
  };
  const linear = (value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const luminance = (value) => {
    const rgb = parse(value).map(linear);
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function attempt(overrides = {}) {
  return {
    attemptId: 'attempt-imported',
    fingerprint: 'v1:imported',
    ownerTabId: 'tab-import',
    generation: 'import-generation',
    status: 'completed',
    finishedAt: 10,
    scoringVersion: 1,
    N: 1,
    TP: 1,
    FP: 0,
    FN: 0,
    G: 1,
    Q: 0,
    lateOrEarlyCount: 0,
    restViolations: 0,
    pitchPrecision: 1,
    pitchRecall: 1,
    pitchF1: 100,
    rhythmAcc: 100,
    score: 100,
    stars: 3,
    perfect: true,
    meanOffsetMs: 0,
    meanAbsoluteOffsetMs: 0,
    noteResults: [{ expectedId: 'n', classification: 'good', matchedInputId: 'i', errorMs: 0 }],
    extraInputs: [],
    ...overrides,
  };
}

test.describe('Sight-Reading iteration 5 browser matrices', () => {
  test('records keyboard, pointer, MIDI and BLE input without duplicate or focus-finalized attacks', async ({ app }) => {
    const page = await startPracticeAssess(app);
    await page.keyboard.down('a');
    await page.keyboard.down('a');
    await page.clock.runFor(20);
    await page.keyboard.up('a');
    await page.evaluate(() => {
      const recorder = window.__etude.srtRecorder;
      recorder.record('on', 70, 'srClick', null, 20);
      recorder.record('on', 71, 'midi', null, -300);
      recorder.record('off', 71, 'midi', 'physical', -200);
      recorder.record('on', 72, 'midi', null, recorder.durationMs + 300);
      window.__etude.handleNoteOn(60, 100, 'pointer:1');
      window.__etude.handleNoteOff(60, 'pointer:1');
      window.__etude.handleNoteOn(62, 100, 'midi');
      window.__etude.handleNoteOn(62, 100, 'midi');
      window.__etude.handleNoteOn(64, 100, 'ble');
      window.__etude.releaseFocusInput();
    });
    const inputs = await page.evaluate(() => window.__etude.srtRecorder.finish());
    expect(inputs.filter((input) => input.source === 'typing:KeyA')).toHaveLength(1);
    expect(inputs.some((input) => input.source === 'pointer:1')).toBe(true);
    expect(inputs.find((input) => input.source === 'midi')).toMatchObject({ offMs: null, releaseKind: null });
    expect(inputs.find((input) => input.source === 'ble')).toMatchObject({ offMs: null, releaseKind: null });
    expect(inputs.some((input) => [70, 71, 72].includes(input.midi))).toBe(false);
    await page.evaluate(() => window.__etude.panic());
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('interrupted');
  });

  test('completes first-sight preview, count-in, playing, save, and practice transition', async ({ app }) => {
    const page = await openAssessGenerator(app);
    await page.clock.install();
    await page.locator('#rd-go').click();
    await expect(page.locator('#rd-srt-preview')).toBeVisible();
    expect(await page.evaluate(() => window.__etude.SR.srtState.name)).toBe('preview');
    await page.locator('#rd-srt-start').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('countIn');
    await page.clock.runFor(5000);
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('playing');
    await page.keyboard.down('a');
    await page.clock.runFor(50);
    await page.keyboard.up('a');
    await page.clock.runFor(25_000);
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('saved');
    await expect(page.locator('#rd-verdict')).toContainText('First sight');
    const ledger = await page.evaluate(() => JSON.parse(localStorage.getItem('etude-sight-v1')));
    expect(Object.values(ledger.attempts).some((entry) => entry.status === 'completed')).toBe(true);
    await page.reload();
    await page.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));
    await page.locator('#rdt-pieces').click();
    await page.locator('#rd-mode button[data-v="assess"]').click();
    await page.locator('#rd-gen').click();
    await page.locator('#rd-go').click();
    await expect(page.locator('#rd-srt-preview')).toBeHidden();
    expect(await page.evaluate(() => window.__etude.SR.srtState.mode)).toBe('practice');
  });

  test('covers pending-save retry and continue-without-save outcomes', async ({ app }) => {
    const page = await openAssessGenerator(app);
    await page.clock.install();
    await page.locator('#rd-go').click();
    await page.locator('#rd-srt-start').click();
    await page.clock.runFor(5000);
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('playing');
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      window.__srtOriginalSetItem = original;
      Storage.prototype.setItem = function setItem(key, value) {
        if (key === 'etude-sight-v1') throw new DOMException('blocked', 'QuotaExceededError');
        return original.call(this, key, value);
      };
      window.__etude.srAssessFinish();
    });
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('pendingSave');
    await expect(page.locator('#rd-srt-pending')).toBeVisible();
    await page.evaluate(() => { Storage.prototype.setItem = window.__srtOriginalSetItem; });
    await page.locator('#rd-srt-retry').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('saved');
    await expect(page.locator('#rd-srt-pending')).toBeHidden();
  });

  test('renders late-or-early timing as the missed/late symbol', async ({ app }) => {
    const page = await startPracticeAssess(app);
    await page.evaluate(() => {
      const expected = window.__etude.srtBuildExpected(window.__etude.SR.srtPiece, {
        bpm: window.__etude.SR.bpm,
        hand: 'both',
      });
      window.__etude.srtRecorder.record('on', expected[0].midi, 'test', null, expected[0].onMs + 220);
      window.__etude.srAssessFinish();
    });
    await expect(page.locator('.ss-n[data-s="bad"] .ss-result-symbol').first()).toHaveText('✗');
  });

  test('atomically claims across two tabs, recovers orphans, rejects stale generations, and enforces limits', async ({ app }) => {
    const page = await openAssessGenerator(app);
    const tabB = await page.context().newPage();
    try {
      await tabB.goto(page.url());
      await tabB.waitForFunction(() => typeof window.__etude?.srtLedgerUpdate === 'function');
      const generation = await page.evaluate(() => window.__etude.srtReadLedger(localStorage).generation);
      const claim = (tab, attemptId, ownerTabId) => tab.evaluate(async ({ attemptId, ownerTabId, generation }) =>
        window.__etude.srtLedgerUpdate(localStorage, {
          type: 'claimExposure', fingerprint: 'v1:shared', attemptId, ownerTabId, generation,
        }), { attemptId, ownerTabId, generation });
      const [a, b] = await Promise.all([claim(page, 'attempt-a', 'tab-a'), claim(tabB, 'attempt-b', 'tab-b')]);
      expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
      expect([a.reason, b.reason].filter(Boolean)).toEqual(['already_exposed']);

      const staleGeneration = generation;
      await tabB.evaluate(() => window.__etude.srtLedgerUpdate(localStorage, { type: 'resetLedger' }));
      await expect.poll(() => page.evaluate(({ staleGeneration }) => window.__etude.srtLedgerUpdate(localStorage, {
        type: 'recordExposure', fingerprint: 'v1:stale', reason: 'listen', generation: staleGeneration,
      }), { staleGeneration })).toMatchObject({ ok: false, reason: 'stale_generation' });

      await page.evaluate(() => {
        const ledger = window.__etude.srtReadLedger(localStorage);
        const exposures = { 'v1:orphan': { firstSeenAt: 1, reason: 'first-sight', claim: { attemptId: 'orphan', ownerTabId: 'tab-a', generation: ledger.generation } } };
        localStorage.setItem('etude-sight-v1', JSON.stringify({ ...ledger, exposures }));
      });
      const recovered = await page.evaluate(async () => {
        const generation = window.__etude.srtReadLedger(localStorage).generation;
        return window.__etude.srtLedgerUpdate(localStorage, { type: 'recoverOrphanClaims', generation });
      });
      expect(recovered.ok).toBe(true);
      expect(await page.evaluate(() => window.__etude.srtReadLedger(localStorage).attempts.orphan.status)).toBe('abandoned');

      const quota = await page.evaluate(async () => {
        const ledger = window.__etude.srtReadLedger(localStorage);
        const exposures = Object.fromEntries(Array.from({ length: 4096 }, (_, index) => [
          `v1:${index}`, { firstSeenAt: index, reason: 'listen' },
        ]));
        localStorage.setItem('etude-sight-v1', JSON.stringify({ ...ledger, exposures }));
        return window.__etude.srtLedgerUpdate(localStorage, {
          type: 'recordExposure', fingerprint: 'v1:overflow', reason: 'listen', generation: ledger.generation,
        });
      });
      expect(quota).toMatchObject({ ok: false, reason: 'quota' });
    } finally {
      await tabB.close();
    }
  });

  test('exports and imports the ledger while preserving the local generation and merging claims', async ({ app }) => {
    const page = await openAssessGenerator(app);
    const localGeneration = await page.evaluate(() => window.__etude.srtReadLedger(localStorage).generation);
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#drawer')).toHaveAttribute('aria-hidden', 'false');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#exportBtn').click();
    const download = await downloadPromise;
    const payload = JSON.parse((await readFile(await download.path())).toString());
    expect(payload.v).toBe(3);
    expect(payload.data.sightLedger.schemaVersion).toBe(1);

    const importedAttempt = attempt();
    const imported = await page.evaluate(({ importedAttempt }) => {
      const local = window.__etude.srtReadLedger(localStorage);
      return {
        ...local,
        generation: 'import-generation',
        attempts: { [importedAttempt.attemptId]: importedAttempt },
        exposures: {
          'v1:imported': {
            firstSeenAt: 2,
            reason: 'first-sight',
            claim: { attemptId: importedAttempt.attemptId, ownerTabId: importedAttempt.ownerTabId, generation: importedAttempt.generation },
          },
        },
      };
    }, { importedAttempt });
    const backup = { v: 3, data: { srs: {}, settings: {}, sightLedger: imported } };
    const dialogs = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.type());
      void dialog.accept();
    });
    await Promise.all([
      page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() }),
      page.locator('#importFile').setInputFiles({
        name: 'sight-ledger.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(backup)),
      }),
    ]);
    await page.waitForLoadState('load');
    const merged = await page.evaluate(() => window.__etude.srtReadLedger(localStorage));
    expect(merged.generation).toBe(localGeneration);
    expect(merged.exposures['v1:imported']).toBeTruthy();
    expect(merged.attempts['attempt-imported'].status).toBe('abandoned');
    expect(dialogs).toContain('confirm');

    const conflict = { ...importedAttempt, score: 10 };
    await page.locator('#importFile').setInputFiles({
      name: 'conflict.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ v: 3, data: { sightLedger: { ...imported, attempts: { [conflict.attemptId]: conflict } } } })),
    });
    await expect.poll(() => dialogs.filter((type) => type === 'alert').length).toBe(1);
    expect((await page.evaluate(() => window.__etude.srtReadLedger(localStorage))).attempts['attempt-imported'].score).toBe(100);
  });

  test('disables first-sight without Web Locks while leaving practice available', async ({ app }) => {
    const page = await app.open({ hash: 'read', dock: true });
    const noLocks = await page.context().newPage();
    try {
      await noLocks.addInitScript(() => {
        try {
          Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
        } catch {
          // Chromium exposes navigator.locks as a configurable property.
        }
      });
      await noLocks.goto(page.url());
      await noLocks.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));
      await noLocks.locator('#rdt-pieces').click();
      await noLocks.locator('#rd-mode button[data-v="assess"]').click();
      await noLocks.locator('#rd-gen').click();
      await noLocks.locator('#rd-go').click();
      await expect.poll(() => noLocks.evaluate(() => window.__etude.SR.srtState.mode)).toBe('practice');
      await expect(noLocks.locator('#rd-srt-preview')).toBeHidden();
      await expect(noLocks.locator('#rd-srt-notice')).toContainText('Web Locks');
      expect(await noLocks.evaluate(() => window.__etude.SR.srtState.attemptId)).toBeNull();
    } finally {
      await noLocks.close();
    }
  });

  test('preserves a newer ledger and disables only first-sight in the UI', async ({ app }) => {
    const page = await openAssessGenerator(app);
    const newer = JSON.stringify({ schemaVersion: 2, marker: 'keep-me', future: { enabled: true } });
    await page.evaluate((newer) => localStorage.setItem('etude-sight-v1', newer), newer);
    await page.locator('#rd-gen').click();
    await page.locator('#rd-go').click();
    await expect(page.locator('#rd-srt-preview')).toBeHidden();
    await expect(page.locator('#rd-srt-notice')).toContainText('newer');
    expect(await page.evaluate(() => localStorage.getItem('etude-sight-v1'))).toBe(newer);
    expect(await page.evaluate(() => window.__etude.SR.srtState.mode)).toBe('practice');
  });

  test('abandons a claimed first attempt on listen and after refresh', async ({ app }) => {
    const page = await openAssessGenerator(app);
    await page.locator('#rd-go').click();
    await expect(page.locator('#rd-srt-preview')).toBeVisible();
    await page.locator('#rd-listen').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('interrupted');
    expect(await page.evaluate(() => {
      const ledger = window.__etude.srtReadLedger(localStorage);
      return Object.values(ledger.attempts).some((entry) => entry.status === 'interrupted') &&
        Object.values(ledger.exposures).every((entry) => !entry.claim);
    })).toBe(true);

    await page.evaluate(() => window.__etude.srtLedgerUpdate(localStorage, { type: 'resetLedger' }));
    await page.locator('#rd-gen').click();
    await page.locator('#rd-go').click();
    await expect(page.locator('#rd-srt-preview')).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));
    await page.locator('#rdt-pieces').click();
    await page.locator('#rd-mode button[data-v="assess"]').click();
    await page.locator('#rd-gen').click();
    await expect.poll(() => page.evaluate(() => {
      const ledger = window.__etude.srtReadLedger(localStorage);
      return Object.values(ledger.attempts).some((entry) => entry.status === 'abandoned');
    })).toBe(true);
    await page.locator('#rd-go').click();
    await expect(page.locator('#rd-srt-preview')).toBeHidden();
    expect(await page.evaluate(() => window.__etude.SR.srtState.mode)).toBe('practice');
  });

  test('keeps the UI usable across viewport, language, theme, reduced-motion, and contrast matrices', async ({ app }) => {
    const page = await openAssessGenerator(app);
    for (const viewport of [{ width: 320, height: 700 }, { width: 390, height: 700 }, { width: 1024, height: 768 }, { width: 1920, height: 1080 }, { width: 640, height: 320 }]) {
      await page.setViewportSize(viewport);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
    for (const language of ['en', 'ro', 'es', 'fr', 'de', 'it', 'pt-BR']) {
      await page.evaluate((language) => window.__etude.setLang(language), language);
      expect(await page.locator('#rd-gen').textContent()).toBeTruthy();
    }
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, theme);
      await page.evaluate(() => window.__etude.SR.results = { [window.__etude.SR.notes[0].nid]: 'bad' });
      await page.evaluate(() => window.__etude.srPaintAll());
      const contrast = await page.evaluate(() => {
        const symbol = document.querySelector('.ss-result-symbol');
        return { fill: getComputedStyle(symbol).fill, background: getComputedStyle(document.documentElement).getPropertyValue('--paper2').trim() };
      });
      expect(contrastRatio(contrast.fill, contrast.background)).toBeGreaterThanOrEqual(4.5);
      expect(await page.locator('.ss-n[data-s="bad"] title').textContent()).toContain('✗');
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.view.active')).animationName)).toBe('none');
  });

  test('completes the full first-attempt UI journey offline after the service worker is warm @sw', async ({ app }) => {
    const page = await openAssessGenerator(app);
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller);
    await page.context().setOffline(true);
    try {
      await page.reload();
      await page.waitForFunction(() => typeof window.__etude?.show === 'function' && document.querySelector('#keys .key'));
      await page.clock.install();
      await page.locator('#rdt-pieces').click();
      await page.locator('#rd-mode button[data-v="assess"]').click();
      await page.locator('#rd-gen').click();
      await page.locator('#rd-go').click();
      await expect(page.locator('#rd-srt-preview')).toBeVisible();
      await page.locator('#rd-srt-start').click();
      await page.clock.runFor(5000);
      await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('playing');
      await page.keyboard.down('a');
      await page.clock.runFor(50);
      await page.keyboard.up('a');
      await page.clock.runFor(25_000);
      await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('saved');
      await expect(page.locator('#rd-verdict')).toContainText('TP');
      expect(await page.evaluate(() => Object.values(window.__etude.srtReadLedger(localStorage).attempts).some((attempt) => attempt.status === 'completed'))).toBe(true);
    } finally {
      await page.context().setOffline(false);
    }
  });
});

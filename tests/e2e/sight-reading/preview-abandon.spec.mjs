import { test, expect } from '../../helpers/fixtures.mjs';

async function openAssessGenerator(app) {
  const page = await app.open({ hash: 'read' });
  await page.locator('#rdt-pieces').click();
  await page.locator('#rd-mode button[data-v="assess"]').click();
  await page.locator('#rd-gen').click();
  await expect(page.locator('#rd-srt-preview')).toBeHidden();
  await expect(page.locator('#rd-go')).toBeFocused();
  return page;
}

test.describe('Sight-Reading v3 MVP', () => {
  test('persists a clean ledger and offers the first-attempt preview', async ({ app }) => {
    const page = await openAssessGenerator(app);
    await page.locator('#rd-go').click();
    await expect(page.locator('#rd-srt-preview')).toBeVisible();
    const ledger = await page.evaluate(() => JSON.parse(localStorage.getItem('etude-sight-v1')));
    expect(ledger.schemaVersion).toBe(1);
    expect(ledger.generation).toMatch(/^gen-/);
    expect(await page.evaluate(() => window.__etude.SR.srtState.name)).toBe('preview');
  });

  test('switching from preview abandons the reserved attempt before practice', async ({ app }) => {
    const page = await openAssessGenerator(app);
    await page.locator('#rd-go').click();
    await expect(page.locator('#rd-srt-preview')).toBeVisible();
    await page.locator('#rd-srt-practice').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.mode)).toBe('practice');
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.attemptId)).toBeNull();
    await expect(page.locator('#rd-srt-preview')).toBeHidden();
    const ledger = await page.evaluate(() => JSON.parse(localStorage.getItem('etude-sight-v1')));
    const attempts = Object.values(ledger.attempts);
    expect(attempts.some((attempt) => attempt.status === 'abandoned')).toBe(true);
    expect(Object.values(ledger.exposures).every((exposure) => !exposure.claim)).toBe(true);
  });

  test('moves focus into the preview actions on a narrow viewport', async ({ app }) => {
    await app.page.setViewportSize({ width: 320, height: 700 });
    const page = await openAssessGenerator(app);
    await page.locator('#rd-go').click();
    await expect(page.locator('#rd-srt-preview')).toBeVisible();
    await expect(page.locator('#rd-srt-start')).toBeFocused();
    const bounds = await page.locator('#rd-srt-start').boundingBox();
    expect(bounds?.y).toBeGreaterThanOrEqual(0);
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(700);
  });

  test('renders result symbols and titles without relying on colour', async ({ app }) => {
    const page = await openAssessGenerator(app);
    const result = await page.evaluate(() => {
      const api = window.__etude;
      api.SR.srtState = { name: 'idle', mode: 'practice', attemptId: null, fingerprint: api.SR.srtFingerprint };
      api.srDraw();
      const note = window.__etude.SR.notes[0];
      api.SR.results = { [note.nid]: 'good' };
      api.SR.wrongExtra = 1;
      api.srPaintAll();
      return {
        symbol: document.querySelector('.ss-result-symbol')?.textContent,
        title: document.querySelector('.ss-n title')?.textContent,
        extra: document.querySelector('.ss-extra-symbol text')?.textContent,
      };
    });
    expect(result.symbol).toBe('✓');
    expect(result.title).toContain('Correct');
    expect(result.extra).toBe('+1');
  });

  test('keeps generation, fingerprint, evaluation, recording result and ledger available offline after first load @sw', async ({ app }) => {
    const page = await openAssessGenerator(app);
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller);
    await page.context().setOffline(true);
    await page.reload();
    await page.waitForFunction(() => typeof window.__etude?.show === 'function');
    await page.evaluate(() => window.__etude.show('read'));
    const after = await page.evaluate(async () => {
      const piece = window.__etude.srtGenerate('P1.a', 17, 'rh');
      const fingerprint = window.__etude.srtFingerprint(piece);
      const expected = window.__etude.srtBuildExpected(piece, { bpm: 60, hand: 'rh' });
      const performed = expected.map((note, index) => ({ id: `offline-${index}`, midi: note.midi, onMs: note.onMs }));
      const evaluation = window.__etude.srtEvaluate(expected, performed);
      const ledger = window.__etude.srtReadLedger(localStorage);
      const claim = await window.__etude.srtLedgerUpdate(localStorage, {
        type: 'claimExposure',
        fingerprint,
        attemptId: 'offline-attempt',
        ownerTabId: 'offline-tab',
        generation: ledger.generation,
      });
      const attempt = {
        ...evaluation,
        attemptId: 'offline-attempt',
        fingerprint,
        ownerTabId: 'offline-tab',
        generation: ledger.generation,
        status: 'completed',
        finishedAt: Date.now(),
      };
      const finish = await window.__etude.srtLedgerUpdate(localStorage, {
        type: 'finishAttempt',
        attempt,
        generation: ledger.generation,
      });
      return {
        piece: piece.events.length,
        fingerprint,
        score: evaluation.score,
        claim: claim.ok,
        finish: finish.ok,
        savedStatus: window.__etude.srtReadLedger(localStorage).attempts['offline-attempt']?.status,
      };
    });
    expect(after.piece).toBeGreaterThan(0);
    expect(after.fingerprint).toMatch(/^v1:/);
    expect(after.score).toBe(100);
    expect(after.claim).toBe(true);
    expect(after.finish).toBe(true);
    expect(after.savedStatus).toBe('completed');
  });

  test('completes the actual first-attempt UI offline with keyboard input and a saved result @sw', async ({ app }) => {
    const page = await openAssessGenerator(app);
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller);
    await page.context().setOffline(true);
    await page.clock.install();
    await page.reload();
    await page.waitForFunction(() => typeof window.__etude?.show === 'function');
    await page.evaluate(() => window.__etude.show('read'));
    await page.locator('#rdt-pieces').click();
    await page.locator('#rd-mode button[data-v="assess"]').click();
    await page.locator('#rd-gen').click();
    await page.locator('#rd-go').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('preview');
    await page.locator('#rd-srt-start').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('countIn');
    await page.clock.runFor(5000);
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('playing');
    await page.keyboard.press('a');
    await page.clock.runFor(18000);
    await page.evaluate(() => {
      if (window.__etude.SR.srtState.name === 'playing')
        window.__etude.srAssessFinish();
    });
    await expect.poll(() => page.evaluate(() => ['completed', 'saved'].includes(window.__etude.SR.srtState.name))).toBe(true);
    expect(await page.evaluate(() => Object.values(window.__etude.srtReadLedger(localStorage).attempts).some(attempt => attempt.status === 'completed'))).toBe(true);
  });
});

import { test, expect } from './fixtures.mjs';

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

  test('keeps generation, evaluation and ledger available offline after first load @sw', async ({ app }) => {
    const page = await openAssessGenerator(app);
    const before = await page.evaluate(() => ({
      fingerprint: window.__etude.SR.srtFingerprint,
      piece: window.__etude.SR.srtPiece?.events.length,
    }));
    await page.waitForFunction(() => !!navigator.serviceWorker?.controller);
    await page.context().setOffline(true);
    await page.reload();
    await page.waitForFunction(() => typeof window.__etude?.show === 'function');
    await page.evaluate(() => window.__etude.show('read'));
    const after = await page.evaluate(() => ({
      key: localStorage.getItem('etude-sight-v1') !== null,
      fingerprint: window.__etude.SR.srtFingerprint,
      piece: window.__etude.SR.srtPiece?.events.length,
    }));
    expect(after.key).toBe(true);
    expect(before.fingerprint).toMatch(/^v1:/);
    expect(before.piece).toBeGreaterThan(0);
  });
});

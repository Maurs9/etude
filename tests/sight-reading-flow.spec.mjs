import { test, expect } from './fixtures.mjs';

async function openAssessGenerator(app) {
  const page = await app.open({ hash: 'read' });
  await page.locator('#rdt-pieces').click();
  await page.locator('#rd-mode button[data-v="assess"]').click();
  await page.locator('#rd-gen').click();
  return page;
}

test.describe('Sight-Reading browser flow', () => {
  test('covers blocked, preview abandonment, completed interruption, and repeated practice', async ({ app }) => {
    const page = await openAssessGenerator(app);
    const states = await page.evaluate(() => {
      const api = window.__etude;
      api.SR.srtState = { name: 'idle', mode: 'firstSight', attemptId: null, fingerprint: api.SR.srtFingerprint };
      api.srtSetState({ type: 'prepare', mode: 'firstSight', fingerprint: api.SR.srtFingerprint, attemptId: 'blocked-attempt' });
      api.srtSetState({ type: 'claim' });
      api.srtSetState({ type: 'blocked', reason: 'unsupported' });
      const blocked = api.SR.srtState.name;

      api.SR.srtState = { name: 'preview', mode: 'firstSight', attemptId: 'preview-attempt', fingerprint: api.SR.srtFingerprint };
      api.srtSetState({ type: 'abandon' });
      const abandoned = api.SR.srtState.name;

      api.SR.srtState = { name: 'playing', mode: 'practice', attemptId: null, fingerprint: api.SR.srtFingerprint };
      api.SR.active = true;
      api.srGo();
      const interrupted = api.SR.srtState.name;

      api.SR.srtState = { name: 'completed', mode: 'practice', attemptId: null, fingerprint: api.SR.srtFingerprint };
      api.SR.active = false;
      api.srGo();
      const preparingToCountIn = api.SR.srtState.name;
      api.srtSetState({ type: 'countInDone' });
      const playing = api.SR.srtState.name;
      api.srAssessFinish();
      return { blocked, abandoned, interrupted, preparingToCountIn, playing, completed: api.SR.srtState.name };
    });
    expect(states).toEqual({
      blocked: 'blocked',
      abandoned: 'abandoned',
      interrupted: 'interrupted',
      preparingToCountIn: 'countIn',
      playing: 'playing',
      completed: 'completed',
    });
  });

  test('uses the preview, count-in, playing, and completed states for a first attempt', async ({ app }) => {
    const page = await openAssessGenerator(app);
    await page.locator('#rd-go').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('preview');
    await page.locator('#rd-srt-start').click();
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('countIn');
    await page.evaluate(() => window.__etude.srtSetState({ type: 'countInDone' }));
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('playing');
    await page.evaluate(() => window.__etude.srAssessFinish());
    await expect.poll(() => page.evaluate(() => ['completed', 'saved', 'pendingSave'].includes(window.__etude.SR.srtState.name))).toBe(true);
  });
});

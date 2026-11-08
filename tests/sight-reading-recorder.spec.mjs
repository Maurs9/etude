import { test, expect } from './fixtures.mjs';

async function openRecorder(app) {
  const page = await app.open({ hash: 'read' });
  await page.locator('#rdt-pieces').click();
  await page.locator('#rd-mode button[data-v="assess"]').click();
  await page.locator('#rd-gen').click();
  await page.locator('#rd-go').click();
  await expect(page.locator('#rd-srt-start')).toBeVisible();
  await page.locator('#rd-srt-start').click();
  await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('countIn');
  return page;
}

test.describe('Sight-Reading recorder integration', () => {
  test('captures the window, ignores held-before-start notes, excludes playback sources, and deduplicates note-ons', async ({ app }) => {
    const page = await openRecorder(app);
    const inputs = await page.evaluate(() => {
      const recorder = window.__etude.srtRecorder;
      recorder.record('on', 60, 'typing:a', null, -251);
      recorder.record('off', 60, 'typing:a', 'physical', -200);
      recorder.record('on', 60, 'typing:a', null, -100);
      recorder.record('on', 60, 'typing:a', null, 0);
      recorder.record('off', 60, 'typing:a', 'physical', 100);
      recorder.record('on', 62, 'srClick', null, 0);
      recorder.record('on', 63, 'previewNote', null, 0);
      recorder.record('on', 64, 'srListen', null, 0);
      recorder.record('on', 65, 'srPlayGap', null, 0);
      recorder.record('on', 67, 'typing:g', null, recorder.durationMs + 251);
      recorder.record('off', 67, 'typing:g', 'physical', recorder.durationMs + 252);
      return recorder.finish();
    });
    expect(inputs).toEqual([
      { id: 'input-1', midi: 60, onMs: -100, offMs: 100, source: 'typing:a', releaseKind: 'physical' },
    ]);
  });

  test('releases only focus-owned keyboard and pointer notes, retaining physical MIDI and BLE notes', async ({ app }) => {
    const page = await openRecorder(app);
    const inputs = await page.evaluate(() => {
      const recorder = window.__etude.srtRecorder;
      recorder.record('on', 60, 'midi', null, 10);
      recorder.record('on', 61, 'ble', null, 11);
      recorder.record('on', 62, 'typing:a', null, 12);
      recorder.record('on', 63, 'pointer:1', null, 13);
      window.__etude.releaseFocusInput();
      return recorder.finish();
    });
    expect(inputs).toEqual([
      { id: 'input-1', midi: 60, onMs: 10, offMs: null, source: 'midi', releaseKind: null },
      { id: 'input-2', midi: 61, onMs: 11, offMs: null, source: 'ble', releaseKind: null },
      { id: 'input-3', midi: 62, onMs: 12, offMs: expect.any(Number), source: 'typing:a', releaseKind: 'focus' },
      { id: 'input-4', midi: 63, onMs: 13, offMs: expect.any(Number), source: 'pointer:1', releaseKind: 'focus' },
    ]);
  });

  test('panic closes every remaining recorder note with a reset release', async ({ app }) => {
    const page = await openRecorder(app);
    const inputs = await page.evaluate(() => {
      const recorder = window.__etude.srtRecorder;
      recorder.record('on', 60, 'midi', null, 10);
      recorder.record('on', 61, 'ble', null, 11);
      window.__etude.panic();
      return recorder.finish();
    });
    expect(inputs.every((input) => input.offMs !== null && input.releaseKind === 'reset')).toBe(true);
  });
});

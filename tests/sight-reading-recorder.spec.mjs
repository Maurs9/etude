import { test, expect } from './fixtures.mjs';

async function openRecorder(app, playing = false) {
  const page = await app.open({ hash: 'read' });
  if (playing) await page.clock.install();
  await page.locator('#rdt-pieces').click();
  await page.locator('#rd-mode button[data-v="assess"]').click();
  await page.locator('#rd-gen').click();
  await page.locator('#rd-go').click();
  await expect(page.locator('#rd-srt-start')).toBeVisible();
  await page.locator('#rd-srt-start').click();
  if (playing) {
    await page.clock.runFor(5000);
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('playing');
  } else {
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('countIn');
  }
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

  test('keeps a mixed keyboard and MIDI attack open until the physical owner releases', async ({ app }) => {
    const page = await openRecorder(app, true);
    const result = await page.evaluate(() => {
      window.__etude.SR.t0 = performance.now();
      window.__etude.handleNoteOn(60, 100, 'typing:KeyA');
      window.__etude.handleNoteOn(60, 100, 'midi');
      window.__etude.releaseFocusInput();
      const afterFocus = window.__etude.srtRecorder.finish().map(input => ({ ...input }));
      window.__etude.handleNoteOff(60, 'midi', 'physical');
      const afterMidiOff = window.__etude.srtRecorder.finish().map(input => ({ ...input }));
      return { afterFocus, afterMidiOff };
    });
    expect(result.afterFocus).toHaveLength(1);
    expect(result.afterFocus[0]).toMatchObject({
      midi: 60, source: 'typing:KeyA', offMs: null, releaseKind: null,
    });
    expect(result.afterMidiOff[0]).toMatchObject({
      midi: 60, source: 'typing:KeyA', offMs: expect.any(Number), releaseKind: 'physical',
    });
  });

  test('persists mixedInput after keyboard and MIDI are used in one first-sight attempt', async ({ app }) => {
    const page = await openRecorder(app, true);
    await page.keyboard.down('a');
    await page.clock.runFor(20);
    await page.keyboard.up('a');
    await page.evaluate(() => {
      window.__etude.midiIn(0x90, 62, 100, 'midi');
      window.__etude.midiIn(0x80, 62, 0, 'midi');
      window.__etude.srAssessFinish();
    });
    await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('saved');
    const attempt = await page.evaluate(() =>
      Object.values(window.__etude.srtReadLedger(localStorage).attempts)
        .find(entry => entry.status === 'completed'));
    expect(attempt.mixedInput).toBe(true);
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

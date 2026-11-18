import { test, expect } from '../../helpers/fixtures.mjs';

async function openAssess(app, dock = false, saved) {
  const page = await app.open({ hash: 'read', dock, saved });
  await page.locator('#rdt-pieces').click();
  await page.locator('#rd-mode button[data-v="assess"]').click();
  await page.locator('#rd-gen').click();
  await page.locator('#rd-go').click();
  await page.locator('#rd-srt-start').click();
  await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('countIn');
  return page;
}

test.describe('Sight-Reading input routes', () => {
  test('records calibrated MIDI note-on and note-off timestamps', async ({ app }) => {
    const page = await openAssess(app, false, { v: 3, lang: 'en', data: { latency: { usb: 120 } } });
    const inputs = await page.evaluate(() => {
      const api = window.__etude, now = performance.now();
      api.SR.t0 = now - 500;
      api.midiIn(0x90, 62, 100, 'midi', now - 80);
      api.midiIn(0x80, 62, 0, 'midi', now - 40);
      return api.srtRecorder.finish();
    });
    expect(inputs).toMatchObject([{ midi: 62, onMs: 300, offMs: 340, releaseKind: 'physical' }]);
  });

  test('records computer keyboard and MIDI note ownership with physical releases', async ({ app }) => {
    const page = await openAssess(app);
    await page.evaluate(() => { window.__etude.SR.t0 = performance.now(); });
    await page.keyboard.down('a');
    await page.keyboard.up('a');
    await page.evaluate(() => {
      window.__etude.midiIn(0x90, 62, 100, 'midi');
      window.__etude.midiIn(0x80, 62, 0, 'midi');
    });
    const sources = await page.evaluate(() => window.__etude.srtRecorder.finish().map(input => [input.source, input.releaseKind]));
    expect(sources).toEqual(expect.arrayContaining([
      ['typing:KeyA', 'physical'],
      ['midi', 'physical'],
    ]));
  });

  test('records an on-screen key through pointer input without duplicating a held note', async ({ app }) => {
    const page = await openAssess(app, true);
    await page.evaluate(() => {
      window.__etude.dockSet(true);
      window.__etude.SR.t0 = performance.now();
    });
    const key = page.locator('#keys .key.white').last();
    await expect(key).toBeVisible();
    const bounds = await key.boundingBox();
    await page.mouse.click((bounds?.x ?? 0) + 2, (bounds?.y ?? 0) + (bounds?.height ?? 0) - 2);
    const source = await page.evaluate(() => window.__etude.srtRecorder.finish().map(input => input.source));
    expect(source).toHaveLength(1);
    expect(source[0]).toMatch(/^pointer:/);
  });
});

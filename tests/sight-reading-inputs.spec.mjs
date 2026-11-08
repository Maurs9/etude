import { test, expect } from './fixtures.mjs';

async function openAssess(app, dock = false) {
  const page = await app.open({ hash: 'read', dock });
  await page.locator('#rdt-pieces').click();
  await page.locator('#rd-mode button[data-v="assess"]').click();
  await page.locator('#rd-gen').click();
  await page.locator('#rd-go').click();
  await page.locator('#rd-srt-start').click();
  await expect.poll(() => page.evaluate(() => window.__etude.SR.srtState.name)).toBe('countIn');
  return page;
}

test.describe('Sight-Reading input routes', () => {
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

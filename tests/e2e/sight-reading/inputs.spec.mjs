import { test, expect } from '../../helpers/fixtures.mjs';

const inlineReading = { v: 3, lang: 'en', data: { reading: { prefs: { stage: false } } } };

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
  test('selecting the current or a new notation preserves a first-sight preview and count-in', async ({ app }) => {
    const page = await app.open({ hash: 'read', saved: inlineReading });
    await page.locator('#rdt-pieces').click();
    await page.locator('#rd-mode button[data-v="assess"]').click();
    await page.locator('#rd-gen').click();
    await page.locator('#rd-go').click();
    const attempt = () => page.evaluate(() => ({ ...window.__etude.SR.srtState }));
    await expect.poll(async () => (await attempt()).name).toBe('preview');
    const preview = await attempt();
    await page.locator('#settingsBtn').click();
    await page.locator('#set-notation [data-v=letter]').click();
    expect(await attempt()).toEqual(preview);
    await page.locator('#drawerClose').click();
    await page.locator('#rd-srt-start').click();
    await expect.poll(async () => (await attempt()).name).toBe('countIn');
    const countIn = await attempt();
    await page.locator('#settingsBtn').click();
    const solfege = page.locator('#set-notation [data-v=solfege]');
    await solfege.click();
    await expect(solfege).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#drawerClose').click();
    expect(await attempt()).toEqual(countIn);
  });

  test('a dialog releases an assessment note and keeps audition notes out of its recorder', async ({ app }) => {
    const page = await openAssess(app, false, inlineReading);
    await page.evaluate(() => {
      const api = window.__etude;
      api.SR.t0 = performance.now() - 100;
      api.midiIn(0x90, 60, 100, 'midi');
    });
    await page.locator('#settingsBtn').click();
    const recorded = await page.evaluate(() => {
      const api = window.__etude;
      api.midiIn(0x80, 60, 0, 'midi');
      api.midiIn(0x90, 62, 100, 'midi');
      api.midiIn(0x80, 62, 0, 'midi');
      return api.srtRecorder.finish();
    });
    expect(recorded).toMatchObject([{ midi: 60, offMs: expect.any(Number), releaseKind: 'focus' }]);
  });

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

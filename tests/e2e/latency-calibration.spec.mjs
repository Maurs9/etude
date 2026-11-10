import { readFile } from 'node:fs/promises';
import { test, expect } from '../helpers/fixtures.mjs';
import { STRINGS } from '../../src/locales/index.js';

const fill = (s, ...args) => args.reduce((out, a) => out.replace('%s', String(a)), s);

// One fake USB MIDI input. Once armed, every click of the timing wizard (the pad pulses with it) is answered twice: a key on the
// piano `usbLate` ms after the click and a touch on the pad `touchLate` ms after it, each carrying its own event time.
const armedPiano = (page, { usbLate, touchLate }) => page.addInitScript(({ usbLate, touchLate }) => {
  const input = { id: 'usb-1', name: 'Digital Piano', type: 'input', state: 'connected', connection: 'open', onmidimessage: null };
  const access = { inputs: new Map([[input.id, input]]), outputs: new Map(), sysexEnabled: false, onstatechange: null };
  Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
  window.__arm = () => {
    const pad = document.getElementById('lat-pad'), result = document.getElementById('lat-result');
    new MutationObserver(() => {
      if (!pad.classList.contains('beat') || !/\d/.test(result.textContent)) return; // count-in clicks say no number
      const at = performance.now();
      setTimeout(() => input.onmidimessage({ data: new Uint8Array([0x90, 60, 80]), timeStamp: at + usbLate }), usbLate + 5);
      setTimeout(() => input.onmidimessage({ data: new Uint8Array([0x80, 60, 0]), timeStamp: at + usbLate + 60 }), usbLate + 70);
      setTimeout(() => pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' })), touchLate);
    }).observe(pad, { attributes: true, attributeFilter: ['class'] });
  };
}, { usbLate, touchLate });

const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).data.latency);

test('the timing wizard measures each way of playing and keeps the offsets', async ({ app }) => {
  test.setTimeout(45_000);
  const page = app.page;
  await armedPiano(page, { usbLate: 40, touchLate: 15 });
  await app.open();
  await page.locator('#midiChip').click();
  await expect(page.locator('#midiText')).toHaveText('Digital Piano');
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#lat-panel')).toBeHidden();
  await page.locator('#set-lat').click();
  await expect(page.locator('#lat-panel')).toBeVisible();
  await expect(page.locator('#set-lat')).toHaveAttribute('aria-expanded', 'true');
  await page.evaluate(() => window.__arm());
  await page.locator('#lat-go').click();
  await expect(page.locator('#lat-go')).toHaveText(STRINGS.en.lat_stop);
  await expect(page.locator('#lat-result')).toHaveText(STRINGS.en.lat_countin);
  await expect(page.locator('#lat-go')).toHaveText(STRINGS.en.lat_start, { timeout: 15_000 });
  const got = await stored(page);
  // The timers that stand in for the player run a few ms late, never early.
  expect(got.usb).toBeGreaterThanOrEqual(38);
  expect(got.usb).toBeLessThanOrEqual(70);
  expect(got.touch).toBeGreaterThanOrEqual(13);
  expect(got.touch).toBeLessThanOrEqual(45);
  expect(got.ble).toBe(0);
  await expect(page.locator('#lat-v-usb')).toHaveText(String(got.usb));
  await expect(page.locator('#lat-v-touch')).toHaveText(String(got.touch));
  await expect(page.locator('#lat-result')).toContainText(fill(STRINGS.en.lat_set, STRINGS.en.lat_usb, got.usb));
  // The notes played during the run only sounded: nothing is left held.
  expect(await page.evaluate(() => window.__etude.held.size)).toBe(0);

  await page.reload();
  await page.waitForFunction(() => typeof window.__etude?.show === 'function');
  await expect(page.locator('#drawerClose')).toBeVisible(); // an open drawer survives a reload
  await expect(page.locator('#lat-v-usb')).toHaveText(String(got.usb));
  await page.locator('#set-lat').click();
  await page.locator('#lat-reset').click();
  await expect(page.locator('#lat-v-usb')).toHaveText('0');
  await expect(page.locator('#lat-result')).toHaveText(STRINGS.en.lat_cleared);
  expect(await stored(page)).toBeUndefined();
});

test('a run without taps saves nothing and says so', async ({ app }) => {
  test.setTimeout(45_000);
  const page = await app.open();
  await page.locator('#settingsBtn').click();
  await page.locator('#set-lat').click();
  await page.locator('#lat-go').click();
  await expect(page.locator('#lat-result')).toHaveText(STRINGS.en.lat_none, { timeout: 15_000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).data.latency)).toBeUndefined();
});

test('closing Settings ends a run, and the page gets the keys again', async ({ app }) => {
  const page = await app.open({ hash: 'explore', dock: true });
  await page.locator('#settingsBtn').click();
  await page.locator('#set-lat').click();
  await page.locator('#lat-go').click();
  await expect(page.locator('#lat-go')).toHaveText(STRINGS.en.lat_stop);
  await page.keyboard.press('Escape');
  await expect(page.locator('#drawerClose')).toBeHidden();
  const c4 = page.locator('#keys [data-midi="60"]'), box = await c4.boundingBox();
  await c4.click({ position: { x: box.width / 2, y: box.height - 12 } }); // below the black keys
  await expect(page.locator('#lat-go')).toHaveText(STRINGS.en.lat_start);
  await expect(page.locator('#lat-result')).toHaveText('');
});

test('a stored offset is clamped to 0–500 ms, and anything that is not a number reads as 0', async ({ app }) => {
  const page = await app.open({ saved: { v: 3, lang: 'en', data: { latency: { usb: 'fast', ble: -20, touch: 9999 } } } });
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#lat-v-usb')).toHaveText('0');
  await expect(page.locator('#lat-v-ble')).toHaveText('0');
  await expect(page.locator('#lat-v-touch')).toHaveText('500');
});

// data.latency (not data.settings, which is rebuilt from known keys) is the stored record: { touch, usb, ble } in ms.
const OFFSETS = { touch: 42, usb: 12, ble: 31 };
const shows = async (page, o) => {
  for (const [src, ms] of Object.entries(o)) await expect(page.locator('#lat-v-' + src)).toHaveText(String(ms));
};

test('calibrated offsets survive a reload', async ({ app }) => {
  const page = await app.open({ saved: { v: 3, lang: 'en', data: { latency: OFFSETS } } });
  await shows(page, OFFSETS);
  await page.reload();
  await page.waitForFunction(() => typeof window.__etude?.show === 'function');
  await shows(page, OFFSETS);
  expect(await stored(page)).toEqual(OFFSETS); // saved again by the app itself, not only seeded
});

test('calibrated offsets survive an Export then Import round-trip', async ({ app }) => {
  const page = await app.open({ saved: { v: 3, lang: 'en', data: { latency: OFFSETS } } });
  await page.locator('#settingsBtn').click();
  const download = page.waitForEvent('download');
  await page.locator('#exportBtn').click();
  const file = await (await download).path();
  const backup = await readFile(file, 'utf8');
  expect(JSON.parse(backup).data.latency).toEqual(OFFSETS);
  await page.locator('#set-lat').click();
  await page.locator('#lat-reset').click(); // the offsets are gone until the backup comes back
  await shows(page, { touch: 0, usb: 0, ble: 0 });
  expect(await stored(page)).toBeUndefined();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#importFile').setInputFiles({ name: 'etude-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await expect.poll(() => stored(page)).toEqual(OFFSETS);
  await page.waitForFunction(() => typeof window.__etude?.show === 'function');
  await shows(page, OFFSETS);
});

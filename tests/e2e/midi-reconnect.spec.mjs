import { test, expect } from '../helpers/fixtures.mjs';
import { STRINGS } from '../../src/locales/index.js';

const fill = (s, ...args) => args.reduce((out, a) => out.replace('%s', a), s);

// A Web MIDI stand-in the test drives: window.__midi.unplug(id) and plug(id, name) change the inputs and fire statechange like
// Chrome does. keepPort leaves an unplugged port in the map with state 'disconnected', which Chrome also does.
const fakeMidi = (page, inputs) => page.addInitScript(inputs => {
  const access = { inputs: new Map(), outputs: new Map(), sysexEnabled: false, onstatechange: null };
  const port = (id, name) => ({ id, name, type: 'input', state: 'connected', connection: 'open', onmidimessage: null });
  inputs.forEach(([id, name]) => access.inputs.set(id, port(id, name)));
  const fire = p => access.onstatechange && access.onstatechange({ port: p });
  window.__midi = {
    unplug(id, keepPort) {
      const p = access.inputs.get(id);
      p.state = 'disconnected';
      p.connection = 'closed';
      if (!keepPort) access.inputs.delete(id);
      fire(p);
    },
    plug(id, name) {
      const p = access.inputs.get(id) || port(id, name);
      p.state = 'connected';
      access.inputs.set(id, p);
      fire(p);
    },
    // A note-on through whichever port the app listens to; returns false when no port has a handler.
    play(midi) {
      const p = [...access.inputs.values()].find(i => i.onmidimessage);
      if (!p) return false;
      p.onmidimessage({ data: new Uint8Array([0x90, midi, 90]), timeStamp: performance.now() });
      p.onmidimessage({ data: new Uint8Array([0x80, midi, 0]), timeStamp: performance.now() });
      return p.id;
    },
  };
  Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
}, inputs);

const connect = async (page, name) => {
  await page.locator('#midiChip').click();
  await expect(page.locator('#midiText')).toHaveText(name);
};

test('testing a MIDI key in a dialog leaves the Book first-sight attempt unclaimed', async ({ app, page }) => {
  await page.clock.install();
  await fakeMidi(page, [['piano', 'Grand']]);
  await app.open({ hash: 'read' });
  await page.locator('#rdn-book-go').click();
  await page.locator('#settingsBtn').click();
  await page.locator('#set-connect').click();
  await expect(page.locator('#set-midi-status')).toHaveText('Grand');
  await page.clock.runFor(650); // Advance past the player's guard before auditioning.
  const audition = () => page.evaluate(() => {
    const { SR, srtLevelExpected, srtReadLedger } = window.__etude;
    const port = window.__midi.play(srtLevelExpected(SR.lvPiece)[0].midi);
    return { port, phase: SR.srtState.name, exposed: !!srtReadLedger(localStorage).exposures[SR.srtFingerprint] };
  });
  const idle = { port: 'piano', phase: 'idle', exposed: false };
  expect(await audition()).toEqual(idle);
  await page.keyboard.press('Escape');
  await expect(page.locator('#drawer')).toHaveAttribute('aria-hidden', 'true');
  await page.locator('#helpBtn').click();
  expect(await audition()).toEqual(idle);
  await page.locator('#helpClose').click();
  await expect(page.locator('#helpBox')).toHaveAttribute('aria-hidden', 'true');
  await audition();
  await expect.poll(() => page.evaluate(() => {
    const { SR, srtReadLedger } = window.__etude;
    return !!srtReadLedger(localStorage).exposures[SR.srtFingerprint];
  })).toBe(true);
});

test.describe('MIDI input comes back by itself', () => {
  test('an unplugged piano is attached again when it is plugged back in', async ({ app }) => {
    const page = app.page, name = 'Digital Piano';
    await fakeMidi(page, [['usb-1', name]]);
    await app.open();
    await connect(page, name);
    await page.evaluate(() => window.__midi.unplug('usb-1'));
    await expect(page.locator('#midiText')).toHaveText(fill(STRINGS.en.midi_waiting, name));
    expect(await page.evaluate(() => window.__etude.activeInputId)).toBeNull();
    expect(await page.evaluate(() => window.__midi.play(60))).toBe(false);
    await page.evaluate(() => window.__midi.plug('usb-1', 'Digital Piano'));
    await expect(page.locator('#midiText')).toHaveText(name);
    expect(await page.evaluate(() => window.__etude.activeInputId)).toBe('usb-1');
    expect(await page.evaluate(() => window.__midi.play(60))).toBe('usb-1');
  });

  test('a port Chrome keeps as disconnected, and a new id for the same name, still reconnect', async ({ app }) => {
    const page = app.page, name = 'Stage Piano';
    await fakeMidi(page, [['a', name]]);
    await app.open();
    await connect(page, name);
    await page.evaluate(() => window.__midi.unplug('a', true));
    await expect(page.locator('#midiText')).toHaveText(fill(STRINGS.en.midi_waiting, name));
    await expect(page.locator('#deviceSelect option')).toHaveText(['—']);
    await page.evaluate(() => { window.__midi.unplug('a'); window.__midi.plug('b', 'Stage Piano'); }); // Android hands out a new id
    await expect(page.locator('#midiText')).toHaveText(name);
    expect(await page.evaluate(() => window.__etude.activeInputId)).toBe('b');
  });

  test('another input stands in meanwhile, and the lost piano takes over again when it is back', async ({ app }) => {
    const page = app.page;
    await fakeMidi(page, [['piano', 'Grand'], ['pad', 'Drum Pad']]);
    await app.open();
    await connect(page, 'Grand');
    await page.evaluate(() => window.__midi.unplug('piano'));
    await expect(page.locator('#midiText')).toHaveText('Drum Pad');
    expect(await page.evaluate(() => window.__etude.savedDevice)).toBe('piano'); // the stand-in is not remembered
    await page.evaluate(() => window.__midi.plug('piano', 'Grand'));
    await expect(page.locator('#midiText')).toHaveText('Grand');
    expect(await page.evaluate(() => window.__etude.activeInputId)).toBe('piano');
  });

  test('when the stand-in goes too, the first lost piano is still the one that takes over', async ({ app }) => {
    const page = app.page;
    await fakeMidi(page, [['piano', 'Grand'], ['pad', 'Drum Pad']]);
    await app.open();
    await connect(page, 'Grand');
    await page.evaluate(() => window.__midi.unplug('piano'));
    await expect(page.locator('#midiText')).toHaveText('Drum Pad');
    await page.evaluate(() => window.__midi.unplug('pad'));
    await expect(page.locator('#midiText')).toHaveText(fill(STRINGS.en.midi_waiting, 'Grand'));
    await page.evaluate(() => window.__midi.plug('pad', 'Drum Pad'));
    await expect(page.locator('#midiText')).toHaveText('Drum Pad');
    await page.evaluate(() => window.__midi.plug('piano', 'Grand'));
    await expect(page.locator('#midiText')).toHaveText('Grand');
    expect(await page.evaluate(() => window.__etude.activeInputId)).toBe('piano');
  });

  test('picking an input by hand forgets the lost one', async ({ app }) => {
    const page = app.page;
    await fakeMidi(page, [['piano', 'Grand'], ['pad', 'Drum Pad']]);
    await app.open();
    await connect(page, 'Grand');
    await page.evaluate(() => window.__midi.unplug('piano'));
    await expect(page.locator('#midiText')).toHaveText('Drum Pad');
    await page.locator('#settingsBtn').click();
    await page.locator('#deviceSelect').selectOption('pad');
    await page.evaluate(() => window.__midi.plug('piano', 'Grand'));
    await expect(page.locator('#deviceSelect option')).toHaveCount(2);
    await expect(page.locator('#midiText')).toHaveText('Drum Pad');
  });
});

// A Web Bluetooth stand-in: one known BLE-MIDI device, reachable through getDevices(); window.__ble.drop() ends the link.
const fakeBle = page => page.addInitScript(() => {
  const listeners = { gone: [], value: [] };
  const chr = {
    startNotifications: async () => chr, stopNotifications: async () => chr, value: null,
    addEventListener: (type, fn) => listeners.value.push(fn), removeEventListener: (type, fn) => { listeners.value = listeners.value.filter(f => f !== fn); },
  };
  const gatt = {
    connected: false, connects: 0,
    async connect() { gatt.connects++; gatt.connected = true; return { getPrimaryService: async () => ({ getCharacteristic: async () => chr }) }; },
    disconnect() { gatt.connected = false; },
  };
  const dev = {
    id: 'ble-1', name: 'ES120', gatt,
    addEventListener: (type, fn) => listeners.gone.push(fn), removeEventListener: (type, fn) => { listeners.gone = listeners.gone.filter(f => f !== fn); },
  };
  window.__ble = {
    gatt,
    drop() { gatt.connected = false; listeners.gone.forEach(fn => fn({ target: dev })); },
    // One BLE-MIDI packet: note-on for `midi` at sender time `ms`.
    note(midi, ms = 100) {
      const bytes = new Uint8Array([0x80 | ((ms >> 7) & 0x3F), 0x80 | (ms & 0x7F), 0x90, midi, 90]);
      chr.value = new DataView(bytes.buffer);
      listeners.value.forEach(fn => fn({ target: chr, timeStamp: performance.now() }));
    },
  };
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { requestDevice: async () => dev, getDevices: async () => [dev] } });
});

test('a Bluetooth MIDI piano that drops is reconnected without the chooser', async ({ app }) => {
  const page = app.page;
  await fakeBle(page);
  await app.open({ saved: { v: 3, lang: 'en', data: {}, ble: { id: 'ble-1', name: 'ES120', auto: true } } });
  await expect(page.locator('#midiText')).toHaveText(fill(STRINGS.en.ble_on, 'ES120'));
  await page.evaluate(() => window.__ble.note(64));
  await expect.poll(() => page.evaluate(() => window.__etude.held.has(64))).toBe(true);
  await page.evaluate(() => window.__ble.drop());
  expect(await page.evaluate(() => window.__etude.held.has(64))).toBe(false); // nothing stays stuck
  await expect(page.locator('#set-ble-status')).toHaveText(fill(STRINGS.en.ble_lost, 'ES120'));
  await expect(page.locator('#midiText')).toHaveText(fill(STRINGS.en.ble_on, 'ES120'));
  expect(await page.evaluate(() => window.__ble.gatt.connects)).toBe(2);
});

test('with a MIDI piano connected, a drill answered on the keys keeps them folded', async ({ app }) => {
  const page = app.page, name = 'Digital Piano';
  await fakeMidi(page, [['usb-1', name]]);
  await page.setViewportSize({ width: 412, height: 915 });
  await app.open({ hash: 'practice' });
  await connect(page, name);
  await page.locator('#pr-mode button[data-v="play"]').click();
  await page.locator('#pr-start').click();
  await expect(page.locator('#session')).toBeVisible();
  await expect(page.locator('#dock')).toHaveClass(/\bis-rail\b/);
  await expect(page.locator('#dock-kb-toggle')).toBeVisible(); // Show stays available
  await page.evaluate(() => window.__midi.unplug('usb-1'));
  await expect(page.locator('#dock')).not.toHaveClass(/\bis-rail\b/); // without the piano the drill needs the on-screen keys
});

test('switching the language keeps the waiting status, in the new language', async ({ app }) => {
  const page = app.page, name = 'Digital Piano';
  await fakeMidi(page, [['usb-1', name]]);
  await app.open();
  await connect(page, name);
  await page.evaluate(() => window.__midi.unplug('usb-1'));
  await expect(page.locator('#midiText')).toHaveText(fill(STRINGS.en.midi_waiting, name));
  await page.evaluate(() => window.__etude.setLang('ro'));
  await expect(page.locator('#midiText')).toHaveText(fill(STRINGS.ro.midi_waiting, name));
  await expect(page.locator('#set-midi-status')).toHaveText(fill(STRINGS.ro.midi_waiting, name));
  await page.evaluate(() => window.__midi.plug('usb-1', 'Digital Piano')); // it still comes back by itself
  await expect(page.locator('#midiText')).toHaveText(name);
});

test('switching the language says any other MIDI status again, in the new language', async ({ app }) => {
  const page = app.page;
  await fakeMidi(page, []);
  await app.open();
  await page.locator('#midiChip').click();
  await expect(page.locator('#midiText')).toHaveText(STRINGS.en.midi_noinputs);
  await page.evaluate(() => window.__etude.setLang('ro'));
  await expect(page.locator('#midiText')).toHaveText(STRINGS.ro.midi_noinputs);
  await expect(page.locator('#set-midi-status')).toHaveText(STRINGS.ro.midi_noinputs);
});

test('reloading during MIDI fallback keeps the primary piano as the preference', async ({ app, page }) => {
  await fakeMidi(page, [['piano', 'Grand'], ['pad', 'Drum Pad']]);
  await app.open();
  await connect(page, 'Grand');
  await page.evaluate(() => window.__midi.unplug('piano'));
  await expect(page.locator('#midiText')).toHaveText('Drum Pad');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).device)).toBe('piano');
  await page.reload();
  await connect(page, 'Grand');
});

test('a reload with the preferred MIDI device absent uses a stand-in until it returns', async ({ app, page }) => {
  await fakeMidi(page, [['pad', 'Drum Pad']]);
  await app.open({ saved: { v: 3, lang: 'en', device: 'piano', data: {} } });
  await connect(page, 'Drum Pad');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ptt-v3')).device)).toBe('piano');
  await page.evaluate(() => window.__midi.plug('piano', 'Grand'));
  await expect(page.locator('#midiText')).toHaveText('Grand');
  expect(await page.evaluate(() => window.__midi.play(60))).toBe('piano');
});

test('a saved USB device name restores the preference when its port ID changes', async ({ app, page }) => {
  await fakeMidi(page, [['pad', 'Expression Pad'], ['renumbered', 'Grand']]);
  await app.open({ saved: { v: 3, lang: 'en', device: 'old-id', deviceName: 'Grand', data: {} } });
  await connect(page, 'Grand');
  expect(await page.evaluate(() => {
    const { device, deviceName } = JSON.parse(localStorage.getItem('ptt-v3'));
    return { device, deviceName };
  })).toEqual({ device: 'renumbered', deviceName: 'Grand' });
});

test('MIDI channel reset preserves other channels and All Sound Off clears sustained voices', async ({ app, page }) => {
  await app.open();
  const result = await page.evaluate(() => {
    const { midiIn, heldMidis, sustained } = window.__etude;
    const send = (status, a, b) => midiIn(status, a, b, 'midi');
    send(0x90, 60, 100);
    send(0x91, 65, 100);
    send(0xb0, 64, 127);
    send(0xb0, 123, 0);
    const afterNotesOff = { held: heldMidis(), sustained: [...sustained] };
    send(0xb0, 120, 0);
    return { afterNotesOff, afterSoundOff: { held: heldMidis(), sustained: [...sustained] } };
  });
  expect(result).toEqual({
    afterNotesOff: { held: [65], sustained: [60] },
    afterSoundOff: { held: [65], sustained: [] },
  });
});

test('BLE running status works inside a packet and resets before the next one', async ({ app, page }) => {
  await app.open();
  const result = await page.evaluate(() => {
    const { bleParse, heldMidis } = window.__etude;
    const packet = (...bytes) => bleParse(new Uint8Array(bytes));
    packet(0x80, 0x80, 0x90, 60, 90, 64, 90);
    const first = heldMidis();
    packet(0x80, 0x81, 67, 90);
    const second = heldMidis();
    packet(0x80, 0x82, 0x80, 60, 0, 64, 0);
    return { first, second, after: heldMidis() };
  });
  expect(result).toEqual({ first: [60, 64], second: [60, 64], after: [] });
});

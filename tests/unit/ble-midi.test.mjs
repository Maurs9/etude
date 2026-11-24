import { describe, expect, it, vi } from 'vitest';
import { BLE_MIDI_CHR, BLE_MIDI_SVC, createBleMidi } from '../../src/domain/ble-midi.ts';

function fakeDom() {
  const map = new Map();
  for (const id of ['set-ble-status', 'set-ble', 'set-ble-re']) {
    map.set(id, { id, hidden: false, disabled: false, textContent: '', dataset: {} });
  }
  return {
    byId: (id) => map.get(id),
    buttonById: (id) => map.get(id),
    map,
  };
}

function makeHarness(overrides = {}) {
  const dom = fakeDom();
  const midiIn = vi.fn();
  const panic = vi.fn();
  const saveAll = vi.fn();
  const releaseBleChannels = vi.fn();
  const releaseSustainPedal = vi.fn();
  const resetBend = vi.fn();
  const resetModulation = vi.fn();
  let firstSightActive = false;

  const ctrl = createBleMidi({
    t: (k, ...args) => (args.length ? `${k}:${args.join(',')}` : k),
    midiChipSync: vi.fn(),
    ensureAudio: () => null,
    saveAll,
    panic,
    srtEligibleFirstSightActive: () => firstSightActive,
    midiIn,
    releaseBleChannels,
    releaseSustainPedal,
    resetBend,
    resetModulation,
    runtimeErrorName: (e) => (e instanceof Error ? e.name : ''),
    runtimeErrorMessage: (e) => (e instanceof Error ? e.message : ''),
    byId: dom.byId,
    buttonById: dom.buttonById,
    getBluetooth: () => undefined,
    isSecureContext: () => true,
    now: () => 5000,
    setTimeout: () => 1,
    clearTimeout: () => {},
    ...overrides,
  });

  return {
    ctrl,
    dom,
    midiIn,
    panic,
    saveAll,
    releaseBleChannels,
    releaseSustainPedal,
    resetBend,
    resetModulation,
    setFirstSightActive: (v) => { firstSightActive = v; },
  };
}

describe('BLE-MIDI controller & packet parser', () => {
  it('decodes Note On/Off, running status, real-time clock bytes, and SysEx across continuation packets', () => {
    const h = makeHarness();

    // Header 0x80 | ts 0x80 | NoteOn ch0 0x90 | C4 60 | vel 96 | running-status E4 64 | vel 80
    h.ctrl.parse(new Uint8Array([0x80, 0x80, 0x90, 60, 96, 64, 80]), 1000);
    expect(h.midiIn).toHaveBeenCalledTimes(2);
    expect(h.midiIn).toHaveBeenNthCalledWith(1, 0x90, 60, 96, 'ble', expect.any(Number));
    expect(h.midiIn).toHaveBeenNthCalledWith(2, 0x90, 64, 80, 'ble', expect.any(Number));

    // Real-time 0xF8 interleaved during running status preserves 0x90.
    // BLE-MIDI: ts1(0x81), 0xF8 (clock, ignored), Note G4(67), vel 90 -> needs new ts or data after status
    // Note: status 0xF8 is followed cleanly by next note: ts 0x82, status 0x80 (NoteOff), 60, 0
    h.ctrl.status(0x90);
    h.ctrl.status(0xf8);
    h.ctrl.data(67);
    h.ctrl.data(88);
    expect(h.midiIn).toHaveBeenNthCalledWith(3, 0x90, 67, 88, 'ble', expect.any(Number));

    // Multi-packet SysEx (0xF0 ... ) ignored safely without emitting false notes, terminated by 0xF7.
    h.ctrl.parse(new Uint8Array([0x80, 0x81, 0xf0, 0x7e, 0x7f, 0x06]), 1020);
    expect(h.ctrl.state.sysex).toBe(true);
    expect(h.midiIn).toHaveBeenCalledTimes(3);

    // Continuation packet drops high bit inside SysEx payload until 0xF7 + trailing Note Off.
    h.ctrl.parse(new Uint8Array([0x80, 0x01, 0x02, 0x82, 0xf7, 0x83, 0x80, 60, 0]), 1040);
    expect(h.ctrl.state.sysex).toBe(false);
    expect(h.midiIn).toHaveBeenCalledTimes(4);
    expect(h.midiIn).toHaveBeenNthCalledWith(4, 0x80, 60, 0, 'ble', expect.any(Number));
  });

  it('tracks sustain, mod wheel, and pitch bend and resets them with panic on first-sight disconnect', () => {
    const h = makeHarness();
    h.setFirstSightActive(true);

    // CC64 >= 64 (pedal), CC1 > 0 (mod), Pitch Bend != 8192.
    h.ctrl.msg(0xb0, 64, 127);
    h.ctrl.msg(0xb0, 1, 40);
    h.ctrl.msg(0xe0, 0, 96);
    expect(h.ctrl.state.pedal).toBe(true);
    expect(h.ctrl.state.mod).toBe(true);
    expect(h.ctrl.state.bend).toBe(true);

    const chr = {
      removeEventListener: vi.fn(),
      stopNotifications: () => Promise.resolve(),
      startNotifications: () => Promise.resolve(),
      addEventListener: vi.fn(),
    };
    const dev = {
      id: 'ble-1',
      name: 'Piano',
      gatt: { connected: true, connect: vi.fn(), disconnect: vi.fn() },
      removeEventListener: vi.fn(),
      addEventListener: vi.fn(),
    };
    h.ctrl.state.dev = dev;
    h.ctrl.state.chr = chr;
    h.ctrl.state.saved = { id: 'ble-1', name: 'Piano', auto: true };

    h.ctrl.disconnect();
    expect(h.panic).toHaveBeenCalledTimes(1);
    expect(h.releaseBleChannels).toHaveBeenCalledTimes(1);
    expect(h.releaseSustainPedal).toHaveBeenCalledTimes(1);
    expect(h.resetBend).toHaveBeenCalledTimes(1);
    expect(h.resetModulation).toHaveBeenCalledTimes(1);
    expect(h.ctrl.state.pedal).toBe(false);
    expect(h.ctrl.state.mod).toBe(false);
    expect(h.ctrl.state.bend).toBe(false);
    expect(h.ctrl.state.saved?.auto).toBe(false);
    expect(dev.gatt.disconnect).toHaveBeenCalledTimes(1);
  });

  it('connects cleanly via GATT and ignores superseded connection attempts', async () => {
    const startNotifications = vi.fn(async () => {});
    const chr = {
      startNotifications,
      stopNotifications: async () => {},
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const dev = {
      id: 'kawai-1',
      name: 'Kawai ES120',
      gatt: {
        connected: true,
        connect: async () => ({
          getPrimaryService: async (uuid) => {
            expect(uuid).toBe(BLE_MIDI_SVC);
            return {
              getCharacteristic: async (chrUuid) => {
                expect(chrUuid).toBe(BLE_MIDI_CHR);
                return chr;
              },
            };
          },
        }),
        disconnect: vi.fn(),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    const h = makeHarness({
      getBluetooth: () => ({
        requestDevice: async () => dev,
        getDevices: async () => [dev],
      }),
    });

    await h.ctrl.choose();
    expect(h.ctrl.live()).toBe(true);
    expect(startNotifications).toHaveBeenCalledTimes(1);
    expect(h.ctrl.state.saved).toEqual({ id: 'kawai-1', name: 'Kawai ES120', auto: true });
    expect(h.dom.byId('set-ble-status').textContent).toBe('ble_on:Kawai ES120');

    // A stale generation disconnect triggers cleanup disconnect on the superseded device.
    h.ctrl.disconnect(true);
    const dev2Disconnect = vi.fn();
    expect(h.ctrl.stale(0, { id: 'old', gatt: { connected: true, connect: vi.fn(), disconnect: dev2Disconnect }, addEventListener: vi.fn(), removeEventListener: vi.fn() })).toBe(true);
    expect(dev2Disconnect).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMidiController } from '../../src/infra/midi-controller.ts';

function makeHarness() {
  let pedalDown = false;
  const held = new Set();
  const sustained = new Set();
  const midiChannels = new Map();
  const midiSustainOwners = new Map();
  const onNoteOn = vi.fn((midi) => { held.add(midi); });
  const onNoteOff = vi.fn((midi, _src, _kind, silence) => {
    held.delete(midi);
    if (!silence && pedalDown) sustained.add(midi);
  });
  const onPitchBend = vi.fn();
  const onModulation = vi.fn();
  const onSustainChange = vi.fn();
  const silenceNote = vi.fn();
  const pedalUp = vi.fn(() => { sustained.clear(); midiSustainOwners.clear(); });
  const audioLockCheck = vi.fn();
  const controller = createMidiController({
    t: (key, ...args) => args.length ? `${key}:${args.join(',')}` : key,
    ensureAudio: vi.fn(),
    audioLockCheck,
    releaseLiveInput: vi.fn(),
    panic: vi.fn(),
    saveAll: vi.fn(),
    onNoteOn,
    onNoteOff,
    onPitchBend,
    onModulation,
    onSustainChange,
    silenceNote,
    getPedalDown: () => pedalDown,
    setPedalDown: (v) => { pedalDown = v; },
    pedalUp,
    midiChannels,
    midiSustainOwners,
    sustained,
    held,
    isBleCan: () => false,
    isBleLive: () => false,
    getBleName: () => '',
    isDockShown: () => false,
    onChipSync: vi.fn(),
    runtimeErrorName: (err) => (err instanceof Error ? err.name : ''),
  });
  return {
    controller,
    held,
    sustained,
    midiChannels,
    midiSustainOwners,
    onNoteOn,
    onNoteOff,
    onPitchBend,
    onModulation,
    onSustainChange,
    silenceNote,
    pedalUp,
    audioLockCheck,
    getPedalDown: () => pedalDown,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createMidiController', () => {
  it('decodes note on/off, velocity-0 note off, pitch bend, modulation, and ignores invalid packets', () => {
    const h = makeHarness();

    h.controller.midiIn(0x90, 60, 100, 'midi', 1000);
    expect(h.onNoteOn).toHaveBeenCalledWith(60, 100, 'midi');
    expect(h.audioLockCheck).toHaveBeenCalledTimes(1);

    // Note on with velocity 0 acts as note off.
    h.controller.midiIn(0x90, 60, 0, 'midi', 1050);
    expect(h.onNoteOff).toHaveBeenCalledWith(60, 'midi', 'physical', false);

    // Pitch bend center = 8192 -> 0; max = 16383 -> +8191.
    h.controller.midiIn(0xE0, 0x00, 0x40, 'midi', 1100);
    expect(h.onPitchBend).toHaveBeenLastCalledWith(0);
    h.controller.midiIn(0xE0, 0x7F, 0x7F, 'midi', 1110);
    expect(h.onPitchBend).toHaveBeenLastCalledWith(8191);

    // CC1 modulation wheel scales 0..127 -> 0..35.
    h.controller.midiIn(0xB0, 1, 127, 'midi', 1120);
    expect(h.onModulation).toHaveBeenCalledWith(35);

    // Malformed / out-of-range packets are silently ignored.
    h.controller.midiIn(0x70, 60, 100, 'midi', 1130);
    h.controller.midiIn(0x90, 200, 100, 'midi', 1140);
    h.controller.midiIn(NaN, 60, 100, 'midi', 1150);
    expect(h.onNoteOn).toHaveBeenCalledTimes(1);
  });

  it('tracks CC64 sustain pedal and clears channel notes + sustained voices on CC120 / CC123', () => {
    const h = makeHarness();

    // Press pedal, play C4 on ch 0, release key -> stays in sustained with owner ch 0.
    h.controller.midiIn(0xB0, 64, 127, 'midi', 2000);
    expect(h.getPedalDown()).toBe(true);
    expect(h.onSustainChange).toHaveBeenCalledWith(true);

    h.controller.midiIn(0x90, 60, 90, 'midi', 2010);
    h.controller.midiIn(0x80, 60, 0, 'midi', 2020);
    expect(h.sustained.has(60)).toBe(true);
    expect(h.midiSustainOwners.get(60)).toEqual({ source: 'midi', channel: 0 });

    // CC120 (All Sound Off) on channel 0 silences sustained voices owned by ch 0.
    h.controller.midiIn(0xB0, 120, 0, 'midi', 2030);
    expect(h.sustained.has(60)).toBe(false);
    expect(h.silenceNote).toHaveBeenCalledWith(60);

    // Release pedal -> calls pedalUp and reports sustain change false.
    h.controller.midiIn(0xB0, 64, 0, 'midi', 2040);
    expect(h.pedalUp).toHaveBeenCalledTimes(1);
    expect(h.onSustainChange).toHaveBeenLastCalledWith(false);
  });

  it('restores saved device metadata and describes inputs cleanly', () => {
    const h = makeHarness();
    expect(h.controller.describeInputs()).toBe('MIDI: not connected');

    h.controller.restoreSavedDevice('dev-1', 'FP-30X');
    expect(h.controller.state.savedDevice).toBe('dev-1');
    expect(h.controller.state.savedDeviceName).toBe('FP-30X');

    h.controller.restoreSavedDevice('', 'ignored');
    expect(h.controller.state.savedDevice).toBeNull();
    expect(h.controller.state.savedDeviceName).toBeNull();
  });
});

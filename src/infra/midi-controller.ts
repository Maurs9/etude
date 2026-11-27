/* Web MIDI connection management, device auto-reconnect, header chip sync, and
   transport-agnostic MIDI message decoding (USB/Web MIDI and BLE-MIDI). */
import { byId, maybeById, selectById } from '../domain/dom.js';
import { selectMidiInput } from '../domain/midi-input-selection.js';
import { eventTime, withInputTime } from '../domain/midi-timing.js';
import type { TranslateFn } from '../domain/views.js';

export interface MidiStatusMessage {
  cls: string;
  text: string | null;
  key?: string;
  args?: string[];
}

export interface MidiControllerState {
  midiAccess: MIDIAccess | null;
  activeInputId: string | null;
  activeInputName: string;
  savedDevice: string | null;
  savedDeviceName: string | null;
  midiLost: { id: string; name: string } | null;
  midiMsg: MidiStatusMessage | null;
}

export interface MidiControllerDeps {
  readonly t: TranslateFn;
  readonly ensureAudio: () => void;
  readonly audioLockCheck: () => void;
  readonly releaseLiveInput: () => void;
  readonly panic: () => void;
  readonly saveAll: () => void;
  readonly onNoteOn: (midi: number, velocity: number, source: string) => void;
  readonly onNoteOff: (midi: number, source: string, releaseKind: 'physical' | 'reset', silence: boolean) => void;
  readonly onPitchBend: (value: number) => void;
  readonly onModulation: (depth: number) => void;
  readonly onSustainChange: (down: boolean) => void;
  readonly silenceNote: (midi: number) => void;
  readonly getPedalDown: () => boolean;
  readonly setPedalDown: (down: boolean) => void;
  readonly pedalUp: () => void;
  readonly midiChannels: Map<string, Map<number, Set<number>>>;
  readonly midiSustainOwners: Map<number, { source: string; channel: number }>;
  readonly sustained: Set<number>;
  readonly held: Set<number>;
  readonly isBleCan: () => boolean;
  readonly isBleLive: () => boolean;
  readonly getBleName: () => string;
  readonly isDockShown: () => boolean;
  readonly onChipSync: () => void;
  readonly runtimeErrorName: (value: unknown) => string;
}

export interface MidiController {
  readonly state: MidiControllerState;
  midiStatus(key: string, cls: string, ...args: string[]): void;
  setMidi(text: string | null, cls: string): void;
  midiChipSync(): void;
  connectMidi(): Promise<void>;
  listInputs(): MIDIInput[];
  refreshDeviceList(): void;
  attachInput(id: string, temporary?: boolean): void;
  autoReconnectMidi(): void;
  onStateChange(): void;
  onMidiMessage(e: MIDIMessageEvent): void;
  midiIn(st: number, d1: number, d2: number, src: string, at?: number): void;
  midiDispatch(st: number, d1: number, d2: number, src: string): void;
  midiNoteOff(source: string, channel: number, midi: number, mode?: 120 | 123): void;
  localizeStatus(): void;
  restoreSavedDevice(device: unknown, deviceName: unknown): void;
  describeInputs(): string;
}

export function createMidiController(deps: MidiControllerDeps): MidiController {
  const {
    t, ensureAudio, audioLockCheck, releaseLiveInput, panic, saveAll,
    onNoteOn, onNoteOff, onPitchBend, onModulation, onSustainChange, silenceNote,
    getPedalDown, setPedalDown, pedalUp,
    midiChannels, midiSustainOwners, sustained, held,
    isBleCan, isBleLive, getBleName, isDockShown, onChipSync, runtimeErrorName,
  } = deps;

  const state: MidiControllerState = {
    midiAccess: null,
    activeInputId: null,
    activeInputName: '',
    savedDevice: null,
    savedDeviceName: null,
    midiLost: null,
    midiMsg: null,
  };

  function midiChipSync(): void {
    const mt = byId('midiText'), md = byId('midiDot');
    if (!mt || !md) return;
    if (!(state.midiMsg && state.midiMsg.cls === 'on') && isBleLive()) {
      mt.textContent = t('ble_on', getBleName());
      md.className = 'dot on';
    } else {
      mt.textContent = state.midiMsg ? state.midiMsg.text : t('midi_connect');
      md.className = 'dot' + (state.midiMsg && state.midiMsg.cls ? ' ' + state.midiMsg.cls : '');
    }
    const bleChip = maybeById('bleChip');
    if (bleChip) bleChip.hidden = !isBleCan() || isBleLive();
    const exKbBtn = maybeById('ex-open-kb');
    if (exKbBtn) exKbBtn.hidden = isDockShown() || !!state.activeInputId || isBleLive();
    onChipSync();
  }

  function setMidi(text: string | null, cls: string): void {
    state.midiMsg = { text, cls };
    const s = byId('set-midi-status');
    if (s) s.textContent = text;
    midiChipSync();
  }

  // A status in the user's language: the key and its arguments are kept so applyI18n can say it again after a language change.
  function midiStatus(key: string, cls: string, ...args: string[]): void {
    setMidi(t(key, ...args), cls);
    if (state.midiMsg) {
      state.midiMsg.key = key;
      state.midiMsg.args = args;
    }
  }

  function localizeStatus(): void {
    if (state.midiMsg?.key) {
      midiStatus(state.midiMsg.key, state.midiMsg.cls, ...(state.midiMsg.args ?? []));
    } else if (!state.activeInputId) {
      state.midiMsg = null;
      const ss = maybeById('set-midi-status');
      if (ss) ss.textContent = t('midi_off');
    }
  }

  function restoreSavedDevice(device: unknown, deviceName: unknown): void {
    state.savedDevice = typeof device === 'string' && device ? device : null;
    state.savedDeviceName = state.savedDevice && typeof deviceName === 'string' && deviceName ? deviceName : null;
  }

  function describeInputs(): string {
    const inputs = state.midiAccess
      ? [...state.midiAccess.inputs.values()].map(i => (i.name || i.id) + (i.id === state.activeInputId ? ' (active)' : ''))
      : [];
    return 'MIDI: ' + (state.midiAccess ? (inputs.join(', ') || 'no inputs') : 'not connected');
  }

  // Chrome keeps an unplugged port in the map with state 'disconnected': it is not an input until it is back.
  function listInputs(): MIDIInput[] {
    return state.midiAccess ? [...state.midiAccess.inputs.values()].filter((i) => i.state !== 'disconnected') : [];
  }

  function midiNoteOff(source: string, channel: number, midi: number, mode?: 120 | 123): void {
    const channels = midiChannels.get(source);
    if (!channels?.get(channel)?.delete(midi) || [...channels.values()].some(notes => notes.has(midi))) return;
    onNoteOff(midi, source, mode ? 'reset' : 'physical', mode === 120);
    if (sustained.has(midi)) midiSustainOwners.set(midi, { source, channel });
  }

  function midiDispatch(st: number, d1: number, d2: number, src: string): void {
    if (!Number.isInteger(st) || st < 0x80 || st > 0xef || !Number.isInteger(d1) || !Number.isInteger(d2) || d1 < 0 || d1 > 127 || d2 < 0 || d2 > 127) {
      return;
    }
    const cmd = st & 0xf0, channel = st & 0x0f;
    if (cmd === 0x90 && d2 > 0) {
      const channels = midiChannels.get(src) ?? new Map<number, Set<number>>();
      const notes = channels.get(channel) ?? new Set<number>();
      notes.add(d1);
      channels.set(channel, notes);
      midiChannels.set(src, channels);
      onNoteOn(d1, d2, src);
      audioLockCheck();
    } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
      midiNoteOff(src, channel, d1);
    } else if (cmd === 0xE0) {
      onPitchBend(((d2 << 7) | d1) - 8192);
    } else if (cmd === 0xB0) {
      if (d1 === 64) {
        const dn = d2 >= 64;
        const prev = getPedalDown();
        const changed = prev !== dn;
        if (prev && !dn) pedalUp();
        setPedalDown(dn);
        if (changed) onSustainChange(dn);
      } else if (d1 === 120 || d1 === 123) {
        for (const midi of midiChannels.get(src)?.get(channel) ?? []) midiNoteOff(src, channel, midi, d1);
        if (d1 === 120) {
          for (const [midi, owner] of midiSustainOwners) {
            if (owner.source !== src || owner.channel !== channel) continue;
            midiSustainOwners.delete(midi);
            sustained.delete(midi);
            if (!held.has(midi)) silenceNote(midi);
          }
        }
      } else if (d1 === 1) {
        onModulation((d2 / 127) * 35);
      }
    }
  }

  // One decoder for every transport (Web MIDI, Bluetooth MIDI): notes, sustain (CC64), mod wheel (CC1) and pitch bend.
  // at: when the message happened (performance.now() ms). Judges read it, less the source's calibrated offset, through inputTime().
  function midiIn(st: number, d1: number, d2: number, src: string, at = performance.now()): void {
    withInputTime(at, src === 'ble' ? 'ble' : 'usb', () => midiDispatch(st, d1, d2, src));
  }

  // A short message leaves the missing bytes NaN, which no comparison below matches (as `undefined` did).
  // The event's own timeStamp (performance.now() clock) is when the key went down; the handler can run a frame or more later.
  function onMidiMessage(e: MIDIMessageEvent): void {
    if (!e.data) return;
    const [st = NaN, d1 = NaN, d2 = NaN] = e.data;
    midiIn(st, d1, d2, 'midi', eventTime(e.timeStamp, performance.now()));
  }

  function attachInput(id: string, temporary = false): void {
    const inputs = listInputs(), input = inputs.find(candidate => candidate.id === id);
    if (!input) return;
    if (state.activeInputId && state.activeInputId !== id) releaseLiveInput();
    inputs.forEach(candidate => { candidate.onmidimessage = null; });
    input.onmidimessage = onMidiMessage;
    state.activeInputId = id;
    state.activeInputName = input.name || '';
    if (!temporary) {
      state.midiLost = null;
      state.savedDevice = id;
      state.savedDeviceName = input.name || null;
    }
    setMidi(input.name, 'on');
    saveAll();
  }

  function refreshDeviceList(): void {
    const sel = selectById('deviceSelect'), ins = listInputs();
    sel.innerHTML = '';
    if (!ins.length) {
      sel.innerHTML = '<option>—</option>';
      state.activeInputId = null;
      if (state.midiLost) midiStatus('midi_waiting', 'err', state.midiLost.name || 'MIDI');
      else midiStatus('midi_noinputs', 'err');
      return;
    }
    ins.forEach((i) => {
      const o = document.createElement('option');
      o.value = i.id;
      o.textContent = i.name ?? '';
      sel.appendChild(o);
    });
    const preferredName = state.midiLost?.name ||
      (state.savedDevice ? state.midiAccess?.inputs.get(state.savedDevice)?.name : null) ||
      state.savedDeviceName;
    const choice = selectMidiInput(ins, state.activeInputId, state.savedDevice, preferredName);
    if (!choice) return;
    sel.value = choice.input.id;
    attachInput(choice.input.id, choice.temporary);
  }

  function onStateChange(): void {
    const was = state.activeInputId;
    const ins = listInputs();
    const present = state.activeInputId && ins.some((i) => i.id === state.activeInputId);
    if (was && !present) {
      if (!state.midiLost && was === state.savedDevice) {
        // a stand-in that goes too leaves the preferred input remembered
        state.midiLost = { id: was, name: state.activeInputName };
      }
      panic();
      state.activeInputId = null;
    }
    refreshDeviceList();
  }

  async function connectMidi(): Promise<void> {
    ensureAudio();
    if (!navigator.requestMIDIAccess) {
      midiStatus('midi_unsupported', 'err');
      return;
    }
    if (!window.isSecureContext) midiStatus('midi_insecure', 'err');
    try {
      state.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      state.midiAccess.onstatechange = onStateChange;
      refreshDeviceList();
    } catch (err) {
      console.error(err);
      midiStatus(
        runtimeErrorName(err) === 'SecurityError'
          ? 'midi_blocked'
          : runtimeErrorName(err) === 'NotAllowedError'
            ? 'midi_denied'
            : 'midi_unavail',
        'err',
      );
    }
  }

  function autoReconnectMidi(): void {
    if (!navigator.permissions || !navigator.requestMIDIAccess) return;
    try {
      const midiPermission: Parameters<Permissions['query']>[0] & { sysex: boolean } = { name: 'midi', sysex: false };
      navigator.permissions.query(midiPermission).then((p) => {
        if (p.state === 'granted') void connectMidi();
      }).catch(() => { });
    } catch (_) { }
  }

  return {
    state,
    midiStatus,
    setMidi,
    midiChipSync,
    connectMidi,
    listInputs,
    refreshDeviceList,
    attachInput,
    autoReconnectMidi,
    onStateChange,
    onMidiMessage,
    midiIn,
    midiDispatch,
    midiNoteOff,
    localizeStatus,
    restoreSavedDevice,
    describeInputs,
  };
}

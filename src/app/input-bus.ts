import { type InputBusListener } from '../domain/views.js';
import * as theory from '../domain/theory.js';
import type { AudioEngine } from '../domain/audio.js';
import type { PracticeController, ReadController, ScorePlayerController } from '../domain/views.js';

const pc = theory.pitchClass;

/** Shell state and services the input bus reads; `pedalDown` is shell state, read and written through accessors. */
export interface InputBusDeps {
  readonly practice: PracticeController | null;
  readonly scorePlayer: ScorePlayerController | null;
  readonly read: ReadController | null;
  readonly audioEngine: AudioEngine;
  readonly liveVoices: AudioEngine['liveVoices'];
  readonly pianoBank: AudioEngine['pianoBank'];
  readonly keyEl: Map<number, HTMLButtonElement>;
  readonly pointerKey: Map<number, number | null>;
  readonly typingDown: Map<string, number>;
  readonly cal: { readonly on: boolean };
  pedalDown: boolean;
  readonly view0: () => string;
  readonly kbPress: (midi: number, on: boolean) => void;
  readonly audioNoteOn: (midi: number, velocity: number | undefined) => void;
  readonly audioNoteOff: (midi: number) => void;
  readonly ensureAudio: (warm?: boolean) => AudioContext | null;
  readonly wakePing: () => void;
  readonly stopPreviews: () => void;
  readonly stopDrone: () => void;
  readonly panicLoadedFeatures: () => void;
  readonly overlaysOpen: () => boolean;
  readonly calListening: () => boolean;
  readonly calTap: () => void;
  readonly calStop: () => void;
  readonly calSay: (text: string) => void;
}

/*
 * The central input fan-out: every key from MIDI, Bluetooth, the computer keyboard, the screen or a rhythm pad comes
 * through handleNoteOn / handleNoteOff here. It keeps the physical tracking (held, order, sustain, owners per source,
 * MIDI channels) and routes each event to the view that wants it, after the shared listeners on host.input.
 */
export function createInputBus(deps: InputBusDeps) {
  /* ---------- INPUT ROUTING ---------- */
  const held = new Set<number>(), heldOrder: number[] = [], sustained = new Set<number>(), inputOwners = new Map<number, Set<string>>();
  const midiChannels = new Map<string, Map<number, Set<number>>>();
  const midiSustainOwners = new Map<number, { source: string; channel: number }>();
  function handleNoteOn(midi: number, vel: number, source = 'midi') {
      if (!Number.isInteger(midi) || midi < 0 || midi > 127)
          return;
      deps.ensureAudio();
      const owners = inputOwners.get(midi) || new Set<string>();
      owners.add(source);
      inputOwners.set(midi, owners);
      if (held.has(midi)) {
          deps.read?.trackHeldSource(source);
          return;
      }
      sustained.delete(midi);
      midiSustainOwners.delete(midi);
      held.add(midi);
      heldOrder.push(midi);
      deps.audioNoteOn(midi, vel);
      deps.kbPress(midi, true);
      deps.wakePing();
      onInputChange('on', midi, source, null);
  }
  function handleNoteOff(midi: number, source = 'midi', releaseKind: 'physical'|'focus'|'reset'|null = 'physical', silence = false) {
      const owners = inputOwners.get(midi);
      if (!owners || !owners.delete(source))
          return;
      if (owners.size)
          return;
      inputOwners.delete(midi);
      if (!held.has(midi))
          return;
      held.delete(midi);
      const i = heldOrder.indexOf(midi);
      if (i >= 0)
          heldOrder.splice(i, 1);
      deps.kbPress(midi, false);
      if (silence)
          deps.audioEngine.silenceNote(midi);
      else if (deps.pedalDown)
          sustained.add(midi);
      else
          deps.audioNoteOff(midi);
      onInputChange('off', midi, source, releaseKind);
  }
  function pedalUp() { sustained.forEach((m) => { if (!held.has(m))
      deps.audioNoteOff(m); }); sustained.clear(); midiSustainOwners.clear(); }
  function heldMidis() { return [...held]; }
  function heldPcs() { return [...new Set(heldMidis().map(pc))].sort((a, b) => a - b); }
  function releaseLiveInput() {
      held.forEach((m) => deps.audioNoteOff(m));
      sustained.forEach((m) => deps.audioNoteOff(m));
      held.clear();
      deps.read?.releaseInput();
      heldOrder.length = 0;
      sustained.clear();
      inputOwners.clear();
      midiChannels.clear();
      midiSustainOwners.clear();
      deps.pointerKey.clear();
      deps.scorePlayer?.releaseInput();
      deps.typingDown.clear();
      deps.pedalDown = false;
      deps.keyEl.forEach((el) => { el._kd = false; el.classList.remove('pressed'); if (el.dataset.s === 'active')
          delete el.dataset.s; });
  }
  // Without focus no key-up or pointer-up arrives, so keys held from the computer keyboard, the screen or a rhythm pad are let go as if
  // lifted (drills see an ordinary release). MIDI and Bluetooth go on reporting, so keys and pedal held on the instrument stay as they are.
  function releaseFocusInput() {
      let fell = false;
      [...inputOwners.entries()].forEach(([m, o]) => [...o].forEach((s) => { if (s === 'midi' || s === 'ble')
          return; if (s.startsWith('fall:'))
          fell = true; handleNoteOff(m, s, 'focus'); }));
      deps.pointerKey.clear();
      deps.typingDown.clear();
      deps.keyEl.forEach((el) => { el._kd = false; });
      deps.read?.releaseFocus();
      deps.scorePlayer?.releaseFocus(fell);
  }
  function panic() {
      deps.practice?.stopPrompts();
      deps.read?.panicBegin();
      if (deps.cal.on) {
          deps.calStop();
          deps.calSay('');
      }
      deps.pianoBank.cancelWarmIdle();
      deps.read?.panicRecorder();
      releaseLiveInput();
      deps.read?.panicRhythm();
      deps.practice?.stopAccompaniment();
      deps.read?.panicStopAll();
      held.forEach(deps.audioNoteOff);
      held.clear();
      heldOrder.length = 0;
      sustained.forEach(deps.audioNoteOff);
      sustained.clear();
      deps.liveVoices.forEach(voice => voice.stop());
      deps.liveVoices.clear();
      deps.stopPreviews();
      deps.stopDrone();
      deps.pointerKey.clear();
      deps.typingDown.clear();
      deps.pedalDown = false;
      deps.audioEngine.setBendFromValue(0);
      deps.audioEngine.setModulation(0, .02);
      deps.keyEl.forEach(el => {
          el.classList.remove('pressed');
          if (el.dataset.s === 'active') delete el.dataset.s;
      });
      deps.panicLoadedFeatures();
  }
  const inputBusListeners = new Set<InputBusListener>();
  // midi is the key that just went down or (physically) came up; the sustain pedal never delays an 'off'.
  function onInputChange(kind: 'on'|'off', midi: number, source = 'midi', releaseKind: 'physical'|'focus'|'reset'|null = null) {
      if (kind === 'off')
          deps.read?.releaseInput(midi);
      if (deps.calListening()) { // the timing wizard is listening: notes only sound, no drill sees them
          if (kind === 'on')
              deps.calTap();
          return;
      }
      // MIDI still sounds in a dialog. Only calibration and note releases reach their handlers.
      if (kind === 'on' && deps.overlaysOpen())
          return;
      for (const listener of inputBusListeners) listener({ kind, midi, source, releaseKind });
      if (deps.read?.preInput(kind, midi, source, releaseKind))
          return;
      if (deps.view0() === 'analysis') {
          deps.scorePlayer?.practiceInput(kind, midi, source);
          return;
      }
      if (deps.view0() === 'explore' || deps.view0() === 'sing' || deps.view0() === 'learn') {
          return;
      }
      if (deps.view0() === 'read' && deps.read?.viewInput(kind, midi, heldOrder[heldOrder.length - 1]))
          return;
      if (deps.practice?.sesActive())
          deps.practice.sessionInput(kind, midi);
  }

  return {
    handleNoteOff,
    handleNoteOn,
    held,
    heldMidis,
    heldOrder,
    heldPcs,
    inputBusListeners,
    inputOwners,
    midiChannels,
    midiSustainOwners,
    onInputChange,
    panic,
    pedalUp,
    releaseFocusInput,
    releaseLiveInput,
    sustained,
  };
}

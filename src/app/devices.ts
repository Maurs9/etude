import { createPwaLifecycle } from '../infra/pwa-lifecycle.js';
import * as audio from '../domain/audio.js';
import { byId, maybeById, buttonById, queryHtml, queryAllHtml } from '../domain/dom.js';
import { type ScorePlayerController, type PracticeController, type ReadController, type StoredTrainerData } from '../domain/views.js';
import { useLatencyOffsets } from '../domain/midi-timing.js';
import { createTimingCalibration } from '../domain/midi-calibration.js';
import { createBleMidi } from '../domain/ble-midi.js';
import { createMidiController } from '../infra/midi-controller.js';

/** Shell state and services createDevices reads; values are getters so shell declarations made later resolve on use. */
export interface DevicesDeps {
  readonly audioEngine: audio.AudioEngine;
  readonly audioLockCheck: () => void;
  readonly BASE_HIGH: number;
  readonly BASE_LOW: number;
  readonly buildKeyboard: () => void;
  readonly clampTypeOctave: () => void;
  readonly data: StoredTrainerData;
  readonly dockOpen: (v?: string) => boolean;
  readonly dockShown: () => boolean;
  readonly dockSync: () => void;
  readonly ensureAudio: (warm?: boolean) => AudioContext | null;
  readonly handleNoteOff: (midi: number, source?: string, releaseKind?: "physical" | "focus" | "reset" | null, silence?: boolean) => void;
  readonly handleNoteOn: (midi: number, vel: number, source?: string) => void;
  readonly held: Set<number>;
  readonly inputOwners: Map<number, Set<string>>;
  readonly midiChannels: Map<string, Map<number, Set<number>>>;
  readonly midiSustainOwners: Map<number, { source: string; channel: number; }>;
  readonly openHelp: (o: boolean, fromPop?: boolean) => void;
  readonly overlaysOpen: () => boolean;
  readonly panic: () => void;
  pedalDown: boolean;
  readonly pedalUp: () => void;
  readonly practice: PracticeController | null;
  readonly read: ReadController | null;
  readonly releaseLiveInput: () => void;
  readonly repaintHeld: () => void;
  readonly runtimeErrorMessage: (value: unknown) => string;
  readonly runtimeErrorName: (value: unknown) => string;
  readonly saveAll: () => void;
  readonly SCORE_FOCUS: { owner: "analysis" | "read" | null; native: boolean; token: number; returnTo: HTMLElement | null; scroll: number; readOverride: boolean | null; zoom: number; };
  readonly scorePlayer: ScorePlayerController | null;
  readonly setBendFromValue: (value: number) => void;
  readonly STAGE: { on: boolean; kb: boolean | null; rz: number };
  readonly stageSync: () => void;
  readonly sustained: Set<number>;
  readonly t: (k: string, ...args: Array<string | number | null | undefined>) => string;
  readonly timedAudioReady: (context: AudioContext) => Promise<boolean>;
  readonly touchInput: (e: Event, fn: () => void) => void;
  typeOctave: number;
  readonly view: { low: number; oct: number; };
  readonly view0: () => string;
  readonly viewHigh: () => number;
}

/*
 * Devices and the installed app: the Web MIDI controller, latency calibration, Bluetooth MIDI, the offline copy and
 * install prompt, full screen, the screen wake lock, and the shared full-window score focus (Pieces and Read).
 */
export function createDevices(deps: DevicesDeps) {
  /* ---------- WEB MIDI ---------- */
  const midiController = createMidiController({
      t: deps.t,
      ensureAudio: deps.ensureAudio,
      audioLockCheck: deps.audioLockCheck,
      releaseLiveInput: deps.releaseLiveInput,
      panic: deps.panic,
      saveAll: () => deps.saveAll(),
      onNoteOn: (midi, velocity, source) => deps.handleNoteOn(midi, velocity, source),
      onNoteOff: (midi, source, releaseKind, silence) => deps.handleNoteOff(midi, source, releaseKind, silence),
      onPitchBend: (value) => deps.setBendFromValue(value),
      onModulation: (depth) => deps.audioEngine.setModulation(depth),
      onSustainChange: (dn) => {
          if (deps.view0() === 'analysis' && !calListening() && !deps.overlaysOpen()) deps.scorePlayer?.sustainInput(dn);
      },
      silenceNote: (midi) => deps.audioEngine.silenceNote(midi),
      getPedalDown: () => deps.pedalDown,
      setPedalDown: (dn) => { deps.pedalDown = dn; },
      pedalUp: deps.pedalUp,
      midiChannels: deps.midiChannels,
      midiSustainOwners: deps.midiSustainOwners,
      sustained: deps.sustained,
      held: deps.held,
      isBleCan: () => bleCan(),
      isBleLive: () => bleLive(),
      getBleName: () => bleName(),
      isDockShown: () => deps.dockShown(),
      onChipSync: () => {
          deps.read?.readySync();
          deps.scorePlayer?.syncPracticeLine();
          if (deps.STAGE.on || deps.practice?.sesActive()) deps.dockSync(); // a connected piano releases the keys a stage or drill opened
      },
      runtimeErrorName: deps.runtimeErrorName,
  });
  const {
      midiStatus, setMidi, midiChipSync, connectMidi, listInputs, refreshDeviceList,
      attachInput, autoReconnectMidi, onStateChange, onMidiMessage, midiIn, midiDispatch, midiNoteOff,
  } = midiController;
  /* ---------- TIMING CALIBRATION: tap with the click (Settings → MIDI keyboard → Timing) ---------- */
  function calRecord(): Record<string, unknown> { return deps.data; }
  useLatencyOffsets(() => calRecord().latency);
  const calController = createTimingCalibration({
      t: (key, ...args) => deps.t(key, ...args),
      ensureAudio: deps.ensureAudio,
      timedAudioReady: deps.timedAudioReady,
      scheduleClick: (when, accent) => deps.audioEngine.scheduleClick(when, accent),
      touchInput: deps.touchInput,
      getLatency: () => calRecord().latency,
      setLatency: (next) => { calRecord().latency = next; },
      clearLatency: () => { delete calRecord().latency; },
      saveAll: deps.saveAll,
  });
  const CAL = calController.state;
  const calLabel = calController.label;
  const initLatencyCalibration = calController.init;
  const calUi = calController.ui;
  const calListening = calController.listening;
  const calSay = calController.say;
  const calStart = calController.start;
  const calBeat = calController.beat;
  const calTap = calController.tap;
  const calStop = calController.stop;
  const calFinish = calController.finish;
  const calReset = calController.reset;
  /* ---------- BLUETOOTH MIDI: BLE-MIDI straight from the piano over Web Bluetooth ---------- */
  const bleController = createBleMidi({
      t: (key, ...args) => deps.t(key, ...args),
      midiChipSync,
      ensureAudio: deps.ensureAudio,
      saveAll: deps.saveAll,
      panic: deps.panic,
      srtEligibleFirstSightActive: () => !!deps.read?.firstSightActive(),
      midiIn,
      releaseBleChannels() {
          deps.midiChannels.delete('ble');
          for (const [midi, owner] of deps.midiSustainOwners) {
              if (owner.source === 'ble') deps.midiSustainOwners.delete(midi);
          }
          [...deps.inputOwners.entries()].forEach(([m, o]) => {
              if (o.has('ble')) deps.handleNoteOff(m, 'ble', 'reset');
          });
      },
      releaseSustainPedal() {
          if (deps.pedalDown) {
              deps.pedalDown = false;
              deps.pedalUp();
          }
      },
      resetBend() { deps.setBendFromValue(0); },
      resetModulation() { deps.audioEngine.setModulation(0); },
      runtimeErrorName: deps.runtimeErrorName,
      runtimeErrorMessage: deps.runtimeErrorMessage,
  });
  const BLE = bleController.state;
  const bleCan = bleController.can;
  const bleLive = bleController.live;
  const bleName = bleController.name;
  const bleSet = bleController.set;
  const bleUi = bleController.ui;
  const bleClick = bleController.click;
  const bleChoose = bleController.choose;
  const bleErr = bleController.err;
  const bleStale = bleController.stale;
  const bleOpen = bleController.open;
  const bleUnhook = bleController.unhook;
  const bleOnGone = bleController.onGone;
  const bleRetry = bleController.retry;
  const bleReconnect = bleController.reconnect;
  const bleDisconnect = bleController.disconnect;
  const bleReleaseInput = bleController.releaseInput;
  const bleAutoReconnect = bleController.autoReconnect;
  const bleParserReset = bleController.parserReset;
  const bleOnValue = bleController.onValue;
  const bleParse = bleController.parse;
  const bleStatus = bleController.status;
  const bleData = bleController.data;
  const bleMsg = bleController.msg;
  /* ---------- INSTALLED APP: offline copy, install prompt, full screen and screen wake lock ---------- */
  const pwaLifecycle = createPwaLifecycle({
      t: deps.t,
      saveAll: () => deps.saveAll(),
      runtimeErrorName: deps.runtimeErrorName,
  });
  const {
      PWA, WAKE, pwaStandalone, pwaInit, pwaRegister, pwaUi, pwaInstall,
      fsCan, fsUi, fsToggle,
      wakeCan, wakeGet, wakeOnGesture, wakeDrop, wakeSet, wakePing, wakeArm, wakeUi, wakeInit,
  } = pwaLifecycle;
  // Both score players share one expand action. Native fullscreen is optional;
  // ownership prevents leaving fullscreen opened independently in Settings.
  function scoreFocusUi() {
      for (const id of ['rd-fs', 'rd-top-fs']) {
          const button = maybeById(id);
          if (!button) continue;
          const on = deps.SCORE_FOCUS.owner === 'read';
          button.hidden = false;
          button.setAttribute('aria-pressed', String(on));
          button.setAttribute('aria-label', deps.t(on ? 'pc_stage_exit' : 'pc_stage'));
          button.title = deps.t(on ? 'pc_stage_exit' : 'pc_stage_t');
          button.textContent = id === 'rd-top-fs' ? '⛶' : '⛶ ' + deps.t(on ? 'pc_stage_exit' : 'pc_stage');
          button.setAttribute('aria-disabled', String(!deps.read?.hasPiece()));
      }
      const kb = maybeById('rd-focus-kb');
      kb?.setAttribute('aria-expanded', String(deps.dockOpen()));
      if (kb) { kb.textContent = deps.t(deps.dockOpen() ? 'kb_hide' : 'kb_show'); }
  }
  function readScoreZoom(value = deps.SCORE_FOCUS.zoom) {
      deps.SCORE_FOCUS.zoom = Math.round(Math.max(.7, Math.min(2, value)) * 10) / 10;
      const svg = deps.read?.svg();
      if (svg) svg.style.setProperty('zoom', String(deps.SCORE_FOCUS.zoom));
      const reset = maybeById('rd-focus-fit');
      if (reset) reset.textContent = deps.t('score_fit');
      buttonById('rd-focus-out').disabled = deps.SCORE_FOCUS.zoom <= .7;
      buttonById('rd-focus-in').disabled = deps.SCORE_FOCUS.zoom >= 2;
  }
  function rdFocusDispSet(open: boolean, focusBack = false) {
      const tools = maybeById('rd-focus-tools'), btn = maybeById('rd-focus-disp-btn');
      if (!tools || !btn) return;
      tools.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
          const first = queryHtml(tools, 'button:not(:disabled)');
          first?.focus({ preventScroll: true });
      } else if (focusBack) {
          btn.focus({ preventScroll: true });
      }
  }
  let scoreFocusPrevSide: boolean | null = null;
  function scoreFocusExit(quiet = false) {
      const owner = deps.SCORE_FOCUS.owner;
      if (!owner) return;
      rdFocusDispSet(false);
      const native = deps.SCORE_FOCUS.native, target = deps.SCORE_FOCUS.returnTo, scroll = deps.SCORE_FOCUS.scroll;
      deps.SCORE_FOCUS.owner = null; deps.SCORE_FOCUS.native = false; deps.SCORE_FOCUS.token++;
      delete document.body.dataset.scoreFocus;
      if (owner === 'analysis') {
          deps.scorePlayer?.setStage(false, true);
          if (scoreFocusPrevSide !== null) {
              const restoreSide = scoreFocusPrevSide;
              scoreFocusPrevSide = null;
              deps.scorePlayer?.setSide(restoreSide);
          }
      }
      else {
          deps.SCORE_FOCUS.readOverride = false;
          deps.read?.autoCancel();
          deps.stageSync();
      }
      if (native && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      scoreFocusUi();
      if (!quiet) requestAnimationFrame(() => {
          if (deps.SCORE_FOCUS.owner || deps.view0() !== owner) return;
          window.scrollTo(0, scroll);
          target?.focus({ preventScroll: true });
      });
  }
  function scoreFocusToggle(owner: 'analysis' | 'read', target: HTMLElement) {
      const on = owner === 'analysis' ? !!deps.scorePlayer?.stageOn() : deps.SCORE_FOCUS.owner === 'read';
      if (on) {
          if (deps.SCORE_FOCUS.owner) scoreFocusExit();
          else deps.scorePlayer?.setStage(false);
          return;
      }
      if (owner === 'analysis' ? !deps.scorePlayer?.hasNotes() : !deps.read?.hasPiece() || byId('rdp-pieces').hidden) return;
      scoreFocusEnter(owner, target);
  }
  function scoreFocusEnter(owner: 'analysis' | 'read', target: HTMLElement, manual = true) {
      document.body.dataset.scoreFocus = owner;
      deps.SCORE_FOCUS.owner = owner; deps.SCORE_FOCUS.returnTo = target; deps.SCORE_FOCUS.scroll = scrollY;
      const token = ++deps.SCORE_FOCUS.token;
      if (owner === 'analysis') {
          if (deps.scorePlayer) {
              scoreFocusPrevSide = deps.scorePlayer.sideOpen();
              deps.scorePlayer.setSide(false);
              deps.scorePlayer.closeSheet(true);
              deps.scorePlayer.setStage(true);
          }
      }
      else { deps.SCORE_FOCUS.readOverride = true; deps.stageSync(); }
      scoreFocusUi();
      if (manual && owner === 'read') byId('rd-top-fs').focus({ preventScroll: true });
      if (manual && fsCan() && !document.fullscreenElement) {
          deps.SCORE_FOCUS.native = true;
          void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => {
              if (token !== deps.SCORE_FOCUS.token && document.fullscreenElement) {
                  // A quick exit/re-entry adopts the pending request; a cancelled session releases it.
                  if (deps.SCORE_FOCUS.owner) deps.SCORE_FOCUS.native = true;
                  else void document.exitFullscreen().catch(() => {});
              }
          }).catch(() => { if (token === deps.SCORE_FOCUS.token) deps.SCORE_FOCUS.native = false; });
      }
  }
  function scoreFocusFullscreenChanged() {
      if (deps.SCORE_FOCUS.native && !document.fullscreenElement) scoreFocusExit();
      fsUi(); scoreFocusUi();
  }
  /* computer keyboard */
  // Notes and Z / X follow physical key positions (KeyboardEvent.code), so QWERTZ, AZERTY… keep the piano shape; shortcuts stay on letters.
  const KEYMAP: Record<string, number> = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12 };
  const typingDown = new Map<string, number>();
  function shiftTypeOctave(dir: number) { releaseTypingKeys(); const next = deps.typeOctave + dir * 12, minLow = deps.BASE_LOW, maxLow = Math.max(deps.BASE_LOW, deps.BASE_HIGH - deps.view.oct * 12); if (dir < 0) {
      if (next < deps.view.low && deps.view.low > minLow) {
          deps.view.low = Math.max(minLow, deps.view.low - 12);
          deps.buildKeyboard();
          deps.repaintHeld();
      }
  }
  else if (dir > 0) {
      if (next + 12 > deps.viewHigh() && deps.view.low < maxLow) {
          deps.view.low = Math.min(maxLow, deps.view.low + 12);
          deps.buildKeyboard();
          deps.repaintHeld();
      }
  } deps.typeOctave = next; deps.clampTypeOctave(); }
  function physKey(e: KeyboardEvent) { return e.code || (/^[a-z]$/i.test(e.key || '') ? 'Key' + e.key.toUpperCase() : ''); }
   // some synthetic and virtual-keyboard events carry no code
  // Name those physical keys as the user's layout prints them (Keyboard Map API, Chromium); elsewhere the QWERTY names stay.
  function kbdLayoutLabels() {
      const kb = (navigator).keyboard;
      if (!kb || typeof kb.getLayoutMap !== 'function')
          return;
      try {
          kb.getLayoutMap().then((map) => queryAllHtml(document, 'kbd[data-codes]').forEach((el) => {
              const ks = (el.dataset.codes ?? '').split(' ').map((c) => map.get(c));
              if (ks.every((x) => typeof x === 'string' && x.trim()))
                  el.textContent = ks.map((x) => String(x).toUpperCase()).join(el.dataset.sep || ' ');
          })).catch(() => { });
      }
      catch (_) { }
  }
  function releaseTypingKeys() { typingDown.forEach((m, k) => deps.handleNoteOff(m, 'typing:' + k)); typingDown.clear(); }
  function inField() { const a = document.activeElement; return a && (/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) || (a instanceof HTMLElement && a.isContentEditable)); }
  document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt') {
          releaseTypingKeys();
          return;
      }
      if ((e.key !== 'Escape' && inField()) || byId('drawer').classList.contains('on') || byId('helpBox').classList.contains('on') || byId('appDialog').classList.contains('on') || !byId('mobileMenu').hidden || e.repeat)
          return;
      const k = e.key.toLowerCase();
      if (e.key === '?') {
          e.preventDefault();
          deps.openHelp(!byId('helpBox').classList.contains('on'));
          return;
      }
      if (deps.read?.key(e, k))
          return;
      if (deps.practice?.sessionKey(k, e)) // session shortcuts: digits pick an answer, R replays, N advances
          return;
      if (deps.view0() === 'analysis' && deps.scorePlayer?.hasNotes() && /^[lpmc]$/.test(k))
          return; // score shortcuts keep their letters wherever the layout puts them
      const c = physKey(e);
      if (c === 'KeyZ') {
          e.preventDefault();
          shiftTypeOctave(-1);
          return;
      }
      if (c === 'KeyX') {
          e.preventDefault();
          shiftTypeOctave(1);
          return;
      }
      if (c in KEYMAP) {
          const m = deps.typeOctave + KEYMAP[c];
          if (!typingDown.has(c)) {
              e.preventDefault();
              typingDown.set(c, m);
              deps.handleNoteOn(m, 100, 'typing:' + c);
          }
      }
  });
  document.addEventListener('keyup', (e) => { const c = physKey(e), m = typingDown.get(c); if (m !== undefined) {
      typingDown.delete(c);
      deps.handleNoteOff(m, 'typing:' + c);
  } });

  return {
    midiController,
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
    calRecord,
    calController,
    CAL,
    calLabel,
    initLatencyCalibration,
    calUi,
    calListening,
    calSay,
    calStart,
    calBeat,
    calTap,
    calStop,
    calFinish,
    calReset,
    bleController,
    BLE,
    bleCan,
    bleLive,
    bleName,
    bleSet,
    bleUi,
    bleClick,
    bleChoose,
    bleErr,
    bleStale,
    bleOpen,
    bleUnhook,
    bleOnGone,
    bleRetry,
    bleReconnect,
    bleDisconnect,
    bleReleaseInput,
    bleAutoReconnect,
    bleParserReset,
    bleOnValue,
    bleParse,
    bleStatus,
    bleData,
    bleMsg,
    pwaLifecycle,
    PWA,
    WAKE,
    pwaStandalone,
    pwaInit,
    pwaRegister,
    pwaUi,
    pwaInstall,
    fsCan,
    fsUi,
    fsToggle,
    wakeCan,
    wakeGet,
    wakeOnGesture,
    wakeDrop,
    wakeSet,
    wakePing,
    wakeArm,
    wakeUi,
    wakeInit,
    scoreFocusUi,
    readScoreZoom,
    rdFocusDispSet,
    get scoreFocusPrevSide() { return scoreFocusPrevSide; },
    set scoreFocusPrevSide(value: typeof scoreFocusPrevSide) { scoreFocusPrevSide = value; },
    scoreFocusExit,
    scoreFocusToggle,
    scoreFocusEnter,
    scoreFocusFullscreenChanged,
    KEYMAP,
    typingDown,
    shiftTypeOctave,
    physKey,
    kbdLayoutLabels,
    releaseTypingKeys,
    inField,
  };
}

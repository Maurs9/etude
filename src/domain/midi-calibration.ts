import { byId as defaultById, buttonById as defaultButtonById } from './dom.js';
import {
  CALIBRATION_BPM,
  calibrationOffset,
  inputEventTime as defaultInputEventTime,
  inputSource as defaultInputSource,
  readLatencyOffsets,
  type InputSource,
  type LatencyOffsets,
} from './midi-timing.js';

/** Calibration timing constants and eligible input sources (Settings -> MIDI keyboard -> Timing). */
export const CAL_BEATS = 12;
export const CAL_COUNT_IN = 4;
export const CAL_SOURCES: readonly InputSource[] = ['touch', 'usb', 'ble'];

export interface TimingCalibration {
  on: boolean;
  generation: number;
  clicks: number[];
  taps: { src: InputSource; t: number }[];
  timers: number[];
  nodes: OscillatorNode[];
}

export interface TimingCalibrationClick {
  readonly oscs?: readonly OscillatorNode[];
}

export interface TimingCalibrationHost {
  t(key: string, ...args: (string | number)[]): string;
  ensureAudio(warm?: boolean): AudioContext | null;
  timedAudioReady(context: AudioContext): Promise<boolean>;
  scheduleClick(when: number, accent: boolean): TimingCalibrationClick | null;
  touchInput(event: Event, fn: () => void): void;
  getLatency(): unknown;
  setLatency(offsets: LatencyOffsets): void;
  clearLatency(): void;
  saveAll(): void;
  byId?: (id: string) => HTMLElement;
  buttonById?: (id: string) => HTMLButtonElement;
  isOpen?: () => boolean;
  inputSource?: () => InputSource | null;
  inputEventTime?: () => number;
  now?: () => number;
  setTimeout?: (cb: () => void, ms: number) => number;
  clearTimeout?: (id: number) => void;
}

export interface TimingCalibrationController {
  readonly state: TimingCalibration;
  label(src: InputSource): string;
  init(): void;
  ui(): void;
  listening(): boolean;
  say(text: string): void;
  start(): Promise<void>;
  beat(b: number): void;
  tap(): void;
  stop(): void;
  finish(): void;
  reset(): void;
}

/**
 * Creates the Timing Calibration wizard controller.
 * A bar of count-in is followed by twelve slow clicks; each tap's calibrated hardware clock time
 * is paired with its nearest beat and stored per source (`touch`, `usb`, `ble`).
 */
export function createTimingCalibration(host: TimingCalibrationHost): TimingCalibrationController {
  const byId = host.byId ?? defaultById;
  const buttonById = host.buttonById ?? defaultButtonById;
  const inputSource = host.inputSource ?? defaultInputSource;
  const inputEventTime = host.inputEventTime ?? defaultInputEventTime;
  const now = host.now ?? (() => performance.now());
  const setTimer = host.setTimeout ?? ((cb, ms) => window.setTimeout(cb, ms));
  const clearTimer = host.clearTimeout ?? ((id) => clearTimeout(id));
  const isOpen = host.isOpen ?? (() => byId('drawer').classList.contains('on') && !byId('lat-panel').hidden);

  const state: TimingCalibration = {
    on: false,
    generation: 0,
    clicks: [],
    taps: [],
    timers: [],
    nodes: [],
  };

  function label(src: InputSource): string {
    return host.t('lat_' + src);
  }

  function say(text: string): void {
    byId('lat-result').textContent = text;
  }

  function ui(): void {
    const o = readLatencyOffsets(host.getLatency());
    CAL_SOURCES.forEach((src) => {
      byId('lat-v-' + src).textContent = String(o[src]);
    });
    const go = buttonById('lat-go');
    go.dataset.i18n = state.on ? 'lat_stop' : 'lat_start';
    go.textContent = host.t(go.dataset.i18n);
    buttonById('lat-reset').disabled = state.on;
    byId('lat-pad').classList.toggle('on', state.on);
  }

  function stop(): void {
    state.generation++;
    state.timers.forEach((id) => clearTimer(id));
    state.timers = [];
    state.nodes.forEach((n) => {
      try {
        n.stop();
      } catch {
        // Ignore already-stopped oscillator nodes when halting calibration early.
      }
    });
    state.nodes = [];
    state.on = false;
    byId('lat-pad').classList.remove('beat');
    ui();
  }

  // A run listens only while its panel shows in the open Settings drawer: closing either ends it, and input goes to the page again.
  function listening(): boolean {
    if (!state.on) return false;
    if (isOpen()) return true;
    stop();
    say('');
    return false;
  }

  function beat(b: number): void {
    const pad = byId('lat-pad');
    pad.classList.remove('beat');
    void pad.offsetWidth;
    pad.classList.add('beat');
    say(b < CAL_COUNT_IN ? host.t('lat_countin') : host.t('lat_beat', b - CAL_COUNT_IN + 1, CAL_BEATS));
  }

  function tap(): void {
    const src = inputSource();
    if (state.on && state.clicks.length && src) {
      state.taps.push({ src, t: inputEventTime() });
    }
  }

  function finish(): void {
    stop(); // its timers and clicks are spent; this clears them and the running state
    const bs = 60000 / CALIBRATION_BPM;
    const next: LatencyOffsets = readLatencyOffsets(host.getLatency());
    const said: string[] = [];
    let changed = false;
    CAL_SOURCES.forEach((src) => {
      const taps = state.taps.filter((x) => x.src === src).map((x) => x.t);
      if (!taps.length) return;
      const r = calibrationOffset(taps, state.clicks, bs);
      if (r.ok) {
        next[src] = r.offset;
        changed = true;
        said.push(host.t('lat_set', label(src), r.offset));
      } else {
        said.push(host.t(r.reason === 'few' ? 'lat_few' : 'lat_uneven', label(src)));
      }
    });
    if (changed) {
      host.setLatency(next);
      host.saveAll();
    }
    say(said.length ? said.join(' · ') : host.t('lat_none'));
    ui();
  }

  async function start(): Promise<void> {
    const context = host.ensureAudio();
    if (!context) return;
    stop();
    const generation = state.generation;
    state.on = true;
    state.taps = [];
    state.clicks = [];
    ui();
    if (context.state !== 'running') {
      const ready = await host.timedAudioReady(context);
      if (generation !== state.generation) return;
      if (!ready) {
        stop();
        say(host.t('audio_locked'));
        return;
      }
    }
    const bs = 60 / CALIBRATION_BPM;
    const lead = 0.3;
    const act0 = context.currentTime + lead;
    const perf0 = now() + lead * 1000;
    for (let b = 0; b < CAL_COUNT_IN + CAL_BEATS; b++) {
      const click = host.scheduleClick(act0 + b * bs, b % 4 === 0);
      if (click?.oscs) state.nodes.push(...click.oscs);
      if (b >= CAL_COUNT_IN) state.clicks.push(perf0 + b * bs * 1000);
      state.timers.push(setTimer(() => beat(b), lead * 1000 + b * bs * 1000));
    }
    state.timers.push(setTimer(finish, lead * 1000 + (CAL_COUNT_IN + CAL_BEATS) * bs * 1000));
    say(host.t('lat_countin'));
  }

  function reset(): void {
    stop();
    host.clearLatency();
    host.saveAll();
    say(host.t('lat_cleared'));
    ui();
  }

  function init(): void {
    const open = buttonById('set-lat');
    const panel = byId('lat-panel');
    open.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      open.setAttribute('aria-expanded', String(!panel.hidden));
      if (panel.hidden) stop();
    });
    buttonById('lat-go').addEventListener('click', () => {
      if (state.on) stop();
      else void start();
    });
    buttonById('lat-reset').addEventListener('click', reset);
    byId('lat-pad').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      host.touchInput(e, tap);
    });
    ui();
  }

  return {
    state,
    label,
    init,
    ui,
    listening,
    say,
    start,
    beat,
    tap,
    stop,
    finish,
    reset,
  };
}

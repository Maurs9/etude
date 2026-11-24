import { byId as defaultById, buttonById as defaultButtonById } from './dom.js';
import { BleClock, bleTimestamps, eventTime } from './midi-timing.js';

/** Web Bluetooth service and characteristic UUIDs for BLE-MIDI 1.0. */
export const BLE_MIDI_SVC = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
export const BLE_MIDI_CHR = '7772e5db-3868-4112-a1a9-f2669d106bf3';
export const BLE_RETRY_MS: readonly number[] = [500, 1000, 2000, 4000, 8000, 15000, 30000];

export interface BleValueEvent {
  readonly target: BleMidiCharacteristic;
  readonly timeStamp?: number;
}

export interface BleMidiCharacteristic {
  readonly value?: DataView;
  startNotifications(): Promise<unknown>;
  stopNotifications(): Promise<unknown>;
  addEventListener(type: 'characteristicvaluechanged', listener: (event: BleValueEvent) => void): void;
  removeEventListener(type: 'characteristicvaluechanged', listener: (event: BleValueEvent) => void): void;
}

export interface BleGattServer {
  getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<BleMidiCharacteristic> }>;
}

export interface BleDisconnectEvent {
  readonly target: BleMidiDevice | null;
}

export interface BleMidiDevice {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: {
    readonly connected: boolean;
    connect(): Promise<BleGattServer>;
    disconnect(): void;
  };
  addEventListener(type: 'gattserverdisconnected', listener: (event: BleDisconnectEvent) => void): void;
  removeEventListener(type: 'gattserverdisconnected', listener: (event: BleDisconnectEvent) => void): void;
}

export interface BleBluetoothAdapter {
  requestDevice(options?: Record<string, unknown>): Promise<BleMidiDevice>;
  getDevices?(): Promise<BleMidiDevice[]>;
}

export interface BleMidiSavedDevice {
  id: string;
  name: string;
  auto: boolean;
}

export interface BleMidiState {
  dev: BleMidiDevice | null;
  chr: BleMidiCharacteristic | null;
  busy: boolean;
  want: boolean;
  gen: number;
  tries: number;
  retryT: number;
  guardT: number;
  msg: string | null;
  cls: string;
  arg: string | null;
  saved: BleMidiSavedDevice | null;
  run: number;
  need: number;
  n: number;
  d1: number;
  skip: number;
  sysex: boolean;
  pedal: boolean;
  bend: boolean;
  mod: boolean;
  clock: BleClock;
  at: number;
}

export interface BleMidiHost {
  t(key: string, ...args: (string | number)[]): string;
  midiChipSync(): void;
  ensureAudio(warm?: boolean): AudioContext | null;
  saveAll(): void;
  panic(): void;
  srtEligibleFirstSightActive(): boolean;
  midiIn(status: number, data1: number, data2: number, src: string, at: number): void;
  releaseBleChannels(): void;
  releaseSustainPedal(): void;
  resetBend(): void;
  resetModulation(): void;
  runtimeErrorName(err: unknown): string;
  runtimeErrorMessage(err: unknown): string;
  byId?: (id: string) => HTMLElement;
  buttonById?: (id: string) => HTMLButtonElement;
  getBluetooth?: () => BleBluetoothAdapter | undefined;
  isSecureContext?: () => boolean;
  now?: () => number;
  setTimeout?: (cb: () => void, ms: number) => number;
  clearTimeout?: (id: number) => void;
}

export interface BleMidiController {
  readonly state: BleMidiState;
  can(): boolean;
  live(): boolean;
  name(): string;
  set(key: string | null, cls?: string, arg?: string | null): void;
  ui(): void;
  click(): void;
  choose(): Promise<void>;
  err(err: unknown, quiet?: boolean): void;
  stale(gen: number, dev: BleMidiDevice): boolean;
  open(dev: BleMidiDevice, retrying: boolean, quiet?: boolean): Promise<void>;
  unhook(): void;
  onGone(e: BleDisconnectEvent): void;
  retry(): void;
  reconnect(): void;
  disconnect(keepMsg?: boolean): void;
  releaseInput(): void;
  autoReconnect(): Promise<void>;
  parserReset(): void;
  onValue(e: BleValueEvent): void;
  parse(packet: Uint8Array, arrival?: number): void;
  status(b: number): void;
  data(b: number): void;
  msg(st: number, d1: number, d2: number): void;
}

/**
 * Creates the BLE-MIDI controller (`Web Bluetooth` transport + BLE-MIDI packet parser).
 * Notifications are decoded and forwarded synchronously into `host.midiIn` in the arrival turn
 * while `BleClock` removes radio connection-interval jitter from timestamps.
 */
export function createBleMidi(host: BleMidiHost): BleMidiController {
  const byId = host.byId ?? defaultById;
  const buttonById = host.buttonById ?? defaultButtonById;
  const getBluetooth = host.getBluetooth ?? (() => navigator.bluetooth);
  const isSecureContext = host.isSecureContext ?? (() => window.isSecureContext);
  const now = host.now ?? (() => performance.now());
  const setTimer = host.setTimeout ?? ((cb, ms) => window.setTimeout(cb, ms));
  const clearTimer = host.clearTimeout ?? ((id) => clearTimeout(id));

  const state: BleMidiState = {
    dev: null,
    chr: null,
    busy: false,
    want: false,
    gen: 0,
    tries: 0,
    retryT: 0,
    guardT: 0,
    msg: null,
    cls: '',
    arg: null,
    saved: null,
    run: 0,
    need: 0,
    n: 0,
    d1: 0,
    skip: 0,
    sysex: false,
    pedal: false,
    bend: false,
    mod: false,
    clock: new BleClock(),
    at: 0,
  };

  function can(): boolean {
    return !!getBluetooth()?.requestDevice;
  }

  function live(): boolean {
    return !!(state.chr && state.dev && state.dev.gatt && state.dev.gatt.connected);
  }

  function name(): string {
    return (state.dev && state.dev.name) || (state.saved && state.saved.name) || host.t('ble_dev');
  }

  function ui(): void {
    host.midiChipSync();
    const st = byId('set-ble-status');
    const b = buttonById('set-ble');
    const re = byId('set-ble-re');
    if (!st || !b) return;
    const isLive = live();
    const key = state.msg || (can() ? (state.dev && !isLive ? 'ble_known' : 'ble_off') : 'ble_unsupported');
    st.textContent = host.t(key, state.msg && state.arg != null ? state.arg : name());
    st.dataset.s = isLive ? 'on' : (state.msg ? state.cls : (can() ? '' : 'err'));
    b.textContent = host.t(isLive ? 'ble_disconnect' : state.busy ? 'ble_cancel_btn' : 'ble_connect');
    b.disabled = !can();
    re.hidden = !(state.dev && !isLive && !state.busy);
  }

  function set(key: string | null, cls?: string, arg?: string | null): void {
    state.msg = key;
    state.cls = cls || '';
    state.arg = arg == null ? null : arg;
    ui();
  }

  function err(error: unknown, quiet?: boolean): void {
    const errName = host.runtimeErrorName(error);
    const errMsg = error instanceof Error ? error.message : '';
    console.warn('Bluetooth MIDI:', error);
    if (errName === 'NotFoundError' && /cancel/i.test(errMsg)) set('ble_cancel');
    else if (errName === 'NotAllowedError' || /permission|denied/i.test(errMsg)) set('ble_denied', 'err');
    else if (errName === 'SecurityError' || /blocked/i.test(errMsg)) set('ble_blocked', 'err');
    else if (errName === 'NotSupportedError') set('ble_unsupported', 'err');
    else if (/adapter|turned off|not available|unavailable/i.test(errMsg)) set('ble_adapter', 'err');
    else if (errName === 'NotFoundError' && /service|characteristic/i.test(errMsg)) set('ble_nomidi', 'err');
    else if (quiet) set('ble_known');
    else set('ble_failed', 'err', errName || errMsg || '?');
  }

  // A superseded attempt (user pressed Disconnect, or picked another piano) closes the link it opened unless it is wanted again.
  function stale(gen: number, dev: BleMidiDevice): boolean {
    if (gen === state.gen) return false;
    if (!state.want || state.dev !== dev) {
      try {
        dev.gatt?.disconnect();
      } catch {
        // Ignore GATT errors when closing a superseded device attempt.
      }
    }
    return true;
  }

  function unhook(): void {
    if (state.chr) state.chr.removeEventListener('characteristicvaluechanged', onValue);
    state.chr = null;
  }

  function parserReset(): void {
    state.run = 0;
    state.need = 0;
    state.n = 0;
    state.skip = 0;
    state.sysex = false;
    state.clock.reset();
  }

  function releaseInput(): void {
    host.releaseBleChannels();
    if (state.pedal) host.releaseSustainPedal();
    if (state.bend) host.resetBend();
    if (state.mod) host.resetModulation();
    state.pedal = state.bend = state.mod = false;
    parserReset();
  }

  function disconnect(keepMsg?: boolean): void {
    const chr = state.chr;
    const dev = state.dev;
    dev?.removeEventListener('gattserverdisconnected', onGone);
    if (chr && host.srtEligibleFirstSightActive()) host.panic();
    state.want = false;
    state.gen++;
    state.busy = false;
    clearTimer(state.retryT);
    clearTimer(state.guardT);
    unhook();
    releaseInput();
    if (state.saved) {
      state.saved.auto = false;
      host.saveAll();
    }
    if (chr) chr.stopNotifications().catch(() => {});
    if (dev && dev.gatt && dev.gatt.connected) {
      try {
        dev.gatt.disconnect();
      } catch {
        // Ignore GATT errors when disconnecting intentionally.
      }
    }
    if (!keepMsg) set('ble_off');
  }

  function retry(): void {
    const dev = state.dev;
    if (!dev || !state.want) return;
    if (state.tries >= BLE_RETRY_MS.length) {
      state.want = false;
      set('ble_gone', 'err');
      return;
    }
    const wait = BLE_RETRY_MS[state.tries++];
    set('ble_lost', 'err');
    clearTimer(state.retryT);
    state.retryT = setTimer(() => {
      if (state.want && state.dev === dev && !live()) void open(dev, true);
    }, wait);
  }

  function onGone(e: BleDisconnectEvent): void {
    if (e.target !== state.dev) return;
    const was = !!state.chr;
    unhook();
    if (was && host.srtEligibleFirstSightActive()) host.panic();
    releaseInput();
    if (state.busy) return; // a connect in flight reports its own failure
    if (state.want && was) {
      state.tries = 0;
      retry();
    } else {
      ui();
    }
  }

  async function open(dev: BleMidiDevice, retrying: boolean, quiet?: boolean): Promise<void> {
    if (state.busy && state.dev === dev) return;
    if (state.dev && state.dev !== dev) disconnect(true); // switching pianos: drop the old link first
    clearTimer(state.retryT);
    state.dev = dev;
    state.want = true;
    state.busy = true;
    const gen = ++state.gen;
    dev.removeEventListener('gattserverdisconnected', onGone);
    dev.addEventListener('gattserverdisconnected', onGone);
    if (!retrying) set('ble_connecting');
    else ui();
    // gatt.connect() can wait a long time for a piano that is off; give up after 15 s so the button never hangs.
    clearTimer(state.guardT);
    state.guardT = setTimer(() => {
      if (state.busy && state.gen === gen) {
        state.gen++;
        state.busy = false;
        unhook();
        try {
          dev.gatt?.disconnect();
        } catch {
          // Ignore timeout cleanup disconnect failures.
        }
        if (retrying && state.want) retry();
        else {
          state.want = false;
          set(quiet ? 'ble_known' : 'ble_unreach', quiet ? '' : 'err');
        }
      }
    }, 15000);
    try {
      if (!dev.gatt) throw new TypeError('Bluetooth device has no GATT server');
      const server = await dev.gatt.connect();
      if (stale(gen, dev)) return;
      const svc = await server.getPrimaryService(BLE_MIDI_SVC);
      const chr = await svc.getCharacteristic(BLE_MIDI_CHR);
      if (stale(gen, dev)) return;
      chr.removeEventListener('characteristicvaluechanged', onValue);
      chr.addEventListener('characteristicvaluechanged', onValue);
      parserReset();
      state.chr = chr;
      await chr.startNotifications();
      if (stale(gen, dev)) {
        chr.removeEventListener('characteristicvaluechanged', onValue);
        return;
      }
      clearTimer(state.guardT);
      state.busy = false;
      state.tries = 0;
      state.saved = { id: dev.id, name: dev.name || '', auto: true };
      host.saveAll();
      set('ble_on', 'on');
    } catch (error) {
      if (gen !== state.gen) return;
      clearTimer(state.guardT);
      state.busy = false;
      unhook();
      if (host.runtimeErrorName(error) === 'NotFoundError' && /service|characteristic/i.test(host.runtimeErrorMessage(error))) {
        state.want = false;
        try {
          dev.gatt?.disconnect();
        } catch {
          // Ignore disconnect errors when characteristic discovery fails.
        }
        set('ble_nomidi', 'err');
        return;
      }
      if (retrying && state.want) {
        retry();
        return;
      }
      state.want = false;
      err(error, quiet);
    }
  }

  async function choose(): Promise<void> {
    const bluetooth = getBluetooth();
    if (!can() || !bluetooth) {
      set('ble_unsupported', 'err');
      return;
    }
    if (!isSecureContext()) {
      set('ble_insecure', 'err');
      return;
    }
    let req: Promise<BleMidiDevice>;
    try {
      req = bluetooth.requestDevice({
        filters: [
          { services: [BLE_MIDI_SVC] },
          ...['ES120', 'ES110', 'ES520', 'ES920', 'KAWAI', 'Kawai'].map((namePrefix) => ({ namePrefix })),
        ],
        optionalServices: [BLE_MIDI_SVC],
      });
    } catch (error) {
      err(error);
      return;
    }
    host.ensureAudio();
    set('ble_choose');
    let dev: BleMidiDevice;
    try {
      dev = await req;
    } catch (error) {
      err(error);
      return;
    }
    state.tries = 0;
    await open(dev, false);
  }

  function click(): void {
    if (live() || state.busy) {
      disconnect();
      return;
    }
    void choose();
  }

  function reconnect(): void {
    const dev = state.dev;
    if (!dev || live() || state.busy) return;
    host.ensureAudio();
    state.tries = 0;
    void open(dev, false);
  }

  async function autoReconnect(): Promise<void> {
    const s = state.saved;
    const bluetooth = getBluetooth();
    if (!s || !can() || !isSecureContext() || !bluetooth || !bluetooth.getDevices) return;
    try {
      const dev = (await bluetooth.getDevices()).find((d) => d.id === s.id);
      if (!dev || state.dev) return;
      state.dev = dev;
      ui();
      if (s.auto) await open(dev, false, true);
    } catch (error) {
      console.warn('Bluetooth MIDI:', error);
    }
  }

  function msg(st: number, d1: number, d2: number): void {
    const cmd = st & 0xf0;
    if (cmd === 0xb0) {
      if (d1 === 64) state.pedal = d2 >= 64;
      else if (d1 === 1) state.mod = d2 > 0;
    } else if (cmd === 0xe0) {
      state.bend = ((d2 << 7) | d1) !== 8192;
    }
    host.midiIn(st, d1, d2, 'ble', state.at);
  }

  function status(b: number): void {
    if (b >= 0xf8) return; // real-time (clock, active sensing…): ignored, running status kept
    if (b === 0xf0) {
      state.sysex = true;
      state.run = 0;
      state.n = 0;
      return;
    }
    if (b === 0xf7) {
      state.sysex = false;
      return;
    }
    state.sysex = false;
    state.n = 0;
    if (b > 0xf0) {
      state.run = 0;
      state.skip = b === 0xf2 ? 2 : (b === 0xf1 || b === 0xf3) ? 1 : 0;
      return;
    } // system common: skip its data, cancel running status
    state.run = b;
    state.skip = 0;
    state.need = ((b & 0xf0) === 0xc0 || (b & 0xf0) === 0xd0) ? 1 : 2;
  }

  function data(b: number): void {
    if (state.sysex) return;
    if (!state.run) {
      if (state.skip) state.skip--;
      return;
    }
    if (state.n === 0) {
      if (state.need === 1) {
        msg(state.run, b, 0);
        return;
      }
      state.d1 = b;
      state.n = 1;
      return;
    }
    state.n = 0;
    msg(state.run, state.d1, b);
  }

  /**
   * Decodes one BLE-MIDI packet `[header 10hhhhhh] ...`: a set bit 7 directly following a
   * timestamp is a status byte; any other set bit 7 is the next timestamp.
   */
  function parse(packet: Uint8Array, arrival = now()): void {
    if ((packet[0] & 0xc0) !== 0x80) return;
    state.run = state.need = state.n = state.skip = 0;
    const stamps = bleTimestamps(packet);
    stamps.forEach((ms) => state.clock.observe(ms, arrival));
    state.at = arrival;
    let ts = false;
    for (let i = 1; i < packet.length; i++) {
      const b = packet[i];
      if (b & 0x80) {
        if (!ts) {
          ts = true;
          const ms = stamps.get(i);
          if (ms != null) state.at = state.clock.map(ms, arrival);
          continue;
        }
        ts = false;
        status(b);
      } else {
        ts = false;
        data(b);
      }
    }
  }

  function onValue(e: BleValueEvent): void {
    const v = e.target.value;
    if (v && v.byteLength > 1) {
      parse(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), eventTime(e.timeStamp, now()));
    }
  }

  return {
    state,
    can,
    live,
    name,
    set,
    ui,
    click,
    choose,
    err,
    stale,
    open,
    unhook,
    onGone,
    retry,
    reconnect,
    disconnect,
    releaseInput,
    autoReconnect,
    parserReset,
    onValue,
    parse,
    status,
    data,
    msg,
  };
}

import { describe, expect, it, vi } from 'vitest';
import {
  CAL_BEATS,
  CAL_COUNT_IN,
  createTimingCalibration,
} from '../../src/domain/midi-calibration.ts';
import { CALIBRATION_BPM } from '../../src/domain/midi-timing.ts';

function fakeDom() {
  const elements = new Map();
  const makeEl = (id, tag = 'div') => {
    const classes = new Set();
    const listeners = new Map();
    const el = {
      id,
      tagName: tag.toUpperCase(),
      hidden: false,
      disabled: false,
      textContent: '',
      offsetWidth: 100,
      dataset: {},
      classList: {
        add: (...names) => names.forEach((n) => classes.add(n)),
        remove: (...names) => names.forEach((n) => classes.delete(n)),
        toggle: (name, force) => {
          const on = force !== undefined ? Boolean(force) : !classes.has(name);
          if (on) classes.add(name);
          else classes.delete(name);
          return on;
        },
        contains: (name) => classes.has(name),
      },
      setAttribute: vi.fn(),
      addEventListener: (type, fn) => listeners.set(type, fn),
      trigger: (type, ev = { preventDefault() {} }) => listeners.get(type)?.(ev),
    };
    elements.set(id, el);
    return el;
  };
  ['lat-v-touch', 'lat-v-usb', 'lat-v-ble', 'lat-result', 'lat-pad', 'lat-panel', 'drawer'].forEach((id) => makeEl(id));
  ['set-lat', 'lat-go', 'lat-reset'].forEach((id) => makeEl(id, 'button'));
  return {
    elements,
    byId: (id) => elements.get(id),
    buttonById: (id) => elements.get(id),
  };
}

describe('timing calibration controller', () => {
  it('computes median latency offsets per input source and saves calibration', () => {
    const dom = fakeDom();
    let latency = undefined;
    let open = true;
    let currentSrc = 'usb';
    let currentTapTime = 0;
    const saveAll = vi.fn();

    const cal = createTimingCalibration({
      t: (key, ...args) => `${key}:${args.join(',')}`,
      ensureAudio: () => ({ state: 'running', currentTime: 10 }),
      timedAudioReady: async () => true,
      scheduleClick: () => null,
      touchInput: (_e, fn) => fn(),
      getLatency: () => latency,
      setLatency: (next) => {
        latency = next;
      },
      clearLatency: () => {
        latency = undefined;
      },
      saveAll,
      byId: dom.byId,
      buttonById: dom.buttonById,
      isOpen: () => open,
      inputSource: () => currentSrc,
      inputEventTime: () => currentTapTime,
    });

    cal.state.on = true;
    const bs = 60000 / CALIBRATION_BPM;
    cal.state.clicks = Array.from({ length: CAL_BEATS }, (_, i) => 1000 + i * bs);
    // Simulate consistent +24 ms USB lag and +12 ms touch lag.
    for (let i = 0; i < 6; i++) {
      currentSrc = 'usb';
      currentTapTime = cal.state.clicks[i] + 24;
      cal.tap();
      currentSrc = 'touch';
      currentTapTime = cal.state.clicks[i] + 12;
      cal.tap();
    }

    cal.finish();
    expect(cal.state.on).toBe(false);
    expect(saveAll).toHaveBeenCalledTimes(1);
    expect(latency).toEqual({ touch: 12, usb: 24, ble: 0 });
    expect(dom.byId('lat-v-usb').textContent).toBe('24');
    expect(dom.byId('lat-v-touch').textContent).toBe('12');

    // Reset clears saved latency and updates UI.
    cal.reset();
    expect(latency).toBeUndefined();
    expect(saveAll).toHaveBeenCalledTimes(2);
    expect(dom.byId('lat-result').textContent).toBe('lat_cleared:');

    // Closing the drawer stops listening automatically.
    cal.state.on = true;
    expect(cal.listening()).toBe(true);
    open = false;
    expect(cal.listening()).toBe(false);
    expect(cal.state.on).toBe(false);
  });

  it('aborts scheduled calibration clicks if audio unlock fails or stop is called before resolution', async () => {
    const dom = fakeDom();
    let resolveReady;
    const scheduleClick = vi.fn();
    const timers = [];

    const cal = createTimingCalibration({
      t: (key) => key,
      ensureAudio: () => ({ state: 'suspended', currentTime: 0 }),
      timedAudioReady: () => new Promise((r) => { resolveReady = r; }),
      scheduleClick,
      touchInput: (_e, fn) => fn(),
      getLatency: () => undefined,
      setLatency: () => {},
      clearLatency: () => {},
      saveAll: () => {},
      byId: dom.byId,
      buttonById: dom.buttonById,
      isOpen: () => true,
      setTimeout: (cb, ms) => {
        timers.push({ cb, ms });
        return timers.length;
      },
      clearTimeout: () => {},
    });

    const p1 = cal.start();
    expect(cal.state.on).toBe(true);
    cal.stop();
    resolveReady(true);
    await p1;
    expect(scheduleClick).not.toHaveBeenCalled();

    const p2 = cal.start();
    resolveReady(false);
    await p2;
    expect(cal.state.on).toBe(false);
    expect(dom.byId('lat-result').textContent).toBe('audio_locked');

    // Successful run schedules count-in + measurement clicks cleanly.
    const calOk = createTimingCalibration({
      t: (key) => key,
      ensureAudio: () => ({ state: 'running', currentTime: 2 }),
      timedAudioReady: async () => true,
      scheduleClick,
      touchInput: (_e, fn) => fn(),
      getLatency: () => undefined,
      setLatency: () => {},
      clearLatency: () => {},
      saveAll: () => {},
      byId: dom.byId,
      buttonById: dom.buttonById,
      isOpen: () => true,
      setTimeout: (_cb, ms) => {
        timers.push(ms);
        return timers.length;
      },
      clearTimeout: () => {},
    });
    await calOk.start();
    expect(scheduleClick).toHaveBeenCalledTimes(CAL_COUNT_IN + CAL_BEATS);
    expect(calOk.state.clicks).toHaveLength(CAL_BEATS);
  });
});

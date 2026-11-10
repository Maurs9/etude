import { describe, expect, it } from 'vitest';
import { BleClock, bleTimestamps, eventTime, inputLag, inputSource, inputTime, latencyOffsets, readLatencyOffsets, setLatencyOffsets, withInputTime } from '../../src/domain/midi-timing.ts';

// A seeded generator keeps the fake radio jitter the same on every run.
function rng(seed) {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 2 ** 32; };
}

// One BLE-MIDI note-on packet for a sender time in ms: [header 10hhhhhh, timestamp 1lllllll, status, note, velocity].
function notePacket(senderMs, note = 60) {
  const ms = senderMs % 8192;
  return new Uint8Array([0x80 | (ms >> 7), 0x80 | (ms & 0x7F), 0x90, note, 100]);
}

describe('eventTime', () => {
  it('trusts a recent stamp on the performance clock', () => {
    expect(eventTime(990, 1000)).toBe(990);
  });

  it('falls back to now for a stamp it cannot trust', () => {
    expect(eventTime(undefined, 1000)).toBe(1000);
    expect(eventTime(0, 1000)).toBe(1000);
    expect(eventTime(Number.NaN, 1000)).toBe(1000);
    expect(eventTime(1005, 1000)).toBe(1000); // in the future
    expect(eventTime(1_700_000_000_000, 5000)).toBe(5000); // an epoch time base
    expect(eventTime(100, 5000)).toBe(5000); // older than a second
  });
});

describe('dispatch context', () => {
  it('reports now outside a dispatch and the event time inside one', () => {
    setLatencyOffsets(null);
    expect(inputTime(500)).toBe(500);
    expect(inputSource()).toBe(null);
    const seen = withInputTime(480, 'usb', () => [inputTime(500), inputLag(500), inputSource()]);
    expect(seen).toEqual([480, 20, 'usb']);
    expect(inputTime(500)).toBe(500);
  });

  it('restores the outer input after a nested one, even when it throws', () => {
    withInputTime(100, 'ble', () => {
      expect(() => withInputTime(90, 'touch', () => { throw new Error('boom'); })).toThrow('boom');
      expect(inputTime(200)).toBe(100);
      expect(inputSource()).toBe('ble');
    });
  });

  it('subtracts the calibrated offset of the source', () => {
    setLatencyOffsets({ usb: 12, ble: 30, touch: 45 });
    expect(withInputTime(1000, 'usb', () => inputTime(1010))).toBe(988);
    expect(withInputTime(1000, 'ble', () => inputTime(1010))).toBe(970);
    expect(withInputTime(1000, null, () => inputTime(1010))).toBe(1000);
    setLatencyOffsets(null);
    expect(latencyOffsets()).toEqual({ touch: 0, usb: 0, ble: 0 });
  });

  it('reads stored offsets defensively', () => {
    expect(readLatencyOffsets(undefined)).toEqual({ touch: 0, usb: 0, ble: 0 });
    expect(readLatencyOffsets([1, 2])).toEqual({ touch: 0, usb: 0, ble: 0 });
    expect(readLatencyOffsets({ touch: 41.6, usb: '9', ble: -5 })).toEqual({ touch: 42, usb: 0, ble: 0 });
    expect(readLatencyOffsets({ usb: 301, ble: Infinity, touch: 300 })).toEqual({ touch: 300, usb: 0, ble: 0 });
  });
});

describe('bleTimestamps', () => {
  it('reads the 13-bit sender time of every timestamp byte', () => {
    const p = new Uint8Array([0x81, 0x85, 0x90, 60, 100, 0x8A, 0x80, 64, 0]);
    expect([...bleTimestamps(p)]).toEqual([[1, (1 << 7) | 5], [5, (1 << 7) | 10]]);
  });

  it('raises the high bits when the low bits wrap inside a packet', () => {
    const p = new Uint8Array([0x82, 0xFE, 0x90, 60, 100, 0x81, 0x80, 60, 0]);
    expect([...bleTimestamps(p).values()]).toEqual([(2 << 7) | 0x7E, (3 << 7) | 1]);
  });

  it('keeps running-status data and continuation packets free of timestamps', () => {
    expect([...bleTimestamps(new Uint8Array([0x80, 0x81, 0x90, 60, 100, 62, 100])).keys()]).toEqual([1]);
    expect(bleTimestamps(new Uint8Array([0x80, 0x10, 0x20])).size).toBe(0);
    expect(bleTimestamps(new Uint8Array([0x10, 0x81, 0x90])).size).toBe(0);
  });
});

describe('BleClock with a fake event stream', () => {
  // The piano plays a note every 250 ms. Each packet waits for the next 15 ms connection event, plus up to 4 ms of stack delay.
  function stream({ count, startSender = 3000, startLocal = 100_000, interval = 15, drift = 0 }) {
    const rand = rng(7), out = [];
    for (let k = 0; k < count; k++) {
      const sender = startSender + k * 250;
      const played = startLocal + k * 250 * (1 + drift);
      const wait = interval - (played % interval) + rand() * 4;
      out.push({ sender, played, arrival: played + wait });
    }
    return out;
  }

  function mapAll(events) {
    const clock = new BleClock();
    return events.map((e) => {
      const p = notePacket(e.sender), stamps = bleTimestamps(p);
      stamps.forEach((ms) => clock.observe(ms, e.arrival));
      return { ...e, mapped: clock.map(stamps.get(1), e.arrival) };
    });
  }

  const spread = (xs) => Math.max(...xs) - Math.min(...xs);

  it('takes the radio jitter out of the judged time', () => {
    const got = mapAll(stream({ count: 80 })).slice(10); // the first packets teach the clock
    const arrivalErr = got.map((e) => e.arrival - e.played), mappedErr = got.map((e) => e.mapped - e.played);
    expect(spread(arrivalErr)).toBeGreaterThan(10);
    expect(spread(mappedErr)).toBeLessThan(2.5);
    got.forEach((e) => expect(e.mapped).toBeLessThanOrEqual(e.arrival));
  });

  it('follows the 8192 ms wrap of the sender clock', () => {
    const got = mapAll(stream({ count: 120, startSender: 7000 })).slice(10); // 30 s of playing crosses the wrap several times
    const gaps = got.slice(1).map((e, i) => e.mapped - got[i].mapped);
    gaps.forEach((g) => expect(Math.abs(g - 250)).toBeLessThan(5)); // arrival gaps are off by up to 19 ms
  });

  it('follows a sender clock that runs slower than ours', () => {
    const got = mapAll(stream({ count: 240, drift: 0.0002 })).slice(40);
    expect(spread(got.map((e) => e.arrival - e.played))).toBeGreaterThan(10);
    expect(spread(got.map((e) => e.mapped - e.played))).toBeLessThan(6);
  });

  it('maps afresh when the sender clock restarts', () => {
    const clock = new BleClock();
    clock.observe(4000, 50_000);
    clock.observe(100, 52_000); // the piano was switched off and on: its clock restarted near 0
    expect(clock.map(100, 52_000)).toBe(52_000);
    expect(clock.map(90, 52_000)).toBe(51_990);
  });

  it('maps nothing before the first packet and after a reset', () => {
    const clock = new BleClock();
    expect(clock.map(1234, 9000)).toBe(9000);
    clock.observe(1234, 9000);
    clock.reset();
    expect(clock.map(1000, 9500)).toBe(9500);
  });
});

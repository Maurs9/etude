/* Input timing: when a key really went down, on the performance.now() clock.

   Judges ask inputTime() instead of reading performance.now() in the handler. While an input is dispatched (withInputTime), that is
   the event's own time minus the latency offset calibrated for its source. Outside a dispatch (a click on an answer button, a
   timeout) it is simply now.

   Web MIDI: MIDIMessageEvent.timeStamp is on the performance.now() clock. A stamp that is missing, in the future or very old (another
   time base, a browser that leaves it 0) falls back to the handler time.
   Bluetooth MIDI: each packet carries the sender's 13-bit millisecond clock. BleClock maps it onto the local clock so radio jitter
   (the connection interval, 7.5–50 ms) drops out of the judged time. */

export type InputSource = 'touch' | 'usb' | 'ble';
export interface LatencyOffsets { touch: number; usb: number; ble: number; }

/** A stamp older than this (ms) is not trusted: it is from another time base, or the page was busy for that long. */
export const MAX_EVENT_AGE_MS = 1000;
/** Calibrated offsets are latencies: kept within 0…this many ms. */
export const MAX_OFFSET_MS = 300;
export const ZERO_OFFSETS: Readonly<LatencyOffsets> = Object.freeze({ touch: 0, usb: 0, ble: 0 });

/** The event time a stamp stands for, or now when the stamp cannot be trusted. */
export function eventTime(stamp: unknown, now: number, maxAge = MAX_EVENT_AGE_MS): number {
    if (typeof stamp !== 'number' || !Number.isFinite(stamp) || stamp <= 0 || stamp > now || stamp < now - maxAge)
        return now;
    return stamp;
}

/* ---------- dispatch context ---------- */
let current: { at: number; src: InputSource | null } | null = null;
// The offsets come from a provider (the app's stored record), read on every call: a cross-tab sync merges it in place.
let offsetSource: () => unknown = () => null;
function currentOffsets(): LatencyOffsets { return readLatencyOffsets(offsetSource()); }

function clockNow(): number { return performance.now(); }

/** Runs fn with `at` (performance.now() ms) as the time of the input being handled; nested calls restore the outer one. */
export function withInputTime<T>(at: number, src: InputSource | null, fn: () => T): T {
    const prev = current;
    current = { at, src };
    try {
        return fn();
    }
    finally {
        current = prev;
    }
}

/** The judged time of the input being handled (event time minus its source's offset), else now. */
export function inputTime(now = clockNow()): number {
    if (!current)
        return now;
    return current.at - (current.src ? currentOffsets()[current.src] : 0);
}

/** The uncalibrated event time of the input being handled, else now. The calibration wizard measures with it. */
export function inputEventTime(now = clockNow()): number { return current ? current.at : now; }

/** How long ago (ms) the input being handled was judged to happen; 0 outside a dispatch. */
export function inputLag(now = clockNow()): number { return now - inputTime(now); }

/** The source of the input being handled, or null. */
export function inputSource(): InputSource | null { return current ? current.src : null; }

/** Where the judges find the per-source offsets: `get` returns the stored record, read defensively (readLatencyOffsets). */
export function useLatencyOffsets(get: () => unknown): void { offsetSource = get; }

/** Fixed offsets, for tests and callers without a store. */
export function setLatencyOffsets(value: unknown): LatencyOffsets {
    useLatencyOffsets(() => value);
    return latencyOffsets();
}

export function latencyOffsets(): LatencyOffsets { return currentOffsets(); }

/** Reads stored offsets defensively: missing, malformed or out-of-range fields are 0. */
export function readLatencyOffsets(value: unknown): LatencyOffsets {
    const rec = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const one = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_OFFSET_MS ? Math.round(v) : 0;
    return { touch: one(rec.touch), usb: one(rec.usb), ble: one(rec.ble) };
}

/* ---------- Bluetooth MIDI ---------- */
const BLE_WRAP = 8192;
/** The local clock may run ahead of the sender's by this much per ms before the mapping follows it (0.5 ms per second). */
const BLE_DRIFT = 0.0005;
/** A packet this much later than the mapping expects means the sender's clock restarted: map afresh. */
const BLE_RESYNC_MS = 500;
/** A mapped time is never more than this before the packet arrived: a few connection intervals. It bounds the harm of a sender
    whose timestamps are frozen or wrong. */
export const BLE_MAX_LAG_MS = 100;

/** The 13-bit sender time of each timestamp byte in a BLE-MIDI packet, by byte index. Low bits that wrap raise the high bits. */
export function bleTimestamps(p: Uint8Array): Map<number, number> {
    const out = new Map<number, number>();
    if (p.length < 2 || (p[0] & 0xC0) !== 0x80)
        return out;
    let high = p[0] & 0x3F, lastLow = -1, ts = false;
    for (let i = 1; i < p.length; i++) {
        const b = p[i];
        if (b & 0x80) {
            if (!ts) {
                ts = true;
                const low = b & 0x7F;
                if (lastLow >= 0 && low < lastLow)
                    high = (high + 1) & 0x3F;
                lastLow = low;
                out.set(i, (high << 7) | low);
                continue;
            }
            ts = false;
        }
        else
            ts = false;
    }
    return out;
}

/* Maps sender milliseconds onto the local clock. The offset (local − sender) is the smallest seen so far: the packet that arrived
   fastest. It may creep up by BLE_DRIFT so a slower sender clock is followed. A mapped time is never after the packet arrived nor
   more than BLE_MAX_LAG_MS before it. */
export class BleClock {
    private offset: number | null = null;
    private lastArrival = 0;

    reset(): void { this.offset = null; }

    private unwrap(ms13: number, arrival: number): number {
        const expected = arrival - (this.offset ?? arrival - ms13);
        return ms13 + Math.round((expected - ms13) / BLE_WRAP) * BLE_WRAP;
    }

    /** Learns from one timestamp of a packet that arrived at `arrival` (local ms). */
    observe(ms13: number, arrival: number): void {
        if (this.offset == null) {
            this.offset = arrival - ms13;
            this.lastArrival = arrival;
            return;
        }
        const cand = arrival - this.unwrap(ms13, arrival);
        const allowed = this.offset + Math.max(0, arrival - this.lastArrival) * BLE_DRIFT;
        if (cand - this.offset > BLE_RESYNC_MS)
            this.offset = cand;
        else
            this.offset = Math.min(cand, allowed);
        this.lastArrival = Math.max(this.lastArrival, arrival);
    }

    /** The local time of a sender timestamp from a packet that arrived at `arrival`. */
    map(ms13: number, arrival: number): number {
        if (this.offset == null)
            return arrival;
        const t = this.unwrap(ms13, arrival) + this.offset;
        return Math.max(arrival - BLE_MAX_LAG_MS, Math.min(arrival, t));
    }
}

/* ---------- calibration: tap with the click ---------- */
/** Fewer taps than this in time with the clicks are not enough to measure. */
export const CALIBRATION_MIN_TAPS = 6;
/** Taps whose middle half spreads wider than this (ms) are too uneven to trust. */
export const CALIBRATION_MAX_SPREAD_MS = 60;

export function median(xs: readonly number[]): number {
    if (!xs.length)
        return NaN;
    const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type CalibrationResult = { ok: true; offset: number; taps: number; spread: number } | { ok: false; reason: 'few' | 'uneven'; taps: number };

/* Pairs each tap with its nearest click (within half a beat; one tap per click, the closest) and returns the median lateness,
   clamped to 0…MAX_OFFSET_MS. Taps far from every click (a stray key, a missed beat) are left out. */
export function calibrationOffset(taps: readonly number[], clicks: readonly number[], beatMs: number): CalibrationResult {
    const best = new Map<number, number>();
    taps.forEach((tap) => {
        let k = -1, d = Infinity;
        clicks.forEach((c, i) => { const x = tap - c; if (Math.abs(x) < Math.abs(d)) { d = x; k = i; } });
        if (k < 0 || Math.abs(d) >= beatMs / 2)
            return;
        const prev = best.get(k);
        if (prev == null || Math.abs(d) < Math.abs(prev))
            best.set(k, d);
    });
    const ds = [...best.values()].sort((a, b) => a - b);
    if (ds.length < CALIBRATION_MIN_TAPS)
        return { ok: false, reason: 'few', taps: ds.length };
    const q = (f: number) => ds[Math.min(ds.length - 1, Math.floor(f * ds.length))];
    const spread = q(0.75) - q(0.25);
    if (spread > CALIBRATION_MAX_SPREAD_MS)
        return { ok: false, reason: 'uneven', taps: ds.length };
    return { ok: true, offset: Math.round(Math.max(0, Math.min(MAX_OFFSET_MS, median(ds)))), taps: ds.length, spread };
}

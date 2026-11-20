import { describe, expect, it, vi } from 'vitest';
import { audioPresentationTime, AudioEngine, fetchPianoAudio, nearestPianoKey, PianoBank } from '../../src/domain/audio.ts';

describe('audio presentation clock', () => {
  it('projects the output timestamp onto the current display frame and bounds it by render time', () => {
    const context = { currentTime: 2, state: 'running', getOutputTimestamp: () => ({ contextTime: 1.8, performanceTime: 1000 }) };
    expect(audioPresentationTime(context, 1040)).toBeCloseTo(1.84);
    expect(audioPresentationTime(context, 1250)).toBe(2);
    expect(audioPresentationTime({ ...context, getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 1000 }) }, 1040)).toBe(2);
    expect(audioPresentationTime({ ...context, currentTime: .12, getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 1000 }) }, 1040)).toBeCloseTo(.04);
  });

  it('uses the render time when timestamps are missing, invalid, stale or suspended', () => {
    const context = { currentTime: 2, state: 'running' };
    expect(audioPresentationTime(context, 1040)).toBe(2);
    expect(audioPresentationTime({ ...context, getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }) }, 1040)).toBe(2);
    expect(audioPresentationTime({ ...context, getOutputTimestamp: () => ({ contextTime: NaN, performanceTime: 1000 }) }, 1040)).toBe(2);
    expect(audioPresentationTime({ ...context, getOutputTimestamp: () => ({ contextTime: .8, performanceTime: 30 }) }, 1040)).toBe(2);
    const suspended = { ...context, state: 'suspended', getOutputTimestamp: vi.fn() };
    expect(audioPresentationTime(suspended, 1040)).toBe(2);
    expect(suspended.getOutputTimestamp).not.toHaveBeenCalled();
  });
});

describe('piano audio domain', () => {
  it('prepares reverb in bounded tasks without allocating in the input handler', async () => {
    vi.useFakeTimers();
    try {
      const engine = new AudioEngine({ pianoKeys: [], pianoUrls: {}, warmRange: [60, 60] });
      const channels = [new Float32Array(5000), new Float32Array(5000)];
      const buffer = { getChannelData: i => channels[i] };
      const createBuffer = vi.fn(() => buffer);
      engine.context = { state: 'running', sampleRate: 3000, createBuffer };
      const node = { buffer: null };
      engine.reverbNode = node;
      engine.ensureReverbBuffer();
      engine.ensureReverbBuffer();
      expect(createBuffer).not.toHaveBeenCalled();
      await vi.runAllTimersAsync();
      expect(createBuffer).toHaveBeenCalledTimes(1);
      expect(node.buffer).toBe(buffer);
      expect(channels.every(channel => channel.some(value => value !== 0))).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('abandons reverb preparation when the audio context is replaced', async () => {
    vi.useFakeTimers();
    try {
      const engine = new AudioEngine({ pianoKeys: [], pianoUrls: {}, warmRange: [60, 60] });
      const createBuffer = vi.fn();
      engine.context = { state: 'running', sampleRate: 3000, createBuffer };
      engine.reverbNode = { buffer: null };
      engine.ensureReverbBuffer();
      engine.context = null;
      await vi.runAllTimersAsync();
      expect(createBuffer).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it('fetches only successful samples and decodes their bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const decodeAudioData = vi.fn(async value => ({ length: value.byteLength, duration: 1 }));
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => bytes,
    })));
    await expect(fetchPianoAudio('/piano/60.mp3', { decodeAudioData })).resolves.toMatchObject({ length: 3 });
    expect(decodeAudioData).toHaveBeenCalledWith(bytes);
  });

  it('rejects failed fetches and chooses the nearest sample key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    await expect(fetchPianoAudio('/piano/60.mp3', { decodeAudioData: async () => ({ length: 1, duration: 1 }) }))
      .rejects.toThrow('503');
    expect(nearestPianoKey(62, [60, 66, 72])).toBe(60);
    expect(nearestPianoKey(65, [60, 66, 72])).toBe(66);
  });

  it('resets the pending warm-up after an aborted sample so retry can succeed', async () => {
    const context = { decodeAudioData: async () => ({ length: 1, duration: 1 }) };
    let fail = true;
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (fail) throw new DOMException('aborted', 'AbortError');
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(1) };
    }));
    const bank = new PianoBank([48], { 48: '/48.mp3' }, () => context);
    expect(await bank.prepare([48, 48])).toBe(false);
    expect(bank.promise).toBeNull();
    fail = false;
    expect(await bank.prepare([48, 48])).toBe(true);
    expect(bank.status).toBe('ready');
  });

  it('resumes a suspended context when the page returns and reports the state', async () => {
    const engine = new AudioEngine({ pianoKeys: [], pianoUrls: {}, warmRange: [60, 60] });
    expect(await engine.resumeOnReturn()).toBeNull();
    const context = { state: 'suspended', resume: vi.fn(async () => { context.state = 'running'; }) };
    engine.context = context;
    expect(await engine.resumeOnReturn()).toBe('running');
    expect(await engine.resumeOnReturn()).toBe('running');
    expect(context.resume).toHaveBeenCalledTimes(1);
  });

  it('reports a context that stays locked, also when resume never settles', async () => {
    const engine = new AudioEngine({ pianoKeys: [], pianoUrls: {}, warmRange: [60, 60] });
    engine.context = { state: 'interrupted', resume: vi.fn(async () => { throw new DOMException('no', 'InvalidStateError'); }) };
    expect(await engine.resumeOnReturn()).toBe('interrupted');
    engine.context = { state: 'suspended', resume: vi.fn(() => new Promise(() => {})) };
    expect(await engine.resumeOnReturn(20)).toBe('suspended');
    engine.context = { state: 'closed', resume: vi.fn() };
    expect(await engine.resumeOnReturn()).toBeNull();
    expect(engine.context.resume).not.toHaveBeenCalled();
  });

  it('caps retained PCM bytes in PianoBank using LRU eviction', async () => {
    const context = {
      decodeAudioData: async (data) => ({ length: data.byteLength, numberOfChannels: 2, duration: 1 }),
    };
    const keys = [36, 48, 60, 72, 84];
    const urls = Object.fromEntries(keys.map(k => [k, `/piano/${k}.mp3`]));
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(100), // 100 * 2 * 4 = 800 B per buffer
    })));
    const bank = new PianoBank(keys, urls, () => context);
    bank.maxPcmBytes = 2000; // allows at most 2 buffers (1600 B)
    bank.warmRange = [48, 72];
    expect(await bank.ensure(keys)).toBe(true);
    expect(bank.pcmBytes()).toBeLessThanOrEqual(bank.maxPcmBytes);
    expect(bank.buffers.size).toBe(2);
    // warmRange keys (60, 72) should be preferred over out-of-range keys (36, 84) when evicting
    expect(bank.buffers.has(60) || bank.buffers.has(72)).toBe(true);
  });

  it('keeps an existing decode through prepare and preserves the bank after an optional warm-up failure', async () => {
    vi.useFakeTimers();
    const context = { decodeAudioData: async () => ({ length: 10, numberOfChannels: 1, duration: 1 }) };
    const fetchMock = vi.fn(async url => ({ ok: url !== '/72.mp3', status: url === '/72.mp3' ? 404 : 200, arrayBuffer: async () => new ArrayBuffer(10) }));
    vi.stubGlobal('fetch', fetchMock);
    const bank = new PianoBank([60, 72], { 60: '/60.mp3', 72: '/72.mp3' }, () => context);
    try {
      const early = bank.decode(60);
      const ready = bank.prepare([60, 60]);
      expect(await ready).toBe(true);
      expect(bank.buffers.get(60)).toBe(await early);
      await vi.advanceTimersByTimeAsync(500);
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/60.mp3', '/72.mp3']);
      expect(bank.status).toBe('ready');
      expect(bank.prepare([60, 60])).toBe(ready);
    } finally {
      bank.cancelWarmIdle();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('cancels idle warmup cleanly and skips idle warmup when page is hidden', async () => {
    vi.useFakeTimers();
    const originalDoc = globalThis.document;
    vi.stubGlobal('document', { hidden: false, addEventListener: vi.fn() });
    const context = { decodeAudioData: async () => ({ length: 10, numberOfChannels: 1, duration: 1 }) };
    const urls = { 48: '/48.mp3', 60: '/60.mp3' };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(10),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const bank = new PianoBank([48, 60], urls, () => context);
    bank.ctx = context;
    bank.warmIdle(60);
    bank.cancelWarmIdle();
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).not.toHaveBeenCalled();

    globalThis.document.hidden = true;
    bank.warmIdle(60);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.useRealTimers();
    vi.stubGlobal('document', originalDoc);
  });

  it('guards noteOn and startDrone when AudioContext is unavailable', () => {
    const originalAudioContext = globalThis.AudioContext;
    const originalWebkitAudioContext = globalThis.webkitAudioContext;
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    try {
      const engine = new AudioEngine({ pianoKeys: [], pianoUrls: {}, warmRange: [60, 60] });
      expect(() => engine.noteOn(60, 0.8)).not.toThrow();
      expect(() => engine.startDrone(0)).not.toThrow();
      expect(engine.liveVoices.size).toBe(0);
      expect(engine.droneVoices).toEqual([]);
    } finally {
      vi.stubGlobal('AudioContext', originalAudioContext);
      vi.stubGlobal('webkitAudioContext', originalWebkitAudioContext);
    }
  });

  it('updates metronome tempo dynamically when startMetro is called again', () => {
    vi.useFakeTimers();
    try {
      const engine = new AudioEngine({ pianoKeys: [], pianoUrls: {}, warmRange: [60, 60] });
      let now = 1;
      const clicks = [];
      engine.context = {
        state: 'running',
        get currentTime() { return now; },
        resume: vi.fn(async () => {}),
      };
      engine.master = {};
      engine.metroClick = vi.fn((when, accent) => clicks.push({ when, accent }));

      engine.startMetro(60);
      now = 1.05;
      vi.advanceTimersByTime(25);
      expect(clicks).toHaveLength(1);

      engine.startMetro(120);
      now = 1.65;
      vi.advanceTimersByTime(25);

      engine.stopMetro();
      const afterSwitch = clicks.slice(1);
      expect(afterSwitch.length).toBeGreaterThanOrEqual(2);
      expect(afterSwitch[1].when - afterSwitch[0].when).toBeCloseTo(0.5, 5);
    } finally {
      vi.useRealTimers();
    }
  });
});

it('disconnects only the finished voice from the shared LFO and output', () => {
  const engine = new AudioEngine({ pianoKeys: [], pianoUrls: {}, warmRange: [60, 60] });
  const oscillators = [], gains = [];
  const param = () => ({
    value: .4,
    setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn(),
  });
  const node = () => ({ connect: vi.fn(function (target) { return target; }), disconnect: vi.fn() });
  engine.context = {
    currentTime: 0, sampleRate: 48000,
    createOscillator: () => {
      const osc = { ...node(), detune: param(), frequency: param(), start: vi.fn(), stop: vi.fn() };
      oscillators.push(osc);
      return osc;
    },
    createGain: () => {
      const gain = { ...node(), gain: param() };
      gains.push(gain);
      return gain;
    },
    createBiquadFilter: () => ({ ...node(), frequency: param(), Q: param() }),
  };
  engine.master = node();
  engine.lfoGain = node();
  engine.reverbWet = 0;
  engine.tone = 'organ';
  engine.makeVoice(440, 100, 0, .5);
  engine.makeVoice(550, 100, 0, .5);
  oscillators[0].onended();
  expect(engine.lfoGain.disconnect).toHaveBeenCalledExactlyOnceWith(oscillators[0].detune);
  expect(gains[0].disconnect).not.toHaveBeenCalled();
  oscillators.slice(1, 3).forEach(osc => osc.onended());
  expect(gains[0].disconnect).toHaveBeenCalledOnce();
  expect(gains[1].disconnect).not.toHaveBeenCalled();
  expect(engine.lfoGain.disconnect.mock.calls).toEqual(oscillators.slice(0, 3).map(osc => [osc.detune]));
});

it('releases finished voice nodes even if LFO detune disconnect throws, and cleans up piano-synth and click nodes', () => {
  const engine = new AudioEngine({ pianoKeys: [], pianoUrls: {}, warmRange: [60, 60] });
  const oscillators = [], sources = [], gains = [], filters = [];
  const param = () => ({
    value: .4,
    setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn(), cancelAndHoldAtTime: vi.fn(),
  });
  const node = () => ({ connect: vi.fn(function (target) { return target; }), disconnect: vi.fn() });
  engine.context = {
    currentTime: 0, sampleRate: 48000,
    createOscillator: () => {
      const osc = { ...node(), detune: param(), frequency: param(), start: vi.fn(), stop: vi.fn() };
      oscillators.push(osc);
      return osc;
    },
    createBuffer: (_ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    createBufferSource: () => {
      const src = { ...node(), buffer: null, detune: param(), start: vi.fn(), stop: vi.fn() };
      sources.push(src);
      return src;
    },
    createGain: () => {
      const gain = { ...node(), gain: param() };
      gains.push(gain);
      return gain;
    },
    createBiquadFilter: () => {
      const filter = { ...node(), frequency: param(), Q: param() };
      filters.push(filter);
      return filter;
    },
  };
  engine.master = node();
  engine.lfoGain = {
    connect: vi.fn(),
    disconnect: vi.fn(() => { throw new DOMException('Not connected', 'InvalidAccessError'); }),
  };
  engine.reverbWet = 0;
  engine.tone = 'organ';
  engine.makeVoice(440, 100, 0, .5);
  oscillators.splice(0, 3).forEach(osc => expect(() => osc.onended()).not.toThrow());
  expect(gains.shift().disconnect).toHaveBeenCalledOnce();
  expect(filters.shift().disconnect).toHaveBeenCalledOnce();

  engine.tone = 'piano-synth';
  engine.makeVoice(440, 100, 0, .5);
  const pianoOscs = oscillators.splice(0);
  const pianoGains = gains.splice(0);
  const pianoFilters = filters.splice(0);
  const pianoSources = sources.splice(0);
  expect(pianoOscs.length).toBeGreaterThan(0);
  pianoOscs.forEach(osc => osc.onended());
  pianoSources.forEach(src => src.onended());
  pianoOscs.forEach(osc => expect(osc.disconnect).toHaveBeenCalledOnce());
  pianoSources.forEach(src => expect(src.disconnect).toHaveBeenCalledOnce());
  pianoGains.forEach(gain => expect(gain.disconnect).toHaveBeenCalledOnce());
  pianoFilters.forEach(filter => expect(filter.disconnect).toHaveBeenCalledOnce());

  const tracked = new Set();
  const click = engine.scheduleClick(0, true, tracked);
  expect(tracked.has(click)).toBe(true);
  const [clickOsc] = oscillators.splice(0);
  const [clickGain] = gains.splice(0);
  clickOsc.onended();
  expect(tracked.size).toBe(0);
  expect(clickOsc.disconnect).toHaveBeenCalledOnce();
  expect(clickGain.disconnect).toHaveBeenCalledOnce();

  engine.scheduleClick(0, false);
  const [untrackedOsc] = oscillators.splice(0);
  const [untrackedGain] = gains.splice(0);
  untrackedOsc.onended();
  expect(untrackedOsc.disconnect).toHaveBeenCalledOnce();
  expect(untrackedGain.disconnect).toHaveBeenCalledOnce();
});

import { describe, expect, it, vi } from 'vitest';
import { AudioEngine, fetchPianoAudio, nearestPianoKey, PianoBank } from '../../src/domain/audio.ts';

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
});

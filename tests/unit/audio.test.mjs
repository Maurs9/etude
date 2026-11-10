import { describe, expect, it, vi } from 'vitest';
import { AudioEngine, fetchPianoAudio, nearestPianoKey, PianoBank } from '../../src/domain/audio.ts';

describe('piano audio domain', () => {
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
});

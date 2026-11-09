import { describe, expect, it, vi } from 'vitest';
import { fetchPianoAudio, nearestPianoKey, PianoBank } from '../../src/domain/audio.ts';

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
});

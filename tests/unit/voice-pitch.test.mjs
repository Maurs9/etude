import { describe, expect, it } from 'vitest';
import { detectVoicePitch } from '../../src/domain/voice-pitch.ts';

describe('voice pitch detection', () => {
  const waveform = (sampleRate, frequency, harmonic = 0) => Float32Array.from({ length: 2048 }, (_, i) => {
    const phase = i * 2 * Math.PI * frequency / sampleRate;
    return .45 * Math.sin(phase) + harmonic * Math.sin(2 * phase);
  });
  it.each([44100, 48000])('tracks low, middle, and high voice pitches at %i Hz', sampleRate => {
    for (const frequency of [82.41, 220, 440, 1046.5]) {
      const pitch = detectVoicePitch(waveform(sampleRate, frequency, .13), sampleRate);
      expect(Math.abs(1200 * Math.log2(pitch / frequency))).toBeLessThan(16);
    }
  });
  it('rejects silence and avoids mapping an out-of-range pitch to a lower octave', () => {
    expect(detectVoicePitch(new Float32Array(2048), 48000)).toBe(-1);
    expect(detectVoicePitch(waveform(48000, 2000), 48000)).toBe(-1);
    expect(detectVoicePitch(waveform(48000, 55), 48000)).toBe(-1);
  });
});

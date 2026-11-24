import { describe, expect, it } from 'vitest';
import { detectVoicePitch } from '../../src/domain/voice-pitch.ts';

function sineWave(freq, sampleRate, length, amplitude = 0.4, dcOffset = 0) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = dcOffset + amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return out;
}

function harmonicVoiceWave(freq, sampleRate, length) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = (2 * Math.PI * freq * i) / sampleRate;
    // Strong 2nd and 3rd harmonics typical of vocal formants must not trigger an octave-up error.
    out[i] = 0.35 * Math.sin(t) + 0.45 * Math.sin(2 * t + 0.3) + 0.25 * Math.sin(3 * t + 0.7);
  }
  return out;
}

describe('YIN voice pitch detector', () => {
  it('detects pure frequencies cleanly across 44.1 kHz, 48 kHz, and 96 kHz sample rates', () => {
    expect(detectVoicePitch(sineWave(82.41, 44100, 4096), 44100)).toBeCloseTo(82.41, 0);
    expect(detectVoicePitch(sineWave(220, 48000, 4096), 48000)).toBeCloseTo(220, 0);
    expect(detectVoicePitch(sineWave(440, 48000, 4096), 48000)).toBeCloseTo(440, 0);
    expect(detectVoicePitch(sineWave(880, 96000, 4096), 96000)).toBeCloseTo(880, 0);
  });

  it('tracks harmonic-rich vocal waves at the true fundamental without jumping an octave', () => {
    for (const freq of [110, 196, 261.63, 392]) {
      const detected = detectVoicePitch(harmonicVoiceWave(freq, 48000, 4096), 48000);
      expect(Math.abs(detected - freq)).toBeLessThan(freq * 0.02);
    }
  });

  it('ignores DC offset and rejects silence and breath noise', () => {
    const dcSilence = new Float32Array(4096).fill(0.35);
    expect(detectVoicePitch(dcSilence, 48000)).toBe(-1);

    const waveWithDc = sineWave(220, 48000, 4096, 0.25, 0.4);
    expect(detectVoicePitch(waveWithDc, 48000)).toBeCloseTo(220, 0);

    let seed = 1337;
    const noise = new Float32Array(4096);
    for (let i = 0; i < noise.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      noise[i] = ((seed / 0xffffffff) * 2 - 1) * 0.15;
    }
    expect(detectVoicePitch(noise, 48000)).toBe(-1);
  });
});

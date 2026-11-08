import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const runtimePath = new URL('../src/domain/views-runtime.js', import.meta.url);

describe('domain boundaries', () => {
  it('keeps Web Audio node construction in the audio domain', async () => {
    const runtime = await readFile(runtimePath, 'utf8');
    expect(runtime).not.toMatch(/\bcreate(?:Oscillator|Gain|BiquadFilter|BufferSource)\s*\(/);
    expect(runtime).not.toMatch(/\bnew\s+AudioContext\b/);
  });

  it('uses the audio boundary for scheduled rhythm clicks', async () => {
    const runtime = await readFile(runtimePath, 'utf8');
    expect(runtime).toMatch(/audioEngine\.scheduleClick/);
    expect(runtime).not.toMatch(/function\s+(?:srClick|rdClick)[\s\S]*?createOscillator/);
  });

  it('does not reach into OSMD vendor members from the view runtime', async () => {
    const runtime = await readFile(runtimePath, 'utf8');
    expect(runtime).not.toMatch(/engine\.(?:EngravingRules|GraphicSheet|Sheet|cursor|Zoom)\b/);
    expect(runtime).toMatch(/engine\.get(?:Rules|GraphicSheet|Sheet|Cursor|Zoom)\b/);
  });
});

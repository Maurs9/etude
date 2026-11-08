import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const runtimePath = new URL('../src/domain/views-runtime.js', import.meta.url);
const theoryPath = new URL('../src/domain/theory.ts', import.meta.url);
const notationPath = new URL('../src/domain/notation.ts', import.meta.url);

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
    expect(runtime).not.toMatch(/engine\.get(?:Rules|GraphicSheet|Sheet|Cursor|GraphicalNote)\b/);
    expect(runtime).toMatch(/engine\.(?:updateRules|readLayout|readCursor|forEachRenderedNote)\b/);
  });

  it('keeps extracted pure exercise and score calculations out of views', async () => {
    const [runtime, theory] = await Promise.all([readFile(runtimePath, 'utf8'), readFile(theoryPath, 'utf8')]);
    for (const [runtimeName, theoryName] of [
      ['SCALES', 'SCALE_DEFINITIONS'],
      ['CHORDS', 'CHORD_TEMPLATES'],
      ['PROGS', 'PROGRESSION_TEMPLATES'],
      ['srKeyName', 'circleKeyPitchClass'],
      ['rdSpellMidi', 'readingSpelling'],
      ['anFnKey', 'analysisFunction'],
      ['scorePitch', 'scorePitchXml'],
    ]) {
      expect(theory, `${runtimeName} belongs to theory.ts`).toContain(theoryName);
      const declaration = runtimeName === 'SCALES' ? 'const SCALES = {' :
        runtimeName === 'CHORDS' ? 'const CHORDS = [' :
          runtimeName === 'PROGS' ? 'const PROGS = [' : null;
      if (declaration) expect(runtime, `${runtimeName} is not redeclared in views`).not.toContain(declaration);
      else expect(runtime, `${runtimeName} is not redeclared in views`).not.toMatch(new RegExp(`(?:function|const)\\s+${runtimeName}\\b`));
    }
  });

  it('keeps the notation adapter free of untyped compatibility surfaces', async () => {
    const notation = await readFile(notationPath, 'utf8');
    expect(notation).not.toMatch(/\bany\b/);
    expect(notation).not.toMatch(/readonly (?:EngravingRules|GraphicSheet|Sheet|cursor|Zoom)\b/);
    expect(notation).toMatch(/forEachRenderedNote/);
  });
});

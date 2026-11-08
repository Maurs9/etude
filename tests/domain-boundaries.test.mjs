import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimePath = new URL('../src/domain/views.ts', import.meta.url);
const runtimeImplementationPath = new URL('../src/domain/views-runtime.ts', import.meta.url);
const theoryPath = new URL('../src/domain/theory.ts', import.meta.url);
const notationPath = new URL('../src/domain/notation.ts', import.meta.url);
const execFileAsync = promisify(execFile);

describe('domain boundaries', () => {
  it('keeps Web Audio node construction in the audio domain', async () => {
    const runtime = await readFile(runtimePath, 'utf8');
    expect(runtime).not.toMatch(/\bcreate(?:Oscillator|Gain|BiquadFilter|BufferSource)\s*\(/);
    expect(runtime).not.toMatch(/\bnew\s+AudioContext\b/);
  });

  it('uses the audio boundary for scheduled rhythm clicks', async () => {
    const runtime = await readFile(runtimeImplementationPath, 'utf8');
    expect(runtime).toMatch(/audioEngine\.scheduleClick/);
    expect(runtime).not.toMatch(/function\s+(?:srClick|rdClick)[\s\S]*?createOscillator/);
  });

  it('does not reach into OSMD vendor members from the view runtime', async () => {
    const runtime = await readFile(runtimeImplementationPath, 'utf8');
    expect(runtime).not.toMatch(/engine\.(?:EngravingRules|GraphicSheet|Sheet|cursor|Zoom)\b/);
    expect(runtime).not.toMatch(/engine\.get(?:Rules|GraphicSheet|Sheet|Cursor|GraphicalNote)\b/);
    expect(runtime).toMatch(/engine\.(?:updateRules|readLayout|readCursor|forEachRenderedNote)\b/);
  });

  it('keeps extracted pure exercise and score calculations out of views', async () => {
    const [runtime, theory] = await Promise.all([readFile(runtimeImplementationPath, 'utf8'), readFile(theoryPath, 'utf8')]);
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

  it('keeps the view runtime free of compiler-bypass comments', async () => {
    const runtime = await readFile(runtimePath, 'utf8');
    expect(runtime).not.toMatch(/@ts-(?:nocheck|ignore)\b/);
    expect(runtime).not.toMatch(/@ts-expect-error\b/);
  });

  it('keeps the typed view boundary free of explicit any', async () => {
    const [boundary, implementation] = await Promise.all([
      readFile(runtimePath, 'utf8'),
      readFile(runtimeImplementationPath, 'utf8'),
    ]);
    const explicitAny = /(?:\:\s*any\b|\bas\s+any\b|<any>|\bArray\s*<\s*any\s*>)/;
    expect(boundary).not.toMatch(explicitAny);
    expect(implementation).not.toMatch(explicitAny);
  });

  it('does not permit an unchecked application JavaScript module', async () => {
    const domainDir = fileURLToPath(new URL('../src/domain/', import.meta.url));
    const entries = await readdir(domainDir, { withFileTypes: true });
    expect(entries.filter(entry => entry.isFile() && entry.name.endsWith('.js'))).toEqual([]);
  });

  it('rejects a blanket explicit-any conversion through the migration gate', async () => {
    const probeRoot = fileURLToPath(new URL('../test-results/', import.meta.url));
    await mkdir(probeRoot, { recursive: true });
    const probe = await mkdtemp(join(probeRoot, 'etude-ts-gate-'));
    try {
      await writeFile(join(probe, 'probe.ts'), 'const unchecked: any = undefined;\n');
      await expect(execFileAsync('node', ['scripts/check-ts-suppressions.mjs'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: { ...process.env, TS_SOURCE_ROOT: probe },
      })).rejects.toMatchObject({ code: 1 });
    } finally {
      await rm(probe, { recursive: true, force: true });
    }
  });

  it('rejects an indirect any alias resolved from JSON.parse', async () => {
    const probeRoot = fileURLToPath(new URL('../test-results/', import.meta.url));
    const sourceRoot = await mkdtemp(join(probeRoot, 'etude-indirect-any-'));
    try {
      await writeFile(join(sourceRoot, 'probe.ts'), [
        'type HiddenAny = ReturnType<typeof JSON.parse>;',
        'const value: HiddenAny = { deep: { missing: () => undefined } };',
        'value.deep.missing.call();',
      ].join('\n'));
      await expect(execFileAsync('node', ['scripts/check-ts-suppressions.mjs'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: { ...process.env, TS_SOURCE_ROOT: sourceRoot },
      })).rejects.toMatchObject({ code: 1 });
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });

  it('rejects inferred any and unchecked property chains', async () => {
    const probeRoot = fileURLToPath(new URL('../test-results/', import.meta.url));
    const probes = [
      'const value = JSON.parse("{}");\nvalue.deep.missing.call();\n',
      'type Compat = unknown;\nfunction use(value: Compat) { return value.deep.missing(); }\n',
    ];
    for (const [index, source] of probes.entries()) {
      const sourceRoot = await mkdtemp(join(probeRoot, `etude-inferred-boundary-${index}-`));
      try {
        await writeFile(join(sourceRoot, 'probe.ts'), source);
        await expect(execFileAsync('node', ['scripts/check-ts-suppressions.mjs'], {
          cwd: fileURLToPath(new URL('..', import.meta.url)),
          env: { ...process.env, TS_SOURCE_ROOT: sourceRoot },
        })).rejects.toMatchObject({ code: 1 });
      } finally {
        await rm(sourceRoot, { recursive: true, force: true });
      }
    }
  });

  it('rejects a new unchecked application JavaScript module', async () => {
    const probeRoot = fileURLToPath(new URL('../test-results/', import.meta.url));
    const sourceRoot = await mkdtemp(join(probeRoot, 'etude-js-gate-'));
    const probe = join(sourceRoot, 'unchecked-probe.js');
    try {
      await writeFile(probe, 'export const unchecked = window.appState;\n');
      await expect(execFileAsync('node', ['scripts/check-ts-suppressions.mjs'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: { ...process.env, TS_SOURCE_ROOT: sourceRoot },
      })).rejects.toMatchObject({ code: 1 });
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });

  it('rejects dynamic execution and the encoded runtime bypass', async () => {
    const probeRoot = fileURLToPath(new URL('../test-results/', import.meta.url));
    const probes = [
      'const RUNTIME_SOURCE = "ZnVuY3Rpb24gYmFkKCkge30=";\nconst decoded = atob(RUNTIME_SOURCE);\nnew Function(decoded)();\n',
      'const source = "return 1";\neval(source);\n',
    ];
    for (const [index, source] of probes.entries()) {
      const sourceRoot = await mkdtemp(join(probeRoot, `etude-runtime-gate-${index}-`));
      try {
        await writeFile(join(sourceRoot, 'probe.ts'), source);
        await expect(execFileAsync('node', ['scripts/check-ts-suppressions.mjs'], {
          cwd: fileURLToPath(new URL('..', import.meta.url)),
          env: { ...process.env, TS_SOURCE_ROOT: sourceRoot },
        })).rejects.toMatchObject({ code: 1 });
      } finally {
        await rm(sourceRoot, { recursive: true, force: true });
      }
    }
  });
});

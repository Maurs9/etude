import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { isBackupPayload, parsePttV3, restoreSettings } from '../src/domain/storage.ts';

const fixture = name => readFile(new URL(`./fixtures/storage/${name}`, import.meta.url), 'utf8');

describe('ptt-v3 storage reader', () => {
  it('accepts older valid saves and normalizes settings without changing data', async () => {
    const payload = parsePttV3(await fixture('ptt-v3-legacy.json'));
    expect(payload).not.toBeNull();
    expect(payload?.lang).toBe('ro');
    expect(payload?.data.srs).toHaveProperty('iv:1');
    expect(restoreSettings(payload?.data.settings)).toEqual({
      goal: 12,
      newPerDay: 5,
      allowInv: true,
      metronome: false,
      drone: false,
      earKeys: false,
    });
  });

  it('rejects malformed, incompatible, and empty records', async () => {
    expect(parsePttV3(await fixture('ptt-v3-minimal.json'))).not.toBeNull();
    expect(parsePttV3(await fixture('ptt-settings-v2.json'))).toBeNull();
    expect(parsePttV3('{')).toBeNull();
    expect(isBackupPayload({ v: 2, data: {} })).toBe(false);
  });
});

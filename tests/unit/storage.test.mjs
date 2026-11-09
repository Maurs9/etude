import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { isBackupPayload, legacySettings, parsePttV3, readPttV3, restoreSettings, writePttV3 } from '../../src/domain/storage.ts';

const fixture = name => readFile(new URL(`../fixtures/storage/${name}`, import.meta.url), 'utf8');

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
      weakSpotInjection: false,
    });
  });

  it('rejects malformed, incompatible, and empty records', async () => {
    expect(parsePttV3(await fixture('ptt-v3-minimal.json'))).not.toBeNull();
    expect(parsePttV3(await fixture('ptt-settings-v2.json'))).toBeNull();
    expect(parsePttV3('{')).toBeNull();
    expect(isBackupPayload({ v: 2, data: {} })).toBe(false);
  });

  it('reads and writes the browser record through a typed storage adapter', () => {
    const values = new Map([['ptt-v3', JSON.stringify({ v: 3, data: { settings: {} } })]]);
    const storage = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
    const read = readPttV3(storage);
    expect(read?.payload.v).toBe(3);
    const raw = writePttV3(storage, { v: 3, data: { settings: { goal: 16 } } });
    expect(JSON.parse(raw).data.settings.goal).toBe(16);
    expect(legacySettings({ getItem: () => JSON.stringify({ noteSys: 'german' }), setItem: () => {} })?.noteSys).toBe('german');
  });
});

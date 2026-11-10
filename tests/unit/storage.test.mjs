import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { isBackupPayload, legacySettings, migratePtt, parsePttV3, PTT_SCHEMA, pttSchema, readPttV3, restoreSettings, writePttV3 } from '../../src/domain/storage.ts';

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
      anyOctave: false,
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

describe('ptt-v3 schema versions', () => {
  it('treats every saved fixture without a schema field as schema 1, the current one', async () => {
    expect(PTT_SCHEMA).toBe(1);
    for (const name of ['ptt-v3-legacy.json', 'ptt-v3-minimal.json']) {
      const payload = parsePttV3(await fixture(name));
      expect(pttSchema(payload)).toBe(1);
      expect(migratePtt(payload)).toEqual({ status: 'current', payload });
    }
    for (const schema of [0, -1, 1.5, '2', null]) expect(pttSchema({ v: 3, schema, data: {} })).toBe(1);
  });

  it('reports a record from a newer build without changing it', async () => {
    const raw = await fixture('ptt-v3-future-schema.json'), payload = parsePttV3(raw);
    expect(isBackupPayload(payload)).toBe(true);
    expect(migratePtt(payload)).toEqual({ status: 'too-new', schema: 99 });
    expect(payload).toEqual(JSON.parse(raw));
  });

  it('runs each upgrade step in order and stamps the new schema', () => {
    const steps = [
      p => ({ ...p, data: { ...p.data, step1: true } }),
      p => ({ ...p, data: { ...p.data, step2: p.data.step1 === true } }),
    ];
    const result = migratePtt({ v: 3, data: { totalReviews: 3 } }, steps);
    expect(result).toEqual({ status: 'migrated', from: 1, payload: { v: 3, schema: 3, data: { totalReviews: 3, step1: true, step2: true } } });
    expect(migratePtt({ v: 3, schema: 2, data: {} }, steps)).toMatchObject({ status: 'migrated', from: 2, payload: { schema: 3, data: { step2: false } } });
  });

  it('refuses an upgrade step that breaks the record', () => {
    expect(() => migratePtt({ v: 3, data: {} }, [() => ({ v: 2, data: {} })])).toThrow(/invalid record/);
  });
});


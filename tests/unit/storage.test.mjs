import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { isBackupPayload, isImportableBackup, legacySettings, migratePtt, parsePttV3, PTT_SCHEMA, pttSchema, readPttV3, restoreProgressBackup, restoreSettings, restoreSrs, serializeProgressBackup, writePttV3 } from '../../src/domain/storage.ts';
import { SRT_LEDGER_KEY, srtCreateLedger, srtReadLedger } from '../../src/sight-reading/ledger.ts';

const fixture = name => readFile(new URL(`../fixtures/storage/${name}`, import.meta.url), 'utf8');

it('transfers the ledger in the backup, stores it once, and rolls back if the live write fails', async () => {
  const ledger = { ...srtCreateLedger(), exposures: { piece: { firstSeenAt: 1, reason: 'practice' } } };
  const transfer = parsePttV3(serializeProgressBackup({ v: 3, data: { totalReviews: 2 } }, ledger));
  expect(transfer.data.sightLedger).toEqual(ledger);
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  await expect(restoreProgressBackup(storage, transfer, () => { throw new Error('save changed'); })).rejects.toThrow('save changed');
  expect(values.has(SRT_LEDGER_KEY)).toBe(false);
  expect(readPttV3(storage)).toBeNull();
  await expect(restoreProgressBackup(storage, transfer, () => 'fresh')).resolves.toMatchObject({ ok: true });
  expect(readPttV3(storage).payload).toEqual({ v: 3, gen: 'fresh', data: { totalReviews: 2 } });
  expect(srtReadLedger(storage).exposures).toEqual(ledger.exposures);
});

describe('ptt-v3 storage reader', () => {
  it('supplies scheduling defaults for legacy cards while keeping their progress', async () => {
    const payload = parsePttV3(await fixture('ptt-v3-legacy.json'));
    const current = { box: 5, ease: 2.6, due: 123, reps: 8, lapses: 2, last: 102 };
    expect(restoreSrs({ ...payload.data.srs, 'iv:2': current })).toEqual({
      'iv:1': { box: 2, ease: 2.3, due: 0, reps: 3, lapses: 0, last: 0 },
      'iv:2': current,
    });
  });

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

  it('accepts legacy partial progress and rejects malformed maps before import', async () => {
    expect(isImportableBackup(JSON.parse(await fixture('ptt-v3-legacy.json')))).toBe(true);
    expect(isImportableBackup({ v: 3, data: { sheet: { w5rh: { best: 82, learned: true } } } })).toBe(true);
    for (const data of [{ sheet: null }, { sheet: { w5rh: true } }, { sheet: { w5rh: { best: '82' } } },
      { srs: { 'iv:1': null } }, { history: [] }, { reading: { lv: 'broken' } },
      { bestStreak: '7' }, { lastDrill: { n: '7' } }, { reading: { tot: { n: '7' } } },
      { reading: { nt: { 'iv:1': { ok: '7' } }, lv: {} } }, { reading: { lv: { x: { s: '7' } } } }]) {
      expect(isImportableBackup({ v: 3, data })).toBe(false);
    }
  });

  it('filters reserved object keys at every depth while retaining ordinary fields', () => {
    const data = Object.fromEntries([['__proto__', {}], ['totalReviews', 4], ['reading', { nt: { constructor: {}, prototype: {}, sample: { n: 1 } } }]]);
    expect(parsePttV3(JSON.stringify({ v: 3, data })).data).toEqual({ totalReviews: 4, reading: { nt: { sample: { n: 1 } } } });
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
    const newer = { v: 3, schema: 99, data: { srs: [], sightLedger: { schemaVersion: 99 } } };
    expect(parsePttV3(JSON.stringify(newer))).toEqual(newer);
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


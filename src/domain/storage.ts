import { isSightReadingLedger } from '../sight-reading/ledger.js';

export const PTT_KEY = 'ptt-v3' as const;

export const SETTING_DEFAULTS = {
  goal: 12,
  newPerDay: 5,
  allowInv: false,
  metronome: false,
  drone: false,
  earKeys: false,
  weakSpotInjection: false,
  anyOctave: false,
} as const;

export const SETTING_GOALS = [8, 12, 16, 24] as const;
export const SETTING_NEW_PER_DAY = [3, 5, 8, 12] as const;

export type AppSettings = {
  goal: number;
  newPerDay: number;
  allowInv: boolean;
  metronome: boolean;
  drone: boolean;
  earKeys: boolean;
  weakSpotInjection: boolean;
  anyOctave: boolean;
};

export type PttV3Payload = {
  v: 3;
  data: Record<string, unknown> & { settings?: Record<string, unknown>; srs?: Record<string, unknown>; sightLedger?: Record<string, unknown> };
  [key: string]: unknown;
};

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type ReadPttResult = {
  raw: string;
  payload: PttV3Payload;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function restoreSettings(value: unknown): AppSettings {
  const settings = isRecord(value) ? value : {};
  const goal = SETTING_GOALS.includes(settings.goal as (typeof SETTING_GOALS)[number])
    ? settings.goal as number
    : SETTING_DEFAULTS.goal;
  const newPerDay = SETTING_NEW_PER_DAY.includes(settings.newPerDay as (typeof SETTING_NEW_PER_DAY)[number])
    ? settings.newPerDay as number
    : SETTING_DEFAULTS.newPerDay;
  return {
    goal,
    newPerDay,
    allowInv: settings.allowInv === true,
    metronome: settings.metronome === true,
    drone: settings.drone === true,
    earKeys: settings.earKeys === true,
    weakSpotInjection: settings.weakSpotInjection === true,
    anyOctave: settings.anyOctave === true,
  };
}

function isPttEnvelope(value: unknown): value is PttV3Payload {
  return isRecord(value) && value.v === 3 && isRecord(value.data);
}

export function isBackupPayload(value: unknown): value is PttV3Payload {
  return isPttEnvelope(value) &&
    (value.data.settings === undefined || isRecord(value.data.settings)) &&
    (value.data.srs === undefined || isRecord(value.data.srs)) &&
    (value.data.sightLedger === undefined || isSightReadingLedger(value.data.sightLedger));
}

/** Validate progress maps before replacing a live save. Older backups may omit them or contain partial rows. */
export function isImportableBackup(value: unknown): value is PttV3Payload {
  if (!isBackupPayload(value)) return false;
  const data = value.data;
  const numbers = (entry: unknown) => typeof entry === 'number' && Number.isFinite(entry);
  const mapOf = (map: unknown, valid: (entry: unknown) => boolean) =>
    map === undefined || (isRecord(map) && Object.values(map).every(valid));
  const reading = data.reading;
  return mapOf(data.srs, isRecord) &&
    mapOf(data.history, numbers) &&
    mapOf(data.singCleared, entry => typeof entry === 'boolean') &&
    mapOf(data.sheet, entry => isRecord(entry) &&
      (entry.best === undefined || numbers(entry.best)) &&
      (entry.learned === undefined || typeof entry.learned === 'boolean')) &&
    mapOf(data.toolDay, numbers) &&
    mapOf(data.learnDone, numbers) &&
    mapOf(data.learnRev, isRecord) &&
    mapOf(data.learnUnlock, numbers) &&
    (reading === undefined || (isRecord(reading) &&
      mapOf(reading.lv, isRecord) && mapOf(reading.nt, isRecord) &&
      ['tot', 'prefs', 'book'].every(key => reading[key] === undefined || isRecord(reading[key]))));
}

const parseJson: (text: string) => unknown = JSON.parse;

export function parsePttV3(raw: string | null): PttV3Payload | null {
  if (!raw) return null;
  try {
    const parsed = parseJson(raw);
    // Recognize a newer record before interpreting any of its nested structures.
    if (isPttEnvelope(parsed) && pttSchema(parsed) > PTT_SCHEMA) return parsed;
    return isBackupPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readPttV3(storage: StorageLike, key = PTT_KEY): ReadPttResult | null {
  const raw = storage.getItem(key);
  const payload = parsePttV3(raw);
  return payload && raw ? { raw, payload } : null;
}

export function writePttV3(storage: StorageLike, payload: PttV3Payload, key = PTT_KEY): string {
  // Imports carry the ledger in the transfer file. The live ledger has its own storage key.
  const { sightLedger: _sightLedger, ...data } = payload.data;
  const raw = JSON.stringify({ ...payload, data });
  storage.setItem(key, raw);
  return raw;
}

export type PttMigration = (payload: PttV3Payload) => PttV3Payload;

// PTT_MIGRATIONS[n - 1] upgrades a schema n record to schema n + 1.
// For each change to the saved format, append one entry and a fixture test.
export const PTT_MIGRATIONS: readonly PttMigration[] = [];
export const PTT_SCHEMA = PTT_MIGRATIONS.length + 1;

/** Records written before the schema field existed are schema 1. */
export function pttSchema(payload: PttV3Payload): number {
  const schema = payload.schema;
  return typeof schema === 'number' && Number.isInteger(schema) && schema >= 1 ? schema : 1;
}

export type PttMigrateResult =
  | { status: 'current'; payload: PttV3Payload }
  | { status: 'migrated'; payload: PttV3Payload; from: number }
  | { status: 'too-new'; schema: number };

/** Brings a record up to the current schema. A record from a newer build is reported, never changed. */
export function migratePtt(payload: PttV3Payload, migrations: readonly PttMigration[] = PTT_MIGRATIONS): PttMigrateResult {
  const target = migrations.length + 1, from = pttSchema(payload);
  if (from > target) return { status: 'too-new', schema: from };
  if (from === target) return { status: 'current', payload };
  let next = payload;
  for (let schema = from; schema < target; schema++) {
    const step = migrations[schema - 1];
    if (!step) throw new Error(`missing migration from schema ${schema}`);
    next = step(next);
    if (!isBackupPayload(next)) throw new Error(`migration from schema ${schema} returned an invalid record`);
  }
  return { status: 'migrated', payload: { ...next, schema: target }, from };
}

export function legacySettings(storage: StorageLike, key = 'ptt-settings-v2'): Record<string, unknown> | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const value = parseJson(raw);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

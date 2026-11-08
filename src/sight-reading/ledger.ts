import type { SightReadingEvaluation } from './evaluate.js';

export const SRT_LEDGER_KEY = 'etude-sight-v1' as const;
export const SRT_LEDGER_SCHEMA = 1 as const;
export const SRT_LEDGER_LOCK = 'etude-sight-ledger-v1' as const;
export const SRT_MAX_ATTEMPTS = 500 as const;
export const SRT_MAX_EXPOSURES = 4096 as const;

export type SightReadingExposure = {
  readonly firstSeenAt: number;
  readonly reason: string;
  readonly claim?: { readonly attemptId: string; readonly ownerTabId: string; readonly generation: string };
};
export type SightReadingAttempt = Omit<SightReadingEvaluation, 'status'> & {
  readonly attemptId: string;
  readonly fingerprint: string;
  readonly ownerTabId: string;
  readonly generation: string;
  readonly status: 'completed' | 'abandoned' | 'interrupted';
  readonly finishedAt: number;
  readonly mixedInput: boolean;
};
export type SightReadingLedger = {
  readonly schemaVersion: 1;
  readonly generation: string;
  readonly revision: number;
  readonly exposures: Readonly<Record<string, SightReadingExposure>>;
  readonly attempts: Readonly<Record<string, SightReadingAttempt>>;
  readonly prefs: Readonly<Record<string, boolean>>;
  readonly sessions: Readonly<Record<string, unknown>>;
};
export type SightReadingLedgerResult =
  | { readonly ok: true; readonly ledger: SightReadingLedger }
  | { readonly ok: false; readonly reason: 'stale_generation' | 'owner_mismatch' | 'already_exposed' | 'conflict' | 'quota' | 'unsupported' };
export type SightReadingLedgerOperation =
  | { readonly type: 'claimExposure'; readonly fingerprint: string; readonly attemptId: string; readonly ownerTabId: string; readonly generation: string }
  | { readonly type: 'finishAttempt'; readonly attempt: SightReadingAttempt; readonly generation: string }
  | { readonly type: 'abandonAttempt'; readonly attemptId: string; readonly ownerTabId: string; readonly generation: string; readonly status?: 'abandoned' | 'interrupted'; readonly mixedInput?: boolean }
  | { readonly type: 'recordExposure'; readonly fingerprint: string; readonly reason: string; readonly generation: string }
  | { readonly type: 'recordListen'; readonly fingerprint: string; readonly generation: string }
  | { readonly type: 'recoverOrphanClaims'; readonly generation: string }
  | { readonly type: 'resetLedger' }
  | { readonly type: 'updatePrefs'; readonly prefs: Readonly<Record<string, boolean>>; readonly generation: string }
  | { readonly type: 'importLedger'; readonly imported: SightReadingLedger; readonly generation: string };

export interface SightReadingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type SightReadingAttemptLease = {
  readonly attemptId: string;
  readonly release: () => void;
  readonly ready: Promise<void>;
};

function hasWebLocks(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function';
}

function newGeneration(): string {
  const suffix = Math.floor(Math.random() * 0x1000000).toString(36).padStart(4, '0');
  return `gen-${Date.now()}-${suffix}`;
}

export function srtCreateLedger(): SightReadingLedger {
  return {
    schemaVersion: 1,
    generation: newGeneration(),
    revision: 0,
    exposures: {},
    attempts: {},
    prefs: { practiceHints: true, lookAhead: false },
    sessions: {},
  };
}

function isAttempt(value: unknown): value is SightReadingAttempt {
  if (!isRecord(value)) return false;
  const noteResults = value.noteResults;
  const extraInputs = value.extraInputs;
  return isNonEmptyString(value.attemptId) &&
    isNonEmptyString(value.fingerprint) &&
    isNonEmptyString(value.ownerTabId) &&
    isNonEmptyString(value.generation) &&
    ['completed', 'abandoned', 'interrupted'].includes(String(value.status)) &&
    isFiniteNumber(value.finishedAt) &&
    value.scoringVersion === 1 &&
    isFiniteNumber(value.N) && Number.isInteger(value.N) && value.N >= 0 &&
    isFiniteNumber(value.TP) && Number.isInteger(value.TP) && value.TP >= 0 &&
    isFiniteNumber(value.FP) && Number.isInteger(value.FP) && value.FP >= 0 &&
    isFiniteNumber(value.FN) && Number.isInteger(value.FN) && value.FN >= 0 &&
    isFiniteNumber(value.G) && Number.isInteger(value.G) && value.G >= 0 &&
    isFiniteNumber(value.Q) && Number.isInteger(value.Q) && value.Q >= 0 &&
    isFiniteNumber(value.lateOrEarlyCount) && Number.isInteger(value.lateOrEarlyCount) && value.lateOrEarlyCount >= 0 &&
    isFiniteNumber(value.restViolations) && Number.isInteger(value.restViolations) && value.restViolations >= 0 &&
    (value.pitchPrecision === null || isFiniteNumber(value.pitchPrecision)) &&
    (value.pitchRecall === null || isFiniteNumber(value.pitchRecall)) &&
    (value.pitchF1 === null || isFiniteNumber(value.pitchF1)) &&
    (value.rhythmAcc === null || isFiniteNumber(value.rhythmAcc)) &&
    (value.score === null || isFiniteNumber(value.score)) &&
    typeof value.stars === 'number' && Number.isInteger(value.stars) && value.stars >= 0 && value.stars <= 3 &&
    typeof value.perfect === 'boolean' &&
    (value.mixedInput === undefined || typeof value.mixedInput === 'boolean') &&
    (value.meanOffsetMs === null || isFiniteNumber(value.meanOffsetMs)) &&
    (value.meanAbsoluteOffsetMs === null || isFiniteNumber(value.meanAbsoluteOffsetMs)) &&
    Array.isArray(noteResults) && noteResults.every((result) => {
      if (!isRecord(result)) return false;
      return typeof result.expectedId === 'string' &&
        ['good', 'near', 'lateOrEarly', 'missed'].includes(String(result.classification)) &&
        (result.matchedInputId === null || typeof result.matchedInputId === 'string') &&
        (result.errorMs === null || isFiniteNumber(result.errorMs));
    }) &&
    Array.isArray(extraInputs) && extraInputs.every((input) => {
      if (!isRecord(input)) return false;
      return typeof input.id === 'string' && Number.isInteger(input.midi) &&
        isFiniteNumber(input.onMs) && (input.offMs === undefined || input.offMs === null || isFiniteNumber(input.offMs));
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

type JsonValue = null | boolean | number | string | JsonValue[] | { readonly [key: string]: JsonValue };

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isRecord(value)) return Object.values(value).every(isJsonValue);
  return false;
}

function isBooleanRecord(value: unknown): value is Readonly<Record<string, boolean>> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'boolean');
}

function isSessionRecord(value: unknown): value is Readonly<Record<string, JsonValue>> {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isExposure(value: unknown): value is SightReadingExposure {
  if (!isRecord(value) || !isFiniteNumber(value.firstSeenAt) || value.firstSeenAt < 0 || !isNonEmptyString(value.reason))
    return false;
  if (value.claim === undefined) return true;
  if (!isRecord(value.claim)) return false;
  return isNonEmptyString(value.claim.attemptId) &&
    isNonEmptyString(value.claim.ownerTabId) &&
    isNonEmptyString(value.claim.generation);
}

function isLedger(value: unknown): value is SightReadingLedger {
  if (!isRecord(value)) return false;
  const record = value;
  return record.schemaVersion === 1 &&
    isNonEmptyString(record.generation) &&
    isFiniteNumber(record.revision) && Number.isInteger(record.revision) && record.revision >= 0 &&
    isRecord(record.exposures) &&
    isRecord(record.attempts) &&
    isBooleanRecord(record.prefs) &&
    record.prefs.practiceHints !== undefined &&
    record.prefs.lookAhead !== undefined &&
    isRecord(record.sessions) &&
    Object.keys(record.exposures).length <= SRT_MAX_EXPOSURES &&
    Object.keys(record.attempts).length <= SRT_MAX_ATTEMPTS &&
    Object.values(record.exposures).every(isExposure) &&
    Object.entries(record.exposures).every(([fingerprint]) => isNonEmptyString(fingerprint)) &&
    Object.values(record.attempts).every(isAttempt) &&
    Object.entries(record.attempts).every(([attemptId, attempt]) => isAttempt(attempt) && attemptId === attempt.attemptId) &&
    Object.values(record.sessions).every(isSessionRecord);
}

export function isSightReadingLedger(value: unknown): value is SightReadingLedger {
  return isLedger(value);
}

const parseJson: (text: string) => unknown = JSON.parse;

function readRaw(storage: SightReadingStorage): unknown {
  const raw = storage.getItem(SRT_LEDGER_KEY);
  if (!raw) return null;
  try {
    return parseJson(raw);
  } catch {
    return null;
  }
}

export type SightReadingLedgerReadStatus = 'missing' | 'supported' | 'unsupported';

export function srtLedgerReadStatus(storage: SightReadingStorage): SightReadingLedgerReadStatus {
  const raw = readRaw(storage);
  if (raw === null) return storage.getItem(SRT_LEDGER_KEY) === null ? 'missing' : 'unsupported';
  if (isRecord(raw) && typeof raw.schemaVersion === 'number' && raw.schemaVersion > SRT_LEDGER_SCHEMA)
    return 'unsupported';
  return isLedger(raw) ? 'supported' : 'missing';
}

export function srtReadLedger(storage: SightReadingStorage): SightReadingLedger {
  const parsed = readRaw(storage);
  if (isLedger(parsed)) return normalizeLedger(parsed);
  if (isRecord(parsed) && typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > SRT_LEDGER_SCHEMA) {
    return srtCreateLedger();
  }
  const created = srtCreateLedger();
  try {
    storage.setItem(SRT_LEDGER_KEY, JSON.stringify(created));
  } catch {
    // A read must remain usable even when storage is unavailable or full.
  }
  return created;
}

function normalizeAttempt(attempt: SightReadingAttempt): SightReadingAttempt {
  return { ...attempt, mixedInput: attempt.mixedInput === true };
}

function normalizeLedger(ledger: SightReadingLedger): SightReadingLedger {
  return {
    ...ledger,
    attempts: Object.fromEntries(Object.entries(ledger.attempts).map(([attemptId, attempt]) => [attemptId, normalizeAttempt(attempt)])),
  };
}

function saveLedger(storage: SightReadingStorage, ledger: SightReadingLedger): SightReadingLedgerResult {
  try {
    storage.setItem(SRT_LEDGER_KEY, JSON.stringify(ledger));
    return { ok: true, ledger };
  } catch {
    return { ok: false, reason: 'quota' };
  }
}

async function withLedgerLock<T>(callback: () => Promise<T>): Promise<T> {
  if (!hasWebLocks()) return callback();
  return navigator.locks.request(SRT_LEDGER_LOCK, { mode: 'exclusive' }, callback);
}

export function srtAcquireAttemptLease(attemptId: string): SightReadingAttemptLease | null {
  if (!hasWebLocks()) return null;
  let releaseLease: (() => void) | null = null;
  let markReady: (() => void) | null = null;
  const ready = new Promise<void>((resolve) => { markReady = resolve; });
  void navigator.locks.request(
    `etude-sight-attempt-${attemptId}`,
    { mode: 'exclusive' },
    async () => new Promise<void>((resolve) => {
      markReady?.();
      releaseLease = resolve;
    }),
  );
  return {
    attemptId,
    ready,
    release: () => releaseLease?.(),
  };
}

function trimAttempts(attempts: Readonly<Record<string, SightReadingAttempt>>): Readonly<Record<string, SightReadingAttempt>> {
  return Object.fromEntries(Object.entries(attempts)
    .sort((a, b) => a[1].finishedAt - b[1].finishedAt || a[0].localeCompare(b[0]))
    .slice(-SRT_MAX_ATTEMPTS));
}

function hasAttemptOwner(ledger: SightReadingLedger, attemptId: string, ownerTabId: string): boolean {
  return Object.values(ledger.exposures).some((exposure) =>
    exposure.claim?.attemptId === attemptId && exposure.claim.ownerTabId === ownerTabId);
}

function structurallyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => structurallyEqual(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && structurallyEqual(left[key], right[key]));
}

function mergeImported(local: SightReadingLedger, imported: SightReadingLedger): SightReadingLedgerResult {
  const exposures: Record<string, SightReadingExposure> = { ...local.exposures };
  const attempts: Record<string, SightReadingAttempt> = { ...local.attempts };
  const localAttemptIds = new Set(Object.keys(local.attempts));
  for (const [attemptId, attempt] of Object.entries(imported.attempts)) {
    const existing = attempts[attemptId];
    const normalized = { ...normalizeAttempt(attempt), generation: local.generation };
    if (existing && !structurallyEqual(existing, normalized)) return { ok: false, reason: 'conflict' };
    if (!existing) attempts[attemptId] = normalized;
  }
  for (const [fingerprint, exposure] of Object.entries(imported.exposures)) {
    if (exposures[fingerprint]) continue;
    if (exposure.claim) {
      const importedAttempt = attempts[exposure.claim.attemptId];
      if (importedAttempt && !localAttemptIds.has(exposure.claim.attemptId)) {
        attempts[exposure.claim.attemptId] = { ...importedAttempt, status: 'abandoned', finishedAt: Date.now() };
      }
      else if (!importedAttempt) {
        attempts[exposure.claim.attemptId] = {
          attemptId: exposure.claim.attemptId,
          fingerprint,
          ownerTabId: exposure.claim.ownerTabId,
          generation: local.generation,
          status: 'abandoned',
          finishedAt: Date.now(),
          scoringVersion: 1,
          N: 0,
          TP: 0,
          FP: 0,
          FN: 0,
          G: 0,
          Q: 0,
          lateOrEarlyCount: 0,
          restViolations: 0,
          pitchPrecision: null,
          pitchRecall: null,
          pitchF1: null,
          rhythmAcc: null,
          score: null,
          stars: 0,
          perfect: false,
          meanOffsetMs: null,
          meanAbsoluteOffsetMs: null,
          noteResults: [],
          extraInputs: [],
          mixedInput: false,
        };
      }
    }
    exposures[fingerprint] = { firstSeenAt: exposure.firstSeenAt, reason: exposure.reason };
  }
  if (Object.keys(exposures).length > SRT_MAX_EXPOSURES) return { ok: false, reason: 'quota' };
  const trimmedAttempts = trimAttempts(attempts);
  return {
    ok: true,
    ledger: {
      ...local,
      revision: local.revision + 1,
      attempts: trimmedAttempts,
      exposures,
    },
  };
}

export async function srtLedgerUpdate(storage: SightReadingStorage, operation: SightReadingLedgerOperation): Promise<SightReadingLedgerResult> {
  if ((operation.type === 'claimExposure' || operation.type === 'recoverOrphanClaims') && !hasWebLocks()) return { ok: false, reason: 'unsupported' };
  return withLedgerLock(async () => {
    const raw = readRaw(storage);
    if (isRecord(raw) && typeof raw.schemaVersion === 'number' && raw.schemaVersion > SRT_LEDGER_SCHEMA)
      return { ok: false, reason: 'unsupported' };
    let ledger = srtReadLedger(storage);
    if (operation.type === 'resetLedger') return saveLedger(storage, srtCreateLedger());
    if (operation.generation !== ledger.generation && operation.type !== 'importLedger') return { ok: false, reason: 'stale_generation' };
    if (operation.type === 'claimExposure') {
      if (ledger.exposures[operation.fingerprint]) return { ok: false, reason: 'already_exposed' };
      if (Object.keys(ledger.exposures).length >= SRT_MAX_EXPOSURES) return { ok: false, reason: 'quota' };
      const exposures = {
        ...ledger.exposures,
        [operation.fingerprint]: {
          firstSeenAt: Date.now(),
          reason: 'first-sight',
          claim: { attemptId: operation.attemptId, ownerTabId: operation.ownerTabId, generation: operation.generation },
        },
      };
      return saveLedger(storage, { ...ledger, revision: ledger.revision + 1, exposures });
    }
    if (operation.type === 'recordExposure' || operation.type === 'recordListen') {
      if (Object.keys(ledger.exposures).length >= SRT_MAX_EXPOSURES && !ledger.exposures[operation.fingerprint]) return { ok: false, reason: 'quota' };
      const exposures = {
        ...ledger.exposures,
        [operation.fingerprint]: { firstSeenAt: ledger.exposures[operation.fingerprint]?.firstSeenAt ?? Date.now(), reason: operation.type === 'recordListen' ? 'listen' : operation.reason },
      };
      return saveLedger(storage, { ...ledger, revision: ledger.revision + 1, exposures });
    }
    if (operation.type === 'finishAttempt') {
      const attempt = normalizeAttempt(operation.attempt);
      const existing = ledger.attempts[attempt.attemptId];
      if (existing && JSON.stringify(existing) !== JSON.stringify(attempt)) return { ok: false, reason: 'conflict' };
      if (existing) return { ok: true, ledger };
      if (attempt.generation !== ledger.generation || !hasAttemptOwner(ledger, attempt.attemptId, attempt.ownerTabId)) return { ok: false, reason: 'owner_mismatch' };
      const attempts = trimAttempts({ ...ledger.attempts, [attempt.attemptId]: attempt });
      const exposures = Object.fromEntries(Object.entries(ledger.exposures).map(([fingerprint, exposure]) => (
        exposure.claim?.attemptId === attempt.attemptId
          ? [fingerprint, { firstSeenAt: exposure.firstSeenAt, reason: exposure.reason }]
          : [fingerprint, exposure]
      )));
      return saveLedger(storage, { ...ledger, revision: ledger.revision + 1, exposures, attempts });
    }
    if (operation.type === 'abandonAttempt') {
      if (!hasAttemptOwner(ledger, operation.attemptId, operation.ownerTabId)) return { ok: false, reason: 'owner_mismatch' };
      const exposureEntry = Object.entries(ledger.exposures).find(([, exposure]) => exposure.claim?.attemptId === operation.attemptId);
      if (!exposureEntry) return { ok: false, reason: 'owner_mismatch' };
      const [fingerprint] = exposureEntry;
      const attempt: SightReadingAttempt = {
        attemptId: operation.attemptId, fingerprint, ownerTabId: operation.ownerTabId, generation: ledger.generation,
        status: operation.status ?? 'abandoned', finishedAt: Date.now(), scoringVersion: 1, N: 0, TP: 0, FP: 0, FN: 0, G: 0, Q: 0,
        lateOrEarlyCount: 0, restViolations: 0, pitchPrecision: null, pitchRecall: null, pitchF1: null, rhythmAcc: null, score: null,
        stars: 0, perfect: false, meanOffsetMs: null, meanAbsoluteOffsetMs: null, noteResults: [], extraInputs: [],
        mixedInput: operation.mixedInput === true,
      };
      const exposures = { ...ledger.exposures, [fingerprint]: { firstSeenAt: ledger.exposures[fingerprint].firstSeenAt, reason: ledger.exposures[fingerprint].reason } };
      return saveLedger(storage, { ...ledger, revision: ledger.revision + 1, exposures, attempts: trimAttempts({ ...ledger.attempts, [operation.attemptId]: attempt }) });
    }
    if (operation.type === 'recoverOrphanClaims') {
      const attempts = { ...ledger.attempts };
      const exposures = { ...ledger.exposures };
      for (const [fingerprint, exposure] of Object.entries(exposures)) {
        const claim = exposure.claim;
        if (!claim || attempts[claim.attemptId] || claim.generation !== ledger.generation) continue;
        const available = await navigator.locks.request(`etude-sight-attempt-${claim.attemptId}`, { mode: 'exclusive', ifAvailable: true }, (lock) => lock !== null);
        if (!available) continue;
        attempts[claim.attemptId] = {
          attemptId: claim.attemptId, fingerprint, ownerTabId: claim.ownerTabId, generation: ledger.generation, status: 'abandoned', finishedAt: Date.now(),
          scoringVersion: 1, N: 0, TP: 0, FP: 0, FN: 0, G: 0, Q: 0, lateOrEarlyCount: 0, restViolations: 0,
          pitchPrecision: null, pitchRecall: null, pitchF1: null, rhythmAcc: null, score: null, stars: 0, perfect: false,
          meanOffsetMs: null, meanAbsoluteOffsetMs: null, noteResults: [], extraInputs: [], mixedInput: false,
        };
        exposures[fingerprint] = { firstSeenAt: exposure.firstSeenAt, reason: exposure.reason };
      }
      return saveLedger(storage, { ...ledger, revision: ledger.revision + 1, exposures, attempts: trimAttempts(attempts) });
    }
    if (operation.type === 'importLedger') {
      if (operation.generation !== ledger.generation) return { ok: false, reason: 'stale_generation' };
      const imported = mergeImported(ledger, operation.imported);
      if (!imported.ok) return imported;
      return saveLedger(storage, imported.ledger);
    }
    if (operation.type === 'updatePrefs') {
      return saveLedger(storage, { ...ledger, revision: ledger.revision + 1, prefs: { ...ledger.prefs, ...operation.prefs } });
    }
    return { ok: false, reason: 'unsupported' };
  });
}

export function srtLedgerExport(ledger: SightReadingLedger): SightReadingLedger {
  return normalizeLedger(ledger);
}

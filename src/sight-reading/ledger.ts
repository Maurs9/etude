import type { SightReadingEvaluation } from './evaluate.js';

export const SRT_LEDGER_KEY = 'etude-sight-v1' as const;
export const SRT_LEDGER_SCHEMA = 1 as const;
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
  | { readonly type: 'abandonAttempt'; readonly attemptId: string; readonly ownerTabId: string; readonly generation: string }
  | { readonly type: 'recordExposure'; readonly fingerprint: string; readonly reason: string; readonly generation: string }
  | { readonly type: 'resetLedger' }
  | { readonly type: 'updatePrefs'; readonly prefs: Readonly<Record<string, boolean>>; readonly generation: string };

export interface SightReadingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const parseJson: (text: string) => unknown = JSON.parse;

function generation(): string {
  return `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function srtCreateLedger(): SightReadingLedger {
  return { schemaVersion: 1, generation: generation(), revision: 0, exposures: {}, attempts: {}, prefs: { practiceHints: true, lookAhead: false }, sessions: {} };
}

export function srtReadLedger(storage: SightReadingStorage): SightReadingLedger {
  const raw = storage.getItem(SRT_LEDGER_KEY);
  if (!raw) return srtCreateLedger();
  try {
    const parsed = parseJson(raw);
    if (isLedger(parsed)) return parsed;
  } catch {
    // Corrupt local data is replaced with a fresh ledger.
  }

  function isLedger(value: unknown): value is SightReadingLedger {
    if (typeof value !== 'object' || value === null) return false;
    if (!('schemaVersion' in value) || value.schemaVersion !== 1) return false;
    if (!('generation' in value) || typeof value.generation !== 'string') return false;
    if (!('revision' in value) || typeof value.revision !== 'number') return false;
    if (!('exposures' in value) || typeof value.exposures !== 'object' || value.exposures === null) return false;
    if (!('attempts' in value) || typeof value.attempts !== 'object' || value.attempts === null) return false;
    if (!('prefs' in value) || typeof value.prefs !== 'object' || value.prefs === null) return false;
    if (!('sessions' in value) || typeof value.sessions !== 'object' || value.sessions === null) return false;
    return true;
  }
  return srtCreateLedger();
}

function saveLedger(storage: SightReadingStorage, ledger: SightReadingLedger): SightReadingLedgerResult {
  try {
    storage.setItem(SRT_LEDGER_KEY, JSON.stringify(ledger));
    return { ok: true, ledger };
  } catch {
    return { ok: false, reason: 'quota' };
  }
}

export async function srtLedgerUpdate(storage: SightReadingStorage, operation: SightReadingLedgerOperation): Promise<SightReadingLedgerResult> {
  const hasLocks = typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function';
  if (operation.type !== 'resetLedger' && !hasLocks && operation.type === 'claimExposure') return { ok: false, reason: 'unsupported' };
  const run = async (): Promise<SightReadingLedgerResult> => {
    let ledger = srtReadLedger(storage);
    if (operation.type === 'resetLedger') {
      ledger = srtCreateLedger();
      return saveLedger(storage, ledger);
    }
    if (operation.generation !== ledger.generation) return { ok: false, reason: 'stale_generation' };
    if (operation.type === 'claimExposure') {
      if (ledger.exposures[operation.fingerprint]?.claim) return { ok: false, reason: 'already_exposed' };
      const exposures = { ...ledger.exposures, [operation.fingerprint]: { firstSeenAt: Date.now(), reason: 'first-sight', claim: { attemptId: operation.attemptId, ownerTabId: operation.ownerTabId, generation: operation.generation } } };
      ledger = { ...ledger, revision: ledger.revision + 1, exposures };
    } else if (operation.type === 'recordExposure') {
      const exposures = { ...ledger.exposures, [operation.fingerprint]: { firstSeenAt: Date.now(), reason: operation.reason } };
      ledger = { ...ledger, revision: ledger.revision + 1, exposures };
    } else if (operation.type === 'finishAttempt') {
      if (operation.attempt.generation !== ledger.generation) return { ok: false, reason: 'stale_generation' };
      const existing = ledger.attempts[operation.attempt.attemptId];
      if (existing && JSON.stringify(existing) !== JSON.stringify(operation.attempt)) return { ok: false, reason: 'conflict' };
      if (existing) return { ok: true, ledger };
      const attempts = { ...ledger.attempts, [operation.attempt.attemptId]: operation.attempt };
      const entries = Object.entries(attempts).sort((a, b) => a[1].finishedAt - b[1].finishedAt || a[0].localeCompare(b[0])).slice(-500);
      ledger = { ...ledger, revision: ledger.revision + 1, attempts: Object.fromEntries(entries) };
    } else if (operation.type === 'abandonAttempt') {
      const exposure = Object.values(ledger.exposures).find((item) => item.claim?.attemptId === operation.attemptId);
      if (exposure?.claim?.ownerTabId !== operation.ownerTabId) return { ok: false, reason: 'owner_mismatch' };
      ledger = { ...ledger, revision: ledger.revision + 1 };
    } else if (operation.type === 'updatePrefs') {
      ledger = { ...ledger, revision: ledger.revision + 1, prefs: { ...ledger.prefs, ...operation.prefs } };
    }
    return saveLedger(storage, ledger);
  };
  if (!hasLocks) return run();
  return navigator.locks.request('etude-sight-ledger-v1', { mode: 'exclusive' }, run);
}

export function srtLedgerExport(ledger: SightReadingLedger): SightReadingLedger {
  return ledger;
}

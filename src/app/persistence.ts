import * as storage from '../domain/storage.js';
import { SYNC_NONE, syncCloneData, syncData, syncHasBase, syncIsObject, syncSame, type SyncNoBase } from '../core/sync-merge.js';
import { ITEM_BY_ID } from '../core/trainer-items.js';
import * as safety from '../domain/data-safety.js';
import { byId, buttonById } from '../domain/dom.js';
import { SCORE_SIDE_TABS } from '../domain/views.js';
import { SRT_LEDGER_KEY, isFutureSightLedgerStorage, isSightReadingLedger, srtReadLedger, srtResetLedgerTransaction } from '../sight-reading/ledger.js';

import type { AudioEngine } from '../domain/audio.js';
import type { BleMidiState } from '../domain/ble-midi.js';
import type { InstalledAppState, WakeLockState } from '../infra/pwa-lifecycle.js';
import type { MidiController } from '../infra/midi-controller.js';
import type { AppView } from '../domain/router.js';
import type { NotationSystem } from '../domain/score-types.js';
import type { InterfaceLanguage } from '../types/architecture.js';
import type { FeatureController, PracticeController, ReadController, ScoreLayoutPref, StoredTrainerData, UiPrefsSnapshot } from '../domain/views.js';

type LocaleStrings = Record<string, Record<string, string>>;
type ThemeChoice = 'auto' | 'light' | 'dark';

/** Shell state and services persistence reads; data and the top-level preferences are written back through setters. */
export interface PersistenceDeps {
  data: StoredTrainerData;
  lang: InterfaceLanguage;
  notation: NotationSystem;
  theme: ThemeChoice;
  labelMode: string;
  readonly reloadingForRestore: boolean;
  readonly strings: LocaleStrings;
  localeRequest: number;
  readonly audioEngine: AudioEngine;
  readonly midiController: MidiController;
  readonly metro: { bpm: number };
  readonly dock: { pref: boolean | null };
  readonly ble: BleMidiState;
  readonly pwa: InstalledAppState;
  readonly wake: WakeLockState;
  readonly loadedFeatures: Partial<Record<AppView, FeatureController>>;
  readonly practice: PracticeController | null;
  readonly read: ReadController | null;
  readonly todayN: () => number;
  readonly view0: () => string;
  readonly t: (key: string, ...args: Array<string | number | null | undefined>) => string;
  readonly appAlert: (message: string) => Promise<void>;
  readonly appConfirm: (message: string) => Promise<boolean>;
  readonly setLang: (lang: string | undefined, synchronized?: boolean) => Promise<void>;
  readonly isRuntimeLanguage: (value: unknown) => value is InterfaceLanguage;
  readonly applyTheme: () => void;
  readonly applyNotation: () => void;
  readonly localeLoadError: (retry: () => Promise<unknown>, target?: HTMLElement) => void;
  readonly reflectSettingsUI: () => void;
  readonly refreshToday: () => void;
  readonly renderProgress: () => void;
  readonly anyLoadedFeatureBusy: () => boolean;
  readonly freshData: () => StoredTrainerData;
  readonly restoreTrainerData: (saved: storage.PttV3Payload['data']) => StoredTrainerData;
  readonly scorePrefsNow: () => UiPrefsSnapshot;
  readonly setScorePrefs: (next: UiPrefsSnapshot) => void;
  readonly savedScoreView: (view: unknown, explicit: unknown) => ScoreLayoutPref | 'fall' | null;
  readonly defaultScoreLayoutForViewport: (viewportWidth: number) => ScoreLayoutPref;
  readonly buildKeyboard: () => void;
  readonly repaintHeld: () => void;
  readonly calUi: () => void;
  readonly calRecord: () => Record<string, unknown>;
  readonly pwaStandalone: () => boolean;
  readonly bleLive: () => boolean;
  readonly bleName: () => string;
  readonly syncWrite: (replacement?: { gen: string; data: StoredTrainerData }) => void;
  readonly storeApplyBackup: (payload: storage.PttV3Payload, reason: safety.SnapshotReason) => Promise<void>;
  readonly syncPayload: () => storage.PttV3Payload;
  readonly saveAll: () => void;
}

const KEY = storage.PTT_KEY, isBackupPayload = storage.isBackupPayload, isRecord = storage.isRecord, legacySettings = storage.legacySettings;
const parsePttV3 = storage.parsePttV3, readPttV3 = storage.readPttV3, restoreSettings = storage.restoreSettings, writePttV3 = storage.writePttV3;

/*
 * Persistence: loading and migrating `ptt-v3`, the multi-tab three-way sync, data safety (persistent storage, save
 * failures, rolling snapshots, export, import, restore and reset) and the top-level preferences. The write gateway
 * itself (syncWrite, storeApplyBackup, syncPayload, saveAll) stays in views-runtime.ts per AGENTS.md; this module merges,
 * validates and schedules around it.
 */
export function createPersistence(deps: PersistenceDeps) {
  /* ============================================================================
     PERSISTENCE  (versioned, migrates V2)
     ============================================================================ */
  function clampPersistedNumber(v: unknown, min: number, max: number, fallback: number) { return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback; }
  /* ---- several open tabs ----
     Each tab keeps the whole record in memory and saves all of it, so a plain write would wipe out whatever another tab saved
     in the meantime. Every write identifies its parent and each tab retains a short history of prior records. Before every
     write, and whenever another tab writes (the `storage` event), sibling records are merged three ways against their actual
     shared parent: a value only one side changed keeps that change; if both changed, counters add both increments, day stamps,
     bests and stars keep the larger value, a review card keeps the copy with more reviews, and anything else keeps this tab's
     value. The history holds private copies, so later changes in memory cannot alter a base. A save that merges in a record
     the other tab had not seen also names that record (`syncMerge`), and the tab keeps the plain merge of the two: when several
     tabs merge the same pair at once, that merge (or the first such save taken in) is their shared base, so nothing counts
     twice. Reset and import stamp a newer generation (`gen`) that other tabs adopt outright, with a notice, and a save from an
     older generation is overwritten again, so cleared progress cannot come back. A session running in this tab is never
     stopped or rebuilt: it carries on and saves into the merged record. Theme, language, note names and key labels follow the
     latest change made in any tab; the last three re-render the page and keyboard, so they wait while a drill, reading run or
     playback is going. Sound, device and panel choices stay with each tab (whichever saved last is what loads next time). */
  type SyncPrefName = 'theme' | 'lang' | 'notation' | 'labels';
  interface SyncPendingPref { v: unknown; from: string; running?: boolean; failed?: boolean }
  interface SyncState {
      raw: string | null;
      gen: string;
      id: string;
      known: Map<string, storage.PttV3Payload>;
      merge: { into: string; id: string } | null;
      pend: Partial<Record<SyncPrefName, SyncPendingPref>>;
      t: number | ReturnType<typeof setTimeout>;
      w: number | ReturnType<typeof setTimeout>;
  }
  const SYNC: SyncState = { raw: null, gen: '', id: '', known: new Map(), merge: null, pend: {}, t: 0, w: 0 }, SYNC_ID = /^[a-z0-9_-]{1,48}$/i;
  const SYNC_THEMES = ['auto', 'light', 'dark'] as const, SYNC_NOTATIONS = ['letter', 'solfege', 'german'] as const, SYNC_LABELS = ['c', 'all', 'none'] as const;
  const SYNC_TONES = ['piano', 'piano-synth', 'soft', 'bright', 'organ', 'mellow', 'glass'] as const;
  function syncOneOf<T extends string>(list: readonly T[], v: unknown): v is T { return list.some((x) => x === v); }
  function syncIsLang(v: unknown): v is InterfaceLanguage { return deps.isRuntimeLanguage(v); }
  const syncParseJson = storage.parseJson;
  type SyncPrefEntry = readonly [get: () => string, set: (v: unknown) => void | Promise<void>, later?: 1];
  const SYNC_PREFS: Record<SyncPrefName, SyncPrefEntry> = { theme: [() => deps.theme, (v: unknown) => { if (syncOneOf(SYNC_THEMES, v)) {
              deps.theme = v;
              deps.applyTheme();
          } }],
      lang: [() => deps.lang, (v: unknown) => { if (syncIsLang(v)) {
              return deps.setLang(v, true).catch(() => deps.localeLoadError(() => deps.setLang(v)));
          } }, 1],
      notation: [() => deps.notation, (v: unknown) => { if (syncOneOf(SYNC_NOTATIONS, v)) {
              deps.notation = v;
              deps.applyNotation();
              deps.refreshToday();
          } }, 1],
      labels: [() => deps.labelMode, (v: unknown) => { if (syncOneOf(SYNC_LABELS, v)) {
              deps.labelMode = v;
              deps.buildKeyboard();
              deps.repaintHeld();
          } }, 1] };
  function syncIsPrefName(k: string): k is SyncPrefName { return Object.prototype.hasOwnProperty.call(SYNC_PREFS, k); }
  function syncGen(time = Date.now()) { return time.toString(36).padStart(9, '0') + Math.random().toString(36).slice(2, 8); }
  function syncGenTime(gen: string) {
      return /^[0-9a-z]{9,15}$/.test(gen) ? parseInt(gen.slice(0, 9), 36) : -1;
  }
  function syncNextGen() {
      const saved = readPttV3(localStorage)?.payload.gen;
      const prior = Math.max(syncGenTime(SYNC.gen), typeof saved === 'string' ? syncGenTime(saved) : -1);
      return syncGen(Math.max(Date.now(), prior + 1));
  }
  function syncId(p: unknown, raw: string|null) {
      if (syncIsObject(p) && typeof p.syncId === 'string' && SYNC_ID.test(p.syncId))
          return p.syncId;
      const s = typeof raw === 'string' ? raw : JSON.stringify(p || {});
      let h = 2166136261;
      for (let i = 0; i < s.length; i++)
          h = Math.imul(h ^ s.charCodeAt(i), 16777619);
      return 'h' + (h >>> 0).toString(36);
  }
  function syncRemember(id: string, p: unknown) {
      if (!id || !isBackupPayload(p))
          return;
      SYNC.known.delete(id);
      SYNC.known.set(id, p);
      while (SYNC.known.size > 16) {
          const oldest = SYNC.known.keys().next();
          if (oldest.done)
              break;
          SYNC.known.delete(oldest.value);
      }
  }
  function syncCurrent(raw: string) { const p = parsePttV3(raw); SYNC.raw = raw; SYNC.id = syncId(p, raw); syncRemember(SYNC.id, p); }
   // its own copy: data may share objects with the record it was read from
  function syncPair(a: string, b: string) { return 'merge:' + [a, b].sort().join('+'); }
  function syncInitial() {
      const p = { v: 3, gen: SYNC.gen, data: syncCloneData(deps.data) };
      SYNC.id = 'init';
      SYNC.raw = null;
      syncRemember(SYNC.id, p);
  }
  function syncPref(f: SyncPrefName, v: string) { const p = SYNC.pend[f]; return p && p.from === v ? p.v : v; }
   // another tab's choice that is still waiting here is what gets saved
  // Folds in what another tab stored since SYNC.raw. Returns '' (nothing new), 'merge', 'merge-save' (the merged state must
  // be persisted), 'swap' (that tab reset or imported the record) or 'old' (it saved over this tab's newer reset or import).
  let syncPull = function syncPull() {
      let stored: storage.ReadPttResult | null = null;
      try {
          stored = readPttV3(localStorage, KEY);
      }
      catch (_) { }
      const cur = stored?.raw || null;
      if (cur === null || cur === SYNC.raw)
          return '';
      let rp: storage.PttV3Payload | null = null, bp: storage.PttV3Payload | SyncNoBase = SYNC_NONE, lp: storage.PttV3Payload | null = null;
      rp = stored?.payload || null;
      if (!rp)
          return '';
      if (storage.pttSchema(rp) > storage.PTT_SCHEMA || storage.hasFutureSightLedger(rp)) { // a newer build wrote it: merging would drop what this build does not know
          storeBlock();
          return '';
      }
      const gen = typeof rp.gen === 'string' ? rp.gen : '';
      // Older saves sometimes used labels instead of a timestamp-based generation.
      const remoteTime = syncGenTime(gen), localTime = syncGenTime(SYNC.gen);
      const order = remoteTime - localTime || (gen === SYNC.gen ? 0 : gen > SYNC.gen ? 1 : -1);
      const swap = order > 0;
      if (order < 0)
          return 'old';
      lp = parsePttV3(SYNC.raw);
      if (lp) {
          syncRemember(syncId(lp, SYNC.raw), lp);
          bp = lp;
      }
      const parent = typeof rp.syncParent === 'string' ? rp.syncParent : '', pair = parent && typeof rp.syncMerge === 'string' && SYNC_ID.test(rp.syncMerge) ? syncPair(parent, rp.syncMerge) : '';
      const ancestor = pair && SYNC.known.get(pair) || parent && SYNC.known.get(parent); // a merge of the same pair made or taken in here is the real shared base
      if (ancestor && (typeof ancestor.gen === 'string' ? ancestor.gen : '') === gen)
          bp = ancestor;
      const lid = SYNC.id, sibling = !swap && parent && lp && lp.syncParent === parent && lid !== syncId(rp, cur), sameData = !swap && syncSame(deps.data, rp.data) && !sibling;
      if (swap) {
          deps.data = deps.restoreTrainerData(rp.data);
          applyTopLevelPrefs(rp);
          SYNC.gen = gen;
          SYNC.known.clear();
          SYNC.merge = null;
      }
      else if (!sameData) {
          syncData(!syncHasBase(bp) ? bp : bp.data, deps.data, rp.data);
          deps.data.settings = restoreSettings(deps.data.settings);
          deps.data.srs = storage.restoreSrs(deps.data.srs);
          if (isRecord(deps.data.reading?.book)) deps.read?.forgetBook(deps.data.reading.book);
          if (!isRecord(deps.data.sheet)) deps.data.sheet = {};
      }
      if (swap || syncHasBase(bp))
          Object.keys(SYNC_PREFS).filter(syncIsPrefName).forEach((f) => {
              const [get, set, later] = SYNC_PREFS[f], v = rp[f];
              if (v === undefined || (!swap && syncHasBase(bp) && (v === bp[f] || syncPref(f, get()) !== bp[f])))
                  return; // the other tab did not change it, or this tab changed it too
              if (v === get()) {
                  // A newer choice can equal the committed language while an older import is still running.
                  if (f === 'lang' && SYNC.pend.lang?.running) deps.localeRequest++;
                  delete SYNC.pend[f];
              }
              else if (later)
                  SYNC.pend[f] = { v, from: get() };
              else
                  set(v);
          });
      const prefNeedsWrite = !swap && syncHasBase(bp) && Object.keys(SYNC_PREFS).filter(syncIsPrefName).some((f) => {
          const curPref = syncPref(f, SYNC_PREFS[f][0]());
          return bp[f] !== undefined && curPref !== bp[f] && curPref !== rp[f];
      });
      const needsWrite = !swap && (!syncSame(deps.data, rp.data) || prefNeedsWrite);
      syncCurrent(cur);
      if (needsWrite && isBackupPayload(lp) && parent !== lid && syncHasBase(bp)) { // theirs lacks this tab's record: keep the plain merge of the two for the save that follows
          const merged: Record<string, unknown> & { data: Record<string, unknown> } = { v: 3, gen, data: syncCloneData(lp.data) };
          syncData(bp.data, merged.data, rp.data);
          Object.keys(SYNC_PREFS).filter(syncIsPrefName).forEach((f) => { merged[f] = syncPref(f, SYNC_PREFS[f][0]()); });
          syncRemember(syncPair(SYNC.id, lid), merged);
          SYNC.merge = { into: SYNC.id, id: lid };
      }
      if (pair && !SYNC.known.has(pair))
          syncRemember(pair, SYNC.known.get(SYNC.id));
      return swap ? 'swap' : needsWrite ? 'merge-save' : 'merge';
  };
  function syncBusy() { return deps.anyLoadedFeatureBusy(); }
  function syncIdle() {
      clearTimeout(SYNC.w);
      if (!Object.keys(SYNC.pend).length)
          return;
      if (syncBusy()) {
          SYNC.w = setTimeout(syncIdle, 1500);
          return;
      }
      Object.keys(SYNC.pend).filter(syncIsPrefName).forEach((f) => {
          const p = SYNC.pend[f];
          if (!p || p.running || p.failed) return;
          if (SYNC_PREFS[f][0]() !== p.from) { delete SYNC.pend[f]; return; }
          p.running = true;
          const result = SYNC_PREFS[f][1](p.v);
          if (result) void result.finally(() => {
              if (SYNC.pend[f] !== p || p.failed) return;
              if (p.running) delete SYNC.pend[f];
              else syncIdle();
          });
          else delete SYNC.pend[f];
      });
  }
  function syncNote(on: boolean) { const n = byId('syncNote'); if (n)
      n.hidden = !on; }
  // Re-rendering waits for a fresh task, so a save made in the middle of drawing something is never re-entered.
  function syncAfter(got: string) { if (got === 'swap')
      syncNote(true); clearTimeout(SYNC.t); SYNC.t = setTimeout(syncRefresh, 0); }
  function syncRefresh() {
      syncIdle();
      deps.reflectSettingsUI();
      deps.calUi();
      renderDataSafety();
      if (deps.view0() === 'today' && !deps.practice?.sesActive())
          deps.refreshToday();
      else if (deps.view0() === 'progress')
          deps.renderProgress();
      for (const ctrl of Object.values(deps.loadedFeatures)) ctrl?.onStorageSync?.();
  }
  let _saveT: ReturnType<typeof setTimeout> | null = null;
  function flushSaveSoon() {
      if (_saveT === null) return;
      clearTimeout(_saveT);
      _saveT = null;
      deps.saveAll();
  }
  function saveSoon() {
      clearTimeout(_saveT ?? undefined);
      _saveT = setTimeout(flushSaveSoon, 400);
  }
   // for sliders — avoid a localStorage write per pixel
  // Data safety: storage the browser keeps, a visible save failure, rolling copies, and records this build must not overwrite.
  const STORE = { blocked: '' as '' | 'too-new' | 'quarantine' | 'upgrade', failed: false, unreadable: false, persist: 'unsupported' as safety.PersistState, usage: null as { usage: number; quota: number } | null, snaps: [] as safety.SnapshotInfo[], snapDay: -1, snapPending: false };
  const STORE_LAST_EXPORT = 'etude-last-export', STORE_SNAPSHOTS_CHANGED = 'etude-snapshots-changed', STORE_UNREADABLE = KEY + '-unreadable', STORE_EXPORT_DUE_MS = 14 * 864e5;
  /** The Export file: the saved record plus the sight-reading ledger. Uses memory when the last save failed. */
  function backupJson(): string {
      let current: storage.ReadPttResult | null = null;
      try {
          current = STORE.failed ? null : readPttV3(localStorage, KEY);
      }
      catch (_) { }
      const payload = current?.payload ?? deps.syncPayload();
      let ledger: unknown;
      try {
          const raw = localStorage.getItem(SRT_LEDGER_KEY);
          ledger = raw === null ? srtReadLedger(localStorage) : syncParseJson(raw);
      } catch { }
      const future = isRecord(ledger) && storage.hasFutureSightLedger({ v: 3, data: { sightLedger: ledger } });
      return storage.serializeProgressBackup(payload, isSightReadingLedger(ledger) || future ? ledger : undefined);
  }
  function storeSaved() { if (STORE.failed) {
      STORE.failed = false;
      storeNote();
  } storeDaily(); }
  function storeFailed() { if (STORE.failed)
      return; STORE.failed = true; storeNote(); }
  function storeBlock() { if (STORE.blocked === 'too-new')
      return; STORE.blocked = 'too-new'; storeNote(); }
  function storeHasProgress() {
      const reading = deps.data.reading, log = deps.data.practiceLog;
      const outcomes = [deps.data.srs, deps.data.learnDone, deps.data.singCleared, deps.data.sheet, reading?.lv, reading?.nt, reading?.book?.pieces];
      if (deps.data.totalReviews > 0 || deps.data.placed || (deps.data.lastDrill?.n ?? 0) > 0 || (log?.techRuns ?? 0) > 0 || (log?.melRuns ?? 0) > 0 || reading?.prefs?.warmDone ||
          outcomes.some(map => isRecord(map) && Object.keys(map).length > 0))
          return true;
      try {
          const ledger = srtReadLedger(localStorage);
          return Object.keys(ledger.attempts).length > 0 || Object.keys(ledger.sessions).length > 0;
      }
      catch (_) {
          return false;
      }
  }
  /** One copy a day, taken on the first save of the day. An empty record is not worth a slot. */
  function storeDaily() {
      const day = deps.todayN();
      if (STORE.blocked || STORE.snapPending || STORE.snapDay === day || !storeHasProgress())
          return;
      STORE.snapPending = true;
      void Promise.resolve().then(async () => {
          await safety.saveSnapshot({ day, reason: 'daily', raw: backupJson() });
          STORE.snapDay = day;
          storeSnapshotsChanged();
          await storeRefresh();
      }).catch((e: unknown) => console.warn('daily backup failed', e)).finally(() => { STORE.snapPending = false; });
  }
  function storeSnapshotsChanged() {
      try { localStorage.setItem(STORE_SNAPSHOTS_CHANGED, syncGen()); }
      catch (_) { }
  }
  const UPGRADE_SNAPSHOT_TIMEOUT_MS = 5000;
  async function storeSnapshot(reason: safety.SnapshotReason, raw: string, timeoutMs?: number): Promise<boolean> {
      let timer = 0;
      try {
          const write = safety.saveSnapshot({ day: deps.todayN(), reason, raw });
          if (timeoutMs && timeoutMs > 0) {
              write.catch(() => { });
              await Promise.race([
                  write,
                  new Promise<never>((_, reject) => {
                      timer = window.setTimeout(() => reject(new Error('Backup snapshot timed out')), timeoutMs);
                  }),
              ]);
          }
          else {
              await write;
          }
          storeSnapshotsChanged();
          void storeRefresh();
          return true;
      }
      catch (e) {
          console.warn('backup copy failed', e);
          return false;
      }
      finally {
          if (timer) clearTimeout(timer);
      }
  }
  /** A record that does not parse is kept before anything can save over it. */
  function storeQuarantine(text: string) {
      STORE.unreadable = true;
      let kept = false;
      try {
          localStorage.setItem(STORE_UNREADABLE, text);
          kept = true;
      }
      catch (_) { }
      if (!kept)
          STORE.blocked = 'quarantine'; // no copy yet: saving now would destroy the only one
      void storeSnapshot('unreadable', text).then((ok) => {
          if (!ok)
              return;
          try {
              localStorage.removeItem(STORE_UNREADABLE); // IndexedDB holds it now: free the quota the live record needs
          }
          catch (_) { }
          if (STORE.blocked === 'quarantine') {
              STORE.blocked = '';
              storeNote();
              deps.saveAll();
          }
      });
  }
  function storeBackupBlocked(): boolean {
      if (STORE.blocked === 'too-new')
          return true;
      if (isFutureSightLedgerStorage(localStorage)) {
          storeBlock();
          return true;
      }
      const saved = readPttV3(localStorage, KEY);
      if (!saved || (storage.pttSchema(saved.payload) <= storage.PTT_SCHEMA && !storage.hasFutureSightLedger(saved.payload)))
          return false;
      storeBlock();
      return true;
  }
  const MAX_PROGRESS_IMPORT_BYTES = 16 * 1024 * 1024;
  let progressRestorePending = false;
  async function storeRestore(id: number | undefined) {
      if (!id || progressRestorePending || deps.reloadingForRestore)
          return;
      progressRestorePending = true;
      try {
          if (storeBackupBlocked()) {
              await deps.appAlert(deps.t('store_too_new'));
              return;
          }
          if (STORE.blocked === 'upgrade') {
              await deps.appAlert(deps.t('store_upgrade_stuck'));
              return;
          }
          const snap = await safety.readSnapshot(id), p = snap ? parsePttV3(snap.raw) : null;
          if (!snap || !p) {
              await deps.appAlert(deps.t('import_bad'));
              return;
          }
          if ((storage.pttSchema(p) > storage.PTT_SCHEMA || storage.hasFutureSightLedger(p))) {
              await deps.appAlert(deps.t('import_too_new'));
              return;
          }
          if (!storage.isImportableBackup(p)) {
              await deps.appAlert(deps.t('import_bad'));
              return;
          }
          if (await deps.appConfirm(deps.t('snap_confirm', storeWhen(snap.id))))
              await deps.storeApplyBackup(p, 'before-restore');
      }
      catch (_) {
          await deps.appAlert(deps.t('import_storage'));
      }
      finally {
          progressRestorePending = false;
      }
  }
  async function storeReset() {
      const button = buttonById('resetBtn');
      if (button.disabled || progressRestorePending || deps.reloadingForRestore)
          return;
      if (!await deps.appConfirm(deps.t('reset_confirm')))
          return;
      if (button.disabled || progressRestorePending || deps.reloadingForRestore)
          return;
      const checkWritable = () => {
          if (storeBackupBlocked() || STORE.blocked)
              throw new Error('Progress is protected');
      };
      button.disabled = progressRestorePending = true;
      try {
          const result = await srtResetLedgerTransaction(localStorage, async () => {
              checkWritable();
              syncPull();
              return await storeSnapshot('before-reset', backupJson()) || await deps.appConfirm(deps.t('store_reset_copy_failed'));
          }, () => {
              checkWritable();
              syncPull();
              const reset = { ...deps.freshData(), settings: deps.data.settings, latency: deps.calRecord().latency };
              deps.syncWrite({ gen: syncNextGen(), data: reset });
          });
          if (!result)
              return;
          if (!result.ok) {
              await deps.appAlert(deps.t(result.reason === 'unsupported' ? 'store_too_new' : 'store_reset_failed'));
              return;
          }
          storeSaved();
          for (const ctrl of Object.values(deps.loadedFeatures)) ctrl?.onProgressReset?.();
          deps.renderProgress();
          deps.refreshToday();
      }
      catch (_) {
          await deps.appAlert(deps.t(STORE.blocked === 'too-new' ? 'store_too_new' : STORE.blocked === 'quarantine' ? 'store_stuck' : STORE.blocked === 'upgrade' ? 'store_upgrade_stuck' : 'store_reset_failed'));
      }
      finally {
          button.disabled = progressRestorePending = false;
      }
  }
  function storeExported() {
      if (STORE.blocked) return;
      try {
          localStorage.setItem(STORE_LAST_EXPORT, String(Date.now()));
      }
      catch (_) { }
      renderDataSafety();
  }
  function storeLastExport(): number {
      try {
          const v = Number(localStorage.getItem(STORE_LAST_EXPORT));
          return Number.isFinite(v) && v > 0 ? v : 0;
      }
      catch (_) {
          return 0;
      }
  }
  function storeWhen(ms: number) { return new Date(ms).toLocaleString(deps.lang, { dateStyle: 'medium', timeStyle: 'short' }); }
  function storeSize(bytes: number) { return bytes < 1e6 ? Math.max(1, Math.round(bytes / 1e3)) + ' kB' : (bytes / 1e6).toFixed(1) + ' MB'; }
  async function storeRefresh() {
      try {
          STORE.snaps = await safety.listSnapshots();
      }
      catch (_) {
          STORE.snaps = [];
      }
      STORE.usage = await safety.storageUsage(navigator.storage);
      renderDataSafety();
      storeNote();
      if (byId('set-diag').hasAttribute('open')) void storeDiagRender();
  }
  /** loadAll runs before the locale loads: render nothing until strings exist. applyI18n renders again. */
  function storeI18nReady() { return !!(deps.strings[deps.lang] || deps.strings.en); }
  function renderDataSafety() {
      if (!storeI18nReady())
          return;
      const st = document.getElementById('set-storage-status'), age = document.getElementById('set-backup-age'), sel = document.getElementById('set-snaps'), btn = document.getElementById('set-snap-restore');
      if (!st || !age || !(sel instanceof HTMLSelectElement) || !(btn instanceof HTMLButtonElement))
          return;
      const key = STORE.persist === 'persisted' ? 'set_storage_on' : STORE.persist === 'best-effort' ? 'set_storage_off' : 'set_storage_na';
      st.textContent = deps.t(key) + (STORE.usage ? ' ' + deps.t('set_storage_used', storeSize(STORE.usage.usage)) : '');
      const last = storeLastExport();
      age.textContent = last ? deps.t('set_backup_last', storeWhen(last)) : deps.t('set_backup_never');
      age.classList.toggle('warn', storeHasProgress() && (!last || Date.now() - last > STORE_EXPORT_DUE_MS));
      const list = STORE.snaps.filter(x => x.reason !== 'unreadable'), selected = sel.dataset.selected;
      sel.replaceChildren(...list.map((x) => { const o = document.createElement('option'); o.value = String(x.id); o.textContent = deps.t('snap_item', storeWhen(x.id), deps.t('snap_' + x.reason.replace('-', '_'))); return o; }));
      if (!list.length) {
          const o = document.createElement('option');
          o.value = '';
          o.textContent = deps.t('set_snap_none');
          sel.append(o);
      }
      if (selected && list.some(x => String(x.id) === selected)) sel.value = selected;
      else delete sel.dataset.selected;
      sel.disabled = btn.disabled = !list.length || STORE.blocked === 'too-new' || STORE.blocked === 'upgrade';
  }
  function storeNote() {
      const box = document.getElementById('storeNote'), txt = document.getElementById('storeNoteText');
      if (!box || !txt || !storeI18nReady())
          return;
      const mode = STORE.blocked === 'too-new' ? 'too-new' : STORE.blocked === 'quarantine' ? 'stuck' : STORE.blocked === 'upgrade' ? 'upgrade' : STORE.failed ? 'failed' : STORE.unreadable ? 'unreadable' : '';
      box.hidden = !mode;
      if (mode === 'too-new' || mode === 'upgrade') {
          for (const id of ['importBtn', 'prog-import', 'set-snap-restore']) {
              buttonById(id).disabled = true;
          }
      }
      if (!mode)
          return;
      const restorable = STORE.snaps.some(x => x.reason !== 'unreadable');
      const key = mode === 'too-new' ? 'store_too_new' : mode === 'stuck' ? 'store_stuck' : mode === 'upgrade' ? 'store_upgrade_stuck' : mode === 'failed' ? 'store_fail' : restorable ? 'store_unreadable' : 'store_unreadable_nobk';
      txt.dataset.i18n = key; // applyI18n keeps it in the current language
      txt.textContent = deps.t(key);
      byId('storeNoteExport').hidden = mode !== 'failed' && mode !== 'stuck' && mode !== 'upgrade';
      byId('storeNoteReload').hidden = mode !== 'too-new' && mode !== 'upgrade';
      byId('storeNoteRestore').hidden = !(mode === 'unreadable' && restorable);
      byId('storeNoteOk').hidden = mode !== 'unreadable';
  }
  /** Plain-English facts for a bug report. Not translated: it is meant to be copied as is. */
  async function storeDiagnostics(): Promise<string> {
      let version = 'not cached';
      try {
          const names = 'caches' in window ? (await caches.keys()).filter(n => n.startsWith('etude-') && n !== 'etude-active') : [];
          if (names.length)
              version = names.join(', ');
      }
      catch (_) { }
      const standalone = deps.pwaStandalone();
      const u = STORE.usage, snaps = STORE.snaps.filter(x => x.reason !== 'unreadable'), last = storeLastExport();
      const ctx = deps.audioEngine.context;
      return [
          'App version: ' + version,
          'Service worker: ' + (deps.pwa.sw || 'none') + (deps.pwa.err ? ' (' + deps.pwa.err + ')' : ''),
          'Display: ' + (standalone ? 'installed app' : 'browser tab'),
          'Storage: ' + STORE.persist + (u ? ', ' + storeSize(u.usage) + ' of ' + storeSize(u.quota) : ''),
          'Saving: ' + (STORE.blocked ? 'stopped (' + STORE.blocked + ')' : STORE.failed ? 'failing' : 'ok') + (STORE.unreadable ? ', unreadable record kept' : ''),
          'Automatic backups: ' + snaps.length + (snaps[0] ? ', newest ' + new Date(snaps[0].id).toISOString() : ''),
          'Last export: ' + (last ? new Date(last).toISOString() : 'never'),
          deps.midiController.describeInputs(),
          'Bluetooth MIDI: ' + (deps.bleLive() ? deps.bleName() : 'not connected'),
          'Audio: ' + (ctx ? ctx.state + ', ' + ctx.sampleRate + ' Hz' + storeMs(', base ', ctx.baseLatency) + storeMs(', output ', ctx.outputLatency) : 'not started'),
          'Browser: ' + navigator.userAgent,
      ].join('\n');
  }
  function storeMs(label: string, seconds: unknown) { return typeof seconds === 'number' && Number.isFinite(seconds) ? label + Math.round(seconds * 1000) + ' ms' : ''; }
  async function storeDiagRender() {
      const out = document.getElementById('set-diag-out');
      if (out)
          out.textContent = await storeDiagnostics();
  }
  /** Chrome grants persistent storage without a prompt, mostly to installed apps. Ask once, on the first tap or key. */
  function storeInit() {
      const sm = navigator.storage;
      void safety.persistState(sm).then((state) => {
          STORE.persist = state;
          void storeRefresh();
          if (state !== 'best-effort')
              return;
          const ask = () => {
              window.removeEventListener('pointerdown', ask, true);
              window.removeEventListener('keydown', ask, true);
              void safety.requestPersist(sm).then((next) => { STORE.persist = next; renderDataSafety(); });
          };
          window.addEventListener('pointerdown', ask, true);
          window.addEventListener('keydown', ask, true);
      });
      storeNote();
  }
  function applyTopLevelPrefs(raw: storage.PttV3Payload) {
      deps.audioEngine.tone = raw.audioEngine === 'recorded-piano-v2' && raw.tone && syncOneOf(SYNC_TONES, raw.tone) ? raw.tone : 'piano';
      deps.audioEngine.masterVolume = clampPersistedNumber(raw.masterVol, 0, 1, deps.audioEngine.masterVolume);
      if (typeof raw.muted === 'boolean')
          deps.audioEngine.muted = raw.muted;
      if (typeof raw.localSynth === 'boolean')
          deps.audioEngine.localSynth = raw.localSynth;
      deps.audioEngine.reverbWet = clampPersistedNumber(raw.reverb, 0, 0.5, deps.audioEngine.reverbWet);
      deps.audioEngine.applyOutputMix();
      deps.metro.bpm = Math.round(clampPersistedNumber(raw.bpm, 50, 180, deps.metro.bpm));
      deps.midiController.restoreSavedDevice(raw.device, raw.deviceName);
      const prevScore = deps.scorePrefsNow();
      const scoreView = deps.savedScoreView(raw.scoreView, raw.scoreViewExplicit);
      const nextSide = { ...prevScore.anSide };
      if (typeof raw.kbDock === 'boolean')
          deps.dock.pref = raw.kbDock;
      else if (typeof raw.anKb === 'boolean')
          deps.dock.pref = raw.anKb; // the Score & analysis choice becomes the choice for every view
      if (typeof raw.wake === 'boolean')
          deps.wake.want = raw.wake;
      const bl = raw.ble;
      if (bl === null) deps.ble.saved = null;
      if (isRecord(bl) && typeof bl.id === 'string' && bl.id)
          deps.ble.saved = { id: bl.id, name: typeof bl.name === 'string' ? bl.name : '', auto: bl.auto !== false };
      const sd = raw.anSide;
      if (isRecord(sd)) {
          if (typeof sd.open === 'boolean')
              nextSide.open = sd.open;
          if (typeof sd.tab === 'string' && SCORE_SIDE_TABS.includes(sd.tab))
              nextSide.tab = sd.tab;
          if (typeof sd.w === 'number' && Number.isFinite(sd.w))
              nextSide.w = Math.max(280, Math.min(560, Math.round(sd.w)));
      }
      deps.setScorePrefs({
          scoreLook: raw.scoreLook === 'paper' || raw.scoreLook === 'night' ? raw.scoreLook : prevScore.scoreLook,
          scoreHl: typeof raw.scoreHl === 'boolean' ? raw.scoreHl : prevScore.scoreHl,
          scoreLayout: scoreView && scoreView !== 'fall' ? scoreView : deps.defaultScoreLayoutForViewport(window.innerWidth),
          scoreFallMode: scoreView === 'fall' ? 'fall' : 'score',
          scoreLayoutExplicit: scoreView !== null,
          anSide: nextSide,
      });
  }
  async function loadAll() {
      try {
          SYNC.known.clear();
          SYNC.id = '';
          SYNC.merge = null;
          const load = () => {
              const text = localStorage.getItem(KEY), stored = readPttV3(localStorage);
              return { text, stored, migrated: stored ? storage.migratePtt(stored.payload) : null };
          };
          let { text, stored, migrated } = load();
          let upgradeLoopExhausted = true;
          for (let attempts = 0; attempts < 3 && stored && migrated?.status === 'migrated' && !storage.hasFutureSightLedger(stored.payload); attempts++) {
              const copied = await storeSnapshot('before-upgrade', stored.raw, UPGRADE_SNAPSHOT_TIMEOUT_MS);
              // Recheck after the IndexedDB write in case another tab saved a different record.
              if (localStorage.getItem(KEY) !== stored.raw) {
                  ({ text, stored, migrated } = load());
                  continue;
              }
              if (!copied) STORE.blocked = 'upgrade';
              else {
                  try {
                      const raw = writePttV3(localStorage, migrated.payload);
                      stored = { raw, payload: migrated.payload };
                  }
                  catch (_) { storeFailed(); }
              }
              upgradeLoopExhausted = false;
              break;
          }
          if (upgradeLoopExhausted && stored && migrated?.status === 'migrated' && !storage.hasFutureSightLedger(stored.payload) && !STORE.blocked)
              STORE.blocked = 'upgrade';
          if (text && !stored)
              storeQuarantine(text);
          if (migrated?.status === 'too-new' || (stored && storage.hasFutureSightLedger(stored.payload)) || isFutureSightLedgerStorage(localStorage)) {
              storeBlock();
              return;
          }
          const raw = migrated?.payload;
          if (raw && stored) {
              SYNC.gen = typeof raw.gen === 'string' ? raw.gen : '';
              syncCurrent(stored.raw);
              deps.data = deps.restoreTrainerData(raw.data);
              if (raw.lang && syncIsLang(raw.lang))
                  deps.lang = raw.lang;
              if (raw.theme && syncOneOf(SYNC_THEMES, raw.theme))
                  deps.theme = raw.theme;
              if (syncOneOf(SYNC_NOTATIONS, raw.notation))
                  deps.notation = raw.notation;
              if (syncOneOf(SYNC_LABELS, raw.labels))
                  deps.labelMode = raw.labels;
              applyTopLevelPrefs(raw);
              return;
          }
          // migrate from V2 settings (notation/tone) if present
          const v2s = legacySettings(localStorage);
          if (v2s) {
              const noteSys = String(v2s.noteSys);
              if (syncOneOf(SYNC_NOTATIONS, noteSys))
                  deps.notation = noteSys;
              deps.audioEngine.tone = 'piano';
              deps.audioEngine.masterVolume = clampPersistedNumber(v2s.vol, 0, 1, deps.audioEngine.masterVolume);
          }
          let v2st: unknown;
          try { v2st = syncParseJson(localStorage.getItem('ptt-stats-v2') || 'null'); } catch { }
          if (isRecord(v2st) && v2st.items) { // seed SRS boxes from V2 per-item accuracy
              const map = { iv: 'iv', ch: 'ch', sc: 'sc', pr: 'pr' }, v2items = v2st.items;
              Object.keys(map).forEach((mode) => { const found = syncIsObject(v2items) ? v2items[mode] : undefined, it: Record<string, unknown> = syncIsObject(found) ? found : {}; Object.keys(it).forEach((k) => { const rec = it[k]; const id = (mode === 'iv' ? 'iv:' : mode === 'ch' ? 'ch:' : mode === 'sc' ? 'sc:' : 'pr:') + k; if (ITEM_BY_ID[id] && syncIsObject(rec) && Number(rec.seen) >= 2) {
                  const seen = Number(rec.seen);
                  if (!Number.isFinite(seen)) return;
                  const misses = clampPersistedNumber(rec.miss, 0, seen, 0);
                  const acc = 1 - misses / seen;
                  const box = acc > .85 ? 3 : acc > .6 ? 2 : 1;
                  deps.data.srs[id] = { box, ease: 2.3, reps: seen, lapses: misses, due: deps.todayN() + (box >= 3 ? 4 : 1), last: deps.todayN() };
              } }); });
          }
          if (navigator.language && /^ro/i.test(navigator.language)) {
              deps.lang = 'ro'; // first-time Romanian browser → Romanian UI + Do-Re-Mi default
              deps.notation = 'solfege';
          }
          syncInitial();
      }
      catch (e) {
          console.warn('load failed', e);
      }
  }

  return {
    clampPersistedNumber,
    SYNC,
    SYNC_ID,
    SYNC_THEMES,
    SYNC_NOTATIONS,
    SYNC_LABELS,
    SYNC_TONES,
    syncOneOf,
    syncIsLang,
    syncParseJson,
    SYNC_PREFS,
    syncIsPrefName,
    syncGen,
    syncGenTime,
    syncNextGen,
    syncId,
    syncRemember,
    syncCurrent,
    syncPair,
    syncInitial,
    syncPref,
    /** Intentionally mutable: a regression test replaces it in place. */
    get syncPull() { return syncPull; },
    set syncPull(value: typeof syncPull) { syncPull = value; },
    syncBusy,
    syncIdle,
    syncNote,
    syncAfter,
    syncRefresh,
    flushSaveSoon,
    saveSoon,
    STORE,
    STORE_LAST_EXPORT,
    STORE_SNAPSHOTS_CHANGED,
    STORE_UNREADABLE,
    STORE_EXPORT_DUE_MS,
    backupJson,
    storeSaved,
    storeFailed,
    storeBlock,
    storeHasProgress,
    storeDaily,
    storeSnapshotsChanged,
    UPGRADE_SNAPSHOT_TIMEOUT_MS,
    storeSnapshot,
    storeQuarantine,
    storeBackupBlocked,
    MAX_PROGRESS_IMPORT_BYTES,
    get progressRestorePending() { return progressRestorePending; },
    set progressRestorePending(value: boolean) { progressRestorePending = value; },
    /** The pending saveSoon() timer (the restore path clears it before replacing the record). */
    get saveTimer() { return _saveT; },
    set saveTimer(value: ReturnType<typeof setTimeout> | null) { _saveT = value; },
    storeRestore,
    storeReset,
    storeExported,
    storeLastExport,
    storeWhen,
    storeSize,
    storeRefresh,
    storeI18nReady,
    renderDataSafety,
    storeNote,
    storeDiagnostics,
    storeMs,
    storeDiagRender,
    storeInit,
    applyTopLevelPrefs,
    loadAll,
  };
}

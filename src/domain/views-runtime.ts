import { loadUI, loadLearn } from '../locales/loader.js';
import { installLibraryCopy } from '../locales/library-runtime.js';
import { LESSONS } from '../locales/catalog.js';
import type { UIPayload } from '../locales/payload-types.js';
import type { LessonMetadata as Lesson, Localised, MusicTranslations, StepLabels } from '../locales/content-types.js';
import * as storage from './storage.js';
import {
  SRS_INTERVALS, SYNC_ADD, SYNC_MAX, SYNC_NONE, localDayNumber,
  syncCloneData, syncData, syncHasBase, syncInto, syncIsObject,
  syncNewCollisions, syncPick, syncSame, syncSrs, syncSrsPair,
  type SyncNoBase,
} from '../core/sync-merge.js';
import {
  srsBox, srsDueItems, srsEntryOf, srsIsDue, srsIsNew, srsMasteredCount, srsNewItems, srsNewQuotaLeft,
  srsReview, srsSeedPlacement,
} from '../core/srs.js';
import { isSubset, randItem, setEq, shuffle } from '../core/collections.js';
import { CATS, INTRO_CH, INTRO_IV, INTRO_SC, ITEMS, ITEM_BY_ID, isCatKey } from '../core/trainer-items.js';
import {
  learnData as coreLearnData,
  learnDueDays as coreLearnDueDays,
  learnDueList as coreLearnDueList,
  learnGap as coreLearnGap,
  learnUnitDone as coreLearnUnitDone,
  learnUnitOf as coreLearnUnitOf,
} from '../core/learn-progress.js';
import * as safety from './data-safety.js';
import { createCoaching } from '../app/coaching.js';
import { RD_ALL, RD_ALLIV, RD_LV, RD_UNITS, rdS, rdU, type ReadDrillLevel } from '../core/reading-curriculum.js';
import { createPwaLifecycle, WAKE_IDLE_MS, type InstallPromptEvent } from '../infra/pwa-lifecycle.js';
import * as theory from './theory.js';
import * as audio from './audio.js';
import type * as notationApi from './notation.js';
import * as scoreLibraryStore from './score-library-store.js';
import { AN_MAX_BYTES, AN_MAX_NOTES, AN_MAX_XML_CHARS, CLEF_F, CLEF_G, CLEF_SCALE, NOTE_SYS, PC_FLAT, PC_SHARP, ROOT_NAMES, SC_BASE, SC_PAGE_W, SR_LET, SS_FLAT_ORDER, SS_LETSEMI, SS_SHARP_ORDER, anError, rdPercClef, srPitch, ssAccGlyph, ssFlat, ssKeyAcc, ssMidiOf, ssNatural, ssNotehead, ssSharp, ssStepOf, xmlEsc } from './score-types.js';
import { ACCOMP_I18N, ACCOMP_PATTERNS, ACCOMP_PROGS, CHORD_FEEL, CIRCLE, COMPOUND, INTERVALS, INV_NAMES, LP, MAJOR, PIECES, RO_IV, ROMAN, SONGS, dispSym, progChordTpl } from './repertoire-data.js';
import { srBeatPt, srClef, srEvents, srKeySigG, srLedger2, srRest, srStem2, srStemLine, srTimeSigG } from './grand-staff.js';

import '../styles/score-library.css';
import '../styles/native.css';
import * as router from './router.js';
import { byId, downloadBlob, maybeById, inputById, selectById, buttonById, eventElement, eventClosest, queryHtml, queryAllHtml, onPageReturn } from './dom.js';
import { createTestSurfaceRegistry, SCORE_SIDE_TABS, type AppHost, type ScorePlayerController, type PracticeController, type PracticeShell, type ProgressController, type ProgressShell, type TodayController, type TodayShell, type ReadController, type ReadShell, type ScorePlayerShell, type EtudeSurface, type FeatureController, type InputBusListener, type PreviewSequenceFrame, type ReadDrillData, type ShowFn, type ShowOptions, type StoredTrainerData, type UiPrefsPatch, type UiPrefsSnapshot, type UiPrefsStore, type ViewApplicationState, type ViewEventHandler, type ViewEventName } from './views.js';
import type { InterfaceLanguage } from '../types/architecture.js';
import { eventTime, useLatencyOffsets, withInputTime } from './midi-timing.js';
import { createTimingCalibration } from './midi-calibration.js';
import { BLE_MIDI_CHR, BLE_MIDI_SVC, createBleMidi, type BleMidiDevice } from './ble-midi.js';
import { createMidiController } from '../infra/midi-controller.js';
import { pickArturia } from './midi-input-selection.js';
import '../styles/calibration.css';
import '../styles/landscape.css';
import '../styles/reading.css';
import '../styles/read-home.css';
import '../styles/practice.css';
import '../styles/voice.css';
import '../styles/explore.css';
import '../styles/pieces.css';
import '../styles/score-fullscreen.css';
import '../styles/layout.css';
import { SRT_LEDGER_KEY, isFutureSightLedgerStorage, isSightReadingLedger, srtAcquireAttemptLease, srtCreateLedger, srtLedgerReadStatus, srtLedgerUpdate, srtReadLedger, srtResetLedgerTransaction } from '../sight-reading/ledger.js';
import '../styles/sight-rhythm.css';


function runtimeErrorName(value: unknown): string {
  return value instanceof Error ? value.name : '';
}

function runtimeErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

declare global {
  interface Navigator {
    bluetooth?: {
      requestDevice(options?: Record<string, unknown>): Promise<BleMidiDevice>;
      getDevices?(): Promise<BleMidiDevice[]>;
    };
    keyboard?: {
      lock?(keys?: string[]): Promise<void>;
      unlock?(): void;
      getLayoutMap?(): Promise<{ get(code: string): string | undefined }>;
    };
    standalone?: boolean;
  }
  interface WindowEventMap {
    beforeinstallprompt: InstallPromptEvent;
  }
  interface HTMLSelectElement {
    /** Set once the runtime has filled a lazily populated `<select>`. */
    _filled?: boolean;
  }
  interface HTMLButtonElement {
    /** A piano key held down with Space or Enter. */
    _kd?: boolean;
  }
}

const pianoAssets = import.meta.glob<string>('../assets/piano/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
});
const pianoUrls: Record<number, string> = {};
for (const [path, url] of Object.entries(pianoAssets)) pianoUrls[Number(path.match(/(\d+)\.mp3$/)?.[1])] = url;
/** Every interface language the shell offers. */
type RuntimeLanguage = InterfaceLanguage;
const RUNTIME_LANGUAGES: readonly RuntimeLanguage[] = ['en', 'ro', 'es', 'fr', 'de', 'it', 'pt-BR'];
function isRuntimeLanguage(value: unknown): value is RuntimeLanguage { return RUNTIME_LANGUAGES.some((l) => l === value); }
type LocaleStrings = Record<string, Record<string, string>>;
/**
 * Behaviour-preserving browser runtime for the typed view boundary in
 * `views.ts`. New public view contracts belong in the TypeScript entry point;
 * browser-only compatibility remains local to this module.
 */
"use strict";
let STRINGS: LocaleStrings = {};
let I18N_MUSIC: MusicTranslations = { intervals: {}, scales: {}, chords: {}, categories: {}, inversions: {}, feels: {}, songs: {} };
let STEP_LABELS: StepLabels = {};
let LOCALE_TAGS: Record<string, string> = {};
let localeRequest = 0;
function installUI(payload: UIPayload) {
    ({ STRINGS, I18N_MUSIC, STEP_LABELS, LOCALE_TAGS } = payload);
    installLibraryCopy(payload.LIBRARY);
}
function localize(key: string, fallback: string): string {
    return (STRINGS[lang] || STRINGS.en) ? t(key) : fallback;
}
/** Keep the currently committed language intact on failure; never auto-reload a session. */
function localeLoadError(retry: () => Promise<unknown>, target: HTMLElement = document.body) {
    document.getElementById('locale-load-error')?.remove();
    const box = document.createElement('div'), drawer = byId('drawer'), help = byId('helpBox');
    const host = drawer.classList.contains('on') ? (byId('set-lang').closest('.set-group') ?? drawer)
        : help.classList.contains('on') ? help : target;
    box.id = 'locale-load-error';
    box.setAttribute('role', 'alert');
    if (host === document.body) box.className = 'locale-load-toast';
    const unsaved = () => STORE.failed || STORE.blocked === 'quarantine' || STORE.blocked === 'upgrade';
    const message = document.createElement('p');
    message.textContent = localize('locale_fetch_failed', 'Content could not be loaded. Check your connection and retry, or reload.');
    const actions = document.createElement('div');
    actions.className = 'set-btns';
    const button = (label: string, action: () => void) => {
        const control = document.createElement('button');
        control.type = 'button';
        control.className = 'btn sm';
        control.textContent = label;
        control.addEventListener('click', action);
        actions.append(control);
        return control;
    };
    button(localize('rdn_retry', 'Retry'), () => {
        box.remove();
        void retry().catch(() => localeLoadError(retry, target));
    }).dataset.lazyRetry = '';
    if (unsaved()) {
        const status = document.createElement('p');
        status.textContent = localize('store_fail', 'Progress could not be saved. Export a backup before reloading.');
        box.append(message, status);
        button(localize('store_export', 'Export backup'), () => byId('exportBtn').click()).dataset.lazyExport = '';
    } else {
        box.append(message);
    }
    button(localize('store_reload', 'Reload'), async () => {
        if (!unsaved() || await appConfirm(localize('locale_reload_unsaved', 'Reload and lose unsaved progress?'))) location.reload();
    }).dataset.lazyReload = '';
    box.append(actions);
    host.append(box);
}
async function bootLocale(): Promise<void> {
    document.documentElement.dataset.localePending = '';
    await new Promise<void>((resolve) => {
        const attempt = async () => {
            try { installUI(await loadUI(lang)); resolve(); }
            catch { localeLoadError(attempt); }
        };
        void attempt();
    });
    delete document.documentElement.dataset.localePending;
}
const KEY = storage.PTT_KEY, isBackupPayload = storage.isBackupPayload, isRecord = storage.isRecord, legacySettings = storage.legacySettings, parsePttV3 = storage.parsePttV3, readPttV3 = storage.readPttV3, restoreSettings = storage.restoreSettings, writePttV3 = storage.writePttV3;
const CHORD_DEGREE_LABELS = theory.CHORD_DEGREE_LABELS, SCALE_DEGREE_LABELS = theory.SCALE_DEGREE_LABELS, anFnKey = theory.analysisFunction, anDiatonic = theory.anDiatonic, anIntervalName = theory.anIntervalName, anPcWeights = theory.anPcWeights, anResolveKey = theory.anResolveKey, CHORD_TEMPLATES = theory.CHORD_TEMPLATES, chordDegreeMap = theory.chordDegreeMap, chordInversion = theory.chordInversion, chordPitches = theory.chordPitches, srKeyName = theory.circleKeyPitchClass, formatChordFormula = theory.formatChordFormula, formatScaleFormula = theory.formatScaleFormula, identifyChordDomain = theory.identifyChord, keyFifths = theory.keyFifths, keyFromFifths = theory.keyFromFifths, midiToFrequency = theory.midiToFrequency, pitchClass = theory.pitchClass, PROGRESSION_TEMPLATES = theory.PROGRESSION_TEMPLATES, rdSpellMidi = theory.readingSpelling, romanFor = theory.romanFor, SCALE_DEFINITIONS = theory.SCALE_DEFINITIONS, scorePitch = theory.scorePitchXml, spellMidi = theory.spellMidi;
const AudioEngine = audio.AudioEngine;
const loadOsmd = () => import('./notation.js').then((m) => m.loadOsmd());
const defaultScoreLayoutForViewport = (viewportWidth: number): notationApi.ScoreLayoutMode => (viewportWidth <= 680 ? 'fit' : 'page');
const NAV_GROUPS = router.NAV_GROUPS, navGroup = router.navGroup, viewFromHash = router.viewFromHash, isAppView = router.isAppView, isMovedView = router.isMovedView;
const parseAnalysisHash = router.parseAnalysisHash, formatAnalysisHash = router.formatAnalysisHash;
type AnalysisRoute = router.AnalysisRoute;
const isMergedView = router.isMergedView, MERGED_VIEWS = router.MERGED_VIEWS;
function t(k: string, ...args: Array<string | number | null | undefined>): string { const s = STRINGS[lang] || STRINGS.en; let v = (s[k] != null ? s[k] : (STRINGS.en ? STRINGS.en[k] : null)); if (v == null)
    return k; if (!args.length)
    return v; if (args[0] != null)
    v = v.replace('%a', () => String(args[0])); if (args[1] != null)
    v = v.replace('%b', () => String(args[1])); for (let i = 0; i < args.length; i++) {
    if (args[i] != null)
        v = v.replace('%s', () => String(args[i]));
} return v; }
/* ============================================================================
   ÉTUDE — V3.  Reuses the verified V2 theory/audio/MIDI engine; adds a
   spaced-repetition learning core and an editorial UI.
   ============================================================================ */
/* ---------- DATA ---------- */
let notation: 'letter' | 'german' | 'solfege' = 'letter';
/* ---------- THEME ---------- */
let theme: 'auto' | 'light' | 'dark' = 'auto';
const themeMQ = typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;
function applyTheme() {
    const dark = theme === 'dark' || (theme === 'auto' && themeMQ && themeMQ.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    (document).querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#13161b' : '#f5f4ef')); // browser/app bar follows the chosen theme
    queryAllHtml(document, '#set-theme button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === theme ? 'true' : 'false'));
}
if (themeMQ && themeMQ.addEventListener)
    themeMQ.addEventListener('change', () => { if (theme === 'auto')
        applyTheme(); });
const SCALES = SCALE_DEFINITIONS;
const CHORDS = CHORD_TEMPLATES;
const SCALE_DEG = SCALE_DEGREE_LABELS;
const CHORD_DEG = CHORD_DEGREE_LABELS;
const PROGS = PROGRESSION_TEMPLATES;
/* ---------- i18n ---------- */
let lang: RuntimeLanguage = 'en';
function ivName(semi: number) { const d = I18N_MUSIC.intervals[lang]; if (d && d[semi])
    return d[semi]; return (INTERVALS.find((x) => x.semi === semi) || {}).name || COMPOUND[semi] || '?'; }
function scaleDisp(n: string) { const d = I18N_MUSIC.scales[lang]; return (d && d[n]) || n; }
function chordDisp(c: theory.ChordTemplate|string|undefined) { if (c === undefined)
    throw new TypeError('chordDisp: missing chord'); const sym = typeof c === 'string' ? c : c.symbol, name = typeof c === 'string' ? c : c.name, d = I18N_MUSIC.chords[lang]; return (d && d[sym]) || name; }
function catLabel(cat: string) { const d = I18N_MUSIC.categories[lang]; return (d && d[cat]) || (isCatKey(cat) && CATS[cat] && CATS[cat].label) || cat; }
function invName(i: number) { const d = I18N_MUSIC.inversions[lang]; return (d && d[i]) || INV_NAMES[i] || ''; }
function feelDisp(sym: string|number) { const d = I18N_MUSIC.feels[lang]; return (d && d[sym]) || CHORD_FEEL[sym] || ''; }
function progDisp(name: string) { const d = I18N_MUSIC.progressions?.[lang]; return (d && d[name]) || name; }
type TrainingItemLabelSource = { cat: string; semi?: number; ref?: theory.ChordTemplate | theory.ProgressionTemplate; name?: string };
function itemLabel(it: TrainingItemLabelSource) { if (it.cat === 'interval')
    return ivName(Number(it.semi)); if (it.cat === 'chord')
    return chordDisp(it.ref && 'symbol' in it.ref ? it.ref : undefined); if (it.cat === 'scale')
    return scaleDisp(String(it.name)); if (!it.ref)
    throw new TypeError('itemLabel: item has no reference'); return progDisp(it.ref.name); }
function songsFor(semi: number, dir: string) { const src = (I18N_MUSIC.songs && I18N_MUSIC.songs[lang]) || SONGS; return (src[semi] || {})[dir] || []; }
/* V3 pages: strings for Today plan, Learn progress, Songs ear check, Progress, a11y labels */
/* V5: highlight toggle and contextual coaching (Reading focus · What to notice · Next step). %a %b %c are filled by tf(). */
/* Bluetooth MIDI, answering by ear on the keys, rhythm lengths & two hands, installed app & screen */
function applyI18n() {
    queryAllHtml(document, '[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n ?? ''); });
    queryAllHtml(document, '[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria ?? '')); });
    queryAllHtml(document, '[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle ?? ''); });
    // A status kept as a string key is said again in the new language (a lost piano still waits to come back).
    midiController.localizeStatus();
    document.documentElement.lang = lang;
    renderModeNav();
    pianoStatus();
    dockLabels();
    bleUi();
    wakeUi();
    pwaUi();
    renderDataSafety();
    fsUi();
    scoreFocusUi();
    scorePlayer?.localizeLibrary();
    practice?.renderSetup();
    fitHeader();
    practice?.renderAccompany(true);
    practice?.renderMelodyScales();
    const labelCBtn = document.querySelector('#set-labels button[data-v="c"]');
    if (labelCBtn) labelCBtn.textContent = notation === 'solfege' ? 'Do' : 'C';
}
async function setLang(l: string|undefined, synchronized = false): Promise<void> {
    if (!isRuntimeLanguage(l))
        return;
    if (!synchronized) delete SYNC.pend.lang;
    const pending = synchronized ? SYNC.pend.lang : undefined;
    const request = ++localeRequest;
    try {
        const payload = await loadUI(l);
        if (request !== localeRequest) return;
        if (view0() === 'learn') await loadLearn(l);
        if (request !== localeRequest) return;
        if (synchronized) {
            if (!pending || SYNC.pend.lang !== pending || pending.v !== l) return;
            // A drill may have started while the imports were pending. Keep its
            // synchronized intent (also used by saves), and retry only when idle.
            if (syncBusy()) { pending.running = false; return; }
        }
        document.getElementById('locale-load-error')?.remove();
        installUI(payload);
    }
    catch {
        const current = () => request === localeRequest && (!synchronized || !!pending && SYNC.pend.lang === pending);
        if (current()) {
            if (pending) { pending.failed = true; pending.running = false; }
            localeLoadError(async () => {
                if (!current()) return;
                if (pending) { pending.failed = false; syncIdle(); }
                else await setLang(l);
            });
        }
        return;
    }
    lang = l;
    viewState.language = lang;
    queryAllHtml(document, '#set-lang button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === l ? 'true' : 'false'));
    applyI18n();
    const sr = selectById('song-root').value, pk = selectById('pr-key').value; // re-fill selects so "All keys"/scale names re-localise
    fillRoots(byId('song-root'), false);
    fillRoots(byId('pr-key'), true);
    selectById('song-root').value = String(sr || 0);
    selectById('pr-key').value = String(pk || 'all');
    practice?.localizeAccompaniment();
    localizeLoadedFeatures();
    if (view0() === 'today')
        refreshToday();
    else if (view0() === 'progress')
        renderProgress();
    else if (view0() === 'read')
        read?.relocalizePiece();
    scorePlayer?.relocalize();
    read?.onLocale();
    practice?.refreshSessionCopy();
    coachRefresh();
    saveAll();
}
/* ---------- COACHING (src/app/coaching.ts): tips re-worded on language or notation changes ---------- */
const coaching = createCoaching({ t: (key, ...args) => t(key, ...args), lang: () => lang, escape: (text) => xmlEsc(text) });
const { tf, coachList, coachText, coachHTML } = coaching;
/* ---------- HELPERS ---------- */
const midiToFreq = midiToFrequency;
const pc = pitchClass;
const isFlatKey = (p: number) => [1, 3, 5, 8, 10].includes(((p % 12) + 12) % 12);
const rootName = (p: number) => NOTE_SYS[notation].root[((p % 12) + 12) % 12];
function pcName(p: number, flat: boolean) { return (flat ? NOTE_SYS[notation].flat : NOTE_SYS[notation].sharp)[((p % 12) + 12) % 12]; }
function noteName(m: number, flat: boolean) { return pcName(pc(m), flat) + (Math.floor(m / 12) - 1); }
const UNISON_LABEL: Record<string, string> = {
    en: 'Unison',
    ro: 'Unison',
    es: 'Unísono',
    fr: 'Unisson',
    de: 'Reine Prime',
    it: 'Unisono',
    'pt-BR': 'Uníssono',
};
function intervalLabel(semi: number) {
    const abs = Math.abs(Math.round(semi));
    const d = I18N_MUSIC.intervals[lang];
    if (d && d[abs]) return d[abs];
    if (abs === 0) return UNISON_LABEL[lang] || 'Unison';
    const C = lang === 'ro' ? RO_IV : COMPOUND;
    if (C[abs]) return C[abs];
    const s = abs % 12, oct = Math.floor(abs / 12) - (s === 0 ? 1 : 0);
    const base = s === 0 ? ivName(12) : ivName(s);
    return base + (oct === 1 ? t('iv_plus_oct_one') : t('iv_plus_oct_many', oct));
}
function chordFormula(c: { intervals: readonly number[]; }) { return formatChordFormula(c.intervals); }
function scaleFormula(offs: readonly number[]) { return formatScaleFormula(offs); }
const todayN = () => localDayNumber();
/* ---------- AUDIO ENGINE ---------- */
// Web Audio construction and voice ownership live in the typed audio domain.
const PIANO_KEYS = [21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84, 87, 90, 93, 96, 99, 102, 105, 108];
const PIANO_URLS = pianoUrls;
const PIANO_WARM: readonly [number, number] = [48, 84];
const audioEngine = new AudioEngine({ pianoKeys: PIANO_KEYS, pianoUrls: PIANO_URLS, warmRange: PIANO_WARM, onPianoStatus: () => pianoStatus() });
let lfo = null;
const viewState: ViewApplicationState = {
  language: lang,
  view: 'today',
  theme,
  notation,
  settings: restoreSettings(null),
  session: {
    active: false,
    index: 0,
    correct: 0,
    total: 0,
    answered: false,
    question: null,
  },
  audio: {
    get tone() { return audioEngine.tone; },
    get piano() { return audioEngine.pianoBank.status; },
    get muted() { return audioEngine.muted; },
  },
};
function registerViewEvent<Name extends ViewEventName>(
  name: Name,
  handler: ViewEventHandler<Name>,
): void {
  document.addEventListener(name, handler);
}
const liveVoices = audioEngine.liveVoices;
const pianoBank = audioEngine.pianoBank;
interface MetronomeState { on: boolean; bpm: number; next: number; beat: number; timer: boolean | null }
const metro: MetronomeState = { on: false, bpm: 90, next: 0, beat: 0, timer: null };
function pianoStatus() {
    const message = t(pianoBank.status === 'ready' ? 'piano_ready' : pianoBank.status === 'error' ? 'piano_error' : 'piano_loading');
    const global = byId('piano-global-status');
    // Loading shows in the dock; the line above every view is only for a failure.
    if (global) { global.hidden = pianoBank.status !== 'error'; global.textContent = message; }
    const dock = byId('piano-status');
    if (dock) { dock.hidden = pianoBank.status === 'ready'; dock.textContent = message; }
}
function pianoKeys() { return pianoBank.keys; }
function pianoNearest(midi: number) { return pianoBank.keys.reduce((best, key) => Math.abs(key - midi) < Math.abs(best - midi) ? key : best, pianoBank.keys[0] ?? 60); }
function pianoFail(error: unknown) { pianoBank.fail(error); }
let pianoDecode = (key: number) => pianoBank.decode(key);
function pianoEnsure(midis: readonly number[]) { return audioEngine.pianoEnsure(midis); }
function pianoIdleWarm() { pianoBank.warmIdle(); }
let preparePiano = () => pianoBank.prepare(PIANO_WARM);
let makePianoVoice = (frequency: number, velocity: number, when: number|undefined, duration: number|undefined) => audioEngine.makePianoVoice(frequency, velocity, when, duration);
function sampledPianoVoice(frequency: number, velocity: number, when: number|undefined, duration: number|undefined, options: audio.PianoVoiceOptions = {}) {
    ensureAudio();
    return audioEngine.sampledPianoVoice(frequency, velocity, when, duration, options, { decode: pianoDecode, fallbackVoice: makePianoVoice });
}
function makeVoice(frequency: number, velocity: number, when: number|undefined, duration: number|undefined) {
    ensureAudio();
    return audioEngine.makeVoice(frequency, velocity, when, duration);
}
function ensureAudio(warm = true) {
    const context = audioEngine.ensureAudio();
    if (context) {
        read?.watchAudioContext(context);
        context.addEventListener?.('statechange', audioLockSync);
        if (warm) void preparePiano();
    }
    return context;
}
/** The live audio context; callers run only after `ensureAudio()` has created it. */
function requireAudioContext(): AudioContext {
    if (!audioEngine.context)
        throw new Error('Étude: audio context is not ready');
    return audioEngine.context;
}
let audioLockT = 0;
function audioLockSync() {
    if (!audioEngine.context || audioEngine.context.state !== 'running') return;
    clearTimeout(audioLockT); audioLockT = 0;
    const el = byId('audioLock'); if (el) el.hidden = true;
}
function audioLockCheck() {
    if (!audioEngine.localSynth || !audioEngine.context || audioEngine.context.state === 'running' || audioLockT) return;
    audioLockT = window.setTimeout(() => { audioLockT = 0; const el = byId('audioLock'); if (el && audioEngine.localSynth && audioEngine.context && audioEngine.context.state !== 'running') el.hidden = false; }, 300);
}
async function timedAudioReady(context: AudioContext): Promise<boolean> {
    const state = await audioEngine.resumeOnReturn();
    if (context !== audioEngine.context) return false;
    if (state === 'running') return true;
    audioLockCheck();
    return false;
}
function audioUnlock() { ensureAudio(); const context = audioEngine.context; if (context && context.state !== 'running') void context.resume().then(audioLockSync).catch(() => undefined); else audioLockSync(); }
function audioNoteOn(midi: number, velocity: number|undefined) { audioEngine.noteOn(midi, velocity || 100, { decode: pianoDecode, fallbackVoice: makePianoVoice }); }
function audioNoteOff(midi: number) { audioEngine.noteOff(midi); }
const previewStoppers = new Set<() => void>();
const previewSequenceHandlers = new Set<(frames: PreviewSequenceFrame[]) => void>();
function notifyPreviewSequence(frames: PreviewSequenceFrame[]) {
    for (const handler of previewSequenceHandlers) handler(frames);
}
function stopPreviews() {
    for (const stop of previewStoppers) stop();
    audioEngine.stopPreviews();
}
function setBendFromValue(value: number) { audioEngine.setBendFromValue(value); }
function masterRamp(value: number) { audioEngine.masterRamp(value); }
function startDrone(rootPc: number) { audioEngine.startDrone(rootPc); }
function stopDrone() {
    audioEngine.stopDrone();
    inputById('si-drone').checked = false;
}
function startMetro(bpm = metro.bpm, startAt?: number) { audioEngine.startMetro(bpm, startAt); metro.on = true; metro.timer = true; }
function stopMetro() { audioEngine.stopMetro(); metro.on = false; metro.timer = null; }
function metroSched() { audioEngine.startMetro(metro.bpm); }
function metroClick(when: number, accent: boolean) { audioEngine.metroClick(when, accent); }
const scoreClicks = new Set<audio.AudioVoice>(), phraseClicks = new Set<audio.AudioVoice>();
function stopClicks(clicks: Set<audio.AudioVoice>) {
    clicks.forEach(click => click.stop());
    clicks.clear();
}
let previewNote = function previewNote(midi: number, when?: number, duration?: number, velocity?: number, options: audio.PianoVoiceOptions = {}) { audioEngine.preview(midi, when, duration, velocity || 96, options); }
let playInterval = (rootMidi: number, semitones: number, style: 'both' | 'harmonic' | 'melodic') => { audioEngine.playInterval(rootMidi, semitones, style || 'both'); };
function playIvDir(root: number, semitones: number, direction: string, style: 'both' | 'harmonic' | 'melodic' = 'both') {
    if (style === 'melodic') stopPreviews();
    const descending = direction === 'desc' && style !== 'harmonic';
    playInterval(descending && style === 'both' ? root + semitones : root, descending ? -semitones : semitones, style);
}
function playChordMidis(midis: number[], arpeggio: boolean) {
    ensureAudio(); stopPreviews();
    notifyPreviewSequence(arpeggio ? midis.map((midi, index) => ({ at: index * 160, notes: [midi] })).concat([{ at: midis.length * 160 + 100, notes: midis }, { at: midis.length * 160 + 1200, notes: [] }]) : [{ at: 0, notes: midis }, { at: 1200, notes: [] }]);
    const start = audioEngine.context?.currentTime ?? 0;
    if (arpeggio) { midis.forEach((midi, index) => previewNote(midi, start + index * 0.16, 0.4)); midis.forEach((midi) => previewNote(midi, start + midis.length * 0.16 + 0.1, 1.1)); }
    else midis.forEach((midi) => previewNote(midi, start, 1.2));
}
function playProg(rootPc: number, prog: theory.ProgressionTemplate) { ensureAudio(); stopPreviews(); if (!audioEngine.context)
    return; const t = audioEngine.context.currentTime; prog.chords.forEach((ch, i: number) => { const root = 60 + ((rootPc + ch[0]) % 12), tpl = progChordTpl(ch[1]); if (!tpl)
    return; tpl.intervals.forEach((iv) => previewNote(root + iv, t + i * .9, .8)); }); }
function playScaleNotes(rootMidi: number, offsets: readonly number[], ascending: boolean) {
    ensureAudio(); stopPreviews();
    const start = audioEngine.context?.currentTime ?? 0; let sequence = offsets.concat([12]);
    if (!ascending) sequence = sequence.slice().reverse();
    notifyPreviewSequence(sequence.map((offset, index) => ({ at: index * 270, notes: [rootMidi + offset] })).concat([{ at: sequence.length * 270, notes: [] }]));
    sequence.forEach((offset, index) => previewNote(rootMidi + offset, start + index * 0.27, 0.26));
}
const droneVoices = audioEngine.droneVoices;
const TONES = { soft: { w: ['triangle', 'sawtooth', 'sawtooth'], cut: 6 }, bright: { w: ['sawtooth', 'sawtooth', 'square'], cut: 9 }, organ: { w: ['sine', 'sine', 'sine'], cut: 14, oct: [0, 1200, 1902] }, mellow: { w: ['sine', 'triangle', 'sine'], cut: 3.2 }, glass: { w: ['sine', 'triangle', 'square'], cut: 11 } };
let _noiseBuf: null = null;
function noiseBuffer() { return _noiseBuf; }
function makeIR() { return null; }
/* ---------- ACCOMPANIMENT LOOP moved to src/features/practice/accompaniment.ts ---------- */
/* ---------- VOICE (lazy feature in src/features/voice/index.ts) ---------- */
/* ---------- KEYBOARD ---------- */
const BASE_LOW = 24, BASE_HIGH = 96;
const view = { low: 48, oct: 4 };
let labelMode = 'c';
let typeOctave = 60;
function clampTypeOctave() { const lo = view.low, maxLo = Math.max(lo, viewHigh() - 12); typeOctave = Math.max(lo, Math.min(maxLo, Math.round(typeOctave / 12) * 12)); }
const whiteEl = new Map<number, HTMLButtonElement>(), blackEl = new Map<number, HTMLButtonElement>(), keyEl = new Map<number, HTMLButtonElement>(), keyMk = new Map<number, HTMLSpanElement>(), keyDg = new Map<number, HTMLSpanElement>();
const BLACK_NUDGE: Record<number, number> = { 1: 0, 3: 0, 6: 0, 8: 0, 10: 0 };
function viewHigh() { return view.low + view.oct * 12; }
// A phone on its side: the compact landscape layout of etude.css, and landscape.css while the keys are open (body.kb-land).
const LAND_PHONE = matchMedia('(orientation: landscape) and (max-height: 560px)');
// Three octaves on a phone on its side (four from 960 px), so the keys are wide enough to play; otherwise by width.
function chooseView() { const w = window.innerWidth; view.oct = LAND_PHONE.matches ? (w >= 960 ? 4 : 3) : w < 560 ? 2 : w < 900 ? 3 : 4; view.low = Math.max(BASE_LOW, Math.min(view.low, BASE_HIGH - view.oct * 12)); clampTypeOctave(); }
function buildKeyboard() {
    read?.dockView();
    clampTypeOctave();
    const keys = byId('keys');
    if (!keys)
        return;
    const active = document.activeElement;
    const focused = active instanceof HTMLElement && keys.contains(active)
        ? Number(active.dataset.midi ?? 0)
        : null;
    keys.innerHTML = '';
    whiteEl.clear();
    blackEl.clear();
    keyEl.clear();
    keyMk.clear();
    keyDg.clear();
    const lo = view.low, hi = viewHigh(), WHITE = new Set([0, 2, 4, 5, 7, 9, 11]);
    for (let m = lo; m <= hi; m++) {
        if (!WHITE.has(pc(m)))
            continue;
        const b = (document).createElement('button');
        b.className = 'key white';
        b.dataset.midi = String(m);
        b.type = 'button';
        b.tabIndex = 0;
        b.setAttribute('aria-label', noteName(m, false));
        if (m === 60)
            b.classList.add('midc');
        if (labelMode !== 'none' && (labelMode === 'all' || pc(m) === 0)) {
            const l = (document).createElement('span');
            l.className = 'lbl';
            l.textContent = pc(m) === 0 ? rootName(0) + (Math.floor(m / 12) - 1) : pcName(pc(m), false);
            b.appendChild(l);
        }
        const mk = (document).createElement('span');
        mk.className = 'mk';
        b.appendChild(mk);
        const dg = (document).createElement('span');
        dg.className = 'dg';
        dg.setAttribute('aria-hidden', 'true');
        b.appendChild(dg);
        keys.appendChild(b);
        whiteEl.set(m, b);
        keyEl.set(m, b);
        keyMk.set(m, mk);
        keyDg.set(m, dg);
        bindKeyA11y(b, m);
    }
    for (let m = lo; m <= hi; m++) {
        if (WHITE.has(pc(m)))
            continue;
        const b = (document).createElement('button');
        b.className = 'key black';
        b.dataset.midi = String(m);
        b.type = 'button';
        b.tabIndex = 0;
        b.setAttribute('aria-label', noteName(m, false));
        const mk = (document).createElement('span');
        mk.className = 'mk';
        b.appendChild(mk);
        const dg = (document).createElement('span');
        dg.className = 'dg';
        dg.setAttribute('aria-hidden', 'true');
        b.appendChild(dg);
        keys.appendChild(b);
        blackEl.set(m, b);
        keyEl.set(m, b);
        keyMk.set(m, mk);
        keyDg.set(m, dg);
        bindKeyA11y(b, m);
    }
    positionBlacks();
    if (focused != null) {
        const key = keyEl.get(Math.max(lo, Math.min(hi, focused)));
        if (key) {
            key.focus({ preventScroll: true });
            const scroll = byId('dock-keys'), r = key.getBoundingClientRect(), s = scroll.getBoundingClientRect();
            if (r.left < s.left)
                scroll.scrollLeft += r.left - s.left;
            else if (r.right > s.right)
                scroll.scrollLeft += r.right - s.right;
        }
    }
    const oi = byId('octInd');
    if (oi)
        oi.textContent = noteName(view.low, false) + '–' + noteName(viewHigh(), false);
    kbDegrees(kbDegSrc);
    read?.dockPaint();
    if (view0() === 'analysis')
        scorePlayer?.keysPaint(true);
    notifyDockReflow();
    practice?.onKeyboardBuilt();
}
const dockReflowListeners = new Set<() => void>();
function notifyDockReflow() {
    for (const listener of dockReflowListeners) listener();
}
// Chord-member numbers (1 3 5 7 …) shown on keys; `src` maps sounding MIDI notes to labels and is folded into view.
let kbDegSrc: Map<number, string>|null = null;
function kbDegrees(src: Map<number,string>|null) {
    kbDegSrc = src && src.size ? src : null;
    const folded = new Map<number, string>();
    if (kbDegSrc)
        kbDegSrc.forEach((label, m) => folded.set(foldToView(m), label));
    keyEl.forEach((el, m) => {
        const label = folded.get(m) || '', d = keyDg.get(m);
        const degDesc = label ? (label === 'R' ? t('kb_deg_r') : t('kb_deg', label)) : '';
        if (d) {
            d.textContent = label;
            if (degDesc)
                d.title = degDesc;
            else
                d.removeAttribute('title');
        }
        if (degDesc)
            el.title = noteName(m, false) + ' — ' + degDesc;
        else
            el.removeAttribute('title');
        el.setAttribute('aria-label', noteName(m, false) + (degDesc ? ', ' + degDesc : ''));
    });
}
function positionBlacks() { blackEl.forEach((el, bm) => { const w = whiteEl.get(bm - 1); if (!w || !w.offsetWidth)
    return; const bw = w.offsetWidth * .6, seam = w.offsetLeft + w.offsetWidth + .5, n = (BLACK_NUDGE[pc(bm)] || 0) * bw; el.style.width = bw + 'px'; el.style.left = (seam - bw / 2 + n) + 'px'; }); syncKeyboardPan(); }
function syncKeyboardPan() { const scroll = byId('dock-keys'), pan = inputById('kb-pan'), max = Math.max(0, scroll.scrollWidth - scroll.clientWidth); pan.max = String(max); pan.value = String(scroll.scrollLeft); pan.hidden = !dockShown() || max < 1; }
// On narrow screens the keys scroll sideways: bring a key into sight, unless focus is on the keys (the focused key stays in sight then).
function dockKeyInSight(m: number) { const key = keyEl.get(m), scroll = byId('dock-keys'); if (!key || !dockShown() || byId('keys').contains(document.activeElement))
    return; const r = key.getBoundingClientRect(), s = scroll.getBoundingClientRect(); if (r.left < s.left || r.right > s.right)
    scroll.scrollLeft += (r.left + r.right - s.left - s.right) / 2; }
function reflowKeys() { requestAnimationFrame(() => requestAnimationFrame(positionBlacks)); setTimeout(positionBlacks, 90); } // wait for the dock to lay out before measuring
function foldToView(m: number) { const lo = view.low, hi = viewHigh(); let x = m; while (x < lo)
    x += 12; while (x > hi)
    x -= 12; return x; }
function kbState(midi: number, s: string|null, fold: boolean) { const m = fold ? foldToView(midi) : midi, el = keyEl.get(m); if (!el)
    return; if (s)
    el.dataset.s = s;
else
    delete el.dataset.s; const mk = keyMk.get(m); if (mk)
    mk.textContent = s === 'good' ? '✓' : s === 'bad' ? '✗' : ''; }
function kbClear(s: string) { keyEl.forEach((el, m) => { if (el.dataset.s === s) {
    delete el.dataset.s; const mk = keyMk.get(m); if (mk)
    mk.textContent = ''; } }); }
function kbClearAll() { keyEl.forEach((el, m) => { delete el.dataset.s; const mk = keyMk.get(m); if (mk)
    mk.textContent = ''; }); }
function kbPress(midi: number, on: boolean) { const m = foldToView(midi), el = keyEl.get(m); if (!el)
    return; if (!on && [...held].some((n) => foldToView(n) === m))
    return; el.classList.toggle('pressed', on); if (on) {
    if (!el.dataset.s)
        el.dataset.s = 'active';
}
else if (el.dataset.s === 'active')
    delete el.dataset.s; }
function repaintHeld() { held.forEach((m) => kbPress(m, true)); }
const pointerKey = new Map<number, number|null>();
function keyAt(x: number, y: number) { const el = document.elementFromPoint(x, y); if (el) {
    const k = el.closest('.key');
    if (k instanceof HTMLElement)
        return +(k.dataset.midi ?? 0);
} return null; }
// A touch or click on the screen, judged from its own event time less the calibrated touch latency.
function blurInputField() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && inField()) active.blur();
}
function touchInput(e: Event, fn: () => void) { withInputTime(eventTime(e.timeStamp, performance.now()), 'touch', fn); }
function initPointer() {
    const kb = byId('keys');
    kb.addEventListener('pointerdown', (e) => { const m = keyAt(e.clientX, e.clientY); if (m == null)
        return; blurInputField(); e.preventDefault(); try {
        kb.setPointerCapture(e.pointerId);
    }
    catch (_) { } ; pointerKey.set(e.pointerId, m); touchInput(e, () => handleNoteOn(m, 100, 'pointer:' + e.pointerId)); });
    kb.addEventListener('pointermove', (e) => { if (!pointerKey.has(e.pointerId))
        return; const cur = pointerKey.get(e.pointerId), m = keyAt(e.clientX, e.clientY); if (m !== cur) {
        touchInput(e, () => {
            if (cur != null)
                handleNoteOff(cur, 'pointer:' + e.pointerId);
            pointerKey.set(e.pointerId, m);
            if (m != null)
                handleNoteOn(m, 100, 'pointer:' + e.pointerId);
        });
    } });
    const end = (e: PointerEvent) => { if (pointerKey.has(e.pointerId)) {
        const m = pointerKey.get(e.pointerId);
        if (m != null)
            touchInput(e, () => handleNoteOff(m, 'pointer:' + e.pointerId));
        pointerKey.delete(e.pointerId);
    } };
    kb.addEventListener('pointerup', end);
    kb.addEventListener('pointercancel', end);
    kb.addEventListener('lostpointercapture', end);
}
function bindKeyA11y(b: HTMLButtonElement, m: number) { b.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    if (!b._kd) {
        b._kd = true;
        handleNoteOn(m, 100, 'button:' + m);
    }
} }); b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    b._kd = false;
    handleNoteOff(m, 'button:' + m);
} }); b.addEventListener('blur', () => { if (b._kd) {
    b._kd = false;
    handleNoteOff(m, 'button:' + m);
} }); }
/* ---------- KEYBOARD DOCK: the keys, or folded into a slim rail; one choice for every view ----------
   Hiding only hides the on-screen keys: MIDI and the computer keys keep playing, and the rail keeps one Show keyboard button.
   Without a choice the keys are open, except in Score & analysis on small screens, where the score needs the room; that default
   is settled once per visit, so resizing the window never flips the keyboard (or what its buttons do) behind the user's back.
   Falling notes draw their own keyboard, so that view shows neither the dock nor the rail and leaves the choice untouched.
   A reading drill that asks its question on the keys (`force`) opens them while it runs, without changing the saved choice.
   A session question answered on the keys (Play it, or By ear on the keys) opens them while no MIDI or Bluetooth piano is
   connected, unless the user chose to hide them: Hide stays available and is saved as usual. */
interface KeyboardDockState { pref: boolean|null; auto: null; animT: number; force: boolean }
const DOCK: KeyboardDockState = { pref: null, auto: null, animT: 0, force: false };
function dockWanted(v = view0()) { return v === 'today' || v === 'explore' || !!practice?.alongWanted(v) || (v === 'practice' && practice?.hintKeys() === true) || v === 'learn' || v === 'read' || v === 'sing' || (!!practice?.sesActive() && v === practice.sesHome()) || (v === 'analysis' && !!scorePlayer?.dockWanted()); }
function sesNeedsKeys(v = view0()) { return !!practice?.sessionNeedsKeys(v) && !midiLive(); }
function dockForced(v = view0()) { return DOCK.force && v === 'read'; }
// The full-screen stage of a running reading drill or piece. With a MIDI or Bluetooth piano connected, the keys fold into the
// rail there; showing or hiding them on the stage (`kb`) lasts until the stage closes and leaves the saved choice alone.
interface PracticeStageState { on: boolean; kb: boolean | null; rz: number }
const STAGE: PracticeStageState = { on: false, kb: null, rz: 0 };
const SCORE_FOCUS: { owner: 'analysis' | 'read' | null; native: boolean; token: number; returnTo: HTMLElement | null; scroll: number; readOverride: boolean | null; zoom: number } = { owner: null, native: false, token: 0, returnTo: null, scroll: 0, readOverride: null, zoom: 1 };
function midiLive() { return !!midiController.state.activeInputId || bleLive(); }
function stageDock(v = view0()) { return STAGE.on && v === 'read' && (STAGE.kb != null || midiLive()); }
function dockOpen(v = view0()) { const hintKeys = v === 'practice' ? practice?.hintKeys() ?? null : null; if (hintKeys !== null)
    return hintKeys; if (dockForced(v))
    return true; if (stageDock(v))
    return STAGE.kb ?? false; if (sesNeedsKeys(v))
    return DOCK.pref !== false; if (DOCK.pref != null)
    return DOCK.pref; return false; }
// Where the page stops being visible at the bottom: the top of the dock when it shows, else of the phone bottom bar
// (the dock rides on the bar), else the end of the viewport.
function fixedBottomTop() {
    for (const el of [byId('dock'), byId('bottomNav')]) {
        const r = el.getBoundingClientRect();
        if (r.height > 0 && getComputedStyle(el).display !== 'none')
            return r.top;
    }
    return innerHeight;
}
function dockShown() { return document.body.classList.contains('kb') && !byId('dock').classList.contains('is-rail'); }
// The dock's own button names the action it takes (Hide / Show keyboard).
function dockLabels() {
    const open = dockOpen(), act = t(open ? 'kb_hide' : 'kb_show'), dk = byId('dock-kb-toggle');
    dk.setAttribute('aria-expanded', open ? 'true' : 'false');
    dk.title = act;
    const label = dk.querySelector('.dock-kb-label');
    if (label) label.textContent = act;
    const name = STAGE.on && midiLive() ? (midiController.state.activeInputId && midiController.state.midiMsg?.text) || bleName() : null;
    byId('dock-rail-note').textContent = name ? t('stage_rail_midi', name) : t('kb_rail_note');
    scoreFocusUi();
}
function dockSync() {
    const dock = byId('dock'), v = view0(), on = dockWanted(v), open = on && dockOpen(v), was = document.body.classList.contains('kb'), wasOpen = dockShown();
    // On a phone on its side the open keys take the header's room (landscape.css); Hide keyboard brings the header back.
    // A drill asking on the keys hides that button, so the header stays (kb-forced): it is the way to the other views.
    const land = open && LAND_PHONE.matches, wasLand = document.body.classList.contains('kb-land');
    const forced = land && dockForced(v), wasForced = document.body.classList.contains('kb-forced');
    dock.classList.toggle('compact', v === 'analysis');
    byId('dock-kb-toggle').hidden = !on || dockForced(v); // a drill asking on the keys keeps them: Hide would do nothing
    dockLabels();
    if (on === was && open === wasOpen && land === wasLand && forced === wasForced)
        return;
    document.body.classList.toggle('kb-land', land);
    document.body.classList.toggle('kb-forced', forced);
    const menuBtn = byId('menuBtn'), menu = byId('mobileMenu');
    const menuInDock = land && !forced;
    if (dock.contains(menuBtn) !== menuInDock) {
        closeMobileMenu();
        if (menuInDock) {
            byId('dock-kb-toggle').before(menuBtn);
            dock.append(menu);
        } else {
            byId('helpBtn').before(menuBtn, menu);
        }
    }
    document.body.classList.toggle('kb', on);
    dock.classList.toggle('is-rail', on && !open);
    const exKbBtn = maybeById('ex-open-kb');
    if (exKbBtn) exKbBtn.hidden = dockShown() || midiLive();
    if (open) {
        if (was && !wasOpen)
            dockReveal();
        if (v === 'analysis')
            scorePlayer?.keysCenterIfPending();
        positionBlacks();
        reflowKeys();
        if (v === 'analysis')
            scorePlayer?.keysPaint(true);
    }
    else {
        dock.classList.remove('is-opening');
        if (v === 'analysis')
            scorePlayer?.keysClear();
    }
    anLayoutVars(); // size the page and the score from the dock's new height in this same frame: no stale gap, no overlap
    if (STAGE.on)
        read?.stageRefit();
}
LAND_PHONE.addEventListener('change', () => dockSync());
// Expanding from the rail, the keys rise out of it (not with reduced motion); transform and opacity only, so the layout is settled from the first frame.
function dockReveal() { if (reduceMotion())
    return; const dock = byId('dock'); dock.classList.add('is-opening'); clearTimeout(DOCK.animT); DOCK.animT = window.setTimeout(() => dock.classList.remove('is-opening'), 300); }
function dockSet(open: boolean) {
    if (view0() === 'practice' && practice && practice.hintKeys() !== null) {
        practice.setHintKeys(open);
        return;
    }
    if (stageDock()) {
        STAGE.kb = !!open;
        dockSync();
        return;
    }
    const keep = view0() === 'analysis' && scorePlayer ? scorePlayer.keepPlace() : dockKeepEnd(open);
    DOCK.pref = !!open;
    saveAll();
    if (view0() === 'analysis' && scorePlayer)
        scorePlayer.updateControls();
    else
        dockSync();
    keep();
}
// Other pages scroll under the dock: whoever is reading the end of a long page still sees it when the keys come back.
function dockKeepEnd(open: boolean) {
    const root = document.scrollingElement || document.documentElement, end = open && root.scrollHeight > innerHeight + 2 && root.scrollTop > 0 && root.scrollTop + innerHeight >= root.scrollHeight - 2;
    return () => { if (end)
        window.scrollTo(0, root.scrollHeight); };
}
/* ---------- INPUT ROUTING ---------- */
const held = new Set<number>(), heldOrder: number[] = [], sustained = new Set<number>(), inputOwners = new Map<number, Set<string>>();
const midiChannels = new Map<string, Map<number, Set<number>>>();
const midiSustainOwners = new Map<number, { source: string; channel: number }>();
let pedalDown = false;
function handleNoteOn(midi: number, vel: number, source = 'midi') {
    if (!Number.isInteger(midi) || midi < 0 || midi > 127)
        return;
    ensureAudio();
    const owners = inputOwners.get(midi) || new Set<string>();
    owners.add(source);
    inputOwners.set(midi, owners);
    if (held.has(midi)) {
        read?.trackHeldSource(source);
        return;
    }
    sustained.delete(midi);
    midiSustainOwners.delete(midi);
    held.add(midi);
    heldOrder.push(midi);
    audioNoteOn(midi, vel);
    kbPress(midi, true);
    wakePing();
    onInputChange('on', midi, source, null);
}
function handleNoteOff(midi: number, source = 'midi', releaseKind: 'physical'|'focus'|'reset'|null = 'physical', silence = false) {
    const owners = inputOwners.get(midi);
    if (!owners || !owners.delete(source))
        return;
    if (owners.size)
        return;
    inputOwners.delete(midi);
    if (!held.has(midi))
        return;
    held.delete(midi);
    const i = heldOrder.indexOf(midi);
    if (i >= 0)
        heldOrder.splice(i, 1);
    kbPress(midi, false);
    if (silence)
        audioEngine.silenceNote(midi);
    else if (pedalDown)
        sustained.add(midi);
    else
        audioNoteOff(midi);
    onInputChange('off', midi, source, releaseKind);
}
function pedalUp() { sustained.forEach((m) => { if (!held.has(m))
    audioNoteOff(m); }); sustained.clear(); midiSustainOwners.clear(); }
function heldMidis() { return [...held]; }
function heldPcs() { return [...new Set(heldMidis().map(pc))].sort((a, b) => a - b); }
function releaseLiveInput() {
    held.forEach((m) => audioNoteOff(m));
    sustained.forEach((m) => audioNoteOff(m));
    held.clear();
    heldOrder.length = 0;
    sustained.clear();
    inputOwners.clear();
    midiChannels.clear();
    midiSustainOwners.clear();
    pointerKey.clear();
    scorePlayer?.releaseInput();
    typingDown.clear();
    pedalDown = false;
    keyEl.forEach((el) => { el._kd = false; el.classList.remove('pressed'); if (el.dataset.s === 'active')
        delete el.dataset.s; });
}
// Without focus no key-up or pointer-up arrives, so keys held from the computer keyboard, the screen or a rhythm pad are let go as if
// lifted (drills see an ordinary release). MIDI and Bluetooth go on reporting, so keys and pedal held on the instrument stay as they are.
function releaseFocusInput() {
    let fell = false;
    [...inputOwners.entries()].forEach(([m, o]) => [...o].forEach((s) => { if (s === 'midi' || s === 'ble')
        return; if (s.startsWith('fall:'))
        fell = true; handleNoteOff(m, s, 'focus'); }));
    pointerKey.clear();
    typingDown.clear();
    keyEl.forEach((el) => { el._kd = false; });
    read?.releaseFocus();
    scorePlayer?.releaseFocus(fell);
}
function panic() {
    practice?.stopPrompts();
    read?.panicBegin();
    if (CAL.on) {
        calStop();
        calSay('');
    }
    pianoBank.cancelWarmIdle();
    read?.panicRecorder();
    releaseLiveInput();
    read?.panicRhythm();
    practice?.stopAccompaniment();
    read?.panicStopAll();
    held.forEach(audioNoteOff);
    held.clear();
    heldOrder.length = 0;
    sustained.forEach(audioNoteOff);
    sustained.clear();
    liveVoices.forEach(voice => voice.stop());
    liveVoices.clear();
    stopPreviews();
    stopDrone();
    pointerKey.clear();
    typingDown.clear();
    pedalDown = false;
    audioEngine.setBendFromValue(0);
    audioEngine.setModulation(0, .02);
    keyEl.forEach(el => {
        el.classList.remove('pressed');
        if (el.dataset.s === 'active') delete el.dataset.s;
    });
    panicLoadedFeatures();
}
const inputBusListeners = new Set<InputBusListener>();
// midi is the key that just went down or (physically) came up; the sustain pedal never delays an 'off'.
function onInputChange(kind: 'on'|'off', midi: number, source = 'midi', releaseKind: 'physical'|'focus'|'reset'|null = null) {
    if (calListening()) { // the timing wizard is listening: notes only sound, no drill sees them
        if (kind === 'on')
            calTap();
        return;
    }
    // MIDI still sounds in a dialog. Only calibration and note releases reach their handlers.
    if (kind === 'on' && overlaysOpen())
        return;
    for (const listener of inputBusListeners) listener({ kind, midi, source, releaseKind });
    if (read?.preInput(kind, midi, source, releaseKind))
        return;
    if (view0() === 'analysis') {
        scorePlayer?.practiceInput(kind, midi, source);
        return;
    }
    if (view0() === 'explore' || view0() === 'sing' || view0() === 'learn') {
        return;
    }
    if (view0() === 'read' && read?.viewInput(kind, midi, heldOrder[heldOrder.length - 1]))
        return;
    if (practice?.sesActive())
        practice.sessionInput(kind, midi);
}
/* ---------- WEB MIDI ---------- */
const midiController = createMidiController({
    t,
    ensureAudio,
    audioLockCheck,
    releaseLiveInput,
    panic,
    saveAll: () => saveAll(),
    onNoteOn: (midi, velocity, source) => handleNoteOn(midi, velocity, source),
    onNoteOff: (midi, source, releaseKind, silence) => handleNoteOff(midi, source, releaseKind, silence),
    onPitchBend: (value) => setBendFromValue(value),
    onModulation: (depth) => audioEngine.setModulation(depth),
    onSustainChange: (dn) => {
        if (view0() === 'analysis' && !calListening() && !overlaysOpen()) scorePlayer?.sustainInput(dn);
    },
    silenceNote: (midi) => audioEngine.silenceNote(midi),
    getPedalDown: () => pedalDown,
    setPedalDown: (dn) => { pedalDown = dn; },
    pedalUp,
    midiChannels,
    midiSustainOwners,
    sustained,
    held,
    isBleCan: () => bleCan(),
    isBleLive: () => bleLive(),
    getBleName: () => bleName(),
    isDockShown: () => dockShown(),
    onChipSync: () => {
        read?.readySync();
        scorePlayer?.syncPracticeLine();
        if (STAGE.on || practice?.sesActive()) dockSync(); // a connected piano releases the keys a stage or drill opened
    },
    runtimeErrorName,
});
const {
    midiStatus, setMidi, midiChipSync, connectMidi, listInputs, refreshDeviceList,
    attachInput, autoReconnectMidi, onStateChange, onMidiMessage, midiIn, midiDispatch, midiNoteOff,
} = midiController;
/* ---------- TIMING CALIBRATION: tap with the click (Settings → MIDI keyboard → Timing) ---------- */
function calRecord(): Record<string, unknown> { return data; }
useLatencyOffsets(() => calRecord().latency);
const calController = createTimingCalibration({
    t: (key, ...args) => t(key, ...args),
    ensureAudio,
    timedAudioReady,
    scheduleClick: (when, accent) => audioEngine.scheduleClick(when, accent),
    touchInput,
    getLatency: () => calRecord().latency,
    setLatency: (next) => { calRecord().latency = next; },
    clearLatency: () => { delete calRecord().latency; },
    saveAll,
});
const CAL = calController.state;
const calLabel = calController.label;
const initLatencyCalibration = calController.init;
const calUi = calController.ui;
const calListening = calController.listening;
const calSay = calController.say;
const calStart = calController.start;
const calBeat = calController.beat;
const calTap = calController.tap;
const calStop = calController.stop;
const calFinish = calController.finish;
const calReset = calController.reset;
/* ---------- BLUETOOTH MIDI: BLE-MIDI straight from the piano over Web Bluetooth ---------- */
const bleController = createBleMidi({
    t: (key, ...args) => t(key, ...args),
    midiChipSync,
    ensureAudio,
    saveAll,
    panic,
    srtEligibleFirstSightActive: () => !!read?.firstSightActive(),
    midiIn,
    releaseBleChannels() {
        midiChannels.delete('ble');
        for (const [midi, owner] of midiSustainOwners) {
            if (owner.source === 'ble') midiSustainOwners.delete(midi);
        }
        [...inputOwners.entries()].forEach(([m, o]) => {
            if (o.has('ble')) handleNoteOff(m, 'ble', 'reset');
        });
    },
    releaseSustainPedal() {
        if (pedalDown) {
            pedalDown = false;
            pedalUp();
        }
    },
    resetBend() { setBendFromValue(0); },
    resetModulation() { audioEngine.setModulation(0); },
    runtimeErrorName,
    runtimeErrorMessage,
});
const BLE = bleController.state;
const bleCan = bleController.can;
const bleLive = bleController.live;
const bleName = bleController.name;
const bleSet = bleController.set;
const bleUi = bleController.ui;
const bleClick = bleController.click;
const bleChoose = bleController.choose;
const bleErr = bleController.err;
const bleStale = bleController.stale;
const bleOpen = bleController.open;
const bleUnhook = bleController.unhook;
const bleOnGone = bleController.onGone;
const bleRetry = bleController.retry;
const bleReconnect = bleController.reconnect;
const bleDisconnect = bleController.disconnect;
const bleReleaseInput = bleController.releaseInput;
const bleAutoReconnect = bleController.autoReconnect;
const bleParserReset = bleController.parserReset;
const bleOnValue = bleController.onValue;
const bleParse = bleController.parse;
const bleStatus = bleController.status;
const bleData = bleController.data;
const bleMsg = bleController.msg;
/* ---------- INSTALLED APP: offline copy, install prompt, full screen and screen wake lock ---------- */
const pwaLifecycle = createPwaLifecycle({
    t,
    saveAll: () => saveAll(),
    runtimeErrorName,
});
const {
    PWA, WAKE, pwaStandalone, pwaInit, pwaRegister, pwaUi, pwaInstall,
    fsCan, fsUi, fsToggle,
    wakeCan, wakeGet, wakeOnGesture, wakeDrop, wakeSet, wakePing, wakeArm, wakeUi, wakeInit,
} = pwaLifecycle;
// Both score players share one expand action. Native fullscreen is optional;
// ownership prevents leaving fullscreen opened independently in Settings.
function scoreFocusUi() {
    for (const id of ['rd-fs', 'rd-top-fs']) {
        const button = maybeById(id);
        if (!button) continue;
        const on = SCORE_FOCUS.owner === 'read';
        button.hidden = false;
        button.setAttribute('aria-pressed', String(on));
        button.setAttribute('aria-label', t(on ? 'pc_stage_exit' : 'pc_stage'));
        button.title = t(on ? 'pc_stage_exit' : 'pc_stage_t');
        button.textContent = id === 'rd-top-fs' ? '⛶' : '⛶ ' + t(on ? 'pc_stage_exit' : 'pc_stage');
        button.setAttribute('aria-disabled', String(!read?.hasPiece()));
    }
    const kb = maybeById('rd-focus-kb');
    kb?.setAttribute('aria-expanded', String(dockOpen()));
    if (kb) { kb.textContent = t(dockOpen() ? 'kb_hide' : 'kb_show'); }
}
function readScoreZoom(value = SCORE_FOCUS.zoom) {
    SCORE_FOCUS.zoom = Math.round(Math.max(.7, Math.min(2, value)) * 10) / 10;
    const svg = read?.svg();
    if (svg) svg.style.setProperty('zoom', String(SCORE_FOCUS.zoom));
    const reset = maybeById('rd-focus-fit');
    if (reset) reset.textContent = t('score_fit');
    buttonById('rd-focus-out').disabled = SCORE_FOCUS.zoom <= .7;
    buttonById('rd-focus-in').disabled = SCORE_FOCUS.zoom >= 2;
}
function rdFocusDispSet(open: boolean, focusBack = false) {
    const tools = maybeById('rd-focus-tools'), btn = maybeById('rd-focus-disp-btn');
    if (!tools || !btn) return;
    tools.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
        const first = queryHtml(tools, 'button:not(:disabled)');
        first?.focus({ preventScroll: true });
    } else if (focusBack) {
        btn.focus({ preventScroll: true });
    }
}
let scoreFocusPrevSide: boolean | null = null;
function scoreFocusExit(quiet = false) {
    const owner = SCORE_FOCUS.owner;
    if (!owner) return;
    rdFocusDispSet(false);
    const native = SCORE_FOCUS.native, target = SCORE_FOCUS.returnTo, scroll = SCORE_FOCUS.scroll;
    SCORE_FOCUS.owner = null; SCORE_FOCUS.native = false; SCORE_FOCUS.token++;
    delete document.body.dataset.scoreFocus;
    if (owner === 'analysis') {
        scorePlayer?.setStage(false, true);
        if (scoreFocusPrevSide !== null) {
            const restoreSide = scoreFocusPrevSide;
            scoreFocusPrevSide = null;
            scorePlayer?.setSide(restoreSide);
        }
    }
    else {
        SCORE_FOCUS.readOverride = false;
        read?.autoCancel();
        stageSync();
    }
    if (native && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    scoreFocusUi();
    if (!quiet) requestAnimationFrame(() => {
        if (SCORE_FOCUS.owner || view0() !== owner) return;
        window.scrollTo(0, scroll);
        target?.focus({ preventScroll: true });
    });
}
function scoreFocusToggle(owner: 'analysis' | 'read', target: HTMLElement) {
    const on = owner === 'analysis' ? !!scorePlayer?.stageOn() : SCORE_FOCUS.owner === 'read';
    if (on) {
        if (SCORE_FOCUS.owner) scoreFocusExit();
        else scorePlayer?.setStage(false);
        return;
    }
    if (owner === 'analysis' ? !scorePlayer?.hasNotes() : !read?.hasPiece() || byId('rdp-pieces').hidden) return;
    scoreFocusEnter(owner, target);
}
function scoreFocusEnter(owner: 'analysis' | 'read', target: HTMLElement, manual = true) {
    document.body.dataset.scoreFocus = owner;
    SCORE_FOCUS.owner = owner; SCORE_FOCUS.returnTo = target; SCORE_FOCUS.scroll = scrollY;
    const token = ++SCORE_FOCUS.token;
    if (owner === 'analysis') {
        if (scorePlayer) {
            scoreFocusPrevSide = scorePlayer.sideOpen();
            scorePlayer.setSide(false);
            scorePlayer.closeSheet(true);
            scorePlayer.setStage(true);
        }
    }
    else { SCORE_FOCUS.readOverride = true; stageSync(); }
    scoreFocusUi();
    if (manual && owner === 'read') byId('rd-top-fs').focus({ preventScroll: true });
    if (manual && fsCan() && !document.fullscreenElement) {
        SCORE_FOCUS.native = true;
        void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => {
            if (token !== SCORE_FOCUS.token && document.fullscreenElement) {
                // A quick exit/re-entry adopts the pending request; a cancelled session releases it.
                if (SCORE_FOCUS.owner) SCORE_FOCUS.native = true;
                else void document.exitFullscreen().catch(() => {});
            }
        }).catch(() => { if (token === SCORE_FOCUS.token) SCORE_FOCUS.native = false; });
    }
}
function scoreFocusFullscreenChanged() {
    if (SCORE_FOCUS.native && !document.fullscreenElement) scoreFocusExit();
    fsUi(); scoreFocusUi();
}
/* computer keyboard */
// Notes and Z / X follow physical key positions (KeyboardEvent.code), so QWERTZ, AZERTY… keep the piano shape; shortcuts stay on letters.
const KEYMAP: Record<string, number> = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12 };
const typingDown = new Map<string, number>();
function shiftTypeOctave(dir: number) { releaseTypingKeys(); const next = typeOctave + dir * 12, minLow = BASE_LOW, maxLow = Math.max(BASE_LOW, BASE_HIGH - view.oct * 12); if (dir < 0) {
    if (next < view.low && view.low > minLow) {
        view.low = Math.max(minLow, view.low - 12);
        buildKeyboard();
        repaintHeld();
    }
}
else if (dir > 0) {
    if (next + 12 > viewHigh() && view.low < maxLow) {
        view.low = Math.min(maxLow, view.low + 12);
        buildKeyboard();
        repaintHeld();
    }
} typeOctave = next; clampTypeOctave(); }
function physKey(e: KeyboardEvent) { return e.code || (/^[a-z]$/i.test(e.key || '') ? 'Key' + e.key.toUpperCase() : ''); } // some synthetic and virtual-keyboard events carry no code
// Name those physical keys as the user's layout prints them (Keyboard Map API, Chromium); elsewhere the QWERTY names stay.
function kbdLayoutLabels() {
    const kb = (navigator).keyboard;
    if (!kb || typeof kb.getLayoutMap !== 'function')
        return;
    try {
        kb.getLayoutMap().then((map) => queryAllHtml(document, 'kbd[data-codes]').forEach((el) => {
            const ks = (el.dataset.codes ?? '').split(' ').map((c) => map.get(c));
            if (ks.every((x) => typeof x === 'string' && x.trim()))
                el.textContent = ks.map((x) => String(x).toUpperCase()).join(el.dataset.sep || ' ');
        })).catch(() => { });
    }
    catch (_) { }
}
function releaseTypingKeys() { typingDown.forEach((m, k) => handleNoteOff(m, 'typing:' + k)); typingDown.clear(); }
function inField() { const a = document.activeElement; return a && (/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) || (a instanceof HTMLElement && a.isContentEditable)); }
document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt') {
        releaseTypingKeys();
        return;
    }
    if ((e.key !== 'Escape' && inField()) || byId('drawer').classList.contains('on') || byId('helpBox').classList.contains('on') || byId('appDialog').classList.contains('on') || !byId('mobileMenu').hidden || e.repeat)
        return;
    const k = e.key.toLowerCase();
    if (e.key === '?') {
        e.preventDefault();
        openHelp(!byId('helpBox').classList.contains('on'));
        return;
    }
    if (read?.key(e, k))
        return;
    if (practice?.sessionKey(k, e)) // session shortcuts: digits pick an answer, R replays, N advances
        return;
    if (view0() === 'analysis' && scorePlayer?.hasNotes() && /^[lpmc]$/.test(k))
        return; // score shortcuts keep their letters wherever the layout puts them
    const c = physKey(e);
    if (c === 'KeyZ') {
        e.preventDefault();
        shiftTypeOctave(-1);
        return;
    }
    if (c === 'KeyX') {
        e.preventDefault();
        shiftTypeOctave(1);
        return;
    }
    if (c in KEYMAP) {
        const m = typeOctave + KEYMAP[c];
        if (!typingDown.has(c)) {
            e.preventDefault();
            typingDown.set(c, m);
            handleNoteOn(m, 100, 'typing:' + c);
        }
    }
});
document.addEventListener('keyup', (e) => { const c = physKey(e), m = typingDown.get(c); if (m !== undefined) {
    typingDown.delete(c);
    handleNoteOff(m, 'typing:' + c);
} });
/* ---------- GRADING CORE ---------- */
function chordTargetPcs(rootPc: number, tpl: theory.ChordTemplate|undefined) { if (!tpl)
    throw new Error('Étude: unknown chord template'); return chordPitches(rootPc, tpl.intervals); }
function inversionOf(rootPc: number, tpl: { symbol: string; idx?: number; pcset?: readonly number[]; intervals?: readonly number[] }, bassMidi: number) {
    const { idx, pcset } = tpl;
    if (idx === undefined || !pcset)
        return 0;
    return chordInversion(rootPc, { idx, symbol: tpl.symbol, pcset, intervals: tpl.intervals }, bassMidi);
}
function identifyChord(notes: readonly number[], expected?: number) { return identifyChordDomain(notes, CHORDS , expected); }
function formatChord(root: string, sym: string) {
    return theory.formatChordSymbol(root, sym, notation);
}
function slashLabel(id: { rootPc: number; chord: { symbol: string; }; inversion: number; bassPc: number; }, rootSp?: theory.SpelledMidi, bassSp?: theory.SpelledMidi) {
    const rootLabel = rootSp ? spelledName(notation, rootSp.li, rootSp.acc, true) : rootName(id.rootPc);
    const bassLabel = bassSp ? spelledName(notation, bassSp.li, bassSp.acc, true) : rootName(id.bassPc);
    return formatChord(rootLabel, id.chord.symbol) + (id.inversion > 0 ? '/' + bassLabel : '');
}
/* ============================================================================
   ITEM MODEL + SPACED REPETITION
   ============================================================================ */
function freshData(): StoredTrainerData { return { srs: {}, streak: 0, bestStreak: 0, lastActive: 0, todayDay: 0, todayCount: 0, newToday: 0, totalReviews: 0, totalCorrect: 0, placed: false, history: {}, singCleared: {}, sheet: {}, settings: { goal: 12, newPerDay: 5, allowInv: false, metronome: false, drone: false, weakSpotInjection: false, anyOctave: false } }; }
function restoreTrainerData(saved: storage.PttV3Payload['data']): StoredTrainerData {
    const { settings, srs, ...rest } = saved;
    const restored = {
        ...freshData(), ...rest,
        settings: restoreSettings(settings),
        srs: storage.restoreSrs(srs),
    };
    if (!isRecord(restored.sheet)) restored.sheet = {};
    const lb = restored.lastBuiltinPiece as unknown;
    if (isRecord(lb) && typeof lb.id === 'string' && typeof lb.at === 'number' && Number.isFinite(lb.at)) {
        restored.lastBuiltinPiece = {
            id: lb.id,
            at: lb.at,
            ...(typeof lb.measure === 'string' ? { measure: lb.measure } : {}),
            ...(typeof lb.speed === 'number' && Number.isFinite(lb.speed) ? { speed: lb.speed } : {}),
            ...(typeof lb.elapsed === 'number' && Number.isFinite(lb.elapsed) ? { elapsed: lb.elapsed } : {}),
        };
    } else {
        delete restored.lastBuiltinPiece;
    }
    return restored;
}
let data = freshData();
function currentStreak() { return (data.lastActive >= todayN() - 1) ? (data.streak || 0) : 0; } // a missed day shows as 0, not the stale count
// Spaced repetition lives in src/core/srs.ts; these wrappers pass the live srs map and today's day number.
function srsOf(id: string|number) { return srsEntryOf(data.srs, id); }
const IVL = SRS_INTERVALS;
function reviewItem(id: string, correct: boolean) {
    const first = srsReview(data.srs, id, correct, todayN());
    creditReview(correct);
    if (first)
        data.newToday = (data.newToday || 0) + 1; // count fresh concepts against the daily quota
    saveAll();
}
function creditReview(correct: boolean) {
    data.totalReviews++;
    if (correct)
        data.totalCorrect++;
    touchDay();
}
function markReadDoneToday(save = false) {
    const tv = data.toolDay || (data.toolDay = {});
    tv['read'] = todayN();
    if (save)
        saveSoon();
}
function touchDay() {
    const t = todayN();
    if (data.todayDay !== t) {
        if (data.lastActive === t - 1)
            data.streak++;
        else
            data.streak = 1;
        data.todayDay = t;
        data.todayCount = 0;
        data.newToday = 0;
        data.lastActive = t;
    }
    data.todayCount++;
    data.bestStreak = Math.max(data.bestStreak || 0, data.streak || 0);
    const h = data.history || (data.history = {});
    h[t] = (h[t] || 0) + 1;
    const keys = Object.keys(h);
    if (keys.length > 400)
        keys.sort((a, b) => Number(a) - Number(b)).slice(0, keys.length - 400).forEach((k) => delete h[k]);
}
function seedPlacement(id: string, known: boolean) { srsSeedPlacement(data.srs, id, known, todayN()); }
function boxOf(id: string|number) { return srsBox(data.srs, id); }
function isDue(id: string|number) { return srsIsDue(data.srs, id, todayN()); }
function isNew(id: string|number) { return srsIsNew(data.srs, id); }
function dueItems() { return srsDueItems(ITEMS, data.srs, todayN()); }
function newItemsAvail() { return srsNewItems(ITEMS, data.srs); }
// New concepts still allowed today: the daily quota minus those already introduced today (across sessions).
function newQuotaLeft() { return srsNewQuotaLeft(data, data.settings.newPerDay, todayN()); }
function masteredCount() { return srsMasteredCount(ITEMS, data.srs); }
/* ============================================================================
   VIEWS / ROUTER
   ============================================================================ */
let _view = 'today';
function view0() { return _view; }
const _modalStack: string[] = [];
let _modalBackPending = false, _modalAfterBack: string | null = null;
function historyModalOf(state: unknown): unknown {
    return state && typeof state === 'object' && 'modal' in state ? state.modal : undefined;
}
function pushModalState(id: string) {
    if (_modalBackPending) {
        _modalAfterBack = id;
        _modalStack.length = 0;
        _modalStack.push(id);
        return;
    }
    // Opening an overlay from the mobile menu replaces that temporary menu entry.
    if (id !== 'menu' && historyModalOf(history.state) === 'menu' && !byId('mobileMenu').hidden) {
        closeMobileMenu(false, true);
        _modalStack.length = 0;
        try {
            history.replaceState({ modal: id }, '', location.href);
            _modalStack.push(id);
        }
        catch (_) { }
        return;
    }
    if (!_modalStack.includes(id)) {
        _modalStack.push(id);
        try {
            history.pushState({ modal: id }, '', location.href);
        }
        catch (_) { }
    }
}
function popModalState(id: string) {
    const idx = _modalStack.indexOf(id);
    if (idx !== -1) {
        _modalStack.splice(idx, 1);
        if (_modalBackPending && _modalAfterBack === id) {
            _modalAfterBack = null;
            return;
        }
        if (historyModalOf(history.state) === id) {
            try {
                _modalBackPending = true;
                history.back();
            }
            catch (_) {
                _modalBackPending = false;
            }
        }
    }
}
function closeMobileMenu(returnFocus = false, fromPop = false) {
    const menu = byId('mobileMenu');
    if (!menu || menu.hidden)
        return false;
    menu.hidden = true;
    byId('menuBtn').setAttribute('aria-expanded', 'false');
    if (!fromPop)
        popModalState('menu');
    if (returnFocus)
        byId('menuBtn').focus();
    return true;
}
function openMobileMenu(fromPop = false) {
    const mm = byId('mobileMenu');
    if (!fromPop)
        pushModalState('menu');
    mm.innerHTML = '';
    queryAllHtml(document, '#nav button').forEach((b) => { const x = (document).createElement('button'); x.textContent = b.textContent; x.dataset.view = b.dataset.view; x.setAttribute('aria-current', b.getAttribute('aria-current') || 'false'); x.addEventListener('click', () => show(x.dataset.view)); mm.appendChild(x); });
    mm.hidden = false;
    byId('menuBtn').setAttribute('aria-expanded', 'true');
    const first = queryHtml(mm, '[aria-current="page"]') || mm.querySelector('button');
    first?.focus();
}
// Keeps the header on one line whatever the language or MIDI device name: while the settings button is pushed past the
// bar's padding, first drop the tagline, then fold the section tabs into the menu (as below the 840px breakpoint).
function fitHeader() {
    const bar = byId('nav').parentElement, end = byId('settingsBtn');
    if (!bar)
        return;
    const fits = () => end.getBoundingClientRect().right <= bar.getBoundingClientRect().right - parseFloat(getComputedStyle(bar).paddingRight) + 0.5;
    bar.classList.remove('hdr-notag', 'hdr-fold');
    for (const step of ['hdr-notag', 'hdr-fold']) {
        if (fits())
            return;
        bar.classList.add(step);
    }
}
function renderModeNav() {
    const group = navGroup(view0()), views: readonly string[] = group ? NAV_GROUPS[group] : [];
    byId('modeBar').hidden = views.length < 2;
    byId('modeNav').innerHTML = views.map((v: string) => `<button type="button" data-view="${v}" aria-current="${v === view0() ? 'page' : 'false'}">${t(v === 'practice' ? 'nav_drills' : 'nav_' + v)}</button>`).join('');
}
function focusView(v: string) {
    const view = byId('view-' + v);
    const target = queryAllHtml(view, 'h1,h2').find((el) => el.getClientRects().length) || view;
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
}
let featureNavigation = 0;
function setViewLoading(viewId: string, loading: boolean) {
    const section = maybeById(viewId);
    if (!section) return;
    section.setAttribute('aria-busy', loading ? 'true' : 'false');
    section.querySelector('[data-lazy-loading]')?.remove();
    if (!loading) return;
    const host = section.querySelector(':scope > .wrap') ?? section;
    const note = document.createElement('p');
    note.className = 'view-loading';
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    note.dataset.lazyLoading = '';
    note.textContent = localize('loading', 'Loading…');
    host.prepend(note);
}
const loadedFeatures: Partial<Record<router.AppView, FeatureController>> = {};
const featureLoadPromises: Partial<Record<router.AppView, Promise<FeatureController>>> = {};
let activeFeatureAbort: AbortController | null = null;
let shellPendingSaveMirror = false;
let scorePlayer: ScorePlayerController | null = null;
let practice: PracticeController | null = null;
let read: ReadController | null = null;
// The stage and score-focus state follow Read; without it loaded only the shell's own bars need syncing.
function stageSync() {
    if (read) read.stageSync();
    else {
        scoreFocusUi();
        syncMobileStartBars();
    }
}
function requireRead(): ReadController {
    if (!read || !loadedFeatures.read) throw new Error('Étude: the Read feature is not loaded');
    return read;
}
let todayFeature: TodayController | null = null;
let progressFeature: ProgressController | null = null;
// Today and Progress are lazy features; these keep the shell's own callers (session end, storage sync, language) working.
function refreshToday() { todayFeature?.refresh(); }
function renderProgress() { progressFeature?.render(); }
function startReview() { withPractice((p) => { if (!p.sesActive()) p.startSession(null); }); }
// Runs `fn` with the Practice feature, loading it first (Today's Start, placement, plan links and Read's warm-up drill).
function withPractice(fn: (p: PracticeController) => void) {
    if (practice && loadedFeatures.practice) {
        fn(practice);
        return;
    }
    void ensureFeature('practice').then(() => { if (practice) fn(practice); }, () => {
        localeLoadError(async () => { await ensureFeature('practice'); if (practice) fn(practice); });
    });
}
// The Score Player is usable once its module is mounted and its heavy score modules are in.
function scorePlayerReady() { return !!loadedFeatures.analysis && !!scorePlayer?.modulesReady(); }
function scorePlayerRoute(): AnalysisRoute { return scorePlayer?.currentRoute() ?? { kind: 'catalog' }; }

const lazyFeatureLoaders: Partial<Record<router.AppView, () => Promise<FeatureController>>> = {
    explore: async () => (await import('../features/explore/index.js')).createExploreFeature(appHost),
    sing: async () => (await import('../features/voice/index.js')).createVoiceFeature(appHost),
    learn: async () => (await import('../features/learn/index.js')).createLearnFeature(appHost),
    read: async () => {
        const { createReadFeature } = await import('../features/read/index.js');
        read = createReadFeature(appHost, readShell);
        return read;
    },
    today: async () => {
        const { createTodayFeature } = await import('../features/today/index.js');
        todayFeature = createTodayFeature(appHost, todayShell);
        return todayFeature;
    },
    progress: async () => {
        const { createProgressFeature } = await import('../features/progress/index.js');
        progressFeature = createProgressFeature(appHost, progressShell);
        return progressFeature;
    },
    practice: async () => {
        const { createPracticeFeature } = await import('../features/practice/index.js');
        practice = createPracticeFeature(appHost, practiceShell);
        return practice;
    },
    analysis: async () => {
        const { createScorePlayerFeature } = await import('../features/score-player/index.js');
        scorePlayer = createScorePlayerFeature(appHost, scorePlayerShell);
        return scorePlayer;
    },
};

function localizeLoadedFeatures() {
    for (const ctrl of Object.values(loadedFeatures)) ctrl?.localize?.();
}

function panicLoadedFeatures() {
    for (const ctrl of Object.values(loadedFeatures)) ctrl?.panic?.();
}

function anyLoadedFeatureBusy() {
    return Object.values(loadedFeatures).some((ctrl) => ctrl?.isBusy?.() === true);
}

async function ensureFeature(view: router.AppView): Promise<FeatureController | null> {
    const existing = loadedFeatures[view];
    if (existing) return existing;
    const inflight = featureLoadPromises[view];
    if (inflight) return inflight;
    const loader = lazyFeatureLoaders[view];
    if (!loader) return null;
    const promise = loader().then((controller) => {
        controller.mount?.(appHost);
        loadedFeatures[view] = controller;
        delete featureLoadPromises[view];
        return controller;
    }, (err) => {
        delete featureLoadPromises[view];
        throw err;
    });
    featureLoadPromises[view] = promise;
    return promise;
}

// Score preferences live here so saving, restoring and other tabs' saves never need the Score Player loaded. While it is
// loaded the feature owns the live values: they are pulled in before every save and pushed back after a restore.
let scorePrefs: UiPrefsSnapshot = {
    scoreLook: 'paper',
    scoreHl: false,
    scoreLayout: defaultScoreLayoutForViewport(window.innerWidth),
    scoreFallMode: 'score',
    scoreLayoutExplicit: false,
    anSide: { open: false, tab: 'now', w: 340 },
};
function scorePrefsNow(): UiPrefsSnapshot {
    // Only a mounted Score Player holds live values (mount() itself reads the shell's copy first).
    if (scorePlayer && loadedFeatures.analysis) scorePrefs = scorePlayer.prefs();
    return scorePrefs;
}
function setScorePrefs(next: UiPrefsSnapshot) {
    scorePrefs = next;
    scorePlayer?.applyPrefs(next);
}
const shellUiPrefs: UiPrefsStore = {
    get(): UiPrefsSnapshot {
        return scorePrefsNow();
    },
    set(patch: UiPrefsPatch, options?: { readonly save?: 'soon' | 'now' | 'none' }) {
        const cur = scorePrefsNow();
        setScorePrefs({
            scoreLook: patch.scoreLook ?? cur.scoreLook,
            scoreHl: patch.scoreHl ?? cur.scoreHl,
            scoreLayout: patch.scoreLayout ?? cur.scoreLayout,
            scoreFallMode: patch.scoreFallMode ?? cur.scoreFallMode,
            scoreLayoutExplicit: patch.scoreLayoutExplicit ?? cur.scoreLayoutExplicit,
            anSide: {
                open: patch.anSide?.open ?? cur.anSide.open,
                tab: patch.anSide?.tab ?? cur.anSide.tab,
                w: patch.anSide?.w ?? cur.anSide.w,
            },
        });
        const mode = options?.save ?? 'soon';
        if (mode === 'now') saveAll();
        else if (mode === 'soon') saveSoon();
    },
};

const appHost: AppHost = {
    i18n: {
        t: (key, ...args) => t(key, ...args),
        localize,
        lang: () => lang,
        spell: (letter, acc, ascii = false) => spelledName(notation, letter, acc, ascii),
        notation: () => notation,
        loadLearn: async () => { await loadLearn(lang); },
        chordDisp,
        scaleDisp,
        invName,
        intervalLabel,
        noteName: (midi, flat = false) => noteName(midi, flat),
        pcName: (p, flat = false) => pcName(p, flat),
        slashLabel,
        formatChord,
        fillRoots,
        stepLabel: (s) => {
            const d = STEP_LABELS[lang] || { 2: 'T', 1: 'S', 3: 'T+S' };
            return d[s] || (s === 2 ? d[2] : s === 1 ? d[1] : d[3]);
        },
    },
    audio: {
        ensure: () => ensureAudio(),
        preparePiano: () => preparePiano(),
        context: () => audioEngine.context,
        requireContext: requireAudioContext,
        timedReady: timedAudioReady,
        scheduleClick: (when, accent, phraseBucket = false) => {
            audioEngine.scheduleClick(when, accent, phraseBucket ? phraseClicks : undefined);
        },
        stopPhraseClicks: () => stopClicks(phraseClicks),
        noteOn: (midi, velocity) => audioNoteOn(midi, velocity),
        noteOff: (midi) => audioNoteOff(midi),
        previewNote: (midi, when, duration, velocity, options) => previewNote(midi, when, duration, velocity, options),
        playInterval: (rootMidi, semitones, style = 'both') => playInterval(rootMidi, semitones, style),
        playChordMidis,
        playScaleNotes,
        playProg,
        stopPreviews,
    },
    metro: {
        getBpm: () => metro.bpm,
        isRunning: () => metro.on,
        start: (bpm, startAt) => startMetro(bpm, startAt),
        stop: () => stopMetro(),
        click: (when, accent) => metroClick(when, accent),
        startDrone,
        stopDrone,
    },
    input: {
        subscribe(listener) {
            inputBusListeners.add(listener);
            return () => { inputBusListeners.delete(listener); };
        },
        heldMidis,
        heldPcs: () => [...new Set(heldMidis().map((m) => pc(m)))],
        isMidiLive: midiLive,
        releaseLiveInput,
        releaseFocusInput,
    },
    dock: {
        sync: dockSync,
        setOpen: dockSet,
        isShown: dockShown,
        clear: (state) => { if (state) kbClear(state); else kbClearAll(); },
        mark: (midi, state, anyOctave = false) => kbState(midi, state, anyOctave),
        clearKeyIfState: (midi, state, anyOctave = false) => {
            const el = keyEl.get(anyOctave ? foldToView(midi) : midi);
            if (el && el.dataset.s === state) kbState(midi, null, anyOctave);
        },
        setDegrees: kbDegrees,
        ensureVisible: (midis) => {
            if (!midis.length) return;
            const lo = Math.min(...midis), hi = Math.max(...midis);
            if (lo < view.low || hi > viewHigh()) {
                view.low = Math.max(21, Math.min(84, Math.floor((lo + hi) / 2 - 18)));
                buildKeyboard();
            }
        },
        fixedBottomTop,
        onReflow(listener) {
            dockReflowListeners.add(listener);
            return () => { dockReflowListeners.delete(listener); };
        },
    },
    nav: {
        show: ((...args: Parameters<ShowFn>) => (show as (...a: unknown[]) => void | Promise<void>)(...args)) as ShowFn,
        activeView: () => (isAppView(_view) ? _view : 'today'),
        isPendingSaveProtected: () => shellPendingSaveMirror || !!read?.isPendingSaveProtected(),
        setPendingSave: (protectedAttempt: boolean) => { shellPendingSaveMirror = protectedAttempt; },
        nextReadDrillForUnits: (rdUnits) => {
            if (!rdUnits || !rdUnits.length) return null;
            const all = RD_UNITS.filter((x) => rdUnits.includes(x.u)).flatMap((x) => x.lv);
            const lv = all.find((L) => (rdData().lv[L.id]?.s || 0) < 1) || all[all.length - 1] || null;
            return lv ? { id: lv.id, name: rdLvName(lv) } : null;
        },
    },
    overlays: {
        pushModal: pushModalState,
        popModal: () => popModalState(_modalStack[_modalStack.length - 1] ?? ''),
        openCount: () => _modalStack.length,
        focusView: (view) => focusView(view),
        showLoadError: localeLoadError,
    },
    store: {
        data: () => data,
        saveNow: saveAll,
        saveSoon,
        flushSaveSoon,
        uiPrefs: () => shellUiPrefs,
    },
    previews: {
        registerStopper(stop) {
            previewStoppers.add(stop);
            return () => { previewStoppers.delete(stop); };
        },
        registerSequenceHandler(handler) {
            previewSequenceHandlers.add(handler);
            return () => { previewSequenceHandlers.delete(handler); };
        },
        stopAll: stopPreviews,
    },
    wake: {
        ping: wakePing,
        sync: wakeUi,
    },
    coach: {
        setContext: () => {},
        refresh: coachRefresh,
    },
    reduceMotion: () => reduceMotion(),
    testSurface: null,
};

const readShell: ReadShell = {
    audioEngine,
    keyboardView: view,
    keyEl,
    held,
    inputOwners,
    baseLow: BASE_LOW,
    baseHigh: BASE_HIGH,
    metroState: metro,
    scoreFocus: SCORE_FOCUS,
    stage: STAGE,
    get letters() { return LETTERS; },
    view0,
    todayN,
    labelMode: () => labelMode,
    strings: () => STRINGS,
    ensureAudio: (warm) => ensureAudio(warm),
    audioLockCheck,
    kbState: (midi, state, fold) => kbState(midi, state, fold),
    kbClear,
    buildKeyboard,
    repaintHeld,
    foldToView,
    dockKeyInSight,
    dockForced: () => DOCK.force,
    setDockForced: (on) => { DOCK.force = on; },
    anLayoutVars,
    syncMobileStartBars,
    touchInput,
    inField: () => !!inField(),
    panic,
    appConfirm,
    scoreFocusUi,
    scoreFocusExit: (quiet) => scoreFocusExit(quiet),
    scoreFocusEnter: (owner, target, manual) => scoreFocusEnter(owner, target, manual),
    readScoreZoom: (value) => readScoreZoom(value),
    rdFocusDispSet: (open, focusBack) => rdFocusDispSet(open, focusBack),
    touchDay,
    markReadDoneToday: (save) => markReadDoneToday(save),
    storeDaily,
    storeBlocked: () => !!STORE.blocked,
    storeBackupBlocked,
    progressGeneration: () => String(SYNC.gen),
    savedGeneration: () => String(readPttV3(localStorage)?.payload?.gen ?? ''),
    setWeakSpotInjection,
    learnLessonsDone: () => Object.keys(learnData().learnDone || {}).length,
    currentStreak,
    masteredCount,
    itemLabel,
    withPractice,
    catLabel,
    rdData,
    rdLvName,
    rdStarCount,
    rdEsc,
    statHTML,
    srPieceTitle,
    spelledName: (sys, letter, acc, ascii) => spelledName(sys, letter, acc, ascii),
    tl,
    anNum,
    coachHTML: (lead, tip, actId) => coachHTML(lead, tip, actId),
    coachText,
    registerCoach: (refresh) => coaching.register(refresh),
};

const todayShell: TodayShell = {
    todayN,
    currentStreak,
    dueItems,
    newItemsAvail,
    newQuotaLeft,
    masteredCount,
    isNew,
    itemLabel,
    catLabel,
    learnPlanItems,
    sesActive: () => !!practice?.sesActive(),
    startReview,
    earCheck: () => withPractice((p) => p.earCheck()),
};

const progressShell: ProgressShell = {
    collectPracticeReport: (buildReport, libraryItems) => requireRead().collectPracticeReport(buildReport, libraryItems),
    storeHasProgress,
    todayN,
    currentStreak,
    masteredCount,
    itemLabel,
    catLabel,
    statHTML,
    rdRenderStats: () => read?.renderStats(),
    localeTag: () => LOCALE_TAGS[lang] || lang,
    startReview,
    // The report's reading and piece facts come from Read, so Progress loads it first.
    prepareReport: async () => { await ensureFeature('read'); },
};

const practiceShell: PracticeShell = {
    audioEngine,
    keyboardView: view,
    keyEl,
    held,
    baseLow: BASE_LOW,
    baseHigh: BASE_HIGH,
    view0,
    todayN,
    ensureAudio: (warm) => ensureAudio(warm),
    pianoEnsure,
    kbState: (midi, state, fold) => kbState(midi, state, fold),
    kbClear,
    kbClearAll,
    buildKeyboard,
    repaintHeld,
    reflowKeys,
    foldToView,
    viewHigh,
    dockKeyInSight,
    syncMobileStartBars,
    refreshToday,
    playIvDir,
    rootName,
    ivName,
    catLabel,
    progDisp,
    feelDisp,
    chordFormula,
    scaleFormula,
    songsFor,
    itemLabel,
    rdEsc,
    spelledName: (sys, letter, acc, ascii) => spelledName(sys, letter, acc, ascii),
    isFlatKey,
    identifyChord: (notes, expected) => identifyChord(notes, expected),
    chordTargetPcs,
    inversionOf,
    boxOf,
    isDue,
    isNew,
    dueItems,
    newItemsAvail,
    newQuotaLeft,
    seedPlacement,
    reviewItem,
    creditReview,
    currentStreak,
};

const scorePlayerShell: ScorePlayerShell = {
    audioEngine,
    scoreClicks,
    keyboardView: view,
    keyEl,
    held,
    scoreFocus: SCORE_FOCUS,
    baseLow: BASE_LOW,
    baseHigh: BASE_HIGH,
    view0,
    kbState: (midi, state, fold) => kbState(midi, state, fold),
    labelMode: () => labelMode,
    strings: () => STRINGS,
    navigationToken: () => featureNavigation,
    bumpNavigation: () => ++featureNavigation,
    ensureAudio: (warm) => ensureAudio(warm),
    pianoEnsure,
    stopClicks,
    buildKeyboard,
    repaintHeld,
    foldToView,
    dockOpen: (v) => dockOpen(v),
    layoutVars: anLayoutVars,
    layoutVarsSoon,
    handleNoteOn: (midi, velocity, source) => handleNoteOn(midi, velocity, source),
    handleNoteOff: (midi, source, releaseKind, silence) => handleNoteOff(midi, source, releaseKind, silence),
    touchInput,
    inField: () => !!inField(),
    blurInputField,
    touchDay,
    scoreFocusExit: (quiet) => scoreFocusExit(quiet),
    scoreFocusToggle,
    appConfirm,
    learnGoId,
    showNotationReloadPrompt,
    defaultScoreLayoutForViewport,
    savedScoreView,
    identifyChord: (notes, expected) => identifyChord(notes, expected),
    srPieceTitle,
    spelledName: (sys, letter, acc, ascii) => spelledName(sys, letter, acc, ascii),
    tl,
    anNum,
    tf,
    coachList,
    coachHTML: (lead, tip, actId) => coachHTML(lead, tip, actId),
};


function teardownView(prev: string, next: string) {
    if (prev !== next && activeFeatureAbort) {
        activeFeatureAbort.abort();
        activeFeatureAbort = null;
    }
    if (prev !== next && isAppView(prev) && loadedFeatures[prev]) {
        loadedFeatures[prev]?.leave(isAppView(next) ? next : 'today');
    }
    if (prev !== next) {
        releaseLiveInput();
        stopPreviews();
        kbClear('target');
        kbDegrees(null);
    }
    if (prev === 'read' && next !== 'read')
        read?.stopForNavigation();
    if (practice?.sesActive() && next !== practice.sesHome()) { /* leaving mid-session */
        practice.endSession(false);
    }
}
function showImpl(
    v: string | undefined,
    moveFocusOrOpts?: boolean | ShowOptions,
    fromHistoryArg = false,
    analysisRouteArg?: AnalysisRoute | null,
): void | Promise<void> {
    const opts: ShowOptions = typeof moveFocusOrOpts === 'object' && moveFocusOrOpts !== null ? moveFocusOrOpts : {};
    const moveFocus: boolean = typeof moveFocusOrOpts === 'boolean' ? moveFocusOrOpts : (opts.moveFocus ?? true);
    const fromHistory: boolean = typeof moveFocusOrOpts === 'object' && moveFocusOrOpts !== null ? (opts.fromHistory ?? false) : fromHistoryArg;
    const analysisRoute: AnalysisRoute | null | undefined = typeof moveFocusOrOpts === 'object' && moveFocusOrOpts !== null ? opts.analysisRoute : analysisRouteArg;
    const navigation = ++featureNavigation;
    const requestedAnRoute = v === 'analysis'
        ? (analysisRoute ?? (fromHistory || !_routed ? (parseAnalysisHash(location.hash) ?? { kind: 'catalog' }) : scorePlayerRoute()))
        : null;
    if (v === 'analysis' && !scorePlayerReady()) {
        if (practice?.hintPreviewActive()) stopPreviews();
        const prevView = _view;
        const showPendingView = !(prevView === 'read' && appHost.nav.isPendingSaveProtected());
        if (showPendingView) {
            if (prevView !== 'analysis') teardownView(prevView, 'analysis');
            const wantHash = formatAnalysisHash(requestedAnRoute ?? { kind: 'catalog' });
            if (location.hash !== wantHash) {
                const viaModal = _modalStack.length > 0;
                _modalStack.length = 0;
                try {
                    history[(_routed && !viaModal) ? 'pushState' : 'replaceState'](null, '', wantHash);
                }
                catch (_) { }
            }
            _routed = true;
            _view = 'analysis';
            viewState.view = 'analysis';
            stageSync();
            document.querySelectorAll('.view').forEach((s) => s.classList.toggle('active', s.id === 'view-analysis'));
            const targetGroup = navGroup('analysis');
            queryAllHtml(document, '#nav button, #bottomNav button').forEach((b) => b.setAttribute('aria-current', navGroup(b.dataset.view ?? '') === targetGroup ? 'page' : 'false'));
            byId('modeBar').hidden = true;
            closeMobileMenu();
        }
        setViewLoading('view-analysis', true);
        return ensureFeature('analysis').then(() => {
            if (!scorePlayer) throw new Error('Étude: the Score Player did not load');
            return scorePlayer.ensureModules();
        }).then(() => {
            setViewLoading('view-analysis', false);
            if (navigation === featureNavigation) {
                if (opts.openFile || opts.pieceId) {
                    return show(v, { moveFocus, fromHistory, analysisRoute: requestedAnRoute, openFile: opts.openFile, pieceId: opts.pieceId });
                }
                return show(v, moveFocus, fromHistory, requestedAnRoute);
            }
        }).catch(() => {
            setViewLoading('view-analysis', false);
            if (navigation === featureNavigation && showPendingView) {
                _view = prevView;
                if (isAppView(prevView)) viewState.view = prevView;
                try {
                    history.replaceState(history.state, '', '#' + prevView);
                }
                catch (_) { }
                document.querySelectorAll('.view').forEach((s) => s.classList.toggle('active', s.id === 'view-' + prevView));
                const prevGroup = navGroup(prevView);
                queryAllHtml(document, '#nav button, #bottomNav button').forEach((b) => b.setAttribute('aria-current', navGroup(b.dataset.view ?? '') === prevGroup ? 'page' : 'false'));
                renderModeNav();
            }
            showNotationReloadPrompt();
        });
    }
    const hum = v !== undefined && isMergedView(v); // transcribe, the one merged view: the Hum to notes side of Voice
    if (v !== undefined && isMergedView(v))
        v = MERGED_VIEWS[v];
    if (v !== undefined && isMovedView(v)) {
        const moved = v;
        withPractice((p) => p.openMoved(moved, moveFocus, fromHistory));
        return;
    }
    if (v === undefined || !isAppView(v))
        return;
    document.querySelector('#locale-load-error[data-lazy-owner]')?.remove();
    const prev = _view;
    if (prev === 'read' && v !== 'read' && appHost.nav.isPendingSaveProtected()) {
        const reader = read;
        if (reader?.isPendingSaveState()) {
            if (location.hash.slice(1) !== prev) {
                try {
                    history.replaceState(history.state, '', '#' + prev);
                }
                catch (_) { }
            }
            void reader.abandonClaim().then((result) => {
                if (result.ok || !reader.isPendingSaveState()) {
                    show(hum ? 'transcribe' : v, moveFocus, fromHistory);
                }
                else if (location.hash.slice(1) !== prev) {
                    try {
                        history.replaceState(history.state, '', '#' + prev);
                    }
                    catch (_) { }
                }
            });
        }
        return;
    }
    if (SCORE_FOCUS.owner && v !== SCORE_FOCUS.owner) scoreFocusExit(true);
    if (v !== 'read') SCORE_FOCUS.readOverride = null;
    viewState.view = v;
    const targetHash = v === 'analysis' ? formatAnalysisHash(requestedAnRoute ?? scorePlayerRoute()) : '#' + v;
    if (location.hash !== targetHash) {
        const viaModal = _modalStack.length > 0;
        _modalStack.length = 0; // the modal's history entry becomes the new view's entry
        try {
            history[(_routed && !viaModal) ? 'pushState' : 'replaceState'](null, '', targetHash);
        }
        catch (_) { }
    }
    _routed = true;
    if (v !== 'today') {
        data.lastTool = v;
        if (v !== 'read') {
            const tv = data.toolDay || (data.toolDay = {});
            tv[v] = todayN();
        }
        saveSoon();
    }
    teardownView(prev, v);
    _view = v;
    stageSync();
    (document).querySelectorAll('.view').forEach((s) => s.classList.toggle('active', s.id === 'view-' + v));
    const group = navGroup(v);
    queryAllHtml(document, '#nav button, #bottomNav button').forEach((b) => b.setAttribute('aria-current', navGroup(b.dataset.view ?? '') === group ? 'page' : 'false'));
    dockSync();
    if (dockShown())
        reflowKeys(); // reposition once the dock is laid out
    closeMobileMenu();
    let pendingViewLoad: Promise<void> | undefined;
    if (lazyFeatureLoaders[v]) {
        const featureParams: Record<string, unknown> = {};
        if (opts.extab) featureParams.extab = opts.extab;
        if (opts.openFile) featureParams.openFile = opts.openFile;
        if (opts.learnLessonId) featureParams.learnLessonId = opts.learnLessonId;
        if (opts.practiceTopic) featureParams.practiceTopic = opts.practiceTopic;
        if (opts.readingKeyId) featureParams.readingKeyId = opts.readingKeyId;
        if (opts.readingDrillId) featureParams.readingDrillId = opts.readingDrillId;
        if (opts.practiceMode) featureParams.practiceMode = opts.practiceMode;
        if (opts.practiceKey) featureParams.practiceKey = opts.practiceKey;
        if (v === 'analysis') {
            if (opts.pieceId) featureParams.pieceId = opts.pieceId;
            featureParams.analysisRoute = requestedAnRoute ?? { kind: 'catalog' };
        }
        if (hum) {
            featureParams.voiceAct = 'hum';
            featureParams.wasOnSing = prev === 'sing';
        }
        const enterFeature = (ctrl: FeatureController): Promise<void> | undefined => {
            activeFeatureAbort?.abort();
            activeFeatureAbort = new AbortController();
            const res = ctrl.enter(featureParams, activeFeatureAbort.signal);
            return res instanceof Promise ? res : undefined;
        };
        const loaded = loadedFeatures[v];
        if (loaded) {
            setViewLoading('view-' + v, false);
            pendingViewLoad = enterFeature(loaded);
        }
        else {
            setViewLoading('view-' + v, true);
            pendingViewLoad = ensureFeature(v).then((ctrl) => {
                setViewLoading('view-' + v, false);
                document.querySelector(`#locale-load-error[data-lazy-owner="${v}"]`)?.remove();
                if (ctrl && navigation === featureNavigation && _view === v) {
                    return enterFeature(ctrl);
                }
            }, () => {
                setViewLoading('view-' + v, false);
                if (navigation === featureNavigation && _view === v) {
                    localeLoadError(async () => { await show(v, opts); });
                    const toast = document.getElementById('locale-load-error');
                    if (toast) toast.dataset.lazyOwner = v;
                }
            });
        }
    }
    renderModeNav();
    syncIdle(); // a language/notation/label choice another tab made while this one was busy
    if (!fromHistory && moveFocus && prev !== v) window.scrollTo({ top: 0, behavior: 'instant' });
    const active = document.activeElement;
    if (moveFocus && (!active || active === document.body || !active.isConnected || !active.getClientRects().length))
        focusView(v);
    return pendingViewLoad;
}
let show: ShowFn = showImpl;
let _routed = false;
window.addEventListener('popstate', (e) => {
    // The destination history entry, not the previously visible overlay, determines the UI.
    if (_modalBackPending) {
        _modalBackPending = false;
        const next = _modalAfterBack;
        _modalAfterBack = null;
        if (next) {
            _modalStack.length = 0;
            try {
                history.pushState({ modal: next }, '', location.href);
                _modalStack.push(next);
            }
            catch (_) { }
            return;
        }
    }
    const modal = historyModalOf(e.state);
    _modalStack.length = 0;
    if (modal === 'menu' || modal === 'help' || modal === 'drawer' || (modal === 'dialog' && appDialogClose))
        _modalStack.push(modal);
    if (modal !== 'dialog' && appDialogClose)
        appDialogClose(false, true);
    if (modal !== 'menu') {
        const menu = byId('mobileMenu'), returnFocus = !modal && menu.contains(document.activeElement) && location.hash.slice(1) === _view;
        closeMobileMenu(returnFocus, true);
    }
    if (modal !== 'help' && byId('helpBox').classList.contains('on'))
        openHelp(false, true);
    if (modal !== 'drawer' && byId('drawer').classList.contains('on'))
        openDrawer(false, true);
    const v = viewFromHash(location.hash);
    if (v !== _view) {
        _routed = false;
        show(v, true, true, v === 'analysis' ? (parseAnalysisHash(location.hash) ?? { kind: 'catalog' }) : undefined);
    }
    else if (v === 'analysis') {
        const route = parseAnalysisHash(location.hash) ?? { kind: 'catalog' };
        const player = scorePlayerReady() ? scorePlayer : null;
        if (!player) {
            void show(v, true, true, route);
        }
        else {
            if (location.hash !== formatAnalysisHash(route))
                history.replaceState(e.state, '', formatAnalysisHash(route));
            player.onPopRoute(route);
        }
    }
    else if (location.hash !== '#' + v) {
        history.replaceState(e.state, '', '#' + v);
    }
    if (modal === 'menu' && getComputedStyle(byId('menuBtn')).display !== 'none' && byId('mobileMenu').hidden)
        openMobileMenu(true);
    if (modal === 'help' && !byId('helpBox').classList.contains('on'))
        openHelp(true, true);
    if (modal === 'drawer' && !byId('drawer').classList.contains('on'))
        openDrawer(true, true);
});
/* ---------- EXPLORE (lazy feature in src/features/explore/index.ts) ---------- */
function fillRoots(sel: HTMLElement, withAll: boolean) {
    sel.innerHTML = '';
    if (withAll) {
        const o = document.createElement('option');
        o.value = 'all';
        o.textContent = t('all_keys');
        sel.appendChild(o);
    }
    NOTE_SYS[notation].root.forEach((n, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = n;
        sel.appendChild(o);
    });
}
/* ============================================================================
   LEARN SHELL BRIDGE — core progress helpers (src/core/learn-progress.ts)
   and thin navigation wrappers; full Learn UI lives lazily in src/features/learn/.
   ============================================================================ */
function learnTitle(L: Lesson) { return L[lang]?.t || L.en.t; }
function learnData() { return coreLearnData(data); }
function learnUnitOf(id: string) { return coreLearnUnitOf(id); }
function learnUnitDone(i: number) { return coreLearnUnitDone(data, i); }
function learnGap(id: string) { return coreLearnGap(data, id); }
function learnDueDays(id: string) { return coreLearnDueDays(data, id, todayN()); }
function learnDueList() { return coreLearnDueList(data, todayN()); }
function learnGoId(id: string) {
    if (LESSONS.some((L) => L.id === id)) void show('learn', { learnLessonId: id });
}
function learnPlanItems(tn: number) {
    const D = learnData(), ld = D.learnDone;
    const nextL = LESSONS.find((L) => !ld[L.id]), learnToday = Object.keys(ld).some((k) => ld[k] === tn);
    const out = [{ id: 'learn', done: learnToday || !nextL, t: t('plan_learn'), d: nextL ? t('plan_learn_d', learnTitle(nextL)) : t('plan_learn_all'),
            go: () => { if (nextL)
                learnGoId(nextL.id);
            else
                show('learn'); } }];
    const due = learnDueList();
    if (due.length) {
        const L = due[0];
        out.push({ id: 'learnrev', done: false, t: t('plan_lrev'),
            d: t('plan_lrev_d', learnTitle(L), learnDueDays(L.id) ?? 0) + (due.length > 1 ? t('plan_lrev_more', due.length - 1) : ''), go: () => learnGoId(L.id) });
    }
    else if (Object.keys(D.learnRev).some((k) => D.learnRev[k].rv === tn))
        out.push({ id: 'learnrev', done: true, t: t('plan_lrev'), d: t('plan_lrev_done'), go: () => show('learn') });
    return out;
}
function srPieceTitle(p: { id?: string; t?: Localised<string>; }) {
    return STRINGS[lang]?.['piece_title_' + p.id] ?? p.t?.[lang] ?? p.t?.en ?? '';
}
// sv, ta: best Survival and Time Attack scores; mn: best Marathon pace in notes per minute.
function rdData(): ReadDrillData {
    if (!data.reading || typeof data.reading !== 'object')
        data.reading = {};
    const r = data.reading;
    r.lv = r.lv || {};
    r.nt = r.nt || {};
    const tot = r.tot;
    r.tot = {
        ...tot,
        n: clampPersistedNumber(tot?.n, 0, Infinity, 0),
        ok: clampPersistedNumber(tot?.ok, 0, Infinity, 0),
        ms: clampPersistedNumber(tot?.ms, 0, Infinity, 0),
        sess: clampPersistedNumber(tot?.sess, 0, Infinity, 0),
    };
    r.prefs = Object.assign({ tab: 'drills', sound: true, hints: false, last: null, custom: null, rhDur: false, rhHands: 1, flow: true, ghost: false, stage: true, instantFeedback: false }, r.prefs || {});
    if (!isReadDrillData(r))
        throw new Error('Étude: reading progress could not be initialised');
    return r;
}
function isReadDrillData(r: Partial<ReadDrillData>): r is ReadDrillData { return !!r.lv && !!r.nt && !!r.tot && !!r.prefs; }
function rdEsc(s: string | number | undefined) { return String(s).replace(/[&<>"]/g, (c) => c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'); }
/* ---- sessions: intro → questions → summary ---- */
function rdLvName(L: ReadDrillLevel) { return L.custom ? t('rdx_custom') : t('rdx_u_' + L.u) + ' · ' + L.n; }
function rdStarCount(value: unknown) { return Math.floor(clampPersistedNumber(value, 0, 3, 0)); }
coaching.register(() => { if (!byId('pr-sum').hidden)
    scorePlayer?.refreshCoach(); });
function coachRefresh() { coaching.refresh(); }
function tl(L: string, k: string, a?: string|number|null, b?: string|number|null) {
    // The table of language L when it is loaded, else the interface language's own (English strings load only for English).
    const own = L === 'en' || L === 'ro' ? STRINGS[L] : undefined, base = STRINGS[lang] || STRINGS.en; let v = (own && own[k] != null) ? own[k] : base ? base[k] : undefined; if (v == null)
    return k; if (a != null)
    v = v.replace('%s', () => String(a)).replace('%a', () => String(a)); if (b != null)
    v = v.replace('%b', () => String(b)); return v; }
/* keys, spelling */
const KEY_MAJ_FIFTHS = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: -5, 8: -4, 3: -3, 10: -2, 5: -1 }, LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const LETTERS = { letter: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], solfege: ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'], german: ['C', 'D', 'E', 'F', 'G', 'A', 'H'] };
// B-flat is B in German; B-natural and other alterations use H.
function spelledName(sys: theory.NoteSystem, li: number, acc: number, ascii = false) { if (sys === 'german' && li === 6 && acc === -1)
    return 'B'; const symbols = ascii ? ['bb', 'b', '', '#', '##'] : ['𝄫', '♭', '', '♯', '𝄪']; return LETTERS[sys][li] + (symbols[acc + 2] || ''); }
// OSMD draws each pedal mark straight onto the page; a group per mark lets the hover explain "Ped." and "*".
function showNotationReloadPrompt(notationReloadMessage?: (language: InterfaceLanguage) => { message: string; button: string }) {
    if (document.querySelector('.notation-reload')) return;
    const copy = notationReloadMessage ? notationReloadMessage(lang) : { message: 'The score could not load. Reload the page.', button: 'Reload' }, box = (document).createElement('div');
    box.setAttribute('role', 'alert');
    box.className = 'notation-reload';
    box.innerHTML = '<p></p><button type="button"></button>';
    const message = box.querySelector('p');
    const button = box.querySelector('button');
    if (message) message.textContent = copy.message;
    if (button) {
        button.textContent = copy.button;
        button.addEventListener('click', () => location.reload());
    }
    document.body.append(box);
}
const reduceMotionMql = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
const reduceMotion = () => !!reduceMotionMql?.matches;
function savedScoreView(view: unknown, explicit: unknown): notationApi.ScoreLayoutMode | 'fall' | null {
    if (explicit === false) return null;
    // Older releases saved Page even when the default had never been changed.
    if (view === 'page') return explicit === true ? view : null;
    return view === 'fit' || view === 'cont' || view === 'fall' ? view : null;
}
// The page is sized in CSS from these: 100dvh − header (or the Pieces full-window bar) − dock − bottom bar. The Score Player
// adds its toolbar and status bar rows (scorePlayer.layoutVars) in the same frame.
function anLayoutVars() {
    const st = document.documentElement.style, h = (el: HTMLElement|null) => el && !el.hidden ? Math.round(el.getBoundingClientRect().height) : 0, dock = byId('dock');
    const topBarH = scorePlayer?.stageOn() ? h(maybeById('an-fs-top')) : h(document.querySelector('header'));
    st.setProperty('--hdr-h', topBarH + 'px');
    const bnav = h(byId('bottomNav')); // 0 while the bar is not displayed (wide screens, short landscape, the practice stage)
    st.setProperty('--bnav-h', bnav + 'px');
    st.setProperty('--dock-h', ((document.body.classList.contains('kb') ? h(dock) : 0) + bnav) + 'px');
    scorePlayer?.layoutVars();
    notifyDockReflow(); // Explore's staff is sized from the room these leave
    syncMobileStartBars();
}
let layoutRq = 0;
function layoutVarsSoon() { cancelAnimationFrame(layoutRq); layoutRq = requestAnimationFrame(anLayoutVars); }
function syncMobileStartBars() {
    const v = view0(), dockExpanded = dockShown(), inFocus = !!SCORE_FOCUS.owner || STAGE.on;
    const prBar = maybeById('pr-mobile-bar'), prSum = maybeById('pr-mobile-summary'), prBtn = maybeById('pr-mobile-start') as HTMLButtonElement | null;
    const prHome = maybeById('pr-home'), prStartBtn = maybeById('pr-start') as HTMLButtonElement | null;
    if (prBar && prSum && prBtn && prHome) {
        const showPr = v === 'practice' && !!practice && !practice.sesActive() && !dockExpanded && !inFocus && prHome.style.display !== 'none';
        prBar.hidden = !showPr;
        prHome.classList.toggle('has-mobile-bar', showPr);
        if (showPr && practice && maybeById('pr-cat') && maybeById('pr-mode')) {
            const bar = practice.mobileBar();
            prSum.textContent = bar.summary;
            prBtn.textContent = bar.label;
            prBtn.disabled = !!prStartBtn?.disabled;
        }
    }
    const rdBar = maybeById('rd-mobile-bar'), rdSum = maybeById('rd-mobile-summary'), rdBtn = maybeById('rd-mobile-start') as HTMLButtonElement | null;
    const rdPieces = maybeById('rdp-pieces'), rdResult = maybeById('rdn-result'), rdGoBtn = maybeById('rd-go') as HTMLButtonElement | null;
    if (rdBar && rdSum && rdBtn && rdPieces) {
        const rdState = read?.mobileBar();
        const showRd = v === 'read' && !rdPieces.hidden && !!rdState?.ready && (!rdResult || rdResult.hidden) && !dockExpanded && !inFocus;
        rdBar.hidden = !showRd;
        rdPieces.classList.toggle('has-mobile-bar', showRd);
        if (showRd && rdState) {
            rdSum.textContent = rdState.summary;
            rdBtn.disabled = !!rdGoBtn?.disabled;
        }
    }
    const mobileBarVisible = v === 'practice' && !!prBar && !prBar.hidden;
    document.body.classList.toggle('has-mobile-start-bar', mobileBarVisible);
}
function anNum(x: number, d: number) { return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString(LOCALE_TAGS[lang] || lang); }
/* ---------- PROGRESS and TODAY: lazy features in src/features/progress/ and src/features/today/ ---------- */
function statHTML(v: string|number, l: string) { return '<div class="s"><b class="num">' + rdEsc(v) + '</b><span>' + rdEsc(l) + '</span></div>'; }
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
function syncIsLang(v: unknown): v is RuntimeLanguage { return isRuntimeLanguage(v); }
const syncParseJson = storage.parseJson;
type SyncPrefEntry = readonly [get: () => string, set: (v: unknown) => void | Promise<void>, later?: 1];
const SYNC_PREFS: Record<SyncPrefName, SyncPrefEntry> = { theme: [() => theme, (v: unknown) => { if (syncOneOf(SYNC_THEMES, v)) {
            theme = v;
            applyTheme();
        } }],
    lang: [() => lang, (v: unknown) => { if (syncIsLang(v)) {
            return setLang(v, true).catch(() => localeLoadError(() => setLang(v)));
        } }, 1],
    notation: [() => notation, (v: unknown) => { if (syncOneOf(SYNC_NOTATIONS, v)) {
            notation = v;
            applyNotation();
            refreshToday();
        } }, 1],
    labels: [() => labelMode, (v: unknown) => { if (syncOneOf(SYNC_LABELS, v)) {
            labelMode = v;
            buildKeyboard();
            repaintHeld();
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
function syncCurrent(raw: string) { const p = parsePttV3(raw); SYNC.raw = raw; SYNC.id = syncId(p, raw); syncRemember(SYNC.id, p); } // its own copy: data may share objects with the record it was read from
function syncPair(a: string, b: string) { return 'merge:' + [a, b].sort().join('+'); }
function syncInitial() {
    const p = { v: 3, gen: SYNC.gen, data: syncCloneData(data) };
    SYNC.id = 'init';
    SYNC.raw = null;
    syncRemember(SYNC.id, p);
}
function syncPref(f: SyncPrefName, v: string) { const p = SYNC.pend[f]; return p && p.from === v ? p.v : v; } // another tab's choice that is still waiting here is what gets saved
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
    const lid = SYNC.id, sibling = !swap && parent && lp && lp.syncParent === parent && lid !== syncId(rp, cur), sameData = !swap && syncSame(data, rp.data) && !sibling;
    if (swap) {
        data = restoreTrainerData(rp.data);
        applyTopLevelPrefs(rp);
        SYNC.gen = gen;
        SYNC.known.clear();
        SYNC.merge = null;
    }
    else if (!sameData) {
        syncData(!syncHasBase(bp) ? bp : bp.data, data, rp.data);
        data.settings = restoreSettings(data.settings);
        data.srs = storage.restoreSrs(data.srs);
        if (isRecord(data.reading?.book)) read?.forgetBook(data.reading.book);
        if (!isRecord(data.sheet)) data.sheet = {};
    }
    if (swap || syncHasBase(bp))
        Object.keys(SYNC_PREFS).filter(syncIsPrefName).forEach((f) => {
            const [get, set, later] = SYNC_PREFS[f], v = rp[f];
            if (v === undefined || (!swap && syncHasBase(bp) && (v === bp[f] || syncPref(f, get()) !== bp[f])))
                return; // the other tab did not change it, or this tab changed it too
            if (v === get()) {
                // A newer choice can equal the committed language while an older import is still running.
                if (f === 'lang' && SYNC.pend.lang?.running) localeRequest++;
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
    const needsWrite = !swap && (!syncSame(data, rp.data) || prefNeedsWrite);
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
function syncBusy() { return anyLoadedFeatureBusy(); }
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
    reflectSettingsUI();
    calUi();
    renderDataSafety();
    if (view0() === 'today' && !practice?.sesActive())
        refreshToday();
    else if (view0() === 'progress')
        renderProgress();
    for (const ctrl of Object.values(loadedFeatures)) ctrl?.onStorageSync?.();
}
let reloadingForRestore = false;
function saveAll() { if (reloadingForRestore) return; const got = syncPull(); syncWrite(); if (got === 'merge' || got === 'merge-save' || got === 'swap')
    syncAfter(got); }
function scorePrefsPayload() {
    const sp = scorePrefsNow();
    return { scoreLook: sp.scoreLook, scoreHl: sp.scoreHl, scoreView: sp.scoreFallMode === 'fall' ? 'fall' : sp.scoreLayout, scoreViewExplicit: sp.scoreLayoutExplicit, anSide: { open: sp.anSide.open, tab: sp.anSide.tab, w: sp.anSide.w } } as const;
}
function syncPayload(): storage.PttV3Payload { return { v: 3, schema: storage.PTT_SCHEMA, gen: SYNC.gen, syncId: syncGen(), syncParent: SYNC.id, ...SYNC.merge && SYNC.merge.into === SYNC.id ? { syncMerge: SYNC.merge.id } : {}, audioEngine: 'recorded-piano-v2', lang: syncPref('lang', lang), theme, data, notation: syncPref('notation', notation), tone: audioEngine.tone, masterVol: audioEngine.masterVolume, muted: audioEngine.muted, localSynth: audioEngine.localSynth, reverb: audioEngine.reverbWet, labels: syncPref('labels', labelMode), bpm: metro.bpm, drone: !!data.settings.drone, device: midiController.state.savedDevice, deviceName: midiController.state.savedDeviceName, ...scorePrefsPayload(), kbDock: DOCK.pref, wake: WAKE.want, ble: BLE.saved }; }
function syncWrite(replacement?: { gen: string; data: StoredTrainerData }) {
    if (reloadingForRestore || STORE.blocked) {
        if (replacement)
            throw new Error('Progress is protected');
        return;
    }
    const payload = syncPayload();
    let raw: string;
    try {
        raw = writePttV3(localStorage, replacement ? { ...payload, ...replacement } : payload);
    }
    catch (e) {
        if (replacement)
            throw e; // Let the caller roll back the ledger when the main save fails.
        console.warn('save failed', e);
        storeFailed();
        return;
    }
    if (replacement) {
        data = replacement.data;
        SYNC.gen = replacement.gen;
        SYNC.known.clear();
    }
    SYNC.merge = null;
    syncCurrent(raw);
    if (!replacement)
        storeSaved();
}
let _saveT: ReturnType<typeof setTimeout> | null = null;
function flushSaveSoon() {
    if (_saveT === null) return;
    clearTimeout(_saveT);
    _saveT = null;
    saveAll();
}
function saveSoon() {
    clearTimeout(_saveT ?? undefined);
    _saveT = setTimeout(flushSaveSoon, 400);
} // for sliders — avoid a localStorage write per pixel
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
    const payload = current?.payload ?? syncPayload();
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
    const reading = data.reading, log = data.practiceLog;
    const outcomes = [data.srs, data.learnDone, data.singCleared, data.sheet, reading?.lv, reading?.nt, reading?.book?.pieces];
    if (data.totalReviews > 0 || data.placed || (data.lastDrill?.n ?? 0) > 0 || (log?.techRuns ?? 0) > 0 || (log?.melRuns ?? 0) > 0 || reading?.prefs?.warmDone ||
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
    const day = todayN();
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
        const write = safety.saveSnapshot({ day: todayN(), reason, raw });
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
            saveAll();
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
/** Import and restore share this path: a copy of the current progress first, then the backup, then a reload. */
async function storeApplyBackup(p: storage.PttV3Payload, reason: safety.SnapshotReason): Promise<void> {
    try {
        if (storeBackupBlocked()) {
            await appAlert(t('store_too_new'));
            return;
        }
        if (STORE.blocked === 'upgrade') {
            await appAlert(t('store_upgrade_stuck'));
            return;
        }
        if (!await storeSnapshot(reason, backupJson()) && !await appConfirm(t('store_copy_failed')))
            return;
        const saved = await storage.restoreProgressBackup(localStorage, p, () => {
            // The save may have changed while taking the snapshot or waiting for the ledger lock.
            if (storeBackupBlocked() || STORE.blocked === 'upgrade')
                throw new Error('Progress is protected');
            return syncNextGen();
        }, { replace: reason === 'before-restore' });
        if (!saved.ok) {
            await appAlert(t(saved.reason === 'unsupported' ? 'import_too_new' : saved.reason === 'conflict' ? 'import_conflict' : saved.reason === 'quota' ? 'import_quota' : 'import_storage'));
            return;
        }
        reloadingForRestore = true;
        clearTimeout(_saveT ?? undefined);
        _saveT = null;
        location.reload();
    }
    catch (_) {
        reloadingForRestore = false;
        await appAlert(t(STORE.blocked === 'too-new' ? 'store_too_new' : STORE.blocked === 'upgrade' ? 'store_upgrade_stuck' : 'import_storage'));
    }
}
async function storeRestore(id: number | undefined) {
    if (!id || progressRestorePending || reloadingForRestore)
        return;
    progressRestorePending = true;
    try {
        if (storeBackupBlocked()) {
            await appAlert(t('store_too_new'));
            return;
        }
        if (STORE.blocked === 'upgrade') {
            await appAlert(t('store_upgrade_stuck'));
            return;
        }
        const snap = await safety.readSnapshot(id), p = snap ? parsePttV3(snap.raw) : null;
        if (!snap || !p) {
            await appAlert(t('import_bad'));
            return;
        }
        if ((storage.pttSchema(p) > storage.PTT_SCHEMA || storage.hasFutureSightLedger(p))) {
            await appAlert(t('import_too_new'));
            return;
        }
        if (!storage.isImportableBackup(p)) {
            await appAlert(t('import_bad'));
            return;
        }
        if (await appConfirm(t('snap_confirm', storeWhen(snap.id))))
            await storeApplyBackup(p, 'before-restore');
    }
    catch (_) {
        await appAlert(t('import_storage'));
    }
    finally {
        progressRestorePending = false;
    }
}
async function storeReset() {
    const button = buttonById('resetBtn');
    if (button.disabled || progressRestorePending || reloadingForRestore)
        return;
    if (!await appConfirm(t('reset_confirm')))
        return;
    if (button.disabled || progressRestorePending || reloadingForRestore)
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
            return await storeSnapshot('before-reset', backupJson()) || await appConfirm(t('store_reset_copy_failed'));
        }, () => {
            checkWritable();
            syncPull();
            const reset = { ...freshData(), settings: data.settings, latency: calRecord().latency };
            syncWrite({ gen: syncNextGen(), data: reset });
        });
        if (!result)
            return;
        if (!result.ok) {
            await appAlert(t(result.reason === 'unsupported' ? 'store_too_new' : 'store_reset_failed'));
            return;
        }
        storeSaved();
        for (const ctrl of Object.values(loadedFeatures)) ctrl?.onProgressReset?.();
        renderProgress();
        refreshToday();
    }
    catch (_) {
        await appAlert(t(STORE.blocked === 'too-new' ? 'store_too_new' : STORE.blocked === 'quarantine' ? 'store_stuck' : STORE.blocked === 'upgrade' ? 'store_upgrade_stuck' : 'store_reset_failed'));
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
function storeWhen(ms: number) { return new Date(ms).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' }); }
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
function storeI18nReady() { return !!(STRINGS[lang] || STRINGS.en); }
function renderDataSafety() {
    if (!storeI18nReady())
        return;
    const st = document.getElementById('set-storage-status'), age = document.getElementById('set-backup-age'), sel = document.getElementById('set-snaps'), btn = document.getElementById('set-snap-restore');
    if (!st || !age || !(sel instanceof HTMLSelectElement) || !(btn instanceof HTMLButtonElement))
        return;
    const key = STORE.persist === 'persisted' ? 'set_storage_on' : STORE.persist === 'best-effort' ? 'set_storage_off' : 'set_storage_na';
    st.textContent = t(key) + (STORE.usage ? ' ' + t('set_storage_used', storeSize(STORE.usage.usage)) : '');
    const last = storeLastExport();
    age.textContent = last ? t('set_backup_last', storeWhen(last)) : t('set_backup_never');
    age.classList.toggle('warn', storeHasProgress() && (!last || Date.now() - last > STORE_EXPORT_DUE_MS));
    const list = STORE.snaps.filter(x => x.reason !== 'unreadable'), selected = sel.dataset.selected;
    sel.replaceChildren(...list.map((x) => { const o = document.createElement('option'); o.value = String(x.id); o.textContent = t('snap_item', storeWhen(x.id), t('snap_' + x.reason.replace('-', '_'))); return o; }));
    if (!list.length) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = t('set_snap_none');
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
    txt.textContent = t(key);
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
    const standalone = pwaStandalone();
    const u = STORE.usage, snaps = STORE.snaps.filter(x => x.reason !== 'unreadable'), last = storeLastExport();
    const ctx = audioEngine.context;
    return [
        'App version: ' + version,
        'Service worker: ' + (PWA.sw || 'none') + (PWA.err ? ' (' + PWA.err + ')' : ''),
        'Display: ' + (standalone ? 'installed app' : 'browser tab'),
        'Storage: ' + STORE.persist + (u ? ', ' + storeSize(u.usage) + ' of ' + storeSize(u.quota) : ''),
        'Saving: ' + (STORE.blocked ? 'stopped (' + STORE.blocked + ')' : STORE.failed ? 'failing' : 'ok') + (STORE.unreadable ? ', unreadable record kept' : ''),
        'Automatic backups: ' + snaps.length + (snaps[0] ? ', newest ' + new Date(snaps[0].id).toISOString() : ''),
        'Last export: ' + (last ? new Date(last).toISOString() : 'never'),
        midiController.describeInputs(),
        'Bluetooth MIDI: ' + (bleLive() ? bleName() : 'not connected'),
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
    audioEngine.tone = raw.audioEngine === 'recorded-piano-v2' && raw.tone && syncOneOf(SYNC_TONES, raw.tone) ? raw.tone : 'piano';
    audioEngine.masterVolume = clampPersistedNumber(raw.masterVol, 0, 1, audioEngine.masterVolume);
    if (typeof raw.muted === 'boolean')
        audioEngine.muted = raw.muted;
    if (typeof raw.localSynth === 'boolean')
        audioEngine.localSynth = raw.localSynth;
    audioEngine.reverbWet = clampPersistedNumber(raw.reverb, 0, 0.5, audioEngine.reverbWet);
    audioEngine.applyOutputMix();
    metro.bpm = Math.round(clampPersistedNumber(raw.bpm, 50, 180, metro.bpm));
    midiController.restoreSavedDevice(raw.device, raw.deviceName);
    const prevScore = scorePrefsNow();
    const scoreView = savedScoreView(raw.scoreView, raw.scoreViewExplicit);
    const nextSide = { ...prevScore.anSide };
    if (typeof raw.kbDock === 'boolean')
        DOCK.pref = raw.kbDock;
    else if (typeof raw.anKb === 'boolean')
        DOCK.pref = raw.anKb; // the Score & analysis choice becomes the choice for every view
    if (typeof raw.wake === 'boolean')
        WAKE.want = raw.wake;
    const bl = raw.ble;
    if (bl === null) BLE.saved = null;
    if (isRecord(bl) && typeof bl.id === 'string' && bl.id)
        BLE.saved = { id: bl.id, name: typeof bl.name === 'string' ? bl.name : '', auto: bl.auto !== false };
    const sd = raw.anSide;
    if (isRecord(sd)) {
        if (typeof sd.open === 'boolean')
            nextSide.open = sd.open;
        if (typeof sd.tab === 'string' && SCORE_SIDE_TABS.includes(sd.tab))
            nextSide.tab = sd.tab;
        if (typeof sd.w === 'number' && Number.isFinite(sd.w))
            nextSide.w = Math.max(280, Math.min(560, Math.round(sd.w)));
    }
    setScorePrefs({
        scoreLook: raw.scoreLook === 'paper' || raw.scoreLook === 'night' ? raw.scoreLook : prevScore.scoreLook,
        scoreHl: typeof raw.scoreHl === 'boolean' ? raw.scoreHl : prevScore.scoreHl,
        scoreLayout: scoreView && scoreView !== 'fall' ? scoreView : defaultScoreLayoutForViewport(window.innerWidth),
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
            data = restoreTrainerData(raw.data);
            if (raw.lang && syncIsLang(raw.lang))
                lang = raw.lang;
            if (raw.theme && syncOneOf(SYNC_THEMES, raw.theme))
                theme = raw.theme;
            if (syncOneOf(SYNC_NOTATIONS, raw.notation))
                notation = raw.notation;
            if (syncOneOf(SYNC_LABELS, raw.labels))
                labelMode = raw.labels;
            applyTopLevelPrefs(raw);
            return;
        }
        // migrate from V2 settings (notation/tone) if present
        const v2s = legacySettings(localStorage);
        if (v2s) {
            const noteSys = String(v2s.noteSys);
            if (syncOneOf(SYNC_NOTATIONS, noteSys))
                notation = noteSys;
            audioEngine.tone = 'piano';
            audioEngine.masterVolume = clampPersistedNumber(v2s.vol, 0, 1, audioEngine.masterVolume);
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
                data.srs[id] = { box, ease: 2.3, reps: seen, lapses: misses, due: todayN() + (box >= 3 ? 4 : 1), last: todayN() };
            } }); });
        }
        if (navigator.language && /^ro/i.test(navigator.language)) {
            lang = 'ro'; // first-time Romanian browser → Romanian UI + Do-Re-Mi default
            notation = 'solfege';
        }
        syncInitial();
    }
    catch (e) {
        console.warn('load failed', e);
    }
}
/* ============================================================================
   WIRING + BOOT
   ============================================================================ */
function labelSettingsControl(controlId: string, labelKey: string|undefined, helpKey: string|undefined) {
    const control = maybeById(controlId), label = (document).querySelector('[data-i18n="' + labelKey + '"]');
    if (!control || !label)
        return;
    label.id = controlId + '-label';
    control.setAttribute('aria-labelledby', label.id);
    if (helpKey) {
        const help = (document).querySelector('[data-i18n="' + helpKey + '"]');
        if (help) {
            help.id = controlId + '-help';
            control.setAttribute('aria-describedby', help.id);
        }
    }
}
type SettingsControlLabel = [controlId: string, labelKey: string, helpKey?: string];
function labelSettingsControls() {
    const controls: SettingsControlLabel[] = [['deviceSelect', 'set_input'], ['toneSel', 'set_tone'], ['set-goal', 'set_sessionlen'], ['set-new', 'set_newperday', 'set_newperday_s'],
        ['set-wake', 'set_wake'], ['set-synth', 'set_localsynth'], ['set-drone', 'set_drone'], ['set-metronome', 'set_metronome'], ['set-inv', 'set_allowinv'], ['set-weak-inject', 'set_weak_inject'],
        ['set-any-octave', 'set_any_octave', 'set_any_octave_s']];
    controls.forEach(([controlId, labelKey, helpKey]) => labelSettingsControl(controlId, labelKey, helpKey));
}
function reflectSettingsUI() {
    inputById('volume').value = String(Math.round(audioEngine.masterVolume * 100));
    selectById('toneSel').value = audioEngine.tone;
    inputById('bpm').value = String(metro.bpm);
    byId('bpmLbl').textContent = String(metro.bpm);
    inputById('reverb').value = String(Math.round(audioEngine.reverbWet / 0.5 * 100));
    queryAllHtml(document, '#set-labels button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === labelMode ? 'true' : 'false'));
    const labelCBtn = document.querySelector('#set-labels button[data-v="c"]');
    if (labelCBtn) labelCBtn.textContent = notation === 'solfege' ? 'Do' : 'C';
    inputById('set-synth').checked = audioEngine.localSynth;
    inputById('set-drone').checked = !!data.settings.drone;
    inputById('set-inv').checked = !!data.settings.allowInv;
    const prChordInv = maybeById('pr-chord-inv');
    if (prChordInv instanceof HTMLInputElement) prChordInv.checked = !!data.settings.allowInv;
    inputById('set-metronome').checked = !!data.settings.metronome;
    inputById('set-weak-inject').checked = !!data.settings.weakSpotInjection;
    inputById('set-any-octave').checked = !!data.settings.anyOctave;
    read?.reflectSettings();
    selectById('set-goal').value = String(data.settings.goal);
    selectById('set-new').value = String(data.settings.newPerDay);
    queryAllHtml(document, '#set-notation button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === notation ? 'true' : 'false'));
    queryAllHtml(document, '#set-lang button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === lang ? 'true' : 'false'));
    practice?.reflectSettings();
}
function setWeakSpotInjection(on: boolean) {
    data.settings.weakSpotInjection = on;
    const settingsToggle = maybeById('set-weak-inject');
    if (settingsToggle instanceof HTMLInputElement)
        settingsToggle.checked = on;
    const readingToggle = maybeById('rdx-weak-inject');
    if (readingToggle instanceof HTMLInputElement)
        readingToggle.checked = on;
    saveAll();
}
let appDialogClose: ((accepted: boolean, fromPop?: boolean) => void) | null = null;
let appDialogWired = false;
let appDialogSeq = 0;
let appDialogQueue: Promise<unknown> = Promise.resolve();
function ensureAppDialogWired() {
    if (appDialogWired) return;
    const dialog = maybeById('appDialog'), ok = maybeById('appDialogOk'), cancel = maybeById('appDialogCancel'), scrim = maybeById('appDialogScrim');
    if (!dialog || !ok || !cancel || !scrim) return;
    appDialogWired = true;
    ok.addEventListener('click', () => appDialogClose?.(true));
    cancel.addEventListener('click', () => appDialogClose?.(false));
    scrim.addEventListener('click', () => appDialogClose?.(false));
    dialog.addEventListener('keydown', trapFocus);
}
function appDialogOpen(kind: 'alert' | 'confirm', message: string): Promise<boolean> {
    const task = appDialogQueue.then(() => new Promise<boolean>((resolve) => {
        ensureAppDialogWired();
        const dialog = maybeById('appDialog'), scrim = maybeById('appDialogScrim'), title = maybeById('appDialogTitle'), msg = maybeById('appDialogMsg'), ok = maybeById('appDialogOk'), cancel = maybeById('appDialogCancel');
        if (!dialog || !scrim || !title || !msg || !ok || !cancel) {
            if (kind === 'alert') { window.alert(message); resolve(true); }
            else resolve(window.confirm(message));
            return;
        }
        const priorFocus = document.activeElement;
        read?.releaseRecorder('focus');
        releaseLiveInput();
        pushModalState('dialog');
        dialog.dataset.kind = kind;
        dialog.dataset.seq = String(++appDialogSeq);
        title.textContent = kind === 'alert' ? localize('dialog_notice_title', 'Notice') : localize('dialog_confirm_title', 'Please confirm');
        msg.textContent = message;
        ok.textContent = kind === 'alert' ? localize('dialog_ok', 'OK') : localize('dialog_confirm', 'Continue');
        cancel.textContent = localize('dialog_cancel', 'Cancel');
        cancel.hidden = kind === 'alert';
        dialog.classList.add('on');
        dialog.setAttribute('aria-hidden', 'false');
        scrim.classList.add('on');
        syncScrim();
        const firstFocus = kind === 'confirm' ? cancel : ok;
        firstFocus.focus({ preventScroll: true });
        requestAnimationFrame(() => { if (dialog.classList.contains('on')) firstFocus.focus({ preventScroll: true }); });
        appDialogClose = (accepted: boolean, fromPop = false) => {
            appDialogClose = null;
            const hadFocus = dialog.contains(document.activeElement);
            dialog.classList.remove('on');
            dialog.setAttribute('aria-hidden', 'true');
            scrim.classList.remove('on');
            if (!fromPop) popModalState('dialog');
            syncScrim();
            if (hadFocus && priorFocus && priorFocus.isConnected && (priorFocus instanceof HTMLElement || priorFocus instanceof SVGElement) && priorFocus.getClientRects().length > 0 && !priorFocus.closest('[inert]'))
                priorFocus.focus({ preventScroll: true });
            resolve(kind === 'alert' ? true : accepted);
        };
    }));
    appDialogQueue = task.catch(() => {});
    return task;
}
function appAlert(message: string): Promise<void> { return appDialogOpen('alert', message).then(() => {}); }
function appConfirm(message: string): Promise<boolean> { return appDialogOpen('confirm', message); }
function overlaysOpen() { return byId('drawer').classList.contains('on') || byId('helpBox').classList.contains('on') || !!maybeById('appDialog')?.classList.contains('on'); }
function syncScrim() {
    const drawer = byId('drawer'), help = byId('helpBox'), dialog = maybeById('appDialog');
    const dialogOn = !!dialog?.classList.contains('on'), helpOn = help.classList.contains('on'), drawerOn = drawer.classList.contains('on');
    const open = dialogOn || helpOn || drawerOn;
    byId('scrim').classList.toggle('on', drawerOn || helpOn);
    queryAllHtml(document, 'body > #skipLink, body > header, body > main, body > #dock, body > #bottomNav, body > #locale-load-error, body > details.osmd-lic, body > footer').forEach((el) => { el.inert = open; });
    if (dialog) dialog.inert = !dialogOn;
    help.inert = !helpOn || dialogOn;
    drawer.inert = !drawerOn || helpOn || dialogOn;
}
// Closed overlays are only moved/faded out by CSS, so `inert` keeps their controls out of the Tab order;
// opening moves focus inside, closing returns it to whatever opened the overlay.
const overlayReturn = new Map<HTMLElement, Element | null>();
function setOverlay(el: HTMLElement, o: boolean, firstId: string) {
    const was = el.classList.contains('on'), hadFocus = el.contains(document.activeElement);
    if (o !== was) {
        if (o) read?.releaseRecorder('focus');
        releaseLiveInput();
    }
    el.classList.toggle('on', o);
    el.setAttribute('aria-hidden', o ? 'false' : 'true');
    syncScrim();
    if (o && !was) {
        overlayReturn.set(el, document.activeElement);
        byId(firstId).focus();
        requestAnimationFrame(() => { if (el.classList.contains('on') && !el.inert)
            byId(firstId).focus(); });
    }
    else if (!o && was) {
        const r = overlayReturn.get(el);
        overlayReturn.delete(el);
        if (hadFocus && r && r.isConnected && (r instanceof HTMLElement || r instanceof SVGElement) && r.getClientRects().length > 0 && !r.closest('[inert]'))
            r.focus();
    }
}
function trapFocus(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !(e.currentTarget instanceof Element))
        return;
    const f = [...e.currentTarget.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x): x is HTMLElement | SVGElement => (x instanceof HTMLElement || x instanceof SVGElement) && !('disabled' in x && x.disabled) && x.getClientRects().length > 0);
    if (!f.length)
        return;
    const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
    }
    else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
    }
}
function openDrawer(o: boolean, fromPop = false) {
    if (o) {
        if (!fromPop)
            pushModalState('drawer');
    }
    else {
        if (CAL.on) {
            calStop();
            calSay('');
        }
        if (!fromPop) popModalState('drawer');
    }
    setOverlay(byId('drawer'), o, 'drawerClose');
}
function openHelp(o: boolean, fromPop = false) {
    if (o) {
        kbdLayoutLabels();
        if (!fromPop)
            pushModalState('help');
    }
    else {
        if (!fromPop) popModalState('help');
    }
    setOverlay(byId('helpBox'), o, 'helpClose');
}
function applyNotation() {
    const sr = selectById('song-root').value, pk = selectById('pr-key').value;
    fillRoots(byId('song-root'), false);
    fillRoots(byId('pr-key'), true);
    selectById('song-root').value = String(sr || 0);
    selectById('pr-key').value = pk || 'all';
    practice?.renderSetup();
    localizeLoadedFeatures();
    buildKeyboard();
    repaintHeld();
    if (view0() === 'practice')
        practice?.updateAccompChain();
    read?.onNotation();
    scorePlayer?.relocalize();
    practice?.refreshSessionCopy();
    const labelCBtn = document.querySelector('#set-labels button[data-v="c"]');
    if (labelCBtn) labelCBtn.textContent = notation === 'solfege' ? 'Do' : 'C';
    read?.onLocale();
    coachRefresh();
}
/* ---------- ACCOMPANIMENT UI moved to src/features/practice/accompaniment.ts ---------- */
/** The text field, slider or select an input/change event fired on. */
function wiringField(e: Event): HTMLInputElement | HTMLSelectElement {
    const el = e.target;
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement)
        return el;
    throw new Error('Étude: expected an <input> or <select> event target');
}
/** The checkbox or file `<input>` a change event fired on. */
function wiringInput(e: Event): HTMLInputElement {
    const el = e.target;
    if (el instanceof HTMLInputElement)
        return el;
    throw new Error('Étude: expected an <input> event target');
}
/** The buttons of the segmented control a click was delegated to. */
function wiringSegment(e: Event): HTMLElement[] {
    return e.currentTarget instanceof Element ? [...e.currentTarget.children].filter((x): x is HTMLElement => x instanceof HTMLElement) : [];
}
function wiringDisabled(b: HTMLElement): boolean { return b instanceof HTMLButtonElement && b.disabled; }
function initControls() {
    labelSettingsControls();
    initLatencyCalibration(); // Settings → MIDI keyboard → Timing
    byId('skipLink').addEventListener('click', (e) => { e.preventDefault(); byId('main').focus({ preventScroll: true }); });
    // nav
    byId('nav').addEventListener('click', (e) => { const b = eventClosest(e, 'button'); if (b)
        show(b.dataset.view); });
    byId('modeNav').addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-view]'); if (b)
        show(b.dataset.view); });
    byId('bottomNav').addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-view]'); if (b)
        show(b.dataset.view); });
    document.querySelector('.brand')?.addEventListener('click', (e) => { e.preventDefault(); show('today'); });
    // midi chip + settings
    byId('midiChip').addEventListener('click', connectMidi);
    maybeById('bleChip')?.addEventListener('click', bleClick);
    byId('audioLockBtn').addEventListener('click', audioUnlock);
    byId('syncNoteBtn').addEventListener('click', () => syncNote(false));
    byId('set-connect').addEventListener('click', connectMidi);
    byId('deviceSelect').addEventListener('change', (e) => attachInput(wiringField(e).value));
    byId('set-ble').addEventListener('click', bleClick);
    byId('set-ble-re').addEventListener('click', bleReconnect);
    // installed app & screen
    byId('set-wake').addEventListener('change', (e) => wakeSet(wiringInput(e).checked));
    byId('set-full').addEventListener('click', fsToggle);
    queryAllHtml(document, '.stage-fs:not(.score-expand)').forEach((b) => b.addEventListener('click', fsToggle));
    for (const id of ['rd-fs', 'rd-top-fs']) byId(id).addEventListener('click', () => scoreFocusToggle('read', byId('rd-fs')));
    byId('rd-focus-disp-btn').addEventListener('click', () => rdFocusDispSet(Boolean(byId('rd-focus-tools').hidden)));
    byId('rd-focus-out').addEventListener('click', () => readScoreZoom(SCORE_FOCUS.zoom - .1));
    byId('rd-focus-in').addEventListener('click', () => readScoreZoom(SCORE_FOCUS.zoom + .1));
    byId('rd-focus-fit').addEventListener('click', () => { readScoreZoom(1); read?.fit(); });
    byId('rd-focus-kb').addEventListener('click', () => { STAGE.kb = !dockOpen(); dockSync(); scoreFocusUi(); });
    // The Read focus display menu closes on a press anywhere outside it.
    document.addEventListener('pointerdown', (e) => {
        const el = eventElement(e);
        const rdTools = maybeById('rd-focus-tools');
        if (el && rdTools && !rdTools.hidden && !el.closest('#rd-focus-tools,#rd-focus-disp-btn'))
            rdFocusDispSet(false);
    });
    scoreFocusUi();
    byId('set-install').addEventListener('click', pwaInstall);
    byId('set-pwa-retry').addEventListener('click', () => { void pwaRegister(); });
    document.addEventListener('fullscreenchange', scoreFocusFullscreenChanged);
    window.addEventListener('resize', () => read?.stageResize());
    byId('settingsBtn').addEventListener('click', () => openDrawer(true));
    byId('scrim').addEventListener('click', () => { openDrawer(false); openHelp(false); });
    byId('drawerClose').addEventListener('click', () => openDrawer(false));
    byId('helpBtn').addEventListener('click', () => openHelp(true));
    byId('helpClose').addEventListener('click', () => openHelp(false));
    byId('drawer').addEventListener('keydown', trapFocus);
    byId('helpBox').addEventListener('keydown', trapFocus);
    // theme
    byId('set-theme').addEventListener('click', (e) => { const b = eventClosest(e, 'button'), v = b?.dataset.v; if (!b || !syncOneOf(SYNC_THEMES, v))
        return; theme = v; applyTheme(); saveAll(); });
    // mobile menu
    byId('menuBtn').addEventListener('click', () => {
        const mm = byId('mobileMenu');
        if (mm.hidden) {
            openMobileMenu();
        }
        else
            closeMobileMenu(true);
    });
    document.addEventListener('click', (e) => { const mm = byId('mobileMenu'), el = eventElement(e); if (mm && !mm.hidden && el && !el.closest('#mobileMenu') && !el.closest('#menuBtn'))
        closeMobileMenu(); });
    // Refit when the bar's width or the MIDI chip's label changes, or a web font lands; fitHeader never resizes either.
    const headerFit = new ResizeObserver(fitHeader), hdrBar = byId('nav').parentElement;
    if (hdrBar)
        headerFit.observe(hdrBar);
    headerFit.observe(byId('midiChip'));
    const bleChipEl = maybeById('bleChip');
    if (bleChipEl) headerFit.observe(bleChipEl);
    const bnavEl = maybeById('bottomNav');
    if (bnavEl && typeof ResizeObserver === 'function')
        new ResizeObserver(anLayoutVars).observe(bnavEl);
    document.fonts.addEventListener('loadingdone', fitHeader);
    // backup export / import
    byId('exportBtn').addEventListener('click', () => {
        saveAll();
        const raw = backupJson();
        const d = new Date(), p2 = (n: number) => String(n).padStart(2, '0');
        downloadBlob('etude-backup-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.json', new Blob([raw], { type: 'application/json' }));
        storeExported();
    });
    byId('importBtn').addEventListener('click', () => byId('importFile').click());
    byId('importFile').addEventListener('change', async (e) => {
        const input = wiringInput(e), file = input.files?.[0];
        input.value = '';
        if (!file || progressRestorePending || reloadingForRestore) return;
        if (file.size > MAX_PROGRESS_IMPORT_BYTES) {
            await appAlert(t('import_size'));
            return;
        }
        progressRestorePending = true;
        try {
            if (storeBackupBlocked()) {
                await appAlert(t('store_too_new'));
                return;
            }
            const backup = parsePttV3(await file.text());
            if (backup && (storage.pttSchema(backup) > storage.PTT_SCHEMA || storage.hasFutureSightLedger(backup))) {
                await appAlert(t('import_too_new'));
                return;
            }
            if (!storage.isImportableBackup(backup)) {
                await appAlert(t('import_bad'));
                return;
            }
            if (await appConfirm(t('import_confirm')))
                await storeApplyBackup(backup, 'before-import');
        }
        catch (_) { await appAlert(t('import_bad')); }
        finally { progressRestorePending = false; }
    });
    byId('set-diag').addEventListener('toggle', () => { if (byId('set-diag').hasAttribute('open'))
        void storeRefresh(); });
    byId('set-diag-copy').addEventListener('click', () => { void storeDiagnostics().then((text) => { if (!navigator.clipboard)
        throw new Error('no clipboard'); return navigator.clipboard.writeText(text); }).then(() => { const b = byId('set-diag-copy'); b.textContent = t('set_diag_copied'); setTimeout(() => { b.textContent = t('set_diag_copy'); }, 1500); }).catch(() => { }); });
    byId('storeNoteExport').addEventListener('click', () => byId('exportBtn').click());
    byId('storeNoteReload').addEventListener('click', () => location.reload());
    byId('storeNoteOk').addEventListener('click', () => { STORE.unreadable = false; storeNote(); });
    byId('storeNoteRestore').addEventListener('click', () => { void storeRestore(STORE.snaps.find(x => x.reason !== 'unreadable')?.id); });
    selectById('set-snaps').addEventListener('change', (event) => {
        if (event.currentTarget instanceof HTMLSelectElement) event.currentTarget.dataset.selected = event.currentTarget.value;
    });
    byId('set-snap-restore').addEventListener('click', () => { const sel = byId('set-snaps'); if (sel instanceof HTMLSelectElement && Number(sel.value))
        void storeRestore(Number(sel.value)); });
    // session
    byId('tools').addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-view]'); if (b)
        show(b.dataset.view); });
    byId('startBtn').addEventListener('click', () => withPractice((p) => p.startSession(null)));
    byId('placeBtn').addEventListener('click', () => withPractice((p) => p.startPlacement()));
    const goMethod = (e: Event) => { e.preventDefault(); show('method'); };
    byId('whyLink').addEventListener('click', goMethod);
    byId('footMethod').addEventListener('click', goMethod);
    byId('method-start').addEventListener('click', () => { show('today'); withPractice((p) => p.startSession(null)); });
    // practice, session and accompaniment controls are wired on mount in src/features/practice/index.ts
    // read & play, drills and the Read home are wired on mount in src/features/read/index.ts
    // voice / transcribe / sight-singing (wired lazily on mount in src/features/voice/index.ts)
    // explore (wired lazily on mount in src/features/explore/index.ts)
    // Pieces (Score & analysis) wires its own controls on mount in src/features/score-player/index.ts. The header, dock and
    // bottom bar sizes, and the window size, feed the layout variables every view reads.
    // border-box: a safe-area inset only changes padding, which a content-box observer would miss
    const layoutRo = new ResizeObserver(layoutVarsSoon);
    [document.querySelector('header'), byId('dock'), byId('bottomNav')].forEach((el) => { if (el)
        layoutRo.observe(el, { box: 'border-box' }); });
    window.addEventListener('resize', layoutVarsSoon);
    anLayoutVars();
    // songs
    // progress (wired on mount in src/features/progress/index.ts)
    byId('resetBtn').addEventListener('click', () => { void storeReset(); });
    // keyboard dock
    byId('oct-down').addEventListener('click', () => { releaseTypingKeys(); view.low = Math.max(BASE_LOW, view.low - 12); buildKeyboard(); repaintHeld(); });
    byId('oct-up').addEventListener('click', () => { releaseTypingKeys(); view.low = Math.min(BASE_HIGH - view.oct * 12, view.low + 12); buildKeyboard(); repaintHeld(); });
    byId('panicBtn').addEventListener('click', panic);
    byId('dock-kb-toggle').addEventListener('click', () => dockSet(!dockOpen()));
    byId('kb-pan').addEventListener('input', (e) => { byId('dock-keys').scrollLeft = +wiringField(e).value; });
    byId('dock-keys').addEventListener('scroll', () => { inputById('kb-pan').value = String(byId('dock-keys').scrollLeft); });
    // settings: notation/tone/audio/learning
    byId('set-notation').addEventListener('click', (e) => { const b = eventClosest(e, 'button'), v = b?.dataset.v; if (!b || !syncOneOf(SYNC_NOTATIONS, v) || notation === v)
        return; notation = v; (document).querySelectorAll('#set-notation button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); applyNotation(); refreshToday(); saveAll(); });
    byId('set-lang').addEventListener('click', (e) => { const b = eventClosest(e, 'button'); if (b)
        void setLang(b.dataset.v).catch(() => localeLoadError(() => setLang(b.dataset.v))); });
    byId('toneSel').addEventListener('change', (e) => { releaseLiveInput(); stopPreviews(); stopDrone(); const v = wiringField(e).value; if (syncOneOf(SYNC_TONES, v))
        audioEngine.tone = v; ensureAudio(); pianoStatus(); saveAll(); });
    byId('volume').addEventListener('input', (e) => { audioEngine.setMasterVolume(Number(wiringField(e).value) / 100); saveSoon(); }); // there is no mute toggle, so moving the slider must always be heard
    byId('set-synth').addEventListener('change', (e) => { audioEngine.localSynth = wiringInput(e).checked; if (!audioEngine.localSynth) {
        liveVoices.forEach((v) => v.stop());
        liveVoices.clear();
    } saveAll(); });
    byId('reverb').addEventListener('input', (e) => { audioEngine.setReverbWet(Number(wiringField(e).value) / 100 * 0.5); saveSoon(); });
    byId('set-labels').addEventListener('click', (e) => { const b = eventClosest(e, 'button'); if (!b)
        return; labelMode = b.dataset.v ?? labelMode; (document).querySelectorAll('#set-labels button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); buildKeyboard(); repaintHeld(); saveAll(); });
    byId('bpm').addEventListener('input', (e) => { metro.bpm = +wiringField(e).value; byId('bpmLbl').textContent = wiringField(e).value; saveSoon(); });
    for (const id of ['volume', 'reverb', 'bpm']) byId(id).addEventListener('change', flushSaveSoon);
    window.addEventListener('pagehide', flushSaveSoon);
    byId('set-drone').addEventListener('change', (e) => { data.settings.drone = wiringInput(e).checked; saveAll(); });
    byId('set-metronome').addEventListener('change', (e) => { data.settings.metronome = wiringInput(e).checked; saveAll(); });
    byId('set-inv').addEventListener('change', (e) => {
        const checked = wiringInput(e).checked;
        data.settings.allowInv = checked;
        const prChordInv = maybeById('pr-chord-inv');
        if (prChordInv instanceof HTMLInputElement) prChordInv.checked = checked;
        saveAll();
    });
    byId('set-any-octave').addEventListener('change', (e) => {
        const checked = wiringInput(e).checked;
        data.settings.anyOctave = checked;
        read?.setAnyOctave(checked);
        const rdOct = maybeById('rd-any-octave');
        if (rdOct instanceof HTMLInputElement)
            rdOct.checked = checked;
        saveAll();
    });
    byId('set-weak-inject').addEventListener('change', (e) => { setWeakSpotInjection(wiringInput(e).checked); });
    byId('set-goal').addEventListener('change', (e) => { data.settings.goal = +wiringField(e).value; saveAll(); refreshToday(); });
    byId('set-new').addEventListener('change', (e) => { data.settings.newPerDay = +wiringField(e).value; saveAll(); refreshToday(); });
    // global
    // Keep audio unlock listeners active across scroll/touchstart until an interactive gesture actually reaches running state.
    const unlockEvents = ['pointerdown', 'keydown', 'touchend', 'click'] as const;
    const onUnlockGesture = () => {
        const ctx = ensureAudio();
        if (ctx?.state === 'running') {
            unlockEvents.forEach((ev) => window.removeEventListener(ev, onUnlockGesture));
        }
    };
    unlockEvents.forEach((ev) => window.addEventListener(ev, onUnlockGesture));
    // keyup/pointerup never reach an unfocused window, so focus loss only lets go of what the computer keyboard and pointer hold;
    // playback, recording, accompaniment and drills keep running
    window.addEventListener('blur', releaseFocusInput);
    // a hidden tab throttles timers and stops animation frames: timed playback, accompaniment, mic capture and drills stop cleanly (score playback pauses resumably)
    document.addEventListener('visibilitychange', () => { if (document.hidden)
        panic(); });
    // coming back: restart audio the phone suspended in the background. The notice asks for a tap while it stays locked.
    onPageReturn(() => {
        void audioEngine.resumeOnReturn().then((state) => { if (state === 'running') audioLockSync(); else if (state) audioLockCheck(); });
    });
    window.addEventListener('storage', (e) => {
        if (e.storageArea && e.storageArea !== localStorage) return;
        if (e.key === STORE_SNAPSHOTS_CHANGED || e.key === STORE_LAST_EXPORT || e.key === null) void storeRefresh();
        if (e.key !== null && e.key !== KEY) return;
        const got = syncPull();
        if (got === 'old' || got === 'merge-save') syncWrite();
        if (got) syncAfter(got);
    }); // another tab saved
    registerViewEvent('keydown', (e) => { if (e.key === 'Escape') {
        if (appDialogClose) {
            e.preventDefault();
            appDialogClose(false);
            return;
        }
        if (closeMobileMenu(true)) {
            e.preventDefault();
            return;
        }
        if (byId('helpBox').classList.contains('on')) {
            openHelp(false);
            return;
        }
        openDrawer(false);
    } });
    let rz: ReturnType<typeof setTimeout> | null = null;
    let lastPortrait = window.innerHeight >= window.innerWidth;
    function handleScreenChange() {
        clearTimeout(rz ?? undefined);
        rz = setTimeout(() => {
            const portrait = window.innerHeight >= window.innerWidth;
            const flipped = portrait !== lastPortrait;
            lastPortrait = portrait;
            if (!byId('mobileMenu').hidden && getComputedStyle(byId('menuBtn')).display === 'none') {
                const hadFocus = byId('mobileMenu').contains(document.activeElement);
                closeMobileMenu();
                if (hadFocus) {
                    const current = queryHtml(byId('nav'), '[aria-current="page"]');
                    if (current)
                        current.focus({ preventScroll: true });
                }
            }
            const o = view.oct;
            chooseView();
            if (view.oct !== o) {
                buildKeyboard();
                repaintHeld();
            }
            else
                positionBlacks();
            if (dockShown())
                reflowKeys();
            read?.redraw();
            if (view0() === 'analysis') {
                anLayoutVars();
                scorePlayer?.onScreenChange(flipped);
            }
        }, 100);
    }
    window.addEventListener('resize', handleScreenChange);
    if (window.screen && window.screen.orientation) {
        window.screen.orientation.addEventListener('change', handleScreenChange);
    }
    else {
        window.addEventListener('orientationchange', handleScreenChange);
    }
}
/* boot */
document.documentElement.setAttribute('data-app-pending', '');
await loadAll();
await bootLocale();
applyTheme();
fillRoots(byId('song-root'), false);
fillRoots(byId('pr-key'), true);
chooseView();
buildKeyboard();
initPointer();
initControls();
reflectSettingsUI();
applyI18n();
// Opening straight into Pieces loads the Score Player (it localises itself on mount) and its score modules before the first show.
if (viewFromHash(location.hash) === 'analysis') await ensureFeature('analysis').then(() => scorePlayer?.ensureModules()).catch(() => {});
await show(viewFromHash(location.hash), false);
const bootHistoryState: unknown = history.state;
if (isRecord(bootHistoryState) && bootHistoryState.modal)
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
saveAll(); // Persist the one-time migration from legacy synthetic timbres.
autoReconnectMidi();
bleAutoReconnect();
midiChipSync();
pwaInit();
storeInit();
wakeInit();
kbdLayoutLabels();
// Decode embedded recordings ahead of the first note; AudioContext resumes on a gesture.
try {
    ensureAudio(false);
    setTimeout(() => {
        if (typeof document !== 'undefined' && document.hidden)
            return;
        if (pianoBank.status === 'idle')
            void preparePiano();
    }, 300);
}
catch (err) {
    pianoBank.status = 'error';
    pianoStatus();
    console.warn(err);
}
// These internal setters and getters belong to browser tests and development.
declare const __ETUDE_TEST_SURFACE__: boolean;
if (import.meta.env.DEV || __ETUDE_TEST_SURFACE__) {
/* @generated etude test surface */
const __etude: EtudeSurface = {};
const __etudeGetters: Record<string, () => unknown> = {
  "LESSONS": () => LESSONS,
  "scoreLibraryStore": () => scoreLibraryStore,
  "LP": () => LP,
  "_modalAfterBack": () => _modalAfterBack,
  "_modalBackPending": () => _modalBackPending,
  "_noiseBuf": () => _noiseBuf,
  "_routed": () => _routed,
  "_saveT": () => _saveT,
  "_view": () => _view,
  "activeInputId": () => midiController.state.activeInputId,
  "actx": () => audioEngine.context,
  "anDiatonic": () => anDiatonic,
  "anError": () => anError,
  "anFnKey": () => anFnKey,
  "anIntervalName": () => anIntervalName,
  "anLayoutVars": () => anLayoutVars,
  "anNum": () => anNum,
  "anPcWeights": () => anPcWeights,
  "anResolveKey": () => anResolveKey,
  "applyI18n": () => applyI18n,
  "applyNotation": () => applyNotation,
  "applyTheme": () => applyTheme,
  "attachInput": () => attachInput,
  "audioLockCheck": () => audioLockCheck,
  "audioLockSync": () => audioLockSync,
  "audioLockT": () => audioLockT,
  "audioNoteOff": () => audioNoteOff,
  "audioNoteOn": () => audioNoteOn,
  "audioUnlock": () => audioUnlock,
  "autoReconnectMidi": () => autoReconnectMidi,
  "bendSemitones": () => audioEngine.bendSemitones,
  "bindKeyA11y": () => bindKeyA11y,
  "bleAutoReconnect": () => bleAutoReconnect,
  "bleCan": () => bleCan,
  "bleChoose": () => bleChoose,
  "bleClick": () => bleClick,
  "bleData": () => bleData,
  "bleDisconnect": () => bleDisconnect,
  "bleErr": () => bleErr,
  "bleLive": () => bleLive,
  "bleMsg": () => bleMsg,
  "bleName": () => bleName,
  "bleOnGone": () => bleOnGone,
  "bleOnValue": () => bleOnValue,
  "bleOpen": () => bleOpen,
  "bleParse": () => bleParse,
  "bleParserReset": () => bleParserReset,
  "bleReconnect": () => bleReconnect,
  "bleReleaseInput": () => bleReleaseInput,
  "bleRetry": () => bleRetry,
  "bleSet": () => bleSet,
  "bleStale": () => bleStale,
  "bleStatus": () => bleStatus,
  "bleUi": () => bleUi,
  "bleUnhook": () => bleUnhook,
  "boxOf": () => boxOf,
  "buildKeyboard": () => buildKeyboard,
  "catLabel": () => catLabel,
  "chooseView": () => chooseView,
  "chordDegreeMap": () => chordDegreeMap,
  "chordDisp": () => chordDisp,
  "chordFormula": () => chordFormula,
  "chordTargetPcs": () => chordTargetPcs,
  "clampPersistedNumber": () => clampPersistedNumber,
  "clampTypeOctave": () => clampTypeOctave,
  "closeMobileMenu": () => closeMobileMenu,
  "coachHTML": () => coachHTML,
  "coachList": () => coachList,
  "coachRefresh": () => coachRefresh,
  "comp": () => audioEngine.compressor,
  "connectMidi": () => connectMidi,
  "currentStreak": () => currentStreak,
  "data": () => data,
  "dispSym": () => dispSym,
  "dockKeepEnd": () => dockKeepEnd,
  "dockLabels": () => dockLabels,
  "dockOpen": () => dockOpen,
  "dockReveal": () => dockReveal,
  "dockWanted": () => dockWanted,
  "droneVoices": () => droneVoices,
  "dueItems": () => dueItems,
  "ensureAudio": () => ensureAudio,
  "feelDisp": () => feelDisp,
  "fillRoots": () => fillRoots,
  "focusView": () => focusView,
  "foldToView": () => foldToView,
  "freshData": () => freshData,
  "fsCan": () => fsCan,
  "fsToggle": () => fsToggle,
  "fsUi": () => fsUi,
  "handleNoteOff": () => handleNoteOff,
  "handleNoteOn": () => handleNoteOn,
  "heldMidis": () => heldMidis,
  "identifyChord": () => identifyChord,
  "inField": () => inField,
  "initControls": () => initControls,
  "initPointer": () => initPointer,
  "intervalLabel": () => intervalLabel,
  "invName": () => invName,
  "inversionOf": () => inversionOf,
  "isDue": () => isDue,
  "isNew": () => isNew,
  "isSubset": () => isSubset,
  "itemLabel": () => itemLabel,
  "ivName": () => ivName,
  "kbClear": () => kbClear,
  "kbClearAll": () => kbClearAll,
  "kbDegSrc": () => kbDegSrc,
  "kbPress": () => kbPress,
  "kbState": () => kbState,
  "kbdLayoutLabels": () => kbdLayoutLabels,
  "keyAt": () => keyAt,
  "keyFifths": () => keyFifths,
  "keyFromFifths": () => keyFromFifths,
  "labelMode": () => labelMode,
  "labelSettingsControl": () => labelSettingsControl,
  "labelSettingsControls": () => labelSettingsControls,
  "lang": () => lang,
  "learnData": () => learnData,
  "learnDueDays": () => learnDueDays,
  "learnDueList": () => learnDueList,
  "learnGap": () => learnGap,
  "learnGoId": () => learnGoId,
  "learnPlanItems": () => learnPlanItems,
  "learnTitle": () => learnTitle,
  "learnUnitDone": () => learnUnitDone,
  "learnUnitOf": () => learnUnitOf,
  "lfo": () => lfo,
  "lfoGain": () => audioEngine.lfoGain,
  "listInputs": () => listInputs,
  "loadAll": () => loadAll,
  "localSynth": () => audioEngine.localSynth,
  "makeIR": () => makeIR,
  "makePianoVoice": () => makePianoVoice,
  "makeVoice": () => makeVoice,
  "master": () => audioEngine.master,
  "masterFilter": () => audioEngine.masterFilter,
  "masterRamp": () => masterRamp,
  "masterVol": () => audioEngine.masterVolume,
  "masteredCount": () => masteredCount,
  "metroClick": () => metroClick,
  "metroSched": () => metroSched,
  "midiAccess": () => midiController.state.midiAccess,
  "midiChipSync": () => midiChipSync,
  "midiIn": () => midiIn,
  "midiMsg": () => midiController.state.midiMsg,
  "muted": () => audioEngine.muted,
  "newItemsAvail": () => newItemsAvail,
  "newQuotaLeft": () => newQuotaLeft,
  "noiseBuffer": () => noiseBuffer,
  "notation": () => notation,
  "noteName": () => noteName,
  "onInputChange": () => onInputChange,
  "onMidiMessage": () => onMidiMessage,
  "onStateChange": () => onStateChange,
  "openDrawer": () => openDrawer,
  "openHelp": () => openHelp,
  "openMobileMenu": () => openMobileMenu,
  "overlaysOpen": () => overlaysOpen,
  "panic": () => panic,
  "pcName": () => pcName,
  "pedalDown": () => pedalDown,
  "pedalUp": () => pedalUp,
  "physKey": () => physKey,
  "pianoDecode": () => pianoDecode,
  "pianoEnsure": () => pianoEnsure,
  "pianoFail": () => pianoFail,
  "pianoIdleWarm": () => pianoIdleWarm,
  "pianoKeys": () => pianoKeys,
  "pianoNearest": () => pianoNearest,
  "pianoStatus": () => pianoStatus,
  "pickArturia": () => pickArturia,
  "playChordMidis": () => playChordMidis,
  "playInterval": () => playInterval,
  "playIvDir": () => playIvDir,
  "playScaleNotes": () => playScaleNotes,
  "popModalState": () => popModalState,
  "positionBlacks": () => positionBlacks,
  "preparePiano": () => preparePiano,
  "previewNote": () => previewNote,
  "previewVoices": () => audioEngine.previewVoices,
  "progChordTpl": () => progChordTpl,
  "pushModalState": () => pushModalState,
  "pwaInit": () => pwaInit,
  "pwaInstall": () => pwaInstall,
  "pwaStandalone": () => pwaStandalone,
  "pwaUi": () => pwaUi,
  "randItem": () => randItem,
  "rdData": () => rdData,
  "STAGE": () => STAGE,
  "rdEsc": () => rdEsc,
  "rdLvName": () => rdLvName,
  "rdPercClef": () => rdPercClef,
  "rdSpellMidi": () => rdSpellMidi,
  "rdU": () => rdU,
  "reflectSettingsUI": () => reflectSettingsUI,
  "reflowKeys": () => reflowKeys,
  "refreshDeviceList": () => refreshDeviceList,
  "refreshToday": () => refreshToday,
  "releaseFocusInput": () => releaseFocusInput,
  "releaseLiveInput": () => releaseLiveInput,
  "releaseTypingKeys": () => releaseTypingKeys,
  "renderModeNav": () => renderModeNav,
  "renderProgress": () => renderProgress,
  "repaintHeld": () => repaintHeld,
  "reverbGain": () => audioEngine.reverbGain,
  "reverbNode": () => audioEngine.reverbNode,
  "reverbWet": () => audioEngine.reverbWet,
  "reviewItem": () => reviewItem,
  "romanFor": () => romanFor,
  "sampledPianoVoice": () => sampledPianoVoice,
  "savedDevice": () => midiController.state.savedDevice,
  "scaleDisp": () => scaleDisp,
  "scaleFormula": () => scaleFormula,
  "scorePitch": () => scorePitch,
  "seedPlacement": () => seedPlacement,
  "setBendFromValue": () => setBendFromValue,
  "setEq": () => setEq,
  "setLang": () => setLang,
  "setMidi": () => setMidi,
  "setOverlay": () => setOverlay,
  "shiftTypeOctave": () => shiftTypeOctave,
  "show": () => show,
  "showNotationReloadPrompt": () => showNotationReloadPrompt,
  "shuffle": () => shuffle,
  "slashLabel": () => slashLabel,
  "songsFor": () => songsFor,
  "spellMidi": () => spellMidi,
  "spelledName": () => spelledName,
  "srBeatPt": () => srBeatPt,
  "srClef": () => srClef,
  "srEvents": () => srEvents,
  "srKeyName": () => srKeyName,
  "srKeySigG": () => srKeySigG,
  "srLedger2": () => srLedger2,
  "srPieceTitle": () => srPieceTitle,
  "srPitch": () => srPitch,
  "srRest": () => srRest,
  "srStem2": () => srStem2,
  "srStemLine": () => srStemLine,
  "srTimeSigG": () => srTimeSigG,
  "srsOf": () => srsOf,
  "ssAccGlyph": () => ssAccGlyph,
  "ssFlat": () => ssFlat,
  "ssKeyAcc": () => ssKeyAcc,
  "ssMidiOf": () => ssMidiOf,
  "ssNatural": () => ssNatural,
  "ssNotehead": () => ssNotehead,
  "ssSharp": () => ssSharp,
  "ssStepOf": () => ssStepOf,
  "startDrone": () => startDrone,
  "startMetro": () => startMetro,
  "statHTML": () => statHTML,
  "stopDrone": () => stopDrone,
  "stopMetro": () => stopMetro,
  "syncAfter": () => syncAfter,
  "syncBusy": () => syncBusy,
  "syncCurrent": () => syncCurrent,
  "syncData": () => syncData,
  "syncGen": () => syncGen,
  "syncId": () => syncId,
  "syncIdle": () => syncIdle,
  "syncInitial": () => syncInitial,
  "syncInto": () => syncInto,
  "syncKeyboardPan": () => syncKeyboardPan,
  "syncNewCollisions": () => syncNewCollisions,
  "syncNote": () => syncNote,
  "syncPair": () => syncPair,
  "syncPick": () => syncPick,
  "syncPref": () => syncPref,
  "syncPull": () => syncPull,
  "syncRefresh": () => syncRefresh,
  "syncRemember": () => syncRemember,
  "syncSame": () => syncSame,
  "syncScrim": () => syncScrim,
  "syncSrs": () => syncSrs,
  "syncSrsPair": () => syncSrsPair,
  "syncWrite": () => syncWrite,
  "tf": () => tf,
  "theme": () => theme,
  "tl": () => tl,
  "tone": () => audioEngine.tone,
  "touchDay": () => touchDay,
  "trapFocus": () => trapFocus,
  "typeOctave": () => typeOctave,
  "view0": () => view0,
  "viewHigh": () => viewHigh,
  "wakeArm": () => wakeArm,
  "wakeCan": () => wakeCan,
  "wakeDrop": () => wakeDrop,
  "wakeGet": () => wakeGet,
  "wakeInit": () => wakeInit,
  "wakeOnGesture": () => wakeOnGesture,
  "wakePing": () => wakePing,
  "wakeSet": () => wakeSet,
  "wakeUi": () => wakeUi,
  "xmlEsc": () => xmlEsc,
  "$": () => maybeById,
  "ACCOMP_I18N": () => ACCOMP_I18N,
  "ACCOMP_PATTERNS": () => ACCOMP_PATTERNS,
  "ACCOMP_PROGS": () => ACCOMP_PROGS,
  "AN_MAX_BYTES": () => AN_MAX_BYTES,
  "AN_MAX_NOTES": () => AN_MAX_NOTES,
  "AN_MAX_XML_CHARS": () => AN_MAX_XML_CHARS,
  "BASE_HIGH": () => BASE_HIGH,
  "BASE_LOW": () => BASE_LOW,
  "BLACK_NUDGE": () => BLACK_NUDGE,
  "BLE": () => BLE,
  "BLE_MIDI_CHR": () => BLE_MIDI_CHR,
  "BLE_MIDI_SVC": () => BLE_MIDI_SVC,
  "CATS": () => CATS,
  "CHORDS": () => CHORDS,
  "CHORD_DEG": () => CHORD_DEG,
  "CHORD_FEEL": () => CHORD_FEEL,
  "CIRCLE": () => CIRCLE,
  "CLEF_F": () => CLEF_F,
  "CLEF_G": () => CLEF_G,
  "CLEF_SCALE": () => CLEF_SCALE,
  "COMPOUND": () => COMPOUND,
  "DOCK": () => DOCK,
  "INTERVALS": () => INTERVALS,
  "INTRO_CH": () => INTRO_CH,
  "INTRO_IV": () => INTRO_IV,
  "INTRO_SC": () => INTRO_SC,
  "INV_NAMES": () => INV_NAMES,
  "ITEMS": () => ITEMS,
  "ITEM_BY_ID": () => ITEM_BY_ID,
  "IVL": () => IVL,
  "KEYMAP": () => KEYMAP,
  "KEY_MAJ_FIFTHS": () => KEY_MAJ_FIFTHS,
  "LETTER_PC": () => LETTER_PC,
  "MAJOR": () => MAJOR,
  "NOTE_SYS": () => NOTE_SYS,
  "PC_FLAT": () => PC_FLAT,
  "PC_SHARP": () => PC_SHARP,
  "PIANO_KEYS": () => PIANO_KEYS,
  "PIANO_URLS": () => PIANO_URLS,
  "PIANO_WARM": () => PIANO_WARM,
  "PIECES": () => PIECES,
  "PROGS": () => PROGS,
  "PWA": () => PWA,
  "RD_ALL": () => RD_ALL,
  "RD_ALLIV": () => RD_ALLIV,
  "RD_LV": () => RD_LV,
  "RD_UNITS": () => RD_UNITS,
  "ROMAN": () => ROMAN,
  "ROOT_NAMES": () => ROOT_NAMES,
  "SCALES": () => SCALES,
  "SCALE_DEG": () => SCALE_DEG,
  "SC_BASE": () => SC_BASE,
  "SC_PAGE_W": () => SC_PAGE_W,
  "SONGS": () => SONGS,
  "SR_LET": () => SR_LET,
  "SS_FLAT_ORDER": () => SS_FLAT_ORDER,
  "SS_LETSEMI": () => SS_LETSEMI,
  "SS_SHARP_ORDER": () => SS_SHARP_ORDER,
  "SYNC": () => SYNC,
  "STORE": () => STORE,
  "storeRefresh": () => storeRefresh,
  "backupJson": () => backupJson,
  "SYNC_ADD": () => SYNC_ADD,
  "SYNC_ID": () => SYNC_ID,
  "SYNC_MAX": () => SYNC_MAX,
  "SYNC_NONE": () => SYNC_NONE,
  "SYNC_PREFS": () => SYNC_PREFS,
  "TONES": () => TONES,
  "WAKE": () => WAKE,
  "WAKE_IDLE_MS": () => WAKE_IDLE_MS,
  "_modalStack": () => _modalStack,
  "blackEl": () => blackEl,
  "coachText": () => coachText,
  "held": () => held,
  "heldOrder": () => heldOrder,
  "inputOwners": () => inputOwners,
  "isFlatKey": () => isFlatKey,
  "keyEl": () => keyEl,
  "liveVoices": () => liveVoices,
  "metro": () => metro,
  "midiToFreq": () => midiToFreq,
  "overlayReturn": () => overlayReturn,
  "pianoBank": () => pianoBank,
  "pointerKey": () => pointerKey,
  "rdS": () => rdS,
  "rootName": () => rootName,
  "sustained": () => sustained,
  "themeMQ": () => themeMQ,
  "typingDown": () => typingDown,
  "view": () => view,
  "whiteEl": () => whiteEl,
};
const __etudeRegistry = createTestSurfaceRegistry(__etude);
for (const [key, get] of Object.entries(__etudeGetters)) {
  __etudeRegistry.defineGetter(key, get);
}
// These hooks are intentionally mutable because a few browser regressions
// replace an app dependency in-place and verify the caller's behavior.
__etudeRegistry.defineMutable("makePianoVoice", () => makePianoVoice, (value) => { makePianoVoice = value; });
__etudeRegistry.defineMutable("pianoDecode", () => pianoDecode, (value) => { pianoDecode = value; });
__etudeRegistry.defineMutable("playInterval", () => playInterval, (value) => { playInterval = value; });
__etudeRegistry.defineMutable("preparePiano", () => preparePiano, (value) => { preparePiano = value; });
__etudeRegistry.defineMutable("previewNote", () => previewNote, (value) => { previewNote = value; });
__etudeRegistry.defineMutable("syncPull", () => syncPull, (value) => { syncPull = value; });
__etudeRegistry.defineMutable("actx", () => audioEngine.context, (value) => { audioEngine.context = value; });
__etudeRegistry.defineMutable("localSynth", () => audioEngine.localSynth, (value) => { audioEngine.localSynth = value; });
__etudeRegistry.defineMutable("notation", () => notation, (value) => { notation = value; });
__etudeRegistry.defineMutable("show", () => show, (value) => { show = value; });
__etudeRegistry.defineMutable("theme", () => theme, (value) => { theme = value; });
// Test-only sight-reading entry points load here so production never pulls them into the startup chunks.
const [{ srtEvaluate }, { srtGenerate }, { srtFingerprint }, { srtBuildExpected }, { srtLevelExpected }] = await Promise.all([
    import('../sight-reading/evaluate.js'),
    import('../sight-reading/generator.js'),
    import('../sight-reading/fingerprint.js'),
    import('../sight-reading/model.js'),
    import('../sight-reading/score.js'),
]);
__etudeRegistry.defineValue("srtEvaluate", srtEvaluate);
__etudeRegistry.defineValue("srtGenerate", srtGenerate);
__etudeRegistry.defineValue("srtFingerprint", srtFingerprint);
__etudeRegistry.defineValue("srtBuildExpected", srtBuildExpected);
__etudeRegistry.defineValue("srtLevelExpected", srtLevelExpected);
__etudeRegistry.defineValue("srtLedgerUpdate", srtLedgerUpdate);
__etudeRegistry.defineValue("srtReadLedger", srtReadLedger);
__etudeRegistry.defineValue("srtCreateLedger", srtCreateLedger);
__etudeRegistry.defineValue("srtAcquireAttemptLease", srtAcquireAttemptLease);
__etudeRegistry.defineValue("srtLedgerReadStatus", srtLedgerReadStatus);
__etudeRegistry.defineValue("isBackupPayload", isBackupPayload);
const { wireFeatureTestSurfaces } = await import('../app/test-surface-wiring.js');
await wireFeatureTestSurfaces(__etudeRegistry, ensureFeature);
window.__etude = __etude;
__etude.loadOsmd = loadOsmd;
}
document.documentElement.removeAttribute('data-app-pending');

import { loadUI, loadLearn } from '../locales/loader.js';
import { installLibraryCopy } from '../locales/library-runtime.js';
import { LESSONS } from '../locales/catalog.js';
import type { UIPayload } from '../locales/payload-types.js';
import type { MusicTranslations, StepLabels } from '../locales/content-types.js';
import * as storage from './storage.js';
import { SRS_INTERVALS, SYNC_ADD, SYNC_MAX, SYNC_NONE, localDayNumber, syncData, syncInto, syncNewCollisions, syncPick, syncSame, syncSrs, syncSrsPair } from '../core/sync-merge.js';
import {
  srsBox, srsDueItems, srsEntryOf, srsIsDue, srsIsNew, srsMasteredCount, srsNewItems, srsNewQuotaLeft,
  srsReview, srsSeedPlacement,
} from '../core/srs.js';
import { isSubset, randItem, setEq, shuffle } from '../core/collections.js';
import { CATS, INTRO_CH, INTRO_IV, INTRO_SC, ITEMS, ITEM_BY_ID, isCatKey } from '../core/trainer-items.js';
import * as safety from './data-safety.js';
import { createCoaching } from '../app/coaching.js';
import { createInputBus } from '../app/input-bus.js';
import { createKeyboardDock } from '../app/keyboard-dock.js';
import { createPersistence } from '../app/persistence.js';
import { createShellControls } from '../app/shell-controls.js';
import { createDevices } from '../app/devices.js';
import { createShellHelpers } from '../app/shell-helpers.js';
import { RD_ALL, RD_ALLIV, RD_LV, RD_UNITS, rdS, rdU } from '../core/reading-curriculum.js';
import { WAKE_IDLE_MS, type InstallPromptEvent } from '../infra/pwa-lifecycle.js';
import * as theory from './theory.js';
import * as audio from './audio.js';
import type * as notationApi from './notation.js';
import * as scoreLibraryStore from './score-library-store.js';
import { AN_MAX_BYTES, AN_MAX_NOTES, AN_MAX_XML_CHARS, CLEF_F, CLEF_G, CLEF_SCALE, NOTE_SYS, PC_FLAT, PC_SHARP, ROOT_NAMES, SC_BASE, SC_PAGE_W, SR_LET, SS_FLAT_ORDER, SS_LETSEMI, SS_SHARP_ORDER, anError, rdPercClef, srPitch, ssAccGlyph, ssFlat, ssKeyAcc, ssMidiOf, ssNatural, ssNotehead, ssSharp, ssStepOf, xmlEsc } from './score-types.js';
import { ACCOMP_I18N, ACCOMP_PATTERNS, ACCOMP_PROGS, CHORD_FEEL, CIRCLE, COMPOUND, INTERVALS, INV_NAMES, LP, MAJOR, PIECES, RO_IV, ROMAN, SONGS, dispSym, progChordTpl } from './repertoire-data.js';
import { srBeatPt, srClef, srEvents, srKeySigG, srLedger2, srRest, srStem2, srStemLine, srTimeSigG } from './grand-staff.js';

import '../styles/score-toolbar.css';
import '../styles/score-library.css';
import '../styles/native.css';
import * as router from './router.js';
import { byId, maybeById, inputById, selectById, queryHtml, queryAllHtml } from './dom.js';
import { createTestSurfaceRegistry, type AppHost, type ScorePlayerController, type PracticeController, type PracticeShell, type ProgressController, type ProgressShell, type TodayController, type TodayShell, type ReadController, type ReadShell, type ScorePlayerShell, type EtudeSurface, type FeatureController, type PreviewSequenceFrame, type ShowFn, type ShowOptions, type StoredTrainerData, type UiPrefsPatch, type UiPrefsSnapshot, type UiPrefsStore, type ViewApplicationState, type ViewEventHandler, type ViewEventName } from './views.js';
import type { InterfaceLanguage } from '../types/architecture.js';
import { BLE_MIDI_CHR, BLE_MIDI_SVC, type BleMidiDevice } from './ble-midi.js';
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
import { srtAcquireAttemptLease, srtCreateLedger, srtLedgerReadStatus, srtLedgerUpdate, srtReadLedger } from '../sight-reading/ledger.js';
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
    syncDocTitle();
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
// The full-screen stage of a running reading drill or piece. With a MIDI or Bluetooth piano connected, the keys fold into the
// rail there; showing or hiding them on the stage (`kb`) lasts until the stage closes and leaves the saved choice alone.
interface PracticeStageState { on: boolean; kb: boolean | null; rz: number }
const STAGE: PracticeStageState = { on: false, kb: null, rz: 0 };
const SCORE_FOCUS: { owner: 'analysis' | 'read' | null; native: boolean; token: number; returnTo: HTMLElement | null; scroll: number; readOverride: boolean | null; zoom: number } = { owner: null, native: false, token: 0, returnTo: null, scroll: 0, readOverride: null, zoom: 1 };
let pedalDown = false;
/* ---------- KEYBOARD, DOCK AND INPUT BUS (src/app/keyboard-dock.ts, src/app/input-bus.ts) ---------- */
// Created here, before anything below uses them; their dependencies are read lazily (getters), so shell values declared
// further down are resolved when a key is played or the dock is drawn, not now.
const inputBus = createInputBus({
    get practice() { return practice; },
    get scorePlayer() { return scorePlayer; },
    get read() { return read; },
    audioEngine,
    liveVoices,
    pianoBank,
    get keyEl() { return keyboardDock.keyEl; },
    get pointerKey() { return keyboardDock.pointerKey; },
    get typingDown() { return typingDown; },
    get cal() { return CAL; },
    get pedalDown() { return pedalDown; },
    set pedalDown(value: boolean) { pedalDown = value; },
    view0: () => view0(),
    kbPress: (midi, on) => keyboardDock.kbPress(midi, on),
    audioNoteOn: (midi, velocity) => audioNoteOn(midi, velocity),
    audioNoteOff: (midi) => audioNoteOff(midi),
    ensureAudio: (warm) => ensureAudio(warm),
    wakePing: () => wakePing(),
    stopPreviews: () => stopPreviews(),
    stopDrone: () => stopDrone(),
    panicLoadedFeatures: () => panicLoadedFeatures(),
    overlaysOpen: () => overlaysOpen(),
    calListening: () => calListening(),
    calTap: () => calTap(),
    calStop: () => calStop(),
    calSay: (text) => calSay(text),
});
const keyboardDock = createKeyboardDock({
    keyboardView: view,
    baseLow: BASE_LOW,
    baseHigh: BASE_HIGH,
    dock: DOCK,
    stage: STAGE,
    held: inputBus.held,
    get practice() { return practice; },
    get scorePlayer() { return scorePlayer; },
    get read() { return read; },
    get midiController() { return midiController; },
    get labelMode() { return labelMode; },
    view0: () => view0(),
    t: (key, ...args) => t(key, ...args),
    noteName: (midi, flat) => noteName(midi, flat),
    pcName: (p, flat) => pcName(p, flat),
    rootName: (p) => rootName(p),
    reduceMotion: () => reduceMotion(),
    saveAll: () => saveAll(),
    clampTypeOctave: () => clampTypeOctave(),
    handleNoteOn: (midi, velocity, source) => inputBus.handleNoteOn(midi, velocity, source),
    handleNoteOff: (midi, source, releaseKind, silence) => inputBus.handleNoteOff(midi, source, releaseKind, silence),
    inField: () => !!inField(),
    closeMobileMenu: () => closeMobileMenu(),
    scoreFocusUi: () => scoreFocusUi(),
    anLayoutVars: () => anLayoutVars(),
    bleLive: () => bleLive(),
    bleName: () => bleName(),
});
const { LAND_PHONE, bindKeyA11y, blackEl, blurInputField, buildKeyboard, chooseView, dockForced, dockKeepEnd, dockKeyInSight, dockLabels, dockOpen, dockReflowListeners, dockReveal, dockSet, dockShown, dockSync, dockWanted, fixedBottomTop, foldToView, initPointer, kbClear, kbClearAll, kbDegrees, kbPress, kbState, keyAt, keyDg, keyEl, keyMk, midiLive, notifyDockReflow, pointerKey, positionBlacks, reflowKeys, repaintHeld, sesNeedsKeys, stageDock, syncKeyboardPan, touchInput, viewHigh, whiteEl, BLACK_NUDGE } = keyboardDock;
const { handleNoteOff, handleNoteOn, held, heldMidis, heldOrder, heldPcs, inputBusListeners, inputOwners, midiChannels, midiSustainOwners, onInputChange, panic, pedalUp, releaseFocusInput, releaseLiveInput, sustained } = inputBus;
/* ---------- PERSISTENCE (src/app/persistence.ts); the write gateway stays below (syncWrite, storeApplyBackup, syncPayload) ---------- */
// Created before anything below captures saveSoon or the sync state; shell values it needs are read through getters.
const persistence = createPersistence({
    get data() { return data; },
    set data(value: StoredTrainerData) { data = value; },
    get lang() { return lang; },
    set lang(value: InterfaceLanguage) { lang = value; },
    get notation() { return notation; },
    set notation(value: theory.NoteSystem) { notation = value; },
    get theme() { return theme; },
    set theme(value: 'auto' | 'light' | 'dark') { theme = value; },
    get labelMode() { return labelMode; },
    set labelMode(value: string) { labelMode = value; },
    get reloadingForRestore() { return reloadingForRestore; },
    get strings() { return STRINGS; },
    get localeRequest() { return localeRequest; },
    set localeRequest(value: number) { localeRequest = value; },
    audioEngine,
    get midiController() { return midiController; },
    metro,
    dock: DOCK,
    get ble() { return BLE; },
    get pwa() { return PWA; },
    get wake() { return WAKE; },
    get loadedFeatures() { return loadedFeatures; },
    get practice() { return practice; },
    get read() { return read; },
    todayN: () => todayN(),
    view0: () => view0(),
    t: (key, ...args) => t(key, ...args),
    appAlert: (message) => appAlert(message),
    appConfirm: (message) => appConfirm(message),
    setLang: (l, synchronized) => setLang(l, synchronized),
    isRuntimeLanguage: (value): value is InterfaceLanguage => isRuntimeLanguage(value),
    applyTheme: () => applyTheme(),
    applyNotation: () => applyNotation(),
    localeLoadError: (retry, target) => localeLoadError(retry, target),
    reflectSettingsUI: () => reflectSettingsUI(),
    refreshToday: () => refreshToday(),
    renderProgress: () => renderProgress(),
    anyLoadedFeatureBusy: () => anyLoadedFeatureBusy(),
    freshData: () => freshData(),
    restoreTrainerData: (saved) => restoreTrainerData(saved),
    scorePrefsNow: () => scorePrefsNow(),
    setScorePrefs: (next) => setScorePrefs(next),
    savedScoreView: (v, explicit) => savedScoreView(v, explicit),
    defaultScoreLayoutForViewport: (w) => defaultScoreLayoutForViewport(w),
    buildKeyboard: () => buildKeyboard(),
    repaintHeld: () => repaintHeld(),
    calUi: () => calUi(),
    calRecord: () => calRecord(),
    pwaStandalone: () => pwaStandalone(),
    bleLive: () => bleLive(),
    bleName: () => bleName(),
    syncWrite: (replacement) => syncWrite(replacement),
    storeApplyBackup: (payload, reason) => storeApplyBackup(payload, reason),
    syncPayload: () => syncPayload(),
    saveAll: () => saveAll(),
});
const { clampPersistedNumber, SYNC, SYNC_ID, SYNC_THEMES, SYNC_NOTATIONS, SYNC_LABELS, SYNC_TONES, syncOneOf, syncIsLang, syncParseJson, SYNC_PREFS, syncIsPrefName, syncGen, syncGenTime, syncNextGen, syncId, syncRemember, syncCurrent, syncPair, syncInitial, syncPref, syncBusy, syncIdle, syncNote, syncAfter, syncRefresh, flushSaveSoon, saveSoon, STORE, STORE_LAST_EXPORT, STORE_SNAPSHOTS_CHANGED, STORE_UNREADABLE, STORE_EXPORT_DUE_MS, backupJson, storeSaved, storeFailed, storeBlock, storeHasProgress, storeDaily, storeSnapshotsChanged, UPGRADE_SNAPSHOT_TIMEOUT_MS, storeSnapshot, storeQuarantine, storeBackupBlocked, MAX_PROGRESS_IMPORT_BYTES, storeRestore, storeReset, storeExported, storeLastExport, storeWhen, storeSize, storeRefresh, storeI18nReady, renderDataSafety, storeNote, storeDiagnostics, storeMs, storeDiagRender, storeInit, applyTopLevelPrefs, loadAll } = persistence;
/* ---------- SETTINGS, DIALOGS AND CONTROL WIRING (src/app/shell-controls.ts) ---------- */
const shellControls = createShellControls({
    get anLayoutVars() { return anLayoutVars; },
    get applyTheme() { return applyTheme; },
    get attachInput() { return attachInput; },
    get audioEngine() { return audioEngine; },
    get audioLockCheck() { return audioLockCheck; },
    get audioLockSync() { return audioLockSync; },
    get audioUnlock() { return audioUnlock; },
    get backupJson() { return backupJson; },
    get BASE_HIGH() { return BASE_HIGH; },
    get BASE_LOW() { return BASE_LOW; },
    get bleClick() { return bleClick; },
    get bleReconnect() { return bleReconnect; },
    get buildKeyboard() { return buildKeyboard; },
    get CAL() { return CAL; },
    get calSay() { return calSay; },
    get calStop() { return calStop; },
    get chooseView() { return chooseView; },
    get closeMobileMenu() { return closeMobileMenu; },
    get coachRefresh() { return coachRefresh; },
    get connectMidi() { return connectMidi; },
    get data() { return data; },
    get dockOpen() { return dockOpen; },
    get dockSet() { return dockSet; },
    get dockShown() { return dockShown; },
    get dockSync() { return dockSync; },
    get ensureAudio() { return ensureAudio; },
    get fillRoots() { return fillRoots; },
    get fitHeader() { return fitHeader; },
    get flushSaveSoon() { return flushSaveSoon; },
    get fsToggle() { return fsToggle; },
    get initLatencyCalibration() { return initLatencyCalibration; },
    get kbdLayoutLabels() { return kbdLayoutLabels; },
    get KEY() { return KEY; },
    get labelMode() { return labelMode; },
    set labelMode(value: string) { labelMode = value; },
    get lang() { return lang; },
    get layoutVarsSoon() { return layoutVarsSoon; },
    get liveVoices() { return liveVoices; },
    get localeLoadError() { return localeLoadError; },
    get localize() { return localize; },
    get localizeLoadedFeatures() { return localizeLoadedFeatures; },
    get MAX_PROGRESS_IMPORT_BYTES() { return MAX_PROGRESS_IMPORT_BYTES; },
    get metro() { return metro; },
    get notation() { return notation; },
    set notation(value: "letter" | "solfege" | "german") { notation = value; },
    get openMobileMenu() { return openMobileMenu; },
    get panic() { return panic; },
    get parsePttV3() { return parsePttV3; },
    get persistence() { return persistence; },
    get pianoStatus() { return pianoStatus; },
    get popModalState() { return popModalState; },
    get positionBlacks() { return positionBlacks; },
    get practice() { return practice; },
    get pushModalState() { return pushModalState; },
    get pwaInstall() { return pwaInstall; },
    get pwaRegister() { return pwaRegister; },
    get rdFocusDispSet() { return rdFocusDispSet; },
    get read() { return read; },
    get readScoreZoom() { return readScoreZoom; },
    get reflowKeys() { return reflowKeys; },
    get refreshToday() { return refreshToday; },
    get registerViewEvent() { return registerViewEvent; },
    get releaseFocusInput() { return releaseFocusInput; },
    get releaseLiveInput() { return releaseLiveInput; },
    get releaseTypingKeys() { return releaseTypingKeys; },
    get reloadingForRestore() { return reloadingForRestore; },
    get repaintHeld() { return repaintHeld; },
    get saveAll() { return saveAll; },
    get saveSoon() { return saveSoon; },
    get SCORE_FOCUS() { return SCORE_FOCUS; },
    get scoreFocusFullscreenChanged() { return scoreFocusFullscreenChanged; },
    get scoreFocusToggle() { return scoreFocusToggle; },
    get scoreFocusUi() { return scoreFocusUi; },
    get scorePlayer() { return scorePlayer; },
    get setLang() { return setLang; },
    get show() { return show; },
    get STAGE() { return STAGE; },
    get stopDrone() { return stopDrone; },
    get stopPreviews() { return stopPreviews; },
    get STORE() { return STORE; },
    get STORE_LAST_EXPORT() { return STORE_LAST_EXPORT; },
    get STORE_SNAPSHOTS_CHANGED() { return STORE_SNAPSHOTS_CHANGED; },
    get storeApplyBackup() { return storeApplyBackup; },
    get storeBackupBlocked() { return storeBackupBlocked; },
    get storeDiagnostics() { return storeDiagnostics; },
    get storeExported() { return storeExported; },
    get storeNote() { return storeNote; },
    get storeRefresh() { return storeRefresh; },
    get storeReset() { return storeReset; },
    get storeRestore() { return storeRestore; },
    get SYNC_NOTATIONS() { return SYNC_NOTATIONS; },
    get SYNC_THEMES() { return SYNC_THEMES; },
    get SYNC_TONES() { return SYNC_TONES; },
    get syncAfter() { return syncAfter; },
    get syncNote() { return syncNote; },
    get syncOneOf() { return syncOneOf; },
    get syncWrite() { return syncWrite; },
    get t() { return t; },
    get theme() { return theme; },
    set theme(value: "auto" | "light" | "dark") { theme = value; },
    get view() { return view; },
    get view0() { return view0; },
    get wakeSet() { return wakeSet; },
    get withPractice() { return withPractice; },
});
const { labelSettingsControl, labelSettingsControls, reflectSettingsUI, setWeakSpotInjection, appAlert, appConfirm, overlaysOpen, syncScrim, overlayReturn, setOverlay, trapFocus, openDrawer, openHelp, applyNotation, initControls } = shellControls;
/* ---------- DEVICES (src/app/devices.ts): Web MIDI, timing calibration, Bluetooth MIDI, installed app and score focus ---------- */
const devices = createDevices({
    get audioEngine() { return audioEngine; },
    get audioLockCheck() { return audioLockCheck; },
    get BASE_HIGH() { return BASE_HIGH; },
    get BASE_LOW() { return BASE_LOW; },
    get buildKeyboard() { return buildKeyboard; },
    get clampTypeOctave() { return clampTypeOctave; },
    get data() { return data; },
    get dockOpen() { return dockOpen; },
    get dockShown() { return dockShown; },
    get dockSync() { return dockSync; },
    get ensureAudio() { return ensureAudio; },
    get handleNoteOff() { return handleNoteOff; },
    get handleNoteOn() { return handleNoteOn; },
    get held() { return held; },
    get inputOwners() { return inputOwners; },
    get midiChannels() { return midiChannels; },
    get midiSustainOwners() { return midiSustainOwners; },
    get openHelp() { return openHelp; },
    get overlaysOpen() { return overlaysOpen; },
    get panic() { return panic; },
    get pedalDown() { return pedalDown; },
    set pedalDown(value: boolean) { pedalDown = value; },
    get pedalUp() { return pedalUp; },
    get practice() { return practice; },
    get read() { return read; },
    get releaseLiveInput() { return releaseLiveInput; },
    get repaintHeld() { return repaintHeld; },
    get runtimeErrorMessage() { return runtimeErrorMessage; },
    get runtimeErrorName() { return runtimeErrorName; },
    get saveAll() { return saveAll; },
    get SCORE_FOCUS() { return SCORE_FOCUS; },
    get scorePlayer() { return scorePlayer; },
    get setBendFromValue() { return setBendFromValue; },
    get STAGE() { return STAGE; },
    get stageSync() { return stageSync; },
    get sustained() { return sustained; },
    get t() { return t; },
    get timedAudioReady() { return timedAudioReady; },
    get touchInput() { return touchInput; },
    get typeOctave() { return typeOctave; },
    set typeOctave(value: number) { typeOctave = value; },
    get view() { return view; },
    get view0() { return view0; },
    get viewHigh() { return viewHigh; },
});
const { midiController, setMidi, midiChipSync, connectMidi, listInputs, refreshDeviceList, attachInput, autoReconnectMidi, onStateChange, onMidiMessage, midiIn, calRecord, CAL, initLatencyCalibration, calUi, calListening, calSay, calTap, calStop, BLE, bleCan, bleLive, bleName, bleSet, bleUi, bleClick, bleChoose, bleErr, bleStale, bleOpen, bleUnhook, bleOnGone, bleRetry, bleReconnect, bleDisconnect, bleReleaseInput, bleAutoReconnect, bleParserReset, bleOnValue, bleParse, bleStatus, bleData, bleMsg, PWA, WAKE, pwaStandalone, pwaInit, pwaRegister, pwaUi, pwaInstall, fsCan, fsUi, fsToggle, wakeCan, wakeGet, wakeOnGesture, wakeDrop, wakeSet, wakePing, wakeArm, wakeUi, wakeInit, scoreFocusUi, readScoreZoom, rdFocusDispSet, scoreFocusExit, scoreFocusToggle, scoreFocusEnter, scoreFocusFullscreenChanged, KEYMAP, typingDown, shiftTypeOctave, physKey, kbdLayoutLabels, releaseTypingKeys, inField } = devices;
/* ---------- SHELL HELPERS (src/app/shell-helpers.ts): Learn bridge, reading data, spelling, layout variables ---------- */
const shellHelpers = createShellHelpers({
    get clampPersistedNumber() { return clampPersistedNumber; },
    get coaching() { return coaching; },
    get data() { return data; },
    get dockShown() { return dockShown; },
    get lang() { return lang; },
    get LOCALE_TAGS() { return LOCALE_TAGS; },
    get notifyDockReflow() { return notifyDockReflow; },
    get practice() { return practice; },
    get read() { return read; },
    get SCORE_FOCUS() { return SCORE_FOCUS; },
    get scorePlayer() { return scorePlayer; },
    get show() { return show; },
    get STAGE() { return STAGE; },
    get STRINGS() { return STRINGS; },
    get t() { return t; },
    get todayN() { return todayN; },
    get view0() { return view0; },
});
const { learnTitle, learnData, learnUnitOf, learnUnitDone, learnGap, learnDueDays, learnDueList, learnGoId, learnPlanItems, srPieceTitle, rdData, rdEsc, rdLvName, coachRefresh, tl, KEY_MAJ_FIFTHS, LETTER_PC, LETTERS, spelledName, showNotationReloadPrompt, reduceMotion, savedScoreView, anLayoutVars, layoutVarsSoon, syncMobileStartBars, anNum, rdStarCount } = shellHelpers;
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
// The tab title names the screen, in the interface language, so the browser's tab list and a screen reader say where
// you are. The static title in etude.html stays for crawlers and the first paint.
function syncDocTitle() {
    const v = view0();
    document.title = t(v === 'practice' ? 'nav_drills' : v === 'analysis' ? 'nav_scores' : 'nav_' + v) + ' — Étude';
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
        return controller;
    }).finally(() => {
        delete featureLoadPromises[view];
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
            syncDocTitle();
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
                syncDocTitle();
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
            return reader.abandonClaim().then((result) => {
                if (navigation !== featureNavigation) return;
                if (result.ok || !reader.isPendingSaveState()) {
                    return show(hum ? 'transcribe' : v, { ...opts, moveFocus, fromHistory, analysisRoute: requestedAnRoute });
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
    syncDocTitle();
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
    if (modal === 'menu' || modal === 'help' || modal === 'drawer' || (modal === 'dialog' && shellControls.appDialogClose))
        _modalStack.push(modal);
    if (modal !== 'dialog' && shellControls.appDialogClose)
        shellControls.appDialogClose(false, true);
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
/* ---------- PROGRESS and TODAY: lazy features in src/features/progress/ and src/features/today/ ---------- */
function statHTML(v: string|number, l: string) { return '<div class="s"><b class="num">' + rdEsc(v) + '</b><span>' + rdEsc(l) + '</span></div>'; }
let reloadingForRestore = false;
function saveAll() { if (reloadingForRestore) return; const got = persistence.syncPull(); syncWrite(); if (got === 'merge' || got === 'merge-save' || got === 'swap')
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
        clearTimeout(persistence.saveTimer ?? undefined);
        persistence.saveTimer = null;
        location.reload();
    }
    catch (_) {
        reloadingForRestore = false;
        await appAlert(t(STORE.blocked === 'too-new' ? 'store_too_new' : STORE.blocked === 'upgrade' ? 'store_upgrade_stuck' : 'import_storage'));
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
  "_saveT": () => persistence.saveTimer,
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
  "kbDegSrc": () => keyboardDock.kbDegSrc,
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
__etudeRegistry.defineMutable("syncPull", () => persistence.syncPull, (value) => { persistence.syncPull = value; });
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

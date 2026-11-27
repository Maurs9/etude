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
import {
  learnData as coreLearnData,
  learnDueDays as coreLearnDueDays,
  learnDueList as coreLearnDueList,
  learnGap as coreLearnGap,
  learnUnitDone as coreLearnUnitDone,
  learnUnitOf as coreLearnUnitOf,
} from '../core/learn-progress.js';
import * as safety from './data-safety.js';
import { createPwaLifecycle, WAKE_IDLE_MS, type InstallPromptEvent } from '../infra/pwa-lifecycle.js';
import * as theory from './theory.js';
import type { PracticeHintDiagram, PracticeHintNote, PracticeHintStep } from './practice-hints.js';
import type { PracticeHintsTopic } from './practice-hints-view.js';
import type { StudyHintState } from './practice-study-view.js';
import { createAccompanimentController } from '../features/practice/accompaniment.js';
import { createSongBookController } from '../features/practice/song-book.js';
import * as audio from './audio.js';
import type * as notationApi from './notation.js';
import * as scoreLibraryStore from './score-library-store.js';
import { AN_MAX_BYTES, AN_MAX_NOTES, AN_MAX_XML_CHARS, CLEF_F, CLEF_G, CLEF_SCALE, NOTE_SYS, PC_FLAT, PC_SHARP, ROOT_NAMES, SC_BASE, SC_PAGE_W, SR_LET, SR_SCALE_CAP, SS_FLAT_ORDER, SS_LETSEMI, SS_SHARP_ORDER, anError, rdPercClef, srPitch, ssAccGlyph, ssFlat, ssKeyAcc, ssMidiOf, ssNatural, ssNotehead, ssSharp, ssStepOf, xmlEsc, type NotationSystem, type ScoreGraceNote, type ScoreNoteArticulation, type ScoreXmlLayout, type ScoreXmlLink, type ScoreXmlNote, type SrBeatX, type SrHand, type SrLayout, type SrPiece, type SrPitch, type SrRenderResult, type SrScore, type SrStaffNote, type SrSystem, type SrToken } from './score-types.js';
import { ACCOMP_I18N, ACCOMP_PATTERNS, ACCOMP_PROGS, CHORD_FEEL, CIRCLE, COMPOUND, INTERVALS, INV_NAMES, LP, MAJOR, PIECES, RO_IV, ROMAN, SONGS, dispSym, progChordTpl, type IntervalDefinition } from './repertoire-data.js';
import { renderGrandStaff, srBeatPt, srClef, srEvents, srKeySigG, srLedger2, srLevelBeams, srLevelMarks, srLevelPrep, srLevelRest, srRest, srSpellName, srStem2, srStemLine, srTieArc, srTimeSigG, type SrBeamCol, type SrBeamGroup, type SrChordItem, type SrEvent, type SrMarkCol, type SrNoteEvent, type SrRestEvent, type SrStave } from './grand-staff.js';

import '../styles/score-library.css';
import '../styles/native.css';
import type { LibraryItem } from './score-library-types.js';
import * as router from './router.js';
import { byId, downloadBlob, maybeById, inputById, selectById, buttonById, eventElement, eventClosest, queryHtml, queryAllHtml, onPageReturn } from './dom.js';
import {
  createTestSurfaceRegistry,
  SCORE_SIDE_TABS,
  type AppHost,
  type CoachTip,
  type ScorePlayerController,
  type ScorePlayerShell,
  type EtudeSurface,
  type FeatureController,
  type InputBusListener,
  type IntervalDirection,
  type PreviewSequenceFrame,
  type ReadDrillCustom,
  type ReadDrillData,
  type ReadDrillLevelStat,
  type ReadDrillNoteStat,
  type ReadDrillPrefs,
  type ReadDrillTotals,
  type ShowFn,
  type ShowOptions,
  type StoredLastDrill,
  type StoredLessonReview,
  type StoredPracticeLog,
  type StoredSheetRecord,
  type StoredTrainerData,
  type StoredTrainerSettings,
  type UiPrefsPatch,
  type UiPrefsSnapshot,
  type UiPrefsStore,
  type ViewApplicationState,
  type ViewEventHandler,
  type ViewEventName,
} from './views.js';
import type { AppLanguage, InterfaceLanguage } from '../types/architecture.js';
import { eventTime, inputEventTime, inputSource, inputTime, inputTimeForRelease, useLatencyOffsets, withInputTime } from './midi-timing.js';
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
import { srtEvaluate, type SightReadingEvaluation, type SightReadingPerformed } from '../sight-reading/evaluate.js';
import { srtBuildExpected, type SightReadingExpected, type SightReadingPiece, type SightReadingProfile } from '../sight-reading/model.js';
import { srtFingerprint, srtLevelFingerprint } from '../sight-reading/fingerprint.js';
import { srtKeyPool, srtLevel, srtLevelPatterns, srtLevels, srtReadingKey, srtReadingKeys, type ReadingKey, type ReadingKeyId, type ReadingPatternId } from '../sight-reading/levels.js';
import { SRT_BOOK_PIECES, SRT_DAILY_PIECES, SRT_FOCUS_PIECES, SRT_UNIT_PIECES, srtBookPiece, srtBookUnits, srtDailyPiece, srtFocusPiece, srtLongPiece, type BookUnit } from '../sight-reading/book.js';
import { srtScoredId, srtBookId, srtBookTally, srtChooseLevel, srtDailyId, srtEnsureDaily, srtFocusId, srtFocusTally, srtKeyStatus, srtLevelAverage, srtLevelReady, srtLongId, srtNormalizeBookState, srtPiecesRead, srtRecordResult, srtStreak, type PieceStat, type ReadingBookState } from '../sight-reading/progress.js';
import { srtLevelClicks, srtLevelDurationMs, srtLevelExpected, srtLevelScore } from '../sight-reading/score.js';
import { srtMelodyRhythm } from '../sight-reading/patterns.js';
import { SRT_FLASH_MS, srtFlashMatches, srtWarmupPlan, type FlashCard, type WarmupStep } from '../sight-reading/warmup.js';
import type { GeneratedPiece } from '../sight-reading/rules.js';
import { srtGenerate } from '../sight-reading/generator.js';
import { SightReadingRecorder, srtInputFamily } from '../sight-reading/recorder.js';
import { createInstantFeedbackTracker, type InstantFeedbackExpectedNote, type InstantFeedbackTracker } from '../sight-reading/instant-feedback.js';
import { srtLevelMarkings, type LevelMarkings } from '../sight-reading/markings.js';
import { SRT_LEDGER_KEY, isFutureSightLedgerStorage, isSightReadingLedger, srtAcquireAttemptLease, srtCreateLedger, srtLedgerReadStatus, srtLedgerUpdate, srtReadLedger, srtResetLedgerTransaction, type SightReadingAttempt, type SightReadingAttemptLease, type SightReadingLedgerOperation, type SightReadingLedgerResult } from '../sight-reading/ledger.js';
import { SRT_INITIAL_STATE, srtTransition, type SightReadingState } from '../sight-reading/flow.js';
import { courtesyNatural, formatLead, ghostX, pacerLead, streamStart, streamVisible, systemBars, systemRows, systemWindow } from '../sight-reading/stream.js';
import { srtNotationSegments } from '../sight-reading/notation.js';
import '../styles/sight-rhythm.css';
import { type TechniqueKind } from './technique.js';
import { CONTRAST_LENGTH, ConfusionLog, contrastOrder, differentialIntervalCue, differentialToneCue, feedbackBroken, feedbackChords, feedbackLine, feedbackSchedule, type ConfusionPair, type FeedbackSketch } from './feedback.js';
import { TECHNIQUE_TOPIC, techniqueDrillActive, techniqueInput, techniquePresent, techniqueRefresh, techniqueStop, type TechniqueHost } from './technique-drill.js';
import { ARCADE_LIVES, ARCADE_STREAK, MARATHON_NOTES_PER_BAR, TIME_ATTACK_MS, srtArcadeComplete, srtArcadeMultiplier, srtArcadeRecord, srtArcadeRemainingMs, srtArcadeStart, srtArcadeSummary, srtIsArcadeMode, srtIsMarathonBars, type SightReadingArcadeMode, type SightReadingArcadeState, type SightReadingMarathonBars } from '../sight-reading/arcade.js';
import type { buildPracticeReport, PracticeReportPieceInput } from './progress-report.js';


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
function isCatKey(cat: string): cat is keyof typeof CATS { return cat in CATS; }
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
    renderPracticeSetup();
    fitHeader();
    renderAccompany(true);
    renderPracticeMelodyScales();
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
    accompaniment.localize();
    localizeLoadedFeatures();
    if (view0() === 'today')
        refreshToday();
    else if (view0() === 'progress')
        renderProgress();
    else if (view0() === 'read') {
        if (SR.piece) {
            srMeta();
            if (SR.srtEvaluation && SR.srtState && ['completed', 'pendingSave', 'saved'].includes(SR.srtState.name))
                srRenderAssessResult();
            srPaintAll();
        }
    }
    scorePlayer?.relocalize();
    rdOnLocale();
    refreshSessionCopy();
    coachRefresh();
    saveAll();
}
/* ---------- HELPERS ---------- */
const midiToFreq = midiToFrequency;
const pc = pitchClass;
const isFlatKey = (p: number) => [1, 3, 5, 8, 10].includes(((p % 12) + 12) % 12);
const rootName = (p: number) => NOTE_SYS[notation].root[((p % 12) + 12) % 12];
function pcName(p: number, flat: boolean) { return (flat ? NOTE_SYS[notation].flat : NOTE_SYS[notation].sharp)[((p % 12) + 12) % 12]; }
function noteName(m: number, flat: boolean) { return pcName(pc(m), flat) + (Math.floor(m / 12) - 1); }
function setEq<T>(a: ArrayLike<T>, b: ArrayLike<T>) { if (a.length !== b.length)
    return false; for (let i = 0; i < a.length; i++)
    if (a[i] !== b[i])
        return false; return true; }
function isSubset<T>(a: readonly T[], b: readonly T[]) { return a.every((x) => b.includes(x)); }
function randItem<T>(a: ArrayLike<T>) { return a[Math.floor(Math.random() * a.length)]; }
function shuffle<T>(src: readonly T[]) { const a = src.slice(); for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
} return a; }
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
        srtWatchAudioContext(context);
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
    clearPracticeHintPreview();
    for (const stop of previewStoppers) stop();
    clearMelodyDemoPreview();
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
    rdDockView();
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
    rdDockPaint();
    if (view0() === 'analysis')
        scorePlayer?.keysPaint(true);
    notifyDockReflow();
    paintPracticeHintKeys();
    paintAccompImproScale();
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
function dockWanted(v = view0()) { return v === 'today' || v === 'explore' || prAlongWanted(v) || (v === 'practice' && practiceHintPreview?.keys === true) || v === 'learn' || v === 'read' || v === 'sing' || (v === sesHome() && SES.active) || (v === 'analysis' && !!scorePlayer?.dockWanted()); }
function sesNeedsKeys(v = view0()) { const q = SES.q; return SES.active && v === sesHome() && !!q && (q.mode !== 'ear' || ekWanted(q)) && !midiLive(); }
function dockForced(v = view0()) { return DOCK.force && v === 'read'; }
// The full-screen stage of a running reading drill or piece. With a MIDI or Bluetooth piano connected, the keys fold into the
// rail there; showing or hiding them on the stage (`kb`) lasts until the stage closes and leaves the saved choice alone.
interface PracticeStageState { on: boolean; kb: boolean | null; rz: number }
const STAGE: PracticeStageState = { on: false, kb: null, rz: 0 };
const SCORE_FOCUS: { owner: 'analysis' | 'read' | null; native: boolean; token: number; returnTo: HTMLElement | null; scroll: number; readOverride: boolean | null; zoom: number } = { owner: null, native: false, token: 0, returnTo: null, scroll: 0, readOverride: null, zoom: 1 };
function midiLive() { return !!midiController.state.activeInputId || bleLive(); }
function stageDock(v = view0()) { return STAGE.on && v === 'read' && (STAGE.kb != null || midiLive()); }
function dockOpen(v = view0()) { if (v === 'practice' && practiceHintPreview && practiceHintPreview.keys !== null)
    return practiceHintPreview.keys; if (dockForced(v))
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
        stageRefit();
}
LAND_PHONE.addEventListener('change', () => dockSync());
// Expanding from the rail, the keys rise out of it (not with reduced motion); transform and opacity only, so the layout is settled from the first frame.
function dockReveal() { if (reduceMotion())
    return; const dock = byId('dock'); dock.classList.add('is-opening'); clearTimeout(DOCK.animT); DOCK.animT = window.setTimeout(() => dock.classList.remove('is-opening'), 300); }
function dockSet(open: boolean) {
    if (view0() === 'practice' && practiceHintPreview && practiceHintPreview.keys !== null) {
        practiceHintPreview.keys = open;
        dockSync();
        showPracticeHintNotes(practiceHintPreview);
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
let pedalDown = false, evalTimer: number|null = null;
function handleNoteOn(midi: number, vel: number, source = 'midi') {
    if (!Number.isInteger(midi) || midi < 0 || midi > 127)
        return;
    ensureAudio();
    const owners = inputOwners.get(midi) || new Set<string>();
    owners.add(source);
    inputOwners.set(midi, owners);
    if (held.has(midi)) {
        if (view0() === 'read' && SR.active && SR.modeSel === 'assess' && srtRecorder && !overlaysOpen())
            srtRecorder.trackSource(source, inputTime() - SR.t0);
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
    if (RD.rh)
        [...RD.rh.open.keys()].forEach((s) => { if (/^(k:|p\d)/.test(s))
            rdRhRelease(s); });
    scorePlayer?.releaseFocus(fell);
}
function panic() {
    sesStopPrompt();
    sesStopAnswerReplay();
    rdnAutoCancel();
    if (WARM.on) rdnHome();
    if (RD.on && RD.L?.ty !== 'rh') rdAbort();
    if (CAL.on) {
        calStop();
        calSay('');
    }
    pianoBank.cancelWarmIdle();
    srtCancelAttempt('interrupted');
    if (srtRecorder) srtRecorder.releaseAll('reset', performance.now() - SR.t0);
    releaseLiveInput();
    rdRhInterrupt();
    accompStop();
    srStopAll(true, true);
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
    // A waiting level piece starts on its first note; the keys played while its first sight is claimed are kept for the recorder.
    if (!(SR.active && srtRecorder) && srNoteStartInput(kind, midi, source, releaseKind))
        return;
    if (view0() === 'read' && SR.active && SR.modeSel === 'assess' && srtRecorder) {
        const relMs = inputTimeForRelease(releaseKind) - SR.t0;
        srtRecorder.record(kind, midi, source, releaseKind, relMs);
        if (kind === 'on' && SR.instantFeedback)
            srInstantHandleNote(midi, relMs);
    }
    if (view0() === 'analysis') {
        scorePlayer?.practiceInput(kind, midi, source);
        return;
    }
    if (view0() === 'explore' || view0() === 'sing' || view0() === 'learn') {
        return;
    }
    if (view0() === 'read' && kind === 'on' && WARM.on && WARM.phase === 'play') {
        rdnWarmNote(midi);
        return;
    }
    if (view0() === 'read' && RD.on && RD.L && RD.L.ty === 'rh') {
        if (midi != null)
            rdRhKey(kind, midi);
        return;
    }
    if (view0() === 'read' && RD.on && kind === 'on') {
        const m = heldOrder[heldOrder.length - 1];
        if (m != null)
            rdInput(m);
        return;
    }
    if (view0() === 'read' && SR.active && kind === 'on') {
        const m = heldOrder[heldOrder.length - 1];
        if (m != null)
            srKeyInput(m);
        return;
    }
    if (SES.active) {
        if (kind === 'on')
            sesInput(midi);
        else if (SES.q && SES.q.ek)
            ekOff(SES.q, midi);
    }
}
function scheduleEval(fn: () => void, ms: number) { clearTimeout(evalTimer ?? undefined); evalTimer = window.setTimeout(fn, ms); }
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
        rdnReadySync();
        scorePlayer?.syncPracticeLine();
        if (STAGE.on || SES.active) dockSync(); // a connected piano releases the keys a stage or drill opened
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
    srtEligibleFirstSightActive,
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
        button.setAttribute('aria-disabled', String(!SR.piece));
    }
    const kb = maybeById('rd-focus-kb');
    kb?.setAttribute('aria-expanded', String(dockOpen()));
    if (kb) { kb.textContent = t(dockOpen() ? 'kb_hide' : 'kb_show'); }
}
function readScoreZoom(value = SCORE_FOCUS.zoom) {
    SCORE_FOCUS.zoom = Math.round(Math.max(.7, Math.min(2, value)) * 10) / 10;
    const svg = srSvg();
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
        rdnAutoCancel();
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
    if (owner === 'analysis' ? !scorePlayer?.hasNotes() : !SR.piece || byId('rdp-pieces').hidden) return;
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
    if (stageKey(e) || rdKey(e, k) || rdnKey(e))
        return;
    if (SES.active && SES.q) { // session shortcuts: digits pick an answer, R replays, N advances
        if (/^[1-9]$/.test(k) && !SES.answered && SES.q.mode === 'ear') {
            const b = byId('q-answers').children[+k - 1];
            if (b instanceof HTMLElement) {
                e.preventDefault();
                b.click();
                return;
            }
        }
        if (k === 'r' && !byId('q-replay').hidden) {
            e.preventDefault();
            byId('q-replay').click();
            return;
        }
        if (k === 'n' && !byId('q-next').hidden) {
            e.preventDefault();
            byId('q-next').click();
            return;
        }
    }
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
const INTRO_IV = [7, 5, 4, 3, 12, 2, 9, 8, 11, 10, 1, 6];
const INTRO_CH = ['maj', 'm', 'dim', 'sus4', 'sus2', 'aug', 'maj7', '7', 'm7', '6', 'm6', 'm7♭5', 'dim7', 'mMaj7', 'add9', '9', 'maj9', 'm9', '7♯5', '7♭5', 'maj7♯11', '7♭9', '7♯9', '11', '13'];
const INTRO_SC = ['Major (Ionian)', 'Aeolian (Natural minor)', 'Major pentatonic', 'Minor pentatonic', 'Dorian', 'Mixolydian', 'Blues', 'Lydian', 'Phrygian', 'Harmonic minor', 'Melodic minor', 'Locrian', 'Harmonic major', 'Whole tone', 'Phrygian dominant', 'Hungarian minor', 'Diminished (W-H)', 'Diminished (H-W)', 'Chromatic'];
const CATS = { interval: { label: 'Intervals' }, chord: { label: 'Chords' }, scale: { label: 'Scales' }, prog: { label: 'Progressions' } };
interface TrainerItemBase { id: string; label: string; short: string; intro: number; }
interface IntervalTrainerItem extends TrainerItemBase { cat: 'interval'; semi: number; }
interface ChordTrainerItem extends TrainerItemBase { cat: 'chord'; ref: theory.ChordTemplate; }
interface ScaleTrainerItem extends TrainerItemBase { cat: 'scale'; name: string; }
interface ProgTrainerItem extends TrainerItemBase { cat: 'prog'; ref: theory.ProgressionTemplate; }
type TrainerItem = IntervalTrainerItem | ChordTrainerItem | ScaleTrainerItem | ProgTrainerItem;
const ITEMS: TrainerItem[] = [];
const ITEM_BY_ID: Record<string, TrainerItem> = {};
INTRO_IV.forEach((semi, i) => { const iv = INTERVALS.find((x) => x.semi === semi); if (!iv)
    return; ITEMS.push({ id: 'iv:' + semi, cat: 'interval', semi, label: iv.name, short: iv.short, intro: i }); });
INTRO_CH.forEach((sym, i) => { const c = CHORDS.find((x) => x.symbol === sym); if (c)
    ITEMS.push({ id: 'ch:' + sym, cat: 'chord', ref: c, label: c.name, short: sym, intro: 100 + i }); });
INTRO_SC.forEach((nm, i) => { if (SCALES[nm])
    ITEMS.push({ id: 'sc:' + nm, cat: 'scale', name: nm, label: nm, short: nm, intro: 200 + i }); });
PROGS.forEach((p, i) => { ITEMS.push({ id: 'pr:' + p.name, cat: 'prog', ref: p, label: p.name, short: p.name, intro: 300 + i }); });
ITEMS.forEach((it) => ITEM_BY_ID[it.id] = it);
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
type IntervalStyle = 'both' | 'melodic' | 'harmonic';
type ChordTier = 'triads' | 'sevenths' | 'all';
type ScaleTier = 'core' | 'modes' | 'all';
type MelodyDifficulty = 'easy' | 'medium' | 'advanced';
const SCALE_EAR_POOL = ['Major (Ionian)', 'Aeolian (Natural minor)', 'Dorian', 'Mixolydian', 'Phrygian', 'Lydian', 'Major pentatonic', 'Minor pentatonic', 'Blues', 'Harmonic minor', 'Whole tone'];
const CHORD_TIER_TRIADS = new Set(['maj', 'm', 'dim', 'aug']);
const CHORD_TIER_SEVENTHS = new Set(['maj', 'm', 'dim', 'aug', 'sus2', 'sus4', '6', 'm6', 'maj7', '7', 'm7', 'mMaj7', 'm7♭5', 'dim7']);
const SCALE_TIER_CORE = new Set(['Major (Ionian)', 'Aeolian (Natural minor)', 'Harmonic minor', 'Melodic minor']);
const SCALE_TIER_MODES = new Set([
    'Major (Ionian)', 'Aeolian (Natural minor)', 'Harmonic minor', 'Melodic minor',
    'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Locrian', 'Major pentatonic', 'Minor pentatonic', 'Blues',
]);
function chordMatchesTier(symbol: string, tier: ChordTier = 'all') {
    if (tier === 'triads') return CHORD_TIER_TRIADS.has(symbol);
    if (tier === 'sevenths') return CHORD_TIER_SEVENTHS.has(symbol);
    return true;
}
function scaleMatchesTier(name: string, tier: ScaleTier = 'all') {
    if (tier === 'core') return SCALE_TIER_CORE.has(name);
    if (tier === 'modes') return SCALE_TIER_MODES.has(name);
    return true;
}
function scaleEarOptions(correct: string) {
    const tier = SES.targeted?.cat === 'scale' ? (SES.targeted.scaleTier ?? prScaleTier) : 'all';
    const allowed = SCALE_EAR_POOL.filter((n) => n === correct || scaleMatchesTier(n, tier));
    let pool = allowed.filter((n) => n !== correct);
    pool = shuffle(pool).slice(0, 6);
    pool.push(correct);
    return shuffle(pool);
}
function chordEarOptions(correctItem: ChordTrainerItem) {
    const tier = SES.targeted?.cat === 'chord' ? (SES.targeted.chordTier ?? prChordTier) : 'all';
    const others = ITEMS.filter((x): x is ChordTrainerItem => x.cat === 'chord' && x.short !== correctItem.short && chordMatchesTier(x.short, tier));
    const same = shuffle(others.filter((x) => x.ref.pcset.length === correctItem.ref.pcset.length));
    const rest = shuffle(others.filter((x) => x.ref.pcset.length !== correctItem.ref.pcset.length));
    return shuffle(same.concat(rest).slice(0, 7).concat([correctItem]));
}
const PLACEMENT = ['iv:7', 'iv:5', 'iv:4', 'iv:3', 'iv:12', 'ch:maj', 'ch:m', 'ch:maj7', 'ch:7', 'sc:Major (Ionian)', 'sc:Aeolian (Natural minor)', 'pr:I–IV–V'];
function boxOf(id: string|number) { return srsBox(data.srs, id); }
function isDue(id: string|number) { return srsIsDue(data.srs, id, todayN()); }
function isNew(id: string|number) { return srsIsNew(data.srs, id); }
function dueItems() { return srsDueItems(ITEMS, data.srs, todayN()); }
function newItemsAvail() { return srsNewItems(ITEMS, data.srs); }
// New concepts still allowed today: the daily quota minus those already introduced today (across sessions).
function newQuotaLeft() { return srsNewQuotaLeft(data, data.settings.newPerDay, todayN()); }
function masteredCount() { return srsMasteredCount(ITEMS, data.srs); }
/* ============================================================================
   SESSION ENGINE  (interleaved, adaptive, with feedback + elaboration)
   ============================================================================ */
interface EarKeysNote { m: number; t: number; }
type EarKeysPrompt = { kind: 'iv'; target: number[]; n: number; } | { kind: 'ch'; target: number[]; inv: number; pcs: number[]; n: number; } | { kind: 'mel'; target: number[]; n: number; };
type EarKeysState = EarKeysPrompt & { tries: number; seq: EarKeysNote[]; off: number; armAt: number; goT: ReturnType<typeof setTimeout> | number; won: boolean; warned: boolean; played?: number[]; };
// dir: an interval by ear played downwards ('desc'); without it, upwards.
interface TrainerQuestion { it: TrainerItem; mode: string; key: number; idx: number; anchor: number | null; missed: boolean; hinted: boolean; offs?: number[]; ek?: EarKeysState | null; given?: TrainerGiven | null; wasWrong?: boolean; dir?: 'asc' | 'desc'; ivStyle?: IntervalStyle; placementKnown?: boolean; verdictText?: () => string; }
// A wrong answer: what was given against what was expected, both sounds for Hear both, and the item taken for this one (`pair`).
interface TrainerGiven { text: () => string; given: FeedbackSketch; expected: FeedbackSketch; pair?: string; }
// dir: the Direction an Intervals by-ear drill plays its intervals in ('both' picks one per question).
interface TrainerSessionTarget { cat: string; mode: string; key: string; dir?: IntervalDirection; ivStyle?: IntervalStyle; chordTier?: ChordTier; scaleTier?: ScaleTier; melDiff?: MelodyDifficulty; melLen?: number | 'auto'; melScale?: string; techKind?: TechniqueKind; techOctaves?: 1 | 2; }
// contrast: a short drill on two items the last session mixed up (its question order, by item id).
interface TrainerSessionState { active: boolean; queue: (TrainerQuestion | undefined)[]; idx: number; correct: number; total: number; q: TrainerQuestion | null; answered: boolean; targeted: TrainerSessionTarget | null; placement: boolean; promptT: ReturnType<typeof setTimeout> | 0; contrast: { a: string; b: string; order: string[] } | null; }
const SES: TrainerSessionState = { active: false, queue: [], idx: 0, correct: 0, total: 0, q: null, answered: false, targeted: null, placement: false, promptT: 0, contrast: null };
// Which items this session took for which (kept in memory only; a new session, but not its contrast drill, starts it over).
const confusions = new ConfusionLog();
let sesAnswerReplay: ReturnType<typeof setTimeout> | undefined;
function sesStopAnswerReplay() { clearTimeout(sesAnswerReplay); sesAnswerReplay = undefined; }
function sesStopPrompt() { clearTimeout(SES.promptT); SES.promptT = 0; }
function sesPrompt(q: TrainerQuestion, play: () => void) { sesStopPrompt(); SES.promptT = setTimeout(() => { SES.promptT = 0; if (SES.active && SES.q === q && !SES.answered)
    play(); }, 250); }
function buildQueue() {
    const goal = data.settings.goal;
    const due = dueItems().slice(0, goal);
    const fresh = newItemsAvail().slice(0, newQuotaLeft());
    let pool = [...due];
    for (const f of fresh) {
        if (pool.length >= goal)
            break;
        pool.push(f);
    }
    if (pool.length < goal) { // top up with the weakest seen items for extra retrieval practice
        const weak = ITEMS.filter((it) => !isNew(it.id) && !isDue(it.id)).sort((a, b) => boxOf(a.id) - boxOf(b.id));
        for (const w of weak) {
            if (pool.length >= goal)
                break;
            if (!pool.includes(w))
                pool.push(w);
        }
    }
    let qs: TrainerQuestion[] = shuffle(pool).map(makeQuestion);
    // interleave: avoid two same-category in a row when possible
    for (let i = 1; i < qs.length; i++) {
        if (qs[i].it.cat === qs[i - 1].it.cat) {
            const j = qs.findIndex((q, k) => k > i && q.it.cat !== qs[i - 1].it.cat);
            if (j > -1) {
                [qs[i], qs[j]] = [qs[j], qs[i]];
            }
        }
    }
    return qs;
}
function makeQuestion(it: TrainerItem): TrainerQuestion {
    const b = boxOf(it.id);
    const forced = SES.targeted && SES.targeted.mode;
    let mode: string;
    if (SES.placement)
        mode = 'ear'; // placement probes real by-ear knowledge
    else if (forced)
        mode = forced; // targeted practice honours the chosen mode
    else if (it.cat === 'scale' || it.cat === 'prog')
        mode = b >= 3 ? 'ear' : 'play';
    else
        mode = b >= 2 ? 'ear' : 'play'; // desirable difficulty: recall-by-sound once recognised-by-doing
    let key: number;
    if (SES.targeted && SES.targeted.key != null && SES.targeted.key !== 'all')
        key = (+SES.targeted.key) || 0; // honour the key picked in Practice
    else
        key = b < 1 ? randItem([0, 7, 5, 2, 9]) : Math.floor(Math.random() * 12); // start in friendly keys
    const q: TrainerQuestion = { it, mode, key, idx: 0, anchor: null, missed: false, hinted: false };
    const ivStyle = it.cat === 'interval' && mode === 'ear' ? (SES.targeted?.ivStyle ?? 'both') : undefined;
    if (ivStyle)
        q.ivStyle = ivStyle;
    const dir = it.cat === 'interval' && mode === 'ear' ? SES.targeted?.dir : undefined;
    if (dir)
        q.dir = ivStyle === 'harmonic' ? 'asc' : (dir === 'both' ? randItem<'asc' | 'desc'>(['asc', 'desc']) : dir);
    return q;
}
function startSession(targeted: TrainerSessionTarget|null, contrast: TrainerSessionState['contrast'] = null) {
    if (practiceHintPreview || songBook.isPreviewing()) stopPreviews();
    ensureAudio();
    sesStopPrompt();
    sesStopAnswerReplay();
    clearTimeout(evalTimer ?? undefined);
    evalTimer = null;
    if (accomp.on)
        accompStop(); // Play along is not a drill
    SES.targeted = targeted || null;
    SES.placement = false;
    SES.contrast = targeted ? contrast : null;
    if (!SES.contrast)
        confusions.clear();
    contrastOfferHide();
    SES.queue = targeted ? Array.from({ length: 9999 }) : buildQueue(); // targeted = endless
    if (!SES.queue.length) {
        refreshToday();
        return;
    }
    SES.idx = 0;
    SES.correct = 0;
    SES.total = 0;
    SES.active = true;
    openSessionUI();
    nextQuestion();
}
function startPlacement() {
    ensureAudio();
    sesStopPrompt();
    sesStopAnswerReplay();
    clearTimeout(evalTimer ?? undefined);
    evalTimer = null;
    SES.targeted = null;
    SES.placement = true;
    SES.contrast = null;
    confusions.clear();
    contrastOfferHide();
    SES.queue = PLACEMENT.map((id) => ITEM_BY_ID[id]).filter(Boolean).map(makeQuestion);
    SES.idx = 0;
    SES.correct = 0;
    SES.total = 0;
    SES.active = true;
    openSessionUI();
    nextQuestion();
}
function sesHome() { return SES.targeted ? 'practice' : 'today'; }
function openSessionUI() {
    const ses = byId('session');
    if (SES.targeted) {
        byId('view-practice').appendChild(ses);
        byId('pr-home').style.display = 'none';
    }
    else {
        byId('view-today').insertBefore(ses, byId('summary'));
        byId('pr-home').style.display = '';
    }
    byId('today-home').style.display = 'none';
    byId('summary').style.display = 'none';
    ses.style.display = 'block';
    ses.classList.add('on');
    dockSync();
    syncMobileStartBars();
    reflowKeys();
    requestAnimationFrame(() => { if (SES.active)
        ses.scrollIntoView({ block: 'start', behavior: 'instant' }); });
}
function endSession(toSummary: boolean) {
    const wasPlacement = SES.placement;
    const completedPlacement = wasPlacement && SES.queue.length > 0 && SES.total === SES.queue.length;
    if (completedPlacement) {
        for (const q of SES.queue) {
            if (!q) continue;
            const known = q.placementKnown === true;
            seedPlacement(q.it.id, known);
            creditReview(known);
        }
        data.placed = true;
        saveAll();
    }
    sesStopPrompt();
    sesStopAnswerReplay();
    clearTimeout(evalTimer ?? undefined);
    evalTimer = null;
    ekStop(SES.q);
    ekUiReset();
    techniqueStop(techniqueHost);
    const contrastRun = SES.contrast;
    SES.contrast = null;
    SES.active = false;
    SES.answered = true;
    SES.q = null;
    SES.placement = false;
    byId('session').style.display = 'none';
    byId('session').classList.remove('on');
    dockSync(); // keys a drill opened fold back to the saved choice
    syncMobileStartBars();
    kbClearAll();
    releaseLiveInput();
    stopMetro();
    stopDrone();
    if (SES.targeted) {
        if (!contrastRun)
            prRecordDrill(); // a contrast drill leaves the last-drill record alone: nothing new is saved
        byId('pr-home').style.display = '';
        renderPracticeLast();
        contrastOffer(byId('pr-last'), contrastRun ? { correct: SES.correct, total: SES.total } : null);
        if (toSummary)
            prFocusAfterDrill();
        return;
    }
    if (toSummary && (completedPlacement || (!wasPlacement && SES.total > 0))) {
        showSummary(completedPlacement);
        contrastOffer(byId('sum-note'), null);
    }
    else {
        byId('today-home').style.display = 'block';
        refreshToday();
        if (toSummary) byId(wasPlacement ? 'placeBtn' : 'startBtn').focus();
    }
}
function nextQuestion() {
    if ((!SES.targeted && SES.idx >= SES.queue.length) || (SES.contrast && SES.total >= SES.contrast.order.length)) {
        endSession(true);
        return;
    }
    byId('q-both').hidden = true;
    sesStopPrompt();
    ekStop(SES.q);
    kbClearAll();
    SES.answered = false;
    if (SES.targeted && SES.targeted.cat === TECHNIQUE_TOPIC) {
        // The scale and arpeggio drill keeps its own runs; the placeholder question only keeps the keys open (Play it).
        SES.q = { it: TECHNIQUE_ITEM, mode: 'play', key: 0, idx: 0, anchor: null, missed: false, hinted: false };
        byId('ses-progress').style.width = '0%';
        const { techKind, techOctaves } = SES.targeted;
        SES.targeted.techKind = undefined;
        SES.targeted.techOctaves = undefined;
        techniquePresent(techniqueHost, SES.targeted.key, techKind, techOctaves);
        dockSync();
        return;
    }
    techniqueStop(techniqueHost);
    const q = SES.targeted ? makeQuestion(pickTargetedItem()) : SES.queue[SES.idx];
    if (!q)
        return;
    SES.q = q;
    byId('ses-progress').style.width = SES.targeted ? '0%' : (100 * SES.idx / SES.queue.length) + '%';
    byId('ses-count').textContent = SES.targeted ? ('#' + (SES.total + 1) + (SES.total ? ' · ' + SES.correct + '/' + SES.total + ' ✓' : '')) : ((SES.idx + 1) + '/' + SES.queue.length);
    if (SES.contrast) {
        byId('ses-progress').style.width = (100 * SES.total / SES.contrast.order.length) + '%';
        byId('ses-count').textContent = (SES.total + 1) + '/' + SES.contrast.order.length;
    }
    byId('q-verdict').textContent = '';
    byId('q-verdict').className = 'verdict';
    byId('q-elab').textContent = '';
    byId('q-elab').classList.remove('show');
    byId('q-next').hidden = true;
    byId('q-reveal').hidden = false;
    byId('q-answers').hidden = true;
    byId('q-answers').innerHTML = '';
    presentQuestion(q);
}
/* Scale and arpeggio drill (technique-drill.ts): a targeted topic, so no review, daily-goal or streak change. */
const TECHNIQUE_ITEM: ScaleTrainerItem = { id: TECHNIQUE_TOPIC, cat: 'scale', label: '', short: '', intro: 0, name: 'Major (Ionian)' };
const techniqueHost: TechniqueHost = {
    t: (key, ...args) => t(key, ...args),
    spell: (letter, acc) => spelledName(notation, letter, acc),
    mark: (midi, state) => kbState(midi, state, !!data.settings.anyOctave),
    ensureVisible: (midis) => {
        if (!midis.length || !dockShown()) return;
        if (data.settings.anyOctave) {
            dockKeyInSight(foldToView(midis[0]));
            return;
        }
        const lo = Math.min(...midis), hi = Math.max(...midis);
        const span = view.oct * 12;
        if (lo < view.low || hi > viewHigh()) {
            const targetLow = Math.max(BASE_LOW, Math.min(BASE_HIGH - span, Math.floor(lo / 12) * 12));
            if (targetLow !== view.low) {
                view.low = targetLow;
                buildKeyboard();
                repaintHeld();
            }
        }
        dockKeyInSight(lo);
    },
    clearMarks: () => kbClearAll(),
    byId,
    anyOctave: () => !!data.settings.anyOctave,
    onComplete({ clean, bpm }) {
        const log = data.practiceLog ?? (data.practiceLog = {});
        log.techRuns = (log.techRuns || 0) + 1;
        if (clean) log.techClean = (log.techClean || 0) + 1;
        if (bpm && bpm > 0) log.techBestBpm = Math.max(log.techBestBpm || 0, Math.round(bpm));
        saveAll();
    },
};
function melodyConfigForSession(diff: MelodyDifficulty = prMelDiff, lenPref: number | 'auto' = prMelLen, scalePref: string = prMelScale) {
    const baseLen = diff === 'easy' ? (3 + Math.floor(Math.random() * 2)) : diff === 'medium' ? (4 + Math.floor(Math.random() * 2)) : (5 + Math.floor(Math.random() * 3));
    const len = typeof lenPref === 'number' && lenPref >= 3 && lenPref <= 8 ? lenPref : baseLen;
    const defaultScales = diff === 'easy'
        ? ['Major (Ionian)', 'Major pentatonic']
        : diff === 'medium'
            ? ['Major (Ionian)', 'Aeolian (Natural minor)', 'Major pentatonic', 'Minor pentatonic']
            : EK_MEL_SCALES;
    const scaleNames = scalePref !== 'auto' && EK_MEL_SCALES.includes(scalePref) ? [scalePref] : defaultScales;
    const steps = diff === 'advanced' ? [-3, -2, -1, 1, 2, 3] : [-2, -1, 1, 2];
    const stepWeight = diff === 'easy' ? 4 : diff === 'medium' ? 2 : 2;
    return { len, scaleNames, steps, stepWeight };
}
function pickTargetedItem() {
    if (!SES.targeted)
        throw new Error('Étude: no targeted drill');
    const contrastItem = SES.contrast ? ITEM_BY_ID[SES.contrast.order[SES.total % SES.contrast.order.length]] : undefined;
    if (contrastItem)
        return contrastItem;
    const c = SES.targeted.cat;
    let pool: TrainerItem[];
    if (c === 'melody') {
        const cfg = melodyConfigForSession(SES.targeted.melDiff ?? prMelDiff, SES.targeted.melLen ?? prMelLen, SES.targeted.melScale ?? prMelScale);
        pool = ITEMS.filter((it): it is ScaleTrainerItem => it.cat === 'scale' && cfg.scaleNames.includes(it.name));
    } else if (c === 'chord') {
        const tier = SES.targeted.chordTier ?? prChordTier;
        pool = ITEMS.filter((it): it is ChordTrainerItem => it.cat === 'chord' && chordMatchesTier(it.short, tier));
    } else if (c === 'scale') {
        const tier = SES.targeted.scaleTier ?? prScaleTier;
        pool = ITEMS.filter((it): it is ScaleTrainerItem => it.cat === 'scale' && scaleMatchesTier(it.name, tier));
    } else {
        pool = ITEMS.filter((it) => it.cat === c); // weakness-weighted
    }
    const w = pool.map((it) => { const s = data.srs[it.id] || { box: 0 }; return 1 / (1 + s.box); });
    let tot = w.reduce((a, b) => a + b, 0), r = Math.random() * tot;
    for (let i = 0; i < pool.length; i++) {
        r -= w[i];
        if (r <= 0)
            return pool[i];
    }
    return pool[0];
}
function presentQuestion(q: TrainerQuestion) {
    ekUiReset();
    const it = q.it;
    byId('q-cat').textContent = catLabel(it.cat);
    const playLbl = { interval: t('play_interval'), chord: t('play_chord'), scale: t('play_scale'), prog: t('play_prog') };
    byId('q-mode').textContent = q.mode === 'ear' ? t(ekWanted(q) ? 'ek_mode' : 'listen_answer') : playLbl[it.cat];
    byId('q-replay').hidden = q.mode !== 'ear';
    ekToggleSync(q);
    if (q.mode === 'ear') {
        presentEar(q);
    }
    else {
        presentPlay(q);
    }
    dockSync(); // each question may answer on the keys or not
}
function earRoot(q: { key: number; }) { return theory.practiceTonicMidi(q.key, 'near-middle-c'); }
function renderPlayPrompt(q: TrainerQuestion) {
    const it = q.it, root = rootName(q.key);
    const [label, sub] = it.cat === 'interval' ? [ivName(it.semi), t('above') + ' ' + root]
        : it.cat === 'chord' ? [formatChord(root, dispSym(it.short)), chordDisp(it.ref)]
        : it.cat === 'scale' ? [root + ' ' + scaleDisp(it.name), t('ascending')]
        : [progDisp(it.ref.name), t('in_key') + ' ' + root];
    byId('q-prompt').innerHTML = label + ' <span class="sub">' + sub + '</span>';
}
function presentPlay(q: TrainerQuestion) {
    renderPlayPrompt(q);
    const it = q.it;
    if (it.cat === 'scale') {
        q.offs = SCALES[it.name].concat([12]);
        q.anchor = null;
        q.idx = 0;
        if (data.settings.metronome) startMetro();
        if (data.settings.drone) startDrone(q.key);
    }
    else if (it.cat === 'prog') {
        q.idx = 0;
        neutral(() => it.ref.chords.map(ch => formatChord(rootName((q.key + ch[0]) % 12), dispSym(ch[1]))).join('  ·  '));
        showProgTarget(q);
    }
}
function earOptionLabel(q: TrainerQuestion, key: string) {
    switch (q.it.cat) {
        case 'interval': {
            const iv = INTERVALS.find(interval => String(interval.semi) === key);
            return iv ? iv.short + ' · ' + ivName(iv.semi) : key;
        }
        case 'chord': return key + ' · ' + chordDisp(CHORDS.find(chord => chord.symbol === key));
        case 'scale': return scaleDisp(key);
        case 'prog': return progDisp(key);
        default: return key;
    }
}
function refreshSessionCopy() {
    if (!SES.active) return;
    if (SES.targeted?.cat === TECHNIQUE_TOPIC) {
        techniqueRefresh(techniqueHost);
        return;
    }
    const q = SES.q;
    if (!q) return;
    if (q.mode === 'ear') {
        byId('q-mode').textContent = t(q.ek ? 'ek_mode' : 'listen_answer');
        if (q.ek) {
            renderEarKeysPrompt(q, q.ek);
            byId('q-ekhint').textContent = t('ek_hint_' + q.ek.kind);
        } else {
            byId('q-cat').textContent = catLabel(q.it.cat);
            byId('q-prompt').textContent = t('listen');
            queryAllHtml(byId('q-answers'), 'button[data-k]').forEach(button => {
                button.textContent = earOptionLabel(q, button.dataset.k ?? '');
            });
        }
    } else {
        byId('q-cat').textContent = catLabel(q.it.cat);
        byId('q-mode').textContent = t({ interval: 'play_interval', chord: 'play_chord', scale: 'play_scale', prog: 'play_prog' }[q.it.cat]);
        renderPlayPrompt(q);
    }
    if (q.verdictText) byId('q-verdict').textContent = q.verdictText();
    if (SES.answered) showElaboration(q);
}
function presentEar(q: TrainerQuestion) {
    ekStop(q);
    q.ek = null;
    ekUiReset();
    if (ekWanted(q)) {
        presentEarKeys(q);
        return;
    }
    const it = q.it;
    byId('q-prompt').textContent = t('listen');
    byId('q-answers').hidden = false;
    const box = byId('q-answers');
    box.innerHTML = '';
    let opts: (number | string)[] = [];
    if (it.cat === 'interval') {
        opts = INTERVALS.map(iv => iv.semi);
        sesPrompt(q, () => playIvDir(earRoot(q), it.semi, q.dir ?? 'asc', q.ivStyle ?? 'both'));
    }
    else if (it.cat === 'chord') {
        opts = (SES.contrast ? ITEMS.filter((x): x is ChordTrainerItem => x.cat === 'chord') : chordEarOptions(it)).map(x => x.short);
        sesPrompt(q, () => playChordMidis(it.ref.intervals.map((i) => earRoot(q) + i), true));
    }
    else if (it.cat === 'scale') {
        opts = SES.contrast ? Object.keys(SCALES) : scaleEarOptions(it.name);
        sesPrompt(q, () => playScaleNotes(theory.practiceTonicMidi(q.key), SCALES[it.name], true));
    }
    else if (it.cat === 'prog') {
        opts = PROGS.map(p => p.name);
        sesPrompt(q, () => playProg(q.key, it.ref));
    }
    if (SES.contrast) // a contrast drill offers just the two answers it compares
        opts = opts.filter((o) => SES.contrast && [SES.contrast.a, SES.contrast.b].includes(earOptionId(it.cat, o)));
    opts.forEach((o) => { const b = (document).createElement('button'); b.className = 'chip'; b.dataset.k = String(o); b.textContent = earOptionLabel(q, String(o)); b.onclick = () => answerEar(q, o, b); box.appendChild(b); });
}
function playProg(rootPc: number, prog: theory.ProgressionTemplate) { ensureAudio(); stopPreviews(); if (!audioEngine.context)
    return; const t = audioEngine.context.currentTime; prog.chords.forEach((ch, i: number) => { const root = 60 + ((rootPc + ch[0]) % 12), tpl = progChordTpl(ch[1]); if (!tpl)
    return; tpl.intervals.forEach((iv) => previewNote(root + iv, t + i * .9, .8)); }); }
function showProgTarget(q: TrainerQuestion) { kbClear('target'); if (q.it.cat !== 'prog')
    return; const ch = q.it.ref.chords[q.idx], root = 60 + ((q.key + ch[0]) % 12), tpl = progChordTpl(ch[1]); if (!tpl)
    return; tpl.intervals.forEach((iv) => kbState(root + iv, 'target', true)); }
function playQuestionSound(q: TrainerQuestion) {
    const it = q.it;
    if (q.ek) {
        if (SES.answered)
            ekSound(q);
        else
            ekPlay(q);
        return;
    }
    if (it.cat === 'interval')
        playIvDir(earRoot(q), it.semi, q.dir ?? 'asc', q.ivStyle ?? 'both');
    else if (it.cat === 'chord')
        playChordMidis(it.ref.intervals.map((i) => earRoot(q) + i), true);
    else if (it.cat === 'scale')
        playScaleNotes(theory.practiceTonicMidi(q.key), SCALES[it.name], true);
    else if (it.cat === 'prog')
        playProg(q.key, it.ref);
}
function answerEar(q: TrainerQuestion, k: number | string, btn: HTMLButtonElement) {
    if (SES.answered)
        return;
    const it = q.it;
    let ok: boolean;
    if (it.cat === 'interval')
        ok = k === it.semi;
    else if (it.cat === 'chord')
        ok = k === it.short;
    else if (it.cat === 'scale')
        ok = k === it.name;
    else
        ok = k === it.ref.name;
    if (ok) {
        btn.classList.add('correct');
        resolve(q, true);
    }
    else {
        btn.classList.add('wrong');
        q.missed = true;
        markEarCorrect(q);
        q.given = givenByEar(q, k);
        resolve(q, false);
    }
}
function markEarCorrect(q: TrainerQuestion) { const it = q.it; const key = it.cat === 'interval' ? String(it.semi) : it.cat === 'chord' ? it.short : it.cat === 'scale' ? it.name : it.ref.name; [...byId('q-answers').children].forEach((b) => { if (b instanceof HTMLElement && b.dataset.k === key)
    b.classList.add('correct'); }); }
/* ---------- BY EAR, ON THE KEYS: hear it, then play it back (intervals, chords in any inversion, short tonal melodies) ----------
   The prompt plays first; notes that arrive before it ends are ignored (armAt), so nothing the listener does while it sounds is
   graded. Octave policy: the start note may be played in any octave and everything after it is measured from it, so an interval
   keeps its exact size, a melody keeps its exact shape, and a chord keeps its pitch classes with the written lowest note.
   A wrong attempt is a lapse for the schedule but can be retried (up to EK_TRIES) after listening again. */
const EK_TRIES = 3, EK_MEL_SCALES = ['Major (Ionian)', 'Aeolian (Natural minor)', 'Harmonic minor', 'Major pentatonic', 'Minor pentatonic'];
const EK_CHORD_GAP = 300; // ms: a key joins the chord if another chord key is still down or it lands this close to the previous one
function ekForced() { return !!(SES.targeted && SES.targeted.cat === 'melody'); }
function ekWanted(q: TrainerQuestion | null) { return !!q && q.mode === 'ear' && !SES.placement && !SES.contrast && q.it.cat !== 'prog' && (ekForced() || !!data.settings.earKeys); }
// Spell like the key: minor-flavoured chords and scales on D, G, C, F, B♭, E♭ use flats, as do the flat major keys and the flat intervals.
function ekFlat(q: TrainerQuestion) {
    const it = q.it, set = it.cat === 'chord' ? it.ref.pcset : it.cat === 'scale' ? SCALES[it.name] : null;
    if (set && set.includes(3) && !set.includes(4))
        return [0, 2, 3, 5, 7, 10].includes(q.key);
    return isFlatKey(q.key) || (it.cat === 'interval' && [1, 3, 8, 10].includes(it.semi));
}
function ekName(q: TrainerQuestion, m: number) { return noteName(m, ekFlat(q)); }
function ekToggleSync(q: TrainerQuestion | null) {
    const box = byId('q-ansmode');
    box.hidden = !(q && q.mode === 'ear' && !SES.placement && q.it.cat !== 'prog' && !ekForced());
    box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', (b.dataset.v === 'keys') === !!data.settings.earKeys ? 'true' : 'false'));
}
function ekUiReset() { byId('q-ekhint').textContent = ''; byId('q-ekprog').innerHTML = ''; byId('q-ekreset').hidden = true; }
function ekStop(q: TrainerQuestion | null) { if (q && q.ek)
    clearTimeout(q.ek.goT); }
function ekBuild(q: TrainerQuestion): EarKeysPrompt {
    const it = q.it;
    if (it.cat === 'interval') {
        const r = earRoot(q);
        return { kind: 'iv', target: q.dir === 'desc' ? [r + it.semi, r] : [r, r + it.semi], n: 2 };
    }
    if (it.cat === 'chord') {
        const ivs = [...new Set(it.ref.intervals)].sort((a, b) => a - b), n = ivs.length;
        const inv = n <= 4 && Math.random() < .6 ? 1 + Math.floor(Math.random() * (n - 1)) : 0; // triads and sevenths come in every inversion
        let ns = ivs.map((i) => 48 + q.key + i);
        for (let k = 0; k < inv; k++) {
            const low = ns.shift();
            if (low !== undefined)
                ns.push(low + 12);
        }
        if (ns[0] < 52)
            ns = ns.map((m) => m + 12);
        if (ns[ns.length - 1] > 88)
            ns = ns.map((m) => m - 12);
        const pcs = [...new Set(ns.map(pc))].sort((a, b) => a - b);
        return { kind: 'ch', target: ns, inv, pcs, n: pcs.length };
    }
    // a short tonal melody in the item's scale: starts on the tonic, moves mostly by step, ends on a stable degree
    if (it.cat !== 'scale')
        throw new Error('Étude: no ear-keys prompt for a ' + it.cat + ' item');
    const cfg = SES.targeted?.cat === 'melody'
        ? melodyConfigForSession(SES.targeted.melDiff ?? prMelDiff, SES.targeted.melLen ?? prMelLen, SES.targeted.melScale ?? prMelScale)
        : { len: 3 + Math.floor(Math.random() * 3), scaleNames: EK_MEL_SCALES, steps: [-2, -1, 1, 2], stepWeight: 2 };
    const offs = SCALES[it.name], N = offs.length, ton = earRoot(q), len = cfg.len;
    const at = (d: number) => ton + offs[((d % N) + N) % N] + 12 * Math.floor(d / N), stable = (d: number) => [0, 3, 4, 7].includes(pc(at(d) - ton));
    let d = 0;
    const ds = [0];
    for (let i = 1; i < len; i++) {
        const last = i === len - 1, opts: number[] = [];
        cfg.steps.forEach((s) => {
            const nd = d + s;
            if (nd < -2 || nd > N + 2 || (last && !stable(nd)))
                return;
            const w = Math.abs(s) === 1 ? cfg.stepWeight : Math.abs(s) === 2 ? 2 : 1;
            for (let k = 0; k < w; k++) opts.push(nd);
        });
        if (!opts.length)
            opts.push(Math.abs(d) <= Math.abs(N - d) ? 0 : N);
        d = randItem(opts);
        ds.push(d);
    }
    const target = ds.map(at);
    return { kind: 'mel', target, n: target.length };
}
function presentEarKeys(q: TrainerQuestion) {
    const ek = q.ek = Object.assign(ekBuild(q), { tries: 0, seq: [], off: 0, armAt: Infinity, goT: 0, won: false, warned: false });
    byId('q-answers').hidden = true;
    byId('q-answers').innerHTML = '';
    renderEarKeysPrompt(q, ek);
    byId('q-ekhint').textContent = t('ek_hint_' + ek.kind);
    byId('q-ekreset').hidden = false;
    ekProg(q, 0);
    ekPlay(q);
}
function renderEarKeysPrompt(q: TrainerQuestion, ek: EarKeysState) {
    const it = q.it;
    const st = ekName(q, ek.target[0]), sub = ek.kind === 'iv' ? t('ek_sub_start', st) : ek.kind === 'ch' ? t('ek_sub_bass', st, ek.n) : t('ek_sub_mel', rootName(q.key) + ' ' + scaleDisp(it.cat === 'scale' ? it.name : ''), ek.n);
    byId('q-prompt').innerHTML = t('ek_p_' + ek.kind) + ' <span class="sub">' + sub + '</span>';
    byId('q-cat').textContent = ek.kind === 'mel' ? t('ek_cat_mel') : catLabel(it.cat);
}
// Plays the prompt and returns when (seconds after now) its last note starts.
function ekSound(q: TrainerQuestion) {
    const ek = q.ek;
    ensureAudio();
    if (!audioEngine.context)
        return 0;
    stopPreviews();
    if (!ek)
        return 0;
    const t0 = audioEngine.context.currentTime + .25, ms = ek.target;
    let last: number;
    if (ek.kind === 'iv') {
        const style = q.ivStyle ?? 'both';
        if (style === 'harmonic') {
            previewNote(ms[0], t0, .8);
            previewNote(ms[1], t0, .8);
            last = 0;
        }
        else if (style === 'melodic') {
            previewNote(ms[0], t0, .45);
            previewNote(ms[1], t0 + .5, .45);
            last = .5;
        }
        else {
            previewNote(ms[0], t0, .45);
            previewNote(ms[1], t0 + .5, .45);
            previewNote(ms[0], t0 + 1.15, .8);
            previewNote(ms[1], t0 + 1.15, .8);
            last = 1.15;
        }
    }
    else if (ek.kind === 'ch') {
        ms.forEach((m, i: number) => previewNote(m, t0 + i * .16, .4));
        const bt = ms.length * .16 + .1;
        ms.forEach((m) => previewNote(m, t0 + bt, 1.1));
        previewNote(ms[0], t0 + bt + 1.35, .6);
        last = bt + 1.35;
    }
    else {
        previewNote(ms[0], t0, .5);
        ms.forEach((m, i: number) => previewNote(m, t0 + .85 + i * .5, .45));
        last = .85 + (ms.length - 1) * .5;
    }
    return .25 + last;
}
function ekPlay(q: TrainerQuestion) {
    const ek = q.ek;
    if (!ek || SES.answered)
        return;
    const wait = (ekSound(q) + .3) * 1000;
    ek.armAt = performance.now() + wait;
    ek.seq = [];
    ek.warned = false;
    clearTimeout(ek.goT);
    kbClear('good');
    kbClear('bad');
    kbClear('target');
    kbState(ek.target[0], 'target', true);
    ekProg(q, 0);
    neutral(() => t('ek_listen'));
    ek.goT = setTimeout(() => { if (SES.q === q && !SES.answered && !ek.seq.length)
        neutral(() => t('ek_go')); }, wait);
}
function ekProg(q: TrainerQuestion, k: number) { const ek = q.ek; byId('q-ekprog').innerHTML = ek ? Array.from({ length: ek.n }, (_, i) => '<i' + (i < k ? ' class="on"' : '') + '></i>').join('') : ''; }
function ekFlash(ms: number[], s: string) { ms.forEach((m) => kbState(m, s, true)); }
function ekOn(q: TrainerQuestion, m: number | null | undefined) {
    const ek = q.ek;
    if (m == null)
        return;
    const now = performance.now();
    if (!ek)
        return;
    if (now < ek.armAt) {
        if (!ek.warned) {
            ek.warned = true;
            neutral(() => t('ek_wait'));
        }
        return;
    }
    if (ek.kind === 'mel') {
        ekMel(q, m);
        return;
    }
    if (ek.kind === 'ch') {
        const prev = ek.seq[ek.seq.length - 1];
        if (prev && !ek.seq.some((x) => held.has(x.m) && x.m !== m) && now - prev.t > EK_CHORD_GAP)
            ek.seq = [];
    }
    ek.seq.push({ m, t: now });
    scheduleEval(() => ek.kind === 'iv' ? ekIv(q) : ekCh(q), ek.kind === 'iv' ? 90 : 140);
}
function ekOff(q: TrainerQuestion, m: number) { const ek = q.ek; if (!ek || SES.answered || ek.kind !== 'ch' || !ek.seq.length)
    return; scheduleEval(() => ekCh(q), 140); }
function ekIv(q: TrainerQuestion) {
    const ek = q.ek;
    if (!ek || !SES.active || SES.answered || SES.q !== q || !ek.seq.length)
        return;
    const s = ek.seq, start = ek.target[0], semi = ek.target[1] - start; // semi < 0: a descending interval
    let a = s[0], b = s[1];
    if (b && Math.abs(b.t - a.t) <= 80 && (semi < 0 ? b.m > a.m : b.m < a.m)) {
        const x = a;
        a = b;
        b = x;
    } // struck together: the lower note is the start (the upper one when it descends)
    if (pc(a.m) !== pc(start)) {
        ekFlash([a.m], 'bad');
        setTimeout(() => { if (SES.active && SES.q === q) { kbClear('bad'); if (!SES.answered)
            kbState(start, 'target', true); } }, 420);
        ek.seq = [];
        ekProg(q, 0);
        neutral(() => t('ek_start_on', ekName(q, start)));
        return;
    }
    if (!b) {
        ekProg(q, 1);
        neutral(() => t('ek_progress', 1, 2));
        return;
    }
    if (b.m === a.m) {
        ek.seq = [a];
        return;
    }
    if (b.m - a.m === semi) {
        ekWin(q, [a.m, b.m]);
        return;
    }
    q.given = givenInterval(q, a.m, b.m, a.m);
    const wrongWay = semi < 0 ? b.m > a.m : b.m < a.m;
    ekMiss(q, [b.m], wrongWay ? t(semi < 0 ? 'ek_wrong_up' : 'ek_wrong_down') : t('ek_wrong_iv', intervalLabel(Math.abs(b.m - a.m))));
}
function ekCh(q: TrainerQuestion) {
    const ek = q.ek;
    if (!ek || ek.kind !== 'ch' || !SES.active || SES.answered || SES.q !== q || !ek.seq.length)
        return;
    const ms = [...new Set(ek.seq.map((x) => x.m))].sort((a, b) => a - b);
    const pcs = [...new Set(ms.map((m) => pc(m)))].sort((a, b) => a - b);
    const down = ms.some((m) => held.has(m));
    if (setEq(pcs, ek.pcs)) {
        if (pc(ms[0]) === pc(ek.target[0]))
            ekWin(q, ms);
        else
            ekMiss(q, [ms[0]], t('ek_wrong_inv', ekName(q, ek.target[0])));
        return;
    }
    if (!isSubset(pcs, ek.pcs)) {
        q.given = givenChord(q, ms, ek.target, null);
        ekMiss(q, ms.filter((m) => !ek.pcs.includes(pc(m))), t('ek_wrong_ch'));
        return;
    }
    ekProg(q, pcs.length);
    if (down)
        neutral(() => t('ek_keep', pcs.length, ek.n));
    else {
        ek.seq = [];
        ekProg(q, 0);
        neutral(() => t('ek_hold'));
    }
}
function ekMel(q: TrainerQuestion, m: number) {
    const ek = q.ek;
    if (!ek || !SES.active || SES.answered || SES.q !== q)
        return;
    const tg = ek.target, i = ek.seq.length;
    if (i === 0) {
        if (pc(m) !== pc(tg[0])) {
            ekFlash([m], 'bad');
            setTimeout(() => { if (SES.active && SES.q === q) { kbClear('bad'); if (!SES.answered)
                kbState(tg[0], 'target', true); } }, 420);
            neutral(() => t('ek_start_on', ekName(q, tg[0])));
            return;
        }
        ek.off = m - tg[0];
    }
    const want = tg[i] + ek.off;
    if (m !== want) {
        q.missed = true;
        q.given = givenNote(ek.seq.slice(-2).map((x) => x.m), m, want);
        ek.tries++;
        if (ek.tries >= EK_TRIES) {
            ek.seq = [];
            kbClear('good');
            ekFlash([m], 'bad');
            resolve(q, false);
            return;
        }
        ekFlash([m], 'bad');
        setTimeout(() => {
            if (SES.active && SES.q === q) {
                kbClear('bad');
                if (!SES.answered) ek.seq.forEach((x) => kbState(x.m, 'good', true));
            }
        }, 450);
        ekProg(q, ek.seq.length);
        const v = byId('q-verdict');
        v.className = 'verdict bad';
        v.textContent = t('ek_wrong_mel_keep', i + 1, t(m > want ? 'ek_high' : 'ek_low')) + ' ' + t(ek.tries === EK_TRIES - 1 ? 'ek_last' : 'ek_again');
        return;
    }
    ek.seq.push({ m, t: performance.now() });
    kbState(m, 'good', true);
    ekProg(q, ek.seq.length);
    if (ek.seq.length >= tg.length)
        ekWin(q, ek.seq.map((x) => x.m));
    else
        neutral(() => t('ek_progress', ek.seq.length, tg.length));
}
function ekWin(q: TrainerQuestion, ms: number[]) { if (!q.ek)
    return; q.ek.won = true; q.ek.played = ms; kbClear('target'); ekFlash(ms, 'good'); ekProg(q, q.ek.n); resolve(q, true); }
function ekMiss(q: TrainerQuestion, bad: number[], msg: string) {
    const ek = q.ek;
    q.missed = true;
    if (!ek)
        return;
    ek.tries++;
    ek.seq = [];
    kbClear('good');
    ekFlash(bad, 'bad');
    if (ek.tries >= EK_TRIES) {
        resolve(q, false);
        return;
    }
    setTimeout(() => { if (SES.active && SES.q === q) { kbClear('bad'); if (!SES.answered)
        kbState(ek.target[0], 'target', true); } }, 500);
    ekProg(q, 0);
    const v = byId('q-verdict');
    v.className = 'verdict bad';
    v.textContent = msg + ' ' + t(ek.tries === EK_TRIES - 1 ? 'ek_last' : 'ek_again');
}
function ekReset() { const q = SES.q; if (!q || !q.ek || SES.answered)
    return; q.ek.seq = []; kbClear('good'); kbClear('bad'); kbState(q.ek.target[0], 'target', true); ekProg(q, 0); neutral(() => t('ek_reset_msg')); }
function ekElab(q: TrainerQuestion) {
    const ek = q.ek, names = (ms: number[]) => ms.map((m) => ekName(q, m)).join(' ');
    if (!ek)
        return '';
    if (ek.kind === 'iv')
        return t('ek_el_iv', ekName(q, ek.target[0])) + ' · ' + names(ek.target);
    if (ek.kind === 'ch')
        return t('ek_el_ch', invName(ek.inv), names(ek.target));
    return t('ek_el_mel', names(ek.target));
}
/* play-mode grading via held notes */
function sesInput(midi: number) {
    if (techniqueDrillActive() && SES.targeted?.cat === TECHNIQUE_TOPIC) {
        techniqueInput(techniqueHost, midi, inputTime()); // the key's own time, less its calibrated latency
        return;
    }
    const q = SES.q;
    if (!q || SES.answered)
        return;
    if (q.ek) {
        ekOn(q, midi);
        return;
    }
    if (q.mode !== 'play')
        return;
    if (q.it.cat === 'interval')
        scheduleEval(() => gradeInterval(q), 200);
    else if (q.it.cat === 'chord')
        scheduleEval(() => gradeChord(q), 300);
    else if (q.it.cat === 'scale')
        gradeScaleNote(q, midi);
    else if (q.it.cat === 'prog')
        scheduleEval(() => gradeProgChord(q), 220);
}
function gradeInterval(q: TrainerQuestion) {
    if (!SES.active || SES.answered || SES.q !== q || q.it.cat !== 'interval')
        return;
    const ms = heldMidis().sort((a, b) => a - b);
    if (ms.length < 2)
        return;
    if (ms.length > 2) {
        neutral(() => t('just_two'));
        return;
    }
    const lo = ms[0], hi = ms[1];
    if (pc(lo) === q.key && hi - lo === q.it.semi) {
        [lo, hi].forEach((m) => kbState(m, 'good', true));
        resolve(q, true);
    }
    else {
        [lo, hi].forEach((m) => kbState(m, 'bad', true));
        setTimeout(() => { if (SES.active && SES.q === q) kbClear('bad'); }, 500);
        q.missed = true;
        q.given = givenInterval(q, lo, hi, pc(lo) === q.key ? lo : theory.practiceTonicMidi(q.key));
        resolve(q, false);
    }
}
function gradeChord(q: TrainerQuestion) {
    if (!SES.active || SES.answered || SES.q !== q || q.it.cat !== 'chord')
        return;
    const hp = heldPcs(), tpl = q.it.ref, target = chordTargetPcs(q.key, tpl);
    if (!hp.length)
        return;
    if (setEq(hp, target)) {
        const inv = inversionOf(q.key, tpl, Math.min(...heldMidis()));
        if (!data.settings.allowInv && inv !== 0) {
            neutral(() => t('root_pos', rootName(q.key)));
            return;
        }
        heldMidis().forEach((m) => kbState(m, 'good', true));
        resolve(q, true);
        return;
    }
    if (isSubset(hp, target)) {
        neutral(() => t('keep_building') + ' (' + hp.length + '/' + target.length + ')');
        return;
    }
    if (isSubset(target, hp)) {
        neutral(() => t('release_extra'));
        return;
    }
    if (hp.length >= target.length) {
        heldMidis().forEach((m) => kbState(m, 'bad', true));
        setTimeout(() => { if (SES.active && SES.q === q) kbClear('bad'); }, 500);
        q.missed = true;
        q.given = givenChord(q, heldMidis(), tpl.intervals.map((i) => theory.practiceTonicMidi(q.key) + i), null);
        resolve(q, false);
    }
}
function gradeScaleNote(q: TrainerQuestion, midi: number | null | undefined) {
    if (!SES.active || SES.answered || SES.q !== q || midi == null || !q.offs)
        return;
    if (q.idx === 0) {
        if (pc(midi) !== q.key) {
            kbState(midi, 'bad', true);
            setTimeout(() => { if (SES.active && SES.q === q) kbClear('bad'); }, 400);
            neutral(() => t('start_on', rootName(q.key)));
            return;
        }
        q.anchor = midi;
    }
    if (q.anchor === null)
        return;
    const want = q.anchor + q.offs[q.idx];
    if (midi === want) {
        kbState(midi, 'good', true);
        q.idx++;
        if (q.idx >= q.offs.length) {
            resolve(q, true);
        }
        else
            neutral(() => q.idx + ' / ' + (q.offs?.length ?? 0) + ' ✓');
    }
    else {
        kbState(midi, 'bad', true);
        setTimeout(() => { if (SES.active && SES.q === q) kbClear('bad'); }, 420);
        q.missed = true;
        q.given = givenNote(q.offs.slice(Math.max(0, q.idx - 2), q.idx).map((o) => (q.anchor ?? 0) + o), midi, want);
        resolve(q, false);
    }
}
function gradeProgChord(q: TrainerQuestion) {
    if (!SES.active || SES.answered || SES.q !== q || q.it.cat !== 'prog')
        return;
    const ch = q.it.ref.chords[q.idx], root = (q.key + ch[0]) % 12, tpl = progChordTpl(ch[1]);
    const target = chordTargetPcs(root, tpl), hp = heldPcs();
    if (!hp.length)
        return;
    if (setEq(hp, target)) {
        q.idx++;
        if (q.idx >= q.it.ref.chords.length) {
            resolve(q, true);
        }
        else {
            kbClear('target');
            neutral(() => t('prog_next_chord'));
            setTimeout(() => { if (SES.active && SES.q === q && !SES.answered) showProgTarget(q); }, 250);
        }
        return;
    }
    if (isSubset(hp, target) || isSubset(target, hp))
        return;
    if (hp.length >= target.length) {
        heldMidis().forEach((m) => kbState(m, 'bad', true));
        setTimeout(() => { if (SES.active && SES.q === q) kbClear('bad'); }, 420);
        q.missed = true;
        q.given = givenChord(q, heldMidis(), tpl ? tpl.intervals.map((i) => 60 + root + i) : [], q.idx + 1);
        resolve(q, false);
    }
}
/* ---------- error-aware feedback: what was given against what was expected (feedback.ts) ---------- */
function noteNames(ms: readonly number[]) { return ms.map((m) => rootName(pc(m))).join('–'); }
function chordLabel(rootPc: number, ref: theory.ChordTemplate) { return formatChord(rootName(rootPc), dispSym(ref.symbol)) + ' · ' + chordDisp(ref); }
// The item id an ear answer stands for, as the item list names them.
function earOptionId(cat: string, k: number | string) { return (cat === 'interval' ? 'iv:' : cat === 'chord' ? 'ch:' : cat === 'scale' ? 'sc:' : 'pr:') + k; }
function progMidis(rootPc: number, prog: theory.ProgressionTemplate) { return prog.chords.map((ch) => { const root = 60 + ((rootPc + ch[0]) % 12), tpl = progChordTpl(ch[1]); return tpl ? tpl.intervals.map((iv) => root + iv) : []; }); }
function givenByEar(q: TrainerQuestion, k: number | string): TrainerGiven | null {
    const it = q.it, pair = ITEM_BY_ID[earOptionId(it.cat, k)] ? earOptionId(it.cat, k) : undefined;
    if (it.cat === 'interval' && typeof k === 'number') {
        const r = earRoot(q), two = (semi: number) => feedbackBroken(q.dir === 'desc' ? [r + semi, r] : [r, r + semi]);
        return { text: () => t('fb_picked', ivName(k), ivName(it.semi)), given: two(k), expected: two(it.semi), pair };
    }
    if (it.cat === 'chord') {
        const ref = CHORDS.find((c) => c.symbol === k);
        if (!ref)
            return null;
        const base = earRoot(q);
        return { text: () => t('fb_picked', chordDisp(ref), chordDisp(it.ref)), given: feedbackBroken(ref.intervals.map((i) => base + i), 0.16, 1.1), expected: feedbackBroken(it.ref.intervals.map((i) => base + i), 0.16, 1.1), pair };
    }
    if (it.cat === 'scale' && typeof k === 'string' && SCALES[k]) {
        const line = (name: string) => feedbackLine(SCALES[name].concat([12]).map((o) => theory.practiceTonicMidi(q.key) + o));
        return { text: () => t('fb_picked', scaleDisp(k), scaleDisp(it.name)), given: line(k), expected: line(it.name), pair };
    }
    if (it.cat === 'prog') {
        const prog = PROGS.find((p) => p.name === k);
        if (!prog)
            return null;
        return { text: () => t('fb_picked', progDisp(prog.name), progDisp(it.ref.name)), given: feedbackChords(progMidis(q.key, prog)), expected: feedbackChords(progMidis(q.key, it.ref)), pair };
    }
    return null;
}
// Two keys for an interval question; `from` is where the expected interval is sounded (the right start note when it was played).
function givenInterval(q: TrainerQuestion, lo: number, hi: number, from: number): TrainerGiven | null {
    const it = q.it;
    if (it.cat !== 'interval')
        return null;
    const sign = q.dir === 'desc' ? -1 : 1, semi = hi - lo, rootOk = pc(lo) === q.key || (!!q.ek && pc(lo) === pc(q.ek.target[0]));
    const given = () => rootOk ? intervalLabel(Math.abs(semi)) : noteNames([lo, hi]) + ' (' + intervalLabel(Math.abs(semi)) + ')';
    const expected = () => rootOk ? ivName(it.semi) : ivName(it.semi) + ' ' + t('above') + ' ' + rootName(q.key);
    const pair = rootOk && semi * sign > 0 && ITEM_BY_ID['iv:' + Math.abs(semi)] ? 'iv:' + Math.abs(semi) : undefined;
    return { text: () => t('fb_played', given(), expected()), given: feedbackBroken([lo, hi]), expected: feedbackBroken([from, from + sign * it.semi]), pair };
}
// Keys for a chord question (or chord `chordNo` of a progression), named as a chord when they make one.
function givenChord(q: TrainerQuestion, ms: readonly number[], expectedMidis: readonly number[], chordNo: number | null): TrainerGiven | null {
    const sorted = [...ms].sort((a, b) => a - b), id = identifyChord(sorted);
    const given = () => id ? chordLabel(id.rootPc, id.chord) : t('fb_notes', noteNames(sorted));
    const it = q.it;
    let expected = () => noteNames(expectedMidis), pair: string | undefined;
    if (it.cat === 'chord' && chordNo === null) {
        const tpl = it.ref;
        expected = () => chordLabel(q.key, tpl);
        if (id && id.rootPc === q.key && ITEM_BY_ID['ch:' + id.chord.symbol])
            pair = 'ch:' + id.chord.symbol;
    }
    else if (it.cat === 'prog' && chordNo !== null) {
        const ch = it.ref.chords[chordNo - 1], tpl = ch ? progChordTpl(ch[1]) : undefined;
        if (ch && tpl)
            expected = () => chordLabel((q.key + ch[0]) % 12, tpl);
    }
    const text = () => chordNo === null ? t('fb_played', given(), expected()) : t('fb_chord_n', given(), chordNo, expected());
    return { text, given: feedbackBroken(sorted, 0.16, 1.1), expected: feedbackBroken(expectedMidis, 0.16, 1.1), pair };
}
// A wrong note in a line (scale or melody), heard after the notes before it.
function givenNote(before: readonly number[], midi: number, want: number): TrainerGiven {
    return { text: () => t('fb_note', rootName(pc(midi)), rootName(pc(want))), given: feedbackLine([...before, midi]), expected: feedbackLine([...before, want]) };
}
function playGivenAndExpected(g: TrainerGiven) {
    ensureAudio();
    stopPreviews();
    const start = audioEngine.context?.currentTime ?? 0;
    feedbackSchedule(g.given, g.expected).forEach((n) => previewNote(n.midi, start + n.at, n.dur));
}
// After a session: offer a short contrast drill when two items were mixed up more than once (and report one just finished).
function contrastOfferHide() { const box = maybeById('ses-contrast'); if (box)
    box.hidden = true; }
function contrastOffer(anchor: HTMLElement, finished: { correct: number; total: number } | null) {
    const pair = confusions.top(), a = pair ? ITEM_BY_ID[pair.expected] : undefined, b = pair ? ITEM_BY_ID[pair.given] : undefined;
    let box = maybeById('ses-contrast');
    if (!box) {
        box = document.createElement('div');
        box.id = 'ses-contrast';
        box.className = 'verdict neutral cf-offer';
        box.setAttribute('role', 'status');
    }
    anchor.after(box);
    const lines: string[] = [];
    if (finished && finished.total)
        lines.push(`<span>${rdEsc(t('cf_done', finished.correct, finished.total))}</span>`);
    if (pair && a && b)
        lines.push(`<span>${rdEsc(t('cf_offer', itemLabel(a), itemLabel(b), pair.count))}</span> <button type="button" class="btn sm primary" id="cf-start">${rdEsc(t('cf_start', CONTRAST_LENGTH))}</button>`);
    box.innerHTML = lines.join('<br>');
    box.hidden = !lines.length;
    const go = maybeById('cf-start');
    if (go && pair)
        go.onclick = () => startContrast(pair);
}
function startContrast(pair: ConfusionPair) {
    const a = ITEM_BY_ID[pair.expected], b = ITEM_BY_ID[pair.given];
    if (!a || !b || a.cat !== b.cat)
        return;
    byId('summary').style.display = 'none';
    show('practice');
    startSession({ cat: a.cat, mode: 'ear', key: 'all' }, { a: a.id, b: b.id, order: contrastOrder(a.id, b.id) });
}
function neutral(text: () => string) {
    if (SES.q) SES.q.verdictText = text;
    const v = byId('q-verdict');
    v.className = 'verdict neutral';
    v.textContent = text();
}
// The Today plan's Ear check: right answers by ear today (earDay, earToday), in any drill and in the review session.
function countEarAnswer() {
    const tn = todayN();
    if (data.earDay !== tn) {
        data.earDay = tn;
        data.earToday = 0;
    }
    data.earToday = (data.earToday || 0) + 1;
    saveSoon();
}
function resolve(q: TrainerQuestion, correct: boolean) {
    if (SES.answered)
        return;
    SES.answered = true;
    stopMetro();
    stopDrone();
    const good = correct && !q.missed;
    if (SES.placement) {
        q.placementKnown = good;
    }
    else if (!SES.targeted)
        reviewItem(q.it.id, good); // targeted drills are free practice: no schedule, daily-goal or streak change
    SES.total++;
    if (good)
        SES.correct++;
    if (good && q.mode === 'ear' && !SES.placement)
        countEarAnswer();
    const v = byId('q-verdict');
    if (correct && !q.missed) {
        v.className = 'verdict good';
        const praise = randItem(['correct1', 'correct2', 'correct3', 'correct4']);
        q.verdictText = () => t(praise);
    }
    else if (correct && q.ek) {
        v.className = 'verdict neutral';
        const tries = q.ek.tries + 1;
        q.verdictText = () => t('ek_retry_ok', tries);
    } // reproduced after a miss: counts as a lapse
    else {
        v.className = 'verdict bad';
        q.verdictText = q.given?.text ?? (() => t('notquite'));
    }
    v.textContent = q.verdictText();
    q.wasWrong = !correct;
    if (!correct && q.given && q.given.pair && !SES.placement && !SES.contrast)
        confusions.record(q.it.id, q.given.pair);
    if (q.ek) {
        ekStop(q);
        byId('q-ekreset').hidden = true;
    }
    revealAnswerKeys(q);
    showElaboration(q);
    if (!good) {
        sesStopAnswerReplay();
        sesAnswerReplay = setTimeout(() => { if (SES.active && SES.q === q && SES.answered)
            playQuestionSound(q); }, 600);
        const given = correct ? null : q.given;
        if (given) { // Hear both: the given sound, then the expected one (it replaces the replay still to come)
            const both = byId('q-both');
            both.hidden = false;
            both.onclick = () => { sesStopAnswerReplay(); playGivenAndExpected(given); };
        }
    } // let the right answer be heard, not just seen
    byId('q-reveal').hidden = true;
    byId('q-next').hidden = false;
    byId('q-next').focus();
}
function revealAnswerKeys(q: TrainerQuestion) {
    const it = q.it;
    if (q.ek) {
        if (!q.ek.won) {
            kbClear('target');
            kbClear('good');
            q.ek.target.forEach((m) => kbState(m, 'target', true));
        }
        return;
    }
    if (it.cat === 'interval') {
        const r = q.mode === 'ear' ? earRoot(q) : theory.practiceTonicMidi(q.key);
        [r, r + it.semi].forEach((m) => kbState(m, 'target', true));
    }
    else if (it.cat === 'chord') {
        const r = q.mode === 'ear' ? earRoot(q) : theory.practiceTonicMidi(q.key);
        it.ref.intervals.forEach((i) => kbState(r + i, 'target', true));
    }
    else if (it.cat === 'scale') {
        const r = theory.practiceTonicMidi(q.key);
        SCALES[it.name].concat([12]).forEach((o) => kbState(r + o, 'target', true));
    }
}
function showElaboration(q: TrainerQuestion) {
    const it = q.it, e = byId('q-elab');
    let html = '';
    if (it.cat === 'interval') {
        const s = songsFor(it.semi, q.dir ?? 'asc');
        html = '<b>' + ivName(it.semi) + '</b> = ' + it.semi + ' ' + t('el_semitones') + (s.length && !/^\(/.test(s[0]) ? ' · ' + t('el_soundslike') + ' “' + s[0] + '”' : '');
    }
    else if (it.cat === 'chord') {
        const f = feelDisp(it.short);
        html = '<b>' + formatChord(rootName(q.key), dispSym(it.short)) + '</b> = ' + chordFormula(it.ref) + (f ? ' · ' + f : '');
    }
    else if (it.cat === 'scale') {
        html = '<b>' + scaleDisp(it.name) + '</b> · ' + t('el_degrees') + ' ' + scaleFormula(SCALES[it.name]);
    }
    else if (it.cat === 'prog') {
        const chain = it.ref.chords.map((ch) => formatChord(rootName((q.key + ch[0]) % 12), dispSym(ch[1]))).join(' · '), rom = it.ref.chords.map((ch) => ch[2]).join(' · ');
        html = '<b>' + rom + '</b> — ' + chain;
    }
    if (q.ek)
        html += '<br>' + ekElab(q);
    if (q.wasWrong && q.given?.pair) {
        const other = ITEM_BY_ID[q.given.pair];
        const esc = xmlEsc;
        let diff = '';
        if (other && it.cat === 'interval' && other.cat === 'interval') {
            const cue = differentialIntervalCue(it.semi, other.semi);
            if (cue?.kind === 'interval') {
                diff = t(cue.diffSemis > 0 ? 'el_diff_iv_wider' : 'el_diff_iv_narrower', ivName(it.semi), Math.abs(cue.diffSemis), ivName(other.semi));
            }
        }
        else if (other && it.cat === 'chord' && other.cat === 'chord') {
            const cue = differentialToneCue(it.ref.intervals, other.ref.intervals);
            if (cue?.kind === 'tones') {
                const degs = (pcs: readonly number[]) => pcs.map((p) => SCALE_DEGREE_LABELS[p] ?? String(p)).join(', ') || '—';
                diff = t('el_diff_tones', formatChord(rootName(q.key), dispSym(it.short)), degs(cue.onlyExpected), degs(cue.onlyGiven), formatChord(rootName(q.key), dispSym(other.short)));
            }
        }
        else if (other && it.cat === 'scale' && other.cat === 'scale') {
            const cue = differentialToneCue(SCALES[it.name] || [], SCALES[other.name] || []);
            if (cue?.kind === 'tones') {
                const degs = (pcs: readonly number[]) => pcs.map((p) => SCALE_DEGREE_LABELS[p] ?? String(p)).join(', ') || '—';
                diff = t('el_diff_tones', scaleDisp(it.name), degs(cue.onlyExpected), degs(cue.onlyGiven), scaleDisp(other.name));
            }
        }
        if (diff)
            html += '<br><span class="elab-diff">' + esc(diff) + '</span>';
    }
    e.innerHTML = html;
    e.classList.add('show');
}
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
// The Score Player is usable once its module is mounted and its heavy score modules are in.
function scorePlayerReady() { return !!loadedFeatures.analysis && !!scorePlayer?.modulesReady(); }
function scorePlayerRoute(): AnalysisRoute { return scorePlayer?.currentRoute() ?? { kind: 'catalog' }; }

const lazyFeatureLoaders: Partial<Record<router.AppView, () => Promise<FeatureController>>> = {
    explore: async () => (await import('../features/explore/index.js')).createExploreFeature(appHost),
    sing: async () => (await import('../features/voice/index.js')).createVoiceFeature(appHost),
    learn: async () => (await import('../features/learn/index.js')).createLearnFeature(appHost),
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
        isPendingSaveProtected: () => shellPendingSaveMirror || srtPendingSaveProtected(),
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

const accompaniment = createAccompanimentController({
    host: appHost,
    isAlongWanted: () => prAlongWanted(),
    getPracticeKey: () => { const k = prChoice().key; return k === 'all' ? 0 : (+k || 0); },
    progDisp: (name) => progDisp(name),
    rootName: (p) => rootName(p),
    updatePracticeModeHint: () => updatePracticeModeHint(),
    getKeyElements: () => keyEl,
});
const accomp = accompaniment.state;
const accompStart = accompaniment.start;
const accompStop = accompaniment.stop;
const accompSync = accompaniment.sync;
const accompRestartIfPlaying = accompaniment.restartIfPlaying;
const clearAccompImproScale = accompaniment.clearImproScale;
const paintAccompImproScale = accompaniment.paintImproScale;
const renderAccompany = accompaniment.render;
const updateAccompChain = accompaniment.updateChain;

const songBook = createSongBookController({
    host: appHost,
    ivName: (semi) => ivName(semi),
    playIvDir: (root, semi, dir, style) => playIvDir(root, semi, dir, style),
    pianoEnsure: (midis) => pianoEnsure(midis),
    setHintControlPressed: (btn, pressed) => setHintControlPressed(btn, pressed),
});
const renderSongs = songBook.render;

function teardownView(prev: string, next: string) {
    if (prev !== next && activeFeatureAbort) {
        activeFeatureAbort.abort();
        activeFeatureAbort = null;
    }
    if (prev !== next && isAppView(prev) && loadedFeatures[prev]) {
        loadedFeatures[prev]?.leave(isAppView(next) ? next : 'today');
    }
    if (prev === 'read' && next !== 'read')
        rdnLeaveView();
    if (prev !== next) {
        releaseLiveInput();
        stopPreviews();
        kbClear('target');
        kbDegrees(null);
    }
    if (prev === 'practice' && next !== 'practice') {
        clearAccompImproScale();
        clearMelodyDemoPreview();
        if (accomp.on) accompStop();
        const pm = maybeById('pr-mode');
        if (pm && queryHtml(pm, 'button[data-v="along"][aria-pressed="true"]')) {
            queryAllHtml(pm, 'button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === prProgLastDrill ? 'true' : 'false'));
            syncPracticeProgSplit();
        }
    }
    if (prev === 'read' && next !== 'read') {
        srStopAll(undefined, false, 'navigate');
        rdAbort();
    }
    if (SES.active && next !== sesHome()) { /* leaving mid-session */
        endSession(false);
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
        if (practiceHintPreview) stopPreviews();
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
        prOpenMoved(v, moveFocus, fromHistory);
        return;
    }
    if (v === undefined || !isAppView(v))
        return;
    document.querySelector('#locale-load-error[data-lazy-owner]')?.remove();
    const prev = _view;
    if (prev === 'read' && v !== 'read' && appHost.nav.isPendingSaveProtected()) {
        if (SR.srtState?.name === 'pendingSave') {
            if (location.hash.slice(1) !== prev) {
                try {
                    history.replaceState(history.state, '', '#' + prev);
                }
                catch (_) { }
            }
            void srtAbandonClaim('abandoned', false).then((result) => {
                if (result.ok || SR.srtState?.name !== 'pendingSave') {
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
    if (v === 'practice') {
        if (opts.practiceTopic) prSetTopic(opts.practiceTopic);
        if (opts.practiceMode) prSetMode(opts.practiceMode);
        if (opts.practiceKey) prSetKey(opts.practiceKey);
    }
    if (v === 'read' && opts.readingKeyId) {
        const match = srtReadingKeys().find((k) => k.id === opts.readingKeyId);
        if (match) rdnChoose(rdnBook().level, match.id);
    }
    if (v === 'today' && !SES.active) {
        byId('today-home').style.display = 'block';
        byId('summary').style.display = 'none';
        refreshToday();
    }
    let pendingViewLoad: Promise<void> | undefined;
    if (lazyFeatureLoaders[v]) {
        const featureParams: Record<string, unknown> = {};
        if (opts.extab) featureParams.extab = opts.extab;
        if (opts.openFile) featureParams.openFile = opts.openFile;
        if (opts.learnLessonId) featureParams.learnLessonId = opts.learnLessonId;
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
    if (v === 'read') {
        renderRead();
        if (opts.readingDrillId) {
            rdTab('drills');
            const drillLevel = RD_LV[opts.readingDrillId];
            if (drillLevel) rdOpen(drillLevel);
        }
    }
    if (v === 'progress') {
        if (progressView) {
            setViewLoading('view-progress', false);
            renderProgress();
        }
        else {
            setViewLoading('view-progress', true);
            pendingViewLoad = import('./progress-view.js').then((module) => {
                progressView = module;
                setViewLoading('view-progress', false);
                document.querySelector('#locale-load-error[data-lazy-owner="progress"]')?.remove();
                if (navigation === featureNavigation && _view === 'progress')
                    renderProgress();
            }, () => {
                setViewLoading('view-progress', false);
                if (navigation === featureNavigation && _view === 'progress') {
                    localeLoadError(async () => { await show('progress', moveFocus, fromHistory); });
                    const toast = document.getElementById('locale-load-error');
                    if (toast) toast.dataset.lazyOwner = 'progress';
                }
            });
        }
    }
    if (v === 'practice' && !SES.active) {
        stopMetro();
        void ensurePracticeHintsView().catch(() => {});
        syncPracticeCatAndMode();
        renderPracticeLast();
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
/* ---------- TODAY ---------- */
function greeting() { const h = new Date().getHours(); return h < 5 ? t('g_late') : h < 12 ? t('g_morning') : h < 18 ? t('g_afternoon') : t('g_evening'); }
function refreshToday() {
    const gr = greeting();
    byId('greet-title').textContent = /[.?!…]$/.test(gr) ? gr : gr + '.';
    const tn = todayN();
    byId('streakN').textContent = String(currentStreak());
    const goal = data.settings.goal, done = Math.min(data.todayDay === tn ? data.todayCount : 0, goal);
    const gd = byId('goaldots');
    gd.innerHTML = '';
    const dots = 5;
    for (let i = 0; i < dots; i++) {
        const x = (document).createElement('i');
        if (i < Math.round(dots * done / goal))
            x.className = 'on';
        gd.appendChild(x);
    }
    gd.setAttribute('aria-label', t('goal_aria', done, goal));
    byId('goal-txt').textContent = t('goal_txt', done, goal);
    const due = dueItems().length, fresh = Math.min(newItemsAvail().length, newQuotaLeft());
    byId('c-due').textContent = String(due);
    byId('c-new').textContent = String(fresh);
    byId('c-mastered').textContent = String(masteredCount());
    byId('placeBtn').hidden = data.placed || (data.totalReviews > 0 && Object.keys(data.srs).length > 0);
    const next = dueItems()[0] || (fresh ? newItemsAvail()[0] : null);
    byId('nextup').innerHTML = next ? (t('nextup') + ' <b>' + itemLabel(next) + '</b> · ' + catLabel(next.cat).toLowerCase()) : t('nextup_none');
    const caughtUp = due === 0 && fresh === 0;
    buttonById('startBtn').disabled = caughtUp && !ITEMS.some(it => !isNew(it.id));
    byId('startBtn').textContent = caughtUp ? t('start_caught') : t('start');
    byId('hero-title').textContent = caughtUp ? t('hero_caught') : t('hero_session');
    byId('why-text').textContent = caughtUp ? t('why_caught') : t('why_due');
    renderPlan();
}
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
/* ---------- SONGS moved to src/features/practice/song-book.ts ---------- */

interface PracticeHintPreview {
    id: string;
    controlId: string;
    keys: boolean | null;
    frame: number;
    notes: readonly PracticeHintNote[];
    originalLow: number | null;
    diagramKey?: string;
    diagram?: PracticeHintDiagram;
}
let practiceHintPreview: PracticeHintPreview | null = null;
let practiceHintPanelState = '';
const practiceStudy: StudyHintState = {
    open: { prog: null, technique: null },
    family: { chord: 'major', scale: 'core', prog: 'popular', melody: 'easy' },
    chordShowAll: false,
    hand: 'rh',
    chords: new Map(),
    inversions: new Map(),
    scaleHands: new Map(),
};

function setHintControlPressed(button: HTMLButtonElement, pressed: boolean) {
    const ownsPressed = button.classList.contains('pr-hint-play')
        || button.classList.contains('pr-hint-compare')
        || (button.dataset.hintControl?.endsWith(':keys') ?? false);
    if (ownsPressed) button.setAttribute('aria-pressed', String(pressed));
    button.classList.toggle('is-playing', pressed);
    // Keep aria-label stable for aria-pressed toggle buttons (WAI-ARIA APG); update visual tooltip.
    const nextTitle = pressed ? button.dataset.labelStop : button.dataset.labelPlay;
    if (nextTitle) button.title = nextTitle;
}

function syncActiveHintControls(activeControlId: string | null) {
    const box = maybeById('practiceHintsList');
    if (!box) return;
    for (const button of box.querySelectorAll<HTMLButtonElement>('button[data-hint-control].is-playing, button[data-hint-control].pr-hint-play, button[data-hint-control].pr-hint-compare')) {
        setHintControlPressed(button, activeControlId !== null && button.dataset.hintControl === activeControlId);
    }
    for (const card of box.querySelectorAll<HTMLElement>('.pr-hint-card.is-playing')) {
        card.classList.remove('is-playing');
    }
    if (activeControlId) {
        const activeBtn = [...box.querySelectorAll<HTMLButtonElement>('button[data-hint-control]')]
            .find(button => button.dataset.hintControl === activeControlId);
        if (activeBtn) {
            setHintControlPressed(activeBtn, true);
            activeBtn.closest('.pr-hint-card')?.classList.add('is-playing');
        }
    }
}

function paintPracticeHintKeys() {
    keyEl.forEach(key => { delete key.dataset.prHintKey; });
    if (!practiceHintPreview?.keys) return;
    for (const note of practiceHintPreview.notes) {
        const key = keyEl.get(note.midi) ?? keyEl.get(foldToView(note.midi));
        if (key) key.dataset.prHintKey = note.finger === undefined ? '●' : String(note.finger);
    }
}

function clearPracticeHintPreview() {
    if (!practiceHintPreview) return;
    const { frame, originalLow, diagram } = practiceHintPreview;
    practiceHintPreview = null;
    cancelAnimationFrame(frame);
    syncActiveHintControls(null);
    diagram?.paint();
    if (originalLow !== null && view.low !== originalLow) {
        view.low = Math.min(originalLow, BASE_HIGH - view.oct * 12);
        buildKeyboard();
        repaintHeld();
    } else paintPracticeHintKeys();
    dockSync();
}

async function playPracticeHint(id: string, steps: readonly PracticeHintStep[], keys: boolean, diagram?: PracticeHintDiagram, controlId?: string) {
    const panel = byId('pr-songs');
    if (view0() !== 'practice' || SES.active || accomp.on || !(panel instanceof HTMLDetailsElement) || !panel.open) return;
    const resolvedControl = controlId ?? id;
    if (keys && practiceHintPreview?.id === id && practiceHintPreview.keys !== true) {
        practiceHintPreview.keys = true;
        practiceHintPreview.controlId = resolvedControl;
        syncActiveHintControls(resolvedControl);
        dockSync();
        showPracticeHintNotes(practiceHintPreview);
        return;
    }
    if (practiceHintPreview && (practiceHintPreview.controlId === resolvedControl || (practiceHintPreview.id === id && !controlId))) {
        stopPreviews();
        return;
    }
    stopPreviews();
    const context = ensureAudio();
    if (!context) return;
    const preview: PracticeHintPreview = { id, controlId: resolvedControl, keys: keys ? true : null, frame: 0, notes: [], originalLow: null, diagram };
    practiceHintPreview = preview;
    syncActiveHintControls(resolvedControl);
    dockSync();
    if (context.state !== 'running' && !await timedAudioReady(context)) {
        if (practiceHintPreview === preview) clearPracticeHintPreview();
        return;
    }
    if (practiceHintPreview !== preview) return;
    if (audioEngine.context !== context) {
        clearPracticeHintPreview();
        return;
    }
    let next = context.currentTime + 0.045;
    const timing = steps.map(step => {
        const at = next, end = at + step.seconds;
        next = end + (step.gap ?? 0);
        step.notes.forEach(note => previewNote(note.midi, at, step.seconds));
        return { at, end, notes: step.notes, diagramKey: step.diagramKey };
    });
    const silence: readonly PracticeHintNote[] = [];
    let index = 0;
    const paint = () => {
        if (practiceHintPreview !== preview) return;
        const now = context.currentTime;
        while (index < timing.length && now >= timing[index].end) index++;
        if (index === timing.length || context.state === 'closed') {
            clearPracticeHintPreview();
            return;
        }
        const event = timing[index];
        const notes = now >= event.at ? event.notes : silence;
        const diagramKey = now >= event.at ? event.diagramKey : preview.diagramKey;
        if (notes !== preview.notes || diagramKey !== preview.diagramKey) {
            preview.notes = notes;
            preview.diagramKey = diagramKey;
            showPracticeHintNotes(preview);
        }
        preview.frame = requestAnimationFrame(paint);
    };
    preview.frame = requestAnimationFrame(paint);
}

function showPracticeHintNotes(preview: PracticeHintPreview) {
    if (preview.keys && preview.notes.length) {
        const lo = Math.min(...preview.notes.map(note => note.midi));
        const hi = Math.max(...preview.notes.map(note => note.midi));
        if (lo < view.low || hi > viewHigh()) {
            preview.originalLow ??= view.low;
            const span = view.oct * 12;
            view.low = Math.max(BASE_LOW, Math.min(BASE_HIGH - span, lo, Math.max(view.low, hi - span)));
            buildKeyboard();
            repaintHeld();
        }
        dockKeyInSight(foldToView(lo));
    }
    paintPracticeHintKeys();
    if (preview.keys || preview.diagram?.followWithoutDock) preview.diagram?.paint(preview.diagramKey, preview.notes);
    else preview.diagram?.paint();
}

function isPracticeHintsTopic(topic: string): topic is PracticeHintsTopic {
    return topic === 'chord' || topic === 'scale' || topic === 'prog' || topic === 'technique' || topic === 'melody';
}
let practiceHintsView: typeof import('./practice-hints-view.js') | null = null;
let practiceHintsLoading: Promise<typeof import('./practice-hints-view.js')> | null = null;
function ensurePracticeHintsView(): Promise<typeof import('./practice-hints-view.js')> {
    if (practiceHintsView) return Promise.resolve(practiceHintsView);
    if (!practiceHintsLoading) {
        practiceHintsLoading = import('./practice-hints-view.js').then((mod) => {
            practiceHintsView = mod;
            return mod;
        }).catch((error: unknown) => {
            practiceHintsLoading = null;
            throw error;
        });
    }
    return practiceHintsLoading;
}

function syncPracticeHintsPanel() {
    const panel = byId('pr-songs');
    if (!(panel instanceof HTMLDetailsElement)) return;
    const { cat, key, mode } = prChoice();
    const hintTopic = cat === 'scale' && mode === 'tech' ? 'technique' : cat;
    const supported = isPracticeHintsTopic(hintTopic);
    const interval = cat === 'interval';
    const box = byId('practiceHintsList');
    panel.hidden = !supported && !interval;
    byId('songsList').hidden = !interval;
    box.hidden = !supported;
    const controls = queryHtml(panel, '.pr-songs-ctl');
    if (controls) controls.hidden = !interval;
    const state = panel.open ? `${hintTopic}|${key}|${mode}|${prChordTier}|${prScaleTier}|${prMelDiff}|${lang}|${notation}|${accomp.on}` : '';
    const title = queryHtml(panel, 'summary span'), lede = queryHtml(panel, '.pr-songs-lede');
    if (title && lede) {
        title.dataset.i18n = supported ? `pr_hints_${hintTopic}_title` : 'pr_songs';
        lede.dataset.i18n = supported ? `pr_hints_${hintTopic}_lede` : 'songs_lede';
        title.textContent = t(title.dataset.i18n);
        lede.textContent = t(lede.dataset.i18n);
    }
    if (practiceHintPanelState === state) return;
    practiceHintPanelState = state;
    if (practiceHintPreview) stopPreviews();
    if (!panel.open || panel.hidden) return;
    if (interval) renderSongs();
    else if (supported) {
        const renderHints = (mod: typeof import('./practice-hints-view.js')) => {
            mod.renderPracticeHintCards(box, hintTopic, {
                tonic: key === 'all' ? null : Number(key),
                audioOnly: mode === 'ear' || mode === 'keys' || mode === 'along',
                disabled: cat === 'prog' && accomp.on,
                text: t,
                spell: (letter, acc) => spelledName(notation, letter, acc),
                chordName: symbol => chordDisp(progChordTpl(symbol) ?? symbol),
                formatChord,
                scaleName: scaleDisp,
                play: (id, steps, keys, diagram, controlId) => { void playPracticeHint(id, steps, keys, diagram, controlId); },
                stop: () => { if (practiceHintPreview) stopPreviews(); },
                study: practiceStudy,
                chordTier: prChordTier,
                scaleTier: prScaleTier,
                melodyDiff: prMelDiff,
            });
        };
        if (practiceHintsView) {
            renderHints(practiceHintsView);
        } else {
            const expectedState = state;
            void ensurePracticeHintsView().then((mod) => {
                if (practiceHintPanelState === expectedState && panel.open && !panel.hidden) {
                    renderHints(mod);
                }
            }, () => {
                if (practiceHintPanelState === expectedState) practiceHintPanelState = '';
            });
        }
    }
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
/* ============================================================================
   READ & PLAY — the sight-reading engine. Grand staff engraver (reuses the ss glyphs)
   + step-by-step / assessment / listen modes for generated melodies.
   The graded repertoire (PIECES) is played in the Pieces screen (view `analysis`).
   ============================================================================ */
/** The notes that sound together at one beat (one Learn-mode step). */
interface SrStep { beat: number; notes: SrStaffNote[]; closed?: boolean }
/** A wrong key in Learn mode, classified (`k`) against the expected note `n`. */
interface SrSlip { k: string; n: SrStaffNote; m: number }
interface SrState {
    piece: SrPiece | null; hands: string; modeSel: string; names: boolean; anyOctave: boolean; instantFeedback: boolean; active: boolean; assessOn: boolean;
    notes: SrStaffNote[]; steps: SrStep[]; stepIdx: number; hit: Set<number>; results: Record<number, string>; mistakes: number; wrongExtra: number;
    beatX: SrBeatX[]; totalBeats: number; render: SrRenderResult | null; raf: number; timers: ReturnType<typeof setTimeout>[]; nodes: OscillatorNode[];
    bpm: number; t0: number; next: CoachTip | null; errs: Record<string, number> | null; slipKey: SrSlip | null;
    gen?: SrPiece | null; listening?: boolean;
    srtPiece?: SightReadingPiece | null; srtFingerprint?: string | null; srtState?: SightReadingState;
    srtOwnerTabId?: string; srtAttemptStartedAt?: number; srtPreviewTimer?: number; srtCountdown?: number; srtLease?: SightReadingAttemptLease | null; srtPendingAttempt?: SightReadingAttempt | null;
    srtEvaluation?: SightReadingEvaluation | null; srtResultValue?: number | null; srtResultLevelId?: string | null;
    /** A level piece of the book, a key run or the daily set (the Read home's player); null for the older melodies. */
    lvPiece?: GeneratedPiece | null;
}
const SR: SrState = { piece: null, hands: 'both', modeSel: 'learn', names: false, anyOctave: false, instantFeedback: false, active: false, assessOn: false,
    notes: [], steps: [], stepIdx: 0, hit: new Set<number>(), results: {}, mistakes: 0, wrongExtra: 0, beatX: [], totalBeats: 0,
    render: null, raf: 0, timers: [], nodes: [], bpm: 90, t0: 0, next: null, errs: null, slipKey: null,
    srtPiece: null, srtFingerprint: null, srtState: SRT_INITIAL_STATE,
    srtOwnerTabId: `tab-${Math.random().toString(36).slice(2)}`, srtAttemptStartedAt: 0, srtPreviewTimer: 0, srtCountdown: 0, srtLease: null, srtPendingAttempt: null,
    srtEvaluation: null, srtResultValue: null, srtResultLevelId: null, lvPiece: null };
/** The Read tab's screens: the home (the default each time the tab opens), the old drills and melody screens, and the
 *  player of a level piece. `ctx` says which numbered piece the player shows. */
type RdnScreen = 'home' | 'drills' | 'melody' | 'player' | 'warmup';
type RdnCtx = { kind: 'book'; level: number; number: number } | { kind: 'focus'; level: number; key: ReadingKeyId; number: number } | { kind: 'daily'; date: string; slot: number }
    // A long piece that gets harder as it goes: the `index`-th of the day.
    | { kind: 'long'; date: string; level: number; key: ReadingKeyId; index: number }
    | { kind: 'scored'; piece: GeneratedPiece };
/** `learn`: the score and stars of a finished Step-by-step run, shown on the result card instead of an evaluation. */
/** `autoWait`: auto-next waits for a first-sight result to be saved. `playerMode`: the mode chosen for level pieces.
 *  `melodyMode`: the old melody screen's mode, kept while the player shows a level piece.
 *  `opener`: a selector for the control that left the home, focused again on the way back.
 *  `noDaily`: today's set could not be made. `ready`: the status line the player shows before an attempt. */
interface RdnState { screen: RdnScreen; fresh: boolean; ctx: RdnCtx | null; autoTimer: number; autoLeft: number; retries: number; learn: { acc: number; stars: 0 | 1 | 2 | 3 } | null;
    autoWait: boolean; playerMode: string; melodyMode: string | null; opener: string; noDaily: boolean; ready: string }
const RDN: RdnState = { screen: 'home', fresh: true, ctx: null, autoTimer: 0, autoLeft: 0, retries: 0, learn: null, autoWait: false, playerMode: 'assess', melodyMode: null, opener: '', noDaily: false, ready: '' };
/** The warm-up (spec section 9): its steps, where it is, and the flash card in play. `phase` is 'show' (the bar is visible),
 *  'play' (hidden, notes are collected), 'result' (shown again with a mark), 'drill' (an existing drill runs the step), or
 *  'idle'. `limit` is how many answers (or rhythm exercises) end a drill step. */
type RdnWarmPhase = 'idle' | 'show' | 'play' | 'result' | 'drill';
interface RdnWarmState { on: boolean; level: number; key: string; steps: readonly WarmupStep[]; step: number; card: number; phase: RdnWarmPhase;
    again: boolean; clean: number; played: number[][]; lastAt: number; strict: boolean; ok: boolean; timer: number; chordTimer: number; limit: number; tally: number[] }
const WARM: RdnWarmState = { on: false, level: 1, key: 'C', steps: [], step: 0, card: 0, phase: 'idle', again: false, clean: 0, played: [], lastAt: 0, strict: false, ok: false, timer: 0, chordTimer: 0, limit: 0, tally: [] };
/** Warm-up timing in ms: how long a card shows, how long its mark stays, and how close notes must be to form one chord.
 *  Mutable so tests can shorten the waits. */
const RDN_WARM_MS = { flash: SRT_FLASH_MS, result: 1200, chord: 60 };
/** The window, in ms, inside which the notes of one beat of a level piece (both hands) count as played together. */
const RDN_CHORD_WINDOW_MS = 120;
let srtRecorder: SightReadingRecorder | null = null;
let srtOperationEpoch = 0;
let srtCountInEpoch = 0;
let srtCountInAttemptId: string | null = null;
let srtClaimIssuedAttemptId: string | null = null;
let srtClaimDurableAttemptId: string | null = null;
type SrtAttemptCleanup = {
    readonly attemptId: string;
    readonly ownerTabId: string;
    readonly generation: string;
    readonly lease: SightReadingAttemptLease | null;
    readonly mixedInput: boolean;
};
const srtCleanupPromises = new Map<string, Promise<SightReadingLedgerResult>>();
const srtReleasedLeases = new WeakSet<SightReadingAttemptLease>();
let srtExposurePromise: { fingerprint: string; promise: Promise<SightReadingLedgerResult> } | null = null;
function srRender(piece: SrScore, lay?: SrLayout, proportional = false): SrRenderResult {
    return renderGrandStaff(piece, lay, { namesVisible: srNamesVisible(piece), notation, proportional });
}
/* ---- state, drawing, grading ---- */
function srSvg() { return byId('rd-staff') ? byId('rd-staff').querySelector('svg') : null; }
function srHandsAvail() { const p = SR.piece; if (!p)
    throw new Error('Étude: no piece selected'); return p.rh && p.lh ? 'both' : (p.rh ? 'rh' : 'lh'); }
function srActiveHands() { const a = srHandsAvail(); return a === 'both' ? SR.hands : a; }
function srHandSel(): 'rh' | 'lh' | 'both' { const a = srActiveHands(); return a === 'rh' || a === 'lh' ? a : 'both'; }
function srStepsBuild() {
    const sel = srActiveHands();
    const ns = SR.notes.filter((n) => sel === 'both' || n.hand === sel);
    const map = new Map<string, { beat: number; notes: typeof ns; }>();
    ns.forEach((n) => { const k = n.beat.toFixed(3); let step = map.get(k); if (!step)
        map.set(k, step = { beat: n.beat, notes: [] }); step.notes.push(n); });
    SR.steps = [...map.values()].sort((a, b) => a.beat - b.beat);
}
function srDraw() {
    if (!SR.piece)
        return;
    srtConsumeOnLearnReveal();
    const lay = srPageLayout(SR.piece, srPaper());
    const r = srRender(SR.piece, lay, true);
    SR.render = r;
    SR.notes = r.notes;
    SR.beatX = r.beatX;
    SR.totalBeats = r.total;
    const concealed = srtScoreConcealed();
    const staffEl = byId('rd-staff');
    staffEl.setAttribute('aria-hidden', concealed ? 'true' : 'false');
    staffEl.dataset.activeHand = srActiveHands();
    staffEl.innerHTML = concealed ? '' : r.svg;
    readScoreZoom();
    scoreFocusUi();
    srPaperSeen = lay;
    srFollowSy = -1;
    srStepsBuild();
    if (!concealed) {
        srPaintAll();
        if (SR.active && SR.modeSel === 'learn')
            srScrollStep();
        else if (!SR.active)
            byId('rd-staff').scrollLeft = 0;
    }
    srCoach();
}
function srtGeneratedSelected() {
    return (!!SR.srtPiece || !!SR.lvPiece) && !!SR.gen && SR.piece?.id === SR.gen.id;
}
function srtEligibleFirstSightActive() {
    return srtGeneratedSelected() && SR.srtState?.mode === 'firstSight' &&
        ['preparing', 'claiming', 'preview', 'countIn', 'playing'].includes(SR.srtState.name);
}
let srtWatchedAudioContext: AudioContext | null = null;
function srtWatchAudioContext(context: AudioContext) {
    if (srtWatchedAudioContext === context)
        return;
    srtWatchedAudioContext = context;
    if (typeof context.addEventListener !== 'function')
        return;
    context.addEventListener('statechange', () => {
        if (context === audioEngine.context && String(context.state) !== 'running' && srtEligibleFirstSightActive())
            panic();
    });
}
function srNamesVisible(piece: SrScore) {
    // A level piece shows before its first attempt: its note names wait until it is practice.
    const state = SR.srtState, lvFirst = !!SR.lvPiece && srtGeneratedSelected() && state?.mode === 'firstSight' && (state.name === 'idle' || state.name === 'blocked');
    return SR.names && !piece.noNames && !srtScoreConcealed() && !lvFirst && !srtEligibleFirstSightActive() && SR.srtState?.name !== 'claiming';
}
interface SrSvgNoteRef {
    g: SVGElement;
    title: SVGTitleElement;
    sym: SVGTextElement;
}
interface SrSvgCacheEntry {
    notes: Map<number, SrSvgNoteRef>;
    playhead: SVGLineElement | null;
    extras: SVGGElement | null;
}
const srSvgCache = new WeakMap<SVGSVGElement, SrSvgCacheEntry>();
function srSvgEntry(svg: SVGSVGElement): SrSvgCacheEntry {
    let entry = srSvgCache.get(svg);
    if (!entry) {
        const noteById = new Map<number, { x: number; y: number }>();
        for (const item of SR.notes)
            noteById.set(item.nid, item);
        const notes = new Map<number, SrSvgNoteRef>();
        svg.querySelectorAll('.ss-n').forEach((g) => {
            if (!(g instanceof SVGElement))
                return;
            const id = Number(g.dataset.nid);
            const rawTitle = g.querySelector('title');
            let title: SVGTitleElement;
            if (rawTitle instanceof SVGTitleElement) {
                title = rawTitle;
            }
            else {
                title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                g.appendChild(title);
            }
            const rawVisible = g.querySelector('.ss-result-symbol');
            let visible: SVGTextElement;
            if (rawVisible instanceof SVGTextElement) {
                visible = rawVisible;
            }
            else {
                visible = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                visible.setAttribute('class', 'ss-result-symbol');
                visible.setAttribute('aria-hidden', 'true');
                g.appendChild(visible);
            }
            const note = noteById.get(id);
            visible.setAttribute('x', String((note?.x ?? 0) + 12));
            visible.setAttribute('y', String(Math.max(12, (note?.y ?? 16) - 8)));
            notes.set(id, { g, title, sym: visible });
        });
        const ph = svg.querySelector('.ss-playhead'), ex = svg.querySelector('.ss-extra-symbol');
        entry = {
            notes,
            playhead: ph instanceof SVGLineElement ? ph : null,
            extras: ex instanceof SVGGElement ? ex : null,
        };
        srSvgCache.set(svg, entry);
    }
    return entry;
}
function srPaintAll() {
    const svg = srSvg();
    if (!svg)
        return;
    const entry = srSvgEntry(svg);
    const st = (SR.active && SR.modeSel === 'learn') ? SR.steps[SR.stepIdx] : null;
    const stepNids = st ? new Set(st.notes.map((n: { nid: number; }) => n.nid)) : null;
    entry.notes.forEach(({ g, title, sym: visible }, id) => {
        const r = SR.results[id];
        if (stepNids && stepNids.has(id) && !SR.hit.has(id))
            g.dataset.s = 'now';
        else if (r)
            g.dataset.s = r;
        else
            g.removeAttribute('data-s');
        const symbol = r === 'good' ? '✓' : r === 'near' ? '≈' : r === 'bad' ? '✗' : r === 'extra' ? '+' : '';
        const label = r === 'good' ? t('rd_srt_symbol_good') : r === 'near' ? t('rd_srt_symbol_near') : r === 'bad' ? t('rd_srt_symbol_bad') : r === 'extra' ? t('rd_srt_symbol_extra') : '';
        const nextTitle = symbol ? symbol + ' ' + label : '';
        if (title.textContent !== nextTitle)
            title.textContent = nextTitle;
        if (symbol) {
            if (g.getAttribute('aria-label') !== symbol)
                g.setAttribute('aria-label', symbol);
        }
        else if (g.hasAttribute('aria-label'))
            g.removeAttribute('aria-label');
        if (visible.textContent !== symbol)
            visible.textContent = symbol;
        const nextDisp = symbol ? '' : 'none';
        if (visible.style.display !== nextDisp)
            visible.style.display = nextDisp;
    });
    const rawExtras = entry.extras && entry.extras.parentNode === svg ? entry.extras : svg.querySelector('.ss-extra-symbol');
    let extras = rawExtras instanceof SVGGElement ? rawExtras : null;
    if (SR.wrongExtra > 0) {
        if (!extras) {
            extras = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            extras.setAttribute('class', 'ss-extra-symbol');
            svg.appendChild(extras);
        }
        entry.extras = extras;
        extras.innerHTML = `<title>${rdEsc(t('rd_srt_symbol_extra'))}</title><text x="${Math.max(20, (SR.render?.W ?? 420) - 24)}" y="18">+${SR.wrongExtra}</text>`;
    }
    else if (extras) {
        extras.remove();
        entry.extras = null;
    }
}
// x is in SVG units; on the full-screen stage the score is drawn larger than one pixel a unit.
function srScrollX(x: number) {
    const w = byId('rd-staff');
    if (!w)
        return;
    if (w.scrollWidth > w.clientWidth + 4) {
        const svg = srSvg(), W = SR.render?.W, k = svg && W ? svg.getBoundingClientRect().width / W || 1 : 1;
        w.scrollLeft = Math.max(0, x * k - w.clientWidth * 0.4);
    }
    else if (w.scrollLeft !== 0)
        w.scrollLeft = 0;
}
// The paper's inner size in CSS pixels, which the score is laid out for (see SrLayout). On the full-screen stage the height
// counts too. A hidden paper has no size: the score is then drawn at its natural size, and srFit lays it out once it shows.
function srPaperOf(wrap: HTMLElement | null): SrLayout | undefined {
    if (!wrap || !wrap.clientWidth)
        return undefined;
    const cs = getComputedStyle(wrap), width = Math.floor(wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    return STAGE.on ? { width, maxHeight: Math.floor(wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) } : { width };
}
function srPaper() { return srPaperOf(maybeById('rd-staff')); }
// A level piece is laid out like a printed page: four bars a system, and as large as lets the whole piece show without
// scrolling, between SR_PAGE_MIN (still easy to read) and SR_PAGE_MAX times its natural size. A long piece scrolls.
const SR_PAGE_MIN = 0.85, SR_PAGE_MAX = 1.8;
/** The height of a piece at its natural size, for the width and the note-names setting it was measured with. */
const srPageNatural = new WeakMap<SrScore, { width: number; names: boolean; H: number }>();
function srPageLayout(piece: SrPiece, lay: SrLayout | undefined): SrLayout | undefined {
    const wrap = maybeById('rd-staff');
    // Manual expansion uses readable systems and vertical scrolling instead of shrinking the whole piece to its height.
    if (lay && SCORE_FOCUS.owner === 'read')
        return { width: lay.width, minBars: 1, cap: SR_PAGE_MAX, floor: .5, justify: true };
    if (!lay || lay.maxHeight || piece.engrave !== 2 || !SR.lvPiece || !srtGeneratedSelected() || !wrap)
        return lay;
    // The height the paper may take: the window, less what is above the paper, the play controls, and the live dock below it.
    const dockEl = maybeById('dock');
    const dockH = dockEl && !dockEl.hidden ? dockEl.getBoundingClientRect().height : 0;
    const ctrlEl = maybeById('rd-play-controls');
    const ctrlH = ctrlEl && !ctrlEl.hidden ? Math.max(48, ctrlEl.getBoundingClientRect().height + 16) : 64;
    const below = Math.round(dockH + ctrlH + 84);
    const room = Math.max(220, window.innerHeight - (wrap.getBoundingClientRect().top + window.scrollY) - below);
    const names = srNamesVisible(piece), seen = srPageNatural.get(piece);
    const natural = seen && seen.width === lay.width && seen.names === names ? seen.H : srRender(piece, { width: lay.width, cap: 1 }, true).H;
    srPageNatural.set(piece, { width: lay.width, names, H: natural });
    const cap = Math.max(SR_PAGE_MIN, Math.min(SR_PAGE_MAX, room / Math.max(1, natural)));
    return { ...lay, cap, floor: Math.min(1, cap), justify: true };
}
/** Whether a staff laid out for paper `prev` needs laying out again for `next`. A hidden paper (undefined) keeps the last layout.
 *  The paper growing by less than a scrollbar is ignored: a taller score can show the page's scrollbar, and laying out again
 *  for the narrower paper must not hide it and grow the score back. */
function srPaperChanged(prev: SrLayout | undefined, next: SrLayout | undefined) {
    if (!next)
        return false;
    if (!prev || prev.maxHeight !== next.maxHeight)
        return true;
    // A page (a level piece) is sized by the room under it as well: that changes when the things above it do.
    if (Math.abs((prev.cap ?? 0) - (next.cap ?? 0)) > 0.02)
        return true;
    return next.width < prev.width || next.width - prev.width >= 24;
}
let srPaperSeen: SrLayout | undefined;
// Lays the score out again when its paper changed size (a resize, the full-screen stage, the tab coming into view). The marks
// of a run in progress are painted again from its state; the playhead comes back on its next frame.
function srFit() {
    if (!SR.piece || !SR.render || srtScoreConcealed())
        return;
    const lay = srPageLayout(SR.piece, srPaper());
    if (!srPaperChanged(srPaperSeen, lay))
        return;
    srPaperSeen = lay;
    const r = srRender(SR.piece, lay, true), wrap = byId('rd-staff');
    const left = wrap.scrollLeft, top = wrap.scrollTop;
    const closed = new Set(SR.steps.filter((s) => s.closed).map((s) => s.beat.toFixed(3)));
    SR.render = r;
    SR.notes = r.notes;
    SR.beatX = r.beatX;
    wrap.innerHTML = r.svg;
    readScoreZoom();
    srFollowSy = -1;
    srStepsBuild();
    SR.steps.forEach((s) => { if (closed.has(s.beat.toFixed(3)))
        s.closed = true; });
    srPaintAll();
    if (SR.active && SR.modeSel === 'learn')
        srScrollStep();
    else { wrap.scrollLeft = left; wrap.scrollTop = top; }
}
// While a score of several systems plays, the page (or the stage's paper) scrolls so the system being read stays in view.
let srFollowSy = -1;
function srFollow(sy: number) {
    const r = SR.render, svg = srSvg(), s = r?.systems[sy];
    if (!r || !svg || !s || r.systems.length < 2 || sy === srFollowSy)
        return;
    srFollowSy = sy;
    const box = svg.getBoundingClientRect(), k = box.height / r.H, wrap = byId('rd-staff');
    if (!k)
        return;
    const top = box.top + s.yTop * k, bot = box.top + s.yBot * k;
    if (wrap.scrollHeight > wrap.clientHeight + 4) {
        const wr = wrap.getBoundingClientRect();
        if (top < wr.top || bot > wr.bottom)
            wrap.scrollTop += top - wr.top - 8;
        return;
    }
    const hd = document.querySelector('header'), upper = hd && getComputedStyle(hd).position === 'sticky' ? hd.getBoundingClientRect().bottom : 0;
    const lower = Math.min(innerHeight, ...[maybeById('dock'), maybeById('bottomNav')].flatMap((el) => { const b = el?.getBoundingClientRect(); return b && b.height > 0 && b.top < innerHeight ? [b.top] : []; }));
    if (top < upper + 8)
        window.scrollBy(0, top - upper - 8);
    else if (bot > lower - 8)
        window.scrollBy(0, Math.min(bot - lower + 16, top - upper - 8));
}
function srScrollStep() { const st = SR.steps[SR.stepIdx]; if (st) {
    srScrollX(st.notes[0].x);
    srFollow(st.notes[0].sy);
} }
function srBeatToX(beat: number) { return srBeatPt(SR.beatX, beat).x; }
/** Moves the playhead to `x` on system `sy`. */
function srCursor(x: number, sy = 0) {
    const svg = srSvg();
    if (!svg)
        return;
    const entry = srSvgEntry(svg);
    const rawCursor = entry.playhead && entry.playhead.parentNode === svg ? entry.playhead : svg.querySelector('.ss-playhead');
    let c = rawCursor instanceof SVGLineElement ? rawCursor : null;
    if (!c) {
        c = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        c.setAttribute('class', 'ss-playhead');
        svg.appendChild(c);
    }
    entry.playhead = c;
    const s = SR.render?.systems[sy];
    c.setAttribute('y1', String(s ? s.yTop : 38));
    c.setAttribute('y2', String(s ? s.yBot : 102));
    c.setAttribute('x1', String(x));
    c.setAttribute('x2', String(x));
    srScrollX(x);
    srFollow(sy);
}
function srTargets() {
    kbClear('target');
    if (!(SR.active && SR.modeSel === 'learn'))
        return;
    const st = SR.steps[SR.stepIdx];
    if (st)
        st.notes.forEach((n: { nid: number; midi: number; }) => { if (!SR.hit.has(n.nid))
            kbState(n.midi, 'target', true); });
}
function srClick(t: number, acc: boolean) {
    const click = audioEngine.scheduleClick(t, acc);
    if (click?.oscs)
        SR.nodes.push(...click.oscs);
}
let srInstantTracker: InstantFeedbackTracker | null = null;
let srInstantVerdictShown = false;
function srInstantNotes(): InstantFeedbackExpectedNote[] {
    const sel = srActiveHands();
    const msPerBeat = 60000 / SR.bpm;
    return SR.notes
        .filter((n) => sel === 'both' || n.hand === sel)
        .map((n) => ({ nid: n.nid, midi: n.midi, onMs: n.beat * msPerBeat }));
}
function srInstantReset() {
    srInstantTracker = null;
    srInstantVerdictShown = false;
}
function srInstantNoteLabel(midi: number, matchedNid?: number): string {
    if (matchedNid !== undefined && SR.piece?.engrave === 2) {
        const note = SR.notes.find((n) => n.nid === matchedNid);
        if (note)
            return srSpellName(note.li, note.acc, notation) + note.oct;
    }
    const flat = (SR.piece?.keyN || 0) < 0;
    return noteName(midi, flat);
}
function srInstantFlashKey(midi: number, status: 'good' | 'bad') {
    const m = foldToView(midi);
    kbState(m, status, false);
    SR.timers.push(setTimeout(() => {
        const el = keyEl.get(m);
        if (!el || el.dataset.s !== status)
            return;
        const isHeld = [...held].some((n) => foldToView(n) === m);
        kbState(m, isHeld ? 'active' : null, false);
    }, 350));
}
function srInstantHandleNote(midi: number, onMs: number) {
    if (!srInstantTracker)
        return;
    const res = srInstantTracker.processInput(midi, onMs);
    const v = maybeById('rd-verdict');
    if (res.matched) {
        SR.results[res.nid] = res.status;
        srPaintAll();
        const lbl = srInstantNoteLabel(res.expectedMidi, res.nid);
        srInstantFlashKey(midi, res.status === 'bad' ? 'bad' : 'good');
        if (v) {
            if (res.status === 'good') {
                v.className = 'verdict good';
                v.textContent = t('rd_fb_good', lbl);
            }
            else if (res.status === 'near') {
                v.className = 'verdict neutral';
                v.textContent = t('rd_fb_near', lbl);
            }
            else {
                v.className = 'verdict bad';
                v.textContent = t('rd_fb_late', lbl);
            }
        }
    }
    else {
        SR.wrongExtra++;
        srPaintAll();
        srInstantFlashKey(midi, 'bad');
        if (v) {
            const played = srInstantNoteLabel(midi);
            v.className = 'verdict bad';
            if (res.expectedMidis.length) {
                const exp = res.expectedMidis.map((m) => srInstantNoteLabel(m)).join(' / ');
                v.textContent = t('rd_fb_wrong_exp', played, exp);
            }
            else {
                v.textContent = t('rd_fb_wrong', played);
            }
        }
    }
    srInstantVerdictShown = true;
}
function srInstantSweep(nowMs: number) {
    if (!srInstantTracker)
        return;
    const missed = srInstantTracker.sweepMissed(nowMs);
    if (!missed.length)
        return;
    for (const nid of missed)
        SR.results[nid] = 'bad';
    srPaintAll();
}
type SrtStopReason = 'interrupt' | 'navigate';
let srAssessRunId = 0;
function srStopAll(keep?: boolean, preserveSrt = false, reason: SrtStopReason = 'interrupt') {
    srAssessRunId++;
    if (!preserveSrt) {
        if (reason === 'navigate')
            srtNavigateAttempt();
        else
            srtCancelAttempt('interrupted');
    }
    const preservePendingResult = srtPendingSaveProtected();
    SR.active = false;
    stageSync();
    rdnNavUi();
    SR.assessOn = false;
    srInstantReset();
    if (SR.raf)
        cancelAnimationFrame(SR.raf);
    SR.raf = 0;
    SR.timers.forEach(clearTimeout);
    SR.timers = [];
    SR.nodes.forEach((n) => { try {
        n.stop(0);
    }
    catch (_) { } });
    SR.nodes = [];
    if (audioEngine.context)
        stopPreviews();
    kbClear('target');
    kbClear('good');
    kbClear('bad');
    const svg = srSvg(), c = svg && svg.querySelector('.ss-playhead');
    if (c)
        c.remove();
    srFollowSy = -1;
    if (!keep && !preservePendingResult) {
        SR.results = {};
        SR.wrongExtra = 0;
        SR.stepIdx = 0;
        SR.hit.clear();
        SR.next = null;
        srPaintAll();
    }
    const go = byId('rd-go');
    if (go && !preservePendingResult)
        go.textContent = t('rd_start');
    SR.listening = false;
    const li = byId('rd-listen');
    if (li)
        li.textContent = t('rd_listen');
    rdWarmButtonsSync();
    if (!preservePendingResult)
        srCoach();
}
function srPlayGap(fromBeat: number, toBeat: number) {
    const sel = srActiveHands();
    if (sel === 'both' || srHandsAvail() !== 'both')
        return;
    const bs = 60 / SR.bpm, ctx = audioEngine.context;
    if (!ctx)
        return;
    SR.notes.filter((n) => n.hand !== sel && n.beat >= fromBeat - 1e-3 && n.beat < toBeat - 1e-3).forEach((n) => previewNote(n.midi, ctx.currentTime + 0.02, Math.max(.15, n.dur * bs * .9), 78));
}
function srCount() { const v = byId('rd-verdict'); v.className = 'verdict neutral'; v.textContent = SR.stepIdx + ' / ' + SR.steps.length + (SR.mistakes ? '  ·  ✗ ' + SR.mistakes : ''); }
function srLearnStart() {
    rdnResultHide();
    SR.active = true;
    SR.anyOctave = !!data.settings.anyOctave;
    srStartStage();
    rdnNavUi();
    rdWarmButtonsSync();
    SR.results = {};
    SR.stepIdx = 0;
    SR.hit.clear();
    SR.mistakes = 0;
    SR.errs = {};
    SR.slipKey = null;
    SR.next = null;
    srCoach();
    srPaintAll();
    srTargets();
    srScrollStep();
    const v = byId('rd-verdict');
    v.className = 'verdict neutral';
    v.textContent = t('rd_learn_go');
    byId('rd-go').textContent = t('rd_stop');
}
function srLearnFinish() {
    SR.next = srNextLearn();
    srStopAll(true);
    const v = byId('rd-verdict');
    if (SR.mistakes === 0) {
        v.className = 'verdict good';
        v.textContent = t('rd_perfect');
    }
    else {
        v.className = 'verdict neutral';
        v.textContent = t('rd_done_learn', SR.mistakes);
    }
    if (SR.lvPiece && srtGeneratedSelected()) {
        const grade = srLearnGrade(SR.mistakes, SR.steps.length || 1);
        rdnRecord(grade.acc, grade.stars, false);
        v.textContent += ' · ' + '★'.repeat(grade.stars) + '☆'.repeat(3 - grade.stars);
        RDN.learn = { acc: grade.acc, stars: grade.stars };
        // Practice never moves on by itself: no auto-next after a Step-by-step run.
        rdnResultShow(false);
    }
    else
        v.textContent += rdSightDone('learn', SR.mistakes);
    markReadDoneToday();
    touchDay();
    saveAll();
}
function srtSetState(event: Parameters<typeof srtTransition>[1]) {
    const previous = SR.srtState || SRT_INITIAL_STATE;
    const next = srtTransition(previous, event);
    SR.srtState = next;
    if (next.name === 'countIn' && previous.name !== 'countIn') {
        srtCountInEpoch = srtOperationEpoch;
        srtCountInAttemptId = next.attemptId;
    }
    else if (next.name !== 'countIn') {
        srtCountInEpoch = 0;
        srtCountInAttemptId = null;
    }
    if (srtGeneratedSelected() && next.mode === 'firstSight' && (next.name === 'abandoned' || next.name === 'interrupted')) {
        const message = t('rd_srt_error_already_exposed');
        srtNotice(message);
        const verdict = byId('rd-verdict');
        verdict.className = 'verdict neutral';
        verdict.textContent = message;
    }
    if (SR.piece && (previous.name !== next.name || previous.mode !== next.mode))
        srDraw();
    rdnNavUi();
    if (next.name === 'saved' && previous.name !== 'saved')
        rdnAutoAfterSave();
}
function srtPreviewUi(show: boolean) {
    const panel = maybeById('rd-srt-preview');
    if (panel)
        panel.hidden = !show;
    if (show) {
        const operation = srtOperationEpoch;
        requestAnimationFrame(() => {
            if (operation !== srtOperationEpoch || panel?.hidden)
                return;
            const start = maybeById('rd-srt-start');
            if (!start)
                return;
            start.focus({ preventScroll: true });
            start.scrollIntoView({ block: 'center', behavior: 'auto' });
        });
    }
}
function srtPendingUi(show: boolean) {
    const panel = maybeById('rd-srt-pending');
    if (panel)
        panel.hidden = !show;
}
function srtNotice(text: string | null) {
    const notice = maybeById('rd-srt-notice');
    if (!notice)
        return;
    notice.hidden = !text;
    notice.textContent = text ?? '';
}
type SrtLedgerFailureReason = 'stale_generation' | 'owner_mismatch' | 'already_exposed' | 'conflict' | 'quota' | 'storage' | 'unsupported';
type SrtLedgerFailureContext = 'start' | 'pending' | 'practice-switch';
function srtLedgerFailureMessage(reason: SrtLedgerFailureReason, context: SrtLedgerFailureContext = 'start') {
    if (reason === 'storage')
        return t(context === 'pending' ? 'rd_srt_error_pending_storage' : 'rd_srt_error_storage');
    return t('rd_srt_error_' + reason);
}
function srtScoreConcealed() {
    // A level piece is on the page from the moment it opens: there is no timed look, its first attempt is its first sight.
    if (SR.lvPiece && srtGeneratedSelected())
        return false;
    if (srtExposurePromise?.fingerprint === SR.srtFingerprint)
        return true;
    const state = SR.srtState;
    return srtGeneratedSelected() && SR.modeSel === 'assess' && state?.mode === 'firstSight' &&
        (['idle', 'preparing', 'claiming'].includes(state.name) ||
            state.name === 'blocked' && state.reason !== 'already_exposed');
}
function srtProgressLedgerUpdate(operation: SightReadingLedgerOperation) {
    return srtLedgerUpdate(localStorage, operation, () => !STORE.blocked && !storeBackupBlocked());
}
function srtRecordExposure(reason: string, kind: 'exposure' | 'listen' = 'exposure') {
    const fingerprint = SR.srtFingerprint;
    if (!fingerprint)
        return null;
    const ledger = srtReadLedger(localStorage);
    if (ledger.exposures[fingerprint])
        return Promise.resolve({ ok: true, ledger } satisfies SightReadingLedgerResult);
    const progressGeneration = SYNC.gen;
    const record = (generation: string) => kind === 'listen'
        ? srtProgressLedgerUpdate({ type: 'recordListen', fingerprint, generation })
        : srtProgressLedgerUpdate({ type: 'recordExposure', fingerprint, reason, generation });
    const operation = record(ledger.generation);
    const settled = operation.then(result => {
        if (result.ok || result.reason !== 'stale_generation')
            return result;
        // An internal ledger reset can race a Learn reveal. A full progress reset
        // also advances ptt-v3, and writes queued before it must stay discarded.
        try {
            const saved = readPttV3(localStorage)?.payload;
            if ((saved?.gen ?? '') !== progressGeneration)
                return result;
            return record(srtReadLedger(localStorage).generation);
        }
        catch (_) {
            return result;
        }
    });
    srtExposurePromise = { fingerprint, promise: settled };
    void settled.then((result) => {
        if (srtExposurePromise?.promise === settled)
            srtExposurePromise = null;
        if (!result.ok) {
            if (SR.srtFingerprint === fingerprint)
                srtNotice(srtLedgerFailureMessage(result.reason));
            return;
        }
        if (SR.srtFingerprint === fingerprint)
            srDraw();
    });
    return operation;
}
function srtExposeForPractice(reason: string, kind: 'exposure' | 'listen' = 'exposure', redraw = true) {
    if ((!SR.srtPiece && !SR.lvPiece) || !SR.srtFingerprint)
        return;
    const state = SR.srtState;
    if (state?.mode === 'firstSight' &&
        (state.name === 'idle' || state.name === 'blocked' && state.reason !== 'already_exposed')) {
        SR.srtState = { ...state, mode: 'practice', attemptId: null, fingerprint: SR.srtFingerprint };
        if (redraw)
            srDraw();
    }
    void srtRecordExposure(reason, kind);
}
function srtConsumeOnLearnReveal() {
    if (SR.modeSel === 'assess' || !srtGeneratedSelected() || !SR.srtFingerprint)
        return false;
    const state = SR.srtState;
    if (state?.mode !== 'firstSight' ||
        !(state.name === 'idle' || state.name === 'blocked' && state.reason !== 'already_exposed'))
        return false;
    srtExposeForPractice('learn', 'exposure', false);
    return true;
}
function srtClearPreview() {
    window.clearInterval(SR.srtPreviewTimer);
    SR.srtPreviewTimer = 0;
    SR.srtCountdown = 0;
    srtPreviewUi(false);
}
function srtBeginOperation() {
    srtOperationEpoch++;
    srtClearPreview();
    srtCountInEpoch = 0;
    srtCountInAttemptId = null;
    return srtOperationEpoch;
}
function srtOperationStillCurrent(epoch: number, state: SightReadingState | undefined, attemptId: string | null = state?.attemptId ?? null) {
    return epoch === srtOperationEpoch && state !== undefined && SR.srtState === state &&
        (attemptId === null || SR.srtState?.attemptId === attemptId);
}
function srtCaptureAttempt(state: SightReadingState | undefined): SrtAttemptCleanup | null {
    if (!state?.attemptId || !SR.srtOwnerTabId || (!SR.srtPiece && !SR.lvPiece) || !SR.srtFingerprint)
        return null;
    return {
        attemptId: state.attemptId,
        ownerTabId: SR.srtOwnerTabId,
        generation: srtReadLedger(localStorage).generation,
        lease: SR.srtLease ?? null,
        mixedInput: SR.srtPendingAttempt?.mixedInput ?? srtRecorder?.mixedInput ?? false,
    };
}
function srtReleaseLease(lease: SightReadingAttemptLease | null) {
    if (!lease)
        return;
    if (srtReleasedLeases.has(lease))
        return;
    srtReleasedLeases.add(lease);
    lease.release();
    if (SR.srtLease === lease)
        SR.srtLease = null;
}
function srtPendingSaveProtected() {
    const state = SR.srtState;
    return state?.name === 'pendingSave' ||
        state?.name === 'completed' && SR.srtPendingAttempt?.attemptId === state.attemptId;
}
function srtIsAbandoned() {
    return SR.srtState?.name === 'abandoned';
}
function srtAttemptStatus(attemptId: string): SightReadingAttempt['status'] | null {
    return srtReadLedger(localStorage).attempts[attemptId]?.status ?? null;
}
function srtCleanupKey(attemptId: string, status: 'abandoned' | 'interrupted') {
    return attemptId + ':' + status;
}
function srtEnsureAbandoned(attempt: SrtAttemptCleanup, status: 'abandoned' | 'interrupted') {
    const key = srtCleanupKey(attempt.attemptId, status);
    const existing = srtCleanupPromises.get(key);
    if (existing)
        return existing;
    const cleanup = srtProgressLedgerUpdate({
        type: 'abandonAttempt',
        attemptId: attempt.attemptId,
        ownerTabId: attempt.ownerTabId,
        generation: attempt.generation,
        status,
        mixedInput: attempt.mixedInput,
    });
    srtCleanupPromises.set(key, cleanup);
    void cleanup.then(() => {
        if (srtCleanupPromises.get(key) === cleanup)
            srtCleanupPromises.delete(key);
    });
    return cleanup;
}
function srtClearPendingAttempt(attemptId: string) {
    if (SR.srtPendingAttempt?.attemptId === attemptId)
        SR.srtPendingAttempt = null;
}
async function srtRetryPendingSave() {
    const attempt = SR.srtPendingAttempt;
    if (!attempt)
        return;
    const epoch = srtOperationEpoch;
    const state = SR.srtState;
    const lease = SR.srtLease ?? null;
    const result = await srtProgressLedgerUpdate({ type: 'finishAttempt', attempt, generation: attempt.generation });
    if (!srtOperationStillCurrent(epoch, state, attempt.attemptId)) {
        if (result.ok || srtAttemptStatus(attempt.attemptId)) {
            srtClearPendingAttempt(attempt.attemptId);
            if (srtClaimIssuedAttemptId === attempt.attemptId)
                srtClaimIssuedAttemptId = null;
            if (srtClaimDurableAttemptId === attempt.attemptId)
                srtClaimDurableAttemptId = null;
            srtReleaseLease(lease);
        }
        else {
            const cleanup = await srtEnsureAbandoned({
                attemptId: attempt.attemptId,
                ownerTabId: attempt.ownerTabId,
                generation: attempt.generation,
                lease,
                mixedInput: attempt.mixedInput,
            }, 'abandoned');
            if (cleanup.ok) {
                srtClearPendingAttempt(attempt.attemptId);
                if (srtClaimIssuedAttemptId === attempt.attemptId)
                    srtClaimIssuedAttemptId = null;
                if (srtClaimDurableAttemptId === attempt.attemptId)
                    srtClaimDurableAttemptId = null;
                srtReleaseLease(lease);
            }
        }
        return;
    }
    if (result.ok) {
        srtSetState({ type: 'saved' });
        storeDaily();
        srtClearPendingAttempt(attempt.attemptId);
        srtReleaseLease(lease);
        srtPendingUi(false);
        srtNotice(null);
        srRenderAssessResult();
    }
    else {
        srtPendingUi(true);
        srtNotice(srtLedgerFailureMessage(result.reason, 'pending'));
    }
}
async function srtContinueWithoutSave() {
    if (SR.srtState?.name !== 'pendingSave')
        return;
    const result = await srtAbandonClaim('abandoned', false);
    void result;
}
function srtAttemptId() {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `attempt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
async function srtAbandonClaim(status: 'abandoned' | 'interrupted' = 'abandoned', transitionBeforeLedger = true) {
    const state = SR.srtState;
    const preClaimAttempt = state?.mode === 'firstSight' &&
        !!state.attemptId &&
        (state.name === 'preparing' || state.name === 'claiming') &&
        (srtClaimIssuedAttemptId !== state.attemptId ||
            SR.modeSel === 'learn' && srtClaimDurableAttemptId !== state.attemptId);
    if (preClaimAttempt) {
        const fingerprint = SR.srtFingerprint ?? null;
        srtBeginOperation();
        SR.srtPendingAttempt = null;
        SR.srtState = { ...SRT_INITIAL_STATE, fingerprint };
        return { ok: true, ledger: srtReadLedger(localStorage) } satisfies SightReadingLedgerResult;
    }
    const attempt = srtCaptureAttempt(state);
    const lease = SR.srtLease ?? null;
    const operation = srtBeginOperation();
    let expectedState = SR.srtState;
    if (transitionBeforeLedger && state && (state.name === 'preparing' || state.name === 'preview' || state.name === 'claiming' || state.name === 'countIn' || state.name === 'playing'))
        srtSetState({ type: status === 'interrupted' ? 'interrupt' : 'abandon' });
    expectedState = SR.srtState;
    const result = attempt ? await srtEnsureAbandoned(attempt, status) : { ok: true, ledger: srtReadLedger(localStorage) } satisfies SightReadingLedgerResult;
    const terminalStatus = attempt ? srtAttemptStatus(attempt.attemptId) : null;
    const stillCurrent = srtOperationStillCurrent(operation, expectedState, attempt?.attemptId ?? expectedState?.attemptId ?? null);
    if (!stillCurrent) {
        if (result.ok || terminalStatus) {
            if (attempt)
                srtClearPendingAttempt(attempt.attemptId);
            if (attempt && srtClaimIssuedAttemptId === attempt.attemptId)
                srtClaimIssuedAttemptId = null;
            if (attempt && srtClaimDurableAttemptId === attempt.attemptId)
                srtClaimDurableAttemptId = null;
            srtReleaseLease(lease);
        }
        return result;
    }
    if (!transitionBeforeLedger && state?.name === 'pendingSave') {
        if (result.ok)
            srtSetState({ type: 'abandon' });
        else if (terminalStatus === 'completed')
            srtSetState({ type: 'saved' });
        else if (terminalStatus === 'abandoned')
            srtSetState({ type: 'abandon' });
    }
    if (result.ok || terminalStatus) {
        if (attempt)
            srtClearPendingAttempt(attempt.attemptId);
        if (attempt && srtClaimIssuedAttemptId === attempt.attemptId)
            srtClaimIssuedAttemptId = null;
        if (attempt && srtClaimDurableAttemptId === attempt.attemptId)
            srtClaimDurableAttemptId = null;
        srtReleaseLease(lease);
        if (state?.name === 'pendingSave') {
            srtPendingUi(false);
            srtNotice(null);
        }
    }
    else if (!transitionBeforeLedger && state?.name === 'pendingSave') {
        srtPendingUi(true);
        srtNotice(srtLedgerFailureMessage(result.reason, 'pending'));
    }
    return result;
}
function srtCancelAttempt(status: 'abandoned' | 'interrupted' = 'interrupted') {
    const state = SR.srtState;
    if (srtPendingSaveProtected())
        return;
    if (state && (state.name === 'preparing' || state.name === 'preview' || state.name === 'claiming' || state.name === 'countIn' || state.name === 'playing')) {
        void srtAbandonClaim(status);
        return;
    }
    srtBeginOperation();
}
function srtNavigateAttempt() {
    const state = SR.srtState;
    if (state?.name === 'pendingSave') {
        void srtAbandonClaim('abandoned', false);
        return;
    }
    if (srtPendingSaveProtected())
        return;
    if (state && (state.name === 'preparing' || state.name === 'preview' || state.name === 'claiming' || state.name === 'countIn' || state.name === 'playing')) {
        void srtAbandonClaim(state.name === 'playing' ? 'interrupted' : 'abandoned');
        return;
    }
    srtBeginOperation();
}
function srtStartPractice() {
    if (!SR.srtFingerprint)
        return;
    const operation = srtBeginOperation();
    const fingerprint = SR.srtFingerprint;
    SR.srtState = SRT_INITIAL_STATE;
    srtSetState({ type: 'prepare', mode: 'practice', fingerprint });
    srtSetState({ type: 'startPreview' });
    void srAssessStart(operation);
}
async function srtStartFirstSight() {
    if ((!SR.srtPiece && !SR.lvPiece) || !SR.srtFingerprint)
        return;
    if (SR.srtState?.name !== 'idle' || SR.srtState.mode !== 'firstSight')
        return;
    const operation = srtBeginOperation();
    const claimedFingerprint = SR.srtFingerprint;
    const pendingExposure = srtExposurePromise?.fingerprint === claimedFingerprint ? srtExposurePromise.promise : null;
    const idleState = SR.srtState;
    if (pendingExposure) {
        const result = await pendingExposure;
        if (!srtOperationStillCurrent(operation, idleState, null))
            return;
        if (!result.ok)
            srtNotice(srtLedgerFailureMessage(result.reason));
        else
            srtNotice(t('rd_srt_error_already_exposed'));
        srtStartPractice();
        return;
    }
    const ledgerStatus = srtLedgerReadStatus(localStorage);
    if (STORE.blocked || ledgerStatus === 'unsupported') {
        srtStartPractice();
        srtNotice(t('rd_srt_ledger_unsupported'));
        return;
    }
    const ledger = srtReadLedger(localStorage);
    if (ledger.exposures[SR.srtFingerprint]) {
        srtNotice(t('rd_srt_error_already_exposed'));
        srtStartPractice();
        return;
    }
    if (!navigator.locks || typeof navigator.locks.request !== 'function') {
        srtStartPractice();
        srtNotice(t('rd_srt_no_locks'));
        return;
    }
    const context = ensureAudio();
    if (!context) {
        audioLockCheck();
        return;
    }
    if (context.state !== 'running') {
        const ready = await timedAudioReady(context);
        if (!srtOperationStillCurrent(operation, idleState, null) || !ready)
            return;
    }
    srtNotice(null);
    srtSetState({ type: 'prepare', mode: 'firstSight', fingerprint: SR.srtFingerprint, attemptId: srtAttemptId() });
    srtSetState({ type: 'claim' });
    const attemptId = SR.srtState?.attemptId;
    if (!attemptId)
        return;
    const lease = srtAcquireAttemptLease(attemptId);
    if (!lease) {
        byId('rd-verdict').textContent = t('rd_srt_no_locks');
        return;
    }
    SR.srtLease = lease;
    srtClaimIssuedAttemptId = null;
    srtClaimDurableAttemptId = null;
    await lease.ready;
    const claimingState = SR.srtState;
    if (!srtOperationStillCurrent(operation, claimingState, attemptId)) {
        srtReleaseLease(lease);
        return;
    }
    srtClaimIssuedAttemptId = attemptId;
    const result = await srtProgressLedgerUpdate({
        type: 'claimExposure',
        fingerprint: SR.srtFingerprint,
        attemptId,
        ownerTabId: SR.srtOwnerTabId || '',
        generation: ledger.generation,
    });
    if (result.ok)
        srtClaimDurableAttemptId = attemptId;
    if (!srtOperationStillCurrent(operation, claimingState, attemptId)) {
        if (result.ok) {
            const cleanup: SrtAttemptCleanup = {
                attemptId,
                ownerTabId: SR.srtOwnerTabId || '',
                generation: result.ledger.generation,
                lease,
                mixedInput: srtRecorder?.mixedInput ?? false,
            };
            const cancelledByNavigation = srtIsAbandoned() || SR.srtFingerprint !== claimedFingerprint;
            await srtEnsureAbandoned(cleanup, cancelledByNavigation ? 'abandoned' : 'interrupted');
            if (srtClaimIssuedAttemptId === attemptId)
                srtClaimIssuedAttemptId = null;
            if (srtClaimDurableAttemptId === attemptId)
                srtClaimDurableAttemptId = null;
        }
        else if (srtClaimIssuedAttemptId === attemptId)
            srtClaimIssuedAttemptId = null;
        if (!result.ok && srtClaimDurableAttemptId === attemptId)
            srtClaimDurableAttemptId = null;
        srtReleaseLease(lease);
        return;
    }
    if (!result.ok) {
        if (srtClaimIssuedAttemptId === attemptId)
            srtClaimIssuedAttemptId = null;
        if (srtClaimDurableAttemptId === attemptId)
            srtClaimDurableAttemptId = null;
        srtReleaseLease(lease);
        const retryable = result.reason === 'stale_generation' || result.reason === 'conflict' || result.reason === 'owner_mismatch';
        if (retryable) {
            SR.srtState = { ...SRT_INITIAL_STATE, fingerprint: claimedFingerprint };
            SR.srtPendingAttempt = null;
            srDraw();
            srtNotice(srtLedgerFailureMessage(result.reason));
            return;
        }
        if (result.reason === 'storage' || result.reason === 'quota' || result.reason === 'unsupported') {
            srtStartPractice();
            srtNotice(srtLedgerFailureMessage(result.reason));
            return;
        }
        srtSetState({ type: 'blocked', reason: result.reason });
        const message = srtLedgerFailureMessage(result.reason);
        byId('rd-verdict').textContent = message;
        if (result.reason === 'already_exposed')
            srtNotice(message);
        return;
    }
    srtSetState({ type: 'claimed' });
    srDraw();
    if (SR.lvPiece) {
        // A level piece was on the page already: the claimed attempt starts at once (a count-in, or the note that started it).
        srtStartClaimedAttempt(operation);
        return;
    }
    srtPreviewUi(true);
    // The older melodies get 20 seconds to look.
    SR.srtCountdown = 20;
    byId('rd-srt-countdown').textContent = t('rd_srt_countdown', SR.srtCountdown);
    window.clearInterval(SR.srtPreviewTimer);
    const previewOperation = srtOperationEpoch;
    SR.srtPreviewTimer = window.setInterval(() => {
        if (previewOperation !== srtOperationEpoch || SR.srtState?.name !== 'preview' || SR.srtState.attemptId !== attemptId) {
            srtClearPreview();
            return;
        }
        SR.srtCountdown = Math.max(0, (SR.srtCountdown || 0) - 1);
        byId('rd-srt-countdown').textContent = t('rd_srt_countdown', SR.srtCountdown);
        if (SR.srtCountdown <= 0) {
            srtClearPreview();
            srtStartClaimedAttempt(previewOperation);
        }
    }, 1000);
}
function srtStartClaimedAttempt(operation = srtOperationEpoch) {
    const state = SR.srtState;
    if (operation !== srtOperationEpoch || state?.name !== 'preview' || state.mode !== 'firstSight' || !state.attemptId)
        return;
    srtClearPreview();
    srtSetState({ type: 'startNow' });
    if (SR.srtState?.name !== 'countIn' || SR.srtState.attemptId !== state.attemptId)
        return;
    void srAssessStart(operation);
}
async function srtSwitchToPractice() {
    const operation = srtBeginOperation();
    const state = SR.srtState;
    const attempt = srtCaptureAttempt(state);
    if (state?.name === 'preview')
        srtSetState({ type: 'abandon' });
    const result = attempt ? await srtEnsureAbandoned(attempt, 'abandoned') : { ok: true, ledger: srtReadLedger(localStorage) } satisfies SightReadingLedgerResult;
    const terminalStatus = attempt ? srtAttemptStatus(attempt.attemptId) : null;
    if (!srtOperationStillCurrent(operation, SR.srtState, attempt?.attemptId ?? null)) {
        if (result.ok || terminalStatus) {
            srtClearPendingAttempt(attempt?.attemptId ?? '');
            if (attempt && srtClaimIssuedAttemptId === attempt.attemptId)
                srtClaimIssuedAttemptId = null;
            if (attempt && srtClaimDurableAttemptId === attempt.attemptId)
                srtClaimDurableAttemptId = null;
            srtReleaseLease(attempt?.lease ?? null);
        }
        else
            srtReleaseLease(attempt?.lease ?? null);
        return;
    }
    if (!result.ok && !terminalStatus) {
        srtReleaseLease(attempt?.lease ?? null);
        srtClearPendingAttempt(attempt?.attemptId ?? '');
        if (attempt && srtClaimIssuedAttemptId === attempt.attemptId)
            srtClaimIssuedAttemptId = null;
        if (attempt && srtClaimDurableAttemptId === attempt.attemptId)
            srtClaimDurableAttemptId = null;
        srtStartPractice();
        srtNotice(srtLedgerFailureMessage(result.reason, 'practice-switch'));
        return;
    }
    if (!result.ok && terminalStatus === 'completed') {
        srtReleaseLease(attempt?.lease ?? null);
        srtClearPendingAttempt(attempt?.attemptId ?? '');
        if (attempt && srtClaimIssuedAttemptId === attempt.attemptId)
            srtClaimIssuedAttemptId = null;
        if (attempt && srtClaimDurableAttemptId === attempt.attemptId)
            srtClaimDurableAttemptId = null;
        srtPendingUi(false);
        srtSetState({ type: 'saved' });
        srRenderAssessResult();
        return;
    }
    srtReleaseLease(attempt?.lease ?? null);
    SR.srtPendingAttempt = null;
    SR.srtState = SRT_INITIAL_STATE;
    srtSetState({ type: 'prepare', mode: 'practice', fingerprint: SR.srtFingerprint ?? undefined });
    srtSetState({ type: 'startPreview' });
    srDraw();
    void srAssessStart(operation);
}
async function srAssessStart(operation?: number) {
    const srtState = SR.srtState;
    if (srtGeneratedSelected() && srtState?.mode === 'firstSight' &&
        (srtState.name !== 'countIn' || !srtState.attemptId ||
            srtCountInEpoch !== srtOperationEpoch || srtCountInAttemptId !== srtState.attemptId ||
            operation !== undefined && operation !== srtOperationEpoch))
        return;
    const context = ensureAudio();
    if (!context) {
        srStopAll();
        return;
    }
    const runId = ++srAssessRunId;
    SR.active = true;
    if (context.state !== 'running') {
        const epoch = srtOperationEpoch;
        const ready = await timedAudioReady(context);
        if (!SR.active || runId !== srAssessRunId || epoch !== srtOperationEpoch) return;
        if (!ready) {
            srStopAll();
            return;
        }
    }
    srStartStage();
    rdnNavUi();
    rdWarmButtonsSync();
    SR.results = {};
    SR.wrongExtra = 0;
    SR.srtEvaluation = null;
    SR.srtResultValue = null;
    SR.srtResultLevelId = null;
    SR.next = null;
    srCoach();
    rdnResultHide();
    SR.steps.forEach((s) => s.closed = false);
    srPaintAll();
    if (!SR.piece)
        throw new Error('Étude: no piece selected');
    const lvPiece = srtGeneratedSelected() ? SR.lvPiece ?? null : null;
    // First sight: a level piece is played at its level's tempo, an older melody at 60.
    SR.bpm = SR.srtState?.mode === 'firstSight' ? (lvPiece ? rdnBpm(lvPiece) : 60) : +(inputById('rd-bpm').value || SR.piece.bpm);
    inputById('rd-bpm').value = String(SR.bpm);
    byId('rd-bpmLbl').textContent = String(SR.bpm);
    const bs = 60 / SR.bpm, cap = SR.piece.ts[1] === 8 ? SR.piece.ts[0] * 0.5 : SR.piece.ts[0], ci = cap, pk = SR.piece.pickup || 0;
    let act0 = context.currentTime + 0.15, perf0 = performance.now() + 150;
    // The count-in lasts one bar. A level piece clicks once per beat of its meter (so 3/8 and 6/8 count right).
    let lead = ci * bs;
    const first = lvPiece ? srFirstNotes() : null, noteStart = first ? srNoteStartTake() : null;
    if (lvPiece && noteStart && first) {
        // Started by its first note: no count-in. That note is the first onset of the piece, and the clicks go on from it.
        lead = 0;
        perf0 = noteStart.perf - first.beat * bs * 1000;
        act0 = context.currentTime - (performance.now() - perf0) / 1000;
        const from = context.currentTime + 0.03;
        srtLevelClicks(lvPiece, SR.bpm).filter((c) => act0 + c.ms / 1000 > from).forEach((c) => srClick(act0 + c.ms / 1000, c.accent));
    }
    else if (lvPiece) {
        const clicks = srtLevelClicks(lvPiece, SR.bpm), barMs = srtLevelDurationMs(lvPiece, SR.bpm) / lvPiece.bars;
        lead = barMs / 1000;
        clicks.filter((c) => c.ms < barMs - 1e-6).forEach((c) => srClick(act0 + c.ms / 1000, c.accent));
        clicks.forEach((c) => srClick(act0 + lead + c.ms / 1000, c.accent));
    }
    else {
        for (let b = 0; b < ci; b++)
            srClick(act0 + b * bs, b === 0);
        for (let b = 0; b <= SR.totalBeats + 1e-3; b++) {
            const rel = b - pk;
            srClick(act0 + (ci + b) * bs, rel >= 0 && Math.abs(rel % cap) < 1e-3);
        }
    }
    const sel = srActiveHands();
    if (sel !== 'both' && srHandsAvail() === 'both')
        SR.notes.filter((n) => n.hand !== sel).forEach((n) => previewNote(n.midi, act0 + lead + n.beat * bs, Math.max(.15, n.dur * bs * .9), 78));
    SR.t0 = perf0 + lead * 1000;
    SR.anyOctave = !!data.settings.anyOctave;
    SR.instantFeedback = !!data.reading?.prefs?.instantFeedback;
    srInstantReset();
    if (SR.instantFeedback)
        srInstantTracker = createInstantFeedbackTracker(srInstantNotes(), { anyOctave: SR.anyOctave });
    srtRecorder = new SightReadingRecorder({ durationMs: lvPiece ? srtLevelDurationMs(lvPiece, SR.bpm) : SR.totalBeats * bs * 1000 });
    // The note that started the attempt, and what was played while the first sight was being claimed, belong to it.
    if (noteStart)
        for (const ev of noteStart.events) {
            const relMs = ev.perf - SR.t0;
            srtRecorder.record(ev.kind, ev.midi, ev.source, ev.releaseKind, relMs);
            if (ev.kind === 'on' && SR.instantFeedback)
                srInstantHandleNote(ev.midi, relMs);
        }
    // The checklist goes out of sight but keeps its room: the score must not move under the first note.
    const checklist = maybeById('rdn-checklist');
    if (checklist)
        checklist.style.visibility = 'hidden';
    SR.assessOn = false;
    if (SR.srtState?.name === 'preparing')
        srtSetState({ type: 'startPreview' });
    if (SR.srtState?.name === 'countIn' && noteStart)
        srtSetState({ type: 'countInDone' });
    else if (SR.srtState?.name === 'countIn')
        SR.timers.push(setTimeout(() => {
            if (SR.active && SR.srtState?.name === 'countIn')
                srtSetState({ type: 'countInDone' });
        }, lead * 1000));
    if (!SR.instantFeedback || !srInstantVerdictShown) {
        const v = byId('rd-verdict');
        v.className = 'verdict neutral';
        v.textContent = t('rd_count');
    }
    byId('rd-go').textContent = t('rd_stop');
    SR.raf = requestAnimationFrame(srAssessLoop);
}
function srTol() { return Math.min(0.55, 0.3 * SR.bpm / 60); }
/* ---- a level piece starts on its first note ---- */
/** The first notes the active hands play: their beat and their keys. */
function srFirstNotes(): { beat: number; midis: number[] } | null {
    const sel = srActiveHands(), mine = SR.notes.filter((n) => sel === 'both' || n.hand === sel);
    if (!mine.length)
        return null;
    const beat = Math.min(...mine.map((n) => n.beat));
    return { beat, midis: mine.filter((n) => Math.abs(n.beat - beat) < 1e-3).map((n) => n.midi) };
}
type SrNoteStartEvent = { kind: 'on' | 'off'; midi: number; source: string; releaseKind: 'physical' | 'focus' | 'reset' | null; perf: number };
/** The key that started an attempt, when it went down, and every key event since: a first sight is claimed before the recorder exists. */
let srNoteStart: { perf: number; receivedAt: number; events: SrNoteStartEvent[] } | null = null;
/** No note starts an attempt before this time: a key still sounding from the last piece is not a start. */
let srNoteArmAt = 0;
const SR_NOTE_START_MS = 1500;
function srNoteStartHold(ms = 600) { srNoteArmAt = performance.now() + ms; }
/** True when a piano key may start the attempt: a level piece is waiting in Assessment and a MIDI or Bluetooth piano plays. */
function srNoteStartArmed(source: string) {
    const family = srtInputFamily(source);
    if (family !== 'midi' && family !== 'ble')
        return false;
    if (view0() !== 'read' || RDN.screen !== 'player' || !SR.piece || !SR.lvPiece || !srtGeneratedSelected())
        return false;
    if (SR.active || SR.listening || SR.modeSel !== 'assess' || WARM.on || srtPendingSaveProtected() || performance.now() < srNoteArmAt)
        return false;
    const state = SR.srtState;
    return !(state && (state.name === 'preparing' || state.name === 'claiming' || state.name === 'preview' || state.name === 'countIn' ||
        state.name === 'playing' || state.name === 'pendingSave' || state.name === 'completed' && SR.srtPendingAttempt?.attemptId === state.attemptId));
}
/** A key went down or came up. Returns true when the event belongs to a start by the first note (it starts one, or one is being claimed). */
function srNoteStartInput(kind: 'on' | 'off', midi: number, source: string, releaseKind: 'physical' | 'focus' | 'reset' | null) {
    const now = performance.now(), perf = inputTimeForRelease(releaseKind, now);
    const claiming = SR.srtState?.name === 'preparing' || SR.srtState?.name === 'claiming';
    // A pending start is kept only while its first sight is being claimed, and only while it can still keep time.
    if (srNoteStart && (!claiming || now - srNoteStart.receivedAt > SR_NOTE_START_MS))
        srNoteStart = null;
    if (srNoteStart) {
        srNoteStart.events.push({ kind, midi, source, releaseKind, perf });
        return true;
    }
    if (kind !== 'on' || !srNoteStartArmed(source))
        return false;
    const first = srFirstNotes(), anyOctave = !!data.settings.anyOctave;
    if (!first || !first.midis.some((m) => anyOctave ? (m - midi) % 12 === 0 : m === midi))
        return false;
    rdnAutoCancel();
    srNoteStart = { perf, receivedAt: now, events: [{ kind, midi, source, releaseKind, perf }] };
    srGo();
    // Nothing started (and no first sight is being claimed): the key was only a key.
    const name = SR.srtState?.name;
    if (!SR.active && name !== 'preparing' && name !== 'claiming')
        srNoteStart = null;
    return true;
}
/** Hands the pending start by a note to the attempt that begins now (null when there is none, or it is too old to keep time by). */
function srNoteStartTake() {
    const start = srNoteStart;
    srNoteStart = null;
    return start && performance.now() - start.receivedAt <= SR_NOTE_START_MS ? start : null;
}
function srAssessLoop(ts: number) {
    if (!SR.active || SR.modeSel !== 'assess')
        return;
    const bs = 60 / SR.bpm, bNow = (ts - SR.t0) / 1000 / bs;
    if (bNow >= 0 && !SR.assessOn) {
        SR.assessOn = true;
        if (!SR.instantFeedback || !srInstantVerdictShown)
            byId('rd-verdict').textContent = t('rd_play');
    }
    if (SR.instantFeedback && SR.assessOn)
        srInstantSweep(ts - SR.t0);
    const at = srBeatPt(SR.beatX, Math.max(0, Math.min(bNow, SR.totalBeats)));
    srCursor(at.x, at.sy);
    if (bNow >= SR.totalBeats + (0.25 / bs)) {
        srAssessFinish();
        return;
    }
    SR.raf = requestAnimationFrame(srAssessLoop);
}
function srAssessFinish() {
    // A key played just past the end is the end of this attempt, not the start of the next.
    srNoteStartHold(1000);
    const generated = srtGeneratedSelected();
    const lvPiece = generated ? SR.lvPiece ?? null : null;
    const firstSight = SR.srtState?.mode === 'firstSight' && !!SR.srtState.attemptId;
    const expected = lvPiece
        ? srtLevelExpected(lvPiece, { bpm: SR.bpm, hand: srHandSel() })
        : generated && SR.srtPiece
        ? srtBuildExpected(SR.srtPiece, { bpm: SR.bpm, hand: srActiveHands() as 'rh' | 'lh' })
        : SR.notes.map((note): SightReadingExpected => ({
            id: String(note.nid), midi: note.midi, hand: note.hand,
            onMs: note.beat * (60000 / SR.bpm), offMs: (note.beat + note.dur) * (60000 / SR.bpm),
            restBeforeMs: 0, restAfterMs: 0,
        }));
    const performed = srtRecorder?.finish().map((input): SightReadingPerformed => ({
        id: input.id, midi: input.midi, onMs: input.onMs, offMs: input.offMs,
    })) ?? [];
    const restWindows = lvPiece ? rdnRestWindows(lvPiece, SR.bpm, srHandSel()) : generated && SR.srtPiece ? SR.srtPiece.events
        .filter((event) => event.pitches.length === 0)
        .map((event) => ({ startMs: event.onsetTick * 60000 / SR.bpm / 480, endMs: (event.onsetTick + event.durationTick) * 60000 / SR.bpm / 480 })) : [];
    // A level piece allows 120 ms between the notes of one beat (two hands rarely land closer); the old path keeps 60.
    const evaluated = srtEvaluate(expected, performed, { restWindows, anyOctave: !!SR.anyOctave, ...(lvPiece ? { chordWindowMs: RDN_CHORD_WINDOW_MS } : {}) });
    if (evaluated) {
        const renderedNotes = SR.notes.filter((note) => srActiveHands() === 'both' || note.hand === srActiveHands());
        // A level piece lists the right hand first and may start both hands together: its results find their notes by id.
        const idMap = lvPiece ? rdnDrawnIds(lvPiece, expected) : null;
        evaluated.noteResults.forEach((result, index) => {
            const nid = idMap ? idMap.get(result.expectedId) : renderedNotes[index]?.nid ?? Number(result.expectedId);
            if (nid === undefined)
                return;
            SR.results[nid] = result.classification === 'good' || result.classification === 'near'
                ? result.classification
                : 'bad';
        });
        SR.wrongExtra = evaluated.FP;
    }
    const totalN = expected.length;
    const good = evaluated ? evaluated.G : Object.values(SR.results).filter((r) => r === 'good').length;
    const pct = evaluated?.score == null ? (totalN ? Math.round(100 * good / totalN) : 0) : Math.round(evaluated.score);
    SR.next = srNextAssess(pct);
    srStopAll(true, true);
    srtSetState({ type: 'finish' });
    SR.srtEvaluation = evaluated;
    SR.srtResultValue = pct;
    SR.srtResultLevelId = SR.piece?.gen ?? null;
    if (SR.piece?.gen)
        rdSightDone('assess', pct);
    srRenderAssessResult();
    if (lvPiece && evaluated && evaluated.score != null) {
        rdnRecord(pct, rdnStars(evaluated.stars), firstSight);
        rdnResultShow(true);
    }
    if (evaluated && generated && SR.srtState?.attemptId && SR.srtFingerprint && SR.srtOwnerTabId) {
        const attempt: SightReadingAttempt = {
            ...evaluated,
            status: 'completed',
            attemptId: SR.srtState.attemptId,
            fingerprint: SR.srtFingerprint,
            ownerTabId: SR.srtOwnerTabId,
            generation: srtReadLedger(localStorage).generation,
            finishedAt: Date.now(),
            mixedInput: srtRecorder?.mixedInput ?? false,
        };
        SR.srtPendingAttempt = attempt;
        rdnNavUi();
        const saveOperation = srtOperationEpoch;
        const completedState = SR.srtState;
        const saveLease = SR.srtLease ?? null;
        void srtProgressLedgerUpdate({ type: 'finishAttempt', attempt, generation: attempt.generation }).then(async (result) => {
            if (!srtOperationStillCurrent(saveOperation, completedState, attempt.attemptId)) {
                if (result.ok || srtAttemptStatus(attempt.attemptId)) {
                    srtClearPendingAttempt(attempt.attemptId);
                    if (srtClaimIssuedAttemptId === attempt.attemptId)
                        srtClaimIssuedAttemptId = null;
                    srtReleaseLease(saveLease);
                }
                else {
                    const cleanup = await srtEnsureAbandoned({
                        attemptId: attempt.attemptId,
                        ownerTabId: attempt.ownerTabId,
                        generation: attempt.generation,
                        lease: saveLease,
                        mixedInput: attempt.mixedInput,
                    }, 'abandoned');
                    if (cleanup.ok) {
                        srtClearPendingAttempt(attempt.attemptId);
                        if (srtClaimIssuedAttemptId === attempt.attemptId)
                            srtClaimIssuedAttemptId = null;
                        srtReleaseLease(saveLease);
                    }
                }
                return;
            }
            if (result.ok) {
                srtSetState({ type: 'saved' });
                storeDaily();
                srtClearPendingAttempt(attempt.attemptId);
                if (srtClaimIssuedAttemptId === attempt.attemptId)
                    srtClaimIssuedAttemptId = null;
                srtReleaseLease(saveLease);
                srtPendingUi(false);
            } else {
                srtSetState({ type: 'saveFailed' });
                srtPendingUi(true);
                srtNotice(srtLedgerFailureMessage(result.reason, 'pending'));
                srRenderAssessResult();
            }
        });
    }
    srPaintAll();
    srtRecorder = null;
    markReadDoneToday();
    touchDay();
    saveAll();
}
function srRenderAssessResult() {
    const evaluated = SR.srtEvaluation;
    if (!evaluated)
        return;
    const pct = SR.srtResultValue ?? (evaluated.score == null ? 0 : Math.round(evaluated.score));
    const stars = evaluated.stars;
    const v = byId('rd-verdict');
    v.className = 'verdict ' + (stars >= 2 ? 'good' : stars ? 'neutral' : 'bad');
    const firstSightResult = srtGeneratedSelected() && SR.srtState?.mode === 'firstSight' && SR.srtState.attemptId !== null;
    const practiceResult = srtGeneratedSelected() && SR.srtState?.mode === 'practice';
    const modeLabel = firstSightResult ? t('rd_srt_first_sight') : practiceResult ? t('rd_srt_practice_badge') : '';
    const modeSuffix = modeLabel ? ' · ' + modeLabel : '';
    let text = t('rd_score', pct) + '  ' + '★'.repeat(stars) + '☆'.repeat(3 - stars) + modeSuffix +
        ' · ' + t('rd_srt_summary', Math.round(evaluated.pitchF1 ?? 0), evaluated.TP, evaluated.N, evaluated.FP, Math.round(evaluated.rhythmAcc ?? 0), Math.round(evaluated.meanOffsetMs ?? 0));
    if (SR.wrongExtra)
        text += '  ·  ' + t('rd_extra', SR.wrongExtra);
    if (SR.srtState?.name === 'pendingSave')
        text += ' · ' + t('rd_srt_unsaved');
    v.textContent = text;
}
function srKeyInput(m: number) {
    if (!SR.active)
        return;
    if (SR.modeSel === 'learn') {
        const st = SR.steps[SR.stepIdx];
        if (!st)
            return;
        const need = st.notes.find((n: { nid: number; midi: number; }) => !SR.hit.has(n.nid) && (SR.anyOctave ? pc(n.midi) === pc(m) : n.midi === m));
        if (need) {
            SR.hit.add(need.nid);
            SR.results[need.nid] = 'good';
            if (st.notes.every((n: { nid: number; }) => SR.hit.has(n.nid))) {
                const next = SR.steps[SR.stepIdx + 1];
                srPlayGap(st.beat, next ? next.beat : 1e9);
                SR.stepIdx++;
                SR.hit.clear();
                if (SR.stepIdx >= SR.steps.length) {
                    srPaintAll();
                    srLearnFinish();
                    return;
                }
                srCount();
            }
            srPaintAll();
            srTargets();
            srScrollStep();
        }
        else {
            SR.mistakes++;
            srSlipNote(st, m);
            kbState(m, 'bad', true);
            SR.timers.push(setTimeout(() => { const el = keyEl.get(foldToView(m)); if (el && el.dataset.s === 'bad')
                kbState(m, null, true); srTargets(); }, 320));
            srCount();
        }
    }
}
function srListen() {
    if (!SR.piece)
        return;
    if (srtPendingSaveProtected())
        return;
    srtCancelAttempt('interrupted');
    if (SR.listening) {
        srStopAll(true, true);
        return;
    }
    if (srtGeneratedSelected() && SR.srtFingerprint)
        srtExposeForPractice('listen', 'listen');
    ensureAudio();
    srStopAll(true, true);
    SR.bpm = +(inputById('rd-bpm').value || SR.piece.bpm);
    inputById('rd-bpm').value = String(SR.bpm);
    byId('rd-bpmLbl').textContent = String(SR.bpm);
    if (!audioEngine.context)
        return;
    const bs = 60 / SR.bpm, act0 = audioEngine.context.currentTime + 0.1, perf0 = performance.now() + 100;
    SR.listening = true;
    byId('rd-listen').textContent = t('rd_stop');
    rdWarmButtonsSync();
    const follow = () => { if (!SR.listening)
        return; const b = (performance.now() - perf0) / 1000 / bs; if (b >= 0) {
        const at = srBeatPt(SR.beatX, Math.min(b, SR.totalBeats));
        srCursor(at.x, at.sy);
    } SR.raf = requestAnimationFrame(follow); };
    SR.raf = requestAnimationFrame(follow);
    SR.timers.push(setTimeout(() => srStopAll(true), SR.totalBeats * bs * 1000 + 400));
    SR.notes.forEach((n) => {
        previewNote(n.midi, act0 + n.beat * bs, Math.max(.15, n.dur * bs * .92), n.hand === 'lh' ? 80 : 96);
        SR.timers.push(setTimeout(() => {
            const svg = srSvg(), g = svg && svg.querySelector('.ss-n[data-nid="' + n.nid + '"]');
            if (!(g instanceof SVGElement))
                return;
            const prev = g.getAttribute('data-s');
            g.dataset.s = 'now';
            SR.timers.push(setTimeout(() => { if (g.dataset.s === 'now') {
                if (prev)
                    g.dataset.s = prev;
                else
                    g.removeAttribute('data-s');
            } }, Math.max(200, n.dur * bs * 900)));
        }, Math.max(0, (perf0 - performance.now()) + n.beat * bs * 1000)));
    });
}
function srGo() {
    if (!SR.piece)
        return;
    const srtState = SR.srtState;
    if (srtState && (srtState.name === 'preparing' || srtState.name === 'claiming' || srtState.name === 'preview' ||
        srtState.name === 'pendingSave' || srtState.name === 'completed' && SR.srtPendingAttempt?.attemptId === srtState.attemptId))
        return;
    if (SR.active) {
        srStopAll();
        byId('rd-verdict').textContent = '';
        return;
    }
    if (SCORE_FOCUS.owner !== 'read') SCORE_FOCUS.readOverride = null;
    srStopAll();
    ensureAudio();
    SR.bpm = +(inputById('rd-bpm').value || SR.piece.bpm);
    if (SR.modeSel === 'learn')
        srLearnStart();
    else if (srtGeneratedSelected() && SR.lvPiece && SR.srtState?.mode === 'firstSight' && SR.srtState.name === 'idle' && srHandSel() !== 'both') {
        // A level piece's first sight is played with both hands: one hand is practice, with no first-sight claim.
        srtExposeForPractice('hands');
        srtStartPractice();
    }
    else if (srtGeneratedSelected() && SR.srtState?.mode === 'firstSight' && SR.srtState.name === 'idle')
        void srtStartFirstSight();
    else if (srtGeneratedSelected()) {
        const state = SR.srtState;
        if (state?.name === 'pendingSave' || state?.name === 'preview' || state?.name === 'claiming' || state?.name === 'preparing')
            return;
        if (SR.modeSel === 'assess' && (state?.mode === 'practice' || state?.name === 'completed' || state?.name === 'saved' ||
            state?.name === 'abandoned' || state?.name === 'interrupted'))
            srtNotice(t('rd_srt_error_already_exposed'));
        if (state?.name === 'blocked' && state.mode === 'firstSight' && state.reason !== 'already_exposed')
            srtExposeForPractice('practice');
        if (state?.mode === 'practice' || state?.name === 'completed' || state?.name === 'saved' ||
            state?.name === 'abandoned' || state?.name === 'interrupted' || state?.name === 'blocked' ||
            state?.mode === 'firstSight')
            srtStartPractice();
        else
            return;
    }
    else
        void srAssessStart();
}
interface RdKeyInfo { tonicPc: number; minor: boolean; flat: boolean; keyN: number; }
function rdCurrentKeyInfo(): RdKeyInfo | null {
    if (SR.lvPiece) {
        const rk = SR.lvPiece.key;
        const majorPc = srKeyName(rk.keyN);
        const minor = rk.mode === 'minor';
        const tonicPc = minor ? (majorPc + 9) % 12 : majorPc;
        return { tonicPc, minor, flat: rk.keyN < 0, keyN: rk.keyN };
    }
    if (SR.piece) {
        const n = SR.piece.keyN || 0;
        const majorPc = srKeyName(n);
        const minor = !!SR.piece.minor;
        const tonicPc = minor ? (majorPc + 9) % 12 : majorPc;
        return { tonicPc, minor, flat: n < 0, keyN: n };
    }
    return null;
}
function rdWarmButtonsSync() {
    const info = rdCurrentKeyInfo();
    const show = !!info;
    const busy = SR.active || SR.listening || srtPendingSaveProtected();
    const keyLabel = info ? t(info.minor ? 'key_minor' : 'key_major', pcName(info.tonicPc, info.flat)) : '';
    const tonicBtn = maybeById('rd-warm-tonic');
    const scaleBtn = maybeById('rd-warm-scale');
    if (tonicBtn) {
        tonicBtn.hidden = !show;
        if (tonicBtn instanceof HTMLButtonElement)
            tonicBtn.disabled = !show || busy;
        tonicBtn.title = keyLabel;
        tonicBtn.setAttribute('aria-label', keyLabel ? `${t('rd_warm_tonic')} — ${keyLabel}` : t('rd_warm_tonic'));
    }
    if (scaleBtn) {
        scaleBtn.hidden = !show;
        if (scaleBtn instanceof HTMLButtonElement)
            scaleBtn.disabled = !show || busy;
        scaleBtn.title = keyLabel;
        scaleBtn.setAttribute('aria-label', keyLabel ? `${t('rd_warm_scale')} — ${keyLabel}` : t('rd_warm_scale'));
    }
}
function rdWarmPlayTonic() {
    const info = rdCurrentKeyInfo();
    if (!info || SR.active || SR.listening || srtPendingSaveProtected())
        return;
    ensureAudio();
    if (!audioEngine.context)
        return;
    stopPreviews();
    const base = info.tonicPc >= 7 ? 48 + info.tonicPc : 60 + info.tonicPc;
    const t0 = audioEngine.context.currentTime + 0.04;
    previewNote(base, t0, 0.34, 88);
    previewNote(base + 7, t0 + 0.24, 0.34, 84);
    previewNote(base + 12, t0 + 0.48, 0.56, 92);
}
function rdWarmPracticeScale() {
    const info = rdCurrentKeyInfo();
    if (!info || SR.active || SR.listening || srtPendingSaveProtected())
        return;
    const key = String(info.tonicPc);
    const techKind: TechniqueKind = info.minor ? 'naturalMinor' : 'major';
    prSetTopic(TECHNIQUE_TOPIC);
    prSetKey(key);
    show('practice');
    startSession({ cat: TECHNIQUE_TOPIC, mode: 'play', key, techKind, techOctaves: 1 });
}
function srMeta() {
    const p = SR.piece, titleEl = maybeById('rd-gen-title');
    rdWarmButtonsSync();
    if (!p) {
        byId('rd-meta').textContent = '';
        if (titleEl)
            titleEl.textContent = '';
        return;
    }
    const n = p.keyN || 0;
    const keyPc = p.minor ? ((srKeyName(n) + 9) % 12) : srKeyName(n), key = t(p.minor ? 'key_minor' : 'key_major', pcName(keyPc, n < 0));
    // A level piece never names its key here: in mixed keys, reading the signature is part of the task.
    const lvHead = SR.lvPiece && srtGeneratedSelected() ? rdnHeadText() : null;
    const metaText = lvHead ? lvHead.sub + ' · ' + p.ts[0] + '/' + p.ts[1] : (p.gen ? t('rdx_sr_meta', key, p.bpm) : key) + ' · ' + p.ts[0] + '/' + p.ts[1];
    byId('rd-meta').textContent = metaText;
    if (titleEl)
        titleEl.textContent = srPieceTitle(p);
    const tEl = maybeById('rd-stage-title'), sEl = maybeById('rd-stage-sub');
    if (tEl)
        tEl.textContent = srPieceTitle(p);
    if (sEl)
        sEl.textContent = metaText;
}
function srPieceTitle(p: { id?: string; t?: Localised<string>; }) {
    return STRINGS[lang]?.['piece_title_' + p.id] ?? p.t?.[lang] ?? p.t?.en ?? '';
}
// Before the first melody the tab offers only the generator (and a way to the built-in pieces).
function srEmptyUi() {
    const none = !SR.piece;
    buttonById('rd-go').disabled = none;
    buttonById('rd-listen').disabled = none;
    rdWarmButtonsSync();
    const empty = maybeById('rd-empty');
    if (empty)
        empty.hidden = !none;
    syncMobileStartBars();
}
// Shows the generated sight-reading melody (`id` is its id); a result waiting to be saved keeps the current one.
function srSelectPiece(id: string) {
    if (srtPendingSaveProtected() || !SR.gen || id !== SR.gen.id)
        return;
    if (!SR.srtPiece && RD.L && isRdSightLevel(RD.L)) {
        rdSightStart(SR.modeSel === 'assess' ? 'test' : 'practice');
        return;
    }
    srShowPiece(SR.gen);
}
// Draws a piece in the engine: the generated melody, or a fixture piece loaded through the test surface.
function srShowPiece(piece: SrPiece) {
    if (srtPendingSaveProtected())
        return;
    srStopAll(undefined, false, 'navigate');
    SR.srtEvaluation = null;
    SR.srtResultValue = null;
    SR.srtResultLevelId = null;
    SR.piece = piece;
    if (!SR.gen) {
        SR.srtPiece = null;
        SR.lvPiece = null;
        SR.srtFingerprint = null;
        SR.srtState = SRT_INITIAL_STATE;
        SR.srtPendingAttempt = null;
    }
    SR.bpm = piece.bpm;
    const bp = inputById('rd-bpm');
    bp.value = String(piece.bpm);
    byId('rd-bpmLbl').textContent = String(piece.bpm);
    rdnHandsUi();
    const avail = srHandsAvail();
    [byId('rd-hands'), maybeById('rd-stage-hands')].forEach((container) => {
        if (!container)
            return;
        [...container.children].forEach((b) => {
            if (!(b instanceof HTMLButtonElement))
                return;
            b.disabled = avail !== 'both';
            b.setAttribute('aria-pressed', (avail === 'both' ? b.dataset.v === SR.hands : b.dataset.v === avail) ? 'true' : 'false');
        });
    });
    const consumedForLearn = srtConsumeOnLearnReveal();
    srDraw();
    srMeta();
    srEmptyUi();
    byId('rd-verdict').textContent = '';
    srtNotice(null);
    if (!consumedForLearn && srtGeneratedSelected() && (SR.srtState?.mode === 'practice' || SR.srtState?.name === 'abandoned' || SR.srtState?.name === 'interrupted')) {
        const message = t('rd_srt_error_already_exposed');
        srtNotice(message);
        if (SR.srtState.name === 'abandoned' || SR.srtState.name === 'interrupted') {
            byId('rd-verdict').className = 'verdict neutral';
            byId('rd-verdict').textContent = message;
        }
    }
}
function renderRead() {
    if (RDN.fresh) {
        RDN.fresh = false;
        RDN.screen = 'home';
    }
    if (SR.piece)
        srDraw();
    srMeta();
    srEmptyUi();
    rdRender();
}
/* ============================================================================
   READING DRILLS (V3) — a structured, CMRT-style reading curriculum:
   note naming / playing, key→staff, intervals, chords, key signatures, rhythm,
   C clefs and generated sight-reading, with optional weak-spot injection, stars & stats.
   ============================================================================ */
type ReadClefStaff = 'treble' | 'bass' | 'alto' | 'tenor';
type ReadClefDraw = ReadClefStaff | 'grand';
type ReadClef = ReadClefDraw | 'mix';
type ReadDrillType = 'name' | 'play' | 'k2s' | 'ks' | 'iv' | 'ch' | 'rh' | 'sr';
const READ_DRILL_TYPES: readonly ReadDrillType[] = ['name', 'play', 'k2s', 'ks', 'iv', 'ch', 'rh', 'sr'];
const READ_CLEFS: readonly ReadClef[] = ['treble', 'bass', 'alto', 'tenor', 'grand', 'mix'];
function isReadDrillType(v: string): v is ReadDrillType { return READ_DRILL_TYPES.some((x) => x === v); }
function isReadClef(v: string): v is ReadClef { return READ_CLEFS.some((x) => x === v); }
type ReadDrillChordQuality = 'maj' | 'min' | 'dim' | 'aug';
const RD_REF: Record<ReadClefStaff, number> = { treble: 30, bass: 18, alto: 24, tenor: 22 };
const RD_CLEFC: Record<ReadClefStaff, string> = { treble: 't', bass: 'b', alto: 'a', tenor: 'n' };
const RD_MAJ = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'], RD_MIN = ['Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#'];
const RD_CHQ: Record<ReadDrillChordQuality, number[]> = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8] };
const RD_TARGET: Partial<Record<ReadDrillType, number>> = { name: 2500, play: 3500, k2s: 4000, iv: 3500, ch: 6000, ks: 5000 };
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
interface ReadDrillPitch { li: number; oct: number; acc: number; }
function rdP(s: string | undefined): ReadDrillPitch { const p = s === undefined ? null : srPitch(s); if (!p)
    throw new Error('Étude: bad pitch ' + s); return { li: p.li, oct: p.oct, acc: p.acc }; }
function rdStep(n: { li: number; oct: number; }) { return n.oct * 7 + n.li; }
function rdMidi(n: { li: number; oct: number; acc?: number; }) { return ssMidiOf(n.li, n.oct, n.acc || 0); }
function rdFromStep(s: number, acc?: number): ReadDrillPitch { return { li: ((s % 7) + 7) % 7, oct: Math.floor(s / 7), acc: acc || 0 }; }
function rdAccSym(a: number) { return a > 0 ? '♯' : a < 0 ? '♭' : ''; }
function rdLetter(li: number) { return (LETTERS[notation] || LETTERS.letter)[li]; }
function rdName(n: { li: number; oct: number; acc?: number; }, oct?: boolean) { return spelledName(notation, n.li, n.acc || 0) + (oct ? n.oct : ''); }
function rdSpell(s: string) { const m = /^([A-G])([#b]?)$/.exec(s); return m ? spelledName(notation, SR_LET.indexOf(m[1]), m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) : ''; }
function rdKeyLabel(k: number) { return t('key_major', rdSpell(RD_MAJ[k + 7])); }
function rdKeyMinor(k: number) { return t('key_minor', rdSpell(RD_MIN[k + 7])); }
function rdNk(clef: ReadClefStaff, n: { li: number; oct: number; acc?: number; }) { return RD_CLEFC[clef] + ':' + SR_LET[n.li] + ((n.acc || 0) > 0 ? '#' : (n.acc || 0) < 0 ? 'b' : '') + n.oct; }
function rdEsc(s: string | number | undefined) { return String(s).replace(/[&<>"]/g, (c) => c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'); }
/* ---- curriculum ---- */
interface ReadDrillLevelSpec { ty: ReadDrillType; clef?: ReadClef; set?: string[]; tag?: string; lo?: string; hi?: string; acc?: number; keys?: number | number[]; keyN?: number; kmax?: number; ivs?: number[]; harm?: number; q?: ReadDrillChordQuality[]; inv?: number; units?: string[]; bpm?: number; durs?: number[]; }
interface ReadDrillLevel extends ReadDrillLevelSpec { u: string; n: number; id: string; custom?: boolean; }
interface ReadDrillUnit { u: string; icon: string; lv: ReadDrillLevel[]; }
const RD_UNITS: ReadDrillUnit[] = [], RD_LV: { [levelId: string]: ReadDrillLevel; } = {};
function rdU(u: string, icon: string, list: ReadDrillLevelSpec[]) { const lv = list.map((o, i) => Object.assign({ u, n: i + 1, id: u + (i + 1) }, o)); RD_UNITS.push({ u, icon, lv }); lv.forEach((L) => { RD_LV[L.id] = L; }); }
const rdS = (a: string) => a.split(' '), RD_ALLIV = [2, 3, 4, 5, 6, 7, 8];
rdU('tr', '𝄞', [
    { ty: 'name', clef: 'treble', set: rdS('C4 G4 C5'), tag: 'land' },
    { ty: 'name', clef: 'treble', lo: 'C4', hi: 'G4' },
    { ty: 'name', clef: 'treble', lo: 'C4', hi: 'C5' },
    { ty: 'name', clef: 'treble', set: rdS('E4 G4 B4 D5 F5'), tag: 'lines' },
    { ty: 'name', clef: 'treble', set: rdS('F4 A4 C5 E5'), tag: 'spaces' },
    { ty: 'name', clef: 'treble', lo: 'C4', hi: 'G5' },
    { ty: 'name', clef: 'treble', lo: 'G5', hi: 'D6', tag: 'ledup' },
    { ty: 'name', clef: 'treble', lo: 'A3', hi: 'D4', tag: 'leddn' },
    { ty: 'play', clef: 'treble', lo: 'C4', hi: 'G5' },
    { ty: 'k2s', clef: 'treble', lo: 'C4', hi: 'G5' },
    { ty: 'name', clef: 'treble', lo: 'A3', hi: 'C6', tag: 'full' }
]);
rdU('ba', '𝄢', [
    { ty: 'name', clef: 'bass', set: rdS('G2 C3 F3 C4'), tag: 'land' },
    { ty: 'name', clef: 'bass', lo: 'C3', hi: 'G3' },
    { ty: 'name', clef: 'bass', lo: 'C3', hi: 'C4' },
    { ty: 'name', clef: 'bass', set: rdS('G2 B2 D3 F3 A3'), tag: 'lines' },
    { ty: 'name', clef: 'bass', set: rdS('A2 C3 E3 G3'), tag: 'spaces' },
    { ty: 'name', clef: 'bass', lo: 'F2', hi: 'C4' },
    { ty: 'name', clef: 'bass', lo: 'C2', hi: 'F2', tag: 'leddn' },
    { ty: 'name', clef: 'bass', lo: 'B3', hi: 'G4', tag: 'ledup' },
    { ty: 'play', clef: 'bass', lo: 'F2', hi: 'C4' },
    { ty: 'k2s', clef: 'bass', lo: 'F2', hi: 'C4' },
    { ty: 'name', clef: 'bass', lo: 'C2', hi: 'E4', tag: 'full' }
]);
rdU('gr', '𝄞𝄢', [
    { ty: 'name', clef: 'grand', lo: 'C3', hi: 'C5' },
    { ty: 'name', clef: 'grand', lo: 'F2', hi: 'G5' },
    { ty: 'play', clef: 'grand', lo: 'C3', hi: 'C5' },
    { ty: 'play', clef: 'grand', lo: 'F2', hi: 'G5' },
    { ty: 'k2s', clef: 'grand', lo: 'F2', hi: 'G5' },
    { ty: 'name', clef: 'grand', lo: 'C2', hi: 'C6', tag: 'full' }
]);
rdU('ac', '♯', [
    { ty: 'name', clef: 'treble', lo: 'C4', hi: 'C5', acc: 1 },
    { ty: 'name', clef: 'treble', lo: 'C4', hi: 'C5', acc: -1 },
    { ty: 'name', clef: 'treble', lo: 'C4', hi: 'G5', acc: 2 },
    { ty: 'name', clef: 'bass', lo: 'F2', hi: 'C4', acc: 2 },
    { ty: 'play', clef: 'grand', lo: 'C3', hi: 'C5', acc: 2 }
]);
rdU('ks', '♭', [
    { ty: 'ks', clef: 'treble', kmax: 2 },
    { ty: 'ks', clef: 'treble', kmax: 4 },
    { ty: 'ks', clef: 'grand', kmax: 7 },
    { ty: 'name', clef: 'treble', lo: 'C4', hi: 'G5', keys: 3 },
    { ty: 'play', clef: 'grand', lo: 'C3', hi: 'C5', keys: 3 }
]);
rdU('iv', '⇕', [
    { ty: 'iv', clef: 'treble', lo: 'C4', hi: 'A5', ivs: [2, 3, 4, 5] },
    { ty: 'iv', clef: 'treble', lo: 'C4', hi: 'A5', ivs: RD_ALLIV },
    { ty: 'iv', clef: 'treble', lo: 'C4', hi: 'A5', ivs: RD_ALLIV, harm: 1 },
    { ty: 'iv', clef: 'bass', lo: 'E2', hi: 'C4', ivs: RD_ALLIV, harm: 2 }
]);
rdU('ch', '♫', [
    { ty: 'ch', clef: 'treble', lo: 'C4', hi: 'C5', q: ['maj', 'min'] },
    { ty: 'ch', clef: 'treble', lo: 'C4', hi: 'C5', q: ['maj', 'min', 'dim', 'aug'] },
    { ty: 'ch', clef: 'treble', lo: 'C4', hi: 'C5', q: ['maj', 'min'], inv: 1 },
    { ty: 'ch', clef: 'bass', lo: 'C3', hi: 'C4', q: ['maj', 'min', 'dim', 'aug'], inv: 1 }
]);
rdU('rh', '♩', [
    { ty: 'rh', units: ['4', '2', '1'], bpm: 80 },
    { ty: 'rh', units: ['4', '2', '8'], bpm: 80 },
    { ty: 'rh', units: ['4', '2', '8', 'r4'], bpm: 84 },
    { ty: 'rh', units: ['4', '8', 'd', 'r4'], bpm: 84 },
    { ty: 'rh', units: ['4', '8', '16', 'd'], bpm: 72 }
]);
rdU('cc', '𝄡', [
    { ty: 'name', clef: 'alto', lo: 'D3', hi: 'B4' },
    { ty: 'name', clef: 'tenor', lo: 'A2', hi: 'G4' },
    { ty: 'name', clef: 'mix', tag: 'mix' }
]);
rdU('sr', '👁', [
    { ty: 'sr', clef: 'treble', lo: 'C4', hi: 'G4', durs: [1, 2], keys: [0], bpm: 72 },
    { ty: 'sr', clef: 'treble', lo: 'C4', hi: 'C5', durs: [1, 2, 0.5], keys: [0], bpm: 76 },
    { ty: 'sr', clef: 'bass', lo: 'C3', hi: 'C4', durs: [1, 2], keys: [0], bpm: 72 },
    { ty: 'sr', clef: 'treble', lo: 'C4', hi: 'E5', durs: [1, 2, 0.5, 1.5], keys: [-1, 0, 1], bpm: 80 },
    { ty: 'sr', clef: 'grand', lo: 'C4', hi: 'C5', durs: [1, 2, 0.5], keys: [-1, 0, 1], bpm: 72 },
    { ty: 'sr', clef: 'treble', lo: 'C4', hi: 'C6', durs: [1, 2], keys: [-7, 7], bpm: 72 },
    { ty: 'sr', clef: 'treble', lo: 'C4', hi: 'E6', durs: [1, 2], keys: [-7, 7], bpm: 68 },
    { ty: 'sr', clef: 'grand', lo: 'C3', hi: 'E6', durs: [1, 2], keys: [-7, 7], bpm: 64 },
    { ty: 'sr', clef: 'treble', lo: 'C4', hi: 'C6', durs: [1, 2], keys: [0], bpm: 64 },
    // Rhythm levels (P4): five-finger C position, new note values one level at a time.
    { ty: 'sr', clef: 'treble', lo: 'C4', hi: 'G4', durs: [1, 2, 0.5], keys: [0], bpm: 72, tag: 'eighths' },
    { ty: 'sr', clef: 'treble', lo: 'C4', hi: 'G4', durs: [1, 2, 0.5, 1.5], keys: [0], bpm: 72, tag: 'dotted' },
    { ty: 'sr', clef: 'treble', lo: 'C4', hi: 'G4', durs: [1, 2, 0.5, 1.5], keys: [0], bpm: 66, tag: 'sync' }
]);
const RD_ALL = RD_UNITS.flatMap((u) => u.lv);
/* ---- staff renderer for drills (whole-note columns, any clef, key signatures) ---- */
function rdCClef(x: number, cy: number) {
    const p = (s: number) => `<path class="rdx-cc" d="M ${x + 9},${cy} C ${x + 13},${cy - 3 * s} ${x + 14},${cy - 8 * s} ${x + 15},${cy - 11 * s} C ${x + 18},${cy - 8 * s} ${x + 24},${cy - 10 * s} ${x + 24},${cy - 17 * s} C ${x + 24},${cy - 25 * s} ${x + 16},${cy - 26 * s} ${x + 12},${cy - 21 * s}"/>`;
    return `<g class="rdx-cclef"><rect x="${x}" y="${cy - 24}" width="4.5" height="48"/><rect x="${x + 6.5}" y="${cy - 24}" width="1.6" height="48"/>${p(1)}${p(-1)}</g>`;
}
function rdKsSvg(clef: ReadClefStaff, keyN: number, x: number, top: number) {
    const bot = top + 48, ref = RD_REF[clef], off = ({ treble: 0, bass: -2, alto: -1, tenor: -1 } )[clef];
    const sT = [[3, 5], [0, 5], [4, 5], [1, 5], [5, 4], [2, 5], [6, 4]], fT = [[6, 4], [2, 5], [5, 4], [1, 5], [4, 4], [0, 5], [3, 4]], sTn = [[3, 4], [0, 5], [4, 4], [1, 5], [5, 4], [2, 5], [6, 4]];
    const list = keyN > 0 ? (clef === 'tenor' ? sTn : sT) : fT;
    let s = '', xx = x;
    for (let i = 0; i < Math.abs(keyN); i++) {
        const y = bot + (ref - ssStepOf(list[i][0], list[i][1] + off)) * 6;
        s += keyN > 0 ? ssSharp(xx + 3, y) : ssFlat(xx + 3, y);
        xx += 9;
    }
    return { svg: s, w: keyN ? Math.abs(keyN) * 9 + 8 : 4 };
}
interface ReadDrillStaffNote { li: number; oct: number; acc?: number; s?: string | null; hc?: string | null; tip?: string; staff?: ReadClefStaff; cn?: boolean; }
// ext: notes that only reserve vertical room; hl: column to highlight; ghost: draw the pacer; wrap: class of a group around the notes; bars: columns that start a bar.
interface ReadDrillSvgOptions { clef: ReadClefDraw; keyN?: number; cols: ReadDrillStaffNote[][]; minW?: number; aria?: string; colW?: number; lbl?: (string | number | null | undefined)[] | null; scale?: number; dur?: number; lblCls?: (string | null | undefined)[]; ext?: ReadDrillStaffNote[]; hl?: number | null; ghost?: boolean; wrap?: string; bars?: boolean[]; }
interface ReadDrillSvgItem { n: ReadDrillStaffNote; ii: number; c: ReadClefStaff; top: number; step: number; y: number; dx: number; ax?: number; }
function rdSvg(o: ReadDrillSvgOptions) {
    const grand = o.clef === 'grand', clefs: ReadClefStaff[] = o.clef === 'grand' ? ['treble', 'bass'] : [o.clef], tops = grand ? [40, 136] : [40];
    const keyN = o.keyN || 0, kA = ssKeyAcc(keyN), colW = o.colW || 64, L0 = grand ? 18 : 8;
    let head = '', x = L0 + 4;
    clefs.forEach((c, i) => { head += (c === 'treble' || c === 'bass') ? srClef(c, x + 4, tops[i]) : rdCClef(x + 6, tops[i] + (c === 'alto' ? 24 : 12)); });
    x += 40;
    let ksw = 4;
    clefs.forEach((c, i) => { const k = rdKsSvg(c, keyN, x, tops[i]); head += k.svg; ksw = Math.max(ksw, k.w); });
    x += ksw + (o.cols.length ? 10 : 0);
    const x0 = x, body: string[] = [], heads: { c: number; i: number; x: number; y: number; }[] = [];
    let minY = tops[0], maxY = tops[tops.length - 1] + 48;
    o.cols.forEach((col, ci) => {
        const nx = x0 + ci * colW + colW / 2;
        if (o.bars && o.bars[ci])
            body.push(`<line class="ss-line rdx-barline" x1="${x0 + ci * colW}" y1="${tops[0]}" x2="${x0 + ci * colW}" y2="${tops[tops.length - 1] + 48}" stroke-width="1.2"/>`);
        const items = col.map((n, ii): ReadDrillSvgItem => {
            const c: ReadClefStaff = grand ? (n.staff || (rdStep(n) >= 28 ? 'treble' : 'bass')) : clefs[0], top = tops[clefs.indexOf(c)], st = rdStep(n);
            return { n, ii, c, top, step: st, y: top + 48 + (RD_REF[c] - st) * 6, dx: 0 };
        }).sort((a, b) => a.step - b.step);
        let prev: ReadDrillSvgItem | null = null;
        items.forEach((it) => { it.dx = (prev && prev.c === it.c && it.step - prev.step === 1 && prev.dx === 0) ? 12 : 0; prev = it; });
        const lanes: number[][] = [];
        items.slice().reverse().forEach((it) => {
            if ((it.n.acc || 0) === kA[it.n.li] && !it.n.cn)
                return;
            let a = lanes.findIndex((l) => l.every((y: number) => Math.abs(y - it.y) >= 14));
            if (a < 0) {
                a = lanes.length;
                lanes.push([]);
            }
            lanes[a].push(it.y);
            it.ax = nx - 15 - a * 10;
        });
        items.forEach((it) => {
            let g = '';
            if (it.ax != null)
                g += ssAccGlyph(it.n.acc || 0, kA[it.n.li], it.ax, it.y);
            g += srLedger2(nx + it.dx, it.y, it.top) + ssNotehead(nx + it.dx, it.y, o.dur || 4, (RD_REF[it.c] - it.step) % 2 === 0);
            body.push(`<g class="ss-n" data-c="${ci}" data-i="${it.ii}"${it.n.s ? ` data-s="${it.n.s}"` : ''}${it.n.hc ? ` style="--hc:${it.n.hc}"` : ''}>${it.n.tip ? `<title>${rdEsc(it.n.tip)}</title>` : ''}${g}</g>`);
            heads.push({ c: ci, i: it.ii, x: nx + it.dx, y: it.y });
            minY = Math.min(minY, it.y);
            maxY = Math.max(maxY, it.y);
        });
    });
    (o.ext || []).forEach((n) => {
        const c: ReadClefStaff = grand ? (n.staff || (rdStep(n) >= 28 ? 'treble' : 'bass')) : clefs[0], y = tops[clefs.indexOf(c)] + 48 + (RD_REF[c] - rdStep(n)) * 6;
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    });
    const W = Math.max(o.minW || 0, x0 + o.cols.length * colW + 10), lblY = maxY + 24;
    const lbl = o.lbl;
    if (lbl)
        o.cols.forEach((_, ci) => { const l = lbl[ci]; if (l != null)
            body.push(`<text class="rdx-lbl${o.lblCls && o.lblCls[ci] ? ' ' + o.lblCls[ci] : ''}" x="${x0 + ci * colW + colW / 2}" y="${lblY}">${rdEsc(l)}</text>`); });
    const yA = Math.min(tops[0] - 10, minY - 14) - (o.ghost ? 16 : 0), yB = (o.lbl ? lblY + 10 : maxY + 14);
    let staff = '';
    tops.forEach((tp) => { for (let k = 0; k < 5; k++)
        staff += `<line class="ss-line" x1="${L0}" y1="${tp + k * 12}" x2="${W - 4}" y2="${tp + k * 12}" stroke-width="1.2"/>`; });
    staff += `<line class="ss-line" x1="${L0}" y1="${tops[0]}" x2="${L0}" y2="${tops[tops.length - 1] + 48}" stroke-width="1.6"/><line class="ss-line" x1="${W - 4}" y1="${tops[0]}" x2="${W - 4}" y2="${tops[tops.length - 1] + 48}" stroke-width="1.2"/>`;
    if (grand)
        staff += `<path class="rdx-brace" d="M ${L0 - 3},40 C ${L0 - 13},44 ${L0 - 3},100 ${L0 - 14},112 C ${L0 - 3},124 ${L0 - 13},180 ${L0 - 3},184"/>`;
    const sc = o.scale || 1.5, H = yB - yA;
    const band = (bx: number, cls: string) => `<rect class="${cls}" x="${bx + 3}" y="${yA + 3}" width="${colW - 6}" height="${H - 6}" rx="8"/>`;
    const hl = o.hl != null ? band(x0 + o.hl * colW, 'rdx-now') : '';
    const ghost = o.ghost ? `<g class="rdx-ghost">${band(-colW / 2, 'rdx-ghost-b')}<text x="0" y="${yA + 15}">👻</text></g>` : '';
    const notes = o.wrap ? `<g class="${o.wrap}" style="--dx:${colW}px">${body.join('')}</g>` : body.join('');
    return { svg: `<svg class="rdx-svg" viewBox="0 ${yA} ${W} ${H}" width="${Math.round(W * sc)}" height="${Math.round(H * sc)}" style="--w:${Math.round(W * sc)}px" xmlns="http://www.w3.org/2000/svg" role="img"${o.aria ? ` aria-label="${rdEsc(o.aria)}"` : ''}>${hl}${staff}${head}${ghost}${notes}</svg>`, heads, W, x0, H };
}
/* ---- drill engine ---- */
// Practice's star check: the last RD_CHECK_N answers of the run.
const RD_CHECK_N = 20;
// 'test' is the graded run of rhythm and sight-reading levels; the other levels earn their stars in Practice.
type ReadDrillMode = 'practice' | 'test' | SightReadingArcadeMode;
const RD_MODES: readonly string[] = ['practice', 'test', 'survival', 'timeAttack', 'marathon'];
function isReadDrillMode(mode: string): mode is ReadDrillMode { return RD_MODES.includes(mode); }
const RD_MODE_ICON: Record<ReadDrillMode, string> = { practice: '🎯', test: '📝', survival: '♥', timeAttack: '⏱', marathon: '🏃' };
// arc: the arcade run (Survival, Time Attack, Marathon); bars: the Marathon length last chosen; limT: Survival's per-note time limit;
// tout: the last answer was a timeout; arcFx: what the last answer earned (a Time Attack bonus or a faster Survival pace); limF: Survival's time bar when the note was answered.
// chk: Practice's star check, the last RD_CHECK_N first answers (a hinted one counts as wrong); chkBest: the best stars it gave this run, null until it is full;
// chkNew: stars just earned, still to announce; awT: hides the "earned" notice.
interface ReadDrillState { on: boolean; L: ReadDrillLevel | null; mode: ReadDrillMode; q: ReadQuestion | null; n: number; ok: number; ms: number; streak: number; best: number; t0: number; answered: boolean; timers: ReturnType<typeof setTimeout>[]; lastK: string | null; accSel: number; miss: { [questionKey: string]: number; }; rushEnd: number; rushIv: ReturnType<typeof setInterval> | number; rh: RdRhythmState | null; rhP: number[]; rhM: number[]; next: ReturnType<typeof rdNextStep>; nodes: OscillatorNode[]; hintT?: ReturnType<typeof setTimeout>; flow: ReadDrillFlow | null; fix: boolean; arc: SightReadingArcadeState | null; bars: SightReadingMarathonBars; limT?: ReturnType<typeof setTimeout>; tout: boolean; arcFx: '' | 'bonus' | 'faster'; limF: number; chk: { ok: boolean; ms: number; }[]; chkBest: number | null; chkNew: number; awT?: ReturnType<typeof setTimeout>; }
const RD: ReadDrillState = { on: false, L: null, mode: 'practice', q: null, n: 0, ok: 0, ms: 0, streak: 0, best: 0, t0: 0, answered: false, timers: [], lastK: null, accSel: 0, miss: {}, rushEnd: 0, rushIv: 0, rh: null, rhP: [], rhM: [], next: null, nodes: [], flow: null, fix: false, arc: null, bars: 16, tout: false, arcFx: '', limF: 1, chk: [], chkBest: null, chkNew: 0 };
// Rhythm and sight-reading levels keep Practice and their graded run; the others have Practice and the Challenge modes.
// Marathon reads one long line of notes, so only naming and playing levels have it.
function rdModes(L: ReadDrillLevel): ReadDrillMode[] {
    if (!rdHasCheck(L))
        return ['practice', 'test'];
    const modes: ReadDrillMode[] = ['practice', 'timeAttack', 'survival'];
    if (L.ty === 'name' || L.ty === 'play')
        modes.push('marathon');
    return modes;
}
// Levels whose Practice runs the star check: all but rhythm and sight-reading, which earn stars in their graded run.
function rdHasCheck(L: ReadDrillLevel | null) { return !!L && L.ty !== 'rh' && L.ty !== 'sr'; }
// How many notes the run has (Marathon), or null when it ends another way.
function rdRunLen(): number | null { return RD.arc && RD.arc.total !== null ? RD.arc.total : null; }
function rdTimeUp() { return RD.mode === 'timeAttack' && performance.now() >= RD.rushEnd; }
// Survival: a note still unanswered when its time window closes costs a life.
function rdArmLimit() {
    clearTimeout(RD.limT);
    const arc = RD.arc, q = RD.q;
    if (!arc || arc.mode !== 'survival')
        return;
    RD.limT = setTimeout(() => { if (RD.on && !RD.answered && RD.q === q)
        rdAnswer(false, {}, true); }, arc.targetMs);
    rdHud();
}
function rdArcFx() { return RD.arcFx === 'bonus' ? t('rdx_ta_bonus') : RD.arcFx === 'faster' && RD.arc ? t('rdx_sv_faster', anNum(RD.arc.targetMs / 1000, 1)) : ''; }
function rdClock(ms: number) { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function rdLvNext(L: ReadDrillLevel) { const u = RD_UNITS.find((x) => x.u === L.u); return u ? u.lv[L.n] || null : null; }
function rdTarget(L: ReadDrillLevel | null) { if (!L)
    throw new Error('Étude: no reading level'); return (RD_TARGET[L.ty] || 3000) + ((L.clef === 'grand' || L.clef === 'mix') ? 800 : 0) + ((L.acc || L.keys) ? 1000 : 0); }
function rdStat(k: string, ok: boolean, ms: number) {
    const d = rdData(), s = d.nt[k] || (d.nt[k] = { n: 0, ok: 0, ms: 0, e: 0, t: 0 });
    s.e = s.n ? s.e * 0.7 + (ok ? 0 : 0.3) : (ok ? 0.1 : 1);
    s.t = s.n ? Math.round(s.t * 0.7 + ms * 0.3) : ms;
    s.n++;
    if (ok)
        s.ok++;
    s.ms += ms;
}
function rdWeakness(k: string) {
    const s = rdData().nt[k];
    if (!s || !s.n)
        return 0;
    const errors = s.ok < s.n ? 1 - s.ok / s.n : 0;
    const slow = Math.max(0, (s.t || 0) / rdTarget(RD.L) - 1);
    return 6 * errors + slow;
}
function rdWeakItems<T>(items: T[], keyOf: (x: T) => string) {
    const ranked = items.map((item) => ({ item, weakness: rdWeakness(keyOf(item)) })).filter(({ weakness }) => weakness > 0).sort((a, b) => b.weakness - a.weakness);
    return ranked.slice(0, Math.ceil(ranked.length / 4)).map(({ item }) => item);
}
function rdPick<T>(items: T[]) {
    return items[Math.floor(Math.random() * items.length)];
}
function rdPickFrom<T>(items: T[], keyOf: (x: T) => string) {
    let pool = items.filter((item) => keyOf(item) !== RD.lastK);
    if (!pool.length)
        pool = items;
    const weak = (RD.mode === 'practice' || RD.mode === 'survival' || RD.mode === 'marathon') && data.settings.weakSpotInjection && Math.random() < 0.3 ? rdWeakItems(pool, keyOf) : [];
    const r = rdPick(weak.length ? weak : pool);
    RD.lastK = keyOf(r);
    return r;
}
function rdPool(L: ReadDrillLevel): ReadDrillPitch[] {
    if (L.set)
        return L.set.map((x) => rdP(x));
    const lo = rdStep(rdP(L.lo)), hi = rdStep(rdP(L.hi)), out: ReadDrillPitch[] = [];
    for (let s = lo; s <= hi; s++) {
        const n = rdFromStep(s);
        out.push(n);
        if (L.acc === 1 || L.acc === 2) {
            if (n.li !== 2 && n.li !== 6)
                out.push(rdFromStep(s, 1));
        }
        if (L.acc === -1 || L.acc === 2) {
            if (n.li !== 0 && n.li !== 3)
                out.push(rdFromStep(s, -1));
        }
    }
    return out;
}
function rdIvName(n: string|number) { return t('rdx_iv' + n); }
function rdChLabel(li: number, q: string) { return rdLetter(li) + ' ' + t('rdx_q_' + q); }
function rdShuffle<T>(a: T[]): T[] { const r = shuffle(a); if (typeof r === 'string')
    throw new Error('Étude: shuffle needs an array'); return r; }
function rdStaffClef(c: ReadClef | undefined): ReadClefStaff { if (c === 'treble' || c === 'bass' || c === 'alto' || c === 'tenor')
    return c; throw new Error('Étude: this drill needs a single staff, not ' + c); }
interface ReadQuestionBase { key: string; hinted?: boolean; state?: 'good' | 'bad' | null; lbl?: string; }
interface ReadQuestionKs extends ReadQuestionBase { ty: 'ks'; clef: ReadClefDraw; keyN: number; ans: number; opts: { v: number; l: string; s: string; }[]; midis?: undefined; }
interface ReadQuestionIv extends ReadQuestionBase { ty: 'iv'; clef: ReadClefStaff; ans: number; a: ReadDrillPitch; b: ReadDrillPitch; harm: boolean; opts: { v: number; l: string; k: string; }[]; midis: number[]; }
interface ReadQuestionCh extends ReadQuestionBase { ty: 'ch'; clef: ReadClefStaff; ans: string; root: ReadDrillPitch; qual: ReadDrillChordQuality; inv: number; notes: ReadDrillPitch[]; opts: { v: string; l: string; }[]; midis: number[]; pcs: number[]; }
interface ReadQuestionNote extends ReadQuestionBase { ty: Exclude<ReadDrillType, 'ks' | 'iv' | 'ch'>; clef: ReadClefDraw; keyN: number; note: ReadDrillPitch; sclef: ReadClefStaff; midi: number; midis: number[]; needAcc: boolean; opts?: { v: number; n: ReadDrillPitch; }[]; ans?: number; cn?: boolean; }
type ReadQuestion = ReadQuestionKs | ReadQuestionIv | ReadQuestionCh | ReadQuestionNote;
function rdGen(L: ReadDrillLevel): ReadQuestion {
    const ty = L.ty;
    if (ty === 'ks') {
        const ks: number[] = [];
        if (L.kmax === undefined)
            throw new Error('Étude: key-signature level without kmax');
        for (let k = -L.kmax; k <= L.kmax; k++)
            ks.push(k);
        const k = rdPickFrom(ks, (v) => 'ks:' + v);
        const opts = rdShuffle(ks.filter((v) => v !== k)).slice(0, 5).concat([k]).sort((a, b) => a - b);
        const clef = L.clef;
        if (clef === undefined || clef === 'mix')
            throw new Error('Étude: key-signature level without a staff');
        return { ty, clef, keyN: k, key: 'ks:' + k, ans: k, opts: opts.map((v) => ({ v, l: rdKeyLabel(v), s: rdKeyMinor(v) })) };
    }
    if (ty === 'iv') {
        const ivs = L.ivs;
        if (!ivs)
            throw new Error('Étude: interval level without intervals');
        const lo = rdStep(rdP(L.lo)), hi = rdStep(rdP(L.hi)), iv = rdPickFrom(ivs, (v) => 'iv:' + v);
        let a = lo, b = lo + iv - 1;
        for (let k = 0; k < 40; k++) {
            a = lo + Math.floor(Math.random() * (hi - lo + 1));
            b = a + (Math.random() < .5 ? 1 : -1) * (iv - 1);
            if (b < lo || b > hi)
                b = a - (b - a);
            if (b >= lo && b <= hi)
                break;
        }
        const harm = L.harm === 1 || (L.harm === 2 && Math.random() < .5);
        let na = rdFromStep(a), nb = rdFromStep(b);
        if (harm && a > b) {
            const x = na;
            na = nb;
            nb = x;
        }
        return { ty, clef: rdStaffClef(L.clef), key: 'iv:' + iv, ans: iv, a: na, b: nb, harm, opts: ivs.map((v) => ({ v, l: rdIvName(v), k: String(v) })), midis: [rdMidi(na), rdMidi(nb)] };
    }
    if (ty === 'ch') {
        const quals = L.q;
        if (!quals)
            throw new Error('Étude: chord level without qualities');
        const lo = rdStep(rdP(L.lo)), hi = rdStep(rdP(L.hi)), qual = rdPickFrom(quals, (v) => 'ch:' + v);
        let notes: ReadDrillPitch[] | null = null, root: ReadDrillPitch | null = null, inv = 0;
        for (let k = 0; k < 80 && !notes; k++) {
            const rs = lo + Math.floor(Math.random() * Math.max(1, hi - lo - 3));
            root = rdFromStep(rs);
            const rm = rdMidi(root);
            const ns = [0, 1, 2].map((j) => { const n = rdFromStep(rs + 2 * j); n.acc = rm + RD_CHQ[qual][j] - rdMidi(n); return n; });
            if (ns.some((n) => Math.abs(n.acc) > 1))
                continue;
            inv = L.inv ? Math.floor(Math.random() * 3) : 0;
            for (let i = 0; i < inv; i++) {
                const x = ns.shift();
                if (!x)
                    throw new Error('Étude: empty chord');
                x.oct++;
                ns.push(x);
            }
            notes = ns;
        }
        if (!root)
            throw new Error('Étude: no chord root');
        const r0 = root, ans = r0.li + ':' + qual, set = new Set([ans]);
        quals.forEach((q) => set.add(r0.li + ':' + q));
        while (set.size < 6) {
            set.add(Math.floor(Math.random() * 7) + ':' + randItem(quals));
        }
        const opts = rdShuffle([...set]).map((v) => { const [li, q] = v.split(':'); return { v, l: rdChLabel(+li, q) }; });
        if (!notes)
            throw new Error('Étude: no chord found');
        const midis = notes.map((n) => rdMidi(n));
        return { ty, clef: rdStaffClef(L.clef), key: 'ch:' + qual, ans, root: r0, qual, inv, notes, opts, midis, pcs: [...new Set(midis.map(pc))].sort((a, b) => a - b) };
    }
    let clef = L.clef, pool: ReadDrillPitch[], keyN = 0;
    if (clef === 'mix') {
        const mc: ReadClefStaff = randItem(['treble', 'bass', 'alto', 'tenor']);
        clef = mc;
        const r = RD_REF[mc];
        pool = [];
        for (let s = r - 2; s <= r + 10; s++)
            pool.push(rdFromStep(s));
    }
    else
        pool = rdPool(L);
    // `keyN` fixes one key signature (the warm-up's hand position); `keys` draws one up to that many sharps or flats.
    if (L.keyN !== undefined || L.keys) {
        const keys = L.keys;
        if (L.keyN !== undefined)
            keyN = L.keyN;
        else if (typeof keys !== 'number')
            throw new Error('Étude: note drills take a key-signature range, not a list');
        else
            keyN = Math.floor(Math.random() * (2 * keys + 1)) - keys;
        const kA = ssKeyAcc(keyN);
        pool = pool.map((n) => Object.assign({}, n, { acc: kA[n.li] }));
    }
    if (clef === undefined)
        throw new Error('Étude: note drill without a clef');
    const dc = clef;
    const sc = (n: ReadDrillPitch): ReadClefStaff => dc === 'grand' ? (rdStep(n) >= 28 ? 'treble' : 'bass') : dc;
    const n = rdPickFrom(pool, (x) => rdNk(sc(x), x));
    const q: ReadQuestionNote = { ty, clef: dc, keyN, note: n, sclef: sc(n), key: rdNk(sc(n), n), midi: rdMidi(n), midis: [rdMidi(n)], needAcc: !!(L.acc || L.keys) };
    if (ty === 'k2s') {
        const seen = new Set([q.midi]), opts = [n];
        for (const x of rdShuffle(pool)) {
            if (opts.length >= 4)
                break;
            const m = rdMidi(x);
            if (!seen.has(m)) {
                seen.add(m);
                opts.push(x);
            }
        }
        const qo = rdShuffle(opts).map((x, i) => ({ v: i, n: x }));
        q.opts = qo;
        q.ans = qo.findIndex((o) => o.n === n);
    }
    return q;
}
function rdQSvg(q: ReadQuestion, extra?: ReadDrillStaffNote | null) {
    const st = q.state;
    if (q.ty === 'ks')
        return rdSvg({ clef: q.clef, keyN: q.keyN, cols: [], minW: 150, aria: t('rdx_p_ks') }).svg;
    if (q.ty === 'iv') {
        const a = Object.assign({ s: st }, q.a), b = Object.assign({ s: st }, q.b);
        return rdSvg({ clef: q.clef, cols: q.harm ? [[a, b]] : [[a], [b]], colW: q.harm ? 96 : 72 }).svg;
    }
    if (q.ty === 'ch')
        return rdSvg({ clef: q.clef, cols: [q.notes.map((n) => Object.assign({ s: st }, n))], colW: 100 }).svg;
    const col: ReadDrillStaffNote[] = [Object.assign({ s: q.ty === 'k2s' ? null : st }, q.note)];
    if (extra)
        col.push(extra);
    return rdSvg({ clef: q.clef === 'grand' ? 'grand' : q.sclef, keyN: q.keyN, cols: [col], colW: 100, lbl: q.lbl ? [q.lbl] : null }).svg;
}
// Reading drills mark the dock keyboard. Play drills fold their marks into its octaves; key-to-staff marks stay on the exact key (`exact`),
// since there the octave is part of the question. Only keys marked here are cleared again, a rebuilt keyboard gets them back, and a
// wrong key never hides the mark of the right one when both land on the same key.
type ReadDockMark = 'target' | 'good' | 'bad';
const rdDockKeys = new Map<number, { s: ReadDockMark; exact: boolean }>();
function rdDockAt(m: number, exact: boolean) { return exact ? m : foldToView(m); }
function rdDockMark(m: number, s: ReadDockMark, exact = false) {
    if (s === 'bad' && [...rdDockKeys].some(([k, d]) => rdDockAt(k, d.exact) === rdDockAt(m, exact)))
        return;
    rdDockKeys.set(m, { s, exact });
    kbState(m, s, !exact);
}
function rdDockPaint() {
    const marked = new Set<number>();
    let ask: number | null = null;
    for (const [m, d] of rdDockKeys) {
        const at = rdDockAt(m, d.exact);
        if (d.s === 'bad' && marked.has(at))
            continue;
        marked.add(at);
        kbState(m, d.s, !d.exact);
        if (d.exact && d.s !== 'bad' && ask == null)
            ask = m;
    }
    if (ask != null)
        dockKeyInSight(ask);
}
function rdDockClear() {
    if (!rdDockKeys.size)
        return;
    rdDockKeys.forEach((d, m) => kbState(m, null, !d.exact));
    rdDockKeys.clear();
    repaintHeld();
}
// While a key-to-staff question is up, the keys keep its key (and the level's whole range when that fits, so they rarely move):
// shifting octaves or resizing never takes the question off the keyboard.
function rdDockView() {
    const q = RD.q, L = RD.L;
    if (!RD.on || !q || q.ty !== 'k2s' || !L)
        return;
    const span = view.oct * 12;
    let a = q.midi, b = q.midi;
    if (L.lo && L.hi) {
        const lo = rdMidi(rdP(L.lo)), hi = rdMidi(rdP(L.hi));
        if (hi - (lo - pc(lo)) <= span) {
            a = Math.min(a, lo);
            b = Math.max(b, hi);
        }
    }
    let low = view.low;
    if (a < low)
        low = a - pc(a);
    else if (b > low + span)
        low = Math.ceil((b - span) / 12) * 12;
    view.low = Math.max(BASE_LOW, Math.min(BASE_HIGH - span, low));
}
function rdDockForce(on: boolean) { if (DOCK.force === on)
    return; DOCK.force = on; dockSync(); }
// Key-to-staff asks on the dock: it opens for the drill, shows the key in its own octave, and lights it.
function rdDockAsk(m: number) {
    rdDockForce(true);
    const low = view.low;
    rdDockView();
    if (view.low !== low) {
        buildKeyboard();
        repaintHeld();
    }
    rdDockMark(m, 'target', true);
    dockKeyInSight(m);
}
interface ReadDrillButton { v: number | string; l?: string; html?: string; k?: string; s?: string; }
function rdBtn(o: ReadDrillButton, i: number, cls?: string) { return `<button class="chip rdx-a${cls ? ' ' + cls : ''}" data-a="${rdEsc(o.v)}" data-k="${o.k || (i + 1)}">${o.html || rdEsc(o.l)}${o.s ? `<small>${rdEsc(o.s)}</small>` : ''}<kbd>${o.k || (i + 1)}</kbd></button>`; }
function rdAccSeg() { return `<div class="seg rdx-accs" id="rdx-accs" role="group" aria-label="${t('rdx_accl')}">${[-1, 0, 1].map((a, i) => `<button data-acc="${a}" aria-pressed="${a === RD.accSel}" title="${t('rdx_acc_t' + a)}">${a < 0 ? '♭' : a > 0 ? '♯' : '♮'}<kbd>${['-', '0', '='][i]}</kbd></button>`).join('')}</div>`; }
// On a touch screen the computer-key hint (.rdx-kbd) is hidden (native.css); the ways that still work there keep a line (.rdx-touch).
function rdTools(q: ReadQuestion) { return `<div class="rdx-tools">${RD.mode === 'practice' ? `<button class="btn ghost sm" id="rdx-hear">🔊 ${t('rdx_hear')}</button><button class="btn ghost sm" id="rdx-hintb">💡 ${t('rdx_hint')}</button>` : ''}<span class="rdx-kbd">${t('rdx_keys_' + q.ty) + (q.ty === 'name' && q.needAcc ? t('rdx_keys_acc') : '')}</span>${q.ty === 'ch' || q.ty === 'play' ? `<span class="rdx-touch ctx-touch">${t('rdx_touch_' + q.ty)}</span>` : ''}</div>`; }
/* ---- look-ahead stream: name and play drills as a row of notes read from left to right ---- */
// items: every note of the run so far; cur: the note to answer; start: the first note on screen.
// played, wrong: the key or letters given wrongly for the current note, shown until it is answered right.
// ext: the pool's lowest and highest notes, which keep the staff's height steady.
// g0: when the pacer ghost set off; gd: notes the player leads it by; gh: the ghost is shown; rm: reduced motion.
interface ReadDrillFlow { items: ReadQuestionNote[]; cur: number; start: number; played: number | null; wrong: string[]; ext: ReadDrillPitch[]; g0: number; raf: number; gd: number; gh: boolean; rm: boolean; geo: { x0: number; colW: number; n: number; }; ghostEl?: Element | null; }
const RD_FLOW_W = 52, RD_FLOW_SC = 1.35, RD_GHOST_MAX = 3;
function rdFlowOk(L: ReadDrillLevel | null | undefined) { return !!L && rdData().prefs.flow && (L.ty === 'name' || L.ty === 'play') && L.clef !== 'mix' && !L.keys && L.keyN === undefined; }
function rdFlowFill(F: ReadDrillFlow, upTo: number) {
    const L = RD.L;
    if (!L)
        throw new Error('Étude: no reading level');
    const len = rdRunLen(), end = len !== null ? Math.min(upTo, len) : upTo;
    while (F.items.length < end) {
        const q = rdGen(L);
        if (q.ty !== 'name' && q.ty !== 'play')
            throw new Error('Étude: the note stream needs name or play questions');
        q.hinted = false;
        q.state = null;
        q.cn = courtesyNatural(F.items.slice(-6).map((x) => x.note), q.note);
        F.items.push(q);
    }
}
function rdFlowStart() {
    const L = RD.L;
    if (!L)
        return;
    const pool = rdPool(L).sort((a, b) => rdStep(a) - rdStep(b)), gh = rdData().prefs.ghost;
    const F: ReadDrillFlow = RD.flow = { items: [], cur: 0, start: 0, played: null, wrong: [], ext: [pool[0], pool[pool.length - 1]], g0: performance.now(), raf: 0, gd: 0, gh, rm: reduceMotion(), geo: { x0: 0, colW: RD_FLOW_W, n: 0 } };
    rdFlowFill(F, 1);
    RD.q = F.items[0];
    RD.answered = false;
    RD.fix = false;
    RD.accSel = 0;
    rdFlowBody();
    rdFlowShow(false);
    rdFlowArm();
    F.g0 = RD.t0;
    if (gh)
        F.raf = requestAnimationFrame(rdGhostTick);
}
// Starts the clock on the current note, with the practice hint after 4 s.
function rdFlowArm() {
    const q = RD.q;
    clearTimeout(RD.hintT);
    if (RD.mode === 'practice' && rdData().prefs.hints)
        RD.hintT = setTimeout(() => { if (RD.on && !RD.answered && RD.q === q)
            rdHint(); }, 4000);
    rdHud();
    RD.t0 = performance.now();
    rdArmLimit();
}
function rdFlowBody() {
    const F = RD.flow;
    if (!F)
        return;
    const q = F.items[Math.min(F.cur, F.items.length - 1)];
    let acc = '', ans = '';
    if (q.ty === 'name') {
        if (q.needAcc)
            acc = rdAccSeg();
        ans = [0, 1, 2, 3, 4, 5, 6].map((li) => rdBtn({ v: li, l: rdLetter(li) }, li)).join('');
    }
    byId('rdx-body').innerHTML = `<div class="rdx-q rdx-flowq"><div class="rdx-prompt" id="rdx-prompt">${t('rdx_p_' + q.ty + '_flow')}</div><div class="rdx-staff rdx-flow" id="rdx-staff"></div><div class="rdx-fb" id="rdx-fb"></div>${acc}<div class="rdx-ans rdx-ty-${q.ty}" id="rdx-ans" role="group" aria-label="${t('rdx_answers')}" aria-describedby="rdx-coach">${ans}</div>${rdTools(q)}</div>`;
}
function rdFlowShow(slide: boolean) {
    const F = RD.flow, L = RD.L, st = maybeById('rdx-staff');
    if (!F || !L || !st)
        return;
    const grand = L.clef === 'grand', fix = RD.fix, q = F.items[Math.min(F.cur, F.items.length - 1)];
    const clef: ReadClefDraw = grand ? 'grand' : q.sclef, head = grand ? 76 : 66, colW = RD_FLOW_W, aw = st.clientWidth - 28;
    const svgOf = (start: number, vis: ReadQuestionNote[], sc: number, o: Partial<ReadDrillSvgOptions>) => rdSvg({ clef, colW, scale: sc, dur: 1, ext: F.ext, aria: t('rdx_p_' + q.ty + '_flow'), ...o,
        cols: vis.map((it, i) => {
            const k = start + i, col: ReadDrillStaffNote[] = [Object.assign({ s: k === F.cur ? 'now' : k < F.cur ? it.state : null, cn: it.cn }, it.note)];
            if (k === F.cur && fix && F.played != null && F.played !== it.midi)
                col.push(Object.assign(rdSpellMidi(F.played, 0), { s: 'bad' }));
            return col;
        }),
        lbl: vis.map((it) => it.state === 'bad' ? rdName(it.note, true) : null), lblCls: vis.map(() => 'lo') });
    // On the full-screen stage the notes grow into the height the stage gives them, keeping at least 8 columns across.
    const H = rdSvg({ clef, cols: [], ext: F.ext, lbl: [], ghost: F.gh }).H, ah = st.clientHeight - 12, gap = 10;
    const wide = Math.min(2.6, aw / (head + 10 + 8 * colW));
    const total = rdRunLen();
    st.classList.toggle('rdx-sys', RD.mode === 'marathon' && total !== null);
    if (RD.mode === 'marathon' && total !== null) {
        // Marathon reads like a page: whole bars on each system, the current system on top and the next ones below it.
        const rows = STAGE.on ? systemRows(ah, H * Math.max(1, Math.min(RD_FLOW_SC, wide)) + gap) : 2;
        const sc = STAGE.on ? Math.max(1, Math.min(wide, (ah - gap * (rows - 1)) / (rows * H))) : RD_FLOW_SC;
        const per = systemBars(aw, { scale: sc, colW, head }, MARATHON_NOTES_PER_BAR) * MARATHON_NOTES_PER_BAR;
        const win = systemWindow(F.cur, per, rows, total);
        rdFlowFill(F, Math.min(total, (win.first + win.count) * per));
        let cur0 = win.first * per, out = '';
        for (let row = win.first; row < win.first + win.count; row++) {
            const s0 = row * per, vis = F.items.slice(s0, Math.min(total, s0 + per)), here = F.cur >= s0 && F.cur < s0 + per;
            if (here)
                cur0 = s0;
            const r = svgOf(s0, vis, sc, { minW: head + per * colW + 10, hl: here ? F.cur - s0 : null, ghost: F.gh && here, wrap: 'rdx-flow-n', bars: vis.map((_, i) => i > 0 && (s0 + i) % MARATHON_NOTES_PER_BAR === 0) });
            out += here ? r.svg : r.svg.replace('<svg class="rdx-svg"', '<svg class="rdx-svg" aria-hidden="true"');
        }
        st.innerHTML = out;
        F.ghostEl = null;
        F.start = cur0;
        F.geo = { x0: head, colW, n: per };
    }
    else {
        // Off the stage the notes grow until the most a stream shows (12) fills the width, up to SR_SCALE_CAP.
        const sc = STAGE.on ? Math.max(1, Math.min(wide, ah / H)) : Math.max(RD_FLOW_SC, Math.min(SR_SCALE_CAP, aw / (head + 10 + 12 * colW)));
        const n = streamVisible(aw, { scale: sc, colW, head });
        const start = streamStart(F.cur, n, total);
        rdFlowFill(F, start + n);
        const r = svgOf(start, F.items.slice(start, start + n), sc, { hl: F.cur < F.items.length ? F.cur - start : null, ghost: F.gh, wrap: 'rdx-flow-n' + (slide && start === F.start + 1 ? ' slide' : '') });
        st.innerHTML = r.svg;
        F.ghostEl = null;
        F.start = start;
        F.geo = { x0: r.x0, colW, n };
    }
    rdGhostPlace();
    queryAllHtml(byId('rdx-ans'), '.rdx-a').forEach((b) => {
        const v = Number(b.dataset.a);
        b.classList.toggle('correct', fix && v === q.note.li);
        b.classList.toggle('wrong', fix && v !== q.note.li && F.wrong.includes(String(v)));
    });
    queryAllHtml(document, '#rdx-accs [data-acc]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.acc) === RD.accSel)));
    rdDockClear();
    if (fix && q.ty === 'play') {
        rdDockMark(q.midi, 'target');
        if (F.played != null && F.played !== q.midi)
            rdDockMark(F.played, 'bad');
    }
    const f = byId('rdx-fb'), fx = fix ? '' : rdArcFx();
    f.className = 'rdx-fb' + (fix ? ' bad' : fx ? ' good' : '');
    f.textContent = fix ? (RD.tout ? '⏱ ' : '✗ ') + rdFlowMsg() : fx ? '✓ ' + fx : '';
}
function rdFlowMsg() {
    const F = RD.flow, q = F && F.items[F.cur], arc = RD.arc;
    if (!F || !q)
        return '';
    return (RD.tout ? t('rdx_timeout') + ' · ' : '') + t('rdx_wrong', rdName(q.note, true)) + (q.ty === 'play' && F.played != null ? ' · ' + t('rdx_played', rdName(rdSpellMidi(F.played, 0), true)) : '') + (arc && arc.lives !== null ? ' · ' + t('rdx_lives', arc.lives) : '') + (arc && arc.completed ? '' : ' · ' + t(q.ty === 'play' ? 'rdx_fix_play' : 'rdx_fix_name'));
}
// Only the first answer to a note is scored. After a wrong one the stream waits, showing the right answer, until it is given.
function rdFlowAnswer(ok: boolean, g: ReadDrillGiven, timeout = false) {
    const F = RD.flow, q = F && F.items[F.cur];
    if (!F || !q || (RD.answered && !RD.fix))
        return;
    if (!RD.fix) {
        RD.answered = true;
        clearTimeout(RD.hintT);
        clearTimeout(RD.limT);
        RD.tout = timeout;
        rdScore(q, ok, timeout);
        q.state = ok ? 'good' : 'bad';
    }
    if (ok) {
        rdFlowAdvance(g);
        rdCheckNotice();
        return;
    }
    RD.fix = true;
    if (q.ty === 'play' && g.midi != null)
        F.played = g.midi;
    const a = g.btn instanceof HTMLElement ? g.btn.dataset.a : undefined;
    if (a != null && !F.wrong.includes(a))
        F.wrong.push(a);
    rdFlowShow(false);
    const sv = byId('rdx-staff');
    sv.classList.remove('flash-ok', 'flash-bad');
    void sv.offsetWidth;
    sv.classList.add('flash-bad');
    byId('rdx-live').textContent = rdFlowMsg();
    rdHud();
    rdCheckNotice();
    // A run that this mistake ended (no lives left, or the last Marathon note) closes after a moment to read the answer.
    if (RD.arc && RD.arc.completed)
        RD.timers.push(setTimeout(() => { if (RD.on)
            rdFinish(); }, 1200));
}
function rdFlowAdvance(g: ReadDrillGiven) {
    const F = RD.flow;
    if (!F)
        return;
    const q = F.items[F.cur];
    if (q.ty === 'name' && g.midi == null && rdData().prefs.sound)
        rdSound(q.midis);
    F.cur++;
    F.played = null;
    F.wrong = [];
    RD.fix = false;
    RD.accSel = 0;
    const len = rdRunLen();
    if ((len !== null && F.cur >= len) || rdTimeUp()) {
        rdFlowShow(false);
        rdHud();
        RD.timers.push(setTimeout(() => { if (RD.on)
            rdFinish(); }, RD.mode === 'timeAttack' ? 0 : 400));
        return;
    }
    rdFlowFill(F, F.cur + 1);
    RD.q = F.items[F.cur];
    RD.answered = false;
    rdFlowShow(true);
    rdFlowArm();
    const fx = rdArcFx();
    if (fx)
        byId('rdx-live').textContent = fx;
}
function rdGhostTick() {
    const F = RD.flow;
    if (!F || !RD.on)
        return;
    rdGhostPlace();
    F.raf = requestAnimationFrame(rdGhostTick);
}
// The ghost answers one note per target time (the 3-star pace) and waits when it is RD_GHOST_MAX notes ahead.
function rdGhostPlace() {
    const F = RD.flow, L = RD.L;
    if (!F || !L || !F.gh)
        return;
    const now = performance.now(), per = rdTarget(L);
    let p = (now - F.g0) / per;
    if (p > F.cur + RD_GHOST_MAX) {
        p = F.cur + RD_GHOST_MAX;
        F.g0 = now - p * per;
    }
    let el = F.ghostEl;
    if (!el || !el.isConnected) {
        el = document.querySelector('#rdx-staff .rdx-ghost');
        F.ghostEl = el;
    }
    if (el) {
        const gx = ghostX(F.rm ? Math.floor(p) : p, F.start, F.geo.n, F.geo.x0, F.geo.colW);
        el.setAttribute('transform', 'translate(' + gx.x.toFixed(1) + ' 0)');
        el.classList.toggle('edge', gx.edge !== 0);
    }
    const d = pacerLead(F.cur, p);
    if (d !== F.gd) {
        F.gd = d;
        rdHud();
    }
}
function rdNext() {
    clearTimeout(RD.hintT);
    rdDockClear();
    RD.answered = false;
    RD.accSel = 0;
    if (!RD.L)
        throw new Error('Étude: no reading level');
    const q = RD.q = rdGen(RD.L);
    q.hinted = false;
    q.state = null;
    let acc = '', ans = '';
    if (q.ty === 'name') {
        if (q.needAcc)
            acc = rdAccSeg();
        ans = [0, 1, 2, 3, 4, 5, 6].map((li) => rdBtn({ v: li, l: rdLetter(li) }, li)).join('');
    }
    else if (q.ty === 'k2s') {
        const opts = q.opts;
        if (!opts)
            throw new Error('Étude: key-to-staff question without options');
        ans = opts.map((o, i) => rdBtn({ v: o.v, html: rdSvg({ clef: q.clef === 'grand' ? 'grand' : q.sclef, cols: [[o.n]], colW: 56, scale: 0.8 }).svg }, i, 'rdx-opt')).join('');
    }
    else if (q.ty !== 'play') {
        const opts = q.opts;
        if (!opts)
            throw new Error('Étude: question without options');
        const btns: ReadDrillButton[] = opts.map((o) => 'n' in o ? { v: o.v } : o);
        ans = btns.map((o, i) => rdBtn(o, i)).join('');
    }
    const pr = RD.mode === 'practice';
    byId('rdx-body').innerHTML = `<div class="rdx-q"><div class="rdx-prompt" id="rdx-prompt">${t('rdx_p_' + q.ty)}</div><div class="rdx-staff" id="rdx-staff">${q.ty === 'k2s' ? '' : rdQSvg(q)}</div><div class="rdx-fb" id="rdx-fb"></div>${acc}<div class="rdx-ans rdx-ty-${q.ty}" id="rdx-ans" role="group" aria-label="${t('rdx_answers')}" aria-describedby="rdx-coach">${ans}</div>${rdTools(q)}</div>`;
    if (q.ty === 'k2s')
        rdDockAsk(q.midi);
    else
        rdDockForce(false);
    if (q.ty === 'k2s' && rdData().prefs.sound)
        rdSound(q.midis);
    if (pr && rdData().prefs.hints)
        RD.hintT = setTimeout(() => { if (RD.on && !RD.answered && RD.q === q)
            rdHint(); }, 4000);
    rdHud();
    RD.t0 = performance.now();
    rdArmLimit();
}
function rdSound(ms?: number[], arp?: boolean) { if (!ms || !ms.length)
    return; ensureAudio(); if (!audioEngine.context)
    return; const t0 = audioEngine.context.currentTime + 0.03; ms.forEach((m, i) => previewNote(m, t0 + (arp ? i * 0.45 : 0), 0.9, 88)); }
const RD_LM = [14, 18, 21, 24, 28, 32, 35, 38, 42];
function rdHint() {
    const q = RD.q;
    if (!q || RD.answered)
        return;
    q.hinted = true;
    let s = '';
    if (q.ty === 'name' || q.ty === 'play') {
        const st = rdStep(q.note);
        let lm = RD_LM[0];
        RD_LM.forEach((x) => { if (Math.abs(x - st) < Math.abs(lm - st))
            lm = x; });
        const d = st - lm, nm = rdName(rdFromStep(lm), true);
        s = d === 0 ? t('rdx_hint_same', nm) : t(d > 0 ? 'rdx_hint_up' : 'rdx_hint_dn', Math.abs(d), nm);
        if (q.ty === 'play')
            rdDockMark(q.midi, 'target');
    }
    else if (q.ty === 'k2s')
        s = t('rdx_hint_k2s', rdName(q.note, true));
    else if (q.ty === 'iv') {
        const l1 = (RD_REF[q.clef] - rdStep(q.a)) % 2 === 0, l2 = (RD_REF[q.clef] - rdStep(q.b)) % 2 === 0;
        s = t(l1 === l2 ? 'rdx_hint_odd' : 'rdx_hint_even');
    }
    else if (q.ty === 'ch')
        s = t('rdx_hint_ch', rdLetter(q.root.li));
    else if (q.ty === 'ks')
        s = t(q.keyN > 0 ? 'rdx_hint_ks_s' : q.keyN < 0 ? 'rdx_hint_ks_f' : 'rdx_hint_ks_0');
    const f = maybeById('rdx-fb');
    if (f) {
        f.className = 'rdx-fb hint';
        f.textContent = '💡 ' + s;
    }
}
function rdAnsText(q: ReadQuestion) { if (q.ty === 'iv')
    return rdIvName(q.ans); if (q.ty === 'ch')
    return rdChLabel(q.root.li, q.qual); if (q.ty === 'ks')
    return rdKeyLabel(q.ans) + ' / ' + rdKeyMinor(q.ans); return rdName(q.note, true); }
interface ReadDrillGiven { btn?: Element; midi?: number; }
function rdScore(q: ReadQuestion, ok: boolean, timeout = false) {
    const now = performance.now(), ms = Math.max(0, Math.round(Math.min(now, inputTime(now)) - RD.t0)); // a played answer counts from its key's own time
    RD.n++;
    RD.ms += ms;
    if (ok) {
        RD.ok++;
        RD.streak++;
        RD.best = Math.max(RD.best, RD.streak);
    }
    else {
        RD.streak = 0;
        RD.miss[q.key] = (RD.miss[q.key] || 0) + 1;
    }
    if (!q.hinted) {
        rdStat(q.key, ok, ms);
        const tt = rdData().tot;
        tt.n++;
        if (ok)
            tt.ok++;
        tt.ms += ms;
    }
    if (RD.mode === 'practice' && rdHasCheck(RD.L))
        rdCheck(!q.hinted && ok, ms);
    RD.arcFx = '';
    const prev = RD.arc;
    if (!prev)
        return;
    if (prev.mode === 'survival')
        RD.limF = Math.max(0, 1 - ms / prev.targetMs);
    const arc = RD.arc = srtArcadeRecord(prev, ok ? 'correct' : timeout ? 'timeout' : 'wrong', ms, now);
    if (arc.deadlineMs !== null && prev.deadlineMs !== null && arc.deadlineMs > prev.deadlineMs) {
        RD.rushEnd = arc.deadlineMs;
        RD.arcFx = 'bonus';
    }
    if (arc.targetMs < prev.targetMs)
        RD.arcFx = 'faster';
}
function rdAnswer(ok: boolean, given?: ReadDrillGiven, timeout = false) {
    if (!RD.on || (RD.arc && RD.arc.completed))
        return;
    // Time Attack: once the clock has run out nothing more is scored.
    if (RD.mode === 'timeAttack' && rdTimeUp()) {
        if (!RD.answered || RD.fix)
            rdFinish();
        return;
    }
    if (RD.flow)
        return rdFlowAnswer(ok, given || {}, timeout);
    const q = RD.q;
    if (!q || RD.answered)
        return;
    RD.answered = true;
    clearTimeout(RD.hintT);
    clearTimeout(RD.limT);
    RD.tout = timeout;
    rdScore(q, ok, timeout);
    rdFeedback(ok, given || {});
    rdHud();
    rdCheckNotice();
    const done = !!(RD.arc && RD.arc.completed);
    RD.timers.push(setTimeout(() => { if (!RD.on)
        return; if (done || rdTimeUp() || rdnWarmLimit())
        rdFinish();
    else
        rdNext(); }, ok ? (RD.mode === 'practice' ? 650 : 380) : (RD.mode === 'timeAttack' ? 800 : 1500)));
}
// The star check's thresholds: accuracy first, then the mean answer time against the level's target.
function rdStarsFor(acc: number, avg: number, tg: number) { return acc >= 95 && avg <= tg ? 3 : acc >= 90 && avg <= tg * 1.6 ? 2 : acc >= 80 ? 1 : 0; }
function rdCheckResult() {
    const w = RD.chk, n = w.length, acc = n ? Math.round(100 * w.filter((x) => x.ok).length / n) : 0, avg = n ? w.reduce((a, x) => a + x.ms, 0) / n : 0;
    return { acc, avg, stars: RD.L ? rdStarsFor(acc, avg, rdTarget(RD.L)) : 0 };
}
// Adds a first answer to the star check. Once it holds RD_CHECK_N answers, a result better than the level's saved one is saved on the spot.
function rdCheck(ok: boolean, ms: number) {
    const L = RD.L;
    if (!L)
        return;
    RD.chk.push({ ok, ms });
    if (RD.chk.length > RD_CHECK_N)
        RD.chk.shift();
    if (RD.chk.length < RD_CHECK_N)
        return;
    const r = rdCheckResult(), was = RD.chkBest;
    RD.chkBest = Math.max(was ?? 0, r.stars);
    if (L.custom) {
        if (r.stars > (was ?? 0))
            RD.chkNew = r.stars;
        return;
    }
    const d = rdData(), rec = d.lv[L.id] ?? { s: 0, acc: 0, t: 0, n: 0, rush: 0 };
    let save = false;
    if (r.stars > (rec.s || 0)) {
        rec.s = r.stars;
        RD.chkNew = r.stars;
        save = true;
    }
    if (r.acc > (rec.acc || 0)) {
        rec.acc = r.acc;
        save = true;
    }
    if (r.avg && r.acc >= 80 && (!rec.t || r.avg < rec.t)) {
        rec.t = Math.round(r.avg);
        save = true;
    }
    if (save) {
        d.lv[L.id] = rec;
        saveAll();
    }
}
// Announces stars the check just earned, without stopping the drill.
function rdCheckNotice() {
    const s = RD.chkNew, aw = maybeById('rdx-award');
    if (!s)
        return;
    RD.chkNew = 0;
    byId('rdx-live').textContent = t('rdx_chk_live', t('rdx_stars_n', s));
    if (!aw)
        return;
    aw.textContent = t('rdx_chk_earned', '★'.repeat(s));
    aw.hidden = false;
    clearTimeout(RD.awT);
    RD.awT = setTimeout(() => { aw.hidden = true; }, 3000);
}
function rdCheckHud() {
    const n = RD.chk.length;
    if (n < RD_CHECK_N)
        return t('rdx_chk_n', n, RD_CHECK_N);
    const s = rdCheckResult().stars;
    return t('rdx_chk_s', '★'.repeat(s) + '☆'.repeat(3 - s));
}
function rdFeedback(ok: boolean, g: ReadDrillGiven) {
    const q = RD.q;
    if (!q)
        throw new Error('Étude: no reading question');
    q.state = ok ? 'good' : 'bad';
    if (q.ty === 'name' && !ok)
        q.lbl = rdName(q.note, true);
    const extra = (q.ty === 'play' && !ok && g.midi != null) ? Object.assign(rdSpellMidi(g.midi, q.keyN), { s: 'bad' }) : null;
    if (extra)
        q.state = null;
    if (q.ty !== 'k2s')
        byId('rdx-staff').innerHTML = rdQSvg(q, extra);
    const sv = byId('rdx-staff');
    sv.classList.remove('flash-ok', 'flash-bad');
    void sv.offsetWidth;
    sv.classList.add(ok ? 'flash-ok' : 'flash-bad');
    byId('rdx-ans').querySelectorAll('.rdx-a').forEach((b) => { if (!(b instanceof HTMLButtonElement))
        return; b.disabled = true; if (b.dataset.a === String(q.ans) || (q.ty === 'name' && Number(b.dataset.a) === q.note.li))
        b.classList.add('correct');
    else if (g.btn === b)
        b.classList.add('wrong'); });
    if (q.ty === 'play' || q.ty === 'k2s') {
        const exact = q.ty === 'k2s';
        rdDockMark(q.midi, 'good', exact);
        if (!ok && g.midi != null && g.midi !== q.midi)
            rdDockMark(g.midi, 'bad', exact);
    }
    const arc = RD.arc, fx = ok ? rdArcFx() : '';
    const f = byId('rdx-fb'), msg = ok ? (t('rdx_ok') + (RD.streak >= 3 ? '  🔥 ' + RD.streak : '') + (fx ? ' · ' + fx : ''))
        : (RD.tout ? t('rdx_timeout') + ' · ' : '') + t('rdx_wrong', rdAnsText(q)) + (extra ? ' · ' + t('rdx_played', rdName(extra, true)) : '') + (arc && arc.lives !== null ? ' · ' + t('rdx_lives', arc.lives) : '');
    f.className = 'rdx-fb ' + (ok ? 'good' : 'bad');
    f.textContent = (ok ? '✓ ' : RD.tout ? '⏱ ' : '✗ ') + msg;
    byId('rdx-live').textContent = msg;
    if (rdData().prefs.sound && q.ty !== 'play' && !(q.ty === 'k2s') && q.midis)
        rdSound(q.midis, q.ty === 'iv' && !q.harm);
}
function rdClickAns(b: HTMLElement) {
    const q = RD.q;
    if (!q || (RD.answered && !RD.fix) || !RD.on)
        return;
    const v = b.dataset.a;
    if (q.ty === 'name')
        return rdAnswer(Number(v) === q.note.li && (!q.needAcc || RD.accSel === (q.note.acc || 0)), { btn: b });
    if (q.ty === 'k2s') {
        const o = q.opts?.[Number(v)];
        return rdAnswer(Number(v) === q.ans, o ? { btn: b, midi: rdMidi(o.n) } : { btn: b });
    }
    rdAnswer(v === String(q.ans), { btn: b });
}
function rdInput(m: number) {
    if (!RD.on)
        return;
    if (!RD.L)
        throw new Error('Étude: no reading level');
    if (RD.L.ty === 'rh') {
        rdTap(m < 60 ? 'L' : 'R');
        return;
    }
    const q = RD.q;
    if (!q || (RD.answered && !RD.fix))
        return;
    const src = [...(inputOwners.get(m) || [])], strict = src.some((s) => s === 'midi' || s === 'ble');
    // On-screen keys must be the exact key while the note is within the keyboard's octaves; beyond them the name is enough, as the folded mark shows.
    if (q.ty === 'play')
        return rdAnswer(data.settings.anyOctave ? pc(m) === pc(q.midi) : (strict || (src.some((s) => /^(pointer|button):/.test(s)) && foldToView(q.midi) === q.midi) ? m === q.midi : pc(m) === pc(q.midi)), { midi: m });
    if (q.ty === 'name')
        return rdAnswer(pc(m) === pc(q.midi), { midi: m });
    // Key to staff answers with 1–4 or a click: a played note only sounds, since playing the lit key would answer without reading.
    if (q.ty === 'k2s')
        return;
    if (q.ty === 'ch') {
        const hp = heldPcs();
        if (hp.length >= 3)
            rdAnswer(hp.join() === q.pcs.join(), {});
    }
}
function rdHud() {
    const h = byId('rdx-hud'), mt = byId('rdx-meter');
    if (!h)
        return;
    let s = '', f: number | null = null;
    if (RD.L && RD.L.ty === 'rh') {
        const rp = RD.rhP || [], n = rp.length;
        s = n ? '⌀ ' + Math.round(rp.reduce((x, y) => x + y, 0) / n) + '% · ' + n + '×' : '';
        if (RD.mode === 'test')
            f = n / 4;
    }
    else if (RD.arc) {
        const arc = RD.arc, now = performance.now(), parts: string[] = [];
        if (arc.mode === 'survival') {
            const lives = arc.lives ?? 0;
            parts.push('♥'.repeat(lives) + '♡'.repeat(Math.max(0, ARCADE_LIVES - lives)));
            f = RD.answered ? RD.limF : 1 - (now - RD.t0) / arc.targetMs;
        }
        else if (arc.mode === 'timeAttack') {
            const left = srtArcadeRemainingMs(arc, now) ?? 0;
            parts.push('⏱ ' + Math.ceil(left / 1000) + 's');
            f = left / TIME_ATTACK_MS;
        }
        else if (arc.total !== null) {
            const answered = arc.correct + arc.mistakes;
            parts.push(t('rdx_hud_q', Math.min(arc.total, answered + (RD.answered ? 0 : 1)), arc.total));
            f = answered / arc.total;
        }
        parts.push('×' + srtArcadeMultiplier(arc.combo), t('rdx_arc_score', anNum(arc.score, 0)));
        if (arc.combo >= 2)
            parts.push('🔥 ' + arc.combo);
        s = parts.join(' · ');
    }
    else {
        s = '✓ ' + RD.ok + '/' + RD.n + (RD.streak >= 2 ? ' · 🔥 ' + RD.streak : '');
        if (RD.mode === 'practice' && rdHasCheck(RD.L))
            s += ' · ' + rdCheckHud();
    }
    if (RD.flow && RD.flow.gh)
        s += ' · 👻 ' + formatLead(RD.flow.gd);
    h.textContent = s;
    mt.hidden = f == null;
    const progress = mt.firstElementChild;
    if (f != null && progress instanceof HTMLElement)
        progress.style.transform = 'scaleX(' + Math.max(0, Math.min(1, f)).toFixed(3) + ')';
}
/* ---- rhythm reading: tap the rhythm against a metronome ---- */
type RdRhythmUnit = '4' | '2' | '1' | '8' | 'r4' | 'd' | '16';
const RD_RHU: Record<RdRhythmUnit, number[][]> = { '4': [[1]], '2': [[2]], '1': [[4]], '8': [[.5], [.5]], 'r4': [[1, 1]], 'd': [[1.5], [.5]], '16': [[.25], [.25], [.25], [.25]] };
function isRdRhythmUnit(u: string): u is RdRhythmUnit { return Object.hasOwn(RD_RHU, u); }
// One written note or rest of a rhythm exercise, in beats from the start of the first bar.
interface RdRhythmEvent { beat: number; dur: number; rest: boolean; u?: RdRhythmUnit; }
/** The tempo of a rhythm or sight-reading level; every such level in the curriculum sets one. */
function rdLevelBpm(L: ReadDrillLevel): number { if (L.bpm === undefined)
    throw new TypeError('Étude: level ' + L.id + ' has no tempo'); return L.bpm; }
function rdRhGen(L: { units?: readonly string[]; }) {
    const units = L.units;
    if (!units)
        throw new TypeError('Étude: rhythm level has no note values');
    let ev: RdRhythmEvent[] = [];
    for (let tries = 0; tries < 12; tries++) {
        ev = [];
        for (let bar = 0; bar < 2; bar++) {
            let pos = 0;
            while (pos < 4 - 1e-6) {
                const c = units.filter((u): u is RdRhythmUnit => { if (!isRdRhythmUnit(u))
                    return false; const len = RD_RHU[u].reduce((a: number, x: number[]) => a + x[0], 0); return len <= 4 - pos + 1e-6 && !(u === '1' && pos > 0) && !(u === 'r4' && bar === 0 && pos === 0) && !(u === 'd' && pos % 2); });
                const u: RdRhythmUnit = c.length ? randItem(c) : '4';
                RD_RHU[u].forEach((x: number[]) => { ev.push({ beat: bar * 4 + pos, dur: x[0], rest: !!x[1], u }); pos += x[0]; });
            }
        }
        const last = units[units.length - 1];
        if (ev.some((e) => e.u === last) && ev.filter((e) => !e.rest).length >= 4)
            break;
    }
    return ev;
}
// How one written onset was met: good/near/bad, and how far off the matched tap was in ms (null when nothing matched).
interface RdRhythmTapResult { s: string; off: number | null; }
// Tap-only grading: per-onset results, the count of extra taps, the score in % and the mean offset in ms.
interface RdRhythmTapGrade { res: RdRhythmTapResult[]; extra: number; good: number; near: number; pct: number; mean: number; }
function rdRhGrade(on: readonly number[], taps: readonly number[], bs: number): RdRhythmTapGrade {
    const used = new Set<number>(), res: RdRhythmTapResult[] = [];
    let minI = 4;
    for (let i = 1; i < on.length; i++)
        minI = Math.min(minI, on[i] - on[i - 1]);
    const win = Math.min(0.25, 0.5 * minI * bs);
    on.forEach((b: number) => {
        let bi = -1, bd = Infinity;
        taps.forEach((tb: number, j: number) => { if (used.has(j))
            return; const d = (tb - b) * bs; if (Math.abs(d) <= win && Math.abs(d) < Math.abs(bd)) {
            bd = d;
            bi = j;
        } });
        if (bi >= 0) {
            used.add(bi);
            const a = Math.abs(bd) * 1000;
            res.push({ s: a <= 100 ? 'good' : a <= 180 ? 'near' : 'bad', off: bd * 1000 });
        }
        else
            res.push({ s: 'bad', off: null });
    });
    const extra = taps.length - used.size, good = res.filter((r) => r.s === 'good').length, near = res.filter((r) => r.s === 'near').length;
    const offs = res.filter((r): r is RdRhythmTapResult & { off: number; } => r.off != null).map((r) => r.off), mean = offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : 0;
    return { res, extra, good, near, pct: Math.max(0, Math.round(100 * (good + 0.5 * near) / Math.max(1, on.length) - extra * 5)), mean: Math.round(mean) };
}
function rdClick(tm: number, acc: boolean) {
    const click = audioEngine.scheduleClick(tm, acc);
    if (click?.oscs)
        (RD.nodes = RD.nodes || []).push(...click.oscs);
}
function rdBeatX(r: { beatX: readonly { b: number; x: number; }[]; }, beat: number) { const p = r.beatX; for (let i = 0; i < p.length - 1; i++) {
    if (beat >= p[i].b && beat <= p[i + 1].b) {
        const f = (beat - p[i].b) / Math.max(1e-3, p[i + 1].b - p[i].b);
        return p[i].x + f * (p[i + 1].x - p[i].x);
    }
} return beat <= p[0].b ? p[0].x : p[p.length - 1].x; }
// Options (remembered): grade how long each note is held, and/or a left-hand part on a second staff.
function rdRhPrefs() { const p = rdData().prefs; return { dur: !!p.rhDur, two: p.rhHands === 2 }; }
type RdLeftHandPattern = 'whole' | 'half' | 'pulse' | 'onethree' | 'twofour';
const RD_LH_PAT: Record<RdLeftHandPattern, number[][]> = { whole: [[4]], half: [[2], [2]], pulse: [[1], [1], [1], [1]], onethree: [[1], [1, 1], [1], [1, 1]], twofour: [[1, 1], [1], [1, 1], [1]] };
function rdRhGenLH(L: { n: number; }) {
    const pool: RdLeftHandPattern[] = L.n <= 2 ? ['whole', 'half'] : L.n === 3 ? ['whole', 'half', 'pulse'] : ['half', 'pulse', 'onethree', 'twofour'], ev: RdRhythmEvent[] = [];
    for (let bar = 0; bar < 2; bar++) {
        let pos = 0;
        const pat: RdLeftHandPattern = randItem(pool);
        RD_LH_PAT[pat].forEach((x: number[]) => { ev.push({ beat: bar * 4 + pos, dur: x[0], rest: !!x[1] }); pos += x[0]; });
    }
    return ev;
}
// The anchors on the dock keyboard: C3 for the left hand, C5 for the right (any key below / from middle C counts for that hand).
function rdRhMarks(on: boolean) { [48, 72].forEach((m) => kbState(m, on ? 'target' : null, false)); }
// What srRender returns that a rhythm exercise reads back: the staff, its vertical extent, beat → x anchors and the drawn notes.
interface RdRhythmRender { svg: string; yTop: number; yBot: number; beatX: { b: number; x: number; }[]; notes: { nid: number; hand: string; beat: number; }[]; }
// The piece handed to srRender for a rhythm exercise: percussion notes on B4 (right hand) and D3 (left hand), or rests.
interface RdRhythmPiece { id: string; perc: boolean; noNames: boolean; ts: number[]; keyN: number; bpm: number; rh: [string, number][]; lh?: [string, number][]; }
// One key press (or pad tap) in beats from the downbeat; off stays null until it is released.
interface RdRhythmPress { src: string; hand: 'L' | 'R'; on: number; off: number | null; }
type RdRhythmGrade = RdRhythmTapGrade | RdRhythmAllGrade;
// The rhythm exercise on show (RD.rh): what is written, how it was drawn, and the presses of the current run.
interface RdRhythmState { ev: RdRhythmEvent[]; lh: RdRhythmEvent[] | null; r: RdRhythmRender; dur: boolean; two: boolean; on: number[]; taps: number[]; presses: RdRhythmPress[]; open: Map<string, RdRhythmPress>; playing: boolean; graded: RdRhythmGrade | null; raf: number; listen: boolean; t0: number; piece: RdRhythmPiece; paper: SrLayout | undefined; }
function rdRhNew(keep?: boolean) {
    const L = RD.L, pr = rdRhPrefs(), old = keep && RD.rh;
    if (!L)
        return;
    const ev = old ? old.ev : rdRhGen(L), lh = pr.two ? ((old && old.lh) || rdRhGenLH(L)) : null;
    const piece: RdRhythmPiece = { id: 'rh', perc: true, noNames: true, ts: [4, 4], keyN: 0, bpm: rdLevelBpm(L), rh: ev.map((e: RdRhythmEvent): [string, number] => [e.rest ? 'R' : 'B4', e.dur]) };
    if (lh)
        piece.lh = lh.map((e: RdRhythmEvent): [string, number] => [e.rest ? 'R' : 'D3', e.dur]);
    const r: RdRhythmRender = srRender(piece, undefined, true);
    const rh: RdRhythmState = { ev, lh, r, dur: pr.dur, two: pr.two, on: ev.filter((e: RdRhythmEvent) => !e.rest).map((e: RdRhythmEvent) => e.beat), taps: [], presses: [], open: new Map(), playing: false, graded: null, raf: 0, listen: false, t0: 0, piece, paper: undefined };
    RD.rh = rh;
    const tst = RD.mode === 'test', pad = (h: string, lbl: string, k: string) => `<button class="rdx-tap" id="rdx-tap${h === 'L' ? 'L' : ''}" data-hand="${h}" aria-label="${rdEsc(lbl)}" aria-describedby="rdx-coach">${rdEsc(lbl)}<small>${rdEsc(k)}</small></button>`;
    const pads = pr.two ? pad('L', t('rdx_tap') + ' · ' + t('rdx_tap_l'), t('rdx_tap_lk')) + pad('R', t('rdx_tap') + ' · ' + t('rdx_tap_r'), t('rdx_tap_rk')) : pad('R', t('rdx_tap'), t('rdx_tap_k'));
    const hint = [pr.two ? t('rdx_rh_two_hint') : '', pr.dur ? t('rdx_rh_dur_hint') : ''].filter(Boolean).join(' ');
    byId('rdx-body').innerHTML = `<div class="rdx-q rdx-rh"><div class="rdx-prompt">${t('rdx_p_rh')}${tst ? ' · ' + t('rdx_hud_q', RD.rhP.length + 1, 4) : ''}</div>
    <div class="rdx-rhopts" id="rdx-rhopts" role="group" aria-label="${t('rdx_rh_opts')}"><label class="switch-inline"><input type="checkbox" id="rdx-rhdur"${pr.dur ? ' checked' : ''}> <span>${t('rdx_rh_dur')}</span></label>
      <div class="seg" id="rdx-rhhands" role="group" aria-label="${t('rdx_rh_hands')}"><button type="button" data-hands="1" aria-pressed="${!pr.two}">${t('rdx_rh_one')}</button><button type="button" data-hands="2" aria-pressed="${pr.two}">${t('rdx_rh_two')}</button></div></div>
    <p class="rdx-rhhint" id="rdx-rhhint">${rdEsc(hint)}</p>
    <div class="rdx-staff ss-wrap" id="rdx-staff">${r.svg}</div><div class="rdx-fb" id="rdx-fb">${t('rdx_rh_bpm', rdLevelBpm(L))}</div><div class="rdx-rhdet" id="rdx-rhdet"></div>
    <div class="rdx-rhbar"><button class="btn primary" id="rdx-rhgo">${t('rdx_rh_start')}</button>${tst ? '' : `<button class="btn ghost" id="rdx-rhlisten">${t('rd_listen')}</button>`}${pads}</div>
    <div class="rdx-tools" id="rdx-rhnext"></div></div>`;
    rdRhFit();
    rdRhMarks(pr.two);
    rdHud();
}
// Lays the rhythm out for its paper once it is on the page, and again when the paper changes size; never while it plays or
// once it is graded, since the marks live on the drawn notes.
function rdRhFit() {
    const R = RD.rh, wrap = maybeById('rdx-staff');
    if (!R || !wrap || R.playing || R.graded || !wrap.closest('.rdx-rh'))
        return;
    const lay = srPaperOf(wrap);
    if (!srPaperChanged(R.paper, lay))
        return;
    R.paper = lay;
    R.r = srRender(R.piece, lay, true);
    wrap.innerHTML = R.r.svg;
}
function rdRhOptsLock(on: boolean) { (document).querySelectorAll('#rdx-rhopts input,#rdx-rhopts button').forEach((x) => { if (x instanceof HTMLInputElement || x instanceof HTMLButtonElement)
    x.disabled = on; }); }
let rdRhRunId = 0;
function rdRhInterrupt() {
    const round = RD.rh;
    if (!round?.playing) return;
    rdRhRunId++;
    round.playing = false;
    cancelAnimationFrame(round.raf);
    round.open.clear();
    (RD.nodes || []).forEach(node => { try { node.stop(0); } catch (_) { } });
    RD.nodes = [];
    byId('rdx-staff').querySelector('.ss-playhead')?.remove();
    rdRhOptsLock(false);
    byId('rdx-fb').textContent = t('rdx_rh_yourturn');
    byId('rdx-live').textContent = t('rdx_rh_yourturn');
}
async function rdRhRun(listen: boolean) {
    const R = RD.rh, L = RD.L;
    if (!R || !L || R.playing) return;
    const context = ensureAudio();
    if (!context) return;
    const runId = ++rdRhRunId;
    R.playing = true;
    R.t0 = Infinity;
    rdRhOptsLock(true);
    if (context.state !== 'running') {
        const ready = await timedAudioReady(context);
        if (RD.rh !== R || rdRhRunId !== runId || !R.playing) return;
        if (!ready) {
            rdRhInterrupt();
            return;
        }
    }
    const bs = 60 / rdLevelBpm(L);
    R.taps = [];
    R.presses = [];
    R.open.clear();
    R.graded = null;
    R.listen = !!listen;
    byId('rdx-rhdet').innerHTML = '';
    byId('rdx-staff').querySelectorAll('.ss-n').forEach((g) => { g.removeAttribute('data-s'); g.removeAttribute('data-d'); const tt = g.querySelector('title.rdx-tt'); if (tt)
        tt.remove(); });
    const act0 = context.currentTime + 0.2, beat0 = act0 + 4 * bs;
    R.t0 = performance.now() + 200 + 4 * bs * 1000;
    for (let b = 0; b < 4; b++)
        rdClick(act0 + b * bs, b === 0);
    for (let b = 0; b < 8; b++)
        rdClick(beat0 + b * bs, b % 4 === 0);
    if (listen) {
        const k = R.dur ? .92 : .8;
        R.ev.forEach((e: RdRhythmEvent) => { if (!e.rest)
            previewNote(72, beat0 + e.beat * bs, Math.max(.12, e.dur * bs * k), 90); });
        if (R.lh)
            R.lh.forEach((e: RdRhythmEvent) => { if (!e.rest)
                previewNote(48, beat0 + e.beat * bs, Math.max(.12, e.dur * bs * k), 80); });
    }
    const f = byId('rdx-fb');
    f.className = 'rdx-fb';
    f.textContent = t('rdx_rh_count');
    const svg = byId('rdx-staff').querySelector('svg');
    if (!svg) return;
    let c = svg.querySelector('.ss-playhead');
    if (!c) {
        c = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        c.setAttribute('class', 'ss-playhead');
        c.setAttribute('y1', String(R.r.yTop));
        c.setAttribute('y2', String(R.r.yBot));
        svg.appendChild(c);
    }
    const loop = () => {
        if (!R.playing)
            return;
        const b = (performance.now() - R.t0) / 1000 / bs;
        if (b >= 0 && f.textContent === t('rdx_rh_count'))
            f.textContent = listen ? t('rdx_rh_listening') : t('rdx_rh_tapnow');
        const x = rdBeatX(R.r, Math.max(0, Math.min(8, b)));
        c.setAttribute('x1', String(x));
        c.setAttribute('x2', String(x));
        if (b > 8.6) {
            R.playing = false;
            c.remove();
            rdRhOptsLock(false);
            if (listen) {
                f.textContent = t('rdx_rh_yourturn');
            }
            else
                rdRhDone(b);
            return;
        }
        R.raf = requestAnimationFrame(loop);
    };
    R.raf = requestAnimationFrame(loop);
}
// Every press is kept with its release: src names the key (MIDI note, computer key, pointer on a pad), hand is 'L' or 'R'.
function rdRhPress(src: string, hand: string) {
    const R = RD.rh, L = RD.L;
    if (!R || !L || !R.playing || R.listen || !Number.isFinite(R.t0))
        return;
    if (R.open.has(src))
        rdRhRelease(src);
    const b = (inputTime() - R.t0) / 1000 / (60 / rdLevelBpm(L)); // the key's own time, less its calibrated latency
    const p: RdRhythmPress = { src, hand: R.two && hand === 'L' ? 'L' : 'R', on: b, off: null };
    R.presses.push(p);
    R.open.set(src, p);
    R.taps.push(b);
    const el = queryHtml(document, '#rdx-body .rdx-tap[data-hand="' + p.hand + '"]');
    if (el) {
        el.classList.remove('hit');
        void el.offsetWidth;
        el.classList.add('hit');
    }
}
function rdRhRelease(src: string) { const R = RD.rh; if (!R)
    return; const p = R.open.get(src); if (!p)
    return; R.open.delete(src); const L = RD.L; if (R.playing && L)
    p.off = Math.max(p.on, (inputTime() - R.t0) / 1000 / (60 / rdLevelBpm(L))); }
function rdRhKey(kind: string, m: number) { if (kind === 'on')
    rdRhPress('m' + m, m < 60 ? 'L' : 'R');
else
    rdRhRelease('m' + m); }
function rdTap(hand: string | undefined) { const src = 'tap' + performance.now(); rdRhPress(src, hand || 'R'); rdRhRelease(src); } // a click without press/release (assistive tech)
/* Lengths: each written note is paired with one stroke of its hand (keys struck within 70 ms are one stroke, e.g. a held chord, and it
   ends when its last key lifts). The release is compared with the written end of the note; the windows scale with the note's length
   and are clamped to practical limits, so at any tempo a held half note and a quarter followed by a rest are told apart, while normal
   articulation stays "good". Keys still down when the exercise ends count as released at that moment. */
function rdRhStrokes(ps: readonly RdRhythmPress[], end: number, gap: number) {
    const out: { on: number; off: number; }[] = [];
    ps.slice().sort((a: RdRhythmPress, b: RdRhythmPress) => a.on - b.on).forEach((p: RdRhythmPress) => {
        const off = p.off == null ? end : p.off, l = out[out.length - 1];
        if (l && p.on - l.on <= gap)
            l.off = Math.max(l.off, off);
        else
            out.push({ on: p.on, off });
    });
    return out;
}
// One written note of a hand: its onset grade and offset in ms, and (when lengths are graded) its release grade and offset.
interface RdRhythmNoteResult { e: RdRhythmEvent; s: string; off: number | null; rs: string | null; roff: number | null; }
// One hand's grading: onsets and (with dur) lengths, as counts, a weighted score, the % and the mean onset offset in ms.
interface RdRhythmHandGrade { res: RdRhythmNoteResult[]; N: number; good: number; near: number; extra: number; score: number; dur: boolean; lenOk: number; early: number; late: number; mean: number; pct: number; }
function rdRhGradeHand(ev: readonly RdRhythmEvent[], ps: readonly RdRhythmPress[], bs: number, dur: boolean, end: number): RdRhythmHandGrade {
    const tg = ev.filter((e: RdRhythmEvent) => !e.rest), st = rdRhStrokes(ps.filter((p: RdRhythmPress) => p.on > -0.5), end, 0.07 / bs), used = new Set<number>(), res: RdRhythmNoteResult[] = [];
    let minI = 4;
    for (let i = 1; i < tg.length; i++)
        minI = Math.min(minI, tg[i].beat - tg[i - 1].beat);
    const win = Math.min(0.25, 0.5 * minI * bs), cl = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
    tg.forEach((e: RdRhythmEvent) => {
        let bi = -1, bd = Infinity;
        st.forEach((s, j) => { if (used.has(j))
            return; const d = (s.on - e.beat) * bs; if (Math.abs(d) <= win && Math.abs(d) < Math.abs(bd)) {
            bd = d;
            bi = j;
        } });
        const r: RdRhythmNoteResult = { e, s: 'bad', off: null, rs: null, roff: null };
        if (bi >= 0) {
            used.add(bi);
            const a = Math.abs(bd) * 1000;
            r.s = a <= 100 ? 'good' : a <= 180 ? 'near' : 'bad';
            r.off = bd * 1000;
            if (dur) {
                const sec = e.dur * bs, d = (st[bi].off - (e.beat + e.dur)) * bs, eG = cl(.25 * sec, .1, .4), eN = cl(.45 * sec, .18, .8), lG = cl(.15 * sec, .1, .25), lN = cl(.3 * sec, .18, .45);
                r.roff = Math.round(d * 1000);
                r.rs = d < -eN ? 'early' : d > lN ? 'late' : (d < -eG || d > lG) ? 'near' : 'good';
            }
        }
        res.push(r);
    });
    const N = tg.length, good = res.filter((r) => r.s === 'good').length, near = res.filter((r) => r.s === 'near').length, extra = st.length - used.size;
    const att = good + 0.5 * near, len = res.reduce((a, r) => a + (r.rs === 'good' ? 1 : r.rs === 'near' ? .5 : 0), 0), score = dur ? (att + len) / 2 : att;
    const offs = res.filter((r): r is RdRhythmNoteResult & { off: number; } => r.off != null).map((r) => r.off);
    return { res, N, good, near, extra, score, dur, lenOk: res.filter((r) => r.rs === 'good' || r.rs === 'near').length, early: res.filter((r) => r.rs === 'early').length, late: res.filter((r) => r.rs === 'late').length,
        mean: offs.length ? Math.round(offs.reduce((a, b) => a + b, 0) / offs.length) : 0, pct: Math.max(0, Math.round(100 * score / Math.max(1, N) - extra * 5)) };
}
type RdRhythmCountKey = 'N' | 'good' | 'near' | 'extra' | 'lenOk' | 'early' | 'late' | 'score';
// Grading with lengths and/or both hands: the per-hand grades and their totals.
interface RdRhythmAllGrade { by: { R?: RdRhythmHandGrade; L?: RdRhythmHandGrade; }; N: number; good: number; near: number; extra: number; lenOk: number; early: number; late: number; res: RdRhythmNoteResult[]; mean: number; pct: number; }
function rdRhGradeAll(R: RdRhythmState, bs: number, end: number): RdRhythmAllGrade {
    const hands: ('R' | 'L')[] = R.two ? ['R', 'L'] : ['R'], by: { R?: RdRhythmHandGrade; L?: RdRhythmHandGrade; } = {};
    hands.forEach((h) => { by[h] = rdRhGradeHand(h === 'R' ? R.ev : R.lh || [], R.presses.filter((p: RdRhythmPress) => p.hand === h), bs, R.dur, end); });
    const all = hands.map((h) => by[h]).filter((g): g is RdRhythmHandGrade => !!g), sum = (k: RdRhythmCountKey) => all.reduce((a, g) => a + g[k], 0), N = sum('N'), offs = all.flatMap((g) => g.res.filter((r): r is RdRhythmNoteResult & { off: number; } => r.off != null).map((r) => r.off));
    return { by, N, good: sum('good'), near: sum('near'), extra: sum('extra'), lenOk: sum('lenOk'), early: sum('early'), late: sum('late'), res: all.flatMap((g) => g.res),
        mean: offs.length ? Math.round(offs.reduce((a, b) => a + b, 0) / offs.length) : 0, pct: Math.max(0, Math.round(100 * sum('score') / Math.max(1, N) - sum('extra') * 5)) };
}
function rdRhNoteTip(r: RdRhythmNoteResult) {
    if (r.off == null)
        return t('rdx_rh_n_miss');
    const p: string[] = [], roff = r.roff ?? 0; // roff is set whenever rs is
    if (r.rs === 'early')
        p.push(t('rdx_rh_n_early', -roff));
    else if (r.rs === 'late')
        p.push(t('rdx_rh_n_late', roff));
    else if (r.rs === 'near')
        p.push(t(roff < 0 ? 'rdx_rh_n_short' : 'rdx_rh_n_long'));
    if (Math.abs(r.off) > 100)
        p.push(Math.round(r.off) + ' ms');
    return p.join(' · ');
}
function rdRhHandLine(name: string, g: RdRhythmHandGrade | undefined) {
    if (!g)
        return '';
    const p = [t('rdx_rh_att', (g.good + g.near) + '/' + g.N)];
    if (g.dur) {
        p.push(t('rdx_rh_len', g.lenOk + '/' + g.N));
        if (g.early)
            p.push(t('rdx_rh_early', g.early));
        if (g.late)
            p.push(t('rdx_rh_late', g.late));
    }
    if (g.extra)
        p.push(t('rdx_rh_extra', g.extra));
    return (name ? t('rdx_rh_hand', name, g.pct) + ' — ' : '') + p.join(' · ');
}
function rdRhDone(endBeat: number) {
    const R = RD.rh, L = RD.L;
    if (!R || !L)
        return;
    const bs = 60 / rdLevelBpm(L), plain = !R.dur && !R.two;
    let g: RdRhythmGrade, msg: string;
    const det = maybeById('rdx-rhdet');
    if (plain) {
        g = rdRhGrade(R.on, R.taps.filter((x: number) => x > -0.5), bs); // the original tap-only grading
        const gs = byId('rdx-staff').querySelectorAll('.ss-n');
        g.res.forEach((r, i) => { const n = gs[i]; if (n instanceof SVGElement)
            n.dataset.s = r.s; });
    }
    else {
        const ga = rdRhGradeAll(R, bs, endBeat || 8.6);
        g = ga;
        Object.entries(ga.by).forEach(([h, hg]) => hg?.res.forEach((r: RdRhythmNoteResult) => {
            const n = R.r.notes.find((x: RdRhythmRender['notes'][number]) => x.hand === (h === 'L' ? 'lh' : 'rh') && Math.abs(x.beat - r.e.beat) < 1e-3), el = n && byId('rdx-staff').querySelector('.ss-n[data-nid="' + n.nid + '"]');
            if (!(el instanceof SVGElement))
                return;
            el.dataset.s = r.s;
            if (r.rs && r.rs !== 'good')
                el.dataset.d = r.rs;
            const tip = rdRhNoteTip(r);
            if (tip) {
                const tt = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                tt.setAttribute('class', 'rdx-tt');
                tt.textContent = tip;
                el.appendChild(tt);
            }
        }));
    }
    R.graded = g;
    RD.rhP.push(g.pct);
    const matched = g.res.some(r => r.off != null);
    if (matched) RD.rhM.push(g.mean);
    RD.n++;
    RD.ok += g.pct;
    markReadDoneToday(true);
    const timing = !matched ? '' : ' · ' + (Math.abs(g.mean) < 25 ? t('rdx_rh_ontime') : g.mean < 0 ? t('rdx_rh_rush', -g.mean) : t('rdx_rh_drag', g.mean));
    if (plain)
        msg = t('rdx_rh_res', g.pct, (g.good + g.near) + '/' + R.on.length) + timing + (g.extra ? ' · ' + t('rdx_rh_extra', g.extra) : '');
    else if (!R.two)
        msg = t('rdx_rh_score', g.pct) + ' · ' + rdRhHandLine('', 'by' in g ? g.by.R : undefined) + timing;
    else
        msg = t('rdx_rh_score', g.pct) + timing;
    if (det)
        det.innerHTML = R.two ? (['R', 'L'] as const).map((h) => `<div>${rdEsc(rdRhHandLine(t(h === 'R' ? 'rdx_rh_hand_r' : 'rdx_rh_hand_l'), 'by' in g ? g.by[h] : undefined))}</div>`).join('') : '';
    const f = byId('rdx-fb');
    f.className = 'rdx-fb ' + (g.pct >= 75 ? 'good' : g.pct >= 50 ? '' : 'bad');
    f.textContent = msg;
    byId('rdx-live').textContent = [msg].concat(det ? [...det.children].map((x) => x.textContent ?? '') : []).join('. ');
    rdStat('rh:' + L.id, g.pct >= 75, 0);
    if (RD.mode === 'test') {
        if (RD.rhP.length >= 4) {
            RD.timers.push(setTimeout(() => { if (RD.on)
                rdFinish(); }, 1600));
        }
        else
            byId('rdx-rhnext').innerHTML = `<button class="btn primary" data-act="rhnew">${t('rdx_next_ex')} →</button>`;
    }
    else if (rdnWarmLimit())
        RD.timers.push(setTimeout(() => { if (RD.on)
            rdFinish(); }, 1600));
    else
        byId('rdx-rhnext').innerHTML = `<button class="btn ghost" data-act="rhagain">↺ ${t('rdx_again_same')}</button><button class="btn primary" data-act="rhnew">🎲 ${t('rdx_new_rh')}</button>`;
    rdHud();
}
/* ---- generated sight-reading melodies (played in the Read & play engine) ---- */
// A sight-reading level: its keys (as signature counts), range, note lengths in beats and tempo.
interface RdSightLevel { keys: number[]; lo: string; hi: string; durs: number[]; id: string; n: number; bpm: number; clef?: string; }
// A generated melody, shaped like a Read & play piece; rh/lh hold [pitch name, beats] pairs.
interface RdSightPiece { id: string; ephemeral: boolean; gen: string; comp: string; level: number; keyN: number; ts: number[]; bpm: number; t: { en: string; ro: string; }; minor?: boolean; rh?: SrToken[]; lh?: SrToken[]; }
function isRdSightLevel(L: ReadDrillLevel): L is ReadDrillLevel & RdSightLevel { return Array.isArray(L.keys) && L.lo !== undefined && L.hi !== undefined && Array.isArray(L.durs) && L.bpm !== undefined; }
function srtProfileForLevel(L: RdSightLevel): SightReadingProfile {
    if (L.id === 'sr10')
        return 'P4.a';
    if (L.id === 'sr11')
        return 'P4.b';
    if (L.id === 'sr12')
        return 'P4.c';
    if (L.id === 'sr6')
        return 'P3.a';
    if (L.id === 'sr7')
        return 'P3.b';
    if (L.id === 'sr8')
        return 'P3.c';
    if (L.id === 'sr9')
        return 'P3.d';
    if (L.clef === 'grand')
        return 'P2.c';
    if (L.id === 'sr1')
        return 'P1.a';
    if (L.id === 'sr2')
        return 'P1.b';
    if (L.id === 'sr3')
        return 'P1.c';
    if (L.id === 'sr4')
        return 'P2.a';
    return 'P2.b';
}
let srtSeedCounter = 0;
const SRT_LAST_FINGERPRINT_KEY = 'etude-sight-last-fingerprint';
const SRT_RECENT_FINGERPRINTS_KEY = 'etude-sight-recent-fingerprints';
const SRT_RECENT_FINGERPRINT_LIMIT = 12;
const parseSrtRecent: (text: string) => unknown = JSON.parse;
let srtRecentFingerprintMemory: string[] = [];
function srtSeedForLevel(id: string, injectedSeed?: number): number {
    if (Number.isInteger(injectedSeed))
        return injectedSeed as number;
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const values = new Uint32Array(1);
        crypto.getRandomValues(values);
        return values[0] >>> 0;
    }
    let salt = 0;
    for (const char of id)
        salt = (salt * 31 + char.charCodeAt(0)) | 0;
    srtSeedCounter = (srtSeedCounter + 1) >>> 0;
    return (Date.now() ^ salt ^ srtSeedCounter) >>> 0;
}
function srtRememberGeneratedFingerprint(fingerprint: string) {
    const recent = srtRecentGeneratedFingerprints().filter((value) => value !== fingerprint);
    recent.push(fingerprint);
    srtRecentFingerprintMemory = recent.slice(-SRT_RECENT_FINGERPRINT_LIMIT);
    const serialized = JSON.stringify(srtRecentFingerprintMemory);
    try {
        sessionStorage.setItem(SRT_LAST_FINGERPRINT_KEY, fingerprint);
        sessionStorage.setItem(SRT_RECENT_FINGERPRINTS_KEY, serialized);
    }
    catch {
        // A session-storage failure must not block offline generation.
    }
    try {
        localStorage.setItem(SRT_LAST_FINGERPRINT_KEY, fingerprint);
        localStorage.setItem(SRT_RECENT_FINGERPRINTS_KEY, serialized);
    }
    catch {
        // A local-storage failure must not block offline generation.
    }
}
function srtRecentGeneratedFingerprints() {
    const values: string[] = [...srtRecentFingerprintMemory];
    const read = (store: Storage) => {
        try {
            const raw = store.getItem(SRT_RECENT_FINGERPRINTS_KEY);
            if (raw) {
                const parsed = parseSrtRecent(raw);
                if (Array.isArray(parsed))
                    parsed.forEach((value) => { if (typeof value === 'string')
                        values.push(value); });
            }
            else {
                const last = store.getItem(SRT_LAST_FINGERPRINT_KEY);
                if (last)
                    values.push(last);
            }
        }
        catch {
            // Generation remains available when browser storage is unavailable.
        }
    };
    read(sessionStorage);
    read(localStorage);
    return [...new Set(values)].slice(-SRT_RECENT_FINGERPRINT_LIMIT);
}
function srtLegacyPiece(piece: SightReadingPiece, L: RdSightLevel): RdSightPiece {
    const hand = L.clef === 'bass' ? 'lh' : 'rh';
    // A note that crosses a beat is written as tied notes; only the first one is played.
    const events = (voice: 'rh'|'lh'): SrToken[] => srtNotationSegments(piece, voice)
        .map((segment): SrToken => {
            const sound: SrToken[0] = segment.event.pitches.length ? segment.event.pitches.map((pitch) => pitch.spelling) : 'R';
            return segment.tied ? [sound, segment.durationTick / 480, 'tied'] : [sound, segment.durationTick / 480];
        });
    const result: RdSightPiece = {
        id: 'gen', ephemeral: true, gen: L.id, comp: '', level: L.n, keyN: piece.key.keyN, minor: piece.key.mode !== 'major',
        ts: [piece.meter.num, 4], bpm: 60,
        t: { en: tl('en', 'rdx_sr_title', L.n), ro: tl('ro', 'rdx_sr_title', L.n) },
    };
    if (piece.events.some((event) => event.hand === 'lh'))
        result.lh = events('lh');
    if (piece.events.some((event) => event.hand === 'rh'))
        result.rh = events('rh');
    if (!result.rh && !result.lh)
        result[hand] = events(hand);
    return result;
}
function rdSightGen(L: RdSightLevel) {
    const keyN: number = randItem(L.keys), kA = ssKeyAcc(keyN), lo = rdStep(rdP(L.lo)), hi = rdStep(rdP(L.hi));
    const tonLi = SR_LET.indexOf(RD_MAJ[keyN + 7][0]);
    let ton = lo;
    while (((ton % 7) + 7) % 7 !== tonLi)
        ton++;
    if (ton > hi)
        ton -= 7;
    const nm = (s: number) => { const n = rdFromStep(s); return SR_LET[n.li] + (kA[n.li] > 0 ? '#' : kA[n.li] < 0 ? 'b' : '') + n.oct; };
    let cur = ton;
    const mel: [string, number][] = [];
    const mv = () => { const near = [-2, -1, -1, 1, 1, 2, 0], far = [3, -3, 4, -4]; for (let k = 0; k < 24; k++) {
        const s: number = cur + randItem(k < 12 && Math.random() < .8 ? near : far);
        if (s >= Math.max(lo, ton - 4) && s <= hi)
            return s;
    } return ton; };
    for (let bar = 0; bar < 4; bar++) {
        let pos = 0;
        const end = bar === 3 ? 2 : 4;
        while (pos < end - 1e-6) {
            const c = L.durs.filter((d: number) => (d === 1.5 ? 2 : d === 0.5 ? 1 : d) <= end - pos + 1e-6 && !(d === 1.5 && pos % 1));
            const d: number = c.length ? randItem(c) : end - pos;
            if (d === 1.5) {
                cur = mv();
                mel.push([nm(cur), 1.5]);
                cur = mv();
                mel.push([nm(cur), 0.5]);
                pos += 2;
            }
            else if (d === 0.5) {
                cur = mv();
                mel.push([nm(cur), 0.5]);
                cur = mv();
                mel.push([nm(cur), 0.5]);
                pos += 1;
            }
            else {
                cur = pos === 0 && bar === 0 ? ton : mv();
                mel.push([nm(cur), d]);
                pos += d;
            }
        }
        if (bar === 3)
            mel.push([nm(ton), 2]);
    }
    if (mel.length)
        mel[0][0] = nm(ton);
    const p: RdSightPiece = { id: 'gen', ephemeral: true, gen: L.id, comp: '', level: L.n, keyN, ts: [4, 4], bpm: L.bpm,
        t: { en: tl('en', 'rdx_sr_title', L.n), ro: tl('ro', 'rdx_sr_title', L.n) } };
    if (L.clef === 'bass')
        p.lh = mel;
    else
        p.rh = mel;
    if (L.clef === 'grand') {
        const b = SR_LET.indexOf(RD_MAJ[keyN + 7][0]), deg: number[] = [0, randItem([3, 4]), 4, 0];
        p.lh = deg.map((dg): [string, number] => { let s = 14 + 7 + b + dg; if (s >= 28)
            s -= 7; return [nm(s), 4]; });
    }
    return p;
}
function rdSightStart(mode: string, injectedSeed?: number) {
    const L = RD.L;
    if (!L)
        return;
    if (srtPendingSaveProtected()) {
        if (SR.srtState?.name === 'pendingSave') {
            const pendingEpoch = srtOperationEpoch;
            void srtAbandonClaim('abandoned', false).then((result) => {
                if (result.ok && srtOperationEpoch === pendingEpoch + 1 && SR.srtState?.name === 'abandoned')
                    rdSightStart(mode, injectedSeed);
            });
        }
        return;
    }
    srStopAll(undefined, false, 'navigate');
    rdnForgetLevelPiece();
    rdData().prefs.srLv = L.id;
    if (!isRdSightLevel(L))
        throw new TypeError('Étude: ' + L.id + ' is not a sight-reading level');
    const profile = srtProfileForLevel(L);
    const hand = L.clef === 'bass' ? 'lh' : 'rh';
    let seed = srtSeedForLevel(L.id, injectedSeed);
    let srtPiece = srtGenerate(profile, seed, hand);
    if (injectedSeed === undefined) {
        const ledger = srtReadLedger(localStorage);
        const recent = new Set(srtRecentGeneratedFingerprints());
        let fingerprint = srtFingerprint(srtPiece);
        for (let reroll = 0; reroll < 32 && (ledger.exposures[fingerprint] || recent.has(fingerprint)); reroll++) {
            seed = (seed + 0x9e3779b9) >>> 0;
            srtPiece = srtGenerate(profile, seed, hand);
            fingerprint = srtFingerprint(srtPiece);
        }
    }
    SR.srtPiece = srtPiece;
    SR.srtFingerprint = srtFingerprint(srtPiece);
    srtRememberGeneratedFingerprint(SR.srtFingerprint);
    SR.srtState = { ...SRT_INITIAL_STATE, mode: 'firstSight', fingerprint: SR.srtFingerprint };
    SR.srtPendingAttempt = null;
    SR.srtEvaluation = null;
    SR.srtResultValue = null;
    SR.srtResultLevelId = null;
    srtPreviewUi(false);
    srtPendingUi(false);
    srtNotice(null);
    void srtProgressLedgerUpdate({ type: 'recoverOrphanClaims', generation: srtReadLedger(localStorage).generation });
    SR.gen = srtLegacyPiece(srtPiece, L);
    RD.on = false;
    rdTab('pieces');
    SR.modeSel = mode === 'test' ? 'assess' : 'learn';
    srModeUi();
    srSelectPiece('gen');
    if (mode !== 'test')
        srtConsumeOnLearnReveal();
    const v = byId('rd-verdict');
    v.className = 'verdict neutral';
    v.textContent = t('rdx_sr_ready');
    const g = byId('rd-go');
    if (g)
        g.focus();
}
function rdGenMelody() { const L = RD_LV[rdData().prefs.srLv ?? ''] || RD_LV.sr1; RD.L = L; rdSightStart(SR.modeSel === 'assess' ? 'test' : 'practice'); }
/** A Step by step run: accuracy from the mistakes per step, and up to 2 stars (none after many slips). */
function srLearnGrade(mistakes: number, steps: number): { acc: number; stars: 0 | 1 | 2 } {
    return { acc: Math.max(0, Math.round(100 * (1 - mistakes / steps))), stars: mistakes === 0 ? 2 : mistakes <= Math.max(1, steps * 0.15) ? 1 : 0 };
}
function rdSightDone(kind: string, val: number) {
    const p = SR.piece;
    if (!p || !p.gen)
        return '';
    const L = RD_LV[p.gen];
    if (!L)
        return '';
    const steps = SR.steps.length || 1, grade = srLearnGrade(val, steps), acc = kind === 'assess' ? val : grade.acc;
    const stars = kind === 'assess' ? (val >= 95 ? 3 : val >= 80 ? 2 : val >= 60 ? 1 : 0) : grade.stars;
    const d = rdData(), rec = d.lv[L.id] || (d.lv[L.id] = { s: 0, acc: 0, t: 0, n: 0, rush: 0 });
    rec.n++;
    rec.s = Math.max(rec.s, stars);
    rec.acc = Math.max(rec.acc, acc);
    d.tot.sess++;
    return kind === 'assess' ? '' : ' · ' + '★'.repeat(stars) + '☆'.repeat(3 - stars);
}
/* ---- sessions: intro → questions → summary ---- */
function rdLvName(L: ReadDrillLevel) { return L.custom ? t('rdx_custom') : t('rdx_u_' + L.u) + ' · ' + L.n; }
function rdRangeTxt(L: { set?: readonly string[]; lo?: string; hi?: string; }) { if (L.set)
    return L.set.map((s) => rdName(rdP(s), true)).join(' · '); if (L.lo && L.hi)
    return rdName(rdP(L.lo), true) + '–' + rdName(rdP(L.hi), true); return ''; }
function rdLvDetail(L: ReadDrillLevel) {
    const p = [t('rdx_ty_' + L.ty)];
    if (L.ty === 'rh')
        p.push((L.units ?? []).map((u) => t('rdx_rhu_' + u)).join(', '));
    else if (L.ty === 'ks') {
        p.push(t('rdx_kmax', ...(L.kmax != null ? [L.kmax] : [])));
        if (L.clef === 'grand')
            p.push(t('rdx_clef_grand'));
    }
    else {
        if (L.tag)
            p.push(t('rdx_tag_' + L.tag));
        if (L.clef !== 'mix' && (L.custom || !['tr', 'ba', 'cc'].includes(L.u)))
            p.push(t('rdx_clef_' + L.clef));
        const r = rdRangeTxt(L);
        if (r)
            p.push(r);
    }
    if (L.acc)
        p.push(t('rdx_acc' + L.acc));
    if (L.keys)
        p.push(t('rdx_inkeys', String(L.keys)));
    if (L.harm)
        p.push(t(L.harm === 1 ? 'rdx_harm' : 'rdx_harmmix'));
    if (L.ty === 'iv' && L.ivs && L.ivs.length < 7)
        p.push(rdIvName(L.ivs[0]) + '–' + rdIvName(L.ivs[L.ivs.length - 1]));
    if (L.q)
        p.push(L.q.map((q) => t('rdx_q_' + q)).join(' / '));
    if (L.inv)
        p.push(t('rdx_inv'));
    if (L.ty === 'sr' || L.ty === 'rh')
        p.push(L.bpm + ' BPM');
    return p.join(' · ');
}
function rdLvSub(L: ReadDrillLevel) { return rdLvDetail(L).split(' · ').slice(1).join(' · '); }
function rdStarCount(value: unknown) { return Math.floor(clampPersistedNumber(value, 0, 3, 0)); }
function rdStars(value: number, label?: string) {
    const count = rdStarCount(value);
    return `<span class="rdx-stars" role="img" aria-label="${rdEsc(label ?? t('rdx_stars_n', count))}">${'★'.repeat(count)}<i>${'☆'.repeat(3 - count)}</i></span>`;
}
function rdKeyText(k: string) {
    const clefOf: Record<string, string> = { t: 'treble', b: 'bass', a: 'alto', n: 'tenor' };
    let m = /^([tban]):([A-G])([#b]?)(\d)$/.exec(k);
    if (m)
        return rdName({ li: SR_LET.indexOf(m[2]), acc: m[3] === '#' ? 1 : m[3] === 'b' ? -1 : 0, oct: +m[4] }, true) + ' (' + t('rdx_clef_' + clefOf[m[1]]) + ')';
    if ((m = /^iv:(\d)$/.exec(k)))
        return rdIvName(+m[1]);
    if ((m = /^ch:(\w+)$/.exec(k)))
        return t('rdx_q_' + m[1]);
    if ((m = /^ks:(-?\d)$/.exec(k)))
        return rdKeyLabel(+m[1]);
    if ((m = /^rh:(\w+)$/.exec(k)) && RD_LV[m[1]])
        return rdLvName(RD_LV[m[1]]);
    return k;
}
function rdScroll() { const tb = byId('rd-tabs'); if (!tb)
    return; const hd = (document).querySelector('header'), y = tb.getBoundingClientRect().top + window.scrollY - (hd ? hd.offsetHeight : 0) - 10; if (window.scrollY > y + 4 || tb.getBoundingClientRect().top > window.innerHeight * 0.3)
    window.scrollTo({ top: Math.max(0, y), behavior: 'auto' }); }
function rdOpen(L: ReadDrillLevel) { if (RDN.screen !== 'drills')
    rdTab('drills'); rdAbort(); RD.L = L; if (!L.custom)
    rdData().prefs.last = L.id; byId('rdx-home').hidden = true; byId('rdx-stage').hidden = false; rdIntro(); rdScroll(); const b = byId('rdx-back'); if (b)
    b.focus({ preventScroll: true }); }
function rdIntro() {
    const L = RD.L;
    if (!L)
        return;
    const r: Partial<ReadDrillLevelStat> = L.custom ? {} : (rdData().lv[L.id] || {});
    RD.on = false;
    stageSync();
    byId('rdx-title').textContent = rdLvName(L);
    byId('rdx-sub').textContent = rdLvDetail(L);
    byId('rdx-hud').textContent = '';
    byId('rdx-meter').hidden = true;
    byId('rdx-end').hidden = true;
    const modes = rdModes(L), ic = RD_MODE_ICON;
    const pool = ['name', 'play', 'k2s'].includes(L.ty) ? rdPoolSvg(L) : '';
    const prev = pool ? `<div class="rdx-staff rdx-preview" aria-hidden="true">${pool}</div>` : '';
    const rec = L.custom ? '' : `<div class="rdx-rec">${rdStars(r.s || 0)}${r.acc ? `<span>${t('rdx_best_acc', r.acc)}</span>` : ''}${r.t ? `<span>${t('rdx_best_t', (r.t / 1000).toFixed(1))}</span>` : ''}</div>`;
    const sfx = rdHasCheck(L) ? '' : '_' + L.ty;
    const card = (m: ReadDrillMode, cls: string) => `<button type="button" class="rdx-mode${cls}" data-mode="${m}"><b>${ic[m]} ${t('rdx_m_' + m)}</b><span>${t('rdx_md_' + m + sfx)}</span></button>`;
    // Each Challenge mode shows its record; Marathon is a group with one item per length.
    const best = (m: ReadDrillMode) => { const b = m === 'timeAttack' ? (r.ta ? t('rdx_best_ta', anNum(r.ta, 0)) : '') : m === 'survival' ? (r.sv ? t('rdx_best_sv', anNum(r.sv, 0)) : '') : r.mn ? t('rdx_best_mn', r.mn) : ''; return b ? `<em>🏆 ${rdEsc(b)}</em>` : ''; };
    const item = (m: ReadDrillMode) => m === 'marathon'
        ? `<div class="rdx-chal-grp" role="group" aria-labelledby="rdx-m-marathon"><b id="rdx-m-marathon">${ic[m]} ${t('rdx_m_marathon')}</b><span>${t('rdx_md_marathon')}</span>${best(m)}<div class="rdx-bars"><span aria-hidden="true">${t('rdx_bars')}</span>${[16, 32, 64].map((n) => `<button type="button" class="chip" role="menuitem" tabindex="-1" data-mode="marathon" data-bars="${n}" aria-label="${rdEsc(t('rdx_m_marathon') + ', ' + t('rdx_bars') + ' ' + n)}">${n}</button>`).join('')}</div></div>`
        : `<button type="button" class="rdx-chal-it" role="menuitem" tabindex="-1" data-mode="${m}"><b>${ic[m]} ${t('rdx_m_' + m)}</b><span>${t('rdx_md_' + m)}</span>${best(m)}</button>`;
    const chal = modes.filter((m) => m !== 'practice');
    // Practice first; then the Challenge menu, or the graded run for rhythm and sight-reading levels.
    const more = rdHasCheck(L)
        ? `<button type="button" class="rdx-mode rdx-chal-btn" id="rdx-chal" aria-haspopup="menu" aria-expanded="false" aria-controls="rdx-chal-menu"><b>🏁 ${t('rdx_challenge')} <i aria-hidden="true">▾</i></b><span>${rdEsc(chal.map((m) => t('rdx_m_' + m)).join(' · '))}</span></button><div class="rdx-chal-menu" id="rdx-chal-menu" role="menu" aria-labelledby="rdx-chal" hidden>${chal.map(item).join('')}</div>`
        : card('test', '');
    byId('rdx-body').innerHTML = `<div class="rdx-intro"><p class="rdx-desc">${t('rdx_d_' + L.ty + (rdFlowOk(L) ? '_flow' : ''))}</p>${prev}${rec}<div class="rdx-modes">${card('practice', ' rdx-mode-main')}${more}</div></div>`;
    rdCoach(true);
}
// The notes a naming or playing level draws from, on its staff with their names; '' when the level mixes clefs.
function rdPoolSvg(L: ReadDrillLevel) {
    const clef = L.clef;
    if (clef === 'mix' || clef === undefined || (!L.set && !(L.lo && L.hi)))
        return '';
    const pool = rdPool(L).filter((n) => !n.acc).sort((a, b) => rdStep(a) - rdStep(b));
    return rdSvg({ clef, cols: pool.map((n) => [n]), colW: pool.length > 16 ? 22 : 28, dur: 1, scale: 1.1, lbl: pool.map((n) => rdName(n)) }).svg;
}
// A picture of what a level asks: its notes, its widest interval or chord from the bottom of its range, or its largest key
// signature. '' for rhythm and mixed-clef levels, which show their unit's icon instead.
function rdLvSample(L: ReadDrillLevel) {
    if (L.ty === 'ks')
        return L.clef && L.clef !== 'mix' ? rdSvg({ clef: L.clef, keyN: L.kmax ?? 0, cols: [], minW: 150 }).svg : '';
    if (L.ty === 'iv' || L.ty === 'ch') {
        if (!L.lo || L.clef === undefined || L.clef === 'mix' || L.clef === 'grand')
            return '';
        const clef = rdStaffClef(L.clef), lo = rdStep(rdP(L.lo)), iv = L.ivs ? L.ivs[L.ivs.length - 1] : 5;
        const cols = L.ty === 'iv' ? (L.harm === 1 ? [[rdFromStep(lo), rdFromStep(lo + iv - 1)]] : [[rdFromStep(lo)], [rdFromStep(lo + iv - 1)]]) : [[0, 2, 4].map((j) => rdFromStep(lo + j))];
        return rdSvg({ clef, cols, colW: 72 }).svg;
    }
    return L.ty === 'rh' ? '' : rdPoolSvg(L);
}
function rdChalItems() { return queryAllHtml(document, '#rdx-chal-menu [role=menuitem]'); }
// Opens or closes the Challenge menu; on opening, focus goes to its first or last item.
function rdChalOpen(open: boolean, focus?: 'first' | 'last') {
    const b = maybeById('rdx-chal'), m = maybeById('rdx-chal-menu');
    if (!b || !m)
        return;
    m.hidden = !open;
    b.setAttribute('aria-expanded', String(open));
    const it = rdChalItems();
    if (open && focus && it.length)
        it[focus === 'last' ? it.length - 1 : 0].focus({ preventScroll: true });
    // The menu opens below the button; the page scrolls so the keyboard dock and the bottom bar do not cover it.
    if (open) {
        const tops = [maybeById('dock'), maybeById('bottomNav')].flatMap((el) => { const r = el?.getBoundingClientRect(); return r && r.height > 0 && r.top < innerHeight ? [r.top] : []; });
        const over = m.getBoundingClientRect().bottom + 8 - Math.min(innerHeight, ...tops);
        if (over > 0)
            window.scrollBy(0, over);
    }
}
// Arrow keys move through the Challenge menu, Home and End jump to its ends, Esc closes it and Tab leaves it.
function rdChalKey(e: KeyboardEvent) {
    const tg = eventElement(e), b = maybeById('rdx-chal');
    if (!tg || !b)
        return;
    const open = b.getAttribute('aria-expanded') === 'true';
    if (tg === b) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            rdChalOpen(true, e.key === 'ArrowUp' ? 'last' : 'first');
        }
        else if (e.key === 'Escape' && open) {
            e.preventDefault();
            e.stopPropagation();
            rdChalOpen(false);
        }
        return;
    }
    if (!tg.closest('#rdx-chal-menu'))
        return;
    const it = rdChalItems(), i = tg instanceof HTMLElement ? it.indexOf(tg) : -1;
    let n: HTMLElement | undefined;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight')
        n = it[(i + 1) % it.length];
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft')
        n = it[(i - 1 + it.length) % it.length];
    else if (e.key === 'Home')
        n = it[0];
    else if (e.key === 'End')
        n = it[it.length - 1];
    else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        rdChalOpen(false);
        b.focus();
    }
    else if (e.key === 'Tab')
        rdChalOpen(false);
    if (n) {
        e.preventDefault();
        e.stopPropagation();
        n.focus();
    }
}
function rdStart(mode0: string, bars?: number) {
    const L = RD.L;
    if (!L)
        return;
    // Test and Note rush of older versions open Practice, where the star check now gives the stars.
    const mode = isReadDrillMode(mode0) && rdModes(L).includes(mode0) ? mode0 : mode0 === 'test' || mode0 === 'rush' ? 'practice' : null;
    if (!mode)
        return;
    ensureAudio();
    if (L.ty === 'sr') {
        rdSightStart(mode);
        return;
    }
    if (srtIsMarathonBars(bars))
        RD.bars = bars;
    rdClear();
    const now = performance.now();
    Object.assign(RD, { on: true, mode, n: 0, ok: 0, ms: 0, streak: 0, best: 0, miss: {}, lastK: null, rhP: [], rhM: [], answered: false, next: null, flow: null, fix: false, arc: srtIsArcadeMode(mode) ? srtArcadeStart(mode, now, { targetMs: rdTarget(L), marathonBars: RD.bars }) : null, tout: false, arcFx: '', limF: 1, chk: [], chkBest: null, chkNew: 0 });
    stageSync();
    rdCoach(true);
    const e = byId('rdx-end');
    e.hidden = false;
    e.textContent = t(mode === 'practice' ? 'rdx_end' : 'rdx_quit');
    if (RD.arc && RD.arc.deadlineMs !== null)
        RD.rushEnd = RD.arc.deadlineMs;
    if (mode === 'timeAttack' || mode === 'survival')
        RD.rushIv = window.setInterval(() => { if (!RD.on)
            return; rdHud(); if (rdTimeUp() && (!RD.answered || RD.fix))
            rdFinish(); }, 250);
    if (L.ty === 'rh')
        rdRhNew();
    else if (rdFlowOk(L))
        rdFlowStart();
    else
        rdNext();
}
function rdClear() {
    RD.timers.forEach(clearTimeout);
    RD.timers = [];
    clearTimeout(RD.hintT);
    clearTimeout(RD.limT);
    clearTimeout(RD.awT);
    const aw = maybeById('rdx-award');
    if (aw)
        aw.hidden = true;
    clearInterval(RD.rushIv);
    RD.rushIv = 0;
    if (RD.flow)
        cancelAnimationFrame(RD.flow.raf);
    RD.flow = null;
    RD.fix = false;
    if (RD.rh) {
        RD.rh.playing = false;
        cancelAnimationFrame(RD.rh.raf);
        if (RD.rh.open)
            RD.rh.open.clear();
        if (RD.rh.two)
            rdRhMarks(false);
    }
    (RD.nodes || []).forEach((n: { stop: (arg0: number) => void; }) => { try {
        n.stop(0);
    }
    catch (_) { } });
    RD.nodes = [];
    rdDockClear();
    rdDockForce(false);
}
function rdAbort() { rdClear(); RD.on = false; stageSync(); }
function rdEndClick() { if (WARM.on && WARM.phase === 'drill') {
    rdnHome(true);
    return;
}
if (RD.on && RD.mode === 'practice' && RD.n > 0)
    rdFinish();
else {
    rdAbort();
    rdIntro();
} }
function rdBack() { rdAbort(); byId('rdx-stage').hidden = true; byId('rdx-home').hidden = false; rdRenderHome(); }
/* ---- full-screen stage: a running drill or piece takes the whole window; Esc (or End) leaves it ---- */
function srStartStage() {
    // Level exercises keep the expanded player through their result and the next piece.
    // Automatic expansion uses the full window without a native fullscreen request.
    if (SR.lvPiece && SCORE_FOCUS.readOverride === null && rdData().prefs.stage)
        scoreFocusEnter('read', byId('rd-fs'), false);
    else
        stageSync();
}
function stageWanted() {
    if (view0() === 'read' && !byId('rdp-pieces').hidden && SCORE_FOCUS.readOverride !== null)
        return SCORE_FOCUS.readOverride && !byId('rdp-pieces').hidden && !!SR.piece;
    if (view0() !== 'read' || !rdData().prefs.stage)
        return false;
    return (RD.on && !byId('rdp-drills').hidden && !byId('rdx-stage').hidden) || (SR.active && !byId('rdp-pieces').hidden);
}
function stageSync() {
    if (SCORE_FOCUS.owner === 'read' && (view0() !== 'read' || byId('rdp-pieces').hidden)) { scoreFocusExit(true); return; }
    scoreFocusUi();
    syncMobileStartBars();
    const end = byId('rd-stage-end');
    end.hidden = SCORE_FOCUS.owner === 'read' && !SR.active;
    if (SCORE_FOCUS.owner === 'read')
        end.removeAttribute('aria-keyshortcuts');
    else
        end.setAttribute('aria-keyshortcuts', 'Escape');
    const on = stageWanted();
    if (on === STAGE.on)
        return;
    STAGE.on = on;
    STAGE.kb = null;
    if (on) {
        document.body.dataset.stage = 'immersive';
        if (!byId('rdp-pieces').hidden)
            srMeta();
    }
    else if (document.body.dataset.stage === 'immersive')
        delete document.body.dataset.stage;
    const stageTop = maybeById('rd-stage-top');
    if (stageTop)
        stageTop.hidden = !on || byId('rdp-pieces').hidden;
    if (on)
        window.scrollTo(0, 0);
    dockSync();
    anLayoutVars();
    stageRefit();
}
// The staff is sized from the room the stage leaves it, so it is redrawn whenever that changes.
function stageRefit() {
    if (RD.on && RD.flow)
        rdFlowShow(false);
    srFit();
    rdRhFit();
}
function stageResize() { clearTimeout(STAGE.rz); STAGE.rz = window.setTimeout(() => { if (STAGE.on)
    stageRefit(); }, 120); }
// Esc leaves the stage like End or Stop; focus goes to a control that stays on screen.
function stageKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && SCORE_FOCUS.owner && SCORE_FOCUS.owner !== 'analysis') {
        e.preventDefault();
        const tools = maybeById('rd-focus-tools');
        if (SCORE_FOCUS.owner === 'read' && tools && !tools.hidden) {
            rdFocusDispSet(false, true);
            return true;
        }
        if (SCORE_FOCUS.owner === 'read' && SR.active) {
            srGo();
            SCORE_FOCUS.returnTo = byId('rd-go');
        }
        scoreFocusExit();
        return true;
    }
    if (e.key !== 'Escape' || !STAGE.on)
        return false;
    e.preventDefault();
    if (RD.on) {
        rdEndClick();
        // The warm-up hides the drill's own Back: its header's Back takes the focus instead.
        if (RDN.screen === 'home') return true; // warm-up exit already restored focus
        const back = byId('rdx-back');
        if (!byId('rdx-stage').contains(document.activeElement) || document.activeElement?.closest('[hidden]'))
            back.focus({ preventScroll: true });
    }
    else if (SR.active) {
        srGo();
        byId('rd-go').focus({ preventScroll: true });
    }
    return true;
}
function rdFinish() {
    const L = RD.L, mode = RD.mode, now = performance.now();
    rdClear();
    RD.on = false;
    stageSync();
    byId('rdx-end').hidden = true;
    byId('rdx-meter').hidden = true;
    let acc = 0, avg = 0, stars = 0;
    if (!L)
        return;
    // Practice shows the best stars its check gave this run, once it was full.
    const chk = mode === 'practice' && rdHasCheck(L), shown = mode === 'test' || (chk && RD.chkBest !== null);
    const arc = RD.arc && (RD.arc = srtArcadeComplete(RD.arc, now)), sum = arc && srtArcadeSummary(arc, now);
    const npm = sum ? Math.round(sum.notesPerMinute ?? 0) : 0;
    if (L.ty === 'rh') {
        acc = RD.rhP.length ? Math.round(RD.rhP.reduce((a: number, b: number) => a + b, 0) / RD.rhP.length) : 0;
        if (mode === 'test')
            stars = acc >= 90 ? 3 : acc >= 75 ? 2 : acc >= 60 ? 1 : 0;
    }
    else {
        acc = RD.n ? Math.round(100 * RD.ok / RD.n) : 0;
        // Arcade runs time only the right answers: a timeout is not a reading speed.
        avg = sum ? sum.averageReactionMs ?? 0 : RD.n ? RD.ms / RD.n : 0;
        if (chk)
            stars = RD.chkBest ?? 0;
    }
    const d = rdData();
    if (!WARM.on) d.tot.sess++;
    let newBest = false;
    if (!L.custom) {
        const rec = d.lv[L.id] || (d.lv[L.id] = { s: 0, acc: 0, t: 0, n: 0, rush: 0 });
        rec.n++;
        if (mode === 'test') {
            rec.s = Math.max(rec.s || 0, stars);
            rec.acc = Math.max(rec.acc || 0, acc);
            if (avg && acc >= 80 && (!rec.t || avg < rec.t))
                rec.t = Math.round(avg);
        }
        if (sum) {
            const k = sum.mode === 'survival' ? 'sv' : sum.mode === 'timeAttack' ? 'ta' : 'mn', v = k === 'mn' ? npm : sum.score;
            newBest = v > (rec[k] || 0);
            rec[k] = Math.max(rec[k] || 0, v);
        }
    }
    if (!WARM.on) {
        touchDay();
        markReadDoneToday();
    }
    saveAll();
    // Warm-up drills retain their results. The warm-up is counted when all steps are complete.
    if (rdnWarmDrillDone())
        return;
    const weak = Object.entries(RD.miss).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const pts = sum ? anNum(sum.score, 0) : '', avgS = (avg / 1000).toFixed(1) + 's';
    const tiles = L.ty === 'rh' ? [[acc + '%', t('rdx_st_rh')], [RD.rhP.length, t('rdx_st_ex')]]
        : sum && sum.mode === 'survival' ? [[pts, t('rdx_st_score')], [rdClock(sum.elapsedMs), t('rdx_st_survived')], [sum.correct, t('rdx_st_rush')], [avgS, t('rdx_st_time')]]
            : sum && sum.mode === 'timeAttack' ? [[pts, t('rdx_st_score')], [sum.correct, t('rdx_st_rush')], [acc + '%', t('rdx_st_acc')], [sum.bestCombo, t('rdx_st_streak')]]
                : sum ? [[rdClock(sum.elapsedMs), t('rdx_st_total')], [acc + '%', t('rdx_st_acc')], [npm, t('rdx_st_npm')], [pts, t('rdx_st_score')]]
                    : [[acc + '%', t('rdx_st_acc')], [avgS, t('rdx_st_time')], [RD.best, t('rdx_st_streak')], [RD.ok + '/' + RD.n, t('rdx_st_ans')]];
    const best = newBest ? ' · 🏆 ' + t('rdx_newbest') : '';
    const head = shown ? `<div class="rdx-sum-stars">${rdStars(stars)}</div><p class="rdx-sum-msg">${t(stars === 3 ? 'rdx_s3' : stars === 2 ? 'rdx_s2' : stars === 1 ? 'rdx_s1' : 'rdx_s0')}</p>`
        : chk ? `<p class="rdx-sum-msg">${t('rdx_chk_wait', RD.chk.length, RD_CHECK_N)}</p>`
            : sum ? `<p class="rdx-sum-msg">${RD_MODE_ICON[mode]} ${sum.mode === 'marathon' ? t('rdx_npm', npm) : t('rdx_arc_score', pts)}${best}</p>` : `<p class="rdx-sum-msg">${t('rdx_sum_practice')}</p>`;
    const nx = rdLvNext(L);
    RD.next = rdNextStep(L, mode, acc, avg, stars, weak);
    rdCoach(false);
    byId('rdx-body').innerHTML = `<div class="rdx-sum" tabindex="-1" id="rdx-sum"${(RD).next ? ' aria-describedby="rdx-next"' : ''}><h2>${t('rdx_sum_title')}</h2>${head}
    <div class="rdx-tiles">${tiles.map((x) => `<div><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div>
    ${weak.length ? `<div class="rdx-weak"><span>${t('rdx_review')}</span>${weak.map(([k, c]) => `<i class="rdx-tag">${rdEsc(rdKeyText(k))}${c > 1 ? ' ×' + c : ''}</i>`).join('')}</div>` : ''}
    ${(RD).next ? `<div class="coach rdx-coach" id="rdx-next" data-kind="next">${coachHTML(t('coach_next'), (RD).next, 'rdx-next-act')}</div>` : ''}
    <div class="row rdx-sum-btns"><button class="btn primary" data-act="again">↺ ${t('rdx_again')}</button>${!L.custom && nx ? `<button class="btn" data-act="next">${t('rdx_next_lv')} →</button>` : ''}<button class="btn ghost" data-act="levels">${t('rdx_levels')}</button></div></div>`;
    byId('rdx-live').textContent = t('rdx_sum_title') + ': ' + acc + '%' + (shown ? ' · ' + t('rdx_stars_n', stars) : '') + (sum ? ' · ' + (sum.mode === 'marathon' ? t('rdx_npm', npm) : t('rdx_arc_score', pts)) : '') + ((RD).next ? '. ' + t('coach_next') + ' ' + coachText((RD).next) : '');
    byId('rdx-hud').textContent = '';
    byId('rdx-meter').hidden = true;
    const s = maybeById('rdx-sum');
    if (s)
        s.focus({ preventScroll: true });
}
/* ---- home: progress hero, level ladder, custom drill ---- */
function rdSuggest() {
    const d = rdData(), last = RD_LV[d.prefs.last ?? ''];
    if (last && ((d.lv[last.id] || {}).s || 0) < 2)
        return last;
    return RD_ALL.find((L) => !((d.lv[L.id] || {}).s)) || last || RD_ALL[0];
}
const RD_UNIT_CAT: Record<string, string> = {
    tr: 'notes', ba: 'notes', gr: 'notes', cc: 'notes',
    ac: 'keys', ks: 'keys',
    iv: 'harmony', ch: 'harmony',
    rh: 'rhythm', sr: 'rhythm',
};
let rdxFilter = 'all';
let rdxShowOrch = false;
function rdRenderHome() {
    const d = rdData(), tot = d.tot, st = RD_ALL.reduce((sum, level) => sum + rdStarCount(d.lv[level.id]?.s), 0), cont = rdSuggest();
    const unit = RD_UNITS.find((u) => u.lv.includes(cont)), rec: Partial<ReadDrillLevelStat> = d.lv[cont.id] || {}, sample = rdLvSample(cont);
    const best = [rec.acc ? t('rdx_best_acc', rec.acc) : '', rec.t ? t('rdx_best_t', (rec.t / 1000).toFixed(1)) : ''].filter(Boolean).map((s) => `<span>${rdEsc(s)}</span>`).join('');
    const opt = (id: string, on: boolean, key: string, off = false) => `<label class="switch-inline"><input type="checkbox" id="${id}"${on ? ' checked' : ''}${off ? ' disabled' : ''}> <span>${t(key)}</span></label>`;
    // Stats, then the level to play next (a picture of it, its name, details and stars, and the button), then the options.
    byId('rdx-hero').innerHTML = `<div class="rdx-hero-l"><div><div class="rdx-big">★ ${st}<small> / ${RD_ALL.length * 3}</small></div><div class="rdx-hero-s">${t('rdx_hero_stars')}</div></div>
    <div class="rdx-hero-m"><div><b>${tot.n}</b><span>${t('rdx_st_ans')}</span></div><div><b>${tot.n ? Math.round(100 * tot.ok / tot.n) + '%' : '—'}</b><span>${t('rdx_st_acc')}</span></div><div><b>${tot.n ? (tot.ms / tot.n / 1000).toFixed(1) + 's' : '—'}</b><span>${t('rdx_st_time')}</span></div></div></div>
    <div class="rdx-next"><div class="rdx-next-pic" aria-hidden="true">${sample || `<span class="rdx-next-ic">${unit ? unit.icon : '🎯'}</span>`}</div>
      <div class="rdx-next-txt"><span class="rdx-next-eye">${t(d.prefs.last ? 'rdx_hero_next' : 'rdx_hero_first')}</span><b class="rdx-next-name" id="rdx-next-name">${rdEsc(rdLvName(cont))}</b><span class="rdx-next-d" id="rdx-next-d">${rdEsc(rdLvDetail(cont))}</span></div>
      <div class="rdx-next-go"><div class="rdx-rec">${rdStars(rec.s || 0)}${best}</div>
      <button class="btn primary" data-lv="${cont.id}" id="rdx-cont" aria-describedby="rdx-next-name rdx-next-d">▶ ${t(d.prefs.last ? 'rdx_continue' : 'rdx_begin')}</button></div></div>
    <div class="rdx-hero-r" role="group" aria-label="${rdEsc(t('rdx_hero_opts'))}">${opt('rdx-snd', !!d.prefs.sound, 'rdx_sound')}${opt('rdx-hints', !!d.prefs.hints, 'rdx_hints')}${opt('rdx-flow', !!d.prefs.flow, 'rdx_flow')}${opt('rdx-ghost', !!d.prefs.ghost, 'rdx_ghost', !d.prefs.flow)}${opt('rdx-stage-pref', !!d.prefs.stage, 'rdx_stage')}${opt('rdx-weak-inject', !!data.settings.weakSpotInjection, 'rdx_weak_inject')}</div>`;
    const filters = maybeById('rdx-filters');
    if (filters) {
        queryAllHtml(filters, '[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === rdxFilter)));
    }
    const orchInput = maybeById('rdx-show-orch');
    if (orchInput instanceof HTMLInputElement)
        orchInput.checked = rdxShowOrch;
    const landBtn = maybeById('rdx-land-btn');
    if (landBtn)
        landBtn.hidden = rdStarCount(d.lv['tr1']?.s) >= 2 && st >= 6;
    const visibleUnits = RD_UNITS.filter((u) => (u.u !== 'cc' || rdxShowOrch) && (rdxFilter === 'all' || RD_UNIT_CAT[u.u] === rdxFilter));
    byId('rdx-ladder').innerHTML = visibleUnits.map((u) => {
        const done = u.lv.filter((L: ReadDrillLevel) => rdStarCount(d.lv[L.id]?.s) > 0).length;
        return `<section class="rdx-unit"${u.lv.length >= 6 ? ' data-many="1"' : ''}><h3><span class="ic" aria-hidden="true">${u.icon}</span><span>${t('rdx_u_' + u.u)}</span><small>${done}/${u.lv.length}</small></h3><p>${t('rdx_ud_' + u.u)}</p><div class="rdx-lvs">${u.lv.map((L: ReadDrillLevel) => {
            const s = rdStarCount(d.lv[L.id]?.s);
            return `<button class="rdx-lv${s ? ' s' + s : ''}" data-lv="${L.id}" title="${rdEsc(rdLvDetail(L))}" aria-label="${rdEsc(rdLvName(L) + ': ' + rdLvDetail(L) + (s ? ' — ' + t('rdx_stars_n', s) : ''))}"><span class="n">${L.n}</span><span class="d"><b>${t('rdx_ty_' + L.ty)}</b><i>${rdEsc(rdLvSub(L))}</i></span><span class="st" aria-hidden="true">${'★'.repeat(s)}<i>${'☆'.repeat(3 - s)}</i></span></button>`;
        }).join('')}</div></section>`;
    }).join('');
    rdCustomFill();
}
const RD_CDEF: Record<string, [string, string]> = { treble: ['C4', 'G5'], bass: ['F2', 'C4'], grand: ['C3', 'C5'], alto: ['D3', 'B4'], tenor: ['A2', 'G4'] };
function rdCustomFill() {
    const lo = selectById('rdx-c-lo'), hi = selectById('rdx-c-hi');
    if (!lo)
        return;
    const c = rdData().prefs.custom || { ty: 'name', clef: 'treble', lo: 'C4', hi: 'G5', acc: 0, keys: 0, land: false };
    let opts = '';
    for (let s = 7; s <= 52; s++) {
        const n = rdFromStep(s);
        opts += `<option value="${SR_LET[n.li] + n.oct}">${rdName(n, true)}</option>`;
    }
    lo.innerHTML = opts;
    hi.innerHTML = opts;
    lo.value = c.lo;
    hi.value = c.hi;
    selectById('rdx-c-ty').value = c.ty;
    selectById('rdx-c-clef').value = c.clef;
    selectById('rdx-c-acc').value = String(c.acc);
    selectById('rdx-c-keys').value = String(c.keys);
    inputById('rdx-c-land').checked = !!c.land;
}
function rdCustomRead() {
    let lo = selectById('rdx-c-lo').value, hi = selectById('rdx-c-hi').value;
    if (rdStep(rdP(lo)) > rdStep(rdP(hi))) {
        const x = lo;
        lo = hi;
        hi = x;
    }
    const c = { ty: selectById('rdx-c-ty').value, clef: selectById('rdx-c-clef').value, lo, hi, acc: +selectById('rdx-c-acc').value, keys: +selectById('rdx-c-keys').value, land: inputById('rdx-c-land').checked };
    rdData().prefs.custom = c;
    return c;
}
function rdCustomGo() {
    const c = rdCustomRead();
    saveAll();
    rdOpen(rdCustomLevel(c));
}
/** The level a custom drill configuration describes (the form's, or the warm-up's). `keyN` fixes the key signature. */
function rdCustomLevel(c: ReadDrillCustom, keyN?: number): ReadDrillLevel {
    const ty = c.ty, clef = c.clef;
    if (!isReadDrillType(ty) || !isReadClef(clef))
        throw new TypeError('Étude: unknown custom drill ' + ty + ' / ' + clef);
    const L: ReadDrillLevel = { custom: true, id: 'custom', u: 'custom', n: 0, ty, clef, lo: c.lo, hi: c.hi, acc: c.keys ? 0 : c.acc, keys: c.keys || 0 };
    if (c.land) {
        const a = rdStep(rdP(c.lo)), b = rdStep(rdP(c.hi)), set = RD_LM.filter((s) => s >= a && s <= b).map((s) => { const n = rdFromStep(s); return SR_LET[n.li] + n.oct; });
        if (set.length >= 2)
            L.set = set;
    }
    if (keyN !== undefined)
        L.keyN = keyN;
    return L;
}
/* ---- statistics, shown in Progress under Reading: per-note heatmap on the staff, skills, weakest items ---- */
function rdAgg(c: string, li: number, oct: number) {
    let n = 0, ok = 0, ms = 0;
    const re = /^([tban]):([A-G])([#b]?)(\d)$/;
    for (const [k, s] of Object.entries((rdData().nt))) {
        const m = re.exec(k);
        if (m && m[1] === c && SR_LET.indexOf(m[2]) === li && +m[4] === oct) {
            const stats = s;
            n += stats.n;
            ok += stats.ok;
            ms += stats.ms;
        }
    }
    return { n, ok, ms };
}
function rdHeat(clef: 'treble' | 'bass' | 'alto' | 'tenor', lo: string, hi: string) {
    const c = RD_CLEFC[clef], cols: (ReturnType<typeof rdFromStep> & { hc: string | null; tip: string; })[][] = [], lbl: (string | number)[] = [], cls: string[] = [];
    for (let s = rdStep(rdP(lo)); s <= rdStep(rdP(hi)); s++) {
        const n = rdFromStep(s), a = rdAgg(c, n.li, n.oct), acc = a.n ? Math.round(100 * a.ok / a.n) : null;
        cols.push([Object.assign(n, { hc: acc == null ? null : `hsl(${Math.round(acc * 1.2)},58%,44%)`, tip: rdName(n, true) + (a.n ? `: ${acc}% · ${(a.ms / a.n / 1000).toFixed(1)} s · ${a.n}×` : ': —') })]);
        lbl.push(acc == null ? '·' : acc);
        cls.push(acc == null ? 'none' : acc >= 90 ? 'hi' : acc >= 70 ? 'mid' : 'lo');
    }
    return rdSvg({ clef, cols, colW: 24, dur: 1, scale: 1.2, lbl, lblCls: cls, aria: t('rdx_heat_aria', t('rdx_clef_' + clef)) }).svg;
}
function rdBars(rows: readonly { l: string; n: number; ok: number; }[]) { return rows.map((r) => `<div class="rdx-bar"><span>${rdEsc(r.l)}</span><div class="rdx-bar-t"><i style="width:${r.n ? Math.round(100 * r.ok / r.n) : 0}%"></i></div><em>${r.n ? Math.round(100 * r.ok / r.n) + '% · ' + rdEsc(r.n) + '×' : '—'}</em></div>`).join(''); }
function rdRenderStats() {
    const box = maybeById('rdx-stats');
    if (!box)
        return;
    const book = rdnBook(), tally = srtBookTally(book, book.level);
    const d = rdData(), tot = d.tot, nt = d.nt, g = (k: string) => nt[k] || { n: 0, ok: 0 };
    const lvDone = RD_ALL.filter(L => rdStarCount(d.lv[L.id]?.s) > 0).length, st = RD_ALL.reduce((sum, level) => sum + rdStarCount(d.lv[level.id]?.s), 0);
    const weak = Object.entries(nt).filter(([k, s]) => s.n >= 3 && !/^rh:/.test(k)).sort((a, b) => (b[1].e - a[1].e) || (b[1].t - a[1].t)).slice(0, 10);
    const ks: { l: string; n: number; ok: number; }[] = [];
    for (let k = -7; k <= 7; k++)
        if (g('ks:' + k).n)
            ks.push({ l: rdKeyLabel(k), ...g('ks:' + k) });
    const rh = (RD_UNITS.find((u) => u.u === 'rh')?.lv ?? []).filter((L: ReadDrillLevel) => g('rh:' + L.id).n).map((L: ReadDrillLevel) => ({ l: rdLvName(L), ...g('rh:' + L.id) }));
    const extra = (['alto', 'tenor'] as const).filter((c) => Object.keys(nt).some((k) => k[0] === RD_CLEFC[c]));
    box.innerHTML = `<div class="panel rdx-stat-p" id="rdx-book-progress"><h3>${rdEsc(t('rdn_book_head', book.level))}</h3>
      <p class="rdx-desc">${rdEsc(t('rdn_done_of', tally.done, SRT_BOOK_PIECES))}</p>
      <div class="stat-row">${statHTML(srtPiecesRead(book), t('rdn_stat_read'))}</div></div>
    <div class="rdx-tiles rdx-tiles-lg">${[[tot.n, t('rdx_st_ans')], [tot.n ? Math.round(100 * tot.ok / tot.n) + '%' : '—', t('rdx_st_acc')], [tot.n ? (tot.ms / tot.n / 1000).toFixed(1) + 's' : '—', t('rdx_st_time')], [tot.sess, t('rdx_st_sess')], ['★ ' + st, t('rdx_hero_stars')], [lvDone + '/' + RD_ALL.length, t('rdx_st_lv')]].map((x) => `<div><b>${rdEsc(x[0])}</b><span>${rdEsc(x[1])}</span></div>`).join('')}</div>
    <div class="panel rdx-stat-p"><h3>${t('rdx_heat')}</h3><p class="rdx-desc">${t('rdx_heat_d')}</p>
      <div class="rdx-staff rdx-heat">${rdHeat('treble', 'A3', 'C6')}</div><div class="rdx-staff rdx-heat">${rdHeat('bass', 'C2', 'E4')}</div>
      ${extra.map((c) => `<div class="rdx-staff rdx-heat">${rdHeat(c, c === 'alto' ? 'C3' : 'A2', c === 'alto' ? 'D5' : 'B4')}</div>`).join('')}</div>
    <div class="rdx-stat-grid"><div class="panel rdx-stat-p"><h3>${t('rdx_u_iv')}</h3>${rdBars(RD_ALLIV.map((v) => ({ l: rdIvName(v), ...g('iv:' + v) })))}</div>
      <div class="panel rdx-stat-p"><h3>${t('rdx_u_ch')}</h3>${rdBars(['maj', 'min', 'dim', 'aug'].map((q) => ({ l: t('rdx_q_' + q), ...g('ch:' + q) })))}</div>
      <div class="panel rdx-stat-p"><h3>${t('rdx_u_ks')}</h3>${ks.length ? rdBars(ks) : `<p class="rdx-desc">${t('rdx_nodata')}</p>`}</div>
      <div class="panel rdx-stat-p"><h3>${t('rdx_u_rh')}</h3>${rh.length ? rdBars(rh) : `<p class="rdx-desc">${t('rdx_nodata')}</p>`}</div></div>
    <div class="panel rdx-stat-p"><h3>${t('rdx_weakest')}</h3>${weak.length ? `<div class="rdx-weak">${weak.map(([k, s]) => `<i class="rdx-tag">${rdEsc(rdKeyText(k))} · ${Math.round(100 * s.ok / s.n)}% · ${((s.t || 0) / 1000).toFixed(1)}s</i>`).join('')}</div>` : `<p class="rdx-desc">${t('rdx_nodata')}</p>`}
      <div class="row" style="margin-top:14px"><button class="btn ghost sm" id="rdx-reset">${t('rdx_reset')}</button></div></div>`;
}
/* ---- tabs, wiring, locale ---- */
// `screen` picks between the old sight-reading screen (melody) and the player of a level piece; both use the pieces panel.
function rdTab(tab: string|undefined, screen: 'melody' | 'player' = 'melody') {
    if (tab === 'book') {
        rdnHome(false);
        return;
    }
    // A saved tab that no longer exists (the old Statistics tab, now in Progress) opens the drills.
    if (tab === undefined || !['drills', 'pieces'].includes(tab))
        tab = 'drills';
    const leavesPlayer = !!SR.lvPiece && (tab !== 'pieces' || screen !== 'player');
    if ((tab !== 'pieces' || leavesPlayer) && srtPendingSaveProtected()) {
        if (SR.srtState?.name === 'pendingSave') {
            void srtAbandonClaim('abandoned', false).then((result) => {
                if (result.ok || SR.srtState?.name !== 'pendingSave')
                    rdTab(tab, screen);
            });
        }
        return;
    }
    rdnShowScreen(tab === 'pieces' ? screen : 'drills');
    rdData().prefs.tab = tab;
    ['drills', 'pieces'].forEach((x) => { const p = maybeById('rdp-' + x); if (p)
        p.hidden = x !== tab; });
    if (tab !== 'drills' && RD.on) {
        rdAbort();
        rdIntro();
    }
    if (tab !== 'pieces')
        srStopAll(true, false, 'navigate');
    if (tab === 'drills' && byId('rdx-stage').hidden)
        rdRenderHome();
    stageSync();
    syncMobileStartBars();
}
// Draws the Read tab's current screen. The home is the first screen each time the tab opens (see renderRead).
function rdRender() {
    if (RDN.screen === 'warmup' && WARM.on) {
        rdnWarmLocale();
        return;
    }
    if (RDN.screen === 'home' || RDN.screen === 'warmup') {
        rdnHome();
        return;
    }
    if (RDN.screen === 'player' && SR.lvPiece) {
        rdTab('pieces', 'player');
        rdnPlayerHead();
        return;
    }
    rdTab(RDN.screen === 'melody' || RDN.screen === 'player' ? 'pieces' : 'drills');
}
function rdKey(e: KeyboardEvent, k: string) {
    if (view0() !== 'read' || byId('rdp-drills').hidden || !RD.on)
        return false;
    const L = RD.L;
    if (!L)
        return false;
    if (L.ty === 'rh') {
        const R = RD.rh;
        if (e.key === ' ' || e.key === 'Enter') {
            if (document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-act],#rdx-rhgo,#rdx-rhlisten,#rdx-end,#rdx-back,#rdx-rhopts') && !(R && R.playing))
                return false;
            e.preventDefault();
            rdRhPress('k:' + k, 'R');
            return true;
        }
        if (R && R.two && R.playing && (k === 'f' || k === 'j')) {
            e.preventDefault();
            rdRhPress('k:' + k, k === 'f' ? 'L' : 'R');
            return true;
        }
        return false;
    }
    if (RD.answered && !RD.fix)
        return false;
    if (/^[1-9]$/.test(k)) {
        const b = (document).querySelector('#rdx-ans .rdx-a[data-k="' + k + '"]');
        if (b instanceof HTMLButtonElement && !b.disabled) {
            e.preventDefault();
            b.click();
            return true;
        }
    }
    if (k === '-' || k === '0' || k === '=') {
        const accOf: Record<string, number> = { '-': -1, '0': 0, '=': 1 };
        const b = queryHtml(document, '#rdx-accs [data-acc="' + accOf[k] + '"]');
        if (b) {
            e.preventDefault();
            b.click();
            return true;
        }
    }
    return false;
}
function rdOnLocale() {
    if (!byId('view-read'))
        return;
    if (SR.active) {
        const g = byId('rd-go');
        if (g)
            g.textContent = t('rd_stop');
    }
    if (SR.listening) {
        const l = byId('rd-listen');
        if (l)
            l.textContent = t('rd_stop');
    }
    if (SR.gen && SR.lvPiece) {
        SR.gen.t = { en: rdnHeadText().title };
        rdnPlayerHead();
        rdnChecklist();
        // The status line before an attempt follows the language.
        const v = byId('rd-verdict');
        if (RDN.ready && v.textContent === RDN.ready)
            v.textContent = RDN.ready = rdnReadyText();
        if (!byId('rdn-result').hidden)
            rdnResultShow(false);
        srMeta();
    }
    else if (SR.gen) {
        SR.gen.t = { en: tl('en', 'rdx_sr_title', SR.gen.level), ro: tl('ro', 'rdx_sr_title', SR.gen.level) };
        srMeta();
    }
    rdWarmButtonsSync();
    if (!byId('rdx-stage').hidden && RD.L) {
        byId('rdx-title').textContent = rdLvName(RD.L);
        byId('rdx-sub').textContent = rdLvDetail(RD.L);
        if (!RD.on && !byId('rdx-body').querySelector('.rdx-sum'))
            rdIntro();
        else if (RD.on && RD.flow) {
            rdFlowBody();
            rdFlowShow(false);
        }
        else if (RD.on && RD.q && RD.q.ty === 'name')
            queryAllHtml(byId('rdx-ans'), '.rdx-a').forEach((b) => { if (b.firstChild)
                b.firstChild.textContent = rdLetter(Number(b.dataset.a)); });
        if (RD.on) {
            byId('rdx-end').textContent = t(RD.mode === 'practice' ? 'rdx_end' : 'rdx_quit');
            rdHud();
        }
    }
    if (view0() === 'read')
        rdRender();
    else
        rdCustomFill();
}
(function rdInit() {
    const dr = byId('rdp-drills');
    if (!dr)
        return;
    byId('rd-tabs').addEventListener('click', (e) => { const b = eventClosest(e, '[data-tab]'); if (b) {
        rdTab(b.dataset.tab);
        saveAll();
    } });
    byId('rd-tabs').addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End')
            return;
        const tabs = queryAllHtml(byId('rd-tabs'), '[role=tab]'), fe = document.activeElement, i = fe instanceof HTMLElement ? tabs.indexOf(fe) : -1;
        if (i < 0)
            return;
        e.preventDefault();
        const n = e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        n.focus();
        rdTab(n.dataset.tab);
    });
    dr.addEventListener('click', (e) => {
        const cat = eventClosest(e, '#rdx-filters [data-cat]');
        if (cat) {
            rdxFilter = cat.dataset.cat ?? 'all';
            rdRenderHome();
            return;
        }
        const lv = eventClosest(e, '[data-lv]');
        if (lv) {
            const L = RD_LV[lv.dataset.lv ?? ''];
            if (!L)
                return;
            rdOpen(L);
            return;
        }
        if (eventClosest(e, '#rdx-chal')) {
            const open = byId('rdx-chal').getAttribute('aria-expanded') !== 'true';
            rdChalOpen(open, open ? 'first' : undefined);
            return;
        }
        const md = eventClosest(e, '[data-mode]');
        if (md) {
            rdStart(md.dataset.mode ?? '', Number(md.dataset.bars) || undefined);
            return;
        }
        const a = eventClosest(e, '.rdx-a');
        if (a) {
            rdClickAns(a);
            return;
        }
        const ac = eventClosest(e, '[data-acc]');
        if (ac) {
            RD.accSel = Number(ac.dataset.acc);
            ac.parentNode?.querySelectorAll('[data-acc]').forEach((x) => x.setAttribute('aria-pressed', x === ac ? 'true' : 'false'));
            return;
        }
        if (eventClosest(e, '#rdx-next-act')) {
            if (RD.next && RD.next.act)
                RD.next.act.run();
            return;
        }
        const act = eventClosest(e, '[data-act]');
        if (act) {
            const k = act.dataset.act;
            if (k === 'again')
                rdStart(RD.mode);
            else if (k === 'next') {
                const nx = RD.L && rdLvNext(RD.L);
                if (nx)
                    rdOpen(nx);
            }
            else if (k === 'levels')
                rdBack();
            else if (k === 'rhnew')
                rdRhNew();
            else if (k === 'rhagain')
                rdRhNew(true);
            return;
        }
        const hb = eventClosest(e, '[data-hands]');
        if (hb) {
            if ((hb instanceof HTMLButtonElement && hb.disabled) || (RD.rh && RD.rh.playing))
                return;
            rdData().prefs.rhHands = Number(hb.dataset.hands) === 2 ? 2 : 1;
            saveAll();
            rdRhNew(true);
            return;
        }
        const b = eventClosest(e, 'button'), id = b && b.id;
        if (id === 'rdx-back')
            rdBack();
        else if (id === 'rdx-end')
            rdEndClick();
        else if (id === 'rdx-hear' && RD.q)
            rdSound(RD.q.midis, RD.q.ty === 'iv' && !RD.q.harm);
        else if (id === 'rdx-hintb')
            rdHint();
        else if (id === 'rdx-rhgo')
            void rdRhRun(false);
        else if (id === 'rdx-rhlisten')
            void rdRhRun(true);
        else if (b && b.classList.contains('rdx-tap') && e.detail === 0)
            rdTap(b.dataset.hand);
        else if (id === 'rdx-c-go')
            rdCustomGo();
    });
    dr.addEventListener('keydown', rdChalKey);
    // A press outside the Challenge menu closes it.
    document.addEventListener('pointerdown', (e) => { const m = maybeById('rdx-chal-menu'); if (m && !m.hidden && !eventClosest(e, '#rdx-chal, #rdx-chal-menu'))
        rdChalOpen(false); });
    dr.addEventListener('pointerdown', (e) => {
        const pad = eventClosest(e, '.rdx-tap');
        if (pad) {
            e.preventDefault();
            touchInput(e, () => rdRhPress('p' + e.pointerId, pad.dataset.hand || 'R'));
        }
    });
    const up = (e: PointerEvent) => { touchInput(e, () => rdRhRelease('p' + e.pointerId)); };
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    document.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); if (k === ' ' || k === 'enter' || k === 'f' || k === 'j')
        rdRhRelease('k:' + k); });
    dr.addEventListener('change', (e) => {
        const el = e.target, id = el instanceof HTMLElement ? el.id : '', checked = el instanceof HTMLInputElement && el.checked, p = rdData().prefs;
        if (id === 'rdx-show-orch') {
            rdxShowOrch = checked;
            rdRenderHome();
            return;
        }
        if (id === 'rdx-snd') {
            p.sound = checked;
            saveAll();
        }
        else if (id === 'rdx-hints') {
            p.hints = checked;
            saveAll();
        }
        else if (id === 'rdx-flow') {
            p.flow = checked;
            saveAll();
            const g = maybeById('rdx-ghost');
            if (g instanceof HTMLInputElement)
                g.disabled = !checked;
        }
        else if (id === 'rdx-ghost') {
            p.ghost = checked;
            saveAll();
        }
        else if (id === 'rdx-stage-pref') {
            p.stage = checked;
            saveAll();
        }
        else if (id === 'rdx-weak-inject')
            setWeakSpotInjection(checked);
        else if (id === 'rdx-rhdur') {
            if (RD.rh && RD.rh.playing) {
                if (el instanceof HTMLInputElement)
                    el.checked = !checked;
                return;
            }
            p.rhDur = checked;
            saveAll();
            rdRhNew(true);
        }
        else if (id === 'rdx-c-clef') {
            const d = RD_CDEF[el instanceof HTMLSelectElement ? el.value : ''];
            selectById('rdx-c-lo').value = d[0];
            selectById('rdx-c-hi').value = d[1];
            rdCustomRead();
        }
        else if (/^rdx-c-/.test(id))
            rdCustomRead();
    });
    byId('rdx-stats').addEventListener('click', async (e) => { if (eventElement(e)?.id === 'rdx-reset' && await appConfirm(t('rdx_reset_q'))) {
        const d = rdData();
        d.nt = {};
        d.tot = { n: 0, ok: 0, ms: 0, sess: 0 };
        saveAll();
        rdRenderStats();
    } });
    const g = byId('rd-gen');
    if (g)
        g.addEventListener('click', rdGenMelody);
})();
/* ============================================================================
   READ HOME — the Read tab's home (Today, the book, Warm-up, Progress) and the player of level pieces
   (docs/plans/2026-11-13-read-redesign-spec.md, sections 3, 7, 8 and 12). The music comes from the pure modules in
   src/sight-reading; this part keeps the screens, the saved book state and the player around the shared engine.
   ============================================================================ */
const rdnNormalized = new WeakSet<object>();
/** The saved book state, read through srtNormalizeBookState once per stored object. */
function rdnBook(): ReadingBookState {
    const r = rdData(), known = r.book;
    if (known && typeof known === 'object' && rdnNormalized.has(known))
        return known;
    const state = srtNormalizeBookState(known);
    r.book = state;
    rdnNormalized.add(state);
    return state;
}
function rdnSetBook(state: ReadingBookState) {
    rdData().book = state;
    rdnNormalized.add(state);
    saveAll();
}
/** Today as a local YYYY-MM-DD date. */
function rdnToday() {
    const d = new Date(), p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/** The fingerprints of every piece the reader has seen (the first-sight ledger): a new daily set avoids them. */
function rdnSeen(): ReadonlySet<string> {
    try {
        return new Set(Object.keys(srtReadLedger(localStorage).exposures));
    }
    catch {
        return new Set();
    }
}
function rdnLevelName(level: number) { return t('rdn_lv' + level + '_name'); }
function rdnKeyName(key: ReadingKey) { return t(key.mode === 'minor' ? 'key_minor' : 'key_major', rdSpell(key.tonic)); }
function rdnKeyShort(key: ReadingKey) { return rdSpell(key.tonic) + (key.mode === 'minor' ? 'm' : ''); }
function rdnSig(keyN: number) { return keyN === 0 ? t('rdn_sig_none') : t(keyN > 0 ? 'rdn_sig_sharps' : 'rdn_sig_flats', Math.abs(keyN)); }
function rdnSigWords(keyN: number) {
    const n = Math.abs(keyN);
    if (n === 0)
        return t('rdn_sig_aria_none');
    return keyN > 0 ? (n === 1 ? t('rdn_sig_aria_sharp1') : t('rdn_sig_aria_sharps', n)) : (n === 1 ? t('rdn_sig_aria_flat1') : t('rdn_sig_aria_flats', n));
}
function rdnPattern(id: ReadingPatternId) { return t('rdn_pat_' + id); }
function rdnCap(s: string) { return s ? s.charAt(0).toLocaleUpperCase(lang) + s.slice(1) : s; }
function rdnStars(n: number): 0 | 1 | 2 | 3 { return n >= 3 ? 3 : n >= 2 ? 2 : n >= 1 ? 1 : 0; }
function rdnStarText(n: number) { return '★'.repeat(n) + '☆'.repeat(3 - n); }
/* ---- screens ---- */
function rdnShowScreen(screen: RdnScreen) {
    if (screen !== 'player') {
        rdnAutoCancel();
        if (SR.lvPiece)
            rdnDropLevelPiece();
    }
    if (screen !== 'warmup' && WARM.on)
        rdnWarmStop();
    if (RDN.screen === 'home' && screen !== 'home')
        RDN.opener = rdnFocusKey(document.activeElement);
    RDN.screen = screen;
    const view = maybeById('view-read');
    if (view)
        view.dataset.rdn = screen;
    const home = screen === 'home', player = screen === 'player', warm = screen === 'warmup';
    byId('rdn-home').hidden = !home;
    byId('rd-tabs').hidden = player || warm;
    byId('rdn-player-head').hidden = !player;
    byId('rdn-warm').hidden = !warm;
    byId('rd-gen').hidden = player;
    // The new screens have their own lede; the older drills and melody screens keep theirs.
    byId('rd-lede').hidden = home || player || warm;
    byId('rdn-lede').hidden = !(home || player || warm);
    if (warm) {
        byId('rdp-drills').hidden = true;
        byId('rdp-pieces').hidden = true;
    }
    if (home) {
        byId('rdp-drills').hidden = true;
        byId('rdp-pieces').hidden = true;
    }
    rdnSyncTabs(screen);
}
/** Keeps all three Read top-level tabs synced with the active screen. */
function rdnSyncTabs(screen: RdnScreen) {
    const list = byId('rd-tabs');
    const activeTab = screen === 'home' ? 'book' : screen === 'melody' ? 'pieces' : screen === 'drills' ? 'drills' : '';
    queryAllHtml(list, '[data-tab]').forEach((b) => {
        const on = b.dataset.tab === activeTab;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
    });
}
/** A selector that finds a control again after the home is drawn anew: its data-rdn-focus key, or its id. */
function rdnFocusKey(el: Element | null) {
    if (!(el instanceof HTMLElement) || el === document.body)
        return '';
    if (el.dataset.rdnFocus)
        return `[data-rdn-focus="${el.dataset.rdnFocus}"]`;
    return el.id ? '#' + el.id : '';
}
/** Back on the home: focus the control that left it if it is still there, otherwise the home's first heading. */
function rdnFocusHome() {
    const again = RDN.opener ? document.querySelector(RDN.opener) : null;
    RDN.opener = '';
    const target = again instanceof HTMLElement && again.getClientRects().length ? again : maybeById('rdn-today-h');
    if (target)
        target.focus({ preventScroll: true });
}
/** Runs `then` once no first-sight result is waiting to be saved. A result that could not be saved is given up first. */
function rdnWhenSaved(then: () => void) {
    if (!srtPendingSaveProtected()) {
        RDN.retries = 0;
        return true;
    }
    if (SR.srtState?.name === 'pendingSave') {
        void srtAbandonClaim('abandoned', false).then((result) => {
            if (result.ok || SR.srtState?.name !== 'pendingSave')
                then();
        });
    }
    else if (RDN.retries < 40) {
        RDN.retries++;
        window.setTimeout(then, 50);
    }
    return false;
}
function rdnHome(focus = false) {
    if (!rdnWhenSaved(() => rdnHome(focus)))
        return;
    if (RD.on) {
        rdAbort();
        rdIntro();
    }
    srStopAll(true, false, 'navigate');
    rdnShowScreen('home');
    rdnRenderHome();
    stageSync();
    if (focus === true)
        rdnFocusHome();
}
// Leaving Read: the home comes back next time, except over an older melody that is still loaded, whose screen comes back
// as it was (an interrupted first sight then shows its practice score there).
function rdnLeaveView() {
    RDN.fresh = !(RDN.screen === 'melody' && !!SR.srtPiece && !!SR.gen);
    rdnAutoCancel();
    if (WARM.on)
        rdnWarmStop();
}
/* ---- the home ---- */
/** srtEnsureDaily, settable by tests through window.__etude. */
let rdnEnsureDailyOf = srtEnsureDaily;
/** Today's set for the state. A set that cannot be made (no new piece left) keeps the previous one and sets RDN.noDaily. */
function rdnEnsureDaily(state: ReadingBookState, today: string) {
    try {
        const ensured = rdnEnsureDailyOf(state, today, rdnSeen());
        RDN.noDaily = false;
        return ensured;
    }
    catch {
        RDN.noDaily = true;
        return state;
    }
}
function rdnChoose(level: number, key: string | null) {
    rdnSetBook(rdnEnsureDaily(srtChooseLevel(rdnBook(), level, key), rdnToday()));
    rdnRenderHome();
}
function rdnRenderHome(createDaily = true) {
    const box = maybeById('rdn-home');
    if (!box)
        return;
    const today = rdnToday();
    let state = rdnBook();
    const ensured = createDaily ? rdnEnsureDaily(state, today) : state;
    if (ensured !== state) {
        state = ensured;
        rdnSetBook(state);
    }
    const active = document.activeElement, focusKey = active instanceof HTMLElement && box.contains(active) ? active.dataset.rdnFocus ?? '' : '';
    const more = box.querySelector('#rdn-more-keys');
    const moreOpen = more instanceof HTMLDetailsElement && more.open;
    // Single unified Today hero + companion routine, then the book, then the other ways to practice.
    box.innerHTML = rdnHeroHtml(state, today) +
        `<hr class="rule"><h2 class="eyebrow-sec" id="rdn-book-sec">${rdEsc(t('rdn_book_eyebrow'))}</h2>${rdnBookHtml(state, moreOpen)}` +
        `<hr class="rule"><h2 class="eyebrow-sec" id="rdn-tools-h">${rdEsc(t('today_tools'))}</h2>${rdnToolsHtml()}`;
    rdnStreakUi(state, today);
    if (focusKey) {
        const again = box.querySelector(`[data-rdn-focus="${focusKey}"]`);
        if (again instanceof HTMLElement)
            again.focus({ preventScroll: true });
    }
}
/** Today's set in one line: how many pieces, their level and their keys. */
function rdnSetLine(state: ReadingBookState) {
    const daily = RDN.noDaily ? null : state.daily;
    const setKey = daily ? daily.focusKey : state.focusKey, setLevel = daily ? daily.level : state.level;
    const keys = setKey ? t('rdn_today_key', rdnKeyName(srtReadingKey(setKey))) : t('rdn_today_mixed');
    return t('rdn_today_sub') + ' · ' + t('rdn_today_level', setLevel) + '. ' + keys;
}
/** The first long piece of today that was not played yet, in the chosen key (or one of the level's keys, by the day). */
function rdnLongCtx(state: ReadingBookState, today: string): RdnCtx {
    let index = 0;
    while (index < 99 && state.pieces[srtLongId(today, index)])
        index++;
    const pool = srtKeyPool(state.level);
    const pick = [...(today + '|' + index)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % pool.length;
    return { kind: 'long', date: today, level: state.level, key: state.focusKey ?? pool[pick].id, index };
}
/** Unified Today card: Today's 5-piece set on the left, the two complementary routine steps (Warm-up & Long piece) on the right. */
function rdnHeroHtml(state: ReadingBookState, today: string) {
    // The card describes the set (its level and keys), which stays for the day once a piece of it was played.
    const daily = RDN.noDaily ? null : state.daily, e = rdEsc, lv = state.level, avg = srtLevelAverage(state, lv);
    const slots = daily ? daily.slots : [], done = daily ? daily.done : [];
    const played = done.filter((x) => x !== null).length, total = slots.length;
    const stays = !daily ? '' : daily.level !== state.level ? t('rdn_today_stays', daily.level) : daily.focusKey !== state.focusKey ? t('rdn_today_stays_key') : '';
    const counts = `<div class="counts rdn-stats"><div class="count due"><b class="num">${lv}</b><span>${e(t('rdn_c_level'))}</span></div>` +
        `<div class="count new"><b class="num">${avg === null ? '—' : avg + '%'}</b><span>${e(t('rdn_stat_first'))}</span></div>` +
        `<div class="count mastered"><b class="num">${srtPiecesRead(state)}</b><span>${e(t('rdn_stat_read'))}</span></div></div>`;
    const chips = slots.map((slot, i) => {
        const score = done[i], role = t('rdn_role_' + slot.role);
        const label = t('rdn_slot_aria', i + 1, role) + ', ' + (score === null ? t('rdn_not_played') : t('rdn_score_n', score));
        return `<button type="button" class="rdn-slot${score === null ? '' : ' done'}" data-rdn-slot="${i}" data-rdn-focus="slot${i}" aria-label="${e(label)}">` +
            `<b>${i + 1}</b><small>${e(score === null ? role : score + '%')}</small></button>`;
    }).join('');
    const go = played === 0 ? 'rdn_today_start' : played >= total ? 'rdn_today_done' : 'rdn_today_continue';
    const suggest = srtLevelReady(state, lv)
        ? `<div class="rdn-suggest" id="rdn-suggest"><span>${e(t('rdn_suggest', lv + 1))}</span><span class="rdn-sp"></span>` +
            `<button type="button" class="btn" id="rdn-suggest-go" data-rdn-focus="suggest">${e(t('rdn_suggest_go', lv + 1))}</button></div>`
        : '';
    const items = rdnPlanItems(state, today), nextIdx = items.findIndex((it) => !it.done && !it.off);
    const sideItems = [items[0], items[2]];
    const rows = sideItems.map((it) => {
        const idx = items.indexOf(it), warm = it.id === 'rdn-warm-go';
        return `<li><button type="button" class="plan-item${warm ? ' rdn-warm' : ''}" id="${it.id}" data-rdn-focus="${it.focus}" data-done="${it.done}"` +
            `${idx === nextIdx ? ' data-next="true"' : ''}${it.off ? ' disabled' : ''}>` +
            `<span class="ck" aria-hidden="true">${it.done ? '✓' : idx === 0 ? 1 : 2}</span>` +
            `<span class="pt"><span${warm ? ' id="rdn-warm-h"' : ''}>${e(it.t)}</span>${it.done ? `<span class="visually-hidden"${warm ? ' id="rdn-warm-done"' : ''}> — ${e(t(warm ? 'rdn_warm_done' : 'done_today'))}</span>` : ''}</span>` +
            `<span class="pd"${it.dId ? ` id="${it.dId}"` : ''}>${e(it.d)}</span>` +
            `<span class="plan-end" aria-hidden="true"><span class="plan-go">→</span></span>` + '</button></li>';
    }).join('');
    const segs = items.map((it, idx) => `<i data-state="${it.done ? 'done' : it.partial ? 'partial' : idx === nextIdx ? 'next' : 'todo'}"></i>`).join('');
    return `<section class="hero rdn-hero rdn-today" aria-labelledby="rdn-today-h"><div class="rdn-today-grid"><div class="rdn-today-main"><div class="hero-top">` +
        `<h2 id="rdn-today-h" tabindex="-1">${e(t('rdn_today_title'))}</h2>${counts}` +
        (daily ? `<p class="nextup rdn-sub">${e(rdnSetLine(state))}</p>` : `<p class="nextup rdn-sub" id="rdn-no-set">${e(t('rdn_no_set'))}</p>`) +
        (stays ? `<p class="rdn-sub rdn-stays" id="rdn-today-stays">${e(stays)}</p>` : '') +
        (daily ? `<div class="rdn-slots" role="group" aria-label="${e(t('rdn_today_title'))}">${chips}</div>` : '') +
        `<div class="hero-actions"><button type="button" class="btn primary lg" id="rdn-today-go" data-rdn-focus="today-go"${!daily || played >= total ? ' disabled' : ''}>${e(t(daily ? go : 'rdn_today_start'))}</button></div></div>` +
        `<div class="hero-why"><span class="why">✦ ${e(t('rdn_why'))}</span>${suggest}</div></div>` +
        `<div class="rdn-today-side" id="rdn-plan" aria-labelledby="rdn-plan-h"><div class="plan-head"><div><h3 id="rdn-plan-h" tabindex="-1">${e(t('rdn_plan_title'))}</h3>` +
        `<div class="plan-meta"><span class="sub" id="rdn-plan-sub">${e(t('plan_sub', items.filter((it) => it.done).length, items.length))}</span>` +
        `<div class="plan-segs" id="rdn-plan-segs" aria-hidden="true">${segs}</div></div></div></div><ul class="plan-list rdn-side-list">${rows}</ul></div></div></section>`;
}
/** A step of today's reading. `off`: it cannot be done today (no set could be made). */
type RdnPlanItem = { id: string; focus: string; done: boolean; partial?: boolean; prog?: number; pill?: string; t: string; d: string; dId?: string; off?: boolean };
function rdnPlanItems(state: ReadingBookState, today: string): RdnPlanItem[] {
    const lv = state.level, daily = RDN.noDaily ? null : state.daily;
    const total = daily ? daily.slots.length : 0, played = daily ? daily.done.filter((x) => x !== null).length : 0;
    const long = !!state.pieces[srtLongId(today, 0)];
    return [
        { id: 'rdn-warm-go', focus: 'warm-go', done: rdData().prefs.warmDone === today, t: t('rdn_warm_title'), d: t(lv >= 6 ? 'rdn_warm_text_ch' : 'rdn_warm_text', lv), dId: 'rdn-warm-text' },
        { id: 'rdn-plan-set', focus: 'plan-set', done: total > 0 && played >= total, partial: played > 0 && played < total, prog: total ? played / total : 0,
            pill: total ? played + '/' + total : undefined, t: t('rdn_today_title'), d: daily ? rdnSetLine(state) : t('rdn_no_set'), off: !daily },
        { id: 'rdn-plan-long', focus: 'plan-long', done: long, t: t('rdn_long'), d: t(long ? 'rdn_long_again' : 'rdn_long_d') },
    ];
}
/** Other ways to practice, as on Today: the scored exercise, the pieces, the voice. */
function rdnToolsHtml() {
    const e = rdEsc, tool = (attrs: string, title: string, text: string) => `<li><button type="button" class="tool" ${attrs}><span class="tool-t">${e(title)}</span>` +
        `<span class="tool-d">${e(text)}</span><span class="tool-go" aria-hidden="true">→</span></button></li>`;
    return `<ul class="tools" aria-labelledby="rdn-tools-h">` +
        tool('id="rdn-scored" data-rdn-focus="scored"', t('rdn_scored'), t('rdn_scored_d')) +
        tool('data-rdn-view="analysis" data-rdn-focus="tool-pieces"', t('an_title'), t('tool_analysis_d')) +
        tool('data-rdn-view="sing" data-rdn-focus="tool-voice"', t('nav_sing'), t('tool_sing_d')) + '</ul><p id="rdn-scored-status" role="status" hidden></p>';
}
/** The page head's right side, as on Today: the day streak, and today's set as dots. */
function rdnStreakUi(state: ReadingBookState, today: string) {
    const box = maybeById('rdn-streak');
    if (!box)
        return;
    const daily = RDN.noDaily ? null : state.daily, total = daily ? daily.slots.length : SRT_DAILY_PIECES, played = daily ? daily.done.filter((x) => x !== null).length : 0;
    const dots = Array.from({ length: total }, (_, i) => `<i${i < played ? ' class="on"' : ''}></i>`).join('');
    box.innerHTML = `<div><span class="big num" id="rdn-streak-n">${srtStreak(state, today)}</span><small class="streak-l">${rdEsc(t('streak_label'))}</small></div>` +
        `<div class="goaldots" role="img" aria-label="${rdEsc(t('rdn_goal_aria', played, total))}">${dots}</div><small class="goal-txt num">${rdEsc(t('goal_txt', played, total))}</small>`;
    box.hidden = false;
}
function rdnNumChip(n: number, stat: PieceStat | undefined, next: boolean) {
    const label = !stat ? t('rdn_num_aria_none', n) : stat.stars === 0 ? t('rdn_num_aria_star0', n) : stat.stars === 1 ? t('rdn_num_aria_star1', n) : t('rdn_num_aria_stars', n, stat.stars);
    return `<button type="button" class="rdn-num${stat ? ' played' : ''}${next ? ' next' : ''}" data-rdn-n="${n}" data-rdn-focus="n${n}" aria-label="${rdEsc(label)}">` +
        `<b>${n}</b><small aria-hidden="true">${stat ? rdnStarText(stat.stars) : ''}</small></button>`;
}
/** The sign next to the colour of a key's status (the words are in the chip's label): a check for secure, a dot for started. */
function rdnMark(status: string) {
    return status === 'secure' ? '<span class="rdn-mk rdn-mk-secure" aria-hidden="true">✓</span>' : status === 'started' ? '<span class="rdn-mk rdn-mk-started" aria-hidden="true">●</span>' : '';
}
function rdnUnitLabel(unit: BookUnit, named: boolean) {
    if (unit.kind === 'easy')
        return t('rdn_unit_easy');
    if (unit.kind === 'newKey')
        return named ? rdnKeyName(srtReadingKey(unit.keys[0])) : t('rdn_unit_newkey');
    return t(unit.kind === 'check' ? 'rdn_unit_check' : 'rdn_unit_mix');
}
function rdnBookHtml(state: ReadingBookState, moreOpen: boolean) {
    const e = rdEsc, lv = state.level, level = srtLevel(lv), focus = state.focusKey;
    const levels = srtLevels().map((l) => `<button type="button" class="rdn-lv" data-rdn-lv="${l.id}" data-rdn-focus="lv${l.id}" aria-pressed="${l.id === lv}" ` +
        `aria-label="${e(t('rdn_level_aria', l.id, rdnLevelName(l.id)))}">${l.id}</button>`).join('');
    const pool = srtKeyPool(lv), poolIds: readonly string[] = pool.map((k) => k.id), rest = srtReadingKeys().filter((k) => !poolIds.includes(k.id));
    const chip = (k: ReadingKey) => {
        const st = srtKeyStatus(state, lv, k.id);
        const label = rdnKeyName(k) + ', ' + rdnSigWords(k.keyN) + (st === 'new' ? '' : ', ' + t('rdn_status_' + st));
        return `<button type="button" class="rdn-key" data-rdn-key="${k.id}" data-rdn-focus="key-${k.id}" data-m="${st === 'secure' ? 2 : st === 'started' ? 1 : 0}" ` +
            `aria-pressed="${focus === k.id}" aria-label="${e(label)}"><b>${e(rdnKeyShort(k))}</b><small>${e(rdnSig(k.keyN))}</small>${rdnMark(st)}</button>`;
    };
    const mixed = `<button type="button" class="rdn-key rdn-mix" data-rdn-key="mix" data-rdn-focus="key-mix" aria-pressed="${focus === null}">` +
        `<b>${e(t('rdn_mixed'))}</b><small>${e(t('rdn_mixed_sub', pool.length))}</small></button>`;
    const open = moreOpen || (focus !== null && !poolIds.includes(focus));
    const others = rest.length ? `<details class="rdn-more" id="rdn-more-keys"${open ? ' open' : ''}><summary data-rdn-focus="more">${e(t('rdn_other_keys'))}</summary>` +
        `<div class="rdn-keys" role="group" aria-label="${e(t('rdn_other_keys'))}">${rest.map(chip).join('')}</div></details>` : '';
    let head = '', body = '';
    if (focus === null) {
        const tally = srtBookTally(state, lv), next = tally.next;
        const go = tally.done === 0 ? t('rdn_go_start', 1) : next === null ? t('rdn_go_replay', 1) : t('rdn_go_continue', next);
        head = `<h3>${e(t('rdn_book_head', lv))}</h3><span class="rdn-sub" id="rdn-book-done">${e(t('rdn_done_of', tally.done, SRT_BOOK_PIECES))}</span>` +
            `<span class="rdn-sp"></span><button type="button" class="btn primary" id="rdn-book-go" data-rdn-n="${next ?? 1}" data-rdn-focus="book-go">${e(go)}</button>`;
        body = '<div class="rdn-units">' + srtBookUnits(lv).map((unit) => {
            const first = unit.index * SRT_UNIT_PIECES + 1;
            const nums = Array.from({ length: SRT_UNIT_PIECES }, (_, i) => first + i);
            const played = nums.filter((n) => state.pieces[srtBookId(lv, n)]).length;
            return `<section class="rdn-unit" aria-label="${e(t('rdn_unit', unit.index + 1) + ', ' + rdnUnitLabel(unit, true))}"><div class="rdn-uh"><b>${e(t('rdn_unit', unit.index + 1))}</b>` +
                `<span>${e(rdnUnitLabel(unit, true))}</span>${unit.kind === 'newKey' ? `<span class="rdn-tag">${e(t('rdn_new_key'))}</span>` : ''}` +
                `<span class="rdn-uc">${played}/${SRT_UNIT_PIECES}</span></div><div class="rdn-nums8">` +
                nums.map((n) => rdnNumChip(n, state.pieces[srtBookId(lv, n)], n === next)).join('') + '</div></section>';
        }).join('') + '</div>';
    }
    else {
        const key = srtReadingKey(focus), tally = srtFocusTally(state, lv, focus), next = tally.next;
        const go = tally.done === 0 ? t('rdn_go_start', 1) : next === null ? t('rdn_go_replay', 1) : t('rdn_go_continue', next);
        head = `<h3>${e(t('rdn_focus_head', rdnKeyName(key)))}</h3><span class="rdn-sub" id="rdn-book-done">${e(t('rdn_done_of', tally.done, SRT_FOCUS_PIECES))}</span>` +
            `<span class="rdn-sp"></span><button type="button" class="btn primary" id="rdn-book-go" data-rdn-n="${next ?? 1}" data-rdn-focus="book-go">${e(go)}</button>`;
        body = `<div class="rdn-nums">${Array.from({ length: SRT_FOCUS_PIECES }, (_, i) => i + 1)
            .map((n) => rdnNumChip(n, state.pieces[srtFocusId(lv, focus, n)], n === next)).join('')}</div>`;
    }
    const patterns = level.newPatterns.map(rdnPattern).join(', ');
    return `<section class="rdn-card rdn-book" aria-labelledby="rdn-book-h">` +
        `<h3 class="rdn-book-t" id="rdn-book-h" tabindex="-1">${e(t('rdn_book_title'))}</h3>` +
        `<div class="rdn-lab" id="rdn-lv-lab">${e(t('rdn_level_label'))}</div><div class="rdn-levels" role="group" aria-labelledby="rdn-lv-lab">${levels}</div>` +
        `<p class="rdn-lvdesc"><b>${e(t('rdn_level_head', lv, rdnLevelName(lv)))}</b><br>${e(t('rdn_lv' + lv + '_desc'))}<br>` +
        `<span class="rdn-pat">${e(t('rdn_new_patterns', patterns))}</span></p>` +
        `<div class="rdn-lab" id="rdn-k-lab">${e(t('rdn_keys'))}</div><div class="rdn-keys" role="group" aria-labelledby="rdn-k-lab">${mixed}${pool.map(chip).join('')}</div>` +
        others +
        `<div class="rdn-legend"><span><i class="rdn-lg-secure"></i>${rdnMark('secure')}${e(t('rdn_legend_secure'))}</span><span><i class="rdn-lg-started"></i>${rdnMark('started')}${e(t('rdn_legend_started'))}</span></div>` +
        `<div class="rdn-bookhead">${head}</div>${body}</section>`;
}
function rdnHomeClick(e: MouseEvent) {
    const state = rdnBook();
    const lv = eventClosest(e, '[data-rdn-lv]');
    if (lv) {
        rdnChoose(Number(lv.dataset.rdnLv), state.focusKey);
        return;
    }
    const key = eventClosest(e, '[data-rdn-key]');
    if (key) {
        rdnChoose(state.level, key.dataset.rdnKey === 'mix' ? null : key.dataset.rdnKey ?? null);
        return;
    }
    const num = eventClosest(e, '[data-rdn-n]');
    if (num) {
        const n = Number(num.dataset.rdnN);
        rdnOpen(state.focusKey ? { kind: 'focus', level: state.level, key: state.focusKey, number: n } : { kind: 'book', level: state.level, number: n });
        return;
    }
    const slot = eventClosest(e, '[data-rdn-slot]');
    if (slot && state.daily) {
        rdnOpen({ kind: 'daily', date: state.daily.date, slot: Number(slot.dataset.rdnSlot) });
        return;
    }
    const b = eventClosest(e, 'button'), view = b?.dataset.rdnView;
    // Continue runs the step it names.
    const id = b ? (b.id === 'rdn-plan-continue' ? b.dataset.rdnRun ?? '' : b.id) : '';
    if (view) {
        show(view);
        return;
    }
    if ((id === 'rdn-today-go' || id === 'rdn-plan-set') && state.daily) {
        // The first piece not played yet; a finished set opens at its first piece, as practice.
        const first = state.daily.done.findIndex((x) => x === null);
        if (first >= 0 || id === 'rdn-plan-set')
            rdnOpen({ kind: 'daily', date: state.daily.date, slot: Math.max(0, first) });
    }
    else if (id === 'rdn-long-go' || id === 'rdn-plan-long')
        rdnOpen(rdnLongCtx(state, rdnToday()));
    else if (id === 'rdn-warm-go')
        rdnWarmupStart();
    else if (id === 'rdn-scored')
        void rdnOpenScored();
    else if (id === 'rdn-suggest-go' && state.level < 8)
        rdnChoose(state.level + 1, null);
}
/* ---- the warm-up: flash cards, then a few existing drills, one after another ---- */
/** How many answers end a drill step of the warm-up: rhythm exercises, and questions of the other drills (chords). */
const RDN_WARM_LIMIT = { rh: 2, other: 5 };
function rdnWarmClear() {
    window.clearTimeout(WARM.timer);
    window.clearTimeout(WARM.chordTimer);
    WARM.timer = 0;
    WARM.chordTimer = 0;
}
/** Starts the warm-up of the book's level, in the pinned key or else the key of today's level piece. */
function rdnWarmupStart() {
    if (!rdnWhenSaved(rdnWarmupStart))
        return;
    const today = rdnToday();
    let state = rdnBook();
    const ensured = rdnEnsureDaily(state, today);
    if (ensured !== state) {
        state = ensured;
        rdnSetBook(state);
    }
    const slots = state.daily?.slots ?? [], slot = slots.find((x) => x.role === 'level') ?? slots[1] ?? slots[0];
    const level = state.level, key: string = state.focusKey ?? slot?.key ?? srtKeyPool(level)[0].id;
    if (RD.on)
        rdAbort();
    srStopAll(true, false, 'navigate');
    rdnWarmClear();
    WARM.on = true;
    WARM.level = level;
    WARM.key = key;
    WARM.steps = srtWarmupPlan(level, key, `${today}|${level}|${key}`);
    WARM.step = 0;
    WARM.tally = [];
    WARM.phase = 'idle';
    rdnShowScreen('warmup');
    rdnWarmRun();
    stageSync();
    window.scrollTo(0, 0);
    byId('rdn-w-back').focus({ preventScroll: true });
}
function rdnWarmStepName(step: WarmupStep | undefined) {
    if (!step)
        return '';
    if (step.kind === 'flash')
        return t('rdn_w_flash');
    if (step.kind === 'position')
        return t(step.hand === 'rh' ? 'rdn_w_pos_rh' : 'rdn_w_pos_lh');
    return t(step.id.startsWith('ch') ? 'rdn_w_chords' : 'rdn_w_rhythm');
}
function rdnWarmHead() {
    byId('rdn-w-step').textContent = t('rdn_w_step', Math.min(WARM.step + 1, WARM.steps.length), WARM.steps.length) + ' · ' + rdnWarmStepName(WARM.steps[WARM.step]);
    const tally = byId('rdn-w-tally');
    tally.textContent = WARM.tally.length ? t('rdn_w_tally', WARM.tally[0], WARM.tally[1]) : '';
    tally.hidden = !WARM.tally.length;
    // A drill step names itself on the drill's stage (a custom drill would say "Custom drill").
    if (WARM.phase === 'drill')
        byId('rdx-title').textContent = rdnWarmStepName(WARM.steps[WARM.step]);
}
/** Runs the current step: the flash cards here, the other steps in the drill engine (practice mode, a few answers). */
function rdnWarmRun() {
    rdnWarmClear();
    if (!WARM.on)
        return;
    const step = WARM.steps[WARM.step], flash = byId('rdn-w-flash');
    if (!step) {
        rdnWarmFinish();
        return;
    }
    rdnWarmHead();
    if (step.kind === 'flash') {
        byId('rdp-drills').hidden = true;
        flash.hidden = false;
        WARM.card = 0;
        WARM.clean = 0;
        rdnWarmCard();
        return;
    }
    // Focus on the card (its Next button, say) moves to the header's Back before the card goes.
    const lost = flash.contains(document.activeElement);
    flash.hidden = true;
    flash.innerHTML = '';
    if (lost)
        byId('rdn-w-back').focus({ preventScroll: true });
    const L: ReadDrillLevel | undefined = step.kind === 'position'
        ? rdCustomLevel({ ty: 'play', clef: step.clef, lo: step.low, hi: step.high, acc: 0, keys: 0, land: false }, step.keyN)
        : RD_LV[step.id];
    if (!L) {
        rdnWarmNext();
        return;
    }
    WARM.phase = 'drill';
    WARM.limit = step.kind === 'position' ? step.count : L.ty === 'rh' ? RDN_WARM_LIMIT.rh : RDN_WARM_LIMIT.other;
    byId('rdp-drills').hidden = false;
    rdAbort();
    RD.L = L;
    byId('rdx-home').hidden = true;
    byId('rdx-stage').hidden = false;
    rdIntro();
    rdStart('practice');
    rdnWarmHead();
}
function rdnWarmNext() {
    WARM.step++;
    rdnWarmRun();
}
/** True once a drill step of the warm-up has had its answers: the drill then ends its run as usual (see rdFinish). */
function rdnWarmLimit() { return WARM.on && WARM.phase === 'drill' && RD.n >= WARM.limit; }
/** Called by rdFinish after a run was counted: in a warm-up the next step starts instead of the drill's summary. */
function rdnWarmDrillDone() {
    if (!WARM.on || WARM.phase !== 'drill')
        return false;
    rdnWarmNext();
    return true;
}
/** The drills screen as the warm-up found it: no run, the stage closed, the ladder showing. */
function rdnWarmDrillsReset() {
    if (RD.on)
        rdAbort();
    RD.L = null;
    byId('rdx-stage').hidden = true;
    byId('rdx-home').hidden = false;
}
/** Abandons the warm-up (Back, another screen, another tab): no timer, no drill run and no flash card stay behind. */
function rdnWarmStop() {
    rdnWarmClear();
    const touched = WARM.step > 0 || WARM.phase === 'drill';
    WARM.on = false;
    WARM.phase = 'idle';
    WARM.played = [];
    const flash = maybeById('rdn-w-flash');
    if (flash) {
        flash.hidden = true;
        flash.innerHTML = '';
    }
    if (touched)
        rdnWarmDrillsReset();
}
function rdnWarmFinish() {
    rdnWarmStop();
    rdData().tot.sess++;
    markReadDoneToday();
    touchDay();
    rdData().prefs.warmDone = rdnToday();
    saveAll();
    rdnHome();
    const go = maybeById('rdn-warm-go');
    if (go)
        go.focus({ preventScroll: true });
}
/* flash cards */
function rdnWarmCards(): readonly FlashCard[] {
    const step = WARM.steps[WARM.step];
    return step && step.kind === 'flash' ? step.cards : [];
}
/** The card's bar for the engraver: only the hand that plays it, and never with note names. */
function rdnFlashScore(card: FlashCard): SrScore {
    const sc = card.score;
    return { ts: [...sc.ts], keyN: sc.keyN, engrave: 2, noNames: true, rh: card.hand === 'rh' ? sc.rh : undefined, lh: card.hand === 'lh' ? sc.lh : undefined };
}
function rdnWarmCard() {
    const cards = rdnWarmCards();
    if (WARM.card >= cards.length) {
        WARM.tally = [WARM.clean, cards.length];
        rdnWarmNext();
        return;
    }
    WARM.again = false;
    rdnWarmShow(true);
}
function rdnWarmShow(draw: boolean) {
    rdnWarmClear();
    WARM.phase = 'show';
    WARM.played = [];
    WARM.lastAt = 0;
    WARM.strict = false;
    rdnWarmFlashUi(draw);
    // The bar runs out while the card shows (a still bar with reduced motion). Only a new showing restarts it.
    const bar = maybeById('rdn-f-bar');
    if (bar) {
        bar.style.setProperty('--flash', RDN_WARM_MS.flash + 'ms');
        bar.classList.remove('run');
        void bar.offsetWidth;
        if (!reduceMotion())
            bar.classList.add('run');
    }
    WARM.timer = window.setTimeout(rdnWarmHide, RDN_WARM_MS.flash);
}
function rdnWarmHide() {
    rdnWarmClear();
    WARM.phase = 'play';
    rdnWarmFlashUi(false);
}
/** A note from the app's normal input while a card waits to be played. Notes closer than RDN_WARM_MS.chord form one chord. */
function rdnWarmNote(midi: number) {
    const card = rdnWarmCards()[WARM.card];
    if (!card)
        return;
    const now = performance.now(), src = [...(inputOwners.get(midi) || [])], last = WARM.played[WARM.played.length - 1];
    if (src.some((x) => x === 'midi' || x === 'ble'))
        WARM.strict = true;
    if (last && now - WARM.lastAt <= RDN_WARM_MS.chord)
        last.push(midi);
    else
        WARM.played.push([midi]);
    WARM.lastAt = now;
    window.clearTimeout(WARM.chordTimer);
    if (WARM.played.length >= card.notes.length)
        WARM.chordTimer = window.setTimeout(rdnWarmJudge, Math.max(0, RDN_WARM_MS.chord));
}
/** Checks what was played (any octave unless it came from a MIDI or Bluetooth piano, as in the drills) and shows the mark. */
function rdnWarmJudge() {
    const card = rdnWarmCards()[WARM.card];
    if (!card || WARM.phase !== 'play')
        return;
    WARM.ok = srtFlashMatches(card, WARM.played, !!data.settings.anyOctave || !WARM.strict);
    if (WARM.ok && !WARM.again)
        WARM.clean++;
    rdnWarmClear();
    WARM.phase = 'result';
    rdnWarmFlashUi(false);
    WARM.timer = window.setTimeout(rdnWarmAdvance, RDN_WARM_MS.result);
}
function rdnWarmAdvance() {
    rdnWarmClear();
    WARM.card++;
    rdnWarmCard();
}
/** Draws the card (`draw`) or updates it for the phase: the prompt (a polite live region), the bar, the mark and the buttons. */
function rdnWarmFlashUi(draw: boolean) {
    const box = maybeById('rdn-w-flash'), cards = rdnWarmCards(), card = cards[WARM.card], e = rdEsc;
    if (!box || !card)
        return;
    if (draw || !box.querySelector('#rdn-f-staff')) {
        box.innerHTML = `<div class="rdn-f-top"><span class="rdn-f-count" id="rdn-f-count"></span><span class="rdn-f-prompt" id="rdn-f-prompt" role="status"></span></div>` +
            `<div class="ss-wrap rdn-f-staff" id="rdn-f-staff" role="img"></div><div class="rdn-f-bar" id="rdn-f-bar" aria-hidden="true"><i></i></div>` +
            `<div class="rdn-row rdn-f-btns"><button type="button" class="btn" id="rdn-f-again"></button><button type="button" class="btn primary" id="rdn-f-next"></button></div>`;
        const wrap = byId('rdn-f-staff');
        wrap.innerHTML = srRender(rdnFlashScore(card), srPaperOf(wrap)).svg;
    }
    const phase = WARM.phase, wrap = byId('rdn-f-staff'), bar = byId('rdn-f-bar'), again = buttonById('rdn-f-again'), next = buttonById('rdn-f-next');
    byId('rdn-f-count').textContent = t('rdn_f_card', WARM.card + 1, cards.length);
    const prompt = byId('rdn-f-prompt');
    prompt.dataset.s = phase === 'result' ? (WARM.ok ? 'good' : 'bad') : phase;
    prompt.innerHTML = phase === 'result'
        ? `<span aria-hidden="true">${WARM.ok ? '✓' : '✗'}</span> ${e(t(WARM.ok ? 'rdn_f_right' : 'rdn_f_wrong'))}`
        : e(t(phase === 'play' ? 'rdn_f_play' : 'rdn_f_look'));
    wrap.setAttribute('aria-label', t('rdn_f_staff_aria'));
    wrap.toggleAttribute('data-hidden', phase === 'play');
    if (phase === 'result')
        wrap.dataset.mark = WARM.ok ? 'good' : 'bad';
    else
        delete wrap.dataset.mark;
    wrap.querySelectorAll('.ss-n').forEach((n) => { if (!(n instanceof SVGElement))
        return; if (phase === 'result')
        n.dataset.s = WARM.ok ? 'good' : 'bad';
    else
        delete n.dataset.s; });
    bar.hidden = phase !== 'show';
    again.textContent = t('rdn_f_again');
    next.textContent = t('rdn_f_next');
    const focused = document.activeElement;
    again.hidden = phase !== 'play';
    next.hidden = phase !== 'result';
    // A button that hides while it has focus hands it to the card, so focus is never lost to the page.
    if ((focused === again && again.hidden) || (focused === next && next.hidden))
        box.focus({ preventScroll: true });
}
function rdnWarmFlashClick(e: MouseEvent) {
    const id = eventClosest(e, 'button')?.id;
    if (id === 'rdn-f-again' && WARM.phase === 'play') {
        WARM.again = true;
        rdnWarmShow(false);
    }
    else if (id === 'rdn-f-next' && WARM.phase === 'result')
        rdnWarmAdvance();
}
/** After a language change: the header, and the card's texts. */
function rdnWarmLocale() {
    if (!WARM.on)
        return;
    rdnWarmHead();
    if (WARM.phase === 'show' || WARM.phase === 'play' || WARM.phase === 'result')
        rdnWarmFlashUi(false);
}
/* ---- the player ---- */
let rdnScoredBusy = false;
async function rdnOpenScored(startInFocus?: number) {
    if (rdnScoredBusy || !rdnWhenSaved(() => { void rdnOpenScored(startInFocus); })) return;
    const from = RDN.ctx, screen = RDN.screen, state = rdnBook();
    const level = from?.kind === 'scored' ? from.piece.level : state.level;
    const key = state.focusKey;
    const status = (message: string) => {
        const el = maybeById(screen === 'home' ? 'rdn-scored-status' : 'rdn-p-live');
        if (el) {
            if (screen === 'home') el.hidden = !message;
            el.textContent = message;
        }
    };
    const current = () => view0() === 'read' && RDN.ctx === from && RDN.screen === screen &&
        rdnBook().level === state.level && rdnBook().focusKey === key;
    rdnScoredBusy = true;
    status(t('rdn_scored_loading'));
    try {
        const { srtScoredExercise } = await import('../sight-reading/scored-exercise.js');
        if (!current()) return;
        const seen = new Set(rdnSeen());
        if (from?.kind === 'scored') seen.add(srtLevelFingerprint(from.piece));
        const result = srtScoredExercise(level, key, crypto.getRandomValues(new Uint32Array(1))[0], seen);
        if (!result) {
            status(t('rdn_scored_error'));
            return;
        }
        status('');
        rdnOpen({ kind: 'scored', piece: result.piece }, screen === 'home' ? 'title' : 'keep', startInFocus);
    }
    catch {
        if (current()) status(t('rdn_scored_error'));
    }
    finally {
        rdnScoredBusy = false;
    }
}
function rdnPieceOf(ctx: RdnCtx): GeneratedPiece | null {
    if (ctx.kind === 'scored') return ctx.piece;
    if (ctx.kind === 'book')
        return srtBookPiece(ctx.level, ctx.number);
    if (ctx.kind === 'focus')
        return srtFocusPiece(ctx.level, ctx.key, ctx.number);
    if (ctx.kind === 'long') {
        // A long piece is several sections in one meter: when none can be made for this key, there is no piece to open.
        try {
            return srtLongPiece(ctx.level, ctx.key, ctx.date, ctx.index);
        }
        catch {
            return null;
        }
    }
    const daily = rdnBook().daily, slot = daily && daily.date === ctx.date ? daily.slots[ctx.slot] : undefined;
    return slot ? srtDailyPiece(ctx.date, slot) : null;
}
function rdnHeadText(): { title: string; sub: string } {
    const c = RDN.ctx, p = SR.lvPiece;
    if (!c || !p)
        return { title: '', sub: '' };
    const level = t('rdn_level_head', p.level, rdnLevelName(p.level));
    if (c.kind === 'scored')
        return { title: t('rdn_scored'), sub: level };
    if (c.kind === 'long')
        return { title: c.index ? t('rdn_long_n', c.index + 1) : t('rdn_long'), sub: t('rdn_long_sub', p.bars) + ' · ' + level };
    if (c.kind === 'daily')
        return { title: t('rdn_title_today', c.slot + 1, SRT_DAILY_PIECES), sub: level };
    if (c.kind === 'focus')
        return { title: t('rdn_title_no', c.number, SRT_FOCUS_PIECES), sub: level + ' · ' + rdnKeyName(srtReadingKey(c.key)) };
    // A book piece names its unit but never its key: in a mix, reading the signature is part of the task.
    const unit = srtBookUnits(c.level)[Math.floor((c.number - 1) / SRT_UNIT_PIECES)];
    return { title: t('rdn_title_no', c.number, SRT_BOOK_PIECES), sub: level + ' · ' + t('rdn_unit', unit.index + 1) + ' · ' + rdnUnitLabel(unit, false) };
}
function rdnPlayerHead() {
    const h = rdnHeadText(), c = RDN.ctx;
    byId('rdn-p-title').textContent = h.title;
    byId('rdn-p-sub').textContent = h.sub;
    buttonById('rdn-prev').hidden = !c || c.kind === 'daily' || c.kind === 'long' || c.kind === 'scored';
    rdnNavUi();
}
/** True while an attempt of the level piece runs: its preview, count-in or playing (or a Step-by-step run). */
function rdnBusy() {
    const name = SR.srtState?.name;
    return !!SR.lvPiece && (SR.active || name === 'preparing' || name === 'claiming' || name === 'preview' || name === 'countIn' || name === 'playing');
}
/** Prev and Next: off during an attempt, so they never abandon it; Prev also off on the first piece and in today's set. */
function rdnNavUi() {
    const c = RDN.ctx, busy = rdnBusy(), prev = maybeById('rdn-prev'), next = maybeById('rdn-next');
    if (prev instanceof HTMLButtonElement)
        prev.disabled = busy || !c || c.kind === 'daily' || c.kind === 'long' || c.kind === 'scored' || c.number <= 1;
    if (next instanceof HTMLButtonElement)
        next.disabled = busy || !c;
    const stageNext = maybeById('rd-stage-next'), result = maybeById('rdn-result'), retry = maybeById('rdn-retry');
    if (stageNext)
        stageNext.hidden = !c || busy || !result?.hidden;
    if (retry instanceof HTMLButtonElement)
        retry.disabled = srtPendingSaveProtected();
}
/** The status line before an attempt: first sight, or practice for a piece already seen. */
function rdnReadyText() {
    const note = midiLive() ? '_note' : '';
    return t((SR.srtState?.mode === 'practice' ? 'rdn_seen' : 'rdn_ready') + note);
}
/** The status line again, when it still shows: after a language change, or a piano that connected or went away. */
function rdnReadySync() {
    const v = maybeById('rd-verdict');
    if (v && RDN.screen === 'player' && SR.lvPiece && RDN.ready && v.textContent === RDN.ready)
        v.textContent = RDN.ready = rdnReadyText();
}
/** The hint next to Hands: a level piece's first sight is played with both hands. */
function rdnHandsHint() {
    const hint = maybeById('rdn-hands-hint'), hands = maybeById('rd-hands');
    if (hint)
        hint.hidden = !SR.lvPiece || !hands || hands.hidden || SR.hands === 'both';
}
/** The tempo of a level piece's first sight: its level's, or a long piece's own (the slowest of its sections). */
function rdnBpm(piece: GeneratedPiece) {
    return 'bpm' in piece && typeof piece.bpm === 'number' ? piece.bpm : srtLevel(piece.level).bpm;
}
/** The drawable score of a level piece: the engraver's level notation (engrave: 2) with the player's title. */
function rdnDrawable(piece: GeneratedPiece): SrPiece {
    const score = srtLevelScore(piece);
    return { id: 'lvl', ephemeral: true, gen: 'lv' + piece.level, comp: '', level: piece.level, keyN: score.keyN, minor: score.minor, bpm: rdnBpm(piece),
        ts: score.ts, engrave: 2, marks: srtLevelMarkings(piece), rh: score.rh, lh: score.lh, t: { en: rdnHeadText().title } };
}
/** The Hands control only for the levels where both hands play together. */
function rdnHandsUi() {
    const p = SR.lvPiece, mode = p ? srtLevel(p.level).hands : null;
    const show = !mode || mode === 'oneMoves' || mode === 'together';
    [maybeById('rd-hands'), maybeById('rd-stage-hands')].forEach((c) => { if (c)
        c.hidden = !show; });
    if (!show)
        SR.hands = 'both';
    rdnHandsHint();
}
/** Opens a level piece. `focus`: 'title' moves focus to the piece's title (from the home), 'keep' leaves it where it is
 *  (Prev, Next and the arrow keys), unless the focused control went away. */
function rdnOpen(ctx: RdnCtx, focus: 'title' | 'keep' = 'title', startInFocus?: number) {
    if (!rdnWhenSaved(() => rdnOpen(ctx, focus, startInFocus)))
        return;
    const piece = rdnPieceOf(ctx);
    if (!piece)
        return;
    rdnAutoCancel();
    srStopAll(undefined, false, 'navigate');
    // The old melody screen's mode comes back when the player is left.
    if (!SR.lvPiece && RDN.melodyMode === null)
        RDN.melodyMode = SR.modeSel;
    SR.srtPiece = null;
    SR.lvPiece = piece;
    // A new piece starts with both hands: a one-hand choice does not carry over.
    SR.hands = 'both';
    RDN.ctx = ctx;
    SR.srtFingerprint = srtLevelFingerprint(piece);
    // A piece already seen (an earlier attempt, or Listen) is practice from the start.
    const seen = !!srtReadLedger(localStorage).exposures[SR.srtFingerprint];
    SR.srtState = { ...SRT_INITIAL_STATE, mode: seen ? 'practice' : 'firstSight', fingerprint: SR.srtFingerprint };
    SR.srtPendingAttempt = null;
    SR.srtEvaluation = null;
    SR.srtResultValue = null;
    SR.srtResultLevelId = null;
    srtPreviewUi(false);
    srtPendingUi(false);
    srtNotice(null);
    void srtProgressLedgerUpdate({ type: 'recoverOrphanClaims', generation: srtReadLedger(localStorage).generation });
    SR.gen = rdnDrawable(piece);
    srNoteStartHold();
    rdTab('pieces', 'player');
    SR.modeSel = RDN.playerMode;
    srModeUi();
    rdnResultHide();
    srShowPiece(SR.gen);
    rdnPlayerHead();
    rdnChecklist();
    const v = byId('rd-verdict');
    RDN.ready = '';
    if (!v.textContent) {
        v.className = 'verdict neutral';
        v.textContent = RDN.ready = rdnReadyText();
    }
    window.scrollTo(0, 0);
    // The page is sized by the room under it: laid out again now that everything above the paper is in place.
    srFit();
    const active = document.activeElement;
    if (focus === 'title' || !(active instanceof HTMLElement) || active === document.body || !active.getClientRects().length)
        byId(SCORE_FOCUS.owner === 'read' ? 'rd-go' : 'rdn-p-title').focus({ preventScroll: true });
    if (focus === 'keep')
        byId('rdn-p-live').textContent = rdnHeadText().title;
    if (startInFocus === SCORE_FOCUS.token && SCORE_FOCUS.owner === 'read') {
        byId('rd-go').focus({ preventScroll: true });
        srGo();
    }
}
/** Next (+1) or previous (-1) piece. Past the last piece of a run, and after the fifth piece of the day, the home comes back. */
function rdnStep(dir: 1 | -1, start = dir > 0) {
    const c = RDN.ctx;
    if (!c || rdnBusy())
        return;
    rdnAutoCancel();
    const startInFocus = start && SCORE_FOCUS.owner === 'read' ? SCORE_FOCUS.token : undefined;
    let next: RdnCtx | null = null;
    if (c.kind === 'scored') {
        if (dir > 0) void rdnOpenScored(startInFocus);
        return;
    }
    if (c.kind === 'daily') {
        if (dir < 0)
            return;
        if (c.slot + 1 < SRT_DAILY_PIECES)
            next = { ...c, slot: c.slot + 1 };
    }
    else if (c.kind === 'long') {
        // Next is another long piece: the first of today not played yet.
        if (dir < 0)
            return;
        next = rdnLongCtx(rdnBook(), c.date);
        if (next.kind === 'long' && next.index <= c.index)
            next = { ...next, index: c.index + 1 };
    }
    else {
        const n = c.number + dir, total = c.kind === 'book' ? SRT_BOOK_PIECES : SRT_FOCUS_PIECES;
        if (n < 1)
            return;
        if (n <= total)
            next = { ...c, number: n };
    }
    if (!next) {
        rdnHome(true);
        return;
    }
    rdnOpen(next, 'keep', startInFocus);
}
function rdnKey(e: KeyboardEvent) {
    // A key the page reacts to stops the auto-next countdown (Tab only moves focus).
    if (RDN.autoTimer && e.key !== 'Tab' && view0() === 'read' && RDN.screen === 'player')
        rdnAutoCancel();
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')
        return false;
    if (view0() !== 'read' || RDN.screen !== 'player' || !RDN.ctx || SR.active || SR.listening || inField() || rdnBusy())
        return false;
    if (e.key === 'ArrowLeft' && (RDN.ctx.kind === 'daily' || RDN.ctx.kind === 'long' || RDN.ctx.kind === 'scored' || RDN.ctx.number <= 1))
        return false;
    e.preventDefault();
    rdnStep(e.key === 'ArrowRight' ? 1 : -1);
    return true;
}
/** Leaves the level piece without touching the engine (a new melody or piece takes its place). */
function rdnForgetLevelPiece() {
    SR.lvPiece = null;
    RDN.ctx = null;
    RDN.ready = '';
    rdnAutoCancel();
    rdnResultHide();
    rdnChecklist();
    rdnHandsUi();
    rdnNavUi();
    rdWarmButtonsSync();
    if (RDN.melodyMode !== null) {
        SR.modeSel = RDN.melodyMode;
        RDN.melodyMode = null;
        srModeUi();
    }
}
/** Leaves the player: the attempt stops and the pieces panel is empty again, as before any melody. */
function rdnDropLevelPiece() {
    if (!SR.lvPiece)
        return;
    srStopAll(undefined, false, 'navigate');
    rdnForgetLevelPiece();
    SR.piece = null;
    SR.gen = null;
    SR.srtPiece = null;
    SR.srtFingerprint = null;
    SR.srtState = SRT_INITIAL_STATE;
    SR.srtPendingAttempt = null;
    SR.srtEvaluation = null;
    SR.srtResultValue = null;
    SR.srtResultLevelId = null;
    SR.render = null;
    SR.notes = [];
    SR.steps = [];
    srtPreviewUi(false);
    srtPendingUi(false);
    srtNotice(null);
    byId('rd-staff').innerHTML = '';
    byId('rd-verdict').textContent = '';
    srMeta();
    srEmptyUi();
    srCoach();
}
/** The preview checklist: what to look at first, then up to two patterns of the piece (the level's new ones first). */
function rdnChecklist() {
    const ul = maybeById('rdn-checklist');
    if (!ul)
        return;
    const p = SR.lvPiece;
    // What to look at before the first attempt: gone once an attempt starts, and for a piece already seen.
    ul.hidden = !p || SR.srtState?.mode !== 'firstSight';
    ul.style.visibility = SR.active ? 'hidden' : '';
    if (!p) {
        ul.innerHTML = '';
        return;
    }
    const items = [t('rdn_check_sig'), t('rdn_check_first')];
    const own = srtLevel(p.level).newPatterns, order = [...own, ...srtLevelPatterns(p.level).filter((x) => !own.includes(x))];
    for (const pattern of order) {
        if (items.length >= 4)
            break;
        const bar = p.patterns.findIndex((names) => names.includes(pattern));
        if (bar >= 0)
            items.push(rdnCap(t('rdn_check_pattern', rdnPattern(pattern), bar + 1)));
    }
    // Two bars (before the last, after an upbeat bar) with the same melody rhythm.
    const from = p.upbeat ? 1 : 0, last = p.bars - 1;
    outer: for (let a = from; a < last; a++)
        for (let b = a + 1; b < last; b++)
            if (srtMelodyRhythm(p, a) === srtMelodyRhythm(p, b)) {
                items.push(t('rdn_check_rhythm', a + 1, b + 1));
                break outer;
            }
    ul.innerHTML = items.map((x) => `<li>${rdEsc(x)}</li>`).join('');
}
/** Silence for the active hands: the gaps between their sounding notes, where a played note counts against the reader. */
function rdnRestWindows(piece: GeneratedPiece, bpm: number, hand: 'rh' | 'lh' | 'both') {
    const msPerTick = 60000 / bpm / piece.ticksPerQuarter, end = srtLevelDurationMs(piece, bpm);
    const sounding = piece.events.filter((ev) => ev.pitches.length > 0 && (hand === 'both' || ev.hand === hand))
        .map((ev) => [ev.onsetTick * msPerTick, (ev.onsetTick + ev.durationTick) * msPerTick]).sort((a, b) => a[0] - b[0]);
    const out: { startMs: number; endMs: number }[] = [];
    let at = 0;
    for (const [start, stop] of sounding) {
        if (start > at + 1e-6)
            out.push({ startMs: at, endMs: start });
        at = Math.max(at, stop);
    }
    if (end > at + 1e-6)
        out.push({ startMs: at, endMs: end });
    return out;
}
/** Each expected note of a level piece and the drawn note it belongs to (same hand, onset and pitch). */
function rdnDrawnIds(piece: GeneratedPiece, expected: readonly SightReadingExpected[]) {
    const drawn = new Map<string, number>(), events = new Map(piece.events.map((ev) => [ev.id, ev])), out = new Map<string, number>();
    SR.notes.forEach((n) => drawn.set(`${n.hand}|${n.beat.toFixed(3)}|${n.midi}`, n.nid));
    expected.forEach((x) => {
        const ev = events.get(x.id.slice(0, x.id.lastIndexOf(':')));
        const nid = ev ? drawn.get(`${x.hand}|${(ev.onsetTick / piece.ticksPerQuarter).toFixed(3)}|${x.midi}`) : undefined;
        if (nid !== undefined)
            out.set(x.id, nid);
    });
    return out;
}
function rdnRecord(score: number, stars: 0 | 1 | 2 | 3, firstSight: boolean) {
    const p = SR.lvPiece, c = RDN.ctx;
    if (!p || !c)
        return;
    const id = c.kind === 'scored' ? srtScoredId(srtLevelFingerprint(p)) : c.kind === 'book' ? srtBookId(c.level, c.number) : c.kind === 'focus' ? srtFocusId(c.level, c.key, c.number) : c.kind === 'long' ? srtLongId(c.date, c.index) : srtDailyId(c.date, c.slot);
    rdnSetBook(srtRecordResult(rdnBook(), { id, level: p.level, key: p.key.id, score, stars, firstSight, date: rdnToday() }));
}
/* ---- the result card and auto-next ---- */
function rdnResultHide() {
    const box = maybeById('rdn-result');
    if (box) {
        // Focus on the card (Retry, say) moves to Start before the card goes.
        const lost = !box.hidden && box.contains(document.activeElement);
        box.hidden = true;
        box.innerHTML = '';
        if (lost)
            byId('rd-go').focus({ preventScroll: true });
    }
    RDN.learn = null;
    rdnVerdictShown(true);
    rdnAutoCancel();
    rdnNavUi();
}
/** The one-line verdict under the score. A level piece's result card replaces it, also for screen readers. */
function rdnVerdictShown(on: boolean) {
    const v = maybeById('rd-verdict');
    if (v)
        v.hidden = !on;
}
function rdnResultShow(startAuto: boolean) {
    const box = maybeById('rdn-result'), ev = SR.srtEvaluation, p = SR.lvPiece, learn = RDN.learn, e = rdEsc;
    if (!box)
        return;
    if (!p || (!ev && !learn)) {
        rdnResultHide();
        return;
    }
    // A Step-by-step run measures neither pitch accuracy, rhythm nor timing: those cells show a dash.
    const pct = learn ? learn.acc : SR.srtResultValue ?? Math.round(ev?.score ?? 0), stars = learn ? learn.stars : rdnStars(ev?.stars ?? 0), auto = rdnAutoNextOn();
    const cells: [string, string][] = [
        [!ev || learn ? '—' : Math.round(ev.pitchF1 ?? 0) + '%', t('rdn_res_pitch')],
        [!ev || learn ? '—' : Math.round(ev.rhythmAcc ?? 0) + '%', t('rdn_res_rhythm')],
        [!ev || learn || ev.meanOffsetMs == null ? '—' : t('rdn_res_ms', Math.round(ev.meanOffsetMs)), t('rdn_res_timing')],
        [rdnKeyName(p.key), t('rdn_res_key')],
    ];
    // The score and the cells are the live region: a new result is announced once, without the buttons.
    box.innerHTML = `<div class="rdn-r-live" role="status" aria-atomic="true"><div class="rdn-r-top"><h3 id="rdn-r-score">${pct}%</h3>${rdStars(stars, stars ? undefined : t('rdn_stars_none'))}</div>` +
        // What the stars of an assessed attempt mean, and what the next one takes (a Step-by-step run has its own rule).
        (learn ? '' : `<p class="rdn-r-msg">${e(t('rdn_r_s' + stars))}</p>`) +
        `<div class="rdn-res">${cells.map(([v, l]) => `<div><b>${e(v)}</b><span>${e(l)}</span></div>`).join('')}</div></div>` +
        `<div class="rdn-row"><button type="button" class="btn" id="rdn-retry">${e(t('rdn_retry'))}</button>` +
        `<button type="button" class="btn" id="rdn-listen">${e(t('rdn_listen'))}</button>` +
        `<button type="button" class="btn primary" id="rdn-r-next">${e(t('rdn_next_btn'))}</button>` +
        `<label class="rdn-check-pref"><input type="checkbox" id="rdn-autonext"${auto ? ' checked' : ''}> <span>${e(t('rdn_autonext'))}</span></label></div>` +
        `<div class="rdn-auto" id="rdn-auto" hidden><span id="rdn-auto-t" aria-hidden="true"></span><span class="visually-hidden" id="rdn-auto-say" aria-live="polite"></span>` +
        `<button type="button" class="btn ghost" id="rdn-auto-cancel">${e(t('rdn_cancel'))}</button></div>`;
    box.hidden = false;
    rdnVerdictShown(false);
    rdnNavUi();
    // Auto-next waits until a first-sight result is saved (see srtSetState): its save is still running, or failed.
    const state = SR.srtState, unsaved = state?.mode === 'firstSight' && !!state.attemptId && state.name !== 'saved';
    if (startAuto && auto && stars >= 1) {
        if (unsaved || srtPendingSaveProtected())
            RDN.autoWait = true;
        else
            rdnAutoStart();
    }
    else if (RDN.autoTimer)
        rdnAutoShow();
    // Focus that was lost (on the page, or on a control that went away) goes to Next; a control the reader is on keeps it.
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body || !active.getClientRects().length)
        byId('rdn-r-next').focus({ preventScroll: true });
}
/** Auto-next: the reader's choice once made; until then it is on while a MIDI or Bluetooth piano is connected. */
function rdnAutoNextOn() {
    const pref = rdData().prefs.autoNext;
    return pref === undefined ? midiLive() : !!pref;
}
function rdnAutoShow() {
    const row = maybeById('rdn-auto'), text = maybeById('rdn-auto-t'), say = maybeById('rdn-auto-say');
    if (row)
        row.hidden = !RDN.autoTimer;
    if (text)
        text.textContent = RDN.autoTimer ? t('rdn_auto_in', RDN.autoLeft) : '';
    // Announced once: the number that counts down is not a live region.
    if (say && (!RDN.autoTimer || RDN.autoLeft === 3))
        say.textContent = RDN.autoTimer ? t('rdn_auto_say', RDN.autoLeft) : '';
}
/** After a first-sight result was saved: the auto-next that waited for it starts. */
function rdnAutoAfterSave() {
    if (!RDN.autoWait)
        return;
    RDN.autoWait = false;
    if (RDN.screen === 'player' && SR.lvPiece && !maybeById('rdn-result')?.hidden && rdnAutoNextOn())
        rdnAutoStart();
}
function rdnAutoStart() {
    rdnAutoCancel();
    RDN.autoLeft = 3;
    RDN.autoTimer = window.setInterval(() => {
        RDN.autoLeft--;
        if (RDN.autoLeft <= 0) {
            rdnAutoCancel();
            // A connected piano can start the next assessment on its first note.
            rdnStep(1, !midiLive());
            return;
        }
        rdnAutoShow();
    }, 1000);
    rdnAutoShow();
}
function rdnAutoCancel() {
    if (RDN.autoTimer)
        window.clearInterval(RDN.autoTimer);
    RDN.autoTimer = 0;
    RDN.autoWait = false;
    rdnAutoShow();
}
function rdnRetry() {
    rdnAutoCancel();
    srGo();
}
(function rdnInit() {
    const home = maybeById('rdn-home');
    if (!home)
        return;
    home.addEventListener('click', rdnHomeClick);
    byId('rdn-back').addEventListener('click', () => rdnHome(true));
    byId('rdn-w-back').addEventListener('click', () => rdnHome(true));
    byId('rdn-w-flash').addEventListener('click', rdnWarmFlashClick);
    byId('rdn-prev').addEventListener('click', () => rdnStep(-1));
    byId('rdn-next').addEventListener('click', () => rdnStep(1));
    byId('rd-stage-next').addEventListener('click', () => rdnStep(1));
    // Any other control of the player stops the auto-next countdown (the result card's and the unsaved result's buttons
    // handle it themselves).
    const read = byId('view-read'), stopAuto = (e: Event) => {
        if (!RDN.autoTimer && !RDN.autoWait)
            return;
        const el = e.target instanceof Element ? e.target.closest('button, input, select, summary, label, [role=button]') : null;
        // Retry save keeps a waiting auto-next: it starts once the result is saved.
        if (el && !el.closest('#rdn-result, #rd-srt-pending'))
            rdnAutoCancel();
    };
    read.addEventListener('click', stopAuto, true);
    read.addEventListener('input', stopAuto, true);
    read.addEventListener('change', stopAuto, true);
    const result = byId('rdn-result');
    result.addEventListener('click', (e) => {
        const id = eventClosest(e, 'button')?.id;
        if (id === 'rdn-retry')
            rdnRetry();
        else if (id === 'rdn-listen') {
            rdnAutoCancel();
            srListen();
        }
        else if (id === 'rdn-r-next')
            rdnStep(1);
        else if (id === 'rdn-auto-cancel')
            rdnAutoCancel();
    });
    result.addEventListener('change', (e) => {
        const el = e.target;
        if (!(el instanceof HTMLInputElement) || el.id !== 'rdn-autonext')
            return;
        rdData().prefs.autoNext = el.checked;
        saveAll();
        if (!el.checked)
            rdnAutoCancel();
    });
})();
/* ---------- COACHING: one short tip per surface, chosen from what is on screen and how the last attempt went ----------
   Read & play keeps a "Reading focus" line under the score (piece, mode, hands and the slips made so far) that becomes a
   "Next step" when a run ends; reading drills get a focus line for the drill type and a next step in their summary; Score &
   analysis gets "What to notice" in Now and a next step in the practice summary. A tip keeps the facts it was chosen from
   and is re-worded after a language or notation change. */
function tf(k: string, ...a: unknown[]) { let s = t(k); ['%a', '%b', '%c'].forEach((p, i) => { if (a[i] != null)
    s = s.split(p).join(String(a[i])); }); return s; }
function coachList(xs: string[]) { try {
    return new Intl.ListFormat(lang, { type: 'conjunction' }).format(xs);
}
catch (e) {
    return xs.join(', ');
} }
const coachText = (c: CoachTip) => tf(c.k, ...(c.args ? c.args() : []));
// The lead ("Reading focus:", "Next step:"), the tip, and an optional button that does what the tip suggests.
function coachHTML(lead: string, c: CoachTip, actId?: string) {
    const e = xmlEsc, act = c.act ? tf(c.act.k, ...(c.act.args ? c.act.args() : [])) : '';
    return `<span class="coach-k">${e(lead)}</span> <span class="coach-t">${e(coachText(c))}</span>` + (act ? `<span class="coach-act"><button type="button" class="btn sm" id="${actId}">${e(act)}</button></span>` : '');
}
/* Read & play */
const srStepNo = (n: { oct: number; li: number; }) => n.oct * 7 + n.li;
function srKeyNames(keyN: number) { return (keyN > 0 ? [3, 0, 4, 1, 5, 2, 6] : [6, 2, 5, 1, 4, 0, 3]).slice(0, Math.abs(keyN)).map((li) => spelledName(notation, li, keyN > 0 ? 1 : -1)); }
// The active hands as onsets per hand: melodic moves, leaps (a third or wider), chords, and whether the rhythm goes beyond whole beats.
function srShape() {
    const sel = srActiveHands(), f = { moves: 0, leaps: 0, chords: 0, hands: 0, rhythm: false };
    ['rh', 'lh'].forEach((h) => {
        if (sel !== 'both' && sel !== h)
            return;
        const by = new Map<string, SrStaffNote[]>();
        SR.notes.forEach((n: SrStaffNote) => { if (n.hand !== h)
            return; const k = n.beat.toFixed(3); if (!by.has(k))
            by.set(k, []); by.get(k)?.push(n); });
        if (!by.size)
            return;
        f.hands++;
        let prev: SrStaffNote[] | null = null;
        [...by.values()].sort((a, b) => a[0].beat - b[0].beat).forEach((g) => {
            if (g.length > 1)
                f.chords++;
            else if (prev && prev.length === 1) {
                f.moves++;
                if (Math.abs(srStepNo(g[0]) - srStepNo(prev[0])) >= 2)
                    f.leaps++;
            }
            if (g.some((n) => n.dur % 1))
                f.rhythm = true;
            prev = g;
        });
    });
    return f;
}
// A wrong key in Step by step: the right note in another octave, the natural instead of a sharp or flat, a slip inside a chord,
// the wrong way from the previous note, or the right way but the wrong distance.
// What kind of slip it was (oct, key, chord, other, dir or dist), the note that was wanted and the key played.
function srSlip(st: { notes: readonly SrStaffNote[]; }, m: number): SrSlip | null {
    const want = st.notes.filter((n) => !SR.hit.has(n.nid));
    if (!want.length)
        return null;
    const n = want.reduce((a, b) => Math.abs(b.midi - m) < Math.abs(a.midi - m) ? b : a);
    if (pc(n.midi) === pc(m))
        return { k: 'oct', n, m };
    if (n.acc && m === n.midi - n.acc)
        return { k: 'key', n, m };
    if (st.notes.filter((x) => x.hand === n.hand).length > 1)
        return { k: 'chord', n, m };
    const prev: SrStaffNote[] = (SR.steps[SR.stepIdx - 1] || { notes: [] }).notes.filter((x: SrStaffNote) => x.hand === n.hand);
    if (!prev.length)
        return { k: 'other', n, m };
    const p = prev.reduce((a: SrStaffNote, b: SrStaffNote) => Math.abs(b.midi - n.midi) < Math.abs(a.midi - n.midi) ? b : a);
    return { k: Math.sign(n.midi - p.midi) !== Math.sign(m - p.midi) ? 'dir' : 'dist', n, m };
}
function srSlipNote(st: { notes: readonly SrStaffNote[]; }, m: number) { const s = srSlip(st, m); if (!s)
    return; const E = SR.errs || (SR.errs = {}); E[s.k] = (E[s.k] || 0) + 1; if (s.k === 'key')
    SR.slipKey = s; srCoach(); }
function srTopSlip() { const E = SR.errs || {}; let top: string|null = null; for (const k of ['key', 'oct', 'chord', 'dir', 'dist']) {
    if ((E[k] || 0) >= 2 && (!top || E[k] > E[top]))
        top = k;
} return top; }
const srSlipNames = (s: SrSlip) => [rdLetter(s.n.li), spelledName(notation, s.n.li, s.n.acc)]; // what was played (the natural), what is written
// Reading focus: the slip being repeated right now, else what this piece asks for in this mode.
function srFocus(): CoachTip | null {
    const p = SR.piece;
    if (!p)
        return null;
    if (SR.modeSel === 'assess')
        return { k: srShape().rhythm ? 'rc_rhythm' : 'rc_ahead' };
    const top = SR.active && srTopSlip();
    if (top === 'key' && SR.slipKey) {
        const s = SR.slipKey;
        return { k: 'rc_e_key', args: () => srSlipNames(s) };
    }
    if (top)
        return { k: 'rc_e_' + top };
    const f = srShape();
    if (f.chords)
        return { k: 'rc_chord' };
    if (p.keyN)
        return { k: 'rc_key', args: () => [srKeyNames(p.keyN).join(' ')] };
    if (f.hands > 1)
        return { k: 'rc_hands' };
    if (f.moves && f.leaps / f.moves >= .3)
        return { k: 'rc_iv' };
    return { k: 'rc_dir' };
}
function srNextLearn(): CoachTip {
    const E = SR.errs || {}, top = srTopSlip();
    if (!SR.mistakes)
        return { k: 'rn_clean', act: { k: 'rn_act_assess', run: () => srSetMode('assess') } };
    if (top === 'key' && SR.slipKey) {
        const s = SR.slipKey;
        return { k: 'rn_key', args: () => srSlipNames(s) };
    }
    if (top)
        return { k: 'rn_' + top, args: () => [E[top]] };
    return { k: 'rn_again' };
}
// After Assessment: the score, extra notes, and where the misses were — leaps, chords or altered notes — compared with the rest.
function srNextAssess(pct: number): CoachTip | null {
    const p = SR.piece;
    if (!p)
        return null;
    const bpm = SR.bpm, bad = (n: SrStaffNote) => SR.results[n.nid] !== 'good';
    if (pct >= 95)
        return bpm <= 150 ? { k: 'rn_a_clean', args: () => [pct, bpm + 10], act: { k: 'rn_act_bpm', args: () => [bpm + 10], run: () => srSetBpm(bpm + 10) } } : { k: 'rn_a_top' };
    const cat = { leaps: [0, 0], chords: [0, 0], acc: [0, 0] }, last: { rh?: SrStaffNote[]; lh?: SrStaffNote[]; } = {};
    let all = 0, miss = 0;
    SR.steps.forEach((st: { notes: readonly SrStaffNote[]; }) => (['rh', 'lh'] as const).forEach((h) => {
        const g = st.notes.filter((n) => n.hand === h);
        if (!g.length)
            return;
        const prev = last[h];
        last[h] = g;
        g.forEach((n) => {
            const b = bad(n) ? 1 : 0;
            all++;
            miss += b;
            if (g.length > 1) {
                cat.chords[0] += b;
                cat.chords[1]++;
            }
            else if (prev && prev.length === 1 && Math.abs(srStepNo(n) - srStepNo(prev[0])) >= 2) {
                cat.leaps[0] += b;
                cat.leaps[1]++;
            }
            if (n.acc) {
                cat.acc[0] += b;
                cat.acc[1]++;
            }
        });
    }));
    if (SR.wrongExtra >= 3 && SR.wrongExtra >= miss)
        return { k: 'rn_a_extra', args: () => [SR.wrongExtra] };
    const rate = miss / Math.max(1, all);
    let top: string | null = null, best = 0;
    for (const [k, [b, n]] of Object.entries(cat)) {
        const r = n ? b / n : 0;
        if (b >= 2 && r >= Math.max(.34, rate * 1.5) && r > best) {
            top = k;
            best = r;
        }
    }
    if (top)
        return { k: 'rn_a_' + top };
    if (pct < 80) {
        const v = Math.max(40, bpm - 10);
        return { k: 'rn_a_slow', args: () => [v], act: { k: 'rn_act_bpm', args: () => [v], run: () => srSetBpm(v) } };
    }
    return { k: 'rn_a_good' };
}
const srModeControls = ['rd-mode', 'rd-stage-mode'] as const;
function srModeUi() {
    for (const id of srModeControls) {
        for (const button of byId(id).querySelectorAll('button'))
            button.setAttribute('aria-pressed', String(button.dataset.v === SR.modeSel));
    }
    syncMobileStartBars();
}
function srSetMode(v: string) {
    if (srtPendingSaveProtected())
        return;
    const changed = SR.modeSel !== v;
    SR.modeSel = v;
    if (SR.lvPiece)
        RDN.playerMode = v;
    srModeUi();
    srStopAll();
    if (changed)
        rdnResultHide();
    const practiceOnly = v === 'assess' && srtGeneratedSelected() &&
        (SR.srtState?.mode === 'practice' || SR.srtState?.name === 'abandoned' || SR.srtState?.name === 'interrupted');
    if (v === 'learn' && srtGeneratedSelected())
        srtConsumeOnLearnReveal();
    srDraw();
    byId('rd-verdict').textContent = '';
    if (practiceOnly) {
        const message = t('rd_srt_error_already_exposed');
        srtNotice(message);
        byId('rd-verdict').className = 'verdict neutral';
        byId('rd-verdict').textContent = message;
    }
    byId('rd-go').focus();
}
function srSetBpm(v: number) { if (srtPendingSaveProtected() || SR.active || SR.listening)
    return; const b = inputById('rd-bpm'); b.value = String(v); byId('rd-bpmLbl').textContent = String(v); SR.bpm = v; SR.next = null; srCoach(); syncMobileStartBars(); byId('rd-go').focus(); }
// The HTML each coach box last showed.
const srCoachShown = new WeakMap<HTMLElement, string>();
// One line under the score; it is a polite live region, so it is only rewritten when the tip itself changes.
function srCoach() {
    const box = byId('rd-coach');
    if (!box)
        return;
    const c = SR.piece ? (SR.next || srFocus()) : null, html = c ? coachHTML(t(SR.next ? 'coach_next' : 'coach_focus'), c, 'rd-coach-act') : '';
    box.dataset.kind = SR.next ? 'next' : 'focus';
    if (srCoachShown.get(box) !== html) {
        srCoachShown.set(box, html);
        box.innerHTML = html;
    }
}
/* Reading drills */
function rdFocus(L: ReadDrillLevel | null): CoachTip | null {
    if (!L)
        return null;
    const x = rdLetter, c = L.clef;
    if (L.ty === 'rh')
        return { k: 'rdc_rh' };
    if (L.ty === 'iv')
        return { k: 'rdc_iv' };
    if (L.ty === 'ch')
        return { k: L.inv ? 'rdc_chinv' : 'rdc_ch' };
    if (L.ty === 'ks')
        return { k: 'rdc_ks' };
    if (L.ty === 'sr')
        return { k: 'rc_ahead' };
    if (L.ty === 'k2s')
        return { k: 'rdc_k2s' };
    if (L.tag === 'land')
        return { k: 'rdc_land' };
    if ((L.tag === 'lines' || L.tag === 'spaces') && L.set)
        return { k: 'rdc_' + L.tag, args: () => [(L.set ?? []).map((s) => rdName(rdP(s))).join(' ')] };
    if (L.tag === 'ledup' || L.tag === 'leddn')
        return { k: 'rdc_ledger' };
    if (L.keys)
        return { k: 'rdc_keys' };
    if (L.acc)
        return { k: 'rdc_acc' };
    if (c === 'mix')
        return { k: 'rdc_mix' };
    if (c === 'alto' || c === 'tenor')
        return { k: 'rdc_cc', args: () => [x(0)] };
    if (L.ty === 'play')
        return { k: 'rdc_play' };
    if (c === 'grand')
        return { k: 'rdc_gr', args: () => [x(0)] };
    return c === 'bass' ? { k: 'rdc_ba', args: () => [x(3), x(0), x(4)] } : { k: 'rdc_tr', args: () => [x(0), x(4), x(3)] };
}
function rdCoach(show: boolean) { const box = byId('rdx-coach'); if (!box)
    return; const c = show ? rdFocus(RD.L) : null; box.hidden = !c; box.innerHTML = c ? coachHTML(t('coach_focus'), c) : ''; }
// The session's next step: accuracy first, then the notes missed most, then speed; rhythm drills look at the average timing.
function rdNextStep(L: ReadDrillLevel, mode: string, acc: number, avg: number, stars: number, weak: readonly [string, number][]): CoachTip | null {
    if (L.ty === 'rh') {
        const m: number[] = RD.rhM || [], mean = m.length ? m.reduce((a, b) => a + b, 0) / m.length : 0;
        if (acc < 60)
            return { k: 'rdn_rh_low' };
        if (mean < -35)
            return { k: 'rdn_rh_rush', args: () => [Math.round(-mean)] };
        if (mean > 35)
            return { k: 'rdn_rh_drag', args: () => [Math.round(mean)] };
        return { k: 'rdn_rh_ok' };
    }
    if (!RD.n)
        return null;
    const tg = rdTarget(L) / 1000, sec = avg / 1000, timeAttack = { k: 'rdx_m_timeAttack', run: () => rdStart('timeAttack') };
    // A Survival run lost to the clock needs speed, not hints: timeouts also count against accuracy.
    if (mode === 'survival' && RD.arc && RD.arc.timeouts >= 2)
        return { k: 'rdn_sv_time', act: timeAttack };
    if (acc < 80)
        return { k: 'rdn_hints', act: { k: 'rdn_act_hints', run: () => { rdData().prefs.hints = true; saveAll(); rdStart('practice'); } } };
    if (weak.length && acc < 95)
        return { k: 'rdn_weak', args: () => [weak.slice(0, 3).map(([k]) => rdKeyText(k)).join(', ')], act: mode === 'practice' ? null : { k: 'rdn_act_practice', run: () => rdStart('practice') } };
    if (mode === 'timeAttack' && RD.arc && RD.arc.bestCombo < ARCADE_STREAK)
        return { k: 'rdn_ta' };
    if (sec > tg)
        return { k: 'rdn_speed', args: () => [anNum(sec, 1), anNum(tg, 1)], act: timeAttack };
    if (srtIsArcadeMode(mode))
        return { k: 'rdn_ok' };
    if (mode === 'practice' && RD.chkBest === null)
        return { k: 'rdn_chk', args: () => [RD_CHECK_N] };
    if (stars < 3)
        return { k: 'rdn_star', args: () => [stars >= 2 ? 95 : 90, anNum(stars >= 2 ? tg : tg * 1.6, 1)] };
    const nx = rdLvNext(L);
    if (!L.custom && nx)
        return { k: 'rdn_next', args: () => [rdLvName(nx)] };
    return { k: 'rdn_ok' };
}
function rdNextRender() { const box = maybeById('rdx-next'); if (box && RD.next)
    box.innerHTML = coachHTML(t('coach_next'), RD.next, 'rdx-next-act'); }
// Language or note names changed: re-word every tip on show.
function coachRefresh() { srCoach(); if (RD.L && !byId('rdx-coach').hidden)
    rdCoach(true); rdNextRender(); if (!byId('pr-sum').hidden)
    scorePlayer?.refreshCoach(); }
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
        const showPr = v === 'practice' && !SES.active && !dockExpanded && !inFocus && prHome.style.display !== 'none';
        prBar.hidden = !showPr;
        prHome.classList.toggle('has-mobile-bar', showPr);
        if (showPr && maybeById('pr-cat') && maybeById('pr-mode')) {
            const { cat, mode, key } = prChoice();
            const parts = [prTopicLabel(cat), prModeLabel(mode), ...(prDirShown() ? [prDirLabel(prIvDir)] : []), prKeyLabel(key)];
            prSum.textContent = parts.join(' · ');
            prBtn.textContent = mode === 'along' ? t(accomp.on ? 'ac_stop' : 'ac_play') : t('pr_start_short');
            prBtn.disabled = !!prStartBtn?.disabled;
        }
    }
    const rdBar = maybeById('rd-mobile-bar'), rdSum = maybeById('rd-mobile-summary'), rdBtn = maybeById('rd-mobile-start') as HTMLButtonElement | null;
    const rdPieces = maybeById('rdp-pieces'), rdResult = maybeById('rdn-result'), rdGoBtn = maybeById('rd-go') as HTMLButtonElement | null;
    if (rdBar && rdSum && rdBtn && rdPieces) {
        const showRd = v === 'read' && !rdPieces.hidden && !!SR.piece && !SR.active && !SR.listening && (!rdResult || rdResult.hidden) && !dockExpanded && !inFocus;
        rdBar.hidden = !showRd;
        rdPieces.classList.toggle('has-mobile-bar', showRd);
        if (showRd) {
            const modeLabel = t(SR.modeSel === 'assess' ? 'rd_m_assess' : 'rd_m_learn');
            rdSum.textContent = `${modeLabel} · ${SR.bpm} BPM`;
            rdBtn.disabled = !!rdGoBtn?.disabled;
        }
    }
    const mobileBarVisible = v === 'practice' && !!prBar && !prBar.hidden;
    document.body.classList.toggle('has-mobile-start-bar', mobileBarVisible);
}
function anNum(x: number, d: number) { return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString(LOCALE_TAGS[lang] || lang); }
/* ---------- PROGRESS ---------- */
let progressView: typeof import('./progress-view.js') | null = null;
function collectPracticeReport(buildReport: typeof buildPracticeReport, libraryItems: readonly LibraryItem[] = []) {
    const tn = todayN();
    const book = rdnBook();
    const tally = srtBookTally(book, book.level);
    const rd = rdData();
    const stars = RD_ALL.reduce((sum, level) => sum + rdStarCount(rd.lv[level.id]?.s), 0);
    const pieces: PracticeReportPieceInput[] = [];
    for (const piece of PIECES) {
        const rec = data.sheet[piece.id];
        if (rec && (rec.learned || rec.best)) {
            pieces.push({
                title: srPieceTitle(piece),
                source: 'builtin',
                learned: !!rec.learned,
                bestPct: rec.best ? rec.best : null,
            });
        }
    }
    for (const item of libraryItems) {
        const learned = item.status === 'mastered';
        const bestPct = typeof item.best === 'number' ? item.best : null;
        if (learned || bestPct !== null) {
            pieces.push({
                title: item.title || item.name,
                source: 'library',
                learned,
                bestPct,
            });
        }
    }
    return buildReport({
        today: tn,
        totalReviews: data.totalReviews || 0,
        totalCorrect: data.totalCorrect || 0,
        streak: currentStreak(),
        bestStreak: data.bestStreak || 0,
        mastered: masteredCount(),
        totalItems: ITEMS.length,
        srs: data.srs,
        history: data.history || {},
        items: ITEMS,
        categories: Object.keys(CATS),
        catLabel,
        itemLabel: (it) => {
            const full = ITEMS.find((candidate) => candidate.id === it.id);
            return full ? itemLabel(full) : it.id;
        },
        reading: {
            bookLevel: book.level,
            bookDone: tally.done,
            bookTotal: SRT_BOOK_PIECES,
            piecesRead: srtPiecesRead(book),
            drillAnswers: rd.tot.n,
            drillCorrect: rd.tot.ok,
            stars,
        },
        pieces,
        lessonsDone: Object.keys(learnData().learnDone || {}).length,
    });
}
function standingLabelOf(report: ReturnType<typeof buildPracticeReport>): string {
    const highest = report.milestones.highestId
        ? report.milestones.milestones.find((m) => m.id === report.milestones.highestId)
        : null;
    return highest ? t(highest.labelKey) : t('prog_ms_none');
}
function renderPrintSummaryHtml(report: ReturnType<typeof buildPracticeReport>): string {
    const esc = xmlEsc;
    const piecesLine = report.pieces.length
        ? `<p class="prog-print-pieces"><b>${esc(t('prog_rep_pieces'))}:</b> ${report.pieces.map((p) => {
            const marks = [p.learned ? '✓ ' + t('prog_rep_learned') : '', p.bestPct !== null ? t('prog_rep_best', p.bestPct) : ''].filter(Boolean).join(', ');
            return marks ? `${esc(p.title)} (${esc(marks)})` : esc(p.title);
        }).join(' · ')}</p>`
        : '';
    return `<h2>Étude — ${esc(t('prog_rep_title'))}</h2>`
        + `<p class="prog-print-meta">${esc(report.generatedDateIso)} · ${esc(t('prog_ms_standing', standingLabelOf(report)))} · ${esc(t('prog_rep_7d', report.reviews7d, report.activeDays7d))} · ${esc(t('prog_rep_30d', report.reviews30d, report.activeDays30d))}</p>`
        + piecesLine;
}
function updatePrintSummaryHead(buildReport: typeof buildPracticeReport, libraryItems: readonly LibraryItem[] = []): { html: string; report: ReturnType<typeof buildPracticeReport> } {
    const report = collectPracticeReport(buildReport, libraryItems);
    const html = renderPrintSummaryHtml(report);
    const head = maybeById('prog-print-head');
    if (head) head.innerHTML = html;
    return { html, report };
}
function renderProgress() {
    if (!progressView) return;
    const { html: printSummaryHtml, report } = updatePrintSummaryHead(progressView.buildPracticeReport);
    const log = data.practiceLog ?? {};
    const melTotal = log.melTotal || 0;
    const singCleared = Object.values(data.singCleared || {}).filter(Boolean).length;
    progressView.renderProgress({
        data, hasActivity: storeHasProgress(), items: ITEMS, categories: Object.keys(CATS), today: todayN(), loc: LOCALE_TAGS[lang] || lang,
        t, currentStreak, masteredCount, itemLabel, catLabel, statHTML, rdRenderStats,
        printSummaryHtml,
        milestones: report.milestones,
        studioSummary: {
            techRuns: log.techRuns || 0,
            techClean: log.techClean || 0,
            techBestBpm: log.techBestBpm || 0,
            melRuns: log.melRuns || 0,
            melAcc: melTotal > 0 ? Math.round(100 * (log.melCorrect || 0) / melTotal) : null,
            singCleared,
            singTotal: 7, // pinned to SS_LEVELS.length in tests/unit/voice-feature.test.mjs
        },
        openStudio(kind) {
            if (kind === 'sing') {
                show('sing');
                return;
            }
            show('practice');
            if (kind === 'tech') {
                prSetTopic('scale');
                prSetMode('tech');
            } else {
                prSetTopic('melody');
            }
            byId('pr-start').focus();
        },
        openDrill(category) {
            show('practice');
            prSetTopic(category);
            byId('pr-start').focus();
        },
    });
}
function statHTML(v: string|number, l: string) { return '<div class="s"><b class="num">' + rdEsc(v) + '</b><span>' + rdEsc(l) + '</span></div>'; }
/* ---------- TODAY: daily plan ---------- */
function toolName(v: string) { return t(v === 'practice' ? 'nav_drills' : v === 'songs' ? 'pr_songs' : v === 'accompany' ? 'pr_along' : 'nav_' + (isMergedView(v) ? MERGED_VIEWS[v] : v)); }
interface DailyPlanTask { id: string; done: boolean; partial?: boolean; prog?: number; pill?: string; t: string; d: string; go: () => void }
function renderPlan() {
    const list = byId('plan-list');
    if (!list)
        return;
    const tn = todayN();
    const goal = data.settings.goal, done = data.todayDay === tn ? (data.todayCount || 0) : 0;
    const td = data.toolDay || {}, ear = data.earDay === tn ? (data.earToday || 0) : 0;
    const items: DailyPlanTask[] = [
        { id: 'review', done: done >= goal, partial: done > 0 && done < goal, prog: goal ? Math.min(1, done / goal) : 0, pill: Math.min(done, goal) + '/' + goal, t: t('plan_review'), d: done >= goal ? t('plan_review_done') : t('plan_review_d', done, goal), go: () => { if (!SES.active)
                startSession(null); } },
        ...learnPlanItems(tn),
        { id: 'read', done: td.read === tn, t: t('plan_read'), d: t('plan_read_d'), go: () => show('read') },
        { id: 'piece', done: td.piece === tn, t: t('plan_piece'), d: t('plan_piece_d'), go: () => show('analysis') }, // toolDay.piece: a piece run completed today
        { id: 'ear', done: ear >= 5, partial: ear > 0 && ear < 5, prog: Math.min(1, ear / 5), pill: Math.min(ear, 5) + '/5', t: t('plan_ear'), d: ear ? t('plan_ear_dn', Math.min(ear, 5)) : t('plan_ear_d'), go: prEarCheck },
    ];
    const nextIdx = items.findIndex((i) => !i.done);
    list.innerHTML = '';
    items.forEach((it, idx) => {
        const li = (document).createElement('li'), b = (document).createElement('button'), isNext = idx === nextIdx, isPart = !it.done && !!it.partial;
        b.type = 'button';
        b.className = 'plan-item';
        b.dataset.plan = it.id;
        b.dataset.done = it.done ? 'true' : 'false';
        if (isNext)
            b.dataset.next = 'true';
        if (isPart)
            b.dataset.partial = 'true';
        const ckTxt = it.done ? '✓' : String(idx + 1);
        const pillHtml = it.pill ? '<span class="plan-pill">' + it.pill + '</span>' : '';
        const barHtml = (isPart && it.prog !== undefined && it.prog > 0) ? '<span class="plan-bar" aria-hidden="true"><i style="width:' + Math.round(it.prog * 100) + '%"></i></span>' : '';
        b.innerHTML = '<span class="ck" aria-hidden="true">' + ckTxt + '</span><span class="pt">' + it.t + (it.done ? '<span class="visually-hidden"> — ' + t('done_today') + '</span>' : '') + '</span><span class="pd">' + it.d + '</span><span class="plan-end" aria-hidden="true">' + pillHtml + '<span class="plan-go">→</span></span>' + barHtml;
        b.addEventListener('click', it.go);
        li.appendChild(b);
        list.appendChild(li);
    });
    byId('plan-sub').textContent = t('plan_sub', items.filter((i) => i.done).length, items.length);
    const segs = byId('plan-segs');
    if (segs) {
        segs.innerHTML = items.map((it, idx) => '<i data-state="' + (it.done ? 'done' : it.partial ? 'partial' : idx === nextIdx ? 'next' : 'todo') + '"></i>').join('');
    }
    const nextIt = nextIdx >= 0 ? items[nextIdx] : null, lt = data.lastTool, cb = byId('plan-continue');
    if (nextIt) {
        cb.hidden = false;
        cb.textContent = t('plan_continue', nextIt.t);
        cb.onclick = nextIt.go;
    }
    else if (lt && lt !== 'today' && (navGroup(lt) || isMovedView(lt) || isMergedView(lt))) {
        cb.hidden = false;
        cb.textContent = t('plan_continue', toolName(lt));
        cb.onclick = () => show(lt);
    }
    else
        cb.hidden = true;
}
/* ---------- PRACTICE: last drill result ---------- */
function prRecordDrill() {
    if (!SES.targeted || !SES.total)
        return;
    const tg = SES.targeted;
    data.lastDrill = { cat: tg.cat, mode: tg.mode, keys: tg.mode === 'ear' && (tg.cat === 'melody' || !!data.settings.earKeys), key: tg.key, dir: tg.dir, c: SES.correct, n: SES.total, day: todayN() };
    if (tg.cat === 'melody') {
        const log = data.practiceLog ?? (data.practiceLog = {});
        log.melRuns = (log.melRuns || 0) + 1;
        log.melCorrect = (log.melCorrect || 0) + SES.correct;
        log.melTotal = (log.melTotal || 0) + SES.total;
    }
    saveAll();
}
/* ---------- PRACTICE: setup mode and hints ---------- */
// The setup screen holds one choice: the topic in #pr-cat, the mode in #pr-mode (aria-pressed) and the key in #pr-key.
// #pr-cat and #pr-key are hidden; the topic cards and key chips are their only visible controls. Every caller
// (the Today Ear row, Progress "Needs work", Learn links, Continue, tests) changes the choice through prSetTopic,
// prSetMode and prSetKey, and reads it through prChoice. Intervals by ear also take a Direction (prSetDir, #pr-dir),
// and Intervals show the Song hints panel (#pr-songs, renderSongs). Progressions add a fourth mode, Play along: no drill,
// the accompaniment loop (#pr-along), started and stopped by the Start button.
type PracticeMode = 'play' | 'ear' | 'keys' | 'along' | 'tech';
// The five unified Practice topic cards (Scales combines theory drills + Technique fingerings).
const PR_TOPICS: readonly string[] = ['interval', 'chord', 'scale', 'prog', 'melody'];
const PR_KEYS: readonly string[] = ['all', ...Array.from({ length: 12 }, (_, i) => String(i))];
// A small glyph per topic card (24 × 24, drawn in currentColor).
const PR_GLYPH: Record<string, string> = {
    interval: '<ellipse cx="7.5" cy="17" rx="3.4" ry="2.5" fill="currentColor"/><ellipse cx="16.5" cy="7" rx="3.4" ry="2.5" fill="currentColor"/><path d="M9.5 14.6 14.5 9.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="1.5 2.4"/>',
    chord: '<ellipse cx="12" cy="5.5" rx="3.6" ry="2.5" fill="currentColor"/><ellipse cx="12" cy="12" rx="3.6" ry="2.5" fill="currentColor"/><ellipse cx="12" cy="18.5" rx="3.6" ry="2.5" fill="currentColor"/>',
    scale: '<circle cx="4.5" cy="19" r="2.4" fill="currentColor"/><circle cx="9.5" cy="14.5" r="2.4" fill="currentColor"/><circle cx="14.5" cy="10" r="2.4" fill="currentColor"/><circle cx="19.5" cy="5.5" r="2.4" fill="currentColor"/>',
    prog: '<rect x="2.5" y="9" width="5" height="11" rx="1.4" fill="currentColor"/><rect x="9.5" y="4" width="5" height="16" rx="1.4" fill="currentColor" opacity=".7"/><rect x="16.5" y="11" width="5" height="9" rx="1.4" fill="currentColor"/>',
    melody: '<path d="M8.5 17.5V6.2l11-2.4v11.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><ellipse cx="6" cy="17.6" rx="3" ry="2.3" fill="currentColor"/><ellipse cx="17" cy="15.4" rx="3" ry="2.3" fill="currentColor"/>',
};
let practiceModePref: PracticeMode = 'play';
let prIvDir: IntervalDirection = 'asc';
let prIvStyle: IntervalStyle = 'both';
let prChordTier: ChordTier = 'triads';
let prScaleTier: ScaleTier = 'core';
let prMelDiff: MelodyDifficulty = 'easy';
let prMelLen: number | 'auto' = 'auto';
let prMelScale: string = 'auto';
let prProgLastDrill: 'play' | 'ear' = 'play';
let melDemoTimer: number | undefined;
let melDemoPlaying = false;

function isPracticeMode(v: string | undefined): v is PracticeMode { return v === 'play' || v === 'ear' || v === 'keys' || v === 'along' || v === 'tech'; }
function prTopicLabel(cat: string) { return cat === 'melody' ? t('cat_melody') : (cat === 'scale' || cat === TECHNIQUE_TOPIC) ? t('cat_technique') : catLabel(cat); }
function prModeLabel(mode: PracticeMode, cat = prChoice().cat) {
    if (mode === 'tech') return t('pr_m_sc_tech');
    if (mode === 'along') return t('pr_along');
    if (mode === 'keys') return t('pr_onkeys');
    if (cat === 'interval') return t(mode === 'ear' ? 'pr_m_iv_ear' : 'pr_m_iv_play');
    if (cat === 'chord') return t(mode === 'ear' ? 'pr_m_ch_ear' : 'pr_m_ch_play');
    if (cat === 'scale') return t(mode === 'ear' ? 'pr_m_sc_ear' : 'pr_m_sc_play');
    if (cat === 'prog') return t(mode === 'ear' ? 'pr_m_pr_ear' : 'pr_m_pr_play');
    return t(mode === 'ear' ? 'pr_byear' : 'pr_playit');
}
function prKeyLabel(key: string | null | undefined) { return key == null || key === '' || key === 'all' ? t('all_keys') : rootName(+key || 0); }

function normalizePracticeTopic(raw: string): string { return raw === TECHNIQUE_TOPIC ? 'scale' : raw; }
/** The chosen topic, mode and key. Melodies are always on the keys; scales support technique, ear, or play. */
function prChoice(): { cat: string; mode: PracticeMode; key: string } {
    const rawCat = selectById('pr-cat').value;
    const cat = normalizePracticeTopic(rawCat);
    const v = queryHtml(byId('pr-mode'), 'button[aria-pressed="true"]')?.dataset.v;
    let mode: PracticeMode = 'play';
    if (cat === 'melody') mode = 'keys';
    else if (cat === 'scale') mode = (v === 'tech' || v === 'ear' || v === 'play') ? v : 'tech';
    else if (cat === 'prog') mode = (v === 'along' || v === 'ear' || v === 'play') ? v : prProgLastDrill;
    else mode = isPracticeMode(v) && v !== 'tech' && v !== 'along' ? v : 'play';
    return { cat, mode, key: selectById('pr-key').value || 'all' };
}
function prSetTopic(cat: string) {
    if (cat === TECHNIQUE_TOPIC) {
        selectById('pr-cat').value = 'scale';
        syncPracticeCatAndMode();
        prSetMode('tech');
        return;
    }
    if (!PR_TOPICS.includes(cat))
        return;
    selectById('pr-cat').value = cat;
    syncPracticeCatAndMode();
}
// Picking an ear mode saves the on-keys choice (settings.earKeys); a mode the topic does not allow is ignored.
function prSetMode(v: PracticeMode) {
    const pm = byId('pr-mode'), b = queryHtml(pm, `button[data-v="${v}"]`);
    if (!(b instanceof HTMLButtonElement) || b.disabled)
        return;
    queryAllHtml(pm, 'button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    if (v !== 'along') // Play along is not kept: back on Practice, or from a topic link, the setup offers the last drill mode
        practiceModePref = v;
    if (prChoice().cat === 'prog' && (v === 'play' || v === 'ear'))
        prProgLastDrill = v;
    if (v === 'ear' || v === 'keys') {
        data.settings.earKeys = v === 'keys';
        saveAll();
    }
    syncPracticeProgSplit();
    updatePracticeModeHint();
}
// Play along chosen on the Practice screen, with no drill running: the keys light up there.
function prAlongWanted(v = view0()) { return v === 'practice' && !SES.active && prChoice().mode === 'along'; }
function isIntervalDirection(v: string | undefined): v is IntervalDirection { return v === 'asc' || v === 'desc' || v === 'both'; }
function prDirLabel(dir: IntervalDirection) { return t(dir === 'desc' ? 'dir_desc' : dir === 'both' ? 'dir_both' : 'dir_asc'); }
// Direction applies to Intervals by ear (tap or on the keys): the row shows only then, and only then goes with the drill.
function prDirShown() { const { cat, mode } = prChoice(); return cat === 'interval' && mode !== 'play'; }
function prSetDir(v: string) {
    if (!isIntervalDirection(v))
        return;
    prIvDir = v;
    queryAllHtml(byId('pr-dir'), 'button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'));
    updatePracticeModeHint();
}
function prSetIvStyle(v: string) {
    if (v !== 'both' && v !== 'melodic' && v !== 'harmonic') return;
    prIvStyle = v;
    queryAllHtml(byId('pr-iv-style'), 'button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'));
    const dirWrap = maybeById('pr-dir-wrap');
    if (dirWrap) dirWrap.hidden = v === 'harmonic';
}
function prSetChordTier(v: string) {
    if (v !== 'triads' && v !== 'sevenths' && v !== 'all') return;
    prChordTier = v;
    practiceStudy.chordShowAll = false;
    queryAllHtml(byId('pr-chord-tier'), 'button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'));
    syncPracticeHintsPanel();
}
function prSetScaleTier(v: string) {
    if (v !== 'core' && v !== 'modes' && v !== 'all') return;
    prScaleTier = v;
    practiceStudy.family.scale = v === 'modes' ? 'modes' : v === 'all' ? 'all' : 'core';
    queryAllHtml(byId('pr-scale-tier'), 'button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'));
    syncPracticeHintsPanel();
}
function prSetMelDiff(v: string) {
    if (v !== 'easy' && v !== 'medium' && v !== 'advanced') return;
    prMelDiff = v;
    practiceStudy.family.melody = v;
    queryAllHtml(byId('pr-mel-diff'), 'button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'));
    syncPracticeHintsPanel();
}
function clearMelodyDemoPreview() {
    if (melDemoTimer) { clearTimeout(melDemoTimer); melDemoTimer = undefined; }
    melDemoPlaying = false;
    const btn = maybeById('pr-mel-demo');
    if (btn) {
        btn.setAttribute('aria-pressed', 'false');
        btn.textContent = t('pr_mel_demo');
    }
}
function toggleMelodyDemo() {
    if (melDemoPlaying) { stopPreviews(); return; }
    stopPreviews();
    const ctx = ensureAudio();
    if (!ctx) return;
    const cfg = melodyConfigForSession(prMelDiff, prMelLen, prMelScale);
    const scaleName = cfg.scaleNames[0] ?? 'Major (Ionian)';
    const offs = SCALES[scaleName] ?? SCALES['Major (Ionian)'];
    const keyVal = prChoice().key;
    const key = keyVal === 'all' ? 0 : (+keyVal || 0);
    const ton = theory.practiceTonicMidi(key, 'near-middle-c');
    const N = offs.length;
    const at = (d: number) => ton + offs[((d % N) + N) % N] + 12 * Math.floor(d / N);
    const stable = (d: number) => [0, 3, 4, 7].includes(pc(at(d) - ton));
    let d = 0;
    const ds = [0];
    for (let i = 1; i < cfg.len; i++) {
        const last = i === cfg.len - 1, opts: number[] = [];
        cfg.steps.forEach((s) => {
            const nd = d + s;
            if (nd < -2 || nd > N + 2 || (last && !stable(nd))) return;
            const w = Math.abs(s) === 1 ? cfg.stepWeight : Math.abs(s) === 2 ? 2 : 1;
            for (let k = 0; k < w; k++) opts.push(nd);
        });
        if (!opts.length) opts.push(Math.abs(d) <= Math.abs(N - d) ? 0 : N);
        d = randItem(opts);
        ds.push(d);
    }
    const notes = ds.map(at);
    const playSeq = () => {
        if (!melDemoPlaying || audioEngine.context !== ctx) return;
        const t0 = ctx.currentTime + 0.12;
        previewNote(notes[0], t0, 0.45);
        notes.forEach((m, i) => previewNote(m, t0 + 0.7 + i * 0.45, 0.4));
        const endMs = Math.round((0.7 + notes.length * 0.45 + 0.25) * 1000);
        melDemoTimer = window.setTimeout(() => clearMelodyDemoPreview(), endMs);
    };
    melDemoPlaying = true;
    const btn = maybeById('pr-mel-demo');
    if (btn) {
        btn.setAttribute('aria-pressed', 'true');
        btn.textContent = t('pr_mel_stop');
    }
    if (ctx.state === 'running') { playSeq(); return; }
    void timedAudioReady(ctx).then((ready) => {
        if (!ready || !melDemoPlaying) { clearMelodyDemoPreview(); return; }
        playSeq();
    });
}
function renderPracticeMelodyScales() {
    const sel = maybeById('pr-mel-scale');
    if (!(sel instanceof HTMLSelectElement)) return;
    const prev = sel.value || 'auto';
    const autoOpt = sel.querySelector('option[value="auto"]');
    if (autoOpt) autoOpt.textContent = t('pr_mel_scale_auto');
    while (sel.options.length > 1) sel.remove(1);
    for (const nm of EK_MEL_SCALES) {
        const o = document.createElement('option');
        o.value = nm;
        o.textContent = scaleDisp(nm);
        sel.appendChild(o);
    }
    sel.value = [...sel.options].some((o) => o.value === prev) ? prev : 'auto';
}
function syncPracticeProgSplit() {
    const split = maybeById('pr-prog-split');
    const modeH = maybeById('pr-mode-h');
    const pm = maybeById('pr-mode');
    if (!split || !modeH || !pm) return;
    const { cat, mode } = prChoice();
    const isProg = cat === 'prog';
    const isAlong = isProg && mode === 'along';
    split.hidden = !isProg;
    if (isProg) {
        queryAllHtml(split, '[role="tab"]').forEach((tab) => {
            const on = tab.dataset.v === (isAlong ? 'along' : 'drill');
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
            tab.tabIndex = on ? 0 : -1;
        });
    }
    const hideModeBar = cat === 'melody' || isAlong;
    modeH.hidden = hideModeBar;
    pm.hidden = hideModeBar;
}
function prSetKey(key: string) {
    const sel = selectById('pr-key');
    if (!PR_KEYS.includes(key) || ![...sel.options].some((o) => o.value === key))
        return;
    sel.value = key;
    renderPracticeKeys();
    updatePracticeModeHint();
    if (prChoice().mode === 'along')
        accompRestartIfPlaying(); // updatePracticeModeHint has redrawn the chord chain
}
function prStart() {
    clearMelodyDemoPreview();
    const { cat, mode, key } = prChoice();
    if (mode === 'along') { // not a drill: the loop starts or stops, and no last-drill record is written
        if (accomp.on)
            accompStop();
        else {
            accompSync();
            accompStart();
            updatePracticeModeHint();
        }
        return;
    }
    if (cat === 'scale' && mode === 'tech') {
        practiceModePref = 'tech';
        show('practice');
        startSession({ cat: TECHNIQUE_TOPIC, mode: 'play', key });
        return;
    }
    practiceModePref = mode;
    if (mode !== 'play' && cat !== 'melody') {
        data.settings.earKeys = mode === 'keys';
        saveAll();
    }
    show('practice');
    startSession({
        cat,
        mode: mode === 'play' ? 'play' : 'ear',
        key,
        ...(prDirShown() ? { dir: prIvDir, ...(prIvStyle !== 'both' ? { ivStyle: prIvStyle } : {}) } : {}),
        ...(cat === 'chord' ? { chordTier: prChordTier } : {}),
        ...(cat === 'scale' ? { scaleTier: prScaleTier } : {}),
        ...(cat === 'melody' ? { melDiff: prMelDiff, melLen: prMelLen, melScale: prMelScale } : {}),
    });
}
// Today's Ear check: an Intervals · By ear drill in one tap, on the keys when that is the saved choice (settings.earKeys).
function prEarCheck() {
    if (SES.active)
        return;
    prSetTopic('interval');
    prSetMode(data.settings.earKeys ? 'keys' : 'ear');
    prStart();
}
// A screen that moved into this setup (an old link or saved lastTool): Practice, set up for it.
function prOpenMoved(v: router.MovedView, moveFocus = true, fromHistory = false) {
    if (SES.active && SES.targeted)
        endSession(false);
    show('practice', moveFocus, fromHistory);
    if (v === 'songs') {
        prSetTopic('interval');
        const panel = byId('pr-songs');
        if (panel instanceof HTMLDetailsElement)
            panel.open = true; // its toggle event builds the cards
    }
    else {
        prSetTopic('prog');
        prSetMode('along');
    }
}
// Continue: the last drill again, with its topic, mode and key, in one tap.
// The mode a saved drill ran in. Progressions never run on the keys, whatever the on-keys setting was.
function prDrillMode(d: StoredLastDrill): PracticeMode { return d.cat === 'melody' ? 'keys' : d.mode !== 'ear' ? 'play' : d.keys && d.cat !== 'prog' ? 'keys' : 'ear'; }
function prDrillKey(d: StoredLastDrill) { return PR_KEYS.includes(String(d.key)) ? String(d.key) : 'all'; }
function prContinue() {
    const d = data.lastDrill;
    if (!d)
        return;
    prSetTopic(d.cat);
    if (d.cat !== 'melody') // melodies are always on the keys, and leave the saved ear choice alone
        prSetMode(prDrillMode(d));
    prSetKey(prDrillKey(d));
    if (d.cat === 'interval' && d.mode === 'ear') prSetDir(d.dir ?? 'asc');
    prStart();
}
// Arrow keys, Home and End move through a radio group and select (WAI-ARIA radio group); Space and Enter click.
function prRadioKey(e: KeyboardEvent, pick: (v: string) => void) {
    const group = e.currentTarget, cur = eventClosest(e, '[role=radio]');
    if (!(group instanceof HTMLElement) || !cur)
        return;
    const radios = queryAllHtml(group, '[role=radio]'), i = radios.indexOf(cur), n = radios.length;
    if (i < 0)
        return;
    let to: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
        to = (i + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
        to = (i - 1 + n) % n;
    else if (e.key === 'Home')
        to = 0;
    else if (e.key === 'End')
        to = n - 1;
    else
        return;
    e.preventDefault();
    const next = radios[to];
    if (!next)
        return;
    pick(next.dataset.v ?? '');
    next.focus();
}
// The topic cards (the .focus card look), with mastered counts for the four review topics.
function renderPracticeTopics() {
    const box = maybeById('pr-topics'), sel = maybeById('pr-cat');
    if (!box || !(sel instanceof HTMLSelectElement))
        return;
    if (box.children.length !== PR_TOPICS.length)
        box.innerHTML = PR_TOPICS.map((c) => `<button type="button" role="radio" class="focus pr-topic" id="pr-t-${c}" data-v="${c}" aria-checked="false" tabindex="-1" aria-labelledby="pr-t-${c}-n" aria-describedby="pr-t-${c}-d pr-t-${c}-m"><span class="pr-topic-top"><svg class="pr-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PR_GLYPH[c] ?? ''}</svg><span class="k" id="pr-t-${c}-n"></span></span><span class="m" id="pr-t-${c}-d"></span><span class="pr-mast" id="pr-t-${c}-m"></span></button>`).join('');
    const cat = PR_TOPICS.includes(sel.value) ? sel.value : PR_TOPICS[0];
    PR_TOPICS.forEach((c) => {
        const card = byId('pr-t-' + c), on = c === cat, mast = byId('pr-t-' + c + '-m');
        card.setAttribute('aria-checked', on ? 'true' : 'false');
        card.tabIndex = on ? 0 : -1;
        byId('pr-t-' + c + '-n').textContent = prTopicLabel(c);
        if (c === 'chord') {
            const exMin = notation === 'solfege' ? `${rootName(0)} ${chordDisp('m').toLowerCase()}` : formatChord(rootName(0), 'm');
            const exDom7 = formatChord(rootName(7), '7');
            byId('pr-t-' + c + '-d').textContent = t('pr_d_chord', exMin, exDom7);
        }
        else {
            byId('pr-t-' + c + '-d').textContent = t('pr_d_' + c);
        }
        if (isCatKey(c)) {
            const items = ITEMS.filter((it) => it.cat === c), mastered = items.filter((it) => boxOf(it.id) >= 4).length;
            mast.innerHTML = '<span class="bar"><i style="width:' + (items.length ? Math.round(100 * mastered / items.length) : 0) + '%"></i></span><span class="pr-mast-t">' + rdEsc(t('pr_mastered', mastered, items.length)) + '</span>';
            mast.hidden = false;
        }
        else {
            mast.textContent = '';
            mast.hidden = true;
        }
    });
}
// The key chips: All keys and the 12 roots, in the chosen note names. On a phone the row scrolls sideways.
function renderPracticeKeys() {
    const box = maybeById('pr-keys'), sel = maybeById('pr-key');
    if (!box || !(sel instanceof HTMLSelectElement))
        return;
    if (box.children.length !== PR_KEYS.length)
        box.innerHTML = PR_KEYS.map((k) => `<button type="button" role="radio" class="pr-chip" data-v="${k}" aria-checked="false" tabindex="-1"></button>`).join('');
    const key = sel.value || 'all';
    queryAllHtml(box, '[role=radio]').forEach((b) => {
        const v = b.dataset.v ?? 'all', is = v === key;
        b.textContent = prKeyLabel(v);
        b.setAttribute('aria-checked', is ? 'true' : 'false');
        b.tabIndex = is ? 0 : -1;
    });
    const chip = queryHtml(box, '[aria-checked="true"]');
    if (chip && box.clientWidth && box.scrollWidth > box.clientWidth && (chip.offsetLeft < box.scrollLeft || chip.offsetLeft + chip.offsetWidth > box.scrollLeft + box.clientWidth))
        box.scrollLeft = chip.offsetLeft - (box.clientWidth - chip.offsetWidth) / 2;
}

// One line on what the chosen mode asks of you, contextual options, and the Start label.
function updatePracticeModeHint() {
    const hint = maybeById('pr-mode-hint'), note = maybeById('pr-mode-note'), start = maybeById('pr-start');
    if (!hint || !note || !start || !maybeById('pr-cat') || !maybeById('pr-mode'))
        return;
    const { cat, mode, key } = prChoice(), tech = cat === 'scale' && mode === 'tech';
    hint.textContent = tech ? t('tq_pr_hint') : t(mode === 'keys' ? 'pr_hint_keys' : mode === 'ear' ? 'pr_hint_ear' : 'pr_hint_play');
    const why = tech ? t('tq_pr_note') : '';
    note.textContent = why;
    note.hidden = !why;
    const dirShown = prDirShown(), along = mode === 'along';
    byId('pr-dir-row').hidden = !dirShown;
    const dirWrap = maybeById('pr-dir-wrap');
    if (dirWrap) dirWrap.hidden = prIvStyle === 'harmonic';
    const chordCfg = maybeById('pr-chord-cfg');
    if (chordCfg) chordCfg.hidden = cat !== 'chord';
    const scaleCfg = maybeById('pr-scale-cfg');
    if (scaleCfg) scaleCfg.hidden = cat !== 'scale' || tech;
    const melCfg = maybeById('pr-mel-cfg');
    if (melCfg) melCfg.hidden = cat !== 'melody';
    if (cat !== 'melody' && melDemoPlaying) clearMelodyDemoPreview();
    if (cat !== 'interval' && songBook.isPreviewing()) stopPreviews();
    byId('pr-along').hidden = byId('pr-along-out').hidden = !along;
    if (along) {
        hint.textContent = t('ac_lede') + (key === 'all' ? ' ' + t('pr_along_c', rootName(0)) : '');
        renderAccompany();
        paintAccompImproScale();
    }
    else {
        clearAccompImproScale();
        if (accomp.on) accompStop(); // another topic or mode: the loop stops
    }
    start.textContent = along
        ? t(accomp.on ? 'ac_stop' : 'ac_play')
        : cat === 'melody'
            ? t('pr_start_sel', [prTopicLabel(cat), t('pr_mel_' + prMelDiff), prKeyLabel(key)].join(' · '))
            : t('pr_start_sel', [prTopicLabel(cat), prModeLabel(mode, cat), ...(dirShown && prIvStyle !== 'harmonic' ? [prDirLabel(prIvDir)] : []), prKeyLabel(key)].join(' · '));
    syncPracticeHintsPanel();
    dockSync(); // Play along brings the keys
    syncMobileStartBars();
}

function syncPracticeCatAndMode() {
    const catEl = byId('pr-cat');
    const pm = byId('pr-mode');
    if (!catEl || !pm) return;
    if ((catEl as HTMLSelectElement).value === TECHNIQUE_TOPIC) (catEl as HTMLSelectElement).value = 'scale';
    const cat = (catEl as HTMLSelectElement).value;
    const mel = cat === 'melody';
    const prog = cat === 'prog';
    const scale = cat === 'scale';

    const labelKey = (v: string): string => {
        if (v === 'tech') return 'pr_m_sc_tech';
        if (v === 'keys') return 'pr_onkeys';
        if (v === 'along') return 'pr_along';
        if (cat === 'interval') return v === 'ear' ? 'pr_m_iv_ear' : 'pr_m_iv_play';
        if (cat === 'chord') return v === 'ear' ? 'pr_m_ch_ear' : 'pr_m_ch_play';
        if (cat === 'scale') return v === 'ear' ? 'pr_m_sc_ear' : 'pr_m_sc_play';
        if (cat === 'prog') return v === 'ear' ? 'pr_m_pr_ear' : 'pr_m_pr_play';
        return v === 'ear' ? 'pr_byear' : 'pr_playit';
    };

    queryAllHtml(pm, ':scope > *').forEach((x) => {
        if (x instanceof HTMLButtonElement) {
            const v = x.dataset.v ?? '';
            x.textContent = t(labelKey(v));
            const hidden = mel
                ? v !== 'keys'
                : scale
                    ? (v === 'keys' || v === 'along')
                    : prog
                        ? (v === 'tech' || v === 'keys' || v === 'along')
                        : (v === 'tech' || v === 'along');
            const dis = (mel && v !== 'keys')
                || (scale && (v === 'keys' || v === 'along'))
                || (prog && (v === 'tech' || v === 'keys'))
                || (!prog && !scale && (v === 'tech' || v === 'along'));
            x.disabled = dis;
            x.hidden = hidden;
        }
    });

    const curPressed = queryHtml(pm, 'button[aria-pressed="true"]')?.dataset.v;
    let targetV: PracticeMode;
    if (mel) targetV = 'keys';
    else if (scale) targetV = (practiceModePref === 'tech' || practiceModePref === 'ear' || practiceModePref === 'play') ? practiceModePref : 'tech';
    else if (prog) targetV = curPressed === 'along' ? 'along' : (practiceModePref === 'ear' || practiceModePref === 'keys') ? 'ear' : prProgLastDrill;
    else targetV = (practiceModePref === 'play' || practiceModePref === 'ear' || practiceModePref === 'keys') ? practiceModePref : (data.settings.earKeys ? 'keys' : 'play');

    let selected = false;
    queryAllHtml(pm, 'button').forEach((b) => {
        const btn = b as HTMLButtonElement;
        const isMatch = btn.dataset.v === targetV && !btn.disabled;
        if (isMatch) selected = true;
        btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
    });

    if (!selected) {
        const fallback = pm.querySelector('button:not(:disabled)');
        if (fallback instanceof HTMLButtonElement) {
            queryAllHtml(pm, 'button').forEach((b) => b.setAttribute('aria-pressed', b === fallback ? 'true' : 'false'));
        }
    }

    const chordInvEl = maybeById('pr-chord-inv');
    if (chordInvEl instanceof HTMLInputElement) chordInvEl.checked = !!data.settings.allowInv;
    renderPracticeMelodyScales();
    renderPracticeTopics();
    renderPracticeKeys();
    syncPracticeProgSplit();
    updatePracticeModeHint();
}
// The whole setup screen in the current language and note names (applyI18n, applyNotation).
function applyPracticeModeLabels() {
    const pm = maybeById('pr-mode'), catEl = maybeById('pr-cat');
    if (!pm || !(catEl instanceof HTMLSelectElement)) return;
    const cat = normalizePracticeTopic(catEl.value);
    queryAllHtml(pm, 'button').forEach((btn) => {
        const v = btn.dataset.v;
        if (isPracticeMode(v)) btn.textContent = prModeLabel(v, cat);
    });
}
function renderPracticeSetup() {
    applyPracticeModeLabels();
    renderPracticeTopics();
    renderPracticeKeys();
    syncPracticeProgSplit();
    updatePracticeModeHint();
    renderPracticeLast();
}

// After a drill: the contrast offer when it shows (its Start button, else its text), else the Last drill strip's button.
function prFocusAfterDrill() {
    const offer = maybeById('ses-contrast'), go = maybeById('cf-start');
    if (offer && !offer.hidden) {
        if (go && offer.contains(go))
            go.focus();
        else {
            offer.tabIndex = -1;
            offer.focus();
        }
    }
    else
        byId(byId('pr-last').hidden ? 'pr-start' : 'pr-redo').focus();
}
function renderPracticeLast() {
    const el = maybeById('pr-last'), txt = maybeById('pr-last-txt');
    if (!el || !txt)
        return;
    const d = data.lastDrill;
    if (!d || !d.n || (!(isCatKey(d.cat) && CATS[d.cat]) && d.cat !== 'melody')) {
        el.hidden = true;
        return;
    }
    const pct = Math.round(100 * d.c / d.n), mode = prDrillMode(d);
    el.hidden = false;
    txt.innerHTML = rdEsc(t('pr_last', [prTopicLabel(d.cat), prModeLabel(mode, d.cat), prKeyLabel(prDrillKey(d))].join(' · '))) + ' — <b class="' + (pct >= 80 ? 'good' : 'neutral') + '">' + rdEsc(t('pr_last_res', d.c, d.n) + ' (' + pct + '%)') + '</b>';
}
/* ---------- SUMMARY ---------- */
function showSummary(..._args: unknown[]) {
    byId('summary').style.display = 'block';
    byId('today-home').style.display = 'none';
    const acc = SES.total ? Math.round(100 * SES.correct / SES.total) : 0;
    byId('sum-acc').textContent = acc + '%';
    byId('sum-rev').textContent = String(SES.total);
    byId('sum-streak').textContent = String(currentStreak());
    const r = byId('sum-ring');
    const C = 2 * Math.PI * 52;
    r.innerHTML = '<circle cx="60" cy="60" r="52" fill="none" stroke="var(--line)" stroke-width="9"/><circle cx="60" cy="60" r="52" fill="none" stroke="var(--accent)" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + (C * (1 - acc / 100)) + '" transform="rotate(-90 60 60)"/><text x="60" y="60" text-anchor="middle" dy=".35em" font-family="var(--script)" font-weight="400" font-size="38" fill="var(--ink)">' + acc + '%</text>';
    if (SES.placement || arguments[0]) {
        byId('sum-title').textContent = t('sum_place');
        byId('sum-note').textContent = t('sum_placenote', SES.correct, SES.total);
    }
    else {
        byId('sum-title').textContent = t('sum_welldone');
        const dueLeft = dueItems().length;
        byId('sum-note').textContent = dueLeft ? t('sum_more', dueLeft) : t('sum_caught');
    }
}
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
        if (isRecord(data.reading?.book)) rdnNormalized.delete(data.reading.book);
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
function syncBusy() { return SES.active || SR.active || RD.on || accomp.on || anyLoadedFeatureBusy(); }
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
    if (view0() === 'today' && !SES.active)
        refreshToday();
    else if (view0() === 'progress')
        renderProgress();
    else if (view0() === 'practice' && !SES.active)
        renderPracticeSetup();
    else if (view0() === 'read' && !byId('rdn-home').hidden)
        rdnRenderHome(false);
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
    SR.anyOctave = !!data.settings.anyOctave;
    const rdOct = maybeById('rd-any-octave');
    if (rdOct instanceof HTMLInputElement)
        rdOct.checked = !!data.settings.anyOctave;
    SR.instantFeedback = !!data.reading?.prefs?.instantFeedback;
    const rdInstant = maybeById('rd-instant');
    if (rdInstant instanceof HTMLInputElement)
        rdInstant.checked = SR.instantFeedback;
    selectById('set-goal').value = String(data.settings.goal);
    selectById('set-new').value = String(data.settings.newPerDay);
    queryAllHtml(document, '#set-notation button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === notation ? 'true' : 'false'));
    queryAllHtml(document, '#set-lang button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === lang ? 'true' : 'false'));
    if (data.lastDrill) {
        if (data.lastDrill.cat === 'melody') practiceModePref = 'keys';
        else if (data.lastDrill.mode === 'ear') practiceModePref = data.lastDrill.keys ? 'keys' : 'ear';
        else practiceModePref = 'play';
    } else if (data.settings.earKeys) {
        practiceModePref = 'keys';
    }
    syncPracticeCatAndMode();
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
        srtRecorder?.releaseAll('focus', performance.now() - SR.t0);
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
        if (o) srtRecorder?.releaseAll('focus', performance.now() - SR.t0);
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
    renderPracticeSetup();
    localizeLoadedFeatures();
    buildKeyboard();
    repaintHeld();
    if (view0() === 'practice')
        updateAccompChain();
    if (view0() === 'read' && SR.piece) {
        // Leave the active score and its cursor intact until the assessment ends.
        if (!SR.active && !srtEligibleFirstSightActive()) srDraw();
        srMeta();
    }
    scorePlayer?.relocalize();
    refreshSessionCopy();
    const labelCBtn = document.querySelector('#set-labels button[data-v="c"]');
    if (labelCBtn) labelCBtn.textContent = notation === 'solfege' ? 'Do' : 'C';
    rdOnLocale();
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
    byId('rd-focus-fit').addEventListener('click', () => { readScoreZoom(1); srFit(); });
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
    window.addEventListener('resize', stageResize);
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
    byId('startBtn').addEventListener('click', () => startSession(null));
    byId('placeBtn').addEventListener('click', startPlacement);
    const goMethod = (e: Event) => { e.preventDefault(); show('method'); };
    byId('whyLink').addEventListener('click', goMethod);
    byId('footMethod').addEventListener('click', goMethod);
    byId('method-start').addEventListener('click', () => { show('today'); startSession(null); });
    byId('ses-end').addEventListener('click', () => endSession(true));
    byId('q-next').addEventListener('click', () => { if (!SES.targeted)
        SES.idx++; nextQuestion(); });
    byId('q-reveal').addEventListener('click', () => { const q = SES.q; if (!q || SES.answered)
        return; q.missed = true; revealAnswerKeys(q); if (q.mode === 'ear')
        markEarCorrect(q); resolve(q, false); });
    byId('q-replay').addEventListener('click', () => { const q = SES.q; if (q)
        playQuestionSound(q); });
    byId('q-ekreset').addEventListener('click', ekReset);
    byId('q-ansmode').addEventListener('click', (e) => {
        const b = eventClosest(e, 'button[data-v]'), q = SES.q;
        if (!b)
            return;
        const on = b.dataset.v === 'keys';
        if (!!data.settings.earKeys === on)
            return;
        data.settings.earKeys = on;
        practiceModePref = on ? 'keys' : 'ear';
        saveAll();
        if (!q)
            return;
        if (SES.answered || q.mode !== 'ear') {
            ekToggleSync(q);
            dockSync();
            return;
        }
        ekStop(q);
        kbClear('target');
        kbClear('good');
        kbClear('bad');
        byId('q-verdict').textContent = '';
        byId('q-verdict').className = 'verdict';
        presentQuestion(q);
    });
    byId('sum-again').addEventListener('click', () => { byId('summary').style.display = 'none'; startSession(null); });
    byId('sum-done').addEventListener('click', () => { byId('summary').style.display = 'none'; show('today'); });
    // practice
    byId('pr-mode').addEventListener('click', (e) => {
        const b = eventClosest(e, 'button');
        if (!b || wiringDisabled(b)) return;
        const v = b.dataset.v;
        if (isPracticeMode(v)) prSetMode(v);
    });
    maybeById('pr-prog-split')?.addEventListener('click', (e) => {
        const b = eventClosest(e, '[role="tab"]');
        if (!b) return;
        prSetMode(b.dataset.v === 'along' ? 'along' : prProgLastDrill);
    });
    byId('pr-cat').addEventListener('change', syncPracticeCatAndMode);
    byId('pr-key').addEventListener('change', () => { renderPracticeKeys(); updatePracticeModeHint(); });
    byId('pr-topics').addEventListener('click', (e) => { const r = eventClosest(e, '[role=radio]'); if (r?.dataset.v) prSetTopic(r.dataset.v); });
    byId('pr-topics').addEventListener('keydown', (e) => prRadioKey(e, prSetTopic));
    byId('pr-keys').addEventListener('click', (e) => { const r = eventClosest(e, '[role=radio]'); if (r?.dataset.v) prSetKey(r.dataset.v); });
    byId('pr-keys').addEventListener('keydown', (e) => prRadioKey(e, prSetKey));
    byId('pr-start').addEventListener('click', prStart);
    maybeById('pr-mobile-start')?.addEventListener('click', () => { byId('pr-start').click(); });
    byId('pr-redo').addEventListener('click', prContinue);
    byId('pr-dir').addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-v]'); if (b) prSetDir(b.dataset.v ?? ''); });
    maybeById('pr-iv-style')?.addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-v]'); if (b) prSetIvStyle(b.dataset.v ?? ''); });
    maybeById('pr-chord-tier')?.addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-v]'); if (b) prSetChordTier(b.dataset.v ?? ''); });
    maybeById('pr-chord-inv')?.addEventListener('change', (e) => {
        const checked = wiringInput(e).checked;
        data.settings.allowInv = checked;
        inputById('set-inv').checked = checked;
        saveAll();
    });
    maybeById('pr-scale-tier')?.addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-v]'); if (b) prSetScaleTier(b.dataset.v ?? ''); });
    maybeById('pr-mel-diff')?.addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-v]'); if (b) prSetMelDiff(b.dataset.v ?? ''); updatePracticeModeHint(); });
    maybeById('pr-mel-len')?.addEventListener('change', (e) => { const v = wiringField(e).value; prMelLen = v === 'auto' ? 'auto' : (+v || 'auto'); });
    maybeById('pr-mel-scale')?.addEventListener('change', (e) => { prMelScale = wiringField(e).value || 'auto'; });
    maybeById('pr-mel-demo')?.addEventListener('click', toggleMelodyDemo);
    // accompaniment
    accompaniment.wireControls();
    // read & play (sheet music)
    byId('rd-to-pieces').addEventListener('click', () => show('analysis'));
    const onHandsClick = (e: MouseEvent) => {
        const b = eventClosest(e, 'button');
        if (!b || wiringDisabled(b) || srtPendingSaveProtected())
            return;
        const v = b.dataset.v ?? SR.hands;
        SR.hands = v;
        [byId('rd-hands'), maybeById('rd-stage-hands')].forEach((container) => {
            if (!container)
                return;
            [...container.children].forEach((x) => {
                if (x instanceof HTMLElement)
                    x.setAttribute('aria-pressed', x.dataset.v === v ? 'true' : 'false');
            });
        });
        rdnHandsHint();
        if (!SR.piece)
            return; // no melody yet: the choice applies to the next one
        const staffEl = maybeById('rd-staff');
        if (staffEl)
            staffEl.dataset.activeHand = srActiveHands();
        srStopAll();
        srStepsBuild();
        srPaintAll();
        srTargets();
        srCoach();
        byId('rd-verdict').textContent = '';
    };
    byId('rd-hands').addEventListener('click', onHandsClick);
    maybeById('rd-stage-hands')?.addEventListener('click', onHandsClick);
    for (const id of srModeControls) {
        byId(id).addEventListener('click', (e) => {
            const mode = eventClosest(e, 'button')?.dataset.v;
            if (mode === 'learn' || mode === 'assess')
                srSetMode(mode);
        });
    }
    byId('rd-names').addEventListener('change', (e) => {
        if (srtPendingSaveProtected()) {
            wiringInput(e).checked = SR.names;
            return;
        }
        SR.names = wiringInput(e).checked;
        if (srtEligibleFirstSightActive()) {
            srDraw();
            return;
        }
        srStopAll();
        srDraw();
    });
    maybeById('rd-any-octave')?.addEventListener('change', (e) => {
        const checked = wiringInput(e).checked;
        data.settings.anyOctave = checked;
        SR.anyOctave = checked;
        if (SR.active && SR.modeSel === 'assess' && SR.instantFeedback) {
            const nowMs = performance.now() - SR.t0;
            srInstantTracker = createInstantFeedbackTracker(srInstantNotes().filter((n) => SR.results[n.nid] === undefined && n.onMs >= nowMs - 250), { anyOctave: checked });
        }
        const setOct = maybeById('set-any-octave');
        if (setOct instanceof HTMLInputElement)
            setOct.checked = checked;
        saveAll();
    });
    maybeById('rd-instant')?.addEventListener('change', (e) => {
        const checked = wiringInput(e).checked;
        rdData().prefs.instantFeedback = checked;
        SR.instantFeedback = checked;
        if (SR.active && SR.modeSel === 'assess') {
            if (checked) {
                const nowMs = performance.now() - SR.t0;
                srInstantTracker = createInstantFeedbackTracker(srInstantNotes().filter((n) => SR.results[n.nid] === undefined && n.onMs >= nowMs - 250), { anyOctave: SR.anyOctave });
            }
            else {
                srInstantReset();
                SR.results = {};
                SR.wrongExtra = 0;
                srPaintAll();
                kbClear('good');
                kbClear('bad');
                if (SR.assessOn) {
                    const v = byId('rd-verdict');
                    v.className = 'verdict neutral';
                    v.textContent = t('rd_play');
                }
            }
        }
        saveAll();
    });
    const tempo = inputById('rd-bpm');
    const syncTempo = () => {
        if (srtPendingSaveProtected() || SR.active || SR.listening) {
            tempo.value = String(SR.bpm);
            return;
        }
        SR.bpm = tempo.valueAsNumber;
        byId('rd-bpmLbl').textContent = tempo.value;
        syncMobileStartBars();
    };
    tempo.addEventListener('input', syncTempo);
    byId('rd-bpm-down').addEventListener('click', () => {
        tempo.stepDown();
        syncTempo();
    });
    byId('rd-bpm-up').addEventListener('click', () => {
        tempo.stepUp();
        syncTempo();
    });
    byId('rd-go').addEventListener('click', srGo);
    maybeById('rd-mobile-start')?.addEventListener('click', () => { byId('rd-go').click(); });
    maybeById('rd-stage-end')?.addEventListener('click', () => {
        srGo();
        if (!SR.active)
            byId('rd-go').focus({ preventScroll: true });
    });
    byId('rd-srt-start').addEventListener('click', () => srtStartClaimedAttempt());
    byId('rd-srt-practice').addEventListener('click', () => { void srtSwitchToPractice(); });
    byId('rd-srt-retry').addEventListener('click', () => { void srtRetryPendingSave(); });
    byId('rd-srt-continue').addEventListener('click', srtContinueWithoutSave);
    byId('rd-coach').addEventListener('click', (e) => { if (eventClosest(e, '#rd-coach-act') && SR.next && SR.next.act)
        SR.next.act.run(); });
    byId('rd-listen').addEventListener('click', srListen);
    maybeById('rd-warm-tonic')?.addEventListener('click', rdWarmPlayTonic);
    maybeById('rd-warm-scale')?.addEventListener('click', rdWarmPracticeScale);
    // voice / transcribe / sight-singing (wired lazily on mount in src/features/voice/index.ts)
    // The sight-reading and rhythm staves are laid out for the size of their paper (see SrLayout).
    if (typeof ResizeObserver === 'function') {
        let fitRaf = 0;
        const fit = new ResizeObserver(() => { cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(() => { srFit(); rdRhFit(); }); });
        ['rd-staff', 'rdx-body', 'dock'].forEach((id) => { const el = maybeById(id); if (el) fit.observe(el); });
    }
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
    songBook.wireControls(syncPracticeHintsPanel);
    // progress
    byId('prog-report-csv').addEventListener('click', () => {
        void (async () => {
            const reportModule = progressView;
            if (!reportModule) return;
            const libraryItems = await scoreLibraryStore.libraryList().catch(() => []);
            const report = collectPracticeReport(reportModule.buildPracticeReport, libraryItems);
            const csv = reportModule.formatPracticeReportCsv(report, {
                title: t('prog_rep_title'),
                secSummary: t('prog_rep_sec_summary'),
                secTopics: t('prog_rep_sec_topics'),
                secWeak: t('prog_rep_sec_weak'),
                secReading: t('prog_rep_sec_reading'),
                secPieces: t('prog_rep_sec_pieces'),
                period7d: t('prog_rep_period', 7),
                period30d: t('prog_rep_period', 30),
                dateLabel: t('prog_rep_date'),
                streakLabel: t('st_streak'),
                bestStreakLabel: t('st_best'),
                masteredLabel: t('st_mastered'),
                reviewsLabel: t('st_reviews'),
                accuracyLabel: t('st_acc'),
                categoryCol: t('cat_col'),
                conceptCol: t('prog_rep_concept'),
                repsCol: t('prog_rep_reps'),
                masteryCol: t('mastery_head'),
                readingLevelCol: t('rd_level'),
                readingBookCol: t('prog_rep_book'),
                readingPiecesCol: t('rdn_stat_read'),
                readingDrillsCol: t('rdx_st_ans'),
                readingStarsCol: t('rdx_hero_stars'),
                pieceCol: t('nav_scores'),
                sourceCol: t('prog_rep_source'),
                sourceBuiltin: t('prog_rep_builtin'),
                sourceLibrary: t('prog_rep_library'),
                learnedCol: t('prog_rep_learned'),
                bestCol: t('prog_rep_best_col'),
                yes: t('yes_word'),
                no: t('no_word'),
                standingLabel: t('prog_ms_head'),
                standingValue: standingLabelOf(report),
            });
            downloadBlob(`etude-practice-report-${report.generatedDateIso}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        })();
    });
    byId('prog-report-print').addEventListener('click', () => {
        void (async () => {
            const reportModule = progressView;
            if (!reportModule) return;
            const libraryItems = await scoreLibraryStore.libraryList().catch(() => []);
            updatePrintSummaryHead(reportModule.buildPracticeReport, libraryItems);
            if (typeof window.print === 'function')
                window.print();
        })();
    });
    byId('prog-export').addEventListener('click', () => byId('exportBtn').click());
    byId('prog-import').addEventListener('click', () => byId('importBtn').click());
    byId('prog-start').addEventListener('click', () => { show('today'); startSession(null); });
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
        SR.anyOctave = checked;
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
            if (view0() === 'read' && SR.piece)
                srDraw();
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
  "rdnRecord": () => rdnRecord,
  "LP": () => LP,
  "_modalAfterBack": () => _modalAfterBack,
  "_modalBackPending": () => _modalBackPending,
  "_noiseBuf": () => _noiseBuf,
  "_routed": () => _routed,
  "_saveT": () => _saveT,
  "_view": () => _view,
  "acChainHL": () => accompaniment.chainHL,
  "accompHL": () => accompaniment.hl,
  "accompKey": () => accompaniment.key,
  "accompRestartIfPlaying": () => accompRestartIfPlaying,
  "accompStart": () => accompStart,
  "accompStop": () => accompStop,
  "accompSync": () => accompSync,
  "accompTick": () => accompaniment.tick,
  "accompTimer": () => accompaniment.timer,
  "accompVoicing": () => accompaniment.voicing,
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
  "answerEar": () => answerEar,
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
  "buildAccomp": () => accompaniment.build,
  "buildKeyboard": () => buildKeyboard,
  "buildQueue": () => buildQueue,
  "catLabel": () => catLabel,
  "chooseView": () => chooseView,
  "chordDegreeMap": () => chordDegreeMap,
  "chordDisp": () => chordDisp,
  "chordEarOptions": () => chordEarOptions,
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
  "countEarAnswer": () => countEarAnswer,
  "earRoot": () => earRoot,
  "ekBuild": () => ekBuild,
  "ekCh": () => ekCh,
  "ekElab": () => ekElab,
  "ekFlash": () => ekFlash,
  "ekFlat": () => ekFlat,
  "ekForced": () => ekForced,
  "ekIv": () => ekIv,
  "ekMel": () => ekMel,
  "ekMiss": () => ekMiss,
  "ekName": () => ekName,
  "ekOff": () => ekOff,
  "ekOn": () => ekOn,
  "ekPlay": () => ekPlay,
  "ekProg": () => ekProg,
  "ekReset": () => ekReset,
  "ekSound": () => ekSound,
  "ekStop": () => ekStop,
  "ekToggleSync": () => ekToggleSync,
  "ekUiReset": () => ekUiReset,
  "ekWanted": () => ekWanted,
  "ekWin": () => ekWin,
  "endSession": () => endSession,
  "ensureAudio": () => ensureAudio,
  "evalTimer": () => evalTimer,
  "feelDisp": () => feelDisp,
  "fillRoots": () => fillRoots,
  "focusView": () => focusView,
  "foldToView": () => foldToView,
  "freshData": () => freshData,
  "fsCan": () => fsCan,
  "fsToggle": () => fsToggle,
  "fsUi": () => fsUi,
  "gradeChord": () => gradeChord,
  "gradeInterval": () => gradeInterval,
  "gradeProgChord": () => gradeProgChord,
  "gradeScaleNote": () => gradeScaleNote,
  "greeting": () => greeting,
  "handleNoteOff": () => handleNoteOff,
  "handleNoteOn": () => handleNoteOn,
  "heldMidis": () => heldMidis,
  "heldPcs": () => heldPcs,
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
  "makeQuestion": () => makeQuestion,
  "makeVoice": () => makeVoice,
  "markEarCorrect": () => markEarCorrect,
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
  "neutral": () => neutral,
  "newItemsAvail": () => newItemsAvail,
  "newQuotaLeft": () => newQuotaLeft,
  "nextQuestion": () => nextQuestion,
  "noiseBuffer": () => noiseBuffer,
  "notation": () => notation,
  "noteName": () => noteName,
  "onInputChange": () => onInputChange,
  "onMidiMessage": () => onMidiMessage,
  "onStateChange": () => onStateChange,
  "openDrawer": () => openDrawer,
  "openHelp": () => openHelp,
  "openMobileMenu": () => openMobileMenu,
  "openSessionUI": () => openSessionUI,
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
  "pickTargetedItem": () => pickTargetedItem,
  "playChordMidis": () => playChordMidis,
  "playInterval": () => playInterval,
  "playIvDir": () => playIvDir,
  "playProg": () => playProg,
  "playQuestionSound": () => playQuestionSound,
  "playScaleNotes": () => playScaleNotes,
  "popModalState": () => popModalState,
  "positionBlacks": () => positionBlacks,
  "prAlongWanted": () => prAlongWanted,
  "prChoice": () => prChoice,
  "prEarCheck": () => prEarCheck,
  "prFocusAfterDrill": () => prFocusAfterDrill,
  "prOpenMoved": () => prOpenMoved,
  "prRecordDrill": () => prRecordDrill,
  "prSetDir": () => prSetDir,
  "prSetKey": () => prSetKey,
  "prSetTopic": () => prSetTopic,
  "preparePiano": () => preparePiano,
  "presentEar": () => presentEar,
  "presentEarKeys": () => presentEarKeys,
  "presentPlay": () => presentPlay,
  "presentQuestion": () => presentQuestion,
  "previewNote": () => previewNote,
  "previewVoices": () => audioEngine.previewVoices,
  "progChordTpl": () => progChordTpl,
  "pushModalState": () => pushModalState,
  "pwaInit": () => pwaInit,
  "pwaInstall": () => pwaInstall,
  "pwaStandalone": () => pwaStandalone,
  "pwaUi": () => pwaUi,
  "randItem": () => randItem,
  "rdAbort": () => rdAbort,
  "rdAccSym": () => rdAccSym,
  "rdAgg": () => rdAgg,
  "rdAnsText": () => rdAnsText,
  "rdAnswer": () => rdAnswer,
  "rdBack": () => rdBack,
  "rdBars": () => rdBars,
  "rdBeatX": () => rdBeatX,
  "rdBtn": () => rdBtn,
  "rdCClef": () => rdCClef,
  "rdChLabel": () => rdChLabel,
  "rdClear": () => rdClear,
  "rdClick": () => rdClick,
  "rdClickAns": () => rdClickAns,
  "rdCoach": () => rdCoach,
  "rdCustomFill": () => rdCustomFill,
  "rdCustomGo": () => rdCustomGo,
  "rdCustomRead": () => rdCustomRead,
  "rdData": () => rdData,
  "rdEndClick": () => rdEndClick,
  "STAGE": () => STAGE,
  "stageSync": () => stageSync,
  "rdEsc": () => rdEsc,
  "rdFeedback": () => rdFeedback,
  "rdFinish": () => rdFinish,
  "rdFocus": () => rdFocus,
  "rdFromStep": () => rdFromStep,
  "rdGen": () => rdGen,
  "rdGenMelody": () => rdGenMelody,
  "rdHeat": () => rdHeat,
  "rdHint": () => rdHint,
  "rdHud": () => rdHud,
  "rdInput": () => rdInput,
  "rdIntro": () => rdIntro,
  "rdIvName": () => rdIvName,
  "rdKey": () => rdKey,
  "rdKeyLabel": () => rdKeyLabel,
  "rdKeyMinor": () => rdKeyMinor,
  "rdKeyText": () => rdKeyText,
  "rdKsSvg": () => rdKsSvg,
  "rdLetter": () => rdLetter,
  "rdLvDetail": () => rdLvDetail,
  "rdLvName": () => rdLvName,
  "rdLvNext": () => rdLvNext,
  "rdLvSub": () => rdLvSub,
  "rdMidi": () => rdMidi,
  "rdName": () => rdName,
  "rdNext": () => rdNext,
  "rdNextRender": () => rdNextRender,
  "rdNextStep": () => rdNextStep,
  "rdNk": () => rdNk,
  "rdOnLocale": () => rdOnLocale,
  "rdOpen": () => rdOpen,
  "rdP": () => rdP,
  "rdPercClef": () => rdPercClef,
  "rdPickFrom": () => rdPickFrom,
  "rdPool": () => rdPool,
  "rdQSvg": () => rdQSvg,
  "rdRangeTxt": () => rdRangeTxt,
  "rdRender": () => rdRender,
  "rdRenderHome": () => rdRenderHome,
  "rdRenderStats": () => rdRenderStats,
  "rdRhDone": () => rdRhDone,
  "rdRhFit": () => rdRhFit,
  "rdRhGen": () => rdRhGen,
  "rdRhGenLH": () => rdRhGenLH,
  "rdRhGrade": () => rdRhGrade,
  "rdRhGradeAll": () => rdRhGradeAll,
  "rdRhGradeHand": () => rdRhGradeHand,
  "rdRhHandLine": () => rdRhHandLine,
  "rdRhKey": () => rdRhKey,
  "rdRhMarks": () => rdRhMarks,
  "rdRhNew": () => rdRhNew,
  "rdRhNoteTip": () => rdRhNoteTip,
  "rdRhOptsLock": () => rdRhOptsLock,
  "rdRhPrefs": () => rdRhPrefs,
  "rdRhPress": () => rdRhPress,
  "rdRhRelease": () => rdRhRelease,
  "rdRhRun": () => rdRhRun,
  "rdRhStrokes": () => rdRhStrokes,
  "rdScroll": () => rdScroll,
  "rdSightDone": () => rdSightDone,
  "rdSightGen": () => rdSightGen,
  "rdSightStart": () => rdSightStart,
  "rdSound": () => rdSound,
  "rdSpell": () => rdSpell,
  "rdSpellMidi": () => rdSpellMidi,
  "rdStars": () => rdStars,
  "rdStart": () => rdStart,
  "rdStat": () => rdStat,
  "rdStep": () => rdStep,
  "rdSuggest": () => rdSuggest,
  "rdSvg": () => rdSvg,
  "rdTab": () => rdTab,
  "rdTap": () => rdTap,
  "rdTarget": () => rdTarget,
  "rdU": () => rdU,
  "reflectSettingsUI": () => reflectSettingsUI,
  "reflowKeys": () => reflowKeys,
  "refreshDeviceList": () => refreshDeviceList,
  "refreshToday": () => refreshToday,
  "releaseFocusInput": () => releaseFocusInput,
  "releaseLiveInput": () => releaseLiveInput,
  "releaseTypingKeys": () => releaseTypingKeys,
  "renderAccompany": () => renderAccompany,
  "renderModeNav": () => renderModeNav,
  "renderPlan": () => renderPlan,
  "renderPracticeLast": () => renderPracticeLast,
  "renderProgress": () => renderProgress,
  "renderRead": () => renderRead,
  "renderSongs": () => renderSongs,
  "repaintHeld": () => repaintHeld,
  "resolve": () => resolve,
  "revealAnswerKeys": () => revealAnswerKeys,
  "reverbGain": () => audioEngine.reverbGain,
  "reverbNode": () => audioEngine.reverbNode,
  "reverbWet": () => audioEngine.reverbWet,
  "reviewItem": () => reviewItem,
  "romanFor": () => romanFor,
  "sampledPianoVoice": () => sampledPianoVoice,
  "savedDevice": () => midiController.state.savedDevice,
  "scaleDisp": () => scaleDisp,
  "scaleEarOptions": () => scaleEarOptions,
  "scaleFormula": () => scaleFormula,
  "scheduleAccompAt": () => accompaniment.scheduleAt,
  "scheduleEval": () => scheduleEval,
  "scorePitch": () => scorePitch,
  "seedPlacement": () => seedPlacement,
  "sesHome": () => sesHome,
  "sesInput": () => sesInput,
  "sesPrompt": () => sesPrompt,
  "sesStopPrompt": () => sesStopPrompt,
  "setBendFromValue": () => setBendFromValue,
  "setEq": () => setEq,
  "setLang": () => setLang,
  "setMidi": () => setMidi,
  "setOverlay": () => setOverlay,
  "shiftTypeOctave": () => shiftTypeOctave,
  "show": () => show,
  "showElaboration": () => showElaboration,
  "showNotationReloadPrompt": () => showNotationReloadPrompt,
  "showProgTarget": () => showProgTarget,
  "showSummary": () => showSummary,
  "shuffle": () => shuffle,
  "slashLabel": () => slashLabel,
  "songDir": () => songBook.getDir(),
  "songsFor": () => songsFor,
  "spellMidi": () => spellMidi,
  "spelledName": () => spelledName,
  "srActiveHands": () => srActiveHands,
  "srAssessFinish": () => srAssessFinish,
  "srAssessLoop": () => srAssessLoop,
  "srAssessStart": () => srAssessStart,
  "srtSetState": () => srtSetState,
  "srtStartFirstSight": () => srtStartFirstSight,
  "srtStartPractice": () => srtStartPractice,
  "srtStartClaimedAttempt": () => srtStartClaimedAttempt,
  "srtSwitchToPractice": () => srtSwitchToPractice,
  "srBeatToX": () => srBeatToX,
  "srBeatPt": () => srBeatPt,
  "srEmptyUi": () => srEmptyUi,
  "srClef": () => srClef,
  "srClick": () => srClick,
  "srCoach": () => srCoach,
  "srCount": () => srCount,
  "srCursor": () => srCursor,
  "srDraw": () => srDraw,
  "srFit": () => srFit,
  "srEvents": () => srEvents,
  "srFocus": () => srFocus,
  "srGo": () => srGo,
  "srHandsAvail": () => srHandsAvail,
  "srKeyInput": () => srKeyInput,
  "srKeyName": () => srKeyName,
  "srKeyNames": () => srKeyNames,
  "srKeySigG": () => srKeySigG,
  "srLearnFinish": () => srLearnFinish,
  "srLearnStart": () => srLearnStart,
  "srLedger2": () => srLedger2,
  "srListen": () => srListen,
  "srMeta": () => srMeta,
  "srNextAssess": () => srNextAssess,
  "srNextLearn": () => srNextLearn,
  "srPaintAll": () => srPaintAll,
  "srPieceTitle": () => srPieceTitle,
  "srPitch": () => srPitch,
  "srPlayGap": () => srPlayGap,
  "srRender": () => srRender,
  "srRest": () => srRest,
  "srScrollStep": () => srScrollStep,
  "srScrollX": () => srScrollX,
  "srSelectPiece": () => srSelectPiece,
  "srShowPiece": () => srShowPiece,
  "srSetBpm": () => srSetBpm,
  "srSetMode": () => srSetMode,
  "srShape": () => srShape,
  "srSlip": () => srSlip,
  "srSlipNote": () => srSlipNote,
  "srStem2": () => srStem2,
  "srStemLine": () => srStemLine,
  "srStepsBuild": () => srStepsBuild,
  "srStopAll": () => srStopAll,
  "srSvg": () => srSvg,
  "srTargets": () => srTargets,
  "srTimeSigG": () => srTimeSigG,
  "srTol": () => srTol,
  "srTopSlip": () => srTopSlip,
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
  "startPlacement": () => startPlacement,
  "startSession": () => startSession,
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
  "toolName": () => toolName,
  "touchDay": () => touchDay,
  "trapFocus": () => trapFocus,
  "typeOctave": () => typeOctave,
  "updateAccompChain": () => updateAccompChain,
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
  "EK_CHORD_GAP": () => EK_CHORD_GAP,
  "EK_MEL_SCALES": () => EK_MEL_SCALES,
  "EK_TRIES": () => EK_TRIES,
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
  "LETTERS": () => LETTERS,
  "LETTER_PC": () => LETTER_PC,
  "MAJOR": () => MAJOR,
  "NOTE_SYS": () => NOTE_SYS,
  "PC_FLAT": () => PC_FLAT,
  "PC_SHARP": () => PC_SHARP,
  "PIANO_KEYS": () => PIANO_KEYS,
  "PIANO_URLS": () => PIANO_URLS,
  "PIANO_WARM": () => PIANO_WARM,
  "PIECES": () => PIECES,
  "PLACEMENT": () => PLACEMENT,
  "PROGS": () => PROGS,
  "PWA": () => PWA,
  "RD": () => RD,
  "RD_ALL": () => RD_ALL,
  "RD_ALLIV": () => RD_ALLIV,
  "RD_CDEF": () => RD_CDEF,
  "RD_CHQ": () => RD_CHQ,
  "RD_CLEFC": () => RD_CLEFC,
  "RD_LH_PAT": () => RD_LH_PAT,
  "RD_LM": () => RD_LM,
  "RD_LV": () => RD_LV,
  "RD_MAJ": () => RD_MAJ,
  "RD_MIN": () => RD_MIN,
  "RD_REF": () => RD_REF,
  "RD_RHU": () => RD_RHU,
  "RD_TARGET": () => RD_TARGET,
  "RD_CHECK_N": () => RD_CHECK_N,
  "RD_UNITS": () => RD_UNITS,
  "ROMAN": () => ROMAN,
  "ROOT_NAMES": () => ROOT_NAMES,
  "SCALES": () => SCALES,
  "SCALE_DEG": () => SCALE_DEG,
  "SCALE_EAR_POOL": () => SCALE_EAR_POOL,
  "SC_BASE": () => SC_BASE,
  "SC_PAGE_W": () => SC_PAGE_W,
  "SES": () => SES,
  "SONGS": () => SONGS,
  "SR": () => SR,
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
  "accomp": () => accomp,
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
  "reduceMotion": () => reduceMotion,
  "rootName": () => rootName,
  "srSlipNames": () => srSlipNames,
  "srStepNo": () => srStepNo,
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
__etudeRegistry.defineValue("srtEvaluate", srtEvaluate);
__etudeRegistry.defineValue("srtGenerate", srtGenerate);
// For tests: the markup the engraver draws for a score, laid out for the Read paper (or a given layout).
__etudeRegistry.defineValue("srRenderScore", (score: SrScore, layout?: SrLayout) => srRender(score, layout ?? srPaper()).svg);
__etudeRegistry.defineValue("srtFingerprint", srtFingerprint);
__etudeRegistry.defineValue("srtBuildExpected", srtBuildExpected);
__etudeRegistry.defineGetter("RDN", () => RDN);
__etudeRegistry.defineGetter("rdnOpen", () => rdnOpen);
__etudeRegistry.defineGetter("rdnHome", () => rdnHome);
__etudeRegistry.defineGetter("rdnBook", () => rdnBook);
__etudeRegistry.defineGetter("rdnStep", () => rdnStep);
__etudeRegistry.defineGetter("rdnRenderHome", () => rdnRenderHome);
__etudeRegistry.defineGetter("rdnWarmupStart", () => rdnWarmupStart);
__etudeRegistry.defineGetter("rdnToday", () => rdnToday);
__etudeRegistry.defineMutable("rdnEnsureDailyOf", () => rdnEnsureDailyOf, (value) => { rdnEnsureDailyOf = value; });
__etudeRegistry.defineGetter("WARM", () => WARM);
__etudeRegistry.defineGetter("RDN_WARM_MS", () => RDN_WARM_MS);
__etudeRegistry.defineValue("srtLevelExpected", srtLevelExpected);
__etudeRegistry.defineValue("srtLedgerUpdate", srtLedgerUpdate);
__etudeRegistry.defineValue("srtReadLedger", srtReadLedger);
__etudeRegistry.defineValue("srtCreateLedger", srtCreateLedger);
__etudeRegistry.defineValue("srtAcquireAttemptLease", srtAcquireAttemptLease);
__etudeRegistry.defineValue("srtLedgerReadStatus", srtLedgerReadStatus);
__etudeRegistry.defineValue("isBackupPayload", isBackupPayload);
__etudeRegistry.defineGetter("srtRecorder", () => srtRecorder);
__etudeRegistry.defineGetter("srNoteStart", () => srNoteStart);
const { wireFeatureTestSurfaces } = await import('../app/test-surface-wiring.js');
await wireFeatureTestSurfaces(__etudeRegistry, ensureFeature);
window.__etude = __etude;
__etude.loadOsmd = loadOsmd;
}
document.documentElement.removeAttribute('data-app-pending');

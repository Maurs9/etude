import type { AppLanguage, InterfaceLanguage } from '../types/architecture.js';
import type { AppSettings, StoredSrsEntry } from './storage.js';
import type { AudioEngine, AudioTone, AudioVoice, PianoStatus, PianoVoiceOptions } from './audio.js';
import type { identifyChord as identifyChordFn } from './theory.js';
import type { Localised } from '../locales/content-types.js';
import type { TechniqueKind } from './technique.js';
import type { TrainerItem } from '../core/trainer-items.js';
import type { ReadDrillLevel } from '../core/reading-curriculum.js';
import type { buildPracticeReport } from './progress-report.js';
import type { LibraryItem } from './score-library-types.js';
import type { AnalysisRoute, AppView } from './router.js';
import type { NotationSystem } from './score-types.js';
import type { ChordTemplate, ProgressionTemplate, ScaleDefinitions } from './view-contracts.js';
import type { ReadingBookState } from '../sight-reading/progress.js';

/**
 * The view entry point is deliberately small: it owns the typed browser
 * boundary and shared decomposition contracts. Keeping these contracts here
 * means new feature, infra, and shell modules can be checked without
 * re-introducing untyped application-global state.
 */

export interface ViewElement extends HTMLElement {
  value: string;
  checked: boolean;
  disabled: boolean;
  hidden: boolean;
  _filled?: boolean;
}

export interface ViewLocaleRecord {
  readonly [key: string]: string;
}

export interface ViewLocaleContent {
  readonly language: AppLanguage;
  readonly strings: ViewLocaleRecord;
  readonly music: Readonly<Record<string, unknown>>;
  readonly lessons: Readonly<Record<string, unknown>>;
}

export interface ViewSessionState {
  active: boolean;
  index: number;
  correct: number;
  total: number;
  answered: boolean;
  question: ViewData | null;
}

export interface ViewApplicationState {
  language: InterfaceLanguage;
  view: AppView;
  theme: 'auto' | 'light' | 'dark';
  notation: NotationSystem;
  settings: AppSettings;
  session: ViewSessionState;
  audio: {
    tone: AudioTone;
    piano: PianoStatus;
    muted: boolean;
  };
}

export interface ViewData {
  readonly [key: string]: string | number | boolean | null | ViewData | readonly ViewData[];
}

export interface ViewEventMap {
  click: MouseEvent;
  change: Event;
  input: Event;
  keydown: KeyboardEvent;
  keyup: KeyboardEvent;
  pointerdown: PointerEvent;
  pointermove: PointerEvent;
  pointerup: PointerEvent;
}

export type ViewEventName = keyof ViewEventMap;
export type ViewEventHandler<Name extends ViewEventName> =
  (event: ViewEventMap[Name]) => void;
export type ViewCallback<T = void> = () => T;
export type ViewUpdate<T> = (value: T) => void;

export interface ViewDomainData {
  readonly scales: ScaleDefinitions;
  readonly chords: readonly ChordTemplate[];
  readonly progressions: readonly ProgressionTemplate[];
}

export interface ViewRuntimeBoundary {
  readonly getElement: (id: string) => ViewElement;
  readonly getSurface: () => EtudeSurface | null;
}

export interface EtudeSurface {
  [name: string]: unknown;
}

/* ---------- Persisted Trainer Data Contract ---------- */

export type IntervalDirection = 'asc' | 'desc' | 'both';
export type StoredTrainerSettings = Omit<AppSettings, 'earKeys'> & { earKeys?: boolean };

export interface StoredSheetRecord {
  best?: number;
  learned?: boolean;
}

export interface StoredLastDrill {
  cat: string;
  mode: string;
  keys: boolean;
  key: string;
  c: number;
  n: number;
  day: number;
  dir?: IntervalDirection;
}

export interface StoredLessonReview {
  last: number;
  n: number;
  best?: number;
  rv?: number;
}

export interface StoredPracticeLog {
  techRuns?: number;
  techClean?: number;
  techBestBpm?: number;
  melRuns?: number;
  melCorrect?: number;
  melTotal?: number;
}

export interface ReadDrillLevelStat {
  s: number;
  acc: number;
  t: number;
  n: number;
  rush: number;
  sv?: number;
  ta?: number;
  mn?: number;
}

export interface ReadDrillNoteStat {
  n: number;
  ok: number;
  ms: number;
  e: number;
  t: number;
}

export interface ReadDrillTotals {
  n: number;
  ok: number;
  ms: number;
  sess: number;
}

export interface ReadDrillCustom {
  ty: string;
  clef: string;
  lo: string;
  hi: string;
  acc: number;
  keys: number;
  land: boolean;
}

export interface ReadDrillPrefs {
  tab: string;
  sound: boolean;
  hints: boolean;
  last: string | null;
  custom: ReadDrillCustom | null;
  rhDur: boolean;
  rhHands: number;
  srLv?: string;
  flow: boolean;
  ghost: boolean;
  stage: boolean;
  autoNext?: boolean;
  instantFeedback?: boolean;
  warmDone?: string;
}

/** `book`: the Read home's book, key runs, and daily set (`src/sight-reading/progress.ts`). */
export interface ReadDrillData {
  lv: { [levelId: string]: ReadDrillLevelStat };
  nt: { [noteKey: string]: ReadDrillNoteStat };
  tot: ReadDrillTotals;
  prefs: ReadDrillPrefs;
  book?: ReadingBookState;
}

export type StoredTrainerData = {
  srs: Record<string, StoredSrsEntry>;
  streak: number;
  bestStreak: number;
  lastActive: number;
  todayDay: number;
  todayCount: number;
  newToday: number;
  totalReviews: number;
  totalCorrect: number;
  placed: boolean;
  history: Record<string, number>;
  singCleared: Record<string, boolean>;
  sheet: Record<string, StoredSheetRecord>;
  settings: StoredTrainerSettings;
  lastTool?: string;
  toolDay?: Record<string, number>;
  earDay?: number;
  earToday?: number;
  lastDrill?: StoredLastDrill;
  lastBuiltinPiece?: { id: string; at: number; measure?: string; speed?: number; elapsed?: number };
  practiceLog?: StoredPracticeLog;
  learnDone?: Record<string, number>;
  learnRev?: Record<string, StoredLessonReview>;
  learnUnlock?: Record<string, number>;
  learnSel?: number;
  learnSelId?: string;
  reading?: Partial<ReadDrillData>;
};

/* ---------- Decomposition & Host Contracts ---------- */

export type TestSurfaceDescriptor =
  | { readonly get: () => unknown; readonly set?: (value: unknown) => void }
  | { readonly value: unknown };

export interface TestSurfaceRegistry {
  readonly target: EtudeSurface;
  define(entries: Readonly<Record<string, TestSurfaceDescriptor>>): void;
  defineGetter(key: string, get: () => unknown): void;
  defineMutable<T>(key: string, get: () => T, set: (value: T) => void): void;
  defineValue<T>(key: string, value: T): void;
}

export type PracticeModePref = 'play' | 'ear' | 'keys' | 'along' | 'tech';

export interface ShowOptions {
  readonly moveFocus?: boolean;
  readonly fromHistory?: boolean;
  readonly analysisRoute?: AnalysisRoute | null;
  /** Opens a file directly in `#analysis` (used by Voice → Pieces `trxOpenInPieces`). */
  readonly openFile?: File;
  /** Opens a built-in piece directly in `#analysis` (used by Learn `[data-an]`). */
  readonly pieceId?: string;
  /** Scrolls/focuses a sub-section in `#explore` (e.g. `'circle'`). */
  readonly extab?: string;
  /** Opens a specific lesson ID in `#learn`. */
  readonly learnLessonId?: string;
  /** Pre-selects Practice topic/mode/key when navigating into `#practice`. */
  readonly practiceTopic?: string;
  readonly practiceMode?: PracticeModePref;
  readonly practiceKey?: string;
  /** Pre-selects a Reading key when navigating into `#read`. */
  readonly readingKeyId?: string;
  /** Opens a specific Reading Drill level ID in `#read`. */
  readonly readingDrillId?: string;
}

/**
 * Overloaded router signature preserving legacy positional callers during the
 * strangler migration alongside the options-object form for extracted features.
 */
export interface ShowFn {
  (view: string | undefined, moveFocus?: boolean, fromHistory?: boolean, analysisRoute?: AnalysisRoute | null): void | Promise<void>;
  (view: string | undefined, options: ShowOptions): void | Promise<void>;
}

export type InputReleaseKind = 'physical' | 'focus' | 'reset' | null;

export interface InputNoteEvent {
  readonly kind: 'on' | 'off' | 'pedal';
  readonly midi?: number;
  readonly source: string;
  readonly releaseKind?: InputReleaseKind;
  readonly pedalDown?: boolean;
}

export type InputBusListener = (event: InputNoteEvent) => void;

export interface InputBus {
  subscribe(listener: InputBusListener): () => void;
  heldMidis(): number[];
  heldPcs(): number[];
  isMidiLive(): boolean;
  releaseLiveInput(): void;
  releaseFocusInput(): void;
}

export type ScoreLayoutPref = 'fit' | 'page' | 'cont';
export type ScoreLookPref = 'paper' | 'night';
export type ScoreFallModePref = 'score' | 'fall';

export interface UiPrefsSnapshot {
  readonly scoreLook: ScoreLookPref;
  readonly scoreHl: boolean;
  readonly scoreLayout: ScoreLayoutPref;
  readonly scoreFallMode: ScoreFallModePref;
  readonly scoreLayoutExplicit: boolean;
  readonly anSide: { readonly open: boolean; readonly tab: string; readonly w: number };
}

export type UiPrefsPatch = Partial<Omit<UiPrefsSnapshot, 'anSide'>> & {
  readonly anSide?: Partial<UiPrefsSnapshot['anSide']>;
};

export interface UiPrefsStore {
  get(): UiPrefsSnapshot;
  /** Updates shell-owned UI preferences and triggers `saveSoon()` by default (`save: 'soon'`). */
  set(patch: UiPrefsPatch, options?: { readonly save?: 'soon' | 'now' | 'none' }): void;
}

export type CoachSurface = 'today' | 'read' | 'practice' | 'analysis' | 'settings';
export type TranslateFn = (key: string, ...args: ReadonlyArray<string | number | null | undefined>) => string;
export type SpellNoteFn = (letter: number, accidental: number, asciiSharpFlat?: boolean) => string;

export interface PreviewSequenceFrame {
  readonly at: number;
  readonly notes: number[];
}

export interface AudioHostFacade {
  ensure(): AudioContext | null;
  context(): AudioContext | null;
  requireContext(): AudioContext;
  preparePiano(): Promise<boolean>;
  timedReady(context: AudioContext): Promise<boolean>;
  scheduleClick(when: number, accent: boolean, phraseBucket?: boolean): void;
  stopPhraseClicks(): void;
  noteOn(midi: number, velocity?: number): void;
  noteOff(midi: number): void;
  previewNote(midi: number, when?: number, duration?: number, velocity?: number, options?: PianoVoiceOptions): void;
  playInterval(rootMidi: number, semitones: number, style?: 'both' | 'harmonic' | 'melodic'): void;
  playChordMidis(midis: number[], arpeggio: boolean): void;
  playScaleNotes(rootMidi: number, offsets: readonly number[], ascending: boolean): void;
  playProg(rootPc: number, prog: ProgressionTemplate): void;
  stopPreviews(): void;
}

export interface MetronomeHostFacade {
  getBpm(): number;
  isRunning(): boolean;
  start(bpm?: number, startAt?: number): void;
  stop(): void;
  click(when: number, accent: boolean): void;
  startDrone(rootPc: number): void;
  stopDrone(): void;
}

export interface DockHostFacade {
  sync(): void;
  setOpen(open: boolean): void;
  isShown(): boolean;
  clear(state?: string): void;
  mark(midi: number, state: 'target' | 'good' | 'bad' | 'rh' | 'lh' | null, anyOctave?: boolean): void;
  clearKeyIfState(midi: number, state: string, anyOctave?: boolean): void;
  setDegrees(degrees: Map<number, string> | null): void;
  ensureVisible(midis: readonly number[]): void;
  fixedBottomTop(): number;
  onReflow(listener: () => void): () => void;
}

/**
 * Contract for vertical feature slices under `src/features/<name>/`.
 *
 * Invariants:
 * - Zero side effects at module import time (no top-level DOM queries or listeners).
 * - `mount(host)` is invoked at most once per loaded feature module, before its first `enter()`.
 * - `enter(params, signal)` must check `signal.aborted` after every `await`.
 */
export interface FeatureController {
  mount?(host: AppHost): void;
  enter(params: Readonly<Record<string, unknown>> | undefined, signal: AbortSignal): void | Promise<void>;
  leave(nextView: AppView): void;
  isBusy?(): boolean;
  panic?(): void;
  localize?(): void;
  onStorageSync?(): void;
  onProgressReset?(): void;
  onEscape?(): boolean;
  registerTestSurface?(registry: TestSurfaceRegistry): void;
}

export interface AppHost {
  readonly i18n: {
    readonly t: TranslateFn;
    readonly localize: (key: string, fallback: string) => string;
    readonly lang: () => InterfaceLanguage;
    readonly spell: SpellNoteFn;
    readonly notation: () => NotationSystem;
    readonly loadLearn: () => Promise<void>;
    readonly stepLabel: (step: number) => string;
    readonly chordDisp: (chord: ChordTemplate | string | undefined) => string;
    readonly scaleDisp: (name: string) => string;
    readonly invName: (inversion: number) => string;
    readonly intervalLabel: (semitones: number) => string;
    readonly noteName: (midi: number, preferFlat?: boolean) => string;
    readonly pcName: (pc: number, preferFlat?: boolean) => string;
    readonly slashLabel: (
      id: { rootPc: number; chord: { symbol: string }; bassPc: number; inversion: number },
      rootSp?: { li: number; acc: number; oct: number },
      bassSp?: { li: number; acc: number; oct: number },
    ) => string;
    readonly formatChord: (root: string, symbol: string) => string;
    readonly fillRoots: (sel: HTMLElement, withAll: boolean) => void;
  };
  readonly audio: AudioHostFacade;
  readonly metro: MetronomeHostFacade;
  readonly input: InputBus;
  readonly dock: DockHostFacade;
  readonly nav: {
    readonly show: ShowFn;
    readonly activeView: () => AppView;
    readonly isPendingSaveProtected: () => boolean;
    /** Updates the shell's eager mirror read synchronously by `show()` before `read` loads. */
    readonly setPendingSave: (protectedAttempt: boolean) => void;
    readonly nextReadDrillForUnits: (unitIds: readonly string[]) => { readonly id: string; readonly name: string } | null;
  };
  readonly overlays: {
    readonly pushModal: (id: string) => void;
    readonly popModal: () => void;
    readonly openCount: () => number;
    readonly focusView: (view: AppView) => void;
    readonly showLoadError: (retry: () => Promise<unknown>, target?: HTMLElement) => void;
  };
  readonly store: {
    /** Documented pragmatic exception: returns live `StoredTrainerData`; disk writes always go through shell `syncWrite`/`storeApplyBackup`. */
    readonly data: () => StoredTrainerData;
    readonly saveNow: () => void;
    readonly saveSoon: () => void;
    readonly flushSaveSoon: () => void;
    readonly uiPrefs: () => UiPrefsStore;
  };
  readonly previews: {
    readonly registerStopper: (stop: () => void) => () => void;
    readonly registerSequenceHandler: (handler: (frames: PreviewSequenceFrame[]) => void) => () => void;
    readonly stopAll: () => void;
  };
  readonly wake: {
    readonly ping: () => void;
    readonly sync: () => void;
  };
  readonly coach: {
    readonly setContext: (surface: CoachSurface, snapshot: Readonly<Record<string, unknown>> | null) => void;
    readonly refresh: () => void;
  };
  readonly reduceMotion: () => boolean;
  readonly testSurface: TestSurfaceRegistry | null;
}

export type IntervalStyle = 'both' | 'melodic' | 'harmonic';
export type ChordTier = 'triads' | 'sevenths' | 'all';
export type ScaleTier = 'core' | 'modes' | 'all';
export type MelodyDifficulty = 'easy' | 'medium' | 'advanced';
/** What a targeted Practice session drills (topic, mode, key and the topic's own options). */
export interface TrainerSessionTarget {
  cat: string;
  mode: string;
  key: string;
  dir?: IntervalDirection;
  ivStyle?: IntervalStyle;
  chordTier?: ChordTier;
  scaleTier?: ScaleTier;
  melDiff?: MelodyDifficulty;
  melLen?: number | 'auto';
  melScale?: string;
  techKind?: TechniqueKind;
  techOctaves?: 1 | 2;
}

/** The Score Player's side-panel tabs, in order; the shell validates restored `anSide.tab` against it without loading the feature. */
export const SCORE_SIDE_TABS: readonly string[] = ['now', 'piece', 'practice'];

/** A coaching tip: a string key with what fills it in, and optionally an action (a button label and what it does). */
export interface CoachTip {
  k: string;
  args?: () => (string | number)[];
  act?: { k: string; args?: () => (string | number)[]; run: () => void } | null;
}

/** The shell's full-window score focus (Pieces and Read share it); the shell owns and mutates it. */
export interface ScoreFocusState {
  owner: 'analysis' | 'read' | null;
  native: boolean;
  token: number;
  returnTo: HTMLElement | null;
  scroll: number;
  readOverride: boolean | null;
  zoom: number;
}

/**
 * Shell services the lazy Score Player (`src/features/score-player/`) needs beyond `AppHost`: live keyboard/dock state,
 * the shared audio engine, score focus, layout CSS variables and shared spelling/coaching helpers that stay in the shell.
 * Mutable shell values are exposed as getters so the feature never caches a stale binding.
 */
export interface ScorePlayerShell {
  readonly audioEngine: AudioEngine;
  readonly scoreClicks: Set<AudioVoice>;
  readonly keyboardView: { low: number; oct: number };
  readonly keyEl: Map<number, HTMLButtonElement>;
  readonly held: Set<number>;
  readonly scoreFocus: ScoreFocusState;
  readonly baseLow: number;
  readonly baseHigh: number;
  readonly view0: () => string;
  readonly kbState: (midi: number, state: string | null, fold: boolean) => void;
  readonly labelMode: () => string;
  readonly strings: () => Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly navigationToken: () => number;
  readonly bumpNavigation: () => number;
  readonly ensureAudio: (warm?: boolean) => AudioContext | null;
  readonly pianoEnsure: (midis: readonly number[]) => Promise<unknown>;
  readonly stopClicks: (clicks: Set<AudioVoice>) => void;
  readonly buildKeyboard: () => void;
  readonly repaintHeld: () => void;
  readonly foldToView: (midi: number) => number;
  readonly dockOpen: (view?: string) => boolean;
  readonly layoutVars: () => void;
  readonly layoutVarsSoon: () => void;
  readonly handleNoteOn: (midi: number, velocity: number, source?: string) => void;
  readonly handleNoteOff: (midi: number, source?: string, releaseKind?: InputReleaseKind, silence?: boolean) => void;
  readonly touchInput: (event: Event, fn: () => void) => void;
  readonly inField: () => boolean;
  readonly blurInputField: () => void;
  readonly touchDay: () => void;
  readonly scoreFocusExit: (quiet?: boolean) => void;
  readonly scoreFocusToggle: (owner: 'analysis' | 'read', target: HTMLElement) => void;
  readonly appConfirm: (message: string) => Promise<boolean>;
  readonly learnGoId: (id: string) => void;
  readonly showNotationReloadPrompt: (message?: (lang: InterfaceLanguage) => { message: string; button: string }) => void;
  readonly defaultScoreLayoutForViewport: (viewportWidth: number) => ScoreLayoutPref;
  readonly savedScoreView: (view: unknown, explicit: unknown) => ScoreLayoutPref | 'fall' | null;
  readonly identifyChord: (notes: readonly number[], expected?: number) => ReturnType<typeof identifyChordFn>;
  readonly srPieceTitle: (piece: { id?: string; t?: Localised<string> }) => string;
  readonly spelledName: (sys: NotationSystem, letter: number, accidental: number, ascii?: boolean) => string;
  readonly tl: (lang: string, key: string, a?: string | number | null, b?: string | number | null) => string;
  readonly anNum: (x: number, digits: number) => string;
  readonly tf: (key: string, ...args: unknown[]) => string;
  readonly coachList: (items: string[]) => string;
  readonly coachHTML: (lead: string, tip: CoachTip, actId?: string) => string;
}

/** The Score Player controller: `FeatureController` plus the synchronous hooks the shell calls while it is loaded. */
export interface ScorePlayerController extends FeatureController {
  ensureModules(): Promise<void>;
  modulesReady(): boolean;
  currentRoute(): AnalysisRoute;
  onPopRoute(route: AnalysisRoute): void;
  /** Live score preferences, pushed to the shell before every save. */
  prefs(): UiPrefsSnapshot;
  /** Applies shell-held score preferences (boot restore or another tab's save). */
  applyPrefs(prefs: UiPrefsSnapshot): void;
  layoutVars(): void;
  stageOn(): boolean;
  setStage(on: boolean, quiet?: boolean): void;
  hasNotes(): boolean;
  sideOpen(): boolean;
  setSide(open: boolean): void;
  closeSheet(quiet?: boolean): void;
  dockWanted(): boolean;
  keysCenterIfPending(): void;
  keysPaint(force?: boolean): void;
  keysClear(): void;
  keepPlace(): () => void;
  updateControls(): void;
  practiceInput(kind: 'on' | 'off', midi: number, source: string): void;
  sustainInput(down: boolean): void;
  syncPracticeLine(): void;
  /** Clears the falling-notes keyboard's held keys. */
  releaseInput(): void;
  /** Releases focus-owned falling-notes keys; `fell` says a falling-notes key was released. */
  releaseFocus(fell: boolean): void;
  relocalize(): void;
  /** Re-words the practice summary's next-step tip (language or note names changed). */
  refreshCoach(): void;
  localizeLibrary(): void;
  onScreenChange(flipped: boolean): void;
}

/**
 * Shell services the lazy Practice feature (`src/features/practice/`: session engine, ear-on-keys, technique, setup,
 * hints, summary, accompaniment and the song book) needs beyond `AppHost`. Item data and SRS math come from
 * `src/core/`; mutable shell values are getters.
 */
export interface PracticeShell {
  readonly audioEngine: AudioEngine;
  readonly keyboardView: { low: number; oct: number };
  readonly keyEl: Map<number, HTMLButtonElement>;
  readonly held: Set<number>;
  readonly baseLow: number;
  readonly baseHigh: number;
  readonly view0: () => string;
  readonly todayN: () => number;
  readonly ensureAudio: (warm?: boolean) => AudioContext | null;
  readonly pianoEnsure: (midis: readonly number[]) => Promise<boolean>;
  readonly kbState: (midi: number, state: string | null, fold: boolean) => void;
  readonly kbClear: (state: string) => void;
  readonly kbClearAll: () => void;
  readonly buildKeyboard: () => void;
  readonly repaintHeld: () => void;
  readonly reflowKeys: () => void;
  readonly foldToView: (midi: number) => number;
  readonly viewHigh: () => number;
  readonly dockKeyInSight: (midi: number) => void;
  readonly syncMobileStartBars: () => void;
  readonly refreshToday: () => void;
  readonly playIvDir: (root: number, semitones: number, direction: string, style?: IntervalStyle) => void;
  readonly rootName: (pc: number) => string;
  readonly ivName: (semitones: number) => string;
  readonly catLabel: (cat: string) => string;
  readonly progDisp: (name: string) => string;
  readonly feelDisp: (symbol: string | number) => string;
  readonly chordFormula: (chord: { intervals: readonly number[] }) => string;
  readonly scaleFormula: (offsets: readonly number[]) => string;
  readonly songsFor: (semitones: number, dir: string) => string[];
  readonly itemLabel: (item: { cat: string; semi?: number; ref?: ChordTemplate | ProgressionTemplate; name?: string }) => string;
  readonly rdEsc: (value: string | number | undefined) => string;
  readonly spelledName: (sys: NotationSystem, letter: number, accidental: number, ascii?: boolean) => string;
  readonly isFlatKey: (pc: number) => boolean;
  readonly identifyChord: (notes: readonly number[], expected?: number) => ReturnType<typeof identifyChordFn<ChordTemplate>>;
  readonly chordTargetPcs: (rootPc: number, chord: ChordTemplate | undefined) => number[];
  readonly inversionOf: (rootPc: number, chord: { symbol: string; idx?: number; pcset?: readonly number[]; intervals?: readonly number[] }, bassMidi: number) => number;
  readonly boxOf: (id: string | number) => number;
  readonly isDue: (id: string | number) => boolean;
  readonly isNew: (id: string | number) => boolean;
  readonly dueItems: () => TrainerItem[];
  readonly newItemsAvail: () => TrainerItem[];
  readonly newQuotaLeft: () => number;
  readonly seedPlacement: (id: string, known: boolean) => void;
  readonly reviewItem: (id: string, correct: boolean) => void;
  readonly creditReview: (correct: boolean) => void;
  readonly currentStreak: () => number;
}

/** The Practice controller: `FeatureController` plus the synchronous hooks the shell calls while it is loaded. */
export interface PracticeController extends FeatureController {
  sesActive(): boolean;
  sesHome(): 'today' | 'practice';
  startSession(target: TrainerSessionTarget | null): void;
  startPlacement(): void;
  endSession(toSummary: boolean): void;
  /** Session keyboard shortcuts (digits answer, R replays, N advances); true when the key was used. */
  sessionKey(key: string, event: KeyboardEvent): boolean;
  sessionInput(kind: 'on' | 'off', midi: number): void;
  /** True while the open session question is answered on the keys and needs them shown. */
  sessionNeedsKeys(view: string): boolean;
  alongWanted(view: string): boolean;
  /** The hint preview's keyboard choice (null: no preview, or it leaves the keyboard alone). */
  hintKeys(): boolean | null;
  setHintKeys(open: boolean): void;
  hintPreviewActive(): boolean;
  onKeyboardBuilt(): void;
  stopPrompts(): void;
  stopAccompaniment(): void;
  openMoved(view: string, moveFocus: boolean, fromHistory: boolean): void;
  setTopic(topic: string): void;
  setMode(mode: PracticeModePref): void;
  setKey(key: string): void;
  earCheck(): void;
  /** The phone's start bar text for Practice: the chosen drill and the button label. */
  mobileBar(): { summary: string; label: string };
  reflectSettings(): void;
  renderSetup(): void;
  renderMelodyScales(): void;
  renderAccompany(full: boolean): void;
  localizeAccompaniment(): void;
  updateAccompChain(): void;
  refreshSessionCopy(): void;
}

/** One line of Today's daily plan. */
export interface DailyPlanTask { id: string; done: boolean; partial?: boolean; prog?: number; pill?: string; t: string; d: string; go: () => void }

/** Shell services the lazy Today feature needs: review counts and labels, Learn's plan lines and the Practice session. */
export interface TodayShell {
  readonly todayN: () => number;
  readonly currentStreak: () => number;
  readonly dueItems: () => TrainerItem[];
  readonly newItemsAvail: () => TrainerItem[];
  readonly newQuotaLeft: () => number;
  readonly masteredCount: () => number;
  readonly isNew: (id: string | number) => boolean;
  readonly itemLabel: (item: { cat: string; semi?: number; ref?: ChordTemplate | ProgressionTemplate; name?: string }) => string;
  readonly catLabel: (cat: string) => string;
  readonly learnPlanItems: (today: number) => DailyPlanTask[];
  readonly sesActive: () => boolean;
  readonly startReview: () => void;
  readonly earCheck: () => void;
}

export interface TodayController extends FeatureController {
  refresh(): void;
}

/** Shell services the lazy Progress feature needs; the report's reading and piece facts stay in the shell until Read moves. */
export interface ProgressShell {
  readonly collectPracticeReport: (buildReport: typeof buildPracticeReport, libraryItems?: readonly LibraryItem[]) => ReturnType<typeof buildPracticeReport>;
  readonly storeHasProgress: () => boolean;
  readonly todayN: () => number;
  readonly currentStreak: () => number;
  readonly masteredCount: () => number;
  readonly itemLabel: (item: { cat: string; semi?: number; ref?: ChordTemplate | ProgressionTemplate; name?: string }) => string;
  readonly catLabel: (cat: string) => string;
  readonly statHTML: (value: string | number, label: string) => string;
  readonly rdRenderStats: () => void;
  readonly localeTag: () => string;
  readonly startReview: () => void;
  readonly prepareReport: () => Promise<void>;
}

export interface ProgressController extends FeatureController {
  render(): void;
}

/**
 * Shell services the lazy Read feature (Read & play, reading drills, the Read home, warm-up and level pieces) needs beyond
 * `AppHost`: keyboard and dock state, score focus and the full-screen stage, persistence checks for the attempt ledger,
 * coaching, and the shared helpers that stay in the shell.
 */
export interface ReadShell {
  readonly audioEngine: AudioEngine;
  readonly keyboardView: { low: number; oct: number };
  readonly keyEl: Map<number, HTMLButtonElement>;
  readonly held: Set<number>;
  readonly inputOwners: Map<number, Set<string>>;
  readonly baseLow: number;
  readonly baseHigh: number;
  readonly metroState: { bpm: number; on: boolean; timer: unknown };
  readonly scoreFocus: ScoreFocusState;
  readonly stage: { on: boolean; kb: boolean | null; rz: number };
  readonly letters: Readonly<Record<NotationSystem, readonly string[]>>;
  readonly view0: () => string;
  readonly todayN: () => number;
  readonly labelMode: () => string;
  readonly strings: () => Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly ensureAudio: (warm?: boolean) => AudioContext | null;
  readonly audioLockCheck: () => void;
  readonly kbState: (midi: number, state: string | null, fold: boolean) => void;
  readonly kbClear: (state: string) => void;
  readonly buildKeyboard: () => void;
  readonly repaintHeld: () => void;
  readonly foldToView: (midi: number) => number;
  readonly dockKeyInSight: (midi: number) => void;
  readonly dockForced: () => boolean;
  readonly setDockForced: (on: boolean) => void;
  readonly anLayoutVars: () => void;
  readonly syncMobileStartBars: () => void;
  readonly touchInput: (event: Event, fn: () => void) => void;
  readonly inField: () => boolean;
  readonly panic: () => void;
  readonly appConfirm: (message: string) => Promise<boolean>;
  readonly scoreFocusUi: () => void;
  readonly scoreFocusExit: (quiet?: boolean) => void;
  readonly scoreFocusEnter: (owner: 'analysis' | 'read', target: HTMLElement, manual?: boolean) => void;
  readonly readScoreZoom: (value?: number) => void;
  readonly rdFocusDispSet: (open: boolean, focusBack?: boolean) => void;
  readonly touchDay: () => void;
  readonly markReadDoneToday: (save?: boolean) => void;
  readonly storeDaily: () => void;
  readonly storeBlocked: () => boolean;
  readonly storeBackupBlocked: () => boolean;
  readonly progressGeneration: () => string;
  readonly savedGeneration: () => string;
  readonly setWeakSpotInjection: (on: boolean) => void;
  readonly learnLessonsDone: () => number;
  readonly currentStreak: () => number;
  readonly masteredCount: () => number;
  readonly itemLabel: (item: { cat: string; semi?: number; ref?: ChordTemplate | ProgressionTemplate; name?: string }) => string;
  readonly withPractice: (fn: (practice: PracticeController) => void) => void;
  readonly catLabel: (cat: string) => string;
  readonly rdData: () => ReadDrillData;
  readonly rdLvName: (level: ReadDrillLevel) => string;
  readonly rdStarCount: (value: unknown) => number;
  readonly rdEsc: (value: string | number | undefined) => string;
  readonly statHTML: (value: string | number, label: string) => string;
  readonly srPieceTitle: (piece: { id?: string; t?: Localised<string> }) => string;
  readonly spelledName: (sys: NotationSystem, letter: number, accidental: number, ascii?: boolean) => string;
  readonly tl: (lang: string, key: string, a?: string | number | null, b?: string | number | null) => string;
  readonly anNum: (x: number, digits: number) => string;
  readonly coachHTML: (lead: string, tip: CoachTip, actId?: string) => string;
  readonly coachText: (tip: CoachTip) => string;
  readonly registerCoach: (refresh: () => void) => () => void;
}

/** The Read controller: `FeatureController` plus the synchronous hooks the shell calls while it is loaded. */
export interface ReadController extends FeatureController {
  isPendingSaveProtected(): boolean;
  isPendingSaveState(): boolean;
  abandonClaim(): Promise<{ readonly ok: boolean }>;
  hasPiece(): boolean;
  svg(): SVGSVGElement | null;
  firstSightActive(): boolean;
  autoCancel(): void;
  stageSync(): void;
  stageRefit(): void;
  stageResize(): void;
  /** Read's keyboard shortcuts (stage, drills, home); true when the key was used. */
  key(event: KeyboardEvent, key: string): boolean;
  trackHeldSource(source: string): void;
  /** Level-piece start and first-sight recording, before view routing; true when the note was consumed. */
  preInput(kind: 'on' | 'off', midi: number, source: string, releaseKind: InputReleaseKind): boolean;
  /** Warm-up, rhythm, drill and Read & play input while Read is shown; true when the note was consumed. */
  viewInput(kind: 'on' | 'off', midi: number, lastHeld: number | undefined): boolean;
  /** Drop a released key from the current reading step, or clear the input when the device resets. */
  releaseInput(midi?: number): void;
  releaseFocus(): void;
  panicBegin(): void;
  panicRecorder(): void;
  panicRhythm(): void;
  panicStopAll(): void;
  stopForNavigation(): void;
  readySync(): void;
  dockView(): void;
  dockPaint(): void;
  watchAudioContext(context: AudioContext): void;
  relocalizePiece(): void;
  onNotation(): void;
  onLocale(): void;
  forgetBook(book: unknown): void;
  reflectSettings(): void;
  releaseRecorder(kind: 'focus'): void;
  fit(): void;
  setAnyOctave(on: boolean): void;
  redraw(): void;
  /** The phone's start bar for Read & play: whether a piece is ready to start, and its mode and tempo. */
  mobileBar(): { ready: boolean; summary: string };
  collectPracticeReport(buildReport: typeof buildPracticeReport, libraryItems?: readonly LibraryItem[]): ReturnType<typeof buildPracticeReport>;
  renderStats(): void;
}

declare global {
  interface Window {
    __etude?: Record<string, unknown>;
  }
}

export function createTestSurfaceRegistry(target: EtudeSurface): TestSurfaceRegistry {
  const defineGetter = (key: string, get: () => unknown): void => {
    Object.defineProperty(target, key, { configurable: true, get });
  };
  const defineMutable = <T,>(key: string, get: () => T, set: (value: T) => void): void => {
    Object.defineProperty(target, key, { configurable: true, get, set });
  };
  const defineValue = <T,>(key: string, value: T): void => {
    Object.defineProperty(target, key, { configurable: true, value });
  };
  const define = (entries: Readonly<Record<string, TestSurfaceDescriptor>>): void => {
    for (const [key, entry] of Object.entries(entries)) {
      if ('get' in entry) {
        Object.defineProperty(target, key, {
          configurable: true,
          get: entry.get,
          ...(entry.set ? { set: entry.set } : {}),
        });
      } else {
        Object.defineProperty(target, key, { configurable: true, value: entry.value });
      }
    }
  };
  return { target, define, defineGetter, defineMutable, defineValue };
}

function requireElement(id: string): ViewElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing view element: ${id}`);
  return element as ViewElement;
}

function isEtudeSurface(value: unknown): value is EtudeSurface {
  return typeof value === 'object' && value !== null;
}

function getSurface(): EtudeSurface | null {
  const candidate: unknown = window.__etude;
  return isEtudeSurface(candidate) ? candidate : null;
}

/**
 * Typed helpers for new view modules. All newly added view code should use
 * this boundary rather than reading arbitrary globals or casting DOM nodes inline.
 */
export const viewRuntime: ViewRuntimeBoundary = {
  getElement: requireElement,
  getSurface,
};

import type { AppLanguage, InterfaceLanguage } from '../types/architecture.js';
import type { AppSettings, StoredSrsEntry } from './storage.js';
import type { AudioTone, PianoStatus, PianoVoiceOptions } from './audio.js';
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
  /** Scrolls/focuses a sub-section in `#explore` (e.g. `'circle'`). */
  readonly extab?: string;
  /** Pre-selects Practice topic/mode/key when navigating into `#practice`. */
  readonly practiceTopic?: string;
  readonly practiceMode?: PracticeModePref;
  readonly practiceKey?: string;
  /** Pre-selects a Reading key when navigating into `#read`. */
  readonly readingKeyId?: string;
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
  ensure(): void;
  noteOn(midi: number, velocity?: number): void;
  noteOff(midi: number): void;
  previewNote(midi: number, when?: number, duration?: number, velocity?: number, options?: PianoVoiceOptions): void;
  playInterval(rootMidi: number, semitones: number, style?: 'both' | 'harmonic' | 'melodic'): void;
  playChordMidis(midis: number[], arpeggio: boolean): void;
  playScaleNotes(rootMidi: number, offsets: readonly number[], ascending: boolean): void;
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
  mark(midi: number, state: 'target' | 'good' | 'bad' | null, anyOctave?: boolean): void;
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
  onEscape?(): boolean;
  registerTestSurface?(registry: TestSurfaceRegistry): void;
}

export interface AppHost {
  readonly i18n: {
    readonly t: TranslateFn;
    readonly lang: () => InterfaceLanguage;
    readonly spell: SpellNoteFn;
    readonly notation: () => NotationSystem;
    readonly loadLearn: () => Promise<void>;
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
  };
  readonly overlays: {
    readonly pushModal: (id: string) => void;
    readonly popModal: () => void;
    readonly openCount: () => number;
    readonly focusView: (view: AppView) => void;
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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSurfaceRegistry } from '../../src/domain/views.ts';

function makeHost(prefs) {
  return {
    i18n: {
      t: (k) => k,
      localize: (k, fb) => fb || k,
      lang: () => 'en',
      spell: () => 'C',
      notation: () => 'letter',
      loadLearn: async () => {},
      stepLabel: () => 'T',
      chordDisp: () => 'Major',
      scaleDisp: (n) => n,
      invName: () => '',
      intervalLabel: () => 'Major 3rd',
      noteName: () => 'C4',
      pcName: () => 'C',
      slashLabel: () => 'C',
      formatChord: (r, s) => r + s,
      fillRoots: vi.fn(),
    },
    audio: {
      ensure: vi.fn(() => null),
      preparePiano: vi.fn(async () => false),
      context: vi.fn(() => null),
      requireContext: vi.fn(() => { throw new Error('no audio'); }),
      timedReady: vi.fn(async () => false),
      scheduleClick: vi.fn(),
      stopPhraseClicks: vi.fn(),
      noteOn: vi.fn(),
      noteOff: vi.fn(),
      previewNote: vi.fn(),
      playInterval: vi.fn(),
      playChordMidis: vi.fn(),
      playScaleNotes: vi.fn(),
      playProg: vi.fn(),
      stopPreviews: vi.fn(),
    },
    metro: { getBpm: () => 90, isRunning: () => false, start: vi.fn(), stop: vi.fn(), click: vi.fn(), startDrone: vi.fn(), stopDrone: vi.fn() },
    input: {
      subscribe: vi.fn(() => () => {}),
      heldMidis: () => [],
      heldPcs: () => [],
      isMidiLive: () => false,
      releaseLiveInput: vi.fn(),
      releaseFocusInput: vi.fn(),
    },
    dock: {
      sync: vi.fn(), setOpen: vi.fn(), isShown: () => false, clear: vi.fn(), mark: vi.fn(), clearKeyIfState: vi.fn(),
      setDegrees: vi.fn(), ensureVisible: vi.fn(), fixedBottomTop: () => 800, onReflow: vi.fn(() => () => {}),
    },
    nav: {
      show: vi.fn(),
      activeView: () => 'today',
      isPendingSaveProtected: () => false,
      setPendingSave: vi.fn(),
      nextReadDrillForUnits: () => null,
    },
    overlays: { pushModal: vi.fn(), popModal: vi.fn(), openCount: () => 0, focusView: vi.fn(), showLoadError: vi.fn() },
    store: {
      data: vi.fn(() => ({ sheet: {} })),
      saveNow: vi.fn(),
      saveSoon: vi.fn(),
      flushSaveSoon: vi.fn(),
      uiPrefs: () => ({ get: () => prefs, set: vi.fn() }),
    },
    previews: { registerStopper: vi.fn(() => () => {}), registerSequenceHandler: vi.fn(() => () => {}), stopAll: vi.fn() },
    wake: { ping: vi.fn(), sync: vi.fn() },
    coach: { setContext: vi.fn(), refresh: vi.fn() },
    reduceMotion: () => false,
    testSurface: null,
  };
}

function makeShell() {
  return {
    audioEngine: { context: null, scheduleClick: vi.fn() },
    scoreClicks: new Set(),
    keyboardView: { low: 48, oct: 4 },
    keyEl: new Map(),
    held: new Set(),
    scoreFocus: { owner: null, native: false, token: 0, returnTo: null, scroll: 0, readOverride: null, zoom: 1 },
    baseLow: 24,
    baseHigh: 96,
    view0: () => 'today',
    kbState: vi.fn(),
    labelMode: () => 'c',
    strings: () => ({}),
    navigationToken: () => 0,
    bumpNavigation: vi.fn(() => 1),
    ensureAudio: vi.fn(() => null),
    pianoEnsure: vi.fn(async () => undefined),
    stopClicks: vi.fn(),
    buildKeyboard: vi.fn(),
    repaintHeld: vi.fn(),
    foldToView: (m) => m,
    dockOpen: () => false,
    layoutVars: vi.fn(),
    layoutVarsSoon: vi.fn(),
    handleNoteOn: vi.fn(),
    handleNoteOff: vi.fn(),
    touchInput: (_e, fn) => fn(),
    inField: () => false,
    blurInputField: vi.fn(),
    touchDay: vi.fn(),
    scoreFocusExit: vi.fn(),
    scoreFocusToggle: vi.fn(),
    appConfirm: vi.fn(async () => false),
    learnGoId: vi.fn(),
    showNotationReloadPrompt: vi.fn(),
    defaultScoreLayoutForViewport: (w) => (w <= 680 ? 'fit' : 'page'),
    savedScoreView: () => null,
    identifyChord: () => null,
    srPieceTitle: () => '',
    spelledName: () => 'C',
    tl: (_l, k) => k,
    anNum: (x) => String(x),
    tf: (k) => k,
    coachList: (xs) => xs.join(', '),
    coachHTML: () => '',
  };
}

const PREFS = {
  scoreLook: 'night',
  scoreHl: true,
  scoreLayout: 'cont',
  scoreFallMode: 'fall',
  scoreLayoutExplicit: true,
  anSide: { open: true, tab: 'piece', w: 420 },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('score player feature slice', () => {
  it('imports every Score Player module in Node with zero DOM side effects and without loading the score modules', async () => {
    expect(typeof globalThis.window).toBe('undefined');
    expect(typeof globalThis.document).toBe('undefined');
    const [index, state, falling, modules] = await Promise.all([
      import('../../src/features/score-player/index.ts'),
      import('../../src/features/score-player/score-state.ts'),
      import('../../src/features/score-player/score-falling.ts'),
      import('../../src/features/score-player/score-modules.ts'),
    ]);
    expect(typeof index.createScorePlayerFeature).toBe('function');
    expect(typeof state.createAnState).toBe('function');
    expect(typeof falling.createFallState).toBe('function');
    // The heavy score-* modules load only through ensureScoreModules(), never at import time.
    expect(modules.scoreModulesReady()).toBe(false);
    expect(modules.scoreFeature).toBeUndefined();
  });

  it('keeps the pure score-state math deterministic', async () => {
    const s = await import('../../src/features/score-player/score-state.ts');
    expect(s.anClock(0)).toBe('0:00');
    expect(s.anClock(75.9)).toBe('1:15');
    expect(s.anClock(-4)).toBe('0:00');
    expect(s.anSignedSemi(3)).toBe('+3');
    expect(s.anSignedSemi(-2)).toBe('-2');
    expect(s.anSignedSemi(0)).toBe('0');

    const measures = [{ start: 0 }, { start: 4 }, { start: 8 }];
    expect(s.anMeasureIndex(measures, 0)).toBe(0);
    expect(s.anMeasureIndex(measures, 3.99)).toBe(0);
    expect(s.anMeasureIndex(measures, 4 - 1e-7)).toBe(1);
    expect(s.anMeasureIndex(measures, 9)).toBe(2);

    const segs = [{ start: 0, end: 2 }, { start: 2, end: 4 }, { start: 4, end: 8 }];
    expect(s.anSegIndexAt(segs, 0)).toBe(0);
    expect(s.anSegIndexAt(segs, 2)).toBe(1);
    expect(s.anSegIndexAt(segs, 7.5)).toBe(2);
    expect(s.anSegIndexAt(segs, 9)).toBe(-1);

    // Practice clock: score time t = t0 + (now − a0)·f within the segment that has started.
    const run = { segs: [{ a0: 10, t0: 0, f: 1, t1: 4 }, { a0: 14, t0: 4, f: 0.5, t1: 8 }] };
    expect(s.pracSegAt(run, 9)).toBe(run.segs[0]);
    expect(s.pracSegAt(run, 15)).toBe(run.segs[1]);
    expect(s.pracRaw(run, 12).t).toBe(2);
    expect(s.pracRaw(run, 16).t).toBe(5);
    expect(s.pracRaw(run, 5).t).toBe(0);

    expect(s.isPracFlag('wait')).toBe(true);
    expect(s.isPracFlag('hands')).toBe(false);
    expect(s.isPracChoice('hands')).toBe(true);
    expect(s.PRAC_KEY).toBe('etude-practice-v3');

    const mine = [{ i: 0 }, { i: 1 }];
    expect(s.pracEveryNote({ mine, judged: new Set([0, 1]) })).toBe(true);
    expect(s.pracEveryNote({ mine, judged: new Set([0]), completed: new Set([1]) })).toBe(true);
    expect(s.pracEveryNote({ mine, judged: new Set([0]) })).toBe(false);
    expect(s.pracEveryNote({ mine: [], judged: new Set() })).toBe(false);
  });

  it('builds fresh, unshared player state records', async () => {
    const s = await import('../../src/features/score-player/score-state.ts');
    const f = await import('../../src/features/score-player/score-falling.ts');
    const a = s.createAnState(), b = s.createAnState();
    expect(a).not.toBe(b);
    expect(a.selected).not.toBe(b.selected);
    expect(a.tool).toBe('select'); // no window: not a coarse pointer
    const narrow = s.createScoreState(400, 'fit');
    expect(narrow.zoom).toBe(0.9);
    expect(narrow.layout).toBe('fit');
    expect(s.createScoreState(1280, 'page').zoom).toBe(1);
    expect(s.createPracticeState().hands).toBe('both');
    expect(s.createPanelSide()).toMatchObject({ open: false, tab: 'now', w: 340 });
    const fa = f.createFallState(), fb = f.createFallState();
    expect(fa.lanes).not.toBe(fb.lanes);
    expect(fa.mode).toBe('score');
    expect(f.fallPalette('classic')).toBe(f.FALL_PAL.classic);
    expect(f.fallPalette('unknown')).toBe(f.FALL_COL);
  });

  it('registers Score Player hooks, keeps the mutable regression hooks writable and honours aborted enters', async () => {
    vi.stubGlobal('window', { innerWidth: 1280, matchMedia: () => ({ matches: false }) });
    const { createScorePlayerFeature } = await import('../../src/features/score-player/index.ts');
    const host = makeHost(PREFS);
    const feature = createScorePlayerFeature(host, makeShell());
    const target = {};
    feature.registerTestSurface?.(createTestSurfaceRegistry(target));

    expect(target.AN.notes).toEqual([]);
    expect(target.SCORE.playing).toBe(false);
    expect(target.FALL.mode).toBe('score');
    expect(target.SIDE.tab).toBe('now');
    expect(target.AN_TABS).toEqual(['now', 'piece', 'practice']);
    expect(typeof target.ensureAnalysisModules).toBe('function');
    expect(typeof target.scorePlay).toBe('function');
    expect(typeof target.fallDraw).toBe('function');
    expect(typeof target.pracStart).toBe('function');
    expect(Object.getOwnPropertyNames(target).length).toBeGreaterThan(270);

    const inflated = async () => 7;
    target.anInflatedSize = inflated;
    expect(target.anInflatedSize).toBe(inflated);
    const fixPedals = () => {};
    target.scoreFixPedals = fixPedals;
    expect(target.scoreFixPedals).toBe(fixPedals);

    expect(feature.isBusy?.()).toBe(false);
    expect(feature.modulesReady()).toBe(false);
    expect(feature.hasNotes()).toBe(false);
    expect(feature.currentRoute()).toEqual({ kind: 'catalog' });

    const aborted = new AbortController();
    aborted.abort();
    expect(feature.enter({ analysisRoute: { kind: 'builtin', id: 'x' } }, aborted.signal)).toBeUndefined();
    expect(host.store.data).not.toHaveBeenCalled();
  });

  it('round-trips score preferences between the shell copy and the live player state', async () => {
    vi.stubGlobal('window', { innerWidth: 1280, matchMedia: () => ({ matches: false }) });
    const { createScorePlayerFeature } = await import('../../src/features/score-player/index.ts');
    const feature = createScorePlayerFeature(makeHost(PREFS), makeShell());
    expect(feature.prefs()).toMatchObject({ scoreLook: 'paper', scoreFallMode: 'score', scoreLayoutExplicit: false });
    feature.applyPrefs(PREFS);
    expect(feature.prefs()).toEqual(PREFS);
    const target = {};
    feature.registerTestSurface?.(createTestSurfaceRegistry(target));
    expect(target.SCORE.look).toBe('night');
    expect(target.FALL.mode).toBe('fall');
    expect(target.SIDE).toMatchObject({ open: true, tab: 'piece', w: 420 });
  });
});

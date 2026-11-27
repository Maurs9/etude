import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSurfaceRegistry } from '../../src/domain/views.ts';

function makeHost() {
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
      data: vi.fn(() => ({ srs: {}, settings: { goal: 12, newPerDay: 5, earKeys: false }, sheet: {} })),
      saveNow: vi.fn(),
      saveSoon: vi.fn(),
      flushSaveSoon: vi.fn(),
      uiPrefs: () => ({ get: vi.fn(), set: vi.fn() }),
    },
    previews: { registerStopper: vi.fn(() => () => {}), registerSequenceHandler: vi.fn(() => () => {}), stopAll: vi.fn() },
    wake: { ping: vi.fn(), sync: vi.fn() },
    coach: { setContext: vi.fn(), refresh: vi.fn() },
    reduceMotion: () => false,
    testSurface: null,
  };
}

function makeShell() {
  const fn = () => vi.fn();
  return {
    audioEngine: { context: null }, keyboardView: { low: 48, oct: 4 }, keyEl: new Map(), held: new Set(), baseLow: 24, baseHigh: 96,
    view0: () => 'today', todayN: () => 20000, ensureAudio: vi.fn(() => null), pianoEnsure: vi.fn(async () => true),
    kbState: fn(), kbClear: fn(), kbClearAll: fn(), buildKeyboard: fn(), repaintHeld: fn(), reflowKeys: fn(), foldToView: (m) => m,
    viewHigh: () => 96, dockKeyInSight: fn(), syncMobileStartBars: fn(), refreshToday: fn(), playIvDir: fn(), rootName: () => 'C',
    ivName: () => 'P5', catLabel: (c) => c, progDisp: (n) => n, feelDisp: () => '', chordFormula: () => '', scaleFormula: () => '',
    songsFor: () => [], itemLabel: () => '', rdEsc: (s) => String(s), spelledName: () => 'C', isFlatKey: () => false,
    identifyChord: () => null, chordTargetPcs: () => [], inversionOf: () => 0, boxOf: () => 0, isDue: () => false, isNew: () => true,
    dueItems: () => [], newItemsAvail: () => [], newQuotaLeft: () => 5, seedPlacement: fn(), reviewItem: fn(), creditReview: fn(),
    currentStreak: () => 0,
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('practice feature slice', () => {
  it('imports the Practice modules in Node with zero DOM side effects', async () => {
    expect(typeof globalThis.window).toBe('undefined');
    expect(typeof globalThis.document).toBe('undefined');
    const [index, model] = await Promise.all([
      import('../../src/features/practice/index.ts'),
      import('../../src/features/practice/session-model.ts'),
    ]);
    expect(typeof index.createPracticeFeature).toBe('function');
    expect(typeof model).toBe('object');
  });

  it('registers the session, ear-on-keys and accompaniment hooks and honours aborted enters', async () => {
    vi.stubGlobal('window', { innerWidth: 1280, matchMedia: () => ({ matches: false }), setTimeout, clearTimeout });
    const { createPracticeFeature } = await import('../../src/features/practice/index.ts');
    const host = makeHost();
    const feature = createPracticeFeature(host, makeShell());
    const target = {};
    feature.registerTestSurface?.(createTestSurfaceRegistry(target));
    expect(target.SES.active).toBe(false);
    for (const name of ['startSession', 'endSession', 'nextQuestion', 'resolve', 'ekReset', 'prSetTopic', 'prChoice', 'accompStart', 'accompStop']) {
      expect(typeof target[name], name).toBe('function');
    }
    expect(feature.sesActive()).toBe(false);
    expect(feature.sesHome()).toBe('today');
    expect(feature.isBusy?.()).toBe(false);
    expect(feature.hintKeys()).toBeNull();
    expect(feature.hintPreviewActive()).toBe(false);
    expect(feature.sessionNeedsKeys('today')).toBe(false);

    const aborted = new AbortController();
    aborted.abort();
    expect(() => feature.enter({ practiceTopic: 'interval' }, aborted.signal)).not.toThrow();
    expect(host.metro.stop).not.toHaveBeenCalled();
  });
});

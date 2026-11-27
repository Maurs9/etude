import { describe, expect, it, vi } from 'vitest';
import { createTestSurfaceRegistry } from '../../src/domain/views.ts';
import {
  LEARN_GAPS,
  learnComplete,
  learnData,
  learnDueDays,
  learnDueList,
  learnGap,
  learnMarkLesson,
  learnUnitDone,
  learnUnitOf,
} from '../../src/core/learn-progress.ts';
import { LESSONS } from '../../src/locales/catalog.ts';

function makeHost(data = {}) {
  return {
    i18n: {
      t: (k) => k,
      localize: (k, fb) => fb || k,
      lang: () => 'en',
      spell: () => 'C',
      notation: () => 'letter',
      loadLearn: async () => {},
      chordDisp: () => 'Major',
      scaleDisp: (n) => n,
      invName: () => '',
      intervalLabel: () => 'Major 3rd',
      noteName: () => 'C4',
      pcName: () => 'C',
      slashLabel: () => 'C',
      formatChord: (r, s) => r + s,
      fillRoots: vi.fn(),
      stepLabel: (s) => (s === 2 ? 'T' : s === 1 ? 'S' : 'T+S'),
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
    metro: {
      getBpm: () => 80,
      isRunning: () => false,
      start: vi.fn(),
      stop: vi.fn(),
      click: vi.fn(),
      startDrone: vi.fn(),
      stopDrone: vi.fn(),
    },
    input: {
      subscribe: vi.fn(() => () => {}),
      heldMidis: () => [],
      heldPcs: () => [],
      isMidiLive: () => false,
      releaseLiveInput: vi.fn(),
      releaseFocusInput: vi.fn(),
    },
    dock: {
      sync: vi.fn(),
      setOpen: vi.fn(),
      isShown: () => false,
      clear: vi.fn(),
      mark: vi.fn(),
      clearKeyIfState: vi.fn(),
      setDegrees: vi.fn(),
      ensureVisible: vi.fn(),
      fixedBottomTop: () => 800,
      onReflow: vi.fn(() => () => {}),
    },
    nav: {
      show: vi.fn(),
      activeView: () => 'today',
      isPendingSaveProtected: () => false,
      setPendingSave: vi.fn(),
      nextReadDrillForUnits: vi.fn(() => null),
    },
    overlays: {
      pushModal: vi.fn(),
      popModal: vi.fn(),
      openCount: () => 0,
      focusView: vi.fn(),
      showLoadError: vi.fn(),
    },
    store: {
      data: () => data,
      saveNow: vi.fn(),
      saveSoon: vi.fn(),
      flushSaveSoon: vi.fn(),
      uiPrefs: () => ({ get: vi.fn(), set: vi.fn() }),
    },
    previews: {
      registerStopper: vi.fn(() => () => {}),
      registerSequenceHandler: vi.fn(() => () => {}),
      stopAll: vi.fn(),
    },
    wake: { ping: vi.fn(), sync: vi.fn() },
    coach: { setContext: vi.fn(), refresh: vi.fn() },
    reduceMotion: () => false,
    testSurface: null,
  };
}

describe('learn progress core', () => {
  it('initialises missing Learn stores and backfills learnRev from legacy learnDone', () => {
    const data = { learnDone: { keys: 100 } };
    const store = learnData(data);
    expect(store.learnDone).toEqual({ keys: 100 });
    expect(store.learnRev).toEqual({ keys: { last: 100, n: 0 } });
    expect(store.learnUnlock).toEqual({});
  });

  it('tracks spaced review due days and increments review count when completed while due', () => {
    const data = {};
    const firstLesson = LESSONS[0];
    expect(learnUnitOf(firstLesson.id)).toBe(0);
    expect(learnUnitDone(data, 0)).toBe(0);

    const first = learnComplete(data, firstLesson, 85, 200);
    expect(first).toEqual({ first: true, review: false });
    expect(learnUnitDone(data, 0)).toBe(1);
    expect(learnGap(data, firstLesson.id)).toBe(LEARN_GAPS[0]);
    expect(learnDueDays(data, firstLesson.id, 202)).toBeNull();
    expect(learnDueDays(data, firstLesson.id, 203)).toBe(3);
    expect(learnDueList(data, 203).map((l) => l.id)).toContain(firstLesson.id);

    const rev = learnComplete(data, firstLesson, 95, 204);
    expect(rev).toEqual({ first: false, review: true });
    expect(data.learnRev[firstLesson.id]).toEqual({ last: 204, n: 1, best: 95, rv: 204 });
    expect(learnGap(data, firstLesson.id)).toBe(LEARN_GAPS[1]);

    learnMarkLesson(data, firstLesson, false, 205);
    expect(data.learnDone[firstLesson.id]).toBeUndefined();
    expect(data.learnRev[firstLesson.id]).toBeUndefined();
  });
});

describe('learn feature slice', () => {
  it('imports all learn feature modules in Node with zero DOM side effects', async () => {
    const [learnMod, widgetsMod, demosMod] = await Promise.all([
      import('../../src/features/learn/index.ts'),
      import('../../src/features/learn/learn-widgets.ts'),
      import('../../src/features/learn/learn-staves-and-demos.ts'),
    ]);
    expect(typeof learnMod.createLearnFeature).toBe('function');
    expect(learnMod.lqNeed(5)).toBe(4);
    expect(learnMod.lgNorm('Măsură')).toBe('masura');
    expect(widgetsMod.lPitch(0, 0, 60)).toBe('C4');
    expect(widgetsMod.lPitch(0, 1, 61)).toBe('C#4');
    expect(widgetsMod.lCofN(0, false)).toBe(0);
    expect(widgetsMod.lCofN(7, false)).toBe(-5);
    expect(widgetsMod.lCofN(7, true)).toBe(7);
    expect(widgetsMod.lmTerm(120, 'en')).toBe('Allegro');
    expect(typeof demosMod.createLearnStavesAndDemos).toBe('function');
  });

  it('registers Learn test hooks including mutable renderLearn and respects aborted enter signals', async () => {
    const { createLearnFeature } = await import('../../src/features/learn/index.ts');
    const host = makeHost({});
    const feature = createLearnFeature(host);
    const target = {};
    feature.registerTestSurface?.(createTestSurfaceRegistry(target));

    expect(typeof target.renderLearn).toBe('function');
    expect(typeof target.learnGo).toBe('function');
    expect(typeof target.lqStart).toBe('function');
    expect(typeof target.lwCof).toBe('function');
    expect(typeof target.lStaffSvg).toBe('function');
    expect(typeof target.runDemo).toBe('function');
    expect(target.learnReady).toBeInstanceOf(Promise);

    // Mutable hook replacement must persist through the registry setter
    const orig = target.renderLearn;
    const stub = () => {};
    target.renderLearn = stub;
    expect(target.renderLearn).toBe(stub);
    target.renderLearn = orig;

    // Aborted enter signal must no-op without touching document
    const abort = new AbortController();
    abort.abort();
    expect(() => feature.enter({ learnLessonId: 'keys' }, abort.signal)).not.toThrow();
    feature.onProgressReset?.();
    expect(target.learnSel).toBe(0);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  ACCOMP_DEFAULT_PROG,
  buildAccompEvents,
  buildAccompVoicing,
  createAccompanimentController,
} from '../../src/features/practice/accompaniment.ts';
import { createSongBookController } from '../../src/features/practice/song-book.ts';

function makeHost() {
  const stoppers = new Set();
  return {
    stoppers,
    host: {
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
        stepLabel: () => 'T',
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
        getBpm: () => 90,
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
        activeView: () => 'practice',
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
        data: () => ({}),
        saveNow: vi.fn(),
        saveSoon: vi.fn(),
        flushSaveSoon: vi.fn(),
        uiPrefs: () => ({ get: vi.fn(), set: vi.fn() }),
      },
      previews: {
        registerStopper: vi.fn((fn) => {
          stoppers.add(fn);
          return () => stoppers.delete(fn);
        }),
        registerSequenceHandler: vi.fn(() => () => {}),
        stopAll: vi.fn(() => {
          for (const fn of stoppers) fn();
        }),
      },
      wake: { ping: vi.fn(), sync: vi.fn() },
      coach: { setContext: vi.fn(), refresh: vi.fn() },
      reduceMotion: () => false,
      testSurface: null,
    },
  };
}

describe('practice accompaniment module', () => {
  it('computes chord voicings within the comfortable middle register and builds full progression events', () => {
    const cMaj = buildAccompVoicing(0, [0, 'maj', 'I']);
    expect(cMaj.bass).toBe(36);
    expect(cMaj.fifth).toBe(43);
    expect(cMaj.right).toEqual([60, 64, 67]);

    const fMajInG = buildAccompVoicing(7, [5, 'maj', 'IV']);
    expect(fMajInG.bass).toBe(36);
    expect(fMajInG.right.every((m) => m >= 57 && m <= 72)).toBe(true);

    const built = buildAccompEvents(ACCOMP_DEFAULT_PROG, 0, 'block');
    expect(built.beatsTotal).toBeGreaterThan(0);
    expect(built.events.length).toBeGreaterThan(0);
    expect(built.events.some((e) => e.hand === 'L')).toBe(true);
    expect(built.events.some((e) => e.hand === 'R')).toBe(true);
  });

  it('instantiates cleanly in Node without DOM globals and updates state cleanly', () => {
    const { host } = makeHost();
    const ctrl = createAccompanimentController({
      host,
      isAlongWanted: () => false,
      getPracticeKey: () => 2,
      progDisp: (n) => n,
      rootName: () => 'D',
      updatePracticeModeHint: vi.fn(),
      getKeyElements: () => new Map(),
    });
    expect(ctrl.state.on).toBe(false);
    expect(ctrl.key()).toBe(2);
    ctrl.state.key = 2;
    expect(ctrl.voicing([0, 'maj', 'I']).bass).toBe(38);
    expect(ctrl.build().beatsTotal).toBeGreaterThan(0);
  });
});

describe('practice song-book module', () => {
  it('instantiates cleanly in Node, registers its preview stopper, and tracks direction state', () => {
    const { host, stoppers } = makeHost();
    const songs = createSongBookController({
      host,
      ivName: (s) => `iv-${s}`,
      playIvDir: vi.fn(),
      pianoEnsure: vi.fn(async () => true),
      setHintControlPressed: vi.fn(),
    });
    expect(stoppers.size).toBe(1);
    expect(songs.getDir()).toBe('asc');
    songs.setDir('desc');
    expect(songs.getDir()).toBe('desc');
    expect(songs.isPreviewing()).toBe(false);
    expect(() => host.previews.stopAll()).not.toThrow();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createTestSurfaceRegistry } from '../../src/domain/views.ts';

describe('explore feature slice', () => {
  it('imports with zero DOM or window side effects', async () => {
    // Importing in Node without document/window must succeed without touching globals.
    const mod = await import('../../src/features/explore/index.ts');
    expect(typeof mod.createExploreFeature).toBe('function');
  });

  it('registers its test surface hooks and respects aborted enter signals', async () => {
    const { createExploreFeature } = await import('../../src/features/explore/index.ts');
    const host = {
      i18n: {
        t: (k) => k,
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
      },
      audio: {
        ensure: vi.fn(),
        noteOn: vi.fn(),
        noteOff: vi.fn(),
        previewNote: vi.fn(),
        playInterval: vi.fn(),
        playChordMidis: vi.fn(),
        playScaleNotes: vi.fn(),
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
      },
      overlays: {
        pushModal: vi.fn(),
        popModal: vi.fn(),
        openCount: () => 0,
        focusView: vi.fn(),
      },
      store: {
        data: () => ({}),
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

    const feature = createExploreFeature(host);
    const target = {};
    const registry = createTestSurfaceRegistry(target);
    feature.registerTestSurface?.(registry);

    expect(typeof target.updateExplore).toBe('function');
    expect(typeof target.drawExploreStaff).toBe('function');
    expect(typeof target.renderCircle).toBe('function');
    expect(typeof target.exTab).toBe('function');
    expect(Array.isArray(target.COF_MAJ)).toBe(true);
    expect(target.EX_LEDGERS).toBe(5);

    // An aborted enter() must return without touching the DOM.
    const aborted = new AbortController();
    aborted.abort();
    expect(() => feature.enter(undefined, aborted.signal)).not.toThrow();

    // leave() and panic() are safe when not on explore view.
    expect(() => feature.leave('today')).not.toThrow();
    expect(() => feature.panic?.()).not.toThrow();
  });
});

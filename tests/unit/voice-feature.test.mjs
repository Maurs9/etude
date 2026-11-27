import { describe, expect, it, vi } from 'vitest';
import { createTestSurfaceRegistry } from '../../src/domain/views.ts';

describe('voice feature slice', () => {
  it('imports all voice modules in Node with zero DOM or window side effects', async () => {
    const [voiceMod, micMod, trxMod, singMod] = await Promise.all([
      import('../../src/features/voice/index.ts'),
      import('../../src/features/voice/voice-mic.ts'),
      import('../../src/features/voice/voice-transcribe.ts'),
      import('../../src/features/voice/voice-sing.ts'),
    ]);
    expect(typeof voiceMod.createVoiceFeature).toBe('function');
    expect(typeof micMod.micOpen).toBe('function');
    expect(trxMod.trxFreqToMidi(440)).toBe(69);
    expect(trxMod.trxDurLabel(1)).toBe('1/4');
    expect(trxMod.trxDurLabel(1.5)).toBe('1/4.');
    expect(singMod.ssNeed(2, 0)).toBe(2);
    expect(singMod.ssNeed(11, 0)).toBe(-1);

    const out = [];
    trxMod.trxPushVar(out, 480);
    expect(out).toEqual([0x83, 0x60]);
  });

  it('registers Voice/Transcribe/Sight-Singing test hooks and respects aborted enter signals', async () => {
    const { createVoiceFeature } = await import('../../src/features/voice/index.ts');
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
        ensure: vi.fn(() => null),
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
      },
      overlays: {
        pushModal: vi.fn(),
        popModal: vi.fn(),
        openCount: () => 0,
        focusView: vi.fn(),
      },
      store: {
        data: () => ({ singCleared: {} }),
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

    const feature = createVoiceFeature(host);
    const target = {};
    feature.registerTestSurface?.(createTestSurfaceRegistry(target));

    expect(target.SS_LEVELS.length).toBe(7);
    expect(target.voice).toEqual({ act: 'sing' });
    expect(target.sing.active).toBe(false);
    expect(target.trx.on).toBe(false);
    expect(typeof target.renderVoice).toBe('function');
    expect(typeof target.trxRender).toBe('function');
    expect(typeof target.ssCurNote).toBe('function');
    expect(feature.isBusy?.()).toBe(false);

    const aborted = new AbortController();
    aborted.abort();
    expect(() => feature.enter({ voiceAct: 'hum' }, aborted.signal)).not.toThrow();
    expect(target.voice.act).toBe('sing');
  });
});

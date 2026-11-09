import { describe, expect, it } from 'vitest';
import { SRT_INITIAL_STATE, srtTransition } from '../src/sight-reading/flow.ts';
import { SightReadingRecorder } from '../src/sight-reading/recorder.ts';

describe('sight-reading state machine', () => {
  const eventTypes = [
    'prepare', 'claim', 'claimed', 'blocked', 'startPreview', 'startNow', 'switchToPractice',
    'countInDone', 'finish', 'saved', 'saveFailed', 'retrySave', 'continueWithoutSave', 'interrupt', 'abandon',
  ];

  const setup = (mode = 'firstSight') => {
    let current = srtTransition(SRT_INITIAL_STATE, { type: 'prepare', mode, fingerprint: 'v1:test', attemptId: 'attempt-1' });
    if (mode === 'firstSight') {
      current = srtTransition(current, { type: 'claim' });
      current = srtTransition(current, { type: 'claimed' });
    }
    return current;
  };

  const legalTransitions = [
    ['idle', { type: 'prepare' }, 'preparing'],
    ['preparing:firstSight', { type: 'claim' }, 'claiming'],
    ['preparing:firstSight', { type: 'blocked', reason: 'unsupported' }, 'blocked'],
    ['preparing:firstSight', { type: 'abandon' }, 'abandoned'],
    ['preparing:firstSight', { type: 'interrupt' }, 'interrupted'],
    ['preparing:practice', { type: 'startPreview' }, 'countIn'],
    ['preparing:practice', { type: 'blocked', reason: 'unsupported' }, 'blocked'],
    ['preparing:practice', { type: 'abandon' }, 'abandoned'],
    ['preparing:practice', { type: 'interrupt' }, 'interrupted'],
    ['claiming', { type: 'claimed' }, 'preview'],
    ['claiming', { type: 'blocked', reason: 'already_exposed' }, 'blocked'],
    ['claiming', { type: 'abandon' }, 'abandoned'],
    ['claiming', { type: 'interrupt' }, 'interrupted'],
    ['preview', { type: 'startNow' }, 'countIn'],
    ['preview', { type: 'switchToPractice' }, 'preparing'],
    ['preview', { type: 'abandon' }, 'abandoned'],
    ['preview', { type: 'interrupt' }, 'interrupted'],
    ['countIn', { type: 'countInDone' }, 'playing'],
    ['countIn', { type: 'abandon' }, 'abandoned'],
    ['countIn', { type: 'interrupt' }, 'interrupted'],
    ['playing', { type: 'finish' }, 'completed'],
    ['playing', { type: 'interrupt' }, 'interrupted'],
    ['completed', { type: 'saved' }, 'saved'],
    ['completed', { type: 'saveFailed' }, 'pendingSave'],
    ['pendingSave', { type: 'saved' }, 'saved'],
    ['pendingSave', { type: 'retrySave' }, 'completed'],
    ['pendingSave', { type: 'continueWithoutSave' }, 'abandoned'],
    ['pendingSave', { type: 'abandon' }, 'abandoned'],
  ];

  function stateFor(source) {
    if (source === 'idle') return SRT_INITIAL_STATE;
    if (source === 'preparing:firstSight') return srtTransition(SRT_INITIAL_STATE, { type: 'prepare', mode: 'firstSight', fingerprint: 'v1:test', attemptId: 'attempt-1' });
    if (source === 'preparing:practice') return srtTransition(SRT_INITIAL_STATE, { type: 'prepare', mode: 'practice', fingerprint: 'v1:test' });
    if (source === 'claiming') return srtTransition(stateFor('preparing:firstSight'), { type: 'claim' });
    if (source === 'preview') return setup();
    if (source === 'countIn') return srtTransition(stateFor('preparing:practice'), { type: 'startPreview' });
    if (source === 'playing') return srtTransition(stateFor('countIn'), { type: 'countInDone' });
    if (source === 'completed') return srtTransition(stateFor('playing'), { type: 'finish' });
    if (source === 'saved') return srtTransition(stateFor('completed'), { type: 'saved' });
    if (source === 'abandoned') return srtTransition(stateFor('preview'), { type: 'abandon' });
    if (source === 'interrupted') return srtTransition(stateFor('playing'), { type: 'interrupt' });
    if (source === 'blocked') return srtTransition(stateFor('claiming'), { type: 'blocked', reason: 'unsupported' });
    return srtTransition(stateFor('completed'), { type: 'saveFailed' });
  }

  it.each(legalTransitions)('accepts %s → %s', (source, event, expected) => {
    expect(srtTransition(stateFor(source), event)).toMatchObject({ name: expected });
  });

  it.each([
    'idle', 'preparing:firstSight', 'preparing:practice', 'claiming', 'preview', 'countIn', 'playing', 'completed', 'pendingSave',
    'saved', 'abandoned', 'interrupted', 'blocked',
  ])('rejects every event not legal for %s', (source) => {
    const current = stateFor(source);
    for (const type of eventTypes) {
      const legal = legalTransitions.some(([candidate, event]) => candidate === source && event.type === type);
      if (!legal) expect(srtTransition(current, { type })).toEqual(current);
    }
  });

  it('accepts the first-attempt lifecycle and rejects illegal events', () => {
    let state = SRT_INITIAL_STATE;
    state = srtTransition(state, { type: 'prepare', fingerprint: 'v1:test' });
    state = srtTransition(state, { type: 'claim' });
    state = srtTransition(state, { type: 'claimed' });
    state = srtTransition(state, { type: 'startNow' });
    state = srtTransition(state, { type: 'countInDone' });
    state = srtTransition(state, { type: 'finish' });
    state = srtTransition(state, { type: 'saveFailed' });
    expect(srtTransition(state, { type: 'startNow' })).toEqual(state);
    expect(srtTransition(state, { type: 'saved' }).name).toBe('saved');
  });

  it('covers practice, interruption and pending-save transitions', () => {
    let state = srtTransition(SRT_INITIAL_STATE, { type: 'prepare', mode: 'practice', fingerprint: 'v1:p' });
    expect(srtTransition(state, { type: 'claim' })).toEqual(state);
    state = srtTransition(state, { type: 'startPreview' });
    expect(state.name).toBe('countIn');
    state = srtTransition(state, { type: 'countInDone' });
    state = srtTransition(state, { type: 'interrupt' });
    expect(state.name).toBe('interrupted');

    state = srtTransition(SRT_INITIAL_STATE, { type: 'prepare', fingerprint: 'v1:p', attemptId: 'a' });
    state = srtTransition(state, { type: 'claim' });
    state = srtTransition(state, { type: 'claimed' });
    state = srtTransition(state, { type: 'switchToPractice' });
    expect(state).toMatchObject({ name: 'preparing', mode: 'practice', attemptId: null });
    state = srtTransition(state, { type: 'startPreview' });
    state = srtTransition(state, { type: 'countInDone' });
    state = srtTransition(state, { type: 'finish' });
    state = srtTransition(state, { type: 'saveFailed' });
    expect(state.name).toBe('pendingSave');
    expect(srtTransition(state, { type: 'retrySave' }).name).toBe('completed');
    expect(srtTransition(state, { type: 'continueWithoutSave' }).name).toBe('abandoned');
    expect(srtTransition(state, { type: 'interrupt' })).toEqual(state);
  });
});

describe('sight-reading recorder', () => {
  it('filters excluded sources, duplicate attacks and pre-window holds', () => {
    const recorder = new SightReadingRecorder({ durationMs: 1000 });
    recorder.record('on', 60, 'midi', null, -300);
    recorder.record('off', 60, 'midi', 'physical', -200);
    recorder.record('on', 60, 'midi', null, 100);
    recorder.record('on', 60, 'midi', null, 200);
    recorder.record('on', 62, 'srClick', null, 200);
    recorder.record('on', 64, 'kb', null, 900);
    recorder.record('off', 64, 'kb', 'physical', 950);
    recorder.record('off', 60, 'midi', 'physical', 500);
    recorder.record('on', 60, 'midi', null, 600);
    expect(recorder.finish().map((input) => input.onMs)).toEqual([100, 600, 900]);
    expect(recorder.finish()[0].offMs).toBe(500);
  });

  it('keeps focus and reset release metadata', () => {
    const recorder = new SightReadingRecorder({ durationMs: 1000 });
    recorder.record('on', 60, 'kb', null, 10);
    recorder.record('off', 60, 'kb', 'focus', 20);
    recorder.record('on', 62, 'kb', null, 30);
    recorder.releaseAll('reset', 40);
    expect(recorder.finish().map((input) => input.releaseKind)).toEqual(['focus', 'reset']);
  });

  it('keeps held MIDI and BLE inputs open across focus release', () => {
    const recorder = new SightReadingRecorder({ durationMs: 1000 });
    recorder.record('on', 60, 'midi', null, 10);
    recorder.record('on', 62, 'ble', null, 11);
    recorder.record('on', 64, 'typing:a', null, 12);
    recorder.releaseFocus(20);
    expect(recorder.finish()).toEqual([
      { id: 'input-1', midi: 60, onMs: 10, offMs: null, source: 'midi', releaseKind: null },
      { id: 'input-2', midi: 62, onMs: 11, offMs: null, source: 'ble', releaseKind: null },
      { id: 'input-3', midi: 64, onMs: 12, offMs: 20, source: 'typing:a', releaseKind: 'focus' },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { SRT_INITIAL_STATE, srtTransition } from '../src/sight-reading/flow.ts';
import { SightReadingRecorder } from '../src/sight-reading/recorder.ts';

describe('sight-reading state machine', () => {
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
});

import { describe, expect, it } from 'vitest';
import { SRT_INITIAL_STATE, srtTransition } from '../src/sight-reading/flow.ts';

function state(mode = 'firstSight') {
  let current = srtTransition(SRT_INITIAL_STATE, {
    type: 'prepare',
    mode,
    fingerprint: 'v1:test',
    attemptId: mode === 'firstSight' ? 'attempt-1' : undefined,
  });
  if (mode === 'firstSight') {
    current = srtTransition(current, { type: 'claim' });
    current = srtTransition(current, { type: 'claimed' });
  }
  return current;
}

describe('sight-reading iteration 4 state transitions', () => {
  it('covers the practice count-in and playing states', () => {
    let current = state('practice');
    expect(current.name).toBe('preparing');
    current = srtTransition(current, { type: 'startPreview' });
    expect(current.name).toBe('countIn');
    current = srtTransition(current, { type: 'countInDone' });
    expect(current.name).toBe('playing');
    current = srtTransition(current, { type: 'finish' });
    expect(current.name).toBe('completed');
  });

  it('persists each terminal interruption path without accepting illegal events', () => {
    const preview = state();
    expect(srtTransition(preview, { type: 'interrupt' }).name).toBe('interrupted');
    expect(srtTransition(preview, { type: 'finish' })).toEqual(preview);

    let pending = srtTransition(preview, { type: 'startNow' });
    pending = srtTransition(pending, { type: 'countInDone' });
    pending = srtTransition(pending, { type: 'finish' });
    pending = srtTransition(pending, { type: 'saveFailed' });
    expect(pending.name).toBe('pendingSave');
    expect(srtTransition(pending, { type: 'continueWithoutSave' }).name).toBe('abandoned');
    expect(srtTransition(pending, { type: 'interrupt' })).toEqual(pending);
    expect(srtTransition(pending, { type: 'startNow' })).toEqual(pending);
  });

  it('covers every legal first-sight transition in order', () => {
    let current = state();
    for (const event of [
      { type: 'startNow' },
      { type: 'countInDone' },
      { type: 'finish' },
      { type: 'saved' },
    ]) {
      current = srtTransition(current, event);
    }
    expect(current.name).toBe('saved');
  });
});

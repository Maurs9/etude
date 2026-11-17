import { describe, expect, it } from 'vitest';
import { createInstantFeedbackTracker } from '../../src/sight-reading/instant-feedback.ts';

describe('instant feedback tracker for Sight-Reading Assessment', () => {
  it('grades matched pitches as good (<=100ms), near (101-180ms), and bad (>180ms)', () => {
    const tracker = createInstantFeedbackTracker([
      { nid: 1, midi: 60, onMs: 0 },
      { nid: 2, midi: 62, onMs: 1000 },
      { nid: 3, midi: 64, onMs: 2000 },
      { nid: 4, midi: 65, onMs: 3000 },
    ]);

    expect(tracker.processInput(60, 20)).toMatchObject({ matched: true, nid: 1, status: 'good' });
    expect(tracker.processInput(62, 1140)).toMatchObject({ matched: true, nid: 2, status: 'near' });
    expect(tracker.processInput(64, 1800)).toMatchObject({ matched: true, nid: 3, status: 'bad' });
    expect(tracker.processInput(65, 3100)).toMatchObject({ matched: true, nid: 4, status: 'good' });
  });

  it('reports wrong pitch with nearby expected midis without consuming expected note', () => {
    const tracker = createInstantFeedbackTracker([
      { nid: 10, midi: 64, onMs: 500 },
    ]);

    const wrong = tracker.processInput(65, 490);
    expect(wrong).toEqual({ matched: false, status: 'bad', expectedMidis: [64] });

    const retry = tracker.processInput(64, 520);
    expect(retry).toMatchObject({ matched: true, nid: 10, expectedMidi: 64, status: 'good' });
  });

  it('supports anyOctave matching and independent chord resolution', () => {
    const tracker = createInstantFeedbackTracker([
      { nid: 1, midi: 60, onMs: 1000 },
      { nid: 2, midi: 48, onMs: 1000 },
    ], { anyOctave: true });

    const a = tracker.processInput(72, 1010);
    const b = tracker.processInput(36, 1020);
    expect(a.matched && b.matched).toBe(true);
    expect(new Set([a.nid, b.nid])).toEqual(new Set([1, 2]));
  });

  it('tightens matching windows for repeated same-pitch notes', () => {
    const tracker = createInstantFeedbackTracker([
      { nid: 1, midi: 60, onMs: 1000 },
      { nid: 2, midi: 60, onMs: 1200 },
    ]);
    // 0.45 * 200 = 90ms window per note; 1100 is outside both windows.
    expect(tracker.processInput(60, 1100)).toEqual({ matched: false, status: 'bad', expectedMidis: [60] });
    expect(tracker.processInput(60, 1040)).toMatchObject({ matched: true, nid: 1, status: 'good' });
    expect(tracker.processInput(60, 1250)).toMatchObject({ matched: true, nid: 2, status: 'good' });
  });

  it('sweeps missed unplayed notes only once after window + grace period', () => {
    const tracker = createInstantFeedbackTracker([
      { nid: 5, midi: 60, onMs: 1000 },
      { nid: 6, midi: 62, onMs: 2000 },
    ]);

    expect(tracker.sweepMissed(1279)).toEqual([]);
    expect(tracker.sweepMissed(1281)).toEqual([5]);
    expect(tracker.sweepMissed(1500)).toEqual([]);
    expect(tracker.processInput(62, 2000)).toMatchObject({ matched: true, nid: 6, status: 'good' });
    expect(tracker.sweepMissed(2500)).toEqual([]);
  });
});

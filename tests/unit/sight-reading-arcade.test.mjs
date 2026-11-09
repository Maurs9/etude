import { describe, expect, it } from 'vitest';
import {
  ARCADE_MIN_TARGET_MS,
  srtArcadeComplete,
  srtArcadeMultiplier,
  srtArcadePoints,
  srtArcadeRecord,
  srtArcadeRemainingMs,
  srtArcadeStart,
  srtArcadeSummary,
  srtIsArcadeMode,
  srtIsMarathonBars,
} from '../../src/sight-reading/arcade.ts';

function run(state, outcomes, reactionMs = 1000, startMs = 0, stepMs = 100) {
  outcomes.forEach((outcome, index) => { state = srtArcadeRecord(state, outcome, reactionMs, startMs + index * stepMs); });
  return state;
}
const times = (count, outcome = 'correct') => Array.from({ length: count }, () => outcome);

describe('sight-reading arcade engine', () => {
  it('uses the documented combo multipliers and speed bonus', () => {
    expect([0, 4, 5, 14, 15, 29, 30].map(srtArcadeMultiplier)).toEqual([1, 1, 2, 2, 3, 3, 4]);
    expect(() => srtArcadeMultiplier(-1)).toThrow(RangeError);
    expect(() => srtArcadeMultiplier(1.5)).toThrow(RangeError);
    expect(srtArcadePoints(3000, 0, 1)).toBe(200);
    expect(srtArcadePoints(3000, 1500, 1)).toBe(150);
    expect(srtArcadePoints(3000, 4000, 30)).toBe(400);
    const state = run(srtArcadeStart('marathon', 0), times(5), 1500);
    expect(state).toMatchObject({ combo: 5, bestCombo: 5, score: 900, correct: 5 });
  });

  it('removes survival lives, speeds up every ten answers in a row, and ends at zero', () => {
    let state = srtArcadeStart('survival', 0);
    expect(state).toMatchObject({ lives: 3, targetMs: 3000, total: null, deadlineMs: null });
    state = run(state, times(10));
    expect(state).toMatchObject({ combo: 10, lives: 3, targetMs: 2820 });
    state = run(state, ['wrong', ...times(9), 'timeout'], 1000, 2000);
    expect(state).toMatchObject({ lives: 1, combo: 0, bestCombo: 10, targetMs: 2820, mistakes: 2, timeouts: 1, completed: false });
    state = srtArcadeRecord(state, 'wrong', 0, 5000);
    expect(state).toMatchObject({ lives: 0, combo: 0, mistakes: 3, completed: true, endedAtMs: 5000 });
    expect(srtArcadeRecord(state, 'correct', 100, 6000)).toBe(state);
    expect(srtArcadeSummary(state, 9000)).toMatchObject({ elapsedMs: 5000, correct: 19, answered: 22, timeouts: 1, lives: 0 });
  });

  it('never lets the survival window shrink below the minimum or grow', () => {
    let state = run(srtArcadeStart('survival', 0, { targetMs: 790 }), times(10));
    expect(state.targetMs).toBe(ARCADE_MIN_TARGET_MS);
    state = run(state, times(10));
    expect(state.targetMs).toBe(ARCADE_MIN_TARGET_MS);
    expect(run(srtArcadeStart('survival', 0, { targetMs: 700 }), times(10)).targetMs).toBe(700);
  });

  it('adds five seconds to Time Attack for every ten correct answers in a row', () => {
    let attack = srtArcadeStart('timeAttack', 100);
    expect(srtArcadeRemainingMs(attack, 100)).toBe(90_000);
    attack = run(attack, times(10), 500, 1000);
    expect(attack.deadlineMs).toBe(95_100);
    attack = run(attack, ['wrong', ...times(9)], 500, 3000);
    expect(attack.deadlineMs).toBe(95_100);
    attack = srtArcadeRecord(attack, 'correct', 500, 5000);
    expect(attack).toMatchObject({ combo: 10, deadlineMs: 100_100 });
    expect(srtArcadeRemainingMs(attack, 60_100)).toBe(40_000);
    const ended = srtArcadeRecord(attack, 'correct', 500, 100_100);
    expect(ended).toMatchObject({ completed: true, endedAtMs: 100_100, score: attack.score, correct: attack.correct });
    expect(srtArcadeRemainingMs(ended, 200_000)).toBe(0);
    expect(srtArcadeSummary(ended, 200_000).elapsedMs).toBe(100_000);
    expect(srtArcadeComplete(attack, 150_000).endedAtMs).toBe(100_100);
  });

  it('ends Marathon after four notes per bar and reports its tempo', () => {
    expect(srtArcadeStart('marathon', 0, { marathonBars: 32 }).total).toBe(128);
    let marathon = srtArcadeStart('marathon', 0, { marathonBars: 16 });
    expect(marathon).toMatchObject({ total: 64, marathonBars: 16, lives: null });
    marathon = run(marathon, [...times(48), ...times(15, 'wrong')], 500, 1000, 1000);
    expect(marathon.completed).toBe(false);
    marathon = srtArcadeRecord(marathon, 'correct', 500, 64_000);
    expect(marathon).toMatchObject({ completed: true, endedAtMs: 64_000, correct: 49, mistakes: 15 });
    expect(srtArcadeRecord(marathon, 'correct', 500, 65_000)).toBe(marathon);
    const summary = srtArcadeSummary(marathon, 90_000);
    expect(summary).toMatchObject({ answered: 64, elapsedMs: 64_000, averageReactionMs: 500, completed: true });
    expect(summary.accuracy).toBeCloseTo(49 / 64);
    expect(summary.notesPerMinute).toBeCloseTo(49 * 60 / 64);
  });

  it('closes a run early with the time it ended', () => {
    const marathon = run(srtArcadeStart('marathon', 0), times(2), 600, 500, 700);
    const done = srtArcadeComplete(marathon, 2000);
    expect(done).toMatchObject({ completed: true, endedAtMs: 2000 });
    expect(srtArcadeComplete(done, 5000)).toBe(done);
    expect(srtArcadeSummary(done, 9000)).toEqual({
      mode: 'marathon', score: 360, correct: 2, mistakes: 0, timeouts: 0, answered: 2, accuracy: 1, bestCombo: 2,
      averageReactionMs: 600, elapsedMs: 2000, notesPerMinute: 60, lives: null, completed: true,
    });
    expect(srtArcadeSummary(srtArcadeStart('survival', 100), 100)).toMatchObject({ accuracy: null, averageReactionMs: null, notesPerMinute: null });
  });

  it('rejects unknown modes, lengths, outcomes and times', () => {
    expect(srtIsArcadeMode('survival') && srtIsArcadeMode('timeAttack') && srtIsArcadeMode('marathon')).toBe(true);
    expect(srtIsArcadeMode('rush') || srtIsArcadeMode('classic') || srtIsArcadeMode(undefined)).toBe(false);
    expect(srtIsMarathonBars(64) && !srtIsMarathonBars(12) && !srtIsMarathonBars('16')).toBe(true);
    expect(() => srtArcadeStart('classic', 0)).toThrow(RangeError);
    expect(() => srtArcadeStart('marathon', 0, { marathonBars: 12 })).toThrow(RangeError);
    for (const targetMs of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => srtArcadeStart('survival', 0, { targetMs })).toThrow(RangeError);
    }
    expect(() => srtArcadeStart('survival', -1)).toThrow(RangeError);
    const state = srtArcadeStart('survival', 0);
    expect(() => srtArcadeRecord(state, 'maybe', 0, 0)).toThrow(RangeError);
    expect(() => srtArcadeRecord(state, 'correct', -1, 0)).toThrow(RangeError);
    expect(() => srtArcadeRecord(state, 'correct', 0, Number.NaN)).toThrow(RangeError);
    expect(() => srtArcadeComplete(state, -1)).toThrow(RangeError);
  });
});

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  SRT_SECURE_SCORE, srtBookId, srtBookStateDefault, srtBookTally, srtChooseLevel, srtDailyId, srtEnsureDaily, srtFocusId, srtFocusTally,
  srtKeyScores, srtKeyStatus, srtLevelAverage, srtLevelReady, srtNormalizeBookState, srtPiecesRead, srtRecordResult, srtStreak,
} from '../../src/sight-reading/progress.ts';
import { srtDailyPlan } from '../../src/sight-reading/book.ts';

const DAY = '2026-11-13';
const play = (state, changes = {}) => srtRecordResult(state, { id: srtBookId(3, 1), level: 3, key: 'C', score: 90, stars: 2, firstSight: true, date: DAY, ...changes });
const many = (state, count, changes = () => ({})) => Array.from({ length: count }, (_, index) => index).reduce((acc, index) => play(acc, { id: srtBookId(3, index + 1), ...changes(index) }), state);

describe('reading book state', () => {
  it('starts empty at level 1 in mixed keys', () => {
    expect(srtBookStateDefault()).toEqual({ v: 1, level: 1, focusKey: null, pieces: {}, recent: {}, daily: null, days: [] });
    expect(srtBookId(3, 17)).toBe('b3.17');
    expect(srtFocusId(3, 'F#m', 2)).toBe('f3.F#m.2');
    expect(srtDailyId(DAY, 4)).toBe('d2026-11-13.4');
  });

  it('keeps the best score, the most stars, the tries and the first-sight score of a piece', () => {
    let state = play(srtBookStateDefault(), { score: 71.6, stars: 1 });
    expect(state.pieces['b3.1']).toEqual({ best: 72, stars: 1, tries: 1, first: 72 });
    state = play(state, { score: 95, stars: 3, firstSight: false });
    expect(state.pieces['b3.1']).toEqual({ best: 95, stars: 3, tries: 2, first: 72 });
    state = play(state, { score: 40, stars: 0, firstSight: false });
    expect(state.pieces['b3.1']).toEqual({ best: 95, stars: 3, tries: 3, first: 72 });
    // A piece first played as practice has no first-sight score.
    const practice = play(srtBookStateDefault(), { firstSight: false });
    expect(practice.pieces['b3.1'].first).toBeNull();
    expect(practice.recent).toEqual({});
    expect(play(srtBookStateDefault(), { score: 140 }).pieces['b3.1'].best).toBe(100);
    expect(play(srtBookStateDefault(), { score: -3 }).pieces['b3.1'].best).toBe(0);
    expect(srtBookStateDefault().pieces).toEqual({});
  });

  it('counts a first-sight score once, for the key and for the level', () => {
    let state = play(srtBookStateDefault(), { score: 80 });
    state = play(state, { score: 100, firstSight: true });
    expect(state.recent).toEqual({ '3|C': [80], 3: [80] });
    state = play(state, { id: srtBookId(3, 2), key: 'G', score: 60 });
    expect(state.recent).toEqual({ '3|C': [80], '3|G': [60], 3: [80, 60] });
    // A run in a pinned key counts for the key, not for reading in mixed keys.
    state = play(state, { id: srtFocusId(3, 'G', 1), key: 'G', score: 70 });
    expect(state.recent).toEqual({ '3|C': [80], '3|G': [60, 70], 3: [80, 60] });
    // A long piece is partly below its level: it is stored like any piece, but counts for neither the key nor the level.
    const before = state.recent;
    state = play(state, { id: 'l2026-11-14.0', key: 'C', score: 100 });
    expect(state.pieces['l2026-11-14.0']).toEqual({ best: 100, stars: 2, tries: 1, first: 100 });
    expect(state.recent).toEqual(before);
    const long = many(srtBookStateDefault(), 20, (index) => ({ score: index }));
    expect(long.recent['3|C']).toEqual([12, 13, 14, 15, 16, 17, 18, 19]);
    expect(long.recent[3]).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it('calls a key secure after four first-sight pieces that average 85', () => {
    const state = srtBookStateDefault();
    expect(srtKeyStatus(state, 3, 'C')).toBe('new');
    expect(srtKeyStatus(many(state, 3, () => ({ score: 100 })), 3, 'C')).toBe('started');
    expect(srtKeyStatus(many(state, 4, () => ({ score: 85 })), 3, 'C')).toBe('secure');
    expect(srtKeyStatus(many(state, 4, () => ({ score: 84 })), 3, 'C')).toBe('started');
    expect(srtKeyStatus(many(state, 4, () => ({ score: 100 })), 4, 'C')).toBe('new');
    expect(srtKeyStatus(many(state, 4, () => ({ score: 100 })), 3, 'G')).toBe('new');
    expect(SRT_SECURE_SCORE).toBe(85);
    expect(srtKeyScores(many(state, 4, (index) => ({ key: index < 2 ? 'C' : 'G', score: index < 2 ? 90 : 61 })), 3)).toEqual({ C: 90, G: 61 });
    expect(srtKeyScores(state, 3)).toEqual({});
  });

  it('suggests the next level after 16 first-sight pieces in mixed keys that average 85', () => {
    const state = srtBookStateDefault();
    expect(srtLevelReady(many(state, 15, () => ({ score: 100 })), 3)).toBe(false);
    expect(srtLevelReady(many(state, 16, () => ({ score: 85 })), 3)).toBe(true);
    expect(srtLevelReady(many(state, 16, () => ({ score: 84 })), 3)).toBe(false);
    // Level 8 has no next level.
    expect(srtLevelReady(many(state, 16, (index) => ({ score: 100, level: 8, id: srtBookId(8, index + 1) })), 8)).toBe(false);
    expect(srtLevelAverage(state, 3)).toBeNull();
    expect(srtLevelAverage(many(state, 12, (index) => ({ score: index < 2 ? 0 : 90 })), 3)).toBe(90);
    expect(srtLevelAverage(many(state, 4, (index) => ({ score: 50 + index * 10 })), 3)).toBe(65);
  });

  it('counts the pieces done and finds the next one', () => {
    let state = srtBookStateDefault();
    expect(srtBookTally(state, 3)).toEqual({ done: 0, next: 1 });
    state = play(play(state), { id: srtBookId(3, 3) });
    expect(srtBookTally(state, 3)).toEqual({ done: 2, next: 2 });
    expect(srtBookTally(state, 4)).toEqual({ done: 0, next: 1 });
    expect(srtBookTally(many(state, 96), 3)).toEqual({ done: 96, next: null });
    state = play(state, { id: srtFocusId(3, 'G', 1), key: 'G' });
    expect(srtFocusTally(state, 3, 'G')).toEqual({ done: 1, next: 2 });
    expect(srtFocusTally(state, 3, 'C')).toEqual({ done: 0, next: 1 });
    expect(srtPiecesRead(state)).toBe(3);
  });

  it('counts the days in a row with a piece read', () => {
    let state = srtBookStateDefault();
    expect(srtStreak(state, DAY)).toBe(0);
    for (const date of ['2026-11-09', '2026-11-11', '2026-11-12', '2026-11-13']) state = play(state, { date, id: srtBookId(3, Number(date.slice(-2))) });
    expect(state.days).toEqual(['2026-11-09', '2026-11-11', '2026-11-12', '2026-11-13']);
    expect(srtStreak(state, DAY)).toBe(3);
    expect(srtStreak(state, '2026-11-14')).toBe(3);
    expect(srtStreak(state, '2026-11-15')).toBe(0);
    expect(srtStreak(play(srtBookStateDefault(), { date: '2026-03-01' }), '2026-03-01')).toBe(1);
    // Across a month and a year boundary.
    let turn = srtBookStateDefault();
    for (const date of ['2026-12-31', '2027-01-01']) turn = play(turn, { date, id: srtBookId(3, Number(date.slice(-2))) });
    expect(srtStreak(turn, '2027-01-01')).toBe(2);
  });

  it('draws the daily set once a day, and again when the level or the pinned key changes', () => {
    const state = srtChooseLevel(srtBookStateDefault(), 3);
    const first = srtEnsureDaily(state, DAY);
    expect(first.daily).toMatchObject({ date: DAY, level: 3, focusKey: null, done: [null, null, null, null, null] });
    expect(first.daily.slots).toEqual(srtDailyPlan(DAY, 3));
    expect(srtEnsureDaily(first, DAY)).toBe(first);
    // Scores that come in during the day do not change the set.
    const played = play(first, { id: srtDailyId(DAY, 1), score: 88 });
    expect(played.daily.done).toEqual([null, 88, null, null, null]);
    expect(srtEnsureDaily(played, DAY)).toBe(played);
    expect(play(played, { id: srtDailyId(DAY, 1), score: 60, firstSight: false }).daily.done[1]).toBe(88);
    expect(srtEnsureDaily(played, '2026-11-14').daily).toMatchObject({ date: '2026-11-14', done: [null, null, null, null, null] });
    // Before a piece of the set is played, another level or a pinned key draws the set again.
    const pinned = srtEnsureDaily(srtChooseLevel(first, 3, 'Em'), DAY);
    expect(pinned.daily.slots.map((slot) => slot.key)).toEqual(['Em', 'Em', 'Em', 'Em', 'Em']);
    expect(pinned.daily.done).toEqual([null, null, null, null, null]);
    expect(srtEnsureDaily(srtChooseLevel(first, 4), DAY).daily.level).toBe(4);
    // After a piece of the set was played, the set stays for the day: its ids keep meaning the same pieces.
    const other = srtChooseLevel(played, 4, 'Em');
    expect(srtEnsureDaily(other, DAY)).toBe(other);
    expect(other.daily).toMatchObject({ level: 3, focusKey: null, done: [null, 88, null, null, null] });
    expect(srtEnsureDaily(other, '2026-11-14').daily).toMatchObject({ level: 4, focusKey: 'Em' });
    // A result of another day's set does not mark today's.
    expect(play(first, { id: srtDailyId('2026-11-12', 1) }).daily.done).toEqual([null, null, null, null, null]);
    expect(() => srtChooseLevel(state, 9)).toThrow(RangeError);
    expect(() => srtChooseLevel(state, 3, 'H')).toThrow(RangeError);
    expect(srtChooseLevel(pinned, 5).focusKey).toBe('Em');
    // A daily set in a pinned key counts for the key, not for reading in mixed keys.
    const inKey = play(pinned, { id: srtDailyId(DAY, 1), key: 'Em', score: 91 });
    expect(inKey.recent).toEqual({ '3|Em': [91] });
    expect(play(first, { id: srtDailyId(DAY, 1), key: 'G', score: 91 }).recent).toEqual({ '3|G': [91], 3: [91] });
    expect(srtChooseLevel(pinned, 5, null).focusKey).toBeNull();
  });

  it('uses the weakest and the newest key for the daily set', () => {
    let state = srtChooseLevel(srtBookStateDefault(), 3);
    state = play(state, { id: 'b3.1', key: 'C', score: 95 });
    state = play(state, { id: 'b3.2', key: 'G', score: 55 });
    state = play(state, { id: 'b3.3', key: 'D', score: 80 });
    const keys = srtEnsureDaily(state, DAY).daily.slots.slice(1, 4).map((slot) => slot.key);
    expect(keys[0]).toBe('D');
    expect(keys[1]).toBe('G');
  });
});

describe('reading book state from storage', () => {
  it('replaces what is missing or malformed with defaults', () => {
    expect(srtNormalizeBookState(undefined)).toEqual(srtBookStateDefault());
    expect(srtNormalizeBookState('x')).toEqual(srtBookStateDefault());
    expect(srtNormalizeBookState([])).toEqual(srtBookStateDefault());
    const raw = {
      v: 7, level: 12, focusKey: 'H', extra: true,
      pieces: { 'b3.1': { best: 90, stars: 5, tries: 0, first: 'x' }, bad: { best: 'x' }, 'b3.2': { best: 50, stars: 2, tries: 3, first: 45 }, 'b3.3': 7 },
      recent: { 3: [50, 'x', 120, 70], '3|C': Array.from({ length: 12 }, (_, index) => index), junk: 'x', empty: [] },
      daily: { date: 'yesterday' },
      days: ['2026-11-13', 'x', '2026-11-12', '2026-11-13'],
    };
    expect(srtNormalizeBookState(raw)).toEqual({
      v: 1, level: 1, focusKey: null,
      pieces: { 'b3.1': { best: 90, stars: 0, tries: 1, first: null }, 'b3.2': { best: 50, stars: 2, tries: 3, first: 45 } },
      recent: { 3: [50, 70], '3|C': [4, 5, 6, 7, 8, 9, 10, 11] },
      daily: null,
      days: ['2026-11-12', '2026-11-13'],
    });
  });

  it('reads back a state it wrote', () => {
    let state = srtEnsureDaily(srtChooseLevel(srtBookStateDefault(), 4, 'Bb'), DAY);
    state = play(state, { id: srtDailyId(DAY, 2), level: 4, key: 'Bb', score: 77 });
    state = play(state, { id: srtBookId(4, 9), level: 4, key: 'D' });
    expect(srtNormalizeBookState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('drops a daily set that is not five valid slots', () => {
    const good = srtEnsureDaily(srtBookStateDefault(), DAY);
    const copy = JSON.parse(JSON.stringify(good));
    copy.daily.slots.pop();
    expect(srtNormalizeBookState(copy).daily).toBeNull();
    const bad = JSON.parse(JSON.stringify(good));
    bad.daily.slots[2].key = 'H';
    expect(srtNormalizeBookState(bad).daily).toBeNull();
    const odd = JSON.parse(JSON.stringify(good));
    odd.daily.done = [50, 'x'];
    expect(srtNormalizeBookState(odd).daily.done).toEqual([50, null, null, null, null]);
  });

  it('gives defaults for every saved record that has no book yet', async () => {
    for (const name of ['ptt-v3-legacy.json', 'ptt-v3-minimal.json']) {
      const saved = JSON.parse(await readFile(new URL(`../fixtures/storage/${name}`, import.meta.url), 'utf8'));
      expect(srtNormalizeBookState(saved.data?.reading?.book), name).toEqual(srtBookStateDefault());
    }
  });
});

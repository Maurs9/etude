import { describe, expect, it } from 'vitest';
import { CATS, INTRO_CH, INTRO_IV, INTRO_SC, ITEMS, ITEM_BY_ID, isCatKey } from '../../src/core/trainer-items.ts';
import { isSubset, randItem, setEq, shuffle } from '../../src/core/collections.ts';

describe('core trainer items', () => {
  it('builds one unique, indexed item per interval, chord, scale and progression in introduction order', () => {
    const ids = ITEMS.map((it) => it.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const it of ITEMS) expect(ITEM_BY_ID[it.id]).toBe(it);
    expect(ITEMS.filter((it) => it.cat === 'interval').map((it) => it.semi)).toEqual(INTRO_IV);
    expect(ITEMS.filter((it) => it.cat === 'chord').map((it) => it.short)).toEqual(INTRO_CH.filter((s) => ITEM_BY_ID['ch:' + s]));
    expect(ITEMS.filter((it) => it.cat === 'scale').length).toBeLessThanOrEqual(INTRO_SC.length);
    expect(ITEMS.some((it) => it.cat === 'prog')).toBe(true);
    expect(ITEM_BY_ID['iv:7']).toMatchObject({ cat: 'interval', semi: 7, intro: 0 });
    expect(isCatKey('chord')).toBe(true);
    expect(isCatKey('melody')).toBe(false);
    expect(Object.keys(CATS)).toEqual(['interval', 'chord', 'scale', 'prog']);
  });
});

describe('core collections', () => {
  it('compares, samples and shuffles without mutating the source', () => {
    expect(setEq([1, 2], [1, 2])).toBe(true);
    expect(setEq([1, 2], [2, 1])).toBe(false);
    expect(setEq([1], [1, 2])).toBe(false);
    expect(isSubset([1, 3], [1, 2, 3])).toBe(true);
    expect(isSubset([4], [1, 2, 3])).toBe(false);
    expect([1, 2, 3]).toContain(randItem([1, 2, 3]));
    const src = [1, 2, 3, 4, 5];
    const out = shuffle(src);
    expect(src).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual(src);
  });
});

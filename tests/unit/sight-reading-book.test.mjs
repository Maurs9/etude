import { describe, expect, it } from 'vitest';
import {
  SRT_BOOK_PIECES, SRT_FOCUS_PIECES, srtBook, srtBookEntry, srtBookPiece, srtBookUnits, srtDailyPiece, srtDailyPlan,
  srtFocusPiece, srtFocusRun,
} from '../../src/sight-reading/book.ts';
import { srtFingerprint, srtLevelFingerprint } from '../../src/sight-reading/fingerprint.ts';
import { srtGenerate } from '../../src/sight-reading/generator.ts';
import { srtKeyPool, srtLevel, srtReadingKey } from '../../src/sight-reading/levels.ts';
import { srtMelodyLine } from '../../src/sight-reading/patterns.ts';
import { srtRuleViolations, srtSubBand } from '../../src/sight-reading/rules.ts';

const LEVEL_IDS = [1, 2, 3, 4, 5, 6, 7, 8];
const LONG = 240000;
const shape = (piece) => JSON.stringify([piece.meter, piece.bars, srtMelodyLine(piece).map((note) => [note.onset, note.duration, note.line, note.alter])]);

describe('the book of a level', () => {
  it('has 12 units: new keys first, a mix after every second new key, a level check at the end', () => {
    const kinds = (level) => srtBookUnits(level).map((unit) => (unit.kind === 'newKey' ? unit.keys[0] : `${unit.kind}${unit.keys.length}`));
    expect(kinds(1)).toEqual(['C', 'G', 'mix2', 'F', 'Am', 'mix4', 'Dm', 'mix5', 'mix5', 'mix5', 'mix5', 'check5']);
    expect(kinds(2)).toEqual(['easy3', ...Array.from({ length: 10 }, () => 'mix5'), 'check5']);
    expect(kinds(3)).toEqual(['easy3', 'D', 'Bb', 'mix7', 'Em', 'Gm', 'mix9', 'mix9', 'mix9', 'mix9', 'mix9', 'check9']);
    expect(kinds(8)).toEqual(['easy3', 'B', 'Db', 'mix19', 'F#', 'C#m', 'mix21', 'G#m', 'Bbm', 'mix23', 'Ebm', 'check24']);
    for (const level of LEVEL_IDS) {
      const units = srtBookUnits(level);
      expect(units).toHaveLength(12);
      expect(units.map((unit) => unit.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      expect([...units[11].keys].sort()).toEqual(srtKeyPool(level).map((key) => key.id).sort());
      if (level > 1) expect(units[0].keys).toEqual(['C', 'G', 'F']);
      expect(units.filter((unit) => unit.kind === 'newKey').map((unit) => unit.keys[0])).toEqual([...srtLevel(level).newKeys]);
    }
    expect(() => srtBookUnits(9)).toThrow(RangeError);
  });

  it('places each number in a unit, a key and a third of the difficulty band', () => {
    expect(srtBookEntry(1, 1)).toMatchObject({ level: 1, number: 1, position: 0, key: 'C', third: 0, twinOf: null });
    expect(srtBookEntry(1, 8)).toMatchObject({ position: 7, key: 'C', third: 2 });
    expect(srtBookEntry(1, 9)).toMatchObject({ position: 0, key: 'G' });
    expect(srtBookEntry(1, 96).unit.kind).toBe('check');
    for (const level of LEVEL_IDS) {
      for (let number = 1; number <= SRT_BOOK_PIECES; number += 1) {
        const entry = srtBookEntry(level, number);
        expect(entry.unit.keys).toContain(entry.key);
        expect(entry.third).toBe(entry.position < 3 ? 0 : entry.position < 6 ? 1 : 2);
        expect(entry.unit.index).toBe(Math.floor((number - 1) / 8));
      }
      // A mix changes key from piece to piece.
      for (const unit of srtBookUnits(level).filter((item) => item.keys.length > 1)) {
        const keys = Array.from({ length: 8 }, (_, position) => srtBookEntry(level, unit.index * 8 + position + 1).key);
        expect(new Set(keys).size, `level ${level} unit ${unit.index + 1}`).toBeGreaterThan(1);
        keys.forEach((key, position) => {
          if (position > 0 && position !== 3 && position !== 4) expect(key).not.toBe(keys[position - 1]);
        });
      }
    }
    expect(() => srtBookEntry(1, 0)).toThrow(RangeError);
    expect(() => srtBookEntry(1, 97)).toThrow(RangeError);
    expect(() => srtBookEntry(1, 1.5)).toThrow(RangeError);
  });

  it('G15: gives 96 different pieces, each inside its rules, key and third of the band', () => {
    for (const level of LEVEL_IDS) {
      const book = srtBook(level);
      expect(book).toHaveLength(SRT_BOOK_PIECES);
      expect(new Set(book.map(srtLevelFingerprint)).size, `level ${level}`).toBe(SRT_BOOK_PIECES);
      book.forEach((piece, index) => {
        const entry = srtBookEntry(level, index + 1);
        const label = `level ${level} number ${index + 1}`;
        expect(piece.level, label).toBe(level);
        expect(piece.key.id, label).toBe(entry.key);
        expect(srtRuleViolations(piece), label).toEqual([]);
        if (entry.twinOf === null) {
          const [low, high] = srtSubBand(level, entry.third);
          expect(piece.difficulty, label).toBeGreaterThanOrEqual(low);
          expect(piece.difficulty, label).toBeLessThanOrEqual(high);
        }
      });
    }
  }, LONG);

  it('G1: a number always opens the same piece', () => {
    expect(srtBookPiece(3, 17)).toBe(srtBook(3)[16]);
    expect(srtBookPiece(3, 17)).toEqual(srtBookPiece(3, 17));
    expect(() => srtBookPiece(3, 97)).toThrow(RangeError);
  }, LONG);

  it('repeats the third piece of a mix in another key of the same mode', () => {
    let twins = 0;
    let exact = 0;
    for (const level of LEVEL_IDS) {
      for (let number = 1; number <= SRT_BOOK_PIECES; number += 1) {
        const entry = srtBookEntry(level, number);
        if (entry.twinOf === null) continue;
        expect(entry.position).toBe(3);
        expect(entry.twinOf).toBe(number - 1);
        const model = srtBookEntry(level, entry.twinOf);
        expect(entry.key).not.toBe(model.key);
        expect(srtReadingKey(entry.key).mode).toBe(srtReadingKey(model.key).mode);
        twins += 1;
        if (shape(srtBookPiece(level, number)) === shape(srtBookPiece(level, entry.twinOf))) exact += 1;
      }
    }
    expect(twins).toBeGreaterThan(60);
    // A few twins cannot be moved (the hands would cross): those are new pieces.
    expect(exact / twins).toBeGreaterThan(0.85);
    expect(srtBookEntry(1, 20).twinOf).toBe(19);
    expect(srtBookEntry(1, 4).twinOf).toBeNull();
  }, LONG);

  it('pins the generator: the book does not change unless these fingerprints are changed on purpose', () => {
    const pins = LEVEL_IDS.map((level) => [1, 48, 96].map((number) => srtLevelFingerprint(srtBookPiece(level, number))).join(' '));
    expect(pins).toMatchInlineSnapshot(`
      [
        "v2:5ca9acc3827471b5 v2:31a6ccff7491d460 v2:26fa4f03396a4049",
        "v2:7f595a5d6906976c v2:41b5e246a542ac7c v2:c3200a85e890682f",
        "v2:718c8345065aaa07 v2:04097095cbfb770f v2:433a1b9b5de1e58a",
        "v2:eaf19f0b2a1b5b6f v2:d1a292011c866d39 v2:fc2b1781fd399e5e",
        "v2:2c1f4e14bc0d4b24 v2:706ee2f29b3f6604 v2:497018f75112e1ba",
        "v2:1cfdcd4481e09ebb v2:df4a4bd33cec68b8 v2:5985681d94cd4d67",
        "v2:6255836b20fc2edc v2:6b3e38254464ef99 v2:ff15e3969caa2c1d",
        "v2:11f5beb2890f2654 v2:4ae5e1b03f47ef95 v2:a4eee3ba01e5a2a5",
      ]
    `);
  }, LONG);
});

describe('a run in one key', () => {
  it('gives 20 different pieces in the key, none of them in the book, rising through the band', () => {
    for (const [level, key] of [[1, 'C'], [3, 'F#'], [6, 'Am'], [8, 'G#m']]) {
      const run = srtFocusRun(level, key);
      expect(run).toHaveLength(SRT_FOCUS_PIECES);
      const prints = run.map(srtLevelFingerprint);
      expect(new Set(prints).size).toBe(SRT_FOCUS_PIECES);
      const book = new Set(srtBook(level).map(srtLevelFingerprint));
      run.forEach((piece, index) => {
        expect(piece.key.id).toBe(key);
        expect(book.has(prints[index])).toBe(false);
        expect(srtRuleViolations(piece)).toEqual([]);
        const [low, high] = srtSubBand(level, index < 7 ? 0 : index < 14 ? 1 : 2);
        expect(piece.difficulty).toBeGreaterThanOrEqual(low);
        expect(piece.difficulty).toBeLessThanOrEqual(high);
      });
      expect(srtFocusPiece(level, key, 5)).toBe(run[4]);
    }
    expect(() => srtFocusPiece(1, 'C', 21)).toThrow(RangeError);
    expect(() => srtFocusRun(1, 'H')).toThrow(RangeError);
  }, LONG);
});

describe('the daily set', () => {
  it('has five pieces: one easier, three at the level, one stretch', () => {
    const plan = srtDailyPlan('2026-11-13', 3);
    expect(plan.map((slot) => [slot.slot, slot.role, slot.level])).toEqual([[0, 'easier', 2], [1, 'level', 3], [2, 'level', 3], [3, 'level', 3], [4, 'stretch', 4]]);
    expect(srtDailyPlan('2026-11-13', 1).map((slot) => slot.level)).toEqual([1, 1, 1, 1, 2]);
    expect(srtDailyPlan('2026-11-13', 8).map((slot) => slot.level)).toEqual([7, 8, 8, 8, 8]);
    for (const level of LEVEL_IDS) {
      const slots = srtDailyPlan('2026-11-13', level);
      const pool = srtKeyPool(level).map((key) => key.id);
      for (const slot of slots.slice(1, 4)) expect(pool).toContain(slot.key);
      expect(new Set(slots.slice(1, 4).map((slot) => slot.key)).size).toBe(3);
      expect(srtKeyPool(slots[0].level).map((key) => key.id)).toContain(slots[0].key);
      expect(srtKeyPool(slots[4].level).map((key) => key.id).slice(0, 3)).toContain(slots[4].key);
    }
  });

  it('puts the newest key and the weakest key among the three level pieces', () => {
    const plan = srtDailyPlan('2026-11-13', 3, { scores: { C: 95, G: 60, F: 90, D: 88 } });
    expect(plan[1].key).toBe('D');
    expect(plan[2].key).toBe('G');
    expect(['C', 'F', 'Am', 'Dm', 'Bb', 'Em', 'Gm']).toContain(plan[3].key);
    // Only one key played: it is both the newest and the weakest, and the pool fills the rest.
    const one = srtDailyPlan('2026-11-13', 3, { scores: { C: 70 } });
    expect(one[1].key).toBe('C');
    expect(new Set(one.slice(1, 4).map((slot) => slot.key)).size).toBe(3);
  });

  it('keeps every piece in a pinned key', () => {
    const plan = srtDailyPlan('2026-11-13', 3, { focusKey: 'F#m' });
    expect(plan.map((slot) => slot.key)).toEqual(['F#m', 'F#m', 'F#m', 'F#m', 'F#m']);
    expect(plan.map((slot) => slot.level)).toEqual([2, 3, 3, 3, 4]);
    expect(() => srtDailyPlan('2026-11-13', 3, { focusKey: 'H' })).toThrow(RangeError);
  });

  it('is the same all day and changes the next day', () => {
    expect(srtDailyPlan('2026-11-13', 5)).toEqual(srtDailyPlan('2026-11-13', 5));
    const days = ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17'];
    expect(new Set(days.map((day) => srtDailyPlan(day, 5).map((slot) => slot.key).join())).size).toBeGreaterThan(2);
    const prints = days.map((day) => srtDailyPlan(day, 5).map((slot) => srtLevelFingerprint(srtDailyPiece(day, slot))).join());
    expect(new Set(prints).size).toBe(days.length);
    expect(srtDailyPiece('2026-11-13', srtDailyPlan('2026-11-13', 5)[2])).toEqual(srtDailyPiece('2026-11-13', srtDailyPlan('2026-11-13', 5)[2]));
    expect(() => srtDailyPlan('13.11.2026', 5)).toThrow(RangeError);
    expect(() => srtDailyPiece('today', srtDailyPlan('2026-11-13', 5)[0])).toThrow(RangeError);
  }, LONG);

  it('G15: never repeats a piece of the book or a piece already seen', () => {
    for (const level of [1, 4, 8]) {
      for (const day of ['2026-11-13', '2026-12-01', '2027-01-20']) {
        for (const slot of srtDailyPlan(day, level)) {
          const piece = srtDailyPiece(day, slot);
          const print = srtLevelFingerprint(piece);
          expect(piece.level).toBe(slot.level);
          expect(piece.key.id).toBe(slot.key);
          expect(srtRuleViolations(piece)).toEqual([]);
          expect(srtBook(slot.level).map(srtLevelFingerprint)).not.toContain(print);
          const again = srtDailyPiece(day, slot, new Set([print]));
          expect(srtLevelFingerprint(again)).not.toBe(print);
        }
      }
    }
  }, LONG);
});

describe('fingerprints', () => {
  it('marks level pieces apart from the older pieces, and reads only the written notes', () => {
    const piece = srtBookPiece(2, 5);
    const print = srtLevelFingerprint(piece);
    expect(print).toMatch(/^v2:[0-9a-f]{16}$/);
    expect(srtLevelFingerprint({ ...piece, seed: 99, level: 3, difficulty: 0 })).toBe(print);
    expect(srtLevelFingerprint({ ...piece, bars: 8 })).not.toBe(print);
    expect(srtLevelFingerprint({ ...piece, events: piece.events.slice(1) })).not.toBe(print);
    expect(srtLevelFingerprint({ ...piece, events: [...piece.events].reverse() })).toBe(print);
    expect(srtFingerprint(srtGenerate('P1.a', 1))).toMatch(/^v1:[0-9a-f]{16}$/);
  });
});

import { describe, expect, it } from 'vitest';
import {
  srtDegreePitch,
  srtKeyPool,
  srtKeyScale,
  srtLevel,
  srtLevelPatterns,
  srtLevelRange,
  srtLevels,
  srtLevelViolations,
  srtMeterTicks,
  srtReadingKey,
  srtReadingKeys,
  srtValidateLevelPiece,
} from '../../src/sight-reading/levels.ts';

const Q = 480;
const LEVEL_IDS = [1, 2, 3, 4, 5, 6, 7, 8];

// Hand-written scales: the oracle for the spelling code. Minor keys are in their natural form.
const SCALES = {
  C: 'C D E F G A B', G: 'G A B C D E F#', F: 'F G A Bb C D E', D: 'D E F# G A B C#',
  Bb: 'Bb C D Eb F G A', A: 'A B C# D E F# G#', Eb: 'Eb F G Ab Bb C D', E: 'E F# G# A B C# D#',
  Ab: 'Ab Bb C Db Eb F G', B: 'B C# D# E F# G# A#', Db: 'Db Eb F Gb Ab Bb C', 'F#': 'F# G# A# B C# D# E#',
  Am: 'A B C D E F G', Em: 'E F# G A B C D', Dm: 'D E F G A Bb C', Bm: 'B C# D E F# G A',
  Gm: 'G A Bb C D Eb F', 'F#m': 'F# G# A B C# D E', Cm: 'C D Eb F G Ab Bb', 'C#m': 'C# D# E F# G# A B',
  Fm: 'F G Ab Bb C Db Eb', 'G#m': 'G# A# B C# D# E F#', Bbm: 'Bb C Db Eb F Gb Ab', Ebm: 'Eb F Gb Ab Bb Cb Db',
};
const KEY_IDS = Object.keys(SCALES);

let nextId = 0;
const ev = (hand, onsetTick, durationTick, pitches) => ({ id: `e${nextId++}`, hand, onsetTick, durationTick, pitches });

/** Lays out [degree | null | degree[], ticks] cells for one hand, starting at a tick. null is a rest. */
function line(key, hand, startTick, cells) {
  let tick = startTick;
  return cells.map(([degree, ticks]) => {
    const degrees = degree === null ? [] : Array.isArray(degree) ? degree : [degree];
    const event = ev(hand, tick, ticks, degrees.map((d) => srtDegreePitch(key, hand, d)));
    tick += ticks;
    return event;
  });
}

const BAR = 4 * Q;
const MOVE = [[0, Q], [1, Q], [2, Q], [1, Q]];
const CLOSE = [[2, Q], [1, Q], [0, 2 * Q]];
const REST = [[null, BAR]];

/** A piece in 4/4 that respects every limit of its level: the baseline each rejection test alters. */
function validPiece(levelId, keyId, bars = srtLevel(levelId).bars[0]) {
  const level = srtLevel(levelId);
  const key = srtReadingKey(keyId);
  const rh = [];
  const lh = [];
  for (let bar = 0; bar < bars; bar += 1) {
    const last = bar === bars - 1;
    if (level.hands === 'blocks') {
      const right = bar < bars / 2;
      rh.push(right ? (bar === bars / 2 - 1 ? CLOSE : MOVE) : REST);
      lh.push(right ? REST : (last ? CLOSE : MOVE));
    } else if (level.hands === 'alternate') {
      const right = bar % 2 === 0;
      rh.push(right ? MOVE : REST);
      lh.push(right ? REST : (last ? CLOSE : MOVE));
    } else if (level.hands === 'oneMoves') {
      rh.push(last ? CLOSE : MOVE);
      lh.push([[0, BAR]]);
    } else {
      rh.push(last ? CLOSE : MOVE);
      lh.push(last ? [[0, BAR]] : [[0, 2 * Q], [4, 2 * Q]]);
    }
  }
  return {
    schemaVersion: 1, generatorVersion: 2, level: levelId, seed: 1,
    meter: { num: 4, den: 4 }, ticksPerQuarter: 480, key, bars,
    events: [
      ...rh.flatMap((cells, bar) => line(key, 'rh', bar * BAR, cells)),
      ...lh.flatMap((cells, bar) => line(key, 'lh', bar * BAR, cells)),
    ],
  };
}

/** Replaces the events of one hand in one bar. */
function withBar(piece, hand, bar, cells) {
  const from = bar * BAR;
  const kept = piece.events.filter((event) => event.hand !== hand || event.onsetTick < from || event.onsetTick >= from + BAR);
  return { ...piece, events: [...kept, ...line(piece.key, hand, from, cells)] };
}

/** The scale degree of a one-note event, read back from its spelling (for fixtures in a major key without accidentals). */
function pitchDegree(key, event) {
  const names = srtKeyScale(key);
  const tonic = srtDegreePitch(key, event.hand, 0).midi;
  const pitch = event.pitches[0];
  return names.indexOf(pitch.spelling.replace(/-?\d+$/, '')) + 7 * Math.floor((pitch.midi - tonic) / 12);
}

const codes = (piece) => [...new Set(srtLevelViolations(piece).map((violation) => violation.code))];

describe('reading keys', () => {
  it('lists 24 keys, 12 major and 12 minor, each with the hand-written scale', () => {
    const keys = srtReadingKeys();
    expect(keys.map((key) => key.id).sort()).toEqual([...KEY_IDS].sort());
    expect(keys.filter((key) => key.mode === 'major')).toHaveLength(12);
    expect(keys.filter((key) => key.mode === 'minor')).toHaveLength(12);
    for (const key of keys) expect(srtKeyScale(key).join(' '), key.id).toBe(SCALES[key.id]);
  });

  it('gives every key the signature its scale shows', () => {
    for (const key of srtReadingKeys()) {
      const scale = SCALES[key.id];
      const sharps = (scale.match(/#/g) ?? []).length;
      const flats = (scale.match(/[A-G]b/g) ?? []).length;
      expect(key.keyN, key.id).toBe(sharps - flats);
    }
  });

  it('rejects an unknown key id', () => {
    expect(() => srtReadingKey('H')).toThrow(RangeError);
  });

  it('puts the right-hand tonic in C4..B4 and the left-hand tonic in F2..E3', () => {
    for (const key of srtReadingKeys()) {
      const rh = srtDegreePitch(key, 'rh', 0);
      const lh = srtDegreePitch(key, 'lh', 0);
      expect(rh.midi, key.id).toBeGreaterThanOrEqual(60);
      expect(rh.midi, key.id).toBeLessThanOrEqual(71);
      expect(lh.midi, key.id).toBeGreaterThanOrEqual(41);
      expect(lh.midi, key.id).toBeLessThanOrEqual(52);
      expect(rh.midi % 12).toBe(lh.midi % 12);
      expect(rh.spelling.replace(/-?\d+$/, '')).toBe(key.tonic);
    }
  });

  it('spells degrees across octaves, below the tonic, and with an alteration', () => {
    const c = srtReadingKey('C');
    expect(srtDegreePitch(c, 'rh', 0)).toEqual({ midi: 60, spelling: 'C4', finger: null });
    expect(srtDegreePitch(c, 'rh', 7)).toMatchObject({ midi: 72, spelling: 'C5' });
    expect(srtDegreePitch(c, 'rh', -1)).toMatchObject({ midi: 59, spelling: 'B3' });
    expect(srtDegreePitch(c, 'lh', 4)).toMatchObject({ midi: 55, spelling: 'G3' });
    expect(srtDegreePitch(c, 'rh', 3, 1)).toMatchObject({ midi: 66, spelling: 'F#4' });
    expect(srtDegreePitch(srtReadingKey('Am'), 'rh', 6, 1)).toMatchObject({ midi: 80, spelling: 'G#5' });
    expect(srtDegreePitch(srtReadingKey('F#'), 'rh', 6)).toMatchObject({ midi: 77, spelling: 'E#5' });
    expect(srtDegreePitch(srtReadingKey('Ebm'), 'lh', 5)).toMatchObject({ midi: 59, spelling: 'Cb4' });
    // G sharp minor would need F double sharp for its leading note: no double accidentals.
    expect(() => srtDegreePitch(srtReadingKey('G#m'), 'rh', 6, 1)).toThrow(RangeError);
  });

  it('spans a perfect fifth in the five-finger position of every key', () => {
    for (const key of srtReadingKeys()) {
      for (const hand of ['rh', 'lh']) {
        const range = srtLevelRange(srtLevel(1), key, hand);
        expect(range.max - range.min, `${key.id} ${hand}`).toBe(7);
        expect(range.min).toBe(srtDegreePitch(key, hand, 0).midi);
      }
    }
  });
});

describe('reading levels', () => {
  it('defines levels 1 to 8 in order', () => {
    expect(srtLevels().map((level) => level.id)).toEqual(LEVEL_IDS);
    expect(() => srtLevel(9)).toThrow(RangeError);
    expect(() => srtLevel(0)).toThrow(RangeError);
  });

  it('never takes away something an earlier level allowed', () => {
    const levels = srtLevels();
    for (let index = 1; index < levels.length; index += 1) {
      const before = levels[index - 1];
      const after = levels[index];
      const label = `level ${after.id}`;
      for (const ticks of before.noteTicks) expect(after.noteTicks, label).toContain(ticks);
      for (const ticks of before.restTicks) expect(after.restTicks, label).toContain(ticks);
      for (const meter of before.meters) expect(after.meters, label).toContainEqual(meter);
      expect(after.maxLeap, label).toBeGreaterThanOrEqual(before.maxLeap);
      expect(after.degrees[0], label).toBeLessThanOrEqual(before.degrees[0]);
      expect(after.degrees[1], label).toBeGreaterThanOrEqual(before.degrees[1]);
      expect(after.gridTicks, label).toBeLessThanOrEqual(before.gridTicks);
      expect(after.maxChromatic, label).toBeGreaterThanOrEqual(before.maxChromatic);
      expect(after.chord.rh, label).toBeGreaterThanOrEqual(before.chord.rh);
      expect(after.chord.lh, label).toBeGreaterThanOrEqual(before.chord.lh);
      expect(Math.min(...after.bars), label).toBeGreaterThanOrEqual(Math.min(...before.bars));
    }
  });

  it('matches the level table of the spec', () => {
    const row = (id) => {
      const level = srtLevel(id);
      return [level.hands, level.degrees.join('..'), level.maxLeap, level.meters.map((m) => `${m.num}/${m.den}`).join(' '), level.bars.join('|')].join(' · ');
    };
    expect(LEVEL_IDS.map(row)).toEqual([
      'blocks · 0..4 · 1 · 4/4 · 4',
      'blocks · 0..4 · 2 · 4/4 3/4 · 4',
      'alternate · 0..4 · 4 · 4/4 3/4 2/4 · 4|6',
      'oneMoves · 0..4 · 4 · 4/4 3/4 2/4 · 4|6',
      'together · 0..5 · 4 · 4/4 3/4 2/4 · 8',
      'together · 0..7 · 5 · 4/4 3/4 2/4 3/8 · 8',
      'together · -1..7 · 7 · 4/4 3/4 2/4 3/8 6/8 · 8',
      'together · -2..9 · 7 · 4/4 3/4 2/4 3/8 6/8 · 8|12',
    ]);
    const values = (id) => `${srtLevel(id).noteTicks.join(',')} / ${srtLevel(id).restTicks.join(',')}`;
    expect(values(1)).toBe('1920,960,480 / ');
    expect(values(2)).toBe('1920,1440,960,480 / 480');
    expect(values(3)).toBe('1920,1440,960,480,240 / 960,480');
    expect(values(5)).toBe('1920,1440,960,720,480,240 / 960,480,240');
    expect(values(6)).toBe('1920,1440,960,720,480,240,120 / 960,480,240');
    expect(LEVEL_IDS.filter((id) => srtLevel(id).tieOverBar)).toEqual([4, 5, 6, 7, 8]);
    expect(LEVEL_IDS.filter((id) => srtLevel(id).syncopation)).toEqual([8]);
    expect(LEVEL_IDS.filter((id) => srtLevel(id).upbeat)).toEqual([7, 8]);
    expect(values(4)).toBe(values(3));
    expect(values(7)).toBe(values(6));
    expect(values(8)).toBe(values(6));
    expect(LEVEL_IDS.map((id) => srtLevel(id).gridTicks)).toEqual([480, 480, 240, 240, 240, 120, 120, 120]);
    expect(LEVEL_IDS.map((id) => srtLevel(id).bpm)).toEqual([66, 66, 72, 63, 66, 66, 60, 72]);
    expect(LEVEL_IDS.map((id) => srtLevel(id).newPatterns.join(' '))).toEqual([
      'stepRun repeatedNote longNote neighbour',
      'skip',
      'brokenTriad leapFifth eighthRun sequence',
      'heldNote tie',
      'parallelMotion contraryMotion dottedFigure',
      'scaleShift twoNoteChord sixteenthRun',
      'chromaticNeighbour brokenChordBass upbeat',
      'syncopation chordsBothHands',
    ]);
    expect(Object.isFrozen(srtLevel(1))).toBe(true);
    expect(Object.isFrozen(srtLevel(1).noteTicks)).toBe(true);
    expect(Object.isFrozen(srtReadingKey('C'))).toBe(true);
    expect(LEVEL_IDS.filter((id) => srtLevel(id).leadingTone)).toEqual([6, 7, 8]);
    expect(LEVEL_IDS.map((id) => srtLevel(id).maxChromatic)).toEqual([0, 0, 0, 0, 0, 0, 2, 3]);
    expect(LEVEL_IDS.map((id) => `${srtLevel(id).chord.rh}${srtLevel(id).chord.lh}`)).toEqual(['11', '11', '11', '11', '11', '12', '12', '22']);
  });

  it('grows the pool of keys as the spec lists it', () => {
    expect(LEVEL_IDS.map((id) => srtKeyPool(id).length)).toEqual([5, 5, 9, 9, 13, 13, 17, 24]);
    expect(srtKeyPool(1).map((key) => key.id)).toEqual(['C', 'G', 'F', 'Am', 'Dm']);
    expect(srtLevel(3).newKeys).toEqual(['D', 'Bb', 'Em', 'Gm']);
    expect(srtLevel(5).newKeys).toEqual(['A', 'Eb', 'Bm', 'Cm']);
    expect(srtLevel(7).newKeys).toEqual(['E', 'Ab', 'F#m', 'Fm']);
    expect(srtKeyPool(8).map((key) => key.id).sort()).toEqual([...KEY_IDS].sort());
    for (const id of LEVEL_IDS) expect(new Set(srtKeyPool(id)).size).toBe(srtKeyPool(id).length);
  });

  it('gives every level new patterns and keeps the earlier ones', () => {
    const all = srtLevelPatterns(8);
    expect(new Set(all).size).toBe(all.length);
    expect(srtLevel(1).newPatterns).toEqual(['stepRun', 'repeatedNote', 'longNote', 'neighbour']);
    for (const id of LEVEL_IDS) {
      expect(srtLevel(id).newPatterns.length, `level ${id}`).toBeGreaterThan(0);
      const expected = LEVEL_IDS.filter((other) => other <= id).flatMap((other) => srtLevel(other).newPatterns);
      expect(srtLevelPatterns(id)).toEqual(expected);
    }
  });

  it('measures bars and beats in simple and compound time', () => {
    expect(srtMeterTicks({ num: 4, den: 4 })).toEqual({ bar: 1920, beat: 480 });
    expect(srtMeterTicks({ num: 3, den: 4 })).toEqual({ bar: 1440, beat: 480 });
    expect(srtMeterTicks({ num: 2, den: 4 })).toEqual({ bar: 960, beat: 480 });
    expect(srtMeterTicks({ num: 3, den: 8 })).toEqual({ bar: 720, beat: 720 });
    expect(srtMeterTicks({ num: 6, den: 8 })).toEqual({ bar: 1440, beat: 720 });
  });
});

describe('level limits (G2)', () => {
  it('accepts a piece inside the limits, for 8 levels in 24 keys', () => {
    for (const levelId of LEVEL_IDS) {
      for (const keyId of KEY_IDS) {
        const piece = validPiece(levelId, keyId);
        expect(srtLevelViolations(piece), `level ${levelId} ${keyId}`).toEqual([]);
        expect(srtValidateLevelPiece(piece)).toBe(true);
      }
    }
  });

  it('gives each level the written range of the spec', () => {
    const range = (levelId, keyId, hand) => { const r = srtLevelRange(srtLevel(levelId), srtReadingKey(keyId), hand); return `${r.min}-${r.max}`; };
    expect(range(1, 'C', 'rh')).toBe('60-67');
    expect(range(1, 'G', 'lh')).toBe('43-50');
    expect(range(5, 'F', 'rh')).toBe('65-74');
    expect(range(6, 'Am', 'lh')).toBe('45-57');
    expect(range(7, 'C', 'rh')).toBe('59-72');
    expect(range(8, 'C', 'rh')).toBe('57-76');
    expect(range(8, 'C', 'lh')).toBe('45-64');
    expect(() => srtDegreePitch(srtReadingKey('C'), 'both', 0)).toThrow(RangeError);
  });

  it('rejects a wrong schema, level, key or seed', () => {
    const piece = validPiece(1, 'C');
    expect(codes({ ...piece, generatorVersion: 1 })).toEqual(['schema']);
    expect(codes({ ...piece, level: 9 })).toEqual(['schema']);
    expect(codes({ ...piece, seed: 1.5 })).toEqual(['schema']);
    expect(codes({ ...piece, key: { ...piece.key, keyN: 3 } })).toEqual(['schema']);
    expect(codes({ ...piece, ticksPerQuarter: 960 })).toEqual(['schema']);
    expect(srtValidateLevelPiece({ ...piece, generatorVersion: 1 })).toBe(false);
  });

  it('rejects a meter or a bar count the level does not use, in every key', () => {
    for (const keyId of KEY_IDS) {
      expect(codes({ ...validPiece(1, keyId), meter: { num: 3, den: 4 } }), keyId).toContain('meter');
      expect(codes({ ...validPiece(5, keyId), meter: { num: 6, den: 8 } }), keyId).toContain('meter');
      expect(codes({ ...validPiece(1, keyId), bars: 5 }), keyId).toContain('bars');
      expect(codes({ ...validPiece(5, keyId), bars: 4 }), keyId).toContain('bars');
    }
    const waltz = validPiece(2, 'C');
    const threeFour = { ...waltz, meter: { num: 3, den: 4 }, events: [] };
    const rows = [[[0, Q], [1, Q], [2, Q]], [[1, 2 * Q], [0, Q]]];
    threeFour.events = [0, 1, 2, 3].flatMap((bar) => [
      ...line(waltz.key, bar < 2 ? 'rh' : 'lh', bar * 3 * Q, rows[bar % 2]),
      ...line(waltz.key, bar < 2 ? 'lh' : 'rh', bar * 3 * Q, [[null, 3 * Q]]),
    ]);
    expect(codes(threeFour)).toEqual([]);
  });

  it('rejects a note value the level has not reached, in every key', () => {
    for (const keyId of KEY_IDS) {
      const eighths = [[0, Q / 2], [1, Q / 2], [2, Q], [1, 2 * Q]];
      expect(codes(withBar(validPiece(2, keyId), 'rh', 0, eighths)), keyId).toEqual(expect.arrayContaining(['noteValue', 'grid']));
      expect(codes(withBar(validPiece(3, keyId), 'rh', 0, eighths)), keyId).toEqual([]);
      const dotted = [[0, Q * 1.5], [1, Q / 2], [2, 2 * Q]];
      expect(codes(withBar(validPiece(4, keyId), 'rh', 0, dotted)), keyId).toContain('noteValue');
      expect(codes(withBar(validPiece(5, keyId), 'rh', 0, dotted)), keyId).toEqual([]);
      const dottedHalf = [[0, 3 * Q], [1, Q]];
      expect(codes(withBar(validPiece(1, keyId), 'rh', 0, dottedHalf)), keyId).toEqual(['noteValue']);
      expect(codes(withBar(validPiece(2, keyId), 'rh', 0, dottedHalf)), keyId).toEqual([]);
      const sixteenths = [[0, Q / 4], [1, Q / 4], [2, Q / 4], [1, Q / 4], [0, Q], [1, 2 * Q]];
      expect(codes(withBar(validPiece(5, keyId), 'rh', 0, sixteenths)), keyId).toEqual(expect.arrayContaining(['noteValue', 'grid']));
      expect(codes(withBar(validPiece(6, keyId), 'rh', 0, sixteenths)), keyId).toEqual([]);
    }
  });

  it('rejects a rest the level has not reached, or one that crosses a beat', () => {
    const quarterRest = [[0, Q], [null, Q], [0, Q], [1, Q]];
    expect(codes(withBar(validPiece(1, 'G'), 'rh', 0, quarterRest))).toEqual(['restValue']);
    expect(codes(withBar(validPiece(2, 'G'), 'rh', 0, quarterRest))).toEqual([]);
    const halfRest = [[0, Q], [1, Q], [null, 2 * Q]];
    expect(codes(withBar(validPiece(2, 'G'), 'rh', 0, halfRest))).toEqual(['restValue']);
    expect(codes(withBar(validPiece(3, 'G'), 'rh', 0, halfRest))).toEqual([]);
    const eighthRest = [[0, Q], [null, Q / 2], [1, Q / 2], [2, 2 * Q]];
    expect(codes(withBar(validPiece(4, 'G'), 'rh', 0, eighthRest))).toContain('restValue');
    expect(codes(withBar(validPiece(5, 'G'), 'rh', 0, eighthRest))).toEqual([]);
    const crossing = [[0, Q / 2], [null, Q], [1, Q / 2], [2, 2 * Q]];
    expect(codes(withBar(validPiece(5, 'G'), 'rh', 0, crossing))).toContain('restValue');
    // A whole-bar rest belongs to the levels where one hand waits.
    expect(codes(withBar(validPiece(5, 'G'), 'lh', 0, REST))).toEqual(expect.arrayContaining(['restValue', 'hands']));
  });

  it('rejects a note outside the range of the level, in every key', () => {
    for (const keyId of KEY_IDS) {
      const sixth = [[4, Q], [5, Q], [4, Q], [3, Q]];
      expect(codes(withBar(validPiece(4, keyId), 'rh', 0, sixth)), keyId).toEqual(['range']);
      expect(codes(withBar(validPiece(5, keyId), 'rh', 0, sixth)), keyId).toEqual([]);
      const below = [[0, Q], [-1, Q], [0, Q], [1, Q]];
      expect(codes(withBar(validPiece(6, keyId), 'rh', 0, below)), keyId).toEqual(['range']);
      expect(codes(withBar(validPiece(7, keyId), 'rh', 0, below)), keyId).toEqual([]);
      const octave = [[4, Q], [5, Q], [6, Q], [7, Q]];
      expect(codes(withBar(validPiece(5, keyId), 'lh', 0, octave)), keyId).toContain('range');
    }
  });

  it('rejects a leap larger than the level allows, in every key', () => {
    for (const keyId of KEY_IDS) {
      const third = [[0, Q], [2, Q], [1, Q], [1, Q]];
      expect(codes(withBar(validPiece(1, keyId), 'rh', 0, third)), keyId).toEqual(['leap']);
      expect(codes(withBar(validPiece(2, keyId), 'rh', 0, third)), keyId).toEqual([]);
      const fifth = [[0, Q], [4, Q], [3, Q], [2, Q]];
      expect(codes(withBar(validPiece(2, keyId), 'rh', 0, fifth)), keyId).toEqual(['leap']);
      expect(codes(withBar(validPiece(3, keyId), 'rh', 0, fifth)), keyId).toEqual([]);
      const seventh = [[0, Q], [6, Q], [5, Q], [4, Q]];
      expect(codes(withBar(validPiece(6, keyId), 'rh', 1, seventh)), keyId).toContain('leap');
      expect(codes(withBar(validPiece(7, keyId), 'rh', 1, [[0, Q], [6, Q], [5, Q], [4, Q]])), keyId).not.toContain('leap');
    }
  });

  it('rejects the wrong use of the hands', () => {
    // Levels 1 and 2: one hand at a time, one change at the middle.
    expect(codes(withBar(validPiece(1, 'F'), 'lh', 0, MOVE))).toEqual(['hands']);
    const swappedLate = withBar(withBar(validPiece(1, 'F'), 'rh', 2, MOVE), 'lh', 2, REST);
    expect(codes(swappedLate)).toEqual(['hands']);
    // Level 3: never both hands at once, and at least two changes of hand.
    expect(codes(withBar(validPiece(3, 'F'), 'lh', 0, MOVE))).toEqual(['hands']);
    const oneChange = { ...validPiece(1, 'F'), level: 3 };
    expect(codes(oneChange)).toEqual(['hands']);
    // Level 4: both hands in every bar, and one of them holds.
    expect(codes(withBar(validPiece(4, 'F'), 'lh', 1, MOVE))).toEqual(['hands']);
    expect(codes(withBar(validPiece(4, 'F'), 'lh', 1, [[0, 2 * Q], [1, 2 * Q]]))).toEqual([]);
    // Level 5 and up: both hands in every bar.
    expect(codes(withBar(validPiece(5, 'F'), 'lh', 1, MOVE))).toEqual([]);
    expect(codes({ ...validPiece(5, 'F'), events: validPiece(5, 'F').events.filter((event) => event.hand === 'rh') })).toContain('hands');
  });

  it('rejects more notes at once than the level allows', () => {
    const third = [[[0, 2], 2 * Q], [[1, 3], 2 * Q]];
    expect(codes(withBar(validPiece(5, 'D'), 'lh', 0, third))).toEqual(['chord']);
    expect(codes(withBar(validPiece(6, 'D'), 'lh', 0, third))).toEqual([]);
    expect(codes(withBar(validPiece(7, 'D'), 'rh', 0, third))).toEqual(['chord']);
    expect(codes(withBar(validPiece(8, 'D'), 'rh', 0, third))).toEqual([]);
    expect(codes(withBar(validPiece(8, 'D'), 'rh', 0, [[[0, 2, 4], 2 * Q], [[1, 3], 2 * Q]]))).toEqual(['chord']);
    const piece = validPiece(8, 'D');
    const unsorted = { ...piece, events: piece.events.map((event, index) => index === 0
      ? { ...event, pitches: [srtDegreePitch(piece.key, 'rh', 2), srtDegreePitch(piece.key, 'rh', 0)] } : event) };
    expect(codes(unsorted)).toContain('chord');
  });

  it('rejects a malformed pitch and an accidental the level does not allow', () => {
    const piece = validPiece(1, 'G');
    const respell = (pitch) => ({ ...piece, events: piece.events.map((event, index) => index === 0 ? { ...event, pitches: [pitch] } : event) });
    expect(codes(respell({ midi: 67, spelling: 'A4', finger: null }))).toContain('pitch');
    expect(codes(respell({ midi: 67, spelling: 'Fx4', finger: null }))).toContain('pitch');
    expect(codes(respell({ midi: 67, spelling: 'G4', finger: 6 }))).toContain('pitch');
    expect(codes(respell({ midi: 67, spelling: 'G4', finger: 1 }))).toEqual([]);
    const sharpFour = (levelId, count) => {
      let altered = validPiece(levelId, 'G');
      for (let bar = 0; bar < count; bar += 1) {
        const from = bar * BAR + Q;
        altered = { ...altered, events: altered.events.map((event) => event.hand === 'rh' && event.onsetTick === from
          ? { ...event, pitches: [srtDegreePitch(altered.key, 'rh', 1, 1)] } : event) };
      }
      return altered;
    };
    expect(codes(sharpFour(6, 1))).toEqual(['accidental']);
    expect(codes(sharpFour(7, 2))).toEqual([]);
    expect(codes(sharpFour(7, 3))).toEqual(['accidental']);
    expect(codes(sharpFour(8, 3))).toEqual([]);
  });

  it('allows the raised leading note of a minor key from level 6, without counting it', () => {
    const cadence = (levelId) => {
      const piece = validPiece(levelId, 'Am');
      const from = (piece.bars - 1) * BAR;
      const kept = piece.events.filter((event) => event.hand !== 'rh' || event.onsetTick < from);
      return { ...piece, events: [...kept,
        ev('rh', from, Q, [srtDegreePitch(piece.key, 'rh', 5)]),
        ev('rh', from + Q, Q, [srtDegreePitch(piece.key, 'rh', 6, 1)]),
        ev('rh', from + 2 * Q, 2 * Q, [srtDegreePitch(piece.key, 'rh', 7)])] };
    };
    const lead = (levelId) => {
      const piece = cadence(levelId);
      return withBar(piece, 'rh', piece.bars - 2, [[1, Q], [2, Q], [3, Q], [4, Q]]);
    };
    expect(codes(lead(6))).toEqual([]);
    expect(codes(lead(7))).toEqual([]);
    // The same G sharp in A major's relative, C major, is a chromatic note: level 6 has none.
    const major = validPiece(6, 'C');
    const altered = { ...major, events: major.events.map((event) => event.hand === 'rh' && event.onsetTick === Q
      ? { ...event, pitches: [srtDegreePitch(major.key, 'rh', 1, 1)] } : event) };
    expect(codes(altered)).toEqual(['accidental']);
  });

  it('allows a tie over the barline from level 4, and syncopation only at level 8', () => {
    const tied = (levelId) => {
      const piece = validPiece(levelId, 'Bb');
      const kept = piece.events.filter((event) => event.hand !== 'rh' || event.onsetTick >= 2 * BAR);
      return { ...piece, events: [...kept,
        ...line(piece.key, 'rh', 0, [[0, Q], [1, Q], [2, 4 * Q], [1, Q], [0, Q]])] };
    };
    expect(codes(tied(5))).toEqual([]);
    expect(codes({ ...tied(5), level: 3 })).toContain('crossBar');
    // Each written part of a tied note must be a note value of the level: 3 beats + 2 beats is fine, 5 eighths is not.
    const odd = validPiece(5, 'Bb');
    const kept = odd.events.filter((event) => event.hand !== 'rh' || event.onsetTick >= 2 * BAR);
    const oddTie = { ...odd, events: [...kept, ...line(odd.key, 'rh', 0, [[0, 5 * Q], [1, Q], [2, Q], [1, Q]])] };
    expect(codes(oddTie)).toEqual([]);
    const badTie = { ...odd, events: [...kept, ...line(odd.key, 'rh', 0, [[0, 1.5 * Q], [1, 3.75 * Q], [2, 0.75 * Q], [1, 2 * Q]])] };
    expect(codes(badTie)).toEqual(expect.arrayContaining(['noteValue']));
    const syncopated = [[0, Q / 2], [1, Q], [2, Q / 2], [1, 2 * Q]];
    expect(codes(withBar(validPiece(7, 'Bb'), 'rh', 0, syncopated))).toEqual(['offbeat']);
    expect(codes(withBar(validPiece(8, 'Bb'), 'rh', 0, syncopated))).toEqual([]);
  });

  it('accepts every bar count and the short meters of a level', () => {
    for (const keyId of KEY_IDS) {
      expect(codes(validPiece(3, keyId, 6)), keyId).toEqual([]);
      expect(codes(validPiece(4, keyId, 6)), keyId).toEqual([]);
      expect(codes(validPiece(8, keyId, 12)), keyId).toEqual([]);
      expect(codes(validPiece(8, keyId, 10)), keyId).toEqual(['bars']);
    }
    const key = srtReadingKey('Em');
    const twoFour = {
      schemaVersion: 1, generatorVersion: 2, level: 3, seed: 2, meter: { num: 2, den: 4 }, ticksPerQuarter: 480, key, bars: 6,
      events: [0, 1, 2, 3, 4, 5].flatMap((bar) => [
        ...line(key, bar % 2 ? 'lh' : 'rh', bar * 2 * Q, bar === 5 ? [[0, 2 * Q]] : [[0, Q], [1, Q]]),
        ...line(key, bar % 2 ? 'rh' : 'lh', bar * 2 * Q, [[null, 2 * Q]]),
      ]),
    };
    expect(codes(twoFour)).toEqual([]);
    expect(codes({ ...twoFour, level: 2, bars: 6 })).toEqual(expect.arrayContaining(['meter', 'bars']));
    const E = Q / 2;
    const threeEight = {
      schemaVersion: 1, generatorVersion: 2, level: 6, seed: 3, meter: { num: 3, den: 8 }, ticksPerQuarter: 480, key, bars: 8,
      events: [0, 1, 2, 3, 4, 5, 6, 7].flatMap((bar) => [
        ...line(key, 'rh', bar * 3 * E, bar === 7 ? [[0, 3 * E]] : [[0, E], [1, E], [2, E]]),
        ...line(key, 'lh', bar * 3 * E, [[0, 3 * E]]),
      ]),
    };
    expect(codes(threeEight)).toEqual([]);
    expect(codes({ ...threeEight, level: 5 })).toContain('meter');
  });

  it('allows an upbeat bar with a waiting hand from level 7', () => {
    const upbeat = (levelId) => withBar(withBar(validPiece(levelId, 'C'), 'rh', 0, [[null, 2 * Q], [null, Q], [4, Q]]), 'lh', 0, REST);
    expect(codes(upbeat(7))).toEqual([]);
    expect(codes(upbeat(8))).toEqual([]);
    expect(codes(upbeat(6))).toEqual(expect.arrayContaining(['hands', 'restValue']));
    // Only the first bar may be an upbeat bar, and one hand must still play in it.
    expect(codes(withBar(validPiece(7, 'C'), 'lh', 1, REST))).toEqual(expect.arrayContaining(['hands', 'restValue']));
    expect(codes(withBar(withBar(validPiece(7, 'C'), 'rh', 0, REST), 'lh', 0, REST))).toContain('hands');
  });

  it('places long rests on their own beat, and knows the one-beat rest of compound time', () => {
    expect(codes(withBar(validPiece(3, 'A'), 'rh', 0, [[0, Q], [null, 2 * Q], [1, Q]]))).toEqual(['restValue']);
    expect(codes(withBar(validPiece(3, 'A'), 'rh', 0, [[null, 2 * Q], [0, Q], [1, Q]]))).toEqual([]);
    const key = srtReadingKey('C');
    const E = Q / 2;
    const bar = 6 * E;
    const sixEight = (first) => ({
      schemaVersion: 1, generatorVersion: 2, level: 7, seed: 7, meter: { num: 6, den: 8 }, ticksPerQuarter: 480, key, bars: 8,
      events: Array.from({ length: 8 }, (_, index) => [
        ...line(key, 'rh', index * bar, index === 0 ? first : index === 7 ? [[0, bar]] : [[0, E], [1, E], [2, E], [1, Q], [0, E]]),
        ...line(key, 'lh', index * bar, [[0, 3 * E], [4, 3 * E]]),
      ]).flat(),
    });
    expect(codes(sixEight([[null, 3 * E], [0, E], [1, E], [0, E]]))).toEqual([]);
    expect(codes(sixEight([[null, 2 * Q], [0, E], [0, E]]))).toEqual(['restValue']);
    // The dotted-quarter rest belongs to compound time only.
    expect(codes(withBar(validPiece(7, 'C'), 'rh', 0, [[null, 3 * E], [0, E], [1, Q], [0, Q]]))).toContain('restValue');
  });

  it('treats a long note on beat 2 or 4 of a 4/4 bar as syncopation', () => {
    const held = [[0, Q], [1, 2 * Q], [0, Q]];
    expect(codes(withBar(validPiece(2, 'F'), 'rh', 0, held))).toEqual(['offbeat']);
    expect(codes(withBar(validPiece(7, 'F'), 'rh', 0, held))).toEqual(['offbeat']);
    expect(codes(withBar(validPiece(8, 'F'), 'rh', 0, held))).toEqual([]);
    // In 3/4 a half note on beat 2 is an ordinary rhythm.
    const key = srtReadingKey('F');
    const waltz = {
      schemaVersion: 1, generatorVersion: 2, level: 2, seed: 4, meter: { num: 3, den: 4 }, ticksPerQuarter: 480, key, bars: 4,
      events: [0, 1, 2, 3].flatMap((bar) => [
        ...line(key, bar < 2 ? 'rh' : 'lh', bar * 3 * Q, [[0, Q], [1, 2 * Q]]),
        ...line(key, bar < 2 ? 'lh' : 'rh', bar * 3 * Q, [[null, 3 * Q]]),
      ]),
    };
    expect(codes(waltz)).toEqual([]);
  });

  it('rejects a note two semitones away from its scale degree', () => {
    const piece = validPiece(7, 'D');
    const flat = { ...piece, events: piece.events.map((event) => event.hand === 'rh' && event.onsetTick === 2 * Q
      ? { ...event, pitches: [{ midi: 64, spelling: 'Fb4', finger: null }] } : event) };
    expect(codes(flat)).toEqual(['accidental']);
  });

  it('reports malformed input instead of throwing', () => {
    const piece = validPiece(8, 'C');
    const first = piece.events[0];
    const withPitches = (pitches) => ({ ...piece, events: piece.events.map((event) => event === first ? { ...event, pitches } : event) });
    expect(codes(withPitches([null, null]))).toContain('pitch');
    expect(codes(withPitches([first.pitches[0], undefined]))).toContain('pitch');
    expect(codes(withPitches([{ midi: 60, spelling: 'C04', finger: null }]))).toContain('pitch');
    expect(codes({ ...piece, bars: 2 ** 32 })).toEqual(['schema']);
    expect(codes({ ...piece, bars: 65 })).toEqual(['schema']);
    expect(codes(null)).toEqual(['schema']);
    expect(codes({ ...piece, events: [null, ...piece.events] })).toContain('event');
  });

  it('lets either hand start at levels 1 and 2', () => {
    const piece = validPiece(1, 'C');
    const swapped = { ...piece, events: piece.events.map((event) => ({
      ...event, hand: event.hand === 'rh' ? 'lh' : 'rh',
      pitches: event.pitches.map(() => srtDegreePitch(piece.key, event.hand === 'rh' ? 'lh' : 'rh', pitchDegree(piece.key, event))),
    })) };
    expect(codes(swapped)).toEqual([]);
  });

  it('rejects a bar in which no hand plays, at level 3', () => {
    const piece = validPiece(3, 'C');
    // Right hand: bars 1 and 4. Left hand: bar 3. Bar 2 is empty.
    const silent = withBar(withBar(withBar(withBar(piece, 'lh', 1, REST), 'lh', 2, MOVE), 'rh', 2, REST), 'rh', 3, CLOSE);
    expect(codes(withBar(silent, 'lh', 3, REST))).toEqual(['hands']);
  });

  it('accepts a waiting hand in bar 1 only when the piece starts with a rest', () => {
    for (const levelId of [7, 8]) {
      expect(codes(withBar(validPiece(levelId, 'C'), 'lh', 0, REST))).toEqual(expect.arrayContaining(['hands', 'restValue']));
      expect(codes(withBar(validPiece(levelId, 'C'), 'lh', 0, [[null, 2 * Q], [null, 2 * Q]]))).toContain('hands');
    }
  });

  it('keeps a rest shorter than a beat inside its beat, and a rest inside its bar', () => {
    const S = Q / 4;
    const E = Q / 2;
    const crossing = [[0, S], [1, S], [2, S], [null, E], [1, S], [2, S], [1, S], [0, 2 * Q]];
    expect(codes(withBar(validPiece(6, 'C'), 'rh', 0, crossing))).toEqual(['restValue']);
    const inside = [[0, S], [1, S], [null, E], [2, Q], [1, 2 * Q]];
    expect(codes(withBar(validPiece(6, 'C'), 'rh', 0, inside))).toEqual([]);
    // 3/4 at level 3: a half rest from beat 3 would run over the barline.
    const key = srtReadingKey('C');
    const bar = 3 * Q;
    const over = {
      schemaVersion: 1, generatorVersion: 2, level: 3, seed: 5, meter: { num: 3, den: 4 }, ticksPerQuarter: 480, key, bars: 4,
      events: [
        ...line(key, 'rh', 0, [[0, Q], [1, Q], [null, 2 * Q], [0, Q], [1, Q], [null, bar], [0, bar]]),
        ...line(key, 'lh', 0, [[null, bar], [null, bar], [0, Q], [1, Q], [2, Q], [null, bar]]),
      ],
    };
    expect(codes(over)).toEqual(['restValue']);
  });

  it('checks every written part of a tied note', () => {
    const piece = validPiece(5, 'Bb');
    const kept = piece.events.filter((event) => event.hand !== 'rh' || event.onsetTick >= 2 * BAR);
    // A whole note tied to a half-plus-eighth: the first part is fine, the second is not a note value.
    const tie = { ...piece, events: [...kept, ...line(piece.key, 'rh', 0, [[0, 6.5 * Q], [1, Q / 2], [2, Q]])] };
    expect(codes(tie)).toEqual(['noteValue']);
  });

  it('treats a tie from a weak beat as syncopation, in every meter', () => {
    const fromBeatFour = (levelId) => {
      const piece = validPiece(levelId, 'C');
      const kept = piece.events.filter((event) => event.hand !== 'rh' || event.onsetTick >= 2 * BAR);
      return { ...piece, events: [...kept, ...line(piece.key, 'rh', 0, [[0, Q], [1, Q], [2, Q], [1, 2 * Q], [2, Q], [1, Q], [0, Q]])] };
    };
    expect(codes(fromBeatFour(7))).toEqual(['offbeat']);
    expect(codes(fromBeatFour(8))).toEqual([]);
    const key = srtReadingKey('C');
    const short = (num, rhCells) => ({
      schemaVersion: 1, generatorVersion: 2, level: 5, seed: 6, meter: { num, den: 4 }, ticksPerQuarter: 480, key, bars: 8,
      events: [
        ...line(key, 'rh', 0, [...rhCells, ...Array.from({ length: 6 }, () => [0, num * Q])]),
        ...Array.from({ length: 8 }, (_, index) => line(key, 'lh', index * num * Q, [[0, num === 3 ? 3 * Q : 2 * Q]])).flat(),
      ],
    });
    // 3/4: a half note from beat 3. 2/4: a half note from beat 2.
    expect(codes(short(3, [[0, Q], [1, Q], [2, 2 * Q], [1, Q], [0, Q]]))).toEqual(['offbeat']);
    expect(codes(short(2, [[0, Q], [1, 2 * Q], [0, Q]]))).toEqual(['offbeat']);
    // From beat 1 the same tie is plain.
    expect(codes(short(3, [[0, 4 * Q], [1, Q], [0, Q]]))).toEqual([]);
    expect(codes(short(2, [[0, 3 * Q], [0, Q]]))).toEqual([]);
  });

  it('treats a note that splits a compound beat as syncopation', () => {
    const key = srtReadingKey('C');
    const E = Q / 2;
    const bar = 6 * E;
    const sixEight = (levelId, first) => ({
      schemaVersion: 1, generatorVersion: 2, level: levelId, seed: 7, meter: { num: 6, den: 8 }, ticksPerQuarter: 480, key, bars: 8,
      events: Array.from({ length: 8 }, (_, index) => [
        ...line(key, 'rh', index * bar, index === 0 ? first : index === 7 ? [[0, bar]] : [[0, E], [1, E], [2, E], [1, Q], [0, E]]),
        ...line(key, 'lh', index * bar, [[0, 3 * E], [4, 3 * E]]),
      ]).flat(),
    });
    expect(codes(sixEight(7, [[0, 2 * Q], [1, Q]]))).toEqual(['offbeat']);
    expect(codes(sixEight(8, [[0, 2 * Q], [1, Q]]))).toEqual([]);
    expect(codes(sixEight(7, [[0, 3 * E], [1, 3 * E]]))).toEqual([]);
  });

  it('exempts only a raised seventh that rises to the tonic', () => {
    const base = validPiece(6, 'Am');
    const from = (base.bars - 1) * BAR;
    const kept = base.events.filter((event) => event.hand !== 'rh' || event.onsetTick < from - BAR);
    const ending = (cells) => ({ ...base, events: [...kept,
      ...line(base.key, 'rh', from - BAR, [[1, Q], [2, Q], [3, Q], [4, Q]]),
      ...cells.map(([degree, alter, at, ticks]) => ev('rh', from + at, ticks, [srtDegreePitch(base.key, 'rh', degree, alter)]))] });
    expect(codes(ending([[5, 0, 0, Q], [6, 1, Q, Q], [7, 0, 2 * Q, 2 * Q]]))).toEqual([]);
    // Raised seventh that falls back instead of rising: an ordinary chromatic note, and level 6 has none.
    expect(codes(ending([[5, 0, 0, Q], [6, 1, Q, Q], [5, 0, 2 * Q, 2 * Q]]))).toEqual(['accidental']);
    // Raised seventh as the last note: never resolved.
    expect(codes(ending([[4, 0, 0, Q], [5, 0, Q, Q], [6, 1, 2 * Q, 2 * Q]]))).toEqual(['accidental']);
    // A raised fourth and a lowered seventh are chromatic notes.
    expect(codes(ending([[3, 1, 0, Q], [4, 0, Q, Q], [4, 0, 2 * Q, 2 * Q]]))).toEqual(['accidental']);
    expect(codes(ending([[5, 0, 0, Q], [6, -1, Q, Q], [7, 0, 2 * Q, 2 * Q]]))).toEqual(['accidental']);
  });

  it('measures a leap on the top note of the right hand and the bottom note of the left', () => {
    const piece = validPiece(8, 'C');
    const right = withBar(piece, 'rh', 0, [[[-2, 9], Q], [[7, 8], Q], [4, Q], [1, Q]]);
    expect(codes(right)).toEqual([]);
    const left = withBar(piece, 'lh', 0, [[[-2, 9], 2 * Q], [[-1, 0], 2 * Q]]);
    expect(codes(left)).toEqual([]);
    expect(codes(withBar(piece, 'rh', 0, [[[0, 1], Q], [[2, 9], Q], [8, Q], [7, Q]]))).toContain('leap');
  });

  it('rejects gaps, overlaps, duplicate ids and notes past the end', () => {
    const piece = validPiece(5, 'Eb');
    expect(codes({ ...piece, events: piece.events.slice(1) })).toContain('tiling');
    expect(codes({ ...piece, events: [...piece.events, { ...piece.events[0], id: 'extra' }] })).toContain('tiling');
    expect(codes({ ...piece, events: [...piece.events, piece.events[0]] })).toContain('event');
    const last = piece.events.filter((event) => event.hand === 'rh').at(-1);
    expect(codes({ ...piece, events: piece.events.map((event) => event === last ? { ...event, durationTick: 4 * Q } : event) })).toContain('bounds');
    expect(codes({ ...piece, events: piece.events.map((event, index) => index === 0 ? { ...event, hand: 'both' } : event) })).toContain('event');
    expect(codes({ ...piece, events: [] })).toEqual(expect.arrayContaining(['tiling']));
  });

  it('checks compound time by the dotted-quarter beat', () => {
    const key = srtReadingKey('C');
    const E = Q / 2;
    const bar = 6 * E;
    const rhBar = [[0, E], [1, E], [2, E], [1, Q], [0, E]];
    const piece = {
      schemaVersion: 1, generatorVersion: 2, level: 7, seed: 7, meter: { num: 6, den: 8 }, ticksPerQuarter: 480, key, bars: 8,
      events: Array.from({ length: 8 }, (_, index) => [
        ...line(key, 'rh', index * bar, index === 7 ? [[0, bar]] : rhBar),
        ...line(key, 'lh', index * bar, [[0, 3 * E], [4, 3 * E]]),
      ]).flat(),
    };
    expect(codes(piece)).toEqual([]);
    // Three quarters in 6/8: the second one crosses the middle of the bar.
    expect(codes({ ...piece, events: [...piece.events.filter((event) => event.hand !== 'rh' || event.onsetTick >= bar),
      ...line(key, 'rh', 0, [[0, Q], [1, Q], [2, Q]])] })).toEqual(['offbeat']);
    expect(codes({ ...piece, level: 6 })).toContain('meter');
  });
});

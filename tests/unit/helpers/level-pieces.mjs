// Builds level pieces by hand for the sight-reading tests: notes are given as scale degrees.
import { srtDegreePitch, srtReadingKey } from '../../../src/sight-reading/levels.ts';
import { srtBarPatterns } from '../../../src/sight-reading/patterns.ts';
import { srtDifficulty } from '../../../src/sight-reading/rules.ts';

export const Q = 480;
export const E = 240;
export const S = 120;
let nextId = 0;

/**
 * Lays out cells for one hand from a tick. A cell is [degree, ticks] or [degree, ticks, alter].
 * The degree is a number, a list of numbers (a chord) or null (a rest).
 */
export function line(key, hand, startTick, cells) {
  let tick = startTick;
  return cells.map(([degree, ticks, alter = 0]) => {
    const degrees = degree === null ? [] : Array.isArray(degree) ? degree : [degree];
    const event = {
      id: `f${nextId++}`, hand, onsetTick: tick, durationTick: ticks,
      pitches: degrees.map((d, index) => srtDegreePitch(key, hand, d, index === degrees.length - 1 || degrees.length === 1 ? alter : 0)),
    };
    tick += ticks;
    return event;
  });
}

/**
 * A planned piece. `rh` and `lh` are lists of bars, each a list of cells. A missing bar is a whole-bar rest.
 * `rhFlat` and `lhFlat` give one list of cells for the whole piece instead, for notes that cross a barline.
 */
export function planned({ level, key = 'C', meter = [4, 4], bars, rh = [], lh = [], rhFlat, lhFlat, chords, melody, upbeat = false }) {
  const readingKey = srtReadingKey(key);
  const barTicks = meter[1] === 4 ? meter[0] * Q : meter[0] * E;
  const hand = (name, perBar, flat) => (flat ? line(readingKey, name, 0, flat)
    : Array.from({ length: bars }, (_, bar) => line(readingKey, name, bar * barTicks, perBar[bar] ?? [[null, barTicks]])).flat());
  return {
    schemaVersion: 1, generatorVersion: 2, level, seed: 1, meter: { num: meter[0], den: meter[1] }, ticksPerQuarter: 480,
    key: readingKey, bars, events: [...hand('rh', rh, rhFlat), ...hand('lh', lh, lhFlat)],
    chords: chords ?? Array.from({ length: bars }, (_, bar) => (bar === bars - 2 ? [4, 4] : [0, 0])),
    melody: melody ?? Array.from({ length: bars }, () => 'rh'),
    upbeat,
  };
}

/** A planned piece with its patterns and difficulty, as the generator hands pieces out. */
export function generated(options) {
  const piece = planned(options);
  return { ...piece, patterns: srtBarPatterns(piece), difficulty: srtDifficulty(piece) };
}

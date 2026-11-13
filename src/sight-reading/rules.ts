// The rules a generated piece must keep, G2 to G16 of docs/plans/2026-11-13-read-redesign-spec.md.
// Each rule is a function that returns what is wrong with a piece: an empty list means the rule holds.
import {
  srtLevel, srtLevelViolations, srtMeterTicks, srtStrongOnsets,
  type ReadingLevel, type ReadingPatternId,
} from './levels.js';
import {
  srtBarPatterns, srtChordAt, srtChordTones, srtHandLine, srtMelodyLine, srtMelodyRhythm,
  type LineNote, type PlannedPiece,
} from './patterns.js';

/** A piece as the generator hands it out: with the patterns of each bar and its difficulty score. */
export type GeneratedPiece = PlannedPiece & {
  readonly patterns: readonly (readonly ReadingPatternId[])[];
  readonly difficulty: number;
};

export type RuleId = 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8' | 'G9' | 'G10' | 'G11' | 'G12' | 'G13' | 'G14' | 'G16';
export type RuleViolation = { readonly rule: RuleId; readonly detail: string };

const HALF = 960;
const QUARTER = 480;
const mod7 = (value: number): number => ((value % 7) + 7) % 7;
/** Intervals between the bass and the melody that sound settled: unison or octave, third, fifth, sixth (and tenth). */
const CONSONANT = [0, 2, 4, 5];

/** The first bar that is not an upbeat bar. */
const firstFullBar = (piece: PlannedPiece): number => (piece.upbeat ? 1 : 0);
/** A piece of 4 or 6 bars has two phrases. A longer piece has phrases of 4 bars. */
export function srtPhraseBars(bars: number): number {
  return bars <= 6 ? Math.max(1, Math.floor(bars / 2)) : 4;
}
/** How many different bar rhythms the melody may use before the final bar. */
export function srtRhythmLimit(bars: number): number {
  return bars <= 4 ? 2 : bars <= 8 ? 3 : 4;
}
/**
 * How many times a hand may move to a new position in a piece. The right hand gets 1, 2 and 3 moves per four bars
 * at levels 6, 7 and 8. The left hand follows the chords: 2 moves per four bars at level 6, then one per bar.
 */
export function srtShiftLimit(level: ReadingLevel, bars: number, hand: 'rh' | 'lh' = 'rh'): number {
  if (level.id <= 5) return 0;
  const perFourBars = hand === 'rh' ? level.id - 5 : level.id === 6 ? 2 : 4;
  return perFourBars * Math.ceil(bars / 4);
}
/** How many scale steps a hand covers without moving: a fifth, and a sixth once the hand has learned to stretch. */
export function srtHandSpan(level: ReadingLevel): number {
  return level.id >= 5 ? 5 : 4;
}

/**
 * The fewest position changes a hand needs for its notes, or null when no fingering exists.
 * A hand may change position after a rest, after a note of a quarter or longer, at the start of a bar,
 * or between two notes a step apart (the thumb passes under, as in a scale).
 */
export function srtMinShifts(notes: readonly LineNote[], span: number): number | null {
  const count = notes.length;
  if (count === 0) return 0;
  const best: number[] = Array.from({ length: count + 1 }, () => Number.POSITIVE_INFINITY);
  best[0] = 0;
  for (let start = 0; start < count; start += 1) {
    if (!Number.isFinite(best[start])) continue;
    if (start > 0 && !(notes[start].afterRest || notes[start - 1].duration >= QUARTER || notes[start].bar !== notes[start - 1].bar ||
        Math.abs(notes[start].line - notes[start - 1].line) === 1)) continue;
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (let end = start; end < count; end += 1) {
      low = Math.min(low, ...notes[end].degrees);
      high = Math.max(high, ...notes[end].degrees);
      if (high - low > span) break;
      best[end + 1] = Math.min(best[end + 1], best[start] + 1);
    }
  }
  return Number.isFinite(best[count]) ? best[count] - 1 : null;
}

/** A number that grows with what makes a piece harder to read: leaps, turns, note values, shifts, accidentals, density. */
export function srtDifficulty(piece: PlannedPiece): number {
  const level = srtLevel(piece.level);
  const { bar } = srtMeterTicks(piece.meter);
  const lines = [srtHandLine(piece, 'rh'), srtHandLine(piece, 'lh')];
  const all = lines.flat();
  const melody = srtMelodyLine(piece);
  const leaps = lines.reduce((sum, line) => sum + line.reduce((inner, note, index) =>
    inner + (index > 0 ? Math.max(0, Math.abs(note.line - line[index - 1].line) - 1) : 0), 0), 0);
  let turns = 0;
  let direction = 0;
  for (let index = 1; index < melody.length; index += 1) {
    const sign = Math.sign(melody[index].line - melody[index - 1].line);
    if (sign !== 0 && direction !== 0 && sign !== direction) turns += 1;
    if (sign !== 0) direction = sign;
  }
  const values = new Set(all.map((note) => note.duration)).size;
  const chromatic = all.reduce((sum, note) => sum + note.alters.filter((alter) => alter !== 0).length, 0);
  const quarters = piece.bars * bar / QUARTER;
  const rightOnsets = new Set(lines[0].map((note) => note.onset));
  const together = lines[1].filter((note) => rightOnsets.has(note.onset) && note.onset % bar !== 0).length;
  const shifts = lines.reduce((sum, line) => sum + (srtMinShifts(line, srtHandSpan(level)) ?? 8), 0);
  const score = 0.8 * leaps / piece.bars + 0.5 * turns / piece.bars + 0.5 * (values - 1) + 4 * chromatic / piece.bars +
    2 * all.length / quarters + 0.4 * together / piece.bars + 4 * shifts / piece.bars;
  return Math.round(score * 100) / 100;
}

/**
 * The score a piece of each level must fall in (rule G14). Measured on 1,440 generated pieces per level
 * (24 keys, 60 seeds): the band runs from the 3rd to the 97th percentile, and the two inner numbers split it in thirds.
 * A score compares pieces of one level. It does not compare levels.
 */
export const SRT_LEVEL_BANDS: Readonly<Record<number, readonly [number, number, number, number]>> = {
  1: [2, 2.5, 2.75, 3.25],
  2: [1.99, 2.58, 3.02, 3.6],
  3: [3.83, 4.47, 5.03, 6.1],
  4: [4.42, 5.85, 6.65, 8.13],
  5: [6.04, 7.55, 8.48, 10.24],
  6: [7.73, 9.85, 11.16, 13.22],
  7: [8.47, 11.86, 14.37, 18.48],
  8: [8.64, 11.26, 13.1, 16.43],
};

/** The score range of a third of a level's band: 0 is the easiest third, 2 the hardest. */
export function srtSubBand(levelId: number, third: 0 | 1 | 2): readonly [number, number] {
  const band = SRT_LEVEL_BANDS[srtLevel(levelId).id];
  return [band[third], band[third + 1]];
}

type Check = (piece: GeneratedPiece) => readonly string[];

const CHECKS: Readonly<Record<RuleId, Check>> = {
  G2: (piece) => srtLevelViolations(piece).map((violation) => `${violation.code}: ${violation.detail}`),

  G3: (piece) => {
    const allowed = piece.level >= 6 ? [0, 1, 3, 4, 5] : [0, 3, 4];
    const out: string[] = [];
    if (piece.chords.length !== piece.bars) return ['one chord pair per bar'];
    if (piece.chords.some((slots) => slots.length !== 2 || slots.some((root) => !allowed.includes(root)))) out.push('chord outside the level');
    const last = piece.chords[piece.bars - 1];
    const before = piece.chords[piece.bars - 2];
    if (last[0] !== 0 || last[1] !== 0 || !before || before[1] !== 4) out.push('the piece does not end V to I');
    return out;
  },

  G4: (piece) => {
    const { bar } = srtMeterTicks(piece.meter);
    const strong = srtStrongOnsets(piece.meter);
    return [srtHandLine(piece, 'rh'), srtHandLine(piece, 'lh')].flat()
      .filter((note) => strong.includes(note.onset % bar) &&
        note.degrees.some((degree) => !srtChordTones(srtChordAt(piece, note.onset)).includes(mod7(degree))))
      .map((note) => `strong-beat note outside the chord at tick ${note.onset}`);
  },

  G5: (piece) => {
    const melody = srtMelodyLine(piece);
    const moves = melody.slice(1).map((note, index) => Math.abs(note.line - melody[index].line));
    const steps = moves.filter((size) => size <= 1).length;
    return moves.length > 0 && steps / moves.length < 0.6 ? [`${steps} of ${moves.length} moves are steps or repeats`] : [];
  },

  G6: (piece) => {
    const melody = srtMelodyLine(piece);
    const out: string[] = [];
    for (let index = 2; index < melody.length; index += 1) {
      const leap = melody[index - 1].line - melody[index - 2].line;
      if (Math.abs(leap) >= 4 && melody[index].line - melody[index - 1].line !== -Math.sign(leap)) out.push(`leap not recovered at tick ${melody[index].onset}`);
    }
    return out;
  },

  G7: (piece) => {
    if (piece.level < 4) return [];
    const melody = srtMelodyLine(piece);
    if (melody.length === 0) return ['no melody'];
    const top = Math.max(...melody.map((note) => note.line));
    const peaks = melody.filter((note) => note.line === top);
    if (peaks.length !== 1) return [`the highest note appears ${peaks.length} times`];
    return peaks[0].bar > firstFullBar(piece) ? [] : ['the highest note is in the first bar'];
  },

  G8: (piece) => {
    const { bar } = srtMeterTicks(piece.meter);
    const melody = srtMelodyLine(piece);
    if (melody.length < 2) return ['no melody'];
    const out: string[] = [];
    const first = melody[0];
    const last = melody[melody.length - 1];
    if (![0, 2, 4].includes(mod7(first.line)) || first.alter !== 0) out.push('the melody does not start on degree 1, 3 or 5');
    if (mod7(last.line) !== 0 || last.alter !== 0) out.push('the melody does not end on the tonic');
    if (Math.abs(last.line - melody[melody.length - 2].line) !== 1) out.push('the last note is not approached by step');
    if (last.duration < Math.min(HALF, bar)) out.push('the last note is too short');
    if (last.onset + last.duration !== piece.bars * bar) out.push('the last note does not end the piece');
    if (piece.level >= 4) {
      const bass = srtHandLine(piece, 'lh');
      if (bass.length === 0 || mod7(bass[bass.length - 1].line) !== 0) out.push('the bass does not end on the tonic');
    }
    return out;
  },

  G9: (piece) => {
    const phrase = srtPhraseBars(piece.bars);
    const melody = srtMelodyLine(piece);
    const targets = piece.key.mode === 'minor' ? [1, 4] : [1, 4, 6];
    const out: string[] = [];
    for (let start = 0; start < piece.bars; start += phrase) {
      const end = Math.min(piece.bars, start + phrase);
      if (end < piece.bars) {
        const close = melody.filter((note) => note.bar < end).at(-1);
        if (!close || !targets.includes(mod7(close.line))) out.push(`the phrase ending in bar ${end} does not stop on degree 2, 5 or 7`);
      }
      if (start > 0 && srtMelodyRhythm(piece, start) !== srtMelodyRhythm(piece, firstFullBar(piece))) {
        out.push(`bar ${start + 1} does not take up the rhythm of the first bar`);
      }
    }
    return out;
  },

  G10: (piece) => {
    const rhythms = new Set<string>();
    for (let bar = firstFullBar(piece); bar < piece.bars - 1; bar += 1) rhythms.add(srtMelodyRhythm(piece, bar));
    return rhythms.size > srtRhythmLimit(piece.bars) ? [`${rhythms.size} different bar rhythms`] : [];
  },

  G11: (piece) => {
    const level = srtLevel(piece.level);
    if (level.hands !== 'oneMoves' && level.hands !== 'together') return [];
    const { bar } = srtMeterTicks(piece.meter);
    const strong = srtStrongOnsets(piece.meter);
    const right = srtHandLine(piece, 'rh');
    const left = srtHandLine(piece, 'lh');
    const sounding = (line: readonly LineNote[], tick: number): LineNote | undefined =>
      line.find((note) => note.onset <= tick && tick < note.onset + note.duration);
    const out: string[] = [];
    const ticks = [...new Set([...right, ...left].map((note) => note.onset))];
    for (const tick of ticks) {
      const upper = sounding(right, tick);
      const lower = sounding(left, tick);
      if (!upper || !lower) continue;
      if (Math.min(...upper.midis) <= Math.max(...lower.midis)) out.push(`the hands cross at tick ${tick}`);
      if (strong.includes(tick % bar) && !CONSONANT.includes(mod7(upper.line - lower.line))) out.push(`dissonance between the hands at tick ${tick}`);
    }
    return out;
  },

  G12: (piece) => {
    const level = srtLevel(piece.level);
    const out: string[] = [];
    for (const hand of ['rh', 'lh'] as const) {
      const line = srtHandLine(piece, hand);
      if (line.some((note) => Math.max(...note.degrees) - Math.min(...note.degrees) > 5)) out.push(`${hand}: chord wider than a sixth`);
      const shifts = srtMinShifts(line, srtHandSpan(level));
      if (shifts === null) out.push(`${hand}: no fingering`);
      else if (shifts > srtShiftLimit(level, piece.bars, hand)) out.push(`${hand}: ${shifts} position changes`);
    }
    return out;
  },

  G13: (piece) => srtLevelViolations(piece).filter((violation) => violation.code === 'pitch' || violation.code === 'accidental')
    .map((violation) => `${violation.code}: ${violation.detail}`),

  G14: (piece) => {
    const band = SRT_LEVEL_BANDS[piece.level];
    const score = srtDifficulty(piece);
    const out: string[] = [];
    if (score !== piece.difficulty) out.push(`stored difficulty ${piece.difficulty} is not ${score}`);
    if (score < band[0] || score > band[3]) out.push(`difficulty ${score} outside ${band[0]} to ${band[3]}`);
    return out;
  },

  G16: (piece) => {
    const level = srtLevel(piece.level);
    const found = srtBarPatterns(piece);
    const out: string[] = [];
    if (JSON.stringify(found) !== JSON.stringify(piece.patterns)) out.push('the stored patterns are not the ones in the notes');
    found.forEach((patterns, bar) => {
      if (patterns.length === 0) out.push(`bar ${bar + 1} shows no pattern`);
    });
    if (!found.flat().some((pattern) => level.newPatterns.includes(pattern))) out.push('no new pattern of the level');
    return out;
  },
};

export const SRT_RULE_IDS = Object.keys(CHECKS) as readonly RuleId[];

/** What a piece breaks in one rule. */
export function srtCheckRule(rule: RuleId, piece: GeneratedPiece): readonly string[] {
  return CHECKS[rule](piece);
}

/** Everything a piece breaks, over all rules. An empty list means the piece may be shown. */
export function srtRuleViolations(piece: GeneratedPiece): readonly RuleViolation[] {
  return SRT_RULE_IDS.flatMap((rule) => CHECKS[rule](piece).map((detail) => ({ rule, detail })));
}

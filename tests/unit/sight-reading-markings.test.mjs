import { describe, expect, it } from 'vitest';
import { srtLevelFingerprint } from '../../src/sight-reading/fingerprint.ts';
import { srtMeterTicks, srtPitchPlace } from '../../src/sight-reading/levels.ts';
import { srtLevelMarkings } from '../../src/sight-reading/markings.ts';
import { srtGenerateLevelPiece } from '../../src/sight-reading/melody.ts';
import { srtGenerateProgressivePiece } from '../../src/sight-reading/progressive.ts';
import { srtLevelExpected, srtLevelScore } from '../../src/sight-reading/score.ts';

const LEVEL_IDS = [1, 2, 3, 4, 5, 6, 7, 8];
const KEYS = ['C', 'G', 'F', 'Am', 'Eb', 'F#m'];
const SEEDS = 30;
const LONG = 240000;
const EPS = 1e-6;
const ORDER = ['p', 'mp', 'mf', 'f'];

let sample = null;
/** Level pieces of every level and long pieces, each with its markings. */
function marked() {
  if (!sample) {
    sample = [];
    for (const level of LEVEL_IDS) {
      for (const key of KEYS) for (let seed = 0; seed < SEEDS; seed += 1) {
        const piece = srtGenerateLevelPiece(level, key, seed);
        sample.push({ piece, marks: srtLevelMarkings(piece) });
      }
      for (const key of ['C', 'D', 'Bb']) for (let seed = 0; seed < 4; seed += 1) {
        const piece = srtGenerateProgressivePiece(level, key, seed);
        sample.push({ piece, marks: srtLevelMarkings(piece) });
      }
    }
  }
  return sample;
}

const sectionsOf = (piece) => piece.sections ?? [{ level: piece.level, startBar: 0, bars: piece.bars }];
const notesOf = (piece, hand) => piece.events.filter((event) => event.hand === hand).sort((a, b) => a.onsetTick - b.onsetTick);
const noteAt = (piece, hand, beat) => notesOf(piece, hand).find((event) => event.pitches.length > 0 && Math.abs(event.onsetTick / 480 - beat) < EPS);
const label = (piece) => `${piece.level} ${piece.key.id} ${piece.seed}${piece.sections ? ' long' : ''}`;

describe('markings of a level piece', () => {
  it('puts every hand marking on a real onset of that hand', () => {
    for (const { piece, marks } of marked()) {
      for (const item of [...marks.fingering, ...marks.articulations]) expect(noteAt(piece, item.hand, item.beat), label(piece)).toBeDefined();
      for (const slur of marks.slurs) {
        expect(noteAt(piece, slur.hand, slur.from), label(piece)).toBeDefined();
        expect(noteAt(piece, slur.hand, slur.to), label(piece)).toBeDefined();
      }
      const anyOnset = (beat) => ['rh', 'lh'].some((hand) => noteAt(piece, hand, beat));
      for (const pin of marks.hairpins) expect(anyOnset(pin.from) && anyOnset(pin.to), label(piece)).toBe(true);
      for (const dynamic of marks.dynamics.filter((item) => item.beat > 0)) expect(anyOnset(dynamic.beat), label(piece)).toBe(true);
    }
  }, LONG);

  it('uses the beat unit of the score: quarter notes from the start of the piece', () => {
    for (const { piece, marks } of marked().slice(0, 400)) {
      const score = srtLevelScore(piece);
      for (const hand of ['rh', 'lh']) {
        // Rebuild each onset from the token lengths, the way a renderer walks the tokens.
        const onsets = [];
        let at = 0;
        for (const token of score[hand]) {
          if (token[0] !== 'R' && token[2] !== 'tied') onsets.push(at);
          at += token[1];
        }
        for (const item of marks.fingering.filter((mark) => mark.hand === hand)) expect(onsets.some((beat) => Math.abs(beat - item.beat) < EPS)).toBe(true);
      }
    }
  }, LONG);

  it('has exactly one dynamic at beat 0, and a rising mark at each section start of a long piece', () => {
    for (const { piece, marks } of marked()) {
      expect(marks.dynamics.filter((item) => Math.abs(item.beat) < EPS), label(piece)).toHaveLength(1);
      expect(new Set(marks.dynamics.map((item) => item.beat)).size).toBe(marks.dynamics.length);
      if (piece.sections) {
        const { bar } = srtMeterTicks(piece.meter);
        expect(marks.dynamics.map((item) => item.beat)).toEqual(piece.sections.map((section) => section.startBar * bar / 480));
        const levels = marks.dynamics.map((item) => ORDER.indexOf(item.mark));
        expect(levels.every((value, index) => index === 0 || value > levels[index - 1]), label(piece)).toBe(true);
      } else {
        expect(marks.dynamics.length).toBeLessThanOrEqual(piece.level >= 2 ? 2 : 1);
      }
    }
  }, LONG);

  it('never puts staccato on a tied or long note, or next to a slur', () => {
    for (const { piece, marks } of marked()) {
      const { bar } = srtMeterTicks(piece.meter);
      for (const item of marks.articulations.filter((mark) => mark.kind === 'staccato')) {
        const note = noteAt(piece, item.hand, item.beat);
        expect(note.durationTick, label(piece)).toBeLessThanOrEqual(480);
        expect((note.onsetTick % bar) + note.durationTick, label(piece)).toBeLessThanOrEqual(bar);
        const slurs = marks.slurs.filter((slur) => slur.hand === item.hand);
        expect(slurs.some((slur) => item.beat >= slur.from - EPS && item.beat <= slur.to + EPS), label(piece)).toBe(false);
        const next = notesOf(piece, item.hand).find((event) => event.pitches.length > 0 && event.onsetTick > note.onsetTick);
        if (next) expect(slurs.some((slur) => next.onsetTick / 480 >= slur.from - EPS && next.onsetTick / 480 <= slur.to + EPS), label(piece)).toBe(false);
      }
    }
  }, LONG);

  it('uses staccato in whole bars, in at most a quarter of the bars', () => {
    for (const { piece, marks } of marked()) {
      const { bar } = srtMeterTicks(piece.meter);
      const staccato = marks.articulations.filter((mark) => mark.kind === 'staccato');
      const bars = new Set(staccato.map((item) => Math.floor(item.beat * 480 / bar)));
      const limit = sectionsOf(piece).reduce((sum, section) => sum + Math.floor(section.bars / 4), 0);
      expect(bars.size, label(piece)).toBeLessThanOrEqual(limit);
      for (const index of bars) {
        const hands = new Set(staccato.filter((item) => Math.floor(item.beat * 480 / bar) === index).map((item) => item.hand));
        for (const hand of hands) {
          const inBar = notesOf(piece, hand).filter((event) => event.pitches.length > 0 && Math.floor(event.onsetTick / bar) === index);
          const marked = staccato.filter((item) => item.hand === hand && Math.floor(item.beat * 480 / bar) === index);
          expect(marked.length, label(piece)).toBe(inBar.length);
        }
      }
    }
  }, LONG);

  it('slurs two to four notes by step, never across a rest', () => {
    for (const { piece, marks } of marked()) {
      for (const slur of marks.slurs) {
        expect(slur.from).toBeLessThan(slur.to);
        const span = notesOf(piece, slur.hand).filter((event) => event.onsetTick / 480 >= slur.from - EPS && event.onsetTick / 480 <= slur.to + EPS);
        expect(span.length, label(piece)).toBeGreaterThanOrEqual(2);
        expect(span.length, label(piece)).toBeLessThanOrEqual(4);
        expect(span.every((event) => event.pitches.length === 1), label(piece)).toBe(true);
        span.forEach((event, index) => {
          if (index === 0) return;
          const before = span[index - 1];
          expect(before.onsetTick + before.durationTick, label(piece)).toBe(event.onsetTick);
          const step = srtPitchPlace(event.pitches[0], piece.key, slur.hand).degree - srtPitchPlace(before.pitches[0], piece.key, slur.hand).degree;
          expect(Math.abs(step), label(piece)).toBe(1);
        });
      }
    }
  }, LONG);

  it('keeps hairpins rare and clear of the dynamics', () => {
    for (const { piece, marks } of marked()) {
      const limit = sectionsOf(piece).reduce((sum, section) => sum + Math.ceil(section.bars / 8), 0);
      expect(marks.hairpins.length, label(piece)).toBeLessThanOrEqual(limit);
      marks.hairpins.forEach((pin, index) => {
        expect(pin.from).toBeLessThan(pin.to);
        expect(marks.dynamics.some((item) => item.beat > pin.from + EPS && item.beat < pin.to - EPS), label(piece)).toBe(false);
        if (index > 0) expect(marks.hairpins[index - 1].to).toBeLessThanOrEqual(pin.from);
      });
    }
  }, LONG);

  it('gives level 1 and 2 only dynamics and fingering, and accents only from level 5', () => {
    for (const { piece, marks } of marked()) {
      const levels = sectionsOf(piece).map((section) => section.level);
      if (Math.max(...levels) <= 2) {
        expect(marks.hairpins).toEqual([]);
        expect(marks.articulations).toEqual([]);
        expect(marks.slurs).toEqual([]);
      }
      if (Math.max(...levels) < 5) expect(marks.articulations.some((item) => item.kind === 'accent')).toBe(false);
    }
    const kinds = (level) => marked().filter(({ piece }) => piece.level === level && !piece.sections);
    for (const level of [3, 5, 8]) {
      expect(kinds(level).some(({ marks }) => marks.slurs.length > 0), `slurs ${level}`).toBe(true);
      expect(kinds(level).some(({ marks }) => marks.articulations.some((item) => item.kind === 'staccato')), `staccato ${level}`).toBe(true);
      expect(kinds(level).some(({ marks }) => marks.hairpins.length > 0), `hairpins ${level}`).toBe(true);
    }
    expect(kinds(6).some(({ marks }) => marks.articulations.some((item) => item.kind === 'accent'))).toBe(true);
  }, LONG);

  it('fingers the first note of each hand from its five-finger position', () => {
    for (const { piece, marks } of marked()) {
      for (const item of marks.fingering) expect([1, 2, 3, 4, 5]).toContain(item.finger);
      if (piece.sections || piece.level > 4) continue;
      // Up to level 4 a hand stays in the tonic position: the thumb on the tonic (right) or the little finger (left).
      for (const hand of ['rh', 'lh']) {
        const first = notesOf(piece, hand).find((event) => event.pitches.length > 0);
        const fingers = marks.fingering.filter((item) => item.hand === hand);
        expect(fingers, label(piece)).toHaveLength(first ? 1 : 0);
        if (!first) continue;
        expect(fingers[0].beat).toBeCloseTo(first.onsetTick / 480, 9);
        const degree = srtPitchPlace(first.pitches[0], piece.key, hand).degree;
        expect(fingers[0].finger).toBe(hand === 'rh' ? degree + 1 : 5 - degree);
      }
    }
  }, LONG);

  it('accents only a note on a beat of the meter', () => {
    for (const { piece, marks } of marked()) {
      const { bar, beat } = srtMeterTicks(piece.meter);
      for (const item of marks.articulations.filter((mark) => mark.kind === 'accent')) {
        expect(((item.beat * 480) % bar) % beat, label(piece)).toBe(0);
      }
    }
  }, LONG);

  it('is the same for the same piece, and changes nothing in it', () => {
    for (const { piece, marks } of marked().filter((_, index) => index % 7 === 0)) {
      const print = srtLevelFingerprint(piece);
      const expected = srtLevelExpected(piece);
      expect(srtLevelMarkings(piece)).toEqual(marks);
      expect(srtLevelFingerprint(piece)).toBe(print);
      expect(srtLevelExpected(piece)).toEqual(expected);
    }
  }, LONG);
});

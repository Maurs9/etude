import { expect, it } from 'vitest';
import { evaluateWaitChord } from '../../src/domain/wait-chord.ts';
const check = (attacks, held, { need = [60, 64, 67], rolled = [], allowed = [], octave = false } = {}) =>
  evaluateWaitChord(new Set(need), new Map(attacks), new Set(held), new Set(rolled), new Set(allowed), octave);

it('requires overlapping physical keys, not a memory of released notes or sustain', () => {
  const attacks = [[60, 0], [64, .05], [67, .1]];
  expect(check(attacks, [60, 64, 67]).complete).toBe(true);
  expect(check(attacks, [67]).complete).toBe(false);
  expect([...check(attacks, [67]).got]).toEqual([67]);
});
it('accepts attacks up to 150ms apart and requires replay after a slow assembled chord', () => {
  expect(check([[60, 0], [64, .05], [67, .15]], [60, 64, 67]).complete).toBe(true);
  expect(check([[60, 0], [64, .05], [67, .151]], [60, 64, 67]).complete).toBe(false);
  expect(check([[60, .2], [64, .22], [67, .23]], [60, 64, 67]).complete).toBe(true);
});
it('blocks extra wrong keys while allowing already-sounding written notes', () => {
  const attacks = [[60, 0], [64, .05], [67, .1]];
  expect(check(attacks, [60, 64, 67, 61]).complete).toBe(false);
  expect(check(attacks, [60, 64, 67, 55], { allowed: [55] }).complete).toBe(true);
});
it('honors any-octave matching one-to-one and reserves exact notes first', () => {
  expect(check([[48, 0], [52, .05], [55, .1]], [48, 52, 55], { octave: true }).complete).toBe(true);
  expect(check([[48, 0]], [48], { need: [60, 72], octave: true }).complete).toBe(false);
  expect(check([[48, 0], [60, .05]], [48, 60], { need: [60, 72], octave: true }).complete).toBe(true);
  expect(check([[48, 0], [52, .05], [55, .1]], [48, 52, 55]).complete).toBe(false);
});
it('only marked arpeggio pitches allow successive released attacks', () => {
  const attacks = [[60, 0], [64, .5], [67, 1]];
  expect(check(attacks, [67], { rolled: [60, 64, 67] }).complete).toBe(true);
  expect(check(attacks, [67], { rolled: [64, 67] }).complete).toBe(false);
});
it('requires fresh attacks even when all notes are already held', () => {
  expect(check([], [60, 64, 67]).complete).toBe(false);
  expect(check([[60, 0]], [60], { need: [60] }).complete).toBe(true);
  expect(check([], [], { need: [] }).complete).toBe(false);
});
it('reserves held keys for ordinary notes before matching an arpeggio in any-octave mode', () => {
  expect(check([[60, 0], [48, 1]], [60], { need: [60, 72], rolled: [60], octave: true }).complete).toBe(true);
  expect(check([[60, 0], [48, 1]], [48], { need: [60, 72], rolled: [72], octave: true }).complete).toBe(true);
});

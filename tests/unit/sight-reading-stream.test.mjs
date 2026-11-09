import { describe, expect, it } from 'vitest';
import { courtesyNatural, formatLead, ghostX, pacerLead, streamLead, streamStart, streamVisible } from '../../src/sight-reading/stream.ts';

const fit = { scale: 1.35, colW: 52, head: 66 };

describe('look-ahead note stream', () => {
  it('fits as many columns as the width allows, within bounds', () => {
    expect(streamVisible(1000, fit)).toBe(12);
    expect(streamVisible(600, fit)).toBe(7);
    expect(streamVisible(300, fit)).toBe(5);
    expect(streamVisible(0, fit)).toBe(5);
    expect(streamVisible(Number.NaN, fit)).toBe(5);
    expect(streamVisible(600, { ...fit, head: 76, min: 3, max: 6 })).toBe(6);
  });

  it('keeps one or two answered notes on the left', () => {
    expect(streamLead(5)).toBe(1);
    expect(streamLead(6)).toBe(1);
    expect(streamLead(7)).toBe(2);
    expect(streamStart(0, 8, null)).toBe(0);
    expect(streamStart(1, 8, null)).toBe(0);
    expect(streamStart(5, 8, null)).toBe(3);
    expect(streamStart(5, 5, null)).toBe(4);
  });

  it('stops scrolling at the end of a finite stream', () => {
    expect(streamStart(10, 8, 20)).toBe(8);
    expect(streamStart(14, 8, 20)).toBe(12);
    expect(streamStart(19, 8, 20)).toBe(12);
    expect(streamStart(20, 8, 20)).toBe(12);
    expect(streamStart(3, 8, 4)).toBe(0);
  });

  it('adds a courtesy natural after a recent altered note of the same letter and octave', () => {
    const fSharp4 = { li: 3, oct: 4, acc: 1 }, f4 = { li: 3, oct: 4, acc: 0 }, f5 = { li: 3, oct: 5 };
    const g4 = { li: 4, oct: 4 };
    expect(courtesyNatural([fSharp4], f4)).toBe(true);
    expect(courtesyNatural([fSharp4, g4, g4], { li: 3, oct: 4 })).toBe(true);
    expect(courtesyNatural([fSharp4], f5)).toBe(false);
    expect(courtesyNatural([fSharp4, f4], f4)).toBe(false);
    expect(courtesyNatural([fSharp4], { li: 3, oct: 4, acc: -1 })).toBe(false);
    expect(courtesyNatural([fSharp4, g4, g4, g4, g4, g4, g4], f4)).toBe(false);
    expect(courtesyNatural([fSharp4, g4, g4, g4, g4, g4], f4)).toBe(true);
    expect(courtesyNatural([], f4)).toBe(false);
  });

  it('places the ghost on note centres and holds it at the edges', () => {
    expect(ghostX(3, 3, 8, 66, 52)).toEqual({ x: 92, edge: 0 });
    expect(ghostX(3.5, 3, 8, 66, 52)).toEqual({ x: 118, edge: 0 });
    expect(ghostX(1, 3, 8, 66, 52)).toEqual({ x: 66, edge: -1 });
    expect(ghostX(20, 3, 8, 66, 52)).toEqual({ x: 66 + 8 * 52, edge: 1 });
  });

  it('reports how far ahead of the ghost the player is', () => {
    expect(pacerLead(5, 3.2)).toBe(2);
    expect(pacerLead(3, 3.4)).toBe(0);
    expect(Object.is(pacerLead(3, 3.4), 0)).toBe(true);
    expect(pacerLead(3, 5.9)).toBe(-3);
    expect(formatLead(2)).toBe('+2');
    expect(formatLead(-3)).toBe('−3');
    expect(formatLead(0)).toBe('±0');
  });
});

import { describe, expect, it } from 'vitest';
import {
  ACCOMP_I18N, ACCOMP_PATTERNS, ACCOMP_PROGS, CHORD_FEEL, CIRCLE, COMPOUND, INTERVALS, INV_NAMES,
  LACC_CH, LDUR, LP, MAJOR, PIECES, RO_IV, ROMAN, SONGS, dispSym, progChordTpl,
} from '../../src/domain/repertoire-data.ts';
import { CHORD_TEMPLATES } from '../../src/domain/theory.ts';

const NOTE_RE = /^[A-G][#b]?[0-8]$/;
const ALL_LANGS = ['en', 'ro', 'de', 'es', 'fr', 'it', 'pt-BR'];

describe('repertoire-data', () => {
  it('parses staff token strings with LP() across durations, chords, rests, and barlines', () => {
    expect(LP('C4w | D#4h Eb4q F4e G4s | Rq C4+E4+G4dh A4dq B4de C5t')).toEqual([
      ['C4', 4],
      ['D#4', 2],
      ['Eb4', 1],
      ['F4', 0.5],
      ['G4', 0.25],
      ['R', 1],
      [['C4', 'E4', 'G4'], 3],
      ['A4', 1.5],
      ['B4', 0.75],
      ['C5', 1 / 3],
    ]);
    expect(Object.keys(LDUR)).toEqual(['w', 'h', 'q', 'e', 's', 't', 'dh', 'dq', 'de']);
    expect(() => LP('C4x')).toThrow(/bad staff token/);
    expect(() => LP('invalid')).toThrow(/bad staff token/);
  });

  it('keeps every built-in piece structurally valid with matched RH/LH durations', () => {
    expect(PIECES.length).toBeGreaterThanOrEqual(20);
    const ids = new Set();
    for (const piece of PIECES) {
      expect(ids.has(piece.id), piece.id).toBe(false);
      ids.add(piece.id);
      expect(piece.t.en.trim().length, piece.id).toBeGreaterThan(0);
      expect(piece.t.ro.trim().length, piece.id).toBeGreaterThan(0);
      expect([1, 2, 3], piece.id).toContain(piece.level);
      expect(piece.bpm, piece.id).toBeGreaterThan(0);
      expect(piece.ts, piece.id).toHaveLength(2);
      expect(piece.ts[0], piece.id).toBeGreaterThan(0);
      expect(piece.ts[1], piece.id).toBeGreaterThan(0);

      let rhBeats = 0;
      let lhBeats = 0;
      for (const [note, dur] of piece.rh) {
        expect(Number.isFinite(dur) && dur > 0, `${piece.id} rh`).toBe(true);
        if (Array.isArray(note)) {
          expect(note.length, `${piece.id} rh chord`).toBeGreaterThan(1);
          note.forEach(n => expect(n, `${piece.id} rh`).toMatch(NOTE_RE));
        } else if (note !== 'R') {
          expect(note, `${piece.id} rh`).toMatch(NOTE_RE);
        }
        rhBeats += dur;
      }
      for (const [note, dur] of piece.lh) {
        expect(Number.isFinite(dur) && dur > 0, `${piece.id} lh`).toBe(true);
        if (Array.isArray(note)) {
          expect(note.length, `${piece.id} lh chord`).toBeGreaterThan(1);
          note.forEach(n => expect(n, `${piece.id} lh`).toMatch(NOTE_RE));
        } else if (note !== 'R') {
          expect(note, `${piece.id} lh`).toMatch(NOTE_RE);
        }
        lhBeats += dur;
      }
      expect(rhBeats, `${piece.id} beat parity`).toBeCloseTo(lhBeats, 6);
    }
  });

  it('maintains valid interval, song-hint, chord-feel, and circle-of-fifths tables', () => {
    expect(INTERVALS.map(i => i.semi)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(new Set(INTERVALS.map(i => i.short)).size).toBe(12);
    for (let semi = 1; semi <= 24; semi++) {
      expect(COMPOUND[semi]).toBeTruthy();
      expect(RO_IV[semi]).toBe(COMPOUND[semi]);
    }
    for (let semi = 1; semi <= 12; semi++) {
      expect(SONGS[semi].asc.length, `SONGS[${semi}].asc`).toBeGreaterThan(0);
      expect(SONGS[semi].desc.length, `SONGS[${semi}].desc`).toBeGreaterThan(0);
    }
    expect(MAJOR).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(ROMAN).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']);
    expect(INV_NAMES).toHaveLength(6);
    expect(CIRCLE).toHaveLength(12);
    expect([...CIRCLE].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (let i = 1; i < CIRCLE.length; i++) {
      expect((CIRCLE[i] - CIRCLE[i - 1] + 12) % 12).toBe(7);
    }
    for (const sym of Object.keys(CHORD_FEEL)) {
      expect(CHORD_TEMPLATES.some(t => t.symbol === sym), sym).toBe(true);
    }
  });

  it('resolves accompaniment progressions, display symbols, translations, and pattern events', () => {
    expect(dispSym('maj')).toBe('');
    expect(dispSym('m')).toBe('m');
    expect(dispSym('maj7')).toBe('maj7');
    expect(progChordTpl('maj7')?.intervals).toEqual([0, 4, 7, 11]);
    expect(progChordTpl('unknown')).toBeUndefined();

    expect(ACCOMP_PROGS.length).toBeGreaterThan(5);
    const blues = ACCOMP_PROGS.find(p => p.name === '12-bar blues');
    expect(blues?.chords).toHaveLength(12);
    for (const prog of ACCOMP_PROGS) {
      expect(prog.chords.length, prog.name).toBeGreaterThan(0);
      for (const [offset, sym, roman] of prog.chords) {
        expect(offset >= 0 && offset < 12, prog.name).toBe(true);
        expect(progChordTpl(sym), `${prog.name}:${sym}`).toBeTruthy();
        expect(roman.length, prog.name).toBeGreaterThan(0);
      }
    }

    const sampleChord = LACC_CH[0];
    expect(Object.keys(ACCOMP_I18N).sort()).toEqual(Object.keys(ACCOMP_PATTERNS).sort());
    for (const [key, pattern] of Object.entries(ACCOMP_PATTERNS)) {
      expect([3, 4], key).toContain(pattern.beats);
      for (const lang of ALL_LANGS) {
        expect(pattern[lang], `${key}:${lang}`).toBeTruthy();
      }
      const events = [];
      pattern.gen(events, 4, sampleChord);
      expect(events.length, key).toBeGreaterThan(0);
      for (const ev of events) {
        expect(ev.beat, key).toBeGreaterThanOrEqual(4);
        expect(ev.beat, key).toBeLessThan(4 + pattern.beats);
        expect(ev.durB, key).toBeGreaterThan(0);
        expect(['L', 'R'], key).toContain(ev.hand);
        expect(Number.isInteger(ev.midi), key).toBe(true);
      }
    }

    const boom = [];
    ACCOMP_PATTERNS.boomchick.gen(boom, 0, sampleChord);
    expect(boom.filter(e => e.hand === 'L').map(e => [e.beat, e.midi])).toEqual([
      [0, sampleChord.bass],
      [2, sampleChord.fifth],
    ]);

    const alberti = [];
    ACCOMP_PATTERNS.alberti.gen(alberti, 0, sampleChord);
    expect(alberti.filter(e => e.hand === 'R').slice(0, 4).map(e => e.midi)).toEqual([60, 67, 64, 67]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  AN_CHORDS,
  analyzeScoreSelection,
  anCadences,
  anHarmony,
  anInv,
  anRoman,
  lassoAppendPoint,
  lassoPolygonArea,
  pointInLasso,
} from '../../src/domain/score-harmony.ts';

const C_MAJOR = { root: 0, minor: false };
const M1 = { number: '1', start: 0, end: 4, num: 4, den: 4 };
const M2 = { number: '2', start: 4, end: 8, num: 4, den: 4 };

const note = (midi, start, end, extra = {}) => ({
  midi,
  start,
  end,
  soundEnd: extra.soundEnd ?? end,
  hand: extra.hand ?? (midi < 60 ? 'lh' : 'rh'),
  staff: extra.staff ?? (midi < 60 ? 2 : 1),
  voice: extra.voice ?? 1,
  part: 0,
  track: 0,
  vel: extra.vel ?? 80,
});

// John Lennon's "Imagine" bar 1 LH broken chord pattern:
// beats 1, 2, 3: (E3+G3) eighth, C3 eighth; beat 4: (E3+B3) eighth, C3 eighth (under damper pedal)
function imagineBar1({ withPedal = true, withMelody = true } = {}) {
  const pedEnd = withPedal ? 4 : undefined;
  const notes = [
    note(52, 0.0, 0.5, { soundEnd: withPedal ? pedEnd : 0.5 }), // E3
    note(55, 0.0, 0.5, { soundEnd: withPedal ? pedEnd : 0.5 }), // G3
    note(48, 0.5, 1.0, { soundEnd: withPedal ? pedEnd : 1.0 }), // C3
    note(52, 1.0, 1.5, { soundEnd: withPedal ? pedEnd : 1.5 }), // E3
    note(55, 1.0, 1.5, { soundEnd: withPedal ? pedEnd : 1.5 }), // G3
    note(48, 1.5, 2.0, { soundEnd: withPedal ? pedEnd : 2.0 }), // C3
    note(52, 2.0, 2.5, { soundEnd: withPedal ? pedEnd : 2.5 }), // E3
    note(55, 2.0, 2.5, { soundEnd: withPedal ? pedEnd : 2.5 }), // G3
    note(48, 2.5, 3.0, { soundEnd: withPedal ? pedEnd : 3.0 }), // C3
    note(52, 3.0, 3.5, { soundEnd: withPedal ? pedEnd : 3.5 }), // E3
    note(59, 3.0, 3.5, { soundEnd: withPedal ? pedEnd : 3.5 }), // B3 (walk-up ornament)
    note(48, 3.5, 4.0, { soundEnd: withPedal ? pedEnd : 4.0 }), // C3
  ];
  if (withMelody) {
    notes.push(note(72, 0, 2, { hand: 'rh', staff: 1 })); // C5
  }
  return notes;
}

describe('score-harmony broken chords, pedal weighting, and bass selection', () => {
  it('reads Imagine-style broken chord accompaniment as root-position C major (not Cmaj7/E)', () => {
    for (const withPedal of [false, true]) {
      const notes = imagineBar1({ withPedal, withMelody: true });
      const segs = anHarmony(notes, false, {
        measures: [M1],
        keyMap: [{ ...C_MAJOR, beat: 0 }],
      });
      expect(segs).toHaveLength(1);
      expect(segs[0].ch.root).toBe(0); // C
      expect(segs[0].ch.c.s).toBe(''); // C triad, not maj7
      expect(segs[0].bass).toBe(0); // C bass, not E
    }
  });

  it('keeps genuine first-inversion C/E when E3 is the actual sustained bass', () => {
    const notes = [
      note(52, 0, 4, { hand: 'lh', staff: 2 }), // E3 held whole bar
      note(60, 0, 4, { hand: 'rh', staff: 1 }), // C4
      note(64, 0, 4, { hand: 'rh', staff: 1 }), // E4
      note(67, 0, 4, { hand: 'rh', staff: 1 }), // G4
    ];
    const segs = anHarmony(notes, false, {
      measures: [M1],
      keyMap: [{ ...C_MAJOR, beat: 0 }],
    });
    expect(segs).toHaveLength(1);
    expect(segs[0].ch.root).toBe(0);
    expect(segs[0].ch.c.s).toBe('');
    expect(segs[0].bass).toBe(4); // E bass (C/E)
  });

  it('keeps genuine Cmaj7 when B4 has strong duration', () => {
    const notes = [
      note(48, 0, 4, { hand: 'lh', staff: 2 }), // C3
      note(55, 0, 4, { hand: 'lh', staff: 2 }), // G3
      note(64, 0, 4, { hand: 'rh', staff: 1 }), // E4
      note(71, 0, 4, { hand: 'rh', staff: 1 }), // B4
    ];
    const segs = anHarmony(notes, false, {
      measures: [M1],
      keyMap: [{ ...C_MAJOR, beat: 0 }],
    });
    expect(segs).toHaveLength(1);
    expect(segs[0].ch.root).toBe(0);
    expect(segs[0].ch.c.s).toBe('maj7');
  });

  it('uses MusicXML <harmony> symbols as a soft tie-breaker without overriding clear contrary notes', () => {
    // Ambiguous C4 + E4 + G4 + A4 (C6 vs Am7/C): <harmony> hint breaks the tie cleanly
    const ambiguous = [note(60, 0, 4), note(64, 0, 4), note(67, 0, 4), note(69, 0, 4)];
    const withC = anHarmony(ambiguous, false, {
      measures: [M1],
      keyMap: [{ ...C_MAJOR, beat: 0 }],
      harmonies: [{ beat: 0, root: 0, kind: 'major', bass: null, text: 'C' }],
    });
    const withAm = anHarmony(ambiguous, false, {
      measures: [M1],
      keyMap: [{ ...C_MAJOR, beat: 0 }],
      harmonies: [{ beat: 0, root: 9, kind: 'minor', bass: null, text: 'Am' }],
    });
    expect(withC[0].ch.root).toBe(0);
    expect(withAm[0].ch.root).toBe(9);
    expect(withAm[0].ch.c.s).toBe('m7');

    // Clear F major chord with wrong C major symbol still stays F major
    const clearF = [note(53, 0, 4), note(60, 0, 4), note(65, 0, 4), note(69, 0, 4)];
    const againstWrongHint = anHarmony(clearF, false, {
      measures: [M1],
      keyMap: [{ ...C_MAJOR, beat: 0 }],
      harmonies: [{ beat: 0, root: 0, kind: 'major', bass: null, text: 'C' }],
    });
    expect(againstWrongHint[0].ch.root).toBe(5);
  });

  it('detects authentic cadence across G7 -> C bars', () => {
    const g7ThenC = [
      note(43, 0, 4), note(59, 0, 4), note(62, 0, 4), note(65, 0, 4), // G7 in bar 1
      note(48, 4, 8), note(60, 4, 8), note(64, 4, 8), note(67, 4, 8), // C in bar 2
    ];
    const segs = anHarmony(g7ThenC, false, {
      measures: [M1, M2],
      keyMap: [{ ...C_MAJOR, beat: 0 }],
    });
    anCadences(segs, [{ ...C_MAJOR, beat: 0 }]);
    expect(segs).toHaveLength(2);
    expect(segs[1].cad).toBe('auth');
  });

  it('ignores null bass in anInv, labels minor secondary dominants, requires root-position tonic for authentic cadence, and detects 4-bar half cadences', () => {
    const maj = AN_CHORDS.find((c) => c.s === '');
    const dom7 = AN_CHORDS.find((c) => c.s === '7');
    expect(anInv({ ch: { c: maj, root: 5 }, bass: null })).toBe(0);

    const aMinor = { root: 9, minor: true };
    expect(anRoman(aMinor, { ch: { c: dom7, root: 7 }, bass: 55 })).toBe('V⁷/III');
    expect(anRoman(aMinor, { ch: { c: dom7, root: 0 }, bass: 48 })).toBe('V⁷/VI');
    expect(anRoman(aMinor, { ch: { c: dom7, root: 2 }, bass: 50 })).toBe('V⁷/VII');
    expect(anRoman(aMinor, { ch: { c: dom7, root: 9 }, bass: 45 })).toBe('V⁷/iv');

    const g7ThenC6 = [
      note(43, 0, 4), note(59, 0, 4), note(62, 0, 4), note(65, 0, 4),
      note(52, 4, 8), note(60, 4, 8), note(64, 4, 8), note(67, 4, 8),
    ];
    const invSegs = anHarmony(g7ThenC6, false, { measures: [M1, M2], keyMap: [{ ...C_MAJOR, beat: 0 }] });
    anCadences(invSegs, [{ ...C_MAJOR, beat: 0 }]);
    expect(invSegs[1].cad).not.toBe('auth');

    const m3 = { number: '3', start: 8, end: 12, num: 4, den: 4 };
    const m4 = { number: '4', start: 12, end: 16, num: 4, den: 4 };
    const m5 = { number: '5', start: 16, end: 20, num: 4, den: 4 };
    const phrase = [
      note(48, 0, 4), note(60, 0, 4), note(64, 0, 4), note(67, 0, 4),
      note(41, 4, 8), note(60, 4, 8), note(65, 4, 8), note(69, 4, 8),
      note(48, 8, 12), note(60, 8, 12), note(64, 8, 12), note(67, 8, 12),
      note(43, 12, 16), note(59, 12, 16), note(62, 12, 16), note(67, 12, 16),
      note(48, 16, 20), note(60, 16, 20), note(64, 16, 20), note(67, 16, 20),
    ];
    const phraseSegs = anHarmony(phrase, false, {
      measures: [M1, M2, m3, m4, m5],
      keyMap: [{ ...C_MAJOR, beat: 0 }],
    });
    anCadences(phraseSegs, [{ ...C_MAJOR, beat: 0 }]);
    expect(phraseSegs[3].cad).toBe('half');
  });
});

describe('analyzeScoreSelection for isolated notes, intervals, and partial chords', () => {
  const barNotes = imagineBar1({ withPedal: false, withMelody: true });
  const ctx = {
    measures: [M1],
    keyMap: [{ ...C_MAJOR, beat: 0 }],
    noteIndex: new Map(barNotes.map((n, i) => [n, i])),
  };
  const barSegs = anHarmony(barNotes, false, ctx);

  it('analyzes a single isolated note C3 with its scale degree, role, and clickable neighbors', () => {
    const c3 = barNotes[2]; // beat 0.5–1.0 in Imagine bar 1
    const sel = analyzeScoreSelection([c3], barNotes, barSegs, ctx);
    expect(sel?.kind).toBe('note');
    if (sel?.kind !== 'note') return;
    expect(sel.degreeLabel).toBe('1');
    expect(sel.diatonic).toBe(true);
    expect(sel.chordRole).toBe('root');
    // Same-beat broken chord partners should include E3 (52) and G3 (55), indexed in barNotes
    const beatMidis = sel.neighbors.sameBeat.map((nb) => nb.note.midi);
    expect(beatMidis).toContain(52);
    expect(beatMidis).toContain(55);
    expect(sel.neighbors.sameBeat.every((nb) => typeof nb.index === 'number')).toBe(true);
    // Simultaneous notes include melody C5 (72)
    expect(sel.neighbors.simultaneous.some((nb) => nb.note.midi === 72)).toBe(true);
    // Melodic previous in LH is E3/G3 before beat 0.5, next is E3/G3 at beat 1.0
    expect(sel.neighbors.prevMelodic).not.toBeNull();
    expect(sel.neighbors.nextMelodic).not.toBeNull();
    // Neighboring chord formed around C3 is C major
    expect(sel.neighbors.contextChord?.rootPc).toBe(0);
    expect(sel.neighbors.contextChord?.symbol).toBe('');
  });

  it('analyzes a two-note selection as an interval without claiming the full bar chord', () => {
    const e3 = barNotes[0];
    const g3 = barNotes[1];
    const sel = analyzeScoreSelection([e3, g3], barNotes, barSegs, ctx);
    expect(sel?.kind).toBe('interval');
    if (sel?.kind !== 'interval') return;
    expect(sel.semitones).toBe(3);
    expect(sel.simultaneous).toBe(true);
    expect(sel.degrees).toEqual(['3', '5']);
    expect(sel.neighbors.contextChord?.rootPc).toBe(0);
  });

  it('analyzes only the selected subset [E3, G3, C3] and excludes unselected B3', () => {
    const subset = [barNotes[0], barNotes[1], barNotes[2]];
    const sel = analyzeScoreSelection(subset, barNotes, barSegs, ctx);
    expect(sel?.kind).toBe('chord');
    if (sel?.kind !== 'chord') return;
    expect(sel.pitches).toEqual([48, 52, 55]);
    const labelTemplate = sel.segs[0]?.ch.c ?? sel.directChord?.template;
    expect(labelTemplate?.s).toBe(AN_CHORDS[0].s); // major triad, not maj7
  });

  it('assigns quality-aware roles for sus4, sus2, and power chords instead of labeling them chord 3rd', () => {
    const sus4Notes = [note(48, 0, 4), note(53, 0, 4), note(55, 0, 4)]; // C3, F3, G3
    const sus4Segs = anHarmony(sus4Notes, false, { measures: [M1], keyMap: [{ ...C_MAJOR, beat: 0 }] });
    expect(sus4Segs[0].ch.c.s).toBe('sus4');
    const fRole = analyzeScoreSelection([sus4Notes[1]], sus4Notes, sus4Segs, { measures: [M1], keyMap: [{ ...C_MAJOR, beat: 0 }] });
    expect(fRole?.kind === 'note' && fRole.chordRole).toBe('4th');

    const sus2Notes = [note(48, 0, 4), note(50, 0, 4), note(55, 0, 4)]; // C3, D3, G3
    const sus2Segs = anHarmony(sus2Notes, false, { measures: [M1], keyMap: [{ ...C_MAJOR, beat: 0 }] });
    expect(sus2Segs[0].ch.c.s).toBe('sus2');
    const dRole = analyzeScoreSelection([sus2Notes[1]], sus2Notes, sus2Segs, { measures: [M1], keyMap: [{ ...C_MAJOR, beat: 0 }] });
    expect(dRole?.kind === 'note' && dRole.chordRole).toBe('2nd');

    const powNotes = [note(48, 0, 4), note(55, 0, 4)]; // C3, G3 -> C5
    const powSegs = anHarmony(powNotes, false, { measures: [M1], keyMap: [{ ...C_MAJOR, beat: 0 }] });
    expect(powSegs[0].ch.c.s).toBe('5');
    const gRole = analyzeScoreSelection([powNotes[1]], powNotes, powSegs, { measures: [M1], keyMap: [{ ...C_MAJOR, beat: 0 }] });
    expect(gRole?.kind === 'note' && gRole.chordRole).toBe('5th');
  });

  it('does not pull intervening non-overlapping notes into simultaneous neighbors or context chord', () => {
    const separated = [
      note(60, 0, 1), // C4 beat 1
      note(64, 1, 2), // E4 beat 2 (between C and G, does not overlap either)
      note(67, 2, 3), // G4 beat 3
    ];
    const sel = analyzeScoreSelection([separated[0], separated[2]], separated, [], {
      measures: [M1],
      keyMap: [{ ...C_MAJOR, beat: 0 }],
    });
    expect(sel?.kind).toBe('interval');
    if (sel?.kind !== 'interval') return;
    expect(sel.neighbors.simultaneous).toEqual([]);
    expect(sel.neighbors.contextChord).toBeNull();
  });
});

describe('lasso free-shape geometry helpers', () => {
  it('filters duplicate near-zero pointer jitter via lassoAppendPoint', () => {
    const pts = [{ x: 100, y: 100 }];
    expect(lassoAppendPoint(pts, { x: 101, y: 101 }, 4)).toBe(false);
    expect(lassoAppendPoint(pts, { x: 110, y: 100 }, 4)).toBe(true);
    expect(pts).toHaveLength(2);
  });

  it('selects inside a concave diagonal lasso while rejecting bounding-box corners', () => {
    // L-shaped concave polygon inside bounding box (0..100, 0..100)
    const poly = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 60 },
      { x: 100, y: 60 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(lassoPolygonArea(poly)).toBeGreaterThan(16);
    expect(pointInLasso(20, 20, poly)).toBe(true);
    expect(pointInLasso(80, 80, poly)).toBe(true);
    // Inside bounding box, outside concave notch!
    expect(pointInLasso(80, 20, poly)).toBe(false);
  });

  it('supports thin 1D swipe fallback for brushing across notes without enclosing a large polygon', () => {
    const line = [
      { x: 10, y: 50 },
      { x: 110, y: 50 },
    ];
    expect(pointInLasso(60, 53, line)).toBe(true);
    expect(pointInLasso(60, 80, line)).toBe(false);
  });
});

describe('Wave 3A appoggiatura and cadential 6/4 detection', () => {
  it('classifies leap-approached and step-resolved non-chord tones as appoggiatura', () => {
    const segs = anHarmony(
      [
        note(48, 0, 4), note(52, 0, 4), note(55, 0, 4),
        note(60, 0, 1, { hand: 'rh', staff: 1 }), // C4 (chord tone)
        note(69, 1, 2, { hand: 'rh', staff: 1 }), // A4 (leaps up +9 st, steps down -2 st to G4)
        note(67, 2, 4, { hand: 'rh', staff: 1 }), // G4 (chord tone)
      ],
      false,
      { measures: [M1], keyMap: [{ ...C_MAJOR, beat: 0 }] },
    );
    expect(segs).toHaveLength(1);
    expect(segs[0].nct?.some((x) => x.note.midi === 69 && x.type === 'appoggiatura')).toBe(true);
  });

  it('detects cadential 6/4 before dominant V even after subdominant IV', () => {
    const m3 = { number: '3', start: 8, end: 12, num: 4, den: 4 };
    const m4 = { number: '4', start: 12, end: 16, num: 4, den: 4 };
    const prog = [
      note(41, 0, 4), note(60, 0, 4), note(65, 0, 4), note(69, 0, 4),   // IV (F)
      note(43, 4, 8), note(60, 4, 8), note(64, 4, 8), note(67, 4, 8),   // I6/4 (C/G)
      note(43, 8, 12), note(59, 8, 12), note(62, 8, 12), note(65, 8, 12), // V7 (G7)
      note(48, 12, 16), note(60, 12, 16), note(64, 12, 16), note(67, 12, 16), // I (C)
    ];
    const segs = anHarmony(prog, false, {
      measures: [M1, M2, m3, m4],
      keyMap: [{ ...C_MAJOR, beat: 0 }],
    });
    anCadences(segs, [{ ...C_MAJOR, beat: 0 }]);
    expect(segs).toHaveLength(4);
    expect(segs[1].cad).toBe('cad64');
    expect(segs[3].cad).toBe('auth');
  });
});

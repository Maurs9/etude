import { describe, expect, it } from 'vitest';
import { buildExpressiveTempos, buildScoreExpression } from '../../src/domain/score-expression.ts';

function xmlNote(overrides = {}) {
  return {
    midi: 72,
    start: 0,
    end: 1,
    vel: 84,
    hand: 'rh',
    part: 0,
    staff: 1,
    voice: 1,
    type: 'quarter',
    art: { staccato: false, staccatissimo: false, accent: false, strongAccent: false, tenuto: false },
    arpeggiate: false,
    ...overrides,
  };
}

const bar = (n, start, end, num = 4, den = 4) => ({ number: String(n), start, end, num, den });

describe('buildExpressiveTempos', () => {
  it('passes through normalized base tempos when disabled or without modifiers', () => {
    const base = [{ beat: 4, bpm: 96 }, { beat: 8, bpm: 120 }];
    expect(buildExpressiveTempos(base, [], null, true)).toEqual([
      { beat: 0, bpm: 96 },
      { beat: 4, bpm: 96 },
      { beat: 8, bpm: 120 },
    ]);
    expect(buildExpressiveTempos(
      [{ beat: 0, bpm: 100 }],
      [bar(1, 0, 4), bar(2, 4, 8)],
      { slurs: [], tempoModifiers: [{ beat: 4, kind: 'rit' }], fermatas: [], textDynamics: [] },
      false,
    )).toEqual([{ beat: 0, bpm: 100 }]);
  });

  it('eases tempo down on rit./rall., restores on a tempo, and accelerates on accel.', () => {
    const measures = [bar(1, 0, 4), bar(2, 4, 8), bar(3, 8, 12), bar(4, 12, 16), bar(5, 16, 20)];
    const curve = buildExpressiveTempos(
      [{ beat: 0, bpm: 120 }],
      measures,
      {
        slurs: [],
        tempoModifiers: [
          { beat: 4, kind: 'rit' },
          { beat: 8, kind: 'atempo' },
          { beat: 12, kind: 'accel', amount: 'molto' },
          { beat: 16, kind: 'atempo' },
        ],
        fermatas: [],
        textDynamics: [],
      },
      true,
    );
    expect(curve[0]).toEqual({ beat: 0, bpm: 120 });
    const ritSteps = curve.filter(pt => pt.beat >= 4 && pt.beat < 8);
    expect(ritSteps.length).toBeGreaterThan(2);
    expect(ritSteps[ritSteps.length - 1].bpm).toBeLessThan(100);
    expect(ritSteps.every((pt, i) => i === 0 || pt.bpm <= ritSteps[i - 1].bpm)).toBe(true);

    const restored = curve.find(pt => Math.abs(pt.beat - 8) < 1e-6);
    expect(restored?.bpm).toBe(120);

    const accelSteps = curve.filter(pt => pt.beat >= 12 && pt.beat < 16);
    expect(accelSteps.length).toBeGreaterThan(2);
    expect(accelSteps[accelSteps.length - 1].bpm).toBeGreaterThan(135);
    expect(curve.find(pt => Math.abs(pt.beat - 16) < 1e-6)?.bpm).toBe(120);
  });

  it('scales poco vs molto modifiers and stretches fermatas while clamping BPM bounds', () => {
    const measures = [bar(1, 0, 4), bar(2, 4, 8), bar(3, 8, 12), bar(4, 12, 16)];
    const poco = buildExpressiveTempos([{ beat: 0, bpm: 100 }], measures, {
      slurs: [],
      tempoModifiers: [{ beat: 4, kind: 'rit', amount: 'poco' }, { beat: 8, kind: 'atempo' }],
      fermatas: [],
      textDynamics: [],
    }, true);
    const molto = buildExpressiveTempos([{ beat: 0, bpm: 100 }], measures, {
      slurs: [],
      tempoModifiers: [{ beat: 4, kind: 'rit', amount: 'molto' }, { beat: 8, kind: 'atempo' }],
      fermatas: [],
      textDynamics: [],
    }, true);
    const minPoco = Math.min(...poco.filter(p => p.beat >= 4 && p.beat < 8).map(p => p.bpm));
    const minMolto = Math.min(...molto.filter(p => p.beat >= 4 && p.beat < 8).map(p => p.bpm));
    expect(minMolto).toBeLessThan(minPoco);

    const withFermata = buildExpressiveTempos([{ beat: 0, bpm: 100 }], measures, {
      slurs: [],
      tempoModifiers: [],
      fermatas: [{ beat: 6, duration: 2 }],
      textDynamics: [],
    }, true);
    const holdPt = withFermata.find(p => Math.abs(p.beat - 6) < 1e-6);
    const afterPt = withFermata.find(p => Math.abs(p.beat - 8) < 1e-6);
    expect(holdPt?.bpm).toBeCloseTo(100 / 1.75, 1);
    expect(afterPt?.bpm).toBe(100);

    const extreme = buildExpressiveTempos([{ beat: 0, bpm: 290 }], measures, {
      slurs: [],
      tempoModifiers: [{ beat: 4, kind: 'accel', amount: 'molto' }],
      fermatas: [{ beat: 12, duration: 2 }],
      textDynamics: [],
    }, true);
    for (let i = 0; i < extreme.length; i++) {
      expect(extreme[i].bpm).toBeGreaterThanOrEqual(24);
      expect(extreme[i].bpm).toBeLessThanOrEqual(300);
      if (i > 0) expect(extreme[i].beat).toBeGreaterThan(extreme[i - 1].beat);
    }
  });
});

describe('buildScoreExpression', () => {
  it('returns identity plans when disabled', () => {
    const notes = [
      xmlNote({ midi: 72, start: 0, end: 1, vel: 80 }),
      xmlNote({ midi: 48, start: 0, end: 2, vel: 80, hand: 'lh', staff: 2, pedalEnd: 4, soundEnd: 4 }),
    ];
    const plan = buildScoreExpression({
      notes,
      measures: [bar(1, 0, 4)],
      tempos: [{ beat: 0, bpm: 100 }],
      sourceKind: 'xml',
      enabled: false,
    });
    expect(plan).toEqual([
      { vel: 80, onsetShiftSec: 0, durationScale: 1, legatoOverlapSec: 0, restrikeGapSec: 0, warm: false, accent: false, hold: false, graceStepSec: 0.07 },
      { vel: 80, onsetShiftSec: 0, durationScale: 1, legatoOverlapSec: 0, restrikeGapSec: 0, warm: false, accent: false, hold: true, graceStepSec: 0.07 },
    ]);
  });

  it('separates melody, bass, and inner accompaniment for both XML and flat MIDI', () => {
    const midiNotes = [
      { midi: 72, start: 0, end: 1, vel: 80, track: 0, channel: 0, hand: 'rh' },
      { midi: 64, start: 0, end: 1, vel: 80, track: 0, channel: 0, hand: 'rh' },
      { midi: 48, start: 0, end: 2, vel: 80, track: 1, channel: 0, hand: 'lh' },
      { midi: 55, start: 0, end: 1, vel: 80, track: 1, channel: 0, hand: 'lh' },
    ];
    const midiPlan = buildScoreExpression({
      notes: midiNotes,
      measures: [bar(1, 0, 4)],
      tempos: [{ beat: 0, bpm: 100 }],
      sourceKind: 'midi',
      enabled: true,
    });
    expect(midiPlan[0].vel).toBeGreaterThan(midiPlan[2].vel);
    expect(midiPlan[2].vel).toBeGreaterThan(midiPlan[3].vel);
    expect(midiPlan[0].vel).toBeGreaterThan(midiPlan[1].vel);

    const xmlNotes = [
      xmlNote({ midi: 72, start: 0, end: 1, vel: 90, hand: 'rh', staff: 1 }),
      xmlNote({ midi: 64, start: 0, end: 1, vel: 90, hand: 'rh', staff: 1 }),
      xmlNote({ midi: 52, start: 0, end: 1, vel: 90, hand: 'lh', staff: 2 }),
    ];
    const xmlPlan = buildScoreExpression({
      notes: xmlNotes,
      measures: [bar(1, 0, 4)],
      tempos: [{ beat: 0, bpm: 100 }],
      sourceKind: 'xml',
      enabled: true,
    });
    expect(xmlPlan[0].vel).toBeGreaterThan(xmlPlan[1].vel);
    expect(xmlPlan[0].vel).toBeGreaterThan(xmlPlan[2].vel);
  });

  it('preserves expressive human MIDI nuances with minimal interference', () => {
    const humanMidi = [
      { midi: 72, start: 0, end: 1, vel: 55, track: 0, channel: 0, hand: 'rh' },
      { midi: 74, start: 1, end: 2, vel: 95, track: 0, channel: 0, hand: 'rh' },
      { midi: 76, start: 2, end: 3, vel: 42, track: 0, channel: 0, hand: 'rh' },
      { midi: 77, start: 3, end: 4, vel: 110, track: 0, channel: 0, hand: 'rh' },
    ];
    const plan = buildScoreExpression({
      notes: humanMidi,
      measures: [bar(1, 0, 4)],
      tempos: [{ beat: 0, bpm: 100 }],
      sourceKind: 'midi',
      enabled: true,
    });
    expect(plan[1].vel).toBeGreaterThan(plan[0].vel + 25);
    expect(plan[3].vel).toBeGreaterThan(plan[2].vel + 45);
    expect(Math.abs(plan[1].onsetShiftSec)).toBeLessThanOrEqual(0.002);
  });

  it('shapes phrase arches, slur legato/taper, re-strike gaps, text dynamics, and preserves pedaled durations', () => {
    const notes = [
      xmlNote({ midi: 64, start: 0, end: 1, vel: 84 }), // 0: slur start
      xmlNote({ midi: 67, start: 1, end: 2, vel: 84 }), // 1: inside slur
      xmlNote({ midi: 72, start: 2, end: 3, vel: 84 }), // 2: apex inside slur
      xmlNote({ midi: 71, start: 3, end: 4, vel: 84 }), // 3: slur end
      xmlNote({ midi: 69, start: 4, end: 5, vel: 84 }), // 4: repeated pitch 1 (cresc start)
      xmlNote({ midi: 69, start: 5, end: 6, vel: 84 }), // 5: repeated pitch 2
      xmlNote({ midi: 71, start: 6, end: 7, vel: 84 }), // 6: rising in cresc
      xmlNote({ midi: 72, start: 7, end: 8, vel: 84 }), // 7: further in cresc
      xmlNote({ midi: 48, start: 0, end: 2, vel: 72, hand: 'lh', staff: 2, pedalEnd: 4, soundEnd: 4 }), // 8: pedaled
    ];
    const plan = buildScoreExpression({
      notes,
      measures: [bar(1, 0, 4), bar(2, 4, 8)],
      tempos: [{ beat: 0, bpm: 100 }],
      sourceKind: 'xml',
      expression: {
        slurs: [{ part: 0, staff: 1, voice: 1, startBeat: 0, endBeat: 4, startNoteIndex: 0, endNoteIndex: 3 }],
        tempoModifiers: [],
        fermatas: [],
        textDynamics: [{ part: 0, staff: 0, beat: 4, kind: 'cresc' }],
      },
      enabled: true,
    });

    // Phrase arch + slur taper
    expect(plan[2].vel).toBeGreaterThan(plan[0].vel);
    expect(plan[2].vel).toBeGreaterThan(plan[3].vel);

    // Slur legato & lift
    expect(plan[0].legatoOverlapSec).toBeGreaterThan(0);
    expect(plan[1].legatoOverlapSec).toBeGreaterThan(0);
    expect(plan[3].legatoOverlapSec).toBe(0);
    expect(plan[3].durationScale).toBeLessThan(1);

    // Same-pitch re-strike gap & cresc text dynamic
    expect(plan[4].restrikeGapSec).toBeGreaterThan(0);
    expect(plan[4].legatoOverlapSec).toBe(0);
    expect(plan[6].vel).toBeGreaterThan(plan[5].vel);

    // Pedaled note duration untouched
    expect(plan[8]).toMatchObject({ hold: true, durationScale: 1, legatoOverlapSec: 0, restrikeGapSec: 0 });
  });

  it('realizes diatonic ornaments in major and minor keys and respects strictTiming', () => {
    const notes = [
      xmlNote({ midi: 64, start: 0, end: 2, vel: 88, ornament: 'trill' }), // E4 in C major -> F4 (+1)
      xmlNote({ midi: 62, start: 2, end: 3, vel: 88, ornament: 'inverted-mordent' }), // D4 in C major -> E4 (+2)
      xmlNote({ midi: 67, start: 3, end: 4, vel: 88, ornament: 'mordent' }), // G4 in A minor -> F4 (-2)
      xmlNote({ midi: 72, start: 4, end: 6, vel: 88, ornament: 'turn' }), // C5 in C major -> D5, C5, B4, C5
      xmlNote({ midi: 60, start: 4, end: 6, vel: 72, hand: 'lh', staff: 2 }),
    ];
    const plan = buildScoreExpression({
      notes,
      measures: [bar(1, 0, 4), bar(2, 4, 8)],
      tempos: [{ beat: 0, bpm: 90 }],
      keys: [
        { beat: 0, root: 0, minor: false }, // C major
        { beat: 3, root: 9, minor: true }, // A minor
      ],
      sourceKind: 'xml',
      enabled: true,
    });

    expect(plan[0].ornamentEvents?.some(e => e.midi === 65)).toBe(true);
    expect(plan[1].ornamentEvents?.map(e => e.midi)).toEqual([62, 64, 62]);
    expect(plan[2].ornamentEvents?.map(e => e.midi)).toEqual([67, 65, 67]);
    expect(plan[3].ornamentEvents?.map(e => e.midi)).toEqual([74, 72, 71, 72]);

    // Chord spread on beat 4 puts upper note slightly after lower note
    expect(plan[3].onsetShiftSec).toBeGreaterThan(plan[4].onsetShiftSec);

    // strictTiming zeroes all onset shifts while keeping dynamics/ornaments
    const strictPlan = buildScoreExpression({
      notes,
      measures: [bar(1, 0, 4), bar(2, 4, 8)],
      tempos: [{ beat: 0, bpm: 90 }],
      keys: [{ beat: 0, root: 0, minor: false }],
      sourceKind: 'xml',
      enabled: true,
      strictTiming: true,
    });
    expect(strictPlan.every(p => p.onsetShiftSec === 0)).toBe(true);
    expect(strictPlan[0].ornamentEvents?.length).toBeGreaterThanOrEqual(3);
  });

  it('preserves full principal duration for grace-tied notes and exact beat timing for built-in examples', () => {
    const graceTied = xmlNote({
      midi: 66,
      start: 0,
      end: 4,
      vel: 90,
      graces: [{ midi: 66, vel: 84, tieStart: true, tiedToPrincipal: true }],
    });
    const xmlPlan = buildScoreExpression({
      notes: [graceTied],
      measures: [bar(1, 0, 4)],
      tempos: [{ beat: 0, bpm: 120 }],
      sourceKind: 'xml',
      enabled: true,
    });
    expect(xmlPlan[0].durationScale).toBe(1);
    expect(xmlPlan[0].restrikeGapSec).toBe(0);

    const exampleNotes = [
      { midi: 72, start: 0, end: 1, vel: 90, track: 0, channel: 0, hand: 'rh' },
      { midi: 48, start: 0, end: 1, vel: 90, track: 1, channel: 0, hand: 'lh' },
      { midi: 74, start: 1, end: 2, vel: 90, track: 0, channel: 0, hand: 'rh' },
      { midi: 55, start: 1, end: 2, vel: 90, track: 1, channel: 0, hand: 'lh' },
    ];
    const examplePlan = buildScoreExpression({
      notes: exampleNotes,
      measures: [bar(1, 0, 4)],
      tempos: [{ beat: 0, bpm: 100 }],
      sourceKind: 'example',
      enabled: true,
    });
    expect(examplePlan.every(p => p.onsetShiftSec === 0)).toBe(true);
    expect(examplePlan[0].vel).toBeGreaterThan(examplePlan[1].vel);
  });
});

import { describe, expect, it } from 'vitest';
import { srtCanonicalString, srtFingerprint } from '../../src/sight-reading/fingerprint.ts';
import { srtEvaluate } from '../../src/sight-reading/evaluate.ts';
import { srtGenerate } from '../../src/sight-reading/generator.ts';
import { srtBuildExpected, srtToLegacyPiece, srtValidatePiece } from '../../src/sight-reading/model.ts';

const referencePiece = (events) => ({
  schemaVersion: 1,
  generatorVersion: 1,
  profileId: 'P1.a',
  seed: 42,
  meter: { num: 4, den: 4 },
  ticksPerQuarter: 480,
  key: { tonic: 'C', mode: 'major', keyN: 0 },
  bars: 1,
  events,
});

describe('sight-reading model and fingerprint', () => {
  it('matches the canonical FNV vectors', () => {
    const piece = referencePiece([
      { id: 'a', hand: 'rh', onsetTick: 0, durationTick: 480, pitches: [{ midi: 60, spelling: 'C4', finger: 1 }] },
      { id: 'b', hand: 'rh', onsetTick: 480, durationTick: 480, pitches: [{ midi: 62, spelling: 'D4', finger: 2 }] },
      { id: 'c', hand: 'rh', onsetTick: 960, durationTick: 960, pitches: [{ midi: 60, spelling: 'C4', finger: null }] },
    ]);
    expect(srtCanonicalString(piece)).toBe('v1|meter=4/4|tpq=480|key=0:C:major|bars=1|events=rh:0:480:60:C4;rh:480:480:62:D4;rh:960:960:60:C4');
    expect(srtFingerprint(piece)).toBe('v1:e8020957ec2a1005');
    const rest = referencePiece([
      piece.events[0],
      { id: 'changed', hand: 'rh', onsetTick: 480, durationTick: 480, pitches: [] },
      piece.events[2],
    ]);
    expect(srtFingerprint(rest)).toBe('v1:8472a9986749aba1');
  });

  it('ignores non-musical identity fields and preserves event-to-note ids', () => {
    const piece = referencePiece([
      { id: 'a', hand: 'rh', onsetTick: 0, durationTick: 480, pitches: [{ midi: 60, spelling: 'C4', finger: 1 }] },
      { id: 'b', hand: 'rh', onsetTick: 480, durationTick: 480, pitches: [{ midi: 62, spelling: 'D4', finger: 2 }] },
      { id: 'c', hand: 'rh', onsetTick: 960, durationTick: 960, pitches: [{ midi: 60, spelling: 'C4', finger: null }] },
    ]);
    const changed = {
      ...piece,
      seed: 999,
      title: 'different',
      bpm: 144,
      profileId: 'P1.b',
      events: piece.events.map((event, index) => ({
        ...event,
        id: `changed-${index}`,
        pitches: event.pitches.map((pitch) => ({ ...pitch, finger: pitch.finger === null ? 5 : 1 })),
      })),
    };
    expect(srtFingerprint(changed)).toBe(srtFingerprint(piece));
    const legacy = srtToLegacyPiece(piece);
    expect(legacy.notes.map((note) => [note.eventId, note.nid])).toEqual([
      ['a', 'a:0'], ['b', 'b:0'], ['c', 'c:0'],
    ]);
  });
});

describe('sight-reading evaluator', () => {
  const expected = [
    { id: 'a', midi: 60, hand: 'rh', onMs: 0, offMs: 400, restBeforeMs: 0, restAfterMs: 1200 },
    { id: 'b', midi: 62, hand: 'rh', onMs: 400, offMs: 800, restBeforeMs: 0, restAfterMs: 800 },
    { id: 'c', midi: 64, hand: 'rh', onMs: 800, offMs: 1200, restBeforeMs: 0, restAfterMs: 400 },
    { id: 'd', midi: 65, hand: 'rh', onMs: 1200, offMs: 1600, restBeforeMs: 0, restAfterMs: 0 },
  ];
  it('scores perfect, substitution, extra, near, late and silence vectors', () => {
    const run = (inputs) => srtEvaluate(expected, inputs);
    expect(run(expected.map((note) => ({ id: `i-${note.id}`, midi: note.midi, onMs: note.onMs }))).stars).toBe(3);
    expect(run([{ id: 'i-a', midi: 60, onMs: 0 }, { id: 'i-b', midi: 62, onMs: 400 }, { id: 'i-c', midi: 64, onMs: 800 }, { id: 'i-x', midi: 67, onMs: 1200 }])).toMatchObject({ TP: 3, FP: 1, FN: 1, pitchF1: 75, stars: 1 });
    expect(run([...expected.map((note) => ({ id: `i-${note.id}`, midi: note.midi, onMs: note.onMs })), { id: 'extra', midi: 70, onMs: 600 }])).toMatchObject({ TP: 4, FP: 1, pitchF1: 88.88888888888889, stars: 2 });
    expect(run(expected.map((note, index) => ({ id: `i-${note.id}`, midi: note.midi, onMs: note.onMs + (index === 3 ? 140 : 0) })))).toMatchObject({ G: 3, Q: 1, rhythmAcc: 87.5, stars: 2 });
    expect(run(expected.map((note, index) => ({ id: `i-${note.id}`, midi: note.midi, onMs: note.onMs + (index === 3 ? 220 : 0) })))).toMatchObject({ G: 3, lateOrEarlyCount: 1, rhythmAcc: 75, stars: 1 });
    expect(run([])).toMatchObject({ TP: 0, FP: 0, FN: 4, pitchF1: 0, rhythmAcc: 0, stars: 0 });
  });

  it('honours inclusive timing boundaries, close repeats, chords, rests and invalid input', () => {
    expect(srtEvaluate([], []).status).toBe('invalid');
    const repeated = [
      { id: 'a', midi: 60, hand: 'rh', onMs: 0, offMs: 100, restBeforeMs: 0, restAfterMs: 0 },
      { id: 'b', midi: 60, hand: 'rh', onMs: 300, offMs: 400, restBeforeMs: 0, restAfterMs: 0 },
    ];
    expect(srtEvaluate(repeated, [
      { id: 'i-a', midi: 60, onMs: 136 },
      { id: 'i-b', midi: 60, onMs: 300 },
    ])).toMatchObject({ TP: 1, FN: 1, FP: 1 });
    const chord = [
      { id: 'a', midi: 60, hand: 'rh', onMs: 0, offMs: 100, restBeforeMs: 0, restAfterMs: 0 },
      { id: 'b', midi: 64, hand: 'rh', onMs: 0, offMs: 100, restBeforeMs: 0, restAfterMs: 0 },
    ];
    expect(srtEvaluate(chord, [
      { id: 'i-b', midi: 64, onMs: 0 },
      { id: 'i-a', midi: 60, onMs: 0 },
    ])).toMatchObject({ TP: 2, FN: 0, FP: 0 });
    expect(srtEvaluate(chord, [
      { id: 'i-a', midi: 60, onMs: 0 },
      { id: 'i-b', midi: 64, onMs: 61 },
    ])).toMatchObject({ TP: 0, FN: 2, FP: 2 });
    expect(srtEvaluate([expected[0]], [{ id: 'boundary-good', midi: 60, onMs: 100 }]).noteResults[0].classification).toBe('good');
    expect(srtEvaluate([expected[1]], [{ id: 'boundary-near', midi: 62, onMs: 580 }]).noteResults[0].classification).toBe('near');
    expect(srtEvaluate([expected[2]], [{ id: 'boundary-late', midi: 64, onMs: 1050 }]).noteResults[0].classification).toBe('lateOrEarly');
    expect(srtEvaluate(expected, expected.map((note) => ({ id: `rest-${note.id}`, midi: note.midi, onMs: note.onMs })), {
      restWindows: [{ startMs: 0, endMs: 400 }],
    }).restViolations).toBe(0);
    expect(srtEvaluate([expected[0], expected[2]], [
      { id: 'rest-extra', midi: 67, onMs: 400 },
    ], { restWindows: [{ startMs: 100, endMs: 700 }] })).toMatchObject({ FP: 1, restViolations: 1, stars: 0 });
  });

  it('counts rest violations only outside both time-neighbor windows', () => {
    const repeatedRestExpected = [
      { id: 'previous', midi: 60, hand: 'rh', onMs: 0, offMs: 100, restBeforeMs: 0, restAfterMs: 900 },
      { id: 'next', midi: 60, hand: 'rh', onMs: 1000, offMs: 1100, restBeforeMs: 900, restAfterMs: 0 },
    ];
    const restWindows = [{ startMs: 100, endMs: 1000 }];
    expect(srtEvaluate(repeatedRestExpected, [
      { id: 'previous-input', midi: 60, onMs: 0 },
      { id: 'inside-previous-window', midi: 60, onMs: 200 },
      { id: 'next-input', midi: 60, onMs: 1000 },
    ], { restWindows }).restViolations).toBe(0);
    expect(srtEvaluate(repeatedRestExpected, [
      { id: 'previous-input', midi: 60, onMs: 0 },
      { id: 'inside-next-window', midi: 60, onMs: 800 },
      { id: 'next-input', midi: 60, onMs: 1000 },
    ], { restWindows }).restViolations).toBe(0);
    expect(srtEvaluate(repeatedRestExpected, [
      { id: 'previous-input', midi: 60, onMs: 0 },
      { id: 'central-extra', midi: 60, onMs: 500 },
      { id: 'next-input', midi: 60, onMs: 1000 },
    ], { restWindows }).restViolations).toBe(1);

    const mixedPitchExpected = [
      { id: 'previous-c', midi: 60, hand: 'rh', onMs: 0, offMs: 600, restBeforeMs: 0, restAfterMs: 1200 },
      { id: 'next-e', midi: 64, hand: 'rh', onMs: 1200, offMs: 1800, restBeforeMs: 600, restAfterMs: 0 },
    ];
    const mixedRest = [{ startMs: 600, endMs: 1200 }];
    const matchedBoundaryInputs = [
      { id: 'previous-c-input', midi: 60, onMs: 0 },
      { id: 'next-e-input', midi: 64, onMs: 1200 },
    ];
    expect(srtEvaluate(mixedPitchExpected, [
      ...matchedBoundaryInputs,
      { id: 'wrong-pitch-next-window', midi: 62, onMs: 1100 },
    ], { restWindows: mixedRest })).toMatchObject({ FP: 1, restViolations: 0 });
    expect(srtEvaluate(mixedPitchExpected, [
      ...matchedBoundaryInputs,
      { id: 'wrong-pitch-previous-window', midi: 62, onMs: 200 },
    ], { restWindows: mixedRest })).toMatchObject({ FP: 1, restViolations: 0 });
    expect(srtEvaluate(mixedPitchExpected, [
      ...matchedBoundaryInputs,
      { id: 'wrong-pitch-central', midi: 62, onMs: 900 },
    ], { restWindows: mixedRest })).toMatchObject({ FP: 1, restViolations: 1 });
    expect(srtEvaluate(mixedPitchExpected, [
      ...matchedBoundaryInputs,
      { id: 'same-pitch-next-window', midi: 64, onMs: 1100 },
    ], { restWindows: mixedRest })).toMatchObject({ FP: 1, restViolations: 0 });

    const previousSideExpected = [
      { id: 'previous-short', midi: 60, hand: 'rh', onMs: 0, offMs: 100, restBeforeMs: 0, restAfterMs: 1200 },
      { id: 'next-long', midi: 64, hand: 'rh', onMs: 1200, offMs: 1800, restBeforeMs: 100, restAfterMs: 0 },
    ];
    const previousSideInputs = [
      { id: 'previous-short-input', midi: 60, onMs: 0 },
      { id: 'next-long-input', midi: 64, onMs: 1200 },
    ];
    const previousSideRest = [{ startMs: 100, endMs: 1200 }];
    expect(srtEvaluate(previousSideExpected, [
      ...previousSideInputs,
      { id: 'previous-side-window', midi: 62, onMs: 200 },
    ], { restWindows: previousSideRest })).toMatchObject({ FP: 1, restViolations: 0 });
    expect(srtEvaluate(previousSideExpected, [
      ...previousSideInputs,
      { id: 'previous-side-central', midi: 62, onMs: 400 },
    ], { restWindows: previousSideRest })).toMatchObject({ FP: 1, restViolations: 1 });

    const chordNeighborExpected = [
      { id: 'chord-previous', midi: 60, hand: 'rh', onMs: 0, offMs: 600, restBeforeMs: 0, restAfterMs: 1200 },
      { id: 'chord-next-e', midi: 64, hand: 'rh', onMs: 1200, offMs: 1800, restBeforeMs: 100, restAfterMs: 0 },
      { id: 'chord-next-g', midi: 67, hand: 'rh', onMs: 1200, offMs: 1800, restBeforeMs: 100, restAfterMs: 0 },
    ];
    expect(srtEvaluate(chordNeighborExpected, [
      { id: 'chord-previous-input', midi: 60, onMs: 0 },
      { id: 'chord-next-e-input', midi: 64, onMs: 1200 },
      { id: 'chord-next-g-input', midi: 67, onMs: 1200 },
      { id: 'chord-neither-pitch', midi: 62, onMs: 1100 },
    ], { restWindows: mixedRest })).toMatchObject({ FP: 1, restViolations: 0 });
  });

  it('caps configured matching and rest windows at 250ms', () => {
    const loneExpected = [
      { id: 'lone', midi: 60, hand: 'rh', onMs: 0, offMs: 100, restBeforeMs: 0, restAfterMs: 0 },
    ];
    expect(srtEvaluate(loneExpected, [
      { id: 'late', midi: 60, onMs: 400 },
    ], { windowMs: 500 })).toMatchObject({ TP: 0, FN: 1, FP: 1 });

    const repeatedExpected = [
      { id: 'previous', midi: 60, hand: 'rh', onMs: 0, offMs: 100, restBeforeMs: 0, restAfterMs: 900 },
      { id: 'next', midi: 60, hand: 'rh', onMs: 1000, offMs: 1100, restBeforeMs: 900, restAfterMs: 0 },
    ];
    expect(srtEvaluate(repeatedExpected, [
      { id: 'extra', midi: 60, onMs: 400 },
    ], {
      windowMs: 500,
      restWindows: [{ startMs: 100, endMs: 1000 }],
    })).toMatchObject({ TP: 0, FN: 2, FP: 1, restViolations: 1 });
  });

  it('uses the narrowed 135ms window for close-repeat rest extras', () => {
    const repeatedExpected = [
      { id: 'previous', midi: 60, hand: 'rh', onMs: 0, offMs: 100, restBeforeMs: 0, restAfterMs: 300 },
      { id: 'next', midi: 60, hand: 'rh', onMs: 300, offMs: 400, restBeforeMs: 300, restAfterMs: 0 },
    ];
    const restWindows = [{ startMs: 1, endMs: 299 }];
    const evaluateExtra = (onMs) => srtEvaluate(repeatedExpected, [
      { id: 'previous-input', midi: 60, onMs: 0 },
      { id: `extra-${onMs}`, midi: 60, onMs },
      { id: 'next-input', midi: 60, onMs: 300 },
    ], { restWindows });

    for (const [onMs, expectedRestViolations] of [
      [135, 0],
      [136, 1],
      [150, 1],
      [164, 1],
      [165, 0],
    ]) {
      const result = evaluateExtra(onMs);
      expect(result).toMatchObject({ TP: 2, FN: 0, FP: 1 });
      expect(result.extraInputs.map((input) => input.id)).toContain(`extra-${onMs}`);
      expect(result.restViolations).toBe(expectedRestViolations);
    }
  });

  it('preserves smaller matching windows and rejects invalid window values', () => {
    const loneExpected = [
      { id: 'lone', midi: 60, hand: 'rh', onMs: 0, offMs: 100, restBeforeMs: 0, restAfterMs: 0 },
    ];
    expect(srtEvaluate(loneExpected, [
      { id: 'outside-smaller-window', midi: 60, onMs: 101 },
    ], { windowMs: 100 })).toMatchObject({ TP: 0, FN: 1, FP: 1 });

    for (const windowMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => srtEvaluate(loneExpected, [], { windowMs })).toThrow(
        'windowMs must be a finite, non-negative number',
      );
    }
  });

  it('returns the complete acceptance vectors, not only selected score fields', () => {
    const run = (inputs) => srtEvaluate(expected, inputs);
    const perfect = run(expected.map((note) => ({ id: `i-${note.id}`, midi: note.midi, onMs: note.onMs })));
    expect(perfect).toEqual({
      status: 'ok', scoringVersion: 1, N: 4, TP: 4, FP: 0, FN: 0, G: 4, Q: 0, lateOrEarlyCount: 0,
      restViolations: 0, pitchPrecision: 1, pitchRecall: 1, pitchF1: 100, rhythmAcc: 100, score: 100,
      stars: 3, perfect: true, meanOffsetMs: 0, meanAbsoluteOffsetMs: 0,
      noteResults: [
        { expectedId: 'a', classification: 'good', matchedInputId: 'i-a', errorMs: 0 },
        { expectedId: 'b', classification: 'good', matchedInputId: 'i-b', errorMs: 0 },
        { expectedId: 'c', classification: 'good', matchedInputId: 'i-c', errorMs: 0 },
        { expectedId: 'd', classification: 'good', matchedInputId: 'i-d', errorMs: 0 },
      ],
      extraInputs: [],
    });
    expect(run([
      { id: 'i-a', midi: 60, onMs: 0 }, { id: 'i-b', midi: 62, onMs: 400 },
      { id: 'i-c', midi: 64, onMs: 800 }, { id: 'i-x', midi: 67, onMs: 1200 },
    ])).toEqual({
      status: 'ok', scoringVersion: 1, N: 4, TP: 3, FP: 1, FN: 1, G: 3, Q: 0, lateOrEarlyCount: 0,
      restViolations: 0, pitchPrecision: 0.75, pitchRecall: 0.75, pitchF1: 75, rhythmAcc: 75, score: 75,
      stars: 1, perfect: false, meanOffsetMs: 0, meanAbsoluteOffsetMs: 0,
      noteResults: [
        { expectedId: 'a', classification: 'good', matchedInputId: 'i-a', errorMs: 0 },
        { expectedId: 'b', classification: 'good', matchedInputId: 'i-b', errorMs: 0 },
        { expectedId: 'c', classification: 'good', matchedInputId: 'i-c', errorMs: 0 },
        { expectedId: 'd', classification: 'missed', matchedInputId: null, errorMs: null },
      ],
      extraInputs: [{ id: 'i-x', midi: 67, onMs: 1200 }],
    });
    expect(run([
      ...expected.map((note) => ({ id: `i-${note.id}`, midi: note.midi, onMs: note.onMs })),
      { id: 'extra', midi: 70, onMs: 600 },
    ])).toEqual({
      status: 'ok', scoringVersion: 1, N: 4, TP: 4, FP: 1, FN: 0, G: 4, Q: 0, lateOrEarlyCount: 0,
      restViolations: 0, pitchPrecision: 0.8, pitchRecall: 1, pitchF1: 88.88888888888889, rhythmAcc: 100,
      score: 88.88888888888889, stars: 2, perfect: false, meanOffsetMs: 0, meanAbsoluteOffsetMs: 0,
      noteResults: perfect.noteResults, extraInputs: [{ id: 'extra', midi: 70, onMs: 600 }],
    });
    expect(run(expected.map((note, index) => ({ id: `i-${note.id}`, midi: note.midi, onMs: note.onMs + (index === 3 ? 140 : 0) })))).toEqual({
      status: 'ok', scoringVersion: 1, N: 4, TP: 4, FP: 0, FN: 0, G: 3, Q: 1, lateOrEarlyCount: 0,
      restViolations: 0, pitchPrecision: 1, pitchRecall: 1, pitchF1: 100, rhythmAcc: 87.5, score: 87.5,
      stars: 2, perfect: false, meanOffsetMs: 35, meanAbsoluteOffsetMs: 35,
      noteResults: [
        { expectedId: 'a', classification: 'good', matchedInputId: 'i-a', errorMs: 0 },
        { expectedId: 'b', classification: 'good', matchedInputId: 'i-b', errorMs: 0 },
        { expectedId: 'c', classification: 'good', matchedInputId: 'i-c', errorMs: 0 },
        { expectedId: 'd', classification: 'near', matchedInputId: 'i-d', errorMs: 140 },
      ],
      extraInputs: [],
    });
    expect(run(expected.map((note, index) => ({ id: `i-${note.id}`, midi: note.midi, onMs: note.onMs + (index === 3 ? 220 : 0) })))).toEqual({
      status: 'ok', scoringVersion: 1, N: 4, TP: 4, FP: 0, FN: 0, G: 3, Q: 0, lateOrEarlyCount: 1,
      restViolations: 0, pitchPrecision: 1, pitchRecall: 1, pitchF1: 100, rhythmAcc: 75, score: 75,
      stars: 1, perfect: false, meanOffsetMs: 55, meanAbsoluteOffsetMs: 55,
      noteResults: [
        { expectedId: 'a', classification: 'good', matchedInputId: 'i-a', errorMs: 0 },
        { expectedId: 'b', classification: 'good', matchedInputId: 'i-b', errorMs: 0 },
        { expectedId: 'c', classification: 'good', matchedInputId: 'i-c', errorMs: 0 },
        { expectedId: 'd', classification: 'lateOrEarly', matchedInputId: 'i-d', errorMs: 220 },
      ],
      extraInputs: [],
    });
    expect(run([])).toEqual({
      status: 'ok', scoringVersion: 1, N: 4, TP: 0, FP: 0, FN: 4, G: 0, Q: 0, lateOrEarlyCount: 0,
      restViolations: 0, pitchPrecision: 0, pitchRecall: 0, pitchF1: 0, rhythmAcc: 0, score: 0,
      stars: 0, perfect: false, meanOffsetMs: null, meanAbsoluteOffsetMs: null,
      noteResults: [
        { expectedId: 'a', classification: 'missed', matchedInputId: null, errorMs: null },
        { expectedId: 'b', classification: 'missed', matchedInputId: null, errorMs: null },
        { expectedId: 'c', classification: 'missed', matchedInputId: null, errorMs: null },
        { expectedId: 'd', classification: 'missed', matchedInputId: null, errorMs: null },
      ],
      extraInputs: [],
    });
  });
});

describe('sight-reading generator', () => {
  it('is deterministic and validates every MVP profile and hand', () => {
    for (const profile of ['P1.a', 'P1.b', 'P1.c', 'P2.a', 'P2.b', 'P2.c']) {
      for (const hand of ['rh', 'lh']) {
        for (let seed = 0; seed < 1000; seed += 1) {
          const first = srtGenerate(profile, seed, hand);
          expect(first).toEqual(srtGenerate(profile, seed, hand));
          expect(srtValidatePiece(first, profile)).toBe(true);
        }
      }
    }
    expect(() => srtGenerate('invalid', 1, 'rh')).toThrow();
  });

  it('generates polyphonic intervals, triads and grand staff in signed key signatures', () => {
    for (const [profile, voices, hands] of [
      ['P3.a', 2, ['rh']],
      ['P3.b', 3, ['rh']],
      ['P3.c', 2, ['rh', 'lh']],
      ['P3.d', 3, ['rh']],
    ]) {
      const keys = new Set();
      for (let seed = 0; seed < 100; seed += 1) {
        const piece = srtGenerate(profile, seed);
        keys.add(piece.key.keyN);
        expect(srtValidatePiece(piece, profile)).toBe(true);
        expect(piece.key.keyN).toBeGreaterThanOrEqual(-7);
        expect(piece.key.keyN).toBeLessThanOrEqual(7);
        expect(new Set(piece.events.map((event) => event.hand))).toEqual(new Set(hands));
        const pitched = piece.events.filter((event) => event.pitches.length > 0);
        expect(pitched.some((event) => event.hand === 'rh' && event.pitches.length === voices)).toBe(true);
        for (const event of pitched) {
          expect(event.pitches.map((pitch) => pitch.midi)).toEqual([...event.pitches.map((pitch) => pitch.midi)].sort((a, b) => a - b));
        }
      }
      // Every signature from 7 flats to 7 sharps comes up; the chromatic level has none.
      expect([...keys].sort((a, b) => a - b)).toEqual(profile === 'P3.d' ? [0] : Array.from({ length: 15 }, (_, i) => i - 7));
    }
  });
});

describe('sight-reading expected events', () => {
  it('uses complete-bar duration and stable note ids', () => {
    const piece = srtGenerate('P1.a', 1);
    const expected = srtBuildExpected(piece, { bpm: 60, hand: 'rh' });
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.at(-1)?.offMs).toBeLessThanOrEqual(16000);
  });
});

import { describe, expect, it } from 'vitest';
import { srtCanonicalString, srtFingerprint } from '../src/sight-reading/fingerprint.ts';
import { srtEvaluate } from '../src/sight-reading/evaluate.ts';
import { srtGenerate } from '../src/sight-reading/generator.ts';
import { srtBuildExpected, srtToLegacyPiece, srtValidatePiece } from '../src/sight-reading/model.ts';

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
    expect(srtEvaluate([expected[0]], [{ id: 'boundary-good', midi: 60, onMs: 100 }]).noteResults[0].classification).toBe('good');
    expect(srtEvaluate([expected[1]], [{ id: 'boundary-near', midi: 62, onMs: 580 }]).noteResults[0].classification).toBe('near');
    expect(srtEvaluate([expected[2]], [{ id: 'boundary-late', midi: 64, onMs: 1050 }]).noteResults[0].classification).toBe('lateOrEarly');
    expect(srtEvaluate(expected, expected.map((note) => ({ id: `rest-${note.id}`, midi: note.midi, onMs: note.onMs })), {
      restWindows: [{ startMs: 0, endMs: 400 }],
    }).restViolations).toBe(0);
    expect(srtEvaluate(expected, [
      { id: 'rest-extra', midi: 67, onMs: 200 },
    ], { restWindows: [{ startMs: 100, endMs: 300 }] })).toMatchObject({ FP: 1, restViolations: 1, stars: 0 });
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
});

describe('sight-reading expected events', () => {
  it('uses complete-bar duration and stable note ids', () => {
    const piece = srtGenerate('P1.a', 1);
    const expected = srtBuildExpected(piece, { bpm: 60, hand: 'rh' });
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.at(-1)?.offMs).toBeLessThanOrEqual(16000);
  });
});

import { describe, expect, it } from 'vitest';
import { srtEvaluate } from '../../src/sight-reading/evaluate.ts';
import { srtFingerprint } from '../../src/sight-reading/fingerprint.ts';
import { srtGenerate, srtProfiles } from '../../src/sight-reading/generator.ts';
import { srtBuildExpected, srtValidatePiece } from '../../src/sight-reading/model.ts';
import { srtNotationSegments } from '../../src/sight-reading/notation.ts';

const OLD_PROFILES = ['P1.a', 'P1.b', 'P1.c', 'P2.a', 'P2.b', 'P2.c', 'P3.a', 'P3.b', 'P3.c', 'P3.d'];
const RHYTHM_PROFILES = ['P4.a', 'P4.b', 'P4.c'];

function fnv(text) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16);
}

const piece = (events, profileId = 'P4.c') => ({
  schemaVersion: 1, generatorVersion: 1, profileId, seed: 1,
  meter: { num: 4, den: 4 }, ticksPerQuarter: 480,
  key: { tonic: 'C', mode: 'major', keyN: 0 }, bars: 4, events,
});
const note = (id, onsetTick, durationTick, midi = 60, spelling = 'C4') => ({
  id, hand: 'rh', onsetTick, durationTick, pitches: [{ midi, spelling, finger: null }],
});
const written = (p) => srtNotationSegments(p, 'rh').map((s) => `${s.onsetTick / 240}:${s.durationTick / 240}${s.tied ? '~' : ''}`);
const pitched = (p) => p.events.filter((event) => event.pitches.length > 0);
const rests = (p) => p.events.filter((event) => event.pitches.length === 0);

describe('rhythm levels keep the earlier levels unchanged', () => {
  it('generates the same 4,800 earlier-level pieces as before the rhythm levels', () => {
    const fingerprints = [];
    for (const profile of OLD_PROFILES) {
      for (const hand of ['rh', 'lh']) {
        if (profile.startsWith('P3') && hand === 'lh') continue;
        for (let seed = 0; seed < 300; seed += 1) fingerprints.push(srtFingerprint(srtGenerate(profile, seed, hand)));
      }
    }
    expect(fingerprints).toHaveLength(4800);
    expect(fnv(fingerprints.join(','))).toBe('33d175b87a514212');
  });

  it('never ties a note on an earlier level', () => {
    for (const profile of OLD_PROFILES) {
      for (let seed = 0; seed < 200; seed += 1) {
        const p = srtGenerate(profile, seed);
        for (const hand of ['rh', 'lh']) expect(srtNotationSegments(p, hand).some((segment) => segment.tied)).toBe(false);
      }
    }
  });

  it('lists the rhythm levels after the earlier ones', () => {
    expect(srtProfiles()).toEqual([...OLD_PROFILES, ...RHYTHM_PROFILES]);
  });
});

describe('rhythm level generator', () => {
  it('is deterministic and valid for every seed and hand', () => {
    for (const profile of RHYTHM_PROFILES) {
      for (const hand of ['rh', 'lh']) {
        for (let seed = 0; seed < 600; seed += 1) {
          const first = srtGenerate(profile, seed, hand);
          expect(first).toEqual(srtGenerate(profile, seed, hand));
          expect(srtValidatePiece(first, profile)).toBe(true);
          expect(first.meter.num).toBe(4);
          expect(rests(first).length).toBeGreaterThan(0);
          expect(first.events.at(-1)).toMatchObject({ onsetTick: 6720, durationTick: 960 });
        }
      }
    }
  });

  it('P4.a adds eighth notes and nothing else', () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const p = srtGenerate('P4.a', seed);
      expect(pitched(p).some((event) => event.durationTick === 240)).toBe(true);
      expect(new Set(p.events.map((event) => event.durationTick)).has(720)).toBe(false);
      expect(rests(p).every((event) => event.durationTick === 480 && event.onsetTick % 480 === 0)).toBe(true);
      expect(written(p).some((segment) => segment.endsWith('~'))).toBe(false);
    }
  });

  it('P4.b adds dotted quarters and eighth rests in every piece', () => {
    let dotted = 0;
    let eighthRests = 0;
    for (let seed = 0; seed < 300; seed += 1) {
      const p = srtGenerate('P4.b', seed);
      const hasDotted = pitched(p).some((event) => event.durationTick === 720 && event.onsetTick % 960 === 0);
      const hasEighthRest = rests(p).some((event) => event.durationTick === 240);
      expect(hasDotted || hasEighthRest).toBe(true);
      dotted += hasDotted ? 1 : 0;
      eighthRests += hasEighthRest ? 1 : 0;
      expect(written(p).some((segment) => segment.endsWith('~'))).toBe(false);
    }
    expect(dotted).toBeGreaterThan(50);
    expect(eighthRests).toBeGreaterThan(50);
  });

  it('P4.c adds syncopation and ties across beats in every piece', () => {
    let syncopated = 0;
    let acrossMiddle = 0;
    for (let seed = 0; seed < 300; seed += 1) {
      const p = srtGenerate('P4.c', seed);
      const segments = srtNotationSegments(p, 'rh');
      expect(segments.some((segment) => segment.tied)).toBe(true);
      // e q e: a quarter that starts on the "and" of a beat.
      syncopated += pitched(p).some((event) => event.durationTick === 480 && event.onsetTick % 480 === 240) ? 1 : 0;
      acrossMiddle += segments.some((segment) => segment.tied && segment.onsetTick % 1920 === 960) ? 1 : 0;
    }
    expect(syncopated).toBeGreaterThan(50);
    expect(acrossMiddle).toBeGreaterThan(30);
  });
});

describe('rhythm level notation', () => {
  it('writes e q e as e e~e e', () => {
    expect(written(piece([note('a', 0, 240), note('b', 240, 480), note('c', 720, 240)]))).toEqual(['0:1', '1:1', '2:1~', '3:1']);
  });

  it('writes q h q as q q~q q across the middle of the bar', () => {
    expect(written(piece([note('a', 0, 480), note('b', 480, 960), note('c', 1440, 480)]))).toEqual(['0:2', '2:2', '4:2~', '6:2']);
  });

  it('writes e q. as e e~q and a dotted quarter on beat 2 as q~e', () => {
    expect(written(piece([note('a', 0, 240), note('b', 240, 720)]))).toEqual(['0:1', '1:1', '2:2~']);
    expect(written(piece([note('a', 0, 480), note('b', 480, 720), note('c', 1200, 240)]))).toEqual(['0:2', '2:2', '4:1~', '5:1']);
  });

  it('keeps notes that start on beat 1 or 3 whole', () => {
    expect(written(piece([note('a', 0, 720), note('b', 720, 240), note('c', 960, 960)]))).toEqual(['0:3', '3:1', '4:4']);
  });
});

describe('rhythm level expected notes and scoring', () => {
  it('expects one attack per sounding note, on the eighth grid', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const p = srtGenerate('P4.c', seed);
      const expected = srtBuildExpected(p, { bpm: 60 });
      expect(expected).toHaveLength(pitched(p).length);
      expect(expected.length).toBeLessThan(srtNotationSegments(p, 'rh').filter((segment) => segment.event.pitches.length > 0).length);
      for (const item of expected) expect(item.onMs % 500).toBe(0);
    }
  });

  it('scores a played-in-time rhythm piece perfect and a re-struck tie as an extra note', () => {
    const p = srtGenerate('P4.c', 4);
    const expected = srtBuildExpected(p, { bpm: 72 });
    const inTime = expected.map((item) => ({ id: `i-${item.id}`, midi: item.midi, onMs: item.onMs }));
    expect(srtEvaluate(expected, inTime)).toMatchObject({ perfect: true, stars: 3, FP: 0 });
    const tied = srtNotationSegments(p, 'rh').find((segment) => segment.tied);
    const restruck = { id: 'restruck', midi: tied.event.pitches[0].midi, onMs: Math.round(tied.onsetTick * (60000 / 72 / 480)) };
    expect(srtEvaluate(expected, [...inTime, restruck])).toMatchObject({ TP: expected.length, FP: 1, perfect: false });
  });

  it('scores an eighth played a quarter late as missed plus an extra', () => {
    const p = piece([note('a', 0, 240), note('b', 240, 240, 62, 'D4')]);
    const expected = srtBuildExpected(p, { bpm: 60 });
    expect(expected.map((item) => item.onMs)).toEqual([0, 500]);
    expect(srtEvaluate(expected, [
      { id: 'i-a', midi: 60, onMs: 0 },
      { id: 'i-b', midi: 62, onMs: 1500 },
    ])).toMatchObject({ TP: 1, FN: 1, FP: 1 });
  });
});

describe('rhythm level validation', () => {
  const valid = () => srtGenerate('P4.b', 3);

  it('rejects rhythm values outside the level', () => {
    const base = srtGenerate('P2.a', 3);
    const firstNote = base.events.findIndex((event) => event.pitches.length > 0 && event.durationTick === 480 && event.onsetTick > 0);
    const halved = { ...base, events: base.events.flatMap((event, index) => index === firstNote
      ? [{ ...event, durationTick: 240 }, { ...event, id: 'extra', onsetTick: event.onsetTick + 240, durationTick: 240 }]
      : [event]) };
    expect(srtValidatePiece(halved, 'P2.a')).toBe(false);

    const p = srtGenerate('P4.a', 3);
    const restIndex = p.events.findIndex((event) => event.pitches.length === 0);
    const eighthRest = { ...p, events: p.events.flatMap((event, index) => index === restIndex
      ? [{ ...event, durationTick: 240 }, { ...event, id: 'filler', onsetTick: event.onsetTick + 240, durationTick: 240 }]
      : [event]) };
    expect(srtValidatePiece(eighthRest, 'P4.a')).toBe(false);
    expect(srtValidatePiece(eighthRest, 'P4.b')).toBe(false);
  });

  it('rejects a rest that crosses a beat', () => {
    const p = valid();
    expect(srtValidatePiece(p, 'P4.b')).toBe(true);
    const firstBar = (rest, after) => piece([
      { ...note('a', 0, 240), pitches: [{ midi: 60, spelling: 'C4', finger: 1 }] },
      { id: 'r', hand: 'rh', onsetTick: 240, durationTick: rest, pitches: [] },
      note('b', 240 + rest, after, 62, 'D4'),
      note('c', 960, 960, 62, 'D4'),
      ...p.events.filter((event) => event.onsetTick >= 1920),
    ], 'P4.b');
    // An eighth rest on the "and" of beat 1 is fine; a quarter rest there would cross beat 2.
    expect(srtValidatePiece(firstBar(240, 480), 'P4.b')).toBe(true);
    expect(srtValidatePiece(firstBar(480, 240), 'P4.b')).toBe(false);
  });
});

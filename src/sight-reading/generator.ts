import {
  srtProfileLimits,
  srtValidatePiece,
  TICKS_PER_QUARTER,
  type SightReadingEvent,
  type SightReadingHand,
  type SightReadingPiece,
  type SightReadingProfile,
} from './model.js';

type ProfileConfig = { readonly meter: 3 | 4; readonly min: number; readonly max: number; readonly leap: number; readonly rests: boolean; readonly repeat: boolean };
const configs: Record<SightReadingProfile, ProfileConfig> = {
  'P1.a': { meter: 4, min: 60, max: 67, leap: 1, rests: false, repeat: false },
  'P1.b': { meter: 4, min: 60, max: 67, leap: 2, rests: false, repeat: false },
  'P1.c': { meter: 4, min: 60, max: 67, leap: 2, rests: false, repeat: true },
  'P2.a': { meter: 4, min: 60, max: 67, leap: 2, rests: true, repeat: false },
  'P2.b': { meter: 3, min: 60, max: 67, leap: 2, rests: true, repeat: false },
  'P2.c': { meter: 4, min: 60, max: 72, leap: 2, rests: true, repeat: false },
  'P3.a': { meter: 4, min: 48, max: 84, leap: 2, rests: true, repeat: false },
  'P3.b': { meter: 4, min: 48, max: 88, leap: 2, rests: true, repeat: false },
  'P3.c': { meter: 4, min: 44, max: 88, leap: 2, rests: true, repeat: false },
  'P3.d': { meter: 4, min: 48, max: 96, leap: 2, rests: true, repeat: false },
};
const SCALE = [0, 2, 4, 5, 7, 9, 11] as const;
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const NATURAL_PCS = [0, 2, 4, 5, 7, 9, 11] as const;
const MAJOR_TONICS = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'] as const;
const MINOR_TONICS = ['Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#'] as const;
const CHROMATIC_SPELLINGS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function spelling(midi: number): string {
  const pitchClass = ((midi % 12) + 12) % 12;
  const degree = SCALE.findIndex((value) => value === pitchClass);
  return `${LETTERS[degree]}${Math.floor(midi / 12) - 1}`;
}

function scaleIndex(midi: number): number {
  const pitchClass = ((midi % 12) + 12) % 12;
  return Math.floor(midi / 12) * 7 + SCALE.findIndex((value) => value === pitchClass);
}

function midiAtScaleIndex(index: number): number {
  const octave = Math.floor(index / 7);
  const degree = ((index % 7) + 7) % 7;
  return octave * 12 + SCALE[degree];
}

function durationsForBar(random: () => number, meter: 3 | 4, finalBar: boolean): number[] {
  if (finalBar) return meter === 4 ? [480, 480, 960] : [480, 960];
  if (meter === 4) return random() < 0.5 ? [480, 480, 480, 480] : [960, 960];
  return random() < 0.5 ? [480, 480, 480] : [960, 480];
}

function parseTonic(tonic: string): { readonly letter: number; readonly accidental: number } {
  const match = /^([A-G])([#b]?)$/.exec(tonic);
  if (!match) throw new Error(`Invalid key tonic: ${tonic}`);
  return {
    letter: LETTERS.indexOf(match[1] as typeof LETTERS[number]),
    accidental: match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0,
  };
}

function polyphonicKey(profile: 'P3.a' | 'P3.b' | 'P3.c' | 'P3.d', random: () => number): SightReadingPiece['key'] {
  if (profile === 'P3.d') return { tonic: 'C', mode: 'chromatic', keyN: 0 };
  const keyN = Math.floor(random() * 15) - 7;
  if (profile === 'P3.a') return { tonic: MAJOR_TONICS[keyN + 7], mode: 'major', keyN };
  if (profile === 'P3.b') return { tonic: MINOR_TONICS[keyN + 7], mode: 'naturalMinor', keyN };
  return { tonic: MINOR_TONICS[keyN + 7], mode: 'harmonicMinor', keyN };
}

function keyPitch(key: SightReadingPiece['key'], degree: number): SightReadingEvent['pitches'][number] {
  if (key.mode === 'chromatic') {
    const octaveOffset = Math.floor(degree / 12);
    const pitchClass = ((degree % 12) + 12) % 12;
    return { midi: 60 + degree, spelling: `${CHROMATIC_SPELLINGS[pitchClass]}${4 + octaveOffset}`, finger: null };
  }
  const root = parseTonic(key.tonic);
  const intervals = key.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11]
    : key.mode === 'naturalMinor' ? [0, 2, 3, 5, 7, 8, 10]
      : [0, 2, 3, 5, 7, 8, 11];
  const octaveOffset = Math.floor(degree / 7);
  const scaleDegree = ((degree % 7) + 7) % 7;
  const letter = (root.letter + scaleDegree) % 7;
  const octave = 4 + octaveOffset + Math.floor((root.letter + scaleDegree) / 7);
  const midi = 60 + NATURAL_PCS[root.letter] + root.accidental + intervals[scaleDegree] + octaveOffset * 12;
  const naturalMidi = (octave + 1) * 12 + NATURAL_PCS[letter];
  const accidental = midi - naturalMidi;
  if (accidental < -1 || accidental > 1) throw new Error(`Unspellable generated pitch: ${key.tonic}/${degree}`);
  return { midi, spelling: `${LETTERS[letter]}${accidental === 1 ? '#' : accidental === -1 ? 'b' : ''}${octave}`, finger: null };
}

function inversionPitches(key: SightReadingPiece['key'], degree: number, voices: 2 | 3, inversion: number): SightReadingEvent['pitches'] {
  const chromatic = key.mode === 'chromatic';
  const degrees = voices === 2 ? [degree, degree + (chromatic ? 4 : 2)] : [degree, degree + (chromatic ? 4 : 2), degree + (chromatic ? 7 : 4)];
  for (let index = 0; index < inversion; index += 1) degrees[index] += chromatic ? 12 : 7;
  return degrees.map((value) => keyPitch(key, value)).sort((a, b) => a.midi - b.midi);
}

function generatePolyphonic(profile: 'P3.a' | 'P3.b' | 'P3.c' | 'P3.d', seed: number, random: () => number): SightReadingPiece {
  const key = polyphonicKey(profile, random);
  const events: SightReadingEvent[] = [];
  let eventIndex = 0;
  let previousDegree = 0;
  for (let bar = 0; bar < 4; bar += 1) {
    const durations = durationsForBar(random, 4, bar === 3);
    let onsetTick = bar * 4 * TICKS_PER_QUARTER;
    for (let index = 0; index < durations.length; index += 1) {
      const durationTick = durations[index];
      const cadence = bar === 3 && index === durations.length - 1;
      const rest = !cadence && durationTick === 480 && onsetTick > 0 && random() < 0.18;
      const maxDegree = profile === 'P3.d' ? 7 : 3;
      const degree = cadence ? 0 : Math.max(0, Math.min(maxDegree, previousDegree + (random() < 0.5 ? -1 : 1)));
      previousDegree = degree;
      if (profile === 'P3.c') {
        events.push(
          { id: `lh-${eventIndex}`, hand: 'lh', onsetTick, durationTick, pitches: rest ? [] : [keyPitch(key, degree - 7)] },
          { id: `rh-${eventIndex}`, hand: 'rh', onsetTick, durationTick, pitches: rest ? [] : inversionPitches(key, degree, 2, Math.floor(random() * 2)) },
        );
      } else {
        const voices: 2 | 3 = profile === 'P3.a' ? 2 : 3;
        events.push({ id: `rh-${eventIndex}`, hand: 'rh', onsetTick, durationTick, pitches: rest ? [] : inversionPitches(key, degree, voices, Math.floor(random() * voices)) });
      }
      onsetTick += durationTick;
      eventIndex += 1;
    }
  }
  const piece: SightReadingPiece = {
    schemaVersion: 1, generatorVersion: 1, profileId: profile, seed: seed | 0,
    meter: { num: 4, den: 4 }, ticksPerQuarter: TICKS_PER_QUARTER, key, bars: 4, events,
  };
  if (!srtValidatePiece(piece, profile)) throw new Error(`Generated sight-reading piece failed validation: ${profile}/${seed}`);
  return piece;
}

export function srtGenerate(profile: SightReadingProfile, seed: number, hand: SightReadingHand = 'rh'): SightReadingPiece {
  const config = configs[profile];
  if (!config || !Number.isInteger(seed) || (hand !== 'rh' && hand !== 'lh')) throw new Error(`Unknown sight-reading profile: ${profile}`);
  const random = mulberry32(seed);
  if (profile === 'P3.a' || profile === 'P3.b' || profile === 'P3.c' || profile === 'P3.d') return generatePolyphonic(profile, seed, random);
  const offset = hand === 'rh' ? 0 : -12;
  const minMidi = config.min + offset;
  const maxMidi = config.max + offset;
  const firstScale = scaleIndex(minMidi);
  const lastScale = scaleIndex(maxMidi);
  const events: SightReadingEvent[] = [];
  let previousMidi = minMidi;
  let cursor = 0;
  let eventIndex = 0;
  let pitchedCount = 0;
  let restCount = 0;
  let hasRepeat = false;
  for (let bar = 0; bar < 4; bar += 1) {
    const barStart = bar * config.meter * TICKS_PER_QUARTER;
    const durations = durationsForBar(random, config.meter, bar === 3);
    let barCursor = barStart;
    for (let index = 0; index < durations.length; index += 1) {
      const durationTick = durations[index];
      const cadence = bar === 3 && index === durations.length - 1;
      const canRest = config.rests && !cadence && cursor > 0;
      const rest = canRest && (profile === 'P2.c' || durationTick === 480) && random() < (restCount === 0 ? 0.24 : 0.13);
      let pitches: SightReadingPiece['events'][number]['pitches'] = [];
      if (rest) {
        restCount += 1;
      } else {
        let nextMidi = previousMidi;
        if (cadence || (bar === 3 && ((config.meter === 4 && index <= 1) || (config.meter === 3 && index === 0))) || (profile === 'P1.a' && bar === 2)) {
          nextMidi = minMidi;
        } else if (config.repeat && pitchedCount > 0 && !hasRepeat && random() < 0.8) {
          nextMidi = previousMidi;
          hasRepeat = true;
        } else {
          const previousIndex = scaleIndex(previousMidi);
          const low = Math.max(firstScale, previousIndex - config.leap);
          const high = Math.min(lastScale, previousIndex + config.leap);
          const candidates: number[] = [];
          for (let candidate = low; candidate <= high; candidate += 1) candidates.push(candidate);
          nextMidi = midiAtScaleIndex(candidates[Math.floor(random() * candidates.length)]);
          if (nextMidi === previousMidi) hasRepeat = true;
        }
        if (pitchedCount === 0) nextMidi = minMidi;
        previousMidi = nextMidi;
        pitchedCount += 1;
        pitches = [{ midi: nextMidi, spelling: spelling(nextMidi), finger: profile === 'P2.c' ? null : pitchedCount === 1 ? 1 : null }];
      }
      events.push({ id: `${hand}-${eventIndex}`, hand, onsetTick: barCursor, durationTick, pitches });
      barCursor += durationTick;
      cursor += durationTick;
      eventIndex += 1;
    }
  }
  if (config.rests && restCount === 0) {
    const index = events.findIndex((event) => event.onsetTick > 0 && event.pitches.length > 0 && event.durationTick === 480);
    if (index >= 0) events[index] = { ...events[index], pitches: [] };
  }
  if (config.repeat && !hasRepeat) {
    const index = events.findIndex((event, itemIndex) => itemIndex > 0 && event.pitches.length > 0 && events[itemIndex - 1].pitches.length > 0);
    if (index >= 0) events[index] = { ...events[index], pitches: [{ ...events[index - 1].pitches[0], finger: null }] };
  }
  const pitched = events.map((event, index) => ({ event, index })).filter((item) => item.event.pitches.length > 0);
  for (let index = pitched.length - 1; index >= 0; index -= 1) {
    const event = events[pitched[index].index];
    const current = event.pitches[0].midi;
    const next = index === pitched.length - 1 ? minMidi : events[pitched[index + 1].index].pitches[0].midi;
    const midi = Math.abs(scaleIndex(current) - scaleIndex(next)) <= config.leap ? current : next;
    events[pitched[index].index] = { ...event, pitches: [{ ...event.pitches[0], midi, spelling: spelling(midi) }] };
  }
  let firstPitched = true;
  for (const [index, event] of events.entries()) {
    if (event.pitches.length === 0) continue;
    const pitch = event.pitches[0];
    events[index] = { ...event, pitches: [{ ...pitch, finger: profile === 'P2.c' ? null : firstPitched ? 1 : null }] };
    firstPitched = false;
  }
  const piece: SightReadingPiece = {
    schemaVersion: 1, generatorVersion: 1, profileId: profile, seed: seed | 0,
    meter: { num: config.meter, den: 4 }, ticksPerQuarter: TICKS_PER_QUARTER,
    key: { tonic: 'C', mode: 'major', keyN: 0 }, bars: 4, events,
  };
  if (!srtValidatePiece(piece, profile)) throw new Error(`Generated sight-reading piece failed validation: ${profile}/${seed}/${hand}`);
  return piece;
}

export function srtProfiles(): readonly SightReadingProfile[] {
  return ['P1.a', 'P1.b', 'P1.c', 'P2.a', 'P2.b', 'P2.c', 'P3.a', 'P3.b', 'P3.c', 'P3.d'];
}

export function srtGeneratorConfig(profile: SightReadingProfile, hand: SightReadingHand = 'rh'): ProfileConfig & ReturnType<typeof srtProfileLimits> {
  return { ...configs[profile], ...srtProfileLimits(profile, hand) };
}

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
};
const SCALE = [0, 2, 4, 5, 7, 9, 11] as const;

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
  const names = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
  const pitchClass = ((midi % 12) + 12) % 12;
  const degree = SCALE.findIndex((value) => value === pitchClass);
  return `${names[degree]}${Math.floor(midi / 12) - 1}`;
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

export function srtGenerate(profile: SightReadingProfile, seed: number, hand: SightReadingHand = 'rh'): SightReadingPiece {
  const config = configs[profile];
  if (!config || !Number.isInteger(seed) || (hand !== 'rh' && hand !== 'lh')) {
    throw new Error(`Unknown sight-reading profile: ${profile}`);
  }
  const random = mulberry32(seed);
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
      const rest = canRest &&
        (profile === 'P2.c' || durationTick === 480) &&
        random() < (restCount === 0 ? 0.24 : 0.13);
      let pitches: SightReadingPiece['events'][number]['pitches'] = [];
      if (rest) {
        restCount += 1;
      } else {
        let nextMidi = previousMidi;
        if (cadence ||
            (bar === 3 && ((config.meter === 4 && index <= 1) || (config.meter === 3 && index === 0))) ||
            (profile === 'P1.a' && bar === 2)) {
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
        pitches = [{
          midi: nextMidi,
          spelling: spelling(nextMidi),
          finger: profile === 'P2.c' ? null : pitchedCount === 1 ? 1 : null,
        }];
      }
      events.push({ id: `${hand}-${eventIndex}`, hand, onsetTick: barCursor, durationTick, pitches });
      barCursor += durationTick;
      cursor += durationTick;
      eventIndex += 1;
    }
  }
  if (config.rests && restCount === 0) {
    const index = events.findIndex((event) => event.onsetTick > 0 && event.pitches.length > 0 && event.durationTick === 480);
    if (index >= 0) {
      const event = events[index];
      events[index] = { ...event, pitches: [] };
    }
  }
  if (config.repeat && !hasRepeat) {
    const index = events.findIndex((event, i) => i > 0 && event.pitches.length > 0 && events[i - 1].pitches.length > 0);
    if (index >= 0) {
      const event = events[index];
      const previous = events[index - 1].pitches[0];
      events[index] = { ...event, pitches: [{ ...previous, finger: null }] };
    }
  }
  const pitched = events.map((event, index) => ({ event, index })).filter((item) => item.event.pitches.length > 0);
  const target = minMidi;
  for (let index = pitched.length - 1; index >= 0; index -= 1) {
    const event = events[pitched[index].index];
    const current = event.pitches[0].midi;
    const next = index === pitched.length - 1 ? target : events[pitched[index + 1].index].pitches[0].midi;
    const midi = Math.abs(scaleIndex(current) - scaleIndex(next)) <= config.leap ? current : next;
    events[pitched[index].index] = { ...event, pitches: [{ ...event.pitches[0], midi, spelling: spelling(midi) }] };
  }
  let firstPitched = true;
  for (const [index, event] of events.entries()) {
    if (event.pitches.length === 0) continue;
    const pitch = event.pitches[0];
    const finger = profile === 'P2.c' ? null : firstPitched ? 1 : null;
    events[index] = { ...event, pitches: [{ ...pitch, finger }] };
    firstPitched = false;
  }
  const piece: SightReadingPiece = {
    schemaVersion: 1,
    generatorVersion: 1,
    profileId: profile,
    seed: seed | 0,
    meter: { num: config.meter, den: 4 },
    ticksPerQuarter: TICKS_PER_QUARTER,
    key: { tonic: 'C', mode: 'major', keyN: 0 },
    bars: 4,
    events,
  };
  if (!srtValidatePiece(piece, profile)) {
    throw new Error(`Generated sight-reading piece failed validation: ${profile}/${seed}/${hand}`);
  }
  return piece;
}

export function srtProfiles(): readonly SightReadingProfile[] {
  return ['P1.a', 'P1.b', 'P1.c', 'P2.a', 'P2.b', 'P2.c'];
}

export function srtGeneratorConfig(profile: SightReadingProfile, hand: SightReadingHand = 'rh'): ProfileConfig & ReturnType<typeof srtProfileLimits> {
  return { ...configs[profile], ...srtProfileLimits(profile, hand) };
}

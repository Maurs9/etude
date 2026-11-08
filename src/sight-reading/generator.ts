import { srtValidatePiece, TICKS_PER_QUARTER, type SightReadingEvent, type SightReadingHand, type SightReadingPiece, type SightReadingProfile } from './model.js';

type ProfileConfig = { readonly meter: 3 | 4; readonly min: number; readonly max: number; readonly leap: number; readonly rests: boolean; readonly repeat: boolean };
const configs: Record<SightReadingProfile, ProfileConfig> = {
  'P1.a': { meter: 4, min: 60, max: 67, leap: 2, rests: false, repeat: false },
  'P1.b': { meter: 4, min: 60, max: 67, leap: 4, rests: false, repeat: false },
  'P1.c': { meter: 4, min: 60, max: 67, leap: 4, rests: false, repeat: true },
  'P2.a': { meter: 4, min: 60, max: 67, leap: 4, rests: true, repeat: false },
  'P2.b': { meter: 3, min: 60, max: 67, leap: 4, rests: true, repeat: false },
  'P2.c': { meter: 4, min: 60, max: 72, leap: 4, rests: true, repeat: false },
};

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = Math.imul(value ^ value >>> 15, 1 | value);
    result ^= result + Math.imul(result ^ result >>> 7, 61 | result);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function spelling(midi: number): string {
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function srtGenerate(profile: SightReadingProfile, seed: number, hand: SightReadingHand = 'rh'): SightReadingPiece {
  const config = configs[profile];
  if (!config) throw new Error(`Unknown sight-reading profile: ${profile}`);
  const random = mulberry32(seed);
  const offset = hand === 'rh' ? 0 : -12;
  const minMidi = config.min + offset;
  const maxMidi = config.max + offset;
  const events: SightReadingEvent[] = [];
  let cursor = 0;
  let previous = 0;
  let hasRepeat = false;
  let index = 0;
  for (let bar = 0; bar < 4; bar += 1) {
    const barStart = bar * config.meter * TICKS_PER_QUARTER;
    const finalBar = bar === 3;
    const durations = finalBar
      ? config.meter === 4 ? [480, 480, 960] : [480, 960]
      : config.meter === 4
        ? (random() > 0.5 ? [480, 480, 480, 480] : [960, 960])
        : (random() > 0.5 ? [480, 480, 480] : [960, 480]);
    let barCursor = barStart;
    for (const duration of durations) {
      const isCadence = finalBar && barCursor === barStart + (config.meter * TICKS_PER_QUARTER - 960);
      const isCadenceApproach = finalBar && config.meter === 4 && barCursor === barStart + 480;
      const cadenceLead = bar === 2 && barCursor + duration === barStart + config.meter * TICKS_PER_QUARTER;
      const rest = config.rests && !isCadence && bar > 0 && barCursor !== 0 &&
        (random() > 0.78 || (bar === 1 && barCursor === barStart));
    let midi = previous || minMidi + Math.floor(random() * (maxMidi - minMidi + 1));
    if (bar >= 0 || finalBar || isCadence || isCadenceApproach || cadenceLead) midi = minMidi;
    else if (!rest && previous) {
      const low = Math.max(minMidi, previous - config.leap);
      const high = Math.min(maxMidi, previous + config.leap);
      midi = config.repeat && index === 1 ? previous : low + Math.floor(random() * (high - low + 1));
      if (config.repeat && midi === previous) hasRepeat = true;
    }
    const pitches = rest ? [] : [{
      midi,
      spelling: spelling(midi),
      finger: profile === 'P2.c' ? null : index === 0 ? 1 : null,
    }];
      events.push({ id: `${hand}-${index}`, hand, onsetTick: barCursor, durationTick: duration, pitches });
    if (!rest) previous = midi;
      barCursor += duration;
      index += 1;
    }
  }
  const piece: SightReadingPiece = {
    schemaVersion: 1, generatorVersion: 1, profileId: profile, seed: seed | 0,
    meter: { num: config.meter, den: 4 }, ticksPerQuarter: 480, key: { tonic: 'C', mode: 'major', keyN: 0 },
    bars: 4, events,
  };
  if (!srtValidatePiece(piece, profile)) throw new Error(`Generated sight-reading piece failed validation: ${profile}/${seed}/${hand}`);
  return piece;
}

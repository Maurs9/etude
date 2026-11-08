export const TICKS_PER_QUARTER = 480 as const;

export type SightReadingHand = 'rh' | 'lh';
export type SightReadingProfile =
  | 'P1.a'
  | 'P1.b'
  | 'P1.c'
  | 'P2.a'
  | 'P2.b'
  | 'P2.c';
export type SightReadingMeter = { readonly num: 3 | 4; readonly den: 4 };
export type SightReadingPitch = {
  readonly midi: number;
  readonly spelling: string;
  readonly finger: number | null;
};
export type SightReadingEvent = {
  readonly id: string;
  readonly hand: SightReadingHand;
  readonly onsetTick: number;
  readonly durationTick: number;
  readonly pitches: readonly SightReadingPitch[];
};
export type SightReadingKey = {
  readonly tonic: string;
  readonly mode: 'major';
  readonly keyN: 0;
};
export type SightReadingPiece = {
  readonly schemaVersion: 1;
  readonly generatorVersion: 1;
  readonly profileId: SightReadingProfile;
  readonly seed: number;
  readonly meter: SightReadingMeter;
  readonly ticksPerQuarter: 480;
  readonly key: SightReadingKey;
  readonly bars: 4;
  readonly events: readonly SightReadingEvent[];
};

export type SightReadingExpected = {
  readonly id: string;
  readonly midi: number;
  readonly hand: SightReadingHand;
  readonly onMs: number;
  readonly offMs: number;
  readonly restBeforeMs: number;
  readonly restAfterMs: number;
};

export type SightReadingExpectedConfig = {
  readonly bpm?: number;
  readonly hand?: SightReadingHand | 'both';
  readonly latencyOffsetMs?: number;
};

const PROFILE_SET: readonly SightReadingProfile[] = ['P1.a', 'P1.b', 'P1.c', 'P2.a', 'P2.b', 'P2.c'];

export function isSightReadingProfile(value: string): value is SightReadingProfile {
  return PROFILE_SET.some((profile) => profile === value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function validPitch(pitch: SightReadingPitch): boolean {
  return isInteger(pitch.midi) &&
    pitch.midi >= 0 &&
    pitch.midi <= 127 &&
    typeof pitch.spelling === 'string' &&
    (pitch.finger === null || (isInteger(pitch.finger) && pitch.finger >= 1 && pitch.finger <= 5));
}

function profileLimits(profile: SightReadingProfile, hand: SightReadingHand = 'rh'): { readonly min: number; readonly max: number; readonly leap: number; readonly rests: boolean } {
  const offset = hand === 'lh' ? -12 : 0;
  if (profile === 'P2.c') return { min: 60 + offset, max: 72 + offset, leap: 4, rests: true };
  const lh = 60 + offset;
  return {
    min: lh,
    max: lh + 7,
    leap: profile === 'P1.a' ? 2 : 4,
    rests: profile.startsWith('P2'),
  };
}

export function srtValidatePiece(piece: SightReadingPiece, profile: SightReadingProfile = piece.profileId): boolean {
  if (!piece || piece.schemaVersion !== 1 || piece.generatorVersion !== 1 ||
      !isSightReadingProfile(profile) || piece.profileId !== profile ||
      piece.ticksPerQuarter !== TICKS_PER_QUARTER || piece.bars !== 4 ||
      piece.key.keyN !== 0 || piece.key.mode !== 'major' ||
      piece.meter.den !== 4 || (piece.meter.num !== 3 && piece.meter.num !== 4) ||
      !isInteger(piece.seed)) return false;
  const barTicks = piece.meter.num * TICKS_PER_QUARTER;
  const byHand: Record<SightReadingHand, SightReadingEvent[]> = { rh: [], lh: [] };
  for (const event of piece.events) {
    if ((event.hand !== 'rh' && event.hand !== 'lh') || !isInteger(event.onsetTick) || !isInteger(event.durationTick) ||
        event.onsetTick < 0 || event.durationTick <= 0 ||
        event.onsetTick % TICKS_PER_QUARTER !== 0 || event.durationTick % TICKS_PER_QUARTER !== 0 ||
        event.onsetTick + event.durationTick > piece.bars * barTicks ||
        event.onsetTick % barTicks + event.durationTick > barTicks ||
        event.pitches.some((pitch: SightReadingPitch) => !validPitch(pitch))) return false;
    for (let index = 1; index < event.pitches.length; index += 1) {
      if (event.pitches[index - 1].midi > event.pitches[index].midi) return false;
    }
    const limits = profileLimits(profile, event.hand);
    if (event.pitches.length > 0 && event.pitches.some((pitch: SightReadingPitch) => pitch.midi < limits.min || pitch.midi > limits.max)) return false;
    byHand[event.hand].push(event);
  }
  for (const hand of ['rh', 'lh'] as const) {
    const events = byHand[hand].sort((a, b) => a.onsetTick - b.onsetTick);
    if (events.length === 0) continue;
    const limits = profileLimits(profile, hand);
    let cursor = 0;
    let previousMidi: number | null = null;
    let first = true;
    for (const event of events) {
      if (event.onsetTick !== cursor) return false;
      if (first && event.pitches.length === 0) return false;
      if (event.pitches.length > 0 && previousMidi !== null &&
          Math.abs(event.pitches[0].midi - previousMidi) > limits.leap) return false;
      if (event.pitches.length > 0) previousMidi = event.pitches[0].midi;
      if (event.pitches.length > 0 && profile !== 'P2.c') {
        const firstPitch = event.pitches[0];
        if (first && firstPitch.finger !== 1) return false;
        if (!first && firstPitch.finger !== null) return false;
      } else if (event.pitches.length > 0 && profile === 'P2.c' &&
                 event.pitches.some((pitch) => pitch.finger !== null)) return false;
      first = false;
      cursor += event.durationTick;
    }
    if (cursor !== piece.bars * barTicks) return false;
    if (limits.rests && !events.some((event) => event.pitches.length === 0)) return false;
    const finalBarEvents = events.filter((event) => event.onsetTick >= (piece.bars - 1) * barTicks);
    const finalEvent = finalBarEvents.at(-1);
    if (!finalEvent || finalEvent.pitches.length === 0 || finalEvent.pitches[0].midi !== limits.min) return false;
    if (piece.meter.num === 4 && (finalEvent.durationTick !== 960 || finalEvent.onsetTick !== piece.bars * barTicks - 960)) return false;
    if (piece.meter.num === 3 && (finalEvent.durationTick !== 960 || finalEvent.onsetTick !== piece.bars * barTicks - 960)) return false;
  }
  return true;
}

export function srtToLegacyPiece(piece: SightReadingPiece): Record<string, unknown> {
  const notes = piece.events.flatMap((event) => event.pitches.map((pitch, pitchIndex) => ({
    id: `${event.id}:${pitch.midi}`,
    eventId: event.id,
    nid: `${event.id}:${pitch.midi}`,
    hand: event.hand,
    midi: pitch.midi,
    spelling: pitch.spelling,
    finger: pitch.finger,
    start: event.onsetTick / TICKS_PER_QUARTER,
    duration: event.durationTick / TICKS_PER_QUARTER,
    pitchIndex,
  })));
  return {
    profileId: piece.profileId,
    seed: piece.seed,
    meter: piece.meter,
    bars: piece.bars,
    notes,
  };
}

export function srtBuildExpected(piece: SightReadingPiece, config: SightReadingExpectedConfig = {}): readonly SightReadingExpected[] {
  const bpm = config.bpm ?? 60;
  const hand = config.hand ?? 'both';
  const latency = config.latencyOffsetMs ?? 0;
  const msPerTick = 60000 / bpm / TICKS_PER_QUARTER;
  const durationMs = piece.bars * piece.meter.num * TICKS_PER_QUARTER * msPerTick;
  const events = piece.events
    .filter((event) => hand === 'both' || event.hand === hand)
    .sort((a, b) => a.onsetTick - b.onsetTick || a.hand.localeCompare(b.hand));
  const notes: SightReadingExpected[] = [];
  for (const event of events) {
    for (const pitch of event.pitches) {
      notes.push({
        id: `${event.id}:${pitch.midi}`,
        midi: pitch.midi,
        hand: event.hand,
        onMs: Math.round(event.onsetTick * msPerTick + latency),
        offMs: Math.min(durationMs, Math.round((event.onsetTick + event.durationTick) * msPerTick + latency)),
        restBeforeMs: event.onsetTick * msPerTick,
        restAfterMs: Math.max(0, durationMs - (event.onsetTick + event.durationTick) * msPerTick),
      });
    }
  }
  return notes;
}

export function srtPieceDurationMs(piece: SightReadingPiece, bpm = 60): number {
  return piece.bars * piece.meter.num * 60000 / bpm;
}

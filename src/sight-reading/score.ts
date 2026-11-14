// Turns a level piece into what the rest of the app works with: tokens for the engraver, and the notes the
// evaluation expects. Bar and beat lengths come from the meter, so 3/8 and 6/8 are measured correctly.
import { srtLevel, srtMeterTicks, type LevelPiece } from './levels.js';
import { TICKS_PER_QUARTER, type SightReadingExpected, type SightReadingExpectedConfig, type SightReadingHand } from './model.js';

/** One note, chord or rest for the engraver: pitch(es) or 'R', the length in quarters, and 'tied' for a continuation. */
export type LevelScoreToken = [string | string[], number] | [string | string[], number, 'tied'];
export type LevelScore = {
  ts: [number, number];
  keyN: number;
  minor: boolean;
  /** Quarter notes per minute. */
  bpm: number;
  /** Asks the engraver for the notation level pieces need: beams in every meter, dotted rests, accidentals per bar. */
  engrave: 2;
  rh: LevelScoreToken[];
  lh: LevelScoreToken[];
};

function handTokens(piece: LevelPiece, hand: SightReadingHand): LevelScoreToken[] {
  const { bar } = srtMeterTicks(piece.meter);
  const tokens: LevelScoreToken[] = [];
  const events = piece.events.filter((event) => event.hand === hand).sort((a, b) => a.onsetTick - b.onsetTick);
  for (const event of events) {
    const names = event.pitches.map((pitch) => pitch.spelling);
    const what = (): string | string[] => (names.length === 0 ? 'R' : names.length === 1 ? names[0] : [...names]);
    // A note that sounds across a barline is written once per bar, and the parts are tied.
    const end = event.onsetTick + event.durationTick;
    for (let at = event.onsetTick; at < end;) {
      const next = Math.min(end, (Math.floor(at / bar) + 1) * bar);
      const quarters = (next - at) / TICKS_PER_QUARTER;
      tokens.push(at === event.onsetTick ? [what(), quarters] : [what(), quarters, 'tied']);
      at = next;
    }
  }
  return tokens;
}

/** The piece as the engraver reads it. Every bar's tokens add up to the bar length. */
export function srtLevelScore(piece: LevelPiece): LevelScore {
  return {
    ts: [piece.meter.num, piece.meter.den],
    keyN: piece.key.keyN,
    minor: piece.key.mode === 'minor',
    bpm: srtLevel(piece.level).bpm,
    engrave: 2,
    rh: handTokens(piece, 'rh'),
    lh: handTokens(piece, 'lh'),
  };
}

/** How long the piece lasts at a tempo given in quarter notes per minute. */
export function srtLevelDurationMs(piece: LevelPiece, bpm: number): number {
  return piece.bars * srtMeterTicks(piece.meter).bar * 60000 / bpm / TICKS_PER_QUARTER;
}

/**
 * The notes a player must play, with their times: one entry per pitch, in the order of the score
 * (by onset, the right hand before the left, low notes before high ones). The id is `<event id>:<index of the pitch>`.
 */
export function srtLevelExpected(piece: LevelPiece, config: SightReadingExpectedConfig = {}): readonly SightReadingExpected[] {
  const bpm = config.bpm ?? srtLevel(piece.level).bpm;
  const hand = config.hand ?? 'both';
  const latency = config.latencyOffsetMs ?? 0;
  const msPerTick = 60000 / bpm / TICKS_PER_QUARTER;
  const durationMs = srtLevelDurationMs(piece, bpm);
  return piece.events
    .filter((event) => hand === 'both' || event.hand === hand)
    .sort((a, b) => a.onsetTick - b.onsetTick || (a.hand === b.hand ? 0 : a.hand === 'rh' ? -1 : 1))
    .flatMap((event) => event.pitches.map((pitch, index) => ({
      id: `${event.id}:${index}`,
      midi: pitch.midi,
      hand: event.hand,
      onMs: Math.round(event.onsetTick * msPerTick + latency),
      offMs: Math.min(durationMs, Math.round((event.onsetTick + event.durationTick) * msPerTick + latency)),
      restBeforeMs: event.onsetTick * msPerTick,
      restAfterMs: Math.max(0, durationMs - (event.onsetTick + event.durationTick) * msPerTick),
    })));
}

/**
 * The moments of the metronome, with the first click of each bar marked: one click per beat.
 * In 3/8 the beat is the whole bar, so there the metronome clicks the three eighths.
 */
export function srtLevelClicks(piece: LevelPiece, bpm: number): readonly { readonly ms: number; readonly accent: boolean }[] {
  const { bar, beat } = srtMeterTicks(piece.meter);
  const msPerTick = 60000 / bpm / TICKS_PER_QUARTER;
  const clicks: { ms: number; accent: boolean }[] = [];
  const step = beat === bar && piece.meter.den === 8 ? beat / 3 : beat;
  for (let tick = 0; tick < piece.bars * bar; tick += step) clicks.push({ ms: Math.round(tick * msPerTick * 1000) / 1000, accent: tick % bar === 0 });
  return clicks;
}

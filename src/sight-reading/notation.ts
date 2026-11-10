import { TICKS_PER_QUARTER, type SightReadingEvent, type SightReadingHand, type SightReadingPiece } from './model.js';

/**
 * One written note or rest of a generated piece. A sounding note that crosses a beat is written as two or more
 * segments joined by ties: every segment after the first has `tied: true` and is not played again.
 */
export type SightReadingNotationSegment = {
  readonly event: SightReadingEvent;
  readonly onsetTick: number;
  readonly durationTick: number;
  readonly tied: boolean;
};

// Where a written note starting at `start` (ticks from the bar line) must end at the latest.
// - A note that starts off the beat ends by the next beat, so the reader sees every beat.
// - In 4/4 a note on beat 2 or 4 does not cross the middle of the bar (beat 3); a note on beat 1 may.
function writtenEnd(start: number, end: number, meterNum: 3 | 4): number {
  const beat = TICKS_PER_QUARTER;
  if (start % beat !== 0) return Math.min(end, (Math.floor(start / beat) + 1) * beat);
  const middle = 2 * beat;
  if (meterNum === 4 && start > 0 && start < middle && end > middle) return middle;
  return end;
}

/** Splits one hand's events into written segments. Rests and notes that need no tie come back unchanged. */
export function srtNotationSegments(piece: SightReadingPiece, hand: SightReadingHand): SightReadingNotationSegment[] {
  const barTicks = piece.meter.num * TICKS_PER_QUARTER;
  const segments: SightReadingNotationSegment[] = [];
  const events = piece.events.filter((event) => event.hand === hand).sort((a, b) => a.onsetTick - b.onsetTick);
  for (const event of events) {
    if (event.pitches.length === 0) {
      segments.push({ event, onsetTick: event.onsetTick, durationTick: event.durationTick, tied: false });
      continue;
    }
    const barStart = Math.floor(event.onsetTick / barTicks) * barTicks;
    const end = event.onsetTick + event.durationTick - barStart;
    let start = event.onsetTick - barStart;
    let tied = false;
    while (start < end) {
      const stop = writtenEnd(start, end, piece.meter.num);
      segments.push({ event, onsetTick: barStart + start, durationTick: stop - start, tied });
      start = stop;
      tied = true;
    }
  }
  return segments;
}

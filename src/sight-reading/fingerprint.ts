import type { SightReadingEvent, SightReadingPiece } from './model.js';

function eventSort(a: SightReadingEvent, b: SightReadingEvent): number {
  return a.hand.localeCompare(b.hand) || a.onsetTick - b.onsetTick || a.durationTick - b.durationTick;
}

export function srtCanonicalString(piece: SightReadingPiece): string {
  const events = [...piece.events].sort(eventSort).map((event) => {
    const pitches = [...event.pitches]
      .sort((a, b) => a.midi - b.midi || a.spelling.localeCompare(b.spelling))
      .map((pitch) => `${pitch.midi}:${pitch.spelling}`)
      .join(',');
    return `${event.hand}:${event.onsetTick}:${event.durationTick}:${pitches || 'R'}`;
  }).join(';');
  return `v1|meter=${piece.meter.num}/${piece.meter.den}|tpq=${piece.ticksPerQuarter}|key=${piece.key.keyN}:${piece.key.tonic}:${piece.key.mode}|bars=${piece.bars}|events=${events}`;
}

export function srtFingerprint(piece: SightReadingPiece): string {
  const bytes = new TextEncoder().encode(srtCanonicalString(piece));
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return `v1:${hash.toString(16).padStart(16, '0')}`;
}

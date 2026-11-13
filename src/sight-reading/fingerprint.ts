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

function hashText(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

export function srtFingerprint(piece: SightReadingPiece): string {
  return `v1:${hashText(srtCanonicalString(piece))}`;
}

/** What the fingerprint of a level piece reads: the notes as written, not the level or the seed. */
export type FingerprintedPiece = {
  readonly meter: { readonly num: number; readonly den: number };
  readonly ticksPerQuarter: number;
  readonly key: { readonly keyN: number; readonly tonic: string; readonly mode: string };
  readonly bars: number;
  readonly events: readonly SightReadingEvent[];
};

/**
 * The fingerprint of a level piece (generator version 2). The prefix differs from the older pieces,
 * so the two kinds can never be taken for each other in the ledger.
 */
export function srtLevelFingerprint(piece: FingerprintedPiece): string {
  const events = [...piece.events].sort(eventSort).map((event) => {
    const pitches = [...event.pitches].sort((a, b) => a.midi - b.midi || a.spelling.localeCompare(b.spelling))
      .map((pitch) => `${pitch.midi}:${pitch.spelling}`).join(',');
    return `${event.hand}:${event.onsetTick}:${event.durationTick}:${pitches || 'R'}`;
  }).join(';');
  return `v2:${hashText(`v2|meter=${piece.meter.num}/${piece.meter.den}|tpq=${piece.ticksPerQuarter}|key=${piece.key.keyN}:${piece.key.tonic}:${piece.key.mode}|bars=${piece.bars}|events=${events}`)}`;
}

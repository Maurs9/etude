import type { DifficultyInput, DifficultyNote, DifficultyRest } from '../domain/score-difficulty.js';
import { srtLevel, srtMeterTicks, srtPitchPlace } from './levels.js';
import type { PlannedPiece } from './patterns.js';

const DOTTED = new Set([0.375, 0.75, 1.5, 3, 6]);

/** Makes the generated book available to the experimental scorer without changing rule G14. */
export function levelPieceToDifficultyInput(piece: PlannedPiece): DifficultyInput {
  const ticks = piece.ticksPerQuarter;
  const { bar, beat } = srtMeterTicks(piece.meter);
  const nominalBpm = srtLevel(piece.level).bpm;
  const secondsPerQuarter = 60 / nominalBpm;
  const measureSize = bar / ticks, groupSize = beat / ticks;
  const groups = Array.from({ length: bar / beat }, () => groupSize);
  const measures = Array.from({ length: piece.bars }, (_, i) => ({
    start: i * measureSize,
    end: (i + 1) * measureSize,
    startSec: i * measureSize * secondsPerQuarter,
    endSec: (i + 1) * measureSize * secondsPerQuarter,
    groups,
    writtenIndex: i,
    fifths: piece.key.keyN,
  }));
  const notes: DifficultyNote[] = [], rests: DifficultyRest[] = [];
  for (const event of piece.events) {
    const start = event.onsetTick / ticks, duration = event.durationTick / ticks;
    const end = start + duration;
    if (event.pitches.length === 0) {
      const wholeMeasure = event.onsetTick % bar === 0 && event.durationTick === bar;
      const pickupPadding = piece.upbeat && event.onsetTick === 0;
      rests.push({ start, end, hand: event.hand, voice: event.hand, active: !wholeMeasure && !pickupPadding });
      continue;
    }
    const tiedAcrossBar = event.onsetTick % bar + event.durationTick > bar;
    for (const pitch of event.pitches) {
      const place = srtPitchPlace(pitch, piece.key, event.hand);
      notes.push({
        start, end, startSec: start * secondsPerQuarter, midi: pitch.midi, hand: event.hand, voice: event.hand,
        degree: place?.degree, finger: pitch.finger ?? undefined, accidentals: place?.alter ? 1 : 0,
        tiedAcrossBar, dotted: !tiedAcrossBar && DOTTED.has(duration),
      });
    }
  }
  return { measures, notes, rests, tempoSource: 'reference', voiceSource: 'written' };
}

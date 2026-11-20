import { estimateScoreDifficulty } from '../domain/score-difficulty.js';
import { srtBookPrints } from './book.js';
import { levelPieceToDifficultyInput } from './difficulty.js';
import { srtLevelFingerprint } from './fingerprint.js';
import { srtKeyPool, type ReadingKeyId } from './levels.js';
import { srtGenerateLevelPiece, srtHashText } from './melody.js';
import type { GeneratedPiece } from './rules.js';

const CANDIDATES = 5;
const MAX_TRIES = 15;

/** Select from valid new level pieces by their experimental structural score. Numbered books use their own generator. */
export function srtScoredExercise(level: number, key: ReadingKeyId | null, seed: number, seen: ReadonlySet<string>) {
  const keys = srtKeyPool(level);
  const selectedKey = key ?? keys[(seed >>> 0) % keys.length].id;
  const book = srtBookPrints(level), taken = new Set<string>();
  const candidates: { piece: GeneratedPiece; score: number; fingerprint: string }[] = [];
  for (let salt = 0; salt < MAX_TRIES && candidates.length < CANDIDATES; salt++) {
    const name = `scored-v1|${level}|${selectedKey}|${seed}|${salt}`;
    let piece: GeneratedPiece;
    try {
      piece = srtGenerateLevelPiece(level, selectedKey, srtHashText(name));
    } catch (error) {
      if (error instanceof RangeError) throw error;
      continue;
    }
    const fingerprint = srtLevelFingerprint(piece);
    if (seen.has(fingerprint) || book.has(fingerprint) || taken.has(fingerprint)) continue;
    taken.add(fingerprint);
    const score = estimateScoreDifficulty(levelPieceToDifficultyInput(piece), 'sightReading').score;
    candidates.push({ piece, score, fingerprint });
  }
  if (candidates.length < 3) return null;
  candidates.sort((a, b) => a.score - b.score || a.fingerprint.localeCompare(b.fingerprint));
  return { ...candidates[Math.floor(candidates.length / 2)], scores: candidates.map(candidate => candidate.score) };
}

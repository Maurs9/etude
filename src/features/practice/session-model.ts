import type { ChordTier, IntervalStyle, MelodyDifficulty, ScaleTier, TrainerSessionTarget } from '../../domain/views.js';
export type { ChordTier, IntervalStyle, MelodyDifficulty, ScaleTier, TrainerSessionTarget };
import { type TrainerItem } from '../../core/trainer-items.js';
import type { PracticeHintDiagram, PracticeHintNote } from '../../domain/practice-hints.js';
import { type FeedbackSketch } from '../../domain/feedback.js';

/* ============================================================================
   SESSION ENGINE  (interleaved, adaptive, with feedback + elaboration)
   ============================================================================ */
export interface EarKeysNote { m: number; t: number; }
export type EarKeysPrompt = { kind: 'iv'; target: number[]; n: number; } | { kind: 'ch'; target: number[]; inv: number; pcs: number[]; n: number; } | { kind: 'mel'; target: number[]; n: number; };
export type EarKeysState = EarKeysPrompt & { tries: number; seq: EarKeysNote[]; off: number; armAt: number; goT: ReturnType<typeof setTimeout> | number; won: boolean; warned: boolean; played?: number[]; };
// dir: an interval by ear played downwards ('desc'); without it, upwards.
export interface TrainerQuestion { it: TrainerItem; mode: string; key: number; idx: number; anchor: number | null; missed: boolean; hinted: boolean; offs?: number[]; ek?: EarKeysState | null; given?: TrainerGiven | null; wasWrong?: boolean; dir?: 'asc' | 'desc'; ivStyle?: IntervalStyle; placementKnown?: boolean; verdictText?: () => string; }
// A wrong answer: what was given against what was expected, both sounds for Hear both, and the item taken for this one (`pair`).
export interface TrainerGiven { text: () => string; given: FeedbackSketch; expected: FeedbackSketch; pair?: string; }
// dir: the Direction an Intervals by-ear drill plays its intervals in ('both' picks one per question).
// contrast: a short drill on two items the last session mixed up (its question order, by item id).
export interface TrainerSessionState { active: boolean; queue: (TrainerQuestion | undefined)[]; idx: number; correct: number; total: number; q: TrainerQuestion | null; answered: boolean; targeted: TrainerSessionTarget | null; placement: boolean; promptT: ReturnType<typeof setTimeout> | 0; contrast: { a: string; b: string; order: string[] } | null; }
/* ---------- SONGS moved to src/features/practice/song-book.ts ---------- */

export interface PracticeHintPreview {
    id: string;
    controlId: string;
    keys: boolean | null;
    frame: number;
    notes: readonly PracticeHintNote[];
    originalLow: number | null;
    diagramKey?: string;
    diagram?: PracticeHintDiagram;
}
/* ---------- PRACTICE: setup mode and hints ---------- */
// The setup screen holds one choice: the topic in #pr-cat, the mode in #pr-mode (aria-pressed) and the key in #pr-key.
// #pr-cat and #pr-key are hidden; the topic cards and key chips are their only visible controls. Every caller
// (the Today Ear row, Progress "Needs work", Learn links, Continue, tests) changes the choice through prSetTopic,
// prSetMode and prSetKey, and reads it through prChoice. Intervals by ear also take a Direction (prSetDir, #pr-dir),
// and Intervals show the Song hints panel (#pr-songs, renderSongs). Progressions add a fourth mode, Play along: no drill,
// the accompaniment loop (#pr-along), started and stopped by the Start button.
export type PracticeMode = 'play' | 'ear' | 'keys' | 'along' | 'tech';

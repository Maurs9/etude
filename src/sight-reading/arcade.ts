/* Pure scoring and pacing for the arcade modes of the reading drills: Survival, Time Attack and Marathon. */

export type SightReadingArcadeMode = 'survival' | 'timeAttack' | 'marathon';
export type SightReadingArcadeOutcome = 'correct' | 'wrong' | 'timeout';
export type SightReadingMarathonBars = 16 | 32 | 64;

export interface SightReadingArcadeOptions {
  /** Reaction window per note at the start of the run, in ms; also the reference for the speed bonus. */
  readonly targetMs?: number;
  readonly marathonBars?: SightReadingMarathonBars;
}

export interface SightReadingArcadeState {
  readonly mode: SightReadingArcadeMode;
  readonly startedAtMs: number;
  /** When the run ended; null while it is still running. */
  readonly endedAtMs: number | null;
  /** Time Attack only: when the clock runs out. */
  readonly deadlineMs: number | null;
  readonly targetMs: number;
  readonly lives: number | null;
  readonly combo: number;
  readonly bestCombo: number;
  readonly score: number;
  readonly correct: number;
  /** Wrong answers and timeouts. */
  readonly mistakes: number;
  readonly timeouts: number;
  readonly totalReactionMs: number;
  readonly marathonBars: SightReadingMarathonBars | null;
  /** Marathon only: how many notes the run has. */
  readonly total: number | null;
  readonly completed: boolean;
}

export interface SightReadingArcadeSummary {
  readonly mode: SightReadingArcadeMode;
  readonly score: number;
  readonly correct: number;
  readonly mistakes: number;
  readonly timeouts: number;
  readonly answered: number;
  /** Share of answered notes that were right, from 0 to 1. */
  readonly accuracy: number | null;
  readonly bestCombo: number;
  readonly averageReactionMs: number | null;
  readonly elapsedMs: number;
  /** Correct notes per minute. */
  readonly notesPerMinute: number | null;
  readonly lives: number | null;
  readonly completed: boolean;
}

export const ARCADE_LIVES = 3;
export const ARCADE_START_TARGET_MS = 3000;
export const ARCADE_MIN_TARGET_MS = 750;
export const ARCADE_SPEEDUP = 0.94;
/** Correct answers in a row that speed up Survival or add time in Time Attack. */
export const ARCADE_STREAK = 10;
export const TIME_ATTACK_MS = 90_000;
export const TIME_ATTACK_BONUS_MS = 5000;
export const MARATHON_NOTES_PER_BAR = 4;

const MODES: readonly string[] = ['survival', 'timeAttack', 'marathon'];
const OUTCOMES: readonly string[] = ['correct', 'wrong', 'timeout'];
const BARS: readonly number[] = [16, 32, 64];

export function srtIsArcadeMode(mode: unknown): mode is SightReadingArcadeMode {
  return typeof mode === 'string' && MODES.includes(mode);
}

export function srtIsMarathonBars(bars: unknown): bars is SightReadingMarathonBars {
  return typeof bars === 'number' && BARS.includes(bars);
}

function assertTime(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a finite, non-negative number`);
}

export function srtArcadeMultiplier(combo: number): 1 | 2 | 3 | 4 {
  if (!Number.isInteger(combo) || combo < 0) throw new RangeError('combo must be a non-negative integer');
  if (combo >= 30) return 4;
  if (combo >= 15) return 3;
  if (combo >= 5) return 2;
  return 1;
}

export function srtArcadeStart(
  mode: SightReadingArcadeMode,
  startedAtMs: number,
  options: SightReadingArcadeOptions = {},
): SightReadingArcadeState {
  if (!srtIsArcadeMode(mode)) throw new RangeError(`unknown arcade mode: ${String(mode)}`);
  assertTime(startedAtMs, 'startedAtMs');
  const targetMs = options.targetMs ?? ARCADE_START_TARGET_MS;
  if (!Number.isFinite(targetMs) || targetMs <= 0) throw new RangeError('targetMs must be a finite, positive number');
  const bars = options.marathonBars ?? 16;
  if (!srtIsMarathonBars(bars)) throw new RangeError('marathonBars must be 16, 32 or 64');
  return {
    mode,
    startedAtMs,
    endedAtMs: null,
    deadlineMs: mode === 'timeAttack' ? startedAtMs + TIME_ATTACK_MS : null,
    targetMs,
    lives: mode === 'survival' ? ARCADE_LIVES : null,
    combo: 0,
    bestCombo: 0,
    score: 0,
    correct: 0,
    mistakes: 0,
    timeouts: 0,
    totalReactionMs: 0,
    marathonBars: mode === 'marathon' ? bars : null,
    total: mode === 'marathon' ? bars * MARATHON_NOTES_PER_BAR : null,
    completed: false,
  };
}

/** Points for a correct answer: (100 + speed bonus 0..100) × combo multiplier. */
export function srtArcadePoints(targetMs: number, reactionMs: number, combo: number): number {
  const speedBonus = Math.max(0, Math.min(100, Math.round(100 * (targetMs - reactionMs) / targetMs)));
  return (100 + speedBonus) * srtArcadeMultiplier(combo);
}

export function srtArcadeRecord(
  state: SightReadingArcadeState,
  outcome: SightReadingArcadeOutcome,
  reactionMs: number,
  nowMs: number,
): SightReadingArcadeState {
  if (!OUTCOMES.includes(outcome)) throw new RangeError(`unknown outcome: ${String(outcome)}`);
  assertTime(reactionMs, 'reactionMs');
  assertTime(nowMs, 'nowMs');
  if (state.completed) return state;
  if (state.deadlineMs !== null && nowMs >= state.deadlineMs) {
    return { ...state, completed: true, endedAtMs: state.deadlineMs };
  }
  if (outcome !== 'correct') {
    const lives = state.lives === null ? null : Math.max(0, state.lives - 1);
    const mistakes = state.mistakes + 1;
    const completed = lives === 0 || (state.total !== null && state.correct + mistakes >= state.total);
    return {
      ...state,
      lives,
      combo: 0,
      mistakes,
      timeouts: state.timeouts + (outcome === 'timeout' ? 1 : 0),
      completed,
      endedAtMs: completed ? nowMs : null,
    };
  }
  const combo = state.combo + 1;
  const streak = combo % ARCADE_STREAK === 0;
  const correct = state.correct + 1;
  const completed = state.total !== null && correct + state.mistakes >= state.total;
  return {
    ...state,
    deadlineMs: state.mode === 'timeAttack' && streak && state.deadlineMs !== null
      ? state.deadlineMs + TIME_ATTACK_BONUS_MS
      : state.deadlineMs,
    targetMs: state.mode === 'survival' && streak
      ? Math.min(state.targetMs, Math.max(ARCADE_MIN_TARGET_MS, Math.round(state.targetMs * ARCADE_SPEEDUP)))
      : state.targetMs,
    combo,
    bestCombo: Math.max(state.bestCombo, combo),
    score: state.score + srtArcadePoints(state.targetMs, reactionMs, combo),
    correct,
    totalReactionMs: state.totalReactionMs + reactionMs,
    completed,
    endedAtMs: completed ? nowMs : null,
  };
}

/** Time Attack only: ms left on the clock, or null for the other modes. */
export function srtArcadeRemainingMs(state: SightReadingArcadeState, nowMs: number): number | null {
  if (state.deadlineMs === null) return null;
  return Math.max(0, state.deadlineMs - (state.endedAtMs ?? nowMs));
}

export function srtArcadeComplete(state: SightReadingArcadeState, nowMs: number): SightReadingArcadeState {
  assertTime(nowMs, 'nowMs');
  if (state.completed) return state;
  return { ...state, completed: true, endedAtMs: state.deadlineMs === null ? nowMs : Math.min(nowMs, state.deadlineMs) };
}

export function srtArcadeSummary(state: SightReadingArcadeState, nowMs: number): SightReadingArcadeSummary {
  assertTime(nowMs, 'nowMs');
  const end = state.endedAtMs ?? (state.deadlineMs === null ? nowMs : Math.min(nowMs, state.deadlineMs));
  const elapsedMs = Math.max(0, end - state.startedAtMs);
  const answered = state.correct + state.mistakes;
  return {
    mode: state.mode,
    score: state.score,
    correct: state.correct,
    mistakes: state.mistakes,
    timeouts: state.timeouts,
    answered,
    accuracy: answered ? state.correct / answered : null,
    bestCombo: state.bestCombo,
    averageReactionMs: state.correct ? state.totalReactionMs / state.correct : null,
    elapsedMs,
    notesPerMinute: elapsedMs ? state.correct * 60_000 / elapsedMs : null,
    lives: state.lives,
    completed: state.completed,
  };
}

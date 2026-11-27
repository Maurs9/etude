
import { type ReadClefDraw, type ReadClefStaff, type ReadDrillChordQuality, type ReadDrillLevel, type ReadDrillType } from '../../core/reading-curriculum.js';
import { type SrBeatX, type SrLayout, type SrPiece, type SrRenderResult, type SrStaffNote, type SrToken } from '../../domain/score-types.js';
import { type CoachTip } from '../../domain/views.js';
import { type SightReadingEvaluation } from '../../sight-reading/evaluate.js';
import { type SightReadingPiece } from '../../sight-reading/model.js';
import { type ReadingKeyId } from '../../sight-reading/levels.js';
import { type WarmupStep } from '../../sight-reading/warmup.js';
import type { GeneratedPiece } from '../../sight-reading/rules.js';
import { type SightReadingAttempt, type SightReadingAttemptLease } from '../../sight-reading/ledger.js';
import { type SightReadingState } from '../../sight-reading/flow.js';
import { type SightReadingArcadeMode, type SightReadingArcadeState, type SightReadingMarathonBars } from '../../sight-reading/arcade.js';

/* ============================================================================
   READ & PLAY — the sight-reading engine. Grand staff engraver (reuses the ss glyphs)
   + step-by-step / assessment / listen modes for generated melodies.
   The graded repertoire (PIECES) is played in the Pieces screen (view `analysis`).
   ============================================================================ */
/** The notes that sound together at one beat (one Learn-mode step). */
export interface SrStep { beat: number; notes: SrStaffNote[]; closed?: boolean }
/** A wrong key in Learn mode, classified (`k`) against the expected note `n`. */
export interface SrSlip { k: string; n: SrStaffNote; m: number }
export interface SrState {
    piece: SrPiece | null; hands: string; modeSel: string; names: boolean; anyOctave: boolean; instantFeedback: boolean; active: boolean; assessOn: boolean;
    notes: SrStaffNote[]; steps: SrStep[]; stepIdx: number; results: Record<number, string>; mistakes: number; wrongExtra: number;
    beatX: SrBeatX[]; totalBeats: number; render: SrRenderResult | null; raf: number; timers: ReturnType<typeof setTimeout>[]; nodes: OscillatorNode[];
    bpm: number; t0: number; next: CoachTip | null; errs: Record<string, number> | null; slipKey: SrSlip | null;
    gen?: SrPiece | null; listening?: boolean;
    srtPiece?: SightReadingPiece | null; srtFingerprint?: string | null; srtState?: SightReadingState;
    srtOwnerTabId?: string; srtAttemptStartedAt?: number; srtPreviewTimer?: number; srtCountdown?: number; srtLease?: SightReadingAttemptLease | null; srtPendingAttempt?: SightReadingAttempt | null;
    srtEvaluation?: SightReadingEvaluation | null; srtResultValue?: number | null; srtResultLevelId?: string | null;
    /** A level piece of the book, a key run or the daily set (the Read home's player); null for the older melodies. */
    lvPiece?: GeneratedPiece | null;
}
/** The Read tab's screens: the home (the default each time the tab opens), the old drills and melody screens, and the
 *  player of a level piece. `ctx` says which numbered piece the player shows. */
export type RdnScreen = 'home' | 'drills' | 'melody' | 'player' | 'warmup';
export type RdnCtx = { kind: 'book'; level: number; number: number } | { kind: 'focus'; level: number; key: ReadingKeyId; number: number } | { kind: 'daily'; date: string; slot: number }
    // A long piece that gets harder as it goes: the `index`-th of the day.
    | { kind: 'long'; date: string; level: number; key: ReadingKeyId; index: number }
    | { kind: 'scored'; piece: GeneratedPiece };
/** `learn`: the score and stars of a finished Step-by-step run, shown on the result card instead of an evaluation. */
/** `autoWait`: auto-next waits for a first-sight result to be saved. `playerMode`: the mode chosen for level pieces.
 *  `melodyMode`: the old melody screen's mode, kept while the player shows a level piece.
 *  `opener`: a selector for the control that left the home, focused again on the way back.
 *  `noDaily`: today's set could not be made. `ready`: the status line the player shows before an attempt. */
export interface RdnState { screen: RdnScreen; fresh: boolean; ctx: RdnCtx | null; autoTimer: number; autoLeft: number; retries: number; learn: { acc: number; stars: 0 | 1 | 2 | 3 } | null;
    autoWait: boolean; playerMode: string; melodyMode: string | null; opener: string; noDaily: boolean; ready: string }
/** The warm-up (spec section 9): its steps, where it is, and the flash card in play. `phase` is 'show' (the bar is visible),
 *  'play' (hidden, notes are collected), 'result' (shown again with a mark), 'drill' (an existing drill runs the step), or
 *  'idle'. `limit` is how many answers (or rhythm exercises) end a drill step. */
export type RdnWarmPhase = 'idle' | 'show' | 'play' | 'result' | 'drill';
export interface RdnWarmState { on: boolean; level: number; key: string; steps: readonly WarmupStep[]; step: number; card: number; phase: RdnWarmPhase;
    again: boolean; clean: number; played: number[][]; lastAt: number; strict: boolean; ok: boolean; timer: number; chordTimer: number; limit: number; tally: number[] }
export type SrtAttemptCleanup = {
    readonly attemptId: string;
    readonly ownerTabId: string;
    readonly generation: string;
    readonly lease: SightReadingAttemptLease | null;
    readonly mixedInput: boolean;
};
export interface SrSvgNoteRef {
    g: SVGElement;
    title: SVGTitleElement;
    sym: SVGTextElement;
}
export interface SrSvgCacheEntry {
    notes: Map<number, SrSvgNoteRef>;
    playhead: SVGLineElement | null;
    extras: SVGGElement | null;
}
export type SrtStopReason = 'interrupt' | 'navigate';
export type SrtLedgerFailureReason = 'stale_generation' | 'owner_mismatch' | 'already_exposed' | 'conflict' | 'quota' | 'storage' | 'unsupported';
export type SrtLedgerFailureContext = 'start' | 'pending' | 'practice-switch';
export type SrNoteStartEvent = { kind: 'on' | 'off'; midi: number; source: string; releaseKind: 'physical' | 'focus' | 'reset' | null; perf: number };
export interface RdKeyInfo { tonicPc: number; minor: boolean; flat: boolean; keyN: number; }
export interface ReadDrillPitch { li: number; oct: number; acc: number; }
export interface ReadDrillStaffNote { li: number; oct: number; acc?: number; s?: string | null; hc?: string | null; tip?: string; staff?: ReadClefStaff; cn?: boolean; }
// ext: notes that only reserve vertical room; hl: column to highlight; ghost: draw the pacer; wrap: class of a group around the notes; bars: columns that start a bar.
export interface ReadDrillSvgOptions { clef: ReadClefDraw; keyN?: number; cols: ReadDrillStaffNote[][]; minW?: number; aria?: string; colW?: number; lbl?: (string | number | null | undefined)[] | null; scale?: number; dur?: number; lblCls?: (string | null | undefined)[]; ext?: ReadDrillStaffNote[]; hl?: number | null; ghost?: boolean; wrap?: string; bars?: boolean[]; }
export interface ReadDrillSvgItem { n: ReadDrillStaffNote; ii: number; c: ReadClefStaff; top: number; step: number; y: number; dx: number; ax?: number; }
// 'test' is the graded run of rhythm and sight-reading levels; the other levels earn their stars in Practice.
export type ReadDrillMode = 'practice' | 'test' | SightReadingArcadeMode;
// arc: the arcade run (Survival, Time Attack, Marathon); bars: the Marathon length last chosen; limT: Survival's per-note time limit;
// tout: the last answer was a timeout; arcFx: what the last answer earned (a Time Attack bonus or a faster Survival pace); limF: Survival's time bar when the note was answered.
// chk: Practice's star check, the last RD_CHECK_N first answers (a hinted one counts as wrong); chkBest: the best stars it gave this run, null until it is full;
// chkNew: stars just earned, still to announce; awT: hides the "earned" notice.
export interface ReadDrillState { on: boolean; L: ReadDrillLevel | null; mode: ReadDrillMode; q: ReadQuestion | null; n: number; ok: number; ms: number; streak: number; best: number; t0: number; answered: boolean; timers: ReturnType<typeof setTimeout>[]; lastK: string | null; accSel: number; miss: { [questionKey: string]: number; }; rushEnd: number; rushIv: ReturnType<typeof setInterval> | number; rh: RdRhythmState | null; rhP: number[]; rhM: number[]; next: CoachTip | null; nodes: OscillatorNode[]; hintT?: ReturnType<typeof setTimeout>; flow: ReadDrillFlow | null; fix: boolean; arc: SightReadingArcadeState | null; bars: SightReadingMarathonBars; limT?: ReturnType<typeof setTimeout>; tout: boolean; arcFx: '' | 'bonus' | 'faster'; limF: number; chk: { ok: boolean; ms: number; }[]; chkBest: number | null; chkNew: number; awT?: ReturnType<typeof setTimeout>; }
export interface ReadQuestionBase { key: string; hinted?: boolean; state?: 'good' | 'bad' | null; lbl?: string; }
export interface ReadQuestionKs extends ReadQuestionBase { ty: 'ks'; clef: ReadClefDraw; keyN: number; ans: number; opts: { v: number; l: string; s: string; }[]; midis?: undefined; }
export interface ReadQuestionIv extends ReadQuestionBase { ty: 'iv'; clef: ReadClefStaff; ans: number; a: ReadDrillPitch; b: ReadDrillPitch; harm: boolean; opts: { v: number; l: string; k: string; }[]; midis: number[]; }
export interface ReadQuestionCh extends ReadQuestionBase { ty: 'ch'; clef: ReadClefStaff; ans: string; root: ReadDrillPitch; qual: ReadDrillChordQuality; inv: number; notes: ReadDrillPitch[]; opts: { v: string; l: string; }[]; midis: number[]; pcs: number[]; }
export interface ReadQuestionNote extends ReadQuestionBase { ty: Exclude<ReadDrillType, 'ks' | 'iv' | 'ch'>; clef: ReadClefDraw; keyN: number; note: ReadDrillPitch; sclef: ReadClefStaff; midi: number; midis: number[]; needAcc: boolean; opts?: { v: number; n: ReadDrillPitch; }[]; ans?: number; cn?: boolean; }
export type ReadQuestion = ReadQuestionKs | ReadQuestionIv | ReadQuestionCh | ReadQuestionNote;
// Reading drills mark the dock keyboard. Play drills fold their marks into its octaves; key-to-staff marks stay on the exact key (`exact`),
// since there the octave is part of the question. Only keys marked here are cleared again, a rebuilt keyboard gets them back, and a
// wrong key never hides the mark of the right one when both land on the same key.
export type ReadDockMark = 'target' | 'good' | 'bad';
export interface ReadDrillButton { v: number | string; l?: string; html?: string; k?: string; s?: string; }
/* ---- look-ahead stream: name and play drills as a row of notes read from left to right ---- */
// items: every note of the run so far; cur: the note to answer; start: the first note on screen.
// played, wrong: the key or letters given wrongly for the current note, shown until it is answered right.
// ext: the pool's lowest and highest notes, which keep the staff's height steady.
// g0: when the pacer ghost set off; gd: notes the player leads it by; gh: the ghost is shown; rm: reduced motion.
export interface ReadDrillFlow { items: ReadQuestionNote[]; cur: number; start: number; played: number | null; wrong: string[]; ext: ReadDrillPitch[]; g0: number; raf: number; gd: number; gh: boolean; rm: boolean; geo: { x0: number; colW: number; n: number; }; ghostEl?: Element | null; }
export interface ReadDrillGiven { btn?: Element; midi?: number; }
/* ---- rhythm reading: tap the rhythm against a metronome ---- */
export type RdRhythmUnit = '4' | '2' | '1' | '8' | 'r4' | 'd' | '16';
// One written note or rest of a rhythm exercise, in beats from the start of the first bar.
export interface RdRhythmEvent { beat: number; dur: number; rest: boolean; u?: RdRhythmUnit; }
// How one written onset was met: good/near/bad, and how far off the matched tap was in ms (null when nothing matched).
export interface RdRhythmTapResult { s: string; off: number | null; }
// Tap-only grading: per-onset results, the count of extra taps, the score in % and the mean offset in ms.
export interface RdRhythmTapGrade { res: RdRhythmTapResult[]; extra: number; good: number; near: number; pct: number; mean: number; }
export type RdLeftHandPattern = 'whole' | 'half' | 'pulse' | 'onethree' | 'twofour';
// What srRender returns that a rhythm exercise reads back: the staff, its vertical extent, beat → x anchors and the drawn notes.
export interface RdRhythmRender { svg: string; yTop: number; yBot: number; beatX: { b: number; x: number; }[]; notes: { nid: number; hand: string; beat: number; }[]; }
// The piece handed to srRender for a rhythm exercise: percussion notes on B4 (right hand) and D3 (left hand), or rests.
export interface RdRhythmPiece { id: string; perc: boolean; noNames: boolean; ts: number[]; keyN: number; bpm: number; rh: [string, number][]; lh?: [string, number][]; }
// One key press (or pad tap) in beats from the downbeat; off stays null until it is released.
export interface RdRhythmPress { src: string; hand: 'L' | 'R'; on: number; off: number | null; }
export type RdRhythmGrade = RdRhythmTapGrade | RdRhythmAllGrade;
// The rhythm exercise on show (RD.rh): what is written, how it was drawn, and the presses of the current run.
export interface RdRhythmState { ev: RdRhythmEvent[]; lh: RdRhythmEvent[] | null; r: RdRhythmRender; dur: boolean; two: boolean; on: number[]; taps: number[]; presses: RdRhythmPress[]; open: Map<string, RdRhythmPress>; playing: boolean; graded: RdRhythmGrade | null; raf: number; listen: boolean; t0: number; piece: RdRhythmPiece; paper: SrLayout | undefined; }
// One written note of a hand: its onset grade and offset in ms, and (when lengths are graded) its release grade and offset.
export interface RdRhythmNoteResult { e: RdRhythmEvent; s: string; off: number | null; rs: string | null; roff: number | null; }
// One hand's grading: onsets and (with dur) lengths, as counts, a weighted score, the % and the mean onset offset in ms.
export interface RdRhythmHandGrade { res: RdRhythmNoteResult[]; N: number; good: number; near: number; extra: number; score: number; dur: boolean; lenOk: number; early: number; late: number; mean: number; pct: number; }
export type RdRhythmCountKey = 'N' | 'good' | 'near' | 'extra' | 'lenOk' | 'early' | 'late' | 'score';
// Grading with lengths and/or both hands: the per-hand grades and their totals.
export interface RdRhythmAllGrade { by: { R?: RdRhythmHandGrade; L?: RdRhythmHandGrade; }; N: number; good: number; near: number; extra: number; lenOk: number; early: number; late: number; res: RdRhythmNoteResult[]; mean: number; pct: number; }
/* ---- generated sight-reading melodies (played in the Read & play engine) ---- */
// A sight-reading level: its keys (as signature counts), range, note lengths in beats and tempo.
export interface RdSightLevel { keys: number[]; lo: string; hi: string; durs: number[]; id: string; n: number; bpm: number; clef?: string; }
// A generated melody, shaped like a Read & play piece; rh/lh hold [pitch name, beats] pairs.
export interface RdSightPiece { id: string; ephemeral: boolean; gen: string; comp: string; level: number; keyN: number; ts: number[]; bpm: number; t: { en: string; ro: string; }; minor?: boolean; rh?: SrToken[]; lh?: SrToken[]; }
/** A step of today's reading. `off`: it cannot be done today (no set could be made). */
export type RdnPlanItem = { id: string; focus: string; done: boolean; partial?: boolean; prog?: number; pill?: string; t: string; d: string; dId?: string; off?: boolean };

import * as theory from '../../domain/theory.js';
import type { TimedSustain } from '../../domain/practice-scoring.js';
import type { MeasureMistakeGroup, PracticeMistakeEvent } from '../../domain/practice-mistakes.js';
import type * as notationApi from '../../domain/notation.js';
import { type AnHand, type AnHandAssignment, type AnNote, type AnParsedMidi, type AnParsedNote, type AnSource, type ScoreMeasure } from '../../domain/score-types.js';
import type { AnHarmonySeg, AnMotif } from '../../domain/score-harmony.js';
import type { ScoreGeometry, ScoreSym } from '../../domain/score-symbols.js';
import { PIECES } from '../../domain/repertoire-data.js';
import { srEvents } from '../../domain/grand-staff.js';
import type { LibraryMetadata } from '../../domain/score-library-types.js';

const anKeyRank = theory.anKeyRank;

/* ---------- SCORE & ANALYSIS ---------- */
// Everything the analysis workspace shows for one scope (see anCompute).
export interface AnAnalysisModel {
    ns: AnNote[]; lo: number; hi: number; pitches: number[]; poly: { avg: number; max: number }; implied: boolean; segs: AnHarmonySeg[]; ms: ScoreMeasure[];
    beats: number; onsets: number; tempos: number[]; hands: string; rh: number; lh: number; key: { best: theory.KeyRank; alts: theory.KeyRank[]; conf: string };
    mainKey: theory.KeySignature; motifs: AnMotif[]; seconds: number;
}
export interface AnState {
    notes: AnNote[]; selected: Set<number>; selMode: 'lasso' | 'box'; tool: 'hand' | 'select'; active: { kind: string; k: number } | null; source: AnSource | null; recon: { hands: string; grid: number; key: string };
    hands: AnHandAssignment | null; keyMap: (theory.KeySignature & { beat: number })[]; keyOrigin: string; index: Map<AnNote, number>; version: number;
    cache: Map<string, AnAnalysisModel>; view: AnAnalysisModel | null; wsSig: string; rove: number; playSeg: number; playSig: string; kbCenter: boolean;
    kbApplied: Map<number, string>; error: { k: string; a: string | number | undefined } | null; loading: boolean; loadToken: number;
    liveT?: ReturnType<typeof setTimeout>; pinRaf?: number;
}
export function defaultScoreTool(): 'hand' | 'select' {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches ? 'hand' : 'select';
}
export function anLibraryMetadata(source: AnSource): LibraryMetadata {
    const document = source.kind === 'xml' ? new DOMParser().parseFromString(source.xml, 'application/xml') : null;
    return { title: source.title, composer: document?.querySelector('identification > creator[type="composer"]')?.textContent?.trim() ?? '' };
}
export type AnScreen = 'catalog' | 'player';
export type AnCatalogTab = 'library' | 'builtin';
export interface AnListContext {
    fromList: boolean;
    scrollY: number;
    focusSelector: string | null;
    activeTab: AnCatalogTab;
}
// Built-in pieces become the same parsed structure as a MIDI file: one "track" per hand, beats in quarter notes.
// An upbeat stays at beat 0; anRebuild engraves it as a short bar 0 (see scoreFromMidi).
export function anPieceToParsed(p: (typeof PIECES)[number]): AnParsedMidi {
    const notes: AnParsedNote[] = [];
    ([['rh', 0], ['lh', 1]] as const).forEach(([hand, track]) => { if (!p[hand])
        return; srEvents(p[hand]).ev.forEach((e) => { if (!e.rest)
        notes.push({ midi: e.midi, start: e.beat, end: e.beat + e.dur, vel: hand === 'rh' ? 92 : 74, track, channel: track, srcHand: hand }); }); });
    notes.sort((x, y) => x.start - y.start || x.midi - y.midi);
    return { ppq: 480, format: 1, tracks: notes.some((n) => n.track === 1) ? 2 : 1, names: ['Right hand', 'Left hand'], notes,
        meta: [{ type: 'tempo', beat: 0, bpm: p.bpm }, { type: 'time', beat: 0, num: p.ts[0], den: p.ts[1] }, { type: 'key', beat: 0, fifths: p.keyN || 0, minor: !!p.minor }] };
}
// Krumhansl–Kessler key profiles: unlike plain scale coverage, they tell a major key from its relative minor.
export const AN_PROFILE = { maj: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], min: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17] };
export function anKeyInfo(ns: readonly theory.TheoryNote[]) {
    const ranks = anKeyRank(ns), best = ranks[0], margin = best.score - ranks[1].score;
    const conf = ns.length < 12 ? 'low' : best.score >= 0.75 && margin >= 0.08 ? 'high' : best.score >= 0.6 && margin >= 0.03 ? 'medium' : 'low';
    return { best, alts: ranks.slice(1, 4), conf };
}
export function anMeasureIndex(ms: readonly ScoreMeasure[], beat: number) {
    let lo = 0, hi = ms.length - 1, idx = 0;
    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        if (ms[mid].start <= beat + 1e-6) {
            idx = mid;
            lo = mid + 1;
        }
        else {
            hi = mid - 1;
        }
    }
    return idx;
}
/* notation import / generation */
export interface ScoreCursorStyleState { w: string; h: string; transform: string; playing: boolean; }
export interface ScoreState {
    xml: string; engine: notationApi.ScoreRenderer | null; version: number; playGen: number; timers: ReturnType<typeof setTimeout>[]; playing: boolean; sel: boolean; loop: ScoreLoopState | null;
    tempos: { beat: number; bpm: number; }[]; tempoList: { beat: number; bpm: number; }[]; tempoTimes?: number[]; tempoTimesFor?: readonly { beat: number; bpm: number; }[] | null;
    tempoFromFile: boolean; measures: ScoreMeasure[]; midiGrid: number; lit: Set<number>;
    heads: Map<number, SVGElement[]>; followRaf: number; zoom: number; look: 'paper' | 'night'; layout: notationApi.ScoreLayoutMode; stale: boolean; layoutWidth: number;
    geo: ScoreGeometry | null; mrange: { anchor: number; a: number; b: number; sig: string; } | null; resume: { sel: boolean; run?: PracticeCarry | null; } | null; paused: boolean; cursorEl: HTMLDivElement | null;
    followSys: number; followCheckedAt: number; panAt: number; hl: boolean; run?: PracticeRun | null; syms?: ScoreSym[]; fixedWidth?: boolean; fit?: { key: string; step: number; on: boolean; } | null;
    markGeo?: ScoreGeometry | null; markSig?: string; renderedSig?: string; pedalsOk?: boolean; hasPaint?: boolean; cursorStyle?: ScoreCursorStyleState | null;
}
// sel: a note picked by hand (blue, like the playback line); lit: a sounding note, gold, only with "Highlight sounding notes" on
export const SCORE_LOOK = { paper: { bg: '#fffefa', ink: '#000000', staff: undefined, sel: '#1a6fe0', lit: '#a47720', ok: '#1b8f4c', bad: '#d22f2f', dim: '#b9b2a6' }, night: { bg: '#1d1a17', ink: '#ece5d8', staff: '#a1988a', sel: '#7fb2ff', lit: '#e8bb5c', ok: '#6fdc9a', bad: '#ff7a7a', dim: '#5d574f' } };
// The engraving rules Étude sets on OSMD (a type alias, so it passes as the renderer's rule record).
export type ScoreEngravingRules = {
    PageLeftMargin?: number; PageRightMargin?: number; PageTopMargin?: number; PageBottomMargin?: number; TitleTopDistance?: number; SystemComposerDistance?: number;
    MinimumDistanceBetweenSystems?: number; MinSkyBottomDistBetweenSystems?: number; BetweenStaffDistance?: number; StaffDistance?: number; MinSkyBottomDistBetweenStaves?: number;
    MeasureNumberLabelHeight?: number; InstrumentLabelTextHeight?: number; FixedMeasureWidth?: boolean; ChordSymbolYOffset?: number; FingeringOffsetY?: number;
    FingeringTextSize?: number; FingeringPaddingY?: number; SheetTitleHeight?: number; SheetSubtitleHeight?: number; SheetComposerHeight?: number;
    StaffLineColor?: string; RenderMeasureNumbersOnlyAtSystemStart?: boolean; MeasureNumberLabelOffset?: number;
};
export const SCORE_BASE_MARGINS = new WeakMap<object, {
    top?: number; title?: number; left?: number; right?: number;
}>();
// OSMD's title label is plain text. Restore safe MusicXML italic/bold runs after each layout (never inject markup).
// Page view of an imported file keeps its own <print new-system / new-page> breaks (MuseScore's 3–4 bars a line).
// Those breaks only help while the bars fit: note spacing tightens a step at a time until the engraver needs no
// extra break; past the last step it fills the lines itself rather than leave a lone bar after every forced break.
export const SC_FIT: [number, number, number][] = [[.85, 3, 2], [.7, 2.2, 1.6], [.58, 1.6, 1.3], [.48, 1.2, 1.1]];
// SVG user units of the page a node sits on, from screen pixels (OSMD draws 10 units per staff space).
export function scoreToUser(svg: SVGSVGElement, x: number, y: number) { const m = svg.getScreenCTM(); if (!m)
    return null; const p = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(m.inverse()); }
// A line the source file draws from note index a to note index b, with its kind and line style.
export interface ScoreCrossLink { a: number; b: number; kind: string; style?: string }
// Score geometry in OSMD units, relative to each page: a system's vertical extent, a measure's span and beats,
// and the onset anchors the playback cursor moves between.
// OSMD's iterator lists the voice entries drawn at its position; the bundled type leaves that method out.
export function scoreVisibleEntries(it: object): readonly unknown[] {
    if (!('CurrentVisibleVoiceEntries' in it) || typeof it.CurrentVisibleVoiceEntries !== 'function')
        return [];
    const list: unknown = it.CurrentVisibleVoiceEntries();
    return Array.isArray(list) ? list : [];
}
// Where the playback cursor stands: x in OSMD units on system `sys`.
export interface ScoreCursorPos { x: number; sys: number }
// Bars chosen on the score: the anchor bar, the span a..b (measure indices) and the selected notes it held.
export interface ScoreMeasureRange { anchor: number; a: number; b: number; sig: string }
// A running loop: score-time span a..b in seconds, its bar count, whether it is the A–B range, the pass and when the next one starts.
export interface ScoreLoopState { a: number; b: number; bars: string | undefined; ab: boolean; pass: number; notes: PracticeTimedNote[]; next: number }
/* practice engine: playback runs on audio-clock segments, score time t = t0 + (now − a0)·f.
   A loop queues its next pass as a new segment ahead of time; "Wait for me" freezes the clock at a barrier (the next note of
   the practised hand) until those keys are played. Notes are scheduled ~0.3 s ahead by a 25 ms tick. */
// Judgements counted in a practice run, and the share of notes hit in the current and the last loop pass.
export interface PracticeStats { perfect: number; good: number; miss: number; wrong: number; streak: number; best: number; passHit: number; passAll: number; lastPass: number | null; extraMidi?: number }
// The parts of an analysed note that practice playback reads.
// A note on the playback clock: its index i in AN.notes and its start, written end and sounding end in score seconds.
export interface PracticeTimedNote { n: AnNote; i: number; start: number; finish: number; sound?: number; unisons?: number[] }
// One stretch of the audio clock: score time t = t0 + (now − a0)·f, until t1.
export interface PracticeSegment { a0: number; t0: number; t1: number; f: number; first: boolean; p0?: number; elapsed0?: number }
// Wait barriers require fresh overlapping chord attacks; written arpeggios may be played successively.
export interface PracticeBarrier { allowed: Set<number>; attacks: Map<number, number>; attempts: number; rolled: Set<number>; t: number; need: Set<number>; got: Set<number>; group: PracticeTimedNote[]; seg: PracticeSegment; since: number }
export interface PracticeBeat { t: number; acc: boolean }
export interface PracticeCountIn { t: number; n: number; sec: number }
export interface PracticeStartOptions { notes: PracticeTimedNote[]; a: number; b: number; loop: boolean; sel: boolean; from: number; ab?: boolean; bars?: string; carry?: PracticeCarry | null }
export interface PracticeSustain { expected: TimedSustain[]; played: TimedSustain[]; midi: boolean }
// A running practice: its clock segments, scheduling cursors (ni notes, bi beats, mi my next note), the judgements and the tick timer.
// origin: where a run resumed after a pause first started (its from is where it resumed).
export interface PracticeRun extends PracticeStartOptions {
    sustain?: PracticeSustain;
    completed?: Set<number>;
    route?: { a: number; b: number }[];
    outputHistory?: PracticeSegment[];
    outputTime?: number;
    segs: PracticeSegment[]; ni: number; beats: PracticeBeat[]; bi: number; beat0: number; wt: number; pass: number; mine: PracticeTimedNote[]; mi: number;
    judged: Map<number, string>; mistakes: PracticeMistakeEvent[]; gen: number; ci: PracticeCountIn | null; timer: ReturnType<typeof setInterval> | 0; waitShown?: boolean; origin?: number;
}
// A whole-piece run held over a pause: what Play needs to carry on with the same run (pracStart), if nothing else changed.
export interface PracticeCarry {
    sustain?: PracticeSustain;
    pass?: number;
    completed?: Set<number>;
    route?: { a: number; b: number }[];
    notes: AnNote[]; src: AnSource | null; at: number; origin: number; hands: string; wait: boolean; f: number;
    judged: Map<number, string>; mistakes: PracticeMistakeEvent[]; stats: PracticeStats; active: boolean; res: Map<number, string>;
}
// The coaching tip shown after a run, with its optional one-click action.
export interface PracticeNextStep { k: string; args?: () => (string | number)[]; act?: { k: string; args?: () => (string | number)[]; run: () => void } | null }
export interface PracticeState {
    hands: string; wait: boolean; metro: boolean; metroOnly: boolean; countIn: boolean; acc: boolean; hear: boolean; expressive: boolean; ramp: boolean; A: number | null; B: number | null;
    labels: string; pal: string; range: string; fx: boolean; bar: PracticeBarrier | null; active: boolean; stats: PracticeStats | null;
    res: Map<number, string>; judge: string; judgeT: number; next: PracticeNextStep | null;
    lastMistakes?: MeasureMistakeGroup[];
    names: boolean; // note names on the engraved score (scoreNamesSync)
}
export const PRAC_FLAGS = ['wait', 'metro', 'metroOnly', 'countIn', 'acc', 'hear', 'expressive', 'ramp', 'fx', 'names'] as const;
export const PRAC_CHOICES = ['hands', 'labels', 'pal', 'range'] as const;
export function isPracFlag(k: string): k is typeof PRAC_FLAGS[number] { return PRAC_FLAGS.some((f) => f === k); }
export function isPracChoice(k: string): k is typeof PRAC_CHOICES[number] { return PRAC_CHOICES.some((f) => f === k); }
export const PRAC_KEY = 'etude-practice-v3';
export function pracSegAt(R: { segs: PracticeSegment[] }, now: number) { let s = R.segs[0]; for (const x of R.segs)
    if (x.a0 <= now + 1e-9)
        s = x; return s; }
export function pracRaw(R: { segs: PracticeSegment[] }, now: number) { const s = pracSegAt(R, now); return { s, t: s.t0 + Math.max(0, now - s.a0) * s.f }; }
// What a finished run saved, for the summary card: the best accuracy, whether it was beaten, and a first full Wait-for-me pass.
export interface PracticeSaved { best: number | null; newBest: boolean; learned: boolean; pending?: Promise<PracticeSaved | null> }
// Every note of my part judged: what a Wait for me pass needs to be complete, and a paused and resumed run to count.
export function pracEveryNote(R: PracticeRun) { return R.mine.length > 0 && R.mine.every((d) => R.judged.has(d.i) || R.completed?.has(d.i)); }
export function anClock(sec: number) { const s = Math.max(0, sec); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }
// The parts of a chord span (one segment of the harmonic analysis) that its descriptions read.
export interface AnSpanChordFacts { ch: { root: number; c: { s: string } }; bass: number | null }
export interface AnSpanBeatFacts { measure: { start: number }; unit: number; start: number; end: number }
export interface AnSpanNoteFacts { midi: number; hand?: AnHand | null }
export interface AnSpanNctFacts { type: string; note: { midi: number } }
export function anSegIndexAt(segs: readonly { start: number; end: number }[], beat: number) { let lo = 0, hi = segs.length - 1; while (lo <= hi) {
    const mid = (lo + hi) >> 1, s = segs[mid];
    if (beat < s.start - 1e-6)
        hi = mid - 1;
    else if (beat >= s.end - 1e-6)
        lo = mid + 1;
    else
        return mid;
} return -1; }
/* analysis panel: Now follows the bar or passage in focus, Piece is the whole-piece workspace, Practice holds the settings.
   Beside the score from 1000 px, a bottom sheet behind the floating Analysis button below that. */
export interface AnPanelSide {
    open: boolean;
    tab: string;
    w: number;
    sheet: boolean;
    drag: boolean;
    nowSig: string;
    liveT: ReturnType<typeof setTimeout> | number;
    handScroll: number;
    deferred: boolean;
}
// What Now is about: the bar being played (while playing), else the selected bars, else the bars of the selected notes, else
// the bar under the cursor. a/b index anMeasures(); lo/hi are beats.
export interface AnPanelFocus {
    kind: 'play' | 'bars' | 'sel' | 'cursor';
    a: number;
    b: number;
    lo: number;
    hi: number;
}
export interface AnPanelSpanRow {
    s: AnHarmonySeg;
    k: number;
}
export function anSignedSemi(semi: number) {
    return (semi > 0 ? '+' : '') + semi;
}
export type AnExamplePiece = (typeof PIECES)[number];
// Selections made from the analysis panel: a chord also selects its bar (`bars`, score measure indices), so the coral band
// and the Now tab follow it.
export interface AnSelectionFocus { kind: 'chord' | 'motif'; k: number; }
// Popovers under the toolbar: one open at a time, placed under their button, closed by Esc or a click outside.
export const AN_POPS = [['an-disp-pop', 'an-disp-btn'], ['an-tools-pop', 'an-tools-btn'], ['an-keys-pop', 'an-keys-btn']];

/*
 * The Score Player's explicit state (ScorePlayerState in the decomposition plan): each controller builds its own fresh
 * records, so nothing is shared between instances and no state exists at module import time.
 */
export function createAnState(): AnState {
    return { notes: [], selected: new Set(), selMode: 'lasso', tool: defaultScoreTool(), active: null, source: null, recon: { hands: 'auto', grid: 4, key: 'auto' }, hands: null, keyMap: [], keyOrigin: 'auto',
      index: new Map(), version: 0, cache: new Map(), view: null, wsSig: '', rove: 0, playSeg: -1, playSig: '', kbCenter: false, kbApplied: new Map(), error: null, loading: false, loadToken: 0 };
}
export function createScoreState(viewportWidth: number, layout: notationApi.ScoreLayoutMode): ScoreState {
    return { xml: '', engine: null, version: 0, playGen: 0, timers: [], playing: false, sel: false, loop: null, tempos: [{ beat: 0, bpm: 120 }], tempoList: [{ beat: 0, bpm: 120 }], tempoFromFile: false,
      measures: [], midiGrid: 0, lit: new Set(), heads: new Map(), followRaf: 0, zoom: viewportWidth < 560 ? 0.9 : 1, look: 'paper', layout: layout, stale: false, layoutWidth: 0,
      geo: null, mrange: null, resume: null, paused: false, cursorEl: null, followSys: -1, followCheckedAt: -Infinity, panAt: 0, hl: false };
}
export function createPracticeState(): PracticeState {
    return { hands: 'both', wait: false, metro: false, metroOnly: false, countIn: false, acc: true, hear: true, expressive: true, ramp: false, A: null, B: null, labels: 'letter', pal: 'etude', range: 'fit', fx: true,
      bar: null, active: false, stats: null, res: new Map(), judge: '', judgeT: 0, next: null, names: false };
}
export function createPanelSide(): AnPanelSide {
    return { open: false, tab: 'now', w: 340, sheet: false, drag: false, nowSig: '', liveT: 0, handScroll: 0, deferred: false };
}

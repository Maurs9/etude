import type { LearnText, Localised } from '../locales/content-types.js';
import type { LevelMarkings } from '../sight-reading/markings.js';
import type * as theory from './theory.js';

export type NotationSystem = 'letter' | 'german' | 'solfege';

export const PC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const PC_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const ROOT_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const NOTE_SYS = {
    letter: { sharp: PC_SHARP, flat: PC_FLAT, root: ROOT_NAMES },
    german: { sharp: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'H'], flat: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'B', 'H'], root: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'B', 'H'] },
    solfege: { sharp: ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'],
        flat: ['Do', 'Reb', 'Re', 'Mib', 'Mi', 'Fa', 'Solb', 'Sol', 'Lab', 'La', 'Sib', 'Si'],
        root: ['Do', 'Do#', 'Re', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si'] },
};

export const SS_LETSEMI = [0, 2, 4, 5, 7, 9, 11];
export const SS_SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6], SS_FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];
export function ssKeyAcc(n: number) { const a = [0, 0, 0, 0, 0, 0, 0]; if (n > 0)
    for (let i = 0; i < n; i++)
        a[SS_SHARP_ORDER[i]] = 1;
else
    for (let i = 0; i < -n; i++)
        a[SS_FLAT_ORDER[i]] = -1; return a; }
export function ssStepOf(li: number, oct: number) { return oct * 7 + li; }
export function ssMidiOf(li: number, oct: number, acc: number) { return (oct + 1) * 12 + SS_LETSEMI[li] + (acc || 0); }

export const CLEF_G = 'M376 415C374 427 376 428 382 434C398 449 419 470 438 491C522 583 572 702 572 815C572 902 548 988 507 1048C492 1070 466 1098 455 1098C441 1098 410 1072 390 1050C316 968 292 843 292 739C292 681 299 616 306 575C308 563 309 561 297 551C233 498 164 437 112 373C43 287 0 194 0 87C0 -87 119 -252 364 -252C387 -252 413 -250 433 -246C444 -244 446 -243 448 -255C460 -322 475 -409 475 -456C475 -604 375 -622 316 -622C262 -622 236 -606 236 -593C236 -586 245 -583 268 -576C299 -567 335 -540 335 -482C335 -427 300 -380 239 -380C172 -380 132 -433 132 -495C132 -560 171 -658 322 -658C389 -658 519 -628 519 -458C519 -401 501 -306 490 -244C488 -232 489 -233 503 -227C604 -187 671 -102 671 11C671 139 577 252 430 252C404 252 404 252 401 270ZM470 943C503 943 530 916 530 861C530 792 497 728 419 650C403 634 379 611 356 591C349 585 345 586 343 599C339 625 337 659 337 691C337 847 409 943 470 943ZM361 262C364 243 364 244 346 238C258 208 201 129 201 44C201 -46 248 -110 316 -133C324 -136 336 -139 343 -139C351 -139 355 -134 355 -128C355 -121 347 -118 340 -115C298 -97 268 -54 268 -8C268 49 307 92 368 109C384 113 386 112 388 101L438 -197C440 -208 439 -208 424 -211C408 -214 388 -216 368 -216C193 -216 80 -119 80 20C80 79 90 158 173 252C233 319 279 356 326 394C336 402 338 401 340 390ZM430 103C428 115 429 118 441 117C522 110 589 42 589 -46C589 -109 551 -160 495 -188C483 -194 481 -194 479 -182Z';
export const CLEF_F = 'M252 262C78 262 0 135 0 39C0 -41 42 -110 123 -110C186 -110 229 -66 229 -4C229 60 182 100 133 100C106 100 96 93 83 93C70 93 67 101 67 111C67 151 127 224 229 224C335 224 381 120 381 -37C381 -140 359 -260 297 -356C237 -449 134 -534 10 -605C1 -610 -5 -615 -5 -623C-5 -629 -1 -635 8 -635C13 -635 19 -633 25 -630C158 -565 286 -489 392 -375C479 -281 531 -159 531 -28C531 146 425 262 252 262ZM629 180C598 180 574 156 574 125C574 94 598 70 629 70C660 70 684 94 684 125C684 156 660 180 629 180ZM630 -71C599 -71 576 -94 576 -125C576 -156 599 -179 630 -179C661 -179 684 -156 684 -125C684 -94 661 -71 630 -71Z';
export const CLEF_SCALE = 0.044;
export function ssSharp(x: number, y: number) { return `<g class="ss-glyph"><line x1="${x}" y1="${y - 6}" x2="${x}" y2="${y + 6}" stroke="#1a1714" stroke-width="1"/><line x1="${x + 3.4}" y1="${y - 7}" x2="${x + 3.4}" y2="${y + 5}" stroke="#1a1714" stroke-width="1"/><line x1="${x - 2}" y1="${y - 2}" x2="${x + 5.4}" y2="${y - 3.2}" stroke="#1a1714" stroke-width="1.7"/><line x1="${x - 2}" y1="${y + 2.6}" x2="${x + 5.4}" y2="${y + 1.4}" stroke="#1a1714" stroke-width="1.7"/></g>`; }
export function ssFlat(x: number, y: number) { return `<path class="ss-glyph" fill="none" stroke="#1a1714" stroke-width="1.4" stroke-linecap="round" d="M ${x - 1},${y - 9} L ${x - 1},${y + 4} C ${x + 5},${y - 1} ${x + 4},${y - 5} ${x - 1},${y - 1.5}"/>`; }
export function ssNatural(x: number, y: number) { return `<g class="ss-glyph"><line x1="${x}" y1="${y - 7}" x2="${x}" y2="${y + 4}" stroke="#1a1714" stroke-width="1"/><line x1="${x + 4}" y1="${y - 4}" x2="${x + 4}" y2="${y + 7}" stroke="#1a1714" stroke-width="1"/><line x1="${x}" y1="${y - 3.5}" x2="${x + 4}" y2="${y - 4.7}" stroke="#1a1714" stroke-width="1.5"/><line x1="${x}" y1="${y + 2.2}" x2="${x + 4}" y2="${y + 1}" stroke="#1a1714" stroke-width="1.5"/></g>`; }
export function ssAccGlyph(a: number, k: number, x: number, y: number) { return a > 0 ? ssSharp(x, y) : a < 0 ? ssFlat(x, y) : ssNatural(x, y); }
export function ssNotehead(x: number, y: number, dur: number, onLine?: boolean) {
    const filled = dur < 2, rot = `rotate(-20 ${x} ${y})`;
    const e = `<ellipse class="ss-head${filled ? '' : ' ss-hollow'}" cx="${x}" cy="${y}" rx="6" ry="4.4" transform="${rot}"/>`;
    const dot = [0.375, 0.75, 1.5, 3].includes(dur) ? `<circle class="ss-head" cx="${x + 10}" cy="${onLine ? y - 6 : y - 1}" r="1.7"/>` : '';
    return e + dot;
}
export const SR_SCALE_CAP = 2.2;
export const SC_PAGE_W = 794;
export const SC_BASE = 0.75;

/** A note, chord (several pitches) or rest (`'R'`) with its length in beats, e.g. `['C4', 1]`; `'tied'` marks a single note tied from the one before (a chord is tied only with `engrave: 2`). */
export type SrToken = [string | string[], number, 'tied'?];
/** What the grand-staff engraver (`srRender`) needs to draw a passage. */
/** `engrave: 2` (level pieces) opts in to beams in every meter, whole-bar and dotted rests, accidentals that hold for the bar,
 *  tied chords, spelled note names and room for accidentals; without it the engraver draws exactly as before. */
export interface SrScore { ts: number[]; keyN?: number; pickup?: number; rh?: SrToken[]; lh?: SrToken[]; noNames?: boolean; noTs?: boolean; compact?: boolean; perc?: boolean; engrave?: 2;
    /** engrave 2: the printed-page markings of a level piece (dynamics, fingering, articulation, slurs), drawn over the notes. */
    marks?: LevelMarkings }
export type SrHand = 'rh' | 'lh';
/** An annotation drawn over a Learn staff: kind, beat, then kind-specific values. */
export type LStaffMark =
    | ['dyn', number, string]
    | ['cr' | 'dim' | 'tri' | 'ped', number, number]
    | ['acc' | 'stac' | 'ten' | 'fer' | 'tr', number, SrHand?]
    | ['fing', number, string, SrHand?]
    | ['slur' | 'tie', number, number, SrHand?]
    | ['txt', number, LearnText]
    | ['rn', number, string]
    | ['rs' | 're', number];
export interface LStaffSpec { p: SrScore; bpm: number; cap: string[]; marks?: LStaffMark[]; click?: boolean; seq?: [number, number][] }
export const SR_LET = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
/** A spelled pitch: letter index (C = 0), octave, accidental (-1, 0, 1) and MIDI number. */
export interface SrPitch { li: number; oct: number; acc: number; midi: number }
export function srPitch(s: string): SrPitch | null { const m = /^([A-G])([#b]?)(\d)$/.exec(s); if (!m) return null; const li = SR_LET.indexOf(m[1]), acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0, oct = +m[3]; return { li, oct, acc, midi: ssMidiOf(li, oct, acc) }; }
/** A piece: a score plus its catalogue details. Built-in pieces open in Pieces; generated melodies play in Read & Play. */
export interface SrPiece extends SrScore { id: string; t: Localised<string>; comp: string; level: number; keyN: number; bpm: number; minor?: boolean; ephemeral?: boolean; gen?: string }
/** One engraved note head, with the beat it falls on, where it was drawn and on which system (line of music, `sy`). */
export interface SrStaffNote { nid: number; hand: SrHand; midi: number; beat: number; dur: number; x: number; y: number; li: number; oct: number; acc: number; sy: number }
/** A playhead anchor: beat `b` sits at `x` on system `sy`. Each system but the last ends with an anchor on its closing barline. */
export interface SrBeatX { b: number; x: number; sy: number }
/** One system's vertical extent, which the playhead spans. */
export interface SrSystem { yTop: number; yBot: number }
/** W and H are in SVG units; the score is shown `scale` CSS pixels a unit (1 without a layout). yTop and yBot are the first system's. */
export interface SrRenderResult { svg: string; notes: SrStaffNote[]; beatX: SrBeatX[]; total: number; W: number; H: number; yTop: number; yBot: number; systems: SrSystem[]; scale: number }
/** Fits a score to its paper: `width` (and `maxHeight`) is the paper's inner size in CSS pixels. Bars wrap into systems of
 *  at most `maxBars` (4) bars, split evenly, and are scaled to fill the width, up to `cap` (SR_SCALE_CAP) times their natural size.
 *  With a `maxHeight` (the stage) systems may hold more bars when fewer, longer systems let the score be drawn larger.
 *  `minBars` defaults to 2; 1 allows one bar per system on narrow, vertically scrolling paper.
 *  Without a layout a score is one system at its natural size (the Learn staves). */
export interface SrLayout { width: number; maxHeight?: number; cap?: number; maxBars?: number; minBars?: number; floor?: number; justify?: boolean }
export type AnHand = 'rh' | 'lh';
export interface ScoreNoteArticulation { staccato: boolean; staccatissimo: boolean; accent: boolean; strongAccent: boolean; tenuto: boolean; }
export interface ScoreGraceNote { midi: number; vel: number; tieStart?: boolean; tiedToPrincipal?: boolean; }
// A note of the loaded piece: MIDI and built-in pieces fill the timing and hand; MusicXML adds its notation and performance details.
export interface AnNote {
    midi: number; start: number; end: number; vel: number;
    track?: number; channel?: number; hand?: AnHand | null; srcHand?: AnHand;
    part?: number; staff?: number; voice?: number; type?: string; art?: ScoreNoteArticulation; arpeggiate?: boolean;
    finger?: number; explicitVel?: number; dynamicHit?: number; graces?: ScoreGraceNote[]; warm?: boolean; soundRatio?: number;
    roll?: number; nextSame?: number; pedalEnd?: number; soundEnd?: number; parenthesizedAt?: number[];
}
export interface ScoreXmlNote extends AnNote { hand: AnHand | null; part: number; staff: number; voice: number; type: string; art: ScoreNoteArticulation; arpeggiate: boolean; }
export interface AnParsedNote { midi: number; start: number; end: number; vel: number; track: number; channel: number; srcHand?: AnHand; }
export type AnMidiMeta = { type: 'tempo'; beat: number; bpm: number } | { type: 'time'; beat: number; num: number; den: number } | AnMidiKeyMeta;
export interface AnMidiKeyMeta { type: 'key'; beat: number; fifths: number; minor: boolean; }
export interface AnParsedMidi { ppq: number; format: number; tracks: number; names: string[]; meta: AnMidiMeta[]; notes: AnParsedNote[]; }
export interface ScoreXmlLayout {
    base: number; width: number; pageWidth: number; pageHeight: number;
    left?: number; right?: number; top?: number; bottom?: number;
    titleSize?: number; subtitleSize?: number; composerSize?: number;
    titleRuns?: { text: string | null; style: string; weight: string }[];
    staffGap?: number | null; systemGap?: number | null;
}
export interface ScoreMeasure { number: string; start: number; end: number; num: number; den: number; }
export interface ScoreXmlKey { beat: number; fifths: number; mode: 'major' | 'minor' | null; }
export interface ScoreXmlHarmony { beat: number; root: number; kind: string; bass: number | null; text: string; }
export interface ScoreXmlLink { kind: string; a: number; b: number; style: string; }
export type AnSource =
    | { kind: 'xml'; title: string; label: string; xml: string; layout: ScoreXmlLayout | null; notes: ScoreXmlNote[]; tempos: { beat: number; bpm: number }[]; measures: ScoreMeasure[]; keys: ScoreXmlKey[]; harmonies?: ScoreXmlHarmony[]; links: ScoreXmlLink[] }
    | { kind: 'midi'; title: string; label: string; parsed: AnParsedMidi; comp?: undefined }
    | { kind: 'example'; id: string; title: string; label: string; comp: string; parsed: AnParsedMidi };
export type AnHandAssignment =
    | { of: AnHand[]; how: 'split' | 'one' | 'fallback'; split: number }
    | { of: AnHand[]; how: 'piece' }
    | { of: AnHand[]; how: 'tracks'; groups: number };

export const AN_MAX_XML_CHARS = 33554432;
export const AN_MAX_BYTES = 2097152;
export const AN_MAX_NOTES = 5000;

export function anError(code: string, detail?: string) { const e = Object.assign(new Error(detail || code), { code }); return e; }
export const XML_ESC: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' };
export function xmlEsc(s: string) { return String(s).replace(/[<>&"']/g, (c) => XML_ESC[c]); }
export function scoreHasKey<T extends object>(table: T, key: PropertyKey): key is keyof T { return Object.prototype.hasOwnProperty.call(table, key); }
export function rdPercClef(x: number, top: number) { return `<g class="rdx-cclef"><rect x="${x}" y="${top + 12}" width="4" height="24"/><rect x="${x + 8}" y="${top + 12}" width="4" height="24"/></g>`; }

export function notePcName(sys: NotationSystem, pitchClassVal: number, flat: boolean): string {
  return (flat ? NOTE_SYS[sys].flat : NOTE_SYS[sys].sharp)[((pitchClassVal % 12) + 12) % 12];
}

import { srClef } from './grand-staff.js';
import {
  SR_SCALE_CAP,
  ssAccGlyph,
  ssFlat,
  ssKeyAcc,
  ssMidiOf,
  ssNotehead,
  ssSharp,
  ssStepOf,
} from './score-types.js';

export const SS_SYL_MAJ = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'], SS_SYL_MIN = ['la', 'ti', 'do', 're', 'mi', 'fa', 'sol'];
export const SS_MAJ: Record<number, { r: number; n: number }> = { 0: { r: 0, n: 0 }, 7: { r: 4, n: 1 }, 2: { r: 1, n: 2 }, 9: { r: 5, n: 3 }, 4: { r: 2, n: 4 }, 11: { r: 6, n: 5 }, 5: { r: 3, n: -1 }, 10: { r: 6, n: -2 }, 3: { r: 2, n: -3 }, 8: { r: 5, n: -4 }, 1: { r: 1, n: -5 } };
export const SS_MIN: Record<number, number> = { 9: 5, 4: 2, 2: 1, 11: 6, 7: 4, 0: 0, 5: 3 }; // minor tonic pc -> tonic letter index

export interface SightSingLevel { label: string; degs: number[]; durs: number[]; ts: number[][]; bars: number; keys: number[]; step: number; bpm: number; octaveUp?: boolean; minor?: boolean; raise7?: number }
export interface SightSingNote { li: number; oct: number; acc: number; dur: number; p: number; midi: number; tBeat: number }
export interface SightSingExercise { clef: string; keyPc: number; minor: boolean; keyN: number; ts: number[]; cap: number; measures: SightSingNote[][]; bpm: number; level: number; totalBeats: number; syl: string[]; tonicMidi: number }
export const SS_LEVELS: SightSingLevel[] = [
    { label: 'si_level_1', degs: [2, 4], durs: [1], ts: [[4, 4]], bars: 2, keys: [0], step: 0.85, bpm: 72 },
    { label: 'si_level_2', degs: [2, 4, 5], durs: [1], ts: [[4, 4]], bars: 2, keys: [0], step: 0.8, bpm: 74 },
    { label: 'si_level_3', degs: [0, 1, 2, 4, 5], durs: [1, 2], ts: [[4, 4], [3, 4]], bars: 2, keys: [0, 7], step: 0.78, bpm: 76 },
    { label: 'si_level_4', degs: [0, 1, 2, 3, 4, 5, 6], durs: [1, 2], ts: [[4, 4], [3, 4]], bars: 2, keys: [0, 7, 5], step: 0.75, bpm: 78, octaveUp: true },
    { label: 'si_level_5', degs: [0, 1, 2, 3, 4, 5, 6], durs: [1, 2], ts: [[4, 4], [3, 4]], bars: 2, keys: [0, 7, 5, 2], step: 0.5, bpm: 80, octaveUp: true },
    { label: 'si_level_6', degs: [0, 1, 2, 3, 4, 5, 6], durs: [1, 2], ts: [[4, 4], [3, 4]], bars: 2, keys: [9, 4, 2], step: 0.7, bpm: 80, minor: true, raise7: 0.5, octaveUp: true },
    { label: 'si_level_7', degs: [0, 1, 2, 3, 4, 5, 6], durs: [2, 1.5, 1, 0.5], ts: [[4, 4], [3, 4], [6, 8]], bars: 4, keys: [0, 7, 5, 2, 10], step: 0.62, bpm: 84, octaveUp: true },
];
export function ssPick<T>(a: ArrayLike<T>) { return a[Math.floor(Math.random() * a.length)]; }
export function ssNextDeg(prev: number, allowed: number[], step: number) {
    const w = allowed.map((p) => { const d = Math.abs(p - prev); return (d === 0 ? 0.12 : d <= 1 ? step : d <= 2 ? (1 - step) * 0.6 : (1 - step) * 0.3) + 0.01; });
    let tot = w.reduce((a, b) => a + b, 0), r = Math.random() * tot;
    for (let i = 0; i < allowed.length; i++) {
        r -= w[i];
        if (r <= 0)
            return allowed[i];
    }
    return allowed[0];
}
export function ssMakeNote(p: number, tonicLi: number, baseOct: number, acc: number[], minor: boolean, dur: number, raise7: number|undefined) {
    const li = ((tonicLi + p) % 7 + 7) % 7, oct = baseOct + Math.floor((tonicLi + p) / 7);
    let a = acc[li];
    if (minor && (((p % 7) + 7) % 7) === 6 && Math.random() < (raise7 || 0))
        a = a + 1; // harmonic-minor raised 7th
    return { li, oct, acc: a, dur, p, midi: ssMidiOf(li, oct, a) };
}
export function ssGen(level: number, clef: string, rangeShift: number): SightSingExercise {
    const L = SS_LEVELS[Math.max(0, Math.min(SS_LEVELS.length - 1, level))], minor = !!L.minor;
    const keyPc = ssPick(L.keys), tonicLi = minor ? SS_MIN[keyPc] : SS_MAJ[keyPc].r, n = minor ? SS_MAJ[(keyPc + 3) % 12].n : SS_MAJ[keyPc].n, acc = ssKeyAcc(n);
    const ts = ssPick(L.ts), cap = ts[1] === 8 ? ts[0] * 0.5 : ts[0];
    const allowed = L.degs.slice();
    if (L.octaveUp)
        allowed.push(7);
    let baseOct = (clef === 'bass' ? 3 : 4) + (rangeShift || 0);
    const measures: SightSingNote[][] = [];
    let prev = 0, beat = 0;
    for (let m = 0; m < L.bars; m++) {
        const notes: SightSingNote[] = [];
        let rem = cap;
        while (rem > 1e-6) {
            const choices = L.durs.filter((d) => d <= rem + 1e-6);
            const dur = ssPick(choices.length ? choices : [rem]);
            const p = (m === 0 && !notes.length) ? 0 : ssNextDeg(prev, allowed, L.step);
            prev = p;
            const note = Object.assign(ssMakeNote(p, tonicLi, baseOct, acc, minor, dur, L.raise7), { tBeat: beat });
            beat += dur;
            notes.push(note);
            rem -= dur;
        }
        measures.push(notes);
    }
    const lm = measures[measures.length - 1], lastN = lm[lm.length - 1];
    const repl = Object.assign(ssMakeNote(0, tonicLi, baseOct, acc, minor, lastN.dur, 0), { tBeat: lastN.tBeat });
    lm[lm.length - 1] = repl;
    return { clef, keyPc, minor, keyN: n, ts, cap, measures, bpm: L.bpm, level, totalBeats: beat, syl: minor ? SS_SYL_MIN : SS_SYL_MAJ, tonicMidi: ssMidiOf(tonicLi, baseOct, acc[tonicLi]) };
}
/* ---- SVG glyphs ---- */
// Clefs are drawn as outlines anchored to their staff line (G or F), so they look the same on every device instead of depending on a system font's music glyphs.
// Outlines: Bravura gClef/fClef, © Steinberg Media Technologies GmbH, SIL Open Font License 1.1. Font units: 250 per staff space, y up, origin on the clef's line.
export function ssTrebleClef(x: number) { return srClef('treble', x, 46); }
export function ssBassClef(x: number) { return srClef('bass', x, 46); }
export function ssStem(x: number, y: number, dur: number) {
    if (dur >= 4)
        return '';
    const up = y > 70, sx = up ? x + 5.6 : x - 5.6, ey = up ? y - 32 : y + 32;
    let s = `<line class="ss-stem" x1="${sx}" y1="${y}" x2="${sx}" y2="${ey}" stroke="#1a1714" stroke-width="1.6"/>`;
    if (dur <= 0.5)
        s += up ? `<path class="ss-flag" fill="none" stroke="#1a1714" stroke-width="1.8" d="M ${sx},${ey} C ${sx + 9},${ey + 5} ${sx + 9},${ey + 13} ${sx + 3},${ey + 17}"/>` : `<path class="ss-flag" fill="none" stroke="#1a1714" stroke-width="1.8" d="M ${sx},${ey} C ${sx + 9},${ey - 5} ${sx + 9},${ey - 13} ${sx + 3},${ey - 17}"/>`;
    return s;
}
export function ssLedger(x: number, y: number) { let s = ''; if (y > 94) {
    for (let ly = 106; ly <= y + 1; ly += 12)
        s += `<line class="ss-ledger" x1="${x - 9}" y1="${ly}" x2="${x + 9}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`;
} if (y < 46) {
    for (let ly = 34; ly >= y - 1; ly -= 12)
        s += `<line class="ss-ledger" x1="${x - 9}" y1="${ly}" x2="${x + 9}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`;
} return s; }
export function ssKeySig(ex: { clef: string; keyN: number; }, x: number) {
    const refStep = ex.clef === 'bass' ? 18 : 30, yOf = (li: number, oct: number) => 94 + (refStep - ssStepOf(li, oct)) * 6;
    const sT = [[3, 5], [0, 5], [4, 5], [1, 5], [5, 4], [2, 5], [6, 4]], fT = [[6, 4], [2, 5], [5, 4], [1, 5], [4, 4], [0, 5], [3, 4]];
    const sB = [[3, 3], [0, 3], [4, 3], [1, 3], [5, 2], [2, 3], [6, 2]], fB = [[6, 2], [2, 3], [5, 2], [1, 3], [4, 2], [0, 3], [3, 2]];
    const n = ex.keyN, cnt = Math.abs(n), list = n > 0 ? (ex.clef === 'bass' ? sB : sT) : (ex.clef === 'bass' ? fB : fT);
    let svg = '', xx = x;
    for (let i = 0; i < cnt; i++) {
        const y = yOf(list[i][0], list[i][1]);
        svg += n > 0 ? ssSharp(xx + 3, y) : ssFlat(xx + 3, y);
        xx += 9;
    }
    return { svg, w: cnt ? cnt * 9 + 6 : 6 };
}
export function ssTimeSig(ts: readonly number[], x: number) { return `<text class="ss-num" x="${x + 9}" y="64">${ts[0]}</text><text class="ss-num" x="${x + 9}" y="90">${ts[1]}</text>`; }
export interface SightSingNotePosition { x: number; y: number; note: SightSingNote; idx: number }
/** W is in SVG units; the staff is shown `scale` CSS pixels a unit. */
export interface SightSingRender { svg: string; W: number; noteX: SightSingNotePosition[]; scale: number }
/** The most a sight-reading or sight-singing staff is enlarged to fill its paper, against its natural size. */
/** `width` is the paper's inner width in CSS pixels: a short melody is enlarged to fill it (up to SR_SCALE_CAP); 0 keeps the natural size. */
export function ssRender(ex: SightSingExercise, width = 0): SightSingRender {
    const refStep = ex.clef === 'bass' ? 18 : 30, yOf = (li: number, oct: number) => 94 + (refStep - ssStepOf(li, oct)) * 6, keyAcc = ssKeyAcc(ex.keyN);
    let x = 10, body = '', noteX: SightSingNotePosition[] = [], idx = 0;
    body += ex.clef === 'bass' ? ssBassClef(x) : ssTrebleClef(x);
    x += 30;
    const ks = ssKeySig(ex, x);
    body += ks.svg;
    x += ks.w;
    body += ssTimeSig(ex.ts, x);
    x += 26;
    ex.measures.forEach((meas) => {
        const accidentals = new Map<number, number>();
        meas.forEach((note) => {
            const y = yOf(note.li, note.oct), nx = x + 10;
            let g = '';
            const pitch = ssStepOf(note.li, note.oct);
            const previous = accidentals.get(pitch) ?? keyAcc[note.li];
            if (note.acc !== previous) g += ssAccGlyph(note.acc, previous, nx - 13, y);
            accidentals.set(pitch, note.acc);
            g += ssLedger(nx, y) + ssNotehead(nx, y, note.dur) + ssStem(nx, y, note.dur);
            const syl = ex.syl[((note.p % 7) + 7) % 7];
            body += `<g class="ss-n" data-i="${idx}"><rect class="ss-box" x="${nx - 12}" y="40" width="24" height="58" rx="4"/>${g}<text class="ss-syl" x="${nx}" y="126">${syl}</text></g>`;
            noteX.push({ x: nx, y, note, idx });
            x += 26 + note.dur * 15;
            idx++;
        });
        x += 6;
        body += `<line class="ss-line" x1="${x}" y1="46" x2="${x}" y2="94" stroke="#1a1714" stroke-width="1.3"/>`;
        x += 12;
    });
    const W = Math.max(x + 4, 360), k = width > 0 ? Math.max(1, Math.min(SR_SCALE_CAP, width / W)) : 1;
    let staff = '';
    [46, 58, 70, 82, 94].forEach((ly) => staff += `<line class="ss-line" x1="8" y1="${ly}" x2="${W - 6}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`);
    staff += `<line class="ss-line" x1="8" y1="46" x2="8" y2="94" stroke="#1a1714" stroke-width="1.3"/>`;
    return { svg: `<svg class="ss-svg" viewBox="0 0 ${W} 150" width="${Math.floor(W * k)}" height="${Math.round(150 * k)}" xmlns="http://www.w3.org/2000/svg">${staff}${body}</svg>`, W, noteX, scale: k };
}

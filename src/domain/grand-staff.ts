import type { LevelMarkings } from '../sight-reading/markings.js';
import {
  CLEF_F,
  CLEF_G,
  CLEF_SCALE,
  NOTE_SYS,
  notePcName,
  rdPercClef,
  scoreHasKey,
  SR_SCALE_CAP,
  SS_LETSEMI,
  ssAccGlyph,
  ssFlat,
  ssKeyAcc,
  ssMidiOf,
  ssNotehead,
  ssSharp,
  ssStepOf,
  SR_LET,
  srPitch,
  type NotationSystem,
  type SrBeatX,
  type SrHand,
  type SrLayout,
  type SrPitch,
  type SrRenderResult,
  type SrScore,
  type SrStaffNote,
  type SrSystem,
  type SrToken,
} from './score-types.js';

/** Where `beat` falls on a drawn score: between the anchors around it, on their system. A beat on a system break starts the next system. */
export function srBeatPt(pts: readonly SrBeatX[], beat: number): SrBeatX {
    if (!pts.length)
        return { b: beat, x: 10, sy: 0 };
    if (pts.length >= 2) {
        let lo = 0, hi = pts.length - 2;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (pts[mid + 1].b < beat)
                lo = mid + 1;
            else
                hi = mid;
        }
        for (let i = lo; i < pts.length - 1 && pts[i].b <= beat; i++) {
            const a = pts[i], c = pts[i + 1], brk = i + 2 < pts.length && pts[i + 2].sy !== c.sy;
            if (a.sy !== c.sy || beat < a.b || beat > c.b || (brk && beat > c.b - 1e-3))
                continue;
            const f = (beat - a.b) / Math.max(1e-3, c.b - a.b);
            return { b: beat, x: a.x + f * (c.x - a.x), sy: a.sy };
        }
    }
    return beat <= pts[0].b ? pts[0] : pts[pts.length - 1];
}

export interface SrRestEvent { rest: true; beat: number; dur: number; chord?: undefined; beam?: undefined }
/** A note to engrave; beamed eighths also record their stem position once drawn. */
export interface SrNoteEvent extends SrPitch { rest?: undefined; beat: number; dur: number; chord?: boolean; tied?: boolean; beam?: { first: boolean; mate: SrNoteEvent }; nid?: number; bx?: number; by?: number; mid?: number; showAcc?: boolean; bcol?: SrBeamCol }
/** engrave 2: one beat of a beamed group (a note or a chord); its stem position is recorded once drawn. */
export interface SrBeamCol { id: number; beat: number; dur: number; steps: number[]; grp?: SrBeamGroup; x?: number; yHi?: number; yLo?: number }
/** engrave 2: beamed columns of one hand inside one beat group, with the stem direction they share. */
export interface SrBeamGroup { cols: SrBeamCol[]; up: boolean }
export type SrEvent = SrRestEvent | SrNoteEvent;
export function srPitchStrict(s: string): SrPitch { const p = srPitch(s); if (!p)
    throw new TypeError('Étude: unreadable pitch ' + s); return p; }
export function srEvents(list: SrToken[]|undefined, chordTies = false) { const ev: SrEvent[] = []; let beat = 0; (list || []).forEach((x) => { const d = x[1]; if (x[0] === 'R')
    ev.push({ rest: true, beat, dur: d });
else if (Array.isArray(x[0]))
    x[0].forEach((n) => ev.push(Object.assign(srPitchStrict(n), { beat, dur: d, chord: x[0].length > 1 }, x[2] === 'tied' && (x[0].length === 1 || chordTies) ? { tied: true } : {})));
else
    ev.push(Object.assign(srPitchStrict(x[0]), { beat, dur: d }, x[2] === 'tied' ? { tied: true } : {})); beat += d; }); return { ev, total: beat }; }
export function srClef(clef: string, x: number, top: number) { const g = clef === 'treble'; return `<path class="ss-clef" d="${g ? CLEF_G : CLEF_F}" transform="translate(${g ? x - 2 : x} ${top + (g ? 36 : 12)}) scale(${CLEF_SCALE} ${-CLEF_SCALE})"/>`; }
export function srKeySigG(clef: string, keyN: number, x: number, top: number) {
    const refStep = clef === 'bass' ? 18 : 30, bot = top + 48, yOf = (li: number, oct: number) => bot + (refStep - ssStepOf(li, oct)) * 6;
    const sT = [[3, 5], [0, 5], [4, 5], [1, 5], [5, 4], [2, 5], [6, 4]], fT = [[6, 4], [2, 5], [5, 4], [1, 5], [4, 4], [0, 5], [3, 4]];
    const sB = [[3, 3], [0, 3], [4, 3], [1, 3], [5, 2], [2, 3], [6, 2]], fB = [[6, 2], [2, 3], [5, 2], [1, 3], [4, 2], [0, 3], [3, 2]];
    const cnt = Math.abs(keyN), list = keyN > 0 ? (clef === 'bass' ? sB : sT) : (clef === 'bass' ? fB : fT);
    let svg = '', xx = x;
    for (let i = 0; i < cnt; i++) {
        const y = yOf(list[i][0], list[i][1]);
        svg += keyN > 0 ? ssSharp(xx + 3, y) : ssFlat(xx + 3, y);
        xx += 9;
    }
    return { svg, w: cnt ? cnt * 9 + 6 : 6 };
}
export function srTimeSigG(ts: number[], x: number, top: number) { return `<text class="ss-num" x="${x + 9}" y="${top + 18}">${ts[0]}</text><text class="ss-num" x="${x + 9}" y="${top + 44}">${ts[1]}</text>`; }
export function srStem2(x: number, y: number, dur: number, mid: number) { if (dur >= 4)
    return ''; const up = y > mid, sx = up ? x + 5.6 : x - 5.6, ey = up ? y - 32 : y + 32; return srStemLine(sx, y, ey, dur, up); }
export function srStemLine(sx: number, y: number, ey: number, dur: number, up: boolean) {
    if (dur >= 4)
        return '';
    const base = [0.375, 0.75, 1.5, 3].includes(dur) ? dur / 1.5 : dur, flags = base <= 0.125 ? 3 : base <= 0.25 ? 2 : base <= 0.5 ? 1 : 0;
    let s = `<line class="ss-stem" x1="${sx}" y1="${y}" x2="${sx}" y2="${ey}" stroke="#1a1714" stroke-width="1.6"/>`;
    for (let i = 0; i < flags; i++) {
        const fy = up ? ey + i * 7 : ey - i * 7;
        s += up ? `<path class="ss-flag" fill="none" stroke="#1a1714" stroke-width="1.8" d="M ${sx},${fy} C ${sx + 9},${fy + 5} ${sx + 9},${fy + 13} ${sx + 3},${fy + 17}"/>` : `<path class="ss-flag" fill="none" stroke="#1a1714" stroke-width="1.8" d="M ${sx},${fy} C ${sx + 9},${fy - 5} ${sx + 9},${fy - 13} ${sx + 3},${fy - 17}"/>`;
    }
    return s;
}
export function srLedger2(x: number, y: number, top: number) {
    const bot = top + 48;
    let s = '';
    if (y > bot) {
        for (let ly = bot + 12; ly <= y + 1; ly += 12)
            s += `<line class="ss-ledger" x1="${x - 9}" y1="${ly}" x2="${x + 9}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`;
    }
    if (y < top) {
        for (let ly = top - 12; ly >= y - 1; ly -= 12)
            s += `<line class="ss-ledger" x1="${x - 9}" y1="${ly}" x2="${x + 9}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`;
    }
    return s;
}
export function srRest(x: number, top: number, dur: number) {
    if (dur >= 4)
        return `<rect class="ss-glyph" x="${x - 6}" y="${top + 12}" width="12" height="5"/>`;
    if (dur >= 2)
        return `<rect class="ss-glyph" x="${x - 6}" y="${top + 19}" width="12" height="5"/>`;
    return `<text class="ss-clef" x="${x - 6}" y="${top + 34}" style="font-size:30px">${dur <= 0.125 ? '\u{1D140}' : dur <= 0.25 ? '\u{1D13F}' : dur <= 0.5 ? '\u{1D13E}' : '\u{1D13D}'}</text>`;
}
/** A tie from the notehead at x1 to the one at x2 (same pitch, same y), on the side away from the stem. */
export function srTieArc(x1: number, x2: number, y: number, stemUp: boolean) {
    const s = stemUp ? 1 : -1, a = x1 + 5, b = x2 - 5, m = (a + b) / 2, yb = y + s * 6;
    return `<path class="ss-tie" d="M ${a},${yb} Q ${m},${y + s * 15} ${b},${yb} Q ${m},${y + s * 12} ${a},${yb} Z"/>`;
}
/** engrave 2: a rest drawn with shapes (no music font), with its dot when dotted. */
export function srLevelRest(x: number, top: number, dur: number) {
    const dotted = [0.375, 0.75, 1.5, 3].includes(dur), base = dotted ? dur / 1.5 : dur;
    let s: string;
    if (base >= 4)
        s = `<rect class="ss-glyph ss-rest ss-rest-whole" x="${x - 6}" y="${top + 12}" width="12" height="5"/>`;
    else if (base >= 2)
        s = `<rect class="ss-glyph ss-rest ss-rest-half" x="${x - 6}" y="${top + 19}" width="12" height="5"/>`;
    else if (base >= 1)
        s = `<path class="ss-glyph ss-rest ss-rest-q" stroke-width="3.2" stroke-linejoin="bevel" d="M ${x - 2},${top + 7} L ${x + 4},${top + 15} L ${x - 1},${top + 22} L ${x + 4},${top + 30}"/><path class="ss-glyph" stroke-width="2" stroke-linecap="round" d="M ${x + 4},${top + 30} C ${x - 3},${top + 26} ${x - 5},${top + 34} ${x + 1},${top + 40}"/>`;
    else if (base >= 0.5)
        s = `<path class="ss-glyph ss-rest ss-rest-8" stroke-width="1.5" stroke-linecap="round" d="M ${x - 3},${top + 17} Q ${x + 1},${top + 21} ${x + 4},${top + 15} L ${x - 1},${top + 33}"/><circle class="ss-glyph" cx="${x - 3}" cy="${top + 16.5}" r="2.4"/>`;
    else
        s = `<path class="ss-glyph ss-rest ss-rest-16" stroke-width="1.5" stroke-linecap="round" d="M ${x - 3},${top + 17} Q ${x + 1},${top + 21} ${x + 4},${top + 15} L ${x - 3},${top + 40} M ${x - 5.5},${top + 27} Q ${x - 1.5},${top + 31} ${x + 1.2},${top + 25}"/><circle class="ss-glyph" cx="${x - 3}" cy="${top + 16.5}" r="2.4"/><circle class="ss-glyph" cx="${x - 5.5}" cy="${top + 26.5}" r="2.4"/>`;
    return dotted ? s + `<circle class="ss-glyph ss-rest-dot" cx="${x + 9}" cy="${top + 18}" r="1.7"/>` : s;
}
/** engrave 2: a note's name from its spelling (letter and accidental), not from its pitch class. */
export function srSpellName(li: number, acc: number, notation: NotationSystem) {
    const sys = NOTE_SYS[notation];
    if (notation === 'german' && li === 6 && acc < 0)
        return sys.flat[10];
    return sys.sharp[SS_LETSEMI[li]] + (acc > 0 ? '#' : acc < 0 ? 'b' : '');
}
/** engrave 2: how many beams a note value takes (a dotted value counts as its undotted base). */
export function srBeamCount(dur: number) { const base = [0.375, 0.75, 1.5, 3].includes(dur) ? dur / 1.5 : dur; return base <= 0.125 ? 3 : base <= 0.25 ? 2 : 1; }
/** engrave 2, before drawing: checks each tie against the note before, decides which accidentals show (an accidental holds
 *  for its staff position until the barline; a tied note shows none), groups eighths and shorter into beams per beat group
 *  (a quarter in x/4, the whole bar in 3/8, a dotted quarter in 6/8) and returns the extra room each beat needs for its signs. */
export function srLevelPrep(ts: number[], staves: SrStave[], bounds: number[], cap: number, pickup: number, keyAcc: number[]) {
    const groups: SrBeamGroup[] = [], room = new Map<number, number>();
    const barOf = (b: number) => bounds.filter((v) => v < b + 1e-3).length;
    const barStart = (m: number) => m === 0 ? (pickup > 0 ? pickup - cap : 0) : bounds[m - 1];
    const span = ts[1] === 8 ? (ts[0] % 3 === 0 ? 1.5 : cap) : 1;
    let colId = 0;
    staves.forEach((st) => {
        const cols: { evs: SrEvent[]; beat: number }[] = [];
        st.data.ev.forEach((e) => { const c = cols[cols.length - 1]; if (c && Math.abs(c.beat - e.beat) < 1e-3)
            c.evs.push(e);
        else
            cols.push({ evs: [e], beat: e.beat }); });
        let mem = new Map<number, number>(), bar = -1, prev: SrNoteEvent[] = [];
        cols.forEach((c) => {
            const m = barOf(c.beat);
            if (m !== bar) {
                bar = m;
                mem = new Map<number, number>();
            }
            const ns = c.evs.filter((e): e is SrNoteEvent => !e.rest);
            let shown = 0;
            ns.forEach((e) => {
                if (e.tied && !prev.some((p) => p.li === e.li && p.oct === e.oct && p.acc === e.acc))
                    e.tied = false;
                if (e.tied) {
                    e.showAcc = false;
                    return;
                }
                const step = ssStepOf(e.li, e.oct);
                e.showAcc = e.acc !== (mem.get(step) ?? keyAcc[e.li]);
                mem.set(step, e.acc);
                if (e.showAcc)
                    shown++;
            });
            prev = ns;
            const k = Math.round(c.beat * 1000);
            room.set(k, Math.max(room.get(k) ?? 0, Math.min(shown, 2) * 6));
        });
        let run: SrBeamCol[] = [], runKey = '';
        const midStep = st.refStep + 4;
        const flush = () => {
            if (run.length > 1) {
                const steps = run.flatMap((c) => c.steps), hi = Math.max(...steps), lo = Math.min(...steps);
                const grp: SrBeamGroup = { cols: run, up: midStep - lo > hi - midStep };
                run.forEach((c) => { c.grp = grp; });
                groups.push(grp);
            }
            run = [];
        };
        cols.forEach((c) => {
            const ns = c.evs.filter((e): e is SrNoteEvent => !e.rest), dur = c.evs[0].dur;
            if (!ns.length || ns.length !== c.evs.length || dur >= 1 - 1e-6) {
                flush();
                return;
            }
            const m = barOf(c.beat), key = m + ':' + Math.floor((c.beat - barStart(m)) / span + 1e-6), last = run[run.length - 1];
            if (!last || key !== runKey || Math.abs(last.beat + last.dur - c.beat) > 1e-3) {
                flush();
                runKey = key;
            }
            const col: SrBeamCol = { id: colId++, beat: c.beat, dur, steps: ns.map((e) => ssStepOf(e.li, e.oct)) };
            ns.forEach((e) => { e.bcol = col; });
            run.push(col);
        });
        flush();
    });
    return { groups, room };
}
/** engrave 2, after drawing: each beamed group's stems and beams (a second beam, or a short one, for sixteenths). The markup
 *  for a group of two eighths is the one the engraver draws for an on-beat pair without the flag. */
export function srLevelBeams(body: string, groups: SrBeamGroup[]) {
    groups.forEach((gr) => {
        const cs = gr.cols, n = cs.length, up = gr.up;
        const pos: { sx: number; hi: number; lo: number }[] = [];
        for (const c of cs) {
            if (c.x === undefined || c.yHi === undefined || c.yLo === undefined)
                return;
            pos.push({ sx: up ? c.x + 5.6 : c.x - 5.6, hi: c.yHi, lo: c.yLo });
        }
        let e1 = up ? pos[0].hi - 32 : pos[0].lo + 32, e2 = up ? pos[n - 1].hi - 32 : pos[n - 1].lo + 32;
        const d = e2 - e1;
        if (up) {
            if (d > 6)
                e2 = e1 + 6;
            else if (d < -6)
                e1 = e2 + 6;
        }
        else {
            if (d > 6)
                e1 = e2 - 6;
            else if (d < -6)
                e2 = e1 - 6;
        } // limit the slope by lengthening stems only
        const x1 = pos[0].sx, x2 = pos[n - 1].sx, nb = cs.map((c) => srBeamCount(c.dur));
        const lineY = (x: number) => x2 === x1 ? e1 : e1 + (e2 - e1) * (x - x1) / (x2 - x1);
        const at = (i: number) => i === 0 ? e1 : i === n - 1 ? e2 : lineY(pos[i].sx);
        // Every stem reaches past its furthest note by a full stem, a little more under extra beams.
        let shift = 0;
        pos.forEach((p, i) => { const need = 32 + 3 * (nb[i] - 1); shift = Math.max(shift, up ? at(i) - (p.hi - need) : (p.lo + need) - at(i)); });
        if (shift > 1e-6) {
            e1 = up ? e1 - shift : e1 + shift;
            e2 = up ? e2 - shift : e2 + shift;
        }
        const th = up ? 5 : -5, stem = (sx: number, y: number, ey: number) => `<line class="ss-stem" x1="${sx}" y1="${y}" x2="${sx}" y2="${ey}" stroke="#1a1714" stroke-width="1.6"/>`;
        const beam = (cls: string, a: number, b: number, off: number) => { const ya = lineY(a) + off, yb = lineY(b) + off; return `<path class="${cls}" d="M ${a},${ya} L ${b},${yb} L ${b},${yb + th} L ${a},${ya + th} Z"/>`; };
        let beams = `<path class="ss-beam" d="M ${x1},${e1} L ${x2},${e2} L ${x2},${e2 + th} L ${x1},${e1 + th} Z"/>`;
        for (let k = 2; k <= Math.max(...nb); k++) {
            const off = (up ? 7 : -7) * (k - 1);
            for (let i = 0; i < n; i++) {
                if (nb[i] < k)
                    continue;
                let j = i;
                while (j + 1 < n && nb[j + 1] >= k)
                    j++;
                if (j > i)
                    beams += beam('ss-beam ss-beam2', pos[i].sx, pos[j].sx, off);
                else {
                    const dir = i === 0 ? 1 : -1;
                    beams += beam('ss-beam ss-beam2', Math.min(pos[i].sx, pos[i].sx + dir * 9), Math.max(pos[i].sx, pos[i].sx + dir * 9), off);
                }
                i = j;
            }
        }
        cs.forEach((c, i) => {
            const p = pos[i];
            body = body.replace(`@@G${c.id}@@`, stem(p.sx, up ? p.lo : p.hi, at(i)) + (i === n - 1 ? beams : ''));
        });
    });
    return body;
}
/** One staff of the system; `data` is filled from the hand's tokens right after the staves are laid out. */
export interface SrStave { hand: SrHand; clef: 'treble' | 'bass'; refStep: number; top: number; rel: number; data: { ev: SrEvent[]; total: number } }
/** A chord note with its staff position, notehead shift (`dx`) and accidental column (`ax`). */
export interface SrChordItem { e: SrNoteEvent; step: number; y: number; dx: number; ax?: number }
export function renderGrandStaff(piece: SrScore, lay: SrLayout | undefined, opts: { namesVisible: boolean; notation: NotationSystem }): SrRenderResult {
    const staves: SrStave[] = [];
    if (piece.rh)
        staves.push({ hand: 'rh', clef: 'treble', refStep: 30, top: 46, rel: 0, data: { ev: [], total: 0 } });
    if (piece.lh)
        staves.push({ hand: 'lh', clef: 'bass', refStep: 18, top: piece.rh ? 150 : 46, rel: piece.rh ? 104 : 0, data: { ev: [], total: 0 } });
    const v2 = piece.engrave === 2;
    staves.forEach((st) => { st.data = srEvents(piece[st.hand], v2); });
    const keyAcc = ssKeyAcc(piece.keyN || 0), names = opts.namesVisible, lastSt = staves[staves.length - 1];
    const cap = piece.ts[1] === 8 ? piece.ts[0] * 0.5 : piece.ts[0], pickup = piece.pickup || 0;
    const total = Math.max(...staves.map((s) => s.data.total));
    const ksw = Math.max(6, ...staves.map((st) => srKeySigG(st.clef, piece.keyN || 0, 0, 0).w));
    const bounds: number[] = [];
    {
        let b = pickup > 0 ? pickup : cap;
        while (b < total - 1e-4) {
            bounds.push(b);
            b += cap;
        }
    }
    const beatSet = new Set<number>();
    staves.forEach((st) => st.data.ev.forEach((e) => beatSet.add(+e.beat.toFixed(4))));
    const beats = [...beatSet].sort((a, b) => a - b);
    // engrave 2: ties, accidentals and beam groups are worked out before drawing (see srLevelPrep).
    const lv = v2 ? srLevelPrep(piece.ts, staves, bounds, cap, pickup, keyAcc) : null;
    // Beam pairs of eighths that start on a beat (simple meters only).
    if (!lv && piece.ts[1] === 4)
        staves.forEach((st) => {
            const ev = st.data.ev;
            for (let i = 0; i + 1 < ev.length; i++) {
                const a = ev[i], b = ev[i + 1], rel = a.beat - (pickup % 1);
                if (!a.rest && !b.rest && !a.chord && !b.chord && a.dur === 0.5 && b.dur === 0.5 && Math.abs(rel - Math.round(rel)) < 1e-3 && Math.abs(b.beat - a.beat - 0.5) < 1e-3) {
                    a.beam = { first: true, mate: b };
                    b.beam = { first: false, mate: a };
                    i++;
                }
            }
        });
    // Each beat's column: its bar, how far it moves the pen (the shortest value there sets the room) and, per bar, how far the
    // notes reach above and below the first staff line (stems, flags, ledger lines, result marks, note names).
    const nBars = bounds.length + 1, barOf = beats.map((b) => bounds.filter((v) => v < b + 1e-3).length);
    // engrave 2 also leaves room before a beat for its accidentals.
    const adv = beats.map((b, i) => { let m = 4; staves.forEach((st) => st.data.ev.forEach((e) => { if (Math.abs(e.beat - b) < 1e-3)
        m = Math.min(m, e.dur); })); const w = 26 + Math.min(m, 4) * 14; return lv && i + 1 < beats.length ? w + (lv.room.get(Math.round(beats[i + 1] * 1000)) ?? 0) : w; });
    const barW = new Array<number>(nBars).fill(0), barTop = new Array<number>(nBars).fill(-14);
    const barBot = new Array<number>(nBars).fill(Math.max(lastSt.rel + 48 + (lastSt.clef === 'treble' ? 18 : 10), names ? lastSt.rel + 84 : 0));
    beats.forEach((b, i) => { barW[barOf[i]] += adv[i]; });
    staves.forEach((st) => st.data.ev.forEach((e) => {
        if (e.rest)
            return;
        const m = bounds.filter((v) => v < e.beat + 1e-3).length, y = st.rel + 48 + (st.refStep - ssStepOf(e.li, e.oct)) * 6, up = y > st.rel + 24;
        barTop[m] = Math.min(barTop[m], up ? y - 40 : y - 20);
        barBot[m] = Math.max(barBot[m], up ? y + 12 : y + 40);
    }));
    // engrave 2 with markings: a finger number sits above the right hand and below the left, so its bar takes more room.
    const marks = v2 ? piece.marks : undefined;
    const fingerRoom = new Set<string>();
    marks?.fingering.forEach((f) => {
        const m = Math.min(nBars - 1, bounds.filter((v) => v < f.beat + 1e-3).length);
        if (fingerRoom.has(f.hand + m))
            return;
        fingerRoom.add(f.hand + m);
        if (f.hand === 'rh')
            barTop[m] -= 12;
        else
            barBot[m] += 14;
    });
    // Systems: `starts` holds each one's first bar. The first system carries the time signature unless `noTs` omits it.
    const headW = (s: number) => 40 + ksw + (s === 0 && !piece.noTs ? 26 : 8);
    const sysW = (s: number, a: number, z: number) => { let w = headW(s) + 18 * (z - a - 1) + (z === nBars ? 20 : 12); for (let m = a; m < z; m++)
        w += barW[m]; return w; };
    const ends = (starts: number[]) => starts.map((a, s) => s + 1 < starts.length ? starts[s + 1] : nBars);
    const vert = (starts: number[]) => { const zs = ends(starts), top: number[] = [], bot: number[] = [], ys: number[] = []; let y = 6;
        starts.forEach((a, s) => { let t = 0, u = 0; for (let m = a; m < zs[s]; m++) {
            t = Math.min(t, barTop[m]);
            u = Math.max(u, barBot[m]);
        } top.push(t); bot.push(u); ys.push(y - t); y = y - t + u + 10; }); return { ys, H: y - 4 }; };
    let starts = [0], zoom = 1, sysY = [46], H = 0;
    const stretch: number[] = [1];
    if (lay && lay.width > 0) {
        const kCap = lay.cap ?? SR_SCALE_CAP, maxBars = Math.max(1, lay.maxBars ?? 4), maxH = lay.maxHeight || Infinity, kFloor = lay.floor ?? (lay.maxHeight ? 0.65 : 1);
        // Bars split evenly over the fewest systems that fit the width at the natural size; no system holds a single bar of
        // several (too little width for that keeps one system, which then scrolls).
        const plan = (per: number) => {
            for (let n = Math.ceil(nBars / per); n <= Math.max(1, Math.floor(nBars / 2)); n++) {
                const st = Array.from({ length: n }, (_, s) => Math.round(s * nBars / n)), zs = ends(st);
                if (st.every((a, s) => sysW(s, a, zs[s]) <= lay.width))
                    return st;
            }
            return null;
        };
        let best: { st: number[]; k: number } | null = null;
        for (let per = maxBars; per <= Math.max(maxBars, nBars); per++) {
            const st = plan(per);
            if (!st)
                continue;
            const zs = ends(st), wide = Math.max(...st.map((a, s) => sysW(s, a, zs[s]))), kk = Math.min(kCap, lay.width / wide, maxH / vert(st).H);
            if (!best || kk > best.k + 1e-3)
                best = { st, k: kk };
            if (maxH === Infinity)
                break;
        }
        if (!best) {
            const one = sysW(0, 0, nBars);
            best = { st: [0], k: Math.min(kCap, lay.width / one, maxH / vert([0]).H) };
        }
        starts = best.st;
        zoom = Math.max(kFloor, best.k);
        // Every system but a short last one is spread to the full width; the spacing grows at most 1.8 times.
        const zs = ends(starts), T = lay.width / zoom;
        starts.forEach((a, s) => {
            let sum = 0;
            for (let m = a; m < zs[s]; m++)
                sum += barW[m];
            const nat = sysW(s, a, zs[s]), last = s === starts.length - 1;
            // A page (`justify`) spreads further, and its last system too when it holds as many bars as the first.
            const full = lay.justify ? zs[s] - a >= zs[0] - starts[0] : nat >= 0.6 * T;
            stretch[s] = starts.length > 1 && nat < T && sum > 0 && (!last || full) ? Math.min(lay.justify ? 3 : 1.8, 1 + (T - nat) / sum) : 1;
        });
        const v = vert(starts);
        sysY = v.ys;
        H = v.H;
        // The stage's paper is a fixed box: there the score keeps at least the natural score's 150 units of height (centred),
        // as far as the box allows, so a short one-staff melody is never drawn shorter than before the layout.
        const pad = lay.maxHeight ? Math.min(150, lay.maxHeight / zoom) - H : 0;
        if (pad > 0) {
            sysY = sysY.map((y) => y + pad / 2);
            H += pad;
        }
    }
    const sysOfBar = (m: number) => { let s = 0; while (s + 1 < starts.length && starts[s + 1] <= m)
        s++; return s; };
    const notes: SrStaffNote[] = [], beatX: SrBeatX[] = [], systems: SrSystem[] = [], sysEnd: number[] = [];
    let body = '', head = '', nid = 0, x = 10, sy = 0;
    const barline = (bx: number, w: number) => `<line class="ss-line" x1="${bx}" y1="${staves[0].top}" x2="${bx}" y2="${lastSt.top + 48}" stroke="#1a1714" stroke-width="${w}"/>`;
    const openSystem = (s: number) => {
        sy = s;
        staves.forEach((st) => { st.top = sysY[s] + st.rel; });
        x = 10;
        staves.forEach((st) => { head += piece.perc ? rdPercClef(x + 4, st.top) : srClef(st.clef, x, st.top); });
        x += 30;
        staves.forEach((st) => { head += srKeySigG(st.clef, piece.keyN || 0, x, st.top).svg; });
        x += ksw;
        if (s === 0 && !piece.noTs) {
            staves.forEach((st) => { head += srTimeSigG(piece.ts, x, st.top); });
            x += 26;
        }
        else
            x += 8;
        sysX0[s] = x;
        systems.push({ yTop: staves[0].top - 8, yBot: lastSt.top + 56 });
    };
    // Where each system's music starts (after its clefs and signatures), and where each hand's notes were drawn (for the markings).
    const sysX0: number[] = [], markCols = new Map<string, SrMarkCol>();
    openSystem(0);
    // A tied note is not played again: it is drawn inside the group of the note it continues, which also lasts longer.
    const lastNote: Partial<Record<SrHand, SrStaffNote>> = {}, tiedMarkup = new Map<number, string>();
    let tiedKey = 0;
    // Each bar's left edge (its barline, or the end of the system's header) and right barline, for centring whole-bar rests.
    const barX0: number[] = [], barX1: number[] = [];
    let barLeft = x;
    // engrave 2: the noteheads each hand drew last (a tie starts from them), and the whole-bar rests to centre once drawn.
    const lastCol: Partial<Record<SrHand, { note: SrStaffNote; e: SrNoteEvent; x: number; y: number; sy: number }[]>> = {};
    const barRests: { m: number; top: number }[] = [];
    /** engrave 2: one hand's notes or rest at one beat. A note, or a chord, takes the same path; see srLevelPrep for what
     *  is decided before drawing. The markup of a plain note is the one drawn without the flag. */
    const drawLevel = (st: SrStave, here: SrEvent[], nx: number, m: number) => {
        here.forEach((e) => {
            if (!e.rest)
                return;
            lastCol[st.hand] = [];
            const start = m === 0 ? 0 : bounds[m - 1], len = m === 0 && pickup > 0 ? pickup : cap;
            if (Math.abs(e.beat - start) < 1e-3 && Math.abs(e.dur - len) < 1e-3) {
                body += `@@W${barRests.length}@@`;
                barRests.push({ m, top: st.top });
            }
            else
                body += srLevelRest(nx, st.top, e.dur);
        });
        const evs = here.filter((e): e is SrNoteEvent => !e.rest);
        if (!evs.length)
            return;
        const items = evs.map((e): SrChordItem => ({ e, step: ssStepOf(e.li, e.oct), y: 0, dx: 0 })).sort((p, q) => p.step - q.step);
        items.forEach((it) => { it.y = st.top + 48 + (st.refStep - it.step) * 6; });
        const col = evs[0].bcol, grp = col?.grp, dur = items[0].e.dur;
        const up = grp ? grp.up : items.reduce((sum, it) => sum + it.y, 0) / items.length > st.top + 24;
        let prev: SrChordItem|null = null;
        (up ? items : items.slice().reverse()).forEach((it) => { it.dx = prev && Math.abs(it.step - prev.step) === 1 && prev.dx === 0 ? (up ? 11.5 : -11.5) : 0; prev = it; });
        const lanes: number[][] = [];
        items.slice().reverse().forEach((it) => {
            if (!it.e.showAcc)
                return;
            let a = lanes.findIndex((l) => l.every((y) => Math.abs(y - it.y) >= 14));
            if (a < 0) {
                a = lanes.length;
                lanes.push([]);
            }
            lanes[a].push(it.y);
            it.ax = nx - 13 - a * 10 - (it.dx < 0 ? 11.5 : 0);
        });
        const top = items[items.length - 1], bot = items[0], sx = up ? nx + 5.6 : nx - 5.6;
        if (marks)
            markCols.set(st.hand + '|' + items[0].e.beat.toFixed(3), { x: nx, hi: top.y, lo: bot.y, up, sy, top: st.top });
        let stem = '';
        if (col && grp) {
            Object.assign(col, { x: nx, yHi: top.y, yLo: bot.y });
            stem = `@@G${col.id}@@`;
        }
        else
            stem = srStemLine(sx, (up ? bot : top).y, up ? top.y - 32 : bot.y + 32, dur, up);
        const from0 = lastCol[st.hand] ?? [], ends: { note: SrStaffNote; e: SrNoteEvent; x: number; y: number; sy: number }[] = [];
        const chord = items.length > 1, chordNames = names && chord ? items.map((it) => srSpellName(it.e.li, it.e.acc, opts.notation)).join(' ') : '';
        let fresh = true;
        items.forEach((it) => {
            const e = it.e, from = e.tied ? from0.find((p) => p.e.li === e.li && p.e.oct === e.oct && p.e.acc === e.acc) : undefined;
            let g = !from && fresh ? `<rect class="ss-box" x="${nx - 12}" y="${st.top - 6}" width="24" height="60" rx="4"/>` : '';
            if (it.ax != null)
                g += ssAccGlyph(e.acc, keyAcc[e.li], it.ax, it.y);
            g += srLedger2(nx + it.dx, it.y, st.top) + ssNotehead(nx + it.dx, it.y, dur, (st.refStep - it.step) % 2 === 0);
            if (it === (up ? bot : top))
                g += stem;
            if (from) {
                // The tie bends away from the stem (outwards on a chord); over a system break it is drawn in two halves.
                const below = chord ? it === bot : up;
                const arc = from.sy === sy ? srTieArc(from.x, nx, it.y, below)
                    : srTieArc(from.x, sysEnd[from.sy] - 2, from.y, below) + srTieArc(nx - 22, nx, it.y, below);
                tiedMarkup.set(from.note.nid, (tiedMarkup.get(from.note.nid) ?? '') + `<g class="ss-tied">${g}</g>` + arc);
                from.note.dur += e.dur;
                ends.push({ note: from.note, e, x: nx, y: it.y, sy });
                return;
            }
            let nm = '';
            if (names && !chord)
                nm = `<text class="ss-syl" x="${nx}" y="${st.top + 78}">${srSpellName(e.li, e.acc, opts.notation)}</text>`;
            else if (names && fresh) {
                const lab = st.hand === 'rh' ? top.e : bot.e;
                nm = `<text class="ss-syl" x="${nx}" y="${st.top + 78}">${srSpellName(lab.li, lab.acc, opts.notation)}</text><title>${chordNames}</title>`;
            }
            fresh = false;
            body += `<g class="ss-n" data-nid="${nid}" data-hand="${st.hand}">${g}${nm}@@T${nid}@@</g>`;
            const staffNote: SrStaffNote = { nid, hand: st.hand, midi: e.midi, beat: e.beat, dur: e.dur, x: nx, y: it.y, li: e.li, oct: e.oct, acc: e.acc, sy };
            notes.push(staffNote);
            ends.push({ note: staffNote, e, x: nx, y: it.y, sy });
            nid++;
        });
        lastCol[st.hand] = ends;
    };
    beats.forEach((b, bi) => {
        const s = sysOfBar(barOf[bi]);
        if (s > sy) {
            // Every system in turn, even one whose bars start no note.
            while (sy < s) {
                x += 6;
                body += barline(x, 1.3);
                barX1[barOf[bi] - 1] = x;
                beatX.push({ b, x, sy });
                sysEnd[sy] = x;
                openSystem(sy + 1);
            }
            barLeft = x;
        }
        else if (bounds.some((v) => Math.abs(v - b) < 1e-3)) {
            x += 6;
            body += barline(x, 1.3);
            barX1[barOf[bi] - 1] = barLeft = x;
            x += 12;
        }
        barX0[barOf[bi]] = barLeft;
        const nx = x + 10;
        staves.forEach((st) => {
            const here = st.data.ev.filter((e) => Math.abs(e.beat - b) < 1e-3), chord = here.filter((e): e is SrNoteEvent => !e.rest && !!e.chord);
            if (lv) {
                drawLevel(st, here, nx, barOf[bi]);
                return;
            }
            if (chord.length) {
                const items = chord.map((e): SrChordItem => ({ e, step: ssStepOf(e.li, e.oct), y: 0, dx: 0 })).sort((p, q) => p.step - q.step);
                items.forEach((it) => { it.y = st.top + 48 + (st.refStep - it.step) * 6; });
                const up = items.reduce((sum, it) => sum + it.y, 0) / items.length > st.top + 24, dur = items[0].e.dur;
                let prev: SrChordItem|null = null;
                (up ? items : items.slice().reverse()).forEach((it) => { it.dx = prev && Math.abs(it.step - prev.step) === 1 && prev.dx === 0 ? (up ? 11.5 : -11.5) : 0; prev = it; });
                const lanes: number[][] = [];
                items.slice().reverse().forEach((it) => {
                    if (it.e.acc === keyAcc[it.e.li])
                        return;
                    let a = lanes.findIndex((l) => l.every((y) => Math.abs(y - it.y) >= 14));
                    if (a < 0) {
                        a = lanes.length;
                        lanes.push([]);
                    }
                    lanes[a].push(it.y);
                    it.ax = nx - 13 - a * 10 - (it.dx < 0 ? 11.5 : 0);
                });
                const top = items[items.length - 1], bot = items[0], sx = up ? nx + 5.6 : nx - 5.6;
                const chordNames = names ? items.map((it) => notePcName(opts.notation, it.e.midi, (piece.keyN || 0) < 0)).join(' ') : '';
                items.forEach((it, k) => {
                    const e = it.e;
                    let g = k === 0 ? `<rect class="ss-box" x="${nx - 12}" y="${st.top - 6}" width="24" height="60" rx="4"/>` : '';
                    if (it.ax != null)
                        g += ssAccGlyph(e.acc, keyAcc[e.li], it.ax, it.y);
                    g += srLedger2(nx + it.dx, it.y, st.top) + ssNotehead(nx + it.dx, it.y, dur, (st.refStep - it.step) % 2 === 0);
                    if (it === (up ? bot : top))
                        g += srStemLine(sx, it.y, up ? top.y - 32 : bot.y + 32, dur, up);
                    if (k === 0 && chordNames)
                        g += `<text class="ss-syl" x="${nx}" y="${st.top + 78}">${(st.hand === 'rh' ? notePcName(opts.notation, top.e.midi, (piece.keyN || 0) < 0) : notePcName(opts.notation, bot.e.midi, (piece.keyN || 0) < 0))}</text><title>${chordNames}</title>`;
                    body += `<g class="ss-n" data-nid="${nid}" data-hand="${st.hand}">${g}</g>`;
                    notes.push({ nid, hand: st.hand, midi: e.midi, beat: e.beat, dur: e.dur, x: nx, y: it.y, li: e.li, oct: e.oct, acc: e.acc, sy });
                    nid++;
                });
            }
            here.forEach((e) => {
                if (e.rest) {
                    body += srRest(nx, st.top, e.dur);
                    return;
                }
                if (e.chord)
                    return;
                const y = st.top + 48 + (st.refStep - ssStepOf(e.li, e.oct)) * 6;
                const from = e.tied ? lastNote[st.hand] : undefined;
                const key = from ? -(++tiedKey) : nid;
                let g = '';
                if (e.acc !== keyAcc[e.li] && !from)
                    g += ssAccGlyph(e.acc, keyAcc[e.li], nx - 13, y);
                g += srLedger2(nx, y, st.top) + ssNotehead(nx, y, e.dur, (st.refStep - ssStepOf(e.li, e.oct)) % 2 === 0) + (e.beam ? `@@B${key}@@` : srStem2(nx, y, e.dur, st.top + 24));
                if (e.beam)
                    Object.assign(e, { nid: key, bx: nx, by: y, mid: st.top + 24 });
                if (from) {
                    // A tie over a system break leaves the first note towards the end of its line and reaches the second from the left.
                    const arc = from.sy === sy ? srTieArc(from.x, nx, y, y > st.top + 24)
                        : srTieArc(from.x, sysEnd[from.sy] - 2, from.y, from.y > sysY[from.sy] + st.rel + 24) + srTieArc(nx - 22, nx, y, y > st.top + 24);
                    tiedMarkup.set(from.nid, (tiedMarkup.get(from.nid) ?? '') + `<g class="ss-tied">${g}</g>` + arc);
                    from.dur += e.dur;
                    return;
                }
                const nm = names ? `<text class="ss-syl" x="${nx}" y="${st.top + 78}">${notePcName(opts.notation, e.midi, (piece.keyN || 0) < 0)}</text>` : '';
                body += `<g class="ss-n" data-nid="${nid}" data-hand="${st.hand}"><rect class="ss-box" x="${nx - 12}" y="${st.top - 6}" width="24" height="60" rx="4"/>${g}${nm}@@T${nid}@@</g>`;
                const staffNote: SrStaffNote = { nid, hand: st.hand, midi: e.midi, beat: e.beat, dur: e.dur, x: nx, y, li: e.li, oct: e.oct, acc: e.acc, sy };
                notes.push(staffNote);
                lastNote[st.hand] = staffNote;
                nid++;
            });
        });
        beatX.push({ b, x: nx, sy });
        x += adv[bi] * stretch[sy];
    });
    body = body.replace(/@@T(\d+)@@/g, (_, id: string) => tiedMarkup.get(Number(id)) ?? '');
    staves.forEach((st) => st.data.ev.forEach((a) => {
        if (!a.beam || !a.beam.first)
            return;
        const b = a.beam.mate;
        if (a.by === undefined || a.bx === undefined || a.mid === undefined || b.by === undefined || b.bx === undefined)
            return;
        const up = (a.by + b.by) / 2 > a.mid;
        let e1 = up ? a.by - 32 : a.by + 32, e2 = up ? b.by - 32 : b.by + 32;
        const d = e2 - e1;
        if (up) {
            if (d > 6)
                e2 = e1 + 6;
            else if (d < -6)
                e1 = e2 + 6;
        }
        else {
            if (d > 6)
                e1 = e2 - 6;
            else if (d < -6)
                e2 = e1 - 6;
        } // limit the slope by lengthening stems only
        const s1 = up ? a.bx + 5.6 : a.bx - 5.6, s2 = up ? b.bx + 5.6 : b.bx - 5.6, th = up ? 5 : -5, stem = (sx: number, y: number, ey: number) => `<line class="ss-stem" x1="${sx}" y1="${y}" x2="${sx}" y2="${ey}" stroke="#1a1714" stroke-width="1.6"/>`;
        body = body.replace(`@@B${a.nid}@@`, stem(s1, a.by, e1)).replace(`@@B${b.nid}@@`, stem(s2, b.by, e2) + `<path class="ss-beam" d="M ${s1},${e1} L ${s2},${e2} L ${s2},${e2 + th} L ${s1},${e1 + th} Z"/>`);
    }));
    x += 8;
    body += barline(x - 5, 1.2) + barline(x, 3);
    x += 6;
    beatX.push({ b: total, x, sy });
    sysEnd[sy] = x;
    barX1[nBars - 1] = x - 11;
    if (lv) {
        body = srLevelBeams(body, lv.groups);
        body = body.replace(/@@W(\d+)@@/g, (_, i: string) => {
            const r = barRests[Number(i)], c = (barX0[r.m] + barX1[r.m]) / 2;
            return `<rect class="ss-glyph ss-rest ss-rest-bar" x="${c - 6}" y="${r.top + 12}" width="12" height="5"/>`;
        });
    }
    if (marks)
        body += srLevelMarks(marks, markCols, (beat) => srBeatPt(beatX, beat), sysEnd, sysX0, (s) => sysY[s] + (lastSt.rel + 48) / 2);
    const W = lay ? Math.max(...sysEnd) + 6 : piece.compact ? x + 2 : Math.max(x + 6, 420);
    if (!lay)
        H = Math.max(lastSt.top + 48 + (names ? 38 : 22), 150);
    let staff = '';
    systems.forEach((_, s) => {
        const top = sysY[s], bot = sysY[s] + lastSt.rel + 48, end = lay ? sysEnd[s] : piece.compact ? x - 6 : W - 6;
        staves.forEach((st) => { for (let k = 0; k < 5; k++) {
            const ly = top + st.rel + k * 12;
            staff += `<line class="ss-line" x1="8" y1="${ly}" x2="${end}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`;
        } });
        staff += `<line class="ss-line" x1="8" y1="${top}" x2="8" y2="${bot}" stroke="#1a1714" stroke-width="1.6"/>`;
        if (staves.length > 1) {
            const midY = (top + bot) / 2;
            staff += `<path class="ss-brace" d="M 6,${top} C 1,${top + 12} 7,${midY - 14} 1,${midY} C 7,${midY + 14} 1,${bot - 12} 6,${bot}"/>`;
        }
    });
    const size = lay ? `width="${Math.floor(W * zoom)}" height="${Math.round(H * zoom)}"` : `width="${W}" height="${H}"`;
    return { svg: `<svg class="ss-svg" viewBox="0 0 ${W} ${H}" ${size} xmlns="http://www.w3.org/2000/svg">${staff}${head}${body}</svg>`, notes, beatX, total, W, H,
        yTop: systems[0].yTop, yBot: systems[0].yBot, systems, scale: zoom };
}
/** engrave 2: where one hand's note or chord at a beat was drawn: its x, its highest and lowest notehead, its stem's
 *  direction, its system and its staff's top line. */
export interface SrMarkCol { x: number; hi: number; lo: number; up: boolean; sy: number; top: number }
/** engrave 2: the markings of a level piece as one group drawn over the notes, the way a printed page shows them: dynamics
 *  and hairpins between the staves, a finger number above the right hand and below the left, a staccato dot or an accent
 *  on the notehead side, slurs on the notehead side too. They are decoration: no note group changes, and nothing is scored. */
export function srLevelMarks(marks: LevelMarkings, cols: ReadonlyMap<string, SrMarkCol>, at: (beat: number) => SrBeatX, sysEnd: readonly number[],
    sysX0: readonly number[], midY: (sy: number) => number): string {
    const col = (hand: string, beat: number) => cols.get(hand + '|' + beat.toFixed(3));
    const key = (hand: string, beat: number, below: boolean) => hand + '|' + beat.toFixed(3) + '|' + (below ? 'b' : 'a');
    // What already sits above or below a note: a finger number moves out of its way.
    const taken = new Set<string>();
    let out = '';
    for (const s of marks.slurs) {
        const a = col(s.hand, s.from), b = col(s.hand, s.to);
        if (!a || !b)
            continue;
        // Under the noteheads when the stems go up, over them otherwise.
        const below = a.up && b.up, d = below ? 1 : -1, ya = below ? a.lo + 9 : a.hi - 9, yb = below ? b.lo + 9 : b.hi - 9;
        const arc = (x1: number, y1: number, x2: number, y2: number) => {
            const m = (x1 + x2) / 2, c = (y1 + y2) / 2 + d * Math.min(26, 10 + (x2 - x1) * 0.1);
            return `<path class="ss-slur" d="M ${x1},${y1} Q ${m},${c} ${x2},${y2} Q ${m},${c - d * 3} ${x1},${y1} Z"/>`;
        };
        // Over a system break it is drawn in two halves, like a tie.
        out += a.sy === b.sy ? arc(a.x, ya, b.x, yb) : arc(a.x, ya, sysEnd[a.sy] - 3, ya + d * 2) + arc(sysX0[b.sy] - 6, yb + d * 2, b.x, yb);
        taken.add(key(s.hand, s.from, below));
        taken.add(key(s.hand, s.to, below));
    }
    for (const a of marks.articulations) {
        const c = col(a.hand, a.beat);
        if (!c)
            continue;
        const d = c.up ? 1 : -1, head = c.up ? c.lo : c.hi;
        if (a.kind === 'staccato') {
            // The dot sits in a space: the next one for a notehead in a space, the one after its line for a notehead on a line.
            const rel = head - c.top, onLine = rel > -1 && rel < 49 && Math.abs(rel / 12 - Math.round(rel / 12)) < 0.05;
            out += `<circle class="ss-art" cx="${c.x}" cy="${head + d * (onLine ? 18 : 12)}" r="2.1"/>`;
        }
        else {
            // The accent stays outside the staff.
            const y = c.up ? Math.max(head + 16, c.top + 60) : Math.min(head - 16, c.top - 12);
            out += `<path class="ss-art ss-accent" d="M ${c.x - 5.5},${y - 4} L ${c.x + 5.5},${y} L ${c.x - 5.5},${y + 4}"/>`;
        }
        taken.add(key(a.hand, a.beat, c.up));
    }
    for (const f of marks.fingering) {
        const c = col(f.hand, f.beat);
        if (!c)
            continue;
        // Above the right hand's note, stem and staff; below the left hand's.
        const below = f.hand === 'lh', free = taken.has(key(f.hand, f.beat, below)) ? 12 : 0;
        const y = below ? Math.max(c.top + 48, c.up ? c.lo + 6 : c.lo + 32) + 15 + free : Math.min(c.top, c.up ? c.hi - 32 : c.hi - 6) - 6 - free;
        out += `<text class="ss-finger" x="${c.x}" y="${y}">${f.finger}</text>`;
    }
    const dynAt = (beat: number) => marks.dynamics.some((d) => Math.abs(d.beat - beat) < 1e-3);
    for (const d of marks.dynamics) {
        const p = at(d.beat);
        out += `<text class="ss-dyn" x="${p.x}" y="${midY(p.sy) + 6}">${d.mark}</text>`;
    }
    for (const h of marks.hairpins) {
        const a = at(h.from), b = at(h.to), x1 = a.x + (dynAt(h.from) ? 18 : -4), x2 = b.x - (dynAt(h.to) ? 18 : 8);
        // One wedge a system; over a break each part goes on from where the last one stopped.
        const parts: { sy: number; x1: number; x2: number }[] = [];
        for (let s = a.sy; s <= b.sy; s++) {
            const p = { sy: s, x1: s === a.sy ? x1 : sysX0[s], x2: s === b.sy ? x2 : sysEnd[s] - 6 };
            if (p.x2 - p.x1 >= 10)
                parts.push(p);
        }
        const from = h.kind === 'cresc' ? 0 : 6, to = h.kind === 'cresc' ? 6 : 0;
        parts.forEach((p, i) => {
            const y = midY(p.sy), h1 = from + (to - from) * i / parts.length, h2 = from + (to - from) * (i + 1) / parts.length;
            out += `<path class="ss-hairpin" d="M ${p.x1},${y - h1} L ${p.x2},${y - h2} M ${p.x1},${y + h1} L ${p.x2},${y + h2}"/>`;
        });
    }
    return out ? `<g class="ss-marks" aria-hidden="true">${out}</g>` : '';
}

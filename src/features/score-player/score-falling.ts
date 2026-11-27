import * as theory from '../../domain/theory.js';
import { type AnNote } from '../../domain/score-types.js';

const pc = theory.pitchClass;

/* falling notes: a dark stage with lanes, bar lines and an integrated keyboard; notes coloured by hand */
export interface FallTimedNote { n: AnNote; i: number; start: number; finish: number; sound: number; }
export interface FallKeyRect { x: number; w: number; black: boolean; }
export interface FallGeo { lo: number; hi: number; W: number; keys: Map<number, FallKeyRect>; whites: number[]; kw: number; bw: number; hitY?: number; kh?: number; }
export interface FallHit { i: number; x: number; y: number; w: number; h: number; hand: string; }
export interface FallFlash { x: number; y: number; w: number; rgb: string; life: number; max: number; }
export interface FallParticle { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; col: string; }
export interface FallState { mode: 'score' | 'fall'; raf: number; position: number; origin: number; audioStart: number; factor: number; notes: FallTimedNote[]; hits: FallHit[]; zoom: number;
    geo: FallGeo | null; particles: FallParticle[]; flashes: FallFlash[]; lastT: number | null; lastFrame: number; resume: { sel: boolean; } | null;
    fingerSrc?: readonly AnNote[]; hasFinger?: boolean; source?: readonly AnNote[]; tempoSource?: readonly { beat: number; bpm: number; }[]; end: number;
    laneSrc?: readonly AnNote[]; lanes: Set<number>; tickSrc?: FallTimedNote[]; tickTempo?: readonly { beat: number; bpm: number; }[]; tickEnd?: number; tickExpanded?: boolean;
    beatSrc?: FallTimedNote[]; beatTempo?: readonly { beat: number; bpm: number; }[]; beats?: { t: number; acc: boolean; }[]; press?: Map<number, number>;
    maxDur?: number; sorted?: boolean;
    gradCache?: { ctx: CanvasRenderingContext2D; hitY: number; bg: CanvasGradient; hg: CanvasGradient; felt: CanvasGradient; feltShadow: CanvasGradient } | null;
    kbCache?: { canvas: HTMLCanvasElement; key: string } | null;
    tlCache?: { p?: string; valText?: string; loopHidden?: boolean; loopLeft?: string; loopWidth?: string; aHidden?: boolean; aLeft?: string; bHidden?: boolean; bLeft?: string } | null; }
export const FALL_SEC = 3.2, FALL_FONT = '"Bodoni Moda",Georgia,serif', FALL_SEL = '#6aa8ff', FALL_BLACK = new Set([1, 3, 6, 8, 10]), FALL_NUDGE: Readonly<Record<number, number>> = { 1: -.12, 3: .12, 6: -.16, 8: 0, 10: .16 };
// Right hand: warm coral from the app's accent family; left hand: cool teal. lit = sounding.
export interface FallHandColours { a: string; b: string; lit: string[]; rgb: string; key: string[]; ink: string; }
export interface FallPalette { rh: FallHandColours; lh: FallHandColours; }
export const FALL_COL: FallPalette = { rh: { a: '#ffb38f', b: '#e65f3c', lit: ['#ffdccb', '#ff8257'], rgb: '255,128,92', key: ['#ffd0b8', '#f2774e'], ink: 'rgba(72,20,6,.8)' },
    lh: { a: '#8de5f2', b: '#2a96d2', lit: ['#cdf7fd', '#46c2ef'], rgb: '72,196,240', key: ['#c0f1f9', '#3caee1'], ink: 'rgba(4,36,58,.8)' } };
// Colour palettes for the two hands (RH first). "classic" is the familiar green/blue; "contrast" stays distinct for most colour-vision types.
export const FALL_PAL = { etude: FALL_COL,
    classic: { rh: { a: '#9be38f', b: '#3fa83a', lit: ['#d6f8cf', '#68d35e'], rgb: '110,220,96', key: ['#c9f2c0', '#55c04a'], ink: 'rgba(8,48,6,.82)' },
        lh: { a: '#9ab8ff', b: '#3a6fe0', lit: ['#d5e2ff', '#6d97ff'], rgb: '110,150,255', key: ['#c5d6ff', '#5a85f0'], ink: 'rgba(6,22,70,.85)' } },
    contrast: { rh: { a: '#ffe27a', b: '#f2b400', lit: ['#fff4c4', '#ffcf33'], rgb: '255,205,40', key: ['#ffeaa0', '#f5c020'], ink: 'rgba(66,42,0,.85)' },
        lh: { a: '#c9a2ff', b: '#7f3ff0', lit: ['#e8d8ff', '#a173ff'], rgb: '160,110,255', key: ['#dcc5ff', '#9460f5'], ink: 'rgba(40,6,86,.85)' } } };
export const FALL_YOU = ['#ffe9a8', '#f5bd3c'];
export function fallPalette(name: string): FallPalette { return name === 'etude' || name === 'classic' || name === 'contrast' ? FALL_PAL[name] : FALL_COL; }
export function fallKeys(lo: number, hi: number, W: number) {
    const whites: number[] = [], keys = new Map<number, FallKeyRect>();
    for (let m = lo; m <= hi; m++)
        if (!FALL_BLACK.has(pc(m)))
            whites.push(m);
    const kw = W / whites.length, bw = kw * .6;
    whites.forEach((m, i) => keys.set(m, { x: i * kw, w: kw, black: false }));
    for (let m = lo; m <= hi; m++)
        if (FALL_BLACK.has(pc(m))) {
            const l = keys.get(m - 1);
            if (l)
                keys.set(m, { x: l.x + kw - bw / 2 + FALL_NUDGE[pc(m)] * bw, w: bw, black: true });
        }
    return { lo, hi, W, keys, whites, kw, bw };
}
export function fallRR(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
export function fallKeyPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.closePath(); }
// Draws one black key with cast shadow, outer side bevels, lacquered top face, and sloped front face matching the main dock.
export function fallDrawBlackKey(ctx: CanvasRenderingContext2D, x: number, top: number, w: number, bh: number, br: number, c: string[] | null, isWait: boolean, pulse: number) {
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    fallKeyPath(ctx, x + (c ? 1.5 : 3.5), top + (c ? 1.5 : 2.5), w, bh, br);
    ctx.fill();
    ctx.fillStyle = '#030303';
    fallKeyPath(ctx, x, top, w, bh, br);
    ctx.fill();
    if (c) {
        const g = ctx.createLinearGradient(0, top, 0, top + bh);
        if (c === FALL_YOU) {
            g.addColorStop(0, '#e5b344');
            g.addColorStop(.55, '#c48c22');
            g.addColorStop(.88, '#a16f15');
            g.addColorStop(1, '#78500c');
        }
        else {
            g.addColorStop(0, c[1]);
            g.addColorStop(1, c[0]);
        }
        ctx.fillStyle = g;
    }
    else {
        const side = ctx.createLinearGradient(x, 0, x + w, 0);
        side.addColorStop(0, '#3e3e3e');
        side.addColorStop(.05, '#242424');
        side.addColorStop(.12, '#131313');
        side.addColorStop(.88, '#0e0e0e');
        side.addColorStop(.95, '#060606');
        side.addColorStop(1, '#101010');
        ctx.fillStyle = side;
    }
    fallKeyPath(ctx, x, top, w, bh, br);
    ctx.fill();
    ctx.strokeStyle = c ? (c === FALL_YOU ? 'rgba(255,245,190,.5)' : 'rgba(0,0,0,.6)') : '#030303';
    ctx.lineWidth = 1;
    fallKeyPath(ctx, x, top, w, bh, br);
    ctx.stroke();

    const lx = x + w * .12, lw = w * .76, lh = bh * .915, lbr = Math.min(3, lw * .2);
    if (c) {
        const tg = ctx.createLinearGradient(0, top, 0, top + lh);
        tg.addColorStop(0, 'rgba(0,0,0,.2)');
        tg.addColorStop(.65, 'rgba(0,0,0,.04)');
        tg.addColorStop(.92, 'rgba(255,255,255,.18)');
        tg.addColorStop(.98, 'rgba(255,255,255,.42)');
        tg.addColorStop(1, 'rgba(255,255,255,.2)');
        ctx.fillStyle = tg;
        fallKeyPath(ctx, lx, top, lw, lh, lbr);
        ctx.fill();
    }
    else {
        const tg = ctx.createLinearGradient(0, top, 0, top + lh);
        tg.addColorStop(0, '#0a0a0a');
        tg.addColorStop(.45, '#111111');
        tg.addColorStop(.78, '#151515');
        tg.addColorStop(.92, '#1b1b1b');
        tg.addColorStop(.98, '#262626');
        tg.addColorStop(1, '#2e2e2e');
        ctx.fillStyle = tg;
        fallKeyPath(ctx, lx, top, lw, lh, lbr);
        ctx.fill();
        const rec = ctx.createLinearGradient(0, top, 0, top + lh * .22);
        rec.addColorStop(0, 'rgba(0,0,0,.6)');
        rec.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rec;
        fallKeyPath(ctx, lx, top, lw, lh, lbr);
        ctx.fill();
        const spec = ctx.createLinearGradient(lx, 0, lx + lw, 0);
        spec.addColorStop(0, 'rgba(255,255,255,0)');
        spec.addColorStop(.17, 'rgba(255,255,255,0)');
        spec.addColorStop(.22, 'rgba(255,255,255,.12)');
        spec.addColorStop(.26, 'rgba(255,255,255,.12)');
        spec.addColorStop(.31, 'rgba(255,255,255,0)');
        spec.addColorStop(.84, 'rgba(255,255,255,0)');
        spec.addColorStop(.95, 'rgba(255,255,255,.03)');
        spec.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = spec;
        fallKeyPath(ctx, lx, top, lw, lh, lbr);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.42)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(lx + lbr, top + lh - .6);
        ctx.lineTo(lx + lw - lbr, top + lh - .6);
        ctx.stroke();
    }

    const fy0 = top + lh, fy1 = top + bh, fyMid = fy0 + (fy1 - fy0) * .78;
    ctx.beginPath();
    ctx.moveTo(lx, fy0);
    ctx.lineTo(lx + lw, fy0);
    ctx.lineTo(x + w, fyMid);
    ctx.lineTo(x + w * .96, fy1);
    ctx.lineTo(x + w * .04, fy1);
    ctx.lineTo(x, fyMid);
    ctx.closePath();
    if (c) {
        const fg = ctx.createLinearGradient(0, fy0, 0, fy1);
        fg.addColorStop(0, 'rgba(255,255,255,.22)');
        fg.addColorStop(.35, 'rgba(0,0,0,.2)');
        fg.addColorStop(1, 'rgba(0,0,0,.42)');
        ctx.fillStyle = fg;
        ctx.fill();
    }
    else {
        const fg = ctx.createLinearGradient(0, fy0, 0, fy1);
        fg.addColorStop(0, '#3c3c3c');
        fg.addColorStop(.2, '#272727');
        fg.addColorStop(.55, '#191919');
        fg.addColorStop(1, '#0f0f0f');
        ctx.fillStyle = fg;
        ctx.fill();
        const fl = ctx.createLinearGradient(x, 0, x + w, 0);
        fl.addColorStop(0, 'rgba(255,255,255,.08)');
        fl.addColorStop(.4, 'rgba(255,255,255,0)');
        fl.addColorStop(1, 'rgba(0,0,0,.3)');
        ctx.fillStyle = fl;
        ctx.fill();
    }
    if (isWait) {
        ctx.fillStyle = 'rgba(255,196,64,' + (.45 + .4 * pulse).toFixed(3) + ')';
        fallKeyPath(ctx, x, top, w, bh, br);
        ctx.fill();
    }
}

/** Fresh falling-notes state for one Score Player controller. */
export function createFallState(): FallState {
    return { mode: 'score', raf: 0, position: 0, origin: 0, audioStart: 0, factor: 1, notes: [], hits: [], zoom: 1, geo: null, particles: [], flashes: [], lastT: null, lastFrame: 0, resume: null, end: 0, lanes: new Set() };
}

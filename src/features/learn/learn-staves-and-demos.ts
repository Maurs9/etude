import * as theory from '../../domain/theory.js';
import { byId } from '../../domain/dom.js';
import { renderGrandStaff } from '../../domain/grand-staff.js';
import {
  ACCOMP_PATTERNS, ACCOMP_PROGS, LACC_CH, progChordTpl, type AccompanimentEvent,
} from '../../domain/repertoire-data.js';
import {
  xmlEsc, type LStaffSpec, type SrHand, type SrRenderResult,
} from '../../domain/score-types.js';
import type { LearnText } from '../../locales/content-types.js';
import type { AppHost } from '../../domain/views.js';
import { lStaffFit } from './learn-widgets.js';

const SCALES = theory.SCALE_DEFINITIONS;
const CHORDS = theory.CHORD_TEMPLATES;
const PROGS = theory.PROGRESSION_TEMPLATES;
const pc = theory.pitchClass;

export const LVEL: Record<string, number> = { pp: 40, p: 55, mp: 70, mf: 84, f: 100, ff: 112 };
export const LBLUES = theory.TWELVE_BAR_BLUES_ROOTS;

type LDynMark = ['dyn', number, string];
type LTieMark = ['slur' | 'tie', number, number, SrHand?];

function escHtml(s: string | number | undefined): string {
  return String(s).replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}

export function lVel(S: LStaffSpec, b: number): number {
  const M = S.marks || [];
  let base = 80;
  let bb = -1;
  M.forEach((m) => {
    if (m[0] === 'dyn' && LVEL[m[2]] && m[1] <= b + 1e-3 && m[1] >= bb) {
      base = LVEL[m[2]];
      bb = m[1];
    }
  });
  M.forEach((m) => {
    if ((m[0] === 'cr' || m[0] === 'dim') && b >= m[1] && b <= m[2]) {
      const end = m[2];
      const nx = M
        .filter((x): x is LDynMark => x[0] === 'dyn' && !!LVEL[x[2]] && x[1] >= end - 0.5)
        .sort((a, c) => a[1] - c[1])[0];
      if (nx) base = base + (LVEL[nx[2]] - base) * (b - m[1]) / Math.max(0.5, nx[1] - m[1]);
    }
  });
  if (M.some((m) => m[0] === 'dyn' && m[2] === 'sfz' && Math.abs(m[1] - b) < 0.02)) base = 118;
  if (M.some((m) => m[0] === 'acc' && Math.abs(m[1] - b) < 0.02)) base = Math.min(124, base + 24);
  return Math.round(base);
}

export interface LearnStavesDeps {
  host: AppHost;
  getStaves: () => Record<string, LStaffSpec>;
  lt: (a: LearnText) => string;
  getGen: () => number;
  learnHalt: () => void;
  learnTimer: (fn: () => void, ms: number) => void;
  learnLight: (midis: number[], durMs: number) => void;
  lSeqLight: (chords: number[][], stepMs: number, holdMs: number) => void;
  learnSay: (msg: string | null) => void;
  learnCtxTime: () => number;
}

export function createLearnStavesAndDemos(deps: LearnStavesDeps) {
  const {
    host, getStaves, lt, getGen, learnHalt, learnTimer, learnLight, lSeqLight, learnSay, learnCtxTime,
  } = deps;
  const LSR: Record<string, SrRenderResult> = {};

  function lStaffSvg(key: string): string {
    const S = getStaves()[key];
    const P = Object.assign({ noNames: true }, S.p);
    const r = renderGrandStaff(P, undefined, { namesVisible: false, notation: host.i18n.notation(), proportional: false });
    LSR[key] = r;
    const lhTop = P.rh ? 150 : 46;
    const botY = (P.lh ? lhTop : 46) + 48;
    const dynY = 124;
    const rnY = botY + 24;
    const top = (h: string) => (h === 'lh' ? lhTop : 46);
    const bx = (b: number) => {
      const pts = r.beatX;
      for (let i = 0; i < pts.length - 1; i++) {
        if (b >= pts[i].b - 1e-3 && b <= pts[i + 1].b + 1e-3) {
          const f = (b - pts[i].b) / Math.max(1e-3, pts[i + 1].b - pts[i].b);
          return pts[i].x + Math.min(1, Math.max(0, f)) * (pts[i + 1].x - pts[i].x);
        }
      }
      return pts[pts.length - 1].x;
    };
    const nAt = (b: number, h: SrHand | undefined) => {
      const c = r.notes.filter((n) => Math.abs(n.beat - b) < 0.02 && (!h || n.hand === h));
      return c.length ? c.reduce((a, n) => (n.y < a.y ? n : a)) : null;
    };
    const many = (b: number) => r.notes.filter((n) => Math.abs(n.beat - b) < 0.02).length > 1;
    const T = (x: number, y: number, s: string, c: string, anc?: string) =>
      '<text class="lm ' + (c || '') + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '"' + (anc ? ' text-anchor="' + anc + '"' : '') + '>' + s + '</text>';
    let out = '';
    let needH = 0;
    (S.marks || []).forEach((mk) => {
      const k = mk[0];
      const b = mk[1];
      if (k === 'dyn') {
        out += T(bx(b) - 6, dynY, mk[2], 'lm-dyn');
      } else if (k === 'cr' || k === 'dim') {
        const x1 = bx(b);
        const x2 = bx(mk[2]);
        const y = dynY - 5;
        out += '<path class="lm-ln" d="' + (k === 'cr'
          ? 'M' + x2 + ',' + (y - 5) + ' L' + x1 + ',' + y + ' L' + x2 + ',' + (y + 5)
          : 'M' + x1 + ',' + (y - 5) + ' L' + x2 + ',' + y + ' L' + x1 + ',' + (y + 5)) + '"/>';
      } else if (k === 'acc' || k === 'stac' || k === 'ten') {
        const n = nAt(b, mk[2]);
        if (!n) return;
        const up = !many(b) && n.y > top(n.hand) + 24;
        const y = up ? n.y + 15 : n.y - 15;
        const x = n.x;
        out += k === 'acc'
          ? '<path class="lm-ln" d="M' + (x - 5) + ',' + (y - 4) + ' L' + (x + 5) + ',' + y + ' L' + (x - 5) + ',' + (y + 4) + '"/>'
          : k === 'stac'
            ? '<circle class="lm-f" cx="' + x + '" cy="' + y + '" r="2"/>'
            : '<path class="lm-ln" d="M' + (x - 5) + ',' + y + ' L' + (x + 5) + ',' + y + '"/>';
      } else if (k === 'fer') {
        const n = nAt(b, mk[2]);
        if (!n) return;
        const y = Math.min(n.y - 16, top(n.hand) - 8);
        const x = n.x;
        out += '<path class="lm-ln" d="M' + (x - 8) + ',' + y + ' A8,8 0 0 1 ' + (x + 8) + ',' + y + '"/><circle class="lm-f" cx="' + x + '" cy="' + (y - 2) + '" r="1.8"/>';
      } else if (k === 'tr') {
        const n = nAt(b, mk[2]);
        if (n) out += T(n.x - 5, Math.min(n.y - 16, top(n.hand) - 8), 'tr', 'lm-it');
      } else if (k === 'fing') {
        const n = nAt(b, mk[3]);
        if (n) out += T(n.x, top(n.hand) - 8, mk[2], 'lm-sm', 'middle');
      } else if (k === 'slur' || k === 'tie') {
        const n1 = nAt(b, mk[3]);
        const n2 = nAt(mk[2], mk[3]);
        if (!n1 || !n2) return;
        const mid = top(n1.hand) + 24;
        const below = n1.y > mid && n2.y > mid;
        const s = below ? 1 : -1;
        const x1 = n1.x + (k === 'tie' ? 6 : 0);
        const x2 = n2.x - (k === 'tie' ? 6 : 0);
        const y1 = n1.y + s * (k === 'tie' ? 8 : 11);
        const y2 = n2.y + s * (k === 'tie' ? 8 : 11);
        const cy = (below ? Math.max(y1, y2) : Math.min(y1, y2)) + s * (k === 'tie' ? 8 : 14);
        out += '<path class="lm-sl" d="M' + x1 + ',' + y1 + ' C' + (x1 + (x2 - x1) * 0.25) + ',' + cy + ' ' + (x1 + (x2 - x1) * 0.75) + ',' + cy + ' ' + x2 + ',' + y2 + '"/>';
      } else if (k === 'tri') {
        const x1 = bx(b) - 4;
        const x2 = bx(mk[2]) + 4;
        const y = 34;
        out += '<path class="lm-ln" d="M' + x1 + ',' + (y + 4) + ' L' + x1 + ',' + y + ' L' + (x2 + x1) / 2 + ',' + y + ' M' + (x2 + x1) / 2 + ',' + y + ' L' + x2 + ',' + y + ' L' + x2 + ',' + (y + 4) + '"/>' +
          T((x1 + x2) / 2, y - 3, '3', 'lm-it', 'middle');
      } else if (k === 'txt') {
        out += T(bx(b) - 6, 18, lt(mk[2]), 'lm-tx');
      } else if (k === 'rn') {
        out += T(bx(b), P.lh ? rnY : dynY, mk[2], 'lm-rn', 'middle');
        if (P.lh) needH = Math.max(needH, rnY + 12);
      } else if (k === 'ped') {
        const y = P.lh ? botY + 22 : dynY;
        out += T(bx(b) - 8, y, 'Ped.', 'lm-it') + T(bx(mk[2]) + 4, y, '✱', 'lm-sm');
        if (P.lh) needH = Math.max(needH, y + 10);
      } else if (k === 'rs' || k === 're') {
        const end = k === 're' && b >= r.total - 1e-3;
        const xb = end ? bx(r.total) : bx(b) - (b < 1e-3 ? 20 : 22);
        const dir = k === 'rs' ? 1 : -1;
        out += '<rect class="lm-f" x="' + (xb - (k === 'rs' ? 0 : 3)) + '" y="46" width="3" height="' + (botY - 46) + '"/><line class="lm-ln" x1="' + (xb + dir * 6) + '" y1="46" x2="' + (xb + dir * 6) + '" y2="' + botY + '"/>';
        [46].concat(P.rh && P.lh ? [150] : []).forEach((st) => {
          out += '<circle class="lm-f" cx="' + (xb + dir * 11) + '" cy="' + (st + 18) + '" r="2.2"/><circle class="lm-f" cx="' + (xb + dir * 11) + '" cy="' + (st + 30) + '" r="2.2"/>';
        });
      }
    });
    let svg = r.svg;
    if (needH) {
      svg = svg.replace(/viewBox="0 0 ([\d.]+) ([\d.]+)" width="([\d.]+)" height="([\d.]+)"/, (_m: string, w: string, h: string) => {
        const H = Math.max(+h, needH);
        return 'viewBox="0 0 ' + w + ' ' + H + '" width="' + w + '" height="' + H + '"';
      });
    }
    svg = svg.replace(/<g class="ss-n" data-nid="(\d+)"([^>]*)>/g, (tag: string, id: string) => {
      const n = r.notes[+id];
      if (!n) return tag;
      const label = host.i18n.t('lu_note_aria', host.i18n.noteName(n.midi, (P.keyN || 0) < 0), Math.floor(n.beat - (P.pickup || 0) + 1e-3) + 1);
      return tag.slice(0, -1) + ' tabindex="0" role="button" aria-label="' + escHtml(label) + '">';
    });
    svg = svg.replace('<svg class="ss-svg"', '<svg class="ss-svg" role="group" aria-label="' + escHtml(host.i18n.t('lstaff_caption_' + key)) + '"');
    return lStaffFit(svg.replace('</svg>', out + '</svg>'), r.W);
  }

  function lStaffHTML(key: string): string {
    const S = getStaves()[key];
    if (!S) return '';
    return '<figure class="lstaff" data-lstaff="' + key + '"><div class="ss-wrap lstaff-svg">' + lStaffSvg(key) +
      '</div><figcaption><button type="button" class="btn ghost sm" data-lplay="' + key + '" aria-pressed="false">' +
      host.i18n.t('lu_play_ex') + '</button><span>' + xmlEsc(host.i18n.t('lstaff_caption_' + key)) +
      ' <em class="lstaff-hint">' + host.i18n.t('lu_staff_hint') + '</em></span></figcaption></figure>';
  }

  async function lStaffPlay(key: string, btn: HTMLElement): Promise<void> {
    const was = btn.getAttribute('aria-pressed') === 'true';
    learnHalt();
    if (was) return;
    host.audio.ensure();
    if (!await host.audio.preparePiano()) return;
    if (host.nav.activeView() !== 'learn') return;
    const g = getGen();
    btn.setAttribute('aria-pressed', 'true');
    btn.textContent = host.i18n.t('lu_stop');
    const S = getStaves()[key];
    const r = LSR[key];
    const spb = 60 / (S.bpm || 90);
    const fig = btn.closest('.lstaff');
    if (!fig) throw new TypeError('Étude: play button outside its staff');
    const svg = fig.querySelector('svg');
    const wrap = fig.querySelector('.lstaff-svg');
    if (!svg || !wrap) throw new TypeError('Étude: staff figure is incomplete');
    const M = S.marks || [];
    const has = (k: string, b: number) => M.some((m) => m[0] === k && Math.abs(m[1] - b) < 0.02);
    const ties = M.filter((m): m is LTieMark => m[0] === 'tie');
    const cap = S.p.ts[1] === 8 ? S.p.ts[0] * 0.5 : S.p.ts[0];
    const pk = S.p.pickup || 0;
    const step = S.p.ts[1] === 8 ? 1.5 : 1;
    const t0 = learnCtxTime() + 0.15;
    let off = 0;
    const segs: [number, number][] = S.seq || [[0, r.total]];
    segs.forEach(([a, z]) => {
      r.notes.filter((n) => n.beat >= a - 1e-3 && n.beat < z - 1e-3).forEach((n) => {
        if (ties.some((m) => Math.abs(m[2] - n.beat) < 0.02 && r.notes.some((o) => o.midi === n.midi && Math.abs(o.beat - m[1]) < 0.02))) return;
        let dur = n.dur;
        const tie = ties.find((m) => Math.abs(m[1] - n.beat) < 0.02);
        if (tie) {
          const o = r.notes.find((x) => x.midi === n.midi && Math.abs(x.beat - tie[2]) < 0.02);
          if (o) dur += o.dur;
        }
        if (has('fer', n.beat)) dur *= 1.8;
        const snd = has('stac', n.beat) ? dur * 0.4 : dur * 0.95;
        const at = off + n.beat - a;
        const vel = lVel(S, n.beat);
        if (has('tr', n.beat)) {
          const up = [4, 11].includes(pc(n.midi)) ? 1 : 2;
          const k = Math.max(2, Math.floor(dur / 0.125));
          for (let i = 0; i < k; i++) {
            host.audio.previewNote(n.midi + (i % 2 ? up : 0), t0 + (at + i * dur / k) * spb, dur / k * spb, vel);
          }
        } else {
          host.audio.previewNote(n.midi, t0 + at * spb, snd * spb, vel);
        }
        const found = svg.querySelector('.ss-n[data-nid="' + n.nid + '"]');
        const el = found instanceof SVGElement ? found : null;
        learnTimer(() => {
          if (el) el.dataset.s = 'now';
          host.dock.mark(n.midi, 'target', true);
          if (wrap.scrollWidth > wrap.clientWidth + 4) {
            wrap.scrollLeft = Math.max(0, n.x - wrap.clientWidth * 0.4);
          }
        }, at * spb * 1000 + 150);
        learnTimer(() => {
          if (el) delete el.dataset.s;
          host.dock.mark(n.midi, null, true);
        }, (at + dur) * spb * 1000 + 120);
      });
      if (S.click) {
        for (let b = Math.ceil((a - pk) / step - 1e-3) * step + pk; b < z - 1e-3; b += step) {
          host.metro.click(t0 + (off + b - a) * spb, Math.abs(((b - pk) % cap + cap) % cap) < 1e-3);
        }
      }
      off += z - a;
    });
    learnTimer(() => {
      if (g !== getGen()) return;
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = host.i18n.t('lu_play_ex');
      host.dock.clear('target');
    }, off * spb * 1000 + 700);
  }

  async function lStaffNote(gEl: HTMLElement | SVGElement): Promise<void> {
    const fig = gEl.closest('.lstaff');
    if (!(fig instanceof HTMLElement)) return;
    const key = fig.dataset.lstaff ?? '';
    const n = LSR[key] && LSR[key].notes[Number(gEl.dataset.nid)];
    if (!n) return;
    learnHalt();
    host.audio.ensure();
    if (!await host.audio.preparePiano()) return;
    host.audio.previewNote(n.midi, learnCtxTime() + 0.02, 0.9, 92);
    gEl.dataset.s = 'now';
    learnLight([n.midi], 1100);
    const g = getGen();
    setTimeout(() => {
      if (g === getGen()) delete gEl.dataset.s;
    }, 700);
    learnSay(host.i18n.noteName(n.midi, (getStaves()[key].p.keyN || 0) < 0));
  }

  function lBarsHTML(): string {
    const rn: Record<number, string> = { 0: 'I7', 5: 'IV7', 7: 'V7' };
    return '<div class="lbars" role="list" aria-label="' + host.i18n.t('lw_blues') + '">' +
      LBLUES.map((d, i) => '<span role="listitem" data-bar="' + i + '"><b>' + rn[d] + '</b><small>' + host.i18n.pcName(d, d === 5) + '7</small></span>').join('') + '</div>';
  }

  function lDots(btn: HTMLElement, n: number, strong: (i: number) => number): Element[] {
    const row = btn && btn.closest('.demo-row');
    if (!row) return [];
    let bd = row.nextElementSibling;
    if (!bd || !bd.classList.contains('lbeat')) {
      bd = document.createElement('div');
      bd.className = 'lbeat';
      bd.setAttribute('aria-hidden', 'true');
      row.after(bd);
    }
    bd.innerHTML = Array.from({ length: n }, (_, i) =>
      '<span' + (strong(i) === 2 ? ' class="s"' : strong(i) === 1 ? ' class="m"' : '') + '>' + (i + 1) + '</span>').join('');
    return [...bd.children];
  }

  function demoBeat(kind: string, btn: HTMLElement): void {
    const t0 = learnCtxTime() + 0.1;
    let n: number;
    let step: number;
    let total: number;
    let lvl: (i: number) => number;
    let lab: string;
    if (kind === '68') {
      n = 6; step = 0.21; total = 12;
      lvl = (i: number) => (i === 0 ? 2 : i === 3 ? 1 : 0);
      lab = '6/8';
    } else if (kind === '3t') {
      n = 12; step = 60 / 80 / 3; total = 24;
      lvl = (i: number) => (i === 0 ? 2 : i % 3 === 0 ? 1 : 0);
      lab = '4/4 ×3';
    } else {
      n = +kind || 4; step = 60 / 96; total = n * 2;
      lvl = (i: number) => (i === 0 ? 2 : 0);
      lab = n + '/4';
    }
    const dots = lDots(btn, n, lvl);
    for (let i = 0; i < total; i++) {
      const k = i % n;
      host.metro.click(t0 + i * step, lvl(k) === 2 || (kind === '3t' && lvl(k) === 1));
      if (kind === '3t' && k % 3 === 0) host.audio.previewNote(72, t0 + i * step, step * 2.6, 70);
      learnTimer(() => dots.forEach((d, j) => d.classList.toggle('on', j === k)), (i * step + 0.1) * 1000);
    }
    learnTimer(() => dots.forEach((d) => d.classList.remove('on')), (total * step + 0.4) * 1000);
    learnSay(host.i18n.t('lu_beat_say', lab));
  }

  async function runDemo(spec: string | undefined, btn: HTMLElement): Promise<void> {
    host.audio.ensure();
    learnHalt();
    const g = getGen();
    if (spec === undefined) throw new TypeError('Étude: demo button without data-demo');
    const p = spec.split(':');
    const kind = p[0];
    if (kind !== 'beat' && !await host.audio.preparePiano()) return;
    if (g !== getGen() || host.nav.activeView() !== 'learn') return;
    const T0 = learnCtxTime() + 0.06;
    if (kind === 'n') {
      const m = +p[1];
      host.audio.previewNote(m, T0, 0.9, 96);
      learnLight([m], 1300);
    } else if (kind === 'run') {
      const ms = p[1].split('.').map(Number);
      ms.forEach((m, i) => host.audio.previewNote(m, T0 + i * 0.4, 0.38, 92));
      lSeqLight(ms.map((m) => [m]), 400, 700);
    } else if (kind === 'ms') {
      const ms = p[1].split('.').map(Number);
      host.audio.playChordMidis(ms, true);
      learnLight(ms, ms.length * 160 + 1500);
    } else if (kind === 'iv') {
      const root = +p[1];
      const semi = +p[2];
      host.audio.playInterval(root, semi, 'both');
      learnLight([root, root + semi], 2300);
    } else if (kind === 'ch') {
      const c = CHORDS.find((x) => x.symbol === p.slice(2).join(':'));
      if (c) {
        const ms = c.intervals.map((i) => +p[1] + i);
        host.audio.playChordMidis(ms, true);
        learnLight(ms, ms.length * 160 + 1500);
      }
    } else if (kind === 'sc') {
      const nm = p.slice(2).join(':');
      const o = SCALES[nm];
      if (o) {
        const root = +p[1];
        host.audio.playScaleNotes(root, o, true);
        lSeqLight(o.concat([12]).map((x) => [root + x]), 270, 600);
      }
    } else if (kind === 'pr') {
      const nm = p.slice(2).join(':');
      const prog = PROGS.find((x) => x.name === nm) || ACCOMP_PROGS.find((x) => x.name === nm);
      if (prog) {
        const rp = +p[1];
        host.audio.playProg(rp, prog);
        lSeqLight(prog.chords.map((ch) => {
          const r = 60 + ((rp + ch[0]) % 12);
          const tp = progChordTpl(ch[1]);
          return tp ? tp.intervals.map((i) => r + i) : [r];
        }), 900, 900);
      }
    } else if (kind === 'blues') {
      const rp = +p[1] || 0;
      const spb = 0.3;
      const bars = byId('learnBody').querySelectorAll('.lbars [data-bar]');
      const chs = LBLUES.map((d) => {
        const r = (rp + d) % 12;
        const root = 60 + r - (r > 7 ? 12 : 0);
        return { bass: 36 + r, ms: [root, root + 4, root + 7, root + 10] };
      });
      chs.forEach((c, i) => {
        const b0 = T0 + i * 4 * spb;
        host.audio.previewNote(c.bass, b0, spb * 1.9, 84);
        host.audio.previewNote(c.bass + 7, b0 + 2 * spb, spb * 1.9, 76);
        [0, 1.5, 2, 3.5].forEach((k, j) => c.ms.slice(1).forEach((m) =>
          host.audio.previewNote(m, b0 + k * spb, j % 2 ? spb * 0.45 : spb * 0.9, j % 2 ? 66 : 80)));
      });
      host.audio.previewNote(36 + rp, T0 + 48 * spb, 1.4, 84);
      [60, 64, 67, 70].forEach((m) => host.audio.previewNote(m + rp, T0 + 48 * spb, 1.4, 80));
      lSeqLight(chs.map((c) => [c.bass].concat(c.ms)), 4 * spb * 1000, 1600);
      chs.forEach((_c, i) => learnTimer(() => { bars.forEach((b, j) => b.classList.toggle('on', j === i)); }, i * 4 * spb * 1000));
      learnTimer(() => bars.forEach((b) => b.classList.remove('on')), 48 * spb * 1000 + 1500);
    } else if (kind === 'vc') {
      const chs = p[1].split('|').map((s) => s.split('.').map(Number));
      chs.forEach((ms, i) => ms.forEach((m) => host.audio.previewNote(m, T0 + i * 1.1, 1.05, m < 55 ? 80 : 88)));
      lSeqLight(chs, 1100, 1200);
    } else if (kind === 'acc') {
      const P = ACCOMP_PATTERNS[p[1]];
      if (!P) return;
      const spb = P.beats === 3 ? 0.45 : 0.55;
      const ev: AccompanimentEvent[] = [];
      LACC_CH.forEach((c, i) => P.gen(ev, i * P.beats, c));
      host.audio.previewNote(48, T0 + 4 * P.beats * spb, 1.6, 80);
      [60, 64, 67].forEach((m) => host.audio.previewNote(m, T0 + 4 * P.beats * spb, 1.6, 80));
      ev.forEach((e) => host.audio.previewNote(e.midi, T0 + e.beat * spb, Math.max(0.12, e.durB * spb * 0.95), e.hand === 'L' ? 78 : 86));
      lSeqLight(LACC_CH.map((c) => [c.bass].concat(c.right)).concat([[48, 60, 64, 67]]), P.beats * spb * 1000, 1600);
    } else if (kind === 'beat') {
      demoBeat(p[1], btn);
    }
  }

  return {
    LSR,
    lStaffSvg,
    lStaffHTML,
    lStaffPlay,
    lStaffNote,
    lBarsHTML,
    lDots,
    demoBeat,
    runDemo,
  };
}

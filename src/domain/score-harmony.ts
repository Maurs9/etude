import { MAJOR } from './repertoire-data.js';
import type { AnHand, AnNote, ScoreMeasure, ScoreXmlHarmony } from './score-types.js';
import * as theory from './theory.js';

export interface AnChordTemplate {
  s: string;
  q: string;
  p: number[];
  cx?: number;
  rn?: string;
  ext?: number[];
  x?: number;
  dom?: number;
  n9?: number;
}

export const AN_CHORDS: AnChordTemplate[] = [
  { s: '', q: 'M', p: [0, 4, 7] },
  { s: 'm', q: 'm', p: [0, 3, 7] },
  { s: '°', q: 'd', p: [0, 3, 6], cx: 0.05 },
  { s: '+', q: 'A', p: [0, 4, 8], cx: 0.1 },
  { s: 'sus2', q: 'S', p: [0, 2, 7], cx: 0.1, rn: 'sus2' },
  { s: 'sus4', q: 'S', p: [0, 5, 7], cx: 0.08, rn: 'sus4' },
  { s: '5', q: 'P', p: [0, 7], cx: 0.06, rn: '5' },
  { s: '6', q: 'M', p: [0, 4, 7, 9], ext: [9, 7], cx: 0.09, rn: 'add6' },
  { s: 'm6', q: 'm', p: [0, 3, 7, 9], ext: [9, 7], cx: 0.11, rn: 'add6' },
  { s: '7', q: 'M', p: [0, 4, 7, 10], x: 1, dom: 1, ext: [10], cx: 0.04 },
  { s: 'maj7', q: 'M', p: [0, 4, 7, 11], x: 1, ext: [11], cx: 0.07 },
  { s: 'm7', q: 'm', p: [0, 3, 7, 10], x: 1, ext: [10], cx: 0.05 },
  { s: 'm(maj7)', q: 'm', p: [0, 3, 7, 11], x: 1, ext: [11], cx: 0.13 },
  { s: 'ø7', q: 'h', p: [0, 3, 6, 10], x: 1, ext: [10], cx: 0.06 },
  { s: '°7', q: 'd', p: [0, 3, 6, 9], x: 1, ext: [9], cx: 0.06 },
  { s: '7sus4', q: 'S', p: [0, 5, 7, 10], x: 1, ext: [10], cx: 0.11, rn: 'sus4' },
  { s: 'add9', q: 'M', p: [0, 4, 7, 2], ext: [2], cx: 0.12, rn: 'add9' },
  { s: '9', q: 'M', p: [0, 4, 7, 10, 2], x: 1, dom: 1, ext: [10, 2], cx: 0.11, n9: 1 },
  { s: 'm9', q: 'm', p: [0, 3, 7, 10, 2], x: 1, ext: [10, 2], cx: 0.13, n9: 1 },
  { s: 'maj9', q: 'M', p: [0, 4, 7, 11, 2], x: 1, ext: [11, 2], cx: 0.14, n9: 1 },
  { s: '7♭5', q: 'M', p: [0, 4, 6, 10], x: 1, dom: 1, ext: [6, 10], cx: 0.15, rn: '♭5' },
  { s: '7♯5', q: 'A', p: [0, 4, 8, 10], x: 1, dom: 1, ext: [8, 10], cx: 0.15 },
];

export type AnKeyPoint = theory.KeySignature & { beat: number };

export interface AnVoiceNeighbors {
  prev: AnNote | null | undefined;
  next: AnNote | null | undefined;
}

export interface AnNoteWeight {
  acc: number;
  emb: number;
  res: number;
}

export interface AnUnit {
  s: number;
  e: number;
  w: number[];
  res: [number, number, number][];
  T: number;
  held: number;
  low: number | null;
  onsetLow: number | null;
}

export interface AnSpanReading {
  a: number;
  b: number;
  s: number;
  e: number;
  w: number[];
  sw: number[];
  nonFinalSw: number[];
  T: number;
  bass: number | null;
  all?: AnChordReading[];
}

export type AnSpanChoice = AnSpanReading & { all: AnChordReading[] };

export interface AnChordReading {
  root: number;
  c: AnChordTemplate;
  tones: number[];
  cover: number;
  complete: boolean;
  fit: number;
}

export interface AnRatedChord extends AnChordReading {
  margin: number;
  det: string;
  conf: string;
  alts: AnChordReading[];
}

export interface AnNonChordTone {
  note: AnNote;
  index: number | undefined;
  type: string;
}

export interface AnHarmonySeg {
  start: number;
  end: number;
  measure: ScoreMeasure;
  unit: number;
  bass: number | null;
  ch: AnRatedChord;
  notes: AnNote[];
  nct?: AnNonChordTone[];
  cad?: string;
}

export interface AnMotif {
  iv: number[];
  count: number;
  last: number;
  notes: AnNote[];
}

export interface AnHarmonyContext {
  measures?: readonly ScoreMeasure[];
  keyMap?: readonly AnKeyPoint[];
  harmonies?: readonly ScoreXmlHarmony[];
  noteIndex?: ReadonlyMap<AnNote, number>;
}

const AN_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
export const AN_DIA = {
  maj: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
  min: ['i', 'ii°', 'III', 'iv', 'V', 'VI', 'vii°'],
};

export const anDomQ = (c: AnChordTemplate) => !!c.dom || (c.q === 'M' && !/maj|6/.test(c.s));

function pc(midi: number): number {
  return theory.pitchClass(midi);
}

export function anHandOf(n: { hand?: AnHand | null; midi: number; staff?: number }): AnHand {
  return n.hand || (n.staff === 2 ? 'lh' : n.midi >= 60 ? 'rh' : 'lh');
}

export function anBeatUnit(m: { num: number; den: number }): number {
  return m.den === 8 && m.num % 3 === 0 ? 1.5 : 4 / m.den;
}

export function anDefaultMeasures(ns: readonly { end: number }[]): ScoreMeasure[] {
  const end = ns.length ? Math.max(...ns.map((n) => n.end)) : 0;
  const out: ScoreMeasure[] = [];
  for (let s = 0, i = 1; s < end; s += 4, i++) {
    out.push({ number: String(i), start: s, end: s + 4, num: 4, den: 4 });
  }
  return out;
}

export function anResolveMeasures(
  measures: readonly ScoreMeasure[] | undefined,
  ns: readonly { end: number }[],
): readonly ScoreMeasure[] {
  return measures && measures.length ? measures : anDefaultMeasures(ns);
}

export function anMeasureForBeat(measures: readonly ScoreMeasure[], beat: number): ScoreMeasure | undefined {
  if (!measures.length) return undefined;
  let lo = 0;
  let hi = measures.length - 1;
  let idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (measures[mid].start <= beat + 1e-6) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return measures[idx];
}

export function anKeyFromMap(keyMap: readonly AnKeyPoint[] | undefined, beat: number): theory.KeySignature {
  if (!keyMap || !keyMap.length) return { root: 0, minor: false, fifths: 0 };
  let k: theory.KeySignature = keyMap[0];
  for (const x of keyMap) {
    if (x.beat <= beat + 1e-6) k = x;
  }
  return k;
}

export function anInv(seg: { ch: { c: AnChordTemplate; root: number }; bass: number | null }): number {
  if (seg.bass == null) return 0;
  const c = seg.ch.c;
  const iv = (((seg.bass - seg.ch.root) % 12) + 12) % 12;
  return c.q === 'S' || c.q === 'P' ? 0 : iv === c.p[1] ? 1 : iv === c.p[2] ? 2 : c.x && iv === c.p[3] ? 3 : 0;
}

export function anPoly(ns: readonly { start: number; end: number }[]): { avg: number; max: number } {
  const ev: [number, number][] = [];
  ns.forEach((n) => {
    ev.push([n.start, 1]);
    ev.push([n.end, -1]);
  });
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let c = 0;
  let last: number | null = null;
  let area = 0;
  let on = 0;
  let max = 0;
  for (const [x, d] of ev) {
    if (last != null && c > 0) {
      area += c * (x - last);
      on += x - last;
    }
    c += d;
    max = Math.max(max, c);
    last = x;
  }
  return { avg: on ? area / on : 0, max };
}

export function anVoiceNeighbors(ns: readonly AnNote[]): Map<AnNote, AnVoiceNeighbors> {
  const groups = new Map<string, AnNote[]>();
  const out = new Map<AnNote, AnVoiceNeighbors>();
  const key = (n: AnNote) => (n.part ?? n.track ?? 0) + '|' + anHandOf(n) + '|' + (n.voice ?? 1);
  ns.forEach((n) => {
    const k = key(n);
    let list = groups.get(k);
    if (!list) {
      list = [];
      groups.set(k, list);
    }
    list.push(n);
  });
  groups.forEach((notes) => {
    const onsets: { start: number; notes: AnNote[] }[] = [];
    notes
      .slice()
      .sort((a, b) => a.start - b.start || a.midi - b.midi)
      .forEach((n) => {
        let g = onsets[onsets.length - 1];
        if (!g || Math.abs(g.start - n.start) > 0.001) {
          g = { start: n.start, notes: [] };
          onsets.push(g);
        }
        g.notes.push(n);
      });
    onsets.forEach((g, i) =>
      g.notes.forEach((n) => {
        const nearest = (a: { notes: AnNote[] } | undefined) =>
          a &&
          a.notes.reduce<AnNote | null>(
            (best, x) => (!best || Math.abs(x.midi - n.midi) < Math.abs(best.midi - n.midi) ? x : best),
            null,
          );
        out.set(n, { prev: nearest(onsets[i - 1]), next: nearest(onsets[i + 1]) });
      }),
    );
  });
  return out;
}

export function anClassifyNonChord(
  ns: readonly AnNote[],
  segs: AnHarmonySeg[],
  noteIndex?: ReadonlyMap<AnNote, number>,
): void {
  const around = anVoiceNeighbors(ns);
  const eps = 1e-6;
  const step = (a: AnNote | null | undefined, b: AnNote | null | undefined) =>
    !!a && !!b && Math.abs(a.midi - b.midi) > 0 && Math.abs(a.midi - b.midi) <= 2;
  segs.forEach((seg, si) => {
    const tones = new Set(seg.ch.tones);
    const nextSeg: AnHarmonySeg | undefined = segs[si + 1];
    const nextTones = nextSeg && new Set(nextSeg.ch.tones);
    const span = seg.end - seg.start;
    const seen = new Set<number | undefined>();
    const nct: AnNonChordTone[] = (seg.nct = []);
    seg.notes.forEach((n, localIdx) => {
      const idx = noteIndex ? noteIndex.get(n) : localIdx;
      if (tones.has(pc(n.midi)) || (idx !== undefined && seen.has(idx))) return;
      if (idx !== undefined) seen.add(idx);
      const ctx = around.get(n) || { prev: undefined, next: undefined };
      const prev = ctx.prev;
      const next = ctx.next;
      const prevTone = prev && tones.has(pc(prev.midi));
      const nextTone = next && tones.has(pc(next.midi));
      let type = 'other';
      if (
        n.start < seg.start - eps &&
        next &&
        next.start >= seg.start - eps &&
        next.start < seg.end + eps &&
        step(n, next) &&
        nextTone
      ) {
        type = 'suspension';
      } else if (
        nextTones &&
        n.start >= seg.end - Math.max(0.25, span * 0.45) &&
        nextTones.has(pc(n.midi)) &&
        (n.end > seg.end + eps || (next && pc(next.midi) === pc(n.midi)))
      ) {
        type = 'anticipation';
      } else if (prev && next && step(prev, n) && step(n, next) && prevTone && nextTone) {
        if (prev.midi === next.midi) type = 'neighbor';
        else if (Math.sign(n.midi - prev.midi) === Math.sign(next.midi - n.midi)) type = 'passing';
      }
      nct.push({ note: n, index: idx, type });
    });
  });
}

export function anAccent(m: { start: number; end: number }, u: number, x: number): number {
  const b = (x - m.start) / u;
  const n = Math.round((m.end - m.start) / u);
  const k = Math.round(b);
  return b < 1e-4
    ? 1
    : Math.abs(b - k) < 1e-4
      ? n % 2 === 0 && 2 * k === n
        ? 0.85
        : 0.7
      : Math.abs(2 * b - Math.round(2 * b)) < 1e-4
        ? 0.55
        : 0.45;
}

export function anGrid(m: ScoreMeasure, implied: boolean): number[] {
  const len = m.end - m.start;
  const u = anBeatUnit(m);
  const eps = 1e-6;
  if (implied) {
    const half = len / 2;
    return len > 3 + eps && Math.abs(half / u - Math.round(half / u)) < eps
      ? [m.start, m.start + half, m.end]
      : [m.start, m.end];
  }
  const step = Math.max(0.5, u);
  const g = [m.start];
  for (let b = m.start + step; m.end - b >= step - eps; b += step) {
    g.push(b);
  }
  g.push(m.end);
  return g;
}

export function anNoteInfo(sorted: readonly AnNote[], measures: readonly ScoreMeasure[]): Map<AnNote, AnNoteWeight> {
  const around = anVoiceNeighbors(sorted);
  const out = new Map<AnNote, AnNoteWeight>();
  const count = new Map<string, number>();
  const eps = 1e-6;
  const vk = (n: AnNote) => (n.part ?? n.track ?? 0) + '|' + anHandOf(n) + '|' + n.start.toFixed(3);
  const d = (a: AnNote | null | undefined, b: AnNote | null | undefined) =>
    a && b ? Math.abs(a.midi - b.midi) : 0;
  const step = (a: AnNote | null | undefined, b: AnNote | null | undefined) =>
    !!a && !!b && d(a, b) > 0 && d(a, b) <= 2 && a.end <= b.start + 0.125 && b.start > a.start;
  sorted.forEach((n) => count.set(vk(n), (count.get(vk(n)) || 0) + 1));
  let j = 0;
  for (const n of sorted) {
    while (j + 1 < measures.length && measures[j + 1].start <= n.start + eps) j++;
    const m = measures[j];
    const { prev, next } = around.get(n) || { prev: undefined, next: undefined };
    const alone = count.get(vk(n)) === 1;
    if (!m) {
      out.set(n, { acc: 1, emb: 1, res: Infinity });
      continue;
    }
    const fig =
      prev &&
      next &&
      prev.midi === next.midi &&
      d((around.get(prev) || { prev: undefined }).prev, prev) > 2 &&
      d(next, (around.get(next) || { next: undefined }).next) > 2;
    const u = anBeatUnit(m);
    const acc = anAccent(m, u, n.start);
    const on = alone && !fig && step(n, next);
    out.set(n, {
      acc,
      emb: on && acc < 0.85 && n.end - n.start <= u + eps && step(prev, n) ? 0.4 : 1,
      res: on && next ? next.start : Infinity,
    });
  }
  return out;
}

export function anUnits(
  m: ScoreMeasure,
  grid: readonly number[],
  here: readonly AnNote[],
  info: Map<AnNote, AnNoteWeight>,
): AnUnit[] {
  const U: AnUnit[] = [];
  const u = anBeatUnit(m);
  const eps = 1e-6;
  for (let i = 0; i + 1 < grid.length; i++) {
    const s = grid[i];
    const e = grid[i + 1];
    const unitLen = e - s;
    const w: number[] = Array(12).fill(0);
    const res: [number, number, number][] = [];
    const acc = anAccent(m, u, s);
    let T = 0;
    let onsetLow: number | null = null;
    let unitLow: number | null = null;
    let unitLowDur = 0;
    let anyLow: number | null = null;
    let held = 0;

    for (const n of here) {
      const writtenEnd = n.end;
      const soundingEnd = Math.max(n.end, n.soundEnd ?? n.end);
      const d = Math.max(0, Math.min(writtenEnd, e) - Math.max(n.start, s));
      const pedEnd = Math.min(soundingEnd, e);
      const ped = Math.max(0, pedEnd - Math.max(n.start, s)) - d;
      if (d <= eps && ped <= eps) continue;

      const f = info.get(n);
      if (!f) continue;
      const p = pc(n.midi);
      const metric = n.start < s - eps ? acc : f.acc;
      const x = d * metric * f.emb + (ped > eps ? ped * acc * 0.35 * f.emb : 0);
      w[p] += x;
      T += x;
      if (d > eps && f.res < m.end - eps) res.push([p, x, f.res]);
      if (n.start < s - eps && writtenEnd > s + eps) held |= 1 << p;

      // Onset bass includes notes starting on the beat, held over from earlier, or sustained by pedal into the beat.
      if (n.start <= s + eps && soundingEnd > s + eps && (onsetLow == null || n.midi < onsetLow)) {
        onsetLow = n.midi;
      }
      // Structural broken-chord bass inside this rhythmic unit (e.g. (E3+G3) at 0.0 -> C3 at 0.5).
      if (d >= Math.min(0.2 * unitLen, unitLen - eps) && f.emb >= 0.99) {
        if (unitLow == null || n.midi < unitLow || (n.midi === unitLow && d > unitLowDur)) {
          unitLow = n.midi;
          unitLowDur = d;
        }
      }
      if (d > eps && (anyLow == null || n.midi < anyLow)) anyLow = n.midi;
    }

    let low = onsetLow ?? anyLow;
    if (
      unitLow != null &&
      (onsetLow == null ||
        (unitLow < onsetLow && (onsetLow - unitLow >= 3 || unitLowDur >= 0.4 * unitLen)))
    ) {
      low = unitLow;
    }
    U.push({ s, e, w, res, T, held, low, onsetLow: onsetLow ?? anyLow });
  }
  return U;
}

export function anSpan(U: readonly AnUnit[], a: number, b: number): AnSpanReading {
  const w: number[] = Array(12).fill(0);
  const sw: number[] = Array(12).fill(0);
  const nonFinalSw: number[] = Array(12).fill(0);
  const e = U[b - 1].e;
  const lastIdx = b - 1;
  let T = 0;
  let bass: number | null = null;
  let firstLowMidi: number | null = null;

  for (let i = a; i < b; i++) {
    const u = U[i];
    T += u.T;
    for (let p = 0; p < 12; p++) w[p] += u.w[p];
    if (firstLowMidi == null && u.low != null) {
      firstLowMidi = u.low;
      bass = pc(u.low);
    }
    for (const [p, x, r] of u.res) {
      if (r < e - 1e-6) sw[p] -= x;
    }
  }
  for (let p = 0; p < 12; p++) sw[p] += w[p];

  if (b - a >= 2) {
    for (let i = a; i < lastIdx; i++) {
      const u = U[i];
      for (let p = 0; p < 12; p++) nonFinalSw[p] += u.w[p];
      for (const [p, x, r] of u.res) {
        if (r < e - 1e-6) nonFinalSw[p] -= x;
      }
    }
  }

  // Beat-level oscillating broken-chord pattern (e.g. (E3+G3), C3, (E3+G3), C3 on consecutive beats):
  // when beat 1 starts on an upper accompaniment dyad and beat 2 drops >= 3 semitones and oscillates back,
  // treat the lower alternating note as the structural bass.
  if (b - a >= 3 && firstLowMidi != null) {
    const low1 = U[a + 1]?.low;
    const low2 = U[a + 2]?.low;
    const low3 = b - a >= 4 ? U[a + 3]?.low : low1;
    if (
      low1 != null &&
      low2 != null &&
      low3 != null &&
      low1 <= firstLowMidi - 3 &&
      low2 >= firstLowMidi - 1 &&
      low3 <= low1 + 1
    ) {
      bass = pc(low1);
    }
  }

  return { a, b, s: U[a].s, e, w, sw, nonFinalSw, T, bass };
}

function harmonyQualityGroup(kind: string, text: string): 'M' | 'm' | 'd' | 'A' | 'S' | null {
  const k = kind.toLowerCase();
  if (/diminished/.test(k)) return 'd';
  if (/augmented/.test(k)) return 'A';
  if (/suspended/.test(k)) return 'S';
  if (/minor/.test(k)) return 'm';
  if (/major|dominant|sixth|ninth|power/.test(k)) return 'M';
  if (/dim|°|ø/.test(text)) return 'd';
  if (/\+|aug/.test(text)) return 'A';
  if (/sus/.test(text)) return 'S';
  if (/^(m(?!aj)|min|-)/.test(text)) return 'm';
  return text ? 'M' : null;
}

function xmlHarmonyHintForSpan(
  S: AnSpanReading,
  harmonies: readonly ScoreXmlHarmony[] | undefined,
): ScoreXmlHarmony | null {
  if (!harmonies || !harmonies.length) return null;
  const eps = 1e-4;
  const inside = harmonies.filter((h) => h.beat >= S.s - eps && h.beat < S.e - eps);
  if (inside.length > 1) {
    // Only use an explicit hint if all markers in the span agree on root.
    const roots = new Set(inside.map((h) => h.root));
    if (roots.size > 1) return null;
    return inside[0];
  }
  if (inside.length === 1) return inside[0];
  let active: ScoreXmlHarmony | null = null;
  for (const h of harmonies) {
    if (h.beat <= S.s + eps) active = h;
    else break;
  }
  return active;
}

export function anFit(
  S: AnSpanReading,
  root: number,
  c: AnChordTemplate,
  dia: Set<string>,
  hint: ScoreXmlHarmony | null = null,
): AnChordReading | null {
  const w = S.w;
  const T = S.T;
  const tones = c.p.map((i) => (root + i) % 12);
  if (!(w[root] >= 0.05 * T && w[tones[1]] > 0)) return null;
  if (
    (c.q === 'S' || c.q === 'P') &&
    (Math.max(w[(root + 3) % 12], w[(root + 4) % 12]) > 0.03 * T ||
      (c.q === 'S' && S.sw[tones[1]] < 0.04 * T))
  ) {
    return null;
  }
  if (c.ext) {
    const spanUnits = S.b - S.a;
    for (const i of c.ext) {
      const extPc = (root + i) % 12;
      const extSw = S.sw[extPc];
      if (extSw < (i === 2 ? 0.08 : 0.04) * T) return null;
      // Harmonic rhythm guard: a brief non-dominant color tone appearing ONLY in the very last beat
      // of a 3+ beat span with <16% share (e.g. a melodic leading tone B on beat 4 over C) decorates
      // the transition rather than converting the whole bar into maj7/add9/6.
      if (!c.dom && spanUnits >= 3 && S.nonFinalSw[extPc] <= 1e-6 && extSw < 0.16 * T) {
        return null;
      }
    }
  }
  let miss = 0;
  for (let k = 2; k < tones.length; k++) {
    if (!(w[tones[k]] > 0)) {
      if (c.p[k] === 7 && (c.q === 'M' || c.q === 'm')) miss = 0.08;
      else return null;
    }
  }
  let cw = 0;
  tones.forEach((p) => {
    cw += w[p];
  });
  const cover = cw / T;
  if (cover < 0.5) return null;

  let hintBonus = 0;
  if (hint && hint.root === root) {
    hintBonus += 0.04;
    const hg = harmonyQualityGroup(hint.kind, hint.text);
    const cq = c.q === 'h' ? 'd' : c.q;
    if (hg && hg === cq) hintBonus += 0.04;
  }

  return {
    root,
    c,
    tones,
    cover,
    complete: !miss,
    fit:
      2 * cover -
      1 -
      (c.cx || 0) -
      miss +
      (S.bass === root ? 0.06 : S.bass != null && tones.includes(S.bass) ? 0 : -0.06) +
      (dia.has(root + ':' + c.s) ? 0.035 : 0) +
      hintBonus,
  };
}

export function anFitImplied(S: { T: number; w: number[] }, key: theory.KeySignature): AnChordReading[] {
  const out: AnChordReading[] = [];
  if (!(S.T > 0)) return out;
  for (const d of theory.anDiatonic(key, AN_CHORDS)) {
    const chord = d.c;
    if (!chord) continue;
    const tones = chord.p.map((i) => (d.root + i) % 12);
    if (!(S.w[d.root] > 0) || tones.filter((p) => S.w[p] > 0).length < 2 || (chord.x && !(S.w[tones[3]] > 0))) {
      continue;
    }
    let cw = 0;
    tones.forEach((p) => {
      cw += S.w[p];
    });
    const cover = cw / S.T;
    if (cover < 0.5) continue;
    out.push({
      root: d.root,
      c: chord,
      tones,
      cover,
      complete: tones.every((p) => S.w[p] > 0),
      fit: 2 * cover - 1 + (0.2 * S.w[d.root]) / S.T + 2 * (d.pref || 0) - (chord.x ? 0.06 : 0),
    });
  }
  return out.sort((a, b) => b.fit - a.fit);
}

export function anCands(
  S: AnSpanReading,
  implied: boolean,
  key: theory.KeySignature,
  harmonies?: readonly ScoreXmlHarmony[],
): AnChordReading[] {
  if (implied) return anFitImplied(S, key);
  const dia = new Set(theory.anDiatonic(key, AN_CHORDS).map((d) => d.root + ':' + d.c?.s));
  const hint = xmlHarmonyHintForSpan(S, harmonies);
  const out: AnChordReading[] = [];
  if (S.T > 0) {
    for (let r = 0; r < 12; r++) {
      if (S.w[r] > 0) {
        for (const c of AN_CHORDS) {
          const x = anFit(S, r, c, dia, hint);
          if (x) out.push(x);
        }
      }
    }
  }
  return out.sort((a, b) => b.fit - a.fit);
}

export function anUnion(sp: AnSpanChoice[][], a: number, b: number): void {
  const S = sp[a][b];
  const id = (tones: number[]) =>
    tones
      .slice()
      .sort((p, q) => p - q)
      .join();
  const within = (y: AnChordReading, x: AnChordReading) => y.tones.every((p) => x.tones.includes(p));
  let hit = false;
  for (const X of S.all) {
    if (X.tones.length < 4) continue;
    const up = X.c.dom ? id(X.tones.slice(1)) : '';
    const top = (Z: AnSpanChoice) => {
      const y: AnChordReading | undefined = Z.all[0];
      return y && y.complete && y.cover >= 0.75 && !within(X, y) && id(y.tones) !== up ? y : null;
    };
    let pen = 0;
    for (let k = a + 1; k < b; k++) {
      const y = top(sp[a][k]);
      const z = top(sp[k][b]);
      if (y && z && !within(y, z) && !within(z, y)) pen = Math.max(pen, Math.min(sp[a][k].T, sp[k][b].T));
    }
    if (pen) {
      X.fit -= pen / S.T;
      hit = true;
    }
  }
  if (hit) S.all.sort((x, y) => y.fit - x.fit);
}

export function anRate(x: AnChordReading, all: AnChordReading[], implied: boolean): AnRatedChord {
  const id = (y: AnChordReading) =>
    y.tones
      .slice()
      .sort((p, q) => p - q)
      .join();
  const own = id(x);
  const rival = all.find((y) => id(y) !== own);
  const margin = rival ? x.fit - rival.fit : 1;
  const det = implied
    ? 'suggested'
    : x.complete && x.cover >= 0.8 && margin >= 0.1
      ? 'exact'
      : x.cover >= 0.6 && margin >= 0.04
        ? 'likely'
        : 'suggested';
  return {
    root: x.root,
    c: x.c,
    tones: x.tones,
    cover: x.cover,
    fit: x.fit,
    complete: x.complete,
    margin,
    det,
    conf: det === 'exact' ? 'high' : det === 'likely' || (implied && x.cover >= 0.75 && margin >= 0.1) ? 'medium' : 'low',
    alts: all.filter((y) => !(y.root === x.root && y.c === x.c) && y.fit >= x.fit - 0.08).slice(0, 2),
  };
}

interface AnHarmonyBar {
  m: ScoreMeasure;
  here: AnNote[];
  U: AnUnit[];
  n: number;
  Lmax: number;
  sp: AnSpanChoice[][];
  M: number;
}
interface AnHarmonyPick {
  B: AnHarmonyBar;
  a: number;
  b: number;
  x: AnChordReading;
}
interface AnHarmonyState {
  v: number;
  cur: AnChordReading | null;
  back: AnHarmonyState | null;
  pick: AnHarmonyPick | null;
}

export function anHarmony(
  ns: readonly AnNote[],
  implied: boolean,
  ctx: AnHarmonyContext = {},
): AnHarmonySeg[] {
  const out: AnHarmonySeg[] = [];
  if (!ns.length) return out;
  const eps = 1e-6;
  const sorted = ns.slice().sort((a, b) => a.start - b.start || a.midi - b.midi);
  const measures = anResolveMeasures(ctx.measures, sorted);
  const info = anNoteInfo(sorted, measures);
  const lo = sorted[0].start;
  const hi = Math.max(...ns.map((n) => n.end));
  const bars: AnHarmonyBar[] = [];
  const active: AnNote[] = [];
  let k = 0;

  for (const m of measures) {
    if (m.end <= lo + eps || m.start >= hi - eps) continue;
    while (k < sorted.length && sorted[k].start < m.end - eps) active.push(sorted[k++]);
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].end <= m.start + eps) active.splice(i, 1);
    }
    const here = active.filter((n) => n.end > m.start + eps);
    if (!here.length) continue;
    const U = anUnits(m, anGrid(m, implied), here, info);
    const n = U.length;
    const Lmax = n > 12 ? 8 : n;
    const sp = U.map((): AnSpanChoice[] => []);
    for (let L = 1; L <= Lmax; L++) {
      for (let a = 0; a + L <= n; a++) {
        const span = anSpan(U, a, a + L);
        const S = Object.assign(span, {
          all: anCands(span, implied, anKeyFromMap(ctx.keyMap, span.s), ctx.harmonies),
        });
        sp[a][a + L] = S;
        if (L > 1 && !implied) anUnion(sp, a, a + L);
      }
    }
    bars.push({ m, here, U, n, Lmax, sp, M: U.reduce((s, x) => s + x.T, 0) / n });
  }

  const same = (x: AnChordReading | null, y: AnChordReading | null) => !!x && !!y && x.root === y.root && x.c === y.c;
  const cost = (B: AnHarmonyBar, a: number, y: AnChordReading, x: AnChordReading) => {
    const common = x.tones.filter((p) => y.tones.includes(p));
    const held = common.some((p) => (B.U[a].held >> p) & 1);
    let base = (a === 0 ? 0.2 : 2 * a === B.n ? 0.4 : 0.55) * B.M * (1 + 0.25 * common.length + (held ? 0.25 : 0));
    // Functional syntax transition bonus: descending 5th (V->I, ii->V, V/x->x) or plagal (IV->I)
    const rootStep = ((y.root - x.root) % 12 + 12) % 12;
    if (rootStep === 7 && (anDomQ(y.c) || y.c.q === 'm')) base *= 0.82;
    else if (rootStep === 5 && (y.c.q === 'M' || y.c.q === 'm') && (x.c.q === 'M' || x.c.q === 'm')) base *= 0.9;
    return base;
  };

  let states: AnHarmonyState[] = [{ v: 0, cur: null, back: null, pick: null }];
  for (const B of bars) {
    const at = [states];
    for (let b = 1; b <= B.n; b++) {
      const best = new Map<string, AnHarmonyState>();
      for (let a = Math.max(0, b - B.Lmax); a < b; a++) {
        const S = B.sp[a][b];
        const opts = [null, ...S.all.slice(0, 6)];
        for (const st of at[a]) {
          for (const x of opts) {
            const cur = x || st.cur;
            const id = cur ? cur.root + ':' + cur.c.s : '';
            const v =
              st.v +
              (x
                ? S.T * x.fit - 1e-4 * B.M - (st.cur && !same(st.cur, x) ? cost(B, a, st.cur, x) : 0)
                : -0.5 * S.T);
            const old = best.get(id);
            if (!old || v > old.v) best.set(id, { v, cur, back: st, pick: x && { B, a, b, x } });
          }
        }
      }
      at.push([...best.values()].sort((p, q) => q.v - p.v).slice(0, 24));
    }
    states = at[B.n];
  }

  let end = states[0];
  states.forEach((st) => {
    if (st.v > end.v) end = st;
  });
  const picks: AnHarmonyPick[] = [];
  for (let st: AnHarmonyState | null = end; st; st = st.back) {
    if (st.pick) picks.push(st.pick);
  }
  picks.reverse();
  const segs: AnHarmonyPick[] = [];
  picks.forEach((p) => {
    const last = segs[segs.length - 1];
    if (last && last.B === p.B && same(last.x, p.x)) last.b = p.b;
    else segs.push({ ...p });
  });

  for (const g of segs) {
    const U = g.B.U;
    while (g.b - g.a > 1 && U[g.a].low == null) g.a++;
    while (g.b - g.a > 1 && U[g.b - 1].low == null) g.b--;
    const S = g.B.sp[g.a][g.b] || anSpan(U, g.a, g.b);
    const all = S.all || (S.all = anCands(S, implied, anKeyFromMap(ctx.keyMap, S.s), ctx.harmonies));
    const x = all.find((y) => same(y, g.x)) || g.x;
    out.push({
      start: S.s,
      end: S.e,
      measure: g.B.m,
      unit: anBeatUnit(g.B.m),
      bass: implied ? x.root : S.bass,
      ch: anRate(x, all, implied),
      notes: g.B.here.filter((n) => n.start < S.e - eps && n.end > S.s + eps),
    });
  }
  anClassifyNonChord(ns, out, ctx.noteIndex);
  return out;
}

export function anRoman(key: theory.KeySignature, seg: { ch: Pick<AnChordReading, 'root' | 'c'>; bass: number | null }): string {
  const ch = seg.ch;
  const c = ch.c;
  const rel = ((ch.root - key.root) % 12 + 12) % 12;
  const minor = key.minor;
  const scale = minor ? [0, 2, 3, 5, 7, 8, 10] : MAJOR;
  const q = c.q;
  const inv = anInv(seg);
  const fig = c.x ? (c.n9 && !inv ? '⁹' : ['⁷', '⁶₅', '⁴₃', '⁴₂'][inv]) : ['', '⁶', '⁶₄'][inv] || '';
  const mark = q === 'd' ? '°' : q === 'h' ? 'ø' : q === 'A' ? '+' : '';
  const sfx = c.rn || '';
  const secondary = anDomQ(c) && (minor ? [0, 2, 3, 5, 10].includes(rel) && (rel !== 0 || !!c.x) : [2, 4, 9, 11].includes(rel) || (rel === 0 && c.x));
  if (secondary) {
    const target = scale.indexOf((rel + 5) % 12);
    const targetLabel = minor && target === 6 ? 'VII' : AN_DIA[minor ? 'min' : 'maj'][target]?.replace('°', '');
    if (target > 0 && targetLabel) return 'V' + mark + fig + sfx + '/' + targetLabel;
  }
  let deg: number;
  let acc = '';
  if (minor && rel === 11) deg = 6;
  else if (minor && rel === 9) {
    deg = 5;
    acc = '♯';
  } else deg = scale.indexOf(rel);
  if (deg < 0) {
    if (!minor && rel === 6) {
      deg = 3;
      acc = '♯';
    } else {
      const up = scale.indexOf((rel + 1) % 12);
      if (up >= 0) {
        deg = up;
        acc = '♭';
      } else {
        deg = scale.indexOf((rel + 11) % 12);
        acc = '♯';
      }
    }
  }
  let num = AN_ROMAN[deg];
  if (
    q === 'm' ||
    q === 'd' ||
    q === 'h' ||
    (q === 'P' && !acc && !(minor && rel === 7) && (scale[(deg + 2) % 7] - scale[deg] + 12) % 12 === 3)
  ) {
    num = num.toLowerCase();
  }
  return acc + num + mark + fig + sfx;
}

export function anCadences(segs: AnHarmonySeg[], keyMap?: readonly AnKeyPoint[]): void {
  segs.forEach((b, i) => {
    const a: AnHarmonySeg | undefined = segs[i - 1];
    if (!b.ch) return;
    const key = anKeyFromMap(keyMap, b.start);
    const rb = ((b.ch.root - key.root) % 12 + 12) % 12;
    const down = Math.abs(b.start - b.measure.start) < 1e-6;
    const isDom = (s: AnHarmonySeg | undefined) =>
      s && s.ch && ((s.ch.root - key.root) % 12 + 12) % 12 === 7 && anDomQ(s.ch.c);
    if (a && down && isDom(a) && rb === 0 && anInv(b) === 0 && (b.ch.c.q === 'M' || b.ch.c.q === 'm')) b.cad = 'auth';
    else if (
      a &&
      down &&
      a.ch &&
      ((a.ch.root - key.root) % 12 + 12) % 12 === 5 &&
      (a.ch.c.q === 'M' || a.ch.c.q === 'm') &&
      !a.ch.c.x &&
      rb === 0
    ) {
      b.cad = 'plagal';
    } else if (
      a &&
      down &&
      isDom(a) &&
      (key.minor ? rb === 8 && b.ch.c.q === 'M' : rb === 9 && b.ch.c.q === 'm')
    ) {
      b.cad = 'decept';
    } else if (
      segs.length >= 3 &&
      isDom(b) &&
      b.end - b.start >= b.unit - 1e-6 &&
      Math.abs(b.end - b.measure.end) < 1e-6 &&
      (i === segs.length - 1 || (Number(b.measure.number) > 0 && Number(b.measure.number) % 4 === 0 && segs[i + 1] && !isDom(segs[i + 1])))
    ) {
      b.cad = 'half';
    }
  });
}

export function anMotifs(ns: readonly AnNote[]): AnMotif[] {
  const tops = new Map<string, AnNote>();
  ns.forEach((n) => {
    const k = n.start.toFixed(3);
    const cur = tops.get(k);
    if (!cur || n.midi > cur.midi) tops.set(k, n);
  });
  const a = [...tops.values()].sort((x, y) => x.start - y.start);
  if (a.length < 8) return [];
  const map = new Map<string, AnMotif>();
  for (let i = 0; i + 3 < a.length; i++) {
    const iv = [1, 2, 3].map((j) => a[i + j].midi - a[i + j - 1].midi);
    if (iv.every((v) => !v)) continue;
    const key = iv.join(',');
    let hit = map.get(key);
    if (!hit) {
      hit = { iv, count: 0, last: -4, notes: [] };
      map.set(key, hit);
    }
    if (i >= hit.last + 4) {
      hit.count++;
      hit.last = i;
      hit.notes.push(...a.slice(i, i + 4));
    }
  }
  return [...map.values()]
    .filter((v) => v.count >= 2)
    .sort((x, y) => y.count - x.count)
    .slice(0, 4);
}

/* ---------- Selection & Isolated Note Analysis ---------- */

export interface SelectedNoteNeighbor {
  note: AnNote;
  index: number | undefined;
  hand: AnHand;
  semitones: number;
}

export interface SelectionNeighborSummary {
  simultaneous: SelectedNoteNeighbor[];
  sameBeat: SelectedNoteNeighbor[];
  prevMelodic: SelectedNoteNeighbor | null;
  nextMelodic: SelectedNoteNeighbor | null;
  contextChord: {
    rootPc: number;
    symbol: string;
    bassPc: number;
    inversion: number;
    pitches: number[];
  } | null;
}

export type ChordToneRole = 'root' | '2nd' | '3rd' | '4th' | '5th' | '7th' | 'ext' | 'nct' | null;

export interface IsolatedNoteAnalysis {
  kind: 'note';
  note: AnNote;
  count: number;
  measure: ScoreMeasure;
  beat: number;
  hand: AnHand;
  key: theory.KeySignature;
  degreeLabel: string;
  diatonic: boolean;
  localSeg: AnHarmonySeg | null;
  chordRole: ChordToneRole;
  nctType: string | null;
  neighbors: SelectionNeighborSummary;
}

export interface TwoNoteSelectionAnalysis {
  kind: 'interval';
  pitches: [number, number];
  notes: readonly AnNote[];
  semitones: number;
  simultaneous: boolean;
  measure: ScoreMeasure;
  key: theory.KeySignature;
  degrees: [string, string];
  localSeg: AnHarmonySeg | null;
  neighbors: SelectionNeighborSummary;
}

export interface ChordSelectionAnalysis {
  kind: 'chord';
  pitches: number[];
  notes: readonly AnNote[];
  measure: ScoreMeasure;
  key: theory.KeySignature;
  segs: AnHarmonySeg[];
  directChord: {
    rootPc: number;
    template: AnChordTemplate;
    bassPc: number;
    inversion: number;
    tones: number[];
  } | null;
  neighbors: SelectionNeighborSummary;
}

export type ScoreSelectionAnalysis =
  | IsolatedNoteAnalysis
  | TwoNoteSelectionAnalysis
  | ChordSelectionAnalysis;

const SEL_CHORDS: theory.ChordDefinition[] = AN_CHORDS.map((c, idx) => ({
  idx,
  symbol: c.s,
  pcset: [...new Set(c.p)].sort((a, b) => a - b),
}));

function scaleDegreeInfo(midi: number, key: theory.KeySignature): { label: string; diatonic: boolean } {
  const rel = theory.normalizeSemitones(pc(midi) - key.root);
  const scale = key.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const label = theory.SCALE_DEGREE_LABELS[rel] ?? '?';
  return { label, diatonic: scale.includes(rel) };
}

function chordToneRole(
  midi: number,
  seg: AnHarmonySeg | null,
  selectedNote: AnNote,
): { role: ChordToneRole; nctType: string | null } {
  if (!seg) return { role: null, nctType: null };
  const p = pc(midi);
  const c = seg.ch.c;
  const rel = theory.normalizeSemitones(p - seg.ch.root);
  if (rel === 0) return { role: 'root', nctType: null };
  if (c.q === 'P') {
    if (rel === 7) return { role: '5th', nctType: null };
  } else if (c.q === 'S') {
    if (rel === 2) return { role: '2nd', nctType: null };
    if (rel === 5) return { role: '4th', nctType: null };
    if (c.p[2] != null && rel === c.p[2]) return { role: '5th', nctType: null };
  } else {
    if (rel === c.p[1]) return { role: '3rd', nctType: null };
    if (c.p[2] != null && rel === c.p[2]) return { role: '5th', nctType: null };
  }
  if (c.x && c.p[3] != null && rel === c.p[3]) return { role: '7th', nctType: null };
  if (seg.ch.tones.includes(p)) return { role: 'ext', nctType: null };
  const nct = seg.nct?.find((x) => x.note === selectedNote);
  return { role: 'nct', nctType: nct?.type ?? 'other' };
}

function collectSelectionNeighbors(
  sel: readonly AnNote[],
  allNotes: readonly AnNote[],
  measures: readonly ScoreMeasure[],
  refNote: AnNote,
  ctx: AnHarmonyContext,
): SelectionNeighborSummary {
  const eps = 1e-4;
  const selSet = new Set(sel);
  const idxOf = (n: AnNote) => ctx.noteIndex?.get(n);

  const m = anMeasureForBeat(measures, refNote.start) ?? anDefaultMeasures(allNotes)[0];
  const u = m ? anBeatUnit(m) : 1;
  const beatIndex = m ? Math.max(0, Math.floor((refNote.start - m.start) / u + 1e-6)) : 0;
  const beatStart = m ? m.start + beatIndex * u : refNote.start;
  const beatEnd = beatStart + u;

  const simultaneous: SelectedNoteNeighbor[] = [];
  const sameBeat: SelectedNoteNeighbor[] = [];

  for (const n of allNotes) {
    if (selSet.has(n)) continue;
    const nSoundEnd = Math.max(n.end, n.soundEnd ?? n.end);
    const overlapsTime = sel.some((s) => n.start < s.end - eps && n.end > s.start + eps);
    const pedallyOverlaps =
      sel.length === 1 && n.start <= refNote.start + eps && nSoundEnd > refNote.start + eps;
    if (overlapsTime || pedallyOverlaps) {
      simultaneous.push({
        note: n,
        index: idxOf(n),
        hand: anHandOf(n),
        semitones: n.midi - refNote.midi,
      });
    } else if (n.start >= beatStart - eps && n.start < beatEnd - eps) {
      sameBeat.push({
        note: n,
        index: idxOf(n),
        hand: anHandOf(n),
        semitones: n.midi - refNote.midi,
      });
    }
  }

  const byOrder = (a: SelectedNoteNeighbor, b: SelectedNoteNeighbor) =>
    Math.abs(a.semitones) - Math.abs(b.semitones) || a.note.midi - b.note.midi;
  simultaneous.sort(byOrder);
  sameBeat.sort((a, b) => a.note.start - b.note.start || byOrder(a, b));

  // Melodic prev / next in the same voice as the reference note (or nearest/outer selected notes)
  const around = anVoiceNeighbors(allNotes);
  const firstNote = sel.slice().sort((a, b) => a.start - b.start || a.midi - b.midi)[0];
  const lastNote = sel.slice().sort((a, b) => a.start - b.start || a.midi - b.midi)[sel.length - 1];
  const prevCand = around.get(firstNote)?.prev ?? null;
  const nextCand = around.get(lastNote)?.next ?? null;

  const prevMelodic =
    prevCand && !selSet.has(prevCand)
      ? {
          note: prevCand,
          index: idxOf(prevCand),
          hand: anHandOf(prevCand),
          semitones: prevCand.midi - firstNote.midi,
        }
      : null;

  const nextMelodic =
    nextCand && !selSet.has(nextCand)
      ? {
          note: nextCand,
          index: idxOf(nextCand),
          hand: anHandOf(nextCand),
          semitones: nextCand.midi - lastNote.midi,
        }
      : null;

  // Build context chord combining selected notes + simultaneous, expanding to same-beat broken chord if needed
  const verticalGroup = [...sel, ...simultaneous.map((x) => x.note)];
  const verticalPcs = new Set(verticalGroup.map((n) => pc(n.midi)));
  const chordGroup =
    verticalPcs.size >= 3 ? verticalGroup : [...verticalGroup, ...sameBeat.map((x) => x.note)];
  const chordPcs = new Set(chordGroup.map((n) => pc(n.midi)));
  let contextChord: SelectionNeighborSummary['contextChord'] = null;
  if (chordPcs.size >= 3) {
    const midis = [...new Set(chordGroup.map((n) => n.midi))].sort((a, b) => a - b);
    const id = theory.identifyChord(midis, SEL_CHORDS);
    if (id) {
      contextChord = {
        rootPc: id.rootPc,
        symbol: id.chord.symbol,
        bassPc: id.bassPc,
        inversion: id.inversion,
        pitches: midis,
      };
    }
  }

  return {
    simultaneous: simultaneous.slice(0, 6),
    sameBeat: sameBeat.slice(0, 6),
    prevMelodic,
    nextMelodic,
    contextChord,
  };
}

export function analyzeScoreSelection(
  sel: readonly AnNote[],
  allNotes: readonly AnNote[],
  barSegs: readonly AnHarmonySeg[],
  ctx: AnHarmonyContext = {},
): ScoreSelectionAnalysis | null {
  if (!sel.length) return null;
  const sortedSel = sel.slice().sort((a, b) => a.start - b.start || a.midi - b.midi);
  const measures = anResolveMeasures(ctx.measures, allNotes.length ? allNotes : sortedSel);
  const ref = sortedSel[0];
  const measure = anMeasureForBeat(measures, ref.start) ?? { number: '1', start: 0, end: 4, num: 4, den: 4 };
  const key = anKeyFromMap(ctx.keyMap, ref.start);
  const pitches = [...new Set(sortedSel.map((n) => n.midi))].sort((a, b) => a - b);

  const findSegAt = (beat: number) => {
    for (const s of barSegs) {
      if (beat >= s.start - 1e-6 && beat < s.end - 1e-6) return s;
    }
    return null;
  };
  const localSeg = findSegAt(ref.start);
  const neighbors = collectSelectionNeighbors(sortedSel, allNotes, measures, ref, ctx);

  if (pitches.length === 1) {
    const deg = scaleDegreeInfo(ref.midi, key);
    const u = anBeatUnit(measure);
    const beat = 1 + (ref.start - measure.start) / u;
    const roleInfo = chordToneRole(ref.midi, localSeg, ref);
    return {
      kind: 'note',
      note: ref,
      count: sortedSel.length,
      measure,
      beat,
      hand: anHandOf(ref),
      key,
      degreeLabel: deg.label,
      diatonic: deg.diatonic,
      localSeg,
      chordRole: roleInfo.role,
      nctType: roleInfo.nctType,
      neighbors,
    };
  }

  if (pitches.length === 2) {
    const nLow = sortedSel.find((n) => n.midi === pitches[0]) ?? sortedSel[0];
    const nHigh = sortedSel.find((n) => n.midi === pitches[1]) ?? sortedSel[sortedSel.length - 1];
    const simultaneous =
      nLow.start < nHigh.end - 1e-4 && nHigh.start < nLow.end - 1e-4;
    return {
      kind: 'interval',
      pitches: [pitches[0], pitches[1]],
      notes: sortedSel,
      semitones: pitches[1] - pitches[0],
      simultaneous,
      measure,
      key,
      degrees: [scaleDegreeInfo(pitches[0], key).label, scaleDegreeInfo(pitches[1], key).label],
      localSeg,
      neighbors,
    };
  }

  const selMeasures = measures.filter((m) =>
    sortedSel.some((n) => n.start < m.end - 1e-6 && n.end > m.start + 1e-6),
  );
  const segs = anHarmony(sortedSel, false, {
    measures: selMeasures.length ? selMeasures : measures,
    keyMap: ctx.keyMap,
    noteIndex: ctx.noteIndex,
  });
  anCadences(segs, ctx.keyMap);

  let directChord: ChordSelectionAnalysis['directChord'] = null;
  const id = theory.identifyChord(pitches, SEL_CHORDS);
  if (id) {
    const tpl = AN_CHORDS[id.chord.idx] ?? AN_CHORDS[0];
    directChord = {
      rootPc: id.rootPc,
      template: tpl,
      bassPc: id.bassPc,
      inversion: id.inversion,
      tones: tpl.p.map((i) => (id.rootPc + i) % 12),
    };
  }

  return {
    kind: 'chord',
    pitches,
    notes: sortedSel,
    measure,
    key,
    segs,
    directChord,
    neighbors,
  };
}

/* ---------- Free-shape Lasso Geometry ---------- */

export interface LassoPoint {
  x: number;
  y: number;
}

export function lassoAppendPoint(points: LassoPoint[], pt: LassoPoint, minDist = 4): boolean {
  const last = points[points.length - 1];
  if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < minDist) return false;
  points.push(pt);
  return true;
}

export function lassoPolygonArea(poly: readonly LassoPoint[]): number {
  if (poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    sum += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  }
  return Math.abs(sum) / 2;
}

function pointToSegmentDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-9) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return (px - qx) ** 2 + (py - qy) ** 2;
}

export function pointInLasso(x: number, y: number, poly: readonly LassoPoint[]): boolean {
  if (poly.length < 2) return false;
  if (poly.length >= 3 && lassoPolygonArea(poly) >= 16) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x;
      const yi = poly[i].y;
      const xj = poly[j].x;
      const yj = poly[j].y;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }
  // Thin 1D swipe fallback: select noteheads touched within 6px of the drawn stroke.
  const maxDistSq = 36;
  for (let i = 1; i < poly.length; i++) {
    if (pointToSegmentDistSq(x, y, poly[i - 1].x, poly[i - 1].y, poly[i].x, poly[i].y) <= maxDistSq) {
      return true;
    }
  }
  return false;
}

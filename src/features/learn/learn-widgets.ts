import * as theory from '../../domain/theory.js';
import { queryHtml } from '../../domain/dom.js';
import {
  cofBindKeys, cofFifths, cofWheelSelect, renderCofWheel,
} from '../../domain/circle-of-fifths.js';
import { renderGrandStaff } from '../../domain/grand-staff.js';
import {
  SS_FLAT_ORDER, SS_SHARP_ORDER, ssKeyAcc, type SrToken,
} from '../../domain/score-types.js';
import type { AppHost } from '../../domain/views.js';

const SCALES = theory.SCALE_DEFINITIONS;
const CHORDS = theory.CHORD_TEMPLATES;
const CHORD_DEG = theory.CHORD_DEGREE_LABELS;

export const LTEMPO: [number, string][] = [
  [60, 'Largo'],
  [76, 'Adagio'],
  [108, 'Andante'],
  [120, 'Moderato'],
  [168, 'Allegro'],
  [999, 'Presto'],
];

export const LLET = 'CDEFGAB';
export const LNAT = [0, 2, 4, 5, 7, 9, 11] as const;
export const LSPF: readonly (readonly [number, number])[] = [
  [0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0],
  [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0],
];
export const LSPS: readonly (readonly [number, number])[] = [
  [0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0],
  [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0],
];
export const LW_PRESETS = [
  'Major (Ionian)',
  'Aeolian (Natural minor)',
  'Harmonic minor',
  'Melodic minor',
  'Dorian',
  'Major pentatonic',
  'Minor pentatonic',
  'Blues',
] as const;
export const LW_Q = ['maj', 'm', 'dim', 'aug', 'sus2', 'sus4', '7', 'maj7', 'm7', 'm7♭5', 'dim7', '6', 'add9'] as const;
export const LW_STEP: Record<number, number> = {
  0: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 4, 9: 5, 10: 6, 11: 6, 14: 1,
};

/** Settings of each Learn widget, kept on its element as `_s`. */
export interface LwScaleState { root: number; st: number[] }
export interface LwChordState { root: number; q: string; inv: number; bass: number }
export interface LwCofState { i: number; enh?: boolean; minor?: boolean }
export interface LwMetroState { bpm: number; meter: string }
export type LwState = LwScaleState | LwChordState | LwCofState | LwMetroState;
export type LearnWidgetEl = HTMLElement & { _s?: LwState };

export interface LearnMetronome {
  el: LearnWidgetEl | null;
  timer: ReturnType<typeof setInterval> | 0;
  next: number;
  i: number;
}

const lwIsScale = (s: LwState | undefined): s is LwScaleState => !!s && 'st' in s;
const lwIsChord = (s: LwState | undefined): s is LwChordState => !!s && 'q' in s;
const lwIsCof = (s: LwState | undefined): s is LwCofState => !!s && 'i' in s;
const lwIsMetro = (s: LwState | undefined): s is LwMetroState => !!s && 'bpm' in s;

function lwStateError(el: LearnWidgetEl): TypeError {
  return new TypeError('Étude: widget ' + el.dataset.widget + ' has no settings');
}
function lwScaleState(el: LearnWidgetEl): LwScaleState {
  const s = el._s;
  if (!lwIsScale(s)) throw lwStateError(el);
  return s;
}
function lwChordState(el: LearnWidgetEl): LwChordState {
  const s = el._s;
  if (!lwIsChord(s)) throw lwStateError(el);
  return s;
}
function lwCofState(el: LearnWidgetEl): LwCofState {
  const s = el._s;
  if (!lwIsCof(s)) throw lwStateError(el);
  return s;
}
function lwMetroState(el: LearnWidgetEl): LwMetroState {
  const s = el._s;
  if (!lwIsMetro(s)) throw lwStateError(el);
  return s;
}
function lwPart(el: Element, sel: string): Element {
  const f = el.querySelector(sel);
  if (!f) throw new TypeError('Étude: widget part missing: ' + sel);
  return f;
}

export function lStaffFit(svg: string, w: number): string {
  return svg.replace('<svg class="ss-svg"', '<svg class="ss-svg" style="--sw:' + w + 'px"');
}

export function lmTerm(b: number): string {
  const x = LTEMPO.find((y) => b < y[0]);
  if (!x) throw new RangeError('Étude: tempo out of range');
  return x[1];
}

export function lmMeter(m: string): { n: number; div: number; lvl: (i: number) => number } {
  return m === '6/8'
    ? { n: 6, div: 3, lvl: (i: number) => (i === 0 ? 2 : i === 3 ? 1 : 0) }
    : { n: +m[0], div: 1, lvl: (i: number) => (i === 0 ? 2 : 0) };
}

export function lPitch(li: number, acc: number, midi: number): string {
  return LLET[li] + (acc > 0 ? '#' : acc < 0 ? 'b' : '') + (Math.floor((midi - acc) / 12) - 1);
}

export function lCofN(i: number, enh?: boolean): number {
  return cofFifths(i, enh);
}

export function lCofKey(i: number, enh?: boolean) {
  const n = lCofN(i, enh);
  const ka = ssKeyAcc(n);
  const li = n >= 0 ? (4 * n) % 7 : (3 * -n) % 7;
  const mli = (li + 5) % 7;
  return { n, li, acc: ka[li], mli, macc: ka[mli], ka };
}

export function lCofTriad(K: ReturnType<typeof lCofKey>, minor?: boolean) {
  const rLi = minor ? K.mli : K.li;
  const oct = rLi >= 5 ? -12 : 0;
  const tones = [0, 2, 4].map((d) => {
    const li = (rLi + d) % 7;
    const acc = K.ka[li];
    const midi = 60 + LNAT[li] + acc + (li < rLi ? 12 : 0) + oct;
    return { pitch: lPitch(li, acc, midi), midi };
  });
  return { pitches: tones.map((x) => x.pitch), midis: tones.map((x) => x.midi) };
}

export interface LearnWidgetsDeps {
  host: AppHost;
  learnHalt: () => void;
  learnLight: (midis: number[], durMs: number) => void;
  lSeqLight: (chords: number[][], stepMs: number, holdMs: number) => void;
  learnSay: (msg: string | null) => void;
  learnReveal: (el: Element) => void;
  learnCtxTime: () => number;
}

export function createLearnWidgets(deps: LearnWidgetsDeps) {
  const { host, learnHalt, learnLight, lSeqLight, learnSay, learnReveal, learnCtxTime } = deps;
  const LM: LearnMetronome = { el: null, timer: 0, next: 0, i: 0 };

  const lSp = (li: number, acc: number): string => host.i18n.spell(li, acc);

  function lStaffSmall(piece: { rh: SrToken[]; lh?: SrToken[]; keyN?: number }, label: string): string {
    const r = renderGrandStaff(
      Object.assign({ ts: [4, 4] as [number, number], keyN: 0, noNames: true, noTs: true, compact: true }, piece),
      undefined,
      { namesVisible: false, notation: host.i18n.notation(), proportional: false },
    );
    return '<div class="ss-wrap lw-staff">' + lStaffFit(r.svg.replace('<svg class="ss-svg"', '<svg class="ss-svg" role="img" aria-label="' + label.replace(/"/g, '&quot;') + '"'), r.W) + '</div>';
  }

  function lSel(wi: string, opts: (string | number)[][], cur: string | number, lab: string): string {
    return '<label><span>' + lab + '</span><select data-wi="' + wi + '">' +
      opts.map((o) => '<option value="' + o[0] + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + o[1] + '</option>').join('') +
      '</select></label>';
  }

  function lmStop(): void {
    if (LM.timer) {
      clearInterval(LM.timer);
      LM.timer = 0;
    }
    const el = LM.el;
    LM.el = null;
    if (!el) return;
    const b = el.querySelector('[data-w="mstart"]');
    if (b) {
      b.setAttribute('aria-pressed', 'false');
      b.textContent = '▶ ' + host.i18n.t('lw_start');
    }
    el.querySelectorAll('.lbeat .on').forEach((d) => d.classList.remove('on'));
  }

  function lmDots(el: LearnWidgetEl): void {
    const s = lwMetroState(el);
    const M = lmMeter(s.meter);
    lwPart(el, '.lbeat').innerHTML = Array.from({ length: M.n }, (_, i) =>
      '<span' + (M.lvl(i) === 2 ? ' class="s"' : M.lvl(i) === 1 ? ' class="m"' : '') + '>' + (i + 1) + '</span>').join('');
  }

  function lmStart(el: LearnWidgetEl): void {
    host.audio.ensure();
    LM.el = el;
    LM.next = learnCtxTime() + 0.1;
    LM.i = 0;
    const b = lwPart(el, '[data-w="mstart"]');
    b.setAttribute('aria-pressed', 'true');
    b.textContent = '■ ' + host.i18n.t('lw_stop');
    LM.timer = setInterval(() => {
      if (!LM.el || !document.body.contains(el) || host.nav.activeView() !== 'learn') {
        lmStop();
        return;
      }
      const s = lwMetroState(el);
      const M = lmMeter(s.meter);
      const dt = 60 / s.bpm / M.div;
      const dots = el.querySelectorAll('.lbeat span');
      while (LM.next < learnCtxTime() + 0.12) {
        const k = LM.i % M.n;
        const lv = M.lvl(k);
        host.metro.click(LM.next, lv > 0);
        setTimeout(() => {
          if (LM.el === el) dots.forEach((d, j) => d.classList.toggle('on', j === k));
        }, Math.max(0, (LM.next - learnCtxTime()) * 1000));
        LM.i++;
        LM.next += dt;
      }
    }, 25);
  }

  function lwMetro(el: LearnWidgetEl): void {
    const s = lwIsMetro(el._s) ? el._s : (el._s = { bpm: 90, meter: '4/4' });
    el.innerHTML = '<h4>⏱ ' + host.i18n.t('lw_metro') + '</h4><div class="lw-row"><label class="lw-range"><span>' + host.i18n.t('lw_tempo') +
      '</span><input type="range" min="40" max="208" step="1" value="' + s.bpm + '" data-wi="bpm" aria-valuetext="' + host.i18n.t('lw_bpm', s.bpm) + ', ' + lmTerm(s.bpm) + '"></label>' +
      '<output class="lw-bpm" aria-live="polite"><b>' + s.bpm + '</b> BPM · <i>' + lmTerm(s.bpm) + '</i></output></div>' +
      '<div class="lw-row"><label><span>' + host.i18n.t('lw_meter') + '</span><select data-wi="meter">' +
      ['2/4', '3/4', '4/4', '6/8'].map((m) => '<option' + (m === s.meter ? ' selected' : '') + '>' + m + '</option>').join('') +
      '</select></label><button type="button" class="btn primary sm" data-w="mstart" aria-pressed="false">▶ ' + host.i18n.t('lw_start') +
      '</button></div><div class="lbeat lbeat-lg" aria-hidden="true"></div>';
    lmDots(el);
  }

  function lwScale(el: LearnWidgetEl): void {
    const s = lwIsScale(el._s) ? el._s : (el._s = { root: 0, st: [2, 2, 1] });
    const cum = [0];
    s.st.forEach((x) => cum.push(cum[cum.length - 1] + x));
    const tot = cum[cum.length - 1];
    const flat = [5, 10, 3, 8, 1].includes(s.root);
    const offs = tot === 12 ? cum.slice(0, -1) : cum;
    const nm = tot === 12 ? Object.keys(SCALES).find((k) => SCALES[k].join() === offs.join()) : null;
    el.innerHTML = '<h4>🪜 ' + host.i18n.t('lw_scale') + '</h4><div class="lw-row">' +
      lSel('root', LSPF.map((x, i) => [i, lSp(x[0], x[1])]), s.root, host.i18n.t('lw_root')) +
      lSel('preset', [['', host.i18n.t('lw_presets') + '…']].concat(LW_PRESETS.map((k) => [k, host.i18n.scaleDisp(k)])), '', host.i18n.t('lw_presets')) + '</div>' +
      '<div class="lw-row" role="group" aria-label="' + host.i18n.t('lw_steps') + '">' +
      [['w', host.i18n.t('lw_w')], ['h', host.i18n.t('lw_h')], ['wh', host.i18n.t('lw_wh')]].map((b) =>
        '<button type="button" class="btn sm" data-w="' + b[0] + '"' + (tot >= 12 ? ' disabled' : '') + '>+ ' + b[1] + '</button>').join('') +
      '<button type="button" class="btn ghost sm" data-w="undo"' + (s.st.length ? '' : ' disabled') + '>↶ ' + host.i18n.t('lw_undo') +
      '</button><button type="button" class="btn ghost sm" data-w="clear">' + host.i18n.t('lw_clear') +
      '</button><button type="button" class="btn primary sm" data-w="splay">▶ ' + host.i18n.t('lw_play') + '</button></div>' +
      '<div class="lw-steps" aria-label="' + host.i18n.t('lw_steps') + '">' +
      (s.st.length ? s.st.map((x) => '<span class="lw-st s' + x + '">' + host.i18n.stepLabel(x) + '</span>').join('') : '<span class="lw-st">—</span>') + '</div>' +
      '<div class="lw-notes">' + cum.map((o, i) => '<span class="lw-chip' + (i === 0 || o === 12 ? ' t' : '') + '">' + host.i18n.pcName(s.root + o, flat) + '</span>').join('') + '</div>' +
      '<p class="lw-out" aria-live="polite">' + host.i18n.t('lw_total', tot) + ' · ' +
      (tot === 12 ? (nm ? host.i18n.t('lw_name', '<b>' + host.i18n.scaleDisp(nm) + '</b>') : host.i18n.t('lw_complete') + ' ' + host.i18n.t('lw_name_none')) : host.i18n.t('lw_name_none')) + '</p>';
  }

  function lwChordData(s: LwChordState) {
    const c = CHORDS.find((x) => x.symbol === s.q);
    const rs = LSPF[s.root];
    const base = 60 + s.root - (s.root > 6 ? 12 : 0);
    if (!c) throw new TypeError('Étude: unknown chord quality ' + s.q);
    const tones = c.intervals.map((iv) => {
      let li = (rs[0] + (s.q === 'dim7' && iv === 9 ? 6 : LW_STEP[iv] || 0)) % 7;
      const pcT = (s.root + iv) % 12;
      let acc = ((pcT - LNAT[li]) % 12 + 18) % 12 - 6;
      if (Math.abs(acc) > 1) {
        li = LSPS[pcT][0];
        acc = LSPS[pcT][1];
      }
      return { li, acc, midi: base + iv, iv };
    });
    const inv = Math.min(s.inv, tones.length - 1);
    for (let k = 0; k < inv; k++) tones[k].midi += 12;
    tones.sort((a, b) => a.midi - b.midi);
    let b: { li: number; acc: number; midi: number } = tones[0];
    if (s.bass >= 0 && s.bass !== b.midi % 12) {
      const sp = tones.find((x) => x.midi % 12 === s.bass) || { li: LSPF[s.bass][0], acc: LSPF[s.bass][1] };
      b = { li: sp.li, acc: sp.acc, midi: 0 };
    }
    const bpc = s.bass >= 0 ? s.bass : tones[0].midi % 12;
    let bm = 36 + bpc;
    if (bm < 40) bm += 12;
    const root = tones.find((x) => x.iv === 0);
    if (!root) throw new TypeError('Étude: chord has no root');
    const sym = lSp(root.li, root.acc) + (s.q === 'maj' ? '' : s.q);
    const slash = bpc !== s.root;
    return { c, tones, inv, bass: { li: b.li, acc: b.acc, midi: bm }, symbol: sym + (slash ? '/' + lSp(b.li, b.acc) : '') };
  }

  function lwChord(el: LearnWidgetEl): void {
    const s = lwIsChord(el._s) ? el._s : (el._s = { root: 0, q: 'maj', inv: 0, bass: -1 });
    const D = lwChordData(s);
    el.innerHTML = '<h4>🧱 ' + host.i18n.t('lw_chord') + '</h4><div class="lw-row">' +
      lSel('root', LSPF.map((x, i) => [i, lSp(x[0], x[1])]), s.root, host.i18n.t('lw_root')) +
      lSel('q', LW_Q.map((q) => {
        const c = CHORDS.find((x) => x.symbol === q);
        return [q, (q === 'maj' ? '—' : q) + ' · ' + host.i18n.chordDisp(c)];
      }), s.q, host.i18n.t('lw_quality')) +
      lSel('inv', Array.from({ length: D.tones.length }, (_, i) => [i, host.i18n.t('lw_inv' + i)]), D.inv, host.i18n.t('lw_inv')) +
      lSel('bass', [[-1, host.i18n.t('lw_none')]].concat(LSPF.map((x, i) => [i, lSp(x[0], x[1])])), s.bass, host.i18n.t('lw_bass')) + '</div>' +
      '<dl class="lw-dl"><div><dt>' + host.i18n.t('lw_symbol') + '</dt><dd><b>' + D.symbol + '</b></dd></div><div><dt>' +
      host.i18n.t('lw_formula') + '</dt><dd>' + D.c.intervals.map((i) => CHORD_DEG[i] || i).join(' – ') + '</dd></div>' +
      '<div><dt>' + host.i18n.t('lw_notes') + '</dt><dd>' + D.tones.map((x) => lSp(x.li, x.acc)).join(' – ') + '</dd></div></dl>' +
      lStaffSmall({ rh: [[D.tones.map((x) => lPitch(x.li, x.acc, x.midi)), 4]], lh: [[lPitch(D.bass.li, D.bass.acc, D.bass.midi), 4]] }, D.symbol) +
      '<div class="lw-row"><button type="button" class="btn primary sm" data-w="cplay">▶ ' + host.i18n.t('lw_play') + '</button></div>';
  }

  function lwCofInfo(el: LearnWidgetEl, s: LwCofState): void {
    cofWheelSelect(el, s.i, !!s.minor, true);
    const hasEnh = s.i >= 5 && s.i <= 7;
    const enh = hasEnh && !!s.enh;
    const minor = !!s.minor;
    const K = lCofKey(s.i, enh);
    const altK = hasEnh ? lCofKey(s.i, !enh) : null;
    const cnt = Math.abs(K.n);
    const ord = (K.n >= 0 ? SS_SHARP_ORDER : SS_FLAT_ORDER).slice(0, cnt).map((li) => lSp(li, K.n > 0 ? 1 : -1));
    const tri = lCofTriad(K, minor);
    const sig = cnt ? host.i18n.t(K.n > 0 ? 'lw_sig_s' : 'lw_sig_f', cnt, ord.join(' ')) : host.i18n.t('lw_sig0');
    const name = minor ? lSp(K.mli, K.macc) : lSp(K.li, K.acc);
    const key = host.i18n.t(minor ? 'key_minor' : 'key_major', name);
    const relName = minor ? lSp(K.li, K.acc) : lSp(K.mli, K.macc);
    const relKey = host.i18n.t(minor ? 'key_major' : 'key_minor', relName);
    const relHtml = minor ? host.i18n.t('cof_rel_maj', '<b>' + relKey + '</b>') : host.i18n.t('lw_rel', '<b>' + relKey + '</b>');
    const togBtns = '<button type="button" class="btn ghost sm" data-w="cofmin">' + relKey + '</button>' +
      (altK ? '<button type="button" class="btn ghost sm" data-w="cofenh">' +
        lSp(minor ? altK.mli : altK.li, minor ? altK.macc : altK.acc) + ' (' + Math.abs(altK.n) + (altK.n > 0 ? '♯' : '♭') + ')</button>' : '');
    lwPart(el, '.lw-cof-info').innerHTML = '<p><b>' + key + '</b></p><p>' + sig + '</p><p>' + relHtml + '</p>' +
      lStaffSmall({ rh: [[tri.pitches, 4]], keyN: K.n }, key + '. ' + sig) +
      '<div class="lw-row"><button type="button" class="btn primary sm" data-w="cofplay">▶ ' + host.i18n.t('lw_play') + '</button>' + togBtns + '</div>';
  }

  async function lwCofPlay(s: LwCofState): Promise<void> {
    const tri = lCofTriad(lCofKey(s.i, s.enh), s.minor);
    learnHalt();
    host.audio.ensure();
    if (!await host.audio.preparePiano()) return;
    host.audio.playChordMidis(tri.midis, true);
    learnLight(tri.midis, 2200);
  }

  function lwCof(el: LearnWidgetEl): void {
    const s = lwIsCof(el._s) ? el._s : (el._s = { i: 0 });
    el.innerHTML = '<p class="lw-hint">' + host.i18n.t('lw_cof_d') + '</p><div class="lw-cof-wrap"><div class="lw-cof-wheel">' +
      renderCofWheel('staff', {
        t: (key, ...args) => host.i18n.t(key, ...args),
        spellName: (letter, acc) => host.i18n.spell(letter, acc),
        lCofN,
      }) +
      '</div><div class="lw-cof-info" aria-live="polite"></div></div>';
    lwCofInfo(el, s);
    cofBindKeys(el, (i, minor) => {
      if (i !== s.i) s.enh = false;
      s.i = i;
      s.minor = minor;
      lwCofInfo(el, s);
      void lwCofPlay(s);
    });
  }

  const LW_R: Record<string, ((el: LearnWidgetEl) => void) | undefined> = {
    scale: lwScale,
    chord: lwChord,
    cof: lwCof,
    metro: lwMetro,
  };

  function lwMount(el: LearnWidgetEl): void {
    el.classList.add('lw');
    const f = LW_R[el.dataset.widget ?? ''];
    if (f) f(el);
  }

  function lwRefocus(el: LearnWidgetEl, sel: string): void {
    (LW_R[el.dataset.widget ?? ''] || (() => {}))(el);
    const f = queryHtml(el, sel);
    const g = f && !('disabled' in f && f.disabled) ? f : queryHtml(el, '[data-w="splay"],[data-w="clear"]');
    if (g) {
      g.focus({ preventScroll: true });
      learnReveal(g);
    }
  }

  async function lwScalePlay(el: LearnWidgetEl): Promise<void> {
    const s = lwScaleState(el);
    const cum = [0];
    s.st.forEach((x) => cum.push(cum[cum.length - 1] + x));
    learnHalt();
    host.audio.ensure();
    if (!await host.audio.preparePiano()) return;
    const r = 60 + s.root - (s.root > 6 ? 12 : 0);
    const T0 = learnCtxTime() + 0.05;
    cum.forEach((o, i) => host.audio.previewNote(r + o, T0 + i * 0.3, 0.3, 90));
    lSeqLight(cum.map((o) => [r + o]), 300, 600);
    const nm = el.querySelector('.lw-out');
    if (nm) learnSay(nm.textContent);
  }

  async function lwChordPlay(el: LearnWidgetEl): Promise<void> {
    const D = lwChordData(lwChordState(el));
    const ms = [D.bass.midi].concat(D.tones.map((x) => x.midi));
    learnHalt();
    host.audio.ensure();
    if (!await host.audio.preparePiano()) return;
    const T0 = learnCtxTime() + 0.05;
    ms.forEach((m, i) => host.audio.previewNote(m, T0 + i * 0.14, 0.4, 86));
    ms.forEach((m) => host.audio.previewNote(m, T0 + ms.length * 0.14 + 0.1, 1.3, 84));
    learnLight(ms, ms.length * 140 + 1600);
    learnSay(D.symbol);
  }

  function lwInput(e: Event): void {
    const x = e.target;
    if (!(x instanceof HTMLInputElement || x instanceof HTMLSelectElement)) return;
    const wi = x.dataset.wi;
    const box = x.closest('[data-widget]');
    const el: LearnWidgetEl | null = box instanceof HTMLElement ? box : null;
    if (!wi || !el) return;
    if (wi === 'bpm') {
      const s = lwMetroState(el);
      s.bpm = +x.value;
      x.setAttribute('aria-valuetext', host.i18n.t('lw_bpm', s.bpm) + ', ' + lmTerm(s.bpm));
      lwPart(el, '.lw-bpm').innerHTML = '<b>' + s.bpm + '</b> BPM · <i>' + lmTerm(s.bpm) + '</i>';
      return;
    }
    if (e.type !== 'change') return;
    if (wi === 'meter') {
      lwMetroState(el).meter = x.value;
      LM.i = 0;
      lmDots(el);
      return;
    }
    if (wi === 'preset') {
      if (!x.value) return;
      const o = SCALES[x.value].concat([12]);
      lwScaleState(el).st = o.slice(1).map((v, i) => v - o[i]);
    } else if (wi === 'root') {
      const s = el._s;
      if (!lwIsScale(s) && !lwIsChord(s)) throw lwStateError(el);
      s.root = +x.value;
    } else if (wi === 'q') {
      const s = lwChordState(el);
      s.q = x.value;
      s.inv = 0;
    } else if (wi === 'inv') {
      lwChordState(el).inv = +x.value;
    } else if (wi === 'bass') {
      lwChordState(el).bass = +x.value;
    }
    lwRefocus(el, '[data-wi="' + wi + '"]');
    if (el.dataset.widget === 'chord') void lwChordPlay(el);
    else if (wi === 'preset') void lwScalePlay(el);
  }

  async function lwClick(w: HTMLElement): Promise<void> {
    const box = w.closest('[data-widget]');
    const el: LearnWidgetEl | null = box instanceof HTMLElement ? box : null;
    if (!el) return;
    const a = w.dataset.w;
    if (a === 'mstart') {
      if (LM.el === el) lmStop();
      else {
        learnHalt();
        lmStart(el);
      }
      return;
    }
    if (a === 'splay') return lwScalePlay(el);
    if (a === 'cplay') return lwChordPlay(el);
    if (a === 'cofplay' || a === 'cofmin' || a === 'cofenh') {
      const s = lwCofState(el);
      if (a !== 'cofplay') {
        if (a === 'cofmin') s.minor = !s.minor;
        else s.enh = !s.enh;
        lwCofInfo(el, s);
        queryHtml(el, '[data-w="' + a + '"]')?.focus({ preventScroll: true });
      }
      return lwCofPlay(s);
    }
    if (a === 'w' || a === 'h' || a === 'wh') {
      const s = lwScaleState(el);
      const st = ({ w: 2, h: 1, wh: 3 })[a];
      const tot = s.st.reduce((x, y) => x + y, 0);
      if (tot + st > 12) {
        learnSay(host.i18n.t('lw_over'));
        return;
      }
      s.st.push(st);
      lwRefocus(el, '[data-w="' + a + '"]');
      const m = 60 + s.root - (s.root > 6 ? 12 : 0) + tot + st;
      host.audio.ensure();
      if (await host.audio.preparePiano()) {
        host.audio.previewNote(m, learnCtxTime() + 0.02, 0.5, 90);
        learnLight([m], 700);
      }
      if (tot + st === 12) learnSay(lwPart(el, '.lw-out').textContent);
      return;
    }
    if (a === 'undo') {
      lwScaleState(el).st.pop();
      lwRefocus(el, '[data-w="undo"]');
      return;
    }
    if (a === 'clear') {
      lwScaleState(el).st = [];
      lwRefocus(el, '[data-w="clear"]');
    }
  }

  return {
    LM,
    LW_R,
    lmStop,
    lmDots,
    lmStart,
    lwMetro,
    lwScale,
    lwChord,
    lwChordData,
    lwCof,
    lwCofInfo,
    lwCofPlay,
    lwMount,
    lwRefocus,
    lwInput,
    lwClick,
    lwScalePlay,
    lwChordPlay,
    lSp,
    lStaffSmall,
    lSel,
  };
}

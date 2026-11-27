import type { ReadDrillData, TranslateFn } from '../../domain/views.js';
import { randItem } from '../../core/collections.js';
import { type ReadDrillLevel } from '../../core/reading-curriculum.js';
import { type SrLayout, type SrRenderResult, type SrScore } from '../../domain/score-types.js';
import { byId, maybeById, queryHtml } from '../../domain/dom.js';
import { inputTime } from '../../domain/midi-timing.js';

import type { AppHost } from '../../domain/views.js';
import * as theory from '../../domain/theory.js';

const pc = theory.pitchClass, srKeyName = theory.circleKeyPitchClass, rdSpellMidi = theory.readingSpelling;
import type { ReadDrillState, RdRhythmUnit, RdRhythmEvent, RdRhythmTapResult, RdRhythmTapGrade, RdLeftHandPattern, RdRhythmRender, RdRhythmPiece, RdRhythmPress, RdRhythmGrade, RdRhythmState, RdRhythmNoteResult, RdRhythmHandGrade, RdRhythmCountKey, RdRhythmAllGrade } from './read-model.js';


/** Shell state and services createRhythmReading reads; values are getters so shell declarations made later resolve on use. */
export interface RhythmReadingDeps {
  readonly host: AppHost;
  readonly ensureAudio: (warm?: boolean) => AudioContext | null;
  readonly isRdRhythmUnit: (u: string) => u is RdRhythmUnit;
  readonly kbState: (midi: number, state: string | null, fold: boolean) => void;
  readonly markReadDoneToday: (save?: boolean) => void;
  readonly RD: ReadDrillState;
  readonly RD_LH_PAT: Record<RdLeftHandPattern, number[][]>;
  readonly RD_RHU: Record<RdRhythmUnit, number[][]>;
  readonly rdBeatX: (r: { beatX: readonly { b: number; x: number; }[]; }, beat: number) => number;
  readonly rdClick: (tm: number, acc: boolean) => void;
  readonly rdData: () => ReadDrillData;
  readonly rdEsc: (value: string | number | undefined) => string;
  readonly rdFinish: () => void;
  readonly rdHud: () => void;
  readonly rdLevelBpm: (L: ReadDrillLevel) => number;
  readonly rdnWarmLimit: () => boolean;
  readonly rdStat: (k: string, ok: boolean, ms: number) => void;
  readonly srPaperChanged: (prev: SrLayout | undefined, next: SrLayout | undefined) => boolean;
  readonly srPaperOf: (wrap: HTMLElement | null) => SrLayout | undefined;
  readonly srRender: (piece: SrScore, lay?: SrLayout, proportional?: boolean) => SrRenderResult;
  readonly t: TranslateFn;
  readonly timedAudioReady: (context: AudioContext) => Promise<boolean>;
}

/* Rhythm reading (Read → Drills, the rhythm unit): tap or play the rhythm on the beat, judged against the drill clock. */
export function createRhythmReading(deps: RhythmReadingDeps) {
  const { host } = deps;
    function rdRhGen(L: { units?: readonly string[]; }) {
      const units = L.units;
      if (!units)
          throw new TypeError('Étude: rhythm level has no note values');
      let ev: RdRhythmEvent[] = [];
      for (let tries = 0; tries < 12; tries++) {
          ev = [];
          for (let bar = 0; bar < 2; bar++) {
              let pos = 0;
              while (pos < 4 - 1e-6) {
                  const c = units.filter((u): u is RdRhythmUnit => { if (!deps.isRdRhythmUnit(u))
                      return false; const len = deps.RD_RHU[u].reduce((a: number, x: number[]) => a + x[0], 0); return len <= 4 - pos + 1e-6 && !(u === '1' && pos > 0) && !(u === 'r4' && bar === 0 && pos === 0) && !(u === 'd' && pos % 2); });
                  const u: RdRhythmUnit = c.length ? randItem(c) : '4';
                  deps.RD_RHU[u].forEach((x: number[]) => { ev.push({ beat: bar * 4 + pos, dur: x[0], rest: !!x[1], u }); pos += x[0]; });
              }
          }
          const last = units[units.length - 1];
          if (ev.some((e) => e.u === last) && ev.filter((e) => !e.rest).length >= 4)
              break;
      }
      return ev;
  }
    function rdRhGrade(on: readonly number[], taps: readonly number[], bs: number): RdRhythmTapGrade {
      const used = new Set<number>(), res: RdRhythmTapResult[] = [];
      let minI = 4;
      for (let i = 1; i < on.length; i++)
          minI = Math.min(minI, on[i] - on[i - 1]);
      const win = Math.min(0.25, 0.5 * minI * bs);
      on.forEach((b: number) => {
          let bi = -1, bd = Infinity;
          taps.forEach((tb: number, j: number) => { if (used.has(j))
              return; const d = (tb - b) * bs; if (Math.abs(d) <= win && Math.abs(d) < Math.abs(bd)) {
              bd = d;
              bi = j;
          } });
          if (bi >= 0) {
              used.add(bi);
              const a = Math.abs(bd) * 1000;
              res.push({ s: a <= 100 ? 'good' : a <= 180 ? 'near' : 'bad', off: bd * 1000 });
          }
          else
              res.push({ s: 'bad', off: null });
      });
      const extra = taps.length - used.size, good = res.filter((r) => r.s === 'good').length, near = res.filter((r) => r.s === 'near').length;
      const offs = res.filter((r): r is RdRhythmTapResult & { off: number; } => r.off != null).map((r) => r.off), mean = offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : 0;
      return { res, extra, good, near, pct: Math.max(0, Math.round(100 * (good + 0.5 * near) / Math.max(1, on.length) - extra * 5)), mean: Math.round(mean) };
  }
    // Options (remembered): grade how long each note is held, and/or a left-hand part on a second staff.
  function rdRhPrefs() { const p = deps.rdData().prefs; return { dur: !!p.rhDur, two: p.rhHands === 2 }; }
    function rdRhGenLH(L: { n: number; }) {
      const pool: RdLeftHandPattern[] = L.n <= 2 ? ['whole', 'half'] : L.n === 3 ? ['whole', 'half', 'pulse'] : ['half', 'pulse', 'onethree', 'twofour'], ev: RdRhythmEvent[] = [];
      for (let bar = 0; bar < 2; bar++) {
          let pos = 0;
          const pat: RdLeftHandPattern = randItem(pool);
          deps.RD_LH_PAT[pat].forEach((x: number[]) => { ev.push({ beat: bar * 4 + pos, dur: x[0], rest: !!x[1] }); pos += x[0]; });
      }
      return ev;
  }
    // The anchors on the dock keyboard: C3 for the left hand, C5 for the right (any key below / from middle C counts for that hand).
  function rdRhMarks(on: boolean) { [48, 72].forEach((m) => deps.kbState(m, on ? 'target' : null, false)); }
    function rdRhNew(keep?: boolean) {
      const L = deps.RD.L, pr = rdRhPrefs(), old = keep && deps.RD.rh;
      if (!L)
          return;
      const ev = old ? old.ev : rdRhGen(L), lh = pr.two ? ((old && old.lh) || rdRhGenLH(L)) : null;
      const piece: RdRhythmPiece = { id: 'rh', perc: true, noNames: true, ts: [4, 4], keyN: 0, bpm: deps.rdLevelBpm(L), rh: ev.map((e: RdRhythmEvent): [string, number] => [e.rest ? 'R' : 'B4', e.dur]) };
      if (lh)
          piece.lh = lh.map((e: RdRhythmEvent): [string, number] => [e.rest ? 'R' : 'D3', e.dur]);
      const r: RdRhythmRender = deps.srRender(piece, undefined, true);
      const rh: RdRhythmState = { ev, lh, r, dur: pr.dur, two: pr.two, on: ev.filter((e: RdRhythmEvent) => !e.rest).map((e: RdRhythmEvent) => e.beat), taps: [], presses: [], open: new Map(), playing: false, graded: null, raf: 0, listen: false, t0: 0, piece, paper: undefined };
      deps.RD.rh = rh;
      const tst = deps.RD.mode === 'test', pad = (h: string, lbl: string, k: string) => `<button class="rdx-tap" id="rdx-tap${h === 'L' ? 'L' : ''}" data-hand="${h}" aria-label="${deps.rdEsc(lbl)}" aria-describedby="rdx-coach">${deps.rdEsc(lbl)}<small>${deps.rdEsc(k)}</small></button>`;
      const pads = pr.two ? pad('L', deps.t('rdx_tap') + ' · ' + deps.t('rdx_tap_l'), deps.t('rdx_tap_lk')) + pad('R', deps.t('rdx_tap') + ' · ' + deps.t('rdx_tap_r'), deps.t('rdx_tap_rk')) : pad('R', deps.t('rdx_tap'), deps.t('rdx_tap_k'));
      const hint = [pr.two ? deps.t('rdx_rh_two_hint') : '', pr.dur ? deps.t('rdx_rh_dur_hint') : ''].filter(Boolean).join(' ');
      byId('rdx-body').innerHTML = `<div class="rdx-q rdx-rh"><div class="rdx-prompt">${deps.t('rdx_p_rh')}${tst ? ' · ' + deps.t('rdx_hud_q', deps.RD.rhP.length + 1, 4) : ''}</div>
      <div class="rdx-rhopts" id="rdx-rhopts" role="group" aria-label="${deps.t('rdx_rh_opts')}"><label class="switch-inline"><input type="checkbox" id="rdx-rhdur"${pr.dur ? ' checked' : ''}> <span>${deps.t('rdx_rh_dur')}</span></label>
        <div class="seg" id="rdx-rhhands" role="group" aria-label="${deps.t('rdx_rh_hands')}"><button type="button" data-hands="1" aria-pressed="${!pr.two}">${deps.t('rdx_rh_one')}</button><button type="button" data-hands="2" aria-pressed="${pr.two}">${deps.t('rdx_rh_two')}</button></div></div>
      <p class="rdx-rhhint" id="rdx-rhhint">${deps.rdEsc(hint)}</p>
      <div class="rdx-staff ss-wrap" id="rdx-staff">${r.svg}</div><div class="rdx-fb" id="rdx-fb">${deps.t('rdx_rh_bpm', deps.rdLevelBpm(L))}</div><div class="rdx-rhdet" id="rdx-rhdet"></div>
      <div class="rdx-rhbar"><button class="btn primary" id="rdx-rhgo">${deps.t('rdx_rh_start')}</button>${tst ? '' : `<button class="btn ghost" id="rdx-rhlisten">${deps.t('rd_listen')}</button>`}${pads}</div>
      <div class="rdx-tools" id="rdx-rhnext"></div></div>`;
      rdRhFit();
      rdRhMarks(pr.two);
      deps.rdHud();
  }
    // Lays the rhythm out for its paper once it is on the page, and again when the paper changes size; never while it plays or
  // once it is graded, since the marks live on the drawn notes.
  function rdRhFit() {
      const R = deps.RD.rh, wrap = maybeById('rdx-staff');
      if (!R || !wrap || R.playing || R.graded || !wrap.closest('.rdx-rh'))
          return;
      const lay = deps.srPaperOf(wrap);
      if (!deps.srPaperChanged(R.paper, lay))
          return;
      R.paper = lay;
      R.r = deps.srRender(R.piece, lay, true);
      wrap.innerHTML = R.r.svg;
  }
    function rdRhOptsLock(on: boolean) { (document).querySelectorAll('#rdx-rhopts input,#rdx-rhopts button').forEach((x) => { if (x instanceof HTMLInputElement || x instanceof HTMLButtonElement)
      x.disabled = on; }); }
    let rdRhRunId = 0;
    function rdRhInterrupt() {
      const round = deps.RD.rh;
      if (!round?.playing) return;
      rdRhRunId++;
      round.playing = false;
      cancelAnimationFrame(round.raf);
      round.open.clear();
      (deps.RD.nodes || []).forEach(node => { try { node.stop(0); } catch (_) { } });
      deps.RD.nodes = [];
      byId('rdx-staff').querySelector('.ss-playhead')?.remove();
      rdRhOptsLock(false);
      byId('rdx-fb').textContent = deps.t('rdx_rh_yourturn');
      byId('rdx-live').textContent = deps.t('rdx_rh_yourturn');
  }
    async function rdRhRun(listen: boolean) {
      const R = deps.RD.rh, L = deps.RD.L;
      if (!R || !L || R.playing) return;
      const context = deps.ensureAudio();
      if (!context) return;
      const runId = ++rdRhRunId;
      R.playing = true;
      R.t0 = Infinity;
      rdRhOptsLock(true);
      if (context.state !== 'running') {
          const ready = await deps.timedAudioReady(context);
          if (deps.RD.rh !== R || rdRhRunId !== runId || !R.playing) return;
          if (!ready) {
              rdRhInterrupt();
              return;
          }
      }
      const bs = 60 / deps.rdLevelBpm(L);
      R.taps = [];
      R.presses = [];
      R.open.clear();
      R.graded = null;
      R.listen = !!listen;
      byId('rdx-rhdet').innerHTML = '';
      byId('rdx-staff').querySelectorAll('.ss-n').forEach((g) => { g.removeAttribute('data-s'); g.removeAttribute('data-d'); const tt = g.querySelector('title.rdx-tt'); if (tt)
          tt.remove(); });
      const act0 = context.currentTime + 0.2, beat0 = act0 + 4 * bs;
      R.t0 = performance.now() + 200 + 4 * bs * 1000;
      for (let b = 0; b < 4; b++)
          deps.rdClick(act0 + b * bs, b === 0);
      for (let b = 0; b < 8; b++)
          deps.rdClick(beat0 + b * bs, b % 4 === 0);
      if (listen) {
          const k = R.dur ? .92 : .8;
          R.ev.forEach((e: RdRhythmEvent) => { if (!e.rest)
              host.audio.previewNote(72, beat0 + e.beat * bs, Math.max(.12, e.dur * bs * k), 90); });
          if (R.lh)
              R.lh.forEach((e: RdRhythmEvent) => { if (!e.rest)
                  host.audio.previewNote(48, beat0 + e.beat * bs, Math.max(.12, e.dur * bs * k), 80); });
      }
      const f = byId('rdx-fb');
      f.className = 'rdx-fb';
      f.textContent = deps.t('rdx_rh_count');
      const svg = byId('rdx-staff').querySelector('svg');
      if (!svg) return;
      let c = svg.querySelector('.ss-playhead');
      if (!c) {
          c = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          c.setAttribute('class', 'ss-playhead');
          c.setAttribute('y1', String(R.r.yTop));
          c.setAttribute('y2', String(R.r.yBot));
          svg.appendChild(c);
      }
      const loop = () => {
          if (!R.playing)
              return;
          const b = (performance.now() - R.t0) / 1000 / bs;
          if (b >= 0 && f.textContent === deps.t('rdx_rh_count'))
              f.textContent = listen ? deps.t('rdx_rh_listening') : deps.t('rdx_rh_tapnow');
          const x = deps.rdBeatX(R.r, Math.max(0, Math.min(8, b)));
          c.setAttribute('x1', String(x));
          c.setAttribute('x2', String(x));
          if (b > 8.6) {
              R.playing = false;
              c.remove();
              rdRhOptsLock(false);
              if (listen) {
                  f.textContent = deps.t('rdx_rh_yourturn');
              }
              else
                  rdRhDone(b);
              return;
          }
          R.raf = requestAnimationFrame(loop);
      };
      R.raf = requestAnimationFrame(loop);
  }
    // Every press is kept with its release: src names the key (MIDI note, computer key, pointer on a pad), hand is 'L' or 'R'.
  function rdRhPress(src: string, hand: string) {
      const R = deps.RD.rh, L = deps.RD.L;
      if (!R || !L || !R.playing || R.listen || !Number.isFinite(R.t0))
          return;
      if (R.open.has(src))
          rdRhRelease(src);
      const b = (inputTime() - R.t0) / 1000 / (60 / deps.rdLevelBpm(L)); // the key's own time, less its calibrated latency
      const p: RdRhythmPress = { src, hand: R.two && hand === 'L' ? 'L' : 'R', on: b, off: null };
      R.presses.push(p);
      R.open.set(src, p);
      R.taps.push(b);
      const el = queryHtml(document, '#rdx-body .rdx-tap[data-hand="' + p.hand + '"]');
      if (el) {
          el.classList.remove('hit');
          void el.offsetWidth;
          el.classList.add('hit');
      }
  }
    function rdRhRelease(src: string) { const R = deps.RD.rh; if (!R)
      return; const p = R.open.get(src); if (!p)
      return; R.open.delete(src); const L = deps.RD.L; if (R.playing && L)
      p.off = Math.max(p.on, (inputTime() - R.t0) / 1000 / (60 / deps.rdLevelBpm(L))); }
    function rdRhKey(kind: string, m: number) { if (kind === 'on')
      rdRhPress('m' + m, m < 60 ? 'L' : 'R');
  else
      rdRhRelease('m' + m); }
     // a click without press/release (assistive tech)
  /* Lengths: each written note is paired with one stroke of its hand (keys struck within 70 ms are one stroke, e.g. a held chord, and it
     ends when its last key lifts). The release is compared with the written end of the note; the windows scale with the note's length
     and are clamped to practical limits, so at any tempo a held half note and a quarter followed by a rest are told apart, while normal
     articulation stays "good". Keys still down when the exercise ends count as released at that moment. */
  function rdRhStrokes(ps: readonly RdRhythmPress[], end: number, gap: number) {
      const out: { on: number; off: number; }[] = [];
      ps.slice().sort((a: RdRhythmPress, b: RdRhythmPress) => a.on - b.on).forEach((p: RdRhythmPress) => {
          const off = p.off == null ? end : p.off, l = out[out.length - 1];
          if (l && p.on - l.on <= gap)
              l.off = Math.max(l.off, off);
          else
              out.push({ on: p.on, off });
      });
      return out;
  }
    function rdRhGradeHand(ev: readonly RdRhythmEvent[], ps: readonly RdRhythmPress[], bs: number, dur: boolean, end: number): RdRhythmHandGrade {
      const tg = ev.filter((e: RdRhythmEvent) => !e.rest), st = rdRhStrokes(ps.filter((p: RdRhythmPress) => p.on > -0.5), end, 0.07 / bs), used = new Set<number>(), res: RdRhythmNoteResult[] = [];
      let minI = 4;
      for (let i = 1; i < tg.length; i++)
          minI = Math.min(minI, tg[i].beat - tg[i - 1].beat);
      const win = Math.min(0.25, 0.5 * minI * bs), cl = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
      tg.forEach((e: RdRhythmEvent) => {
          let bi = -1, bd = Infinity;
          st.forEach((s, j) => { if (used.has(j))
              return; const d = (s.on - e.beat) * bs; if (Math.abs(d) <= win && Math.abs(d) < Math.abs(bd)) {
              bd = d;
              bi = j;
          } });
          const r: RdRhythmNoteResult = { e, s: 'bad', off: null, rs: null, roff: null };
          if (bi >= 0) {
              used.add(bi);
              const a = Math.abs(bd) * 1000;
              r.s = a <= 100 ? 'good' : a <= 180 ? 'near' : 'bad';
              r.off = bd * 1000;
              if (dur) {
                  const sec = e.dur * bs, d = (st[bi].off - (e.beat + e.dur)) * bs, eG = cl(.25 * sec, .1, .4), eN = cl(.45 * sec, .18, .8), lG = cl(.15 * sec, .1, .25), lN = cl(.3 * sec, .18, .45);
                  r.roff = Math.round(d * 1000);
                  r.rs = d < -eN ? 'early' : d > lN ? 'late' : (d < -eG || d > lG) ? 'near' : 'good';
              }
          }
          res.push(r);
      });
      const N = tg.length, good = res.filter((r) => r.s === 'good').length, near = res.filter((r) => r.s === 'near').length, extra = st.length - used.size;
      const att = good + 0.5 * near, len = res.reduce((a, r) => a + (r.rs === 'good' ? 1 : r.rs === 'near' ? .5 : 0), 0), score = dur ? (att + len) / 2 : att;
      const offs = res.filter((r): r is RdRhythmNoteResult & { off: number; } => r.off != null).map((r) => r.off);
      return { res, N, good, near, extra, score, dur, lenOk: res.filter((r) => r.rs === 'good' || r.rs === 'near').length, early: res.filter((r) => r.rs === 'early').length, late: res.filter((r) => r.rs === 'late').length,
          mean: offs.length ? Math.round(offs.reduce((a, b) => a + b, 0) / offs.length) : 0, pct: Math.max(0, Math.round(100 * score / Math.max(1, N) - extra * 5)) };
  }
    function rdRhGradeAll(R: RdRhythmState, bs: number, end: number): RdRhythmAllGrade {
      const hands: ('R' | 'L')[] = R.two ? ['R', 'L'] : ['R'], by: { R?: RdRhythmHandGrade; L?: RdRhythmHandGrade; } = {};
      hands.forEach((h) => { by[h] = rdRhGradeHand(h === 'R' ? R.ev : R.lh || [], R.presses.filter((p: RdRhythmPress) => p.hand === h), bs, R.dur, end); });
      const all = hands.map((h) => by[h]).filter((g): g is RdRhythmHandGrade => !!g), sum = (k: RdRhythmCountKey) => all.reduce((a, g) => a + g[k], 0), N = sum('N'), offs = all.flatMap((g) => g.res.filter((r): r is RdRhythmNoteResult & { off: number; } => r.off != null).map((r) => r.off));
      return { by, N, good: sum('good'), near: sum('near'), extra: sum('extra'), lenOk: sum('lenOk'), early: sum('early'), late: sum('late'), res: all.flatMap((g) => g.res),
          mean: offs.length ? Math.round(offs.reduce((a, b) => a + b, 0) / offs.length) : 0, pct: Math.max(0, Math.round(100 * sum('score') / Math.max(1, N) - sum('extra') * 5)) };
  }
    function rdRhNoteTip(r: RdRhythmNoteResult) {
      if (r.off == null)
          return deps.t('rdx_rh_n_miss');
      const p: string[] = [], roff = r.roff ?? 0; // roff is set whenever rs is
      if (r.rs === 'early')
          p.push(deps.t('rdx_rh_n_early', -roff));
      else if (r.rs === 'late')
          p.push(deps.t('rdx_rh_n_late', roff));
      else if (r.rs === 'near')
          p.push(deps.t(roff < 0 ? 'rdx_rh_n_short' : 'rdx_rh_n_long'));
      if (Math.abs(r.off) > 100)
          p.push(Math.round(r.off) + ' ms');
      return p.join(' · ');
  }
    function rdRhHandLine(name: string, g: RdRhythmHandGrade | undefined) {
      if (!g)
          return '';
      const p = [deps.t('rdx_rh_att', (g.good + g.near) + '/' + g.N)];
      if (g.dur) {
          p.push(deps.t('rdx_rh_len', g.lenOk + '/' + g.N));
          if (g.early)
              p.push(deps.t('rdx_rh_early', g.early));
          if (g.late)
              p.push(deps.t('rdx_rh_late', g.late));
      }
      if (g.extra)
          p.push(deps.t('rdx_rh_extra', g.extra));
      return (name ? deps.t('rdx_rh_hand', name, g.pct) + ' — ' : '') + p.join(' · ');
  }
    function rdRhDone(endBeat: number) {
      const R = deps.RD.rh, L = deps.RD.L;
      if (!R || !L)
          return;
      const bs = 60 / deps.rdLevelBpm(L), plain = !R.dur && !R.two;
      let g: RdRhythmGrade, msg: string;
      const det = maybeById('rdx-rhdet');
      if (plain) {
          g = rdRhGrade(R.on, R.taps.filter((x: number) => x > -0.5), bs); // the original tap-only grading
          const gs = byId('rdx-staff').querySelectorAll('.ss-n');
          g.res.forEach((r, i) => { const n = gs[i]; if (n instanceof SVGElement)
              n.dataset.s = r.s; });
      }
      else {
          const ga = rdRhGradeAll(R, bs, endBeat || 8.6);
          g = ga;
          Object.entries(ga.by).forEach(([h, hg]) => hg?.res.forEach((r: RdRhythmNoteResult) => {
              const n = R.r.notes.find((x: RdRhythmRender['notes'][number]) => x.hand === (h === 'L' ? 'lh' : 'rh') && Math.abs(x.beat - r.e.beat) < 1e-3), el = n && byId('rdx-staff').querySelector('.ss-n[data-nid="' + n.nid + '"]');
              if (!(el instanceof SVGElement))
                  return;
              el.dataset.s = r.s;
              if (r.rs && r.rs !== 'good')
                  el.dataset.d = r.rs;
              const tip = rdRhNoteTip(r);
              if (tip) {
                  const tt = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                  tt.setAttribute('class', 'rdx-tt');
                  tt.textContent = tip;
                  el.appendChild(tt);
              }
          }));
      }
      R.graded = g;
      deps.RD.rhP.push(g.pct);
      const matched = g.res.some(r => r.off != null);
      if (matched) deps.RD.rhM.push(g.mean);
      deps.RD.n++;
      deps.RD.ok += g.pct;
      deps.markReadDoneToday(true);
      const timing = !matched ? '' : ' · ' + (Math.abs(g.mean) < 25 ? deps.t('rdx_rh_ontime') : g.mean < 0 ? deps.t('rdx_rh_rush', -g.mean) : deps.t('rdx_rh_drag', g.mean));
      if (plain)
          msg = deps.t('rdx_rh_res', g.pct, (g.good + g.near) + '/' + R.on.length) + timing + (g.extra ? ' · ' + deps.t('rdx_rh_extra', g.extra) : '');
      else if (!R.two)
          msg = deps.t('rdx_rh_score', g.pct) + ' · ' + rdRhHandLine('', 'by' in g ? g.by.R : undefined) + timing;
      else
          msg = deps.t('rdx_rh_score', g.pct) + timing;
      if (det)
          det.innerHTML = R.two ? (['R', 'L'] as const).map((h) => `<div>${deps.rdEsc(rdRhHandLine(deps.t(h === 'R' ? 'rdx_rh_hand_r' : 'rdx_rh_hand_l'), 'by' in g ? g.by[h] : undefined))}</div>`).join('') : '';
      const f = byId('rdx-fb');
      f.className = 'rdx-fb ' + (g.pct >= 75 ? 'good' : g.pct >= 50 ? '' : 'bad');
      f.textContent = msg;
      byId('rdx-live').textContent = [msg].concat(det ? [...det.children].map((x) => x.textContent ?? '') : []).join('. ');
      deps.rdStat('rh:' + L.id, g.pct >= 75, 0);
      if (deps.RD.mode === 'test') {
          if (deps.RD.rhP.length >= 4) {
              deps.RD.timers.push(setTimeout(() => { if (deps.RD.on)
                  deps.rdFinish(); }, 1600));
          }
          else
              byId('rdx-rhnext').innerHTML = `<button class="btn primary" data-act="rhnew">${deps.t('rdx_next_ex')} →</button>`;
      }
      else if (deps.rdnWarmLimit())
          deps.RD.timers.push(setTimeout(() => { if (deps.RD.on)
              deps.rdFinish(); }, 1600));
      else
          byId('rdx-rhnext').innerHTML = `<button class="btn ghost" data-act="rhagain">↺ ${deps.t('rdx_again_same')}</button><button class="btn primary" data-act="rhnew">🎲 ${deps.t('rdx_new_rh')}</button>`;
      deps.rdHud();
  }

  return {
    rdRhGen,
    rdRhGrade,
    rdRhPrefs,
    rdRhGenLH,
    rdRhMarks,
    rdRhNew,
    rdRhFit,
    rdRhOptsLock,
    get rdRhRunId() { return rdRhRunId; },
    set rdRhRunId(value: typeof rdRhRunId) { rdRhRunId = value; },
    rdRhInterrupt,
    rdRhRun,
    rdRhPress,
    rdRhRelease,
    rdRhKey,
    rdRhStrokes,
    rdRhGradeHand,
    rdRhGradeAll,
    rdRhNoteTip,
    rdRhHandLine,
    rdRhDone,
  };
}

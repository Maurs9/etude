import * as theory from '../../domain/theory.js';
import { byId, inputById, selectById } from '../../domain/dom.js';
import { inputTime } from '../../domain/midi-timing.js';
import type { SrLayout } from '../../domain/score-types.js';
import {
  SS_LEVELS, ssGen, ssRender,
  type SightSingExercise, type SightSingLabelMode, type SightSingNote, type SightSingRender,
} from '../../domain/sightsing-render.js';
import { detectVoicePitch as trxAutoCorrelate } from '../../domain/voice-pitch.js';
import type { AppHost } from '../../domain/views.js';
import { livePitch, measureStaffPaper, micClose, micOpen, staffPaperChanged } from './voice-mic.js';

const pc = theory.pitchClass;

export interface SightSingState {
  ex: SightSingExercise | null;
  render: SightSingRender | null;
  level: number;
  clef: string;
  range: 'soprano' | 'tenor' | 'bass';
  labelMode: SightSingLabelMode;
  mode: string;
  idx: number;
  active: boolean;
  results: string[];
  bpm: number;
  runId: number;
  micRequest: number;
  analyser: AnalyserNode | null;
  stream: MediaStream | null;
  src: MediaStreamAudioSourceNode | null;
  buf: Float32Array<ArrayBuffer> | null;
  raf: number;
  ring: number[];
  stable: number;
  hint: number;
  samples: { t: number; pc: number; cents: number }[];
  keyEvents: { t: number; midi: number }[];
  hlTimers: number[];
  playRaf: number;
  playStart: number;
  loopA: number | null;
  loopB: number | null;
  flat: SightSingNote[] | null;
  holdT: number;
  wrongT: number;
  muteUntil: number;
  lastPitchTs: number;
  countInMs: number;
  phraseStartPN: number;
  phraseSingPN: number;
  freePN: number;
  trail: [number, number][];
}

interface SsSvgCacheEntry {
  notes: Map<number, SVGElement>;
  playhead: SVGLineElement | null;
  trail: SVGPolylineElement | null;
}

export function ssNeed(targetPc: number, sungPc: number): number {
  let d = ((targetPc - sungPc) % 12 + 12) % 12;
  if (d > 6) d -= 12;
  return d; // + → sing higher
}

export interface SightSingController {
  readonly state: SightSingState;
  fillLevels(): void;
  draw(): void;
  fit(): void;
  paint(): void;
  newExercise(): void;
  render(): void;
  stopAll(): void;
  modeUI(): void;
  micStart(): Promise<boolean>;
  micMaybe(): Promise<boolean>;
  micStop(): void;
  readPitch(): { f: number; midi: number; cents: number } | null;
  curNote(): SightSingNote | null;
  svg(): SVGSVGElement | null;
  cursorEl(): SVGLineElement | null;
  moveCursor(x: number): void;
  removeCursor(): void;
  scrollToX(x: number): void;
  scrollToCur(): void;
  pitchY(f: number): number;
  drawTrail(): void;
  clearTrail(): void;
  beatToX(beat: number): number;
  tonicShift(): number;
  tonic(): void;
  flash(i: number): void;
  playIt(): void;
  drone(): void;
  noteStart(): void;
  noteLoop(ts: number): void;
  noteCorrect(): void;
  hintBump(am: number, cents?: number): void;
  noteFinish(): void;
  phraseStart(): void;
  phraseLoop(ts: number): void;
  phraseGrade(): void;
  freeStart(): void;
  freeLoop(ts: number): void;
  keyInput(m: number): void;
  go(): void;
  bumpProgress(good: number, tot: number): void;
}

export function createSightSingController(
  host: AppHost,
  isSingActive: () => boolean,
): SightSingController {
  // flat…trail are filled in by the modes before they are read; phraseSingPN starts as NaN so key presses before the count-in never match a note.
  const sing: SightSingState = {
    ex: null, render: null, level: 0, clef: 'treble', range: 'soprano', labelMode: 'solfege',
    mode: 'note', idx: 0, active: false, results: [], bpm: 80,
    runId: 0, micRequest: 0, analyser: null, stream: null, src: null, buf: null,
    raf: 0, ring: [], stable: 0, hint: 0, samples: [], keyEvents: [],
    hlTimers: [], playRaf: 0, playStart: 0, loopA: null, loopB: null,
    flat: null, holdT: 0, wrongT: 0, muteUntil: 0, lastPitchTs: 0,
    countInMs: 0, phraseStartPN: 0, phraseSingPN: NaN, freePN: 0, trail: [],
  };

  let ssPaperSeen: SrLayout | undefined;
  let ssStaffMetrics: { render: SightSingRender | null; clientWidth: number; scrollWidth: number; scrollLeft: number } = {
    render: null, clientWidth: 0, scrollWidth: 0, scrollLeft: -1,
  };
  const ssSvgCache = new WeakMap<SVGSVGElement, SsSvgCacheEntry>();
  const ssBeatPtsCache = new WeakMap<SightSingRender, { b: number; x: number }[]>();

  function requireSingExercise(): SightSingExercise {
    if (!sing.ex) throw new Error('Étude: no sight-singing exercise');
    return sing.ex;
  }

  function requireSingFlat(): SightSingNote[] {
    if (!sing.flat) throw new Error('Étude: sight-singing exercise is not drawn');
    return sing.flat;
  }

  function ssSvg(): SVGSVGElement | null {
    return byId('si-staff').querySelector('svg');
  }

  function ssSvgEntry(svg: SVGSVGElement): SsSvgCacheEntry {
    let entry = ssSvgCache.get(svg);
    if (!entry) {
      const notes = new Map<number, SVGElement>();
      svg.querySelectorAll('.ss-n').forEach((g) => {
        if (g instanceof SVGElement && g.dataset.i != null) notes.set(Number(g.dataset.i), g);
      });
      const ph = svg.querySelector('.ss-playhead');
      const pl = svg.querySelector('.ss-trail');
      entry = {
        notes,
        playhead: ph instanceof SVGLineElement ? ph : null,
        trail: pl instanceof SVGPolylineElement ? pl : null,
      };
      ssSvgCache.set(svg, entry);
    }
    return entry;
  }

  function ssFillLevels(): void {
    const sel = selectById('si-level');
    const selected = sel.value;
    sel.replaceChildren(...SS_LEVELS.map((level, i) => new Option((i + 1) + ' · ' + host.i18n.t(level.label), String(i))));
    sel.value = selected || String(sing.level);
  }

  function ssPaint(): void {
    const svg = ssSvg();
    if (!svg) return;
    const { notes } = ssSvgEntry(svg);
    notes.forEach((g, i) => {
      const res = sing.results[i];
      if (sing.mode === 'note' && sing.active && i === sing.idx) g.dataset.s = 'now';
      else if (res) g.dataset.s = res;
      else g.removeAttribute('data-s');
    });
  }

  function ssDraw(): void {
    if (!sing.ex) return;
    ssPaperSeen = measureStaffPaper(byId('si-staff'));
    const r = ssRender(sing.ex, ssPaperSeen?.width ?? 0, sing.labelMode, (n) => host.i18n.spell(n.li, n.acc));
    sing.render = r;
    sing.flat = r.noteX.map((o) => o.note);
    const wrap = byId('si-staff');
    wrap.innerHTML = r.svg;
    wrap.classList.toggle('nosolf', !inputById('si-solf').checked);
    ssStaffMetrics = { render: null, clientWidth: 0, scrollWidth: 0, scrollLeft: -1 };
    ssPaint();
  }

  // Draws the staff again when its paper changed width; the cursor and the pitch trail come back on their next frame.
  function ssFit(): void {
    ssStaffMetrics.clientWidth = 0;
    if (sing.render && staffPaperChanged(ssPaperSeen, measureStaffPaper(byId('si-staff')))) ssDraw();
  }

  function ssNewExercise(): void {
    sing.ex = ssGen(sing.level, sing.clef, 0, host.i18n.lang());
    sing.idx = 0;
    sing.results = [];
    sing.active = false;
    sing.bpm = sing.ex.bpm;
    const bp = inputById('si-bpm');
    if (bp) {
      bp.value = String(sing.ex.bpm);
      byId('si-bpmLbl').textContent = String(sing.ex.bpm);
    }
    ssDraw();
  }

  function ssModeUI(): void {
    const m = sing.mode;
    const tw = byId('si-tempo-wrap');
    if (tw) tw.style.display = m === 'note' ? 'none' : 'flex';
    const go = byId('si-go');
    if (go) go.textContent = host.i18n.t(m === 'free' ? 'si_play' : 'si_listen');
  }

  function renderSing(): void {
    ssFillLevels();
    if (!sing.ex || sing.ex.clef !== sing.clef || sing.ex.level !== sing.level) ssNewExercise();
    else ssDraw();
    ssModeUI();
  }

  function ssMicStop(): void {
    sing.runId++;
    sing.micRequest++;
    micClose(sing.src, sing.stream);
    sing.src = null;
    sing.stream = null;
    sing.analyser = null;
  }

  function ssRemoveCursor(): void {
    const svg = ssSvg();
    if (!svg) return;
    const entry = ssSvgEntry(svg);
    const c = entry.playhead || svg.querySelector('.ss-playhead');
    if (c) c.remove();
    entry.playhead = null;
  }

  function ssClearTrail(): void {
    const svg = ssSvg();
    if (!svg) return;
    const entry = ssSvgEntry(svg);
    const pl = entry.trail || svg.querySelector('.ss-trail');
    if (pl) pl.remove();
    entry.trail = null;
  }

  function singStopAll(): void {
    sing.active = false;
    if (sing.raf) cancelAnimationFrame(sing.raf);
    sing.raf = 0;
    ssMicStop();
    ssRemoveCursor();
    ssClearTrail();
    sing.hlTimers.forEach(clearTimeout);
    sing.hlTimers = [];
    host.audio.stopPhraseClicks();
    host.previews.stopAll();
    host.metro.stop();
    host.metro.stopDrone();
    ssPaint();
    const g = byId('si-go');
    if (g) g.textContent = host.i18n.t(sing.mode === 'free' ? 'si_play' : 'si_listen');
    const lv = byId('si-live');
    if (lv) {
      delete lv.dataset.lastPitch;
      lv.textContent = '—';
      lv.classList.remove('rec');
    }
  }

  function ssMicStart(): Promise<boolean> {
    const request = ++sing.micRequest;
    return micOpen(host, () => request === sing.micRequest && sing.active && isSingActive()).then((tap) => {
      if (typeof tap === 'string') return false;
      sing.stream = tap.stream;
      sing.src = tap.src;
      sing.analyser = tap.analyser;
      sing.buf = tap.buf;
      for (const track of tap.stream.getAudioTracks()) {
        track.addEventListener('ended', () => {
          if (sing.stream !== tap.stream) return;
          if (sing.mode === 'free') singStopAll();
          else ssMicStop();
          byId('si-hint').textContent = host.i18n.t('si_nomic');
        }, { once: true });
      }
      return true;
    });
  }

  function ssMicMaybe(): Promise<boolean> {
    return sing.analyser ? Promise.resolve(true) : ssMicStart();
  }

  function ssReadPitch(): { f: number; midi: number; cents: number } | null {
    const ctx = host.audio.context();
    if (!sing.analyser || !sing.buf || !ctx) return null;
    sing.analyser.getFloatTimeDomainData(sing.buf);
    const f = trxAutoCorrelate(sing.buf, ctx.sampleRate);
    if (f < 0) return null;
    const midi = Math.round(69 + 12 * Math.log2(f / 440));
    const cents = Math.round(1200 * Math.log2(f / (440 * Math.pow(2, (midi - 69) / 12))));
    return { f, midi, cents };
  }

  function ssCurNote(): SightSingNote | null {
    return sing.flat ? sing.flat[sing.idx] : null;
  }

  function ssCursorEl(): SVGLineElement | null {
    const svg = ssSvg();
    if (!svg) return null;
    const entry = ssSvgEntry(svg);
    if (!entry.playhead || entry.playhead.parentNode !== svg) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      c.setAttribute('class', 'ss-playhead');
      c.setAttribute('y1', '38');
      c.setAttribute('y2', '102');
      svg.appendChild(c);
      entry.playhead = c;
    }
    return entry.playhead;
  }

  function ssScrollToX(x: number): void {
    const w = byId('si-staff');
    if (ssStaffMetrics.render !== sing.render || !ssStaffMetrics.clientWidth) {
      ssStaffMetrics.render = sing.render;
      ssStaffMetrics.clientWidth = w.clientWidth;
      ssStaffMetrics.scrollWidth = w.scrollWidth;
    }
    if (ssStaffMetrics.scrollWidth > ssStaffMetrics.clientWidth + 4) {
      const next = Math.max(0, x * (sing.render?.scale ?? 1) - ssStaffMetrics.clientWidth * 0.4);
      if (Math.abs(next - ssStaffMetrics.scrollLeft) >= 1) {
        ssStaffMetrics.scrollLeft = next;
        w.scrollLeft = next;
      }
    }
  }

  function ssMoveCursor(x: number): void {
    const c = ssCursorEl();
    if (c) {
      c.setAttribute('x1', String(x));
      c.setAttribute('x2', String(x));
    }
    ssScrollToX(x);
  }

  function ssScrollToCur(): void {
    const o = sing.render && sing.render.noteX[sing.idx];
    if (o) ssScrollToX(o.x);
  }

  function ssPitchY(f: number): number {
    const bottomMidi = requireSingExercise().clef === 'bass' ? 43 : 64;
    const midi = 69 + 12 * Math.log2(f / 440);
    let y = 94 - (midi - bottomMidi) * 3.5;
    while (y > 142) y -= 42;
    while (y < 4) y += 42;
    return y;
  }

  function ssDrawTrail(): void {
    const svg = ssSvg();
    if (!svg) return;
    const entry = ssSvgEntry(svg);
    if (!entry.trail || entry.trail.parentNode !== svg) {
      const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pl.setAttribute('class', 'ss-trail');
      svg.appendChild(pl);
      entry.trail = pl;
    }
    entry.trail.setAttribute('points', sing.trail.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '));
  }

  function ssBeatToX(beat: number): number {
    const render = sing.render;
    if (!render) return 10;
    const ns = render.noteX;
    if (!ns || !ns.length) return 10;
    let pts = ssBeatPtsCache.get(render);
    if (!pts) {
      pts = ns.map((o) => ({ b: o.note.tBeat, x: o.x }));
      pts.push({ b: requireSingExercise().totalBeats, x: render.W - 12 });
      ssBeatPtsCache.set(render, pts);
    }
    if (beat <= pts[0].b) return pts[0].x;
    if (beat >= pts[pts.length - 1].b) return pts[pts.length - 1].x;
    let lo = 0;
    let hi = pts.length - 2;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (beat < pts[mid].b) hi = mid - 1;
      else if (beat > pts[mid + 1].b) lo = mid + 1;
      else {
        const f = (beat - pts[mid].b) / Math.max(1e-3, pts[mid + 1].b - pts[mid].b);
        return pts[mid].x + f * (pts[mid + 1].x - pts[mid].x);
      }
    }
    return pts[pts.length - 1].x;
  }

  function ssTonicShift(): number {
    return sing.range === 'tenor' ? -12 : 0;
  }

  function ssTonic(): void {
    if (!sing.ex) return;
    const ctx = host.audio.ensure();
    if (ctx) host.audio.previewNote(sing.ex.tonicMidi + ssTonicShift(), ctx.currentTime + 0.02, 0.85, 92);
  }

  function ssFlash(i: number): void {
    if (host.reduceMotion()) return;
    const svg = ssSvg();
    if (!svg) return;
    const g = ssSvgEntry(svg).notes.get(i);
    if (!g) return;
    const prev = g.getAttribute('data-s');
    g.dataset.s = 'now';
    sing.hlTimers.push(window.setTimeout(() => {
      if (g.dataset.s === 'now') {
        if (prev && prev !== 'now') g.dataset.s = prev;
        else g.removeAttribute('data-s');
      }
    }, 240));
  }

  function ssPlayIt(): void {
    if (!sing.ex || !sing.flat) return;
    const ctx = host.audio.ensure();
    host.previews.stopAll();
    sing.hlTimers.forEach(clearTimeout);
    sing.hlTimers = [];
    const beatSec = 60 / (sing.bpm || sing.ex.bpm);
    const now = ctx ? ctx.currentTime : 0;
    const t0 = now + 0.12;
    const shift = ssTonicShift();
    sing.flat.forEach((n, i) => {
      const when = t0 + n.tBeat * beatSec;
      const dur = Math.max(0.18, n.dur * beatSec * 0.92);
      if (ctx) host.audio.previewNote(n.midi + shift, when, dur, 92);
      sing.hlTimers.push(window.setTimeout(() => ssFlash(i), Math.max(0, (when - now) * 1000)));
    });
  }

  function ssDrone(): void {
    if (inputById('si-drone').checked) {
      if (sing.ex) {
        host.audio.ensure();
        host.metro.startDrone(pc(sing.ex.tonicMidi));
      }
    } else {
      host.metro.stopDrone();
    }
  }

  function ssBumpProgress(good: number, tot: number): void {
    if (sing.mode !== 'free' && good === tot && tot > 0) {
      const d = host.store.data();
      d.singCleared = d.singCleared || {};
      d.singCleared[sing.level] = true;
      host.store.saveNow();
    }
  }

  function ssNoteFinish(): void {
    sing.active = false;
    if (sing.raf) cancelAnimationFrame(sing.raf);
    sing.raf = 0;
    ssMicStop();
    ssPaint();
    const tot = requireSingFlat().length;
    const v = byId('si-verdict');
    v.className = 'verdict good';
    v.textContent = host.i18n.t('si_perfect');
    byId('si-go').textContent = host.i18n.t('si_listen');
    byId('si-live').textContent = '—';
    byId('si-hint').textContent = '';
    ssBumpProgress(tot, tot);
  }

  function ssNoteCorrect(): void {
    if (!sing.active) return;
    sing.results[sing.idx] = 'good';
    sing.holdT = 0;
    sing.wrongT = 0;
    sing.hint = 0;
    byId('si-hint').textContent = '';
    sing.idx++;
    ssPaint();
    ssScrollToCur();
    if (sing.idx >= requireSingFlat().length) ssNoteFinish();
  }

  function ssHintBump(am: number, cents = 0): void {
    const cur = ssCurNote();
    if (!cur) return;
    sing.hint++;
    const need = ssNeed(pc(cur.midi), pc(am)) || -cents;
    const syl = requireSingExercise().syl[((cur.p % 7) + 7) % 7];
    if (sing.hint === 1) {
      byId('si-hint').textContent = need > 0 ? host.i18n.t('si_hi_up') : host.i18n.t('si_hi_down');
    } else {
      byId('si-hint').textContent = host.i18n.t('si_hi_syl', syl);
      const ctx = host.audio.ensure();
      if (ctx) {
        host.audio.previewNote(cur.midi, ctx.currentTime + 0.02, 0.6, 80);
        sing.muteUntil = performance.now() + 780;
        sing.holdT = 0;
        sing.wrongT = 0;
      }
    }
  }

  function ssNoteLoop(ts: number): void {
    if (!sing.active || sing.mode !== 'note') return;
    if (ts < sing.muteUntil) {
      sing.holdT = 0;
      sing.wrongT = 0;
      sing.raf = requestAnimationFrame(ssNoteLoop);
      return;
    }
    if (ts - sing.lastPitchTs >= 33) {
      sing.lastPitchTs = ts;
      const cur = ssCurNote();
      const tgt = cur ? pc(cur.midi) : -1;
      const p = ssReadPitch();
      const lv = byId('si-live');
      if (p) {
        livePitch(host, lv, p.midi, p.cents);
        if (pc(p.midi) === tgt && Math.abs(p.cents) < 42) {
          if (!sing.holdT) sing.holdT = ts;
          else if (ts - sing.holdT >= 320) ssNoteCorrect();
          sing.wrongT = 0;
        } else {
          sing.holdT = 0;
          if (!sing.wrongT) sing.wrongT = ts;
          else if (ts - sing.wrongT > 700) {
            sing.wrongT = 0;
            ssHintBump(p.midi, p.cents);
          }
        }
      } else {
        lv.classList.remove('rec');
        lv.textContent = '—';
        sing.holdT = 0;
        sing.wrongT = 0;
      }
    }
    if (sing.active) sing.raf = requestAnimationFrame(ssNoteLoop);
  }

  function ssNoteStart(): void {
    sing.active = true;
    sing.idx = 0;
    sing.results = [];
    sing.hint = 0;
    sing.holdT = 0;
    sing.wrongT = 0;
    ssPaint();
    ssScrollToCur();
    byId('si-verdict').className = 'verdict neutral';
    byId('si-verdict').textContent = host.i18n.t('si_singit');
    const ctx = host.audio.ensure();
    if (ctx) {
      host.audio.previewNote(requireSingExercise().tonicMidi + ssTonicShift(), ctx.currentTime + 0.02, 0.6, 85);
      sing.muteUntil = performance.now() + 780;
    } else {
      sing.muteUntil = 0;
    }
    const run = sing.runId;
    void ssMicMaybe().then((ok) => {
      if (run === sing.runId && sing.active && sing.mode === 'note') {
        if (!ok) byId('si-hint').textContent = host.i18n.t('si_nomic');
        sing.raf = requestAnimationFrame(ssNoteLoop);
      }
    });
  }

  function ssPhraseGrade(): void {
    sing.active = false;
    if (sing.raf) cancelAnimationFrame(sing.raf);
    sing.raf = 0;
    ssMicStop();
    ssRemoveCursor();
    const beatSec = 60 / sing.bpm;
    requireSingFlat().forEach((n, i) => {
      const s = n.tBeat * beatSec;
      const e = (n.tBeat + n.dur) * beatSec;
      const tpc = pc(n.midi);
      const win = sing.samples.filter((x) => x.t >= s - 0.05 && x.t <= e);
      const onp = win.filter((x) => x.pc === tpc);
      const frac = win.length ? onp.length / win.length : 0;
      let verdict = frac > 0.55 ? 'good' : frac > 0.18 ? 'near' : 'bad';
      if (sing.keyEvents.some((k) => pc(k.midi) === tpc && k.t >= s - 0.18 && k.t <= e + 0.05) && verdict !== 'good') {
        verdict = 'good';
      }
      sing.results[i] = verdict;
    });
    ssPaint();
    const good = sing.results.filter((r) => r === 'good').length;
    const tot = requireSingFlat().length;
    const v = byId('si-verdict');
    v.className = 'verdict ' + (good === tot ? 'good' : 'neutral');
    v.textContent = good === tot ? host.i18n.t('si_perfect') : host.i18n.t('si_nicetry', good, tot);
    byId('si-live').textContent = '—';
    byId('si-go').textContent = host.i18n.t('si_listen');
    ssBumpProgress(good, tot);
  }

  function ssPhraseLoop(ts: number): void {
    if (!sing.active || sing.mode !== 'phrase') return;
    const beatSec = 60 / sing.bpm;
    const dur = requireSingExercise().totalBeats * beatSec;
    if (ts < sing.phraseSingPN) {
      byId('si-verdict').textContent = host.i18n.t('si_count');
      ssMoveCursor(ssBeatToX(0));
      sing.raf = requestAnimationFrame(ssPhraseLoop);
      return;
    }
    const tt = (ts - sing.phraseSingPN) / 1000;
    if (tt <= dur) {
      byId('si-verdict').textContent = host.i18n.t('si_sing_now');
      if (ts - sing.lastPitchTs >= 33) {
        sing.lastPitchTs = ts;
        const p = ssReadPitch();
        if (p) sing.samples.push({ t: tt, pc: pc(p.midi), cents: p.cents });
        const lv = byId('si-live');
        if (p) livePitch(host, lv, p.midi);
        else {
          lv.classList.remove('rec');
          lv.textContent = '—';
        }
      }
      ssMoveCursor(ssBeatToX(tt / beatSec));
      sing.raf = requestAnimationFrame(ssPhraseLoop);
    } else {
      ssPhraseGrade();
    }
  }

  function ssPhraseStart(): void {
    sing.active = true;
    sing.results = [];
    sing.samples = [];
    sing.keyEvents = [];
    sing.phraseSingPN = NaN;
    ssPaint();
    byId('si-hint').textContent = '';
    const context = host.audio.ensure();
    const run = sing.runId;
    void ssMicMaybe().then(async (ok) => {
      if (run !== sing.runId || !sing.active || sing.mode !== 'phrase') return;
      const audible = context && (context.state === 'running' || await host.audio.timedReady(context));
      if (run !== sing.runId || !sing.active || sing.mode !== 'phrase') return;
      if (!ok) byId('si-hint').textContent = host.i18n.t('si_nomic');
      const [beats, unit] = requireSingExercise().ts;
      const compound = unit === 8 && beats > 3 && beats % 3 === 0;
      const beatSec = 60 / sing.bpm * (compound ? 1.5 : 4 / unit);
      const ci = compound ? beats / 3 : beats;
      sing.countInMs = ci * beatSec * 1000;
      sing.phraseStartPN = performance.now() + 150;
      sing.phraseSingPN = sing.phraseStartPN + sing.countInMs;
      if (audible && context) {
        const t0 = context.currentTime + Math.max(0, (sing.phraseStartPN - performance.now()) / 1000);
        for (let b = 0; b < ci; b++) host.audio.scheduleClick(t0 + b * beatSec, b === 0, true);
      }
      byId('si-verdict').className = 'verdict neutral';
      byId('si-verdict').textContent = host.i18n.t('si_count');
      sing.raf = requestAnimationFrame(ssPhraseLoop);
    });
  }

  function ssFreeLoop(ts: number): void {
    if (!sing.active || sing.mode !== 'free') return;
    const beatSec = 60 / sing.bpm;
    const dur = requireSingExercise().totalBeats * beatSec;
    let tt = (ts - sing.freePN) / 1000;
    if (tt > dur + 0.4) {
      sing.freePN = ts;
      sing.trail = [];
      ssClearTrail();
      tt = 0;
    }
    const x = ssBeatToX(Math.min(Math.max(tt, 0), dur) / beatSec);
    ssMoveCursor(x);
    if (ts - sing.lastPitchTs >= 33) {
      sing.lastPitchTs = ts;
      const p = ssReadPitch();
      const lv = byId('si-live');
      if (p) {
        livePitch(host, lv, p.midi, p.cents);
        sing.trail.push([x, ssPitchY(p.f)]);
        if (sing.trail.length > 400) sing.trail.shift();
        ssDrawTrail();
      } else {
        lv.classList.remove('rec');
        lv.textContent = '—';
      }
    }
    sing.raf = requestAnimationFrame(ssFreeLoop);
  }

  function ssFreeStart(): void {
    sing.active = true;
    sing.trail = [];
    ssClearTrail();
    ssPaint();
    host.audio.ensure();
    const run = sing.runId;
    void ssMicMaybe().then((ok) => {
      if (run !== sing.runId || !sing.active || sing.mode !== 'free') return;
      if (!ok) {
        singStopAll();
        const v = byId('si-verdict');
        v.className = 'verdict bad';
        v.textContent = host.i18n.t('tr_micfail');
        return;
      }
      if (inputById('si-drone').checked) host.metro.startDrone(pc(requireSingExercise().tonicMidi));
      sing.freePN = performance.now() + 100;
      byId('si-verdict').className = 'verdict neutral';
      byId('si-verdict').textContent = host.i18n.t('si_freehint');
      sing.raf = requestAnimationFrame(ssFreeLoop);
    });
  }

  function singKeyInput(m: number): void {
    if (!sing.active) return;
    if (sing.mode === 'note') {
      const cur = ssCurNote();
      if (!cur) return;
      if (pc(m) === pc(cur.midi)) ssNoteCorrect();
      else ssHintBump(m);
    } else if (sing.mode === 'phrase') {
      sing.keyEvents.push({ t: (inputTime() - sing.phraseSingPN) / 1000, midi: m });
    }
  }

  function singGo(): void {
    if (!sing.ex) return;
    if (sing.active) {
      singStopAll();
      byId('si-verdict').textContent = '';
      return;
    }
    byId('si-hint').textContent = '';
    sing.bpm = +(inputById('si-bpm').value || sing.ex.bpm);
    if (sing.mode === 'note') ssNoteStart();
    else if (sing.mode === 'phrase') ssPhraseStart();
    else ssFreeStart();
    byId('si-go').textContent = host.i18n.t('si_stop');
  }

  return {
    state: sing,
    fillLevels: ssFillLevels,
    draw: ssDraw,
    fit: ssFit,
    paint: ssPaint,
    newExercise: ssNewExercise,
    render: renderSing,
    stopAll: singStopAll,
    modeUI: ssModeUI,
    micStart: ssMicStart,
    micMaybe: ssMicMaybe,
    micStop: ssMicStop,
    readPitch: ssReadPitch,
    curNote: ssCurNote,
    svg: ssSvg,
    cursorEl: ssCursorEl,
    moveCursor: ssMoveCursor,
    removeCursor: ssRemoveCursor,
    scrollToX: ssScrollToX,
    scrollToCur: ssScrollToCur,
    pitchY: ssPitchY,
    drawTrail: ssDrawTrail,
    clearTrail: ssClearTrail,
    beatToX: ssBeatToX,
    tonicShift: ssTonicShift,
    tonic: ssTonic,
    flash: ssFlash,
    playIt: ssPlayIt,
    drone: ssDrone,
    noteStart: ssNoteStart,
    noteLoop: ssNoteLoop,
    noteCorrect: ssNoteCorrect,
    hintBump: ssHintBump,
    noteFinish: ssNoteFinish,
    phraseStart: ssPhraseStart,
    phraseLoop: ssPhraseLoop,
    phraseGrade: ssPhraseGrade,
    freeStart: ssFreeStart,
    freeLoop: ssFreeLoop,
    keyInput: singKeyInput,
    go: singGo,
    bumpProgress: ssBumpProgress,
  };
}

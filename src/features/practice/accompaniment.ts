import * as theory from '../../domain/theory.js';
import { byId, eventClosest, inputById, maybeById, queryHtml, selectById } from '../../domain/dom.js';
import {
  ACCOMP_PATTERNS, ACCOMP_PROGS, dispSym, progChordTpl,
  type AccompanimentChord, type AccompanimentEvent,
} from '../../domain/repertoire-data.js';
import type { AppHost } from '../../domain/views.js';

const SCALES = theory.SCALE_DEFINITIONS;
const pc = theory.pitchClass;

function escHtml(s: string | number | undefined): string {
  return String(s).replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}

export interface AccompanimentBuild {
  events: AccompanimentEvent[];
  beatsTotal: number;
}

export interface AccompanimentState {
  on: boolean;
  runId: number;
  progIdx: number;
  key: number;
  pattern: string;
  bpm: number;
  hands: string;
  click: boolean;
  improScale: string;
  timer: number | null;
  hlTimers: number[];
  built: AccompanimentBuild | null;
  beatSec: number;
  loopDur: number;
  nextLoop: number;
}

export const ACCOMP_GROUPS: readonly { readonly key: string; readonly names: readonly string[] }[] = [
  { key: 'ac_grp_pop', names: ['I–V–vi–IV (pop)', 'vi–IV–I–V', 'I–vi–IV–V (50s)', 'I–♭VII–IV (rock)', 'i–♭VI–♭VII (epic)', 'I–V–vi–iii–IV–I (Pachelbel pop)', 'Ballad I–iii–IV–V'] },
  { key: 'ac_grp_classic', names: ['I–IV–V', 'Pachelbel’s Canon', 'Andalusian i–♭VII–♭VI–V'] },
  { key: 'ac_grp_jazz', names: ['ii–V–I (jazz)', 'minor ii–V–i', 'Jazz turnaround I–vi–ii–V', 'Circle of 5ths vi–ii–V–I'] },
  { key: 'ac_grp_blues', names: ['12-bar blues'] },
];

export const ACCOMP_IMPRO_SCALES = [
  'Major (Ionian)', 'Aeolian (Natural minor)', 'Major pentatonic', 'Minor pentatonic', 'Blues',
] as const;

export const ACCOMP_DEFAULT_PROG = Math.max(0, ACCOMP_PROGS.findIndex((p) => p.name === 'I–V–vi–IV (pop)'));

/** Pure chord voicing helper for one accompaniment step. */
export function buildAccompVoicing(key: number, ch: readonly [number, string, string]): AccompanimentChord {
  const rootPc = (((key + ch[0]) % 12) + 12) % 12;
  const tpl = progChordTpl(ch[1]) || progChordTpl('maj');
  if (!tpl) throw new Error('Étude: no major chord template');
  const ivs = tpl.intervals.filter((i) => i < 24);
  const right = ivs.map((i) => {
    let m = 60 + rootPc + i;
    while (m > 72) m -= 12;
    while (m < 57) m += 12;
    return m;
  }).sort((a, b) => a - b);
  return { bass: 36 + rootPc, fifth: 36 + ((rootPc + 7) % 12), right };
}

/** Pure builder producing the complete event list and total beat length for a progression/pattern. */
export function buildAccompEvents(progIdx: number, key: number, pattern: string): AccompanimentBuild {
  const prog = ACCOMP_PROGS[progIdx] || ACCOMP_PROGS[0];
  const pat = ACCOMP_PATTERNS[pattern] || ACCOMP_PATTERNS.block;
  const events: AccompanimentEvent[] = [];
  let beat = 0;
  prog.chords.forEach((ch) => {
    pat.gen(events, beat, buildAccompVoicing(key, ch));
    beat += pat.beats;
  });
  return { events, beatsTotal: beat };
}

type AccompFilledSelect = HTMLSelectElement & { _filled?: boolean };

export interface AccompanimentDeps {
  readonly host: AppHost;
  readonly isAlongWanted: () => boolean;
  readonly getPracticeKey: () => number;
  readonly progDisp: (name: string) => string;
  readonly rootName: (pc: number) => string;
  readonly updatePracticeModeHint: () => void;
  readonly getKeyElements: () => ReadonlyMap<number, HTMLButtonElement>;
}

export interface AccompanimentController {
  readonly state: AccompanimentState;
  key(): number;
  clearImproScale(): void;
  paintImproScale(): void;
  voicing(ch: readonly [number, string, string]): AccompanimentChord;
  build(): AccompanimentBuild;
  timer(fn: () => void, ms: number): void;
  hl(midi: number, st: 'lh' | 'rh', onMs: number, offMs: number): void;
  scheduleAt(t0: number): void;
  chainHL(i: number): void;
  tick(): void;
  start(): void;
  stop(silent?: boolean): void;
  render(refreshLabels?: boolean): void;
  updateChain(): void;
  sync(): void;
  restartIfPlaying(): void;
  localize(): void;
  wireControls(): void;
}

export function createAccompanimentController(deps: AccompanimentDeps): AccompanimentController {
  const { host } = deps;
  const state: AccompanimentState = {
    on: false,
    runId: 0,
    progIdx: 0,
    key: 0,
    pattern: 'block',
    bpm: 90,
    hands: 'both',
    click: false,
    improScale: 'off',
    timer: null,
    hlTimers: [],
    built: null,
    beatSec: 0.5,
    loopDur: 0,
    nextLoop: 0,
  };

  function key(): number {
    return deps.getPracticeKey();
  }

  function clearImproScale(): void {
    deps.getKeyElements().forEach((el) => { delete el.dataset.impro; });
    const leg = maybeById('ac-impro-legend');
    if (leg) leg.hidden = true;
  }

  function paintImproScale(): void {
    clearImproScale();
    if (!deps.isAlongWanted() || !state.improScale || state.improScale === 'off') return;
    let scaleName = state.improScale;
    if (scaleName === 'auto') {
      const prog = ACCOMP_PROGS[state.progIdx] || ACCOMP_PROGS[0];
      const firstSym = prog?.chords[0]?.[1] ?? 'maj';
      const isMinor = firstSym.startsWith('m') && !firstSym.startsWith('maj');
      scaleName = isMinor ? 'Aeolian (Natural minor)' : 'Major (Ionian)';
    }
    const offs = SCALES[scaleName];
    if (!offs) return;
    const k = key();
    const pcs = new Set(offs.map((iv) => (((k + iv) % 12) + 12) % 12));
    deps.getKeyElements().forEach((el, m) => {
      if (pcs.has(pc(m))) el.dataset.impro = '1';
    });
    const leg = maybeById('ac-impro-legend');
    if (leg) leg.hidden = false;
  }

  function voicing(ch: readonly [number, string, string]): AccompanimentChord {
    return buildAccompVoicing(state.key, ch);
  }

  function build(): AccompanimentBuild {
    return buildAccompEvents(state.progIdx, state.key, state.pattern);
  }

  function timer(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      const i = state.hlTimers.indexOf(id);
      if (i >= 0) state.hlTimers.splice(i, 1);
      fn();
    }, Math.max(0, ms));
    state.hlTimers.push(id);
  }

  function hl(midi: number, st: 'lh' | 'rh', onMs: number, offMs: number): void {
    timer(() => {
      if (state.on) host.dock.mark(midi, st, true);
    }, onMs);
    timer(() => {
      if (!state.on) return;
      host.dock.clearKeyIfState(midi, st, true);
    }, offMs);
  }

  function chainHL(i: number): void {
    document.querySelectorAll('#ac-chain .ch').forEach((el, k) => el.classList.toggle('on', k === i));
  }

  function scheduleAt(t0: number): void {
    const bs = state.beatSec;
    const built = state.built;
    if (!built) return;
    const now = host.audio.requireContext().currentTime;
    built.events.forEach((e) => {
      if (state.hands !== 'both' && e.hand !== (state.hands === 'left' ? 'L' : 'R')) return;
      const when = t0 + e.beat * bs;
      const dur = Math.max(0.12, e.durB * bs * 0.95);
      host.audio.previewNote(e.midi, when, dur, e.hand === 'L' ? 78 : 98);
      const onMs = (when - now) * 1000;
      hl(e.midi, e.hand === 'L' ? 'lh' : 'rh', onMs, onMs + Math.min(dur, 1.05) * 1000);
    });
    const n = (ACCOMP_PROGS[state.progIdx] || ACCOMP_PROGS[0]).chords.length;
    const per = built.beatsTotal / Math.max(1, n);
    for (let i = 0; i < n; i++) {
      timer(() => { if (state.on) chainHL(i); }, (t0 + i * per * bs - now) * 1000);
    }
  }

  function tick(): void {
    const ctx = host.audio.context();
    if (!state.on || !ctx) return;
    while (state.nextLoop < ctx.currentTime + 0.6) {
      scheduleAt(state.nextLoop);
      state.nextLoop += state.loopDur;
    }
  }

  function startLoop(ctx: AudioContext): void {
    state.nextLoop = ctx.currentTime + 0.18;
    if (state.click) host.metro.start(state.bpm, state.nextLoop);
    state.timer = window.setInterval(tick, 40);
    tick();
  }

  function start(): void {
    const ctx = host.audio.ensure();
    stop(true);
    if (!ctx) return;
    const runId = ++state.runId;
    state.on = true;
    const built = state.built = build();
    state.beatSec = 60 / state.bpm;
    state.loopDur = built.beatsTotal * state.beatSec;
    if (state.loopDur <= 0) {
      state.on = false;
      return;
    }
    if (ctx.state === 'running') {
      startLoop(ctx);
      return;
    }
    void host.audio.timedReady(ctx).then((ready) => {
      if (!ready || !state.on || state.runId !== runId || host.audio.context() !== ctx) {
        if (state.runId === runId && state.on) stop();
        return;
      }
      startLoop(ctx);
    });
  }

  function stop(silent?: boolean): void {
    state.runId++;
    state.on = false;
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    state.hlTimers.forEach(clearTimeout);
    state.hlTimers = [];
    host.metro.stop();
    host.dock.clear('lh');
    host.dock.clear('rh');
    host.previews.stopAll();
    chainHL(-1);
    if (!silent) { // a restart (start) keeps the Stop label
      clearImproScale();
      paintImproScale();
      deps.updatePracticeModeHint(); // the Practice Start button reads Play loop again
    }
  }

  function updateChain(): void {
    const el = byId('ac-chain');
    if (!el) return;
    const prog = ACCOMP_PROGS[+(selectById('ac-prog').value || 0)];
    if (!prog) return;
    const k = key();
    el.innerHTML = prog.chords.map((ch) =>
      '<span class="ch"><small class="ch-rn">' + escHtml(ch[2]) + '</small> <span class="ch-nm">' +
      escHtml(host.i18n.formatChord(deps.rootName(((k + ch[0]) % 12 + 12) % 12), dispSym(ch[1]))) +
      '</span></span>',
    ).join('<span class="sep" aria-hidden="true">·</span>');
  }

  function render(refreshLabels = false): void {
    const lang = host.i18n.lang();
    const ps: AccompFilledSelect = selectById('ac-prog');
    if (ps && (!ps._filled || refreshLabels)) {
      const prev = ps._filled ? ps.value : String(ACCOMP_DEFAULT_PROG);
      ps.innerHTML = '';
      const used = new Set<number>();
      for (const grp of ACCOMP_GROUPS) {
        const og = document.createElement('optgroup');
        og.label = host.i18n.t(grp.key);
        for (const nm of grp.names) {
          const idx = ACCOMP_PROGS.findIndex((p) => p.name === nm);
          if (idx >= 0) {
            used.add(idx);
            const o = document.createElement('option');
            o.value = String(idx);
            o.textContent = deps.progDisp(ACCOMP_PROGS[idx].name);
            og.appendChild(o);
          }
        }
        if (og.children.length) ps.appendChild(og);
      }
      ACCOMP_PROGS.forEach((p, i) => {
        if (used.has(i)) return;
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = deps.progDisp(p.name);
        ps.appendChild(o);
      });
      ps.value = [...ps.options].some((o) => o.value === prev) ? prev : String(ACCOMP_DEFAULT_PROG);
      ps._filled = true;
    }
    const pt: AccompFilledSelect = selectById('ac-pat');
    if (pt && (!pt._filled || refreshLabels)) {
      const prevPat = pt._filled ? pt.value : 'block';
      pt.innerHTML = '';
      Object.keys(ACCOMP_PATTERNS).forEach((k) => {
        const o = document.createElement('option');
        o.value = k;
        o.textContent = ACCOMP_PATTERNS[k][lang] || ACCOMP_PATTERNS[k].en;
        pt.appendChild(o);
      });
      pt.value = [...pt.options].some((o) => o.value === prevPat) ? prevPat : 'block';
      pt._filled = true;
    }
    const pi = maybeById('ac-impro-scale');
    if (pi instanceof HTMLSelectElement) {
      const prevImpro = pi.value || 'off';
      while (pi.options.length > 2) pi.remove(2);
      for (const sc of ACCOMP_IMPRO_SCALES) {
        const o = document.createElement('option');
        o.value = sc;
        o.textContent = host.i18n.scaleDisp(sc);
        pi.appendChild(o);
      }
      pi.value = [...pi.options].some((o) => o.value === prevImpro) ? prevImpro : 'off';
    }
    updateChain();
  }

  function sync(): void {
    state.progIdx = +(selectById('ac-prog').value || 0);
    state.key = key();
    state.pattern = selectById('ac-pat').value || 'block';
    state.bpm = +(inputById('ac-bpm').value || 90);
    const hb = queryHtml(byId('ac-hands'), '[aria-pressed="true"]');
    state.hands = hb ? hb.dataset.v ?? state.hands : 'both';
    state.click = inputById('ac-click').checked;
    const pi = maybeById('ac-impro-scale');
    state.improScale = pi instanceof HTMLSelectElement ? (pi.value || 'off') : 'off';
    paintImproScale();
  }

  function restartIfPlaying(): void {
    if (state.on) {
      sync();
      start();
    }
  }

  function localize(): void {
    const lang = host.i18n.lang();
    const ap: AccompFilledSelect = selectById('ac-pat');
    if (ap && ap._filled) {
      const v = ap.value;
      ap.innerHTML = '';
      Object.keys(ACCOMP_PATTERNS).forEach((k) => {
        const o = document.createElement('option');
        o.value = k;
        o.textContent = ACCOMP_PATTERNS[k][lang] || ACCOMP_PATTERNS[k].en;
        ap.appendChild(o);
      });
      ap.value = v || 'block';
    }
    const acp: AccompFilledSelect = selectById('ac-prog');
    if (acp && acp._filled) {
      const v = acp.value;
      acp.innerHTML = '';
      ACCOMP_PROGS.forEach((p, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = deps.progDisp(p.name);
        acp.appendChild(o);
      });
      acp.value = v || '0';
    }
  }

  function wireControls(): void {
    byId('ac-hands').addEventListener('click', (e) => {
      const b = eventClosest(e, 'button');
      if (!b) return;
      const btns = e.currentTarget instanceof Element
        ? [...e.currentTarget.children].filter((x): x is HTMLElement => x instanceof HTMLElement)
        : [];
      btns.forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      restartIfPlaying();
    });
    ['ac-prog', 'ac-pat'].forEach((id) => byId(id).addEventListener('change', () => {
      updateChain();
      paintImproScale();
      restartIfPlaying();
    }));
    maybeById('ac-impro-scale')?.addEventListener('change', () => {
      const pi = maybeById('ac-impro-scale');
      state.improScale = pi instanceof HTMLSelectElement ? (pi.value || 'off') : 'off';
      paintImproScale();
    });
    byId('ac-bpm').addEventListener('input', (e) => {
      if (e.target instanceof HTMLInputElement) byId('ac-bpmLbl').textContent = e.target.value;
    });
    byId('ac-bpm').addEventListener('change', restartIfPlaying);
    byId('ac-click').addEventListener('change', restartIfPlaying);
  }

  return {
    state,
    key,
    clearImproScale,
    paintImproScale,
    voicing,
    build,
    timer,
    hl,
    scheduleAt,
    chainHL,
    tick,
    start,
    stop,
    render,
    updateChain,
    sync,
    restartIfPlaying,
    localize,
    wireControls,
  };
}

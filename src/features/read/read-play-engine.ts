import type { Localised } from '../../locales/content-types.js';
import type { PracticeController } from '../../domain/views.js';

import { type ReadDrillLevel } from '../../core/reading-curriculum.js';
import { samePitch } from '../../core/pitch-match.js';
import { type SrLayout, type SrPiece, type SrRenderResult, type SrScore, type SrStaffNote } from '../../domain/score-types.js';
import { srBeatPt, srSpellName } from '../../domain/grand-staff.js';
import { byId, maybeById, inputById, buttonById } from '../../domain/dom.js';
import { type CoachTip } from '../../domain/views.js';
import { inputTimeForRelease } from '../../domain/midi-timing.js';
import { srtEvaluate, type SightReadingPerformed } from '../../sight-reading/evaluate.js';
import { srtBuildExpected, type SightReadingExpected } from '../../sight-reading/model.js';
import { srtLevelClicks, srtLevelDurationMs, srtLevelExpected } from '../../sight-reading/score.js';
import type { GeneratedPiece } from '../../sight-reading/rules.js';
import { SightReadingRecorder, srtInputFamily } from '../../sight-reading/recorder.js';
import { createInstantFeedbackTracker, type InstantFeedbackExpectedNote, type InstantFeedbackTracker } from '../../sight-reading/instant-feedback.js';
import { srtAcquireAttemptLease, srtLedgerReadStatus, srtLedgerUpdate, srtReadLedger, type SightReadingAttempt, type SightReadingAttemptLease, type SightReadingLedgerOperation, type SightReadingLedgerResult } from '../../sight-reading/ledger.js';
import { SRT_INITIAL_STATE, srtTransition, type SightReadingState } from '../../sight-reading/flow.js';
import { type TechniqueKind } from '../../domain/technique.js';
import { TECHNIQUE_TOPIC } from '../../domain/technique-drill.js';
import type { AppHost, ReadShell } from '../../domain/views.js';
import * as theory from '../../domain/theory.js';

const pc = theory.pitchClass, srKeyName = theory.circleKeyPitchClass, rdSpellMidi = theory.readingSpelling;
import type { SrState, RdnState, RdnWarmState, SrtAttemptCleanup, SrSvgNoteRef, SrSvgCacheEntry, SrtStopReason, SrtLedgerFailureReason, SrtLedgerFailureContext, SrNoteStartEvent, RdKeyInfo, ReadDrillState, RdSightLevel } from './read-model.js';

import type { TranslateFn } from '../../domain/views.js';

/** Shell state and services createReadPlayEngine reads; values are getters so shell declarations made later resolve on use. */
export interface ReadPlayEngineDeps {
  readonly host: AppHost;
  readonly shell: ReadShell;
  readonly audioLockCheck: () => void;
  readonly ensureAudio: (warm?: boolean) => AudioContext | null;
  readonly foldToView: (midi: number) => number;
  readonly isRdSightLevel: (L: ReadDrillLevel) => L is ReadDrillLevel & RdSightLevel;
  readonly kbClear: (state: string) => void;
  readonly kbState: (midi: number, state: string | null, fold: boolean) => void;
  readonly markReadDoneToday: (save?: boolean) => void;
  readonly noteName: (midi: number, preferFlat?: boolean) => string;
  readonly panic: () => void;
  readonly pcName: (pc: number, preferFlat?: boolean) => string;
  readonly RD: ReadDrillState;
  readonly rdEsc: (value: string | number | undefined) => string;
  readonly RDN: RdnState;
  readonly RDN_CHORD_WINDOW_MS: number;
  readonly rdnAutoAfterSave: () => void;
  readonly rdnAutoCancel: () => void;
  readonly rdnBpm: (piece: GeneratedPiece) => number;
  readonly rdnDrawnIds: (piece: GeneratedPiece, expected: readonly SightReadingExpected[]) => Map<string, number>;
  readonly rdnHandsUi: () => void;
  readonly rdnHeadText: () => { title: string; sub: string; };
  readonly rdnNavUi: () => void;
  readonly rdnRecord: (score: number, stars: 0 | 1 | 2 | 3, firstSight: boolean) => void;
  readonly rdnRestWindows: (piece: GeneratedPiece, bpm: number, hand: "rh" | "lh" | "both") => { startMs: number; endMs: number; }[];
  readonly rdnResultHide: () => void;
  readonly rdnResultShow: (startAuto: boolean) => void;
  readonly rdnStars: (n: number) => 0 | 1 | 2 | 3;
  readonly rdRender: () => void;
  readonly rdSightDone: (kind: string, val: number) => string;
  readonly rdSightStart: (mode: string, injectedSeed?: number) => void;
  readonly readScoreZoom: (value?: number) => void;
  readonly saveAll: () => void;
  readonly scoreFocusUi: () => void;
  readonly SR: SrState;
  readonly srCoach: () => void;
  readonly srLearnGrade: (mistakes: number, steps: number) => { acc: number; stars: 0 | 1 | 2; };
  readonly srNextAssess: (pct: number) => CoachTip | null;
  readonly srNextLearn: () => CoachTip;
  readonly srPieceTitle: (piece: { id?: string; t?: Localised<string>; }) => string;
  readonly srRender: (piece: SrScore, lay?: SrLayout, proportional?: boolean) => SrRenderResult;
  readonly srSlipNote: (st: { notes: readonly SrStaffNote[]; }, m: number) => void;
  readonly srStartStage: () => void;
  srtClaimDurableAttemptId: string | null;
  srtClaimIssuedAttemptId: string | null;
  readonly srtCleanupPromises: Map<string, Promise<SightReadingLedgerResult>>;
  srtCountInAttemptId: string | null;
  srtCountInEpoch: number;
  srtExposurePromise: { fingerprint: string; promise: Promise<SightReadingLedgerResult>; } | null;
  srtOperationEpoch: number;
  srtRecorder: SightReadingRecorder | null;
  readonly srtReleasedLeases: WeakSet<SightReadingAttemptLease>;
  readonly stageSync: () => void;
  readonly stopPreviews: () => void;
  readonly storeBackupBlocked: () => boolean;
  readonly storeDaily: () => void;
  readonly syncMobileStartBars: () => void;
  readonly t: TranslateFn;
  readonly timedAudioReady: (context: AudioContext) => Promise<boolean>;
  readonly touchDay: () => void;
  readonly view0: () => string;
  readonly WARM: RdnWarmState;
  readonly withPractice: (fn: (practice: PracticeController) => void) => void;
}

/* The Read & play engine: the grand-staff engraver, step-by-step, assessment and listen modes, first-sight claims and the
   attempt ledger, instant feedback, and the level piece that starts on its first note. */
export function createReadPlayEngine(deps: ReadPlayEngineDeps) {
  const { host, shell } = deps;
    /* ---- state, drawing, grading ---- */
  function srSvg() { return byId('rd-staff') ? byId('rd-staff').querySelector('svg') : null; }
    function srHandsAvail() { const p = deps.SR.piece; if (!p)
      throw new Error('Étude: no piece selected'); return p.rh && p.lh ? 'both' : (p.rh ? 'rh' : 'lh'); }
    function srActiveHands() { const a = srHandsAvail(); return a === 'both' ? deps.SR.hands : a; }
    function srHandSel(): 'rh' | 'lh' | 'both' { const a = srActiveHands(); return a === 'rh' || a === 'lh' ? a : 'both'; }
    function srStepsBuild() {
      const sel = srActiveHands();
      const ns = deps.SR.notes.filter((n) => sel === 'both' || n.hand === sel);
      const map = new Map<string, { beat: number; notes: typeof ns; }>();
      ns.forEach((n) => { const k = n.beat.toFixed(3); let step = map.get(k); if (!step)
          map.set(k, step = { beat: n.beat, notes: [] }); step.notes.push(n); });
      deps.SR.steps = [...map.values()].sort((a, b) => a.beat - b.beat);
  }
    function srDraw() {
      if (!deps.SR.piece)
          return;
      srtConsumeOnLearnReveal();
      const lay = srPageLayout(deps.SR.piece, srPaper());
      const r = deps.srRender(deps.SR.piece, lay, true);
      deps.SR.render = r;
      deps.SR.notes = r.notes;
      deps.SR.beatX = r.beatX;
      deps.SR.totalBeats = r.total;
      const concealed = srtScoreConcealed();
      const staffEl = byId('rd-staff');
      staffEl.setAttribute('aria-hidden', concealed ? 'true' : 'false');
      staffEl.dataset.activeHand = srActiveHands();
      staffEl.innerHTML = concealed ? '' : r.svg;
      deps.readScoreZoom();
      deps.scoreFocusUi();
      srPaperSeen = lay;
      srFollowSy = -1;
      srStepsBuild();
      if (!concealed) {
          srPaintAll();
          if (deps.SR.active && deps.SR.modeSel === 'learn')
              srScrollStep();
          else if (!deps.SR.active)
              byId('rd-staff').scrollLeft = 0;
      }
      deps.srCoach();
  }
    function srtGeneratedSelected() {
      return (!!deps.SR.srtPiece || !!deps.SR.lvPiece) && !!deps.SR.gen && deps.SR.piece?.id === deps.SR.gen.id;
  }
    function srtEligibleFirstSightActive() {
      return srtGeneratedSelected() && deps.SR.srtState?.mode === 'firstSight' &&
          ['preparing', 'claiming', 'preview', 'countIn', 'playing'].includes(deps.SR.srtState.name);
  }
    let srtWatchedAudioContext: AudioContext | null = null;
    function srtWatchAudioContext(context: AudioContext) {
      if (srtWatchedAudioContext === context)
          return;
      srtWatchedAudioContext = context;
      if (typeof context.addEventListener !== 'function')
          return;
      context.addEventListener('statechange', () => {
          if (context === shell.audioEngine.context && String(context.state) !== 'running' && srtEligibleFirstSightActive())
              deps.panic();
      });
  }
    function srNamesVisible(piece: SrScore) {
      // A level piece shows before its first attempt: its note names wait until it is practice.
      const state = deps.SR.srtState, lvFirst = !!deps.SR.lvPiece && srtGeneratedSelected() && state?.mode === 'firstSight' && (state.name === 'idle' || state.name === 'blocked');
      return deps.SR.names && !piece.noNames && !srtScoreConcealed() && !lvFirst && !srtEligibleFirstSightActive() && deps.SR.srtState?.name !== 'claiming';
  }
    const srSvgCache = new WeakMap<SVGSVGElement, SrSvgCacheEntry>();
    function srSvgEntry(svg: SVGSVGElement): SrSvgCacheEntry {
      let entry = srSvgCache.get(svg);
      if (!entry) {
          const noteById = new Map<number, { x: number; y: number }>();
          for (const item of deps.SR.notes)
              noteById.set(item.nid, item);
          const notes = new Map<number, SrSvgNoteRef>();
          svg.querySelectorAll('.ss-n').forEach((g) => {
              if (!(g instanceof SVGElement))
                  return;
              const id = Number(g.dataset.nid);
              const rawTitle = g.querySelector('title');
              let title: SVGTitleElement;
              if (rawTitle instanceof SVGTitleElement) {
                  title = rawTitle;
              }
              else {
                  title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                  g.appendChild(title);
              }
              const rawVisible = g.querySelector('.ss-result-symbol');
              let visible: SVGTextElement;
              if (rawVisible instanceof SVGTextElement) {
                  visible = rawVisible;
              }
              else {
                  visible = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                  visible.setAttribute('class', 'ss-result-symbol');
                  visible.setAttribute('aria-hidden', 'true');
                  g.appendChild(visible);
              }
              const note = noteById.get(id);
              visible.setAttribute('x', String((note?.x ?? 0) + 12));
              visible.setAttribute('y', String(Math.max(12, (note?.y ?? 16) - 8)));
              notes.set(id, { g, title, sym: visible });
          });
          const ph = svg.querySelector('.ss-playhead'), ex = svg.querySelector('.ss-extra-symbol');
          entry = {
              notes,
              playhead: ph instanceof SVGLineElement ? ph : null,
              extras: ex instanceof SVGGElement ? ex : null,
          };
          srSvgCache.set(svg, entry);
      }
      return entry;
  }
    function srPaintAll() {
      const svg = srSvg();
      if (!svg)
          return;
      const entry = srSvgEntry(svg);
      const st = (deps.SR.active && deps.SR.modeSel === 'learn') ? deps.SR.steps[deps.SR.stepIdx] : null;
      const stepNids = st ? new Set(st.notes.map((n: { nid: number; }) => n.nid)) : null;
      entry.notes.forEach(({ g, title, sym: visible }, id) => {
          const r = deps.SR.results[id];
          if (stepNids && stepNids.has(id) && !deps.SR.hit.has(id))
              g.dataset.s = 'now';
          else if (r)
              g.dataset.s = r;
          else
              g.removeAttribute('data-s');
          const symbol = r === 'good' ? '✓' : r === 'near' ? '≈' : r === 'bad' ? '✗' : r === 'extra' ? '+' : '';
          const label = r === 'good' ? deps.t('rd_srt_symbol_good') : r === 'near' ? deps.t('rd_srt_symbol_near') : r === 'bad' ? deps.t('rd_srt_symbol_bad') : r === 'extra' ? deps.t('rd_srt_symbol_extra') : '';
          const nextTitle = symbol ? symbol + ' ' + label : '';
          if (title.textContent !== nextTitle)
              title.textContent = nextTitle;
          if (symbol) {
              if (g.getAttribute('aria-label') !== symbol)
                  g.setAttribute('aria-label', symbol);
          }
          else if (g.hasAttribute('aria-label'))
              g.removeAttribute('aria-label');
          if (visible.textContent !== symbol)
              visible.textContent = symbol;
          const nextDisp = symbol ? '' : 'none';
          if (visible.style.display !== nextDisp)
              visible.style.display = nextDisp;
      });
      const rawExtras = entry.extras && entry.extras.parentNode === svg ? entry.extras : svg.querySelector('.ss-extra-symbol');
      let extras = rawExtras instanceof SVGGElement ? rawExtras : null;
      if (deps.SR.wrongExtra > 0) {
          if (!extras) {
              extras = document.createElementNS('http://www.w3.org/2000/svg', 'g');
              extras.setAttribute('class', 'ss-extra-symbol');
              svg.appendChild(extras);
          }
          entry.extras = extras;
          extras.innerHTML = `<title>${deps.rdEsc(deps.t('rd_srt_symbol_extra'))}</title><text x="${Math.max(20, (deps.SR.render?.W ?? 420) - 24)}" y="18">+${deps.SR.wrongExtra}</text>`;
      }
      else if (extras) {
          extras.remove();
          entry.extras = null;
      }
  }
    // x is in SVG units; on the full-screen stage the score is drawn larger than one pixel a unit.
  function srScrollX(x: number) {
      const w = byId('rd-staff');
      if (!w)
          return;
      if (w.scrollWidth > w.clientWidth + 4) {
          const svg = srSvg(), W = deps.SR.render?.W, k = svg && W ? svg.getBoundingClientRect().width / W || 1 : 1;
          w.scrollLeft = Math.max(0, x * k - w.clientWidth * 0.4);
      }
      else if (w.scrollLeft !== 0)
          w.scrollLeft = 0;
  }
    // The paper's inner size in CSS pixels, which the score is laid out for (see SrLayout). On the full-screen stage the height
  // counts too. A hidden paper has no size: the score is then drawn at its natural size, and srFit lays it out once it shows.
  function srPaperOf(wrap: HTMLElement | null): SrLayout | undefined {
      if (!wrap || !wrap.clientWidth)
          return undefined;
      const cs = getComputedStyle(wrap), width = Math.floor(wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
      return shell.stage.on ? { width, maxHeight: Math.floor(wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) } : { width };
  }
    function srPaper() { return srPaperOf(maybeById('rd-staff')); }
    // A level piece is laid out like a printed page: four bars a system, and as large as lets the whole piece show without
  // scrolling, between SR_PAGE_MIN (still easy to read) and SR_PAGE_MAX times its natural size. A long piece scrolls.
  const SR_PAGE_MIN = 0.85, SR_PAGE_MAX = 1.8;
    /** The height of a piece at its natural size, for the width and the note-names setting it was measured with. */
  const srPageNatural = new WeakMap<SrScore, { width: number; names: boolean; H: number }>();
    function srPageLayout(piece: SrPiece, lay: SrLayout | undefined): SrLayout | undefined {
      const wrap = maybeById('rd-staff');
      // Manual expansion uses readable systems and vertical scrolling instead of shrinking the whole piece to its height.
      if (lay && shell.scoreFocus.owner === 'read')
          return { width: lay.width, minBars: 1, cap: SR_PAGE_MAX, floor: .5, justify: true };
      if (!lay || lay.maxHeight || piece.engrave !== 2 || !deps.SR.lvPiece || !srtGeneratedSelected() || !wrap)
          return lay;
      // The height the paper may take: the window, less what is above the paper, the play controls, and the live dock below it.
      const dockEl = maybeById('dock');
      const dockH = dockEl && !dockEl.hidden ? dockEl.getBoundingClientRect().height : 0;
      const ctrlEl = maybeById('rd-play-controls');
      const ctrlH = ctrlEl && !ctrlEl.hidden ? Math.max(48, ctrlEl.getBoundingClientRect().height + 16) : 64;
      const below = Math.round(dockH + ctrlH + 84);
      const room = Math.max(220, window.innerHeight - (wrap.getBoundingClientRect().top + window.scrollY) - below);
      const names = srNamesVisible(piece), seen = srPageNatural.get(piece);
      const natural = seen && seen.width === lay.width && seen.names === names ? seen.H : deps.srRender(piece, { width: lay.width, cap: 1 }, true).H;
      srPageNatural.set(piece, { width: lay.width, names, H: natural });
      const cap = Math.max(SR_PAGE_MIN, Math.min(SR_PAGE_MAX, room / Math.max(1, natural)));
      return { ...lay, cap, floor: Math.min(1, cap), justify: true };
  }
    /** Whether a staff laid out for paper `prev` needs laying out again for `next`. A hidden paper (undefined) keeps the last layout.
   *  The paper growing by less than a scrollbar is ignored: a taller score can show the page's scrollbar, and laying out again
   *  for the narrower paper must not hide it and grow the score back. */
  function srPaperChanged(prev: SrLayout | undefined, next: SrLayout | undefined) {
      if (!next)
          return false;
      if (!prev || prev.maxHeight !== next.maxHeight)
          return true;
      // A page (a level piece) is sized by the room under it as well: that changes when the things above it do.
      if (Math.abs((prev.cap ?? 0) - (next.cap ?? 0)) > 0.02)
          return true;
      return next.width < prev.width || next.width - prev.width >= 24;
  }
    let srPaperSeen: SrLayout | undefined;
    // Lays the score out again when its paper changed size (a resize, the full-screen stage, the tab coming into view). The marks
  // of a run in progress are painted again from its state; the playhead comes back on its next frame.
  function srFit() {
      if (!deps.SR.piece || !deps.SR.render || srtScoreConcealed())
          return;
      const lay = srPageLayout(deps.SR.piece, srPaper());
      if (!srPaperChanged(srPaperSeen, lay))
          return;
      srPaperSeen = lay;
      const r = deps.srRender(deps.SR.piece, lay, true), wrap = byId('rd-staff');
      const left = wrap.scrollLeft, top = wrap.scrollTop;
      const closed = new Set(deps.SR.steps.filter((s) => s.closed).map((s) => s.beat.toFixed(3)));
      deps.SR.render = r;
      deps.SR.notes = r.notes;
      deps.SR.beatX = r.beatX;
      wrap.innerHTML = r.svg;
      deps.readScoreZoom();
      srFollowSy = -1;
      srStepsBuild();
      deps.SR.steps.forEach((s) => { if (closed.has(s.beat.toFixed(3)))
          s.closed = true; });
      srPaintAll();
      if (deps.SR.active && deps.SR.modeSel === 'learn')
          srScrollStep();
      else { wrap.scrollLeft = left; wrap.scrollTop = top; }
  }
    // While a score of several systems plays, the page (or the stage's paper) scrolls so the system being read stays in view.
  let srFollowSy = -1;
    function srFollow(sy: number) {
      const r = deps.SR.render, svg = srSvg(), s = r?.systems[sy];
      if (!r || !svg || !s || r.systems.length < 2 || sy === srFollowSy)
          return;
      srFollowSy = sy;
      const box = svg.getBoundingClientRect(), k = box.height / r.H, wrap = byId('rd-staff');
      if (!k)
          return;
      const top = box.top + s.yTop * k, bot = box.top + s.yBot * k;
      if (wrap.scrollHeight > wrap.clientHeight + 4) {
          const wr = wrap.getBoundingClientRect();
          if (top < wr.top || bot > wr.bottom)
              wrap.scrollTop += top - wr.top - 8;
          return;
      }
      const hd = document.querySelector('header'), upper = hd && getComputedStyle(hd).position === 'sticky' ? hd.getBoundingClientRect().bottom : 0;
      const lower = Math.min(innerHeight, ...[maybeById('dock'), maybeById('bottomNav')].flatMap((el) => { const b = el?.getBoundingClientRect(); return b && b.height > 0 && b.top < innerHeight ? [b.top] : []; }));
      if (top < upper + 8)
          window.scrollBy(0, top - upper - 8);
      else if (bot > lower - 8)
          window.scrollBy(0, Math.min(bot - lower + 16, top - upper - 8));
  }
    function srScrollStep() { const st = deps.SR.steps[deps.SR.stepIdx]; if (st) {
      srScrollX(st.notes[0].x);
      srFollow(st.notes[0].sy);
  } }
    function srBeatToX(beat: number) { return srBeatPt(deps.SR.beatX, beat).x; }
    /** Moves the playhead to `x` on system `sy`. */
  function srCursor(x: number, sy = 0) {
      const svg = srSvg();
      if (!svg)
          return;
      const entry = srSvgEntry(svg);
      const rawCursor = entry.playhead && entry.playhead.parentNode === svg ? entry.playhead : svg.querySelector('.ss-playhead');
      let c = rawCursor instanceof SVGLineElement ? rawCursor : null;
      if (!c) {
          c = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          c.setAttribute('class', 'ss-playhead');
          svg.appendChild(c);
      }
      entry.playhead = c;
      const s = deps.SR.render?.systems[sy];
      c.setAttribute('y1', String(s ? s.yTop : 38));
      c.setAttribute('y2', String(s ? s.yBot : 102));
      c.setAttribute('x1', String(x));
      c.setAttribute('x2', String(x));
      srScrollX(x);
      srFollow(sy);
  }
    function srTargets() {
      deps.kbClear('target');
      if (!(deps.SR.active && deps.SR.modeSel === 'learn'))
          return;
      const st = deps.SR.steps[deps.SR.stepIdx];
      if (st)
          st.notes.forEach((n: { nid: number; midi: number; }) => { if (!deps.SR.hit.has(n.nid))
              deps.kbState(n.midi, 'target', true); });
  }
    function srClick(t: number, acc: boolean) {
      const click = shell.audioEngine.scheduleClick(t, acc);
      if (click?.oscs)
          deps.SR.nodes.push(...click.oscs);
  }
    let srInstantTracker: InstantFeedbackTracker | null = null;
    let srInstantVerdictShown = false;
    function srInstantNotes(): InstantFeedbackExpectedNote[] {
      const sel = srActiveHands();
      const msPerBeat = 60000 / deps.SR.bpm;
      return deps.SR.notes
          .filter((n) => sel === 'both' || n.hand === sel)
          .map((n) => ({ nid: n.nid, midi: n.midi, onMs: n.beat * msPerBeat }));
  }
    function srInstantReset() {
      srInstantTracker = null;
      srInstantVerdictShown = false;
  }
    function srInstantNoteLabel(midi: number, matchedNid?: number): string {
      if (matchedNid !== undefined && deps.SR.piece?.engrave === 2) {
          const note = deps.SR.notes.find((n) => n.nid === matchedNid);
          if (note)
              return srSpellName(note.li, note.acc, host.i18n.notation()) + note.oct;
      }
      const flat = (deps.SR.piece?.keyN || 0) < 0;
      return deps.noteName(midi, flat);
  }
    function srInstantFlashKey(midi: number, status: 'good' | 'bad') {
      const m = deps.foldToView(midi);
      deps.kbState(m, status, false);
      deps.SR.timers.push(setTimeout(() => {
          const el = shell.keyEl.get(m);
          if (!el || el.dataset.s !== status)
              return;
          const isHeld = [...shell.held].some((n) => deps.foldToView(n) === m);
          deps.kbState(m, isHeld ? 'active' : null, false);
      }, 350));
  }
    function srInstantHandleNote(midi: number, onMs: number) {
      if (!srInstantTracker)
          return;
      const res = srInstantTracker.processInput(midi, onMs);
      const v = maybeById('rd-verdict');
      if (res.matched) {
          deps.SR.results[res.nid] = res.status;
          srPaintAll();
          const lbl = srInstantNoteLabel(res.expectedMidi, res.nid);
          srInstantFlashKey(midi, res.status === 'bad' ? 'bad' : 'good');
          if (v) {
              if (res.status === 'good') {
                  v.className = 'verdict good';
                  v.textContent = deps.t('rd_fb_good', lbl);
              }
              else if (res.status === 'near') {
                  v.className = 'verdict neutral';
                  v.textContent = deps.t('rd_fb_near', lbl);
              }
              else {
                  v.className = 'verdict bad';
                  v.textContent = deps.t('rd_fb_late', lbl);
              }
          }
      }
      else {
          deps.SR.wrongExtra++;
          srPaintAll();
          srInstantFlashKey(midi, 'bad');
          if (v) {
              const played = srInstantNoteLabel(midi);
              v.className = 'verdict bad';
              if (res.expectedMidis.length) {
                  const exp = res.expectedMidis.map((m) => srInstantNoteLabel(m)).join(' / ');
                  v.textContent = deps.t('rd_fb_wrong_exp', played, exp);
              }
              else {
                  v.textContent = deps.t('rd_fb_wrong', played);
              }
          }
      }
      srInstantVerdictShown = true;
  }
    function srInstantSweep(nowMs: number) {
      if (!srInstantTracker)
          return;
      const missed = srInstantTracker.sweepMissed(nowMs);
      if (!missed.length)
          return;
      for (const nid of missed)
          deps.SR.results[nid] = 'bad';
      srPaintAll();
  }
    let srAssessRunId = 0;
    function srStopAll(keep?: boolean, preserveSrt = false, reason: SrtStopReason = 'interrupt') {
      srAssessRunId++;
      if (!preserveSrt) {
          if (reason === 'navigate')
              srtNavigateAttempt();
          else
              srtCancelAttempt('interrupted');
      }
      const preservePendingResult = srtPendingSaveProtected();
      deps.SR.active = false;
      deps.stageSync();
      deps.rdnNavUi();
      deps.SR.assessOn = false;
      srInstantReset();
      if (deps.SR.raf)
          cancelAnimationFrame(deps.SR.raf);
      deps.SR.raf = 0;
      deps.SR.timers.forEach(clearTimeout);
      deps.SR.timers = [];
      deps.SR.nodes.forEach((n) => { try {
          n.stop(0);
      }
      catch (_) { } });
      deps.SR.nodes = [];
      if (shell.audioEngine.context)
          deps.stopPreviews();
      deps.kbClear('target');
      deps.kbClear('good');
      deps.kbClear('bad');
      const svg = srSvg(), c = svg && svg.querySelector('.ss-playhead');
      if (c)
          c.remove();
      srFollowSy = -1;
      if (!keep && !preservePendingResult) {
          deps.SR.results = {};
          deps.SR.wrongExtra = 0;
          deps.SR.stepIdx = 0;
          deps.SR.hit.clear();
          deps.SR.next = null;
          srPaintAll();
      }
      const go = byId('rd-go');
      if (go && !preservePendingResult)
          go.textContent = deps.t('rd_start');
      deps.SR.listening = false;
      const li = byId('rd-listen');
      if (li)
          li.textContent = deps.t('rd_listen');
      rdWarmButtonsSync();
      if (!preservePendingResult)
          deps.srCoach();
  }
    function srPlayGap(fromBeat: number, toBeat: number) {
      const sel = srActiveHands();
      if (sel === 'both' || srHandsAvail() !== 'both')
          return;
      const bs = 60 / deps.SR.bpm, ctx = shell.audioEngine.context;
      if (!ctx)
          return;
      deps.SR.notes.filter((n) => n.hand !== sel && n.beat >= fromBeat - 1e-3 && n.beat < toBeat - 1e-3).forEach((n) => host.audio.previewNote(n.midi, ctx.currentTime + 0.02, Math.max(.15, n.dur * bs * .9), 78));
  }
    function srCount() { const v = byId('rd-verdict'); v.className = 'verdict neutral'; v.textContent = deps.SR.stepIdx + ' / ' + deps.SR.steps.length + (deps.SR.mistakes ? '  ·  ✗ ' + deps.SR.mistakes : ''); }
    function srLearnStart() {
      deps.rdnResultHide();
      deps.SR.active = true;
      deps.SR.anyOctave = !!host.store.data().settings.anyOctave;
      deps.srStartStage();
      deps.rdnNavUi();
      rdWarmButtonsSync();
      deps.SR.results = {};
      deps.SR.stepIdx = 0;
      deps.SR.hit.clear();
      deps.SR.mistakes = 0;
      deps.SR.errs = {};
      deps.SR.slipKey = null;
      deps.SR.next = null;
      deps.srCoach();
      srPaintAll();
      srTargets();
      srScrollStep();
      const v = byId('rd-verdict');
      v.className = 'verdict neutral';
      v.textContent = deps.t('rd_learn_go');
      byId('rd-go').textContent = deps.t('rd_stop');
  }
    function srLearnFinish() {
      deps.SR.next = deps.srNextLearn();
      srStopAll(true);
      const v = byId('rd-verdict');
      if (deps.SR.mistakes === 0) {
          v.className = 'verdict good';
          v.textContent = deps.t('rd_perfect');
      }
      else {
          v.className = 'verdict neutral';
          v.textContent = deps.t('rd_done_learn', deps.SR.mistakes);
      }
      if (deps.SR.lvPiece && srtGeneratedSelected()) {
          const grade = deps.srLearnGrade(deps.SR.mistakes, deps.SR.steps.length || 1);
          deps.rdnRecord(grade.acc, grade.stars, false);
          v.textContent += ' · ' + '★'.repeat(grade.stars) + '☆'.repeat(3 - grade.stars);
          deps.RDN.learn = { acc: grade.acc, stars: grade.stars };
          // Practice never moves on by itself: no auto-next after a Step-by-step run.
          deps.rdnResultShow(false);
      }
      else
          v.textContent += deps.rdSightDone('learn', deps.SR.mistakes);
      deps.markReadDoneToday();
      deps.touchDay();
      deps.saveAll();
  }
    function srtSetState(event: Parameters<typeof srtTransition>[1]) {
      const previous = deps.SR.srtState || SRT_INITIAL_STATE;
      const next = srtTransition(previous, event);
      deps.SR.srtState = next;
      if (next.name === 'countIn' && previous.name !== 'countIn') {
          deps.srtCountInEpoch = deps.srtOperationEpoch;
          deps.srtCountInAttemptId = next.attemptId;
      }
      else if (next.name !== 'countIn') {
          deps.srtCountInEpoch = 0;
          deps.srtCountInAttemptId = null;
      }
      if (srtGeneratedSelected() && next.mode === 'firstSight' && (next.name === 'abandoned' || next.name === 'interrupted')) {
          const message = deps.t('rd_srt_error_already_exposed');
          srtNotice(message);
          const verdict = byId('rd-verdict');
          verdict.className = 'verdict neutral';
          verdict.textContent = message;
      }
      if (deps.SR.piece && (previous.name !== next.name || previous.mode !== next.mode))
          srDraw();
      deps.rdnNavUi();
      if (next.name === 'saved' && previous.name !== 'saved')
          deps.rdnAutoAfterSave();
  }
    function srtPreviewUi(show: boolean) {
      const panel = maybeById('rd-srt-preview');
      if (panel)
          panel.hidden = !show;
      if (show) {
          const operation = deps.srtOperationEpoch;
          requestAnimationFrame(() => {
              if (operation !== deps.srtOperationEpoch || panel?.hidden)
                  return;
              const start = maybeById('rd-srt-start');
              if (!start)
                  return;
              start.focus({ preventScroll: true });
              start.scrollIntoView({ block: 'center', behavior: 'auto' });
          });
      }
  }
    function srtPendingUi(show: boolean) {
      const panel = maybeById('rd-srt-pending');
      if (panel)
          panel.hidden = !show;
  }
    function srtNotice(text: string | null) {
      const notice = maybeById('rd-srt-notice');
      if (!notice)
          return;
      notice.hidden = !text;
      notice.textContent = text ?? '';
  }
    function srtLedgerFailureMessage(reason: SrtLedgerFailureReason, context: SrtLedgerFailureContext = 'start') {
      if (reason === 'storage')
          return deps.t(context === 'pending' ? 'rd_srt_error_pending_storage' : 'rd_srt_error_storage');
      return deps.t('rd_srt_error_' + reason);
  }
    function srtScoreConcealed() {
      // A level piece is on the page from the moment it opens: there is no timed look, its first attempt is its first sight.
      if (deps.SR.lvPiece && srtGeneratedSelected())
          return false;
      if (deps.srtExposurePromise?.fingerprint === deps.SR.srtFingerprint)
          return true;
      const state = deps.SR.srtState;
      return srtGeneratedSelected() && deps.SR.modeSel === 'assess' && state?.mode === 'firstSight' &&
          (['idle', 'preparing', 'claiming'].includes(state.name) ||
              state.name === 'blocked' && state.reason !== 'already_exposed');
  }
    function srtProgressLedgerUpdate(operation: SightReadingLedgerOperation) {
      return srtLedgerUpdate(localStorage, operation, () => !shell.storeBlocked() && !deps.storeBackupBlocked());
  }
    function srtRecordExposure(reason: string, kind: 'exposure' | 'listen' = 'exposure') {
      const fingerprint = deps.SR.srtFingerprint;
      if (!fingerprint)
          return null;
      const ledger = srtReadLedger(localStorage);
      if (ledger.exposures[fingerprint])
          return Promise.resolve({ ok: true, ledger } satisfies SightReadingLedgerResult);
      const progressGeneration = shell.progressGeneration();
      const record = (generation: string) => kind === 'listen'
          ? srtProgressLedgerUpdate({ type: 'recordListen', fingerprint, generation })
          : srtProgressLedgerUpdate({ type: 'recordExposure', fingerprint, reason, generation });
      const operation = record(ledger.generation);
      const settled = operation.then(result => {
          if (result.ok || result.reason !== 'stale_generation')
              return result;
          // An internal ledger reset can race a Learn reveal. A full progress reset
          // also advances ptt-v3, and writes queued before it must stay discarded.
          try {
              if (shell.savedGeneration() !== progressGeneration)
                  return result;
              return record(srtReadLedger(localStorage).generation);
          }
          catch (_) {
              return result;
          }
      });
      deps.srtExposurePromise = { fingerprint, promise: settled };
      void settled.then((result) => {
          if (deps.srtExposurePromise?.promise === settled)
              deps.srtExposurePromise = null;
          if (!result.ok) {
              if (deps.SR.srtFingerprint === fingerprint)
                  srtNotice(srtLedgerFailureMessage(result.reason));
              return;
          }
          if (deps.SR.srtFingerprint === fingerprint)
              srDraw();
      });
      return operation;
  }
    function srtExposeForPractice(reason: string, kind: 'exposure' | 'listen' = 'exposure', redraw = true) {
      if ((!deps.SR.srtPiece && !deps.SR.lvPiece) || !deps.SR.srtFingerprint)
          return;
      const state = deps.SR.srtState;
      if (state?.mode === 'firstSight' &&
          (state.name === 'idle' || state.name === 'blocked' && state.reason !== 'already_exposed')) {
          deps.SR.srtState = { ...state, mode: 'practice', attemptId: null, fingerprint: deps.SR.srtFingerprint };
          if (redraw)
              srDraw();
      }
      void srtRecordExposure(reason, kind);
  }
    function srtConsumeOnLearnReveal() {
      if (deps.SR.modeSel === 'assess' || !srtGeneratedSelected() || !deps.SR.srtFingerprint)
          return false;
      const state = deps.SR.srtState;
      if (state?.mode !== 'firstSight' ||
          !(state.name === 'idle' || state.name === 'blocked' && state.reason !== 'already_exposed'))
          return false;
      srtExposeForPractice('learn', 'exposure', false);
      return true;
  }
    function srtClearPreview() {
      window.clearInterval(deps.SR.srtPreviewTimer);
      deps.SR.srtPreviewTimer = 0;
      deps.SR.srtCountdown = 0;
      srtPreviewUi(false);
  }
    function srtBeginOperation() {
      deps.srtOperationEpoch++;
      srtClearPreview();
      deps.srtCountInEpoch = 0;
      deps.srtCountInAttemptId = null;
      return deps.srtOperationEpoch;
  }
    function srtOperationStillCurrent(epoch: number, state: SightReadingState | undefined, attemptId: string | null = state?.attemptId ?? null) {
      return epoch === deps.srtOperationEpoch && state !== undefined && deps.SR.srtState === state &&
          (attemptId === null || deps.SR.srtState?.attemptId === attemptId);
  }
    function srtCaptureAttempt(state: SightReadingState | undefined): SrtAttemptCleanup | null {
      if (!state?.attemptId || !deps.SR.srtOwnerTabId || (!deps.SR.srtPiece && !deps.SR.lvPiece) || !deps.SR.srtFingerprint)
          return null;
      return {
          attemptId: state.attemptId,
          ownerTabId: deps.SR.srtOwnerTabId,
          generation: srtReadLedger(localStorage).generation,
          lease: deps.SR.srtLease ?? null,
          mixedInput: deps.SR.srtPendingAttempt?.mixedInput ?? deps.srtRecorder?.mixedInput ?? false,
      };
  }
    function srtReleaseLease(lease: SightReadingAttemptLease | null) {
      if (!lease)
          return;
      if (deps.srtReleasedLeases.has(lease))
          return;
      deps.srtReleasedLeases.add(lease);
      lease.release();
      if (deps.SR.srtLease === lease)
          deps.SR.srtLease = null;
  }
    function srtPendingSaveProtected() {
      const state = deps.SR.srtState;
      return state?.name === 'pendingSave' ||
          state?.name === 'completed' && deps.SR.srtPendingAttempt?.attemptId === state.attemptId;
  }
    function srtIsAbandoned() {
      return deps.SR.srtState?.name === 'abandoned';
  }
    function srtAttemptStatus(attemptId: string): SightReadingAttempt['status'] | null {
      return srtReadLedger(localStorage).attempts[attemptId]?.status ?? null;
  }
    function srtCleanupKey(attemptId: string, status: 'abandoned' | 'interrupted') {
      return attemptId + ':' + status;
  }
    function srtEnsureAbandoned(attempt: SrtAttemptCleanup, status: 'abandoned' | 'interrupted') {
      const key = srtCleanupKey(attempt.attemptId, status);
      const existing = deps.srtCleanupPromises.get(key);
      if (existing)
          return existing;
      const cleanup = srtProgressLedgerUpdate({
          type: 'abandonAttempt',
          attemptId: attempt.attemptId,
          ownerTabId: attempt.ownerTabId,
          generation: attempt.generation,
          status,
          mixedInput: attempt.mixedInput,
      });
      deps.srtCleanupPromises.set(key, cleanup);
      void cleanup.then(() => {
          if (deps.srtCleanupPromises.get(key) === cleanup)
              deps.srtCleanupPromises.delete(key);
      });
      return cleanup;
  }
    function srtClearPendingAttempt(attemptId: string) {
      if (deps.SR.srtPendingAttempt?.attemptId === attemptId)
          deps.SR.srtPendingAttempt = null;
  }
    async function srtRetryPendingSave() {
      const attempt = deps.SR.srtPendingAttempt;
      if (!attempt)
          return;
      const epoch = deps.srtOperationEpoch;
      const state = deps.SR.srtState;
      const lease = deps.SR.srtLease ?? null;
      const result = await srtProgressLedgerUpdate({ type: 'finishAttempt', attempt, generation: attempt.generation });
      if (!srtOperationStillCurrent(epoch, state, attempt.attemptId)) {
          if (result.ok || srtAttemptStatus(attempt.attemptId)) {
              srtClearPendingAttempt(attempt.attemptId);
              if (deps.srtClaimIssuedAttemptId === attempt.attemptId)
                  deps.srtClaimIssuedAttemptId = null;
              if (deps.srtClaimDurableAttemptId === attempt.attemptId)
                  deps.srtClaimDurableAttemptId = null;
              srtReleaseLease(lease);
          }
          else {
              const cleanup = await srtEnsureAbandoned({
                  attemptId: attempt.attemptId,
                  ownerTabId: attempt.ownerTabId,
                  generation: attempt.generation,
                  lease,
                  mixedInput: attempt.mixedInput,
              }, 'abandoned');
              if (cleanup.ok) {
                  srtClearPendingAttempt(attempt.attemptId);
                  if (deps.srtClaimIssuedAttemptId === attempt.attemptId)
                      deps.srtClaimIssuedAttemptId = null;
                  if (deps.srtClaimDurableAttemptId === attempt.attemptId)
                      deps.srtClaimDurableAttemptId = null;
                  srtReleaseLease(lease);
              }
          }
          return;
      }
      if (result.ok) {
          srtSetState({ type: 'saved' });
          deps.storeDaily();
          srtClearPendingAttempt(attempt.attemptId);
          srtReleaseLease(lease);
          srtPendingUi(false);
          srtNotice(null);
          srRenderAssessResult();
      }
      else {
          srtPendingUi(true);
          srtNotice(srtLedgerFailureMessage(result.reason, 'pending'));
      }
  }
    async function srtContinueWithoutSave() {
      if (deps.SR.srtState?.name !== 'pendingSave')
          return;
      const result = await srtAbandonClaim('abandoned', false);
      void result;
  }
    function srtAttemptId() {
      return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `attempt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
    async function srtAbandonClaim(status: 'abandoned' | 'interrupted' = 'abandoned', transitionBeforeLedger = true) {
      const state = deps.SR.srtState;
      const preClaimAttempt = state?.mode === 'firstSight' &&
          !!state.attemptId &&
          (state.name === 'preparing' || state.name === 'claiming') &&
          (deps.srtClaimIssuedAttemptId !== state.attemptId ||
              deps.SR.modeSel === 'learn' && deps.srtClaimDurableAttemptId !== state.attemptId);
      if (preClaimAttempt) {
          const fingerprint = deps.SR.srtFingerprint ?? null;
          srtBeginOperation();
          deps.SR.srtPendingAttempt = null;
          deps.SR.srtState = { ...SRT_INITIAL_STATE, fingerprint };
          return { ok: true, ledger: srtReadLedger(localStorage) } satisfies SightReadingLedgerResult;
      }
      const attempt = srtCaptureAttempt(state);
      const lease = deps.SR.srtLease ?? null;
      const operation = srtBeginOperation();
      let expectedState = deps.SR.srtState;
      if (transitionBeforeLedger && state && (state.name === 'preparing' || state.name === 'preview' || state.name === 'claiming' || state.name === 'countIn' || state.name === 'playing'))
          srtSetState({ type: status === 'interrupted' ? 'interrupt' : 'abandon' });
      expectedState = deps.SR.srtState;
      const result = attempt ? await srtEnsureAbandoned(attempt, status) : { ok: true, ledger: srtReadLedger(localStorage) } satisfies SightReadingLedgerResult;
      const terminalStatus = attempt ? srtAttemptStatus(attempt.attemptId) : null;
      const stillCurrent = srtOperationStillCurrent(operation, expectedState, attempt?.attemptId ?? expectedState?.attemptId ?? null);
      if (!stillCurrent) {
          if (result.ok || terminalStatus) {
              if (attempt)
                  srtClearPendingAttempt(attempt.attemptId);
              if (attempt && deps.srtClaimIssuedAttemptId === attempt.attemptId)
                  deps.srtClaimIssuedAttemptId = null;
              if (attempt && deps.srtClaimDurableAttemptId === attempt.attemptId)
                  deps.srtClaimDurableAttemptId = null;
              srtReleaseLease(lease);
          }
          return result;
      }
      if (!transitionBeforeLedger && state?.name === 'pendingSave') {
          if (result.ok)
              srtSetState({ type: 'abandon' });
          else if (terminalStatus === 'completed')
              srtSetState({ type: 'saved' });
          else if (terminalStatus === 'abandoned')
              srtSetState({ type: 'abandon' });
      }
      if (result.ok || terminalStatus) {
          if (attempt)
              srtClearPendingAttempt(attempt.attemptId);
          if (attempt && deps.srtClaimIssuedAttemptId === attempt.attemptId)
              deps.srtClaimIssuedAttemptId = null;
          if (attempt && deps.srtClaimDurableAttemptId === attempt.attemptId)
              deps.srtClaimDurableAttemptId = null;
          srtReleaseLease(lease);
          if (state?.name === 'pendingSave') {
              srtPendingUi(false);
              srtNotice(null);
          }
      }
      else if (!transitionBeforeLedger && state?.name === 'pendingSave') {
          srtPendingUi(true);
          srtNotice(srtLedgerFailureMessage(result.reason, 'pending'));
      }
      return result;
  }
    function srtCancelAttempt(status: 'abandoned' | 'interrupted' = 'interrupted') {
      const state = deps.SR.srtState;
      if (srtPendingSaveProtected())
          return;
      if (state && (state.name === 'preparing' || state.name === 'preview' || state.name === 'claiming' || state.name === 'countIn' || state.name === 'playing')) {
          void srtAbandonClaim(status);
          return;
      }
      srtBeginOperation();
  }
    function srtNavigateAttempt() {
      const state = deps.SR.srtState;
      if (state?.name === 'pendingSave') {
          void srtAbandonClaim('abandoned', false);
          return;
      }
      if (srtPendingSaveProtected())
          return;
      if (state && (state.name === 'preparing' || state.name === 'preview' || state.name === 'claiming' || state.name === 'countIn' || state.name === 'playing')) {
          void srtAbandonClaim(state.name === 'playing' ? 'interrupted' : 'abandoned');
          return;
      }
      srtBeginOperation();
  }
    function srtStartPractice() {
      if (!deps.SR.srtFingerprint)
          return;
      const operation = srtBeginOperation();
      const fingerprint = deps.SR.srtFingerprint;
      deps.SR.srtState = SRT_INITIAL_STATE;
      srtSetState({ type: 'prepare', mode: 'practice', fingerprint });
      srtSetState({ type: 'startPreview' });
      void srAssessStart(operation);
  }
    async function srtStartFirstSight() {
      if ((!deps.SR.srtPiece && !deps.SR.lvPiece) || !deps.SR.srtFingerprint)
          return;
      if (deps.SR.srtState?.name !== 'idle' || deps.SR.srtState.mode !== 'firstSight')
          return;
      const operation = srtBeginOperation();
      const claimedFingerprint = deps.SR.srtFingerprint;
      const pendingExposure = deps.srtExposurePromise?.fingerprint === claimedFingerprint ? deps.srtExposurePromise.promise : null;
      const idleState = deps.SR.srtState;
      if (pendingExposure) {
          const result = await pendingExposure;
          if (!srtOperationStillCurrent(operation, idleState, null))
              return;
          if (!result.ok)
              srtNotice(srtLedgerFailureMessage(result.reason));
          else
              srtNotice(deps.t('rd_srt_error_already_exposed'));
          srtStartPractice();
          return;
      }
      const ledgerStatus = srtLedgerReadStatus(localStorage);
      if (shell.storeBlocked() || ledgerStatus === 'unsupported') {
          srtStartPractice();
          srtNotice(deps.t('rd_srt_ledger_unsupported'));
          return;
      }
      const ledger = srtReadLedger(localStorage);
      if (ledger.exposures[deps.SR.srtFingerprint]) {
          srtNotice(deps.t('rd_srt_error_already_exposed'));
          srtStartPractice();
          return;
      }
      if (!navigator.locks || typeof navigator.locks.request !== 'function') {
          srtStartPractice();
          srtNotice(deps.t('rd_srt_no_locks'));
          return;
      }
      const context = deps.ensureAudio();
      if (!context) {
          deps.audioLockCheck();
          return;
      }
      if (context.state !== 'running') {
          const ready = await deps.timedAudioReady(context);
          if (!srtOperationStillCurrent(operation, idleState, null) || !ready)
              return;
      }
      srtNotice(null);
      srtSetState({ type: 'prepare', mode: 'firstSight', fingerprint: deps.SR.srtFingerprint, attemptId: srtAttemptId() });
      srtSetState({ type: 'claim' });
      const attemptId = deps.SR.srtState?.attemptId;
      if (!attemptId)
          return;
      const lease = srtAcquireAttemptLease(attemptId);
      if (!lease) {
          byId('rd-verdict').textContent = deps.t('rd_srt_no_locks');
          return;
      }
      deps.SR.srtLease = lease;
      deps.srtClaimIssuedAttemptId = null;
      deps.srtClaimDurableAttemptId = null;
      await lease.ready;
      const claimingState = deps.SR.srtState;
      if (!srtOperationStillCurrent(operation, claimingState, attemptId)) {
          srtReleaseLease(lease);
          return;
      }
      deps.srtClaimIssuedAttemptId = attemptId;
      const result = await srtProgressLedgerUpdate({
          type: 'claimExposure',
          fingerprint: deps.SR.srtFingerprint,
          attemptId,
          ownerTabId: deps.SR.srtOwnerTabId || '',
          generation: ledger.generation,
      });
      if (result.ok)
          deps.srtClaimDurableAttemptId = attemptId;
      if (!srtOperationStillCurrent(operation, claimingState, attemptId)) {
          if (result.ok) {
              const cleanup: SrtAttemptCleanup = {
                  attemptId,
                  ownerTabId: deps.SR.srtOwnerTabId || '',
                  generation: result.ledger.generation,
                  lease,
                  mixedInput: deps.srtRecorder?.mixedInput ?? false,
              };
              const cancelledByNavigation = srtIsAbandoned() || deps.SR.srtFingerprint !== claimedFingerprint;
              await srtEnsureAbandoned(cleanup, cancelledByNavigation ? 'abandoned' : 'interrupted');
              if (deps.srtClaimIssuedAttemptId === attemptId)
                  deps.srtClaimIssuedAttemptId = null;
              if (deps.srtClaimDurableAttemptId === attemptId)
                  deps.srtClaimDurableAttemptId = null;
          }
          else if (deps.srtClaimIssuedAttemptId === attemptId)
              deps.srtClaimIssuedAttemptId = null;
          if (!result.ok && deps.srtClaimDurableAttemptId === attemptId)
              deps.srtClaimDurableAttemptId = null;
          srtReleaseLease(lease);
          return;
      }
      if (!result.ok) {
          if (deps.srtClaimIssuedAttemptId === attemptId)
              deps.srtClaimIssuedAttemptId = null;
          if (deps.srtClaimDurableAttemptId === attemptId)
              deps.srtClaimDurableAttemptId = null;
          srtReleaseLease(lease);
          const retryable = result.reason === 'stale_generation' || result.reason === 'conflict' || result.reason === 'owner_mismatch';
          if (retryable) {
              deps.SR.srtState = { ...SRT_INITIAL_STATE, fingerprint: claimedFingerprint };
              deps.SR.srtPendingAttempt = null;
              srDraw();
              srtNotice(srtLedgerFailureMessage(result.reason));
              return;
          }
          if (result.reason === 'storage' || result.reason === 'quota' || result.reason === 'unsupported') {
              srtStartPractice();
              srtNotice(srtLedgerFailureMessage(result.reason));
              return;
          }
          srtSetState({ type: 'blocked', reason: result.reason });
          const message = srtLedgerFailureMessage(result.reason);
          byId('rd-verdict').textContent = message;
          if (result.reason === 'already_exposed')
              srtNotice(message);
          return;
      }
      srtSetState({ type: 'claimed' });
      srDraw();
      if (deps.SR.lvPiece) {
          // A level piece was on the page already: the claimed attempt starts at once (a count-in, or the note that started it).
          srtStartClaimedAttempt(operation);
          return;
      }
      srtPreviewUi(true);
      // The older melodies get 20 seconds to look.
      deps.SR.srtCountdown = 20;
      byId('rd-srt-countdown').textContent = deps.t('rd_srt_countdown', deps.SR.srtCountdown);
      window.clearInterval(deps.SR.srtPreviewTimer);
      const previewOperation = deps.srtOperationEpoch;
      deps.SR.srtPreviewTimer = window.setInterval(() => {
          if (previewOperation !== deps.srtOperationEpoch || deps.SR.srtState?.name !== 'preview' || deps.SR.srtState.attemptId !== attemptId) {
              srtClearPreview();
              return;
          }
          deps.SR.srtCountdown = Math.max(0, (deps.SR.srtCountdown || 0) - 1);
          byId('rd-srt-countdown').textContent = deps.t('rd_srt_countdown', deps.SR.srtCountdown);
          if (deps.SR.srtCountdown <= 0) {
              srtClearPreview();
              srtStartClaimedAttempt(previewOperation);
          }
      }, 1000);
  }
    function srtStartClaimedAttempt(operation = deps.srtOperationEpoch) {
      const state = deps.SR.srtState;
      if (operation !== deps.srtOperationEpoch || state?.name !== 'preview' || state.mode !== 'firstSight' || !state.attemptId)
          return;
      srtClearPreview();
      srtSetState({ type: 'startNow' });
      if (deps.SR.srtState?.name !== 'countIn' || deps.SR.srtState.attemptId !== state.attemptId)
          return;
      void srAssessStart(operation);
  }
    async function srtSwitchToPractice() {
      const operation = srtBeginOperation();
      const state = deps.SR.srtState;
      const attempt = srtCaptureAttempt(state);
      if (state?.name === 'preview')
          srtSetState({ type: 'abandon' });
      const result = attempt ? await srtEnsureAbandoned(attempt, 'abandoned') : { ok: true, ledger: srtReadLedger(localStorage) } satisfies SightReadingLedgerResult;
      const terminalStatus = attempt ? srtAttemptStatus(attempt.attemptId) : null;
      if (!srtOperationStillCurrent(operation, deps.SR.srtState, attempt?.attemptId ?? null)) {
          if (result.ok || terminalStatus) {
              srtClearPendingAttempt(attempt?.attemptId ?? '');
              if (attempt && deps.srtClaimIssuedAttemptId === attempt.attemptId)
                  deps.srtClaimIssuedAttemptId = null;
              if (attempt && deps.srtClaimDurableAttemptId === attempt.attemptId)
                  deps.srtClaimDurableAttemptId = null;
              srtReleaseLease(attempt?.lease ?? null);
          }
          else
              srtReleaseLease(attempt?.lease ?? null);
          return;
      }
      if (!result.ok && !terminalStatus) {
          srtReleaseLease(attempt?.lease ?? null);
          srtClearPendingAttempt(attempt?.attemptId ?? '');
          if (attempt && deps.srtClaimIssuedAttemptId === attempt.attemptId)
              deps.srtClaimIssuedAttemptId = null;
          if (attempt && deps.srtClaimDurableAttemptId === attempt.attemptId)
              deps.srtClaimDurableAttemptId = null;
          srtStartPractice();
          srtNotice(srtLedgerFailureMessage(result.reason, 'practice-switch'));
          return;
      }
      if (!result.ok && terminalStatus === 'completed') {
          srtReleaseLease(attempt?.lease ?? null);
          srtClearPendingAttempt(attempt?.attemptId ?? '');
          if (attempt && deps.srtClaimIssuedAttemptId === attempt.attemptId)
              deps.srtClaimIssuedAttemptId = null;
          if (attempt && deps.srtClaimDurableAttemptId === attempt.attemptId)
              deps.srtClaimDurableAttemptId = null;
          srtPendingUi(false);
          srtSetState({ type: 'saved' });
          srRenderAssessResult();
          return;
      }
      srtReleaseLease(attempt?.lease ?? null);
      deps.SR.srtPendingAttempt = null;
      deps.SR.srtState = SRT_INITIAL_STATE;
      srtSetState({ type: 'prepare', mode: 'practice', fingerprint: deps.SR.srtFingerprint ?? undefined });
      srtSetState({ type: 'startPreview' });
      srDraw();
      void srAssessStart(operation);
  }
    async function srAssessStart(operation?: number) {
      const srtState = deps.SR.srtState;
      if (srtGeneratedSelected() && srtState?.mode === 'firstSight' &&
          (srtState.name !== 'countIn' || !srtState.attemptId ||
              deps.srtCountInEpoch !== deps.srtOperationEpoch || deps.srtCountInAttemptId !== srtState.attemptId ||
              operation !== undefined && operation !== deps.srtOperationEpoch))
          return;
      const context = deps.ensureAudio();
      if (!context) {
          srStopAll();
          return;
      }
      const runId = ++srAssessRunId;
      deps.SR.active = true;
      if (context.state !== 'running') {
          const epoch = deps.srtOperationEpoch;
          const ready = await deps.timedAudioReady(context);
          if (!deps.SR.active || runId !== srAssessRunId || epoch !== deps.srtOperationEpoch) return;
          if (!ready) {
              srStopAll();
              return;
          }
      }
      deps.srStartStage();
      deps.rdnNavUi();
      rdWarmButtonsSync();
      deps.SR.results = {};
      deps.SR.wrongExtra = 0;
      deps.SR.srtEvaluation = null;
      deps.SR.srtResultValue = null;
      deps.SR.srtResultLevelId = null;
      deps.SR.next = null;
      deps.srCoach();
      deps.rdnResultHide();
      deps.SR.steps.forEach((s) => s.closed = false);
      srPaintAll();
      if (!deps.SR.piece)
          throw new Error('Étude: no piece selected');
      const lvPiece = srtGeneratedSelected() ? deps.SR.lvPiece ?? null : null;
      // First sight: a level piece is played at its level's tempo, an older melody at 60.
      deps.SR.bpm = deps.SR.srtState?.mode === 'firstSight' ? (lvPiece ? deps.rdnBpm(lvPiece) : 60) : +(inputById('rd-bpm').value || deps.SR.piece.bpm);
      inputById('rd-bpm').value = String(deps.SR.bpm);
      byId('rd-bpmLbl').textContent = String(deps.SR.bpm);
      const bs = 60 / deps.SR.bpm, cap = deps.SR.piece.ts[1] === 8 ? deps.SR.piece.ts[0] * 0.5 : deps.SR.piece.ts[0], ci = cap, pk = deps.SR.piece.pickup || 0;
      let act0 = context.currentTime + 0.15, perf0 = performance.now() + 150;
      // The count-in lasts one bar. A level piece clicks once per beat of its meter (so 3/8 and 6/8 count right).
      let lead = ci * bs;
      const first = lvPiece ? srFirstNotes() : null, noteStart = first ? srNoteStartTake() : null;
      if (lvPiece && noteStart && first) {
          // Started by its first note: no count-in. That note is the first onset of the piece, and the clicks go on from it.
          lead = 0;
          perf0 = noteStart.perf - first.beat * bs * 1000;
          act0 = context.currentTime - (performance.now() - perf0) / 1000;
          const from = context.currentTime + 0.03;
          srtLevelClicks(lvPiece, deps.SR.bpm).filter((c) => act0 + c.ms / 1000 > from).forEach((c) => srClick(act0 + c.ms / 1000, c.accent));
      }
      else if (lvPiece) {
          const clicks = srtLevelClicks(lvPiece, deps.SR.bpm), barMs = srtLevelDurationMs(lvPiece, deps.SR.bpm) / lvPiece.bars;
          lead = barMs / 1000;
          clicks.filter((c) => c.ms < barMs - 1e-6).forEach((c) => srClick(act0 + c.ms / 1000, c.accent));
          clicks.forEach((c) => srClick(act0 + lead + c.ms / 1000, c.accent));
      }
      else {
          for (let b = 0; b < ci; b++)
              srClick(act0 + b * bs, b === 0);
          for (let b = 0; b <= deps.SR.totalBeats + 1e-3; b++) {
              const rel = b - pk;
              srClick(act0 + (ci + b) * bs, rel >= 0 && Math.abs(rel % cap) < 1e-3);
          }
      }
      const sel = srActiveHands();
      if (sel !== 'both' && srHandsAvail() === 'both')
          deps.SR.notes.filter((n) => n.hand !== sel).forEach((n) => host.audio.previewNote(n.midi, act0 + lead + n.beat * bs, Math.max(.15, n.dur * bs * .9), 78));
      deps.SR.t0 = perf0 + lead * 1000;
      deps.SR.anyOctave = !!host.store.data().settings.anyOctave;
      deps.SR.instantFeedback = !!host.store.data().reading?.prefs?.instantFeedback;
      srInstantReset();
      if (deps.SR.instantFeedback)
          srInstantTracker = createInstantFeedbackTracker(srInstantNotes(), { anyOctave: deps.SR.anyOctave });
      deps.srtRecorder = new SightReadingRecorder({ durationMs: lvPiece ? srtLevelDurationMs(lvPiece, deps.SR.bpm) : deps.SR.totalBeats * bs * 1000 });
      // The note that started the attempt, and what was played while the first sight was being claimed, belong to it.
      if (noteStart)
          for (const ev of noteStart.events) {
              const relMs = ev.perf - deps.SR.t0;
              deps.srtRecorder.record(ev.kind, ev.midi, ev.source, ev.releaseKind, relMs);
              if (ev.kind === 'on' && deps.SR.instantFeedback)
                  srInstantHandleNote(ev.midi, relMs);
          }
      // The checklist goes out of sight but keeps its room: the score must not move under the first note.
      const checklist = maybeById('rdn-checklist');
      if (checklist)
          checklist.style.visibility = 'hidden';
      deps.SR.assessOn = false;
      if (deps.SR.srtState?.name === 'preparing')
          srtSetState({ type: 'startPreview' });
      if (deps.SR.srtState?.name === 'countIn' && noteStart)
          srtSetState({ type: 'countInDone' });
      else if (deps.SR.srtState?.name === 'countIn')
          deps.SR.timers.push(setTimeout(() => {
              if (deps.SR.active && deps.SR.srtState?.name === 'countIn')
                  srtSetState({ type: 'countInDone' });
          }, lead * 1000));
      if (!deps.SR.instantFeedback || !srInstantVerdictShown) {
          const v = byId('rd-verdict');
          v.className = 'verdict neutral';
          v.textContent = deps.t('rd_count');
      }
      byId('rd-go').textContent = deps.t('rd_stop');
      deps.SR.raf = requestAnimationFrame(srAssessLoop);
  }
    function srTol() { return Math.min(0.55, 0.3 * deps.SR.bpm / 60); }
    /* ---- a level piece starts on its first note ---- */
  /** The first notes the active hands play: their beat and their keys. */
  function srFirstNotes(): { beat: number; midis: number[] } | null {
      const sel = srActiveHands(), mine = deps.SR.notes.filter((n) => sel === 'both' || n.hand === sel);
      if (!mine.length)
          return null;
      const beat = Math.min(...mine.map((n) => n.beat));
      return { beat, midis: mine.filter((n) => Math.abs(n.beat - beat) < 1e-3).map((n) => n.midi) };
  }
    /** The key that started an attempt, when it went down, and every key event since: a first sight is claimed before the recorder exists. */
  let srNoteStart: { perf: number; receivedAt: number; events: SrNoteStartEvent[] } | null = null;
    /** No note starts an attempt before this time: a key still sounding from the last piece is not a start. */
  let srNoteArmAt = 0;
    const SR_NOTE_START_MS = 1500;
    function srNoteStartHold(ms = 600) { srNoteArmAt = performance.now() + ms; }
    /** True when a piano key may start the attempt: a level piece is waiting in Assessment and a MIDI or Bluetooth piano plays. */
  function srNoteStartArmed(source: string) {
      const family = srtInputFamily(source);
      if (family !== 'midi' && family !== 'ble')
          return false;
      if (deps.view0() !== 'read' || deps.RDN.screen !== 'player' || !deps.SR.piece || !deps.SR.lvPiece || !srtGeneratedSelected())
          return false;
      if (deps.SR.active || deps.SR.listening || deps.SR.modeSel !== 'assess' || deps.WARM.on || srtPendingSaveProtected() || performance.now() < srNoteArmAt)
          return false;
      const state = deps.SR.srtState;
      return !(state && (state.name === 'preparing' || state.name === 'claiming' || state.name === 'preview' || state.name === 'countIn' ||
          state.name === 'playing' || state.name === 'pendingSave' || state.name === 'completed' && deps.SR.srtPendingAttempt?.attemptId === state.attemptId));
  }
    /** A key went down or came up. Returns true when the event belongs to a start by the first note (it starts one, or one is being claimed). */
  function srNoteStartInput(kind: 'on' | 'off', midi: number, source: string, releaseKind: 'physical' | 'focus' | 'reset' | null) {
      const now = performance.now(), perf = inputTimeForRelease(releaseKind, now);
      const claiming = deps.SR.srtState?.name === 'preparing' || deps.SR.srtState?.name === 'claiming';
      // A pending start is kept only while its first sight is being claimed, and only while it can still keep time.
      if (srNoteStart && (!claiming || now - srNoteStart.receivedAt > SR_NOTE_START_MS))
          srNoteStart = null;
      if (srNoteStart) {
          srNoteStart.events.push({ kind, midi, source, releaseKind, perf });
          return true;
      }
      if (kind !== 'on' || !srNoteStartArmed(source))
          return false;
      const first = srFirstNotes(), anyOctave = !!host.store.data().settings.anyOctave;
      if (!first || !first.midis.some((m) => samePitch(m, midi, anyOctave)))
          return false;
      deps.rdnAutoCancel();
      srNoteStart = { perf, receivedAt: now, events: [{ kind, midi, source, releaseKind, perf }] };
      srGo();
      // Nothing started (and no first sight is being claimed): the key was only a key.
      const name = deps.SR.srtState?.name;
      if (!deps.SR.active && name !== 'preparing' && name !== 'claiming')
          srNoteStart = null;
      return true;
  }
    /** Hands the pending start by a note to the attempt that begins now (null when there is none, or it is too old to keep time by). */
  function srNoteStartTake() {
      const start = srNoteStart;
      srNoteStart = null;
      return start && performance.now() - start.receivedAt <= SR_NOTE_START_MS ? start : null;
  }
    function srAssessLoop(ts: number) {
      if (!deps.SR.active || deps.SR.modeSel !== 'assess')
          return;
      const bs = 60 / deps.SR.bpm, bNow = (ts - deps.SR.t0) / 1000 / bs;
      if (bNow >= 0 && !deps.SR.assessOn) {
          deps.SR.assessOn = true;
          if (!deps.SR.instantFeedback || !srInstantVerdictShown)
              byId('rd-verdict').textContent = deps.t('rd_play');
      }
      if (deps.SR.instantFeedback && deps.SR.assessOn)
          srInstantSweep(ts - deps.SR.t0);
      const at = srBeatPt(deps.SR.beatX, Math.max(0, Math.min(bNow, deps.SR.totalBeats)));
      srCursor(at.x, at.sy);
      if (bNow >= deps.SR.totalBeats + (0.25 / bs)) {
          srAssessFinish();
          return;
      }
      deps.SR.raf = requestAnimationFrame(srAssessLoop);
  }
    function srAssessFinish() {
      // A key played just past the end is the end of this attempt, not the start of the next.
      srNoteStartHold(1000);
      const generated = srtGeneratedSelected();
      const lvPiece = generated ? deps.SR.lvPiece ?? null : null;
      const firstSight = deps.SR.srtState?.mode === 'firstSight' && !!deps.SR.srtState.attemptId;
      const expected = lvPiece
          ? srtLevelExpected(lvPiece, { bpm: deps.SR.bpm, hand: srHandSel() })
          : generated && deps.SR.srtPiece
          ? srtBuildExpected(deps.SR.srtPiece, { bpm: deps.SR.bpm, hand: srActiveHands() as 'rh' | 'lh' })
          : deps.SR.notes.map((note): SightReadingExpected => ({
              id: String(note.nid), midi: note.midi, hand: note.hand,
              onMs: note.beat * (60000 / deps.SR.bpm), offMs: (note.beat + note.dur) * (60000 / deps.SR.bpm),
              restBeforeMs: 0, restAfterMs: 0,
          }));
      const performed = deps.srtRecorder?.finish().map((input): SightReadingPerformed => ({
          id: input.id, midi: input.midi, onMs: input.onMs, offMs: input.offMs,
      })) ?? [];
      const restWindows = lvPiece ? deps.rdnRestWindows(lvPiece, deps.SR.bpm, srHandSel()) : generated && deps.SR.srtPiece ? deps.SR.srtPiece.events
          .filter((event) => event.pitches.length === 0)
          .map((event) => ({ startMs: event.onsetTick * 60000 / deps.SR.bpm / 480, endMs: (event.onsetTick + event.durationTick) * 60000 / deps.SR.bpm / 480 })) : [];
      // A level piece allows 120 ms between the notes of one beat (two hands rarely land closer); the old path keeps 60.
      const evaluated = srtEvaluate(expected, performed, { restWindows, anyOctave: !!deps.SR.anyOctave, ...(lvPiece ? { chordWindowMs: deps.RDN_CHORD_WINDOW_MS } : {}) });
      if (evaluated) {
          const renderedNotes = deps.SR.notes.filter((note) => srActiveHands() === 'both' || note.hand === srActiveHands());
          // A level piece lists the right hand first and may start both hands together: its results find their notes by id.
          const idMap = lvPiece ? deps.rdnDrawnIds(lvPiece, expected) : null;
          evaluated.noteResults.forEach((result, index) => {
              const nid = idMap ? idMap.get(result.expectedId) : renderedNotes[index]?.nid ?? Number(result.expectedId);
              if (nid === undefined)
                  return;
              deps.SR.results[nid] = result.classification === 'good' || result.classification === 'near'
                  ? result.classification
                  : 'bad';
          });
          deps.SR.wrongExtra = evaluated.FP;
      }
      const totalN = expected.length;
      const good = evaluated ? evaluated.G : Object.values(deps.SR.results).filter((r) => r === 'good').length;
      const pct = evaluated?.score == null ? (totalN ? Math.round(100 * good / totalN) : 0) : Math.round(evaluated.score);
      deps.SR.next = deps.srNextAssess(pct);
      srStopAll(true, true);
      srtSetState({ type: 'finish' });
      deps.SR.srtEvaluation = evaluated;
      deps.SR.srtResultValue = pct;
      deps.SR.srtResultLevelId = deps.SR.piece?.gen ?? null;
      if (deps.SR.piece?.gen)
          deps.rdSightDone('assess', pct);
      srRenderAssessResult();
      if (lvPiece && evaluated && evaluated.score != null) {
          deps.rdnRecord(pct, deps.rdnStars(evaluated.stars), firstSight);
          deps.rdnResultShow(true);
      }
      if (evaluated && generated && deps.SR.srtState?.attemptId && deps.SR.srtFingerprint && deps.SR.srtOwnerTabId) {
          const attempt: SightReadingAttempt = {
              ...evaluated,
              status: 'completed',
              attemptId: deps.SR.srtState.attemptId,
              fingerprint: deps.SR.srtFingerprint,
              ownerTabId: deps.SR.srtOwnerTabId,
              generation: srtReadLedger(localStorage).generation,
              finishedAt: Date.now(),
              mixedInput: deps.srtRecorder?.mixedInput ?? false,
          };
          deps.SR.srtPendingAttempt = attempt;
          deps.rdnNavUi();
          const saveOperation = deps.srtOperationEpoch;
          const completedState = deps.SR.srtState;
          const saveLease = deps.SR.srtLease ?? null;
          void srtProgressLedgerUpdate({ type: 'finishAttempt', attempt, generation: attempt.generation }).then(async (result) => {
              if (!srtOperationStillCurrent(saveOperation, completedState, attempt.attemptId)) {
                  if (result.ok || srtAttemptStatus(attempt.attemptId)) {
                      srtClearPendingAttempt(attempt.attemptId);
                      if (deps.srtClaimIssuedAttemptId === attempt.attemptId)
                          deps.srtClaimIssuedAttemptId = null;
                      srtReleaseLease(saveLease);
                  }
                  else {
                      const cleanup = await srtEnsureAbandoned({
                          attemptId: attempt.attemptId,
                          ownerTabId: attempt.ownerTabId,
                          generation: attempt.generation,
                          lease: saveLease,
                          mixedInput: attempt.mixedInput,
                      }, 'abandoned');
                      if (cleanup.ok) {
                          srtClearPendingAttempt(attempt.attemptId);
                          if (deps.srtClaimIssuedAttemptId === attempt.attemptId)
                              deps.srtClaimIssuedAttemptId = null;
                          srtReleaseLease(saveLease);
                      }
                  }
                  return;
              }
              if (result.ok) {
                  srtSetState({ type: 'saved' });
                  deps.storeDaily();
                  srtClearPendingAttempt(attempt.attemptId);
                  if (deps.srtClaimIssuedAttemptId === attempt.attemptId)
                      deps.srtClaimIssuedAttemptId = null;
                  srtReleaseLease(saveLease);
                  srtPendingUi(false);
              } else {
                  srtSetState({ type: 'saveFailed' });
                  srtPendingUi(true);
                  srtNotice(srtLedgerFailureMessage(result.reason, 'pending'));
                  srRenderAssessResult();
              }
          });
      }
      srPaintAll();
      deps.srtRecorder = null;
      deps.markReadDoneToday();
      deps.touchDay();
      deps.saveAll();
  }
    function srRenderAssessResult() {
      const evaluated = deps.SR.srtEvaluation;
      if (!evaluated)
          return;
      const pct = deps.SR.srtResultValue ?? (evaluated.score == null ? 0 : Math.round(evaluated.score));
      const stars = evaluated.stars;
      const v = byId('rd-verdict');
      v.className = 'verdict ' + (stars >= 2 ? 'good' : stars ? 'neutral' : 'bad');
      const firstSightResult = srtGeneratedSelected() && deps.SR.srtState?.mode === 'firstSight' && deps.SR.srtState.attemptId !== null;
      const practiceResult = srtGeneratedSelected() && deps.SR.srtState?.mode === 'practice';
      const modeLabel = firstSightResult ? deps.t('rd_srt_first_sight') : practiceResult ? deps.t('rd_srt_practice_badge') : '';
      const modeSuffix = modeLabel ? ' · ' + modeLabel : '';
      let text = deps.t('rd_score', pct) + '  ' + '★'.repeat(stars) + '☆'.repeat(3 - stars) + modeSuffix +
          ' · ' + deps.t('rd_srt_summary', Math.round(evaluated.pitchF1 ?? 0), evaluated.TP, evaluated.N, evaluated.FP, Math.round(evaluated.rhythmAcc ?? 0), Math.round(evaluated.meanOffsetMs ?? 0));
      if (deps.SR.wrongExtra)
          text += '  ·  ' + deps.t('rd_extra', deps.SR.wrongExtra);
      if (deps.SR.srtState?.name === 'pendingSave')
          text += ' · ' + deps.t('rd_srt_unsaved');
      v.textContent = text;
  }
    function srKeyInput(m: number) {
      if (!deps.SR.active)
          return;
      if (deps.SR.modeSel === 'learn') {
          const st = deps.SR.steps[deps.SR.stepIdx];
          if (!st)
              return;
          const need = st.notes.find((n: { nid: number; midi: number; }) => !deps.SR.hit.has(n.nid) && samePitch(n.midi, m, deps.SR.anyOctave));
          if (need) {
              deps.SR.hit.add(need.nid);
              deps.SR.results[need.nid] = 'good';
              if (st.notes.every((n: { nid: number; }) => deps.SR.hit.has(n.nid))) {
                  const next = deps.SR.steps[deps.SR.stepIdx + 1];
                  srPlayGap(st.beat, next ? next.beat : 1e9);
                  deps.SR.stepIdx++;
                  deps.SR.hit.clear();
                  if (deps.SR.stepIdx >= deps.SR.steps.length) {
                      srPaintAll();
                      srLearnFinish();
                      return;
                  }
                  srCount();
              }
              srPaintAll();
              srTargets();
              srScrollStep();
          }
          else {
              deps.SR.mistakes++;
              deps.srSlipNote(st, m);
              deps.kbState(m, 'bad', true);
              deps.SR.timers.push(setTimeout(() => { const el = shell.keyEl.get(deps.foldToView(m)); if (el && el.dataset.s === 'bad')
                  deps.kbState(m, null, true); srTargets(); }, 320));
              srCount();
          }
      }
  }
    function srListen() {
      if (!deps.SR.piece)
          return;
      if (srtPendingSaveProtected())
          return;
      srtCancelAttempt('interrupted');
      if (deps.SR.listening) {
          srStopAll(true, true);
          return;
      }
      if (srtGeneratedSelected() && deps.SR.srtFingerprint)
          srtExposeForPractice('listen', 'listen');
      deps.ensureAudio();
      srStopAll(true, true);
      deps.SR.bpm = +(inputById('rd-bpm').value || deps.SR.piece.bpm);
      inputById('rd-bpm').value = String(deps.SR.bpm);
      byId('rd-bpmLbl').textContent = String(deps.SR.bpm);
      if (!shell.audioEngine.context)
          return;
      const bs = 60 / deps.SR.bpm, act0 = shell.audioEngine.context.currentTime + 0.1, perf0 = performance.now() + 100;
      deps.SR.listening = true;
      byId('rd-listen').textContent = deps.t('rd_stop');
      rdWarmButtonsSync();
      const follow = () => { if (!deps.SR.listening)
          return; const b = (performance.now() - perf0) / 1000 / bs; if (b >= 0) {
          const at = srBeatPt(deps.SR.beatX, Math.min(b, deps.SR.totalBeats));
          srCursor(at.x, at.sy);
      } deps.SR.raf = requestAnimationFrame(follow); };
      deps.SR.raf = requestAnimationFrame(follow);
      deps.SR.timers.push(setTimeout(() => srStopAll(true), deps.SR.totalBeats * bs * 1000 + 400));
      deps.SR.notes.forEach((n) => {
          host.audio.previewNote(n.midi, act0 + n.beat * bs, Math.max(.15, n.dur * bs * .92), n.hand === 'lh' ? 80 : 96);
          deps.SR.timers.push(setTimeout(() => {
              const svg = srSvg(), g = svg && svg.querySelector('.ss-n[data-nid="' + n.nid + '"]');
              if (!(g instanceof SVGElement))
                  return;
              const prev = g.getAttribute('data-s');
              g.dataset.s = 'now';
              deps.SR.timers.push(setTimeout(() => { if (g.dataset.s === 'now') {
                  if (prev)
                      g.dataset.s = prev;
                  else
                      g.removeAttribute('data-s');
              } }, Math.max(200, n.dur * bs * 900)));
          }, Math.max(0, (perf0 - performance.now()) + n.beat * bs * 1000)));
      });
  }
    function srGo() {
      if (!deps.SR.piece)
          return;
      const srtState = deps.SR.srtState;
      if (srtState && (srtState.name === 'preparing' || srtState.name === 'claiming' || srtState.name === 'preview' ||
          srtState.name === 'pendingSave' || srtState.name === 'completed' && deps.SR.srtPendingAttempt?.attemptId === srtState.attemptId))
          return;
      if (deps.SR.active) {
          srStopAll();
          byId('rd-verdict').textContent = '';
          return;
      }
      if (shell.scoreFocus.owner !== 'read') shell.scoreFocus.readOverride = null;
      srStopAll();
      deps.ensureAudio();
      deps.SR.bpm = +(inputById('rd-bpm').value || deps.SR.piece.bpm);
      if (deps.SR.modeSel === 'learn')
          srLearnStart();
      else if (srtGeneratedSelected() && deps.SR.lvPiece && deps.SR.srtState?.mode === 'firstSight' && deps.SR.srtState.name === 'idle' && srHandSel() !== 'both') {
          // A level piece's first sight is played with both hands: one hand is practice, with no first-sight claim.
          srtExposeForPractice('hands');
          srtStartPractice();
      }
      else if (srtGeneratedSelected() && deps.SR.srtState?.mode === 'firstSight' && deps.SR.srtState.name === 'idle')
          void srtStartFirstSight();
      else if (srtGeneratedSelected()) {
          const state = deps.SR.srtState;
          if (state?.name === 'pendingSave' || state?.name === 'preview' || state?.name === 'claiming' || state?.name === 'preparing')
              return;
          if (deps.SR.modeSel === 'assess' && (state?.mode === 'practice' || state?.name === 'completed' || state?.name === 'saved' ||
              state?.name === 'abandoned' || state?.name === 'interrupted'))
              srtNotice(deps.t('rd_srt_error_already_exposed'));
          if (state?.name === 'blocked' && state.mode === 'firstSight' && state.reason !== 'already_exposed')
              srtExposeForPractice('practice');
          if (state?.mode === 'practice' || state?.name === 'completed' || state?.name === 'saved' ||
              state?.name === 'abandoned' || state?.name === 'interrupted' || state?.name === 'blocked' ||
              state?.mode === 'firstSight')
              srtStartPractice();
          else
              return;
      }
      else
          void srAssessStart();
  }
    function rdCurrentKeyInfo(): RdKeyInfo | null {
      if (deps.SR.lvPiece) {
          const rk = deps.SR.lvPiece.key;
          const majorPc = srKeyName(rk.keyN);
          const minor = rk.mode === 'minor';
          const tonicPc = minor ? (majorPc + 9) % 12 : majorPc;
          return { tonicPc, minor, flat: rk.keyN < 0, keyN: rk.keyN };
      }
      if (deps.SR.piece) {
          const n = deps.SR.piece.keyN || 0;
          const majorPc = srKeyName(n);
          const minor = !!deps.SR.piece.minor;
          const tonicPc = minor ? (majorPc + 9) % 12 : majorPc;
          return { tonicPc, minor, flat: n < 0, keyN: n };
      }
      return null;
  }
    function rdWarmButtonsSync() {
      const info = rdCurrentKeyInfo();
      const show = !!info;
      const busy = deps.SR.active || deps.SR.listening || srtPendingSaveProtected();
      const keyLabel = info ? deps.t(info.minor ? 'key_minor' : 'key_major', deps.pcName(info.tonicPc, info.flat)) : '';
      const tonicBtn = maybeById('rd-warm-tonic');
      const scaleBtn = maybeById('rd-warm-scale');
      if (tonicBtn) {
          tonicBtn.hidden = !show;
          if (tonicBtn instanceof HTMLButtonElement)
              tonicBtn.disabled = !show || busy;
          tonicBtn.title = keyLabel;
          tonicBtn.setAttribute('aria-label', keyLabel ? `${deps.t('rd_warm_tonic')} — ${keyLabel}` : deps.t('rd_warm_tonic'));
      }
      if (scaleBtn) {
          scaleBtn.hidden = !show;
          if (scaleBtn instanceof HTMLButtonElement)
              scaleBtn.disabled = !show || busy;
          scaleBtn.title = keyLabel;
          scaleBtn.setAttribute('aria-label', keyLabel ? `${deps.t('rd_warm_scale')} — ${keyLabel}` : deps.t('rd_warm_scale'));
      }
  }
    function rdWarmPlayTonic() {
      const info = rdCurrentKeyInfo();
      if (!info || deps.SR.active || deps.SR.listening || srtPendingSaveProtected())
          return;
      deps.ensureAudio();
      if (!shell.audioEngine.context)
          return;
      deps.stopPreviews();
      const base = info.tonicPc >= 7 ? 48 + info.tonicPc : 60 + info.tonicPc;
      const t0 = shell.audioEngine.context.currentTime + 0.04;
      host.audio.previewNote(base, t0, 0.34, 88);
      host.audio.previewNote(base + 7, t0 + 0.24, 0.34, 84);
      host.audio.previewNote(base + 12, t0 + 0.48, 0.56, 92);
  }
    function rdWarmPracticeScale() {
      const info = rdCurrentKeyInfo();
      if (!info || deps.SR.active || deps.SR.listening || srtPendingSaveProtected())
          return;
      const key = String(info.tonicPc);
      const techKind: TechniqueKind = info.minor ? 'naturalMinor' : 'major';
      deps.withPractice((p) => {
          p.setTopic(TECHNIQUE_TOPIC);
          p.setKey(key);
          host.nav.show('practice');
          p.startSession({ cat: TECHNIQUE_TOPIC, mode: 'play', key, techKind, techOctaves: 1 });
      });
  }
    function srMeta() {
      const p = deps.SR.piece, titleEl = maybeById('rd-gen-title');
      rdWarmButtonsSync();
      if (!p) {
          byId('rd-meta').textContent = '';
          if (titleEl)
              titleEl.textContent = '';
          return;
      }
      const n = p.keyN || 0;
      const keyPc = p.minor ? ((srKeyName(n) + 9) % 12) : srKeyName(n), key = deps.t(p.minor ? 'key_minor' : 'key_major', deps.pcName(keyPc, n < 0));
      // A level piece never names its key here: in mixed keys, reading the signature is part of the task.
      const lvHead = deps.SR.lvPiece && srtGeneratedSelected() ? deps.rdnHeadText() : null;
      const metaText = lvHead ? lvHead.sub + ' · ' + p.ts[0] + '/' + p.ts[1] : (p.gen ? deps.t('rdx_sr_meta', key, p.bpm) : key) + ' · ' + p.ts[0] + '/' + p.ts[1];
      byId('rd-meta').textContent = metaText;
      if (titleEl)
          titleEl.textContent = deps.srPieceTitle(p);
      const tEl = maybeById('rd-stage-title'), sEl = maybeById('rd-stage-sub');
      if (tEl)
          tEl.textContent = deps.srPieceTitle(p);
      if (sEl)
          sEl.textContent = metaText;
  }
    // Before the first melody the tab offers only the generator (and a way to the built-in pieces).
  function srEmptyUi() {
      const none = !deps.SR.piece;
      buttonById('rd-go').disabled = none;
      buttonById('rd-listen').disabled = none;
      rdWarmButtonsSync();
      const empty = maybeById('rd-empty');
      if (empty)
          empty.hidden = !none;
      deps.syncMobileStartBars();
  }
    // Shows the generated sight-reading melody (`id` is its id); a result waiting to be saved keeps the current one.
  function srSelectPiece(id: string) {
      if (srtPendingSaveProtected() || !deps.SR.gen || id !== deps.SR.gen.id)
          return;
      if (!deps.SR.srtPiece && deps.RD.L && deps.isRdSightLevel(deps.RD.L)) {
          deps.rdSightStart(deps.SR.modeSel === 'assess' ? 'test' : 'practice');
          return;
      }
      srShowPiece(deps.SR.gen);
  }
    // Draws a piece in the engine: the generated melody, or a fixture piece loaded through the test surface.
  function srShowPiece(piece: SrPiece) {
      if (srtPendingSaveProtected())
          return;
      srStopAll(undefined, false, 'navigate');
      deps.SR.srtEvaluation = null;
      deps.SR.srtResultValue = null;
      deps.SR.srtResultLevelId = null;
      deps.SR.piece = piece;
      if (!deps.SR.gen) {
          deps.SR.srtPiece = null;
          deps.SR.lvPiece = null;
          deps.SR.srtFingerprint = null;
          deps.SR.srtState = SRT_INITIAL_STATE;
          deps.SR.srtPendingAttempt = null;
      }
      deps.SR.bpm = piece.bpm;
      const bp = inputById('rd-bpm');
      bp.value = String(piece.bpm);
      byId('rd-bpmLbl').textContent = String(piece.bpm);
      deps.rdnHandsUi();
      const avail = srHandsAvail();
      [byId('rd-hands'), maybeById('rd-stage-hands')].forEach((container) => {
          if (!container)
              return;
          [...container.children].forEach((b) => {
              if (!(b instanceof HTMLButtonElement))
                  return;
              b.disabled = avail !== 'both';
              b.setAttribute('aria-pressed', (avail === 'both' ? b.dataset.v === deps.SR.hands : b.dataset.v === avail) ? 'true' : 'false');
          });
      });
      const consumedForLearn = srtConsumeOnLearnReveal();
      srDraw();
      srMeta();
      srEmptyUi();
      byId('rd-verdict').textContent = '';
      srtNotice(null);
      if (!consumedForLearn && srtGeneratedSelected() && (deps.SR.srtState?.mode === 'practice' || deps.SR.srtState?.name === 'abandoned' || deps.SR.srtState?.name === 'interrupted')) {
          const message = deps.t('rd_srt_error_already_exposed');
          srtNotice(message);
          if (deps.SR.srtState.name === 'abandoned' || deps.SR.srtState.name === 'interrupted') {
              byId('rd-verdict').className = 'verdict neutral';
              byId('rd-verdict').textContent = message;
          }
      }
  }
    function renderRead() {
      if (deps.RDN.fresh) {
          deps.RDN.fresh = false;
          deps.RDN.screen = 'home';
      }
      if (deps.SR.piece)
          srDraw();
      srMeta();
      srEmptyUi();
      deps.rdRender();
  }

  return {
    srSvg,
    srHandsAvail,
    srActiveHands,
    srHandSel,
    srStepsBuild,
    srDraw,
    srtGeneratedSelected,
    srtEligibleFirstSightActive,
    get srtWatchedAudioContext() { return srtWatchedAudioContext; },
    set srtWatchedAudioContext(value: typeof srtWatchedAudioContext) { srtWatchedAudioContext = value; },
    srtWatchAudioContext,
    srNamesVisible,
    srSvgCache,
    srSvgEntry,
    srPaintAll,
    srScrollX,
    srPaperOf,
    srPaper,
    SR_PAGE_MIN,
    SR_PAGE_MAX,
    srPageNatural,
    srPageLayout,
    srPaperChanged,
    get srPaperSeen() { return srPaperSeen; },
    set srPaperSeen(value: typeof srPaperSeen) { srPaperSeen = value; },
    srFit,
    get srFollowSy() { return srFollowSy; },
    set srFollowSy(value: typeof srFollowSy) { srFollowSy = value; },
    srFollow,
    srScrollStep,
    srBeatToX,
    srCursor,
    srTargets,
    srClick,
    get srInstantTracker() { return srInstantTracker; },
    set srInstantTracker(value: typeof srInstantTracker) { srInstantTracker = value; },
    get srInstantVerdictShown() { return srInstantVerdictShown; },
    set srInstantVerdictShown(value: typeof srInstantVerdictShown) { srInstantVerdictShown = value; },
    srInstantNotes,
    srInstantReset,
    srInstantNoteLabel,
    srInstantFlashKey,
    srInstantHandleNote,
    srInstantSweep,
    get srAssessRunId() { return srAssessRunId; },
    set srAssessRunId(value: typeof srAssessRunId) { srAssessRunId = value; },
    srStopAll,
    srPlayGap,
    srCount,
    srLearnStart,
    srLearnFinish,
    srtSetState,
    srtPreviewUi,
    srtPendingUi,
    srtNotice,
    srtLedgerFailureMessage,
    srtScoreConcealed,
    srtProgressLedgerUpdate,
    srtRecordExposure,
    srtExposeForPractice,
    srtConsumeOnLearnReveal,
    srtClearPreview,
    srtBeginOperation,
    srtOperationStillCurrent,
    srtCaptureAttempt,
    srtReleaseLease,
    srtPendingSaveProtected,
    srtIsAbandoned,
    srtAttemptStatus,
    srtCleanupKey,
    srtEnsureAbandoned,
    srtClearPendingAttempt,
    srtRetryPendingSave,
    srtContinueWithoutSave,
    srtAttemptId,
    srtAbandonClaim,
    srtCancelAttempt,
    srtNavigateAttempt,
    srtStartPractice,
    srtStartFirstSight,
    srtStartClaimedAttempt,
    srtSwitchToPractice,
    srAssessStart,
    srTol,
    srFirstNotes,
    get srNoteStart() { return srNoteStart; },
    set srNoteStart(value: typeof srNoteStart) { srNoteStart = value; },
    get srNoteArmAt() { return srNoteArmAt; },
    set srNoteArmAt(value: typeof srNoteArmAt) { srNoteArmAt = value; },
    SR_NOTE_START_MS,
    srNoteStartHold,
    srNoteStartArmed,
    srNoteStartInput,
    srNoteStartTake,
    srAssessLoop,
    srAssessFinish,
    srRenderAssessResult,
    srKeyInput,
    srListen,
    srGo,
    rdCurrentKeyInfo,
    rdWarmButtonsSync,
    rdWarmPlayTonic,
    rdWarmPracticeScale,
    srMeta,
    srEmptyUi,
    srSelectPiece,
    srShowPiece,
    renderRead,
  };
}

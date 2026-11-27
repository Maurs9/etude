import * as storage from '../../domain/storage.js';
import { randItem, shuffle } from '../../core/collections.js';
import { CATS, ITEMS } from '../../core/trainer-items.js';
import { RD_ALL, RD_ALLIV, RD_LV, RD_UNITS, isReadClef, isReadDrillType, type ReadClef, type ReadClefDraw, type ReadClefStaff, type ReadDrillChordQuality, type ReadDrillLevel, type ReadDrillType } from '../../core/reading-curriculum.js';
import { samePitch } from '../../core/pitch-match.js';
import { SR_LET, SR_SCALE_CAP, srPitch, ssAccGlyph, ssFlat, ssKeyAcc, ssMidiOf, ssNotehead, ssSharp, ssStepOf, type SrLayout, type SrPiece, type SrRenderResult, type SrScore, type SrStaffNote, type SrToken } from '../../domain/score-types.js';
import { PIECES } from '../../domain/repertoire-data.js';
import { renderGrandStaff, srBeatPt, srClef, srLedger2, srSpellName } from '../../domain/grand-staff.js';
import type { LibraryItem } from '../../domain/score-library-types.js';
import { byId, maybeById, inputById, selectById, buttonById, eventElement, eventClosest, queryHtml, queryAllHtml } from '../../domain/dom.js';
import { type CoachTip, type ReadDrillCustom, type ReadDrillLevelStat } from '../../domain/views.js';
import { inputTime, inputTimeForRelease } from '../../domain/midi-timing.js';
import { srtEvaluate, type SightReadingPerformed } from '../../sight-reading/evaluate.js';
import { srtBuildExpected, type SightReadingExpected, type SightReadingPiece, type SightReadingProfile } from '../../sight-reading/model.js';
import { srtFingerprint, srtLevelFingerprint } from '../../sight-reading/fingerprint.js';
import { srtKeyPool, srtLevel, srtLevels, srtReadingKey, srtReadingKeys, type ReadingKey, type ReadingPatternId } from '../../sight-reading/levels.js';
import { SRT_BOOK_PIECES, SRT_DAILY_PIECES, SRT_FOCUS_PIECES, SRT_UNIT_PIECES, srtBookPiece, srtBookUnits, srtDailyPiece, srtFocusPiece, srtLongPiece, type BookUnit } from '../../sight-reading/book.js';
import { srtScoredId, srtBookId, srtBookTally, srtChooseLevel, srtDailyId, srtEnsureDaily, srtFocusId, srtFocusTally, srtKeyStatus, srtLevelAverage, srtLevelReady, srtLongId, srtNormalizeBookState, srtPiecesRead, srtRecordResult, srtStreak, type PieceStat, type ReadingBookState } from '../../sight-reading/progress.js';
import { srtLevelClicks, srtLevelDurationMs, srtLevelExpected, srtLevelScore } from '../../sight-reading/score.js';
import { srtMelodyRhythm } from '../../sight-reading/patterns.js';
import { SRT_FLASH_MS, srtFlashMatches, srtWarmupPlan, type FlashCard, type WarmupStep } from '../../sight-reading/warmup.js';
import type { GeneratedPiece } from '../../sight-reading/rules.js';
import { srtGenerate } from '../../sight-reading/generator.js';
import { SightReadingRecorder, srtInputFamily } from '../../sight-reading/recorder.js';
import { createInstantFeedbackTracker, type InstantFeedbackExpectedNote, type InstantFeedbackTracker } from '../../sight-reading/instant-feedback.js';
import { srtLevelMarkings } from '../../sight-reading/markings.js';
import { srtAcquireAttemptLease, srtLedgerReadStatus, srtLedgerUpdate, srtReadLedger, type SightReadingAttempt, type SightReadingAttemptLease, type SightReadingLedgerOperation, type SightReadingLedgerResult } from '../../sight-reading/ledger.js';
import { SRT_INITIAL_STATE, srtTransition, type SightReadingState } from '../../sight-reading/flow.js';
import { courtesyNatural, formatLead, ghostX, pacerLead, streamStart, streamVisible, systemBars, systemRows, systemWindow } from '../../sight-reading/stream.js';
import { srtNotationSegments } from '../../sight-reading/notation.js';
import { type TechniqueKind } from '../../domain/technique.js';
import { TECHNIQUE_TOPIC } from '../../domain/technique-drill.js';
import { ARCADE_LIVES, ARCADE_STREAK, MARATHON_NOTES_PER_BAR, TIME_ATTACK_MS, srtArcadeComplete, srtArcadeMultiplier, srtArcadeRecord, srtArcadeRemainingMs, srtArcadeStart, srtArcadeSummary, srtIsArcadeMode, srtIsMarathonBars } from '../../sight-reading/arcade.js';
import type { buildPracticeReport, PracticeReportPieceInput } from '../../domain/progress-report.js';

import type { AppHost, ReadController, ReadShell, TestSurfaceRegistry } from '../../domain/views.js';
import { srtLevelPatterns } from '../../sight-reading/levels.js';
import * as theory from '../../domain/theory.js';

const pc = theory.pitchClass, srKeyName = theory.circleKeyPitchClass, rdSpellMidi = theory.readingSpelling;
import type { SrSlip, SrState, RdnScreen, RdnCtx, RdnState, RdnWarmState, SrtAttemptCleanup, SrSvgNoteRef, SrSvgCacheEntry, SrtStopReason, SrtLedgerFailureReason, SrtLedgerFailureContext, SrNoteStartEvent, RdKeyInfo, ReadDrillPitch, ReadDrillStaffNote, ReadDrillSvgOptions, ReadDrillSvgItem, ReadDrillMode, ReadDrillState, ReadQuestionNote, ReadQuestion, ReadDockMark, ReadDrillButton, ReadDrillFlow, ReadDrillGiven, RdRhythmUnit, RdRhythmEvent, RdRhythmTapResult, RdRhythmTapGrade, RdLeftHandPattern, RdRhythmRender, RdRhythmPiece, RdRhythmPress, RdRhythmGrade, RdRhythmState, RdRhythmNoteResult, RdRhythmHandGrade, RdRhythmCountKey, RdRhythmAllGrade, RdSightLevel, RdSightPiece, RdnPlanItem } from './read-model.js';

export function createReadFeature(host: AppHost, shell: ReadShell): ReadController {
  const t = host.i18n.t;
  const { noteName, pcName } = host.i18n;
  const saveAll = host.store.saveNow;
  const stopPreviews = host.audio.stopPreviews, timedAudioReady = host.audio.timedReady;
  const dockSync = host.dock.sync;
  const midiLive = host.input.isMidiLive, heldPcs = host.input.heldPcs;
  const reduceMotion = host.reduceMotion;
  const {
    view0, todayN, ensureAudio, audioLockCheck, kbState, kbClear, buildKeyboard, repaintHeld, foldToView, dockKeyInSight,
    anLayoutVars, syncMobileStartBars, touchInput, inField, panic, appConfirm, scoreFocusUi, scoreFocusExit, scoreFocusEnter,
    readScoreZoom, rdFocusDispSet, touchDay, markReadDoneToday, storeDaily, storeBackupBlocked, setWeakSpotInjection,
    currentStreak, masteredCount, itemLabel, withPractice, rdData, rdLvName, rdStarCount, rdEsc, statHTML, srPieceTitle,
    spelledName, tl, anNum, coachHTML, coachText,
  } = shell;
  const LETTERS = shell.letters;
  const SR: SrState = { piece: null, hands: 'both', modeSel: 'learn', names: false, anyOctave: false, instantFeedback: false, active: false, assessOn: false,
      notes: [], steps: [], stepIdx: 0, hit: new Set<number>(), results: {}, mistakes: 0, wrongExtra: 0, beatX: [], totalBeats: 0,
      render: null, raf: 0, timers: [], nodes: [], bpm: 90, t0: 0, next: null, errs: null, slipKey: null,
      srtPiece: null, srtFingerprint: null, srtState: SRT_INITIAL_STATE,
      srtOwnerTabId: `tab-${Math.random().toString(36).slice(2)}`, srtAttemptStartedAt: 0, srtPreviewTimer: 0, srtCountdown: 0, srtLease: null, srtPendingAttempt: null,
      srtEvaluation: null, srtResultValue: null, srtResultLevelId: null, lvPiece: null };
  const RDN: RdnState = { screen: 'home', fresh: true, ctx: null, autoTimer: 0, autoLeft: 0, retries: 0, learn: null, autoWait: false, playerMode: 'assess', melodyMode: null, opener: '', noDaily: false, ready: '' };
  const WARM: RdnWarmState = { on: false, level: 1, key: 'C', steps: [], step: 0, card: 0, phase: 'idle', again: false, clean: 0, played: [], lastAt: 0, strict: false, ok: false, timer: 0, chordTimer: 0, limit: 0, tally: [] };
  /** Warm-up timing in ms: how long a card shows, how long its mark stays, and how close notes must be to form one chord.
   *  Mutable so tests can shorten the waits. */
  const RDN_WARM_MS = { flash: SRT_FLASH_MS, result: 1200, chord: 60 };
  /** The window, in ms, inside which the notes of one beat of a level piece (both hands) count as played together. */
  const RDN_CHORD_WINDOW_MS = 120;
  let srtRecorder: SightReadingRecorder | null = null;
  let srtOperationEpoch = 0;
  let srtCountInEpoch = 0;
  let srtCountInAttemptId: string | null = null;
  let srtClaimIssuedAttemptId: string | null = null;
  let srtClaimDurableAttemptId: string | null = null;
  const srtCleanupPromises = new Map<string, Promise<SightReadingLedgerResult>>();
  const srtReleasedLeases = new WeakSet<SightReadingAttemptLease>();
  let srtExposurePromise: { fingerprint: string; promise: Promise<SightReadingLedgerResult> } | null = null;
  function srRender(piece: SrScore, lay?: SrLayout, proportional = false): SrRenderResult {
      return renderGrandStaff(piece, lay, { namesVisible: srNamesVisible(piece), notation: host.i18n.notation(), proportional });
  }
  /* ---- state, drawing, grading ---- */
  function srSvg() { return byId('rd-staff') ? byId('rd-staff').querySelector('svg') : null; }
  function srHandsAvail() { const p = SR.piece; if (!p)
      throw new Error('Étude: no piece selected'); return p.rh && p.lh ? 'both' : (p.rh ? 'rh' : 'lh'); }
  function srActiveHands() { const a = srHandsAvail(); return a === 'both' ? SR.hands : a; }
  function srHandSel(): 'rh' | 'lh' | 'both' { const a = srActiveHands(); return a === 'rh' || a === 'lh' ? a : 'both'; }
  function srStepsBuild() {
      const sel = srActiveHands();
      const ns = SR.notes.filter((n) => sel === 'both' || n.hand === sel);
      const map = new Map<string, { beat: number; notes: typeof ns; }>();
      ns.forEach((n) => { const k = n.beat.toFixed(3); let step = map.get(k); if (!step)
          map.set(k, step = { beat: n.beat, notes: [] }); step.notes.push(n); });
      SR.steps = [...map.values()].sort((a, b) => a.beat - b.beat);
  }
  function srDraw() {
      if (!SR.piece)
          return;
      srtConsumeOnLearnReveal();
      const lay = srPageLayout(SR.piece, srPaper());
      const r = srRender(SR.piece, lay, true);
      SR.render = r;
      SR.notes = r.notes;
      SR.beatX = r.beatX;
      SR.totalBeats = r.total;
      const concealed = srtScoreConcealed();
      const staffEl = byId('rd-staff');
      staffEl.setAttribute('aria-hidden', concealed ? 'true' : 'false');
      staffEl.dataset.activeHand = srActiveHands();
      staffEl.innerHTML = concealed ? '' : r.svg;
      readScoreZoom();
      scoreFocusUi();
      srPaperSeen = lay;
      srFollowSy = -1;
      srStepsBuild();
      if (!concealed) {
          srPaintAll();
          if (SR.active && SR.modeSel === 'learn')
              srScrollStep();
          else if (!SR.active)
              byId('rd-staff').scrollLeft = 0;
      }
      srCoach();
  }
  function srtGeneratedSelected() {
      return (!!SR.srtPiece || !!SR.lvPiece) && !!SR.gen && SR.piece?.id === SR.gen.id;
  }
  function srtEligibleFirstSightActive() {
      return srtGeneratedSelected() && SR.srtState?.mode === 'firstSight' &&
          ['preparing', 'claiming', 'preview', 'countIn', 'playing'].includes(SR.srtState.name);
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
              panic();
      });
  }
  function srNamesVisible(piece: SrScore) {
      // A level piece shows before its first attempt: its note names wait until it is practice.
      const state = SR.srtState, lvFirst = !!SR.lvPiece && srtGeneratedSelected() && state?.mode === 'firstSight' && (state.name === 'idle' || state.name === 'blocked');
      return SR.names && !piece.noNames && !srtScoreConcealed() && !lvFirst && !srtEligibleFirstSightActive() && SR.srtState?.name !== 'claiming';
  }
  const srSvgCache = new WeakMap<SVGSVGElement, SrSvgCacheEntry>();
  function srSvgEntry(svg: SVGSVGElement): SrSvgCacheEntry {
      let entry = srSvgCache.get(svg);
      if (!entry) {
          const noteById = new Map<number, { x: number; y: number }>();
          for (const item of SR.notes)
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
      const st = (SR.active && SR.modeSel === 'learn') ? SR.steps[SR.stepIdx] : null;
      const stepNids = st ? new Set(st.notes.map((n: { nid: number; }) => n.nid)) : null;
      entry.notes.forEach(({ g, title, sym: visible }, id) => {
          const r = SR.results[id];
          if (stepNids && stepNids.has(id) && !SR.hit.has(id))
              g.dataset.s = 'now';
          else if (r)
              g.dataset.s = r;
          else
              g.removeAttribute('data-s');
          const symbol = r === 'good' ? '✓' : r === 'near' ? '≈' : r === 'bad' ? '✗' : r === 'extra' ? '+' : '';
          const label = r === 'good' ? t('rd_srt_symbol_good') : r === 'near' ? t('rd_srt_symbol_near') : r === 'bad' ? t('rd_srt_symbol_bad') : r === 'extra' ? t('rd_srt_symbol_extra') : '';
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
      if (SR.wrongExtra > 0) {
          if (!extras) {
              extras = document.createElementNS('http://www.w3.org/2000/svg', 'g');
              extras.setAttribute('class', 'ss-extra-symbol');
              svg.appendChild(extras);
          }
          entry.extras = extras;
          extras.innerHTML = `<title>${rdEsc(t('rd_srt_symbol_extra'))}</title><text x="${Math.max(20, (SR.render?.W ?? 420) - 24)}" y="18">+${SR.wrongExtra}</text>`;
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
          const svg = srSvg(), W = SR.render?.W, k = svg && W ? svg.getBoundingClientRect().width / W || 1 : 1;
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
      if (!lay || lay.maxHeight || piece.engrave !== 2 || !SR.lvPiece || !srtGeneratedSelected() || !wrap)
          return lay;
      // The height the paper may take: the window, less what is above the paper, the play controls, and the live dock below it.
      const dockEl = maybeById('dock');
      const dockH = dockEl && !dockEl.hidden ? dockEl.getBoundingClientRect().height : 0;
      const ctrlEl = maybeById('rd-play-controls');
      const ctrlH = ctrlEl && !ctrlEl.hidden ? Math.max(48, ctrlEl.getBoundingClientRect().height + 16) : 64;
      const below = Math.round(dockH + ctrlH + 84);
      const room = Math.max(220, window.innerHeight - (wrap.getBoundingClientRect().top + window.scrollY) - below);
      const names = srNamesVisible(piece), seen = srPageNatural.get(piece);
      const natural = seen && seen.width === lay.width && seen.names === names ? seen.H : srRender(piece, { width: lay.width, cap: 1 }, true).H;
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
      if (!SR.piece || !SR.render || srtScoreConcealed())
          return;
      const lay = srPageLayout(SR.piece, srPaper());
      if (!srPaperChanged(srPaperSeen, lay))
          return;
      srPaperSeen = lay;
      const r = srRender(SR.piece, lay, true), wrap = byId('rd-staff');
      const left = wrap.scrollLeft, top = wrap.scrollTop;
      const closed = new Set(SR.steps.filter((s) => s.closed).map((s) => s.beat.toFixed(3)));
      SR.render = r;
      SR.notes = r.notes;
      SR.beatX = r.beatX;
      wrap.innerHTML = r.svg;
      readScoreZoom();
      srFollowSy = -1;
      srStepsBuild();
      SR.steps.forEach((s) => { if (closed.has(s.beat.toFixed(3)))
          s.closed = true; });
      srPaintAll();
      if (SR.active && SR.modeSel === 'learn')
          srScrollStep();
      else { wrap.scrollLeft = left; wrap.scrollTop = top; }
  }
  // While a score of several systems plays, the page (or the stage's paper) scrolls so the system being read stays in view.
  let srFollowSy = -1;
  function srFollow(sy: number) {
      const r = SR.render, svg = srSvg(), s = r?.systems[sy];
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
  function srScrollStep() { const st = SR.steps[SR.stepIdx]; if (st) {
      srScrollX(st.notes[0].x);
      srFollow(st.notes[0].sy);
  } }
  function srBeatToX(beat: number) { return srBeatPt(SR.beatX, beat).x; }
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
      const s = SR.render?.systems[sy];
      c.setAttribute('y1', String(s ? s.yTop : 38));
      c.setAttribute('y2', String(s ? s.yBot : 102));
      c.setAttribute('x1', String(x));
      c.setAttribute('x2', String(x));
      srScrollX(x);
      srFollow(sy);
  }
  function srTargets() {
      kbClear('target');
      if (!(SR.active && SR.modeSel === 'learn'))
          return;
      const st = SR.steps[SR.stepIdx];
      if (st)
          st.notes.forEach((n: { nid: number; midi: number; }) => { if (!SR.hit.has(n.nid))
              kbState(n.midi, 'target', true); });
  }
  function srClick(t: number, acc: boolean) {
      const click = shell.audioEngine.scheduleClick(t, acc);
      if (click?.oscs)
          SR.nodes.push(...click.oscs);
  }
  let srInstantTracker: InstantFeedbackTracker | null = null;
  let srInstantVerdictShown = false;
  function srInstantNotes(): InstantFeedbackExpectedNote[] {
      const sel = srActiveHands();
      const msPerBeat = 60000 / SR.bpm;
      return SR.notes
          .filter((n) => sel === 'both' || n.hand === sel)
          .map((n) => ({ nid: n.nid, midi: n.midi, onMs: n.beat * msPerBeat }));
  }
  function srInstantReset() {
      srInstantTracker = null;
      srInstantVerdictShown = false;
  }
  function srInstantNoteLabel(midi: number, matchedNid?: number): string {
      if (matchedNid !== undefined && SR.piece?.engrave === 2) {
          const note = SR.notes.find((n) => n.nid === matchedNid);
          if (note)
              return srSpellName(note.li, note.acc, host.i18n.notation()) + note.oct;
      }
      const flat = (SR.piece?.keyN || 0) < 0;
      return noteName(midi, flat);
  }
  function srInstantFlashKey(midi: number, status: 'good' | 'bad') {
      const m = foldToView(midi);
      kbState(m, status, false);
      SR.timers.push(setTimeout(() => {
          const el = shell.keyEl.get(m);
          if (!el || el.dataset.s !== status)
              return;
          const isHeld = [...shell.held].some((n) => foldToView(n) === m);
          kbState(m, isHeld ? 'active' : null, false);
      }, 350));
  }
  function srInstantHandleNote(midi: number, onMs: number) {
      if (!srInstantTracker)
          return;
      const res = srInstantTracker.processInput(midi, onMs);
      const v = maybeById('rd-verdict');
      if (res.matched) {
          SR.results[res.nid] = res.status;
          srPaintAll();
          const lbl = srInstantNoteLabel(res.expectedMidi, res.nid);
          srInstantFlashKey(midi, res.status === 'bad' ? 'bad' : 'good');
          if (v) {
              if (res.status === 'good') {
                  v.className = 'verdict good';
                  v.textContent = t('rd_fb_good', lbl);
              }
              else if (res.status === 'near') {
                  v.className = 'verdict neutral';
                  v.textContent = t('rd_fb_near', lbl);
              }
              else {
                  v.className = 'verdict bad';
                  v.textContent = t('rd_fb_late', lbl);
              }
          }
      }
      else {
          SR.wrongExtra++;
          srPaintAll();
          srInstantFlashKey(midi, 'bad');
          if (v) {
              const played = srInstantNoteLabel(midi);
              v.className = 'verdict bad';
              if (res.expectedMidis.length) {
                  const exp = res.expectedMidis.map((m) => srInstantNoteLabel(m)).join(' / ');
                  v.textContent = t('rd_fb_wrong_exp', played, exp);
              }
              else {
                  v.textContent = t('rd_fb_wrong', played);
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
          SR.results[nid] = 'bad';
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
      SR.active = false;
      stageSync();
      rdnNavUi();
      SR.assessOn = false;
      srInstantReset();
      if (SR.raf)
          cancelAnimationFrame(SR.raf);
      SR.raf = 0;
      SR.timers.forEach(clearTimeout);
      SR.timers = [];
      SR.nodes.forEach((n) => { try {
          n.stop(0);
      }
      catch (_) { } });
      SR.nodes = [];
      if (shell.audioEngine.context)
          stopPreviews();
      kbClear('target');
      kbClear('good');
      kbClear('bad');
      const svg = srSvg(), c = svg && svg.querySelector('.ss-playhead');
      if (c)
          c.remove();
      srFollowSy = -1;
      if (!keep && !preservePendingResult) {
          SR.results = {};
          SR.wrongExtra = 0;
          SR.stepIdx = 0;
          SR.hit.clear();
          SR.next = null;
          srPaintAll();
      }
      const go = byId('rd-go');
      if (go && !preservePendingResult)
          go.textContent = t('rd_start');
      SR.listening = false;
      const li = byId('rd-listen');
      if (li)
          li.textContent = t('rd_listen');
      rdWarmButtonsSync();
      if (!preservePendingResult)
          srCoach();
  }
  function srPlayGap(fromBeat: number, toBeat: number) {
      const sel = srActiveHands();
      if (sel === 'both' || srHandsAvail() !== 'both')
          return;
      const bs = 60 / SR.bpm, ctx = shell.audioEngine.context;
      if (!ctx)
          return;
      SR.notes.filter((n) => n.hand !== sel && n.beat >= fromBeat - 1e-3 && n.beat < toBeat - 1e-3).forEach((n) => host.audio.previewNote(n.midi, ctx.currentTime + 0.02, Math.max(.15, n.dur * bs * .9), 78));
  }
  function srCount() { const v = byId('rd-verdict'); v.className = 'verdict neutral'; v.textContent = SR.stepIdx + ' / ' + SR.steps.length + (SR.mistakes ? '  ·  ✗ ' + SR.mistakes : ''); }
  function srLearnStart() {
      rdnResultHide();
      SR.active = true;
      SR.anyOctave = !!host.store.data().settings.anyOctave;
      srStartStage();
      rdnNavUi();
      rdWarmButtonsSync();
      SR.results = {};
      SR.stepIdx = 0;
      SR.hit.clear();
      SR.mistakes = 0;
      SR.errs = {};
      SR.slipKey = null;
      SR.next = null;
      srCoach();
      srPaintAll();
      srTargets();
      srScrollStep();
      const v = byId('rd-verdict');
      v.className = 'verdict neutral';
      v.textContent = t('rd_learn_go');
      byId('rd-go').textContent = t('rd_stop');
  }
  function srLearnFinish() {
      SR.next = srNextLearn();
      srStopAll(true);
      const v = byId('rd-verdict');
      if (SR.mistakes === 0) {
          v.className = 'verdict good';
          v.textContent = t('rd_perfect');
      }
      else {
          v.className = 'verdict neutral';
          v.textContent = t('rd_done_learn', SR.mistakes);
      }
      if (SR.lvPiece && srtGeneratedSelected()) {
          const grade = srLearnGrade(SR.mistakes, SR.steps.length || 1);
          rdnRecord(grade.acc, grade.stars, false);
          v.textContent += ' · ' + '★'.repeat(grade.stars) + '☆'.repeat(3 - grade.stars);
          RDN.learn = { acc: grade.acc, stars: grade.stars };
          // Practice never moves on by itself: no auto-next after a Step-by-step run.
          rdnResultShow(false);
      }
      else
          v.textContent += rdSightDone('learn', SR.mistakes);
      markReadDoneToday();
      touchDay();
      saveAll();
  }
  function srtSetState(event: Parameters<typeof srtTransition>[1]) {
      const previous = SR.srtState || SRT_INITIAL_STATE;
      const next = srtTransition(previous, event);
      SR.srtState = next;
      if (next.name === 'countIn' && previous.name !== 'countIn') {
          srtCountInEpoch = srtOperationEpoch;
          srtCountInAttemptId = next.attemptId;
      }
      else if (next.name !== 'countIn') {
          srtCountInEpoch = 0;
          srtCountInAttemptId = null;
      }
      if (srtGeneratedSelected() && next.mode === 'firstSight' && (next.name === 'abandoned' || next.name === 'interrupted')) {
          const message = t('rd_srt_error_already_exposed');
          srtNotice(message);
          const verdict = byId('rd-verdict');
          verdict.className = 'verdict neutral';
          verdict.textContent = message;
      }
      if (SR.piece && (previous.name !== next.name || previous.mode !== next.mode))
          srDraw();
      rdnNavUi();
      if (next.name === 'saved' && previous.name !== 'saved')
          rdnAutoAfterSave();
  }
  function srtPreviewUi(show: boolean) {
      const panel = maybeById('rd-srt-preview');
      if (panel)
          panel.hidden = !show;
      if (show) {
          const operation = srtOperationEpoch;
          requestAnimationFrame(() => {
              if (operation !== srtOperationEpoch || panel?.hidden)
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
          return t(context === 'pending' ? 'rd_srt_error_pending_storage' : 'rd_srt_error_storage');
      return t('rd_srt_error_' + reason);
  }
  function srtScoreConcealed() {
      // A level piece is on the page from the moment it opens: there is no timed look, its first attempt is its first sight.
      if (SR.lvPiece && srtGeneratedSelected())
          return false;
      if (srtExposurePromise?.fingerprint === SR.srtFingerprint)
          return true;
      const state = SR.srtState;
      return srtGeneratedSelected() && SR.modeSel === 'assess' && state?.mode === 'firstSight' &&
          (['idle', 'preparing', 'claiming'].includes(state.name) ||
              state.name === 'blocked' && state.reason !== 'already_exposed');
  }
  function srtProgressLedgerUpdate(operation: SightReadingLedgerOperation) {
      return srtLedgerUpdate(localStorage, operation, () => !shell.storeBlocked() && !storeBackupBlocked());
  }
  function srtRecordExposure(reason: string, kind: 'exposure' | 'listen' = 'exposure') {
      const fingerprint = SR.srtFingerprint;
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
      srtExposurePromise = { fingerprint, promise: settled };
      void settled.then((result) => {
          if (srtExposurePromise?.promise === settled)
              srtExposurePromise = null;
          if (!result.ok) {
              if (SR.srtFingerprint === fingerprint)
                  srtNotice(srtLedgerFailureMessage(result.reason));
              return;
          }
          if (SR.srtFingerprint === fingerprint)
              srDraw();
      });
      return operation;
  }
  function srtExposeForPractice(reason: string, kind: 'exposure' | 'listen' = 'exposure', redraw = true) {
      if ((!SR.srtPiece && !SR.lvPiece) || !SR.srtFingerprint)
          return;
      const state = SR.srtState;
      if (state?.mode === 'firstSight' &&
          (state.name === 'idle' || state.name === 'blocked' && state.reason !== 'already_exposed')) {
          SR.srtState = { ...state, mode: 'practice', attemptId: null, fingerprint: SR.srtFingerprint };
          if (redraw)
              srDraw();
      }
      void srtRecordExposure(reason, kind);
  }
  function srtConsumeOnLearnReveal() {
      if (SR.modeSel === 'assess' || !srtGeneratedSelected() || !SR.srtFingerprint)
          return false;
      const state = SR.srtState;
      if (state?.mode !== 'firstSight' ||
          !(state.name === 'idle' || state.name === 'blocked' && state.reason !== 'already_exposed'))
          return false;
      srtExposeForPractice('learn', 'exposure', false);
      return true;
  }
  function srtClearPreview() {
      window.clearInterval(SR.srtPreviewTimer);
      SR.srtPreviewTimer = 0;
      SR.srtCountdown = 0;
      srtPreviewUi(false);
  }
  function srtBeginOperation() {
      srtOperationEpoch++;
      srtClearPreview();
      srtCountInEpoch = 0;
      srtCountInAttemptId = null;
      return srtOperationEpoch;
  }
  function srtOperationStillCurrent(epoch: number, state: SightReadingState | undefined, attemptId: string | null = state?.attemptId ?? null) {
      return epoch === srtOperationEpoch && state !== undefined && SR.srtState === state &&
          (attemptId === null || SR.srtState?.attemptId === attemptId);
  }
  function srtCaptureAttempt(state: SightReadingState | undefined): SrtAttemptCleanup | null {
      if (!state?.attemptId || !SR.srtOwnerTabId || (!SR.srtPiece && !SR.lvPiece) || !SR.srtFingerprint)
          return null;
      return {
          attemptId: state.attemptId,
          ownerTabId: SR.srtOwnerTabId,
          generation: srtReadLedger(localStorage).generation,
          lease: SR.srtLease ?? null,
          mixedInput: SR.srtPendingAttempt?.mixedInput ?? srtRecorder?.mixedInput ?? false,
      };
  }
  function srtReleaseLease(lease: SightReadingAttemptLease | null) {
      if (!lease)
          return;
      if (srtReleasedLeases.has(lease))
          return;
      srtReleasedLeases.add(lease);
      lease.release();
      if (SR.srtLease === lease)
          SR.srtLease = null;
  }
  function srtPendingSaveProtected() {
      const state = SR.srtState;
      return state?.name === 'pendingSave' ||
          state?.name === 'completed' && SR.srtPendingAttempt?.attemptId === state.attemptId;
  }
  function srtIsAbandoned() {
      return SR.srtState?.name === 'abandoned';
  }
  function srtAttemptStatus(attemptId: string): SightReadingAttempt['status'] | null {
      return srtReadLedger(localStorage).attempts[attemptId]?.status ?? null;
  }
  function srtCleanupKey(attemptId: string, status: 'abandoned' | 'interrupted') {
      return attemptId + ':' + status;
  }
  function srtEnsureAbandoned(attempt: SrtAttemptCleanup, status: 'abandoned' | 'interrupted') {
      const key = srtCleanupKey(attempt.attemptId, status);
      const existing = srtCleanupPromises.get(key);
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
      srtCleanupPromises.set(key, cleanup);
      void cleanup.then(() => {
          if (srtCleanupPromises.get(key) === cleanup)
              srtCleanupPromises.delete(key);
      });
      return cleanup;
  }
  function srtClearPendingAttempt(attemptId: string) {
      if (SR.srtPendingAttempt?.attemptId === attemptId)
          SR.srtPendingAttempt = null;
  }
  async function srtRetryPendingSave() {
      const attempt = SR.srtPendingAttempt;
      if (!attempt)
          return;
      const epoch = srtOperationEpoch;
      const state = SR.srtState;
      const lease = SR.srtLease ?? null;
      const result = await srtProgressLedgerUpdate({ type: 'finishAttempt', attempt, generation: attempt.generation });
      if (!srtOperationStillCurrent(epoch, state, attempt.attemptId)) {
          if (result.ok || srtAttemptStatus(attempt.attemptId)) {
              srtClearPendingAttempt(attempt.attemptId);
              if (srtClaimIssuedAttemptId === attempt.attemptId)
                  srtClaimIssuedAttemptId = null;
              if (srtClaimDurableAttemptId === attempt.attemptId)
                  srtClaimDurableAttemptId = null;
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
                  if (srtClaimIssuedAttemptId === attempt.attemptId)
                      srtClaimIssuedAttemptId = null;
                  if (srtClaimDurableAttemptId === attempt.attemptId)
                      srtClaimDurableAttemptId = null;
                  srtReleaseLease(lease);
              }
          }
          return;
      }
      if (result.ok) {
          srtSetState({ type: 'saved' });
          storeDaily();
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
      if (SR.srtState?.name !== 'pendingSave')
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
      const state = SR.srtState;
      const preClaimAttempt = state?.mode === 'firstSight' &&
          !!state.attemptId &&
          (state.name === 'preparing' || state.name === 'claiming') &&
          (srtClaimIssuedAttemptId !== state.attemptId ||
              SR.modeSel === 'learn' && srtClaimDurableAttemptId !== state.attemptId);
      if (preClaimAttempt) {
          const fingerprint = SR.srtFingerprint ?? null;
          srtBeginOperation();
          SR.srtPendingAttempt = null;
          SR.srtState = { ...SRT_INITIAL_STATE, fingerprint };
          return { ok: true, ledger: srtReadLedger(localStorage) } satisfies SightReadingLedgerResult;
      }
      const attempt = srtCaptureAttempt(state);
      const lease = SR.srtLease ?? null;
      const operation = srtBeginOperation();
      let expectedState = SR.srtState;
      if (transitionBeforeLedger && state && (state.name === 'preparing' || state.name === 'preview' || state.name === 'claiming' || state.name === 'countIn' || state.name === 'playing'))
          srtSetState({ type: status === 'interrupted' ? 'interrupt' : 'abandon' });
      expectedState = SR.srtState;
      const result = attempt ? await srtEnsureAbandoned(attempt, status) : { ok: true, ledger: srtReadLedger(localStorage) } satisfies SightReadingLedgerResult;
      const terminalStatus = attempt ? srtAttemptStatus(attempt.attemptId) : null;
      const stillCurrent = srtOperationStillCurrent(operation, expectedState, attempt?.attemptId ?? expectedState?.attemptId ?? null);
      if (!stillCurrent) {
          if (result.ok || terminalStatus) {
              if (attempt)
                  srtClearPendingAttempt(attempt.attemptId);
              if (attempt && srtClaimIssuedAttemptId === attempt.attemptId)
                  srtClaimIssuedAttemptId = null;
              if (attempt && srtClaimDurableAttemptId === attempt.attemptId)
                  srtClaimDurableAttemptId = null;
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
          if (attempt && srtClaimIssuedAttemptId === attempt.attemptId)
              srtClaimIssuedAttemptId = null;
          if (attempt && srtClaimDurableAttemptId === attempt.attemptId)
              srtClaimDurableAttemptId = null;
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
      const state = SR.srtState;
      if (srtPendingSaveProtected())
          return;
      if (state && (state.name === 'preparing' || state.name === 'preview' || state.name === 'claiming' || state.name === 'countIn' || state.name === 'playing')) {
          void srtAbandonClaim(status);
          return;
      }
      srtBeginOperation();
  }
  function srtNavigateAttempt() {
      const state = SR.srtState;
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
      if (!SR.srtFingerprint)
          return;
      const operation = srtBeginOperation();
      const fingerprint = SR.srtFingerprint;
      SR.srtState = SRT_INITIAL_STATE;
      srtSetState({ type: 'prepare', mode: 'practice', fingerprint });
      srtSetState({ type: 'startPreview' });
      void srAssessStart(operation);
  }
  async function srtStartFirstSight() {
      if ((!SR.srtPiece && !SR.lvPiece) || !SR.srtFingerprint)
          return;
      if (SR.srtState?.name !== 'idle' || SR.srtState.mode !== 'firstSight')
          return;
      const operation = srtBeginOperation();
      const claimedFingerprint = SR.srtFingerprint;
      const pendingExposure = srtExposurePromise?.fingerprint === claimedFingerprint ? srtExposurePromise.promise : null;
      const idleState = SR.srtState;
      if (pendingExposure) {
          const result = await pendingExposure;
          if (!srtOperationStillCurrent(operation, idleState, null))
              return;
          if (!result.ok)
              srtNotice(srtLedgerFailureMessage(result.reason));
          else
              srtNotice(t('rd_srt_error_already_exposed'));
          srtStartPractice();
          return;
      }
      const ledgerStatus = srtLedgerReadStatus(localStorage);
      if (shell.storeBlocked() || ledgerStatus === 'unsupported') {
          srtStartPractice();
          srtNotice(t('rd_srt_ledger_unsupported'));
          return;
      }
      const ledger = srtReadLedger(localStorage);
      if (ledger.exposures[SR.srtFingerprint]) {
          srtNotice(t('rd_srt_error_already_exposed'));
          srtStartPractice();
          return;
      }
      if (!navigator.locks || typeof navigator.locks.request !== 'function') {
          srtStartPractice();
          srtNotice(t('rd_srt_no_locks'));
          return;
      }
      const context = ensureAudio();
      if (!context) {
          audioLockCheck();
          return;
      }
      if (context.state !== 'running') {
          const ready = await timedAudioReady(context);
          if (!srtOperationStillCurrent(operation, idleState, null) || !ready)
              return;
      }
      srtNotice(null);
      srtSetState({ type: 'prepare', mode: 'firstSight', fingerprint: SR.srtFingerprint, attemptId: srtAttemptId() });
      srtSetState({ type: 'claim' });
      const attemptId = SR.srtState?.attemptId;
      if (!attemptId)
          return;
      const lease = srtAcquireAttemptLease(attemptId);
      if (!lease) {
          byId('rd-verdict').textContent = t('rd_srt_no_locks');
          return;
      }
      SR.srtLease = lease;
      srtClaimIssuedAttemptId = null;
      srtClaimDurableAttemptId = null;
      await lease.ready;
      const claimingState = SR.srtState;
      if (!srtOperationStillCurrent(operation, claimingState, attemptId)) {
          srtReleaseLease(lease);
          return;
      }
      srtClaimIssuedAttemptId = attemptId;
      const result = await srtProgressLedgerUpdate({
          type: 'claimExposure',
          fingerprint: SR.srtFingerprint,
          attemptId,
          ownerTabId: SR.srtOwnerTabId || '',
          generation: ledger.generation,
      });
      if (result.ok)
          srtClaimDurableAttemptId = attemptId;
      if (!srtOperationStillCurrent(operation, claimingState, attemptId)) {
          if (result.ok) {
              const cleanup: SrtAttemptCleanup = {
                  attemptId,
                  ownerTabId: SR.srtOwnerTabId || '',
                  generation: result.ledger.generation,
                  lease,
                  mixedInput: srtRecorder?.mixedInput ?? false,
              };
              const cancelledByNavigation = srtIsAbandoned() || SR.srtFingerprint !== claimedFingerprint;
              await srtEnsureAbandoned(cleanup, cancelledByNavigation ? 'abandoned' : 'interrupted');
              if (srtClaimIssuedAttemptId === attemptId)
                  srtClaimIssuedAttemptId = null;
              if (srtClaimDurableAttemptId === attemptId)
                  srtClaimDurableAttemptId = null;
          }
          else if (srtClaimIssuedAttemptId === attemptId)
              srtClaimIssuedAttemptId = null;
          if (!result.ok && srtClaimDurableAttemptId === attemptId)
              srtClaimDurableAttemptId = null;
          srtReleaseLease(lease);
          return;
      }
      if (!result.ok) {
          if (srtClaimIssuedAttemptId === attemptId)
              srtClaimIssuedAttemptId = null;
          if (srtClaimDurableAttemptId === attemptId)
              srtClaimDurableAttemptId = null;
          srtReleaseLease(lease);
          const retryable = result.reason === 'stale_generation' || result.reason === 'conflict' || result.reason === 'owner_mismatch';
          if (retryable) {
              SR.srtState = { ...SRT_INITIAL_STATE, fingerprint: claimedFingerprint };
              SR.srtPendingAttempt = null;
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
      if (SR.lvPiece) {
          // A level piece was on the page already: the claimed attempt starts at once (a count-in, or the note that started it).
          srtStartClaimedAttempt(operation);
          return;
      }
      srtPreviewUi(true);
      // The older melodies get 20 seconds to look.
      SR.srtCountdown = 20;
      byId('rd-srt-countdown').textContent = t('rd_srt_countdown', SR.srtCountdown);
      window.clearInterval(SR.srtPreviewTimer);
      const previewOperation = srtOperationEpoch;
      SR.srtPreviewTimer = window.setInterval(() => {
          if (previewOperation !== srtOperationEpoch || SR.srtState?.name !== 'preview' || SR.srtState.attemptId !== attemptId) {
              srtClearPreview();
              return;
          }
          SR.srtCountdown = Math.max(0, (SR.srtCountdown || 0) - 1);
          byId('rd-srt-countdown').textContent = t('rd_srt_countdown', SR.srtCountdown);
          if (SR.srtCountdown <= 0) {
              srtClearPreview();
              srtStartClaimedAttempt(previewOperation);
          }
      }, 1000);
  }
  function srtStartClaimedAttempt(operation = srtOperationEpoch) {
      const state = SR.srtState;
      if (operation !== srtOperationEpoch || state?.name !== 'preview' || state.mode !== 'firstSight' || !state.attemptId)
          return;
      srtClearPreview();
      srtSetState({ type: 'startNow' });
      if (SR.srtState?.name !== 'countIn' || SR.srtState.attemptId !== state.attemptId)
          return;
      void srAssessStart(operation);
  }
  async function srtSwitchToPractice() {
      const operation = srtBeginOperation();
      const state = SR.srtState;
      const attempt = srtCaptureAttempt(state);
      if (state?.name === 'preview')
          srtSetState({ type: 'abandon' });
      const result = attempt ? await srtEnsureAbandoned(attempt, 'abandoned') : { ok: true, ledger: srtReadLedger(localStorage) } satisfies SightReadingLedgerResult;
      const terminalStatus = attempt ? srtAttemptStatus(attempt.attemptId) : null;
      if (!srtOperationStillCurrent(operation, SR.srtState, attempt?.attemptId ?? null)) {
          if (result.ok || terminalStatus) {
              srtClearPendingAttempt(attempt?.attemptId ?? '');
              if (attempt && srtClaimIssuedAttemptId === attempt.attemptId)
                  srtClaimIssuedAttemptId = null;
              if (attempt && srtClaimDurableAttemptId === attempt.attemptId)
                  srtClaimDurableAttemptId = null;
              srtReleaseLease(attempt?.lease ?? null);
          }
          else
              srtReleaseLease(attempt?.lease ?? null);
          return;
      }
      if (!result.ok && !terminalStatus) {
          srtReleaseLease(attempt?.lease ?? null);
          srtClearPendingAttempt(attempt?.attemptId ?? '');
          if (attempt && srtClaimIssuedAttemptId === attempt.attemptId)
              srtClaimIssuedAttemptId = null;
          if (attempt && srtClaimDurableAttemptId === attempt.attemptId)
              srtClaimDurableAttemptId = null;
          srtStartPractice();
          srtNotice(srtLedgerFailureMessage(result.reason, 'practice-switch'));
          return;
      }
      if (!result.ok && terminalStatus === 'completed') {
          srtReleaseLease(attempt?.lease ?? null);
          srtClearPendingAttempt(attempt?.attemptId ?? '');
          if (attempt && srtClaimIssuedAttemptId === attempt.attemptId)
              srtClaimIssuedAttemptId = null;
          if (attempt && srtClaimDurableAttemptId === attempt.attemptId)
              srtClaimDurableAttemptId = null;
          srtPendingUi(false);
          srtSetState({ type: 'saved' });
          srRenderAssessResult();
          return;
      }
      srtReleaseLease(attempt?.lease ?? null);
      SR.srtPendingAttempt = null;
      SR.srtState = SRT_INITIAL_STATE;
      srtSetState({ type: 'prepare', mode: 'practice', fingerprint: SR.srtFingerprint ?? undefined });
      srtSetState({ type: 'startPreview' });
      srDraw();
      void srAssessStart(operation);
  }
  async function srAssessStart(operation?: number) {
      const srtState = SR.srtState;
      if (srtGeneratedSelected() && srtState?.mode === 'firstSight' &&
          (srtState.name !== 'countIn' || !srtState.attemptId ||
              srtCountInEpoch !== srtOperationEpoch || srtCountInAttemptId !== srtState.attemptId ||
              operation !== undefined && operation !== srtOperationEpoch))
          return;
      const context = ensureAudio();
      if (!context) {
          srStopAll();
          return;
      }
      const runId = ++srAssessRunId;
      SR.active = true;
      if (context.state !== 'running') {
          const epoch = srtOperationEpoch;
          const ready = await timedAudioReady(context);
          if (!SR.active || runId !== srAssessRunId || epoch !== srtOperationEpoch) return;
          if (!ready) {
              srStopAll();
              return;
          }
      }
      srStartStage();
      rdnNavUi();
      rdWarmButtonsSync();
      SR.results = {};
      SR.wrongExtra = 0;
      SR.srtEvaluation = null;
      SR.srtResultValue = null;
      SR.srtResultLevelId = null;
      SR.next = null;
      srCoach();
      rdnResultHide();
      SR.steps.forEach((s) => s.closed = false);
      srPaintAll();
      if (!SR.piece)
          throw new Error('Étude: no piece selected');
      const lvPiece = srtGeneratedSelected() ? SR.lvPiece ?? null : null;
      // First sight: a level piece is played at its level's tempo, an older melody at 60.
      SR.bpm = SR.srtState?.mode === 'firstSight' ? (lvPiece ? rdnBpm(lvPiece) : 60) : +(inputById('rd-bpm').value || SR.piece.bpm);
      inputById('rd-bpm').value = String(SR.bpm);
      byId('rd-bpmLbl').textContent = String(SR.bpm);
      const bs = 60 / SR.bpm, cap = SR.piece.ts[1] === 8 ? SR.piece.ts[0] * 0.5 : SR.piece.ts[0], ci = cap, pk = SR.piece.pickup || 0;
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
          srtLevelClicks(lvPiece, SR.bpm).filter((c) => act0 + c.ms / 1000 > from).forEach((c) => srClick(act0 + c.ms / 1000, c.accent));
      }
      else if (lvPiece) {
          const clicks = srtLevelClicks(lvPiece, SR.bpm), barMs = srtLevelDurationMs(lvPiece, SR.bpm) / lvPiece.bars;
          lead = barMs / 1000;
          clicks.filter((c) => c.ms < barMs - 1e-6).forEach((c) => srClick(act0 + c.ms / 1000, c.accent));
          clicks.forEach((c) => srClick(act0 + lead + c.ms / 1000, c.accent));
      }
      else {
          for (let b = 0; b < ci; b++)
              srClick(act0 + b * bs, b === 0);
          for (let b = 0; b <= SR.totalBeats + 1e-3; b++) {
              const rel = b - pk;
              srClick(act0 + (ci + b) * bs, rel >= 0 && Math.abs(rel % cap) < 1e-3);
          }
      }
      const sel = srActiveHands();
      if (sel !== 'both' && srHandsAvail() === 'both')
          SR.notes.filter((n) => n.hand !== sel).forEach((n) => host.audio.previewNote(n.midi, act0 + lead + n.beat * bs, Math.max(.15, n.dur * bs * .9), 78));
      SR.t0 = perf0 + lead * 1000;
      SR.anyOctave = !!host.store.data().settings.anyOctave;
      SR.instantFeedback = !!host.store.data().reading?.prefs?.instantFeedback;
      srInstantReset();
      if (SR.instantFeedback)
          srInstantTracker = createInstantFeedbackTracker(srInstantNotes(), { anyOctave: SR.anyOctave });
      srtRecorder = new SightReadingRecorder({ durationMs: lvPiece ? srtLevelDurationMs(lvPiece, SR.bpm) : SR.totalBeats * bs * 1000 });
      // The note that started the attempt, and what was played while the first sight was being claimed, belong to it.
      if (noteStart)
          for (const ev of noteStart.events) {
              const relMs = ev.perf - SR.t0;
              srtRecorder.record(ev.kind, ev.midi, ev.source, ev.releaseKind, relMs);
              if (ev.kind === 'on' && SR.instantFeedback)
                  srInstantHandleNote(ev.midi, relMs);
          }
      // The checklist goes out of sight but keeps its room: the score must not move under the first note.
      const checklist = maybeById('rdn-checklist');
      if (checklist)
          checklist.style.visibility = 'hidden';
      SR.assessOn = false;
      if (SR.srtState?.name === 'preparing')
          srtSetState({ type: 'startPreview' });
      if (SR.srtState?.name === 'countIn' && noteStart)
          srtSetState({ type: 'countInDone' });
      else if (SR.srtState?.name === 'countIn')
          SR.timers.push(setTimeout(() => {
              if (SR.active && SR.srtState?.name === 'countIn')
                  srtSetState({ type: 'countInDone' });
          }, lead * 1000));
      if (!SR.instantFeedback || !srInstantVerdictShown) {
          const v = byId('rd-verdict');
          v.className = 'verdict neutral';
          v.textContent = t('rd_count');
      }
      byId('rd-go').textContent = t('rd_stop');
      SR.raf = requestAnimationFrame(srAssessLoop);
  }
  function srTol() { return Math.min(0.55, 0.3 * SR.bpm / 60); }
  /* ---- a level piece starts on its first note ---- */
  /** The first notes the active hands play: their beat and their keys. */
  function srFirstNotes(): { beat: number; midis: number[] } | null {
      const sel = srActiveHands(), mine = SR.notes.filter((n) => sel === 'both' || n.hand === sel);
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
      if (view0() !== 'read' || RDN.screen !== 'player' || !SR.piece || !SR.lvPiece || !srtGeneratedSelected())
          return false;
      if (SR.active || SR.listening || SR.modeSel !== 'assess' || WARM.on || srtPendingSaveProtected() || performance.now() < srNoteArmAt)
          return false;
      const state = SR.srtState;
      return !(state && (state.name === 'preparing' || state.name === 'claiming' || state.name === 'preview' || state.name === 'countIn' ||
          state.name === 'playing' || state.name === 'pendingSave' || state.name === 'completed' && SR.srtPendingAttempt?.attemptId === state.attemptId));
  }
  /** A key went down or came up. Returns true when the event belongs to a start by the first note (it starts one, or one is being claimed). */
  function srNoteStartInput(kind: 'on' | 'off', midi: number, source: string, releaseKind: 'physical' | 'focus' | 'reset' | null) {
      const now = performance.now(), perf = inputTimeForRelease(releaseKind, now);
      const claiming = SR.srtState?.name === 'preparing' || SR.srtState?.name === 'claiming';
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
      rdnAutoCancel();
      srNoteStart = { perf, receivedAt: now, events: [{ kind, midi, source, releaseKind, perf }] };
      srGo();
      // Nothing started (and no first sight is being claimed): the key was only a key.
      const name = SR.srtState?.name;
      if (!SR.active && name !== 'preparing' && name !== 'claiming')
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
      if (!SR.active || SR.modeSel !== 'assess')
          return;
      const bs = 60 / SR.bpm, bNow = (ts - SR.t0) / 1000 / bs;
      if (bNow >= 0 && !SR.assessOn) {
          SR.assessOn = true;
          if (!SR.instantFeedback || !srInstantVerdictShown)
              byId('rd-verdict').textContent = t('rd_play');
      }
      if (SR.instantFeedback && SR.assessOn)
          srInstantSweep(ts - SR.t0);
      const at = srBeatPt(SR.beatX, Math.max(0, Math.min(bNow, SR.totalBeats)));
      srCursor(at.x, at.sy);
      if (bNow >= SR.totalBeats + (0.25 / bs)) {
          srAssessFinish();
          return;
      }
      SR.raf = requestAnimationFrame(srAssessLoop);
  }
  function srAssessFinish() {
      // A key played just past the end is the end of this attempt, not the start of the next.
      srNoteStartHold(1000);
      const generated = srtGeneratedSelected();
      const lvPiece = generated ? SR.lvPiece ?? null : null;
      const firstSight = SR.srtState?.mode === 'firstSight' && !!SR.srtState.attemptId;
      const expected = lvPiece
          ? srtLevelExpected(lvPiece, { bpm: SR.bpm, hand: srHandSel() })
          : generated && SR.srtPiece
          ? srtBuildExpected(SR.srtPiece, { bpm: SR.bpm, hand: srActiveHands() as 'rh' | 'lh' })
          : SR.notes.map((note): SightReadingExpected => ({
              id: String(note.nid), midi: note.midi, hand: note.hand,
              onMs: note.beat * (60000 / SR.bpm), offMs: (note.beat + note.dur) * (60000 / SR.bpm),
              restBeforeMs: 0, restAfterMs: 0,
          }));
      const performed = srtRecorder?.finish().map((input): SightReadingPerformed => ({
          id: input.id, midi: input.midi, onMs: input.onMs, offMs: input.offMs,
      })) ?? [];
      const restWindows = lvPiece ? rdnRestWindows(lvPiece, SR.bpm, srHandSel()) : generated && SR.srtPiece ? SR.srtPiece.events
          .filter((event) => event.pitches.length === 0)
          .map((event) => ({ startMs: event.onsetTick * 60000 / SR.bpm / 480, endMs: (event.onsetTick + event.durationTick) * 60000 / SR.bpm / 480 })) : [];
      // A level piece allows 120 ms between the notes of one beat (two hands rarely land closer); the old path keeps 60.
      const evaluated = srtEvaluate(expected, performed, { restWindows, anyOctave: !!SR.anyOctave, ...(lvPiece ? { chordWindowMs: RDN_CHORD_WINDOW_MS } : {}) });
      if (evaluated) {
          const renderedNotes = SR.notes.filter((note) => srActiveHands() === 'both' || note.hand === srActiveHands());
          // A level piece lists the right hand first and may start both hands together: its results find their notes by id.
          const idMap = lvPiece ? rdnDrawnIds(lvPiece, expected) : null;
          evaluated.noteResults.forEach((result, index) => {
              const nid = idMap ? idMap.get(result.expectedId) : renderedNotes[index]?.nid ?? Number(result.expectedId);
              if (nid === undefined)
                  return;
              SR.results[nid] = result.classification === 'good' || result.classification === 'near'
                  ? result.classification
                  : 'bad';
          });
          SR.wrongExtra = evaluated.FP;
      }
      const totalN = expected.length;
      const good = evaluated ? evaluated.G : Object.values(SR.results).filter((r) => r === 'good').length;
      const pct = evaluated?.score == null ? (totalN ? Math.round(100 * good / totalN) : 0) : Math.round(evaluated.score);
      SR.next = srNextAssess(pct);
      srStopAll(true, true);
      srtSetState({ type: 'finish' });
      SR.srtEvaluation = evaluated;
      SR.srtResultValue = pct;
      SR.srtResultLevelId = SR.piece?.gen ?? null;
      if (SR.piece?.gen)
          rdSightDone('assess', pct);
      srRenderAssessResult();
      if (lvPiece && evaluated && evaluated.score != null) {
          rdnRecord(pct, rdnStars(evaluated.stars), firstSight);
          rdnResultShow(true);
      }
      if (evaluated && generated && SR.srtState?.attemptId && SR.srtFingerprint && SR.srtOwnerTabId) {
          const attempt: SightReadingAttempt = {
              ...evaluated,
              status: 'completed',
              attemptId: SR.srtState.attemptId,
              fingerprint: SR.srtFingerprint,
              ownerTabId: SR.srtOwnerTabId,
              generation: srtReadLedger(localStorage).generation,
              finishedAt: Date.now(),
              mixedInput: srtRecorder?.mixedInput ?? false,
          };
          SR.srtPendingAttempt = attempt;
          rdnNavUi();
          const saveOperation = srtOperationEpoch;
          const completedState = SR.srtState;
          const saveLease = SR.srtLease ?? null;
          void srtProgressLedgerUpdate({ type: 'finishAttempt', attempt, generation: attempt.generation }).then(async (result) => {
              if (!srtOperationStillCurrent(saveOperation, completedState, attempt.attemptId)) {
                  if (result.ok || srtAttemptStatus(attempt.attemptId)) {
                      srtClearPendingAttempt(attempt.attemptId);
                      if (srtClaimIssuedAttemptId === attempt.attemptId)
                          srtClaimIssuedAttemptId = null;
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
                          if (srtClaimIssuedAttemptId === attempt.attemptId)
                              srtClaimIssuedAttemptId = null;
                          srtReleaseLease(saveLease);
                      }
                  }
                  return;
              }
              if (result.ok) {
                  srtSetState({ type: 'saved' });
                  storeDaily();
                  srtClearPendingAttempt(attempt.attemptId);
                  if (srtClaimIssuedAttemptId === attempt.attemptId)
                      srtClaimIssuedAttemptId = null;
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
      srtRecorder = null;
      markReadDoneToday();
      touchDay();
      saveAll();
  }
  function srRenderAssessResult() {
      const evaluated = SR.srtEvaluation;
      if (!evaluated)
          return;
      const pct = SR.srtResultValue ?? (evaluated.score == null ? 0 : Math.round(evaluated.score));
      const stars = evaluated.stars;
      const v = byId('rd-verdict');
      v.className = 'verdict ' + (stars >= 2 ? 'good' : stars ? 'neutral' : 'bad');
      const firstSightResult = srtGeneratedSelected() && SR.srtState?.mode === 'firstSight' && SR.srtState.attemptId !== null;
      const practiceResult = srtGeneratedSelected() && SR.srtState?.mode === 'practice';
      const modeLabel = firstSightResult ? t('rd_srt_first_sight') : practiceResult ? t('rd_srt_practice_badge') : '';
      const modeSuffix = modeLabel ? ' · ' + modeLabel : '';
      let text = t('rd_score', pct) + '  ' + '★'.repeat(stars) + '☆'.repeat(3 - stars) + modeSuffix +
          ' · ' + t('rd_srt_summary', Math.round(evaluated.pitchF1 ?? 0), evaluated.TP, evaluated.N, evaluated.FP, Math.round(evaluated.rhythmAcc ?? 0), Math.round(evaluated.meanOffsetMs ?? 0));
      if (SR.wrongExtra)
          text += '  ·  ' + t('rd_extra', SR.wrongExtra);
      if (SR.srtState?.name === 'pendingSave')
          text += ' · ' + t('rd_srt_unsaved');
      v.textContent = text;
  }
  function srKeyInput(m: number) {
      if (!SR.active)
          return;
      if (SR.modeSel === 'learn') {
          const st = SR.steps[SR.stepIdx];
          if (!st)
              return;
          const need = st.notes.find((n: { nid: number; midi: number; }) => !SR.hit.has(n.nid) && samePitch(n.midi, m, SR.anyOctave));
          if (need) {
              SR.hit.add(need.nid);
              SR.results[need.nid] = 'good';
              if (st.notes.every((n: { nid: number; }) => SR.hit.has(n.nid))) {
                  const next = SR.steps[SR.stepIdx + 1];
                  srPlayGap(st.beat, next ? next.beat : 1e9);
                  SR.stepIdx++;
                  SR.hit.clear();
                  if (SR.stepIdx >= SR.steps.length) {
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
              SR.mistakes++;
              srSlipNote(st, m);
              kbState(m, 'bad', true);
              SR.timers.push(setTimeout(() => { const el = shell.keyEl.get(foldToView(m)); if (el && el.dataset.s === 'bad')
                  kbState(m, null, true); srTargets(); }, 320));
              srCount();
          }
      }
  }
  function srListen() {
      if (!SR.piece)
          return;
      if (srtPendingSaveProtected())
          return;
      srtCancelAttempt('interrupted');
      if (SR.listening) {
          srStopAll(true, true);
          return;
      }
      if (srtGeneratedSelected() && SR.srtFingerprint)
          srtExposeForPractice('listen', 'listen');
      ensureAudio();
      srStopAll(true, true);
      SR.bpm = +(inputById('rd-bpm').value || SR.piece.bpm);
      inputById('rd-bpm').value = String(SR.bpm);
      byId('rd-bpmLbl').textContent = String(SR.bpm);
      if (!shell.audioEngine.context)
          return;
      const bs = 60 / SR.bpm, act0 = shell.audioEngine.context.currentTime + 0.1, perf0 = performance.now() + 100;
      SR.listening = true;
      byId('rd-listen').textContent = t('rd_stop');
      rdWarmButtonsSync();
      const follow = () => { if (!SR.listening)
          return; const b = (performance.now() - perf0) / 1000 / bs; if (b >= 0) {
          const at = srBeatPt(SR.beatX, Math.min(b, SR.totalBeats));
          srCursor(at.x, at.sy);
      } SR.raf = requestAnimationFrame(follow); };
      SR.raf = requestAnimationFrame(follow);
      SR.timers.push(setTimeout(() => srStopAll(true), SR.totalBeats * bs * 1000 + 400));
      SR.notes.forEach((n) => {
          host.audio.previewNote(n.midi, act0 + n.beat * bs, Math.max(.15, n.dur * bs * .92), n.hand === 'lh' ? 80 : 96);
          SR.timers.push(setTimeout(() => {
              const svg = srSvg(), g = svg && svg.querySelector('.ss-n[data-nid="' + n.nid + '"]');
              if (!(g instanceof SVGElement))
                  return;
              const prev = g.getAttribute('data-s');
              g.dataset.s = 'now';
              SR.timers.push(setTimeout(() => { if (g.dataset.s === 'now') {
                  if (prev)
                      g.dataset.s = prev;
                  else
                      g.removeAttribute('data-s');
              } }, Math.max(200, n.dur * bs * 900)));
          }, Math.max(0, (perf0 - performance.now()) + n.beat * bs * 1000)));
      });
  }
  function srGo() {
      if (!SR.piece)
          return;
      const srtState = SR.srtState;
      if (srtState && (srtState.name === 'preparing' || srtState.name === 'claiming' || srtState.name === 'preview' ||
          srtState.name === 'pendingSave' || srtState.name === 'completed' && SR.srtPendingAttempt?.attemptId === srtState.attemptId))
          return;
      if (SR.active) {
          srStopAll();
          byId('rd-verdict').textContent = '';
          return;
      }
      if (shell.scoreFocus.owner !== 'read') shell.scoreFocus.readOverride = null;
      srStopAll();
      ensureAudio();
      SR.bpm = +(inputById('rd-bpm').value || SR.piece.bpm);
      if (SR.modeSel === 'learn')
          srLearnStart();
      else if (srtGeneratedSelected() && SR.lvPiece && SR.srtState?.mode === 'firstSight' && SR.srtState.name === 'idle' && srHandSel() !== 'both') {
          // A level piece's first sight is played with both hands: one hand is practice, with no first-sight claim.
          srtExposeForPractice('hands');
          srtStartPractice();
      }
      else if (srtGeneratedSelected() && SR.srtState?.mode === 'firstSight' && SR.srtState.name === 'idle')
          void srtStartFirstSight();
      else if (srtGeneratedSelected()) {
          const state = SR.srtState;
          if (state?.name === 'pendingSave' || state?.name === 'preview' || state?.name === 'claiming' || state?.name === 'preparing')
              return;
          if (SR.modeSel === 'assess' && (state?.mode === 'practice' || state?.name === 'completed' || state?.name === 'saved' ||
              state?.name === 'abandoned' || state?.name === 'interrupted'))
              srtNotice(t('rd_srt_error_already_exposed'));
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
      if (SR.lvPiece) {
          const rk = SR.lvPiece.key;
          const majorPc = srKeyName(rk.keyN);
          const minor = rk.mode === 'minor';
          const tonicPc = minor ? (majorPc + 9) % 12 : majorPc;
          return { tonicPc, minor, flat: rk.keyN < 0, keyN: rk.keyN };
      }
      if (SR.piece) {
          const n = SR.piece.keyN || 0;
          const majorPc = srKeyName(n);
          const minor = !!SR.piece.minor;
          const tonicPc = minor ? (majorPc + 9) % 12 : majorPc;
          return { tonicPc, minor, flat: n < 0, keyN: n };
      }
      return null;
  }
  function rdWarmButtonsSync() {
      const info = rdCurrentKeyInfo();
      const show = !!info;
      const busy = SR.active || SR.listening || srtPendingSaveProtected();
      const keyLabel = info ? t(info.minor ? 'key_minor' : 'key_major', pcName(info.tonicPc, info.flat)) : '';
      const tonicBtn = maybeById('rd-warm-tonic');
      const scaleBtn = maybeById('rd-warm-scale');
      if (tonicBtn) {
          tonicBtn.hidden = !show;
          if (tonicBtn instanceof HTMLButtonElement)
              tonicBtn.disabled = !show || busy;
          tonicBtn.title = keyLabel;
          tonicBtn.setAttribute('aria-label', keyLabel ? `${t('rd_warm_tonic')} — ${keyLabel}` : t('rd_warm_tonic'));
      }
      if (scaleBtn) {
          scaleBtn.hidden = !show;
          if (scaleBtn instanceof HTMLButtonElement)
              scaleBtn.disabled = !show || busy;
          scaleBtn.title = keyLabel;
          scaleBtn.setAttribute('aria-label', keyLabel ? `${t('rd_warm_scale')} — ${keyLabel}` : t('rd_warm_scale'));
      }
  }
  function rdWarmPlayTonic() {
      const info = rdCurrentKeyInfo();
      if (!info || SR.active || SR.listening || srtPendingSaveProtected())
          return;
      ensureAudio();
      if (!shell.audioEngine.context)
          return;
      stopPreviews();
      const base = info.tonicPc >= 7 ? 48 + info.tonicPc : 60 + info.tonicPc;
      const t0 = shell.audioEngine.context.currentTime + 0.04;
      host.audio.previewNote(base, t0, 0.34, 88);
      host.audio.previewNote(base + 7, t0 + 0.24, 0.34, 84);
      host.audio.previewNote(base + 12, t0 + 0.48, 0.56, 92);
  }
  function rdWarmPracticeScale() {
      const info = rdCurrentKeyInfo();
      if (!info || SR.active || SR.listening || srtPendingSaveProtected())
          return;
      const key = String(info.tonicPc);
      const techKind: TechniqueKind = info.minor ? 'naturalMinor' : 'major';
      withPractice((p) => {
          p.setTopic(TECHNIQUE_TOPIC);
          p.setKey(key);
          host.nav.show('practice');
          p.startSession({ cat: TECHNIQUE_TOPIC, mode: 'play', key, techKind, techOctaves: 1 });
      });
  }
  function srMeta() {
      const p = SR.piece, titleEl = maybeById('rd-gen-title');
      rdWarmButtonsSync();
      if (!p) {
          byId('rd-meta').textContent = '';
          if (titleEl)
              titleEl.textContent = '';
          return;
      }
      const n = p.keyN || 0;
      const keyPc = p.minor ? ((srKeyName(n) + 9) % 12) : srKeyName(n), key = t(p.minor ? 'key_minor' : 'key_major', pcName(keyPc, n < 0));
      // A level piece never names its key here: in mixed keys, reading the signature is part of the task.
      const lvHead = SR.lvPiece && srtGeneratedSelected() ? rdnHeadText() : null;
      const metaText = lvHead ? lvHead.sub + ' · ' + p.ts[0] + '/' + p.ts[1] : (p.gen ? t('rdx_sr_meta', key, p.bpm) : key) + ' · ' + p.ts[0] + '/' + p.ts[1];
      byId('rd-meta').textContent = metaText;
      if (titleEl)
          titleEl.textContent = srPieceTitle(p);
      const tEl = maybeById('rd-stage-title'), sEl = maybeById('rd-stage-sub');
      if (tEl)
          tEl.textContent = srPieceTitle(p);
      if (sEl)
          sEl.textContent = metaText;
  }
  // Before the first melody the tab offers only the generator (and a way to the built-in pieces).
  function srEmptyUi() {
      const none = !SR.piece;
      buttonById('rd-go').disabled = none;
      buttonById('rd-listen').disabled = none;
      rdWarmButtonsSync();
      const empty = maybeById('rd-empty');
      if (empty)
          empty.hidden = !none;
      syncMobileStartBars();
  }
  // Shows the generated sight-reading melody (`id` is its id); a result waiting to be saved keeps the current one.
  function srSelectPiece(id: string) {
      if (srtPendingSaveProtected() || !SR.gen || id !== SR.gen.id)
          return;
      if (!SR.srtPiece && RD.L && isRdSightLevel(RD.L)) {
          rdSightStart(SR.modeSel === 'assess' ? 'test' : 'practice');
          return;
      }
      srShowPiece(SR.gen);
  }
  // Draws a piece in the engine: the generated melody, or a fixture piece loaded through the test surface.
  function srShowPiece(piece: SrPiece) {
      if (srtPendingSaveProtected())
          return;
      srStopAll(undefined, false, 'navigate');
      SR.srtEvaluation = null;
      SR.srtResultValue = null;
      SR.srtResultLevelId = null;
      SR.piece = piece;
      if (!SR.gen) {
          SR.srtPiece = null;
          SR.lvPiece = null;
          SR.srtFingerprint = null;
          SR.srtState = SRT_INITIAL_STATE;
          SR.srtPendingAttempt = null;
      }
      SR.bpm = piece.bpm;
      const bp = inputById('rd-bpm');
      bp.value = String(piece.bpm);
      byId('rd-bpmLbl').textContent = String(piece.bpm);
      rdnHandsUi();
      const avail = srHandsAvail();
      [byId('rd-hands'), maybeById('rd-stage-hands')].forEach((container) => {
          if (!container)
              return;
          [...container.children].forEach((b) => {
              if (!(b instanceof HTMLButtonElement))
                  return;
              b.disabled = avail !== 'both';
              b.setAttribute('aria-pressed', (avail === 'both' ? b.dataset.v === SR.hands : b.dataset.v === avail) ? 'true' : 'false');
          });
      });
      const consumedForLearn = srtConsumeOnLearnReveal();
      srDraw();
      srMeta();
      srEmptyUi();
      byId('rd-verdict').textContent = '';
      srtNotice(null);
      if (!consumedForLearn && srtGeneratedSelected() && (SR.srtState?.mode === 'practice' || SR.srtState?.name === 'abandoned' || SR.srtState?.name === 'interrupted')) {
          const message = t('rd_srt_error_already_exposed');
          srtNotice(message);
          if (SR.srtState.name === 'abandoned' || SR.srtState.name === 'interrupted') {
              byId('rd-verdict').className = 'verdict neutral';
              byId('rd-verdict').textContent = message;
          }
      }
  }
  function renderRead() {
      if (RDN.fresh) {
          RDN.fresh = false;
          RDN.screen = 'home';
      }
      if (SR.piece)
          srDraw();
      srMeta();
      srEmptyUi();
      rdRender();
  }
  /* ============================================================================
     READING DRILLS (V3) — a structured, CMRT-style reading curriculum:
     note naming / playing, key→staff, intervals, chords, key signatures, rhythm,
     C clefs and generated sight-reading, with optional weak-spot injection, stars & stats.
     ============================================================================ */
  const RD_REF: Record<ReadClefStaff, number> = { treble: 30, bass: 18, alto: 24, tenor: 22 };
  const RD_CLEFC: Record<ReadClefStaff, string> = { treble: 't', bass: 'b', alto: 'a', tenor: 'n' };
  const RD_MAJ = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'], RD_MIN = ['Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#'];
  const RD_CHQ: Record<ReadDrillChordQuality, number[]> = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8] };
  const RD_TARGET: Partial<Record<ReadDrillType, number>> = { name: 2500, play: 3500, k2s: 4000, iv: 3500, ch: 6000, ks: 5000 };
  function rdP(s: string | undefined): ReadDrillPitch { const p = s === undefined ? null : srPitch(s); if (!p)
      throw new Error('Étude: bad pitch ' + s); return { li: p.li, oct: p.oct, acc: p.acc }; }
  function rdStep(n: { li: number; oct: number; }) { return n.oct * 7 + n.li; }
  function rdMidi(n: { li: number; oct: number; acc?: number; }) { return ssMidiOf(n.li, n.oct, n.acc || 0); }
  function rdFromStep(s: number, acc?: number): ReadDrillPitch { return { li: ((s % 7) + 7) % 7, oct: Math.floor(s / 7), acc: acc || 0 }; }
  function rdAccSym(a: number) { return a > 0 ? '♯' : a < 0 ? '♭' : ''; }
  function rdLetter(li: number) { return (LETTERS[host.i18n.notation()] || LETTERS.letter)[li]; }
  function rdName(n: { li: number; oct: number; acc?: number; }, oct?: boolean) { return spelledName(host.i18n.notation(), n.li, n.acc || 0) + (oct ? n.oct : ''); }
  function rdSpell(s: string) { const m = /^([A-G])([#b]?)$/.exec(s); return m ? spelledName(host.i18n.notation(), SR_LET.indexOf(m[1]), m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) : ''; }
  function rdKeyLabel(k: number) { return t('key_major', rdSpell(RD_MAJ[k + 7])); }
  function rdKeyMinor(k: number) { return t('key_minor', rdSpell(RD_MIN[k + 7])); }
  function rdNk(clef: ReadClefStaff, n: { li: number; oct: number; acc?: number; }) { return RD_CLEFC[clef] + ':' + SR_LET[n.li] + ((n.acc || 0) > 0 ? '#' : (n.acc || 0) < 0 ? 'b' : '') + n.oct; }
  /* ---- staff renderer for drills (whole-note columns, any clef, key signatures) ---- */
  function rdCClef(x: number, cy: number) {
      const p = (s: number) => `<path class="rdx-cc" d="M ${x + 9},${cy} C ${x + 13},${cy - 3 * s} ${x + 14},${cy - 8 * s} ${x + 15},${cy - 11 * s} C ${x + 18},${cy - 8 * s} ${x + 24},${cy - 10 * s} ${x + 24},${cy - 17 * s} C ${x + 24},${cy - 25 * s} ${x + 16},${cy - 26 * s} ${x + 12},${cy - 21 * s}"/>`;
      return `<g class="rdx-cclef"><rect x="${x}" y="${cy - 24}" width="4.5" height="48"/><rect x="${x + 6.5}" y="${cy - 24}" width="1.6" height="48"/>${p(1)}${p(-1)}</g>`;
  }
  function rdKsSvg(clef: ReadClefStaff, keyN: number, x: number, top: number) {
      const bot = top + 48, ref = RD_REF[clef], off = ({ treble: 0, bass: -2, alto: -1, tenor: -1 } )[clef];
      const sT = [[3, 5], [0, 5], [4, 5], [1, 5], [5, 4], [2, 5], [6, 4]], fT = [[6, 4], [2, 5], [5, 4], [1, 5], [4, 4], [0, 5], [3, 4]], sTn = [[3, 4], [0, 5], [4, 4], [1, 5], [5, 4], [2, 5], [6, 4]];
      const list = keyN > 0 ? (clef === 'tenor' ? sTn : sT) : fT;
      let s = '', xx = x;
      for (let i = 0; i < Math.abs(keyN); i++) {
          const y = bot + (ref - ssStepOf(list[i][0], list[i][1] + off)) * 6;
          s += keyN > 0 ? ssSharp(xx + 3, y) : ssFlat(xx + 3, y);
          xx += 9;
      }
      return { svg: s, w: keyN ? Math.abs(keyN) * 9 + 8 : 4 };
  }
  function rdSvg(o: ReadDrillSvgOptions) {
      const grand = o.clef === 'grand', clefs: ReadClefStaff[] = o.clef === 'grand' ? ['treble', 'bass'] : [o.clef], tops = grand ? [40, 136] : [40];
      const keyN = o.keyN || 0, kA = ssKeyAcc(keyN), colW = o.colW || 64, L0 = grand ? 18 : 8;
      let head = '', x = L0 + 4;
      clefs.forEach((c, i) => { head += (c === 'treble' || c === 'bass') ? srClef(c, x + 4, tops[i]) : rdCClef(x + 6, tops[i] + (c === 'alto' ? 24 : 12)); });
      x += 40;
      let ksw = 4;
      clefs.forEach((c, i) => { const k = rdKsSvg(c, keyN, x, tops[i]); head += k.svg; ksw = Math.max(ksw, k.w); });
      x += ksw + (o.cols.length ? 10 : 0);
      const x0 = x, body: string[] = [], heads: { c: number; i: number; x: number; y: number; }[] = [];
      let minY = tops[0], maxY = tops[tops.length - 1] + 48;
      o.cols.forEach((col, ci) => {
          const nx = x0 + ci * colW + colW / 2;
          if (o.bars && o.bars[ci])
              body.push(`<line class="ss-line rdx-barline" x1="${x0 + ci * colW}" y1="${tops[0]}" x2="${x0 + ci * colW}" y2="${tops[tops.length - 1] + 48}" stroke-width="1.2"/>`);
          const items = col.map((n, ii): ReadDrillSvgItem => {
              const c: ReadClefStaff = grand ? (n.staff || (rdStep(n) >= 28 ? 'treble' : 'bass')) : clefs[0], top = tops[clefs.indexOf(c)], st = rdStep(n);
              return { n, ii, c, top, step: st, y: top + 48 + (RD_REF[c] - st) * 6, dx: 0 };
          }).sort((a, b) => a.step - b.step);
          let prev: ReadDrillSvgItem | null = null;
          items.forEach((it) => { it.dx = (prev && prev.c === it.c && it.step - prev.step === 1 && prev.dx === 0) ? 12 : 0; prev = it; });
          const lanes: number[][] = [];
          items.slice().reverse().forEach((it) => {
              if ((it.n.acc || 0) === kA[it.n.li] && !it.n.cn)
                  return;
              let a = lanes.findIndex((l) => l.every((y: number) => Math.abs(y - it.y) >= 14));
              if (a < 0) {
                  a = lanes.length;
                  lanes.push([]);
              }
              lanes[a].push(it.y);
              it.ax = nx - 15 - a * 10;
          });
          items.forEach((it) => {
              let g = '';
              if (it.ax != null)
                  g += ssAccGlyph(it.n.acc || 0, kA[it.n.li], it.ax, it.y);
              g += srLedger2(nx + it.dx, it.y, it.top) + ssNotehead(nx + it.dx, it.y, o.dur || 4, (RD_REF[it.c] - it.step) % 2 === 0);
              body.push(`<g class="ss-n" data-c="${ci}" data-i="${it.ii}"${it.n.s ? ` data-s="${it.n.s}"` : ''}${it.n.hc ? ` style="--hc:${it.n.hc}"` : ''}>${it.n.tip ? `<title>${rdEsc(it.n.tip)}</title>` : ''}${g}</g>`);
              heads.push({ c: ci, i: it.ii, x: nx + it.dx, y: it.y });
              minY = Math.min(minY, it.y);
              maxY = Math.max(maxY, it.y);
          });
      });
      (o.ext || []).forEach((n) => {
          const c: ReadClefStaff = grand ? (n.staff || (rdStep(n) >= 28 ? 'treble' : 'bass')) : clefs[0], y = tops[clefs.indexOf(c)] + 48 + (RD_REF[c] - rdStep(n)) * 6;
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
      });
      const W = Math.max(o.minW || 0, x0 + o.cols.length * colW + 10), lblY = maxY + 24;
      const lbl = o.lbl;
      if (lbl)
          o.cols.forEach((_, ci) => { const l = lbl[ci]; if (l != null)
              body.push(`<text class="rdx-lbl${o.lblCls && o.lblCls[ci] ? ' ' + o.lblCls[ci] : ''}" x="${x0 + ci * colW + colW / 2}" y="${lblY}">${rdEsc(l)}</text>`); });
      const yA = Math.min(tops[0] - 10, minY - 14) - (o.ghost ? 16 : 0), yB = (o.lbl ? lblY + 10 : maxY + 14);
      let staff = '';
      tops.forEach((tp) => { for (let k = 0; k < 5; k++)
          staff += `<line class="ss-line" x1="${L0}" y1="${tp + k * 12}" x2="${W - 4}" y2="${tp + k * 12}" stroke-width="1.2"/>`; });
      staff += `<line class="ss-line" x1="${L0}" y1="${tops[0]}" x2="${L0}" y2="${tops[tops.length - 1] + 48}" stroke-width="1.6"/><line class="ss-line" x1="${W - 4}" y1="${tops[0]}" x2="${W - 4}" y2="${tops[tops.length - 1] + 48}" stroke-width="1.2"/>`;
      if (grand)
          staff += `<path class="rdx-brace" d="M ${L0 - 3},40 C ${L0 - 13},44 ${L0 - 3},100 ${L0 - 14},112 C ${L0 - 3},124 ${L0 - 13},180 ${L0 - 3},184"/>`;
      const sc = o.scale || 1.5, H = yB - yA;
      const band = (bx: number, cls: string) => `<rect class="${cls}" x="${bx + 3}" y="${yA + 3}" width="${colW - 6}" height="${H - 6}" rx="8"/>`;
      const hl = o.hl != null ? band(x0 + o.hl * colW, 'rdx-now') : '';
      const ghost = o.ghost ? `<g class="rdx-ghost">${band(-colW / 2, 'rdx-ghost-b')}<text x="0" y="${yA + 15}">👻</text></g>` : '';
      const notes = o.wrap ? `<g class="${o.wrap}" style="--dx:${colW}px">${body.join('')}</g>` : body.join('');
      return { svg: `<svg class="rdx-svg" viewBox="0 ${yA} ${W} ${H}" width="${Math.round(W * sc)}" height="${Math.round(H * sc)}" style="--w:${Math.round(W * sc)}px" xmlns="http://www.w3.org/2000/svg" role="img"${o.aria ? ` aria-label="${rdEsc(o.aria)}"` : ''}>${hl}${staff}${head}${ghost}${notes}</svg>`, heads, W, x0, H };
  }
  /* ---- drill engine ---- */
  // Practice's star check: the last RD_CHECK_N answers of the run.
  const RD_CHECK_N = 20;
  const RD_MODES: readonly string[] = ['practice', 'test', 'survival', 'timeAttack', 'marathon'];
  function isReadDrillMode(mode: string): mode is ReadDrillMode { return RD_MODES.includes(mode); }
  const RD_MODE_ICON: Record<ReadDrillMode, string> = { practice: '🎯', test: '📝', survival: '♥', timeAttack: '⏱', marathon: '🏃' };
  const RD: ReadDrillState = { on: false, L: null, mode: 'practice', q: null, n: 0, ok: 0, ms: 0, streak: 0, best: 0, t0: 0, answered: false, timers: [], lastK: null, accSel: 0, miss: {}, rushEnd: 0, rushIv: 0, rh: null, rhP: [], rhM: [], next: null, nodes: [], flow: null, fix: false, arc: null, bars: 16, tout: false, arcFx: '', limF: 1, chk: [], chkBest: null, chkNew: 0 };
  // Rhythm and sight-reading levels keep Practice and their graded run; the others have Practice and the Challenge modes.
  // Marathon reads one long line of notes, so only naming and playing levels have it.
  function rdModes(L: ReadDrillLevel): ReadDrillMode[] {
      if (!rdHasCheck(L))
          return ['practice', 'test'];
      const modes: ReadDrillMode[] = ['practice', 'timeAttack', 'survival'];
      if (L.ty === 'name' || L.ty === 'play')
          modes.push('marathon');
      return modes;
  }
  // Levels whose Practice runs the star check: all but rhythm and sight-reading, which earn stars in their graded run.
  function rdHasCheck(L: ReadDrillLevel | null) { return !!L && L.ty !== 'rh' && L.ty !== 'sr'; }
  // How many notes the run has (Marathon), or null when it ends another way.
  function rdRunLen(): number | null { return RD.arc && RD.arc.total !== null ? RD.arc.total : null; }
  function rdTimeUp() { return RD.mode === 'timeAttack' && performance.now() >= RD.rushEnd; }
  // Survival: a note still unanswered when its time window closes costs a life.
  function rdArmLimit() {
      clearTimeout(RD.limT);
      const arc = RD.arc, q = RD.q;
      if (!arc || arc.mode !== 'survival')
          return;
      RD.limT = setTimeout(() => { if (RD.on && !RD.answered && RD.q === q)
          rdAnswer(false, {}, true); }, arc.targetMs);
      rdHud();
  }
  function rdArcFx() { return RD.arcFx === 'bonus' ? t('rdx_ta_bonus') : RD.arcFx === 'faster' && RD.arc ? t('rdx_sv_faster', anNum(RD.arc.targetMs / 1000, 1)) : ''; }
  function rdClock(ms: number) { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function rdLvNext(L: ReadDrillLevel) { const u = RD_UNITS.find((x) => x.u === L.u); return u ? u.lv[L.n] || null : null; }
  function rdTarget(L: ReadDrillLevel | null) { if (!L)
      throw new Error('Étude: no reading level'); return (RD_TARGET[L.ty] || 3000) + ((L.clef === 'grand' || L.clef === 'mix') ? 800 : 0) + ((L.acc || L.keys) ? 1000 : 0); }
  function rdStat(k: string, ok: boolean, ms: number) {
      const d = rdData(), s = d.nt[k] || (d.nt[k] = { n: 0, ok: 0, ms: 0, e: 0, t: 0 });
      s.e = s.n ? s.e * 0.7 + (ok ? 0 : 0.3) : (ok ? 0.1 : 1);
      s.t = s.n ? Math.round(s.t * 0.7 + ms * 0.3) : ms;
      s.n++;
      if (ok)
          s.ok++;
      s.ms += ms;
  }
  function rdWeakness(k: string) {
      const s = rdData().nt[k];
      if (!s || !s.n)
          return 0;
      const errors = s.ok < s.n ? 1 - s.ok / s.n : 0;
      const slow = Math.max(0, (s.t || 0) / rdTarget(RD.L) - 1);
      return 6 * errors + slow;
  }
  function rdWeakItems<T>(items: T[], keyOf: (x: T) => string) {
      const ranked = items.map((item) => ({ item, weakness: rdWeakness(keyOf(item)) })).filter(({ weakness }) => weakness > 0).sort((a, b) => b.weakness - a.weakness);
      return ranked.slice(0, Math.ceil(ranked.length / 4)).map(({ item }) => item);
  }
  function rdPick<T>(items: T[]) {
      return items[Math.floor(Math.random() * items.length)];
  }
  function rdPickFrom<T>(items: T[], keyOf: (x: T) => string) {
      let pool = items.filter((item) => keyOf(item) !== RD.lastK);
      if (!pool.length)
          pool = items;
      const weak = (RD.mode === 'practice' || RD.mode === 'survival' || RD.mode === 'marathon') && host.store.data().settings.weakSpotInjection && Math.random() < 0.3 ? rdWeakItems(pool, keyOf) : [];
      const r = rdPick(weak.length ? weak : pool);
      RD.lastK = keyOf(r);
      return r;
  }
  function rdPool(L: ReadDrillLevel): ReadDrillPitch[] {
      if (L.set)
          return L.set.map((x) => rdP(x));
      const lo = rdStep(rdP(L.lo)), hi = rdStep(rdP(L.hi)), out: ReadDrillPitch[] = [];
      for (let s = lo; s <= hi; s++) {
          const n = rdFromStep(s);
          out.push(n);
          if (L.acc === 1 || L.acc === 2) {
              if (n.li !== 2 && n.li !== 6)
                  out.push(rdFromStep(s, 1));
          }
          if (L.acc === -1 || L.acc === 2) {
              if (n.li !== 0 && n.li !== 3)
                  out.push(rdFromStep(s, -1));
          }
      }
      return out;
  }
  function rdIvName(n: string|number) { return t('rdx_iv' + n); }
  function rdChLabel(li: number, q: string) { return rdLetter(li) + ' ' + t('rdx_q_' + q); }
  function rdShuffle<T>(a: T[]): T[] { const r = shuffle(a); if (typeof r === 'string')
      throw new Error('Étude: shuffle needs an array'); return r; }
  function rdStaffClef(c: ReadClef | undefined): ReadClefStaff { if (c === 'treble' || c === 'bass' || c === 'alto' || c === 'tenor')
      return c; throw new Error('Étude: this drill needs a single staff, not ' + c); }
  function rdGen(L: ReadDrillLevel): ReadQuestion {
      const ty = L.ty;
      if (ty === 'ks') {
          const ks: number[] = [];
          if (L.kmax === undefined)
              throw new Error('Étude: key-signature level without kmax');
          for (let k = -L.kmax; k <= L.kmax; k++)
              ks.push(k);
          const k = rdPickFrom(ks, (v) => 'ks:' + v);
          const opts = rdShuffle(ks.filter((v) => v !== k)).slice(0, 5).concat([k]).sort((a, b) => a - b);
          const clef = L.clef;
          if (clef === undefined || clef === 'mix')
              throw new Error('Étude: key-signature level without a staff');
          return { ty, clef, keyN: k, key: 'ks:' + k, ans: k, opts: opts.map((v) => ({ v, l: rdKeyLabel(v), s: rdKeyMinor(v) })) };
      }
      if (ty === 'iv') {
          const ivs = L.ivs;
          if (!ivs)
              throw new Error('Étude: interval level without intervals');
          const lo = rdStep(rdP(L.lo)), hi = rdStep(rdP(L.hi)), iv = rdPickFrom(ivs, (v) => 'iv:' + v);
          let a = lo, b = lo + iv - 1;
          for (let k = 0; k < 40; k++) {
              a = lo + Math.floor(Math.random() * (hi - lo + 1));
              b = a + (Math.random() < .5 ? 1 : -1) * (iv - 1);
              if (b < lo || b > hi)
                  b = a - (b - a);
              if (b >= lo && b <= hi)
                  break;
          }
          const harm = L.harm === 1 || (L.harm === 2 && Math.random() < .5);
          let na = rdFromStep(a), nb = rdFromStep(b);
          if (harm && a > b) {
              const x = na;
              na = nb;
              nb = x;
          }
          return { ty, clef: rdStaffClef(L.clef), key: 'iv:' + iv, ans: iv, a: na, b: nb, harm, opts: ivs.map((v) => ({ v, l: rdIvName(v), k: String(v) })), midis: [rdMidi(na), rdMidi(nb)] };
      }
      if (ty === 'ch') {
          const quals = L.q;
          if (!quals)
              throw new Error('Étude: chord level without qualities');
          const lo = rdStep(rdP(L.lo)), hi = rdStep(rdP(L.hi)), qual = rdPickFrom(quals, (v) => 'ch:' + v);
          let notes: ReadDrillPitch[] | null = null, root: ReadDrillPitch | null = null, inv = 0;
          for (let k = 0; k < 80 && !notes; k++) {
              const rs = lo + Math.floor(Math.random() * Math.max(1, hi - lo - 3));
              root = rdFromStep(rs);
              const rm = rdMidi(root);
              const ns = [0, 1, 2].map((j) => { const n = rdFromStep(rs + 2 * j); n.acc = rm + RD_CHQ[qual][j] - rdMidi(n); return n; });
              if (ns.some((n) => Math.abs(n.acc) > 1))
                  continue;
              inv = L.inv ? Math.floor(Math.random() * 3) : 0;
              for (let i = 0; i < inv; i++) {
                  const x = ns.shift();
                  if (!x)
                      throw new Error('Étude: empty chord');
                  x.oct++;
                  ns.push(x);
              }
              notes = ns;
          }
          if (!root)
              throw new Error('Étude: no chord root');
          const r0 = root, ans = r0.li + ':' + qual, set = new Set([ans]);
          quals.forEach((q) => set.add(r0.li + ':' + q));
          while (set.size < 6) {
              set.add(Math.floor(Math.random() * 7) + ':' + randItem(quals));
          }
          const opts = rdShuffle([...set]).map((v) => { const [li, q] = v.split(':'); return { v, l: rdChLabel(+li, q) }; });
          if (!notes)
              throw new Error('Étude: no chord found');
          const midis = notes.map((n) => rdMidi(n));
          return { ty, clef: rdStaffClef(L.clef), key: 'ch:' + qual, ans, root: r0, qual, inv, notes, opts, midis, pcs: [...new Set(midis.map(pc))].sort((a, b) => a - b) };
      }
      let clef = L.clef, pool: ReadDrillPitch[], keyN = 0;
      if (clef === 'mix') {
          const mc: ReadClefStaff = randItem(['treble', 'bass', 'alto', 'tenor']);
          clef = mc;
          const r = RD_REF[mc];
          pool = [];
          for (let s = r - 2; s <= r + 10; s++)
              pool.push(rdFromStep(s));
      }
      else
          pool = rdPool(L);
      // `keyN` fixes one key signature (the warm-up's hand position); `keys` draws one up to that many sharps or flats.
      if (L.keyN !== undefined || L.keys) {
          const keys = L.keys;
          if (L.keyN !== undefined)
              keyN = L.keyN;
          else if (typeof keys !== 'number')
              throw new Error('Étude: note drills take a key-signature range, not a list');
          else
              keyN = Math.floor(Math.random() * (2 * keys + 1)) - keys;
          const kA = ssKeyAcc(keyN);
          pool = pool.map((n) => Object.assign({}, n, { acc: kA[n.li] }));
      }
      if (clef === undefined)
          throw new Error('Étude: note drill without a clef');
      const dc = clef;
      const sc = (n: ReadDrillPitch): ReadClefStaff => dc === 'grand' ? (rdStep(n) >= 28 ? 'treble' : 'bass') : dc;
      const n = rdPickFrom(pool, (x) => rdNk(sc(x), x));
      const q: ReadQuestionNote = { ty, clef: dc, keyN, note: n, sclef: sc(n), key: rdNk(sc(n), n), midi: rdMidi(n), midis: [rdMidi(n)], needAcc: !!(L.acc || L.keys) };
      if (ty === 'k2s') {
          const seen = new Set([q.midi]), opts = [n];
          for (const x of rdShuffle(pool)) {
              if (opts.length >= 4)
                  break;
              const m = rdMidi(x);
              if (!seen.has(m)) {
                  seen.add(m);
                  opts.push(x);
              }
          }
          const qo = rdShuffle(opts).map((x, i) => ({ v: i, n: x }));
          q.opts = qo;
          q.ans = qo.findIndex((o) => o.n === n);
      }
      return q;
  }
  function rdQSvg(q: ReadQuestion, extra?: ReadDrillStaffNote | null) {
      const st = q.state;
      if (q.ty === 'ks')
          return rdSvg({ clef: q.clef, keyN: q.keyN, cols: [], minW: 150, aria: t('rdx_p_ks') }).svg;
      if (q.ty === 'iv') {
          const a = Object.assign({ s: st }, q.a), b = Object.assign({ s: st }, q.b);
          return rdSvg({ clef: q.clef, cols: q.harm ? [[a, b]] : [[a], [b]], colW: q.harm ? 96 : 72 }).svg;
      }
      if (q.ty === 'ch')
          return rdSvg({ clef: q.clef, cols: [q.notes.map((n) => Object.assign({ s: st }, n))], colW: 100 }).svg;
      const col: ReadDrillStaffNote[] = [Object.assign({ s: q.ty === 'k2s' ? null : st }, q.note)];
      if (extra)
          col.push(extra);
      return rdSvg({ clef: q.clef === 'grand' ? 'grand' : q.sclef, keyN: q.keyN, cols: [col], colW: 100, lbl: q.lbl ? [q.lbl] : null }).svg;
  }
  const rdDockKeys = new Map<number, { s: ReadDockMark; exact: boolean }>();
  function rdDockAt(m: number, exact: boolean) { return exact ? m : foldToView(m); }
  function rdDockMark(m: number, s: ReadDockMark, exact = false) {
      if (s === 'bad' && [...rdDockKeys].some(([k, d]) => rdDockAt(k, d.exact) === rdDockAt(m, exact)))
          return;
      rdDockKeys.set(m, { s, exact });
      kbState(m, s, !exact);
  }
  function rdDockPaint() {
      const marked = new Set<number>();
      let ask: number | null = null;
      for (const [m, d] of rdDockKeys) {
          const at = rdDockAt(m, d.exact);
          if (d.s === 'bad' && marked.has(at))
              continue;
          marked.add(at);
          kbState(m, d.s, !d.exact);
          if (d.exact && d.s !== 'bad' && ask == null)
              ask = m;
      }
      if (ask != null)
          dockKeyInSight(ask);
  }
  function rdDockClear() {
      if (!rdDockKeys.size)
          return;
      rdDockKeys.forEach((d, m) => kbState(m, null, !d.exact));
      rdDockKeys.clear();
      repaintHeld();
  }
  // While a key-to-staff question is up, the keys keep its key (and the level's whole range when that fits, so they rarely move):
  // shifting octaves or resizing never takes the question off the keyboard.
  function rdDockView() {
      const q = RD.q, L = RD.L;
      if (!RD.on || !q || q.ty !== 'k2s' || !L)
          return;
      const span = shell.keyboardView.oct * 12;
      let a = q.midi, b = q.midi;
      if (L.lo && L.hi) {
          const lo = rdMidi(rdP(L.lo)), hi = rdMidi(rdP(L.hi));
          if (hi - (lo - pc(lo)) <= span) {
              a = Math.min(a, lo);
              b = Math.max(b, hi);
          }
      }
      let low = shell.keyboardView.low;
      if (a < low)
          low = a - pc(a);
      else if (b > low + span)
          low = Math.ceil((b - span) / 12) * 12;
      shell.keyboardView.low = Math.max(shell.baseLow, Math.min(shell.baseHigh - span, low));
  }
  function rdDockForce(on: boolean) { if (shell.dockForced() === on)
      return; shell.setDockForced(on); dockSync(); }
  // Key-to-staff asks on the dock: it opens for the drill, shows the key in its own octave, and lights it.
  function rdDockAsk(m: number) {
      rdDockForce(true);
      const low = shell.keyboardView.low;
      rdDockView();
      if (shell.keyboardView.low !== low) {
          buildKeyboard();
          repaintHeld();
      }
      rdDockMark(m, 'target', true);
      dockKeyInSight(m);
  }
  function rdBtn(o: ReadDrillButton, i: number, cls?: string) { return `<button class="chip rdx-a${cls ? ' ' + cls : ''}" data-a="${rdEsc(o.v)}" data-k="${o.k || (i + 1)}">${o.html || rdEsc(o.l)}${o.s ? `<small>${rdEsc(o.s)}</small>` : ''}<kbd>${o.k || (i + 1)}</kbd></button>`; }
  function rdAccSeg() { return `<div class="seg rdx-accs" id="rdx-accs" role="group" aria-label="${t('rdx_accl')}">${[-1, 0, 1].map((a, i) => `<button data-acc="${a}" aria-pressed="${a === RD.accSel}" title="${t('rdx_acc_t' + a)}">${a < 0 ? '♭' : a > 0 ? '♯' : '♮'}<kbd>${['-', '0', '='][i]}</kbd></button>`).join('')}</div>`; }
  // On a touch screen the computer-key hint (.rdx-kbd) is hidden (native.css); the ways that still work there keep a line (.rdx-touch).
  function rdTools(q: ReadQuestion) { return `<div class="rdx-tools">${RD.mode === 'practice' ? `<button class="btn ghost sm" id="rdx-hear">🔊 ${t('rdx_hear')}</button><button class="btn ghost sm" id="rdx-hintb">💡 ${t('rdx_hint')}</button>` : ''}<span class="rdx-kbd">${t('rdx_keys_' + q.ty) + (q.ty === 'name' && q.needAcc ? t('rdx_keys_acc') : '')}</span>${q.ty === 'ch' || q.ty === 'play' ? `<span class="rdx-touch ctx-touch">${t('rdx_touch_' + q.ty)}</span>` : ''}</div>`; }
  const RD_FLOW_W = 52, RD_FLOW_SC = 1.35, RD_GHOST_MAX = 3;
  function rdFlowOk(L: ReadDrillLevel | null | undefined) { return !!L && rdData().prefs.flow && (L.ty === 'name' || L.ty === 'play') && L.clef !== 'mix' && !L.keys && L.keyN === undefined; }
  function rdFlowFill(F: ReadDrillFlow, upTo: number) {
      const L = RD.L;
      if (!L)
          throw new Error('Étude: no reading level');
      const len = rdRunLen(), end = len !== null ? Math.min(upTo, len) : upTo;
      while (F.items.length < end) {
          const q = rdGen(L);
          if (q.ty !== 'name' && q.ty !== 'play')
              throw new Error('Étude: the note stream needs name or play questions');
          q.hinted = false;
          q.state = null;
          q.cn = courtesyNatural(F.items.slice(-6).map((x) => x.note), q.note);
          F.items.push(q);
      }
  }
  function rdFlowStart() {
      const L = RD.L;
      if (!L)
          return;
      const pool = rdPool(L).sort((a, b) => rdStep(a) - rdStep(b)), gh = rdData().prefs.ghost;
      const F: ReadDrillFlow = RD.flow = { items: [], cur: 0, start: 0, played: null, wrong: [], ext: [pool[0], pool[pool.length - 1]], g0: performance.now(), raf: 0, gd: 0, gh, rm: reduceMotion(), geo: { x0: 0, colW: RD_FLOW_W, n: 0 } };
      rdFlowFill(F, 1);
      RD.q = F.items[0];
      RD.answered = false;
      RD.fix = false;
      RD.accSel = 0;
      rdFlowBody();
      rdFlowShow(false);
      rdFlowArm();
      F.g0 = RD.t0;
      if (gh)
          F.raf = requestAnimationFrame(rdGhostTick);
  }
  // Starts the clock on the current note, with the practice hint after 4 s.
  function rdFlowArm() {
      const q = RD.q;
      clearTimeout(RD.hintT);
      if (RD.mode === 'practice' && rdData().prefs.hints)
          RD.hintT = setTimeout(() => { if (RD.on && !RD.answered && RD.q === q)
              rdHint(); }, 4000);
      rdHud();
      RD.t0 = performance.now();
      rdArmLimit();
  }
  function rdFlowBody() {
      const F = RD.flow;
      if (!F)
          return;
      const q = F.items[Math.min(F.cur, F.items.length - 1)];
      let acc = '', ans = '';
      if (q.ty === 'name') {
          if (q.needAcc)
              acc = rdAccSeg();
          ans = [0, 1, 2, 3, 4, 5, 6].map((li) => rdBtn({ v: li, l: rdLetter(li) }, li)).join('');
      }
      byId('rdx-body').innerHTML = `<div class="rdx-q rdx-flowq"><div class="rdx-prompt" id="rdx-prompt">${t('rdx_p_' + q.ty + '_flow')}</div><div class="rdx-staff rdx-flow" id="rdx-staff"></div><div class="rdx-fb" id="rdx-fb"></div>${acc}<div class="rdx-ans rdx-ty-${q.ty}" id="rdx-ans" role="group" aria-label="${t('rdx_answers')}" aria-describedby="rdx-coach">${ans}</div>${rdTools(q)}</div>`;
  }
  function rdFlowShow(slide: boolean) {
      const F = RD.flow, L = RD.L, st = maybeById('rdx-staff');
      if (!F || !L || !st)
          return;
      const grand = L.clef === 'grand', fix = RD.fix, q = F.items[Math.min(F.cur, F.items.length - 1)];
      const clef: ReadClefDraw = grand ? 'grand' : q.sclef, head = grand ? 76 : 66, colW = RD_FLOW_W, aw = st.clientWidth - 28;
      const svgOf = (start: number, vis: ReadQuestionNote[], sc: number, o: Partial<ReadDrillSvgOptions>) => rdSvg({ clef, colW, scale: sc, dur: 1, ext: F.ext, aria: t('rdx_p_' + q.ty + '_flow'), ...o,
          cols: vis.map((it, i) => {
              const k = start + i, col: ReadDrillStaffNote[] = [Object.assign({ s: k === F.cur ? 'now' : k < F.cur ? it.state : null, cn: it.cn }, it.note)];
              if (k === F.cur && fix && F.played != null && F.played !== it.midi)
                  col.push(Object.assign(rdSpellMidi(F.played, 0), { s: 'bad' }));
              return col;
          }),
          lbl: vis.map((it) => it.state === 'bad' ? rdName(it.note, true) : null), lblCls: vis.map(() => 'lo') });
      // On the full-screen stage the notes grow into the height the stage gives them, keeping at least 8 columns across.
      const H = rdSvg({ clef, cols: [], ext: F.ext, lbl: [], ghost: F.gh }).H, ah = st.clientHeight - 12, gap = 10;
      const wide = Math.min(2.6, aw / (head + 10 + 8 * colW));
      const total = rdRunLen();
      st.classList.toggle('rdx-sys', RD.mode === 'marathon' && total !== null);
      if (RD.mode === 'marathon' && total !== null) {
          // Marathon reads like a page: whole bars on each system, the current system on top and the next ones below it.
          const rows = shell.stage.on ? systemRows(ah, H * Math.max(1, Math.min(RD_FLOW_SC, wide)) + gap) : 2;
          const sc = shell.stage.on ? Math.max(1, Math.min(wide, (ah - gap * (rows - 1)) / (rows * H))) : RD_FLOW_SC;
          const per = systemBars(aw, { scale: sc, colW, head }, MARATHON_NOTES_PER_BAR) * MARATHON_NOTES_PER_BAR;
          const win = systemWindow(F.cur, per, rows, total);
          rdFlowFill(F, Math.min(total, (win.first + win.count) * per));
          let cur0 = win.first * per, out = '';
          for (let row = win.first; row < win.first + win.count; row++) {
              const s0 = row * per, vis = F.items.slice(s0, Math.min(total, s0 + per)), here = F.cur >= s0 && F.cur < s0 + per;
              if (here)
                  cur0 = s0;
              const r = svgOf(s0, vis, sc, { minW: head + per * colW + 10, hl: here ? F.cur - s0 : null, ghost: F.gh && here, wrap: 'rdx-flow-n', bars: vis.map((_, i) => i > 0 && (s0 + i) % MARATHON_NOTES_PER_BAR === 0) });
              out += here ? r.svg : r.svg.replace('<svg class="rdx-svg"', '<svg class="rdx-svg" aria-hidden="true"');
          }
          st.innerHTML = out;
          F.ghostEl = null;
          F.start = cur0;
          F.geo = { x0: head, colW, n: per };
      }
      else {
          // Off the stage the notes grow until the most a stream shows (12) fills the width, up to SR_SCALE_CAP.
          const sc = shell.stage.on ? Math.max(1, Math.min(wide, ah / H)) : Math.max(RD_FLOW_SC, Math.min(SR_SCALE_CAP, aw / (head + 10 + 12 * colW)));
          const n = streamVisible(aw, { scale: sc, colW, head });
          const start = streamStart(F.cur, n, total);
          rdFlowFill(F, start + n);
          const r = svgOf(start, F.items.slice(start, start + n), sc, { hl: F.cur < F.items.length ? F.cur - start : null, ghost: F.gh, wrap: 'rdx-flow-n' + (slide && start === F.start + 1 ? ' slide' : '') });
          st.innerHTML = r.svg;
          F.ghostEl = null;
          F.start = start;
          F.geo = { x0: r.x0, colW, n };
      }
      rdGhostPlace();
      queryAllHtml(byId('rdx-ans'), '.rdx-a').forEach((b) => {
          const v = Number(b.dataset.a);
          b.classList.toggle('correct', fix && v === q.note.li);
          b.classList.toggle('wrong', fix && v !== q.note.li && F.wrong.includes(String(v)));
      });
      queryAllHtml(document, '#rdx-accs [data-acc]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.acc) === RD.accSel)));
      rdDockClear();
      if (fix && q.ty === 'play') {
          rdDockMark(q.midi, 'target');
          if (F.played != null && F.played !== q.midi)
              rdDockMark(F.played, 'bad');
      }
      const f = byId('rdx-fb'), fx = fix ? '' : rdArcFx();
      f.className = 'rdx-fb' + (fix ? ' bad' : fx ? ' good' : '');
      f.textContent = fix ? (RD.tout ? '⏱ ' : '✗ ') + rdFlowMsg() : fx ? '✓ ' + fx : '';
  }
  function rdFlowMsg() {
      const F = RD.flow, q = F && F.items[F.cur], arc = RD.arc;
      if (!F || !q)
          return '';
      return (RD.tout ? t('rdx_timeout') + ' · ' : '') + t('rdx_wrong', rdName(q.note, true)) + (q.ty === 'play' && F.played != null ? ' · ' + t('rdx_played', rdName(rdSpellMidi(F.played, 0), true)) : '') + (arc && arc.lives !== null ? ' · ' + t('rdx_lives', arc.lives) : '') + (arc && arc.completed ? '' : ' · ' + t(q.ty === 'play' ? 'rdx_fix_play' : 'rdx_fix_name'));
  }
  // Only the first answer to a note is scored. After a wrong one the stream waits, showing the right answer, until it is given.
  function rdFlowAnswer(ok: boolean, g: ReadDrillGiven, timeout = false) {
      const F = RD.flow, q = F && F.items[F.cur];
      if (!F || !q || (RD.answered && !RD.fix))
          return;
      if (!RD.fix) {
          RD.answered = true;
          clearTimeout(RD.hintT);
          clearTimeout(RD.limT);
          RD.tout = timeout;
          rdScore(q, ok, timeout);
          q.state = ok ? 'good' : 'bad';
      }
      if (ok) {
          rdFlowAdvance(g);
          rdCheckNotice();
          return;
      }
      RD.fix = true;
      if (q.ty === 'play' && g.midi != null)
          F.played = g.midi;
      const a = g.btn instanceof HTMLElement ? g.btn.dataset.a : undefined;
      if (a != null && !F.wrong.includes(a))
          F.wrong.push(a);
      rdFlowShow(false);
      const sv = byId('rdx-staff');
      sv.classList.remove('flash-ok', 'flash-bad');
      void sv.offsetWidth;
      sv.classList.add('flash-bad');
      byId('rdx-live').textContent = rdFlowMsg();
      rdHud();
      rdCheckNotice();
      // A run that this mistake ended (no lives left, or the last Marathon note) closes after a moment to read the answer.
      if (RD.arc && RD.arc.completed)
          RD.timers.push(setTimeout(() => { if (RD.on)
              rdFinish(); }, 1200));
  }
  function rdFlowAdvance(g: ReadDrillGiven) {
      const F = RD.flow;
      if (!F)
          return;
      const q = F.items[F.cur];
      if (q.ty === 'name' && g.midi == null && rdData().prefs.sound)
          rdSound(q.midis);
      F.cur++;
      F.played = null;
      F.wrong = [];
      RD.fix = false;
      RD.accSel = 0;
      const len = rdRunLen();
      if ((len !== null && F.cur >= len) || rdTimeUp()) {
          rdFlowShow(false);
          rdHud();
          RD.timers.push(setTimeout(() => { if (RD.on)
              rdFinish(); }, RD.mode === 'timeAttack' ? 0 : 400));
          return;
      }
      rdFlowFill(F, F.cur + 1);
      RD.q = F.items[F.cur];
      RD.answered = false;
      rdFlowShow(true);
      rdFlowArm();
      const fx = rdArcFx();
      if (fx)
          byId('rdx-live').textContent = fx;
  }
  function rdGhostTick() {
      const F = RD.flow;
      if (!F || !RD.on)
          return;
      rdGhostPlace();
      F.raf = requestAnimationFrame(rdGhostTick);
  }
  // The ghost answers one note per target time (the 3-star pace) and waits when it is RD_GHOST_MAX notes ahead.
  function rdGhostPlace() {
      const F = RD.flow, L = RD.L;
      if (!F || !L || !F.gh)
          return;
      const now = performance.now(), per = rdTarget(L);
      let p = (now - F.g0) / per;
      if (p > F.cur + RD_GHOST_MAX) {
          p = F.cur + RD_GHOST_MAX;
          F.g0 = now - p * per;
      }
      let el = F.ghostEl;
      if (!el || !el.isConnected) {
          el = document.querySelector('#rdx-staff .rdx-ghost');
          F.ghostEl = el;
      }
      if (el) {
          const gx = ghostX(F.rm ? Math.floor(p) : p, F.start, F.geo.n, F.geo.x0, F.geo.colW);
          el.setAttribute('transform', 'translate(' + gx.x.toFixed(1) + ' 0)');
          el.classList.toggle('edge', gx.edge !== 0);
      }
      const d = pacerLead(F.cur, p);
      if (d !== F.gd) {
          F.gd = d;
          rdHud();
      }
  }
  function rdNext() {
      clearTimeout(RD.hintT);
      rdDockClear();
      RD.answered = false;
      RD.accSel = 0;
      if (!RD.L)
          throw new Error('Étude: no reading level');
      const q = RD.q = rdGen(RD.L);
      q.hinted = false;
      q.state = null;
      let acc = '', ans = '';
      if (q.ty === 'name') {
          if (q.needAcc)
              acc = rdAccSeg();
          ans = [0, 1, 2, 3, 4, 5, 6].map((li) => rdBtn({ v: li, l: rdLetter(li) }, li)).join('');
      }
      else if (q.ty === 'k2s') {
          const opts = q.opts;
          if (!opts)
              throw new Error('Étude: key-to-staff question without options');
          ans = opts.map((o, i) => rdBtn({ v: o.v, html: rdSvg({ clef: q.clef === 'grand' ? 'grand' : q.sclef, cols: [[o.n]], colW: 56, scale: 0.8 }).svg }, i, 'rdx-opt')).join('');
      }
      else if (q.ty !== 'play') {
          const opts = q.opts;
          if (!opts)
              throw new Error('Étude: question without options');
          const btns: ReadDrillButton[] = opts.map((o) => 'n' in o ? { v: o.v } : o);
          ans = btns.map((o, i) => rdBtn(o, i)).join('');
      }
      const pr = RD.mode === 'practice';
      byId('rdx-body').innerHTML = `<div class="rdx-q"><div class="rdx-prompt" id="rdx-prompt">${t('rdx_p_' + q.ty)}</div><div class="rdx-staff" id="rdx-staff">${q.ty === 'k2s' ? '' : rdQSvg(q)}</div><div class="rdx-fb" id="rdx-fb"></div>${acc}<div class="rdx-ans rdx-ty-${q.ty}" id="rdx-ans" role="group" aria-label="${t('rdx_answers')}" aria-describedby="rdx-coach">${ans}</div>${rdTools(q)}</div>`;
      if (q.ty === 'k2s')
          rdDockAsk(q.midi);
      else
          rdDockForce(false);
      if (q.ty === 'k2s' && rdData().prefs.sound)
          rdSound(q.midis);
      if (pr && rdData().prefs.hints)
          RD.hintT = setTimeout(() => { if (RD.on && !RD.answered && RD.q === q)
              rdHint(); }, 4000);
      rdHud();
      RD.t0 = performance.now();
      rdArmLimit();
  }
  function rdSound(ms?: number[], arp?: boolean) { if (!ms || !ms.length)
      return; ensureAudio(); if (!shell.audioEngine.context)
      return; const t0 = shell.audioEngine.context.currentTime + 0.03; ms.forEach((m, i) => host.audio.previewNote(m, t0 + (arp ? i * 0.45 : 0), 0.9, 88)); }
  const RD_LM = [14, 18, 21, 24, 28, 32, 35, 38, 42];
  function rdHint() {
      const q = RD.q;
      if (!q || RD.answered)
          return;
      q.hinted = true;
      let s = '';
      if (q.ty === 'name' || q.ty === 'play') {
          const st = rdStep(q.note);
          let lm = RD_LM[0];
          RD_LM.forEach((x) => { if (Math.abs(x - st) < Math.abs(lm - st))
              lm = x; });
          const d = st - lm, nm = rdName(rdFromStep(lm), true);
          s = d === 0 ? t('rdx_hint_same', nm) : t(d > 0 ? 'rdx_hint_up' : 'rdx_hint_dn', Math.abs(d), nm);
          if (q.ty === 'play')
              rdDockMark(q.midi, 'target');
      }
      else if (q.ty === 'k2s')
          s = t('rdx_hint_k2s', rdName(q.note, true));
      else if (q.ty === 'iv') {
          const l1 = (RD_REF[q.clef] - rdStep(q.a)) % 2 === 0, l2 = (RD_REF[q.clef] - rdStep(q.b)) % 2 === 0;
          s = t(l1 === l2 ? 'rdx_hint_odd' : 'rdx_hint_even');
      }
      else if (q.ty === 'ch')
          s = t('rdx_hint_ch', rdLetter(q.root.li));
      else if (q.ty === 'ks')
          s = t(q.keyN > 0 ? 'rdx_hint_ks_s' : q.keyN < 0 ? 'rdx_hint_ks_f' : 'rdx_hint_ks_0');
      const f = maybeById('rdx-fb');
      if (f) {
          f.className = 'rdx-fb hint';
          f.textContent = '💡 ' + s;
      }
  }
  function rdAnsText(q: ReadQuestion) { if (q.ty === 'iv')
      return rdIvName(q.ans); if (q.ty === 'ch')
      return rdChLabel(q.root.li, q.qual); if (q.ty === 'ks')
      return rdKeyLabel(q.ans) + ' / ' + rdKeyMinor(q.ans); return rdName(q.note, true); }
  function rdScore(q: ReadQuestion, ok: boolean, timeout = false) {
      const now = performance.now(), ms = Math.max(0, Math.round(Math.min(now, inputTime(now)) - RD.t0)); // a played answer counts from its key's own time
      RD.n++;
      RD.ms += ms;
      if (ok) {
          RD.ok++;
          RD.streak++;
          RD.best = Math.max(RD.best, RD.streak);
      }
      else {
          RD.streak = 0;
          RD.miss[q.key] = (RD.miss[q.key] || 0) + 1;
      }
      if (!q.hinted) {
          rdStat(q.key, ok, ms);
          const tt = rdData().tot;
          tt.n++;
          if (ok)
              tt.ok++;
          tt.ms += ms;
      }
      if (RD.mode === 'practice' && rdHasCheck(RD.L))
          rdCheck(!q.hinted && ok, ms);
      RD.arcFx = '';
      const prev = RD.arc;
      if (!prev)
          return;
      if (prev.mode === 'survival')
          RD.limF = Math.max(0, 1 - ms / prev.targetMs);
      const arc = RD.arc = srtArcadeRecord(prev, ok ? 'correct' : timeout ? 'timeout' : 'wrong', ms, now);
      if (arc.deadlineMs !== null && prev.deadlineMs !== null && arc.deadlineMs > prev.deadlineMs) {
          RD.rushEnd = arc.deadlineMs;
          RD.arcFx = 'bonus';
      }
      if (arc.targetMs < prev.targetMs)
          RD.arcFx = 'faster';
  }
  function rdAnswer(ok: boolean, given?: ReadDrillGiven, timeout = false) {
      if (!RD.on || (RD.arc && RD.arc.completed))
          return;
      // Time Attack: once the clock has run out nothing more is scored.
      if (RD.mode === 'timeAttack' && rdTimeUp()) {
          if (!RD.answered || RD.fix)
              rdFinish();
          return;
      }
      if (RD.flow)
          return rdFlowAnswer(ok, given || {}, timeout);
      const q = RD.q;
      if (!q || RD.answered)
          return;
      RD.answered = true;
      clearTimeout(RD.hintT);
      clearTimeout(RD.limT);
      RD.tout = timeout;
      rdScore(q, ok, timeout);
      rdFeedback(ok, given || {});
      rdHud();
      rdCheckNotice();
      const done = !!(RD.arc && RD.arc.completed);
      RD.timers.push(setTimeout(() => { if (!RD.on)
          return; if (done || rdTimeUp() || rdnWarmLimit())
          rdFinish();
      else
          rdNext(); }, ok ? (RD.mode === 'practice' ? 650 : 380) : (RD.mode === 'timeAttack' ? 800 : 1500)));
  }
  // The star check's thresholds: accuracy first, then the mean answer time against the level's target.
  function rdStarsFor(acc: number, avg: number, tg: number) { return acc >= 95 && avg <= tg ? 3 : acc >= 90 && avg <= tg * 1.6 ? 2 : acc >= 80 ? 1 : 0; }
  function rdCheckResult() {
      const w = RD.chk, n = w.length, acc = n ? Math.round(100 * w.filter((x) => x.ok).length / n) : 0, avg = n ? w.reduce((a, x) => a + x.ms, 0) / n : 0;
      return { acc, avg, stars: RD.L ? rdStarsFor(acc, avg, rdTarget(RD.L)) : 0 };
  }
  // Adds a first answer to the star check. Once it holds RD_CHECK_N answers, a result better than the level's saved one is saved on the spot.
  function rdCheck(ok: boolean, ms: number) {
      const L = RD.L;
      if (!L)
          return;
      RD.chk.push({ ok, ms });
      if (RD.chk.length > RD_CHECK_N)
          RD.chk.shift();
      if (RD.chk.length < RD_CHECK_N)
          return;
      const r = rdCheckResult(), was = RD.chkBest;
      RD.chkBest = Math.max(was ?? 0, r.stars);
      if (L.custom) {
          if (r.stars > (was ?? 0))
              RD.chkNew = r.stars;
          return;
      }
      const d = rdData(), rec = d.lv[L.id] ?? { s: 0, acc: 0, t: 0, n: 0, rush: 0 };
      let save = false;
      if (r.stars > (rec.s || 0)) {
          rec.s = r.stars;
          RD.chkNew = r.stars;
          save = true;
      }
      if (r.acc > (rec.acc || 0)) {
          rec.acc = r.acc;
          save = true;
      }
      if (r.avg && r.acc >= 80 && (!rec.t || r.avg < rec.t)) {
          rec.t = Math.round(r.avg);
          save = true;
      }
      if (save) {
          d.lv[L.id] = rec;
          saveAll();
      }
  }
  // Announces stars the check just earned, without stopping the drill.
  function rdCheckNotice() {
      const s = RD.chkNew, aw = maybeById('rdx-award');
      if (!s)
          return;
      RD.chkNew = 0;
      byId('rdx-live').textContent = t('rdx_chk_live', t('rdx_stars_n', s));
      if (!aw)
          return;
      aw.textContent = t('rdx_chk_earned', '★'.repeat(s));
      aw.hidden = false;
      clearTimeout(RD.awT);
      RD.awT = setTimeout(() => { aw.hidden = true; }, 3000);
  }
  function rdCheckHud() {
      const n = RD.chk.length;
      if (n < RD_CHECK_N)
          return t('rdx_chk_n', n, RD_CHECK_N);
      const s = rdCheckResult().stars;
      return t('rdx_chk_s', '★'.repeat(s) + '☆'.repeat(3 - s));
  }
  function rdFeedback(ok: boolean, g: ReadDrillGiven) {
      const q = RD.q;
      if (!q)
          throw new Error('Étude: no reading question');
      q.state = ok ? 'good' : 'bad';
      if (q.ty === 'name' && !ok)
          q.lbl = rdName(q.note, true);
      const extra = (q.ty === 'play' && !ok && g.midi != null) ? Object.assign(rdSpellMidi(g.midi, q.keyN), { s: 'bad' }) : null;
      if (extra)
          q.state = null;
      if (q.ty !== 'k2s')
          byId('rdx-staff').innerHTML = rdQSvg(q, extra);
      const sv = byId('rdx-staff');
      sv.classList.remove('flash-ok', 'flash-bad');
      void sv.offsetWidth;
      sv.classList.add(ok ? 'flash-ok' : 'flash-bad');
      byId('rdx-ans').querySelectorAll('.rdx-a').forEach((b) => { if (!(b instanceof HTMLButtonElement))
          return; b.disabled = true; if (b.dataset.a === String(q.ans) || (q.ty === 'name' && Number(b.dataset.a) === q.note.li))
          b.classList.add('correct');
      else if (g.btn === b)
          b.classList.add('wrong'); });
      if (q.ty === 'play' || q.ty === 'k2s') {
          const exact = q.ty === 'k2s';
          rdDockMark(q.midi, 'good', exact);
          if (!ok && g.midi != null && g.midi !== q.midi)
              rdDockMark(g.midi, 'bad', exact);
      }
      const arc = RD.arc, fx = ok ? rdArcFx() : '';
      const f = byId('rdx-fb'), msg = ok ? (t('rdx_ok') + (RD.streak >= 3 ? '  🔥 ' + RD.streak : '') + (fx ? ' · ' + fx : ''))
          : (RD.tout ? t('rdx_timeout') + ' · ' : '') + t('rdx_wrong', rdAnsText(q)) + (extra ? ' · ' + t('rdx_played', rdName(extra, true)) : '') + (arc && arc.lives !== null ? ' · ' + t('rdx_lives', arc.lives) : '');
      f.className = 'rdx-fb ' + (ok ? 'good' : 'bad');
      f.textContent = (ok ? '✓ ' : RD.tout ? '⏱ ' : '✗ ') + msg;
      byId('rdx-live').textContent = msg;
      if (rdData().prefs.sound && q.ty !== 'play' && !(q.ty === 'k2s') && q.midis)
          rdSound(q.midis, q.ty === 'iv' && !q.harm);
  }
  function rdClickAns(b: HTMLElement) {
      const q = RD.q;
      if (!q || (RD.answered && !RD.fix) || !RD.on)
          return;
      const v = b.dataset.a;
      if (q.ty === 'name')
          return rdAnswer(Number(v) === q.note.li && (!q.needAcc || RD.accSel === (q.note.acc || 0)), { btn: b });
      if (q.ty === 'k2s') {
          const o = q.opts?.[Number(v)];
          return rdAnswer(Number(v) === q.ans, o ? { btn: b, midi: rdMidi(o.n) } : { btn: b });
      }
      rdAnswer(v === String(q.ans), { btn: b });
  }
  function rdInput(m: number) {
      if (!RD.on)
          return;
      if (!RD.L)
          throw new Error('Étude: no reading level');
      if (RD.L.ty === 'rh') {
          rdTap(m < 60 ? 'L' : 'R');
          return;
      }
      const q = RD.q;
      if (!q || (RD.answered && !RD.fix))
          return;
      const src = [...(shell.inputOwners.get(m) || [])], strict = src.some((s) => s === 'midi' || s === 'ble');
      // On-screen keys must be the exact key while the note is within the keyboard's octaves; beyond them the name is enough, as the folded mark shows.
      if (q.ty === 'play')
          return rdAnswer(host.store.data().settings.anyOctave ? samePitch(q.midi, m, true) : (strict || (src.some((s) => /^(pointer|button):/.test(s)) && foldToView(q.midi) === q.midi) ? m === q.midi : pc(m) === pc(q.midi)), { midi: m });
      if (q.ty === 'name')
          return rdAnswer(pc(m) === pc(q.midi), { midi: m });
      // Key to staff answers with 1–4 or a click: a played note only sounds, since playing the lit key would answer without reading.
      if (q.ty === 'k2s')
          return;
      if (q.ty === 'ch') {
          const hp = heldPcs();
          if (hp.length >= 3)
              rdAnswer(hp.join() === q.pcs.join(), {});
      }
  }
  function rdHud() {
      const h = byId('rdx-hud'), mt = byId('rdx-meter');
      if (!h)
          return;
      let s = '', f: number | null = null;
      if (RD.L && RD.L.ty === 'rh') {
          const rp = RD.rhP || [], n = rp.length;
          s = n ? '⌀ ' + Math.round(rp.reduce((x, y) => x + y, 0) / n) + '% · ' + n + '×' : '';
          if (RD.mode === 'test')
              f = n / 4;
      }
      else if (RD.arc) {
          const arc = RD.arc, now = performance.now(), parts: string[] = [];
          if (arc.mode === 'survival') {
              const lives = arc.lives ?? 0;
              parts.push('♥'.repeat(lives) + '♡'.repeat(Math.max(0, ARCADE_LIVES - lives)));
              f = RD.answered ? RD.limF : 1 - (now - RD.t0) / arc.targetMs;
          }
          else if (arc.mode === 'timeAttack') {
              const left = srtArcadeRemainingMs(arc, now) ?? 0;
              parts.push('⏱ ' + Math.ceil(left / 1000) + 's');
              f = left / TIME_ATTACK_MS;
          }
          else if (arc.total !== null) {
              const answered = arc.correct + arc.mistakes;
              parts.push(t('rdx_hud_q', Math.min(arc.total, answered + (RD.answered ? 0 : 1)), arc.total));
              f = answered / arc.total;
          }
          parts.push('×' + srtArcadeMultiplier(arc.combo), t('rdx_arc_score', anNum(arc.score, 0)));
          if (arc.combo >= 2)
              parts.push('🔥 ' + arc.combo);
          s = parts.join(' · ');
      }
      else {
          s = '✓ ' + RD.ok + '/' + RD.n + (RD.streak >= 2 ? ' · 🔥 ' + RD.streak : '');
          if (RD.mode === 'practice' && rdHasCheck(RD.L))
              s += ' · ' + rdCheckHud();
      }
      if (RD.flow && RD.flow.gh)
          s += ' · 👻 ' + formatLead(RD.flow.gd);
      h.textContent = s;
      mt.hidden = f == null;
      const progress = mt.firstElementChild;
      if (f != null && progress instanceof HTMLElement)
          progress.style.transform = 'scaleX(' + Math.max(0, Math.min(1, f)).toFixed(3) + ')';
  }
  const RD_RHU: Record<RdRhythmUnit, number[][]> = { '4': [[1]], '2': [[2]], '1': [[4]], '8': [[.5], [.5]], 'r4': [[1, 1]], 'd': [[1.5], [.5]], '16': [[.25], [.25], [.25], [.25]] };
  function isRdRhythmUnit(u: string): u is RdRhythmUnit { return Object.hasOwn(RD_RHU, u); }
  /** The tempo of a rhythm or sight-reading level; every such level in the curriculum sets one. */
  function rdLevelBpm(L: ReadDrillLevel): number { if (L.bpm === undefined)
      throw new TypeError('Étude: level ' + L.id + ' has no tempo'); return L.bpm; }
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
                  const c = units.filter((u): u is RdRhythmUnit => { if (!isRdRhythmUnit(u))
                      return false; const len = RD_RHU[u].reduce((a: number, x: number[]) => a + x[0], 0); return len <= 4 - pos + 1e-6 && !(u === '1' && pos > 0) && !(u === 'r4' && bar === 0 && pos === 0) && !(u === 'd' && pos % 2); });
                  const u: RdRhythmUnit = c.length ? randItem(c) : '4';
                  RD_RHU[u].forEach((x: number[]) => { ev.push({ beat: bar * 4 + pos, dur: x[0], rest: !!x[1], u }); pos += x[0]; });
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
  function rdClick(tm: number, acc: boolean) {
      const click = shell.audioEngine.scheduleClick(tm, acc);
      if (click?.oscs)
          (RD.nodes = RD.nodes || []).push(...click.oscs);
  }
  function rdBeatX(r: { beatX: readonly { b: number; x: number; }[]; }, beat: number) { const p = r.beatX; for (let i = 0; i < p.length - 1; i++) {
      if (beat >= p[i].b && beat <= p[i + 1].b) {
          const f = (beat - p[i].b) / Math.max(1e-3, p[i + 1].b - p[i].b);
          return p[i].x + f * (p[i + 1].x - p[i].x);
      }
  } return beat <= p[0].b ? p[0].x : p[p.length - 1].x; }
  // Options (remembered): grade how long each note is held, and/or a left-hand part on a second staff.
  function rdRhPrefs() { const p = rdData().prefs; return { dur: !!p.rhDur, two: p.rhHands === 2 }; }
  const RD_LH_PAT: Record<RdLeftHandPattern, number[][]> = { whole: [[4]], half: [[2], [2]], pulse: [[1], [1], [1], [1]], onethree: [[1], [1, 1], [1], [1, 1]], twofour: [[1, 1], [1], [1, 1], [1]] };
  function rdRhGenLH(L: { n: number; }) {
      const pool: RdLeftHandPattern[] = L.n <= 2 ? ['whole', 'half'] : L.n === 3 ? ['whole', 'half', 'pulse'] : ['half', 'pulse', 'onethree', 'twofour'], ev: RdRhythmEvent[] = [];
      for (let bar = 0; bar < 2; bar++) {
          let pos = 0;
          const pat: RdLeftHandPattern = randItem(pool);
          RD_LH_PAT[pat].forEach((x: number[]) => { ev.push({ beat: bar * 4 + pos, dur: x[0], rest: !!x[1] }); pos += x[0]; });
      }
      return ev;
  }
  // The anchors on the dock keyboard: C3 for the left hand, C5 for the right (any key below / from middle C counts for that hand).
  function rdRhMarks(on: boolean) { [48, 72].forEach((m) => kbState(m, on ? 'target' : null, false)); }
  function rdRhNew(keep?: boolean) {
      const L = RD.L, pr = rdRhPrefs(), old = keep && RD.rh;
      if (!L)
          return;
      const ev = old ? old.ev : rdRhGen(L), lh = pr.two ? ((old && old.lh) || rdRhGenLH(L)) : null;
      const piece: RdRhythmPiece = { id: 'rh', perc: true, noNames: true, ts: [4, 4], keyN: 0, bpm: rdLevelBpm(L), rh: ev.map((e: RdRhythmEvent): [string, number] => [e.rest ? 'R' : 'B4', e.dur]) };
      if (lh)
          piece.lh = lh.map((e: RdRhythmEvent): [string, number] => [e.rest ? 'R' : 'D3', e.dur]);
      const r: RdRhythmRender = srRender(piece, undefined, true);
      const rh: RdRhythmState = { ev, lh, r, dur: pr.dur, two: pr.two, on: ev.filter((e: RdRhythmEvent) => !e.rest).map((e: RdRhythmEvent) => e.beat), taps: [], presses: [], open: new Map(), playing: false, graded: null, raf: 0, listen: false, t0: 0, piece, paper: undefined };
      RD.rh = rh;
      const tst = RD.mode === 'test', pad = (h: string, lbl: string, k: string) => `<button class="rdx-tap" id="rdx-tap${h === 'L' ? 'L' : ''}" data-hand="${h}" aria-label="${rdEsc(lbl)}" aria-describedby="rdx-coach">${rdEsc(lbl)}<small>${rdEsc(k)}</small></button>`;
      const pads = pr.two ? pad('L', t('rdx_tap') + ' · ' + t('rdx_tap_l'), t('rdx_tap_lk')) + pad('R', t('rdx_tap') + ' · ' + t('rdx_tap_r'), t('rdx_tap_rk')) : pad('R', t('rdx_tap'), t('rdx_tap_k'));
      const hint = [pr.two ? t('rdx_rh_two_hint') : '', pr.dur ? t('rdx_rh_dur_hint') : ''].filter(Boolean).join(' ');
      byId('rdx-body').innerHTML = `<div class="rdx-q rdx-rh"><div class="rdx-prompt">${t('rdx_p_rh')}${tst ? ' · ' + t('rdx_hud_q', RD.rhP.length + 1, 4) : ''}</div>
      <div class="rdx-rhopts" id="rdx-rhopts" role="group" aria-label="${t('rdx_rh_opts')}"><label class="switch-inline"><input type="checkbox" id="rdx-rhdur"${pr.dur ? ' checked' : ''}> <span>${t('rdx_rh_dur')}</span></label>
        <div class="seg" id="rdx-rhhands" role="group" aria-label="${t('rdx_rh_hands')}"><button type="button" data-hands="1" aria-pressed="${!pr.two}">${t('rdx_rh_one')}</button><button type="button" data-hands="2" aria-pressed="${pr.two}">${t('rdx_rh_two')}</button></div></div>
      <p class="rdx-rhhint" id="rdx-rhhint">${rdEsc(hint)}</p>
      <div class="rdx-staff ss-wrap" id="rdx-staff">${r.svg}</div><div class="rdx-fb" id="rdx-fb">${t('rdx_rh_bpm', rdLevelBpm(L))}</div><div class="rdx-rhdet" id="rdx-rhdet"></div>
      <div class="rdx-rhbar"><button class="btn primary" id="rdx-rhgo">${t('rdx_rh_start')}</button>${tst ? '' : `<button class="btn ghost" id="rdx-rhlisten">${t('rd_listen')}</button>`}${pads}</div>
      <div class="rdx-tools" id="rdx-rhnext"></div></div>`;
      rdRhFit();
      rdRhMarks(pr.two);
      rdHud();
  }
  // Lays the rhythm out for its paper once it is on the page, and again when the paper changes size; never while it plays or
  // once it is graded, since the marks live on the drawn notes.
  function rdRhFit() {
      const R = RD.rh, wrap = maybeById('rdx-staff');
      if (!R || !wrap || R.playing || R.graded || !wrap.closest('.rdx-rh'))
          return;
      const lay = srPaperOf(wrap);
      if (!srPaperChanged(R.paper, lay))
          return;
      R.paper = lay;
      R.r = srRender(R.piece, lay, true);
      wrap.innerHTML = R.r.svg;
  }
  function rdRhOptsLock(on: boolean) { (document).querySelectorAll('#rdx-rhopts input,#rdx-rhopts button').forEach((x) => { if (x instanceof HTMLInputElement || x instanceof HTMLButtonElement)
      x.disabled = on; }); }
  let rdRhRunId = 0;
  function rdRhInterrupt() {
      const round = RD.rh;
      if (!round?.playing) return;
      rdRhRunId++;
      round.playing = false;
      cancelAnimationFrame(round.raf);
      round.open.clear();
      (RD.nodes || []).forEach(node => { try { node.stop(0); } catch (_) { } });
      RD.nodes = [];
      byId('rdx-staff').querySelector('.ss-playhead')?.remove();
      rdRhOptsLock(false);
      byId('rdx-fb').textContent = t('rdx_rh_yourturn');
      byId('rdx-live').textContent = t('rdx_rh_yourturn');
  }
  async function rdRhRun(listen: boolean) {
      const R = RD.rh, L = RD.L;
      if (!R || !L || R.playing) return;
      const context = ensureAudio();
      if (!context) return;
      const runId = ++rdRhRunId;
      R.playing = true;
      R.t0 = Infinity;
      rdRhOptsLock(true);
      if (context.state !== 'running') {
          const ready = await timedAudioReady(context);
          if (RD.rh !== R || rdRhRunId !== runId || !R.playing) return;
          if (!ready) {
              rdRhInterrupt();
              return;
          }
      }
      const bs = 60 / rdLevelBpm(L);
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
          rdClick(act0 + b * bs, b === 0);
      for (let b = 0; b < 8; b++)
          rdClick(beat0 + b * bs, b % 4 === 0);
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
      f.textContent = t('rdx_rh_count');
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
          if (b >= 0 && f.textContent === t('rdx_rh_count'))
              f.textContent = listen ? t('rdx_rh_listening') : t('rdx_rh_tapnow');
          const x = rdBeatX(R.r, Math.max(0, Math.min(8, b)));
          c.setAttribute('x1', String(x));
          c.setAttribute('x2', String(x));
          if (b > 8.6) {
              R.playing = false;
              c.remove();
              rdRhOptsLock(false);
              if (listen) {
                  f.textContent = t('rdx_rh_yourturn');
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
      const R = RD.rh, L = RD.L;
      if (!R || !L || !R.playing || R.listen || !Number.isFinite(R.t0))
          return;
      if (R.open.has(src))
          rdRhRelease(src);
      const b = (inputTime() - R.t0) / 1000 / (60 / rdLevelBpm(L)); // the key's own time, less its calibrated latency
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
  function rdRhRelease(src: string) { const R = RD.rh; if (!R)
      return; const p = R.open.get(src); if (!p)
      return; R.open.delete(src); const L = RD.L; if (R.playing && L)
      p.off = Math.max(p.on, (inputTime() - R.t0) / 1000 / (60 / rdLevelBpm(L))); }
  function rdRhKey(kind: string, m: number) { if (kind === 'on')
      rdRhPress('m' + m, m < 60 ? 'L' : 'R');
  else
      rdRhRelease('m' + m); }
  function rdTap(hand: string | undefined) { const src = 'tap' + performance.now(); rdRhPress(src, hand || 'R'); rdRhRelease(src); }
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
          return t('rdx_rh_n_miss');
      const p: string[] = [], roff = r.roff ?? 0; // roff is set whenever rs is
      if (r.rs === 'early')
          p.push(t('rdx_rh_n_early', -roff));
      else if (r.rs === 'late')
          p.push(t('rdx_rh_n_late', roff));
      else if (r.rs === 'near')
          p.push(t(roff < 0 ? 'rdx_rh_n_short' : 'rdx_rh_n_long'));
      if (Math.abs(r.off) > 100)
          p.push(Math.round(r.off) + ' ms');
      return p.join(' · ');
  }
  function rdRhHandLine(name: string, g: RdRhythmHandGrade | undefined) {
      if (!g)
          return '';
      const p = [t('rdx_rh_att', (g.good + g.near) + '/' + g.N)];
      if (g.dur) {
          p.push(t('rdx_rh_len', g.lenOk + '/' + g.N));
          if (g.early)
              p.push(t('rdx_rh_early', g.early));
          if (g.late)
              p.push(t('rdx_rh_late', g.late));
      }
      if (g.extra)
          p.push(t('rdx_rh_extra', g.extra));
      return (name ? t('rdx_rh_hand', name, g.pct) + ' — ' : '') + p.join(' · ');
  }
  function rdRhDone(endBeat: number) {
      const R = RD.rh, L = RD.L;
      if (!R || !L)
          return;
      const bs = 60 / rdLevelBpm(L), plain = !R.dur && !R.two;
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
      RD.rhP.push(g.pct);
      const matched = g.res.some(r => r.off != null);
      if (matched) RD.rhM.push(g.mean);
      RD.n++;
      RD.ok += g.pct;
      markReadDoneToday(true);
      const timing = !matched ? '' : ' · ' + (Math.abs(g.mean) < 25 ? t('rdx_rh_ontime') : g.mean < 0 ? t('rdx_rh_rush', -g.mean) : t('rdx_rh_drag', g.mean));
      if (plain)
          msg = t('rdx_rh_res', g.pct, (g.good + g.near) + '/' + R.on.length) + timing + (g.extra ? ' · ' + t('rdx_rh_extra', g.extra) : '');
      else if (!R.two)
          msg = t('rdx_rh_score', g.pct) + ' · ' + rdRhHandLine('', 'by' in g ? g.by.R : undefined) + timing;
      else
          msg = t('rdx_rh_score', g.pct) + timing;
      if (det)
          det.innerHTML = R.two ? (['R', 'L'] as const).map((h) => `<div>${rdEsc(rdRhHandLine(t(h === 'R' ? 'rdx_rh_hand_r' : 'rdx_rh_hand_l'), 'by' in g ? g.by[h] : undefined))}</div>`).join('') : '';
      const f = byId('rdx-fb');
      f.className = 'rdx-fb ' + (g.pct >= 75 ? 'good' : g.pct >= 50 ? '' : 'bad');
      f.textContent = msg;
      byId('rdx-live').textContent = [msg].concat(det ? [...det.children].map((x) => x.textContent ?? '') : []).join('. ');
      rdStat('rh:' + L.id, g.pct >= 75, 0);
      if (RD.mode === 'test') {
          if (RD.rhP.length >= 4) {
              RD.timers.push(setTimeout(() => { if (RD.on)
                  rdFinish(); }, 1600));
          }
          else
              byId('rdx-rhnext').innerHTML = `<button class="btn primary" data-act="rhnew">${t('rdx_next_ex')} →</button>`;
      }
      else if (rdnWarmLimit())
          RD.timers.push(setTimeout(() => { if (RD.on)
              rdFinish(); }, 1600));
      else
          byId('rdx-rhnext').innerHTML = `<button class="btn ghost" data-act="rhagain">↺ ${t('rdx_again_same')}</button><button class="btn primary" data-act="rhnew">🎲 ${t('rdx_new_rh')}</button>`;
      rdHud();
  }
  function isRdSightLevel(L: ReadDrillLevel): L is ReadDrillLevel & RdSightLevel { return Array.isArray(L.keys) && L.lo !== undefined && L.hi !== undefined && Array.isArray(L.durs) && L.bpm !== undefined; }
  function srtProfileForLevel(L: RdSightLevel): SightReadingProfile {
      if (L.id === 'sr10')
          return 'P4.a';
      if (L.id === 'sr11')
          return 'P4.b';
      if (L.id === 'sr12')
          return 'P4.c';
      if (L.id === 'sr6')
          return 'P3.a';
      if (L.id === 'sr7')
          return 'P3.b';
      if (L.id === 'sr8')
          return 'P3.c';
      if (L.id === 'sr9')
          return 'P3.d';
      if (L.clef === 'grand')
          return 'P2.c';
      if (L.id === 'sr1')
          return 'P1.a';
      if (L.id === 'sr2')
          return 'P1.b';
      if (L.id === 'sr3')
          return 'P1.c';
      if (L.id === 'sr4')
          return 'P2.a';
      return 'P2.b';
  }
  let srtSeedCounter = 0;
  const SRT_LAST_FINGERPRINT_KEY = 'etude-sight-last-fingerprint';
  const SRT_RECENT_FINGERPRINTS_KEY = 'etude-sight-recent-fingerprints';
  const SRT_RECENT_FINGERPRINT_LIMIT = 12;
  const parseSrtRecent: (text: string) => unknown = JSON.parse;
  let srtRecentFingerprintMemory: string[] = [];
  function srtSeedForLevel(id: string, injectedSeed?: number): number {
      if (Number.isInteger(injectedSeed))
          return injectedSeed as number;
      if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
          const values = new Uint32Array(1);
          crypto.getRandomValues(values);
          return values[0] >>> 0;
      }
      let salt = 0;
      for (const char of id)
          salt = (salt * 31 + char.charCodeAt(0)) | 0;
      srtSeedCounter = (srtSeedCounter + 1) >>> 0;
      return (Date.now() ^ salt ^ srtSeedCounter) >>> 0;
  }
  function srtRememberGeneratedFingerprint(fingerprint: string) {
      const recent = srtRecentGeneratedFingerprints().filter((value) => value !== fingerprint);
      recent.push(fingerprint);
      srtRecentFingerprintMemory = recent.slice(-SRT_RECENT_FINGERPRINT_LIMIT);
      const serialized = JSON.stringify(srtRecentFingerprintMemory);
      try {
          sessionStorage.setItem(SRT_LAST_FINGERPRINT_KEY, fingerprint);
          sessionStorage.setItem(SRT_RECENT_FINGERPRINTS_KEY, serialized);
      }
      catch {
          // A session-storage failure must not block offline generation.
      }
      try {
          localStorage.setItem(SRT_LAST_FINGERPRINT_KEY, fingerprint);
          localStorage.setItem(SRT_RECENT_FINGERPRINTS_KEY, serialized);
      }
      catch {
          // A local-storage failure must not block offline generation.
      }
  }
  function srtRecentGeneratedFingerprints() {
      const values: string[] = [...srtRecentFingerprintMemory];
      const read = (store: Storage) => {
          try {
              const raw = store.getItem(SRT_RECENT_FINGERPRINTS_KEY);
              if (raw) {
                  const parsed = parseSrtRecent(raw);
                  if (Array.isArray(parsed))
                      parsed.forEach((value) => { if (typeof value === 'string')
                          values.push(value); });
              }
              else {
                  const last = store.getItem(SRT_LAST_FINGERPRINT_KEY);
                  if (last)
                      values.push(last);
              }
          }
          catch {
              // Generation remains available when browser storage is unavailable.
          }
      };
      read(sessionStorage);
      read(localStorage);
      return [...new Set(values)].slice(-SRT_RECENT_FINGERPRINT_LIMIT);
  }
  function srtLegacyPiece(piece: SightReadingPiece, L: RdSightLevel): RdSightPiece {
      const hand = L.clef === 'bass' ? 'lh' : 'rh';
      // A note that crosses a beat is written as tied notes; only the first one is played.
      const events = (voice: 'rh'|'lh'): SrToken[] => srtNotationSegments(piece, voice)
          .map((segment): SrToken => {
              const sound: SrToken[0] = segment.event.pitches.length ? segment.event.pitches.map((pitch) => pitch.spelling) : 'R';
              return segment.tied ? [sound, segment.durationTick / 480, 'tied'] : [sound, segment.durationTick / 480];
          });
      const result: RdSightPiece = {
          id: 'gen', ephemeral: true, gen: L.id, comp: '', level: L.n, keyN: piece.key.keyN, minor: piece.key.mode !== 'major',
          ts: [piece.meter.num, 4], bpm: 60,
          t: { en: tl('en', 'rdx_sr_title', L.n), ro: tl('ro', 'rdx_sr_title', L.n) },
      };
      if (piece.events.some((event) => event.hand === 'lh'))
          result.lh = events('lh');
      if (piece.events.some((event) => event.hand === 'rh'))
          result.rh = events('rh');
      if (!result.rh && !result.lh)
          result[hand] = events(hand);
      return result;
  }
  function rdSightGen(L: RdSightLevel) {
      const keyN: number = randItem(L.keys), kA = ssKeyAcc(keyN), lo = rdStep(rdP(L.lo)), hi = rdStep(rdP(L.hi));
      const tonLi = SR_LET.indexOf(RD_MAJ[keyN + 7][0]);
      let ton = lo;
      while (((ton % 7) + 7) % 7 !== tonLi)
          ton++;
      if (ton > hi)
          ton -= 7;
      const nm = (s: number) => { const n = rdFromStep(s); return SR_LET[n.li] + (kA[n.li] > 0 ? '#' : kA[n.li] < 0 ? 'b' : '') + n.oct; };
      let cur = ton;
      const mel: [string, number][] = [];
      const mv = () => { const near = [-2, -1, -1, 1, 1, 2, 0], far = [3, -3, 4, -4]; for (let k = 0; k < 24; k++) {
          const s: number = cur + randItem(k < 12 && Math.random() < .8 ? near : far);
          if (s >= Math.max(lo, ton - 4) && s <= hi)
              return s;
      } return ton; };
      for (let bar = 0; bar < 4; bar++) {
          let pos = 0;
          const end = bar === 3 ? 2 : 4;
          while (pos < end - 1e-6) {
              const c = L.durs.filter((d: number) => (d === 1.5 ? 2 : d === 0.5 ? 1 : d) <= end - pos + 1e-6 && !(d === 1.5 && pos % 1));
              const d: number = c.length ? randItem(c) : end - pos;
              if (d === 1.5) {
                  cur = mv();
                  mel.push([nm(cur), 1.5]);
                  cur = mv();
                  mel.push([nm(cur), 0.5]);
                  pos += 2;
              }
              else if (d === 0.5) {
                  cur = mv();
                  mel.push([nm(cur), 0.5]);
                  cur = mv();
                  mel.push([nm(cur), 0.5]);
                  pos += 1;
              }
              else {
                  cur = pos === 0 && bar === 0 ? ton : mv();
                  mel.push([nm(cur), d]);
                  pos += d;
              }
          }
          if (bar === 3)
              mel.push([nm(ton), 2]);
      }
      if (mel.length)
          mel[0][0] = nm(ton);
      const p: RdSightPiece = { id: 'gen', ephemeral: true, gen: L.id, comp: '', level: L.n, keyN, ts: [4, 4], bpm: L.bpm,
          t: { en: tl('en', 'rdx_sr_title', L.n), ro: tl('ro', 'rdx_sr_title', L.n) } };
      if (L.clef === 'bass')
          p.lh = mel;
      else
          p.rh = mel;
      if (L.clef === 'grand') {
          const b = SR_LET.indexOf(RD_MAJ[keyN + 7][0]), deg: number[] = [0, randItem([3, 4]), 4, 0];
          p.lh = deg.map((dg): [string, number] => { let s = 14 + 7 + b + dg; if (s >= 28)
              s -= 7; return [nm(s), 4]; });
      }
      return p;
  }
  function rdSightStart(mode: string, injectedSeed?: number) {
      const L = RD.L;
      if (!L)
          return;
      if (srtPendingSaveProtected()) {
          if (SR.srtState?.name === 'pendingSave') {
              const pendingEpoch = srtOperationEpoch;
              void srtAbandonClaim('abandoned', false).then((result) => {
                  if (result.ok && srtOperationEpoch === pendingEpoch + 1 && SR.srtState?.name === 'abandoned')
                      rdSightStart(mode, injectedSeed);
              });
          }
          return;
      }
      srStopAll(undefined, false, 'navigate');
      rdnForgetLevelPiece();
      rdData().prefs.srLv = L.id;
      if (!isRdSightLevel(L))
          throw new TypeError('Étude: ' + L.id + ' is not a sight-reading level');
      const profile = srtProfileForLevel(L);
      const hand = L.clef === 'bass' ? 'lh' : 'rh';
      let seed = srtSeedForLevel(L.id, injectedSeed);
      let srtPiece = srtGenerate(profile, seed, hand);
      if (injectedSeed === undefined) {
          const ledger = srtReadLedger(localStorage);
          const recent = new Set(srtRecentGeneratedFingerprints());
          let fingerprint = srtFingerprint(srtPiece);
          for (let reroll = 0; reroll < 32 && (ledger.exposures[fingerprint] || recent.has(fingerprint)); reroll++) {
              seed = (seed + 0x9e3779b9) >>> 0;
              srtPiece = srtGenerate(profile, seed, hand);
              fingerprint = srtFingerprint(srtPiece);
          }
      }
      SR.srtPiece = srtPiece;
      SR.srtFingerprint = srtFingerprint(srtPiece);
      srtRememberGeneratedFingerprint(SR.srtFingerprint);
      SR.srtState = { ...SRT_INITIAL_STATE, mode: 'firstSight', fingerprint: SR.srtFingerprint };
      SR.srtPendingAttempt = null;
      SR.srtEvaluation = null;
      SR.srtResultValue = null;
      SR.srtResultLevelId = null;
      srtPreviewUi(false);
      srtPendingUi(false);
      srtNotice(null);
      void srtProgressLedgerUpdate({ type: 'recoverOrphanClaims', generation: srtReadLedger(localStorage).generation });
      SR.gen = srtLegacyPiece(srtPiece, L);
      RD.on = false;
      rdTab('pieces');
      SR.modeSel = mode === 'test' ? 'assess' : 'learn';
      srModeUi();
      srSelectPiece('gen');
      if (mode !== 'test')
          srtConsumeOnLearnReveal();
      const v = byId('rd-verdict');
      v.className = 'verdict neutral';
      v.textContent = t('rdx_sr_ready');
      const g = byId('rd-go');
      if (g)
          g.focus();
  }
  function rdGenMelody() { const L = RD_LV[rdData().prefs.srLv ?? ''] || RD_LV.sr1; RD.L = L; rdSightStart(SR.modeSel === 'assess' ? 'test' : 'practice'); }
  /** A Step by step run: accuracy from the mistakes per step, and up to 2 stars (none after many slips). */
  function srLearnGrade(mistakes: number, steps: number): { acc: number; stars: 0 | 1 | 2 } {
      return { acc: Math.max(0, Math.round(100 * (1 - mistakes / steps))), stars: mistakes === 0 ? 2 : mistakes <= Math.max(1, steps * 0.15) ? 1 : 0 };
  }
  function rdSightDone(kind: string, val: number) {
      const p = SR.piece;
      if (!p || !p.gen)
          return '';
      const L = RD_LV[p.gen];
      if (!L)
          return '';
      const steps = SR.steps.length || 1, grade = srLearnGrade(val, steps), acc = kind === 'assess' ? val : grade.acc;
      const stars = kind === 'assess' ? (val >= 95 ? 3 : val >= 80 ? 2 : val >= 60 ? 1 : 0) : grade.stars;
      const d = rdData(), rec = d.lv[L.id] || (d.lv[L.id] = { s: 0, acc: 0, t: 0, n: 0, rush: 0 });
      rec.n++;
      rec.s = Math.max(rec.s, stars);
      rec.acc = Math.max(rec.acc, acc);
      d.tot.sess++;
      return kind === 'assess' ? '' : ' · ' + '★'.repeat(stars) + '☆'.repeat(3 - stars);
  }
  function rdRangeTxt(L: { set?: readonly string[]; lo?: string; hi?: string; }) { if (L.set)
      return L.set.map((s) => rdName(rdP(s), true)).join(' · '); if (L.lo && L.hi)
      return rdName(rdP(L.lo), true) + '–' + rdName(rdP(L.hi), true); return ''; }
  function rdLvDetail(L: ReadDrillLevel) {
      const p = [t('rdx_ty_' + L.ty)];
      if (L.ty === 'rh')
          p.push((L.units ?? []).map((u) => t('rdx_rhu_' + u)).join(', '));
      else if (L.ty === 'ks') {
          p.push(t('rdx_kmax', ...(L.kmax != null ? [L.kmax] : [])));
          if (L.clef === 'grand')
              p.push(t('rdx_clef_grand'));
      }
      else {
          if (L.tag)
              p.push(t('rdx_tag_' + L.tag));
          if (L.clef !== 'mix' && (L.custom || !['tr', 'ba', 'cc'].includes(L.u)))
              p.push(t('rdx_clef_' + L.clef));
          const r = rdRangeTxt(L);
          if (r)
              p.push(r);
      }
      if (L.acc)
          p.push(t('rdx_acc' + L.acc));
      if (L.keys)
          p.push(t('rdx_inkeys', String(L.keys)));
      if (L.harm)
          p.push(t(L.harm === 1 ? 'rdx_harm' : 'rdx_harmmix'));
      if (L.ty === 'iv' && L.ivs && L.ivs.length < 7)
          p.push(rdIvName(L.ivs[0]) + '–' + rdIvName(L.ivs[L.ivs.length - 1]));
      if (L.q)
          p.push(L.q.map((q) => t('rdx_q_' + q)).join(' / '));
      if (L.inv)
          p.push(t('rdx_inv'));
      if (L.ty === 'sr' || L.ty === 'rh')
          p.push(L.bpm + ' BPM');
      return p.join(' · ');
  }
  function rdLvSub(L: ReadDrillLevel) { return rdLvDetail(L).split(' · ').slice(1).join(' · '); }
  function rdStars(value: number, label?: string) {
      const count = rdStarCount(value);
      return `<span class="rdx-stars" role="img" aria-label="${rdEsc(label ?? t('rdx_stars_n', count))}">${'★'.repeat(count)}<i>${'☆'.repeat(3 - count)}</i></span>`;
  }
  function rdKeyText(k: string) {
      const clefOf: Record<string, string> = { t: 'treble', b: 'bass', a: 'alto', n: 'tenor' };
      let m = /^([tban]):([A-G])([#b]?)(\d)$/.exec(k);
      if (m)
          return rdName({ li: SR_LET.indexOf(m[2]), acc: m[3] === '#' ? 1 : m[3] === 'b' ? -1 : 0, oct: +m[4] }, true) + ' (' + t('rdx_clef_' + clefOf[m[1]]) + ')';
      if ((m = /^iv:(\d)$/.exec(k)))
          return rdIvName(+m[1]);
      if ((m = /^ch:(\w+)$/.exec(k)))
          return t('rdx_q_' + m[1]);
      if ((m = /^ks:(-?\d)$/.exec(k)))
          return rdKeyLabel(+m[1]);
      if ((m = /^rh:(\w+)$/.exec(k)) && RD_LV[m[1]])
          return rdLvName(RD_LV[m[1]]);
      return k;
  }
  function rdScroll() { const tb = byId('rd-tabs'); if (!tb)
      return; const hd = (document).querySelector('header'), y = tb.getBoundingClientRect().top + window.scrollY - (hd ? hd.offsetHeight : 0) - 10; if (window.scrollY > y + 4 || tb.getBoundingClientRect().top > window.innerHeight * 0.3)
      window.scrollTo({ top: Math.max(0, y), behavior: 'auto' }); }
  function rdOpen(L: ReadDrillLevel) { if (RDN.screen !== 'drills')
      rdTab('drills'); rdAbort(); RD.L = L; if (!L.custom)
      rdData().prefs.last = L.id; byId('rdx-home').hidden = true; byId('rdx-stage').hidden = false; rdIntro(); rdScroll(); const b = byId('rdx-back'); if (b)
      b.focus({ preventScroll: true }); }
  function rdIntro() {
      const L = RD.L;
      if (!L)
          return;
      const r: Partial<ReadDrillLevelStat> = L.custom ? {} : (rdData().lv[L.id] || {});
      RD.on = false;
      stageSync();
      byId('rdx-title').textContent = rdLvName(L);
      byId('rdx-sub').textContent = rdLvDetail(L);
      byId('rdx-hud').textContent = '';
      byId('rdx-meter').hidden = true;
      byId('rdx-end').hidden = true;
      const modes = rdModes(L), ic = RD_MODE_ICON;
      const pool = ['name', 'play', 'k2s'].includes(L.ty) ? rdPoolSvg(L) : '';
      const prev = pool ? `<div class="rdx-staff rdx-preview" aria-hidden="true">${pool}</div>` : '';
      const rec = L.custom ? '' : `<div class="rdx-rec">${rdStars(r.s || 0)}${r.acc ? `<span>${t('rdx_best_acc', r.acc)}</span>` : ''}${r.t ? `<span>${t('rdx_best_t', (r.t / 1000).toFixed(1))}</span>` : ''}</div>`;
      const sfx = rdHasCheck(L) ? '' : '_' + L.ty;
      const card = (m: ReadDrillMode, cls: string) => `<button type="button" class="rdx-mode${cls}" data-mode="${m}"><b>${ic[m]} ${t('rdx_m_' + m)}</b><span>${t('rdx_md_' + m + sfx)}</span></button>`;
      // Each Challenge mode shows its record; Marathon is a group with one item per length.
      const best = (m: ReadDrillMode) => { const b = m === 'timeAttack' ? (r.ta ? t('rdx_best_ta', anNum(r.ta, 0)) : '') : m === 'survival' ? (r.sv ? t('rdx_best_sv', anNum(r.sv, 0)) : '') : r.mn ? t('rdx_best_mn', r.mn) : ''; return b ? `<em>🏆 ${rdEsc(b)}</em>` : ''; };
      const item = (m: ReadDrillMode) => m === 'marathon'
          ? `<div class="rdx-chal-grp" role="group" aria-labelledby="rdx-m-marathon"><b id="rdx-m-marathon">${ic[m]} ${t('rdx_m_marathon')}</b><span>${t('rdx_md_marathon')}</span>${best(m)}<div class="rdx-bars"><span aria-hidden="true">${t('rdx_bars')}</span>${[16, 32, 64].map((n) => `<button type="button" class="chip" role="menuitem" tabindex="-1" data-mode="marathon" data-bars="${n}" aria-label="${rdEsc(t('rdx_m_marathon') + ', ' + t('rdx_bars') + ' ' + n)}">${n}</button>`).join('')}</div></div>`
          : `<button type="button" class="rdx-chal-it" role="menuitem" tabindex="-1" data-mode="${m}"><b>${ic[m]} ${t('rdx_m_' + m)}</b><span>${t('rdx_md_' + m)}</span>${best(m)}</button>`;
      const chal = modes.filter((m) => m !== 'practice');
      // Practice first; then the Challenge menu, or the graded run for rhythm and sight-reading levels.
      const more = rdHasCheck(L)
          ? `<button type="button" class="rdx-mode rdx-chal-btn" id="rdx-chal" aria-haspopup="menu" aria-expanded="false" aria-controls="rdx-chal-menu"><b>🏁 ${t('rdx_challenge')} <i aria-hidden="true">▾</i></b><span>${rdEsc(chal.map((m) => t('rdx_m_' + m)).join(' · '))}</span></button><div class="rdx-chal-menu" id="rdx-chal-menu" role="menu" aria-labelledby="rdx-chal" hidden>${chal.map(item).join('')}</div>`
          : card('test', '');
      byId('rdx-body').innerHTML = `<div class="rdx-intro"><p class="rdx-desc">${t('rdx_d_' + L.ty + (rdFlowOk(L) ? '_flow' : ''))}</p>${prev}${rec}<div class="rdx-modes">${card('practice', ' rdx-mode-main')}${more}</div></div>`;
      rdCoach(true);
  }
  // The notes a naming or playing level draws from, on its staff with their names; '' when the level mixes clefs.
  function rdPoolSvg(L: ReadDrillLevel) {
      const clef = L.clef;
      if (clef === 'mix' || clef === undefined || (!L.set && !(L.lo && L.hi)))
          return '';
      const pool = rdPool(L).filter((n) => !n.acc).sort((a, b) => rdStep(a) - rdStep(b));
      return rdSvg({ clef, cols: pool.map((n) => [n]), colW: pool.length > 16 ? 22 : 28, dur: 1, scale: 1.1, lbl: pool.map((n) => rdName(n)) }).svg;
  }
  // A picture of what a level asks: its notes, its widest interval or chord from the bottom of its range, or its largest key
  // signature. '' for rhythm and mixed-clef levels, which show their unit's icon instead.
  function rdLvSample(L: ReadDrillLevel) {
      if (L.ty === 'ks')
          return L.clef && L.clef !== 'mix' ? rdSvg({ clef: L.clef, keyN: L.kmax ?? 0, cols: [], minW: 150 }).svg : '';
      if (L.ty === 'iv' || L.ty === 'ch') {
          if (!L.lo || L.clef === undefined || L.clef === 'mix' || L.clef === 'grand')
              return '';
          const clef = rdStaffClef(L.clef), lo = rdStep(rdP(L.lo)), iv = L.ivs ? L.ivs[L.ivs.length - 1] : 5;
          const cols = L.ty === 'iv' ? (L.harm === 1 ? [[rdFromStep(lo), rdFromStep(lo + iv - 1)]] : [[rdFromStep(lo)], [rdFromStep(lo + iv - 1)]]) : [[0, 2, 4].map((j) => rdFromStep(lo + j))];
          return rdSvg({ clef, cols, colW: 72 }).svg;
      }
      return L.ty === 'rh' ? '' : rdPoolSvg(L);
  }
  function rdChalItems() { return queryAllHtml(document, '#rdx-chal-menu [role=menuitem]'); }
  // Opens or closes the Challenge menu; on opening, focus goes to its first or last item.
  function rdChalOpen(open: boolean, focus?: 'first' | 'last') {
      const b = maybeById('rdx-chal'), m = maybeById('rdx-chal-menu');
      if (!b || !m)
          return;
      m.hidden = !open;
      b.setAttribute('aria-expanded', String(open));
      const it = rdChalItems();
      if (open && focus && it.length)
          it[focus === 'last' ? it.length - 1 : 0].focus({ preventScroll: true });
      // The menu opens below the button; the page scrolls so the keyboard dock and the bottom bar do not cover it.
      if (open) {
          const tops = [maybeById('dock'), maybeById('bottomNav')].flatMap((el) => { const r = el?.getBoundingClientRect(); return r && r.height > 0 && r.top < innerHeight ? [r.top] : []; });
          const over = m.getBoundingClientRect().bottom + 8 - Math.min(innerHeight, ...tops);
          if (over > 0)
              window.scrollBy(0, over);
      }
  }
  // Arrow keys move through the Challenge menu, Home and End jump to its ends, Esc closes it and Tab leaves it.
  function rdChalKey(e: KeyboardEvent) {
      const tg = eventElement(e), b = maybeById('rdx-chal');
      if (!tg || !b)
          return;
      const open = b.getAttribute('aria-expanded') === 'true';
      if (tg === b) {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              e.stopPropagation();
              rdChalOpen(true, e.key === 'ArrowUp' ? 'last' : 'first');
          }
          else if (e.key === 'Escape' && open) {
              e.preventDefault();
              e.stopPropagation();
              rdChalOpen(false);
          }
          return;
      }
      if (!tg.closest('#rdx-chal-menu'))
          return;
      const it = rdChalItems(), i = tg instanceof HTMLElement ? it.indexOf(tg) : -1;
      let n: HTMLElement | undefined;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight')
          n = it[(i + 1) % it.length];
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft')
          n = it[(i - 1 + it.length) % it.length];
      else if (e.key === 'Home')
          n = it[0];
      else if (e.key === 'End')
          n = it[it.length - 1];
      else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          rdChalOpen(false);
          b.focus();
      }
      else if (e.key === 'Tab')
          rdChalOpen(false);
      if (n) {
          e.preventDefault();
          e.stopPropagation();
          n.focus();
      }
  }
  function rdStart(mode0: string, bars?: number) {
      const L = RD.L;
      if (!L)
          return;
      // Test and Note rush of older versions open Practice, where the star check now gives the stars.
      const mode = isReadDrillMode(mode0) && rdModes(L).includes(mode0) ? mode0 : mode0 === 'test' || mode0 === 'rush' ? 'practice' : null;
      if (!mode)
          return;
      ensureAudio();
      if (L.ty === 'sr') {
          rdSightStart(mode);
          return;
      }
      if (srtIsMarathonBars(bars))
          RD.bars = bars;
      rdClear();
      const now = performance.now();
      Object.assign(RD, { on: true, mode, n: 0, ok: 0, ms: 0, streak: 0, best: 0, miss: {}, lastK: null, rhP: [], rhM: [], answered: false, next: null, flow: null, fix: false, arc: srtIsArcadeMode(mode) ? srtArcadeStart(mode, now, { targetMs: rdTarget(L), marathonBars: RD.bars }) : null, tout: false, arcFx: '', limF: 1, chk: [], chkBest: null, chkNew: 0 });
      stageSync();
      rdCoach(true);
      const e = byId('rdx-end');
      e.hidden = false;
      e.textContent = t(mode === 'practice' ? 'rdx_end' : 'rdx_quit');
      if (RD.arc && RD.arc.deadlineMs !== null)
          RD.rushEnd = RD.arc.deadlineMs;
      if (mode === 'timeAttack' || mode === 'survival')
          RD.rushIv = window.setInterval(() => { if (!RD.on)
              return; rdHud(); if (rdTimeUp() && (!RD.answered || RD.fix))
              rdFinish(); }, 250);
      if (L.ty === 'rh')
          rdRhNew();
      else if (rdFlowOk(L))
          rdFlowStart();
      else
          rdNext();
  }
  function rdClear() {
      RD.timers.forEach(clearTimeout);
      RD.timers = [];
      clearTimeout(RD.hintT);
      clearTimeout(RD.limT);
      clearTimeout(RD.awT);
      const aw = maybeById('rdx-award');
      if (aw)
          aw.hidden = true;
      clearInterval(RD.rushIv);
      RD.rushIv = 0;
      if (RD.flow)
          cancelAnimationFrame(RD.flow.raf);
      RD.flow = null;
      RD.fix = false;
      if (RD.rh) {
          RD.rh.playing = false;
          cancelAnimationFrame(RD.rh.raf);
          if (RD.rh.open)
              RD.rh.open.clear();
          if (RD.rh.two)
              rdRhMarks(false);
      }
      (RD.nodes || []).forEach((n: { stop: (arg0: number) => void; }) => { try {
          n.stop(0);
      }
      catch (_) { } });
      RD.nodes = [];
      rdDockClear();
      rdDockForce(false);
  }
  function rdAbort() { rdClear(); RD.on = false; stageSync(); }
  function rdEndClick() { if (WARM.on && WARM.phase === 'drill') {
      rdnHome(true);
      return;
  }
  if (RD.on && RD.mode === 'practice' && RD.n > 0)
      rdFinish();
  else {
      rdAbort();
      rdIntro();
  } }
  function rdBack() { rdAbort(); byId('rdx-stage').hidden = true; byId('rdx-home').hidden = false; rdRenderHome(); }
  /* ---- full-screen stage: a running drill or piece takes the whole window; Esc (or End) leaves it ---- */
  function srStartStage() {
      // Level exercises keep the expanded player through their result and the next piece.
      // Automatic expansion uses the full window without a native fullscreen request.
      if (SR.lvPiece && shell.scoreFocus.readOverride === null && rdData().prefs.stage)
          scoreFocusEnter('read', byId('rd-fs'), false);
      else
          stageSync();
  }
  function stageWanted() {
      if (view0() === 'read' && !byId('rdp-pieces').hidden && shell.scoreFocus.readOverride !== null)
          return shell.scoreFocus.readOverride && !byId('rdp-pieces').hidden && !!SR.piece;
      if (view0() !== 'read' || !rdData().prefs.stage)
          return false;
      return (RD.on && !byId('rdp-drills').hidden && !byId('rdx-stage').hidden) || (SR.active && !byId('rdp-pieces').hidden);
  }
  function stageSync() {
      if (shell.scoreFocus.owner === 'read' && (view0() !== 'read' || byId('rdp-pieces').hidden)) { scoreFocusExit(true); return; }
      scoreFocusUi();
      syncMobileStartBars();
      const end = byId('rd-stage-end');
      end.hidden = shell.scoreFocus.owner === 'read' && !SR.active;
      if (shell.scoreFocus.owner === 'read')
          end.removeAttribute('aria-keyshortcuts');
      else
          end.setAttribute('aria-keyshortcuts', 'Escape');
      const on = stageWanted();
      if (on === shell.stage.on)
          return;
      shell.stage.on = on;
      shell.stage.kb = null;
      if (on) {
          document.body.dataset.stage = 'immersive';
          if (!byId('rdp-pieces').hidden)
              srMeta();
      }
      else if (document.body.dataset.stage === 'immersive')
          delete document.body.dataset.stage;
      const stageTop = maybeById('rd-stage-top');
      if (stageTop)
          stageTop.hidden = !on || byId('rdp-pieces').hidden;
      if (on)
          window.scrollTo(0, 0);
      dockSync();
      anLayoutVars();
      stageRefit();
  }
  // The staff is sized from the room the stage leaves it, so it is redrawn whenever that changes.
  function stageRefit() {
      if (RD.on && RD.flow)
          rdFlowShow(false);
      srFit();
      rdRhFit();
  }
  function stageResize() { clearTimeout(shell.stage.rz); shell.stage.rz = window.setTimeout(() => { if (shell.stage.on)
      stageRefit(); }, 120); }
  // Esc leaves the stage like End or Stop; focus goes to a control that stays on screen.
  function stageKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && shell.scoreFocus.owner && shell.scoreFocus.owner !== 'analysis') {
          e.preventDefault();
          const tools = maybeById('rd-focus-tools');
          if (shell.scoreFocus.owner === 'read' && tools && !tools.hidden) {
              rdFocusDispSet(false, true);
              return true;
          }
          if (shell.scoreFocus.owner === 'read' && SR.active) {
              srGo();
              shell.scoreFocus.returnTo = byId('rd-go');
          }
          scoreFocusExit();
          return true;
      }
      if (e.key !== 'Escape' || !shell.stage.on)
          return false;
      e.preventDefault();
      if (RD.on) {
          rdEndClick();
          // The warm-up hides the drill's own Back: its header's Back takes the focus instead.
          if (RDN.screen === 'home') return true; // warm-up exit already restored focus
          const back = byId('rdx-back');
          if (!byId('rdx-stage').contains(document.activeElement) || document.activeElement?.closest('[hidden]'))
              back.focus({ preventScroll: true });
      }
      else if (SR.active) {
          srGo();
          byId('rd-go').focus({ preventScroll: true });
      }
      return true;
  }
  function rdFinish() {
      const L = RD.L, mode = RD.mode, now = performance.now();
      rdClear();
      RD.on = false;
      stageSync();
      byId('rdx-end').hidden = true;
      byId('rdx-meter').hidden = true;
      let acc = 0, avg = 0, stars = 0;
      if (!L)
          return;
      // Practice shows the best stars its check gave this run, once it was full.
      const chk = mode === 'practice' && rdHasCheck(L), shown = mode === 'test' || (chk && RD.chkBest !== null);
      const arc = RD.arc && (RD.arc = srtArcadeComplete(RD.arc, now)), sum = arc && srtArcadeSummary(arc, now);
      const npm = sum ? Math.round(sum.notesPerMinute ?? 0) : 0;
      if (L.ty === 'rh') {
          acc = RD.rhP.length ? Math.round(RD.rhP.reduce((a: number, b: number) => a + b, 0) / RD.rhP.length) : 0;
          if (mode === 'test')
              stars = acc >= 90 ? 3 : acc >= 75 ? 2 : acc >= 60 ? 1 : 0;
      }
      else {
          acc = RD.n ? Math.round(100 * RD.ok / RD.n) : 0;
          // Arcade runs time only the right answers: a timeout is not a reading speed.
          avg = sum ? sum.averageReactionMs ?? 0 : RD.n ? RD.ms / RD.n : 0;
          if (chk)
              stars = RD.chkBest ?? 0;
      }
      const d = rdData();
      if (!WARM.on) d.tot.sess++;
      let newBest = false;
      if (!L.custom) {
          const rec = d.lv[L.id] || (d.lv[L.id] = { s: 0, acc: 0, t: 0, n: 0, rush: 0 });
          rec.n++;
          if (mode === 'test') {
              rec.s = Math.max(rec.s || 0, stars);
              rec.acc = Math.max(rec.acc || 0, acc);
              if (avg && acc >= 80 && (!rec.t || avg < rec.t))
                  rec.t = Math.round(avg);
          }
          if (sum) {
              const k = sum.mode === 'survival' ? 'sv' : sum.mode === 'timeAttack' ? 'ta' : 'mn', v = k === 'mn' ? npm : sum.score;
              newBest = v > (rec[k] || 0);
              rec[k] = Math.max(rec[k] || 0, v);
          }
      }
      if (!WARM.on) {
          touchDay();
          markReadDoneToday();
      }
      saveAll();
      // Warm-up drills retain their results. The warm-up is counted when all steps are complete.
      if (rdnWarmDrillDone())
          return;
      const weak = Object.entries(RD.miss).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const pts = sum ? anNum(sum.score, 0) : '', avgS = (avg / 1000).toFixed(1) + 's';
      const tiles = L.ty === 'rh' ? [[acc + '%', t('rdx_st_rh')], [RD.rhP.length, t('rdx_st_ex')]]
          : sum && sum.mode === 'survival' ? [[pts, t('rdx_st_score')], [rdClock(sum.elapsedMs), t('rdx_st_survived')], [sum.correct, t('rdx_st_rush')], [avgS, t('rdx_st_time')]]
              : sum && sum.mode === 'timeAttack' ? [[pts, t('rdx_st_score')], [sum.correct, t('rdx_st_rush')], [acc + '%', t('rdx_st_acc')], [sum.bestCombo, t('rdx_st_streak')]]
                  : sum ? [[rdClock(sum.elapsedMs), t('rdx_st_total')], [acc + '%', t('rdx_st_acc')], [npm, t('rdx_st_npm')], [pts, t('rdx_st_score')]]
                      : [[acc + '%', t('rdx_st_acc')], [avgS, t('rdx_st_time')], [RD.best, t('rdx_st_streak')], [RD.ok + '/' + RD.n, t('rdx_st_ans')]];
      const best = newBest ? ' · 🏆 ' + t('rdx_newbest') : '';
      const head = shown ? `<div class="rdx-sum-stars">${rdStars(stars)}</div><p class="rdx-sum-msg">${t(stars === 3 ? 'rdx_s3' : stars === 2 ? 'rdx_s2' : stars === 1 ? 'rdx_s1' : 'rdx_s0')}</p>`
          : chk ? `<p class="rdx-sum-msg">${t('rdx_chk_wait', RD.chk.length, RD_CHECK_N)}</p>`
              : sum ? `<p class="rdx-sum-msg">${RD_MODE_ICON[mode]} ${sum.mode === 'marathon' ? t('rdx_npm', npm) : t('rdx_arc_score', pts)}${best}</p>` : `<p class="rdx-sum-msg">${t('rdx_sum_practice')}</p>`;
      const nx = rdLvNext(L);
      RD.next = rdNextStep(L, mode, acc, avg, stars, weak);
      rdCoach(false);
      byId('rdx-body').innerHTML = `<div class="rdx-sum" tabindex="-1" id="rdx-sum"${(RD).next ? ' aria-describedby="rdx-next"' : ''}><h2>${t('rdx_sum_title')}</h2>${head}
      <div class="rdx-tiles">${tiles.map((x) => `<div><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div>
      ${weak.length ? `<div class="rdx-weak"><span>${t('rdx_review')}</span>${weak.map(([k, c]) => `<i class="rdx-tag">${rdEsc(rdKeyText(k))}${c > 1 ? ' ×' + c : ''}</i>`).join('')}</div>` : ''}
      ${(RD).next ? `<div class="coach rdx-coach" id="rdx-next" data-kind="next">${coachHTML(t('coach_next'), (RD).next, 'rdx-next-act')}</div>` : ''}
      <div class="row rdx-sum-btns"><button class="btn primary" data-act="again">↺ ${t('rdx_again')}</button>${!L.custom && nx ? `<button class="btn" data-act="next">${t('rdx_next_lv')} →</button>` : ''}<button class="btn ghost" data-act="levels">${t('rdx_levels')}</button></div></div>`;
      byId('rdx-live').textContent = t('rdx_sum_title') + ': ' + acc + '%' + (shown ? ' · ' + t('rdx_stars_n', stars) : '') + (sum ? ' · ' + (sum.mode === 'marathon' ? t('rdx_npm', npm) : t('rdx_arc_score', pts)) : '') + ((RD).next ? '. ' + t('coach_next') + ' ' + coachText((RD).next) : '');
      byId('rdx-hud').textContent = '';
      byId('rdx-meter').hidden = true;
      const s = maybeById('rdx-sum');
      if (s)
          s.focus({ preventScroll: true });
  }
  /* ---- home: progress hero, level ladder, custom drill ---- */
  function rdSuggest() {
      const d = rdData(), last = RD_LV[d.prefs.last ?? ''];
      if (last && ((d.lv[last.id] || {}).s || 0) < 2)
          return last;
      return RD_ALL.find((L) => !((d.lv[L.id] || {}).s)) || last || RD_ALL[0];
  }
  const RD_UNIT_CAT: Record<string, string> = {
      tr: 'notes', ba: 'notes', gr: 'notes', cc: 'notes',
      ac: 'keys', ks: 'keys',
      iv: 'harmony', ch: 'harmony',
      rh: 'rhythm', sr: 'rhythm',
  };
  let rdxFilter = 'all';
  let rdxShowOrch = false;
  function rdRenderHome() {
      const d = rdData(), tot = d.tot, st = RD_ALL.reduce((sum, level) => sum + rdStarCount(d.lv[level.id]?.s), 0), cont = rdSuggest();
      const unit = RD_UNITS.find((u) => u.lv.includes(cont)), rec: Partial<ReadDrillLevelStat> = d.lv[cont.id] || {}, sample = rdLvSample(cont);
      const best = [rec.acc ? t('rdx_best_acc', rec.acc) : '', rec.t ? t('rdx_best_t', (rec.t / 1000).toFixed(1)) : ''].filter(Boolean).map((s) => `<span>${rdEsc(s)}</span>`).join('');
      const opt = (id: string, on: boolean, key: string, off = false) => `<label class="switch-inline"><input type="checkbox" id="${id}"${on ? ' checked' : ''}${off ? ' disabled' : ''}> <span>${t(key)}</span></label>`;
      // Stats, then the level to play next (a picture of it, its name, details and stars, and the button), then the options.
      byId('rdx-hero').innerHTML = `<div class="rdx-hero-l"><div><div class="rdx-big">★ ${st}<small> / ${RD_ALL.length * 3}</small></div><div class="rdx-hero-s">${t('rdx_hero_stars')}</div></div>
      <div class="rdx-hero-m"><div><b>${tot.n}</b><span>${t('rdx_st_ans')}</span></div><div><b>${tot.n ? Math.round(100 * tot.ok / tot.n) + '%' : '—'}</b><span>${t('rdx_st_acc')}</span></div><div><b>${tot.n ? (tot.ms / tot.n / 1000).toFixed(1) + 's' : '—'}</b><span>${t('rdx_st_time')}</span></div></div></div>
      <div class="rdx-next"><div class="rdx-next-pic" aria-hidden="true">${sample || `<span class="rdx-next-ic">${unit ? unit.icon : '🎯'}</span>`}</div>
        <div class="rdx-next-txt"><span class="rdx-next-eye">${t(d.prefs.last ? 'rdx_hero_next' : 'rdx_hero_first')}</span><b class="rdx-next-name" id="rdx-next-name">${rdEsc(rdLvName(cont))}</b><span class="rdx-next-d" id="rdx-next-d">${rdEsc(rdLvDetail(cont))}</span></div>
        <div class="rdx-next-go"><div class="rdx-rec">${rdStars(rec.s || 0)}${best}</div>
        <button class="btn primary" data-lv="${cont.id}" id="rdx-cont" aria-describedby="rdx-next-name rdx-next-d">▶ ${t(d.prefs.last ? 'rdx_continue' : 'rdx_begin')}</button></div></div>
      <div class="rdx-hero-r" role="group" aria-label="${rdEsc(t('rdx_hero_opts'))}">${opt('rdx-snd', !!d.prefs.sound, 'rdx_sound')}${opt('rdx-hints', !!d.prefs.hints, 'rdx_hints')}${opt('rdx-flow', !!d.prefs.flow, 'rdx_flow')}${opt('rdx-ghost', !!d.prefs.ghost, 'rdx_ghost', !d.prefs.flow)}${opt('rdx-stage-pref', !!d.prefs.stage, 'rdx_stage')}${opt('rdx-weak-inject', !!host.store.data().settings.weakSpotInjection, 'rdx_weak_inject')}</div>`;
      const filters = maybeById('rdx-filters');
      if (filters) {
          queryAllHtml(filters, '[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === rdxFilter)));
      }
      const orchInput = maybeById('rdx-show-orch');
      if (orchInput instanceof HTMLInputElement)
          orchInput.checked = rdxShowOrch;
      const landBtn = maybeById('rdx-land-btn');
      if (landBtn)
          landBtn.hidden = rdStarCount(d.lv['tr1']?.s) >= 2 && st >= 6;
      const visibleUnits = RD_UNITS.filter((u) => (u.u !== 'cc' || rdxShowOrch) && (rdxFilter === 'all' || RD_UNIT_CAT[u.u] === rdxFilter));
      byId('rdx-ladder').innerHTML = visibleUnits.map((u) => {
          const done = u.lv.filter((L: ReadDrillLevel) => rdStarCount(d.lv[L.id]?.s) > 0).length;
          return `<section class="rdx-unit"${u.lv.length >= 6 ? ' data-many="1"' : ''}><h3><span class="ic" aria-hidden="true">${u.icon}</span><span>${t('rdx_u_' + u.u)}</span><small>${done}/${u.lv.length}</small></h3><p>${t('rdx_ud_' + u.u)}</p><div class="rdx-lvs">${u.lv.map((L: ReadDrillLevel) => {
              const s = rdStarCount(d.lv[L.id]?.s);
              return `<button class="rdx-lv${s ? ' s' + s : ''}" data-lv="${L.id}" title="${rdEsc(rdLvDetail(L))}" aria-label="${rdEsc(rdLvName(L) + ': ' + rdLvDetail(L) + (s ? ' — ' + t('rdx_stars_n', s) : ''))}"><span class="n">${L.n}</span><span class="d"><b>${t('rdx_ty_' + L.ty)}</b><i>${rdEsc(rdLvSub(L))}</i></span><span class="st" aria-hidden="true">${'★'.repeat(s)}<i>${'☆'.repeat(3 - s)}</i></span></button>`;
          }).join('')}</div></section>`;
      }).join('');
      rdCustomFill();
  }
  const RD_CDEF: Record<string, [string, string]> = { treble: ['C4', 'G5'], bass: ['F2', 'C4'], grand: ['C3', 'C5'], alto: ['D3', 'B4'], tenor: ['A2', 'G4'] };
  function rdCustomFill() {
      const lo = selectById('rdx-c-lo'), hi = selectById('rdx-c-hi');
      if (!lo)
          return;
      const c = rdData().prefs.custom || { ty: 'name', clef: 'treble', lo: 'C4', hi: 'G5', acc: 0, keys: 0, land: false };
      let opts = '';
      for (let s = 7; s <= 52; s++) {
          const n = rdFromStep(s);
          opts += `<option value="${SR_LET[n.li] + n.oct}">${rdName(n, true)}</option>`;
      }
      lo.innerHTML = opts;
      hi.innerHTML = opts;
      lo.value = c.lo;
      hi.value = c.hi;
      selectById('rdx-c-ty').value = c.ty;
      selectById('rdx-c-clef').value = c.clef;
      selectById('rdx-c-acc').value = String(c.acc);
      selectById('rdx-c-keys').value = String(c.keys);
      inputById('rdx-c-land').checked = !!c.land;
  }
  function rdCustomRead() {
      let lo = selectById('rdx-c-lo').value, hi = selectById('rdx-c-hi').value;
      if (rdStep(rdP(lo)) > rdStep(rdP(hi))) {
          const x = lo;
          lo = hi;
          hi = x;
      }
      const c = { ty: selectById('rdx-c-ty').value, clef: selectById('rdx-c-clef').value, lo, hi, acc: +selectById('rdx-c-acc').value, keys: +selectById('rdx-c-keys').value, land: inputById('rdx-c-land').checked };
      rdData().prefs.custom = c;
      return c;
  }
  function rdCustomGo() {
      const c = rdCustomRead();
      saveAll();
      rdOpen(rdCustomLevel(c));
  }
  /** The level a custom drill configuration describes (the form's, or the warm-up's). `keyN` fixes the key signature. */
  function rdCustomLevel(c: ReadDrillCustom, keyN?: number): ReadDrillLevel {
      const ty = c.ty, clef = c.clef;
      if (!isReadDrillType(ty) || !isReadClef(clef))
          throw new TypeError('Étude: unknown custom drill ' + ty + ' / ' + clef);
      const L: ReadDrillLevel = { custom: true, id: 'custom', u: 'custom', n: 0, ty, clef, lo: c.lo, hi: c.hi, acc: c.keys ? 0 : c.acc, keys: c.keys || 0 };
      if (c.land) {
          const a = rdStep(rdP(c.lo)), b = rdStep(rdP(c.hi)), set = RD_LM.filter((s) => s >= a && s <= b).map((s) => { const n = rdFromStep(s); return SR_LET[n.li] + n.oct; });
          if (set.length >= 2)
              L.set = set;
      }
      if (keyN !== undefined)
          L.keyN = keyN;
      return L;
  }
  /* ---- statistics, shown in Progress under Reading: per-note heatmap on the staff, skills, weakest items ---- */
  function rdAgg(c: string, li: number, oct: number) {
      let n = 0, ok = 0, ms = 0;
      const re = /^([tban]):([A-G])([#b]?)(\d)$/;
      for (const [k, s] of Object.entries((rdData().nt))) {
          const m = re.exec(k);
          if (m && m[1] === c && SR_LET.indexOf(m[2]) === li && +m[4] === oct) {
              const stats = s;
              n += stats.n;
              ok += stats.ok;
              ms += stats.ms;
          }
      }
      return { n, ok, ms };
  }
  function rdHeat(clef: 'treble' | 'bass' | 'alto' | 'tenor', lo: string, hi: string) {
      const c = RD_CLEFC[clef], cols: (ReturnType<typeof rdFromStep> & { hc: string | null; tip: string; })[][] = [], lbl: (string | number)[] = [], cls: string[] = [];
      for (let s = rdStep(rdP(lo)); s <= rdStep(rdP(hi)); s++) {
          const n = rdFromStep(s), a = rdAgg(c, n.li, n.oct), acc = a.n ? Math.round(100 * a.ok / a.n) : null;
          cols.push([Object.assign(n, { hc: acc == null ? null : `hsl(${Math.round(acc * 1.2)},58%,44%)`, tip: rdName(n, true) + (a.n ? `: ${acc}% · ${(a.ms / a.n / 1000).toFixed(1)} s · ${a.n}×` : ': —') })]);
          lbl.push(acc == null ? '·' : acc);
          cls.push(acc == null ? 'none' : acc >= 90 ? 'hi' : acc >= 70 ? 'mid' : 'lo');
      }
      return rdSvg({ clef, cols, colW: 24, dur: 1, scale: 1.2, lbl, lblCls: cls, aria: t('rdx_heat_aria', t('rdx_clef_' + clef)) }).svg;
  }
  function rdBars(rows: readonly { l: string; n: number; ok: number; }[]) { return rows.map((r) => `<div class="rdx-bar"><span>${rdEsc(r.l)}</span><div class="rdx-bar-t"><i style="width:${r.n ? Math.round(100 * r.ok / r.n) : 0}%"></i></div><em>${r.n ? Math.round(100 * r.ok / r.n) + '% · ' + rdEsc(r.n) + '×' : '—'}</em></div>`).join(''); }
  function rdRenderStats() {
      const box = maybeById('rdx-stats');
      if (!box)
          return;
      const book = rdnBook(), tally = srtBookTally(book, book.level);
      const d = rdData(), tot = d.tot, nt = d.nt, g = (k: string) => nt[k] || { n: 0, ok: 0 };
      const lvDone = RD_ALL.filter(L => rdStarCount(d.lv[L.id]?.s) > 0).length, st = RD_ALL.reduce((sum, level) => sum + rdStarCount(d.lv[level.id]?.s), 0);
      const weak = Object.entries(nt).filter(([k, s]) => s.n >= 3 && !/^rh:/.test(k)).sort((a, b) => (b[1].e - a[1].e) || (b[1].t - a[1].t)).slice(0, 10);
      const ks: { l: string; n: number; ok: number; }[] = [];
      for (let k = -7; k <= 7; k++)
          if (g('ks:' + k).n)
              ks.push({ l: rdKeyLabel(k), ...g('ks:' + k) });
      const rh = (RD_UNITS.find((u) => u.u === 'rh')?.lv ?? []).filter((L: ReadDrillLevel) => g('rh:' + L.id).n).map((L: ReadDrillLevel) => ({ l: rdLvName(L), ...g('rh:' + L.id) }));
      const extra = (['alto', 'tenor'] as const).filter((c) => Object.keys(nt).some((k) => k[0] === RD_CLEFC[c]));
      box.innerHTML = `<div class="panel rdx-stat-p" id="rdx-book-progress"><h3>${rdEsc(t('rdn_book_head', book.level))}</h3>
        <p class="rdx-desc">${rdEsc(t('rdn_done_of', tally.done, SRT_BOOK_PIECES))}</p>
        <div class="stat-row">${statHTML(srtPiecesRead(book), t('rdn_stat_read'))}</div></div>
      <div class="rdx-tiles rdx-tiles-lg">${[[tot.n, t('rdx_st_ans')], [tot.n ? Math.round(100 * tot.ok / tot.n) + '%' : '—', t('rdx_st_acc')], [tot.n ? (tot.ms / tot.n / 1000).toFixed(1) + 's' : '—', t('rdx_st_time')], [tot.sess, t('rdx_st_sess')], ['★ ' + st, t('rdx_hero_stars')], [lvDone + '/' + RD_ALL.length, t('rdx_st_lv')]].map((x) => `<div><b>${rdEsc(x[0])}</b><span>${rdEsc(x[1])}</span></div>`).join('')}</div>
      <div class="panel rdx-stat-p"><h3>${t('rdx_heat')}</h3><p class="rdx-desc">${t('rdx_heat_d')}</p>
        <div class="rdx-staff rdx-heat">${rdHeat('treble', 'A3', 'C6')}</div><div class="rdx-staff rdx-heat">${rdHeat('bass', 'C2', 'E4')}</div>
        ${extra.map((c) => `<div class="rdx-staff rdx-heat">${rdHeat(c, c === 'alto' ? 'C3' : 'A2', c === 'alto' ? 'D5' : 'B4')}</div>`).join('')}</div>
      <div class="rdx-stat-grid"><div class="panel rdx-stat-p"><h3>${t('rdx_u_iv')}</h3>${rdBars(RD_ALLIV.map((v) => ({ l: rdIvName(v), ...g('iv:' + v) })))}</div>
        <div class="panel rdx-stat-p"><h3>${t('rdx_u_ch')}</h3>${rdBars(['maj', 'min', 'dim', 'aug'].map((q) => ({ l: t('rdx_q_' + q), ...g('ch:' + q) })))}</div>
        <div class="panel rdx-stat-p"><h3>${t('rdx_u_ks')}</h3>${ks.length ? rdBars(ks) : `<p class="rdx-desc">${t('rdx_nodata')}</p>`}</div>
        <div class="panel rdx-stat-p"><h3>${t('rdx_u_rh')}</h3>${rh.length ? rdBars(rh) : `<p class="rdx-desc">${t('rdx_nodata')}</p>`}</div></div>
      <div class="panel rdx-stat-p"><h3>${t('rdx_weakest')}</h3>${weak.length ? `<div class="rdx-weak">${weak.map(([k, s]) => `<i class="rdx-tag">${rdEsc(rdKeyText(k))} · ${Math.round(100 * s.ok / s.n)}% · ${((s.t || 0) / 1000).toFixed(1)}s</i>`).join('')}</div>` : `<p class="rdx-desc">${t('rdx_nodata')}</p>`}
        <div class="row" style="margin-top:14px"><button class="btn ghost sm" id="rdx-reset">${t('rdx_reset')}</button></div></div>`;
  }
  /* ---- tabs, wiring, locale ---- */
  // `screen` picks between the old sight-reading screen (melody) and the player of a level piece; both use the pieces panel.
  function rdTab(tab: string|undefined, screen: 'melody' | 'player' = 'melody') {
      if (tab === 'book') {
          rdnHome(false);
          return;
      }
      // A saved tab that no longer exists (the old Statistics tab, now in Progress) opens the drills.
      if (tab === undefined || !['drills', 'pieces'].includes(tab))
          tab = 'drills';
      const leavesPlayer = !!SR.lvPiece && (tab !== 'pieces' || screen !== 'player');
      if ((tab !== 'pieces' || leavesPlayer) && srtPendingSaveProtected()) {
          if (SR.srtState?.name === 'pendingSave') {
              void srtAbandonClaim('abandoned', false).then((result) => {
                  if (result.ok || SR.srtState?.name !== 'pendingSave')
                      rdTab(tab, screen);
              });
          }
          return;
      }
      rdnShowScreen(tab === 'pieces' ? screen : 'drills');
      rdData().prefs.tab = tab;
      ['drills', 'pieces'].forEach((x) => { const p = maybeById('rdp-' + x); if (p)
          p.hidden = x !== tab; });
      if (tab !== 'drills' && RD.on) {
          rdAbort();
          rdIntro();
      }
      if (tab !== 'pieces')
          srStopAll(true, false, 'navigate');
      if (tab === 'drills' && byId('rdx-stage').hidden)
          rdRenderHome();
      stageSync();
      syncMobileStartBars();
  }
  // Draws the Read tab's current screen. The home is the first screen each time the tab opens (see renderRead).
  function rdRender() {
      if (RDN.screen === 'warmup' && WARM.on) {
          rdnWarmLocale();
          return;
      }
      if (RDN.screen === 'home' || RDN.screen === 'warmup') {
          rdnHome();
          return;
      }
      if (RDN.screen === 'player' && SR.lvPiece) {
          rdTab('pieces', 'player');
          rdnPlayerHead();
          return;
      }
      rdTab(RDN.screen === 'melody' || RDN.screen === 'player' ? 'pieces' : 'drills');
  }
  function rdKey(e: KeyboardEvent, k: string) {
      if (view0() !== 'read' || byId('rdp-drills').hidden || !RD.on)
          return false;
      const L = RD.L;
      if (!L)
          return false;
      if (L.ty === 'rh') {
          const R = RD.rh;
          if (e.key === ' ' || e.key === 'Enter') {
              if (document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-act],#rdx-rhgo,#rdx-rhlisten,#rdx-end,#rdx-back,#rdx-rhopts') && !(R && R.playing))
                  return false;
              e.preventDefault();
              rdRhPress('k:' + k, 'R');
              return true;
          }
          if (R && R.two && R.playing && (k === 'f' || k === 'j')) {
              e.preventDefault();
              rdRhPress('k:' + k, k === 'f' ? 'L' : 'R');
              return true;
          }
          return false;
      }
      if (RD.answered && !RD.fix)
          return false;
      if (/^[1-9]$/.test(k)) {
          const b = (document).querySelector('#rdx-ans .rdx-a[data-k="' + k + '"]');
          if (b instanceof HTMLButtonElement && !b.disabled) {
              e.preventDefault();
              b.click();
              return true;
          }
      }
      if (k === '-' || k === '0' || k === '=') {
          const accOf: Record<string, number> = { '-': -1, '0': 0, '=': 1 };
          const b = queryHtml(document, '#rdx-accs [data-acc="' + accOf[k] + '"]');
          if (b) {
              e.preventDefault();
              b.click();
              return true;
          }
      }
      return false;
  }
  function rdOnLocale() {
      if (!byId('view-read'))
          return;
      if (SR.active) {
          const g = byId('rd-go');
          if (g)
              g.textContent = t('rd_stop');
      }
      if (SR.listening) {
          const l = byId('rd-listen');
          if (l)
              l.textContent = t('rd_stop');
      }
      if (SR.gen && SR.lvPiece) {
          SR.gen.t = { en: rdnHeadText().title };
          rdnPlayerHead();
          rdnChecklist();
          // The status line before an attempt follows the language.
          const v = byId('rd-verdict');
          if (RDN.ready && v.textContent === RDN.ready)
              v.textContent = RDN.ready = rdnReadyText();
          if (!byId('rdn-result').hidden)
              rdnResultShow(false);
          srMeta();
      }
      else if (SR.gen) {
          SR.gen.t = { en: tl('en', 'rdx_sr_title', SR.gen.level), ro: tl('ro', 'rdx_sr_title', SR.gen.level) };
          srMeta();
      }
      rdWarmButtonsSync();
      if (!byId('rdx-stage').hidden && RD.L) {
          byId('rdx-title').textContent = rdLvName(RD.L);
          byId('rdx-sub').textContent = rdLvDetail(RD.L);
          if (!RD.on && !byId('rdx-body').querySelector('.rdx-sum'))
              rdIntro();
          else if (RD.on && RD.flow) {
              rdFlowBody();
              rdFlowShow(false);
          }
          else if (RD.on && RD.q && RD.q.ty === 'name')
              queryAllHtml(byId('rdx-ans'), '.rdx-a').forEach((b) => { if (b.firstChild)
                  b.firstChild.textContent = rdLetter(Number(b.dataset.a)); });
          if (RD.on) {
              byId('rdx-end').textContent = t(RD.mode === 'practice' ? 'rdx_end' : 'rdx_quit');
              rdHud();
          }
      }
      if (view0() === 'read')
          rdRender();
      else
          rdCustomFill();
  }
  /* ============================================================================
     READ HOME — the Read tab's home (Today, the book, Warm-up, Progress) and the player of level pieces
     (docs/plans/2026-11-13-read-redesign-spec.md, sections 3, 7, 8 and 12). The music comes from the pure modules in
     src/sight-reading; this part keeps the screens, the saved book state and the player around the shared engine.
     ============================================================================ */
  const rdnNormalized = new WeakSet<object>();
  /** The saved book state, read through srtNormalizeBookState once per stored object. */
  function rdnBook(): ReadingBookState {
      const r = rdData(), known = r.book;
      if (known && typeof known === 'object' && rdnNormalized.has(known))
          return known;
      const state = srtNormalizeBookState(known);
      r.book = state;
      rdnNormalized.add(state);
      return state;
  }
  function rdnSetBook(state: ReadingBookState) {
      rdData().book = state;
      rdnNormalized.add(state);
      saveAll();
  }
  /** Today as a local YYYY-MM-DD date. */
  function rdnToday() {
      const d = new Date(), p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  /** The fingerprints of every piece the reader has seen (the first-sight ledger): a new daily set avoids them. */
  function rdnSeen(): ReadonlySet<string> {
      try {
          return new Set(Object.keys(srtReadLedger(localStorage).exposures));
      }
      catch {
          return new Set();
      }
  }
  function rdnLevelName(level: number) { return t('rdn_lv' + level + '_name'); }
  function rdnKeyName(key: ReadingKey) { return t(key.mode === 'minor' ? 'key_minor' : 'key_major', rdSpell(key.tonic)); }
  function rdnKeyShort(key: ReadingKey) { return rdSpell(key.tonic) + (key.mode === 'minor' ? 'm' : ''); }
  function rdnSig(keyN: number) { return keyN === 0 ? t('rdn_sig_none') : t(keyN > 0 ? 'rdn_sig_sharps' : 'rdn_sig_flats', Math.abs(keyN)); }
  function rdnSigWords(keyN: number) {
      const n = Math.abs(keyN);
      if (n === 0)
          return t('rdn_sig_aria_none');
      return keyN > 0 ? (n === 1 ? t('rdn_sig_aria_sharp1') : t('rdn_sig_aria_sharps', n)) : (n === 1 ? t('rdn_sig_aria_flat1') : t('rdn_sig_aria_flats', n));
  }
  function rdnPattern(id: ReadingPatternId) { return t('rdn_pat_' + id); }
  function rdnCap(s: string) { return s ? s.charAt(0).toLocaleUpperCase(host.i18n.lang()) + s.slice(1) : s; }
  function rdnStars(n: number): 0 | 1 | 2 | 3 { return n >= 3 ? 3 : n >= 2 ? 2 : n >= 1 ? 1 : 0; }
  function rdnStarText(n: number) { return '★'.repeat(n) + '☆'.repeat(3 - n); }
  /* ---- screens ---- */
  function rdnShowScreen(screen: RdnScreen) {
      if (screen !== 'player') {
          rdnAutoCancel();
          if (SR.lvPiece)
              rdnDropLevelPiece();
      }
      if (screen !== 'warmup' && WARM.on)
          rdnWarmStop();
      if (RDN.screen === 'home' && screen !== 'home')
          RDN.opener = rdnFocusKey(document.activeElement);
      RDN.screen = screen;
      const view = maybeById('view-read');
      if (view)
          view.dataset.rdn = screen;
      const home = screen === 'home', player = screen === 'player', warm = screen === 'warmup';
      byId('rdn-home').hidden = !home;
      byId('rd-tabs').hidden = player || warm;
      byId('rdn-player-head').hidden = !player;
      byId('rdn-warm').hidden = !warm;
      byId('rd-gen').hidden = player;
      // The new screens have their own lede; the older drills and melody screens keep theirs.
      byId('rd-lede').hidden = home || player || warm;
      byId('rdn-lede').hidden = !(home || player || warm);
      if (warm) {
          byId('rdp-drills').hidden = true;
          byId('rdp-pieces').hidden = true;
      }
      if (home) {
          byId('rdp-drills').hidden = true;
          byId('rdp-pieces').hidden = true;
      }
      rdnSyncTabs(screen);
  }
  /** Keeps all three Read top-level tabs synced with the active screen. */
  function rdnSyncTabs(screen: RdnScreen) {
      const list = byId('rd-tabs');
      const activeTab = screen === 'home' ? 'book' : screen === 'melody' ? 'pieces' : screen === 'drills' ? 'drills' : '';
      queryAllHtml(list, '[data-tab]').forEach((b) => {
          const on = b.dataset.tab === activeTab;
          b.setAttribute('aria-selected', on ? 'true' : 'false');
          b.tabIndex = on ? 0 : -1;
      });
  }
  /** A selector that finds a control again after the home is drawn anew: its data-rdn-focus key, or its id. */
  function rdnFocusKey(el: Element | null) {
      if (!(el instanceof HTMLElement) || el === document.body)
          return '';
      if (el.dataset.rdnFocus)
          return `[data-rdn-focus="${el.dataset.rdnFocus}"]`;
      return el.id ? '#' + el.id : '';
  }
  /** Back on the home: focus the control that left it if it is still there, otherwise the home's first heading. */
  function rdnFocusHome() {
      const again = RDN.opener ? document.querySelector(RDN.opener) : null;
      RDN.opener = '';
      const target = again instanceof HTMLElement && again.getClientRects().length ? again : maybeById('rdn-today-h');
      if (target)
          target.focus({ preventScroll: true });
  }
  /** Runs `then` once no first-sight result is waiting to be saved. A result that could not be saved is given up first. */
  function rdnWhenSaved(then: () => void) {
      if (!srtPendingSaveProtected()) {
          RDN.retries = 0;
          return true;
      }
      if (SR.srtState?.name === 'pendingSave') {
          void srtAbandonClaim('abandoned', false).then((result) => {
              if (result.ok || SR.srtState?.name !== 'pendingSave')
                  then();
          });
      }
      else if (RDN.retries < 40) {
          RDN.retries++;
          window.setTimeout(then, 50);
      }
      return false;
  }
  function rdnHome(focus = false) {
      if (!rdnWhenSaved(() => rdnHome(focus)))
          return;
      if (RD.on) {
          rdAbort();
          rdIntro();
      }
      srStopAll(true, false, 'navigate');
      rdnShowScreen('home');
      rdnRenderHome();
      stageSync();
      if (focus === true)
          rdnFocusHome();
  }
  // Leaving Read: the home comes back next time, except over an older melody that is still loaded, whose screen comes back
  // as it was (an interrupted first sight then shows its practice score there).
  function rdnLeaveView() {
      RDN.fresh = !(RDN.screen === 'melody' && !!SR.srtPiece && !!SR.gen);
      rdnAutoCancel();
      if (WARM.on)
          rdnWarmStop();
  }
  /* ---- the home ---- */
  /** srtEnsureDaily, settable by tests through window.__etude. */
  let rdnEnsureDailyOf = srtEnsureDaily;
  /** Today's set for the state. A set that cannot be made (no new piece left) keeps the previous one and sets RDN.noDaily. */
  function rdnEnsureDaily(state: ReadingBookState, today: string) {
      try {
          const ensured = rdnEnsureDailyOf(state, today, rdnSeen());
          RDN.noDaily = false;
          return ensured;
      }
      catch {
          RDN.noDaily = true;
          return state;
      }
  }
  function rdnChoose(level: number, key: string | null) {
      rdnSetBook(rdnEnsureDaily(srtChooseLevel(rdnBook(), level, key), rdnToday()));
      rdnRenderHome();
  }
  function rdnRenderHome(createDaily = true) {
      const box = maybeById('rdn-home');
      if (!box)
          return;
      const today = rdnToday();
      let state = rdnBook();
      const ensured = createDaily ? rdnEnsureDaily(state, today) : state;
      if (ensured !== state) {
          state = ensured;
          rdnSetBook(state);
      }
      const active = document.activeElement, focusKey = active instanceof HTMLElement && box.contains(active) ? active.dataset.rdnFocus ?? '' : '';
      const more = box.querySelector('#rdn-more-keys');
      const moreOpen = more instanceof HTMLDetailsElement && more.open;
      // Single unified Today hero + companion routine, then the book, then the other ways to practice.
      box.innerHTML = rdnHeroHtml(state, today) +
          `<hr class="rule"><h2 class="eyebrow-sec" id="rdn-book-sec">${rdEsc(t('rdn_book_eyebrow'))}</h2>${rdnBookHtml(state, moreOpen)}` +
          `<hr class="rule"><h2 class="eyebrow-sec" id="rdn-tools-h">${rdEsc(t('today_tools'))}</h2>${rdnToolsHtml()}`;
      rdnStreakUi(state, today);
      if (focusKey) {
          const again = box.querySelector(`[data-rdn-focus="${focusKey}"]`);
          if (again instanceof HTMLElement)
              again.focus({ preventScroll: true });
      }
  }
  /** Today's set in one line: how many pieces, their level and their keys. */
  function rdnSetLine(state: ReadingBookState) {
      const daily = RDN.noDaily ? null : state.daily;
      const setKey = daily ? daily.focusKey : state.focusKey, setLevel = daily ? daily.level : state.level;
      const keys = setKey ? t('rdn_today_key', rdnKeyName(srtReadingKey(setKey))) : t('rdn_today_mixed');
      return t('rdn_today_sub') + ' · ' + t('rdn_today_level', setLevel) + '. ' + keys;
  }
  /** The first long piece of today that was not played yet, in the chosen key (or one of the level's keys, by the day). */
  function rdnLongCtx(state: ReadingBookState, today: string): RdnCtx {
      let index = 0;
      while (index < 99 && state.pieces[srtLongId(today, index)])
          index++;
      const pool = srtKeyPool(state.level);
      const pick = [...(today + '|' + index)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % pool.length;
      return { kind: 'long', date: today, level: state.level, key: state.focusKey ?? pool[pick].id, index };
  }
  /** Unified Today card: Today's 5-piece set on the left, the two complementary routine steps (Warm-up & Long piece) on the right. */
  function rdnHeroHtml(state: ReadingBookState, today: string) {
      // The card describes the set (its level and keys), which stays for the day once a piece of it was played.
      const daily = RDN.noDaily ? null : state.daily, e = rdEsc, lv = state.level, avg = srtLevelAverage(state, lv);
      const slots = daily ? daily.slots : [], done = daily ? daily.done : [];
      const played = done.filter((x) => x !== null).length, total = slots.length;
      const stays = !daily ? '' : daily.level !== state.level ? t('rdn_today_stays', daily.level) : daily.focusKey !== state.focusKey ? t('rdn_today_stays_key') : '';
      const counts = `<div class="counts rdn-stats"><div class="count due"><b class="num">${lv}</b><span>${e(t('rdn_c_level'))}</span></div>` +
          `<div class="count new"><b class="num">${avg === null ? '—' : avg + '%'}</b><span>${e(t('rdn_stat_first'))}</span></div>` +
          `<div class="count mastered"><b class="num">${srtPiecesRead(state)}</b><span>${e(t('rdn_stat_read'))}</span></div></div>`;
      const chips = slots.map((slot, i) => {
          const score = done[i], role = t('rdn_role_' + slot.role);
          const label = t('rdn_slot_aria', i + 1, role) + ', ' + (score === null ? t('rdn_not_played') : t('rdn_score_n', score));
          return `<button type="button" class="rdn-slot${score === null ? '' : ' done'}" data-rdn-slot="${i}" data-rdn-focus="slot${i}" aria-label="${e(label)}">` +
              `<b>${i + 1}</b><small>${e(score === null ? role : score + '%')}</small></button>`;
      }).join('');
      const go = played === 0 ? 'rdn_today_start' : played >= total ? 'rdn_today_done' : 'rdn_today_continue';
      const suggest = srtLevelReady(state, lv)
          ? `<div class="rdn-suggest" id="rdn-suggest"><span>${e(t('rdn_suggest', lv + 1))}</span><span class="rdn-sp"></span>` +
              `<button type="button" class="btn" id="rdn-suggest-go" data-rdn-focus="suggest">${e(t('rdn_suggest_go', lv + 1))}</button></div>`
          : '';
      const items = rdnPlanItems(state, today), nextIdx = items.findIndex((it) => !it.done && !it.off);
      const sideItems = [items[0], items[2]];
      const rows = sideItems.map((it) => {
          const idx = items.indexOf(it), warm = it.id === 'rdn-warm-go';
          return `<li><button type="button" class="plan-item${warm ? ' rdn-warm' : ''}" id="${it.id}" data-rdn-focus="${it.focus}" data-done="${it.done}"` +
              `${idx === nextIdx ? ' data-next="true"' : ''}${it.off ? ' disabled' : ''}>` +
              `<span class="ck" aria-hidden="true">${it.done ? '✓' : idx === 0 ? 1 : 2}</span>` +
              `<span class="pt"><span${warm ? ' id="rdn-warm-h"' : ''}>${e(it.t)}</span>${it.done ? `<span class="visually-hidden"${warm ? ' id="rdn-warm-done"' : ''}> — ${e(t(warm ? 'rdn_warm_done' : 'done_today'))}</span>` : ''}</span>` +
              `<span class="pd"${it.dId ? ` id="${it.dId}"` : ''}>${e(it.d)}</span>` +
              `<span class="plan-end" aria-hidden="true"><span class="plan-go">→</span></span>` + '</button></li>';
      }).join('');
      const segs = items.map((it, idx) => `<i data-state="${it.done ? 'done' : it.partial ? 'partial' : idx === nextIdx ? 'next' : 'todo'}"></i>`).join('');
      return `<section class="hero rdn-hero rdn-today" aria-labelledby="rdn-today-h"><div class="rdn-today-grid"><div class="rdn-today-main"><div class="hero-top">` +
          `<h2 id="rdn-today-h" tabindex="-1">${e(t('rdn_today_title'))}</h2>${counts}` +
          (daily ? `<p class="nextup rdn-sub">${e(rdnSetLine(state))}</p>` : `<p class="nextup rdn-sub" id="rdn-no-set">${e(t('rdn_no_set'))}</p>`) +
          (stays ? `<p class="rdn-sub rdn-stays" id="rdn-today-stays">${e(stays)}</p>` : '') +
          (daily ? `<div class="rdn-slots" role="group" aria-label="${e(t('rdn_today_title'))}">${chips}</div>` : '') +
          `<div class="hero-actions"><button type="button" class="btn primary lg" id="rdn-today-go" data-rdn-focus="today-go"${!daily || played >= total ? ' disabled' : ''}>${e(t(daily ? go : 'rdn_today_start'))}</button></div></div>` +
          `<div class="hero-why"><span class="why">✦ ${e(t('rdn_why'))}</span>${suggest}</div></div>` +
          `<div class="rdn-today-side" id="rdn-plan" aria-labelledby="rdn-plan-h"><div class="plan-head"><div><h3 id="rdn-plan-h" tabindex="-1">${e(t('rdn_plan_title'))}</h3>` +
          `<div class="plan-meta"><span class="sub" id="rdn-plan-sub">${e(t('plan_sub', items.filter((it) => it.done).length, items.length))}</span>` +
          `<div class="plan-segs" id="rdn-plan-segs" aria-hidden="true">${segs}</div></div></div></div><ul class="plan-list rdn-side-list">${rows}</ul></div></div></section>`;
  }
  function rdnPlanItems(state: ReadingBookState, today: string): RdnPlanItem[] {
      const lv = state.level, daily = RDN.noDaily ? null : state.daily;
      const total = daily ? daily.slots.length : 0, played = daily ? daily.done.filter((x) => x !== null).length : 0;
      const long = !!state.pieces[srtLongId(today, 0)];
      return [
          { id: 'rdn-warm-go', focus: 'warm-go', done: rdData().prefs.warmDone === today, t: t('rdn_warm_title'), d: t(lv >= 6 ? 'rdn_warm_text_ch' : 'rdn_warm_text', lv), dId: 'rdn-warm-text' },
          { id: 'rdn-plan-set', focus: 'plan-set', done: total > 0 && played >= total, partial: played > 0 && played < total, prog: total ? played / total : 0,
              pill: total ? played + '/' + total : undefined, t: t('rdn_today_title'), d: daily ? rdnSetLine(state) : t('rdn_no_set'), off: !daily },
          { id: 'rdn-plan-long', focus: 'plan-long', done: long, t: t('rdn_long'), d: t(long ? 'rdn_long_again' : 'rdn_long_d') },
      ];
  }
  /** Other ways to practice, as on Today: the scored exercise, the pieces, the voice. */
  function rdnToolsHtml() {
      const e = rdEsc, tool = (attrs: string, title: string, text: string) => `<li><button type="button" class="tool" ${attrs}><span class="tool-t">${e(title)}</span>` +
          `<span class="tool-d">${e(text)}</span><span class="tool-go" aria-hidden="true">→</span></button></li>`;
      return `<ul class="tools" aria-labelledby="rdn-tools-h">` +
          tool('id="rdn-scored" data-rdn-focus="scored"', t('rdn_scored'), t('rdn_scored_d')) +
          tool('data-rdn-view="analysis" data-rdn-focus="tool-pieces"', t('an_title'), t('tool_analysis_d')) +
          tool('data-rdn-view="sing" data-rdn-focus="tool-voice"', t('nav_sing'), t('tool_sing_d')) + '</ul><p id="rdn-scored-status" role="status" hidden></p>';
  }
  /** The page head's right side, as on Today: the day streak, and today's set as dots. */
  function rdnStreakUi(state: ReadingBookState, today: string) {
      const box = maybeById('rdn-streak');
      if (!box)
          return;
      const daily = RDN.noDaily ? null : state.daily, total = daily ? daily.slots.length : SRT_DAILY_PIECES, played = daily ? daily.done.filter((x) => x !== null).length : 0;
      const dots = Array.from({ length: total }, (_, i) => `<i${i < played ? ' class="on"' : ''}></i>`).join('');
      box.innerHTML = `<div><span class="big num" id="rdn-streak-n">${srtStreak(state, today)}</span><small class="streak-l">${rdEsc(t('streak_label'))}</small></div>` +
          `<div class="goaldots" role="img" aria-label="${rdEsc(t('rdn_goal_aria', played, total))}">${dots}</div><small class="goal-txt num">${rdEsc(t('goal_txt', played, total))}</small>`;
      box.hidden = false;
  }
  function rdnNumChip(n: number, stat: PieceStat | undefined, next: boolean) {
      const label = !stat ? t('rdn_num_aria_none', n) : stat.stars === 0 ? t('rdn_num_aria_star0', n) : stat.stars === 1 ? t('rdn_num_aria_star1', n) : t('rdn_num_aria_stars', n, stat.stars);
      return `<button type="button" class="rdn-num${stat ? ' played' : ''}${next ? ' next' : ''}" data-rdn-n="${n}" data-rdn-focus="n${n}" aria-label="${rdEsc(label)}">` +
          `<b>${n}</b><small aria-hidden="true">${stat ? rdnStarText(stat.stars) : ''}</small></button>`;
  }
  /** The sign next to the colour of a key's status (the words are in the chip's label): a check for secure, a dot for started. */
  function rdnMark(status: string) {
      return status === 'secure' ? '<span class="rdn-mk rdn-mk-secure" aria-hidden="true">✓</span>' : status === 'started' ? '<span class="rdn-mk rdn-mk-started" aria-hidden="true">●</span>' : '';
  }
  function rdnUnitLabel(unit: BookUnit, named: boolean) {
      if (unit.kind === 'easy')
          return t('rdn_unit_easy');
      if (unit.kind === 'newKey')
          return named ? rdnKeyName(srtReadingKey(unit.keys[0])) : t('rdn_unit_newkey');
      return t(unit.kind === 'check' ? 'rdn_unit_check' : 'rdn_unit_mix');
  }
  function rdnBookHtml(state: ReadingBookState, moreOpen: boolean) {
      const e = rdEsc, lv = state.level, level = srtLevel(lv), focus = state.focusKey;
      const levels = srtLevels().map((l) => `<button type="button" class="rdn-lv" data-rdn-lv="${l.id}" data-rdn-focus="lv${l.id}" aria-pressed="${l.id === lv}" ` +
          `aria-label="${e(t('rdn_level_aria', l.id, rdnLevelName(l.id)))}">${l.id}</button>`).join('');
      const pool = srtKeyPool(lv), poolIds: readonly string[] = pool.map((k) => k.id), rest = srtReadingKeys().filter((k) => !poolIds.includes(k.id));
      const chip = (k: ReadingKey) => {
          const st = srtKeyStatus(state, lv, k.id);
          const label = rdnKeyName(k) + ', ' + rdnSigWords(k.keyN) + (st === 'new' ? '' : ', ' + t('rdn_status_' + st));
          return `<button type="button" class="rdn-key" data-rdn-key="${k.id}" data-rdn-focus="key-${k.id}" data-m="${st === 'secure' ? 2 : st === 'started' ? 1 : 0}" ` +
              `aria-pressed="${focus === k.id}" aria-label="${e(label)}"><b>${e(rdnKeyShort(k))}</b><small>${e(rdnSig(k.keyN))}</small>${rdnMark(st)}</button>`;
      };
      const mixed = `<button type="button" class="rdn-key rdn-mix" data-rdn-key="mix" data-rdn-focus="key-mix" aria-pressed="${focus === null}">` +
          `<b>${e(t('rdn_mixed'))}</b><small>${e(t('rdn_mixed_sub', pool.length))}</small></button>`;
      const open = moreOpen || (focus !== null && !poolIds.includes(focus));
      const others = rest.length ? `<details class="rdn-more" id="rdn-more-keys"${open ? ' open' : ''}><summary data-rdn-focus="more">${e(t('rdn_other_keys'))}</summary>` +
          `<div class="rdn-keys" role="group" aria-label="${e(t('rdn_other_keys'))}">${rest.map(chip).join('')}</div></details>` : '';
      let head = '', body = '';
      if (focus === null) {
          const tally = srtBookTally(state, lv), next = tally.next;
          const go = tally.done === 0 ? t('rdn_go_start', 1) : next === null ? t('rdn_go_replay', 1) : t('rdn_go_continue', next);
          head = `<h3>${e(t('rdn_book_head', lv))}</h3><span class="rdn-sub" id="rdn-book-done">${e(t('rdn_done_of', tally.done, SRT_BOOK_PIECES))}</span>` +
              `<span class="rdn-sp"></span><button type="button" class="btn primary" id="rdn-book-go" data-rdn-n="${next ?? 1}" data-rdn-focus="book-go">${e(go)}</button>`;
          body = '<div class="rdn-units">' + srtBookUnits(lv).map((unit) => {
              const first = unit.index * SRT_UNIT_PIECES + 1;
              const nums = Array.from({ length: SRT_UNIT_PIECES }, (_, i) => first + i);
              const played = nums.filter((n) => state.pieces[srtBookId(lv, n)]).length;
              return `<section class="rdn-unit" aria-label="${e(t('rdn_unit', unit.index + 1) + ', ' + rdnUnitLabel(unit, true))}"><div class="rdn-uh"><b>${e(t('rdn_unit', unit.index + 1))}</b>` +
                  `<span>${e(rdnUnitLabel(unit, true))}</span>${unit.kind === 'newKey' ? `<span class="rdn-tag">${e(t('rdn_new_key'))}</span>` : ''}` +
                  `<span class="rdn-uc">${played}/${SRT_UNIT_PIECES}</span></div><div class="rdn-nums8">` +
                  nums.map((n) => rdnNumChip(n, state.pieces[srtBookId(lv, n)], n === next)).join('') + '</div></section>';
          }).join('') + '</div>';
      }
      else {
          const key = srtReadingKey(focus), tally = srtFocusTally(state, lv, focus), next = tally.next;
          const go = tally.done === 0 ? t('rdn_go_start', 1) : next === null ? t('rdn_go_replay', 1) : t('rdn_go_continue', next);
          head = `<h3>${e(t('rdn_focus_head', rdnKeyName(key)))}</h3><span class="rdn-sub" id="rdn-book-done">${e(t('rdn_done_of', tally.done, SRT_FOCUS_PIECES))}</span>` +
              `<span class="rdn-sp"></span><button type="button" class="btn primary" id="rdn-book-go" data-rdn-n="${next ?? 1}" data-rdn-focus="book-go">${e(go)}</button>`;
          body = `<div class="rdn-nums">${Array.from({ length: SRT_FOCUS_PIECES }, (_, i) => i + 1)
              .map((n) => rdnNumChip(n, state.pieces[srtFocusId(lv, focus, n)], n === next)).join('')}</div>`;
      }
      const patterns = level.newPatterns.map(rdnPattern).join(', ');
      return `<section class="rdn-card rdn-book" aria-labelledby="rdn-book-h">` +
          `<h3 class="rdn-book-t" id="rdn-book-h" tabindex="-1">${e(t('rdn_book_title'))}</h3>` +
          `<div class="rdn-lab" id="rdn-lv-lab">${e(t('rdn_level_label'))}</div><div class="rdn-levels" role="group" aria-labelledby="rdn-lv-lab">${levels}</div>` +
          `<p class="rdn-lvdesc"><b>${e(t('rdn_level_head', lv, rdnLevelName(lv)))}</b><br>${e(t('rdn_lv' + lv + '_desc'))}<br>` +
          `<span class="rdn-pat">${e(t('rdn_new_patterns', patterns))}</span></p>` +
          `<div class="rdn-lab" id="rdn-k-lab">${e(t('rdn_keys'))}</div><div class="rdn-keys" role="group" aria-labelledby="rdn-k-lab">${mixed}${pool.map(chip).join('')}</div>` +
          others +
          `<div class="rdn-legend"><span><i class="rdn-lg-secure"></i>${rdnMark('secure')}${e(t('rdn_legend_secure'))}</span><span><i class="rdn-lg-started"></i>${rdnMark('started')}${e(t('rdn_legend_started'))}</span></div>` +
          `<div class="rdn-bookhead">${head}</div>${body}</section>`;
  }
  function rdnHomeClick(e: MouseEvent) {
      const state = rdnBook();
      const lv = eventClosest(e, '[data-rdn-lv]');
      if (lv) {
          rdnChoose(Number(lv.dataset.rdnLv), state.focusKey);
          return;
      }
      const key = eventClosest(e, '[data-rdn-key]');
      if (key) {
          rdnChoose(state.level, key.dataset.rdnKey === 'mix' ? null : key.dataset.rdnKey ?? null);
          return;
      }
      const num = eventClosest(e, '[data-rdn-n]');
      if (num) {
          const n = Number(num.dataset.rdnN);
          rdnOpen(state.focusKey ? { kind: 'focus', level: state.level, key: state.focusKey, number: n } : { kind: 'book', level: state.level, number: n });
          return;
      }
      const slot = eventClosest(e, '[data-rdn-slot]');
      if (slot && state.daily) {
          rdnOpen({ kind: 'daily', date: state.daily.date, slot: Number(slot.dataset.rdnSlot) });
          return;
      }
      const b = eventClosest(e, 'button'), view = b?.dataset.rdnView;
      // Continue runs the step it names.
      const id = b ? (b.id === 'rdn-plan-continue' ? b.dataset.rdnRun ?? '' : b.id) : '';
      if (view) {
          host.nav.show(view);
          return;
      }
      if ((id === 'rdn-today-go' || id === 'rdn-plan-set') && state.daily) {
          // The first piece not played yet; a finished set opens at its first piece, as practice.
          const first = state.daily.done.findIndex((x) => x === null);
          if (first >= 0 || id === 'rdn-plan-set')
              rdnOpen({ kind: 'daily', date: state.daily.date, slot: Math.max(0, first) });
      }
      else if (id === 'rdn-long-go' || id === 'rdn-plan-long')
          rdnOpen(rdnLongCtx(state, rdnToday()));
      else if (id === 'rdn-warm-go')
          rdnWarmupStart();
      else if (id === 'rdn-scored')
          void rdnOpenScored();
      else if (id === 'rdn-suggest-go' && state.level < 8)
          rdnChoose(state.level + 1, null);
  }
  /* ---- the warm-up: flash cards, then a few existing drills, one after another ---- */
  /** How many answers end a drill step of the warm-up: rhythm exercises, and questions of the other drills (chords). */
  const RDN_WARM_LIMIT = { rh: 2, other: 5 };
  function rdnWarmClear() {
      window.clearTimeout(WARM.timer);
      window.clearTimeout(WARM.chordTimer);
      WARM.timer = 0;
      WARM.chordTimer = 0;
  }
  /** Starts the warm-up of the book's level, in the pinned key or else the key of today's level piece. */
  function rdnWarmupStart() {
      if (!rdnWhenSaved(rdnWarmupStart))
          return;
      const today = rdnToday();
      let state = rdnBook();
      const ensured = rdnEnsureDaily(state, today);
      if (ensured !== state) {
          state = ensured;
          rdnSetBook(state);
      }
      const slots = state.daily?.slots ?? [], slot = slots.find((x) => x.role === 'level') ?? slots[1] ?? slots[0];
      const level = state.level, key: string = state.focusKey ?? slot?.key ?? srtKeyPool(level)[0].id;
      if (RD.on)
          rdAbort();
      srStopAll(true, false, 'navigate');
      rdnWarmClear();
      WARM.on = true;
      WARM.level = level;
      WARM.key = key;
      WARM.steps = srtWarmupPlan(level, key, `${today}|${level}|${key}`);
      WARM.step = 0;
      WARM.tally = [];
      WARM.phase = 'idle';
      rdnShowScreen('warmup');
      rdnWarmRun();
      stageSync();
      window.scrollTo(0, 0);
      byId('rdn-w-back').focus({ preventScroll: true });
  }
  function rdnWarmStepName(step: WarmupStep | undefined) {
      if (!step)
          return '';
      if (step.kind === 'flash')
          return t('rdn_w_flash');
      if (step.kind === 'position')
          return t(step.hand === 'rh' ? 'rdn_w_pos_rh' : 'rdn_w_pos_lh');
      return t(step.id.startsWith('ch') ? 'rdn_w_chords' : 'rdn_w_rhythm');
  }
  function rdnWarmHead() {
      byId('rdn-w-step').textContent = t('rdn_w_step', Math.min(WARM.step + 1, WARM.steps.length), WARM.steps.length) + ' · ' + rdnWarmStepName(WARM.steps[WARM.step]);
      const tally = byId('rdn-w-tally');
      tally.textContent = WARM.tally.length ? t('rdn_w_tally', WARM.tally[0], WARM.tally[1]) : '';
      tally.hidden = !WARM.tally.length;
      // A drill step names itself on the drill's stage (a custom drill would say "Custom drill").
      if (WARM.phase === 'drill')
          byId('rdx-title').textContent = rdnWarmStepName(WARM.steps[WARM.step]);
  }
  /** Runs the current step: the flash cards here, the other steps in the drill engine (practice mode, a few answers). */
  function rdnWarmRun() {
      rdnWarmClear();
      if (!WARM.on)
          return;
      const step = WARM.steps[WARM.step], flash = byId('rdn-w-flash');
      if (!step) {
          rdnWarmFinish();
          return;
      }
      rdnWarmHead();
      if (step.kind === 'flash') {
          byId('rdp-drills').hidden = true;
          flash.hidden = false;
          WARM.card = 0;
          WARM.clean = 0;
          rdnWarmCard();
          return;
      }
      // Focus on the card (its Next button, say) moves to the header's Back before the card goes.
      const lost = flash.contains(document.activeElement);
      flash.hidden = true;
      flash.innerHTML = '';
      if (lost)
          byId('rdn-w-back').focus({ preventScroll: true });
      const L: ReadDrillLevel | undefined = step.kind === 'position'
          ? rdCustomLevel({ ty: 'play', clef: step.clef, lo: step.low, hi: step.high, acc: 0, keys: 0, land: false }, step.keyN)
          : RD_LV[step.id];
      if (!L) {
          rdnWarmNext();
          return;
      }
      WARM.phase = 'drill';
      WARM.limit = step.kind === 'position' ? step.count : L.ty === 'rh' ? RDN_WARM_LIMIT.rh : RDN_WARM_LIMIT.other;
      byId('rdp-drills').hidden = false;
      rdAbort();
      RD.L = L;
      byId('rdx-home').hidden = true;
      byId('rdx-stage').hidden = false;
      rdIntro();
      rdStart('practice');
      rdnWarmHead();
  }
  function rdnWarmNext() {
      WARM.step++;
      rdnWarmRun();
  }
  /** True once a drill step of the warm-up has had its answers: the drill then ends its run as usual (see rdFinish). */
  function rdnWarmLimit() { return WARM.on && WARM.phase === 'drill' && RD.n >= WARM.limit; }
  /** Called by rdFinish after a run was counted: in a warm-up the next step starts instead of the drill's summary. */
  function rdnWarmDrillDone() {
      if (!WARM.on || WARM.phase !== 'drill')
          return false;
      rdnWarmNext();
      return true;
  }
  /** The drills screen as the warm-up found it: no run, the stage closed, the ladder showing. */
  function rdnWarmDrillsReset() {
      if (RD.on)
          rdAbort();
      RD.L = null;
      byId('rdx-stage').hidden = true;
      byId('rdx-home').hidden = false;
  }
  /** Abandons the warm-up (Back, another screen, another tab): no timer, no drill run and no flash card stay behind. */
  function rdnWarmStop() {
      rdnWarmClear();
      const touched = WARM.step > 0 || WARM.phase === 'drill';
      WARM.on = false;
      WARM.phase = 'idle';
      WARM.played = [];
      const flash = maybeById('rdn-w-flash');
      if (flash) {
          flash.hidden = true;
          flash.innerHTML = '';
      }
      if (touched)
          rdnWarmDrillsReset();
  }
  function rdnWarmFinish() {
      rdnWarmStop();
      rdData().tot.sess++;
      markReadDoneToday();
      touchDay();
      rdData().prefs.warmDone = rdnToday();
      saveAll();
      rdnHome();
      const go = maybeById('rdn-warm-go');
      if (go)
          go.focus({ preventScroll: true });
  }
  /* flash cards */
  function rdnWarmCards(): readonly FlashCard[] {
      const step = WARM.steps[WARM.step];
      return step && step.kind === 'flash' ? step.cards : [];
  }
  /** The card's bar for the engraver: only the hand that plays it, and never with note names. */
  function rdnFlashScore(card: FlashCard): SrScore {
      const sc = card.score;
      return { ts: [...sc.ts], keyN: sc.keyN, engrave: 2, noNames: true, rh: card.hand === 'rh' ? sc.rh : undefined, lh: card.hand === 'lh' ? sc.lh : undefined };
  }
  function rdnWarmCard() {
      const cards = rdnWarmCards();
      if (WARM.card >= cards.length) {
          WARM.tally = [WARM.clean, cards.length];
          rdnWarmNext();
          return;
      }
      WARM.again = false;
      rdnWarmShow(true);
  }
  function rdnWarmShow(draw: boolean) {
      rdnWarmClear();
      WARM.phase = 'show';
      WARM.played = [];
      WARM.lastAt = 0;
      WARM.strict = false;
      rdnWarmFlashUi(draw);
      // The bar runs out while the card shows (a still bar with reduced motion). Only a new showing restarts it.
      const bar = maybeById('rdn-f-bar');
      if (bar) {
          bar.style.setProperty('--flash', RDN_WARM_MS.flash + 'ms');
          bar.classList.remove('run');
          void bar.offsetWidth;
          if (!reduceMotion())
              bar.classList.add('run');
      }
      WARM.timer = window.setTimeout(rdnWarmHide, RDN_WARM_MS.flash);
  }
  function rdnWarmHide() {
      rdnWarmClear();
      WARM.phase = 'play';
      rdnWarmFlashUi(false);
  }
  /** A note from the app's normal input while a card waits to be played. Notes closer than RDN_WARM_MS.chord form one chord. */
  function rdnWarmNote(midi: number) {
      const card = rdnWarmCards()[WARM.card];
      if (!card)
          return;
      const now = performance.now(), src = [...(shell.inputOwners.get(midi) || [])], last = WARM.played[WARM.played.length - 1];
      if (src.some((x) => x === 'midi' || x === 'ble'))
          WARM.strict = true;
      if (last && now - WARM.lastAt <= RDN_WARM_MS.chord)
          last.push(midi);
      else
          WARM.played.push([midi]);
      WARM.lastAt = now;
      window.clearTimeout(WARM.chordTimer);
      if (WARM.played.length >= card.notes.length)
          WARM.chordTimer = window.setTimeout(rdnWarmJudge, Math.max(0, RDN_WARM_MS.chord));
  }
  /** Checks what was played (any octave unless it came from a MIDI or Bluetooth piano, as in the drills) and shows the mark. */
  function rdnWarmJudge() {
      const card = rdnWarmCards()[WARM.card];
      if (!card || WARM.phase !== 'play')
          return;
      WARM.ok = srtFlashMatches(card, WARM.played, !!host.store.data().settings.anyOctave || !WARM.strict);
      if (WARM.ok && !WARM.again)
          WARM.clean++;
      rdnWarmClear();
      WARM.phase = 'result';
      rdnWarmFlashUi(false);
      WARM.timer = window.setTimeout(rdnWarmAdvance, RDN_WARM_MS.result);
  }
  function rdnWarmAdvance() {
      rdnWarmClear();
      WARM.card++;
      rdnWarmCard();
  }
  /** Draws the card (`draw`) or updates it for the phase: the prompt (a polite live region), the bar, the mark and the buttons. */
  function rdnWarmFlashUi(draw: boolean) {
      const box = maybeById('rdn-w-flash'), cards = rdnWarmCards(), card = cards[WARM.card], e = rdEsc;
      if (!box || !card)
          return;
      if (draw || !box.querySelector('#rdn-f-staff')) {
          box.innerHTML = `<div class="rdn-f-top"><span class="rdn-f-count" id="rdn-f-count"></span><span class="rdn-f-prompt" id="rdn-f-prompt" role="status"></span></div>` +
              `<div class="ss-wrap rdn-f-staff" id="rdn-f-staff" role="img"></div><div class="rdn-f-bar" id="rdn-f-bar" aria-hidden="true"><i></i></div>` +
              `<div class="rdn-row rdn-f-btns"><button type="button" class="btn" id="rdn-f-again"></button><button type="button" class="btn primary" id="rdn-f-next"></button></div>`;
          const wrap = byId('rdn-f-staff');
          wrap.innerHTML = srRender(rdnFlashScore(card), srPaperOf(wrap)).svg;
      }
      const phase = WARM.phase, wrap = byId('rdn-f-staff'), bar = byId('rdn-f-bar'), again = buttonById('rdn-f-again'), next = buttonById('rdn-f-next');
      byId('rdn-f-count').textContent = t('rdn_f_card', WARM.card + 1, cards.length);
      const prompt = byId('rdn-f-prompt');
      prompt.dataset.s = phase === 'result' ? (WARM.ok ? 'good' : 'bad') : phase;
      prompt.innerHTML = phase === 'result'
          ? `<span aria-hidden="true">${WARM.ok ? '✓' : '✗'}</span> ${e(t(WARM.ok ? 'rdn_f_right' : 'rdn_f_wrong'))}`
          : e(t(phase === 'play' ? 'rdn_f_play' : 'rdn_f_look'));
      wrap.setAttribute('aria-label', t('rdn_f_staff_aria'));
      wrap.toggleAttribute('data-hidden', phase === 'play');
      if (phase === 'result')
          wrap.dataset.mark = WARM.ok ? 'good' : 'bad';
      else
          delete wrap.dataset.mark;
      wrap.querySelectorAll('.ss-n').forEach((n) => { if (!(n instanceof SVGElement))
          return; if (phase === 'result')
          n.dataset.s = WARM.ok ? 'good' : 'bad';
      else
          delete n.dataset.s; });
      bar.hidden = phase !== 'show';
      again.textContent = t('rdn_f_again');
      next.textContent = t('rdn_f_next');
      const focused = document.activeElement;
      again.hidden = phase !== 'play';
      next.hidden = phase !== 'result';
      // A button that hides while it has focus hands it to the card, so focus is never lost to the page.
      if ((focused === again && again.hidden) || (focused === next && next.hidden))
          box.focus({ preventScroll: true });
  }
  function rdnWarmFlashClick(e: MouseEvent) {
      const id = eventClosest(e, 'button')?.id;
      if (id === 'rdn-f-again' && WARM.phase === 'play') {
          WARM.again = true;
          rdnWarmShow(false);
      }
      else if (id === 'rdn-f-next' && WARM.phase === 'result')
          rdnWarmAdvance();
  }
  /** After a language change: the header, and the card's texts. */
  function rdnWarmLocale() {
      if (!WARM.on)
          return;
      rdnWarmHead();
      if (WARM.phase === 'show' || WARM.phase === 'play' || WARM.phase === 'result')
          rdnWarmFlashUi(false);
  }
  /* ---- the player ---- */
  let rdnScoredBusy = false;
  async function rdnOpenScored(startInFocus?: number) {
      if (rdnScoredBusy || !rdnWhenSaved(() => { void rdnOpenScored(startInFocus); })) return;
      const from = RDN.ctx, screen = RDN.screen, state = rdnBook();
      const level = from?.kind === 'scored' ? from.piece.level : state.level;
      const key = state.focusKey;
      const status = (message: string) => {
          const el = maybeById(screen === 'home' ? 'rdn-scored-status' : 'rdn-p-live');
          if (el) {
              if (screen === 'home') el.hidden = !message;
              el.textContent = message;
          }
      };
      const current = () => view0() === 'read' && RDN.ctx === from && RDN.screen === screen &&
          rdnBook().level === state.level && rdnBook().focusKey === key;
      rdnScoredBusy = true;
      status(t('rdn_scored_loading'));
      try {
          const { srtScoredExercise } = await import('../../sight-reading/scored-exercise.js');
          if (!current()) return;
          const seen = new Set(rdnSeen());
          if (from?.kind === 'scored') seen.add(srtLevelFingerprint(from.piece));
          const result = srtScoredExercise(level, key, crypto.getRandomValues(new Uint32Array(1))[0], seen);
          if (!result) {
              status(t('rdn_scored_error'));
              return;
          }
          status('');
          rdnOpen({ kind: 'scored', piece: result.piece }, screen === 'home' ? 'title' : 'keep', startInFocus);
      }
      catch {
          if (current()) status(t('rdn_scored_error'));
      }
      finally {
          rdnScoredBusy = false;
      }
  }
  function rdnPieceOf(ctx: RdnCtx): GeneratedPiece | null {
      if (ctx.kind === 'scored') return ctx.piece;
      if (ctx.kind === 'book')
          return srtBookPiece(ctx.level, ctx.number);
      if (ctx.kind === 'focus')
          return srtFocusPiece(ctx.level, ctx.key, ctx.number);
      if (ctx.kind === 'long') {
          // A long piece is several sections in one meter: when none can be made for this key, there is no piece to open.
          try {
              return srtLongPiece(ctx.level, ctx.key, ctx.date, ctx.index);
          }
          catch {
              return null;
          }
      }
      const daily = rdnBook().daily, slot = daily && daily.date === ctx.date ? daily.slots[ctx.slot] : undefined;
      return slot ? srtDailyPiece(ctx.date, slot) : null;
  }
  function rdnHeadText(): { title: string; sub: string } {
      const c = RDN.ctx, p = SR.lvPiece;
      if (!c || !p)
          return { title: '', sub: '' };
      const level = t('rdn_level_head', p.level, rdnLevelName(p.level));
      if (c.kind === 'scored')
          return { title: t('rdn_scored'), sub: level };
      if (c.kind === 'long')
          return { title: c.index ? t('rdn_long_n', c.index + 1) : t('rdn_long'), sub: t('rdn_long_sub', p.bars) + ' · ' + level };
      if (c.kind === 'daily')
          return { title: t('rdn_title_today', c.slot + 1, SRT_DAILY_PIECES), sub: level };
      if (c.kind === 'focus')
          return { title: t('rdn_title_no', c.number, SRT_FOCUS_PIECES), sub: level + ' · ' + rdnKeyName(srtReadingKey(c.key)) };
      // A book piece names its unit but never its key: in a mix, reading the signature is part of the task.
      const unit = srtBookUnits(c.level)[Math.floor((c.number - 1) / SRT_UNIT_PIECES)];
      return { title: t('rdn_title_no', c.number, SRT_BOOK_PIECES), sub: level + ' · ' + t('rdn_unit', unit.index + 1) + ' · ' + rdnUnitLabel(unit, false) };
  }
  function rdnPlayerHead() {
      const h = rdnHeadText(), c = RDN.ctx;
      byId('rdn-p-title').textContent = h.title;
      byId('rdn-p-sub').textContent = h.sub;
      buttonById('rdn-prev').hidden = !c || c.kind === 'daily' || c.kind === 'long' || c.kind === 'scored';
      rdnNavUi();
  }
  /** True while an attempt of the level piece runs: its preview, count-in or playing (or a Step-by-step run). */
  function rdnBusy() {
      const name = SR.srtState?.name;
      return !!SR.lvPiece && (SR.active || name === 'preparing' || name === 'claiming' || name === 'preview' || name === 'countIn' || name === 'playing');
  }
  /** Prev and Next: off during an attempt, so they never abandon it; Prev also off on the first piece and in today's set. */
  function rdnNavUi() {
      const c = RDN.ctx, busy = rdnBusy(), prev = maybeById('rdn-prev'), next = maybeById('rdn-next');
      if (prev instanceof HTMLButtonElement)
          prev.disabled = busy || !c || c.kind === 'daily' || c.kind === 'long' || c.kind === 'scored' || c.number <= 1;
      if (next instanceof HTMLButtonElement)
          next.disabled = busy || !c;
      const stageNext = maybeById('rd-stage-next'), result = maybeById('rdn-result'), retry = maybeById('rdn-retry');
      if (stageNext)
          stageNext.hidden = !c || busy || !result?.hidden;
      if (retry instanceof HTMLButtonElement)
          retry.disabled = srtPendingSaveProtected();
  }
  /** The status line before an attempt: first sight, or practice for a piece already seen. */
  function rdnReadyText() {
      const note = midiLive() ? '_note' : '';
      return t((SR.srtState?.mode === 'practice' ? 'rdn_seen' : 'rdn_ready') + note);
  }
  /** The status line again, when it still shows: after a language change, or a piano that connected or went away. */
  function rdnReadySync() {
      const v = maybeById('rd-verdict');
      if (v && RDN.screen === 'player' && SR.lvPiece && RDN.ready && v.textContent === RDN.ready)
          v.textContent = RDN.ready = rdnReadyText();
  }
  /** The hint next to Hands: a level piece's first sight is played with both hands. */
  function rdnHandsHint() {
      const hint = maybeById('rdn-hands-hint'), hands = maybeById('rd-hands');
      if (hint)
          hint.hidden = !SR.lvPiece || !hands || hands.hidden || SR.hands === 'both';
  }
  /** The tempo of a level piece's first sight: its level's, or a long piece's own (the slowest of its sections). */
  function rdnBpm(piece: GeneratedPiece) {
      return 'bpm' in piece && typeof piece.bpm === 'number' ? piece.bpm : srtLevel(piece.level).bpm;
  }
  /** The drawable score of a level piece: the engraver's level notation (engrave: 2) with the player's title. */
  function rdnDrawable(piece: GeneratedPiece): SrPiece {
      const score = srtLevelScore(piece);
      return { id: 'lvl', ephemeral: true, gen: 'lv' + piece.level, comp: '', level: piece.level, keyN: score.keyN, minor: score.minor, bpm: rdnBpm(piece),
          ts: score.ts, engrave: 2, marks: srtLevelMarkings(piece), rh: score.rh, lh: score.lh, t: { en: rdnHeadText().title } };
  }
  /** The Hands control only for the levels where both hands play together. */
  function rdnHandsUi() {
      const p = SR.lvPiece, mode = p ? srtLevel(p.level).hands : null;
      const show = !mode || mode === 'oneMoves' || mode === 'together';
      [maybeById('rd-hands'), maybeById('rd-stage-hands')].forEach((c) => { if (c)
          c.hidden = !show; });
      if (!show)
          SR.hands = 'both';
      rdnHandsHint();
  }
  /** Opens a level piece. `focus`: 'title' moves focus to the piece's title (from the home), 'keep' leaves it where it is
   *  (Prev, Next and the arrow keys), unless the focused control went away. */
  function rdnOpen(ctx: RdnCtx, focus: 'title' | 'keep' = 'title', startInFocus?: number) {
      if (!rdnWhenSaved(() => rdnOpen(ctx, focus, startInFocus)))
          return;
      const piece = rdnPieceOf(ctx);
      if (!piece)
          return;
      rdnAutoCancel();
      srStopAll(undefined, false, 'navigate');
      // The old melody screen's mode comes back when the player is left.
      if (!SR.lvPiece && RDN.melodyMode === null)
          RDN.melodyMode = SR.modeSel;
      SR.srtPiece = null;
      SR.lvPiece = piece;
      // A new piece starts with both hands: a one-hand choice does not carry over.
      SR.hands = 'both';
      RDN.ctx = ctx;
      SR.srtFingerprint = srtLevelFingerprint(piece);
      // A piece already seen (an earlier attempt, or Listen) is practice from the start.
      const seen = !!srtReadLedger(localStorage).exposures[SR.srtFingerprint];
      SR.srtState = { ...SRT_INITIAL_STATE, mode: seen ? 'practice' : 'firstSight', fingerprint: SR.srtFingerprint };
      SR.srtPendingAttempt = null;
      SR.srtEvaluation = null;
      SR.srtResultValue = null;
      SR.srtResultLevelId = null;
      srtPreviewUi(false);
      srtPendingUi(false);
      srtNotice(null);
      void srtProgressLedgerUpdate({ type: 'recoverOrphanClaims', generation: srtReadLedger(localStorage).generation });
      SR.gen = rdnDrawable(piece);
      srNoteStartHold();
      rdTab('pieces', 'player');
      SR.modeSel = RDN.playerMode;
      srModeUi();
      rdnResultHide();
      srShowPiece(SR.gen);
      rdnPlayerHead();
      rdnChecklist();
      const v = byId('rd-verdict');
      RDN.ready = '';
      if (!v.textContent) {
          v.className = 'verdict neutral';
          v.textContent = RDN.ready = rdnReadyText();
      }
      window.scrollTo(0, 0);
      // The page is sized by the room under it: laid out again now that everything above the paper is in place.
      srFit();
      const active = document.activeElement;
      if (focus === 'title' || !(active instanceof HTMLElement) || active === document.body || !active.getClientRects().length)
          byId(shell.scoreFocus.owner === 'read' ? 'rd-go' : 'rdn-p-title').focus({ preventScroll: true });
      if (focus === 'keep')
          byId('rdn-p-live').textContent = rdnHeadText().title;
      if (startInFocus === shell.scoreFocus.token && shell.scoreFocus.owner === 'read') {
          byId('rd-go').focus({ preventScroll: true });
          srGo();
      }
  }
  /** Next (+1) or previous (-1) piece. Past the last piece of a run, and after the fifth piece of the day, the home comes back. */
  function rdnStep(dir: 1 | -1, start = dir > 0) {
      const c = RDN.ctx;
      if (!c || rdnBusy())
          return;
      rdnAutoCancel();
      const startInFocus = start && shell.scoreFocus.owner === 'read' ? shell.scoreFocus.token : undefined;
      let next: RdnCtx | null = null;
      if (c.kind === 'scored') {
          if (dir > 0) void rdnOpenScored(startInFocus);
          return;
      }
      if (c.kind === 'daily') {
          if (dir < 0)
              return;
          if (c.slot + 1 < SRT_DAILY_PIECES)
              next = { ...c, slot: c.slot + 1 };
      }
      else if (c.kind === 'long') {
          // Next is another long piece: the first of today not played yet.
          if (dir < 0)
              return;
          next = rdnLongCtx(rdnBook(), c.date);
          if (next.kind === 'long' && next.index <= c.index)
              next = { ...next, index: c.index + 1 };
      }
      else {
          const n = c.number + dir, total = c.kind === 'book' ? SRT_BOOK_PIECES : SRT_FOCUS_PIECES;
          if (n < 1)
              return;
          if (n <= total)
              next = { ...c, number: n };
      }
      if (!next) {
          rdnHome(true);
          return;
      }
      rdnOpen(next, 'keep', startInFocus);
  }
  function rdnKey(e: KeyboardEvent) {
      // A key the page reacts to stops the auto-next countdown (Tab only moves focus).
      if (RDN.autoTimer && e.key !== 'Tab' && view0() === 'read' && RDN.screen === 'player')
          rdnAutoCancel();
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')
          return false;
      if (view0() !== 'read' || RDN.screen !== 'player' || !RDN.ctx || SR.active || SR.listening || inField() || rdnBusy())
          return false;
      if (e.key === 'ArrowLeft' && (RDN.ctx.kind === 'daily' || RDN.ctx.kind === 'long' || RDN.ctx.kind === 'scored' || RDN.ctx.number <= 1))
          return false;
      e.preventDefault();
      rdnStep(e.key === 'ArrowRight' ? 1 : -1);
      return true;
  }
  /** Leaves the level piece without touching the engine (a new melody or piece takes its place). */
  function rdnForgetLevelPiece() {
      SR.lvPiece = null;
      RDN.ctx = null;
      RDN.ready = '';
      rdnAutoCancel();
      rdnResultHide();
      rdnChecklist();
      rdnHandsUi();
      rdnNavUi();
      rdWarmButtonsSync();
      if (RDN.melodyMode !== null) {
          SR.modeSel = RDN.melodyMode;
          RDN.melodyMode = null;
          srModeUi();
      }
  }
  /** Leaves the player: the attempt stops and the pieces panel is empty again, as before any melody. */
  function rdnDropLevelPiece() {
      if (!SR.lvPiece)
          return;
      srStopAll(undefined, false, 'navigate');
      rdnForgetLevelPiece();
      SR.piece = null;
      SR.gen = null;
      SR.srtPiece = null;
      SR.srtFingerprint = null;
      SR.srtState = SRT_INITIAL_STATE;
      SR.srtPendingAttempt = null;
      SR.srtEvaluation = null;
      SR.srtResultValue = null;
      SR.srtResultLevelId = null;
      SR.render = null;
      SR.notes = [];
      SR.steps = [];
      srtPreviewUi(false);
      srtPendingUi(false);
      srtNotice(null);
      byId('rd-staff').innerHTML = '';
      byId('rd-verdict').textContent = '';
      srMeta();
      srEmptyUi();
      srCoach();
  }
  /** The preview checklist: what to look at first, then up to two patterns of the piece (the level's new ones first). */
  function rdnChecklist() {
      const ul = maybeById('rdn-checklist');
      if (!ul)
          return;
      const p = SR.lvPiece;
      // What to look at before the first attempt: gone once an attempt starts, and for a piece already seen.
      ul.hidden = !p || SR.srtState?.mode !== 'firstSight';
      ul.style.visibility = SR.active ? 'hidden' : '';
      if (!p) {
          ul.innerHTML = '';
          return;
      }
      const items = [t('rdn_check_sig'), t('rdn_check_first')];
      const own = srtLevel(p.level).newPatterns, order = [...own, ...srtLevelPatterns(p.level).filter((x) => !own.includes(x))];
      for (const pattern of order) {
          if (items.length >= 4)
              break;
          const bar = p.patterns.findIndex((names) => names.includes(pattern));
          if (bar >= 0)
              items.push(rdnCap(t('rdn_check_pattern', rdnPattern(pattern), bar + 1)));
      }
      // Two bars (before the last, after an upbeat bar) with the same melody rhythm.
      const from = p.upbeat ? 1 : 0, last = p.bars - 1;
      outer: for (let a = from; a < last; a++)
          for (let b = a + 1; b < last; b++)
              if (srtMelodyRhythm(p, a) === srtMelodyRhythm(p, b)) {
                  items.push(t('rdn_check_rhythm', a + 1, b + 1));
                  break outer;
              }
      ul.innerHTML = items.map((x) => `<li>${rdEsc(x)}</li>`).join('');
  }
  /** Silence for the active hands: the gaps between their sounding notes, where a played note counts against the reader. */
  function rdnRestWindows(piece: GeneratedPiece, bpm: number, hand: 'rh' | 'lh' | 'both') {
      const msPerTick = 60000 / bpm / piece.ticksPerQuarter, end = srtLevelDurationMs(piece, bpm);
      const sounding = piece.events.filter((ev) => ev.pitches.length > 0 && (hand === 'both' || ev.hand === hand))
          .map((ev) => [ev.onsetTick * msPerTick, (ev.onsetTick + ev.durationTick) * msPerTick]).sort((a, b) => a[0] - b[0]);
      const out: { startMs: number; endMs: number }[] = [];
      let at = 0;
      for (const [start, stop] of sounding) {
          if (start > at + 1e-6)
              out.push({ startMs: at, endMs: start });
          at = Math.max(at, stop);
      }
      if (end > at + 1e-6)
          out.push({ startMs: at, endMs: end });
      return out;
  }
  /** Each expected note of a level piece and the drawn note it belongs to (same hand, onset and pitch). */
  function rdnDrawnIds(piece: GeneratedPiece, expected: readonly SightReadingExpected[]) {
      const drawn = new Map<string, number>(), events = new Map(piece.events.map((ev) => [ev.id, ev])), out = new Map<string, number>();
      SR.notes.forEach((n) => drawn.set(`${n.hand}|${n.beat.toFixed(3)}|${n.midi}`, n.nid));
      expected.forEach((x) => {
          const ev = events.get(x.id.slice(0, x.id.lastIndexOf(':')));
          const nid = ev ? drawn.get(`${x.hand}|${(ev.onsetTick / piece.ticksPerQuarter).toFixed(3)}|${x.midi}`) : undefined;
          if (nid !== undefined)
              out.set(x.id, nid);
      });
      return out;
  }
  function rdnRecord(score: number, stars: 0 | 1 | 2 | 3, firstSight: boolean) {
      const p = SR.lvPiece, c = RDN.ctx;
      if (!p || !c)
          return;
      const id = c.kind === 'scored' ? srtScoredId(srtLevelFingerprint(p)) : c.kind === 'book' ? srtBookId(c.level, c.number) : c.kind === 'focus' ? srtFocusId(c.level, c.key, c.number) : c.kind === 'long' ? srtLongId(c.date, c.index) : srtDailyId(c.date, c.slot);
      rdnSetBook(srtRecordResult(rdnBook(), { id, level: p.level, key: p.key.id, score, stars, firstSight, date: rdnToday() }));
  }
  /* ---- the result card and auto-next ---- */
  function rdnResultHide() {
      const box = maybeById('rdn-result');
      if (box) {
          // Focus on the card (Retry, say) moves to Start before the card goes.
          const lost = !box.hidden && box.contains(document.activeElement);
          box.hidden = true;
          box.innerHTML = '';
          if (lost)
              byId('rd-go').focus({ preventScroll: true });
      }
      RDN.learn = null;
      rdnVerdictShown(true);
      rdnAutoCancel();
      rdnNavUi();
  }
  /** The one-line verdict under the score. A level piece's result card replaces it, also for screen readers. */
  function rdnVerdictShown(on: boolean) {
      const v = maybeById('rd-verdict');
      if (v)
          v.hidden = !on;
  }
  function rdnResultShow(startAuto: boolean) {
      const box = maybeById('rdn-result'), ev = SR.srtEvaluation, p = SR.lvPiece, learn = RDN.learn, e = rdEsc;
      if (!box)
          return;
      if (!p || (!ev && !learn)) {
          rdnResultHide();
          return;
      }
      // A Step-by-step run measures neither pitch accuracy, rhythm nor timing: those cells show a dash.
      const pct = learn ? learn.acc : SR.srtResultValue ?? Math.round(ev?.score ?? 0), stars = learn ? learn.stars : rdnStars(ev?.stars ?? 0), auto = rdnAutoNextOn();
      const cells: [string, string][] = [
          [!ev || learn ? '—' : Math.round(ev.pitchF1 ?? 0) + '%', t('rdn_res_pitch')],
          [!ev || learn ? '—' : Math.round(ev.rhythmAcc ?? 0) + '%', t('rdn_res_rhythm')],
          [!ev || learn || ev.meanOffsetMs == null ? '—' : t('rdn_res_ms', Math.round(ev.meanOffsetMs)), t('rdn_res_timing')],
          [rdnKeyName(p.key), t('rdn_res_key')],
      ];
      // The score and the cells are the live region: a new result is announced once, without the buttons.
      box.innerHTML = `<div class="rdn-r-live" role="status" aria-atomic="true"><div class="rdn-r-top"><h3 id="rdn-r-score">${pct}%</h3>${rdStars(stars, stars ? undefined : t('rdn_stars_none'))}</div>` +
          // What the stars of an assessed attempt mean, and what the next one takes (a Step-by-step run has its own rule).
          (learn ? '' : `<p class="rdn-r-msg">${e(t('rdn_r_s' + stars))}</p>`) +
          `<div class="rdn-res">${cells.map(([v, l]) => `<div><b>${e(v)}</b><span>${e(l)}</span></div>`).join('')}</div></div>` +
          `<div class="rdn-row"><button type="button" class="btn" id="rdn-retry">${e(t('rdn_retry'))}</button>` +
          `<button type="button" class="btn" id="rdn-listen">${e(t('rdn_listen'))}</button>` +
          `<button type="button" class="btn primary" id="rdn-r-next">${e(t('rdn_next_btn'))}</button>` +
          `<label class="rdn-check-pref"><input type="checkbox" id="rdn-autonext"${auto ? ' checked' : ''}> <span>${e(t('rdn_autonext'))}</span></label></div>` +
          `<div class="rdn-auto" id="rdn-auto" hidden><span id="rdn-auto-t" aria-hidden="true"></span><span class="visually-hidden" id="rdn-auto-say" aria-live="polite"></span>` +
          `<button type="button" class="btn ghost" id="rdn-auto-cancel">${e(t('rdn_cancel'))}</button></div>`;
      box.hidden = false;
      rdnVerdictShown(false);
      rdnNavUi();
      // Auto-next waits until a first-sight result is saved (see srtSetState): its save is still running, or failed.
      const state = SR.srtState, unsaved = state?.mode === 'firstSight' && !!state.attemptId && state.name !== 'saved';
      if (startAuto && auto && stars >= 1) {
          if (unsaved || srtPendingSaveProtected())
              RDN.autoWait = true;
          else
              rdnAutoStart();
      }
      else if (RDN.autoTimer)
          rdnAutoShow();
      // Focus that was lost (on the page, or on a control that went away) goes to Next; a control the reader is on keeps it.
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active === document.body || !active.getClientRects().length)
          byId('rdn-r-next').focus({ preventScroll: true });
  }
  /** Auto-next: the reader's choice once made; until then it is on while a MIDI or Bluetooth piano is connected. */
  function rdnAutoNextOn() {
      const pref = rdData().prefs.autoNext;
      return pref === undefined ? midiLive() : !!pref;
  }
  function rdnAutoShow() {
      const row = maybeById('rdn-auto'), text = maybeById('rdn-auto-t'), say = maybeById('rdn-auto-say');
      if (row)
          row.hidden = !RDN.autoTimer;
      if (text)
          text.textContent = RDN.autoTimer ? t('rdn_auto_in', RDN.autoLeft) : '';
      // Announced once: the number that counts down is not a live region.
      if (say && (!RDN.autoTimer || RDN.autoLeft === 3))
          say.textContent = RDN.autoTimer ? t('rdn_auto_say', RDN.autoLeft) : '';
  }
  /** After a first-sight result was saved: the auto-next that waited for it starts. */
  function rdnAutoAfterSave() {
      if (!RDN.autoWait)
          return;
      RDN.autoWait = false;
      if (RDN.screen === 'player' && SR.lvPiece && !maybeById('rdn-result')?.hidden && rdnAutoNextOn())
          rdnAutoStart();
  }
  function rdnAutoStart() {
      rdnAutoCancel();
      RDN.autoLeft = 3;
      RDN.autoTimer = window.setInterval(() => {
          RDN.autoLeft--;
          if (RDN.autoLeft <= 0) {
              rdnAutoCancel();
              // A connected piano can start the next assessment on its first note.
              rdnStep(1, !midiLive());
              return;
          }
          rdnAutoShow();
      }, 1000);
      rdnAutoShow();
  }
  function rdnAutoCancel() {
      if (RDN.autoTimer)
          window.clearInterval(RDN.autoTimer);
      RDN.autoTimer = 0;
      RDN.autoWait = false;
      rdnAutoShow();
  }
  function rdnRetry() {
      rdnAutoCancel();
      srGo();
  }
  /* ---------- COACHING: one short tip per surface, chosen from what is on screen and how the last attempt went ----------
     Read & play keeps a "Reading focus" line under the score (piece, mode, hands and the slips made so far) that becomes a
     "Next step" when a run ends; reading drills get a focus line for the drill type and a next step in their summary; Score &
     analysis gets "What to notice" in Now and a next step in the practice summary. A tip keeps the facts it was chosen from
     and is re-worded after a language or notation change. */
  // tf, coachList, coachText and coachHTML come from the shell coaching module (src/app/coaching.ts), created with the helpers.
  /* Read & play */
  const srStepNo = (n: { oct: number; li: number; }) => n.oct * 7 + n.li;
  function srKeyNames(keyN: number) { return (keyN > 0 ? [3, 0, 4, 1, 5, 2, 6] : [6, 2, 5, 1, 4, 0, 3]).slice(0, Math.abs(keyN)).map((li) => spelledName(host.i18n.notation(), li, keyN > 0 ? 1 : -1)); }
  // The active hands as onsets per hand: melodic moves, leaps (a third or wider), chords, and whether the rhythm goes beyond whole beats.
  function srShape() {
      const sel = srActiveHands(), f = { moves: 0, leaps: 0, chords: 0, hands: 0, rhythm: false };
      ['rh', 'lh'].forEach((h) => {
          if (sel !== 'both' && sel !== h)
              return;
          const by = new Map<string, SrStaffNote[]>();
          SR.notes.forEach((n: SrStaffNote) => { if (n.hand !== h)
              return; const k = n.beat.toFixed(3); if (!by.has(k))
              by.set(k, []); by.get(k)?.push(n); });
          if (!by.size)
              return;
          f.hands++;
          let prev: SrStaffNote[] | null = null;
          [...by.values()].sort((a, b) => a[0].beat - b[0].beat).forEach((g) => {
              if (g.length > 1)
                  f.chords++;
              else if (prev && prev.length === 1) {
                  f.moves++;
                  if (Math.abs(srStepNo(g[0]) - srStepNo(prev[0])) >= 2)
                      f.leaps++;
              }
              if (g.some((n) => n.dur % 1))
                  f.rhythm = true;
              prev = g;
          });
      });
      return f;
  }
  // A wrong key in Step by step: the right note in another octave, the natural instead of a sharp or flat, a slip inside a chord,
  // the wrong way from the previous note, or the right way but the wrong distance.
  // What kind of slip it was (oct, key, chord, other, dir or dist), the note that was wanted and the key played.
  function srSlip(st: { notes: readonly SrStaffNote[]; }, m: number): SrSlip | null {
      const want = st.notes.filter((n) => !SR.hit.has(n.nid));
      if (!want.length)
          return null;
      const n = want.reduce((a, b) => Math.abs(b.midi - m) < Math.abs(a.midi - m) ? b : a);
      if (pc(n.midi) === pc(m))
          return { k: 'oct', n, m };
      if (n.acc && m === n.midi - n.acc)
          return { k: 'key', n, m };
      if (st.notes.filter((x) => x.hand === n.hand).length > 1)
          return { k: 'chord', n, m };
      const prev: SrStaffNote[] = (SR.steps[SR.stepIdx - 1] || { notes: [] }).notes.filter((x: SrStaffNote) => x.hand === n.hand);
      if (!prev.length)
          return { k: 'other', n, m };
      const p = prev.reduce((a: SrStaffNote, b: SrStaffNote) => Math.abs(b.midi - n.midi) < Math.abs(a.midi - n.midi) ? b : a);
      return { k: Math.sign(n.midi - p.midi) !== Math.sign(m - p.midi) ? 'dir' : 'dist', n, m };
  }
  function srSlipNote(st: { notes: readonly SrStaffNote[]; }, m: number) { const s = srSlip(st, m); if (!s)
      return; const E = SR.errs || (SR.errs = {}); E[s.k] = (E[s.k] || 0) + 1; if (s.k === 'key')
      SR.slipKey = s; srCoach(); }
  function srTopSlip() { const E = SR.errs || {}; let top: string|null = null; for (const k of ['key', 'oct', 'chord', 'dir', 'dist']) {
      if ((E[k] || 0) >= 2 && (!top || E[k] > E[top]))
          top = k;
  } return top; }
  const srSlipNames = (s: SrSlip) => [rdLetter(s.n.li), spelledName(host.i18n.notation(), s.n.li, s.n.acc)];
   // what was played (the natural), what is written
  // Reading focus: the slip being repeated right now, else what this piece asks for in this mode.
  function srFocus(): CoachTip | null {
      const p = SR.piece;
      if (!p)
          return null;
      if (SR.modeSel === 'assess')
          return { k: srShape().rhythm ? 'rc_rhythm' : 'rc_ahead' };
      const top = SR.active && srTopSlip();
      if (top === 'key' && SR.slipKey) {
          const s = SR.slipKey;
          return { k: 'rc_e_key', args: () => srSlipNames(s) };
      }
      if (top)
          return { k: 'rc_e_' + top };
      const f = srShape();
      if (f.chords)
          return { k: 'rc_chord' };
      if (p.keyN)
          return { k: 'rc_key', args: () => [srKeyNames(p.keyN).join(' ')] };
      if (f.hands > 1)
          return { k: 'rc_hands' };
      if (f.moves && f.leaps / f.moves >= .3)
          return { k: 'rc_iv' };
      return { k: 'rc_dir' };
  }
  function srNextLearn(): CoachTip {
      const E = SR.errs || {}, top = srTopSlip();
      if (!SR.mistakes)
          return { k: 'rn_clean', act: { k: 'rn_act_assess', run: () => srSetMode('assess') } };
      if (top === 'key' && SR.slipKey) {
          const s = SR.slipKey;
          return { k: 'rn_key', args: () => srSlipNames(s) };
      }
      if (top)
          return { k: 'rn_' + top, args: () => [E[top]] };
      return { k: 'rn_again' };
  }
  // After Assessment: the score, extra notes, and where the misses were — leaps, chords or altered notes — compared with the rest.
  function srNextAssess(pct: number): CoachTip | null {
      const p = SR.piece;
      if (!p)
          return null;
      const bpm = SR.bpm, bad = (n: SrStaffNote) => SR.results[n.nid] !== 'good';
      if (pct >= 95)
          return bpm <= 150 ? { k: 'rn_a_clean', args: () => [pct, bpm + 10], act: { k: 'rn_act_bpm', args: () => [bpm + 10], run: () => srSetBpm(bpm + 10) } } : { k: 'rn_a_top' };
      const cat = { leaps: [0, 0], chords: [0, 0], acc: [0, 0] }, last: { rh?: SrStaffNote[]; lh?: SrStaffNote[]; } = {};
      let all = 0, miss = 0;
      SR.steps.forEach((st: { notes: readonly SrStaffNote[]; }) => (['rh', 'lh'] as const).forEach((h) => {
          const g = st.notes.filter((n) => n.hand === h);
          if (!g.length)
              return;
          const prev = last[h];
          last[h] = g;
          g.forEach((n) => {
              const b = bad(n) ? 1 : 0;
              all++;
              miss += b;
              if (g.length > 1) {
                  cat.chords[0] += b;
                  cat.chords[1]++;
              }
              else if (prev && prev.length === 1 && Math.abs(srStepNo(n) - srStepNo(prev[0])) >= 2) {
                  cat.leaps[0] += b;
                  cat.leaps[1]++;
              }
              if (n.acc) {
                  cat.acc[0] += b;
                  cat.acc[1]++;
              }
          });
      }));
      if (SR.wrongExtra >= 3 && SR.wrongExtra >= miss)
          return { k: 'rn_a_extra', args: () => [SR.wrongExtra] };
      const rate = miss / Math.max(1, all);
      let top: string | null = null, best = 0;
      for (const [k, [b, n]] of Object.entries(cat)) {
          const r = n ? b / n : 0;
          if (b >= 2 && r >= Math.max(.34, rate * 1.5) && r > best) {
              top = k;
              best = r;
          }
      }
      if (top)
          return { k: 'rn_a_' + top };
      if (pct < 80) {
          const v = Math.max(40, bpm - 10);
          return { k: 'rn_a_slow', args: () => [v], act: { k: 'rn_act_bpm', args: () => [v], run: () => srSetBpm(v) } };
      }
      return { k: 'rn_a_good' };
  }
  const srModeControls = ['rd-mode', 'rd-stage-mode'] as const;
  function srModeUi() {
      for (const id of srModeControls) {
          for (const button of byId(id).querySelectorAll('button'))
              button.setAttribute('aria-pressed', String(button.dataset.v === SR.modeSel));
      }
      syncMobileStartBars();
  }
  function srSetMode(v: string) {
      if (srtPendingSaveProtected())
          return;
      const changed = SR.modeSel !== v;
      SR.modeSel = v;
      if (SR.lvPiece)
          RDN.playerMode = v;
      srModeUi();
      srStopAll();
      if (changed)
          rdnResultHide();
      const practiceOnly = v === 'assess' && srtGeneratedSelected() &&
          (SR.srtState?.mode === 'practice' || SR.srtState?.name === 'abandoned' || SR.srtState?.name === 'interrupted');
      if (v === 'learn' && srtGeneratedSelected())
          srtConsumeOnLearnReveal();
      srDraw();
      byId('rd-verdict').textContent = '';
      if (practiceOnly) {
          const message = t('rd_srt_error_already_exposed');
          srtNotice(message);
          byId('rd-verdict').className = 'verdict neutral';
          byId('rd-verdict').textContent = message;
      }
      byId('rd-go').focus();
  }
  function srSetBpm(v: number) { if (srtPendingSaveProtected() || SR.active || SR.listening)
      return; const b = inputById('rd-bpm'); b.value = String(v); byId('rd-bpmLbl').textContent = String(v); SR.bpm = v; SR.next = null; srCoach(); syncMobileStartBars(); byId('rd-go').focus(); }
  // The HTML each coach box last showed.
  const srCoachShown = new WeakMap<HTMLElement, string>();
  // One line under the score; it is a polite live region, so it is only rewritten when the tip itself changes.
  function srCoach() {
      const box = byId('rd-coach');
      if (!box)
          return;
      const c = SR.piece ? (SR.next || srFocus()) : null, html = c ? coachHTML(t(SR.next ? 'coach_next' : 'coach_focus'), c, 'rd-coach-act') : '';
      box.dataset.kind = SR.next ? 'next' : 'focus';
      if (srCoachShown.get(box) !== html) {
          srCoachShown.set(box, html);
          box.innerHTML = html;
      }
  }
  /* Reading drills */
  function rdFocus(L: ReadDrillLevel | null): CoachTip | null {
      if (!L)
          return null;
      const x = rdLetter, c = L.clef;
      if (L.ty === 'rh')
          return { k: 'rdc_rh' };
      if (L.ty === 'iv')
          return { k: 'rdc_iv' };
      if (L.ty === 'ch')
          return { k: L.inv ? 'rdc_chinv' : 'rdc_ch' };
      if (L.ty === 'ks')
          return { k: 'rdc_ks' };
      if (L.ty === 'sr')
          return { k: 'rc_ahead' };
      if (L.ty === 'k2s')
          return { k: 'rdc_k2s' };
      if (L.tag === 'land')
          return { k: 'rdc_land' };
      if ((L.tag === 'lines' || L.tag === 'spaces') && L.set)
          return { k: 'rdc_' + L.tag, args: () => [(L.set ?? []).map((s) => rdName(rdP(s))).join(' ')] };
      if (L.tag === 'ledup' || L.tag === 'leddn')
          return { k: 'rdc_ledger' };
      if (L.keys)
          return { k: 'rdc_keys' };
      if (L.acc)
          return { k: 'rdc_acc' };
      if (c === 'mix')
          return { k: 'rdc_mix' };
      if (c === 'alto' || c === 'tenor')
          return { k: 'rdc_cc', args: () => [x(0)] };
      if (L.ty === 'play')
          return { k: 'rdc_play' };
      if (c === 'grand')
          return { k: 'rdc_gr', args: () => [x(0)] };
      return c === 'bass' ? { k: 'rdc_ba', args: () => [x(3), x(0), x(4)] } : { k: 'rdc_tr', args: () => [x(0), x(4), x(3)] };
  }
  function rdCoach(show: boolean) { const box = byId('rdx-coach'); if (!box)
      return; const c = show ? rdFocus(RD.L) : null; box.hidden = !c; box.innerHTML = c ? coachHTML(t('coach_focus'), c) : ''; }
  // The session's next step: accuracy first, then the notes missed most, then speed; rhythm drills look at the average timing.
  function rdNextStep(L: ReadDrillLevel, mode: string, acc: number, avg: number, stars: number, weak: readonly [string, number][]): CoachTip | null {
      if (L.ty === 'rh') {
          const m: number[] = RD.rhM || [], mean = m.length ? m.reduce((a, b) => a + b, 0) / m.length : 0;
          if (acc < 60)
              return { k: 'rdn_rh_low' };
          if (mean < -35)
              return { k: 'rdn_rh_rush', args: () => [Math.round(-mean)] };
          if (mean > 35)
              return { k: 'rdn_rh_drag', args: () => [Math.round(mean)] };
          return { k: 'rdn_rh_ok' };
      }
      if (!RD.n)
          return null;
      const tg = rdTarget(L) / 1000, sec = avg / 1000, timeAttack = { k: 'rdx_m_timeAttack', run: () => rdStart('timeAttack') };
      // A Survival run lost to the clock needs speed, not hints: timeouts also count against accuracy.
      if (mode === 'survival' && RD.arc && RD.arc.timeouts >= 2)
          return { k: 'rdn_sv_time', act: timeAttack };
      if (acc < 80)
          return { k: 'rdn_hints', act: { k: 'rdn_act_hints', run: () => { rdData().prefs.hints = true; saveAll(); rdStart('practice'); } } };
      if (weak.length && acc < 95)
          return { k: 'rdn_weak', args: () => [weak.slice(0, 3).map(([k]) => rdKeyText(k)).join(', ')], act: mode === 'practice' ? null : { k: 'rdn_act_practice', run: () => rdStart('practice') } };
      if (mode === 'timeAttack' && RD.arc && RD.arc.bestCombo < ARCADE_STREAK)
          return { k: 'rdn_ta' };
      if (sec > tg)
          return { k: 'rdn_speed', args: () => [anNum(sec, 1), anNum(tg, 1)], act: timeAttack };
      if (srtIsArcadeMode(mode))
          return { k: 'rdn_ok' };
      if (mode === 'practice' && RD.chkBest === null)
          return { k: 'rdn_chk', args: () => [RD_CHECK_N] };
      if (stars < 3)
          return { k: 'rdn_star', args: () => [stars >= 2 ? 95 : 90, anNum(stars >= 2 ? tg : tg * 1.6, 1)] };
      const nx = rdLvNext(L);
      if (!L.custom && nx)
          return { k: 'rdn_next', args: () => [rdLvName(nx)] };
      return { k: 'rdn_ok' };
  }
  function rdNextRender() { const box = maybeById('rdx-next'); if (box && RD.next)
      box.innerHTML = coachHTML(t('coach_next'), RD.next, 'rdx-next-act'); }
  function collectPracticeReport(buildReport: typeof buildPracticeReport, libraryItems: readonly LibraryItem[] = []) {
      const tn = todayN();
      const book = rdnBook();
      const tally = srtBookTally(book, book.level);
      const rd = rdData();
      const stars = RD_ALL.reduce((sum, level) => sum + rdStarCount(rd.lv[level.id]?.s), 0);
      const pieces: PracticeReportPieceInput[] = [];
      for (const piece of PIECES) {
          const rec = host.store.data().sheet[piece.id];
          if (rec && (rec.learned || rec.best)) {
              pieces.push({
                  title: srPieceTitle(piece),
                  source: 'builtin',
                  learned: !!rec.learned,
                  bestPct: rec.best ? rec.best : null,
              });
          }
      }
      for (const item of libraryItems) {
          const learned = item.status === 'mastered';
          const bestPct = typeof item.best === 'number' ? item.best : null;
          if (learned || bestPct !== null) {
              pieces.push({
                  title: item.title || item.name,
                  source: 'library',
                  learned,
                  bestPct,
              });
          }
      }
      return buildReport({
          today: tn,
          totalReviews: host.store.data().totalReviews || 0,
          totalCorrect: host.store.data().totalCorrect || 0,
          streak: currentStreak(),
          bestStreak: host.store.data().bestStreak || 0,
          mastered: masteredCount(),
          totalItems: ITEMS.length,
          srs: host.store.data().srs,
          history: host.store.data().history || {},
          items: ITEMS,
          categories: Object.keys(CATS),
          catLabel: shell.catLabel,
          itemLabel: (it) => {
              const full = ITEMS.find((candidate) => candidate.id === it.id);
              return full ? itemLabel(full) : it.id;
          },
          reading: {
              bookLevel: book.level,
              bookDone: tally.done,
              bookTotal: SRT_BOOK_PIECES,
              piecesRead: srtPiecesRead(book),
              drillAnswers: rd.tot.n,
              drillCorrect: rd.tot.ok,
              stars,
          },
          pieces,
          lessonsDone: shell.learnLessonsDone(),
      });
  }

  function wiringDisabled(b: HTMLElement): boolean { return b instanceof HTMLButtonElement && b.disabled; }
  function wiringInput(e: Event): HTMLInputElement {
      const el = e.target;
      if (el instanceof HTMLInputElement)
          return el;
      throw new Error('Étude: expected an <input> event target');
  }
  /* ---------- feature controller ---------- */
  let mounted = false;
  function mount(): void {
    if (mounted) return;
    mounted = true;
    reflectSettings();
    (function rdInit() {
        const dr = byId('rdp-drills');
        if (!dr)
            return;
        byId('rd-tabs').addEventListener('click', (e) => { const b = eventClosest(e, '[data-tab]'); if (b) {
            rdTab(b.dataset.tab);
            saveAll();
        } });
        byId('rd-tabs').addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End')
                return;
            const tabs = queryAllHtml(byId('rd-tabs'), '[role=tab]'), fe = document.activeElement, i = fe instanceof HTMLElement ? tabs.indexOf(fe) : -1;
            if (i < 0)
                return;
            e.preventDefault();
            const n = e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
            n.focus();
            rdTab(n.dataset.tab);
        });
        dr.addEventListener('click', (e) => {
            const cat = eventClosest(e, '#rdx-filters [data-cat]');
            if (cat) {
                rdxFilter = cat.dataset.cat ?? 'all';
                rdRenderHome();
                return;
            }
            const lv = eventClosest(e, '[data-lv]');
            if (lv) {
                const L = RD_LV[lv.dataset.lv ?? ''];
                if (!L)
                    return;
                rdOpen(L);
                return;
            }
            if (eventClosest(e, '#rdx-chal')) {
                const open = byId('rdx-chal').getAttribute('aria-expanded') !== 'true';
                rdChalOpen(open, open ? 'first' : undefined);
                return;
            }
            const md = eventClosest(e, '[data-mode]');
            if (md) {
                rdStart(md.dataset.mode ?? '', Number(md.dataset.bars) || undefined);
                return;
            }
            const a = eventClosest(e, '.rdx-a');
            if (a) {
                rdClickAns(a);
                return;
            }
            const ac = eventClosest(e, '[data-acc]');
            if (ac) {
                RD.accSel = Number(ac.dataset.acc);
                ac.parentNode?.querySelectorAll('[data-acc]').forEach((x) => x.setAttribute('aria-pressed', x === ac ? 'true' : 'false'));
                return;
            }
            if (eventClosest(e, '#rdx-next-act')) {
                if (RD.next && RD.next.act)
                    RD.next.act.run();
                return;
            }
            const act = eventClosest(e, '[data-act]');
            if (act) {
                const k = act.dataset.act;
                if (k === 'again')
                    rdStart(RD.mode);
                else if (k === 'next') {
                    const nx = RD.L && rdLvNext(RD.L);
                    if (nx)
                        rdOpen(nx);
                }
                else if (k === 'levels')
                    rdBack();
                else if (k === 'rhnew')
                    rdRhNew();
                else if (k === 'rhagain')
                    rdRhNew(true);
                return;
            }
            const hb = eventClosest(e, '[data-hands]');
            if (hb) {
                if ((hb instanceof HTMLButtonElement && hb.disabled) || (RD.rh && RD.rh.playing))
                    return;
                rdData().prefs.rhHands = Number(hb.dataset.hands) === 2 ? 2 : 1;
                saveAll();
                rdRhNew(true);
                return;
            }
            const b = eventClosest(e, 'button'), id = b && b.id;
            if (id === 'rdx-back')
                rdBack();
            else if (id === 'rdx-end')
                rdEndClick();
            else if (id === 'rdx-hear' && RD.q)
                rdSound(RD.q.midis, RD.q.ty === 'iv' && !RD.q.harm);
            else if (id === 'rdx-hintb')
                rdHint();
            else if (id === 'rdx-rhgo')
                void rdRhRun(false);
            else if (id === 'rdx-rhlisten')
                void rdRhRun(true);
            else if (b && b.classList.contains('rdx-tap') && e.detail === 0)
                rdTap(b.dataset.hand);
            else if (id === 'rdx-c-go')
                rdCustomGo();
        });
        dr.addEventListener('keydown', rdChalKey);
        // A press outside the Challenge menu closes it.
        document.addEventListener('pointerdown', (e) => { const m = maybeById('rdx-chal-menu'); if (m && !m.hidden && !eventClosest(e, '#rdx-chal, #rdx-chal-menu'))
            rdChalOpen(false); });
        dr.addEventListener('pointerdown', (e) => {
            const pad = eventClosest(e, '.rdx-tap');
            if (pad) {
                e.preventDefault();
                touchInput(e, () => rdRhPress('p' + e.pointerId, pad.dataset.hand || 'R'));
            }
        });
        const up = (e: PointerEvent) => { touchInput(e, () => rdRhRelease('p' + e.pointerId)); };
        document.addEventListener('pointerup', up);
        document.addEventListener('pointercancel', up);
        document.addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); if (k === ' ' || k === 'enter' || k === 'f' || k === 'j')
            rdRhRelease('k:' + k); });
        dr.addEventListener('change', (e) => {
            const el = e.target, id = el instanceof HTMLElement ? el.id : '', checked = el instanceof HTMLInputElement && el.checked, p = rdData().prefs;
            if (id === 'rdx-show-orch') {
                rdxShowOrch = checked;
                rdRenderHome();
                return;
            }
            if (id === 'rdx-snd') {
                p.sound = checked;
                saveAll();
            }
            else if (id === 'rdx-hints') {
                p.hints = checked;
                saveAll();
            }
            else if (id === 'rdx-flow') {
                p.flow = checked;
                saveAll();
                const g = maybeById('rdx-ghost');
                if (g instanceof HTMLInputElement)
                    g.disabled = !checked;
            }
            else if (id === 'rdx-ghost') {
                p.ghost = checked;
                saveAll();
            }
            else if (id === 'rdx-stage-pref') {
                p.stage = checked;
                saveAll();
            }
            else if (id === 'rdx-weak-inject')
                setWeakSpotInjection(checked);
            else if (id === 'rdx-rhdur') {
                if (RD.rh && RD.rh.playing) {
                    if (el instanceof HTMLInputElement)
                        el.checked = !checked;
                    return;
                }
                p.rhDur = checked;
                saveAll();
                rdRhNew(true);
            }
            else if (id === 'rdx-c-clef') {
                const d = RD_CDEF[el instanceof HTMLSelectElement ? el.value : ''];
                selectById('rdx-c-lo').value = d[0];
                selectById('rdx-c-hi').value = d[1];
                rdCustomRead();
            }
            else if (/^rdx-c-/.test(id))
                rdCustomRead();
        });
        byId('rdx-stats').addEventListener('click', async (e) => { if (eventElement(e)?.id === 'rdx-reset' && await appConfirm(t('rdx_reset_q'))) {
            const d = rdData();
            d.nt = {};
            d.tot = { n: 0, ok: 0, ms: 0, sess: 0 };
            saveAll();
            rdRenderStats();
        } });
        const g = byId('rd-gen');
        if (g)
            g.addEventListener('click', rdGenMelody);
    })();
    (function rdnInit() {
        const home = maybeById('rdn-home');
        if (!home)
            return;
        home.addEventListener('click', rdnHomeClick);
        byId('rdn-back').addEventListener('click', () => rdnHome(true));
        byId('rdn-w-back').addEventListener('click', () => rdnHome(true));
        byId('rdn-w-flash').addEventListener('click', rdnWarmFlashClick);
        byId('rdn-prev').addEventListener('click', () => rdnStep(-1));
        byId('rdn-next').addEventListener('click', () => rdnStep(1));
        byId('rd-stage-next').addEventListener('click', () => rdnStep(1));
        // Any other control of the player stops the auto-next countdown (the result card's and the unsaved result's buttons
        // handle it themselves).
        const read = byId('view-read'), stopAuto = (e: Event) => {
            if (!RDN.autoTimer && !RDN.autoWait)
                return;
            const el = e.target instanceof Element ? e.target.closest('button, input, select, summary, label, [role=button]') : null;
            // Retry save keeps a waiting auto-next: it starts once the result is saved.
            if (el && !el.closest('#rdn-result, #rd-srt-pending'))
                rdnAutoCancel();
        };
        read.addEventListener('click', stopAuto, true);
        read.addEventListener('input', stopAuto, true);
        read.addEventListener('change', stopAuto, true);
        const result = byId('rdn-result');
        result.addEventListener('click', (e) => {
            const id = eventClosest(e, 'button')?.id;
            if (id === 'rdn-retry')
                rdnRetry();
            else if (id === 'rdn-listen') {
                rdnAutoCancel();
                srListen();
            }
            else if (id === 'rdn-r-next')
                rdnStep(1);
            else if (id === 'rdn-auto-cancel')
                rdnAutoCancel();
        });
        result.addEventListener('change', (e) => {
            const el = e.target;
            if (!(el instanceof HTMLInputElement) || el.id !== 'rdn-autonext')
                return;
            rdData().prefs.autoNext = el.checked;
            saveAll();
            if (!el.checked)
                rdnAutoCancel();
        });
    })();
    // Language or note names changed: re-word every tip on show.
    shell.registerCoach(() => srCoach());
    shell.registerCoach(() => { if (RD.L && !byId('rdx-coach').hidden)
        rdCoach(true); });
    shell.registerCoach(() => rdNextRender());
      // read & play (sheet music)
      byId('rd-to-pieces').addEventListener('click', () => host.nav.show('analysis'));
      const onHandsClick = (e: MouseEvent) => {
          const b = eventClosest(e, 'button');
          if (!b || wiringDisabled(b) || srtPendingSaveProtected())
              return;
          const v = b.dataset.v ?? SR.hands;
          SR.hands = v;
          [byId('rd-hands'), maybeById('rd-stage-hands')].forEach((container) => {
              if (!container)
                  return;
              [...container.children].forEach((x) => {
                  if (x instanceof HTMLElement)
                      x.setAttribute('aria-pressed', x.dataset.v === v ? 'true' : 'false');
              });
          });
          rdnHandsHint();
          if (!SR.piece)
              return; // no melody yet: the choice applies to the next one
          const staffEl = maybeById('rd-staff');
          if (staffEl)
              staffEl.dataset.activeHand = srActiveHands();
          srStopAll();
          srStepsBuild();
          srPaintAll();
          srTargets();
          srCoach();
          byId('rd-verdict').textContent = '';
      };
      byId('rd-hands').addEventListener('click', onHandsClick);
      maybeById('rd-stage-hands')?.addEventListener('click', onHandsClick);
      for (const id of srModeControls) {
          byId(id).addEventListener('click', (e) => {
              const mode = eventClosest(e, 'button')?.dataset.v;
              if (mode === 'learn' || mode === 'assess')
                  srSetMode(mode);
          });
      }
      byId('rd-names').addEventListener('change', (e) => {
          if (srtPendingSaveProtected()) {
              wiringInput(e).checked = SR.names;
              return;
          }
          SR.names = wiringInput(e).checked;
          if (srtEligibleFirstSightActive()) {
              srDraw();
              return;
          }
          srStopAll();
          srDraw();
      });
      maybeById('rd-any-octave')?.addEventListener('change', (e) => {
          const checked = wiringInput(e).checked;
          host.store.data().settings.anyOctave = checked;
          SR.anyOctave = checked;
          if (SR.active && SR.modeSel === 'assess' && SR.instantFeedback) {
              const nowMs = performance.now() - SR.t0;
              srInstantTracker = createInstantFeedbackTracker(srInstantNotes().filter((n) => SR.results[n.nid] === undefined && n.onMs >= nowMs - 250), { anyOctave: checked });
          }
          const setOct = maybeById('set-any-octave');
          if (setOct instanceof HTMLInputElement)
              setOct.checked = checked;
          saveAll();
      });
      maybeById('rd-instant')?.addEventListener('change', (e) => {
          const checked = wiringInput(e).checked;
          rdData().prefs.instantFeedback = checked;
          SR.instantFeedback = checked;
          if (SR.active && SR.modeSel === 'assess') {
              if (checked) {
                  const nowMs = performance.now() - SR.t0;
                  srInstantTracker = createInstantFeedbackTracker(srInstantNotes().filter((n) => SR.results[n.nid] === undefined && n.onMs >= nowMs - 250), { anyOctave: SR.anyOctave });
              }
              else {
                  srInstantReset();
                  SR.results = {};
                  SR.wrongExtra = 0;
                  srPaintAll();
                  kbClear('good');
                  kbClear('bad');
                  if (SR.assessOn) {
                      const v = byId('rd-verdict');
                      v.className = 'verdict neutral';
                      v.textContent = t('rd_play');
                  }
              }
          }
          saveAll();
      });
      const tempo = inputById('rd-bpm');
      const syncTempo = () => {
          if (srtPendingSaveProtected() || SR.active || SR.listening) {
              tempo.value = String(SR.bpm);
              return;
          }
          SR.bpm = tempo.valueAsNumber;
          byId('rd-bpmLbl').textContent = tempo.value;
          syncMobileStartBars();
      };
      tempo.addEventListener('input', syncTempo);
      byId('rd-bpm-down').addEventListener('click', () => {
          tempo.stepDown();
          syncTempo();
      });
      byId('rd-bpm-up').addEventListener('click', () => {
          tempo.stepUp();
          syncTempo();
      });
      byId('rd-go').addEventListener('click', srGo);
      maybeById('rd-mobile-start')?.addEventListener('click', () => { byId('rd-go').click(); });
      maybeById('rd-stage-end')?.addEventListener('click', () => {
          srGo();
          if (!SR.active)
              byId('rd-go').focus({ preventScroll: true });
      });
      byId('rd-srt-start').addEventListener('click', () => srtStartClaimedAttempt());
      byId('rd-srt-practice').addEventListener('click', () => { void srtSwitchToPractice(); });
      byId('rd-srt-retry').addEventListener('click', () => { void srtRetryPendingSave(); });
      byId('rd-srt-continue').addEventListener('click', srtContinueWithoutSave);
      byId('rd-coach').addEventListener('click', (e) => { if (eventClosest(e, '#rd-coach-act') && SR.next && SR.next.act)
          SR.next.act.run(); });
      byId('rd-listen').addEventListener('click', srListen);
      maybeById('rd-warm-tonic')?.addEventListener('click', rdWarmPlayTonic);
      maybeById('rd-warm-scale')?.addEventListener('click', rdWarmPracticeScale);
      // The sight-reading and rhythm staves are laid out for the size of their paper (see SrLayout).
      if (typeof ResizeObserver === 'function') {
          let fitRaf = 0;
          const fit = new ResizeObserver(() => { cancelAnimationFrame(fitRaf); fitRaf = requestAnimationFrame(() => { srFit(); rdRhFit(); }); });
          ['rd-staff', 'rdx-body', 'dock'].forEach((id) => { const el = maybeById(id); if (el) fit.observe(el); });
      }
  }

  // The saved "Accept any octave" and instant-feedback choices, on mount and whenever Settings are reflected again.
  function reflectSettings(): void {
    const data = host.store.data();
    SR.anyOctave = !!data.settings.anyOctave;
    const rdOct = maybeById('rd-any-octave');
    if (rdOct instanceof HTMLInputElement)
      rdOct.checked = !!data.settings.anyOctave;
    SR.instantFeedback = !!data.reading?.prefs?.instantFeedback;
    const rdInstant = maybeById('rd-instant');
    if (rdInstant instanceof HTMLInputElement)
      rdInstant.checked = SR.instantFeedback;
  }

  function enter(params: Readonly<Record<string, unknown>> | undefined, signal: AbortSignal): void {
    if (signal.aborted) return;
    const keyId = params?.readingKeyId;
    if (typeof keyId === 'string') {
      const match = srtReadingKeys().find((k) => k.id === keyId);
      if (match) rdnChoose(rdnBook().level, match.id);
    }
    renderRead();
    const drillId = params?.readingDrillId;
    if (typeof drillId === 'string') {
      rdTab('drills');
      const drillLevel = RD_LV[drillId];
      if (drillLevel) rdOpen(drillLevel);
    }
  }

  function viewInput(kind: 'on' | 'off', midi: number, lastHeld: number | undefined): boolean {
    if (kind === 'on' && WARM.on && WARM.phase === 'play') {
      rdnWarmNote(midi);
      return true;
    }
    if (RD.on && RD.L && RD.L.ty === 'rh') {
      if (midi != null)
        rdRhKey(kind, midi);
      return true;
    }
    if (RD.on && kind === 'on') {
      if (lastHeld != null)
        rdInput(lastHeld);
      return true;
    }
    if (SR.active && kind === 'on') {
      if (lastHeld != null)
        srKeyInput(lastHeld);
      return true;
    }
    return false;
  }

  function preInput(kind: 'on' | 'off', midi: number, source: string, releaseKind: 'physical' | 'focus' | 'reset' | null): boolean {
    // A waiting level piece starts on its first note; the keys played while its first sight is claimed are kept for the recorder.
    if (!(SR.active && srtRecorder) && srNoteStartInput(kind, midi, source, releaseKind))
      return true;
    if (view0() === 'read' && SR.active && SR.modeSel === 'assess' && srtRecorder) {
      const relMs = inputTimeForRelease(releaseKind) - SR.t0;
      srtRecorder.record(kind, midi, source, releaseKind, relMs);
      if (kind === 'on' && SR.instantFeedback)
        srInstantHandleNote(midi, relMs);
    }
    return false;
  }

  function registerTestSurface(registry: TestSurfaceRegistry): void {
    registry.define({
      "heldPcs": { get: () => heldPcs },
      "LETTERS": { get: () => LETTERS },
      "RD": { get: () => RD },
      "RD_CDEF": { get: () => RD_CDEF },
      "RD_CHECK_N": { get: () => RD_CHECK_N },
      "RD_CHQ": { get: () => RD_CHQ },
      "RD_CLEFC": { get: () => RD_CLEFC },
      "RD_LH_PAT": { get: () => RD_LH_PAT },
      "RD_LM": { get: () => RD_LM },
      "RD_MAJ": { get: () => RD_MAJ },
      "RD_MIN": { get: () => RD_MIN },
      "RD_REF": { get: () => RD_REF },
      "RD_RHU": { get: () => RD_RHU },
      "RD_TARGET": { get: () => RD_TARGET },
      "rdAbort": { get: () => rdAbort },
      "rdAccSym": { get: () => rdAccSym },
      "rdAgg": { get: () => rdAgg },
      "rdAnsText": { get: () => rdAnsText },
      "rdAnswer": { get: () => rdAnswer },
      "rdBack": { get: () => rdBack },
      "rdBars": { get: () => rdBars },
      "rdBeatX": { get: () => rdBeatX },
      "rdBtn": { get: () => rdBtn },
      "rdCClef": { get: () => rdCClef },
      "rdChLabel": { get: () => rdChLabel },
      "rdClear": { get: () => rdClear },
      "rdClick": { get: () => rdClick },
      "rdClickAns": { get: () => rdClickAns },
      "rdCoach": { get: () => rdCoach },
      "rdCustomFill": { get: () => rdCustomFill },
      "rdCustomGo": { get: () => rdCustomGo },
      "rdCustomRead": { get: () => rdCustomRead },
      "rdEndClick": { get: () => rdEndClick },
      "rdFeedback": { get: () => rdFeedback },
      "rdFinish": { get: () => rdFinish },
      "rdFocus": { get: () => rdFocus },
      "rdFromStep": { get: () => rdFromStep },
      "rdGen": { get: () => rdGen },
      "rdGenMelody": { get: () => rdGenMelody },
      "rdHeat": { get: () => rdHeat },
      "rdHint": { get: () => rdHint },
      "rdHud": { get: () => rdHud },
      "rdInput": { get: () => rdInput },
      "rdIntro": { get: () => rdIntro },
      "rdIvName": { get: () => rdIvName },
      "rdKey": { get: () => rdKey },
      "rdKeyLabel": { get: () => rdKeyLabel },
      "rdKeyMinor": { get: () => rdKeyMinor },
      "rdKeyText": { get: () => rdKeyText },
      "rdKsSvg": { get: () => rdKsSvg },
      "rdLetter": { get: () => rdLetter },
      "rdLvDetail": { get: () => rdLvDetail },
      "rdLvNext": { get: () => rdLvNext },
      "rdLvSub": { get: () => rdLvSub },
      "rdMidi": { get: () => rdMidi },
      "RDN": { get: () => RDN },
      "RDN_WARM_MS": { get: () => RDN_WARM_MS },
      "rdName": { get: () => rdName },
      "rdnBook": { get: () => rdnBook },
      "rdNext": { get: () => rdNext },
      "rdNextRender": { get: () => rdNextRender },
      "rdNextStep": { get: () => rdNextStep },
      "rdnHome": { get: () => rdnHome },
      "rdNk": { get: () => rdNk },
      "rdnOpen": { get: () => rdnOpen },
      "rdnRecord": { get: () => rdnRecord },
      "rdnRenderHome": { get: () => rdnRenderHome },
      "rdnStep": { get: () => rdnStep },
      "rdnToday": { get: () => rdnToday },
      "rdnWarmupStart": { get: () => rdnWarmupStart },
      "rdOnLocale": { get: () => rdOnLocale },
      "rdOpen": { get: () => rdOpen },
      "rdP": { get: () => rdP },
      "rdPickFrom": { get: () => rdPickFrom },
      "rdPool": { get: () => rdPool },
      "rdQSvg": { get: () => rdQSvg },
      "rdRangeTxt": { get: () => rdRangeTxt },
      "rdRender": { get: () => rdRender },
      "rdRenderHome": { get: () => rdRenderHome },
      "rdRenderStats": { get: () => rdRenderStats },
      "rdRhDone": { get: () => rdRhDone },
      "rdRhFit": { get: () => rdRhFit },
      "rdRhGen": { get: () => rdRhGen },
      "rdRhGenLH": { get: () => rdRhGenLH },
      "rdRhGrade": { get: () => rdRhGrade },
      "rdRhGradeAll": { get: () => rdRhGradeAll },
      "rdRhGradeHand": { get: () => rdRhGradeHand },
      "rdRhHandLine": { get: () => rdRhHandLine },
      "rdRhKey": { get: () => rdRhKey },
      "rdRhMarks": { get: () => rdRhMarks },
      "rdRhNew": { get: () => rdRhNew },
      "rdRhNoteTip": { get: () => rdRhNoteTip },
      "rdRhOptsLock": { get: () => rdRhOptsLock },
      "rdRhPrefs": { get: () => rdRhPrefs },
      "rdRhPress": { get: () => rdRhPress },
      "rdRhRelease": { get: () => rdRhRelease },
      "rdRhRun": { get: () => rdRhRun },
      "rdRhStrokes": { get: () => rdRhStrokes },
      "rdScroll": { get: () => rdScroll },
      "rdSightDone": { get: () => rdSightDone },
      "rdSightGen": { get: () => rdSightGen },
      "rdSightStart": { get: () => rdSightStart },
      "rdSound": { get: () => rdSound },
      "rdSpell": { get: () => rdSpell },
      "rdStars": { get: () => rdStars },
      "rdStart": { get: () => rdStart },
      "rdStat": { get: () => rdStat },
      "rdStep": { get: () => rdStep },
      "rdSuggest": { get: () => rdSuggest },
      "rdSvg": { get: () => rdSvg },
      "rdTab": { get: () => rdTab },
      "rdTap": { get: () => rdTap },
      "rdTarget": { get: () => rdTarget },
      "reduceMotion": { get: () => reduceMotion },
      "renderRead": { get: () => renderRead },
      "SR": { get: () => SR },
      "srActiveHands": { get: () => srActiveHands },
      "srAssessFinish": { get: () => srAssessFinish },
      "srAssessLoop": { get: () => srAssessLoop },
      "srAssessStart": { get: () => srAssessStart },
      "srBeatToX": { get: () => srBeatToX },
      "srClick": { get: () => srClick },
      "srCoach": { get: () => srCoach },
      "srCount": { get: () => srCount },
      "srCursor": { get: () => srCursor },
      "srDraw": { get: () => srDraw },
      "srEmptyUi": { get: () => srEmptyUi },
      "srFit": { get: () => srFit },
      "srFocus": { get: () => srFocus },
      "srGo": { get: () => srGo },
      "srHandsAvail": { get: () => srHandsAvail },
      "srKeyInput": { get: () => srKeyInput },
      "srKeyNames": { get: () => srKeyNames },
      "srLearnFinish": { get: () => srLearnFinish },
      "srLearnStart": { get: () => srLearnStart },
      "srListen": { get: () => srListen },
      "srMeta": { get: () => srMeta },
      "srNextAssess": { get: () => srNextAssess },
      "srNextLearn": { get: () => srNextLearn },
      "srNoteStart": { get: () => srNoteStart },
      "srPaintAll": { get: () => srPaintAll },
      "srPlayGap": { get: () => srPlayGap },
      "srRender": { get: () => srRender },
      "srScrollStep": { get: () => srScrollStep },
      "srScrollX": { get: () => srScrollX },
      "srSelectPiece": { get: () => srSelectPiece },
      "srSetBpm": { get: () => srSetBpm },
      "srSetMode": { get: () => srSetMode },
      "srShape": { get: () => srShape },
      "srShowPiece": { get: () => srShowPiece },
      "srSlip": { get: () => srSlip },
      "srSlipNames": { get: () => srSlipNames },
      "srSlipNote": { get: () => srSlipNote },
      "srStepNo": { get: () => srStepNo },
      "srStepsBuild": { get: () => srStepsBuild },
      "srStopAll": { get: () => srStopAll },
      "srSvg": { get: () => srSvg },
      "srTargets": { get: () => srTargets },
      "srTol": { get: () => srTol },
      "srTopSlip": { get: () => srTopSlip },
      "srtRecorder": { get: () => srtRecorder },
      "srtSetState": { get: () => srtSetState },
      "srtStartClaimedAttempt": { get: () => srtStartClaimedAttempt },
      "srtStartFirstSight": { get: () => srtStartFirstSight },
      "srtStartPractice": { get: () => srtStartPractice },
      "srtSwitchToPractice": { get: () => srtSwitchToPractice },
      "stageSync": { get: () => stageSync },
      "WARM": { get: () => WARM },
      // For tests: the markup the engraver draws for a score, laid out for the Read paper (or a given layout).
      "srRenderScore": { value: (score: SrScore, layout?: SrLayout) => srRender(score, layout ?? srPaper()).svg },
    });
    // Intentionally mutable: a regression test replaces the daily-set chooser in place.
    registry.defineMutable('rdnEnsureDailyOf', () => rdnEnsureDailyOf, (value) => { rdnEnsureDailyOf = value; });
  }

  return {
    mount,
    enter,
    leave: () => { rdnLeaveView(); },
    isBusy: () => SR.active || RD.on,
    onStorageSync: () => { if (view0() === 'read' && !byId('rdn-home').hidden) rdnRenderHome(false); },
    registerTestSurface,
    isPendingSaveProtected: srtPendingSaveProtected,
    isPendingSaveState: () => SR.srtState?.name === 'pendingSave',
    abandonClaim: () => srtAbandonClaim('abandoned', false),
    hasPiece: () => !!SR.piece,
    svg: srSvg,
    firstSightActive: srtEligibleFirstSightActive,
    autoCancel: rdnAutoCancel,
    stageSync,
    stageRefit,
    stageResize,
    key: (e, k) => stageKey(e) || rdKey(e, k) || rdnKey(e),
    trackHeldSource: (source) => {
      if (view0() === 'read' && SR.active && SR.modeSel === 'assess' && srtRecorder && host.overlays.openCount() === 0)
        srtRecorder.trackSource(source, inputTime() - SR.t0);
    },
    preInput,
    viewInput,
    releaseFocus: () => {
      if (RD.rh)
        [...RD.rh.open.keys()].forEach((s) => { if (/^(k:|p\d)/.test(s))
          rdRhRelease(s); });
    },
    panicBegin: () => {
      rdnAutoCancel();
      if (WARM.on) rdnHome();
      if (RD.on && RD.L?.ty !== 'rh') rdAbort();
    },
    panicRecorder: () => {
      srtCancelAttempt('interrupted');
      if (srtRecorder) srtRecorder.releaseAll('reset', performance.now() - SR.t0);
    },
    panicRhythm: rdRhInterrupt,
    panicStopAll: () => srStopAll(true, true),
    stopForNavigation: () => {
      srStopAll(undefined, false, 'navigate');
      rdAbort();
    },
    readySync: rdnReadySync,
    dockView: rdDockView,
    dockPaint: rdDockPaint,
    watchAudioContext: srtWatchAudioContext,
    relocalizePiece: () => {
      if (SR.piece) {
        srMeta();
        if (SR.srtEvaluation && SR.srtState && ['completed', 'pendingSave', 'saved'].includes(SR.srtState.name))
          srRenderAssessResult();
        srPaintAll();
      }
    },
    onNotation: () => {
      if (view0() === 'read' && SR.piece) {
        // Leave the active score and its cursor intact until the assessment ends.
        if (!SR.active && !srtEligibleFirstSightActive()) srDraw();
        srMeta();
      }
    },
    onLocale: rdOnLocale,
    forgetBook: (book) => { if (typeof book === 'object' && book !== null) rdnNormalized.delete(book); },
    reflectSettings,
    releaseRecorder: (kind) => { srtRecorder?.releaseAll(kind, performance.now() - SR.t0); },
    fit: srFit,
    setAnyOctave: (on) => { SR.anyOctave = on; },
    redraw: () => { if (view0() === 'read' && SR.piece) srDraw(); },
    mobileBar: () => ({
      ready: !!SR.piece && !SR.active && !SR.listening,
      summary: `${t(SR.modeSel === 'assess' ? 'rd_m_assess' : 'rd_m_learn')} · ${SR.bpm} BPM`,
    }),
    collectPracticeReport,
    renderStats: rdRenderStats,
  };
}

import type { ReadDrillData, TranslateFn } from '../../domain/views.js';
import { type SrPiece } from '../../domain/score-types.js';
import { byId, maybeById, buttonById } from '../../domain/dom.js';
import { type SightReadingExpected } from '../../sight-reading/model.js';
import { srtLevelFingerprint } from '../../sight-reading/fingerprint.js';
import { srtLevel, srtReadingKey, type ReadingKey, type ReadingPatternId } from '../../sight-reading/levels.js';
import { SRT_BOOK_PIECES, SRT_DAILY_PIECES, SRT_FOCUS_PIECES, SRT_UNIT_PIECES, srtBookPiece, srtBookUnits, srtDailyPiece, srtFocusPiece, srtLongPiece, type BookUnit } from '../../sight-reading/book.js';
import { srtScoredId, srtBookId, srtDailyId, srtFocusId, srtLongId, srtRecordResult, type ReadingBookState } from '../../sight-reading/progress.js';
import { srtLevelDurationMs, srtLevelScore } from '../../sight-reading/score.js';
import { srtMelodyRhythm } from '../../sight-reading/patterns.js';
import type { GeneratedPiece } from '../../sight-reading/rules.js';
import { srtLevelMarkings } from '../../sight-reading/markings.js';
import { srtReadLedger, type SightReadingLedgerOperation, type SightReadingLedgerResult } from '../../sight-reading/ledger.js';
import { SRT_INITIAL_STATE } from '../../sight-reading/flow.js';
import type { ReadShell } from '../../domain/views.js';
import { srtLevelPatterns } from '../../sight-reading/levels.js';
import * as theory from '../../domain/theory.js';

const pc = theory.pitchClass, srKeyName = theory.circleKeyPitchClass, rdSpellMidi = theory.readingSpelling;
import type { SrState, RdnCtx, RdnState, SrtStopReason } from './read-model.js';


/** Shell state and services createReadLevelPlayer reads; values are getters so shell declarations made later resolve on use. */
export interface ReadLevelPlayerDeps {
  readonly shell: ReadShell;
  readonly inField: () => boolean;
  readonly midiLive: () => boolean;
  readonly rdData: () => ReadDrillData;
  readonly rdEsc: (value: string | number | undefined) => string;
  readonly RDN: RdnState;
  readonly rdnBook: () => ReadingBookState;
  readonly rdnCap: (s: string) => string;
  readonly rdnHome: (focus?: boolean) => void;
  readonly rdnKeyName: (key: ReadingKey) => string;
  readonly rdnLevelName: (level: number) => string;
  readonly rdnLongCtx: (state: ReadingBookState, today: string) => RdnCtx;
  readonly rdnPattern: (id: ReadingPatternId) => string;
  readonly rdnSeen: () => ReadonlySet<string>;
  readonly rdnSetBook: (state: ReadingBookState) => void;
  readonly rdnStars: (n: number) => 0 | 1 | 2 | 3;
  readonly rdnToday: () => string;
  readonly rdnUnitLabel: (unit: BookUnit, named: boolean) => string;
  readonly rdnWhenSaved: (then: () => void) => boolean;
  readonly rdStars: (value: number, label?: string) => string;
  readonly rdTab: (tab: string | undefined, screen?: "melody" | "player") => void;
  readonly rdWarmButtonsSync: () => void;
  readonly SR: SrState;
  readonly srCoach: () => void;
  readonly srEmptyUi: () => void;
  readonly srFit: () => void;
  readonly srGo: () => void;
  readonly srMeta: () => void;
  readonly srModeUi: () => void;
  readonly srNoteStartHold: (ms?: number) => void;
  readonly srShowPiece: (piece: SrPiece) => void;
  readonly srStopAll: (keep?: boolean, preserveSrt?: boolean, reason?: SrtStopReason) => void;
  readonly srtNotice: (text: string | null) => void;
  readonly srtPendingSaveProtected: () => boolean;
  readonly srtPendingUi: (show: boolean) => void;
  readonly srtPreviewUi: (show: boolean) => void;
  readonly srtProgressLedgerUpdate: (operation: SightReadingLedgerOperation) => Promise<SightReadingLedgerResult>;
  readonly t: TranslateFn;
  readonly view0: () => string;
}

/* The player of level pieces (Read home book, daily set, focus and long pieces) and its result card with auto-next. */
export function createReadLevelPlayer(deps: ReadLevelPlayerDeps) {
  const { shell } = deps;
    /* ---- the player ---- */
  let rdnScoredBusy = false;
    async function rdnOpenScored(startInFocus?: number) {
      if (rdnScoredBusy || !deps.rdnWhenSaved(() => { void rdnOpenScored(startInFocus); })) return;
      const from = deps.RDN.ctx, screen = deps.RDN.screen, state = deps.rdnBook();
      const level = from?.kind === 'scored' ? from.piece.level : state.level;
      const key = state.focusKey;
      const status = (message: string) => {
          const el = maybeById(screen === 'home' ? 'rdn-scored-status' : 'rdn-p-live');
          if (el) {
              if (screen === 'home') el.hidden = !message;
              el.textContent = message;
          }
      };
      const current = () => deps.view0() === 'read' && deps.RDN.ctx === from && deps.RDN.screen === screen &&
          deps.rdnBook().level === state.level && deps.rdnBook().focusKey === key;
      rdnScoredBusy = true;
      status(deps.t('rdn_scored_loading'));
      try {
          const { srtScoredExercise } = await import('../../sight-reading/scored-exercise.js');
          if (!current()) return;
          const seen = new Set(deps.rdnSeen());
          if (from?.kind === 'scored') seen.add(srtLevelFingerprint(from.piece));
          const result = srtScoredExercise(level, key, crypto.getRandomValues(new Uint32Array(1))[0], seen);
          if (!result) {
              status(deps.t('rdn_scored_error'));
              return;
          }
          status('');
          rdnOpen({ kind: 'scored', piece: result.piece }, screen === 'home' ? 'title' : 'keep', startInFocus);
      }
      catch {
          if (current()) status(deps.t('rdn_scored_error'));
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
      const daily = deps.rdnBook().daily, slot = daily && daily.date === ctx.date ? daily.slots[ctx.slot] : undefined;
      return slot ? srtDailyPiece(ctx.date, slot) : null;
  }
    function rdnHeadText(): { title: string; sub: string } {
      const c = deps.RDN.ctx, p = deps.SR.lvPiece;
      if (!c || !p)
          return { title: '', sub: '' };
      const level = deps.t('rdn_level_head', p.level, deps.rdnLevelName(p.level));
      if (c.kind === 'scored')
          return { title: deps.t('rdn_scored'), sub: level };
      if (c.kind === 'long')
          return { title: c.index ? deps.t('rdn_long_n', c.index + 1) : deps.t('rdn_long'), sub: deps.t('rdn_long_sub', p.bars) + ' · ' + level };
      if (c.kind === 'daily')
          return { title: deps.t('rdn_title_today', c.slot + 1, SRT_DAILY_PIECES), sub: level };
      if (c.kind === 'focus')
          return { title: deps.t('rdn_title_no', c.number, SRT_FOCUS_PIECES), sub: level + ' · ' + deps.rdnKeyName(srtReadingKey(c.key)) };
      // A book piece names its unit but never its key: in a mix, reading the signature is part of the task.
      const unit = srtBookUnits(c.level)[Math.floor((c.number - 1) / SRT_UNIT_PIECES)];
      return { title: deps.t('rdn_title_no', c.number, SRT_BOOK_PIECES), sub: level + ' · ' + deps.t('rdn_unit', unit.index + 1) + ' · ' + deps.rdnUnitLabel(unit, false) };
  }
    function rdnPlayerHead() {
      const h = rdnHeadText(), c = deps.RDN.ctx;
      byId('rdn-p-title').textContent = h.title;
      byId('rdn-p-sub').textContent = h.sub;
      buttonById('rdn-prev').hidden = !c || c.kind === 'daily' || c.kind === 'long' || c.kind === 'scored';
      rdnNavUi();
  }
    /** True while an attempt of the level piece runs: its preview, count-in or playing (or a Step-by-step run). */
  function rdnBusy() {
      const name = deps.SR.srtState?.name;
      return !!deps.SR.lvPiece && (deps.SR.active || name === 'preparing' || name === 'claiming' || name === 'preview' || name === 'countIn' || name === 'playing');
  }
    /** Prev and Next: off during an attempt, so they never abandon it; Prev also off on the first piece and in today's set. */
  function rdnNavUi() {
      const c = deps.RDN.ctx, busy = rdnBusy(), prev = maybeById('rdn-prev'), next = maybeById('rdn-next');
      if (prev instanceof HTMLButtonElement)
          prev.disabled = busy || !c || c.kind === 'daily' || c.kind === 'long' || c.kind === 'scored' || c.number <= 1;
      if (next instanceof HTMLButtonElement)
          next.disabled = busy || !c;
      const stageNext = maybeById('rd-stage-next'), result = maybeById('rdn-result'), retry = maybeById('rdn-retry');
      if (stageNext)
          stageNext.hidden = !c || busy || !result?.hidden;
      if (retry instanceof HTMLButtonElement)
          retry.disabled = deps.srtPendingSaveProtected();
  }
    /** The status line before an attempt: first sight, or practice for a piece already seen. */
  function rdnReadyText() {
      const note = deps.midiLive() ? '_note' : '';
      return deps.t((deps.SR.srtState?.mode === 'practice' ? 'rdn_seen' : 'rdn_ready') + note);
  }
    /** The status line again, when it still shows: after a language change, or a piano that connected or went away. */
  function rdnReadySync() {
      const v = maybeById('rd-verdict');
      if (v && deps.RDN.screen === 'player' && deps.SR.lvPiece && deps.RDN.ready && v.textContent === deps.RDN.ready)
          v.textContent = deps.RDN.ready = rdnReadyText();
  }
    /** The hint next to Hands: a level piece's first sight is played with both hands. */
  function rdnHandsHint() {
      const hint = maybeById('rdn-hands-hint'), hands = maybeById('rd-hands');
      if (hint)
          hint.hidden = !deps.SR.lvPiece || !hands || hands.hidden || deps.SR.hands === 'both';
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
      const p = deps.SR.lvPiece, mode = p ? srtLevel(p.level).hands : null;
      const show = !mode || mode === 'oneMoves' || mode === 'together';
      [maybeById('rd-hands'), maybeById('rd-stage-hands')].forEach((c) => { if (c)
          c.hidden = !show; });
      if (!show)
          deps.SR.hands = 'both';
      rdnHandsHint();
  }
    /** Opens a level piece. `focus`: 'title' moves focus to the piece's title (from the home), 'keep' leaves it where it is
   *  (Prev, Next and the arrow keys), unless the focused control went away. */
  function rdnOpen(ctx: RdnCtx, focus: 'title' | 'keep' = 'title', startInFocus?: number) {
      if (!deps.rdnWhenSaved(() => rdnOpen(ctx, focus, startInFocus)))
          return;
      const piece = rdnPieceOf(ctx);
      if (!piece)
          return;
      rdnAutoCancel();
      deps.srStopAll(undefined, false, 'navigate');
      // The old melody screen's mode comes back when the player is left.
      if (!deps.SR.lvPiece && deps.RDN.melodyMode === null)
          deps.RDN.melodyMode = deps.SR.modeSel;
      deps.SR.srtPiece = null;
      deps.SR.lvPiece = piece;
      // A new piece starts with both hands: a one-hand choice does not carry over.
      deps.SR.hands = 'both';
      deps.RDN.ctx = ctx;
      deps.SR.srtFingerprint = srtLevelFingerprint(piece);
      // A piece already seen (an earlier attempt, or Listen) is practice from the start.
      const seen = !!srtReadLedger(localStorage).exposures[deps.SR.srtFingerprint];
      deps.SR.srtState = { ...SRT_INITIAL_STATE, mode: seen ? 'practice' : 'firstSight', fingerprint: deps.SR.srtFingerprint };
      deps.SR.srtPendingAttempt = null;
      deps.SR.srtEvaluation = null;
      deps.SR.srtResultValue = null;
      deps.SR.srtResultLevelId = null;
      deps.srtPreviewUi(false);
      deps.srtPendingUi(false);
      deps.srtNotice(null);
      void deps.srtProgressLedgerUpdate({ type: 'recoverOrphanClaims', generation: srtReadLedger(localStorage).generation });
      deps.SR.gen = rdnDrawable(piece);
      deps.srNoteStartHold();
      deps.rdTab('pieces', 'player');
      deps.SR.modeSel = deps.RDN.playerMode;
      deps.srModeUi();
      rdnResultHide();
      deps.srShowPiece(deps.SR.gen);
      rdnPlayerHead();
      rdnChecklist();
      const v = byId('rd-verdict');
      deps.RDN.ready = '';
      if (!v.textContent) {
          v.className = 'verdict neutral';
          v.textContent = deps.RDN.ready = rdnReadyText();
      }
      window.scrollTo(0, 0);
      // The page is sized by the room under it: laid out again now that everything above the paper is in place.
      deps.srFit();
      const active = document.activeElement;
      if (focus === 'title' || !(active instanceof HTMLElement) || active === document.body || !active.getClientRects().length)
          byId(shell.scoreFocus.owner === 'read' ? 'rd-go' : 'rdn-p-title').focus({ preventScroll: true });
      if (focus === 'keep')
          byId('rdn-p-live').textContent = rdnHeadText().title;
      if (startInFocus === shell.scoreFocus.token && shell.scoreFocus.owner === 'read') {
          byId('rd-go').focus({ preventScroll: true });
          deps.srGo();
      }
  }
    /** Next (+1) or previous (-1) piece. Past the last piece of a run, and after the fifth piece of the day, the home comes back. */
  function rdnStep(dir: 1 | -1, start = dir > 0) {
      const c = deps.RDN.ctx;
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
          next = deps.rdnLongCtx(deps.rdnBook(), c.date);
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
          deps.rdnHome(true);
          return;
      }
      rdnOpen(next, 'keep', startInFocus);
  }
    function rdnKey(e: KeyboardEvent) {
      // A key the page reacts to stops the auto-next countdown (Tab only moves focus).
      if (deps.RDN.autoTimer && e.key !== 'Tab' && deps.view0() === 'read' && deps.RDN.screen === 'player')
          rdnAutoCancel();
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')
          return false;
      if (deps.view0() !== 'read' || deps.RDN.screen !== 'player' || !deps.RDN.ctx || deps.SR.active || deps.SR.listening || deps.inField() || rdnBusy())
          return false;
      if (e.key === 'ArrowLeft' && (deps.RDN.ctx.kind === 'daily' || deps.RDN.ctx.kind === 'long' || deps.RDN.ctx.kind === 'scored' || deps.RDN.ctx.number <= 1))
          return false;
      e.preventDefault();
      rdnStep(e.key === 'ArrowRight' ? 1 : -1);
      return true;
  }
    /** Leaves the level piece without touching the engine (a new melody or piece takes its place). */
  function rdnForgetLevelPiece() {
      deps.SR.lvPiece = null;
      deps.RDN.ctx = null;
      deps.RDN.ready = '';
      rdnAutoCancel();
      rdnResultHide();
      rdnChecklist();
      rdnHandsUi();
      rdnNavUi();
      deps.rdWarmButtonsSync();
      if (deps.RDN.melodyMode !== null) {
          deps.SR.modeSel = deps.RDN.melodyMode;
          deps.RDN.melodyMode = null;
          deps.srModeUi();
      }
  }
    /** Leaves the player: the attempt stops and the pieces panel is empty again, as before any melody. */
  function rdnDropLevelPiece() {
      if (!deps.SR.lvPiece)
          return;
      deps.srStopAll(undefined, false, 'navigate');
      rdnForgetLevelPiece();
      deps.SR.piece = null;
      deps.SR.gen = null;
      deps.SR.srtPiece = null;
      deps.SR.srtFingerprint = null;
      deps.SR.srtState = SRT_INITIAL_STATE;
      deps.SR.srtPendingAttempt = null;
      deps.SR.srtEvaluation = null;
      deps.SR.srtResultValue = null;
      deps.SR.srtResultLevelId = null;
      deps.SR.render = null;
      deps.SR.notes = [];
      deps.SR.steps = [];
      deps.srtPreviewUi(false);
      deps.srtPendingUi(false);
      deps.srtNotice(null);
      byId('rd-staff').innerHTML = '';
      byId('rd-verdict').textContent = '';
      deps.srMeta();
      deps.srEmptyUi();
      deps.srCoach();
  }
    /** The preview checklist: what to look at first, then up to two patterns of the piece (the level's new ones first). */
  function rdnChecklist() {
      const ul = maybeById('rdn-checklist');
      if (!ul)
          return;
      const p = deps.SR.lvPiece;
      // What to look at before the first attempt: gone once an attempt starts, and for a piece already seen.
      ul.hidden = !p || deps.SR.srtState?.mode !== 'firstSight';
      ul.style.visibility = deps.SR.active ? 'hidden' : '';
      if (!p) {
          ul.innerHTML = '';
          return;
      }
      const items = [deps.t('rdn_check_sig'), deps.t('rdn_check_first')];
      const own = srtLevel(p.level).newPatterns, order = [...own, ...srtLevelPatterns(p.level).filter((x) => !own.includes(x))];
      for (const pattern of order) {
          if (items.length >= 4)
              break;
          const bar = p.patterns.findIndex((names) => names.includes(pattern));
          if (bar >= 0)
              items.push(deps.rdnCap(deps.t('rdn_check_pattern', deps.rdnPattern(pattern), bar + 1)));
      }
      // Two bars (before the last, after an upbeat bar) with the same melody rhythm.
      const from = p.upbeat ? 1 : 0, last = p.bars - 1;
      outer: for (let a = from; a < last; a++)
          for (let b = a + 1; b < last; b++)
              if (srtMelodyRhythm(p, a) === srtMelodyRhythm(p, b)) {
                  items.push(deps.t('rdn_check_rhythm', a + 1, b + 1));
                  break outer;
              }
      ul.innerHTML = items.map((x) => `<li>${deps.rdEsc(x)}</li>`).join('');
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
      deps.SR.notes.forEach((n) => drawn.set(`${n.hand}|${n.beat.toFixed(3)}|${n.midi}`, n.nid));
      expected.forEach((x) => {
          const ev = events.get(x.id.slice(0, x.id.lastIndexOf(':')));
          const nid = ev ? drawn.get(`${x.hand}|${(ev.onsetTick / piece.ticksPerQuarter).toFixed(3)}|${x.midi}`) : undefined;
          if (nid !== undefined)
              out.set(x.id, nid);
      });
      return out;
  }
    function rdnRecord(score: number, stars: 0 | 1 | 2 | 3, firstSight: boolean) {
      const p = deps.SR.lvPiece, c = deps.RDN.ctx;
      if (!p || !c)
          return;
      const id = c.kind === 'scored' ? srtScoredId(srtLevelFingerprint(p)) : c.kind === 'book' ? srtBookId(c.level, c.number) : c.kind === 'focus' ? srtFocusId(c.level, c.key, c.number) : c.kind === 'long' ? srtLongId(c.date, c.index) : srtDailyId(c.date, c.slot);
      deps.rdnSetBook(srtRecordResult(deps.rdnBook(), { id, level: p.level, key: p.key.id, score, stars, firstSight, date: deps.rdnToday() }));
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
      deps.RDN.learn = null;
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
      const box = maybeById('rdn-result'), ev = deps.SR.srtEvaluation, p = deps.SR.lvPiece, learn = deps.RDN.learn, e = deps.rdEsc;
      if (!box)
          return;
      if (!p || (!ev && !learn)) {
          rdnResultHide();
          return;
      }
      // A Step-by-step run measures neither pitch accuracy, rhythm nor timing: those cells show a dash.
      const pct = learn ? learn.acc : deps.SR.srtResultValue ?? Math.round(ev?.score ?? 0), stars = learn ? learn.stars : deps.rdnStars(ev?.stars ?? 0), auto = rdnAutoNextOn();
      const cells: [string, string][] = [
          [!ev || learn ? '—' : Math.round(ev.pitchF1 ?? 0) + '%', deps.t('rdn_res_pitch')],
          [!ev || learn ? '—' : Math.round(ev.rhythmAcc ?? 0) + '%', deps.t('rdn_res_rhythm')],
          [!ev || learn || ev.meanOffsetMs == null ? '—' : deps.t('rdn_res_ms', Math.round(ev.meanOffsetMs)), deps.t('rdn_res_timing')],
          [deps.rdnKeyName(p.key), deps.t('rdn_res_key')],
      ];
      // The score and the cells are the live region: a new result is announced once, without the buttons.
      box.innerHTML = `<div class="rdn-r-live" role="status" aria-atomic="true"><div class="rdn-r-top"><h3 id="rdn-r-score">${pct}%</h3>${deps.rdStars(stars, stars ? undefined : deps.t('rdn_stars_none'))}</div>` +
          // What the stars of an assessed attempt mean, and what the next one takes (a Step-by-step run has its own rule).
          (learn ? '' : `<p class="rdn-r-msg">${e(deps.t('rdn_r_s' + stars))}</p>`) +
          `<div class="rdn-res">${cells.map(([v, l]) => `<div><b>${e(v)}</b><span>${e(l)}</span></div>`).join('')}</div></div>` +
          `<div class="rdn-row"><button type="button" class="btn" id="rdn-retry">${e(deps.t('rdn_retry'))}</button>` +
          `<button type="button" class="btn" id="rdn-listen">${e(deps.t('rdn_listen'))}</button>` +
          `<button type="button" class="btn primary" id="rdn-r-next">${e(deps.t('rdn_next_btn'))}</button>` +
          `<label class="rdn-check-pref"><input type="checkbox" id="rdn-autonext"${auto ? ' checked' : ''}> <span>${e(deps.t('rdn_autonext'))}</span></label></div>` +
          `<div class="rdn-auto" id="rdn-auto" hidden><span id="rdn-auto-t" aria-hidden="true"></span><span class="visually-hidden" id="rdn-auto-say" aria-live="polite"></span>` +
          `<button type="button" class="btn ghost" id="rdn-auto-cancel">${e(deps.t('rdn_cancel'))}</button></div>`;
      box.hidden = false;
      rdnVerdictShown(false);
      rdnNavUi();
      // Auto-next waits until a first-sight result is saved (see srtSetState): its save is still running, or failed.
      const state = deps.SR.srtState, unsaved = state?.mode === 'firstSight' && !!state.attemptId && state.name !== 'saved';
      if (startAuto && auto && stars >= 1) {
          if (unsaved || deps.srtPendingSaveProtected())
              deps.RDN.autoWait = true;
          else
              rdnAutoStart();
      }
      else if (deps.RDN.autoTimer)
          rdnAutoShow();
      // Focus that was lost (on the page, or on a control that went away) goes to Next; a control the reader is on keeps it.
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active === document.body || !active.getClientRects().length)
          byId('rdn-r-next').focus({ preventScroll: true });
  }
    /** Auto-next: the reader's choice once made; until then it is on while a MIDI or Bluetooth piano is connected. */
  function rdnAutoNextOn() {
      const pref = deps.rdData().prefs.autoNext;
      return pref === undefined ? deps.midiLive() : !!pref;
  }
    function rdnAutoShow() {
      const row = maybeById('rdn-auto'), text = maybeById('rdn-auto-t'), say = maybeById('rdn-auto-say');
      if (row)
          row.hidden = !deps.RDN.autoTimer;
      if (text)
          text.textContent = deps.RDN.autoTimer ? deps.t('rdn_auto_in', deps.RDN.autoLeft) : '';
      // Announced once: the number that counts down is not a live region.
      if (say && (!deps.RDN.autoTimer || deps.RDN.autoLeft === 3))
          say.textContent = deps.RDN.autoTimer ? deps.t('rdn_auto_say', deps.RDN.autoLeft) : '';
  }
    /** After a first-sight result was saved: the auto-next that waited for it starts. */
  function rdnAutoAfterSave() {
      if (!deps.RDN.autoWait)
          return;
      deps.RDN.autoWait = false;
      if (deps.RDN.screen === 'player' && deps.SR.lvPiece && !maybeById('rdn-result')?.hidden && rdnAutoNextOn())
          rdnAutoStart();
  }
    function rdnAutoStart() {
      rdnAutoCancel();
      deps.RDN.autoLeft = 3;
      deps.RDN.autoTimer = window.setInterval(() => {
          deps.RDN.autoLeft--;
          if (deps.RDN.autoLeft <= 0) {
              rdnAutoCancel();
              // A connected piano can start the next assessment on its first note.
              rdnStep(1, !deps.midiLive());
              return;
          }
          rdnAutoShow();
      }, 1000);
      rdnAutoShow();
  }
    function rdnAutoCancel() {
      if (deps.RDN.autoTimer)
          window.clearInterval(deps.RDN.autoTimer);
      deps.RDN.autoTimer = 0;
      deps.RDN.autoWait = false;
      rdnAutoShow();
  }
    function rdnRetry() {
      rdnAutoCancel();
      deps.srGo();
  }

  return {
    get rdnScoredBusy() { return rdnScoredBusy; },
    set rdnScoredBusy(value: typeof rdnScoredBusy) { rdnScoredBusy = value; },
    rdnOpenScored,
    rdnPieceOf,
    rdnHeadText,
    rdnPlayerHead,
    rdnBusy,
    rdnNavUi,
    rdnReadyText,
    rdnReadySync,
    rdnHandsHint,
    rdnBpm,
    rdnDrawable,
    rdnHandsUi,
    rdnOpen,
    rdnStep,
    rdnKey,
    rdnForgetLevelPiece,
    rdnDropLevelPiece,
    rdnChecklist,
    rdnRestWindows,
    rdnDrawnIds,
    rdnRecord,
    rdnResultHide,
    rdnVerdictShown,
    rdnResultShow,
    rdnAutoNextOn,
    rdnAutoShow,
    rdnAutoAfterSave,
    rdnAutoStart,
    rdnAutoCancel,
    rdnRetry,
  };
}

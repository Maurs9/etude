import type { ReadDrillData, TranslateFn } from '../../domain/views.js';
import { RD_LV, type ReadDrillLevel } from '../../core/reading-curriculum.js';
import { type SrLayout, type SrRenderResult, type SrScore } from '../../domain/score-types.js';
import { byId, maybeById, buttonById, eventClosest } from '../../domain/dom.js';
import { type ReadDrillCustom } from '../../domain/views.js';
import { srtKeyPool } from '../../sight-reading/levels.js';
import { type ReadingBookState } from '../../sight-reading/progress.js';
import { srtFlashMatches, srtWarmupPlan, type FlashCard, type WarmupStep } from '../../sight-reading/warmup.js';
import type { AppHost, ReadShell } from '../../domain/views.js';
import * as theory from '../../domain/theory.js';

const pc = theory.pitchClass, srKeyName = theory.circleKeyPitchClass, rdSpellMidi = theory.readingSpelling;
import type { RdnScreen, RdnWarmState, SrtStopReason, ReadDrillState } from './read-model.js';


/** Shell state and services createReadWarmup reads; values are getters so shell declarations made later resolve on use. */
export interface ReadWarmupDeps {
  readonly host: AppHost;
  readonly shell: ReadShell;
  readonly markReadDoneToday: (save?: boolean) => void;
  readonly RD: ReadDrillState;
  readonly rdAbort: () => void;
  readonly rdCustomLevel: (c: ReadDrillCustom, keyN?: number) => ReadDrillLevel;
  readonly rdData: () => ReadDrillData;
  readonly rdEsc: (value: string | number | undefined) => string;
  readonly rdIntro: () => void;
  readonly RDN_WARM_MS: { flash: number; result: number; chord: number; };
  readonly rdnBook: () => ReadingBookState;
  readonly rdnEnsureDaily: (state: ReadingBookState, today: string) => ReadingBookState;
  readonly rdnHome: (focus?: boolean) => void;
  readonly rdnSetBook: (state: ReadingBookState) => void;
  readonly rdnShowScreen: (screen: RdnScreen) => void;
  readonly rdnToday: () => string;
  readonly rdnWhenSaved: (then: () => void) => boolean;
  readonly rdStart: (mode0: string, bars?: number) => void;
  readonly reduceMotion: () => boolean;
  readonly saveAll: () => void;
  readonly srPaperOf: (wrap: HTMLElement | null) => SrLayout | undefined;
  readonly srRender: (piece: SrScore, lay?: SrLayout, proportional?: boolean) => SrRenderResult;
  readonly srStopAll: (keep?: boolean, preserveSrt?: boolean, reason?: SrtStopReason) => void;
  readonly stageSync: () => void;
  readonly t: TranslateFn;
  readonly touchDay: () => void;
  readonly WARM: RdnWarmState;
}

/* The Read warm-up: flash cards, then a few existing drills, one after another. */
export function createReadWarmup(deps: ReadWarmupDeps) {
  const { host, shell } = deps;
    /* ---- the warm-up: flash cards, then a few existing drills, one after another ---- */
  /** How many answers end a drill step of the warm-up: rhythm exercises, and questions of the other drills (chords). */
  const RDN_WARM_LIMIT = { rh: 2, other: 5 };
    function rdnWarmClear() {
      window.clearTimeout(deps.WARM.timer);
      window.clearTimeout(deps.WARM.chordTimer);
      deps.WARM.timer = 0;
      deps.WARM.chordTimer = 0;
  }
    /** Starts the warm-up of the book's level, in the pinned key or else the key of today's level piece. */
  function rdnWarmupStart() {
      if (!deps.rdnWhenSaved(rdnWarmupStart))
          return;
      const today = deps.rdnToday();
      let state = deps.rdnBook();
      const ensured = deps.rdnEnsureDaily(state, today);
      if (ensured !== state) {
          state = ensured;
          deps.rdnSetBook(state);
      }
      const slots = state.daily?.slots ?? [], slot = slots.find((x) => x.role === 'level') ?? slots[1] ?? slots[0];
      const level = state.level, key: string = state.focusKey ?? slot?.key ?? srtKeyPool(level)[0].id;
      if (deps.RD.on)
          deps.rdAbort();
      deps.srStopAll(true, false, 'navigate');
      rdnWarmClear();
      deps.WARM.on = true;
      deps.WARM.level = level;
      deps.WARM.key = key;
      deps.WARM.steps = srtWarmupPlan(level, key, `${today}|${level}|${key}`);
      deps.WARM.step = 0;
      deps.WARM.tally = [];
      deps.WARM.phase = 'idle';
      deps.rdnShowScreen('warmup');
      rdnWarmRun();
      deps.stageSync();
      window.scrollTo(0, 0);
      byId('rdn-w-back').focus({ preventScroll: true });
  }
    function rdnWarmStepName(step: WarmupStep | undefined) {
      if (!step)
          return '';
      if (step.kind === 'flash')
          return deps.t('rdn_w_flash');
      if (step.kind === 'position')
          return deps.t(step.hand === 'rh' ? 'rdn_w_pos_rh' : 'rdn_w_pos_lh');
      return deps.t(step.id.startsWith('ch') ? 'rdn_w_chords' : 'rdn_w_rhythm');
  }
    function rdnWarmHead() {
      byId('rdn-w-step').textContent = deps.t('rdn_w_step', Math.min(deps.WARM.step + 1, deps.WARM.steps.length), deps.WARM.steps.length) + ' · ' + rdnWarmStepName(deps.WARM.steps[deps.WARM.step]);
      const tally = byId('rdn-w-tally');
      tally.textContent = deps.WARM.tally.length ? deps.t('rdn_w_tally', deps.WARM.tally[0], deps.WARM.tally[1]) : '';
      tally.hidden = !deps.WARM.tally.length;
      // A drill step names itself on the drill's stage (a custom drill would say "Custom drill").
      if (deps.WARM.phase === 'drill')
          byId('rdx-title').textContent = rdnWarmStepName(deps.WARM.steps[deps.WARM.step]);
  }
    /** Runs the current step: the flash cards here, the other steps in the drill engine (practice mode, a few answers). */
  function rdnWarmRun() {
      rdnWarmClear();
      if (!deps.WARM.on)
          return;
      const step = deps.WARM.steps[deps.WARM.step], flash = byId('rdn-w-flash');
      if (!step) {
          rdnWarmFinish();
          return;
      }
      rdnWarmHead();
      if (step.kind === 'flash') {
          byId('rdp-drills').hidden = true;
          flash.hidden = false;
          deps.WARM.card = 0;
          deps.WARM.clean = 0;
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
          ? deps.rdCustomLevel({ ty: 'play', clef: step.clef, lo: step.low, hi: step.high, acc: 0, keys: 0, land: false }, step.keyN)
          : RD_LV[step.id];
      if (!L) {
          rdnWarmNext();
          return;
      }
      deps.WARM.phase = 'drill';
      deps.WARM.limit = step.kind === 'position' ? step.count : L.ty === 'rh' ? RDN_WARM_LIMIT.rh : RDN_WARM_LIMIT.other;
      byId('rdp-drills').hidden = false;
      deps.rdAbort();
      deps.RD.L = L;
      byId('rdx-home').hidden = true;
      byId('rdx-stage').hidden = false;
      deps.rdIntro();
      deps.rdStart('practice');
      rdnWarmHead();
  }
    function rdnWarmNext() {
      deps.WARM.step++;
      rdnWarmRun();
  }
    /** True once a drill step of the warm-up has had its answers: the drill then ends its run as usual (see rdFinish). */
  function rdnWarmLimit() { return deps.WARM.on && deps.WARM.phase === 'drill' && deps.RD.n >= deps.WARM.limit; }
    /** Called by rdFinish after a run was counted: in a warm-up the next step starts instead of the drill's summary. */
  function rdnWarmDrillDone() {
      if (!deps.WARM.on || deps.WARM.phase !== 'drill')
          return false;
      rdnWarmNext();
      return true;
  }
    /** The drills screen as the warm-up found it: no run, the stage closed, the ladder showing. */
  function rdnWarmDrillsReset() {
      if (deps.RD.on)
          deps.rdAbort();
      deps.RD.L = null;
      byId('rdx-stage').hidden = true;
      byId('rdx-home').hidden = false;
  }
    /** Abandons the warm-up (Back, another screen, another tab): no timer, no drill run and no flash card stay behind. */
  function rdnWarmStop() {
      rdnWarmClear();
      const touched = deps.WARM.step > 0 || deps.WARM.phase === 'drill';
      deps.WARM.on = false;
      deps.WARM.phase = 'idle';
      deps.WARM.played = [];
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
      deps.rdData().tot.sess++;
      deps.markReadDoneToday();
      deps.touchDay();
      deps.rdData().prefs.warmDone = deps.rdnToday();
      deps.saveAll();
      deps.rdnHome();
      const go = maybeById('rdn-warm-go');
      if (go)
          go.focus({ preventScroll: true });
  }
    /* flash cards */
  function rdnWarmCards(): readonly FlashCard[] {
      const step = deps.WARM.steps[deps.WARM.step];
      return step && step.kind === 'flash' ? step.cards : [];
  }
    /** The card's bar for the engraver: only the hand that plays it, and never with note names. */
  function rdnFlashScore(card: FlashCard): SrScore {
      const sc = card.score;
      return { ts: [...sc.ts], keyN: sc.keyN, engrave: 2, noNames: true, rh: card.hand === 'rh' ? sc.rh : undefined, lh: card.hand === 'lh' ? sc.lh : undefined };
  }
    function rdnWarmCard() {
      const cards = rdnWarmCards();
      if (deps.WARM.card >= cards.length) {
          deps.WARM.tally = [deps.WARM.clean, cards.length];
          rdnWarmNext();
          return;
      }
      deps.WARM.again = false;
      rdnWarmShow(true);
  }
    function rdnWarmShow(draw: boolean) {
      rdnWarmClear();
      deps.WARM.phase = 'show';
      deps.WARM.played = [];
      deps.WARM.lastAt = 0;
      deps.WARM.strict = false;
      rdnWarmFlashUi(draw);
      // The bar runs out while the card shows (a still bar with reduced motion). Only a new showing restarts it.
      const bar = maybeById('rdn-f-bar');
      if (bar) {
          bar.style.setProperty('--flash', deps.RDN_WARM_MS.flash + 'ms');
          bar.classList.remove('run');
          void bar.offsetWidth;
          if (!deps.reduceMotion())
              bar.classList.add('run');
      }
      deps.WARM.timer = window.setTimeout(rdnWarmHide, deps.RDN_WARM_MS.flash);
  }
    function rdnWarmHide() {
      rdnWarmClear();
      deps.WARM.phase = 'play';
      rdnWarmFlashUi(false);
  }
    /** A note from the app's normal input while a card waits to be played. Notes closer than RDN_WARM_MS.chord form one chord. */
  function rdnWarmNote(midi: number) {
      const card = rdnWarmCards()[deps.WARM.card];
      if (!card)
          return;
      const now = performance.now(), src = [...(shell.inputOwners.get(midi) || [])], last = deps.WARM.played[deps.WARM.played.length - 1];
      if (src.some((x) => x === 'midi' || x === 'ble'))
          deps.WARM.strict = true;
      if (last && now - deps.WARM.lastAt <= deps.RDN_WARM_MS.chord)
          last.push(midi);
      else
          deps.WARM.played.push([midi]);
      deps.WARM.lastAt = now;
      window.clearTimeout(deps.WARM.chordTimer);
      if (deps.WARM.played.length >= card.notes.length)
          deps.WARM.chordTimer = window.setTimeout(rdnWarmJudge, Math.max(0, deps.RDN_WARM_MS.chord));
  }
    /** Checks what was played (any octave unless it came from a MIDI or Bluetooth piano, as in the drills) and shows the mark. */
  function rdnWarmJudge() {
      const card = rdnWarmCards()[deps.WARM.card];
      if (!card || deps.WARM.phase !== 'play')
          return;
      deps.WARM.ok = srtFlashMatches(card, deps.WARM.played, !!host.store.data().settings.anyOctave || !deps.WARM.strict);
      if (deps.WARM.ok && !deps.WARM.again)
          deps.WARM.clean++;
      rdnWarmClear();
      deps.WARM.phase = 'result';
      rdnWarmFlashUi(false);
      deps.WARM.timer = window.setTimeout(rdnWarmAdvance, deps.RDN_WARM_MS.result);
  }
    function rdnWarmAdvance() {
      rdnWarmClear();
      deps.WARM.card++;
      rdnWarmCard();
  }
    /** Draws the card (`draw`) or updates it for the phase: the prompt (a polite live region), the bar, the mark and the buttons. */
  function rdnWarmFlashUi(draw: boolean) {
      const box = maybeById('rdn-w-flash'), cards = rdnWarmCards(), card = cards[deps.WARM.card], e = deps.rdEsc;
      if (!box || !card)
          return;
      if (draw || !box.querySelector('#rdn-f-staff')) {
          box.innerHTML = `<div class="rdn-f-top"><span class="rdn-f-count" id="rdn-f-count"></span><span class="rdn-f-prompt" id="rdn-f-prompt" role="status"></span></div>` +
              `<div class="ss-wrap rdn-f-staff" id="rdn-f-staff" role="img"></div><div class="rdn-f-bar" id="rdn-f-bar" aria-hidden="true"><i></i></div>` +
              `<div class="rdn-row rdn-f-btns"><button type="button" class="btn" id="rdn-f-again"></button><button type="button" class="btn primary" id="rdn-f-next"></button></div>`;
          const wrap = byId('rdn-f-staff');
          wrap.innerHTML = deps.srRender(rdnFlashScore(card), deps.srPaperOf(wrap)).svg;
      }
      const phase = deps.WARM.phase, wrap = byId('rdn-f-staff'), bar = byId('rdn-f-bar'), again = buttonById('rdn-f-again'), next = buttonById('rdn-f-next');
      byId('rdn-f-count').textContent = deps.t('rdn_f_card', deps.WARM.card + 1, cards.length);
      const prompt = byId('rdn-f-prompt');
      prompt.dataset.s = phase === 'result' ? (deps.WARM.ok ? 'good' : 'bad') : phase;
      prompt.innerHTML = phase === 'result'
          ? `<span aria-hidden="true">${deps.WARM.ok ? '✓' : '✗'}</span> ${e(deps.t(deps.WARM.ok ? 'rdn_f_right' : 'rdn_f_wrong'))}`
          : e(deps.t(phase === 'play' ? 'rdn_f_play' : 'rdn_f_look'));
      wrap.setAttribute('aria-label', deps.t('rdn_f_staff_aria'));
      wrap.toggleAttribute('data-hidden', phase === 'play');
      if (phase === 'result')
          wrap.dataset.mark = deps.WARM.ok ? 'good' : 'bad';
      else
          delete wrap.dataset.mark;
      wrap.querySelectorAll('.ss-n').forEach((n) => { if (!(n instanceof SVGElement))
          return; if (phase === 'result')
          n.dataset.s = deps.WARM.ok ? 'good' : 'bad';
      else
          delete n.dataset.s; });
      bar.hidden = phase !== 'show';
      again.textContent = deps.t('rdn_f_again');
      next.textContent = deps.t('rdn_f_next');
      const focused = document.activeElement;
      again.hidden = phase !== 'play';
      next.hidden = phase !== 'result';
      // A button that hides while it has focus hands it to the card, so focus is never lost to the page.
      if ((focused === again && again.hidden) || (focused === next && next.hidden))
          box.focus({ preventScroll: true });
  }
    function rdnWarmFlashClick(e: MouseEvent) {
      const id = eventClosest(e, 'button')?.id;
      if (id === 'rdn-f-again' && deps.WARM.phase === 'play') {
          deps.WARM.again = true;
          rdnWarmShow(false);
      }
      else if (id === 'rdn-f-next' && deps.WARM.phase === 'result')
          rdnWarmAdvance();
  }
    /** After a language change: the header, and the card's texts. */
  function rdnWarmLocale() {
      if (!deps.WARM.on)
          return;
      rdnWarmHead();
      if (deps.WARM.phase === 'show' || deps.WARM.phase === 'play' || deps.WARM.phase === 'result')
          rdnWarmFlashUi(false);
  }

  return {
    RDN_WARM_LIMIT,
    rdnWarmClear,
    rdnWarmupStart,
    rdnWarmStepName,
    rdnWarmHead,
    rdnWarmRun,
    rdnWarmNext,
    rdnWarmLimit,
    rdnWarmDrillDone,
    rdnWarmDrillsReset,
    rdnWarmStop,
    rdnWarmFinish,
    rdnWarmCards,
    rdnFlashScore,
    rdnWarmCard,
    rdnWarmShow,
    rdnWarmHide,
    rdnWarmNote,
    rdnWarmJudge,
    rdnWarmAdvance,
    rdnWarmFlashUi,
    rdnWarmFlashClick,
    rdnWarmLocale,
  };
}

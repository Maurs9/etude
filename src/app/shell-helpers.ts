import type { createCoaching } from './coaching.js';
import { LESSONS } from '../locales/catalog.js';
import type { LessonMetadata as Lesson, Localised } from '../locales/content-types.js';
import { learnData as coreLearnData, learnDueDays as coreLearnDueDays, learnDueList as coreLearnDueList, learnGap as coreLearnGap, learnUnitDone as coreLearnUnitDone, learnUnitOf as coreLearnUnitOf } from '../core/learn-progress.js';
import { type ReadDrillLevel } from '../core/reading-curriculum.js';
import * as theory from '../domain/theory.js';
import type * as notationApi from '../domain/notation.js';
import { byId, maybeById } from '../domain/dom.js';
import { type ScorePlayerController, type PracticeController, type ReadController, type ReadDrillData, type ShowFn, type StoredTrainerData } from '../domain/views.js';
import type { InterfaceLanguage } from '../types/architecture.js';

/** Shell state and services createShellHelpers reads; values are getters so shell declarations made later resolve on use. */
export interface ShellHelpersDeps {
  readonly clampPersistedNumber: (v: unknown, min: number, max: number, fallback: number) => number;
  readonly coaching: ReturnType<typeof createCoaching>;
  readonly data: StoredTrainerData;
  readonly dockShown: () => boolean;
  readonly lang: InterfaceLanguage;
  readonly LOCALE_TAGS: Record<string, string>;
  readonly notifyDockReflow: () => void;
  readonly practice: PracticeController | null;
  readonly read: ReadController | null;
  readonly SCORE_FOCUS: { owner: "analysis" | "read" | null; native: boolean; token: number; returnTo: HTMLElement | null; scroll: number; readOverride: boolean | null; zoom: number; };
  readonly scorePlayer: ScorePlayerController | null;
  readonly show: ShowFn;
  readonly STAGE: { on: boolean; kb: boolean | null; rz: number };
  readonly STRINGS: Record<string, Record<string, string>>;
  readonly t: (k: string, ...args: Array<string | number | null | undefined>) => string;
  readonly todayN: () => number;
  readonly view0: () => string;
}

/*
 * Helpers the shell and several lazy features share: the Learn progress bridge and plan lines, reading-drill data,
 * note spelling and table lookups, the reload prompt, reduced motion, and the layout CSS variables.
 */
export function createShellHelpers(deps: ShellHelpersDeps) {
  /* ============================================================================
     LEARN SHELL BRIDGE — core progress helpers (src/core/learn-progress.ts)
     and thin navigation wrappers; full Learn UI lives lazily in src/features/learn/.
     ============================================================================ */
  function learnTitle(L: Lesson) { return L[deps.lang]?.t || L.en.t; }
  function learnData() { return coreLearnData(deps.data); }
  function learnUnitOf(id: string) { return coreLearnUnitOf(id); }
  function learnUnitDone(i: number) { return coreLearnUnitDone(deps.data, i); }
  function learnGap(id: string) { return coreLearnGap(deps.data, id); }
  function learnDueDays(id: string) { return coreLearnDueDays(deps.data, id, deps.todayN()); }
  function learnDueList() { return coreLearnDueList(deps.data, deps.todayN()); }
  function learnGoId(id: string) {
      if (LESSONS.some((L) => L.id === id)) void deps.show('learn', { learnLessonId: id });
  }
  function learnPlanItems(tn: number) {
      const D = learnData(), ld = D.learnDone;
      const nextL = LESSONS.find((L) => !ld[L.id]), learnToday = Object.keys(ld).some((k) => ld[k] === tn);
      const out = [{ id: 'learn', done: learnToday || !nextL, t: deps.t('plan_learn'), d: nextL ? deps.t('plan_learn_d', learnTitle(nextL)) : deps.t('plan_learn_all'),
              go: () => { if (nextL)
                  learnGoId(nextL.id);
              else
                  deps.show('learn'); } }];
      const due = learnDueList();
      if (due.length) {
          const L = due[0];
          out.push({ id: 'learnrev', done: false, t: deps.t('plan_lrev'),
              d: deps.t('plan_lrev_d', learnTitle(L), learnDueDays(L.id) ?? 0) + (due.length > 1 ? deps.t('plan_lrev_more', due.length - 1) : ''), go: () => learnGoId(L.id) });
      }
      else if (Object.keys(D.learnRev).some((k) => D.learnRev[k].rv === tn))
          out.push({ id: 'learnrev', done: true, t: deps.t('plan_lrev'), d: deps.t('plan_lrev_done'), go: () => deps.show('learn') });
      return out;
  }
  function srPieceTitle(p: { id?: string; t?: Localised<string>; }) {
      return deps.STRINGS[deps.lang]?.['piece_title_' + p.id] ?? p.t?.[deps.lang] ?? p.t?.en ?? '';
  }
  // sv, ta: best Survival and Time Attack scores; mn: best Marathon pace in notes per minute.
  function rdData(): ReadDrillData {
      if (!deps.data.reading || typeof deps.data.reading !== 'object')
          deps.data.reading = {};
      const r = deps.data.reading;
      r.lv = r.lv || {};
      r.nt = r.nt || {};
      const tot = r.tot;
      r.tot = {
          ...tot,
          n: deps.clampPersistedNumber(tot?.n, 0, Infinity, 0),
          ok: deps.clampPersistedNumber(tot?.ok, 0, Infinity, 0),
          ms: deps.clampPersistedNumber(tot?.ms, 0, Infinity, 0),
          sess: deps.clampPersistedNumber(tot?.sess, 0, Infinity, 0),
      };
      r.prefs = Object.assign({ tab: 'drills', sound: true, hints: false, last: null, custom: null, rhDur: false, rhHands: 1, flow: true, ghost: false, stage: true, instantFeedback: false }, r.prefs || {});
      if (!isReadDrillData(r))
          throw new Error('Étude: reading progress could not be initialised');
      return r;
  }
  function isReadDrillData(r: Partial<ReadDrillData>): r is ReadDrillData { return !!r.lv && !!r.nt && !!r.tot && !!r.prefs; }
  function rdEsc(s: string | number | undefined) { return String(s).replace(/[&<>"]/g, (c) => c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'); }
  /* ---- sessions: intro → questions → summary ---- */
  function rdLvName(L: ReadDrillLevel) { return L.custom ? deps.t('rdx_custom') : deps.t('rdx_u_' + L.u) + ' · ' + L.n; }
  function rdStarCount(value: unknown) { return Math.floor(deps.clampPersistedNumber(value, 0, 3, 0)); }
  deps.coaching.register(() => { if (!byId('pr-sum').hidden)
      deps.scorePlayer?.refreshCoach(); });
  function coachRefresh() { deps.coaching.refresh(); }
  function tl(L: string, k: string, a?: string|number|null, b?: string|number|null) {
      // The table of language L when it is loaded, else the interface language's own (English strings load only for English).
      const own = L === 'en' || L === 'ro' ? deps.STRINGS[L] : undefined, base = deps.STRINGS[deps.lang] || deps.STRINGS.en; let v = (own && own[k] != null) ? own[k] : base ? base[k] : undefined; if (v == null)
      return k; if (a != null)
      v = v.replace('%s', () => String(a)).replace('%a', () => String(a)); if (b != null)
      v = v.replace('%b', () => String(b)); return v; }
  /* keys, spelling */
  const KEY_MAJ_FIFTHS = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: -5, 8: -4, 3: -3, 10: -2, 5: -1 }, LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
  const LETTERS = { letter: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], solfege: ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'], german: ['C', 'D', 'E', 'F', 'G', 'A', 'H'] };
  // B-flat is B in German; B-natural and other alterations use H.
  function spelledName(sys: theory.NoteSystem, li: number, acc: number, ascii = false) { if (sys === 'german' && li === 6 && acc === -1)
      return 'B'; const symbols = ascii ? ['bb', 'b', '', '#', '##'] : ['𝄫', '♭', '', '♯', '𝄪']; return LETTERS[sys][li] + (symbols[acc + 2] || ''); }
  // OSMD draws each pedal mark straight onto the page; a group per mark lets the hover explain "Ped." and "*".
  function showNotationReloadPrompt(notationReloadMessage?: (language: InterfaceLanguage) => { message: string; button: string }) {
      if (document.querySelector('.notation-reload')) return;
      const copy = notationReloadMessage ? notationReloadMessage(deps.lang) : { message: 'The score could not load. Reload the page.', button: 'Reload' }, box = (document).createElement('div');
      box.setAttribute('role', 'alert');
      box.className = 'notation-reload';
      box.innerHTML = '<p></p><button type="button"></button>';
      const message = box.querySelector('p');
      const button = box.querySelector('button');
      if (message) message.textContent = copy.message;
      if (button) {
          button.textContent = copy.button;
          button.addEventListener('click', () => location.reload());
      }
      document.body.append(box);
  }
  const reduceMotionMql = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduceMotion = () => !!reduceMotionMql?.matches;
  function savedScoreView(view: unknown, explicit: unknown): notationApi.ScoreLayoutMode | 'fall' | null {
      if (explicit === false) return null;
      // Older releases saved Page even when the default had never been changed.
      if (view === 'page') return explicit === true ? view : null;
      return view === 'fit' || view === 'cont' || view === 'fall' ? view : null;
  }
  // The page is sized in CSS from these: 100dvh − header (or the Pieces full-window bar) − dock − bottom bar. The Score Player
  // adds its toolbar and status bar rows (scorePlayer.layoutVars) in the same frame.
  function anLayoutVars() {
      const st = document.documentElement.style, h = (el: HTMLElement|null) => el && !el.hidden ? Math.round(el.getBoundingClientRect().height) : 0, dock = byId('dock');
      const topBarH = deps.scorePlayer?.stageOn() ? h(maybeById('an-fs-top')) : h(document.querySelector('header'));
      st.setProperty('--hdr-h', topBarH + 'px');
      const bnav = h(byId('bottomNav')); // 0 while the bar is not displayed (wide screens, short landscape, the practice stage)
      st.setProperty('--bnav-h', bnav + 'px');
      st.setProperty('--dock-h', ((document.body.classList.contains('kb') ? h(dock) : 0) + bnav) + 'px');
      deps.scorePlayer?.layoutVars();
      deps.notifyDockReflow(); // Explore's staff is sized from the room these leave
      syncMobileStartBars();
  }
  let layoutRq = 0;
  function layoutVarsSoon() { cancelAnimationFrame(layoutRq); layoutRq = requestAnimationFrame(anLayoutVars); }
  function syncMobileStartBars() {
      const v = deps.view0(), dockExpanded = deps.dockShown(), inFocus = !!deps.SCORE_FOCUS.owner || deps.STAGE.on;
      const prBar = maybeById('pr-mobile-bar'), prSum = maybeById('pr-mobile-summary'), prBtn = maybeById('pr-mobile-start') as HTMLButtonElement | null;
      const prHome = maybeById('pr-home'), prStartBtn = maybeById('pr-start') as HTMLButtonElement | null;
      if (prBar && prSum && prBtn && prHome) {
          const showPr = v === 'practice' && !!deps.practice && !deps.practice.sesActive() && !dockExpanded && !inFocus && prHome.style.display !== 'none';
          prBar.hidden = !showPr;
          prHome.classList.toggle('has-mobile-bar', showPr);
          if (showPr && deps.practice && maybeById('pr-cat') && maybeById('pr-mode')) {
              const bar = deps.practice.mobileBar();
              prSum.textContent = bar.summary;
              prBtn.textContent = bar.label;
              prBtn.disabled = !!prStartBtn?.disabled;
          }
      }
      const rdBar = maybeById('rd-mobile-bar'), rdSum = maybeById('rd-mobile-summary'), rdBtn = maybeById('rd-mobile-start') as HTMLButtonElement | null;
      const rdPieces = maybeById('rdp-pieces'), rdResult = maybeById('rdn-result'), rdGoBtn = maybeById('rd-go') as HTMLButtonElement | null;
      if (rdBar && rdSum && rdBtn && rdPieces) {
          const rdState = deps.read?.mobileBar();
          const showRd = v === 'read' && !rdPieces.hidden && !!rdState?.ready && (!rdResult || rdResult.hidden) && !dockExpanded && !inFocus;
          rdBar.hidden = !showRd;
          rdPieces.classList.toggle('has-mobile-bar', showRd);
          if (showRd && rdState) {
              rdSum.textContent = rdState.summary;
              rdBtn.disabled = !!rdGoBtn?.disabled;
          }
      }
      const mobileBarVisible = v === 'practice' && !!prBar && !prBar.hidden;
      document.body.classList.toggle('has-mobile-start-bar', mobileBarVisible);
  }
  function anNum(x: number, d: number) { return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString(deps.LOCALE_TAGS[deps.lang] || deps.lang); }

  return {
    learnTitle,
    learnData,
    learnUnitOf,
    learnUnitDone,
    learnGap,
    learnDueDays,
    learnDueList,
    learnGoId,
    learnPlanItems,
    srPieceTitle,
    rdData,
    isReadDrillData,
    rdEsc,
    rdLvName,
    rdStarCount,
    coachRefresh,
    tl,
    KEY_MAJ_FIFTHS,
    LETTER_PC,
    LETTERS,
    spelledName,
    showNotationReloadPrompt,
    reduceMotionMql,
    reduceMotion,
    savedScoreView,
    anLayoutVars,
    get layoutRq() { return layoutRq; },
    set layoutRq(value: typeof layoutRq) { layoutRq = value; },
    layoutVarsSoon,
    syncMobileStartBars,
    anNum,
  };
}

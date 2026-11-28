import type { ReadDrillData, TranslateFn } from '../../domain/views.js';
import { byId, maybeById, eventClosest, queryAllHtml } from '../../domain/dom.js';
import { srtKeyPool, srtLevel, srtLevels, srtReadingKey, srtReadingKeys, type ReadingKey, type ReadingPatternId } from '../../sight-reading/levels.js';
import { SRT_BOOK_PIECES, SRT_DAILY_PIECES, SRT_FOCUS_PIECES, SRT_UNIT_PIECES, srtBookUnits, type BookUnit } from '../../sight-reading/book.js';
import { srtBookId, srtBookTally, srtChooseLevel, srtEnsureDaily, srtFocusId, srtFocusTally, srtKeyStatus, srtLevelAverage, srtLevelReady, srtLongId, srtNormalizeBookState, srtPiecesRead, srtStreak, type PieceStat, type ReadingBookState } from '../../sight-reading/progress.js';
import { srtReadLedger, type SightReadingLedgerResult } from '../../sight-reading/ledger.js';
import type { AppHost } from '../../domain/views.js';
import * as theory from '../../domain/theory.js';

const pc = theory.pitchClass, srKeyName = theory.circleKeyPitchClass, rdSpellMidi = theory.readingSpelling;
import type { SrState, RdnScreen, RdnCtx, RdnState, RdnWarmState, SrtStopReason, ReadDrillState, RdnPlanItem } from './read-model.js';


/** Shell state and services createReadHome reads; values are getters so shell declarations made later resolve on use. */
export interface ReadHomeDeps {
  readonly host: AppHost;
  readonly RD: ReadDrillState;
  readonly rdAbort: () => void;
  readonly rdData: () => ReadDrillData;
  readonly rdEsc: (value: string | number | undefined) => string;
  readonly rdIntro: () => void;
  readonly RDN: RdnState;
  readonly rdnAutoCancel: () => void;
  readonly rdnDropLevelPiece: () => void;
  readonly rdnOpen: (ctx: RdnCtx, focus?: "title" | "keep", startInFocus?: number) => void;
  readonly rdnOpenScored: (startInFocus?: number) => Promise<void>;
  readonly rdnWarmStop: () => void;
  readonly rdnWarmupStart: () => void;
  readonly rdSpell: (s: string) => string;
  readonly saveAll: () => void;
  readonly SR: SrState;
  readonly srStopAll: (keep?: boolean, preserveSrt?: boolean, reason?: SrtStopReason) => void;
  readonly srtAbandonClaim: (status?: "abandoned" | "interrupted", transitionBeforeLedger?: boolean) => Promise<SightReadingLedgerResult>;
  readonly srtPendingSaveProtected: () => boolean;
  readonly stageSync: () => void;
  readonly t: TranslateFn;
  readonly WARM: RdnWarmState;
}

/* The Read home: Today, the book of level pieces, key runs and the daily set, Warm-up and Progress entry points. */
export function createReadHome(deps: ReadHomeDeps) {
  const { host } = deps;
    /* ============================================================================
     READ HOME — the Read tab's home (Today, the book, Warm-up, Progress) and the player of level pieces
     (docs/plans/2026-11-13-read-redesign-spec.md, sections 3, 7, 8 and 12). The music comes from the pure modules in
     src/sight-reading; this part keeps the screens, the saved book state and the player around the shared engine.
     ============================================================================ */
  const rdnNormalized = new WeakSet<object>();
    /** The saved book state, read through srtNormalizeBookState once per stored object. */
  function rdnBook(): ReadingBookState {
      const r = deps.rdData(), known = r.book;
      if (known && typeof known === 'object' && rdnNormalized.has(known))
          return known;
      const state = srtNormalizeBookState(known);
      r.book = state;
      rdnNormalized.add(state);
      return state;
  }
    function rdnSetBook(state: ReadingBookState) {
      deps.rdData().book = state;
      rdnNormalized.add(state);
      deps.saveAll();
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
    function rdnLevelName(level: number) { return deps.t('rdn_lv' + level + '_name'); }
    function rdnKeyName(key: ReadingKey) { return deps.t(key.mode === 'minor' ? 'key_minor' : 'key_major', deps.rdSpell(key.tonic)); }
    function rdnKeyShort(key: ReadingKey) { return deps.rdSpell(key.tonic) + (key.mode === 'minor' ? 'm' : ''); }
    function rdnSig(keyN: number) { return keyN === 0 ? deps.t('rdn_sig_none') : deps.t(keyN > 0 ? 'rdn_sig_sharps' : 'rdn_sig_flats', Math.abs(keyN)); }
    function rdnSigWords(keyN: number) {
      const n = Math.abs(keyN);
      if (n === 0)
          return deps.t('rdn_sig_aria_none');
      return keyN > 0 ? (n === 1 ? deps.t('rdn_sig_aria_sharp1') : deps.t('rdn_sig_aria_sharps', n)) : (n === 1 ? deps.t('rdn_sig_aria_flat1') : deps.t('rdn_sig_aria_flats', n));
  }
    function rdnPattern(id: ReadingPatternId) { return deps.t('rdn_pat_' + id); }
    function rdnCap(s: string) { return s ? s.charAt(0).toLocaleUpperCase(host.i18n.lang()) + s.slice(1) : s; }
    function rdnStars(n: number): 0 | 1 | 2 | 3 { return n >= 3 ? 3 : n >= 2 ? 2 : n >= 1 ? 1 : 0; }
    function rdnStarText(n: number) { return '★'.repeat(n) + '☆'.repeat(3 - n); }
    /* ---- screens ---- */
  function rdnShowScreen(screen: RdnScreen) {
      if (screen !== 'player') {
          deps.rdnAutoCancel();
          if (deps.SR.lvPiece)
              deps.rdnDropLevelPiece();
      }
      if (screen !== 'warmup' && deps.WARM.on)
          deps.rdnWarmStop();
      if (deps.RDN.screen === 'home' && screen !== 'home')
          deps.RDN.opener = rdnFocusKey(document.activeElement);
      deps.RDN.screen = screen;
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
      const again = deps.RDN.opener ? document.querySelector(deps.RDN.opener) : null;
      deps.RDN.opener = '';
      const target = again instanceof HTMLElement && again.getClientRects().length ? again : maybeById('rdn-today-h');
      if (target)
          target.focus({ preventScroll: true });
  }
    /** Runs `then` once no first-sight result is waiting to be saved. A result that could not be saved is given up first. */
  function rdnWhenSaved(then: () => void) {
      if (!deps.srtPendingSaveProtected()) {
          deps.RDN.retries = 0;
          return true;
      }
      if (deps.SR.srtState?.name === 'pendingSave') {
          void deps.srtAbandonClaim('abandoned', false).then((result) => {
              if (result.ok || deps.SR.srtState?.name !== 'pendingSave')
                  then();
          });
      }
      else if (deps.RDN.retries < 40) {
          deps.RDN.retries++;
          window.setTimeout(then, 50);
      }
      return false;
  }
    function rdnHome(focus = false) {
      if (!rdnWhenSaved(() => rdnHome(focus)))
          return;
      if (deps.RD.on) {
          deps.rdAbort();
          deps.rdIntro();
      }
      deps.srStopAll(true, false, 'navigate');
      rdnShowScreen('home');
      rdnRenderHome();
      deps.stageSync();
      if (focus === true)
          rdnFocusHome();
  }
    // Leaving Read: the home comes back next time, except over an older melody that is still loaded, whose screen comes back
  // as it was (an interrupted first sight then shows its practice score there).
  function rdnLeaveView() {
      deps.RDN.fresh = !(deps.RDN.screen === 'melody' && !!deps.SR.srtPiece && !!deps.SR.gen);
      deps.rdnAutoCancel();
      if (deps.WARM.on)
          deps.rdnWarmStop();
  }
    /* ---- the home ---- */
  /** srtEnsureDaily, settable by tests through window.__etude. */
  let rdnEnsureDailyOf = srtEnsureDaily;
    /** Today's set for the state. A set that cannot be made (no new piece left) keeps the previous one and sets RDN.noDaily. */
  function rdnEnsureDaily(state: ReadingBookState, today: string) {
      try {
          const ensured = rdnEnsureDailyOf(state, today, rdnSeen());
          deps.RDN.noDaily = false;
          return ensured;
      }
      catch {
          deps.RDN.noDaily = true;
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
          `<hr class="rule"><h2 class="eyebrow-sec" id="rdn-book-sec">${deps.rdEsc(deps.t('rdn_book_eyebrow'))}</h2>${rdnBookHtml(state, moreOpen)}` +
          `<hr class="rule"><h2 class="eyebrow-sec" id="rdn-tools-h">${deps.rdEsc(deps.t('today_tools'))}</h2>${rdnToolsHtml()}`;
      rdnStreakUi(state, today);
      if (focusKey) {
          const again = box.querySelector(`[data-rdn-focus="${focusKey}"]`);
          if (again instanceof HTMLElement)
              again.focus({ preventScroll: true });
      }
  }
    /** Today's set in one line: how many pieces, their level and their keys. */
  function rdnSetLine(state: ReadingBookState) {
      const daily = deps.RDN.noDaily ? null : state.daily;
      const setKey = daily ? daily.focusKey : state.focusKey, setLevel = daily ? daily.level : state.level;
      const keys = setKey ? deps.t('rdn_today_key', rdnKeyName(srtReadingKey(setKey))) : deps.t('rdn_today_mixed');
      return deps.t('rdn_today_sub') + ' · ' + deps.t('rdn_today_level', setLevel) + '. ' + keys;
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
    /** Unified Today card: Today's 5-piece set on the left, the three routine steps (Warm-up, the set, Long piece) on the right. */
  function rdnHeroHtml(state: ReadingBookState, today: string) {
      // The card describes the set (its level and keys), which stays for the day once a piece of it was played.
      const daily = deps.RDN.noDaily ? null : state.daily, e = deps.rdEsc, lv = state.level, avg = srtLevelAverage(state, lv);
      const slots = daily ? daily.slots : [], done = daily ? daily.done : [];
      const played = done.filter((x) => x !== null).length, total = slots.length;
      const stays = !daily ? '' : daily.level !== state.level ? deps.t('rdn_today_stays', daily.level) : daily.focusKey !== state.focusKey ? deps.t('rdn_today_stays_key') : '';
      const counts = `<div class="counts rdn-stats"><div class="count due"><b class="num">${lv}</b><span>${e(deps.t('rdn_c_level'))}</span></div>` +
          `<div class="count new"><b class="num">${avg === null ? '—' : avg + '%'}</b><span>${e(deps.t('rdn_stat_first'))}</span></div>` +
          `<div class="count mastered"><b class="num">${srtPiecesRead(state)}</b><span>${e(deps.t('rdn_stat_read'))}</span></div></div>`;
      const chips = slots.map((slot, i) => {
          const score = done[i], role = deps.t('rdn_role_' + slot.role);
          const label = deps.t('rdn_slot_aria', i + 1, role) + ', ' + (score === null ? deps.t('rdn_not_played') : deps.t('rdn_score_n', score));
          return `<button type="button" class="rdn-slot${score === null ? '' : ' done'}" data-rdn-slot="${i}" data-rdn-focus="slot${i}" aria-label="${e(label)}">` +
              `<b>${i + 1}</b><small>${e(score === null ? role : score + '%')}</small></button>`;
      }).join('');
      const go = played === 0 ? 'rdn_today_start' : played >= total ? 'rdn_today_done' : 'rdn_today_continue';
      const suggest = srtLevelReady(state, lv)
          ? `<div class="rdn-suggest" id="rdn-suggest"><span>${e(deps.t('rdn_suggest', lv + 1))}</span><span class="rdn-sp"></span>` +
              `<button type="button" class="btn" id="rdn-suggest-go" data-rdn-focus="suggest">${e(deps.t('rdn_suggest_go', lv + 1))}</button></div>`
          : '';
      const items = rdnPlanItems(state, today), nextIdx = items.findIndex((it) => !it.done && !it.off);
      // All three steps are listed and numbered 1-3, so the list matches "n of 3 done". Today's set (step 2) is a status
      // row only: its controls are the slots and the Start button beside it, so the list adds no duplicate control.
      const rows = items.map((it, idx) => {
          const warm = it.id === 'rdn-warm-go', mark = it.done ? '✓' : String(idx + 1);
          if (it.id === 'rdn-plan-set') {
              // With a set, the visible "Today's set · 0/5" is read as one sentence ("Today's set: 0 of 5 pieces read").
              // Without one, the title and "No set today." are read as they are shown.
              const title = it.pill ? `<span aria-hidden="true">${e(it.t)}</span><span class="visually-hidden">${e(deps.t('rdn_goal_aria', played, total))}</span>` : e(it.t);
              return `<li class="plan-step rdn-set-step" data-done="${it.done}"${it.partial ? ' data-partial="true"' : ''}>` +
                  `<span class="ck" aria-hidden="true">${mark}</span><span class="pt">${title}</span>` +
                  (it.pill ? `<span class="plan-end" aria-hidden="true"><span class="plan-pill">${e(it.pill)}</span></span>` : `<span class="pd">${e(it.d)}</span>`) + '</li>';
          }
          return `<li><button type="button" class="plan-item${warm ? ' rdn-warm' : ''}" id="${it.id}" data-rdn-focus="${it.focus}" data-done="${it.done}"` +
              `${idx === nextIdx ? ' data-next="true"' : ''}${it.off ? ' disabled' : ''}>` +
              `<span class="ck" aria-hidden="true">${mark}</span>` +
              `<span class="pt"><span${warm ? ' id="rdn-warm-h"' : ''}>${e(it.t)}</span>${it.done ? `<span class="visually-hidden"${warm ? ' id="rdn-warm-done"' : ''}> — ${e(deps.t(warm ? 'rdn_warm_done' : 'done_today'))}</span>` : ''}</span>` +
              `<span class="pd"${it.dId ? ` id="${it.dId}"` : ''}>${e(it.d)}</span>` +
              `<span class="plan-end" aria-hidden="true"><span class="plan-go">→</span></span>` + '</button></li>';
      }).join('');
      const segs = items.map((it, idx) => `<i data-state="${it.done ? 'done' : it.partial ? 'partial' : idx === nextIdx ? 'next' : 'todo'}"></i>`).join('');
      return `<section class="hero rdn-hero rdn-today" aria-labelledby="rdn-today-h"><div class="rdn-today-grid"><div class="rdn-today-main"><div class="hero-top">` +
          `<h2 id="rdn-today-h" tabindex="-1">${e(deps.t('rdn_today_title'))}</h2>${counts}` +
          (daily ? `<p class="nextup rdn-sub">${e(rdnSetLine(state))}</p>` : `<p class="nextup rdn-sub" id="rdn-no-set">${e(deps.t('rdn_no_set'))}</p>`) +
          (stays ? `<p class="rdn-sub rdn-stays" id="rdn-today-stays">${e(stays)}</p>` : '') +
          (daily ? `<div class="rdn-slots" role="group" aria-label="${e(deps.t('rdn_today_title'))}">${chips}</div>` : '') +
          `<div class="hero-actions"><button type="button" class="btn primary lg" id="rdn-today-go" data-rdn-focus="today-go"${!daily || played >= total ? ' disabled' : ''}>${e(deps.t(daily ? go : 'rdn_today_start'))}</button></div></div></div>` +
          `<div class="rdn-today-side" id="rdn-plan" aria-labelledby="rdn-plan-h"><div class="plan-head"><div><h3 id="rdn-plan-h" tabindex="-1">${e(deps.t('rdn_plan_title'))}</h3>` +
          `<div class="plan-meta"><span class="sub" id="rdn-plan-sub">${e(deps.t('plan_sub', items.filter((it) => it.done).length, items.length))}</span>` +
          `<div class="plan-segs" id="rdn-plan-segs" aria-hidden="true">${segs}</div></div></div></div><ul class="plan-list rdn-side-list">${rows}</ul></div></div>` +
          // The footer spans the whole card, under both columns.
          `<div class="hero-why"><span class="why">✦ ${e(deps.t('rdn_why'))}</span>${suggest}</div></section>`;
  }
    function rdnPlanItems(state: ReadingBookState, today: string): RdnPlanItem[] {
      const lv = state.level, daily = deps.RDN.noDaily ? null : state.daily;
      const total = daily ? daily.slots.length : 0, played = daily ? daily.done.filter((x) => x !== null).length : 0;
      const long = !!state.pieces[srtLongId(today, 0)];
      return [
          { id: 'rdn-warm-go', focus: 'warm-go', done: deps.rdData().prefs.warmDone === today, t: deps.t('rdn_warm_title'), d: deps.t(lv >= 6 ? 'rdn_warm_text_ch' : 'rdn_warm_text', lv), dId: 'rdn-warm-text' },
          { id: 'rdn-plan-set', focus: 'plan-set', done: total > 0 && played >= total, partial: played > 0 && played < total, prog: total ? played / total : 0,
              pill: total ? played + '/' + total : undefined, t: deps.t('rdn_today_title'), d: daily ? rdnSetLine(state) : deps.t('rdn_no_set'), off: !daily },
          { id: 'rdn-plan-long', focus: 'plan-long', done: long, t: deps.t('rdn_long'), d: deps.t(long ? 'rdn_long_again' : 'rdn_long_d') },
      ];
  }
    /** Other ways to practice, as on Today: the scored exercise, the pieces, the voice. */
  function rdnToolsHtml() {
      const e = deps.rdEsc, tool = (attrs: string, title: string, text: string) => `<li><button type="button" class="tool" ${attrs}><span class="tool-t">${e(title)}</span>` +
          `<span class="tool-d">${e(text)}</span><span class="tool-go" aria-hidden="true">→</span></button></li>`;
      return `<ul class="tools" aria-labelledby="rdn-tools-h">` +
          tool('id="rdn-scored" data-rdn-focus="scored"', deps.t('rdn_scored'), deps.t('rdn_scored_d')) +
          tool('data-rdn-view="analysis" data-rdn-focus="tool-pieces"', deps.t('an_title'), deps.t('tool_analysis_d')) +
          tool('data-rdn-view="sing" data-rdn-focus="tool-voice"', deps.t('nav_sing'), deps.t('tool_sing_d')) + '</ul><p id="rdn-scored-status" role="status" hidden></p>';
  }
    /** The page head's right side, as on Today: the day streak, and today's set as dots. */
  function rdnStreakUi(state: ReadingBookState, today: string) {
      const box = maybeById('rdn-streak');
      if (!box)
          return;
      const daily = deps.RDN.noDaily ? null : state.daily, total = daily ? daily.slots.length : SRT_DAILY_PIECES, played = daily ? daily.done.filter((x) => x !== null).length : 0;
      const dots = Array.from({ length: total }, (_, i) => `<i${i < played ? ' class="on"' : ''}></i>`).join('');
      box.innerHTML = `<div><span class="big num" id="rdn-streak-n">${srtStreak(state, today)}</span><small class="streak-l">${deps.rdEsc(deps.t('streak_label'))}</small></div>` +
          `<div class="goaldots" role="img" aria-label="${deps.rdEsc(deps.t('rdn_goal_aria', played, total))}">${dots}</div><small class="goal-txt num">${deps.rdEsc(deps.t('rdn_goal_txt', played, total))}</small>`;
      box.hidden = false;
  }
    function rdnNumChip(n: number, stat: PieceStat | undefined, next: boolean) {
      const label = !stat ? deps.t('rdn_num_aria_none', n) : stat.stars === 0 ? deps.t('rdn_num_aria_star0', n) : stat.stars === 1 ? deps.t('rdn_num_aria_star1', n) : deps.t('rdn_num_aria_stars', n, stat.stars);
      return `<button type="button" class="rdn-num${stat ? ' played' : ''}${next ? ' next' : ''}" data-rdn-n="${n}" data-rdn-focus="n${n}" aria-label="${deps.rdEsc(label)}">` +
          `<b>${n}</b><small aria-hidden="true">${stat ? rdnStarText(stat.stars) : ''}</small></button>`;
  }
    /** The sign next to the colour of a key's status (the words are in the chip's label): a check for secure, a dot for started. */
  function rdnMark(status: string) {
      return status === 'secure' ? '<span class="rdn-mk rdn-mk-secure" aria-hidden="true">✓</span>' : status === 'started' ? '<span class="rdn-mk rdn-mk-started" aria-hidden="true">●</span>' : '';
  }
    function rdnUnitLabel(unit: BookUnit, named: boolean) {
      if (unit.kind === 'easy')
          return deps.t('rdn_unit_easy');
      if (unit.kind === 'newKey')
          return named ? rdnKeyName(srtReadingKey(unit.keys[0])) : deps.t('rdn_unit_newkey');
      return deps.t(unit.kind === 'check' ? 'rdn_unit_check' : 'rdn_unit_mix');
  }
    function rdnBookHtml(state: ReadingBookState, moreOpen: boolean) {
      const e = deps.rdEsc, lv = state.level, level = srtLevel(lv), focus = state.focusKey;
      const levels = srtLevels().map((l) => `<button type="button" class="rdn-lv" data-rdn-lv="${l.id}" data-rdn-focus="lv${l.id}" aria-pressed="${l.id === lv}" ` +
          `aria-label="${e(deps.t('rdn_level_aria', l.id, rdnLevelName(l.id)))}">${l.id}</button>`).join('');
      const pool = srtKeyPool(lv), poolIds: readonly string[] = pool.map((k) => k.id), rest = srtReadingKeys().filter((k) => !poolIds.includes(k.id));
      const chip = (k: ReadingKey) => {
          const st = srtKeyStatus(state, lv, k.id);
          const label = rdnKeyName(k) + ', ' + rdnSigWords(k.keyN) + (st === 'new' ? '' : ', ' + deps.t('rdn_status_' + st));
          return `<button type="button" class="rdn-key" data-rdn-key="${k.id}" data-rdn-focus="key-${k.id}" data-m="${st === 'secure' ? 2 : st === 'started' ? 1 : 0}" ` +
              `aria-pressed="${focus === k.id}" aria-label="${e(label)}"><b>${e(rdnKeyShort(k))}</b><small>${e(rdnSig(k.keyN))}</small>${rdnMark(st)}</button>`;
      };
      const mixed = `<button type="button" class="rdn-key rdn-mix" data-rdn-key="mix" data-rdn-focus="key-mix" aria-pressed="${focus === null}">` +
          `<b>${e(deps.t('rdn_mixed'))}</b><small>${e(deps.t('rdn_mixed_sub', pool.length))}</small></button>`;
      const open = moreOpen || (focus !== null && !poolIds.includes(focus));
      const others = rest.length ? `<details class="rdn-more" id="rdn-more-keys"${open ? ' open' : ''}><summary data-rdn-focus="more">${e(deps.t('rdn_other_keys'))}</summary>` +
          `<div class="rdn-keys" role="group" aria-label="${e(deps.t('rdn_other_keys'))}">${rest.map(chip).join('')}</div></details>` : '';
      let head = '', body = '';
      if (focus === null) {
          const tally = srtBookTally(state, lv), next = tally.next;
          const go = tally.done === 0 ? deps.t('rdn_go_start', 1) : next === null ? deps.t('rdn_go_replay', 1) : deps.t('rdn_go_continue', next);
          head = `<h3>${e(deps.t('rdn_book_head', lv))}</h3><span class="rdn-sub" id="rdn-book-done">${e(deps.t('rdn_done_of', tally.done, SRT_BOOK_PIECES))}</span>` +
              `<span class="rdn-sp"></span><button type="button" class="btn primary" id="rdn-book-go" data-rdn-n="${next ?? 1}" data-rdn-focus="book-go">${e(go)}</button>`;
          body = '<div class="rdn-units">' + srtBookUnits(lv).map((unit) => {
              const first = unit.index * SRT_UNIT_PIECES + 1;
              const nums = Array.from({ length: SRT_UNIT_PIECES }, (_, i) => first + i);
              const played = nums.filter((n) => state.pieces[srtBookId(lv, n)]).length;
              return `<section class="rdn-unit" aria-label="${e(deps.t('rdn_unit', unit.index + 1) + ', ' + rdnUnitLabel(unit, true))}"><div class="rdn-uh"><b>${e(deps.t('rdn_unit', unit.index + 1))}</b>` +
                  `<span>${e(rdnUnitLabel(unit, true))}</span>${unit.kind === 'newKey' ? `<span class="rdn-tag">${e(deps.t('rdn_new_key'))}</span>` : ''}` +
                  `<span class="rdn-uc">${played}/${SRT_UNIT_PIECES}</span></div><div class="rdn-nums8">` +
                  nums.map((n) => rdnNumChip(n, state.pieces[srtBookId(lv, n)], n === next)).join('') + '</div></section>';
          }).join('') + '</div>';
      }
      else {
          const key = srtReadingKey(focus), tally = srtFocusTally(state, lv, focus), next = tally.next;
          const go = tally.done === 0 ? deps.t('rdn_go_start', 1) : next === null ? deps.t('rdn_go_replay', 1) : deps.t('rdn_go_continue', next);
          head = `<h3>${e(deps.t('rdn_focus_head', rdnKeyName(key)))}</h3><span class="rdn-sub" id="rdn-book-done">${e(deps.t('rdn_done_of', tally.done, SRT_FOCUS_PIECES))}</span>` +
              `<span class="rdn-sp"></span><button type="button" class="btn primary" id="rdn-book-go" data-rdn-n="${next ?? 1}" data-rdn-focus="book-go">${e(go)}</button>`;
          body = `<div class="rdn-nums">${Array.from({ length: SRT_FOCUS_PIECES }, (_, i) => i + 1)
              .map((n) => rdnNumChip(n, state.pieces[srtFocusId(lv, focus, n)], n === next)).join('')}</div>`;
      }
      const patterns = level.newPatterns.map(rdnPattern).join(', ');
      return `<section class="rdn-card rdn-book" aria-labelledby="rdn-book-h">` +
          `<h3 class="rdn-book-t" id="rdn-book-h" tabindex="-1">${e(deps.t('rdn_book_title'))}</h3>` +
          `<div class="rdn-lab" id="rdn-lv-lab">${e(deps.t('rdn_level_label'))}</div><div class="rdn-levels" role="group" aria-labelledby="rdn-lv-lab">${levels}</div>` +
          `<p class="rdn-lvdesc"><b>${e(deps.t('rdn_level_head', lv, rdnLevelName(lv)))}</b><br>${e(deps.t('rdn_lv' + lv + '_desc'))}<br>` +
          `<span class="rdn-pat">${e(deps.t('rdn_new_patterns', patterns))}</span></p>` +
          `<div class="rdn-lab" id="rdn-k-lab">${e(deps.t('rdn_keys'))}</div><div class="rdn-keys" role="group" aria-labelledby="rdn-k-lab">${mixed}${pool.map(chip).join('')}</div>` +
          others +
          `<div class="rdn-legend"><span><i class="rdn-lg-secure"></i>${rdnMark('secure')}${e(deps.t('rdn_legend_secure'))}</span><span><i class="rdn-lg-started"></i>${rdnMark('started')}${e(deps.t('rdn_legend_started'))}</span></div>` +
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
          deps.rdnOpen(state.focusKey ? { kind: 'focus', level: state.level, key: state.focusKey, number: n } : { kind: 'book', level: state.level, number: n });
          return;
      }
      const slot = eventClosest(e, '[data-rdn-slot]');
      if (slot && state.daily) {
          deps.rdnOpen({ kind: 'daily', date: state.daily.date, slot: Number(slot.dataset.rdnSlot) });
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
              deps.rdnOpen({ kind: 'daily', date: state.daily.date, slot: Math.max(0, first) });
      }
      else if (id === 'rdn-long-go' || id === 'rdn-plan-long')
          deps.rdnOpen(rdnLongCtx(state, rdnToday()));
      else if (id === 'rdn-warm-go')
          deps.rdnWarmupStart();
      else if (id === 'rdn-scored')
          void deps.rdnOpenScored();
      else if (id === 'rdn-suggest-go' && state.level < 8)
          rdnChoose(state.level + 1, null);
  }

  return {
    rdnNormalized,
    rdnBook,
    rdnSetBook,
    rdnToday,
    rdnSeen,
    rdnLevelName,
    rdnKeyName,
    rdnKeyShort,
    rdnSig,
    rdnSigWords,
    rdnPattern,
    rdnCap,
    rdnStars,
    rdnStarText,
    rdnShowScreen,
    rdnSyncTabs,
    rdnFocusKey,
    rdnFocusHome,
    rdnWhenSaved,
    rdnHome,
    rdnLeaveView,
    get rdnEnsureDailyOf() { return rdnEnsureDailyOf; },
    set rdnEnsureDailyOf(value: typeof rdnEnsureDailyOf) { rdnEnsureDailyOf = value; },
    rdnEnsureDaily,
    rdnChoose,
    rdnRenderHome,
    rdnSetLine,
    rdnLongCtx,
    rdnHeroHtml,
    rdnPlanItems,
    rdnToolsHtml,
    rdnStreakUi,
    rdnNumChip,
    rdnMark,
    rdnUnitLabel,
    rdnBookHtml,
    rdnHomeClick,
  };
}

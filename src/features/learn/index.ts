import * as theory from '../../domain/theory.js';
import { byId, eventClosest, eventElement, maybeById, queryAllHtml, queryHtml } from '../../domain/dom.js';
import type { LStaffSpec } from '../../domain/score-types.js';
import type { AppHost, FeatureController, TestSurfaceRegistry } from '../../domain/views.js';
import {
  LEARN_GAPS, LEARN_OLD_ORDER, learnComplete, learnData, learnDueDays,
  learnGap, learnMarkLesson, learnUnitDone, learnUnitOf, type LearnReview,
} from '../../core/learn-progress.js';
import { localDayNumber } from '../../core/sync-merge.js';
import { LEARN_UNITS, LESSONS } from '../../locales/catalog.js';
import { loadLearn } from '../../locales/loader.js';
import type {
  LearnQuizSpec, LearnSummaryRow, LearnSummaryTranslations, LearnText, LearnUnit, LessonMetadata as Lesson,
} from '../../locales/content-types.js';
import type { LearnPayload } from '../../locales/payload-types.js';
import { LACC_CH, LDUR } from '../../domain/repertoire-data.js';
import type { InterfaceLanguage } from '../../types/architecture.js';
import { LBLUES, LVEL, createLearnStavesAndDemos, lVel } from './learn-staves-and-demos.js';
import {
  LLET, LNAT, LSPF, LSPS, LTEMPO, LW_PRESETS, LW_Q, LW_STEP,
  createLearnWidgets, lCofKey, lCofN, lCofTriad, lPitch, lStaffFit, lmMeter, lmTerm,
} from './learn-widgets.js';

const pc = theory.pitchClass;

function escHtml(s: string | number | undefined): string {
  return String(s).replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'));
}

function shuffle<T>(src: readonly T[]): T[] {
  const a = src.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A quiz question while it is being answered. */
interface LearnQuizRunQuestion extends LearnQuizSpec {
  opts?: { index: number; ok: boolean }[];
  got: number[];
  gotMidis: number[];
  ans: boolean;
  ok: boolean;
  pick?: number;
}

interface LearnQuizRun {
  id: string;
  qs: LearnQuizRunQuestion[];
  i: number;
  score: number;
  done: boolean;
  rev?: boolean;
}

export function lqNeed(n: number): number {
  return Math.max(1, Math.round(n * 0.7));
}

export function lqMidis(q: LearnQuizSpec): number[] {
  const ps = q.pcs || q.seq;
  if (!ps) throw new TypeError('Étude: quiz question has nothing to play');
  return q.exactMidi ? q.exactMidi.slice() : ps.map((p) => 60 + p);
}

export function lgNorm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function createLearnFeature(host: AppHost): FeatureController {
  let mounted = false;
  let learnWired = false;
  let learnSel = 0;
  let LGEN = 0;
  let LQ: LearnQuizRun | null = null;
  let learnGloss = false;
  let learnLightTimer: ReturnType<typeof setTimeout> | undefined;

  let LQZ: LearnPayload['LQZ'] = {};
  let LSUM: LearnPayload['LSUM'] = {};
  const LSUM_I18N: LearnSummaryTranslations = {};
  let GLOSS: LearnPayload['GLOSS'] = [];
  let learnPayload: LearnPayload | null = null;
  let learnLanguage: InterfaceLanguage | null = null;
  let learnRequest = 0;
  let learnLoading: Promise<void> | null = null;
  let LSTAVES: Record<string, LStaffSpec> = {};
  let learnStaffReady = false;

  const LT = (a: LearnText): string => (Array.isArray(a) ? (host.i18n.lang() === 'ro' ? a[1] : a[0]) : a);
  const learnTitle = (L: Lesson): string => L[host.i18n.lang()]?.t || L.en.t;
  const learnCtxTime = (): number => {
    const ctx = host.audio.context();
    return ctx ? ctx.currentTime : performance.now() / 1000;
  };

  async function loadLearnStaves(): Promise<void> {
    if (learnStaffReady) return;
    ({ LSTAVES } = await import('../../domain/learn-staves.js'));
    learnStaffReady = true;
  }

  function installLearn(language: InterfaceLanguage, payload: LearnPayload): void {
    learnPayload = payload;
    learnLanguage = language;
    ({ LQZ, LSUM, GLOSS } = payload);
  }

  function learnSay(msg: string | null): void {
    const l = maybeById('learnLive');
    if (!l) return;
    l.textContent = '';
    setTimeout(() => { l.textContent = msg; }, 30);
  }

  function learnTimer(fn: () => void, ms: number): void {
    const g = LGEN;
    setTimeout(() => {
      if (g !== LGEN || host.nav.activeView() !== 'learn') return;
      fn();
    }, ms);
  }

  function learnLight(ms: number[], dur: number): void {
    const g = LGEN;
    host.dock.clear('target');
    ms.forEach((m) => host.dock.mark(m, 'target', true));
    clearTimeout(learnLightTimer);
    learnLightTimer = setTimeout(() => {
      if (g === LGEN) host.dock.clear('target');
    }, dur);
  }

  function lSeqLight(chords: number[][], stepMs: number, holdMs: number): void {
    chords.forEach((ms, i) => learnTimer(() => {
      host.dock.clear('target');
      ms.forEach((m) => host.dock.mark(m, 'target', true));
    }, i * stepMs));
    learnTimer(() => host.dock.clear('target'), (chords.length - 1) * stepMs + (holdMs || stepMs));
  }

  function learnReveal(el: Element): void {
    const r = el.getBoundingClientRect();
    const lim = host.dock.fixedBottomTop() - 16;
    if (r.bottom > lim) scrollBy(0, r.bottom - lim);
    else if (r.top < 80) scrollBy(0, r.top - 80);
  }

  let lmStopRef: () => void = () => {};

  function learnHalt(): void {
    LGEN++;
    host.previews.stopAll();
    host.dock.clear('target');
    lmStopRef();
    queryAllHtml(document, '#learnBody [data-s="now"]').forEach((e) => delete e.dataset.s);
    document.querySelectorAll('#learnBody .lbars .on, #learnBody .lbeat .on').forEach((e) => e.classList.remove('on'));
    document.querySelectorAll('#learnBody [data-lplay][aria-pressed="true"]').forEach((b) => {
      b.setAttribute('aria-pressed', 'false');
      b.textContent = host.i18n.t('lu_play_ex');
    });
  }

  const widgets = createLearnWidgets({
    host,
    learnHalt,
    learnLight,
    lSeqLight,
    learnSay,
    learnReveal,
    learnCtxTime,
  });
  lmStopRef = widgets.lmStop;

  const stavesAndDemos = createLearnStavesAndDemos({
    host,
    getStaves: () => LSTAVES,
    lt: LT,
    getGen: () => LGEN,
    learnHalt,
    learnTimer,
    learnLight,
    lSeqLight,
    learnSay,
    learnCtxTime,
  });

  function learnInitSel(): void {
    if (renderLearn._init) return;
    renderLearn._init = true;
    const D = learnData(host.store.data());
    let id = D.learnSelId;
    if (!id && D.learnSel !== undefined && Number.isInteger(D.learnSel)) {
      id = LEARN_OLD_ORDER[D.learnSel];
    }
    const i = LESSONS.findIndex((L) => L.id === id);
    learnSel = i >= 0 ? i : 0;
  }

  function learnSide(): void {
    const toc = byId('learnToc');
    if (!toc) return;
    const d = host.store.data();
    const D = learnData(d);
    const done = D.learnDone;
    const tn = localDayNumber();
    const nDone = LESSONS.filter((L) => done[L.id]).length;
    byId('learnMeta').textContent = host.i18n.t('learn_read_n', nDone, LESSONS.length);
    byId('learnProg').style.width = Math.round(100 * nDone / LESSONS.length) + '%';
    let h = '';
    let opt = '';
    const lang = host.i18n.lang();
    LEARN_UNITS.forEach((u, ui) => {
      const nm = u[lang] || u.en;
      h += '<div class="lu-h"><span aria-hidden="true">' + u.icon + '</span><span class="lu-nm">' + nm + '</span><span class="lu-c">' +
        host.i18n.t('lu_done_n', learnUnitDone(d, ui), u.ls.length) + '</span></div>';
      opt += '<optgroup label="' + nm + '">';
      u.ls.forEach((id) => {
        const i = LESSONS.findIndex((L) => L.id === id);
        if (i < 0) return;
        const L = LESSONS[i];
        const due = learnDueDays(d, id, tn) != null;
        h += '<button type="button" data-li="' + i + '" aria-current="' + (i === learnSel && !learnGloss) + '"><span class="ic" aria-hidden="true">' + L.icon + '</span>' + learnTitle(L) +
          (due ? '<span class="due" role="img" aria-label="' + host.i18n.t('lu_due') + '">↻</span>' : done[id] ? '<span class="done" role="img" aria-label="' + host.i18n.t('learn_done_aria') + '">✓</span>' : '') + '</button>';
        opt += '<option value="' + i + '"' + (i === learnSel ? ' selected' : '') + '>' + learnTitle(L) + (done[id] ? ' ✓' : '') + '</option>';
      });
      opt += '</optgroup>';
    });
    toc.innerHTML = h;
    byId('learnExtra').innerHTML = '<label class="learn-pick"><span>' + host.i18n.t('lu_pick') + '</span><select id="learnPick">' + opt +
      '</select></label><button type="button" class="btn ghost sm" id="learnGlossBtn" aria-pressed="' + learnGloss + '">📖 ' + host.i18n.t('lu_gloss') + '</button>';
  }

  function learnNavRender(): void {
    const nav = byId('learnBody').querySelector('.learn-nav');
    if (!nav) return;
    const L = LESSONS[learnSel];
    const D = learnData(host.store.data());
    const isRead = !!D.learnDone[L.id];
    const last = learnSel === LESSONS.length - 1;
    nav.innerHTML = '<button type="button" class="btn ghost sm" data-ln="prev"' + (learnSel === 0 ? ' disabled' : '') + '>' + host.i18n.t('learn_prev') + '</button>' +
      '<div class="mid">' + (isRead ? '<span class="read-ok">✓ ' + host.i18n.t('lu_complete') + '</span><button type="button" class="btn ghost sm" data-ln="unmark">' + host.i18n.t('learn_unmark') + '</button>' : '') + '</div>' +
      '<button type="button" class="btn ghost sm" data-ln="next"' + (last ? ' disabled' : '') + '>' + host.i18n.t('learn_next') + '</button>';
  }

  function lqLabel(spec: LearnQuizSpec, index: number): string {
    const option = spec.o?.[index];
    return spec.i18n?.[host.i18n.lang()]?.o?.[index] ?? (option === undefined ? '' : LT(option));
  }

  function lqFeedback(q: LearnQuizRunQuestion, spec: LearnQuizSpec): string {
    const why = spec.i18n?.[host.i18n.lang()]?.why ?? (spec.why ? LT(spec.why) : '');
    const right = q.opts ? q.opts.find((option) => option.ok) : undefined;
    const message = !q.opts
      ? (q.ok ? host.i18n.t('lu_q_ok') : host.i18n.t('lu_q_no', lqMidis(q).map((m) => host.i18n.pcName(pc(m), false)).join(' – ')))
      : (q.ok || !right ? host.i18n.t('lu_q_ok') : host.i18n.t('lu_q_no', lqLabel(spec, right.index)));
    return why ? message + ' ' + why : message;
  }

  function lqRender(): void {
    const box = maybeById('lq');
    if (!box) return;
    const d = host.store.data();
    const L = LESSONS[learnSel];
    const qz = LQZ[L.id] || [];
    const D = learnData(d);
    const done = !!D.learnDone[L.id];
    const rv: Partial<LearnReview> = D.learnRev[L.id] || {};
    const lastDay = typeof rv.last === 'number' && Number.isFinite(rv.last) ? (rv.last | 0) : 0;
    const bestScore = typeof rv.best === 'number' && Number.isFinite(rv.best) ? rv.best : null;
    const tn = localDayNumber();
    let h = '<h4 id="lq-h">✎ ' + escHtml(host.i18n.t('lu_quiz')) + '</h4>';
    if (!LQ || LQ.id !== L.id) {
      h += '<p class="lq-d">' + escHtml(host.i18n.t('lu_quiz_d', qz.length, lqNeed(qz.length))) + '</p>';
      if (done) {
        h += '<p class="lq-st">' + (learnDueDays(d, L.id, tn) != null
          ? '<span class="lq-due">↻ ' + escHtml(host.i18n.t('lu_due_now')) + '</span>'
          : '<span class="read-ok">' + escHtml(host.i18n.t('lu_complete_rev', Math.max(0, learnGap(d, L.id) - (tn - lastDay)))) + '</span>') +
          (bestScore != null ? ' · ' + escHtml(host.i18n.t('lu_q_score', bestScore)) : '') + '</p>';
      }
      h += '<div class="lq-act"><button type="button" class="btn primary" data-lq="start">' + escHtml(host.i18n.t('lu_q_start')) + '</button>' +
        (done ? '' : '<button type="button" class="btn ghost sm" data-ln="mark">' + escHtml(host.i18n.t('lu_mark_manual')) + '</button>') + '</div>';
    } else if (LQ.done) {
      const n = LQ.qs.length;
      const need = lqNeed(n);
      const pass = LQ.score >= need;
      const sc = LQ.score + '/' + n;
      h += '<p class="lq-res" data-r="' + (pass ? 'good' : 'bad') + '">' +
        (pass ? (LQ.rev ? host.i18n.t('lu_q_review', sc, learnGap(d, L.id)) : host.i18n.t('lu_q_pass', sc)) : host.i18n.t('lu_q_fail', sc, need)) + '</p>';
      h += '<div class="lq-act"><button type="button" class="btn ghost sm" data-lq="start">' + host.i18n.t('lu_q_retry') + '</button>' +
        (pass && learnSel < LESSONS.length - 1 ? '<button type="button" class="btn primary" data-ln="next">' + host.i18n.t('learn_next') + '</button>' : '') + '</div>';
    } else {
      const q = LQ.qs[LQ.i];
      const spec = qz[LQ.i] ?? q;
      const ps = q.pcs || q.seq;
      const loc = spec.i18n?.[host.i18n.lang()];
      h += '<p class="lq-n">' + host.i18n.t('lu_q_n', LQ.i + 1, LQ.qs.length) + '</p><p class="lq-q" id="lq-q">' + (loc?.q || LT(spec.q)) + '</p>';
      if (q.hear) {
        h += '<p><button type="button" class="btn ghost sm demo" data-demo="' + q.hear + '">' + host.i18n.t('lu_q_hear') + '</button></p>';
      }
      if (ps) {
        const tot = ps.length;
        h += '<p class="lq-play">🎹 ' + host.i18n.t('lu_q_play') + '</p><p class="lq-got" aria-hidden="true">' +
          Array.from({ length: tot }, (_, i) => '<i' + (i < q.got.length ? ' class="on"' : '') + '></i>').join('') +
          ' <span>' + host.i18n.t('lu_q_got', q.got.length, tot) + '</span></p>';
        if (!q.ans) h += '<div class="lq-act"><button type="button" class="btn ghost sm" data-lq="show">' + host.i18n.t('lu_q_show') + '</button></div>';
      } else if (!q.opts) {
        throw new TypeError('Étude: quiz question has no options');
      } else {
        h += '<div class="lq-opts" role="group" aria-labelledby="lq-q">' + q.opts.map((o, i) =>
          '<button type="button" class="lq-o" data-lqo="' + i + '"' +
          (q.ans ? ' disabled' + (o.ok ? ' data-r="good"' : (q.pick === i ? ' data-r="bad"' : '')) : '') + '>' +
          lqLabel(spec, o.index) + '</button>').join('') + '</div>';
      }
      if (q.ans) {
        h += '<p class="lq-fb" data-r="' + (q.ok ? 'good' : 'bad') + '">' + lqFeedback(q, spec) +
          '</p><div class="lq-act"><button type="button" class="btn primary" data-lq="next">' +
          host.i18n.t(LQ.i < LQ.qs.length - 1 ? 'lu_q_next' : 'lu_q_finish') + '</button></div>';
      }
    }
    box.innerHTML = h;
  }

  function lqFocus(sel: string): void {
    const lq = maybeById('lq');
    const el = lq && lq.querySelector(sel);
    if (el instanceof HTMLElement) {
      el.focus({ preventScroll: true });
      learnReveal(el);
    }
  }

  function lqStart(L: Lesson): void {
    const qs = (LQZ[L.id] || []).map((q) => {
      const opts = q.o && shuffle(q.o.map((_, index) => ({ index, ok: index === (q.a || 0) })));
      return { ...q, opts, got: [], gotMidis: [], ans: false, ok: false };
    });
    LQ = { id: L.id, qs, i: 0, score: 0, done: false };
    lqRender();
  }

  function lqAnswer(ok: boolean): void {
    if (!LQ) return;
    const q = LQ.qs[LQ.i];
    q.ans = true;
    q.ok = ok;
    if (ok) LQ.score++;
    lqRender();
    learnSay(lqFeedback(q, LQZ[LQ.id]?.[LQ.i] ?? q));
    lqFocus('[data-lq="next"]');
  }

  function lqPick(i: number): void {
    const q = LQ && LQ.qs[LQ.i];
    const option = q?.opts?.[i];
    if (!q || q.ans || !option) return;
    q.pick = i;
    lqAnswer(option.ok);
  }

  function lqNext(): void {
    if (!LQ) return;
    if (LQ.i < LQ.qs.length - 1) {
      LQ.i++;
      host.dock.clear('target');
      lqRender();
      lqFocus('.lq-o,[data-lq="show"],.lq-q');
      return;
    }
    LQ.done = true;
    host.dock.clear('target');
    const L = LESSONS[learnSel];
    const n = LQ.qs.length;
    const pass = LQ.score >= lqNeed(n);
    if (pass) {
      const r = learnComplete(host.store.data(), L, Math.round(100 * LQ.score / n), localDayNumber());
      host.store.saveNow();
      LQ.rev = r.review;
      learnSide();
      learnNavRender();
    }
    lqRender();
    learnSay(byId('lq').querySelector('.lq-res')?.textContent || '');
    lqFocus('.lq-act button');
  }

  function lqShow(): void {
    const q = LQ && LQ.qs[LQ.i];
    if (!q || q.ans) return;
    const ms = lqMidis(q);
    learnLight(ms, 4000);
    host.audio.ensure();
    void host.audio.preparePiano().then((ok) => {
      if (ok) ms.forEach((m, i) => host.audio.previewNote(m, learnCtxTime() + 0.05 + (q.seq ? i * 0.45 : 0), 0.9, 90));
    });
    lqAnswer(false);
  }

  function learnInput(midi?: number): void {
    const heldMidis = host.input.heldMidis();
    const m = midi ?? heldMidis[heldMidis.length - 1];
    if (m == null || !LQ || LQ.done) return;
    const q = LQ.qs[LQ.i];
    if (!q || q.ans || !(q.pcs || q.seq)) return;
    const p = pc(m);
    const tot = (q.exactMidi || q.pcs || q.seq || []).length;
    if (q.exactMidi) {
      if (q.exactMidi.includes(m)) {
        if (!q.gotMidis.includes(m)) {
          q.gotMidis.push(m);
          q.got.push(p);
        }
      } else {
        q.got = [];
        q.gotMidis = [];
        lqRender();
        learnSay(host.i18n.t('lu_q_wrongnote', host.i18n.noteName(m, false)));
        return;
      }
    } else if (q.pcs) {
      if (q.pcs.includes(p)) {
        if (!q.got.includes(p)) q.got.push(p);
      } else {
        q.got = [];
        q.gotMidis = [];
        lqRender();
        learnSay(host.i18n.t('lu_q_wrongnote', host.i18n.pcName(p, false)));
        return;
      }
    } else {
      const seq = q.seq || [];
      const idx = q.got.length;
      const stepOk = !q.stepDiff || idx === 0 || m - q.gotMidis[idx - 1] === q.stepDiff[idx - 1];
      if (seq[idx] === p && stepOk) {
        q.got.push(p);
        q.gotMidis.push(m);
      } else {
        if (seq[0] === p) {
          q.got = [p];
          q.gotMidis = [m];
        } else {
          q.got = [];
          q.gotMidis = [];
        }
        lqRender();
        learnSay(host.i18n.t('lu_q_wrongnote', q.stepDiff ? host.i18n.noteName(m, false) : host.i18n.pcName(p, false)));
        return;
      }
    }
    if (q.got.length >= tot) lqAnswer(true);
    else {
      lqRender();
      learnSay(host.i18n.t('lu_q_got', q.got.length, tot));
    }
  }

  function lgHTML(): string {
    const lang = host.i18n.lang();
    const k = (GLOSS[0] && GLOSS[0][lang]) ? lang : 'en';
    const list = GLOSS.slice().sort((a, b) => (a[k] ? a[k][0] : a.en[0]).localeCompare(b[k] ? b[k][0] : b.en[0], lang));
    return '<h3 tabindex="-1">📖 ' + host.i18n.t('lg_title') + '</h3><label class="lg-search"><span>' + host.i18n.t('lg_search') +
      '</span><input type="search" id="lg-q" placeholder="' + host.i18n.t('lg_ph') + '" autocomplete="off"></label>' +
      '<p class="lg-n" id="lg-n" aria-live="polite"></p><dl class="lg-list">' + list.map((g) => {
        const L = LESSONS.find((x) => x.id === g.l);
        const cur = g[k] || g.en;
        return '<div class="lg-it" data-k="' + lgNorm(cur[0] + ' ' + cur[1] + ' ' + g.searchEnglish).replace(/"/g, '') + '"><dt>' + cur[0] + '</dt><dd>' + cur[1] +
          (L ? ' <a href="#" data-lgo="' + L.id + '">' + L.icon + ' ' + learnTitle(L) + '</a>' : '') + '</dd></div>';
      }).join('') + '</dl><div class="learn-nav"><button type="button" class="btn ghost sm" data-lgback="1">' + host.i18n.t('lg_close') + '</button></div>';
  }

  function lgFilter(): void {
    const qEl = maybeById('lg-q');
    const q = qEl instanceof HTMLInputElement ? qEl : null;
    const v = q ? lgNorm(q.value.trim()) : '';
    let n = 0;
    queryAllHtml(document, '#learnBody .lg-it').forEach((it) => {
      const on = !v || (it.dataset.k ?? '').includes(v);
      it.hidden = !on;
      if (on) n++;
    });
    const o = maybeById('lg-n');
    if (o) o.textContent = n ? host.i18n.t('lg_n', n) : host.i18n.t('lg_none', q ? q.value.trim() : '');
  }

  function learnGo(i: number): void {
    learnSel = Math.max(0, Math.min(LESSONS.length - 1, i));
    const d = host.store.data();
    learnData(d).learnSelId = LESSONS[learnSel].id;
    d.learnSel = learnSel;
    renderLearn._init = true;
    learnGloss = false;
    LQ = null;
    host.store.saveNow();
    renderLearn();
    const g = document.querySelector('#view-learn .learn-grid');
    if (g && g.getBoundingClientRect().top < 70) g.scrollIntoView({ block: 'start' });
    const h = byId('learnBody').querySelector('h3');
    if (h) {
      h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    }
  }

  function learnGoId(id: string): void {
    const i = LESSONS.findIndex((L) => L.id === id);
    if (i < 0) return;
    if (host.nav.activeView() !== 'learn') {
      learnSel = i;
      learnData(host.store.data()).learnSelId = id;
      renderLearn._init = true;
      learnGloss = false;
      LQ = null;
      void host.nav.show('learn', { learnLessonId: id });
    } else {
      learnGo(i);
    }
  }

  function learnWire(): void {
    if (learnWired) return;
    learnWired = true;
    const side = document.querySelector('#view-learn .learn-side');
    const toc = byId('learnToc');
    const ex = document.createElement('div');
    ex.id = 'learnExtra';
    ex.className = 'learn-extra';
    toc.after(ex);
    const live = document.createElement('div');
    live.id = 'learnLive';
    live.className = 'visually-hidden';
    live.setAttribute('aria-live', 'polite');
    side?.appendChild(live);
    toc.addEventListener('click', (e) => {
      const b = eventClosest(e, '[data-li]');
      if (b) learnGo(Number(b.dataset.li));
    });
    ex.addEventListener('change', (e) => {
      const pick = e.target;
      if (pick instanceof HTMLSelectElement && pick.id === 'learnPick') learnGo(+pick.value);
    });
    ex.addEventListener('click', (e) => {
      if (eventClosest(e, '#learnGlossBtn')) {
        learnGloss = !learnGloss;
        LQ = null;
        renderLearn();
        const s = maybeById('lg-q');
        if (s) s.focus();
      }
    });
    const body = byId('learnBody');
    body.addEventListener('click', (e) => learnClick(e));
    body.addEventListener('keydown', (e) => {
      const tg = eventElement(e);
      const g = tg && tg.closest('.lstaff .ss-n');
      if (g instanceof SVGElement && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        void stavesAndDemos.lStaffNote(g);
      }
    });
    body.addEventListener('input', (e) => {
      const tg = eventElement(e);
      if (tg && tg.id === 'lg-q') lgFilter();
      else widgets.lwInput(e);
    });
    body.addEventListener('change', (e) => widgets.lwInput(e));
    // A rail entry scrolls to its section and moves focus there (buttons, not "#" links, which would change the view).
    maybeById('learnRail')?.addEventListener('click', (e) => {
      const b = eventClosest(e, '[data-lsec]');
      const head = b ? learnRailHeads()[Number(b.dataset.lsec)] : undefined;
      if (!head) return;
      head.tabIndex = -1;
      head.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      head.focus({ preventScroll: true });
    });
    learnRailWide();
    learnRailMq?.addEventListener('change', learnRailPlace);
  }

  // Wide screens (1360px and up): a right rail beside the lesson with an outline of its sections and the cheat sheet.
  // The cheat sheet is one node that moves between the lesson and the rail, so it is never shown or read twice.
  const LEARN_RAIL_MQ = '(min-width: 1360px)';
  let learnRailMq: MediaQueryList | null = null;
  function learnRailWide(): boolean {
    learnRailMq ??= typeof matchMedia === 'function' ? matchMedia(LEARN_RAIL_MQ) : null;
    return !!learnRailMq?.matches;
  }
  function learnRailHeads(): HTMLElement[] {
    return queryAllHtml(byId('learnBody'), '.learn-content h4, #lq-h');
  }
  function learnRailPlace(): void {
    const rail = maybeById('learnRail'), body = byId('learnBody');
    const sum = document.querySelector('#view-learn .lsum');
    if (!rail || !(sum instanceof HTMLElement)) return;
    if (learnRailWide() && rail.childElementCount) rail.appendChild(sum);
    else if (sum.parentElement !== body) body.insertBefore(sum, body.querySelector('#lq, .learn-nav'));
  }
  function learnRailRender(): void {
    const rail = maybeById('learnRail');
    const grid = rail?.parentElement;
    if (!rail || !grid) return;
    const heads = learnRailHeads();
    if (learnGloss || !heads.length) {
      rail.innerHTML = '';
      grid.classList.remove('has-rail');
      return;
    }
    // Section names without their leading icon ("✎ Check yourself" → "Check yourself").
    const items = heads.map((h, i) => '<li><button type="button" data-lsec="' + i + '">' +
      escHtml((h.textContent ?? '').replace(/^[^\p{L}\p{N}]+/u, '')) + '</button></li>').join('');
    rail.innerHTML = '<nav class="lrail-out" aria-labelledby="lrail-h"><h4 id="lrail-h">' + escHtml(host.i18n.t('lu_outline')) + '</h4><ul>' + items + '</ul></nav>';
    grid.classList.add('has-rail');
    learnRailPlace();
  }

  function learnBodyHTML(L: Lesson): string {
    return learnPayload?.LESSONS[L.id]?.b ?? '';
  }

  let renderLearn: { (fromLoad?: boolean, signal?: AbortSignal): void; _init?: boolean } = function renderLearnImpl(
    fromLoad = false,
    signal?: AbortSignal,
  ): void {
    const body = byId('learnBody');
    if (!body || !byId('learnToc')) return;
    const lang = host.i18n.lang();
    if (learnLanguage !== lang || !learnStaffReady) {
      learnWire();
      learnInitSel();
      learnSide();
      learnHalt();
      body.replaceChildren();
      const loading = document.createElement('p');
      loading.className = 'view-loading';
      loading.setAttribute('role', 'status');
      loading.setAttribute('aria-live', 'polite');
      loading.dataset.lazyLoading = '';
      loading.textContent = host.i18n.localize('loading', 'Loading…');
      body.append(loading);
      const requestedLanguage = lang;
      const request = ++learnRequest;
      learnLoading = Promise.all([loadLearn(requestedLanguage), loadLearnStaves()]).then(([payload]) => {
        if (signal?.aborted || request !== learnRequest || requestedLanguage !== host.i18n.lang() || host.nav.activeView() !== 'learn') return;
        installLearn(requestedLanguage, payload);
        renderLearn(true, signal);
      }).catch(() => {
        if (signal?.aborted || request !== learnRequest || requestedLanguage !== host.i18n.lang() || host.nav.activeView() !== 'learn') return;
        body.querySelector('[data-lazy-loading]')?.remove();
        host.overlays.showLoadError(async () => { renderLearn(); await learnLoading; }, body);
      });
      return;
    }
    learnWire();
    learnInitSel();
    // Loading already halted the previous lesson. Do not clear newer keyboard input on completion.
    if (!fromLoad) learnHalt();
    learnSide();
    if (learnGloss) {
      body.innerHTML = lgHTML();
      lgFilter();
      learnRailRender();
      return;
    }
    const L = LESSONS[learnSel];
    const ui = learnUnitOf(L.id);
    const u = LEARN_UNITS[ui];
    const rl = u ? host.nav.nextReadDrillForUnits(u.rd) : null;
    let h = '<div class="lu-bar"><span class="lu-unit"><span aria-hidden="true">' + (u ? u.icon : '') + '</span> ' +
      host.i18n.t('lu_unit', ui + 1, LEARN_UNITS.length) + ' · <b>' + (u ? (u[lang] || u.en) : '') + '</b></span>' +
      (rl ? '<button type="button" class="btn ghost sm" data-rd="' + rl.id + '" aria-label="' + host.i18n.t('lu_practise_aria') + ': ' + rl.name + '">' + host.i18n.t('lu_practise', rl.name) + ' →</button>' : '') +
      '</div><h3>' + learnTitle(L) + '</h3>';
    h += '<div class="learn-content">' + learnBodyHTML(L) + '</div>';
    const sum: LearnSummaryRow[] | undefined = LSUM[L.id];
    if (sum) {
      h += '<section class="lsum" aria-labelledby="lsum-h"><h4 id="lsum-h">📋 ' + host.i18n.t('lu_sum') + '</h4><dl>' +
        sum.map((r, ri) => {
          const sRow = LSUM_I18N[lang]?.[L.id]?.[ri] ?? [LT(r[0]), LT(r[1])];
          return '<div><dt>' + sRow[0] + '</dt><dd>' + sRow[1] + '</dd></div>';
        }).join('') + '</dl></section>';
    }
    if (LQZ[L.id]) h += '<section class="lq" id="lq" aria-labelledby="lq-h"></section>';
    h += '<div class="learn-nav"></div>';
    body.innerHTML = h;
    queryAllHtml(body, '[data-staff]').forEach((el) => { el.outerHTML = stavesAndDemos.lStaffHTML(el.dataset.staff ?? ''); });
    queryAllHtml(body, '[data-widget]').forEach((el) => widgets.lwMount(el));
    body.querySelectorAll('[data-bars]').forEach((el) => { el.outerHTML = stavesAndDemos.lBarsHTML(); });
    body.querySelectorAll('[data-an]').forEach((el) => {
      if (!el.textContent.trim()) el.textContent = host.i18n.t('lu_an_btn');
    });
    if (LQ && LQ.id !== L.id) LQ = null;
    lqRender();
    learnRailRender();
    learnNavRender();
    const cur = byId('learnToc').querySelector('[aria-current="true"]');
    const toc = byId('learnToc');
    if (cur && toc.scrollHeight > toc.clientHeight) cur.scrollIntoView({ block: 'nearest' });
  };

  function learnClick(e: Event): void {
    const g = eventClosest(e, '[data-go]');
    if (g) {
      e.preventDefault();
      const c = g.dataset.cat;
      const extab = g.dataset.extab;
      if (extab || c) {
        void host.nav.show(g.dataset.go, {
          ...(extab ? { extab } : {}),
          ...(c ? { practiceTopic: c } : {}),
        });
      } else {
        void host.nav.show(g.dataset.go);
      }
      return;
    }
    if (eventClosest(e, '[data-lgback]')) {
      learnGloss = false;
      renderLearn();
      return;
    }
    const lg = eventClosest(e, '[data-lgo]');
    if (lg) {
      e.preventDefault();
      learnGloss = false;
      learnGoId(lg.dataset.lgo ?? '');
      return;
    }
    const li = eventClosest(e, '[data-li]');
    if (li) {
      learnGo(Number(li.dataset.li));
      return;
    }
    const ln = eventClosest(e, '[data-ln]');
    if (ln) {
      const a = ln.dataset.ln;
      const L = LESSONS[learnSel];
      if (a === 'prev') learnGo(learnSel - 1);
      else if (a === 'next') learnGo(learnSel + 1);
      else if (a === 'mark') {
        learnMarkLesson(host.store.data(), L, true, localDayNumber());
        host.store.saveNow();
        learnSide();
        lqRender();
        learnNavRender();
        learnSay(host.i18n.t('lu_complete'));
      } else if (a === 'unmark') {
        learnMarkLesson(host.store.data(), L, false, localDayNumber());
        host.store.saveNow();
        LQ = null;
        learnSide();
        lqRender();
        learnNavRender();
      }
      return;
    }
    const lq = eventClosest(e, '[data-lq]');
    if (lq) {
      const a = lq.dataset.lq;
      if (a === 'start') {
        lqStart(LESSONS[learnSel]);
        lqFocus('.lq-o,[data-lq="show"],.lq-q');
      } else if (a === 'next') lqNext();
      else if (a === 'show') lqShow();
      return;
    }
    const lo = eventClosest(e, '[data-lqo]');
    if (lo) {
      lqPick(Number(lo.dataset.lqo));
      return;
    }
    const lp = eventClosest(e, '[data-lplay]');
    if (lp) {
      void stavesAndDemos.lStaffPlay(lp.dataset.lplay ?? '', lp);
      return;
    }
    const snFrom = eventElement(e);
    const sn = snFrom && snFrom.closest('.lstaff .ss-n');
    if (sn instanceof SVGElement) {
      void stavesAndDemos.lStaffNote(sn);
      return;
    }
    const rd = eventClosest(e, '[data-rd]');
    if (rd) {
      void host.nav.show('read', { readingDrillId: rd.dataset.rd ?? '' });
      return;
    }
    const an = eventClosest(e, '[data-an]');
    if (an) {
      void host.nav.show('analysis', { pieceId: an.dataset.an ?? '' });
      return;
    }
    const w = eventClosest(e, '[data-w]');
    if (w) {
      void widgets.lwClick(w);
      return;
    }
    const d = eventClosest(e, '.demo');
    if (d) void stavesAndDemos.runDemo(d.dataset.demo, d);
  }

  function mount(): void {
    if (mounted) return;
    mounted = true;
    learnWire();
    host.input.subscribe((event) => {
      if (host.nav.activeView() === 'learn' && event.kind === 'on') {
        learnInput(event.midi);
      }
    });
  }

  function enter(params: Readonly<Record<string, unknown>> | undefined, signal: AbortSignal): void {
    if (signal.aborted) return;
    if (typeof params?.learnLessonId === 'string' && params.learnLessonId) {
      const idx = LESSONS.findIndex((L) => L.id === params.learnLessonId);
      if (idx >= 0) {
        learnSel = idx;
        learnData(host.store.data()).learnSelId = params.learnLessonId;
        renderLearn._init = true;
        learnGloss = false;
        LQ = null;
      }
    }
    renderLearn(false, signal);
  }

  function leave(): void {
    learnHalt();
  }

  function panic(): void {
    if (host.nav.activeView() === 'learn') learnHalt();
    else widgets.lmStop();
  }

  function localize(): void {
    learnRequest++;
    if (host.nav.activeView() === 'learn') renderLearn();
  }

  function onStorageSync(): void {
    if (host.nav.activeView() === 'learn' && learnWired) {
      const active = document.activeElement;
      const lesson = active instanceof HTMLElement ? active.dataset.li : undefined;
      const nav = active instanceof HTMLElement ? active.dataset.ln : undefined;
      const id = active?.id;
      learnSide();
      learnNavRender();
      const next = lesson
        ? queryHtml(byId('learnToc'), `[data-li="${lesson}"]`)
        : nav
          ? queryHtml(byId('learnBody'), `[data-ln="${nav}"]`)
          : id === 'learnPick' || id === 'learnGlossBtn'
            ? maybeById(id)
            : null;
      next?.focus({ preventScroll: true });
    }
  }

  function onProgressReset(): void {
    renderLearn._init = false;
    learnSel = 0;
  }

  function registerTestSurface(registry: TestSurfaceRegistry): void {
    registry.define({
      LACC_CH: { get: () => LACC_CH },
      LBLUES: { get: () => LBLUES },
      LDUR: { get: () => LDUR },
      LEARN_GAPS: { get: () => LEARN_GAPS },
      LEARN_OLD_ORDER: { get: () => LEARN_OLD_ORDER },
      LGEN: { get: () => LGEN },
      LLET: { get: () => LLET },
      LM: { get: () => widgets.LM },
      LNAT: { get: () => LNAT },
      LQ: { get: () => LQ },
      LSPF: { get: () => LSPF },
      LSPS: { get: () => LSPS },
      LSR: { get: () => stavesAndDemos.LSR },
      LSTAVES: { get: () => LSTAVES },
      LT: { get: () => LT },
      LTEMPO: { get: () => LTEMPO },
      LVEL: { get: () => LVEL },
      LW_PRESETS: { get: () => LW_PRESETS },
      LW_Q: { get: () => LW_Q },
      LW_R: { get: () => widgets.LW_R },
      LW_STEP: { get: () => LW_STEP },
      demoBeat: { get: () => stavesAndDemos.demoBeat },
      lBarsHTML: { get: () => stavesAndDemos.lBarsHTML },
      lCofKey: { get: () => lCofKey },
      lCofN: { get: () => lCofN },
      lCofTriad: { get: () => lCofTriad },
      lDots: { get: () => stavesAndDemos.lDots },
      lPitch: { get: () => lPitch },
      lSel: { get: () => widgets.lSel },
      lSeqLight: { get: () => lSeqLight },
      lSp: { get: () => widgets.lSp },
      lStaffFit: { get: () => lStaffFit },
      lStaffHTML: { get: () => stavesAndDemos.lStaffHTML },
      lStaffNote: { get: () => stavesAndDemos.lStaffNote },
      lStaffPlay: { get: () => stavesAndDemos.lStaffPlay },
      lStaffSmall: { get: () => widgets.lStaffSmall },
      lStaffSvg: { get: () => stavesAndDemos.lStaffSvg },
      lVel: { get: () => lVel },
      learnBodyHTML: { get: () => learnBodyHTML },
      learnClick: { get: () => learnClick },
      learnComplete: { get: () => (L: Lesson, score: number | null) => {
        const res = learnComplete(host.store.data(), L, score, localDayNumber());
        host.store.saveNow();
        return res;
      } },
      learnGloss: { get: () => learnGloss },
      learnGo: { get: () => learnGo },
      learnGoId: { get: () => learnGoId },
      learnHalt: { get: () => learnHalt },
      learnInitSel: { get: () => learnInitSel },
      learnInput: { get: () => learnInput },
      learnLight: { get: () => learnLight },
      learnMark: { get: () => (read: boolean) => {
        learnMarkLesson(host.store.data(), LESSONS[learnSel], read, localDayNumber());
        host.store.saveNow();
      } },
      learnNavRender: { get: () => learnNavRender },
      learnRdLevel: { get: () => (u: LearnUnit) => host.nav.nextReadDrillForUnits(u.rd) },
      learnReady: { get: () => learnLoading ?? Promise.resolve() },
      learnReveal: { get: () => learnReveal },
      learnSay: { get: () => learnSay },
      learnSel: { get: () => learnSel },
      learnSide: { get: () => learnSide },
      learnTimer: { get: () => learnTimer },
      learnWire: { get: () => learnWire },
      lgFilter: { get: () => lgFilter },
      lgHTML: { get: () => lgHTML },
      lgNorm: { get: () => lgNorm },
      lmDots: { get: () => widgets.lmDots },
      lmMeter: { get: () => lmMeter },
      lmStart: { get: () => widgets.lmStart },
      lmStop: { get: () => widgets.lmStop },
      lmTerm: { get: () => lmTerm },
      lqAnswer: { get: () => lqAnswer },
      lqFocus: { get: () => lqFocus },
      lqLabel: { get: () => lqLabel },
      lqMidis: { get: () => lqMidis },
      lqNeed: { get: () => lqNeed },
      lqNext: { get: () => lqNext },
      lqPick: { get: () => lqPick },
      lqRender: { get: () => lqRender },
      lqShow: { get: () => lqShow },
      lqStart: { get: () => lqStart },
      lwChord: { get: () => widgets.lwChord },
      lwChordData: { get: () => widgets.lwChordData },
      lwChordPlay: { get: () => widgets.lwChordPlay },
      lwClick: { get: () => widgets.lwClick },
      lwCof: { get: () => widgets.lwCof },
      lwCofInfo: { get: () => widgets.lwCofInfo },
      lwCofPlay: { get: () => widgets.lwCofPlay },
      lwInput: { get: () => widgets.lwInput },
      lwMetro: { get: () => widgets.lwMetro },
      lwMount: { get: () => widgets.lwMount },
      lwRefocus: { get: () => widgets.lwRefocus },
      lwScale: { get: () => widgets.lwScale },
      lwScalePlay: { get: () => widgets.lwScalePlay },
      lwStepLab: { get: () => host.i18n.stepLabel },
      runDemo: { get: () => stavesAndDemos.runDemo },
    });
    registry.defineMutable('renderLearn', () => renderLearn, (value) => { renderLearn = value; });
  }

  return {
    mount,
    enter,
    leave,
    panic,
    localize,
    onStorageSync,
    onProgressReset,
    registerTestSurface,
  };
}

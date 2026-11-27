import type { ReadDrillData, TranslateFn } from '../../domain/views.js';
import { type ReadClefDraw, type ReadDrillLevel } from '../../core/reading-curriculum.js';
import { SR_SCALE_CAP } from '../../domain/score-types.js';
import { byId, maybeById, queryAllHtml } from '../../domain/dom.js';
import { courtesyNatural, streamStart, streamVisible, systemBars, systemRows, systemWindow } from '../../sight-reading/stream.js';
import { MARATHON_NOTES_PER_BAR } from '../../sight-reading/arcade.js';
import type { ReadShell } from '../../domain/views.js';
import * as theory from '../../domain/theory.js';

const pc = theory.pitchClass, srKeyName = theory.circleKeyPitchClass, rdSpellMidi = theory.readingSpelling;
import type { ReadDrillPitch, ReadDrillStaffNote, ReadDrillSvgOptions, ReadDrillState, ReadQuestionNote, ReadQuestion, ReadDockMark, ReadDrillButton, ReadDrillFlow, ReadDrillGiven } from './read-model.js';


/** Shell state and services createLookaheadStream reads; values are getters so shell declarations made later resolve on use. */
export interface LookaheadStreamDeps {
  readonly shell: ReadShell;
  readonly RD: ReadDrillState;
  readonly RD_FLOW_SC: number;
  readonly RD_FLOW_W: number;
  readonly rdAccSeg: () => string;
  readonly rdArcFx: () => string;
  readonly rdArmLimit: () => void;
  readonly rdBtn: (o: ReadDrillButton, i: number, cls?: string) => string;
  readonly rdCheckNotice: () => void;
  readonly rdData: () => ReadDrillData;
  readonly rdDockClear: () => void;
  readonly rdDockMark: (m: number, s: ReadDockMark, exact?: boolean) => void;
  readonly rdFinish: () => void;
  readonly rdGen: (L: ReadDrillLevel) => ReadQuestion;
  readonly rdGhostPlace: () => void;
  readonly rdGhostTick: () => void;
  readonly rdHint: () => void;
  readonly rdHud: () => void;
  readonly rdLetter: (li: number) => string;
  readonly rdName: (n: { li: number; oct: number; acc?: number; }, oct?: boolean) => string;
  readonly rdPool: (L: ReadDrillLevel) => ReadDrillPitch[];
  readonly rdRunLen: () => number | null;
  readonly rdScore: (q: ReadQuestion, ok: boolean, timeout?: boolean) => void;
  readonly rdSound: (ms?: number[], arp?: boolean) => void;
  readonly rdStep: (n: { li: number; oct: number; }) => number;
  readonly rdSvg: (o: ReadDrillSvgOptions) => { svg: string; heads: { c: number; i: number; x: number; y: number; }[]; W: number; x0: number; H: number; };
  readonly rdTimeUp: () => boolean;
  readonly rdTools: (q: ReadQuestion) => string;
  readonly reduceMotion: () => boolean;
  readonly t: TranslateFn;
}

/* The lookahead stream (Read → Drills, flow mode): a moving staff that keeps upcoming notes in view and advances on each answer. */
export function createLookaheadStream(deps: LookaheadStreamDeps) {
  const { shell } = deps;
    function rdFlowOk(L: ReadDrillLevel | null | undefined) { return !!L && deps.rdData().prefs.flow && (L.ty === 'name' || L.ty === 'play') && L.clef !== 'mix' && !L.keys && L.keyN === undefined; }
    function rdFlowFill(F: ReadDrillFlow, upTo: number) {
      const L = deps.RD.L;
      if (!L)
          throw new Error('Étude: no reading level');
      const len = deps.rdRunLen(), end = len !== null ? Math.min(upTo, len) : upTo;
      while (F.items.length < end) {
          const q = deps.rdGen(L);
          if (q.ty !== 'name' && q.ty !== 'play')
              throw new Error('Étude: the note stream needs name or play questions');
          q.hinted = false;
          q.state = null;
          q.cn = courtesyNatural(F.items.slice(-6).map((x) => x.note), q.note);
          F.items.push(q);
      }
  }
    function rdFlowStart() {
      const L = deps.RD.L;
      if (!L)
          return;
      const pool = deps.rdPool(L).sort((a, b) => deps.rdStep(a) - deps.rdStep(b)), gh = deps.rdData().prefs.ghost;
      const F: ReadDrillFlow = deps.RD.flow = { items: [], cur: 0, start: 0, played: null, wrong: [], ext: [pool[0], pool[pool.length - 1]], g0: performance.now(), raf: 0, gd: 0, gh, rm: deps.reduceMotion(), geo: { x0: 0, colW: deps.RD_FLOW_W, n: 0 } };
      rdFlowFill(F, 1);
      deps.RD.q = F.items[0];
      deps.RD.answered = false;
      deps.RD.fix = false;
      deps.RD.accSel = 0;
      rdFlowBody();
      rdFlowShow(false);
      rdFlowArm();
      F.g0 = deps.RD.t0;
      if (gh)
          F.raf = requestAnimationFrame(deps.rdGhostTick);
  }
    // Starts the clock on the current note, with the practice hint after 4 s.
  function rdFlowArm() {
      const q = deps.RD.q;
      clearTimeout(deps.RD.hintT);
      if (deps.RD.mode === 'practice' && deps.rdData().prefs.hints)
          deps.RD.hintT = setTimeout(() => { if (deps.RD.on && !deps.RD.answered && deps.RD.q === q)
              deps.rdHint(); }, 4000);
      deps.rdHud();
      deps.RD.t0 = performance.now();
      deps.rdArmLimit();
  }
    function rdFlowBody() {
      const F = deps.RD.flow;
      if (!F)
          return;
      const q = F.items[Math.min(F.cur, F.items.length - 1)];
      let acc = '', ans = '';
      if (q.ty === 'name') {
          if (q.needAcc)
              acc = deps.rdAccSeg();
          ans = [0, 1, 2, 3, 4, 5, 6].map((li) => deps.rdBtn({ v: li, l: deps.rdLetter(li) }, li)).join('');
      }
      byId('rdx-body').innerHTML = `<div class="rdx-q rdx-flowq"><div class="rdx-prompt" id="rdx-prompt">${deps.t('rdx_p_' + q.ty + '_flow')}</div><div class="rdx-staff rdx-flow" id="rdx-staff"></div><div class="rdx-fb" id="rdx-fb"></div>${acc}<div class="rdx-ans rdx-ty-${q.ty}" id="rdx-ans" role="group" aria-label="${deps.t('rdx_answers')}" aria-describedby="rdx-coach">${ans}</div>${deps.rdTools(q)}</div>`;
  }
    function rdFlowShow(slide: boolean) {
      const F = deps.RD.flow, L = deps.RD.L, st = maybeById('rdx-staff');
      if (!F || !L || !st)
          return;
      const grand = L.clef === 'grand', fix = deps.RD.fix, q = F.items[Math.min(F.cur, F.items.length - 1)];
      const clef: ReadClefDraw = grand ? 'grand' : q.sclef, head = grand ? 76 : 66, colW = deps.RD_FLOW_W, aw = st.clientWidth - 28;
      const svgOf = (start: number, vis: ReadQuestionNote[], sc: number, o: Partial<ReadDrillSvgOptions>) => deps.rdSvg({ clef, colW, scale: sc, dur: 1, ext: F.ext, aria: deps.t('rdx_p_' + q.ty + '_flow'), ...o,
          cols: vis.map((it, i) => {
              const k = start + i, col: ReadDrillStaffNote[] = [Object.assign({ s: k === F.cur ? 'now' : k < F.cur ? it.state : null, cn: it.cn }, it.note)];
              if (k === F.cur && fix && F.played != null && F.played !== it.midi)
                  col.push(Object.assign(rdSpellMidi(F.played, 0), { s: 'bad' }));
              return col;
          }),
          lbl: vis.map((it) => it.state === 'bad' ? deps.rdName(it.note, true) : null), lblCls: vis.map(() => 'lo') });
      // On the full-screen stage the notes grow into the height the stage gives them, keeping at least 8 columns across.
      const H = deps.rdSvg({ clef, cols: [], ext: F.ext, lbl: [], ghost: F.gh }).H, ah = st.clientHeight - 12, gap = 10;
      const wide = Math.min(2.6, aw / (head + 10 + 8 * colW));
      const total = deps.rdRunLen();
      st.classList.toggle('rdx-sys', deps.RD.mode === 'marathon' && total !== null);
      if (deps.RD.mode === 'marathon' && total !== null) {
          // Marathon reads like a page: whole bars on each system, the current system on top and the next ones below it.
          const rows = shell.stage.on ? systemRows(ah, H * Math.max(1, Math.min(deps.RD_FLOW_SC, wide)) + gap) : 2;
          const sc = shell.stage.on ? Math.max(1, Math.min(wide, (ah - gap * (rows - 1)) / (rows * H))) : deps.RD_FLOW_SC;
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
          const sc = shell.stage.on ? Math.max(1, Math.min(wide, ah / H)) : Math.max(deps.RD_FLOW_SC, Math.min(SR_SCALE_CAP, aw / (head + 10 + 12 * colW)));
          const n = streamVisible(aw, { scale: sc, colW, head });
          const start = streamStart(F.cur, n, total);
          rdFlowFill(F, start + n);
          const r = svgOf(start, F.items.slice(start, start + n), sc, { hl: F.cur < F.items.length ? F.cur - start : null, ghost: F.gh, wrap: 'rdx-flow-n' + (slide && start === F.start + 1 ? ' slide' : '') });
          st.innerHTML = r.svg;
          F.ghostEl = null;
          F.start = start;
          F.geo = { x0: r.x0, colW, n };
      }
      deps.rdGhostPlace();
      queryAllHtml(byId('rdx-ans'), '.rdx-a').forEach((b) => {
          const v = Number(b.dataset.a);
          b.classList.toggle('correct', fix && v === q.note.li);
          b.classList.toggle('wrong', fix && v !== q.note.li && F.wrong.includes(String(v)));
      });
      queryAllHtml(document, '#rdx-accs [data-acc]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.acc) === deps.RD.accSel)));
      deps.rdDockClear();
      if (fix && q.ty === 'play') {
          deps.rdDockMark(q.midi, 'target');
          if (F.played != null && F.played !== q.midi)
              deps.rdDockMark(F.played, 'bad');
      }
      const f = byId('rdx-fb'), fx = fix ? '' : deps.rdArcFx();
      f.className = 'rdx-fb' + (fix ? ' bad' : fx ? ' good' : '');
      f.textContent = fix ? (deps.RD.tout ? '⏱ ' : '✗ ') + rdFlowMsg() : fx ? '✓ ' + fx : '';
  }
    function rdFlowMsg() {
      const F = deps.RD.flow, q = F && F.items[F.cur], arc = deps.RD.arc;
      if (!F || !q)
          return '';
      return (deps.RD.tout ? deps.t('rdx_timeout') + ' · ' : '') + deps.t('rdx_wrong', deps.rdName(q.note, true)) + (q.ty === 'play' && F.played != null ? ' · ' + deps.t('rdx_played', deps.rdName(rdSpellMidi(F.played, 0), true)) : '') + (arc && arc.lives !== null ? ' · ' + deps.t('rdx_lives', arc.lives) : '') + (arc && arc.completed ? '' : ' · ' + deps.t(q.ty === 'play' ? 'rdx_fix_play' : 'rdx_fix_name'));
  }
    // Only the first answer to a note is scored. After a wrong one the stream waits, showing the right answer, until it is given.
  function rdFlowAnswer(ok: boolean, g: ReadDrillGiven, timeout = false) {
      const F = deps.RD.flow, q = F && F.items[F.cur];
      if (!F || !q || (deps.RD.answered && !deps.RD.fix))
          return;
      if (!deps.RD.fix) {
          deps.RD.answered = true;
          clearTimeout(deps.RD.hintT);
          clearTimeout(deps.RD.limT);
          deps.RD.tout = timeout;
          deps.rdScore(q, ok, timeout);
          q.state = ok ? 'good' : 'bad';
      }
      if (ok) {
          rdFlowAdvance(g);
          deps.rdCheckNotice();
          return;
      }
      deps.RD.fix = true;
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
      deps.rdHud();
      deps.rdCheckNotice();
      // A run that this mistake ended (no lives left, or the last Marathon note) closes after a moment to read the answer.
      if (deps.RD.arc && deps.RD.arc.completed)
          deps.RD.timers.push(setTimeout(() => { if (deps.RD.on)
              deps.rdFinish(); }, 1200));
  }
    function rdFlowAdvance(g: ReadDrillGiven) {
      const F = deps.RD.flow;
      if (!F)
          return;
      const q = F.items[F.cur];
      if (q.ty === 'name' && g.midi == null && deps.rdData().prefs.sound)
          deps.rdSound(q.midis);
      F.cur++;
      F.played = null;
      F.wrong = [];
      deps.RD.fix = false;
      deps.RD.accSel = 0;
      const len = deps.rdRunLen();
      if ((len !== null && F.cur >= len) || deps.rdTimeUp()) {
          rdFlowShow(false);
          deps.rdHud();
          deps.RD.timers.push(setTimeout(() => { if (deps.RD.on)
              deps.rdFinish(); }, deps.RD.mode === 'timeAttack' ? 0 : 400));
          return;
      }
      rdFlowFill(F, F.cur + 1);
      deps.RD.q = F.items[F.cur];
      deps.RD.answered = false;
      rdFlowShow(true);
      rdFlowArm();
      const fx = deps.rdArcFx();
      if (fx)
          byId('rdx-live').textContent = fx;
  }

  return {
    rdFlowOk,
    rdFlowFill,
    rdFlowStart,
    rdFlowArm,
    rdFlowBody,
    rdFlowShow,
    rdFlowMsg,
    rdFlowAnswer,
    rdFlowAdvance,
  };
}

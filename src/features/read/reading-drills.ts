import type { NotationSystem } from '../../domain/score-types.js';
import type { ReadDrillData, TranslateFn } from '../../domain/views.js';
import { randItem, shuffle } from '../../core/collections.js';
import { RD_ALL, RD_ALLIV, RD_LV, RD_UNITS, isReadClef, isReadDrillType, type ReadClef, type ReadClefStaff, type ReadDrillChordQuality, type ReadDrillLevel, type ReadDrillType } from '../../core/reading-curriculum.js';
import { samePitch } from '../../core/pitch-match.js';
import { SR_LET, srPitch, ssAccGlyph, ssFlat, ssKeyAcc, ssMidiOf, ssNotehead, ssSharp, ssStepOf, type SrToken } from '../../domain/score-types.js';
import { srClef, srLedger2 } from '../../domain/grand-staff.js';
import { byId, maybeById, inputById, selectById, eventElement, queryHtml, queryAllHtml, rovingFocus } from '../../domain/dom.js';
import { type CoachTip, type ReadDrillCustom, type ReadDrillLevelStat } from '../../domain/views.js';
import { inputTime } from '../../domain/midi-timing.js';
import { type SightReadingPiece, type SightReadingProfile } from '../../sight-reading/model.js';
import { srtFingerprint } from '../../sight-reading/fingerprint.js';
import { SRT_BOOK_PIECES } from '../../sight-reading/book.js';
import { srtBookTally, srtPiecesRead, type ReadingBookState } from '../../sight-reading/progress.js';
import { srtGenerate } from '../../sight-reading/generator.js';
import { srtReadLedger, type SightReadingLedgerOperation, type SightReadingLedgerResult } from '../../sight-reading/ledger.js';
import { SRT_INITIAL_STATE } from '../../sight-reading/flow.js';
import { formatLead, ghostX, pacerLead } from '../../sight-reading/stream.js';
import { srtNotationSegments } from '../../sight-reading/notation.js';
import { ARCADE_LIVES, TIME_ATTACK_MS, srtArcadeComplete, srtArcadeMultiplier, srtArcadeRecord, srtArcadeRemainingMs, srtArcadeStart, srtArcadeSummary, srtIsArcadeMode, srtIsMarathonBars } from '../../sight-reading/arcade.js';
import type { AppHost, ReadShell } from '../../domain/views.js';
import * as theory from '../../domain/theory.js';

const pc = theory.pitchClass, srKeyName = theory.circleKeyPitchClass, rdSpellMidi = theory.readingSpelling;
import type { SrState, RdnScreen, RdnState, RdnWarmState, SrtStopReason, ReadDrillPitch, ReadDrillStaffNote, ReadDrillSvgOptions, ReadDrillSvgItem, ReadDrillMode, ReadDrillState, ReadQuestionNote, ReadQuestion, ReadDockMark, ReadDrillButton, ReadDrillGiven, RdRhythmUnit, RdLeftHandPattern, RdSightLevel, RdSightPiece } from './read-model.js';


/** Shell state and services createReadingDrills reads; values are getters so shell declarations made later resolve on use. */
export interface ReadingDrillsDeps {
  readonly host: AppHost;
  readonly shell: ReadShell;
  readonly anNum: (x: number, digits: number) => string;
  readonly buildKeyboard: () => void;
  readonly coachHTML: (lead: string, tip: CoachTip, actId?: string) => string;
  readonly coachText: (tip: CoachTip) => string;
  readonly dockKeyInSight: (midi: number) => void;
  readonly dockSync: () => void;
  readonly ensureAudio: (warm?: boolean) => AudioContext | null;
  readonly foldToView: (midi: number) => number;
  readonly heldPcs: () => number[];
  readonly kbState: (midi: number, state: string | null, fold: boolean) => void;
  readonly LETTERS: Readonly<Record<NotationSystem, readonly string[]>>;
  readonly markReadDoneToday: (save?: boolean) => void;
  readonly rdCoach: (show: boolean) => void;
  readonly rdData: () => ReadDrillData;
  readonly rdEsc: (value: string | number | undefined) => string;
  readonly rdFlowAnswer: (ok: boolean, g: ReadDrillGiven, timeout?: boolean) => void;
  readonly rdFlowBody: () => void;
  readonly rdFlowOk: (L: ReadDrillLevel | null | undefined) => boolean;
  readonly rdFlowShow: (slide: boolean) => void;
  readonly rdFlowStart: () => void;
  readonly rdLvName: (level: ReadDrillLevel) => string;
  readonly RDN: RdnState;
  readonly rdnBook: () => ReadingBookState;
  readonly rdnChecklist: () => void;
  readonly rdNextStep: (L: ReadDrillLevel, mode: string, acc: number, avg: number, stars: number, weak: readonly [string, number][]) => CoachTip | null;
  readonly rdnForgetLevelPiece: () => void;
  readonly rdnHeadText: () => { title: string; sub: string; };
  readonly rdnHome: (focus?: boolean) => void;
  readonly rdnPlayerHead: () => void;
  readonly rdnReadyText: () => string;
  readonly rdnResultShow: (startAuto: boolean) => void;
  readonly rdnShowScreen: (screen: RdnScreen) => void;
  readonly rdnWarmDrillDone: () => boolean;
  readonly rdnWarmLimit: () => boolean;
  readonly rdnWarmLocale: () => void;
  readonly rdRhMarks: (on: boolean) => void;
  readonly rdRhNew: (keep?: boolean) => void;
  readonly rdRhPress: (src: string, hand: string) => void;
  readonly rdRhRelease: (src: string) => void;
  readonly rdStarCount: (value: unknown) => number;
  readonly rdWarmButtonsSync: () => void;
  readonly repaintHeld: () => void;
  readonly saveAll: () => void;
  readonly spelledName: (sys: NotationSystem, letter: number, accidental: number, ascii?: boolean) => string;
  readonly SR: SrState;
  readonly srMeta: () => void;
  readonly srModeUi: () => void;
  readonly srSelectPiece: (id: string) => void;
  readonly srStopAll: (keep?: boolean, preserveSrt?: boolean, reason?: SrtStopReason) => void;
  readonly srtAbandonClaim: (status?: "abandoned" | "interrupted", transitionBeforeLedger?: boolean) => Promise<SightReadingLedgerResult>;
  readonly srtConsumeOnLearnReveal: () => boolean;
  readonly srtNotice: (text: string | null) => void;
  readonly srtOperationEpoch: number;
  readonly srtPendingSaveProtected: () => boolean;
  readonly srtPendingUi: (show: boolean) => void;
  readonly srtPreviewUi: (show: boolean) => void;
  readonly srtProgressLedgerUpdate: (operation: SightReadingLedgerOperation) => Promise<SightReadingLedgerResult>;
  readonly stageSync: () => void;
  readonly statHTML: (value: string | number, label: string) => string;
  readonly syncMobileStartBars: () => void;
  readonly t: TranslateFn;
  readonly tl: (lang: string, key: string, a?: string | number | null, b?: string | number | null) => string;
  readonly touchDay: () => void;
  readonly view0: () => string;
  readonly WARM: RdnWarmState;
}

/* Reading drills (V3): note naming and playing, key to staff, intervals, chords, key signatures, C clefs and generated\n   sight-reading, with weak-spot injection, stars and statistics; the drill staff renderer, engine, home and tabs. */
export function createReadingDrills(deps: ReadingDrillsDeps) {
  const { host, shell } = deps;
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
    function rdLetter(li: number) { return (deps.LETTERS[host.i18n.notation()] || deps.LETTERS.letter)[li]; }
    function rdName(n: { li: number; oct: number; acc?: number; }, oct?: boolean) { return deps.spelledName(host.i18n.notation(), n.li, n.acc || 0) + (oct ? n.oct : ''); }
    function rdSpell(s: string) { const m = /^([A-G])([#b]?)$/.exec(s); return m ? deps.spelledName(host.i18n.notation(), SR_LET.indexOf(m[1]), m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) : ''; }
    function rdKeyLabel(k: number) { return deps.t('key_major', rdSpell(RD_MAJ[k + 7])); }
    function rdKeyMinor(k: number) { return deps.t('key_minor', rdSpell(RD_MIN[k + 7])); }
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
              body.push(`<g class="ss-n" data-c="${ci}" data-i="${it.ii}"${it.n.s ? ` data-s="${it.n.s}"` : ''}${it.n.hc ? ` style="--hc:${it.n.hc}"` : ''}>${it.n.tip ? `<title>${deps.rdEsc(it.n.tip)}</title>` : ''}${g}</g>`);
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
              body.push(`<text class="rdx-lbl${o.lblCls && o.lblCls[ci] ? ' ' + o.lblCls[ci] : ''}" x="${x0 + ci * colW + colW / 2}" y="${lblY}">${deps.rdEsc(l)}</text>`); });
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
      return { svg: `<svg class="rdx-svg" viewBox="0 ${yA} ${W} ${H}" width="${Math.round(W * sc)}" height="${Math.round(H * sc)}" style="--w:${Math.round(W * sc)}px" xmlns="http://www.w3.org/2000/svg" role="img"${o.aria ? ` aria-label="${deps.rdEsc(o.aria)}"` : ''}>${hl}${staff}${head}${ghost}${notes}</svg>`, heads, W, x0, H };
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
    function rdArcFx() { return RD.arcFx === 'bonus' ? deps.t('rdx_ta_bonus') : RD.arcFx === 'faster' && RD.arc ? deps.t('rdx_sv_faster', deps.anNum(RD.arc.targetMs / 1000, 1)) : ''; }
    function rdClock(ms: number) { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
    function rdLvNext(L: ReadDrillLevel) { const u = RD_UNITS.find((x) => x.u === L.u); return u ? u.lv[L.n] || null : null; }
    function rdTarget(L: ReadDrillLevel | null) { if (!L)
      throw new Error('Étude: no reading level'); return (RD_TARGET[L.ty] || 3000) + ((L.clef === 'grand' || L.clef === 'mix') ? 800 : 0) + ((L.acc || L.keys) ? 1000 : 0); }
    function rdStat(k: string, ok: boolean, ms: number) {
      const d = deps.rdData(), s = d.nt[k] || (d.nt[k] = { n: 0, ok: 0, ms: 0, e: 0, t: 0 });
      s.e = s.n ? s.e * 0.7 + (ok ? 0 : 0.3) : (ok ? 0.1 : 1);
      s.t = s.n ? Math.round(s.t * 0.7 + ms * 0.3) : ms;
      s.n++;
      if (ok)
          s.ok++;
      s.ms += ms;
  }
    function rdWeakness(k: string) {
      const s = deps.rdData().nt[k];
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
    function rdIvName(n: string|number) { return deps.t('rdx_iv' + n); }
    function rdChLabel(li: number, q: string) { return rdLetter(li) + ' ' + deps.t('rdx_q_' + q); }
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
          return rdSvg({ clef: q.clef, keyN: q.keyN, cols: [], minW: 150, aria: deps.t('rdx_p_ks') }).svg;
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
    function rdDockAt(m: number, exact: boolean) { return exact ? m : deps.foldToView(m); }
    function rdDockMark(m: number, s: ReadDockMark, exact = false) {
      if (s === 'bad' && [...rdDockKeys].some(([k, d]) => rdDockAt(k, d.exact) === rdDockAt(m, exact)))
          return;
      rdDockKeys.set(m, { s, exact });
      deps.kbState(m, s, !exact);
  }
    function rdDockPaint() {
      const marked = new Set<number>();
      let ask: number | null = null;
      for (const [m, d] of rdDockKeys) {
          const at = rdDockAt(m, d.exact);
          if (d.s === 'bad' && marked.has(at))
              continue;
          marked.add(at);
          deps.kbState(m, d.s, !d.exact);
          if (d.exact && d.s !== 'bad' && ask == null)
              ask = m;
      }
      if (ask != null)
          deps.dockKeyInSight(ask);
  }
    function rdDockClear() {
      if (!rdDockKeys.size)
          return;
      rdDockKeys.forEach((d, m) => deps.kbState(m, null, !d.exact));
      rdDockKeys.clear();
      deps.repaintHeld();
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
      return; shell.setDockForced(on); deps.dockSync(); }
    // Key-to-staff asks on the dock: it opens for the drill, shows the key in its own octave, and lights it.
  function rdDockAsk(m: number) {
      rdDockForce(true);
      const low = shell.keyboardView.low;
      rdDockView();
      if (shell.keyboardView.low !== low) {
          deps.buildKeyboard();
          deps.repaintHeld();
      }
      rdDockMark(m, 'target', true);
      deps.dockKeyInSight(m);
  }
    function rdBtn(o: ReadDrillButton, i: number, cls?: string) { return `<button class="chip rdx-a${cls ? ' ' + cls : ''}" data-a="${deps.rdEsc(o.v)}" data-k="${o.k || (i + 1)}">${o.html || deps.rdEsc(o.l)}${o.s ? `<small>${deps.rdEsc(o.s)}</small>` : ''}<kbd>${o.k || (i + 1)}</kbd></button>`; }
    function rdAccSeg() { return `<div class="seg rdx-accs" id="rdx-accs" role="group" aria-label="${deps.t('rdx_accl')}">${[-1, 0, 1].map((a, i) => `<button data-acc="${a}" aria-pressed="${a === RD.accSel}" title="${deps.t('rdx_acc_t' + a)}">${a < 0 ? '♭' : a > 0 ? '♯' : '♮'}<kbd>${['-', '0', '='][i]}</kbd></button>`).join('')}</div>`; }
    // On a touch screen the computer-key hint (.rdx-kbd) is hidden (native.css); the ways that still work there keep a line (.rdx-touch).
  function rdTools(q: ReadQuestion) { return `<div class="rdx-tools">${RD.mode === 'practice' ? `<button class="btn ghost sm" id="rdx-hear">🔊 ${deps.t('rdx_hear')}</button><button class="btn ghost sm" id="rdx-hintb">💡 ${deps.t('rdx_hint')}</button>` : ''}<span class="rdx-kbd">${deps.t('rdx_keys_' + q.ty) + (q.ty === 'name' && q.needAcc ? deps.t('rdx_keys_acc') : '')}</span>${q.ty === 'ch' || q.ty === 'play' ? `<span class="rdx-touch ctx-touch">${deps.t('rdx_touch_' + q.ty)}</span>` : ''}</div>`; }
    const RD_FLOW_W = 52, RD_FLOW_SC = 1.35, RD_GHOST_MAX = 3;
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
      byId('rdx-body').innerHTML = `<div class="rdx-q"><div class="rdx-prompt" id="rdx-prompt">${deps.t('rdx_p_' + q.ty)}</div><div class="rdx-staff" id="rdx-staff">${q.ty === 'k2s' ? '' : rdQSvg(q)}</div><div class="rdx-fb" id="rdx-fb"></div>${acc}<div class="rdx-ans rdx-ty-${q.ty}" id="rdx-ans" role="group" aria-label="${deps.t('rdx_answers')}" aria-describedby="rdx-coach">${ans}</div>${rdTools(q)}</div>`;
      if (q.ty === 'k2s')
          rdDockAsk(q.midi);
      else
          rdDockForce(false);
      if (q.ty === 'k2s' && deps.rdData().prefs.sound)
          rdSound(q.midis);
      if (pr && deps.rdData().prefs.hints)
          RD.hintT = setTimeout(() => { if (RD.on && !RD.answered && RD.q === q)
              rdHint(); }, 4000);
      rdHud();
      RD.t0 = performance.now();
      rdArmLimit();
  }
    function rdSound(ms?: number[], arp?: boolean) { if (!ms || !ms.length)
      return; deps.ensureAudio(); if (!shell.audioEngine.context)
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
          s = d === 0 ? deps.t('rdx_hint_same', nm) : deps.t(d > 0 ? 'rdx_hint_up' : 'rdx_hint_dn', Math.abs(d), nm);
          if (q.ty === 'play')
              rdDockMark(q.midi, 'target');
      }
      else if (q.ty === 'k2s')
          s = deps.t('rdx_hint_k2s', rdName(q.note, true));
      else if (q.ty === 'iv') {
          const l1 = (RD_REF[q.clef] - rdStep(q.a)) % 2 === 0, l2 = (RD_REF[q.clef] - rdStep(q.b)) % 2 === 0;
          s = deps.t(l1 === l2 ? 'rdx_hint_odd' : 'rdx_hint_even');
      }
      else if (q.ty === 'ch')
          s = deps.t('rdx_hint_ch', rdLetter(q.root.li));
      else if (q.ty === 'ks')
          s = deps.t(q.keyN > 0 ? 'rdx_hint_ks_s' : q.keyN < 0 ? 'rdx_hint_ks_f' : 'rdx_hint_ks_0');
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
          const tt = deps.rdData().tot;
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
          return deps.rdFlowAnswer(ok, given || {}, timeout);
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
          return; if (done || rdTimeUp() || deps.rdnWarmLimit())
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
      const d = deps.rdData(), rec = d.lv[L.id] ?? { s: 0, acc: 0, t: 0, n: 0, rush: 0 };
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
          deps.saveAll();
      }
  }
    // Announces stars the check just earned, without stopping the drill.
  function rdCheckNotice() {
      const s = RD.chkNew, aw = maybeById('rdx-award');
      if (!s)
          return;
      RD.chkNew = 0;
      byId('rdx-live').textContent = deps.t('rdx_chk_live', deps.t('rdx_stars_n', s));
      if (!aw)
          return;
      aw.textContent = deps.t('rdx_chk_earned', '★'.repeat(s));
      aw.hidden = false;
      clearTimeout(RD.awT);
      RD.awT = setTimeout(() => { aw.hidden = true; }, 3000);
  }
    function rdCheckHud() {
      const n = RD.chk.length;
      if (n < RD_CHECK_N)
          return deps.t('rdx_chk_n', n, RD_CHECK_N);
      const s = rdCheckResult().stars;
      return deps.t('rdx_chk_s', '★'.repeat(s) + '☆'.repeat(3 - s));
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
      const f = byId('rdx-fb'), msg = ok ? (deps.t('rdx_ok') + (RD.streak >= 3 ? '  🔥 ' + RD.streak : '') + (fx ? ' · ' + fx : ''))
          : (RD.tout ? deps.t('rdx_timeout') + ' · ' : '') + deps.t('rdx_wrong', rdAnsText(q)) + (extra ? ' · ' + deps.t('rdx_played', rdName(extra, true)) : '') + (arc && arc.lives !== null ? ' · ' + deps.t('rdx_lives', arc.lives) : '');
      f.className = 'rdx-fb ' + (ok ? 'good' : 'bad');
      f.textContent = (ok ? '✓ ' : RD.tout ? '⏱ ' : '✗ ') + msg;
      byId('rdx-live').textContent = msg;
      if (deps.rdData().prefs.sound && q.ty !== 'play' && !(q.ty === 'k2s') && q.midis)
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
          return rdAnswer(host.store.data().settings.anyOctave ? samePitch(q.midi, m, true) : (strict || (src.some((s) => /^(pointer|button):/.test(s)) && deps.foldToView(q.midi) === q.midi) ? m === q.midi : pc(m) === pc(q.midi)), { midi: m });
      if (q.ty === 'name')
          return rdAnswer(pc(m) === pc(q.midi), { midi: m });
      // Key to staff answers with 1–4 or a click: a played note only sounds, since playing the lit key would answer without reading.
      if (q.ty === 'k2s')
          return;
      if (q.ty === 'ch') {
          const hp = deps.heldPcs();
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
              parts.push(deps.t('rdx_hud_q', Math.min(arc.total, answered + (RD.answered ? 0 : 1)), arc.total));
              f = answered / arc.total;
          }
          parts.push('×' + srtArcadeMultiplier(arc.combo), deps.t('rdx_arc_score', deps.anNum(arc.score, 0)));
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
    const RD_LH_PAT: Record<RdLeftHandPattern, number[][]> = { whole: [[4]], half: [[2], [2]], pulse: [[1], [1], [1], [1]], onethree: [[1], [1, 1], [1], [1, 1]], twofour: [[1, 1], [1], [1, 1], [1]] };
    function rdTap(hand: string | undefined) { const src = 'tap' + performance.now(); deps.rdRhPress(src, hand || 'R'); deps.rdRhRelease(src); }
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
          t: { en: deps.tl('en', 'rdx_sr_title', L.n), ro: deps.tl('ro', 'rdx_sr_title', L.n) },
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
          t: { en: deps.tl('en', 'rdx_sr_title', L.n), ro: deps.tl('ro', 'rdx_sr_title', L.n) } };
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
      if (deps.srtPendingSaveProtected()) {
          if (deps.SR.srtState?.name === 'pendingSave') {
              const pendingEpoch = deps.srtOperationEpoch;
              void deps.srtAbandonClaim('abandoned', false).then((result) => {
                  if (result.ok && deps.srtOperationEpoch === pendingEpoch + 1 && deps.SR.srtState?.name === 'abandoned')
                      rdSightStart(mode, injectedSeed);
              });
          }
          return;
      }
      deps.srStopAll(undefined, false, 'navigate');
      deps.rdnForgetLevelPiece();
      deps.rdData().prefs.srLv = L.id;
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
      deps.SR.srtPiece = srtPiece;
      deps.SR.srtFingerprint = srtFingerprint(srtPiece);
      srtRememberGeneratedFingerprint(deps.SR.srtFingerprint);
      deps.SR.srtState = { ...SRT_INITIAL_STATE, mode: 'firstSight', fingerprint: deps.SR.srtFingerprint };
      deps.SR.srtPendingAttempt = null;
      deps.SR.srtEvaluation = null;
      deps.SR.srtResultValue = null;
      deps.SR.srtResultLevelId = null;
      deps.srtPreviewUi(false);
      deps.srtPendingUi(false);
      deps.srtNotice(null);
      void deps.srtProgressLedgerUpdate({ type: 'recoverOrphanClaims', generation: srtReadLedger(localStorage).generation });
      deps.SR.gen = srtLegacyPiece(srtPiece, L);
      RD.on = false;
      rdTab('pieces');
      deps.SR.modeSel = mode === 'test' ? 'assess' : 'learn';
      deps.srModeUi();
      deps.srSelectPiece('gen');
      if (mode !== 'test')
          deps.srtConsumeOnLearnReveal();
      const v = byId('rd-verdict');
      v.className = 'verdict neutral';
      v.textContent = deps.t('rdx_sr_ready');
      const g = byId('rd-go');
      if (g)
          g.focus();
  }
    function rdGenMelody() { const L = RD_LV[deps.rdData().prefs.srLv ?? ''] || RD_LV.sr1; RD.L = L; rdSightStart(deps.SR.modeSel === 'assess' ? 'test' : 'practice'); }
    /** A Step by step run: accuracy from the mistakes per step, and up to 2 stars (none after many slips). */
  function srLearnGrade(mistakes: number, steps: number): { acc: number; stars: 0 | 1 | 2 } {
      return { acc: Math.max(0, Math.round(100 * (1 - mistakes / steps))), stars: mistakes === 0 ? 2 : mistakes <= Math.max(1, steps * 0.15) ? 1 : 0 };
  }
    function rdSightDone(kind: string, val: number) {
      const p = deps.SR.piece;
      if (!p || !p.gen)
          return '';
      const L = RD_LV[p.gen];
      if (!L)
          return '';
      const steps = deps.SR.steps.length || 1, grade = srLearnGrade(val, steps), acc = kind === 'assess' ? val : grade.acc;
      const stars = kind === 'assess' ? (val >= 95 ? 3 : val >= 80 ? 2 : val >= 60 ? 1 : 0) : grade.stars;
      const d = deps.rdData(), rec = d.lv[L.id] || (d.lv[L.id] = { s: 0, acc: 0, t: 0, n: 0, rush: 0 });
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
      const p = [deps.t('rdx_ty_' + L.ty)];
      if (L.ty === 'rh')
          p.push((L.units ?? []).map((u) => deps.t('rdx_rhu_' + u)).join(', '));
      else if (L.ty === 'ks') {
          p.push(deps.t('rdx_kmax', ...(L.kmax != null ? [L.kmax] : [])));
          if (L.clef === 'grand')
              p.push(deps.t('rdx_clef_grand'));
      }
      else {
          if (L.tag)
              p.push(deps.t('rdx_tag_' + L.tag));
          if (L.clef !== 'mix' && (L.custom || !['tr', 'ba', 'cc'].includes(L.u)))
              p.push(deps.t('rdx_clef_' + L.clef));
          const r = rdRangeTxt(L);
          if (r)
              p.push(r);
      }
      if (L.acc)
          p.push(deps.t('rdx_acc' + L.acc));
      if (L.keys)
          p.push(deps.t('rdx_inkeys', String(L.keys)));
      if (L.harm)
          p.push(deps.t(L.harm === 1 ? 'rdx_harm' : 'rdx_harmmix'));
      if (L.ty === 'iv' && L.ivs && L.ivs.length < 7)
          p.push(rdIvName(L.ivs[0]) + '–' + rdIvName(L.ivs[L.ivs.length - 1]));
      if (L.q)
          p.push(L.q.map((q) => deps.t('rdx_q_' + q)).join(' / '));
      if (L.inv)
          p.push(deps.t('rdx_inv'));
      if (L.ty === 'sr' || L.ty === 'rh')
          p.push(L.bpm + ' BPM');
      return p.join(' · ');
  }
    function rdLvSub(L: ReadDrillLevel) { return rdLvDetail(L).split(' · ').slice(1).join(' · '); }
    function rdStars(value: number, label?: string) {
      const count = deps.rdStarCount(value);
      return `<span class="rdx-stars" role="img" aria-label="${deps.rdEsc(label ?? deps.t('rdx_stars_n', count))}">${'★'.repeat(count)}<i>${'☆'.repeat(3 - count)}</i></span>`;
  }
    function rdKeyText(k: string) {
      const clefOf: Record<string, string> = { t: 'treble', b: 'bass', a: 'alto', n: 'tenor' };
      let m = /^([tban]):([A-G])([#b]?)(\d)$/.exec(k);
      if (m)
          return rdName({ li: SR_LET.indexOf(m[2]), acc: m[3] === '#' ? 1 : m[3] === 'b' ? -1 : 0, oct: +m[4] }, true) + ' (' + deps.t('rdx_clef_' + clefOf[m[1]]) + ')';
      if ((m = /^iv:(\d)$/.exec(k)))
          return rdIvName(+m[1]);
      if ((m = /^ch:(\w+)$/.exec(k)))
          return deps.t('rdx_q_' + m[1]);
      if ((m = /^ks:(-?\d)$/.exec(k)))
          return rdKeyLabel(+m[1]);
      if ((m = /^rh:(\w+)$/.exec(k)) && RD_LV[m[1]])
          return deps.rdLvName(RD_LV[m[1]]);
      return k;
  }
    function rdScroll() { const tb = byId('rd-tabs'); if (!tb)
      return; const hd = (document).querySelector('header'), y = tb.getBoundingClientRect().top + window.scrollY - (hd ? hd.offsetHeight : 0) - 10; if (window.scrollY > y + 4 || tb.getBoundingClientRect().top > window.innerHeight * 0.3)
      window.scrollTo({ top: Math.max(0, y), behavior: 'auto' }); }
    function rdOpen(L: ReadDrillLevel) { if (deps.RDN.screen !== 'drills')
      rdTab('drills'); rdAbort(); RD.L = L; if (!L.custom)
      deps.rdData().prefs.last = L.id; byId('rdx-home').hidden = true; byId('rdx-stage').hidden = false; rdIntro(); rdScroll();
      // Focus on the Practice card, so Enter starts the drill; the back button when the level has no such card.
      const b = queryHtml(byId('rdx-body'), '.rdx-mode-main') ?? maybeById('rdx-back'); if (b)
      b.focus({ preventScroll: true }); }
    function rdIntro() {
      const L = RD.L;
      if (!L)
          return;
      const r: Partial<ReadDrillLevelStat> = L.custom ? {} : (deps.rdData().lv[L.id] || {});
      RD.on = false;
      deps.stageSync();
      byId('rdx-title').textContent = deps.rdLvName(L);
      byId('rdx-sub').textContent = rdLvDetail(L);
      byId('rdx-hud').textContent = '';
      byId('rdx-meter').hidden = true;
      byId('rdx-end').hidden = true;
      const modes = rdModes(L), ic = RD_MODE_ICON;
      const pool = ['name', 'play', 'k2s'].includes(L.ty) ? rdPoolSvg(L) : '';
      const prev = pool ? `<div class="rdx-staff rdx-preview" aria-hidden="true">${pool}</div>` : '';
      const rec = L.custom ? '' : `<div class="rdx-rec">${rdStars(r.s || 0)}${r.acc ? `<span>${deps.t('rdx_best_acc', r.acc)}</span>` : ''}${r.t ? `<span>${deps.t('rdx_best_t', (r.t / 1000).toFixed(1))}</span>` : ''}</div>`;
      const sfx = rdHasCheck(L) ? '' : '_' + L.ty;
      const card = (m: ReadDrillMode, cls: string) => `<button type="button" class="rdx-mode${cls}" data-mode="${m}"><b>${ic[m]} ${deps.t('rdx_m_' + m)}</b><span>${deps.t('rdx_md_' + m + sfx)}</span>` +
          (m === 'practice' ? `<i class="rdx-mode-go">▶ ${deps.t('rd_start_short')}</i>` : '') + '</button>';
      // Each Challenge mode shows its record; Marathon is a group with one item per length.
      const best = (m: ReadDrillMode) => { const b = m === 'timeAttack' ? (r.ta ? deps.t('rdx_best_ta', deps.anNum(r.ta, 0)) : '') : m === 'survival' ? (r.sv ? deps.t('rdx_best_sv', deps.anNum(r.sv, 0)) : '') : r.mn ? deps.t('rdx_best_mn', r.mn) : ''; return b ? `<em>🏆 ${deps.rdEsc(b)}</em>` : ''; };
      const item = (m: ReadDrillMode) => m === 'marathon'
          ? `<div class="rdx-chal-grp" role="group" aria-labelledby="rdx-m-marathon"><b id="rdx-m-marathon">${ic[m]} ${deps.t('rdx_m_marathon')}</b><span>${deps.t('rdx_md_marathon')}</span>${best(m)}<div class="rdx-bars"><span aria-hidden="true">${deps.t('rdx_bars')}</span>${[16, 32, 64].map((n) => `<button type="button" class="chip" role="menuitem" tabindex="-1" data-mode="marathon" data-bars="${n}" aria-label="${deps.rdEsc(deps.t('rdx_m_marathon') + ', ' + deps.t('rdx_bars') + ' ' + n)}">${n}</button>`).join('')}</div></div>`
          : `<button type="button" class="rdx-chal-it" role="menuitem" tabindex="-1" data-mode="${m}"><b>${ic[m]} ${deps.t('rdx_m_' + m)}</b><span>${deps.t('rdx_md_' + m)}</span>${best(m)}</button>`;
      const chal = modes.filter((m) => m !== 'practice');
      // Practice first; then the Challenge menu, or the graded run for rhythm and sight-reading levels.
      const more = rdHasCheck(L)
          ? `<button type="button" class="rdx-mode rdx-chal-btn" id="rdx-chal" aria-haspopup="menu" aria-expanded="false" aria-controls="rdx-chal-menu"><b>🏁 ${deps.t('rdx_challenge')} <i aria-hidden="true">▾</i></b><span>${deps.rdEsc(chal.map((m) => deps.t('rdx_m_' + m)).join(' · '))}</span></button><div class="rdx-chal-menu" id="rdx-chal-menu" role="menu" aria-labelledby="rdx-chal" hidden>${chal.map(item).join('')}</div>`
          : card('test', '');
      byId('rdx-body').innerHTML = `<div class="rdx-intro"><p class="rdx-desc">${deps.t('rdx_d_' + L.ty + (deps.rdFlowOk(L) ? '_flow' : ''))}</p>${prev}${rec}<div class="rdx-modes">${card('practice', ' rdx-mode-main')}${more}</div></div>`;
      deps.rdCoach(true);
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
      deps.ensureAudio();
      if (L.ty === 'sr') {
          rdSightStart(mode);
          return;
      }
      if (srtIsMarathonBars(bars))
          RD.bars = bars;
      rdClear();
      const now = performance.now();
      Object.assign(RD, { on: true, mode, n: 0, ok: 0, ms: 0, streak: 0, best: 0, miss: {}, lastK: null, rhP: [], rhM: [], answered: false, next: null, flow: null, fix: false, arc: srtIsArcadeMode(mode) ? srtArcadeStart(mode, now, { targetMs: rdTarget(L), marathonBars: RD.bars }) : null, tout: false, arcFx: '', limF: 1, chk: [], chkBest: null, chkNew: 0 });
      deps.stageSync();
      deps.rdCoach(true);
      const e = byId('rdx-end');
      e.hidden = false;
      e.textContent = deps.t(mode === 'practice' ? 'rdx_end' : 'rdx_quit');
      if (RD.arc && RD.arc.deadlineMs !== null)
          RD.rushEnd = RD.arc.deadlineMs;
      if (mode === 'timeAttack' || mode === 'survival')
          RD.rushIv = window.setInterval(() => { if (!RD.on)
              return; rdHud(); if (rdTimeUp() && (!RD.answered || RD.fix))
              rdFinish(); }, 250);
      if (L.ty === 'rh')
          deps.rdRhNew();
      else if (deps.rdFlowOk(L))
          deps.rdFlowStart();
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
              deps.rdRhMarks(false);
      }
      (RD.nodes || []).forEach((n: { stop: (arg0: number) => void; }) => { try {
          n.stop(0);
      }
      catch (_) { } });
      RD.nodes = [];
      rdDockClear();
      rdDockForce(false);
  }
    function rdAbort() { rdClear(); RD.on = false; deps.stageSync(); }
    function rdEndClick() { if (deps.WARM.on && deps.WARM.phase === 'drill') {
      deps.rdnHome(true);
      return;
  }
  if (RD.on && RD.mode === 'practice' && RD.n > 0)
      rdFinish();
  else {
      rdAbort();
      rdIntro();
  } }
    function rdBack() { rdAbort(); byId('rdx-stage').hidden = true; byId('rdx-home').hidden = false; rdRenderHome(); }
    function rdFinish() {
      const L = RD.L, mode = RD.mode, now = performance.now();
      rdClear();
      RD.on = false;
      deps.stageSync();
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
      const d = deps.rdData();
      if (!deps.WARM.on) d.tot.sess++;
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
      if (!deps.WARM.on) {
          deps.touchDay();
          deps.markReadDoneToday();
      }
      deps.saveAll();
      // Warm-up drills retain their results. The warm-up is counted when all steps are complete.
      if (deps.rdnWarmDrillDone())
          return;
      const weak = Object.entries(RD.miss).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const pts = sum ? deps.anNum(sum.score, 0) : '', avgS = (avg / 1000).toFixed(1) + 's';
      const tiles = L.ty === 'rh' ? [[acc + '%', deps.t('rdx_st_rh')], [RD.rhP.length, deps.t('rdx_st_ex')]]
          : sum && sum.mode === 'survival' ? [[pts, deps.t('rdx_st_score')], [rdClock(sum.elapsedMs), deps.t('rdx_st_survived')], [sum.correct, deps.t('rdx_st_rush')], [avgS, deps.t('rdx_st_time')]]
              : sum && sum.mode === 'timeAttack' ? [[pts, deps.t('rdx_st_score')], [sum.correct, deps.t('rdx_st_rush')], [acc + '%', deps.t('rdx_st_acc')], [sum.bestCombo, deps.t('rdx_st_streak')]]
                  : sum ? [[rdClock(sum.elapsedMs), deps.t('rdx_st_total')], [acc + '%', deps.t('rdx_st_acc')], [npm, deps.t('rdx_st_npm')], [pts, deps.t('rdx_st_score')]]
                      : [[acc + '%', deps.t('rdx_st_acc')], [avgS, deps.t('rdx_st_time')], [RD.best, deps.t('rdx_st_streak')], [RD.ok + '/' + RD.n, deps.t('rdx_st_ans')]];
      const best = newBest ? ' · 🏆 ' + deps.t('rdx_newbest') : '';
      const head = shown ? `<div class="rdx-sum-stars">${rdStars(stars)}</div><p class="rdx-sum-msg">${deps.t(stars === 3 ? 'rdx_s3' : stars === 2 ? 'rdx_s2' : stars === 1 ? 'rdx_s1' : 'rdx_s0')}</p>`
          : chk ? `<p class="rdx-sum-msg">${deps.t('rdx_chk_wait', RD.chk.length, RD_CHECK_N)}</p>`
              : sum ? `<p class="rdx-sum-msg">${RD_MODE_ICON[mode]} ${sum.mode === 'marathon' ? deps.t('rdx_npm', npm) : deps.t('rdx_arc_score', pts)}${best}</p>` : `<p class="rdx-sum-msg">${deps.t('rdx_sum_practice')}</p>`;
      const nx = rdLvNext(L);
      RD.next = deps.rdNextStep(L, mode, acc, avg, stars, weak);
      deps.rdCoach(false);
      byId('rdx-body').innerHTML = `<div class="rdx-sum" tabindex="-1" id="rdx-sum"${(RD).next ? ' aria-describedby="rdx-next"' : ''}><h2>${deps.t('rdx_sum_title')}</h2>${head}
      <div class="rdx-tiles">${tiles.map((x) => `<div><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div>
      ${weak.length ? `<div class="rdx-weak"><span>${deps.t('rdx_review')}</span>${weak.map(([k, c]) => `<i class="rdx-tag">${deps.rdEsc(rdKeyText(k))}${c > 1 ? ' ×' + c : ''}</i>`).join('')}</div>` : ''}
      ${(RD).next ? `<div class="coach rdx-coach" id="rdx-next" data-kind="next">${deps.coachHTML(deps.t('coach_next'), (RD).next, 'rdx-next-act')}</div>` : ''}
      <div class="row rdx-sum-btns"><button class="btn primary" data-act="again">↺ ${deps.t('rdx_again')}</button>${!L.custom && nx ? `<button class="btn" data-act="next">${deps.t('rdx_next_lv')} →</button>` : ''}<button class="btn ghost" data-act="levels">${deps.t('rdx_levels')}</button></div></div>`;
      byId('rdx-live').textContent = deps.t('rdx_sum_title') + ': ' + acc + '%' + (shown ? ' · ' + deps.t('rdx_stars_n', stars) : '') + (sum ? ' · ' + (sum.mode === 'marathon' ? deps.t('rdx_npm', npm) : deps.t('rdx_arc_score', pts)) : '') + ((RD).next ? '. ' + deps.t('coach_next') + ' ' + deps.coachText((RD).next) : '');
      byId('rdx-hud').textContent = '';
      byId('rdx-meter').hidden = true;
      const s = maybeById('rdx-sum');
      if (s)
          s.focus({ preventScroll: true });
  }
    /* ---- home: progress hero, level ladder, custom drill ---- */
  function rdSuggest() {
      const d = deps.rdData(), last = RD_LV[d.prefs.last ?? ''];
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
      const d = deps.rdData(), tot = d.tot, st = RD_ALL.reduce((sum, level) => sum + deps.rdStarCount(d.lv[level.id]?.s), 0), cont = rdSuggest();
      const unit = RD_UNITS.find((u) => u.lv.includes(cont)), rec: Partial<ReadDrillLevelStat> = d.lv[cont.id] || {}, sample = rdLvSample(cont);
      const best = [rec.acc ? deps.t('rdx_best_acc', rec.acc) : '', rec.t ? deps.t('rdx_best_t', (rec.t / 1000).toFixed(1)) : ''].filter(Boolean).map((s) => `<span>${deps.rdEsc(s)}</span>`).join('');
      const opt = (id: string, on: boolean, key: string, off = false) => `<label class="switch-inline"><input type="checkbox" id="${id}"${on ? ' checked' : ''}${off ? ' disabled' : ''}> <span>${deps.t(key)}</span></label>`;
      // Stats, then the level to play next (a picture of it, its name, details and stars, and the button), then the options,
      // folded under "Drill options": they are settings kept between sessions, so they stay one tap away. The panel keeps
      // its open state when the hero is drawn again.
      const prevOpts = maybeById('rdx-opts'), optsOpen = prevOpts instanceof HTMLDetailsElement && prevOpts.open;
      byId('rdx-hero').innerHTML = `<div class="rdx-hero-l"><div><div class="rdx-big">★ ${st}<small> / ${RD_ALL.length * 3}</small></div><div class="rdx-hero-s">${deps.t('rdx_hero_stars')}</div></div>
      <div class="rdx-hero-m"><div><b>${tot.n}</b><span>${deps.t('rdx_st_ans')}</span></div><div><b>${tot.n ? Math.round(100 * tot.ok / tot.n) + '%' : '—'}</b><span>${deps.t('rdx_st_acc')}</span></div><div><b>${tot.n ? (tot.ms / tot.n / 1000).toFixed(1) + 's' : '—'}</b><span>${deps.t('rdx_st_time')}</span></div></div></div>
      <div class="rdx-next"><div class="rdx-next-pic" aria-hidden="true">${sample || `<span class="rdx-next-ic">${unit ? unit.icon : '🎯'}</span>`}</div>
        <div class="rdx-next-txt"><span class="rdx-next-eye">${deps.t(d.prefs.last ? 'rdx_hero_next' : 'rdx_hero_first')}</span><b class="rdx-next-name" id="rdx-next-name">${deps.rdEsc(deps.rdLvName(cont))}</b><span class="rdx-next-d" id="rdx-next-d">${deps.rdEsc(rdLvDetail(cont))}</span></div>
        <div class="rdx-next-go"><div class="rdx-rec">${rdStars(rec.s || 0)}${best}</div>
        <button class="btn primary" data-lv="${cont.id}" id="rdx-cont" aria-describedby="rdx-next-name rdx-next-d">▶ ${deps.t(d.prefs.last ? 'rdx_continue' : 'rdx_begin')}</button></div></div>
      <details class="rdx-hero-r" id="rdx-opts"${optsOpen ? ' open' : ''}><summary>${deps.rdEsc(deps.t('rdx_hero_opts'))}</summary><div class="rdx-opts-grid" role="group" aria-label="${deps.rdEsc(deps.t('rdx_hero_opts'))}">${opt('rdx-snd', !!d.prefs.sound, 'rdx_sound')}${opt('rdx-hints', !!d.prefs.hints, 'rdx_hints')}${opt('rdx-flow', !!d.prefs.flow, 'rdx_flow')}${opt('rdx-ghost', !!d.prefs.ghost, 'rdx_ghost', !d.prefs.flow)}${opt('rdx-stage-pref', !!d.prefs.stage, 'rdx_stage')}${opt('rdx-weak-inject', !!host.store.data().settings.weakSpotInjection, 'rdx_weak_inject')}</div></details>`;
      const filters = maybeById('rdx-filters');
      if (filters) {
          queryAllHtml(filters, '[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === rdxFilter)));
      }
      const orchInput = maybeById('rdx-show-orch');
      if (orchInput instanceof HTMLInputElement)
          orchInput.checked = rdxShowOrch;
      const landBtn = maybeById('rdx-land-btn');
      if (landBtn)
          landBtn.hidden = deps.rdStarCount(d.lv['tr1']?.s) >= 2 && st >= 6;
      const visibleUnits = RD_UNITS.filter((u) => (u.u !== 'cc' || rdxShowOrch) && (rdxFilter === 'all' || RD_UNIT_CAT[u.u] === rdxFilter));
      byId('rdx-ladder').innerHTML = visibleUnits.map((u) => {
          const done = u.lv.filter((L: ReadDrillLevel) => deps.rdStarCount(d.lv[L.id]?.s) > 0).length;
          return `<section class="rdx-unit"${u.lv.length >= 6 ? ' data-many="1"' : ''}><h3><span class="ic" aria-hidden="true">${u.icon}</span><span>${deps.t('rdx_u_' + u.u)}</span><small>${done}/${u.lv.length}</small></h3><p>${deps.t('rdx_ud_' + u.u)}</p><div class="rdx-lvs">${u.lv.map((L: ReadDrillLevel) => {
              const s = deps.rdStarCount(d.lv[L.id]?.s);
              return `<button class="rdx-lv${s ? ' s' + s : ''}" data-lv="${L.id}" title="${deps.rdEsc(rdLvDetail(L))}" aria-label="${deps.rdEsc(deps.rdLvName(L) + ': ' + rdLvDetail(L) + (s ? ' — ' + deps.t('rdx_stars_n', s) : ''))}"><span class="n">${L.n}</span><span class="d"><b>${deps.t('rdx_ty_' + L.ty)}</b><i>${deps.rdEsc(rdLvSub(L))}</i></span><span class="st" aria-hidden="true">${'★'.repeat(s)}<i>${'☆'.repeat(3 - s)}</i></span></button>`;
          }).join('')}</div></section>`;
      }).join('');
      // One Tab stop for the drill grid; the arrow keys move between levels.
      rovingFocus(byId('rdx-ladder'), '.rdx-lv');
      rdCustomFill();
  }
    const RD_CDEF: Record<string, [string, string]> = { treble: ['C4', 'G5'], bass: ['F2', 'C4'], grand: ['C3', 'C5'], alto: ['D3', 'B4'], tenor: ['A2', 'G4'] };
    function rdCustomFill() {
      const lo = selectById('rdx-c-lo'), hi = selectById('rdx-c-hi');
      if (!lo)
          return;
      const c = deps.rdData().prefs.custom || { ty: 'name', clef: 'treble', lo: 'C4', hi: 'G5', acc: 0, keys: 0, land: false };
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
      deps.rdData().prefs.custom = c;
      return c;
  }
    function rdCustomGo() {
      const c = rdCustomRead();
      deps.saveAll();
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
      for (const [k, s] of Object.entries((deps.rdData().nt))) {
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
      return rdSvg({ clef, cols, colW: 24, dur: 1, scale: 1.2, lbl, lblCls: cls, aria: deps.t('rdx_heat_aria', deps.t('rdx_clef_' + clef)) }).svg;
  }
    function rdBars(rows: readonly { l: string; n: number; ok: number; }[]) { return rows.map((r) => `<div class="rdx-bar"><span>${deps.rdEsc(r.l)}</span><div class="rdx-bar-t"><i style="width:${r.n ? Math.round(100 * r.ok / r.n) : 0}%"></i></div><em>${r.n ? Math.round(100 * r.ok / r.n) + '% · ' + deps.rdEsc(r.n) + '×' : '—'}</em></div>`).join(''); }
    function rdRenderStats() {
      const box = maybeById('rdx-stats');
      if (!box)
          return;
      const book = deps.rdnBook(), tally = srtBookTally(book, book.level);
      const d = deps.rdData(), tot = d.tot, nt = d.nt, g = (k: string) => nt[k] || { n: 0, ok: 0 };
      const lvDone = RD_ALL.filter(L => deps.rdStarCount(d.lv[L.id]?.s) > 0).length, st = RD_ALL.reduce((sum, level) => sum + deps.rdStarCount(d.lv[level.id]?.s), 0);
      const weak = Object.entries(nt).filter(([k, s]) => s.n >= 3 && !/^rh:/.test(k)).sort((a, b) => (b[1].e - a[1].e) || (b[1].t - a[1].t)).slice(0, 10);
      const ks: { l: string; n: number; ok: number; }[] = [];
      for (let k = -7; k <= 7; k++)
          if (g('ks:' + k).n)
              ks.push({ l: rdKeyLabel(k), ...g('ks:' + k) });
      const rh = (RD_UNITS.find((u) => u.u === 'rh')?.lv ?? []).filter((L: ReadDrillLevel) => g('rh:' + L.id).n).map((L: ReadDrillLevel) => ({ l: deps.rdLvName(L), ...g('rh:' + L.id) }));
      const extra = (['alto', 'tenor'] as const).filter((c) => Object.keys(nt).some((k) => k[0] === RD_CLEFC[c]));
      box.innerHTML = `<div class="panel rdx-stat-p" id="rdx-book-progress"><h3>${deps.rdEsc(deps.t('rdn_book_head', book.level))}</h3>
        <p class="rdx-desc">${deps.rdEsc(deps.t('rdn_done_of', tally.done, SRT_BOOK_PIECES))}</p>
        <div class="stat-row">${deps.statHTML(srtPiecesRead(book), deps.t('rdn_stat_read'))}</div></div>
      <div class="rdx-tiles rdx-tiles-lg">${[[tot.n, deps.t('rdx_st_ans')], [tot.n ? Math.round(100 * tot.ok / tot.n) + '%' : '—', deps.t('rdx_st_acc')], [tot.n ? (tot.ms / tot.n / 1000).toFixed(1) + 's' : '—', deps.t('rdx_st_time')], [tot.sess, deps.t('rdx_st_sess')], ['★ ' + st, deps.t('rdx_hero_stars')], [lvDone + '/' + RD_ALL.length, deps.t('rdx_st_lv')]].map((x) => `<div><b>${deps.rdEsc(x[0])}</b><span>${deps.rdEsc(x[1])}</span></div>`).join('')}</div>
      <div class="panel rdx-stat-p"><h3>${deps.t('rdx_heat')}</h3><p class="rdx-desc">${deps.t('rdx_heat_d')}</p>
        <div class="rdx-staff rdx-heat">${rdHeat('treble', 'A3', 'C6')}</div><div class="rdx-staff rdx-heat">${rdHeat('bass', 'C2', 'E4')}</div>
        ${extra.map((c) => `<div class="rdx-staff rdx-heat">${rdHeat(c, c === 'alto' ? 'C3' : 'A2', c === 'alto' ? 'D5' : 'B4')}</div>`).join('')}</div>
      <div class="rdx-stat-grid"><div class="panel rdx-stat-p"><h3>${deps.t('rdx_u_iv')}</h3>${rdBars(RD_ALLIV.map((v) => ({ l: rdIvName(v), ...g('iv:' + v) })))}</div>
        <div class="panel rdx-stat-p"><h3>${deps.t('rdx_u_ch')}</h3>${rdBars(['maj', 'min', 'dim', 'aug'].map((q) => ({ l: deps.t('rdx_q_' + q), ...g('ch:' + q) })))}</div>
        <div class="panel rdx-stat-p"><h3>${deps.t('rdx_u_ks')}</h3>${ks.length ? rdBars(ks) : `<p class="rdx-desc">${deps.t('rdx_nodata')}</p>`}</div>
        <div class="panel rdx-stat-p"><h3>${deps.t('rdx_u_rh')}</h3>${rh.length ? rdBars(rh) : `<p class="rdx-desc">${deps.t('rdx_nodata')}</p>`}</div></div>
      <div class="panel rdx-stat-p"><h3>${deps.t('rdx_weakest')}</h3>${weak.length ? `<div class="rdx-weak">${weak.map(([k, s]) => `<i class="rdx-tag">${deps.rdEsc(rdKeyText(k))} · ${Math.round(100 * s.ok / s.n)}% · ${((s.t || 0) / 1000).toFixed(1)}s</i>`).join('')}</div>` : `<p class="rdx-desc">${deps.t('rdx_nodata')}</p>`}
        <div class="row" style="margin-top:14px"><button class="btn ghost sm" id="rdx-reset">${deps.t('rdx_reset')}</button></div></div>`;
  }
    /* ---- tabs, wiring, locale ---- */
  // `screen` picks between the old sight-reading screen (melody) and the player of a level piece; both use the pieces panel.
  function rdTab(tab: string|undefined, screen: 'melody' | 'player' = 'melody') {
      if (tab === 'book') {
          deps.rdnHome(false);
          return;
      }
      // A saved tab that no longer exists (the old Statistics tab, now in Progress) opens the drills.
      if (tab === undefined || !['drills', 'pieces'].includes(tab))
          tab = 'drills';
      const leavesPlayer = !!deps.SR.lvPiece && (tab !== 'pieces' || screen !== 'player');
      if ((tab !== 'pieces' || leavesPlayer) && deps.srtPendingSaveProtected()) {
          if (deps.SR.srtState?.name === 'pendingSave') {
              void deps.srtAbandonClaim('abandoned', false).then((result) => {
                  if (result.ok || deps.SR.srtState?.name !== 'pendingSave')
                      rdTab(tab, screen);
              });
          }
          return;
      }
      deps.rdnShowScreen(tab === 'pieces' ? screen : 'drills');
      deps.rdData().prefs.tab = tab;
      ['drills', 'pieces'].forEach((x) => { const p = maybeById('rdp-' + x); if (p)
          p.hidden = x !== tab; });
      if (tab !== 'drills' && RD.on) {
          rdAbort();
          rdIntro();
      }
      if (tab !== 'pieces')
          deps.srStopAll(true, false, 'navigate');
      if (tab === 'drills' && byId('rdx-stage').hidden)
          rdRenderHome();
      deps.stageSync();
      deps.syncMobileStartBars();
  }
    // Draws the Read tab's current screen. The home is the first screen each time the tab opens (see renderRead).
  function rdRender() {
      if (deps.RDN.screen === 'warmup' && deps.WARM.on) {
          deps.rdnWarmLocale();
          return;
      }
      if (deps.RDN.screen === 'home' || deps.RDN.screen === 'warmup') {
          deps.rdnHome();
          return;
      }
      if (deps.RDN.screen === 'player' && deps.SR.lvPiece) {
          rdTab('pieces', 'player');
          deps.rdnPlayerHead();
          return;
      }
      rdTab(deps.RDN.screen === 'melody' || deps.RDN.screen === 'player' ? 'pieces' : 'drills');
  }
    function rdKey(e: KeyboardEvent, k: string) {
      if (deps.view0() !== 'read' || byId('rdp-drills').hidden || !RD.on)
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
              deps.rdRhPress('k:' + k, 'R');
              return true;
          }
          if (R && R.two && R.playing && (k === 'f' || k === 'j')) {
              e.preventDefault();
              deps.rdRhPress('k:' + k, k === 'f' ? 'L' : 'R');
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
      if (deps.SR.active) {
          const g = byId('rd-go');
          if (g)
              g.textContent = deps.t('rd_stop');
      }
      if (deps.SR.listening) {
          const l = byId('rd-listen');
          if (l)
              l.textContent = deps.t('rd_stop');
      }
      if (deps.SR.gen && deps.SR.lvPiece) {
          deps.SR.gen.t = { en: deps.rdnHeadText().title };
          deps.rdnPlayerHead();
          deps.rdnChecklist();
          // The status line before an attempt follows the language.
          const v = byId('rd-verdict');
          if (deps.RDN.ready && v.textContent === deps.RDN.ready)
              v.textContent = deps.RDN.ready = deps.rdnReadyText();
          if (!byId('rdn-result').hidden)
              deps.rdnResultShow(false);
          deps.srMeta();
      }
      else if (deps.SR.gen) {
          deps.SR.gen.t = { en: deps.tl('en', 'rdx_sr_title', deps.SR.gen.level), ro: deps.tl('ro', 'rdx_sr_title', deps.SR.gen.level) };
          deps.srMeta();
      }
      deps.rdWarmButtonsSync();
      if (!byId('rdx-stage').hidden && RD.L) {
          byId('rdx-title').textContent = deps.rdLvName(RD.L);
          byId('rdx-sub').textContent = rdLvDetail(RD.L);
          if (!RD.on && !byId('rdx-body').querySelector('.rdx-sum'))
              rdIntro();
          else if (RD.on && RD.flow) {
              deps.rdFlowBody();
              deps.rdFlowShow(false);
          }
          else if (RD.on && RD.q && RD.q.ty === 'name')
              queryAllHtml(byId('rdx-ans'), '.rdx-a').forEach((b) => { if (b.firstChild)
                  b.firstChild.textContent = rdLetter(Number(b.dataset.a)); });
          if (RD.on) {
              byId('rdx-end').textContent = deps.t(RD.mode === 'practice' ? 'rdx_end' : 'rdx_quit');
              rdHud();
          }
      }
      if (deps.view0() === 'read')
          rdRender();
      else
          rdCustomFill();
  }

  return {
    RD_REF,
    RD_CLEFC,
    RD_MAJ,
    RD_MIN,
    RD_CHQ,
    RD_TARGET,
    rdP,
    rdStep,
    rdMidi,
    rdFromStep,
    rdAccSym,
    rdLetter,
    rdName,
    rdSpell,
    rdKeyLabel,
    rdKeyMinor,
    rdNk,
    rdCClef,
    rdKsSvg,
    rdSvg,
    RD_CHECK_N,
    RD_MODES,
    isReadDrillMode,
    RD_MODE_ICON,
    RD,
    rdModes,
    rdHasCheck,
    rdRunLen,
    rdTimeUp,
    rdArmLimit,
    rdArcFx,
    rdClock,
    rdLvNext,
    rdTarget,
    rdStat,
    rdWeakness,
    rdWeakItems,
    rdPick,
    rdPickFrom,
    rdPool,
    rdIvName,
    rdChLabel,
    rdShuffle,
    rdStaffClef,
    rdGen,
    rdQSvg,
    rdDockKeys,
    rdDockAt,
    rdDockMark,
    rdDockPaint,
    rdDockClear,
    rdDockView,
    rdDockForce,
    rdDockAsk,
    rdBtn,
    rdAccSeg,
    rdTools,
    RD_FLOW_W,
    RD_FLOW_SC,
    RD_GHOST_MAX,
    rdGhostTick,
    rdGhostPlace,
    rdNext,
    rdSound,
    RD_LM,
    rdHint,
    rdAnsText,
    rdScore,
    rdAnswer,
    rdStarsFor,
    rdCheckResult,
    rdCheck,
    rdCheckNotice,
    rdCheckHud,
    rdFeedback,
    rdClickAns,
    rdInput,
    rdHud,
    RD_RHU,
    isRdRhythmUnit,
    rdLevelBpm,
    rdClick,
    rdBeatX,
    RD_LH_PAT,
    rdTap,
    isRdSightLevel,
    srtProfileForLevel,
    get srtSeedCounter() { return srtSeedCounter; },
    set srtSeedCounter(value: typeof srtSeedCounter) { srtSeedCounter = value; },
    SRT_LAST_FINGERPRINT_KEY,
    SRT_RECENT_FINGERPRINTS_KEY,
    SRT_RECENT_FINGERPRINT_LIMIT,
    parseSrtRecent,
    get srtRecentFingerprintMemory() { return srtRecentFingerprintMemory; },
    set srtRecentFingerprintMemory(value: typeof srtRecentFingerprintMemory) { srtRecentFingerprintMemory = value; },
    srtSeedForLevel,
    srtRememberGeneratedFingerprint,
    srtRecentGeneratedFingerprints,
    srtLegacyPiece,
    rdSightGen,
    rdSightStart,
    rdGenMelody,
    srLearnGrade,
    rdSightDone,
    rdRangeTxt,
    rdLvDetail,
    rdLvSub,
    rdStars,
    rdKeyText,
    rdScroll,
    rdOpen,
    rdIntro,
    rdPoolSvg,
    rdLvSample,
    rdChalItems,
    rdChalOpen,
    rdChalKey,
    rdStart,
    rdClear,
    rdAbort,
    rdEndClick,
    rdBack,
    rdFinish,
    rdSuggest,
    RD_UNIT_CAT,
    get rdxFilter() { return rdxFilter; },
    set rdxFilter(value: typeof rdxFilter) { rdxFilter = value; },
    get rdxShowOrch() { return rdxShowOrch; },
    set rdxShowOrch(value: typeof rdxShowOrch) { rdxShowOrch = value; },
    rdRenderHome,
    RD_CDEF,
    rdCustomFill,
    rdCustomRead,
    rdCustomGo,
    rdCustomLevel,
    rdAgg,
    rdHeat,
    rdBars,
    rdRenderStats,
    rdTab,
    rdRender,
    rdKey,
    rdOnLocale,
  };
}

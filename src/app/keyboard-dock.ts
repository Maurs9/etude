import { byId, maybeById, inputById } from '../domain/dom.js';
import { eventTime, withInputTime } from '../domain/midi-timing.js';
import * as theory from '../domain/theory.js';
import type { InputReleaseKind, PracticeController, ReadController, ScorePlayerController, TranslateFn } from '../domain/views.js';

const pc = theory.pitchClass;

/** Shell state and services the keyboard and dock read; controllers are getters so a lazy feature is seen once loaded. */
export interface KeyboardDockDeps {
  readonly keyboardView: { low: number; oct: number };
  readonly baseLow: number;
  readonly baseHigh: number;
  readonly dock: { pref: boolean | null; auto: null; animT: number; force: boolean };
  readonly stage: { on: boolean; kb: boolean | null; rz: number };
  readonly held: Set<number>;
  readonly practice: PracticeController | null;
  readonly scorePlayer: ScorePlayerController | null;
  readonly read: ReadController | null;
  readonly midiController: { readonly state: { activeInputId?: string | null; midiMsg?: { text?: string | null } | null } };
  readonly labelMode: string;
  readonly view0: () => string;
  readonly t: TranslateFn;
  readonly noteName: (midi: number, flat: boolean) => string;
  readonly pcName: (pc: number, flat: boolean) => string;
  readonly rootName: (pc: number) => string;
  readonly reduceMotion: () => boolean;
  readonly saveAll: () => void;
  readonly clampTypeOctave: () => void;
  readonly handleNoteOn: (midi: number, velocity: number, source?: string) => void;
  readonly handleNoteOff: (midi: number, source?: string, releaseKind?: InputReleaseKind, silence?: boolean) => void;
  readonly inField: () => boolean;
  readonly closeMobileMenu: () => void;
  readonly scoreFocusUi: () => void;
  readonly anLayoutVars: () => void;
  readonly bleLive: () => boolean;
  readonly bleName: () => string;
}

/*
 * The on-screen keyboard and its dock: building and sizing the keys, painting their states (targets, hand colours,
 * degrees), pointer input, and the dock's open / rail / hidden states per view. Shell-owned state (the visible range,
 * label mode, the dock preference and stage) arrives through `deps`; notes played on the keys go to the input bus.
 */
export function createKeyboardDock(deps: KeyboardDockDeps) {
  const whiteEl = new Map<number, HTMLButtonElement>(), blackEl = new Map<number, HTMLButtonElement>(), keyEl = new Map<number, HTMLButtonElement>(), keyMk = new Map<number, HTMLSpanElement>(), keyDg = new Map<number, HTMLSpanElement>();
  const BLACK_NUDGE: Record<number, number> = { 1: 0, 3: 0, 6: 0, 8: 0, 10: 0 };
  function viewHigh() { return deps.keyboardView.low + deps.keyboardView.oct * 12; }
  // A phone on its side: the compact landscape layout of etude.css, and landscape.css while the keys are open (body.kb-land).
  const LAND_PHONE = matchMedia('(orientation: landscape) and (max-height: 560px)');
  // Three octaves on a phone on its side (four from 960 px), so the keys are wide enough to play; otherwise by width.
  function chooseView() { const w = window.innerWidth; deps.keyboardView.oct = LAND_PHONE.matches ? (w >= 960 ? 4 : 3) : w < 560 ? 2 : w < 900 ? 3 : 4; deps.keyboardView.low = Math.max(deps.baseLow, Math.min(deps.keyboardView.low, deps.baseHigh - deps.keyboardView.oct * 12)); deps.clampTypeOctave(); }
  function buildKeyboard() {
      deps.read?.dockView();
      deps.clampTypeOctave();
      const keys = byId('keys');
      if (!keys)
          return;
      const active = document.activeElement;
      const focused = active instanceof HTMLElement && keys.contains(active)
          ? Number(active.dataset.midi ?? 0)
          : null;
      keys.innerHTML = '';
      whiteEl.clear();
      blackEl.clear();
      keyEl.clear();
      keyMk.clear();
      keyDg.clear();
      const lo = deps.keyboardView.low, hi = viewHigh(), WHITE = new Set([0, 2, 4, 5, 7, 9, 11]);
      for (let m = lo; m <= hi; m++) {
          if (!WHITE.has(pc(m)))
              continue;
          const b = (document).createElement('button');
          b.className = 'key white';
          b.dataset.midi = String(m);
          b.type = 'button';
          b.tabIndex = 0;
          b.setAttribute('aria-label', deps.noteName(m, false));
          if (m === 60)
              b.classList.add('midc');
          if (deps.labelMode !== 'none' && (deps.labelMode === 'all' || pc(m) === 0)) {
              const l = (document).createElement('span');
              l.className = 'lbl';
              l.textContent = pc(m) === 0 ? deps.rootName(0) + (Math.floor(m / 12) - 1) : deps.pcName(pc(m), false);
              b.appendChild(l);
          }
          const mk = (document).createElement('span');
          mk.className = 'mk';
          b.appendChild(mk);
          const dg = (document).createElement('span');
          dg.className = 'dg';
          dg.setAttribute('aria-hidden', 'true');
          b.appendChild(dg);
          keys.appendChild(b);
          whiteEl.set(m, b);
          keyEl.set(m, b);
          keyMk.set(m, mk);
          keyDg.set(m, dg);
          bindKeyA11y(b, m);
      }
      for (let m = lo; m <= hi; m++) {
          if (WHITE.has(pc(m)))
              continue;
          const b = (document).createElement('button');
          b.className = 'key black';
          b.dataset.midi = String(m);
          b.type = 'button';
          b.tabIndex = 0;
          b.setAttribute('aria-label', deps.noteName(m, false));
          const mk = (document).createElement('span');
          mk.className = 'mk';
          b.appendChild(mk);
          const dg = (document).createElement('span');
          dg.className = 'dg';
          dg.setAttribute('aria-hidden', 'true');
          b.appendChild(dg);
          keys.appendChild(b);
          blackEl.set(m, b);
          keyEl.set(m, b);
          keyMk.set(m, mk);
          keyDg.set(m, dg);
          bindKeyA11y(b, m);
      }
      positionBlacks();
      if (focused != null) {
          const key = keyEl.get(Math.max(lo, Math.min(hi, focused)));
          if (key) {
              key.focus({ preventScroll: true });
              const scroll = byId('dock-keys'), r = key.getBoundingClientRect(), s = scroll.getBoundingClientRect();
              if (r.left < s.left)
                  scroll.scrollLeft += r.left - s.left;
              else if (r.right > s.right)
                  scroll.scrollLeft += r.right - s.right;
          }
      }
      const oi = byId('octInd');
      if (oi)
          oi.textContent = deps.noteName(deps.keyboardView.low, false) + '–' + deps.noteName(viewHigh(), false);
      kbDegrees(kbDegSrc);
      deps.read?.dockPaint();
      if (deps.view0() === 'analysis')
          deps.scorePlayer?.keysPaint(true);
      notifyDockReflow();
      deps.practice?.onKeyboardBuilt();
  }
  const dockReflowListeners = new Set<() => void>();
  function notifyDockReflow() {
      for (const listener of dockReflowListeners) listener();
  }
  // Chord-member numbers (1 3 5 7 …) shown on keys; `src` maps sounding MIDI notes to labels and is folded into view.
  let kbDegSrc: Map<number, string>|null = null;
  function kbDegrees(src: Map<number,string>|null) {
      kbDegSrc = src && src.size ? src : null;
      const folded = new Map<number, string>();
      if (kbDegSrc)
          kbDegSrc.forEach((label, m) => folded.set(foldToView(m), label));
      keyEl.forEach((el, m) => {
          const label = folded.get(m) || '', d = keyDg.get(m);
          const degDesc = label ? (label === 'R' ? deps.t('kb_deg_r') : deps.t('kb_deg', label)) : '';
          if (d) {
              d.textContent = label;
              if (degDesc)
                  d.title = degDesc;
              else
                  d.removeAttribute('title');
          }
          if (degDesc)
              el.title = deps.noteName(m, false) + ' — ' + degDesc;
          else
              el.removeAttribute('title');
          el.setAttribute('aria-label', deps.noteName(m, false) + (degDesc ? ', ' + degDesc : ''));
      });
  }
  function positionBlacks() { blackEl.forEach((el, bm) => { const w = whiteEl.get(bm - 1); if (!w || !w.offsetWidth)
      return; const bw = w.offsetWidth * .6, seam = w.offsetLeft + w.offsetWidth + .5, n = (BLACK_NUDGE[pc(bm)] || 0) * bw; el.style.width = bw + 'px'; el.style.left = (seam - bw / 2 + n) + 'px'; }); syncKeyboardPan(); }
  function syncKeyboardPan() { const scroll = byId('dock-keys'), pan = inputById('kb-pan'), max = Math.max(0, scroll.scrollWidth - scroll.clientWidth); pan.max = String(max); pan.value = String(scroll.scrollLeft); pan.hidden = !dockShown() || max < 1; }
  // On narrow screens the keys scroll sideways: bring a key into sight, unless focus is on the keys (the focused key stays in sight then).
  function dockKeyInSight(m: number) { const key = keyEl.get(m), scroll = byId('dock-keys'); if (!key || !dockShown() || byId('keys').contains(document.activeElement))
      return; const r = key.getBoundingClientRect(), s = scroll.getBoundingClientRect(); if (r.left < s.left || r.right > s.right)
      scroll.scrollLeft += (r.left + r.right - s.left - s.right) / 2; }
  function reflowKeys() { requestAnimationFrame(() => requestAnimationFrame(positionBlacks)); setTimeout(positionBlacks, 90); }
   // wait for the dock to lay out before measuring
  function foldToView(m: number) { const lo = deps.keyboardView.low, hi = viewHigh(); let x = m; while (x < lo)
      x += 12; while (x > hi)
      x -= 12; return x; }
  function kbState(midi: number, s: string|null, fold: boolean) { const m = fold ? foldToView(midi) : midi, el = keyEl.get(m); if (!el)
      return; if (s)
      el.dataset.s = s;
  else
      delete el.dataset.s; const mk = keyMk.get(m); if (mk)
      mk.textContent = s === 'good' ? '✓' : s === 'bad' ? '✗' : ''; }
  function kbClear(s: string) { keyEl.forEach((el, m) => { if (el.dataset.s === s) {
      delete el.dataset.s; const mk = keyMk.get(m); if (mk)
      mk.textContent = ''; } }); }
  function kbClearAll() { keyEl.forEach((el, m) => { delete el.dataset.s; const mk = keyMk.get(m); if (mk)
      mk.textContent = ''; }); }
  function kbPress(midi: number, on: boolean) { const m = foldToView(midi), el = keyEl.get(m); if (!el)
      return; if (!on && [...deps.held].some((n) => foldToView(n) === m))
      return; el.classList.toggle('pressed', on); if (on) {
      if (!el.dataset.s)
          el.dataset.s = 'active';
  }
  else if (el.dataset.s === 'active')
      delete el.dataset.s; }
  function repaintHeld() { deps.held.forEach((m) => kbPress(m, true)); }
  const pointerKey = new Map<number, number|null>();
  function keyAt(x: number, y: number) { const el = document.elementFromPoint(x, y); if (el) {
      const k = el.closest('.key');
      if (k instanceof HTMLElement)
          return +(k.dataset.midi ?? 0);
  } return null; }
  // A touch or click on the screen, judged from its own event time less the calibrated touch latency.
  function blurInputField() {
      const active = document.activeElement;
      if (active instanceof HTMLElement && deps.inField()) active.blur();
  }
  function touchInput(e: Event, fn: () => void) { withInputTime(eventTime(e.timeStamp, performance.now()), 'touch', fn); }
  function initPointer() {
      const kb = byId('keys');
      kb.addEventListener('pointerdown', (e) => { const m = keyAt(e.clientX, e.clientY); if (m == null)
          return; blurInputField(); e.preventDefault(); try {
          kb.setPointerCapture(e.pointerId);
      }
      catch (_) { } ; pointerKey.set(e.pointerId, m); touchInput(e, () => deps.handleNoteOn(m, 100, 'pointer:' + e.pointerId)); });
      kb.addEventListener('pointermove', (e) => { if (!pointerKey.has(e.pointerId))
          return; const cur = pointerKey.get(e.pointerId), m = keyAt(e.clientX, e.clientY); if (m !== cur) {
          touchInput(e, () => {
              if (cur != null)
                  deps.handleNoteOff(cur, 'pointer:' + e.pointerId);
              pointerKey.set(e.pointerId, m);
              if (m != null)
                  deps.handleNoteOn(m, 100, 'pointer:' + e.pointerId);
          });
      } });
      const end = (e: PointerEvent) => { if (pointerKey.has(e.pointerId)) {
          const m = pointerKey.get(e.pointerId);
          if (m != null)
              touchInput(e, () => deps.handleNoteOff(m, 'pointer:' + e.pointerId));
          pointerKey.delete(e.pointerId);
      } };
      kb.addEventListener('pointerup', end);
      kb.addEventListener('pointercancel', end);
      kb.addEventListener('lostpointercapture', end);
  }
  function bindKeyA11y(b: HTMLButtonElement, m: number) { b.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (!b._kd) {
          b._kd = true;
          deps.handleNoteOn(m, 100, 'button:' + m);
      }
  } }); b.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      b._kd = false;
      deps.handleNoteOff(m, 'button:' + m);
  } }); b.addEventListener('blur', () => { if (b._kd) {
      b._kd = false;
      deps.handleNoteOff(m, 'button:' + m);
  } }); }
  function dockWanted(v = deps.view0()) { return v === 'today' || v === 'explore' || !!deps.practice?.alongWanted(v) || (v === 'practice' && deps.practice?.hintKeys() === true) || v === 'learn' || v === 'read' || v === 'sing' || (!!deps.practice?.sesActive() && v === deps.practice.sesHome()) || (v === 'analysis' && !!deps.scorePlayer?.dockWanted()); }
  function sesNeedsKeys(v = deps.view0()) { return !!deps.practice?.sessionNeedsKeys(v) && !midiLive(); }
  function dockForced(v = deps.view0()) { return deps.dock.force && v === 'read'; }
  function midiLive() { return !!deps.midiController.state.activeInputId || deps.bleLive(); }
  function stageDock(v = deps.view0()) { return deps.stage.on && v === 'read' && (deps.stage.kb != null || midiLive()); }
  function dockOpen(v = deps.view0()) { const hintKeys = v === 'practice' ? deps.practice?.hintKeys() ?? null : null; if (hintKeys !== null)
      return hintKeys; if (dockForced(v))
      return true; if (stageDock(v))
      return deps.stage.kb ?? false; if (sesNeedsKeys(v))
      return deps.dock.pref !== false; if (deps.dock.pref != null)
      return deps.dock.pref; return false; }
  // Where the page stops being visible at the bottom: the top of the dock when it shows, else of the phone bottom bar
  // (the dock rides on the bar), else the end of the viewport.
  function fixedBottomTop() {
      for (const el of [byId('dock'), byId('bottomNav')]) {
          const r = el.getBoundingClientRect();
          if (r.height > 0 && getComputedStyle(el).display !== 'none')
              return r.top;
      }
      return innerHeight;
  }
  function dockShown() { return document.body.classList.contains('kb') && !byId('dock').classList.contains('is-rail'); }
  // The dock's own button names the action it takes (Hide / Show keyboard).
  function dockLabels() {
      const open = dockOpen(), act = deps.t(open ? 'kb_hide' : 'kb_show'), dk = byId('dock-kb-toggle');
      dk.setAttribute('aria-expanded', open ? 'true' : 'false');
      dk.title = act;
      const label = dk.querySelector('.dock-kb-label');
      if (label) label.textContent = act;
      const name = deps.stage.on && midiLive() ? (deps.midiController.state.activeInputId && deps.midiController.state.midiMsg?.text) || deps.bleName() : null;
      byId('dock-rail-note').textContent = name ? deps.t('stage_rail_midi', name) : deps.t('kb_rail_note');
      deps.scoreFocusUi();
  }
  function dockSync() {
      const dock = byId('dock'), v = deps.view0(), on = dockWanted(v), open = on && dockOpen(v), was = document.body.classList.contains('kb'), wasOpen = dockShown();
      // On a phone on its side the open keys take the header's room (landscape.css); Hide keyboard brings the header back.
      // A drill asking on the keys hides that button, so the header stays (kb-forced): it is the way to the other views.
      const land = open && LAND_PHONE.matches, wasLand = document.body.classList.contains('kb-land');
      const forced = land && dockForced(v), wasForced = document.body.classList.contains('kb-forced');
      dock.classList.toggle('compact', v === 'analysis');
      byId('dock-kb-toggle').hidden = !on || dockForced(v); // a drill asking on the keys keeps them: Hide would do nothing
      dockLabels();
      if (on === was && open === wasOpen && land === wasLand && forced === wasForced)
          return;
      document.body.classList.toggle('kb-land', land);
      document.body.classList.toggle('kb-forced', forced);
      const menuBtn = byId('menuBtn'), menu = byId('mobileMenu');
      const menuInDock = land && !forced;
      if (dock.contains(menuBtn) !== menuInDock) {
          deps.closeMobileMenu();
          if (menuInDock) {
              byId('dock-kb-toggle').before(menuBtn);
              dock.append(menu);
          } else {
              byId('helpBtn').before(menuBtn, menu);
          }
      }
      document.body.classList.toggle('kb', on);
      dock.classList.toggle('is-rail', on && !open);
      const exKbBtn = maybeById('ex-open-kb');
      if (exKbBtn) exKbBtn.hidden = dockShown() || midiLive();
      if (open) {
          if (was && !wasOpen)
              dockReveal();
          if (v === 'analysis')
              deps.scorePlayer?.keysCenterIfPending();
          positionBlacks();
          reflowKeys();
          if (v === 'analysis')
              deps.scorePlayer?.keysPaint(true);
      }
      else {
          dock.classList.remove('is-opening');
          if (v === 'analysis')
              deps.scorePlayer?.keysClear();
      }
      deps.anLayoutVars(); // size the page and the score from the dock's new height in this same frame: no stale gap, no overlap
      if (deps.stage.on)
          deps.read?.stageRefit();
  }
  // Expanding from the rail, the keys rise out of it (not with reduced motion); transform and opacity only, so the layout is settled from the first frame.
  function dockReveal() { if (deps.reduceMotion())
      return; const dock = byId('dock'); dock.classList.add('is-opening'); clearTimeout(deps.dock.animT); deps.dock.animT = window.setTimeout(() => dock.classList.remove('is-opening'), 300); }
  function dockSet(open: boolean) {
      if (deps.view0() === 'practice' && deps.practice && deps.practice.hintKeys() !== null) {
          deps.practice.setHintKeys(open);
          return;
      }
      if (stageDock()) {
          deps.stage.kb = !!open;
          dockSync();
          return;
      }
      const keep = deps.view0() === 'analysis' && deps.scorePlayer ? deps.scorePlayer.keepPlace() : dockKeepEnd(open);
      deps.dock.pref = !!open;
      deps.saveAll();
      if (deps.view0() === 'analysis' && deps.scorePlayer)
          deps.scorePlayer.updateControls();
      else
          dockSync();
      keep();
  }
  // Other pages scroll under the dock: whoever is reading the end of a long page still sees it when the keys come back.
  function dockKeepEnd(open: boolean) {
      const root = document.scrollingElement || document.documentElement, end = open && root.scrollHeight > innerHeight + 2 && root.scrollTop > 0 && root.scrollTop + innerHeight >= root.scrollHeight - 2;
      return () => { if (end)
          window.scrollTo(0, root.scrollHeight); };
  }

  /* Rotating a phone flips the landscape layout. */
  LAND_PHONE.addEventListener('change', () => dockSync());

  return {
    /** The degree labels painted on the keys (live: a getter, as the dock repaints from it). */
    get kbDegSrc() { return kbDegSrc; },
    LAND_PHONE,
    bindKeyA11y,
    blackEl,
    blurInputField,
    buildKeyboard,
    chooseView,
    dockForced,
    dockKeepEnd,
    dockKeyInSight,
    dockLabels,
    dockOpen,
    dockReflowListeners,
    dockReveal,
    dockSet,
    dockShown,
    dockSync,
    dockWanted,
    fixedBottomTop,
    foldToView,
    initPointer,
    kbClear,
    kbClearAll,
    kbDegrees,
    kbPress,
    kbState,
    keyAt,
    keyDg,
    keyEl,
    keyMk,
    midiLive,
    notifyDockReflow,
    pointerKey,
    positionBlacks,
    reflowKeys,
    repaintHeld,
    sesNeedsKeys,
    stageDock,
    syncKeyboardPan,
    touchInput,
    viewHigh,
    whiteEl,
    BLACK_NUDGE,
  };
}

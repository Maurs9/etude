import * as theory from '../../domain/theory.js';
import { byId, eventClosest, maybeById, selectById } from '../../domain/dom.js';
import {
  COF_COL, COF_FING, COF_MAJ, COF_MIN, COF_SCALE, COF_SOL,
  cofFifths, createCircleOfFifths, isCofFlavor, isCofMode,
} from '../../domain/circle-of-fifths.js';
import { CIRCLE } from '../../domain/repertoire-data.js';
import { srClef, srKeySigG } from '../../domain/grand-staff.js';
import {
  NOTE_SYS, SS_LETSEMI, ssFlat, ssKeyAcc, ssNatural, ssNotehead, ssSharp, ssStepOf,
} from '../../domain/score-types.js';
import type {
  AppHost, FeatureController, PreviewSequenceFrame, TestSurfaceRegistry,
} from '../../domain/views.js';

const SCALES = theory.SCALE_DEFINITIONS;
const CHORDS = theory.CHORD_TEMPLATES;
const pc = theory.pitchClass;
const isFlatKey = (p: number): boolean => [1, 3, 5, 8, 10].includes(((p % 12) + 12) % 12);

// Bass on the left and treble on the right, as on the keyboard. The frame never changes, so nothing moves while you play: each clef shows
// the exact sounding octave up to EX_LEDGERS ledger lines, and lists any note further away beside an arrow at its edge.
const EX_LEDGERS = 5;

// The frame fills its paper: the drawing scales with the paper's width up to EX_STAFF_ZOOM, or less where the room under it
// (--ex-staff-max, explore.css) runs out first; any width left over lengthens both staves. It follows the paper, never the notes.
const EX_STAFF_W = 520;
const EX_STAFF_H = 234;
const EX_STAFF_ZOOM = 1.5;

// With a key context its signature is drawn after each clef, notes are spelled in that key (E♯ in F♯ major), and a note shows
// an accidental, a natural too, only where it differs from the signature.
const EXPLORE_CHORD_DEGREE: Record<number, number> = {
  0: 1, 2: 2, 3: 3, 4: 3, 5: 4, 6: 5, 7: 5, 8: 5, 9: 6, 10: 7, 11: 7,
  13: 2, 14: 2, 15: 2, 17: 4, 18: 4, 21: 6,
};

interface ExploreStaffPitch {
  m: number;
  step: number;
  acc: string;
}

interface ExploreStaffHead {
  p: ExploreStaffPitch;
  y: number;
  lane: number;
}

interface ExploreStaffFrame {
  w: number;
  zoom: number;
}

interface ExploreKey {
  pc: number;
  minor: boolean;
}

export function createExploreFeature(host: AppHost): FeatureController {
  let mounted = false;
  let explorePreview: number[] = [];
  let exploreTimers: ReturnType<typeof setTimeout>[] = [];
  let exStaffLast = '';

  function clearExplorePreview(): void {
    exploreTimers.forEach(clearTimeout);
    exploreTimers = [];
    explorePreview = [];
    if (host.nav.activeView() === 'explore') updateExplore();
  }

  function exploreSequence(events: PreviewSequenceFrame[]): void {
    if (host.nav.activeView() !== 'explore') return;
    clearExplorePreview();
    let seq: readonly PreviewSequenceFrame[] = events;
    if (host.reduceMotion() && seq.length > 2) {
      const last = seq[seq.length - 1]; // reduced motion: one steady picture of every note instead of a light running across the keys
      seq = [{ at: 0, notes: [...new Set(seq.flatMap((e) => e.notes))].sort((a, b) => a - b) }].concat(last.notes.length ? [] : [last]);
    }
    seq.forEach((e) => {
      const paint = () => { explorePreview = e.notes; updateExplore(); };
      if (e.at === 0) paint();
      else exploreTimers.push(setTimeout(paint, e.at));
    });
  }

  function exStaffFrame(wrap: HTMLElement): ExploreStaffFrame | null {
    // The unrounded width, so the drawing never comes out a fraction wider than its paper and scrolls.
    const cs = getComputedStyle(wrap);
    const px = (v: string) => parseFloat(v) || 0;
    const inner = wrap.getBoundingClientRect().width - px(cs.borderLeftWidth) - px(cs.borderRightWidth) - px(cs.paddingLeft) - px(cs.paddingRight);
    if (!(inner > 0)) return null; // not laid out (another view): drawn at the default frame, refitted once it shows
    const maxH = parseFloat(cs.getPropertyValue('--ex-staff-max')) || Infinity;
    const zoom = Math.max(0.1, Math.min(EX_STAFF_ZOOM, inner / EX_STAFF_W, maxH / EX_STAFF_H));
    return { w: Math.max(EX_STAFF_W, Math.floor(inner / zoom + 1e-6)), zoom };
  }

  // Redraws when the paper's width or the room under it changes (a resize, the dock opening or closing).
  function exStaffRefit(): void {
    const wrap = maybeById('ex-staff');
    if (!wrap || host.nav.activeView() !== 'explore') return;
    const f = exStaffFrame(wrap);
    if (f && f.w + '|' + f.zoom !== exStaffLast) updateExplore();
  }

  function exKeyCtx(): ExploreKey | null {
    const v = selectById('keyCtx').value;
    const minor = v.startsWith('m');
    const keyPc = parseInt(minor ? v.slice(1) : v, 10);
    return keyPc >= 0 && keyPc < 12 ? { pc: keyPc, minor } : null;
  }

  // Sharps (+) or flats (−) in the key signature of the chosen key context, as the rest of the app counts them; 0 without one.
  function exKeyFifths(k: ExploreKey | null = exKeyCtx()): number {
    return k ? theory.keyFifths(k.pc, k.minor) : 0;
  }

  function exploreRootSpell(rootPc: number, symbol: string, keyCtx: ExploreKey | null): theory.SpelledMidi {
    if (keyCtx) {
      const fifths = exKeyFifths(keyCtx);
      const sig = ssKeyAcc(fifths);
      const sp = theory.spellMidi(60 + rootPc, fifths, keyCtx.minor);
      const sigMatch = (SS_LETSEMI[sp.li] + sig[sp.li] + 12) % 12 === rootPc;
      const harmonicLeading = keyCtx.minor && ((rootPc - keyCtx.pc + 12) % 12) === 11;
      if (sigMatch || harmonicLeading) return sp;
    }
    const isMinorLike = /^m(?!aj)|^dim/.test(symbol);
    return theory.spellMidi(60 + rootPc, theory.keyFifths(rootPc, isMinorLike), isMinorLike);
  }

  function exploreChordSpelling(
    notes: readonly number[],
    id: NonNullable<ReturnType<typeof theory.identifyChord>>,
    keyCtx: ExploreKey | null,
  ) {
    const rootSp = exploreRootSpell(id.rootPc, id.chord.symbol, keyCtx);
    const rootAnchor = (rootSp.oct + 1) * 12 + SS_LETSEMI[rootSp.li] + rootSp.acc;
    const intervals = id.chord.intervals || id.chord.pcset;
    const relDegree = new Map<number, number>();
    intervals.forEach((iv) => {
      const deg = id.chord.symbol === 'dim7' && iv === 9 ? 7 : (EXPLORE_CHORD_DEGREE[iv] ?? 1);
      relDegree.set(pc(iv), deg);
    });
    const byMidi = new Map<number, theory.SpelledMidi>();
    notes.forEach((m) => {
      const rel = pc(m - id.rootPc);
      const deg = relDegree.get(rel);
      const raw = deg ? theory.spellDiatonicDegree(rootSp, rootAnchor + rel, deg) : theory.spellMidi(m, exKeyFifths(keyCtx), !!keyCtx?.minor);
      const oct = Math.floor((m - raw.acc - SS_LETSEMI[raw.li]) / 12) - 1;
      byMidi.set(m, { li: raw.li, acc: raw.acc, oct });
    });
    const bassMidi = Math.min(...notes);
    return { rootSp, bassSp: byMidi.get(bassMidi) || rootSp, byMidi };
  }

  function exploreMidiText(
    m: number,
    flat: boolean,
    key: ExploreKey | null,
    spelled?: ReadonlyMap<number, theory.SpelledMidi>,
  ): string {
    const sp = spelled?.get(m) ?? (key ? theory.spellMidi(m, exKeyFifths(key), key.minor) : null);
    return sp ? host.i18n.spell(sp.li, sp.acc, true) + sp.oct : host.i18n.noteName(m, flat);
  }

  function exploreAccToken(sp: theory.SpelledMidi, keyAcc: readonly number[]): string {
    if (sp.acc === keyAcc[sp.li]) return '';
    if (sp.acc >= 2) return '##';
    if (sp.acc === 1) return '#';
    if (sp.acc <= -2) return 'bb';
    if (sp.acc === -1) return 'b';
    return 'n';
  }

  function drawExploreStaff(
    midis: readonly number[],
    flat: boolean,
    key: ExploreKey | null = exKeyCtx(),
    spelled?: ReadonlyMap<number, theory.SpelledMidi>,
  ): void {
    const wrap = byId('ex-staff');
    if (!wrap) return;
    const frame = exStaffFrame(wrap);
    exStaffLast = frame ? frame.w + '|' + frame.zoom : '';
    const names = flat
      ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
      : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const fifths = exKeyFifths(key);
    const keyAcc = ssKeyAcc(fifths);
    const pitches: ExploreStaffPitch[] = [...new Set(midis)].map((m) => {
      const sp = spelled?.get(m) ?? (key ? theory.spellMidi(m, fifths, key.minor) : null);
      if (sp) return { m, step: ssStepOf(sp.li, sp.oct), acc: exploreAccToken(sp, keyAcc) };
      const name = names[pc(m)];
      const li = 'CDEFGAB'.indexOf(name[0]);
      const oct = Math.floor(m / 12) - 1;
      return { m, step: ssStepOf(li, oct), acc: name.slice(1) };
    }).sort((a, b) => a.step - b.step || a.m - b.m);
    const W = frame ? frame.w : EX_STAFF_W;
    const H = EX_STAFF_H;
    const top = 94;
    const room = EX_LEDGERS * 12 + 6;
    const half = W / 2;
    let body = '';
    // The notes stand where they do on the narrowest frame, plus half of any extra staff length.
    ([['bass', 16, half - 10], ['treble', half + 10, W - 16]] as const).forEach(([clef, x0, x1]) => {
      const treble = clef === 'treble';
      const ref = treble ? 30 : 18;
      const x = x0 + 146 + (x1 - x0 - 234) / 2;
      const far: { up: string[]; down: string[] } = { up: [], down: [] };
      body += `<g class="ex-stave" data-clef="${clef}"><text class="ss-syl" x="${x0 + 24}" y="${top - 24}">${host.i18n.t(treble ? 'si_treble' : 'si_bass')}</text>`;
      for (let i = 0; i < 5; i++) {
        body += `<line class="ss-line" x1="${x0}" y1="${top + i * 12}" x2="${x1}" y2="${top + i * 12}" stroke-width="1.2"/>`;
      }
      body += srClef(clef, x0 + 16, top);
      if (fifths) body += `<g class="ex-keysig">${srKeySigG(clef, fifths, x0 + 46, top).svg}</g>`;
      // Adjacent pitches use alternating head columns; accidentals have collision-free lanes.
      let prevStep = -Infinity;
      let prevLane = 0;
      const accLanes: number[] = [];
      const heads: ExploreStaffHead[] = [];
      pitches.forEach((p) => {
        const y = top + 48 + (ref - p.step) * 6;
        if (y < top - room || y > top + 48 + room) {
          far[y < top ? 'up' : 'down'].push(exploreMidiText(p.m, flat, key, spelled));
          return;
        }
        const lane = p.step - prevStep <= 1 ? 1 - prevLane : 0;
        prevStep = p.step;
        prevLane = lane;
        heads.push({ p, y, lane });
      });
      // One set of ledger lines per chord, wide enough for whichever head columns need them.
      const ledgers = new Map<number, number>();
      heads.forEach(({ y, lane }) => {
        for (let ly = top - 12; ly >= y - 1; ly -= 12) ledgers.set(ly, Math.max(ledgers.get(ly) || 0, lane));
        for (let ly = top + 60; ly <= y + 1; ly += 12) ledgers.set(ly, Math.max(ledgers.get(ly) || 0, lane));
      });
      ledgers.forEach((lane, ly) => {
        body += `<line class="ss-ledger" x1="${x - 9}" y1="${ly}" x2="${x + 9 + lane * 13}" y2="${ly}" stroke="#1a1714" stroke-width="1.2"/>`;
      });
      heads.forEach(({ p, y, lane }) => {
        let accidental = '';
        if (p.acc) {
          let a = accLanes.findIndex((last) => Math.abs(last - y) >= 24);
          if (a < 0) a = accLanes.length;
          accLanes[a] = y;
          const ax = x - 20 - a * 11;
          accidental = p.acc === '##'
            ? ssSharp(ax - 6, y) + ssSharp(ax + 1, y)
            : p.acc === 'bb'
              ? ssFlat(ax - 5, y) + ssFlat(ax + 1, y)
              : (p.acc === '#' ? ssSharp : p.acc === 'n' ? ssNatural : ssFlat)(ax, y);
        }
        body += `<g class="ss-n" data-midi="${p.m}" data-clef="${clef}"><title>${exploreMidiText(p.m, flat, key, spelled)}</title>${accidental}${ssNotehead(x + lane * 13, y, 4)}</g>`;
      });
      // Listed far notes shrink rather than spill into the other staff; 7px a character overestimates 11px text.
      ([['up', '↑', 14], ['down', '↓', H - 6]] as const).forEach(([k, arrow, y]) => {
        if (!far[k].length) return;
        const s = `${arrow} ${far[k].join(' ')}`;
        const max = x1 - x0 - 16;
        const est = s.length * 7;
        const w = Math.min(est, max);
        const cx = Math.min(Math.max(x, x0 + 8 + w / 2), x1 - 8 - w / 2);
        body += `<text class="ss-syl ex-far" x="${cx}" y="${y}"${est > max ? ` style="font-size:${(11 * max / est).toFixed(1)}px"` : ''}>${s}</text>`;
      });
      body += '</g>';
    });
    if (!pitches.length) {
      body += `<text class="ss-syl" x="${W / 2}" y="${top + 88}">${host.i18n.t('ex_staff_empty')}</text>`;
    }
    const label = host.i18n.t('ex_staff_label') + (midis.length ? ': ' + midis.map((m) => exploreMidiText(m, flat, key, spelled)).join(', ') : '');
    wrap.setAttribute('aria-label', label);
    const size = frame
      ? `width="${(W * frame.zoom).toFixed(2)}" height="${(H * frame.zoom).toFixed(2)}" style="margin:auto"`
      : `width="${W}" height="${H}" style="width:100%; height:auto; margin:auto"`;
    wrap.innerHTML = `<svg class="ss-svg" role="img" aria-label="${label}" viewBox="0 0 ${W} ${H}" ${size} xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  }

  function fillRefNames(): void {
    const rt = selectById('refType').value;
    const sel = byId('refName');
    sel.innerHTML = '';
    if (rt === 'chord') {
      CHORDS.forEach((c) => {
        const o = document.createElement('option');
        o.value = c.symbol;
        o.textContent = c.symbol + ' · ' + host.i18n.chordDisp(c);
        sel.appendChild(o);
      });
    } else {
      Object.keys(SCALES).forEach((n) => {
        const o = document.createElement('option');
        o.value = n;
        o.textContent = host.i18n.scaleDisp(n);
        sel.appendChild(o);
      });
    }
  }

  function refMidis(): number[] {
    const root = 60 + parseInt(selectById('refRoot').value, 10);
    if (selectById('refType').value === 'chord') {
      const c = CHORDS.find((x) => x.symbol === selectById('refName').value);
      if (!c) return [];
      return c.intervals.map((i) => root + i);
    }
    return SCALES[selectById('refName').value].concat([12]).map((i) => root + i);
  }

  const cofController = createCircleOfFifths({
    t: (key, ...args) => host.i18n.t(key, ...args),
    spellName: (letter, acc) => host.i18n.spell(letter, acc),
    chordDisp: host.i18n.chordDisp,
    formatChord: host.i18n.formatChord,
    exKeyCtx,
    fillRefNames,
    updateExplore,
    playChordMidis: (midis, arpeggio) => host.audio.playChordMidis(midis, arpeggio),
    playScaleNotes: (rootMidi, offsets, ascending) => host.audio.playScaleNotes(rootMidi, offsets, ascending),
    exploreSequence,
    pushExploreTimer: (timer) => { exploreTimers.push(timer); },
    view0: () => host.nav.activeView(),
    kbClear: (state) => host.dock.clear(state),
    kbState: (midi, state, anyOctave) => host.dock.mark(midi, state, anyOctave),
    fixedBottomTop: () => host.dock.fixedBottomTop(),
    lCofN: cofFifths,
  });

  // Key context values: "-1" none, "0"…"11" a major tonic, "m0"…"m11" a minor tonic (the circle's inner ring).
  function fillKeyCtx(): void {
    const sel = byId('keyCtx');
    sel.innerHTML = '<option value="-1">' + host.i18n.t('none_ctx') + '</option>';
    NOTE_SYS[host.i18n.notation()].root.forEach((n, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = host.i18n.t('key_major', n);
      sel.appendChild(o);
    });
    for (let p = 0; p < 12; p++) {
      const o = document.createElement('option');
      o.value = 'm' + p;
      o.textContent = host.i18n.t('key_minor', cofController.keyLabel(CIRCLE.indexOf((p + 3) % 12), true));
      sel.appendChild(o);
    }
  }

  function updateExplore(): void {
    if (host.nav.activeView() !== 'explore') return;
    const heldMidis = host.input.heldMidis();
    const notes = (heldMidis.length ? heldMidis : explorePreview).slice().sort((a, b) => a - b);
    const keyCtx = exKeyCtx();
    const fifths = exKeyFifths(keyCtx);
    // Without a chord to name, a key with a signature spells the notes its own way (G♭ in a flat key, F♯ in a sharp one).
    let nameLabel = '—';
    let roman = '—';
    let spell = notes.length ? (fifths ? fifths < 0 : isFlatKey(pc(notes[0]))) : false;
    let degrees: Map<number, string> | null = null;
    let chord: ReturnType<typeof theory.identifyChord> = null;
    let spelledNotes: Map<number, theory.SpelledMidi> | undefined;
    if (notes.length >= 3) {
      const id = theory.identifyChord(notes, CHORDS);
      chord = id;
      if (id) {
        const chordSp = exploreChordSpelling(notes, id, keyCtx);
        spelledNotes = chordSp.byMidi;
        spell = chordSp.rootSp.acc < 0 || (!chordSp.rootSp.acc && isFlatKey(id.rootPc));
        nameLabel = host.i18n.slashLabel(id, chordSp.rootSp, chordSp.bassSp) + (id.inversion > 0 ? ' · ' + host.i18n.invName(id.inversion) : '');
        // Minor reads in natural minor, except on the raised leading tone, whose chord is vii°, not ♯vii°.
        const minorScale = keyCtx && (id.rootPc - keyCtx.pc + 12) % 12 === 11
          ? SCALES['Harmonic minor']
          : SCALES['Aeolian (Natural minor)'];
        roman = (keyCtx ? theory.romanFor(keyCtx.pc, id, keyCtx.minor ? minorScale : undefined) : '') || '—';
        degrees = theory.chordDegreeMap(notes, id.rootPc, id.chord.pcset);
      } else {
        nameLabel = '—';
      }
    } else if (notes.length === 2) {
      nameLabel = host.i18n.intervalLabel(notes[1] - notes[0]);
    } else if (notes.length === 1) {
      if (keyCtx) {
        const sp = theory.spellMidi(notes[0], fifths, keyCtx.minor);
        nameLabel = host.i18n.spell(sp.li, sp.acc, true);
      } else {
        nameLabel = host.i18n.pcName(pc(notes[0]), spell);
      }
    }
    host.dock.setDegrees(degrees);
    byId('ro-notes').textContent = notes.length ? notes.map((m) => exploreMidiText(m, spell, keyCtx, spelledNotes)).join('  ') : '—';
    byId('ro-name').textContent = nameLabel;
    byId('ro-roman').textContent = roman;
    drawExploreStaff(notes, spell, keyCtx, spelledNotes);
    cofController.now(notes, chord);
    const exKbBtn = maybeById('ex-open-kb');
    if (exKbBtn) exKbBtn.hidden = host.dock.isShown() || host.input.isMidiLive();
  }

  // Brings one part of Explore into view. Links written for the old tabs (data-extab="circle") still land here.
  function exTab(part: string | undefined): void {
    const circle = part === 'circle';
    const el = byId(circle ? 'exp-circle' : 'exp-free');
    requestAnimationFrame(() => {
      if (host.nav.activeView() !== 'explore') return;
      el.scrollIntoView({ block: 'nearest', behavior: host.reduceMotion() ? 'auto' : 'smooth' });
      const key = circle ? el.querySelector('.cof-k.on') || el.querySelector('.cof-k') : null;
      if (key instanceof SVGElement) key.focus({ preventScroll: true });
    });
  }

  function initExploreControls(): void {
    const circle = maybeById('circle');
    if (!circle) return;
    const cof = cofController.state;
    // Redraw when the circle crosses the compact width (a window resize, the dock opening, the layout changing columns).
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => {
        if (circle.getBoundingClientRect().width > 0 && cofController.isCompact(circle) !== cofController.compact) {
          cofController.render();
          updateExplore(); // repaints where the held notes sit on the new drawing
        }
      }).observe(circle);
      const staff = maybeById('ex-staff');
      if (staff) new ResizeObserver(exStaffRefit).observe(staff);
    }
    byId('cof-mode').addEventListener('click', (e) => {
      const b = eventClosest(e, 'button');
      const v = b?.dataset.v;
      if (!b || v === cof.mode || !isCofMode(v)) return;
      cof.mode = v;
      cofController.syncRef();
      cofController.info();
      cofController.paintDock();
      cofController.play();
    });
    byId('cof-flavor').addEventListener('click', (e) => {
      const b = eventClosest(e, 'button');
      const v = b?.dataset.v;
      if (!b || v === cof.flavor || !isCofFlavor(v)) return;
      cof.flavor = v;
      cofController.syncRef();
      cofController.info();
      cofController.paintDock();
      cofController.play();
    });
    byId('cof-play').addEventListener('click', () => {
      cofController.syncRef();
      cofController.play();
    });
    byId('cof-chords').addEventListener('click', (e) => {
      const ms = eventClosest(e, '.cof-chip')?.dataset.midis;
      if (ms) cofController.chordPlay(ms.split(' ').map(Number));
    });
    maybeById('ex-open-kb')?.addEventListener('click', () => { host.dock.setOpen(true); });
    maybeById('ex-go-scale')?.addEventListener('click', () => {
      void host.nav.show('practice', {
        practiceTopic: 'scale',
        practiceMode: 'tech',
        practiceKey: String(cofController.tonicPc()),
      });
    });
    maybeById('ex-go-prog')?.addEventListener('click', () => {
      void host.nav.show('practice', {
        practiceTopic: 'prog',
        practiceKey: String(cofController.tonicPc()),
      });
    });
    maybeById('ex-go-read')?.addEventListener('click', () => {
      const rawMin = COF_MIN[cof.i];
      const keyId = cof.minor ? (rawMin === 'D#' ? 'Ebm' : rawMin + 'm') : COF_MAJ[cof.i];
      void host.nav.show('read', { readingKeyId: keyId });
    });
    byId('refType').addEventListener('change', () => {
      fillRefNames();
      const m = selectById('refType').value;
      if (isCofMode(m)) cof.mode = m;
      cofController.info();
      cofController.paintDock();
    });
    byId('refPlay').addEventListener('click', () => {
      if (selectById('refType').value === 'chord') {
        host.audio.playChordMidis(refMidis(), true);
      } else {
        host.audio.playScaleNotes(60 + parseInt(selectById('refRoot').value, 10), SCALES[selectById('refName').value], true);
      }
    });
    byId('refShow').addEventListener('click', () => {
      host.dock.clear('target');
      const ms = refMidis();
      ms.forEach((m) => host.dock.mark(m, 'target', true));
      exploreSequence([{ at: 0, notes: ms }, { at: 2600, notes: [] }]);
      exploreTimers.push(setTimeout(() => { host.dock.clear('target'); cofController.paintDock(); }, 2600));
    });
    byId('keyCtx').addEventListener('change', () => {
      cofController.syncFromKeyCtx();
      updateExplore();
    });
  }

  function mount(): void {
    if (mounted) return;
    mounted = true;
    host.i18n.fillRoots(byId('refRoot'), false);
    fillRefNames();
    fillKeyCtx();
    initExploreControls();
    cofController.render();
    host.previews.registerStopper(clearExplorePreview);
    host.previews.registerSequenceHandler(exploreSequence);
    host.input.subscribe(() => {
      if (host.nav.activeView() === 'explore') updateExplore();
    });
    host.dock.onReflow(() => {
      cofController.paintDock();
      exStaffRefit();
    });
  }

  function enter(params: Readonly<Record<string, unknown>> | undefined, signal: AbortSignal): void {
    if (signal.aborted) return;
    updateExplore();
    cofController.paintDock();
    if (typeof params?.extab === 'string' && params.extab) exTab(params.extab);
  }

  function leave(): void {
    clearExplorePreview();
  }

  function panic(): void {
    clearExplorePreview();
    if (host.nav.activeView() === 'explore') updateExplore();
  }

  function localize(): void {
    const rr = selectById('refRoot').value;
    const kc = selectById('keyCtx').value;
    const rn = selectById('refName').value;
    host.i18n.fillRoots(byId('refRoot'), false);
    fillRefNames();
    fillKeyCtx();
    selectById('refRoot').value = String(rr || 0);
    selectById('keyCtx').value = String(kc || '-1');
    if (rn) selectById('refName').value = rn;
    cofController.render();
    if (host.nav.activeView() === 'explore') updateExplore();
  }

  function registerTestSurface(registry: TestSurfaceRegistry): void {
    registry.define({
      COF_COL: { get: () => COF_COL },
      COF_FING: { get: () => COF_FING },
      COF_MAJ: { get: () => COF_MAJ },
      COF_MIN: { get: () => COF_MIN },
      COF_SCALE: { get: () => COF_SCALE },
      COF_SOL: { get: () => COF_SOL },
      EX_LEDGERS: { get: () => EX_LEDGERS },
      circleSel: { get: () => cofController.syncFromKeyCtx },
      clearExplorePreview: { get: () => clearExplorePreview },
      cof: { get: () => cofController.state },
      cofData: { get: () => cofController.data },
      cofDiagram: { get: () => cofController.diagram },
      cofInfo: { get: () => cofController.info },
      cofIsCompact: { get: () => cofController.isCompact },
      cofKeyLabel: { get: () => cofController.keyLabel },
      cofName: { get: () => cofController.name },
      cofNow: { get: () => cofController.now },
      cofPaintDock: { get: () => cofController.paintDock },
      cofParse: { get: () => cofController.parse },
      cofPick: { get: () => cofController.pick },
      cofPlay: { get: () => cofController.play },
      cofPt: { get: () => cofController.pt },
      cofRevealFingering: { get: () => cofController.revealFingering },
      cofSector: { get: () => cofController.sector },
      cofSel: { get: () => cofController.sel },
      cofSigList: { get: () => cofController.sigList },
      cofSpell: { get: () => cofController.spell },
      cofSpellDegrees: { get: () => cofController.spellDegrees },
      cofSyncRef: { get: () => cofController.syncRef },
      cofText: { get: () => cofController.text },
      cofTint: { get: () => cofController.tint },
      cofTonicPc: { get: () => cofController.tonicPc },
      drawExploreStaff: { get: () => drawExploreStaff },
      exKeyCtx: { get: () => exKeyCtx },
      exKeyFifths: { get: () => exKeyFifths },
      exTab: { get: () => exTab },
      explorePreview: { get: () => explorePreview },
      exploreSequence: { get: () => exploreSequence },
      exploreTimers: { get: () => exploreTimers },
      fillKeyCtx: { get: () => fillKeyCtx },
      fillRefNames: { get: () => fillRefNames },
      initExploreControls: { get: () => initExploreControls },
      refMidis: { get: () => refMidis },
      renderCircle: { get: () => cofController.render },
      updateExplore: { get: () => updateExplore },
    });
  }

  return {
    mount,
    enter,
    leave,
    panic,
    localize,
    registerTestSurface,
  };
}

import {
  byId as defaultById,
  maybeById as defaultMaybeById,
  queryAllHtml as defaultQueryAllHtml,
  selectById as defaultSelectById,
} from './dom.js';
import { srClef, srKeySigG } from './grand-staff.js';
import { CIRCLE } from './repertoire-data.js';
import { SCALE_FINGERINGS } from './technique.js';
import {
  anDiatonic,
  CHORD_TEMPLATES,
  keyFifths,
  pitchClass,
  romanFor,
  SCALE_DEFINITIONS,
  type ChordTemplate,
  type identifyChord,
} from './theory.js';

export const COF_FING = SCALE_FINGERINGS;
export const COF_MAJ = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'] as const;
export const COF_MIN = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'Bb', 'F', 'C', 'G', 'D'] as const;
export const COF_COL = ['#e8c160', '#ecae4c', '#e79443', '#df7a3b', '#d2623a', '#bd4834', null, '#355895', '#3b6fa2', '#3f86a6', '#4b9ea6', '#62b3a6'] as const;
export const COF_SCALE = { natural: 'Aeolian (Natural minor)', harmonic: 'Harmonic minor', melodic: 'Melodic minor' } as const;
export const COF_SOL = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' } as const;

const COF_CENTER = 350;
const COF_COMPACT_W = 460;
const COF_R_MIN0 = 90;
const COF_R_MIN1 = 158;
const COF_R_CNT1 = 182;
const COF_R_MAJ1 = 256;
const COF_R_STAFF = 429;
const COF_STAFF_WIDTH = 126;
const COF_STAFF_ACCIDENTAL_SCALE = 1.4;
const EX_ONE_COLUMN = '(max-width:899px)';

export type CofMode = 'scale' | 'chord';
export type CofFlavor = keyof typeof COF_SCALE;

export interface CofSelection {
  i: number;
  minor: boolean;
  mode: CofMode;
  flavor: CofFlavor;
  picked: boolean;
}

export interface CofSignature {
  n: number;
  sharp?: boolean;
  list: string;
}

export interface CofChord {
  roman: string;
  name: string;
  label: string;
  midis: number[];
}

export interface CofScaleOrChordData {
  midis: number[];
  names: string[];
  rh: number[];
  lh: number[];
}

export interface CircleOfFifthsHost {
  t(key: string, ...args: (string | number)[]): string;
  spellName(letter: number, acc: number): string;
  chordDisp(chord: ChordTemplate | string | undefined): string;
  formatChord?(root: string, symbol: string): string;
  exKeyCtx(): { pc: number; minor: boolean } | null;
  fillRefNames(): void;
  updateExplore(): void;
  playChordMidis(midis: number[], arpeggio: boolean): void;
  playScaleNotes(rootMidi: number, offsets: readonly number[], ascending: boolean): void;
  exploreSequence(events: { at: number; notes: number[] }[]): void;
  pushExploreTimer(timer: ReturnType<typeof setTimeout>): void;
  view0(): string;
  kbClear(kind: 'target'): void;
  kbState(midi: number, state: 'target', pressed: boolean): void;
  fixedBottomTop(): number;
  lCofN?(i: number, enh?: boolean): number;
  byId?: (id: string) => HTMLElement;
  maybeById?: (id: string) => HTMLElement | null;
  selectById?: (id: string) => HTMLSelectElement;
  queryAllHtml?: (root: Document | DocumentFragment | Element, selector: string) => HTMLElement[];
}

export interface CircleOfFifthsController {
  readonly state: CofSelection;
  readonly compact: boolean | null;
  spell(letter: string, acc: number): string;
  parse(s: string): { L: string; acc: number };
  name(s: string): string;
  spellDegrees(tonic: string, offs: readonly number[], degs: readonly number[]): string[];
  tonicPc(): number;
  keyLabel(i: number, minor: boolean): string;
  sigList(i: number): CofSignature;
  data(): CofScaleOrChordData;
  pt(r: number, deg: number): [string, string];
  sector(r0: number, r1: number, d0: number, d1: number): string;
  tint(i: number, pct: string | number): string;
  text(x: string, y: string, cls: string, lines: string[], lh: number): string;
  isCompact(box: HTMLElement): boolean;
  wheel(layout: 'compact' | 'wide' | 'staff'): string;
  bindKeys(box: Element, onPick: (i: number, minor: boolean) => void): void;
  wheelSelect(box: Element, index: number, minor: boolean, picked: boolean): void;
  render(): void;
  sel(): void;
  syncFromKeyCtx(): void;
  pick(i: number, minor: boolean): void;
  revealFingering(): void;
  syncRef(): void;
  play(): void;
  info(): void;
  chordList(): CofChord[];
  chords(): void;
  chordPlay(midis: number[]): void;
  diagram(): void;
  now(notes: readonly number[], chord?: ReturnType<typeof identifyChord>): void;
  paintDock(): void;
}

export function isCofMode(v: string | undefined): v is CofMode {
  return v === 'scale' || v === 'chord';
}

export function isCofFlavor(v: string | undefined): v is CofFlavor {
  return v === 'natural' || v === 'harmonic' || v === 'melodic';
}

export function cofParse(s: string): { L: string; acc: number } {
  return { L: s[0], acc: s[1] === '#' ? 1 : s[1] === 'b' ? -1 : 0 };
}

export function cofPt(r: number, deg: number): [string, string] {
  const a = (deg - 90) * Math.PI / 180;
  return [(COF_CENTER + r * Math.cos(a)).toFixed(2), (COF_CENTER + r * Math.sin(a)).toFixed(2)];
}

export function cofSector(r0: number, r1: number, d0: number, d1: number): string {
  const a = cofPt(r1, d0);
  const b = cofPt(r1, d1);
  const c = cofPt(r0, d1);
  const d = cofPt(r0, d0);
  return 'M' + a + 'A' + r1 + ' ' + r1 + ' 0 0 1 ' + b + 'L' + c + 'A' + r0 + ' ' + r0 + ' 0 0 0 ' + d + 'Z';
}

export function cofTint(i: number, pct: string | number): string {
  return 'fill:color-mix(in srgb, ' + (COF_COL[i] || '#6d4f7a') + ' ' + pct + '%, var(--card))';
}

export function cofText(x: string, y: string, cls: string, lines: string[], lh: number): string {
  return '<text class="' + cls + '" x="' + x + '" y="' + y + '">' + lines.map((s, k) =>
    '<tspan x="' + x + '" dy="' + (k ? lh : -(lines.length - 1) * lh / 2) + '">' +
    s.replace(/([♯♭𝄪𝄫])/gu, '<tspan class="cof-g">$1</tspan>') + '</tspan>').join('') + '</text>';
}

export function cofFifths(i: number, enh?: boolean): number {
  return enh && i === 5 ? -7 : enh && i === 6 ? -6 : enh && i === 7 ? 7 : i <= 6 ? i : i - 12;
}

/** Spells each scale degree with consecutive letter names so keys read correctly (e.g. G harmonic minor -> F♯, D♯ minor -> C𝄪). */
export function cofSpellDegreesWith(
  tonic: string,
  offs: readonly number[],
  degs: readonly number[],
  spell: (letter: string, acc: number) => string,
): string[] {
  const LET = 'CDEFGAB';
  const NAT = [0, 2, 4, 5, 7, 9, 11];
  const p = cofParse(tonic);
  const li = LET.indexOf(p.L);
  const tp = NAT[li] + p.acc;
  return offs.map((o, k) => {
    const L = (li + degs[k]) % 7;
    const d = ((tp + o - NAT[L]) % 12 + 12) % 12;
    return spell(LET[L], d > 6 ? d - 12 : d);
  });
}

export function cofKeyLabelWith(i: number, minor: boolean, formatName: (s: string) => string): string {
  if (i === 6) {
    return minor ? formatName('D#') + ' / ' + formatName('Eb') : formatName('F#') + ' / ' + formatName('Gb');
  }
  return formatName(minor ? COF_MIN[i] : COF_MAJ[i]);
}

export function cofSigListWith(i: number, spell: (letter: string, acc: number) => string): CofSignature {
  const sh = 'FCGDAEB';
  const fl = 'BEADGCF';
  if (i === 0) return { n: 0, list: '' };
  if (i <= 6) return { n: i, sharp: true, list: [...sh.slice(0, i)].map((L) => spell(L, 1)).join(', ') };
  const n = 12 - i;
  return { n, sharp: false, list: [...fl.slice(0, n)].map((L) => spell(L, -1)).join(', ') };
}

/** Creates the Circle of Fifths UI, SVG wheel, fingering diagram, diatonic triad strip, and key picker controller. */
export function createCircleOfFifths(host: CircleOfFifthsHost): CircleOfFifthsController {
  const byId = host.byId ?? defaultById;
  const maybeById = host.maybeById ?? defaultMaybeById;
  const selectById = host.selectById ?? defaultSelectById;
  const queryAllHtml = host.queryAllHtml ?? defaultQueryAllHtml;
  const lCofN = host.lCofN ?? cofFifths;

  const state: CofSelection = { i: 0, minor: false, mode: 'scale', flavor: 'natural', picked: false };
  let cofCompact: boolean | null = null;

  function spell(letter: string, acc: number): string {
    return host.spellName('CDEFGAB'.indexOf(letter), acc);
  }

  function name(s: string): string {
    const p = cofParse(s);
    return spell(p.L, p.acc);
  }

  function spellDegrees(tonic: string, offs: readonly number[], degs: readonly number[]): string[] {
    return cofSpellDegreesWith(tonic, offs, degs, spell);
  }

  function tonicPc(): number {
    return state.minor ? (CIRCLE[state.i] + 9) % 12 : CIRCLE[state.i];
  }

  function keyLabel(i: number, minor: boolean): string {
    return cofKeyLabelWith(i, minor, name);
  }

  function sigList(i: number): CofSignature {
    return cofSigListWith(i, spell);
  }

  function data(): CofScaleOrChordData {
    const tp = tonicPc();
    const tonic = (state.minor ? COF_MIN : COF_MAJ)[state.i];
    const root = 60 + tp;
    if (state.mode === 'chord') {
      const offs = [0, state.minor ? 3 : 4, 7];
      return { midis: offs.map((o) => root + o), names: spellDegrees(tonic, offs, [0, 2, 4]), rh: [1, 3, 5], lh: [5, 3, 1] };
    }
    const tbl = state.minor ? COF_FING[state.flavor] : COF_FING.maj;
    const offs = (state.minor ? SCALE_DEFINITIONS[COF_SCALE[state.flavor]] : SCALE_DEFINITIONS['Major (Ionian)']).concat([12]);
    return { midis: offs.map((o) => root + o), names: spellDegrees(tonic, offs, [0, 1, 2, 3, 4, 5, 6, 7]), rh: [...tbl.rh[tp]].map(Number), lh: [...tbl.lh[tp]].map(Number) };
  }

  function isCompact(box: HTMLElement): boolean {
    const w = box.getBoundingClientRect().width;
    return w > 0 ? w < COF_COMPACT_W : matchMedia('(max-width:560px)').matches;
  }

  function staffSector(i: number, d0: number, d1: number, id: string): string {
    const primary = lCofN(i);
    const enharmonic = lCofN(i, true);
    const paired = primary !== enharmonic;
    const fifths = paired ? [Math.max(primary, enharmonic), Math.min(primary, enharmonic)] : [primary];
    const [x, y] = cofPt((COF_R_MAJ1 + COF_R_STAFF) / 2, i * 30);
    const scale = paired ? (i === 6 ? 0.88 : 0.80) : 0.96;
    const staves = fifths.map((n, j) => {
      // The lower staves sit closer to the vertical axis to fit the diagonal sectors.
      const staffX = paired ? COF_CENTER + (6 - i) * (j === 0 ? 180 : 152) : x;
      const staffY = paired ? COF_CENTER + (i === 6 ? [309, 384] : [273, 340])[j] : y;
      const signature = srKeySigG('treble', n, 35, 0, COF_STAFF_ACCIDENTAL_SCALE).svg;
      return `<g class="lw-cof-staff" data-fifths="${n}" transform="translate(${staffX} ${staffY}) scale(${scale}) translate(${-COF_STAFF_WIDTH / 2} -26)"><use href="#${id}Staff"/>${signature}</g>`;
    }).join('');
    return `<g aria-hidden="true"><path class="lw-cof-staff-sector" d="${cofSector(COF_R_MAJ1, COF_R_STAFF, d0, d1)}"/>${staves}</g>`;
  }

  function wheel(layout: 'compact' | 'wide' | 'staff'): string {
    const compact = layout !== 'wide';
    const withStaff = layout === 'staff';
    const id = withStaff ? 'lw-cof' : 'cof';
    const staffFrame = COF_R_STAFF + 6;
    const viewBox = withStaff
      ? `${COF_CENTER - staffFrame} ${COF_CENTER - staffFrame} ${2 * staffFrame} ${2 * staffFrame}`
      : compact ? '92 92 516 516' : '-12 20 724 650';
    const staff = withStaff
      ? `<g id="${id}Staff">${Array.from({ length: 5 }, (_, i) =>
        `<path class="ss-line" stroke-width="1.8" d="M0 ${i * 12}h${COF_STAFF_WIDTH}"/>`).join('')}${srClef('treble', 5, 0)}</g>`
      : '';
    let s = '<svg class="cof-svg' + (compact ? ' compact' : '') + '" viewBox="' + viewBox + '" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="' + host.t('aria_circle') + '"><defs>' +
      '<linearGradient id="' + id + 'Split" gradientUnits="userSpaceOnUse" x1="300" y1="0" x2="400" y2="0"><stop offset="0" stop-color="#314e8c"/><stop offset=".5" stop-color="#314e8c"/><stop offset=".5" stop-color="#a8392f"/><stop offset="1" stop-color="#a8392f"/></linearGradient>' +
      '<marker id="' + id + 'AhUp" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1L9 5L1 9z" fill="#c96b3f"/></marker>' +
      '<marker id="' + id + 'AhDn" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M1 1L9 5L1 9z" fill="#4a7fb0"/></marker>' +
      (withStaff ? staff : '<path id="cofArcS" d="M' + cofPt(334, 18) + 'A334 334 0 0 1 ' + cofPt(334, 72) + '"/><path id="cofArcF" d="M' + cofPt(334, 288) + 'A334 334 0 0 1 ' + cofPt(334, 342) + '"/>') + '</defs>';
    if (!compact) {
      s += '<text class="cof-arc sharp"><textPath href="#cofArcS" startOffset="50%" text-anchor="middle">' + host.t('cof_sharps') + ' ♯</textPath></text>';
      s += '<text class="cof-arc flat"><textPath href="#cofArcF" startOffset="50%" text-anchor="middle">♭ ' + host.t('cof_flats') + '</textPath></text>';
    }
    let maj = '';
    let min = '';
    let acc = '';
    const rMajMid = (COF_R_CNT1 + COF_R_MAJ1) / 2;
    const rCntMid = (COF_R_MIN1 + COF_R_CNT1) / 2;
    const rMinMid = (COF_R_MIN0 + COF_R_MIN1) / 2;
    CIRCLE.forEach((_p, i) => {
      const d0 = i * 30 - 15;
      const d1 = i * 30 + 15;
      const sig = sigList(i);
      const light = i <= 4 || i >= 10;
      const fill = i === 6 ? 'fill:url(#' + id + 'Split)' : 'fill:' + COF_COL[i];
      const txt = light ? '#1a1714' : '#fffaf2';
      const [mx, my] = cofPt(rMajMid, i * 30);
      const [cx, cy] = cofPt(rCntMid, i * 30);
      const [nx, ny] = cofPt(rMinMid, i * 30);
      const majL = i === 6 ? [name('F#'), name('Gb')] : [name(COF_MAJ[i])];
      const minL = i === 6 ? [name('D#') + 'm', name('Eb') + 'm'] : [name(COF_MIN[i]) + 'm'];
      const cnt = i === 0 ? '0' : i < 6 ? i + '♯' : i === 6 ? '6♯ 6♭' : (12 - i) + '♭';
      maj += '<g class="cof-k" data-i="' + i + '" data-ring="maj" tabindex="0" role="button" aria-pressed="false" aria-label="' + host.t('cof_aria_maj', keyLabel(i, false)) + (sig.n ? ', ' + sig.n + (sig.sharp ? '♯' : '♭') : '') + '">' +
        '<path class="cof-w" d="' + cofSector(COF_R_CNT1, COF_R_MAJ1, d0, d1) + '" style="' + fill + '"/><path class="cof-w" d="' + cofSector(COF_R_MIN1, COF_R_CNT1, d0, d1) + '" style="' + cofTint(i, 44) + '"/>' +
        cofText(mx, my, 'cof-maj' + (i === 6 ? ' sm' : ''), majL, 28).replace('<text ', '<text style="fill:' + txt + '" ') +
        '<text class="cof-cnt" x="' + cx + '" y="' + cy + '">' + cnt + '</text></g>';
      min += '<g class="cof-k" data-i="' + i + '" data-ring="min" tabindex="0" role="button" aria-pressed="false" aria-label="' + host.t('cof_aria_min', keyLabel(i, true)) + '">' +
        '<path class="cof-w" d="' + cofSector(COF_R_MIN0, COF_R_MIN1, d0, d1) + '" style="' + cofTint(i, 24) + '"/>' + cofText(nx, ny, 'cof-min' + (i === 6 ? ' sm' : ''), minL, 17) + '</g>';
      if (withStaff) acc += staffSector(i, d0, d1, id);
      else if (sig.n && !compact) {
        const items = sig.list.split(', ');
        const lines: string[] = [];
        for (let k = 0; k < items.length; k += 3) lines.push(items.slice(k, k + 3).join(' '));
        const a = i * 30;
        const sx = Math.sin(a * Math.PI / 180);
        const side = Math.abs(sx) > 0.35;
        const [ax, ay] = cofPt(side ? 268 : 280, a);
        acc += cofText(ax, (+ay + 6).toFixed(2), 'cof-acc', lines, 19).replace('<text ', '<text style="text-anchor:' + (side ? (sx > 0 ? 'start' : 'end') : 'middle') + '" ');
      }
    });
    s += (withStaff ? acc + maj + min : maj + min + acc) +
      `<path class="cof-ring-rel" id="${id}-rel" d=""/><path class="cof-ring-sel" id="${id}-sel" d=""/>`;
    if (!withStaff) s += '<g class="cof-now" id="cof-now"></g>';
    s += '<circle class="cof-hub" cx="350" cy="350" r="89"/>' +
      '<path class="cof-arrow up" marker-end="url(#' + id + 'AhUp)" d="M' + cofPt(78, -34) + 'A78 78 0 0 1 ' + cofPt(78, 34) + '"/>' +
      '<path class="cof-arrow dn" marker-end="url(#' + id + 'AhDn)" d="M' + cofPt(78, 214) + 'A78 78 0 0 0 ' + cofPt(78, 146) + '"/>' +
      '<text class="cof-iv up" x="350" y="311">' + host.t('cof_5th') + '</text><text class="cof-st" x="350" y="327">' + host.t('cof_7st') + '</text>' +
      '<text class="cof-title" x="350" y="355">' + host.t('ex_tab_circle') + '</text>' +
      '<text class="cof-iv dn" x="350" y="381">' + host.t('cof_4th') + '</text><text class="cof-st" x="350" y="397">' + host.t('cof_5st') + '</text></svg>';
    return s;
  }

  function bindKeys(box: Element, onPick: (i: number, minor: boolean) => void): void {
    box.querySelectorAll<SVGElement>('.cof-k').forEach((g) => {
      const doPick = () => onPick(Number(g.dataset.i), g.dataset.ring === 'min');
      g.addEventListener('click', doPick);
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          doPick();
        }
      });
    });
  }

  function wheelSelect(box: Element, index: number, minor: boolean, picked: boolean): void {
    const svg = box.querySelector('.cof-svg');
    if (!svg) return;
    svg.classList.toggle('has-sel', picked);
    svg.querySelectorAll<SVGElement>('.cof-k').forEach((g) => {
      const relativePair = picked && Number(g.dataset.i) === index;
      const on = relativePair && (g.dataset.ring === 'min') === minor;
      g.classList.toggle('on', on);
      g.classList.toggle('rel', relativePair && !on);
      g.setAttribute('aria-pressed', String(on));
    });
    const d0 = index * 30 - 15;
    const d1 = index * 30 + 15;
    const majD = picked ? cofSector(COF_R_MIN1, COF_R_MAJ1, d0, d1) : '';
    const minD = picked ? cofSector(COF_R_MIN0, COF_R_MIN1, d0, d1) : '';
    svg.querySelector('.cof-ring-sel')?.setAttribute('d', minor ? minD : majD);
    svg.querySelector('.cof-ring-rel')?.setAttribute('d', minor ? majD : minD);
  }

  function sel(): void {
    wheelSelect(byId('circle'), state.i, state.minor, state.picked);
  }

const COF_ROMAN_UP = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;
const COF_ROMAN_LO = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'] as const;

  function chordList(): CofChord[] {
    const tp = tonicPc();
    const minor = state.minor;
    const scale = SCALE_DEFINITIONS[minor ? COF_SCALE[state.flavor] : 'Major (Ionian)'];
    const names = spellDegrees((minor ? COF_MIN : COF_MAJ)[state.i], scale, [0, 1, 2, 3, 4, 5, 6]);
    const base = 60 + tp - (tp > 6 ? 12 : 0);
    if (minor && state.flavor !== 'natural') {
      return names.flatMap((degName, k) => {
        const i3 = (scale[(k + 2) % 7] - scale[k] + 12) % 12;
        const i5 = (scale[(k + 4) % 7] - scale[k] + 12) % 12;
        let sym = 'm', suffix = 'm', roman: string = COF_ROMAN_LO[k];
        if (i3 === 4 && i5 === 7) { sym = 'maj'; suffix = ''; roman = COF_ROMAN_UP[k]; }
        else if (i3 === 3 && i5 === 6) { sym = 'dim'; suffix = '°'; roman = COF_ROMAN_LO[k] + '°'; }
        else if (i3 === 4 && i5 === 8) { sym = 'aug'; suffix = '+'; roman = COF_ROMAN_UP[k] + '+'; }
        const tpl = CHORD_TEMPLATES.find((c) => c.symbol === sym);
        if (!tpl) return [];
        const root = base + scale[k];
        return [{
          roman,
          name: host.formatChord ? host.formatChord(degName, suffix) : degName + suffix,
          label: degName + ' ' + host.chordDisp(tpl),
          midis: tpl.intervals.map((iv) => root + iv),
        }];
      });
    }
    return anDiatonic({ root: tp, minor, fifths: keyFifths(tp, minor) }).slice(0, 7).flatMap((d, k) => {
      const sym = d.p[1] === 4 ? 'maj' : d.p[2] === 6 ? 'dim' : 'm';
      const tpl = CHORD_TEMPLATES.find((c) => c.symbol === sym);
      if (!tpl) return [];
      const root = base + scale[k];
      const suffix = sym === 'maj' ? '' : sym === 'm' ? 'm' : '°';
      return [{
        roman: romanFor(tp, { rootPc: d.root, chord: tpl }, scale),
        name: host.formatChord ? host.formatChord(names[k], suffix) : names[k] + suffix,
        label: names[k] + ' ' + host.chordDisp(tpl),
        midis: tpl.intervals.map((iv) => root + iv),
      }];
    });
  }

  function diagram(): void {
    const box = byId('cof-kb');
    if (!box) return;
    const d = data();
    const WHITE = [0, 2, 4, 5, 7, 9, 11];
    const isW = (m: number) => WHITE.includes(pitchClass(m));
    let lo = d.midis[0];
    let hi = d.midis[d.midis.length - 1];
    if (!isW(lo)) lo--;
    if (!isW(hi)) hi++;
    const WW = 44;
    const WH = 124;
    const BW = 26;
    const BH = 78;
    const X0 = 34;
    const TOP = 58;
    const whites: number[] = [];
    for (let m = lo; m <= hi; m++) if (isW(m)) whites.push(m);
    const W = X0 + whites.length * WW + 4;
    const H = TOP + WH + 60;
    const xOf = (m: number) => isW(m) ? X0 + whites.indexOf(m) * WW + WW / 2 : X0 + whites.indexOf(m + 1) * WW;
    const idx = new Map(d.midis.map((m, k) => [m, k] as const));
    let s = '<svg class="cof-kb" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + host.t('cof_kb_aria', host.t('cof_rh_s') + ': ' + d.names.map((n, k) => n + ' ' + d.rh[k]).join(', ') + ' · ' + host.t('cof_lh_s') + ': ' + d.names.map((n, k) => n + ' ' + d.lh[k]).join(', ')) + '">';
    s += '<text class="ck-hand" x="2" y="32">' + host.t('cof_rh_s') + '</text><text class="ck-hand" x="2" y="' + (TOP + WH + 36) + '">' + host.t('cof_lh_s') + '</text>';
    whites.forEach((m, k) => {
      const ni = idx.get(m);
      const on = ni !== undefined;
      s += '<rect class="ck-w' + (on ? ' on' : '') + '" data-m="' + m + '" x="' + (X0 + k * WW) + '" y="' + TOP + '" width="' + WW + '" height="' + WH + '" rx="5"/>';
      if (on) s += '<text class="ck-n" x="' + (X0 + k * WW + WW / 2) + '" y="' + (TOP + WH - 12) + '">' + d.names[ni] + '</text>';
    });
    for (let m = lo; m <= hi; m++) {
      if (isW(m)) continue;
      const ni = idx.get(m);
      const on = ni !== undefined;
      const x = xOf(m);
      s += '<rect class="ck-b' + (on ? ' on' : '') + '" data-m="' + m + '" x="' + (x - BW / 2) + '" y="' + TOP + '" width="' + BW + '" height="' + BH + '" rx="3"/>';
      if (on) s += '<text class="ck-n b" x="' + x + '" y="' + (TOP + BH - 11) + '" style="font-size:9.5px">' + d.names[ni] + '</text>';
    }
    const badge = (cls: string, x: string | number, y: string | number, n: string | number) => '<g class="ck-f ' + cls + '"><circle cx="' + x + '" cy="' + y + '" r="11"/><text x="' + x + '" y="' + y + '">' + n + '</text></g>';
    d.midis.forEach((m, k) => {
      const x = xOf(m);
      const w = isW(m);
      s += badge('rh', x, w ? 40 : 14, d.rh[k]) + badge('lh', x, w ? TOP + WH + 18 : TOP + WH + 44, d.lh[k]);
    });
    box.innerHTML = s + '</svg>';
  }

  function chords(): void {
    const box = maybeById('cof-chords');
    if (!box) return;
    box.innerHTML = '';
    chordList().forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cof-chip';
      b.dataset.midis = c.midis.join(' ');
      b.setAttribute('aria-label', c.roman + ' · ' + c.label);
      b.innerHTML = '<span class="cof-chip-rn" aria-hidden="true">' + c.roman + '</span><b aria-hidden="true">' + c.name + '</b>';
      box.appendChild(b);
    });
  }

  function info(): void {
    if (!byId('cof-key')) return;
    const i = state.i;
    const sig = sigList(i);
    const rel = keyLabel(i, !state.minor);
    byId('cof-key').textContent = host.t(state.minor ? 'key_minor' : 'key_major', keyLabel(i, state.minor));
    const sigTxt = (g: CofSignature) => g.n ? host.t(g.sharp ? 'cof_sig_s' : 'cof_sig_f', String(g.n), '<b>' + g.list + '</b>') : host.t('cof_sig0');
    const enhSigOf = (letters: string, sharp: boolean): CofSignature => ({ n: letters.length, sharp, list: [...letters].map((L) => spell(L, sharp ? 1 : -1)).join(', ') });
    const enhSig = i === 6 ? enhSigOf('BEADGC', false) : i === 5 ? enhSigOf('BEADGCF', false) : i === 7 ? enhSigOf('FCGDAEB', true) : null;
    const enhKey = i === 5 ? name(state.minor ? 'Ab' : 'Cb') : i === 7 ? name(state.minor ? 'A#' : 'C#') : '';
    const enhTxt = enhSig ? ' / ' + (enhKey ? host.t(state.minor ? 'key_minor' : 'key_major', enhKey) + ' (' + sigTxt(enhSig) + ')' : sigTxt(enhSig)) : '';
    byId('cof-sig').innerHTML = sigTxt(sig) + enhTxt + ' · ' + host.t(state.minor ? 'cof_rel_maj' : 'cof_rel_min', host.t(state.minor ? 'key_major' : 'key_minor', rel));
    queryAllHtml(document, '#cof-mode button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === state.mode ? 'true' : 'false'));
    queryAllHtml(document, '#cof-flavor button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === state.flavor ? 'true' : 'false'));
    byId('cof-flavor').hidden = !state.minor;
    const ch = state.mode === 'chord';
    byId('cof-fing-t').textContent = host.t(ch ? 'cof_fing_chord' : 'cof_fing_scale');
    byId('cof-fing-s').textContent = '· ' + host.t(ch ? 'cof_fing_chord_s' : 'cof_fing_scale_s');
    byId('cof-note').textContent = host.t(ch ? 'cof_note_chord' : 'cof_note_scale') + (!ch && state.minor && state.flavor === 'melodic' ? ' ' + host.t('cof_note_mel') : '');
    diagram();
    chords();
  }

  function paintDock(): void {
    if (host.view0() !== 'explore') return;
    host.kbClear('target');
    if (!state.picked) return;
    data().midis.forEach((m) => host.kbState(m, 'target', true));
  }

  function chordPlay(midis: number[]): void {
    host.kbClear('target');
    midis.forEach((m) => host.kbState(m, 'target', true));
    host.playChordMidis(midis, false);
    // The readout and the staff show the chord as long as the keys do; this also clears an earlier pick's timers.
    host.exploreSequence([{ at: 0, notes: midis }, { at: 2600, notes: [] }]);
    host.pushExploreTimer(setTimeout(() => {
      host.kbClear('target');
      paintDock();
    }, 2600));
  }

  function render(): void {
    const box = byId('circle');
    if (!box) return;
    cofCompact = isCompact(box);
    box.innerHTML = wheel(cofCompact ? 'compact' : 'wide');
    bindKeys(box, pick);
    sel();
    info();
  }

  // Keeps the circle in step with the "Key context" select; "none" clears the circle's pick.
  function syncFromKeyCtx(): void {
    const k = host.exKeyCtx();
    if (k) {
      state.i = CIRCLE.indexOf(k.minor ? (k.pc + 3) % 12 : k.pc);
      state.minor = k.minor;
      state.picked = true;
    } else {
      state.picked = false;
    }
    sel();
    info();
    paintDock();
  }

  function revealFingering(): void {
    requestAnimationFrame(() => {
      const fing = document.querySelector('#cof-info .cof-fing');
      if (!fing || !matchMedia(EX_ONE_COLUMN).matches) return;
      const header = document.querySelector('header');
      const top = (header ? header.getBoundingClientRect().bottom : 0) + 16;
      const bottom = host.fixedBottomTop() - 24;
      const rect = fing.getBoundingClientRect();
      const available = Math.max(0, bottom - top);
      const delta = rect.height > available || rect.top < top ? rect.top - top : rect.bottom > bottom ? rect.bottom - bottom : 0;
      if (Math.abs(delta) > 1) {
        window.scrollBy({ top: delta, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
    });
  }

  function syncRef(): void {
    selectById('refType').value = state.mode;
    host.fillRefNames();
    selectById('refRoot').value = String(tonicPc());
    selectById('refName').value = state.mode === 'chord' ? (state.minor ? 'm' : 'maj') : (state.minor ? COF_SCALE[state.flavor] : 'Major (Ionian)');
  }

  function play(): void {
    const tp = tonicPc();
    const d = data();
    if (state.mode === 'chord') host.playChordMidis(d.midis, true);
    else host.playScaleNotes(60 + tp, state.minor ? SCALE_DEFINITIONS[COF_SCALE[state.flavor]] : SCALE_DEFINITIONS['Major (Ionian)'], true);
  }

  function pick(i: number, minor: boolean): void {
    state.i = i;
    state.minor = minor;
    state.picked = true;
    selectById('keyCtx').value = (minor ? 'm' : '') + tonicPc();
    syncRef();
    sel();
    info();
    paintDock();
    host.updateExplore(); // the Roman numerals and the staff's signature follow the new key
    revealFingering();
    play();
  }

  function now(notes: readonly number[], chord: ReturnType<typeof identifyChord> = null): void {
    const box = byId('cof-kb');
    if (box) {
      const set = new Set(notes);
      box.querySelectorAll('[data-m]').forEach((r) => r.classList.toggle('now', set.has(Number(r.getAttribute('data-m')))));
    }
    const g = maybeById('cof-now');
    if (!g) return;
    const at: string[] = [];
    let s = '';
    const wedge = (i: number, minor: boolean) => {
      const d0 = i * 30 - 15;
      const d1 = i * 30 + 15;
      at.push((minor ? 'min' : 'maj') + i);
      s += '<path class="cof-ring-now" d="' + (minor ? cofSector(COF_R_MIN0, COF_R_MIN1, d0, d1) : cofSector(COF_R_MIN1, COF_R_MAJ1, d0, d1)) + '"/>';
    };
    if (chord) {
      const minor = /^m(?!aj)/.test(chord.chord.symbol) || chord.chord.symbol.startsWith('dim');
      wedge(CIRCLE.indexOf(minor ? (chord.rootPc + 3) % 12 : chord.rootPc), minor);
    } else if (notes.length && notes.length < 3) {
      [...new Set(notes.map(pitchClass))].forEach((p) => wedge(CIRCLE.indexOf(p), false));
    }
    g.innerHTML = s;
    g.setAttribute('data-at', at.join(' '));
  }

  return {
    state,
    get compact() { return cofCompact; },
    spell,
    parse: cofParse,
    name,
    spellDegrees,
    tonicPc,
    keyLabel,
    sigList,
    data,
    pt: cofPt,
    sector: cofSector,
    tint: cofTint,
    text: cofText,
    isCompact,
    wheel,
    bindKeys,
    wheelSelect,
    render,
    sel,
    syncFromKeyCtx,
    pick,
    revealFingering,
    syncRef,
    play,
    info,
    chordList,
    chords,
    chordPlay,
    diagram,
    now,
    paintDock,
  };
}

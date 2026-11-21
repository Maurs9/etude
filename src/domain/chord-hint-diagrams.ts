import { packChordColumn, srClef, srLedger2 } from './grand-staff.js';
import type { ChordHintTone, PracticeHintNote } from './practice-hints.js';
import { ssAccGlyph, ssFlat, ssNotehead, ssStepOf } from './score-types.js';
import { pitchClass } from './theory.js';

interface DiagramChord {
  readonly symbol: string;
  readonly title: string;
  readonly tones: readonly ChordHintTone[];
  readonly changed: ReadonlySet<number>;
}

const whitePitch = new Set([0, 2, 4, 5, 7, 9, 11]);
const svgNamespace = 'http://www.w3.org/2000/svg';
const staffLayouts = [
  { clef: 'treble', bottomStep: ssStepOf(2, 4), octaveOffset: 0, label: 'pr_hints_chord_staff' },
  { clef: 'bass', bottomStep: ssStepOf(4, 2), octaveOffset: -1, label: 'pr_hints_chord_bass_staff' },
] as const;
type StaffLayout = (typeof staffLayouts)[number];

function image(className: string, viewBox: string): SVGSVGElement {
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('role', 'img');
  return svg;
}

function toneClasses(tone: ChordHintTone | undefined, changed: boolean): string {
  return (tone?.degree === 1 ? ' pr-chord-root' : '') + (changed ? ' pr-chord-changed' : '');
}

function keyboardKeys(chord: DiagramChord, low: number, high: number, compare: boolean): string {
  const whiteWidth = 20, blackWidth = 12;
  const white: string[] = [], black: string[] = [];
  for (let midi = low; midi <= high; midi++) {
    const isWhite = whitePitch.has(pitchClass(midi));
    const width = isWhite ? whiteWidth : blackWidth, height = isWhite ? 64 : 39;
    const x = 2 + white.length * whiteWidth - (isWhite ? 0 : blackWidth / 2);
    const tone = chord.tones.find(note => note.midi === midi);
    const group = `<g class="pr-chord-key ${isWhite ? 'pr-chord-white' : 'pr-chord-black'}${toneClasses(tone, compare && chord.changed.has(midi))}"${tone ? ` data-chord-midi="${midi}"` : ''}>` +
      `<rect class="pr-chord-key-shape" x="${x}" y="2" width="${width}" height="${height}" rx="1.5"/>` +
      (tone ? `<circle class="pr-chord-key-dot" cx="${x + width / 2}" cy="${height - 6}" r="${tone.degree === 1 ? 3.5 : 2.7}"/>` : '') + '</g>';
    (isWhite ? white : black).push(group);
  }
  return white.join('') + black.join('');
}

function staffY(tone: ChordHintTone, layout: StaffLayout) {
  return 48 + (layout.bottomStep - ssStepOf(tone.li, tone.oct + layout.octaveOffset)) * 6;
}

function accidental(acc: number, x: number, y: number): string {
  if (acc === -2) return ssFlat(x - 5, y) + ssFlat(x, y);
  if (acc === 2) {
    return `<path class="pr-chord-double-sharp" d="M${x - 3},${y - 4}l7,8m0,-8l-7,8" fill="none" stroke-width="2.8"/>`;
  }
  return ssAccGlyph(acc, 0, x, y);
}

function staffChord(chord: DiagramChord, layout: StaffLayout, center: number, width: number, compare: boolean): string {
  const lines = Array.from({ length: 5 }, (_, i) =>
    `<line class="pr-chord-staff-line" x1="5" x2="${width - 5}" y1="${12 * i}" y2="${12 * i}"/>`).join('');
  const notes = chord.tones.map(tone => ({ tone, step: ssStepOf(tone.li, tone.oct), y: staffY(tone, layout), dx: 0, ax: undefined as number | undefined }));
  packChordColumn(notes, true, center, note => note.tone.acc !== 0, { width: 15, height: 18 });
  return lines + srClef(layout.clef, 8, 0) + notes.map(({ tone, y, dx, ax }) => {
    const x = center + dx;
    const mark = ax === undefined ? '' : accidental(tone.acc, ax, y);
    return `<g class="pr-chord-note${toneClasses(tone, compare && chord.changed.has(tone.midi))}" data-chord-midi="${tone.midi}">` +
      srLedger2(x, y, 0) + mark + ssNotehead(x, y, 2) + '</g>';
  }).join('');
}

export function createChordHintDiagrams(
  original: DiagramChord,
  comparison: DiagramChord | null,
  spell: (letter: number, accidental: number) => string,
  text: (key: string, ...args: string[]) => string,
) {
  const all = [...original.tones, ...(comparison?.tones ?? [])];
  let low = Math.min(...all.map(tone => tone.midi));
  let high = Math.max(low + 12, ...all.map(tone => tone.midi));
  while (!whitePitch.has(pitchClass(low))) low--;
  while (!whitePitch.has(pitchClass(high))) high++;
  const whites = Array.from({ length: high - low + 1 }, (_, i) => low + i).filter(midi => whitePitch.has(pitchClass(midi))).length;
  const keyboard = image('pr-chord-keyboard', `0 0 ${whites * 20 + 4} 68`);
  keyboard.dataset.chordRoot = String(pitchClass(original.tones[0].midi));

  const accidentalCount = (tones: readonly ChordHintTone[]) => tones.filter(tone => tone.acc).length;
  const center = 58 + 15 * Math.max(accidentalCount(original.tones), accidentalCount(comparison?.tones ?? []));
  const width = center + 36;
  const staves = staffLayouts.map(layout => {
    const positions = all.map(tone => staffY(tone, layout));
    const above = Math.min(-17, Math.min(...positions) - 14);
    const below = Math.max(62, Math.max(...positions) + 14);
    return { ...layout, svg: image(`pr-chord-staff pr-chord-staff-${layout.clef}`, `0 ${above} ${width} ${below - above}`) };
  });
  const drawings = [keyboard, ...staves.map(staff => staff.svg)];
  const noteName = (tone: ChordHintTone, octaveOffset = 0) => spell(tone.li, tone.acc) + (tone.oct + octaveOffset);
  const caption = document.createElement('div');
  caption.className = 'pr-hint-detail pr-chord-caption';
  const makeCaption = (chord: DiagramChord) => {
    const names = chord.tones.map(tone => noteName(tone));
    const line = document.createElement('p');
    line.append(chord.title + ' · ');
    chord.tones.forEach((tone, index) => {
      if (index) line.append(' · ');
      if (chord.changed.has(tone.midi)) {
        const strong = document.createElement('strong');
        strong.textContent = names[index];
        line.append(strong);
      } else line.append(names[index]);
    });
    caption.append(line);
    return { chord, names: names.join(' · '), line };
  };
  const originalCaption = makeCaption(original);
  const comparisonCaption = comparison ? makeCaption(comparison) : null;

  let last: DiagramChord | undefined;
  let compared = false;
  const paint = (symbol?: string, sounding: readonly PracticeHintNote[] = []) => {
    const chord = comparison && symbol === comparison.symbol ? comparison : original;
    const comparing = !!comparison && symbol !== undefined;
    if (chord !== last || comparing !== compared) {
      keyboard.innerHTML = keyboardKeys(chord, low, high, comparing);
      const active = comparisonCaption?.chord === chord ? comparisonCaption : originalCaption;
      keyboard.setAttribute('aria-label', text('pr_hints_chord_keyboard', chord.title, active.names));
      for (const staff of staves) {
        staff.svg.innerHTML = staffChord(chord, staff, center, width, comparing);
        const names = chord.tones.map(tone => noteName(tone, staff.octaveOffset)).join(' · ');
        staff.svg.setAttribute('aria-label', text(staff.label, chord.title, names));
      }
      originalCaption.line.setAttribute('aria-hidden', String(active !== originalCaption));
      comparisonCaption?.line.setAttribute('aria-hidden', String(active !== comparisonCaption));
      caption.classList.toggle('pr-chord-comparing', comparing);
    }
    last = chord;
    compared = comparing;
    const midis = new Set(sounding.map(note => note.midi));
    for (const svg of drawings) {
      svg.querySelectorAll('[data-chord-midi]').forEach(node => {
        node.classList.toggle('pr-chord-sounding', midis.has(Number(node.getAttribute('data-chord-midi'))));
      });
    }
  };
  paint();
  return { keyboard, staves, caption, paint };
}

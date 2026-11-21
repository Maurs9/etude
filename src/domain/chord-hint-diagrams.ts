import { packChordColumn, srClef, srLedger2 } from './grand-staff.js';
import { createHintKeyboard, hintSvg } from './hint-keyboard.js';
import type { ChordHintTone, PracticeHintNote } from './practice-hints.js';
import { ssAccGlyph, ssFlat, ssNotehead, ssStepOf } from './score-types.js';

interface DiagramChord {
  readonly symbol: string;
  readonly title: string;
  readonly tones: readonly ChordHintTone[];
  readonly changed: ReadonlySet<number>;
}

const staffLayouts = [
  { clef: 'treble', bottomStep: ssStepOf(2, 4), octaveOffset: 0, label: 'pr_hints_chord_staff' },
  { clef: 'bass', bottomStep: ssStepOf(4, 2), octaveOffset: -1, label: 'pr_hints_chord_bass_staff' },
] as const;
type StaffLayout = (typeof staffLayouts)[number];

function toneClasses(tone: ChordHintTone | undefined, changed: boolean): string {
  return (tone?.degree === 1 ? ' pr-chord-root' : '') + (changed ? ' pr-chord-changed' : '');
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
  const keyboard = createHintKeyboard(original.tones[0].midi, all.map(tone => tone.midi));

  const accidentalCount = (tones: readonly ChordHintTone[]) => tones.filter(tone => tone.acc).length;
  const center = 58 + 15 * Math.max(accidentalCount(original.tones), accidentalCount(comparison?.tones ?? []));
  const width = center + 36;
  const staves = staffLayouts.map(layout => {
    const positions = all.map(tone => staffY(tone, layout));
    const above = Math.min(-17, Math.min(...positions) - 14);
    const below = Math.max(62, Math.max(...positions) + 14);
    return { ...layout, svg: hintSvg(`pr-chord-staff pr-chord-staff-${layout.clef}`, `0 ${above} ${width} ${below - above}`) };
  });
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
      const active = comparisonCaption?.chord === chord ? comparisonCaption : originalCaption;
      keyboard.draw(chord.tones.map(tone => ({ midi: tone.midi, tonic: tone.degree === 1 })),
        text('pr_hints_chord_keyboard', chord.title, active.names), comparing ? chord.changed : undefined);
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
    keyboard.paint(midis);
    for (const { svg } of staves) {
      svg.querySelectorAll('[data-chord-midi]').forEach(node => {
        node.classList.toggle('pr-chord-sounding', midis.has(Number(node.getAttribute('data-chord-midi'))));
      });
    }
  };
  paint();
  return { keyboard: keyboard.svg, staves, caption, paint };
}

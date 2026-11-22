import { packChordColumn, srClef, srLedger2 } from './grand-staff.js';
import { createHintKeyboard, hintSvg } from './hint-keyboard.js';
import type { ChordHintTone, PracticeHintNote } from './practice-hints.js';
import { ssAccGlyph, ssFlat, ssNotehead, ssStepOf } from './score-types.js';

export interface DiagramChord {
  readonly symbol: string;
  readonly title: string;
  readonly tones: readonly ChordHintTone[];
}

const staffLayouts = [
  { clef: 'treble', bottomStep: ssStepOf(2, 4), octaveOffset: 0, label: 'pr_hints_chord_staff' },
  { clef: 'bass', bottomStep: ssStepOf(4, 2), octaveOffset: -1, label: 'pr_hints_chord_bass_staff' },
] as const;
type StaffLayout = (typeof staffLayouts)[number];

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

function staffChord(chord: DiagramChord, layout: StaffLayout, center: number, width: number): string {
  const lines = Array.from({ length: 5 }, (_, i) =>
    `<line class="pr-chord-staff-line" x1="5" x2="${width - 5}" y1="${12 * i}" y2="${12 * i}"/>`).join('');
  const notes = chord.tones.map(tone => ({ tone, step: ssStepOf(tone.li, tone.oct), y: staffY(tone, layout), dx: 0, ax: undefined as number | undefined }));
  packChordColumn(notes, true, center, note => note.tone.acc !== 0, { width: 15, height: 18 });
  return lines + srClef(layout.clef, 8, 0) + notes.map(({ tone, y, dx, ax }) => {
    const x = center + dx;
    const mark = ax === undefined ? '' : accidental(tone.acc, ax, y);
    const rootClass = tone.degree === 1 ? ' pr-chord-root' : '';
    return `<g class="pr-chord-note${rootClass}" data-chord-midi="${tone.midi}">` +
      srLedger2(x, y, 0) + mark + ssNotehead(x, y, 2) + '</g>';
  }).join('');
}

export function createChordHintDiagrams(
  voicings: readonly DiagramChord[],
  initialInversion: number,
  spell: (letter: number, accidental: number) => string,
  text: (key: string, ...args: string[]) => string,
) {
  let activeIndex = Math.max(0, Math.min(initialInversion, voicings.length - 1));
  const initial = voicings[activeIndex];
  const rootMidi = voicings[0].tones[0].midi;
  const keyboard = createHintKeyboard(rootMidi, initial.tones.map(tone => tone.midi));

  const accidentalCount = (tones: readonly ChordHintTone[]) => tones.filter(tone => tone.acc).length;
  // Keep at least two accidental columns so clefs render at a consistent scale across cards in the same row.
  const center = 58 + 15 * Math.max(2, ...voicings.map(voicing => accidentalCount(voicing.tones)));
  const width = center + 36;
  const staves = staffLayouts.map(layout => ({
    ...layout,
    svg: hintSvg(`pr-chord-staff pr-chord-staff-${layout.clef}`, `0 -14 ${width} 72`),
  }));
  const noteName = (tone: ChordHintTone, octaveOffset = 0) => spell(tone.li, tone.acc) + (tone.oct + octaveOffset);
  const caption = document.createElement('p');
  caption.className = 'pr-hint-detail pr-chord-caption';

  let last: DiagramChord | undefined;
  const paint = (_rawKey?: string, sounding: readonly PracticeHintNote[] = []) => {
    const chord = voicings[activeIndex];
    if (chord !== last) {
      const labelNames = chord.tones.map(tone => noteName(tone)).join(' · ');
      caption.textContent = chord.tones.map(tone => spell(tone.li, tone.acc)).join(' · ');
      keyboard.draw(chord.tones.map(tone => ({ midi: tone.midi, tonic: tone.degree === 1 })),
        text('pr_hints_chord_keyboard', chord.title, labelNames), undefined, true);
      for (const staff of staves) {
        const positions = chord.tones.map(tone => staffY(tone, staff));
        const above = Math.min(-14, Math.min(...positions) - 12);
        const below = Math.max(58, Math.max(...positions) + 12);
        staff.svg.setAttribute('viewBox', `0 ${above} ${width} ${below - above}`);
        staff.svg.innerHTML = staffChord(chord, staff, center, width);
        const names = chord.tones.map(tone => noteName(tone, staff.octaveOffset)).join(' · ');
        staff.svg.setAttribute('aria-label', text(staff.label, chord.title, names));
      }
      last = chord;
    }
    const midis = new Set(sounding.map(note => note.midi));
    keyboard.paint(midis);
    for (const { svg } of staves) {
      svg.querySelectorAll('[data-chord-midi]').forEach(node => {
        node.classList.toggle('pr-chord-sounding', midis.has(Number(node.getAttribute('data-chord-midi'))));
      });
    }
  };
  const setInversion = (index: number) => {
    activeIndex = Math.max(0, Math.min(index, voicings.length - 1));
    paint();
  };
  paint();
  return {
    keyboard: keyboard.svg,
    staves,
    caption,
    setInversion,
    followWithoutDock: true,
    paint,
  };
}

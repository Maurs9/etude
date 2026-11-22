import { packChordColumn, srClef, srLedger2 } from './grand-staff.js';
import { createHintKeyboard, hintSvg } from './hint-keyboard.js';
import { createCompareBadge } from './practice-hint-dom.js';
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
  // Keep at least two accidental columns so clefs render at a consistent scale across cards in the same row.
  const center = 58 + 15 * Math.max(2, accidentalCount(original.tones), accidentalCount(comparison?.tones ?? []));
  const width = center + 36;
  const staves = staffLayouts.map(layout => {
    const positions = all.map(tone => staffY(tone, layout));
    const above = Math.min(-14, Math.min(...positions) - 12);
    const below = Math.max(58, Math.max(...positions) + 12);
    return { ...layout, svg: hintSvg(`pr-chord-staff pr-chord-staff-${layout.clef}`, `0 ${above} ${width} ${below - above}`) };
  });
  const noteName = (tone: ChordHintTone, octaveOffset = 0) => spell(tone.li, tone.acc) + (tone.oct + octaveOffset);
  const caption = document.createElement('div');
  caption.className = 'pr-hint-detail pr-chord-caption';
  const makeCaption = (chord: DiagramChord, withPrefix: boolean) => {
    const labelNames = chord.tones.map(tone => noteName(tone)).join(' · ');
    const pitchNames = chord.tones.map(tone => spell(tone.li, tone.acc));
    const line = document.createElement('p');
    if (withPrefix) {
      const tag = document.createElement('span');
      tag.className = 'pr-caption-tag';
      tag.textContent = chord.title;
      line.append(tag);
    }
    chord.tones.forEach((tone, index) => {
      if (index) line.append(' · ');
      if (withPrefix && chord.changed.has(tone.midi)) {
        const strong = document.createElement('strong');
        strong.textContent = pitchNames[index];
        line.append(strong);
      } else line.append(pitchNames[index]);
    });
    caption.append(line);
    return { chord, names: labelNames, line };
  };
  const idleCaption = makeCaption(original, false);
  const originalCompareCaption = comparison ? makeCaption(original, true) : idleCaption;
  const comparisonCaption = comparison ? makeCaption(comparison, true) : null;
  const compareBadge = comparison ? createCompareBadge(original.title, comparison.title) : null;

  let last: DiagramChord | undefined;
  let compared = false;
  const paint = (rawKey?: string, sounding: readonly PracticeHintNote[] = []) => {
    const comparing = !!comparison && (rawKey?.startsWith('compare:') ?? false);
    const symbol = comparing && rawKey ? rawKey.slice('compare:'.length) : rawKey;
    const chord = comparison && symbol === comparison.symbol ? comparison : original;
    if (chord !== last || comparing !== compared) {
      const active = !comparing
        ? idleCaption
        : chord === comparison && comparisonCaption
          ? comparisonCaption
          : originalCompareCaption;
      keyboard.draw(chord.tones.map(tone => ({ midi: tone.midi, tonic: tone.degree === 1 })),
        text('pr_hints_chord_keyboard', chord.title, active.names), comparing ? chord.changed : undefined);
      for (const staff of staves) {
        staff.svg.innerHTML = staffChord(chord, staff, center, width, comparing);
        const names = chord.tones.map(tone => noteName(tone, staff.octaveOffset)).join(' · ');
        staff.svg.setAttribute('aria-label', text(staff.label, chord.title, names));
      }
      idleCaption.line.setAttribute('aria-hidden', String(active !== idleCaption));
      if (originalCompareCaption !== idleCaption) {
        originalCompareCaption.line.setAttribute('aria-hidden', String(active !== originalCompareCaption));
      }
      comparisonCaption?.line.setAttribute('aria-hidden', String(active !== comparisonCaption));
      caption.classList.toggle('pr-chord-comparing', comparing);
      compareBadge?.update(comparing, chord === comparison);
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
  return {
    keyboard: keyboard.svg,
    staves,
    caption,
    compareStatus: compareBadge?.el ?? null,
    followWithoutDock: true,
    paint,
  };
}

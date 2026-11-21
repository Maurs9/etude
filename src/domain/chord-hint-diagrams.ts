import { packChordColumn, srClef, srLedger2 } from './grand-staff.js';
import type { ChordHintTone, PracticeHintNote } from './practice-hints.js';
import { ssNotehead, ssStepOf } from './score-types.js';
import { hintAccidental, hintKeyboardKeys, hintKeyboardLayout, hintStaffY, hintSvg } from './hint-diagram-svg.js';

interface DiagramChord {
  readonly symbol: string;
  readonly title: string;
  readonly tones: readonly ChordHintTone[];
  readonly changed: ReadonlySet<number>;
}

function toneClasses(tone: ChordHintTone | undefined, changed: boolean): string {
  return (tone?.degree === 1 ? ' pr-chord-root' : '') + (changed ? ' pr-chord-changed' : '');
}

function staffChord(chord: DiagramChord, center: number, width: number, compare: boolean): string {
  const lines = Array.from({ length: 5 }, (_, i) =>
    `<line class="pr-chord-staff-line" x1="5" x2="${width - 5}" y1="${12 * i}" y2="${12 * i}"/>`).join('');
  const notes = chord.tones.map(tone => ({ tone, step: ssStepOf(tone.li, tone.oct), y: hintStaffY(tone), dx: 0, ax: undefined as number | undefined }));
  packChordColumn(notes, true, center, note => note.tone.acc !== 0, { width: 15, height: 18 });
  return lines + srClef('treble', 8, 0) + notes.map(({ tone, y, dx, ax }) => {
    const x = center + dx;
    const mark = ax === undefined ? '' : hintAccidental('chord', tone.acc, ax, y);
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
  const { low, high, viewBox } = hintKeyboardLayout(all.map(tone => tone.midi));
  const keyboard = hintSvg('pr-chord-keyboard', viewBox);

  const above = Math.min(-17, ...all.map(tone => hintStaffY(tone) - 14));
  const below = Math.max(62, ...all.map(tone => hintStaffY(tone) + 14));
  const accidentalCount = (tones: readonly ChordHintTone[]) => tones.filter(tone => tone.acc).length;
  const center = 58 + 15 * Math.max(accidentalCount(original.tones), accidentalCount(comparison?.tones ?? []));
  const width = center + 36;
  const staff = hintSvg('pr-chord-staff', `0 ${above} ${width} ${below - above}`);
  const caption = document.createElement('div');
  caption.className = 'pr-hint-detail pr-chord-caption';
  const makeCaption = (chord: DiagramChord) => {
    const names = chord.tones.map(tone => spell(tone.li, tone.acc) + tone.oct);
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
  let staffDrawn = false;
  let expanded = false;
  const paint = (symbol?: string, sounding: readonly PracticeHintNote[] = []) => {
    const chord = comparison && symbol === comparison.symbol ? comparison : original;
    const comparing = !!comparison && symbol !== undefined;
    const changed = chord !== last || comparing !== compared;
    if (changed) {
      keyboard.innerHTML = hintKeyboardKeys('chord', chord.tones.map(tone => ({ midi: tone.midi, tonic: tone.degree === 1 })), low, high, comparing ? chord.changed : null);
      staffDrawn = false;
    }
    if (expanded && !staffDrawn) {
      staff.innerHTML = staffChord(chord, center, width, comparing);
      staffDrawn = true;
    }
    if (changed) {
      const active = comparisonCaption?.chord === chord ? comparisonCaption : originalCaption;
      keyboard.setAttribute('aria-label', text('pr_hints_chord_keyboard', chord.title, active.names));
      staff.setAttribute('aria-label', text('pr_hints_chord_staff', chord.title, active.names));
      originalCaption.line.setAttribute('aria-hidden', String(active !== originalCaption));
      comparisonCaption?.line.setAttribute('aria-hidden', String(active !== comparisonCaption));
      caption.classList.toggle('pr-chord-comparing', comparing);
    }
    last = chord;
    compared = comparing;
    const midis = new Set(sounding.map(note => note.midi));
    for (const svg of [keyboard, staff]) {
      svg.querySelectorAll('[data-chord-midi]').forEach(node => {
        node.classList.toggle('pr-chord-sounding', midis.has(Number(node.getAttribute('data-chord-midi'))));
      });
    }
  };
  paint();
  return {
    keyboard, staff, caption, paint,
    expand(open: boolean) {
      expanded = open;
      paint();
    },
  };
}

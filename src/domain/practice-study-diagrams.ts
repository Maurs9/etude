import { packChordColumn, srClef, srLedger2 } from './grand-staff.js';
import { hintAccidental, hintKeyboardKeys, hintKeyboardLayout, hintStaffY, hintSvg } from './hint-diagram-svg.js';
import type { PracticeHintNote, ProgressionHintVoicing } from './practice-hints.js';
import { ssMidiOf, ssNotehead, ssStepOf } from './score-types.js';
import { techniqueSpellDegree, type TechniqueHand, type TechniqueKind, type TechniqueNote } from './technique.js';
import type { SpelledMidi } from './theory.js';

type Clef = 'treble' | 'bass';
type WrittenNote = SpelledMidi & PracticeHintNote;

function staffY(note: SpelledMidi, clef: Clef): number {
  // The bass staff starts on G2; the treble staff starts on E4.
  return hintStaffY(note) - (clef === 'bass' ? 72 : 0);
}

function staffLines(clef: Clef, width: number, top = 0): string {
  const lines = Array.from({ length: 5 }, (_, i) => {
    const y = top + i * 12;
    return `<line class="pr-chord-staff-line" x1="5" x2="${width - 5}" y1="${y}" y2="${y}"/>`;
  });
  return lines.join('') + srClef(clef, 8, top);
}

function writtenNote(note: WrittenNote, x: number, y: number, top: number, accidental: string, finger = ''): string {
  return `<g class="pr-study-note" data-midi="${note.midi}">${srLedger2(x, y, top)}${accidental}${ssNotehead(x, y, 2)}${finger}</g>`;
}

export function progressionStudyStaffs(voicings: readonly ProgressionHintVoicing[], labels: readonly string[]): SVGSVGElement[] {
  const rows: SVGSVGElement[] = [];
  const columns = 4;
  for (let start = 0; start < voicings.length; start += columns) {
    const row = voicings.slice(start, start + columns);
    const upper = row.flatMap(voicing => voicing.upper.map(hintStaffY));
    const bass = row.map(voicing => staffY(voicing.bass, 'bass'));
    const bassTop = Math.max(96, Math.max(48, ...upper) + 28 - Math.min(0, ...bass));
    const top = Math.min(-17, ...upper.map(y => y - 15));
    const bottom = bassTop + Math.max(64, ...bass.map(y => y + 14));
    const width = 55 + 68 * row.length;
    const svg = hintSvg('pr-study-staff pr-prog-staff', `0 ${top} ${width} ${bottom - top}`);
    svg.setAttribute('aria-label', labels.slice(start, start + columns).join(' · '));
    const groups = row.map(({ bass: low, upper: chord }, index) => {
      const center = 89 + 68 * index;
      const y = bassTop + bass[index];
      const notes = chord.map(tone => ({ tone, step: ssStepOf(tone.li, tone.oct), y: hintStaffY(tone), dx: 0, ax: undefined as number | undefined }));
      packChordColumn(notes, true, center, note => note.tone.acc !== 0, { width: 15, height: 18 });
      const stack = notes.map(({ tone, y, dx, ax }) =>
        writtenNote(tone, center + dx, y, 0, ax === undefined ? '' : hintAccidental('chord', tone.acc, ax, y)));
      const bottomNote = writtenNote(low, center, y, bassTop, low.acc === 0 ? '' : hintAccidental('chord', low.acc, center - 14, y));
      const bar = `<line class="pr-chord-staff-line" x1="${center + 29}" x2="${center + 29}" y1="0" y2="${bassTop + 48}"/>`;
      return `<g data-study-chord="${start + index}">` +
        `<rect class="pr-study-column-mark" x="${center - 34}" y="${top}" width="62" height="${bottom - top}" rx="5"/>` +
        stack.join('') + bottomNote + bar + '</g>';
    });
    svg.innerHTML = staffLines('treble', width) + staffLines('bass', width, bassTop) + groups.join('');
    rows.push(svg);
  }
  return rows;
}

export function techniqueStudyStaff(
  notes: readonly TechniqueNote[], start: number, kind: TechniqueKind, tonic: number, hand: TechniqueHand,
  fragment: readonly TechniqueNote[], label: string,
): SVGSVGElement {
  const clef = hand === 'rh' ? 'treble' : 'bass';
  const spelled = notes.map(note => {
    const { letter: li, acc } = techniqueSpellDegree(kind, tonic, note.degree);
    return { ...note, li, acc, oct: (note.midi - ssMidiOf(li, 0, acc)) / 12 };
  });
  const positions = spelled.map(note => staffY(note, clef));
  const top = Math.min(-19, ...positions.map(y => y - 25));
  const bottom = Math.max(65, ...positions.map(y => y + 14));
  const width = 48 + 29 * notes.length;
  const svg = hintSvg('pr-study-staff pr-technique-staff', `0 ${top} ${width} ${bottom - top}`);
  svg.setAttribute('aria-label', label);
  const prior = new Map<number, number>();
  const groups = spelled.map((note, i) => {
    const x = 59 + i * 29, y = positions[i];
    const step = ssStepOf(note.li, note.oct);
    const mark = note.acc === (prior.get(step) ?? 0) ? '' : hintAccidental('chord', note.acc, x - 14, y);
    prior.set(step, note.acc);
    const finger = `<text class="pr-study-finger" x="${x}" y="${Math.min(-4, y - 11)}" text-anchor="middle">${note.finger}</text>`;
    const focus = start === 0 && fragment.includes(notes[i]) ? ' class="pr-study-passage"' : '';
    return `<g data-study-step="${start + i}"${focus}>${writtenNote(note, x, y, 0, mark, finger)}</g>`;
  });
  svg.innerHTML = staffLines(clef, width) + groups.join('');
  return svg;
}

export function showStudyKeyboard(
  keyboard: SVGSVGElement,
  tones: readonly (PracticeHintNote & { readonly tonic: boolean })[],
  label: string,
): void {
  const { low, high, viewBox } = hintKeyboardLayout(tones.map(note => note.midi));
  keyboard.setAttribute('viewBox', viewBox);
  keyboard.setAttribute('aria-label', label);
  keyboard.innerHTML = hintKeyboardKeys('chord', tones, low, high, null);
  for (const note of tones) {
    if (note.finger === undefined) continue;
    const key = keyboard.querySelector(`[data-chord-midi="${note.midi}"]`);
    const dot = key?.querySelector('circle');
    if (!dot) continue;
    const finger = document.createElementNS(keyboard.namespaceURI, 'text');
    finger.setAttribute('class', 'pr-study-key-finger');
    finger.setAttribute('x', dot.getAttribute('cx') ?? '0');
    finger.setAttribute('y', dot.getAttribute('cy') ?? '0');
    finger.textContent = String(note.finger);
    key?.append(finger);
  }
}

export function paintStudyKeys(keyboard: SVGSVGElement, notes: readonly PracticeHintNote[]): void {
  const active = new Set(notes.map(note => note.midi));
  keyboard.querySelectorAll('[data-chord-midi]').forEach(key =>
    key.classList.toggle('pr-chord-sounding', active.has(Number(key.getAttribute('data-chord-midi')))));
}

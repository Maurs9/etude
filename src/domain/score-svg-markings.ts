// Semantic bindings for OSMD 2.3's SVG groups. Use the engraver's source objects,
// not a glyph's aspect ratio, to distinguish navigation signs and repeat bars.
export interface ScoreStructuralMark {
  element: Element;
  kind: string;
  value: string;
}

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
const array = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : [];

// VexFlow Repetition.type and Barline.type in the vendored OSMD bundle.
// Kept here at the vendor boundary; browser regressions exercise the actual SVG.
const REPETITIONS: Readonly<Record<number, string>> = {
  2: 'coda', 3: 'coda', 4: 'segno', 5: 'segno',
  6: 'dacapo', 7: 'dacapo_coda', 8: 'dacapo_fine',
  9: 'dalsegno', 10: 'dalsegno_coda', 11: 'dalsegno_fine',
  12: 'fine', 13: 'tocoda',
};
const BARLINES: Readonly<Record<number, string>> = {
  1: 'barline', 2: 'doublebar', 3: 'endbar',
  4: 'repeat_start', 5: 'repeat_end', 6: 'repeat_both', 8: 'doublebar',
};

// StaveTempo.tempo uses VexFlow durations, not MusicXML beat-unit names.
// Its note/dots are drawn as paths; the SVG's textContent contains only '= BPM'.
const TEMPO_BEATS: Readonly<Record<string, string>> = {
  w: '\u{1D15D}', h: '\u{1D15E}', q: '♩', 8: '♪',
  16: '\u{1D161}', 32: '\u{1D162}', 64: '\u{1D163}', 128: '\u{1D164}',
};
function metronomeText(source: unknown): string | undefined {
  const tempo = record(record(source).tempo);
  // A note-to-note equation is not a BPM marking, even if stale BPM fields exist.
  if (tempo.noteEquation) return undefined;
  const beat = typeof tempo.duration === 'string' && Object.hasOwn(TEMPO_BEATS, tempo.duration)
    ? TEMPO_BEATS[tempo.duration] : undefined;
  const dots = tempo.dots === undefined ? 0 : tempo.dots;
  // The direction recognizer currently supports undotted and single-dotted beats.
  // Do not silently simplify a different beat duration.
  if (!beat || (dots !== 0 && dots !== 1)) return undefined;
  if (typeof tempo.bpm !== 'number' && typeof tempo.bpm !== 'string') return undefined;
  const bpm = String(tempo.bpm).trim();
  if (!/^\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?$/.test(bpm)
    || bpm.split(/[-–]/).some(value => !(Number(value.trim().replace(',', '.')) > 0))) return undefined;
  const mark = `${beat}${dots === 1 ? '.' : ''} = ${bpm}`;
  // Match StaveTempo.draw's literal name + parenthesized metronome layout.
  const name = typeof tempo.name === 'string' ? tempo.name.trim() : '';
  return name ? `${name} (${mark})` : mark;
}

export function scoreStructuralMarks(sheet: unknown): ScoreStructuralMark[] {
  const marks: ScoreStructuralMark[] = [], seen = new Set<Element>();
  const add = (element: Element | undefined, kind: string | undefined, value = '') => {
    if (!element || !kind || seen.has(element)) return;
    seen.add(element);
    marks.push({ element, kind, value });
  };
  for (const page of array(record(sheet).MusicPages)) {
    for (const system of array(record(page).MusicSystems)) {
      for (const staff of array(record(system).StaffLines)) {
        for (const measure of array(record(staff).Measures)) {
          const gm = record(measure), root = gm.svgGElement;
          if (!(root instanceof Element)) continue;
          const repetitions = [...root.querySelectorAll('.vf-repetition')];
          const sourceRepetitions = array(gm.vfRepetitionWords);
          // A count mismatch is not permission to attach a different instruction.
          if (repetitions.length === sourceRepetitions.length) {
            sourceRepetitions.forEach((source, index) => add(repetitions[index], REPETITIONS[Number(record(source).symbol_type)]));
          }
          const modifiers = array(record(gm.stave).modifiers);
          const tempos = [...root.querySelectorAll('.vf-stavetempo')];
          const sourceTempos = modifiers.filter(source => record(record(source).attrs).type === 'StaveTempo');
          if (tempos.length === sourceTempos.length) {
            // Keep unsupported equations/beat units in the pairing: dropping one
            // would shift every later tempo onto a different printed SVG group.
            sourceTempos.forEach((source, index) => {
              const value = metronomeText(source);
              if (value) add(tempos[index], 'text', value);
            });
          }
          const sourceBars = modifiers.filter(source => {
            const fields = record(source);
            return record(fields.attrs).type === 'Barline' && BARLINES[Number(fields.type)];
          });
          const bars = [...root.querySelectorAll('.vf-stavebarline')];
          if (bars.length === sourceBars.length) {
            sourceBars.forEach((source, index) => add(bars[index], BARLINES[Number(record(source).type)]));
          }
          const sections = [...root.querySelectorAll('.vf-stavesection')];
          const sourceSections = modifiers.filter(source => record(record(source).attrs).type === 'StaveSection');
          if (sections.length === sourceSections.length) {
            sourceSections.forEach((source, index) => add(sections[index], 'rehearsal', String(record(source).section ?? '')));
          }
          root.querySelectorAll('.vf-volta').forEach(element => add(element, 'volta', element.textContent?.trim() ?? ''));
          root.querySelectorAll('.vf-tuplet').forEach(element => add(element, 'tuplet'));
        }
      }
    }
  }
  return marks;
}

export function scoreOctaveMark(element: Element): string | null {
  const text = element.textContent?.replace(/\s+/g, '').toLowerCase() ?? '';
  if (/^8(?:va|v[ab]|bassa)$/.test(text)) return /(?:vb|bassa)$/.test(text) ? 'ottavabassa' : 'ottava';
  return null;
}

import {
  CHORD_HINTS, SCALE_HINTS, PROGRESSION_HINTS, TECHNIQUE_HINTS, PRACTICE_HINT_REFERENCES,
  chordHintSteps, chordHintTones, progressionHintChords, progressionHintSteps,
  scaleHintFormula, scaleHintSteps, scaleHintTones, techniqueHintSteps, techniqueHintTonic, type PracticeHintDiagram, type PracticeHintStep,
} from './practice-hints.js';
import { createChordHintDiagrams } from './chord-hint-diagrams.js';
import { createHintKeyboard } from './hint-keyboard.js';
import { techniqueSpellDegree, techniqueTonicSpelling, type TechniqueHand } from './technique.js';
import { keyFifths, spellMidi } from './theory.js';

export type PracticeHintsTopic = 'chord' | 'scale' | 'prog' | 'technique' | 'melody';

export function isPracticeHintsTopic(topic: string): topic is PracticeHintsTopic {
  return topic === 'chord' || topic === 'scale' || topic === 'prog' || topic === 'technique' || topic === 'melody';
}

interface HintViewOptions {
  readonly tonic: number | null;
  readonly audioOnly: boolean;
  readonly disabled: boolean;
  readonly text: (key: string, ...args: string[]) => string;
  readonly spell: (letter: number, accidental: number) => string;
  readonly chordName: (symbol: string) => string;
  readonly scaleName: (name: string) => string;
  readonly play: (id: string, steps: readonly PracticeHintStep[], keys: boolean, diagram?: PracticeHintDiagram) => void;
  readonly openExample: (id: string) => void;
}

function element(kind: string, className: string, text?: string): HTMLElement {
  const el = document.createElement(kind);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function card(id: string, title: string, cue: string, formula?: string, visuals?: HTMLElement) {
  const article = element('article', 'songcard pr-hint-card');
  article.dataset.hint = id;
  article.append(element('h3', 'pr-hint-name', title));
  if (formula) article.append(element('p', 'pr-hint-formula', formula));
  if (visuals) article.append(visuals);
  article.append(element('p', 'pr-hint-cue', cue));
  return article;
}

function control(id: string, label: string, description: string, disabled: boolean, activate: () => void) {
  const button = document.createElement('button');
  button.className = 'btn sm';
  button.textContent = label;
  button.type = 'button';
  button.dataset.hintControl = id;
  button.disabled = disabled;
  button.setAttribute('aria-label', `${label} — ${description}`);
  button.addEventListener('click', activate);
  return button;
}

export function renderPracticeHintCards(box: HTMLElement, topic: PracticeHintsTopic, options: HintViewOptions): void {
  const { text, spell, play, chordName, scaleName, disabled, audioOnly } = options;
  const tonic = options.tonic ?? 0;
  const active = document.activeElement;
  const focused = active instanceof HTMLElement && box.contains(active) ? active.dataset.hintControl : undefined;
  const rootName = (root: number, key = root, minor = false) => {
    const note = spellMidi(60 + root, keyFifths(key, minor), minor);
    return spell(note.li, note.acc);
  };
  const appendPlayback = (el: HTMLElement, id: string, title: string, steps: readonly PracticeHintStep[], diagram?: PracticeHintDiagram) => {
    const controls = element('div', 'pr-hint-actions');
    const label = text(topic === 'chord' || topic === 'scale' ? 'rdn_listen' : 'pr_hints_hear');
    controls.append(control(`${id}:hear`, label, title, disabled, () => play(id, steps, !audioOnly, diagram)));
    if (audioOnly) controls.append(control(`${id}:keys`, text('pr_hints_show_keys'), title, disabled, () => play(id, steps, true, diagram)));
    el.append(controls);
  };
  const appendReference = (el: HTMLElement, id: string) => {
    const reference = PRACTICE_HINT_REFERENCES[id];
    if (!reference) return;
    const details = element('div', 'pr-hint-reference');
    details.append(element('strong', 'pr-hint-source', reference.title),
      element('p', 'pr-hint-detail', text(`pr_hints_ref_${reference.cue}`)));
    const { example } = reference;
    if (example) details.append(control(`${id}:example`, text('pr_hints_open_example'), reference.title, false, () => options.openExample(example)));
    el.append(details);
  };
  const contents = document.createDocumentFragment();
  const appendGroup = (label: string) => {
    const section = element('section', 'pr-chord-group');
    const grid = element('div', 'pr-hint-grid');
    section.append(element('h2', 'pr-chord-group-title', label), grid);
    contents.append(section);
    return grid;
  };
  box.classList.toggle('pr-chord-groups', topic === 'chord' || topic === 'scale');
  if (topic === 'chord') {
    const groups = new Map([['maj', 'triads'], ['6', 'sixths_sevenths'], ['add9', 'extensions']]);
    let grid = element('div', 'pr-hint-grid');
    for (const hint of CHORD_HINTS) {
      const group = groups.get(hint.symbol);
      if (group) grid = appendGroup(text(`pr_hints_chord_group_${group}`));
      const id = `chord:${hint.symbol}`;
      const tones = chordHintTones(hint.symbol, tonic);
      const otherTones = hint.compare ? chordHintTones(hint.compare, tonic) : [];
      const tonicName = spell(tones[0].li, tones[0].acc);
      const symbolName = (symbol: string) => tonicName + (symbol === 'maj' ? '' : symbol);
      const differences = (first: typeof tones, second: typeof tones) =>
        new Set(first.filter(tone => !second.some(other => other.midi === tone.midi)).map(tone => tone.midi));
      const diagrams = createChordHintDiagrams({ symbol: hint.symbol, title: symbolName(hint.symbol), tones, changed: differences(tones, otherTones) },
        hint.compare ? { symbol: hint.compare, title: symbolName(hint.compare), tones: otherTones, changed: differences(otherTones, tones) } : null,
        spell, text);
      const title = `${symbolName(hint.symbol)} · ${chordName(hint.symbol)}`;
      const el = element('article', 'songcard pr-hint-card pr-chord-card');
      el.dataset.hint = hint.symbol;
      const visuals = element('div', 'pr-chord-visuals');
      const staves = element('div', 'pr-chord-staves');
      for (const { clef, svg } of diagrams.staves) {
        const staff = element('div', 'pr-chord-staff-block');
        staff.append(element('p', 'pr-chord-clef-label', text(`rdx_clef_${clef}`)), svg);
        staves.append(staff);
      }
      visuals.append(diagrams.keyboard, staves);
      el.append(element('h3', 'pr-hint-name', title),
        element('p', 'pr-hint-formula', tones.map(tone => tone.label).join(' ')), visuals,
        diagrams.caption);
      if (hint.compare) el.append(element('p', 'pr-hint-detail', text('pr_hints_compare', chordName(hint.compare))));
      appendPlayback(el, id, title, chordHintSteps(hint, tonic), diagrams);
      appendReference(el, id);
      grid.append(el);
    }
  } else if (topic === 'scale') {
    const groups = new Map([
      ['Major (Ionian)', 'diatonic'], ['Harmonic minor', 'altered'],
      ['Major pentatonic', 'pentatonic'], ['Whole tone', 'symmetric'],
    ]);
    let grid = element('div', 'pr-hint-grid');
    for (const hint of SCALE_HINTS) {
      const group = groups.get(hint.name);
      if (group) grid = appendGroup(text(`pr_hints_scale_group_${group}`));
      const title = `${rootName(tonic)} · ${scaleName(hint.name)}`;
      const id = `scale:${hint.name}`;
      const tones = scaleHintTones(hint.name, tonic);
      const comparison = hint.compare ? scaleHintTones(hint.compare.name, tonic) : tones;
      const keyboard = createHintKeyboard(tones[0].midi, [...tones, ...comparison].map(tone => tone.midi));
      const visuals = element('div', 'pr-scale-visuals');
      const names = element('p', 'pr-hint-detail');
      visuals.append(keyboard.svg, names);
      const el = card(hint.name, title, text(`pr_hints_s_${hint.cue}`), scaleHintFormula(hint), visuals);
      let last: string | undefined;
      const diagram: PracticeHintDiagram = {
        followWithoutDock: true,
        paint(key = hint.name, sounding = []) {
          if (key !== last) {
            const current = key === hint.name ? tones : comparison;
            const pitches = current.map(tone => spell(tone.li, tone.acc)).join(' · ');
            names.textContent = pitches;
            keyboard.draw(current, text('pr_hints_chord_keyboard', scaleName(key), pitches));
            last = key;
          }
          keyboard.paint(new Set(sounding.map(note => note.midi)));
        },
      };
      diagram.paint();
      if (hint.compare) el.append(element('p', 'pr-hint-detail', text('pr_hints_compare', scaleName(hint.compare.name))));
      appendPlayback(el, id, title, scaleHintSteps(hint, tonic), diagram);
      appendReference(el, id);
      grid.append(el);
    }
  } else if (topic === 'prog') {
    for (const hint of PROGRESSION_HINTS) {
      const title = text(`pr_hints_p_${hint.cue}_title`);
      const chords = progressionHintChords(hint, tonic);
      const names = chords.map(({ root, symbol }) => rootName(root, tonic, hint.minor) + (symbol === 'maj' ? '' : symbol));
      const el = card(hint.name, title, text(`pr_hints_p_${hint.cue}`), chords.map(chord => chord.roman).join('–'));
      el.append(element('p', 'pr-hint-detail', names.join(' – ')));
      const id = `prog:${hint.name}`;
      appendPlayback(el, id, title, progressionHintSteps(hint, tonic));
      appendReference(el, id);
      contents.append(el);
    }
  } else if (topic === 'technique') {
    for (const hint of TECHNIQUE_HINTS) {
      const pitch = techniqueHintTonic(hint, options.tonic);
      const spelling = techniqueTonicSpelling(hint.kind, pitch);
      const namedTonics = hint.namedTonics?.map(key => rootName(key)) ?? [];
      const title = text(`pr_hints_t_${hint.id}_title`, ...namedTonics);
      const tonicName = spell(spelling.letter, spelling.acc);
      const el = card(hint.id, title, text(`pr_hints_t_${hint.id}`, ...namedTonics), tonicName);
      for (const hand of ['rh', 'lh'] as const satisfies readonly TechniqueHand[]) {
        const { ascending, fragment, steps } = techniqueHintSteps(hint, pitch, hand);
        const handName = text(`tq_h_${hand}`);
        const fingers = element('p', 'pr-hint-detail pr-hint-fingers');
        for (const [i, note] of ascending.entries()) {
          const name = techniqueSpellDegree(hint.kind, pitch, note.degree);
          const label = `${spell(name.letter, name.acc)}(${note.finger})`;
          if (i) fingers.append(' · ');
          fingers.append(fragment.includes(note) ? element('strong', 'pr-hint-focus', label) : label);
        }
        const id = `technique:${hint.id}:${hand}`;
        el.append(control(id, `${text('pr_hints_hear')} · ${handName}`, `${title} · ${tonicName}`, disabled, () => play(id, steps, true)), fingers);
      }
      appendReference(el, `technique:${hint.id}`);
      contents.append(el);
    }
  } else {
    contents.append(element('p', 'pr-hint-method', text('pr_hints_melody_cue')));
  }
  box.replaceChildren(contents);
  if (focused) [...box.querySelectorAll<HTMLButtonElement>('button')].find(button => button.dataset.hintControl === focused)?.focus({ preventScroll: true });
}

import {
  CHORD_HINTS, SCALE_HINTS, PROGRESSION_HINTS, TECHNIQUE_HINTS, PRACTICE_HINT_REFERENCES,
  chordHintFormula, chordHintSteps, progressionHintChords, progressionHintSteps,
  scaleHintFormula, scaleHintSteps, techniqueHintSteps, techniqueHintTonic, type PracticeHintStep,
} from './practice-hints.js';
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
  readonly play: (id: string, steps: readonly PracticeHintStep[], keys: boolean) => void;
  readonly openExample: (id: string) => void;
}

function element(kind: string, className: string, text?: string): HTMLElement {
  const el = document.createElement(kind);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function card(id: string, title: string, cue: string, formula?: string) {
  const article = element('article', 'songcard pr-hint-card');
  article.dataset.hint = id;
  article.append(element('h3', 'pr-hint-name', title));
  if (formula) article.append(element('p', 'pr-hint-formula', formula));
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
  const appendPlayback = (el: HTMLElement, id: string, title: string, steps: readonly PracticeHintStep[]) => {
    const controls = element('div', 'pr-hint-actions');
    controls.append(control(`${id}:hear`, text('pr_hints_hear'), title, disabled, () => play(id, steps, !audioOnly)));
    if (audioOnly) controls.append(control(`${id}:keys`, text('pr_hints_show_keys'), title, disabled, () => play(id, steps, true)));
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
  if (topic === 'chord') {
    for (const hint of CHORD_HINTS) {
      const title = `${rootName(tonic)}${hint.symbol === 'maj' ? '' : hint.symbol} · ${chordName(hint.symbol)}`;
      const id = `chord:${hint.symbol}`;
      const el = card(hint.symbol, title, text(`pr_hints_c_${hint.cue}`), chordHintFormula(hint.symbol));
      if (hint.compare) el.append(element('p', 'pr-hint-detail', text('pr_hints_compare', chordName(hint.compare))));
      appendPlayback(el, id, title, chordHintSteps(hint, tonic));
      appendReference(el, id);
      contents.append(el);
    }
  } else if (topic === 'scale') {
    for (const hint of SCALE_HINTS) {
      const title = `${rootName(tonic)} · ${scaleName(hint.name)}`;
      const id = `scale:${hint.name}`;
      const el = card(hint.name, title, text(`pr_hints_s_${hint.cue}`), scaleHintFormula(hint));
      if (hint.compare) el.append(element('p', 'pr-hint-detail', text('pr_hints_compare', scaleName(hint.compare.name))));
      appendPlayback(el, id, title, scaleHintSteps(hint, tonic));
      appendReference(el, id);
      contents.append(el);
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

import {
  CHORD_HINTS, SCALE_HINTS, PROGRESSION_HINTS, TECHNIQUE_HINTS, PRACTICE_HINT_REFERENCES,
  chordHintSteps, chordHintTones, progressionHintChords,
  scaleHintFormula, scaleHintSteps, techniqueHintTonic, type PracticeHintDiagram, type PracticeHintStep,
} from './practice-hints.js';
import { createChordHintDiagrams } from './chord-hint-diagrams.js';
import { control, element } from './practice-hint-dom.js';
import { renderProgressionStudy, renderTechniqueStudy, type StudyHintOptions, type StudyHintState } from './practice-study-view.js';
import { techniqueTonicSpelling } from './technique.js';
import { keyFifths, spellMidi } from './theory.js';

export type PracticeHintsTopic = 'chord' | 'scale' | 'prog' | 'technique' | 'melody';

export function isPracticeHintsTopic(topic: string): topic is PracticeHintsTopic {
  return topic === 'chord' || topic === 'scale' || topic === 'prog' || topic === 'technique' || topic === 'melody';
}

interface HintViewOptions extends StudyHintOptions {
  readonly tonic: number | null;
  readonly chordName: (symbol: string) => string;
  readonly scaleName: (name: string) => string;
  readonly chordExpansion: { open: string | null };
  readonly study: StudyHintState;
  readonly openExample: (id: string) => void;
}

function card(id: string, title: string, cue: string, formula?: string) {
  const article = element('article', 'songcard pr-hint-card');
  article.dataset.hint = id;
  article.append(element('h3', 'pr-hint-name', title));
  if (formula) article.append(element('p', 'pr-hint-formula', formula));
  article.append(element('p', 'pr-hint-cue', cue));
  return article;
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
    controls.append(control(`${id}:hear`, text('pr_hints_hear'), title, disabled, () => play(id, steps, !audioOnly, diagram)));
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
  box.classList.toggle('pr-chord-groups', topic === 'chord');
  if (topic === 'chord') {
    const groups = new Map([['maj', 'triads'], ['6', 'sixths_sevenths'], ['add9', 'extensions']]);
    const toggles = new Map<string, (open: boolean) => void>();
    let grid = element('div', 'pr-hint-grid');
    for (const hint of CHORD_HINTS) {
      const group = groups.get(hint.symbol);
      if (group) {
        const section = element('section', 'pr-chord-group');
        const heading = element('h2', 'pr-chord-group-title', text(`pr_hints_chord_group_${group}`));
        grid = element('div', 'pr-hint-grid');
        section.append(heading, grid);
        contents.append(section);
      }
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
      const heading = element('h3', 'pr-hint-name');
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'pr-chord-toggle';
      toggle.textContent = title;
      toggle.dataset.hintControl = `${id}:toggle`;
      heading.append(toggle);
      const visuals = element('div', 'pr-chord-visuals');
      visuals.append(diagrams.keyboard, diagrams.staff);
      const detail = element('div', 'pr-chord-detail');
      detail.id = `pr-chord-detail-${hint.symbol}`;
      diagrams.staff.id = `pr-chord-staff-${hint.symbol}`;
      toggle.setAttribute('aria-controls', `${diagrams.staff.id} ${detail.id}`);
      detail.append(diagrams.caption, element('p', 'pr-hint-cue', text(`pr_hints_c_${hint.cue}`)));
      if (hint.compare) detail.append(element('p', 'pr-hint-detail', text('pr_hints_compare', chordName(hint.compare))));
      appendPlayback(detail, id, title, chordHintSteps(hint, tonic), diagrams);
      appendReference(detail, id);
      el.append(heading, element('p', 'pr-hint-formula', tones.map(tone => tone.label).join(' ')), visuals, detail);
      const setOpen = (open: boolean) => {
        el.classList.toggle('pr-chord-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        detail.hidden = !open;
        diagrams.staff.classList.toggle('pr-chord-hidden', !open);
        diagrams.expand(open);
      };
      toggles.set(hint.symbol, setOpen);
      setOpen(options.chordExpansion.open === hint.symbol);
      toggle.addEventListener('click', () => {
        options.stop();
        const previous = options.chordExpansion.open;
        if (previous) toggles.get(previous)?.(false);
        options.chordExpansion.open = previous === hint.symbol ? null : hint.symbol;
        if (options.chordExpansion.open) setOpen(true);
      });
      grid.append(el);
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
  } else if (topic === 'prog' || topic === 'technique') {
    const toggles = new Map<string, (open: boolean) => void>();
    const appendStudy = (hint: string, title: string, summary: readonly string[], cue: string, build: () => HTMLElement) => {
      const id = `${topic}:${hint}`;
      const el = element('article', 'songcard pr-hint-card pr-study-card');
      el.dataset.hint = hint;
      const heading = element('h3', 'pr-hint-name');
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'pr-chord-toggle';
      toggle.dataset.hintControl = `${id}:toggle`;
      toggle.textContent = title;
      const detail = element('div', 'pr-study-detail');
      detail.id = `pr-study-detail-${encodeURIComponent(id)}`;
      toggle.setAttribute('aria-controls', detail.id);
      heading.append(toggle);
      const lines = summary.map((line, i) => element('p', i === 0 ? 'pr-hint-formula' : 'pr-hint-detail', line));
      el.append(heading, ...lines, element('p', 'pr-hint-cue', cue), detail);
      const setOpen = (open: boolean) => {
        detail.hidden = !open;
        el.classList.toggle('pr-study-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        if (open) {
          detail.replaceChildren(build());
          appendReference(detail, id);
        } else detail.replaceChildren();
      };
      toggles.set(hint, setOpen);
      setOpen(options.study.open[topic] === hint);
      toggle.addEventListener('click', () => {
        options.stop();
        const previous = options.study.open[topic];
        if (previous) toggles.get(previous)?.(false);
        options.study.open[topic] = previous === hint ? null : hint;
        if (options.study.open[topic]) setOpen(true);
      });
      contents.append(el);
    };
    if (topic === 'prog') {
      for (const hint of PROGRESSION_HINTS) {
        const title = text(`pr_hints_p_${hint.cue}_title`);
        const chords = progressionHintChords(hint, tonic);
        const names = chords.map(({ root, symbol }) => rootName(root, tonic, hint.minor) + (symbol === 'maj' ? '' : symbol));
        const romans = chords.map(chord => chord.roman).join('–');
        appendStudy(hint.name, title, [romans, names.join(' – ')], text(`pr_hints_p_${hint.cue}`),
          () => renderProgressionStudy(hint, tonic, title, names, options, options.study));
      }
    } else {
      for (const hint of TECHNIQUE_HINTS) {
        const pitch = techniqueHintTonic(hint, options.tonic);
        const spelling = techniqueTonicSpelling(hint.kind, pitch);
        const namedTonics = hint.namedTonics?.map(key => rootName(key)) ?? [];
        const title = text(`pr_hints_t_${hint.id}_title`, ...namedTonics);
        const tonicName = spell(spelling.letter, spelling.acc);
        appendStudy(hint.id, title, [tonicName], text(`pr_hints_t_${hint.id}`, ...namedTonics),
          () => renderTechniqueStudy(hint, pitch, `${title} · ${tonicName}`, options, options.study));
      }
    }
  } else {
    contents.append(element('p', 'pr-hint-method', text('pr_hints_melody_cue')));
  }
  box.replaceChildren(contents);
  if (focused) [...box.querySelectorAll<HTMLButtonElement>('button')].find(button => button.dataset.hintControl === focused)?.focus({ preventScroll: true });
}

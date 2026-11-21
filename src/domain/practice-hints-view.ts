import {
  CHORD_HINTS, SCALE_HINTS, PROGRESSION_HINTS, TECHNIQUE_HINTS, MELODY_HINTS, PRACTICE_HINT_REFERENCES,
  chordHintSteps, chordHintTones, melodyHintExample, progressionHintChords, progressionHintSteps,
  scaleHintFormula, scaleHintSteps, scaleHintTones, techniqueHintSteps, techniqueHintTonic, type PracticeHintDiagram, type PracticeHintStep,
} from './practice-hints.js';
import { createChordHintDiagrams } from './chord-hint-diagrams.js';
import { renderGrandStaff } from './grand-staff.js';
import { createHintKeyboard } from './hint-keyboard.js';
import { control, element } from './practice-hint-dom.js';
import { renderProgressionStudy, renderTechniqueStudy, type StudyHintOptions, type StudyHintState } from './practice-study-view.js';
import { SR_LET, type SrToken } from './score-types.js';
import { techniqueSpellDegree, techniqueTonicSpelling, type TechniqueHand } from './technique.js';
import { keyFifths, spellMidi } from './theory.js';

export type PracticeHintsTopic = 'chord' | 'scale' | 'prog' | 'technique' | 'melody';

export function isPracticeHintsTopic(topic: string): topic is PracticeHintsTopic {
  return topic === 'chord' || topic === 'scale' || topic === 'prog' || topic === 'technique' || topic === 'melody';
}

interface HintViewOptions extends StudyHintOptions {
  readonly tonic: number | null;
  readonly chordName: (symbol: string) => string;
  readonly scaleName: (name: string) => string;
  readonly study: StudyHintState;
  readonly openExample: (id: string) => void;
}

function card(id: string, title: string, cue?: string, formula?: string, visuals?: HTMLElement) {
  const article = element('article', 'songcard pr-hint-card');
  article.dataset.hint = id;
  article.append(element('h3', 'pr-hint-name', title));
  if (formula) article.append(element('p', 'pr-hint-formula', formula));
  if (visuals) article.append(visuals);
  if (cue) article.append(element('p', 'pr-hint-cue', cue));
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
    controls.append(control(`${id}:hear`, text('rdn_listen'), title, disabled, () => play(id, steps, !audioOnly, diagram)));
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
  const studyToggles = new Map<string, (open: boolean) => void>();
  function appendStudy(el: HTMLElement, kind: 'prog' | 'technique', hint: string, title: string, build: () => HTMLElement) {
    const id = `${kind}:${hint}`;
    const heading = el.querySelector('h3');
    const detail = element('div', 'pr-study-detail');
    detail.id = `pr-study-detail-${encodeURIComponent(id)}`;
    const setOpen = (open: boolean) => {
      detail.hidden = !open;
      el.classList.toggle('pr-study-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      if (open) detail.replaceChildren(build());
      else detail.replaceChildren();
    };
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'pr-study-toggle';
    toggle.textContent = title;
    toggle.dataset.hintControl = `${id}:toggle`;
    toggle.setAttribute('aria-controls', detail.id);
    toggle.addEventListener('click', () => {
      options.stop();
      const previous = options.study.open[kind];
      if (previous) studyToggles.get(previous)?.(false);
      options.study.open[kind] = previous === hint ? null : hint;
      if (options.study.open[kind]) setOpen(true);
    });
    heading?.replaceChildren(toggle);
    el.classList.add('pr-study-card');
    el.append(detail);
    studyToggles.set(hint, setOpen);
    setOpen(options.study.open[kind] === hint);
  }
  box.classList.toggle('pr-chord-groups', topic !== 'melody');
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
      const visuals = element('div', 'pr-hint-visuals');
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
    const groups = new Map([['three', 'cadences'], ['pop', 'popular'], ['blues', 'forms']]);
    let grid = element('div', 'pr-hint-grid');
    for (const hint of PROGRESSION_HINTS) {
      const group = groups.get(hint.cue);
      if (group) grid = appendGroup(text(`pr_hints_prog_group_${group}`));
      const title = text(`pr_hints_p_${hint.cue}_title`);
      const chords = progressionHintChords(hint, tonic);
      const sequence = element('ol', 'pr-progression-sequence');
      sequence.setAttribute('role', 'list');
      const names = chords.map(({ root, symbol }) => rootName(root, tonic, hint.minor) + (symbol === 'maj' ? '' : symbol));
      const columns = chords.map(({ roman }, i) => {
        const item = element('li', 'pr-progression-chord');
        item.append(element('span', 'pr-progression-degree', roman), element('strong', 'pr-progression-name', names[i]));
        return item;
      });
      sequence.append(...columns);
      const el = card(hint.name, title, text(`pr_hints_p_${hint.cue}`), undefined, sequence);
      let current: HTMLElement | undefined;
      const diagram: PracticeHintDiagram = {
        followWithoutDock: true,
        paint(key) {
          const next = key === undefined ? undefined : columns[Number(key)];
          if (current === next) return;
          current?.removeAttribute('aria-current');
          next?.setAttribute('aria-current', 'step');
          current = next;
        },
      };
      const id = `prog:${hint.name}`;
      appendPlayback(el, id, title, progressionHintSteps(hint, tonic), diagram);
      appendStudy(el, 'prog', hint.name, title, () => renderProgressionStudy(hint, tonic, title, names, options, options.study));
      appendReference(el, id);
      grid.append(el);
    }
  } else if (topic === 'technique') {
    let grid = appendGroup(text('cat_scale'));
    for (const hint of TECHNIQUE_HINTS) {
      if (hint.id === 'arp_major') grid = appendGroup(text('pr_hints_technique_arpeggios'));
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
        const keyboard = createHintKeyboard(ascending[0].midi, ascending.map(note => note.midi));
        const description = `${title} · ${tonicName} · ${handName}`;
        keyboard.draw(ascending.map((note, i) => ({ ...note, tonic: i === 0 || i === ascending.length - 1 })),
          text('pr_hints_chord_keyboard', description, fingers.textContent ?? ''));
        const diagram: PracticeHintDiagram = {
          paint(_key, sounding = []) {
            keyboard.paint(new Set(sounding.map(note => note.midi)));
          },
        };
        const visuals = element('div', 'pr-hint-visuals pr-hint-hand');
        const actions = element('div', 'pr-hint-actions');
        actions.append(control(id, text('rdn_listen'), description, disabled, () => play(id, steps, true, diagram)));
        visuals.append(element('h4', 'pr-hint-hand-title', handName), keyboard.svg, fingers, actions);
        el.append(visuals);
      }
      appendStudy(el, 'technique', hint.id, title, () => renderTechniqueStudy(hint, pitch, `${title} · ${tonicName}`, options, options.study));
      appendReference(el, `technique:${hint.id}`);
      grid.append(el);
    }
  } else {
    contents.append(element('p', 'pr-hint-method', text('pr_hints_melody_cue')));
    for (const [i, hint] of MELODY_HINTS.entries()) {
      const id = `melody:${hint.id}`;
      const title = text('pr_hints_melody_example', String(i + 1));
      const el = card(hint.id, title);
      const answer = element('div', 'pr-melody-answer');
      answer.id = `pr-melody-answer-${hint.id}`;
      answer.hidden = true;
      const { notes, steps, fifths } = melodyHintExample(hint, tonic);
      let positions: Element[] = [];
      let active: number | undefined;
      const diagram: PracticeHintDiagram = {
        followWithoutDock: true,
        paint(key, sounding = []) {
          if (active !== undefined) positions[active]?.removeAttribute('data-s');
          active = sounding.length && key !== undefined ? Number(key) : undefined;
          if (active !== undefined) positions[active]?.setAttribute('data-s', 'now');
        },
      };
      const actions = element('div', 'pr-hint-actions');
      const reveal = control(`${id}:notes`, text('pr_hints_melody_show_notes'), title, false, () => {
        if (answer.hidden && !positions.length) {
          const tokens: SrToken[] = notes.map(({ li, acc, oct, beats }) =>
            [`${SR_LET[li]}${acc > 0 ? '#' : acc < 0 ? 'b' : ''}${oct}`, beats]);
          const score = renderGrandStaff({ ts: [4, 4], keyN: fifths, rh: tokens, compact: true, engrave: 2 },
            undefined, { namesVisible: false, notation: 'letter' });
          answer.innerHTML = score.svg;
          const names = notes.map(({ li, acc }) => spell(li, acc)).join(' · ');
          const svg = answer.querySelector('svg');
          svg?.setAttribute('role', 'img');
          svg?.setAttribute('aria-label', `${text('rdx_clef_treble')} · ${title} · ${names}`);
          positions = [...answer.querySelectorAll('.ss-n')];
          if (active !== undefined) positions[active]?.setAttribute('data-s', 'now');
          answer.append(element('p', 'pr-hint-detail', names));
        }
        answer.hidden = !answer.hidden;
        const label = text(answer.hidden ? 'pr_hints_melody_show_notes' : 'pr_hints_melody_hide_notes');
        reveal.textContent = label;
        reveal.setAttribute('aria-label', `${label} — ${title}`);
        reveal.setAttribute('aria-expanded', String(!answer.hidden));
      });
      reveal.setAttribute('aria-controls', answer.id);
      reveal.setAttribute('aria-expanded', 'false');
      actions.append(control(`${id}:hear`, text('rdn_listen'), title, disabled, () => play(id, steps, false, diagram)), reveal);
      el.append(actions, answer);
      contents.append(el);
    }
  }
  box.replaceChildren(contents);
  if (focused) [...box.querySelectorAll<HTMLButtonElement>('button')].find(button => button.dataset.hintControl === focused)?.focus({ preventScroll: true });
}

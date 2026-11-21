import { hintSvg } from './hint-diagram-svg.js';
import { control, element } from './practice-hint-dom.js';
import {
  progressionHintResolution, progressionHintSteps, progressionHintVoicings, techniqueHintSteps,
  type PracticeHintDiagram, type PracticeHintStep, type ProgressionHint, type TechniqueHint,
} from './practice-hints.js';
import { paintStudyKeys, progressionStudyStaffs, showStudyKeyboard, techniqueStudyStaff } from './practice-study-diagrams.js';
import { techniqueSpellDegree, type TechniqueHand, type TechniqueNote } from './technique.js';

export interface StudyHintOptions {
  readonly text: (key: string, ...args: string[]) => string;
  readonly spell: (letter: number, accidental: number) => string;
  readonly play: (id: string, steps: readonly PracticeHintStep[], keys: boolean, diagram?: PracticeHintDiagram) => void;
  readonly stop: () => void;
  readonly disabled: boolean;
  readonly audioOnly: boolean;
}

export interface StudyHintState {
  readonly open: Record<'prog' | 'technique', string | null>;
  readonly chords: Map<string, number>;
  hand: TechniqueHand;
}

export function renderProgressionStudy(
  hint: ProgressionHint, tonic: number, title: string, names: readonly string[], options: StudyHintOptions, state: StudyHintState,
): HTMLElement {
  const { text, spell, play, audioOnly, disabled } = options;
  const id = `prog:${hint.name}`;
  const voicings = progressionHintVoicings(hint, tonic);
  const resolution = progressionHintResolution(hint, tonic);
  const bass = voicings.map(({ bass }) => spell(bass.li, bass.acc));
  const label = (i: number) => text('pr_hints_prog_chord_bass', `${voicings[i].roman} ${names[i]}`, bass[i]);
  const rows = progressionStudyStaffs(voicings, voicings.map((_, i) => label(i)));
  const section = element('div', 'pr-study-layout');
  const staffGroup = element('div', 'pr-study-staves');
  staffGroup.append(...rows);
  const chords = element('div', 'pr-study-chords');
  const keyboard = hintSvg('pr-study-keyboard', '0 0 1 1');
  const keyboardTitle = element('p', 'pr-hint-detail pr-study-keyboard-title');
  const columns = [...staffGroup.querySelectorAll('[data-study-chord]')];

  const selection = voicings.map(({ roman }, index) => control(
    `${id}:chord:${index}`, `${roman} ${names[index]}`, text('pr_hints_prog_bar', String(index + 1), title), disabled, () => {
      state.chords.set(hint.name, index);
      diagram.paint();
      play(`${id}:chord:${index}`, progressionHintSteps(hint, tonic, index), !audioOnly, diagram);
    }));
  chords.append(...selection);
  const actions = element('div', 'pr-hint-actions');
  const listen = (part: 'full' | 'bass' | 'resolution', key: string, dock: boolean, controlId: string) =>
    control(`${id}:study:${controlId}`, text(key), title, disabled,
      () => play(`${id}:${part}`, progressionHintSteps(hint, tonic, part), dock, diagram));
  actions.append(listen('full', 'pr_hints_prog_hear', !audioOnly, 'hear'), listen('bass', 'pr_hints_prog_hear_bass', !audioOnly, 'bass'));
  if (audioOnly) actions.append(listen('full', 'pr_hints_show_keys', true, 'keys'));
  const resolutionText = element('p', 'pr-hint-detail pr-study-resolution');
  if (resolution.length) {
    actions.append(listen('resolution', 'pr_hints_prog_hear_resolution', !audioOnly, 'resolution'));
    const [from, to] = resolution;
    resolutionText.textContent = from.map((note, i) => `${spell(note.li, note.acc)} → ${spell(to[i].li, to[i].acc)}`).join(' · ');
  }

  let last: string | undefined;
  const diagram: PracticeHintDiagram = {
    followWithoutDock: true,
    paint(diagramKey, sounding = []) {
      const key = diagramKey ?? String(state.chords.get(hint.name) ?? 0);
      if (last !== key) {
        const chordIndex = Number(key);
        const chord = voicings[chordIndex];
        const notes = chord
          ? [{ ...chord.bass, tonic: true }, ...chord.upper.map(tone => ({ ...tone, tonic: tone.degree === 1 }))]
          : resolution[Number(key.split(':')[1])].map(note => ({ ...note, tonic: false }));
        const description = chord ? label(chordIndex) : resolutionText.textContent;
        keyboardTitle.textContent = description;
        showStudyKeyboard(keyboard, notes, text('pr_hints_chord_keyboard', description, notes.map(note => spell(note.li, note.acc) + note.oct).join(' · ')));
        for (const [i, button] of selection.entries()) button.setAttribute('aria-pressed', String(i === chordIndex));
        resolutionText.classList.toggle('pr-study-playing', !chord);
        last = key;
      }
      const active = new Set(sounding.map(note => note.midi));
      for (const column of columns) {
        const selected = column.getAttribute('data-study-chord') === key;
        column.classList.toggle('pr-study-selected', selected);
        column.querySelectorAll('.pr-study-note').forEach(note =>
          note.classList.toggle('pr-study-playing', selected && active.has(Number(note.getAttribute('data-midi')))));
      }
      paintStudyKeys(keyboard, diagramKey === undefined ? [] : sounding);
    },
  };
  diagram.paint();
  const visual = element('div', 'pr-study-visuals');
  const keys = element('div', 'pr-study-keyboard-wrap');
  keys.append(keyboardTitle, keyboard);
  visual.append(staffGroup, keys);
  section.append(actions, chords, visual);
  if (resolution.length) section.append(resolutionText);
  return section;
}

export function renderTechniqueStudy(
  hint: TechniqueHint, tonic: number, title: string, options: StudyHintOptions, state: StudyHintState,
): HTMLElement {
  const { text, spell, play, stop, disabled } = options;
  const id = `technique:${hint.id}`;
  const section = element('div', 'pr-study-layout');
  const hands = element('div', 'pr-hint-actions');
  const demo = element('div', 'pr-study-layout');
  const handChoices = ['rh', 'lh'] as const;
  const handLabel = (hand: TechniqueHand) => text(`tq_h_${hand}`);
  const handButtons = handChoices.map(hand => control(`${id}:hand:${hand}`, handLabel(hand), title, false, () => {
    if (state.hand === hand) return;
    stop();
    state.hand = hand;
    render();
  }));
  hands.append(...handButtons);
  section.append(hands, demo);

  function render() {
    const { hand } = state;
    handButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(handChoices[i] === hand)));
    const { ascending, fragment, run, fragmentSteps, runSteps } = techniqueHintSteps(hint, tonic, hand);
    const label = (note: TechniqueNote) => {
      const name = techniqueSpellDegree(hint.kind, tonic, note.degree);
      return `${spell(name.letter, name.acc)}(${note.finger})`;
    };
    const fingers = element('p', 'pr-hint-detail pr-hint-fingers');
    for (const [i, note] of ascending.entries()) {
      if (i) fingers.append(' · ');
      fingers.append(fragment.includes(note) ? element('strong', 'pr-hint-focus', label(note)) : label(note));
    }
    const visual = element('div', 'pr-study-visuals');
    const staves = element('div', 'pr-study-staves');
    const keyboard = hintSvg('pr-study-keyboard pr-technique-keyboard', '0 0 1 1');
    const makeStaff = (notes: readonly TechniqueNote[], start: number, direction: 'up' | 'down') => {
      const heading = text(`pr_hints_technique_${direction}`);
      staves.append(element('p', 'pr-hint-detail pr-study-direction', heading),
        techniqueStudyStaff(notes, start, hint.kind, tonic, hand, fragment, `${handLabel(hand)} · ${heading} · ${notes.map(label).join(' · ')}`));
    };
    makeStaff(ascending, 0, 'up');
    makeStaff(run.slice(ascending.length), ascending.length, 'down');
    const description = `${title} · ${handLabel(hand)}`;
    showStudyKeyboard(keyboard, ascending.map((note, i) => ({ ...note, tonic: i === 0 || i === ascending.length - 1 })),
      text('pr_hints_chord_keyboard', description, ascending.map(label).join(' · ')));
    const positions = [...staves.querySelectorAll('[data-study-step]')];
    const diagram: PracticeHintDiagram = {
      followWithoutDock: true,
      paint(diagramKey, sounding = []) {
        for (const [i, note] of positions.entries()) {
          note.classList.toggle('pr-study-playing', sounding.length > 0 && diagramKey === String(i));
        }
        paintStudyKeys(keyboard, sounding);
      },
    };

    const actions = element('div', 'pr-hint-actions');
    actions.append(
      control(`${id}:fragment`, text('pr_hints_technique_hear_passage'), description, disabled,
        () => play(`${id}:${hand}:fragment`, fragmentSteps, true, diagram)),
      control(`${id}:full`, text('pr_hints_technique_hear_run'), description, disabled,
        () => play(`${id}:${hand}:full`, runSteps, true, diagram)));
    const keyboardWrap = element('div', 'pr-study-keyboard-wrap');
    keyboardWrap.append(keyboard, fingers);
    visual.append(staves, keyboardWrap);
    demo.replaceChildren(actions, visual);
  }

  render();
  return section;
}

import {
  CHORD_HINTS, CHORD_HINT_FAMILIES, SCALE_HINTS, SCALE_HINT_FAMILIES, PROGRESSION_HINTS, TECHNIQUE_HINTS, MELODY_HINTS,
  chordHintInversionCount, chordHintTones, chordSingleSteps,
  melodyHintExample, progressionHintChords, progressionHintSteps,
  scaleHintFormula, scaleHintTones, scaleSingleSteps, techniqueHintSteps, techniqueHintTonic,
  type PracticeHintDiagram,
} from './practice-hints.js';
import { createChordHintDiagrams } from './chord-hint-diagrams.js';
import { renderGrandStaff } from './grand-staff.js';
import { createHintKeyboard } from './hint-keyboard.js';
import { control, element, playControl, segmentedControl } from './practice-hint-dom.js';
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
}

function buildCardHeader(title: string, formula?: string, playButton?: HTMLButtonElement) {
  const hd = element('div', 'pr-hint-hd');
  const main = element('div', 'pr-hint-hd-main');
  main.append(element('h3', 'pr-hint-name', title));
  if (formula) main.append(element('p', 'pr-hint-formula', formula));
  hd.append(main);
  if (playButton) hd.append(playButton);
  return hd;
}

function buildCard(id: string, title: string, formula?: string, playButton?: HTMLButtonElement, visuals?: HTMLElement, cue?: string) {
  const article = element('article', 'songcard pr-hint-card');
  article.dataset.hint = id;
  article.append(buildCardHeader(title, formula, playButton));
  if (visuals) article.append(visuals);
  if (cue) article.append(element('p', 'pr-hint-cue', cue));
  return article;
}

export function renderPracticeHintCards(box: HTMLElement, topic: PracticeHintsTopic, options: HintViewOptions): void {
  const { text, spell, play, chordName, scaleName, disabled, audioOnly } = options;
  const tonic = options.tonic ?? 0;
  const listenLabel = text('rdn_listen');
  const stopLabel = text('pr_hints_stop');
  const active = document.activeElement;
  const focused = active instanceof HTMLElement && box.contains(active) ? active.dataset.hintControl : undefined;
  const rootName = (root: number, key = root, minor = false) => {
    const note = spellMidi(60 + root, keyFifths(key, minor), minor);
    return spell(note.li, note.acc);
  };
  const contents = document.createDocumentFragment();
  const contextLabel = options.tonic !== null
    ? text('pr_hints_tonic_active', rootName(options.tonic))
    : topic === 'technique'
      ? text('pr_hints_tonic_groups')
      : text('pr_hints_tonic_default', rootName(0));
  const contextBadge = element('p', 'pr-hints-context', contextLabel);
  if (topic !== 'chord' && topic !== 'scale') contents.append(contextBadge);

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
  const buildChordCard = (symbol: string) => {
    const id = `chord:${symbol}`;
    const invCount = chordHintInversionCount(symbol);
    let currentInv = Math.max(0, Math.min(options.study.inversions.get(symbol) ?? 0, invCount - 1));
    const rootTones = chordHintTones(symbol, tonic, 0);
    const tonicName = spell(rootTones[0].li, rootTones[0].acc);
    const symbolName = tonicName + (symbol === 'maj' ? '' : symbol);
    const title = `${symbolName} · ${chordName(symbol)}`;
    const voicings = Array.from({ length: invCount }, (_, inv) => ({
      symbol: `${symbol}:${inv}`,
      title: inv === 0 ? symbolName : `${symbolName} (${text(`pr_hints_inv_${inv}`)})`,
      tones: inv === 0 ? rootTones : chordHintTones(symbol, tonic, inv),
    }));
    const diagrams = createChordHintDiagrams(voicings, currentInv, spell, text);
    const visuals = element('div', 'pr-hint-stage pr-chord-visuals');
    const staves = element('div', 'pr-chord-staves');
    for (const { clef, svg } of diagrams.staves) {
      const staff = element('div', 'pr-chord-staff-block');
      staff.append(element('p', 'pr-chord-clef-label', text(`rdx_clef_${clef}`)), svg);
      staves.append(staff);
    }
    visuals.append(diagrams.keyboard, staves);
    const playBtn = playControl(`${id}:hear`, listenLabel, stopLabel, title, disabled,
      () => play(id, chordSingleSteps(symbol, tonic, currentInv), false, diagrams, `${id}:hear`));
    const el = buildCard(symbol, title, rootTones.map(tone => tone.label).join(' '), playBtn, visuals);
    el.classList.add('pr-chord-card');
    el.append(diagrams.caption);
    const foot = element('div', 'pr-hint-foot');
    foot.append(segmentedControl(
      `${text('pr_hints_inv_group')} — ${title}`,
      Array.from({ length: invCount }, (_, inv) => ({
        value: inv,
        id: `${id}:inv:${inv}`,
        label: text(`pr_hints_inv_${inv}`),
        ariaLabel: `${text(`pr_hints_inv_${inv}_full`)} — ${title}`,
      })),
      currentInv,
      inv => {
        if (currentInv === inv) return;
        options.stop();
        currentInv = inv;
        options.study.inversions.set(symbol, inv);
        diagrams.setInversion(inv);
      },
    ));
    el.append(foot);
    return el;
  };

  const buildScaleCard = (name: string) => {
    const hint = SCALE_HINTS.find(item => item.name === name) ?? SCALE_HINTS[0];
    const title = `${rootName(tonic)} · ${scaleName(hint.name)}`;
    const id = `scale:${hint.name}`;
    let currentHand: TechniqueHand = options.study.scaleHands.get(hint.name) ?? 'rh';
    const baseTones = scaleHintTones(hint.name, tonic);
    const names = baseTones.map(tone => spell(tone.li, tone.acc)).join(' · ');
    const keyboard = createHintKeyboard(baseTones[0].midi, baseTones.map(tone => tone.midi));
    const visuals = element('div', 'pr-hint-stage pr-hint-visuals');
    visuals.append(keyboard.svg);
    const caption = element('p', 'pr-hint-detail pr-chord-caption', names);
    const drawScale = (hand: TechniqueHand) => {
      const fingered = scaleHintTones(hint.name, tonic, hand);
      const label = text('pr_hints_chord_keyboard', `${scaleName(hint.name)} · ${text(`tq_h_${hand}`)}`, names);
      keyboard.draw(fingered, label);
    };
    drawScale(currentHand);
    const diagram: PracticeHintDiagram = {
      followWithoutDock: true,
      paint(_rawKey, sounding = []) {
        keyboard.paint(new Set(sounding.map(note => note.midi)));
      },
    };
    const playBtn = playControl(`${id}:hear`, listenLabel, stopLabel, title, disabled,
      () => play(id, scaleSingleSteps(hint.name, tonic), false, diagram, `${id}:hear`));
    const el = buildCard(hint.name, title, scaleHintFormula(hint), playBtn, visuals);
    el.classList.add('pr-scale-card');
    el.append(caption);
    const foot = element('div', 'pr-hint-foot');
    foot.append(segmentedControl(
      `${text('pr_hints_hand_group')} — ${title}`,
      (['rh', 'lh'] as const).map(hand => ({
        value: hand,
        id: `${id}:hand:${hand}`,
        label: text(`pr_hints_hand_${hand}_short`),
        ariaLabel: `${text(`tq_h_${hand}`)} — ${title}`,
      })),
      currentHand,
      hand => {
        if (currentHand === hand) return;
        options.stop();
        currentHand = hand;
        options.study.scaleHands.set(hint.name, hand);
        drawScale(hand);
      },
    ));
    el.append(foot);
    return el;
  };

  const renderFamilyTabs = (kind: 'chord' | 'scale') => {
    const families = kind === 'chord'
      ? CHORD_HINT_FAMILIES.map(f => ({ id: f.id, label: text(`pr_hints_chord_family_${f.id}`), items: f.symbols }))
      : SCALE_HINT_FAMILIES.map(f => ({ id: f.id, label: text(`pr_hints_scale_family_${f.id}`), items: f.names }));
    const totalCount = kind === 'chord' ? CHORD_HINTS.length : SCALE_HINTS.length;
    const validFamilies = new Set<string>(['all', ...families.map(f => f.id)]);
    let activeFamily = options.study.family[kind];
    if (!validFamilies.has(activeFamily)) {
      activeFamily = families[0].id;
      options.study.family[kind] = activeFamily;
    }

    const topBar = element('div', 'pr-family-bar');
    topBar.append(contextBadge);
    const tabBar = element('div', 'pr-family-tabs');
    tabBar.setAttribute('role', 'group');
    tabBar.setAttribute('aria-label', text(`pr_hints_${kind}_title`));
    const tabs: readonly { id: string; label: string; count: number }[] = [
      ...families.map(f => ({ id: f.id, label: f.label, count: f.items.length })),
      { id: 'all', label: text('pr_hints_family_all'), count: totalCount },
    ];
    for (const tab of tabs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pr-family-tab';
      btn.dataset.hintFamily = tab.id;
      btn.dataset.hintControl = `family:${kind}:${tab.id}`;
      btn.setAttribute('aria-pressed', String(activeFamily === tab.id));
      btn.append(document.createTextNode(`${tab.label} `), element('span', 'pr-family-tab-count', `(${tab.count})`));
      btn.addEventListener('click', () => {
        if (options.study.family[kind] === tab.id) return;
        options.stop();
        options.study.family[kind] = tab.id;
        renderPracticeHintCards(box, topic, options);
      });
      tabBar.append(btn);
    }
    topBar.append(tabBar);
    contents.append(topBar);

    const buildCardFor = (itemId: string) => (kind === 'chord' ? buildChordCard(itemId) : buildScaleCard(itemId));
    if (activeFamily === 'all') {
      for (const family of families) {
        const section = element('section', 'pr-chord-group');
        const grid = element('div', 'pr-hint-grid pr-family-grid');
        for (const itemId of family.items) grid.append(buildCardFor(itemId));
        section.append(element('h2', 'pr-chord-group-title', family.label), grid);
        contents.append(section);
      }
    } else {
      const selected = families.find(f => f.id === activeFamily) ?? families[0];
      const section = element('section', 'pr-chord-group');
      const grid = element('div', 'pr-hint-grid pr-family-grid');
      for (const itemId of selected.items) grid.append(buildCardFor(itemId));
      section.append(element('h2', 'pr-chord-group-title', selected.label), grid);
      contents.append(section);
    }
  };

  box.classList.toggle('pr-chord-groups', topic !== 'melody');
  if (topic === 'chord' || topic === 'scale') {
    renderFamilyTabs(topic);
  } else if (topic === 'prog') {
    const groups = new Map([['three', 'cadences'], ['pop', 'popular'], ['blues', 'forms']]);
    let grid = element('div', 'pr-hint-grid');
    for (const hint of PROGRESSION_HINTS) {
      const group = groups.get(hint.cue);
      if (group) grid = appendGroup(text(`pr_hints_prog_group_${group}`));
      const title = text(`pr_hints_p_${hint.cue}_title`);
      const chords = progressionHintChords(hint, tonic);
      const stage = element('div', 'pr-hint-stage');
      const sequence = element('ol', `pr-progression-sequence${chords.length === 12 ? ' pr-progression-grid-12' : ''}`);
      sequence.setAttribute('role', 'list');
      const names = chords.map(({ root, symbol }) => rootName(root, tonic, hint.minor) + (symbol === 'maj' ? '' : symbol));
      const columns = chords.map(({ roman }, i) => {
        const item = element('li', 'pr-progression-chord');
        item.append(element('span', 'pr-progression-degree', roman), element('strong', 'pr-progression-name', names[i]));
        return item;
      });
      sequence.append(...columns);
      stage.append(sequence);
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
      const playBtn = playControl(`${id}:hear`, listenLabel, stopLabel, title, disabled,
        () => play(id, progressionHintSteps(hint, tonic), !audioOnly, diagram, `${id}:hear`));
      const keyLabel = rootName(tonic, tonic, hint.minor) + (hint.minor ? 'm' : '');
      const el = buildCard(hint.name, title, keyLabel, playBtn, stage, text(`pr_hints_p_${hint.cue}`));
      if (audioOnly) {
        const foot = element('div', 'pr-hint-foot');
        const keysBtn = control(`${id}:keys`, text('pr_hints_show_keys'), title, disabled,
          () => play(id, progressionHintSteps(hint, tonic), true, diagram, `${id}:keys`));
        keysBtn.setAttribute('aria-pressed', 'false');
        keysBtn.dataset.labelPlay = `${text('pr_hints_show_keys')} — ${title}`;
        keysBtn.dataset.labelStop = `${stopLabel} — ${title}`;
        foot.append(keysBtn);
        el.append(foot);
      }
      appendStudy(el, 'prog', hint.name, title, () => renderProgressionStudy(hint, tonic, title, names, options, options.study));
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
      const el = buildCard(hint.id, title, tonicName, undefined, undefined, text(`pr_hints_t_${hint.id}`, ...namedTonics));
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
          followWithoutDock: true,
          paint(_key, sounding = []) {
            keyboard.paint(new Set(sounding.map(note => note.midi)));
          },
        };
        const handBox = element('div', 'pr-hint-hand');
        const handHeader = element('div', 'pr-hint-hand-hd');
        const playBtn = playControl(id, listenLabel, stopLabel, description, disabled, () => play(id, steps, true, diagram, id));
        handHeader.append(element('h4', 'pr-hint-hand-title', handName), playBtn);
        const stage = element('div', 'pr-hint-stage pr-hint-visuals');
        stage.append(keyboard.svg);
        handBox.append(handHeader, stage, fingers);
        el.append(handBox);
      }
      appendStudy(el, 'technique', hint.id, title, () => renderTechniqueStudy(hint, pitch, `${title} · ${tonicName}`, options, options.study));
      grid.append(el);
    }
  } else {
    contents.append(element('p', 'pr-hint-method', text('pr_hints_melody_cue')));
    for (const [i, hint] of MELODY_HINTS.entries()) {
      const id = `melody:${hint.id}`;
      const title = text('pr_hints_melody_example', String(i + 1));
      const answer = element('div', 'pr-hint-stage pr-melody-answer');
      answer.id = `pr-melody-answer-${hint.id}`;
      answer.hidden = true;
      const { notes, steps, fifths } = melodyHintExample(hint, tonic);
      let positions: Element[] = [];
      let activeIndex: number | undefined;
      const diagram: PracticeHintDiagram = {
        followWithoutDock: true,
        paint(key, sounding = []) {
          if (activeIndex !== undefined) positions[activeIndex]?.removeAttribute('data-s');
          activeIndex = sounding.length && key !== undefined ? Number(key) : undefined;
          if (activeIndex !== undefined) positions[activeIndex]?.setAttribute('data-s', 'now');
        },
      };
      const playBtn = playControl(`${id}:hear`, listenLabel, stopLabel, title, disabled,
        () => play(id, steps, false, diagram, `${id}:hear`));
      const el = buildCard(
        hint.id,
        title,
        text('pr_hints_melody_notes_count', String(notes.length)),
        playBtn,
        undefined,
        text(`pr_hints_melody_cue_${hint.id}`),
      );
      const foot = element('div', 'pr-hint-foot');
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
          if (activeIndex !== undefined) positions[activeIndex]?.setAttribute('data-s', 'now');
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
      foot.append(reveal);
      el.append(foot, answer);
      contents.append(el);
    }
  }
  box.replaceChildren(contents);
  if (focused) [...box.querySelectorAll<HTMLButtonElement>('button')].find(button => button.dataset.hintControl === focused)?.focus({ preventScroll: true });
}

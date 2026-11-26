import {
  ARPEGGIO_HINTS, CHORD_HINTS, CHORD_HINT_FAMILIES, MELODY_HINTS, PROGRESSION_HINTS, PROGRESSION_HINT_FAMILIES,
  SCALE_HINTS, SCALE_HINT_FAMILIES,
  arpeggioHintSteps, arpeggioHintTones, chordHintInTier, chordHintInversionCount, chordHintTones, chordSingleSteps,
  melodyHintExample, progressionHintChords, progressionHintSteps, progressionHintVoicings,
  scaleHintFormula, scaleHintTones, scaleSingleSteps,
  type ArpeggioHint, type ChordHintTier, type MelodyHintDifficulty, type PracticeHintDiagram, type ProgressionHint,
} from './practice-hints.js';
import { createChordHintDiagrams } from './chord-hint-diagrams.js';
import { renderGrandStaff } from './grand-staff.js';
import { createHintKeyboard, hintSvg } from './hint-keyboard.js';
import { control, element, playControl, segmentedControl } from './practice-hint-dom.js';
import { renderProgressionStudy, type StudyHintOptions, type StudyHintState } from './practice-study-view.js';
import { SR_LET, type SrToken } from './score-types.js';
import { keyFifths, spellMidi } from './theory.js';

export type PracticeHintsTopic = 'chord' | 'scale' | 'prog' | 'technique' | 'melody';

export function isPracticeHintsTopic(topic: string): topic is PracticeHintsTopic {
  return topic === 'chord' || topic === 'scale' || topic === 'prog' || topic === 'technique' || topic === 'melody';
}

interface HintViewOptions extends StudyHintOptions {
  readonly tonic: number | null;
  readonly chordName: (symbol: string) => string;
  readonly formatChord?: (root: string, symbol: string) => string;
  readonly scaleName: (name: string) => string;
  readonly study: StudyHintState;
  readonly chordTier?: ChordHintTier;
  readonly scaleTier?: 'core' | 'modes' | 'all';
  readonly melodyDiff?: MelodyHintDifficulty;
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

function buildMelodyContour(notes: readonly { readonly midi: number; readonly degree: number }[], label: string) {
  const wrap = element('div', 'pr-hint-stage pr-melody-contour-stage');
  const width = 240, height = 58, padX = 20, padY = 12;
  const minMidi = Math.min(...notes.map(n => n.midi));
  const maxMidi = Math.max(...notes.map(n => n.midi));
  const span = Math.max(1, maxMidi - minMidi);
  const stepX = notes.length > 1 ? (width - padX * 2) / (notes.length - 1) : 0;
  const pts = notes.map((note, i) => ({
    x: padX + i * stepX,
    y: height - padY - ((note.midi - minMidi) / span) * (height - padY * 2),
    degree: note.degree,
  }));
  const svg = hintSvg('pr-melody-contour', `0 0 ${width} ${height}`);
  svg.setAttribute('aria-label', label);
  const polyPoints = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const dots = pts.map((p, i) =>
    `<g class="pr-contour-node" data-contour-step="${i}"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5"/></g>`).join('');
  svg.innerHTML = `<polyline class="pr-contour-line" points="${polyPoints}" fill="none"/>${dots}`;

  const degreeBar = element('ol', 'pr-melody-degrees');
  degreeBar.setAttribute('role', 'list');
  const degreeChips = pts.map((p, i) => {
    const li = element('li', 'pr-melody-deg', String(p.degree));
    li.dataset.contourDeg = String(i);
    return li;
  });
  degreeBar.append(...degreeChips);
  wrap.append(svg, degreeBar);

  const nodes = [...svg.querySelectorAll('[data-contour-step]')];
  let activeIndex: number | undefined;
  const highlight = (index?: number) => {
    if (activeIndex !== undefined) {
      nodes[activeIndex]?.removeAttribute('data-s');
      degreeChips[activeIndex]?.removeAttribute('data-s');
    }
    activeIndex = index;
    if (activeIndex !== undefined) {
      nodes[activeIndex]?.setAttribute('data-s', 'now');
      degreeChips[activeIndex]?.setAttribute('data-s', 'now');
    }
  };
  return { wrap, highlight };
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
    : text('pr_hints_tonic_default', rootName(0));
  const contextBadge = element('p', 'pr-hints-context', contextLabel);
  const formatChord = options.formatChord ?? ((root: string, symbol: string) => symbol === 'maj' ? root : root + symbol);

  const makeTabBar = (
    kind: 'chord' | 'scale' | 'prog' | 'melody',
    ariaLabel: string,
    tabs: readonly { id: string; label: string; count: number }[],
    activeTab: string,
    onSelect: (id: string) => void,
  ) => {
    const tabBar = element('div', 'pr-family-tabs');
    tabBar.setAttribute('role', 'group');
    tabBar.setAttribute('aria-label', ariaLabel);
    for (const tab of tabs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pr-family-tab';
      btn.dataset.hintFamily = tab.id;
      btn.dataset.hintControl = `family:${kind}:${tab.id}`;
      btn.setAttribute('aria-pressed', String(activeTab === tab.id));
      btn.append(document.createTextNode(`${tab.label} `), element('span', 'pr-family-tab-count', `(${tab.count})`));
      btn.addEventListener('click', () => {
        if (activeTab === tab.id) return;
        options.stop();
        onSelect(tab.id);
      });
      tabBar.append(btn);
    }
    return tabBar;
  };

  const buildChordCard = (symbol: string) => {
    const id = `chord:${symbol}`;
    const invCount = chordHintInversionCount(symbol);
    let currentInv = Math.max(0, Math.min(options.study.inversions.get(symbol) ?? 0, invCount - 1));
    const rootTones = chordHintTones(symbol, tonic, 0);
    const tonicName = spell(rootTones[0].li, rootTones[0].acc);
    const symbolName = formatChord(tonicName, symbol);
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
    const rhTones = scaleHintTones(hint.name, tonic, 'rh');
    const lhTones = scaleHintTones(hint.name, tonic, 'lh');
    const names = rhTones.map(tone => spell(tone.li, tone.acc)).join(' · ');
    const keyboard = createHintKeyboard(rhTones[0].midi, rhTones.map(tone => tone.midi));
    const visuals = element('div', 'pr-hint-stage pr-hint-visuals pr-scale-stage');
    visuals.append(keyboard.svg);
    const caption = element('p', 'pr-hint-detail pr-chord-caption', names);
    const rhFingers = rhTones.map(t => t.finger ?? '-').join(' ');
    const lhFingers = lhTones.map(t => t.finger ?? '-').join(' ');
    const label = text('pr_hints_chord_keyboard', `${scaleName(hint.name)} · ${text('tq_h_rh')} (${rhFingers}) · ${text('tq_h_lh')} (${lhFingers})`, names);
    const dualTones = rhTones.map((tone, i) => ({
      midi: tone.midi,
      tonic: tone.tonic,
      fingerRh: tone.finger,
      fingerLh: lhTones[i]?.finger,
    }));
    keyboard.draw(dualTones, label);
    const diagram: PracticeHintDiagram = {
      followWithoutDock: true,
      paint(_rawKey, sounding = []) {
        keyboard.paint(new Set(sounding.map(note => note.midi)));
      },
    };
    const playBtn = playControl(`${id}:hear`, listenLabel, stopLabel, title, disabled,
      () => play(id, scaleSingleSteps(hint.name, tonic, 'rh'), false, diagram, `${id}:hear`));
    const el = buildCard(hint.name, title, scaleHintFormula(hint), playBtn, visuals);
    el.classList.add('pr-scale-card');
    el.append(caption);
    return el;
  };

  const buildArpeggioCard = (arp: ArpeggioHint) => {
    const arpTitle = text(`pr_hints_arp_${arp.id}`);
    const minor = arp.id === 'arpMinor';
    const title = `${rootName(tonic, tonic, minor)} · ${arpTitle}`;
    const id = `scale:${arp.id}`;
    const tones = arpeggioHintTones(arp.id, tonic);
    const names = tones.map(tone => spell(tone.li, tone.acc)).join(' · ');
    const keyboard = createHintKeyboard(tones[0].midi, tones.map(tone => tone.midi));
    const visuals = element('div', 'pr-hint-stage pr-hint-visuals pr-scale-stage');
    visuals.append(keyboard.svg);
    const caption = element('p', 'pr-hint-detail pr-chord-caption', names);
    const rhFingers = tones.map(t => t.fingerRh).join(' ');
    const lhFingers = tones.map(t => t.fingerLh).join(' ');
    const label = text('pr_hints_chord_keyboard', `${arpTitle} · ${text('tq_h_rh')} (${rhFingers}) · ${text('tq_h_lh')} (${lhFingers})`, names);
    keyboard.draw(tones.map(tone => ({
      midi: tone.midi,
      tonic: tone.tonic,
      fingerRh: tone.fingerRh,
      fingerLh: tone.fingerLh,
    })), label);
    const diagram: PracticeHintDiagram = {
      followWithoutDock: true,
      paint(_rawKey, sounding = []) {
        keyboard.paint(new Set(sounding.map(note => note.midi)));
      },
    };
    const playBtn = playControl(`${id}:hear`, listenLabel, stopLabel, title, disabled,
      () => play(id, arpeggioHintSteps(arp.id, tonic), false, diagram, `${id}:hear`));
    const el = buildCard(arp.id, title, arp.formula, playBtn, visuals);
    el.classList.add('pr-scale-card', 'pr-arp-card');
    el.append(caption);
    return el;
  };

  box.classList.add('pr-chord-groups');

  if (topic === 'chord') {
    const requestedTier: ChordHintTier = options.chordTier ?? 'all';
    const effectiveTier: ChordHintTier = options.study.chordShowAll ? 'all' : requestedTier;
    const families = CHORD_HINT_FAMILIES
      .map(f => ({
        id: f.id,
        label: text(`pr_hints_chord_family_${f.id}`),
        items: f.symbols.filter(sym => chordHintInTier(sym, effectiveTier)),
      }))
      .filter(f => f.items.length > 0);
    const totalCount = families.reduce((sum, f) => sum + f.items.length, 0);
    const validFamilies = new Set<string>(['all', ...families.map(f => f.id)]);
    let activeFamily = options.study.family.chord;
    if (!validFamilies.has(activeFamily)) {
      activeFamily = effectiveTier === 'triads' ? 'all' : families[0].id;
      options.study.family.chord = activeFamily;
    }

    const topBar = element('div', 'pr-family-bar');
    const metaRow = element('div', 'pr-family-meta');
    const tierLabel = requestedTier === 'triads'
      ? text('pr_ch_triads')
      : requestedTier === 'sevenths'
        ? text('pr_ch_sevenths')
        : text('pr_ch_all');
    const badgeText = requestedTier !== 'all' && !options.study.chordShowAll
      ? `${contextLabel} · ${tierLabel}`
      : contextLabel;
    metaRow.append(element('p', 'pr-hints-context', badgeText));
    if (requestedTier !== 'all') {
      const toggleAll = document.createElement('button');
      toggleAll.type = 'button';
      toggleAll.className = 'pr-hints-filter-btn';
      toggleAll.dataset.hintControl = 'chord:tier-toggle';
      toggleAll.textContent = options.study.chordShowAll
        ? text('pr_hints_chord_filter_tier', tierLabel)
        : text('pr_hints_chord_show_all', String(CHORD_HINTS.length));
      toggleAll.addEventListener('click', () => {
        options.stop();
        options.study.chordShowAll = !options.study.chordShowAll;
        renderPracticeHintCards(box, topic, options);
      });
      metaRow.append(toggleAll);
    }
    topBar.append(metaRow);
    const tabs = [
      ...families.map(f => ({ id: f.id, label: f.label, count: f.items.length })),
      { id: 'all', label: text('pr_hints_family_all'), count: totalCount },
    ];
    topBar.append(makeTabBar('chord', text('pr_hints_chord_title'), tabs, activeFamily, (id) => {
      options.study.family.chord = id;
      renderPracticeHintCards(box, topic, options);
    }));
    contents.append(topBar);

    if (activeFamily === 'all') {
      for (const family of families) {
        const section = element('section', 'pr-chord-group');
        const grid = element('div', 'pr-hint-grid pr-chord-grid');
        for (const sym of family.items) grid.append(buildChordCard(sym));
        section.append(element('h2', 'pr-chord-group-title', family.label), grid);
        contents.append(section);
      }
    } else {
      const selected = families.find(f => f.id === activeFamily) ?? families[0];
      const section = element('section', 'pr-chord-group');
      const grid = element('div', 'pr-hint-grid pr-chord-grid');
      for (const sym of selected.items) grid.append(buildChordCard(sym));
      section.append(element('h2', 'pr-chord-group-title', selected.label), grid);
      contents.append(section);
    }
  } else if (topic === 'scale' || topic === 'technique') {
    const scaleFamilies = SCALE_HINT_FAMILIES.map(f => ({
      id: f.id as string,
      label: text(`pr_hints_scale_family_${f.id}`),
      kind: 'scale' as const,
      items: f.names,
    }));
    const arpeggioGroup = {
      id: 'arpeggios',
      label: text('pr_hints_technique_arpeggios'),
      kind: 'arpeggio' as const,
      items: ARPEGGIO_HINTS.map(a => a.id),
    };
    const families = [scaleFamilies[0], arpeggioGroup, ...scaleFamilies.slice(1)];
    const totalCount = SCALE_HINTS.length + ARPEGGIO_HINTS.length;
    const validFamilies = new Set<string>(['all', ...families.map(f => f.id)]);
    let activeFamily = options.study.family.scale;
    if (!validFamilies.has(activeFamily)) {
      activeFamily = 'core';
      options.study.family.scale = activeFamily;
    }

    const topBar = element('div', 'pr-family-bar');
    const metaRow = element('div', 'pr-family-meta');
    metaRow.append(contextBadge);
    const legend = element('div', 'pr-hand-legend');
    const rhPill = element('span', 'pr-hand-pill pr-hand-pill-rh', text('pr_hints_rh_badge'));
    const lhPill = element('span', 'pr-hand-pill pr-hand-pill-lh', text('pr_hints_lh_badge'));
    legend.append(rhPill, lhPill);
    metaRow.append(legend);
    topBar.append(metaRow);

    const tabs = [
      ...families.map(f => ({ id: f.id, label: f.label, count: f.items.length })),
      { id: 'all', label: text('pr_hints_family_all'), count: totalCount },
    ];
    topBar.append(makeTabBar('scale', text('pr_hints_scale_title'), tabs, activeFamily, (id) => {
      options.study.family.scale = id;
      renderPracticeHintCards(box, topic, options);
    }));
    contents.append(topBar);

    const appendGroupCards = (group: (typeof families)[number]) => {
      const section = element('section', 'pr-chord-group');
      const grid = element('div', 'pr-hint-grid pr-scale-grid');
      if (group.kind === 'arpeggio') {
        for (const arp of ARPEGGIO_HINTS) grid.append(buildArpeggioCard(arp));
      } else {
        for (const name of group.items) grid.append(buildScaleCard(name));
      }
      section.append(element('h2', 'pr-chord-group-title', group.label), grid);
      contents.append(section);
    };

    if (activeFamily === 'all') {
      for (const group of families) appendGroupCards(group);
    } else {
      const selected = families.find(f => f.id === activeFamily) ?? families[0];
      appendGroupCards(selected);
    }
  } else if (topic === 'prog') {
    const families = PROGRESSION_HINT_FAMILIES.map(f => ({
      id: f.id,
      label: text(`pr_hints_prog_tab_${f.id}`),
      items: f.names.map(name => PROGRESSION_HINTS.find(h => h.name === name)!).filter(Boolean),
    }));
    const validFamilies = new Set<string>(['all', ...families.map(f => f.id)]);
    let activeFamily = options.study.family.prog;
    if (!validFamilies.has(activeFamily)) {
      activeFamily = 'popular';
      options.study.family.prog = activeFamily;
    }

    const topBar = element('div', 'pr-family-bar');
    topBar.append(contextBadge);
    const tabs = [
      ...families.map(f => ({ id: f.id, label: f.label, count: f.items.length })),
      { id: 'all', label: text('pr_hints_family_all'), count: PROGRESSION_HINTS.length },
    ];
    topBar.append(makeTabBar('prog', text('pr_hints_prog_title'), tabs, activeFamily, (id) => {
      options.study.family.prog = id;
      renderPracticeHintCards(box, topic, options);
    }));
    contents.append(topBar);

    const studyToggles = new Map<string, (open: boolean) => void>();
    const buildProgCard = (hint: ProgressionHint) => {
      const title = text(`pr_hints_p_${hint.cue}_title`);
      const chords = progressionHintChords(hint, tonic);
      const voicings = progressionHintVoicings(hint, tonic);
      const names = chords.map(({ root, symbol }) => formatChord(rootName(root, tonic, hint.minor), symbol));
      const id = `prog:${hint.name}`;
      const stage = element('div', 'pr-hint-stage pr-prog-stage');
      const sequence = element('ol', `pr-progression-sequence${chords.length === 12 ? ' pr-progression-grid-12' : ''}`);
      sequence.setAttribute('role', 'list');

      let selectedStep = Math.max(0, Math.min(options.study.chords.get(hint.name) ?? 0, voicings.length - 1));
      const allMidis = voicings.flatMap(v => [v.bass.midi, ...v.upper.map(t => t.midi)]);
      const keyboard = createHintKeyboard(voicings[selectedStep].bass.midi, allMidis);
      const drawStepOnKeyboard = (index: number) => {
        const v = voicings[index] ?? voicings[0];
        const stepTones = [
          { midi: v.bass.midi, tonic: true },
          ...v.upper.map(t => ({ midi: t.midi, tonic: t.degree === 1 })),
        ];
        keyboard.svg.dataset.chordRoot = String(((v.bass.midi % 12) + 12) % 12);
        const stepDesc = `${v.roman} ${names[index]}`;
        keyboard.draw(stepTones, text('pr_hints_chord_keyboard', stepDesc, stepTones.map(t => String(t.midi)).join(' ')), undefined, true);
      };
      drawStepOnKeyboard(selectedStep);

      let currentStepEl: HTMLElement | undefined;
      const buttons: HTMLButtonElement[] = [];
      const columns = chords.map(({ roman }, i) => {
        const item = element('li', 'pr-progression-chord');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pr-progression-chord-btn';
        btn.dataset.hintControl = `${id}:step:${i}`;
        btn.setAttribute('aria-pressed', String(i === selectedStep));
        btn.append(element('span', 'pr-progression-degree', roman), element('strong', 'pr-progression-name', names[i]));
        btn.addEventListener('click', () => {
          selectedStep = i;
          options.study.chords.set(hint.name, i);
          buttons.forEach((b, bi) => b.setAttribute('aria-pressed', String(bi === i)));
          drawStepOnKeyboard(i);
          play(`${id}:step:${i}`, progressionHintSteps(hint, tonic, i), !audioOnly, diagram, `${id}:step:${i}`);
        });
        buttons.push(btn);
        item.append(btn);
        return item;
      });
      sequence.append(...columns);
      stage.append(sequence, keyboard.svg);

      const diagram: PracticeHintDiagram = {
        followWithoutDock: true,
        paint(key, sounding = []) {
          const idx = key !== undefined && /^\d+$/.test(key) ? Number(key) : undefined;
          const next = idx === undefined ? undefined : columns[idx];
          if (currentStepEl !== next) {
            currentStepEl?.removeAttribute('aria-current');
            next?.setAttribute('aria-current', 'step');
            currentStepEl = next;
          }
          if (idx !== undefined && voicings[idx]) {
            selectedStep = idx;
            buttons.forEach((b, bi) => b.setAttribute('aria-pressed', String(bi === idx)));
            drawStepOnKeyboard(idx);
          }
          keyboard.paint(new Set(sounding.map(n => n.midi)));
        },
      };

      const playBtn = playControl(`${id}:hear`, listenLabel, stopLabel, title, disabled,
        () => play(id, progressionHintSteps(hint, tonic), !audioOnly, diagram, `${id}:hear`));
      const keyLabel = formatChord(rootName(tonic, tonic, hint.minor), hint.minor ? 'm' : '');
      const el = buildCard(hint.name, title, keyLabel, playBtn, stage, text(`pr_hints_p_${hint.cue}`));
      el.classList.add('pr-study-card', 'pr-prog-card');

      const detail = element('div', 'pr-study-detail');
      detail.id = `pr-study-detail-${encodeURIComponent(id)}`;
      const studyBtn = document.createElement('button');
      studyBtn.type = 'button';
      studyBtn.className = 'btn ghost sm pr-study-btn';
      studyBtn.dataset.hintControl = `${id}:toggle`;
      studyBtn.setAttribute('aria-controls', detail.id);
      const setOpen = (open: boolean) => {
        detail.hidden = !open;
        el.classList.toggle('pr-study-open', open);
        studyBtn.setAttribute('aria-expanded', String(open));
        studyBtn.textContent = text(open ? 'pr_hints_prog_hide_study' : 'pr_hints_prog_show_study');
        if (open) detail.replaceChildren(renderProgressionStudy(hint, tonic, title, names, options, options.study));
        else detail.replaceChildren();
      };
      studyBtn.addEventListener('click', () => {
        options.stop();
        const previous = options.study.open.prog;
        if (previous) studyToggles.get(previous)?.(false);
        options.study.open.prog = previous === hint.name ? null : hint.name;
        if (options.study.open.prog) setOpen(true);
      });
      studyToggles.set(hint.name, setOpen);

      const foot = element('div', 'pr-hint-foot');
      if (audioOnly) {
        const keysBtn = control(`${id}:keys`, text('pr_hints_show_keys'), title, disabled,
          () => play(id, progressionHintSteps(hint, tonic), true, diagram, `${id}:keys`));
        keysBtn.setAttribute('aria-pressed', 'false');
        keysBtn.dataset.labelPlay = `${text('pr_hints_show_keys')} — ${title}`;
        keysBtn.dataset.labelStop = `${stopLabel} — ${title}`;
        foot.append(keysBtn);
      }
      foot.append(studyBtn);
      el.append(foot, detail);
      setOpen(options.study.open.prog === hint.name);
      return el;
    };

    if (activeFamily === 'all') {
      const section = element('section', 'pr-chord-group');
      const grid = element('div', 'pr-hint-grid pr-prog-grid');
      for (const hint of PROGRESSION_HINTS) grid.append(buildProgCard(hint));
      section.append(grid);
      contents.append(section);
    } else {
      const selected = families.find(f => f.id === activeFamily) ?? families[0];
      const section = element('section', 'pr-chord-group');
      const grid = element('div', 'pr-hint-grid pr-prog-grid');
      for (const hint of selected.items) grid.append(buildProgCard(hint));
      section.append(element('h2', 'pr-chord-group-title', selected.label), grid);
      contents.append(section);
    }
  } else {
    // Melodies (on keys): 3-step method strip + difficulty tabs + visual contour & degrees + reveal keyboard & staff.
    const diffs: readonly { id: MelodyHintDifficulty; label: string; items: readonly (typeof MELODY_HINTS)[number][] }[] = [
      { id: 'easy', label: text('pr_mel_easy'), items: MELODY_HINTS.filter(h => h.difficulty === 'easy') },
      { id: 'medium', label: text('pr_mel_medium'), items: MELODY_HINTS.filter(h => h.difficulty === 'medium') },
      { id: 'advanced', label: text('pr_mel_advanced'), items: MELODY_HINTS.filter(h => h.difficulty === 'advanced') },
    ];
    const validDiffs = new Set<string>(['all', ...diffs.map(d => d.id)]);
    let activeDiff = options.study.family.melody;
    if (!validDiffs.has(activeDiff)) {
      activeDiff = options.melodyDiff ?? 'easy';
      options.study.family.melody = activeDiff;
    }

    const topBar = element('div', 'pr-family-bar');
    topBar.append(contextBadge);
    const stepsGuide = element('ol', 'pr-melody-steps');
    for (const stepNum of [1, 2, 3] as const) {
      const li = element('li', 'pr-melody-step');
      li.append(element('strong', 'pr-melody-step-t', text(`pr_hints_melody_step_${stepNum}_t`)),
        element('span', 'pr-melody-step-d', text(`pr_hints_melody_step_${stepNum}_d`)));
      stepsGuide.append(li);
    }
    topBar.append(stepsGuide);
    const tabs = [
      ...diffs.map(d => ({ id: d.id, label: d.label, count: d.items.length })),
      { id: 'all', label: text('pr_hints_family_all'), count: MELODY_HINTS.length },
    ];
    topBar.append(makeTabBar('melody', text('pr_hints_melody_title'), tabs, activeDiff, (id) => {
      options.study.family.melody = id;
      renderPracticeHintCards(box, topic, options);
    }));
    contents.append(topBar);

    const buildMelodyCard = (hint: (typeof MELODY_HINTS)[number]) => {
      const id = `melody:${hint.id}`;
      const title = text(`pr_hints_melody_title_${hint.id}`);
      const { notes, steps, fifths } = melodyHintExample(hint, tonic);
      const diffLabel = text(`pr_mel_${hint.difficulty}`);
      const meta = `${diffLabel} · ${text('pr_hints_melody_notes_count', String(notes.length))}`;
      const contour = buildMelodyContour(notes, `${title} · ${notes.map(n => n.degree).join('–')}`);

      const answer = element('div', 'pr-hint-stage pr-melody-answer');
      answer.id = `pr-melody-answer-${hint.id}`;
      answer.hidden = true;
      let positions: Element[] = [];
      let answerKeyboard: ReturnType<typeof createHintKeyboard> | null = null;
      let activeIndex: number | undefined;

      const diagram: PracticeHintDiagram = {
        followWithoutDock: true,
        paint(key, sounding = []) {
          if (activeIndex !== undefined) positions[activeIndex]?.removeAttribute('data-s');
          activeIndex = sounding.length && key !== undefined ? Number(key) : undefined;
          contour.highlight(activeIndex);
          if (activeIndex !== undefined) positions[activeIndex]?.setAttribute('data-s', 'now');
          answerKeyboard?.paint(new Set(sounding.map(n => n.midi)));
        },
      };
      const playBtn = playControl(`${id}:hear`, listenLabel, stopLabel, title, disabled,
        () => play(id, steps, false, diagram, `${id}:hear`));
      const el = buildCard(hint.id, title, meta, playBtn, contour.wrap, text(`pr_hints_melody_cue_${hint.id}`));
      el.classList.add('pr-melody-card');

      const foot = element('div', 'pr-hint-foot');
      const reveal = control(`${id}:notes`, text('pr_hints_melody_show_notes'), title, false, () => {
        if (answer.hidden && !positions.length) {
          const midis = notes.map(n => n.midi);
          const uniqueMidis = new Map<number, boolean>();
          for (const n of notes) uniqueMidis.set(n.midi, uniqueMidis.get(n.midi) || n.degree === 1);
          const kb = createHintKeyboard(notes[0].midi, midis);
          const names = notes.map(({ li, acc }) => spell(li, acc)).join(' · ');
          kb.draw([...uniqueMidis.entries()].map(([midi, isTonic]) => ({ midi, tonic: isTonic })),
            text('pr_hints_chord_keyboard', title, names));
          answerKeyboard = kb;

          const tokens: SrToken[] = notes.map(({ li, acc, oct, beats }) =>
            [`${SR_LET[li]}${acc > 0 ? '#' : acc < 0 ? 'b' : ''}${oct}`, beats]);
          const score = renderGrandStaff({ ts: [4, 4], keyN: fifths, rh: tokens, compact: true, engrave: 2 },
            undefined, { namesVisible: false, notation: 'letter' });
          const staffBox = element('div', 'pr-melody-staff-wrap');
          staffBox.innerHTML = score.svg;
          const svg = staffBox.querySelector('svg');
          svg?.setAttribute('role', 'img');
          svg?.setAttribute('aria-label', `${text('rdx_clef_treble')} · ${title} · ${names}`);
          positions = [...staffBox.querySelectorAll('.ss-n')];
          if (activeIndex !== undefined) positions[activeIndex]?.setAttribute('data-s', 'now');
          answer.append(kb.svg, staffBox, element('p', 'pr-hint-detail pr-chord-caption', names));
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
      return el;
    };

    const itemsToShow = activeDiff === 'all'
      ? MELODY_HINTS
      : (diffs.find(d => d.id === activeDiff)?.items ?? MELODY_HINTS);
    const section = element('section', 'pr-chord-group');
    const grid = element('div', 'pr-hint-grid pr-melody-grid');
    for (const hint of itemsToShow) grid.append(buildMelodyCard(hint));
    section.append(grid);
    contents.append(section);
  }

  box.replaceChildren(contents);
  if (focused) [...box.querySelectorAll<HTMLButtonElement>('button')].find(button => button.dataset.hintControl === focused)?.focus({ preventScroll: true });
}

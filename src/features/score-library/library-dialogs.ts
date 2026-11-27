import type { ImportedDifficultyEstimate } from '../../domain/score-difficulty-import.js';
import type { LibraryHost, LibraryItem, LibraryStudyStatus } from '../../domain/score-library-types.js';
import { libraryGet, libraryUpdate } from '../../domain/score-library-store.js';
import type { LibraryTextKey } from '../../locales/library-runtime.js';
import {
  AXES, parseEnteredTempo, referenceTempo, type DifficultyRange,
} from './library-query.js';

export type LibraryValues = Record<string, string | number>;
export type LibraryTranslator = (key: LibraryTextKey, values?: LibraryValues) => string;

// eslint-disable-next-line no-undef -- TypeScript DOM map; not a runtime global.
export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function starNumber(locale: string, stars: number): string {
  return stars.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function starLabel(locale: string, stars: number): string {
  return `${starNumber(locale, stars)}★`;
}

export function starGraphic(locale: string, stars: number): HTMLElement {
  const result = element('span', 'score-library-star-score');
  const value = element('span', 'score-library-rating-number');
  value.textContent = starNumber(locale, stars);
  const graphic = element('span', 'score-library-star-graphic');
  graphic.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 5; index++) {
    const star = element('span', 'score-library-star');
    star.textContent = '☆';
    const fill = element('span', 'score-library-star-fill');
    fill.textContent = '★';
    const tenths = Math.min(10, Math.max(0, Math.round(stars * 10) - index * 10));
    fill.style.clipPath = `inset(0 ${100 - 10 * tenths}% 0 0)`;
    star.append(fill);
    graphic.append(star);
  }
  result.append(value, graphic);
  return result;
}

export interface DifficultyRangeControl {
  readonly controls: HTMLDivElement;
  read(): DifficultyRange | null;
  clear(): void;
  sync(busy: boolean): void;
  localize(locale: string, t: LibraryTranslator): void;
}

export function createDifficultyRange(id: string, onChange: () => void): DifficultyRangeControl {
  const controls = element('div', 'score-library-rating-range');
  const endpoints = (['min', 'max'] as const).map((bound) => {
    const label = element('label');
    const text = element('span');
    const input = element('select');
    input.id = `${id}-${bound}`;
    for (const value of ['', ...Array.from({ length: 41 }, (_, i) => String((i + 10) / 10))]) {
      const option = element('option');
      option.value = value;
      input.append(option);
    }
    label.append(text, input);
    controls.append(label);
    input.addEventListener('change', onChange);
    return { bound, text, input };
  });
  const [min, max] = endpoints.map(({ input }) => input);
  return {
    controls,
    read(): DifficultyRange | null {
      return min.value || max.value ? { min: Number(min.value || 1), max: Number(max.value || 5) } : null;
    },
    clear(): void { min.value = max.value = ''; },
    sync(busy: boolean): void {
      min.disabled = max.disabled = busy;
      for (const option of min.options) option.disabled = Boolean(option.value && max.value && +option.value > +max.value);
      for (const option of max.options) option.disabled = Boolean(option.value && min.value && +option.value < +min.value);
    },
    localize(locale: string, t: LibraryTranslator): void {
      for (const { bound, text, input } of endpoints) {
        text.textContent = t(`rating_filter_${bound}`);
        for (const option of input.options) option.textContent = option.value ? starNumber(locale, +option.value) : t('rating_filter_any');
      }
    },
  };
}

export interface LibraryEditor {
  form: HTMLFormElement;
  titleText: HTMLElement;
  composerText: HTMLElement;
  tagsText: HTMLElement;
  statusText: HTMLElement;
  statusOptions: { value: '' | LibraryStudyStatus; option: HTMLOptionElement }[];
  progressText: HTMLElement;
  notesText: HTMLElement;
  save: HTMLButtonElement;
  cancel: HTMLButtonElement;
  renderEstimate(): void;
  enableTempo(): void;
}

export interface EditorContext {
  readonly host: LibraryHost;
  readonly t: LibraryTranslator;
  readonly isBusy: () => boolean;
  readonly getItems: () => readonly LibraryItem[];
  readonly consumeOpenTempo: (id: string) => boolean;
  readonly saveRating: (id: string, result: ImportedDifficultyEstimate, focus: HTMLButtonElement, manualBpm?: number) => void;
  readonly run: (action: () => Promise<void>, errorKey?: LibraryTextKey) => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly notice: (key: LibraryTextKey, values?: LibraryValues) => void;
  readonly closeEditor: () => void;
  readonly isEditing: (id: string) => boolean;
  readonly render: () => void;
}

export function createLibraryEditor(
  id: string,
  item: LibraryItem,
  returnFocus: HTMLButtonElement,
  ctx: EditorContext,
): LibraryEditor {
  const { host, t } = ctx;
  const form = element('form', 'score-library-editor');
  const makeLabel = (control: HTMLElement): HTMLElement => {
    const label = element('label');
    const text = element('span');
    label.append(text, control);
    form.append(label);
    return text;
  };
  const makeField = (
    field: string,
    value: string,
    maxLength?: number,
    type: 'text' | 'number' = 'text',
  ): { text: HTMLElement; input: HTMLInputElement } => {
    const input = element('input');
    input.type = type;
    input.dataset.libraryField = field;
    input.value = value;
    if (maxLength) input.maxLength = maxLength;
    input.disabled = ctx.isBusy();
    return { text: makeLabel(input), input };
  };

  const titleField = makeField('title', item.title, 512);
  const composerField = makeField('composer', item.composer, 512);
  const estimatePanel = element('div', 'score-library-editor-actions');
  const estimate = element('button');
  const saveStars = element('button');
  const result = element('p');
  const tempoLabel = element('label');
  const tempoCopy = element('span');
  const tempo = element('input');
  tempo.inputMode = 'decimal';
  tempo.maxLength = 8;
  tempo.dataset.libraryField = 'difficulty-tempo';
  tempoLabel.append(tempoCopy, tempo);
  estimate.type = saveStars.type = 'button';
  estimate.dataset.libraryAction = 'estimate-difficulty';
  result.setAttribute('role', 'status');
  estimatePanel.append(estimate, saveStars, result, tempoLabel);
  form.append(estimatePanel);

  let difficulty: ImportedDifficultyEstimate | null = null;
  let estimating = false;
  let estimateFailed = false;
  let canSetTempo = ctx.consumeOpenTempo(id);
  let usedTempo: number | undefined;

  const refBpm = () => referenceTempo(ctx.getItems().find((it) => it.id === id));
  const enteredTempo = () => parseEnteredTempo(tempo.value);
  const ratedStars = () => {
    const bpm = enteredTempo();
    return difficulty && !difficulty.uncertainty.tempoFallback && bpm !== null &&
      (bpm || refBpm()) === usedTempo ? difficulty.difficultyStars : null;
  };
  const renderEstimate = () => {
    const busy = ctx.isBusy();
    const locale = host.language();
    estimate.textContent = t('estimate');
    estimate.disabled = busy || estimating || enteredTempo() === null;
    tempoLabel.hidden = !canSetTempo;
    tempoCopy.textContent = t('estimate_bpm');
    tempo.disabled = busy || estimating;
    const stars = ratedStars();
    const savedRating = ctx.getItems().find((it) => it.id === id)?.difficultyRating;
    saveStars.hidden = stars === null || (stars === savedRating?.stars && (!enteredTempo() || enteredTempo() === savedRating?.startingBpm));
    saveStars.disabled = busy;
    saveStars.textContent = stars === null ? '' : t('rating_save_one', { rating: starLabel(locale, stars) });
    const text: string[] = [];
    if (estimating) text.push(t('working'));
    else if (estimateFailed) text.push(t('estimate_failed'));
    else if (difficulty?.peak) {
      if (difficulty.difficultyStars !== null) {
        text.push(t('rating_summary', { rating: starNumber(locale, difficulty.difficultyStars) }));
      }
      text.push(t('estimate_result', { bars: difficulty.peak.writtenMeasures.join(', ') }));
      if (difficulty.uncertainty.tempoFallback) text.push(t('estimate_tempo_provisional'));
      if (difficulty.midi) text.push(t('estimate_midi'));
    }
    result.textContent = text.join(' ');
    result.hidden = !text.length;
  };
  const enableTempo = () => {
    canSetTempo = true;
    renderEstimate();
  };
  tempo.addEventListener('input', renderEstimate);
  saveStars.addEventListener('click', () => {
    const stars = ratedStars();
    if (stars !== null && difficulty) ctx.saveRating(id, difficulty, estimate, enteredTempo() || undefined);
  });
  estimate.addEventListener('click', async () => {
    const bpm = enteredTempo();
    if (ctx.isBusy() || estimating || bpm === null) return;
    usedTempo = bpm || refBpm();
    estimating = true;
    estimateFailed = false;
    difficulty = null;
    renderEstimate();
    try {
      const stored = await libraryGet(id);
      if (!stored) throw new Error('Score was removed');
      difficulty = await host.difficulty(stored.file, usedTempo);
      if (difficulty.uncertainty.tempoFallback) canSetTempo = true;
      estimateFailed = !difficulty.peak;
    } catch {
      estimateFailed = true;
    } finally {
      estimating = false;
      renderEstimate();
    }
  });

  const tagsField = makeField('tags', (item.tags ?? []).join(', '));
  const statusSelect = element('select');
  statusSelect.dataset.libraryField = 'status';
  statusSelect.disabled = ctx.isBusy();
  const statusOptions = (['', 'in_progress', 'mastered'] as const).map((value) => {
    const option = element('option');
    option.value = value;
    statusSelect.append(option);
    return { value, option };
  });
  statusSelect.value = item.status ?? '';
  const statusText = makeLabel(statusSelect);
  const progressField = makeField('progress', item.progress === undefined ? '' : String(item.progress), undefined, 'number');
  progressField.input.min = '0';
  progressField.input.max = '100';
  progressField.input.step = '1';
  const notesInput = element('textarea');
  notesInput.dataset.libraryField = 'notes';
  notesInput.rows = 2;
  notesInput.maxLength = 1000;
  notesInput.value = item.notes ?? '';
  notesInput.disabled = ctx.isBusy();
  const notesText = makeLabel(notesInput);
  const editorActions = element('div', 'score-library-editor-actions');
  const save = element('button');
  save.type = 'submit';
  save.dataset.libraryAction = 'save-edit';
  save.disabled = ctx.isBusy();
  const cancel = element('button');
  cancel.type = 'button';
  cancel.dataset.libraryAction = 'cancel-edit';
  cancel.disabled = ctx.isBusy();
  editorActions.append(save, cancel);
  form.append(editorActions);

  cancel.addEventListener('click', () => {
    if (ctx.isBusy()) return;
    ctx.closeEditor();
    ctx.render();
    returnFocus.focus();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (ctx.isBusy()) return;
    const tags = tagsField.input.value.split(',').map((part) => part.trim()).filter(Boolean);
    const rawProgress = progressField.input.value.trim();
    const parsedProgress = rawProgress === '' ? null : Math.max(0, Math.min(100, Math.round(Number(rawProgress))));
    const progress = parsedProgress !== null && Number.isNaN(parsedProgress) ? null : parsedProgress;
    const nextStatus = (statusSelect.value || null) as LibraryStudyStatus | null;
    const nextNotes = notesInput.value.trim() || null;
    void ctx.run(async () => {
      const updated = await libraryUpdate(id, {
        title: titleField.input.value.trim(),
        composer: composerField.input.value.trim(),
        tags,
        status: nextStatus,
        progress,
        notes: nextNotes,
      });
      if (!updated) throw new Error('missing');
      ctx.closeEditor();
      await ctx.refresh();
      ctx.notice('saved');
    }).then(() => { if (!ctx.isEditing(id) && returnFocus.isConnected) returnFocus.focus(); });
  });

  return {
    form,
    titleText: titleField.text,
    composerText: composerField.text,
    tagsText: tagsField.text,
    statusText,
    statusOptions,
    progressText: progressField.text,
    notesText,
    renderEstimate,
    enableTempo,
    save,
    cancel,
  };
}

export interface RatingDetailsDeps {
  readonly container: HTMLElement;
  readonly item: LibraryItem;
  readonly result: ImportedDifficultyEstimate | null | undefined;
  readonly locale: string;
  readonly busy: boolean;
  readonly t: LibraryTranslator;
  readonly onRequestEstimate: () => void;
  readonly onOpenTempo: () => void;
  readonly onSaveRating: (result: ImportedDifficultyEstimate) => void;
}

export function renderRatingDetailsPanel(deps: RatingDetailsDeps): void {
  const { container, item, result, locale, busy, t } = deps;
  container.replaceChildren();
  if (result === undefined) {
    container.textContent = t('working');
    deps.onRequestEstimate();
    return;
  }
  if (!result?.axisDifficulty) {
    container.textContent = t('rating_unavailable');
    return;
  }
  const axes = element('dl', 'score-library-axes');
  for (const axis of AXES) {
    const { stars, measures, drivers } = result.axisDifficulty[axis];
    const pair = element('div');
    const name = element('dt');
    const rating = element('dd');
    name.textContent = t(`rating_${axis}`);
    pair.title = `${t(`rating_${axis}`)}: ${t(`rating_${axis}_desc`)}`;
    rating.append(starGraphic(locale, stars));
    if (drivers.length) {
      const driverLine = element('small', 'score-library-drivers');
      driverLine.textContent = drivers.map((driver) => t(`rating_driver_${driver}` as LibraryTextKey)).join(' · ');
      rating.append(driverLine);
    }
    if (measures.length) {
      const bars = element('small');
      bars.textContent = t('rating_measures', { bars: [...new Set(measures)].join(', ') });
      rating.append(bars);
    }
    pair.append(name, rating);
    axes.append(pair);
  }
  container.append(axes);
  if (result.appliedEnduranceStars >= 0.1 || result.spanAlert) {
    const extras = element('div', 'score-library-rating-extras');
    if (result.appliedEnduranceStars >= 0.1) {
      const badge = element('span', 'score-library-extra-tag');
      badge.textContent = t('rating_endurance_bonus', { bonus: starNumber(locale, result.appliedEnduranceStars) });
      badge.title = t('rating_info_endurance');
      extras.append(badge);
    }
    if (result.spanAlert) {
      const spanTag = element('span', 'score-library-extra-tag');
      spanTag.textContent = t('rating_span_alert');
      extras.append(spanTag);
    }
    container.append(extras);
  }
  if (result.uncertainty.tempoSource === 'fallback') {
    const tempoRow = element('div', 'score-library-tempo-warning');
    const tempoNote = element('p', 'score-library-note');
    tempoNote.textContent = t('estimate_tempo_provisional');
    const setBpm = element('button', 'score-library-tempo-action');
    setBpm.type = 'button';
    setBpm.dataset.libraryAction = 'set-bpm';
    setBpm.disabled = busy;
    setBpm.textContent = t('estimate_set_bpm');
    setBpm.addEventListener('click', deps.onOpenTempo);
    tempoRow.append(tempoNote, setBpm);
    container.append(tempoRow);
  }
  if (result.midi) {
    const midiNote = element('p', 'score-library-note');
    midiNote.textContent = t('estimate_midi_details');
    container.append(midiNote);
  } else if (result.uncertainty.handSource === 'unassigned') {
    const handNote = element('p', 'score-library-note');
    handNote.textContent = t('estimate_unassigned_hands');
    container.append(handNote);
  }
  if (
    result.difficultyStars !== null &&
    !result.uncertainty.tempoFallback &&
    (result.difficultyStars !== item.difficultyRating?.stars || item.difficultyRating?.version !== 2)
  ) {
    const save = element('button');
    save.type = 'button';
    save.disabled = busy;
    save.textContent = t('rating_save_one', { rating: starLabel(locale, result.difficultyStars) });
    save.addEventListener('click', () => deps.onSaveRating(result));
    container.append(save);
  }
}

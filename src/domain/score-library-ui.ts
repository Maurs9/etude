import { ESTIMATOR_VERSION, type DifficultyAxis } from './score-difficulty.js';
import type { ImportedDifficultyEstimate } from './score-difficulty-import.js';
import type { LibraryController, LibraryDifficultyRating, LibraryHost, LibraryItem, LibraryStudyStatus, OpenedScoreEstimator } from './score-library-types.js';
import { libraryExport, libraryGet, libraryList, libraryRemove, libraryRemoveMany, libraryRestore, librarySave, libraryUpdate, libraryUpdateLevels } from './score-library-store.js';
import { libraryText, type LibraryTextKey } from '../locales/library-runtime.js';

const AXES: readonly DifficultyAxis[] = ['motor', 'rhythm', 'bimanual', 'texture', 'reading'];
const controllers = new WeakMap<HTMLElement, LibraryController>();
type Values = Record<string, string | number>;
// eslint-disable-next-line no-undef -- TypeScript DOM map; not a runtime global.
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = element('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Give browsers time to start reading the Blob before releasing its URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Controls and file inputs are created once. Refresh only reconciles library rows. */
export function initScoreLibrary(root: HTMLElement, host: LibraryHost): LibraryController {
  const existing = controllers.get(root);
  if (existing) return existing;
  const t = (key: LibraryTextKey, values?: Values): string => libraryText(host.language(), key, values);
  const details = element('details', 'score-library');
  details.id = 'score-library';
  const summary = element('summary');
  const content = element('div', 'score-library-content');
  const privacy = element('p', 'score-library-note');
  const toolbar = element('div', 'score-library-toolbar');
  const importLabel = element('label', 'score-library-picker');
  const importText = element('span');
  const files = element('input');
  files.id = 'library-files';
  files.type = 'file';
  files.multiple = true;
  files.accept = '.xml,.musicxml,.mxl,.mid,.midi';
  importLabel.append(importText, files);
  const searchLabel = element('label', 'score-library-search');
  const searchText = element('span');
  const search = element('input');
  search.id = 'library-search';
  search.type = 'search';
  search.autocomplete = 'off';
  searchLabel.append(searchText, search);
  const filterLabel = element('label', 'score-library-filter');
  const filterText = element('span');
  const filter = element('select');
  filter.id = 'library-filter';
  const viewKeys = ['all', 'in_progress', 'mastered', 'favorites', 'recent'] as const;
  const options = viewKeys.map(key => {
    const option = element('option');
    option.value = key;
    filter.append(option);
    return { key, option };
  });
  filterLabel.append(filterText, filter);
  const sortKeys = ['added', 'recent', 'title', 'composer', 'difficulty', 'difficulty_desc', 'progress_desc', 'progress_asc'] as const;
  const sortLabel = element('label', 'score-library-filter score-library-sort');
  const sortText = element('span');
  const sort = element('select');
  sort.id = 'library-sort';
  const sortOptions = sortKeys.map(key => {
    const option = element('option');
    option.value = key;
    sort.append(option);
    return { key, option };
  });
  sortLabel.append(sortText, sort);
  const composerLabel = element('label', 'score-library-filter');
  const composerText = element('span');
  const composerFilter = element('select');
  composerFilter.id = 'library-composer-filter';
  composerLabel.append(composerText, composerFilter);
  const tagLabel = element('label', 'score-library-filter');
  const tagText = element('span');
  const tagFilter = element('select');
  tagFilter.id = 'library-tag-filter';
  tagLabel.append(tagText, tagFilter);
  const groupLabel = element('label', 'score-library-filter');
  const groupText = element('span');
  const group = element('select');
  group.id = 'library-group';
  const groupOptions = (['none', 'status', 'composer', 'tag'] as const).map(key => {
    const option = element('option');
    option.value = key;
    group.append(option);
    return { key, option };
  });
  groupLabel.append(groupText, group);
  const tabsGroup = element('div', 'score-library-tabs');
  tabsGroup.setAttribute('role', 'group');
  const tabButtons = viewKeys.map(key => {
    const button = element('button', 'score-library-tab');
    button.type = 'button';
    button.dataset.libraryTab = key;
    button.setAttribute('aria-pressed', String(key === 'all'));
    tabsGroup.append(button);
    return { key, button };
  });
  const toggleFilters = element('button', 'score-library-toggle-filters');
  toggleFilters.id = 'library-toggle-filters';
  toggleFilters.type = 'button';
  toggleFilters.setAttribute('aria-expanded', 'false');
  toggleFilters.setAttribute('aria-controls', 'library-filters-panel');
  const resetFilters = element('button', 'score-library-reset');
  resetFilters.id = 'library-reset-filters';
  resetFilters.type = 'button';
  const toolbarMain = element('div', 'score-library-toolbar-main');
  toolbarMain.append(searchLabel, sortLabel, importLabel);
  const toolbarBarActions = element('div', 'score-library-toolbar-bar-actions');
  toolbarBarActions.append(toggleFilters);
  const toolbarBar = element('div', 'score-library-toolbar-bar');
  toolbarBar.append(tabsGroup, toolbarBarActions);
  const activeChips = element('div', 'score-library-active-chips');
  activeChips.id = 'library-active-chips';
  activeChips.hidden = true;
  const toolbarFilters = element('div', 'score-library-toolbar-filters');
  toolbarFilters.id = 'library-filters-panel';
  toolbarFilters.hidden = true;
  const difficultyFilters = element('div', 'score-library-difficulty-filters');
  const totalFilter = element('fieldset');
  const totalLegend = element('legend');
  totalFilter.append(totalLegend);
  const axisFilter = element('fieldset');
  const axisLegend = element('legend');
  const axisLabel = element('label');
  const axisLabelText = element('span');
  const axisSelect = element('select');
  axisSelect.id = 'library-difficulty-axis';
  const axisOptions = (['', ...AXES] as const).map(value => {
    const option = element('option');
    option.value = value;
    axisSelect.append(option);
    return { value, option };
  });
  axisLabel.append(axisLabelText, axisSelect);
  axisFilter.append(axisLegend, axisLabel);
  const totalRange = createDifficultyRange('library-difficulty-total');
  const axisRange = createDifficultyRange('library-difficulty-axis');
  totalFilter.append(totalRange.controls);
  axisFilter.append(axisRange.controls);
  difficultyFilters.append(totalFilter, axisFilter);
  toolbarFilters.append(filterLabel, composerLabel, tagLabel, groupLabel, difficultyFilters);
  toolbar.append(toolbarMain, toolbarBar, activeChips, toolbarFilters);
  const protection = element('p', 'score-library-note');
  protection.id = 'library-protection';
  const status = element('p', 'score-library-status');
  status.id = 'library-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  const corruptStatus = element('p', 'score-library-status');
  corruptStatus.setAttribute('role', 'status');
  corruptStatus.hidden = true;
  const failures = element('ul', 'score-library-note');
  failures.id = 'library-failures';
  failures.hidden = true;
  const bulkBar = element('div', 'score-library-bulk');
  const selectAllLabel = element('label', 'score-library-select-all');
  const selectAll = element('input');
  selectAll.id = 'library-select-all';
  selectAll.type = 'checkbox';
  const selectAllText = element('span');
  selectAllLabel.append(selectAll, selectAllText);
  const deleteSelected = element('button', 'score-library-delete-selected');
  deleteSelected.id = 'library-delete-selected';
  deleteSelected.type = 'button';
  deleteSelected.dataset.libraryAction = 'delete-selected';
  bulkBar.append(selectAllLabel, deleteSelected);
  const list = element('ul', 'score-library-list');
  list.id = 'library-items';
  const scroll = element('div', 'score-library-scroll');
  const columns = element('div', 'score-library-columns');
  const pieceHeading = element('span');
  const difficultyHead = element('div', 'score-library-difficulty-head');
  const difficultySort = element('button');
  difficultySort.type = 'button';
  difficultySort.id = 'library-sort-stars';
  const axesInfoToggle = element('button', 'score-library-axes-info-btn');
  axesInfoToggle.type = 'button';
  axesInfoToggle.id = 'library-axes-info-toggle';
  axesInfoToggle.textContent = 'ⓘ';
  axesInfoToggle.setAttribute('aria-controls', 'library-axes-info-panel');
  axesInfoToggle.setAttribute('aria-expanded', 'false');
  difficultyHead.append(difficultySort, axesInfoToggle);
  const axesInfoPanel = element('div', 'score-library-axes-info-panel');
  axesInfoPanel.id = 'library-axes-info-panel';
  axesInfoPanel.setAttribute('role', 'region');
  axesInfoPanel.tabIndex = -1;
  axesInfoPanel.hidden = true;
  const axesInfoList = element('dl', 'score-library-axes-guide');
  const axesInfoPairs = AXES.map(axis => {
    const pair = element('div'), dt = element('dt'), dd = element('dd');
    pair.append(dt, dd);
    axesInfoList.append(pair);
    return { axis, dt, dd };
  });
  const axesInfoSummary = element('p', 'score-library-axes-guide-note');
  axesInfoPanel.append(axesInfoList, axesInfoSummary);
  columns.append(pieceHeading, difficultyHead, axesInfoPanel);
  scroll.append(columns, list);
  const emptyBox = element('div', 'score-library-empty');
  emptyBox.hidden = true;
  const empty = element('p', 'score-library-note');
  emptyBox.append(empty);
  const transfer = element('div', 'score-library-transfer');
  const transferNote = element('p', 'score-library-note');
  const backup = element('button');
  backup.id = 'library-backup';
  backup.type = 'button';
  const restoreLabel = element('label', 'score-library-picker');
  const restoreText = element('span');
  const restore = element('input');
  restore.id = 'library-restore';
  restore.type = 'file';
  restore.accept = '.json,application/json';
  restoreLabel.append(restoreText, restore);
  transfer.append(transferNote, backup, restoreLabel);
  content.append(privacy, toolbar, protection, status, corruptStatus, failures, scroll, emptyBox, transfer);
  details.append(summary, content);
  root.append(details);

  let items: LibraryItem[] = [];
  let loaded = false;
  let busy = false;
  let statusCopy: { key: LibraryTextKey; values?: Values } | null = null;
  let corruptCount = 0;
  let protectedStorage: boolean | null = null;
  let readSequence = 0;
  let editingId: string | null = null;
  let openMoreId: string | null = null;
  let axesInfoOpen = false;
  let filtersOpen = false;
  const selectedIds = new Set<string>();
  type Editor = {
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
  };
  type Row = {
    node: HTMLLIElement;
    groupHeading: HTMLElement;
    select: HTMLInputElement;
    rating: HTMLElement;
    axes: HTMLElement;
    ratingDetails: HTMLElement;
    ratingToggle: HTMLButtonElement;
    more: HTMLButtonElement;
    secondary: HTMLElement;
    toggleMore(open: boolean, restoreFocus?: boolean): void;
    composer: HTMLElement;
    badges: HTMLElement;
    name: HTMLElement;
    last: HTMLElement;
    position: HTMLElement;
    progress: HTMLElement;
    metadata: HTMLElement;
    userNote: HTMLElement;
    open: HTMLButtonElement;
    statusBtn: HTMLButtonElement;
    favorite: HTMLButtonElement;
    edit: HTMLButtonElement;
    download: HTMLButtonElement;
    remove: HTMLButtonElement;
    editor: Editor | null;
  };
  const rows = new Map<string, Row>();
  type Estimate = {
    estimatorVersion: 1 | 2 | 3;
    bpm: number | undefined;
    promise: Promise<ImportedDifficultyEstimate | null>;
    result?: ImportedDifficultyEstimate | null;
    saveAttempted?: boolean;
  };
  const estimates = new Map<string, Estimate>();
  let ratingWorkerActive = false;
  let ratingRenderTimer = 0;
  let openTempoForId: string | null = null;

  function referenceTempo(id: string, item = items.find(item => item.id === id)): number | undefined {
    return item?.difficultyRating?.startingBpm;
  }

  function currentEstimate(id: string, item?: LibraryItem): Estimate | undefined {
    const estimate = estimates.get(id);
    return estimate &&
      estimate.estimatorVersion === ESTIMATOR_VERSION &&
      estimate.bpm === referenceTempo(id, item)
      ? estimate
      : undefined;
  }
  function displayedStars(item: LibraryItem): number | undefined {
    return currentEstimate(item.id, item)?.result?.difficultyStars ?? item.difficultyRating?.stars;
  }
  function displayedAxis(item: LibraryItem, axis: DifficultyAxis, result: Estimate['result']): number | undefined {
    return result?.axisDifficulty?.[axis].stars ?? item.difficultyRating?.axes?.[axis];
  }
  function makeRating(result: ImportedDifficultyEstimate, referenceBpm: number | undefined, startingBpm?: number): LibraryDifficultyRating | null {
    const { difficultyStars: stars, axisDifficulty: axes } = result;
    if (stars === null || !axes) return null;
    const drivers = Object.fromEntries(
      AXES.flatMap(axis => axes[axis].drivers.length ? [[axis, [...axes[axis].drivers]]] : []),
    );
    return {
      version: 2,
      stars,
      ...(startingBpm === undefined ? {} : { startingBpm }),
      ...(result.appliedEnduranceStars >= 0.1 ? { appliedEnduranceStars: result.appliedEnduranceStars } : {}),
      ...(result.spanAlert ? { spanAlert: true } : {}),
      assessment: {
        ...(referenceBpm === undefined ? {} : { referenceBpm }),
        tempoFallback: result.uncertainty.tempoFallback,
        tempoSource: result.uncertainty.tempoSource,
        voiceSource: result.uncertainty.voiceSource,
        handSource: result.uncertainty.handSource,
        estimatorVersion: ESTIMATOR_VERSION,
        profileId: result.profileId,
      },
      axes: {
        motor: axes.motor.stars,
        rhythm: axes.rhythm.stars,
        bimanual: axes.bimanual.stars,
        texture: axes.texture.stars,
        reading: axes.reading.stars,
      },
      ...(Object.keys(drivers).length ? { drivers } : {}),
    };
  }
  function scoreForItem(id: string, bpm = referenceTempo(id), estimateOpened?: OpenedScoreEstimator): Promise<ImportedDifficultyEstimate | null> {
    const cached = estimates.get(id);
    if (cached && cached.estimatorVersion === ESTIMATOR_VERSION && cached.bpm === bpm) {
      return cached.promise;
    }
    const promise = (estimateOpened
      ? new Promise<void>(resolve => { window.setTimeout(resolve, 0); }).then(() => estimateOpened(bpm))
      : libraryGet(id).then(stored => stored ? host.difficulty(stored.file, bpm) : null)).catch(() => null);
    const pending: Estimate = { estimatorVersion: ESTIMATOR_VERSION, bpm, promise };
    estimates.set(id, pending);
    void promise.then(result => {
      pending.result = result;
      if (currentEstimate(id) !== pending) return;
      updateRowRating(id);
      if (ratingAffectsResults() && !ratingRenderTimer) {
        ratingRenderTimer = window.setTimeout(() => {
          ratingRenderTimer = 0;
          if (!ratingAffectsResults()) return;
          const focused = document.activeElement;
          const restoreFocus = focused instanceof HTMLElement && list.contains(focused);
          render();
          if (restoreFocus && document.activeElement === document.body) {
            (list.contains(focused) ? focused : toggleFilters).focus({ preventScroll: true });
          }
        }, 100);
      }
    });
    return promise;
  }
  function needsRating(item: LibraryItem): boolean {
    const rating = item.difficultyRating;
    const upToDate = rating?.version === 2 &&
      !!rating.assessment &&
      !!rating.axes &&
      rating.assessment.estimatorVersion === ESTIMATOR_VERSION &&
      rating.assessment.profileId === 'default' &&
      rating.assessment.referenceBpm === referenceTempo(item.id, item);
    return !upToDate && !currentEstimate(item.id, item)?.saveAttempted;
  }
  function queueAutomaticRatings(): void {
    if (busy || ratingWorkerActive || document.hidden) return;
    const next = items.find(needsRating);
    if (!next) return;
    ratingWorkerActive = true;
    // Read and analyze one original at a time, yielding between scores so large libraries stay usable.
    window.setTimeout(() => {
      void rateAutomatically(next.id).finally(() => {
        ratingWorkerActive = false;
        queueAutomaticRatings();
      });
    }, 0);
  }
  async function rateAutomatically(id: string): Promise<void> {
    if (busy || document.hidden || !items.some(item => item.id === id && needsRating(item))) return;
    const pending = scoreForItem(id), estimate = currentEstimate(id);
    const result = await pending;
    const item = items.find(item => item.id === id);
    if (!estimate || currentEstimate(id) !== estimate || !item || busy) return;
    estimate.saveAttempted = true;
    const previousRating = item.difficultyRating;
    const rating = result && makeRating(result, estimate.bpm, previousRating?.startingBpm);
    if (!rating) return;
    try {
      const saved = await libraryUpdateLevels([{ id, previousRating, rating }]);
      if (saved === null || !items.includes(item)) {
        await refresh();
        if (saved === null && !items.includes(item)) estimate.saveAttempted = false;
      }
      else {
        item.difficultyRating = rating;
        updateRowRating(id);
      }
    } catch { notice('save_failed'); }
  }
  function starNumber(stars: number): string {
    return stars.toLocaleString(host.language(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  function starLabel(stars: number): string {
    return `${starNumber(stars)}★`;
  }
  function starGraphic(stars: number): HTMLElement {
    const result = element('span', 'score-library-star-score');
    const value = element('span', 'score-library-rating-number');
    value.textContent = starNumber(stars);
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
  function updateRowRating(id: string): void {
    const row = rows.get(id), item = items.find(item => item.id === id);
    if (!row || !item) return;
    const result = currentEstimate(id)?.result;
    const stars = displayedStars(item);
    const provisional = result?.uncertainty.tempoFallback ?? item.difficultyRating?.assessment?.tempoFallback;
    const label = t(result === undefined ? 'rating_open' : 'rating_unavailable');
    if (stars === undefined) {
      if (row.rating.textContent !== '—') row.rating.textContent = '—';
    } else if (row.rating.querySelector('.score-library-rating-number')?.textContent !== starNumber(stars)) {
      row.rating.replaceChildren(starGraphic(stars));
    }
    row.rating.setAttribute('aria-label', stars === undefined ? label : t('rating_summary', {
      rating: starNumber(stars),
    }) + (provisional ? `. ${t('estimate_tempo_provisional')}` : ''));
    row.rating.dataset.rated = String(stars !== undefined);
    row.rating.dataset.provisional = String(provisional === true);
    row.rating.title = provisional ? t('estimate_tempo_provisional') : '';
    const axisValues = AXES.map(axis => displayedAxis(item, axis, result));
    const axisSignature = host.language() + ':' + axisValues.join(',');
    row.axes.hidden = axisValues.every(value => value === undefined);
    if (row.axes.dataset.values !== axisSignature) {
      row.axes.dataset.values = axisSignature;
      row.axes.replaceChildren(...AXES.map((axis, index) => {
        const pair = element('div'), name = element('dt'), value = element('dd');
        const stars = axisValues[index];
        name.textContent = t(axis === 'bimanual' ? 'rating_hands_short' : `rating_${axis}`);
        pair.title = `${t(`rating_${axis}`)}: ${t(`rating_${axis}_desc`)}`;
        if (stars === undefined) {
          value.textContent = '—';
        } else {
          const num = element('span', 'score-library-axis-number');
          num.textContent = starNumber(stars);
          const unit = element('span', 'score-library-axis-star');
          unit.setAttribute('aria-hidden', 'true');
          unit.textContent = '★';
          value.append(num, unit);
        }
        pair.append(name, value);
        return pair;
      }));
    }
    if (row.ratingDetails.hidden) return;
    row.ratingDetails.replaceChildren();
    if (result === undefined) {
      row.ratingDetails.textContent = t('working');
      void scoreForItem(id);
    } else if (!result?.axisDifficulty) {
      row.ratingDetails.textContent = t('rating_unavailable');
    } else {
      const axes = element('dl', 'score-library-axes');
      for (const axis of AXES) {
        const { stars, measures, drivers } = result.axisDifficulty[axis];
        const pair = element('div'), name = element('dt'), rating = element('dd');
        name.textContent = t(`rating_${axis}`);
        pair.title = `${t(`rating_${axis}`)}: ${t(`rating_${axis}_desc`)}`;
        rating.append(starGraphic(stars));
        if (drivers.length) {
          const driverLine = element('small', 'score-library-drivers');
          driverLine.textContent = drivers.map(driver => t(`rating_driver_${driver}` as LibraryTextKey)).join(' · ');
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
      row.ratingDetails.append(axes);
      if (result.appliedEnduranceStars >= 0.1 || result.spanAlert) {
        const extras = element('div', 'score-library-rating-extras');
        if (result.appliedEnduranceStars >= 0.1) {
          const badge = element('span', 'score-library-extra-tag');
          badge.textContent = t('rating_endurance_bonus', { bonus: starNumber(result.appliedEnduranceStars) });
          extras.append(badge);
        }
        if (result.spanAlert) {
          const spanTag = element('span', 'score-library-extra-tag');
          spanTag.textContent = t('rating_span_alert');
          extras.append(spanTag);
        }
        row.ratingDetails.append(extras);
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
        setBpm.addEventListener('click', () => {
          if (busy) return;
          editingId = id;
          openTempoForId = id;
          render();
          rows.get(id)?.editor?.enableTempo();
          const input = rows.get(id)?.editor?.form.querySelector<HTMLInputElement>('[data-library-field="difficulty-tempo"]');
          input?.focus();
        });
        tempoRow.append(tempoNote, setBpm);
        row.ratingDetails.append(tempoRow);
      }
      if (result.midi) {
        const midiNote = element('p', 'score-library-note');
        midiNote.textContent = t('estimate_midi_details');
        row.ratingDetails.append(midiNote);
      } else if (result.uncertainty.handSource === 'unassigned') {
        const handNote = element('p', 'score-library-note');
        handNote.textContent = t('estimate_unassigned_hands');
        row.ratingDetails.append(handNote);
      }
      if (result.difficultyStars !== null && !result.uncertainty.tempoFallback &&
          (result.difficultyStars !== item.difficultyRating?.stars || item.difficultyRating?.version !== 2)) {
        const save = element('button');
        save.type = 'button';
        save.disabled = busy;
        save.textContent = t('rating_save_one', { rating: starLabel(result.difficultyStars) });
        save.addEventListener('click', () => saveRating(id, result, row.more));
        row.ratingDetails.append(save);
      }
    }
  }
  function saveRating(id: string, result: ImportedDifficultyEstimate, focus: HTMLButtonElement, manualBpm?: number): void {
    const item = items.find(item => item.id === id);
    if (busy || !item) return;
    void run(async () => {
      const previousRating = item.difficultyRating;
      const rating = makeRating(result, manualBpm ?? referenceTempo(id), manualBpm ?? previousRating?.startingBpm);
      if (!rating) return;
      const updated = await libraryUpdateLevels([{ id, previousRating, rating }]);
      await refresh();
      if (statusCopy?.key !== 'unavailable') {
        if (updated === null) notice('reclassify_conflict');
        else notice('rating_saved', { count: updated });
      }
    }, 'save_failed').then(() => { if (focus.isConnected) focus.focus(); });
  }
  function notice(key: LibraryTextKey, values?: Values): void {
    statusCopy = { key, values };
    status.textContent = t(key, values);
    if (key === 'save_failed' || key === 'unavailable' || key === 'restore_failed' || key === 'action_failed') details.open = true;
  }
  function setBusy(value: boolean): void {
    busy = value;
    content.setAttribute('aria-busy', String(value));
    files.disabled = restore.disabled = backup.disabled = sort.disabled = difficultySort.disabled = axesInfoToggle.disabled = toggleFilters.disabled = resetFilters.disabled = selectAll.disabled = value;
    filter.disabled = composerFilter.disabled = tagFilter.disabled = group.disabled = value;
    syncDifficultyFilters();
    for (const { button } of tabButtons) button.disabled = value;
    for (const button of activeChips.querySelectorAll('button')) button.disabled = value;
    deleteSelected.disabled = value || selectedIds.size === 0;
    for (const control of list.querySelectorAll('button, input, select, textarea')) {
      (control as HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).disabled = value;
    }
    if (!value) queueAutomaticRatings();
  }
  async function run(action: () => Promise<void>, errorKey: LibraryTextKey = 'action_failed'): Promise<void> {
    if (busy) return;
    setBusy(true);
    failures.replaceChildren();
    failures.hidden = true;
    notice('working');
    try { await action(); } catch { notice(errorKey); }
    finally { setBusy(false); }
  }
  async function refresh(): Promise<void> {
    const sequence = ++readSequence;
    try {
      let corrupt = 0;
      const next = await libraryList(count => { corrupt = count; });
      if (sequence !== readSequence) return;
      items = next;
      const ids = new Set(next.map(item => item.id));
      for (const id of estimates.keys()) if (!ids.has(id)) estimates.delete(id);
      corruptCount = corrupt;
      if (editingId !== null && !items.some(item => item.id === editingId)) editingId = null;
      loaded = true;
      render();
      queueAutomaticRatings();
    } catch {
      // Do not turn a storage failure into a false empty-library message.
      if (sequence === readSequence) notice('unavailable');
    }
  }
  function syncSelectOptions(select: HTMLSelectElement, allLabel: string, values: string[], noneLabel: string, hasNone: boolean): void {
    const previous = select.value;
    const valid = new Set<string>(['', ...values, ...(hasNone ? ['__none__'] : [])]);
    const choices = [{ value: '', label: allLabel }, ...values.map(value => ({ value, label: value })),
      ...(hasNone ? [{ value: '__none__', label: noneLabel }] : [])];
    const makeOption = (value: string, label: string): HTMLOptionElement => {
      const option = element('option');
      option.value = value;
      option.textContent = label;
      return option;
    };
    const unchanged = select.options.length === choices.length && choices.every((option, i) =>
      select.options[i].value === option.value && select.options[i].textContent === option.label);
    if (!unchanged) select.replaceChildren(...choices.map(option => makeOption(option.value, option.label)));
    select.value = valid.has(previous) ? previous : '';
  }
  function syncFilterOptions(): void {
    const locale = host.language();
    const composers = new Set<string>();
    let hasEmptyComposer = false;
    const tags = new Set<string>();
    let hasEmptyTag = false;
    for (const item of items) {
      const composer = item.composer.trim();
      if (composer) composers.add(composer);
      else hasEmptyComposer = true;
      if (item.tags?.length) {
        for (const tag of item.tags) tags.add(tag);
      } else {
        hasEmptyTag = true;
      }
    }
    syncSelectOptions(composerFilter, t('all_composers'), [...composers].sort((a, b) => a.localeCompare(b, locale)), t('unknown_composer'), hasEmptyComposer);
    syncSelectOptions(tagFilter, t('all_tags'), [...tags].sort((a, b) => a.localeCompare(b, locale)), t('untagged'), hasEmptyTag);
  }
  function createEditor(id: string, item: LibraryItem, row: Row): Editor {
    const form = element('form', 'score-library-editor');
    const makeLabel = (control: HTMLElement): HTMLElement => {
      const label = element('label');
      const text = element('span');
      label.append(text, control);
      form.append(label);
      return text;
    };
    const makeField = (field: string, value: string, maxLength?: number, type: 'text' | 'number' = 'text'): { text: HTMLElement; input: HTMLInputElement } => {
      const input = element('input');
      input.type = type;
      input.dataset.libraryField = field;
      input.value = value;
      if (maxLength) input.maxLength = maxLength;
      input.disabled = busy;
      return { text: makeLabel(input), input };
    };
    const titleField = makeField('title', item.title, 512);
    const composerField = makeField('composer', item.composer, 512);
    const estimatePanel = element('div', 'score-library-editor-actions');
    const estimate = element('button'), saveStars = element('button'), result = element('p');
    const tempoLabel = element('label'), tempoCopy = element('span'), tempo = element('input');
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
    let estimating = false, estimateFailed = false, canSetTempo = openTempoForId === id;
    if (openTempoForId === id) openTempoForId = null;
    let usedTempo: number | undefined;
    const enteredTempo = () => {
      const value = tempo.value.trim().replace(',', '.');
      if (!value) return 0;
      const bpm = Number(value);
      return /^\d+(?:\.\d+)?$/.test(value) && bpm >= 20 && bpm <= 400 ? bpm : null;
    };
    const ratedStars = () => {
      const bpm = enteredTempo();
      return difficulty && !difficulty.uncertainty.tempoFallback && bpm !== null &&
        (bpm || referenceTempo(id)) === usedTempo ? difficulty.difficultyStars : null;
    };
    const renderEstimate = () => {
      estimate.textContent = t('estimate');
      estimate.disabled = busy || estimating || enteredTempo() === null;
      tempoLabel.hidden = !canSetTempo;
      tempoCopy.textContent = t('estimate_bpm');
      tempo.disabled = busy || estimating;
      const stars = ratedStars();
      const savedRating = items.find(item => item.id === id)?.difficultyRating;
      saveStars.hidden = stars === null || (stars === savedRating?.stars && (!enteredTempo() || enteredTempo() === savedRating?.startingBpm));
      saveStars.disabled = busy;
      saveStars.textContent = stars === null ? '' : t('rating_save_one', { rating: starLabel(stars) });
      const text = [];
      if (estimating) text.push(t('working'));
      else if (estimateFailed) text.push(t('estimate_failed'));
      else if (difficulty?.peak) {
        if (difficulty.difficultyStars !== null) text.push(t('rating_summary', {
          rating: starNumber(difficulty.difficultyStars),
        }));
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
      if (stars !== null && difficulty) saveRating(id, difficulty, estimate, enteredTempo() || undefined);
    });
    estimate.addEventListener('click', async () => {
      const bpm = enteredTempo();
      if (busy || estimating || bpm === null) return;
      usedTempo = bpm || referenceTempo(id);
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
      }
      catch { estimateFailed = true; }
      finally {
        estimating = false;
        renderEstimate();
      }
    });
    const tagsField = makeField('tags', (item.tags ?? []).join(', '));
    const statusSelect = element('select');
    statusSelect.dataset.libraryField = 'status';
    statusSelect.disabled = busy;
    const statusOptions = (['', 'in_progress', 'mastered'] as const).map(value => {
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
    notesInput.disabled = busy;
    const notesText = makeLabel(notesInput);
    const editorActions = element('div', 'score-library-editor-actions');
    const save = element('button');
    save.type = 'submit';
    save.dataset.libraryAction = 'save-edit';
    save.disabled = busy;
    const cancel = element('button');
    cancel.type = 'button';
    cancel.dataset.libraryAction = 'cancel-edit';
    cancel.disabled = busy;
    editorActions.append(save, cancel);
    form.append(editorActions);
    cancel.addEventListener('click', () => {
      if (busy) return;
      editingId = null;
      render();
      row.more.focus();
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (busy) return;
      const tags = tagsField.input.value.split(',').map(part => part.trim()).filter(Boolean);
      const rawProgress = progressField.input.value.trim();
      const parsedProgress = rawProgress === '' ? null : Math.max(0, Math.min(100, Math.round(Number(rawProgress))));
      const progress = parsedProgress !== null && Number.isNaN(parsedProgress) ? null : parsedProgress;
      const nextStatus = (statusSelect.value || null) as LibraryStudyStatus | null;
      const nextNotes = notesInput.value.trim() || null;
      void run(async () => {
        const updated = await libraryUpdate(id, {
          title: titleField.input.value.trim(),
          composer: composerField.input.value.trim(),
          tags,
          status: nextStatus,
          progress,
          notes: nextNotes,
        });
        if (!updated) throw new Error('missing');
        editingId = null;
        await refresh();
        notice('saved');
      }).then(() => { if (editingId !== id && row.more.isConnected) row.more.focus(); });
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
  function closeOpenMore(exceptId: string | null = null): void {
    if (!openMoreId || openMoreId === exceptId) return;
    const previous = rows.get(openMoreId);
    openMoreId = null;
    if (previous) {
      previous.secondary.hidden = true;
      previous.more.setAttribute('aria-expanded', 'false');
    }
  }
  function positionOpenMore(): void {
    const row = openMoreId === null ? undefined : rows.get(openMoreId);
    if (!row) return;
    const { more, secondary } = row;
    const anchor = more.getBoundingClientRect();
    const listBounds = scroll.getBoundingClientRect();
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    const headerHeight = parseFloat(styles.getPropertyValue('--hdr-h')) || 0;
    const dockHeight = parseFloat(styles.getPropertyValue('--dock-h')) || 0;
    const margin = 8, gap = 4;
    const top = Math.max(headerHeight + margin, columns.getBoundingClientRect().bottom);
    const bottom = window.innerHeight - dockHeight - margin;
    if (anchor.bottom <= Math.max(top, listBounds.top) || anchor.top >= Math.min(bottom, listBounds.bottom)) {
      const restoreFocus = secondary.contains(document.activeElement);
      closeOpenMore();
      if (restoreFocus) more.focus({ preventScroll: true });
      return;
    }
    const below = Math.max(0, bottom - anchor.bottom - gap);
    const above = Math.max(0, anchor.top - top - gap);
    const fullHeight = secondary.scrollHeight + secondary.offsetHeight - secondary.clientHeight;
    const opensAbove = fullHeight > below && above > below;
    secondary.style.maxHeight = `${Math.floor(opensAbove ? above : below)}px`;
    const menu = secondary.getBoundingClientRect();
    secondary.style.top = `${opensAbove ? anchor.top - gap - menu.height : anchor.bottom + gap}px`;
    secondary.style.left = `${Math.max(margin, Math.min(anchor.right - menu.width, root.clientWidth - menu.width - margin))}px`;
  }
  function createRow(id: string): Row {
    const node = element('li', 'score-library-item');
    node.dataset.libraryId = id;
    const groupHeading = element('div', 'score-library-group-heading');
    groupHeading.hidden = true;
    const select = element('input', 'score-library-check');
    select.type = 'checkbox';
    select.dataset.libraryAction = 'select';
    const selectLabel = element('label', 'score-library-row-select');
    selectLabel.append(select);
    const info = element('div', 'score-library-info');
    const identity = element('div', 'score-library-identity');
    const metadata = element('div', 'score-library-metadata');
    const title = element('h3');
    const rating = element('div', 'score-library-rating');
    rating.setAttribute('role', 'img');
    const axes = element('dl', 'score-library-axis-summary');
    axes.hidden = true;
    const ratingDetails = element('div', 'score-library-rating-details');
    ratingDetails.id = 'score-rating-' + id;
    ratingDetails.tabIndex = -1;
    ratingDetails.hidden = true;
    const composer = element('p', 'score-library-composer');
    const badges = element('div', 'score-library-badges');
    badges.hidden = true;
    const name = element('p', 'score-library-note');
    const last = element('p', 'score-library-note');
    const position = element('p', 'score-library-note');
    const progress = element('p', 'score-library-note score-library-progress');
    const userNote = element('p', 'score-library-user-note');
    userNote.hidden = true;
    identity.append(title, composer);
    metadata.append(position, progress, badges);
    info.append(identity, axes, metadata, userNote);
    const actions = element('div', 'score-library-actions');
    const secondary = element('div', 'score-library-secondary');
    secondary.id = 'score-actions-' + id;
    secondary.hidden = true;
    const fileDetails = element('div', 'score-library-original-info');
    fileDetails.append(name, last);
    secondary.append(fileDetails);
    const makeButton = (action: string, group = actions): HTMLButtonElement => {
      const button = element('button');
      button.type = 'button';
      button.dataset.libraryAction = action;
      button.disabled = busy;
      group.append(button);
      return button;
    };
    const open = makeButton('open', title);
    const favorite = makeButton('favorite');
    const more = makeButton('more');
    more.setAttribute('aria-controls', secondary.id);
    more.setAttribute('aria-expanded', 'false');
    const edit = makeButton('edit', secondary);
    const ratingToggle = makeButton('rating-details', secondary);
    ratingToggle.setAttribute('aria-controls', ratingDetails.id);
    ratingToggle.setAttribute('aria-expanded', 'false');
    const statusBtn = makeButton('status', secondary);
    const original = makeButton('download', secondary);
    const remove = makeButton('delete', secondary);
    actions.append(secondary);
    node.append(groupHeading, selectLabel, info, rating, actions, ratingDetails);
    const toggleMore = (open: boolean, restoreFocus = true) => {
      if (open) closeOpenMore(id);
      secondary.hidden = !open;
      more.setAttribute('aria-expanded', String(open));
      openMoreId = open ? id : (openMoreId === id ? null : openMoreId);
      if (open) {
        secondary.scrollTop = 0;
        positionOpenMore();
      } else if (restoreFocus) more.focus();
    };
    more.addEventListener('click', () => toggleMore(Boolean(secondary.hidden)));
    node.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (!secondary.hidden && (event.target === more || secondary.contains(document.activeElement))) {
        event.stopPropagation();
        toggleMore(false);
      } else if (!ratingDetails.hidden && ratingDetails.contains(document.activeElement)) {
        event.stopPropagation();
        ratingDetails.hidden = true;
        ratingToggle.setAttribute('aria-expanded', 'false');
        more.focus();
      }
    });
    ratingToggle.addEventListener('click', () => {
      toggleMore(false, false);
      ratingDetails.hidden = !ratingDetails.hidden;
      ratingToggle.setAttribute('aria-expanded', String(!ratingDetails.hidden));
      if (ratingDetails.hidden) {
        more.focus();
        return;
      }
      if (currentEstimate(id)?.result === null) estimates.delete(id);
      updateRowRating(id);
      ratingDetails.focus({ preventScroll: true });
    });
    select.addEventListener('change', () => {
      if (busy) return;
      if (select.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      render();
    });
    open.addEventListener('click', () => { void run(async () => {
      await host.flush();
      const stored = await libraryGet(id);
      if (!stored || !await host.open(stored.item, stored.file)) throw new Error('open');
      // The host owns checkpoints; refreshing here reflects its successful open.
      await refresh();
      if (statusCopy?.key === 'working') { statusCopy = null; status.textContent = ''; }
    }); });
    statusBtn.addEventListener('click', () => {
      toggleMore(false, false);
      void run(async () => {
        const current = items.find(item => item.id === id);
        if (!current) throw new Error('missing');
        const nextStatus: LibraryStudyStatus | null =
          current.status === undefined ? 'in_progress'
          : current.status === 'in_progress' ? 'mastered'
          : null;
        const updated = await libraryUpdate(id, { status: nextStatus });
        if (!updated) { await refresh(); throw new Error('missing'); }
        await refresh();
        if (statusCopy?.key === 'working') { statusCopy = null; status.textContent = ''; }
      }).then(() => { if (more.isConnected) more.focus(); });
    });
    favorite.addEventListener('click', () => { void run(async () => {
      const current = items.find(item => item.id === id);
      if (!current) throw new Error('missing');
      const updated = await libraryUpdate(id, { favorite: !current.favorite });
      if (!updated) { await refresh(); throw new Error('missing'); }
      await refresh();
      if (statusCopy?.key === 'working') { statusCopy = null; status.textContent = ''; }
    }); });
    edit.addEventListener('click', () => {
      if (busy) return;
      toggleMore(false, false);
      editingId = editingId === id ? null : id;
      render();
      if (editingId === id) rows.get(id)?.editor?.form.querySelector('input')?.focus();
      else more.focus();
    });
    original.addEventListener('click', () => {
      toggleMore(false, false);
      void run(async () => {
        const stored = await libraryGet(id);
        if (!stored) throw new Error('missing');
        download(stored.file, stored.item.name);
        statusCopy = null; status.textContent = '';
      }).then(() => { if (more.isConnected) more.focus(); });
    });
    const confirmAction = (message: string): Promise<boolean> =>
      host.confirm ? host.confirm(message) : Promise.resolve(window.confirm(message));
    remove.addEventListener('click', async () => {
      const current = items.find(item => item.id === id);
      if (!current || busy) return;
      toggleMore(false, false);
      if (!await confirmAction(t('delete_confirm', { title: current.title || current.name }))) {
        if (more.isConnected) more.focus();
        return;
      }
      if (busy) return;
      void run(async () => {
        await host.flush();
        await libraryRemove(id);
        await refresh();
        if (statusCopy?.key !== 'unavailable') notice('deleted');
        search.focus();
      });
    });
    return { node, groupHeading, select, rating, axes, ratingDetails, ratingToggle, more, secondary, toggleMore, composer, badges, name, last, position, progress, metadata, userNote, open, statusBtn, favorite, edit, download: original, remove, editor: null };
  }
  function statusLabel(value: LibraryStudyStatus | undefined): string {
    if (value === 'in_progress') return t('status_in_progress');
    if (value === 'mastered') return t('status_mastered');
    return t('status_none');
  }
  function groupMeta(item: LibraryItem): { label: string; empty: boolean; order: number } {
    if (group.value === 'status') {
      const order = item.status === 'in_progress' ? 0 : item.status === 'mastered' ? 1 : 2;
      return { label: statusLabel(item.status), empty: !item.status, order };
    }
    if (group.value === 'composer') {
      const value = item.composer.trim();
      return { label: value || t('unknown_composer'), empty: !value, order: 0 };
    }
    if (group.value === 'tag') {
      if (tagFilter.value && tagFilter.value !== '__none__' && item.tags?.includes(tagFilter.value)) {
        return { label: tagFilter.value, empty: false, order: 0 };
      }
      const value = item.tags?.[0] ?? '';
      return { label: value || t('untagged'), empty: !value, order: 0 };
    }
    return { label: '', empty: true, order: 0 };
  }
  type DifficultyRange = { min: number; max: number };
  function createDifficultyRange(id: string) {
    const controls = element('div', 'score-library-rating-range');
    const endpoints = (['min', 'max'] as const).map(bound => {
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
      input.addEventListener('change', render);
      return { bound, text, input };
    });
    const [min, max] = endpoints.map(({ input }) => input);
    return {
      controls,
      read(): DifficultyRange | null {
        return min.value || max.value ? { min: Number(min.value || 1), max: Number(max.value || 5) } : null;
      },
      clear(): void { min.value = max.value = ''; },
      sync(): void {
        min.disabled = max.disabled = busy;
        for (const option of min.options) option.disabled = Boolean(option.value && max.value && +option.value > +max.value);
        for (const option of max.options) option.disabled = Boolean(option.value && min.value && +option.value < +min.value);
      },
      localize(): void {
        for (const { bound, text, input } of endpoints) {
          text.textContent = t(`rating_filter_${bound}`);
          for (const option of input.options) option.textContent = option.value ? starNumber(+option.value) : t('rating_filter_any');
        }
      },
    };
  }
  function selectedDifficultyAxis(): DifficultyAxis | undefined { return AXES.find(axis => axis === axisSelect.value); }
  function clearAxisFilter(): void { axisSelect.value = ''; axisRange.clear(); }
  function syncDifficultyFilters(): void {
    axisSelect.disabled = busy;
    axisRange.controls.hidden = !axisSelect.value;
    totalRange.sync();
    axisRange.sync();
  }
  function ratingAffectsResults(): boolean {
    return sort.value === 'difficulty' || sort.value === 'difficulty_desc' || !!totalRange.read() || !!(axisSelect.value && axisRange.read());
  }
  function matchesDifficulty(score: number | undefined, range: DifficultyRange): boolean {
    return score !== undefined && score >= range.min && score <= range.max;
  }
  let chipsSignature = '';
  function syncActiveChips(total: DifficultyRange | null, axis: DifficultyAxis | undefined, range: DifficultyRange | null): void {
    const rangeLabel = ({ min, max }: DifficultyRange) => `${starNumber(min)}–${starNumber(max)}`;
    const specs: { active: boolean; label: string; clear: () => void }[] = [
      {
        active: Boolean(composerFilter.value),
        label: `${t('composer_filter')}: ${composerFilter.value === '__none__' ? t('unknown_composer') : composerFilter.value}`,
        clear: () => { composerFilter.value = ''; },
      },
      {
        active: Boolean(tagFilter.value),
        label: `${t('tag_filter')}: ${tagFilter.value === '__none__' ? t('untagged') : tagFilter.value}`,
        clear: () => { tagFilter.value = ''; },
      },
      {
        active: group.value !== 'none',
        label: `${t('group_by')}: ${t(`group_${group.value}` as LibraryTextKey)}`,
        clear: () => { group.value = 'none'; },
      },
    ];
    if (total) specs.push({ active: true, label: `${t('rating_filter_total')}: ${rangeLabel(total)} ★`, clear: totalRange.clear });
    if (axis && range) specs.push({ active: true, label: `${t(`rating_${axis}`)}: ${rangeLabel(range)}`, clear: clearAxisFilter });
    const active = specs.filter(spec => spec.active);
    if (filtersOpen || !active.length) {
      chipsSignature = '';
      activeChips.hidden = true;
      activeChips.replaceChildren();
      return;
    }
    const signature = JSON.stringify([t('reset_filters'), ...active.map(spec => spec.label)]);
    if (signature === chipsSignature) return;
    chipsSignature = signature;
    const buttons = active.map(spec => {
      const chip = element('button', 'score-library-chip');
      chip.type = 'button';
      chip.textContent = `${spec.label} ×`;
      chip.disabled = busy;
      chip.setAttribute('aria-label', `${t('reset_filters')}: ${spec.label}`);
      chip.addEventListener('click', () => {
        if (busy) return;
        const wasFocused = document.activeElement === chip;
        spec.clear();
        render();
        if (wasFocused) {
          const fallback = activeChips.querySelector<HTMLButtonElement>('button') ?? toggleFilters;
          fallback.focus();
        }
      });
      return chip;
    });
    activeChips.replaceChildren(...buttons);
    activeChips.hidden = false;
  }
  function render(): void {
    const locale = host.language();
    summary.textContent = t('heading', { count: items.length });
    syncFilterOptions();
    const query = search.value.trim().toLocaleLowerCase();
    search.dataset.active = String(Boolean(query));
    sort.dataset.active = String(sort.value !== 'added');
    filter.dataset.active = String(filter.value !== 'all');
    composerFilter.dataset.active = String(Boolean(composerFilter.value));
    tagFilter.dataset.active = String(Boolean(tagFilter.value));
    group.dataset.active = String(group.value !== 'none');
    for (const { key, button } of tabButtons) {
      const active = filter.value === key;
      button.setAttribute('aria-pressed', String(active));
      button.dataset.active = String(active);
    }
    const total = totalRange.read();
    const axis = selectedDifficultyAxis();
    const axisBounds = axis ? axisRange.read() : null;
    syncDifficultyFilters();
    const secondaryCount = [composerFilter.value, tagFilter.value, group.value !== 'none', total, axisBounds].filter(Boolean).length;
    toolbarFilters.hidden = !filtersOpen;
    toggleFilters.setAttribute('aria-expanded', String(filtersOpen));
    toggleFilters.dataset.active = String(filtersOpen || secondaryCount > 0);
    toggleFilters.textContent = secondaryCount > 0 ? t('toggle_filters_count', { count: secondaryCount }) : t('toggle_filters');
    syncActiveChips(total, axis, axisBounds);
    const hasActiveFilters = Boolean(query || filter.value !== 'all' || sort.value !== 'added' || secondaryCount > 0);
    const shown = items.filter(item => {
      if (query) {
        const haystack = `${item.title}\n${item.composer}\n${item.name}\n${(item.tags ?? []).join('\n')}\n${item.notes ?? ''}`.toLocaleLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (filter.value === 'in_progress' && item.status !== 'in_progress') return false;
      if (filter.value === 'mastered' && item.status !== 'mastered') return false;
      if (filter.value === 'favorites' && !item.favorite) return false;
      if (filter.value === 'recent' && item.lastOpenedAt === null) return false;
      if (composerFilter.value === '__none__' && item.composer.trim()) return false;
      if (composerFilter.value && composerFilter.value !== '__none__' && item.composer.trim() !== composerFilter.value) return false;
      if (tagFilter.value === '__none__' && item.tags?.length) return false;
      if (tagFilter.value && tagFilter.value !== '__none__' && !item.tags?.includes(tagFilter.value)) return false;
      if (total && !matchesDifficulty(displayedStars(item), total)) return false;
      if (axis && axisBounds && !matchesDifficulty(displayedAxis(item, axis, currentEstimate(item.id, item)?.result), axisBounds)) return false;
      return true;
    });
    const compareByTitle = (a: LibraryItem, b: LibraryItem): number =>
      (a.title || a.name).localeCompare(b.title || b.name, locale, { numeric: true }) || a.id.localeCompare(b.id);
    const effectiveSort = filter.value === 'recent' && sort.value === 'added' ? 'recent' : sort.value;
    const compareItems = (a: LibraryItem, b: LibraryItem): number => {
      if (effectiveSort === 'recent') {
        return (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.addedAt - a.addedAt || a.id.localeCompare(b.id);
      }
      if (effectiveSort === 'title') return compareByTitle(a, b);
      if (effectiveSort === 'composer') {
        const ca = a.composer.trim();
        const cb = b.composer.trim();
        if (!ca !== !cb) return ca ? -1 : 1;
        return ca.localeCompare(cb, locale, { numeric: true }) || compareByTitle(a, b);
      }
      if (effectiveSort === 'difficulty') {
        return (displayedStars(a) ?? Infinity) - (displayedStars(b) ?? Infinity) || compareByTitle(a, b);
      }
      if (effectiveSort === 'difficulty_desc') {
        const da = displayedStars(a), db = displayedStars(b);
        if ((da === undefined) !== (db === undefined)) return da === undefined ? 1 : -1;
        return (db ?? 0) - (da ?? 0) || compareByTitle(a, b);
      }
      if (effectiveSort === 'progress_desc' || effectiveSort === 'progress_asc') {
        const pa = a.progress;
        const pb = b.progress;
        if ((pa === undefined) !== (pb === undefined)) return pa === undefined ? 1 : -1;
        if (pa !== undefined && pb !== undefined && pa !== pb) {
          return effectiveSort === 'progress_desc' ? pb - pa : pa - pb;
        }
        return compareByTitle(a, b);
      }
      return b.addedAt - a.addedAt || a.id.localeCompare(b.id);
    };
    if (group.value !== 'none') {
      shown.sort((a, b) => {
        const ga = groupMeta(a);
        const gb = groupMeta(b);
        if (group.value === 'status') {
          if (ga.order !== gb.order) return ga.order - gb.order;
          return compareItems(a, b);
        }
        if (ga.empty !== gb.empty) return ga.empty ? 1 : -1;
        const labelCmp = ga.label.localeCompare(gb.label, locale, { numeric: true });
        if (labelCmp !== 0) return labelCmp;
        return compareItems(a, b);
      });
    } else {
      shown.sort(compareItems);
    }
    const groupCounts = new Map<string, number>();
    if (group.value !== 'none') {
      for (const item of shown) {
        const { label } = groupMeta(item);
        groupCounts.set(label, (groupCounts.get(label) ?? 0) + 1);
      }
    }
    const visible = new Set(shown.map(item => item.id));
    for (const id of selectedIds) {
      if (!visible.has(id)) selectedIds.delete(id);
    }
    if (shown.length > 0) {
      if (!bulkBar.isConnected) content.insertBefore(bulkBar, scroll);
      selectAllText.textContent = t('select_all', { count: shown.length });
      selectAll.setAttribute('aria-label', selectAllText.textContent);
      const allSelected = shown.every(item => selectedIds.has(item.id));
      selectAll.checked = allSelected;
      selectAll.indeterminate = !allSelected && selectedIds.size > 0;
      selectAll.disabled = busy;
      deleteSelected.textContent = t('delete_selected', { count: selectedIds.size });
      deleteSelected.disabled = busy || selectedIds.size === 0;
    } else if (bulkBar.isConnected) {
      bulkBar.remove();
    }
    for (const [id, row] of rows) {
      if (!visible.has(id)) {
        if (openMoreId === id) openMoreId = null;
        row.node.remove(); rows.delete(id);
      }
    }
    let index = 0;
    let previousGroup: string | null = null;
    for (const item of shown) {
      let row = rows.get(item.id);
      if (!row) {
        row = createRow(item.id);
        rows.set(item.id, row);
      }
      if (group.value !== 'none') {
        const { label } = groupMeta(item);
        if (label !== previousGroup) {
          row.groupHeading.hidden = false;
          row.groupHeading.textContent = t('group_heading', { group: label, count: groupCounts.get(label) ?? 1 });
          previousGroup = label;
        } else {
          row.groupHeading.hidden = true;
        }
      } else {
        row.groupHeading.hidden = true;
      }
      const title = item.title || item.name;
      row.select.checked = selectedIds.has(item.id);
      row.select.disabled = busy;
      row.select.setAttribute('aria-label', t('select_score', { title }));
      updateRowRating(item.id);
      row.composer.textContent = item.composer;
      row.composer.hidden = !item.composer.trim();
      const statusText = statusLabel(item.status);
      const badgeNodes: HTMLElement[] = [];
      if (item.status) {
        const badge = element('span', 'score-library-badge score-library-badge-status');
        badge.dataset.status = item.status;
        badge.textContent = statusText;
        badgeNodes.push(badge);
      }
      if (item.progress !== undefined) {
        const badge = element('span', 'score-library-badge score-library-badge-progress');
        const textSpan = element('span');
        textSpan.textContent = t('progress_badge', { progress: item.progress });
        const track = element('span', 'score-library-progress-bar');
        track.setAttribute('aria-hidden', 'true');
        const fill = element('span');
        fill.style.width = `${item.progress}%`;
        track.append(fill);
        badge.append(textSpan, track);
        badgeNodes.push(badge);
      }
      for (const tag of item.tags ?? []) {
        const badge = element('span', 'score-library-badge score-library-badge-tag');
        badge.textContent = tag;
        badgeNodes.push(badge);
      }
      row.badges.replaceChildren(...badgeNodes);
      row.badges.hidden = !badgeNodes.length;
      const extension = item.name.split('.').pop()?.toUpperCase() ?? '';
      row.name.textContent = `${item.name} · ${extension}`;
      row.last.textContent = item.lastOpenedAt === null ? t('never_opened') : t('last_opened', {
        date: new Date(item.lastOpenedAt).toLocaleString(locale),
      });
      row.position.hidden = !item.resume;
      if (item.resume) {
        const seconds = Math.max(0, Math.floor(item.resume.elapsed ?? (item.resume.performance ?? item.resume.position) / (item.resume.speed / 100)));
        const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
        row.position.textContent = t('position', { measure: item.resume.measure || '—', time });
      }
      // Practice progress from whole-score runs in the player; older records have none.
      const progress: string[] = [];
      if (item.best !== undefined) progress.push(t('best', { best: item.best }));
      if (item.lastPlayedDay !== undefined) progress.push(t('last_played', {
        date: new Date(item.lastPlayedDay * 86_400_000).toLocaleDateString(locale, { timeZone: 'UTC' }),
      }));
      row.progress.hidden = !progress.length;
      row.progress.textContent = progress.join(' · ');
      row.metadata.hidden = !item.resume && !progress.length && !badgeNodes.length;
      row.userNote.hidden = !item.notes;
      if (item.notes) row.userNote.textContent = t('note_line', { notes: item.notes });
      row.open.textContent = title;
      row.open.setAttribute('aria-label', `${t(item.resume ? 'resume' : 'open')}: ${title}`);
      row.statusBtn.textContent = t('rating_change_status', { status: statusText });
      row.statusBtn.dataset.status = item.status ?? 'none';
      row.statusBtn.setAttribute('aria-pressed', String(Boolean(item.status)));
      row.statusBtn.title = t('status_cycle', { status: statusText, title });
      row.statusBtn.setAttribute('aria-label', row.statusBtn.title);
      row.favorite.textContent = item.favorite ? '♥' : '♡';
      row.favorite.setAttribute('aria-pressed', String(item.favorite));
      row.favorite.title = t('favorite', { title });
      row.favorite.setAttribute('aria-label', row.favorite.title);
      row.edit.textContent = t('edit');
      row.edit.setAttribute('aria-pressed', String(editingId === item.id));
      row.edit.setAttribute('aria-label', `${t('edit')}: ${title}`);
      row.ratingToggle.textContent = t('rating_details');
      row.ratingDetails.setAttribute('role', 'region');
      row.ratingDetails.setAttribute('aria-label', `${t('rating_details')}: ${title}`);
      row.more.textContent = '⋯';
      row.more.title = t('row_more');
      row.more.setAttribute('aria-label', `${t('row_more')}: ${title}`);
      row.download.textContent = t('download');
      row.download.setAttribute('aria-label', `${t('download')}: ${item.name}`);
      row.remove.textContent = t('delete');
      row.remove.setAttribute('aria-label', `${t('delete')}: ${title}`);
      if (editingId === item.id) {
        if (!row.editor) {
          row.editor = createEditor(item.id, item, row);
          row.node.append(row.editor.form);
        }
        row.editor.titleText.textContent = t('edit_title');
        row.editor.composerText.textContent = t('edit_composer');
        row.editor.tagsText.textContent = t('edit_tags');
        row.editor.statusText.textContent = t('edit_status');
        for (const { value, option } of row.editor.statusOptions) {
          option.textContent = statusLabel(value || undefined);
        }
        row.editor.progressText.textContent = t('edit_progress');
        row.editor.notesText.textContent = t('edit_notes');
        row.editor.save.textContent = t('save_edit');
        row.editor.cancel.textContent = t('cancel_edit');
        row.editor.renderEstimate();
      } else if (row.editor) {
        row.editor.form.remove();
        row.editor = null;
      }
      // Do not detach focused controls when their row has not moved.
      if (list.children[index] !== row.node) list.insertBefore(row.node, list.children[index] ?? null);
      index++;
    }
    corruptStatus.hidden = corruptCount === 0;
    corruptStatus.textContent = corruptCount ? t('corrupt_entries', { count: corruptCount }) : '';
    const emptyVisible = loaded && shown.length === 0 && !(corruptCount > 0 && !items.length);
    emptyBox.hidden = !emptyVisible;
    empty.hidden = !emptyVisible;
    empty.textContent = t(items.length ? 'no_matches' : 'empty');
    if (hasActiveFilters) {
      const resetHost = emptyVisible && items.length > 0 ? emptyBox : toolbarBarActions;
      if (resetFilters.parentElement !== resetHost) resetHost.append(resetFilters);
    } else if (resetFilters.isConnected) {
      resetFilters.remove();
    }
    scroll.hidden = shown.length === 0;
    difficultySort.setAttribute('aria-pressed', String(sort.value === 'difficulty' || sort.value === 'difficulty_desc'));
    difficultySort.setAttribute('aria-label', `${t('sort_by')} ${t(sort.value === 'difficulty' ? 'sort_difficulty_desc' : 'sort_difficulty')}`);
    axesInfoPanel.hidden = !axesInfoOpen;
    axesInfoToggle.setAttribute('aria-expanded', String(axesInfoOpen));
    axesInfoToggle.setAttribute('aria-pressed', String(axesInfoOpen));
    // Search stays usable during an operation and can create new rows/editors.
    // Those controls must obey the same busy state as existing rows.
    if (busy) setBusy(true);
    positionOpenMore();
  }
  function localize(): void {
    privacy.textContent = t('privacy');
    transferNote.textContent = t('transfer');
    importText.textContent = t('import');
    files.setAttribute('aria-label', t('import'));
    searchText.textContent = t('search_label');
    search.placeholder = t('search');
    search.setAttribute('aria-label', t('search'));
    sortText.textContent = t('sort_by');
    pieceHeading.textContent = t('piece_column');
    difficultySort.textContent = t('rating_open');
    difficultySort.setAttribute('aria-label', `${t('sort_by')} ${t(sort.value === 'difficulty' ? 'sort_difficulty_desc' : 'sort_difficulty')}`);
    axesInfoToggle.title = t('rating_info');
    axesInfoToggle.setAttribute('aria-label', t('rating_info'));
    axesInfoPanel.setAttribute('aria-label', t('rating_info'));
    for (const { axis, dt, dd } of axesInfoPairs) {
      dt.textContent = axis === 'bimanual' ? `${t('rating_hands_short')} (${t('rating_bimanual')})` : t(`rating_${axis}`);
      dd.textContent = t(`rating_${axis}_desc`);
    }
    axesInfoSummary.textContent = t('rating_info_summary');
    for (const { key, option } of sortOptions) option.textContent = t(`sort_${key}`);
    filterText.textContent = t('filter');
    for (const { key, option } of options) option.textContent = t(key);
    tabsGroup.setAttribute('aria-label', t('filter'));
    for (const { key, button } of tabButtons) button.textContent = t(key);
    composerText.textContent = t('composer_filter');
    tagText.textContent = t('tag_filter');
    groupText.textContent = t('group_by');
    totalLegend.textContent = t('rating_filter_total');
    axisLegend.textContent = t('rating_filter_by_axis');
    axisLabelText.textContent = t('rating_filter_axis');
    for (const { value, option } of axisOptions) option.textContent = value ? t(`rating_${value}`) : t('rating_filter_any');
    totalRange.localize();
    axisRange.localize();
    for (const { key, option } of groupOptions) option.textContent = t(`group_${key}`);
    resetFilters.textContent = t('reset_filters');
    backup.textContent = t('backup');
    restoreText.textContent = t('restore');
    restore.setAttribute('aria-label', t('restore'));
    protection.textContent = protectedStorage === null ? '' : t(protectedStorage ? 'protected' : 'unprotected');
    if (statusCopy) status.textContent = t(statusCopy.key, statusCopy.values);
    render();
  }
  function requestProtection(): void {
    // Invoked directly during the user's import gesture, not during app initialization.
    const manager = navigator.storage;
    if (!manager?.persist) { protectedStorage = false; localize(); return; }
    try {
      void manager.persist().then(granted => { protectedStorage = granted; localize(); })
        .catch(() => { protectedStorage = false; localize(); });
    } catch { protectedStorage = false; localize(); }
  }
  files.addEventListener('click', requestProtection);
  restore.addEventListener('click', requestProtection);
  files.addEventListener('change', () => {
    const selected = Array.from(files.files ?? []);
    if (!selected.length || busy) { files.value = ''; return; }
    void run(async () => {
      let added = 0; let duplicates = 0; let errors = 0;
      for (const file of selected) {
        try {
          const metadata = await host.inspect(file);
          const result = await librarySave(file, metadata);
          if (result.duplicate) duplicates++; else added++;
        } catch {
          errors++;
          const failed = element('li');
          failed.textContent = file.name;
          failures.append(failed);
          failures.hidden = false;
        }
      }
      await refresh();
      notice('import_result', { added, duplicates, errors });
      files.value = '';
    });
  });
  restore.addEventListener('change', () => {
    const file = restore.files?.[0];
    if (!file || busy) { restore.value = ''; return; }
    void run(async () => {
      try {
        await host.flush();
        const result = await libraryRestore(file, candidate => host.inspect(candidate));
        await refresh();
        notice('restore_result', { added: result.added, duplicates: result.duplicates });
      } finally { restore.value = ''; }
    }, 'restore_failed');
  });
  backup.addEventListener('click', () => { void run(async () => {
    await host.flush();
    download(await libraryExport(), 'etude-library.json');
    notice('backup_saved');
  }); });
  search.addEventListener('input', render);
  sort.addEventListener('change', render);
  difficultySort.addEventListener('click', () => {
    if (busy) return;
    sort.value = sort.value === 'difficulty' ? 'difficulty_desc' : 'difficulty';
    render();
  });
  axesInfoToggle.addEventListener('click', () => {
    if (busy) return;
    axesInfoOpen = !axesInfoOpen;
    render();
  });
  columns.addEventListener('keydown', event => {
    if (event.key === 'Escape' && axesInfoOpen) {
      event.stopPropagation();
      axesInfoOpen = false;
      render();
      axesInfoToggle.focus();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!openMoreId) return;
    const activeRow = rows.get(openMoreId);
    const target = event.target as Node | null;
    if (!activeRow || (target && !activeRow.secondary.contains(target) && !activeRow.more.contains(target))) {
      closeOpenMore();
    }
  });
  scroll.addEventListener('scroll', positionOpenMore, { passive: true });
  window.addEventListener('scroll', positionOpenMore, { passive: true });
  window.addEventListener('resize', positionOpenMore);
  filter.addEventListener('change', render);
  composerFilter.addEventListener('change', render);
  tagFilter.addEventListener('change', render);
  group.addEventListener('change', render);
  axisSelect.addEventListener('change', () => {
    if (!axisSelect.value) axisRange.clear();
    render();
  });
  for (const { key, button } of tabButtons) {
    button.addEventListener('click', () => {
      if (busy) return;
      filter.value = key;
      render();
    });
  }
  toggleFilters.addEventListener('click', () => {
    if (busy) return;
    filtersOpen = !filtersOpen;
    render();
  });
  resetFilters.addEventListener('click', () => {
    if (busy) return;
    const wasFocused = document.activeElement === resetFilters;
    search.value = '';
    sort.value = 'added';
    filter.value = 'all';
    composerFilter.value = '';
    tagFilter.value = '';
    group.value = 'none';
    totalRange.clear();
    clearAxisFilter();
    render();
    if (wasFocused) search.focus();
  });
  selectAll.addEventListener('change', () => {
    if (busy) return;
    const shownIds = Array.from(rows.keys());
    const allChecked = shownIds.length > 0 && shownIds.every(id => selectedIds.has(id));
    if (allChecked) selectedIds.clear();
    else for (const id of shownIds) selectedIds.add(id);
    render();
  });
  deleteSelected.addEventListener('click', async () => {
    const ids = [...selectedIds];
    if (!ids.length || busy) return;
    const ok = await (host.confirm ? host.confirm(t('delete_selected_confirm', { count: ids.length })) : Promise.resolve(window.confirm(t('delete_selected_confirm', { count: ids.length }))));
    if (!ok || busy) return;
    void run(async () => {
      await host.flush();
      const removed = await libraryRemoveMany(ids);
      selectedIds.clear();
      await refresh();
      if (statusCopy?.key !== 'unavailable') notice('deleted_many', { count: removed });
      search.focus();
    });
  });
  window.addEventListener('focus', () => { if (!busy) void refresh(); });
  document.addEventListener('visibilitychange', queueAutomaticRatings);
  window.addEventListener('beforeunload', event => {
    if (busy) { event.preventDefault(); event.returnValue = ''; }
  });
  const controller: LibraryController = {
    refresh, localize,
    prepareRating(item, estimate): void {
      if (needsRating(item)) void scoreForItem(item.id, referenceTempo(item.id, item), estimate);
    },
    notice(key: string): void {
      const known = ['save_failed', 'saving', 'saved', 'resume_failed'] as const;
      const match = known.find(candidate => candidate === key);
      if (match) notice(match);
    },
  };
  controllers.set(root, controller);
  localize();
  void refresh();
  return controller;
}

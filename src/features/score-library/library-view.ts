import { downloadBlob } from '../../domain/dom.js';
import type { DifficultyAxis } from '../../domain/score-difficulty.js';
import type {
  LibraryController, LibraryHost, LibraryItem, LibraryStudyStatus,
} from '../../domain/score-library-types.js';
import {
  libraryGet, libraryList, libraryRemove, libraryRemoveMany, libraryUpdate,
} from '../../domain/score-library-store.js';
import { libraryText, type LibraryTextKey } from '../../locales/library-runtime.js';
import {
  createAutoRatingController, exportLibraryBackup, importLibraryFiles,
  requestStorageProtection, restoreLibraryBackup,
} from './library-actions.js';
import {
  createDifficultyRange, createLibraryEditor, element, renderRatingDetailsPanel,
  starGraphic, starNumber, type LibraryEditor, type LibraryValues,
} from './library-dialogs.js';
import {
  AXES, GROUP_KEYS, SORT_KEYS, VIEW_KEYS, collectFilterFacetValues, computeGroupCounts,
  currentEstimateFor, displayedAxisFor, displayedStarsFor, filterAndSortLibraryItems,
  formatResumeTime, groupMetaFor, needsRating, nextStudyStatus, referenceTempo,
  type DifficultyRange, type LibraryEstimate, type LibraryGroupKey, type LibrarySortKey,
  type LibraryViewKey,
} from './library-query.js';

const controllers = new WeakMap<HTMLElement, LibraryController>();

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
  editor: LibraryEditor | null;
};

/** Controls and file inputs are created once. Refresh only reconciles library rows. */
export function initScoreLibrary(root: HTMLElement, host: LibraryHost): LibraryController {
  const existing = controllers.get(root);
  if (existing) return existing;
  const t = (key: LibraryTextKey, values?: LibraryValues): string => libraryText(host.language(), key, values);
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
  const options = VIEW_KEYS.map((key) => {
    const option = element('option');
    option.value = key;
    filter.append(option);
    return { key, option };
  });
  filterLabel.append(filterText, filter);
  const sortLabel = element('label', 'score-library-filter score-library-sort');
  const sortText = element('span');
  const sort = element('select');
  sort.id = 'library-sort';
  const sortOptions = SORT_KEYS.map((key) => {
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
  const groupOptions = GROUP_KEYS.map((key) => {
    const option = element('option');
    option.value = key;
    group.append(option);
    return { key, option };
  });
  groupLabel.append(groupText, group);
  const tabsGroup = element('div', 'score-library-tabs');
  tabsGroup.setAttribute('role', 'group');
  const tabButtons = VIEW_KEYS.map((key) => {
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
  const axisOptions = (['', ...AXES] as const).map((value) => {
    const option = element('option');
    option.value = value;
    axisSelect.append(option);
    return { value, option };
  });
  axisLabel.append(axisLabelText, axisSelect);
  axisFilter.append(axisLegend, axisLabel);
  const totalRange = createDifficultyRange('library-difficulty-total', () => render());
  const axisRange = createDifficultyRange('library-difficulty-axis', () => render());
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
  const axesInfoIcon = element('span', 'score-library-axes-info-icon');
  axesInfoIcon.setAttribute('aria-hidden', 'true');
  axesInfoIcon.textContent = 'i';
  axesInfoToggle.append(axesInfoIcon);
  axesInfoToggle.setAttribute('aria-controls', 'library-axes-info-panel');
  axesInfoToggle.setAttribute('aria-expanded', 'false');
  difficultyHead.append(difficultySort, axesInfoToggle);
  const axesInfoPanel = element('div', 'score-library-axes-info-panel');
  axesInfoPanel.id = 'library-axes-info-panel';
  axesInfoPanel.setAttribute('role', 'region');
  axesInfoPanel.tabIndex = -1;
  axesInfoPanel.hidden = true;
  const axesInfoList = element('dl', 'score-library-axes-guide');
  const axesInfoPairs = AXES.map((axis) => {
    const pair = element('div');
    const dt = element('dt');
    const dd = element('dd');
    pair.append(dt, dd);
    axesInfoList.append(pair);
    return { axis, dt, dd };
  });
  const axesInfoNotes = element('ul', 'score-library-axes-guide-note');
  const axesInfoNoteItems = (['summary', 'endurance', 'limits'] as const).map((key) => {
    const li = element('li');
    const label = element('strong');
    const body = element('span');
    li.append(label, ' ', body);
    axesInfoNotes.append(li);
    return { key, label, body };
  });
  axesInfoPanel.append(axesInfoList, axesInfoNotes);
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
  transfer.append(privacy, transferNote, backup, restoreLabel);
  content.append(toolbar, protection, status, corruptStatus, failures, scroll, emptyBox, transfer);
  details.append(summary, content);
  root.append(details);

  let items: LibraryItem[] = [];
  let loaded = false;
  let needsRefresh = false;
  let busy = false;
  let statusCopy: { key: LibraryTextKey; values?: LibraryValues } | null = null;
  let corruptCount = 0;
  let protectedStorage: boolean | null = null;
  let readSequence = 0;
  let editingId: string | null = null;
  let openMoreId: string | null = null;
  let axesInfoOpen = false;
  let filtersOpen = false;
  let openTempoForId: string | null = null;
  const selectedIds = new Set<string>();
  const rows = new Map<string, Row>();
  const estimates = new Map<string, LibraryEstimate>();

  const statusLabel = (value: LibraryStudyStatus | undefined): string => {
    if (value === 'in_progress') return t('status_in_progress');
    if (value === 'mastered') return t('status_mastered');
    return t('status_none');
  };
  const groupLabels = () => ({
    statusLabel,
    unknownComposer: t('unknown_composer'),
    untagged: t('untagged'),
  });
  const selectedDifficultyAxis = (): DifficultyAxis | undefined => AXES.find((axis) => axis === axisSelect.value);
  const clearAxisFilter = (): void => { axisSelect.value = ''; axisRange.clear(); };
  const syncDifficultyFilters = (): void => {
    axisSelect.disabled = busy;
    axisRange.controls.hidden = !axisSelect.value;
    totalRange.sync(busy);
    axisRange.sync(busy);
  };
  const ratingAffectsResults = (): boolean =>
    sort.value === 'difficulty' || sort.value === 'difficulty_desc' || !!totalRange.read() || !!(axisSelect.value && axisRange.read());

  function notice(key: LibraryTextKey, values?: LibraryValues): void {
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
    if (!value) autoRating.queueAutomaticRatings();
  }

  async function run(action: () => Promise<void>, errorKey: LibraryTextKey = 'action_failed'): Promise<void> {
    if (busy) return;
    setBusy(true);
    failures.replaceChildren();
    failures.hidden = true;
    notice('working');
    try { await action(); } catch { notice(errorKey); } finally { setBusy(false); }
  }

  async function refresh(): Promise<void> {
    const sequence = ++readSequence;
    try {
      let corrupt = 0;
      const next = await libraryList((count) => { corrupt = count; });
      if (sequence !== readSequence) return;
      items = next;
      const ids = new Set(next.map((item) => item.id));
      for (const id of estimates.keys()) if (!ids.has(id)) estimates.delete(id);
      corruptCount = corrupt;
      if (editingId !== null && !items.some((item) => item.id === editingId)) editingId = null;
      loaded = true;
      render();
      host.onItemsChanged?.(items);
      autoRating.queueAutomaticRatings();
    } catch {
      // Do not turn a storage failure into a false empty-library message.
      if (sequence === readSequence) notice('unavailable');
    }
  }

  const autoRating = createAutoRatingController({
    host,
    estimates,
    getItems: () => items,
    isBusy: () => busy,
    ratingAffectsResults,
    updateRowRating: (id) => updateRowRating(id),
    renderPreservingFocus: () => {
      const focused = document.activeElement;
      const restoreFocus = focused instanceof HTMLElement && list.contains(focused);
      render();
      if (restoreFocus && document.activeElement === document.body) {
        (list.contains(focused) ? focused : toggleFilters).focus({ preventScroll: true });
      }
    },
    refresh,
    run,
    notice,
    getStatusKey: () => statusCopy?.key,
  });

  function updateRowRating(id: string): void {
    const row = rows.get(id);
    const item = items.find((it) => it.id === id);
    if (!row || !item) return;
    const locale = host.language();
    const result = currentEstimateFor(estimates, id, item)?.result;
    const stars = displayedStarsFor(estimates, item);
    const provisional = result?.uncertainty.tempoFallback ?? item.difficultyRating?.assessment?.tempoFallback;
    const label = t(result === undefined ? 'rating_open' : 'rating_unavailable');
    if (stars === undefined) {
      if (row.rating.textContent !== '—') row.rating.textContent = '—';
    } else if (row.rating.querySelector('.score-library-rating-number')?.textContent !== starNumber(locale, stars)) {
      row.rating.replaceChildren(starGraphic(locale, stars));
    }
    row.rating.setAttribute('aria-label', stars === undefined ? label : t('rating_summary', {
      rating: starNumber(locale, stars),
    }) + (provisional ? `. ${t('estimate_tempo_provisional')}` : ''));
    row.rating.dataset.rated = String(stars !== undefined);
    row.rating.dataset.provisional = String(provisional === true);
    row.rating.title = provisional ? t('estimate_tempo_provisional') : '';
    const axisValues = AXES.map((axis) => displayedAxisFor(item, axis, result));
    const axisSignature = locale + ':' + axisValues.join(',');
    row.axes.hidden = axisValues.every((value) => value === undefined);
    if (row.axes.dataset.values !== axisSignature) {
      row.axes.dataset.values = axisSignature;
      row.axes.replaceChildren(...AXES.map((axis, index) => {
        const pair = element('div');
        const name = element('dt');
        const value = element('dd');
        const axisStars = axisValues[index];
        name.textContent = t(axis === 'bimanual' ? 'rating_hands_short' : `rating_${axis}`);
        pair.title = `${t(`rating_${axis}`)}: ${t(`rating_${axis}_desc`)}`;
        if (axisStars === undefined) {
          value.textContent = '—';
        } else {
          const num = element('span', 'score-library-axis-number');
          num.textContent = starNumber(locale, axisStars);
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
    renderRatingDetailsPanel({
      container: row.ratingDetails,
      item,
      result,
      locale,
      busy,
      t,
      onRequestEstimate: () => { void autoRating.scoreForItem(id); },
      onOpenTempo: () => {
        if (busy) return;
        editingId = id;
        openTempoForId = id;
        render();
        rows.get(id)?.editor?.enableTempo();
        const input = rows.get(id)?.editor?.form.querySelector<HTMLInputElement>('[data-library-field="difficulty-tempo"]');
        input?.focus();
      },
      onSaveRating: (estimate) => autoRating.saveRating(id, estimate, row.more),
    });
  }

  function syncSelectOptions(select: HTMLSelectElement, allLabel: string, values: string[], noneLabel: string, hasNone: boolean): void {
    const previous = select.value;
    const valid = new Set<string>(['', ...values, ...(hasNone ? ['__none__'] : [])]);
    const choices = [{ value: '', label: allLabel }, ...values.map((value) => ({ value, label: value })),
      ...(hasNone ? [{ value: '__none__', label: noneLabel }] : [])];
    const makeOption = (value: string, label: string): HTMLOptionElement => {
      const option = element('option');
      option.value = value;
      option.textContent = label;
      return option;
    };
    const unchanged = select.options.length === choices.length && choices.every((option, i) =>
      select.options[i].value === option.value && select.options[i].textContent === option.label);
    if (!unchanged) select.replaceChildren(...choices.map((option) => makeOption(option.value, option.label)));
    select.value = valid.has(previous) ? previous : '';
  }

  function syncFilterOptions(): void {
    const facets = collectFilterFacetValues(items, host.language());
    syncSelectOptions(composerFilter, t('all_composers'), facets.composers, t('unknown_composer'), facets.hasEmptyComposer);
    syncSelectOptions(tagFilter, t('all_tags'), facets.tags, t('untagged'), facets.hasEmptyTag);
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
    const docRoot = document.documentElement;
    const styles = getComputedStyle(docRoot);
    const headerHeight = parseFloat(styles.getPropertyValue('--hdr-h')) || 0;
    const dockHeight = parseFloat(styles.getPropertyValue('--dock-h')) || 0;
    const margin = 8;
    const gap = 4;
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
    secondary.style.left = `${Math.max(margin, Math.min(anchor.right - menu.width, docRoot.clientWidth - menu.width - margin))}px`;
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
    secondary.setAttribute('role', 'menu');
    secondary.hidden = true;
    const fileDetails = element('div', 'score-library-original-info');
    fileDetails.append(name, last);
    secondary.append(fileDetails);
    const makeButton = (action: string, container = actions): HTMLButtonElement => {
      const button = element('button');
      button.type = 'button';
      button.dataset.libraryAction = action;
      button.disabled = busy;
      if (container === secondary) button.setAttribute('role', 'menuitem');
      container.append(button);
      return button;
    };
    const open = makeButton('open', title);
    const favorite = makeButton('favorite');
    const more = makeButton('more');
    more.setAttribute('aria-haspopup', 'menu');
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

    const menuItems = () => Array.from(secondary.querySelectorAll<HTMLButtonElement>('[role=menuitem]')).filter((btn) => !btn.disabled && !btn.hidden);
    const toggleMore = (isOpen: boolean, restoreFocus = true, focusMenu = false) => {
      if (isOpen) closeOpenMore(id);
      secondary.hidden = !isOpen;
      more.setAttribute('aria-expanded', String(isOpen));
      openMoreId = isOpen ? id : (openMoreId === id ? null : openMoreId);
      if (isOpen) {
        secondary.scrollTop = 0;
        positionOpenMore();
        if (focusMenu) menuItems()[0]?.focus();
      } else if (restoreFocus) more.focus();
    };
    more.addEventListener('click', (event) => toggleMore(Boolean(secondary.hidden), true, event.detail === 0));
    more.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' && secondary.hidden) {
        event.preventDefault();
        toggleMore(true, true, true);
      }
    });
    secondary.addEventListener('keydown', (event) => {
      const enabled = menuItems();
      const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
      if (!enabled.length) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        enabled[(index + 1) % enabled.length].focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        enabled[(index - 1 + enabled.length) % enabled.length].focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        enabled[0].focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        enabled[enabled.length - 1].focus();
      } else if (event.key === 'Tab') {
        toggleMore(false, false);
      }
    });
    node.addEventListener('keydown', (event) => {
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
      if (currentEstimateFor(estimates, id, items.find((it) => it.id === id))?.result === null) estimates.delete(id);
      updateRowRating(id);
      ratingDetails.focus({ preventScroll: true });
    });
    select.addEventListener('change', () => {
      if (busy) return;
      if (select.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      render();
    });
    open.addEventListener('click', () => {
      void run(async () => {
        await host.flush();
        const stored = await libraryGet(id);
        if (!stored || !await host.open(stored.item, stored.file)) throw new Error('open');
        // The host owns checkpoints; refreshing here reflects its successful open.
        await refresh();
        if (statusCopy?.key === 'working') { statusCopy = null; status.textContent = ''; }
      });
    });
    statusBtn.addEventListener('click', () => {
      toggleMore(false, false);
      void run(async () => {
        const current = items.find((item) => item.id === id);
        if (!current) throw new Error('missing');
        const updated = await libraryUpdate(id, { status: nextStudyStatus(current.status) });
        if (!updated) { await refresh(); throw new Error('missing'); }
        await refresh();
        if (statusCopy?.key === 'working') { statusCopy = null; status.textContent = ''; }
      }).then(() => { if (more.isConnected) more.focus(); });
    });
    favorite.addEventListener('click', () => {
      void run(async () => {
        const current = items.find((item) => item.id === id);
        if (!current) throw new Error('missing');
        const updated = await libraryUpdate(id, { favorite: !current.favorite });
        if (!updated) { await refresh(); throw new Error('missing'); }
        await refresh();
        if (statusCopy?.key === 'working') { statusCopy = null; status.textContent = ''; }
      });
    });
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
        downloadBlob(stored.item.name, stored.file);
        statusCopy = null;
        status.textContent = '';
      }).then(() => { if (more.isConnected) more.focus(); });
    });
    const confirmAction = (message: string): Promise<boolean> =>
      host.confirm ? host.confirm(message) : Promise.resolve(window.confirm(message));
    remove.addEventListener('click', async () => {
      const current = items.find((item) => item.id === id);
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
    return {
      node, groupHeading, select, rating, axes, ratingDetails, ratingToggle, more, secondary, toggleMore,
      composer, badges, name, last, position, progress, metadata, userNote, open, statusBtn, favorite,
      edit, download: original, remove, editor: null,
    };
  }

  let chipsSignature = '';
  function syncActiveChips(total: DifficultyRange | null, axis: DifficultyAxis | undefined, range: DifficultyRange | null): void {
    const locale = host.language();
    const rangeLabel = ({ min, max }: DifficultyRange) => `${starNumber(locale, min)}–${starNumber(locale, max)}`;
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
    const active = specs.filter((spec) => spec.active);
    if (filtersOpen || !active.length) {
      chipsSignature = '';
      activeChips.hidden = true;
      activeChips.replaceChildren();
      return;
    }
    const signature = JSON.stringify([t('reset_filters'), ...active.map((spec) => spec.label)]);
    if (signature === chipsSignature) return;
    chipsSignature = signature;
    const buttons = active.map((spec) => {
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

    const groupKey = group.value as LibraryGroupKey;
    const labels = groupLabels();
    const shown = filterAndSortLibraryItems(items, estimates, {
      query: search.value,
      filter: filter.value as LibraryViewKey,
      sort: sort.value as LibrarySortKey,
      composerFilter: composerFilter.value,
      tagFilter: tagFilter.value,
      group: groupKey,
      totalRange: total,
      axis,
      axisRange: axisBounds,
      locale,
    }, labels);
    const groupCounts = computeGroupCounts(shown, groupKey, tagFilter.value, labels);

    const visible = new Set(shown.map((item) => item.id));
    for (const id of selectedIds) {
      if (!visible.has(id)) selectedIds.delete(id);
    }
    if (shown.length > 0) {
      if (!bulkBar.isConnected) content.insertBefore(bulkBar, scroll);
      selectAllText.textContent = t('select_all', { count: shown.length });
      selectAll.setAttribute('aria-label', selectAllText.textContent);
      const allSelected = shown.every((item) => selectedIds.has(item.id));
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
        row.node.remove();
        rows.delete(id);
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
      if (groupKey !== 'none') {
        const { label } = groupMetaFor(item, groupKey, tagFilter.value, labels);
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
        row.position.textContent = t('position', { measure: item.resume.measure || '—', time: formatResumeTime(item.resume) });
      }
      const progressParts: string[] = [];
      if (item.best !== undefined) progressParts.push(t('best', { best: item.best }));
      if (item.lastPlayedDay !== undefined) {
        progressParts.push(t('last_played', {
          date: new Date(item.lastPlayedDay * 86_400_000).toLocaleDateString(locale, { timeZone: 'UTC' }),
        }));
      }
      row.progress.hidden = !progressParts.length;
      row.progress.textContent = progressParts.join(' · ');
      row.metadata.hidden = !item.resume && !progressParts.length && !badgeNodes.length;
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
          row.editor = createLibraryEditor(item.id, item, row.more, {
            host,
            t,
            isBusy: () => busy,
            getItems: () => items,
            consumeOpenTempo: (targetId) => {
              if (openTempoForId === targetId) {
                openTempoForId = null;
                return true;
              }
              return false;
            },
            saveRating: autoRating.saveRating,
            run,
            refresh,
            notice,
            closeEditor: () => { editingId = null; },
            isEditing: (targetId) => editingId === targetId,
            render,
          });
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
    if (busy) setBusy(true);
    positionOpenMore();
  }

  function localize(): void {
    const locale = host.language();
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
    for (const { key, label, body } of axesInfoNoteItems) {
      label.textContent = t(`rating_info_${key}_label`);
      body.textContent = t(`rating_info_${key}`);
    }
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
    totalRange.localize(locale, t);
    axisRange.localize(locale, t);
    for (const { key, option } of groupOptions) option.textContent = t(`group_${key}`);
    resetFilters.textContent = t('reset_filters');
    backup.textContent = t('backup');
    restoreText.textContent = t('restore');
    restore.setAttribute('aria-label', t('restore'));
    protection.textContent = protectedStorage === null ? '' : t(protectedStorage ? 'protected' : 'unprotected');
    if (statusCopy) status.textContent = t(statusCopy.key, statusCopy.values);
    render();
  }

  const onRequestProtection = (): void => {
    requestStorageProtection((granted) => {
      protectedStorage = granted;
      localize();
    });
  };
  files.addEventListener('click', onRequestProtection);
  restore.addEventListener('click', onRequestProtection);
  files.addEventListener('change', () => {
    const selected = Array.from(files.files ?? []);
    if (!selected.length || busy) { files.value = ''; return; }
    void run(async () => {
      const result = await importLibraryFiles(selected, host, (fileName) => {
        const failed = element('li');
        failed.textContent = fileName;
        failures.append(failed);
        failures.hidden = false;
      });
      await refresh();
      notice('import_result', result);
      files.value = '';
    });
  });
  restore.addEventListener('change', () => {
    const file = restore.files?.[0];
    if (!file || busy) { restore.value = ''; return; }
    void run(async () => {
      try {
        const result = await restoreLibraryBackup(file, host);
        await refresh();
        notice('restore_result', result);
      } finally { restore.value = ''; }
    }, 'restore_failed');
  });
  backup.addEventListener('click', () => {
    void run(async () => {
      const { skipped } = await exportLibraryBackup(host);
      if (skipped > 0) notice('lib_export_skipped', { count: skipped });
      else notice('backup_saved');
    });
  });
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
  columns.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && axesInfoOpen) {
      event.stopPropagation();
      axesInfoOpen = false;
      render();
      axesInfoToggle.focus();
    }
  });
  document.addEventListener('pointerdown', (event) => {
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
    const allChecked = shownIds.length > 0 && shownIds.every((id) => selectedIds.has(id));
    if (allChecked) selectedIds.clear();
    else for (const id of shownIds) selectedIds.add(id);
    render();
  });
  deleteSelected.addEventListener('click', async () => {
    const ids = [...selectedIds];
    if (!ids.length || busy) return;
    const ok = await (host.confirm
      ? host.confirm(t('delete_selected_confirm', { count: ids.length }))
      : Promise.resolve(window.confirm(t('delete_selected_confirm', { count: ids.length }))));
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
  const isVisible = () => !root.closest('[hidden]') && root.offsetParent !== null;
  details.addEventListener('toggle', () => {
    if (details.open && needsRefresh && !busy && isVisible()) {
      needsRefresh = false;
      void refresh();
    }
  });
  window.addEventListener('focus', () => {
    if (busy) return;
    if (!isVisible()) {
      needsRefresh = true;
      return;
    }
    needsRefresh = false;
    void refresh();
  });
  document.addEventListener('visibilitychange', () => autoRating.queueAutomaticRatings());
  window.addEventListener('beforeunload', (event) => {
    if (busy) { event.preventDefault(); event.returnValue = ''; }
  });
  const controller: LibraryController = {
    refresh: () => {
      needsRefresh = false;
      return refresh();
    },
    localize: () => {
      localize();
      if (needsRefresh && !busy && isVisible()) {
        needsRefresh = false;
        void refresh();
      }
    },
    prepareRating(item, estimate): void {
      if (needsRating(estimates, item)) void autoRating.scoreForItem(item.id, referenceTempo(item), estimate);
    },
    notice(key: string): void {
      const known = ['save_failed', 'saving', 'saved', 'resume_failed'] as const;
      const match = known.find((candidate) => candidate === key);
      if (match) notice(match);
    },
  };
  controllers.set(root, controller);
  localize();
  void refresh();
  return controller;
}

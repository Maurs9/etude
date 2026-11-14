import type { LibraryController, LibraryHost, LibraryItem } from './score-library-types.js';
import { libraryExport, libraryGet, libraryList, libraryRemove, libraryRemoveMany, libraryRestore, librarySave, libraryUpdate } from './score-library-store.js';
import { libraryText, type LibraryTextKey } from '../locales/library-runtime.js';

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
  const options = (['all', 'favorites', 'recent'] as const).map(key => {
    const option = element('option');
    option.value = key;
    filter.append(option);
    return { key, option };
  });
  filterLabel.append(filterText, filter);
  const composerLabel = element('label', 'score-library-filter');
  const composerText = element('span');
  const composerFilter = element('select');
  composerFilter.id = 'library-composer-filter';
  composerLabel.append(composerText, composerFilter);
  const levelLabel = element('label', 'score-library-filter');
  const levelText = element('span');
  const levelFilter = element('select');
  levelFilter.id = 'library-level-filter';
  levelLabel.append(levelText, levelFilter);
  const tagLabel = element('label', 'score-library-filter');
  const tagText = element('span');
  const tagFilter = element('select');
  tagFilter.id = 'library-tag-filter';
  tagLabel.append(tagText, tagFilter);
  const groupLabel = element('label', 'score-library-filter');
  const groupText = element('span');
  const group = element('select');
  group.id = 'library-group';
  const groupOptions = (['none', 'composer', 'level', 'tag'] as const).map(key => {
    const option = element('option');
    option.value = key;
    group.append(option);
    return { key, option };
  });
  groupLabel.append(groupText, group);
  const resetFilters = element('button', 'score-library-reset');
  resetFilters.id = 'library-reset-filters';
  resetFilters.type = 'button';
  const toolbarMain = element('div', 'score-library-toolbar-main');
  toolbarMain.append(importLabel, searchLabel, groupLabel);
  const toolbarFilters = element('div', 'score-library-toolbar-filters');
  toolbarFilters.append(filterLabel, composerLabel, levelLabel, tagLabel);
  toolbar.append(toolbarMain, toolbarFilters);
  const protection = element('p', 'score-library-note');
  protection.id = 'library-protection';
  const status = element('p', 'score-library-status');
  status.id = 'library-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
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
  const empty = element('p', 'score-library-note');
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
  content.append(privacy, toolbar, protection, status, failures, list, empty, transfer);
  details.append(summary, content);
  root.append(details);

  let items: LibraryItem[] = [];
  let loaded = false;
  let busy = false;
  let statusCopy: { key: LibraryTextKey; values?: Values } | null = null;
  let protectedStorage: boolean | null = null;
  let readSequence = 0;
  let editingId: string | null = null;
  const selectedIds = new Set<string>();
  type Editor = { form: HTMLFormElement; titleText: HTMLElement; composerText: HTMLElement; levelText: HTMLElement; tagsText: HTMLElement; levelList: HTMLDataListElement; save: HTMLButtonElement; cancel: HTMLButtonElement };
  type Row = { node: HTMLLIElement; groupHeading: HTMLElement; select: HTMLInputElement; title: HTMLElement; composer: HTMLElement; badges: HTMLElement; name: HTMLElement; position: HTMLElement; last: HTMLElement; progress: HTMLElement; open: HTMLButtonElement; favorite: HTMLButtonElement; edit: HTMLButtonElement; download: HTMLButtonElement; remove: HTMLButtonElement; editor: Editor | null };
  const rows = new Map<string, Row>();
  function notice(key: LibraryTextKey, values?: Values): void {
    statusCopy = { key, values };
    status.textContent = t(key, values);
    if (key === 'save_failed' || key === 'unavailable' || key === 'restore_failed' || key === 'action_failed') details.open = true;
  }
  function setBusy(value: boolean): void {
    busy = value;
    content.setAttribute('aria-busy', String(value));
    files.disabled = restore.disabled = backup.disabled = resetFilters.disabled = selectAll.disabled = value;
    deleteSelected.disabled = value || selectedIds.size === 0;
    for (const button of list.querySelectorAll('button')) button.disabled = value;
    for (const input of list.querySelectorAll('input')) input.disabled = value;
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
      const next = await libraryList();
      if (sequence !== readSequence) return;
      items = next;
      if (editingId !== null && !items.some(item => item.id === editingId)) editingId = null;
      loaded = true;
      render();
    } catch {
      // Do not turn a storage failure into a false empty-library message.
      if (sequence === readSequence) notice('unavailable');
    }
  }
  function syncSelectOptions(select: HTMLSelectElement, allLabel: string, values: string[], noneLabel: string, hasNone: boolean): void {
    const previous = select.value;
    const valid = new Set<string>(['', ...values, ...(hasNone ? ['__none__'] : [])]);
    const nextOptions: HTMLOptionElement[] = [];
    const makeOption = (value: string, label: string): HTMLOptionElement => {
      const option = element('option');
      option.value = value;
      option.textContent = label;
      return option;
    };
    nextOptions.push(makeOption('', allLabel));
    for (const value of values) nextOptions.push(makeOption(value, value));
    if (hasNone) nextOptions.push(makeOption('__none__', noneLabel));
    select.replaceChildren(...nextOptions);
    select.value = valid.has(previous) ? previous : '';
  }
  function syncFilterOptions(): void {
    const locale = host.language();
    const composers = new Set<string>();
    let hasEmptyComposer = false;
    const levels = new Set<string>();
    let hasEmptyLevel = false;
    const tags = new Set<string>();
    let hasEmptyTag = false;
    for (const item of items) {
      const composer = item.composer.trim();
      if (composer) composers.add(composer);
      else hasEmptyComposer = true;
      if (item.level) levels.add(item.level);
      else hasEmptyLevel = true;
      if (item.tags?.length) {
        for (const tag of item.tags) tags.add(tag);
      } else {
        hasEmptyTag = true;
      }
    }
    syncSelectOptions(composerFilter, t('all_composers'), [...composers].sort((a, b) => a.localeCompare(b, locale)), t('unknown_composer'), hasEmptyComposer);
    syncSelectOptions(levelFilter, t('all_levels'), [...levels].sort((a, b) => a.localeCompare(b, locale, { numeric: true })), t('no_level'), hasEmptyLevel);
    syncSelectOptions(tagFilter, t('all_tags'), [...tags].sort((a, b) => a.localeCompare(b, locale)), t('untagged'), hasEmptyTag);
  }
  function syncLevelPresets(datalist: HTMLDataListElement): void {
    const seen = new Set<string>();
    const optionsList: HTMLOptionElement[] = [];
    const addPreset = (label: string): void => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const key = trimmed.toLocaleLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const option = element('option');
      option.value = trimmed;
      optionsList.push(option);
    };
    for (const preset of t('level_presets').split(',')) addPreset(preset);
    for (const item of items) {
      if (item.level) addPreset(item.level);
    }
    datalist.replaceChildren(...optionsList);
  }
  function createEditor(id: string, item: LibraryItem, row: Row): Editor {
    const form = element('form', 'score-library-editor');
    const makeField = (field: string, value: string, maxLength?: number): { text: HTMLElement; input: HTMLInputElement } => {
      const label = element('label');
      const text = element('span');
      const input = element('input');
      input.type = 'text';
      input.dataset.libraryField = field;
      input.value = value;
      if (maxLength) input.maxLength = maxLength;
      input.disabled = busy;
      label.append(text, input);
      form.append(label);
      return { text, input };
    };
    const titleField = makeField('title', item.title, 512);
    const composerField = makeField('composer', item.composer, 512);
    const levelField = makeField('level', item.level ?? '', 64);
    const levelList = element('datalist');
    levelList.id = 'library-level-presets';
    levelField.input.setAttribute('list', levelList.id);
    syncLevelPresets(levelList);
    form.append(levelList);
    const tagsField = makeField('tags', (item.tags ?? []).join(', '));
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
      row.edit.focus();
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (busy) return;
      const tags = tagsField.input.value.split(',').map(part => part.trim()).filter(Boolean);
      void run(async () => {
        const updated = await libraryUpdate(id, {
          title: titleField.input.value.trim(),
          composer: composerField.input.value.trim(),
          level: levelField.input.value.trim(),
          tags,
        });
        if (!updated) throw new Error('missing');
        editingId = null;
        await refresh();
        notice('saved');
      });
    });
    return { form, titleText: titleField.text, composerText: composerField.text, levelText: levelField.text, tagsText: tagsField.text, levelList, save, cancel };
  }
  function createRow(id: string): Row {
    const node = element('li', 'score-library-item');
    node.dataset.libraryId = id;
    const groupHeading = element('div', 'score-library-group-heading');
    groupHeading.hidden = true;
    const select = element('input', 'score-library-check');
    select.type = 'checkbox';
    select.dataset.libraryAction = 'select';
    const info = element('div', 'score-library-info');
    const title = element('h3');
    const composer = element('p', 'score-library-composer');
    const badges = element('div', 'score-library-badges');
    badges.hidden = true;
    const metaBreak = element('div', 'score-library-meta-break');
    metaBreak.setAttribute('aria-hidden', 'true');
    const name = element('p', 'score-library-note');
    const last = element('p', 'score-library-note');
    const position = element('p', 'score-library-note');
    const progress = element('p', 'score-library-note score-library-progress');
    info.append(title, composer, badges, metaBreak, name, last, position, progress);
    const actions = element('div', 'score-library-actions');
    const makeButton = (action: string): HTMLButtonElement => {
      const button = element('button');
      button.type = 'button';
      button.dataset.libraryAction = action;
      button.disabled = busy;
      actions.append(button);
      return button;
    };
    const open = makeButton('open');
    const favorite = makeButton('favorite');
    const edit = makeButton('edit');
    const original = makeButton('download');
    const remove = makeButton('delete');
    node.append(groupHeading, select, info, actions);
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
    favorite.addEventListener('click', () => { void run(async () => {
      const current = items.find(item => item.id === id);
      if (!current) throw new Error('missing');
      const updated = await libraryUpdate(id, { favorite: !current.favorite });
      if (!updated) throw new Error('missing');
      await refresh();
      if (statusCopy?.key === 'working') { statusCopy = null; status.textContent = ''; }
    }); });
    edit.addEventListener('click', () => {
      if (busy) return;
      editingId = editingId === id ? null : id;
      render();
      if (editingId === id) rows.get(id)?.editor?.form.querySelector('input')?.focus();
    });
    original.addEventListener('click', () => { void run(async () => {
      const stored = await libraryGet(id);
      if (!stored) throw new Error('missing');
      download(stored.file, stored.item.name);
      statusCopy = null; status.textContent = '';
    }); });
    remove.addEventListener('click', () => {
      const current = items.find(item => item.id === id);
      if (!current || busy || !window.confirm(t('delete_confirm', { title: current.title || current.name }))) return;
      void run(async () => {
        await host.flush();
        await libraryRemove(id);
        await refresh();
        if (statusCopy?.key !== 'unavailable') notice('deleted');
        search.focus();
      });
    });
    return { node, groupHeading, select, title, composer, badges, name, last, position, progress, open, favorite, edit, download: original, remove, editor: null };
  }
  function groupMeta(item: LibraryItem): { label: string; empty: boolean } {
    if (group.value === 'composer') {
      const value = item.composer.trim();
      return { label: value || t('unknown_composer'), empty: !value };
    }
    if (group.value === 'level') {
      const value = item.level ?? '';
      return { label: value || t('no_level'), empty: !value };
    }
    if (group.value === 'tag') {
      if (tagFilter.value && tagFilter.value !== '__none__' && item.tags?.includes(tagFilter.value)) {
        return { label: tagFilter.value, empty: false };
      }
      const value = item.tags?.[0] ?? '';
      return { label: value || t('untagged'), empty: !value };
    }
    return { label: '', empty: true };
  }
  function render(): void {
    summary.textContent = t('heading', { count: items.length });
    syncFilterOptions();
    const query = search.value.trim().toLocaleLowerCase();
    search.dataset.active = String(Boolean(query));
    filter.dataset.active = String(filter.value !== 'all');
    composerFilter.dataset.active = String(Boolean(composerFilter.value));
    levelFilter.dataset.active = String(Boolean(levelFilter.value));
    tagFilter.dataset.active = String(Boolean(tagFilter.value));
    group.dataset.active = String(group.value !== 'none');
    const hasActiveFilters = Boolean(query || filter.value !== 'all' || composerFilter.value || levelFilter.value || tagFilter.value || group.value !== 'none');
    if (hasActiveFilters) {
      if (!resetFilters.isConnected) toolbarFilters.append(resetFilters);
    } else if (resetFilters.isConnected) {
      resetFilters.remove();
    }
    const shown = items.filter(item => {
      if (query) {
        const haystack = `${item.title}\n${item.composer}\n${item.name}\n${item.level ?? ''}\n${(item.tags ?? []).join('\n')}`.toLocaleLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (filter.value === 'favorites' && !item.favorite) return false;
      if (filter.value === 'recent' && item.lastOpenedAt === null) return false;
      if (composerFilter.value === '__none__' && item.composer.trim()) return false;
      if (composerFilter.value && composerFilter.value !== '__none__' && item.composer.trim() !== composerFilter.value) return false;
      if (levelFilter.value === '__none__' && item.level) return false;
      if (levelFilter.value && levelFilter.value !== '__none__' && item.level !== levelFilter.value) return false;
      if (tagFilter.value === '__none__' && item.tags?.length) return false;
      if (tagFilter.value && tagFilter.value !== '__none__' && !item.tags?.includes(tagFilter.value)) return false;
      return true;
    });
    const compareItems = (a: LibraryItem, b: LibraryItem): number =>
      filter.value === 'recent'
        ? (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0)
        : (b.addedAt - a.addedAt || a.id.localeCompare(b.id));
    if (group.value !== 'none') {
      const locale = host.language();
      shown.sort((a, b) => {
        const ga = groupMeta(a);
        const gb = groupMeta(b);
        if (ga.empty !== gb.empty) return ga.empty ? 1 : -1;
        const labelCmp = ga.label.localeCompare(gb.label, locale, { numeric: true });
        if (labelCmp !== 0) return labelCmp;
        return compareItems(a, b);
      });
    } else if (filter.value === 'recent') {
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
      if (!bulkBar.isConnected) content.insertBefore(bulkBar, list);
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
      if (!visible.has(id)) { row.node.remove(); rows.delete(id); }
    }
    let index = 0;
    let previousGroup: string | null = null;
    for (const item of shown) {
      let row = rows.get(item.id);
      if (!row) { row = createRow(item.id); rows.set(item.id, row); }
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
      row.title.textContent = title;
      row.composer.textContent = item.composer;
      row.composer.hidden = !item.composer.trim();
      const badgeNodes: HTMLElement[] = [];
      if (item.level) {
        const badge = element('span', 'score-library-badge score-library-badge-level');
        badge.textContent = t('level_badge', { level: item.level });
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
        date: new Date(item.lastOpenedAt).toLocaleString(host.language()),
      });
      row.position.hidden = !item.resume;
      if (item.resume) {
        const seconds = Math.max(0, Math.floor(item.resume.position));
        const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
        row.position.textContent = t('position', { measure: item.resume.measure || '—', time });
      }
      // Practice progress from whole-score runs in the player; older records have none.
      const progress: string[] = [];
      if (item.best !== undefined) progress.push(t('best', { best: item.best }));
      if (item.lastPlayedDay !== undefined) progress.push(t('last_played', {
        date: new Date(item.lastPlayedDay * 86_400_000).toLocaleDateString(host.language(), { timeZone: 'UTC' }),
      }));
      row.progress.hidden = !progress.length;
      row.progress.textContent = progress.join(' · ');
      row.open.textContent = t(item.resume ? 'resume' : 'open');
      row.open.setAttribute('aria-label', `${t(item.resume ? 'resume' : 'open')}: ${title}`);
      row.favorite.textContent = item.favorite ? '★' : '☆';
      row.favorite.setAttribute('aria-pressed', String(item.favorite));
      row.favorite.title = t('favorite', { title });
      row.favorite.setAttribute('aria-label', row.favorite.title);
      row.edit.textContent = t('edit');
      row.edit.setAttribute('aria-pressed', String(editingId === item.id));
      row.edit.setAttribute('aria-label', `${t('edit')}: ${title}`);
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
        row.editor.levelText.textContent = t('edit_level');
        row.editor.tagsText.textContent = t('edit_tags');
        syncLevelPresets(row.editor.levelList);
        row.editor.save.textContent = t('save_edit');
        row.editor.cancel.textContent = t('cancel_edit');
      } else if (row.editor) {
        row.editor.form.remove();
        row.editor = null;
      }
      // Do not detach focused controls when their row has not moved.
      if (list.children[index] !== row.node) list.insertBefore(row.node, list.children[index] ?? null);
      index++;
    }
    empty.hidden = !loaded || shown.length > 0;
    empty.textContent = t(items.length ? 'no_matches' : 'empty');
  }
  function localize(): void {
    privacy.textContent = t('privacy');
    transferNote.textContent = t('transfer');
    importText.textContent = t('import');
    files.setAttribute('aria-label', t('import'));
    searchText.textContent = t('search_label');
    search.placeholder = t('search');
    search.setAttribute('aria-label', t('search'));
    filterText.textContent = t('filter');
    for (const { key, option } of options) option.textContent = t(key);
    composerText.textContent = t('composer_filter');
    levelText.textContent = t('level_filter');
    tagText.textContent = t('tag_filter');
    groupText.textContent = t('group_by');
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
    if (!selected.length || busy) return;
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
    if (!file || busy) return;
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
  filter.addEventListener('change', render);
  composerFilter.addEventListener('change', render);
  levelFilter.addEventListener('change', render);
  tagFilter.addEventListener('change', render);
  group.addEventListener('change', render);
  resetFilters.addEventListener('click', () => {
    if (busy) return;
    search.value = '';
    filter.value = 'all';
    composerFilter.value = '';
    levelFilter.value = '';
    tagFilter.value = '';
    group.value = 'none';
    render();
  });
  selectAll.addEventListener('change', () => {
    if (busy) return;
    const shownIds = Array.from(rows.keys());
    const allChecked = shownIds.length > 0 && shownIds.every(id => selectedIds.has(id));
    if (allChecked) selectedIds.clear();
    else for (const id of shownIds) selectedIds.add(id);
    render();
  });
  deleteSelected.addEventListener('click', () => {
    const ids = [...selectedIds];
    if (!ids.length || busy || !window.confirm(t('delete_selected_confirm', { count: ids.length }))) return;
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
  window.addEventListener('beforeunload', event => {
    if (busy) { event.preventDefault(); event.returnValue = ''; }
  });
  const controller: LibraryController = {
    refresh, localize,
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

import type { LibraryController, LibraryHost, LibraryItem } from './score-library-types.js';
import { libraryExport, libraryGet, libraryList, libraryRemove, libraryRestore, librarySave, libraryUpdate } from './score-library-store.js';
import { libraryText, type LibraryTextKey } from '../locales/score-library.js';

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
  toolbar.append(importLabel, searchLabel, filterLabel);
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
  type Row = { node: HTMLLIElement; title: HTMLElement; composer: HTMLElement; name: HTMLElement; position: HTMLElement; last: HTMLElement; open: HTMLButtonElement; favorite: HTMLButtonElement; download: HTMLButtonElement; remove: HTMLButtonElement };
  const rows = new Map<string, Row>();
  function notice(key: LibraryTextKey, values?: Values): void {
    statusCopy = { key, values };
    status.textContent = t(key, values);
    if (key === 'save_failed' || key === 'unavailable' || key === 'restore_failed' || key === 'action_failed') details.open = true;
  }
  function setBusy(value: boolean): void {
    busy = value;
    content.setAttribute('aria-busy', String(value));
    files.disabled = restore.disabled = backup.disabled = value;
    for (const button of list.querySelectorAll('button')) button.disabled = value;
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
      loaded = true;
      render();
    } catch {
      // Do not turn a storage failure into a false empty-library message.
      if (sequence === readSequence) notice('unavailable');
    }
  }
  function createRow(id: string): Row {
    const node = element('li', 'score-library-item');
    node.dataset.libraryId = id;
    const info = element('div', 'score-library-info');
    const title = element('h3');
    const composer = element('p');
    const name = element('p', 'score-library-note');
    const last = element('p', 'score-library-note');
    const position = element('p', 'score-library-note');
    info.append(title, composer, name, last, position);
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
    const original = makeButton('download');
    const remove = makeButton('delete');
    node.append(info, actions);
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
    return { node, title, composer, name, last, position, open, favorite, download: original, remove };
  }
  function render(): void {
    summary.textContent = t('heading', { count: items.length });
    const query = search.value.trim().toLocaleLowerCase();
    const shown = items.filter(item =>
      (!query || `${item.title}\n${item.composer}\n${item.name}`.toLocaleLowerCase().includes(query)) &&
      (filter.value !== 'favorites' || item.favorite) && (filter.value !== 'recent' || item.lastOpenedAt !== null));
    if (filter.value === 'recent') shown.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
    const visible = new Set(shown.map(item => item.id));
    for (const [id, row] of rows) {
      if (!visible.has(id)) { row.node.remove(); rows.delete(id); }
    }
    let index = 0;
    for (const item of shown) {
      let row = rows.get(item.id);
      if (!row) { row = createRow(item.id); rows.set(item.id, row); }
      const title = item.title || item.name;
      row.title.textContent = title;
      row.composer.textContent = item.composer;
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
      row.open.textContent = t(item.resume ? 'resume' : 'open');
      row.open.setAttribute('aria-label', `${t(item.resume ? 'resume' : 'open')}: ${title}`);
      row.favorite.textContent = item.favorite ? '★' : '☆';
      row.favorite.setAttribute('aria-pressed', String(item.favorite));
      row.favorite.title = t('favorite', { title });
      row.favorite.setAttribute('aria-label', row.favorite.title);
      row.download.textContent = t('download');
      row.download.setAttribute('aria-label', `${t('download')}: ${item.name}`);
      row.remove.textContent = t('delete');
      row.remove.setAttribute('aria-label', `${t('delete')}: ${title}`);
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
    searchText.textContent = t('search');
    search.placeholder = t('search');
    filterText.textContent = t('filter');
    for (const { key, option } of options) option.textContent = t(key);
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

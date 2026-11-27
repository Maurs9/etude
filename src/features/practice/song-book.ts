import { byId, eventClosest, maybeById, selectById } from '../../domain/dom.js';
import type { IntervalSongDirection, IntervalSongNote } from '../../domain/interval-songs.js';
import { playControl } from '../../domain/practice-hint-dom.js';
import { INTERVALS } from '../../domain/repertoire-data.js';
import type { AppHost } from '../../domain/views.js';

interface IntervalSongPreview {
  frame: number;
  button?: HTMLButtonElement;
  card?: HTMLElement;
}

export interface SongBookDeps {
  readonly host: AppHost;
  readonly ivName: (semi: number) => string;
  readonly playIvDir: (root: number, semi: number, dir: string, style?: 'both' | 'harmonic' | 'melodic') => void;
  readonly pianoEnsure: (midis: readonly number[]) => Promise<boolean>;
  readonly setHintControlPressed: (button: HTMLButtonElement, pressed: boolean) => void;
}

export interface SongBookController {
  getDir(): IntervalSongDirection;
  setDir(dir: IntervalSongDirection): void;
  isPreviewing(): boolean;
  clearHintPlay(): void;
  clearSongPreview(): void;
  previewSong(notes: readonly IntervalSongNote[], button?: HTMLButtonElement, card?: HTMLElement): Promise<void>;
  render(): void;
  wireControls(onPanelToggle: () => void): void;
}

export function createSongBookController(deps: SongBookDeps): SongBookController {
  const { host } = deps;
  let songDir: IntervalSongDirection = 'asc';
  let intervalSongPreview: IntervalSongPreview | null = null;
  let intervalHintPlay: { button: HTMLButtonElement; card: HTMLElement; timer: number } | null = null;
  let intervalSongsMod: typeof import('../../domain/interval-songs.js') | null = null;
  let intervalSongsGen = 0;

  function clearHintPlay(): void {
    if (!intervalHintPlay) return;
    clearTimeout(intervalHintPlay.timer);
    deps.setHintControlPressed(intervalHintPlay.button, false);
    intervalHintPlay.card.classList.remove('is-playing');
    intervalHintPlay = null;
  }

  function clearSongPreview(): void {
    if (!intervalSongPreview) return;
    const { frame, button, card } = intervalSongPreview;
    intervalSongPreview = null;
    cancelAnimationFrame(frame);
    button?.setAttribute('aria-pressed', 'false');
    button?.classList.remove('is-playing');
    card?.classList.remove('is-playing');
    host.dock.clear('target');
  }

  host.previews.registerStopper(() => {
    clearSongPreview();
    clearHintPlay();
  });

  async function previewSong(
    notes: readonly IntervalSongNote[],
    button?: HTMLButtonElement,
    card?: HTMLElement,
  ): Promise<void> {
    if (button && intervalSongPreview?.button === button) {
      host.previews.stopAll();
      return;
    }
    host.previews.stopAll();
    const context = host.audio.ensure();
    const last = notes.at(-1);
    if (!context || !last) return;
    const preview: IntervalSongPreview = { frame: 0, button, card };
    intervalSongPreview = preview;
    button?.setAttribute('aria-pressed', 'true');
    button?.classList.add('is-playing');
    card?.classList.add('is-playing');
    // A cold sample can miss a short opening note if decoding starts after playback is scheduled.
    const [audioReady, samplesReady] = await Promise.all([
      context.state === 'running' || host.audio.timedReady(context),
      deps.pianoEnsure(notes.map((note) => note.midi)),
    ]);
    if (intervalSongPreview !== preview) return;
    if (!audioReady || !samplesReady || context.state !== 'running' || host.audio.context() !== context) {
      clearSongPreview();
      return;
    }
    const start = context.currentTime + 0.035;
    for (const { midi, at, duration, velocity } of notes) {
      host.audio.previewNote(midi, start + at, duration, velocity, { hold: true });
    }
    const end = last.at + last.duration;
    let previous: IntervalSongNote | undefined;
    const paint = () => {
      const elapsed = context.currentTime - start;
      if (elapsed >= end || context.state === 'closed') {
        clearSongPreview();
        return;
      }
      const current = notes.find(({ at, duration }) => elapsed >= at && elapsed < at + duration);
      if (current !== previous) {
        host.dock.clear('target');
        if (current) host.dock.mark(current.midi, 'target', true);
        previous = current;
      }
      preview.frame = requestAnimationFrame(paint);
    };
    preview.frame = requestAnimationFrame(paint);
  }

  function render(): void {
    const box = maybeById('songsList');
    const panel = maybeById('pr-songs');
    if (!box || !(panel instanceof HTMLDetailsElement) || !panel.open) return;
    clearHintPlay();
    clearSongPreview();
    if (!intervalSongsMod) {
      const gen = ++intervalSongsGen;
      void import('../../domain/interval-songs.js').then((mod) => {
        intervalSongsMod = mod;
        if (gen === intervalSongsGen) render();
      }).catch(() => {});
      return;
    }
    const { INTERVAL_SONGS, intervalSongNotes, intervalSongTitle } = intervalSongsMod;
    box.innerHTML = '';
    const root = 60 + parseInt(selectById('song-root').value || '0', 10);
    const hearLabel = host.i18n.t('ex_hear').replace(/^▶\s*/u, '');
    const stopLabel = host.i18n.t('pr_hints_stop');
    const lang = host.i18n.lang();
    for (let semi = 1; semi <= 12; semi++) {
      const iv = INTERVALS.find((i) => i.semi === semi) || { short: '' };
      const direction = songDir;
      const list = INTERVAL_SONGS[semi]?.[direction] ?? [];
      const name = deps.ivName(semi);
      const card = document.createElement('article');
      card.className = 'songcard pr-hint-card pr-interval-card';
      card.dataset.semi = String(semi);
      const hd = document.createElement('div');
      hd.className = 'hd pr-hint-hd';
      const main = document.createElement('div');
      main.className = 'pr-hint-hd-main';
      const heading = document.createElement('h3');
      heading.className = 'pr-hint-name';
      const bold = document.createElement('b');
      bold.textContent = name;
      heading.append(bold);
      const formula = document.createElement('p');
      formula.className = 'pr-hint-formula';
      const sh = document.createElement('span');
      sh.className = 'sh';
      sh.textContent = iv.short;
      formula.append(sh, ` · ${host.i18n.t('pr_hints_semitones', String(semi))}`);
      main.append(heading, formula);
      const play = playControl(`interval:${semi}`, hearLabel, stopLabel, name, false, () => {
        if (intervalHintPlay?.button === play) {
          host.previews.stopAll();
          return;
        }
        deps.playIvDir(root, semi, direction, 'melodic');
        deps.setHintControlPressed(play, true);
        card.classList.add('is-playing');
        intervalHintPlay = { button: play, card, timer: window.setTimeout(clearHintPlay, 960) };
      });
      play.classList.add('play');
      hd.append(main, play);
      const ul = document.createElement('div');
      ul.className = 'pr-hint-stage songlist';
      for (const song of list) {
        const title = document.createElement('button');
        title.type = 'button';
        title.textContent = intervalSongTitle(song, lang);
        title.setAttribute('aria-pressed', 'false');
        title.onclick = () => { void previewSong(intervalSongNotes(root, song), title, card); };
        ul.appendChild(title);
      }
      card.append(hd, ul);
      box.appendChild(card);
    }
  }

  function wireControls(onPanelToggle: () => void): void {
    byId('song-root').addEventListener('change', () => {
      if (intervalSongPreview) host.previews.stopAll();
      render();
    });
    byId('pr-songs').addEventListener('toggle', (event) => {
      if (event.currentTarget instanceof HTMLDetailsElement && !event.currentTarget.open && intervalSongPreview) {
        host.previews.stopAll();
      }
      onPanelToggle();
    });
    byId('song-dir').addEventListener('click', (e) => {
      const b = eventClosest(e, 'button');
      if (!b) return;
      if (intervalSongPreview) host.previews.stopAll();
      songDir = b.dataset.v === 'desc' ? 'desc' : 'asc';
      const btns = e.currentTarget instanceof Element
        ? [...e.currentTarget.children].filter((x): x is HTMLElement => x instanceof HTMLElement)
        : [];
      btns.forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      render();
    });
  }

  return {
    getDir: () => songDir,
    setDir: (dir) => { songDir = dir; },
    isPreviewing: () => intervalSongPreview !== null,
    clearHintPlay,
    clearSongPreview,
    previewSong,
    render,
    wireControls,
  };
}

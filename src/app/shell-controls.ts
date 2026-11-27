import { byId, downloadBlob, maybeById, inputById, selectById, eventElement, eventClosest, queryHtml, queryAllHtml, onPageReturn } from '../domain/dom.js';
import * as storage from '../domain/storage.js';
import * as safety from '../domain/data-safety.js';
import type * as audio from '../domain/audio.js';
import type { TimingCalibration } from '../domain/midi-calibration.js';
import type { InterfaceLanguage } from '../types/architecture.js';
import type { createPersistence } from './persistence.js';
import type { PracticeController, ReadController, ScorePlayerController, ShowFn, StoredTrainerData, ViewEventHandler, ViewEventName } from '../domain/views.js';

/** Shell state and services createShellControls reads; values are getters so shell declarations made later resolve on use. */
export interface ShellControlsDeps {
  readonly anLayoutVars: () => void;
  readonly applyTheme: () => void;
  readonly attachInput: (id: string, temporary?: boolean) => void;
  readonly audioEngine: audio.AudioEngine;
  readonly audioLockCheck: () => void;
  readonly audioLockSync: () => void;
  readonly audioUnlock: () => void;
  readonly backupJson: () => string;
  readonly BASE_HIGH: number;
  readonly BASE_LOW: number;
  readonly bleClick: () => void;
  readonly bleReconnect: () => void;
  readonly buildKeyboard: () => void;
  readonly CAL: TimingCalibration;
  readonly calSay: (text: string) => void;
  readonly calStop: () => void;
  readonly chooseView: () => void;
  readonly closeMobileMenu: (returnFocus?: boolean, fromPop?: boolean) => boolean;
  readonly coachRefresh: () => void;
  readonly connectMidi: () => Promise<void>;
  readonly data: StoredTrainerData;
  readonly dockOpen: (v?: string) => boolean;
  readonly dockSet: (open: boolean) => void;
  readonly dockShown: () => boolean;
  readonly dockSync: () => void;
  readonly ensureAudio: (warm?: boolean) => AudioContext | null;
  readonly fillRoots: (sel: HTMLElement, withAll: boolean) => void;
  readonly fitHeader: () => void;
  readonly flushSaveSoon: () => void;
  readonly fsToggle: () => void;
  readonly initLatencyCalibration: () => void;
  readonly kbdLayoutLabels: () => void;
  readonly KEY: "ptt-v3";
  labelMode: string;
  readonly lang: InterfaceLanguage;
  readonly layoutVarsSoon: () => void;
  readonly liveVoices: Map<number, audio.AudioVoice>;
  readonly localeLoadError: (retry: () => Promise<unknown>, target?: HTMLElement) => void;
  readonly localize: (key: string, fallback: string) => string;
  readonly localizeLoadedFeatures: () => void;
  readonly MAX_PROGRESS_IMPORT_BYTES: number;
  readonly metro: { on: boolean; bpm: number; next: number; beat: number; timer: boolean | null };
  notation: "letter" | "solfege" | "german";
  readonly openMobileMenu: (fromPop?: boolean) => void;
  readonly panic: () => void;
  readonly parsePttV3: (raw: string | null) => storage.PttV3Payload | null;
  readonly persistence: ReturnType<typeof createPersistence>;
  readonly pianoStatus: () => void;
  readonly popModalState: (id: string) => void;
  readonly positionBlacks: () => void;
  readonly practice: PracticeController | null;
  readonly pushModalState: (id: string) => void;
  readonly pwaInstall: () => Promise<void>;
  readonly pwaRegister: () => Promise<void>;
  readonly rdFocusDispSet: (open: boolean, focusBack?: boolean) => void;
  readonly read: ReadController | null;
  readonly readScoreZoom: (value?: number) => void;
  readonly reflowKeys: () => void;
  readonly refreshToday: () => void;
  readonly registerViewEvent: <Name extends ViewEventName>(name: Name, handler: ViewEventHandler<Name>) => void;
  readonly releaseFocusInput: () => void;
  readonly releaseLiveInput: () => void;
  readonly releaseTypingKeys: () => void;
  readonly reloadingForRestore: boolean;
  readonly repaintHeld: () => void;
  readonly saveAll: () => void;
  readonly saveSoon: () => void;
  readonly SCORE_FOCUS: { owner: "analysis" | "read" | null; native: boolean; token: number; returnTo: HTMLElement | null; scroll: number; readOverride: boolean | null; zoom: number; };
  readonly scoreFocusFullscreenChanged: () => void;
  readonly scoreFocusToggle: (owner: "analysis" | "read", target: HTMLElement) => void;
  readonly scoreFocusUi: () => void;
  readonly scorePlayer: ScorePlayerController | null;
  readonly setLang: (l: string | undefined, synchronized?: boolean) => Promise<void>;
  readonly show: ShowFn;
  readonly STAGE: { on: boolean; kb: boolean | null; rz: number };
  readonly stopDrone: () => void;
  readonly stopPreviews: () => void;
  readonly STORE: { blocked: "" | "too-new" | "quarantine" | "upgrade"; failed: boolean; unreadable: boolean; persist: safety.PersistState; usage: { usage: number; quota: number; } | null; snaps: safety.SnapshotInfo[]; snapDay: number; snapPending: boolean; };
  readonly STORE_LAST_EXPORT: string;
  readonly STORE_SNAPSHOTS_CHANGED: string;
  readonly storeApplyBackup: (p: storage.PttV3Payload, reason: safety.SnapshotReason) => Promise<void>;
  readonly storeBackupBlocked: () => boolean;
  readonly storeDiagnostics: () => Promise<string>;
  readonly storeExported: () => void;
  readonly storeNote: () => void;
  readonly storeRefresh: () => Promise<void>;
  readonly storeReset: () => Promise<void>;
  readonly storeRestore: (id: number | undefined) => Promise<void>;
  readonly SYNC_NOTATIONS: readonly ["letter", "solfege", "german"];
  readonly SYNC_THEMES: readonly ["auto", "light", "dark"];
  readonly SYNC_TONES: readonly ["piano", "piano-synth", "soft", "bright", "organ", "mellow", "glass"];
  readonly syncAfter: (got: string) => void;
  readonly syncNote: (on: boolean) => void;
  readonly syncOneOf: <T extends string>(list: readonly T[], v: unknown) => v is T;
  readonly syncWrite: (replacement?: { gen: string; data: StoredTrainerData; }) => void;
  readonly t: (k: string, ...args: Array<string | number | null | undefined>) => string;
  theme: "auto" | "light" | "dark";
  readonly view: { low: number; oct: number; };
  readonly view0: () => string;
  readonly wakeSet: (on: boolean) => void;
  readonly withPractice: (fn: (p: PracticeController) => void) => void;
}

/*
 * Settings reflection, the themed alert/confirm dialog, overlays (drawer, help, scrim, focus trap) and the wiring of
 * every shell control (settings, header, dock, data safety). Lazy features wire their own controls on mount.
 */
export function createShellControls(deps: ShellControlsDeps) {
  /* ============================================================================
     WIRING + BOOT
     ============================================================================ */
  function labelSettingsControl(controlId: string, labelKey: string|undefined, helpKey: string|undefined) {
      const control = maybeById(controlId), label = (document).querySelector('[data-i18n="' + labelKey + '"]');
      if (!control || !label)
          return;
      label.id = controlId + '-label';
      control.setAttribute('aria-labelledby', label.id);
      if (helpKey) {
          const help = (document).querySelector('[data-i18n="' + helpKey + '"]');
          if (help) {
              help.id = controlId + '-help';
              control.setAttribute('aria-describedby', help.id);
          }
      }
  }
  type SettingsControlLabel = [controlId: string, labelKey: string, helpKey?: string];
  function labelSettingsControls() {
      const controls: SettingsControlLabel[] = [['deviceSelect', 'set_input'], ['toneSel', 'set_tone'], ['set-goal', 'set_sessionlen'], ['set-new', 'set_newperday', 'set_newperday_s'],
          ['set-wake', 'set_wake'], ['set-synth', 'set_localsynth'], ['set-drone', 'set_drone'], ['set-metronome', 'set_metronome'], ['set-inv', 'set_allowinv'], ['set-weak-inject', 'set_weak_inject'],
          ['set-any-octave', 'set_any_octave', 'set_any_octave_s']];
      controls.forEach(([controlId, labelKey, helpKey]) => labelSettingsControl(controlId, labelKey, helpKey));
  }
  function reflectSettingsUI() {
      inputById('volume').value = String(Math.round(deps.audioEngine.masterVolume * 100));
      selectById('toneSel').value = deps.audioEngine.tone;
      inputById('bpm').value = String(deps.metro.bpm);
      byId('bpmLbl').textContent = String(deps.metro.bpm);
      inputById('reverb').value = String(Math.round(deps.audioEngine.reverbWet / 0.5 * 100));
      queryAllHtml(document, '#set-labels button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === deps.labelMode ? 'true' : 'false'));
      const labelCBtn = document.querySelector('#set-labels button[data-v="c"]');
      if (labelCBtn) labelCBtn.textContent = deps.notation === 'solfege' ? 'Do' : 'C';
      inputById('set-synth').checked = deps.audioEngine.localSynth;
      inputById('set-drone').checked = !!deps.data.settings.drone;
      inputById('set-inv').checked = !!deps.data.settings.allowInv;
      const prChordInv = maybeById('pr-chord-inv');
      if (prChordInv instanceof HTMLInputElement) prChordInv.checked = !!deps.data.settings.allowInv;
      inputById('set-metronome').checked = !!deps.data.settings.metronome;
      inputById('set-weak-inject').checked = !!deps.data.settings.weakSpotInjection;
      inputById('set-any-octave').checked = !!deps.data.settings.anyOctave;
      deps.read?.reflectSettings();
      selectById('set-goal').value = String(deps.data.settings.goal);
      selectById('set-new').value = String(deps.data.settings.newPerDay);
      queryAllHtml(document, '#set-notation button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === deps.notation ? 'true' : 'false'));
      queryAllHtml(document, '#set-lang button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === deps.lang ? 'true' : 'false'));
      deps.practice?.reflectSettings();
  }
  function setWeakSpotInjection(on: boolean) {
      deps.data.settings.weakSpotInjection = on;
      const settingsToggle = maybeById('set-weak-inject');
      if (settingsToggle instanceof HTMLInputElement)
          settingsToggle.checked = on;
      const readingToggle = maybeById('rdx-weak-inject');
      if (readingToggle instanceof HTMLInputElement)
          readingToggle.checked = on;
      deps.saveAll();
  }
  let appDialogClose: ((accepted: boolean, fromPop?: boolean) => void) | null = null;
  let appDialogWired = false;
  let appDialogSeq = 0;
  let appDialogQueue: Promise<unknown> = Promise.resolve();
  function ensureAppDialogWired() {
      if (appDialogWired) return;
      const dialog = maybeById('appDialog'), ok = maybeById('appDialogOk'), cancel = maybeById('appDialogCancel'), scrim = maybeById('appDialogScrim');
      if (!dialog || !ok || !cancel || !scrim) return;
      appDialogWired = true;
      ok.addEventListener('click', () => appDialogClose?.(true));
      cancel.addEventListener('click', () => appDialogClose?.(false));
      scrim.addEventListener('click', () => appDialogClose?.(false));
      dialog.addEventListener('keydown', trapFocus);
  }
  function appDialogOpen(kind: 'alert' | 'confirm', message: string): Promise<boolean> {
      const task = appDialogQueue.then(() => new Promise<boolean>((resolve) => {
          ensureAppDialogWired();
          const dialog = maybeById('appDialog'), scrim = maybeById('appDialogScrim'), title = maybeById('appDialogTitle'), msg = maybeById('appDialogMsg'), ok = maybeById('appDialogOk'), cancel = maybeById('appDialogCancel');
          if (!dialog || !scrim || !title || !msg || !ok || !cancel) {
              if (kind === 'alert') { window.alert(message); resolve(true); }
              else resolve(window.confirm(message));
              return;
          }
          const priorFocus = document.activeElement;
          deps.read?.releaseRecorder('focus');
          deps.releaseLiveInput();
          deps.pushModalState('dialog');
          dialog.dataset.kind = kind;
          dialog.dataset.seq = String(++appDialogSeq);
          title.textContent = kind === 'alert' ? deps.localize('dialog_notice_title', 'Notice') : deps.localize('dialog_confirm_title', 'Please confirm');
          msg.textContent = message;
          ok.textContent = kind === 'alert' ? deps.localize('dialog_ok', 'OK') : deps.localize('dialog_confirm', 'Continue');
          cancel.textContent = deps.localize('dialog_cancel', 'Cancel');
          cancel.hidden = kind === 'alert';
          dialog.classList.add('on');
          dialog.setAttribute('aria-hidden', 'false');
          scrim.classList.add('on');
          syncScrim();
          const firstFocus = kind === 'confirm' ? cancel : ok;
          firstFocus.focus({ preventScroll: true });
          requestAnimationFrame(() => { if (dialog.classList.contains('on')) firstFocus.focus({ preventScroll: true }); });
          appDialogClose = (accepted: boolean, fromPop = false) => {
              appDialogClose = null;
              const hadFocus = dialog.contains(document.activeElement);
              dialog.classList.remove('on');
              dialog.setAttribute('aria-hidden', 'true');
              scrim.classList.remove('on');
              if (!fromPop) deps.popModalState('dialog');
              syncScrim();
              if (hadFocus && priorFocus && priorFocus.isConnected && (priorFocus instanceof HTMLElement || priorFocus instanceof SVGElement) && priorFocus.getClientRects().length > 0 && !priorFocus.closest('[inert]'))
                  priorFocus.focus({ preventScroll: true });
              resolve(kind === 'alert' ? true : accepted);
          };
      }));
      appDialogQueue = task.catch(() => {});
      return task;
  }
  function appAlert(message: string): Promise<void> { return appDialogOpen('alert', message).then(() => {}); }
  function appConfirm(message: string): Promise<boolean> { return appDialogOpen('confirm', message); }
  function overlaysOpen() { return byId('drawer').classList.contains('on') || byId('helpBox').classList.contains('on') || !!maybeById('appDialog')?.classList.contains('on'); }
  function syncScrim() {
      const drawer = byId('drawer'), help = byId('helpBox'), dialog = maybeById('appDialog');
      const dialogOn = !!dialog?.classList.contains('on'), helpOn = help.classList.contains('on'), drawerOn = drawer.classList.contains('on');
      const open = dialogOn || helpOn || drawerOn;
      byId('scrim').classList.toggle('on', drawerOn || helpOn);
      queryAllHtml(document, 'body > #skipLink, body > header, body > main, body > #dock, body > #bottomNav, body > #locale-load-error, body > details.osmd-lic, body > footer').forEach((el) => { el.inert = open; });
      if (dialog) dialog.inert = !dialogOn;
      help.inert = !helpOn || dialogOn;
      drawer.inert = !drawerOn || helpOn || dialogOn;
  }
  // Closed overlays are only moved/faded out by CSS, so `inert` keeps their controls out of the Tab order;
  // opening moves focus inside, closing returns it to whatever opened the overlay.
  const overlayReturn = new Map<HTMLElement, Element | null>();
  function setOverlay(el: HTMLElement, o: boolean, firstId: string) {
      const was = el.classList.contains('on'), hadFocus = el.contains(document.activeElement);
      if (o !== was) {
          if (o) deps.read?.releaseRecorder('focus');
          deps.releaseLiveInput();
      }
      el.classList.toggle('on', o);
      el.setAttribute('aria-hidden', o ? 'false' : 'true');
      syncScrim();
      if (o && !was) {
          overlayReturn.set(el, document.activeElement);
          byId(firstId).focus();
          requestAnimationFrame(() => { if (el.classList.contains('on') && !el.inert)
              byId(firstId).focus(); });
      }
      else if (!o && was) {
          const r = overlayReturn.get(el);
          overlayReturn.delete(el);
          if (hadFocus && r && r.isConnected && (r instanceof HTMLElement || r instanceof SVGElement) && r.getClientRects().length > 0 && !r.closest('[inert]'))
              r.focus();
      }
  }
  function trapFocus(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !(e.currentTarget instanceof Element))
          return;
      const f = [...e.currentTarget.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x): x is HTMLElement | SVGElement => (x instanceof HTMLElement || x instanceof SVGElement) && !('disabled' in x && x.disabled) && x.getClientRects().length > 0);
      if (!f.length)
          return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
      }
      else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
      }
  }
  function openDrawer(o: boolean, fromPop = false) {
      if (o) {
          if (!fromPop)
              deps.pushModalState('drawer');
      }
      else {
          if (deps.CAL.on) {
              deps.calStop();
              deps.calSay('');
          }
          if (!fromPop) deps.popModalState('drawer');
      }
      setOverlay(byId('drawer'), o, 'drawerClose');
  }
  function openHelp(o: boolean, fromPop = false) {
      if (o) {
          deps.kbdLayoutLabels();
          if (!fromPop)
              deps.pushModalState('help');
      }
      else {
          if (!fromPop) deps.popModalState('help');
      }
      setOverlay(byId('helpBox'), o, 'helpClose');
  }
  function applyNotation() {
      const sr = selectById('song-root').value, pk = selectById('pr-key').value;
      deps.fillRoots(byId('song-root'), false);
      deps.fillRoots(byId('pr-key'), true);
      selectById('song-root').value = String(sr || 0);
      selectById('pr-key').value = pk || 'all';
      deps.practice?.renderSetup();
      deps.localizeLoadedFeatures();
      deps.buildKeyboard();
      deps.repaintHeld();
      if (deps.view0() === 'practice')
          deps.practice?.updateAccompChain();
      deps.read?.onNotation();
      deps.scorePlayer?.relocalize();
      deps.practice?.refreshSessionCopy();
      const labelCBtn = document.querySelector('#set-labels button[data-v="c"]');
      if (labelCBtn) labelCBtn.textContent = deps.notation === 'solfege' ? 'Do' : 'C';
      deps.read?.onLocale();
      deps.coachRefresh();
  }
  /* ---------- ACCOMPANIMENT UI moved to src/features/practice/accompaniment.ts ---------- */
  /** The text field, slider or select an input/change event fired on. */
  function wiringField(e: Event): HTMLInputElement | HTMLSelectElement {
      const el = e.target;
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement)
          return el;
      throw new Error('Étude: expected an <input> or <select> event target');
  }
  /** The checkbox or file `<input>` a change event fired on. */
  function wiringInput(e: Event): HTMLInputElement {
      const el = e.target;
      if (el instanceof HTMLInputElement)
          return el;
      throw new Error('Étude: expected an <input> event target');
  }
  /** The buttons of the segmented control a click was delegated to. */
  function wiringSegment(e: Event): HTMLElement[] {
      return e.currentTarget instanceof Element ? [...e.currentTarget.children].filter((x): x is HTMLElement => x instanceof HTMLElement) : [];
  }
  function wiringDisabled(b: HTMLElement): boolean { return b instanceof HTMLButtonElement && b.disabled; }
  function initControls() {
      labelSettingsControls();
      deps.initLatencyCalibration(); // Settings → MIDI keyboard → Timing
      byId('skipLink').addEventListener('click', (e) => { e.preventDefault(); byId('main').focus({ preventScroll: true }); });
      // nav
      byId('nav').addEventListener('click', (e) => { const b = eventClosest(e, 'button'); if (b)
          deps.show(b.dataset.view); });
      byId('modeNav').addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-view]'); if (b)
          deps.show(b.dataset.view); });
      byId('bottomNav').addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-view]'); if (b)
          deps.show(b.dataset.view); });
      document.querySelector('.brand')?.addEventListener('click', (e) => { e.preventDefault(); deps.show('today'); });
      // midi chip + settings
      byId('midiChip').addEventListener('click', deps.connectMidi);
      maybeById('bleChip')?.addEventListener('click', deps.bleClick);
      byId('audioLockBtn').addEventListener('click', deps.audioUnlock);
      byId('syncNoteBtn').addEventListener('click', () => deps.syncNote(false));
      byId('set-connect').addEventListener('click', deps.connectMidi);
      byId('deviceSelect').addEventListener('change', (e) => deps.attachInput(wiringField(e).value));
      byId('set-ble').addEventListener('click', deps.bleClick);
      byId('set-ble-re').addEventListener('click', deps.bleReconnect);
      // installed app & screen
      byId('set-wake').addEventListener('change', (e) => deps.wakeSet(wiringInput(e).checked));
      byId('set-full').addEventListener('click', deps.fsToggle);
      queryAllHtml(document, '.stage-fs:not(.score-expand)').forEach((b) => b.addEventListener('click', deps.fsToggle));
      for (const id of ['rd-fs', 'rd-top-fs']) byId(id).addEventListener('click', () => deps.scoreFocusToggle('read', byId('rd-fs')));
      byId('rd-focus-disp-btn').addEventListener('click', () => deps.rdFocusDispSet(Boolean(byId('rd-focus-tools').hidden)));
      byId('rd-focus-out').addEventListener('click', () => deps.readScoreZoom(deps.SCORE_FOCUS.zoom - .1));
      byId('rd-focus-in').addEventListener('click', () => deps.readScoreZoom(deps.SCORE_FOCUS.zoom + .1));
      byId('rd-focus-fit').addEventListener('click', () => { deps.readScoreZoom(1); deps.read?.fit(); });
      byId('rd-focus-kb').addEventListener('click', () => { deps.STAGE.kb = !deps.dockOpen(); deps.dockSync(); deps.scoreFocusUi(); });
      // The Read focus display menu closes on a press anywhere outside it.
      document.addEventListener('pointerdown', (e) => {
          const el = eventElement(e);
          const rdTools = maybeById('rd-focus-tools');
          if (el && rdTools && !rdTools.hidden && !el.closest('#rd-focus-tools,#rd-focus-disp-btn'))
              deps.rdFocusDispSet(false);
      });
      deps.scoreFocusUi();
      byId('set-install').addEventListener('click', deps.pwaInstall);
      byId('set-pwa-retry').addEventListener('click', () => { void deps.pwaRegister(); });
      document.addEventListener('fullscreenchange', deps.scoreFocusFullscreenChanged);
      window.addEventListener('resize', () => deps.read?.stageResize());
      byId('settingsBtn').addEventListener('click', () => openDrawer(true));
      byId('scrim').addEventListener('click', () => { openDrawer(false); openHelp(false); });
      byId('drawerClose').addEventListener('click', () => openDrawer(false));
      byId('helpBtn').addEventListener('click', () => openHelp(true));
      byId('helpClose').addEventListener('click', () => openHelp(false));
      byId('drawer').addEventListener('keydown', trapFocus);
      byId('helpBox').addEventListener('keydown', trapFocus);
      // theme
      byId('set-theme').addEventListener('click', (e) => { const b = eventClosest(e, 'button'), v = b?.dataset.v; if (!b || !deps.syncOneOf(deps.SYNC_THEMES, v))
          return; deps.theme = v; deps.applyTheme(); deps.saveAll(); });
      // mobile menu
      byId('menuBtn').addEventListener('click', () => {
          const mm = byId('mobileMenu');
          if (mm.hidden) {
              deps.openMobileMenu();
          }
          else
              deps.closeMobileMenu(true);
      });
      document.addEventListener('click', (e) => { const mm = byId('mobileMenu'), el = eventElement(e); if (mm && !mm.hidden && el && !el.closest('#mobileMenu') && !el.closest('#menuBtn'))
          deps.closeMobileMenu(); });
      // Refit when the bar's width or the MIDI chip's label changes, or a web font lands; fitHeader never resizes either.
      const headerFit = new ResizeObserver(deps.fitHeader), hdrBar = byId('nav').parentElement;
      if (hdrBar)
          headerFit.observe(hdrBar);
      headerFit.observe(byId('midiChip'));
      const bleChipEl = maybeById('bleChip');
      if (bleChipEl) headerFit.observe(bleChipEl);
      const bnavEl = maybeById('bottomNav');
      if (bnavEl && typeof ResizeObserver === 'function')
          new ResizeObserver(deps.anLayoutVars).observe(bnavEl);
      document.fonts.addEventListener('loadingdone', deps.fitHeader);
      // backup export / import
      byId('exportBtn').addEventListener('click', () => {
          deps.saveAll();
          const raw = deps.backupJson();
          const d = new Date(), p2 = (n: number) => String(n).padStart(2, '0');
          downloadBlob('etude-backup-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.json', new Blob([raw], { type: 'application/json' }));
          deps.storeExported();
      });
      byId('importBtn').addEventListener('click', () => byId('importFile').click());
      byId('importFile').addEventListener('change', async (e) => {
          const input = wiringInput(e), file = input.files?.[0];
          input.value = '';
          if (!file || deps.persistence.progressRestorePending || deps.reloadingForRestore) return;
          if (file.size > deps.MAX_PROGRESS_IMPORT_BYTES) {
              await appAlert(deps.t('import_size'));
              return;
          }
          deps.persistence.progressRestorePending = true;
          try {
              if (deps.storeBackupBlocked()) {
                  await appAlert(deps.t('store_too_new'));
                  return;
              }
              const backup = deps.parsePttV3(await file.text());
              if (backup && (storage.pttSchema(backup) > storage.PTT_SCHEMA || storage.hasFutureSightLedger(backup))) {
                  await appAlert(deps.t('import_too_new'));
                  return;
              }
              if (!storage.isImportableBackup(backup)) {
                  await appAlert(deps.t('import_bad'));
                  return;
              }
              if (await appConfirm(deps.t('import_confirm')))
                  await deps.storeApplyBackup(backup, 'before-import');
          }
          catch (_) { await appAlert(deps.t('import_bad')); }
          finally { deps.persistence.progressRestorePending = false; }
      });
      byId('set-diag').addEventListener('toggle', () => { if (byId('set-diag').hasAttribute('open'))
          void deps.storeRefresh(); });
      byId('set-diag-copy').addEventListener('click', () => { void deps.storeDiagnostics().then((text) => { if (!navigator.clipboard)
          throw new Error('no clipboard'); return navigator.clipboard.writeText(text); }).then(() => { const b = byId('set-diag-copy'); b.textContent = deps.t('set_diag_copied'); setTimeout(() => { b.textContent = deps.t('set_diag_copy'); }, 1500); }).catch(() => { }); });
      byId('storeNoteExport').addEventListener('click', () => byId('exportBtn').click());
      byId('storeNoteReload').addEventListener('click', () => location.reload());
      byId('storeNoteOk').addEventListener('click', () => { deps.STORE.unreadable = false; deps.storeNote(); });
      byId('storeNoteRestore').addEventListener('click', () => { void deps.storeRestore(deps.STORE.snaps.find(x => x.reason !== 'unreadable')?.id); });
      selectById('set-snaps').addEventListener('change', (event) => {
          if (event.currentTarget instanceof HTMLSelectElement) event.currentTarget.dataset.selected = event.currentTarget.value;
      });
      byId('set-snap-restore').addEventListener('click', () => { const sel = byId('set-snaps'); if (sel instanceof HTMLSelectElement && Number(sel.value))
          void deps.storeRestore(Number(sel.value)); });
      // session
      byId('tools').addEventListener('click', (e) => { const b = eventClosest(e, 'button[data-view]'); if (b)
          deps.show(b.dataset.view); });
      byId('startBtn').addEventListener('click', () => deps.withPractice((p) => p.startSession(null)));
      byId('placeBtn').addEventListener('click', () => deps.withPractice((p) => p.startPlacement()));
      const goMethod = (e: Event) => { e.preventDefault(); deps.show('method'); };
      byId('whyLink').addEventListener('click', goMethod);
      byId('footMethod').addEventListener('click', goMethod);
      byId('method-start').addEventListener('click', () => { deps.show('today'); deps.withPractice((p) => p.startSession(null)); });
      // practice, session and accompaniment controls are wired on mount in src/features/practice/index.ts
      // read & play, drills and the Read home are wired on mount in src/features/read/index.ts
      // voice / transcribe / sight-singing (wired lazily on mount in src/features/voice/index.ts)
      // explore (wired lazily on mount in src/features/explore/index.ts)
      // Pieces (Score & analysis) wires its own controls on mount in src/features/score-player/index.ts. The header, dock and
      // bottom bar sizes, and the window size, feed the layout variables every view reads.
      // border-box: a safe-area inset only changes padding, which a content-box observer would miss
      const layoutRo = new ResizeObserver(deps.layoutVarsSoon);
      [document.querySelector('header'), byId('dock'), byId('bottomNav')].forEach((el) => { if (el)
          layoutRo.observe(el, { box: 'border-box' }); });
      window.addEventListener('resize', deps.layoutVarsSoon);
      deps.anLayoutVars();
      // songs
      // progress (wired on mount in src/features/progress/index.ts)
      byId('resetBtn').addEventListener('click', () => { void deps.storeReset(); });
      // keyboard dock
      byId('oct-down').addEventListener('click', () => { deps.releaseTypingKeys(); deps.view.low = Math.max(deps.BASE_LOW, deps.view.low - 12); deps.buildKeyboard(); deps.repaintHeld(); });
      byId('oct-up').addEventListener('click', () => { deps.releaseTypingKeys(); deps.view.low = Math.min(deps.BASE_HIGH - deps.view.oct * 12, deps.view.low + 12); deps.buildKeyboard(); deps.repaintHeld(); });
      byId('panicBtn').addEventListener('click', deps.panic);
      byId('dock-kb-toggle').addEventListener('click', () => deps.dockSet(!deps.dockOpen()));
      byId('kb-pan').addEventListener('input', (e) => { byId('dock-keys').scrollLeft = +wiringField(e).value; });
      byId('dock-keys').addEventListener('scroll', () => { inputById('kb-pan').value = String(byId('dock-keys').scrollLeft); });
      // settings: notation/tone/audio/learning
      byId('set-notation').addEventListener('click', (e) => { const b = eventClosest(e, 'button'), v = b?.dataset.v; if (!b || !deps.syncOneOf(deps.SYNC_NOTATIONS, v) || deps.notation === v)
          return; deps.notation = v; (document).querySelectorAll('#set-notation button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); applyNotation(); deps.refreshToday(); deps.saveAll(); });
      byId('set-lang').addEventListener('click', (e) => { const b = eventClosest(e, 'button'); if (b)
          void deps.setLang(b.dataset.v).catch(() => deps.localeLoadError(() => deps.setLang(b.dataset.v))); });
      byId('toneSel').addEventListener('change', (e) => { deps.releaseLiveInput(); deps.stopPreviews(); deps.stopDrone(); const v = wiringField(e).value; if (deps.syncOneOf(deps.SYNC_TONES, v))
          deps.audioEngine.tone = v; deps.ensureAudio(); deps.pianoStatus(); deps.saveAll(); });
      byId('volume').addEventListener('input', (e) => { deps.audioEngine.setMasterVolume(Number(wiringField(e).value) / 100); deps.saveSoon(); }); // there is no mute toggle, so moving the slider must always be heard
      byId('set-synth').addEventListener('change', (e) => { deps.audioEngine.localSynth = wiringInput(e).checked; if (!deps.audioEngine.localSynth) {
          deps.liveVoices.forEach((v) => v.stop());
          deps.liveVoices.clear();
      } deps.saveAll(); });
      byId('reverb').addEventListener('input', (e) => { deps.audioEngine.setReverbWet(Number(wiringField(e).value) / 100 * 0.5); deps.saveSoon(); });
      byId('set-labels').addEventListener('click', (e) => { const b = eventClosest(e, 'button'); if (!b)
          return; deps.labelMode = b.dataset.v ?? deps.labelMode; (document).querySelectorAll('#set-labels button').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); deps.buildKeyboard(); deps.repaintHeld(); deps.saveAll(); });
      byId('bpm').addEventListener('input', (e) => { deps.metro.bpm = +wiringField(e).value; byId('bpmLbl').textContent = wiringField(e).value; deps.saveSoon(); });
      for (const id of ['volume', 'reverb', 'bpm']) byId(id).addEventListener('change', deps.flushSaveSoon);
      window.addEventListener('pagehide', deps.flushSaveSoon);
      byId('set-drone').addEventListener('change', (e) => { deps.data.settings.drone = wiringInput(e).checked; deps.saveAll(); });
      byId('set-metronome').addEventListener('change', (e) => { deps.data.settings.metronome = wiringInput(e).checked; deps.saveAll(); });
      byId('set-inv').addEventListener('change', (e) => {
          const checked = wiringInput(e).checked;
          deps.data.settings.allowInv = checked;
          const prChordInv = maybeById('pr-chord-inv');
          if (prChordInv instanceof HTMLInputElement) prChordInv.checked = checked;
          deps.saveAll();
      });
      byId('set-any-octave').addEventListener('change', (e) => {
          const checked = wiringInput(e).checked;
          deps.data.settings.anyOctave = checked;
          deps.read?.setAnyOctave(checked);
          const rdOct = maybeById('rd-any-octave');
          if (rdOct instanceof HTMLInputElement)
              rdOct.checked = checked;
          deps.saveAll();
      });
      byId('set-weak-inject').addEventListener('change', (e) => { setWeakSpotInjection(wiringInput(e).checked); });
      byId('set-goal').addEventListener('change', (e) => { deps.data.settings.goal = +wiringField(e).value; deps.saveAll(); deps.refreshToday(); });
      byId('set-new').addEventListener('change', (e) => { deps.data.settings.newPerDay = +wiringField(e).value; deps.saveAll(); deps.refreshToday(); });
      // global
      // Keep audio unlock listeners active across scroll/touchstart until an interactive gesture actually reaches running state.
      const unlockEvents = ['pointerdown', 'keydown', 'touchend', 'click'] as const;
      const onUnlockGesture = () => {
          const ctx = deps.ensureAudio();
          if (ctx?.state === 'running') {
              unlockEvents.forEach((ev) => window.removeEventListener(ev, onUnlockGesture));
          }
      };
      unlockEvents.forEach((ev) => window.addEventListener(ev, onUnlockGesture));
      // keyup/pointerup never reach an unfocused window, so focus loss only lets go of what the computer keyboard and pointer hold;
      // playback, recording, accompaniment and drills keep running
      window.addEventListener('blur', deps.releaseFocusInput);
      // a hidden tab throttles timers and stops animation frames: timed playback, accompaniment, mic capture and drills stop cleanly (score playback pauses resumably)
      document.addEventListener('visibilitychange', () => { if (document.hidden)
          deps.panic(); });
      // coming back: restart audio the phone suspended in the background. The notice asks for a tap while it stays locked.
      onPageReturn(() => {
          void deps.audioEngine.resumeOnReturn().then((state) => { if (state === 'running') deps.audioLockSync(); else if (state) deps.audioLockCheck(); });
      });
      window.addEventListener('storage', (e) => {
          if (e.storageArea && e.storageArea !== localStorage) return;
          if (e.key === deps.STORE_SNAPSHOTS_CHANGED || e.key === deps.STORE_LAST_EXPORT || e.key === null) void deps.storeRefresh();
          if (e.key !== null && e.key !== deps.KEY) return;
          const got = deps.persistence.syncPull();
          if (got === 'old' || got === 'merge-save') deps.syncWrite();
          if (got) deps.syncAfter(got);
      }); // another tab saved
      deps.registerViewEvent('keydown', (e) => { if (e.key === 'Escape') {
          if (appDialogClose) {
              e.preventDefault();
              appDialogClose(false);
              return;
          }
          if (deps.closeMobileMenu(true)) {
              e.preventDefault();
              return;
          }
          if (byId('helpBox').classList.contains('on')) {
              openHelp(false);
              return;
          }
          openDrawer(false);
      } });
      let rz: ReturnType<typeof setTimeout> | null = null;
      let lastPortrait = window.innerHeight >= window.innerWidth;
      function handleScreenChange() {
          clearTimeout(rz ?? undefined);
          rz = setTimeout(() => {
              const portrait = window.innerHeight >= window.innerWidth;
              const flipped = portrait !== lastPortrait;
              lastPortrait = portrait;
              if (!byId('mobileMenu').hidden && getComputedStyle(byId('menuBtn')).display === 'none') {
                  const hadFocus = byId('mobileMenu').contains(document.activeElement);
                  deps.closeMobileMenu();
                  if (hadFocus) {
                      const current = queryHtml(byId('nav'), '[aria-current="page"]');
                      if (current)
                          current.focus({ preventScroll: true });
                  }
              }
              const o = deps.view.oct;
              deps.chooseView();
              if (deps.view.oct !== o) {
                  deps.buildKeyboard();
                  deps.repaintHeld();
              }
              else
                  deps.positionBlacks();
              if (deps.dockShown())
                  deps.reflowKeys();
              deps.read?.redraw();
              if (deps.view0() === 'analysis') {
                  deps.anLayoutVars();
                  deps.scorePlayer?.onScreenChange(flipped);
              }
          }, 100);
      }
      window.addEventListener('resize', handleScreenChange);
      if (window.screen && window.screen.orientation) {
          window.screen.orientation.addEventListener('change', handleScreenChange);
      }
      else {
          window.addEventListener('orientationchange', handleScreenChange);
      }
  }

  return {
    labelSettingsControl,
    labelSettingsControls,
    reflectSettingsUI,
    setWeakSpotInjection,
    get appDialogClose() { return appDialogClose; },
    set appDialogClose(value: typeof appDialogClose) { appDialogClose = value; },
    get appDialogWired() { return appDialogWired; },
    set appDialogWired(value: typeof appDialogWired) { appDialogWired = value; },
    get appDialogSeq() { return appDialogSeq; },
    set appDialogSeq(value: typeof appDialogSeq) { appDialogSeq = value; },
    get appDialogQueue() { return appDialogQueue; },
    set appDialogQueue(value: typeof appDialogQueue) { appDialogQueue = value; },
    ensureAppDialogWired,
    appDialogOpen,
    appAlert,
    appConfirm,
    overlaysOpen,
    syncScrim,
    overlayReturn,
    setOverlay,
    trapFocus,
    openDrawer,
    openHelp,
    applyNotation,
    wiringField,
    wiringInput,
    wiringSegment,
    wiringDisabled,
    initControls,
  };
}

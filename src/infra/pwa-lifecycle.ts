/* Installed-app browser lifecycle: Service Worker registration & periodic update checks,
   install prompt, native fullscreen toggle, and Screen Wake Lock with 30-minute idle drop. */
import { byId, inputById, onPageReturn, queryAllHtml } from '../domain/dom.js';
import type { TranslateFn } from '../domain/views.js';

/** Chromium's install prompt event (not in TypeScript's DOM library). */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
  readonly userChoice: Promise<{ outcome: string }>;
}

export interface InstalledAppState {
  sw: string;
  err: string;
  prompt: InstallPromptEvent | null;
  installed: boolean;
}

export interface WakeLockState {
  want: boolean;
  lock: WakeLockSentinel | null;
  busy: boolean;
  err: string;
  fails: number;
  idle: boolean;
  last: number;
  idleT: number;
  gest: boolean;
}

export interface PwaLifecycleDeps {
  readonly t: TranslateFn;
  readonly saveAll: () => void;
  readonly runtimeErrorName: (value: unknown) => string;
}

/** An installed app can stay open for days. Coming back checks for a new version, at most every 30 minutes. */
export const PWA_UPDATE_GAP_MS = 30 * 60 * 1000;
/** Screen Wake Lock is released after 30 minutes without playing or touching, and re-acquired on the next note/tap. */
export const WAKE_IDLE_MS = 30 * 60 * 1000;

export interface PwaLifecycleController {
  readonly PWA: InstalledAppState;
  readonly WAKE: WakeLockState;
  pwaStandalone(): boolean;
  pwaInit(): void;
  pwaRegister(): Promise<void>;
  pwaUi(): void;
  pwaInstall(): Promise<void>;
  fsCan(): boolean;
  fsUi(): void;
  fsToggle(): void;
  wakeCan(): boolean;
  wakeGet(): Promise<void>;
  wakeOnGesture(): void;
  wakeDrop(): void;
  wakeSet(on: boolean): void;
  wakePing(): void;
  wakeArm(ms: number): void;
  wakeUi(): void;
  wakeInit(): void;
}

export function createPwaLifecycle(deps: PwaLifecycleDeps): PwaLifecycleController {
  const { t, saveAll, runtimeErrorName } = deps;
  const PWA: InstalledAppState = { sw: '', err: '', prompt: null, installed: false };
  let pwaUpdateReg: ServiceWorkerRegistration | null = null;
  let pwaUpdateWatcherBound = false;

  const WAKE: WakeLockState = {
    want: false,
    lock: null,
    busy: false,
    err: '',
    fails: 0,
    idle: false,
    last: 0,
    idleT: 0,
    gest: false,
  };
  let wakeRetryTimer = 0;
  let wakeRetried = false;

  function pwaStandalone(): boolean {
    return !!(window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      navigator.standalone === true);
  }

  function pwaWatchUpdates(registration: ServiceWorkerRegistration): void {
    pwaUpdateReg = registration;
    if (pwaUpdateWatcherBound) return;
    pwaUpdateWatcherBound = true;
    let last = Date.now(), pending = false; // register() has just checked
    onPageReturn(() => {
      const currentReg = pwaUpdateReg;
      const now = Date.now();
      if (!currentReg || pending || now - last < PWA_UPDATE_GAP_MS) return;
      pending = true;
      void currentReg.update()
        .then(() => { last = Date.now(); })
        .catch(() => undefined) // offline: the next return tries again
        .finally(() => { pending = false; });
    });
  }

  function pwaUi(): void {
    const st = byId('set-pwa-status'), ib = byId('set-install');
    if (!st || !ib) return;
    const pwaLabels: Record<string, string> = {
      file: 'pwa_file',
      unsupported: 'pwa_unsupported',
      ready: 'pwa_ready',
      error: PWA.err ? 'pwa_err' : 'pwa_install_failed',
    };
    const k = PWA.sw === 'ready' && (PWA.installed || pwaStandalone())
      ? 'pwa_installed'
      : pwaLabels[PWA.sw] || 'pwa_pending';
    st.textContent = t(k, PWA.err);
    st.dataset.s = PWA.sw === 'error' ? 'err' : '';
    ib.hidden = !PWA.prompt || PWA.installed || pwaStandalone();
    byId('set-pwa-retry').hidden = PWA.sw !== 'error';
  }

  async function pwaRegister(): Promise<void> {
    PWA.sw = 'pending';
    PWA.err = '';
    pwaUi();
    try {
      const registration = await navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' });
      const worker = registration.active ?? registration.waiting ?? registration.installing;
      const updateStatus = () => {
        if (registration.active?.state === 'activated') {
          PWA.sw = 'ready';
          pwaWatchUpdates(registration);
        } else if (!worker || worker.state === 'redundant') {
          PWA.sw = 'error';
        } else {
          return; // Wait for activation or failure. navigator.serviceWorker.ready never rejects.
        }
        worker?.removeEventListener('statechange', updateStatus);
        pwaUi();
      };
      worker?.addEventListener('statechange', updateStatus);
      updateStatus();
    } catch (err) {
      PWA.sw = 'error';
      PWA.err = (err instanceof Error && (err.name || err.message)) || '?';
      console.warn('Service worker:', err);
      pwaUi();
    }
  }

  function pwaInit(): void {
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); PWA.prompt = e; pwaUi(); });
    window.addEventListener('appinstalled', () => { PWA.prompt = null; PWA.installed = true; pwaUi(); });
    if (location.protocol === 'file:') {
      PWA.sw = 'file';
    } else if (!('serviceWorker' in navigator)) {
      PWA.sw = 'unsupported';
    } else if (!window.isSecureContext) {
      PWA.sw = 'file';
    } else {
      const killed = new URL(location.href).searchParams.get('sw-kill-switch') === 'done';
      if (killed) {
        const clean = new URL(location.href);
        clean.searchParams.delete('sw-kill-switch');
        history.replaceState(null, '', clean.href);
        PWA.sw = 'unsupported';
        pwaUi();
        return;
      }
      PWA.sw = 'pending';
      if (document.readyState === 'complete') void pwaRegister();
      else window.addEventListener('load', () => { void pwaRegister(); }, { once: true });
    }
    pwaUi();
  }

  async function pwaInstall(): Promise<void> {
    const p = PWA.prompt;
    if (!p) return;
    PWA.prompt = null;
    pwaUi();
    try {
      await p.prompt();
      const c = await p.userChoice;
      if (c && c.outcome === 'accepted') PWA.installed = true;
    } catch (err) {
      console.warn('Install:', err);
    }
    pwaUi();
  }

  function fsCan(): boolean {
    return !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
  }

  function fsUi(): void {
    const on = !!document.fullscreenElement;
    queryAllHtml(document, '.stage-fs:not(.score-expand)').forEach((s) => {
      s.hidden = !fsCan();
      s.setAttribute('aria-label', t(on ? 'stage_fs_exit' : 'stage_fs'));
      s.title = t(on ? 'stage_fs_exit' : 'stage_fs');
    });
    const b = byId('set-full');
    if (!b) return;
    const row = b.closest('.set-row');
    if (row instanceof HTMLElement) row.hidden = !fsCan();
    b.textContent = t(document.fullscreenElement ? 'full_exit' : 'full_enter');
  }

  function fsToggle(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { });
      return;
    }
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch((err) => console.warn('Full screen:', err));
  }

  function wakeCan(): boolean {
    return !!(navigator.wakeLock && navigator.wakeLock.request);
  }

  function wakeUi(): void {
    const cb = inputById('set-wake'), st = byId('set-wake-status');
    if (!cb || !st) return;
    const can = wakeCan();
    cb.checked = WAKE.want && can;
    cb.disabled = !can;
    st.textContent = !can
      ? t('wake_unsupported')
      : !WAKE.want
        ? t('wake_off')
        : WAKE.lock
          ? t('wake_on')
          : WAKE.idle
            ? t('wake_idle')
            : WAKE.err === 'NotAllowedError'
              ? t('wake_denied')
              : WAKE.err
                ? t('wake_err', WAKE.err)
                : t('wake_wait');
    st.dataset.s = WAKE.want && WAKE.lock ? 'on' : WAKE.want && WAKE.err ? 'err' : '';
  }

  function wakeDrop(): void {
    clearTimeout(wakeRetryTimer);
    wakeRetryTimer = 0;
    const s = WAKE.lock;
    WAKE.lock = null;
    if (s) s.release().catch(() => { });
  }

  function wakeOnGesture(): void {
    if (WAKE.gest) return;
    WAKE.gest = true;
    const go = () => {
      WAKE.gest = false;
      ['pointerdown', 'keydown'].forEach((ev) => window.removeEventListener(ev, go, true));
      void wakeGet();
    };
    ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, go, true));
  }

  async function wakeGet(): Promise<void> {
    if (!WAKE.want || WAKE.idle || WAKE.lock || WAKE.busy || !wakeCan() || document.visibilityState !== 'visible') return;
    WAKE.busy = true;
    try {
      const s = await navigator.wakeLock.request('screen');
      WAKE.busy = false;
      if (!WAKE.want || WAKE.idle || document.visibilityState !== 'visible') {
        s.release().catch(() => { });
        wakeUi();
        return;
      }
      WAKE.lock = s;
      WAKE.err = '';
      WAKE.fails = 0;
      s.addEventListener('release', () => {
        if (WAKE.lock !== s) return;
        WAKE.lock = null;
        if (!wakeRetried && WAKE.want && !WAKE.idle && !document.hidden) {
          wakeRetried = true;
          wakeRetryTimer = window.setTimeout(() => {
            wakeRetryTimer = 0;
            void wakeGet();
          }, 1000);
        }
        wakeUi();
      }, { once: true });
    } catch (err) {
      WAKE.busy = false;
      WAKE.err = runtimeErrorName(err) || 'Error';
      WAKE.fails++;
      if (WAKE.fails === 1) console.warn('Wake lock:', err);
      if (WAKE.fails < 3) wakeOnGesture();
    } // e.g. no user activation yet: one quiet retry on the next tap or key, never a loop
    wakeUi();
  }

  function wakeArm(ms: number): void {
    WAKE.idleT = window.setTimeout(() => {
      WAKE.idleT = 0;
      if (!WAKE.want) return;
      const left = WAKE_IDLE_MS - (performance.now() - WAKE.last);
      if (left > 1000) {
        wakeArm(left);
        return;
      }
      WAKE.idle = true;
      wakeDrop();
      wakeUi();
    }, ms);
  }

  function wakePing(): void {
    if (!WAKE.want) return;
    WAKE.last = performance.now();
    if (WAKE.idle) {
      wakeRetried = false;
      WAKE.idle = false;
      void wakeGet();
      wakeUi();
    }
    if (!WAKE.idleT) wakeArm(WAKE_IDLE_MS);
  }

  function wakeSet(on: boolean): void {
    WAKE.want = !!on;
    WAKE.idle = false;
    WAKE.err = '';
    WAKE.fails = 0;
    wakeRetried = false;
    if (WAKE.want) {
      wakePing();
      void wakeGet();
    } else {
      clearTimeout(WAKE.idleT);
      WAKE.idleT = 0;
      wakeDrop();
    }
    saveAll();
    wakeUi();
  }

  function wakeInit(): void {
    const resume = () => {
      if (document.hidden || !WAKE.want) return;
      clearTimeout(wakeRetryTimer);
      wakeRetryTimer = 0;
      wakeRetried = false;
      WAKE.fails = 0;
      if (WAKE.lock?.released) WAKE.lock = null;
      wakePing();
      void wakeGet();
      wakeUi();
    };
    const gesture = () => {
      wakePing();
      if (!WAKE.lock && !WAKE.busy && wakeRetried && !wakeRetryTimer) resume();
    };
    ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, gesture, { capture: true, passive: true }));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) wakeDrop();
      else resume();
      wakeUi();
    });
    window.addEventListener('pageshow', (event) => { if (event.persisted) resume(); });
    if (WAKE.want) {
      wakePing();
      void wakeGet();
    }
    wakeUi();
  }

  return {
    PWA,
    WAKE,
    pwaStandalone,
    pwaInit,
    pwaRegister,
    pwaUi,
    pwaInstall,
    fsCan,
    fsUi,
    fsToggle,
    wakeCan,
    wakeGet,
    wakeOnGesture,
    wakeDrop,
    wakeSet,
    wakePing,
    wakeArm,
    wakeUi,
    wakeInit,
  };
}

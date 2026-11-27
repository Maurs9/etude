import { afterEach, describe, expect, it, vi } from 'vitest';
import { PWA_UPDATE_GAP_MS, WAKE_IDLE_MS, createPwaLifecycle } from '../../src/infra/pwa-lifecycle.ts';

class FakeElement {
  constructor(id) {
    this.id = id;
    this.textContent = '';
    this.hidden = false;
    this.checked = false;
    this.disabled = false;
    this.dataset = {};
    this.title = '';
    this.attrs = {};
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  closest() { return null; }
}
class FakeInputElement extends FakeElement {}

function stubBrowser(overrides = {}) {
  const listeners = new Map();
  const docListeners = new Map();
  const elements = new Map();
  const makeEl = (id) => {
    const el = id === 'set-wake' ? new FakeInputElement(id) : new FakeElement(id);
    elements.set(id, el);
    return el;
  };
  for (const id of ['set-pwa-status', 'set-install', 'set-pwa-retry', 'set-full', 'set-wake', 'set-wake-status']) {
    makeEl(id);
  }
  const win = {
    isSecureContext: true,
    matchMedia: () => ({ matches: false }),
    addEventListener: (ev, fn) => {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(fn);
    },
    removeEventListener: (ev, fn) => {
      const list = listeners.get(ev);
      if (list) listeners.set(ev, list.filter(x => x !== fn));
    },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    ...overrides.window,
  };
  const doc = {
    readyState: 'complete',
    visibilityState: 'visible',
    hidden: false,
    fullscreenEnabled: false,
    fullscreenElement: null,
    documentElement: {},
    getElementById: (id) => elements.get(id) ?? null,
    querySelectorAll: () => [],
    addEventListener: (ev, fn) => {
      if (!docListeners.has(ev)) docListeners.set(ev, []);
      docListeners.get(ev).push(fn);
    },
    ...overrides.document,
  };
  const loc = { protocol: 'https:', href: 'https://maurs9.github.io/etude/etude.html', ...overrides.location };
  const hist = { replaceState: vi.fn(), ...overrides.history };
  const nav = { standalone: false, ...overrides.navigator };

  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('HTMLInputElement', FakeInputElement);
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('location', loc);
  vi.stubGlobal('history', hist);
  vi.stubGlobal('navigator', nav);
  return { elements, listeners, docListeners, hist, win, doc, nav };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('createPwaLifecycle', () => {
  it('exports 30-minute update and wake-idle constants and handles file:// + kill-switch cleanly', () => {
    expect(PWA_UPDATE_GAP_MS).toBe(30 * 60 * 1000);
    expect(WAKE_IDLE_MS).toBe(30 * 60 * 1000);

    const envFile = stubBrowser({ location: { protocol: 'file:', href: 'file:///etude.html' } });
    const filePwa = createPwaLifecycle({
      t: (k) => k,
      saveAll: vi.fn(),
      runtimeErrorName: () => '',
    });
    filePwa.pwaInit();
    expect(filePwa.PWA.sw).toBe('file');
    expect(envFile.elements.get('set-pwa-status').textContent).toBe('pwa_file');

    const envKilled = stubBrowser({
      location: { protocol: 'https:', href: 'https://maurs9.github.io/etude/etude.html?sw-kill-switch=done' },
      navigator: { serviceWorker: { register: vi.fn() } },
    });
    const killedPwa = createPwaLifecycle({
      t: (k) => k,
      saveAll: vi.fn(),
      runtimeErrorName: () => '',
    });
    killedPwa.pwaInit();
    expect(killedPwa.PWA.sw).toBe('unsupported');
    expect(envKilled.hist.replaceState).toHaveBeenCalledWith(null, '', 'https://maurs9.github.io/etude/etude.html');
  });

  it('acquires, drops on idle timeout, and persists Screen Wake Lock preference', async () => {
    vi.useFakeTimers();
    const release = vi.fn().mockResolvedValue(undefined);
    const sentinel = { released: false, release, addEventListener: vi.fn() };
    const request = vi.fn().mockResolvedValue(sentinel);
    const saveAll = vi.fn();
    const env = stubBrowser({
      navigator: { wakeLock: { request } },
    });
    const pwa = createPwaLifecycle({
      t: (k) => k,
      saveAll,
      runtimeErrorName: (err) => (err instanceof Error ? err.name : ''),
    });

    expect(pwa.wakeCan()).toBe(true);
    pwa.wakeSet(true);
    await Promise.resolve();
    expect(saveAll).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('screen');
    expect(pwa.WAKE.lock).toBe(sentinel);
    expect(env.elements.get('set-wake-status').textContent).toBe('wake_on');

    // Idle timeout releases the lock after 30 minutes of inactivity.
    vi.advanceTimersByTime(WAKE_IDLE_MS + 10);
    expect(pwa.WAKE.idle).toBe(true);
    expect(pwa.WAKE.lock).toBeNull();
    expect(release).toHaveBeenCalledTimes(1);
    expect(env.elements.get('set-wake-status').textContent).toBe('wake_idle');

    pwa.wakeSet(false);
    expect(pwa.WAKE.want).toBe(false);
    expect(env.elements.get('set-wake-status').textContent).toBe('wake_off');
  });
});

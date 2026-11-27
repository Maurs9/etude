import { describe, expect, it, vi } from 'vitest';
import { createTestSurfaceRegistry } from '../../src/domain/views.ts';

const host = () => ({
  i18n: { t: (k) => k, lang: () => 'en' },
  nav: { show: vi.fn(), activeView: () => 'today' },
  store: { data: vi.fn(() => ({ settings: { goal: 12 }, todayDay: 0, todayCount: 0, srs: {} })) },
  overlays: { showLoadError: vi.fn() },
});

describe('today and progress feature slices', () => {
  it('import in Node with zero DOM side effects', async () => {
    expect(typeof globalThis.document).toBe('undefined');
    const [today, progress] = await Promise.all([import('../../src/features/today/index.ts'), import('../../src/features/progress/index.ts')]);
    expect(typeof today.createTodayFeature).toBe('function');
    expect(typeof progress.createProgressFeature).toBe('function');
  });

  it('Today skips an aborted enter and an enter during a running session, and registers its plan hooks', async () => {
    const { createTodayFeature } = await import('../../src/features/today/index.ts');
    const h = host();
    let running = true;
    const feature = createTodayFeature(h, { todayN: () => 1, sesActive: () => running });
    const aborted = new AbortController();
    aborted.abort();
    expect(() => feature.enter(undefined, aborted.signal)).not.toThrow();
    expect(() => feature.enter(undefined, new AbortController().signal)).not.toThrow();
    expect(h.store.data).not.toHaveBeenCalled();
    const target = {};
    feature.registerTestSurface?.(createTestSurfaceRegistry(target));
    expect(typeof target.renderPlan).toBe('function');
    expect(typeof target.greeting).toBe('function');
    running = false;
  });

  it('Progress drops a render for a view left while its module loaded', async () => {
    const { createProgressFeature } = await import('../../src/features/progress/index.ts');
    const h = host();
    const feature = createProgressFeature(h, {});
    const aborted = new AbortController();
    aborted.abort();
    await expect(feature.enter(undefined, aborted.signal)).resolves.toBeUndefined();
    expect(h.store.data).not.toHaveBeenCalled();
    expect(h.overlays.showLoadError).not.toHaveBeenCalled();
  });
});

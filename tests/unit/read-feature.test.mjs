import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestSurfaceRegistry } from '../../src/domain/views.ts';
import { RD_ALL, RD_LV, RD_UNITS, isReadClef, isReadDrillType } from '../../src/core/reading-curriculum.ts';

afterEach(() => { vi.unstubAllGlobals(); });

describe('reading curriculum (core)', () => {
  it('indexes every drill level once, in unit order, with valid types and clefs', () => {
    expect(RD_UNITS.length).toBeGreaterThan(5);
    const ids = RD_ALL.map((L) => L.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const L of RD_ALL) {
      expect(RD_LV[L.id]).toBe(L);
      expect(isReadDrillType(L.ty)).toBe(true);
      if (L.clef) expect(isReadClef(L.clef)).toBe(true);
    }
    expect(RD_UNITS[0].lv[0]).toMatchObject({ u: 'tr', n: 1, id: 'tr1', ty: 'name' });
  });
});

describe('read feature slice', () => {
  it('imports in Node with zero DOM side effects', async () => {
    expect(typeof globalThis.document).toBe('undefined');
    const mod = await import('../../src/features/read/index.ts');
    expect(typeof mod.createReadFeature).toBe('function');
  });

  it('registers its hooks, reports idle state and ignores an aborted enter', async () => {
    vi.stubGlobal('window', { innerWidth: 1280, matchMedia: () => ({ matches: false }), setTimeout, clearTimeout });
    const { createReadFeature } = await import('../../src/features/read/index.ts');
    const host = {
      i18n: { t: (k) => k, lang: () => 'en', notation: () => 'letter' },
      store: { data: vi.fn(() => ({ settings: {}, reading: {} })), saveNow: vi.fn() },
      nav: { show: vi.fn() },
      audio: {}, dock: {}, input: {}, overlays: { openCount: () => 0 }, reduceMotion: () => false,
    };
    const feature = createReadFeature(host, { stage: { on: false, kb: null, rz: 0 }, scoreFocus: { owner: null } });
    const target = {};
    feature.registerTestSurface?.(createTestSurfaceRegistry(target));
    for (const name of ['SR', 'RD', 'RDN', 'WARM', 'srNoteStart', 'rdnOpen', 'srRenderScore']) {
      expect(Object.getOwnPropertyNames(target), name).toContain(name);
    }
    expect(feature.isBusy?.()).toBe(false);
    expect(feature.hasPiece()).toBe(false);
    expect(feature.isPendingSaveProtected()).toBe(false);
    const aborted = new AbortController();
    aborted.abort();
    expect(() => feature.enter({ readingDrillId: 'tr1' }, aborted.signal)).not.toThrow();
  });
});

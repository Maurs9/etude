import { describe, expect, it } from 'vitest';
import { createTestSurfaceRegistry } from '../../src/domain/views.ts';

describe('createTestSurfaceRegistry', () => {
  it('registers configurable getters, mutable getter/setter pairs, and values', () => {
    const surface = {};
    const registry = createTestSurfaceRegistry(surface);

    let count = 1;
    let label = 'initial';

    registry.defineGetter('count', () => count);
    registry.defineMutable('label', () => label, (next) => { label = next; });
    registry.defineValue('constant', 42);

    expect(surface.count).toBe(1);
    count = 5;
    expect(surface.count).toBe(5);

    expect(surface.label).toBe('initial');
    surface.label = 'mocked';
    expect(label).toBe('mocked');
    expect(surface.label).toBe('mocked');

    expect(surface.constant).toBe(42);
    expect(Object.getOwnPropertyDescriptor(surface, 'count')?.configurable).toBe(true);
    expect(Object.getOwnPropertyDescriptor(surface, 'label')?.configurable).toBe(true);
    expect(Object.getOwnPropertyDescriptor(surface, 'constant')?.configurable).toBe(true);
  });

  it('supports batch define() with getters, setters, values, and later overrides', () => {
    const surface = {};
    const registry = createTestSurfaceRegistry(surface);
    let theme = 'auto';

    registry.define({
      readOnly: { get: () => 'v1' },
      theme: {
        get: () => theme,
        set: (next) => { theme = String(next); },
      },
      helper: { value: () => 'ok' },
    });

    expect(surface.readOnly).toBe('v1');
    expect(surface.theme).toBe('auto');
    surface.theme = 'dark';
    expect(theme).toBe('dark');
    expect(surface.helper()).toBe('ok');

    // Configurable descriptors allow a feature module to replace a placeholder hook cleanly.
    registry.defineGetter('readOnly', () => 'v2');
    expect(surface.readOnly).toBe('v2');
  });
});

import { describe, expect, it } from 'vitest';
import { isAppView, navGroup, viewFromHash } from '../../src/domain/router.ts';

describe('view routing domain', () => {
  it('keeps hash routing grouped and safely defaults unknown views', () => {
    expect(navGroup('analysis')).toBe('practice');
    expect(navGroup('today')).toBe('today');
    expect(isAppView('not-a-view')).toBe(false);
    expect(viewFromHash('#learn')).toBe('learn');
    expect(viewFromHash('#missing')).toBe('today');
  });
});

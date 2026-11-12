import { describe, expect, it } from 'vitest';
import { isAppView, isMovedView, navGroup, viewFromHash } from '../../src/domain/router.ts';

describe('view routing domain', () => {
  it('keeps hash routing grouped and safely defaults unknown views', () => {
    expect(navGroup('analysis')).toBe('scores');
    expect(navGroup('read')).toBe('practice');
    expect(navGroup('explore')).toBe('practice');
    expect(navGroup('transcribe')).toBe('practice');
    expect(navGroup('songs')).toBeUndefined();
    expect(navGroup('method')).toBe('learn');
    expect(navGroup('today')).toBe('today');
    expect(isAppView('not-a-view')).toBe(false);
    expect(viewFromHash('#learn')).toBe('learn');
    expect(viewFromHash('#missing')).toBe('today');
    // The song book moved into Practice: its old hash is kept so Practice can open set up for it.
    expect(isAppView('songs')).toBe(false);
    expect(isMovedView('songs')).toBe(true);
    expect(isMovedView('learn')).toBe(false);
    expect(viewFromHash('#songs')).toBe('songs');
  });
});

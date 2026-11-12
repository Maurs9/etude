import { describe, expect, it } from 'vitest';
import { MERGED_VIEWS, NAV_GROUPS, isAppView, isMergedView, isMovedView, navGroup, viewFromHash } from '../../src/domain/router.ts';

describe('view routing domain', () => {
  it('keeps hash routing grouped and safely defaults unknown views', () => {
    expect(navGroup('analysis')).toBe('scores');
    expect(navGroup('read')).toBe('practice');
    expect(navGroup('explore')).toBe('practice');
    expect(navGroup('sing')).toBe('practice');
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
    // So did Accompany (Progressions · Play along).
    expect(navGroup('accompany')).toBeUndefined();
    expect(isMovedView('accompany')).toBe(true);
    expect(viewFromHash('#accompany')).toBe('accompany');
    // Transcribe merged into Voice (view sing): its old hash is kept so Voice can open on the Hum to notes side.
    expect(NAV_GROUPS.practice).toEqual(['practice', 'read', 'sing', 'explore']);
    expect(navGroup('transcribe')).toBeUndefined();
    expect(isAppView('transcribe')).toBe(false);
    expect(isMovedView('transcribe')).toBe(false);
    expect(isMergedView('transcribe')).toBe(true);
    expect(isMergedView('sing')).toBe(false);
    expect(isMergedView('toString')).toBe(false);
    expect(MERGED_VIEWS.transcribe).toBe('sing');
    expect(viewFromHash('#transcribe')).toBe('transcribe');
  });
});
